# Bảng tin cá nhân — màn hình đầu tiên của nhân viên

> Ngày: 2026-08-04 · Trạng thái: đã duyệt thiết kế
> Liên quan: `src/App.jsx`, `src/pages/HomePage.jsx`, `src/pages/tasks/KpiTab.jsx`,
> `src/lib/kpiEngine.js`, `src/lib/kpiTuDong.js`, `src/lib/permRegistry.js`

## Mục tiêu

Nhân viên mở app lên thấy ngay **điểm KPI tháng này, những chỉ tiêu đang bị mất điểm, và
công việc đang được giao** — thay vì lưới 9 phân hệ. Bấm nút Home mới về lưới phân hệ như cũ.

## Bối cảnh — đã đo ngày 04/08/2026, không suy luận

| Đã đo | Kết quả |
|---|---|
| Tài khoản trong `nhan_vien` | 1 ADMIN (`admin` — Nguyên) + 16 AGENT |
| Có `tab.tasks.kpi.view` | 12/16 nhân viên. **Thiếu**: `hangkt` (Hằng), `nva` (Vân Anh), `TGD` (Anh Giang), `test` |
| Có `tab.tasks.tasks.view` | Đúng 12 người đó — không ai có cái này mà thiếu cái kia |
| Không có tab nào | `hangkt`, `TGD` (0 key `tab.*`); `nva` có 2 key nhưng không phải hai key trên |
| **Quyền cũ chưa chuyển** | `TGD` mang `view_tasks: true` với 0 khoá `tab.*` ⇒ sau khi `migrateLegacyToTabPerms` chạy, họ **có** `tab.tasks.tasks.view`. Nhìn quyền thô thì kết luận sai. `hangkt` có `view_tasks: false` ⇒ đúng là không có gì |
| Dòng KPI kỳ `2026-08` | 205 dòng cá nhân của **13 người** + 5 dòng `BO_PHAN` |
| RLS `kpi_chi_tieu`, `kpi_nhat_ky`, `cham_cong`, `cong_viec_duoc_giao` | SELECT = `true` cho `{authenticated}` ⇒ **mọi tài khoản đã đăng nhập vốn đã đọc được KPI của mọi người ở tầng CSDL**; cap `tab.tasks.kpi.view` chỉ che ở tầng giao diện |
| Nhật ký trừ điểm kỳ `2026-08` | **0 dòng** (cả bảng `kpi_nhat_ky` chỉ có 17 dòng, từ các kỳ trước) |
| Điểm chốt tay kỳ `2026-08` | 0 (kỳ `2026-07` có 15) |
| `cham_cong` kỳ `2026-08` | 0 dòng ⇒ luật chuyên cần trả `tiLe: null` ("chưa có căn cứ chấm"), **không trừ oan** |
| `production_logs` từ 01/08 | 82 dòng ⇒ chỉ tiêu hiệu suất sản xuất có chấm |
| Việc `IN_PROGRESS` theo người | `ntth` 4 (3 quá hạn) · `hhx` 3 · `vta` 3 · `admin` 2 · `nv8` 1 · `nttd` 1 — không ai quá 4 |
| KpiTab tải mỗi lần mở | ~1.350 dòng / 7 request, trong đó `danhMuc` là **627 dòng không lọc kỳ** |

### Rủi ro đã phát hiện và phải né

`apDungChamTuDong` ([`kpiTuDong.js:513`](../../../src/lib/kpiTuDong.js)) **suy danh sách thành
viên nhóm từ chính mảng `rows` được truyền vào**:

```js
const thanhVien = laBoPhan
  ? [...new Set(ds.filter(x => x.cap_do === 'CA_NHAN' && x.nhan_vien_id && (...)).map(x => x.nhan_vien_id))]
  : [r.nhan_vien_id];
```

Nếu bảng tin chỉ tải dòng KPI của riêng người đang đăng nhập, `thanhVien` sẽ chỉ có một người,
`phutTB = phut / soNguoi` chia sai, và **bảng tin sẽ hiện điểm chuyên cần khác với tab KPI của
cùng người đó**. Mức phụ thuộc, đo trên kỳ `2026-08`:

| Nhóm | Số người | Trọng số lấy từ dòng chung |
|---|---|---|
| `CHUYEN_CAN_BO_PHAN` (SX / CSKH / BH / toàn cty) | 13/13 | 5 điểm mỗi người |
| `TL_HOTLINE_CA_TEAM` (nhóm bảo hành) | 7 | **45 điểm** mỗi người |

⇒ Bảng tin **bắt buộc** tải đủ dòng chỉ tiêu của cả kỳ và chấm công của cả kỳ. Không được
"lọc cho nhẹ" ở hai nguồn này.

