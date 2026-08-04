// ============================================================
// QUY TRÌNH — sơ đồ → chuỗi SVG.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// Một nguồn duy nhất cho: xuất PNG dán xưởng, ảnh nhúng vào .docx, và bản in.
// Dùng lại đúng các hàm hình học của trình vẽ nên ảnh xuất ra KHỚP với
// những gì người dùng thấy trên màn hình.
// Module thuần: trả về CHUỖI, không đụng DOM — nên test được ở môi trường node.
// ============================================================

import {
  GUT, LANE_W, HEAD_H, LOAI_KHOI, MAU_DUONG, MAU_DAI,
  rectOf, drawW, drawH, phaseTop, routeEdge, daiBuoc,
} from './quyTrinhSoDo';

/** Thoát ký tự cho cả SVG lẫn DOCX. & phải thay TRƯỚC, nếu không sinh &amp;lt;. */
export function thoatXml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Toạ độ đưa vào SVG phải là SỐ. Chuỗi lọt vào đây là chèn được thẻ vào ảnh —
 *  vô hại khi ảnh nạp qua <img> blob, nhưng chết người khi SVG được nhúng thẳng
 *  vào trang bằng dangerouslySetInnerHTML (màn hình Xem trước làm đúng thế).
 *  Giá trị hỏng thành 0 thay vì NaN: khối lệch chỗ còn sửa được, tệp vỡ thì không.
 *
 *  Vì sao cần: thoatXml lo phần CHỮ (tên bước, tên cột, màu, nhãn đường), còn
 *  toạ độ thì trước đây nội suy thẳng vì mặc định là số. so_do là jsonb, không
 *  có ràng buộc kiểu — nhét chuỗi vào n.y / n.h / n.dx / phases[].h là thoát ra
 *  khỏi thuộc tính. Đã đo được <script>, <img onerror>, <foreignObject> lọt vào. */
const so = v => (Number.isFinite(+v) ? +v : 0);

/** Bản sao sơ đồ với mọi ô HÌNH HỌC đã ép về số, dùng cho toàn bộ hàm dựng SVG.
 *
 *  Ép ở NƠI NỘI SUY thôi là KHÔNG ĐỦ — đã đo. Đường nối lấy `d` từ routeEdge,
 *  mà routeEdge dựng chuỗi đó từ chính n.y/n.h của khối; chuỗi độc nằm trong
 *  khối chảy thẳng vào thuộc tính d="…" và so() ở chỗ khác không với tới:
 *      <path d="M106 20 L106 0"><script>alert(1)</script><rect x="0" …/>
 *  Cùng lý do, drawH/phaseTop cộng dồn phases[].h nên đẻ ra cả NaN.
 *  Làm sạch ĐẦU VÀO thì mọi thứ dẫn xuất phía sau đều là số.
 *
 *  Chỉ đụng năm ô toạ độ của khối và chiều cao giai đoạn; chữ, màu, id giữ
 *  nguyên để thoatXml lo. Mảng hỏng vẫn ném lỗi y như trước, không nuốt. */
function soDoSach(soDo) {
  const la = o => (o && typeof o === 'object' && !Array.isArray(o));
  return {
    ...soDo,
    phases: soDo.phases.map(p => (la(p) ? { ...p, h: so(p.h) } : p)),
    nodes: Array.isArray(soDo.nodes)
      ? soDo.nodes.map(n => (la(n)
        ? { ...n, y: so(n.y), w: so(n.w), h: so(n.h), dx: so(n.dx), lane: so(n.lane) }
        : n))
      : soDo.nodes,
  };
}

/** Cắt chữ thành nhiều dòng vừa bề ngang khối (ước lượng 6.4px/ký tự ở cỡ 11.5). */
function catDong(text, beNgang, coChu = 11.5) {
  const max = Math.max(6, Math.floor(beNgang / (coChu * 0.56)));
  const tu = String(text || '').split(/\s+/).filter(Boolean);
  const dong = [];
  let cur = '';
  for (const t0 of tu) {
    let t = t0;
    // Từ dài hơn cả một dòng thì phải cắt, không thì chữ tràn ra khỏi khối
    // và đè sang cột bên cạnh trên bản in.
    while (t.length > max) {
      if (cur) { dong.push(cur); cur = ''; }
      dong.push(t.slice(0, max));
      t = t.slice(max);
    }
    if (!cur) { cur = t; continue; }
    if ((cur + ' ' + t).length <= max) cur += ' ' + t;
    else { dong.push(cur); cur = t; }
  }
  if (cur) dong.push(cur);
  // Cắt còn 3 dòng thì phải cho thấy là đã cắt — một câu lệnh thao tác đọc như
  // thể đã trọn vẹn mà thực ra mất đuôi thì nguy hơn một câu cụt nhìn thấy rõ.
  if (dong.length > 3) {
    const ba = dong.slice(0, 3);
    ba[2] = (ba[2].length > max - 1 ? ba[2].slice(0, max - 1) : ba[2]) + '…';
    return ba;
  }
  return dong;
}

