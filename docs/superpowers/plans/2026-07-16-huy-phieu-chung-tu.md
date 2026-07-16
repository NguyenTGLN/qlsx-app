# Hủy Phiếu (đảo ngược chứng từ kho) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nút "Hủy Phiếu" trên tab Quản Lý Chứng Từ: đảo ngược nguyên tử toàn bộ hiệu ứng của 1 chứng từ đã lưu (tồn kho, luu_xuat/du_lieu_nhap, WIP, lệnh SX, thống kê), chuyển chứng từ thành "Đã hủy".

**Architecture:** Toàn bộ nghiệp vụ hủy nằm trong RPC PL/pgSQL `huy_phieu` (1 transaction, SECURITY DEFINER). App chỉ ghi thêm cột truy vết `phieu_code`/`wip_source` khi tạo phiếu, và gọi RPC từ PrintQueueTab. Trigger AFTER DELETE mới trên `luu_xuat` tự trừ `thong_ke_ban_hang`.

**Tech Stack:** Supabase (PostgreSQL PL/pgSQL, RLS), React (JSX inline style theo codebase), vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-huy-phieu-chung-tu-design.md`

---

## File map

| File | Việc |
|---|---|
| `sql/create_huy_phieu.sql` | TẠO MỚI: cột mới 4 bảng + trigger DELETE thống kê + hàm `huy_phieu` + test block |
| `src/lib/cancelDoc.js` | TẠO MỚI: wrapper gọi RPC + phân loại lỗi |
| `src/lib/cancelDoc.test.js` | TẠO MỚI: test wrapper (mock supabase như docGuard.test.js) |
| `src/lib/permRegistry.js` | Thêm cap `cancelDoc` |
| `src/lib/permRegistry.test.js` | Thêm test cap mới |
| `src/pages/kho/ImportStockTab.jsx` | Ghi `phieu_code` vào du_lieu_nhap; log tách nguồn + `wip_source` cho Nhập thành phẩm |
| `src/pages/kho/ProductionOrderTab.jsx` | Ghi `phieu_code` vào luu_xuat (mọi mode) + du_lieu_nhap (phân rã) |
| `src/pages/WorkerInput.jsx` | Ghi `phieu_code` vào du_lieu_nhap |
| `src/pages/kho/PrintQueueTab.jsx` | Trạng thái Đã hủy + filter + nút Hủy + modal + gọi RPC |
| `src/pages/kho/KhoHangApp.jsx` | Truyền `cancelPerm` xuống PrintQueueTab |

---

### Task 1: SQL — schema + trigger + RPC `huy_phieu`

**Files:**
- Create: `sql/create_huy_phieu.sql`

- [ ] **Step 1: Viết file SQL đầy đủ**

```sql
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
  RAISE NOTICE '✅ huy_phieu: TEST PASS';
