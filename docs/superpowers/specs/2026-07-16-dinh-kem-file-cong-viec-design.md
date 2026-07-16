# Đính kèm hình ảnh / video / file cho phân hệ Công việc

**Ngày:** 2026-07-16
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan

## 1. Mục tiêu

Cho phép đính kèm hình ảnh, video và file vào công việc, hiển thị chúng ở mọi nơi công việc
xuất hiện, và gửi kèm khi nhắc việc qua Zalo.

Bốn phần:

1. **Tạo/sửa công việc** — đính kèm được ảnh, video, file.
2. **Cập nhật tiến độ** — nhân viên đính kèm được ảnh/video chứng minh kết quả.
3. **Hiển thị** — panel chi tiết xem đầy đủ; danh sách / Tổng quan / Báo cáo chỉ hiện badge 📎 + số lượng.
4. **Nhắc việc Zalo** — ảnh gửi thật vào nhóm; video và file gửi dạng link trong nội dung tin nhắn.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Mô hình dữ liệu | Cột JSONB `attachments` trên `cong_viec_duoc_giao` và `tien_do` | `WorkReport.jsx:95` và node n8n "Lấy công việc" đều dùng `select('*')` → dữ liệu tự chảy qua, **n8n không cần thêm node truy vấn**. Codebase đã có tiền lệ (Quality lưu mảng URL dạng JSON). Tối đa 10 file/việc nên không cần chuẩn hoá. |
| Bảng riêng `cong_viec_dinh_kem` | Loại | Phải thêm query + join ở 4 nơi trong app **và** thêm node query trong mỗi nhánh n8n — rủi ro rơi đúng vào workflow sửa tay. |
| Bucket | `task-attachments`, **public read** | Link video/file gửi vào Zalo phải mở được trên điện thoại mà không cần đăng nhập; n8n phải tải ảnh về để upload lên OA. Đồng nhất với `qc_images`, `zalo-reports`. |
| Video lên Zalo | Gửi link, không gửi thật | Zalo OA **không có endpoint upload video**. Chỉ có `upload/image` và `upload/file`. |
| File lên Zalo | Gửi link, không gửi thật | `v3.0/oa/group/message` có hỗ trợ attachment kiểu `file` hay không thì chưa kiểm chứng được (tài liệu Zalo là trang JS, không đọc được bằng công cụ). Chọn đường chắc chắn chạy. |
| Thời điểm upload | Ngay khi chọn file | Thấy thumbnail + progress ngay, bấm Lưu là xong tức thì. Đánh đổi: file mồ côi nếu bỏ dở. |
| Giới hạn | 25MB/file, 10 file/việc | Đủ cho ảnh điện thoại và video 30–60 giây. |
| Gói Supabase | Pro $25 (100GB storage) | Dung lượng không phải ràng buộc; cảnh báo nhắm vào trải nghiệm upload trên 4G. |

## 3. Mô hình dữ liệu

```sql
alter table cong_viec_duoc_giao add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table tien_do            add column if not exists attachments jsonb not null default '[]'::jsonb;
```

Mỗi phần tử của mảng:

```json
{
  "url": "https://ngwkzicrnspeggunsblr.supabase.co/storage/v1/object/public/task-attachments/tasks/2026-07/9f3a1b.webp",
  "path": "tasks/2026-07/9f3a1b.webp",
  "name": "ban-ve-lap-dat.pdf",
  "mime": "application/pdf",
  "kind": "image",
  "size": 128374,
  "uploaded_by": "NV001",
  "uploaded_at": "2026-07-16T09:12:00.000Z"
}
```

`kind` nhận đúng 3 giá trị `image` | `video` | `file`, tính **một lần lúc upload** và lưu cứng.
Cả app lẫn n8n đều rẽ nhánh theo trường này; không nơi nào được suy lại từ `mime`.

`path` dùng để xoá file trong Storage. `url` dùng để hiển thị và gửi Zalo.

### Bucket

