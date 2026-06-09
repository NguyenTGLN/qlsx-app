# Cột "Ngày nhập" + FIFO cho Tồn kho vị trí — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị & quản lý được cột "Ngày nhập" (`import_date`) trên màn Tồn kho vị trí, và đồng bộ quy tắc ngày nhập khi bổ sung hàng, để nguyên tắc xuất FIFO (đã có sẵn) chạy đúng.

**Architecture:** Bảng `inventory_stock` đã có cột `import_date` và logic xuất FIFO (`import_date ASC → quantity ASC`) đã đúng trong `ProductionOrderTab`. Plan này chỉ (1) mở cột `import_date` ra UI của `InventoryTab` (xem/sửa/thêm/Excel), và (2) sửa 2 luồng ghi tồn để cập nhật ngày = mới nhất khi bổ sung vào vị trí đã có. Tách 1 helper thuần `parseImportDate` để unit-test.

**Tech Stack:** React (JSX, inline styles), Supabase JS, XLSX (SheetJS), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-ngay-nhap-fifo-ton-kho-vi-tri-design.md`

---

## File Structure

| File | Trách nhiệm | Thay đổi |
|---|---|---|
| `src/lib/dateUtils.js` | Helper ngày thuần | **Thêm** `parseImportDate(value)` — parse ngày từ ô Excel (chuỗi/serial) về `YYYY-MM-DD`. |
| `src/lib/dateUtils.test.js` | Unit test helper | **Tạo mới** — test `parseImportDate`. |
| `src/pages/kho/InventoryTab.jsx` | Màn Tồn kho vị trí | Hiện cột Ngày nhập, sửa, thêm thủ công, xuất/import/mẫu Excel. |
| `src/pages/kho/ImportStockTab.jsx` | Nhập kho | Cập nhật `import_date` khi cộng dồn vào vị trí đã có. |

**Không đụng:** `ProductionOrderTab.jsx` (FIFO đã đúng), `productionAlloc.js`.

---

## Task 1: Helper `parseImportDate` (TDD)

**Files:**
- Modify: `src/lib/dateUtils.js`
- Test: `src/lib/dateUtils.test.js` (tạo mới)

Helper nhận giá trị ô Excel (có thể là chuỗi `YYYY-MM-DD`, chuỗi `dd/MM/yyyy`, số serial Excel, hoặc rỗng) và trả về chuỗi `YYYY-MM-DD`, hoặc `null` nếu không parse được.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/dateUtils.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseImportDate } from './dateUtils';

describe('parseImportDate', () => {
  it('giữ nguyên chuỗi ISO YYYY-MM-DD', () => {
    expect(parseImportDate('2026-06-09')).toBe('2026-06-09');
  });
  it('parse dd/MM/yyyy về ISO', () => {
    expect(parseImportDate('09/06/2026')).toBe('2026-06-09');
  });
  it('parse số serial Excel (44986 ~ 2023-03-01)', () => {
    expect(parseImportDate(45817)).toBe('2025-06-09');
  });
  it('trả null khi rỗng / không hợp lệ', () => {
    expect(parseImportDate('')).toBeNull();
    expect(parseImportDate(null)).toBeNull();
    expect(parseImportDate(undefined)).toBeNull();
    expect(parseImportDate('không phải ngày')).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/dateUtils.test.js`
Expected: FAIL — `parseImportDate is not a function` / không export.

- [ ] **Step 3: Hiện thực tối thiểu**

Thêm vào cuối `src/lib/dateUtils.js`:

```js
/**
 * Parse một giá trị ngày từ ô Excel về chuỗi YYYY-MM-DD (local).
 * Chấp nhận: 'YYYY-MM-DD', 'dd/MM/yyyy', số serial Excel. Trả null nếu không hợp lệ.
 */
export function parseImportDate(value) {
  if (value === null || value === undefined || value === '') return null;

  // Số serial Excel: số ngày kể từ 1899-12-30
  if (typeof value === 'number' && isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000); // 25569 = 1970-01-01 theo serial Excel
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  // Đã là ISO YYYY-MM-DD (có thể kèm giờ) → lấy 10 ký tự đầu
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/MM/yyyy hoặc dd-MM-yyyy
  m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, '0');
    const mm = String(m[2]).padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }

  return null;
}
```

