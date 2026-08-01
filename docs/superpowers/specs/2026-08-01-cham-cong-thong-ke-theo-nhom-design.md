# Chấm công — lọc & thống kê theo nhóm, bảng phân nhóm

> Ngày: 2026-08-01 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Liên quan: [miễn trừ chuyên cần](2026-07-24-kpi-chuyen-can-ngoai-le-design.md), [module KPI](2026-07-21-kpi-module-design.md),
> `src/pages/tasks/ChamCongTab.jsx`, `src/lib/kpiTuDong.js`, `src/lib/kpiWriteGuard.js`

## Mục tiêu

Tab **Chấm công** hiện chỉ có một lưới lịch 31 cột và 3 cột tổng thô. Muốn biết "bộ phận Sản
xuất tháng này nghỉ quá phép mấy ngày" thì phải tự cộng bằng mắt. Thêm ba thứ:

1. **Bộ lọc theo nhóm** — xem riêng Bảo hành / CSKH / Sản xuất / Toàn công ty.
2. **Khối thống kê** hai cấp (nhóm → từng nhân viên) với 5 con số: tổng ngày nghỉ, số ngày
   nghỉ phép, số ngày nghỉ quá quy định, số phút đi muộn, số phút về sớm.
3. **Bảng phân nhóm** — màn hình con cho admin xếp từng nhân viên vào nhóm.

## Bối cảnh & ràng buộc (đã xác minh trên DB thật, kỳ 2026-07)

- Nhóm chuyên cần **đã tồn tại** trong `kpi_chi_tieu`: dòng `ma='CHUYEN_CAN_BO_PHAN'`,
  `cap_do='CA_NHAN'`, cột `lien_ket_bo_phan` là khoá nhóm. Bốn nhóm đang dùng:

  | Khoá | Nhãn (từ dòng `cap_do='BO_PHAN'`) | Người |
  |---|---|---|
  | `CHUYEN_CAN_BH` | CHUYÊN CẦN BỘ PHẬN — BẢO HÀNH | nbn, ndp |
  | `CHUYEN_CAN_CSKH` | CHUYÊN CẦN BỘ PHẬN — CSKH | hhx, nttd, nv8 |
  | `CHUYEN_CAN_SX` | CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT | dvx, lvb, ntth, nvh, nxt, ptt, vta |
  | `CHUYEN_CAN_TOAN_CTY` | CHUYÊN CẦN — TOÀN CÔNG TY | admin |

- Nhóm lưu **theo từng kỳ**. `rpc_tao_ky_kpi` chép `lien_ket_bo_phan` sang kỳ mới
  (`sql/rpc_tao_ky_kpi.sql:38`) → xếp một lần là các kỳ sau tự có.
- Kỳ 2026-06 chỉ có **một** nhóm chung `CHUYEN_CAN_BO_PHAN` cho cả 13 người. Việc chia 4 nhóm
  bắt đầu từ kỳ 2026-07. Bảng phân nhóm phải chịu được cả hai hình thái.
- Điểm chuyên cần bộ phận tính **live lúc hiển thị** (`apDungChamTuDong` trong `KpiTab.jsx`),
  trên **trung bình đầu người** của nhóm. Không có job nền, không có bảng điểm đã tính sẵn.
- `luatChuyenCanBoPhan` **không** trả `nhuongChamTay` → điểm tự động luôn đè điểm chốt tay.
  Nên đổi nhóm là điểm bộ phận đổi ngay, không có gì chặn lại.
- RLS `kpi_chi_tieu`: `kpi_ct_sel` là `for select to authenticated using (true)` → **mọi tài
  khoản đã đăng nhập đọc được**, tab Chấm công sẽ không vỡ với nhân viên thường. Ghi/sửa/xoá
  đòi `auth.jwt()->>'nv_role' = 'ADMIN'`.
- `ve_som_phut` của dòng `nghi_van` đã bị `scripts/import-cham-cong.mjs` đặt về 0 lúc nạp.
  Module thống kê **không** tự xử lý `nghi_van` lần nữa — làm thế là trừ hai lần.
- Tab `cham_cong` có cap `['view','edit']` (`src/lib/permRegistry.js:46`), `perm.edit` đang
  dùng để bật nút "Đánh dấu đặc biệt".

## Ngoài phạm vi (không làm lần này)

