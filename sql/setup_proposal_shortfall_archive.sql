-- ⛔ ĐỪNG CHẠY LẠI TỆP NÀY. Bảng đã tồn tại trên production.
-- Phần GRANT/POLICY cuối tệp thuộc thời kỳ app còn dùng anon key: chạy lại sẽ
-- cấp lại quyền cho anon và HOÀN TÁC đợt siết bảo mật 29/07/2026 (bảng archive
-- hiện chỉ còn authenticated, policy chi_nguoi_dang_nhap). Đã đo bằng khoá công
-- khai: 42501 permission denied — phải giữ nguyên như vậy.
--
-- Lưu trữ đề xuất đã đóng (khi về thiếu, chọn "Đóng & tạo mới") — để truy xuất khi cần.
-- (Lịch sử: từng chạy 1 lần trên Supabase SQL editor trước khi deploy app.)
CREATE TABLE IF NOT EXISTS public.purchase_proposals_archive (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orig_id            UUID,
  item_code          TEXT,
  item_name          TEXT,
  unit               TEXT,
  dlk_code           TEXT,
  calculated_qty     NUMERIC,
  actual_qty         NUMERIC,
  bom_qty            NUMERIC,
  retail_qty         NUMERIC,
  received_snapshot  NUMERIC,
  tien_do            TEXT,
  trang_thai         TEXT,
  source             TEXT,
  note               TEXT,
  ngay_de_xuat       DATE,
  ngay_du_kien       DATE,
  batch_id           UUID,
  created_at         TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  archived_by        TEXT,
  archive_reason     TEXT,
  shortfall_dlk_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppa_item_code   ON public.purchase_proposals_archive(item_code);
CREATE INDEX IF NOT EXISTS idx_ppa_dlk_code    ON public.purchase_proposals_archive(dlk_code);
CREATE INDEX IF NOT EXISTS idx_ppa_archived_at ON public.purchase_proposals_archive(archived_at);

ALTER TABLE public.purchase_proposals_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppa_all ON public.purchase_proposals_archive;
CREATE POLICY ppa_all ON public.purchase_proposals_archive FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.purchase_proposals_archive TO anon, authenticated;
