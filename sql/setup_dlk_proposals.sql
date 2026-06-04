-- ============================================================
-- DLK PROPOSAL SYSTEM: Mở rộng purchase_proposals + du_lieu_nhap
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1) Thêm các cột mới vào purchase_proposals
ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS dlk_code    TEXT,          -- DLK-020626-01 (unique per SKU)
  ADD COLUMN IF NOT EXISTS ngay_de_xuat DATE,          -- ngày tạo đề xuất
  ADD COLUMN IF NOT EXISTS ngay_du_kien DATE,          -- ngày dự kiến về kho (nhập tay)
  ADD COLUMN IF NOT EXISTS tien_do     TEXT DEFAULT 'Mới',    -- Mới/Chờ duyệt/Đã đặt/Đang vận chuyển/Đã về kho
  ADD COLUMN IF NOT EXISTS trang_thai  TEXT DEFAULT 'Mới',    -- Mới/Đã đặt mua/Chờ xác nhận/Đã về kho đủ/Đã về kho thiếu/Hủy
  ADD COLUMN IF NOT EXISTS unit        TEXT;           -- ĐVT

-- 2) Index để tìm DLK nhanh
CREATE INDEX IF NOT EXISTS idx_pp_dlk_code ON public.purchase_proposals(dlk_code);
CREATE INDEX IF NOT EXISTS idx_pp_item_code ON public.purchase_proposals(item_code);
CREATE INDEX IF NOT EXISTS idx_pp_trang_thai ON public.purchase_proposals(trang_thai);

-- 3) Thêm dlk_code vào du_lieu_nhap (liên kết nhập kho với đề xuất)
ALTER TABLE public.du_lieu_nhap
  ADD COLUMN IF NOT EXISTS dlk_code TEXT;

CREATE INDEX IF NOT EXISTS idx_dln_dlk_code ON public.du_lieu_nhap(dlk_code);

-- 4) Xóa dữ liệu cũ (purchase_proposals cũ không có dlk_code, dùng schema mới)
TRUNCATE public.purchase_proposals;

-- KIỂM TRA:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'purchase_proposals' ORDER BY ordinal_position;
