# Nạp chấm công hằng tháng ngay trong app

> Ngày: 2026-08-01 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Liên quan: `scripts/import-cham-cong.mjs`, `src/pages/tasks/ChamCongTab.jsx`, `src/lib/kpiTuDong.js`

## Mục tiêu

Chủ app tự nạp chấm công hằng tháng **không cần terminal, không cần mở Supabase**: chọn tệp
Excel máy chấm công → xem trước ảnh hưởng → bấm xác nhận.

## Bối cảnh — đã đo, không suy luận

Quy trình hiện tại: chạy `node scripts/import-cham-cong.mjs` → sinh tệp SQL → mở Supabase SQL
Editor dán vào. Qua hai công cụ kỹ thuật, và bảng ánh xạ tên nằm cứng trong mã.

| Đã đo (01/08/2026) | Kết quả |
|---|---|
| RLS bảng `cham_cong` | `cc_ins` / `cc_upd` / `cc_del` đều cho `authenticated` có `nv_role = 'ADMIN'`; `cc_sel` cho mọi người đã đăng nhập ⇒ **app ghi được, không phải sửa policy nào** |
| Đọc Excel trong trình duyệt | Đã có ở 4 màn hình: `AdminDashboard.jsx:241,360`, `kho/BomTab.jsx:388`, `kho/CatalogTab.jsx:170`, `kho/ImportLogsTab.jsx:213` — có khuôn mẫu sẵn |
| Bảng `nhan_vien` | Chỉ có `name` là **tên gọi tắt** ('Tuấn', 'Phong'); không có cột họ tên đầy đủ |
| Ánh xạ tên hiện nay | `MAP_NV` gõ cứng 13 người trong `scripts/import-cham-cong.mjs:27` |
| Quy tắc "lấy chữ cuối họ tên" | Đúng 12/13. Sai ở `Vương Tuấn Anh` → ra "Anh", tên gọi là "Tuấn" |
| Nguy cơ trùng | `Nguyễn Xuân Thiện` chứa chữ "Xuân" — trùng tên gọi của người khác (`dvx`) |
| Tab `cham_cong` | Có caps `['view','edit']` (`permRegistry.js:46`); `ChamCongTab.jsx` hiện chỉ ĐỌC `cham_cong`, chỉ ghi `chuyen_can_ngoai_le` |

Vì hai dòng cuối, **không được đoán tên bằng heuristic** — đoán sai là gán chấm công của người
này sang người khác.

## Ngoài phạm vi (không làm lần này)

- **Không** sao lưu / hoàn tác. Nạp nhầm thì xuất lại Excel đúng rồi nạp đè (chủ app chốt 01/08).
- **Không** cho sửa tay từng ô chấm công trong app — bảng vẫn chỉ-đọc ngoài đường nạp này.
- **Không** đụng `chuyen_can_ngoai_le`. Miễn trừ nằm bảng riêng khoá theo (người, ngày); nạp lại
  chấm công không xoá chúng.
- **Không** xoá `scripts/import-cham-cong.mjs`. Giữ lại làm đường dự phòng.
- **Không** đổi luật chấm chuyên cần.

---

## A. Dữ liệu — cột `ten_cham_cong`

File mới `sql/them_ten_cham_cong.sql`, chạy tay trên Supabase SQL Editor, chạy lại an toàn.

```sql
alter table nhan_vien add column if not exists ten_cham_cong text;
create unique index if not exists nhan_vien_ten_cham_cong_uniq
  on nhan_vien (ten_cham_cong) where ten_cham_cong is not null;
```

Chỉ mục DUY NHẤT là bắt buộc, không phải trang trí: hai nhân viên mang cùng một họ tên chấm công
thì màn hình nạp sẽ gán toàn bộ dòng cho một người và người kia mất sạch — lỗi im lặng. Ràng buộc
ở CSDL làm chuyện đó không xảy ra được.

Điền sẵn 13 người, chép từ `MAP_NV` trong `scripts/import-cham-cong.mjs:27-41`:

| id | ten_cham_cong | | id | ten_cham_cong |
|---|---|---|---|---|
| ndp | Nguyễn Đình Phong | | nvh | Nguyễn Văn Hĩu |
| ptt | Phùng Thị Thơ | | nxt | Nguyễn Xuân Thiện |
| hhx | Hoàng Hà Xuyên | | nttd | Nguyễn Thị Thùy Dương |
| admin | Đỗ Hương Nguyên | | nv8 | Nguyễn Thị Duyên |
| nbn | Nguyễn Bá Ngọc | | lvb | Lê Văn Bích |
| vta | Vương Tuấn Anh | | ntth | Nguyễn Thị Thu Hà |
| dvx | Đỗ Văn Xuân | | | |

## B. Hàm thuần — `src/lib/chamCongExcel.js`

