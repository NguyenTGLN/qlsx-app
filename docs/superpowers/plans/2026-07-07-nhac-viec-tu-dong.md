# Nhắc việc tự động — Implementation Plan (bản tích hợp workflow n8n thực tế)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nhắc việc tự động trước hạn 60/30/5 phút (mới) và đưa lịch 8:00 vào Supabase, tái dùng đúng chuỗi gửi ảnh Zalo + mention `id_zalo_oa` sẵn có trong workflow n8n của người dùng.

**Architecture:** `pg_cron` (Supabase) hẹn giờ; `pg_net` POST vào 2 webhook n8n. Job B (mỗi phút) phát hiện việc vào băng 60/30/5 → POST vào **webhook mới `cong_viec_den_han`** → nhánh n8n mới dựng thẻ ảnh + mention. Job A (8:00) → POST vào **`Webhook tổng hợp` (a6fc08fc)** sẵn có → chuỗi ảnh tổng hợp. Không sửa app React.

**Tech Stack:** PostgreSQL (Supabase) `pg_cron`+`pg_net`; n8n (Switch, Webhook, Supabase, Code, HCTI, Zalo OA).

**Spec:** [../specs/2026-07-07-nhac-viec-tu-dong-design.md](../specs/2026-07-07-nhac-viec-tu-dong-design.md) (xem mục *Revision 2026-07-07*)

**Dữ kiện từ workflow thực tế:**
- Nhóm Zalo: `deb64378401ba945f00a`. Mention: `[@<nhan_vien.id_zalo_oa>]`.
- Trạng thái đang làm: `status in ('IN_PROGRESS','PENDING')`.
- Webhook sẵn có: tổng hợp `a6fc08fc-dc4e-432e-9588-424d78470769`; nút Nhắc `47cc5412-40b2-4747-af7f-8d7090cb40c2`.
- n8n webhook body nằm ở `$json.body`.

---

## Cách áp SQL (dùng chung)
Mọi lệnh SQL chạy tại **Supabase Dashboard → SQL Editor**. File `.sql` trong repo là bản gốc; dán tay vào SQL Editor.

## File Structure
- Create: `supabase/reminders/00_extensions.sql`
- Create: `supabase/reminders/01_reminder_config.sql`
- Create: `supabase/reminders/02_cong_viec_nhac_log.sql`
- Create: `supabase/reminders/03_fn_nhac_viec_den_han.sql`  (Job B — 60/30/5)
- Create: `supabase/reminders/04_fn_nhac_viec_dang_thuc_hien.sql` (Job A — 8:00)
- Create: `supabase/reminders/05_schedule.sql`
- Create: `supabase/reminders/99_rollback.sql`
- Create: `supabase/reminders/README.md`
- Create: `docs/n8n/wf-nhac-viec-them-nodes.json` (workflow n8n đã thêm Switch + nhánh đến hạn)
- Create: `docs/n8n/nhac-viec-workflows.md` (hướng dẫn import + chỉnh Code tổng hợp + bỏ 8h)

---

## Task 0: Pre-flight

**Files:** không tạo file.

- [ ] **Step 1: Kiểu `due_date` + có cột `id_zalo_oa`**

