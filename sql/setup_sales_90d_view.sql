-- ==========================================
-- VIEW TÍNH TOÁN SẴN DOANH SỐ 90 NGÀY
-- ==========================================

-- Tạo index để Database truy xuất dữ liệu cực nhanh
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_ngay_xuat_ma_sp 
ON public.so_luong_ban(ngay_xuat, ma_san_pham);

-- Tạo View gom nhóm và cộng dồn số lượng bán trong 90 ngày
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT 
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) as total_sales
FROM 
    public.so_luong_ban
WHERE 
    ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY 
    ma_san_pham;

-- Phân quyền cho View (được kế thừa từ bảng gốc nhưng vẫn nên khai báo để an toàn)
GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;
