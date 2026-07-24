# Chuyển SX trước (kê nguyên liệu ra vị trí SX4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "CHUYỂN SX TRƯỚC" ở màn kết quả phiếu sản xuất, dồn toàn bộ nguyên liệu đang có của phiếu về vị trí tập kết `SX4-DD/MM/YYYY` mà không tạo bất kỳ phiếu/lệnh sản xuất nào.

**Architecture:** Logic quy đổi `allocations` → kế hoạch ghi kho nằm trong module thuần mới `src/lib/stagingMove.js` (có test đầy đủ); `ProductionOrderTab.jsx` chỉ lo I/O Supabase và UI. Chứng từ `PCV-YYYYMMDD-NN` ghi vào `inventory_picking_logs` nên tự động dùng lại cơ chế in + Hủy Phiếu sẵn có; RPC `huy_phieu` được mở rộng để nhận prefix `PCV`. Tồn ở `SX4-*` được ưu tiên lấy trước trong phân bổ sản xuất qua tuỳ chọn mới của `applyPriorityOrder`.

**Tech Stack:** React 19 + Vite, Supabase (PostgREST + RPC plpgsql), vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-24-chuyen-sx-truoc-design.md`

---

## Bối cảnh cần biết trước khi code

- Lệnh chạy test: `npm test` (vitest run). Chạy 1 file: `npm test -- src/lib/stagingMove.test.js`.
- `inventory_stock` có ràng buộc **UNIQUE (item_code, location)** — mỗi mã ở mỗi vị trí đúng 1 dòng.
  Vì vậy cộng vào vị trí đích phải "tìm rồi update, không có mới insert", không được insert mù.
- Bảng `inventory_picking_logs` là nguồn dữ liệu của tab **Quản Lý Chứng Từ** (`PrintQueueTab.jsx`):
  nó gom log theo `order_code`, suy ra loại phiếu từ prefix, và nút Hủy Phiếu gọi RPC `huy_phieu`.
- Toàn bộ chú thích code trong dự án viết bằng **tiếng Việt**; giữ đúng phong cách đó.

## File Structure

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `src/lib/stagingMove.js` | **Tạo mới** | Thuần dữ liệu: tên vị trí tập kết + quy đổi `allocations` → kế hoạch chuyển kho |
| `src/lib/stagingMove.test.js` | **Tạo mới** | Test cho module trên |
| `src/lib/productionAlloc.js` | Sửa | Thêm nhóm ưu tiên `SX4-*` vào `applyPriorityOrder`, bật cho `allocateFIFO` |
| `src/lib/productionAlloc.test.js` | Sửa | Test ưu tiên SX4 |
| `src/pages/kho/ProductionOrderTab.jsx` | Sửa | Nút + handler ghi kho, ghi log, chống trùng |
| `src/pages/kho/PrintQueueTab.jsx` | Sửa | Nhãn loại phiếu cho prefix `PCV` |
| `sql/them_phieu_chuyen_sx.sql` | **Tạo mới** | Mở rộng RPC `huy_phieu` nhận prefix `PCV` + test tự chạy |

---

### Task 1: Module thuần `stagingMove`

**Files:**
- Create: `src/lib/stagingMove.js`
- Test: `src/lib/stagingMove.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/stagingMove.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildStagingLocation, buildStagingMoves } from './stagingMove';

describe('buildStagingLocation', () => {
  it('ngày phiếu YYYY-MM-DD → SX4-DD/MM/YYYY', () => {
    expect(buildStagingLocation('2026-07-24')).toBe('SX4-24/07/2026');
  });

  it('ngày rỗng / sai định dạng → ném lỗi (không tạo vị trí rác trong kho)', () => {
    expect(() => buildStagingLocation('')).toThrow();
    expect(() => buildStagingLocation('24/07/2026')).toThrow();
    expect(() => buildStagingLocation(undefined)).toThrow();
  });
});

