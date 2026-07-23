# Bảng chấm chung KPI — ma trận nhân viên × chỉ tiêu

**Ngày:** 2026-07-23
**Nối tiếp:** `2026-07-21-kpi-module-design.md` (module KPI Phase 1)
**Kỳ áp dụng đầu tiên:** 2026-07

## 1. Vấn đề

Kỳ 2026-07 có 47 chỉ tiêu khác nhau trải trên 13 nhân viên. Trong đó **7 chỉ tiêu có mặt ở cả 13 người**, và 6 trong 7 cái đó đang phải chấm tay từng người một — mở 13 bảng KPI, bấm "Chốt điểm tay" 13 lần, cho mỗi chỉ tiêu, mỗi tháng.

Chủ app chọn 4 chỉ tiêu chuyển sang chấm ở một bảng chung:

| Mã | Tên | Mức | Trọng số |
|---|---|---|---|
| `QUY_DINH_CONG_TY` | QUY ĐỊNH CÔNG TY | 10 | 1 (admin 2) |
| `VAN_HOA_CONG_TY` | VĂN HÓA CÔNG TY. (…) | 24 | 4 / 6 |
| `5S` | 5S | 10 | 2 / 3 / 5 |
| `CHAM_KPI` | CHẤM KPI | 10 | 2 |

**"Chấm chung" ở đây nghĩa là chấm ở MỘT MÀN HÌNH chung, không phải một điểm dùng chung.** Mỗi nhân viên vẫn có điểm riêng của mình. Khác hẳn `CHUYÊN CẦN BỘ PHẬN` / `HOTLINE CẢ TEAM BH` — hai chỉ tiêu đó dùng dòng `cap_do='BO_PHAN'`, một điểm cho cả nhóm. Bảng chấm chung **không** đụng tới cơ chế đó.

## 2. Quyết định thiết kế (đã chốt với chủ app 23/07/2026)

| Quyết định | Lựa chọn | Vì sao |
|---|---|---|
| Ô nhập chứa gì | Điểm cuối cùng (0…mức chỉ tiêu) | 4 chỉ tiêu này là đánh giá cuối tháng theo cảm nhận quản lý, không phải đếm sự vụ |
| Điểm thiếu | Hiện ô nhập lý do ngay dưới; đủ điểm thì không hỏi | Bảng KPI cá nhân phải giải thích được vì sao mất điểm |
| Chọn chỉ tiêu nào vào bảng chung | Mở sẵn 4 cái, có nút "＋ Thêm chỉ tiêu" chọn từ danh sách còn lại | Chủ app muốn tự mở rộng dần, không phải nhờ sửa code |
| Lưu trạng thái đó ở đâu | 2 cột mới trên `kpi_chi_tieu`: `ma`, `cham_chung` | Xem mục 3 |
| Định danh chỉ tiêu | Cột `ma` — chữ viết tắt có nghĩa, mọi nhân viên cùng chỉ tiêu thì cùng mã | Tên chỉ tiêu dài và đã đổi 2 lần; danh sách chọn cần khoá ổn định để không nhầm |
| Thời điểm lưu | Lưu từng ô khi rời ô, không có nút "Lưu tất cả" | Điền tới đâu chắc tới đó; lỗi hiện tại đúng ô sai |

### Phương án đã cân nhắc và loại

- **Dùng lại cột `cach_cham='CHAM_CHUNG'`** (cột này hiện chưa code nào dùng tới, đang bỏ trống). Loại vì trộn hai khái niệm: `cach_cham` trả lời "điểm ở đâu ra" (nhật ký / tay / tự động), còn chấm chung trả lời "nhập ở màn hình nào". Phase 2 nối chấm tự động sẽ giành cùng một ô.
- **Bảng cấu hình riêng `kpi_chi_tieu_chung(ky, ma)`.** Sạch về khái niệm nhưng bảng KPI cá nhân phải join thêm mới biết dòng có bị khoá không, cộng thêm một bảng phải đặt RLS và phải nhớ khi tạo kỳ mới. Không được gì thêm so với 2 cột.
- **Cắm cứng 4 tên chỉ tiêu vào code.** Loại vì tên đã đổi 2 lần (`5 S`→`5S`, `CẢI TIẾN`→`ĐÓNG GÓP CẢI TIẾN`); lần đổi sau bảng chung sẽ lặng lẽ mất dòng, không báo lỗi.

## 3. Thay đổi dữ liệu