- Tên: `task-attachments`
- Public read
- File size limit 25MB (đặt ở **cả** bucket lẫn client)
- Đường dẫn: `tasks/<YYYY-MM>/<uuid>.<ext>` cho việc, `progress/<YYYY-MM>/<uuid>.<ext>` cho tiến độ

Path cố ý **không** chứa task_id: lúc form tạo việc đang mở thì ID chưa tồn tại (`genTaskId()` chỉ chạy
trong `apiCreateTask`). JSON đã trỏ tới path nên path không cần mang ý nghĩa.

## 4. Vòng đời file

| Sự kiện | Hành vi |
|---|---|
| Chọn file | Validate → nén nếu là ảnh → upload → thêm phần tử vào state |
| Bấm X trên 1 file | `storage.remove([path])` + bỏ khỏi state |
| Bấm Hủy modal | Xoá mọi file đã upload trong phiên đó |
| Đóng tab giữa chừng | File mồ côi — chấp nhận (hiếm, 100GB dư sức) |
| Xoá công việc | Gom `path` từ `attachments` của việc **và** của mọi dòng `tien_do` thuộc việc đó → `storage.remove()` **trước khi** xoá row |

Nén ảnh phía client: resize cạnh dài về 1600px, xuất webp. Ảnh điện thoại 4MB còn ~200KB.
Nếu trình duyệt không decode được (ví dụ HEIC ngoài Safari) → upload nguyên bản, không chặn.
Video và file: giữ nguyên, không nén.

## 5. Code

### File mới

| File | Vai trò |
|---|---|
| `src/lib/attachments.js` | Hàm thuần: `kindOf(mime)`, `validate(file, current)`, `compressImage(file)`, `uploadAttachment()`, `deleteAttachments(paths)`, `buildZaloAttachmentText(list)`, hằng số `MAX_SIZE` / `MAX_COUNT` / `MAX_ZALO_IMAGES` |
| `src/components/AttachmentInput.jsx` | Nút đính kèm + input multiple + danh sách file (thumbnail/tên/size/nút xoá) + progress + cảnh báo. Props: `value`, `onChange`, `folder`, `disabled` |
| `src/components/AttachmentList.jsx` | Hiển thị read-only: lưới thumbnail ảnh, thẻ video, dòng file. Click → lightbox. Export kèm `AttachmentBadge` (icon 📎 + số) |

Viết bằng JSX. `TaskApp.jsx` dùng `createElement as h` nên sẽ gọi qua `h(AttachmentInput, {...})` — hoạt động bình thường.

Không nhồi thêm vào `TaskApp.jsx`: file này đã 1452 dòng / 101KB.

### Lưu ý: `buildZaloAttachmentText()` bị nhân bản có chủ đích

Hàm này **app không dùng** — nó phục vụ node code n8n. Nhưng node n8n là JS dán tay vào canvas,
không import được từ repo. Đặt hàm trong `src/lib/attachments.js` để nó **có test tự động**, rồi
copy nguyên văn sang node n8n.

Hệ quả: hai bản có thể trôi khỏi nhau. Giảm thiểu bằng comment ở cả hai đầu —
`// nguồn: src/lib/attachments.js — sửa là phải sửa cả node n8n "Tạo thẻ"` và chiều ngược lại.
Đây là đánh đổi có ý thức: chấp nhận nhân bản để đổi lấy test cho phần logic dễ sai nhất
(chọn ảnh nào gửi thật, ảnh nào rơi xuống link).

### Không làm lần này

Quality (`QualityApp.jsx:176-201`, bucket `qc_images`) và CSKH (`ZaloReportModal.jsx:78-92`, bucket
`zalo-reports`) có code upload trùng nhau gần như từng dòng. Helper mới đủ sức thay cả hai, nhưng
refactor chúng nằm ngoài phạm vi và có rủi ro làm hỏng luồng đang chạy.

### Điểm sửa trong app

