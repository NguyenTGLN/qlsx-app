# Nhắc việc tự động — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động nhắc việc qua Zalo (qua n8n) mà không cần mở app: 08:00 gửi danh sách việc đang thực hiện; và nhắc trước hạn từng việc ở 3 mốc 60/30/5 phút.

**Architecture:** Toàn bộ hẹn giờ + truy vấn nằm trong Supabase bằng `pg_cron` (bộ hẹn giờ) và `pg_net` (POST webhook từ trong DB). Hai hàm SQL build payload và gọi webhook n8n; n8n chỉ định dạng tin và gửi vào nhóm Zalo. Không sửa app React, không deploy lại Netlify.

**Tech Stack:** PostgreSQL (Supabase), `pg_cron`, `pg_net`, n8n (Webhook + Code + Zalo send).

**Spec:** [docs/superpowers/specs/2026-07-07-nhac-viec-tu-dong-design.md](../specs/2026-07-07-nhac-viec-tu-dong-design.md)

---

## Cách áp SQL (dùng chung cho mọi task)

Mọi lệnh SQL trong plan này chạy tại: **Supabase Dashboard → SQL Editor → New query → dán → Run**.
Các file `.sql` trong repo là **bản gốc có phiên bản** (source of truth) — nội dung file y hệt lệnh bạn dán vào SQL Editor. Repo không tự đẩy lên Supabase; bạn dán tay.

## File Structure

- Create: `supabase/reminders/00_extensions.sql` — bật `pg_cron`, `pg_net`.
- Create: `supabase/reminders/01_reminder_config.sql` — bảng cấu hình URL/secret + seed.
- Create: `supabase/reminders/02_cong_viec_nhac_log.sql` — bảng chống gửi trùng.
- Create: `supabase/reminders/03_fn_nhac_viec_dang_thuc_hien.sql` — hàm Job A (8:00).
- Create: `supabase/reminders/04_fn_nhac_viec_den_han.sql` — hàm Job B (60/30/5).
- Create: `supabase/reminders/05_schedule.sql` — đăng ký 2 cron job.
- Create: `supabase/reminders/99_rollback.sql` — gỡ toàn bộ.
- Create: `supabase/reminders/README.md` — cách áp / đổi test→prod / gỡ.
- Create: `docs/n8n/nhac-viec-workflows.md` — runbook dựng 2 workflow n8n.

---

## Task 0: Pre-flight — xác nhận kiểu `due_date` và extensions

**Files:** không tạo file; chỉ chạy query khảo sát.

- [ ] **Step 1: Kiểm tra kiểu cột `due_date` và múi giờ**

Chạy trong SQL Editor:
```sql
select data_type
from information_schema.columns
where table_name='cong_viec_duoc_giao' and column_name='due_date';

select id, due_date, (due_date)::timestamptz as as_tstz, now()
from cong_viec_duoc_giao
where due_date is not null
limit 3;
```
Expected:
- `data_type` là `timestamp with time zone` (lý tưởng) **hoặc** `text`/`timestamp without time zone`.
- `as_tstz` phải ra đúng thời điểm ISO đã lưu (chuỗi có hậu tố `Z`).

- [ ] **Step 2: Quyết định biểu thức thời gian dùng trong hàm**

- Nếu `data_type` = `timestamp with time zone` **hoặc** `text` (ISO có `Z`): dùng `(due_date)::timestamptz` như trong plan (không đổi gì).
- Nếu `data_type` = `timestamp without time zone` (giờ UTC không tz): thay mọi `(due_date)::timestamptz` bằng `((due_date)::timestamp at time zone 'UTC')` trong Task 4 & 5.

Ghi lại kết luận để dùng cho các task sau. **Không commit** (task khảo sát).

- [ ] **Step 3: Kiểm tra extensions có sẵn**

```sql
select name, installed_version, default_version
from pg_available_extensions
where name in ('pg_cron','pg_net');
```
Expected: cả 2 dòng xuất hiện (installed_version có thể NULL nếu chưa bật — sẽ bật ở Task 1).

---

## Task 1: Bật extensions `pg_cron` + `pg_net`

**Files:**
- Create: `supabase/reminders/00_extensions.sql`

- [ ] **Step 1: Tạo file `supabase/reminders/00_extensions.sql`**

