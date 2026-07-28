// Lọc & sắp xếp danh sách Lệnh Sản Xuất cho màn hình công nhân.
//
// Tách khỏi WorkerDashboard vì đây là phần dễ sai nhất: "hoàn thành" của một lệnh
// KHÔNG chỉ nằm ở cột `status` — thực tế toàn bộ phiếu trong DB đang mang status
// 'pending', cái quyết định là đã báo cáo đủ sản lượng hay chưa (produced >= target).
// Chỉ dựa vào `status` thì tab "Đã hoàn thành" sẽ luôn rỗng.

export const BO_LOC = {
  TAT_CA: 'tat_ca',
  DANG_LAM: 'dang_lam',
  HOAN_THANH: 'hoan_thanh',
};

// Nhãn cố tình NGẮN. 3 nút chia đều bề ngang điện thoại: máy 375px mỗi nút chỉ được
// ~110px, máy 320px còn ~92px — chừa cho chữ khoảng 58px. Đo thực tế: "Đã hoàn thành"
// và "Đang thực hiện" cần ~90px nên luôn bị tràn hoặc phải xuống 2 dòng.
// Luật của dự án là chữ trên nút LUÔN 1 dòng ⇒ rút gọn chữ, KHÔNG hạ cỡ chữ xuống
// nữa (điện thoại dùng ngoài xưởng, dưới ~10px là không đọc nổi).
export const NHAN_BO_LOC = [
  { key: BO_LOC.TAT_CA, label: 'Tất cả' },
  { key: BO_LOC.HOAN_THANH, label: 'Hoàn thành' },
  { key: BO_LOC.DANG_LAM, label: 'Đang làm' },
];

// Sản lượng đã báo cáo của một lệnh = tổng actual_quantity của các production_logs.
export function tinhDaLam(order) {
  return (order?.production_logs || []).reduce(
    (tong, log) => tong + (parseFloat(log?.actual_quantity) || 0),
    0
  );
}

// Gắn thêm produced / remaining / xong cho mỗi lệnh, giữ nguyên các trường gốc.
export function gomTienDo(orders = []) {
  return orders.map(order => {
    const produced = tinhDaLam(order);
    const remaining = (parseFloat(order?.target_quantity) || 0) - produced;
    // Dùng ngưỡng nhỏ thay vì `<= 0`: target/actual là numeric, cộng dồn số lẻ
    // (vd 5340.733333…) nên phần dư có thể là 1e-13 chứ không tròn 0.
    return { ...order, produced, remaining, xong: remaining < 0.0001 };
  });
}

// Lệnh đã bị huỷ không thuộc tab nào — không phải việc để làm, cũng không phải việc đã xong.
const conHieuLuc = o => o?.status !== 'cancelled';

export function locPhieuSanXuat(orders = [], boLoc = BO_LOC.TAT_CA) {
  const ds = gomTienDo(orders).filter(conHieuLuc);

  const theoBoLoc =
    boLoc === BO_LOC.DANG_LAM ? ds.filter(o => !o.xong && o.status !== 'completed')
    : boLoc === BO_LOC.HOAN_THANH ? ds.filter(o => o.xong || o.status === 'completed')
    : ds;

  // Mới tạo nhất lên đầu. So sánh trên timestamp; dòng thiếu created_at xuống cuối
  // thay vì nhảy lên đầu do NaN.
  return theoBoLoc.sort((a, b) => {
    const ta = Date.parse(a?.created_at) || 0;
    const tb = Date.parse(b?.created_at) || 0;
    return tb - ta;
  });
}

// Số đếm cho từng nút lọc — tính một lần rồi hiển thị, tránh gọi lọc 3 lần khi render.
export function demTheoBoLoc(orders = []) {
  const ds = gomTienDo(orders).filter(conHieuLuc);
  const hoanThanh = ds.filter(o => o.xong || o.status === 'completed').length;
  return {
    [BO_LOC.TAT_CA]: ds.length,
    [BO_LOC.HOAN_THANH]: hoanThanh,
    [BO_LOC.DANG_LAM]: ds.length - hoanThanh,
  };
}
