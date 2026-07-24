# Chuyển SX trước (kê nguyên liệu ra vị trí SX4 khi thiếu hàng) — Design

**Ngày:** 2026-07-24
**File chính:** `src/pages/kho/ProductionOrderTab.jsx`, `src/lib/stagingMove.js` (mới),
`src/lib/productionAlloc.js`, `src/pages/kho/PrintQueueTab.jsx`, `sql/them_phieu_chuyen_sx.sql` (mới)
**Tab:** Kho Hàng → PSX → "Lệnh Sản Xuất" (màn kết quả)

## Bối cảnh

Khi lập phiếu sản xuất mà thiếu nguyên liệu, nút **LƯU PHIẾU** bị khoá (`disabled={isShortage}`)
nên không tạo được lệnh SX — đúng nguyên tắc, vì lệnh SX phải đủ linh kiện.

Nhưng thực tế xưởng vẫn muốn **sản xuất trước một phần** bằng đúng số nguyên liệu đang có.
Nhu cầu: dồn toàn bộ nguyên liệu của phiếu từ các vị trí kho về **một vị trí tập kết duy nhất**
để chuyền lấy dùng, mà **không sinh ra bất kỳ phiếu/lệnh sản xuất nào**.

Hàng không rời kho — chỉ **đổi vị trí**. Vì vậy đây là nghiệp vụ *chuyển vị trí*, không phải
*xuất kho*.

## Quyết định đã chốt

1. **Nút "CHUYỂN SX TRƯỚC"** đặt cạnh nút LƯU PHIẾU ở màn kết quả, chỉ hiện khi
   `mode === 'production' && !orderCreated`. **Không bị khoá khi thiếu hàng** — đó chính là
   tình huống dùng nó.
2. **Số lượng chuyển = đúng số đang hiện trên bảng phân bổ** (`alloc.taken > 0`). Mã đủ hàng
   chuyển đúng phần cần; mã thiếu chuyển hết phần đang có (FIFO đã lấy tối đa tồn). **Không**
   quét thêm tồn dư ngoài phiếu.
3. **Vị trí đích:** `SX4-DD/MM/YYYY` theo **ngày trên phiếu** (`prodDate`, mặc định hôm nay).
   Chuyển nhiều lần trong cùng ngày → cộng dồn vào cùng một vị trí.
4. **Không đụng:** `production_orders`, `production_demand` (DKSX), `luu_xuat`, tồn WIP `SX9-`.
5. **Có chứng từ `PCV-YYYYMMDD-NN`** ghi vào `inventory_picking_logs` → hiện ở Quản lý chứng từ,
   in được, **Hủy Phiếu đảo ngược được** (cần mở rộng RPC `huy_phieu`).
6. **Tồn ở `SX4-*` luôn được ưu tiên lấy trước** trong phân bổ sản xuất về sau. Không áp cho
   xuất đơn hàng.
7. **Sau khi chuyển xong → xoá phiếu nháp, quay về màn chọn loại phiếu** (`handleResetToCards`).
   Ngăn người dùng bấm LƯU PHIẾU tiếp trên bảng phân bổ đã lỗi thời (kho vị trí cũ đã trống).
   Mã `PSX-...` đã sinh bị bỏ; vì chưa ghi `production_orders` nên số thứ tự đó được dùng lại
   cho phiếu SX sau — không thủng dãy số.

## Logic lõi — `src/lib/stagingMove.js` (MỚI, thuần, có test)

### `buildStagingLocation(dateStr)`
`'2026-07-24'` → `'SX4-24/07/2026'`. Đầu vào rỗng/không hợp lệ → ném lỗi (không tạo vị trí `SX4-undefined`).

### `buildStagingMoves(allocations, destLocation)`
Chuyển `allocations` (kết quả FIFO trên màn hình) thành kế hoạch ghi kho thuần dữ liệu:

```js
{
  moves: [{ code, name, unit, total, sources: [{ stock_id, location, before, taken, remaining }] }],
  totalQty,       // tổng SL chuyển
  totalCodes,     // số mã thực sự chuyển
  skippedCodes,   // mã không có gì để chuyển (hết sạch hàng / chỉ có dòng tháo máy /
                  // đã nằm sẵn hết ở vị trí đích)
}
```

