# Chấm công thời gian thực từ nhóm Zalo

> Ngày: 2026-08-06 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Liên quan: workflow n8n "Zalo Trigger", `sql/create_cham_cong.sql`, `sql/rpc_nap_cham_cong.sql`,
> `src/pages/tasks/ChamCongTab.jsx`, `src/pages/tasks/TaskApp.jsx`, `src/lib/kpiTuDong.js`

## Mục tiêu

13 nhân viên kho nhắn tên mình vào nhóm Zalo **"Euromade - Chấm Công"** ba lần mỗi ngày. Lấy giờ
của những tin đó ghi thẳng vào bảng `cham_cong`, để **hai chỉ tiêu chuyên cần cập nhật ngay trong
tháng** thay vì đợi bảng Excel máy vân tay cuối tháng.

Tin của nhóm này **không được sinh hội thoại nào trong KPI Zalo** — đó không phải khách hàng.

## Bối cảnh — đã đo, không suy luận

| Đã đo (06/08/2026) | Kết quả |
|---|---|
| Nhóm chấm công có trong `zalo_messages` không | **0 tin / 25.550 tin, 435 thread.** Quét cả theo tên nhóm lẫn theo nội dung ("Hà", "Bích", "Ngoc"…) đều không có |
| Tài khoản n8n có trong nhóm không | **Có.** Ảnh nhóm cho thấy `Hà Xuyên` (chính tài khoản chạy n8n) nhắn "Xuyên" lúc 08:01 |
| ⇒ Kết luận | Nhóm đang bị chặn ở `ignoreThreads` của Zalo Trigger. Ba mã trong danh sách đó **không khớp nhóm nào** trong `zalo_groups`: `3288273518723273312` (ghi 2 lần), `4526062079113325581`, `8095429580080493978` — một trong ba là nhóm chấm công |
| `nhan_vien` đã có cột mã Zalo chưa | **Có, cột `uid_from`.** Nhưng chỉ **5/13** người kho được điền: Nguyên, Ngọc, Xuyên, Dương, Duyên. Thiếu Bích, Hĩu, Thiện, Xuân, Hà, Phong, Thơ, Tuấn |
| Ai là "13 người kho" | Đúng bằng tập `nhan_vien.ten_cham_cong is not null` — 13 dòng, khớp đúng người có chấm công |
| Tên hiển thị Zalo có dùng để nhận người được không | **Không.** `ERM Trại Gà`→"Hà", `ERM Bếu Ú`→"Xuân", `Kỹ Thuật Thế Giới Lọc Nước`→"phong" |
| `cham_cong.nghi_text` | Đã có, ba giá trị thật trong dữ liệu: `Nghỉ` (11), `Nghỉ sáng` (7), `Nghỉ chiều` (1) |
| `tang_ca_phut` có ảnh hưởng điểm chuyên cần không | **Không.** Chỉ xuất hiện ở `chamCongExcel.js`, `NapChamCong.jsx:260`, `ChamCongTab.jsx:46,562`. Hai luật chuyên cần chỉ dùng `di_muon_phut`, `ve_som_phut`, `nghi` |
| `ve_som_phut` trong dữ liệu thật | **0/388 dòng có giá trị > 0.** Máy chấm công đã ngừng xuất cột này ⇒ chấm tay sẽ là nguồn DUY NHẤT |
| `nap_cham_cong` xử lý kỳ thế nào | `delete from cham_cong where ky = p_ky` rồi chèn lại ⇒ nạp Excel **xoá sạch mọi dòng của kỳ**, kể cả dòng Zalo |
| Nơi đọc `cham_cong` | 3 nơi: `kpiDuLieu.js:127`, `ChamCongTab.jsx:84`, `NapChamCong.jsx:203` |
| Số bảng cascade khi xoá nhân viên | Hiện **4** (`kpi_chi_tieu`, `cham_cong`, `chuyen_can_ngoai_le`, `cai_tien`), đã được xử ở `TaskApp.jsx:1542-1549` |

## Quyết định của chủ app (06/08/2026)

