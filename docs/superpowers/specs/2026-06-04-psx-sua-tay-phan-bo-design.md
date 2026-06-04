# Sửa tay vị trí & SL lấy trong bảng bốc dỡ (popup "Sửa phân bổ")

**Ngày:** 2026-06-04
**File ảnh hưởng:** `src/pages/kho/ProductionOrderTab.jsx`

## 1. Bối cảnh & mục tiêu

Trong phân hệ Kho hàng, tab xuất kho có 4 loại phiếu dùng chung 1 bảng "Danh sách
linh kiện cần lấy" (`allocations`):

- **PSX** — Lệnh Sản Xuất (`mode = 'production'`)
- **PDH** — Nhập Đơn Hàng (`mode = 'delivery'`)
- **PXK** — Xuất Kho Thủ Công (`mode = 'manual_export'`)
- **PPR** — Phân Rã Sản Phẩm (`mode = 'disassemble'`)

App tự phân bổ FIFO ra mỗi linh kiện 1..n dòng `{vị trí, SL lấy, tồn dư}`. Người vận
hành cần **sửa tay** trước khi bấm "LƯU PHIẾU" để khớp thực tế: đổi vị trí, đổi SL lấy,
và **tách 1 mã ra nhiều vị trí**.

Ví dụ: app ra "mã A lấy 10 ở vị trí X" → cần đổi thành "A ở X = 5, A ở Y = 5".

## 2. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Phạm vi áp dụng | Cả 4 loại (PSX/PDH/PXK/PPR) |
| Cách chọn vị trí | Dropdown tồn thật của mã + cho gõ vị trí |
| Tổng SL Lấy vs SL Cần | **Phải bằng đúng** SL Cần, lệch thì chặn lưu |
| Lấy quá tồn tại vị trí | **Chặn**, không cho lưu (vị trí gõ phải có tồn mã đó > 0) |
| Kiểu UI | Nút "Sửa phân bổ" mở popup, mỗi mã 1 popup |

Hệ quả của 2 quy tắc an toàn: vì vị trí gõ vào **bắt buộc đã có tồn thật của mã đó**,
hệ thống **không bao giờ tạo dòng tồn mới / tồn âm**. Ô gõ chỉ là cách nhập nhanh một
vị trí đã tồn tại trong kho (ví dụ ở PDH/PXK, gõ để lấy thêm từ kho `SX9-…` vốn bị
thuật toán auto bỏ qua).

## 3. Nguyên tắc cốt lõi: KHÔNG đổi hàm lưu

Hàm `confirmDeductAndCreateOrder` (dòng ~686–969) duyệt `allocations` **tổng quát** —
chỉ đọc `stock_id`, `before`, `taken`, `remaining`, `location` của mỗi dòng:

- Dòng thường (`stock_id` có): `update({quantity: remaining}).eq('id', stock_id)` — **phép GÁN**.
- Dòng tháo máy (`taken < 0`, `stock_id = null`): nhập ngược vào `SX9-…`.

→ Nếu mỗi dòng sửa tay vẫn giữ đúng 5 trường đó với giá trị hợp lệ, **toàn bộ luồng
lưu / trừ kho / ghi `inventory_picking_logs` / ghi `luu_xuat` chạy y nguyên**. Đây là
ràng buộc thiết kế bất biến: tính năng này CHỈ mutate `allocations` trong bộ nhớ trước
khi lưu, không chạm hàm lưu.

Vì phép trừ kho là GÁN (không phải decrement), `stock_id`/`before`/`remaining` của mỗi
dòng phải khớp **đúng một dòng tồn thật**. Đây là lý do mọi vị trí phải lấy từ
`stockPool` (mục 4), và cấm 2 dòng cùng vị trí trong 1 mã (tránh 2 lần GÁN cùng
`stock_id` → last-write-wins).

## 4. Thay đổi cụ thể

### 4.1 State mới: `stockPool`

`stockPool`: object `{ [item_code]: [{ id, location, quantity }] }` — ảnh chụp tồn kho
của các mã liên quan, **lấy lại từ dữ liệu mỗi hàm tính toán đã query sẵn**:

- `handleCalculate` (production): từ `stockData` (đã query dòng 268–273), trước khi bị
  deep-copy/biến đổi. Lưu bản gốc theo `item_code`.
- `handleCalculateDelivery`: từ `stockData` (dòng 507–512).
- `handleCalculateManualExport`: từ `stockData` (dòng 631–636), key theo `manualProduct`.
- `handleCalculateDisassemble`: từ `disLocations` (đã có), key theo `disProduct`.

Không thêm query mới. `stockPool` được persist vào localStorage cùng `allocations`
(thêm key `prod_stockPool` vào effect dòng 156–171 và khôi phục ở khởi tạo state) để
popup mở lại được sau khi chuyển tab.

Lưu ý quan trọng: `stockPool` giữ tồn **gốc tại thời điểm tính toán** (chưa trừ bản
nháp hiện tại). `before = stockPool[code].find(location).quantity`, `remaining =
before − taken`. Đúng vì mỗi dòng tồn pool được tối đa 1 dòng allocation dùng (đã cấm
trùng vị trí trong 1 mã; các mã khác nhau → `item_code` khác → `stock_id` khác).

