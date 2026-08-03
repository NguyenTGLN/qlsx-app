# Phân hệ Quy trình — soạn lưu đồ ISO, duyệt & ban hành

> Ngày: 2026-08-03 · Trạng thái: đã duyệt thiết kế, chờ viết plan
> Mockup đã duyệt: `docs/mockups/quy-trinh-mockup.html`
> Liên quan: `src/lib/permRegistry.js`, `src/pages/HomePage.jsx`, `src/App.jsx`,
> `src/components/ModuleShell.jsx`, [bảo mật RLS](2026-07-10-bao-mat-rls-design.md)

## Mục tiêu

Phân hệ thứ 9 của QLSX: nơi soạn – duyệt – ban hành – in **tài liệu quy trình chuẩn ISO
9001**. Ba việc:

1. **Danh mục quy trình** gom theo nhóm bộ phận (Sản xuất, Chất lượng, Kho hàng, CSKH,
   Bảo hành, Nhân sự–HC), lọc theo trạng thái hiệu lực.
2. **Trình vẽ lưu đồ swimlane** — cột là bộ phận, hàng là giai đoạn — mà người không
   biết vẽ kỹ thuật vẫn dựng được lưu đồ đúng và đẹp.
3. **Xuất tài liệu ISO đủ 8 mục**, khổ A3 ngang, kèm bảng diễn giải và bảng theo dõi
   sửa đổi.

## Ba quyết định đã chốt với người dùng (03/08/2026)

**Q1 — Cách vẽ: phương án C, "nút ＋ trên khối".** Không kéo thả tự do kiểu Visio.
Mỗi khối có nút ＋; bấm → chọn loại khối, cột, tên → bước mới **tự đặt chỗ và tự nối**
vào khối nguồn. Khối Quyết định có hai nút: **OK** đi xuống, **NG** rẽ trái.

Lý do loại phương án kéo thả tự do: người soạn là nhân viên xưởng, không phải người vẽ
kỹ thuật. Kéo tay sinh ra lưu đồ méo, đường nối chồng chéo, mỗi người một kiểu — hỏng
đúng cái mà tài liệu ISO cần nhất là **sự đồng nhất giữa các quy trình**. Nút ＋ còn
chặn được lỗi phổ biến nhất khi vẽ tay: khối mồ côi không nối vào đâu.

**Q2 — Chỉ Admin được duyệt và ban hành.** Không phải một cap phân quyền cấp được cho
người khác; là điều kiện cứng `role === 'ADMIN'`, chặn cả ở giao diện **và ở cơ sở dữ liệu**.

**Q3 — Đúng chuẩn ISO.** Tài liệu đủ 8 mục, không phải chỉ lưu đồ + diễn giải.

**Q4 — Nội dung mục 1–4 và 7: phương án (b), có mẫu sẵn theo nhóm bộ phận.** Mở quy
trình mới ra là điền sẵn ~70%, người soạn sửa lại phần khác biệt.

## Bối cảnh & ràng buộc (đã đọc mã nguồn, không suy đoán)

- 8 phân hệ hiện có khai ở `src/pages/HomePage.jsx:12` (mảng `MODULES`) và
  `src/App.jsx:10-17` (lazy import) + `:53-61` (route).
- Phân quyền 3 cấp Phân hệ → Tab → Cap ở `src/lib/permRegistry.js:14`. Bốn nơi dùng:
  - `src/components/ProtectedRoute.jsx:49` — tìm theo `legacyAccess` rồi gọi `canSeeModule`.
  - `src/pages/tasks/TaskApp.jsx:517` — **màn hình Phân quyền** render toàn bộ `PERM_REGISTRY`.
  - `src/lib/AuthContext.jsx` — re-export `canSeeModule`.
  - `src/lib/permRegistry.test.js:9` — bắt buộc **mọi tab phải có cap `view`**.
- `getTabPerm` cho admin **mọi cap mà tab khai** (`permRegistry.js:107`). Nên nếu khai
  cap `approve` thì màn hình Phân quyền sẽ hiện ra như một ô tích cấp được cho nhân
  viên thường — **trái với Q2**. Vì vậy quyền ban hành **không khai thành cap**.
