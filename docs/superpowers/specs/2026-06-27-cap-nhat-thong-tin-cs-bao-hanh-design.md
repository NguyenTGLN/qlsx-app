# Thiết kế: Cập nhật thông tin ĐLĐ/Khách hàng & đồng bộ ngược về Caresoft

- **Ngày:** 2026-06-27
- **Phân hệ:** Bảo hành → tab "Xử Lý Phiếu" (`xu_ly_phieu_bao_hanh`)
- **Liên quan:** [[qlsx-warranty-processing]], outbound n8n (`docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`)

## 1. Bối cảnh & mục tiêu

Nhiều phiếu bảo hành chưa có thông tin ĐLĐ / khách hàng trên Caresoft. Nhân viên cần **nhập/sửa các thông tin này ngay trên app**, rồi bấm "Đồng bộ" (cơ chế thủ công + cờ `pending` hiện có) để **ghi ngược về ticket Caresoft** qua n8n.

Giữ nguyên kiến trúc "quy tắc vàng": app chỉ ghi `xu_ly_phieu_bao_hanh`; n8n outbound chỉ chạy khi `trạng_thái_đồng_bộ='pending'`.

## 2. Bộ trường & ánh xạ Caresoft (đã xác minh từ ticket thật 498458481)

| Key (app/JSON) | Label Caresoft | Custom field ID | Nguồn prefill (`phieu_bao_hanh`) |
|---|---|---|---|
| `mã_đlđ` | Mã ĐLĐ | 9665 | `mã_đlđ` |
| `tên_đlđ` | Tên ĐLĐ | 9849 | `tên_đlđ` |
| `sđt_đlđ` | SĐT ĐLĐ | 9829 | `sđt_đlđ` |
| `địa_chỉ_nhận_hàng` | Địa chỉ nhận hàng | 9694 | `địa_chỉ_nhận_hàng` |
| `tên_khách_hàng` | Tên khách hàng | 9706 | `tên_khách_hàng` |
| `số_điện_thoại_khách_hàng` | Số điện thoại khách hàng | 9705 | `số_điện_thoại_khách_hàng` |

IDs lấy bằng cách GET `/tickets/498458481` rồi dò ngược `custom_filed[].value` → `id` + `label`. Mảng custom field trong response Caresoft tên là `custom_filed` (thiếu chữ "s").

## 3. Mô hình dữ liệu

Thêm **1 cột JSONB** Part B (app làm chủ) vào `xu_ly_phieu_bao_hanh`:

```sql
ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "thông_tin_bổ_sung" JSONB DEFAULT '{}'::jsonb;
```

Body ví dụ:
```json
{
  "mã_đlđ": "ĐL18", "tên_đlđ": "MÃ VĂN BIỀN", "sđt_đlđ": "0339347968",
  "địa_chỉ_nhận_hàng": "...", "tên_khách_hàng": "C Thảo", "số_điện_thoại_khách_hàng": "0394920163"
}
```

**Vì sao JSONB 1 cột (không phải 6 cột riêng):** `số_điện_thoại_khách_hàng` đã tồn tại ở Part A (mirror, Caresoft-thắng qua trigger). Tách bản-app-sửa vào JSONB tránh trùng tên cột và tránh trigger ghi đè. Trigger Phần A **không đụng** cột này.

## 4. Prefill (modal)

Mỗi trường lấy giá trị theo thứ tự ưu tiên:
1. `row['thông_tin_bổ_sung'][key]` (giá trị app đã sửa) — nếu có.
2. `row['phiếu_gốc_json'][key]` (giá trị gốc từ Caresoft mirror) — nếu (1) trống.
3. Rỗng.

Helper `getThongTinBoSung(row)` trả về object 6 key đã resolve theo quy tắc trên, đặt trong `src/lib/warrantyProcessing.js` (kèm test).

## 5. Giao diện (ProcessingModal.jsx)

Thêm 1 mục `<section>` **"Thông tin Caresoft (đẩy khi đồng bộ)"** gồm 6 ô:
- Mã ĐLĐ · Tên ĐLĐ · SĐT ĐLĐ (hàng ĐLĐ)
- Tên khách hàng · SĐT khách hàng · Địa chỉ nhận hàng (hàng KH)

State `tinBoSung` init bằng `getThongTinBoSung(row)`. Khóa input khi không có quyền `edit`. `buildPayload()` thêm `'thông_tin_bổ_sung': tinBoSung`.

## 6. Luồng lưu & đồng bộ (không đổi cơ chế)

