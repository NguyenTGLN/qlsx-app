# Hủy Phiếu — đảo ngược chứng từ kho đã lưu (2026-07-16)

## Bài toán

Khi lưu một phiếu (Nhập PNK / Xuất PXK / Đơn hàng PDH / Sản xuất PSX / Phân rã PPR), hệ thống đã:
- trừ/cộng `inventory_stock` theo từng (mã hàng, vị trí);
- ghi các dòng chứng từ vào `inventory_picking_logs` (gom theo `order_code` = 1 chứng từ chờ in);
- ghi bản ghi phụ: `luu_xuat` (xuất/bán — chạy tiếp vào `thong_ke_ban_hang` qua trigger) và/hoặc `du_lieu_nhap` (nhập);
- riêng PSX: tạo `production_orders` (kể cả lệnh con `PSX-….1/.2`), tạo tồn WIP `SX9-{orderCode}`, trừ nhu cầu DKSX (`production_demand`).

Hiện KHÔNG có cách hủy an toàn: nút "Xóa" ở Lịch sử bốc dỡ chỉ xóa dòng log, KHÔNG đảo tồn kho → dùng để "hủy" sẽ làm sai tồn vĩnh viễn.

## Quyết định đã chốt (với user)

1. **Phạm vi v1: tất cả loại phiếu** (PNK/PXK/PDH/PSX/PPR).
2. **Quy tắc chặn "nới"**: cho hủy miễn là đảo ngược không làm âm kho ở bất kỳ vị trí nào; chỗ nào âm → chặn toàn bộ.
3. **Hủy sạch**: hoàn tồn + XÓA bản ghi `luu_xuat`/`du_lieu_nhap` của phiếu + đảo số liệu thống kê bán hàng.
4. **Chứng từ chuyển trạng thái "Đã hủy"** (không xóa khỏi hệ thống — giữ truy vết, không cho in, không cho hủy lại).
5. **Phân quyền riêng**: cap mới `cancelDoc` trên tab `print_queue`.
6. Phiếu **đã in vẫn được hủy** (kèm cảnh báo thêm khi xác nhận).
7. Phiếu sản xuất **đã có báo cáo sản xuất thì CHẶN** (hàng đã đi tiếp).

## Kiến trúc: RPC Postgres nguyên tử (hướng A đã duyệt)

Toàn bộ nghiệp vụ hủy nằm trong **1 hàm `huy_phieu(p_order_code, p_user, p_reason)`** (PL/pgSQL, SECURITY DEFINER) = 1 transaction: hoặc hủy trọn vẹn, hoặc không thay đổi gì. App chỉ gọi `db.rpc('huy_phieu', …)` và hiển thị kết quả/lỗi.

Lý do chọn: thao tác đụng thẳng tồn kho, tính nguyên tử quan trọng nhất; đảo bằng JS phía client có thể chết giữa chừng gây hủy nửa vời (bị loại); "phiếu đối ứng tự động" không khớp yêu cầu hủy sạch (bị loại).

## Nguyên lý đảo tồn

`inventory_picking_logs` là nguồn sự thật: mỗi dòng có `quantity_taken` mang dấu (+ nhập / − xuất) với bất biến `quantity_after = quantity_before + quantity_taken`.

Đảo = với từng dòng: `stock(item_code, location).quantity -= quantity_taken` (dòng nhập thì trừ lại, dòng xuất thì cộng trả — cùng 1 công thức cho mọi loại phiếu). Nếu dòng tồn không tồn tại, coi tồn hiện tại = 0. Kết quả < 0 ở bất kỳ dòng nào → `RAISE EXCEPTION` (rollback toàn bộ) với thông báo nêu rõ mã hàng + vị trí + số thiếu.

Sau khi đảo, dòng tồn về 0 thì XÓA dòng `inventory_stock` đó (tránh rác dòng 0 — nhất quán hành vi hiện tại của kho).

## Truy vết bản ghi phụ: cột `phieu_code`

Khảo sát cho thấy bản ghi phụ hiện KHÔNG nối được về mã phiếu:
- `luu_xuat.ma_don_hang` với phiếu PDH = mã đơn KHÁCH (DH-001…), không phải mã PDH;
- `du_lieu_nhap.ma_ncc` = tên NCC (ImportStock) hoặc mã PSX (WorkerInput), không phải mã PNK.

Giải pháp: thêm cột `phieu_code TEXT` vào cả `luu_xuat` và `du_lieu_nhap`; mọi luồng tạo phiếu ghi mã chứng từ vào cột này từ nay về sau. RPC xóa bản ghi phụ theo `phieu_code = p_order_code`.

