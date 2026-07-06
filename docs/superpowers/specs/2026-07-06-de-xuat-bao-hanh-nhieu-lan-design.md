# Thiết kế: Phiếu đề xuất bảo hành NHIỀU LẦN (có lịch sử)

**Ngày:** 2026-07-06
**Phân hệ:** Bảo Hành → tab **Xử Lý Phiếu** (`src/pages/warranty/WarrantyProcessing.jsx`)
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan.
**Liên quan:** mở rộng feature [2026-07-06-phieu-de-xuat-bao-hanh](2026-07-06-phieu-de-xuat-bao-hanh-design.md); mô phỏng pattern "Form khai báo nhiều lần" ([2026-06-29-xu-ly-phieu-nhieu-lan](2026-06-29-xu-ly-phieu-nhieu-lan-design.md)).

## 1. Mục tiêu

Biến chức năng "Đề xuất bảo hành" (hiện là nút in/tải một-lần, không lưu) thành hệ thống **nhiều lần có lịch sử**, giống cột "Form khai báo":

- Lưu lịch sử **Lần 1, Lần 2...** cho mỗi phiếu.
- Mỗi lần là **snapshot** nội dung phiếu tại thời điểm tạo.
- **Sửa** nội dung 1 lần rồi **in/tải lại**.
- **Hủy** lần (soft-delete, không xóa).

## 2. Quyết định đã chốt (brainstorm)

1. **"Gửi/gửi lại" = nội bộ**: KHÔNG gửi ra ngoài (không email/n8n). Mỗi lần chỉ **lưu lịch sử + In/PDF/Tải Excel lại**. Không theo dõi trạng thái gửi.
2. **Tạo lần = chủ động** bấm "+ Thêm lần" (giống khai báo) — chốt snapshot lúc đó. KHÔNG tự tạo lần mỗi khi in.
3. **Giao diện = ô nhiều-lần** trong cột "Đề xuất BH" (thay nút đơn hiện tại), giống cột "Form khai báo".
4. **Hàng loạt**: nút "Đề xuất BH (N)" → tạo 1 lần trên **mỗi** phiếu đã tick (có lưu lịch sử) rồi in gộp.
5. **Quyền**: Thêm/Sửa/Hủy lần = `perm.edit` (ghi DB); In/Tải = `perm.view`.

## 3. Dữ liệu

### 3.1 Cột mới
- Thêm cột **`các_lần_đề_xuất` jsonb** (default `'[]'`) trên bảng `xu_ly_phieu_bao_hanh`, song song `các_lần` (khai báo).
- **Cần chạy SQL tay** (giống các feature trước): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "các_lần_đề_xuất" jsonb DEFAULT '[]'::jsonb;`

### 3.2 Cấu trúc 1 lần
```
{
  "lần": 1,                         // số thứ tự (max+1)
  "thời_điểm_tạo": "2026-07-06T...",// ISO, chốt lúc + Thêm lần
  "người_tạo": "Nguyễn Bá Ngọc",    // user đăng nhập lúc tạo
  "đã_hủy": false,                  // soft-delete
  "dữ_liệu": {                      // snapshot nội dung phiếu (editable per-lần)
    "maPhieu": "229545",
    "khachHang": "...", "sdt": "...", "diaChi": "...",
    "maDonHang": "...", "ngayLap": "18/06/2026",
    "maSP": "WT-4200-RO", "tinhTrang": "...",
    "linhKienList": ["Vòi lạnh # V-IS-WT4200-C"],
    "nguoiPhuTrach": "Nguyễn Bá Ngọc",
    "ngayText": "Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam"
  }
}
```
`dữ_liệu` = **đúng object trả về từ `mapRowToProposal(row, user, now)`** (đã có sẵn). Snapshot đóng băng tại thời điểm tạo; sửa lần chỉ đổi `dữ_liệu` của riêng lần đó, KHÔNG đụng dữ liệu gốc phiếu, KHÔNG đụng lần khác.

## 4. Data-model helpers (`src/lib/warrantyProposalLan.js` — MỚI, testable)

- `getEffectiveProposalLan(row)` → mảng `các_lần_đề_xuất` (đảm bảo mỗi lần có `lần`; không có → `[]`). Không cần migration (dữ liệu mới hoàn toàn).
- `nextProposalLanNo(lans)` → `max(lần)+1` (bỏ qua khi mảng rỗng → 1).
- `buildProposalSnapshot(row, currentUser, now)` → `{ lần?, thời_điểm_tạo, người_tạo, đã_hủy:false, dữ_liệu: mapRowToProposal(row, currentUser, now) }` (chưa gán số lần — caller gán).
- (Đơn vị thuần, test bằng Vitest: đánh số lần, snapshot đủ khóa, getEffective trả [] khi rỗng.)

## 5. Giao diện (`src/pages/warranty/WarrantyProposalLanCell.jsx` — MỚI)

Mô phỏng `KhaiBaoCell` + `LanCard` (đang inline trong WarrantyProcessing.jsx) nhưng tách file riêng để không phình file chính.

### 5.1 `ProposalLanCell`
- Hàng ngang các thẻ lần (`getEffectiveProposalLan(row)`) + thẻ **"+ Thêm lần"** (nếu `perm.edit`).
- Rỗng & không có quyền sửa → hiển thị "—".

### 5.2 `ProposalLanCard` (1 lần)
- Thẻ: "Lần N · dd/mm/yyyy" + người tạo; lần đã hủy → mờ + gạch ngang + nhãn "Đã Hủy".
- Bấm thẻ → **popover** (position:fixed, không bị cắt — theo [[qlsx-modal-dropdown-clipping]]) gồm:
  - Các ô **Sửa** `dữ_liệu` (text): Bên nhận BH, SĐT, Địa chỉ, Mã đơn hàng, Ngày lắp, Sản phẩm (mã SP), Tình trạng, Linh kiện (nhập ngăn bởi dấu phẩy → tách list), Người phụ trách. (chỉ sửa khi `perm.edit`).
  - Nút: **[Lưu]** (perm.edit) · **[In / Tạo PDF]** (perm.view) · **[Tải Excel]** (perm.view) · **[Hủy lần]/[Bỏ hủy]** (perm.edit) · **[Đóng]**.

## 6. Hành vi & actions (trong `WarrantyProcessing.jsx`, mô phỏng persistLans/addLan/saveLan/cancelLan)

- `persistProposalLans(row, newLans)`: cập nhật lạc quan `rows` + `taskDb.update({ 'các_lần_đề_xuất': newLans, 'người_cập_nhật': operator })`.
- `addProposalLan(row)`: `lans = getEffectiveProposalLan(row)`; `snap = buildProposalSnapshot(row, user, new Date())`; gán `lần = nextProposalLanNo(lans)`; `persistProposalLans(row, [...lans, snap])`.
- `saveProposalLan(row, lan, draft)`: cập nhật `dữ_liệu` của lần đó (merge draft; `linhKienList` tách từ text) → persist.
- `cancelProposalLan(row, lan, huy)`: set `đã_hủy=!!huy` (confirm khi hủy) → persist.
- **In**: set state `printingProposals = [lan.dữ_liệu]` → vùng `#wproc-print` render `WarrantyProposalPrint p={dữ_liệu}` → `window.print()`.
- **Tải Excel**: `downloadProposals([lan.dữ_liệu])` (xem §7).