| Câu hỏi | Chốt |
|---|---|
| Áp cho ai | **Chỉ 13 người kho.** Người khác trong nhóm 27 người: lưu tin thô, không sinh dòng chấm công |
| Ngày làm việc không nhắn gì | **Tính là nghỉ, trừ điểm ngay** |
| Tin thế nào là chấm công | **Nội dung chứa tên của chính người gửi** |
| Ghi vào đâu | **Thẳng vào `cham_cong`**, cuối tháng Excel đè lên |
| Đi muộn sáng + chiều | **Cộng lại** |
| Nhắn sáng không nhắn chiều | **`Nghỉ chiều` — 0,5 ngày** (đối xứng cho buổi sáng) |
| Chiều T7 tuần chẵn | **Thứ 7 lần thứ 2 và lần thứ 4 của tháng** |
| Sửa `nap_cham_cong` để giữ về sớm chấm tay | **Không.** Giữ nguyên hàm; bù bằng nút áp lại + cảnh báo lệch |

## Ngoài phạm vi

- **Không** sửa `nap_cham_cong` (chủ app chốt).
- **Không** đụng `kpiDuLieu.js` và `NapChamCong.jsx` — dòng Zalo nằm ngay trong `cham_cong` nên
  hai nơi đó tự có, không cần biết gì thêm.
- **Không** đổi luật chấm điểm chuyên cần (`kpiTuDong.js`).
- **Không** suy ra `tang_ca_phut` và `gio_out` từ Zalo. Một tin lúc bắt đầu tăng ca không nói được
  tăng ca bao nhiêu phút; bịa số vào cột người khác đang đọc là kiểu sai âm thầm.
- **Không** sinh dòng chấm công cho ~14 người ngoài 13 người kho.
- **Không** làm màn hình sửa tay `di_muon_phut` / `nghi`. Lần này chỉ thêm chấm tay **về sớm**.

---

## A. Dữ liệu

Ba thay đổi, đều trong một tệp `sql/cham_cong_zalo.sql`, chạy tay, chạy lại an toàn.

### A1. Bảng tin thô `zalo_cham_cong`

```sql
create table if not exists zalo_cham_cong (
  id          bigserial primary key,
  thread_id   text   not null,
  uid_from    text   not null,          -- KHOÁ NHẬN NGƯỜI. Không dùng sender_name.
  sender_name text,                      -- chỉ để người soát nhìn, không tham gia tính toán
  content     text,
  ts          bigint not null,           -- ms epoch từ Zalo
  ngay        date   not null,           -- ngày giờ VN, do trigger điền (xem dưới)
  created_at  timestamptz default now(),
  constraint zalo_cham_cong_khong_trung unique (uid_from, ts)
);
create index if not exists zalo_cham_cong_ngay_idx on zalo_cham_cong (ngay, uid_from);
```

`unique (uid_from, ts)` để n8n gửi lại (retry, chạy lại workflow) không nhân đôi tin.

`ngay` do một trigger `before insert` điền, **không** dùng cột sinh (`generated always as`):
`timestamptz at time zone <text>` là STABLE chứ không IMMUTABLE nên Postgres từ chối làm cột sinh.
Cũng không để n8n tự tính — múi giờ tính sai bên ngoài CSDL là loại lỗi lệch đúng một ngày, rất
khó thấy.

```sql
create or replace function zalo_cham_cong_dat_ngay() returns trigger
language plpgsql as $$
begin
  new.ngay := (to_timestamp(new.ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::date;
  return new;
end $$;
```

Trigger này **chỉ điền một cột ngày**. Nó không đụng gì tới `zalo_conversations` — đó là điểm khác
căn bản với trigger của `zalo_messages`, và là lý do bảng này tồn tại riêng.

### A2. Cột `cham_cong.nguon`

```sql
alter table cham_cong add column if not exists nguon text not null default 'MAY'
  check (nguon in ('MAY','ZALO'));
```

388 dòng cũ tự thành `'MAY'`. **`nap_cham_cong` không phải sửa** — hàm đó liệt kê cột rõ ràng
(`rpc_nap_cham_cong.sql:63-66`), cột mới lấy giá trị mặc định `'MAY'`.

Cột này không phải để trang trí: nó là điều kiện khiến Zalo **không bao giờ đè được** dòng của máy
vân tay (xem D1).

### A3. Bảng `ve_som_tay`

Cùng khuôn với `chuyen_can_ngoai_le` đang có (`ky, nhan_vien_id, ngay, ly_do, nguoi_ghi, created_at`):

