// Xuất bảng KPI ra Excel theo bố cục file gốc (KPI kho 06.2026.xls) để bộ phận khác
// đọc quen mắt. Phần dựng dữ liệu tách riêng (dungDuLieuSheet) để test được mà không
// cần chạy ExcelJS.
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { tinhBangKpi, kiemTraTrongSo, giaiThich } from './kpiEngine';

const soGon = n => Math.round(n * 100) / 100;

const ngayVN = d => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString('vi-VN');
};

// Cột "Ghi chú / Bằng chứng" phải trả lời được: vì sao ra con số này?
// Câu diễn giải lấy nguyên từ engine (`giaiThich`) thay vì tự ghép ở đây — nếu tự ghép,
// dòng chốt tay sẽ chỉ liệt kê nhật ký và người đọc cộng trừ ra số khác hẳn cột Điểm đạt.
function ghiChuCua(d, bpMap) {
  const logs = d.logs || [];
  const g = giaiThich(d, logs, bpMap);
  const nguon = g.buoc[0];
  const chiTiet = logs
    .map(l => {
      const s = Number(l.so_diem);
      return `${ngayVN(l.ngay)} ${l.ly_do} (${s > 0 ? '+' : ''}${soGon(s)})`;
    })
    .join('; ');
  return [`${nguon.nhan}: ${nguon.dienGiai}`, chiTiet].filter(Boolean).join(' | ');
}

// Dựng dữ liệu phẳng cho 1 sheet: dòng nhóm xen giữa các dòng chỉ tiêu, đúng như Excel gốc.
export function dungDuLieuSheet(rows, logs, tenNhanVien, ky) {
  const kq = tinhBangKpi(rows, logs);
  const dong = [];
  let nhomHienTai = null;

  for (const d of kq.dong) {
    if (d.nhom && d.nhom !== nhomHienTai) {
      nhomHienTai = d.nhom;
      dong.push({ laNhom: true, ten: d.nhom });
    }

    // Dòng thưởng ngoài trọng số: chỉ tiêu/tỉ lệ/trọng số/điểm mất đều KHÔNG áp dụng, và
    // `diemDat` của nó luôn là 0 chứ không phải điểm thật. Để trống các cột đó (đúng như
    // file Excel gốc bỏ trống G/H) thay vì in số 0 gây hiểu nhầm; điểm thật ở cột quy đổi.
    const thuong = d.laThuong;
    dong.push({
      laNhom: false,
      laThuong: thuong,
      ten: d.ten,
      mo_ta: d.mo_ta || '',
      chi_tieu: thuong ? null : d.chi_tieu,
      trong_so: thuong ? null : d.trong_so,
      diem_tu_cham: d.diem_tu_cham ?? null,
      diemDat: thuong ? null : soGon(d.diemDat),
      // 2 chữ số như `phanTram` trong engine — làm tròn về số nguyên sẽ khiến bản in tự mâu
      // thuẫn (33% × 9 ra 2.97 chứ không phải 3 như cột quy đổi).
      tiLePhanTram: d.tiLeDat === null ? null : soGon(d.tiLeDat * 100),
      diemQuyDoi: soGon(d.diemQuyDoi),
      diemMat: thuong ? null : soGon(d.diemMat),
      ghiChu: ghiChuCua(d, kq.bpMap),
    });
  }

  // Dùng chung kiemTraTrongSo với giao diện, đừng tự cộng lại: cộng theo `chi_tieu > 0`
  // sẽ bỏ sót dòng lỗi nhập chi_tieu = 0 và file Excel báo 100 trong khi màn hình báo lệch.
  const trongSo = kiemTraTrongSo(rows);

  return {
    tenNhanVien, ky, dong,
    tongKpi: soGon(kq.tongKpi),
    tongMat: soGon(kq.tongMat),
    tongTrongSo: trongSo.tong,
    trongSoHopLe: trongSo.hopLe,
  };
}

