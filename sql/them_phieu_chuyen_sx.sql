-- ============================================================
-- PHIẾU CHUYỂN VỊ TRÍ SX (PCV) — cho phép Hủy Phiếu đảo ngược
-- ============================================================
-- Spec: docs/superpowers/specs/2026-07-24-chuyen-sx-truoc-design.md
-- Cách chạy: Supabase Dashboard → SQL Editor → Paste & Run (idempotent).
-- YÊU CẦU: đã chạy sql/create_huy_phieu.sql trước (tạo cột is_cancelled...).
--
-- Thay đổi DUY NHẤT so với bản gốc: thêm nhánh prefix 'PCV' được MIỄN kiểm tra
-- bảng phụ (luu_xuat / du_lieu_nhap). Phiếu chuyển vị trí không sinh bản ghi phụ
-- vì hàng KHÔNG rời kho — chỉ đổi vị trí.
-- ============================================================

-- ── 3) RPC huy_phieu ────────────────────────────────────────
-- Đảo ngược nguyên tử 1 chứng từ. Mọi lỗi chặn = EXCEPTION (rollback toàn bộ).
CREATE OR REPLACE FUNCTION public.huy_phieu(
  p_order_code TEXT,
  p_user       TEXT DEFAULT NULL,
  p_reason     TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix        TEXT := split_part(p_order_code, '-', 1); -- PNK/PXK/PDH/PSX/PPR
  v_log           RECORD;
  v_stock         RECORD;
  v_new_qty       NUMERIC;
  v_reversed      INT := 0;
  v_side_count    INT;
  v_po            RECORD;
  v_wip_qty       NUMERIC;
  v_unit          TEXT;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do hủy phiếu.';
  END IF;

  -- Khóa toàn bộ dòng chứng từ (serialize 2 người cùng hủy)
  PERFORM 1 FROM inventory_picking_logs WHERE order_code = p_order_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy chứng từ %.', p_order_code;
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_picking_logs WHERE order_code = p_order_code AND is_cancelled) THEN
    RAISE EXCEPTION 'Chứng từ % đã được hủy trước đó.', p_order_code;
  END IF;

  -- Bắt buộc có bản ghi phụ truy vết (phieu_code) theo loại phiếu.
  -- Phiếu tạo TRƯỚC nâng cấp không có → từ chối (xử lý tay).
  IF v_prefix IN ('PXK', 'PDH', 'PSX', 'PPR') THEN
    SELECT COUNT(*) INTO v_side_count FROM luu_xuat WHERE phieu_code = p_order_code;
    IF v_side_count = 0 THEN
      RAISE EXCEPTION 'Phiếu % tạo trước khi nâng cấp tính năng Hủy (thiếu truy vết phieu_code) — cần xử lý tay.', p_order_code;
    END IF;
  ELSIF v_prefix = 'PNK' THEN
    SELECT COUNT(*) INTO v_side_count FROM du_lieu_nhap WHERE phieu_code = p_order_code;
    IF v_side_count = 0 THEN
      RAISE EXCEPTION 'Phiếu % tạo trước khi nâng cấp tính năng Hủy (thiếu truy vết phieu_code) — cần xử lý tay.', p_order_code;
    END IF;
  ELSIF v_prefix = 'PCV' THEN
    -- Phiếu CHUYỂN VỊ TRÍ SX: hàng không rời kho nên không sinh luu_xuat /
    -- du_lieu_nhap → không có bảng phụ để kiểm tra. Vòng lặp đảo tồn bên dưới
    -- (stock -= quantity_taken) tự xử lý đúng: dòng xuất (âm) cộng trả về vị trí
    -- cũ, dòng nhập (dương) trừ khỏi vị trí tập kết SX4.
    NULL;
  ELSE
    RAISE EXCEPTION 'Loại phiếu % không hỗ trợ hủy.', v_prefix;
  END IF;

  -- Riêng PSX: chặn nếu đã có báo cáo sản xuất; WIP phải còn nguyên
  IF v_prefix = 'PSX' THEN
    IF EXISTS (
      SELECT 1 FROM production_logs pl
      JOIN production_orders po ON po.id = pl.order_id
      WHERE po.order_code = p_order_code OR po.order_code LIKE p_order_code || '.%'
    ) THEN
      RAISE EXCEPTION 'Lệnh sản xuất % đã có báo cáo tiến độ — không thể hủy. Cần xử lý tay.', p_order_code;
    END IF;
    FOR v_po IN
      SELECT id, order_code, product_code, target_quantity FROM production_orders
      WHERE order_code = p_order_code OR order_code LIKE p_order_code || '.%'
      FOR UPDATE
    LOOP
      SELECT quantity INTO v_wip_qty FROM inventory_stock
       WHERE item_code = v_po.product_code AND location = 'SX9-' || v_po.order_code
       ORDER BY id LIMIT 1 FOR UPDATE;
      IF v_wip_qty IS NULL OR v_wip_qty < v_po.target_quantity THEN
        RAISE EXCEPTION 'Tồn WIP SX9-% không còn nguyên (% < %) — thành phẩm đã được nhập/tiêu bớt, không thể hủy.',
          v_po.order_code, COALESCE(v_wip_qty, 0), v_po.target_quantity;
      END IF;
    END LOOP;
  END IF;

  -- ── Đảo tồn kho theo từng dòng chứng từ ──
  -- Công thức chung: stock(item, location) -= quantity_taken (dòng nhập trừ lại, dòng xuất cộng trả).
  FOR v_log IN
    SELECT * FROM inventory_picking_logs WHERE order_code = p_order_code
  LOOP
    SELECT id, quantity INTO v_stock FROM inventory_stock
     WHERE item_code = v_log.component_code AND location = v_log.location
     ORDER BY id LIMIT 1 FOR UPDATE;

    v_new_qty := COALESCE(v_stock.quantity, 0) - v_log.quantity_taken;
    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Không thể hủy: mã % tại vị trí % chỉ còn %, cần % để đảo (hàng đã được dùng tiếp).',
        v_log.component_code, v_log.location, COALESCE(v_stock.quantity, 0), v_log.quantity_taken;
    END IF;

    IF v_stock.id IS NOT NULL THEN
      IF v_new_qty = 0 THEN
        DELETE FROM inventory_stock WHERE id = v_stock.id;
      ELSE
        UPDATE inventory_stock SET quantity = v_new_qty WHERE id = v_stock.id;
      END IF;
    ELSIF v_new_qty > 0 THEN
      -- dòng tồn đã bị xóa/không còn (vd xuất hết rồi dọn dòng 0) → tái tạo khi cộng trả
      SELECT unit INTO v_unit FROM inventory_items WHERE item_code = v_log.component_code LIMIT 1;
      INSERT INTO inventory_stock (item_code, item_name, unit, location, quantity, import_date)
      VALUES (v_log.component_code, v_log.component_name, COALESCE(v_unit, 'Cái'), v_log.location, v_new_qty, CURRENT_DATE);
    END IF;

    -- Dòng "Nhập thành phẩm" từ phiếu SX: cộng TRẢ lại WIP SX9-{psx} số đã trừ khi nhập
    IF v_prefix = 'PNK' AND v_log.wip_source IS NOT NULL AND trim(v_log.wip_source) <> '' THEN
      UPDATE inventory_stock SET quantity = quantity + v_log.quantity_taken
       WHERE item_code = v_log.component_code AND location = 'SX9-' || v_log.wip_source;
      IF NOT FOUND THEN
        INSERT INTO inventory_stock (item_code, item_name, unit, location, quantity, import_date)
        VALUES (v_log.component_code, v_log.component_name, 'Bộ', 'SX9-' || v_log.wip_source, v_log.quantity_taken, CURRENT_DATE);
      END IF;
    END IF;

    v_reversed := v_reversed + 1;
  END LOOP;

  -- ── PSX: gỡ lệnh SX + WIP + cộng trả nhu cầu DKSX ──
  IF v_prefix = 'PSX' THEN
    FOR v_po IN
      SELECT id, order_code, product_code, target_quantity FROM production_orders
      WHERE order_code = p_order_code OR order_code LIKE p_order_code || '.%'
    LOOP
      DELETE FROM inventory_stock
       WHERE item_code = v_po.product_code AND location = 'SX9-' || v_po.order_code;
      UPDATE production_demand
         SET qty_demand = qty_demand + v_po.target_quantity,
             trang_thai = 'Đang SX',
             updated_at = now()
       WHERE item_code = v_po.product_code;
      DELETE FROM production_orders WHERE id = v_po.id;
    END LOOP;
  END IF;

  -- ── Xóa bản ghi phụ (trigger DELETE tự trừ thống kê bán hàng) ──
  DELETE FROM luu_xuat     WHERE phieu_code = p_order_code;
  DELETE FROM du_lieu_nhap WHERE phieu_code = p_order_code;

  -- ── Đánh dấu chứng từ Đã hủy ──
  UPDATE inventory_picking_logs
     SET is_cancelled = TRUE, cancelled_at = now(),
         cancelled_by = COALESCE(p_user, 'Không rõ'), cancel_reason = trim(p_reason)
   WHERE order_code = p_order_code;

  RETURN jsonb_build_object('ok', true, 'order_code', p_order_code, 'reversed_lines', v_reversed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.huy_phieu(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── TEST TỰ CHẠY (an toàn: dùng mã TEST riêng, tự dọn) ──
DO $$
DECLARE
  v_res jsonb;
  v_qty NUMERIC;
BEGIN
  INSERT INTO inventory_items (item_code, item_name, unit)
  VALUES ('TEST-PCV-ITEM', 'Test chuyen SX truoc', 'Cái')
  ON CONFLICT (item_code) DO NOTHING;

  -- Dựng trạng thái SAU khi đã chuyển: vị trí cũ còn 0, kho tập kết đang giữ 10
  INSERT INTO inventory_stock (item_code, item_name, unit, location, quantity, import_date)
  VALUES ('TEST-PCV-ITEM', 'Test chuyen SX truoc', 'Cái', 'TEST-PCV-OLD', 0, CURRENT_DATE),
         ('TEST-PCV-ITEM', 'Test chuyen SX truoc', 'Cái', 'SX4-01/01/2000', 10, CURRENT_DATE);

  INSERT INTO inventory_picking_logs (order_code, product_code, component_code, component_name, location, quantity_before, quantity_taken, quantity_after, created_by, notes)
  VALUES ('PCV-00000000-99', 'CHUYEN_SX', 'TEST-PCV-ITEM', 'Test chuyen SX truoc', 'TEST-PCV-OLD',   10, -10,  0, 'test', 'Chuyển SX trước'),
         ('PCV-00000000-99', 'CHUYEN_SX', 'TEST-PCV-ITEM', 'Test chuyen SX truoc', 'SX4-01/01/2000',  0,  10, 10, 'test', 'Nhận hàng chuyển SX trước');

  v_res := huy_phieu('PCV-00000000-99', 'tester', 'test tự động');
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST FAIL: RPC không trả ok'; END IF;

  SELECT quantity INTO v_qty FROM inventory_stock
   WHERE item_code = 'TEST-PCV-ITEM' AND location = 'TEST-PCV-OLD';
  IF v_qty IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'TEST FAIL: vị trí cũ chưa nhận lại 10 (đang %)', COALESCE(v_qty, -1);
  END IF;

  SELECT quantity INTO v_qty FROM inventory_stock
   WHERE item_code = 'TEST-PCV-ITEM' AND location = 'SX4-01/01/2000';
  IF v_qty IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL: tồn kho tập kết chưa trừ về 0 (đang %)', v_qty;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM inventory_picking_logs WHERE order_code = 'PCV-00000000-99' AND is_cancelled) THEN
    RAISE EXCEPTION 'TEST FAIL: log chưa đánh dấu hủy';
  END IF;

  DELETE FROM inventory_picking_logs WHERE order_code = 'PCV-00000000-99';
  DELETE FROM inventory_stock        WHERE item_code  = 'TEST-PCV-ITEM';
  DELETE FROM inventory_items        WHERE item_code  = 'TEST-PCV-ITEM';
  RAISE NOTICE '✅ huy_phieu PCV: TEST PASS';
END $$;
