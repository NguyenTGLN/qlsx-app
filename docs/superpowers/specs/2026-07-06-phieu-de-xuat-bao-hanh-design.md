# Thiết kế: Tạo & in Phiếu đề xuất bảo hành

**Ngày:** 2026-07-06
**Phân hệ:** Bảo Hành → tab **Xử Lý Phiếu** (`src/pages/warranty/WarrantyProcessing.jsx`)
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan.

## 1. Mục tiêu

Cho phép người dùng, từ danh sách phiếu xử lý bảo hành, **tạo Phiếu đề nghị sửa chữa bảo hành sản phẩm** ("PHIẾU ĐỀ NGHỊ SỬA CHỮA BẢO HÀNH SẢN PHẨM" — theo mẫu `Mẫu đề xuất bảo hành.xlsx`) và:

- **In trực tiếp** hoặc **tạo PDF** (qua hộp thoại in trình duyệt).
- **Tải file Excel** theo đúng layout mẫu.

Nội dung phiếu lấy từ **dữ liệu của dòng phiếu tại thời điểm bấm tạo** (snapshot, không lưu lịch sử vào DB).

Hỗ trợ **1 phiếu** (nút trên mỗi dòng) và **hàng loạt** (tick nhiều dòng → 1 lần tạo nhiều phiếu).

## 2. Quyết định đã chốt (từ brainstorm)

1. **PDF/In**: dùng **hộp thoại in trình duyệt** — tái sử dụng pattern in phiếu XK/NK (`#print-area` + `@media print` + `window.print()`). 1 nút "In / Tạo PDF"; người dùng chọn máy in hoặc "Save as PDF". Font tiếng Việt chuẩn 100%, không cần thư viện sinh PDF.
2. **Excel**: **điền vào đúng file mẫu**, giữ nguyên format (khung, ô gộp, chữ ký). → Dùng **ExcelJS** (SheetJS `xlsx@0.18.5` community **không** ghi được style — đã kiểm chứng round-trip: chỉ giữ merges/col widths, mất borders/fonts/alignment).
3. **Ký "Phụ trách đơn"**: điền **tên người đang đăng nhập**. "Giám Đốc Kỹ Thuật" giữ "Đỗ Hương Nguyên" theo mẫu.
4. **Các ô không suy được từ dữ liệu** (checkbox §2/§3/§4, cột Được/Không được BH): **để trống** cho ký/tick tay.
5. **Không** lưu lịch sử đề xuất vào DB (YAGNI — người dùng không yêu cầu).
6. **Nhiều linh kiện §3**: **mỗi linh kiện 1 dòng** (chèn dòng vào bảng linh kiện, dịch layout §4/chữ ký + cập nhật merges).
7. **Excel nhiều phiếu**: **mỗi phiếu 1 sheet**, gộp nhiều sheet trong **1 file**.
8. **`exceljs`**: đã đồng ý cài thêm.

## 3. Điểm vào UI

### 3.1 Nút trên mỗi dòng
- Thêm 1 cột thao tác (hoặc nút gọn trong cột sẵn có) **"Đề xuất BH"** ở mỗi dòng.
- Bấm nút → `e.stopPropagation()` (không mở `ProcessingModal` xử lý) → mở **modal xem trước phiếu đề xuất** cho đúng dòng đó.

### 3.2 Hàng loạt
- Tái dùng cơ chế tick sẵn có: `selectedIds` (Set các `id`), giữ qua các trang.
- Thêm nút **"Đề xuất BH (N)"** trên thanh công cụ, cạnh nút "Tải Excel". Bật khi `selectedIds.size > 0`.
- Bấm → modal xem trước **nhiều phiếu** (mỗi phiếu 1 trang, ngắt trang giữa các phiếu).

### 3.3 Phân quyền
- Mở cho người có quyền **xem** tab (`useTabPerm('warranty','xuLy').view`) — đây là thao tác in/xuất chỉ đọc, không sửa dữ liệu, không đẩy Caresoft.

## 4. Modal xem trước (`WarrantyProposalModal.jsx`)

- Nhận `rows` (mảng 1 hoặc nhiều dòng phiếu) + `currentUser`.
- Render danh sách phiếu bằng component `WarrantyProposalPrint` (xem §5) trong vùng cuộn để người dùng kiểm tra nội dung trước khi in/tải.
- 2 nút hành động:
  - **[In / Tạo PDF]** → gọi luồng in (`#print-area` + `window.print()`).
  - **[Tải Excel]** → gọi `warrantyProposalExcel(rows, currentUser)` (ExcelJS) rồi tải file.
