# Thiết kế: Nút "Gửi Form khai báo bảo hành" trên tab Xử lý phiếu

Ngày: 2026-06-29
Trạng thái: Đã chốt (chờ review trước khi viết plan)

## 1. Mục tiêu

Thêm vào **mỗi dòng** của tab *Xử lý phiếu* (`src/pages/warranty/WarrantyProcessing.jsx`)
một nút **"Gửi Form khai báo bảo hành"**. Khi bấm:

1. App dựng payload (cùng cấu trúc dữ liệu mà n8n đang nhận khi gửi form khai báo cho KTV).
2. `POST` payload tới webhook n8n để ghi vào **database trung gian CNV**.
3. Thành công → ghi nhận vào DB và hiển thị trạng thái dòng đó là
   **"Đã gửi form khai báo bảo hành"** (giữ qua khi tải lại trang).
4. Cho phép **gửi lại** (có xác nhận); nút chỉ hiện với người có **quyền Sửa** (`perm.edit`).

## 2. Quyết định đã chốt (qua hỏi đáp với user)

| Vấn đề | Quyết định |
|---|---|
| Nguồn dữ liệu payload | **Chỉ từ bảng app** `xu_ly_phieu_bao_hanh` (dữ liệu hiển thị ở tab). KHÔNG đọc `ticket_caresoft_bh`, KHÔNG sửa n8n. |
| Trường app không lưu | Để **`null`** nhưng vẫn giữ key (giữ nguyên shape payload). |
| Lưu trạng thái "đã gửi" | **Thêm cột mới** vào bảng (Phần B). |
| Gửi lại | **Cho gửi lại**, có xác nhận. |
| Quyền bấm | **`perm.edit`** (quyền Sửa). |
| `_ktv` trong payload | = **tên ĐLĐ** (`ten_dld` hiệu lực) `|| '—'`. (KTV chính là ĐLĐ, không phải người phụ trách.) |

## 3. Bối cảnh kỹ thuật (đã xác minh trên DB thật)

- Payload n8n nhận dùng **key ASCII bỏ dấu** (`phieu_ghi`, `ma_dld`, `ma_don_hang`…),
  trùng schema bảng `ticket_caresoft_bh` (47 cột) + 5 trường tính thêm `_id, _order_id,
  _product_code, _customer, _ktv`. Body thực gửi đi (bỏ lớp bọc execution của n8n):
  ```js
  { action_type: 'cnv', table: 'ticket_caresoft_bh', count: 1,
    sent_at: '<ISO>', records: [ <record> ] }
  ```
- Bảng app `xu_ly_phieu_bao_hanh` dùng **key tiếng Việt có dấu**. Cột `phiếu_gốc_json`
  = `to_jsonb` của hàng `phieu_bao_hanh`, chứa **~30/47** trường (key có dấu). Các sửa
  đổi trong tab nằm ở cột JSON `thông_tin_bổ_sung` (qua các card KTV/KH/Sản phẩm).
- `phiếu_gốc_json` có các key (xác minh thực tế):
  `id, nguồn, ghi_chú, mã_đlđ, sđt_đlđ, tên_đlđ, bộ_phận, chủ_đề, dịch_vụ, linh_kiện,
  phiếu_ghi, nguyên_nhân, tình_trạng, id_phiếu_ghi, ktv_xác_nhận, mã_đơn_hàng,
  đáp_ứng_sla, chi_tiết_lỗi, mã_sản_phẩm, gửi_linh_kiện, tên_khách_hàng, ngày_lắp_đặt,
  nhóm_sản_phẩm, tên_chuyên_viên, thời_điểm_tạo, phương_án_xử_lý, thu_hồi_linh_kiện,
  thời_hạn_xử_lý, thông_số_kiểm_tra, chi_tiết_công_việc, tình_trạng_gọichat,
  đại_lý_phụ_trách, tên_người_yêu_cầu, phân_loại_công_việc, trạng_thái_phiếu_ghi,
  địa_chỉ_nhận_hàng, tình_trạng_phản_hồi, thời_điểm_cập_nhật, số_điện_thoại_đại_lý,
  số_điện_thoại_khách_hàng, số_điện_thoại_thu_thập_lần_đầu`.
- Webhook đích: `https://thegioilocnuoc.site/webhook/e652142b-1e04-43f4-91f1-feae495aacc0`.
  Gửi bằng `fetch` trực tiếp từ trình duyệt — đúng pattern `handleSyncCsApp` đã chạy được
  với cùng host (CORS đã thông).

## 4. Hàm thuần `buildKhaiBaoRecord(row, fieldOptions)`

Đặt trong `src/lib/warrantyProcessing.js` (để unit-test độc lập). Trả về object `record`
đủ 47 key ASCII + 5 trường `_`. Quy ước giá trị rỗng → `null` (dùng `|| null`).

