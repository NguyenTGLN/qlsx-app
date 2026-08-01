# Bàn giao — Chấm công, 01/08/2026

> Hai việc: **(1)** nạp lại chấm công tháng 7 bằng bản xuất mới · **(2)** làm màn hình để bác tự nạp hằng tháng.
> Nhánh: `nap-cham-cong-thang-7`

---

## 1. Chấm công tháng 7 — ĐÃ NẠP XONG

Dữ liệu cũ cắt ở 23/07 (286 dòng). Bản mới là **trọn tháng: 388 dòng, 13 người, 01→31/07**.

Nhưng đây không chỉ là "thêm 8 ngày cuối" — **23 ngày đầu cũng đã được sửa lại**. Điểm chuyên cần
cá nhân (thang 10) đổi như sau:

| Người | Trước | Sau | |
|---|---|---|---|
| Xuyên | 0 | **7** | ▲ +7 |
| Bích | 4 | **10** | ▲ +6 |
| Nguyên | 4 | **10** | ▲ +6 |
| Thiện | 2 | **7** | ▲ +5 |
| Duyên | 7 | **10** | ▲ +3 |
| Hà · Hĩu · Dương | 10 | 10 | — |
| Thơ | 10 | **9** | ▼ −1 |
| Ngọc | 4 | **2** | ▼ −2 |
| Tuấn | 4 | **1** | ▼ −3 |
| **Phong** | 5 | **0** | ▼ −5 |
| Xuân | 0 | 0 | — (điểm trừ 13 → 18) |

Phong tụt mạnh nhất: 31 → 173 phút muộn, số lần muộn nhẹ từ 2 lên 8. Xuân 28 → 275 phút.
Ngược lại Xuyên từ 5 ngày nghỉ xuống 2, Bích từ 3 xuống 1.

### Hai điều nên biết trước khi có người thắc mắc

- **Bản xuất mới không còn ghi "Về sớm"** — cột đó bằng 0 ở cả 388 dòng, trong khi bản cũ Ngọc
  có 90 phút. Đã kiểm thẳng trong tệp Excel, không phải lỗi đọc. Nếu máy chấm công vẫn nên ghi
  về sớm thì đây là **thiết lập xuất bị đổi**. Chuyên cần **bộ phận** có tính về sớm nên nó đang
  nhẹ đi so với trước.
- **9 dòng "giờ ra sớm hơn giờ vào chiều" của bản cũ đã hết.** Bản mới sạch.

---

## 2. ⚠️ Việc bác cần quyết: nghỉ nửa ngày đang bị trừ như nghỉ trọn ngày

Cột "Nghỉ" trong tệp máy chấm công có **bốn** giá trị, không phải một cờ có/không. Đo trên 3 bản
xuất thật:

| Bản xuất | `Nghỉ` | `Nghỉ sáng` | `Nghỉ chiều` | `Nghỉ tết` |
|---|---|---|---|---|
| T7/2026 | 11 | **7** | **1** | 0 |
| T2/2026 | 4 | 5 | 1 | 54 |

App quy tất cả về một cột đúng/sai ⇒ **tháng 7 có 8 buổi nghỉ nửa ngày đang bị tính thành 8 ngày
nghỉ trọn**. Luật chuyên cần trừ 3 điểm mỗi ngày vượt phép, nên **hai buổi `Nghỉ sáng` là đủ mất
5 điểm**.

Chuyện này **có từ trước**, không phải mới sinh ra — script cũ cũng gộp như vậy.

**⚠ ĐÍNH CHÍNH — tôi đã nói sai chỗ này trong bản trước.** Tôi viết là "đã giữ nguyên văn chữ đó
vào dữ liệu". **Không đúng.** Hàm đọc tệp có giữ chữ đó (trường `nghiText`), nhưng nó chỉ nằm
trong bộ nhớ trình duyệt lúc nạp rồi **bị bỏ trước khi ghi xuống CSDL** — bảng `cham_cong` không
có cột nào chứa nó.

