// Bộ lọc "nhóm" cho tab Lưu xuất (Kho hàng).
//
// VÌ SAO CÓ TỆP NÀY: ô lọc cũ chỉ gửi lên danh sách mã sản phẩm đã tick, chuỗi người
// dùng gõ bị vứt đi. Nên tìm theo mã đơn hàng rồi tick một mã SP thì bảng ra dòng của
// MỌI đơn có mã SP ấy. Ở đây mỗi lần gõ + tick được ghi thành một "nhóm" {tu, ma[]}:
// tick luôn dính liền với từ khoá đã sinh ra nó.
//
// Từ khoá CỐ Ý vẫn khớp cả 3 cột (mã SP / tên SP / mã ĐH) chứ không ép là mã đơn hàng.
// Nếu ép, luồng cũ "gõ F-PP rồi tick F-PP10" sẽ thành ma_don_hang ilike %F-PP% AND
// ma_san_pham = F-PP10 ⇒ 0 dòng, tức là sửa được việc này thì hỏng việc kia.

export const COT_TIM = ['ma_san_pham', 'ten_san_pham', 'ma_don_hang'];

// `, ( ) *` là ký tự phân tách của logic tree PostgREST. Từ khoá do người dùng gõ nên
// phải khử trước khi ghép chuỗi — vừa tránh vỡ truy vấn, vừa chặn đường tiêm bộ lọc.
const khuTuKhoa = (t) => String(t ?? '').replace(/[,()*]/g, ' ').trim();

// Mã SP nằm trong in.("...") nên nguy hiểm thêm ở dấu nháy kép và gạch chéo ngược.
const khuMa = (m) => String(m ?? '').replace(/["\\,()]/g, '').trim();

export function docNhom(value) {
  if (!value) return [];
  let raw;
  try { raw = JSON.parse(value); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(n => n && typeof n === 'object' && !Array.isArray(n))
    .map(n => ({
      tu: typeof n.tu === 'string' ? n.tu : '',
      ma: Array.isArray(n.ma) ? n.ma.filter(x => typeof x === 'string') : [],
    }));
}

export const ghiNhom = (nhom) => JSON.stringify(nhom ?? []);

export const daTick = (nhom, tu) =>
  new Set((nhom ?? []).find(n => n.tu === tu)?.ma ?? []);

// Bật/tắt một mã trong nhóm của từ khoá đang gõ. Trả MẢNG MỚI (không sửa tại chỗ) để
// React nhận ra thay đổi.
export function doiTick(nhom, tu, ma) {
  const ds = (nhom ?? []).map(n => ({ ...n, ma: [...n.ma] }));
  const i = ds.findIndex(n => n.tu === tu);
  if (i === -1) return [...ds, { tu, ma: [ma] }];

  const j = ds[i].ma.indexOf(ma);
  if (j === -1) ds[i].ma.push(ma);
  else ds[i].ma.splice(j, 1);

  // Nhóm không từ khoá mà cũng hết mã thì chẳng lọc gì — bỏ hẳn thay vì để lại thẻ rỗng.
  if (!ds[i].tu && ds[i].ma.length === 0) ds.splice(i, 1);
  return ds;
}

// Bấm Xong: từ khoá đang gõ chưa thành nhóm thì chốt nó thành nhóm "cả đơn".
// CỐ Ý không chốt theo từng phím gõ — nếu không, gõ V / VN / VNA… sẽ đẻ ra nhóm rác.
export function chotCaDon(nhom, tu) {
  const ds = nhom ?? [];
  if (!khuTuKhoa(tu)) return ds;
  if (ds.some(n => n.tu === tu)) return ds;
  return [...ds, { tu, ma: [] }];
}

export const xoaNhom = (nhom, tu) => (nhom ?? []).filter(n => n.tu !== tu);

// Dựng phần trong ngoặc của .or(...) cho supabase-js.
// Mỗi nhóm:
//   có từ khoá + mã : and( or(3 cột ilike), ma_san_pham.in.(...) )
//   chỉ từ khoá     : or(3 cột ilike)                     → cả đơn
//   chỉ mã          : ma_san_pham.in.(...)                → đúng hành vi CŨ
// Đã đo thật 2026-08-05: PostgREST chấp nhận lồng or(and(or(...),in.(...)),or(...)).
export function menhDeLoc(nhom) {
  const ve = [];
  for (const n of nhom ?? []) {
    const tu = khuTuKhoa(n.tu);
    const ma = (n.ma ?? []).map(khuMa).filter(Boolean);
    const dsMa = ma.length ? `ma_san_pham.in.(${ma.map(m => `"${m}"`).join(',')})` : '';
    const orTu = tu ? `or(${COT_TIM.map(c => `${c}.ilike.%${tu}%`).join(',')})` : '';

    if (orTu && dsMa) ve.push(`and(${orTu},${dsMa})`);
    else if (orTu) ve.push(orTu);
    else if (dsMa) ve.push(dsMa);
  }
  return ve.join(',');
}

// Nhãn cho nút lọc ngoài thanh công cụ. LUÔN 1 dòng ngắn — luật giao diện mobile của
// dự án: nút không được xuống dòng 2, không được đẩy thanh công cụ tràn ngang.
export function nhanTomTat(nhom) {
  const ds = nhom ?? [];
  if (ds.length === 0) return '';
  if (ds.length > 1) return `${ds.length} nhóm lọc`;

  const { tu, ma } = ds[0];
  if (!tu) return `${ma.length} SP`;
  const ngan = tu.length > 12 ? `${tu.slice(0, 6)}…${tu.slice(-3)}` : tu;
  return ma.length ? `${ngan} (${ma.length} SP)` : ngan;
}