**Giá trị hiệu lực (effective):**
- `tin = getThongTinBoSung(row)` → 9 key ưu tiên `thông_tin_bổ_sung` rồi `phiếu_gốc_json`:
  `mã_đlđ, tên_đlđ, sđt_đlđ, khoảng_cách, tên_khách_hàng, số_điện_thoại_khách_hàng,
  địa_chỉ_nhận_hàng, tình_trạng, ngày_lắp_đặt`.
- `optLabel(key)` cho 4 trường option (cùng logic hiển thị card Sản phẩm):
  - multi (`linh_kiện`): nối nhãn từ `thông_tin_bổ_sung.linh_kiện_option_ids` qua
    `resolveOptionLabel`; rỗng → `row[key] || goc[key]`.
  - single (`nhóm_sản_phẩm, mã_sản_phẩm, chi_tiết_lỗi`):
    `resolveOptionLabel(fieldOptions, thông_tin_bổ_sung[key+'_option_id']) || row[key] || goc[key]`.
- `goc = row['phiếu_gốc_json'] || {}`.

**Bảng ánh xạ key payload ← nguồn** (thứ tự đúng như ví dụ):

| Payload key | Nguồn |
|---|---|
| `phieu_ghi` | `row.phiếu_ghi \|\| goc.phiếu_ghi \|\| row.id_phiếu_ghi` |
| `chu_de` | `goc.chủ_đề` |
| `ten_nguoi_yeu_cau` | `goc.tên_người_yêu_cầu` |
| `sdt_thu_thap_lan_dau` | `goc.số_điện_thoại_thu_thập_lần_đầu` |
| `ten_chuyen_vien` | `goc.tên_chuyên_viên` |
| `sdt_chuyen_vien` | `null` |
| `trang_thai_phieu_ghi` | `row.trạng_thái_phiếu_ghi \|\| goc.trạng_thái_phiếu_ghi` |
| `thoi_diem_cap_nhat` | `row.thời_điểm_cập_nhật \|\| goc.thời_điểm_cập_nhật` |
| `thoi_diem_tao` | `row.thời_điểm_tạo \|\| goc.thời_điểm_tạo` |
| `thoi_han_xu_ly` | `goc.thời_hạn_xử_lý` |
| `ma_dld` | `tin.mã_đlđ` |
| `ma_don_hang` | `row.mã_đơn_hàng \|\| goc.mã_đơn_hàng` |
| `so_luong_may_lap` | `null` |
| `tinh_trang` | `tin.tình_trạng` |
| `ktv_xac_nhan` | `goc.ktv_xác_nhận` |
| `doi_tuong_nhan_linh_kien` | `null` |
| `dia_chi_nhan_hang` | `tin.địa_chỉ_nhận_hàng` |
| `sdt_dai_ly` | `goc.số_điện_thoại_đại_lý` |
| `hinh_anh_video_ttbh` | `null` |
| `khoang_cach` | `tin.khoảng_cách` |
| `ngay_du_kien_giao_hang` | `null` |
| `sdt_khach_hang` | `tin.số_điện_thoại_khách_hàng \|\| row.số_điện_thoại_khách_hàng` |
| `ten_khach_hang` | `tin.tên_khách_hàng` |
| `gui_linh_kien` | `goc.gửi_linh_kiện` |
| `ngay_lap_dat` | `tin.ngày_lắp_đặt \|\| row.ngày_lắp_đặt` |
| `linh_kien` | `optLabel('linh_kiện')` |
| `ma_san_pham` | `optLabel('mã_sản_phẩm')` |
| `nguyen_nhan` | `goc.nguyên_nhân` |
| `phuong_an_xu_ly` | `goc.phương_án_xử_lý` |
| `ghi_chu` | `goc.ghi_chú` |
| `sdt_dld` | `tin.sđt_đlđ` |
| `thong_so_kiem_tra` | `goc.thông_số_kiểm_tra` |
| `thong_so_kt_linh_kien_thu_hoi` | `null` |
| `tinh_trang_dld` | `null` |
| `kt_tiep_nhan` | `null` |
| `thu_hoi_linh_kien` | `goc.thu_hồi_linh_kiện` |
| `ten_dld` | `tin.tên_đlđ` |
| `nhom_san_pham` | `optLabel('nhóm_sản_phẩm')` |
| `dai_ly_phu_trach` | `goc.đại_lý_phụ_trách` |
| `chi_tiet_loi` | `optLabel('chi_tiết_lỗi')` |
| `gia_han_xu_ly` | `null` |
| `thong_tin_khieu_nai_gop_y` | `null` |
| `so_seri` | `null` |
| `thoi_diem_xu_ly` | `null` |
| `ten_chien_dich` | `null` |
| `phan_loai_cv` | `null` |
| `chi_tiet_cv` | `goc.chi_tiết_công_việc` |
| `_id` | `row.id_phiếu_ghi \|\| goc.id_phiếu_ghi` |
| `_order_id` | giá trị `ma_don_hang` |
| `_product_code` | giá trị `ma_san_pham` |
| `_customer` | giá trị `ten_khach_hang` |
| `_ktv` | giá trị `ten_dld` `\|\| '—'` |

