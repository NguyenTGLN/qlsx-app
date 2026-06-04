-- ============================================================================
-- LỚP 2 — TĂNG TỐC TAB "TỒN KHO SỔ SÁCH" (BookInventoryTab)
-- ----------------------------------------------------------------------------
-- Thay vì app kéo toàn bộ du_lieu_nhap (2.6K) + luu_xuat (16.6K) + inventory_stock
-- về máy rồi tự cộng/trừ, hàm này để DATABASE tính sẵn và chỉ trả về ~vài nghìn
-- dòng kết quả theo từng mã hàng.
--
-- AN TOÀN: chỉ ĐỌC dữ liệu, KHÔNG sửa/xoá gì. Chạy 1 lần trong Supabase SQL Editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_book_inventory(p_start date, p_end date)
RETURNS TABLE (
  item_code   text,
  item_name   text,
  ton_dau_ky  numeric,
  tong_nhap   numeric,
  tong_xuat   numeric,
  ton_thuc_te numeric,
  kho_con     numeric,
  chenh_lech  numeric
)
LANGUAGE sql STABLE AS $$
  WITH imports AS (
    SELECT upper(trim(ma_hang)) AS code,
           max(ten_hang) AS name,
           sum(CASE WHEN ngay_nhap <  p_start THEN coalesce(so_luong_nhap,0) ELSE 0 END) AS before_qty,
           sum(CASE WHEN ngay_nhap >= p_start AND ngay_nhap <= p_end THEN coalesce(so_luong_nhap,0) ELSE 0 END) AS in_qty
    FROM public.du_lieu_nhap
    WHERE ma_hang IS NOT NULL AND trim(ma_hang) <> ''
    GROUP BY upper(trim(ma_hang))
  ),
  exports AS (
    SELECT upper(trim(ma_san_pham)) AS code,
           max(ten_san_pham) AS name,
           sum(CASE WHEN ngay_xuat <  p_start THEN coalesce(so_luong,0) ELSE 0 END) AS before_qty,
           sum(CASE WHEN ngay_xuat >= p_start AND ngay_xuat <= p_end THEN coalesce(so_luong,0) ELSE 0 END) AS in_qty
    FROM public.luu_xuat
    WHERE ma_san_pham IS NOT NULL AND trim(ma_san_pham) <> ''
    GROUP BY upper(trim(ma_san_pham))
  ),
  stock AS (
    SELECT upper(trim(item_code)) AS code,
           max(item_name) AS name,
           sum(coalesce(quantity,0)) AS qty
    FROM public.inventory_stock
    WHERE item_code IS NOT NULL AND trim(item_code) <> ''
    GROUP BY upper(trim(item_code))
  ),
  codes AS (
    SELECT code FROM imports
    UNION SELECT code FROM exports
    UNION SELECT code FROM stock
  )
  SELECT
    c.code AS item_code,
    coalesce(i.name, e.name, s.name, '') AS item_name,
    round(coalesce(i.before_qty,0) - coalesce(e.before_qty,0), 3) AS ton_dau_ky,
    round(coalesce(i.in_qty,0), 3) AS tong_nhap,
    round(coalesce(e.in_qty,0), 3) AS tong_xuat,
    round(coalesce(s.qty,0), 3) AS ton_thuc_te,
    round(coalesce(i.before_qty,0) - coalesce(e.before_qty,0) + coalesce(i.in_qty,0) - coalesce(e.in_qty,0), 3) AS kho_con,
    round(coalesce(s.qty,0) - (coalesce(i.before_qty,0) - coalesce(e.before_qty,0) + coalesce(i.in_qty,0) - coalesce(e.in_qty,0)), 3) AS chenh_lech
  FROM codes c
  LEFT JOIN imports i ON i.code = c.code
  LEFT JOIN exports e ON e.code = c.code
  LEFT JOIN stock   s ON s.code = c.code
  ORDER BY c.code;
$$;

-- Cho phép app (vai trò anon) gọi hàm này
GRANT EXECUTE ON FUNCTION public.get_book_inventory(date, date) TO anon, authenticated;

-- Tăng tốc thêm: index theo ngày để gom nhóm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_du_lieu_nhap_ngay ON public.du_lieu_nhap(ngay_nhap);
CREATE INDEX IF NOT EXISTS idx_luu_xuat_ngay     ON public.luu_xuat(ngay_xuat);

NOTIFY pgrst, 'reload_schema';
