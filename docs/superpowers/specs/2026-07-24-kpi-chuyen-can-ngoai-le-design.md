# KPI chuyên cần — ghi chú chính xác + miễn trừ đặc biệt (giải trình)

> Ngày: 2026-07-24 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Liên quan: [module KPI](2026-07-21-kpi-module-design.md), `src/lib/kpiTuDong.js`, `src/pages/tasks/ChamCongTab.jsx`, `src/pages/tasks/KpiTab.jsx`

## Mục tiêu

Ba việc rời nhau nhưng cùng chạm phần chuyên cần của KPI:

1. **Ghi chú chuyên cần cá nhân** — chỉ nêu đúng mục thực sự bị trừ điểm, kèm **ngày cụ thể**, bỏ các mục 0.
2. **Ghi chú hoàn thành công việc** — mỗi việc không đúng hạn kèm lý do: *trễ N ngày* hoặc *chưa xong*.
3. **Miễn trừ đặc biệt** — admin đánh dấu một **ngày** của một người là "đặc biệt" kèm **giải trình**; ngày đó bị loại khỏi phần trừ điểm của **cả** chuyên cần cá nhân lẫn bộ phận, nhưng KPI **vẫn hiển thị** ngày nghỉ đó, ghi rõ "có giải trình — không trừ".

## Bối cảnh & ràng buộc (đã xác minh trong code)

- Luật chấm tự động là **hàm thuần** trong `src/lib/kpiTuDong.js`, có test vitest (`kpiTuDong.test.js`), tính **live** lúc hiển thị. Ghi chú đi ra cột GHI CHÚ + popup + Excel + bản in qua **một chuỗi `ly_do` của "dòng ảo"**.
- **Điểm tích hợp engine duy nhất**: `KpiTab.jsx` gọi `apDungChamTuDong(...)` (dòng ~187). Excel/bản in nhận lại rows/logs đã tính — không phải sửa.
- `cham_cong` là bảng **chỉ đọc trên app**, dữ liệu vào bằng `scripts/import-cham-cong.mjs` sinh SQL `delete from cham_cong where ky=... ; insert ...`. **Vì import xoá-rồi-nạp mỗi tháng, mọi cờ gắn thẳng lên `cham_cong` sẽ bị xoá.** → miễn trừ phải nằm ở bảng khác.
- Quyền: component nhận `perm = {view,create,edit,io}` từ `getTabPerm(me,'tasks',<tab>)`. Tab `cham_cong` hiện chỉ có cap `['view']`.
- Luật hiện tại: chuyên cần **cá nhân** trừ **đi muộn + nghỉ** (KHÔNG trừ về sớm); chuyên cần **bộ phận** trừ **(đi muộn + về sớm) + nghỉ**, tính trên **trung bình đầu người**. `NGAY_PHEP_THANG = 1`.

## Ngoài phạm vi (không làm lần này)

- **Không** đổi việc chuyên cần cá nhân không tính về sớm (giữ nguyên luật hiện tại).
- **Không** đổi ngưỡng trừ điểm, số ngày phép, hay cách tính trung bình bộ phận.
- **Không** cho phép sửa/nhập số liệu chấm công gốc trên app (vẫn chỉ-đọc, chỉ thêm lớp miễn trừ).

---

## A. Dữ liệu — bảng `chuyen_can_ngoai_le`

File mới `sql/create_chuyen_can_ngoai_le.sql`, chạy tay trên Supabase SQL Editor (cùng nếp `create_cham_cong.sql`).

```sql
create table if not exists chuyen_can_ngoai_le (
  id            bigserial primary key,
  ky            text not null,                    -- 'YYYY-MM', suy từ ngay, lưu sẵn để lọc
  nhan_vien_id  text not null references nhan_vien(id) on delete cascade,
  ngay          date not null,
  ly_do         text not null,                    -- giải trình BẮT BUỘC
  nguoi_ghi     text,                             -- ai đánh dấu (tên/id admin)
  created_at    timestamptz default now(),
  -- Một người một ngày một bản ghi: bấm lại là upsert, không nhân đôi.
  constraint ccnl_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);
create index if not exists ccnl_ky_idx on chuyen_can_ngoai_le (ky, nhan_vien_id);
```