```sql
select column_name, data_type
from information_schema.columns
where table_name in ('cong_viec_duoc_giao','nhan_vien')
  and column_name in ('due_date','id_zalo_oa','status','assignee_id');

select id, name, id_zalo_oa from nhan_vien where id_zalo_oa is not null limit 3;
select distinct status from cong_viec_duoc_giao;
```
Expected:
- `cong_viec_duoc_giao.due_date` là `timestamp with time zone` hoặc `text` (ISO có `Z`).
- `nhan_vien.id_zalo_oa` tồn tại (ít nhất vài NV có giá trị).
- `status` gồm các giá trị trong tập `PENDING`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`.

- [ ] **Step 2: Chốt biểu thức thời gian**
- `timestamp with time zone` hoặc `text`(ISO+Z) → dùng `(due_date)::timestamptz`.
- `timestamp without time zone` → dùng `((due_date)::timestamp at time zone 'UTC')`.
Ghi lại. Không commit.

- [ ] **Step 3: Extensions khả dụng**

```sql
select name from pg_available_extensions where name in ('pg_cron','pg_net');
```
Expected: 2 dòng.

---

## Task 1: Bật extensions

**Files:** Create `supabase/reminders/00_extensions.sql`

- [ ] **Step 1: Tạo file**
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```
- [ ] **Step 2: Áp** — dán vào SQL Editor → Run (hoặc Dashboard → Database → Extensions).
- [ ] **Step 3: Xác minh**
```sql
select extname from pg_extension where extname in ('pg_cron','pg_net') order by extname;
```
Expected: `pg_cron`, `pg_net`.
- [ ] **Step 4: Commit**
```bash
git add supabase/reminders/00_extensions.sql
git commit -m "feat(nhac-viec): bat pg_cron + pg_net"
```

---

## Task 2: Bảng cấu hình `reminder_config`

**Files:** Create `supabase/reminders/01_reminder_config.sql`

- [ ] **Step 1: Xác nhận chưa tồn tại**
```sql
select * from reminder_config;
```
Expected: lỗi `relation "reminder_config" does not exist`.

- [ ] **Step 2: Tạo file**
```sql
create table if not exists reminder_config (
  key   text primary key,
  value text not null
);

-- webhook_den_han: URL TEST khi đang dựng n8n; đổi sang /webhook/ khi go-live (Task 8).
-- webhook_dang_thuc_hien: webhook "tổng hợp" a6fc08fc SẴN CÓ (tái dùng chuỗi ảnh tổng hợp).
insert into reminder_config(key, value) values
  ('webhook_den_han',        'https://thegioilocnuoc.site/webhook-test/cong_viec_den_han'),
  ('webhook_dang_thuc_hien', 'https://thegioilocnuoc.site/webhook/a6fc08fc-dc4e-432e-9588-424d78470769')
on conflict (key) do update set value = excluded.value;
```

- [ ] **Step 3: Áp** — dán → Run.
- [ ] **Step 4: Xác minh**
```sql
select key, value from reminder_config order by key;
```
Expected: 2 dòng đúng URL.
- [ ] **Step 5: Commit**
```bash
git add supabase/reminders/01_reminder_config.sql
git commit -m "feat(nhac-viec): bang reminder_config (2 webhook)"
```

---

## Task 3: Bảng chống gửi trùng `cong_viec_nhac_log`

**Files:** Create `supabase/reminders/02_cong_viec_nhac_log.sql`

- [ ] **Step 1: Xác nhận chưa tồn tại**
```sql
select * from cong_viec_nhac_log;
```
Expected: lỗi `does not exist`.

- [ ] **Step 2: Tạo file**
```sql
create table if not exists cong_viec_nhac_log (
  task_id      text        not null,
  moc          text        not null,      -- '60' | '30' | '5'
  due_snapshot timestamptz not null,      -- hạn tại thời điểm nhắc (phát hiện đổi hạn)
  sent_at      timestamptz not null default now(),
  unique (task_id, moc, due_snapshot)
);
```
- [ ] **Step 3: Áp** — dán → Run.
- [ ] **Step 4: Xác minh UNIQUE**
```sql
insert into cong_viec_nhac_log(task_id,moc,due_snapshot) values ('TEST','60', now());
insert into cong_viec_nhac_log(task_id,moc,due_snapshot) values ('TEST','60', now())
  on conflict (task_id,moc,due_snapshot) do nothing;
select count(*) from cong_viec_nhac_log where task_id='TEST';
delete from cong_viec_nhac_log where task_id='TEST';
```
Expected: chạy không lỗi; dọn sạch dòng TEST.
- [ ] **Step 5: Commit**
```bash
git add supabase/reminders/02_cong_viec_nhac_log.sql
git commit -m "feat(nhac-viec): bang cong_viec_nhac_log"
```