- Claim vai trò trong JWT là `auth.jwt()->>'nv_role'` (dùng ở RLS các bảng KPI).
- `ModuleShell` + `TabButton` + `ActionButton` (`src/components/ModuleShell.jsx`) là
  khuôn chuẩn cho mọi phân hệ — dùng lại, không viết layout mới.
- Màu accent các phân hệ đang dùng: `#0d9488 #0891b2 #16a34a #ef4444 #8b5cf6 #6366f1
  #2563eb #475569`. Chọn **`#ea580c`** cho Quy trình vì chưa ai dùng.
- `jszip` và `file-saver` đã có sẵn trong `package.json` — đủ để sinh `.docx` sau này
  mà không thêm phụ thuộc mới.

## Ngoài phạm vi (không làm lần này)

- **Không** biến quy trình thành workflow chạy thật (không đẩy việc theo bước, không
  gắn trạng thái đang chạy). Đây là **tài liệu**, đúng như đã chốt ở vòng hỏi đầu.
- **Không** sửa bảng nào đang có, không sửa hàm dùng chung nào.
- **Không** đụng `kpiTuDong.js`, `TaskApp.jsx` (ngoài việc nó tự render thêm 1 module
  trong màn hình Phân quyền), hay bất kỳ phân hệ nào khác.
- **Không** thêm phụ thuộc mới vào `package.json`. Cả PNG, PDF lẫn `.docx` đều làm được
  bằng thứ đã có (`jszip`, `file-saver`, API sẵn của trình duyệt).
- **Không** làm phiên bản song song / so sánh hai bản (diff). Ghi nhận là mong muốn về sau.

---

## A. Kiến trúc & tệp

```
src/pages/quy-trinh/
  QuyTrinhApp.jsx        route gốc + ModuleShell + tab
  DanhMucTab.jsx         danh mục quy trình, lọc, nút Tạo mới
  SoanThaoTab.jsx        trình vẽ (canvas + bảng khối + bảng thuộc tính)
  DienGiaiTab.jsx        bảng diễn giải
  ThongTinTab.jsx        mục 1–4, 7 của tài liệu ISO
  XemTruocTab.jsx        bản in A3 + nút xuất

src/lib/
  quyTrinhSoDo.js        hình học + định tuyến + thêm/xoá khối   (thuần, có test)
  quyTrinhKiemTra.js     soát lỗi lưu đồ trước khi ban hành      (thuần, có test)
  quyTrinhDienGiai.js    sơ đồ → các dòng bảng diễn giải         (thuần, có test)
  quyTrinhSvg.js         sơ đồ → chuỗi SVG (dùng cho PNG & in)   (thuần, có test)
  quyTrinhDocx.js        dựng tệp .docx A3 bằng jszip            (phần XML thuần, có test)
  quyTrinhMau.js         mẫu ISO sẵn theo nhóm bộ phận           (thuần, có test)
  quyTrinhXuat.js        nối dây xuất PNG / Word / in PDF        (đụng trình duyệt, kiểm tay)
  quyTrinhApi.js         lớp gọi Supabase — chỗ DUY NHẤT chạm DB (cần DB, kiểm tay)
```

Route: `/quy-trinh/*` trong `src/App.jsx`, bọc
`<ProtectedRoute requiredModule="access_quytrinh">`, lazy-load như 8 phân hệ kia.

Mọi phép tính về lưu đồ nằm trong `src/lib/*`, **không** nằm trong component. Component
chỉ vẽ và bắt sự kiện. Đây là điều kiện để viết được test cho phần khó nhất (định
tuyến đường nối, tự xếp chỗ, soát lỗi).

## B. Mô hình dữ liệu

Hai bảng mới, không đụng bảng cũ.