function khoiSvg(n) {
  const T = LOAI_KHOI[n.t], mau = thoatXml(n.color || T.mau);
  // Ép cả sáu ô toạ độ NGAY tại đây. Mọi phép tính phía dưới — điểm của polygon,
  // rect, bán kính bo, vị trí từng tspan — đều dẫn xuất từ r, nên sạch ở đây là
  // sạch toàn bộ khối. Sửa chỗ khác mà quên chỗ này là hở lại.
  const r0 = rectOf(n);
  const r = {
    x: so(r0.x), y: so(r0.y), w: so(r0.w), h: so(r0.h),
    cx: so(r0.cx), cy: so(r0.cy),
  };
  let hinh;
  if (n.t === 'dec') {
    const p = `${r.cx},${r.y} ${r.x + r.w},${r.cy} ${r.cx},${r.y + r.h} ${r.x},${r.cy}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else if (n.t === 'doc') {
    const yb = r.y + r.h * 0.84;
    const p = `${r.x},${r.y} ${r.x + r.w},${r.y} ${r.x + r.w},${yb} ${r.cx},${r.y + r.h} ${r.x},${yb}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else if (n.t === 'data') {
    const d = r.w * 0.11;
    const p = `${r.x + d},${r.y} ${r.x + r.w},${r.y} ${r.x + r.w - d},${r.y + r.h} ${r.x},${r.y + r.h}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else {
    const rx = (n.t === 'start' || n.t === 'end') ? r.h / 2 : 9;
    hinh = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  }

  const dong = catDong(n.tx, r.w - 16);
  const y0 = r.cy - ((dong.length - 1) * 14) / 2;
  const chu = dong
    .map((d, i) => `<tspan x="${r.cx}" y="${y0 + i * 14}">${thoatXml(d)}</tspan>`)
    .join('');

  return `<g data-khoi="${thoatXml(n.id)}">${hinh}`
    + `<text text-anchor="middle" dominant-baseline="middle" font-family="Be Vietnam Pro, Segoe UI, sans-serif"`
    + ` font-size="11.5" font-weight="600" fill="#0f172a">${chu}</text></g>`;
}

export function soDoSangSvg(soDoVao, { tyLe = 1 } = {}) {
  // Ép toạ độ NGAY ở cửa vào — xem chú thích soDoSach. Mọi chỗ dưới đây, kể cả
  // routeEdge, chỉ còn thấy số.
  const soDo = soDoSach(soDoVao);
  const W = so(GUT + drawW(soDo)), H = so(HEAD_H + drawH(soDo));
  const p = [];

  p.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);

  // Dải bước — mỗi bước một hàng, suy ra từ chỗ khối đang đứng (daiBuoc), y hệt
  // trình vẽ. Đẩy vào NGAY SAU nền trắng nên nằm dưới cùng: dưới vạch giai đoạn,
  // dưới vạch cột, dưới đường nối và khối. Vạch nét liền màu nhạt hơn hẳn vạch
  // giai đoạn (nét đứt, đậm hơn) — giai đoạn là cấu trúc lớn, dải bước chỉ chia
  // nhỏ bên trong nó. Bản in A3 là lý do có tính năng này, nên nó phải có mặt ở
  // ĐÂY chứ không riêng trên màn hình.
  const rongVe = so(drawW(soDo));
  daiBuoc(soDo).forEach((d, i) => {
    const y1 = so(HEAD_H + d.y1), y2 = so(HEAD_H + d.y2);
    // Math.max(0, …): rect cao âm là lỗi theo chuẩn SVG, Word bỏ luôn cả ảnh.
    if (i % 2) {
      p.push(`<rect x="${GUT}" y="${y1}" width="${rongVe}" height="${Math.max(0, y2 - y1)}"`
        + ` fill="${MAU_DAI.nen}"/>`);
    }
    if (i) p.push(`<line x1="${GUT}" y1="${y1}" x2="${W}" y2="${y1}" stroke="${MAU_DAI.vach}"/>`);
  });

  // Tiêu đề cột
  p.push(`<rect x="0" y="0" width="${GUT}" height="${HEAD_H}" fill="#f7f9fc"/>`);
  p.push(`<text x="${GUT / 2}" y="${HEAD_H / 2}" text-anchor="middle" dominant-baseline="middle"`
    + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="10" font-weight="800" fill="#94a3b8">GIAI ĐOẠN</text>`);
  soDo.lanes.forEach((l, i) => {
    const x = GUT + i * LANE_W;
    p.push(`<rect x="${x}" y="0" width="${LANE_W}" height="${HEAD_H}" fill="#ffffff" stroke="#dfe6ef"/>`);
    const mauCot = thoatXml(l.color || '#64748b');
    p.push(`<rect x="${x}" y="${HEAD_H - 2}" width="${LANE_W}" height="2" fill="${mauCot}"/>`);
    p.push(`<text x="${x + LANE_W / 2}" y="${HEAD_H / 2}" text-anchor="middle" dominant-baseline="middle"`
      + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="${mauCot}">${thoatXml(l.name)}</text>`);
  });

  // Nhãn giai đoạn + vạch ngăn
  soDo.phases.forEach((ph, i) => {
    const y = so(HEAD_H + phaseTop(soDo, i));
    const phH = so(ph.h);
    p.push(`<rect x="0" y="${y}" width="${GUT}" height="${phH}" fill="#f7f9fc" stroke="#dfe6ef"/>`);
    catDong(ph.name, GUT - 12, 11.5).forEach((d, k, arr) => {
      const cy = so(y + phH / 2 - ((arr.length - 1) * 13) / 2 + k * 13);
      p.push(`<text x="${GUT / 2}" y="${cy}" text-anchor="middle" dominant-baseline="middle"`
        + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="11.5" font-weight="700" fill="#475569">${thoatXml(d)}</text>`);
    });
    if (i) p.push(`<line x1="${GUT}" y1="${y}" x2="${W}" y2="${y}" stroke="#d6dee9" stroke-dasharray="4 4"/>`);
  });

  // Vạch dọc giữa các cột
  soDo.lanes.forEach((l, i) => {
    const x = GUT + i * LANE_W;
    p.push(`<line x1="${x}" y1="${HEAD_H}" x2="${x}" y2="${H}" stroke="#dfe6ef"/>`);
  });

  // Mũi tên
  const marker = Object.entries(MAU_DUONG).map(([k, c]) =>
    `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">`
    + `<path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');

  // Đường nối + khối, đặt trong nhóm dịch theo gutter/header
  const trong = [];
  for (const e of soDo.edges || []) {
    const r = routeEdge(soDo, e);
    if (!r) continue;                       // đường trỏ tới khối đã xoá
    const c = MAU_DUONG[e.k] || MAU_DUONG.n;
    trong.push(`<g data-noi="${thoatXml(e.id)}">`
      + `<path d="${r.d}" fill="none" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"`
      + `${e.k === 'ng' ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#ar-${thoatXml(e.k)})"/>`
      + (e.lbl
        ? `<text x="${so(r.nhan[0])}" y="${so(r.nhan[1])}" text-anchor="middle" dominant-baseline="middle"`
          + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="10.5" font-weight="700" fill="${c}"`
          + ` paint-order="stroke" stroke="#fff" stroke-width="4">${thoatXml(e.lbl)}</text>`
        : '')
      + `</g>`);
  }
  for (const n of soDo.nodes || []) trong.push(khoiSvg(n));

  // so() cả ở đây để tyLe hỏng cũng không đẻ ra width="NaN" — Word/trình duyệt
  // gặp NaN trong thuộc tính là bỏ luôn cả ảnh.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${so(Math.round(W * tyLe))}" height="${so(Math.round(H * tyLe))}"`
    + ` viewBox="0 0 ${W} ${H}"><defs>${marker}</defs>${p.join('')}`
    + `<g transform="translate(${GUT},${HEAD_H})">${trong.join('')}</g></svg>`;
}