**Hệ quả (giới hạn chấp nhận):** chỉ hủy được phiếu tạo TỪ SAU nâng cấp. Phiếu cũ không có `phieu_code` → RPC từ chối với thông báo "phiếu tạo trước nâng cấp, cần xử lý tay". Cách nhận biết: phiếu có bản ghi phụ kỳ vọng (theo loại) nhưng không tìm thấy dòng `phieu_code` khớp → từ chối; phiếu không có bản ghi phụ (một số PNK tự động?) → vẫn cho hủy phần tồn.
- Ghi chú riêng từng luồng khi tạo mới:
  - PDH/PXK/PSX: mọi dòng `luu_xuat` của phiếu → `phieu_code = orderCode`.
  - PPR (phân rã, 1 thao tác sinh tối đa 3 chứng từ PPR + PNK + PXK): dòng `luu_xuat` xuất SP → `phieu_code = PPR`; dòng xuất đóng gói → `phieu_code = mã PXK`; dòng `du_lieu_nhap` thu hồi → `phieu_code = mã PNK`. Mỗi chứng từ trong cụm hủy ĐỘC LẬP (phép đảo từng cái tự đúng về số học).
  - PNK (ImportStock + WorkerInput): dòng `du_lieu_nhap` → `phieu_code = mã PNK`.

## Thống kê bán hàng tự cân

Chuỗi hiện tại (redesign_sales_thongke.sql): `luu_xuat` --AFTER INSERT (type='XB')--> cộng `thong_ke_ban_hang`. CHƯA có chiều xóa.

Thêm **trigger AFTER DELETE trên `luu_xuat`**: nếu dòng bị xóa có `type='XB'` → trừ đúng số lượng khỏi `thong_ke_ban_hang` (theo month + ma_san_pham), không để âm (floor 0). Nhờ đó RPC chỉ cần DELETE `luu_xuat`, thống kê tự đảo.

## Quy tắc chặn theo loại phiếu (logic trong RPC)

Loại phiếu suy từ prefix `order_code` (PNK/PXK/PDH/PSX/PPR — như PrintQueueTab đang làm).

| Loại | Xử lý thêm ngoài đảo tồn | Chặn khi |
|---|---|---|
| PNK thường | xóa `du_lieu_nhap` theo phieu_code | đảo làm âm kho |
| PNK "Nhập thành phẩm" (nguồn PSX, log notes/nguồn có PSX-) | CỘNG TRẢ lại WIP `SX9-{psx}` số đã trừ khi nhập | thành phẩm đã xuất tiếp (âm kho) |
| PXK / PDH | xóa `luu_xuat` theo phieu_code | dòng "tháo máy nhập ngược" đảo làm âm |
| PSX | xóa `production_orders` (order_code = X hoặc LIKE X.%) + xóa WIP `SX9-…` + CỘNG TRẢ `production_demand.qty_demand` (+= target, tính lại trạng thái) + xóa `luu_xuat` | đã có `production_logs` cho bất kỳ lệnh (con) nào; WIP không còn nguyên số lượng target; đảo linh kiện làm âm |
| PPR | như PXK (dòng xuất SP) | đảo làm âm |

Nhận diện "PNK Nhập thành phẩm cần trả WIP": khi tạo phiếu, app ghi thêm mã PSX nguồn vào cột mới `wip_source` trên dòng picking log (đơn giản, không đoán từ notes). RPC đọc cột này để cộng trả WIP theo đúng `SX9-{wip_source}` với số lượng của dòng.

Lưu ý bắt buộc kèm theo: hiện ImportStockTab GỘP dòng log theo (mã hàng, vị trí) qua nhiều khối nguồn — nếu 2 phiếu PSX cùng đổ 1 mã về 1 vị trí thì 1 dòng log không tách được số trả về WIP nào. Sửa: riêng lý do "Nhập thành phẩm", KHÔNG gộp giữa các khối nguồn khác nhau; mỗi dòng log mang `wip_source` + số lượng của riêng nguồn đó (các lý do khác giữ nguyên cách gộp).

## Thay đổi schema (1 file `sql/create_huy_phieu.sql`)

1. `inventory_picking_logs`: + `is_cancelled BOOLEAN DEFAULT FALSE`, `cancelled_at TIMESTAMPTZ`, `cancelled_by TEXT`, `cancel_reason TEXT`, `wip_source TEXT`.
2. `luu_xuat`: + `phieu_code TEXT` (+ index).
3. `du_lieu_nhap`: + `phieu_code TEXT` (+ index).
4. Trigger AFTER DELETE `luu_xuat` → trừ `thong_ke_ban_hang`.
5. Hàm `huy_phieu(p_order_code TEXT, p_user TEXT, p_reason TEXT) RETURNS jsonb` — trả `{ok, message, reversed_lines, …}`; mọi lỗi chặn = EXCEPTION với message tiếng Việt rõ ràng.
6. GRANT EXECUTE cho anon + authenticated (hiện trạng app dùng anon — theo rollback bảo mật hiện tại).
7. Khối test tự chạy trong file (tạo dữ liệu giả → hủy → assert tồn nguyên trạng → dọn), kèm hướng dẫn chạy.