END $$;
```

- [ ] **Step 2: Soát chéo file với spec** (đủ: cột, trigger DELETE, chặn PSX có production_logs, WIP nguyên vẹn, phieu_code bắt buộc, GRANT, test block)

- [ ] **Step 3: Commit**

```bash
git add sql/create_huy_phieu.sql
git commit -m "feat(kho): SQL RPC huy_phieu - dao nguoc chung tu nguyen tu + trigger tru thong ke"
```

---

### Task 2: lib `cancelDoc.js` (TDD)

**Files:**
- Create: `src/lib/cancelDoc.js`
- Test: `src/lib/cancelDoc.test.js`

- [ ] **Step 1: Viết test trước** (`src/lib/cancelDoc.test.js`, mock supabase kiểu docGuard.test.js)

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult = { data: null, error: null };
const rpcCalls = [];

vi.mock('./supabase', () => ({
  supabase: { rpc: (fn, args) => { rpcCalls.push({ fn, args }); return Promise.resolve(rpcResult); } },
}));

const { cancelPhieu } = await import('./cancelDoc');

beforeEach(() => { rpcResult = { data: null, error: null }; rpcCalls.length = 0; });

describe('cancelPhieu', () => {
  it('gọi RPC huy_phieu với đúng tham số và trả kết quả', async () => {
    rpcResult = { data: { ok: true, order_code: 'PNK-1', reversed_lines: 3 }, error: null };
    const res = await cancelPhieu('PNK-1', 'user A', 'nhập nhầm');
    expect(rpcCalls[0].fn).toBe('huy_phieu');
    expect(rpcCalls[0].args).toEqual({ p_order_code: 'PNK-1', p_user: 'user A', p_reason: 'nhập nhầm' });
    expect(res.ok).toBe(true);
    expect(res.reversed_lines).toBe(3);
  });

  it('thiếu lý do → ném lỗi ngay, không gọi RPC', async () => {
    await expect(cancelPhieu('PNK-1', 'u', '  ')).rejects.toThrow(/lý do/i);
    expect(rpcCalls).toHaveLength(0);
  });

  it('RPC trả lỗi nghiệp vụ (chặn) → ném lỗi mang message từ DB', async () => {
    rpcResult = { data: null, error: { message: 'Không thể hủy: mã X tại vị trí Y chỉ còn 2, cần 5 để đảo (hàng đã được dùng tiếp).' } };
    await expect(cancelPhieu('PNK-1', 'u', 'lý do')).rejects.toThrow(/chỉ còn 2/);
  });

  it('hàm chưa tồn tại trên DB (chưa chạy SQL) → lỗi hướng dẫn chạy SQL', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.huy_phieu' } };
    await expect(cancelPhieu('PNK-1', 'u', 'lý do')).rejects.toThrow(/create_huy_phieu\.sql/);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/lib/cancelDoc.test.js` → FAIL (module chưa tồn tại)

- [ ] **Step 3: Viết `src/lib/cancelDoc.js`**

```js
// ============================================================
// HỦY PHIẾU — wrapper gọi RPC huy_phieu (đảo ngược chứng từ nguyên tử).
// Toàn bộ nghiệp vụ (đảo tồn, chặn âm kho, WIP, lệnh SX, thống kê) nằm
// trong hàm Postgres — xem sql/create_huy_phieu.sql. Ở đây chỉ gọi + dịch lỗi.
// ============================================================
import { supabase as db } from './supabase';

export async function cancelPhieu(orderCode, user, reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('Vui lòng nhập lý do hủy phiếu.');
  }
  const { data, error } = await db.rpc('huy_phieu', {
    p_order_code: orderCode,
    p_user: user || null,
    p_reason: String(reason).trim(),
  });
  if (error) {
    // Hàm chưa tồn tại (chưa chạy SQL) → hướng dẫn rõ thay vì lỗi khó hiểu
    const msg = String(error.message || '');
    if (error.code === 'PGRST202' || /could not find the function/i.test(msg)) {
      throw new Error('Chức năng Hủy Phiếu chưa được kích hoạt trên máy chủ — cần chạy sql/create_huy_phieu.sql trong Supabase SQL Editor.');
    }
    throw new Error(msg);
  }
  return data; // { ok, order_code, reversed_lines }
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS** — `npx vitest run src/lib/cancelDoc.test.js` → 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/cancelDoc.js src/lib/cancelDoc.test.js
git commit -m "feat(kho): lib cancelDoc goi RPC huy_phieu + test"
```

---

### Task 3: Quyền `cancelDoc`

**Files:**
- Modify: `src/lib/permRegistry.js` (dòng 7-12 và dòng 33)
- Test: `src/lib/permRegistry.test.js`

- [ ] **Step 1: Thêm test vào `src/lib/permRegistry.test.js`** (theo pattern test hiện có trong file)