## Ngoài phạm vi (không làm lần này)

- **Không đụng `/home`.** Lưới 9 phân hệ giữ nguyên từng dòng.
- **Không đổi ma trận phân quyền.** Không thêm cap mới, không bật quyền cho ai.
- **Không đổi luật tính KPI.** `kpiEngine.js` và `kpiTuDong.js` không sửa một dòng nào.
- **Không đổi màn hình mở app của ADMIN.** Tài khoản `admin` vẫn vào thẳng `/home`.
- **Không** thêm thông báo đẩy, không nhắc việc, không gửi gì ra ngoài.
- **Không** cho sửa/chấm điểm từ bảng tin — màn hình này chỉ đọc.

---

## A. Định tuyến

Route `/` hiện là `<Navigate to="/home" replace />` gõ cứng ([`App.jsx:50`](../../../src/App.jsx)),
không đọc được người đăng nhập. Thay bằng component `DiemDenDauTien`:

```
chưa xong loading   → giữ màn hình chờ (không nhấp nháy sang /login rồi quay lại)
chưa đăng nhập      → /login
role = ADMIN        → /home
AGENT, có ≥1 khối   → /ca-nhan
AGENT, không khối   → /home
```

"Có ≥1 khối" = `canSeeTab(user,'tasks','kpi')` **hoặc** `canSeeTab(user,'tasks','tasks')`, đọc
trên quyền **đã chuyển đổi** (`withMigratedPerms`). Theo số đo: 13 người vào `/ca-nhan`
(12 người có khoá `tab.*`, cộng `TGD` nhờ quyền cũ `view_tasks`); `hangkt`, `nva`, `test`
vào `/home` như hôm nay.

**`Login.jsx` phải dùng CHUNG `chonDiemDen`.** Hôm nay nó gõ cứng `navigate('/home')` sau khi
đăng nhập — để nguyên thì nhân viên vừa đăng nhập vẫn thấy lưới phân hệ trước, đúng thứ màn
hình này sinh ra để thay. Chỉ khi mở lại app với phiên còn hạn mới vào bảng tin, tức tính năng
chạy đúng một nửa số lần.

`chonDiemDen` tự gọi `withMigratedPerms`, **không tin người gọi đã chuyển**: `login()` trả về
bản THÔ (AuthContext chỉ chuyển bản đưa vào state). Không làm vậy thì `TGD` mở app sẵn phiên
sẽ vào `/ca-nhan`, còn vừa đăng nhập lại rơi về `/home` — cùng một người, hai đường vào, hai
kết quả. `withMigratedPerms` vì thế chuyển từ `AuthContext.jsx` sang `lib/permRegistry.js`
(nhập từ AuthContext sẽ kéo theo cả supabase client vào một hàm thuần).

Route mới `/ca-nhan` bọc `ProtectedRoute` **không** kèm `requiredModule`: gác quyền nằm ở
từng khối bên trong. Đặt `requiredModule="access_tasks"` sẽ chặn nhầm người có quyền xem KPI
nhưng bị `canSeeModule` đánh trượt vì lý do khác — và cũng làm màn hình mặc định phụ thuộc vào
một cap không liên quan.

`/home` vẫn gõ tay vào được. Bảng tin có nút Home ở header → `/home`. Không ai bị nhốt.

## B. Lấy dữ liệu — `src/lib/kpiDuLieu.js`

Trích nguyên khối `taiDuLieu` trong [`KpiTab.jsx:66-215`](../../../src/pages/tasks/KpiTab.jsx)
ra hàm dùng chung:

```js
export async function taiDuLieuKpi(ky, { kemDanhMuc = true } = {})
// → { rows, logs, viec, sanXuat, chamCong, ngoaiLe, caiTien, danhMuc, loiViec }
```

- `KpiTab` gọi `taiDuLieuKpi(ky)` — **mặc định `kemDanhMuc: true`, hành vi y hệt hôm nay**.
- Bảng tin gọi `taiDuLieuKpi(ky, { kemDanhMuc: false })` — bỏ 627 dòng `danhMuc`, là query
  duy nhất không lọc theo kỳ và là query nặng nhất. Bảng tin không có form "Thêm chỉ tiêu"
  nên không cần nó.

Mọi tính chất của bản gốc phải giữ nguyên, đây là những chỗ đã có lý do viết trong chú thích:

1. `.order('thu_tu').order('id')` và `.order('ngay').order('id')` — tie-break bắt buộc của
   `fetchAllRows`; bỏ đi là trùng/sót dòng giữa các đợt 1000.
