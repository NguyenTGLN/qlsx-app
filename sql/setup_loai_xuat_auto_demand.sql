-- ============================================================
-- BƯỚC TIẾP: (1) Tự gắn type khi insert  (2) View demand lọc XB
-- Chạy SAU khi đã chạy setup_loai_xuat_type.sql
-- Supabase Dashboard -> SQL Editor -> Paste & Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) TRIGGER BEFORE INSERT: tự phân loại nếu app không gắn type
--    (import Excel mang mã VNA/VNI... -> tự ra XB)
--    App ProductionOrderTab gắn type tường minh -> trigger tôn trọng, không ghi đè.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_set_loai_xuat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IS NULL OR btrim(NEW.type) = '' THEN
    NEW.type := phan_loai_xuat(NEW.ma_don_hang);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_set_loai_xuat ON public.luu_xuat;
CREATE TRIGGER trg_auto_set_loai_xuat
  BEFORE INSERT ON public.luu_xuat
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_loai_xuat();

-- ------------------------------------------------------------
-- 2) VIEW DEMAND: chỉ tính xuất bán (type = 'XB') trong 90 ngày
--    Dùng cho tab Tồn HH (số ngày bán) và Đề xuất đặt hàng.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) AS total_sales
FROM public.so_luong_ban
WHERE ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
  AND type = 'XB'                       -- << chỉ lấy xuất bán thật
  AND CAST(so_luong AS NUMERIC) > 0     -- bỏ dòng âm (trả/điều chỉnh) nếu lọt
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;

-- KIỂM TRA: so sánh trước/sau khi lọc XB
-- SELECT COUNT(*) AS so_ma_co_demand FROM public.sales_90d_summary;
