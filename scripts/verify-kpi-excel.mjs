// Kiểm tra đầu-cuối engine KPI với dữ liệu THẬT: đọc file Excel gốc → dựng rows như
// script import → đẩy qua engine → so với con số Excel tự tính.
//
// Chạy: node scripts/verify-kpi-excel.mjs   (cần có KPI/*.xls, file này KHÔNG commit
// vì chứa dữ liệu nhân sự thật). Chạy lại mỗi khi sửa luật trong kpiEngine.js.

import XLSX from 'xlsx';
import { tinhBangKpi, kiemTraTrongSo } from '../src/lib/kpiEngine.js';

const wb = XLSX.readFile('KPI/Copy of KPI kho 06.2026.xls');
const ws = wb.Sheets['BÍCH'];
const range = XLSX.utils.decode_range(ws['!ref']);
const o = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
const val = (r, c) => { const x = o(r, c); return x ? x.v : undefined; };
const laSo = c => c && typeof c.v === 'number' && !c.f;

let hdr = -1;
for (let R = range.s.r; R <= range.e.r; R++) {
  if (String(val(R, 2) ?? '').trim() === 'Chỉ tiêu KPI') { hdr = R; break; }
}

const rows = [];
let thuTu = 0;
for (let R = hdr + 2; R <= range.e.r; R++) {
  const ten = val(R, 1);
  const nhanNhom = val(R, 0);
  const G = o(R, 6), H = o(R, 7);
  if (!laSo(G) && !laSo(H) && typeof nhanNhom === 'string' && /^\s*[A-F]\./.test(nhanNhom)) continue;
  if (!ten) continue;
  const tenS = String(ten).replace(/\s+/g, ' ').trim();
  const chiTieu = laSo(G) ? G.v : null;
  const trongSo = laSo(H) ? H.v : 0;
  if (chiTieu === null && !trongSo && !/CỘNG THÊM/i.test(tenS)) continue;
  const laBoPhan = /BỘ PHẬN|CẢ TEAM/i.test(tenS);
  rows.push({
    id: 'c' + (++thuTu), cap_do: 'CA_NHAN', ten: tenS,
    chi_tieu: chiTieu, trong_so: trongSo,
    diem_chot: typeof val(R, 10) === 'number' ? val(R, 10) : null,
    lien_ket_bo_phan: laBoPhan ? 'CHUYEN_CAN_BO_PHAN' : null,
  });
}

// Dòng chấm chung: điểm đạt lấy từ chính cột K của dòng bộ phận trong sheet Bích.
const dongBP = rows.find(r => r.lien_ket_bo_phan);
const bpRow = {
  id: 'bp1', cap_do: 'BO_PHAN', lien_ket_bo_phan: 'CHUYEN_CAN_BO_PHAN',
  ten: dongBP.ten, chi_tieu: dongBP.chi_tieu, trong_so: 0, diem_chot: dongBP.diem_chot,
};

const kq = tinhBangKpi([bpRow, ...rows], []);
const ts = kiemTraTrongSo(rows);

console.log('Chỉ tiêu Bích lấy từ Excel:', rows.length);
console.log('Σ trọng số:', ts.tong, ts.hopLe ? 'OK' : '⚠ LỆCH');
console.log('');
for (const d of kq.dong) {
  const mat = d.diemMat > 0.0001 ? `  ← mất ${d.diemMat.toFixed(1)}` : '';
  console.log(`  ${String(d.diemDat).padStart(3)}/${String(d.chi_tieu).padEnd(3)} ×${String(d.trong_so).padEnd(3)} = ${d.diemQuyDoi.toFixed(1).padStart(5)}  ${d.ten.slice(0, 26).padEnd(28)}${mat}`);
}
console.log('');
console.log('TỔNG KPI :', kq.tongKpi.toFixed(1));
console.log('TỔNG MẤT :', kq.tongMat.toFixed(1));
console.log('');
const dung = Math.abs(kq.tongKpi - 86.1) < 0.05;
console.log(dung ? '✔ KHỚP Excel (86.1)' : `✖ LỆCH — Excel là 86.1, engine ra ${kq.tongKpi.toFixed(2)}`);
process.exit(dung ? 0 : 1);
