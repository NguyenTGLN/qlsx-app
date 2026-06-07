# Lệnh Sản Xuất nhiều mã trên 1 phiếu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép "Lệnh Sản Xuất" làm nhiều thành phẩm trên cùng 1 phiếu, với danh sách linh kiện lấy ra gộp tổng chung theo mã.

**Architecture:** Tách phần logic thuần (gộp BOM theo mã linh kiện, phân bổ FIFO, sinh mã lệnh con) ra module `src/lib/productionAlloc.js` để unit-test bằng vitest. Component `ProductionOrderTab.jsx` đổi state đơn (`selectedProduct`/`quantity`) thành danh sách dòng `prodRows`, gọi module này trong `handleCalculate`, và khi lưu thì tạo 1 lệnh `production_orders` + 1 tồn WIP `SX9-...` cho mỗi thành phẩm. Các mode khác (delivery / manual_export / disassemble) **không đụng tới**.

**Tech Stack:** React 19, Vite, vitest, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-06-07-lenh-san-xuat-nhieu-ma-design.md`

---

## File Structure

- **Create** `src/lib/productionAlloc.js` — 3 hàm thuần: `aggregateComponentDemand`, `allocateFIFO`, `buildFinishedItems`.
- **Create** `src/lib/productionAlloc.test.js` — unit test cho 3 hàm trên.
- **Modify** `src/pages/kho/ProductionOrderTab.jsx` — state đa dòng, form modal, `handleCalculate`, nhánh production trong `confirmDeductAndCreateOrder`, phần in/kết quả, persistence/reset.

> **Lưu ý lệch nhẹ với spec:** Spec ghi "viết thẳng trong handleCalculate, không bắt buộc tách helper". Plan chọn tách 3 hàm thuần ra lib để test được — chỉ dùng cho đường production mới, **không** sửa allocation inline của các mode khác nên blast radius vẫn nhỏ.

---

## Task 1: Module logic thuần `productionAlloc.js` (TDD)

**Files:**
- Create: `src/lib/productionAlloc.js`
- Test: `src/lib/productionAlloc.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/productionAlloc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { aggregateComponentDemand, allocateFIFO, buildFinishedItems } from './productionAlloc';

describe('aggregateComponentDemand', () => {
  const bomByProduct = {
    'SP-A': [
      { component_code: 'T-0402', quantity: 2, unit: 'm', item_name: 'Dây 6' },
      { component_code: 'OC-1', quantity: 4, unit: 'cái', item_name: 'Ốc' },
    ],
    'SP-B': [
      { component_code: 'T-0402', quantity: 3, unit: 'm', item_name: 'Dây 6' },
    ],
  };

  it('gộp tổng theo mã linh kiện qua nhiều thành phẩm', () => {
    const rows = [{ code: 'SP-A', name: 'A', qty: 10 }, { code: 'SP-B', name: 'B', qty: 5 }];
    const out = aggregateComponentDemand(rows, bomByProduct);
    const day6 = out.find(c => c.code === 'T-0402');
    const oc = out.find(c => c.code === 'OC-1');
    expect(day6.requiredQty).toBe(2 * 10 + 3 * 5); // 35
    expect(day6.name).toBe('Dây 6');
    expect(oc.requiredQty).toBe(4 * 10); // 40
    expect(out).toHaveLength(2);
  });

  it('mã thành phẩm chưa có BOM thì bỏ qua, không vỡ', () => {
    const rows = [{ code: 'SP-X', name: 'X', qty: 3 }];
    expect(aggregateComponentDemand(rows, bomByProduct)).toEqual([]);
  });
});