```sql
create table if not exists ve_som_tay (
  id           bigserial primary key,
  ky           text not null,
  nhan_vien_id text not null references nhan_vien(id) on delete cascade,
  ngay         date not null,
  so_phut      int  not null check (so_phut > 0),
  ly_do        text not null,
  nguoi_ghi    text,
  created_at   timestamptz default now(),
  constraint ve_som_tay_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);
```

`ly_do` **bắt buộc**: cột này trừ điểm chuyên cần, mà chuyên cần gắn thẳng với lương thưởng. Một
con số không kèm lý do là thứ không cãi lại được khi có người thắc mắc ba tháng sau.

> ### ⚠ Bảng này là bảng cascade THỨ NĂM
>
> `TaskApp.jsx:1525-1549` ghi rõ "BỐN bảng dưới đây đều có FK `on delete cascade`". Thêm
> `ve_som_tay` là thành **năm**. **Phải thêm một dòng update vào luồng đổi mã nhân viên**, không thì
> đổi mã một người là xoá sạch về sớm chấm tay của họ — không cảnh báo, giao diện vẫn báo thành
> công. Đúng loại lỗi bản bàn giao 01/08 đã bắt được một lần rồi. Chú thích ở đầu khối cũng phải
> sửa từ "BỐN bảng" thành "NĂM bảng".
>
> `nhan_vien.uid_from` thì **không cần làm gì** — dòng mới được tạo bằng `{...oldNoPw, ...data}`
> (`TaskApp.jsx:1509`) nên cột đó đi theo sẵn. Chỉ `ten_cham_cong` bị tách riêng vì vướng chỉ mục
> duy nhất.

---

## B. Luồng n8n

### B1. Bỏ nhóm chấm công khỏi `ignoreThreads`

Việc đầu tiên, không có nó thì mọi thứ còn lại vô nghĩa. Xoá đúng một mã trong ô `ignoreThreads`
của node **Zalo Trigger**. Giữ nguyên các mã còn lại.

### B2. Thêm một nhánh, không sửa nhánh cũ

```
Zalo Trigger
   │
   ├── threadId == <MÃ NHÓM CHẤM CÔNG> ──→ [Supabase] insert zalo_cham_cong
   │                                          └──→ [Supabase] rpc dung_cham_cong_zalo(hôm nay, hôm nay)
   │
   └── còn lại ──────────────────────────→ If1 → If → Create a row / Create a row1   (KHÔNG ĐỔI)
```

Node `If` mới đặt **ngay sau Zalo Trigger, trước `If1`**. Nhánh false nối thẳng vào `If1` như cũ,
nên hành vi của mọi nhóm khác không đổi một ly.

### B3. Thêm Schedule Trigger chốt ngày

Trigger thứ hai trong cùng workflow, chạy **17:15 mỗi ngày**, gọi
`dung_cham_cong_zalo(<hôm nay>, <hôm nay>)`.

Vì sao 17:15 mà không phải 12:15: khung nhận tin buổi chiều đóng lúc 17:00. Chốt lúc 12h15 là gạch
`Nghỉ chiều` cho cả 13 người **trước khi họ kịp nhắn lúc 13:30**.

Vẫn cần lượt chạy này dù mỗi tin đã gọi hàm: ngày nào không ai nhắn buổi chiều thì không có tin nào
kích hoạt, mà đó đúng là ngày cần chốt nhất.

---

## C. Luật

### C1. Nhận người và nhận tin

Ghép người bằng `uid_from` → `nhan_vien.uid_from`. Tin được coi là chấm công khi **nội dung chứa
`nhan_vien.name` của chính người gửi**, so **không dấu, không phân biệt hoa thường, theo TỪ** (tách
theo ký tự không phải chữ/số).

Ba chi tiết đều rút từ ảnh chụp nhóm ngày 06/08, không phải giả định:

| Vì sao phải thế | Bằng chứng trong ảnh |
|---|---|
| **Phải bỏ dấu** | `Ba Ngoc` gõ "Ngoc", tên trong app là "Ngọc" |
| **Phải theo từ, không theo chuỗi con** | Tên "Hà" bỏ dấu thành `ha`, nằm trong "thang", "khach", "nhanh" |
| **Phải so với tên CỦA CHÍNH NGƯỜI GỬI, không quét cả 13 tên** | Tin của Thiện: *"Như đã xin phép GDKT **nguyên**,,em có việc, cho em xin nghỉ 2 ngày ạ"* — chứa "nguyên" là tên một người khác trong 13. Quét cả danh sách là ghi nhầm Thiện thành có mặt |