Hệ quả thật: nếu sau này bác quyết `Nghỉ sáng` chỉ tính 0,5 ngày thì **8 buổi nửa ngày của tháng 7
không lấy lại được từ CSDL** — phải nạp lại từ tệp Excel gốc. Tệp gốc vẫn còn ở
`Desktop/3. Cải tiến/12. Wepapp/Xử lý bảng chấm công/`, nên không mất hẳn, nhưng đừng xoá nó.

Cách tính **không đổi**. Đổi là đổi điểm của người thật, và đó là quyết định của bác. Muốn sửa thì
nói — việc cần làm là thêm một cột vào `cham_cong` để lưu chữ đó, rồi sửa luật đếm ngày nghỉ.

---

## 3. Màn hình tự nạp — ĐÃ LÀM XONG PHẦN MÃ

Tab **Chấm công** có thêm nút **"Nạp từ Excel"** (chỉ người có quyền sửa thấy). Bốn bước:

1. **Chọn tệp** — app tự nhận ra kỳ và tự bỏ những ngày chưa ai đi làm. Không phải gõ tháng.
2. **Nối tên** — chỉ hiện khi gặp họ tên lạ. Chọn một lần, app nhớ luôn cho tháng sau.
3. **Xem trước** — tổng quan + cảnh báo + **bảng điểm chuyên cần trước/sau từng người**, tô xanh
   ai tăng, đỏ ai giảm. Đây là phần đáng giá nhất: thấy trước khi ghi.
4. **Xác nhận** — ghi bằng một lệnh duy nhất.

### ⚠️ Nên dùng nút trong app, ĐỪNG dùng script cũ nữa

Script `scripts/import-cham-cong.mjs` **vẫn chạy được**, nhưng nó giữ bản sao riêng của phần đọc
tệp và hai bản **đã lệch nhau**. Từ cùng một tệp, script cho kết quả **sai** ở bốn chỗ mà app đã
sửa:

| Tình huống | Nút trong app | Script cũ |
|---|---|---|
| Cả ngày chỉ có ca chiều | tính đúng | **vứt bỏ cả ngày của 13 người** |
| Ô "Đi muộn" ghi dạng `1:27` | 87 phút | **0 phút** — lợi cho nhân viên |
| Số phút âm | về 0 kèm cảnh báo | **ghi thẳng số âm** — làm điểm tăng lên |
| Thuê người mới | app hỏi rồi tự nhớ | **phải sửa mã và chạy lại** |

Trên tệp tháng 7 thật thì hai bên ra kết quả **y hệt nhau** — các khác biệt trên chỉ nổ ở tệp có
dữ liệu bất thường. Nhưng đó đúng là lúc bác cần công cụ đúng nhất.

### Thuê người mới thì làm gì

Cứ nạp bình thường bằng nút trong app. Gặp tên lạ nó sẽ hỏi "đây là ai", bác chọn một lần là xong —
không cần gọi tôi, không cần sửa mã, không cần deploy.

**⚠ Chọn kỹ ngay lần đầu.** Lựa chọn đó được nhớ cho mọi tháng sau, và **hiện không có màn hình nào
sửa lại được** — chọn nhầm là chấm công của người này chảy sang người khác mỗi tháng, âm thầm, và
phải nhờ sửa thẳng trong CSDL mới gỡ được.

---

## 4. Bốn cái bẫy đã bắt được khi làm

Cả bốn đều **không lộ ra khi chạy test** — chỉ hiện khi đo trên dữ liệu thật.

**a) Hàm nạp có thể xoá sạch một tháng rồi báo "thành công".** Nếu bị gọi với danh sách rỗng,
lệnh xoá vẫn chạy còn lệnh nạp không chèn dòng nào — mà Postgres **không báo lỗi gì**
(`jsonb_to_recordset(null)` trả 0 dòng, đã đo). Đã chặn ngay trước lệnh xoá.

