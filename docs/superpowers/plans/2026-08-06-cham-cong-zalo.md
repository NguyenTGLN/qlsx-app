# Chấm công thời gian thực từ nhóm Zalo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhân viên nhắn tên vào nhóm Zalo "Euromade - Chấm Công"; giờ tin nhắn được ghi thẳng vào bảng `cham_cong` để hai chỉ tiêu chuyên cần cập nhật ngay trong tháng.

**Architecture:** n8n tách một nhánh riêng đổ tin thô vào bảng `zalo_cham_cong` (không đi qua `zalo_messages` nên không sinh hội thoại KPI Zalo). Một hàm Postgres `dung_cham_cong_zalo` tính lại từ tin thô ra dòng `cham_cong` mang `nguon = 'ZALO'`, không bao giờ đè được dòng `nguon = 'MAY'` của máy vân tay. Engine KPI không phải sửa vì nó vốn đã đọc `cham_cong`.

**Tech Stack:** PostgreSQL 17 (Supabase, project `ngwkzicrnspeggunsblr`), n8n, React 18 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-cham-cong-zalo-design.md`

---

## ⚠ THỨ TỰ TRIỂN KHAI LÀ BẮT BUỘC

Làm sai thứ tự thì **8 nhân viên chưa có mã Zalo bị ghi nghỉ mỗi ngày**, và điểm chuyên cần của họ về 0 mà không ai biết vì sao.

| Giai đoạn | Task | Sau giai đoạn này hệ thống ở trạng thái |
|---|---|---|
| 1. Nền CSDL | 1–6 | Có bảng và hàm, chưa có dữ liệu, chưa ai gọi |
| 2. Thu tin thô | 7 | Tin chảy vào `zalo_cham_cong`. **Chưa ghi `cham_cong` dòng nào** |
| 3. Nối mã Zalo | 8–9 | Đủ 13/13 người có `uid_from`. Kiểm bằng câu SQL ở Task 9 Step 6 |
| 4. Bật đường ghi | 10 | `cham_cong` bắt đầu có dòng `nguon='ZALO'` |
| 5. Giao diện | 11–14 | Xem được nguồn, chấm được về sớm |
| 6. Nghiệm thu | 15 | Đo bảo mật + kiểm luồng cũ không hỏng |

**Không được sang giai đoạn 4 khi câu SQL ở Task 9 Step 6 còn trả về dòng nào.**

---

## Cấu trúc tệp

| Tệp | Tạo/Sửa | Trách nhiệm |
|---|---|---|
| `sql/cham_cong_zalo.sql` | Tạo | Toàn bộ DDL + hàm. Chạy tay trên Supabase SQL Editor, chạy lại an toàn |
| `src/lib/chamCongZalo.js` | Tạo | Hàm thuần: lọc người gửi chưa nối mã, đếm về sớm lệch. Không chạm Supabase/React |
| `src/lib/chamCongZalo.test.js` | Tạo | Test cho tệp trên |
| `src/pages/tasks/ChamCongTab.jsx` | Sửa | 6 phần thêm: cột Nguồn, chấm về sớm, băng cảnh báo, nút áp lại, ô nối mã, nút dựng lại |
| `src/pages/tasks/TaskApp.jsx:1525-1549` | Sửa | Thêm `ve_som_tay` vào luồng đổi mã nhân viên (bảng cascade thứ 5) |
| workflow n8n | Sửa | Bỏ 1 mã khỏi `ignoreThreads`, thêm nhánh + Schedule Trigger |

Hàm so tên nằm **trong SQL, chỉ một bản**. Không viết bản sao bằng JS để test — hai bản sẽ lệch nhau, đúng lỗi `scripts/import-cham-cong.mjs` đã mắc (bản bàn giao 01/08 mục 5). Test SQL bằng câu `SELECT` chạy thật.

---

# GIAI ĐOẠN 1 — NỀN CSDL

### Task 1: Bảng tin thô `zalo_cham_cong`

**Files:**
- Create: `sql/cham_cong_zalo.sql`

- [ ] **Step 1: Chạy câu kiểm để thấy bảng CHƯA có**

Chạy trên Supabase SQL Editor:

```sql
select to_regclass('public.zalo_cham_cong') as bang;
```

Kỳ vọng: `bang = null`.

- [ ] **Step 2: Tạo tệp `sql/cham_cong_zalo.sql` với phần đầu**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- CHẤM CÔNG QUA NHÓM ZALO — bảng tin thô, cột nguồn, và các hàm dựng dòng
-- chấm công. Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Spec: docs/superpowers/specs/2026-08-06-cham-cong-zalo-design.md
--
-- ⚠ NHẮC LẠI CẢNH BÁO Ở create_cham_cong.sql: sql/security_3_rls_lockdown.sql quét
--   MỌI bảng public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại tệp đó
--   sau tệp này sẽ MỞ TOANG hai bảng zalo_cham_cong và ve_som_tay → phải chạy lại
--   tệp này ngay sau.
--   Kiểm chứng: select tablename, policyname from pg_policies
--               where tablename in ('zalo_cham_cong','ve_som_tay');
--   Kỳ vọng 8 dòng zcc_* / vst_*, TUYỆT ĐỐI không có dòng `auth_all`.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1. BẢNG TIN THÔ ─────────────────────────────────────────────────────────
-- Chỉ chứa tin của ĐÚNG nhóm chấm công. Không suy luận gì ở đây: giữ nguyên văn
-- để sau này sửa luật thì tính lại được, không phải nạp lại.
create table if not exists zalo_cham_cong (
  id          bigserial primary key,
  thread_id   text   not null,
  uid_from    text   not null,   -- KHOÁ NHẬN NGƯỜI. Tên hiển thị Zalo KHÔNG dùng được:
                                 -- 'ERM Trại Gà' nhắn "Hà", 'ERM Bếu Ú' nhắn "Xuân".
  sender_name text,              -- chỉ để người soát nhìn, không tham gia tính toán
  content     text,
  ts          bigint not null,   -- ms epoch từ Zalo
  ngay        date   not null,   -- ngày giờ VN, do trigger dưới điền
  created_at  timestamptz default now(),

  -- n8n chạy lại workflow / retry sẽ gửi lại đúng tin đó. Thiếu ràng buộc này là
  -- một tin thành nhiều dòng — không sai kết quả (hàm dựng lấy min giờ) nhưng bảng
  -- phình và người soát không tin được số dòng.
  constraint zalo_cham_cong_khong_trung unique (uid_from, ts)
);

create index if not exists zalo_cham_cong_ngay_idx on zalo_cham_cong (ngay, uid_from);

-- `ngay` phải do CSDL tính, không để n8n gửi lên: tính múi giờ sai bên ngoài là lỗi
-- lệch đúng một ngày, rất khó thấy. Cũng không dùng cột sinh (`generated always as`)
-- được: `timestamptz at time zone <text>` là STABLE chứ không IMMUTABLE nên Postgres
-- từ chối.
--
-- Trigger này CHỈ điền một cột ngày. Nó không đụng gì tới zalo_conversations — đó là
-- khác biệt căn bản với trigger của zalo_messages, và là lý do bảng này tồn tại riêng.
create or replace function zalo_cham_cong_dat_ngay() returns trigger
language plpgsql as $$
begin
  new.ngay := (to_timestamp(new.ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::date;
  return new;
end $$;

drop trigger if exists zalo_cham_cong_tg_ngay on zalo_cham_cong;
create trigger zalo_cham_cong_tg_ngay
  before insert or update of ts on zalo_cham_cong
  for each row execute function zalo_cham_cong_dat_ngay();

-- ── RLS: đọc khi đã đăng nhập, ghi chỉ ADMIN ────────────────────────────────
-- Bảng này chứa tin nhắn của nhân viên. n8n ghi bằng khoá sb_secret (service_role)
-- nên bỏ qua RLS — không cần policy cho nó.
alter table public.zalo_cham_cong enable row level security;

drop policy if exists auth_all on public.zalo_cham_cong;
drop policy if exists zcc_sel on public.zalo_cham_cong;
drop policy if exists zcc_ins on public.zalo_cham_cong;
drop policy if exists zcc_upd on public.zalo_cham_cong;
drop policy if exists zcc_del on public.zalo_cham_cong;

create policy zcc_sel on public.zalo_cham_cong
  for select to authenticated using (true);
create policy zcc_ins on public.zalo_cham_cong
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy zcc_upd on public.zalo_cham_cong
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy zcc_del on public.zalo_cham_cong
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;
```

- [ ] **Step 3: Chạy tệp trên Supabase SQL Editor**

Dán toàn bộ nội dung tệp vào SQL Editor và chạy.

- [ ] **Step 4: Kiểm bảng và trigger đã có, và trigger tính đúng ngày**

```sql
-- Tính mốc thời gian bằng SQL chứ không gõ cứng con số epoch: gõ tay là rất dễ lệch
-- cả năm mà nhìn không ra.
insert into zalo_cham_cong (thread_id, uid_from, content, ts)
values ('THU', 'THU-UID', 'thử',
        (extract(epoch from (timestamp '2026-08-06 08:01:00' at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint);
select ngay from zalo_cham_cong where uid_from = 'THU-UID';
delete from zalo_cham_cong where uid_from = 'THU-UID';
```

Kỳ vọng: `ngay = 2026-08-06`. Nếu ra `2026-08-05` thì múi giờ sai — dừng lại sửa.

- [ ] **Step 5: Kiểm 4 policy**

```sql
select policyname, cmd from pg_policies where tablename = 'zalo_cham_cong' order by policyname;
```

Kỳ vọng đúng 4 dòng `zcc_del / zcc_ins / zcc_sel / zcc_upd`. **Không được có dòng `auth_all`.**

- [ ] **Step 6: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): bang tin tho zalo_cham_cong + trigger ngay + RLS"
```

---

### Task 2: Hàm so tên `zalo_bo_dau` và `zalo_khop_ten`

**Files:**
- Modify: `sql/cham_cong_zalo.sql` (thêm vào cuối)

- [ ] **Step 1: Chạy câu test để thấy hàm CHƯA có**

```sql
select zalo_khop_ten('Ngoc', 'Ngọc');
```

Kỳ vọng: lỗi `42883 function zalo_khop_ten(unknown, unknown) does not exist`.

- [ ] **Step 2: Thêm hai hàm vào cuối `sql/cham_cong_zalo.sql`**

```sql
-- ── 2. SO TÊN ───────────────────────────────────────────────────────────────
-- Extension `unaccent` KHÔNG có trong project này (đã kiểm 06/08: chỉ có pg_net,
-- pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp).
-- Nên bỏ dấu bằng translate với bảng ký tự tự viết. Cũng tốt hơn unaccent một điểm:
-- xử lý được chữ 'đ'.
--
-- Số ký tự mỗi nhóm đã ĐO trên chính CSDL này ngày 06/08: 17 / 11 / 5 / 17 / 11 / 5.
-- Dùng repeat() thay vì gõ tay chuỗi đích để hai vế không thể lệch độ dài — translate
-- lệch độ dài thì nó lặng lẽ XOÁ ký tự thừa chứ không báo lỗi.
begin;

