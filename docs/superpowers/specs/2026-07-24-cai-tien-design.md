# Trang "Cải tiến" (Kaizen) — phân hệ Công việc

**Ngày:** 2026-07-24 · **Trạng thái:** Đã duyệt (user xác nhận mockup + phương án đề xuất)
**Mockup:** `docs/mockups/cai-tien-ui-mockup.html`

## Mục tiêu

Nhân viên tự đăng đóng góp cải tiến (làm gì, trước ra sao, sau được gì) kèm ảnh/video
trong dưới 2 phút trên điện thoại. App **tự quy đổi giá trị làm lợi thành tiền** theo
loại cải tiến để chủ app có cơ sở khách quan đánh giá, xếp hạng và vinh danh.

## Quyết định đã chốt

1. **Feed mở**: mọi người xem được cải tiến của nhau (lan tỏa, học hỏi). Nút 👍 ủng hộ.
2. **Đánh giá**: quản lý chấm 5 tiêu chí có trọng số → tổng 100 điểm → tự xếp loại A/B/C.
3. **Thưởng**: chỉ xếp hạng + vinh danh trong app; thưởng tiền xử lý ngoài app (ngoài phạm vi).
4. **Cấu hình mặc định**: đơn giá giờ công 35.000 đ/giờ · 26 ngày công/tháng ·
   chi phí 1 SP lỗi 180.000 đ. Admin sửa trong bảng cấu hình, không hard-code.

## 8 loại cải tiến & cách tính giá trị

Engine thuần: `src/lib/caiTienValue.js` (unit test đầy đủ, theo pattern `kpiTuDong.js`).
Mọi hàm nhận `config` (từ bảng `cai_tien_config`) — không đọc DB, không side effect.

| Loại (key)            | Số liệu nhập                                          | Công thức tiền/tháng                                  |
|-----------------------|-------------------------------------------------------|--------------------------------------------------------|
| `nang_suat` ⚡        | phút/SP trước, sau; SL/ngày                            | (trước−sau)×SL×ngày_công÷60 × đơn_giá_giờ              |
| `chat_luong` 🎯       | % lỗi trước, sau; SL/tháng; chi phí 1 lỗi              | (%trước−%sau)×SL × chi_phí_lỗi                          |
| `chi_phi` 💰          | chi phí trước, sau (đ/tháng)                           | trước − sau                                             |
| `rui_ro` 🛡️           | khả năng (1-5), mức độ (1-5) trước/sau; thiệt hại ước tính (đ); xác suất xảy ra/năm | thiệt_hại×xác_suất×(điểm_trước−điểm_sau)÷điểm_trước÷12 |
| `don_gian_hoa` 🧩     | giờ đào tạo trước/sau; số người/năm; + phút tiết kiệm/ngày (tùy chọn) | (giờ_trước−giờ_sau)×người÷12×đơn_giá + phần thời gian |
| `quy_trinh` 🔄        | phút tiết kiệm/ngày cho khu vực; số người hưởng lợi    | phút×người×ngày_công÷60 × đơn_giá_giờ                   |
| `5s` 🧹               | như quy_trinh (phút tìm kiếm/di chuyển tiết kiệm)      | như quy_trinh                                           |
| `moi_truong` 🌿       | như quy_trinh (tùy chọn, có thể 0)                     | như quy_trinh; giá trị 0 vẫn hợp lệ (định tính)         |

- Kết quả tính: `{ gio_thang, tien_thang, tien_nam, dien_giai }` (diễn giải chuỗi tiếng Việt).
- Luôn có lối thoát **"chưa đo được số liệu"** (`metrics.chua_do = true`) → giá trị 0,
  quản lý nhập số liệu thay khi duyệt (form sửa metrics trong màn duyệt).
- Số âm/thiếu → coi là 0, không bao giờ NaN/negative (test chốt).

## Chấm điểm & xếp loại

5 tiêu chí, mỗi tiêu chí 1–5 chấm, trọng số mặc định (admin sửa trong config):

