# Runbook n8n — Nhắc việc tự động (nhánh "đến hạn" + Job A 8:00)

Áp lên **workflow nhắc việc đang chạy** của bạn (workflow có `Schedule 8h & 17h`, `Webhook tổng hợp`,
`Webhook cập nhật task`, chuỗi HCTI → OA). Chỉ THÊM 1 nhánh mới + thay 1 node IF; 2 nhánh cũ giữ nguyên.

Nhóm Zalo: `deb64378401ba945f00a`. Mention cá nhân: `[@<nhan_vien.id_zalo_oa>]`.

---

## 1. Thêm các node mới
1. Mở workflow trong n8n.
2. Mở file `wf-nhac-viec-them-nodes.json`, **copy toàn bộ nội dung**.
3. Click vào canvas workflow → **Ctrl+V** (Paste). n8n sẽ thêm 6 node:
   `Webhook đến hạn`, `Định tuyến` (Switch), `Lấy nhân viên (đến hạn)`, `Lấy công việc (đến hạn)`,
   `Lấy tiến độ (đến hạn)`, `Tạo thẻ đến hạn` — kèm sẵn dây nối nội bộ giữa 4 node nhánh đến hạn.
   (`Tạo thẻ đến hạn` đã hỗ trợ đính kèm theo v2 — xem mục 4b; không cần node phụ nào.)

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

## 4b. Đính kèm — v2 MỘT KHỐI (2026-07-16, thay hẳn bản v1 tách tin nhắn)

**Cách áp:** mở workflow đang chạy → menu ⋮ → **Import from File** → chọn
`wf-bao-cao-cong-viec-gio-vn.json` → Save. Không phải nối dây hay thêm node gì.

**Hoạt động:**
- Thẻ chi tiết đọc `task.attachments` **+ attachments của lần cập nhật tiến độ MỚI NHẤT**
  (gộp, loại trùng theo `path`).
- **Ảnh (tối đa 10): NHÚNG lưới `<img>` ngay trong thẻ** → HCTI render → cả 10 ảnh vẫn chỉ
  là **1 tin nhắn**. Đổi lại: người nhận xem ảnh trong thẻ, không bấm mở full-size từng tấm.
- **Video/file: chèn link** vào `message_text` (Zalo OA không có endpoint upload video).
- `ms_delay` của HCTI tự tăng 1200→3000 khi có ảnh nhúng (chờ tải ảnh từ Storage).
- Bảng tổng hợp 8h/17h: chỉ hiện đếm `📎N` cạnh tên việc (không nhúng ảnh — bảng sẽ dài vô hạn).

**Bản v1 (mỗi ảnh 1 tin nhắn riêng, node IF "Là ảnh đính kèm?" + "Tải ảnh đính kèm") đã bị bỏ.**
Import from File ghi đè toàn bộ canvas nên 2 node đó tự biến mất; chỉ khi bạn từng thêm chúng
bằng tay vào workflow khác thì mới phải xoá tay.

File paste nhánh đến hạn `wf-nhac-viec-them-nodes.json` cũng đã theo v2 — node `Tạo thẻ đến hạn`
tự nhúng ảnh, không sinh item ảnh riêng.

> **Cảnh báo bảo trì:** khối `ĐÍNH KÈM` trong 2 node code là **bản copy** của
> `splitZaloAttachments()` / `buildZaloAttachmentText()` trong `src/lib/attachments.js`.
> Node n8n không import được từ repo. **Sửa một bên là phải sửa cả bên kia** — bên repo có test
> (`src/lib/attachments.test.js`) nên test vẫn xanh trong khi tin Zalo đã sai.

### 4c. Link "xem file" ngắn (2026-07-16)

Link video/file trong tin nhắn giờ đi qua webhook **`https://thegioilocnuoc.site/webhook/f?p=<path>`**
thay vì URL Storage dài 130 ký tự:

- **Ngắn hơn** (~60-90 ký tự; file upload mới dùng mã 10 ký tự nên ngắn nhất).
- **Bấm là xem trực tiếp**: excel/word/powerpoint → mở qua **Office Viewer** (xem ngay trên
  điện thoại, không phải tải về — giới hạn Office Viewer: file ~10MB trở xuống);
  pdf / video / ảnh → mở thẳng, trình duyệt tự render.
- Zalo **không cho gắn chữ lên link** (kiểu "bấm vào đây") trong tin nhắn text — link trần là
  giới hạn của Zalo, không né được.

**Cài (1 lần):** n8n → **Import from File** → `wf-xem-file-dinh-kem.json` (workflow MỚI, 3 node)
→ **Activate**. Không Activate thì mọi link trong tin nhắn chết (trả 404).
Đổi tên miền app thì sửa `FALLBACK` trong node `Chọn đích xem`.

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