Cả 13 tên gọi đều một từ (Bích, Hĩu, Nguyên, Thiện, Xuân, Hà, Ngọc, Phong, Thơ, Tuấn, Xuyên, Dương,
Duyên) nên không cần xử lý tên nhiều từ.

Đối chiếu tay trên 19 tin trong hai ảnh: `phong` ✓ `Xuyên` ✓ `Tú` (ngoài 13, bỏ) `Xuân` ✓ `linh`
(ngoài 13) `Quỳnh` (ngoài 13) `Thuý trực showroom ạ` ✓ `Hằng` (ngoài 13) `Tâm 5AM` ✓ `Minh Anh`
(ngoài 13) `Bích` ✓ `Thơ` ✓ `Vân Anh` (ngoài 13) `Sáng` (ngoài 13) `Ngoc` ✓ tin xin nghỉ của Thiện
**bị loại** ✓ `Dương` ✓ `Hà` ✓ `Phát` (ngoài 13).

### C2. Ba khung giờ

| Buổi | Khung nhận tin (giờ VN) | Giờ chuẩn | Ghi vào |
|---|---|---|---|
| Sáng | 04:00 – 11:59 | **08:00** | `gio_in_sang` |
| Chiều | 12:00 – 16:59 | **13:30** | `gio_in_chieu` |
| Tăng ca | từ 17:00 | — | chỉ lưu tin thô, `tang_ca_phut` để **trống** |

Mỗi buổi lấy **tin hợp lệ đầu tiên**. Nhắn lại lần hai trong cùng buổi thì bỏ qua.

### C3. Quy ra số

```
di_muon_phut = max(0, giờ_sáng − 08:00) + max(0, giờ_chiều − 13:30)
ve_som_phut  = coalesce(ve_som_tay.so_phut, 0)        -- Zalo không có tin lúc về
gio_out      = null
tang_ca_phut = null
nguon        = 'ZALO'
ky           = to_char(ngay,'YYYY-MM')
thu          = 'T2'…'T7' / 'CN'
```

| Có tin sáng | Có tin chiều | `nghi` | `nghi_text` | Ngày nghỉ |
|---|---|---|---|---|
| ✓ | ✓ | false | null | 0 |
| ✓ | ✗ | true | `Nghỉ chiều` | 0,5 |
| ✗ | ✓ | true | `Nghỉ sáng` | 0,5 |
| ✗ | ✗ | true | `Nghỉ` | 1 |

`Nghỉ sáng` / `Nghỉ chiều` đã được `trongSoNgayNghi()` (`kpiTuDong.js:272`) quy thành 0,5 ngày sẵn —
không phải viết luật mới.

### C4. Ngày nào được xét

```
ngày làm việc   = T2…T7  (extract(dow) between 1 and 6)
xét buổi chiều  = không phải (T7 và ceil(ngày_trong_tháng / 7) in (2,4))
```

`ceil(day/7)` cho đúng thứ tự thứ 7 trong tháng: ngày 1–7 → lần 1, 8–14 → lần 2, 15–21 → lần 3,
22–28 → lần 4. Chủ nhật không xét gì cả.

### C5. ⚠ Van an toàn — theo TỪNG BUỔI, không phải từng ngày

Với mỗi ngày:

```
xét_sáng  = có ÍT NHẤT MỘT người trong 13 có tin sáng hợp lệ
xét_chiều = có ÍT NHẤT MỘT người trong 13 có tin chiều hợp lệ  AND  xét buổi chiều (C4)
```

Buổi nào `xét_* = false` thì **không ghi thiếu buổi đó cho bất kỳ ai**. Cả hai đều false thì bỏ qua
ngày đó hoàn toàn, không ghi dòng nào.

Van phải đặt theo **buổi** chứ không theo **ngày**: n8n chết lúc 12h trưa thì cả 13 người vẫn đủ
tin sáng nhưng trắng tin chiều — van theo ngày sẽ thấy "ngày này có người nhắn" và gạch `Nghỉ chiều`
cho đủ 13 người, mất 0,5 ngày mỗi người, không ai biết vì sao.

