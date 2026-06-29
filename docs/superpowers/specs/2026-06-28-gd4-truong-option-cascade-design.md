# Thiết kế GĐ4: 4 trường option Caresoft (cascade) — sửa trong app + đẩy ngược

- **Ngày:** 2026-06-28
- **Phân hệ:** Bảo hành → tab "Xử Lý Phiếu" (`xu_ly_phieu_bao_hanh`)
- **Liên quan:** [[qlsx-warranty-processing]], outbound n8n `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`, spec GĐ1-3 `docs/superpowers/specs/2026-06-27-*`

## 1. Bối cảnh & mục tiêu

4 trường **Nhóm sản phẩm / Mã sản phẩm / Linh kiện / Chi tiết lỗi** hiện hiển thị **chỉ-đọc** trong app (card + modal). Trên Caresoft chúng là **custom field "Chọn 1 phương án"**, lưu **option_id (số)**, và là **dropdown phân cấp**: con phụ thuộc **Nhóm sản phẩm**.

Mục tiêu (user chốt 2026-06-28, "làm full"):
1. Cho **sửa** 4 trường này trong app bằng **dropdown cascade** (chọn Nhóm SP → lọc Mã SP/Chi tiết lỗi/Linh kiện theo nhóm).
2. **Đẩy ngược** về Caresoft đúng **option_id** (khác 6 trường ĐLĐ/KH là text gửi thẳng).

## 2. Dữ kiện đã xác minh (khảo sát CS trực tiếp 2026-06-28)

- Field id: **Nhóm sản phẩm=9850, Mã sản phẩm=9720, Linh Kiện=9719, Chi tiết lỗi=9852** (đều single-select). Liên quan: Gửi linh kiện=9707, Thu hồi linh kiện=9848, Nguyên nhân=9722 (multi/elsewhere — ngoài phạm vi GĐ4 này).
- Ticket lưu **option_id**: vd ticket 498458481 → Nhóm SP=148354, Mã SP=147024, Linh kiện=149905, Chi tiết lỗi=155313.
- **Bản đồ `option_id ↔ nhãn`** đã có (user cung cấp = nội dung bảng `id_caresoft`, flat `{id,label}`). Nhóm SP có **8 giá trị**: 148349 MÁY CẦM TAY · 148350 LỌC TỔNG · 148351 MÁY LUX · 148352 MÁY NÓNG LẠNH · 148353 MÁY PI · 148354 COMBO LÕI LỌC · 155312 SẢN PHẨM KHÁC · 160248 MÁY CÔNG NGHIỆP.
- **Cascade:** "Chi tiết lỗi" có *Thuộc tính cha = Nhóm sản phẩm*; nhãn lặp theo nhóm (vd "Chỉ số PH không đạt" = 155313/155326/155339/155354/155372…). ⇒ phải biết option thuộc nhóm cha nào.
- **Thiếu trong bản đồ phẳng:** cột `parent_id` (option con thuộc Nhóm SP nào). → lấy bằng cách **đọc editor CS** (đã chốt). Đồng thời cần xác định Mã SP / Linh kiện có cascade theo Nhóm SP không (Mã SP có mã lặp → nghi cascade; xác nhận khi đọc CS).
- `id_caresoft`: anon GET trả **200 nhưng RLS lọc 0 dòng** (không phải thiếu bảng). Schema thật chưa xác nhận (paste chỉ `id,label`).

## 3. Quyết định kiến trúc

**Không dùng trực tiếp `id_caresoft`** (schema/RLS không chắc, thiếu parent). Thay vào đó **app sở hữu 1 bảng tham chiếu mới** `caresoft_field_options`, seed bởi dữ liệu ta kiểm soát (bản đồ đã có + parent đọc từ CS). Ưu điểm: cấu trúc rõ, có `parent_option_id` + `code`, bật RLS anon-read sạch, app/n8n đọc đồng nhất.

### 3.1 Bảng tham chiếu