- Nút **[Đóng]**.

## 5. Component in HTML (`WarrantyProposalPrint.jsx`)

- Chỉ render nội dung 1 phiếu theo layout mẫu; host lo hiện/ẩn khi in (giống `WarehouseReceiptPrint.jsx`).
- Props: `{ row, currentUser }` (hoặc các trường đã map sẵn).
- Khổ A4 **dọc**, `font-family: Times New Roman`. Có:
  - Tiêu đề "PHIẾU ĐỀ NGHỊ SỬA CHỮA BẢO HÀNH SẢN PHẨM".
  - Dòng "Hôm nay, ngày … tháng … năm … tại TTBH công ty TNHH Euromade Việt Nam".
  - Khối thông tin: Bên nhận bảo hành / SĐT / Địa chỉ / Mã đơn hàng / Ngày giao (Lắp đặt).
  - §1 bảng Hàng hoá bảo hành (TT, Sản phẩm, ĐVT, Số lượng, Ghi chú/Tình trạng).
  - §2 Hoạt động kiểm tra: checkbox "Đã kiểm tra" (ô trống).
  - §3 Tình trạng lỗi: checkbox "Không lỗi"/"Có lỗi" (trống) + bảng linh kiện (TT, Mã Linh kiện, Số lượng, Được bảo hành, Không được bảo hành).
  - §4 Thu hồi linh kiện: checkbox "Có thu hồi"/"Không thu hồi" (trống).
  - Chữ ký: "Phụ trách đơn" (tên user) / "Giám Đốc Kỹ Thuật" (Đỗ Hương Nguyên).

Luồng in trong `WarrantyProcessing`:
- Giữ 1 state `printingRows`. Khi bấm In: set `printingRows` → render `#print-area` ẩn → `setTimeout(() => window.print())` (đợi DOM cập nhật) — y hệt `PrintQueueTab`.
- CSS `@media print { @page { size: A4 portrait; margin: … } body * { visibility:hidden } #print-area,* { visible } }`.
- Mỗi phiếu bọc trong div có `pageBreakAfter: 'always'` trừ phiếu cuối.

## 6. Helper Excel (`warrantyProposalExcel.js`)

- Hàm `async buildWarrantyProposalWorkbook(rows, currentUser)`:
  1. `fetch('/mau-de-xuat-bao-hanh.xlsx')` → `arrayBuffer`.
  2. ExcelJS `new Workbook().xlsx.load(buf)`.
  3. Lấy sheet mẫu `Phieu_gui_LKBH` làm khuôn.
  4. Với mỗi row:
     - Nếu là phiếu đầu: ghi thẳng vào sheet mẫu; phiếu tiếp theo: **clone sheet** (`workbook.addWorksheet` + copy cell/style/merge) hoặc dùng cách nhân bản đơn giản (xem lưu ý §8). Đặt tên sheet theo mã phiếu (cắt ≤31 ký tự, bỏ ký tự cấm).
     - Ghi giá trị vào **đúng địa chỉ ô** (map theo §7). Giữ nguyên style ô sẵn có (ExcelJS giữ style khi chỉ đổi `.value`).
     - §3 nếu có nhiều linh kiện: chèn thêm dòng (copy style dòng mẫu 26), dịch các block/merge phía dưới.
  5. `workbook.xlsx.writeBuffer()` → `saveAs(blob, 'PhieuDeXuatBH_<...>.xlsx')` (file-saver).

## 7. Ánh xạ dữ liệu → ô mẫu

Địa chỉ ô theo mẫu hiện tại (sheet `Phieu_gui_LKBH`, ref `A1:J39`):