- **Không** tạo bảng DB mới, không sửa bảng nào.
- **Không** tạo/đổi tên/xoá nhóm — chỉ xếp người vào 4 nhóm sẵn có. Thêm nhóm mới sẽ sinh
  thêm một dòng chỉ tiêu KPI cho mọi thành viên, là việc riêng cần bàn riêng.
- **Không** sửa `kpiTuDong.js`, `KpiTab.jsx`, `TaskApp.jsx`.
- **Không** đổi ngưỡng trừ điểm hay số ngày phép.
- **Không** đụng 3 cột tổng hiện có của lưới lịch (lý do ở mục C1).

---

## A. Nguồn dữ liệu

Thêm đúng **một** truy vấn vào `ChamCongTab.jsx`, nằm trong `taiDuLieu()`:

```js
supabase.from('kpi_chi_tieu')
  .select('id, ky, cap_do, nhan_vien_id, lien_ket_bo_phan, ten, ma')
  .eq('ky', ky)
  .eq('ma', 'CHUYEN_CAN_BO_PHAN')
```

Trả về cả dòng `cap_do='CA_NHAN'` (ai thuộc nhóm nào) lẫn `cap_do='BO_PHAN'` (nhãn nhóm).

**Tải mềm, giống hệt cách `chuyen_can_ngoai_le` đang được tải**: bọc `try/catch` riêng, hỏng
thì `setNhomRows([])` chứ **không** được xoá bảng chấm công đang hiển thị. Mất nhóm thì tab
lui về hành vi như hôm nay (một danh sách phẳng, không lọc được) — vẫn dùng được.

---

## B. Module thuần `src/lib/chamCongThongKe.js`

Hàm thuần, không chạm Supabase, không chạm React. Cùng nếp `stagingMove.js` / `kpiTuDong.js`.

### B1. `docNhomTuKpi(kpiRows)`

```js
// → { theoNguoi: Map(nhan_vien_id → khoaNhom), nhan: Map(khoaNhom → nhãn hiển thị) }
```

- `theoNguoi` từ các dòng `cap_do === 'CA_NHAN'` có `nhan_vien_id` và `lien_ket_bo_phan`.
- `nhan` từ các dòng `cap_do === 'BO_PHAN'`: `lien_ket_bo_phan → ten`. Nhãn rút gọn bằng cách
  cắt phần sau dấu `—` nếu có ("CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT" → "SẢN XUẤT"); không có dấu `—`
  thì giữ nguyên cả chuỗi.
- Nhóm xuất hiện ở dòng CA_NHAN mà **không** có dòng BO_PHAN tương ứng: vẫn là một nhóm hợp
  lệ, nhãn = chính khoá. Không được im lặng bỏ người.

### B2. `thongKeMotNguoi(rows, laMien)`

`rows` = các dòng `cham_cong` của một người trong kỳ. `laMien(ngay)` → boolean, tra
`chuyen_can_ngoai_le`.

```js
// → { tongNghi, nghiPhep, nghiQuaQuyDinh, phutMuon, phutVeSom, soNgayMien }
```

Công thức — quy ước "kết hợp", chủ app chốt 01/08/2026:

```
nghiCoDau      = số dòng có nghi === true VÀ laMien(ngay)
nghiChuaDau    = số dòng có nghi === true VÀ !laMien(ngay)
tongNghi       = nghiCoDau + nghiChuaDau
nghiPhep       = nghiCoDau + min(nghiChuaDau, NGAY_PHEP_THANG)
nghiQuaQuyDinh = max(0, nghiChuaDau − NGAY_PHEP_THANG)
phutMuon       = tổng di_muon_phut của các dòng !laMien(ngay)
phutVeSom      = tổng ve_som_phut  của các dòng !laMien(ngay)
```

`NGAY_PHEP_THANG` **import từ `kpiTuDong.js`**, không chép số 1 vào đây. Hôm nào chủ app đổi
số ngày phép thì hai chỗ đổi cùng lúc, không lệch.

> `NGAY_PHEP_THANG` hiện là hằng nội bộ của `kpiTuDong.js` (dòng 255), chưa `export`.
> Việc duy nhất được phép sửa trong tệp đó lần này là **thêm từ khoá `export`** trước hằng —
> không đổi giá trị, không đổi chỗ dùng, không đổi logic nào khác.