**b) `revoke ... from anon` không có tác dụng.** Chạy xong tưởng đã chặn, đo lại thì `anon` **vẫn
gọi được hàm** — Postgres cấp quyền cho `PUBLIC` và `anon` thừa hưởng qua đó. Nếu tin dòng lệnh
đã viết thay vì đo, đã bàn giao một hàm ai cũng gọi được kèm tệp SQL ghi rằng đã chặn. Đã sửa
thành `revoke from public` + `grant to authenticated`.

**c) Bảng xem trước suýt nói dối.** Luật chuyên cần **cố ý nhường điểm cho người chấm tay** — quản
lý đã chốt thì điểm tự động không đè lên được. Bảng xem trước không biết chuyện đó nên sẽ hiện một
con số mà màn hình KPI sau đó từ chối hiển thị. Hiện chưa dòng nào dính, nhưng sẽ nổ ngay lần đầu
có người chốt tay. Đã sửa: dòng nào đã chốt tay thì hiện xám kèm "đã chốt tay bởi X".

**d) Ngày cắt tính sai nếu cả ngày chỉ có ca chiều.** Cũ chỉ nhìn cột "Giờ in sáng", nên một ngày
mà mọi người chỉ quét buổi chiều sẽ bị vứt bỏ cả ngày. Đã đổi sang nhìn cả ba cột giờ — **nhưng
chỉ ở màn hình trong app**, script cũ vẫn còn lỗi này (xem mục 5 dưới).

**e) Suýt làm hỏng màn hình Phân quyền.** Cột `ten_cham_cong` mới có ràng buộc "không hai người
trùng nhau". Luồng **đổi mã nhân viên** lại sao chép cả dòng cũ sang mã mới **trong khi dòng cũ
còn đó** — nên nó đâm vào ràng buộc và chết ngay bước đầu. Đúng loại lỗi đã xảy ra ngày 28/07:
sửa một chỗ, hỏng một màn hình không ai đang mở nên không ai biết. Đã sửa.

Sửa cái đó lại lòi ra một lỗi **có sẵn từ trước, nặng hơn**: xoá một nhân viên sẽ cascade xoá theo
**4 bảng** (`kpi_chi_tieu`, `cham_cong`, `chuyen_can_ngoai_le`, `cai_tien`), nhưng luồng đổi mã chỉ
chuyển **một** bảng, và chú thích trong mã ghi rằng đó là "FK cascade DUY NHẤT". Nghĩa là đổi mã một
nhân viên sẽ **xoá sạch toàn bộ chấm công, miễn trừ và cải tiến của họ**, không báo lỗi, giao diện
vẫn hiện "Đã cập nhật nhân viên!". Đã chuyển đủ cả 4 bảng và sửa chú thích.

---

## 5. Kiểm tra bảo mật

Đo bằng **chính khoá công khai lấy từ mã nguồn** (`sb_publishable_…`), trên **dòng có thật**:

| Phép thử | Kết quả |
|---|---|
| Gọi hàm `nap_cham_cong` | `42501 permission denied` — chặn |
| Đọc `nhan_vien` (chứa họ tên thật) | **0 dòng** |
| Sửa `nhan_vien`, dòng có thật | `[]` — chặn |
| Xoá `nhan_vien`, dòng có thật | `[]` — chặn |
| Chèn `nhan_vien` mới | `42501` vi phạm RLS |
| Kiểm lại trong CSDL sau các phép thử | 17 nhân viên nguyên vẹn, 388 dòng chấm công còn đủ |

Hàm `nap_cham_cong` **không phải** `security definer` (đã kiểm `prosecdef = false`) — nếu là
definer thì nó bỏ qua RLS và người ngoài xoá sạch được bảng chấm công.

**Thử toàn bộ đường ghi** bằng một bản sao của hàm trên kỳ rác `1900-01`: null / mảng rỗng /
không phải mảng / kỳ sai định dạng đều bị từ chối; nạp thật chèn đúng 2 dòng; thiếu trường bắt
buộc và sai mã nhân viên đều bị bắt kèm câu lỗi tiếng Việt. **Quan trọng nhất:** sau hai lần nạp
hỏng, **2 dòng cũ vẫn còn nguyên cả nội dung** — lệnh xoá đã bị cuộn ngược, không có trạng thái
dở dang. Bản sao thử và dữ liệu rác đã dọn sạch.

