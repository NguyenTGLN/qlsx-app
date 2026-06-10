# Nhập đơn hàng tay (Xuất kho đơn hàng không cần Excel)

**Ngày:** 2026-06-10 · **Phạm vi:** `src/pages/kho/ProductionOrderTab.jsx` (tab Bốc dỡ & Xuất kho — PSX)

## Vấn đề

Luồng "Nhập Đơn Hàng" (mode `delivery`) hiện chỉ nhận file Excel. Người dùng muốn nhập đơn hàng bằng tay rồi bấm nút để tạo phiếu xuất đúng như luồng Excel.

## Thiết kế

### Luồng UI

1. Bấm card **"Nhập Đơn Hàng"** → mở modal chọn 2 cách (thay vì mở file picker ngay):
   - **Tải file Excel** → đóng modal, mở file picker (luồng cũ giữ nguyên).
   - **Nhập tay** → mở modal nhập liệu.
2. Modal nhập tay (pattern giống modal Xuất Kho Thủ Công):
   - Mỗi dòng: **Mã đơn hàng** (text) · **Mã sản phẩm** (`SearchableSelect` autosuggest từ hàng tồn > 0, tự điền tên) · **Tên SP** (tự điền, disabled) · **Số lượng** (number) · **Đơn vị** (text, tùy chọn) · nút xóa dòng.
   - Hỗ trợ **nhiều đơn hàng / lần nhập**, mỗi đơn nhiều mã SP. Mã đơn hàng fill-down: dòng mới mặc định lấy mã ĐH dòng trên; để trống cũng hiểu là đơn của dòng trên (như Excel).
   - Nút **+ Thêm dòng**.
3. Bấm **"Tính toán xuất kho"** → build `parsedItems` `{orderCode, productCode, productName, qty, unit}` → đi đúng luồng Excel:
   - Kiểm tra trùng `ma_don_hang` trong `luu_xuat` (modal trùng lặp như cũ).
   - `handleCalculateDelivery`: sinh mã `PDH-YYYYMMDD-NN`, gom nhu cầu, phân bổ FIFO theo vị trí (bỏ `SX9-*`).
   - Màn phiếu như bình thường: xem vị trí, **Sửa phân bổ vị trí** từng dòng (popup có sẵn — `stockPool` được nạp trong `handleCalculateDelivery`), in, tạo phiếu trừ kho, ghi `luu_xuat` type `XB`.

### Thay đổi code

- Tách hàm `checkDuplicatesAndCalculate(parsedItems)` từ closure trong `handleImportExcel` — dùng chung cho Excel + nhập tay.
- Tách `loadStockItems()` từ `handleOpenManualExport` — dùng chung cho 2 modal autosuggest.
- State mới: `showDeliveryChoiceModal`, `showManualOrderModal`, `manualOrderRows` (+ `emptyManualOrderRow()` với id ổn định).
- Handlers mới: `handleOpenManualOrder`, `handleCalculateManualOrder` (validate từng dòng: thiếu mã ĐH / mã SP / SL ≤ 0 → alert kèm số dòng; dòng trống bỏ qua).
- Không thay đổi: tính toán FIFO, kiểm tra trùng, tạo phiếu, trừ kho, in.

### Validate

- Bỏ qua dòng trống hoàn toàn; báo lỗi rõ dòng nào thiếu Mã ĐH/Mã SP/SL.
- Không có dòng hợp lệ nào → alert, không đóng modal.