**Vì sao công thức này an toàn:** `nghiQuaQuyDinh` bằng đúng `vuotPhep` mà
`luatChuyenCanCaNhan` dùng để trừ điểm (`kpiTuDong.js:336`) — nó cũng lọc bỏ ngày miễn trước
rồi mới trừ 1 ngày phép. Bảng thống kê không thể mâu thuẫn với điểm KPI. Có test khoá điều này.

**`phutMuon` là TỔNG số phút, không phải căn cứ trừ điểm.** KPI cá nhân chỉ đếm *số ngày* muộn
quá 5 phút và chia hai bậc 6–15 / trên 15 phút (`kpiTuDong.js:329-332`); KPI bộ phận mới dùng
tổng phút, và chia trung bình đầu người. Người xem thấy "275 phút" ở đây rồi so với điểm trừ
sẽ không ra cùng một phép tính — đó là đúng, vì bảng này trả lời "muộn bao nhiêu", không phải
"bị trừ mấy điểm". Cột GHI CHÚ trong tab KPI mới là chỗ trả lời câu sau.

### B3. `thongKeNhom(dsCaNhan)`

Cộng dồn 5 con số của các thành viên + `soNguoi = dsCaNhan.length`. Không tính trung bình ở
đây — trung bình đầu người là chuyện của điểm KPI, không phải của bảng thống kê.

### B4. `gomThongKe({ rows, ngoaiLe, kpiRows, users })`

Hàm gom một phát cho UI dùng:

```js
// → [{ khoa, nhan, soNguoi, ...5 số..., thanhVien: [{ id, ten, ...5 số... }] }]
```

- Sắp nhóm theo **số người giảm dần**, hoà thì theo nhãn (`localeCompare` 'vi'). Thành viên
  trong nhóm sắp theo tên.
- Người có trong `cham_cong` mà không có trong `theoNguoi` → dồn vào nhóm giả
  `khoa = null`, nhãn **"Chưa phân nhóm"**, luôn xếp **cuối**.
- Tên người lấy từ `users`, không thấy thì lấy `id` — y hệt `dsNhanVien` hiện có.

---

## C. Giao diện `ChamCongTab.jsx`

### C1. Giữ nguyên lưới lịch và 3 cột tổng

3 cột `Muộn (phút) / Về sớm (phút) / Nghỉ (ngày)` hiện tại là **số thô, tính trên mọi ngày kể
cả ngày Đặc biệt**. Giữ y nguyên.

Con số trong khối thống kê mới **đã trừ ngày Đặc biệt** nên sẽ lệch với 3 cột cũ — ví dụ CSKH
kỳ 7 ra 14 phút thay vì 15, vì Xuyên muộn 1 phút ngày 20/07 đã được miễn. Đây là **chủ ý**:
đổi ý nghĩa một con số người dùng đang quen đọc là cách chắc nhất để họ đọc sai. Hai khối có
nhãn riêng, và khối thống kê ghi rõ "đã trừ ngày đánh dấu Đặc biệt".

### C2. Thanh lọc

Thêm ô `<select>` nhóm cạnh ô chọn tháng: *Tất cả nhóm* (mặc định) + từng nhóm có người trong
kỳ + *Chưa phân nhóm* (chỉ hiện khi thật sự có người như vậy).

Lọc tác động lên **cả** khối thống kê **và** lưới lịch bên dưới. Dòng đếm hiện có đổi thành
`"{n} nhân viên · {m} ngày công · {k} dòng dữ liệu đáng ngờ"` tính trên tập đã lọc, kèm hậu tố
`" (lọc theo {tên nhóm})"` khi đang lọc — để không ai tưởng công ty chỉ còn 3 người.

### C3. Khối thống kê

Đặt giữa thanh lọc và lưới lịch. Bảng riêng, không nhét vào lưới lịch.

```
NHÓM / NHÂN VIÊN     Người  Tổng nghỉ  Nghỉ phép  Quá quy định  Muộn(ph)  Về sớm(ph)
▾ SẢN XUẤT              7       12          6           6          354        0
    Xuân                        3           1           2          275        0
    …
▸ BẢO HÀNH              2        4          2           2          220        0
──────────────────────────────────────────────────────────────────────────────
  TỔNG                 13       19         11           8          620        0
```

- Dòng nhóm bấm được để bung/thu thành viên. Mặc định **thu hết**; đang lọc một nhóm thì
  nhóm đó **bung sẵn**.
