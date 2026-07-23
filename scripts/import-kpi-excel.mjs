// Đọc KPI/Copy of KPI kho 06.2026.xls → sinh sql/seed_kpi_2026_06.sql.
// Chạy: node scripts/import-kpi-excel.mjs
// KHÔNG ghi thẳng vào Supabase — mở file SQL sinh ra, soát rồi tự chạy trên SQL Editor.
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { q, n, ngayCuoiKy, sqlChiTieuKemGhiChu } from '../src/lib/kpiImportSql.js';

// Mã chỉ tiêu: bỏ dấu, hoa, gạch dưới, tối đa 4 từ. Cùng tên → cùng mã, nên bảng chấm
// chung gom được các dòng của mọi nhân viên. Mã trùng nhau sau khi cắt thì sửa tay trong
// sql/them_ma_va_cham_chung_kpi.sql — file đó là bảng ánh xạ chuẩn.
function sinhMa(ten) {
  return String(ten)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .split('(')[0]
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_').filter(Boolean).slice(0, 4).join('_');
}

const FILE = 'KPI/Copy of KPI kho 06.2026.xls';
const KY = '2026-06';
const OUT = 'sql/seed_kpi_2026_06.sql';

// Sheet bỏ qua:
//  - 2 sheet đầu: bản cũ T12/2023 còn sót (công thức cột P bị ngược =N-H).
//  - ĐỨC (Trần Minh Đức): không có tài khoản trong bảng nhan_vien (chủ app xác nhận
//    22/07/2026 — bỏ qua, nạp bù sau nếu có tài khoản).
const BO_QUA = ['KPI T9 - BH - NB Ngọc', 'KPI T12 - KTSX', 'ĐỨC'];

// Ánh xạ KHAI TAY sheet → nhan_vien.id. Tên sheet không khớp tên nhân viên
// (thừa dấu cách, sai chính tả, có tiền tố phòng ban) nên KHÔNG đoán tự động —
// ghép nhầm KPI sang người khác là lỗi không sửa được sau khi đã chấm.
//
// Id thật lấy từ bảng nhan_vien (22/07/2026). Khớp cao vì id = viết tắt tên đầy đủ:
// ntth = Nguyễn Thị Thu Hà, vta = Vương Tuấn Anh, nbn = Nguyễn Bá Ngọc...
const MAP_NV = {
  'NGUYÊN ': 'admin', 'HÀ ': 'ntth', 'NGỌC': 'nbn',
  'PHONG': 'ndp', 'TUẤN': 'vta', 'HĨU': 'nvh',
  'BÍCH': 'lvb', 'XUÂN': 'dvx',
  'THIỆN': 'nxt', 'THƠ': 'ptt', 'XUYÊN': 'hhx',
  'DUYÊN': 'nv8', 'DƯƠNG': 'nttd',
};

// Chỉ tiêu chấm chung cả bộ phận → gom về một dòng BO_PHAN duy nhất mỗi nhóm.
// Trong Excel chúng là công thức nối chéo sheet (='HÀ'!O13), ở đây thành khoá nhóm.
const NHOM_BO_PHAN = [
  { khop: /BỘ PHẬN/i, khoa: 'CHUYEN_CAN_BO_PHAN' },
  { khop: /CẢ TEAM/i, khoa: 'HOTLINE_CA_TEAM_BH' },
];

// Ngày gắn cho dòng nhật ký giữ ghi chú: ngày cuối của kỳ (kỳ đã chốt, không có ngày cụ thể).
const NGAY_CHOT = ngayCuoiKy(KY);

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
  `--`,
  `-- Ghi chú cột O của Excel ("Các bộ phận liên quan đánh giá") được giữ lại thành dòng`,
  `-- kpi_nhat_ky với so_diem = 0: điểm thật đã nằm ở diem_chot (cột K), dòng này chỉ để`,
  `-- popup bằng chứng trong app nói được VÌ SAO mất điểm. Ngày = ${NGAY_CHOT} (cuối kỳ).`,
  `begin;`,
  `-- Xoá chỉ tiêu của kỳ này sẽ cascade xoá luôn kpi_nhat_ky của nó — đúng ý: chạy lại`,
  `-- import là dựng lại kỳ từ đầu, không để lẫn nhật ký của lần import trước.`,
  `delete from kpi_chi_tieu where ky = '${KY}';`,
  ``,
];

const boPhanDaTao = new Set();
const canhBao = [];
let soDongCaNhan = 0;
let soNhatKy = 0;

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
      const insBP = `insert into kpi_chi_tieu (ky, cap_do, lien_ket_bo_phan, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_chot, ma)`
        + ` values ('${KY}', 'BO_PHAN', ${q(r.lien_ket_bo_phan)}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, 0, 'THU_CONG', ${n(r.diem_chot)}, ${q(sinhMa(r.ten))})`;
      // Ghi chú của dòng chấm chung gắn vào ĐÚNG dòng BO_PHAN, không phải dòng cá nhân:
      // engine đọc bằng chứng của chỉ tiêu liên kết bộ phận từ dòng chung (`__bpId` trong
      // kpiEngine.tinhBangKpi), gắn vào dòng cá nhân là popup không bao giờ hiện ra.
      // Trong Excel ô này là công thức nối chéo sheet (='HÀ'!O13) nên 14 sheet dùng CHUNG
      // một câu chữ — lấy của sheet đầu gặp là đủ, không nhân bản 14 lần.
      sql.push(sqlChiTieuKemGhiChu(insBP, { ghiChu: r.ghi_chu, ngay: NGAY_CHOT }));
      if (r.ghi_chu) soNhatKy++;
    }
    soDongCaNhan++;
    const insCN = `insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_tu_cham, diem_chot, ma)`
      + ` values ('${KY}', 'CA_NHAN', ${q(nvId)}, ${q(r.lien_ket_bo_phan)}, ${q(r.nhom)}, ${r.thu_tu}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, ${r.trong_so}, 'THU_CONG', ${n(r.diem_tu_cham)}, ${n(r.diem_chot)}, ${q(sinhMa(r.ten))})`;
    // Dòng liên kết bộ phận đã gửi ghi chú lên dòng chung ở trên rồi → không lặp lại.
    const ghiChuCaNhan = r.lien_ket_bo_phan ? null : r.ghi_chu;
    sql.push(sqlChiTieuKemGhiChu(insCN, { ghiChu: ghiChuCaNhan, ngay: NGAY_CHOT }));
    if (ghiChuCaNhan) soNhatKy++;
  }
  sql.push('');
}

sql.push('commit;');
writeFileSync(OUT, sql.join('\n'), 'utf8');
console.log(`✔ Đã sinh ${OUT}`);
console.log(`  ${soDongCaNhan} dòng chỉ tiêu cá nhân + ${boPhanDaTao.size} dòng bộ phận`);
console.log(`  ${soNhatKy} dòng nhật ký giữ ghi chú cột O (so_diem = 0, chỉ làm bằng chứng)`);
for (const c of canhBao) console.log('  ' + c);
