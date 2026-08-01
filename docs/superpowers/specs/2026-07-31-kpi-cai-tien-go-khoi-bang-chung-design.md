# KPI ĐÓNG GÓP CẢI TIẾN — gỡ khỏi Bảng chấm chung, chỉ lấy điểm từ tab Cải tiến

> Ngày: 2026-07-31 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Liên quan: [bảng chấm chung](2026-07-23-kpi-bang-cham-chung-design.md), [cải tiến](2026-07-24-cai-tien-design.md), `src/lib/kpiTuDong.js`, `src/pages/tasks/KpiBangChung.jsx`

## Mục tiêu

Điểm KPI chỉ tiêu **ĐÓNG GÓP CẢI TIẾN** của nhân viên chỉ được lấy từ **bài cải tiến đã gửi và
được duyệt** (bảng `cai_tien`, tab Cải tiến). Không còn đường nào chấm tay con số đó ở màn hình
**Bảng chấm chung** nữa.

## Bối cảnh — đã đo trên DB thật, không suy luận

Luật chấm tự động **đã có sẵn và đang chạy đúng**: `luatDongGopCaiTien`
(`src/lib/kpiTuDong.js:403`) đếm bài `DA_DUYET` theo mốc **duyệt** (`reviewed_at`), tối thiểu
2 bài/tháng, và **đè lên** `diem_chot` chấm tay mỗi lần mở màn hình.

Nên vấn đề thật **không phải** "điểm lấy sai nguồn", mà là **màn hình vẫn mời người ta chấm tay
một con số sẽ bị vứt đi**:

| Đã đo (Supabase, 31/07/2026) | Kết quả |
|---|---|
| `DONG_GOP_CAI_TIEN` kỳ 2026-07 | `cham_chung = true`, 13 dòng cá nhân → hiện trong Bảng chấm chung với 13 ô nhập **mở** |
| `DONG_GOP_CAI_TIEN` kỳ 2026-06 | `cham_chung = false` — không dính |
| `cach_cham` | `TU_DONG` ở cả hai kỳ (do `sql/them_nhap_va_kpi_cai_tien.sql`) |
| `lien_ket_bo_phan` | `null` cả 13 dòng → luật tự động **chắc chắn có chạy**, không bị nhánh bỏ qua ở `kpiTuDong.js:491` |
| Dấu vết chấm tay | 13/13 dòng có `chot_boi = 'Nguyên'`, `diem_chot = 0` |
| Bảng `cai_tien` | Đúng **1 bài**, `status = CHO_DUYET`, chưa duyệt bài nào |

Nguyên nhân trong mã: **`KpiBangChung.jsx` không hề kiểm `cach_cham`**. Ô nhập mở bất cứ khi nào
`perm.edit` bật (`KpiBangChung.jsx:188`). Trong khi đó tab KPI cá nhân **có** kiểm và khoá đúng
(`KpiTab.jsx:1064` — "Chỉ tiêu này tính tự động… Không chấm tay được"). Hai màn hình lệch luật nhau.

Hệ quả: người chấm gõ điểm vào Bảng chấm chung → ghi xuống DB thật → lúc hiển thị luật tự động
đè lại. Số vừa gõ biến mất mà không có thông báo nào.

## Ngoài phạm vi (không làm lần này)

- **Không** đổi cách tính điểm cải tiến. Giữ nguyên luật đếm số bài đã duyệt / tối thiểu 2 bài
  (chủ app chốt 31/07/2026 — không chuyển sang tính theo xếp loại A/B/C hay `tong_diem`).
- **Không** đụng 4 chỉ tiêu chấm tay còn lại trong bảng chung (`5S`, `CHAM_KPI`,
  `QUY_DINH_CONG_TY`, `VAN_HOA_CONG_TY`) — đã kiểm: cả 4 đều `cach_cham = 'THU_CONG'`, nên
  thay đổi ở phần B **không chạm** tới chúng.
- **Không** xoá `diem_chot` / `chot_boi` đang có trong DB (lý do ở phần A).
- **Không** đụng RLS, policy, Storage hay luồng đăng nhập.

---

## A. Dữ liệu — `sql/go_cai_tien_khoi_bang_chung.sql`