Van này che ba trường hợp cùng lúc: **ngày lễ** (2/9 sắp tới, Tết), **n8n chết**, và **Zalo đổi
phiên đăng nhập**.

---

## D. Hàm CSDL

### D1. `dung_cham_cong_zalo(p_tu date, p_den date) returns jsonb`

Một hàm, ba chỗ dùng:

| Gọi từ | Tham số | |
|---|---|---|
| n8n, mỗi khi có tin | `(hôm nay, hôm nay)` | phần "thời gian thực" |
| n8n, 17:15 hằng ngày | `(hôm nay, hôm nay)` | lượt chốt chắc chắn xảy ra |
| Nút trong app | `(từ, đến)` | dựng lại một khoảng ngày từ tin thô |

Tính lại **từ đầu** từ `zalo_cham_cong` mỗi lần chạy, nên chạy bao nhiêu lần cũng ra cùng kết quả.

**Chốt hay chưa là do HÀM tự quyết theo từng ngày, không phải tham số của người gọi:**

```
đã đóng sổ(ngày) = ngày < hôm nay  OR  giờ VN hiện tại >= 17:00
```

- Ngày **đã đóng sổ** → áp đủ bảng C3 + van C5, sinh cả dòng nghỉ.
- Ngày **chưa đóng sổ** (tức hôm nay, trước 17:00) → chỉ ghi dòng **có mặt** cho người đã có tin,
  không sinh dòng nghỉ nào.

> ⚠ Bản nháp đầu của thiết kế này để `p_chot` làm tham số. Sai, và sai kiểu im lặng: sau khi lượt
> 17:15 đã chốt, một tin tăng ca lúc 18:00 sẽ kích hoạt n8n gọi lại hàm với `p_chot = false`, hàm
> tính lại từ đầu và **xoá sạch cờ nghỉ vừa chốt** — cả 13 người bỗng thành đi làm đủ. Để hàm tự
> quyết theo đồng hồ thì đường đó không tồn tại.

Vì sao không chốt luôn ngay từ tin đầu tiên: lúc 07:27 mới một người nhắn, chốt luôn là bảng KPI
hiện "12 người nghỉ" rồi sửa dần suốt buổi sáng — ai mở màn hình lúc đó thấy một con số sai.

**Chốt chặn ghi — không được bỏ:**

```sql
insert into cham_cong (...) values (...)
on conflict (nhan_vien_id, ngay) do update set ...
where cham_cong.nguon = 'ZALO'
```

Ngày nào Excel đã nạp thì dòng đó `nguon = 'MAY'`, điều kiện sai, **Zalo không chạm vào được**.
Không có mệnh đề `where` này thì nguồn yếu hơn (ai nhớ nhắn) đè lên nguồn mạnh hơn (ai quẹt vân tay).

### D2. `ap_lai_ve_som_tay(p_ky text) returns jsonb`

Một lệnh `update cham_cong set ve_som_phut = v.so_phut from ve_som_tay v where …`. Chạy lại bao
nhiêu lần cũng ra cùng kết quả.

Dùng sau khi nạp Excel: `nap_cham_cong` xoá trọn kỳ nên bản phản chiếu về sớm trong `cham_cong` về
0. **Dữ liệu gốc không mất** — nó nằm ở bảng `ve_som_tay` mà hàm nạp không đụng tới. Rớt mạng giữa
chừng thì bấm lại, không có trạng thái dở dang.

Về sớm chấm tay **thắng cả số của máy**, cùng nguyên tắc "điểm chốt tay thắng điểm tự động" mà
`luatChuyenCanCaNhan` đang dùng (`nhuongChamTay`, `kpiTuDong.js:339`).

---

## E. Giao diện — chỉ tab Chấm công

Sáu phần thêm vào `ChamCongTab.jsx`. Không sửa logic đang có, chỉ thêm.

1. **Cột Nguồn** — `Máy` / `Zalo` trên từng dòng. Thiếu cột này thì không ai giải thích được vì sao
   số hôm nay khác số cuối tháng.
