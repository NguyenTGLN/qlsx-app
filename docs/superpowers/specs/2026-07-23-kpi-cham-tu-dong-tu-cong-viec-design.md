# Chấm KPI tự động từ bảng công việc

**Ngày:** 2026-07-23
**Nối tiếp:** `2026-07-21-kpi-module-design.md` §9 (hướng Phase 2), `2026-07-23-kpi-bang-cham-chung-design.md`

## 1. Phạm vi

Hai chỉ tiêu lấy điểm thẳng từ bảng `cong_viec_duoc_giao`, không ai chấm tay nữa:

| Mã | Chỉ tiêu | Số người | Luật |
|---|---|---|---|
| `HT_CONG_VIEC_DUNG_HAN` | HOÀN THÀNH CÔNG VIỆC ĐÚNG THỜI HẠN | 6 | Tỉ lệ % việc đúng hạn trong tháng |
| `VIDEO_KY_THUAT` | VIDEO KỸ THUẬT | 4 | Một đầu việc "Quay video kỹ thuật": đúng hạn 100%, trễ 50%, chưa xong 0% |

**Đích dài hạn là chấm tự động 100%** (mục tiêu 7 của spec gốc), nhưng hiện chỉ hai chỉ tiêu này có sẵn dữ liệu trong app. Các chỉ tiêu như QUẢN LÝ KHO HÀNG, PHỤC VỤ KHÁCH HÀNG chưa có gì để đếm. Nên thiết kế là **cơ chế cắm luật theo mã chỉ tiêu**, cắm 2 luật bây giờ, thêm luật thứ ba sau này chỉ là một entry trong bảng đăng ký. Hai ứng viên gần nhất đã có dữ liệu: tỉ lệ trả lời hotline (bảng KPI CSKH Zalo) và hoàn thành đơn bảo hành (`phieu_bao_hanh`).

## 2. Quyết định thiết kế (chốt với chủ app 23/07/2026)

| Quyết định | Lựa chọn | Vì sao |
|---|---|---|
| Lưu điểm hay tính live | **Tính lúc hiển thị, KHÔNG ghi xuống DB** | Xem §3 |
| Cửa sổ tính | Việc có `created_date` trong tháng của kỳ | Chủ app chốt |
| Luật đúng hạn | `completed_date − due_date > 60 giây` = trễ | Dùng lại y nguyên luật của `tallyTasks` |
| Việc chưa hoàn thành | Tính là trễ | Để việc treo mãi mà vẫn được điểm thì thành có lợi |
| Việc đã huỷ | Loại khỏi cả tử lẫn mẫu | Không phải lỗi của người làm |
| Việc giao nhiều người | Tính cho **mọi** thành viên | Chủ app chốt, và khớp luật báo cáo công việc sẵn có |
| Tháng không có việc nào | HT_CONG_VIEC: chấm đủ điểm. VIDEO: **không chấm** | Chấm 0 cho việc chưa ai tạo là oan |
| Nhận diện việc quay video | Tên việc chứa "quay video kỹ thuật", không phân biệt hoa thường/dấu | Mỗi tháng là một bản sao mới, không khớp được theo id |

### Vì sao KHÔNG ghi điểm xuống DB

Phương án đầu là một nút "Chấm tự động" ghi `diem_chot`. Bỏ, vì cả ba hệ quả đều xấu:

- Điểm cũ nằm lại khi công việc đổi trạng thái sau lúc bấm — bảng KPI nói một đằng, bảng công việc một nẻo, không ai biết cái nào đúng.
- Phải có người nhớ bấm nút mỗi tháng. Quên là cả tháng chấm sai.
- Phải phân xử điểm tay và điểm tự động cái nào đè cái nào.

Tính lúc hiển thị thì con số **luôn** khớp bảng công việc, không nút nào phải bấm, không gì để lệch. Đổi lại: mở bảng KPI phải tải thêm dữ liệu công việc của tháng đó, và kỳ đã đóng vẫn tính lại theo dữ liệu hiện tại (một việc hoàn thành muộn sau khi tháng đã qua sẽ làm điểm tháng cũ giảm — đúng bản chất, vì nó vốn là việc trễ).

## 3. Cách cắm vào luồng sẵn có