const COT = [
  { key: 'ten', header: 'Chỉ tiêu KPI', width: 30 },
  { key: 'mo_ta', header: 'Diễn giải', width: 60 },
  { key: 'chi_tieu', header: 'Chỉ tiêu', width: 9 },
  { key: 'trong_so', header: 'Trọng số', width: 9 },
  { key: 'diem_tu_cham', header: 'Tự đánh giá', width: 11 },
  { key: 'diemDat', header: 'Điểm đạt', width: 9 },
  { key: 'tiLePhanTram', header: 'Tỉ lệ đạt (%)', width: 11 },
  { key: 'diemQuyDoi', header: 'Điểm quy đổi', width: 12 },
  { key: 'diemMat', header: 'Điểm mất', width: 9 },
  { key: 'ghiChu', header: 'Ghi chú / Bằng chứng', width: 45 },
];
const COT_QUY_DOI = COT.findIndex(c => c.key === 'diemQuyDoi') + 1;
const COT_MAT = COT.findIndex(c => c.key === 'diemMat') + 1;
const COT_TRONG_SO = COT.findIndex(c => c.key === 'trong_so') + 1;

// Tên sheet Excel: bỏ ký tự cấm, ≤31 ký tự, chống trùng — cùng luật với warrantyProposalExcel.
function tenSheet(name, used) {
  let s = String(name || 'KPI').replace(/[[\]*?/\\:]/g, ' ').trim().slice(0, 28) || 'KPI';
  const base = s; let i = 2;
  while (used.has(s)) s = `${base} (${i++})`.slice(0, 31);
  used.add(s);
  return s;
}

// `danhSach`: [{ rows, logs, tenNhanVien }] — 1 người hoặc cả team.
export async function xuatExcelKpi(danhSach, ky) {
  const wb = new ExcelJS.Workbook();
  const used = new Set();

  for (const item of danhSach) {
    const d = dungDuLieuSheet(item.rows, item.logs, item.tenNhanVien, ky);
    const ws = wb.addWorksheet(tenSheet(item.tenNhanVien, used), {
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    ws.addRow(['CÔNG TY TNHH EUROMADE VIỆT NAM']);
    ws.addRow([`BẢNG ĐÁNH GIÁ KPI — Kỳ ${ky}`]);
    ws.addRow([`Tên nhân viên: ${d.tenNhanVien}`]);
    ws.addRow([`Tổng điểm: ${d.tongKpi} / 100 — Mất ${d.tongMat} điểm`]);
    ws.getRow(1).font = { bold: true };
    ws.getRow(4).font = { bold: true, size: 12 };

    // Bảng chỉ tiêu lệch trọng số thì mọi con số quy đổi bên dưới đều không so sánh được
    // giữa người này với người khác — phải nói ra ngay trong file, không chỉ trên màn hình.
    if (!d.trongSoHopLe) {
      const c = ws.addRow([`⚠ Σ trọng số = ${d.tongTrongSo} (≠ 100) — bảng chỉ tiêu chưa chuẩn.`]);
      c.font = { bold: true, color: { argb: 'FFDC2626' } };
    }
    ws.addRow([]);

    const hdr = ws.addRow(COT.map(c => c.header));
    hdr.font = { bold: true };
    hdr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    COT.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

    for (const r of d.dong) {
      if (r.laNhom) {
        const row = ws.addRow([r.ten]);
        row.font = { bold: true };
        continue;
      }
      const row = ws.addRow(COT.map(c => r[c.key]));
      row.alignment = { vertical: 'top', wrapText: true };
      if (r.laThuong) {
        // Không có ô nào ở các cột chỉ tiêu/trọng số nên phải đánh dấu bằng màu, nếu
        // không dòng này trông như một chỉ tiêu bị bỏ trống dữ liệu.
        row.getCell(COT_TRONG_SO).value = 'ngoài TS';
        row.getCell(COT_QUY_DOI).font = { bold: true, color: { argb: 'FF059669' } };
      } else if (r.diemMat > 0.001) {
        row.getCell(COT_MAT).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
    }

    const o = new Array(COT.length).fill(null);
    o[0] = 'TỔNG';
    o[COT_TRONG_SO - 1] = d.tongTrongSo;
    o[COT_QUY_DOI - 1] = d.tongKpi;
    o[COT_MAT - 1] = d.tongMat;
    ws.addRow(o).font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `KPI-${ky}.xlsx`);
}
