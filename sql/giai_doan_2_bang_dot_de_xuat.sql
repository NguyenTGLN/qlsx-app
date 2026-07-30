-- =====================================================================
-- GIAI ĐOẠN 2 — BẢNG ĐỢT ĐỀ XUẤT — 29/07/2026
-- =====================================================================
-- Chỉ THÊM: bảng mới + cột mới cho phép NULL. Không sửa, không xoá gì.
-- Mã đang chạy trên web bỏ qua cột lạ nên không vỡ.
--
-- CHƯA thêm khoá ngoại batch_id: 139 dòng hiện có mang batch_id ngẫu nhiên
-- (default gen_random_uuid()) không trỏ tới đâu, thêm bây giờ sẽ lỗi kiểm tra.
-- Để giai đoạn 4, sau khi dọn xong dòng cũ.
--
-- Spec: docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md
-- =====================================================================


-- ---------------------------------------------------------------------
-- PHẦN 0 — KIỂM TRA TRƯỚC (chỉ đọc, chạy lúc nào cũng được)
-- ---------------------------------------------------------------------
-- Ghi lại con số này để đối chiếu ở Phần 4. Kỳ vọng 139.
select count(*) as so_dong_de_xuat_truoc_khi_chay from public.purchase_proposals;


-- ---------------------------------------------------------------------
-- PHẦN 1 — BẢNG ĐỢT
-- ---------------------------------------------------------------------
create table if not exists public.proposal_batches (
  id          uuid primary key default gen_random_uuid(),
  ma_dot      text not null unique,
  ngay_chay   date not null,
  trang_thai  text not null default 'NHAP'
              check (trang_thai in ('NHAP', 'DA_GUI', 'DONG')),
  nguoi_tao   text,
  nguoi_gui   text,
  ngay_gui    timestamptz,
  ngay_dong   timestamptz,
  ghi_chu     text,
  created_at  timestamptz not null default now()
);

-- Chỉ được tồn tại MỘT đợt NHÁP tại một thời điểm. Ép ở tầng cơ sở dữ liệu chứ
-- không dựa vào giao diện — hai người bấm "Chạy đề xuất" cùng lúc vẫn không thể
-- tạo ra hai bản nháp chọi nhau.
create unique index if not exists proposal_batches_one_draft
  on public.proposal_batches (trang_thai) where trang_thai = 'NHAP';

create index if not exists proposal_batches_ngay_chay
  on public.proposal_batches (ngay_chay desc);


-- ---------------------------------------------------------------------
-- PHẦN 2 — BẢO MẬT
-- ---------------------------------------------------------------------
-- Bảng mới ⇒ chỉ người ĐÃ ĐĂNG NHẬP. Tuyệt đối không cấp cho public/anon.
-- Ngưỡng phải giữ: người ngoài cầm khoá công khai không đọc, không sửa, không
-- xoá được bất kỳ dòng nào.
alter table public.proposal_batches enable row level security;

revoke all on public.proposal_batches from anon;

drop policy if exists proposal_batches_authenticated on public.proposal_batches;
create policy proposal_batches_authenticated
  on public.proposal_batches for all to authenticated
  using (true) with check (true);


-- ---------------------------------------------------------------------
-- PHẦN 3 — CỘT THÊM VÀO purchase_proposals (đều cho phép NULL)
-- ---------------------------------------------------------------------
-- Ba cột lưu vết tính toán, để tra ngược được số trên màn hình mà không cần
-- chạy SQL: calculated_qty = snapshot_gross − snapshot_ton − snapshot_dang_ve
alter table public.purchase_proposals
  add column if not exists snapshot_gross   numeric,
  add column if not exists snapshot_ton     numeric,
  add column if not exists snapshot_dang_ve numeric;

comment on column public.purchase_proposals.snapshot_gross
  is 'Tổng nhu cầu trước khi trừ, tại thời điểm chạy đợt';
comment on column public.purchase_proposals.snapshot_ton
  is 'Tồn kho tại thời điểm chạy đợt (đã làm tròn 3 số lẻ)';
comment on column public.purchase_proposals.snapshot_dang_ve
  is 'Hàng đang về từ đợt trước, tại thời điểm chạy đợt';


-- ---------------------------------------------------------------------
-- PHẦN 4 — KIỂM CHỨNG (chỉ đọc)
-- ---------------------------------------------------------------------
-- 4a. Bảng đã có, RLS bật, đúng 1 policy
select c.relname as bang, c.relrowsecurity as rls_bat,
       (select count(*) from pg_policies p where p.tablename = c.relname) as so_policy
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'proposal_batches';
-- Kỳ vọng: rls_bat = true, so_policy = 1

-- 4b. Ba cột mới đã có và đều cho phép NULL
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'purchase_proposals'
  and column_name in ('snapshot_gross', 'snapshot_ton', 'snapshot_dang_ve')
order by column_name;
-- Kỳ vọng: 3 dòng, is_nullable = YES cả ba

-- 4c. purchase_proposals KHÔNG mất dòng nào — phải khớp con số ở Phần 0
select count(*) as so_dong_de_xuat_sau_khi_chay from public.purchase_proposals;

-- 4d. Chỉ mục chặn 2 nháp đã có
select indexname from pg_indexes
where tablename = 'proposal_batches' and indexname = 'proposal_batches_one_draft';


-- ---------------------------------------------------------------------
-- PHẦN 5 — THỬ CHỈ MỤC CHẶN 2 NHÁP (tuỳ chọn, tự dọn)
-- ---------------------------------------------------------------------
-- insert into public.proposal_batches (ma_dot, ngay_chay) values ('DX-TEST-01', current_date);
-- insert into public.proposal_batches (ma_dot, ngay_chay) values ('DX-TEST-02', current_date);
--   ⇒ lệnh thứ hai PHẢI lỗi: duplicate key value violates unique constraint
--      "proposal_batches_one_draft"
-- delete from public.proposal_batches where ma_dot like 'DX-TEST-%';


-- ---------------------------------------------------------------------
-- PHẦN 6 — HOÀN TÁC (dán chạy được ngay)
-- ---------------------------------------------------------------------
-- Xoá sạch mọi thứ giai đoạn 2 thêm vào, đưa cơ sở dữ liệu về đúng trước khi chạy.
-- An toàn: purchase_proposals chỉ mất 3 cột vừa thêm, không mất dòng nào.

-- drop table if exists public.proposal_batches cascade;
--
-- alter table public.purchase_proposals
--   drop column if exists snapshot_gross,
--   drop column if exists snapshot_ton,
--   drop column if exists snapshot_dang_ve;