Quy tắc lọc từng `alloc`:
- `taken <= 0` → bỏ (dòng "tháo máy" SL âm, `stock_id === null`, vị trí `SX9-`: không phải hàng
  đang có trong kho nên không chuyển được).
- `!alloc.stock_id` → bỏ (không có dòng tồn thật để trừ).
- `alloc.location === destLocation` → bỏ **dòng nguồn đó** nhưng **giữ nguyên trong tồn đích**:
  hàng đã nằm sẵn ở SX4 hôm nay và FIFO lấy trúng nó → trừ rồi cộng lại chính nó là vô nghĩa,
  và nếu xử lý ẩu sẽ ghi đè `quantity` sai. Số này **không** cộng vào `total`.
- Mã có `sources` rỗng sau khi lọc → vào `skippedCodes`, không tạo `move`.

Hàm thuần, không gọi DB → test được đầy đủ các nhánh trên.

## Ghi kho — `handleMoveToStaging()` trong `ProductionOrderTab.jsx`

Chạy tuần tự, có `submittingRef` chặn bấm kép đồng bộ + `claimDocToken` chống trùng ở DB
(giống `confirmDeductAndCreateOrder`):

1. Xác nhận bằng `window.confirm` nêu rõ: số mã, tổng SL, vị trí đích, và **"KHÔNG tạo phiếu
   sản xuất / lệnh SX / không trừ nhu cầu DKSX"**.
2. Sinh mã `PCV-YYYYMMDD-NN` (đếm từ `inventory_picking_logs` với `ilike 'PCV-YYYYMMDD-%'`,
   cùng cách sinh `PNK`/`PXK` ở nhánh phân rã).
3. `claimDocToken(token, { orderCode: pcvCode, kind: 'staging_move' })`. Trùng → dừng, báo
   "đã chuyển rồi".
4. **Trừ nguồn:** mỗi `source` → `update inventory_stock set quantity = source.remaining where id = source.stock_id`.
   (Giữ dòng 0 giống luồng lưu phiếu hiện tại, không xoá — để `huy_phieu` đảo lại đúng dòng.)
5. **Cộng đích:** mỗi `move` → tìm `(item_code = code, location = destLocation)`:
   có → `update quantity = quantity_cũ + total`; chưa có → `insert` dòng mới với
   `import_date = todayLocal()`.
   Bắt buộc làm **sau** bước 4 và tuần tự theo mã, vì `inventory_stock` có ràng buộc DUY NHẤT
   `(item_code, location)` (xem `sql/fix_inventory_stock_unique.sql`).
6. **Ghi log** `inventory_picking_logs`, `product_code = 'CHUYEN_SX'`:
   - mỗi `source`: `location` = vị trí cũ, `quantity_taken = -taken`, `quantity_before = before`,
     `quantity_after = remaining`, `notes = 'Chuyển SX trước → ' + destLocation`,
     `created_at = baseTimeMs`.
   - mỗi `move`: `location = destLocation`, `quantity_taken = +total`,
     `quantity_before` = tồn đích trước, `quantity_after` = sau,
     `notes = 'Nhận hàng chuyển SX trước'`, `created_at = baseTimeMs + 1000`
     (để bản in xếp xuất trước, nhập sau).
7. Lỗi giữa chừng → `releaseDocToken` + báo lỗi (cùng cách xử lý hiện có).
8. Thành công → `alert` mã `PCV-...` + nhắc in ở Quản lý chứng từ → `handleResetToCards()`.

## Ưu tiên lấy SX4 — `src/lib/productionAlloc.js`

`applyPriorityOrder` thêm nhóm ưu tiên **cao nhất** cho `SX4-*`, bật bằng tuỳ chọn mới
`prioritySX4` (mặc định `false`):

- Thứ tự nhóm: `SX4-*` (nếu `prioritySX4`) → `SX11-*` (nếu `priorityVTSX`) → vị trí tự tick →
  phần còn lại. Trong mỗi nhóm giữ nguyên thứ tự FIFO nền.
- Điều kiện thoát sớm hiện tại (`if (!priorityVTSX && priSet.size === 0) return [...]`) phải
  tính thêm `prioritySX4`, nếu không nhóm SX4 sẽ bị bỏ qua khi không bật ưu tiên nào khác.