create or replace function zalo_bo_dau(p text) returns text
language sql immutable as $$
  select translate(
    lower(coalesce(p, '')),
    'àáạảãâầấậẩẫăằắặẳẵ' || 'èéẹẻẽêềếệểễ' || 'ìíịỉĩ'
      || 'òóọỏõôồốộổỗơờớợởỡ' || 'ùúụủũưừứựửữ' || 'ỳýỵỷỹ' || 'đ',
    repeat('a',17) || repeat('e',11) || repeat('i',5)
      || repeat('o',17) || repeat('u',11) || repeat('y',5) || 'd')
$$;

-- Tin có được coi là chấm công của NGƯỜI NÀY không.
--
-- So theo TỪ chứ không theo chuỗi con: tên 'Hà' bỏ dấu thành 'ha', nằm trong 'thang',
-- 'khach', 'nhanh'. So chuỗi con là bắt nhầm hàng loạt.
--
-- Người gọi PHẢI truyền tên của CHÍNH người gửi, không quét cả 13 tên. Bằng chứng:
-- tin của Thiện "Như đã xin phép GDKT nguyên,,em có việc, cho em xin nghỉ 2 ngày ạ"
-- chứa 'nguyên' — tên một người khác trong 13. Quét cả danh sách là ghi nhầm Thiện
-- thành có mặt đúng vào ngày họ xin nghỉ.
create or replace function zalo_khop_ten(p_content text, p_ten text) returns boolean
language sql immutable as $$
  with chuan as (
    select btrim(regexp_replace(zalo_bo_dau(p_content), '[^a-z0-9]+', ' ', 'g')) as noi_dung,
           btrim(regexp_replace(zalo_bo_dau(p_ten),     '[^a-z0-9]+', ' ', 'g')) as ten
  )
  select ten <> '' and position(' ' || ten || ' ' in ' ' || noi_dung || ' ') > 0
  from chuan
$$;

commit;
```

- [ ] **Step 3: Chạy phần vừa thêm trên SQL Editor**

- [ ] **Step 4: Test trên 19 tin thật chụp từ nhóm ngày 06/08**

```sql
select * from (values
  -- (nội dung, tên người gửi, kỳ vọng)
  ('phong',                     'Phong',  true),
  ('Xuyên',                     'Xuyên',  true),
  ('Xuân',                      'Xuân',   true),
  ('Ngoc',                      'Ngọc',   true),   -- gõ KHÔNG dấu
  ('Bích',                      'Bích',   true),
  ('Thơ',                       'Thơ',    true),
  ('Dương',                     'Dương',  true),
  ('Hà',                        'Hà',     true),
  ('Tâm 5AM',                   'Tâm',    true),   -- tên + chữ thừa
  ('Thuý trực showroom ạ',      'Thuý',   true),   -- tên + cả câu
  ('Như đã xin phép GDKT nguyên,,em có việc, cho em xin nghỉ 2 ngày ạ',
                                'Thiện',  false),  -- ⚠ tin xin nghỉ, PHẢI loại
  ('Như đã xin phép GDKT nguyên,,em có việc, cho em xin nghỉ 2 ngày ạ',
                                'Nguyên', true),   -- chứng minh vì sao chỉ so tên NGƯỜI GỬI
  ('giao cho khach hang',       'Hà',     false),  -- 'ha' là chuỗi con của 'khach'/'hang'
  ('nhanh len',                 'Hà',     false),
  ('',                          'Hà',     false),
  ('Hà',                        '',       false)
) as t(noi_dung, ten, ky_vong)
where zalo_khop_ten(noi_dung, ten) is distinct from ky_vong;
```

Kỳ vọng: **0 dòng**. Mỗi dòng trả về là một trường hợp sai — dừng lại sửa, đừng đi tiếp.

- [ ] **Step 5: Kiểm bảng bỏ dấu không nuốt ký tự**

```sql
select zalo_bo_dau('Nguyễn Thị Thuỳ Dương — đi muộn 15′') as ket_qua;
```

Kỳ vọng đúng chuỗi: `nguyen thi thuy duong — di muon 15′`. Nếu thiếu chữ cái nào thì hai vế `translate` lệch độ dài — đếm lại.

- [ ] **Step 6: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): ham zalo_bo_dau + zalo_khop_ten so ten theo tu, khong dau"
```

---

### Task 3: Cột `cham_cong.nguon`

**Files:**
- Modify: `sql/cham_cong_zalo.sql` (thêm vào cuối)

- [ ] **Step 1: Chạy câu kiểm để thấy cột CHƯA có**

```sql
select count(*) from information_schema.columns
where table_name = 'cham_cong' and column_name = 'nguon';
```

Kỳ vọng: `0`.

- [ ] **Step 2: Thêm vào cuối `sql/cham_cong_zalo.sql`**

```sql
-- ── 3. CỘT NGUỒN TRÊN cham_cong ─────────────────────────────────────────────
-- Không phải để trang trí: đây là điều kiện khiến Zalo KHÔNG BAO GIỜ đè được dòng
-- của máy vân tay (xem mệnh đề `where cham_cong.nguon = 'ZALO'` trong hàm dựng).
-- Thiếu cột này thì nguồn yếu hơn (ai nhớ nhắn) đè lên nguồn mạnh hơn (ai quẹt vân tay).
--
-- KHÔNG phải sửa nap_cham_cong: hàm đó liệt kê cột rõ ràng (rpc_nap_cham_cong.sql:63-66)
-- nên cột mới lấy giá trị mặc định 'MAY'. Đã kiểm.
begin;

alter table cham_cong add column if not exists nguon text not null default 'MAY';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cham_cong_nguon_hop_le') then
    alter table cham_cong add constraint cham_cong_nguon_hop_le check (nguon in ('MAY','ZALO'));
  end if;
end $$;

create index if not exists cham_cong_nguon_idx on cham_cong (ky, nguon);

commit;
```

- [ ] **Step 3: Chạy phần vừa thêm trên SQL Editor**

- [ ] **Step 4: Kiểm 388 dòng cũ đều thành `MAY` và không dòng nào đổi giá trị khác**

```sql
select nguon, count(*) from cham_cong group by nguon;
```

Kỳ vọng: đúng một dòng `MAY | 388`.

- [ ] **Step 5: Kiểm `nap_cham_cong` vẫn chèn được sau khi thêm cột — chạy trên kỳ RÁC**

⚠ Dùng kỳ `1900-01`, tuyệt đối không dùng kỳ thật. Cần một `nhan_vien_id` có thật; câu dưới tự lấy.

```sql
select nap_cham_cong('1900-01', jsonb_build_array(jsonb_build_object(
  'nhan_vien_id', (select id from nhan_vien where ten_cham_cong is not null order by id limit 1),
  'ngay', '1900-01-02', 'thu', 'T2', 'gio_in_sang', '08:00', 'gio_in_chieu', null,
  'gio_out', null, 'tang_ca_phut', null, 'di_muon_phut', 0, 've_som_phut', 0,
  'nghi', false, 'nghi_van', null)));

select nguon from cham_cong where ky = '1900-01';
delete from cham_cong where ky = '1900-01';
```

Kỳ vọng: câu đầu trả `{"so_xoa": 0, "so_nap": 1}` (hoặc lỗi `Chỉ tài khoản quản trị…` nếu chạy bằng SQL Editor không có JWT — trong trường hợp đó bỏ qua step này và kiểm ở Task 15 bằng tài khoản ADMIN thật). Câu hai trả `MAY`.

- [ ] **Step 6: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): cot nguon MAY/ZALO tren bang cham_cong"
```

---

### Task 4: Bảng `ve_som_tay`

**Files:**
- Modify: `sql/cham_cong_zalo.sql` (thêm vào cuối)

Phải tạo TRƯỚC hàm dựng ở Task 5 — hàm đó đọc bảng này.

- [ ] **Step 1: Chạy câu kiểm để thấy bảng CHƯA có**

```sql
select to_regclass('public.ve_som_tay') as bang;
```

Kỳ vọng: `null`.

- [ ] **Step 2: Thêm vào cuối `sql/cham_cong_zalo.sql`**

```sql
-- ── 4. VỀ SỚM CHẤM TAY ──────────────────────────────────────────────────────
-- Máy chấm công ĐÃ NGỪNG xuất cột "Về sớm" — đo 06/08: 0/388 dòng có giá trị > 0.
-- Nên chấm tay là nguồn DUY NHẤT của về sớm, và nó phải sống ở bảng riêng: hàm
-- nap_cham_cong xoá trọn kỳ rồi chèn lại từ Excel (rpc_nap_cham_cong.sql:60), ghi
-- thẳng vào cham_cong là mỗi tháng mất trắng.
--
-- Chủ app chốt 06/08: KHÔNG sửa nap_cham_cong. Bù lại bằng hàm ap_lai_ve_som_tay
-- (Task 6) + băng cảnh báo lệch trong giao diện (Task 13).
begin;

create table if not exists ve_som_tay (
  id           bigserial primary key,
  ky           text not null,
  nhan_vien_id text not null references nhan_vien(id) on delete cascade,
  ngay         date not null,
  so_phut      int  not null check (so_phut > 0),
  -- BẮT BUỘC: cột này trừ điểm chuyên cần, mà chuyên cần gắn thẳng với lương thưởng.
  -- Một con số không kèm lý do là thứ không cãi lại được khi có người thắc mắc.
  ly_do        text not null,
  nguoi_ghi    text,
  created_at   timestamptz default now(),
  constraint ve_som_tay_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);

create index if not exists ve_som_tay_ky_idx on ve_som_tay (ky);

alter table public.ve_som_tay enable row level security;

drop policy if exists auth_all on public.ve_som_tay;
drop policy if exists vst_sel on public.ve_som_tay;
drop policy if exists vst_ins on public.ve_som_tay;
drop policy if exists vst_upd on public.ve_som_tay;
drop policy if exists vst_del on public.ve_som_tay;

create policy vst_sel on public.ve_som_tay
  for select to authenticated using (true);
