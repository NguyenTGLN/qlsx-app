# Ưu tiên lấy ở vị trí tự chọn (Sản xuất + Đơn hàng) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng tick chọn nhiều vị trí kho làm "ưu tiên lấy trước" ở màn kết quả của phiếu Sản Xuất và Đơn Hàng, rồi tính lại phân bổ.

**Architecture:** Tổng quát hóa cơ chế `priorityVTSX` (cứng `SX11-`) thành hàm thuần `applyPriorityOrder` xếp tồn theo 3 nhóm ưu tiên (SX11 → tự chọn → còn lại), dùng chung cho `allocateFIFO` (sản xuất) và hàm mới `allocateExport` (đơn hàng). UI đặt panel chọn vị trí ở màn kết quả (không in ra phiếu), bấm "Tính lại" gọi `recomputeWithPriority` dựng lại tồn gốc từ `stockPool` và phân bổ lại.

**Tech Stack:** React 19, Vite, Vitest (đơn vị), Supabase JS. Logic thuần trong `src/lib/productionAlloc.js` (test bằng vitest).

**Spec:** `docs/superpowers/specs/2026-07-10-uu-tien-vi-tri-phieu-san-xuat-design.md`

---

## File Structure

- **`src/lib/productionAlloc.js`** — logic thuần. Thêm `applyPriorityOrder`, `allocateExport`; sửa `allocateFIFO` nhận `priorityLocations`.
- **`src/lib/productionAlloc.test.js`** — unit test cho 3 hàm trên.
- **`src/pages/kho/ProductionOrderTab.jsx`** — UI + wiring: state `priorityLocations`/`recomputeDemand`, panel "Ưu tiên vị trí", `recomputeWithPriority`, `PriorityLocationPicker`, refactor `handleCalculateDelivery` dùng `allocateExport`.

Ràng buộc bất biến (giữ nguyên khi refactor):
- Đơn hàng KHÔNG lấy từ `SX9-*` (kho WIP).
- Vị trí hiển thị trong 1 dòng luôn sắp theo `compareLocations` (lộ trình đi lấy).
- Không tick gì → hành vi y hệt hiện nay.

---

## Task 1: `applyPriorityOrder` (hàm thuần xếp 3 nhóm ưu tiên)