describe('allocateFIFO', () => {
  const stock = [
    { id: 1, item_code: 'T-0402', location: 'HM5', quantity: 20 },
    { id: 2, item_code: 'T-0402', location: 'HM6', quantity: 20 },
  ];

  it('phân bổ đủ qua nhiều vị trí, tính tồn dư đúng', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 35 }], stock, {});
    expect(isShortage).toBe(false);
    expect(result[0].allocations).toHaveLength(2);
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 1, taken: 20, remaining: 0 });
    expect(result[0].allocations[1]).toMatchObject({ stock_id: 2, taken: 15, remaining: 5 });
    expect(result[0].missing).toBe(0);
  });

  it('đánh dấu thiếu khi không đủ tồn', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 100 }], stock, {});
    expect(isShortage).toBe(true);
    expect(result[0].isShortage).toBe(true);
    expect(result[0].missing).toBe(60);
  });

  it('không mutate stockData gốc', () => {
    allocateFIFO([{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 35 }], stock, {});
    expect(stock[0].quantity).toBe(20);
  });

  it('ưu tiên kho SX11- khi priorityVTSX', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HM1', quantity: 5 },
      { id: 2, item_code: 'A', location: 'SX11-01', quantity: 5 },
    ];
    const { result } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], s, { priorityVTSX: true });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'SX11-01' });
  });

  it('SL âm (tháo máy) nhập ngược vào SX9 của phiếu', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: -3 }], [], { phieuCode: 'PSX-X-01' });
    expect(isShortage).toBe(false);
    expect(result[0].allocations[0]).toMatchObject({
      stock_id: null, location: 'SX9-PSX-X-01', taken: -3, remaining: 3,
    });
  });
});