```sql
alter table kpi_chi_tieu add column if not exists ma text;
alter table kpi_chi_tieu add column if not exists cham_chung boolean not null default false;
create index if not exists kpi_chi_tieu_chung_idx on kpi_chi_tieu (ky, cham_chung) where cham_chung;
```

- `ma`: mã chỉ tiêu, ví dụ `5S`, `VAN_HOA_CONG_TY`. **Cùng tên chỉ tiêu → cùng mã, ở mọi nhân viên và mọi kỳ.** Sinh từ tên (bỏ dấu, hoa, gạch dưới, tối đa 4 từ), 47 mã của kỳ 2026-07 liệt kê rõ trong file SQL để soát tay trước khi chạy. Mã trùng nhau sau khi cắt được đặt tay cho có nghĩa: `PHAN_HOI_KH_BH` / `PHAN_HOI_KH_CSKH`, `BC_PHAN_TICH_BH` / `BC_PHAN_TICH_SX`, `XD_TL_CL_DAU_VAO` / `XD_TL_CL_DAU_RA`, `XD_QT_DONG_GOI` / `XD_QT_KHO`.
- `cham_chung`: bật cho **tất cả** dòng cùng `ma` trong cùng kỳ, không bật lẻ một người. Bật/tắt là thao tác cấp chỉ tiêu.
- Kỳ 2026-07 bật sẵn 4 mã ở bảng mục 1.

**Hàm tạo kỳ mới phải copy 2 cột này.** `INSERT … SELECT` trong `tao_ky_kpi` liệt kê cột tường minh — thiếu `ma`, `cham_chung` thì sang tháng 8 bảng chung trống trơn mà không có lỗi nào. Script `scripts/import-kpi-excel.mjs` cũng cần sinh `ma` cho các lần import sau.

## 4. Cách ghi điểm và lý do

Ô điểm → `diem_chot` trên đúng dòng chỉ tiêu của người đó, y hệt nút "Chốt điểm tay" hiện có:

```js
supabase.from('kpi_chi_tieu')
  .update({ diem_chot, chot_boi: me.name, chot_luc: new Date().toISOString() })
  .eq('id', ct.id).select()          // .select() BẮT BUỘC — xem kpiWriteGuard.js
```

`.select()` + `loiGhiKpi(error, data)` là bắt buộc: không có nó, một UPDATE bị RLS lọc sạch trả về 204 với `error = null`, app báo "đã lưu" cho thao tác không chạm được dòng nào.

Lý do → một dòng `kpi_nhat_ky`:

| Cột | Giá trị |
|---|---|
| `so_diem` | `0` — không đụng vào phép tính, chỉ mang chữ |
| `ly_do` | lý do chủ app gõ |
| `nguon` | `'BANG_CHUNG'` — khoá để tìm lại đúng dòng này |
| `ngay` | ngày chấm |

Mỗi `chi_tieu_id` giữ **đúng một** dòng `nguon='BANG_CHUNG'`: đã có thì update, chưa có thì insert, kéo điểm về tối đa thì xoá. Không cộng dồn nhiều dòng lý do cho một lần chấm.

Dạng `so_diem = 0` này đã có tiền lệ trong app: đợt import Excel dùng đúng cách đó để giữ ghi chú, và `ghiChuDong()` trong `KpiTab.jsx` đã xử lý sẵn — nhật ký `so_diem = 0` thì chỉ hiện chữ, không hiện dấu ±. **Nên lý do tự chảy sang bảng KPI cá nhân, popup diễn giải, file Excel và bản in mà không phải sửa gì.**

## 5. Màn hình

Màn hình thứ 3 của tab KPI, bên cạnh "danh sách nhân viên" và "bảng KPI một người". Mở bằng nút trên màn danh sách.

```
┌────────────────────────┬──────┬──────┬──────┬─────┐
│ CHỈ TIÊU               │ Hùng │ Thảo │ Xuyên│ …   │   ← 13 cột, cuộn ngang
├────────────────────────┼──────┼──────┼──────┼─────┤
│ 5S · 5S           /10  │  10  │   9  │  ▨   │     │   ← cột trái ghim cứng
│                        │      │ ┌──────────────┐ │
│                        │      │ │lý do: bàn bừa│ │   ← chỉ hiện khi điểm < mức
│ VAN_HOA · VĂN HÓA /24  │  24  │  24  │  ▨   │     │
│ …                                                 │
│ ＋ Thêm chỉ tiêu                                  │
└───────────────────────────────────────────────────┘
```