create policy vst_ins on public.ve_som_tay
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy vst_upd on public.ve_som_tay
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy vst_del on public.ve_som_tay
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;
```

- [ ] **Step 3: Chạy phần vừa thêm trên SQL Editor**

- [ ] **Step 4: Kiểm bảng + 4 policy**

```sql
select policyname, cmd from pg_policies where tablename = 've_som_tay' order by policyname;
```

Kỳ vọng đúng 4 dòng `vst_del / vst_ins / vst_sel / vst_upd`, không có `auth_all`.

- [ ] **Step 5: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): bang ve_som_tay + RLS admin-only"
```

---

### Task 5: Hàm dựng `dung_cham_cong_zalo`

**Files:**
- Modify: `sql/cham_cong_zalo.sql` (thêm vào cuối)

- [ ] **Step 1: Chạy câu test để thấy hàm CHƯA có**

```sql
select dung_cham_cong_zalo('1900-01-01'::date, '1900-01-02'::date);
```

Kỳ vọng: lỗi `42883 function dung_cham_cong_zalo(date, date) does not exist`.

- [ ] **Step 2: Thêm vào cuối `sql/cham_cong_zalo.sql`**

```sql
-- ── 5. HÀM DỰNG DÒNG CHẤM CÔNG TỪ TIN THÔ ───────────────────────────────────
--
-- ⚠ TUYỆT ĐỐI KHÔNG THÊM `security definer`. Để mặc định (invoker) thì hàm vẫn chịu
--   RLS. Là definer thì người ngoài cầm khoá công khai — thứ nằm sẵn trong mã nguồn,
--   Ctrl+U là thấy — ghi đè được cả bảng chấm công của 13 người.
--
-- ⚠ CHỐT HAY CHƯA LÀ DO HÀM TỰ QUYẾT THEO ĐỒNG HỒ, KHÔNG PHẢI THAM SỐ NGƯỜI GỌI.
--   Bản nháp đầu để `p_chot boolean`. Sai kiểu im lặng: sau khi lượt 17:15 chốt xong,
--   một tin tăng ca lúc 18:00 khiến n8n gọi lại với p_chot = false, hàm tính lại từ
--   đầu và XOÁ SẠCH cờ nghỉ vừa chốt — cả 13 người bỗng thành đi làm đủ.
create or replace function dung_cham_cong_zalo(p_tu date, p_den date)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hom_nay date;
  v_gio_vn  time;
  v_ghi int;
begin
  if p_tu is null or p_den is null or p_den < p_tu then
    return jsonb_build_object('loi', 'Khoảng ngày không hợp lệ');
  end if;
  if p_den - p_tu > 366 then
    return jsonb_build_object('loi', 'Khoảng ngày quá dài, tối đa 366 ngày');
  end if;

  v_hom_nay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_gio_vn  := (now() at time zone 'Asia/Ho_Chi_Minh')::time;

  with ngay_xet as (
    -- T2..T7. Chủ nhật không xét gì cả.
    select d::date as ngay
    from generate_series(p_tu, p_den, interval '1 day') d
    where extract(dow from d) between 1 and 6
  ),
  nguoi as (
    -- 13 người kho = có ten_cham_cong. Bắt buộc có uid_from, không thì không nhận
    -- được tin của họ và ghi nghỉ oan mỗi ngày.
    select id as nhan_vien_id, name as ten, uid_from
    from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_from, '') <> ''
  ),
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '04:00' and z.gio < time '12:00' then 'S'
                when z.gio >= time '12:00' and z.gio < time '17:00' then 'C'
                else null end as buoi,      -- từ 17:00 là tăng ca, không dùng để chấm
           z.gio
    from (
      select uid_from, ngay, content,
             (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
      from zalo_cham_cong
      where ngay between p_tu and p_den
    ) z
    join nguoi n on n.uid_from = z.uid_from
    where zalo_khop_ten(z.content, n.ten)
  ),
  dau_buoi as (
    -- Nhắn hai lần trong cùng buổi thì lấy lần đầu.
    select nhan_vien_id, ngay, buoi, min(gio) as gio
    from tin where buoi is not null
    group by 1, 2, 3
  ),
  co_ai as (
    -- VAN AN TOÀN, theo TỪNG BUỔI chứ không theo ngày. n8n chết lúc 12h trưa thì cả 13
    -- người đủ tin sáng nhưng trắng tin chiều — van theo ngày sẽ gạch 'Nghỉ chiều' cho
    -- đủ 13 người, mất 0,5 ngày mỗi người, không ai biết vì sao.
    -- Van này che cùng lúc: ngày lễ, n8n chết, Zalo rớt phiên đăng nhập.
    select ngay,
           bool_or(buoi = 'S') as co_sang,
           bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select
      nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '17:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false)
        -- Chiều thứ 7 lần thứ 2 và lần thứ 4 của tháng được nghỉ.
        -- ceil(ngày/7): 1-7 → lần 1, 8-14 → lần 2, 15-21 → lần 3, 22-28 → lần 4.
        and not (extract(dow from nx.ngay) = 6
                 and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as xet_chieu
    from ngay_xet nx
    cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
  ),
  co_cua as (
    select t.*,
           (t.da_dong_so and t.xet_sang  and t.gio_sang  is null) as thieu_sang,
           (t.da_dong_so and t.xet_chieu and t.gio_chieu is null) as thieu_chieu
    from tinh t
  ),
  ket as (
    select
      cc.ngay, cc.nhan_vien_id, cc.gio_sang, cc.gio_chieu,
      (cc.thieu_sang or cc.thieu_chieu) as nghi,
      case when cc.thieu_sang and cc.thieu_chieu then 'Nghỉ'
           when cc.thieu_sang  then 'Nghỉ sáng'
           when cc.thieu_chieu then 'Nghỉ chiều'
           else null end as nghi_text,
      (coalesce(greatest(0, extract(epoch from (cc.gio_sang  - time '08:00')) / 60), 0)
       + coalesce(greatest(0, extract(epoch from (cc.gio_chieu - time '13:30')) / 60), 0))::int
        as di_muon_phut
    from co_cua cc
    -- Chỉ ghi dòng có căn cứ: hoặc người đó có tin, hoặc buổi đó đang được xét (để ghi nghỉ).
    where cc.gio_sang is not null or cc.gio_chieu is not null
       or cc.thieu_sang or cc.thieu_chieu
  )
  insert into cham_cong (
    ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
    tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nguon)
  select
    to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN'
         else 'T' || (extract(dow from k.ngay) + 1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null,
    null,                                   -- tăng ca: một tin lúc bắt đầu không nói được
                                            -- tăng ca bao nhiêu phút. Không bịa số.
    k.di_muon_phut,
    coalesce(v.so_phut, 0),                 -- về sớm chấm tay THẮNG, không bị dựng lại về 0
    k.nghi, k.nghi_text, 'ZALO'
  from ket k
  left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky           = excluded.ky,
    thu          = excluded.thu,
    gio_in_sang  = excluded.gio_in_sang,
    gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut,
    ve_som_phut  = excluded.ve_som_phut,
    nghi         = excluded.nghi,
    nghi_text    = excluded.nghi_text
  -- ⚠ CHỐT CHẶN QUAN TRỌNG NHẤT CỦA CẢ TÍNH NĂNG. Ngày nào Excel đã nạp thì dòng đó
  --   nguon = 'MAY', điều kiện sai, Zalo KHÔNG CHẠM VÀO ĐƯỢC. Bỏ mệnh đề này là số
  --   "ai nhớ nhắn" đè lên số "ai quẹt vân tay".
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object('so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den);
end $$;

revoke execute on function dung_cham_cong_zalo(date, date) from public;
revoke execute on function dung_cham_cong_zalo(date, date) from anon;
grant  execute on function dung_cham_cong_zalo(date, date) to authenticated;
```

- [ ] **Step 3: Chạy phần vừa thêm trên SQL Editor**

- [ ] **Step 4: Kiểm hàm KHÔNG phải security definer và anon không gọi được**

```sql
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('dung_cham_cong_zalo','zalo_khop_ten','zalo_bo_dau');

select has_function_privilege('anon',          'dung_cham_cong_zalo(date,date)', 'EXECUTE') as anon_chay_duoc,
       has_function_privilege('authenticated', 'dung_cham_cong_zalo(date,date)', 'EXECUTE') as auth_chay_duoc;
```

Kỳ vọng: `prosecdef = false` cả ba hàm; `anon_chay_duoc = false`, `auth_chay_duoc = true`.

- [ ] **Step 5: Dựng bộ dữ liệu thử trên NGÀY RÁC năm 1900**

⚠ Toàn bộ test dùng ngày năm 1900 nên không đụng dữ liệu thật. `1900-01-02` là **thứ Ba**, `1900-01-13` là **thứ Bảy lần 2**, `1900-01-06` là **thứ Bảy lần 1**.

```sql
-- Ba người thật đầu tiên có uid_from. Dùng bảng THƯỜNG chứ không `temp`: mỗi lần bấm
-- Run trên Supabase SQL Editor có thể là một phiên khác, bảng temp sẽ biến mất giữa
-- chừng và các step sau báo "relation does not exist". Bảng này được xoá ở Step 13.
drop table if exists zz_thu_nguoi;
create table zz_thu_nguoi as
select id, name, uid_from, row_number() over (order by id) as n
from nhan_vien where ten_cham_cong is not null and coalesce(uid_from,'') <> ''
order by id limit 3;

select * from zz_thu_nguoi;   -- ghi lại 3 mã này, các step sau dùng tới
```

Kỳ vọng: 3 dòng. Nếu ít hơn 3 thì chưa nối đủ mã Zalo — vẫn test được nhưng giảm số người trong các câu dưới.

- [ ] **Step 6: Test A — đủ 4 tổ hợp sáng/chiều + đi muộn cộng dồn**

```sql
delete from cham_cong     where ngay between '1900-01-01' and '1900-01-31';
delete from zalo_cham_cong where ngay between '1900-01-01' and '1900-01-31';

-- Người 1: sáng 08:10 + chiều 13:45  → đi làm đủ, muộn 10+15 = 25 phút
-- Người 2: chỉ sáng 08:00            → Nghỉ chiều, muộn 0
-- Người 3: chỉ chiều 13:30           → Nghỉ sáng, muộn 0
insert into zalo_cham_cong (thread_id, uid_from, sender_name, content, ts)
select 'THU', p.uid_from, p.name, p.name,
       (extract(epoch from (t.luc at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint
from zz_thu_nguoi p
join (values
  (1, timestamp '1900-01-02 08:10:00'),
  (1, timestamp '1900-01-02 13:45:00'),
  (2, timestamp '1900-01-02 08:00:00'),
  (3, timestamp '1900-01-02 13:30:00')
) as t(n, luc) on t.n = p.n;

select dung_cham_cong_zalo('1900-01-02', '1900-01-02');

select p.n, c.gio_in_sang, c.gio_in_chieu, c.di_muon_phut, c.nghi, c.nghi_text, c.nguon
from cham_cong c join zz_thu_nguoi p on p.id = c.nhan_vien_id
where c.ngay = '1900-01-02' order by p.n;
```