- `allocateFIFO` (sản xuất) truyền `prioritySX4: true`. `allocateExport` (đơn hàng / xuất bán)
  **không** truyền → hàng đã kê ra chuyền không bị đơn bán hàng lấy trước.

Test bổ sung trong `productionAlloc.test.js`: SX4 lên đầu ở `allocateFIFO`; SX4 **không** được
ưu tiên ở `allocateExport`; SX4 xếp trên SX11 và trên vị trí tự tick.

## SQL — `sql/them_phieu_chuyen_sx.sql` (MỚI, idempotent)

`huy_phieu` hiện chỉ nhận prefix `PXK/PDH/PSX/PPR` (bắt buộc có `luu_xuat.phieu_code`) và `PNK`
(bắt buộc có `du_lieu_nhap.phieu_code`); prefix lạ bị `RAISE EXCEPTION 'Loại phiếu % không hỗ trợ hủy.'`.

Thay đổi duy nhất: thêm nhánh `ELSIF v_prefix = 'PCV' THEN NULL;` — **miễn** kiểm tra bảng phụ,
vì phiếu chuyển vị trí không sinh `luu_xuat`/`du_lieu_nhap` (hàng không rời kho).

Không cần viết thêm logic đảo: vòng lặp sẵn có `stock -= quantity_taken` đã đúng cả hai chiều —
dòng xuất (`taken` âm) cộng trả về vị trí cũ, dòng nhập (`taken` dương) trừ khỏi SX4. Guard
`v_new_qty < 0` tự chặn khi hàng ở SX4 đã bị dùng tiếp, kèm thông báo rõ.

File `CREATE OR REPLACE` lại nguyên hàm (không `ALTER` từng dòng) + khối `DO $$` tự test:
dựng phiếu `PCV-00000000-99` giả (2 dòng xuất/nhập), gọi `huy_phieu`, khẳng định tồn đảo đúng
về vị trí cũ và SX4 về 0, rồi tự dọn — cùng khuôn với `sql/create_huy_phieu.sql`.

## Quản lý chứng từ — `src/pages/kho/PrintQueueTab.jsx`

Thêm nhánh nhãn: `order_code.startsWith('PCV')` → `'CHUYỂN VỊ TRÍ SX'` (hiện đang rơi vào `'KHÁC'`).
Phần in, lọc, chọn, Hủy Phiếu dùng lại nguyên cơ chế hiện có, không sửa.

## Phạm vi KHÔNG làm (YAGNI)

- Không cho sửa tay vị trí đích trên UI — luôn là `SX4-<ngày phiếu>`.
- Không tự tạo lại phiếu SX từ hàng đã kê ở SX4; người dùng lập phiếu SX mới như bình thường,
  hệ thống tự ưu tiên lấy ở SX4.
- Không áp nút này cho `delivery` / `manual_export` / `disassemble`.
- Không đổi cơ chế `SX9-` (WIP) đang có.

## Kiểm thử

**Unit (`vitest`)**
- `src/lib/stagingMove.test.js`: định dạng vị trí; gộp nhiều vị trí nguồn của cùng một mã;
  bỏ `taken <= 0`, bỏ `stock_id` rỗng, bỏ dòng trùng vị trí đích; mã hết sạch vào `skippedCodes`;
  `totalQty`/`totalCodes` đúng.
- `src/lib/productionAlloc.test.js`: các ca ưu tiên SX4 nêu trên.

**Thủ công trên app**
1. Lập phiếu SX thiếu linh kiện → nút LƯU PHIẾU khoá, nút CHUYỂN SX TRƯỚC bấm được.
2. Bấm chuyển → tab Tồn vị trí: hàng đã nằm ở `SX4-24/07/2026`, vị trí cũ về 0.
3. Quản lý chứng từ: có `PCV-...` nhãn "CHUYỂN VỊ TRÍ SX", in ra đủ dòng xuất + dòng nhập.
4. Hủy phiếu `PCV-...` → tồn quay về vị trí cũ, SX4 hết.
5. Lập phiếu SX mới cùng mã → bảng phân bổ lấy ở `SX4-...` trước tiên.
6. Chuyển lần 2 trong cùng ngày → cộng dồn vào đúng vị trí `SX4-24/07/2026`, không tạo dòng trùng.