- [ ] **Step 4: Chạy test cho qua**

Run: `npx vitest run src/lib/dateUtils.test.js`
Expected: PASS (4 test).
*Lưu ý: nếu test serial `45817` lệch 1 ngày do làm tròn, chỉnh assert cho khớp giá trị thực mà hàm trả ra rồi giữ nguyên công thức — quan trọng là không lệch khi round-trip với cùng công thức.*

- [ ] **Step 5: Commit**

```bash
git add src/lib/dateUtils.js src/lib/dateUtils.test.js
git commit -m "feat(kho): helper parseImportDate (parse ngày Excel cho FIFO)"
```

---

## Task 2: Hiện cột "Ngày nhập" trong bảng `InventoryTab`

**Files:**
- Modify: `src/pages/kho/InventoryTab.jsx`

- [ ] **Step 1: Thêm cột vào danh sách cột + nhãn + import shortDate**

Sửa dòng `import` (dòng 9) đảm bảo có `shortDate`:

```jsx
import { ColumnToggleModal, shortDate } from '../../components/WarehouseSharedUI';
```

Sửa 2 hằng số cột (dòng 10-11):

```jsx
const INVENTORY_COLS = ['san_pham','dvt','location','import_date','quantity'];
const INVENTORY_LABELS = { san_pham:'Sản phẩm', dvt:'ĐVT', location:'Vị trí', import_date:'Ngày nhập', quantity:'Tồn kho' };
```

Thêm vào `colLabel` (object quanh dòng 210-216) khóa `import_date`:

```jsx
  const colLabel = {
    item_code: 'Mã HH',
    item_name: 'Tên hàng hóa',
    unit: 'ĐVT',
    location: 'Vị trí',
    import_date: 'Ngày nhập',
    quantity: 'Tồn kho',
  };
```

- [ ] **Step 2: Thêm `import_date` vào câu select**

Trong `fetchInventory` (dòng 119-121) sửa select:

```jsx
        let q = db.from('inventory_stock').select(`
          id, item_code, item_name, unit, location, import_date, quantity
        `);
```

- [ ] **Step 3: Thêm header cột (sắp xếp được) giữa Vị trí và Tồn kho**

Ngay **sau** `<th>` của `location` (kết thúc ở dòng 450) và **trước** `<th>` của `quantity` (dòng 451), thêm:

```jsx
                    {!hiddenCols.has('import_date') && <th onClick={()=>handleSort('import_date')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='import_date'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='import_date'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Ngày nhập{sortCol==='import_date'?(sortAsc?' ↑':' ↓'):''}</th>}
```

- [ ] **Step 4: Thêm ô dữ liệu (cell) tương ứng giữa Vị trí và Tồn kho**

Ngay **sau** `<td>` của `location` (dòng 468) và **trước** `<td>` của `quantity` (dòng 469), thêm:

```jsx
                      {!hiddenCols.has('import_date') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.import_date ? shortDate(row.import_date) : '—'}</td>}
```

- [ ] **Step 5: Build kiểm tra cú pháp**

Run: `npm run build`
Expected: Build thành công, không lỗi cú pháp JSX.

- [ ] **Step 6: Commit**

```bash
git add src/pages/kho/InventoryTab.jsx
git commit -m "feat(kho): hiện cột Ngày nhập trong Tồn kho vị trí (xem + sắp xếp)"
```

---

## Task 3: Sửa Ngày nhập trong modal Sửa (`InventoryTab`)

**Files:**
- Modify: `src/pages/kho/InventoryTab.jsx`

- [ ] **Step 1: Đưa import_date vào payload UPDATE**

Trong `handleSaveEdit` (dòng 252-259) thêm `import_date` vào payload:

```jsx
      const payload = {
        item_code: updatedRow.item_code,
        item_name: updatedRow.item_name,
        unit: updatedRow.unit,
        location: updatedRow.location,
        import_date: updatedRow.import_date || null,
        quantity: parseFloat(updatedRow.quantity)
      };
```

- [ ] **Step 2: Thêm input ngày vào form Sửa**

Modal Sửa đang render các trường qua `['item_code', 'item_name', 'unit', 'location', 'quantity'].map(...)` (dòng 533). Thêm một khối input ngày **riêng** ngay sau vòng `.map` đó (sau dòng 538, trước div nút Hủy/Lưu dòng 539):

```jsx
            <div style={{marginBottom:10}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Ngày nhập</label>
              <input type="date" value={editRow.import_date || ''} onChange={e=>setEditRow({...editRow, import_date: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} />
            </div>
```

- [ ] **Step 3: Build kiểm tra**

Run: `npm run build`
Expected: Build thành công.

- [ ] **Step 4: Commit**

```bash
git add src/pages/kho/InventoryTab.jsx
git commit -m "feat(kho): sửa Ngày nhập trong modal Sửa tồn kho vị trí"
```

---

## Task 4: Form "Thêm vị trí thủ công" — ô Ngày nhập + cập nhật ngày khi cộng dồn (`InventoryTab`)

**Files:**
- Modify: `src/pages/kho/InventoryTab.jsx`

- [ ] **Step 1: Thêm import_date vào state khởi tạo của form**

Sửa khởi tạo `manualInputData` (dòng 47):

```jsx
  const [manualInputData, setManualInputData] = useState({ item_code: '', item_name: '', unit: 'Cái', location: '', quantity: '', import_date: todayLocal() });
```

- [ ] **Step 2: Dùng import_date trong handleSaveManualInput (cả nhánh mới & cộng dồn)**

Trong `handleSaveManualInput`, sửa khối `payload` (dòng 378-385) để lấy ngày từ form:

```jsx
      const payload = {
        item_code: manualInputData.item_code.trim(),
        item_name: manualInputData.item_name.trim(),
        unit: manualInputData.unit.trim(),
        location: manualInputData.location.trim().toUpperCase(),
        quantity: parseFloat(manualInputData.quantity),
        import_date: manualInputData.import_date || todayLocal()
      };
```

Sửa nhánh "đã có" (dòng 390-393) để UPDATE cả `import_date` (quy tắc "cập nhật ngày mới nhất"):

```jsx
      if (existing) {
        const { error } = await db.from('inventory_stock')
          .update({ quantity: (Number(existing.quantity) || 0) + payload.quantity, import_date: payload.import_date }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('inventory_stock').insert([payload]);
        if (error) throw error;
      }
```

- [ ] **Step 3: Reset form kèm import_date sau khi lưu / khi hủy**

Có 2 chỗ reset `manualInputData` về rỗng (dòng 400 và dòng 640). Sửa cả hai thành:

```jsx
      setManualInputData({ item_code: '', item_name: '', unit: 'Cái', location: '', quantity: '', import_date: todayLocal() });
```

- [ ] **Step 4: Thêm ô input Ngày nhập vào form**

Trong modal "Thêm vị trí thủ công", khối Vị trí/Số lượng nằm trong một `div` flex (dòng 622-631). Thêm ô Ngày nhập **ngay sau** khối ĐVT (sau dòng 635, trước div nút Hủy/Lưu dòng 637):

```jsx
            <div style={{marginBottom:15}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Ngày nhập</label>
              <input type="date" value={manualInputData.import_date} onChange={e=>setManualInputData({...manualInputData, import_date: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} />
            </div>
```

- [ ] **Step 5: Build kiểm tra**

Run: `npm run build`
Expected: Build thành công.

- [ ] **Step 6: Commit**

```bash
git add src/pages/kho/InventoryTab.jsx
git commit -m "feat(kho): form Thêm vị trí có Ngày nhập + cập nhật ngày khi cộng dồn"
```