describe('buildFinishedItems', () => {
  it('1 thành phẩm dùng đúng mã phiếu, không hậu tố', () => {
    const out = buildFinishedItems([{ code: 'SP-A', name: 'A', qty: 10 }], 'PSX-X-01');
    expect(out).toEqual([{ orderCode: 'PSX-X-01', productCode: 'SP-A', productName: 'A', qty: 10 }]);
  });

  it('nhiều thành phẩm thêm hậu tố .1 .2', () => {
    const out = buildFinishedItems(
      [{ code: 'SP-A', name: 'A', qty: 10 }, { code: 'SP-B', name: 'B', qty: 5 }], 'PSX-X-02');
    expect(out.map(o => o.orderCode)).toEqual(['PSX-X-02.1', 'PSX-X-02.2']);
    expect(out[1]).toMatchObject({ productCode: 'SP-B', qty: 5 });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm run test -- src/lib/productionAlloc.test.js`
Expected: FAIL — "Failed to resolve import './productionAlloc'" (file chưa tồn tại).

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/productionAlloc.js`:

```js
// Logic thuần cho "Lệnh Sản Xuất nhiều mã / 1 phiếu".
// Tách khỏi ProductionOrderTab.jsx để unit-test (vitest).

// Gộp BOM của nhiều thành phẩm thành nhu cầu linh kiện tổng (cộng theo mã linh kiện).
// rows: [{ code, name, qty }]
// bomByProduct: { [productCode]: [{ component_code, quantity, unit, item_name }] }
// → [{ code, name, unit, requiredQty }]
export function aggregateComponentDemand(rows, bomByProduct) {
  const demandMap = {};
  for (const row of rows) {
    const bom = bomByProduct[row.code] || [];
    for (const b of bom) {
      const key = b.component_code;
      if (!demandMap[key]) {
        demandMap[key] = { code: key, name: b.item_name || '', unit: b.unit || '', requiredQty: 0 };
      }
      demandMap[key].requiredQty += Number(b.quantity) * Number(row.qty);
    }
  }
  return Object.values(demandMap);
}

// Phân bổ FIFO. stockData nên đã sort sẵn (import_date asc, quantity asc).
// componentsRequired: [{ code, name, unit, requiredQty }]
// stockData: [{ id, item_code, location, quantity }]
// opts: { priorityVTSX?: bool, phieuCode?: string }
// → { result: [{ ...comp, allocations, missing, isShortage }], isShortage }
export function allocateFIFO(componentsRequired, stockData, opts = {}) {
  const { priorityVTSX = false, phieuCode = '' } = opts;
  let available = JSON.parse(JSON.stringify(stockData || [])); // copy để trừ dần, không mutate gốc
  if (priorityVTSX) {
    const pri = available.filter(s => s.location && s.location.startsWith('SX11-'));
    const norm = available.filter(s => !(s.location && s.location.startsWith('SX11-')));
    available = [...pri, ...norm];
  }

  let isShortage = false;
  const result = [];

  for (const comp of componentsRequired) {
    let qtyNeeded = comp.requiredQty;
    const compAllocations = [];

    // Tháo máy (SL âm) → nhập ngược vào kho SX9 của phiếu
    if (qtyNeeded < 0) {
      compAllocations.push({
        stock_id: null,
        location: `SX9-${phieuCode}`,
        before: 0,
        taken: qtyNeeded,            // âm
        remaining: Math.abs(qtyNeeded),
      });
      result.push({ ...comp, allocations: compAllocations, missing: 0, isShortage: false });
      continue;
    }

    const rows = available.filter(s => s.item_code === comp.code && s.quantity > 0);
    for (let i = 0; i < rows.length && qtyNeeded > 0; i++) {
      const r = rows[i];
      const take = Math.min(r.quantity, qtyNeeded);
      const before = r.quantity;
      r.quantity -= take;
      qtyNeeded -= take;
      compAllocations.push({ stock_id: r.id, location: r.location, before, taken: take, remaining: r.quantity });
    }

    if (qtyNeeded > 0) isShortage = true;
    result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
  }

  return { result, isShortage };
}

// Sinh danh sách lệnh con từ các dòng thành phẩm + mã phiếu chung.
// 1 dòng → dùng đúng mã phiếu (không hậu tố). Nhiều dòng → phiếu.1, phiếu.2, ...
// rows: [{ code, name, qty }] → [{ orderCode, productCode, productName, qty }]
export function buildFinishedItems(rows, phieuCode) {
  if (rows.length === 1) {
    const r = rows[0];
    return [{ orderCode: phieuCode, productCode: r.code, productName: r.name || '', qty: Number(r.qty) }];
  }
  return rows.map((r, i) => ({
    orderCode: `${phieuCode}.${i + 1}`,
    productCode: r.code,
    productName: r.name || '',
    qty: Number(r.qty),
  }));
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm run test -- src/lib/productionAlloc.test.js`
Expected: PASS — tất cả test xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/productionAlloc.js src/lib/productionAlloc.test.js
git commit -m "feat(kho): module productionAlloc - gộp BOM + FIFO + sinh mã lệnh con (có test)"
```

---

## Task 2: State đa dòng + import module

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx`

- [ ] **Step 1: Thêm import + helper sinh dòng thành phẩm**

Sửa dòng import `exportReasons` (dòng ~6) — thêm import module mới ngay sau:

```js
import { EXPORT_REASONS, reasonType, reasonNeedsOrderRef } from '../../lib/exportReasons';
import { aggregateComponentDemand, allocateFIFO, buildFinishedItems } from '../../lib/productionAlloc';
```

Ngay dưới `emptyManualRow` (dòng ~10) thêm:

```js
// id ổn định cho từng dòng thành phẩm SX — giữ focus khi xoá dòng giữa (React key)
let __prodRowSeq = 0;
const emptyProdRow = () => ({ id: ++__prodRowSeq, code: '', name: '', qty: 1 });
```

- [ ] **Step 2: Thay state đơn `selectedProduct`/`quantity` bằng `prodRows` + thêm `prodFinishedItems`**

Tìm (dòng ~211-212):

```js
  const [selectedProduct, setSelectedProduct] = useState(() => localStorage.getItem('prod_selectedProduct') || '');
  const [quantity, setQuantity] = useState(() => Number(localStorage.getItem('prod_quantity')) || 1);
```

Thay bằng:

```js
  // Danh sách thành phẩm trên 1 phiếu SX (multi). Mỗi dòng: { id, code, name, qty }
  const [prodRows, setProdRows] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('prod_rows'));
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.map(r => ({ ...r, id: ++__prodRowSeq }));
      }
    } catch { /* ignore */ }
    return [emptyProdRow()];
  });
  // Các lệnh con sinh ra cho phiếu hiện tại: [{ orderCode, productCode, productName, qty }]
  const [prodFinishedItems, setProdFinishedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_finishedItems')) || []; } catch { return []; }
  });
```

- [ ] **Step 3: Thêm helper thao tác dòng (đặt ngay sau khai báo `setProdFinishedItems`/cụm state, trước `useEffect` persistence)**

```js
  const updateProdRow = (id, patch) => setProdRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  const addProdRow = () => setProdRows(prev => [...prev, emptyProdRow()]);
  const removeProdRow = (id) => setProdRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
```

- [ ] **Step 4: Cập nhật persistence effect**

Tìm (dòng ~270-286), thay 2 dòng lưu cũ và thêm dòng mới. Trong `useEffect` persistence:

Xoá 2 dòng:

```js
    localStorage.setItem('prod_selectedProduct', selectedProduct);
    localStorage.setItem('prod_quantity', quantity);
```

Thêm (cùng nhóm đầu effect):

```js
    localStorage.setItem('prod_rows', JSON.stringify(prodRows));
```

Trong nhánh `if (allocations) { ... }` thêm:

```js
      localStorage.setItem('prod_finishedItems', JSON.stringify(prodFinishedItems));
```

Cập nhật mảng deps của effect: bỏ `selectedProduct, quantity`, thêm `prodRows, prodFinishedItems`:

```js
  }, [prodRows, prodDate, notes, priorityVTSX, orderCode, allocations, isShortage, orderCreated, mode, orderItems, generatedComponents, stockPool, prodFinishedItems]);
```

- [ ] **Step 5: Cập nhật `sxPrefill` effect (prefill từ DKSX)**

Tìm (dòng ~232-240):

```js
    setMode('production');
    setSelectedProduct(sxPrefill.item_code || '');
    if (sxPrefill.qty) setQuantity(Number(sxPrefill.qty));
    if (onSxConsumed) onSxConsumed();
```

Thay bằng:

```js
    setMode('production');
    setProdRows([{ id: ++__prodRowSeq, code: sxPrefill.item_code || '', name: '', qty: sxPrefill.qty ? Number(sxPrefill.qty) : 1 }]);
    if (onSxConsumed) onSxConsumed();
```

- [ ] **Step 6: Build sạch để chắc không lỗi tham chiếu còn sót**

Run: `npm run build`
Expected: build có thể FAIL vì còn chỗ khác dùng `selectedProduct`/`quantity`/`setQuantity` (sẽ sửa ở Task 3–5). Ghi lại các lỗi tham chiếu để Task sau xử lý. KHÔNG commit ở bước này nếu build fail.

> Ghi chú: `selectedProductName` (dòng ~1247) và phần in/`confirmDeductAndCreateOrder` còn dùng `selectedProduct`/`quantity` — Task 3–5 thay hết. Để tránh build vỡ giữa chừng, hoàn thành Task 3–5 rồi mới commit chung. Nếu muốn commit Task 2 độc lập, tạm thêm `const selectedProduct = prodRows[0]?.code || ''; const quantity = Number(prodRows[0]?.qty) || 1;` ngay sau khai báo `prodRows` rồi xoá khi Task 3–5 xong. **Khuyến nghị:** làm liền Task 2→5 rồi commit 1 lần.

---

## Task 3: Viết lại `handleCalculate` cho multi

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (hàm `handleCalculate`, dòng ~334-469)

- [ ] **Step 1: Thay toàn bộ thân `handleCalculate`**

Thay nguyên hàm `handleCalculate` (từ `const handleCalculate = async () => {` tới `};` đóng hàm) bằng:

```js
  const handleCalculate = async () => {
    const rows = prodRows
      .filter(r => r.code && Number(r.qty) > 0)
      .map(r => ({ code: r.code, name: r.name || (products.find(p => p.code === r.code)?.name || ''), qty: Number(r.qty) }));
    if (rows.length === 0) return alert('Vui lòng nhập ít nhất 1 thành phẩm và số lượng > 0');

    setLoading(true);
    setMode('production');
    setAllocations(null);
    setOrderCreated(false);

    try {
      // 0. Tạo mã phiếu PSX-YYYYMMDD-NN
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('production_orders')
        .select('order_code')
        .like('order_code', `PSX-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastSeq = parseInt(latestOrder[0].order_code.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PSX-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Danh sách lệnh con (mỗi thành phẩm 1 lệnh)
      const finishedItems = buildFinishedItems(rows, generatedCode);
      setProdFinishedItems(finishedItems);

      // 1. Lấy BOM của tất cả thành phẩm
      const prodCodes = [...new Set(rows.map(r => r.code))];
      const { data: bomData, error: bomErr } = await db.from('bom_items')
        .select(`product_code, component_code, quantity, unit, inventory_items!bom_items_component_code_fkey ( item_name )`)
        .in('product_code', prodCodes);
      if (bomErr) throw bomErr;
      if (!bomData || bomData.length === 0) throw new Error('Các thành phẩm này chưa có cấu trúc BOM');

      const bomByProduct = {};
      bomData.forEach(b => {
        if (!bomByProduct[b.product_code]) bomByProduct[b.product_code] = [];
        bomByProduct[b.product_code].push({
          component_code: b.component_code,
          quantity: b.quantity,
          unit: b.unit,
          item_name: b.inventory_items?.item_name || '',
        });
      });

      // 2. Gộp nhu cầu linh kiện tổng theo mã
      const componentsRequired = aggregateComponentDemand(rows, bomByProduct);
      const compCodes = componentsRequired.map(c => c.code);

      // 3. Lấy tồn kho (FIFO: import_date asc, quantity asc)
      const { data: stockData, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', compCodes)
        .order('import_date', { ascending: true })
        .order('quantity', { ascending: true });
      if (stockErr) throw stockErr;

      // Lưu tồn gốc theo item_code cho popup "Sửa phân bổ"
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      // 4. Phân bổ FIFO 1 lần trên nhu cầu tổng
      const { result, isShortage: hasShortage } = allocateFIFO(componentsRequired, stockData, {
        priorityVTSX, phieuCode: generatedCode,
      });

      setAllocations(result);
      setIsShortage(hasShortage);
    } catch (e) {
      console.error(e);
      alert('Lỗi tính toán: ' + e.message);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 2: Build để kiểm tra cú pháp**

Run: `npm run build`
Expected: vẫn còn lỗi tham chiếu `selectedProduct`/`quantity`/`selectedProductName` ở `confirmDeductAndCreateOrder` và phần in (Task 4–5). Đó là dự kiến — tiếp tục.

---

## Task 4: Viết lại nhánh `production` khi lưu (`confirmDeductAndCreateOrder`)

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx`

- [ ] **Step 1: Sửa `product_code` của picking log cho production**

Tìm (dòng ~976) trong nhánh ghi `pickingLogs`:

```js
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? 'XUAT_KHO' : (mode === 'disassemble' ? allocations[0].code : selectedProduct)),
```

Thay bằng (production multi: 1 dòng giữ mã cũ, nhiều dòng dùng marker `SAN_XUAT`):

```js
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? 'XUAT_KHO' : (mode === 'disassemble' ? allocations[0].code : (prodFinishedItems.length === 1 ? prodFinishedItems[0].productCode : 'SAN_XUAT'))),
```

Tương tự dòng ~954 (nhánh tháo máy nhập ngược) hiện ghi `product_code: selectedProduct`:

```js
              product_code: selectedProduct, // Liên kết đúng với sản phẩm đang sản xuất
```

Thay bằng:

```js
              product_code: prodFinishedItems.length === 1 ? prodFinishedItems[0].productCode : 'SAN_XUAT',
```

- [ ] **Step 2: Thay khối tạo lệnh production (1 lệnh → vòng lặp nhiều lệnh)**

Tìm khối `if (mode === 'production') { ... }` (dòng ~1002-1040), thay **toàn bộ** thân khối bằng:

```js
      if (mode === 'production') {
        // 5. Tạo 1 lệnh sản xuất + 1 tồn WIP (SX9-...) cho MỖI thành phẩm
        const orderUpserts = [];
        const wipInserts = [];
        for (const it of prodFinishedItems) {
          const { data: capData } = await db.from('product_capacities')
            .select('capacity_per_hour').eq('product_code', it.productCode).maybeSingle();
          const stdTime = capData?.capacity_per_hour ? (1 / parseFloat(capData.capacity_per_hour)) : 0.05;
          orderUpserts.push({
            order_code: it.orderCode,
            product_code: it.productCode,
            target_quantity: it.qty,
            standard_time_per_unit: stdTime,
            status: 'pending',
          });
          wipInserts.push({
            item_code: it.productCode,
            item_name: it.productName || `Thành phẩm ${it.productCode}`,
            unit: 'Bộ',
            location: `SX9-${it.orderCode}`,
            quantity: it.qty,
            import_date: todayLocal(),
          });
        }

        const { error: orderErr } = await db.from('production_orders').upsert(orderUpserts, { onConflict: 'order_code' });
        if (orderErr) throw orderErr;

        const { error: wipErr } = await db.from('inventory_stock').insert(wipInserts);
        if (wipErr) console.warn('Không thể tạo tồn kho tạm (WIP):', wipErr);

        // 5.2 Trừ nhu cầu DKSX — gộp theo mã thành phẩm (Σqty) để không trừ thiếu/thừa khi trùng mã
        const demandByCode = {};
        for (const it of prodFinishedItems) {
          demandByCode[it.productCode] = (demandByCode[it.productCode] || 0) + Number(it.qty);
        }
        for (const [code, qtySum] of Object.entries(demandByCode)) {
          try {
            const { data: pd } = await db.from('production_demand').select('id, qty_demand').eq('item_code', code).maybeSingle();
            if (pd) {
              const remain = Math.max(0, Number(pd.qty_demand) - qtySum);
              await db.from('production_demand').update({
                qty_demand: remain,
                trang_thai: remain <= 0 ? 'Hoàn thành' : 'Đang SX',
                updated_at: new Date().toISOString(),
              }).eq('id', pd.id);
            }
          } catch (e) { console.warn('Không cập nhật được DKSX:', e.message); }
        }
      }
```

- [ ] **Step 3: Build kiểm tra**

Run: `npm run build`
Expected: còn lỗi tham chiếu `selectedProduct`/`selectedProductName`/`quantity` ở phần in (Task 5). Tiếp tục.

---

## Task 5: Phần in / kết quả + form modal cho production multi

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx`

- [ ] **Step 1: Đổi `selectedProductName` thành tổng hợp multi**

Tìm (dòng ~1247):

```js
  const selectedProductName = products.find(p => p.code === selectedProduct)?.name || '';
```

Thay bằng (giữ tên biến để chỗ khác không vỡ; tính tổng SL phục vụ header in):

```js
  const totalProdQty = prodFinishedItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);
```

- [ ] **Step 2: Sửa header in mode production (cột trái + phải)**

Tìm khối cuối `else (...)` trong header in (dòng ~1424-1429):

```js
                  ) : (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Mã SP:</strong> {selectedProduct}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên SP:</strong> {selectedProductName}</p>
                     </>
                  )}
```

Thay bằng:

```js
                  ) : (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Số mã SX:</strong> {prodFinishedItems.length}</p>
                       <p style={{margin:'3px 0'}}><strong>Tổng SL:</strong> {totalProdQty.toLocaleString('vi-VN')}</p>
                     </>
                  )}
```

Tìm (dòng ~1434) cột phải:

```js
                  {mode === 'production' && <p style={{margin:'3px 0'}}><strong>Số lượng SX:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{quantity}</span></p>}
```

Thay bằng:

```js
                  {mode === 'production' && <p style={{margin:'3px 0'}}><strong>Tổng SL SX:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{totalProdQty.toLocaleString('vi-VN')}</span></p>}
```

- [ ] **Step 2b: Thêm bảng "Danh sách thành phẩm sản xuất" (chỉ mode production)**

Tìm dòng mở đầu phần "Print Details" (dòng ~1441-1444):

```js
            {/* Print Details */}
            <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'1rem',color:'#334155', padding:'0 1rem'}}>
              {(mode === 'delivery' || mode === 'manual_export' || mode === 'disassemble') ? 'Danh sách hàng hóa xuất kho:' : 'Danh sách linh kiện cần lấy:'}
            </h3>
```

Thay bằng (chèn bảng thành phẩm TRƯỚC tiêu đề linh kiện, đổi text tiêu đề linh kiện cho production):

```js
            {/* Danh sách thành phẩm (mode production, nhiều mã / 1 phiếu) */}
            {mode === 'production' && (
              <div style={{margin:'0 1rem 1.5rem'}}>
                <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'0.75rem',color:'#334155'}}>Danh sách thành phẩm sản xuất:</h3>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                  <thead>
                    <tr style={{background:'#f8fafc',borderBottom:'2px solid #cbd5e1',borderTop:'2px solid #cbd5e1'}}>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã SP</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Tên</th>
                      <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>Số lượng</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã lệnh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodFinishedItems.map(it => (
                      <tr key={it.orderCode} style={{borderBottom:'1px solid #e2e8f0'}}>
                        <td style={{padding:'0.4rem',fontWeight:600,color:'#0f172a'}}>{it.productCode}</td>
                        <td style={{padding:'0.4rem'}}>{it.productName}</td>
                        <td style={{padding:'0.4rem',textAlign:'center',fontWeight:700}}>{it.qty}</td>
                        <td style={{padding:'0.4rem',color:'#64748b'}}>{it.orderCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Print Details */}
            <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'1rem',color:'#334155', padding:'0 1rem'}}>
              {(mode === 'delivery' || mode === 'manual_export' || mode === 'disassemble') ? 'Danh sách hàng hóa xuất kho:' : 'Danh sách linh kiện cần lấy (tổng chung):'}
            </h3>
```

- [ ] **Step 3: Viết lại nội dung modal production (1 dòng → nhiều dòng)**

Tìm khối modal (dòng ~1619-1647): từ `<div style={{marginBottom:15}}>` chứa "Thành phẩm cần sản xuất" tới hết checkbox "Ưu tiên lấy kho VTSX". Thay đoạn **Thành phẩm + Số lượng** (2 block `marginBottom:15` đầu) bằng bảng nhiều dòng. Cụ thể, thay:

```js
            <div style={{marginBottom:15}}>
              <label style={s.label}>Thành phẩm cần sản xuất</label>
              <SearchableSelect 
                value={selectedProduct} 
                onChange={setSelectedProduct} 
                placeholder="-- Gõ hoặc chọn mã SP --"
                options={products.map(p => ({ value: p.code, label: p.name }))}
              />
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Số lượng</label>
              <input type="number" min="1" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} style={s.input}/>
            </div>
```

bằng:

```js
            <div style={{marginBottom:15}}>
              <label style={s.label}>Thành phẩm cần sản xuất</label>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {prodRows.map(row => (
                  <div key={row.id} style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <SearchableSelect
                        value={row.code}
                        onChange={(v) => updateProdRow(row.id, { code: v, name: products.find(p => p.code === v)?.name || '' })}
                        placeholder="-- Gõ hoặc chọn mã SP --"
                        options={products.map(p => ({ value: p.code, label: p.name }))}
                      />
                    </div>
                    <input
                      type="number" min="1"
                      value={row.qty}
                      onChange={(e) => updateProdRow(row.id, { qty: e.target.value })}
                      placeholder="SL"
                      style={{...s.input, width:90}}
                    />
                    <button
                      onClick={() => removeProdRow(row.id)}
                      disabled={prodRows.length <= 1}
                      title="Xoá dòng"
                      style={{border:'none', background:'#fef2f2', color: prodRows.length <= 1 ? '#cbd5e1' : '#dc2626', borderRadius:7, width:34, height:34, cursor: prodRows.length <= 1 ? 'not-allowed' : 'pointer', fontWeight:700, flexShrink:0}}
                    >✕</button>
                  </div>
                ))}
              </div>
              <button onClick={addProdRow} style={{marginTop:8, ...s.btn, background:'#f1f5f9', color:'#0891b2', border:'1px dashed #94a3b8'}}>
                + Thêm thành phẩm
              </button>
            </div>
```

- [ ] **Step 4: Sửa điều kiện disabled nút "Tính toán bốc dỡ"**

Tìm (dòng ~1654-1656) nút submit modal:

```js
              <button 
                onClick={handleProductionSubmit} 
                disabled={!selectedProduct || quantity <= 0}
                style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:(selectedProduct && quantity > 0) ? '#0891b2' : '#cbd5e1', color:'#fff', fontWeight:600, cursor:(selectedProduct && quantity > 0) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5 }}
              >
```

Thay bằng (dùng cờ `hasValidProdRow`):

```js
              <button 
                onClick={handleProductionSubmit} 
                disabled={!prodRows.some(r => r.code && Number(r.qty) > 0)}
                style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background: prodRows.some(r => r.code && Number(r.qty) > 0) ? '#0891b2' : '#cbd5e1', color:'#fff', fontWeight:600, cursor: prodRows.some(r => r.code && Number(r.qty) > 0) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5 }}
              >
```

- [ ] **Step 5: Nới rộng modal để chứa bảng**

Tìm (dòng ~1614) container modal production:

```js
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:500, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out', maxHeight:'90vh', overflowY:'auto' }}>
```

Đổi `maxWidth:500` → `maxWidth:640`.

- [ ] **Step 6: Cập nhật `handleResetToCards`**

Tìm (dòng ~1275-1286):

```js
  const handleResetToCards = () => {
    setAllocations(null);
    setOrderCreated(false);
    setMode('production');
    setSelectedProduct('');
    setQuantity(1);
    setNotes('');
    setOrderItems([]);
    setGeneratedComponents([]);
    setStockPool({});
    setEditingCompIdx(null);
  };
```

Thay 2 dòng `setSelectedProduct('')`/`setQuantity(1)` bằng:

```js
    setProdRows([emptyProdRow()]);
    setProdFinishedItems([]);
```

- [ ] **Step 7: Build sạch — không còn lỗi tham chiếu**

Run: `npm run build`
Expected: BUILD PASS. Nếu còn báo `selectedProduct`/`quantity`/`selectedProductName` ở đâu, tìm và xử lý (grep `selectedProduct`, `setQuantity`, `selectedProductName`, `\bquantity\b` trong file — chỉ được còn các tham chiếu đã thay).

- [ ] **Step 8: Chạy toàn bộ test + lint**

Run: `npm run test` rồi `npm run lint`
Expected: test PASS, lint không lỗi mới.

- [ ] **Step 9: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): Lệnh Sản Xuất nhiều mã / 1 phiếu - linh kiện gộp tổng chung"
```

---

## Task 6: Kiểm thử thủ công trên preview

**Files:** (không sửa code — chỉ verify)

- [ ] **Step 1: Khởi động preview & đăng nhập**

Theo memory `qlsx-preview-verification.md`: `preview_start`, đăng nhập, vào Kho Hàng → tab PSX.

- [ ] **Step 2: Test 1 mã (regression)**

Mở "Lệnh Sản Xuất" → 1 dòng (mã có BOM + SL) → Tính toán. Xác nhận:
- Mã phiếu dạng `PSX-YYYYMMDD-NN` (không hậu tố).
- Bảng "Danh sách thành phẩm" hiện 1 dòng, "Mã lệnh" = mã phiếu.
- Linh kiện phân bổ đúng như trước.

- [ ] **Step 3: Test nhiều mã + gộp linh kiện**

Thêm 2–3 thành phẩm có **chung ít nhất 1 linh kiện**, SL khác nhau → Tính toán. Xác nhận:
- Linh kiện chung hiện **1 dòng** với SL = tổng (kiểm tra bằng tay: Σ quantity_BOM × qty).
- Bảng thành phẩm hiện đủ các dòng, "Mã lệnh" = `PSX-...-NN.1`, `.2`, `.3`.

- [ ] **Step 4: Test LƯU phiếu (chỉ khi data preview cho phép)**

Bấm "LƯU PHIẾU" → xác nhận không lỗi. Kiểm tra (qua tab tương ứng hoặc DB):
- `production_orders`: có N dòng `.1/.2/...`, đúng `target_quantity` từng mã.
- `inventory_stock`: có N tồn WIP `SX9-PSX-...-NN.k`.
- Linh kiện bị trừ đúng tổng; `inventory_picking_logs` ghi `product_code='SAN_XUAT'` (khi >1 mã).
- Tab "DL xuất"/Sổ sách: linh kiện ghi type `XBS` theo mã phiếu.

> Nếu môi trường preview không nên ghi DB thật, dừng ở Step 3 (verify tính toán/hiển thị) và báo lại để quyết định test ghi trên data nào.

- [ ] **Step 5: Chụp ảnh bằng chứng**

`preview_screenshot` phiếu nhiều mã (thấy rõ bảng thành phẩm + linh kiện gộp tổng) gửi người dùng.

---

## Self-Review (đã chạy khi viết plan)

- **Spec coverage:** Form đa dòng (T2,T5), gộp BOM tổng (T1,T3), FIFO 1 lần (T1,T3), mã `PSX-...-NN.k` (T1,T3), mỗi mã 1 lệnh + WIP + DKSX (T4), in 2 khối không cột ngày từng dòng (T5), persistence/reset/prefill (T2,T5), không đụng mode khác (mọi sửa đổi bọc trong `mode==='production'` hoặc nhánh tương ứng). ✔
- **Placeholder scan:** không có TBD/TODO; mọi step có code thật. ✔
- **Type consistency:** `prodFinishedItems` item = `{ orderCode, productCode, productName, qty }` dùng nhất quán ở T1/T3/T4/T5; `allocateFIFO` trả `{ result, isShortage }`; `aggregateComponentDemand` trả `[{ code, name, unit, requiredQty }]` khớp cấu trúc `allocations` cũ. ✔
