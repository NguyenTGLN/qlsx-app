// Màn hình đầu tiên khi mở app (route '/').
//
// Hàm THUẦN, tách khỏi component để test được mà không cần dựng router.
// Component dùng nó: components/DiemDenDauTien.jsx
//
// Trước 04/08/2026 route '/' là <Navigate to="/home"> gõ cứng — không đọc được
// người đăng nhập nên không phân biệt được ai.

import { canSeeTab, withMigratedPerms } from './permRegistry';

export function chonDiemDen(user) {
  if (!user) return '/login';
  // ADMIN phải hỏi TRƯỚC canSeeTab: hàm đó trả true cho mọi tab của ADMIN, nên hỏi
  // sau thì quản trị viên cũng bị đẩy sang bảng tin cá nhân — đúng thứ đã chốt là
  // KHÔNG đổi với tài khoản admin.
  if (user.role === 'ADMIN') return '/home';
  // Chuyển quyền cũ TẠI ĐÂY, đừng tin người gọi đã chuyển: Login.jsx dùng giá trị
  // `login()` trả về, mà giá trị đó là bản THÔ (AuthContext chỉ chuyển bản đưa vào
  // state). Đo 04/08/2026 — `TGD` mang `view_tasks: true`, 0 khoá `tab.*`: đọc thô
  // thì đẩy họ về /home, đọc đã chuyển thì họ vào bảng tin và thấy khối Công việc.
  const u = withMigratedPerms(user);
  // Không có khối nào để hiện thì đừng bắt người ta nhìn màn hình trống rồi bấm
  // thêm một nhát — đi thẳng /home như hôm nay.
  const coKhoi = canSeeTab(u, 'tasks', 'kpi') || canSeeTab(u, 'tasks', 'tasks');
  return coKhoi ? '/ca-nhan' : '/home';
}