**RLS — sao chép đúng khuôn `cham_cong`**: đọc cho mọi `authenticated`, ghi/sửa/xoá chỉ khi `auth.jwt()->>'nv_role' = 'ADMIN'` (dữ liệu quyết định điểm chuyên cần → gắn lương thưởng; chặn ở giao diện thôi thì người biết gọi API vẫn sửa được). 4 policy `ccnl_sel/ins/upd/del`, có `drop policy if exists` trước mỗi cái. Kèm lại cảnh báo `security_3_rls_lockdown.sql` như trong `create_cham_cong.sql`.

Bảng này là **lớp phủ** trên `cham_cong`, không có FK nào trỏ ngược vào nó — an toàn khi import lại chấm công.

---

## B. Engine — `src/lib/kpiTuDong.js`

### B0. `apDungChamTuDong` nhận thêm `ngoaiLe`

Thêm tham số cuối, **mặc định `[]`** (tham số thứ 8 — không phá 20+ test đang gọi bằng vị trí tối đa 7 đối số):

```js
export function apDungChamTuDong(
  rows = [], logs = [], tasks = [], ky, ngay = homNay(),
  sanXuat = [], chamCong = [], ngoaiLe = []) {
```

Dựng `Set` khoá `${nhan_vien_id}|${ngay}` và `Map` khoá→`ly_do` từ `ngoaiLe`. Khi lọc `cc` cho từng người (chỗ hiện tại filter theo `thanhVien` + `ky`), **gắn cờ** vào mỗi dòng:

```js
const cc = (chamCong || [])
  .filter(c => thanhVien.includes(c.nhan_vien_id) && String(c.ky || '') === ky)
  .map(c => {
    const k = `${c.nhan_vien_id}|${c.ngay}`;
    return mienSet.has(k) ? { ...c, mien: true, mien_ly_do: mienMap.get(k) || null } : c;
  });
```

`ngay` của `cham_cong` và của `chuyen_can_ngoai_le` đều là chuỗi `'YYYY-MM-DD'` → so khớp trực tiếp.

### B1. Chuyên cần cá nhân — loại ngày miễn + ghi chú mới

`luatChuyenCanCaNhan(ct, viec, sanXuat, chamCong = [])`:

- **Cơ sở trừ điểm = ngày KHÔNG miễn**: `const ccTru = chamCong.filter(c => !c.mien);`
  - `nang` = số ngày trong `ccTru` có `di_muon_phut > 15` (−5/ngày)
  - `nhe`  = số ngày trong `ccTru` có `di_muon_phut > 5 && <= 15` (−1/ngày)
  - `nghi` = số ngày `ccTru` có `nghi` true; `vuotPhep = max(0, nghi − NGAY_PHEP_THANG)` (−3/ngày vượt)
  - `tru = nang*5 + nhe*1 + vuotPhep*3` (giữ nguyên công thức — **số điểm không đổi** cho dữ liệu chưa có miễn trừ).
- **Danh sách để ghi chú** (đều sắp theo ngày, format ngày `d/M` bỏ số 0 đầu — vd `6/7`):
  - `muonList` = `ccTru` có `di_muon_phut > 5` → `"6/7 (15′)"`
  - `nghiList` = `ccTru` có `nghi` → `"7/7"`
  - `mienList` = `chamCong` có `mien` → `"1/7"` (+ gom lý do)
- **Ráp ghi chú** — chỉ thêm mảnh nào thực sự có, cắt danh sách ngày ở `MAX_NGAY = 8` với đuôi `…+N`:
  - Có muộn: `Đi muộn {n} ngày (−{x}): {muonList}.`
  - Có nghỉ (không miễn): nếu `vuotPhep>0` → `Nghỉ {nghi} ngày, quá {vuotPhep} phép (−{y}): {nghiList}.`; nếu trong phép → `Nghỉ {nghi} ngày (trong phép): {nghiList}.`
  - Có miễn: `Miễn {n} ngày có giải trình (không trừ): {mienList}.`
  - Nếu `tru===0` và không có ngày miễn: `Không muộn, không nghỉ quá phép — đủ điểm.`
  - Đuôi giữ ý nghĩa cũ (ngắn lại): `Chưa tính có/không phép, quên/sai chấm công — chốt tay đè lên.`
  - Tiền tố `Tự động: ` giữ nguyên (popup/print dựa vào đó).
