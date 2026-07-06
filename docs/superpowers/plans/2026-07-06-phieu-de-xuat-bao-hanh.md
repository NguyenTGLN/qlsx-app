# Phiếu Đề Xuất Bảo Hành — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm chức năng tạo & in "Phiếu đề nghị sửa chữa bảo hành sản phẩm" từ tab Xử Lý Phiếu — mỗi dòng một nút, chọn nhiều dòng để tạo hàng loạt; xuất In/PDF (hộp thoại in) hoặc tải Excel theo đúng file mẫu.

**Architecture:** Một hàm map thuần (`mapRowToProposal`) biến 1 dòng phiếu thành object nội dung phiếu (dùng chung cho cả in HTML lẫn Excel để không lệch nội dung). Đường **In/PDF** tái dùng pattern `#print-area` + `@media print` + `window.print()` của phiếu XK/NK. Đường **Excel** dùng ExcelJS nạp file mẫu trong `public/`, dựng mỗi phiếu 1 sheet (copy nguyên style/merge từ sheet mẫu, chèn dòng cho từng linh kiện), tải bằng file-saver.

**Tech Stack:** React 19, `exceljs@4.4.0` (mới cài), `file-saver` (có sẵn), `xlsx` (không đụng), Vitest (env node — test chạy được cả ExcelJS lẫn đọc file mẫu từ đĩa).

---

## Bối cảnh cho người thực thi (đọc trước khi làm)

- **Tab đích:** `src/pages/warranty/WarrantyProcessing.jsx`. Đã có sẵn: chọn nhiều dòng bằng `selectedIds` (Set các `id`, giữ qua các trang), `filtered` (mảng dòng đã lọc), `exportToExcel()` (nút Tải Excel hiện có), `useAuth()` cho `user`, `useTabPerm('warranty','xuLy')` cho `perm`.
- **Pattern in đã chạy tốt:** xem `src/pages/kho/PrintQueueTab.jsx` (khối `<style>{@media print}` + `<div id="print-area">` + `setTimeout(() => window.print())`) và `src/components/WarehouseReceiptPrint.jsx` (component thuần render nội dung phiếu). Ta làm tương tự nhưng dùng id **`wproc-print`** để không trùng.
- **File mẫu:** `Mẫu đề xuất bảo hành.xlsx` ở gốc dự án. Sheet `Phieu_gui_LKBH`, vùng `A1:E39`. Cấu trúc ô (đã xác minh bằng ExcelJS):

  | Ô | Nội dung mẫu | Ghi vào |
  |---|---|---|
  | A1 (merge A1:E1) | Tiêu đề | giữ nguyên |
  | A2 | **Công thức** `CONCATENATE("Hôm nay, ngày ",DAY(TODAY())…)` | **ghi đè** bằng chuỗi ngày tạo (tĩnh) |
  | A4 | `Bên nhận bảo hành` (nhãn tràn sang B–E vì cột A hẹp) | ghi `"{nhãn}: {tên KH}"` |
  | A5 | `Số điện thoại` | ghi `"{nhãn}: {sđt}"` |
  | A6 | `Địa chỉ` | ghi `"{nhãn}: {địa chỉ}"` |
  | A8 | `Mã đơn hàng` | ghi `"{nhãn}: {mã ĐH}"` |
  | A9 | `Ngày giao hàng (Lắp đặt)` | ghi `"{nhãn}: {ngày lắp}"` |
  | Row 13 | Header §1: A=TT B=Sản phẩm C=ĐVT D=Số lượng E=Ghi chú (Tình trạng) | giữ |
  | Row 14 | A=1, C="Cái", D=1 | ghi **B14**=mã SP, **E14**=tình trạng |
  | Row 18 | B="Đã kiểm tra" | để trống (tick tay) |
  | Row 22/23 | "Không lỗi"/"Có lỗi" | để trống (tick tay) |
  | Row 25 | Header §3: A=TT B=Mã Linh kiện C=Số lượng D=Được bảo hành E=Không được bảo hành | giữ |
  | Row 26 | A=1, C=1, E=false (dòng linh kiện mẫu — **dòng để nhân bản**) | mỗi linh kiện 1 dòng: A=STT, B=mã LK, C=1, D/E để trống |
  | Row 30/32 | "Có/Không thu hồi linh kiện" | để trống (tick tay) |
  | Row 34 (merge A34:B34) | A="Phụ trách đơn", E="Giám Đốc Kỹ Thuật" | giữ nhãn |
  | Row 39 (merge A39:B39) | E="Đỗ Hương Nguyên" | ghi **A39**=người đăng nhập; E giữ |

  Cột rộng (A..F): `[3.85, 34.4, 20.3, 20.3, 38.4, 9]`. Merges gốc: `A1:E1`, `A34:B34`, `A39:B39`.
- **Chèn dòng linh kiện:** khi có `K` linh kiện (K≥1), phần §4 + chữ ký (row 27→39) **dịch xuống `extra = K-1` dòng**; hai merge chữ ký phải merge lại ở vị trí mới. Ta **không** dùng `duplicateRow`/`spliceRows` (dịch merge không tin cậy) mà **dựng sheet mới bằng cách copy từng dòng từ sheet mẫu với offset tính sẵn** → xác định (deterministic), test được.
- **Deploy:** theo memory dự án, sau khi sửa code phải `npm run build` rồi copy `dist` → `deploy-netlify/` (bundle kéo-thả). Làm ở Task 8.

---

## Task 1: Setup — copy file mẫu vào public/, xác nhận exceljs

**Files:**
- Create: `public/mau-de-xuat-bao-hanh.xlsx` (copy từ file mẫu gốc)

- [ ] **Step 1: Copy file mẫu sang public/ (tên ASCII để fetch không vướng URL-encode)**

Run (git-bash):
```bash
cp "Mẫu đề xuất bảo hành.xlsx" public/mau-de-xuat-bao-hanh.xlsx
```

- [ ] **Step 2: Xác nhận file tồn tại + exceljs đã cài**

