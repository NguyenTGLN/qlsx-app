# Nhập Đơn Hàng Tay — nhóm theo đơn hàng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi modal "Nhập Đơn Hàng Tay" từ danh sách dòng phẳng sang cấu trúc nhóm — mỗi đơn hàng gõ mã 1 lần và chứa nhiều mã sản phẩm, có nút "+ Thêm mã sản phẩm" trong đơn và "+ Thêm đơn hàng".

**Architecture:** Tách logic trải phẳng + kiểm tra hợp lệ thành hàm thuần `parseManualOrders` trong `src/lib/` (test bằng vitest). Component `ProductionOrderTab.jsx` đổi state sang mô hình nhóm `{ orderCode, products: [...] }`, dựng lại JSX modal, và gọi `parseManualOrders` khi Tính toán — luồng `checkDuplicatesAndCalculate` phía sau giữ nguyên. CSS responsive cập nhật cho ô sản phẩm con.

**Tech Stack:** React 19, Vite, Vitest, CSS thuần (`src/index.css`).

**Spec:** `docs/superpowers/specs/2026-07-09-nhap-don-hang-tay-nhom-theo-don-design.md`

---

## File Structure

- **Create** `src/lib/manualOrderParse.js` — hàm thuần `parseManualOrders(orders)` → `{ items, error }`. Một trách nhiệm: trải phẳng nhóm đơn thành item + kiểm tra hợp lệ, không phụ thuộc React.
- **Create** `src/lib/manualOrderParse.test.js` — test vitest cho hàm trên.
- **Modify** `src/pages/kho/ProductionOrderTab.jsx` — helper tạo đơn/sản phẩm, state `manualOrders`, các hàm thao tác, `handleCalculateManualOrder`, `handleOpenManualOrder`, và JSX modal.
- **Modify** `src/index.css` — quy tắc responsive `@media (max-width:640px)` cho ô sản phẩm con.

---

## Task 1: Hàm thuần `parseManualOrders` (trải phẳng + kiểm tra)

**Files:**
- Create: `src/lib/manualOrderParse.js`
- Test: `src/lib/manualOrderParse.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/manualOrderParse.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseManualOrders } from './manualOrderParse';

const order = (orderCode, products) => ({ id: 1, orderCode, products });
const prod = (code, qty, extra = {}) => ({ id: 1, code, name: '', qty, unit: '', ...extra });

describe('parseManualOrders', () => {
  it('trải phẳng nhiều mã SP của 1 đơn thành từng item mang cùng orderCode', () => {
    const { items, error } = parseManualOrders([
      order('DH-001', [prod('A', '10', { name: 'Máy A', unit: 'Cái' }), prod('B', '5', { unit: 'Bộ' })]),
    ]);
    expect(error).toBe(null);
    expect(items).toEqual([
      { orderCode: 'DH-001', productCode: 'A', productName: 'Máy A', qty: 10, unit: 'Cái' },
      { orderCode: 'DH-001', productCode: 'B', productName: '', qty: 5, unit: 'Bộ' },
    ]);
  });

  it('nhiều đơn — mỗi item giữ orderCode của đơn tương ứng', () => {
    const { items } = parseManualOrders([
      order('DH-001', [prod('A', '1')]),
      order('DH-002', [prod('B', '2')]),
    ]);
    expect(items.map(i => i.orderCode)).toEqual(['DH-001', 'DH-002']);
  });

  it('bỏ qua ô sản phẩm trống hoàn toàn (không code, không qty)', () => {
    const { items, error } = parseManualOrders([
      order('DH-001', [prod('A', '1'), prod('', '')]),
    ]);
    expect(error).toBe(null);
    expect(items).toHaveLength(1);
  });

  it('trim mã đơn, mã SP và đơn vị', () => {
    const { items } = parseManualOrders([
      order('  DH-001  ', [prod('  A  ', '1', { unit: '  Cái  ' })]),
    ]);
    expect(items[0]).toMatchObject({ orderCode: 'DH-001', productCode: 'A', unit: 'Cái' });
  });

  it('đơn có mã SP hợp lệ nhưng thiếu Mã đơn hàng → lỗi theo số thứ tự đơn', () => {
    const { error } = parseManualOrders([
      order('DH-001', [prod('A', '1')]),
      order('   ', [prod('B', '2')]),
    ]);
    expect(error).toBe('Đơn hàng 2: thiếu Mã đơn hàng.');
  });

  it('thiếu Mã sản phẩm (có qty) → lỗi theo số thứ tự đơn + sản phẩm', () => {
    const { error } = parseManualOrders([
      order('DH-001', [prod('', '3')]),
    ]);
    expect(error).toBe('Đơn hàng 1 — Sản phẩm 1: thiếu Mã sản phẩm.');
  });

  it('Số lượng không hợp lệ (0, âm, không phải số) → lỗi', () => {
    expect(parseManualOrders([order('DH-001', [prod('A', '0')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
    expect(parseManualOrders([order('DH-001', [prod('A', '-2')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
    expect(parseManualOrders([order('DH-001', [prod('A', 'abc')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
  });

  it('không có item hợp lệ nào → lỗi yêu cầu nhập ít nhất 1 dòng', () => {
    const { items, error } = parseManualOrders([order('', [prod('', '')])]);
    expect(items).toEqual([]);
    expect(error).toBe('Vui lòng nhập ít nhất 1 đơn hàng có Mã đơn, Mã sản phẩm và Số lượng hợp lệ!');
  });

  it('đơn hoàn toàn trống bị bỏ qua, không chặn đơn hợp lệ khác', () => {
    const { items, error } = parseManualOrders([
      order('', [prod('', '')]),
      order('DH-002', [prod('B', '2')]),
    ]);
    expect(error).toBe(null);
    expect(items).toEqual([
      { orderCode: 'DH-002', productCode: 'B', productName: '', qty: 2, unit: '' },
    ]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- manualOrderParse`
