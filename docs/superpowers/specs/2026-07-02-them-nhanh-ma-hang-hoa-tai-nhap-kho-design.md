# Thêm nhanh mã hàng hóa ngay tại màn hình Nhập kho

Ngày: 2026-07-02
Nhánh: feat/ton-hh-chi-tiet-de-xuat (hoặc nhánh mới)

## Bối cảnh & Vấn đề

Khi tạo phiếu **Nhập mua vào**, **Nhập mới**, hoặc **Khác**, người dùng gõ mã/tên
hàng hóa vào ô "Tìm và thêm hàng hóa". Ô này lọc client-side trên `catalog`
(danh mục `inventory_items` nạp sẵn vào bộ nhớ). Nếu mã cần nhập **chưa có** trong
danh mục, dropdown chỉ hiện "Không tìm thấy kết quả" — người dùng buộc phải rời
màn hình nhập, sang tab **Danh mục hàng hóa** thêm mã, rồi quay lại nhập từ đầu.

Mục tiêu: cho phép **thêm mã hàng hóa mới ngay tại màn hình nhập**, dùng đúng form
như tab Danh mục hàng hóa, và **tự động chọn** mã vừa thêm vào khối nhập.

## Phạm vi

- Áp dụng cho 3 loại nhập dùng chung ô tìm hàng hóa: `Nhập mua vào` (`sourceType: 'ncc'`),
  `Nhập mới` và `Khác` (`sourceType: 'none'`) — tất cả render cùng một `AutoSuggest`
  tại [ImportStockTab.jsx:926](../../../src/pages/kho/ImportStockTab.jsx).
- **Ngoài phạm vi**: khối `psx`/`order` (nhập thành phẩm / dư SX / theo đơn) — mã hàng
  đến từ phiếu SX/đơn, không có ô tìm tự do. Khối `ncc` đang khóa theo DLK cũng không
  hiện ô tìm (đã có điều kiện sẵn), nên không đụng tới.

## Quyết định thiết kế (đã chốt với người dùng)

1. **Nút "Thêm mã" chỉ hiện khi KHÔNG tìm thấy kết quả** (không phải lúc nào cũng hiện).
2. **Phân quyền**: nút chỉ hiện cho người có quyền **tạo** ở tab Danh mục hàng hóa
   (`getTabPerm(user, 'kho', 'danh-muc').create`), giống nút "Thêm mã" trong tab đó.

## Kiến trúc

Ba phần, mỗi phần một trách nhiệm rõ ràng:

### 1. Component dùng chung: `AddCatalogItemModal`

Tách form "Thêm mã hàng hóa" (hiện đang inline trong
[CatalogTab.jsx:377-400](../../../src/pages/kho/CatalogTab.jsx)) thành component tái sử dụng.

**File mới**: `src/components/AddCatalogItemModal.jsx`

**Props**:
- `initialCode?: string` — prefill sẵn ô `item_code` (mã người dùng vừa gõ).
- `onSaved: (newItem) => void` — gọi sau khi insert thành công, truyền lại object đã lưu
  (đủ 7 trường: `item_code, item_name, unit, min_stock_days, backup_stock_days, warehouse, lead_time_days`).
- `onClose: () => void` — đóng modal (nút Hủy / lưu xong).

**Nội dung** (bê nguyên hành vi hiện tại, không đổi):
- 7 trường, tất cả bắt buộc (`*`), số cho `min_stock_days/backup_stock_days/lead_time_days`.
- Validate: đủ tất cả trường → chặn nếu thiếu ("Vui lòng nhập đầy đủ tất cả các trường").
- Kiểm tra trùng mã: `select item_code ... eq(code).maybeSingle()` → nếu tồn tại báo
  "Mã HH đã tồn tại" và **không** đóng modal (để người dùng sửa mã).
- Insert vào `inventory_items` với ép kiểu số.
- Thành công → gọi `onSaved(payload)` rồi `onClose()`.
- z-index modal đủ cao để nổi trên modal Nhập kho (dùng `zIndex: 300`; modal nhập
  và các modal catalog hiện dùng ~100).

**Refactor `CatalogTab`**: thay khối modal inline (state `addRow`/`adding`, hàm
`handleSaveAdd`, JSX 377-400) bằng `<AddCatalogItemModal>`. Nút "Thêm mã" chuyển sang
bật cờ hiển thị modal (ví dụ `setShowAdd(true)`), `onSaved` gọi `fetchCatalog()`.
Hành vi tab Danh mục **không đổi** — chỉ dời code ra component chung, tránh trùng lặp
và đảm bảo 2 màn hình dùng đúng một form (đúng yêu cầu người dùng).

> Lưu ý DRY: `colLabel` và `NUM_FIELDS` chuyển vào `AddCatalogItemModal`. `CatalogTab`
> vẫn cần `colLabel` cho bảng/edit/export → export chúng từ component chung (hoặc
> đặt trong một file constants nhỏ và import ở cả hai) để không còn 2 bản định nghĩa.

### 2. `AutoSuggest`: thêm khả năng "thêm mã mới"

File: [ImportStockTab.jsx:19-99](../../../src/pages/kho/ImportStockTab.jsx) (component `AutoSuggest`).

**Prop mới (tùy chọn)**: `onAddNew?: (text: string) => void`.