2. Chia lô 100 id khi truy vấn `kpi_nhat_ky` — URL `.in()` quá 200 uuid bị proxy cắt.
3. Mốc tháng dựng bằng `new Date(nam, thang-1, 1)` (giờ máy), **không** cắt chuỗi UTC.
4. Mỗi nguồn phụ (`viec`, `sanXuat`, `chamCong`, `ngoaiLe`) bọc `try/catch` riêng — hỏng một
   nguồn không được kéo sập cả màn hình; gom lỗi vào `loiViec`.
5. `caiTien` mặc định **`null`** chứ không `[]`: `null` = không nối được nguồn ⇒ luật trả
   "không chấm"; `[]` = nối được nhưng chưa ai gửi bài.

Bảng tin tự tính phần của mình từ kết quả chung:

```js
const { rows, logs } = apDungChamTuDong(rows, logs, viec, ky, undefined, sanXuat, chamCong, ngoaiLe, caiTien);
const dongBoPhan = rows.filter(r => r.cap_do === 'BO_PHAN');
const cuaToi     = rows.filter(r => r.cap_do !== 'BO_PHAN' && r.nhan_vien_id === me.id);
const kq         = tinhBangKpi([...dongBoPhan, ...cuaToi], logs);
```

Đúng cùng ba dòng mà `KpiTab` đang dùng để dựng `bangTheoNguoi` ⇒ hai màn hình không thể
lệch số.

## C. Nội dung màn hình `/ca-nhan`

Header: lời chào + tên + ngày (chép cách `HomePage` làm), nút **Home**, nút **Đăng xuất**.

### Khối KPI — chỉ dựng nếu `canSeeTab(user,'tasks','kpi')`

- Ô chọn kỳ `<input type="month">`, mặc định tháng hiện tại, xem được tháng khác.
- Tổng điểm `kq.tongKpi`, tô màu theo ngưỡng sẵn có: ≥90 xanh · ≥75 cam · dưới đỏ.
- Danh sách `kq.danhSachMatDiem` (engine đã sắp mất-nhiều-nhất-trước). Mỗi dòng:
  tên chỉ tiêu · `−<điểm mất>`.
- Nếu `kq.nhomThieuDongChung.length` > 0 → dải cảnh báo. Cờ này nghĩa là dữ liệu hỏng
  (thiếu dòng chấm chung) làm mất trọn trọng số, không phải kết quả chấm — giấu nó đi là
  để người dùng chịu mất điểm mà không biết vì sao.
- Bấm một dòng → `navigate('/tasks?view=kpi')`. **Không** kèm mã nhân viên vào URL: mã đó
  cũng là tên đăng nhập, mà `TaskApp` vốn đã biết người đang đăng nhập là ai.

Trạng thái rỗng, phải phân biệt hai chuyện khác nhau:

| Tình huống | Câu hiện ra |
|---|---|
| Có bảng KPI, chưa mất điểm nào | "Chưa mất điểm nào trong tháng này." |
| Không có dòng KPI nào của mình trong kỳ | "Chưa có bảng KPI cho kỳ này." |
| `loiViec` khác rỗng | Dải vàng: nguồn nào tải hỏng, điểm có thể chưa đủ |

Đầu tháng (như hôm nay 04/08: 0 nhật ký, 0 chốt tay, 0 chấm công) danh sách mất điểm sẽ
gần như rỗng. Đó là hành vi đúng, nên ô chọn kỳ là đường để nhân viên xem lại tháng trước.

### Khối Công việc — chỉ dựng nếu `canSeeTab(user,'tasks','tasks')`

- Việc `status === 'IN_PROGRESS'` có tên mình theo `memberIds(t)` — **phải qua `memberIds`**,
  không đọc thẳng `assignee_ids`: còn dòng cũ chưa migrate chỉ có `assignee_id`.
- Xếp: quá hạn (đỏ) → hạn trong 3 ngày (cam) → còn lại. Trong mỗi nhóm, hạn gần trước;
  việc không có hạn xuống cuối.
- Mỗi dòng: tên việc · hạn. Bấm → `/tasks`.
- Rỗng: "Không có việc nào đang làm."

Khối này tải riêng, gọn: `cong_viec_duoc_giao` lọc `status = 'IN_PROGRESS'`, chỉ các cột cần.
Không dùng lại `viec` của `taiDuLieuKpi` vì nguồn đó lọc theo **tháng tạo** (phục vụ chấm tự
động), không phải "đang làm" — việc tạo tháng trước còn dang dở sẽ bị bỏ sót.

### Giao diện