```js
describe('cancelDoc cap (Hủy Phiếu)', () => {
  it('print_queue có cap cancelDoc; admin mặc định được', () => {
    const admin = { role: 'ADMIN', permissions: {} };
    expect(getTabPerm(admin, 'kho', 'print_queue').cancelDoc).toBe(true);
  });
  it('user thường chỉ được khi tick đúng key', () => {
    const u = { role: 'USER', permissions: { 'tab.kho.print_queue.view': true } };
    expect(getTabPerm(u, 'kho', 'print_queue').cancelDoc).toBe(false);
    const u2 = { role: 'USER', permissions: { 'tab.kho.print_queue.cancelDoc': true } };
    expect(getTabPerm(u2, 'kho', 'print_queue').cancelDoc).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test FAIL** — `npx vitest run src/lib/permRegistry.test.js`

- [ ] **Step 3: Sửa `permRegistry.js`** — 3 chỗ:

```js
export const ALL_CAPS = ['view', 'create', 'edit', 'delete', 'io', 'sendForm', 'cancelLan', 'cancelDoc'];

export const CAP_LABEL = {
  view: 'Xem', create: 'Thêm', edit: 'Sửa', delete: 'Xóa', io: 'N/X',
  sendForm: 'Gửi Form', cancelLan: 'Hủy Lần', cancelDoc: 'Hủy Phiếu',
};
```

và dòng tab print_queue:

```js
      { id: 'print_queue',      label: 'Quản Lý Chứng Từ',         caps: ['view', 'cancelDoc'] }, // in/in lại + hủy phiếu (đảo chứng từ)
```

- [ ] **Step 4: Chạy test PASS** — `npx vitest run src/lib/permRegistry.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/permRegistry.js src/lib/permRegistry.test.js
git commit -m "feat(perm): cap cancelDoc (Huy Phieu) cho tab Quan Ly Chung Tu"
```

---

### Task 4: Ghi `phieu_code` — ProductionOrderTab + WorkerInput

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (hàm `confirmDeductAndCreateOrder`)
- Modify: `src/pages/WorkerInput.jsx` (insert `du_lieu_nhap`)

- [ ] **Step 1: ProductionOrderTab — 4 chỗ trong `confirmDeductAndCreateOrder`:**

(a) 2 chỗ `duLieuNhapArr.push({...})` nhánh disassemble (dòng ~948 và ~973): thêm `phieu_code: pnkCode,` vào object.

(b) `extraSlbData.push({...})` nhánh disassemble exportImmediately (dòng ~960): thêm `phieu_code: pxkCode,`.

(c) Khối slbData (mục 6, dòng ~1155-1188): thêm `phieu_code` cho cả 3 nhánh:

```js
      if (mode === 'delivery' || mode === 'manual_export') {
         slbData = orderItems.map(item => ({
            ma_don_hang: item.orderCode, // PXK-... (hoặc PSX-... nếu chọn Phiếu SX)
            ma_san_pham: item.productCode,
            ten_san_pham: item.productName,
            so_luong: item.qty,
            ngay_xuat: todayLocal(),
            type: item.type,
            phieu_code: orderCode, // truy vết về chứng từ PDH/PXK để Hủy Phiếu xóa đúng dòng
            created_at: new Date(baseTimeMs).toISOString()
         }));
      } else if (mode === 'disassemble') {
         slbData.push({
            ma_don_hang: orderCode,
            ma_san_pham: allocations[0].code,
            ten_san_pham: allocations[0].name,
            so_luong: allocations[0].requiredQty,
            ngay_xuat: todayLocal(),
            phieu_code: orderCode, // PPR
            created_at: new Date(baseTimeMs).toISOString()
         });
         slbData = slbData.concat(extraSlbData);
      } else {
         allocations.forEach(comp => {
            const totalTaken = comp.allocations.reduce((sum, a) => sum + a.taken, 0);
            if (totalTaken !== 0) {
               slbData.push({
                  ma_don_hang: orderCode,
                  ma_san_pham: comp.code,
                  ten_san_pham: comp.name,
                  so_luong: totalTaken,
                  ngay_xuat: todayLocal(),
                  phieu_code: orderCode, // PSX
                  created_at: new Date(baseTimeMs).toISOString()
               });
            }
         });
      }