```sql
-- Bật hẹn giờ trong DB + gọi HTTP từ DB.
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

- [ ] **Step 2: Áp lên Supabase**

Dán nội dung file vào SQL Editor → Run. (Nếu báo quyền, bật qua Dashboard → Database → Extensions: tick `pg_cron`, `pg_net`.)

- [ ] **Step 3: Xác minh**

```sql
select extname from pg_extension where extname in ('pg_cron','pg_net') order by extname;
```
Expected: 2 dòng — `pg_cron`, `pg_net`.

- [ ] **Step 4: Commit**

```bash
git add supabase/reminders/00_extensions.sql
git commit -m "feat(nhac-viec): bat pg_cron + pg_net"
```

---

## Task 2: Bảng cấu hình `reminder_config` + seed

**Files:**
- Create: `supabase/reminders/01_reminder_config.sql`

- [ ] **Step 1: Xác nhận bảng chưa tồn tại (đỏ trước xanh)**

```sql
select * from reminder_config;
```
Expected: lỗi `relation "reminder_config" does not exist`.

- [ ] **Step 2: Tạo file `supabase/reminders/01_reminder_config.sql`**

```sql
create table if not exists reminder_config (
  key   text primary key,
  value text not null
);

-- URL webhook: 'den_han' để URL TEST khi đang dựng, đổi sang /webhook/ khi go-live (Task 8).
insert into reminder_config(key, value) values
  ('webhook_daily', 'https://thegioilocnuoc.site/webhook/cong_viec_dang_thuc_hien'),
  ('webhook_due',   'https://thegioilocnuoc.site/webhook-test/cong_viec_den_han')
on conflict (key) do update set value = excluded.value;

-- Secret sinh ngay trong DB (không lọt vào git). Chỉ tạo nếu chưa có.
insert into reminder_config(key, value)
select 'secret', gen_random_uuid()::text
where not exists (select 1 from reminder_config where key='secret');
```

- [ ] **Step 3: Áp lên Supabase** — dán file → Run.

- [ ] **Step 4: Xác minh + lấy secret cho n8n**

```sql
select key, value from reminder_config order by key;
```
Expected: 3 dòng (`secret`, `webhook_daily`, `webhook_due`). **Copy giá trị `secret`** để cấu hình n8n ở Task 6.

- [ ] **Step 5: Commit** (file KHÔNG chứa secret thật vì secret sinh trong DB)

```bash
git add supabase/reminders/01_reminder_config.sql
git commit -m "feat(nhac-viec): bang reminder_config + seed URL/secret"
```

---

## Task 3: Bảng chống gửi trùng `cong_viec_nhac_log`

**Files:**
- Create: `supabase/reminders/02_cong_viec_nhac_log.sql`

- [ ] **Step 1: Xác nhận bảng chưa tồn tại**

```sql
select * from cong_viec_nhac_log;
```
Expected: lỗi `relation "cong_viec_nhac_log" does not exist`.

- [ ] **Step 2: Tạo file `supabase/reminders/02_cong_viec_nhac_log.sql`**

```sql
create table if not exists cong_viec_nhac_log (
  task_id      text        not null,
  moc          text        not null,          -- '8H' | '60' | '30' | '5'
  due_snapshot timestamptz not null,          -- hạn tại thời điểm nhắc (phát hiện đổi hạn)
  sent_at      timestamptz not null default now(),
  unique (task_id, moc, due_snapshot)
);
```

- [ ] **Step 3: Áp lên Supabase** — dán file → Run.

- [ ] **Step 4: Xác minh idempotency của khoá UNIQUE**

```sql
insert into cong_viec_nhac_log(task_id,moc,due_snapshot) values ('TEST','60', now());
insert into cong_viec_nhac_log(task_id,moc,due_snapshot) values ('TEST','60', now())
  on conflict (task_id,moc,due_snapshot) do nothing;   -- không thêm dòng thứ 2 (khác now() thì mới thêm)