## 7. Tái dùng In / Excel (sửa nhẹ)

- **In**: vùng `#wproc-print` hiện đang map `proposalRows` sống → đổi sang render **mảng snapshot `dữ_liệu`** trực tiếp (`WarrantyProposalPrint p={snap}`). Không cần map lại.
- **Excel** (`src/lib/warrantyProposalExcel.js`): thêm hàm **`downloadProposals(proposals, now?)`** = fetch mẫu → `buildProposalWorkbook(buf, proposals)` → `saveAs`. (Tách phần dựng workbook đã có; `downloadProposalExcel(rows,...)` cũ có thể giữ hoặc chuyển sang gọi `downloadProposals(rows.map(mapRowToProposal))` để DRY.)

## 8. Hàng loạt

Nút "Đề xuất BH (N)":
1. Với mỗi phiếu đã tick: tạo snapshot lần mới, append vào `các_lần_đề_xuất` của phiếu đó, persist (tuần tự hoặc gộp update).
2. Thu thập N snapshot vừa tạo → mở `WarrantyProposalModal` (tái dùng) liệt kê + **[In gộp] / [Tải Excel gộp]** (dùng `printingProposals` = N snapshot / `downloadProposals(N snapshot)`).

## 9. Tệp thay đổi (dự kiến)

- **MỚI** `src/lib/warrantyProposalLan.js` + test `src/lib/warrantyProposalLan.test.js`.
- **MỚI** `src/pages/warranty/WarrantyProposalLanCell.jsx`.
- **SỬA** `src/pages/warranty/WarrantyProcessing.jsx`: đổi cột `de_xuat_bh` sang `ProposalLanCell`; thêm actions; đổi vùng in sang snapshot; đổi hàng loạt.
- **SỬA** `src/lib/warrantyProposalExcel.js`: thêm `downloadProposals`.
- **MỚI** `sql/add_cac_lan_de_xuat.sql`: ALTER TABLE.
- (Có thể tái dùng `WarrantyProposalModal` cho hàng loạt; giữ `WarrantyProposalPrint` nguyên.)

## 10. Kiểm thử

- Vitest cho `warrantyProposalLan.js`: đánh số lần (rỗng→1, có→max+1), `buildProposalSnapshot` đủ khóa `dữ_liệu` + `đã_hủy:false`, `getEffectiveProposalLan` trả [] khi thiếu.
- UI (cell/card/popover) verify bằng preview (mount qua module graph như feature trước — không có unit test component, đúng chuẩn repo).
- Excel `downloadProposals`: test `buildProposalWorkbook` với mảng snapshot (đã có test buildProposalWorkbook; thêm 1 ca từ `dữ_liệu`).

## 11. Ngoài phạm vi (YAGNI)

- Không gửi ra ngoài (email/n8n), không trạng thái gửi.
- Không lưu file đã in.
- Không tự tạo lần khi in (chỉ tạo qua "+ Thêm lần").
- Không đụng luồng đồng bộ Caresoft.
