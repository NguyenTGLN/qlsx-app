# Thiết kế: Phân quyền chi tiết theo Tab (View / CRUD)

- **Ngày:** 2026-06-04
- **Trạng thái:** Đã duyệt thiết kế, chờ rà spec → lập kế hoạch
- **Liên quan:** `src/lib/AuthContext.jsx`, modal Sửa nhân viên trong `src/pages/tasks/TaskApp.jsx`, các module `src/pages/**`
- **Bối cảnh cũ:** memory `qlsx-kho-quality-permissions` (quyền theo nhóm thao tác hiện tại), `qlsx-tech-debt`

## 1. Mục tiêu & vấn đề

Admin muốn **gán cho từng nhân viên được làm việc với từng tab của từng phân hệ**, và **trong mỗi tab tách quyền Xem và các tác vụ**. Mong muốn cốt lõi: nhân viên **không thấy phần việc không liên quan**, nhưng admin **không phải ngồi suy nghĩ từng quyền** — bảng tick phải gọn, mặc định an toàn (tắt hết).

Quyết định đã chốt với người dùng:
- **Tick tay** từng tab/tác vụ (không dùng mẫu chức danh/template).
- Áp cho **toàn bộ phân hệ**.
- Mỗi tab dùng **bộ CRUD chuẩn**: `view / create / edit / delete / io` (io = Nhập/Xuất, Import/Export).
- **Mặc định tắt hết**; không tick `view` của tab → ẩn tab; không tab nào có `view` trong phân hệ → ẩn phân hệ.

## 2. Phạm vi

**Trong phạm vi:**
- Khung phân quyền 3 cấp dùng chung (registry + helper + hook).
- Giao diện gán quyền dạng ma trận trong modal Sửa nhân viên.
- Gài quyền (ẩn tab/nút) cho: Kho Hàng, Công Việc, Bảo Hành, CSKH, Chất Lượng, Sản Xuất, Tổng Quan.
- Hàm đồng bộ quyền cũ → key tab mới.

**Ngoài phạm vi (ghi nhận, không làm trong dự án này):**
- **Chặn server-side (RLS).** App đăng nhập bằng query bảng `nhan_vien` với anon key (không dùng Supabase Auth), nên RLS không nhận diện được user. Toàn bộ phân quyền này là **chặn ở client** (ẩn tab/nút) — giống hiện trạng đã ghi trong `qlsx-tech-debt`. Người dùng kỹ thuật vẫn có thể gọi thẳng API nếu cố tình. Chặn server-side thật sự = đổi sang Supabase Auth, là một dự án riêng.
- Mẫu chức danh/template (đã loại theo lựa chọn người dùng).
- Phân quyền theo bản ghi (row-level, ví dụ "chỉ thấy việc của mình") — ngoài cấp tab.

## 3. Mô hình quyền (3 cấp)

```
Phân hệ (module)  →  Tab  →  Tác vụ (cap): view | create | edit | delete | io
```

### 3.1 Registry trung tâm

Một nguồn sự thật duy nhất khai báo cấu trúc phân hệ → tab → các tác vụ mỗi tab hỗ trợ. Đặt trong `src/lib/permRegistry.js` (mới):