- Giá trị làm lợi **40%** · Sáng tạo **20%** · Khả năng nhân rộng **20%** ·
  Nỗ lực thực hiện **10%** · Bằng chứng đầy đủ **10%**

`tongDiem = Σ(chấm_i/5 × trọng_số_i) × 100` → **A ≥ 80 · B ≥ 60 · C ≥ 40 · GHI_NHAN < 40**.
Hàm `chamDiem(scores, weights)` nằm trong engine, có test.

## Vòng đời trạng thái

`NHAP` (lưu nháp, chỉ tác giả thấy) → `CHO_DUYET` (gửi) → `DA_DUYET` (kèm điểm + loại)
| `CAN_BO_SUNG` (trả lại kèm ghi chú, nhân viên sửa gửi lại → `CHO_DUYET`) | `TU_CHOI`.
Sau duyệt admin có thể bật cờ `nhan_rong` (nhân rộng toàn nhà máy — hiện badge 🚀).
(Trạng thái NHAP thêm theo yêu cầu chủ app 24/07 đợt 2 — ban đầu bỏ vì YAGNI.)

## Dữ liệu (sql/create_cai_tien.sql — idempotent)

```
cai_tien (
  id bigserial PK,
  nhan_vien_id text NOT NULL references nhan_vien(id) on delete cascade,
  title text NOT NULL,
  category text NOT NULL,                 -- 8 key ở trên
  status text NOT NULL default 'CHO_DUYET',
  before_text text, after_text text,
  attachments_before jsonb default '[]',  -- format giống task attachments
  attachments_after  jsonb default '[]',
  metrics jsonb default '{}',             -- số liệu nhập theo loại
  computed jsonb default '{}',            -- {gio_thang,tien_thang,tien_nam,dien_giai} — chốt lúc gửi/duyệt
  likes jsonb default '[]',               -- mảng nv_id đã 👍
  score jsonb,                            -- {gia_tri,sang_tao,nhan_rong,no_luc,bang_chung} 1-5
  tong_diem numeric, xep_loai text,       -- A/B/C/GHI_NHAN
  nhan_rong boolean default false,
  reviewer_id text, review_note text,
  created_at timestamptz default now(), reviewed_at timestamptz
)
cai_tien_config (id=1 duy nhất, don_gia_gio, ngay_cong_thang, chi_phi_loi,
                 trong_so jsonb, nguong jsonb)
```

RLS (theo pattern `create_chuyen_can_ngoai_le.sql`, claim `nv_id`/`nv_role`):

- SELECT: mọi authenticated (feed mở).
- INSERT: `nv_id` trong JWT = `nhan_vien_id` (chỉ đăng bài của mình).
- UPDATE: tác giả khi `status in (CHO_DUYET, CAN_BO_SUNG)` **chỉ nội dung**; ADMIN mọi lúc
  (chấm điểm, duyệt). Like: mọi authenticated được update cột likes — chấp nhận đánh đổi
  RLS cột không chặn được chi tiết (như KPI công khai hiện tại), giao diện là lớp chặn chính.
- DELETE: tác giả khi chưa duyệt, hoặc ADMIN.
- Cảnh báo quen thuộc: chạy lại `security_3_rls_lockdown.sql` sẽ đè policy → phải chạy lại file này.

Ảnh/video: dùng lại bucket `task-attachments`, folder `cai-tien/`, component `AttachmentInput`.

## UI — `src/pages/tasks/CaiTienTab.jsx`

Tab mới trong TaskApp (`props: {me, users, perm}`), 3 view con + 1 modal:

1. **Feed** (mặc định): 3 ô thống kê tháng (số CT, tổng giá trị đã duyệt, của tôi) ·
   chip lọc (Tất cả/Chờ duyệt/Đã duyệt/Của tôi/theo loại) · card: avatar+tên, tiêu đề,
   chip loại, ảnh TRƯỚC/SAU cạnh nhau (bấm mở lightbox qua AttachmentList), badge tiền
   xanh, trạng thái, 👍. FAB "+" mở wizard. Lọc kỳ theo tháng (`created_at`).
