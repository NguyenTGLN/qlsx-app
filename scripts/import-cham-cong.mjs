// Đọc file Excel chấm công của máy chấm công → sinh SQL để người soát rồi dán vào Supabase.
// Cùng nếp với scripts/import-kpi-excel.mjs: script KHÔNG tự ghi vào DB.
//
// Chạy: node scripts/import-cham-cong.mjs
//
// File nguồn có mỗi dòng là một (người, ngày) với các cột:
//   Tên nhân viên | Ngày | Thứ | Giờ in sáng | Giờ in chiều | Giờ out | Tăng ca | Đi muộn (phút)
//   | Về sớm (phút) | Nghỉ
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const FILE = 'C:/Users/PC/Desktop/3. Cải tiến/12. Wepapp/Xử lý bảng chấm công/Thống kê chấm công T7.2026.xlsx';
const SHEET = 'CHI TIẾT THEO NGÀY';
const KY = '2026-07';
const OUT = 'sql/seed_cham_cong_2026_07.sql';

// Cắt dữ liệu tới hết ngày này. Máy chấm công xuất cả tháng nhưng những ngày CHƯA TỚI thì
// không có ai đi làm — để nguyên sẽ thành "cả công ty nghỉ 8 ngày cuối tháng".
const DEN_NGAY = '2026-07-23';

// Họ tên trong file chấm công → id trong bảng nhan_vien. Lấy từ `select id, name from nhan_vien`.
// Tên nào không có trong bảng này thì script DỪNG chứ không bỏ qua: bỏ qua im lặng nghĩa là
// một người mất sạch dữ liệu chấm công và KPI chuyên cần của họ tính trên số 0.
const MAP_NV = {
  'Nguyễn Đình Phong': 'ndp',
  'Phùng Thị Thơ': 'ptt',
  'Hoàng Hà Xuyên': 'hhx',
  'Đỗ Hương Nguyên': 'admin',
  'Nguyễn Bá Ngọc': 'nbn',
  'Vương Tuấn Anh': 'vta',
  'Đỗ Văn Xuân': 'dvx',
  'Nguyễn Văn Hĩu': 'nvh',
  'Nguyễn Xuân Thiện': 'nxt',
  'Nguyễn Thị Thùy Dương': 'nttd',
  'Nguyễn Thị Duyên': 'nv8',
  'Lê Văn Bích': 'lvb',
  'Nguyễn Thị Thu Hà': 'ntth',
};

const q = v => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 'null' : String(Number(v)));

// 'dd/MM/yyyy' → 'yyyy-MM-dd'. Không dùng new Date() vì chuỗi dd/MM bị JS đọc thành MM/dd.
function ngayISO(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// 'h:mm' → số phút. Cột tăng ca trong file là '1:27', không phải số.
function phut(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = /^(\d+):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(Number(t)) ? Number(t) : null;
}

// 'HH:mm' → phút trong ngày, để so giờ out với giờ in chiều.
function gio(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const wb = XLSX.readFile(FILE);
const raw = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, raw: false, defval: '' });

// Tìm dòng tiêu đề thay vì cắt cứng 4 dòng đầu: file xuất lại có thể thêm/bớt dòng ghi chú
// ở đầu, cắt cứng thì lệch một dòng là mất bản ghi đầu tiên mà không báo gì.
const hdr = raw.findIndex(r => String(r[0]).trim() === 'Tên nhân viên');
if (hdr < 0) throw new Error('Không tìm thấy dòng tiêu đề "Tên nhân viên" — file có đúng định dạng không?');

const dong = [];
const canhBao = [];
let boQuaNgaySau = 0;

