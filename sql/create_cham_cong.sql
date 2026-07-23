-- ════════════════════════════════════════════════════════════════════════════
-- BẢNG CHẤM CÔNG — nguồn dữ liệu cho 2 chỉ tiêu KPI chuyên cần.
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Mỗi dòng = MỘT NGƯỜI trong MỘT NGÀY, đúng như file Excel máy chấm công xuất ra.
-- App không ghi vào bảng này: dữ liệu vào bằng script import (scripts/import-cham-cong.mjs)
-- sinh SQL để người soát rồi dán chạy — cùng nếp với đợt import KPI.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create table if not exists cham_cong (
  id            bigserial primary key,
  ky            text not null,                    -- '2026-07', suy từ `ngay` nhưng lưu sẵn cho dễ lọc
  nhan_vien_id  text not null references nhan_vien(id) on delete cascade,
  ngay          date not null,
  thu           text,                             -- 'T2'…'CN', giữ nguyên như file gốc để đối chiếu
  gio_in_sang   text,
  gio_in_chieu  text,
  gio_out       text,
  tang_ca_phut  int,
  di_muon_phut  int not null default 0,
  ve_som_phut   int not null default 0,
  nghi          boolean not null default false,
  -- Cờ dữ liệu đáng ngờ, do script import gắn. Không phải bình luận cho vui: dòng có cờ này
  -- bị luật KPI BỎ QUA phần về sớm, nên phải nhìn thấy được để soát chứ không lặng lẽ trừ điểm.
  nghi_van      text,
  created_at    timestamptz default now(),

  -- Chốt chặn quan trọng nhất của bảng này: import lại tháng phải GHI ĐÈ, không nhân đôi.
  -- Thiếu ràng buộc này thì chạy script hai lần là mỗi người có hai dòng mỗi ngày, số phút
  -- đi muộn nhân đôi, và KPI chuyên cần của cả bộ phận sai mà không ai biết vì sao.
  constraint cham_cong_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);

create index if not exists cham_cong_ky_idx on cham_cong (ky, nhan_vien_id);

-- ── RLS: đọc công khai (KPI vốn công khai), ghi chỉ ADMIN ────────────────────
-- Cùng lý do như 2 bảng KPI: chấm công quyết định điểm chuyên cần, mà điểm chuyên cần gắn
-- thẳng với lương thưởng. Chặn ở giao diện thôi thì người biết gọi API vẫn sửa được.
alter table public.cham_cong enable row level security;

-- Policy RLS là phép OR — sót một cái `using(true)` cho ghi là 4 policy dưới đây thành vô
-- nghĩa. Và `create policy` không có "if not exists" nên phải drop trước để chạy lại được.
drop policy if exists auth_all on public.cham_cong;
drop policy if exists cc_sel   on public.cham_cong;
drop policy if exists cc_ins   on public.cham_cong;
drop policy if exists cc_upd   on public.cham_cong;
drop policy if exists cc_del   on public.cham_cong;

create policy cc_sel on public.cham_cong
  for select to authenticated using (true);

create policy cc_ins on public.cham_cong
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy cc_upd on public.cham_cong
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy cc_del on public.cham_cong
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ⚠ NHẮC LẠI CẢNH BÁO Ở rls_kpi_admin_only.sql: sql/security_3_rls_lockdown.sql quét MỌI
--   bảng public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại file đó sau file
--   này sẽ mở toang quyền ghi chấm công → phải chạy lại file này ngay sau.
--   Kiểm chứng: select policyname from pg_policies where tablename = 'cham_cong';
--   Kỳ vọng 4 dòng cc_*, TUYỆT ĐỐI không có dòng `auth_all`.

-- KIỂM TRA
select policyname, cmd from pg_policies where tablename = 'cham_cong' order by policyname;