### Phần CHƯA kiểm chứng được — nói thẳng

**Toàn bộ phần giao diện.** App chạy, build sạch, không lỗi console lẫn lỗi server — nhưng tôi
dừng ở màn hình đăng nhập và **không nhập mật khẩu thay bác**. Nên mọi thứ thuộc về "nhìn trên
màn hình" là do bác xác nhận, không phải tôi.

---

## 6. Việc bác cần làm

### Bước 1 — deploy

Kéo-thả thư mục `dist` lên Netlify, **không build trên Netlify**. SQL đã chạy rồi nên deploy xong
là dùng được ngay.

### Bước 2 — thử nạp lại chính tệp tháng 7

Vào **Công việc → Chấm công → Nạp từ Excel**, chọn
`Desktop/3. Cải tiến/12. Wepapp/Xử lý bảng chấm công/Thống kê chấm công T7.2026.xlsx`.

Kỳ vọng:
- Không hỏi nối tên nào (13 người đã điền sẵn).
- Kỳ 2026-07, **388 dòng, 13 người**, đến hết 31/07, bỏ 0 dòng.
- **Bảng điểm: mọi người chênh lệch bằng 0** — vì dữ liệu hiện tại vốn đã nạp từ chính tệp này.

**Nếu có ai lệch, dừng lại báo tôi.** Nghĩa là hàm đọc tệp trong app khác với script, và con số
nào đó đang sai.

### Bước 3 — kiểm luồng cũ không hỏng

**Quan trọng nhất: Phân quyền → sửa một nhân viên → ĐỔI MÃ NHÂN VIÊN.** Đây là luồng nhánh này đã
làm hỏng và tôi đã sửa, nhưng chưa ai bấm thử. Đổi thử mã một người **không quan trọng** (ví dụ
`test`), rồi kiểm: đổi xong họ vẫn còn nguyên chấm công, KPI, cải tiến. Nếu báo lỗi trùng khoá thì
dừng lại báo tôi.

Sau đó, trong tab Chấm công: bảng xem, ô chọn tháng, phần **miễn trừ có giải trình** phải hoạt động
y như trước.

Cả hai đều là thứ tôi lo nhất và không tự kiểm được — tôi vướng màn hình đăng nhập.

---

## 7. Ghi chú kỹ thuật

- **Ghi bằng một hàm trong CSDL**, không phải nhiều lệnh rời. Trình duyệt không mở được
  transaction qua PostgREST; gọi `delete` rồi `insert` thành hai lệnh mà rớt mạng giữa chừng là
  cả kỳ trống rỗng. Hàm thì Postgres tự bọc transaction.
- **Ngày cắt tự suy ra** = ngày cuối cùng có người quét vân tay. Tự đúng cho cả tệp xuất giữa
  tháng lẫn hết tháng, không ai phải nhớ chỉnh. Trước đây gõ cứng trong script — nạp tệp tháng 8
  mà quên sửa là xoá sạch tháng 7 rồi gán nhầm kỳ, không báo lỗi gì.
- **Bảng xem trước gọi thẳng hàm tính điểm thật**, không viết bản riêng. Đã chứng minh khớp tuyệt
  đối với engine trên 4 nhân viên, kể cả người đã chốt tay.
- **Không đoán tên.** Quy tắc "lấy chữ cuối họ tên" đúng 12/13 nhưng sai ở `Vương Tuấn Anh`, và
  `Nguyễn Xuân Thiện` chứa chữ "Xuân" trùng tên gọi người khác. Đoán sai = gán trọn tháng chấm
  công sang nhầm người.
- **Tệp SQL có phần hoàn tác** ở cuối, để dạng chú thích — bỏ dấu `--` rồi chạy.
- **Tệp `sql/seed_cham_cong_*.sql` bị `.gitignore` có chủ đích** — chứa dữ liệu chấm công người
  thật, không đưa lên git.
