// ============================================================
// QUY TRÌNH — soát lỗi lưu đồ trước khi ban hành.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục E)
//
// LỖI chặn ban hành. CẢNH BÁO chỉ nhắc.
//
// PHẠM VI — đọc kỹ trước khi tin vào nó:
// Bộ luật đầy đủ này chạy Ở GIAO DIỆN. RPC ban hành phía máy chủ CHỈ soát
// cấu trúc tối thiểu (có khối Bắt đầu và Kết thúc), cố ý không chép 80 dòng
// luật sang PL/pgSQL để khỏi nuôi hai bản luật lệch nhau.
// Đây KHÔNG phải ranh giới bảo mật: thứ được chặn ở máy chủ là "AI được ban
// hành" (chỉ ADMIN, bằng kiểm tra vai trò + trigger), còn "nội dung có đạt
// không" thì tin Admin. Đừng nhầm hai chuyện đó.
//
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

import { rectOf } from './quyTrinhSoDo';

const trong = v => !String(v ?? '').trim() || String(v).trim() === '—';

export function kiemTraLuuDo(soDo) {
  const loi = [], canhBao = [];
  const nodes = soDo?.nodes || [], edges = soDo?.edges || [];
  const them = (arr, ma, thongDiep, khoiId = null) => arr.push({ ma, thongDiep, khoiId });

  if (!nodes.some(n => n.t === 'start')) them(loi, 'THIEU_BAT_DAU', 'Lưu đồ chưa có khối Bắt đầu.');
  if (!nodes.some(n => n.t === 'end'))   them(loi, 'THIEU_KET_THUC', 'Lưu đồ chưa có khối Kết thúc.');

  // Chỉ tính đường nối mà CẢ hai đầu còn tồn tại. Đường trỏ tới khối đã xoá
  // không được tính là "đã có đường ra" — nếu không nó che mất lỗi thật.
  const coThat = new Set(nodes.map(n => n.id));
  const canh = edges.filter(e => coThat.has(e.a) && coThat.has(e.b));
  const vao = new Set(canh.map(e => e.b));
  const ra  = new Set(canh.map(e => e.a));

  for (const n of nodes) {
    if (n.t !== 'start' && !vao.has(n.id))
      them(loi, 'KHONG_CO_DUONG_VAO', `Khối "${n.tx}" không có đường nối đi vào.`, n.id);
    if (n.t !== 'end' && !ra.has(n.id))
      them(loi, 'KHONG_CO_DUONG_RA', `Khối "${n.tx}" không có đường nối đi ra.`, n.id);

    if (n.t === 'dec') {
      const nhanh = edges.filter(e => e.a === n.id);
      if (nhanh.length < 2)
        them(loi, 'QUYET_DINH_THIEU_NHANH', `Khối quyết định "${n.tx}" phải có ít nhất 2 nhánh ra.`, n.id);
      for (const e of nhanh) {
        if (trong(e.lbl))
          them(loi, 'NHANH_THIEU_NHAN', `Một nhánh của "${n.tx}" chưa có nhãn (OK / NG / Đủ / Thiếu…).`, n.id);
      }
    }

    if (n.t !== 'start' && n.t !== 'end') {
      if (trong(n.desc))
        them(loi, 'THIEU_DIEN_GIAI', `Bước "${n.tx}" chưa có diễn giải chi tiết.`, n.id);
      if (trong(n.form))
        them(canhBao, 'THIEU_HO_SO', `Bước "${n.tx}" chưa ghi hồ sơ / biểu mẫu.`, n.id);
      if (trong(n.time))
        them(canhBao, 'THIEU_THOI_GIAN', `Bước "${n.tx}" chưa ghi thời gian chuẩn.`, n.id);
    }
  }

  // Đảo hoang: khối nối vòng với nhau nhưng không đi tới được từ Bắt đầu.
  // Bậc vào/bậc ra không bắt được vì hai khối trỏ lẫn nhau là đủ thoả cả hai.
  // Chỉ soát khi CÓ khối Bắt đầu, không thì mọi khối đều "không tới được"
  // và người dùng lãnh một trận lỗi vô nghĩa chồng lên THIEU_BAT_DAU.
  if (nodes.some(n => n.t === 'start')) {
    const keSau = new Map();
    for (const e of canh) {
      if (!keSau.has(e.a)) keSau.set(e.a, []);
      keSau.get(e.a).push(e.b);
    }
    const toiDuoc = new Set(nodes.filter(n => n.t === 'start').map(n => n.id));
    const hangDoi = [...toiDuoc];
    while (hangDoi.length) {
      for (const ke of keSau.get(hangDoi.shift()) || []) {
        if (!toiDuoc.has(ke)) { toiDuoc.add(ke); hangDoi.push(ke); }
      }
    }
    for (const n of nodes) {
      if (!toiDuoc.has(n.id))
        them(loi, 'KHONG_TOI_DUOC', `Khối "${n.tx}" không đi tới được từ khối Bắt đầu.`, n.id);
    }
  }

  const daBao = new Set();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (daBao.has(nodes[j].id)) continue;
      const a = rectOf(nodes[i]), b = rectOf(nodes[j]);
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        daBao.add(nodes[j].id);
        them(canhBao, 'CHONG_KHOI', `Khối "${nodes[i].tx}" và "${nodes[j].tx}" đang chồng lên nhau.`, nodes[j].id);
      }
    }
  }

  return { loi, canhBao };
}

export const coTheBanHanh = soDo => kiemTraLuuDo(soDo).loi.length === 0;
