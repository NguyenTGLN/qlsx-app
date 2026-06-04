-- ============================================================
-- CẬP NHẬT VIEW: Đọc dữ liệu bán từ CẢ so_luong_ban VÀ luu_xuat
-- ============================================================
-- Lý do: Trigger chỉ sync INSERT mới từ luu_xuat → so_luong_ban.
--         Dữ liệu lịch sử trong luu_xuat chưa được sync sẽ bị thiếu.
--         View mới này UNION cả 2 bảng để đảm bảo đầy đủ.
--
-- Cách chạy: Mở Supabase Dashboard → SQL Editor → Paste & Run
-- ============================================================

CREATE OR REPLACE VIEW public.view_thong_ke_ban_hang AS
WITH combined AS (
    -- Nguồn 1: Bảng so_luong_ban (lịch sử, có thể có duplicate)
    SELECT 
        ma_don_hang,
        ma_san_pham,
        ngay_xuat,
        ten_san_pham,
        so_luong
    FROM public.so_luong_ban
    WHERE ngay_xuat IS NOT NULL

    UNION ALL

    -- Nguồn 2: Bảng luu_xuat (bảng chính, luôn cập nhật)
    SELECT 
        ma_don_hang,
        ma_san_pham,
        ngay_xuat,
        ten_san_pham,
        so_luong
    FROM public.luu_xuat
    WHERE ngay_xuat IS NOT NULL
),
deduped AS (
    SELECT DISTINCT 
        ma_don_hang,
        ma_san_pham,
        ngay_xuat,
        ten_san_pham,
        so_luong
    FROM combined
)
SELECT 
    TO_CHAR(ngay_xuat, 'YYYY-MM') as month,
    ma_san_pham,
    MAX(ten_san_pham) as ten_san_pham,
    SUM(so_luong) as so_luong
FROM deduped
GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), ma_san_pham;

-- Cấp quyền truy cập View
GRANT SELECT ON public.view_thong_ke_ban_hang TO anon;
GRANT SELECT ON public.view_thong_ke_ban_hang TO authenticated;