- Ô đủ điểm nền xanh, thiếu điểm nền hồng, chưa chấm để trống nền xám.
- Nhân viên không có chỉ tiêu đó → ô gạch chéo `▨`, không nhập được (7 chỉ tiêu chung thì ai cũng có, nhưng chỉ tiêu thêm vào sau có thể chỉ 6/13 người có).
- **＋ Thêm chỉ tiêu**: popup liệt kê các chỉ tiêu chưa chấm chung dạng `mã · tên · (có ở 7/13 người)`, tick nhiều cái một lúc.
- Mỗi dòng có nút bỏ khỏi bảng chung. **Bỏ thì điểm đã chấm giữ nguyên**, chỉ mở khoá để chấm lại ở bảng cá nhân.

### Bảng KPI cá nhân

Gần như không đổi. Thêm hai thứ:

- Dòng có `cham_chung` gắn nhãn **"chấm ở bảng chung"** (dùng lại style `tagChung` sẵn có).
- Popup diễn giải của dòng đó ẩn nút "Chốt điểm tay" — không để hai chỗ cùng sửa một con số.

Cột ghi chú không phải sửa: nó đã đọc `ly_do` từ nhật ký rồi.

## 6. Quyền

| Thao tác | Quyền |
|---|---|
| Xem bảng chung | `view` (điểm KPI vốn công khai toàn công ty) |
| Điền điểm + lý do | `edit` — giống chấm điểm hiện tại |
| Thêm/bỏ chỉ tiêu khỏi bảng chung | `create` — đây là đổi cấu trúc chỉ tiêu |

RLS phía DB không đổi: `rls_kpi_admin_only.sql` đã siết quyền ghi `kpi_chi_tieu` và `kpi_nhat_ky` về ADMIN. Bảng chung ghi vào đúng hai bảng đó nên tự động thừa hưởng.

## 7. Chỗ đặt code

`KpiTab.jsx` đã 1195 dòng. Màn hình mới tách riêng:

| File | Trách nhiệm |
|---|---|
| `src/lib/kpiBangChung.js` | Hàm thuần: gom `kpi_chi_tieu` thành ma trận dòng chỉ tiêu × cột nhân viên; dựng danh sách chỉ tiêu thêm được. Không import supabase |
| `src/lib/kpiBangChung.test.js` | Test hàm thuần bằng vitest |
| `src/pages/tasks/KpiBangChung.jsx` | Giao diện bảng + popup thêm chỉ tiêu + ghi xuống DB |
| `src/pages/tasks/KpiTab.jsx` | Sửa: nút mở, nhánh render, nhãn + khoá cho dòng `cham_chung` |
| `sql/them_ma_va_cham_chung_kpi.sql` | Migration + 47 mã + bật 4 chỉ tiêu + sửa `tao_ky_kpi` |

Engine `kpiEngine.js` **không đổi** — bảng chung chỉ ghi `diem_chot` và nhật ký, hai thứ engine đã biết tính.

## 8. Test

Hàm thuần trong `kpiBangChung.js`:

- Gom danh sách chỉ tiêu thành ma trận: đúng số dòng, đúng số cột. Ô của người **không có** chỉ tiêu đó là `null` (vẽ gạch chéo); ô của người **có** chỉ tiêu nhưng chưa chấm là object dòng chỉ tiêu với `diem_chot = null` (vẽ ô nhập trống). Hai trạng thái này không được lẫn.
- Chỉ tiêu chỉ có ở 6/13 người vẫn lên được bảng chung, 7 ô còn lại là ô gạch chéo.
- Danh sách "thêm được" không chứa chỉ tiêu đã `cham_chung`, và đếm đúng số người có mỗi chỉ tiêu.
- Dòng `cap_do='BO_PHAN'` không lọt vào ma trận (nó thuộc cơ chế khác).

Kiểm tay sau khi chạy SQL: mở bảng chung, điền một ô thiếu điểm kèm lý do, mở bảng KPI cá nhân của đúng người đó xem điểm và lý do có sang không, và nút "Chốt điểm tay" của dòng đó đã ẩn chưa.

## 9. Ngoài phạm vi

- Không đụng `cap_do='BO_PHAN'` (CHUYÊN CẦN BỘ PHẬN, HOTLINE CẢ TEAM BH).
- Không nối chấm tự động từ dữ liệu app — vẫn là Phase 2.
- Không cân lại trọng số cho đủ 100 sau đợt chuyển cấu trúc tháng 7. Việc riêng, làm ở bảng cá nhân.