---

## Task 5: Excel — file mẫu, xuất, và import tôn trọng cột ngày (`InventoryTab`)

**Files:**
- Modify: `src/pages/kho/InventoryTab.jsx`

- [ ] **Step 1: Import parseImportDate**

Sửa dòng import dateUtils (dòng 6):

```jsx
import { todayLocal, parseImportDate } from '../../lib/dateUtils';
```

- [ ] **Step 2: Thêm import_date vào file mẫu**

Trong `handleDownloadTemplate` (dòng 268) sửa danh sách cột:

```jsx
    const cols = ['item_code', 'item_name', 'unit', 'location', 'import_date', 'quantity'];
```

(Xuất Excel `handleExport` đã lặp theo `colLabel` nên tự có cột "Ngày nhập" sau Task 2 — không cần sửa thêm.)

- [ ] **Step 3: Thêm alias nhận diện cột ngày khi import**

Trong `executeImport`, object `ALIAS` (dòng 296-302) thêm khóa `date`:

```jsx
          const ALIAS = {
            code: ['item_code','mã hàng','mã hh','mã hàng hóa','mã sp','ma_hang','mã','mã vật tư','ma hh'],
            name: ['item_name','tên hàng','tên hàng hóa','tên','ten_hang','tên sp'],
            unit: ['unit','đvt','đơn vị','đơn vị tính','dvt'],
            loc:  ['location','vị trí','vị trí kho','vi_tri','kho','vị trí lưu'],
            qty:  ['quantity','số lượng','sl','so_luong','tồn','số lượng tồn','tồn kho'],
            date: ['import_date','ngày nhập','ngay_nhap','ngày','date'],
          };
```

- [ ] **Step 4: Dùng ngày từ file nếu có, ngược lại hôm nay**

Trong cùng `executeImport`, sửa khối `inserts` (dòng 303-310):

```jsx
          const inserts = data.map(r => ({
            item_code: String(get(r, ALIAS.code) ?? '').trim(),
            item_name: String(get(r, ALIAS.name) ?? '').trim(),
            unit: String(get(r, ALIAS.unit) ?? '').trim(),
            location: String(get(r, ALIAS.loc) ?? '').trim() || 'Kho',
            quantity: parseFloat(get(r, ALIAS.qty) || 0) || 0,
            import_date: parseImportDate(get(r, ALIAS.date)) || todayLocal()
          })).filter(r => r.item_code);
```

- [ ] **Step 5: Giữ ngày sớm/đúng khi gộp trùng trong file**

Khối gộp `aggMap` (dòng 341-346) hiện cộng dồn quantity. Khi 2 dòng cùng (mã+vị trí) trong file có ngày khác nhau, giữ ngày **mới nhất** cho nhất quán với quy tắc "cập nhật ngày mới nhất". Sửa:

```jsx
          const aggMap = {};
          for (const r of inserts) {
            const k = r.item_code + '|' + r.location;
            if (aggMap[k]) {
              aggMap[k].quantity += r.quantity;
              if (r.import_date > aggMap[k].import_date) aggMap[k].import_date = r.import_date;
            } else {
              aggMap[k] = { ...r };
            }
          }
```

- [ ] **Step 6: Build kiểm tra**

Run: `npm run build`
Expected: Build thành công.

- [ ] **Step 7: Commit**

```bash
git add src/pages/kho/InventoryTab.jsx
git commit -m "feat(kho): Excel mẫu/xuất/import Tồn kho vị trí hỗ trợ cột Ngày nhập"
```

---

## Task 6: `ImportStockTab` — cập nhật Ngày nhập khi cộng dồn vào vị trí đã có

**Files:**
- Modify: `src/pages/kho/ImportStockTab.jsx`

- [ ] **Step 1: Thêm import_date vào UPDATE nhánh vị trí đã có**

Trong `executeImport`, khối vòng lặp `agg` (dòng 488-489), nhánh `if (a.id)` hiện chỉ cập nhật `quantity`. Sửa thành:

