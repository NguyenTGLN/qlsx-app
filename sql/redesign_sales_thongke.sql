-- ============================================================
-- BỎ so_luong_ban. Nguồn duy nhất = luu_xuat → thong_ke_ban_hang (gom tháng).
-- Căn cứ tính = TRUNG BÌNH 3 THÁNG gần nhất (đọc bảng gom sẵn → nhanh).
-- Chạy trong Supabase SQL Editor.
-- ============================================================

-- 1) GỠ chuỗi trigger cũ liên quan so_luong_ban
DROP TRIGGER IF EXISTS trg_sync_luu_xuat_to_so_luong_ban ON public.luu_xuat;   -- luu_xuat → so_luong_ban
DROP TRIGGER IF EXISTS trg_sync_to_thong_ke ON public.so_luong_ban;            -- so_luong_ban → thong_ke
-- (giữ trg_auto_set_loai_xuat BEFORE INSERT trên luu_xuat để set type)

-- 2) Index phục vụ gom doanh số nhanh trên luu_xuat (dù lịch sử lớn)
CREATE INDEX IF NOT EXISTS idx_luu_xuat_type_ngay ON public.luu_xuat(type, ngay_xuat);

-- 3) DỰNG LẠI thong_ke_ban_hang SẠCH trực tiếp từ luu_xuat (chỉ type='XB')
TRUNCATE public.thong_ke_ban_hang;
INSERT INTO public.thong_ke_ban_hang (month, ma_san_pham, ten_san_pham, so_luong)
SELECT
  TO_CHAR(ngay_xuat, 'YYYY-MM') AS month,
  ma_san_pham,
  MAX(ten_san_pham) AS ten_san_pham,
  SUM(CAST(so_luong AS NUMERIC)) AS so_luong
FROM public.luu_xuat
WHERE ngay_xuat IS NOT NULL
  AND ma_san_pham IS NOT NULL
  AND type = 'XB'
GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), ma_san_pham
ON CONFLICT (month, ma_san_pham) DO UPDATE
  SET so_luong = EXCLUDED.so_luong, ten_san_pham = EXCLUDED.ten_san_pham, updated_at = now();

-- 4) Trigger MỚI: luu_xuat → thong_ke_ban_hang (chỉ cộng khi type='XB')
CREATE OR REPLACE FUNCTION public.sync_luuxuat_to_thongke()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ngay_xuat IS NOT NULL AND NEW.ma_san_pham IS NOT NULL AND NEW.type = 'XB' THEN
    INSERT INTO public.thong_ke_ban_hang (month, ma_san_pham, ten_san_pham, so_luong)
    VALUES (TO_CHAR(NEW.ngay_xuat,'YYYY-MM'), NEW.ma_san_pham, NEW.ten_san_pham, CAST(NEW.so_luong AS NUMERIC))
    ON CONFLICT (month, ma_san_pham) DO UPDATE
      SET so_luong = thong_ke_ban_hang.so_luong + EXCLUDED.so_luong, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_luuxuat_to_thongke ON public.luu_xuat;
CREATE TRIGGER trg_sync_luuxuat_to_thongke
  AFTER INSERT ON public.luu_xuat
  FOR EACH ROW EXECUTE FUNCTION public.sync_luuxuat_to_thongke();

-- 5) View doanh số đọc thong_ke (3 tháng gần nhất gồm tháng hiện tại) — NHANH
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT ma_san_pham, SUM(so_luong) AS total_sales
FROM public.thong_ke_ban_hang
WHERE month >= TO_CHAR(date_trunc('month', CURRENT_DATE) - INTERVAL '2 months', 'YYYY-MM')
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;

-- 6) (TÙY CHỌN) Khi đã chắc không còn gì đọc so_luong_ban, bỏ comment để xoá hẳn:
-- DROP TABLE IF EXISTS public.so_luong_ban CASCADE;

-- KIỂM TRA:
-- SELECT total_sales FROM sales_90d_summary WHERE ma_san_pham='F-CB-BNC';  -- ~ doanh số 3 tháng thật
-- SELECT month, so_luong FROM thong_ke_ban_hang WHERE ma_san_pham='F-CB-BNC' ORDER BY month;
