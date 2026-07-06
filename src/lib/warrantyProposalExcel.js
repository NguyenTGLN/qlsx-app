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
  let s = String(name || 'Phiếu').replace(/[[\]*?/\\:]/g, ' ').trim().slice(0, 28) || 'Phiếu';
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
  ws.getRow(T.sigName + extra).getCell(1).value = p.nguoiPhuTrach;   // A39 (dịch) = Phụ trách đơn
  ws.getRow(T.sig1 + extra).getCell(5).value = 'Bộ phận bảo hành';   // E34 (dịch): thay "Giám Đốc Kỹ Thuật"
  ws.getRow(T.sigName + extra).getCell(5).value = 'Nguyễn Bá Ngọc';  // E39 (dịch): tên ký cố định
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