2. **Chấm về sớm** (quyền `edit`) — mỗi dòng một nút: nhập **số phút** + **lý do bắt buộc**, lưu kèm
   người ghi. Sửa/xoá được. Ngày chưa có dòng chấm công thì tạo dòng luôn, không thì không chấm được
   về sớm cho người hệ thống chưa chốt.
3. **Băng cảnh báo lệch** — có dòng trong `ve_som_tay` mà `cham_cong.ve_som_phut` đang khác thì hiện
   "có N dòng về sớm chấm tay chưa được áp lại". Để mất mát **lộ ra** thay vì âm thầm.
4. **Nút "Áp lại về sớm chấm tay"** (quyền `edit`) — gọi D2.
5. **Ô nối mã Zalo** (quyền `edit`) — liệt kê `uid_from` xuất hiện trong `zalo_cham_cong` mà chưa
   khớp `nhan_vien.uid_from`, kèm tên hiển thị và nội dung gần nhất; chọn nhân viên → ghi
   `nhan_vien.uid_from`. Cùng nếp với màn hình nối tên Excel đã có.
6. **Nút "Dựng lại từ Zalo"** theo khoảng ngày (quyền `edit`) — gọi D1.

⚠ Ô nối mã ở mục 5 **phải chọn kỹ ngay lần đầu**, cùng cảnh báo như nối tên Excel: chọn nhầm là
chấm công của người này chảy sang người khác mỗi ngày. Khác một điểm có lợi: ở đây sửa lại được
ngay trong chính ô đó.

---

## F. Bảo mật

Bắt buộc chạy skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao, và **đo bằng chính khoá công
khai lấy trong `src/lib/supabase.js`**, trên dòng có thật.

- `zalo_cham_cong` và `ve_som_tay`: bật RLS. `select` cho `authenticated`; `insert/update/delete`
  chỉ `nv_role = 'ADMIN'`. Cùng bốn policy như `cham_cong` (`create_cham_cong.sql:50-64`).
- Hai hàm ở mục D: **tuyệt đối không `security definer`**. Để mặc định (invoker) thì chúng vẫn chịu
  RLS; là definer thì người ngoài cầm khoá công khai ghi đè được cả bảng chấm công.
- `revoke execute … from public` **và** `from anon`, rồi `grant to authenticated`. Đo 01/08 đã
  chứng minh `revoke from anon` một mình **không đủ** — `anon` thừa hưởng quyền qua `PUBLIC`.
- n8n dùng khoá `sb_secret` (đổi 31/07) nên bỏ qua RLS — đúng như cách nó đang ghi `zalo_messages`.
- ⚠ Nhắc lại cảnh báo của `create_cham_cong.sql:68`: `sql/security_3_rls_lockdown.sql` quét **mọi**
  bảng public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại tệp đó sau tệp này là **mở
  toang** hai bảng mới. Phải ghi cảnh báo tương tự vào đầu `sql/cham_cong_zalo.sql`.

Kiểm chứng bắt buộc, bằng khoá công khai:

| Phép thử | Kỳ vọng |
|---|---|
| Đọc `zalo_cham_cong` (chứa tin nhắn nhân viên) | 0 dòng |
| Chèn / sửa / xoá `zalo_cham_cong`, dòng có thật | bị chặn |
| Đọc / ghi `ve_som_tay` | bị chặn |
| Gọi `dung_cham_cong_zalo` | `42501 permission denied` |
| Gọi `ap_lai_ve_som_tay` | `42501 permission denied` |
| Đếm lại dữ liệu sau các phép thử | không dòng nào đổi |

---

## G. Kiểm thử

Hàm so tên nằm trong SQL, **không viết bản sao bằng JS để test**. Hai bản luôn lệch nhau — đúng lỗi
`scripts/import-cham-cong.mjs` đã mắc (bản bàn giao 01/08 mục 5: bốn hành vi khác nhau từ cùng một
tệp). Thay vào đó dùng đúng cách đã chứng minh hôm 01/08: **chạy hàm thật trên kỳ rác rồi dọn**.

### G1. Hàm so tên — 19 tin thật

Chèn đúng 19 tin trong hai ảnh vào `zalo_cham_cong` với ngày rác (`1900-01-05`…), chạy D1, so kết
quả. Bắt buộc đúng:

