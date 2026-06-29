# Thiết kế: Xử lý phiếu bảo hành NHIỀU LẦN (mỗi lần 1 nhiệm vụ/biên bản)

Ngày: 2026-06-29 · Trạng thái: Chờ user review

## 1. Bài toán

1 phiếu bảo hành (1 ticket Caresoft, vd `229545`) có thể cần KTV đi xử lý **nhiều lần**, mỗi
lần là 1 nhiệm vụ khác nhau (lần 1 = kiểm tra máy, lần 2 = thay linh kiện, lần 3 = sửa lại…,
có khi tới 7 lần). **Mỗi lần là 1 biên bản độc lập**: có nguyên nhân/phương án/linh kiện riêng,
KTV/KH xác nhận riêng, có thể thanh toán riêng. Cần quản lý việc **gửi form từng lần** và
**theo dõi trạng thái từng lần**, tất cả thuộc cùng 1 phiếu / sản phẩm / mã đơn hàng.

## 2. Quyết định đã chốt (qua brainstorming với user)

| Vấn đề | Quyết định |
|---|---|
| Mỗi lần có biên bản/xác nhận/thanh toán riêng? | **Có** — mỗi lần 1 bản ghi CNV độc lập |
| Lần = ticket riêng hay cùng ticket? | **Cùng 1 ticket** (cùng số phiếu); app tự đánh số lần |
| Dữ liệu mỗi lần | Riêng từng lần (xem §4). **Giữ chung**: KH (tên/SĐT/địa chỉ), mã SP, mã ĐH, ngày lắp, số phiếu |
| Loại nhiệm vụ | **Gõ tay (free text)** — tạm thời, chưa cần danh sách cố định |
| Mô hình lưu | **JSONB `các_lần`** trong `xu_ly_phieu_bao_hanh` (không tạo bảng con) |
| Định danh CNV | id ghép: lần 1 = số phiếu trần; lần 2+ = `<số phiếu>-<lần>` |
| Giao diện | Hàng ngang các ô, mỗi ô = 1 lần |
| Phần CNV/n8n (tạo bản ghi per-lần) | **User tự lo** (ngoài phạm vi app) |

## 3. Bối cảnh kỹ thuật (đã xác minh)

- Bảng CNV `du_lieu_khai_bao__bao_hanh`: **`id` = khóa chính = số phiếu**, hiện 1 dòng/phiếu
  (400 dòng = 400 id phân biệt, không trùng). `ktv_id_internal` đã có dạng ghép `"229545-be33"`.
- App đã có: nút Gửi Form khai báo (1 lần/phiếu) → POST webhook CNV `e652142b…`; helper
  `buildKhaiBaoRecord` (payload 20 key Pascal_Snake); `deriveKhaiBaoStatuses(ext)` (3 dòng trạng
  thái từ trang_thai/status/payment_status); đối chiếu live `khaiBaoExt` (Map theo phiếu_ghi).
- Payload CNV 20 key: shared = Phieu_Ghi/Ma_Don_Hang/San_Pham/Ngay_Lap_Dat/Khach_Hang/SDT_Khach/
  Dia_Chi; per-lần = Chi_Tiet_Loi/Tinh_Trang/Nguyen_Nhan/Phuong_An_XL/Ten_DLD/Ma_DLD/SDT_DLD/
  Khoang_Cach/**Phan_Loai_CV (= loại nhiệm vụ)**/Linh_Kien; hằng số = Trang_Thai/Xac_Nhan_Online/Thanh_Toan.

## 4. Mô hình dữ liệu

Thêm cột **`các_lần` JSONB** (default `[]`) vào `xu_ly_phieu_bao_hanh` (Phần B, app làm chủ).
Mỗi phần tử = 1 lần:
```jsonc
{
  "lần": 2,                          // số thứ tự lần (1..N)
  "cnv_id": "229545-2",              // id ghép gửi vào Phieu_Ghi (lần 1 = "229545" trần)
  "loại_nhiệm_vụ": "Thay linh kiện", // free text → Phan_Loai_CV
  "chi_tiết_lỗi": "...",
  "tình_trạng": "...",
  "nguyên_nhân": "...",
  "phương_án_xử_lý": "...",
  "linh_kiện": "...",
  "tên_đlđ": "...", "mã_đlđ": "...", "sđt_đlđ": "...",  // KTV/ĐLĐ riêng từng lần
  "khoảng_cách": "...",
  "thời_điểm_gửi": "<ISO>",          // null = đã tạo lần nhưng chưa gửi form
  "người_gửi": "..."
}
```
- **Trạng thái KHÔNG lưu** trong `các_lần` — đối chiếu **live** từ CNV theo `cnv_id`.
- Trường nhập **free text** (v1) — không dùng dropdown option cascade per-lần (để sau nếu cần).
- **Migration dữ liệu cũ:** phiếu đã từng gửi form (`thời_điểm_gửi_khai_báo` ≠ null) → coi như
  **lần 1** với `cnv_id` = số phiếu trần. App tự suy lần 1 nếu `các_lần` rỗng mà có
  `thời_điểm_gửi_khai_báo` (không cần script DB; xử lý ở tầng đọc).

## 5. Định danh lần ↔ CNV