File mới, chạy tay trên Supabase SQL Editor, chạy lại nhiều lần đều an toàn.

```sql
begin;

update kpi_chi_tieu
set cham_chung = false
where ma = 'DONG_GOP_CAI_TIEN'
  and cham_chung;

commit;
```

**Áp cho MỌI kỳ, không riêng 2026-07.** Hàm `tao_ky_kpi` (`sql/them_ma_va_cham_chung_kpi.sql:98`)
copy cột `cham_chung` sang kỳ mới. Chặn ở một kỳ thì tháng sau chỉ tiêu quay lại bảng chung,
không có lỗi nào báo.

**Giữ nguyên `diem_chot = 0` và `chot_boi`, KHÔNG xoá.** Đây là quyết định có chủ đích:
khi bảng `cai_tien` lỗi tải, `KpiTab.jsx:194` đặt `caiTien = null` → luật trả `tiLe = null` →
`apDungChamTuDong` bỏ qua, rơi về `diem_chot` trong DB. Số `0` là giá trị an toàn. Đặt `null`
thì engine coi là **đạt đủ điểm** (`KpiBangChung.jsx:140-141`) — tức một lỗi mạng sẽ hoá thành
2/2 điểm cho cả 13 người.

## B. Mã nguồn — `src/pages/tasks/KpiBangChung.jsx`

Ba thay đổi, tất cả nhắm vào **mọi chỉ tiêu `cach_cham === 'TU_DONG'`** chứ không hard-code
riêng `DONG_GOP_CAI_TIEN` — để lần sau ai đó thêm nhầm một chỉ tiêu tự động khác vào bảng chung
thì bẫy không tái diễn.

1. **Ô chỉ đọc.** Trong `OChamDiem`, chỉ tiêu `TU_DONG` → `disabled`, nền xám, `title` giải
   thích "Tính tự động từ tab Cải tiến — không chấm tay được". Không gọi `ghiOChamChung`.
2. **Ẩn nút "＋ ghi lý do"** ở ô đó. Lý do đã nằm sẵn trong ghi chú của dòng ảo do
   `apDungChamTuDong` sinh ra; thêm một ô lý do thứ hai là hai chỗ nói cùng một chuyện.
3. **Lọc popup "＋ Thêm chỉ tiêu"** (`dsChiTieuThemDuoc` trong `src/lib/kpiBangChung.js`) bỏ
   chỉ tiêu `cach_cham === 'TU_DONG'` → không thêm nhầm lại được từ giao diện.

**Đã kiểm điều kiện cần**: `rows` lấy bằng `select('*')` (`KpiTab.jsx:77`) nên **có** cột
`cach_cham`; `apDungChamTuDong` trả `{ ...r }` nên `rowsTD` giữ nguyên cột đó; `dungMaTran` đặt
thẳng object dòng vào `o[]` nên `OChamDiem` đọc được `ct.cach_cham`. Không cần sửa câu truy vấn.

## C. Test

Bổ sung vào `src/lib/kpiBangChung.test.js`: `dsChiTieuThemDuoc` **không** trả về dòng có
`cach_cham = 'TU_DONG'`, và vẫn trả đủ các dòng `THU_CONG` như trước.

---

## Người dùng sẽ thấy khác đi thế nào

- **Bảng chấm chung kỳ 07/2026: 5 dòng còn 4.** ĐÓNG GÓP CẢI TIẾN biến mất khỏi màn hình đó.
- **Điểm KPI của 13 người: không đổi.** Hiện đã là 0 vì luật tự động đã đè sẵn từ trước.
- Tháng 7 cả công ty 0 điểm chỉ tiêu này, do chỉ có 1 bài cải tiến và bài đó chưa duyệt.
  **Duyệt bài xong điểm tự cộng**, không phải chấm lại.
- 4 chỉ tiêu chấm tay còn lại trong bảng chung **giữ nguyên hành vi** — đã kiểm cả 4 là `THU_CONG`.

## Bảo mật

Có đụng SQL trên `kpi_chi_tieu` → **bắt buộc chạy skill `kiem-tra-bao-mat-du-lieu` trước khi
bàn giao**. Thay đổi chỉ là một cột boolean, không sửa RLS/policy/Storage/khoá API nào.