2. **Wizard gửi** (modal 3 bước như mockup): ① grid 8 loại ② tiêu đề + 2 ô trước/sau +
   AttachmentInput ③ form số liệu động theo loại, ô kết quả gradient tính realtime bằng
   engine, toggle "chưa đo được". Sửa bài `CAN_BO_SUNG` mở lại đúng wizard với dữ liệu cũ.
3. **Chi tiết + duyệt** (modal): nội dung đầy đủ; khu chấm điểm 5 hàng chấm tròn 1–5
   (chỉ admin/`perm.edit`), tổng điểm + xếp loại tự tính realtime, ô ghi chú;
   nút Duyệt / Cần bổ sung / Từ chối; admin sửa được metrics trước khi duyệt.
4. **Xếp hạng** (view con, nút chuyển trên đầu feed): podium top 3 + danh sách theo
   tổng `tien_nam` đã duyệt · bảng theo bộ phận (nhóm theo `users[].department` nếu có,
   không có thì ẩn khối) · kỳ Tháng/Quý/Năm.

Quyền (PERM_REGISTRY, module tasks, tab `cai_tien`):
- `view` = xem feed + xếp hạng · `create` = gửi cải tiến (mặc định nên bật cho mọi NV) ·
  `edit` = chấm điểm/duyệt/từ chối/nhân rộng (quản lý). ADMIN mặc định full.

## Xử lý lỗi & hiệu năng

- Bảng chưa tạo trên Supabase → tab hiện hộp cảnh báo "chạy sql/create_cai_tien.sql"
  (pattern tải-mềm của ChamCongTab), không vỡ module.
- `fetchAllRows` + `.order('id')` khi tải danh sách; feed lọc theo kỳ tháng để nhẹ.
- Upload ảnh dùng cơ chế sẵn có (upload ngay khi chọn, dọn file khi hủy — `deleteRemoved`).

## Kiểm thử

- `caiTienValue.test.js`: từng loại công thức (case chuẩn + biên: 0, âm, thiếu trường,
  chua_do), chấm điểm + ngưỡng xếp loại, format tiền diễn giải.
- UI kiểm tra tay qua dev server (login admin Nguyên): gửi 1 cải tiến năng suất, thấy
  tiền realtime, duyệt + chấm điểm, thấy xếp hạng. Build `npm run build` sạch.

## Cập nhật đợt 2 (24/07/2026, chủ app yêu cầu)

1. **Lưu nháp**: wizard có 2 nút — "💾 Lưu nháp" (status `NHAP`, chỉ tác giả thấy kể cả
   với admin, không đếm vào thống kê phong trào) và "📤 Gửi duyệt". Nháp mở lại sửa tiếp
   hoặc gửi duyệt từ màn chi tiết. Bài `CAN_BO_SUNG` không lùi về nháp được (giữ lời nhắn
   của quản lý trong luồng duyệt). SQL: `sql/them_nhap_va_kpi_cai_tien.sql`.
2. **KPI tự động — chỉ tiêu `DONG_GOP_CAI_TIEN`** (`kpiTuDong.js/luatDongGopCaiTien`):
   đếm bài `DA_DUYET` theo **tháng của mốc duyệt** (`reviewed_at`), tối thiểu **2 bài/tháng**
   (chép từ mô tả chỉ tiêu gốc) → tiLe = min(1, đã duyệt/2). Bài chờ duyệt chỉ nêu trong
   ghi chú, không cộng điểm. Kỳ < 2026-07 hoặc không nối được nguồn dữ liệu → KHÔNG chấm
   (giữ điểm tay cũ). Chỉ tiêu đánh dấu `cach_cham='TU_DONG'` để khóa chấm tay.

## Ngoài phạm vi (đợt sau nếu cần)

- Thông báo Zalo/n8n khi có bài mới hoặc đạt loại A.
- Huy hiệu gamification, chiếu TV Dashboard.
- Đề xuất thưởng tiền theo % giá trị.