```sql
create table quy_trinh (
  id           uuid primary key default gen_random_uuid(),
  ma_so        text not null unique,          -- QT-SX-01
  ten          text not null,
  nhom         text not null,                 -- SX | CL | KH | CS | BH | HC
  trang_thai   text not null default 'draft', -- draft | wait | published | expired
  ban_hien_hanh uuid,                         -- → quy_trinh_phien_ban.id
  nguoi_soan   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table quy_trinh_phien_ban (
  id            uuid primary key default gen_random_uuid(),
  quy_trinh_id  uuid not null references quy_trinh(id) on delete cascade,
  phien_ban     text not null,                 -- '2.1'
  lan_ban_hanh  int  not null,                 -- 2
  trang_thai    text not null default 'draft', -- draft | wait | published | expired
  so_do         jsonb not null default '{}',   -- lanes/phases/nodes/edges
  tai_lieu      jsonb not null default '{}',   -- mục 1–4, 7, người ký
  ngay_hieu_luc date,
  ghi_chu_sua_doi text,                        -- dòng cho bảng "Theo dõi sửa đổi"
  nguoi_tao     text not null,
  nguoi_ban_hanh text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  unique (quy_trinh_id, phien_ban)
);
```

**Bảng "Theo dõi sửa đổi" (mục 8) không cần bảng riêng** — nó chính là
`select … from quy_trinh_phien_ban where quy_trinh_id = … order by lan_ban_hanh`.

**Mẫu ISO theo nhóm không cần bảng** — để trong `src/lib/quyTrinhMau.js` dạng hằng số.
Sửa mẫu là sửa mã nguồn, có test, không phải màn hình quản trị. Cần màn hình sửa mẫu
thì bàn riêng.

### Hình dạng `so_do`

```json
{
  "lanes":  [{ "name": "Kho", "owner": "Thủ kho", "color": "#0d9488" }],
  "phases": [{ "name": "Chuẩn bị vật tư", "h": 290 }],
  "nodes":  [{ "id":"n3", "t":"step", "lane":2, "y":160, "dx":0, "w":164, "h":56,
               "tx":"Kiểm tra tồn nguyên vật liệu", "desc":"…",
               "form":"BOM · Tồn kho theo vị trí", "time":"2 giờ", "color":null }],
  "edges":  [{ "id":"e3", "a":"n3", "b":"n4", "lbl":"", "k":"n" }]
}
```

`t` ∈ `start | end | step | dec | check | doc | data` · `k` ∈ `n | ok | ng`.
`lane` là chỉ số cột — **người thực hiện suy ra từ cột**, không lưu trùng ở khối.

## C. Phân quyền & vòng duyệt

Thêm vào `PERM_REGISTRY`:

```js
{
  module: 'quy_trinh', label: 'Quy Trình', icon: '🔀', legacyAccess: 'access_quytrinh',
  tabs: [
    { id: 'danh_muc',  label: 'Danh mục quy trình', caps: ['view', 'create', 'delete', 'io'] },
    { id: 'soan_thao', label: 'Soạn thảo lưu đồ',   caps: ['view', 'edit'] },
  ],
}
```

- `create` = tạo quy trình mới · `delete` = xoá bản nháp (bản đã ban hành không xoá được)
- `io` = xuất PNG / in PDF. Cap này khai ở tab `danh_muc` nhưng **chi phối mọi chỗ xuất
  file trong phân hệ**, kể cả nút xuất ở màn hình Xem trước — một người hoặc được xuất
  tài liệu, hoặc không, không chia nhỏ hơn.
- `edit` = sửa lưu đồ và thông tin tài liệu
- **Không có cap nào cho ban hành.** Nút Ban hành bật/tắt bằng `user.role === 'ADMIN'`.

Vòng đời một phiên bản:

```
draft ──[Gửi duyệt: ai có cap edit]──> wait ──[Ban hành: CHỈ Admin]──> published
                                        │                                  │
                                        └──[Trả lại: CHỈ Admin]──> draft    │
                            bản published cũ ◄──────[expired]──────────────┘
```