---

## Task 4: Hàm Job B — nhắc trước hạn 60/30/5

**Files:** Create `supabase/reminders/03_fn_nhac_viec_den_han.sql`

> Nếu Task 0 kết luận `timestamp without time zone`: đổi cả 2 chỗ `(t.due_date)::timestamptz` → `((t.due_date)::timestamp at time zone 'UTC')`.

- [ ] **Step 1: Tạo file**
```sql
create or replace function fn_nhac_viec_den_han() returns void
language plpgsql security definer as $$
declare
  v_url text; rec record;
begin
  select value into v_url from reminder_config where key='webhook_den_han';

  for rec in
    with picked as (
      select t.id, n.name as assignee_name,
             (t.due_date)::timestamptz as due_ts,
             extract(epoch from ((t.due_date)::timestamptz - now())) / 60 as mins_left
      from cong_viec_duoc_giao t
      left join nhan_vien n on n.id = t.assignee_id
      where t.status in ('IN_PROGRESS','PENDING') and (t.due_date)::timestamptz > now()
    ),
    banded as (
      select *, case
        when mins_left <= 60 and mins_left > 30 then '60'
        when mins_left <= 30 and mins_left > 5  then '30'
        when mins_left <= 5  and mins_left > 0  then '5'
      end as moc
      from picked
    ),
    ins as (
      insert into cong_viec_nhac_log(task_id, moc, due_snapshot)
      select id, moc, due_ts from banded where moc is not null
      on conflict (task_id, moc, due_snapshot) do nothing
      returning task_id, moc
    )
    select b.* from ins join banded b on b.id = ins.task_id and b.moc = ins.moc
  loop
    -- Body khớp shape webhook nút Nhắc (n8n đọc $json.body.task.id / .assignee.name) + thêm moc/minutes_left
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'type','due_soon', 'moc', rec.moc, 'minutes_left', round(rec.mins_left),
        'task', jsonb_build_object('id', rec.id),
        'assignee', jsonb_build_object('name', rec.assignee_name)
      )
    );
  end loop;
end $$;
```

- [ ] **Step 2: Áp** — dán → Run.
- [ ] **Step 3: Xác minh hàm tồn tại**
```sql
select proname from pg_proc where proname='fn_nhac_viec_den_han';
```
Expected: 1 dòng.

- [ ] **Step 4: Tạo việc test băng 60 + chạy hàm**
```sql
insert into cong_viec_duoc_giao
  (id, title, description, status, priority, label, assignee_id, progress, sort_order,
   created_date, due_date, recurrence_type)
values
  ('CV-TEST', 'Việc test nhắc hạn', '', 'IN_PROGRESS', '', '', null, 0, 0,
   now()::text, (now() + interval '59 minutes')::text, 'NONE')
on conflict (id) do update
  set status='IN_PROGRESS', due_date=(now() + interval '59 minutes')::text;

select fn_nhac_viec_den_han();
select task_id, moc, due_snapshot from cong_viec_nhac_log where task_id='CV-TEST';

-- Kiểm tra pg_net đã gọi ra ngoài:
select id, status_code, error_msg, created from net._http_response order by created desc limit 3;
```
Expected: 1 dòng log `('CV-TEST','60',…)`; có 1 phản hồi pg_net mới (status_code 200/404 tuỳ webhook n8n đã bật chưa).

- [ ] **Step 5: Chống trùng + chuyển băng**
```sql
select fn_nhac_viec_den_han();                                   -- không thêm log '60'
update cong_viec_duoc_giao set due_date=(now()+interval '29 minutes')::text where id='CV-TEST';
select fn_nhac_viec_den_han();                                   -- thêm '30'
update cong_viec_duoc_giao set due_date=(now()+interval '4 minutes')::text where id='CV-TEST';
select fn_nhac_viec_den_han();                                   -- thêm '5'
select moc from cong_viec_nhac_log where task_id='CV-TEST' order by moc;
```
Expected: 3 dòng `30`, `5`, `60`.

