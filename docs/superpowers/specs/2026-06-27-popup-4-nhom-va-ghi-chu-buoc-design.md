# Thiết kế GĐ2+GĐ3: Bố cục popup 4 nhóm (sửa từng ô) + ghi chú từng bước WF

- **Ngày:** 2026-06-27
- **Phân hệ:** Bảo hành → tab "Xử Lý Phiếu" (modal + danh sách + n8n outbound)
- **Liên quan:** [[qlsx-warranty-processing]]; nối tiếp GĐ1 (`2026-06-27-dong-bo-trang-thai-phieu-cs`)
- **Nhánh:** `bao-hanh-thong-tin-cs`

## Bối cảnh & quyết định đã chốt

Người dùng muốn popup hiển thị 4 nhóm thông tin, **bấm vào ô nào thì ô đó mở ra sửa, có nút Lưu + Đồng bộ riêng** (cơ chế "từng ô"). Và các chip bước WF ở danh sách: **bấm chip mở ô nhập ghi chú "đã làm gì", có Lưu + Đồng bộ**, khi đồng bộ thì comment đẩy về CS = nội dung bước đó (thay cho tóm tắt chung).

Quyết định:
- **GĐ4 (4 trường option) tạm CHỈ-ĐỌC** trong nhóm Sản phẩm (Mã SP/Chi tiết lỗi/Linh kiện/Nhóm SP là option trên CS, app chưa đọc được danh sách option → chưa làm dropdown). Hiển thị giá trị nhãn, không sửa/đồng bộ.
- **GĐ3 nhập ghi chú NGAY TẠI CHIP** ở danh sách (đổi hành vi click chip).

## A. Bộ trường & ánh xạ Caresoft

Mở rộng `thông_tin_bổ_sung` (JSONB, **không đổi schema**) thêm 3 khóa text:

| Khóa | Label CS | ID | Nhóm | Prefill (phiếu_gốc_json) |
|---|---|---|---|---|
| `khoảng_cách` | Khoảng cách | 9703 | KTV | (không có trong phiếu → trống) |
| `tình_trạng` | Tình trạng | 9671 | Sản phẩm | `tình_trạng` |
| `ngày_lắp_đặt` | Ngày lắp đặt | 9711 | Sản phẩm | `ngày_lắp_đặt` |

(Giữ 6 khóa cũ: mã_đlđ 9665, tên_đlđ 9849, sđt_đlđ 9829, tên_khách_hàng 9706, số_điện_thoại_khách_hàng 9705, địa_chỉ_nhận_hàng 9694.)

**Chỉ-đọc (không trong thông_tin_bổ_sung):** `mã_sản_phẩm`, `chi_tiết_lỗi`, `linh_kiện`, `nhóm_sản_phẩm` — đọc từ `row` (mirror) để hiển thị.

## B. GĐ2 — Component `EditableField` (sửa từng ô)

Component dùng chung trong modal cho mỗi ô CS-editable:
- **Chế độ xem:** nhãn + giá trị; nếu có quyền `edit` → con trỏ pointer + gợi ý bấm để sửa.
- **Bấm vào → chế độ sửa:** `<input>` (draft = giá trị hiện tại) + nút **Lưu** + **Đồng bộ** + **Hủy**.
- **Lưu:** cập nhật `thông_tin_bổ_sung[key]=draft` rồi gọi `onSave` (lưu DB, giữ cờ đồng bộ) → về chế độ xem.
- **Đồng bộ:** như Lưu nhưng gọi `onSync` (đặt `trạng_thái_đồng_bộ='pending'`).
- **Hủy:** bỏ draft, về chế độ xem.
- Props: `{ label, value, editable, onSave(v), onSync(v) }`. Nếu `editable=false` → chỉ hiển thị giá trị (dùng cho 4 trường option chỉ-đọc).

Hành vi "từng ô" về kỹ thuật: Lưu/Đồng bộ của 1 ô vẫn gọi `onSave/onSync` toàn payload (gồm cả `thông_tin_bổ_sung` mới) — ô trống vẫn bị n8n bỏ qua, nên cảm giác "đẩy ngay ô này".

## C. GĐ2 — Bố cục modal 4 nhóm

Thay khối "Thông tin phiếu" (Phần A) + "Thông tin Caresoft" hiện tại bằng 4 mục:

1. **Thông tin phiếu** (chỉ đọc, như cũ): Phiếu ghi, Mã ĐH, Ngày tạo, TT phiếu (CS), Phân loại. (Giữ khối read-only header sẵn có, bổ sung Mã ĐH.)
2. **Thông tin sản phẩm:** *chỉ-đọc* Mã SP · Chi tiết lỗi · Linh kiện lỗi · Nhóm SP; *sửa được* Ngày lắp đặt · Tình trạng (EditableField).
3. **Thông tin KTV (ĐLĐ):** *sửa được* Mã ĐLĐ · Tên ĐLĐ · SĐT ĐLĐ · Khoảng cách (EditableField).
4. **Thông tin khách hàng:** *sửa được* Tên KH · SĐT KH · Địa chỉ nhận hàng (EditableField).

Các mục xử lý còn lại giữ nguyên: "Xử lý" (người phụ trách, trạng thái xử lý, ngày hẹn, dropdown trạng thái CS của GĐ1), "Các bước xử lý", "Linh kiện thay", "Ghi chú & kết quả". Bỏ các input Phần A cũ (mã_đơn_hàng/mã_sản_phẩm/... ghi vào Part A) — chuyển sang hiển thị theo nhóm như trên (tránh ghi đè Part A "Caresoft thắng").

## D. GĐ2 — n8n outbound

Node "Chuan bi": thêm 3 dòng `add()` (bỏ ô trống) — `add(9703, tt['khoảng_cách'])`, `add(9671, tt['tình_trạng'])`, `add(9711, tt['ngày_lắp_đặt'])`. Không đụng phần contact/status/loop guard.

## E. GĐ3 — Ghi chú từng bước WF tại chip (danh sách)

File: `WarrantyProcessing.jsx` (`StepChips`).
- **Đổi hành vi click chip:** thay vì `window.confirm` tick xong ngay, bấm chip → mở **popover** neo theo chip gồm:
  - Tên bước.
  - `<textarea>` "Đã thực hiện gì..." = `bước['ghi_chú']`.
  - Nút **Đánh dấu xong / Mở lại** (giữ chức năng tick cũ qua `applyStepToggle`, có cảnh báo bước trước chưa xong).
  - Nút **Lưu** (ghi `các_bước` với ghi_chú mới) + **Đồng bộ** (Lưu + đặt comment đồng bộ + `pending`).
- **Đồng bộ bước → comment CS = ghi chú bước:** khi Đồng bộ, app ghi `thông_tin_bổ_sung['ghi_chú_đồng_bộ']` = `[Cập nhật từ Webapp QLSX]\n<tên bước>: <ghi_chú>` rồi đặt `pending`. (Dùng khóa trong JSONB sẵn có → không đổi schema.)
- Popover dùng `position: fixed` neo theo input (tránh bị cắt) — xem [[qlsx-modal-dropdown-clipping]].

## F. GĐ3 — n8n: comment ưu tiên ghi chú bước

Node "Chuan bi": `const stepComment = (tt['ghi_chú_đồng_bộ'] || '').trim();` và `commentBody = stepComment || <tóm tắt chung hiện tại>`. Nếu có ghi chú bước → đẩy nó làm `ticket_comment`; không thì giữ tóm tắt cũ.

## G. Storage & helper

- `getThongTinBoSung` mở rộng `THONG_TIN_BO_SUNG_KEYS` thêm `khoảng_cách`, `tình_trạng`, `ngày_lắp_đặt` (vẫn prefill thông_tin_bổ_sung→phiếu_gốc_json→''). `ghi_chú_đồng_bộ` KHÔNG nằm trong KEYS (không prefill, chỉ ghi khi đồng bộ bước).

## H. Bất biến / an toàn

- Ô trống không vào custom_fields (không đè CS). Van chống loop GĐ trước giữ nguyên.
- Trường option chỉ-đọc: KHÔNG ghi, KHÔNG đẩy (tránh đẩy sai option_id).
- Ghi đè Part A: các nhóm hiển thị field mirror ở chế độ đọc; chỉ field trong `thông_tin_bổ_sung` mới sửa/đẩy → không còn ghi thẳng Part A.

## I. Kiểm thử

- **Unit:** mở rộng test `getThongTinBoSung` cho 3 khóa mới (prefill + fallback).
- **Build:** `npx vite build` xanh.
- **Thủ công:** popup hiện 4 nhóm; bấm 1 ô (vd Tên ĐLĐ) → mở sửa → Lưu giữ giá trị, Đồng bộ đẩy CS. 4 trường option chỉ hiển thị, không bấm sửa được. Bấm chip bước → nhập ghi chú → Đồng bộ → ticket CS nhận comment = ghi chú bước.
