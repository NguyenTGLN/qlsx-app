# Thiết kế GĐ1: Đồng bộ trạng thái phiếu ghi về Caresoft

- **Ngày:** 2026-06-27
- **Phân hệ:** Bảo hành → tab "Xử Lý Phiếu", modal + n8n outbound
- **Liên quan:** [[qlsx-warranty-processing]]; nối tiếp spec `2026-06-27-cap-nhat-thong-tin-cs-bao-hanh-design.md` (nhánh `bao-hanh-thong-tin-cs`)

## Bối cảnh & vấn đề

Hiện đổi trạng thái phiếu trong app (open→solved) **không về được Caresoft**: outbound v1 cố tình bỏ `status` (mục "ngoài phạm vi"). Đây là GĐ1 của một loạt cải tiến popup; làm riêng để deploy nhanh.

## Mục tiêu

Cho phép chọn trạng thái Caresoft trong popup và đẩy về ticket qua n8n outbound đã có. **Không đổi schema DB** (tái dùng cột `trạng_thái_caresoft_muốn_set` đã tồn tại).

## Phạm vi

CHỈ trạng thái phiếu, đặt từ **popup từng phiếu**. Ngoài phạm vi: nút "Đóng phiếu"/"Mở lại" hàng loạt ở danh sách (vẫn chỉ ghi app); các nhóm trường/ghi chú bước (GĐ2–4).

## Giá trị trạng thái

Dropdown 5 giá trị Caresoft + 1 giá trị rỗng: `(— không đổi —)` · `new` · `open` · `pending` · `solved` · `closed`. Giá trị khớp trực tiếp với Caresoft (không cần map).

## Thay đổi 1 — Modal (`src/pages/warranty/ProcessingModal.jsx`)

- Đổi ô **"Trạng thái Caresoft muốn set"** từ `<input type=text>` → `<select>` với 6 option ở trên. Bind vào `form['trạng_thái_caresoft_muốn_set']` (đã có trong form state). Khóa khi không có quyền `edit`.
- Thêm nút **"Đồng bộ trạng thái"** ngay cạnh dropdown, hiện khi có quyền `io`. Bấm → gọi `handleSync` (luồng lưu + đặt `trạng_thái_đồng_bộ='pending'` sẵn có).
- Trong `buildPayload()`: khi `form['trạng_thái_caresoft_muốn_set']` có giá trị → thêm `'trạng_thái_phiếu_ghi': form['trạng_thái_caresoft_muốn_set']` (cập nhật lạc quan để list/dashboard đổi ngay; đặt SAU nhánh `closingDone` để lựa chọn tường minh thắng). Trống → không đụng.

## Thay đổi 2 — n8n outbound (`docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`)

- Node **"Chuan bi"**: thêm vào object trả về `wantStatus: (r['trạng_thái_caresoft_muốn_set'] || '').trim()`.
- **Cả 2 node PUT ticket** ("co requester" và "khong requester"): body bọc object `ticket` bằng `Object.assign(<ticket cũ>, $('Chuan bi').item.json.wantStatus ? { status: $('Chuan bi').item.json.wantStatus } : {})` → chỉ thêm `status` khi có chọn. Trống → không gửi `status` (không vô tình đổi trạng thái ticket).

## Cần xác minh khi test live

Caresoft GET trả `ticket_status`; PUT **thường** nhận key `status` trong `ticket`. Test 1 phiếu open→solved trên CS:
- Nếu trạng thái ticket đổi đúng → giữ `status`.
- Nếu KHÔNG đổi → sửa key trong 2 node PUT thành `ticket_status` (1 chỗ mỗi node).

## Bất biến / an toàn

- Dropdown rỗng → outbound không gửi `status` (không đè trạng thái CS).
- Vẫn theo van chống loop cũ (chỉ chạy khi `pending`; ACK đặt `đã_đồng_bộ`).
- Cập nhật lạc quan `trạng_thái_phiếu_ghi` chỉ là Phần A mirror; lần inbound kế tiếp Caresoft-thắng sẽ phản ánh giá trị thật (nhất quán sau khi push thành công).

## Kiểm thử

- **Build:** `npx vite build` xanh sau khi đổi select.
- **Thủ công:** mở phiếu open → chọn `solved` ở dropdown → bấm "Đồng bộ trạng thái" → badge "Đang đẩy"; list đổi sang solved ngay (lạc quan). Sau khi n8n chạy: GET ticket CS xác nhận `ticket_status='solved'`, badge "Đã đồng bộ". Chọn `(— không đổi —)` rồi đồng bộ trường khác → ticket status KHÔNG đổi.
