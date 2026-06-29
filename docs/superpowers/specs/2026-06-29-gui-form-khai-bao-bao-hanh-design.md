# Thiết kế: Nút "Gửi Form khai báo bảo hành" trên tab Xử lý phiếu

Ngày: 2026-06-29 · Trạng thái: Đã triển khai

## 1. Mục tiêu

Mỗi dòng tab *Xử lý phiếu* (`src/pages/warranty/WarrantyProcessing.jsx`) có nút
**"Gửi Form khai báo bảo hành"**. Khi bấm:
1. App dựng payload (record CNV) **từ chính dữ liệu dòng đó** trong `xu_ly_phieu_bao_hanh`.
2. `POST` payload tới **DB trung gian CNV** qua HTTP (fetch trực tiếp từ trình duyệt).
3. Thành công → lưu DB + hiển thị **3 dòng trạng thái** trên phiếu; cho **gửi lại** (quyền Sửa).

## 2. Payload gửi đi (đã chốt qua hỏi đáp)

Đích: schema CNV rút gọn (KHÔNG phải shape `ticket_caresoft_bh` ở bản nháp đầu).
```js
{ action: 'CREATE', oldValues: null, newValues: { /* 20 trường Pascal_Snake */ } }
```

| newValues key | Nguồn (ưu tiên thông_tin_bổ_sung đã sửa → phiếu_gốc_json → mirror) |
|---|---|
| `Phieu_Ghi` | `id_phiếu_ghi` |
| `Ma_Don_Hang` | `mã_đơn_hàng` |
| `San_Pham` | nhãn option `mã_sản_phẩm` |
| `Ngay_Lap_Dat` | `ngày_lắp_đặt` (format `YYYY-MM-DD` trùng đích, không đổi) |
| `Chi_Tiet_Loi` | nhãn option `chi_tiết_lỗi` |
| `Khach_Hang` | `tên_khách_hàng` |
| `SDT_Khach` | `số_điện_thoại_khách_hàng` |
| `Dia_Chi` | `địa_chỉ_nhận_hàng` |
| `Tinh_Trang` | `tình_trạng` |
| `Nguyen_Nhan` | `nguyên_nhân` |
| `Phuong_An_XL` | `phương_án_xử_lý` |
| `Ten_DLD` | `tên_đlđ` |
| `Ma_DLD` | `mã_đlđ` |
| `SDT_DLD` | `sđt_đlđ` |
| `Khoang_Cach` | `thông_tin_bổ_sung.khoảng_cách` (rỗng nếu chưa nhập) |
| `Phan_Loai_CV` | **`''`** — app không lưu trường này (chỉ có ở `ticket_caresoft_bh`) |
| `Linh_Kien` | nhãn option `linh_kiện` (multi → nối nhãn) |
| `Trang_Thai` | hằng số `"Đã gửi form"` |
| `Xac_Nhan_Online` | hằng số khởi tạo `"Chưa gửi xác nhận online"` |
| `Thanh_Toan` | hằng số khởi tạo `"Chưa thanh toán"` |

> Đã xác minh trên 400 dòng DB thật: `phân_loại_công_việc` toàn bộ = "Bảo hành và Chăm
> sóc khách hàng"; không field nào chứa "ĐLĐ thay thế sửa chữa" → `Phan_Loai_CV` để rỗng.
> `trạng_thái_phiếu_ghi` là mã (open/solved/new/pending), không có "Đã gửi form" → đặt hằng số.

Hàm thuần: `buildKhaiBaoRecord(row, fieldOptions)` trong `src/lib/warrantyProcessing.js`.

## 3. Trạng thái — lưu 3 cột, hiển 3 dòng

3 trạng thái khởi tạo lúc gửi (CREATE); **luồng cập nhật về sau** (Đã gửi/Đã hoàn thành
xác nhận online; Đã thanh toán) ghi đè vào cùng cột — *triển khai sau*.

Migration `sql/add_gui_khai_bao_xu_ly_phieu.sql` (Phần B, trigger mirror không đụng):
```sql
ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "thời_điểm_gửi_khai_báo"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "người_gửi_khai_báo"         TEXT,
  ADD COLUMN IF NOT EXISTS "trạng_thái_xác_nhận_online" TEXT,
  ADD COLUMN IF NOT EXISTS "trạng_thái_thanh_toán"      TEXT;
```
`thời_điểm_gửi_khai_báo` ≠ null ⇒ đã gửi (driver của badge).

## 4. UI & xử lý

- `LIST_COLUMNS` thêm `{ key: 'khai_báo', label: 'Form khai báo' }`; `DEFAULT_VISIBLE` thêm `'khai_báo'`.
- `KhaiBaoCell`: chưa gửi → nút "Gửi Form khai báo bảo hành" (chỉ `perm.edit`); đã gửi →
  3 dòng ("✓ Đã gửi form khai báo bảo hành" + giờ; xác nhận online; thanh toán) + nút "Gửi lại".
  `stopPropagation` để không mở modal.
- `sendKhaiBao(row)`: confirm → `buildKhaiBaoRecord` → `POST KHAI_BAO_WEBHOOK` → set 4 cột
  (khởi tạo 2 trạng thái nếu chưa có) + cập nhật lạc quan. Lỗi → `alert`.
- Hằng `KHAI_BAO_WEBHOOK` (hiện trỏ webhook `e652142b…` — **đổi nếu CNV dùng URL khác**).

## 5. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Nguồn payload | Chỉ từ bảng app `xu_ly_phieu_bao_hanh`; trường app không có → `''` |
| Lưu trạng thái | Thêm 4 cột mới (Phần B) |
| Gửi lại | Cho phép, có xác nhận; quyền `perm.edit` |
| 3 trạng thái | Lưu cột + hiển 3 dòng/phiếu |
| `action`/`oldValues` | Luôn `CREATE` / `null` |

## 6. Test & trạng thái

- Unit test `buildKhaiBaoRecord` (5 ca) trong `warrantyProcessing.test.js` — pass (101/101 toàn bộ).
- Lint sạch, `npm run build` OK, đã đồng bộ `dist` → `deploy-netlify/`.
- **Người dùng cần làm:** (1) chạy SQL migration trên Supabase TRƯỚC khi dùng; (2) xác nhận/đổi
  `KHAI_BAO_WEBHOOK` sang đúng endpoint CNV nếu khác.

## 7. Không làm (YAGNI)

Không sửa n8n; không đọc `ticket_caresoft_bh`; không gửi hàng loạt; luồng cập nhật trạng
thái xác nhận online / thanh toán làm ở bước sau.