```

- [ ] **Step 2: WorkerInput — insert `du_lieu_nhap`** (dòng ~415): thêm `phieu_code: importOrderCode`:

```js
          await supabase.from('du_lieu_nhap').insert({
            ngay_nhap: todayStr,
            ma_hang: order.product_code,
            ten_hang: pName,
            so_luong_nhap: qty,
            ma_ncc: order.order_code,
            kho_nhap: locName,
            ly_do_nhap: 'Nhập thành phẩm',
            phieu_code: importOrderCode, // truy vết về chứng từ PNK để Hủy Phiếu
          });
```

- [ ] **Step 3: Build xác nhận không lỗi** — `npx vite build` → ✓ built

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx src/pages/WorkerInput.jsx
git commit -m "feat(kho): ghi phieu_code vao luu_xuat/du_lieu_nhap khi tao phieu (PSX/PDH/PXK/PPR/PNK auto)"
```

---

### Task 5: Ghi `phieu_code` + `wip_source` — ImportStockTab

**Files:**
- Modify: `src/pages/kho/ImportStockTab.jsx` (hàm `executeImport`)

Bối cảnh: hiện `agg` gộp theo `code||location` qua nhiều khối nguồn → 1 dòng log không tách được số trả về WIP nào khi 2 PSX cùng đổ 1 mã về 1 vị trí. Giải pháp: GIỮ nguyên agg cho cập nhật tồn (đúng), thêm breakdown theo nguồn chỉ để phát sinh dòng log khi "Nhập thành phẩm".

- [ ] **Step 1: Thêm breakdown nguồn vào agg** — trong vòng lặp build agg (dòng ~573-589), sau `agg[key].sumImport += q;` thêm:

```js
              agg[key].sumImport += q;
              // Breakdown theo nguồn: chỉ dùng cho "Nhập thành phẩm" để mỗi dòng log
              // mang wip_source riêng (hủy phiếu trả WIP đúng phiếu SX nguồn).
              if (reason === 'Nhập thành phẩm') {
                const src = b.sourceValue || '';
                if (!agg[key].bySource) agg[key].bySource = {};
                agg[key].bySource[src] = (agg[key].bySource[src] || 0) + q;
              }
```

- [ ] **Step 2: Phát sinh log tách nguồn** — thay khối `pickingLogs.push({...})` trong vòng `for (const key in agg)` (dòng ~634-646) bằng:

```js
        if (reason === 'Nhập thành phẩm' && a.bySource && Object.keys(a.bySource).length > 0) {
          // 1 dòng log / mỗi phiếu SX nguồn — wip_source để Hủy Phiếu cộng trả đúng WIP.
          let running = before;
          for (const [src, q] of Object.entries(a.bySource)) {
            pickingLogs.push({
              order_code: orderCode,
              product_code: 'NHAP_KHO',
              component_code: a.code,
              component_name: a.name,
              location: a.location,
              quantity_before: running,
              quantity_taken: q,
              quantity_after: running + q,
              created_by: userStr,
              notes: src ? `${reason} - ${src}` : reason,
              ma_don_hang: a.orderCodes.size > 0 ? [...a.orderCodes].join(', ') : null,
              wip_source: src && src.startsWith('PSX-') ? src : null,
            });
            running += q;
          }
        } else {
          pickingLogs.push({
            order_code: orderCode,
            product_code: 'NHAP_KHO',
            component_code: a.code,
            component_name: a.name,
            location: a.location,
            quantity_before: before,
            quantity_taken: a.sumImport,
            quantity_after: after,
            created_by: userStr,
            notes: srcStr ? `${reason} - ${srcStr}` : reason,
            ma_don_hang: a.orderCodes.size > 0 ? [...a.orderCodes].join(', ') : null
          });
        }
```

- [ ] **Step 3: Ghi `phieu_code` vào du_lieu_nhap** — trong `duLieuNhap.push({...})` (dòng ~593-603) thêm dòng cuối:

```js
              ma_don_hang_nhap: (b.sourceType === 'none' && b.orderCode) ? b.orderCode.trim() : null,
              phieu_code: orderCode, // truy vết về chứng từ PNK để Hủy Phiếu xóa đúng dòng
```