**Files:**
- Modify: `src/lib/productionAlloc.js` (thêm hàm export mới, đặt ngay trước `allocateFIFO`)
- Test: `src/lib/productionAlloc.test.js` (thêm `describe` mới)

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/productionAlloc.test.js`, và thêm `applyPriorityOrder` vào dòng import đầu file (`import { aggregateComponentDemand, allocateFIFO, applyPriorityOrder, buildFinishedItems, ... } from './productionAlloc';`):

```js
describe('applyPriorityOrder', () => {
  it('đưa vị trí tự chọn lên trước, giữ thứ tự nền trong nhóm', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 },
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
      { id: 3, item_code: 'A', location: 'HH3', quantity: 5 },
    ];
    const out = applyPriorityOrder(stock, { priorityLocations: ['HH3'] });
    expect(out.map(s => s.location)).toEqual(['HH3', 'HH1', 'HH2']);
  });

  it('SX11 (khi bật) trước, rồi vị trí tự chọn, rồi phần còn lại', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 },     // còn lại
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },     // tự chọn
      { id: 3, item_code: 'A', location: 'SX11-01', quantity: 5 }, // SX11
    ];
    const out = applyPriorityOrder(stock, { priorityVTSX: true, priorityLocations: ['HH2'] });
    expect(out.map(s => s.location)).toEqual(['SX11-01', 'HH2', 'HH1']);
  });

  it('khớp chính xác — HH2 không kéo theo HH20', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH20', quantity: 5 },
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
    ];
    const out = applyPriorityOrder(stock, { priorityLocations: ['HH2'] });
    expect(out.map(s => s.location)).toEqual(['HH2', 'HH20']);
  });

  it('không tick gì → giữ nguyên thứ tự, trả mảng mới (không mutate)', () => {
    const stock = [{ id: 1, location: 'HH2' }, { id: 2, location: 'HH1' }];
    const out = applyPriorityOrder(stock, {});
    expect(out.map(s => s.location)).toEqual(['HH2', 'HH1']);
    expect(out).not.toBe(stock);
  });
});
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/productionAlloc.test.js`
Expected: FAIL — `applyPriorityOrder is not a function` / `not exported`.

- [ ] **Step 3: Cài đặt tối thiểu**

Trong `src/lib/productionAlloc.js`, thêm hàm này **ngay trước** `export function allocateFIFO` (khoảng dòng 63, dưới comment giải thích của `allocateFIFO` hoặc trên nó):

```js
// Xếp tồn theo 3 nhóm ưu tiên, GIỮ ổn định thứ tự nền (FIFO) trong mỗi nhóm:
//   Nhóm 1: kho VTSX SX11- (chỉ khi priorityVTSX)
//   Nhóm 2: vị trí người dùng tự chọn (khớp CHÍNH XÁC theo Set)
//   Nhóm 3: phần còn lại
// Không bật ưu tiên nào → trả bản sao nguyên thứ tự.
export function applyPriorityOrder(stockRows, { priorityVTSX = false, priorityLocations = [] } = {}) {
  const priSet = new Set(priorityLocations || []);
  const isSX11 = (s) => s.location && s.location.startsWith('SX11-');
  if (!priorityVTSX && priSet.size === 0) return [...(stockRows || [])];
  const t0 = [], t1 = [], t2 = [];
  for (const s of (stockRows || [])) {
    if (priorityVTSX && isSX11(s)) t0.push(s);
    else if (priSet.has(s.location)) t1.push(s);
    else t2.push(s);
  }
  return [...t0, ...t1, ...t2];
}
```

- [ ] **Step 4: Chạy test cho pass**

Run: `npx vitest run src/lib/productionAlloc.test.js`
Expected: PASS toàn bộ (kể cả các test cũ).

- [ ] **Step 5: Commit**

```bash
git add src/lib/productionAlloc.js src/lib/productionAlloc.test.js
git commit -m "feat(kho): them applyPriorityOrder - xep ton theo 3 nhom uu tien"
```

---

## Task 2: `allocateFIFO` nhận `priorityLocations`

**Files:**
- Modify: `src/lib/productionAlloc.js:68-75` (khối `priorityVTSX` nội tuyến)
- Test: `src/lib/productionAlloc.test.js` (thêm 1 test vào `describe('allocateFIFO')`)

- [ ] **Step 1: Viết test thất bại**

Thêm vào trong `describe('allocateFIFO', ...)` (sau test "ưu tiên kho SX11- khi priorityVTSX"):

```js
  it('ưu tiên vị trí tự chọn trước FIFO nền', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 }, // FIFO đứng đầu
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
    ];
    const { result } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], s, { priorityLocations: ['HH2'] });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'HH2' });
  });
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/productionAlloc.test.js -t "ưu tiên vị trí tự chọn trước FIFO"`
Expected: FAIL — allocations[0] là HH1 (chưa xử lý `priorityLocations`).

- [ ] **Step 3: Cài đặt tối thiểu**

Trong `src/lib/productionAlloc.js`, thay khối đầu `allocateFIFO`:

```js
export function allocateFIFO(componentsRequired, stockData, opts = {}) {
  const { priorityVTSX = false, phieuCode = '' } = opts;
  let available = JSON.parse(JSON.stringify(stockData || [])); // copy để trừ dần, không mutate gốc
  if (priorityVTSX) {
    const pri = available.filter(s => s.location && s.location.startsWith('SX11-'));
    const norm = available.filter(s => !(s.location && s.location.startsWith('SX11-')));
    available = [...pri, ...norm];
  }
```

thành:

```js
export function allocateFIFO(componentsRequired, stockData, opts = {}) {
  const { priorityVTSX = false, priorityLocations = [], phieuCode = '' } = opts;
  // copy để trừ dần (không mutate gốc) rồi xếp theo nhóm ưu tiên
  let available = applyPriorityOrder(JSON.parse(JSON.stringify(stockData || [])), { priorityVTSX, priorityLocations });
```

(Giữ nguyên toàn bộ phần còn lại của hàm từ `let isShortage = false;` trở đi.)

- [ ] **Step 4: Chạy test cho pass**

Run: `npx vitest run src/lib/productionAlloc.test.js`
Expected: PASS toàn bộ (test cũ "ưu tiên kho SX11-" vẫn xanh vì `applyPriorityOrder` giữ đúng hành vi).

- [ ] **Step 5: Commit**

```bash
git add src/lib/productionAlloc.js src/lib/productionAlloc.test.js
git commit -m "feat(kho): allocateFIFO nhan priorityLocations qua applyPriorityOrder"
```

---

## Task 3: `allocateExport` (phân bổ chung cho đơn hàng)

**Files:**
- Modify: `src/lib/productionAlloc.js` (thêm hàm export mới, đặt sau `allocateFIFO`)
- Test: `src/lib/productionAlloc.test.js` (thêm `describe` mới)

- [ ] **Step 1: Viết test thất bại**

Thêm `allocateExport` vào dòng import đầu `productionAlloc.test.js`, rồi thêm vào cuối file:

```js
describe('allocateExport', () => {
  const stock = [
    { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
    { id: 2, item_code: 'A', location: 'SX9-PSX-1', quantity: 100 }, // WIP, KHÔNG được lấy
    { id: 3, item_code: 'A', location: 'HH2', quantity: 10 },
  ];

  it('không lấy từ kho sản xuất dở dang (SX9-*)', () => {
    const { result, isShortage } = allocateExport(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 15 }], stock, {});
    expect(isShortage).toBe(false);
    const locs = result[0].allocations.map(a => a.location);
    expect(locs).not.toContain('SX9-PSX-1');
    expect(locs.sort()).toEqual(['HH1', 'HH2']);
  });

  it('nhiều dòng cùng mã trừ dồn trên cùng bản tồn', () => {
    const { result, isShortage } = allocateExport(
      [
        { code: 'A', name: 'a', unit: '', requiredQty: 8 },
        { code: 'A', name: 'a', unit: '', requiredQty: 8 },
      ],
      [{ id: 1, item_code: 'A', location: 'HH1', quantity: 10 }],
      {});
    expect(result[0].missing).toBe(0); // dòng 1 lấy 8/10
    expect(result[1].missing).toBe(6); // dòng 2 chỉ còn 2 → thiếu 6
    expect(isShortage).toBe(true);
  });

  it('ưu tiên vị trí tự chọn trước', () => {
    const { result } = allocateExport(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 10 }],
      [
        { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
        { id: 2, item_code: 'A', location: 'HH2', quantity: 10 },
      ],
      { priorityLocations: ['HH2'] });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'HH2' });
  });

  it('giữ passthrough name/unit', () => {
    const { result } = allocateExport(
      [{ code: 'A', name: 'Vat tu A', unit: 'cai', requiredQty: 1 }],
      [{ id: 1, item_code: 'A', location: 'HH1', quantity: 5 }], {});
    expect(result[0]).toMatchObject({ code: 'A', name: 'Vat tu A', unit: 'cai' });
  });
});
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/productionAlloc.test.js`
Expected: FAIL — `allocateExport is not a function`.

- [ ] **Step 3: Cài đặt tối thiểu**

Trong `src/lib/productionAlloc.js`, thêm **ngay sau** `allocateFIFO` (trước `buildFinishedItems`):

```js
// Phân bổ cho XUẤT (đơn hàng / xuất bán): KHÔNG lấy từ kho SX dở dang (SX9-*).
// Dùng chung 1 bản tồn "working" trừ dần → nhiều dòng cùng mã trừ dồn đúng.
// demandRows: [{ code, name, unit, requiredQty, ...passthrough }]
// stockData nên đã sort FIFO. opts: { priorityLocations? }
// → { result: [{ ...demandRow, requiredQty, allocations, missing, isShortage }], isShortage }
export function allocateExport(demandRows, stockData, opts = {}) {
  const { priorityLocations = [] } = opts;
  const working = applyPriorityOrder(JSON.parse(JSON.stringify(stockData || [])), { priorityLocations });
  let isShortage = false;
  const result = [];
  for (const d of demandRows) {
    let qtyNeeded = Number(d.requiredQty);
    const rows = working.filter(s => s.item_code === d.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
    const allocs = [];
    for (let i = 0; i < rows.length && qtyNeeded > 0; i++) {
      const r = rows[i];
      const take = Math.min(r.quantity, qtyNeeded);
      const before = r.quantity;
      r.quantity -= take;
      qtyNeeded -= take;
      allocs.push({ stock_id: r.id, location: r.location, before, taken: take, remaining: r.quantity });
    }
    if (qtyNeeded > 0) isShortage = true;
    // Hiển thị vị trí trong 1 dòng theo lộ trình đi lấy (dãy→tầng→ô)
    allocs.sort((x, y) => compareLocations(x.location, y.location));
    result.push({ ...d, requiredQty: Number(d.requiredQty), allocations: allocs, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
  }
  return { result, isShortage };
}
```

- [ ] **Step 4: Chạy test cho pass**

Run: `npx vitest run src/lib/productionAlloc.test.js`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/productionAlloc.js src/lib/productionAlloc.test.js
git commit -m "feat(kho): them allocateExport - phan bo chung cho don hang, loai SX9"
```

---

## Task 4: State + import + persistence trong `ProductionOrderTab`

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (import dòng 7; state ~280; effect 340-356)

- [ ] **Step 1: Thêm `allocateExport` vào import**

Sửa dòng 7:

```js
import { aggregateComponentDemand, allocateFIFO, buildFinishedItems, round1, compareLocations, sortStockForFIFO, sortResultByLocation } from '../../lib/productionAlloc';
```

thành:

```js
import { aggregateComponentDemand, allocateFIFO, allocateExport, buildFinishedItems, round1, compareLocations, sortStockForFIFO, sortResultByLocation } from '../../lib/productionAlloc';
```

- [ ] **Step 2: Thêm state**

Ngay sau dòng 280 (`const [priorityVTSX, setPriorityVTSX] = ...`), thêm:

```js
  // Ưu tiên lấy ở vị trí tự chọn (màn kết quả) — mảng chuỗi vị trí, khớp chính xác
  const [priorityLocations, setPriorityLocations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_priorityLocations')) || []; } catch { return []; }
  });
  // Ngữ cảnh để "Tính lại theo vị trí ưu tiên": { mode, demand } đã dùng khi tính
  const [recomputeDemand, setRecomputeDemand] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_recomputeDemand')) || null; } catch { return null; }
  });
```

- [ ] **Step 3: Ghi localStorage + deps**

Trong effect 340-356: thêm 1 dòng ghi `prod_priorityLocations` (luôn ghi, cạnh `prod_priorityVTSX`), và 1 dòng ghi `prod_recomputeDemand` (trong nhánh `if (allocations)`). Cụ thể:

Sau dòng `localStorage.setItem('prod_priorityVTSX', priorityVTSX);` thêm:
```js
    localStorage.setItem('prod_priorityLocations', JSON.stringify(priorityLocations));
```
Sau dòng `localStorage.setItem('prod_finishedItems', JSON.stringify(prodFinishedItems));` (trong `if (allocations)`) thêm:
```js
      localStorage.setItem('prod_recomputeDemand', JSON.stringify(recomputeDemand));
```
Cập nhật mảng deps cuối effect, thêm `priorityLocations, recomputeDemand`:
```js
  }, [prodRows, prodDate, notes, priorityVTSX, orderCode, allocations, isShortage, orderCreated, mode, orderItems, generatedComponents, stockPool, prodFinishedItems, priorityLocations, recomputeDemand]);
```

- [ ] **Step 4: Kiểm tra build (không lỗi cú pháp)**

Run: `npx vitest run src/lib/productionAlloc.test.js && npm run build`
Expected: test PASS; build thành công (không ReferenceError, không lỗi import).

- [ ] **Step 5: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "chore(kho): state priorityLocations/recomputeDemand + persist + import allocateExport"
```

---

## Task 5: Wiring luồng SẢN XUẤT (`handleCalculate`)

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (`handleCalculate` ~365-455)

- [ ] **Step 1: Reset ưu tiên khi bắt đầu tính mới**

Sau dòng `setOrderCreated(false);` trong `handleCalculate` (khoảng dòng 374), thêm:

```js
    setPriorityLocations([]); // phiếu mới: bỏ lựa chọn ưu tiên cũ
```

- [ ] **Step 2: Truyền `priorityLocations: []` + lưu `recomputeDemand`**

Thay khối gọi allocateFIFO (dòng 442-448):

```js
      // 4. Phân bổ FIFO 1 lần trên nhu cầu tổng
      const { result, isShortage: hasShortage } = allocateFIFO(componentsRequired, stockData, {
        priorityVTSX, phieuCode: generatedCode,
      });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
      setIsShortage(hasShortage);
```

thành:

```js
      // 4. Phân bổ FIFO 1 lần trên nhu cầu tổng (lần đầu chưa có ưu tiên vị trí tự chọn)
      const { result, isShortage: hasShortage } = allocateFIFO(componentsRequired, stockData, {
        priorityVTSX, priorityLocations: [], phieuCode: generatedCode,
      });

      // Lưu ngữ cảnh để "Tính lại theo vị trí ưu tiên"
      setRecomputeDemand({ mode: 'production', demand: componentsRequired });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
      setIsShortage(hasShortage);
```

- [ ] **Step 3: Kiểm tra build**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): SX luu recomputeDemand + reset uu tien vi tri khi tinh moi"
```

---

## Task 6: Refactor luồng ĐƠN HÀNG dùng `allocateExport` (`handleCalculateDelivery`)

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (`handleCalculateDelivery` ~576-660)

- [ ] **Step 1: Reset ưu tiên khi bắt đầu tính**

Sau dòng `setOrderCreated(false);` trong `handleCalculateDelivery` (khoảng dòng 580), thêm:

```js
    setPriorityLocations([]); // đơn mới / tính lại: bỏ lựa chọn ưu tiên cũ
```

- [ ] **Step 2: Thay vòng lặp nội tuyến bằng `allocateExport`**

Thay khối từ `const availableStock = JSON.parse(...)` đến `setIsShortage(hasShortage);` (dòng 626-653):

```js
      const availableStock = JSON.parse(JSON.stringify(stockData || []));
      let hasShortage = false;
      const result = [];

      componentsRequired.forEach(comp => {
        let qtyNeeded = comp.requiredQty;
        // Xuất bán/đơn hàng KHÔNG lấy từ kho sản xuất (SX9-*, hàng đang dở dang).
        const compStockRows = availableStock.filter(s => s.item_code === comp.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
        const compAllocations = [];
        
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          row.quantity -= take;
          qtyNeeded -= take;
          compAllocations.push({
            stock_id: row.id, location: row.location, before: row.quantity + take, taken: take, remaining: row.quantity
          });
        }
        if (qtyNeeded > 0) hasShortage = true;
        // Vị trí trong 1 dòng sắp theo dãy→tầng→ô cho dễ đi lấy hàng
        compAllocations.sort((x, y) => compareLocations(x.location, y.location));
        result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
      });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
      setIsShortage(hasShortage);
```

thành:

```js
      // Phân bổ đơn hàng qua hàm chung (loại SX9-*); lần đầu chưa có ưu tiên vị trí
      const { result, isShortage: hasShortage } = allocateExport(componentsRequired, stockData, { priorityLocations: [] });

      // Lưu ngữ cảnh để "Tính lại theo vị trí ưu tiên"
      setRecomputeDemand({ mode: 'delivery', demand: componentsRequired });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
      setIsShortage(hasShortage);
```

- [ ] **Step 3: Kiểm tra build + test lib**

Run: `npx vitest run src/lib/productionAlloc.test.js && npm run build`
Expected: PASS + build OK.

- [ ] **Step 4: Verify hành vi đơn hàng chưa đổi (preview)**

Xem Task 9 để chạy preview; ở bước này chỉ cần build xanh. Kết quả phân bổ đơn hàng phải giống hệt trước refactor (chỉ đổi cách viết).

- [ ] **Step 5: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "refactor(kho): don hang dung allocateExport + luu recomputeDemand"
```

---

## Task 7: `recomputeWithPriority`, `priorityLocOptions`, reset ở `handleResetToCards`

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (`handleResetToCards` ~1317-1329; thêm helper + hàm gần đó)

- [ ] **Step 1: Reset state mới khi về lưới thẻ**

Trong `handleResetToCards` (1317-1329), sau `setStockPool({});` thêm:

```js
    setPriorityLocations([]);
    setRecomputeDemand(null);
```

- [ ] **Step 2: Thêm helper build options + hàm recompute**

Ngay sau `handleSaveAllocation` (kết thúc ~1340, trước `return (`), thêm:

```js
  // Danh sách vị trí để chọn ưu tiên = các vị trí đang có tồn của hàng trong phiếu (từ stockPool).
  // Delivery loại bỏ SX9-* (đơn hàng không lấy ở kho dở dang).
  const priorityLocOptions = React.useMemo(() => {
    const byLoc = {};
    Object.values(stockPool || {}).forEach(rows => {
      (rows || []).forEach(r => {
        if (!(r.quantity > 0)) return;
        if (mode === 'delivery' && String(r.location || '').startsWith('SX9-')) return;
        if (!byLoc[r.location]) byLoc[r.location] = { location: r.location, totalQty: 0, codeCount: 0 };
        byLoc[r.location].totalQty += r.quantity;
        byLoc[r.location].codeCount += 1;
      });
    });
    return Object.values(byLoc).sort((a, b) => compareLocations(a.location, b.location));
  }, [stockPool, mode]);

  // Tính lại phân bổ với danh sách vị trí ưu tiên `locs` (dựng lại tồn GỐC từ stockPool).
  const recomputeWithPriority = (locs) => {
    if (!recomputeDemand) return;
    const stock = Object.entries(stockPool || {}).flatMap(([item_code, rows]) =>
      (rows || []).map(r => ({ id: r.id, item_code, location: r.location, quantity: r.quantity }))
    );
    let out;
    if (recomputeDemand.mode === 'production') {
      out = allocateFIFO(recomputeDemand.demand, stock, { priorityVTSX, priorityLocations: locs, phieuCode: orderCode });
    } else {
      out = allocateExport(recomputeDemand.demand, stock, { priorityLocations: locs });
    }
    setAllocations(sortResultByLocation(out.result));
    setIsShortage(out.isShortage);
  };
```

- [ ] **Step 3: Kiểm tra build**

Run: `npm run build`
Expected: build thành công (không lỗi `React.useMemo`, `allocateExport` đã import ở Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): recomputeWithPriority + build danh sach vi tri uu tien"
```

---

## Task 8: UI — `PriorityLocationPicker` + panel ở màn kết quả

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (thêm component nội bộ trước `export default`; chèn panel vào `<main>` ~1417)

- [ ] **Step 1: Thêm component `PriorityLocationPicker`**

Ngay trước `export default function ProductionOrderTab(...)` (dòng 253), thêm:

```js
// Bộ chọn nhiều vị trí ưu tiên: ô lọc + danh sách checkbox cuộn trong khung (KHÔNG dropdown
// nổi để tránh bị cắt cụt), vị trí đã chọn hiện thành chip bỏ được. Xem [[qlsx-modal-dropdown-clipping]].
const PriorityLocationPicker = ({ options, selected, onChange }) => {
  const [q, setQ] = useState('');
  const sel = new Set(selected);
  const qs = removeTones(q);
  const filtered = options.filter(o => removeTones(o.location).includes(qs));
  const toggle = (loc) => {
    if (sel.has(loc)) onChange(selected.filter(l => l !== loc));
    else onChange([...selected, loc]);
  };
  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
          {selected.map(loc => (
            <span key={loc} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#e0f2fe', color:'#0369a1', borderRadius:999, padding:'2px 8px', fontSize:'0.75rem', fontWeight:600 }}>
              {loc}
              <button onClick={() => toggle(loc)} title="Bỏ" style={{ border:'none', background:'transparent', color:'#0369a1', cursor:'pointer', fontWeight:700, lineHeight:1 }}>✕</button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Gõ để lọc vị trí..." style={s.input} />
      <div style={{ marginTop:6, maxHeight:220, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8 }}>
        {filtered.map(o => (
          <label key={o.location} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:'0.8rem', cursor:'pointer', color:'#334155' }}>
            <input type="checkbox" checked={sel.has(o.location)} onChange={() => toggle(o.location)} />
            <strong>{o.location}</strong>
            <span style={{ color:'#94a3b8', marginLeft:'auto' }}>tồn: {fmtQty(o.totalQty)} · {o.codeCount} mã</span>
          </label>
        ))}
        {filtered.length === 0 && <div style={{ padding:'8px 10px', color:'#94a3b8', fontSize:'0.8rem' }}>Không có vị trí</div>}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Chèn panel vào đầu `<main>`**

Tìm dòng mở `<main style={{flex:1,padding:'0',overflowY:'auto',background:'#f1f5f9'}}>` (dòng 1417). Ngay **sau** nó (trước block `{mode === 'delivery' && isShortage && ...}`), thêm:

```jsx
        {(mode === 'production' || mode === 'delivery') && allocations && (
          <div className="no-print" style={{ maxWidth:800, margin:'1rem auto 0', background:'#fff', border:'1px solid #bae6fd', borderRadius:12, padding:'1rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <Package size={18} color="#0891b2"/>
              <strong style={{ color:'#0f172a', fontSize:'0.9rem' }}>Ưu tiên lấy ở vị trí</strong>
            </div>
            <p style={{ fontSize:'0.78rem', color:'#64748b', margin:'0 0 10px' }}>
              Tick các vị trí muốn lấy trước rồi bấm "Tính lại". Vị trí đã chọn được ưu tiên; phần còn lại vẫn theo nguyên tắc FIFO như thường.
            </p>
            <PriorityLocationPicker
              options={priorityLocOptions}
              selected={priorityLocations}
              onChange={setPriorityLocations}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12 }}>
              {priorityLocations.length > 0 && (
                <button
                  onClick={() => { setPriorityLocations([]); recomputeWithPriority([]); }}
                  style={{ ...s.btn, background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0' }}
                >
                  Bỏ ưu tiên
                </button>
              )}
              <button
                onClick={() => recomputeWithPriority(priorityLocations)}
                disabled={priorityLocations.length === 0}
                style={{ ...s.btn, ...(priorityLocations.length === 0 ? s.btnDisabled : {}) }}
              >
                Tính lại theo vị trí ưu tiên
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Kiểm tra build**

Run: `npm run build`
Expected: build thành công (JSX hợp lệ; `Package` đã import ở dòng 3; `s`, `fmtQty`, `removeTones` đều dùng được ở module scope).

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): panel uu tien vi tri o man ket qua (SX + don hang)"
```

---

## Task 9: Verify end-to-end + full test + build

**Files:** không sửa code (chỉ kiểm chứng).

- [ ] **Step 1: Chạy full unit test**

Run: `npm test`
Expected: tất cả file test PASS (đặc biệt `productionAlloc.test.js`).

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: build thành công, không warning chặn.

- [ ] **Step 3: Preview — luồng SẢN XUẤT**

Khởi động preview (xem [[qlsx-preview-verification]] để đăng nhập). Vào Kho Hàng → PSX → Lệnh Sản Xuất:
- Nhập 1 thành phẩm có BOM + SL, "Tính toán bốc dỡ".
- Ở màn kết quả: panel "Ưu tiên lấy ở vị trí" hiện. Tick 1 vị trí đang có tồn của 1 linh kiện.
- Bấm "Tính lại theo vị trí ưu tiên" → linh kiện đó có dòng "Vị trí lấy" ưu tiên vị trí vừa chọn (SL lấy ở đó > 0 trước khi tràn sang vị trí khác).
- Bấm "Bỏ ưu tiên" → quay lại phân bổ FIFO thường.
- Kiểm tra `preview_console_logs` không có lỗi.

- [ ] **Step 4: Preview — luồng ĐƠN HÀNG**

Vào Kho Hàng → PSX → Nhập Đơn Hàng → Nhập tay: nhập 1 đơn + 1 mã SP có tồn ở ≥2 vị trí.
- Màn kết quả: panel hiện, danh sách vị trí KHÔNG có SX9-*.
- Tick 1 vị trí + "Tính lại" → vị trí đó được lấy trước.
- Xác nhận panel KHÔNG in ra khi xem trước bản in (class `no-print`).

- [ ] **Step 5: Preview — Xuất Kho Thủ Công KHÔNG có panel**

Vào Xuất Kho Thủ Công, nhập 1 mã + SL + lý do → tính. Xác nhận **không** có panel "Ưu tiên vị trí" ở màn kết quả (đúng phạm vi).

- [ ] **Step 6: Commit (nếu có chỉnh sửa nhỏ khi verify)**

Nếu phát hiện lỗi ở Step 3-5, sửa nguồn rồi commit; nếu mọi thứ đạt, không cần commit thêm.

---

## Ghi chú triển khai / deploy

Sau khi merge: theo [[qlsx-netlify-deploy]] — `npm run build` rồi copy `dist` → `deploy-netlify/` mới có hiệu lực khi user kéo-thả deploy (push GitHub KHÔNG tự deploy).