describe('buildStagingMoves', () => {
  const DEST = 'SX4-24/07/2026';

  it('gộp nhiều vị trí nguồn của cùng 1 mã thành 1 dòng chuyển', () => {
    const { moves, totalQty, totalCodes, skippedCodes } = buildStagingMoves([
      { code: 'A', name: 'Linh kiện A', unit: 'Cái', allocations: [
        { stock_id: 1, location: 'HH1', before: 10, taken: 10, remaining: 0 },
        { stock_id: 2, location: 'HH2', before: 8, taken: 5, remaining: 3 },
      ] },
    ], DEST);
    expect(totalCodes).toBe(1);
    expect(totalQty).toBe(15);
    expect(skippedCodes).toEqual([]);
    expect(moves[0]).toMatchObject({ code: 'A', name: 'Linh kiện A', unit: 'Cái', total: 15 });
    expect(moves[0].sources.map(s => s.location)).toEqual(['HH1', 'HH2']);
    expect(moves[0].sources[1]).toMatchObject({ stock_id: 2, before: 8, taken: 5, remaining: 3 });
  });

  it('mã thiếu hàng vẫn chuyển phần đang có', () => {
    const { moves, totalQty } = buildStagingMoves([
      { code: 'A', name: 'a', unit: 'Cái', requiredQty: 100, missing: 94, isShortage: true,
        allocations: [{ stock_id: 1, location: 'HH1', before: 6, taken: 6, remaining: 0 }] },
    ], DEST);
    expect(moves).toHaveLength(1);
    expect(totalQty).toBe(6);
  });

  it('mã hết sạch hàng (không có dòng phân bổ) → vào skippedCodes, không tạo move', () => {
    const { moves, skippedCodes, totalQty } = buildStagingMoves([
      { code: 'B', name: 'b', unit: 'Cái', allocations: [] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['B']);
    expect(totalQty).toBe(0);
  });

  it('bỏ dòng tháo máy (SL âm, không có stock_id)', () => {
    const { moves, skippedCodes } = buildStagingMoves([
      { code: 'C', name: 'c', unit: 'Cái', allocations: [
        { stock_id: null, location: 'SX9-PSX-20260724-01', before: 0, taken: -4, remaining: 4 },
      ] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['C']);
  });

  it('bỏ dòng nguồn đã nằm sẵn ở vị trí đích (không trừ rồi cộng lại chính nó)', () => {
    const { moves, totalQty } = buildStagingMoves([
      { code: 'D', name: 'd', unit: 'Cái', allocations: [
        { stock_id: 9, location: DEST, before: 20, taken: 20, remaining: 0 },
        { stock_id: 10, location: 'HH3', before: 5, taken: 5, remaining: 0 },
      ] },
    ], DEST);
    expect(moves[0].sources).toHaveLength(1);
    expect(moves[0].sources[0].stock_id).toBe(10);
    expect(moves[0].total).toBe(5);
    expect(totalQty).toBe(5);
  });

  it('mã nằm TRỌN ở vị trí đích → không có gì để chuyển', () => {
    const { moves, skippedCodes } = buildStagingMoves([
      { code: 'E', name: 'e', unit: 'Cái', allocations: [
        { stock_id: 9, location: DEST, before: 20, taken: 20, remaining: 0 },
      ] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['E']);
  });

  it('thiếu vị trí đích → ném lỗi', () => {
    expect(() => buildStagingMoves([], '')).toThrow();
  });

  it('unit rỗng → mặc định "Cái" (dòng tồn mới luôn cần đơn vị)', () => {
    const { moves } = buildStagingMoves([
      { code: 'F', name: 'f', allocations: [{ stock_id: 1, location: 'HH1', before: 2, taken: 2, remaining: 0 }] },
    ], DEST);
    expect(moves[0].unit).toBe('Cái');
  });

  it('allocations rỗng/null → kế hoạch rỗng, không ném lỗi', () => {
    expect(buildStagingMoves(null, DEST)).toEqual({ moves: [], totalQty: 0, totalCodes: 0, skippedCodes: [] });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó FAIL**

Run: `npm test -- src/lib/stagingMove.test.js`
Expected: FAIL — `Failed to resolve import "./stagingMove"`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/stagingMove.js`:

```js
// ============================================================
// CHUYỂN SX TRƯỚC — kê nguyên liệu của phiếu SX về 1 vị trí tập kết.
// Spec: docs/superpowers/specs/2026-07-24-chuyen-sx-truoc-design.md
//
// Nghiệp vụ: thiếu linh kiện nên KHÔNG lập được lệnh SX, nhưng xưởng vẫn muốn
// sản xuất trước bằng số hàng đang có → dồn hàng của phiếu về một vị trí duy
// nhất cho chuyền lấy. Hàng KHÔNG rời kho, chỉ đổi vị trí.
//
// Module này thuần dữ liệu (không gọi DB) để test được mọi nhánh lọc.
// ============================================================

// 'YYYY-MM-DD' → 'SX4-DD/MM/YYYY'.
// Ngày sai định dạng thì NÉM LỖI thay vì tạo vị trí rác kiểu 'SX4-undefined'
// (vị trí sai phải dọn tay trong kho, tốn hơn nhiều so với chặn tại đây).
export function buildStagingLocation(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) throw new Error('Ngày phiếu không hợp lệ, không tạo được vị trí tập kết: ' + dateStr);
  const [, y, mo, d] = m;
  return `SX4-${d}/${mo}/${y}`;
}

// Quy đổi kết quả phân bổ đang hiện trên phiếu thành kế hoạch ghi kho.
// allocations: [{ code, name, unit, allocations: [{ stock_id, location, before, taken, remaining }] }]
// → {
//     moves: [{ code, name, unit, total, sources: [{ stock_id, location, before, taken, remaining }] }],
//     totalQty, totalCodes,
//     skippedCodes,  // mã không có gì để chuyển (hết hàng / chỉ có dòng tháo máy / đã nằm sẵn ở đích)
//   }
export function buildStagingMoves(allocations, destLocation) {
  if (!destLocation) throw new Error('Thiếu vị trí đích khi chuyển SX trước.');

  const moves = [];
  const skippedCodes = [];
  let totalQty = 0;

  for (const comp of (allocations || [])) {
    const sources = (comp.allocations || []).filter(a =>
      a.stock_id                        // phải có dòng tồn thật để trừ
      && Number(a.taken) > 0            // bỏ dòng tháo máy (SL âm) và dòng 0
      && a.location !== destLocation    // đã nằm sẵn ở đích → trừ rồi cộng lại chính nó là vô nghĩa
    );

    if (sources.length === 0) { skippedCodes.push(comp.code); continue; }

    const total = sources.reduce((sum, a) => sum + Number(a.taken), 0);
    totalQty += total;
    moves.push({
      code: comp.code,
      name: comp.name,
      unit: comp.unit || 'Cái',
      total,
      sources: sources.map(a => ({
        stock_id: a.stock_id,
        location: a.location,
        before: Number(a.before),
        taken: Number(a.taken),
        remaining: Number(a.remaining),
      })),
    });
  }

  return { moves, totalQty, totalCodes: moves.length, skippedCodes };
}
```

- [ ] **Step 4: Chạy test để chắc chắn nó PASS**

Run: `npm test -- src/lib/stagingMove.test.js`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stagingMove.js src/lib/stagingMove.test.js
git commit -m "feat(kho): module thuan stagingMove cho Chuyen SX truoc"
```

---

### Task 2: Ưu tiên lấy tồn ở `SX4-*` trong phân bổ sản xuất

**Files:**
- Modify: `src/lib/productionAlloc.js:66-82` (`applyPriorityOrder`), `src/lib/productionAlloc.js:93` (trong `allocateFIFO`)
- Test: `src/lib/productionAlloc.test.js` (thêm block cuối file)

- [ ] **Step 1: Viết test thất bại**

Thêm vào **cuối** `src/lib/productionAlloc.test.js`:

```js
describe('ưu tiên vị trí tập kết SX4 (chuyển SX trước)', () => {
  const stock = [
    { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
    { id: 2, item_code: 'A', location: 'SX4-24/07/2026', quantity: 10 },
    { id: 3, item_code: 'A', location: 'SX11-VTSX', quantity: 10 },
  ];

  it('allocateFIFO lấy ở SX4 trước tiên dù không tick ưu tiên gì', () => {
    const { result } = allocateFIFO([{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], stock, {});
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'SX4-24/07/2026' });
  });

  it('SX4 đứng trên cả SX11 lẫn vị trí tự tick', () => {
    const out = applyPriorityOrder(stock, {
      prioritySX4: true, priorityVTSX: true, priorityLocations: ['HH1'],
    });
    expect(out.map(s => s.id)).toEqual([2, 3, 1]);
  });

  it('không bật prioritySX4 → giữ nguyên thứ tự nền', () => {
    const out = applyPriorityOrder(stock, {});
    expect(out.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('allocateExport KHÔNG ưu tiên SX4 (đơn hàng không cướp hàng đã kê ra chuyền)', () => {
    const { result } = allocateExport([{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], stock, {});
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 1, location: 'HH1' });
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó FAIL**

Run: `npm test -- src/lib/productionAlloc.test.js`
Expected: FAIL ở 2 test đầu — `allocateFIFO` trả `stock_id: 1` và `applyPriorityOrder` trả `[3, 1, 2]`.

- [ ] **Step 3: Sửa `applyPriorityOrder`**

Trong `src/lib/productionAlloc.js`, thay nguyên khối chú thích + hàm (dòng 66–82) bằng:

```js
// Xếp tồn theo 4 nhóm ưu tiên, GIỮ ổn định thứ tự nền (FIFO) trong mỗi nhóm:
//   Nhóm 0: kho tập kết SX4- (chỉ khi prioritySX4 — hàng đã kê ra chuyền, dùng nốt trước)
//   Nhóm 1: kho VTSX SX11- (chỉ khi priorityVTSX)
//   Nhóm 2: vị trí người dùng tự chọn (khớp CHÍNH XÁC theo Set)
//   Nhóm 3: phần còn lại
// Không bật ưu tiên nào → trả bản sao nguyên thứ tự.
export function applyPriorityOrder(stockRows, { priorityVTSX = false, priorityLocations = [], prioritySX4 = false } = {}) {
  const priSet = new Set(priorityLocations || []);
  const isSX11 = (s) => s.location && s.location.startsWith('SX11-');
  const isSX4 = (s) => s.location && s.location.startsWith('SX4-');
  if (!priorityVTSX && !prioritySX4 && priSet.size === 0) return [...(stockRows || [])];
  const tSX4 = [], t0 = [], t1 = [], t2 = [];
  for (const s of (stockRows || [])) {
    if (prioritySX4 && isSX4(s)) tSX4.push(s);
    else if (priorityVTSX && isSX11(s)) t0.push(s);
    else if (priSet.has(s.location)) t1.push(s);
    else t2.push(s);
  }
  return [...tSX4, ...t0, ...t1, ...t2];
}
```

- [ ] **Step 4: Bật ưu tiên SX4 cho phân bổ sản xuất**

Trong `src/lib/productionAlloc.js`, trong hàm `allocateFIFO`, thay dòng:

```js
  let available = applyPriorityOrder(JSON.parse(JSON.stringify(stockData || [])), { priorityVTSX, priorityLocations });
```

bằng:

```js
  // prioritySX4 luôn bật cho SẢN XUẤT: hàng đã "chuyển SX trước" ra vị trí tập kết
  // SX4- phải được dùng nốt trước khi đụng tới tồn kho thường.
  // KHÔNG bật ở allocateExport — đơn bán hàng không được lấy hàng đã kê ra chuyền.
  let available = applyPriorityOrder(JSON.parse(JSON.stringify(stockData || [])), { priorityVTSX, priorityLocations, prioritySX4: true });
```

- [ ] **Step 5: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ (kể cả các test cũ của `applyPriorityOrder` / `allocateFIFO` / `allocateExport`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/productionAlloc.js src/lib/productionAlloc.test.js
git commit -m "feat(kho): uu tien lay ton o vi tri tap ket SX4 khi phan bo san xuat"
```

---

### Task 3: Nút + luồng ghi kho trong `ProductionOrderTab`

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (import dòng 3 & 7, state dòng ~300 và ~339, `handleResetToCards` dòng ~1403, thêm handler trước `handleExecuteSave` dòng ~880, footer dòng ~1795-1812)

Task này không có unit test (là lớp I/O + UI, dự án không có test React); phần logic đã được test ở Task 1. Kiểm chứng bằng bước thủ công ở Task 6.

- [ ] **Step 1: Thêm icon + import module**

Thay dòng 3:

```js
import { Search, Loader2, Play, Printer, AlertCircle, CheckCircle, Package, Upload, Check, Download, RefreshCw, Edit3 } from 'lucide-react';
```

bằng:

```js
import { Search, Loader2, Play, Printer, AlertCircle, CheckCircle, Package, Upload, Check, Download, RefreshCw, Edit3, Forklift } from 'lucide-react';
```

Thay dòng 7:

```js
import { aggregateComponentDemand, allocateFIFO, allocateExport, buildFinishedItems, round1, compareLocations, sortStockForFIFO, sortResultByLocation } from '../../lib/productionAlloc';
```

bằng:

```js
import { aggregateComponentDemand, allocateFIFO, allocateExport, buildFinishedItems, round1, compareLocations, sortStockForFIFO, sortResultByLocation } from '../../lib/productionAlloc';
import { buildStagingLocation, buildStagingMoves } from '../../lib/stagingMove';
```

- [ ] **Step 2: Thêm ref chống trùng cho lần chuyển**

Thay:

```js
  const submittingRef = useRef(false);
```

bằng:

```js
  const submittingRef = useRef(false);
  // Token chống trùng RIÊNG cho thao tác "Chuyển SX trước" (không dùng chung với
  // token lưu phiếu SX). Giữ nguyên qua các lần bấm để lần 2 bị DB chặn.
  const moveTokenRef = useRef(null);
```

- [ ] **Step 3: Thêm state `isMoving`**

Thay:

```js
  const [isProcessing, setIsProcessing] = useState(false);
```

bằng:

```js
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMoving, setIsMoving] = useState(false); // đang chạy "Chuyển SX trước"
```

- [ ] **Step 4: Xoá token khi quay về lưới thẻ**

Trong `handleResetToCards`, thay:

```js
    setPriorityLocations([]);
    setRecomputeDemand(null);
  };
```

bằng:

```js
    setPriorityLocations([]);
    setRecomputeDemand(null);
    moveTokenRef.current = null; // phiếu mới → được phép chuyển SX trước lần nữa
  };
```

- [ ] **Step 5: Thêm handler `handleMoveToStaging`**

Chèn NGAY TRƯỚC dòng `  const handleExecuteSave = async () => {`:

```js
  // ── CHUYỂN SX TRƯỚC ────────────────────────────────────────────────────────
  // Dồn toàn bộ nguyên liệu đang có của phiếu về 1 vị trí tập kết SX4-<ngày phiếu>.
  // KHÔNG tạo phiếu/lệnh sản xuất, KHÔNG trừ nhu cầu DKSX, KHÔNG ghi luu_xuat:
  // hàng vẫn nằm trong kho, chỉ đổi vị trí. Chứng từ PCV-... để in & hủy được.
  // Spec: docs/superpowers/specs/2026-07-24-chuyen-sx-truoc-design.md
  const handleMoveToStaging = async () => {
    if (!allocations) return;

    let destLocation, plan;
    try {
      destLocation = buildStagingLocation(prodDate);
      plan = buildStagingMoves(allocations, destLocation);
    } catch (e) {
      return alert(e.message);
    }

    if (plan.totalCodes === 0) {
      return alert(`Không có linh kiện nào để chuyển (hết hàng, hoặc đã nằm sẵn ở ${destLocation}).`);
    }

    const warn = plan.skippedCodes.length > 0
      ? `\n\nBỏ qua ${plan.skippedCodes.length} mã không có hàng để chuyển: ${plan.skippedCodes.join(', ')}`
      : '';
    const ok = window.confirm(
      `Chuyển ${plan.totalCodes} mã / tổng ${fmtQty(plan.totalQty)} sang vị trí ${destLocation}?\n\n`
      + 'KHÔNG tạo phiếu sản xuất, KHÔNG tạo lệnh SX, KHÔNG trừ nhu cầu DKSX.\n'
      + 'Hàng vẫn nằm trong kho, chỉ đổi vị trí.' + warn
    );
    if (!ok) return;

    // Chặn bấm-kép tức thì (đồng bộ), không chờ re-render như disabled=
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsMoving(true);
    if (!moveTokenRef.current) moveTokenRef.current = newDocToken();

    try {
      const userStr = localStorage.getItem('user_id') || localStorage.getItem('username') || localStorage.getItem('staffName') || 'Nhân viên';

      // 1) Mã phiếu chuyển PCV-YYYYMMDD-NN
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestPcv } = await db.from('inventory_picking_logs')
        .select('order_code').ilike('order_code', `PCV-${todayStr}-%`)
        .order('order_code', { ascending: false }).limit(1);
      let seq = 1;
      if (latestPcv && latestPcv.length > 0) {
        const l = parseInt(latestPcv[0].order_code.split('-').pop(), 10);
        if (!isNaN(l)) seq = l + 1;
      }
      const pcvCode = `PCV-${todayStr}-${seq.toString().padStart(2, '0')}`;

      // 2) Chiếm token TRƯỚC khi động vào kho (bấm lại / nhiều tab → dừng)
      const claim = await claimDocToken(moveTokenRef.current, { orderCode: pcvCode, kind: 'staging_move', createdBy: userStr });
      if (!claim.ok) {
        alert('Thao tác chuyển này đã được gửi trước đó'
          + (claim.orderCode ? ` (phiếu ${claim.orderCode})` : '')
          + '.\nBấm "← Quay lại" rồi tính lại để xem tồn kho hiện tại.');
        return;
      }

      const baseTimeMs = Date.now();
      const pickingLogs = [];

      for (const mv of plan.moves) {
        // 2.1 Trừ từng vị trí nguồn. Giữ nguyên dòng có SL 0 (không xoá) để
        //     Hủy Phiếu tìm đúng dòng mà cộng trả lại.
        for (const src of mv.sources) {
          const { error: upErr } = await db.from('inventory_stock')
            .update({ quantity: src.remaining }).eq('id', src.stock_id);
          if (upErr) throw upErr;
          pickingLogs.push({
            order_code: pcvCode, product_code: 'CHUYEN_SX',
            component_code: mv.code, component_name: mv.name,
            location: src.location,
            quantity_before: src.before, quantity_taken: -src.taken, quantity_after: src.remaining,
            created_by: userStr, notes: `Chuyển SX trước → ${destLocation}`,
            created_at: new Date(baseTimeMs).toISOString(),
          });
        }

        // 2.2 Cộng vào vị trí đích. inventory_stock DUY NHẤT theo (item_code, location)
        //     nên phải tìm-rồi-update, chưa có mới insert.
        const { data: dest, error: destErr } = await db.from('inventory_stock')
          .select('id, quantity').eq('item_code', mv.code).eq('location', destLocation).maybeSingle();
        if (destErr) throw destErr;
        const destBefore = dest ? Number(dest.quantity) : 0;
        if (dest) {
          const { error: e2 } = await db.from('inventory_stock')
            .update({ quantity: destBefore + mv.total }).eq('id', dest.id);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await db.from('inventory_stock').insert({
            item_code: mv.code, item_name: mv.name, unit: mv.unit,
            location: destLocation, quantity: mv.total, import_date: todayLocal(),
          });
          if (e2) throw e2;
        }
        pickingLogs.push({
          order_code: pcvCode, product_code: 'CHUYEN_SX',
          component_code: mv.code, component_name: mv.name,
          location: destLocation,
          quantity_before: destBefore, quantity_taken: mv.total, quantity_after: destBefore + mv.total,
          created_by: userStr, notes: 'Nhận hàng chuyển SX trước',
          created_at: new Date(baseTimeMs + 1000).toISOString(), // in sau dòng xuất
        });
      }

      const { error: logErr } = await db.from('inventory_picking_logs').insert(pickingLogs);
      if (logErr) console.warn('Không thể lưu log chuyển SX:', logErr);

      alert(`Đã chuyển ${plan.totalCodes} mã sang vị trí ${destLocation}.\n`
        + `Phiếu chuyển: ${pcvCode} — in ở tab Quản Lý Chứng Từ.\n`
        + 'Không có phiếu sản xuất nào được tạo.');
      handleResetToCards();
    } catch (e) {
      console.error(e);
      // CỐ Ý KHÔNG nhả token: cộng vào vị trí đích không idempotent, bấm lại có
      // thể cộng đúp. Đường phục hồi an toàn là tính lại từ tồn kho thật.
      alert('Lỗi khi chuyển SX trước: ' + e.message
        + '\n\nCó thể MỘT PHẦN đã được chuyển. Bấm "← Quay lại", tính lại phiếu'
        + ' và kiểm tra tab Tồn vị trí trước khi thử lần nữa.');
    } finally {
      setIsMoving(false);
      submittingRef.current = false;
    }
  };

```

- [ ] **Step 6: Thêm nút vào footer**

Thay khối (khoảng dòng 1795–1812):

```jsx
            {/* Footer / Action */}
            <div className="no-print" style={{marginTop:'2rem',display:'flex',justifyContent:'flex-end',gap:'1rem'}}>
              {orderCreated ? (
                <div style={{display:'flex',alignItems:'center',gap:10,color:'#16a34a',fontWeight:700,padding:'0.5rem 1rem',background:'#dcfce7',borderRadius:8}}>
                  <CheckCircle size={20}/>
                  ĐÃ XÁC NHẬN LỆNH & TRỪ KHO (Chờ In)
                </div>
              ) : (
                <button 
                  onClick={handleExecuteSave} 
                  disabled={isShortage || isProcessing} 
                  style={{...s.btn, ...(isShortage || isProcessing ? s.btnDisabled : {background:'#10b981', color:'#fff'})}}
                >
                  {isProcessing ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <Check size={16}/>}
                  LƯU PHIẾU (Chờ in)
                </button>
              )}
            </div>
```

bằng:

```jsx
            {/* Footer / Action */}
            <div className="no-print" style={{marginTop:'2rem',display:'flex',justifyContent:'flex-end',gap:'1rem'}}>
              {orderCreated ? (
                <div style={{display:'flex',alignItems:'center',gap:10,color:'#16a34a',fontWeight:700,padding:'0.5rem 1rem',background:'#dcfce7',borderRadius:8}}>
                  <CheckCircle size={20}/>
                  ĐÃ XÁC NHẬN LỆNH & TRỪ KHO (Chờ In)
                </div>
              ) : (
                <>
                  {/* Chuyển SX trước: CỐ Ý không khoá khi thiếu hàng — đó chính là
                      tình huống dùng nó (sản xuất trước bằng số nguyên liệu đang có). */}
                  {mode === 'production' && (
                    <button
                      onClick={handleMoveToStaging}
                      disabled={isProcessing || isMoving}
                      title="Dồn toàn bộ nguyên liệu đang có của phiếu về vị trí SX4 để sản xuất trước — KHÔNG tạo phiếu sản xuất"
                      style={{...s.btn, ...(isProcessing || isMoving ? s.btnDisabled : {background:'#f59e0b', color:'#fff'})}}
                    >
                      {isMoving ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <Forklift size={16}/>}
                      CHUYỂN SX TRƯỚC
                    </button>
                  )}
                  <button 
                    onClick={handleExecuteSave} 
                    disabled={isShortage || isProcessing || isMoving} 
                    style={{...s.btn, ...(isShortage || isProcessing || isMoving ? s.btnDisabled : {background:'#10b981', color:'#fff'})}}
                  >
                    {isProcessing ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <Check size={16}/>}
                    LƯU PHIẾU (Chờ in)
                  </button>
                </>
              )}
            </div>
```

- [ ] **Step 7: Kiểm tra lint + build**

Run: `npm run lint`
Expected: không có lỗi mới ở `ProductionOrderTab.jsx`.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 8: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): nut Chuyen SX truoc - don nguyen lieu ve vi tri SX4"
```

---

### Task 4: Nhãn loại phiếu `PCV` ở Quản Lý Chứng Từ

**Files:**
- Modify: `src/pages/kho/PrintQueueTab.jsx:73`

- [ ] **Step 1: Sửa nhãn**

Thay dòng 73:

```js
            type: log.order_code.startsWith('PNK') ? 'NHẬP KHO' : (log.order_code.startsWith('PXK') ? 'XUẤT KHO' : (log.order_code.startsWith('PDH') ? 'XUẤT LẮP RÁP' : (log.order_code.startsWith('PSX') ? 'XUẤT SẢN XUẤT' : 'KHÁC')))
```

bằng:

```js
            type: log.order_code.startsWith('PNK') ? 'NHẬP KHO' : (log.order_code.startsWith('PXK') ? 'XUẤT KHO' : (log.order_code.startsWith('PDH') ? 'XUẤT LẮP RÁP' : (log.order_code.startsWith('PSX') ? 'XUẤT SẢN XUẤT' : (log.order_code.startsWith('PCV') ? 'CHUYỂN VỊ TRÍ SX' : 'KHÁC'))))
```

- [ ] **Step 2: Build lại cho chắc**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 3: Commit**

```bash
git add src/pages/kho/PrintQueueTab.jsx
git commit -m "feat(kho): nhan CHUYEN VI TRI SX cho phieu PCV o Quan Ly Chung Tu"
```

---

### Task 5: Mở rộng RPC `huy_phieu` nhận prefix `PCV`

**Files:**
- Create: `sql/them_phieu_chuyen_sx.sql`
- Đọc tham chiếu: `sql/create_huy_phieu.sql:43-188` (bản gốc của hàm)

Hàm hiện tại chặn mọi prefix lạ (`RAISE EXCEPTION 'Loại phiếu % không hỗ trợ hủy.'`). Ta chỉ thêm một nhánh miễn kiểm tra bảng phụ cho `PCV` — vòng lặp đảo tồn sẵn có (`stock -= quantity_taken`) đã đúng cho cả dòng xuất (âm) lẫn dòng nhập (dương).

- [ ] **Step 1: Sinh file mới từ bản gốc của hàm**

```bash
cat > sql/them_phieu_chuyen_sx.sql <<'SQL'
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

SQL
sed -n '43,188p' sql/create_huy_phieu.sql >> sql/them_phieu_chuyen_sx.sql
```

Kiểm tra: `grep -c "" sql/them_phieu_chuyen_sx.sql` → khoảng 160 dòng, và
`grep -n "CREATE OR REPLACE FUNCTION public.huy_phieu" sql/them_phieu_chuyen_sx.sql` phải có 1 kết quả.

- [ ] **Step 2: Thêm nhánh PCV**

Trong `sql/them_phieu_chuyen_sx.sql`, thay:

```sql
  ELSE
    RAISE EXCEPTION 'Loại phiếu % không hỗ trợ hủy.', v_prefix;
  END IF;
```

bằng:

```sql
  ELSIF v_prefix = 'PCV' THEN
    -- Phiếu CHUYỂN VỊ TRÍ SX: hàng không rời kho nên không sinh luu_xuat /
    -- du_lieu_nhap → không có bảng phụ để kiểm tra. Vòng lặp đảo tồn bên dưới
    -- (stock -= quantity_taken) tự xử lý đúng: dòng xuất (âm) cộng trả về vị trí
    -- cũ, dòng nhập (dương) trừ khỏi vị trí tập kết SX4.
    NULL;
  ELSE
    RAISE EXCEPTION 'Loại phiếu % không hỗ trợ hủy.', v_prefix;
  END IF;
```

- [ ] **Step 3: Thêm khối test tự chạy**

```bash
cat >> sql/them_phieu_chuyen_sx.sql <<'SQL'

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
SQL
```

- [ ] **Step 4: Kiểm tra file đã đủ 3 phần**

```bash
grep -n "ELSIF v_prefix = 'PCV'\|GRANT EXECUTE ON FUNCTION public.huy_phieu\|TEST PASS" sql/them_phieu_chuyen_sx.sql
```

Expected: 3 dòng kết quả, theo đúng thứ tự nhánh PCV → GRANT → TEST PASS.

- [ ] **Step 5: Commit**

```bash
git add sql/them_phieu_chuyen_sx.sql
git commit -m "feat(kho): huy_phieu ho tro phieu chuyen vi tri SX (PCV)"
```

---

### Task 6: Chạy SQL + kiểm thử thủ công trên app

**Files:** không sửa file nào — đây là bước nghiệm thu.

- [ ] **Step 1: Chạy file SQL trên Supabase**

Mở Supabase Dashboard → SQL Editor → dán toàn bộ nội dung `sql/them_phieu_chuyen_sx.sql` → Run.
Expected: chạy xong không lỗi và có NOTICE `✅ huy_phieu PCV: TEST PASS`.

- [ ] **Step 2: Chạy toàn bộ test + build**

Run: `npm test`
Expected: PASS toàn bộ.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 3: Kiểm thử trên app (`npm run dev`)**

Lần lượt xác nhận từng mục:

1. Kho Hàng → PSX → Lệnh Sản Xuất → lập phiếu cho thành phẩm **thiếu linh kiện**.
   Màn kết quả: nút **LƯU PHIẾU** xám (khoá), nút **CHUYỂN SX TRƯỚC** màu cam bấm được.
2. Bấm CHUYỂN SX TRƯỚC → hộp xác nhận nêu đúng số mã, tổng SL, vị trí `SX4-<ngày phiếu>`.
   Đồng ý → báo mã `PCV-...` → màn hình quay về lưới chọn loại phiếu.
3. Tab **Tồn vị trí**: hàng đã nằm ở `SX4-<ngày>`; các vị trí cũ đã bị trừ đúng.
4. Tab **Tổng Quan Sản Xuất**: **không** có lệnh SX mới. Tab **DKSX**: nhu cầu **không** bị trừ.
5. Tab **Quản Lý Chứng Từ**: có `PCV-...` nhãn **CHUYỂN VỊ TRÍ SX**; in ra thấy đủ dòng xuất
   (vị trí cũ) rồi dòng nhập (SX4).
6. Lập phiếu SX mới cùng mã linh kiện → bảng phân bổ lấy ở `SX4-...` **trước tiên**.
7. Quay lại Quản Lý Chứng Từ → **Hủy** phiếu `PCV-...` (nhập lý do) → tồn quay về vị trí cũ,
   dòng ở SX4 biến mất.
8. Chuyển lần 2 trong cùng ngày → cộng dồn vào đúng `SX4-<ngày>`, không tạo dòng trùng
   (kiểm tra ở tab Tồn vị trí: mỗi mã chỉ 1 dòng ở vị trí đó).

- [ ] **Step 4: Commit (nếu có sửa vặt phát sinh)**

```bash
git add -A
git commit -m "fix(kho): sua theo kiem thu Chuyen SX truoc"
```
