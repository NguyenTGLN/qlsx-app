-- Thêm cột "Mã đơn hàng nhập" vào bảng du_lieu_nhap
-- Dùng cho phiếu "Nhập mới" và "Nhập khác" (nguồn tự do, không gắn DLK đề xuất).
ALTER TABLE public.du_lieu_nhap
  ADD COLUMN IF NOT EXISTS ma_don_hang_nhap TEXT;

CREATE INDEX IF NOT EXISTS idx_dln_ma_don_hang_nhap ON public.du_lieu_nhap(ma_don_hang_nhap);