Theo luật đã chốt cho app này: **không cuộn ngang**, chữ trên nút/nhãn luôn một dòng, các
thanh tự co vừa bề ngang điện thoại. Một cột trên điện thoại, hai cột từ 900px trở lên.

## D. Deep-link `/tasks?view=kpi`

`TaskApp` điều hướng bằng state `view` nội bộ, không qua URL. Thêm đúng một `useEffect` đọc
query param rồi tự xoá — theo tiền lệ có sẵn tại
[`QualityApp.jsx:87-94`](../../../src/pages/quality/QualityApp.jsx):

```js
useEffect(() => {
  if (!me) return
  const p = new URLSearchParams(location.search)
  if (p.get('view') !== 'kpi') return
  if (canSeeTab(me, 'tasks', 'kpi')) { setView('kpi'); setKpiNvBanDau(me.id) }
  navigate('/tasks', { replace: true })
}, [me, location.search, navigate])
```

Người xem lấy từ `me`, **không nhận từ URL** — trang không tự khai mình là ai, và tên đăng
nhập không lọt ra thanh địa chỉ.

`KpiTab` nhận prop mới `nvBanDau` để mở thẳng bảng của một người. Prop **không bắt buộc** —
không truyền thì `KpiTab` chạy y như hôm nay.

Phải kiểm quyền ngay tại đây: URL do người dùng gõ được, không được để `?view=kpi` mở tab
mà `canSeeTab` đang chặn.

## E. Bảo mật

Màn hình này **chỉ đọc**, và đọc đúng những bảng mà tài khoản đăng nhập vốn đã đọc được
(đo ở bảng trên: SELECT = `true` cho `{authenticated}`). Không mở thêm quyền nào, không thêm
policy nào, không đụng Storage, không thêm khoá.

Ngưỡng phải giữ nguyên sau thay đổi và phải **đo lại chứ không suy luận**:

- Người ngoài cầm khoá publishable trong mã nguồn: không đọc/sửa/xoá được dữ liệu nào.
- Route `/ca-nhan` không được truy cập khi chưa đăng nhập.

Chạy skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao — bắt buộc theo CLAUDE.md vì thay
đổi này có mã đọc Supabase.

## F. Kiểm thử

`kpiDuLieu.js` là hàm gọi mạng nên test bằng client Supabase giả:

1. `kemDanhMuc: false` → **không** phát sinh truy vấn `danhMuc`; các nguồn còn lại đủ.
2. `kemDanhMuc` mặc định → có `danhMuc` (chứng minh KpiTab không đổi hành vi).
3. `kpi_nhat_ky` chia lô đúng khi số id vượt 100.
4. Một nguồn phụ ném lỗi → hàm vẫn trả về, nguồn đó rỗng, `loiViec` có nội dung.
5. `caiTien` hỏng → trả `null`, không phải `[]`.
6. Mốc tháng cắt theo giờ máy: việc tạo 06:00 ngày 01 không rơi sang tháng trước.

Sắp xếp khối công việc tách thành hàm thuần `xepViecDangLam(tasks, meId, now)` để test được
mà không cần mạng: quá hạn trước, rồi ≤3 ngày, rồi còn lại; việc không hạn xuống cuối; đọc
được cả dòng chỉ có `assignee_id` cũ.

## G. Tệp đụng tới

| Tệp | Việc |
|---|---|
| `src/lib/kpiDuLieu.js` + test | **mới** — hàm tải dùng chung |
| `src/lib/viecDangLam.js` + test | **mới** — hàm thuần xếp việc |
| `src/lib/diemDen.js` + test | **mới** — hàm thuần chọn màn hình đầu tiên |
| `src/pages/BangTinCaNhan.jsx` | **mới** — màn hình `/ca-nhan` |
| `src/pages/BangTinCaNhan.test.jsx` | **mới** — gác quyền, khung màn hình, luật bề ngang |
| `src/pages/BangTinCaNhanKhoi.test.jsx` | **mới** — hai khối với dữ liệu thật |
| `src/components/DiemDenDauTien.jsx` | **mới** — định tuyến `/` |
| `src/App.jsx` | thêm route `/ca-nhan`, đổi `/` |
| `src/pages/Login.jsx` | sau đăng nhập đi theo `chonDiemDen` thay vì `/home` cứng |
| `src/lib/permRegistry.js` | nhận `withMigratedPerms` chuyển sang từ AuthContext |
| `src/lib/AuthContext.jsx` | nhập `withMigratedPerms` thay vì tự định nghĩa |
| `src/pages/tasks/KpiTab.jsx` | gọi lib mới; nhận prop `nvBanDau` |
| `src/pages/tasks/TaskApp.jsx` | đọc query param, truyền `nvBanDau` |
