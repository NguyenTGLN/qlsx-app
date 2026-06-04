-- ============================================================
-- VÁ LỖ HỔNG: inventory_stock.item_code đang ON DELETE CASCADE
-- -> mỗi lần xóa/làm sạch danh mục là TỒN KHO bị xóa lây.
-- Đổi sang ON DELETE RESTRICT: xóa danh mục đang có tồn kho sẽ BỊ CHẶN.
-- (Import danh mục bằng upsert vẫn chạy bình thường, không cần xóa.)
--
-- Supabase Dashboard -> SQL Editor -> Paste & Run
-- ============================================================

-- 1) inventory_stock -> inventory_items : CASCADE => RESTRICT
DO $$
DECLARE c text;
BEGIN
  SELECT con.conname INTO c
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'inventory_stock'
    AND con.contype = 'f'
    AND con.confrelid = 'public.inventory_items'::regclass;

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.inventory_stock DROP CONSTRAINT %I', c);
  END IF;

  ALTER TABLE public.inventory_stock
    ADD CONSTRAINT inventory_stock_item_code_fkey
    FOREIGN KEY (item_code) REFERENCES public.inventory_items(item_code)
    ON DELETE RESTRICT;
END $$;

-- 2) (TÙY CHỌN) Bảo vệ luôn bom_items khỏi bị xóa lây khi làm sạch danh mục.
--    Bỏ comment nếu muốn áp dụng:
-- DO $$
-- DECLARE c text;
-- BEGIN
--   FOR c IN SELECT con.conname FROM pg_constraint con
--     JOIN pg_class rel ON rel.oid = con.conrelid
--     WHERE rel.relname = 'bom_items' AND con.contype='f'
--       AND con.confrelid='public.inventory_items'::regclass
--   LOOP EXECUTE format('ALTER TABLE public.bom_items DROP CONSTRAINT %I', c); END LOOP;
--   ALTER TABLE public.bom_items ADD CONSTRAINT bom_items_product_code_fkey
--     FOREIGN KEY (product_code) REFERENCES public.inventory_items(item_code) ON DELETE RESTRICT;
--   ALTER TABLE public.bom_items ADD CONSTRAINT bom_items_component_code_fkey
--     FOREIGN KEY (component_code) REFERENCES public.inventory_items(item_code) ON DELETE RESTRICT;
-- END $$;

-- KIỂM TRA lại quy tắc xóa (mong đợi: 'r' = RESTRICT):
-- SELECT conname, confdeltype FROM pg_constraint
-- WHERE conrelid='public.inventory_stock'::regclass AND contype='f';
