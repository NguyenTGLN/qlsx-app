# Thiết kế: Danh mục Nhà cung cấp + chọn NCC theo list khi Nhập kho

Ngày: 2026-07-02
Nhánh: `feat/ton-hh-chi-tiet-de-xuat`

## 1. Bối cảnh & Mục tiêu

Form **Nhập kho → Nhập mua vào** ([ImportStockTab.jsx](../../../src/pages/kho/ImportStockTab.jsx)) hiện có ô "Nhà cung cấp" là `<input>` gõ tay tự do, lưu vào cột `ma_ncc` của bảng `du_lieu_nhap`. Gõ tay dễ sai chính tả, không đồng nhất, không tra cứu được thông tin NCC.

Người dùng có sẵn file `danh mục nhà cung cấp.xlsx` (145 NCC, cột: Mã NCC · Tên NCC · Người liên hệ · SĐT · Địa chỉ) và muốn:
1. Khi nhập kho, **chọn NCC theo danh sách gợi ý** thay vì gõ tay.
2. Có **danh mục NCC quản lý được**: xem / thêm / sửa / xóa / import-export / tra cứu thông tin.

**Quyết định chốt với người dùng:** ô chọn NCC hoạt động kiểu **gõ-tìm gợi ý, chỉ chọn được NCC đã có trong danh mục** (NCC lạ phải vào Danh mục NCC thêm trước → dữ liệu sạch nhất).

## 2. Phạm vi

**Trong phạm vi:**
- Bảng Supabase mới `nha_cung_cap` + seed 145 dòng từ Excel.
- Tab mới "Danh mục NCC" trong module Kho (CRUD đầy đủ, import/export Excel), có phân quyền.
- Thay ô gõ tay NCC trong form Nhập kho bằng ô gõ-tìm gợi ý đọc từ `nha_cung_cap`.

**Ngoài phạm vi (YAGNI):**
- KHÔNG đổi cột `ma_ncc` của `du_lieu_nhap` sang lưu mã NCC — vẫn lưu **tên NCC** (text) để tương thích ngược 100% với dữ liệu & báo cáo cũ (cột này còn dùng chung cho mã PSX-/đơn hàng).
- KHÔNG thêm cột trạng thái "đang hoạt động / ngừng".
- KHÔNG gắn NCC vào các tab/luồng khác ngoài Nhập kho.

## 3. Database — bảng `nha_cung_cap`

File mới: `sql/setup_nha_cung_cap.sql` (schema + RLS + seed), theo đúng khuôn `sql/setup_kho_schema.sql`.

```sql
CREATE TABLE IF NOT EXISTS public.nha_cung_cap (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ma_ncc        TEXT NOT NULL UNIQUE,     -- Mã NCC (VD: AIRMEC)
  ten_ncc       TEXT,                     -- Tên NCC (fallback = ma_ncc nếu rỗng)
  nguoi_lien_he TEXT,                     -- Người liên hệ
  so_dien_thoai TEXT,                     -- SĐT — TEXT để giữ số 0 đầu / khoảng trắng
  dia_chi       TEXT,                     -- Địa chỉ
  ghi_chu       TEXT,                     -- Ghi chú (mới, không có trong Excel)
  created_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ncc_ten ON public.nha_cung_cap (ten_ncc);

ALTER TABLE public.nha_cung_cap ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.nha_cung_cap;
CREATE POLICY "Enable full access for all users" ON public.nha_cung_cap FOR ALL USING (true);
```

- **Khóa chính:** dùng `id` (identity) + `ma_ncc UNIQUE`. `ma_ncc` là khóa nghiệp vụ để upsert khi import.
- **Grants:** mirror bảng cùng schema (mặc định anon key + RLS `USING(true)` như các bảng kho khác).

### Seed 145 dòng — xử lý chất lượng dữ liệu
Sinh phần `INSERT` bằng script Node đọc trực tiếp `danh mục nhà cung cấp.xlsx` (sheet `DM NCC`, dữ liệu từ dòng thứ 3):
- **Trim** mã 2 đầu (7 mã có khoảng trắng thừa như ` CLARIER`, `DUONG DONG` — giữ khoảng trắng giữa).
- **Khử trùng mã** (4 mã trùng: HQ, MINHTHU, KOKEN, CUONGTHINH) — gộp giữ dòng đầy đủ thông tin nhất (nhiều cột không rỗng nhất); tránh vi phạm `UNIQUE`.
- **SĐT → text** (75/145 đang là number trong Excel).
- **Tên rỗng → fallback = mã** (DORRY, KAIZEN… để ô gợi ý luôn có nhãn hiển thị).
- Dùng `INSERT ... ON CONFLICT (ma_ncc) DO NOTHING` để chạy lại nhiều lần an toàn.

## 4. Tab mới "Danh mục NCC"