- `Ngoc` khớp `Ngọc` (không dấu).
- Tin xin nghỉ của Thiện **bị loại**, dù chứa "nguyên".
- `Tâm 5AM`, `Thuý trực showroom ạ` **được nhận**.
- Tên "Hà" **không** khớp một chuỗi chứa "khach".
- 10 người ngoài 13 **không** sinh dòng nào.

### G2. Hàm dựng

- Đủ 4 tổ hợp sáng/chiều ở bảng C3.
- Đi muộn cộng dồn: sáng 08:10 + chiều 13:45 → `di_muon_phut = 25`.
- Ngày đã có dòng `nguon='MAY'` → **không bị đè** (kiểm cả nội dung dòng, không chỉ số dòng).
- Buổi cả nhóm im lặng → không sinh dòng nghỉ nào.
- Cả ngày im lặng → không sinh dòng nào.
- T7 lần 2 và lần 4 → thiếu tin chiều **không** bị ghi `Nghỉ chiều`; T7 lần 1, 3, 5 thì có.
- **Ngày chưa đóng sổ** (hôm nay, trước 17:00) → không sinh dòng nghỉ cho ai.
- **Chốt rồi chạy lại không mất cờ nghỉ**: chạy cho một ngày quá khứ đã chốt, rồi chạy lại ngay →
  cờ `nghi` và `nghi_text` còn nguyên. Đây là lỗi bản nháp D1 mắc phải, phải có test khoá lại.
- Chạy hai lần liên tiếp → kết quả y hệt.
- Khoảng ngày hoàn toàn không có tin thô (ví dụ cả tháng 7) → **không sinh dòng nào**, không biến
  cả tháng thành nghỉ.
- `ve_som_tay` có dòng → `ve_som_phut` không bị dựng lại về 0.

### G3. Không hỏng luồng cũ

- **`zalo_conversations` không có thêm dòng nào** từ nhóm chấm công. Đếm trước/sau.
- Nạp Excel + bảng xem trước chạy y như trước (kỳ rác, không đụng dữ liệu thật).
- **Đổi mã nhân viên**: đổi mã một người có dòng `ve_som_tay` → sau khi đổi, dòng đó **còn nguyên**.
  Đây là luồng thiết kế này làm hỏng nếu quên mục A3, và là luồng đã hỏng thật một lần.
- Tab Chấm công: bảng xem, ô chọn tháng, miễn trừ có giải trình hoạt động như cũ.

### G4. Dọn sạch

Xoá hết dữ liệu kỳ rác và tin thô thử nghiệm. Ghi lại số dòng thật trước/sau để chứng minh không
đụng gì.

---

## H. Việc phải làm trước — không có thì không chạy được

1. **Xác định mã nhóm chấm công**: một trong `3288273518723273312` / `4526062079113325581` /
   `8095429580080493978`.
2. **Nối mã Zalo cho 8 người còn thiếu**: Bích, Hĩu, Thiện, Xuân, Hà, Phong, Thơ, Tuấn. Làm được
   bằng ô ở mục E5 sau khi tin bắt đầu chảy vào — không cần biết trước con số.

Trước khi làm xong bước 2, **8 người đó bị ghi nghỉ mỗi ngày**. Nên thứ tự triển khai phải là: bật
thu tin thô → nối đủ 13 mã → mới bật đường ghi vào `cham_cong`.

---

## I. Chủ app sẽ thấy khác đi những gì

1. **Điểm chuyên cần trong tháng nhẹ hơn số cuối tháng.** Zalo không có `ve_som_phut`, mà chuyên cần
   **bộ phận** có tính về sớm. Nạp Excel xong điểm bộ phận có thể tụt.
2. **Điểm nhảy khi nạp Excel.** Số Zalo là "ai nhớ nhắn", số máy là "ai quẹt vân tay". Hai thứ không
   bao giờ trùng khít.
3. **Ai quên nhắn bị trừ oan cho tới cuối tháng.** Hệ quả trực tiếp của quyết định "không nhắn =
   nghỉ". Gỡ bằng miễn trừ có giải trình (`chuyen_can_ngoai_le`) như hiện nay.
4. **Sau mỗi lần nạp Excel phải bấm "Áp lại về sớm chấm tay".** Băng cảnh báo sẽ nhắc, không phải
   tự nhớ.
