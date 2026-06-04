-- ============================================================
-- FIX: View doanh số đọc nhầm so_luong_ban (bị TRÙNG ~2,78x).
-- Chuyển sang đọc luu_xuat (bảng gốc sạch, đã có cột type).
-- Chạy trong Supabase SQL Editor.
-- ============================================================
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) AS total_sales
FROM public.luu_xuat                       -- << đổi từ so_luong_ban sang luu_xuat
WHERE ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
  AND type = 'XB'
  AND CAST(so_luong AS NUMERIC) > 0
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;

-- KIỂM TRA (mong đợi F-CB-BNC ≈ 1146, KHÔNG còn 3429):
-- SELECT total_sales FROM public.sales_90d_summary WHERE ma_san_pham = 'F-CB-BNC';