Không import `supabase`, không đụng DOM, cùng nếp `kpiTuDong.js` / `kpiBangChung.js`. Đây là
logic đang nằm trong `scripts/import-cham-cong.mjs`, tách ra để **cả script lẫn màn hình dùng
chung một bản** — hai bản parser sẽ trôi khỏi nhau và cho hai kết quả khác nhau từ cùng một tệp.

Xuất ba hàm:

**`docDongChamCong(raw)`** — nhận mảng-mảng thô từ `XLSX.utils.sheet_to_json(..., {header:1})`.
Tìm dòng tiêu đề bằng ô `'Tên nhân viên'` (không cắt cứng số dòng đầu — tệp xuất lại có thể thêm
dòng ghi chú, cắt cứng thì lệch một dòng là mất bản ghi mà không báo gì). Trả:
```
{ dong: [{ tenExcel, ngay, thu, inSang, inChieu, out, tangCa, diMuon, veSom, nghi, nghiVan }],
  ky, denNgay, canhBao: [chuỗi], boQuaNgaySau }
```

**`suyRaKyVaNgayCat(dong)`** — hàm phụ, `docDongChamCong` gọi nó và trả kết quả ra ngoài; xuất
riêng để test được độc lập. `ky` = tháng của các dòng; **lẫn nhiều tháng thì ném lỗi**, không
tự chọn tháng nhiều dòng nhất (đoán ở đây là xoá nhầm cả một kỳ). `denNgay` = ngày **cuối cùng có
ít nhất một người quét vân tay** (cột "Giờ in sáng"). Máy chấm công xuất trọn tháng kể cả ngày
chưa tới; những ngày đó không ai có giờ vào, để nguyên thì mỗi ngày thành một ngày NGHỈ của cả 13
người, mà luật trừ 3 điểm mỗi ngày nghỉ vượt phép.

**`noiTenNhanVien(dong, nhanVien)`** — nối `tenExcel` với `nhan_vien.ten_cham_cong` (so khớp sau
khi cắt khoảng trắng thừa). Trả `{ dongDaNoi, tenChuaBiet: [tên] }`. **Không đoán bằng heuristic.**

Cảnh báo (không chặn, chỉ nêu): dòng có `gio_out` sớm hơn `gio_in_chieu` → bỏ phần về sớm và gắn
`nghi_van = 'GIO_OUT_TRUOC_GIO_IN_CHIEU'`, y như script. Bản xuất T7 mới đã hết loại này, nhưng
luật phải còn vì bản xuất cũ từng có 9 dòng.

## C. Màn hình — `src/pages/tasks/NapChamCong.jsx`

Mở từ nút "Nạp từ Excel" trong `ChamCongTab.jsx`, chỉ hiện khi `perm.edit`. Bốn bước một chiều:

**1. Chọn tệp** — `<input type="file" accept=".xlsx,.xls">`, đọc bằng `XLSX.read(buf,{type:'array'})`
theo đúng khuôn `kho/CatalogTab.jsx:170`.

**2. Nối tên** — có tên lạ thì hiện danh sách, mỗi tên một ô chọn nhân viên. **Không cho sang bước
3 khi còn tên chưa nối.** Chọn xong ghi `ten_cham_cong` vào `nhan_vien` để lần sau tự nhận.

**3. Xem trước** — hai khối:
- *Tổng quan*: số dòng, số người, khoảng ngày, ngày cắt, số dòng bỏ vì sau ngày cắt, danh sách cảnh báo.
- *Bảng điểm chuyên cần trước/sau*: mỗi người một dòng — điểm hiện tại → điểm sau khi nạp, tô
  xanh nếu tăng, đỏ nếu giảm, xám nếu không đổi.

**4. Xác nhận** — ghi, rồi hiện kết quả thật (bao nhiêu dòng thêm/sửa/xoá) và gọi lại `onReload`.

### Bảng trước/sau tính thế nào

**Gọi thẳng `LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN`** (đã export ở `kpiTuDong.js:444`) — không viết lại
luật. Viết bản riêng cho màn hình xem trước là chắc chắn có ngày hai bản trôi khỏi nhau, và khi đó
bảng xem trước nói dối đúng vào lúc người dùng tin nó nhất.

Chữ ký: `luat(ct, viec, sanXuat, chamCong)` → `{ tiLe, ghiChu, nhuongChamTay }`.
Điểm = `ct.chi_tieu × tiLe`. Gọi hai lần cho mỗi người: một với `chamCong` cũ đọc từ DB, một với
dòng mới vừa parse.

Ba thứ phải làm đúng, nếu không con số xem trước lệch với con số thật:
- `ct` lấy từ `kpi_chi_tieu` kỳ đó, `ma = 'CHUYEN_CAN_CA_NHAN'`, `cap_do = 'CA_NHAN'` — luật đọc
  `ct.chi_tieu` làm điểm tối đa.