## Thay đổi app

1. **permRegistry.js**: tab `print_queue` caps → `['view', 'cancelDoc']`; thêm `cancelDoc: 'Hủy Phiếu'` vào `CAP_LABEL` + `ALL_CAPS`. (Ma trận phân quyền tự nhận.)
2. **PrintQueueTab.jsx**:
   - `loadData` đọc thêm `is_cancelled` (phiếu có ≥1 dòng is_cancelled → trạng thái "Đã hủy").
   - Badge "Đã hủy" (xám) + filter thêm lựa chọn "Đã hủy"; phiếu hủy không in / không chọn in / không hủy lại.
   - Nút "Hủy Phiếu" mỗi dòng (chỉ hiện khi có quyền `cancelDoc`): mở modal xác nhận — tóm tắt phiếu, ô lý do BẮT BUỘC, cảnh báo đỏ thêm nếu phiếu đã in → gọi `db.rpc('huy_phieu', {p_order_code, p_user, p_reason})` → thành công: reload + toast; thất bại: alert message chặn từ DB.
3. **Ghi `phieu_code` khi tạo phiếu** (3 file):
   - ImportStockTab: `du_lieu_nhap.phieu_code` = mã PNK; khi lý do "Nhập thành phẩm" ghi thêm `wip_source` = mã PSX nguồn trên từng dòng picking log và KHÔNG gộp dòng log giữa các khối nguồn khác nhau (xem mục Truy vết).
   - ProductionOrderTab: `luu_xuat.phieu_code` theo từng mode (production/delivery/manual_export → orderCode; disassemble → dòng xuất SP = mã PPR, dòng xuất đóng gói = mã PXK) + `du_lieu_nhap.phieu_code` = mã PNK (nhánh phân rã).
   - WorkerInput: `du_lieu_nhap.phieu_code` = mã PNK tự động.
4. **KhoHangApp.jsx**: truyền perm `cancelDoc` xuống PrintQueueTab.

## Ngoài phạm vi (nói rõ)

- Hủy phiếu tạo TRƯỚC nâng cấp (không có phieu_code) — xử lý tay.
- Hủy một PHẦN phiếu (chỉ vài dòng) — chỉ hủy cả phiếu.
- "Un-cancel" (khôi phục phiếu đã hủy) — không có; nếu lỡ hủy nhầm thì tạo phiếu mới.
- Race sinh mã order_code giữa 2 người lưu cùng lúc — vấn đề riêng, không thuộc tính năng này.

## Ghi chú sau code review (đã cân nhắc, chấp nhận)

- **DKSX trả dư khi lệnh > nhu cầu:** khi tạo lệnh app clamp `remain = max(0, demand − qty)` nhưng khi hủy cộng trả nguyên `target_quantity` → demand có thể lớn hơn ban đầu (vd demand 5, lệnh 10, hủy → demand 10). Không lưu được số đã trừ thực nên chấp nhận; DKSX là số kế hoạch, user chỉnh lại khi nạp kỳ mới.
- **PSX check bản ghi phụ qua luu_xuat:** PSX mới mà insert luu_xuat lỗi (console.warn) sẽ bị từ chối hủy với thông báo "phiếu tạo trước nâng cấp" (sai lý do nhưng an toàn — không hỏng dữ liệu). Hiếm; xử lý tay khi gặp.
- **GRANT anon cho huy_phieu:** nhất quán hiện trạng bảo mật đã rollback (xem memory qlsx-bao-mat-rls); phải nằm trong danh sách rào khi khóa lại bảo mật.
- **2 lỗi CRITICAL đã sửa trước khi giao:** (1) khối test SQL vi phạm FK inventory_items → script fail toàn bộ; (2) PNK tự động từ WorkerInput thiếu wip_source → hủy làm mất tồn WIP. Kèm fix I2: chỉ gắn wip_source khi WIP thực sự bị trừ lúc nhập (Set wipDeducted), tránh cộng trả WIP "ma".

## Kiểm thử

- SQL: khối test trong file cho từng loại phiếu (PNK đủ hàng → OK & tồn nguyên trạng; PNK đã dùng bớt → EXCEPTION & không đổi gì; PXK; PSX chưa/đã có production_logs; PNK thành phẩm trả WIP; hủy lại lần 2 → chặn).
- JS (vitest): PrintQueueTab logic trạng thái hủy (thuần túy có thể tách helper), permRegistry cap mới.
- Thủ công sau deploy: tạo phiếu thật mỗi loại → hủy → so tồn trước/sau.
