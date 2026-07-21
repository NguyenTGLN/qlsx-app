# Module KPI — phân hệ Công việc

**Ngày:** 2026-07-21
**Nguồn nghiệp vụ:** `KPI/Copy of KPI kho 06.2026.xls` (16 sheet, mỗi sheet 1 nhân viên)

## 1. Mục tiêu

1. Nhân viên xem KPI đến thời điểm hiện tại: tổng điểm, chỉ tiêu nào đang mất điểm, lịch sử cộng/trừ điểm.
2. Quản lý chấm nhanh các chỉ tiêu thủ công ngay trên app.
3. Bảng chỉ tiêu của từng nhân viên sửa được ngay trên app.
4. Mọi con số bấm vào đều hiện diễn giải cách tính + bằng chứng (nhật ký, đính kèm).
5. Điểm công khai toàn bộ: ai cũng xem được bảng KPI + nhật ký của bất kỳ ai (quyết định của chủ app — văn hoá công ty vốn dán bảng KPI công khai).
6. In + xuất Excel đúng bố cục bảng cũ để chuyển bộ phận khác.
7. Thiết kế mở sẵn đường cho mục tiêu dài hạn: chấm tự động 100% từ dữ liệu app.

**Ngoài phạm vi Phase 1:** nối chấm tự động từ dữ liệu app (deadline công việc, đơn bảo hành…). Phase 1 chỉ chừa chỗ cắm (`nguon`, `ref_id`, `cach_cham='TU_DONG'`).

## 2. Phát hiện nghiệp vụ từ file Excel (căn cứ thiết kế)

- **Công thức tính GIỐNG NHAU ở cả 16 sheet.** Khác nhau chỉ là danh sách chỉ tiêu + trọng số. → 1 engine duy nhất + bảng chỉ tiêu riêng từng người.
- Công thức: `tỉ lệ đạt = điểm đạt / chỉ tiêu` (trần 100%), `điểm quy đổi = tỉ lệ × trọng số`, `tổng KPI = Σ quy đổi` (Σ trọng số = 100), `điểm mất = trọng số − quy đổi`.
- **Chỉ tiêu cấp bộ phận** (CHUYÊN CẦN BỘ PHẬN, HOTLINE CẢ TEAM BH): chấm 1 lần cho cả bộ phận, mỗi người quy đổi theo trọng số riêng. Trong Excel là công thức nối chéo sheet.
- Σ trọng số cả 14 sheet hiện hành đều đúng 100 (đã kiểm bằng script).
- 2 sheet `KPI T9 - BH - NB Ngọc`, `KPI T12 - KTSX` là bản cũ T12/2023 → bỏ qua khi import.

## 3. Quyết định thiết kế (đã chốt với chủ app)

| Quyết định | Lựa chọn |
|---|---|
| Quản lý bảng chỉ tiêu | Riêng từng nhân viên, sửa trong app (không dùng mẫu theo vị trí) |
| Cơ chế chấm | Lai: nhật ký cộng/trừ điểm tự tính + quản lý ghi đè điểm chốt cho chỉ tiêu định tính |
| Luồng chấm | 2 cột: NV tự chấm + điểm chốt (bỏ 2 cột duyệt/thực đạt vì trong Excel luôn bằng nhau) |
| Mức công khai | Toàn bộ: điểm + chi tiết + nhật ký của mọi người, ai cũng xem được |
| Lưu trữ | Phương án A: chỉ tiêu nhân bản theo kỳ, 2 bảng |
| Phạm vi P1 | Import Excel + xem + chấm + sửa chỉ tiêu + xuất Excel/in. Chưa nối tự động |

## 4. Mô hình dữ liệu

