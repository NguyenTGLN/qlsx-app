// Đọc KPI/Copy of KPI kho 06.2026.xls → sinh sql/seed_kpi_2026_06.sql.
// Chạy: node scripts/import-kpi-excel.mjs
// KHÔNG ghi thẳng vào Supabase — mở file SQL sinh ra, soát rồi tự chạy trên SQL Editor.
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const FILE = 'KPI/Copy of KPI kho 06.2026.xls';
const KY = '2026-06';
const OUT = 'sql/seed_kpi_2026_06.sql';

// Bản cũ T12/2023 còn sót trong file (công thức cột P bị ngược =N-H) — bỏ qua.
const BO_QUA = ['KPI T9 - BH - NB Ngọc', 'KPI T12 - KTSX'];

// Ánh xạ KHAI TAY sheet → nhan_vien.id. Tên sheet không khớp tên nhân viên
// (thừa dấu cách, sai chính tả, có tiền tố phòng ban) nên KHÔNG đoán tự động —
// ghép nhầm KPI sang người khác là lỗi không sửa được sau khi đã chấm.
//
// Các id dưới đây là GIẢ ĐỊNH. Trước khi chạy thật phải chạy
// `select id, name from nhan_vien` trên Supabase và thay bằng id thật —
// script tự dừng nếu còn id giả định (xem kiểm tra bên dưới).
const MAP_NV = {
  'NGUYÊN ': 'NV_NGUYEN', 'HÀ ': 'NV_HA', 'NGỌC': 'NV_NGOC',
  'PHONG': 'NV_PHONG', 'TUẤN': 'NV_TUAN', 'HĨU': 'NV_HUU',
  'BÍCH': 'NV_BICH', 'XUÂN': 'NV_XUAN', 'ĐỨC': 'NV_DUC',
  'THIỆN': 'NV_THIEN', 'THƠ': 'NV_THO', 'XUYÊN': 'NV_XUYEN',
  'DUYÊN': 'NV_DUYEN', 'DƯƠNG': 'NV_DUONG',
};

// Chỉ tiêu chấm chung cả bộ phận → gom về một dòng BO_PHAN duy nhất mỗi nhóm.
// Trong Excel chúng là công thức nối chéo sheet (='HÀ'!O13), ở đây thành khoá nhóm.
const NHOM_BO_PHAN = [
  { khop: /BỘ PHẬN/i, khoa: 'CHUYEN_CAN_BO_PHAN' },
  { khop: /CẢ TEAM/i, khoa: 'HOTLINE_CA_TEAM_BH' },
];

const q = v => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 'null');