Kỳ vọng đúng 3 dòng:

| n | gio_in_sang | gio_in_chieu | di_muon_phut | nghi | nghi_text | nguon |
|---|---|---|---|---|---|---|
| 1 | 08:10 | 13:45 | 25 | false | (null) | ZALO |
| 2 | 08:00 | (null) | 0 | true | Nghỉ chiều | ZALO |
| 3 | (null) | 13:30 | 0 | true | Nghỉ sáng | ZALO |

Người thứ 4 trở đi (nếu có) phải có dòng `nghi = true, nghi_text = 'Nghỉ'`.

- [ ] **Step 7: Test B — chạy lại không đổi kết quả, và không mất cờ nghỉ**

```sql
select dung_cham_cong_zalo('1900-01-02', '1900-01-02');
select count(*) filter (where nghi) as so_nghi, count(*) as tong
from cham_cong where ngay = '1900-01-02';
```

Kỳ vọng: giống hệt lần chạy trước. **Đây là test khoá lại lỗi `p_chot` của bản nháp** — cờ nghỉ không được biến mất khi chạy lại.

- [ ] **Step 8: Test C — dòng của MÁY không bị đè**

```sql
update cham_cong set nguon = 'MAY', di_muon_phut = 999
where ngay = '1900-01-02' and nhan_vien_id = (select id from zz_thu_nguoi where n = 1);

select dung_cham_cong_zalo('1900-01-02', '1900-01-02');

select di_muon_phut, nguon from cham_cong
where ngay = '1900-01-02' and nhan_vien_id = (select id from zz_thu_nguoi where n = 1);
```

Kỳ vọng: vẫn `999 | MAY`. Nếu thành `25 | ZALO` thì mệnh đề `where cham_cong.nguon = 'ZALO'` bị mất — **dừng lại, đây là lỗi nặng nhất có thể xảy ra ở tính năng này**.

- [ ] **Step 9: Test D — van an toàn: buổi cả nhóm im lặng**

```sql
delete from cham_cong     where ngay between '1900-01-01' and '1900-01-31';
delete from zalo_cham_cong where ngay between '1900-01-01' and '1900-01-31';

-- CHỈ buổi sáng có tin, không ai nhắn buổi chiều
insert into zalo_cham_cong (thread_id, uid_from, sender_name, content, ts)
select 'THU', p.uid_from, p.name, p.name,
       (extract(epoch from (timestamp '1900-01-03 08:00:00' at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint
from zz_thu_nguoi p where p.n = 1;

select dung_cham_cong_zalo('1900-01-03', '1900-01-03');
select nhan_vien_id, nghi, nghi_text from cham_cong where ngay = '1900-01-03';
```

Kỳ vọng: người 1 có dòng `nghi = false`; **không ai bị `Nghỉ chiều`** vì cả nhóm trắng tin chiều. Người 2, 3 có `nghi = true, nghi_text = 'Nghỉ sáng'`.

- [ ] **Step 10: Test E — khoảng ngày không có tin nào thì không sinh dòng**

```sql
delete from cham_cong     where ngay between '1900-01-01' and '1900-01-31';
delete from zalo_cham_cong where ngay between '1900-01-01' and '1900-01-31';

select dung_cham_cong_zalo('1900-01-01', '1900-01-31');
select count(*) from cham_cong where ngay between '1900-01-01' and '1900-01-31';
```

Kỳ vọng: `so_dong_ghi = 0` và `count = 0`. **Nếu ra 13 × số ngày thì van an toàn hỏng** — bấm nút "Dựng lại" cho một tháng cũ sẽ biến cả tháng thành nghỉ.

- [ ] **Step 11: Test F — chiều thứ Bảy lần 2 không bị ghi nghỉ chiều**

```sql
delete from cham_cong     where ngay between '1900-01-01' and '1900-01-31';
delete from zalo_cham_cong where ngay between '1900-01-01' and '1900-01-31';

-- 1900-01-06 = T7 lần 1 (có làm chiều) · 1900-01-13 = T7 lần 2 (nghỉ chiều)
-- Cả hai ngày: người 1 nhắn sáng, người 2 nhắn chiều (để van an toàn mở cả hai buổi)
--
-- ⚠ Dấu ngoặc quanh `(t.ngay + t.gio)` là BẮT BUỘC: `at time zone` bám chặt hơn `+`,
--   thiếu ngoặc là Postgres hiểu thành `t.ngay + (t.gio at time zone …)` → ra timetz,
--   sai giờ mà không báo lỗi.
insert into zalo_cham_cong (thread_id, uid_from, sender_name, content, ts)
select 'THU', p.uid_from, p.name, p.name,
       (extract(epoch from ((t.ngay + t.gio) at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint
from zz_thu_nguoi p
join (values
  (1, date '1900-01-06', time '08:00'),
  (1, date '1900-01-13', time '08:00'),
  (2, date '1900-01-06', time '13:30'),
  (2, date '1900-01-13', time '13:30')
) as t(n, ngay, gio) on t.n = p.n;

select dung_cham_cong_zalo('1900-01-06', '1900-01-13');

select ngay, p.n, nghi, nghi_text from cham_cong c join zz_thu_nguoi p on p.id = c.nhan_vien_id
where c.ngay in ('1900-01-06','1900-01-13') and p.n = 1 order by ngay;
```

Kỳ vọng:
- `1900-01-06` (T7 lần 1), người 1 chỉ nhắn sáng → `nghi = true, nghi_text = 'Nghỉ chiều'`
- `1900-01-13` (T7 lần 2), người 1 chỉ nhắn sáng → `nghi = false, nghi_text = null`

- [ ] **Step 12: Test G — về sớm chấm tay không bị dựng lại về 0**

```sql
insert into ve_som_tay (ky, nhan_vien_id, ngay, so_phut, ly_do, nguoi_ghi)
values ('1900-01', (select id from zz_thu_nguoi where n = 1), '1900-01-06', 30, 'thử', 'test')
on conflict (nhan_vien_id, ngay) do update set so_phut = 30;

select dung_cham_cong_zalo('1900-01-06', '1900-01-06');

select ve_som_phut from cham_cong
where ngay = '1900-01-06' and nhan_vien_id = (select id from zz_thu_nguoi where n = 1);
```

Kỳ vọng: `30`.

- [ ] **Step 13: Dọn sạch dữ liệu thử và kiểm dữ liệu thật nguyên vẹn**

```sql
delete from ve_som_tay     where ky = '1900-01';
delete from cham_cong      where ngay between '1900-01-01' and '1900-01-31';
delete from zalo_cham_cong where ngay between '1900-01-01' and '1900-01-31';
drop table if exists zz_thu_nguoi;

select ky, count(*) from cham_cong group by ky order by ky;
select count(*) from zalo_cham_cong;
```

Kỳ vọng: chỉ còn `2026-07 | 388`; `zalo_cham_cong` đếm 0 (hoặc đúng số tin thật nếu Task 7 đã chạy).