```sql
-- Mỗi kỳ (tháng) mỗi nhân viên một bộ dòng riêng. Sang kỳ mới = copy bộ kỳ trước
-- (INSERT...SELECT). Kỳ cũ bất biến → tra soát lịch sử được.
create table kpi_chi_tieu (
  id            uuid primary key default gen_random_uuid(),
  ky            text not null,            -- '2026-06'
  cap_do        text not null default 'CA_NHAN',  -- 'CA_NHAN' | 'BO_PHAN'
  nhan_vien_id  text,                     -- null khi cap_do='BO_PHAN'
  lien_ket_bo_phan text,                  -- khoá nhóm chấm chung, vd 'CHUYEN_CAN_KHO'
  nhom          text,                     -- 'A. THỰC HIỆN NỘI QUY'
  thu_tu        int not null,
  ten           text not null,            -- 'CHUYÊN CẦN CÁ NHÂN'
  mo_ta         text,                     -- nguyên văn quy định trừ điểm
  chi_tieu      numeric,                  -- G: điểm tối đa. null = dòng thưởng ngoài trọng số
  trong_so      numeric not null default 0, -- H
  cach_cham     text not null default 'NHAT_KY', -- 'NHAT_KY' | 'THU_CONG' | 'TU_DONG' (P2)
  diem_tu_cham  numeric,                  -- NV tự chấm
  diem_chot     numeric,                  -- quản lý chốt tay; null = để nhật ký tự tính
  chot_boi      text,                     -- ai chốt, lúc nào — hiện trong popup diễn giải
  chot_luc      timestamptz,
  created_at    timestamptz default now()
);

-- Nhật ký CÓ DẤU: âm = trừ, dương = cộng. Mọi biến động điểm đều có bằng chứng ở đây.
create table kpi_nhat_ky (
  id           uuid primary key default gen_random_uuid(),
  chi_tieu_id  uuid not null references kpi_chi_tieu(id) on delete cascade,
  ngay         date not null,
  so_diem      numeric not null,          -- -1, -3, +0.5...
  ly_do        text not null,
  dinh_kem     jsonb,                     -- cùng định dạng attachments của cong_viec_duoc_giao
  nguoi_ghi    text,
  nguon        text not null default 'TAY', -- 'TAY' | 'TU_DONG'
  ref_id       text,                      -- id bản ghi gốc khi nguon='TU_DONG' (vd 'CV-123')
  created_at   timestamptz default now()
);
```

**Liên kết chỉ tiêu bộ phận** — không cần đụng bảng `nhan_vien` (bảng này chỉ có `id, name, password, role, avatar, permissions`, không có cột bộ phận):

- Dòng chấm chung: `cap_do='BO_PHAN'`, `nhan_vien_id=null`, `lien_ket_bo_phan='CHUYEN_CAN_KHO'`, `trong_so=0`.
- Dòng của từng nhân viên: `cap_do='CA_NHAN'`, `lien_ket_bo_phan='CHUYEN_CAN_KHO'`, `trong_so` riêng của người đó.

Engine thấy `lien_ket_bo_phan` khác null thì lấy **điểm đạt** từ dòng `BO_PHAN` cùng `(ky, lien_ket_bo_phan)`, còn **trọng số** vẫn của dòng cá nhân. Chấm 1 lần → cả nhóm tự cập nhật. `lien_ket_bo_phan = null` nghĩa là chỉ tiêu cá nhân thuần.

RLS: theo nếp `security_3_rls_lockdown.sql`. Đọc: mọi user đăng nhập (công khai toàn bộ). Ghi: theo cap của tab (`edit` cho nhật ký + điểm chốt, `create` cho bảng chỉ tiêu).

## 5. Engine tính điểm — `src/lib/kpiEngine.js`

Hàm thuần, không đụng DB (theo nếp `productionAlloc.js`, `capacityGuard.js`).

