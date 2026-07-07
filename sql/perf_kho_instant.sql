-- ============================================================================
-- GÓI "LOAD TỨC THỜI" PHÂN HỆ KHO — chuẩn WMS chuyên nghiệp
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent — chạy lại nhiều lần không sao.
-- AN TOÀN: chỉ THÊM hàm/cột sinh/chỉ mục. KHÔNG sửa/xóa dữ liệu nghiệp vụ.
-- Thiết kế: docs/superpowers/specs/2026-07-07-kho-instant-load-design.md
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0) Extension tìm kiếm mờ %từ% (trigram)
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) SẮP XẾP VỊ TRÍ KHO TRONG DATABASE
--    Tái tạo đúng logic src/lib/locationSort.js:
--    [DÃY 1 chữ A→Z][TẦNG M<H<B<T<N<S][Ô so theo GIÁ TRỊ số].
--    Mã không đúng mẫu (VP, PBH, SX9-…) xếp CUỐI theo so sánh tự nhiên.
-- ────────────────────────────────────────────────────────────────────────────

-- Khóa so sánh tự nhiên: số được pad 10 chữ số để so theo giá trị (AH2 < AH13)
CREATE OR REPLACE FUNCTION public.natural_key(s text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(
    (SELECT string_agg(
       CASE WHEN t.m[1] ~ '^[0-9]' THEN lpad(t.m[1], 10, '0') ELSE t.m[1] END,
       '' ORDER BY t.ord)
     FROM regexp_matches(upper(trim(coalesce(s,''))), '[0-9]+|[^0-9]+', 'g')
          WITH ORDINALITY AS t(m, ord)),
    '');
$$;

CREATE OR REPLACE FUNCTION public.location_sort_key(loc text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN x.s ~ '^[A-Z][MHBTNS][0-9]+$' THEN
      '0' || substr(x.s, 1, 1)
          || CASE substr(x.s, 2, 1)
               WHEN 'M' THEN '1' WHEN 'H' THEN '2' WHEN 'B' THEN '3'
               WHEN 'T' THEN '4' WHEN 'N' THEN '5' ELSE '6' END
          || lpad(substr(x.s, 3), 6, '0')
    ELSE '1' || public.natural_key(x.s)
  END
  FROM (SELECT upper(trim(coalesce(loc,''))) AS s) x;
$$;

-- Cột sinh location_key trên inventory_stock → client chỉ cần order('location_key')
-- là ra đúng lộ trình kho ở MỌI quy mô (DB sort bằng index, không kéo dữ liệu về).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_stock'
      AND column_name = 'location_key'
  ) THEN
    ALTER TABLE public.inventory_stock
      ADD COLUMN location_key text
      GENERATED ALWAYS AS (public.location_sort_key(location)) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_location_key
  ON public.inventory_stock(location_key);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) RPC TỔNG HỢP — trả json trong 1 request duy nhất (né trần 1000 dòng/PostgREST)
-- ────────────────────────────────────────────────────────────────────────────

-- 2a) Tồn kho hàng hóa tổng hợp theo mã (tab Tồn HH):
--     thay việc client kéo toàn bộ inventory_stock về rồi group bằng JS.
--     Kèm sẵn tổng bán 90 ngày để client tính công thức đề xuất.
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT coalesce(json_agg(t), '[]'::json) FROM (
    SELECT
      s.item_code,
      coalesce(max(i.item_name), max(s.item_name), '')      AS item_name,
      coalesce(max(i.unit), max(s.unit), '')                AS unit,
      coalesce(max(i.lead_time_days), 0)                    AS lead_time_days,
      coalesce(max(i.backup_stock_days), 0)                 AS backup_stock_days,
      coalesce(max(i.min_stock_days), 0)                    AS min_stock_days,
      round(sum(coalesce(s.quantity, 0)), 3)                AS total_quantity,
      coalesce(max(v.total_sales), 0)                       AS total_sales_90d
    FROM public.inventory_stock s
    LEFT JOIN public.inventory_items  i ON i.item_code   = s.item_code
    LEFT JOIN public.sales_90d_summary v ON v.ma_san_pham = s.item_code
    GROUP BY s.item_code
    ORDER BY s.item_code
  ) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_stock_summary() TO anon, authenticated;