```sql
CREATE TABLE IF NOT EXISTS public.caresoft_field_options (
  option_id         bigint PRIMARY KEY,           -- id option Caresoft (vd 148354)
  field_id          integer NOT NULL,             -- id field CS (9850/9720/9719/9852)
  field_key         text    NOT NULL,             -- khóa app: nhóm_sản_phẩm|mã_sản_phẩm|linh_kiện|chi_tiết_lỗi
  label             text    NOT NULL,
  parent_option_id  bigint,                       -- option_id Nhóm SP cha (NULL với field gốc Nhóm SP)
  code              text,                          -- mã CODE nếu có (vd FK-HYDRO11)
  sort_order        integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cfo_field_parent ON public.caresoft_field_options (field_key, parent_option_id);
ALTER TABLE public.caresoft_field_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfo_anon_read ON public.caresoft_field_options FOR SELECT TO anon USING (true);
```

`field_key` chuẩn hóa (khớp tên cột mirror): `nhóm_sản_phẩm`, `mã_sản_phẩm`, `linh_kiện`, `chi_tiết_lỗi`.

### 3.2 Lưu lựa chọn trên phiếu (app làm chủ — KHÔNG đụng Part A mirror)

Mở rộng cột JSONB `thông_tin_bổ_sung` (đã có) thêm option_id cho 4 trường:
```json
{ "mã_sản_phẩm_option_id": 147024, "nhóm_sản_phẩm_option_id": 148354,
  "linh_kiện_option_id": 149905, "chi_tiết_lỗi_option_id": 155313 }
```
- **Hiển thị:** ưu tiên nhãn resolve từ `*_option_id` (qua `caresoft_field_options`) → fallback nhãn Part A mirror (`row['mã_sản_phẩm']`…).
- **Không** ghi đè cột Part A (giữ "Caresoft thắng"); app chỉ ghi `thông_tin_bổ_sung`.

### 3.3 Cascade UX (card + modal)

- **Nhóm SP:** dropdown 8 option (`field_key='nhóm_sản_phẩm'`, `parent_option_id IS NULL`).
- **Mã SP / Chi tiết lỗi / Linh kiện:** dropdown lọc `WHERE field_key=? AND parent_option_id = <nhóm_sản_phẩm_option_id đang chọn>`. Nếu field **không** cascade (xác nhận khi đọc CS) → bỏ điều kiện parent.
- Chưa chọn Nhóm SP → khóa (disable) 3 dropdown con + gợi ý "Chọn Nhóm sản phẩm trước".
- Đổi Nhóm SP → reset 3 trường con (vì option khác nhóm).

### 3.4 Đẩy ngược (n8n outbound)

Node "Chuẩn bị" thêm đẩy option_id cho 4 field (chỉ khi có giá trị, bỏ trống → không đè):
```js
addOpt(9850, tt['nhóm_sản_phẩm_option_id']);
addOpt(9720, tt['mã_sản_phẩm_option_id']);
addOpt(9719, tt['linh_kiện_option_id']);
addOpt(9852, tt['chi_tiết_lỗi_option_id']);
// addOpt = add(id, value) với value = String(option_id)
```
⚠️ **Cần verify trên ticket thật:** CS PUT nhận `value = option_id` cho field select (kỳ vọng đúng vì ticket lưu option_id). Nếu CS đòi định dạng khác → điều chỉnh ở node n8n (không phải app).

## 4. Nguồn dữ liệu seed (Task 1 — Claude tự làm)

1. **option_id ↔ nhãn + field membership:** từ bản đồ phẳng user cung cấp. Phân đoạn theo thứ tự: mỗi dòng field-header (id nhỏ "9xxx") mở 1 field; các dòng option (id lớn) tới field kế thuộc field đó. Lọc lấy 4 field 9850/9720/9719/9852.
2. **parent_option_id:** Claude **đọc editor Caresoft** (Cấu hình → Ticket → Cập nhật từng field → duyệt từng "Giá trị thuộc tính"=Nhóm SP, ghi option nào thuộc nhóm nào). Xác nhận luôn Mã SP/Linh kiện có cascade không.
3. **code:** lấy kèm khi đọc editor nếu có (không bắt buộc cho v1).
Kết xuất: `sql/seed_caresoft_field_options.sql` (INSERT) — commit vào repo.

## 5. Bất biến / an toàn

- App chỉ ghi `xu_ly_phieu_bao_hanh` (cột `thông_tin_bổ_sung`); không đụng Part A; outbound chỉ chạy khi `trạng_thái_đồng_bộ='pending'`.
- `caresoft_field_options` chỉ anon **đọc** (không cho ghi từ client).
- Bỏ trống option_id → n8n KHÔNG gửi field đó (không xóa giá trị CS).