Component mới: `src/pages/kho/SupplierTab.jsx` — **bắt chước khuôn** [CatalogTab.jsx](../../../src/pages/kho/CatalogTab.jsx):
- Bảng cột: **Mã NCC · Tên NCC · Người liên hệ · SĐT · Địa chỉ · Ghi chú**.
- **Tải toàn bộ danh mục 1 lần** (145 dòng, rất nhỏ) rồi lọc & phân trang **phía client**; ô tìm kiếm gõ khớp tên/mã/SĐT/người liên hệ.
- **Thêm / Sửa** qua modal (form 6 trường; `ma_ncc` bắt buộc & duy nhất).
- **Chọn nhiều dòng → Xóa** (có xác nhận).
- **Import Excel**: đọc file cùng định dạng (Mã/Tên/Người liên hệ/SĐT/Địa chỉ), upsert theo `ma_ncc` (`ON CONFLICT DO UPDATE`) → cho phép cập nhật hàng loạt từ file.
- **Export Excel**: xuất toàn bộ (hoặc dòng đã chọn) ra `.xlsx`.
- Cập nhật `updated_at = now()` khi sửa.

### Đăng ký tab + phân quyền
- Thêm vào `ALL_TABS` trong [KhoHangApp.jsx](../../../src/pages/kho/KhoHangApp.jsx): `{ id: 'danh-muc-ncc', label: 'Danh mục NCC', short: 'NCC', icon: Truck, color: '#be123c' }` — đặt **ngay sau** `danh-muc` (nhóm dữ liệu master); thêm `Truck` vào import `lucide-react`.
- Thêm nhánh render trong switch: `activeTab === 'danh-muc-ncc' ? <SupplierTab perms={perms} /> : ...`.
- Thêm vào [permRegistry.js](../../../src/lib/permRegistry.js) module `kho`: `{ id: 'danh-muc-ncc', label: 'Danh mục NCC', caps: ['view','create','edit','delete','io'] }`.
- Admin thấy ngay (getTabPerm/canSeeTab auto-true cho ADMIN). User khác: cấp quyền qua ma trận phân quyền sẵn có.

## 5. Ô "Nhà cung cấp" trong form Nhập kho → gõ-tìm gợi ý

Trong [ImportStockTab.jsx](../../../src/pages/kho/ImportStockTab.jsx):
- **Tải danh sách NCC 1 lần** khi component mount (cùng chỗ đang load `catalog`/orders, dòng ~200): `db.from('nha_cung_cap').select('ma_ncc, ten_ncc, so_dien_thoai, nguoi_lien_he').order('ten_ncc')` → lưu state `suppliers`.
- **Thay ô `<input>` gõ tay** ở cả 2 chỗ (block `sourceType === 'ncc'` [dòng ~827] và `sourceType === 'none'` [dòng ~854]) bằng component **`AutoSuggest` đã có sẵn trong file** (dòng 18–97) — component này đã dùng `position:fixed` neo theo input nên **không bị modal cắt dropdown** ([[qlsx-modal-dropdown-clipping]]).
  - Truyền `data={suppliers}`, `keyField='ma_ncc'`, `labelField='ten_ncc'`.
  - **Mở rộng nhẹ `AutoSuggest`**: thêm prop tùy chọn `extraFields=[]` để bộ lọc `results` cũng khớp SĐT/người liên hệ (giữ mặc định cũ nếu không truyền → không ảnh hưởng ô "Tìm và thêm hàng hóa").
  - `onChange={ncc => updateBlock(block.id, b => ({ ...b, sourceValue: ncc.ten_ncc }))}` — **lưu tên NCC** vào `sourceValue` (giữ nguyên luồng lưu `ma_ncc = sourceValue`).
- **Hiển thị NCC đã chọn:** dưới ô gợi ý cho hiện chip/nhãn "NCC: {sourceValue}" + nút ✕ để đổi (vì `AutoSuggest` tự clear input sau khi chọn). Khi `sourceValue` rỗng thì hiện ô gợi ý; khi đã có thì hiện nhãn đã chọn.
- **NCC lạ:** không có trong list → không chọn được; hiện dòng gợi ý "Không tìm thấy — vào *Danh mục NCC* để thêm". (Không mở luồng thêm-nhanh trong bản này.)
- Giữ nguyên phần **in phiếu** (`only-print` "Nhà cung cấp: {sourceValue}") — vì `sourceValue` vẫn là tên NCC.

### Tương thích ngược
`sourceValue` vẫn là **tên NCC (text)** → luồng lưu vào `du_lieu_nhap.ma_ncc` không đổi; các phiếu cũ, báo cáo, và logic `startsWith('PSX-')` (dòng ~481) không bị ảnh hưởng.

## 6. Kiểm thử

- **Seed SQL:** chạy 2 lần liên tiếp không lỗi (idempotent nhờ `ON CONFLICT`); đếm đúng số NCC (145 − số dòng gộp trùng).
- **SupplierTab:** thêm mới (mã trùng bị chặn), sửa, xóa nhiều dòng, import file cập nhật, export ra Excel mở đúng.
- **Form Nhập kho:** gõ vài ký tự → gợi ý đúng theo tên/mã/SĐT; chọn → nhãn hiển thị đúng; lưu phiếu → `du_lieu_nhap.ma_ncc` = tên NCC đã chọn; dropdown không bị cắt trong modal; ô "Tìm và thêm hàng hóa" vẫn hoạt động như cũ.
- Kiểm thử thủ công trên preview theo [[qlsx-preview-verification]] (đăng nhập, vào Kho → Nhập mua vào).

## 7. Triển khai

Theo [[qlsx-netlify-deploy]]: sau khi sửa code → `npm run build` → copy `dist/` sang `deploy-netlify/` (commit bundle). Người dùng: (a) chạy `sql/setup_nha_cung_cap.sql` trên Supabase, (b) kéo-thả `deploy-netlify/` lên Netlify.