| Nội dung | Ô mẫu | Nguồn dữ liệu (row `r`) |
|---|---|---|
| Ngày (dòng 2) | A2 (chuỗi) | ngày hiện tại → "Hôm nay, ngày dd tháng mm năm yyyy tại TTBH…" |
| Bên nhận bảo hành | (ô kề nhãn dòng 4) | `tenKhachHang(r)` |
| Số điện thoại | dòng 5 | `r['số_điện_thoại_khách_hàng']` |
| Địa chỉ | dòng 6 | `r['địa_chỉ_nhận_hàng']` (fallback `phiếu_gốc_json`) |
| Mã đơn hàng | dòng 8 | `r['mã_đơn_hàng']` |
| Ngày giao (Lắp đặt) | dòng 9 | `fmtDateOnly(r['ngày_lắp_đặt'])` |
| §1 Sản phẩm (dòng 14) | B14 | `r['mã_sản_phẩm']` |
| §1 ĐVT | C14 | "Cái" |
| §1 Số lượng | D14 | 1 |
| §1 Ghi chú (Tình trạng) | E14 | `r['tình_trạng']` \|\| `r['chi_tiết_lỗi']` |
| §3 Mã Linh kiện (dòng 26+) | B26… | tách `r['linh_kiện']` theo dấu phẩy → mỗi phần 1 dòng |
| §3 Số lượng | C26… | 1 mỗi dòng |
| Ký "Phụ trách đơn" (dòng 39, cột A) | A39 | `currentUser.name \|\| currentUser.id` |
| Ký "Giám Đốc Kỹ Thuật" (dòng 39, cột E) | E39 | "Đỗ Hương Nguyên" (giữ mẫu) |

> Lưu ý: địa chỉ ô "phần điền" (bên phải nhãn) sẽ được xác định chính xác khi đọc lại mẫu bằng ExcelJS lúc code (nhãn ở cột A, giá trị điền vào cột kế). Bảng map trên là mốc; code sẽ dò theo nhãn để chắc chắn.

Hàm map dùng chung cho cả HTML in và Excel (một `mapRowToProposal(r, currentUser)` trả object các trường) để tránh lệch nội dung giữa 2 đường xuất.

## 8. Lưu ý kỹ thuật & rủi ro

- **Tên file mẫu có dấu**: copy sang `public/mau-de-xuat-bao-hanh.xlsx` (ASCII) để `fetch` không vướng URL-encode.
- **Clone sheet trong ExcelJS (mỗi phiếu 1 sheet, 1 file)**: ExcelJS không có API clone sheet 1 dòng gọn; sẽ copy thủ công (giá trị + style + merges + column widths + row heights) từ sheet mẫu sang sheet mới cho từng phiếu. Tên sheet = mã phiếu (cắt ≤31 ký tự, bỏ ký tự cấm `[]:*?/\`, chống trùng bằng hậu tố). **Chốt: nhiều sheet trong 1 file** (không dùng zip nhiều file).
- **Chèn dòng linh kiện (§3) — mỗi linh kiện 1 dòng (đã chốt)**: khi >1 linh kiện, chèn thêm dòng vào bảng linh kiện (copy style dòng mẫu 26). Việc này làm **dịch chỉ số** các block §4/chữ ký bên dưới → phải **cập nhật lại `!merges`/merge ranges** cho phần dịch. Thứ tự an toàn: xử lý phần dưới trước, hoặc dùng `worksheet.spliceRows`/`insertRow` của ExcelJS (tự dịch merges) rồi set style. Cần test kỹ với 0, 1, và ≥2 linh kiện.
- **Dependency mới `exceljs`**: cần `npm install exceljs`, tăng kích thước bundle (~1MB). Sau khi code xong phải `npm run build` + copy `dist` → `deploy-netlify` theo quy trình deploy hiện hành.
- **Trường dữ liệu**: `địa_chỉ_nhận_hàng`, `tình_trạng` có thể nằm ở cột mirror, `thông_tin_bổ_sung`, hoặc `phiếu_gốc_json` — helper map cần fallback nhiều nguồn (giống `tenKhachHang`).

## 9. Tệp thay đổi (dự kiến)

- `src/pages/warranty/WarrantyProcessing.jsx` — thêm nút/cột, state modal + in, nút hàng loạt.
- `src/components/WarrantyProposalPrint.jsx` — **mới**, render HTML phiếu.
- `src/pages/warranty/WarrantyProposalModal.jsx` — **mới**, modal xem trước + 2 nút.
- `src/lib/warrantyProposalExcel.js` — **mới**, ExcelJS fill mẫu.
- `src/lib/warrantyProposalMap.js` — **mới**, `mapRowToProposal` dùng chung.
- `public/mau-de-xuat-bao-hanh.xlsx` — **mới**, copy từ mẫu.
- `package.json` — thêm `exceljs`.

## 10. Ngoài phạm vi (YAGNI)

- Không lưu lịch sử/bản ghi đề xuất vào DB.
- Không sinh PDF bằng thư viện riêng (dùng hộp thoại in).
- Không tự tick các checkbox suy đoán.
- Không sửa mẫu Caresoft / không đẩy dữ liệu ngược về Caresoft.