- [ ] **Step 14: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): ham dung_cham_cong_zalo, tu chot theo dong ho, khong de dong MAY"
```

---

### Task 6: Hàm `ap_lai_ve_som_tay`

**Files:**
- Modify: `sql/cham_cong_zalo.sql` (thêm vào cuối)

- [ ] **Step 1: Chạy câu test để thấy hàm CHƯA có**

```sql
select ap_lai_ve_som_tay('1900-01');
```

Kỳ vọng: lỗi `42883 … does not exist`.

- [ ] **Step 2: Thêm vào cuối `sql/cham_cong_zalo.sql`**

```sql
-- ── 6. ÁP LẠI VỀ SỚM CHẤM TAY ───────────────────────────────────────────────
-- Dùng sau khi nạp Excel: nap_cham_cong xoá trọn kỳ nên bản phản chiếu về sớm trong
-- cham_cong về 0. DỮ LIỆU GỐC KHÔNG MẤT — nó nằm ở ve_som_tay mà hàm nạp không đụng.
-- Hàm này chỉ dựng lại bản phản chiếu, chạy lại bao nhiêu lần cũng ra cùng kết quả,
-- nên rớt mạng thì bấm lại, không có trạng thái dở dang.
--
-- ⚠ KHÔNG `security definer` — cùng lý do như hàm dựng.
create or replace function ap_lai_ve_som_tay(p_ky text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_ap int; v_thieu int;
begin
  if p_ky is null or p_ky !~ '^[0-9]{4}-[0-9]{2}$' then
    return jsonb_build_object('loi', 'Kỳ không hợp lệ, phải dạng YYYY-MM');
  end if;

  update cham_cong c
     set ve_som_phut = v.so_phut
    from ve_som_tay v
   where v.nhan_vien_id = c.nhan_vien_id
     and v.ngay = c.ngay
     and v.ky = p_ky
     and c.ve_som_phut is distinct from v.so_phut;
  get diagnostics v_ap = row_count;

  -- Dòng chấm công của ngày đó không tồn tại thì UPDATE không với tới được. Đếm ra và
  -- trả về chứ không im lặng: người dùng phải biết còn bao nhiêu dòng chưa áp được.
  select count(*) into v_thieu
  from ve_som_tay v
  where v.ky = p_ky
    and not exists (select 1 from cham_cong c
                    where c.nhan_vien_id = v.nhan_vien_id and c.ngay = v.ngay);

  return jsonb_build_object('so_ap', v_ap, 'so_thieu_dong', v_thieu);
end $$;

revoke execute on function ap_lai_ve_som_tay(text) from public;
revoke execute on function ap_lai_ve_som_tay(text) from anon;
grant  execute on function ap_lai_ve_som_tay(text) to authenticated;
```

- [ ] **Step 3: Chạy phần vừa thêm trên SQL Editor**

- [ ] **Step 4: Kiểm quyền và không phải definer**

```sql
select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ap_lai_ve_som_tay';

select has_function_privilege('anon', 'ap_lai_ve_som_tay(text)', 'EXECUTE') as anon_chay_duoc;
```

Kỳ vọng: `false` và `false`.

- [ ] **Step 5: Commit**

```bash
git add sql/cham_cong_zalo.sql
git commit -m "feat(cham-cong): ham ap_lai_ve_som_tay dung lai ban phan chieu sau khi nap Excel"
```

---

# GIAI ĐOẠN 2 — n8n THU TIN THÔ

### Task 7: Bỏ chặn nhóm + nhánh ghi tin thô

**Files:**
- Modify: workflow n8n (sửa trong giao diện n8n, không có tệp trong repo)

⚠ Giai đoạn này **chưa gọi hàm dựng**. Mục đích chỉ để tin chảy vào, đủ dữ liệu nối mã Zalo ở Task 9.

- [ ] **Step 1: Xác định mã nhóm chấm công**

Ba mã trong `ignoreThreads` không khớp nhóm nào trong `zalo_groups`:
`3288273518723273312` · `4526062079113325581` · `8095429580080493978`

Cách xác định chắc chắn: bỏ **cả ba** khỏi `ignoreThreads`, để chạy 1 giờ, rồi:

```sql
select thread_id, count(*) n, count(distinct uid_from) so_nguoi
from zalo_messages
where thread_id in ('3288273518723273312','4526062079113325581','8095429580080493978')
group by thread_id order by n desc;
```

Nhóm chấm công là nhóm có nhiều người gửi nhất vào buổi sáng với nội dung ngắn. Xác định xong, **đưa hai mã còn lại trở lại `ignoreThreads`** và dọn tin lỡ thu:

```sql
delete from zalo_conversations where thread_id in ('<MÃ 1>','<MÃ 2>','<MÃ CHẤM CÔNG>');
delete from zalo_messages      where thread_id in ('<MÃ 1>','<MÃ 2>','<MÃ CHẤM CÔNG>');
```

Ghi mã chấm công vào biến gọi là `<CC_THREAD>` cho các step sau.

- [ ] **Step 2: Bỏ `<CC_THREAD>` khỏi `ignoreThreads` của node Zalo Trigger**

Giữ nguyên mọi mã còn lại. Danh sách hiện tại:
`3288273518723273312, 4526062079113325581, 8095429580080493978, 3055913649002864484, 4510861659803630229, 5519914612193643414, 8226146083728934437, 192358220232996007, 6398222639628881607`
(mã `3288273518723273312` đang bị ghi **hai lần** — xoá bản trùng luôn nếu nó không phải nhóm chấm công.)

- [ ] **Step 3: Thêm node If "Là nhóm chấm công?" NGAY SAU Zalo Trigger**

Điều kiện (Boolean → is true):

```
{{ $json.threadId === '<CC_THREAD>' }}
```

Nối dây:
- **Zalo Trigger → If "Là nhóm chấm công?"** (thay cho dây cũ Zalo Trigger → If1)
- **Nhánh FALSE → If1** (nhánh cũ, không đổi gì bên trong)
- **Nhánh TRUE → node Supabase mới ở Step 4**

⚠ Nhánh false phải nối đúng vào `If1`. Nối nhầm là toàn bộ KPI Zalo ngừng thu.

- [ ] **Step 4: Thêm node Supabase "Ghi tin chấm công"**

- Credential: `Supabase account 2` (đang dùng ở hai node `Create a row`)
- Operation: Create
- Table: `zalo_cham_cong`
- Fields:

| Field | Value |
|---|---|
| `thread_id` | `{{ $json.threadId }}` |
| `uid_from` | `{{ $json.data.uidFrom }}` |
| `sender_name` | `{{ $json.data.dName }}` |
| `content` | `{{ $json.filter.content }}` |
| `ts` | `{{ $json.data.ts }}` |

**Không** gửi `ngay` — trigger trong CSDL tự điền.

- [ ] **Step 5: Bật workflow, chờ tin sáng hôm sau, rồi kiểm**

```sql
select ngay, count(*) so_tin, count(distinct uid_from) so_nguoi
from zalo_cham_cong group by ngay order by ngay desc limit 5;
```

Kỳ vọng: có dòng của hôm nay, `so_nguoi` khoảng 15–27.

- [ ] **Step 6: Kiểm nhóm chấm công KHÔNG lọt vào KPI Zalo**

```sql
select count(*) from zalo_messages      where thread_id = '<CC_THREAD>';
select count(*) from zalo_conversations where thread_id = '<CC_THREAD>';
```

Kỳ vọng: **cả hai đều 0**. Khác 0 nghĩa là node If nối sai — sửa ngay rồi xoá các dòng đó.

---

# GIAI ĐOẠN 3 — NỐI MÃ ZALO

### Task 8: Hàm thuần `src/lib/chamCongZalo.js`

**Files:**
- Create: `src/lib/chamCongZalo.js`
- Test: `src/lib/chamCongZalo.test.js`

- [ ] **Step 1: Viết test trước**

Tạo `src/lib/chamCongZalo.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dsChuaNoiMa, demVeSomLech } from './chamCongZalo';

describe('dsChuaNoiMa', () => {
  const nhanVien = [
    { id: 'hhx', name: 'Xuyên', uid_from: '337594525259740835' },
    { id: 'lvb', name: 'Bích', uid_from: null },
    { id: 'nvh', name: 'Hĩu', uid_from: '' },
  ];

  it('bỏ người đã nối mã, giữ người chưa nối', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: '337594525259740835', sender_name: 'Hà Xuyên', content: 'Xuyên', ts: 100 },
        { uid_from: 'UID-LA', sender_name: 'ERM Trại Gà', content: 'Hà', ts: 200 },
      ],
      nhanVien,
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].uid_from).toBe('UID-LA');
  });

  it('gộp theo uid và giữ nội dung của tin MỚI NHẤT', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: 'U1', sender_name: 'A', content: 'cũ', ts: 100 },
        { uid_from: 'U1', sender_name: 'A', content: 'mới', ts: 300 },
        { uid_from: 'U1', sender_name: 'A', content: 'giữa', ts: 200 },
      ],
      nhanVien: [],
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].soTin).toBe(3);
    expect(kq[0].content).toBe('mới');
  });

  it('xếp người nhắn nhiều lên trước', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: 'IT', content: 'x', ts: 1 },
        { uid_from: 'NHIEU', content: 'y', ts: 2 },
        { uid_from: 'NHIEU', content: 'y', ts: 3 },
      ],
      nhanVien: [],
    });
    expect(kq.map(x => x.uid_from)).toEqual(['NHIEU', 'IT']);
  });

  it('không nổ khi thiếu tham số', () => {
    expect(dsChuaNoiMa()).toEqual([]);
    expect(dsChuaNoiMa({})).toEqual([]);
  });
});