for (let i = hdr + 1; i < raw.length; i++) {
  const r = raw[i];
  const ten = String(r[0] || '').trim();
  if (!ten) continue;

  const nvId = MAP_NV[ten];
  if (!nvId) throw new Error(`Không biết "${ten}" là ai — thêm vào MAP_NV rồi chạy lại.`);

  const ngay = ngayISO(r[1]);
  if (!ngay) throw new Error(`Ngày không đọc được ở dòng ${i + 1}: ${JSON.stringify(r[1])}`);
  if (ngay > DEN_NGAY) { boQuaNgaySau++; continue; }

  const inChieu = gio(r[4]);
  const out = gio(r[5]);
  let veSom = Number(r[8]) || 0;
  let nghiVan = null;

  // Máy ghi giờ ra SỚM HƠN lượt quét buổi chiều → người đó rõ ràng vẫn ở công ty, giờ out bị
  // lấy nhầm. Trong file mẫu có 9 dòng kiểu này, mỗi dòng ra "về sớm 330 phút" (5,5 tiếng).
  // Để nguyên thì luật chuyên cần trừ trọn 10 điểm, mà CHUYÊN CẦN BỘ PHẬN là điểm CHUNG nên
  // cả nhóm mất theo vì một lỗi máy. Bỏ phần về sớm và gắn cờ để người soát.
  if (out !== null && inChieu !== null && out < inChieu && veSom > 0) {
    canhBao.push(`  ${ten} ${r[1]}: giờ out ${r[5]} sớm hơn giờ in chiều ${r[4]} — bỏ ${veSom} phút về sớm`);
    veSom = 0;
    nghiVan = 'GIO_OUT_TRUOC_GIO_IN_CHIEU';
  }

  dong.push({
    nvId, ngay, thu: r[2] || null,
    inSang: r[3] || null, inChieu: r[4] || null, out: r[5] || null,
    tangCa: phut(r[6]),
    diMuon: Number(r[7]) || 0,
    veSom,
    nghi: String(r[9] || '').trim() !== '',
    nghiVan,
  });
}

const sql = [];
sql.push('-- ════════════════════════════════════════════════════════════════════════════');
sql.push(`-- CHẤM CÔNG KỲ ${KY} — sinh tự động bởi scripts/import-cham-cong.mjs`);
sql.push(`-- Nguồn: ${FILE.split('/').pop()}`);
sql.push(`-- Cắt tới hết ngày ${DEN_NGAY} (ngày chưa tới thì chưa ai đi làm, để nguyên sẽ`);
sql.push('-- thành "cả công ty nghỉ" và kéo tụt điểm chuyên cần của mọi người).');
sql.push('-- Chạy lại nhiều lần đều an toàn: on conflict ghi đè theo (nhan_vien_id, ngay).');
sql.push('-- ════════════════════════════════════════════════════════════════════════════');
sql.push('begin;');
sql.push('');

for (const d of dong) {
  sql.push(
    'insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out, '
    + 'tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_van) values ('
    + `'${KY}', ${q(d.nvId)}, '${d.ngay}', ${q(d.thu)}, ${q(d.inSang)}, ${q(d.inChieu)}, ${q(d.out)}, `
    + `${n(d.tangCa)}, ${d.diMuon}, ${d.veSom}, ${d.nghi}, ${q(d.nghiVan)})`
    + ' on conflict (nhan_vien_id, ngay) do update set '
    + 'ky = excluded.ky, thu = excluded.thu, gio_in_sang = excluded.gio_in_sang, '
    + 'gio_in_chieu = excluded.gio_in_chieu, gio_out = excluded.gio_out, '
    + 'tang_ca_phut = excluded.tang_ca_phut, di_muon_phut = excluded.di_muon_phut, '
    + 've_som_phut = excluded.ve_som_phut, nghi = excluded.nghi, nghi_van = excluded.nghi_van;'
  );
}

sql.push('');
sql.push('commit;');
sql.push('');
sql.push('-- KIỂM TRA: mỗi người bao nhiêu ngày, muộn mấy phút, nghỉ mấy ngày.');
sql.push("select nv.name, count(*) so_ngay, sum(c.di_muon_phut) muon_phut,");
sql.push('       sum(c.ve_som_phut) ve_som_phut, count(*) filter (where c.nghi) so_ngay_nghi,');
sql.push('       count(*) filter (where c.nghi_van is not null) dong_nghi_van');
sql.push(`from cham_cong c join nhan_vien nv on nv.id = c.nhan_vien_id`);
sql.push(`where c.ky = '${KY}' group by nv.name order by muon_phut desc;`);

writeFileSync(OUT, sql.join('\n'), 'utf8');

const nguoi = new Set(dong.map(d => d.nvId));
console.log(`✔ Đã sinh ${OUT}`);
console.log(`  ${dong.length} dòng chấm công / ${nguoi.size} nhân viên`);
console.log(`  Bỏ ${boQuaNgaySau} dòng của ngày sau ${DEN_NGAY}`);
if (canhBao.length) {
  console.log(`  ⚠ ${canhBao.length} dòng giờ out ghi sai, đã bỏ phần về sớm:`);
  canhBao.forEach(c => console.log(c));
}