Khi ban hành bản mới: bản `published` cũ chuyển `expired`, `quy_trinh.ban_hien_hanh`
trỏ sang bản mới, `quy_trinh.trang_thai = 'published'`. Làm trong **một RPC**, không
làm bằng nhiều lệnh rời từ trình duyệt.

**Chặn ban hành khi lưu đồ còn lỗi** — xem mục E.

## D. Trình vẽ

### Thao tác chính: nút ＋

Chọn một khối → hiện nút ＋. Bấm → bảng chọn nhỏ gồm: **tên bước**, **loại khối**
(Thao tác / Kiểm tra / Quyết định / Tài liệu / Kết thúc), **cột phụ trách**. Bấm Thêm:

1. Khối mới đặt ngay dưới khối nguồn (nhánh **NG** thì đặt sang trái, cùng tầm cao).
2. Tự sinh đường nối, nhãn `OK`/`NG` nếu là nhánh của khối Quyết định.
3. Khối nào đang chắn chỗ trong cùng cột bị đẩy xuống.
4. Nới chiều cao hàng cuối nếu lưu đồ dài ra.

Khối Quyết định có **hai** nút ＋: OK (xuống, xanh) và NG (trái, đỏ).

### Các thao tác còn lại

- **Kéo khối**: chỉnh vị trí. Thả vào cột khác → `lane` đổi → **người thực hiện trong
  bảng diễn giải đổi theo**. Bám lưới 8px.
- **Nối**: chỉ dùng cho mũi tên **quay ngược lên** (làm lại, bổ sung) — thứ nút ＋ không
  tạo được.
- **Tự xếp lại**: giữ nguyên thứ tự người dùng đã dựng, chỉ căn giữa khối theo cột và
  giãn đều trong từng giai đoạn. Không đảo thứ tự — người dùng phải đoán được kết quả.
- **Thêm cột / Thêm hàng**, **Hoàn tác / Làm lại** (ngăn xếp 40 bước), **Xoá** (xoá khối
  kéo theo mọi đường nối của nó), **Phóng to/thu nhỏ** 50–150%.
- Bảng khối hình bên trái chỉ để thêm **khối rời** không nối tiếp ai — trường hợp hiếm.

### Định tuyến đường nối (`quyTrinhSoDo.js`)

Đường gấp khúc vuông góc, bo góc 9px, theo ba trường hợp:

| Quan hệ hai khối | Cách đi |
|---|---|
| Cùng tầm cao (\|Δy\| < 46) | ra cạnh trái/phải, đi ngang |
| Đích ở dưới, lệch ngang < 24 | ra cạnh dưới, đi thẳng xuống |
| Đích ở dưới, lệch ngang lớn | xuống → ngang ở giữa hai khối → xuống |
| Đích ở trên (vòng lặp) | ra cạnh trên → lên ngang tầm đích → vào cạnh bên đích |

Nhãn đặt giữa đoạn dài nhất. Nhánh `ng` vẽ nét đứt đỏ, `ok` nét liền xanh, còn lại xám.

## E. Soát lỗi trước khi ban hành (`quyTrinhKiemTra.js`)

Hàm thuần `kiemTraLuuDo(soDo)` trả danh sách vấn đề, chia **lỗi** (chặn ban hành) và
**cảnh báo** (chỉ nhắc):

| Mức | Điều kiện |
|---|---|
| Lỗi | Thiếu khối Bắt đầu hoặc Kết thúc |
| Lỗi | Khối mồ côi — không có đường vào (mà không phải Bắt đầu) hoặc không có đường ra (mà không phải Kết thúc) |
| Lỗi | Khối Quyết định có ít hơn 2 nhánh ra, hoặc có nhánh thiếu nhãn |
| Lỗi | Bước thiếu **Diễn giải chi tiết** — tài liệu ISO không được có ô trống |
| Cảnh báo | Hai khối chồng lên nhau |
| Cảnh báo | Bước thiếu **Hồ sơ / Biểu mẫu** hoặc **Thời gian chuẩn** |