| # | Vị trí | Thay đổi |
|---|---|---|
| 1 | `TaskModal` — `TaskApp.jsx:1000-1028` | Thêm `attachments` vào state `f`; render `AttachmentInput` sau field mô tả |
| 2 | `apiCreateTask` — `TaskApp.jsx:191-201` | Insert thêm `attachments: form.attachments || []` |
| 3 | `apiUpdateTask` — `TaskApp.jsx:203-206` | Patch `attachments` |
| 4 | `apiDeleteTask` — `TaskApp.jsx:208-212` | Dọn Storage trước khi xoá row (xem mục 4) |
| 5 | `TaskDetail` — `TaskApp.jsx:1033-1107` | Render `AttachmentList` cho `task.attachments`; mỗi dòng tiến độ render `AttachmentList` cỡ nhỏ |
| 6 | Ô nhập tiến độ — `TaskApp.jsx:1099-1103` + `apiAddProgress` (`:217`) | Thêm `AttachmentInput`; insert `attachments` vào `tien_do` |
| 7 | `TaskTable` — `TaskApp.jsx:814-868` | `AttachmentBadge` cạnh tiêu đề việc |
| 8 | `Dashboard` — `TaskApp.jsx:555-810` | `AttachmentBadge` trên thẻ việc |
| 9 | `UserTaskBoard` — `TaskApp.jsx:873-996` | `AttachmentBadge` trên thẻ việc |
| 10 | `WorkReport.jsx:435` | `AttachmentBadge` trên thẻ việc trong `pData.activeTasks.map` (2 tab cá nhân). Tab "Tổng hợp chung" chỉ hiện chip tên việc đã xong (`:710`) — **không** gắn badge |

Quyền: đính kèm đi theo quyền sẵn có (`tPerm.create` / `tPerm.edit` cho việc; ai cập nhật được tiến độ thì đính kèm được vào tiến độ). Không thêm quyền mới.

## 6. Luồng n8n → Zalo

Chuỗi hiện tại (workflow `wf-bao-cao-cong-viec-gio-vn.json`):

```
Tạo thẻ (code) → Loop Over Items → Tạo ảnh HCTI → Tải ảnh JPG
  → Upload ảnh lên OA → Gửi ảnh vào nhóm OA → Chờ 2 giây → (loop)
```

Thêm **2 node**, sửa **1 node code**, **không** thêm node truy vấn nào.

### 6.1 Sửa node code "Tạo thẻ đến hạn" và "Tạo nội dung thẻ chi tiết"

Đọc `task.attachments` (có sẵn nhờ `select('*')`).

- Thẻ HTML: thêm dòng `📎 3 đính kèm (2 ảnh, 1 file)`.
- `message_text`: thêm khối link cho **video và file**:
  ```
  📎 Đính kèm:
  • video-lap-dat.mp4 (18MB) — https://…
  • ban-ve.pdf — https://…
  ```
- Emit **thêm một item cho mỗi ảnh** (tối đa `MAX_ZALO_IMAGES` = 5):
  `{ direct_url: <url ảnh>, message_text: '📎 Ảnh đính kèm — CV-001 (1/2)' }`
- Ảnh thứ 6 trở đi rơi xuống khối link như video/file.

Giới hạn 5 ảnh vì mỗi ảnh là một tin nhắn cách nhau 2 giây: 10 ảnh nghĩa là nhóm Zalo nhận
11 tin liên tiếp trong 22 giây.

### 6.2 Node IF mới "Là ảnh đính kèm?"

Đặt ngay sau `Loop Over Items`. Điều kiện `{{ !!$json.direct_url }}`.

- **true** → node HTTP mới **"Tải ảnh đính kèm"** (`url: {{ $json.direct_url }}`,
  `responseFormat: file`) → nối thẳng vào `Upload ảnh lên OA`, bỏ qua HCTI.
- **false** → `Tạo ảnh HCTI` → `Tải ảnh JPG` → `Upload ảnh lên OA` (đường cũ).

### 6.3 Node không phải sửa