- [ ] **Step 4: Build + toàn bộ test** — `npx vite build && npx vitest run` → build ✓, tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/kho/ImportStockTab.jsx
git commit -m "feat(kho): PNK ghi phieu_code + wip_source, log tach theo nguon PSX khi Nhap thanh pham"
```

---

### Task 6: PrintQueueTab — trạng thái Đã hủy + nút Hủy + modal

**Files:**
- Modify: `src/pages/kho/PrintQueueTab.jsx`
- Modify: `src/pages/kho/KhoHangApp.jsx:898`

- [ ] **Step 1: Nhận props + import** — đổi signature và import:

```js
import { cancelPhieu } from '../../lib/cancelDoc';
// icon thêm: Ban (lucide-react) vào dòng import icon hiện có

export default function PrintQueueTab({ cancelPerm = false }) {
```

- [ ] **Step 2: Gom trạng thái hủy trong `loadData`** — trong `orderMap.set(...)` thêm `is_cancelled: !!log.is_cancelled`; nhánh else thêm `if (log.is_cancelled) existing.is_cancelled = true;`

- [ ] **Step 3: Filter** — thêm option + luật lọc:

```js
  const filteredOrders = orders.filter(o => {
    if (filter === 'UNPRINTED' && (o.is_printed || o.is_cancelled)) return false;
    if (filter === 'PRINTED' && (!o.is_printed || o.is_cancelled)) return false;
    if (filter === 'CANCELLED' && !o.is_cancelled) return false;
    ...
```

và trong `<select>`: `<option value="CANCELLED">Đã Hủy</option>` (trước option ALL).

- [ ] **Step 4: Chặn in/chọn phiếu hủy** — đầu `handlePrintBatch`: `ordersArray = ordersArray.filter(o => !o.is_cancelled); if (ordersArray.length === 0) return;`. `toggleAll` dùng danh sách `filteredOrders.filter(o => !o.is_cancelled)`. Checkbox từng dòng: `disabled={o.is_cancelled}`.

- [ ] **Step 5: State + handler hủy:**

```js
  const [cancelTarget, setCancelTarget] = useState(null); // order đang hủy
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const handleCancelDoc = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { alert('Vui lòng nhập lý do hủy phiếu.'); return; }
    setCancelBusy(true);
    try {
      const user = localStorage.getItem('qlsx_user') || 'Nhân viên';
      const res = await cancelPhieu(cancelTarget.order_code, user, cancelReason);
      alert(`Đã hủy phiếu ${res.order_code} (đảo ${res.reversed_lines} dòng). Tồn kho đã hoàn về trạng thái trước khi lập phiếu.`);
      setCancelTarget(null);
      setCancelReason('');
      await loadData();
    } catch (e) {
      alert('Không thể hủy phiếu:\n' + e.message);
    }
    setCancelBusy(false);
  };
```

- [ ] **Step 6: UI dòng bảng** — cột Trạng Thái thêm nhánh đầu tiên:

```jsx
{o.is_cancelled ? (
  <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#f1f5f9', color:'#64748b', padding:'4px 8px', borderRadius:20, fontSize:'0.75rem', fontWeight:700, textDecoration:'line-through'}}>
     <Ban size={14}/> Đã Hủy
  </span>
) : o.is_printed ? ( ...giữ nguyên... ) : ( ...giữ nguyên... )}
```

Cột Thao Tác: phiếu hủy → thay nút In bằng chữ mờ `<span style={{color:'#94a3b8', fontSize:'0.75rem'}}>Đã hủy</span>`; phiếu thường → giữ nút In, và nếu `cancelPerm` thêm nút:

```jsx
{cancelPerm && !o.is_cancelled && (
  <button onClick={() => { setCancelTarget(o); setCancelReason(''); }} disabled={loading}
    style={{background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', padding:'6px 10px', borderRadius:6, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, marginLeft:6}}>
    <Ban size={14}/> Hủy
  </button>
)}
```

- [ ] **Step 7: Modal xác nhận hủy** — thêm trước modal xác nhận in (theo pattern modal hiện có trong file):

```jsx
{cancelTarget && (
  <div className="no-print" style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
    <div style={{background:'#fff', width:'430px', maxWidth:'92vw', borderRadius:16, overflow:'hidden', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
      <div style={{background:'#fef2f2', padding:'1.25rem 1.5rem', borderBottom:'1px solid #fecaca'}}>
        <h3 style={{margin:0, fontSize:'1.1rem', color:'#991b1b', fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
          <Ban size={20}/> Hủy Phiếu {cancelTarget.order_code}
        </h3>
      </div>
      <div style={{padding:'1.25rem 1.5rem'}}>
        <p style={{margin:'0 0 0.75rem 0', fontSize:'0.85rem', color:'#334155'}}>
          Hệ thống sẽ <b>đảo ngược toàn bộ</b>: hoàn tồn kho về đúng vị trí, gỡ dữ liệu nhập/xuất và thống kê liên quan. Phiếu chuyển thành <b>"Đã Hủy"</b> (không in, không khôi phục được).
        </p>
        {cancelTarget.is_printed && (
          <p style={{margin:'0 0 0.75rem 0', fontSize:'0.8rem', color:'#dc2626', fontWeight:700}}>⚠️ Phiếu này ĐÃ IN — hãy thu hồi bản in giấy sau khi hủy.</p>
        )}
        <label style={{fontSize:'0.8rem', fontWeight:700, color:'#475569', display:'block', marginBottom:4}}>Lý do hủy (bắt buộc)</label>
        <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
          placeholder="VD: khách hủy đơn / lập nhầm phiếu..."
          style={{width:'100%', padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:'0.85rem', outline:'none', resize:'vertical', boxSizing:'border-box'}} />
      </div>
      <div style={{padding:'1rem 1.5rem', background:'#f8fafc', display:'flex', gap:'0.75rem', borderTop:'1px solid #e2e8f0'}}>
        <button onClick={() => setCancelTarget(null)} disabled={cancelBusy}
          style={{flex:1, padding:'0.6rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:700, cursor:'pointer'}}>Không hủy</button>
        <button onClick={handleCancelDoc} disabled={cancelBusy || !cancelReason.trim()}
          style={{flex:1, padding:'0.6rem', borderRadius:8, border:'none', background: cancelBusy || !cancelReason.trim() ? '#fca5a5' : '#dc2626', color:'#fff', fontWeight:700, cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:6}}>
          {cancelBusy ? <Loader2 size={16} className="spin"/> : <Ban size={16}/>} XÁC NHẬN HỦY
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 8: KhoHangApp truyền quyền** — dòng 898:

```jsx
      ) : activeTab === 'print_queue' ? (
        <PrintQueueTab cancelPerm={tp.cancelDoc === true} />
```

- [ ] **Step 9: Build + test toàn bộ** — `npx vite build && npx vitest run` → ✓

- [ ] **Step 10: Commit**

```bash
git add src/pages/kho/PrintQueueTab.jsx src/pages/kho/KhoHangApp.jsx
git commit -m "feat(kho): nut Huy Phieu + trang thai Da Huy tren tab Quan Ly Chung Tu (quyen cancelDoc)"
```

---

### Task 7: Verify end-to-end (sau khi user chạy SQL)

- [ ] **Step 1:** Nhắc user chạy `sql/create_huy_phieu.sql` trên Supabase SQL Editor — xem NOTICE `✅ huy_phieu: TEST PASS`.
- [ ] **Step 2:** Preview local (theo memory qlsx-preview-verification): login → Kho → tạo 1 phiếu Nhập mới TEST số lượng nhỏ vào vị trí thật ít dùng → tab Chứng từ → Hủy → kiểm tồn về nguyên trạng, phiếu badge Đã Hủy, filter Đã Hủy thấy phiếu.
- [ ] **Step 3:** Thử hủy lại lần 2 → phải bị chặn "đã được hủy trước đó".
- [ ] **Step 4:** Build bản deploy `npx vite build` + nhắc user kéo-thả `deploy-netlify/` (Netlify chưa auto-deploy — memory qlsx-netlify-deploy).
```
