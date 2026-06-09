# Thiết kế: Cột "Ngày nhập" + FIFO cho Tồn kho vị trí

**Ngày:** 2026-06-09
**Phạm vi:** Module Kho — tab "Tồn kho vị trí" (`InventoryTab`), tab "Nhập kho" (`ImportStockTab`).

## 1. Bối cảnh & vấn đề

Người dùng muốn quản lý tồn kho theo nguyên tắc **Nhập trước Xuất trước (FIFO)** khi xuất linh kiện cho phiếu sản xuất và phiếu đơn hàng:

- **Ưu tiên 1 — Ngày nhập:** ngày nhập sớm hơn → xuất trước.
- **Ưu tiên 2 — Số lượng:** cùng ngày nhập → vị trí có số lượng **ít hơn** xuất trước (dồn cho hết vị trí lẻ).

### Hiện trạng (đã kiểm tra code)

Phần lớn hạ tầng đã có sẵn:

- Bảng `inventory_stock` **đã có cột `import_date DATE`** (`sql/setup_kho_schema.sql:39`).
- Ràng buộc UNIQUE `(item_code, location)` — **1 Mã + 1 Vị trí = 1 dòng** (`sql/fix_inventory_stock_unique.sql`).
- **Logic xuất FIFO đã đúng** ở cả 3 nhánh phân bổ trong `ProductionOrderTab.jsx`:
  - Phiếu sản xuất (`L419-424`): `.order('import_date', asc).order('quantity', asc)`.
  - Phiếu đơn hàng / giao hàng PDH (`L603-607`): y hệt, và loại trừ kho dở dang `SX9-*`.
  - Nhánh chọn nhiều mã (`L730-734`): y hệt.

### Khoảng trống thực sự

1. **Màn "Tồn kho vị trí" (`InventoryTab`) đang ẩn hoàn toàn cột `import_date`** — không xem, không sửa, không nhập được.
2. **Quy tắc ngày nhập khi bổ sung hàng chưa nhất quán** với mong muốn của người dùng (xem mục 3).

## 2. Quyết định của người dùng

- **Khi thêm hàng vào một (Mã + Vị trí) đã có tồn vào ngày khác → cập nhật `import_date` = ngày mới nhất (hôm nay).** Hàng vừa bổ sung coi như "mới", xuất sau.
- **Import Excel ở màn Tồn kho vị trí (bản chụp tồn): tôn trọng cột Ngày nhập trong file nếu có; không có thì đặt hôm nay.**

## 3. Tổng hợp các điểm ghi `inventory_stock` & thay đổi cần làm

| Nơi | Hành vi hiện tại | Thay đổi |
|---|---|---|
| `ImportStockTab.executeImport` (`L488-491`) | Vị trí đã có → UPDATE chỉ `quantity`. Vị trí mới → INSERT `import_date = hôm nay`. | Nhánh vị trí đã có: thêm `import_date = hôm nay` vào UPDATE. |
| `InventoryTab.handleSaveManualInput` (`L388-397`) | Vị trí đã có → UPDATE chỉ `quantity`. Vị trí mới → INSERT `import_date = hôm nay`. | Nhánh vị trí đã có: thêm `import_date = hôm nay` vào UPDATE. Form thêm ô Ngày nhập (mặc định hôm nay) cho vị trí mới. |
| `InventoryTab.executeImport` (Excel, `L303-352`) | Luôn `import_date = todayLocal()`, upsert ghi đè. | Đọc cột ngày từ file (alias) → dùng nếu có, ngược lại hôm nay. |
| `ProductionOrderTab` (3 nhánh xuất) | FIFO đúng. | **Không đổi.** |

## 4. Thiết kế chi tiết

### 4.1. Hiển thị cột "Ngày nhập" trong `InventoryTab`

- Thêm `import_date` vào `INVENTORY_COLS`, `INVENTORY_LABELS`, `colLabel` (nhãn: "Ngày nhập").
- `fetchInventory`: thêm `import_date` vào câu `select`.
- Cột mới đặt **giữa Vị trí và Tồn kho**, có thể click header để sắp xếp (`handleSort('import_date')`). Sắp xếp theo chuỗi ISO `YYYY-MM-DD` là đúng thứ tự thời gian.
- Hiển thị định dạng `dd/MM/yyyy` (dùng helper `shortDate` từ `WarehouseSharedUI` nếu phù hợp; nếu null hiển thị "—").
- Thêm vào `ColumnToggleModal` để bật/tắt như các cột khác.

