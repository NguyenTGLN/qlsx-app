# Nhập Đơn Hàng Tay — nhóm theo đơn hàng (order → nhiều mã SP)

Ngày: 2026-07-09
Phạm vi: `src/pages/kho/ProductionOrderTab.jsx` (modal "Nhập Đơn Hàng Tay"), `src/index.css`.

## Vấn đề

Modal "Nhập Đơn Hàng Tay" hiện dùng danh sách **dòng phẳng**: mỗi dòng là 1 mã sản phẩm và mang theo ô "Mã đơn hàng" riêng. Nút "+ Thêm dòng" tự sao chép mã đơn của dòng trên, nên về mặt dữ liệu vẫn nhập được nhiều mã cho cùng 1 đơn — nhưng UI **không thể hiện điều đó**: mỗi dòng mới lặp lại ô "Mã đơn hàng", trông như một đơn khác, và không có hành động rõ ràng "thêm mã sản phẩm cho đơn này". Trên điện thoại càng khó hiểu.

## Giải pháp: nhóm theo đơn hàng

Tái cấu trúc modal thành các **khối đơn hàng**. Mỗi khối:

- Tiêu đề "Đơn hàng #N" + nút xoá cả khối (chỉ hiện/cho xoá khi có > 1 đơn; đơn cuối cùng không xoá được để luôn còn 1 khối).
- Ô **Mã đơn hàng** — nhập 1 lần cho cả đơn.
- Danh sách **mã sản phẩm** của đơn: mỗi mã 1 ô con gồm Mã SP (`SearchableSelect`) → Tên (tự điền, disabled) → Số lượng + Đơn vị → nút xoá mã (✕, chỉ cho xoá khi đơn còn > 1 mã).
- Nút **"+ Thêm mã sản phẩm"** trong khối → thêm 1 mã trống vào chính đơn này.

Dưới các khối:
- Nút **"+ Thêm đơn hàng"** → thêm 1 khối đơn mới kèm 1 ô sản phẩm trống. Không giới hạn số đơn / số mã.
- Footer giữ nguyên: **Hủy Bỏ** / **Tính toán xuất kho**.

Mặc định khi mở: **1 đơn hàng, 1 ô sản phẩm trống**.

## Mô hình dữ liệu

Thay state phẳng `manualOrderRows: [{ orderCode, code, name, qty, unit }]` bằng nhóm:

```
manualOrders: [
  { id, orderCode, products: [ { id, code, name, qty, unit } ] }
]
```

Helper:
- `emptyManualProduct()` → `{ id: ++seq, code:'', name:'', qty:'', unit:'' }`
- `emptyManualOrder()` → `{ id: ++seq, orderCode:'', products: [emptyManualProduct()] }`

Dùng chung một biến seq tăng dần cho id ổn định (React key), hoặc 2 seq riêng cho đơn và sản phẩm — miễn id không trùng trong cùng danh sách map.

Thao tác state (đều là cập nhật bất biến theo `id`):
- Thêm đơn: `setManualOrders(os => [...os, emptyManualOrder()])`
- Xoá đơn: lọc theo id; nếu chỉ còn 1 đơn thì không xoá.
- Sửa mã đơn: map đơn theo id, set `orderCode`.
- Thêm mã SP vào đơn: map đơn theo id, `products: [...products, emptyManualProduct()]`.
- Xoá mã SP: map đơn theo id, lọc product theo id; nếu đơn chỉ còn 1 mã thì không xoá.
- Sửa mã SP (chọn từ `SearchableSelect`): set `code` + auto `name` từ `stockItems.find(p => p.code === val)?.name`.
- Sửa Số lượng / Đơn vị: set field tương ứng.

## Tính toán (giữ nguyên luồng phía sau)

`handleCalculateManualOrder` trải phẳng nhóm thành đúng mảng item cũ rồi gọi `checkDuplicatesAndCalculate(parsedItems)` — **không đổi gì phía sau**.

```
parsedItems: [{ orderCode, productCode, productName, qty, unit }]
```

Quy tắc build + kiểm tra (báo lỗi bằng `alert`, dừng ngay khi gặp lỗi):
- Duyệt từng đơn (chỉ số hiển thị `oIdx+1`):
  - `orderCode = String(order.orderCode).trim()`.
  - Bỏ qua mã SP trống hoàn toàn (không code và không qty).
  - Nếu đơn có ít nhất 1 mã hợp lệ nhưng `orderCode` rỗng → `alert("Đơn hàng {oIdx+1}: thiếu Mã đơn hàng.")`.
  - Với mỗi mã (chỉ số `pIdx+1`):
    - `code` rỗng → `alert("Đơn hàng {oIdx+1} — Sản phẩm {pIdx+1}: thiếu Mã sản phẩm.")`.
    - `qty` không phải số hoặc ≤ 0 → `alert("Đơn hàng {oIdx+1} — Sản phẩm {pIdx+1}: Số lượng phải lớn hơn 0.")`.
    - Hợp lệ → push `{ orderCode, productCode: code, productName: name, qty: Number(qty), unit: String(unit).trim() }`.
- Nếu `parsedItems.length === 0` → `alert("Vui lòng nhập ít nhất 1 đơn hàng có Mã đơn, Mã sản phẩm và Số lượng hợp lệ!")`.
- Ngược lại: `setShowManualOrderModal(false)` rồi `checkDuplicatesAndCalculate(parsedItems)`.

`handleOpenManualOrder` khởi tạo `setManualOrders([emptyManualOrder()])`.

## Giao diện & responsive

- Khối đơn: viền tím nhạt (`#ddd6fe`), nền `#faf7ff`, bo 12px — phân biệt với ô sản phẩm con (viền `#e2e8f0`, nền trắng).
- Ô sản phẩm con dùng lại grid responsive kiểu `.manual-order-row` (đã có ở bản mobile trước): desktop nhiều cột, ≤640px xếp dọc, Số lượng + Đơn vị chia 2 cột.
- Class CSS trong `src/index.css` (media ≤640px) đổi/áp cho cấu trúc mới: Mã SP + Tên full-width, Số lượng + Đơn vị 2 cột, nút xoá mã về góc phải. Bỏ ô "Mã đơn hàng" khỏi grid sản phẩm (nó nằm ở đầu khối, luôn full-width).
- Nút "+ Thêm mã sản phẩm" (tím, dashed) trong khối; "+ Thêm đơn hàng" (xám, dashed) dưới cùng.

## Không làm (YAGNI)

- Không thêm kéo-thả sắp xếp, không gộp/tách đơn tự động, không sửa luồng tính toán/kiểm trùng/tạo phiếu phía sau.
- Không đụng modal "Xuất Kho Thủ Công" (`.manual-export-row`) — độc lập.
