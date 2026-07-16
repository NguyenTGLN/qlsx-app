-- ============================================================
-- TÍNH NĂNG HỦY PHIẾU: đảo ngược chứng từ kho đã lưu
-- ============================================================
-- Spec: docs/superpowers/specs/2026-07-16-huy-phieu-chung-tu-design.md
-- Cách chạy: Supabase Dashboard → SQL Editor → Paste & Run (idempotent).
-- YÊU CẦU: đã chạy redesign_sales_thongke.sql (trigger INSERT thống kê).
-- ============================================================

-- ── 1) Cột mới ──────────────────────────────────────────────
ALTER TABLE public.inventory_picking_logs
  ADD COLUMN IF NOT EXISTS is_cancelled  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS wip_source    TEXT; -- mã PSX nguồn (dòng "Nhập thành phẩm" cần trả WIP khi hủy)

ALTER TABLE public.luu_xuat      ADD COLUMN IF NOT EXISTS phieu_code TEXT;
ALTER TABLE public.du_lieu_nhap  ADD COLUMN IF NOT EXISTS phieu_code TEXT;
CREATE INDEX IF NOT EXISTS idx_luu_xuat_phieu_code     ON public.luu_xuat(phieu_code);
CREATE INDEX IF NOT EXISTS idx_du_lieu_nhap_phieu_code ON public.du_lieu_nhap(phieu_code);

-- ── 2) Trigger AFTER DELETE: luu_xuat → trừ thong_ke_ban_hang ──
-- Chiều ngược của trg_sync_luuxuat_to_thongke (AFTER INSERT, chỉ type='XB').
CREATE OR REPLACE FUNCTION public.sync_luuxuat_delete_to_thongke()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.type = 'XB' AND OLD.ngay_xuat IS NOT NULL AND OLD.ma_san_pham IS NOT NULL THEN
    UPDATE public.thong_ke_ban_hang
       SET so_luong = GREATEST(0, so_luong - CAST(OLD.so_luong AS NUMERIC)),
           updated_at = now()
     WHERE month = TO_CHAR(OLD.ngay_xuat, 'YYYY-MM')
       AND ma_san_pham = OLD.ma_san_pham;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_luuxuat_delete_to_thongke ON public.luu_xuat;
CREATE TRIGGER trg_sync_luuxuat_delete_to_thongke
  AFTER DELETE ON public.luu_xuat
  FOR EACH ROW EXECUTE FUNCTION public.sync_luuxuat_delete_to_thongke();

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

-- ── 4) TEST TỰ CHẠY (an toàn: dùng mã TEST riêng, tự dọn) ──
DO $$
DECLARE
  v_res jsonb;
  v_qty NUMERIC;
BEGIN
  -- Danh mục tạm cho mã test (inventory_stock có FK → inventory_items)
  INSERT INTO inventory_items (item_code, item_name, unit)
  VALUES ('TEST-HUY-ITEM', 'Test hủy phiếu', 'Cái')
  ON CONFLICT (item_code) DO NOTHING;

  -- Dựng phiếu PNK giả: nhập 10 cái TEST-HUY-ITEM vào TEST-LOC
  INSERT INTO inventory_stock (item_code, item_name, unit, location, quantity, import_date)
  VALUES ('TEST-HUY-ITEM', 'Test hủy phiếu', 'Cái', 'TEST-LOC', 10, CURRENT_DATE);
  INSERT INTO inventory_picking_logs (order_code, product_code, component_code, component_name, location, quantity_before, quantity_taken, quantity_after, created_by, notes)
  VALUES ('PNK-00000000-99', 'NHAP_KHO', 'TEST-HUY-ITEM', 'Test hủy phiếu', 'TEST-LOC', 0, 10, 10, 'test', 'test');
  INSERT INTO du_lieu_nhap (ngay_nhap, ma_hang, ten_hang, so_luong_nhap, ma_ncc, kho_nhap, ly_do_nhap, phieu_code)
  VALUES (CURRENT_DATE, 'TEST-HUY-ITEM', 'Test hủy phiếu', 10, 'TEST-NCC', 'TEST-LOC', 'Nhập mới', 'PNK-00000000-99');

  -- Hủy → tồn phải về 0 (dòng bị xóa), du_lieu_nhap sạch, log đã đánh dấu
  v_res := huy_phieu('PNK-00000000-99', 'tester', 'test tự động');
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST FAIL: RPC không trả ok'; END IF;
  SELECT quantity INTO v_qty FROM inventory_stock WHERE item_code = 'TEST-HUY-ITEM' AND location = 'TEST-LOC';
  IF v_qty IS NOT NULL THEN RAISE EXCEPTION 'TEST FAIL: tồn chưa được đảo về 0'; END IF;
  IF EXISTS (SELECT 1 FROM du_lieu_nhap WHERE phieu_code = 'PNK-00000000-99') THEN RAISE EXCEPTION 'TEST FAIL: du_lieu_nhap chưa xóa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_picking_logs WHERE order_code = 'PNK-00000000-99' AND is_cancelled) THEN RAISE EXCEPTION 'TEST FAIL: log chưa đánh dấu hủy'; END IF;

  -- Hủy lần 2 → phải bị chặn
  BEGIN
    PERFORM huy_phieu('PNK-00000000-99', 'tester', 'test lần 2');
    RAISE EXCEPTION 'TEST FAIL: hủy lần 2 không bị chặn';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TEST FAIL%' THEN RAISE; END IF; -- lỗi mong đợi thì nuốt
  END;

  -- Dọn dữ liệu test
  DELETE FROM inventory_picking_logs WHERE order_code = 'PNK-00000000-99';
  DELETE FROM inventory_items WHERE item_code = 'TEST-HUY-ITEM';
  RAISE NOTICE '✅ huy_phieu: TEST PASS';
END $$;
