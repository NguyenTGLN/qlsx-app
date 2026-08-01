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

## D. Ghi xuống CSDL — một hàm RPC, xoá rồi nạp trong CÙNG một transaction

Script hiện tại `delete` sạch kỳ rồi `insert` lại, an toàn vì nằm trong một transaction SQL.
**Trình duyệt không mở được transaction qua PostgREST** — gọi rời từng lệnh thì rớt mạng giữa
chừng là cả kỳ trống rỗng và điểm chuyên cần cả công ty về 0.

Cách đúng: đẩy cả hai lệnh vào **một hàm trong CSDL**. Postgres tự bọc thân hàm trong một
transaction, nên trình duyệt gọi đúng một lệnh và hoặc ăn cả, hoặc không đổi một ly nào.

File mới `sql/rpc_nap_cham_cong.sql`:

```sql
create or replace function nap_cham_cong(p_ky text, p_dong jsonb)
returns jsonb
language plpgsql
-- search_path cố định: cùng lý do như mọi hàm khác trong dự án, để người gọi không
-- trỏ `cham_cong` sang bảng giả trong schema của họ.
set search_path = public, pg_temp
as $$
declare so_xoa int; so_nap int;
begin
  -- Chặn sớm để câu lỗi ĐỌC HIỂU ĐƯỢC. RLS bên dưới mới là thứ thật sự chặn (đã đo,
  -- xem phần Bảo mật) — dòng này chỉ để người dùng không nhận một lỗi RLS khó hiểu.
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    return jsonb_build_object('loi', 'Chỉ tài khoản quản trị mới nạp được chấm công');
  end if;

  delete from cham_cong where ky = p_ky;
  get diagnostics so_xoa = row_count;

  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_van)
  select p_ky, d.nhan_vien_id, d.ngay, d.thu, d.gio_in_sang, d.gio_in_chieu, d.gio_out,
         d.tang_ca_phut, d.di_muon_phut, d.ve_som_phut, d.nghi, d.nghi_van
  from jsonb_to_recordset(p_dong) as d(
    nhan_vien_id text, ngay date, thu text, gio_in_sang text, gio_in_chieu text,
    gio_out text, tang_ca_phut int, di_muon_phut int, ve_som_phut int,
    nghi boolean, nghi_van text);
  get diagnostics so_nap = row_count;

  return jsonb_build_object('so_xoa', so_xoa, 'so_nap', so_nap);
end $$;

revoke execute on function nap_cham_cong(text, jsonb) from anon;
```

### ⚠ Hàm này TUYỆT ĐỐI không được là `SECURITY DEFINER`

`SECURITY DEFINER` bảo Postgres chạy hàm bằng quyền chủ sở hữu và **bỏ qua RLS** — lúc đó người
cầm khoá công khai xoá sạch được cả bảng chấm công chỉ bằng một lệnh gọi. Hàm phải để **mặc định
(`INVOKER`)**, tức vẫn chịu RLS. Đo 01/08/2026 bằng một hàm nháp cùng hình dạng: gọi bằng khoá
công khai thì **xoá được 0 dòng**, dữ liệu thật còn nguyên 388 dòng. Xem phần Bảo mật.

`revoke execute … from anon` là lớp thứ hai, không phải lớp duy nhất.

### Phía trình duyệt

Một lệnh: `supabase.rpc('nap_cham_cong', { p_ky, p_dong })`. 388 dòng dạng JSON khoảng 60 KB —
nằm gọn trong thân POST, không cần chia lô.

Con số "sẽ xoá bao nhiêu dòng" hiện ở bước **xem trước** vẫn tính ở trình duyệt, từ chính dữ liệu
cũ đã đọc về để dựng bảng điểm trước/sau — không phải gọi thêm gì. Hàm trả `so_xoa` / `so_nap`
thật sau khi chạy để đối chiếu: hai con số lệch nhau là dấu hiệu có người vừa sửa dữ liệu cùng lúc.

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

Có thêm cột vào `nhan_vien`, thêm một **hàm RPC mới**, và mở một đường **ghi mới** từ app vào
`cham_cong` ⇒ **bắt buộc chạy skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao**.

### Đã đo trước khi thiết kế (01/08/2026)

| Phép thử | Kết quả |
|---|---|
| RLS `cham_cong` | `cc_ins`/`cc_upd`/`cc_del` chỉ cho `nv_role = 'ADMIN'` ⇒ **không sửa policy nào** |
| Hàm plpgsql thường (INVOKER) có còn chịu RLS không? | **Có.** Tạo hàm nháp xoá `cham_cong`, gọi bằng khoá công khai → xoá **0 dòng** |
| Dữ liệu sau phép thử | Còn nguyên 13 dòng ngày 01/07, 388 dòng cả kỳ |
| Ai gọi được hàm? | Mặc định `public` gọi được — nên phải `revoke execute … from anon` |

Hàm nháp đã xoá sau khi đo.

### Phải đo lại sau khi làm xong

1. Khoá công khai gọi `nap_cham_cong` → bị chặn, và `cham_cong` **không đổi một dòng nào**.
2. Tài khoản đã đăng nhập nhưng **không phải ADMIN** → cũng bị chặn.
3. Xác nhận hàm **không** mang `prosecdef = true`:
   `select proname, prosecdef from pg_proc where proname = 'nap_cham_cong';` → phải là `false`.
4. Cột `ten_cham_cong` là họ tên người thật ⇒ kiểm khoá công khai không đọc được `nhan_vien`.

Đo bằng chính đường mới này, không chỉ bằng `curl` trên bảng.