Điểm mấu chốt: **không sửa engine, không sửa màn hình, không sửa Excel/bản in.** Một hàm thuần chèn kết quả tự động vào dữ liệu TRƯỚC khi mọi thứ khác chạy:

```
cong_viec_duoc_giao ─┐
                     ├─→ apDungChamTuDong(rows, logs, tasks, ky) ─→ rows', logs' ─→ tinhBangKpi → UI/Excel/in
kpi_chi_tieu, nhật ký ┘
```

`apDungChamTuDong` trả về bản sao của `rows`/`logs`, trong đó mỗi dòng chỉ tiêu có luật tự động được:

- gán `diem_chot` = điểm luật tính ra (engine đã biết `diem_chot` thắng mọi thứ), và
- kèm **một dòng nhật ký ảo** `{ so_diem: 0, ly_do: <diễn giải>, nguon: 'TU_DONG' }`.

Dòng nhật ký ảo là mẹo đã dùng ở bảng chấm chung: `so_diem = 0` nên không đụng phép tính, chỉ chở chữ. Nhờ nó, diễn giải tự chảy ra **cột ghi chú của bảng, popup bấm vào điểm, file Excel và bản in** mà không phải sửa chỗ nào — đúng yêu cầu "bấm vào điểm số để hiện diễn giải".

Dòng ảo có `id` dạng `ao-<chi_tieu_id>` và **không bao giờ được ghi xuống DB**. Mọi chỗ ghi nhật ký đều đi qua form riêng, không lấy từ mảng này.

## 4. Hai luật

### 4.1 `HT_CONG_VIEC_DUNG_HAN`

```
mẫu số = số việc created_date trong tháng, có tên người đó trong assignee_ids, status ≠ CANCELLED
tử số  = trong đó, số việc đã COMPLETED và không trễ
điểm   = chỉ tiêu × (tử số / mẫu số)
```

Mẫu số = 0 → điểm = chỉ tiêu, ghi chú "Không có việc nào được giao trong tháng".

Ghi chú khi có việc: `Tự động: 7/9 việc đúng hạn (78%). Trễ: <tên việc>, <tên việc>…` — liệt kê tối đa 5 tên việc trễ rồi `…+N việc nữa`, để ô ghi chú không phình thành cả trang.

### 4.2 `VIDEO_KY_THUAT`

Tìm việc trong tháng có tên chứa `quay video kỹ thuật` (bỏ dấu, hạ thường trước khi so — tên việc gõ tay nên `KĨ`/`KỸ` đều phải khớp).

| Trạng thái việc | Điểm | Ghi chú |
|---|---|---|
| COMPLETED, không trễ | chỉ tiêu (100%) | `Tự động: quay video đúng hạn.` |
| COMPLETED, trễ | chỉ tiêu × 0.5 | `Tự động: quay video xong nhưng trễ hạn — 50% điểm.` |
| Chưa hoàn thành | 0 | `Tự động: chưa hoàn thành việc quay video.` |
| Không tìm thấy việc | **không chấm** | `Chưa tạo việc quay video tháng này — chưa có căn cứ chấm.` |

Nhiều việc khớp trong tháng → lấy trung bình tỉ lệ, ghi chú nói rõ có mấy việc.

"Không chấm" nghĩa là **không gán `diem_chot`** — dòng chỉ tiêu giữ nguyên đường tính cũ (mặc định đủ điểm), nhưng vẫn có dòng nhật ký ảo giải thích. Khác hẳn chấm 0.

## 5. Cắt tháng theo giờ Việt Nam

`created_date` là `timestamptz`. Cắt tháng bằng cách so chuỗi ISO (giờ UTC) sẽ sai ở biên: việc tạo 06:00 ngày 01/08 giờ VN là 23:00 ngày 31/07 giờ UTC → bị xếp nhầm vào tháng 7. Phải lấy tháng theo **giờ địa phương của máy** (`new Date(x).getFullYear()/.getMonth()`), tức giờ VN với người dùng thật, và khớp với ngày mà app đang hiển thị cho họ.

## 6. Tải dữ liệu

`KpiTab` tải thêm việc của tháng đang xem:

```js
supabase.from('cong_viec_duoc_giao')
  .select('id, title, status, due_date, completed_date, created_date, assignee_ids, assignee_id')
  .gte('created_date', <đầu tháng, giờ VN>)
  .lt('created_date', <đầu tháng sau, giờ VN>)
```

Chỉ lấy 8 cột cần dùng, và lọc sẵn theo tháng ở phía server — bảng công việc là bảng lớn nhất app, kéo cả bảng về chỉ để đếm vài chục việc là phí. Lỗi tải việc **không được làm hỏng cả màn hình KPI**: bắt riêng, để `tasks = []` và hiện cảnh báo "không tải được dữ liệu công việc, 2 chỉ tiêu tự động tạm tính theo cách cũ".

## 7. Đánh dấu chỉ tiêu tự động

`cach_cham = 'TU_DONG'` cho 2 mã này (cột đã có sẵn từ đầu, chưa code nào dùng). Tác dụng:

- Popup diễn giải **ẩn nút "Chốt điểm tay" và "Ghi điểm"** — chấm tay lên chỉ tiêu tự động chỉ tạo ảo giác, vì lần render sau điểm tự động lại đè lên.
- Bảng cá nhân gắn nhãn `tự động` (dùng lại kiểu nhãn `chung bộ phận` sẵn có).

Nền dòng vẫn theo phân loại chỉ tiêu như đã chốt hôm nay, không thêm màu thứ tư.

## 8. Chỗ đặt code

| File | Trách nhiệm |
|---|---|
| `src/lib/kpiTuDong.js` | Tạo mới — bảng đăng ký luật theo mã + `apDungChamTuDong`. Hàm thuần, không import supabase |
| `src/lib/kpiTuDong.test.js` | Tạo mới — test từng luật + phần chèn |
| `src/lib/taskAssignees.js` | Sửa — tách `laTre(task)` ra khỏi `tallyTasks` để KPI dùng chung đúng một luật |
| `src/pages/tasks/KpiTab.jsx` | Sửa — tải việc trong tháng, gọi `apDungChamTuDong`, ẩn form chấm tay cho dòng `TU_DONG` |
| `sql/danh_dau_chi_tieu_tu_dong.sql` | Tạo mới — đặt `cach_cham='TU_DONG'` cho 2 mã |

`kpiEngine.js` không đổi. `kpiExcel.js`, `KpiPrint.jsx` không đổi.

## 9. Test

Luật đúng hạn:
- Xong trước hạn → đúng hạn. Xong sau hạn 30 giây → vẫn đúng hạn (nới 60s). Sau 5 phút → trễ.
- Việc không có `due_date` → không tính là trễ (khớp `tallyTasks`).

`HT_CONG_VIEC_DUNG_HAN`:
- 9 việc, 7 đúng hạn → điểm = chỉ tiêu × 7/9; ghi chú nêu đúng 2 tên việc trễ.
- Việc chưa hoàn thành nằm ở mẫu số, không ở tử số.
- Việc CANCELLED không nằm ở cả hai.
- Việc tạo tháng khác không lọt vào.
- Việc nhóm 3 người → cả 3 người đều được tính.
- Không có việc nào → đủ điểm, ghi chú nói rõ.
- Trễ hơn 5 việc → ghi chú cắt còn 5 tên + "…và N việc nữa".

`VIDEO_KY_THUAT`:
- Đúng hạn → 100%; trễ → 50%; chưa xong → 0.
- Tên `QUAY VIDEO KĨ THUẬT` (khác dấu) vẫn khớp.
- Không có việc → **không gán `diem_chot`**, có ghi chú.
- 2 việc khớp (một đúng hạn, một trễ) → trung bình 75%.

Phần chèn:
- Chỉ tiêu không có luật → giữ nguyên, không mọc dòng nhật ký ảo.
- Dòng nhật ký thật của chỉ tiêu tự động vẫn còn, không bị dòng ảo nuốt.
- `apDungChamTuDong` **không được sửa mảng gốc** (rows/logs truyền vào phải nguyên vẹn).

## 10. Ngoài phạm vi

- Không tự động hoá chỉ tiêu nào khác — chưa có nguồn dữ liệu.
- Không đụng bảng chấm chung và 4 chỉ tiêu của nó.
- Không sửa cách bảng công việc tính "đúng hạn"; KPI mượn lại, không định nghĩa lại.