- `cnvIdForLan(phiếu_ghi, lần)` = `lần === 1 ? phiếu_ghi : phiếu_ghi + '-' + lần`.
- Gửi form lần N: `buildLanKhaiBaoRecord(row, lan)` → payload như `buildKhaiBaoRecord` nhưng:
  - `Phieu_Ghi` = `cnv_id` của lần.
  - Per-lần fields lấy từ `lan` (loại_nhiệm_vụ→Phan_Loai_CV, chi_tiết_lỗi, tình_trạng, nguyên_nhân,
    phương_án_xử_lý, linh_kiện, tên/mã/sđt ĐLĐ, khoảng_cách).
  - Shared fields lấy từ `row` (Ma_Don_Hang/San_Pham/Ngay_Lap_Dat/Khach_Hang/SDT_Khach/Dia_Chi) như cũ.
  - Trang_Thai/Xac_Nhan_Online/Thanh_Toan = hằng số khởi tạo. Ngay_Lap_Dat chuẩn hóa `yyyy-mm-dd`.

## 6. Đối chiếu trạng thái (mở rộng khaiBaoExt)

- Gom **tất cả `cnv_id`** của mọi lần trên các phiếu đang hiển thị → query
  `du_lieu_khai_bao__bao_hanh?id=in.(...)` (batch) → `Map<cnv_id, row>`.
- Mỗi ô-lần suy 3 dòng qua `deriveKhaiBaoStatuses(map.get(lan.cnv_id))` (helper sẵn có, giữ nguyên).
- Chạy lại mỗi lần "Làm mới" (effect theo key gồm mọi cnv_id).

## 7. Giao diện — cột "Form khai báo"

- **Hàng ngang các ô-lần** (giống dãy chip WF). Mỗi ô (card, `.wf-card`):
  - Tiêu đề: **"Lần N · ‹loại nhiệm vụ›"**.
  - 3 dòng trạng thái: biên bản online / xác nhận / thanh toán (màu xanh/đỏ/cam/xám như hiện tại).
  - Nút **Gửi** (chưa gửi) / **Gửi lại** (đã gửi) — gate `perm.edit`.
- Ô cuối: nút **"+ Thêm lần"** (gate `perm.edit`) → tạo lần mới (lần = max+1) + mở popover sửa.
- **Bấm 1 ô-lần** → popover sửa bộ thông tin riêng của lần (loại nhiệm vụ + chi tiết lỗi + tình
  trạng + nguyên nhân + phương án + linh kiện + KTV tên/mã/SĐT + khoảng cách — đều input text;
  loại nhiệm vụ free text) + nút **Lưu** / **Gửi form** / **Đóng**.
- Phiếu chưa có lần nào (`các_lần` rỗng & chưa từng gửi form): ô chỉ hiện nút **"+ Thêm lần"**
  (thay nút "Gửi Form khai báo bảo hành" cũ). Mọi phiếu đều theo mô hình các-lần cho nhất quán.

## 8. Component / file

- `src/lib/warrantyProcessing.js`: thêm `cnvIdForLan(phieuGhi, lan)`, `buildLanKhaiBaoRecord(row, lan, fieldOptions)`,
  `getEffectiveLan(row)` (suy `các_lần`; nếu rỗng mà có `thời_điểm_gửi_khai_báo` → tạo 1 lần ảo lần-1).
  Tái dùng `deriveKhaiBaoStatuses`, `normDateYmd`. (+ unit test các helper.)
- `src/pages/warranty/WarrantyProcessing.jsx`:
  - `KhaiBaoCell` → render hàng ngang ô-lần + ô "+ Thêm lần"; component con `LanCard` (1 ô) + `LanEditPopover`.
  - State + effect `khaiBaoExt` đổi key sang **cnv_id** (gom từ `các_lần`).
  - Handler `saveLan(row, lan)` (merge vào `các_lần`, ghi DB), `sendLan(row, lan)` (POST webhook → set
    thời_điểm_gửi/người_gửi → lưu `các_lần`), `addLan(row)` (thêm phần tử mới).
- SQL: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "các_lần" JSONB DEFAULT '[]'::jsonb;`

## 9. Phụ thuộc ngoài app (user lo)

Hệ CNV/n8n của user phải: nhận `Phieu_Ghi` dạng id ghép `229545-2` → **tạo bản ghi MỚI** (không
ghi đè) trong `du_lieu_khai_bao__bao_hanh`; sinh biên bản + link xác nhận KTV/KH + thanh toán theo
từng id ghép. App chỉ gửi id ghép + đọc trạng thái. **Nếu CNV chưa hỗ trợ, trạng thái lần 2+ sẽ trống.**

## 10. Quan hệ với tính năng cũ

- Card "Thông tin bảo hành" (đẩy nguyên nhân/phương án về **Caresoft**, ticket-level) **giữ nguyên** —
  luồng độc lập với form khai báo CNV per-lần. Dữ liệu lần nhập riêng cho CNV, không đụng `thông_tin_bổ_sung`.
- Cột cũ `thời_điểm_gửi_khai_báo`/`người_gửi_khai_báo` → dùng cho **migration lần 1** (đọc), không ghi mới nữa.

## 11. Test & verify

- Unit test: `cnvIdForLan` (lần 1 trần / lần N ghép); `buildLanKhaiBaoRecord` (Phieu_Ghi = cnv_id,
  per-lần lấy từ lan, shared từ row, Ngay_Lap_Dat chuẩn hóa); `getEffectiveLan` (migration lần 1).
- Verify preview: thêm 2-3 lần 1 phiếu, mỗi ô hiện đúng "Lần N · nhiệm vụ" + trạng thái; chặn webhook
  khi test (không gửi thật); đối chiếu cnv_id.

## 12. KHÔNG làm (YAGNI / để sau)

- Không dropdown option cascade per-lần (free text v1).
- Không tạo bảng con. Không sửa CNV/n8n (user lo). Không gộp luồng Caresoft với CNV.
- Không có "kết quả thực hiện"/"ngày bảo hành" trong form app (CNV tự điền khi KTV làm biên bản).