Run:
```bash
ls -la public/mau-de-xuat-bao-hanh.xlsx && node -e "console.log('exceljs', require('exceljs/package.json').version)"
```
Expected: liệt kê file (~20KB) và in `exceljs 4.4.0`.

- [ ] **Step 3: Commit**

```bash
git add public/mau-de-xuat-bao-hanh.xlsx package.json package-lock.json
git commit -m "chore(bao-hanh): thêm file mẫu đề xuất BH vào public + dep exceljs"
```

---

## Task 2: Hàm map thuần `mapRowToProposal` (+ test)

Biến 1 dòng phiếu → object nội dung phiếu, có fallback nhiều nguồn (mirror → `phiếu_gốc_json`), tách linh kiện theo dấu phẩy/xuống dòng, format ngày dd/mm/yyyy, dựng câu ngày tạo. `now` truyền vào được để test cố định thời gian.

**Files:**
- Create: `src/lib/warrantyProposalMap.js`
- Test: `src/lib/warrantyProposalMap.test.js`

- [ ] **Step 1: Viết test trước**

```js
// src/lib/warrantyProposalMap.test.js
import { test, expect, describe } from 'vitest';
import { mapRowToProposal, fmtNgay } from './warrantyProposalMap';

const NOW = new Date('2026-07-06T10:00:00');

describe('fmtNgay', () => {
  test('ISO -> dd/mm/yyyy', () => expect(fmtNgay('2026-01-09')).toBe('09/01/2026'));
  test('có giờ vẫn ra ngày', () => expect(fmtNgay('2026-01-09T08:30:00')).toBe('09/01/2026'));
  test('rỗng -> chuỗi rỗng', () => expect(fmtNgay('')).toBe(''));
});

describe('mapRowToProposal', () => {
  const row = {
    'phiếu_ghi': 'PBH-001', 'id_phiếu_ghi': 111,
    'số_điện_thoại_khách_hàng': '0909123456',
    'địa_chỉ_nhận_hàng': '12 Lê Lợi, Q1',
    'mã_đơn_hàng': 'DH-77', 'ngày_lắp_đặt': '2026-01-09',
    'mã_sản_phẩm': 'RO-9', 'tình_trạng': 'Máy không lên nguồn',
    'linh_kiện': 'Bơm, Van điện từ , Adapter',
    'phiếu_gốc_json': { 'tên_người_yêu_cầu': 'Nguyễn Văn A' },
  };

  test('map đủ trường + ký người đăng nhập', () => {
    const p = mapRowToProposal(row, { name: 'Trần Kỹ Thuật' }, NOW);
    expect(p.maPhieu).toBe('PBH-001');
    expect(p.khachHang).toBe('Nguyễn Văn A');
    expect(p.sdt).toBe('0909123456');
    expect(p.diaChi).toBe('12 Lê Lợi, Q1');
    expect(p.maDonHang).toBe('DH-77');
    expect(p.ngayLap).toBe('09/01/2026');
    expect(p.maSP).toBe('RO-9');
    expect(p.tinhTrang).toBe('Máy không lên nguồn');
    expect(p.nguoiPhuTrach).toBe('Trần Kỹ Thuật');
    expect(p.ngayText).toBe('Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam');
  });

  test('tách linh kiện theo dấu phẩy, bỏ khoảng trắng thừa/rỗng', () => {
    const p = mapRowToProposal(row, {}, NOW);
    expect(p.linhKienList).toEqual(['Bơm', 'Van điện từ', 'Adapter']);
  });

  test('tình trạng fallback sang chi_tiết_lỗi khi thiếu', () => {
    const p = mapRowToProposal({ ...row, 'tình_trạng': '', 'chi_tiết_lỗi': 'Rò nước' }, {}, NOW);
    expect(p.tinhTrang).toBe('Rò nước');
  });

  test('khách hàng fallback: cột mirror trước, rồi phiếu_gốc_json', () => {
    const p = mapRowToProposal({ ...row, 'tên_khách_hàng': 'Lê Thị B' }, {}, NOW);
    expect(p.khachHang).toBe('Lê Thị B');
  });

  test('linh_kiện rỗng -> mảng rỗng', () => {
    const p = mapRowToProposal({ ...row, 'linh_kiện': '' }, {}, NOW);
    expect(p.linhKienList).toEqual([]);
  });

  test('user rỗng -> nguoiPhuTrach chuỗi rỗng', () => {
    const p = mapRowToProposal(row, null, NOW);
    expect(p.nguoiPhuTrach).toBe('');
  });
});
```

- [ ] **Step 2: Chạy test để thấy FAIL**

Run: `npx vitest run src/lib/warrantyProposalMap.test.js`
Expected: FAIL — `Failed to resolve import './warrantyProposalMap'`.

- [ ] **Step 3: Viết implementation tối thiểu**

```js
// src/lib/warrantyProposalMap.js
// Biến 1 dòng "xu_ly_phieu_bao_hanh" thành nội dung Phiếu đề nghị sửa chữa bảo hành.
// Thuần, không phụ thuộc React — dùng chung cho cả bản in HTML lẫn Excel.

// Chuẩn hóa ngày về dd/mm/yyyy (nhận YYYY-MM-DD, ISO có giờ, hoặc Date). Không parse được -> ''.
export function fmtNgay(v) {
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const pick = (row, goc, keys) => {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    if (goc[k] != null && String(goc[k]).trim() !== '') return String(goc[k]).trim();
  }
  return '';
};

// Tách chuỗi linh kiện thành mảng: ngăn bởi dấu phẩy, chấm phẩy, hoặc xuống dòng.
const splitLinhKien = (s) => String(s || '')
  .split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

export function mapRowToProposal(row, currentUser, now = new Date()) {
  const r = row || {};
  const goc = r['phiếu_gốc_json'] || {};
  const nguoi = currentUser ? (currentUser.name || currentUser.id || '') : '';
  return {
    maPhieu: pick(r, goc, ['phiếu_ghi', 'id_phiếu_ghi']),
    khachHang: pick(r, goc, ['tên_người_yêu_cầu', 'tên_khách_hàng']),
    sdt: pick(r, goc, ['số_điện_thoại_khách_hàng']),
    diaChi: pick(r, goc, ['địa_chỉ_nhận_hàng']),
    maDonHang: pick(r, goc, ['mã_đơn_hàng']),
    ngayLap: fmtNgay(pick(r, goc, ['ngày_lắp_đặt'])),
    maSP: pick(r, goc, ['mã_sản_phẩm']),
    tinhTrang: pick(r, goc, ['tình_trạng', 'chi_tiết_lỗi']),
    linhKienList: splitLinhKien(pick(r, goc, ['linh_kiện'])),
    nguoiPhuTrach: String(nguoi || ''),
    ngayText: `Hôm nay, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()} tại TTBH công ty TNHH Euromade Việt Nam`,
  };
}
```