```js
// caps: tập tác vụ tab hỗ trợ. Tab chỉ-đọc -> chỉ ['view'].
export const PERM_REGISTRY = [
  {
    module: 'kho', label: 'Kho Hàng', icon: '🏬',
    legacyAccess: 'access_warehouse',
    tabs: [
      { id: 'nhap-kho',        label: 'Bốc dỡ & Nhập kho',        caps: ['view','create','edit','delete','io'] },
      { id: 'du-lieu-nhap',    label: 'Dữ liệu nhập',             caps: ['view','edit','delete','io'] },
      { id: 'luu-xuat',        label: 'Lưu xuất',                 caps: ['view','create','edit','delete','io'] },
      { id: 'xuat',            label: 'Dữ liệu xuất',             caps: ['view','edit','delete','io'] },
      { id: 'ton-kho-tong',    label: 'Tồn kho hàng hóa',         caps: ['view','io'] },
      { id: 'ton-kho-so-sach', label: 'Tồn kho sổ sách',          caps: ['view'] },
      { id: 'ton-kho',         label: 'Tồn kho theo vị trí',      caps: ['view','io'] },
      { id: 'danh-muc',        label: 'Danh mục hàng hóa',        caps: ['view','create','edit','delete','io'] },
      { id: 'bom',             label: 'BOM Sản xuất',             caps: ['view','create','edit','delete','io'] },
      { id: 'lenh-sx',         label: 'Bốc dỡ & Xuất kho (PSX)',  caps: ['view','create','edit','delete','io'] },
      { id: 'lich-su-boc-do',  label: 'Lịch sử bốc dỡ',           caps: ['view'] },
      { id: 'dksx',            label: 'DKSX — Nhu cầu sản xuất',  caps: ['view','create','delete'] }, // "Làm phiếu SX"=create, "Hủy"=delete
      { id: 'de-xuat-dat-hang',label: 'Đề xuất đặt hàng (DLK)',   caps: ['view','create','edit','delete'] }, // "Gửi/Nhập đề xuất"=create, sửa số=edit, "Hủy/Xóa"=delete
      { id: 'ton-kho-sx',      label: 'Tồn kho Sản xuất',         caps: ['view','create','edit','delete','io'] },
      { id: 'print_queue',     label: 'Quản Lý Chứng Từ',         caps: ['view','create','delete'] },
    ],
  },
  {
    module: 'tasks', label: 'Công Việc', icon: '📋',
    legacyAccess: 'access_tasks',
    tabs: [
      { id: 'dashboard',   label: 'Tổng quan',  caps: ['view'] },
      { id: 'tasks',       label: 'Công việc',  caps: ['view','create','edit','delete'] }, // map quyền cũ create_task/edit_task/...
      { id: 'work_report', label: 'Báo Cáo',    caps: ['view','io'] },
    ],
  },
  {
    module: 'warranty', label: 'Bảo Hành', icon: '🛡️',
    legacyAccess: 'access_warranty',
    tabs: [
      { id: 'history',        label: 'Lịch Sử Phiếu',  caps: ['view','create','edit','delete','io'] },
      { id: 'batchAnalytics', label: 'Phân Tích Lỗi',  caps: ['view','io'] },
      { id: 'dataManager',    label: 'QL Dữ Liệu',     caps: ['view','create','edit','delete','io'] },
    ],
  },
  {
    module: 'cskh', label: 'CSKH', icon: '🎧',
    legacyAccess: 'access_cskh',
    tabs: [
      { id: 'dashboard',    label: 'Tổng Quan',          caps: ['view'] },
      { id: 'zalo_kpi',     label: 'KPI CSKH Zalo',      caps: ['view','edit','delete','io'] }, // mark_done=edit, delete, export=io, filter -> không cần quyền riêng
      { id: 'zalo_report',  label: 'BC Trực Zalo',       caps: ['view','create','edit','delete'] },
    ],
  },
  {
    module: 'quality', label: 'Chất Lượng SP', icon: '🔬',
    legacyAccess: 'access_quality',
    tabs: [
      // Module 1 màn hình -> 1 tab ngầm trùng id module
      { id: 'main', label: 'Chất lượng SP', caps: ['view','create','edit','delete','io'] },
    ],
  },
  {
    module: 'production', label: 'Nhập Liệu Sản Xuất', icon: '🏭',
    legacyAccess: 'access_production',
    tabs: [
      { id: 'main', label: 'Nhập liệu sản xuất', caps: ['view','create','edit','delete'] },
    ],
  },
  {
    module: 'overview', label: 'Tổng Quan / Sản Xuất', icon: '📊',
    legacyAccess: 'access_overview',
    tabs: [
      { id: 'main', label: 'Tổng quan sản xuất', caps: ['view','io'] },
    ],
  },
];
```

> Lưu ý: với module 1 màn hình (quality, production, overview) ta vẫn mô hình hóa thành **1 tab** để cùng một cơ chế. Một số nút "đặc thù" được gom vào tác vụ CRUD gần nhất (đã chú thích inline trong registry) — giữ bảng tick luôn 5 cột đồng nhất.

### 3.2 Quy tắc suy diễn

- `view` của tab = **được mở tab**. Không có → ẩn tab khỏi thanh tab và khỏi lưới menu.
- Phân hệ **hiện** ⇔ có ít nhất 1 tab trong phân hệ đó có `view`.
- Có `view` nhưng không có `create/edit/delete/io` của tab → **chỉ xem** (các nút thao tác bị ẩn).
- Admin (`role === 'ADMIN'`) → mọi quyền `true` (giữ nguyên hành vi hiện tại).

## 4. Lưu trữ & tương thích ngược