- **Lưu:** `handleSave` ghi payload (gồm `thông_tin_bổ_sung`), giữ `trạng_thái_đồng_bộ`.
- **Hoàn tất & Đồng bộ / nút Đồng bộ trên dòng:** đặt `trạng_thái_đồng_bộ='pending'` như hiện tại → Supabase Database Webhook (UPDATE) → n8n.

## 7. n8n outbound (nâng cấp `docs/n8n/...outbound...json`)

Mô phỏng nhánh contact của workflow cũ + thêm van chống loop + ACK:

1. **Webhook** (POST) nhận `body.record`.
2. **IF** `record['trạng_thái_đồng_bộ'] === 'pending'` (van chống loop; false → dừng).
3. **Code "Chuẩn bị":** từ `record`:
   - `ticketId = record['id_phiếu_ghi']`
   - `tt = record['thông_tin_bổ_sung'] || {}`
   - `final_custom_fields`: gọi `addField(id, value)` cho 6 ID, **bỏ qua value rỗng/null** (không đè CS):
     9665←`mã_đlđ`, 9849←`tên_đlđ`, 9829←`sđt_đlđ`, 9694←`địa_chỉ_nhận_hàng`, 9706←`tên_khách_hàng`, 9705←`số_điện_thoại_khách_hàng`.
   - `commentBody`: tóm tắt xử lý (trạng thái xử lý, người phụ trách, kết quả, linh kiện, chi phí, bước đã xong).
   - `customerName = tt['tên_khách_hàng']`, `customerPhone = tt['số_điện_thoại_khách_hàng']`.
4. **Người yêu cầu = khách hàng** (chỉ khi có tên/SĐT KH):
   - **POST `/contacts/`** `{contact:{username:customerName, phone_no:customerPhone}}`, `onError: continueErrorOutput`.
   - **Nhánh OK:** lấy `contact.id` mới.
   - **Nhánh lỗi (trùng SĐT):** Code regex bắt `duplicate_id` từ `error.message` → **PUT `/contacts/{id}`** `{contact:{username}}` (cập nhật tên) → dùng id đó.
   - Hai nhánh hợp về `requester_id`.
5. **PUT `/tickets/{ticketId}`** body:
   ```json
   { "ticket": {
       "requester_id": "<id>",
       "ticket_comment": { "body": "<commentBody>", "is_public": 0, "author_id": 195739221 },
       "custom_fields": <final_custom_fields>
   }}
   ```
   Header `Authorization: Bearer <token>`. Nếu KH trống → bỏ `requester_id`, chỉ đẩy custom_fields + comment.
6. **ACK** về Supabase (node Supabase, credential "Supabase account 2", lọc `id = record.id`):
   - Thành công → `trạng_thái_đồng_bộ='đã_đồng_bộ'`, `thời_điểm_đồng_bộ=now`, `lỗi_đồng_bộ=null`.
   - Lỗi (`onError` nhánh) → `trạng_thái_đồng_bộ='lỗi'`, `lỗi_đồng_bộ=<message>`.

ACK đặt `'đã_đồng_bộ'` (≠ `'pending'`) nên webhook bắn lại bị IF chặn → không lặp.

## 8. An toàn / bất biến

- **Không đè trắng:** ô trống không vào `custom_fields` (pattern `addField`).
- **Chống loop:** chỉ chạy outbound khi `pending`; ACK không set lại `pending`.
- **Phân tách:** trigger Phần A không đụng `thông_tin_bổ_sung`; app không ghi cột Phần A.
- **Token Caresoft** để trong header node n8n (không hardcode trong app/repo phía client).

## 9. Ngoài phạm vi (YAGNI)

- Không thêm trường "Trạng thái KT tiếp nhận" (option-lookup) lần này.
- Không tự động đẩy (vẫn bấm tay); không debounce.
- Không backfill `thông_tin_bổ_sung` (để trống, prefill lúc mở modal là đủ).
- Không đổi `ticket_status` ở luồng này (tách khỏi field `trạng_thái_caresoft_muốn_set` hiện có).

## 10. Kiểm thử

- **Unit (`warrantyProcessing.test.js`):** `getThongTinBoSung` — ưu tiên bản sửa > phiếu gốc > rỗng; chịu `phiếu_gốc_json` null.
- **Thủ công:** sửa 6 trường 1 phiếu test → Lưu → mở lại thấy giữ. Bấm Đồng bộ → kiểm ticket Caresoft: custom_fields cập nhật đúng ô, requester = KH, badge "Đã đồng bộ". Thử ô trống → không xóa giá trị cũ trên CS. Thử SĐT trùng → nhánh update contact chạy.
