// Quét tên chỉ tiêu (cột B) của mọi nhân viên trong file KPI, gom những tên "cùng nội dung
// nhưng khác ký tự" (dấu, hoa/thường, khoảng trắng, dấu câu) — thứ làm map tự động bị trượt.
// Chạy: node scripts/kiem-ten-chi-tieu.mjs
import XLSX from 'xlsx';

const FILE = 'KPI/Copy of KPI kho 06.2026.xls';
const BO_QUA = ['KPI T9 - BH - NB Ngọc', 'KPI T12 - KTSX', 'ĐỨC'];

// Chuẩn hoá về "khoá nội dung": bỏ dấu tiếng Việt, hạ thường, bỏ mọi ký tự không phải chữ/số,
// gộp khoảng trắng. Hai tên khác nhau về khoá này = khác nội dung; cùng khoá mà khác bản gốc
// = cùng nội dung, lệch ký tự.
function khoa(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // bỏ dấu tiếng Việt
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');                           // bỏ HẾT dấu câu VÀ khoảng trắng
}

const wb = XLSX.readFile(FILE);
// Map khoá -> Map(tênGốc -> [danh sách sheet])
const nhom = new Map();

for (const sheet of wb.SheetNames) {
  if (BO_QUA.includes(sheet)) continue;
  const ws = wb.Sheets[sheet];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const val = (r, c) => { const x = ws[XLSX.utils.encode_cell({ r, c })]; return x ? x.v : undefined; };
  const laSo = (r, c) => { const x = ws[XLSX.utils.encode_cell({ r, c })]; return x && typeof x.v === 'number' && !x.f; };

  let hdr = -1;
  for (let R = range.s.r; R <= range.e.r; R++) {
    if (String(val(R, 2) ?? '').trim() === 'Chỉ tiêu KPI') { hdr = R; break; }
  }
  if (hdr < 0) continue;

  for (let R = hdr + 2; R <= range.e.r; R++) {
    const ten = val(R, 1);
    const nhanNhom = val(R, 0);
    // bỏ dòng nhóm (A. .../B. ...)
    if (!laSo(R, 6) && !laSo(R, 7) && typeof nhanNhom === 'string' && /^\s*[A-F]\./.test(nhanNhom)) continue;
    if (!ten) continue;
    const tenS = String(ten).replace(/\s+/g, ' ').trim();
    if (!tenS) continue;
    const k = khoa(tenS);
    if (!nhom.has(k)) nhom.set(k, new Map());
    const g = nhom.get(k);
    if (!g.has(tenS)) g.set(tenS, []);
    g.get(tenS).push(sheet.trim());
  }
}

// 1) Các nhóm CÓ lệch ký tự (cùng khoá, >1 bản gốc)
console.log('═══ CÙNG NỘI DUNG NHƯNG LỆCH KÝ TỰ ═══\n');
let soNhomLech = 0;
for (const [, variants] of [...nhom].sort((a, b) => b[1].size - a[1].size)) {
  if (variants.size < 2) continue;
  soNhomLech++;
  const arr = [...variants];
  for (const [ten, sheets] of arr) {
    console.log(`  "${ten}"`);
    console.log(`       ↳ ${sheets.length} người: ${sheets.join(', ')}`);
  }
  console.log('  ' + '─'.repeat(60));
}
if (!soNhomLech) console.log('  (không có nhóm nào lệch ký tự thuần tuý)\n');

// 2) Toàn bộ tên chỉ tiêu riêng biệt (để soi trùng nghĩa/viết tắt bằng mắt)
console.log(`\n═══ TOÀN BỘ ${nhom.size} TÊN CHỈ TIÊU (gộp theo nội dung) ═══\n`);
const dsSap = [...nhom].map(([, v]) => {
  const tong = [...v.values()].reduce((s, a) => s + a.length, 0);
  const ten = [...v.keys()][0];
  return { ten, tong, soBan: v.size };
}).sort((a, b) => b.tong - a.tong);
for (const x of dsSap) {
  const co = x.soBan > 1 ? ` ⚠ ${x.soBan} biến thể` : '';
  console.log(`  ${String(x.tong).padStart(2)}×  ${x.ten}${co}`);
}
console.log(`\nTổng: ${nhom.size} nội dung riêng biệt, ${soNhomLech} nhóm đang lệch ký tự.`);