```
diemDat(ct, logs, bpMap):
  ct.lien_ket_bo_phan → lấy diemDat của dòng BO_PHAN tương ứng trong bpMap
  ct.diem_chot != null → diem_chot
  ngược lại            → clamp(ct.chi_tieu + Σ logs.so_diem, 0, ct.chi_tieu)
  (logs âm là trừ; log dương trên chỉ tiêu thường bị trần bởi chi_tieu)

tiLeDat    = chi_tieu > 0 ? min(1, diemDat/chi_tieu) : null
diemQuyDoi = chi_tieu > 0 ? tiLeDat * trong_so : Σ logs.so_diem  -- dòng thưởng ngoài trọng số
diemMat    = chi_tieu > 0 ? trong_so - diemQuyDoi : 0
tongKPI    = Σ diemQuyDoi   -- có thể vượt 100 nhờ dòng thưởng

kiemTraTrongSo(list) → cảnh báo khi Σ trong_so (các dòng chi_tieu>0) ≠ 100
giaiThich(ct, logs)  → cấu trúc từng bước tính, cho popup diễn giải
```

Ví dụ đối chiếu thật (Bích, T6/2026): chuyên cần cá nhân 3/10×7=2.1, chuyên cần bộ phận 0/10×5=0, cải tiến 0/2×4=0, còn lại đủ → **tổng 86.1**, mất 13.9.

## 6. Giao diện — tab "KPI" trong TaskApp

2 màn hình, mobile-first (công nhân xem bằng điện thoại):

**① Danh sách nhân viên** — chọn kỳ (tháng) ở đầu trang; lưới thẻ: tên, vị trí, điểm hiện tại, mũi tên so kỳ trước, chỉ tiêu mất điểm nặng nhất. Ai cũng thấy tất cả.

**② Bảng KPI một người** — một bảng duy nhất cho mọi vai trò; quyền tới đâu hiện nút tới đó:

- Đầu trang: tổng điểm to, thanh tiến độ, hạng trong team.
- Khối "Đang mất điểm": các dòng `diemMat > 0` xếp giảm dần, bung ra thấy nhật ký từng lần.
- Khối chỉ tiêu bộ phận tách riêng, ghi rõ "chấm chung cả bộ phận".
- **Bấm vào bất kỳ con số nào → popup diễn giải**: từng bước tính (điểm đạt → tỉ lệ → quy đổi), ai chốt/lúc nào nếu chốt tay, nhật ký với đính kèm. Tổng điểm bấm vào → bảng cộng từng dòng.
- Có `edit`: mỗi dòng thêm nút "± Ghi điểm" (ngày, số điểm ±, lý do, đính kèm — dùng `AttachmentInput` sẵn có) và ô điểm chốt. NV tự chấm điểm của chính mình vào `diem_tu_cham`.
- Có `create`: nút "Sửa bảng chỉ tiêu" bật chế độ sửa ngay trên bảng — thêm/xoá/sửa dòng, đổi thứ tự, đổi trọng số; **cảnh báo đỏ cố định khi Σ trọng số ≠ 100**. Nút "Tạo kỳ mới" copy bảng kỳ trước.
- Có `io`: nút xuất Excel (1 người hoặc cả team, bố cục giống file cũ, bằng `exceljs`) + nút In (print component theo nếp `WarehouseReceiptPrint`).

### Phân quyền — `permRegistry.js`, module `tasks`

```js
{ id: 'kpi', label: 'KPI', caps: ['view', 'create', 'edit', 'io'] }
// view   = xem mọi người (công khai)
// edit   = ghi nhật ký ± điểm, chốt điểm
// create = sửa bảng chỉ tiêu, tạo kỳ mới
// io     = xuất Excel / in
```

Không thêm cap mới vào `ALL_CAPS` — 4 cap sẵn có đủ dùng.

## 7. Import Excel lần đầu

Script chạy 1 lần `scripts/import-kpi-excel.mjs`: đọc `.xls` → sinh `sql/seed_kpi_2026_06.sql` để người đọc soát rồi tự chạy (không ghi thẳng DB — dữ liệu gắn lương thưởng).

Các ca đặc biệt đã khảo sát:

| # | Ca | Xử lý |
|---|---|---|
| 1 | Hàng tiêu đề ở dòng 8/9/10 tuỳ sheet | Dò ô `"Chỉ tiêu KPI"`, không hardcode dòng |
| 2 | 2 sheet cũ T12/2023 | Bỏ qua, ghi log |
| 3 | Dòng "CỘNG THÊM NGOÀI TRỌNG SỐ" không có G/H | `chi_tieu = null` (dòng thưởng), không chia 0 |
| 4 | STT gốc trùng/nhảy (Nguyên: 6 hai lần, nhảy 13) | Bỏ STT gốc, đánh `thu_tu` theo thứ tự dòng |
| 5 | Dòng nhóm (A./B./C.) không có điểm | Thành giá trị cột `nhom` cho các dòng dưới |
| 6 | Cột M lúc lấy K lúc lấy L | Engine một nguồn duy nhất |
| 7 | "Tối đa 100%" ghi ở tiêu đề nhưng công thức không chặn | Engine chặn `min(1,…)` |
| 8 | `#REF!` sót | Bỏ qua, ghi log |
| 9 | Tên sheet ≠ tên NV (`HĨU`, `NGUYÊN ` thừa cách, tiền tố `CHĂM SÓC KHÁCH HÀNG - `) | **Bảng ánh xạ khai tay** sheet → `nhan_vien.id` ngay đầu script; sheet không có trong map → dừng, không đoán |
| 10 | Chỉ tiêu bộ phận (tên chứa `BỘ PHẬN`/`CẢ TEAM`) | Sinh 1 dòng `BO_PHAN`/nhóm + set `lien_ket_bo_phan` ở dòng cá nhân |

Import cột điểm: `K` (KPI duyệt) → `diem_chot`, `I` → `diem_tu_cham`, ghi chú cột O → 1 dòng `kpi_nhat_ky` mô tả (điểm 0, chỉ để giữ bằng chứng chữ) — kỳ T6 là kỳ đã chấm xong, vào app ở trạng thái đã chốt.

## 8. Kiểm thử — `src/lib/kpiEngine.test.js` (vitest)

- Bích T6/2026 ra đúng **86.1** (đối chiếu Excel thật).
- Trần 100%: điểm đạt vượt chỉ tiêu → tỉ lệ vẫn 1.
- Sàn 0: trừ 15 trên chỉ tiêu 10 → 0, không âm.
- `diem_chot` ghi đè nhật ký.
- Chỉ tiêu bộ phận: 1 điểm đạt, 2 người 2 trọng số → 2 quy đổi khác nhau.
- Dòng thưởng (`chi_tieu=null`): cộng thẳng, tổng vượt 100 được.
- Σ trọng số ≠ 100 → `kiemTraTrongSo` trả cảnh báo.
- `giaiThich` trả đủ các bước cho popup.

Test import: chạy script trên file thật, kiểm số dòng sinh ra + Σ trọng số từng người = 100.

## 9. Hướng Phase 2 (không làm bây giờ)

Mỗi luật tự động = 1 nguồn chèn dòng `kpi_nhat_ky (nguon='TU_DONG', ref_id=…)`:
- Công việc trễ deadline (`cong_viec_duoc_giao`) → chỉ tiêu DEADLINE.
- Đơn bảo hành bỏ sót → chỉ tiêu HOÀN THÀNH ĐƠN BH.
- KPI CSKH Zalo (tab `zalo_kpi` sẵn có) → chỉ tiêu tỉ lệ trả lời.

Chỉ tiêu chuyển auto: đổi `cach_cham='TU_DONG'` → UI khoá nhập tay, tránh chấm chồng. Không sửa schema, engine, màn hình.

## 10. Câu hỏi mở

1. ~~Sheet BÍCH dòng 24 có công thức `=SUM(...)/2` (chia đôi tổng)~~ — **Đã chốt (21/07/2026): công thức cũ sót, KHÔNG chia đôi.** Bích tính giống mọi nhân viên khác; import bỏ qua dòng này. Engine không có luật chia đôi.
2. ~~`nhan_vien` đã có cột bộ phận chưa~~ — **Đã kiểm (21/07/2026): không có, và không cần.** Chỉ tiêu bộ phận liên kết qua khoá nhóm `lien_ket_bo_phan` đặt trên chính dòng chỉ tiêu, không đụng bảng `nhan_vien`.