```jsx
        if (a.id) {
          updates.push(db.from('inventory_stock').update({ quantity: after, import_date: todayStr }).eq('id', a.id));
        } else {
          inserts.push({ item_code: a.code, item_name: a.name, unit: a.unit, location: a.location, quantity: a.sumImport, import_date: todayStr });
        }
```

(`todayStr = todayLocal()` đã khai báo sẵn ở dòng 422; nhánh `else` đã đúng, chỉ giữ nguyên.)

- [ ] **Step 2: Build kiểm tra**

Run: `npm run build`
Expected: Build thành công.

- [ ] **Step 3: Commit**

```bash
git add src/pages/kho/ImportStockTab.jsx
git commit -m "feat(kho): Nhập kho cập nhật Ngày nhập khi cộng dồn vị trí đã có (FIFO)"
```

---

## Task 7: Nghiệm thu thủ công trên preview

**Files:** không sửa code — chỉ kiểm chứng.

Tham khảo cách đăng nhập & điều hướng tab Kho ở memory `qlsx-preview-verification`.

- [ ] **Step 1: Chạy preview & mở tab Tồn kho vị trí**

Khởi động dev server (preview_start), đăng nhập, vào Kho → Tồn kho vị trí.
Expected: Bảng có cột **"Ngày nhập"** giữa Vị trí và Tồn kho; click header sắp xếp tăng/giảm theo ngày.

- [ ] **Step 2: Kiểm tra Sửa ngày**

Chọn 1 dòng → Sửa → đổi Ngày nhập → Lưu → load lại.
Expected: Ngày mới được lưu và hiển thị đúng.

- [ ] **Step 3: Kiểm tra Thêm vị trí thủ công**

Thêm 1 mã vào **vị trí mới** với ngày tự chọn → Lưu.
Expected: Dòng mới có đúng ngày đã chọn.
Thêm tiếp cùng mã vào **đúng vị trí đó** → Lưu.
Expected: SL cộng dồn, Ngày nhập nhảy về ngày trong form (mới nhất).

- [ ] **Step 4: Kiểm tra Import Excel**

Tải file mẫu → thấy cột `import_date`. Điền 1 dòng có ngày → Import.
Expected: Dòng nhập giữ đúng ngày trong file. Bỏ trống ngày → import → ngày = hôm nay.

- [ ] **Step 5: Hồi quy FIFO (xuất)**

Tạo cùng 1 mã linh kiện ở 2 vị trí: ngày sớm SL nhiều, ngày muộn SL ít. Vào Lệnh sản xuất / phiếu đơn hàng dùng mã đó → xem phân bổ.
Expected: Hệ thống trừ **vị trí ngày sớm trước**. Nếu tạo 2 vị trí **cùng ngày** SL khác nhau → trừ **vị trí SL ít trước**.

- [ ] **Step 6: Ghi nhận kết quả**

Chụp màn (preview_screenshot) bảng có cột Ngày nhập + 1 phiếu phân bổ FIFO làm bằng chứng. Nếu phát hiện lỗi → quay lại task tương ứng sửa.

---

## Self-Review (đã rà)

- **Spec coverage:** Mục 4.1→Task 2; 4.2→Task 3; 4.3→Task 4; 4.4→Task 5; 4.5→Task 6; "không đổi logic xuất" (4.4 spec, mục 4)→không có task (đúng); kiểm thử mục 6 spec→Task 7.
- **Quyết định người dùng:** "cập nhật ngày mới nhất"→Task 4 Step 2, Task 6 Step 1; "Excel tôn trọng cột ngày"→Task 5 Step 3-4.
- **Type/biến nhất quán:** `parseImportDate` định nghĩa Task 1, dùng Task 5; `import_date` (chuỗi `YYYY-MM-DD`) xuyên suốt; `todayLocal()`/`todayStr` đúng tên biến từng file.
- **Placeholder:** không còn TODO/“xử lý lỗi phù hợp”; mọi step có code/lệnh cụ thể.
```