describe('demVeSomLech', () => {
  it('đếm dòng có số khác nhau', () => {
    const kq = demVeSomLech({
      rows: [{ nhan_vien_id: 'a', ngay: '2026-08-03', ve_som_phut: 0 }],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 1, soThieuDong: 0 });
  });

  it('khớp thì không tính là lệch', () => {
    const kq = demVeSomLech({
      rows: [{ nhan_vien_id: 'a', ngay: '2026-08-03', ve_som_phut: 30 }],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 0, soThieuDong: 0 });
  });

  it('không có dòng chấm công thì đếm riêng, không gộp vào lệch', () => {
    const kq = demVeSomLech({
      rows: [],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 0, soThieuDong: 1 });
  });

  it('không nổ khi thiếu tham số', () => {
    expect(demVeSomLech()).toEqual({ soLech: 0, soThieuDong: 0 });
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó hỏng**

```bash
npx vitest run src/lib/chamCongZalo.test.js
```

Kỳ vọng: FAIL — `Failed to resolve import "./chamCongZalo"`.

- [ ] **Step 3: Viết `src/lib/chamCongZalo.js`**

```js
// ─────────────────────────────────────────────────────────────────────────────
// Hàm thuần cho phần chấm công qua nhóm Zalo — không chạm Supabase, không chạm React.
//
// Luật so tên KHÔNG nằm ở đây mà nằm trong SQL (`zalo_khop_ten`). Cố ý: viết bản sao
// bằng JS thì hai bản sẽ lệch nhau, đúng lỗi scripts/import-cham-cong.mjs đã mắc — từ
// cùng một tệp cho ra bốn kết quả khác app. Tệp này chỉ lo phần giao diện cần.
// ─────────────────────────────────────────────────────────────────────────────

// Người gửi trong nhóm chấm công CHƯA nối được với nhân viên nào.
//
// Chưa nối mã thì hàm dựng không nhận ra họ ⇒ họ bị ghi NGHỈ mỗi ngày. Nên danh sách
// này không phải tiện ích cho vui, nó là màn hình sửa lỗi trừ điểm oan.
export function dsChuaNoiMa({ zaloRows = [], nhanVien = [] } = {}) {
  const daNoi = new Set(
    (nhanVien || []).map(n => String(n?.uid_from ?? '').trim()).filter(Boolean));

  const theoUid = new Map();
  for (const r of zaloRows || []) {
    const uid = String(r?.uid_from ?? '').trim();
    if (!uid || daNoi.has(uid)) continue;
    const ts = Number(r?.ts) || 0;
    const cu = theoUid.get(uid);
    if (!cu) {
      theoUid.set(uid, {
        uid_from: uid, sender_name: r?.sender_name || '', content: r?.content || '',
        ts, soTin: 1,
      });
      continue;
    }
    cu.soTin += 1;
    // Giữ tin MỚI NHẤT: tên hiển thị Zalo đổi được, và nội dung gần đây phản ánh đúng
    // hơn người đó tự xưng là ai.
    if (ts > cu.ts) {
      cu.ts = ts;
      cu.content = r?.content || '';
      cu.sender_name = r?.sender_name || cu.sender_name;
    }
  }
  return [...theoUid.values()].sort((a, b) => b.soTin - a.soTin || b.ts - a.ts);
}

// Bản phản chiếu về sớm trong cham_cong có khớp bảng gốc ve_som_tay không.
//
// Tách hai con số chứ không gộp: `soLech` bấm nút "Áp lại" là xong, còn `soThieuDong`
// thì nút đó KHÔNG với tới được (UPDATE không tạo được dòng) — phải dựng lại từ Zalo
// hoặc nạp Excel. Gộp làm một là người dùng bấm mãi mà con số không về 0.
export function demVeSomLech({ rows = [], veSomTay = [] } = {}) {
  const tra = new Map();
  for (const r of rows || []) {
    tra.set(`${r?.nhan_vien_id}|${r?.ngay}`, Number(r?.ve_som_phut) || 0);
  }
  let soLech = 0, soThieuDong = 0;
  for (const v of veSomTay || []) {
    const hien = tra.get(`${v?.nhan_vien_id}|${v?.ngay}`);
    if (hien === undefined) { soThieuDong += 1; continue; }
    if (hien !== (Number(v?.so_phut) || 0)) soLech += 1;
  }
  return { soLech, soThieuDong };
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

```bash
npx vitest run src/lib/chamCongZalo.test.js
```

Kỳ vọng: PASS, 8 test.

- [ ] **Step 5: Chạy toàn bộ test để chắc không hỏng gì khác**

```bash
npm test
```

Kỳ vọng: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chamCongZalo.js src/lib/chamCongZalo.test.js
git commit -m "feat(cham-cong): ham thuan loc nguoi chua noi ma Zalo va dem ve som lech"
```

---

### Task 9: Ô nối mã Zalo trong tab Chấm công

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

- [ ] **Step 1: Thêm import**

Sửa dòng 4–8 của `src/pages/tasks/ChamCongTab.jsx`, thêm import mới sau dòng `import { loiGhiKpi } …`:

```jsx
import { dsChuaNoiMa, demVeSomLech } from '../../lib/chamCongZalo';
```

- [ ] **Step 2: Thêm state cho tin thô Zalo**

Sau dòng `const [moNap, setMoNap] = useState(false);` (dòng 74), thêm:

```jsx
  // Tin thô 30 ngày gần nhất của nhóm chấm công — chỉ để dựng ô "nối mã Zalo".
  // Tải MỀM: hỏng chỗ này không được xoá bảng chấm công đang hiển thị.
  const [zaloRows, setZaloRows] = useState([]);
  const [nvUid, setNvUid] = useState([]);      // [{id, name, uid_from}]
  const [veSomTay, setVeSomTay] = useState([]);
  const [dangNoi, setDangNoi] = useState('');  // uid đang lưu, để khoá nút
```

- [ ] **Step 3: Tải thêm ba nguồn trong `taiDuLieu`**

Trong `taiDuLieu`, ngay trước `} catch (err) {` (dòng 110), thêm:

```jsx
      // Ba nguồn của phần chấm công Zalo. Tải RIÊNG và MỀM, cùng lý do như miễn trừ:
      // chưa chạy sql/cham_cong_zalo.sql thì tab vẫn phải mở được như cũ.
      try {
        const tu = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const [{ data: z }, { data: nv }, { data: vs }] = await Promise.all([
          supabase.from('zalo_cham_cong').select('uid_from, sender_name, content, ts')
            .gte('ngay', tu).order('ts', { ascending: false }).limit(2000),
          supabase.from('nhan_vien').select('id, name, uid_from, ten_cham_cong'),
          supabase.from('ve_som_tay').select('*').eq('ky', ky).order('id'),
        ]);
        setZaloRows(z || []);
        setNvUid(nv || []);
        setVeSomTay(vs || []);
      } catch {
        setZaloRows([]); setNvUid([]); setVeSomTay([]);
      }
```

- [ ] **Step 4: Tính danh sách chưa nối**

Sau `const ngoaiLeTra = useMemo(…)` (kết thúc dòng 154), thêm:

```jsx
  const chuaNoiMa = useMemo(
    () => dsChuaNoiMa({ zaloRows, nhanVien: nvUid }), [zaloRows, nvUid]);

  // 13 người kho = có ten_cham_cong. Ai trong số đó chưa có uid_from thì mỗi ngày bị
  // ghi nghỉ oan — phải hiện thành cảnh báo, không để lẫn vào danh sách dài.
  const thieuUid = useMemo(
    () => (nvUid || []).filter(n => n.ten_cham_cong && !String(n.uid_from || '').trim()),
    [nvUid]);
```

- [ ] **Step 5: Thêm hàm ghi `uid_from`**

Sau `doiNgoaiLe` (kết thúc dòng 175), thêm:

```jsx
  // Nối một mã Zalo với một nhân viên. Ghi thẳng vào nhan_vien.uid_from.
  //
  // ⚠ Chọn nhầm là chấm công của người này chảy sang người khác MỖI NGÀY. Khác màn
  // hình nối tên Excel một điểm có lợi: ở đây sửa lại được ngay, chọn lại người khác
  // là xong.
  const noiMaZalo = useCallback(async (uid, nvId) => {
    if (!uid || !nvId) return;
    setLoi(''); setDangNoi(uid);
    try {
      const { error } = await supabase.from('nhan_vien').update({ uid_from: uid }).eq('id', nvId);
      if (error) throw error;
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    } finally {
      setDangNoi('');
    }
  }, [taiDuLieu]);
```

- [ ] **Step 6: Kiểm bằng SQL — cổng vào giai đoạn 4**

Sau khi nối xong trên giao diện, chạy:

```sql
select id, name from nhan_vien
where ten_cham_cong is not null and coalesce(uid_from,'') = '';
```

**Kỳ vọng: 0 dòng.** Còn dòng nào là còn người sẽ bị ghi nghỉ oan mỗi ngày — **không được sang Task 10.**

- [ ] **Step 7: Thêm khối giao diện**

Chèn **ngay sau dòng 311** — tức ngay sau `<div style={{ width: '100%' }}>` mở đầu `return` chính của `ChamCongTab`, trước khối thanh công cụ ở dòng 312.

⚠ Không chèn vào nhánh `if (chon) return (<BangChiTietMotNguoi …/>)` ở dòng 298-308 — đó là màn hình chi tiết một người, khối cảnh báo này thuộc màn tổng quan.

Chỉ hiện khi có việc phải làm:

```jsx
      {canEdit && (thieuUid.length > 0 || chuaNoiMa.length > 0) && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
          padding: '0.75rem 1rem', marginBottom: 12, fontSize: '0.78rem',
        }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
            Nối mã Zalo cho người chấm công
          </div>
          {thieuUid.length > 0 && (
            <div style={{ color: '#b45309', marginBottom: 8 }}>
              ⚠ {thieuUid.length} người chưa có mã Zalo — mỗi ngày họ bị ghi nghỉ:{' '}
              <b>{thieuUid.map(n => n.name).join(', ')}</b>
            </div>
          )}
          {chuaNoiMa.map(x => (
            <div key={x.uid_from} style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '4px 0', borderTop: '1px solid #fde68a',
            }}>
              <span style={{ color: '#78350f' }}>
                <b>{x.sender_name || '(không tên)'}</b> · nhắn {x.soTin} tin · gần nhất: “{x.content}”
              </span>
              <select
                defaultValue="" disabled={dangNoi === x.uid_from}
                onChange={e => { if (e.target.value) noiMaZalo(x.uid_from, e.target.value); }}
                style={{ ...oInput, width: 'auto', minWidth: 160 }}
              >
                <option value="">— đây là ai? —</option>
                {thieuUid.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 8: Chạy build và test**

```bash
npm run build
```

```bash
npm test
```

Kỳ vọng: build sạch, test PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): o noi ma Zalo trong tab Cham cong"
```

---

# GIAI ĐOẠN 4 — BẬT ĐƯỜNG GHI

### Task 10: n8n gọi hàm dựng + Schedule chốt ngày

**Files:**
- Modify: workflow n8n

⚠ **Chỉ làm khi câu SQL ở Task 9 Step 6 trả về 0 dòng.**

- [ ] **Step 1: Thêm node HTTP Request "Dựng chấm công" sau node "Ghi tin chấm công"**

Node Supabase của n8n không gọi được RPC, phải dùng HTTP Request.

- Method: `POST`
- URL: `https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/dung_cham_cong_zalo`
- Authentication: Generic → Header Auth, hoặc thêm tay hai header:
  - `apikey`: khoá `sb_secret_…` (cùng khoá n8n đang dùng cho Supabase, đổi ngày 31/07)
  - `Authorization`: `Bearer <cùng khoá đó>`
- Header: `Content-Type: application/json`
- Body (JSON):

```json
{
  "p_tu": "={{ $now.setZone('Asia/Ho_Chi_Minh').toFormat('yyyy-MM-dd') }}",
  "p_den": "={{ $now.setZone('Asia/Ho_Chi_Minh').toFormat('yyyy-MM-dd') }}"
}
```

⚠ Khoá `sb_secret` bị trả 401 nếu User-Agent giống trình duyệt (đã gặp 31/07). Để n8n dùng UA mặc định của nó, đừng đặt UA tay.

- [ ] **Step 2: Thêm Schedule Trigger 17:15 hằng ngày**

- Node mới: Schedule Trigger, Cron `15 17 * * *`, timezone `Asia/Ho_Chi_Minh`
- Nối thẳng vào **một bản sao** của node HTTP Request ở Step 1 (n8n không cho hai trigger dùng chung một nhánh nếu nhánh đó đang nối từ node khác — sao chép node là cách gọn nhất).

Vẫn cần lượt này dù mỗi tin đã gọi hàm: ngày nào không ai nhắn buổi chiều thì không có tin nào kích hoạt, mà đó đúng là ngày cần chốt nhất.

- [ ] **Step 3: Kiểm ngay trong ngày — dòng "có mặt" xuất hiện**

Sau khi có tin sáng đầu tiên (trước 17:00):

```sql
select nhan_vien_id, gio_in_sang, gio_in_chieu, di_muon_phut, nghi, nghi_text, nguon
from cham_cong where ngay = current_date order by nhan_vien_id;
```

Kỳ vọng: chỉ có dòng của người **đã nhắn**, tất cả `nghi = false`, `nguon = 'ZALO'`. **Không được có dòng `nghi = true` nào trước 17:00.**

- [ ] **Step 4: Kiểm sau 17:15 — đã chốt**

```sql
select count(*) tong, count(*) filter (where nghi) so_nghi
from cham_cong where ngay = current_date and nguon = 'ZALO';
```

Kỳ vọng: `tong` bằng số người đã nối mã (13 nếu đủ); `so_nghi` = số người thật sự vắng.

- [ ] **Step 5: Kiểm KPI đã nhận số mới**

Mở tab KPI, kỳ tháng hiện tại, xem chỉ tiêu `CHUYEN_CAN_CA_NHAN` của một người có dòng Zalo. Ghi chú tự động phải nhắc đúng số phút muộn / ngày nghỉ vừa thấy ở Step 4.

---

# GIAI ĐOẠN 5 — GIAO DIỆN CÒN LẠI

### Task 11: Cột Nguồn trong bảng chi tiết

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx:537-597`

- [ ] **Step 1: Thêm cột vào `<thead>`**

Trong `BangChiTietMotNguoi`, sau `<th style={thChiTiet.left}>Thứ</th>` (dòng 541):

```jsx
              <th style={thChiTiet.left}>Nguồn</th>
```

- [ ] **Step 2: Thêm ô vào `<tbody>`**

Sau `<td style={tdChiTiet.body}>{r.thu}</td>` (dòng 557):

```jsx
                <td style={tdChiTiet.body}>
                  {r.nguon === 'ZALO' ? (
                    <span title="Suy từ tin nhắn nhóm Zalo — chưa có số máy chấm công. Cuối tháng nạp Excel sẽ đè lên."
                          style={{ color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>
                      Zalo
                    </span>
                  ) : (
                    <span style={{ color: '#64748b' }}>Máy</span>
                  )}
                </td>
```

- [ ] **Step 3: Cập nhật tiêu đề rê chuột**

Trong hàm `tieuDeO` (dòng 40–53), trước `return`:

```jsx
  if (row.nguon === 'ZALO') {
    dong += ' — nguồn: tin nhắn nhóm Zalo, chưa có số máy chấm công';
  }
```

- [ ] **Step 4: Build và kiểm mắt**

```bash
npm run build
```

Mở tab Chấm công → chọn một người → bảng chi tiết phải có cột **Nguồn**, dòng của tháng 7 hiện `Máy`, dòng tháng này hiện `Zalo`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): cot Nguon May/Zalo trong bang chi tiet"
```

---

### Task 12: `ve_som_tay` là bảng cascade thứ NĂM

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx:1525-1549`

⚠ Quên task này thì **đổi mã một nhân viên sẽ xoá sạch về sớm chấm tay của họ** — không cảnh báo, giao diện vẫn báo "Đã cập nhật nhân viên!". Đúng loại lỗi bản bàn giao 01/08 đã bắt được một lần.

- [ ] **Step 1: Sửa chú thích từ "BỐN bảng" thành "NĂM bảng"**

Dòng 1525, đổi:

```
            // BẮT BUỘC trước khi xoá mã cũ. BỐN bảng dưới đây đều có FK `on delete cascade`
```

thành:

```
            // BẮT BUỘC trước khi xoá mã cũ. NĂM bảng dưới đây đều có FK `on delete cascade`
```

- [ ] **Step 2: Thêm dòng mô tả bảng mới vào khối chú thích**

Sau dòng mô tả `cai_tien` (dòng 1537-1538), thêm:

```
            //   ve_som_tay         (sql/cham_cong_zalo.sql)             — mất toàn bộ về sớm
            //                       chấm tay; máy chấm công đã ngừng xuất cột này nên KHÔNG
            //                       có nguồn nào dựng lại được.
```

- [ ] **Step 3: Thêm lệnh update**

Sau dòng 1549 (`if (ctErr) throw new Error('Lỗi chuyển cải tiến sang mã mới: ' + ctErr.message);`), trước `const {error:delErr} = await db.from('nhan_vien').delete()…`:

```jsx
            const {error:vsErr} = await db.from('ve_som_tay').update({nhan_vien_id: form.id}).eq('nhan_vien_id', originalId);
            if (vsErr) throw new Error('Lỗi chuyển về sớm chấm tay sang mã mới: ' + vsErr.message);
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Thử thật trên một mã KHÔNG quan trọng**

1. Tạo một nhân viên thử `zzz-test`.
2. Chèn một dòng về sớm cho họ:

```sql
insert into ve_som_tay (ky, nhan_vien_id, ngay, so_phut, ly_do, nguoi_ghi)
values ('2026-08', 'zzz-test', '2026-08-03', 20, 'thử đổi mã', 'test');
```

3. Vào Phân quyền → sửa `zzz-test` → **đổi mã** thành `zzz-test2` → lưu.
4. Kiểm:

```sql
select nhan_vien_id, so_phut from ve_som_tay where ngay = '2026-08-03';
```

Kỳ vọng: `zzz-test2 | 20`. Nếu **0 dòng** thì cascade đã nuốt mất — quay lại Step 3.

5. Dọn: xoá nhân viên `zzz-test2`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "fix(phan-quyen): chuyen ve_som_tay khi doi ma nhan vien (bang cascade thu 5)"
```

---

### Task 13: Chấm về sớm bằng tay + băng cảnh báo + nút áp lại

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

- [ ] **Step 1: Thêm hàm ghi/xoá về sớm**

Sau `noiMaZalo` (Task 9 Step 5), thêm:

```jsx
  // Chấm (soPhut > 0) hoặc bỏ chấm (soPhut = null) về sớm cho một (người, ngày).
  //
  // Ghi vào bảng ve_som_tay — NGUỒN SỰ THẬT — rồi phản chiếu sang cham_cong để KPI thấy
  // ngay. Hai lệnh rời, nhưng không có rủi ro mất dữ liệu: lệnh đầu là dữ liệu gốc, lệnh
  // sau chỉ là bản phản chiếu dựng lại được bất cứ lúc nào bằng nút "Áp lại".
  const chamVeSom = useCallback(async (nvId, ngay, soPhut, lyDo) => {
    setLoi('');
    try {
      if (soPhut == null) {
        const { error } = await supabase.from('ve_som_tay')
          .delete().eq('nhan_vien_id', nvId).eq('ngay', ngay);
        if (error) throw error;
        const { error: e2 } = await supabase.from('cham_cong')
          .update({ ve_som_phut: 0 }).eq('nhan_vien_id', nvId).eq('ngay', ngay);
        if (e2) throw e2;
      } else {
        const { error } = await supabase.from('ve_som_tay').upsert(
          { ky: ngay.slice(0, 7), nhan_vien_id: nvId, ngay, so_phut: soPhut,
            ly_do: lyDo, nguoi_ghi: me?.name || me?.id || null },
          { onConflict: 'nhan_vien_id,ngay' });
        if (error) throw error;
        const { error: e2 } = await supabase.from('cham_cong')
          .update({ ve_som_phut: soPhut }).eq('nhan_vien_id', nvId).eq('ngay', ngay);
        if (e2) throw e2;
      }
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }, [me, taiDuLieu]);

  // Dựng lại bản phản chiếu về sớm sau khi nạp Excel xoá mất.
  const apLaiVeSom = useCallback(async () => {
    setLoi('');
    try {
      const { data, error } = await supabase.rpc('ap_lai_ve_som_tay', { p_ky: ky });
      if (error) throw error;
      if (data?.loi) throw new Error(data.loi);
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }, [ky, taiDuLieu]);
```

- [ ] **Step 2: Tính số lệch**

Sau `thieuUid` (Task 9 Step 4), thêm:

```jsx
  const veSomLech = useMemo(
    () => demVeSomLech({ rows, veSomTay }), [rows, veSomTay]);
```

- [ ] **Step 3: Thêm băng cảnh báo**

Ngay dưới khối "Nối mã Zalo" của Task 9 Step 7:

```jsx
      {canEdit && (veSomLech.soLech > 0 || veSomLech.soThieuDong > 0) && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
          padding: '0.75rem 1rem', marginBottom: 12, fontSize: '0.78rem',
        }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>
            Về sớm chấm tay chưa được áp vào bảng chấm công
          </div>
          <div style={{ color: '#7f1d1d', marginBottom: 8 }}>
            {veSomLech.soLech > 0 && <>{veSomLech.soLech} dòng lệch số. </>}
            {veSomLech.soThieuDong > 0 && (
              <>{veSomLech.soThieuDong} dòng không có ngày công tương ứng — nút dưới KHÔNG
              sửa được, phải dựng lại từ Zalo hoặc nạp lại Excel. </>
            )}
            Nạp Excel xoá trọn kỳ nên bản phản chiếu về 0; dữ liệu gốc vẫn còn nguyên.
          </div>
          {veSomLech.soLech > 0 && (
            <button onClick={apLaiVeSom} style={nutLuu}>Áp lại về sớm chấm tay</button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Truyền hàm và dữ liệu xuống bảng chi tiết**

Thêm `veSomTra` ngay sau `ngoaiLeTra` (kết thúc dòng 154):

```jsx
  const veSomTra = useMemo(() => {
    const m = new Map();
    for (const v of veSomTay) m.set(`${v.nhan_vien_id}|${v.ngay}`, v);
    return m;
  }, [veSomTay]);
```

Rồi sửa lời gọi ở **dòng 301-306**, đổi từ:

```jsx
      <BangChiTietMotNguoi
        ten={nv.ten} ky={ky} nvId={chon}
        rows={rows.filter(r => r.nhan_vien_id === chon)}
        ngoaiLeTra={ngoaiLeTra} canEdit={canEdit} onDoiNgoaiLe={doiNgoaiLe}
        onBack={() => setChon(null)}
      />
```

thành:

```jsx
      <BangChiTietMotNguoi
        ten={nv.ten} ky={ky} nvId={chon}
        rows={rows.filter(r => r.nhan_vien_id === chon)}
        ngoaiLeTra={ngoaiLeTra} canEdit={canEdit} onDoiNgoaiLe={doiNgoaiLe}
        veSomTra={veSomTra} onChamVeSom={chamVeSom}
        onBack={() => setChon(null)}
      />
```

- [ ] **Step 5: Nhận prop và thêm nút trong bảng chi tiết**

Đổi chữ ký `BangChiTietMotNguoi` (dòng 509):

```jsx
function BangChiTietMotNguoi({ ten, ky, nvId, rows, ngoaiLeTra, veSomTra, canEdit, onDoiNgoaiLe, onChamVeSom, onBack }) {
```

Thêm state cho modal, cạnh `modalNgay`:

```jsx
  const [vsNgay, setVsNgay] = useState(null);
  const [vsPhut, setVsPhut] = useState('');
  const [vsLyDo, setVsLyDo] = useState('');
  const veSomCua = ngay => veSomTra?.get(`${nvId}|${ngay}`);

  const moVeSom = (ngay) => {
    const cu = veSomCua(ngay);
    setVsPhut(cu ? String(cu.so_phut) : '');
    setVsLyDo(cu?.ly_do || '');
    setVsNgay(ngay);
  };
  const luuVeSom = () => {
    const p = Number(vsPhut);
    const l = vsLyDo.trim();
    if (!Number.isFinite(p) || p <= 0 || !l) return;
    onChamVeSom(nvId, vsNgay, Math.round(p), l);
    setVsNgay(null);
  };
```

Đổi ô "Về sớm" (dòng 567-569) thành ô có nút:

```jsx
                <td style={{ ...tdChiTiet.body, textAlign: 'right', color: r.ve_som_phut > 0 ? '#b91c1c' : undefined, fontWeight: r.ve_som_phut > 0 ? 700 : 400 }}>
                  {r.ve_som_phut > 0 ? `${r.ve_som_phut} phút` : '—'}
                  {veSomCua(r.ngay) && (
                    <div title={`Chấm tay bởi ${veSomCua(r.ngay).nguoi_ghi || '—'}: ${veSomCua(r.ngay).ly_do}`}
                         style={{ fontSize: '0.66rem', color: '#2563eb', fontWeight: 600 }}>
                      chấm tay
                    </div>
                  )}
                  {canEdit && (
                    <div>
                      <button onClick={() => moVeSom(r.ngay)} style={nutDacBiet}>
                        {veSomCua(r.ngay) ? 'Sửa' : 'Chấm'}
                      </button>
                      {veSomCua(r.ngay) && (
                        <button onClick={() => onChamVeSom(nvId, r.ngay, null, null)} style={nutBoDacBiet}>
                          Bỏ
                        </button>
                      )}
                    </div>
                  )}
                </td>
```

- [ ] **Step 6: Thêm modal chấm về sớm**

Sau modal "Đánh dấu đặc biệt" (kết thúc dòng 624), thêm:

```jsx
      {vsNgay && (
        <div onClick={() => setVsNgay(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>
              Chấm về sớm — {ngayGon(vsNgay)}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 10 }}>
              Máy chấm công đã ngừng xuất cột “Về sớm”, nên đây là nguồn duy nhất. Số phút này
              TRỪ điểm chuyên cần bộ phận. Bắt buộc nhập lý do.
            </div>
            <input
              type="number" min="1" value={vsPhut} onChange={e => setVsPhut(e.target.value)}
              placeholder="Số phút về sớm" style={oInput} autoFocus
            />
            <textarea
              value={vsLyDo} onChange={e => setVsLyDo(e.target.value)} rows={3}
              placeholder="VD: xin về sớm đón con, có việc gia đình…"
              style={{ ...oInput, resize: 'vertical', marginTop: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setVsNgay(null)} style={nutHuy}>Huỷ</button>
              <button onClick={luuVeSom}
                      disabled={!vsLyDo.trim() || !(Number(vsPhut) > 0)}
                      style={nutLuu}>Lưu</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Build và test**

```bash
npm run build
```

```bash
npm test
```

- [ ] **Step 8: Thử thật trên một ngày**

1. Vào tab Chấm công → chọn một người → bấm **Chấm** ở cột Về sớm → nhập 30 phút + lý do → Lưu.
2. Kiểm số hiện `30 phút` kèm nhãn `chấm tay`.
3. Mở tab KPI → chỉ tiêu chuyên cần **bộ phận** của nhóm người đó phải đổi (chuyên cần **cá nhân** không tính về sớm nên không đổi).
4. Bấm **Bỏ** → số về `—`.

- [ ] **Step 9: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): cham ve som bang tay + bang canh bao lech + nut ap lai"
```

---

### Task 14: Nút "Dựng lại từ Zalo"

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

- [ ] **Step 1: Thêm state và hàm**

Sau `apLaiVeSom`:

```jsx
  const [moDungLai, setMoDungLai] = useState(false);
  const [dlTu, setDlTu] = useState('');
  const [dlDen, setDlDen] = useState('');
  const [dlKq, setDlKq] = useState('');

  // Dựng lại dòng chấm công từ tin thô Zalo cho một khoảng ngày.
  //
  // Dùng khi: nạp Excel giữa tháng xoá mất dòng Zalo của những ngày sau đó, hoặc n8n
  // chết một hôm. Khoảng ngày KHÔNG có tin thô thì hàm không sinh dòng nào — đã khoá
  // bằng test, nên bấm nhầm cho tháng cũ cũng không biến cả tháng thành nghỉ.
  const dungLaiTuZalo = useCallback(async () => {
    setLoi(''); setDlKq('');
    try {
      const { data, error } = await supabase.rpc('dung_cham_cong_zalo', { p_tu: dlTu, p_den: dlDen });
      if (error) throw error;
      if (data?.loi) throw new Error(data.loi);
      setDlKq(`Đã ghi ${data?.so_dong_ghi ?? 0} dòng.`);
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }, [dlTu, dlDen, taiDuLieu]);
```

- [ ] **Step 2: Thêm nút cạnh nút "Nạp từ Excel"**

Chèn **ngay sau dòng 324** — tức ngay sau khối `{canEdit && (<button onClick={() => setMoNap(true)} …>Nạp từ Excel</button>)}` và trước khối `Phân nhóm` ở dòng 325:

```jsx
            {canEdit && (
              <button onClick={() => setMoDungLai(true)} style={nutDacBiet}>
                Dựng lại từ Zalo
              </button>
            )}
```

- [ ] **Step 3: Thêm modal**

```jsx
      {moDungLai && (
        <div onClick={() => setMoDungLai(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>
              Dựng lại chấm công từ tin nhắn Zalo
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 10 }}>
              Tính lại từ tin thô cho khoảng ngày dưới đây. Ngày nào đã có số máy chấm công
              (nguồn “Máy”) thì KHÔNG bị đụng tới.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={dlTu} onChange={e => setDlTu(e.target.value)} style={oInput} />
              <input type="date" value={dlDen} onChange={e => setDlDen(e.target.value)} style={oInput} />
            </div>
            {dlKq && <div style={{ fontSize: '0.76rem', color: '#15803d', marginTop: 8 }}>{dlKq}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setMoDungLai(false)} style={nutHuy}>Đóng</button>
              <button onClick={dungLaiTuZalo} disabled={!dlTu || !dlDen} style={nutLuu}>Dựng lại</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Thử — dựng lại một khoảng KHÔNG có tin thô**

Mở modal, chọn `2026-07-01` → `2026-07-31`, bấm Dựng lại.

Kỳ vọng: `Đã ghi 0 dòng.` và bảng tháng 7 **không đổi một dòng nào**. Nếu số dòng > 0 thì van an toàn hỏng — dừng lại.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): nut dung lai cham cong tu tin tho Zalo theo khoang ngay"
```

---

# GIAI ĐOẠN 6 — NGHIỆM THU

### Task 15: Bảo mật và không hỏng luồng cũ

**Files:** không sửa mã, chỉ đo.

- [ ] **Step 1: Gọi skill kiểm tra bảo mật**

Dùng skill `kiem-tra-bao-mat-du-lieu` và làm đủ phần kiểm chứng trong đó.

- [ ] **Step 2: Đo bằng CHÍNH khoá công khai**

Lấy khoá `sb_publishable_…` trong `src/lib/supabase.js`. Chạy từng lệnh, thay `<KEY>`:

```bash
curl -s "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/zalo_cham_cong?select=*&limit=5" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>"
```

Kỳ vọng: `[]`.

```bash
curl -s "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/ve_som_tay?select=*&limit=5" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>"
```

Kỳ vọng: `[]`.

```bash
curl -s -X POST "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/dung_cham_cong_zalo" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" -d '{"p_tu":"1900-01-01","p_den":"1900-01-02"}'
```

Kỳ vọng: `{"code":"42501", … "permission denied for function dung_cham_cong_zalo"}`.

```bash
curl -s -X POST "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/ap_lai_ve_som_tay" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" -d '{"p_ky":"1900-01"}'
```

Kỳ vọng: `{"code":"42501", …}`.

- [ ] **Step 3: Thử đường GHI bằng khoá công khai, trên DÒNG CÓ THẬT**

```bash
curl -s -X PATCH "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/zalo_cham_cong?id=eq.1" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"content":"BI SUA"}'
```

Kỳ vọng: `[]` (không sửa được dòng nào).

```bash
curl -s -X DELETE "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/zalo_cham_cong?id=eq.1" -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" -H "Prefer: return=representation"
```

Kỳ vọng: `[]`.

- [ ] **Step 4: Đếm lại sau các phép thử — dữ liệu phải nguyên vẹn**

```sql
select count(*) as tin_tho from zalo_cham_cong;
select count(*) filter (where content = 'BI SUA') as bi_sua from zalo_cham_cong;
select ky, count(*) from cham_cong group by ky order by ky;
```

Kỳ vọng: `bi_sua = 0`; số dòng `cham_cong` của kỳ 2026-07 vẫn là 388.

- [ ] **Step 5: Kiểm KPI Zalo không nhiễm tin chấm công**

```sql
select count(*) from zalo_messages      where thread_id = '<CC_THREAD>';
select count(*) from zalo_conversations where thread_id = '<CC_THREAD>';
```

Kỳ vọng: cả hai `0`.

- [ ] **Step 6: Kiểm ba luồng cũ vẫn chạy**

1. **Nạp Excel**: mở tab Chấm công → Nạp từ Excel → chọn tệp tháng 7 → **dừng ở bảng xem trước, KHÔNG bấm xác nhận**. Bảng phải hiện đủ 13 người và chênh lệch điểm.
2. **Đổi mã nhân viên**: đã thử ở Task 12 Step 5.
3. **Miễn trừ có giải trình**: đánh dấu đặc biệt một ngày rồi bỏ đánh dấu — phải chạy như cũ.

- [ ] **Step 7: Chạy toàn bộ test và build**

```bash
npm test
```

```bash
npm run build
```

Kỳ vọng: PASS và build sạch.

- [ ] **Step 8: Commit tài liệu bàn giao**

Viết `BAN-GIAO-CHAM-CONG-ZALO-<ngày>.md` ghi rõ:
- Mã nhóm chấm công đã dùng
- 13/13 người đã nối mã hay chưa
- Kết quả từng phép đo bảo mật ở Step 2–4
- **Phần chưa kiểm chứng được** — nói thẳng, đừng để chủ app tin nhầm là đã an toàn

```bash
git add BAN-GIAO-CHAM-CONG-ZALO-*.md
git commit -m "docs(cham-cong): ban giao cham cong Zalo"
```

---

## Những chỗ dễ sai nhất — đọc trước khi bắt đầu

| Chỗ | Sai thế nào | Chặn ở đâu |
|---|---|---|
| Bỏ mệnh đề `where cham_cong.nguon = 'ZALO'` | Số Zalo đè lên số máy vân tay, không ai biết | Task 5 Step 8 |
| Van an toàn đặt theo NGÀY thay vì theo BUỔI | n8n chết lúc trưa → cả 13 người mất 0,5 ngày | Task 5 Step 9 |
| Đưa `p_chot` thành tham số | Tin tăng ca lúc 18:00 xoá sạch cờ nghỉ vừa chốt | Task 5 Step 7 |
| Sang giai đoạn 4 khi chưa nối đủ 13 mã | 8 người bị ghi nghỉ mỗi ngày | Task 9 Step 6 |
| Quên `ve_som_tay` trong luồng đổi mã | Đổi mã = xoá sạch về sớm chấm tay | Task 12 Step 5 |
| Nối nhầm dây nhánh false của node If mới | Toàn bộ KPI Zalo ngừng thu | Task 7 Step 6 |
| So tên bằng chuỗi con thay vì theo từ | 'ha' khớp 'khach', 'nhanh' | Task 2 Step 4 |
| Quét cả 13 tên thay vì tên người gửi | Tin xin nghỉ của Thiện chứa 'nguyên' → ghi nhầm có mặt | Task 2 Step 4 |