- [ ] **Step 4: Chạy test để PASS**

Run: `npx vitest run src/lib/warrantyProposalMap.test.js`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/warrantyProposalMap.js src/lib/warrantyProposalMap.test.js
git commit -m "feat(bao-hanh): map dòng phiếu -> nội dung phiếu đề xuất BH (+ test)"
```

---

## Task 3: Dựng workbook Excel theo mẫu `buildProposalWorkbook` + tải `downloadProposalExcel` (+ test)

**Files:**
- Create: `src/lib/warrantyProposalExcel.js`
- Test: `src/lib/warrantyProposalExcel.test.js`

- [ ] **Step 1: Viết test trước** (đọc file mẫu thật từ `public/`, dựng 2 phiếu — 1 linh kiện và 3 linh kiện — rồi ghi ra buffer, nạp lại và kiểm tra ô/merge/style)

```js
// src/lib/warrantyProposalExcel.test.js
import { test, expect, describe, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildProposalWorkbook } from './warrantyProposalExcel';

const NOW = new Date('2026-07-06T10:00:00');
const TEMPLATE = () => readFileSync('public/mau-de-xuat-bao-hanh.xlsx');

const P1 = {
  maPhieu: 'PBH-001', khachHang: 'Nguyễn Văn A', sdt: '0909', diaChi: '12 Lê Lợi',
  maDonHang: 'DH-77', ngayLap: '09/01/2026', maSP: 'RO-9', tinhTrang: 'Không lên nguồn',
  linhKienList: ['Bơm'], nguoiPhuTrach: 'Trần KTV',
  ngayText: 'Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam',
};
const P3 = {
  maPhieu: 'PBH-002', khachHang: 'Lê Thị B', sdt: '0911', diaChi: '3 Hai Bà Trưng',
  maDonHang: 'DH-88', ngayLap: '10/02/2026', maSP: 'RO-12', tinhTrang: 'Rò nước',
  linhKienList: ['Van', 'Màng RO', 'Adapter'], nguoiPhuTrach: 'Phạm KTV',
  ngayText: 'Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam',
};

describe('buildProposalWorkbook', () => {
  let wb;
  beforeAll(async () => {
    const built = await buildProposalWorkbook(TEMPLATE(), [P1, P3]);
    const buf = await built.xlsx.writeBuffer();
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
  });

  test('mỗi phiếu 1 sheet, tên sheet theo mã phiếu', () => {
    expect(wb.worksheets.length).toBe(2);
    expect(wb.worksheets[0].name).toContain('PBH-001');
    expect(wb.worksheets[1].name).toContain('PBH-002');
  });

  test('sheet 1: header ghép nhãn + giá trị, §1 điền đúng ô', () => {
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A2').value)).toContain('ngày 6 tháng 7 năm 2026'); // đã thay công thức
    expect(String(ws.getCell('A4').value)).toContain('Nguyễn Văn A');
    expect(String(ws.getCell('A5').value)).toContain('0909');
    expect(String(ws.getCell('A6').value)).toContain('12 Lê Lợi');
    expect(String(ws.getCell('A8').value)).toContain('DH-77');
    expect(String(ws.getCell('A9').value)).toContain('09/01/2026');
    expect(ws.getCell('B14').value).toBe('RO-9');
    expect(ws.getCell('E14').value).toBe('Không lên nguồn');
  });

  test('sheet 1 (1 linh kiện): 1 dòng linh kiện, chữ ký ở vị trí gốc (row 39)', () => {
    const ws = wb.worksheets[0];
    expect(ws.getCell('B26').value).toBe('Bơm');
    expect(ws.getCell('C26').value).toBe(1);
    expect(ws.getCell('A39').value).toBe('Trần KTV');           // Phụ trách đơn
    expect(ws.getCell('E39').value).toBe('Đỗ Hương Nguyên');    // giữ từ mẫu
  });

  test('sheet 2 (3 linh kiện): 3 dòng liên tiếp, khối chữ ký dịch xuống 2 dòng', () => {
    const ws = wb.worksheets[1];
    expect(ws.getCell('B26').value).toBe('Van');
    expect(ws.getCell('B27').value).toBe('Màng RO');
    expect(ws.getCell('B28').value).toBe('Adapter');
    expect(ws.getCell('A26').value).toBe(1);
    expect(ws.getCell('A28').value).toBe(3);
    // §4 + chữ ký dịch xuống extra = 2: row 34 -> 36, row 39 -> 41
    expect(ws.getCell('A41').value).toBe('Phạm KTV');
    expect(ws.getCell('E41').value).toBe('Đỗ Hương Nguyên');
  });

  test('giữ style: viền ô header §1 (A13) không mất sau khi ghi', () => {
    const ws = wb.worksheets[0];
    const b = ws.getCell('A13').border;
    expect(b && b.top && b.top.style).toBeTruthy();
  });

  test('giữ merge: tiêu đề A1:E1 và khối chữ ký được merge', () => {
    const ws2 = wb.worksheets[1];
    const merges = ws2.model.merges;
    expect(merges).toContain('A1:E1');
    expect(merges).toContain('A41:B41'); // A39:B39 dịch xuống 2
  });
});
```

- [ ] **Step 2: Chạy test để thấy FAIL**

Run: `npx vitest run src/lib/warrantyProposalExcel.test.js`
Expected: FAIL — `Failed to resolve import './warrantyProposalExcel'`.

- [ ] **Step 3: Viết implementation**

```js
// src/lib/warrantyProposalExcel.js
// Dựng file Excel "Phiếu đề nghị sửa chữa bảo hành" từ file mẫu, mỗi phiếu 1 sheet.
// Không dùng duplicateRow/spliceRows (dịch merge không ổn định) — dựng sheet mới bằng
// cách copy từng dòng từ sheet mẫu với offset tính sẵn cho phần dưới bảng linh kiện.
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { mapRowToProposal } from './warrantyProposalMap';