## 6. Ngoài phạm vi (YAGNI)

- Không đụng các field multi-select (Gửi/Thu hồi linh kiện, Chi tiết công việc) — GĐ sau.
- Không tự refresh `caresoft_field_options` từ CS định kỳ (seed tĩnh; cập nhật thủ công khi CS đổi option).
- Không sửa cơ chế inbound.

## 6b. CHỐT LẠI (cập nhật 2026-06-28 sau khi có dữ liệu thật)

Khảo sát dữ liệu thật (dump `docs/n8n/caresoft_options_dump.json` + quét 6097 ticket CS API) đổi vài giả định:

- **Kiểu field (từ CS API `custom_fields[].type`):** Nhóm SP=Single, Mã SP=Single, **Linh Kiện=MULTIPLE (multi-select, value `,id,id,`)**, Chi tiết lỗi=Single.
- **Độ trùng nhãn (quyết định cần cascade hay không):** Nhóm SP 8 nhãn (0 trùng) · Mã SP 96 nhãn (8 trùng) · Chi tiết lỗi 74 nhãn (26 trùng) · Linh kiện 300 nhãn (50 trùng).
- ⇒ **Chỉ cần cascade cho Chi tiết lỗi + Linh kiện** (nhãn trùng nhiều). **Nhóm SP + Mã SP để dropdown PHẲNG** (single), không lọc theo nhóm. (Mã SP có 8 mã lặp — chấp nhận hiện 2 dòng, vẫn là mã đúng.)
- **Bỏ bảng Supabase** → dùng **file nhúng `src/data/caresoftFieldOptions.json`** (đã sinh, 646 option, schema `{option_id, field_id, field_key, label, parent_option_id}`). **KHÔNG cần chạy SQL nào.**
- **parent_option_id** suy từ ticket thật (co-occurrence Nhóm SP↔con). Phủ: Mã SP 46/105, Chi tiết lỗi 66/141, Linh kiện 111/392 — **đây là các tổ hợp ĐÃ TỪNG xảy ra** (mỗi nhóm hiện đúng lỗi/linh kiện thực tế). Option `parent_option_id=null` (chưa từng dùng) → gom mục **"Khác"** trong dropdown cascade để vẫn chọn được.

### Meta field (app) — CHỐT theo config CS thật (`field_value_id`)
```js
OPTION_FIELDS = {
  'nhóm_sản_phẩm': { fieldId: 9850, multi: false, cascade: false, parentKey: null },
  'mã_sản_phẩm':   { fieldId: 9720, multi: false, cascade: false, parentKey: null },
  'chi_tiết_lỗi':  { fieldId: 9852, multi: false, cascade: true,  parentKey: 'nhóm_sản_phẩm' },
  'linh_kiện':     { fieldId: 9719, multi: true,  cascade: true,  parentKey: 'mã_sản_phẩm' }, // ← Mã SP (máy), KHÔNG phải Nhóm SP
}
```
**parent_option_id phủ 100%** (mỗi option có sẵn `field_value_id` từ config CS). Bỏ mục "Khác"/fallback — mọi option đều có cha hợp lệ (sanity: 0 lệch). Dữ liệu đã sinh: `src/data/caresoftFieldOptions.json` (646 option).

### Lưu trên phiếu (`thông_tin_bổ_sung`)
- Single (nhóm_sản_phẩm, mã_sản_phẩm, chi_tiết_lỗi): `<key>_option_id` = 1 số.
- Multi (linh_kiện): `linh_kiện_option_ids` = mảng số `[149905, ...]`.
- Kèm nhãn `<key>` để hiển thị/đưa vào comment.

### n8n outbound
- Single: `addOpt(fieldId, optionId)` (value = option_id).
- Multi (9719): value = `,id,id,` (CS lưu multi dạng comma, có dấu phẩy đầu/cuối).

## 7. Kiểm thử

- **Unit (`warrantyProcessing.test.js`):** helper `optionsFor(list, fieldKey, parentId)` lọc đúng theo field + parent; `resolveOptionLabel(list, optionId)`.
- **Thủ công:** chọn Nhóm SP → con lọc đúng; lưu → `thông_tin_bổ_sung.*_option_id` đúng; mở lại giữ; Đồng bộ → kiểm ticket CS đổi đúng option (verify key/format option_id).