> Lưu ý: `phân_loại_công_việc` của app ("Bảo hành và Chăm sóc khách hàng") **khác**
> `phan_loai_cv` của Caresoft ("ĐLĐ thay thế sửa chữa") → KHÔNG map nhầm; `phan_loai_cv = null`.

## 5. Migration SQL

File mới `sql/add_gui_khai_bao_xu_ly_phieu.sql`:
```sql
ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "thời_điểm_gửi_khai_báo" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "người_gửi_khai_báo"     TEXT;
```
- `thời_điểm_gửi_khai_báo` ≠ null ⇒ đã gửi. Đây là Phần B (trigger mirror không đụng).
- User tự chạy trong Supabase SQL Editor trước khi deploy bản web mới.

## 6. UI trong `WarrantyProcessing.jsx`

- **Cột mới**: thêm vào cuối `LIST_COLUMNS`:
  `{ key: 'khai_báo', label: 'Form khai báo', render: (r, ctx) => <KhaiBaoCell row={r} perm={ctx.perm} onSend={ctx.onSendKhaiBao} /> }`.
  Thêm `'khai_báo'` vào cuối `DEFAULT_VISIBLE`.
- **Component `KhaiBaoCell({ row, perm, onSend })`**:
  - `sent = !!row['thời_điểm_gửi_khai_báo']`.
  - Chưa gửi: nút **"Gửi Form khai báo bảo hành"** (icon `Send`), chỉ hiện khi `perm.edit`.
  - Đã gửi: badge xanh **"✓ Đã gửi form khai báo bảo hành"** + thời điểm
    (`fmtDateTime`); nếu `perm.edit` thêm nút nhỏ **"Gửi lại"**.
  - `busy` (spinner) khi đang gửi; `onClick` luôn `stopPropagation` (tránh mở modal khi
    bấm vào ô).
- **Handler `sendKhaiBao(row)`** trong component `WarrantyProcessing`:
  1. `window.confirm` (gửi lại nếu đã gửi → câu xác nhận khác).
  2. `record = buildKhaiBaoRecord(row, fieldOptions)`; `payload = { action_type:'cnv',
     table:'ticket_caresoft_bh', count:1, sent_at:new Date().toISOString(), records:[record] }`.
  3. `fetch(KHAI_BAO_WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'},
     body: JSON.stringify(payload) })`; lỗi HTTP → throw.
  4. Thành công: `update` DB `{ thời_điểm_gửi_khai_báo: now, người_gửi_khai_báo: operator }`
     theo `id`; cập nhật lạc quan `setRows`.
  5. Lỗi: `alert('Lỗi gửi form khai báo: ' + msg)`, không đổi DB.
  - Truyền qua `ctx` của bảng: thêm `onSendKhaiBao: sendKhaiBao` vào object thứ 2 của
    `c.render(r, { … })`.
- **Hằng** `const KHAI_BAO_WEBHOOK = 'https://thegioilocnuoc.site/webhook/e652142b-1e04-43f4-91f1-feae495aacc0';`.

## 7. Test & verify

- **Unit test** (bổ sung `src/lib/warrantyProcessing.test.js`) cho `buildKhaiBaoRecord`:
  - Dòng mẫu (dạng ticket 229283): bộ key trả về **đúng** danh sách 52 key (47 + 5 `_`).
  - Override app: set `thông_tin_bổ_sung.tên_đlđ` → `ten_dld` và `_ktv` lấy giá trị đó.
  - Option: set `thông_tin_bổ_sung.mã_sản_phẩm_option_id` → `ma_san_pham`/`_product_code`
    là nhãn resolve, không phải id.
  - Trường app không lưu (`so_seri, phan_loai_cv, kt_tiep_nhan`…) = `null`.
- **Verify preview**: đăng nhập → tab Xử lý phiếu → bấm nút; kiểm `preview_network` thấy
  POST tới webhook với body đúng; badge dòng đổi sang "Đã gửi…".
- Sau khi xong: `npm run build` + copy `dist` → `deploy-netlify/` (theo quy ước deploy).

## 8. Phạm vi KHÔNG làm (YAGNI)

- Không sửa workflow n8n; không đọc `ticket_caresoft_bh`.
- Không gửi hàng loạt (chỉ từng dòng). Không thêm cột lỗi riêng (thất bại chỉ `alert`).
- Không enrich 14 trường thiếu (giữ `null` theo quyết định của user).
