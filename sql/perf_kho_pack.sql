-- ============================================================================
-- GÓI TĂNG TỐC PHÂN HỆ KHO (chạy 1 lần trong Supabase SQL Editor)
-- AN TOÀN: chỉ thêm hàm đọc + chỉ mục. KHÔNG sửa/xoá dữ liệu.
-- Idempotent: chạy lại nhiều lần vẫn không sao.
-- ============================================================================

-- 1) Hàm tính sẵn cho tab "Tồn kho sổ sách" (BookInventoryTab)
CREATE OR REPLACE FUNCTION public.get_book_inventory(p_start date, p_end date)
RETURNS TABLE (
  item_code text, item_name text, ton_dau_ky numeric, tong_nhap numeric,
  tong_xuat numeric, ton_thuc_te numeric, kho_con numeric, chenh_lech numeric
) LANGUAGE sql STABLE AS $$
  WITH imports AS (
    SELECT upper(trim(ma_hang)) AS code, max(ten_hang) AS name,
           sum(CASE WHEN ngay_nhap <  p_start THEN coalesce(so_luong_nhap,0) ELSE 0 END) AS before_qty,
           sum(CASE WHEN ngay_nhap >= p_start AND ngay_nhap <= p_end THEN coalesce(so_luong_nhap,0) ELSE 0 END) AS in_qty
    FROM public.du_lieu_nhap WHERE ma_hang IS NOT NULL AND trim(ma_hang) <> ''
    GROUP BY upper(trim(ma_hang))
  ),
  exports AS (
    SELECT upper(trim(ma_san_pham)) AS code, max(ten_san_pham) AS name,
           sum(CASE WHEN ngay_xuat <  p_start THEN coalesce(so_luong,0) ELSE 0 END) AS before_qty,
           sum(CASE WHEN ngay_xuat >= p_start AND ngay_xuat <= p_end THEN coalesce(so_luong,0) ELSE 0 END) AS in_qty
    FROM public.luu_xuat WHERE ma_san_pham IS NOT NULL AND trim(ma_san_pham) <> ''
    GROUP BY upper(trim(ma_san_pham))
  ),
  stock AS (
    SELECT upper(trim(item_code)) AS code, max(item_name) AS name, sum(coalesce(quantity,0)) AS qty
    FROM public.inventory_stock WHERE item_code IS NOT NULL AND trim(item_code) <> ''
    GROUP BY upper(trim(item_code))
  ),
  codes AS (SELECT code FROM imports UNION SELECT code FROM exports UNION SELECT code FROM stock)
  SELECT c.code, coalesce(i.name, e.name, s.name, ''),
    round(coalesce(i.before_qty,0) - coalesce(e.before_qty,0), 3),
    round(coalesce(i.in_qty,0), 3), round(coalesce(e.in_qty,0), 3), round(coalesce(s.qty,0), 3),
    round(coalesce(i.before_qty,0) - coalesce(e.before_qty,0) + coalesce(i.in_qty,0) - coalesce(e.in_qty,0), 3),
    round(coalesce(s.qty,0) - (coalesce(i.before_qty,0) - coalesce(e.before_qty,0) + coalesce(i.in_qty,0) - coalesce(e.in_qty,0)), 3)
  FROM codes c
  LEFT JOIN imports i ON i.code=c.code LEFT JOIN exports e ON e.code=c.code LEFT JOIN stock s ON s.code=c.code
  ORDER BY c.code;
$$;
GRANT EXECUTE ON FUNCTION public.get_book_inventory(date, date) TO anon, authenticated;

-- 2) Chỉ mục giúp tab "Dữ liệu xuất" (bảng so_luong_ban 747K dòng) lọc/sắp xếp nhanh
CREATE INDEX IF NOT EXISTS idx_slb_ngay_xuat   ON public.so_luong_ban(ngay_xuat);
CREATE INDEX IF NOT EXISTS idx_slb_ma_san_pham ON public.so_luong_ban(ma_san_pham);
CREATE INDEX IF NOT EXISTS idx_slb_ma_don_hang ON public.so_luong_ban(ma_don_hang);
CREATE INDEX IF NOT EXISTS idx_slb_created_at  ON public.so_luong_ban(created_at DESC);

-- 3) Chỉ mục cho các bảng dùng trong báo cáo sổ sách / lưu xuất
CREATE INDEX IF NOT EXISTS idx_du_lieu_nhap_ngay ON public.du_lieu_nhap(ngay_nhap);
CREATE INDEX IF NOT EXISTS idx_luu_xuat_ngay     ON public.luu_xuat(ngay_xuat);
CREATE INDEX IF NOT EXISTS idx_luu_xuat_ma_sp    ON public.luu_xuat(ma_san_pham);
CREATE INDEX IF NOT EXISTS idx_luu_xuat_ma_dh    ON public.luu_xuat(ma_don_hang);

NOTIFY pgrst, 'reload_schema';