### 4.1 Định dạng key
- Vẫn lưu trong cột JSON `nhan_vien.permissions` — **không đổi schema DB**.
- Key tab mới (phẳng, có tiền tố): `tab.<module>.<tabId>.<cap>` → giá trị `true`.
  - Ví dụ: `tab.kho.nhap-kho.edit`, `tab.kho.ton-kho-so-sach.view`, `tab.warranty.history.create`.
- Key cũ (`access_*`, `kho_edit`, `view_tasks`, `create_task`, `zalo_kpi_*`, `quality_edit`...) **giữ nguyên trong file**, không xoá trong dự án này (tránh gãy code chưa kịp migrate). Sau khi mọi module đã chuyển sang đọc key `tab.*`, có thể dọn ở dự án dọn nợ riêng.

### 4.2 Helper & hook (trong `src/lib/AuthContext.jsx` hoặc `permRegistry.js`)
```js
tabKey(module, tabId, cap)            // -> `tab.${module}.${tabId}.${cap}`
getTabPerm(user, module, tabId)       // -> {view, create, edit, delete, io} (admin = all true)
canSeeTab(user, module, tabId)        // -> bool (view)
canSeeModule(user, module)            // -> bool (>=1 tab view)
```
- `useTabPerm(module, tabId)` = hook bọc `getTabPerm(useAuth().user, ...)`.
- Trả về object đã chỉ chứa các cap mà tab **hỗ trợ** (theo registry); cap không hỗ trợ luôn `false`.

### 4.3 Đồng bộ quyền cũ (1 lần)
Hàm `migrateLegacyToTabPerms(perms)`:
- Nếu user có `access_<module>` → bật `view` cho **tất cả** tab của module đó (giữ nguyên việc họ đang thấy gì).
- Map nhóm thao tác cũ sang cap mới theo bảng:
  - `kho_edit` → `create/edit/io` cho các tab Kho có các cap đó; `kho_delete` → `delete`; `kho_catalog` → `create/edit/delete/io` cho `danh-muc` & `bom`; `kho_order` → `create/edit/delete` cho `dksx`, `de-xuat-dat-hang`, và `create` cho `ton-kho-tong` (gửi đề xuất).
  - `create_task/edit_task/delete_task/...` → `create/edit/delete` cho `tab.tasks.tasks`; `view_dashboard` → `view` cho `dashboard` & `work_report`; `view_tasks` → `view` cho `tasks`.
  - `zalo_kpi_view` → `view` cho `zalo_kpi`; `zalo_kpi_mark_done` → `edit`; `zalo_kpi_delete` → `delete`; `zalo_kpi_export` → `io`.
  - `quality_edit` → `create/edit/io`; `quality_delete` → `delete` cho `tab.quality.main`.
- **Kích hoạt:** chạy tự động khi admin mở modal Sửa nhân viên lần đầu (nếu chưa có key `tab.*` nào) để prefill, admin xem lại rồi Lưu. Không tự ghi đè DB ngầm.

## 5. Giao diện gán quyền (modal Sửa nhân viên, `TaskApp.jsx`)

Thay 2 khối checkbox phẳng (`MODULE_PERMS`, `FEATURE_PERMS`) bằng **ma trận tự sinh từ `PERM_REGISTRY`**:

```
▼ 🏬 Kho Hàng                         Xem  Thêm  Sửa  Xóa  N/X     [Chỉ xem][Toàn quyền][Bỏ]
   Bốc dỡ & Nhập kho                   ☑    ☑    ☑    ☐    ☑
   Tồn kho sổ sách                     ☑    —    —    —    —
   Danh mục hàng hóa                   ☑    ☑    ☑    ☑    ☑
   ...
▶ 📋 Công Việc           (gập)
▶ 🛡️ Bảo Hành            (gập)
▶ 🎧 CSKH                (gập)
▶ 🔬 Chất Lượng SP       (gập)
▶ 🏭 Nhập Liệu Sản Xuất  (gập)
▶ 📊 Tổng Quan / Sản Xuất(gập)
```

Hành vi:
- Mỗi phân hệ là 1 nhóm **gập/mở** (mặc định gập). Header hiện số tab đã bật (vd "Kho Hàng — 3/16 tab").
- 5 cột cố định: **Xem / Thêm / Sửa / Xóa / N/X**. Ô `—` = tab không hỗ trợ cap đó (disabled).
- Tick **Xem** mới mở được 4 ô tác vụ của tab; **bỏ Xem** tự khoá + tự bỏ tick các tác vụ của tab đó (không thể có quyền sửa mà không xem).
- Nút nhanh mỗi phân hệ: **"Chỉ xem tất cả"** (bật view mọi tab), **"Toàn quyền"** (bật mọi cap được hỗ trợ), **"Bỏ chọn hết"**.
- Lưu: gom các ô ☑ thành các key `tab.*` = true trong `f.permissions`, **giữ nguyên** các key cũ đang có. Bỏ tick = xoá key (hoặc set false).
- Form nhân viên Admin: ẩn ma trận (admin toàn quyền), như hiện tại.