-- 2b) Sổ sách: giữ nguyên hàm tính get_book_inventory (từ perf_kho_pack.sql),
--     thêm wrapper trả json 1 LẦN — hết cảnh gọi theo trang khiến DB tính lại từ đầu.
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

CREATE OR REPLACE FUNCTION public.get_book_inventory_json(p_start date, p_end date)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT coalesce(json_agg(t), '[]'::json)
  FROM public.get_book_inventory(p_start, p_end) t;
$$;
GRANT EXECUTE ON FUNCTION public.get_book_inventory_json(date, date) TO anon, authenticated;

-- 2c) Danh sách vị trí distinct cho dropdown (đã sắp theo lộ trình kho)
CREATE OR REPLACE FUNCTION public.get_distinct_locations()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT coalesce(json_agg(x.loc ORDER BY x.k), '[]'::json)
  FROM (
    SELECT DISTINCT location AS loc, public.location_sort_key(location) AS k
    FROM public.inventory_stock
    WHERE location IS NOT NULL AND trim(location) <> ''
  ) x;
$$;
GRANT EXECUTE ON FUNCTION public.get_distinct_locations() TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) CHỈ MỤC — khớp từng kiểu truy vấn của các tab
-- ────────────────────────────────────────────────────────────────────────────

-- inventory_stock: lọc theo vị trí (eq), tiền tố (ilike 'X%'), ngày nhập
CREATE INDEX IF NOT EXISTS idx_stock_location         ON public.inventory_stock(location);
CREATE INDEX IF NOT EXISTS idx_stock_location_pattern ON public.inventory_stock(location text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_stock_import_date      ON public.inventory_stock(import_date);

-- Tìm kiếm chứa %từ% (ô search các tab dữ liệu lớn) → GIN trigram
CREATE INDEX IF NOT EXISTS idx_trgm_luu_xuat_ma_sp  ON public.luu_xuat      USING gin (ma_san_pham  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_luu_xuat_ten_sp ON public.luu_xuat      USING gin (ten_san_pham gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_luu_xuat_ma_dh  ON public.luu_xuat      USING gin (ma_don_hang  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_slb_ma_sp       ON public.so_luong_ban  USING gin (ma_san_pham  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_slb_ten_sp      ON public.so_luong_ban  USING gin (ten_san_pham gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_slb_ma_dh       ON public.so_luong_ban  USING gin (ma_don_hang  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_dln_ma_hang     ON public.du_lieu_nhap  USING gin (ma_hang      gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_dln_ten_hang    ON public.du_lieu_nhap  USING gin (ten_hang     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_items_code      ON public.inventory_items USING gin (item_code  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_items_name      ON public.inventory_items USING gin (item_name  gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Cập nhật thống kê cho query planner + báo PostgREST nạp lại schema
-- ────────────────────────────────────────────────────────────────────────────
ANALYZE public.inventory_stock;
ANALYZE public.inventory_items;
ANALYZE public.luu_xuat;
ANALYZE public.so_luong_ban;
ANALYZE public.du_lieu_nhap;

NOTIFY pgrst, 'reload_schema';

-- Kiểm tra nhanh sau khi chạy (tùy chọn):
--   SELECT public.location_sort_key('HH3'), public.location_sort_key('HM5'), public.location_sort_key('VP1T4');
--   -- Kỳ vọng: HM5 < HH3 (tầng M trước H), VP1T4 bắt đầu bằng '1' (xếp cuối)
--   SELECT json_array_length(public.get_stock_summary());
--   SELECT json_array_length(public.get_book_inventory_json('1900-01-01','2999-12-31'));
