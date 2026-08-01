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

// Mặc định là file canonical trên Desktop; truyền đường dẫn khác qua tham số dòng lệnh
// khi cần nạp một bản xuất mới, vd:
//   node scripts/import-cham-cong.mjs "C:/Users/PC/Downloads/Thống kê chấm công T8.2026.xlsx"
const FILE = process.argv[2] || 'C:/Users/PC/Desktop/3. Cải tiến/12. Wepapp/Xử lý bảng chấm công/Thống kê chấm công T7.2026.xlsx';
const SHEET = 'CHI TIẾT THEO NGÀY';

// KỲ và NGÀY CẮT đều SUY RA TỪ CHÍNH FILE, không gõ tay (xem suyRaKyVaNgayCat ở dưới).
//
// Trước đây hai giá trị này gõ cứng ở đây. Hệ quả: nạp file tháng 8 mà quên sửa thì SQL
// sinh ra sẽ `delete from cham_cong where ky = '2026-07'` rồi nạp dữ liệu tháng 8 vào đó —
// xoá sạch tháng 7 và gán nhầm kỳ cho tháng 8, không có lỗi nào báo. Suy ra từ file thì
// không còn cách nào gõ sai.

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

// Suy ra KỲ và NGÀY CẮT từ chính dữ liệu, quét một lượt trước khi xử lý.
//
// NGÀY CẮT = ngày CUỐI CÙNG có ít nhất một người quét vân tay (cột "Giờ in sáng").
// Máy chấm công xuất trọn tháng kể cả ngày chưa tới; những ngày đó không ai có giờ vào.
// Để nguyên thì mỗi ngày như vậy thành một ngày NGHỈ của cả 13 người, mà luật chuyên cần
// trừ 3 điểm mỗi ngày nghỉ vượt phép — nạp nhầm một file xuất giữa tháng là xoá sổ điểm
// chuyên cần của cả công ty.
//
// Quy tắc này tự đúng cho cả hai trường hợp, nên không cần ai nhớ chỉnh:
//   - file xuất giữa tháng  → cắt ở ngày cuối thực sự có người đi làm
//   - file xuất hết tháng   → mọi ngày đều có người đi làm, lấy trọn tháng
function suyRaKyVaNgayCat() {
  const thang = new Map();          // 'YYYY-MM' → số dòng
  let denNgay = null;
  for (let i = hdr + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!String(r[0] || '').trim()) continue;
    const ngay = ngayISO(r[1]);
    if (!ngay) continue;            // dòng ngày hỏng để vòng chính báo lỗi, ở đây bỏ qua
    const k = ngay.slice(0, 7);
    thang.set(k, (thang.get(k) || 0) + 1);
    if (String(r[3] || '').trim() && (denNgay === null || ngay > denNgay)) denNgay = ngay;
  }
  if (!thang.size) throw new Error('File không có dòng dữ liệu nào đọc được.');
  if (!denNgay) throw new Error('Không dòng nào có giờ vào — file rỗng hay sai cột?');

  // Nhiều tháng trong một file là chuyện bất thường (máy xuất lẫn, hoặc chọn sai khoảng).
  // DỪNG chứ không tự chọn tháng nhiều dòng nhất: đoán ở đây là xoá nhầm cả một kỳ.
  if (thang.size > 1) {
    const ds = [...thang.entries()].map(([k, v]) => `${k} (${v} dòng)`).join(', ');
    throw new Error(`File lẫn nhiều tháng: ${ds}. Xuất lại đúng MỘT tháng rồi chạy lại.`);
  }
  return { ky: [...thang.keys()][0], denNgay };
}

const { ky: KY, denNgay: DEN_NGAY } = suyRaKyVaNgayCat();
const OUT = `sql/seed_cham_cong_${KY.replace('-', '_')}.sql`;

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
sql.push(`-- Chạy lại nhiều lần đều an toàn: xoá sạch kỳ ${KY} rồi nạp lại đúng theo file nguồn.`);
sql.push('-- ════════════════════════════════════════════════════════════════════════════');
sql.push('begin;');
sql.push('');
sql.push(`-- Xoá sạch chấm công kỳ ${KY} trước khi nạp lại: đây là bước "bỏ dữ liệu tháng cũ".`);
sql.push('-- Không chỉ dựa vào on-conflict, vì upsert chỉ ghi đè những dòng CÓ trong file mới —');
sql.push('-- người/ngày đã bị gỡ khỏi file (vd nghỉ việc) sẽ còn sót lại nếu không xoá trước.');
sql.push('-- Xoá theo ky là an toàn: cham_cong là bảng lá, KPI tính bằng truy vấn nên không có');
sql.push('-- FK nào tham chiếu vào đây; xoá xong nạp lại trong cùng transaction, hỏng thì rollback.');
sql.push(`delete from cham_cong where ky = '${KY}';`);
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