- [ ] **Step 6: Dọn test**
```sql
delete from cong_viec_nhac_log where task_id='CV-TEST';
delete from cong_viec_duoc_giao where id='CV-TEST';
```

- [ ] **Step 7: Commit**
```bash
git add supabase/reminders/03_fn_nhac_viec_den_han.sql
git commit -m "feat(nhac-viec): ham Job B nhac 60/30/5 (status PENDING+IN_PROGRESS)"
```

---

## Task 5: Hàm Job A — kích hoạt tổng hợp 8:00

**Files:** Create `supabase/reminders/04_fn_nhac_viec_dang_thuc_hien.sql`

- [ ] **Step 1: Tạo file**
```sql
-- Chỉ cần "chạm" webhook tổng hợp a6fc08fc; nhánh n8n tự query & dựng ảnh.
create or replace function fn_nhac_viec_dang_thuc_hien() returns void
language plpgsql security definer as $$
declare v_url text;
begin
  select value into v_url from reminder_config where key='webhook_dang_thuc_hien';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('type','daily_8h','sent_at', now())
  );
end $$;
```
- [ ] **Step 2: Áp** — dán → Run.
- [ ] **Step 3: Xác minh + chạy thử**
```sql
select fn_nhac_viec_dang_thuc_hien();
select id, status_code, created from net._http_response order by created desc limit 3;
```
Expected: 1 phản hồi mới. (Nếu n8n workflow đang Active, nhóm Zalo sẽ nhận bảng tổng hợp.)
- [ ] **Step 4: Commit**
```bash
git add supabase/reminders/04_fn_nhac_viec_dang_thuc_hien.sql
git commit -m "feat(nhac-viec): ham Job A kich hoat tong hop 8h"
```

---

## Task 6: Cập nhật workflow n8n (Switch + nhánh đến hạn + rỗng-vẫn-gửi)

**Files:**
- Create: `docs/n8n/wf-nhac-viec-them-nodes.json`
- Create: `docs/n8n/nhac-viec-workflows.md`

> Nội dung JSON đầy đủ do người thực thi sinh từ workflow gốc người dùng cung cấp, áp dụng các thay đổi dưới đây. Vì cần toàn bộ ngữ cảnh workflow gốc, **bước này do Claude sinh trực tiếp** (không giao subagent).

**Thay đổi so với workflow gốc:**
1. Thêm **Webhook đến hạn**: `httpMethod=POST`, `path=cong_viec_den_han`, `webhookId` mới; nối `Webhook đến hạn → Lấy token OA`.
2. Thay node IF **`Là cập nhật task?`** bằng **Switch** `Định tuyến` (mode rules, 3 output):
   - Output **den_han**: `{{ $('Webhook đến hạn').isExecuted }}` = true.
   - Output **update**: `{{ $('Webhook cập nhật task').isExecuted }}` = true.
   - **Fallback → summary** (bao gồm Schedule, Webhook tổng hợp, và Job A).
   Nối lại: den_han → nhánh mới; update → `Lấy nhân viên (cập nhật)` (giữ nguyên); summary → `Lấy nhân viên` (giữ nguyên).
3. Nhánh **đến hạn** (clone nhánh cập nhật, đổi tham chiếu sang `Webhook đến hạn`):
   - `Lấy NV (đến hạn)` supabase get `nhan_vien` where `name = {{ $('Webhook đến hạn').first().json.body.assignee.name }}` →
   - `Lấy CV (đến hạn)` supabase get `cong_viec_duoc_giao` where `id = {{ $('Webhook đến hạn').first().json.body.task.id }}` →
   - `Lấy tiến độ (đến hạn)` supabase getAll `tien_do` where `task_id = {{ ...body.task.id }}` →
   - `Tạo thẻ đến hạn` (Code — như "Tạo nội dung thẻ chi tiết" nhưng dòng Tình trạng lấy theo `body.moc`: `60→"⏰ Còn dưới 1 tiếng"`, `30→"Còn dưới 30 phút"`, `5→"🔥 Còn dưới 5 phút"`; mention `[@id_zalo_oa]`) →
   - `Loop Over Items` (dùng chung).
