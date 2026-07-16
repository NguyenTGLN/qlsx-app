# Runbook n8n — Nhắc việc tự động (nhánh "đến hạn" + Job A 8:00)

Áp lên **workflow nhắc việc đang chạy** của bạn (workflow có `Schedule 8h & 17h`, `Webhook tổng hợp`,
`Webhook cập nhật task`, chuỗi HCTI → OA). Chỉ THÊM 1 nhánh mới + thay 1 node IF; 2 nhánh cũ giữ nguyên.

Nhóm Zalo: `deb64378401ba945f00a`. Mention cá nhân: `[@<nhan_vien.id_zalo_oa>]`.

---

## 1. Thêm các node mới
1. Mở workflow trong n8n.
2. Mở file `wf-nhac-viec-them-nodes.json`, **copy toàn bộ nội dung**.
3. Click vào canvas workflow → **Ctrl+V** (Paste). n8n sẽ thêm 8 node:
   `Webhook đến hạn`, `Định tuyến` (Switch), `Lấy nhân viên (đến hạn)`, `Lấy công việc (đến hạn)`,
   `Lấy tiến độ (đến hạn)`, `Tạo thẻ đến hạn` — kèm sẵn dây nối nội bộ giữa 4 node nhánh đến hạn —
   cộng 2 node đính kèm: `Là ảnh đính kèm?` (IF) và `Tải ảnh đính kèm` (HTTP). Xem mục 4b để nối dây 2 node này.

## 2. Thay node IF bằng Switch "Định tuyến"
Node `Định tuyến` (Switch) sẽ THAY node IF cũ `Là cập nhật task?`.

1. **Xoá** node `Là cập nhật task?` (chọn → Delete). Việc này gỡ luôn các dây cũ của nó.
2. Nối lại:
   - `Lấy token OA` → **`Định tuyến`** (kéo từ output của Lấy token OA vào input Định tuyến).
   - `Định tuyến` output **den_han** (output 1) → `Lấy nhân viên (đến hạn)` (đã có sẵn từ paste; nếu mất thì nối lại).
   - `Định tuyến` output **update** (output 2) → `Lấy nhân viên (cập nhật)` (node cũ).
   - `Định tuyến` output **summary** (output 3) → `Lấy nhân viên` (node cũ, nhánh tổng hợp).
3. Nối đuôi nhánh mới: `Tạo thẻ đến hạn` → **`Loop Over Items`** (dùng chung chuỗi gửi ảnh).
4. Nối trigger mới: `Webhook đến hạn` → **`Lấy token OA`** (giống 3 trigger còn lại).

> Nếu UI Switch hiển thị khác file JSON, cấu hình tay theo logic:
> - Rule 1 → điều kiện `{{ $('Webhook đến hạn').isExecuted }}` = true → nhánh **den_han**.
> - Rule 2 → `{{ $('Webhook cập nhật task').isExecuted }}` = true → nhánh **update**.
> - Fallback (extra output, đặt tên **summary**) → nhánh tổng hợp.

## 3. Sửa Code "Tạo nội dung ảnh (tổng hợp + cá nhân)" — rỗng vẫn gửi
Mở node `Tạo nội dung ảnh (tổng hợp + cá nhân)`. Ngay **trước dòng cuối `return out;`**, chèn:
```js
if (out.length === 0) {
  out.push({ json: {
    html: buildTable('CÔNG VIỆC ĐANG THỰC HIỆN', []),
    message_text: `[@${GROUP_ID}] 8:00 — Hôm nay không có việc đang thực hiện.`
  }});
}
```
→ Khi phòng không còn việc nào, 8:00 vẫn gửi 1 ảnh báo "không có việc".

## 4. (Tuỳ chọn) Cho thẻ "đến hạn" giống HỆT thẻ nút Nhắc
Node `Tạo thẻ đến hạn` mặc định dùng mẫu tự chứa (chạy ngay). Nếu muốn giống hệt `Tạo nội dung thẻ chi tiết`:
1. Copy toàn bộ jsCode của `Tạo nội dung thẻ chi tiết` sang `Tạo thẻ đến hạn`.
2. Đổi 3 tham chiếu:
   - `$('Lấy công việc (cập nhật)')` → `$('Lấy công việc (đến hạn)')`
   - `$('Webhook cập nhật task')` → `$('Webhook đến hạn')`
   - `$('Lấy nhân viên (cập nhật)')` → `$('Lấy nhân viên (đến hạn)')`
3. Thay khối tính "Tình trạng" (đang theo NGÀY) bằng theo `moc`:
   ```js
   const moc = String(($('Webhook đến hạn').first().json.body || {}).moc || '');
   let statusHtml, cardClass='card-today', statusIcon=ICONS.alert, statusRowColor='row-status-warning';
   if (moc === '5')      { statusHtml = `<span class="badge badge-danger">${badgeIcon('alert')} 🔥 Còn dưới 5 phút</span>`;  cardClass='card-overdue'; statusRowColor='row-status-danger'; }
   else if (moc === '30'){ statusHtml = `<span class="badge badge-warning">${badgeIcon('clock')} Còn dưới 30 phút</span>`; }
   else                 { statusHtml = `<span class="badge badge-warning">${badgeIcon('clock')} Còn dưới 1 tiếng</span>`; }
   ```