Đây là phần trả giá trị lớn nhất cho yêu cầu "đúng chuẩn ISO": nó chặn tài liệu lỗi
**trước khi** ban hành, thay vì để đánh giá viên phát hiện.

## F. Bảng diễn giải & tài liệu ISO

Bảng diễn giải sinh từ sơ đồ (`quyTrinhDienGiai.js`), thứ tự **trên xuống dưới, trái
sang phải**, bỏ khối Bắt đầu/Kết thúc khỏi đánh số. Cột: Bước · Người thực hiện (suy từ
cột) · Diễn giải chi tiết · Hồ sơ–Biểu mẫu · Thời gian. Dòng thuộc nhánh OK/NG được
đánh dấu màu. Sửa ở bảng ghi ngược vào khối — một nguồn dữ liệu duy nhất.

Bản in A3 ngang gồm, theo đúng thứ tự:

- Khối kiểm soát tài liệu: tên công ty · tên quy trình · mã số · lần ban hành · ngày
  hiệu lực · phiên bản · trang · khổ giấy
- Ba ô chữ ký: Người lập · Người kiểm tra · Người duyệt
- **1.** Mục đích · **2.** Phạm vi áp dụng · **3.** Tài liệu viện dẫn · **4.** Định nghĩa & từ viết tắt
- **5.** Lưu đồ quy trình
- **6.** Diễn giải lưu đồ
- **7.** Hồ sơ lưu (tên hồ sơ · bộ phận lưu · thời gian lưu · hình thức lưu)
- **8.** Theo dõi sửa đổi tài liệu (lần sửa · ngày · phiên bản · nội dung · người sửa)

Mục 1–4 và 7 điền ở tab **Thông tin tài liệu**, mở ra đã có sẵn mẫu theo nhóm bộ phận.

## G. Xuất file

Cả ba định dạng làm trong cùng một đợt, **không thêm phụ thuộc mới**.

### PNG — ảnh lưu đồ để in dán xưởng

`quyTrinhSvg.js` sinh SVG thuần từ `so_do`, dùng lại đúng các hàm hình học của trình vẽ
→ `new Image()` với `data:image/svg+xml` → vẽ lên `<canvas>` ở tỉ lệ 2× cho nét
→ `toBlob` → `file-saver`. Tên tệp `QT-SX-01_v2.1_luu-do.png`.

### PDF A3 — bản in nhanh

`@media print` đặt `@page { size: A3 landscape; margin: 10mm }`, ẩn khung ứng dụng, chỉ
để lại tờ giấy. Người dùng bấm In rồi chọn "Lưu thành PDF".

### Word `.docx` A3 — bản sửa được, nộp hồ sơ ISO

`.docx` là tệp ZIP chứa XML, nên `jszip` có sẵn là đủ. Module `quyTrinhDocx.js` dựng:

```
[Content_Types].xml
_rels/.rels
word/document.xml            ← toàn bộ nội dung
word/_rels/document.xml.rels ← liên kết tới ảnh
word/media/image1.png        ← lưu đồ, lấy từ đường PNG ở trên
```

Chi tiết bắt buộc đúng, nếu sai thì Word báo hỏng tệp:

- **Khổ A3 ngang** trong `<w:sectPr>`: `<w:pgSz w:w="23811" w:h="16838" w:orient="landscape"/>`
  (A3 = 297×420mm; 1mm = 1440/25.4 twip ⇒ 420mm = 23811 twip, 297mm = 16838 twip).
- **Ảnh** nhúng bằng `<w:drawing>/<wp:inline>`, kích thước tính bằng EMU
  (1 inch = 914400 EMU), co theo bề ngang vùng in.
- **Phông** `<w:rFonts w:ascii="Times New Roman">` cỡ 12 — quy ước tài liệu ISO tiếng
  Việt. Khai thành hằng số trong module để đổi được.
- **Thoát ký tự** `& < >` trong mọi ô chữ, nếu không tên bước có dấu `&` sẽ làm vỡ XML.

Cấu trúc nội dung đúng 8 mục như bản in ở mục F, các bảng dựng bằng `<w:tbl>`.

