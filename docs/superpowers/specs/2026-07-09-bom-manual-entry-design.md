# Thêm BOM thủ công (tab BOM)

- **Ngày:** 2026-07-09
- **File chính:** `src/pages/kho/BomTab.jsx`
- **Trạng thái:** Đã duyệt thiết kế, chờ viết plan

## 1. Mục tiêu

Cho phép người dùng nhập một BOM (định mức nguyên vật liệu) **bằng tay** ngay trong tab BOM,
không cần chuẩn bị file Excel. Mã thành phẩm và mã linh kiện được **chọn từ Danh mục hàng hóa**
qua ô gõ-tìm gợi ý, nên luôn hợp lệ (thỏa ràng buộc khóa ngoại).

Hình thức: **1 thành phẩm (header) + nhiều linh kiện (dòng)**, lưu tất cả cùng lúc.

## 2. Bối cảnh dữ liệu

- Bảng `bom_items`: `id, product_code, component_code, unit, quantity, product_name`.
- Ràng buộc khóa ngoại: cả `product_code` và `component_code` phải tồn tại trong
  `inventory_items` (Danh mục hàng hóa: `item_code, item_name, unit`).
- Danh mục lấy qua `getCatalogItems()` trong `src/lib/catalogCache.js` — trả
  `[{item_code, item_name, unit}]`, cache 10 phút, gộp gọi song song.
- Sau khi thay đổi BOM phải gọi `invalidateBomProducts()` để picker thành phẩm ở
  Phiếu Sản Xuất thấy thay đổi ngay.

## 3. Điểm vào (UI)

- Thêm nút **"Thêm BOM"** (icon `Plus`) vào thanh hành động dưới cùng của `BomTab`,
  ở nhánh khi **chưa chọn dòng nào** (`selectedKeys.size === 0`), đặt cạnh nút
  *Nhập Excel* / *In BOM*.
- Chỉ hiển thị khi `perms.create === true`.

## 4. Modal "Thêm BOM thủ công"

### 4.1 State (trong BomTab)

- `showAddBom` (bool) — mở/đóng modal.
- `catalogItems` (array) — `[{item_code, item_name, unit}]`, nạp từ `getCatalogItems()` khi mở modal.
- `addProduct` (`{code, name}` | null) — thành phẩm đã chọn.
- `existingComps` (Set<string>) — các `component_code` đã có sẵn trong DB cho `addProduct.code`.
- `addLines` (array) — mỗi phần tử: `{ key, component_code, component_name, unit, quantity }`.
- `addSaving` (bool).

### 4.2 Luồng thao tác

1. Bấm "Thêm BOM" → mở modal, nạp `catalogItems` (từ cache, gần như tức thì), khởi tạo
   `addLines` với 1 dòng rỗng.
2. **Chọn Mã thành phẩm** (ô gõ-tìm gợi ý trên danh mục):
   - Chọn xong → `addProduct = { code: item_code, name: item_name }`, hiện dạng chip
     `mã — tên` kèm nút đổi.
   - Truy vấn `db.from('bom_items').select('component_code').eq('product_code', code)`
     → nạp `existingComps`. Nếu `size > 0` → hiện **banner cảnh báo**:
     "Sản phẩm này đã có BOM với N linh kiện — các mã trùng sẽ được bỏ qua khi lưu."
   - Đổi thành phẩm → nạp lại `existingComps`; giữ nguyên `addLines`.
3. **Dòng linh kiện** (thêm/bớt được), mỗi dòng:
   - Ô chọn **Mã linh kiện** (gõ-tìm gợi ý trên danh mục). Chọn xong:
     - Gán `component_code`, `component_name` (= item_name).
     - Tự điền `unit` = `unit` của mã đó trong danh mục (**sửa được**).
   - Ô **ĐVT** (text, sửa được).
   - Ô **Số lượng** (số).
   - Nút xóa dòng.
   - **Chặn trùng trong form:** không cho chọn một `component_code` đã xuất hiện ở dòng khác
     (báo và không nhận lựa chọn).
   - **Đánh dấu trùng DB:** nếu `component_code` nằm trong `existingComps` → gắn nhãn
     "đã có — sẽ bỏ qua".
   - Nút **"+ Thêm linh kiện"** thêm một dòng rỗng.
4. **Lưu:**
   - Validate: đã chọn thành phẩm; có ít nhất 1 dòng đã chọn linh kiện; mọi dòng đã chọn
     linh kiện đều có **Số lượng > 0** (là số hợp lệ). Nếu sai → `alert` nêu rõ dòng lỗi,
     không lưu.
   - Xây danh sách insert: với mỗi dòng có `component_code` **không** thuộc `existingComps`:
     `{ product_code: addProduct.code, product_name: addProduct.name, component_code, unit,
        quantity: parseFloat(quantity) }`.
   - Bỏ qua các dòng có `component_code` đã thuộc `existingComps` (đếm số bỏ qua để báo).
   - Nếu sau khi lọc không còn dòng nào để thêm → `alert` "Tất cả linh kiện đã có sẵn",
     không insert.
   - `db.from('bom_items').insert(inserts)` (1 lần, mảng).
   - Thành công → `invalidateBomProducts()`, đóng + reset modal, `fetchBom()`,
     `alert` tóm tắt: "Đã thêm X linh kiện" (+ ", bỏ qua Y trùng" nếu Y > 0).
   - Lỗi → `alert('Lỗi thêm BOM: ' + e.message)`.

## 5. Component picker

- Dựng một **catalog item picker cục bộ trong `BomTab.jsx`**, mô phỏng `AutoSuggest` đã chạy
  ổn định trong `ImportStockTab.jsx`:
  - Gõ để lọc theo `item_code` + `item_name`, hiện tối đa ~50 gợi ý.
  - Dropdown dùng **`position: fixed`** neo theo ô input để **không bị vùng cuộn của modal
    cắt cụt** (theo lưu ý modal-dropdown-clipping).
  - `onSelect(item)` trả về nguyên object `{item_code, item_name, unit}`.
- Giữ picker **cục bộ** trong BomTab để không sửa `ImportStockTab` đang chạy tốt. Chấp nhận
  trùng nhẹ một component nhỏ; có thể gộp thành component dùng chung ở lần dọn dẹp sau.

## 6. Ràng buộc & lý do

- Cả thành phẩm lẫn linh kiện đều **chọn từ danh mục** ⇒ luôn thỏa khóa ngoại
  `bom_items → inventory_items`; **không** cần bước đối chiếu mã như luồng Nhập Excel.
- Ghi `product_name` = `item_name` của thành phẩm trong danh mục (theo quy ước tên chuẩn).
- **Số lượng phải > 0**: BOM là định mức tiêu hao, số lượng âm/0 vô nghĩa (chặt hơn luồng
  Nhập Excel vốn chỉ chặn = 0).

## 7. Ngoài phạm vi (YAGNI)

- Không sửa/xóa BOM trong modal này — đã có nút *Sửa*/*Xóa* sẵn trên bảng.
- Không import file trong modal này.
- Không tạo mã hàng mới — mã chưa có phải thêm ở tab *Danh mục hàng hóa* trước.
- Không tách/gộp component picker dùng chung với ImportStockTab ở lần này.