Expected: FAIL — `Failed to resolve import "./manualOrderParse"` (chưa có file).

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/manualOrderParse.js`:

```js
// Trải phẳng danh sách đơn hàng nhập tay (nhóm) thành mảng item cho luồng tính toán,
// đồng thời kiểm tra hợp lệ. Trả về { items, error } — error là chuỗi (đã kèm số thứ tự) hoặc null.
export function parseManualOrders(orders) {
  const items = [];
  const list = Array.isArray(orders) ? orders : [];
  for (let oIdx = 0; oIdx < list.length; oIdx++) {
    const order = list[oIdx] || {};
    const orderCode = String(order.orderCode || '').trim();
    const products = Array.isArray(order.products) ? order.products : [];
    for (let pIdx = 0; pIdx < products.length; pIdx++) {
      const p = products[pIdx] || {};
      const code = String(p.code || '').trim();
      const qtyStr = String(p.qty ?? '').trim();
      // Ô sản phẩm trống hoàn toàn — bỏ qua
      if (!code && !qtyStr) continue;
      if (!orderCode) return { items: [], error: `Đơn hàng ${oIdx + 1}: thiếu Mã đơn hàng.` };
      if (!code) return { items: [], error: `Đơn hàng ${oIdx + 1} — Sản phẩm ${pIdx + 1}: thiếu Mã sản phẩm.` };
      const qty = Number(p.qty);
      if (isNaN(qty) || qty <= 0) return { items: [], error: `Đơn hàng ${oIdx + 1} — Sản phẩm ${pIdx + 1}: Số lượng phải lớn hơn 0.` };
      items.push({
        orderCode,
        productCode: code,
        productName: p.name || '',
        qty,
        unit: String(p.unit || '').trim(),
      });
    }
  }
  if (items.length === 0) {
    return { items: [], error: 'Vui lòng nhập ít nhất 1 đơn hàng có Mã đơn, Mã sản phẩm và Số lượng hợp lệ!' };
  }
  return { items, error: null };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm test -- manualOrderParse`
Expected: PASS — tất cả case xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/manualOrderParse.js src/lib/manualOrderParse.test.js
git commit -m "feat(kho): ham thuan parseManualOrders trai phang + kiem tra don hang nhap tay"
```

---

## Task 2: Đổi state + handler modal sang mô hình nhóm

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (import; helper dòng 22-24; state dòng ~319; handler dòng ~697-734)

- [ ] **Step 1: Thêm import hàm thuần**

Ở đầu file, ngay sau dòng `import { missingCapacities, capacityMap } from '../../lib/capacityGuard';` (dòng 9), thêm:

```js
import { parseManualOrders } from '../../lib/manualOrderParse';
```

- [ ] **Step 2: Thay helper tạo dòng bằng helper tạo đơn/sản phẩm**

Thay khối (dòng 22-24):

```js
// id ổn định cho từng dòng đơn hàng nhập tay
let __manualOrderRowSeq = 0;
const emptyManualOrderRow = (orderCode = '') => ({ id: ++__manualOrderRowSeq, orderCode, code: '', name: '', qty: '', unit: '' });
```

bằng:

```js
// id ổn định cho từng đơn hàng / mã SP nhập tay (React key, giữ focus khi thêm-xoá)
let __manualOrderSeq = 0;
const emptyManualProduct = () => ({ id: ++__manualOrderSeq, code: '', name: '', qty: '', unit: '' });
const emptyManualOrder = () => ({ id: ++__manualOrderSeq, orderCode: '', products: [emptyManualProduct()] });
```

- [ ] **Step 3: Đổi state `manualOrderRows` → `manualOrders`**

Thay (dòng ~319):

```js
  const [manualOrderRows, setManualOrderRows] = useState([emptyManualOrderRow()]);
```

bằng:

```js
  const [manualOrders, setManualOrders] = useState([emptyManualOrder()]);
```

- [ ] **Step 4: Thay `handleOpenManualOrder`, `addManualOrderRow`, `handleCalculateManualOrder`**

Thay khối từ `const handleOpenManualOrder = () => {` (dòng ~697) đến hết `handleCalculateManualOrder` (dòng ~734):

```js
  const handleOpenManualOrder = () => {
    setShowDeliveryChoiceModal(false);
    setShowManualOrderModal(true);
    setManualOrders([emptyManualOrder()]);
    loadStockItems();
  };

  // Thao tác trên nhóm đơn hàng nhập tay (cập nhật bất biến theo id)
  const addManualOrder = () => setManualOrders(os => [...os, emptyManualOrder()]);
  const removeManualOrder = (orderId) =>
    setManualOrders(os => os.length > 1 ? os.filter(o => o.id !== orderId) : os);
  const setManualOrderCode = (orderId, val) =>
    setManualOrders(os => os.map(o => o.id === orderId ? { ...o, orderCode: val } : o));
  const addManualProduct = (orderId) =>
    setManualOrders(os => os.map(o => o.id === orderId ? { ...o, products: [...o.products, emptyManualProduct()] } : o));
  const removeManualProduct = (orderId, prodId) =>
    setManualOrders(os => os.map(o => o.id === orderId
      ? { ...o, products: o.products.length > 1 ? o.products.filter(p => p.id !== prodId) : o.products }
      : o));
  const setManualProductField = (orderId, prodId, patch) =>
    setManualOrders(os => os.map(o => o.id === orderId
      ? { ...o, products: o.products.map(p => p.id === prodId ? { ...p, ...patch } : p) }
      : o));

  const handleCalculateManualOrder = () => {
    const { items, error } = parseManualOrders(manualOrders);
    if (error) return alert(error);
    setShowManualOrderModal(false);
    checkDuplicatesAndCalculate(items);
  };
```

- [ ] **Step 5: Kiểm tra không còn tham chiếu cũ**

Run: `git grep -n "manualOrderRows\|emptyManualOrderRow\|addManualOrderRow"` (trong thư mục dự án)
Expected: chỉ còn kết quả trong `deploy-netlify/` (bundle build sẵn) và trong docs — KHÔNG còn trong `src/`. (JSX ở Task 3 sẽ thay nốt phần dùng trong modal; nếu chạy grep trước Task 3 thì các tham chiếu trong JSX dòng ~1815-1861 vẫn còn — sẽ hết sau Task 3.)

> Task 2 và 3 phải hoàn tất trước khi app biên dịch lại được (JSX cũ còn tham chiếu state cũ). Commit sau Task 3.

---

## Task 3: Dựng lại JSX modal theo cấu trúc nhóm

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (JSX modal dòng ~1815-1861)

- [ ] **Step 1: Thay phần thân modal (map dòng + nút Thêm dòng)**

Thay khối từ `{manualOrderRows.map((row, idx) => (` (dòng ~1815) đến hết nút `+ Thêm dòng` (`</button>` dòng ~1861):

```jsx
            {manualOrders.map((order, oIdx) => (
              <div key={order.id} style={{ border:'1px solid #ddd6fe', borderRadius:12, padding:'0.9rem', marginBottom:14, background:'#faf7ff' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:'0.8rem', fontWeight:700, color:'#7c3aed' }}>Đơn hàng #{oIdx + 1}</span>
                  {manualOrders.length > 1 && (
                    <button onClick={() => removeManualOrder(order.id)} title="Xoá đơn hàng"
                      style={{ height:30, padding:'0 10px', borderRadius:8, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700, fontSize:'0.75rem' }}>✕ Xoá đơn</button>
                  )}
                </div>

                <div style={{ marginBottom:10 }}>
                  <label style={s.label}>Mã đơn hàng</label>
                  <input type="text" style={s.input} value={order.orderCode}
                    onChange={e => setManualOrderCode(order.id, e.target.value)}
                    placeholder="VD: DH-001" />
                </div>

                {order.products.map((row, pIdx) => (
                  <div key={row.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'0.75rem', marginBottom:8, background:'#fff' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:'0.72rem', fontWeight:600, color:'#94a3b8' }}>Sản phẩm {pIdx + 1}</span>
                      {order.products.length > 1 && (
                        <button onClick={() => removeManualProduct(order.id, row.id)} title="Xoá mã sản phẩm"
                          style={{ height:26, width:26, borderRadius:7, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>✕</button>
                      )}
                    </div>
                    <div className="manual-order-row" style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 0.6fr 0.55fr', gap:10, alignItems:'end' }}>
                      <div className="mor-code">
                        <label style={s.label}>Mã sản phẩm</label>
                        <SearchableSelect
                          options={stockItems.map(p => ({value: p.code, label: p.name}))}
                          value={row.code}
                          onChange={(val) => setManualProductField(order.id, row.id, { code: val, name: stockItems.find(p => p.code === val)?.name || '' })}
                          placeholder="Tìm mã hoặc tên..."
                        />
                      </div>
                      <div className="mor-name">
                        <label style={s.label}>Tên</label>
                        <input type="text" style={{...s.input, background:'#eef2f7', color:'#64748b'}} value={row.name} disabled />
                      </div>
                      <div className="mor-qty">
                        <label style={s.label}>Số lượng</label>
                        <input type="number" min="1" step="any" style={s.input} value={row.qty}
                          onChange={e => setManualProductField(order.id, row.id, { qty: e.target.value })}
                          placeholder="SL..." />
                      </div>
                      <div className="mor-unit">
                        <label style={s.label}>Đơn vị</label>
                        <input type="text" style={s.input} value={row.unit}
                          onChange={e => setManualProductField(order.id, row.id, { unit: e.target.value })}
                          placeholder="Cái" />
                      </div>
                    </div>
                  </div>
                ))}

                <button onClick={() => addManualProduct(order.id)}
                  style={{ padding:'0.4rem 0.9rem', borderRadius:8, border:'1px dashed #7c3aed', background:'#fff', color:'#7c3aed', fontWeight:700, cursor:'pointer', fontSize:'0.8rem' }}>
                  + Thêm mã sản phẩm
                </button>
              </div>
            ))}

            <button onClick={addManualOrder}
              style={{ padding:'0.55rem 1rem', borderRadius:8, border:'1px dashed #94a3b8', background:'#f8fafc', color:'#475569', fontWeight:700, cursor:'pointer', marginBottom:10, width:'100%' }}>
              + Thêm đơn hàng
            </button>
```

> Footer (Hủy Bỏ / Tính toán xuất kho) ở dưới KHÔNG đổi — vẫn gọi `handleCalculateManualOrder`.

- [ ] **Step 2: Chạy lint để bắt lỗi biến/JSX**

Run: `npm run lint`
Expected: không có lỗi mới ở `src/pages/kho/ProductionOrderTab.jsx` (đặc biệt không còn `manualOrderRows` / `setManualOrderRows` / `emptyManualOrderRow` chưa định nghĩa).

- [ ] **Step 3: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS (gồm cả `manualOrderParse` và các test cũ như `capacityGuard`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): modal nhap don hang tay nhom theo don + nhieu ma san pham"
```

---

## Task 4: Cập nhật CSS responsive cho ô sản phẩm con

**Files:**
- Modify: `src/index.css` (khối `@media (max-width:640px)`, quy tắc `.manual-order-row` dòng ~242-249)

- [ ] **Step 1: Thay quy tắc `.manual-order-row` cũ**

Ô sản phẩm con giờ KHÔNG còn cột "Mã đơn hàng" (`.mor-order`). Thay khối:

```css
  /* Dòng "Nhập Đơn Hàng Tay": trên điện thoại KHÔNG dồn 6 ô vào 1 hàng chật.
     Xếp lại: Mã đơn full → Mã SP full → Tên full → Số lượng + Đơn vị 2 cột → nút xoá góc phải. */
  .manual-order-row { grid-template-columns: 1fr 1fr !important; }
  .manual-order-row > .mor-order,
  .manual-order-row > .mor-code,
  .manual-order-row > .mor-name { grid-column: 1 / -1 !important; }
  .manual-order-row > .mor-del { grid-column: 1 / -1 !important; justify-self: end !important; }
```

bằng:

```css
  /* Ô "Sản phẩm" trong "Nhập Đơn Hàng Tay": trên điện thoại KHÔNG dồn 4 ô vào 1 hàng chật.
     Xếp lại: Mã SP full → Tên full → Số lượng + Đơn vị 2 cột. (Mã đơn hàng nằm ở đầu khối, luôn full.) */
  .manual-order-row { grid-template-columns: 1fr 1fr !important; }
  .manual-order-row > .mor-code,
  .manual-order-row > .mor-name { grid-column: 1 / -1 !important; }
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style(kho): responsive o san pham con trong modal nhap don hang tay"
```

---

## Task 5: Kiểm tra thực tế trên preview (mobile) + ghi chú build

**Files:** không sửa file — chỉ verify.

- [ ] **Step 1: Khởi động preview + set mobile**

- `preview_start` config `qlsx-dev` → lấy `serverId`, `port`.
- `preview_resize` serverId, preset `mobile` (375×812).

- [ ] **Step 2: Kiểm tra cấu trúc + layout modal**

Do cần đăng nhập (custom auth), nếu không có credentials thì verify bằng `preview_eval` đo layout của ô sản phẩm con ở 375px (xem [[qlsx-preview-verification]] để đăng nhập nếu có tài khoản):

Run (preview_eval): dựng thử 1 `.manual-order-row` với 4 con `.mor-code/.mor-name/.mor-qty/.mor-unit`, đọc `getComputedStyle(...).gridColumn`.
Expected: `mor-code` và `mor-name` = `1 / -1` (full width); `mor-qty`, `mor-unit` = `auto / auto` (mỗi ô 1/2 hàng); `rowGridTemplateColumns` ≈ 2 cột bằng nhau.

Nếu có tài khoản: đăng nhập → mở tab Kho → "Nhập kho" → "Nhập Đơn Hàng" → "Nhập tay"; bấm "+ Thêm mã sản phẩm" (thêm mã trong đơn) và "+ Thêm đơn hàng" (thêm đơn); nhập 1 đơn 2 mã, bấm "Tính toán xuất kho", xác nhận đi tiếp vào luồng phân bổ như cũ.

- [ ] **Step 3: Dừng server**

- `preview_stop` serverId.

- [ ] **Step 4 (do user): Build + deploy**

Thay đổi mới ở source. Để lên production, user chạy `npm run build` rồi copy `dist/` → `deploy-netlify/`, sau đó kéo-thả `deploy-netlify/` lên Netlify (xem [[qlsx-netlify-deploy]]). KHÔNG tự build trong plan trừ khi user yêu cầu.

---

## Self-Review

- **Spec coverage:** Nhóm theo đơn (Task 3) ✓ · Mã đơn 1 lần/đơn (Task 3, ô đầu khối) ✓ · "+ Thêm mã sản phẩm" (Task 3) ✓ · "+ Thêm đơn hàng" (Task 3) ✓ · Xoá đơn / xoá mã có chặn còn-1 (Task 2 mutators + Task 3 điều kiện hiển thị) ✓ · Mô hình dữ liệu nhóm (Task 2) ✓ · Trải phẳng + kiểm tra giữ luồng sau (Task 1 + `handleCalculateManualOrder` Task 2) ✓ · Mặc định 1 đơn 1 mã (Task 2 `emptyManualOrder`) ✓ · Responsive (Task 4) ✓ · Không đụng `.manual-export-row` ✓.
- **Placeholder scan:** không có TBD/TODO; mọi step có mã/lệnh cụ thể.
- **Type consistency:** helper `emptyManualOrder`/`emptyManualProduct`, state `manualOrders`/`setManualOrders`, mutators `addManualOrder`/`removeManualOrder`/`setManualOrderCode`/`addManualProduct`/`removeManualProduct`/`setManualProductField`, và item output `{ orderCode, productCode, productName, qty, unit }` khớp giữa Task 1–3. Class CSS `.mor-code/.mor-name/.mor-qty/.mor-unit` khớp giữa JSX (Task 3) và CSS (Task 4).
