-- ============================================================
-- Chống DÒNG TRÙNG trong inventory_stock (bảng tồn kho vị trí)
-- Ngày: 2026-06-04
-- Quy tắc nghiệp vụ (user chốt): 1 MÃ + 1 VỊ TRÍ = 1 DÒNG.
--   → Gộp các dòng trùng: CỘNG DỒN số lượng, GIỮ NGÀY NHẬP SỚM NHẤT (để xuất FIFO đúng).
--   → Thêm ràng buộc UNIQUE để từ nay DB tự chặn, không bao giờ tạo được dòng trùng nữa.
--
-- An toàn: nên backup bảng trước khi chạy:
--   CREATE TABLE inventory_stock_backup_20260604 AS SELECT * FROM public.inventory_stock;
-- ============================================================

BEGIN;

-- 1) Gộp số lượng về dòng giữ lại (dòng có id nhỏ nhất trong nhóm), set ngày nhập sớm nhất
UPDATE public.inventory_stock t
SET quantity    = agg.total_qty,
    import_date = agg.min_date
FROM (
  SELECT item_code, location,
         SUM(quantity)    AS total_qty,
         MIN(import_date) AS min_date,
         MIN(id::text)    AS keep_id
  FROM public.inventory_stock
  WHERE location IS NOT NULL
  GROUP BY item_code, location
  HAVING COUNT(*) > 1
) agg
WHERE t.id::text = agg.keep_id;

-- 2) Xóa các dòng trùng còn lại (giữ đúng 1 dòng / nhóm)
DELETE FROM public.inventory_stock t
USING (
  SELECT item_code, location, MIN(id::text) AS keep_id
  FROM public.inventory_stock
  WHERE location IS NOT NULL
  GROUP BY item_code, location
  HAVING COUNT(*) > 1
) agg
WHERE t.item_code = agg.item_code
  AND t.location  = agg.location
  AND t.id::text <> agg.keep_id;

-- 3) Ràng buộc duy nhất (mã + vị trí). Cần cho UPSERT onConflict ở app.
ALTER TABLE public.inventory_stock
  ADD CONSTRAINT uq_inventory_stock_item_location UNIQUE (item_code, location);

COMMIT;

-- ============================================================
-- KIỂM TRA sau khi chạy — câu này PHẢI trả về 0 dòng:
-- SELECT item_code, location, COUNT(*)
-- FROM public.inventory_stock
-- WHERE location IS NOT NULL
-- GROUP BY item_code, location
-- HAVING COUNT(*) > 1;
-- ============================================================
