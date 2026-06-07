# Xuất Kho Thủ Công — nhiều mã + danh sách lý do — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép xuất nhiều mã trên 1 phiếu "Xuất Kho Thủ Công", mỗi dòng chọn 1 lý do từ danh sách 27 lý do chuẩn; mỗi lý do tự gắn loại `type` (XB/XBS/XDG/KHAC) để tách doanh số khỏi demand.

**Architecture:** Tách bảng ánh xạ lý do→loại thành module thuần `src/lib/exportReasons.js` (test bằng vitest). UI + luồng lưu sửa trong `src/pages/kho/ProductionOrderTab.jsx` (state đổi từ 1 mã → mảng dòng). Một migration SQL thêm `XDG` vào view demand `sales_90d_summary`.

**Tech Stack:** React 19, Vite, Vitest, Supabase (`db`), eslint.

**Spec:** `docs/superpowers/specs/2026-06-07-xuat-kho-thu-cong-nhieu-ma-ly-do-design.md`

---

## File Structure

- **Create** `src/lib/exportReasons.js` — hằng số `EXPORT_REASONS` + helper `reasonType(label)`, `reasonNeedsOrderRef(label)`. Một trách nhiệm: ánh xạ lý do.
- **Create** `src/lib/exportReasons.test.js` — vitest cho module trên.
- **Modify** `src/pages/kho/ProductionOrderTab.jsx` — state `manualRows`, modal bảng nhiều dòng, `handleCalculateManualExport`, preview, nhánh lưu `manual_export`.
- **Create** `sql/update_demand_view_include_xdg.sql` — sửa view demand.

---

## Task 1: Module ánh xạ lý do xuất (`src/lib/exportReasons.js`)

**Files:**
- Create: `src/lib/exportReasons.js`
- Test: `src/lib/exportReasons.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `src/lib/exportReasons.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { EXPORT_REASONS, reasonType, reasonNeedsOrderRef } from './exportReasons';

