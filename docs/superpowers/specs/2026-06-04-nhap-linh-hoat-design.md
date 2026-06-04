# Nhập kho linh hoạt — nhập nhiều nguồn trong một lần

Ngày: 2026-06-04
File ảnh hưởng: `src/pages/kho/ImportStockTab.jsx` (duy nhất)

## Mục tiêu
Cho phép nhập nhiều dữ liệu trong một lần thao tác, tùy theo loại phiếu:
1. **Nhập thành phẩm / Nhập dư sản xuất**: chọn được **nhiều phiếu SX** để nhập cùng lúc.
2. **Nhập hoàn/hủy**: **dán nhiều mã đơn hàng** cách nhau bằng dấu cách.
3. **Nhập mua vào**: bấm **+ Thêm nhà cung cấp** để thêm nhiều khối NCC trong một lần.

## Quyết định đã chốt với người dùng
- **Một phiếu PNK gộp chung** cho tất cả nguồn (1 mã `PNK-...`). Mỗi dòng vẫn ghi đúng nguồn gốc trong `du_lieu_nhap`.
- **Tách dòng theo nguồn**, nhưng **cho phép mã giống nhau nhập về cùng một vị trí** (cộng dồn an toàn ở khâu ghi kho).
- Nút **+** ở Nhập mua vào = thêm **một khối NCC mới** (mỗi khối = 1 NCC + DLK tùy chọn + ô tìm hàng riêng).
- Multi-PSX ở Nhập dư sản xuất = **append** (thêm block, không thay thế block cũ).

## Mô hình dữ liệu: source-block
`itemsToImport` (phẳng) → thay bằng danh sách **block nguồn**:
```
blocks = [
  { sourceType, sourceValue, dlkCode?, items: [ { code, name, unit, maxQty?, returnedQty?, selected?, locations: [...] } ] },
  ...
]
```
- `sourceType`: 'psx' | 'order' | 'ncc' | 'none'
- `sourceValue`: mã PSX / mã đơn hàng / tên NCC (hoặc '' cho Nhập mới/Khác)

## UX theo loại phiếu
- **Nhập thành phẩm / dư sản xuất**: dropdown PSX đổi sang "chọn → thêm". Mỗi lần chọn 1 PSX → thêm 1 block (thành phẩm: tự thêm SP + maxQty; dư SX: fetch linh kiện dư của PSX đó). PSX đã chọn hiển thị dạng chip xóa được. Không cho chọn trùng PSX.
- **Nhập hoàn/hủy**: ô mã đơn nhận chuỗi nhiều mã `DH01 DH02 ...`; bấm tìm → tách theo khoảng trắng, fetch từng mã → mỗi mã 1 block. Mã không có dữ liệu được báo lại, mã còn lại vẫn nạp.
- **Nhập mua vào**: nút **+ Thêm nhà cung cấp** thêm 1 block NCC rỗng; mỗi block có ô NCC, chọn DLK (tùy chọn), ô tìm hàng riêng. Block đầu tiên mặc định có sẵn.
- **Nhập mới / Khác**: 1 block duy nhất, NCC free-text tùy chọn (giữ như cũ).

## Logic lưu (`executeImport`)
- `du_lieu_nhap`: **1 dòng / mỗi line nguồn** → giữ truy vết (`ma_ncc` = sourceValue của block, `dlk_code` = DLK của block).
- `inventory_stock` + `inventory_picking_logs`: **gộp theo (item_code, location)** trên toàn bộ block — cộng dồn số lượng, ra **1** update/insert và **1** picking log mỗi vị trí, với `quantity_before`/`quantity_after` nhất quán. Đây là điểm khắc phục race khi mã giống nhau về cùng vị trí.
- WIP (`SX9-<PSX>`) trừ theo từng line thành phẩm (theo PSX nguồn).

## Kiểm tra (validation)
- maxQty kiểm theo từng line (theo PSX).
- Phải có ít nhất 1 vị trí có SL > 0 (toàn phiếu).
- Cảnh báo thiếu nguồn giữ nguyên cho từng loại.

## Phạm vi không làm
- Không tách thành nhiều PNK.
- Không đổi schema DB.
- Không refactor ngoài file `ImportStockTab.jsx`.