## 6. Thực thi (ẩn tab/nút) theo module

Pattern chung cho mỗi tab component:
```js
const p = useTabPerm('kho', 'nhap-kho'); // {view,create,edit,delete,io}
// thanh tab:
{canSeeTab(user,'kho',tab.id) && <TabButton .../>}
// nút:
{p.create && <button>Thêm</button>}
{p.edit   && <button>Sửa</button>}
{p.delete && <button>Xóa</button>}
{p.io     && <button>Import/Export</button>}
```

- **Kho (`KhoHangApp.jsx`):** thay prop `perms={edit,catalog,del,order}` cũ bằng `useTabPerm` theo từng tab; lọc danh sách `TABS` theo `canSeeTab`; nếu tab đang active bị mất quyền → quay về menu. Gài lại các nút thao tác trong từng tab component (StockSummary, DKSX, OrderProposal, Catalog/BOM, Inventory, WipStock, ImportStock, ProductionOrder, SaveExport, PrintQueue).
- **Công Việc (`TaskApp.jsx`):** đổi `hasPerm(me,'view_dashboard'/'view_tasks')` sang `canSeeTab`; các nút create/edit/delete việc đọc `useTabPerm('tasks','tasks')`.
- **Bảo Hành (`WarrantyApp.jsx`):** lọc 3 tab theo `canSeeTab`; gài nút trong WarrantyDataManager / BatchAnalytics.
- **CSKH (`CskhApp.jsx`):** thay `canViewKpi` bằng `canSeeTab('cskh','zalo_kpi')`; gài nút trong ZaloKpiTab / ZaloReportTab.
- **Chất Lượng (`QualityApp.jsx`):** `useTabPerm('quality','main')`.
- **Sản Xuất / Tổng Quan:** gate vào module + tab `main`.
- **Menu phân hệ (HomePage):** mỗi ô phân hệ chỉ hiện khi `canSeeModule(user, module)`.

## 7. Mặc định cho nhân viên mới

`DEFAULT_PERMS_AGENT` mới: chỉ bật `tab.tasks.tasks.view` (+ `tab.tasks.tasks` các cap tối thiểu hiện có như `change_status`/`add_update` map sang `edit`). Mọi tab khác = tắt → nhân viên mới chỉ thấy "Công việc", đúng ý "không thấy phần không liên quan". Admin tự cấp thêm.

## 8. Lộ trình triển khai (mỗi bước chạy & kiểm thử được)

1. **Khung dùng chung:** `permRegistry.js` (registry + helper + `migrateLegacyToTabPerms`) + hook `useTabPerm`/`canSeeTab`/`canSeeModule` trong AuthContext. Chưa đổi UI, chưa gãy gì.
2. **UI ma trận** trong modal nhân viên + prefill bằng hàm đồng bộ quyền cũ.
3. **Kho** — áp `useTabPerm` + lọc tab + gài nút. Kiểm thử preview.
4. **Công Việc.**
5. **Bảo Hành + CSKH.**
6. **Chất Lượng + Sản Xuất + Tổng Quan.**
7. Cập nhật memory (`qlsx-kho-quality-permissions` → mô hình mới).

## 9. Kiểm thử (preview, theo `qlsx-preview-verification`)
- Tạo/sửa 1 nhân viên test với vài quyền tab hạn chế → đăng nhập tài khoản đó → xác nhận: chỉ thấy đúng tab được cấp; nút thao tác đúng cap; phân hệ không có tab view nào thì ẩn hẳn.
- Nhân viên cũ (có `access_warehouse`+`kho_edit`) sau khi đồng bộ → vẫn thấy/làm như trước.
- Admin → thấy & làm mọi thứ.

## 10. Rủi ro
- **Sót gate:** một số nút commit nằm sâu trong modal có thể bị quên — checklist theo từng tab khi gài.
- **Chỉ chặn client** (mục 2) — chấp nhận, giống hiện trạng.
- **Lệch registry vs code thật:** nếu thêm tab mới mà quên cập nhật registry → tab không xuất hiện trong bảng phân quyền. Ghi chú: registry là nơi khai báo bắt buộc khi thêm tab.