describe('exportReasons', () => {
  it('có đủ 27 lý do', () => {
    expect(EXPORT_REASONS).toHaveLength(27);
  });

  it('mỗi lý do có label không rỗng và type hợp lệ', () => {
    const valid = new Set(['XB', 'XBS', 'XDG', 'KHAC']);
    for (const r of EXPORT_REASONS) {
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
      expect(valid.has(r.type)).toBe(true);
    }
  });

  it('label là duy nhất', () => {
    const labels = EXPORT_REASONS.map(r => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('reasonType trả đúng loại', () => {
    expect(reasonType('Bán ra')).toBe('XB');
    expect(reasonType('Xuất bảo hành')).toBe('XB');
    expect(reasonType('Xuất tặng')).toBe('XB');
    expect(reasonType('Xuất đóng hàng')).toBe('XDG');
    expect(reasonType('Xuất bổ sung')).toBe('XBS');
    expect(reasonType('Xuất sản xuất')).toBe('XBS');
    expect(reasonType('Xuất sửa chữa')).toBe('XBS');
    expect(reasonType('Trả cho khách')).toBe('KHAC');
    expect(reasonType('Tháo máy')).toBe('KHAC');
  });

  it('reasonType với lý do lạ trả KHAC', () => {
    expect(reasonType('không tồn tại')).toBe('KHAC');
  });

  it('chỉ nhóm sản xuất cần chọn Phiếu SX', () => {
    expect(reasonNeedsOrderRef('Xuất sản xuất')).toBe(true);
    expect(reasonNeedsOrderRef('Xuất bổ sung')).toBe(true);
    expect(reasonNeedsOrderRef('Xuất sửa chữa')).toBe(true);
    expect(reasonNeedsOrderRef('Bán ra')).toBe(false);
    expect(reasonNeedsOrderRef('Xuất đóng hàng')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm run test -- src/lib/exportReasons.test.js`
Expected: FAIL — không import được `./exportReasons` (module chưa tồn tại).

- [ ] **Step 3: Viết module tối thiểu**

Create `src/lib/exportReasons.js`:

```js
// Danh sách lý do xuất kho thủ công + ánh xạ sang loại (type) phục vụ
// phân biệt doanh số (XB) và demand đề xuất đặt hàng (XB + XDG).
// Xem spec: docs/superpowers/specs/2026-06-07-xuat-kho-thu-cong-nhieu-ma-ly-do-design.md
export const EXPORT_REASONS = [
  { label: 'Bán ra',                type: 'XB' },
  { label: 'Trả cho khách',         type: 'KHAC' },
  { label: 'Xuất bảo hành',         type: 'XB' },
  { label: 'Xuất sản xuất',         type: 'XBS', needsOrderRef: true },
  { label: 'KM',                    type: 'XB' },
  { label: 'Xuất đi gia công',      type: 'KHAC' },
  { label: 'Xuất lên VP',           type: 'KHAC' },
  { label: 'Xuất trả lại NCC',      type: 'KHAC' },
  { label: 'Xuất tạm ứng',          type: 'KHAC' },
  { label: 'Xuất hủy',              type: 'KHAC' },
  { label: 'Xuất chuyển mã',        type: 'KHAC' },
  { label: 'Xuất làm chương trình', type: 'KHAC' },
  { label: 'Xuất cho sếp',          type: 'KHAC' },
  { label: 'Dùng cho kho',          type: 'KHAC' },
  { label: 'Chuyển kho',            type: 'KHAC' },
  { label: 'Tháo máy',              type: 'KHAC' },
  { label: 'Đổi hàng',              type: 'XB' },
  { label: 'Test',                  type: 'KHAC' },
  { label: 'Đi kiểm nghiệm',        type: 'KHAC' },
  { label: 'Xuất đóng hàng',        type: 'XDG' },
  { label: 'Xuất tặng',             type: 'XB' },
  { label: 'Xuất lắp mẫu',          type: 'KHAC' },
  { label: 'Xuất hỏng',             type: 'KHAC' },
  { label: 'Xuất bổ sung',          type: 'XBS', needsOrderRef: true },
  { label: 'Xuất sửa chữa',         type: 'XBS', needsOrderRef: true },
  { label: 'Cho mượn',              type: 'KHAC' },
  { label: 'Xuất mẫu',              type: 'KHAC' },
];

const BY_LABEL = new Map(EXPORT_REASONS.map(r => [r.label, r]));

export function reasonType(label) {
  return BY_LABEL.get(label)?.type || 'KHAC';
}

export function reasonNeedsOrderRef(label) {
  return BY_LABEL.get(label)?.needsOrderRef === true;
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm run test -- src/lib/exportReasons.test.js`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportReasons.js src/lib/exportReasons.test.js
git commit -m "feat(kho): module ánh xạ 27 lý do xuất kho -> type"
```

---

## Task 2: Migration view demand (`sql/update_demand_view_include_xdg.sql`)

**Files:**
- Create: `sql/update_demand_view_include_xdg.sql`

- [ ] **Step 1: Tạo file migration**

Create `sql/update_demand_view_include_xdg.sql`:

```sql
-- ============================================================
-- Thêm XDG (Xuất đóng hàng) vào view demand đề xuất đặt hàng.
-- Doanh số (thong_ke_ban_hang) giữ nguyên type='XB' -> tách riêng.
-- Chạy: Supabase Dashboard -> SQL Editor -> Paste & Run
-- ============================================================
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) AS total_sales
FROM public.so_luong_ban
WHERE ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
  AND type IN ('XB','XDG')              -- XB = bán; XDG = đóng hàng (tính demand, không vào doanh số)
  AND CAST(so_luong AS NUMERIC) > 0
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;

-- KIỂM TRA: số mã có demand sau khi thêm XDG
-- SELECT COUNT(*) AS so_ma_co_demand FROM public.sales_90d_summary;
```

- [ ] **Step 2: Commit**

```bash
git add sql/update_demand_view_include_xdg.sql
git commit -m "feat(kho): view demand tính thêm XDG (xuất đóng hàng)"
```

> **Lưu ý (thủ công):** Sau khi merge, chạy file SQL này trên Supabase SQL Editor. App không tự chạy migration.

---

## Task 3: Sửa luồng Xuất Kho Thủ Công nhiều mã (`ProductionOrderTab.jsx`)

Thay đổi đan xen (đổi shape state) nên gom 1 commit; build phải xanh trước khi commit.

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx`

### 3a. Import + state

- [ ] **Step 1: Thêm import module lý do**

Thêm dòng import cạnh các import hiện có ở đầu file (sau dòng import React/components):

```jsx
import { EXPORT_REASONS, reasonType, reasonNeedsOrderRef } from '../../lib/exportReasons';
```

- [ ] **Step 2: Thay state manual export**

Tìm khối state hiện tại (khoảng dòng 242-247):

```jsx
  // States for Manual Export Modal
  const [showManualExportModal, setShowManualExportModal] = useState(false);
  const [manualProduct, setManualProduct] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualReason, setManualReason] = useState('XDG'); // 'XDG' (Đóng gói) | 'XBS' (Bổ sung)
  const [manualOrderRef, setManualOrderRef] = useState('');
```

Thay bằng:

```jsx
  // States for Manual Export Modal — nhiều mã trên 1 phiếu, mỗi dòng 1 lý do
  const [showManualExportModal, setShowManualExportModal] = useState(false);
  const emptyManualRow = () => ({ code: '', name: '', qty: '', reason: 'Bán ra', orderRef: '' });
  const [manualRows, setManualRows] = useState([emptyManualRow()]);
```

### 3b. handleOpenManualExport — reset rows

- [ ] **Step 3: Reset manualRows khi mở modal**

Trong `handleOpenManualExport` (khoảng dòng 689), ngay sau `setShowManualExportModal(true);` thêm:

```jsx
    setManualRows([emptyManualRow()]);
```

(Giữ nguyên phần load `recentOrders` và `stockItems` phía dưới.)

### 3c. handleCalculateManualExport — phân bổ nhiều mã

- [ ] **Step 4: Viết lại hàm tính toán nhiều dòng**

Thay toàn bộ thân `handleCalculateManualExport` (khoảng dòng 721-810). Phiên bản mới:

```jsx
  const handleCalculateManualExport = async () => {
    // Lọc dòng hợp lệ
    const rows = manualRows.filter(r => r.code && r.qty && !isNaN(r.qty) && Number(r.qty) > 0);
    if (rows.length === 0) return alert('Vui lòng nhập ít nhất 1 dòng có Mã và Số lượng hợp lệ!');
    // Dòng nào cần Phiếu SX thì phải chọn
    for (const r of rows) {
      if (reasonNeedsOrderRef(r.reason) && !r.orderRef) {
        return alert(`Lý do "${r.reason}" cần chọn Phiếu Sản Xuất (mã ${r.code}).`);
      }
    }

    setLoading(true);
    setMode('manual_export');
    setAllocations(null);
    setOrderCreated(false);
    setShowManualExportModal(false);

    try {
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('inventory_picking_logs')
        .select('order_code')
        .like('order_code', `PXK-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastSeq = parseInt(latestOrder[0].order_code.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PXK-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Lấy tồn của tất cả mã được chọn (FIFO theo import_date)
      const codes = [...new Set(rows.map(r => r.code))];
      const { data: stockData, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', codes)
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

      // Bản sao tồn để trừ dần, dùng chung cho mọi dòng (nhiều dòng cùng mã sẽ trừ tiếp)
      const working = JSON.parse(JSON.stringify(stockData || []));
      let hasShortage = false;
      const result = [];
      const orderItemsArr = [];

      for (const r of rows) {
        let qtyNeeded = Number(r.qty);
        const type = reasonType(r.reason);
        // Không lấy từ kho sản xuất dở dang (SX9-*)
        const compStockRows = working.filter(s => s.item_code === r.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
        const compAllocations = [];
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          row.quantity -= take;
          qtyNeeded -= take;
          compAllocations.push({ stock_id: row.id, location: row.location, before: row.quantity + take, taken: take, remaining: row.quantity });
        }
        if (qtyNeeded > 0) hasShortage = true;
        result.push({
          code: r.code,
          name: r.name,
          unit: '',
          requiredQty: Number(r.qty),
          reason: r.reason,
          type,
          orderRef: r.orderRef || '',
          allocations: compAllocations,
          missing: qtyNeeded,
          isShortage: qtyNeeded > 0,
        });
        orderItemsArr.push({
          orderCode: r.orderRef || generatedCode,
          productCode: r.code,
          productName: r.name,
          qty: Number(r.qty),
          reason: r.reason,
          type,
        });
      }

      setAllocations(result);
      setIsShortage(hasShortage);
      setOrderItems(orderItemsArr);
    } catch (e) {
      console.error(e);
      alert('Lỗi xuất kho thủ công: ' + e.message);
    } finally {
      setLoading(false);
    }
  };
```

### 3d. Nhánh lưu manual_export

- [ ] **Step 5: product_code + notes theo từng dòng trong picking log**

Tìm khối tạo picking log cho lô xuất bình thường (khoảng dòng 964-976). Sửa 2 thuộc tính:

`product_code` hiện tại:

```jsx
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? (manualReason === 'XBS' ? 'Bổ sung' : 'XUAT_KHO') : (mode === 'disassemble' ? allocations[0].code : selectedProduct)),
```

Thay bằng:

```jsx
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? 'XUAT_KHO' : (mode === 'disassemble' ? allocations[0].code : selectedProduct)),
```

`notes` hiện tại:

```jsx
              notes: mode === 'disassemble' ? 'Phân rã (Xuất SP)' : notes,
```

Thay bằng (ghi text lý do của chính dòng `comp`):

```jsx
              notes: mode === 'manual_export' ? (comp.reason || 'Xuất kho') : (mode === 'disassemble' ? 'Phân rã (Xuất SP)' : notes),
```

- [ ] **Step 6: luu_xuat mang type theo từng dòng**

Tìm khối build `slbData` cho delivery/manual_export (khoảng dòng 1034-1042):

```jsx
      if (mode === 'delivery' || mode === 'manual_export') {
         slbData = orderItems.map(item => ({
            ma_don_hang: item.orderCode, // Sẽ là PXK-... (hoặc PSX-... nếu bổ sung)
            ma_san_pham: item.productCode,
            ten_san_pham: item.productName,
            so_luong: item.qty,
            ngay_xuat: todayLocal(),
            created_at: new Date(baseTimeMs).toISOString()
         }));
      } else if (mode === 'disassemble') {
```

Thay phần `.map` để bê `type` theo từng dòng (delivery không có `item.type` nên fallback giữ nguyên hành vi cũ qua `exportType` ở dưới):

```jsx
      if (mode === 'delivery' || mode === 'manual_export') {
         slbData = orderItems.map(item => ({
            ma_don_hang: item.orderCode, // PXK-... (hoặc PSX-... nếu chọn Phiếu SX)
            ma_san_pham: item.productCode,
            ten_san_pham: item.productName,
            so_luong: item.qty,
            ngay_xuat: todayLocal(),
            type: item.type, // manual_export: type theo lý do từng dòng; delivery: undefined -> dùng exportType
            created_at: new Date(baseTimeMs).toISOString()
         }));
      } else if (mode === 'disassemble') {
```

Khối gắn type ở dưới (khoảng dòng 1069-1077) **giữ nguyên** — vì `slbDataTyped` map dùng `r.type || exportType`, dòng manual đã có `type` nên được tôn trọng, delivery (`type` undefined) vẫn nhận `exportType='XB'`.

### 3e. Modal UI nhiều dòng

- [ ] **Step 7: Thay nội dung modal**

Thay toàn bộ JSX modal (khoảng dòng 1653-1728, từ `<div ...modal...>` trong `{showManualExportModal && ( ... )}`). Phiên bản mới (giữ wrapper overlay + style hiện có):

```jsx
      {showManualExportModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:880, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight: 800 }}>
              <Package size={24} color="#0284c7"/> Xuất Kho Thủ Công
            </h3>

            {manualRows.map((row, idx) => {
              const needRef = reasonNeedsOrderRef(row.reason);
              return (
                <div key={idx} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'0.9rem', marginBottom:12, background:'#f8fafc' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 0.7fr 1.2fr auto', gap:10, alignItems:'end' }}>
                    <div>
                      <label style={s.label}>Mã SP / linh kiện</label>
                      <SearchableSelect
                        options={stockItems.map(p => ({value: p.code, label: p.name}))}
                        value={row.code}
                        onChange={(val) => setManualRows(rs => rs.map((r, i) => i === idx
                          ? { ...r, code: val, name: stockItems.find(p => p.code === val)?.name || '' }
                          : r))}
                        placeholder="Tìm mã hoặc tên..."
                      />
                    </div>
                    <div>
                      <label style={s.label}>Tên</label>
                      <input type="text" style={{...s.input, background:'#eef2f7', color:'#64748b'}} value={row.name} disabled />
                    </div>
                    <div>
                      <label style={s.label}>Số lượng</label>
                      <input type="number" min="1" style={s.input} value={row.qty}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                        placeholder="SL..." />
                    </div>
                    <div>
                      <label style={s.label}>Lý do xuất</label>
                      <select style={s.input} value={row.reason}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, reason: e.target.value, orderRef: '' } : r))}>
                        {EXPORT_REASONS.map(opt => <option key={opt.label} value={opt.label}>{opt.label}</option>)}
                      </select>
                    </div>
                    <button onClick={() => setManualRows(rs => rs.length > 1 ? rs.filter((_, i) => i !== idx) : [emptyManualRow()])}
                      title="Xoá dòng"
                      style={{ height:38, width:38, borderRadius:8, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>✕</button>
                  </div>
                  {needRef && (
                    <div style={{ marginTop:10 }}>
                      <label style={s.label}>Bổ sung cho Phiếu Sản Xuất (tùy chọn)</label>
                      <select style={s.input} value={row.orderRef}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, orderRef: e.target.value } : r))}>
                        <option value="">-- Dùng mã phiếu PXK chung --</option>
                        {recentOrders.map(code => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={() => setManualRows(rs => [...rs, emptyManualRow()])}
              style={{ padding:'0.5rem 1rem', borderRadius:8, border:'1px dashed #0284c7', background:'#f0f9ff', color:'#0284c7', fontWeight:700, cursor:'pointer', marginBottom:10 }}>
              + Thêm dòng
            </button>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:15 }}>
              <button onClick={() => setShowManualExportModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleCalculateManualExport} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:'#0284c7', color:'#fff', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                Đồng ý & Tính toán
              </button>
            </div>
          </div>
        </div>
      )}
```

### 3f. Preview phiếu

- [ ] **Step 8: Header preview — tóm tắt nhiều mã**

Tìm nhánh `mode === 'manual_export'` trong header preview (khoảng dòng 1403-1408):

```jsx
                  ) : mode === 'manual_export' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Mã SP xuất:</strong> {orderItems[0]?.productCode}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên SP xuất:</strong> {orderItems[0]?.productName}</p>
                       <p style={{margin:'3px 0'}}><strong>Mục đích:</strong> {orderItems[0]?.orderCode === 'XDG' ? 'Xuất đóng gói' : `Xuất bổ sung cho phiếu: ${orderItems[0]?.orderCode}`}</p>
                     </>
                  ) : mode === 'disassemble' ? (
```

Thay bằng:

```jsx
                  ) : mode === 'manual_export' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Số mã xuất:</strong> {orderItems.length}</p>
                       <p style={{margin:'3px 0'}}><strong>Tổng SL xuất:</strong> {orderItems.reduce((acc, c) => acc + (Number(c.qty) || 0), 0).toLocaleString('vi-VN')}</p>
                     </>
                  ) : mode === 'disassemble' ? (
```

- [ ] **Step 9: Header preview — bỏ dòng "Số lượng xuất" đơn lẻ**

Tìm (khoảng dòng 1425):

```jsx
                  {mode === 'manual_export' && <p style={{margin:'3px 0'}}><strong>Số lượng xuất:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{orderItems[0]?.qty}</span></p>}
```

Xoá dòng này (tổng SL đã hiển thị ở Step 8).

- [ ] **Step 10: Bảng chi tiết — hiện lý do dưới tên (manual_export)**

Trong bảng chi tiết, cell tên linh kiện có `rowSpan` (khoảng dòng 1473):

```jsx
                                <td rowSpan={rows} style={{padding:'0.4rem',verticalAlign:'top',borderRight:'1px dotted #e2e8f0',minWidth:120}}>{comp.name}</td>
```

Thay bằng (thêm dòng lý do khi manual_export):

```jsx
                                <td rowSpan={rows} style={{padding:'0.4rem',verticalAlign:'top',borderRight:'1px dotted #e2e8f0',minWidth:120}}>
                                  {comp.name}
                                  {mode === 'manual_export' && comp.reason && <div style={{fontSize:'0.65rem',color:'#0284c7',fontWeight:700,marginTop:3}}>Lý do: {comp.reason}{comp.orderRef ? ` → ${comp.orderRef}` : ''}</div>}
                                </td>
```

Cũng cập nhật cell tên ở nhánh "cháy kho hoàn toàn" (khoảng dòng 1458):

```jsx
                          <td style={{padding:'0.4rem',minWidth:120}}>{comp.name}</td>
```

Thay bằng:

```jsx
                          <td style={{padding:'0.4rem',minWidth:120}}>
                            {comp.name}
                            {mode === 'manual_export' && comp.reason && <div style={{fontSize:'0.65rem',color:'#0284c7',fontWeight:700,marginTop:3}}>Lý do: {comp.reason}{comp.orderRef ? ` → ${comp.orderRef}` : ''}</div>}
                          </td>
```

### 3g. Verify + commit

- [ ] **Step 11: Lint**

Run: `npm run lint`
Expected: Không có lỗi mới ở `src/pages/kho/ProductionOrderTab.jsx` (đặc biệt: không còn tham chiếu `manualProduct`, `manualQty`, `manualReason`, `manualOrderRef`).

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: Build thành công, không lỗi biên dịch.

- [ ] **Step 13: Kiểm tra trên preview (thủ công)**

Theo memory `qlsx-preview-verification`: đăng nhập, vào Kho → PSX → "Xuất Kho Thủ Công". Xác nhận:
- Thêm 2 dòng (vd 1 mã lý do "Bán ra", 1 mã lý do "Xuất đóng hàng"), bấm "Đồng ý & Tính toán".
- Preview hiện 2 mã, cột tên có "Lý do: ...", header hiện "Số mã xuất: 2".
- Chọn lý do "Xuất bổ sung" → dòng đó hiện ô chọn Phiếu SX.
- Hoàn tất phiếu → kiểm tra DL xuất: 2 dòng với `type` đúng (XB và XDG).

- [ ] **Step 14: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(kho): xuất kho thủ công nhiều mã + danh sách 27 lý do (type theo dòng)"
```

---

## Self-Review (đã rà)

- **Spec coverage:** UI nhiều dòng (Task 3e), danh sách 27 lý do (Task 1 + 3e), type theo dòng (Task 3c/3d), link Phiếu SX cho XBS (Task 3c/3e), view demand +XDG (Task 2), doanh số giữ nguyên (không đụng `thong_ke_ban_hang`). ✅
- **Placeholder scan:** Không có TBD/TODO; mọi step có code cụ thể. ✅
- **Type consistency:** `manualRows` dùng field `{code,name,qty,reason,orderRef}` xuyên suốt; `allocations`/`orderItems` mang `reason`,`type`,`orderRef`; helper `reasonType`/`reasonNeedsOrderRef` khớp tên giữa Task 1 và Task 3. ✅