`Gửi ảnh vào nhóm OA` đã lấy text từ `$('Loop Over Items').item.json.message_text` — đúng cho cả hai nhánh.
`Chờ 2 giây` giữ nguyên để tránh rate limit.

### 6.4 Đầu ra tài liệu

- Cập nhật `docs/n8n/wf-nhac-viec-them-nodes.json` — thêm 2 node mới để paste vào canvas.
- Cập nhật `docs/n8n/nhac-viec-workflows.md` — runbook nối dây.

## 7. Cảnh báo dung lượng

| Điều kiện | Hành vi |
|---|---|
| File > 25MB | Chặn: "File vượt 25MB" |
| Tổng > 10 file | Chặn: "Tối đa 10 file mỗi việc" |
| File 10–25MB | Cảnh báo vàng, **không chặn**: "Video 18MB — tải lên có thể lâu trên 4G" |
| Luôn luôn | `AttachmentInput` hiện tổng: "3 file · 24MB" |

## 8. Xử lý lỗi

| Lỗi | Hành vi |
|---|---|
| Upload thất bại | File hiện trạng thái đỏ + nút thử lại; không chặn việc lưu công việc |
| Nén ảnh thất bại | Upload nguyên bản, không báo lỗi |
| Xoá file trong Storage thất bại | Vẫn bỏ khỏi state; file thành rác. Không chặn thao tác của người dùng |
| n8n tải ảnh đính kèm thất bại | Node "Tải ảnh đính kèm" lỗi → item đó bỏ qua; thẻ chính vẫn gửi |
| `attachments` là null (row cũ) | Mọi nơi đọc phải coi null/undefined như `[]` |

## 9. Kiểm thử

**Tự động** (vitest có sẵn) — `src/lib/attachments.test.js`, viết trước implementation:
- `kindOf(mime)` map đúng image/video/file, kể cả mime lạ
- `validate()` chặn quá 25MB, chặn quá 10 file
- `buildZaloAttachmentText()` chỉ liệt kê video/file, bỏ ảnh (trong hạn 5), định dạng size đúng
- Ảnh thứ 6 trở đi rơi xuống khối link

**Thủ công** — qua preview thật:
- Tạo việc kèm 1 ảnh + 1 video + 1 pdf → panel chi tiết hiện đủ, lightbox mở được
- Badge 📎 hiện đúng số ở TaskTable / Dashboard / UserTaskBoard
- Cập nhật tiến độ kèm ảnh → hiện trong dòng tiến độ
- Xoá việc → file biến mất khỏi Storage
- Row cũ (`attachments` null) không vỡ giao diện

**n8n** — webhook test, quan sát nhóm Zalo nhận thẻ + ảnh thật + link video/file.

## 10. Việc người dùng phải làm tay

1. Chạy SQL thêm 2 cột (`sql/setup_task_attachments.sql`).
2. Tạo bucket `task-attachments` trên Supabase: public, file size limit 25MB.
3. Import 2 node mới vào n8n và nối dây theo runbook.

## 11. Rủi ro đã biết

- **API file của Zalo chưa kiểm chứng.** Nếu sau này xác nhận `v3.0/oa/group/message` nhận được
  attachment kiểu `file`, có thể nâng cấp: thêm `upload/file` → gửi thật thay vì link. Thiết kế
  hiện tại không cản đường đó.
- **Bucket public.** Ai có link là xem được file, không cần đăng nhập. Path đặt ngẫu nhiên nên
  không đoán được, nhưng link đã lộ thì không thu hồi được. Đây là đánh đổi bắt buộc để link
  Zalo mở được trên điện thoại.
- **File mồ côi** khi người dùng đóng tab giữa chừng. Không có cơ chế dọn định kỳ. Nếu sau này
  thành vấn đề thì viết một job đối chiếu Storage với JSONB.
- **`buildZaloAttachmentText()` tồn tại 2 bản** (repo và node n8n), xem mục 5. Sửa một bên mà quên
  bên kia thì tin Zalo sai nội dung trong khi test vẫn xanh.
