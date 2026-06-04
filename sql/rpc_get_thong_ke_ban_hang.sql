-- ============================================================
-- RPC FUNCTION: Tổng hợp số lượng bán theo tháng + mã SP
-- Chạy trên Supabase SQL Editor (1 lần duy nhất)
-- ============================================================
-- Thay thế cho view_thong_ke_ban_hang bị timeout
-- Function chạy server-side, trả kết quả đã aggregate (~7K dòng)
-- App gọi: supabase.rpc('get_thong_ke_ban_hang')
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_thong_ke_ban_hang()
RETURNS TABLE (
  month TEXT,
  ma_san_pham TEXT,
  ten_san_pham TEXT,
  so_luong NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH deduped AS (
    SELECT DISTINCT 
      ma_don_hang,
      so_luong_ban.ma_san_pham,
      ngay_xuat,
      ten_san_pham,
      so_luong_ban.so_luong
    FROM public.so_luong_ban
    WHERE ngay_xuat IS NOT NULL
  )
  SELECT 
    TO_CHAR(ngay_xuat, 'YYYY-MM') as month,
    deduped.ma_san_pham,
    MAX(ten_san_pham) as ten_san_pham,
    SUM(deduped.so_luong) as so_luong
  FROM deduped
  GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), deduped.ma_san_pham;
$$;

-- Cấp quyền gọi function
GRANT EXECUTE ON FUNCTION public.get_thong_ke_ban_hang() TO anon;
GRANT EXECUTE ON FUNCTION public.get_thong_ke_ban_hang() TO authenticated;
