-- ============================================================
-- THÊM CỘT "type" (LOẠI XUẤT) + BACKFILL DỮ LIỆU CŨ
-- ============================================================
-- Loại xuất:
--   XB   = Xuất đơn hàng bán (khách + đại lý/CN + bảo hành)  -> TÍNH DEMAND
--   XDG  = Xuất đóng gói                                      -> không tính
--   XBS  = Xuất bổ sung sản xuất (cấp linh kiện cho chuyền)   -> không tính
--   KHAC = Chuyển kho / điều chỉnh / lỗi / hủy                -> không tính
--
-- Cách chạy: Supabase Dashboard -> SQL Editor -> Paste & Run TỪNG PHẦN.
-- ============================================================

-- ------------------------------------------------------------
-- PHẦN 1: Thêm cột type (an toàn, chỉ thêm cột, mặc định NULL)
-- ------------------------------------------------------------
ALTER TABLE public.luu_xuat      ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.so_luong_ban  ADD COLUMN IF NOT EXISTS type TEXT;

-- Index để lọc demand nhanh
CREATE INDEX IF NOT EXISTS idx_slb_type ON public.so_luong_ban(type);
CREATE INDEX IF NOT EXISTS idx_lx_type  ON public.luu_xuat(type);

-- ------------------------------------------------------------
-- PHẦN 2: Sửa trigger để cột type chạy qua so_luong_ban
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_luu_xuat_to_so_luong_ban()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO so_luong_ban (ngay_xuat, ma_san_pham, ten_san_pham, so_luong, ma_don_hang, type)
  VALUES (NEW.ngay_xuat, NEW.ma_san_pham, NEW.ten_san_pham, NEW.so_luong, NEW.ma_don_hang, NEW.type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- (Trigger trg_sync_luu_xuat_to_so_luong_ban đã trỏ tới function này, không cần tạo lại)

-- ------------------------------------------------------------
-- PHẦN 3: BACKFILL type cho dữ liệu cũ theo ma_don_hang
-- Thứ tự CASE quan trọng: bắt KHAC/đóng gói TRƯỚC khi bắt mã bán.
-- ------------------------------------------------------------
-- Hàm phân loại dùng chung (tạo tạm để 2 bảng dùng cùng quy tắc)
CREATE OR REPLACE FUNCTION phan_loai_xuat(p TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN 'KHAC';
  END IF;

  -- 1) Bảo hành -> XB (theo yêu cầu)
  IF p ILIKE '%bảo hành%' OR p ~* '^(LKBH|BHKLE|BVNI|BH)' THEN
    RETURN 'XB';
  END IF;

  -- 2) Đóng gói -> XDG
  IF p ILIKE '%đóng hàng%' OR p ILIKE '%đóng gói%' THEN
    RETURN 'XDG';
  END IF;

  -- 3) Bổ sung sản xuất -> XBS (đặt TRƯỚC KHAC; lịch sử ghi text "Xuất BS SX"...)
  IF p ILIKE '%bs sx%' OR p ILIKE '%bs sản%' OR p ILIKE '%bs máy%'
     OR p ILIKE '%bổ sung%' OR p ILIKE '%xuất sản xuất%' OR p ILIKE '%xuất sx%' THEN
    RETURN 'XBS';
  END IF;

  -- 4) Chuyển kho / điều chỉnh / lỗi / hủy / gia công / nội bộ / expo -> KHAC
  IF p ILIKE '%chuyển kho%' OR p ILIKE '%điều chỉnh%' OR p ILIKE '%kiểm kê%'
     OR p ILIKE '%lỗi%'     OR p ILIKE '%hủy%'       OR p ILIKE '%chuyển%'
     OR p ILIKE '%gia công%' OR p ILIKE '%phiếu kho%' OR p ILIKE '%kho chính%'
     OR p ~* '^(CK|CBEXPO|CBQUA|XCB|XSD|XKN|CKSRHCM|CKHCM)' THEN
    RETURN 'KHAC';
  END IF;

  -- 5) Mã liền (chữ+số, không dấu cách) = đơn bán (VNA/VNI/VNW/đại lý...) -> XB
  IF p ~ '^[A-Za-z0-9*]+$' THEN
    RETURN 'XB';
  END IF;

  -- 6) Còn lại (mô tả tiếng Việt tự do) -> KHAC
  RETURN 'KHAC';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Áp dụng cho cả 2 bảng (chỉ ghi vào dòng chưa có type)
UPDATE public.luu_xuat     SET type = phan_loai_xuat(ma_don_hang) WHERE type IS NULL;
UPDATE public.so_luong_ban SET type = phan_loai_xuat(ma_don_hang) WHERE type IS NULL;

-- ------------------------------------------------------------
-- PHẦN 4: KIỂM TRA phân bố sau backfill (chạy để soát lại)
-- ------------------------------------------------------------
-- SELECT type, COUNT(*) FROM public.so_luong_ban GROUP BY type ORDER BY 2 DESC;
-- Soi vài mẫu mỗi loại:
-- SELECT type, ma_don_hang, COUNT(*) FROM public.so_luong_ban
--   GROUP BY type, ma_don_hang ORDER BY type, 3 DESC LIMIT 60;
