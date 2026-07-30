-- ==========================================
-- VIEW TÍNH TOÁN SẴN DOANH SỐ 90 NGÀY
-- ==========================================

-- Tạo index để Database truy xuất dữ liệu cực nhanh
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_ngay_xuat_ma_sp 
ON public.so_luong_ban(ngay_xuat, ma_san_pham);

-- Tạo View gom nhóm và cộng dồn số lượng bán trong 90 ngày
--
-- ⚠️ security_invoker = true là BẮT BUỘC, không được bỏ.
-- View mặc định chạy dưới quyền CHỦ SỞ HỮU (postgres) nên nó ĐI XUYÊN QUA RLS của
-- bảng gốc so_luong_ban. Thiếu dòng này, bất kỳ ai có quyền đọc view sẽ thấy TOÀN BỘ
-- doanh số 90 ngày của công ty. Đặt security_invoker thì view chạy dưới quyền người
-- gọi, RLS của bảng gốc mới có tác dụng.
CREATE OR REPLACE VIEW public.sales_90d_summary
WITH (security_invoker = true) AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) as total_sales
FROM
    public.so_luong_ban
WHERE
    ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY
    ma_san_pham;

-- Phân quyền: CHỈ authenticated.
--
-- ⚠️ KHÔNG cấp cho anon. Bản cũ của tệp này có `TO authenticated, anon` — nghĩa là
-- người ngoài cầm khoá công khai (thứ nằm sẵn trong mã nguồn, Ctrl+U là thấy) có
-- quyền trên view doanh số. Lúc đó chỉ còn security_invoker đứng chắn; mất nó là lộ
-- sạch mã nào bán bao nhiêu. Đã thu quyền anon ngày 29/07/2026, đo lại bằng khoá
-- công khai cho ra 42501 permission denied.
REVOKE ALL ON public.sales_90d_summary FROM anon;
GRANT SELECT ON public.sales_90d_summary TO authenticated;