**Tách phần thuần ra để test được**: các hàm dựng chuỗi XML (`docXml`, `bangXml`,
`sectPrXml`, `thoat`) là hàm thuần chuỗi-vào-chuỗi-ra → có test. Phần gói ZIP và phần
đổi SVG sang PNG cần API trình duyệt → kiểm chứng tay, mở tệp bằng Word thật.

## H. Bảo mật

Bắt buộc chạy skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao. Ngưỡng phải đạt:

- Khoá công khai (anon) **không đọc, không ghi, không xoá** được `quy_trinh` và
  `quy_trinh_phien_ban`. Phải đo thật bằng chính khoá công khai, trên dòng có thật.
- Người đăng nhập thường: đọc được, ghi được bản nháp, **không** ban hành được.

Thiết kế policy — RLS chặn người ngoài, **quyền theo cột** chặn người trong tự ban hành:

```sql
alter table quy_trinh           enable row level security;
alter table quy_trinh_phien_ban enable row level security;

-- Đọc & ghi: chỉ tài khoản đã đăng nhập. Vai trò công khai không có policy nào ⇒ 0 dòng.
create policy qt_sel on quy_trinh for select to authenticated using (true);
create policy qt_ins on quy_trinh for insert to authenticated with check (true);
create policy qt_upd on quy_trinh for update to authenticated using (true) with check (true);
create policy qt_del on quy_trinh for delete to authenticated using (trang_thai = 'draft');
-- (bộ tương tự cho quy_trinh_phien_ban; xoá chỉ cho bản draft)

-- Cột trạng thái KHÔNG nằm trong quyền ghi của người dùng thường.
revoke update on quy_trinh           from authenticated;
revoke update on quy_trinh_phien_ban from authenticated;
grant  update (ten, nhom, updated_at)                     on quy_trinh           to authenticated;
grant  update (so_do, tai_lieu, ghi_chu_sua_doi)          on quy_trinh_phien_ban to authenticated;
```

Ba chuyển trạng thái đều đi qua RPC `SECURITY DEFINER`, không có đường nào khác:

| RPC | Ai gọi được | Việc |
|---|---|---|
| `rpc_qt_gui_duyet(p_phien_ban_id)` | người đăng nhập | `draft` → `wait` |
| `rpc_qt_tra_lai(p_phien_ban_id, p_ly_do)` | **chỉ ADMIN** | `wait` → `draft` |
| `rpc_qt_ban_hanh(p_phien_ban_id)` | **chỉ ADMIN** | `wait` → `published`, bản cũ → `expired`, cập nhật `ban_hien_hanh` — trong một giao dịch |

Hai RPC dành cho admin mở đầu bằng:

```sql
if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
  raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
end if;
```

`rpc_qt_ban_hanh` còn soát **cấu trúc tối thiểu** ngay trong SQL: lưu đồ phải có đủ
khối Bắt đầu và Kết thúc mới ban hành được.

Nói rõ giới hạn để không ai hiểu nhầm: **luật soát lỗi đầy đủ ở mục E chạy phía giao
diện, không chép sang PL/pgSQL.** Lý do là chép 80 dòng luật sang SQL sẽ thành hai bản
luật lệch nhau theo thời gian — đúng loại nợ kỹ thuật sinh lỗi âm thầm. Đánh đổi này
chấp nhận được vì **soát nội dung không phải ranh giới bảo mật**: chỉ Admin mới tới
được bước ban hành, và Admin được tin về mặt nội dung. Thứ *là* ranh giới bảo mật —
"ai được ban hành" — thì chặn ở máy chủ, bằng cả kiểm tra vai trò lẫn quyền ghi theo cột.

Vì sao dùng quyền theo cột thay vì `with check` trên `trang_thai`: `WITH CHECK` soi
**dòng sau khi sửa**, nên điều kiện `trang_thai <> 'published'` sẽ chặn luôn cả việc
sửa tên một quy trình đang có hiệu lực — cấm nhầm người dùng hợp lệ. Quyền theo cột
chặn đúng thứ cần chặn: **không ai ngoài RPC ghi được vào cột trạng thái.**