### 4.2. Sửa Ngày nhập trong modal Sửa (`InventoryTab`)

- Modal Sửa thêm trường `import_date` dùng `<input type="date">`.
- `handleSaveEdit`: thêm `import_date: updatedRow.import_date || null` vào payload UPDATE.
- Mục đích: cho phép người dùng chỉnh tay thứ tự FIFO khi cần.

### 4.3. Form "Thêm vị trí thủ công" (`InventoryTab`)

- `manualInputData` thêm khóa `import_date` mặc định `todayLocal()`.
- Thêm ô `<input type="date">` "Ngày nhập" trong form (cạnh Số lượng).
- `handleSaveManualInput`:
  - Vị trí **mới** → INSERT dùng `import_date` từ form.
  - Vị trí **đã có** → UPDATE `quantity` cộng dồn **và** `import_date = giá trị ô Ngày nhập của form` (mặc định hôm nay). Đây là hiện thực của quyết định "cập nhật ngày mới nhất", đồng thời cho người dùng kiểm soát được ngày khi cần.

### 4.4. Xuất / In / File mẫu Excel (`InventoryTab`)

- `colLabel` đã có `import_date` → tự xuất ra cột "Ngày nhập" khi `handleExport`.
- `handleDownloadTemplate`: thêm `import_date` vào danh sách cột mẫu.
- `executeImport` (đọc Excel):
  - Thêm alias nhận diện cột ngày: `ALIAS.date = ['import_date','ngày nhập','ngay_nhap','ngày','date']`.
  - Mỗi dòng: `import_date = parseDate(get(r, ALIAS.date)) || todayLocal()`.
  - `parseDate` chấp nhận: chuỗi `YYYY-MM-DD`, `dd/MM/yyyy`, và số serial Excel (chuyển về `YYYY-MM-DD`). Nếu không parse được → `todayLocal()`.
  - Giữ nguyên upsert `onConflict: 'item_code,location'` (vẫn ghi đè cả dòng, nhưng nay ngày lấy từ file nên đúng ý).
- (Tùy chọn) In phiếu kiểm kê: thêm cột Ngày nhập — **để sau, không bắt buộc cho lần này.**

### 4.5. `ImportStockTab.executeImport`

- Nhánh vị trí đã có (`a.id` tồn tại, `L489`):
  ```js
  updates.push(db.from('inventory_stock')
    .update({ quantity: after, import_date: todayStr })
    .eq('id', a.id));
  ```
- Nhánh vị trí mới: giữ nguyên (đã có `import_date: todayStr`).

## 5. Bất biến cần giữ (invariants)

- **1 Mã + 1 Vị trí = 1 dòng** (UNIQUE) — không tách lô theo ngày trong cùng vị trí.
- Mọi nơi ghi ngày dùng `todayLocal()` (chuỗi `YYYY-MM-DD`, local) — **không** dùng `new Date().toISOString()` (lệch múi giờ).
- Logic xuất FIFO trong `ProductionOrderTab` **không thay đổi**.

## 6. Kiểm thử / Nghiệm thu

1. **Hiển thị:** Mở Tồn kho vị trí → thấy cột "Ngày nhập", sắp xếp tăng/giảm đúng theo ngày.
2. **Sửa:** Sửa một dòng đổi ngày nhập → lưu → load lại thấy ngày mới.
3. **Thêm thủ công vị trí mới:** ngày lưu = ngày trong form.
4. **Thêm thủ công vào vị trí đã có:** SL cộng dồn, ngày nhảy về hôm nay.
5. **Nhập kho (ImportStockTab) vào vị trí đã có:** SL cộng dồn, ngày nhảy về hôm nay.
6. **Import Excel có cột ngày:** ngày trong file được giữ. **Không có cột ngày:** ngày = hôm nay.
7. **Xuất FIFO (hồi quy):** Tạo 2 vị trí cùng mã, ngày khác nhau → xuất phiếu SX/đơn hàng → vị trí ngày sớm bị trừ trước; cùng ngày → vị trí SL ít bị trừ trước. (Đã đúng sẵn, chỉ xác nhận không hồi quy.)

## 7. Ngoài phạm vi (YAGNI)

- Tách lô (lot/batch) thật sự nhiều ngày trong cùng vị trí.
- Cột Ngày nhập trên phiếu in kiểm kê (có thể bổ sung sau).
- Thay đổi logic FIFO trong `ProductionOrderTab` (đã đúng).