select count(*) from cong_viec_nhac_log where task_id='TEST';
delete from cong_viec_nhac_log where task_id='TEST';
```
Expected: cả 2 insert chạy không lỗi; nếu `now()` hai lần bằng nhau trong 1 transaction thì count=1. Sau `delete` bảng sạch dòng TEST.

- [ ] **Step 5: Commit**

```bash
git add supabase/reminders/02_cong_viec_nhac_log.sql
git commit -m "feat(nhac-viec): bang cong_viec_nhac_log chong gui trung"
```

---

## Task 4: Hàm Job A — danh sách việc đang thực hiện (8:00)

**Files:**
- Create: `supabase/reminders/03_fn_nhac_viec_dang_thuc_hien.sql`

> Nếu Task 0 kết luận cột là `timestamp without time zone`, đổi `(t.due_date)::timestamptz` thành `((t.due_date)::timestamp at time zone 'UTC')` trong hàm dưới.

- [ ] **Step 1: Tạo file `supabase/reminders/03_fn_nhac_viec_dang_thuc_hien.sql`**

```sql
create or replace function fn_nhac_viec_dang_thuc_hien() returns void
language plpgsql security definer as $$
declare
  v_url text; v_secret text; v_tasks jsonb; v_count int;
begin
  select value into v_url    from reminder_config where key='webhook_daily';
  select value into v_secret from reminder_config where key='secret';

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'title', t.title, 'assignee_id', t.assignee_id,
        'assignee_name', n.name, 'due_date', (t.due_date)::timestamptz, 'label', t.label
      ) order by n.name nulls last, (t.due_date)::timestamptz nulls last
    ), '[]'::jsonb),
    count(*)
  into v_tasks, v_count
  from cong_viec_duoc_giao t
  left join nhan_vien n on n.id = t.assignee_id
  where t.status = 'IN_PROGRESS';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret', v_secret),
    body := jsonb_build_object('type','daily_8h','sent_at', now(), 'count', v_count, 'tasks', v_tasks)
  );
end $$;
```

- [ ] **Step 2: Áp lên Supabase** — dán file → Run.

- [ ] **Step 3: Xác minh hàm tồn tại**

```sql
select proname from pg_proc where proname='fn_nhac_viec_dang_thuc_hien';
```
Expected: 1 dòng.

- [ ] **Step 4: Chạy thử + kiểm tra POST đã được xếp hàng**

```sql
select fn_nhac_viec_dang_thuc_hien();
-- Đợi ~2 giây rồi xem phản hồi gần nhất của pg_net:
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 3;
```
Expected: có 1 dòng phản hồi mới. `status_code` = 200/404 tuỳ webhook n8n đã bật chưa (ở bước này chỉ cần thấy pg_net **gọi được ra ngoài**, không lỗi DNS/timeout). Payload thật sẽ kiểm ở Task 6 bằng n8n test mode.

- [ ] **Step 5: Commit**

```bash
git add supabase/reminders/03_fn_nhac_viec_dang_thuc_hien.sql
git commit -m "feat(nhac-viec): ham Job A gui viec dang thuc hien"
```

---

## Task 5: Hàm Job B — nhắc trước hạn 60/30/5

**Files:**
- Create: `supabase/reminders/04_fn_nhac_viec_den_han.sql`

> Nếu Task 0 kết luận cột là `timestamp without time zone`, đổi cả 2 chỗ `(t.due_date)::timestamptz` thành `((t.due_date)::timestamp at time zone 'UTC')`.

- [ ] **Step 1: Tạo file `supabase/reminders/04_fn_nhac_viec_den_han.sql`**

```sql
create or replace function fn_nhac_viec_den_han() returns void
language plpgsql security definer as $$
declare
  v_url text; v_secret text; rec record;
begin
  select value into v_url    from reminder_config where key='webhook_due';
  select value into v_secret from reminder_config where key='secret';

  for rec in
    with picked as (
      select t.id, t.title, t.description, t.label, t.assignee_id,
             (t.due_date)::timestamptz as due_ts, n.name as assignee_name,
             extract(epoch from ((t.due_date)::timestamptz - now())) / 60 as mins_left
      from cong_viec_duoc_giao t
      left join nhan_vien n on n.id = t.assignee_id
      where t.status = 'IN_PROGRESS' and (t.due_date)::timestamptz > now()
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
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret', v_secret),
      body := jsonb_build_object(
        'type','due_soon', 'moc', rec.moc, 'minutes_left', round(rec.mins_left), 'sent_at', now(),
        'task', jsonb_build_object(
          'id', rec.id, 'title', rec.title, 'description', rec.description,
          'assignee_id', rec.assignee_id, 'assignee_name', rec.assignee_name,
          'due_date', rec.due_ts, 'label', rec.label
        )
      )
    );
  end loop;