## 4b. Nối 2 node đính kèm (ảnh gửi thật vào nhóm)

> **Lối tắt (2026-07-16):** `wf-bao-cao-cong-viec-gio-vn.json` giờ là bản workflow live
> **đã vá sẵn toàn bộ mục này** (2 node mới + dây nối + code đọc attachments + 📎 trong bảng
> tổng hợp). Mở workflow đang chạy trong n8n → menu ⋮ → **Import from File** → chọn file đó
> → Save. Không phải nối tay gì nữa — phần dưới chỉ để tham khảo khi muốn hiểu/nối tay.

Zalo OA **chỉ có endpoint upload cho ảnh** (`upload/image`), không có cho video. Nên:
ảnh → gửi thật vào nhóm; video/file → chèn link vào nội dung tin nhắn.

Node `Tạo thẻ đến hạn` giờ trả về **nhiều item**: 1 thẻ chính + 1 item cho mỗi ảnh đính kèm
(tối đa 5 — mỗi ảnh là 1 tin nhắn cách nhau 2 giây, 10 ảnh là nhóm nhận 11 tin trong 22 giây).
Item ảnh có trường `direct_url`; thẻ chính thì không.

**Nối dây** (chèn IF vào giữa `Loop Over Items` và `Tạo ảnh HCTI`):

1. **Xoá** dây `Loop Over Items` → `Tạo ảnh HCTI`.
2. `Loop Over Items` → **`Là ảnh đính kèm?`**
3. `Là ảnh đính kèm?` output **true** → `Tải ảnh đính kèm` → **`Upload ảnh lên OA`** (bỏ qua HCTI)
4. `Là ảnh đính kèm?` output **false** → `Tạo ảnh HCTI` (đường cũ giữ nguyên)

Sơ đồ sau khi nối:
```
Loop Over Items → Là ảnh đính kèm? ─true→  Tải ảnh đính kèm ─┐
                                   └false→ Tạo ảnh HCTI → Tải ảnh JPG ─┴→ Upload ảnh lên OA → Gửi ảnh vào nhóm OA → Chờ 2 giây
```

`Gửi ảnh vào nhóm OA` **không phải sửa** — nó đã lấy text từ `$('Loop Over Items').item.json.message_text`,
đúng cho cả hai nhánh.

> **Cảnh báo bảo trì:** khối tính đính kèm trong `Tạo thẻ đến hạn` là **bản copy** của
> `splitZaloAttachments()` / `buildZaloAttachmentText()` trong `src/lib/attachments.js`.
> Node n8n không import được từ repo. **Sửa một bên là phải sửa cả bên kia** — bên repo có test
> (`src/lib/attachments.test.js`) nên test vẫn xanh trong khi tin Zalo đã sai.

Muốn nút "Gửi nhắc việc" thủ công cũng kèm đính kèm thì copy khối `// ===== ĐÍNH KÈM =====`
và phần `return out` sang node `Tạo nội dung thẻ chi tiết`, đổi `$('Lấy công việc (đến hạn)')`
thành `$('Lấy công việc (cập nhật)')`.

## 5. Bỏ 8:00 khỏi lịch n8n (tránh gửi trùng)
Job A trong Supabase sẽ lo 8:00. Mở node `Schedule 8h & 17h` → **xoá dòng `triggerAtHour: 8`**, chỉ giữ `17`.
(Muốn quay lại lịch cũ thì thêm lại 8.)

## 6. Lấy URL webhook đến hạn & test
1. Mở `Webhook đến hạn` → bấm **Listen for test event** → copy URL `.../webhook-test/cong_viec_den_han`.
   Bảo đảm khớp `reminder_config.webhook_den_han` (mặc định đã đặt URL test này).
2. Ở Supabase, tạo việc test & chạy hàm (xem plan Task 4 Step 4). Quan sát n8n nhận event → Switch vào nhánh
   **den_han** → ra ảnh "Còn dưới 1 tiếng". Dọn việc test.
3. Test Job A: `select fn_nhac_viec_dang_thuc_hien();` → nhận bảng tổng hợp; thử cả khi 0 việc.

## 7. Activate & go-live
1. **Activate** workflow (để URL `/webhook/cong_viec_den_han` hoạt động).
2. Đổi config sang prod:
   ```sql
   update reminder_config set value='https://thegioilocnuoc.site/webhook/cong_viec_den_han' where key='webhook_den_han';
   ```
3. Chạy 2 cron (plan Task 7). Xong.