- Tên nhân viên trong khối này bấm được, mở màn hình chi tiết từng ngày như bấm ở lưới lịch.
- Cột "Quá quy định" > 0 tô đỏ; "Nghỉ phép" tô xám. Số 0 để mờ, đừng bắt mắt đọc số 0.
- Dòng TỔNG luôn hiện, cộng trên tập đã lọc.
- Rê chuột vào tiêu đề cột "Nghỉ phép" / "Quá quy định" hiện đúng công thức ở B2 — người bị
  trừ điểm phải tự tra được vì sao, không phải đi hỏi.

### C4. Trạng thái rỗng

Kỳ không có dữ liệu chấm công: giữ nguyên câu thông báo hiện có, **không** vẽ khối thống kê
rỗng. Đọc được nhóm nhưng không đọc được `kpi_chi_tieu`: bỏ ô lọc và cột nhóm, khối thống kê
chỉ còn một nhóm "Chưa phân nhóm" gồm tất cả — vẫn có đủ 5 con số cho từng người.

---

## D. Bảng phân nhóm — màn hình con

Nút **"Phân nhóm"** cạnh thanh lọc, **chỉ hiện khi `perm.edit`**. Bấm vào mở màn hình con
(cùng cơ chế `chon` đang dùng cho màn chi tiết từng người).

```
< Quay lại        PHÂN NHÓM CHUYÊN CẦN — Kỳ 2026-07

  Bích      [ SẢN XUẤT      ▾ ]      Ngọc      [ BẢO HÀNH     ▾ ]
  Dương     [ CSKH          ▾ ]      Nguyên    [ TOÀN CÔNG TY ▾ ]
  …

⚠ Đổi nhóm sẽ làm điểm KPI "Chuyên cần bộ phận" của CẢ nhóm cũ lẫn nhóm mới
  tính lại ngay (điểm tính trên trung bình đầu người). Áp dụng cho kỳ 2026-07;
  các kỳ tạo sau sẽ tự chép nhóm này.
```

### D1. Lưu

Đổi một ô là một lệnh, lưu ngay, không có nút "Lưu tất cả":

```js
const { data, error } = await supabase.from('kpi_chi_tieu')
  .update({ lien_ket_bo_phan: khoaMoi })
  .eq('ky', ky).eq('ma', 'CHUYEN_CAN_BO_PHAN')
  .eq('cap_do', 'CA_NHAN').eq('nhan_vien_id', nvId)
  .select();
const loi = loiGhiKpi(error, data);   // src/lib/kpiWriteGuard.js
if (loi) { setLoi(loi); return; }
await taiDuLieu();
```

`.select()` + `loiGhiKpi` là **bắt buộc**, không phải trang trí: PostgREST trả 204 với
`error === null` khi RLS lọc sạch dòng. Thiếu nó thì tài khoản có `cham_cong.edit` nhưng không
phải ADMIN sẽ thấy form đóng êm, tưởng đã đổi nhóm, mà thật ra không có gì thay đổi.

### D2. Người chưa có dòng chỉ tiêu

Nhân viên có trong `cham_cong` nhưng không có dòng `CHUYEN_CAN_BO_PHAN` trong kỳ: ô chọn
**khoá**, hiện chữ *"Chưa có chỉ tiêu Chuyên cần bộ phận trong kỳ này — thêm ở tab KPI trước."*

Cố ý **không** tự `insert` dòng mới: insert là tự thêm một chỉ tiêu (chỉ tiêu 10, trọng số 5)
vào bảng KPI của người đó, tức tự đổi tổng điểm KPI của họ mà không ai yêu cầu.

Kỳ 2026-07 cả 13 người đều có dòng nên chưa gặp; nhân viên mới vào sẽ gặp.

### D3. Kỳ cũ

Không chặn sửa kỳ cũ, nhưng câu cảnh báo luôn nêu **đúng tên kỳ đang sửa** để không ai lỡ tay
đổi nhóm tháng 6 khi đang định sửa tháng 8.

---

## E. Ảnh hưởng chéo — đã báo và được chấp thuận

Chủ app chọn có chủ đích (01/08/2026): **đổi nhóm thì điểm KPI chuyên cần bộ phận tự cập nhật
theo**. Hệ quả cụ thể, ghi lại để sau này không ai tưởng là lỗi:

1. Chuyển một người khỏi nhóm A sang nhóm B làm **điểm bộ phận của cả A lẫn B đổi**, vì điểm
   tính trên trung bình đầu người. Ví dụ thật: Xuân (275 phút muộn kỳ 7) rời Sản xuất thì
   trung bình Sản xuất tụt từ ~51 xuống ~13 phút/người — đổi hẳn mức trừ điểm.
2. Điểm đổi **ngay lúc mở tab KPI**, kể cả với dòng đã có người chốt tay, vì
   `luatChuyenCanBoPhan` không nhường chấm tay.
3. Chỉ ADMIN đổi được (RLS). Tài khoản có `cham_cong.edit` mà không phải ADMIN sẽ thấy thông
   báo lỗi rõ ràng thay vì im lặng.

Không có luồng nào khác bị chạm: `cham_cong`, `chuyen_can_ngoai_le`, các chỉ tiêu KPI khác,
tab Công việc / Báo cáo / Cải tiến đều không đọc `lien_ket_bo_phan` của dòng chuyên cần.

---

## F. Test — `src/lib/chamCongThongKe.test.js` (viết trước code)

Dữ liệu thật kỳ 2026-07 làm ca kiểm:

| Ca | Vào | Ra mong đợi |
|---|---|---|
| Nghỉ nhiều, không dấu | Tuấn: 4 ngày nghỉ, 0 dấu | phép 1, quá 3 |
| Nghỉ có dấu | Xuyên: 2 nghỉ, 1 có dấu | phép 2, quá 0 |
| Không nghỉ | Duyên: 0 nghỉ | phép 0, quá 0 |
| Đúng hạn mức | Bích: 1 nghỉ, 0 dấu | phép 1, quá 0 |
| Ngày Đặc biệt không tính phút | Xuyên: muộn 1 phút ngày có dấu | phutMuon bỏ phút đó |
| **Khoá với KPI** | cùng đầu vào | `nghiQuaQuyDinh` === `vuotPhep` của `luatChuyenCanCaNhan` |
| Gom nhóm | kpiRows kỳ 7 | SX 7 người, CSKH 3, BH 2, Toàn cty 1 |
| Người ngoài nhóm | có chấm công, không có dòng KPI | vào nhóm `null`, xếp cuối |
| Nhãn nhóm | "CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT" | "SẢN XUẤT" |
| Nhóm thiếu dòng BO_PHAN | chỉ có dòng CA_NHAN | nhãn = khoá, không mất người |
| Kỳ 2026-06 | cả 13 người một nhóm | một nhóm 13 người, không vỡ |

Ca "khoá với KPI" là ca quan trọng nhất: nó gọi thẳng `apDungChamTuDong` với cùng bộ dữ liệu
rồi so con số. Lệch là test đỏ ngay, không đợi tới lúc nhân viên thắc mắc.

---

## G. Bảo mật — phải làm trước khi bàn giao

Thay đổi này chạm Supabase (đọc `kpi_chi_tieu`, ghi `lien_ket_bo_phan`) → **bắt buộc chạy
skill `kiem-tra-bao-mat-du-lieu`** và đo thật, không suy luận. Tối thiểu:

- Dùng **khoá công khai (anon)** chưa đăng nhập: `select` trên `kpi_chi_tieu` phải trả rỗng
  hoặc lỗi, `update lien_ket_bo_phan` phải bị chặn.
- Đăng nhập bằng tài khoản **không phải ADMIN**: đọc được nhóm (tab không vỡ), nhưng
  `update` phải trả 0 dòng và giao diện phải hiện thông báo của `loiGhiKpi`, tuyệt đối không
  báo "đã lưu".
- Đăng nhập ADMIN: đổi nhóm được, và điểm KPI bộ phận đổi theo đúng như mục E.

---

## H. Tệp đụng tới

| Tệp | Việc |
|---|---|
| `src/lib/chamCongThongKe.js` | **mới** — hàm thuần B1–B4 |
| `src/lib/chamCongThongKe.test.js` | **mới** — bảng ca ở mục F |
| `src/pages/tasks/ChamCongTab.jsx` | sửa — truy vấn nhóm, ô lọc, khối thống kê, màn phân nhóm |
| `src/lib/kpiTuDong.js` | sửa — **chỉ** thêm `export` cho `NGAY_PHEP_THANG` |

Không có tệp SQL mới. Không đụng `KpiTab.jsx`, `TaskApp.jsx`, `permRegistry.js`.