function docSheet(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const o = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
  const val = (r, c) => { const cell = o(r, c); return cell ? cell.v : undefined; };

  // Hàng tiêu đề nằm ở dòng 8/9/10 tuỳ sheet → dò theo ô "Chỉ tiêu KPI", không hardcode.
  let hdr = -1;
  for (let R = range.s.r; R <= range.e.r; R++) {
    if (String(val(R, 2) ?? '').trim() === 'Chỉ tiêu KPI') { hdr = R; break; }
  }
  if (hdr < 0) throw new Error('Không tìm thấy hàng tiêu đề "Chỉ tiêu KPI"');

  const rows = [];
  let nhom = null, thuTu = 0;
  const laSo = c => c && typeof c.v === 'number' && !c.f;

  // hdr+1 là dòng "Tổng Điểm" (toàn công thức SUM) → bỏ, bắt đầu từ hdr+2.
  for (let R = hdr + 2; R <= range.e.r; R++) {
    const ten = val(R, 1);                       // cột B
    const nhanNhom = val(R, 0);                  // cột A
    const G = o(R, 6), H = o(R, 7);

    // Dòng nhóm: cột A có nhãn "A. ...", không có điểm.
    if (!laSo(G) && !laSo(H) && typeof nhanNhom === 'string' && /^\s*[A-F]\./.test(nhanNhom)) {
      nhom = nhanNhom.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (!ten) continue;

    const tenS = String(ten).replace(/\s+/g, ' ').trim();
    const chiTieu = laSo(G) ? G.v : null;
    const trongSo = laSo(H) ? H.v : 0;

    // Dòng không có cả chỉ tiêu lẫn trọng số: chỉ giữ nếu là dòng thưởng ngoài trọng số.
    if (chiTieu === null && !trongSo && !/CỘNG THÊM/i.test(tenS)) continue;

    const bp = NHOM_BO_PHAN.find(x => x.khop.test(tenS));
    rows.push({
      thu_tu: ++thuTu,
      nhom,
      ten: tenS,
      mo_ta: val(R, 2) ? String(val(R, 2)).replace(/\s+/g, ' ').trim() : null,
      chi_tieu: chiTieu,
      trong_so: trongSo,
      diem_tu_cham: typeof val(R, 8) === 'number' ? val(R, 8) : null,   // cột I
      diem_chot: typeof val(R, 10) === 'number' ? val(R, 10) : null,    // cột K (KPI duyệt)
      ghi_chu: val(R, 14) ? String(val(R, 14)).replace(/\s+/g, ' ').trim() : null, // cột O
      lien_ket_bo_phan: bp ? bp.khoa : null,
    });
  }
  return rows;
}

// Chặn chạy nhầm với id giả định — ghép sai KPI sang người khác là lỗi không sửa được
// sau khi đã chấm. Truyền --cho-phep-id-gia-dinh để chạy thử khi chưa có id thật.
const idGiaDinh = Object.values(MAP_NV).filter(v => v.startsWith('NV_'));
if (idGiaDinh.length && !process.argv.includes('--cho-phep-id-gia-dinh')) {
  console.error(`✖ Còn ${idGiaDinh.length} id giả định trong MAP_NV: ${idGiaDinh.join(', ')}`);
  console.error('  Thay bằng id thật từ `select id, name from nhan_vien`, hoặc chạy lại với');
  console.error('  --cho-phep-id-gia-dinh nếu chỉ muốn xem thử file SQL sinh ra.');
  process.exit(1);
}

const wb = XLSX.readFile(FILE);
const sql = [
  `-- Sinh tự động bởi scripts/import-kpi-excel.mjs từ ${FILE}`,
  `-- Kỳ ${KY}. SOÁT KỸ trước khi chạy — dữ liệu này gắn với lương thưởng.`,
  `begin;`,
  `delete from kpi_chi_tieu where ky = '${KY}';`,
  ``,
];

const boPhanDaTao = new Set();
const canhBao = [];
let soDongCaNhan = 0;

for (const sheet of wb.SheetNames) {
  if (BO_QUA.includes(sheet)) { canhBao.push(`BỎ QUA sheet cũ: ${sheet}`); continue; }
  const nvId = MAP_NV[sheet];
  if (!nvId) throw new Error(`Sheet "${sheet}" chưa có trong MAP_NV — bổ sung rồi chạy lại`);

  const rows = docSheet(wb.Sheets[sheet]);

  // Kiểm Σ trọng số ngay lúc import — bắt lỗi trước khi vào DB.
  const tong = rows.filter(r => r.chi_tieu != null).reduce((s, r) => s + r.trong_so, 0);
  if (Math.abs(tong - 100) > 0.001) canhBao.push(`⚠ ${sheet}: Σ trọng số = ${tong} (≠100)`);

  sql.push(`-- ── ${sheet} → ${nvId} (${rows.length} chỉ tiêu, Σ trọng số ${tong})`);

  for (const r of rows) {
    // Dòng BO_PHAN tạo một lần cho cả kỳ, dùng chung cho mọi người trong nhóm.
    if (r.lien_ket_bo_phan && !boPhanDaTao.has(r.lien_ket_bo_phan)) {
      boPhanDaTao.add(r.lien_ket_bo_phan);
      sql.push(`insert into kpi_chi_tieu (ky, cap_do, lien_ket_bo_phan, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_chot)`
        + ` values ('${KY}', 'BO_PHAN', ${q(r.lien_ket_bo_phan)}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, 0, 'THU_CONG', ${n(r.diem_chot)});`);
    }
    soDongCaNhan++;
    sql.push(`insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_tu_cham, diem_chot)`
      + ` values ('${KY}', 'CA_NHAN', ${q(nvId)}, ${q(r.lien_ket_bo_phan)}, ${q(r.nhom)}, ${r.thu_tu}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, ${r.trong_so}, 'THU_CONG', ${n(r.diem_tu_cham)}, ${n(r.diem_chot)});`);
  }
  sql.push('');
}

sql.push('commit;');
writeFileSync(OUT, sql.join('\n'), 'utf8');
console.log(`✔ Đã sinh ${OUT}`);
console.log(`  ${soDongCaNhan} dòng chỉ tiêu cá nhân + ${boPhanDaTao.size} dòng bộ phận`);
for (const c of canhBao) console.log('  ' + c);
