-- Tách số lượng đề xuất theo 2 kênh trong cùng 1 bản ghi: sản xuất (bom) + bán lẻ (retail).
-- calculated_qty = bom_qty + retail_qty. Mỗi mã linh kiện chỉ còn 1 dòng 'Mới'.

ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS bom_qty    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retail_qty numeric NOT NULL DEFAULT 0;

-- Backfill: phân bổ calculated_qty cũ về đúng kênh theo source.
UPDATE public.purchase_proposals
  SET bom_qty = COALESCE(calculated_qty, 0)
  WHERE COALESCE(source, 'bom') <> 'retail' AND bom_qty = 0;
UPDATE public.purchase_proposals
  SET retail_qty = COALESCE(calculated_qty, 0)
  WHERE source = 'retail' AND retail_qty = 0;

-- Gộp một lần các dòng trang_thai='Mới' trùng item_code thành 1 dòng (keeper = dlk_code nhỏ nhất).
DO $$
DECLARE
  grp RECORD;
  keeper_id uuid;
  sum_bom numeric;
  sum_retail numeric;
BEGIN
  FOR grp IN
    SELECT item_code
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới'
    GROUP BY item_code
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code
    ORDER BY dlk_code ASC
    LIMIT 1;

    SELECT COALESCE(SUM(bom_qty),0), COALESCE(SUM(retail_qty),0)
      INTO sum_bom, sum_retail
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code;

    UPDATE public.purchase_proposals
      SET bom_qty = sum_bom,
          retail_qty = sum_retail,
          calculated_qty = sum_bom + sum_retail,
          actual_qty = sum_bom + sum_retail,
          source = CASE WHEN sum_bom > 0 AND sum_retail > 0 THEN 'both'
                        WHEN sum_retail > 0 THEN 'retail' ELSE 'bom' END
    WHERE id = keeper_id;

    DELETE FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code AND id <> keeper_id;
  END LOOP;
END $$;