**Hành vi**: khi `onAddNew` được truyền **và** `results.length === 0` (không tìm thấy),
thay thế/bổ sung dòng "Không tìm thấy kết quả" bằng một dòng bấm được:

```
🔍 Không tìm thấy "<input>".
➕ Thêm mã hàng hóa mới
```

Bấm → gọi `onAddNew(input)` rồi đóng dropdown + clear input (giống `handleSelect`).
Khi `onAddNew` không truyền (mọi chỗ dùng AutoSuggest khác: NccPicker, chọn đơn...)
→ giữ nguyên "Không tìm thấy kết quả" như cũ. Không ảnh hưởng chỗ khác.

### 3. Nối dây trong `ImportStockTab`

**Prop mới cho `ImportStockTab`**: `catalogCreatePerm: boolean` — truyền từ
`KhoHangApp` bằng `getTabPerm(user, 'kho', 'danh-muc').create`.

Tại [KhoHangApp.jsx:880](../../../src/pages/kho/KhoHangApp.jsx):
```jsx
<ImportStockTab ... perms={perms}
  catalogCreatePerm={getTabPerm(user, 'kho', 'danh-muc').create} />
```
(`getTabPerm` và `user` đã có sẵn trong file.)

**State mới**: `const [addItemCtx, setAddItemCtx] = useState(null)` — `{ blockId, code }` hoặc `null`.

**Ô tìm hàng hóa** ([ImportStockTab.jsx:926](../../../src/pages/kho/ImportStockTab.jsx)):
```jsx
<AutoSuggest
  data={catalog}
  placeholder="🔍 Gõ mã hoặc tên hàng hóa cần nhập..."
  onChange={(it)=>handleSelectItem(block.id, it)}
  onAddNew={catalogCreatePerm ? (text)=>setAddItemCtx({ blockId: block.id, code: text }) : undefined}
/>
```
→ Nếu không có quyền tạo, `onAddNew` = `undefined` ⇒ nút không hiện (đúng phân quyền).

**Render modal** (một chỗ, ngoài vòng lặp block):
```jsx
{addItemCtx && (
  <AddCatalogItemModal
    initialCode={addItemCtx.code}
    onClose={()=>setAddItemCtx(null)}
    onSaved={(item)=>{
      setCatalog(prev => [...prev, item]);            // để lần sau tìm thấy
      handleSelectItem(addItemCtx.blockId, item);     // tự chọn vào khối
      setAddItemCtx(null);
    }}
  />
)}
```

`handleSelectItem` đã sẵn sàng: nó nhận object có `item_code/item_name/unit`, truy vấn
`inventory_stock` (mã mới → chưa có tồn → tạo dòng location mặc định "Kho Chính",
`current_qty: 0`, `import_qty: 0`) và thêm vào khối. Không cần sửa `handleSelectItem`.

## Luồng dữ liệu

1. Người dùng gõ mã chưa có → dropdown hiện "Thêm mã hàng hóa mới".
2. Bấm → mở `AddCatalogItemModal` (prefill `item_code`).
3. Điền đủ trường → Lưu → insert `inventory_items` (+ kiểm tra trùng).
4. `onSaved`: đẩy item vào `catalog` (bộ nhớ) → `handleSelectItem` thêm vào khối → đóng modal.
5. Hàng hóa mới xuất hiện ngay trong khối, sẵn sàng điền số lượng nhập.
6. Lưu phiếu như thường (không đổi luồng lưu).

## Xử lý lỗi & biên

- **Trùng mã** khi lưu: `AddCatalogItemModal` báo "Mã HH đã tồn tại", giữ modal mở.
  (Hiếm gặp vì nút chỉ hiện khi tìm không ra, nhưng vẫn chặn ở tầng insert.)
- **Không có quyền tạo danh mục**: nút không hiện; hành vi cũ giữ nguyên
  ("Không tìm thấy kết quả").
- **z-index**: modal thêm mã (300) nổi trên modal nhập kho.
- **Đồng bộ danh mục**: chỉ cập nhật `catalog` trong bộ nhớ của phiên nhập hiện tại;
  không cần reload toàn bộ. Lần mở phiếu sau (`loadData`) sẽ nạp lại từ DB như thường.

## Kiểm thử

- Unit: `AddCatalogItemModal` — validate thiếu trường, trùng mã, insert đúng payload
  (ép kiểu số), gọi `onSaved` với item đã lưu. (Nếu repo có test cho CatalogTab, tái dùng.)
- Thủ công (preview):
  1. Nhập mua vào → gõ mã không tồn tại → thấy nút "Thêm mã hàng hóa mới".
  2. Bấm → form prefill mã → điền → Lưu → mã tự vào khối, điền được SL.
  3. Lặp cho "Nhập mới" và "Khác".
  4. Tài khoản không có quyền tạo Danh mục → không thấy nút.
  5. Tab Danh mục hàng hóa: nút "Thêm mã" vẫn hoạt động như cũ (không hồi quy).

## Ảnh hưởng / Không đụng tới

- Không đổi schema DB.
- Không đổi luồng lưu phiếu nhập, không đổi `handleSelectItem`.
- Refactor `CatalogTab` chỉ dời form ra ngoài — hành vi giữ nguyên.