end $$;
```

- [ ] **Step 2: Áp lên Supabase** — dán file → Run.

- [ ] **Step 3: Tạo 1 việc thử rơi vào băng 60 và chạy hàm**

```sql
-- Tạo việc test đáo hạn sau 59 phút. Dùng bộ cột giống app tạo việc để tránh vướng NOT NULL.
-- Nếu vẫn báo thiếu cột NOT NULL nào đó, thêm cột đó vào INSERT với giá trị mặc định hợp lý.
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
```
Expected: 1 dòng log `('CV-TEST','60', <hạn>)`.

- [ ] **Step 4: Kiểm tra chống trùng (chạy lại không gửi thêm)**

```sql
select fn_nhac_viec_den_han();
select count(*) from cong_viec_nhac_log where task_id='CV-TEST' and moc='60';
```
Expected: `count = 1` (không phát sinh dòng thứ 2).

- [ ] **Step 5: Kiểm tra chuyển băng 30 và 5**

```sql
update cong_viec_duoc_giao set due_date=(now() + interval '29 minutes')::text where id='CV-TEST';
select fn_nhac_viec_den_han();
update cong_viec_duoc_giao set due_date=(now() + interval '4 minutes')::text where id='CV-TEST';
select fn_nhac_viec_den_han();
select moc from cong_viec_nhac_log where task_id='CV-TEST' order by moc;
```
Expected: 3 dòng `moc` = `30`, `5`, `60` (đủ 3 mốc).

- [ ] **Step 6: Dọn dữ liệu test**

```sql
delete from cong_viec_nhac_log where task_id='CV-TEST';
delete from cong_viec_duoc_giao where id='CV-TEST';
```
Expected: xoá sạch việc & log test.

- [ ] **Step 7: Commit**

```bash
git add supabase/reminders/04_fn_nhac_viec_den_han.sql
git commit -m "feat(nhac-viec): ham Job B nhac truoc han 60/30/5"
```

---

## Task 6: Dựng 2 workflow n8n + kiểm tra payload thật

**Files:**
- Create: `docs/n8n/nhac-viec-workflows.md`

- [ ] **Step 1: Tạo file `docs/n8n/nhac-viec-workflows.md`**

````markdown
# Runbook n8n — Nhắc việc

Secret lấy ở Supabase: `select value from reminder_config where key='secret';`
Nhóm Zalo nhận: điền `GROUP_ID` nhóm "Công việc" của bạn vào Code node.

## Workflow 1 — cong_viec_den_han (nhắc trước hạn)
1. **Webhook** — Method POST, Path `cong_viec_den_han`.
2. **IF (check secret)** — điều kiện: `{{$json.headers['x-reminder-secret']}}` **equals** `<SECRET>`.
   - Nhánh false → **Respond to Webhook** 401 rồi dừng.
3. **Code (build tin)** — nhánh true:
   ```js
   const p = $json.body ?? $json;
   const t = p.task || {};
   const w = { '60': 'còn dưới 1 tiếng', '30': 'còn dưới 30 phút', '5': 'còn dưới 5 phút' };
   const due = t.due_date
     ? new Date(t.due_date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
     : '—';
   const message =
     `⏰ NHẮC VIỆC (${w[p.moc] || 'sắp đến hạn'})\n` +
     `• Việc: ${t.title}\n` +
     `• Phụ trách: ${t.assignee_name || 'Chưa giao'}\n` +
     `• Hạn: ${due}` +
     (t.label ? `\n• Nhãn: ${t.label}` : '');
   return [{ json: { group_id: 'GROUP_ID', message } }];
   ```
4. **Gửi Zalo** — dùng node gửi Zalo sẵn có của bạn (copy từ workflow "BC Zalo"): gửi `{{$json.message}}` vào `{{$json.group_id}}`.

## Workflow 2 — cong_viec_dang_thuc_hien (8:00)
1. **Webhook** — POST, Path `cong_viec_dang_thuc_hien`.
2. **IF (check secret)** — như trên.
3. **Code (build tin)**:
   ```js
   const p = $json.body ?? $json;
   if (!p.count || p.count === 0) {
     return [{ json: { group_id: 'GROUP_ID', message: '📋 8:00 — Hôm nay không có việc đang thực hiện.' } }];
   }
   const byPerson = {};
   for (const t of p.tasks) { const k = t.assignee_name || 'Chưa giao'; (byPerson[k] ??= []).push(t); }
   let message = `📋 CÔNG VIỆC ĐANG THỰC HIỆN (${p.count})\n`;
   for (const [name, list] of Object.entries(byPerson)) {
     message += `\n👤 ${name}:\n`;
     for (const t of list) {
       const due = t.due_date
         ? new Date(t.due_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
         : 'không hạn';
       message += `  • ${t.title} (hạn: ${due})\n`;
     }
   }
   return [{ json: { group_id: 'GROUP_ID', message: message.trim() } }];
   ```
4. **Gửi Zalo** — như Workflow 1.
````

- [ ] **Step 2: Dựng 2 workflow trong n8n** theo runbook. Điền `SECRET` (từ Task 2) và `GROUP_ID` nhóm Công việc.

- [ ] **Step 3: Test payload Job B qua n8n test mode**

- Trong workflow `cong_viec_den_han`, bấm **Listen for test event** (URL trở thành `/webhook-test/cong_viec_den_han`, khớp `reminder_config.webhook_due` hiện tại).
- Ở Supabase, chạy lại kịch bản Task 5 Step 3 (tạo `CV-TEST` 59 phút + `select fn_nhac_viec_den_han();`).
- Expected: n8n nhận đúng 1 event; IF secret = true; Code ra message đúng định dạng. Dọn `CV-TEST` như Task 5 Step 6.

- [ ] **Step 4: Test payload Job A**

- Tạm đổi để test 8:00 mà không chờ tới giờ: trong workflow `cong_viec_dang_thuc_hien` bật **Listen for test event**, tạm đổi config sang URL test:
  ```sql
  update reminder_config set value='https://thegioilocnuoc.site/webhook-test/cong_viec_dang_thuc_hien' where key='webhook_daily';
  select fn_nhac_viec_dang_thuc_hien();
  ```
- Expected: n8n nhận event `daily_8h` với mảng `tasks` + `count`. Kiểm tra cả trường hợp rỗng bằng cách tạm không có việc IN_PROGRESS (hoặc xem `count`).
- Đổi `webhook_daily` trở lại URL production:
  ```sql
  update reminder_config set value='https://thegioilocnuoc.site/webhook/cong_viec_dang_thuc_hien' where key='webhook_daily';
  ```

- [ ] **Step 5: Kích hoạt (Activate) 2 workflow** trong n8n (chuyển từ test sang active để URL `/webhook/...` hoạt động).

- [ ] **Step 6: Commit**

```bash
git add docs/n8n/nhac-viec-workflows.md
git commit -m "docs(nhac-viec): runbook 2 workflow n8n"
```

---

## Task 7: Đăng ký 2 cron job

**Files:**
- Create: `supabase/reminders/05_schedule.sql`

- [ ] **Step 1: Tạo file `supabase/reminders/05_schedule.sql`**

```sql
-- Gỡ job cũ nếu chạy lại file (tránh trùng tên)
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');

-- Job B: mỗi 1 phút
select cron.schedule('nhac_den_han', '* * * * *', $$ select fn_nhac_viec_den_han(); $$);

-- Job A: 08:00 giờ VN = 01:00 UTC (VN không có DST)
select cron.schedule('nhac_8h', '0 1 * * *', $$ select fn_nhac_viec_dang_thuc_hien(); $$);
```

- [ ] **Step 2: Áp lên Supabase** — dán file → Run.

- [ ] **Step 3: Xác minh 2 job đã đăng ký**

```sql
select jobname, schedule, active from cron.job where jobname in ('nhac_den_han','nhac_8h') order by jobname;
```
Expected: 2 dòng, `active = true`, schedule đúng (`* * * * *` và `0 1 * * *`).

- [ ] **Step 4: Xác minh Job B chạy tự động (đợi ~2 phút)**

```sql
select j.jobname, r.status, r.start_time, r.return_message
from cron.job_run_details r join cron.job j on j.jobid=r.jobid
where j.jobname='nhac_den_han'
order by r.start_time desc limit 3;
```
Expected: có bản ghi `status='succeeded'` trong ~2 phút gần đây (không có việc tới hạn thì hàm vẫn chạy thành công, chỉ không gửi gì).

- [ ] **Step 5: Commit**

```bash
git add supabase/reminders/05_schedule.sql
git commit -m "feat(nhac-viec): dang ky cron job A (8h) + B (moi phut)"
```

---

## Task 8: Go-live + rollback script + README

**Files:**
- Create: `supabase/reminders/99_rollback.sql`
- Create: `supabase/reminders/README.md`

- [ ] **Step 1: Chuyển `webhook_due` sang URL production**

Sau khi workflow `cong_viec_den_han` đã **Active** (Task 6 Step 5):
```sql
update reminder_config set value='https://thegioilocnuoc.site/webhook/cong_viec_den_han' where key='webhook_due';
select key, value from reminder_config order by key;
```
Expected: `webhook_due` đổi sang `/webhook/...` (bỏ `-test`).

- [ ] **Step 2: End-to-end thật**

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
Đợi tới khi cron mỗi-phút chạy (≤1 phút). Expected: nhóm Zalo nhận tin "còn dưới 5 phút". Sau đó dọn:
```sql
delete from cong_viec_nhac_log where task_id='CV-TEST';
delete from cong_viec_duoc_giao where id='CV-TEST';
```

- [ ] **Step 3: Tạo file `supabase/reminders/99_rollback.sql`**

```sql
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');
drop function if exists fn_nhac_viec_den_han();
drop function if exists fn_nhac_viec_dang_thuc_hien();
drop table if exists cong_viec_nhac_log;
drop table if exists reminder_config;
-- Không drop extension (có thể module khác đang dùng).
```

- [ ] **Step 4: Tạo file `supabase/reminders/README.md`**

```markdown
# Nhắc việc tự động (pg_cron + pg_net → n8n)

## Áp lần đầu (dán từng file vào Supabase SQL Editor, đúng thứ tự)
00_extensions.sql → 01_reminder_config.sql → 02_cong_viec_nhac_log.sql →
03_fn_nhac_viec_dang_thuc_hien.sql → 04_fn_nhac_viec_den_han.sql → 05_schedule.sql

Sau đó dựng 2 workflow n8n theo ../../docs/n8n/nhac-viec-workflows.md và Activate.

## Lấy secret cho n8n
select value from reminder_config where key='secret';

## Đổi test ↔ production
update reminder_config set value='<url>' where key='webhook_due';   -- hoặc webhook_daily

## Đổi mốc nhắc / giờ chạy
- Mốc 60/30/5: sửa CASE trong 04_fn_nhac_viec_den_han.sql rồi chạy lại file.
- Giờ 8:00: sửa '0 1 * * *' (UTC) trong 05_schedule.sql rồi chạy lại file.

## Gỡ toàn bộ
Dán 99_rollback.sql vào SQL Editor.

## Theo dõi
select * from cron.job;                        -- các job
select * from cron.job_run_details order by start_time desc limit 20;   -- lịch sử chạy
select * from net._http_response order by created desc limit 20;        -- phản hồi webhook
```

- [ ] **Step 5: Commit**

```bash
git add supabase/reminders/99_rollback.sql supabase/reminders/README.md
git commit -m "docs(nhac-viec): rollback script + README van hanh"
```

---

## Kiểm thử tổng (đối chiếu spec mục 10)
- [x] Payload Job B qua n8n test — Task 6 Step 3
- [x] Chống trùng — Task 5 Step 4
- [x] Chuyển băng 60→30→5 — Task 5 Step 5
- [x] Đổi hạn nhắc lại (due_snapshot khác) — bao trùm bởi UNIQUE key; kiểm nhanh: đổi `due_date` sang mốc mới rồi chạy hàm, log thêm dòng mới
- [x] Job A rỗng vẫn gửi — Task 6 Step 4
- [x] Cron chạy đúng nhịp — Task 7 Step 4
- [x] Go-live prod URL — Task 8

## Ghi chú vận hành
- App **không đổi**; nếu sau này muốn Zalo cá nhân: thêm cột `nhan_vien.zalo_user_id`, sửa Code node n8n route theo `assignee_id` (payload đã có sẵn).
- Bảng `cong_viec_nhac_log` chỉ lớn dần chậm; nếu cần, thêm job dọn log > 90 ngày sau.