- Trả `{ ...tuDiemTru(ct, tru, ghiChu), nhuongChamTay: true }` (không đổi).

**Ví dụ đầu ra:**
`Tự động: Đi muộn 2 ngày (−2): 6/7 (15′), 20/7 (10′). Nghỉ 2 ngày, quá 1 phép (−3): 7/7, 21/7. Miễn 5 ngày có giải trình (không trừ): 1/7, 2/7, 3/7, 4/7, 5/7. Chưa tính có/không phép, quên/sai chấm công — chốt tay đè lên.`

### B2. Chuyên cần bộ phận — loại ngày miễn + nêu miễn trong ghi chú

`luatChuyenCanBoPhan(...)`: `ccTru = chamCong.filter(c => !c.mien)`. Tính `phut` (đi muộn + về sớm) và `nghi` **trên `ccTru`**; `phutTB`/`nghiTB` vẫn **chia cho số người của nhóm** (không đổi mẫu số). Công thức trừ giữ nguyên. Ghi chú thêm mệnh đề miễn ở cuối:

`… Cả nhóm: {phut} phút, {nghi} ngày nghỉ` + (nếu có ngày miễn) ` (miễn {k} ngày có giải trình).`

Số `{phut}`, `{nghi}` trong ghi chú là **sau khi loại miễn** (đúng phần đang tính điểm); `{k}` = tổng ngày miễn của nhóm.

### B3. Hoàn thành công việc — lý do trễ/chưa xong

`luatHoanThanhDungHan(...)`: giữ nguyên cách chọn `tre = dem.filter(t => !dungHan(t))` và cắt `MAX_TEN_TRE`. Đổi phần dựng tên: mỗi việc trễ kèm hậu tố qua helper `moTaViecChuaDat(t)`:

- `t.status === 'COMPLETED'` và có `due_date`+`completed_date`: tính `Δ = completed − due`. `Δ ≥ 1 ngày` → `(trễ {số ngày} ngày)`; `Δ < 1 ngày` → `(trễ {số giờ} giờ)`.
- còn lại (chưa hoàn thành) → `(chưa xong)`.

Chuỗi mỗi việc: `${title} ${moTaViecChuaDat(t)}`. Phần `Chưa đúng hạn: …` và câu `X/Y việc đúng hạn (…%)` giữ nguyên.

**Ví dụ:** `Tự động: 5/7 việc đúng hạn (71%). Chưa đúng hạn: Sửa máy (trễ 3 ngày); Tìm mua khoá (chưa xong).`

---

## C. Giao diện — `src/pages/tasks/ChamCongTab.jsx`

- **Đổi chữ ký**: `ChamCongTab({ users = [], me, perm = {} })`. `const canEdit = !!perm.edit;`
- **Tải thêm** `chuyen_can_ngoai_le` theo `ky` trong `taiDuLieu` (query thứ 2, cùng `fetchAllRows`). Dựng `Map` khoá `${nvId}|${ngay}` → bản ghi miễn trừ. `taiDuLieu` cũng là hàm reload sau khi bật/tắt.
- **Hiển thị (mọi người xem được)**:
  - Ô ngày ở bảng tổng quan (`OChamCong`): ngày được miễn thêm dấu hiệu thị giác (vd viền/nền xanh dương nhạt hoặc chấm nhỏ) + tooltip `"Đặc biệt (không trừ KPI): {lý do}"`. Không xung đột với viền đỏ `nghi_van`.
  - Bảng chi tiết từng người (`BangChiTietMotNguoi`): cột "Ghi chú" hiện `Đặc biệt — {lý do}` cho ngày được miễn.
- **Thao tác (chỉ `canEdit`)**: trong bảng chi tiết từng người, mỗi dòng ngày có nút **"Đánh dấu đặc biệt"** (nếu chưa miễn) / **"Bỏ đặc biệt"** (nếu đang miễn).
  - Bấm "Đánh dấu" → mở modal nhỏ nhập **lý do (bắt buộc)** → lưu bằng `upsert` vào `chuyen_can_ngoai_le` với `{ ky, nhan_vien_id, ngay, ly_do, nguoi_ghi: me?.name || me?.id }` (onConflict `nhan_vien_id,ngay`).
  - Bấm "Bỏ đặc biệt" → `delete` theo `(nhan_vien_id, ngay)`.
  - Sau lưu/xoá → gọi reload. Lỗi ghi (vd RLS chặn không phải admin) → hiện thông báo lỗi, không nuốt.