### 4.2 Popup `EditAllocationModal`

Mở từ **nút bút chì nhỏ** đặt trong ô "SL Cần" (cột `rowSpan`) của mỗi mã. Nút chỉ hiển
thị khi: `!orderCreated` **và** `comp.requiredQty > 0` **và** nằm trong vùng `no-print`.

Popup nhận `comp` (1 phần tử của `allocations`) + `stockPool[comp.code]`, giữ **bản
nháp** danh sách dòng. Mỗi dòng có:

- **Vị trí**: combobox kiểu `SearchableSelect` liệt kê `stockPool[comp.code]` (các vị
  trí tồn > 0) hiển thị `"<location> (Tồn: n)"`, cho phép gõ. Khi chọn/gõ → resolve
  `stock_id` + `before` từ pool. Không resolve được (vị trí không có trong pool / tồn 0)
  → dòng đỏ, báo lỗi.
- **SL Lấy**: ô số.
- **✕ Xoá dòng** và **+ Thêm vị trí**.

Chân popup: hiển thị **Tổng đã lấy / SL Cần** (đổi màu xanh khi khớp, đỏ khi lệch);
liệt kê lỗi nếu có.

Nút **"Lưu phân bổ"** chỉ bật khi tất cả đúng:
1. Không có 2 dòng trùng `location`.
2. Mỗi dòng: `0 < taken ≤ before` (tồn pool tại vị trí đó).
3. `Σ taken === comp.requiredQty`.

Khi lưu: ghi bản nháp vào `comp.allocations` với mỗi dòng
`{stock_id, location, before, taken, remaining: before − taken}`, đặt `missing = 0`,
`isShortage = false`. Sau đó **tính lại `isShortage` toàn cục** =
`allocations.some(c => c.isShortage)` (cập nhật `setIsShortage`) để nút "LƯU PHIẾU" và
UI cảnh báo thiếu (kể cả luồng xoá đơn thiếu của PDH) nhất quán.

### 4.3 Loại trừ

- **Dòng tháo máy** (BOM `requiredQty < 0`, `stock_id = null`, location `SX9-…`): không
  hiện nút Sửa. Để nguyên.
- **PPR — bảng linh kiện thu hồi** (`generatedComponents`): không đổi (vốn đã sửa được
  `targetLocation`/`exportImmediately`). Nút Sửa của PPR chỉ áp cho dòng sản phẩm chính
  `allocations[0]`.
- Khi `orderCreated = true`: ẩn/khoá toàn bộ nút Sửa (đã lưu, không cho sửa).

## 5. Không đụng tới

- `confirmDeductAndCreateOrder` (lưu/trừ kho/cộng kho/nhập ngược).
- Ghi `inventory_picking_logs` — tách dòng cho ra nhiều log một cách tự nhiên (mong muốn).
- Ghi `luu_xuat`/`so_luong_ban` — gộp theo `Σ taken` mỗi mã nên tổng không đổi.
- Bản in (render từ `allocations`, tự phản ánh; nút Sửa & popup nằm trong `no-print`).
- Persist localStorage (cơ chế hiện có, chỉ thêm `prod_stockPool`).

## 6. Rủi ro & giới hạn

- **Race GÁN-tồn theo snapshot** (tồn tại sẵn, khớp ghi chú tech-debt): phép trừ kho
  GÁN `quantity = remaining` dựa trên tồn chụp lúc tính toán. Nếu người khác sửa kho
  giữa lúc tính và lúc lưu, GÁN có thể ghi đè. Sửa tay nới rộng cửa sổ này một chút.
  **Quyết định: giữ nguyên hành vi cũ** (không re-fetch lúc lưu) để không thay đổi luồng
  cũ; nếu sau muốn chắc hơn sẽ xử lý riêng (chuyển sang decrement/transaction).
- Quyền: việc sửa diễn ra sau khi đã bấm "Tính toán bốc dỡ" — vốn đã yêu cầu
  `perms.edit`. Không thêm quyền mới.

## 7. Tiêu chí chấp nhận

1. PSX: A auto ra "X = 10" → mở popup, tách thành "X = 5" + "Y = 5" (Y có tồn ≥ 5) →
   lưu phân bổ → bảng hiện 2 dòng → "LƯU PHIẾU" → kho tại X giảm 5, tại Y giảm 5; có 2
   dòng `inventory_picking_logs`; `luu_xuat` ghi 1 dòng A `so_luong = 10`.
2. Đặt tổng SL Lấy ≠ SL Cần → nút "Lưu phân bổ" tắt + báo lệch.
3. Đặt SL Lấy 1 dòng > tồn tại vị trí, hoặc gõ vị trí không có tồn mã đó → bị chặn.
4. Đặt 2 dòng cùng vị trí → bị chặn.
5. PDH/PXK: gõ vị trí `SX9-…` (có tồn) → lấy được từ đó.
6. PPR: tách dòng sản phẩm chính ra nhiều vị trí tồn của nó; bảng thu hồi không đổi.
7. Mã có `requiredQty < 0` (tháo máy) không có nút Sửa.
8. Sau khi "LƯU PHIẾU", các nút Sửa biến mất.
9. Bản in không có nút Sửa/popup; hiển thị các dòng đã tách bình thường.
