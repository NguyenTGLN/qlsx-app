// ============================================================
// QUY TRÌNH — soát lỗi lưu đồ trước khi ban hành.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục E)
//
// LỖI chặn ban hành. CẢNH BÁO chỉ nhắc.
// Hàm này chạy CẢ ở giao diện lẫn trong RPC ban hành phía máy chủ —
// không tin vào việc giao diện đã soát rồi.
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

  const vao = new Set(edges.map(e => e.b));
  const ra  = new Set(edges.map(e => e.a));

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

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = rectOf(nodes[i]), b = rectOf(nodes[j]);
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        them(canhBao, 'CHONG_KHOI', `Khối "${nodes[i].tx}" và "${nodes[j].tx}" đang chồng lên nhau.`, nodes[j].id);
    }
  }

  return { loi, canhBao };
}

export const coTheBanHanh = soDo => kiemTraLuuDo(soDo).loi.length === 0;