- Dòng chấm công phải được gắn cờ `mien` từ `chuyen_can_ngoai_le` trước khi đưa vào luật, y như
  `apDungChamTuDong` làm (`kpiTuDong.js:501-506`). Bỏ bước này thì ngày đã giải trình bị tính trừ.
- Người không có dòng `CHUYEN_CAN_CA_NHAN` trong kỳ thì **bỏ khỏi bảng**, không hiện 0 điểm.

Bảng này chỉ nói về **chuyên cần cá nhân**. Chuyên cần bộ phận (điểm chung cả nhóm) cũng đổi theo,
nhưng nó là một dòng cho cả nhóm nên không xếp vào bảng theo người — ghi một câu nhắc dưới bảng.

## D. Ghi xuống CSDL — chèn trước, xoá sau

Script hiện tại `delete` sạch kỳ rồi `insert` lại, an toàn vì nằm trong một transaction SQL.
**Trình duyệt không mở được transaction qua PostgREST**: rớt mạng giữa chừng là cả kỳ trống rỗng
và điểm chuyên cần cả công ty về 0. Nên đảo thứ tự:

1. **Đọc trước** dòng đang có của kỳ đó: `select id, nhan_vien_id, ngay where ky = <ky>`.
2. **Upsert** toàn bộ dòng mới, `onConflict: 'nhan_vien_id,ngay'`, chia lô 200 dòng.
3. **Xoá** những dòng cũ không có trong tệp mới: so khoá `nhan_vien_id|ngay` ở BƯỚC JS, lấy ra
   danh sách `id` thừa, rồi `.in('id', <mảng id>)` theo lô 200.

Bước 3 phải lọc trong JS rồi xoá theo `id`, **không** dùng `.not('ngay','in','(…)')`: tệp một
tháng có tới 388 dòng, nhét cả danh sách ngày vào URL là vượt giới hạn độ dài và lệnh hỏng giữa
chừng. Lọc trong JS còn cho biết **chính xác sẽ xoá bao nhiêu dòng** để hiện lên màn hình xác nhận
— thường là 0, và một con số khác 0 bất ngờ chính là dấu hiệu tệp xuất thiếu người.

Bảng có sẵn `id bigint` và ràng buộc duy nhất `(nhan_vien_id, ngay)` (đã đo 01/08/2026) nên cả
`onConflict` lẫn xoá theo `id` đều dùng được ngay, không phải thêm cột hay chỉ mục nào.

Không có khoảnh khắc nào dữ liệu biến mất. Bước 2 hỏng giữa chừng thì dữ liệu là trộn cũ-mới nhưng
vẫn đủ dòng; bấm nạp lại là xong (upsert lặp lại an toàn, xoá theo id cũng vậy).

## E. Test — `src/lib/chamCongExcel.test.js`

Vitest, hàm thuần nên không cần DOM lẫn mạng:
- `suyRaKyVaNgayCat`: tệp hết tháng lấy trọn tháng; tệp giữa tháng cắt ở ngày cuối có người quét;
  lẫn hai tháng thì ném lỗi.
- `docDongChamCong`: tìm đúng dòng tiêu đề khi có dòng ghi chú thừa ở đầu; đọc `'1:27'` ở cột tăng
  ca ra 87 phút; `'dd/MM/yyyy'` ra `'yyyy-MM-dd'`.
- Dòng `gio_out < gio_in_chieu` → `veSom = 0` + `nghiVan` + một dòng cảnh báo.
- `noiTenNhanVien`: nối đúng theo `ten_cham_cong`; tên lạ vào `tenChuaBiet`; **không** tự đoán
  `Vương Tuấn Anh` thành `Tuấn` khi chưa có ánh xạ.

## Người dùng sẽ thấy khác đi thế nào

- Tab **Chấm công** có thêm nút "Nạp từ Excel" (chỉ người có quyền sửa thấy).
- Mọi thứ khác trong tab giữ nguyên: bảng xem, phần miễn trừ giải trình, bộ lọc kỳ.
- Script cũ vẫn chạy được y như trước.

## Bảo mật

Có thêm cột vào `nhan_vien` và mở một đường **ghi mới** từ app vào `cham_cong` ⇒ **bắt buộc chạy
skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao**.

Đã đo trước: RLS `cham_cong` sẵn chỉ cho `nv_role = 'ADMIN'` ghi, nên **không sửa policy nào**.
Phải đo lại sau khi làm xong: người cầm khoá công khai vẫn không ghi được, và tài khoản đã đăng
nhập nhưng KHÔNG phải ADMIN cũng không ghi được — kiểm bằng chính đường mới này chứ không chỉ
bằng curl.