- `BangChiTietMotNguoi` nhận thêm props: `ngoaiLeMap` (cho người này), `canEdit`, `onDoiNgoaiLe(ngay, lyDo|null)`.

### permRegistry + wiring

- `src/lib/permRegistry.js`: tab `cham_cong` đổi `caps: ['view']` → `caps: ['view', 'edit']`. (`view` = xem bảng + miễn trừ; `edit` = đánh dấu/bỏ đặc biệt.)
- `src/pages/tasks/TaskApp.jsx` dòng render tab: `h(ChamCongTab, { users })` → `h(ChamCongTab, { users, me, perm: getTabPerm(me, 'tasks', 'cham_cong') })`.

RLS ở DB là hàng rào thật; `perm.edit` chỉ để ẩn/hiện nút.

---

## D. `src/pages/tasks/KpiTab.jsx`

- Thêm state `ngoaiLe`, tải `chuyen_can_ngoai_le` theo `ky` (cạnh chỗ đang tải `cham_cong`, dùng `fetchAllRows`).
- Truyền vào engine: `apDungChamTuDong(rows, logs, viec, ky, undefined, sanXuat, chamCong, ngoaiLe)` và thêm `ngoaiLe` vào mảng phụ thuộc `useMemo`.

Không đụng Excel/bản in — chúng nhận rows/logs đã tính.

---

## Kiểm thử (vitest, cùng nếp `kpiTuDong.test.js`)

**Thêm mới:**
- `apDungChamTuDong` gắn cờ `mien` đúng theo `ngoaiLe`, chỉ đúng người + đúng ngày.
- Cá nhân: ngày miễn bị loại khỏi trừ điểm — nghỉ 3 ngày, miễn 2 → chỉ còn 1 (trong phép) → không trừ; đối chứng khi không miễn thì có trừ.
- Cá nhân: ghi chú có **ngày** đi muộn/nghỉ; có mảnh "Miễn … có giải trình"; không còn chuỗi "0 lần muộn".
- Bộ phận: ngày miễn bị loại khỏi phút & ngày nghỉ trung bình; ghi chú nêu "miễn K ngày".
- Hoàn thành công việc: hậu tố `(trễ N ngày)` cho việc xong muộn, `(chưa xong)` cho việc chưa hoàn thành.

**Sửa test cũ bị đổi định dạng ghi chú** (số điểm/tiLe không đổi, chỉ chữ):
- `luật CHUYEN_CAN_CA_NHAN › 'hai bậc KHÔNG cộng chồng'`: bỏ assert `'0 lần muộn 6–15 phút'`, thay bằng assert phù hợp định dạng mới.
- `luật CHUYEN_CAN_CA_NHAN › 'ghi chú nói rõ phần chưa tính được'`: cập nhật theo đuôi mới (vẫn nhắc "phép", "quên/sai chấm công").
- Các assert khác (`'2 người'`, `'30 phút'`, `'60 phút'` ở bộ phận; `'7/9'`, tên việc trễ ở hoàn thành) vẫn đúng vì là chuỗi con — kiểm lại khi chạy.

## Thứ tự triển khai (đề xuất cho plan)

1. SQL bảng `chuyen_can_ngoai_le` (+ RLS).
2. Engine B0–B3 theo TDD (test đỏ → code → xanh), cập nhật test cũ.
3. `KpiTab` tải + truyền `ngoaiLe`.
4. permRegistry cap `edit` + TaskApp truyền `me/perm`.
5. `ChamCongTab` hiển thị badge + modal đánh dấu (admin).
6. `npm run build` + `npm test` xanh toàn bộ; kiểm bằng preview.

## Rủi ro / lưu ý

- **Đừng** để `security_3_rls_lockdown.sql` chạy sau và mở toang quyền ghi bảng mới — nhắc lại cảnh báo trong file SQL.
- Ghi chú dài: cắt danh sách ngày ở 8 mục để không vỡ ô bảng/print.
- Không commit file SQL seed chứa dữ liệu thật ngoài ý muốn — file này chỉ là DDL, an toàn commit.
