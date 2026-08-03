// ============================================================
// QUY TRÌNH — hình học & biến đổi sơ đồ lưu đồ swimlane.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
//
// Cột = bộ phận, hàng = giai đoạn. Người thực hiện SUY RA từ cột,
// không lưu trùng ở khối — đổi cột là đổi người, một nguồn sự thật.
//
// Mọi hàm biến đổi trả về SƠ ĐỒ MỚI (bất biến) để hoàn tác chỉ là
// đẩy/rút ngăn xếp, và để test so sánh được trước/sau.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

export const GUT = 112;      // bề ngang cột nhãn giai đoạn
export const LANE_W = 212;   // bề ngang mỗi cột bộ phận
export const HEAD_H = 46;    // chiều cao hàng tiêu đề cột

export const LOAI_KHOI = {
  start: { nhan: 'Bắt đầu',    mau: '#16a34a', w: 164, h: 48 },
  end:   { nhan: 'Kết thúc',   mau: '#475569', w: 164, h: 48 },
  step:  { nhan: 'Thao tác',   mau: '#2563eb', w: 164, h: 56 },
  dec:   { nhan: 'Quyết định', mau: '#d97706', w: 150, h: 86 },
  check: { nhan: 'Kiểm tra',   mau: '#0891b2', w: 164, h: 56 },
  doc:   { nhan: 'Tài liệu',   mau: '#7c3aed', w: 164, h: 56 },
  data:  { nhan: 'Dữ liệu',    mau: '#db2777', w: 164, h: 56 },
};

export const MAU_DUONG = { n: '#64748b', ok: '#16a34a', ng: '#dc2626' };

export const laneX = i => i * LANE_W;
export const nodeX = n => laneX(n.lane) + LANE_W / 2 - n.w / 2 + (n.dx || 0);

export function rectOf(n) {
  const x = nodeX(n);
  return { x, y: n.y, w: n.w, h: n.h, cx: x + n.w / 2, cy: n.y + n.h / 2 };
}

export const drawW = soDo => soDo.lanes.length * LANE_W;
export const drawH = soDo => soDo.phases.reduce((s, p) => s + p.h, 0);
export const phaseTop = (soDo, i) => soDo.phases.slice(0, i).reduce((s, p) => s + p.h, 0);
export const timKhoi = (soDo, id) => soDo.nodes.find(n => n.id === id);

export function phaseOf(soDo, n) {
  let acc = 0;
  for (let i = 0; i < soDo.phases.length; i++) {
    acc += soDo.phases[i].h;
    if (n.y + n.h / 2 < acc) return i;
  }
  return soDo.phases.length - 1;
}