Khoá nút Ban hành ở giao diện chỉ là lớp ngoài cho dễ nhìn, không phải chỗ chặn thật.

## I. Ảnh hưởng tới luồng đang chạy — đã rà

| Tệp | Thay đổi | Ảnh hưởng |
|---|---|---|
| `src/lib/permRegistry.js` | thêm 1 phần tử vào `PERM_REGISTRY` | Màn hình Phân quyền (`TaskApp.jsx:517`) **hiện thêm 1 phân hệ** — đúng ý muốn. `ProtectedRoute.jsx:49` tra theo `legacyAccess`, khoá `access_quytrinh` là mới nên không đụng khoá cũ. `migrateLegacyToTabPerms` chỉ bật cờ khi user đã có `access_quytrinh` — người cũ không có nên không đổi gì. Test `permRegistry.test.js:9` đòi mọi tab có `view` — hai tab mới đều có. |
| `src/pages/HomePage.jsx` | thêm 1 phần tử vào `MODULES` | Thêm 1 thẻ ở trang chủ cho người được cấp quyền. Người chưa được cấp không thấy. |
| `src/App.jsx` | thêm 1 lazy import + 1 route | Không đụng route nào đang có. |

**Không sửa hàm dùng chung nào.** Không đụng bảng dữ liệu nào đang có. Không phân hệ
nào đổi hành vi.

Một điểm cần người dùng biết trước: sau khi lên bản thật, **phải vào màn hình Phân
quyền cấp quyền tab Quy Trình** cho từng người, nếu không họ sẽ không thấy phân hệ này
ở trang chủ. Đây là hành vi giống hệt lúc thêm tab Cải tiến.

## J. Kiểm thử

Test đơn vị (vitest) cho 5 module thuần:

- `quyTrinhSoDo.test.js` — định tuyến đủ 4 trường hợp; thêm bước đặt đúng chỗ và đẩy
  khối chắn chỗ; thả sang cột khác đổi người thực hiện; tự xếp lại **không đảo thứ tự**.
- `quyTrinhKiemTra.test.js` — bắt đủ 4 loại lỗi và 2 loại cảnh báo; lưu đồ mẫu QT-SX-01 phải sạch.
- `quyTrinhDienGiai.test.js` — thứ tự đánh số; nhãn nhánh OK/NG; bỏ Bắt đầu/Kết thúc.
- `quyTrinhSvg.test.js` — SVG sinh ra có đủ số khối và số đường nối; thoát ký tự đúng.
- `quyTrinhDocx.test.js` — `sectPrXml` ra đúng khổ A3 ngang (23814 × 16839); `bangXml`
  ra đúng số `<w:tr>`; `thoat` xử lý được tên bước có `&`, `<`, `>`; `docXml` chứa đủ 8
  mục.
- `quyTrinhMau.test.js` — mỗi nhóm bộ phận có đủ mục 1–4 và 7, không có ô trống.

Kiểm chứng tay trên app thật: tạo mới → vẽ 5 bước bằng nút ＋ → gửi duyệt bằng tài
khoản thường (nút Ban hành phải khoá) → đăng nhập admin ban hành → xuất PNG, in PDF A3,
và **mở tệp `.docx` bằng Word thật** để chắc không hỏng tệp và đúng khổ A3 ngang.

## K. Phạm vi một đợt

Làm gọn trong một đợt: bảng dữ liệu + RLS theo cột + 3 RPC chuyển trạng thái, 6 module
thuần kèm test, 5 màn hình, phân quyền, và **cả ba đường xuất PNG / PDF / Word A3**.
Chạy skill `kiem-tra-bao-mat-du-lieu` rồi mới bàn giao.

**Về sau, chưa cam kết** — so sánh hai phiên bản, ký duyệt điện tử, gắn quy trình vào
phân hệ tương ứng để mở nhanh từ nơi làm việc.
