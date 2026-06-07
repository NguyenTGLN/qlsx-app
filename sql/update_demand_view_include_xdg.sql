-- ============================================================
-- Thêm XDG (Xuất đóng hàng) vào view demand đề xuất đặt hàng.
-- Doanh số (thong_ke_ban_hang) giữ nguyên type='XB' -> tách riêng.
-- Chạy: Supabase Dashboard -> SQL Editor -> Paste & Run
-- ============================================================
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) AS total_sales
FROM public.so_luong_ban
WHERE ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
  AND type IN ('XB','XDG')              -- XB = bán; XDG = đóng hàng (tính demand, không vào doanh số)
  AND CAST(so_luong AS NUMERIC) > 0
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;

-- KIỂM TRA: số mã có demand sau khi thêm XDG
-- SELECT COUNT(*) AS so_ma_co_demand FROM public.sales_90d_summary;
