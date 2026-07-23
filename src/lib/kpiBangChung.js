// Hàm thuần dựng dữ liệu cho màn hình Bảng chấm chung. KHÔNG import supabase —
// cùng nếp với kpiEngine.js, để test được không cần DOM lẫn mạng.
//
// "Chấm chung" ở đây = chấm ở MỘT MÀN HÌNH chung, mỗi người vẫn có điểm riêng.
// Đừng lẫn với cap_do='BO_PHAN' (một điểm dùng cho cả bộ phận) — hai cơ chế khác nhau,
// mọi hàm dưới đây đều bỏ qua dòng BO_PHAN.

// Khoá gom nhóm một chỉ tiêu. Ưu tiên `ma`; chưa chạy migration thì lùi về `ten` để
// màn hình vẫn chạy được thay vì gom tất cả vào một nhóm `null`.
export const khoaChiTieu = ct => ct.ma || ct.ten;

// Danh sách nhân viên = các cột của bảng, sắp theo tên hiển thị.
export function dsNhanVienChamChung(rows = [], users = []) {
  const ids = [];
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || !r.nhan_vien_id) continue;
    if (!ids.includes(r.nhan_vien_id)) ids.push(r.nhan_vien_id);
  }
  return ids
    .map(id => {
      const u = users.find(x => x.id === id);
      return { id, ten: u?.name || id, avatar: u?.avatar };
    })
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}