4. Sửa Code **`Tạo nội dung ảnh (tổng hợp + cá nhân)`**: nếu `tasks.length === 0`, đẩy 1 item thông báo rỗng:
   ```js
   if (out.length === 0) {
     out.push({ json: {
       html: buildTable('CÔNG VIỆC ĐANG THỰC HIỆN', []),
       message_text: `[@${GROUP_ID}] 8:00 — Hôm nay không có việc đang thực hiện.`
     }});
   }
   ```

- [ ] **Step 1: Sinh file `docs/n8n/wf-nhac-viec-them-nodes.json`** (workflow gốc + 4 thay đổi trên).
- [ ] **Step 2: Sinh file `docs/n8n/nhac-viec-workflows.md`** — hướng dẫn: Import workflow (Import from File) → kiểm tra credentials (Supabase/Google Sheets/HCTI/httpBasicAuth) đã map → Activate → lấy URL `Webhook đến hạn`.
- [ ] **Step 3: Test nhánh đến hạn (n8n test mode)**
  - Trong n8n bật **Listen for test event** ở `Webhook đến hạn` (URL `/webhook-test/cong_viec_den_han`, khớp `reminder_config.webhook_den_han`).
  - Ở Supabase chạy lại Task 4 Step 4 (tạo CV-TEST 59 phút + `select fn_nhac_viec_den_han();`).
  - Expected: n8n nhận event; Switch vào nhánh den_han; dựng thẻ "Còn dưới 1 tiếng"; ra ảnh. Dọn CV-TEST (Task 4 Step 6).
- [ ] **Step 4: Test Job A** — `select fn_nhac_viec_dang_thuc_hien();` → nhóm nhận bảng tổng hợp; test cả trường hợp rỗng.
- [ ] **Step 5: Bỏ 8h khỏi lịch n8n** — trong node `Schedule 8h & 17h` xoá `triggerAtHour: 8` (giữ 17h) để 8:00 do pg_cron điều khiển, tránh gửi trùng.
- [ ] **Step 6: Activate workflow** (đổi từ test → active).
- [ ] **Step 7: Commit**
```bash
git add docs/n8n/wf-nhac-viec-them-nodes.json docs/n8n/nhac-viec-workflows.md
git commit -m "docs(nhac-viec): workflow n8n + runbook (Switch + nhanh den han)"
```

---

## Task 7: Đăng ký cron job

**Files:** Create `supabase/reminders/05_schedule.sql`

- [ ] **Step 1: Tạo file**
```sql
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');

-- Job B: mỗi 1 phút
select cron.schedule('nhac_den_han', '* * * * *', $$ select fn_nhac_viec_den_han(); $$);
-- Job A: 08:00 giờ VN = 01:00 UTC
select cron.schedule('nhac_8h', '0 1 * * *', $$ select fn_nhac_viec_dang_thuc_hien(); $$);
```
- [ ] **Step 2: Áp** — dán → Run.
- [ ] **Step 3: Xác minh job**
```sql
select jobname, schedule, active from cron.job where jobname in ('nhac_den_han','nhac_8h') order by jobname;
```
Expected: 2 dòng, `active=true`.
- [ ] **Step 4: Job B chạy tự động (đợi ~2 phút)**
```sql
select j.jobname, r.status, r.start_time
from cron.job_run_details r join cron.job j on j.jobid=r.jobid
where j.jobname='nhac_den_han' order by r.start_time desc limit 3;
```
Expected: có `status='succeeded'` gần đây.
- [ ] **Step 5: Commit**
```bash
git add supabase/reminders/05_schedule.sql
git commit -m "feat(nhac-viec): cron Job A (8h) + Job B (moi phut)"
```

---

## Task 8: Go-live + rollback + README

**Files:** Create `supabase/reminders/99_rollback.sql`, `supabase/reminders/README.md`