export const TEMPLATE_URL = '/mau-de-xuat-bao-hanh.xlsx';

// Chỉ số dòng theo mẫu (sheet Phieu_gui_LKBH, A1:E39).
const T = {
  date: 2, khach: 4, sdt: 5, diaChi: 6, maDH: 8, ngayLap: 9,
  sp: 14,            // §1 dòng sản phẩm
  lk: 26,            // §3 dòng linh kiện mẫu (dòng để nhân bản)
  sig1: 34,          // "Phụ trách đơn" (merge A34:B34)
  sigName: 39,       // dòng tên ký (merge A39:B39)
  last: 39, firstCol: 1, lastCol: 5,
};

// Tên sheet Excel: bỏ ký tự cấm [ ] : * ? / \, ≤31 ký tự, chống trùng bằng hậu tố.
function sheetName(name, used) {
  let s = String(name || 'Phiếu').replace(/[\[\]\*\?\/\\:]/g, ' ').trim().slice(0, 28) || 'Phiếu';
  const base = s; let i = 2;
  while (used.has(s)) s = `${base} (${i++})`.slice(0, 31);
  used.add(s);
  return s;
}

// Copy 1 dòng (giá trị + style + chiều cao) từ sheet nguồn sang sheet đích.
function copyRow(src, dst, srcRow, dstRow) {
  const s = src.getRow(srcRow), d = dst.getRow(dstRow);
  if (s.height != null) d.height = s.height;
  s.eachCell({ includeEmpty: true }, (cell, col) => {
    const dc = d.getCell(col);
    dc.value = cell.value;
    dc.style = cell.style; // ExcelJS: gán .style copy cả font/fill/border/alignment/numFmt
  });
  d.commit();
}

// Nhãn ở cột A của 1 dòng mẫu (bỏ dấu ":" cuối nếu có) — để ghép "{nhãn}: {giá trị}".
const labelOf = (tpl, row) => String(tpl.getRow(row).getCell(1).value || '').replace(/:\s*$/, '');