- [ ] **Step 1: Đổi `webhook_den_han` sang URL production** (sau khi workflow Active)
```sql
update reminder_config set value='https://thegioilocnuoc.site/webhook/cong_viec_den_han' where key='webhook_den_han';
select key, value from reminder_config order by key;
```
Expected: `webhook_den_han` bỏ `-test`.

- [ ] **Step 2: End-to-end thật (băng 5 phút)**
```sql
insert into cong_viec_duoc_giao
  (id, title, description, status, priority, label, assignee_id, progress, sort_order,
   created_date, due_date, recurrence_type)
values
  ('CV-TEST', 'E2E nhắc hạn', '', 'IN_PROGRESS', '', '', null, 0, 0,
   now()::text, (now() + interval '4 minutes')::text, 'NONE')
on conflict (id) do update
  set status='IN_PROGRESS', due_date=(now() + interval '4 minutes')::text;
```
Đợi ≤1 phút (cron chạy). Expected: nhóm Zalo nhận thẻ "🔥 Còn dưới 5 phút". Dọn:
```sql
delete from cong_viec_nhac_log where task_id='CV-TEST';
delete from cong_viec_duoc_giao where id='CV-TEST';
```

- [ ] **Step 3: Tạo `supabase/reminders/99_rollback.sql`**
```sql
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');
drop function if exists fn_nhac_viec_den_han();
drop function if exists fn_nhac_viec_dang_thuc_hien();
drop table if exists cong_viec_nhac_log;
drop table if exists reminder_config;
-- Không drop extension; nhớ khôi phục triggerAtHour:8 trong lịch n8n nếu muốn quay lại.
```

- [ ] **Step 4: Tạo `supabase/reminders/README.md`**
```markdown
# Nhắc việc tự động (pg_cron + pg_net → n8n image pipeline)

## Áp lần đầu (SQL Editor, đúng thứ tự)
00_extensions → 01_reminder_config → 02_cong_viec_nhac_log →
03_fn_nhac_viec_den_han → 04_fn_nhac_viec_dang_thuc_hien → 05_schedule
Rồi import docs/n8n/wf-nhac-viec-them-nodes.json, Activate, bỏ triggerAtHour:8 trong lịch n8n.

## Đổi test ↔ prod webhook đến hạn
update reminder_config set value='<url>' where key='webhook_den_han';

## Đổi mốc / giờ
- Mốc 60/30/5: sửa CASE trong 03_fn_nhac_viec_den_han.sql rồi chạy lại.
- Giờ 8:00: sửa '0 1 * * *' (UTC) trong 05_schedule.sql rồi chạy lại.

## Gỡ
Dán 99_rollback.sql. Khôi phục triggerAtHour:8 trong node Schedule n8n nếu cần.

## Theo dõi
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
select * from net._http_response order by created desc limit 20;
```

- [ ] **Step 5: Commit**
```bash
git add supabase/reminders/99_rollback.sql supabase/reminders/README.md
git commit -m "docs(nhac-viec): rollback + README van hanh"
```

---

## Self-review đối chiếu spec (Revision)
- [x] Tái dùng chuỗi ảnh + mention id_zalo_oa — Task 6
- [x] Job B 60/30/5, status PENDING+IN_PROGRESS, payload khớp webhook — Task 4
- [x] Job A 8:00 → webhook tổng hợp a6fc08fc, rỗng-vẫn-gửi — Task 5 + Task 6 Step 4
- [x] Switch 3 nhánh, không phá 2 nhánh cũ — Task 6
- [x] Bỏ trùng 8h ở lịch n8n — Task 6 Step 5
- [x] Chống trùng + băng + go-live — Task 4/8
- [x] Bỏ secret (khớp webhook mở hiện tại) — ghi chú spec Revision

## Ghi chú
- Bảng `cong_viec_nhac_log` chỉ lớn dần chậm; có thể thêm job dọn > 90 ngày sau.
- Hardening tương lai: thêm `x-reminder-secret` cho cả 2 webhook + kiểm ở n8n.