function buildSheet(wb, tpl, p, used) {
  const ws = wb.addWorksheet(sheetName(p.maPhieu, used), {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  // Cột rộng
  for (let c = T.firstCol; c <= T.lastCol; c++) {
    const w = tpl.getColumn(c).width;
    if (w != null) ws.getColumn(c).width = w;
  }
  const K = Math.max(1, p.linhKienList.length);
  const extra = K - 1;
  // 1) Row 1..T.lk (đến hết dòng linh kiện đầu) — copy nguyên
  for (let r = 1; r <= T.lk; r++) copyRow(tpl, ws, r, r);
  // 2) Dòng linh kiện thêm — nhân bản style từ dòng mẫu T.lk
  for (let k = 1; k <= extra; k++) copyRow(tpl, ws, T.lk, T.lk + k);
  // 3) Row dưới bảng linh kiện (T.lk+1 .. T.last) — dịch xuống extra
  for (let r = T.lk + 1; r <= T.last; r++) copyRow(tpl, ws, r, r + extra);
  // 4) Merge: tiêu đề + khối chữ ký (dịch theo extra)
  ws.mergeCells(1, 1, 1, T.lastCol);                          // A1:E1
  ws.mergeCells(T.sig1 + extra, 1, T.sig1 + extra, 2);        // A34:B34 (dịch)
  ws.mergeCells(T.sigName + extra, 1, T.sigName + extra, 2);  // A39:B39 (dịch)
  // 5) Điền giá trị
  ws.getRow(T.date).getCell(1).value = p.ngayText;           // ghi đè công thức TODAY()
  ws.getRow(T.khach).getCell(1).value = `${labelOf(tpl, T.khach)}: ${p.khachHang}`;
  ws.getRow(T.sdt).getCell(1).value = `${labelOf(tpl, T.sdt)}: ${p.sdt}`;
  ws.getRow(T.diaChi).getCell(1).value = `${labelOf(tpl, T.diaChi)}: ${p.diaChi}`;
  ws.getRow(T.maDH).getCell(1).value = `${labelOf(tpl, T.maDH)}: ${p.maDonHang}`;
  ws.getRow(T.ngayLap).getCell(1).value = `${labelOf(tpl, T.ngayLap)}: ${p.ngayLap}`;
  ws.getRow(T.sp).getCell(2).value = p.maSP;                 // B14
  ws.getRow(T.sp).getCell(5).value = p.tinhTrang;            // E14
  for (let k = 0; k < K; k++) {
    const row = ws.getRow(T.lk + k);
    row.getCell(1).value = k + 1;                            // TT
    row.getCell(2).value = p.linhKienList[k] || '';         // Mã Linh kiện
    row.getCell(3).value = 1;                               // Số lượng
    row.getCell(4).value = null;                            // Được BH (trống, tick tay)
    row.getCell(5).value = null;                            // Không được BH (trống)
    row.commit();
  }
  ws.getRow(T.sigName + extra).getCell(1).value = p.nguoiPhuTrach; // A39 (dịch) = Phụ trách đơn
  return ws;
}

// Thuần (không đụng DOM) — nhận buffer file mẫu + mảng proposal, trả ExcelJS workbook. Test được ở Node.
export async function buildProposalWorkbook(templateBuffer, proposals) {
  const src = new ExcelJS.Workbook();
  await src.xlsx.load(templateBuffer);
  const tpl = src.worksheets[0];
  const out = new ExcelJS.Workbook();
  const used = new Set();
  for (const p of proposals) buildSheet(out, tpl, p, used);
  return out;
}

// Dùng ở trình duyệt: fetch mẫu → map dòng → dựng workbook → tải file.
export async function downloadProposalExcel(rows, currentUser, now = new Date()) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu: HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const proposals = rows.map((r) => mapRowToProposal(r, currentUser, now));
  const wb = await buildProposalWorkbook(buf, proposals);
  const out = await wb.xlsx.writeBuffer();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fname = proposals.length === 1
    ? `PhieuDeXuatBH_${(proposals[0].maPhieu || 'phieu').replace(/[^\w-]/g, '_')}.xlsx`
    : `PhieuDeXuatBH_${proposals.length}phieu_${stamp}.xlsx`;
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
}
```

- [ ] **Step 4: Chạy test để PASS**

Run: `npx vitest run src/lib/warrantyProposalExcel.test.js`
Expected: PASS toàn bộ (gồm cả kiểm merge dịch `A41:B41` và viền A13).

- [ ] **Step 5: Commit**

```bash
git add src/lib/warrantyProposalExcel.js src/lib/warrantyProposalExcel.test.js
git commit -m "feat(bao-hanh): dựng Excel phiếu đề xuất BH theo mẫu bằng ExcelJS (+ test)"
```

---

## Task 4: Component in HTML `WarrantyProposalPrint`

Component thuần render nội dung 1 phiếu (nhận object `p` từ `mapRowToProposal`), khổ A4 dọc, font Times New Roman — dùng trong vùng `#wproc-print` để in/PDF.

**Files:**
- Create: `src/components/WarrantyProposalPrint.jsx`

- [ ] **Step 1: Viết component**

```jsx
// src/components/WarrantyProposalPrint.jsx
import React from 'react';

// Phiếu đề nghị sửa chữa bảo hành — bản in HTML giống mẫu "Mẫu đề xuất bảo hành.xlsx".
// Chỉ render nội dung; host lo hiện/ẩn khi in. Props: { p } = object từ mapRowToProposal.
const GDKT = 'Đỗ Hương Nguyên'; // Giám Đốc Kỹ Thuật — theo mẫu

const box = { border: '1px solid #000' };
const cell = { border: '1px solid #000', padding: '4px 6px', fontSize: '0.82rem', color: '#000', verticalAlign: 'top', wordBreak: 'break-word' };
const th = { ...cell, fontWeight: 700, textAlign: 'center', background: '#f2f2f2', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

function Row({ label, value }) {
  return (
    <div style={{ margin: '3px 0', fontSize: '0.86rem', color: '#000' }}>
      <span style={{ fontWeight: 700 }}>{label}: </span><span>{value || ''}</span>
    </div>
  );
}
function Check({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0', fontSize: '0.86rem', color: '#000' }}>
      <span style={{ display: 'inline-block', width: 14, height: 14, border: '1.5px solid #000' }} /> {label}
    </div>
  );
}

export default function WarrantyProposalPrint({ p }) {
  const lk = (p.linhKienList && p.linhKienList.length) ? p.linhKienList : [''];
  return (
    <div style={{ width: '100%', color: '#000', fontFamily: 'Times New Roman, serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px' }}>
        PHIẾU ĐỀ NGHỊ SỬA CHỮA BẢO HÀNH SẢN PHẨM
      </h2>
      <div style={{ textAlign: 'center', fontSize: '0.84rem', fontStyle: 'italic', marginBottom: 10 }}>{p.ngayText}</div>

      <div style={{ marginBottom: 8 }}>
        <Row label="Bên nhận bảo hành" value={p.khachHang} />
        <Row label="Số điện thoại" value={p.sdt} />
        <Row label="Địa chỉ" value={p.diaChi} />
        <Row label="Mã đơn hàng" value={p.maDonHang} />
        <Row label="Ngày giao hàng (Lắp đặt)" value={p.ngayLap} />
      </div>

      {/* §1 Hàng hoá bảo hành */}
      <div style={{ fontWeight: 700, margin: '8px 0 4px', fontSize: '0.9rem' }}>1. Hàng hoá bảo hành</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...box }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>TT</th>
            <th style={{ ...th, width: '40%' }}>Sản phẩm</th>
            <th style={{ ...th, width: '10%' }}>ĐVT</th>
            <th style={{ ...th, width: '12%' }}>Số lượng</th>
            <th style={{ ...th, width: '32%' }}>Ghi chú (Tình trạng)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }}>1</td>
            <td style={{ ...cell, fontWeight: 600 }}>{p.maSP}</td>
            <td style={{ ...cell, textAlign: 'center' }}>Cái</td>
            <td style={{ ...cell, textAlign: 'center' }}>1</td>
            <td style={cell}>{p.tinhTrang}</td>
          </tr>
        </tbody>
      </table>

      {/* §2 Hoạt động kiểm tra */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>2. Hoạt động kiểm tra</div>
      <Check label="Đã kiểm tra" />

      {/* §3 Tình trạng lỗi */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>3. Tình trạng lỗi</div>
      <Check label="Không lỗi — Đã kiểm tra kĩ phát hiện không lỗi, đã giải thích chi tiết cho khách hàng" />
      <Check label="Có lỗi — Đã kiểm tra và xác định lỗi" />
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 6, ...box }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>TT</th>
            <th style={{ ...th, width: '46%' }}>Mã Linh kiện</th>
            <th style={{ ...th, width: '12%' }}>Số lượng</th>
            <th style={{ ...th, width: '18%' }}>Được bảo hành</th>
            <th style={{ ...th, width: '18%' }}>Không được bảo hành</th>
          </tr>
        </thead>
        <tbody>
          {lk.map((name, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{name}</td>
              <td style={{ ...cell, textAlign: 'center' }}>1</td>
              <td style={cell}></td>
              <td style={cell}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* §4 Thu hồi linh kiện */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>4. Thu hồi linh kiện</div>
      <Check label="Có thu hồi linh kiện" />
      <Check label="Không thu hồi linh kiện" />

      {/* Chữ ký */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, textAlign: 'center', fontSize: '0.86rem' }}>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 700 }}>Phụ trách đơn</div>
          <div style={{ marginTop: 48, fontWeight: 700 }}>{p.nguoiPhuTrach || ' '}</div>
        </div>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 700 }}>Giám Đốc Kỹ Thuật</div>
          <div style={{ marginTop: 48, fontWeight: 700 }}>{GDKT}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Kiểm tra build không lỗi cú pháp**

Run: `npx vite build 2>&1 | tail -5` (hoặc để dành verify ở Task 7).
Expected: không lỗi import/JSX ở file này. (Nếu muốn nhanh, bỏ qua tới Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/WarrantyProposalPrint.jsx
git commit -m "feat(bao-hanh): component in HTML phiếu đề xuất BH (A4 dọc)"
```

---

## Task 5: Modal `WarrantyProposalModal`

Modal xác nhận: liệt kê các phiếu sẽ tạo + 3 nút (In/Tạo PDF, Tải Excel, Đóng). Không tự render vùng in (vùng in nằm ở `WarrantyProcessing` — Task 6). Nhận `rows`, `currentUser`, `busy`, callbacks.

**Files:**
- Create: `src/pages/warranty/WarrantyProposalModal.jsx`

- [ ] **Step 1: Viết modal**

```jsx
// src/pages/warranty/WarrantyProposalModal.jsx
import React from 'react';
import { Printer, Download, X } from 'lucide-react';
import { mapRowToProposal } from '../../lib/warrantyProposalMap';

// Modal chọn cách xuất phiếu đề xuất BH cho 1 hoặc nhiều phiếu đã chọn.
// className "no-print" ở toàn bộ overlay để ẩn khi in (vùng in thật là #wproc-print ở host).
export default function WarrantyProposalModal({ rows, currentUser, now, busy, onPrint, onExcel, onClose }) {
  if (!rows || rows.length === 0) return null;
  const list = rows.map((r) => mapRowToProposal(r, currentUser, now));
  const btn = (bg, disabled) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1rem', border: 'none',
    borderRadius: 8, background: bg, color: '#fff', fontWeight: 700, fontSize: '0.9rem',
    cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1,
  });
  return (
    <div className="no-print" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-card"
        style={{ background: '#fff', borderRadius: 14, width: 'min(560px, 96vw)', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', padding: '1.1rem 1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Tạo phiếu đề xuất bảo hành ({list.length})</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>Nội dung lấy từ dữ liệu phiếu tại thời điểm này. Các ô kiểm tra/thu hồi để trống cho ký tay.</div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          {list.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '0.5rem 0.7rem', fontSize: '0.82rem', borderBottom: i < list.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 ? '#f8fafc' : '#fff' }}>
              <span style={{ fontWeight: 700, color: '#1e293b', minWidth: 90 }}>{p.maPhieu || '—'}</span>
              <span style={{ color: '#475569', flex: 1 }}>{p.khachHang || '—'} · {p.maSP || '—'}{p.linhKienList.length ? ` · ${p.linhKienList.length} LK` : ''}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={onPrint} style={btn('#4f46e5', busy)}><Printer size={16} /> In / Tạo PDF</button>
          <button disabled={busy} onClick={onExcel} style={btn('#10b981', busy)}><Download size={16} /> {busy ? 'Đang tạo...' : 'Tải Excel'}</button>
          <button disabled={busy} onClick={onClose} style={{ padding: '0.6rem 1rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/warranty/WarrantyProposalModal.jsx
git commit -m "feat(bao-hanh): modal chọn In/PDF hoặc tải Excel phiếu đề xuất BH"
```

---

## Task 6: Ghép vào `WarrantyProcessing.jsx`

Thêm: nút "Đề xuất BH" mỗi dòng (cột mới), nút hàng loạt trên thanh công cụ, state + vùng in `#wproc-print` + CSS in, và 2 handler (in, tải Excel).

**Files:**
- Modify: `src/pages/warranty/WarrantyProcessing.jsx`

- [ ] **Step 1: Thêm import** (đầu file, cạnh các import hiện có)

Sau dòng `import ProcessingModal from './ProcessingModal';` thêm:
```jsx
import WarrantyProposalModal from './WarrantyProposalModal';
import WarrantyProposalPrint from '../../components/WarrantyProposalPrint';
import { mapRowToProposal } from '../../lib/warrantyProposalMap';
import { downloadProposalExcel } from '../../lib/warrantyProposalExcel';
import { FileText } from 'lucide-react';
```

- [ ] **Step 2: Thêm cột "Đề xuất BH" vào `LIST_COLUMNS`** — chèn ngay TRƯỚC dòng `];` đóng mảng `LIST_COLUMNS` (sau entry `khai_báo`):

```jsx
  {
    key: 'de_xuat_bh', label: 'Đề xuất BH', render: (r, ctx) => (
      <button
        onClick={(e) => { e.stopPropagation(); ctx.onProposal([r]); }}
        title="Tạo phiếu đề xuất bảo hành"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
      >
        <FileText size={12} /> Đề xuất
      </button>
    )
  },
```

- [ ] **Step 3: Thêm 'de_xuat_bh' vào `DEFAULT_VISIBLE`**

Đổi:
```jsx
const DEFAULT_VISIBLE = ['phiếu_ghi', 'card_sp', 'card_ktv', 'card_kh', 'card_bh', 'trạng_thái_xử_lý', 'các_bước', 'trạng_thái_đồng_bộ', 'khai_báo'];
```
thành:
```jsx
const DEFAULT_VISIBLE = ['phiếu_ghi', 'de_xuat_bh', 'card_sp', 'card_ktv', 'card_kh', 'card_bh', 'trạng_thái_xử_lý', 'các_bước', 'trạng_thái_đồng_bộ', 'khai_báo'];
```

- [ ] **Step 4: Seed cột mới cho người dùng cũ** — thêm 'de_xuat_bh' vào effect seeding sẵn có. Đổi trong `useEffect` có `FLAG = 'qlsx_wproc_newcols_seeded_v2'`:

```jsx
    const FLAG = 'qlsx_wproc_newcols_seeded_v2';
    if (localStorage.getItem(FLAG)) return;
    setVisibleCols(prev => {
      const next = [...prev];
      for (const k of ['khai_báo', 'card_bh']) if (!next.includes(k)) next.push(k);
      return next;
    });
    localStorage.setItem(FLAG, '1');
```
thành (đổi tên FLAG sang v3 + thêm key mới):
```jsx
    const FLAG = 'qlsx_wproc_newcols_seeded_v3';
    if (localStorage.getItem(FLAG)) return;
    setVisibleCols(prev => {
      const next = [...prev];
      for (const k of ['khai_báo', 'card_bh', 'de_xuat_bh']) if (!next.includes(k)) next.push(k);
      return next;
    });
    localStorage.setItem(FLAG, '1');
```

- [ ] **Step 5: Thêm state** — ngay sau dòng `const [khaiBaoExt, setKhaiBaoExt] = useState(() => new Map());`:

```jsx
  const [proposalRows, setProposalRows] = useState(null); // dòng đang tạo phiếu đề xuất (null = đóng)
  const [proposalNow, setProposalNow] = useState(null);   // mốc thời gian tạo (snapshot)
  const [proposalBusy, setProposalBusy] = useState(false);
```

- [ ] **Step 6: Thêm handlers** — ngay TRƯỚC `if (loading && rows.length === 0) {`:

```jsx
  // Mở modal tạo phiếu đề xuất BH (1 hoặc nhiều dòng). Chốt mốc thời gian tạo tại đây (snapshot).
  const openProposal = (rowsArg) => {
    const list = (rowsArg || []).filter(Boolean);
    if (list.length === 0) { alert('Vui lòng chọn ít nhất 1 phiếu để tạo đề xuất!'); return; }
    setProposalNow(new Date());
    setProposalRows(list);
  };
  const closeProposal = () => { if (!proposalBusy) { setProposalRows(null); setProposalNow(null); } };
  // In/PDF: vùng #wproc-print đã render sẵn theo proposalRows → chỉ cần gọi in.
  const printProposal = () => { setTimeout(() => window.print(), 60); };
  // Tải Excel theo mẫu.
  const excelProposal = async () => {
    setProposalBusy(true);
    try {
      await downloadProposalExcel(proposalRows, user, proposalNow || new Date());
      setProposalRows(null); setProposalNow(null);
    } catch (e) {
      alert('Lỗi tạo Excel: ' + (e?.message || e));
    } finally {
      setProposalBusy(false);
    }
  };
  // Danh sách phiếu đã tick (theo filtered) — cho nút hàng loạt.
  const selectedRows = filtered.filter(r => selectedIds.has(r.id));
```

- [ ] **Step 7: Truyền `onProposal` vào ctx render cột** — trong `<td>` gọi `c.render(r, { ... })`, thêm `onProposal: openProposal` vào object ctx:

Đổi:
```jsx
                      {c.render(r, { perm, onCompleteSync: completeStepAndSync, onQuickSync: quickSync, onSaveGroup: saveInfoGroup, onSaveLan: saveLan, onSendLan: sendLan, onAddLan: addLan, onCancelLan: cancelLan, khaiBaoExt })}
```
thành:
```jsx
                      {c.render(r, { perm, onCompleteSync: completeStepAndSync, onQuickSync: quickSync, onSaveGroup: saveInfoGroup, onSaveLan: saveLan, onSendLan: sendLan, onAddLan: addLan, onCancelLan: cancelLan, khaiBaoExt, onProposal: openProposal })}
```

- [ ] **Step 8: Thêm nút hàng loạt** — trong thanh công cụ, NGAY TRƯỚC nút "Ẩn / Hiện cột" (dòng `<div style={{ position: 'relative' }}>` chứa nút Ẩn/Hiện cột), chèn:

```jsx
        {/* Tạo phiếu đề xuất BH cho các phiếu đã tick (hàng loạt) */}
        <button
          onClick={() => openProposal(selectedRows)}
          disabled={selectedIds.size === 0}
          title={selectedIds.size === 0 ? 'Tick chọn phiếu để tạo đề xuất' : 'Tạo phiếu đề xuất BH cho các phiếu đã chọn'}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: 'none', borderRadius: '8px', background: selectedIds.size === 0 ? '#cbd5e1' : '#4f46e5', color: '#fff', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          <FileText size={15} /> Đề xuất BH{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
```

- [ ] **Step 9: Thêm CSS in + vùng in + modal** — ngay TRƯỚC dòng cuối `{editing && <ProcessingModal ...`, chèn:

```jsx
      {/* CSS in cho phiếu đề xuất — ẩn mọi thứ trừ #wproc-print */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden; }
          #wproc-print, #wproc-print * { visibility: visible; }
          #wproc-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Vùng in (ẩn ngoài màn hình lúc xem; hiện khi in). Mỗi phiếu 1 trang. */}
      {proposalRows && (
        <div id="wproc-print" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', background: '#fff' }}>
          {proposalRows.map((r, i) => (
            <div key={r.id ?? i} style={{ padding: '6mm 4mm', pageBreakAfter: i < proposalRows.length - 1 ? 'always' : 'auto' }}>
              <WarrantyProposalPrint p={mapRowToProposal(r, user, proposalNow || undefined)} />
            </div>
          ))}
        </div>
      )}

      {proposalRows && (
        <WarrantyProposalModal
          rows={proposalRows} currentUser={user} now={proposalNow || undefined} busy={proposalBusy}
          onPrint={printProposal} onExcel={excelProposal} onClose={closeProposal}
        />
      )}
```

- [ ] **Step 10: Chạy lint + test toàn bộ**

Run:
```bash
npx eslint src/pages/warranty/WarrantyProcessing.jsx src/pages/warranty/WarrantyProposalModal.jsx src/components/WarrantyProposalPrint.jsx src/lib/warrantyProposalMap.js src/lib/warrantyProposalExcel.js && npx vitest run
```
Expected: eslint không lỗi; toàn bộ test PASS.

- [ ] **Step 11: Commit**

```bash
git add src/pages/warranty/WarrantyProcessing.jsx
git commit -m "feat(bao-hanh): nút Đề xuất BH mỗi dòng + hàng loạt, in/PDF + tải Excel"
```

---

## Task 7: Verify trong preview (đăng nhập → tab Xử Lý Phiếu → thử in + tải Excel)

**Files:** không sửa (chỉ kiểm chứng).

- [ ] **Step 1: Chạy build để chắc không lỗi bundle**

Run: `npx vite build 2>&1 | tail -8`
Expected: `built in ...`, không lỗi.

- [ ] **Step 2: Khởi động preview + đăng nhập**

Dùng `preview_start` (server dev theo `.claude/launch.json`; tạo nếu chưa có: `npm run dev`, port theo Vite). Đăng nhập theo memory **[QLSX preview verification]** (auth tùy biến + lưu ý controlled-input). Vào **Bảo Hành → Xử Lý Phiếu**.

- [ ] **Step 3: Kiểm tra nút mỗi dòng**

`preview_snapshot` xác nhận cột "Đề xuất BH" hiện nút "Đề xuất". Bấm 1 nút (per-row) → modal "Tạo phiếu đề xuất bảo hành (1)" hiện, liệt kê đúng mã phiếu/khách/SP.

- [ ] **Step 4: Kiểm tra tải Excel**

Trong modal bấm "Tải Excel". Dùng `preview_network`/`preview_console_logs` xác nhận không có lỗi JS và có request tới `/mau-de-xuat-bao-hanh.xlsx` (200). (File tải về do trình duyệt lưu — xác nhận không có exception.)

- [ ] **Step 5: Kiểm tra hàng loạt**

Tick 2–3 dòng → nút "Đề xuất BH (N)" trên thanh công cụ bật → bấm → modal liệt kê đúng N phiếu.

- [ ] **Step 6: Kiểm tra vùng in tồn tại**

`preview_eval`: `document.getElementById('wproc-print') ? document.querySelectorAll('#wproc-print h2').length : 0` — Expected: bằng số phiếu đang mở (mỗi phiếu 1 tiêu đề). (Không tự gọi `window.print()` trong preview vì mở hộp thoại hệ thống.)

- [ ] **Step 7: Chụp ảnh bằng chứng**

`preview_screenshot` modal đang mở để lưu bằng chứng. Nếu có lỗi ở bước nào → đọc source, sửa, quay lại Task tương ứng.

- [ ] **Step 8: Không commit (chỉ verify).** Nếu có sửa lỗi thì commit theo nội dung sửa.

---

## Task 8: Cập nhật bundle deploy-netlify

Theo memory **[Netlify deploy]**: sau khi đổi code phải build + copy `dist` → `deploy-netlify/`.

**Files:**
- Modify: `deploy-netlify/**` (bundle build)

- [ ] **Step 1: Build production**

Run: `npm run build`
Expected: tạo `dist/` mới, không lỗi.

- [ ] **Step 2: Đồng bộ dist → deploy-netlify** (giữ đúng cách repo đang làm — xem commit `95eaa2a`)

Run (git-bash) — copy nội dung dist đè lên deploy-netlify, và đảm bảo file mẫu public có mặt:
```bash
cp -r dist/* deploy-netlify/ && ls deploy-netlify/mau-de-xuat-bao-hanh.xlsx
```
Expected: liệt kê được file mẫu trong bundle (Vite copy `public/` → `dist/` tự động).

- [ ] **Step 3: Commit bundle**

```bash
git add deploy-netlify dist
git commit -m "chore(deploy): cập nhật bundle deploy-netlify (phiếu đề xuất BH)"
```

- [ ] **Step 4: Báo người dùng** rằng đã sẵn sàng kéo-thả thư mục `deploy-netlify/` để deploy.

---

## Self-Review (đã rà)

**1. Spec coverage:**
- Nút mỗi dòng → Task 6 Step 2/3 (cột `de_xuat_bh`). ✅
- Chọn nhiều dòng, tạo hàng loạt → Task 6 Step 8 (nút "Đề xuất BH (N)"). ✅
- Tạo PDF / in trực tiếp → Task 4 (component) + Task 6 Step 9 (CSS in + vùng `#wproc-print` + `window.print()`). ✅
- Tải Excel theo mẫu → Task 3 (ExcelJS fill) + Task 6 (nút trong modal). ✅
- Nội dung tại thời điểm tạo → `proposalNow` chốt lúc mở modal, map từ dữ liệu dòng trong RAM. ✅
- Mẫu = file trong thư mục → Task 1 copy vào `public/`, Task 3 nạp đúng mẫu. ✅
- Mỗi linh kiện 1 dòng → Task 3 `buildSheet` chèn dòng + Task 4 render nhiều dòng. ✅
- Mỗi phiếu 1 sheet → Task 3 `buildProposalWorkbook` addWorksheet/phiếu. ✅
- Ký "Phụ trách đơn" = người đăng nhập → `mapRowToProposal.nguoiPhuTrach` + ghi A39. ✅
- Ô kiểm tra/thu hồi/Được-Không được BH để trống → Task 3 set null, Task 4 ô checkbox trống. ✅

**2. Placeholder scan:** không có TBD/TODO; mọi step in/xuất đều có code đầy đủ. ✅

**3. Type consistency:** object proposal có các khóa `{maPhieu, khachHang, sdt, diaChi, maDonHang, ngayLap, maSP, tinhTrang, linhKienList, nguoiPhuTrach, ngayText}` — dùng nhất quán ở `warrantyProposalExcel.js` (Task 3), `WarrantyProposalPrint.jsx` (Task 4), test (Task 2/3). Hàm: `mapRowToProposal(row, currentUser, now)`, `buildProposalWorkbook(buffer, proposals)`, `downloadProposalExcel(rows, currentUser, now)` — khớp giữa các task. ✅

**4. Ambiguity:** vùng in dùng id `wproc-print` (khác `print-area` của kho) để không đụng CSS in của tab khác nếu render cùng lúc. ✅
