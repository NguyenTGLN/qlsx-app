// Họ tên đầy đủ + luật "Người nhận" in trên phiếu xuất kho (XK / PSX / PDH / PCV).
// Thuần, không phụ thuộc React — để test được và dùng chung cho mọi nơi in phiếu.
//
// Bảng nhân viên (nhan_vien) chỉ lưu tên gọi ngắn ("Hà", "Ngọc"...), trong khi phiếu
// giấy phải ghi ĐỦ HỌ TÊN nên phải map thêm ở đây.

// mã nhân viên -> họ tên đầy đủ (khóa viết thường — tra bằng normKey).
// TODO: ptt (Thơ) và dvx (Xuân) chưa có họ tên đầy đủ — đang tạm in tên gọi.
const FULL_NAME_BY_ID = {
  ntth: 'Nguyễn Thị Thu Hà',
  nvh: 'Nguyễn Văn Hĩu',
  admin: 'Đỗ Hương Nguyên',
  nttd: 'Nguyễn Thị Thùy Dương',
  hhx: 'Hoàng Hà Xuyên',
  nbn: 'Nguyễn Bá Ngọc',
  ndp: 'Nguyễn Đình Phong',
  hangkt: 'Nguyễn Thị Bách Hằng',
  nva: 'Nguyễn Thị Vân Anh',
  nv8: 'Lê Thị Duyên',
  lvb: 'Lê Văn Bích',
  nxt: 'Nguyễn Xuân Thiện',
  vta: 'Vương Tuấn Anh',
  tgd: 'Ninh Văn Giang',
  ptt: 'Thơ',   // TODO: bổ sung họ tên đầy đủ
  dvx: 'Xuân',  // TODO: bổ sung họ tên đầy đủ
};

// tên gọi ngắn (như trong bảng nhan_vien, đã bỏ dấu + viết thường) -> mã nhân viên,
// để tra ngược khi phiếu chỉ lưu tên chứ không lưu mã.
const ID_BY_SHORT_NAME = {
  ha: 'ntth',
  hiu: 'nvh',
  nguyen: 'admin',
  duong: 'nttd',
  xuyen: 'hhx',
  ngoc: 'nbn',
  phong: 'ndp',
  hang: 'hangkt',
  'van anh': 'nva',
  duyen: 'nv8',
  bich: 'lvb',
  thien: 'nxt',
  tuan: 'vta',
  'anh giang': 'tgd',
  giang: 'tgd',
  tho: 'ptt',
  xuan: 'dvx',
};

// Tài khoản mà khi lập phiếu thì người NHẬN hàng là bác Hĩu (kho không tự nhận hàng của mình).
const NHAN_HO_IDS = new Set(['ntth', 'admin']);
const NGUOI_NHAN_THAY = 'Nguyễn Văn Hĩu';

// created_by của phiếu cũ (trước khi app ghi nhận đúng người lập) — coi như không biết.
const UNKNOWN_CREATORS = new Set(['nhan vien', 'unknown', 'user']);

// Bỏ dấu, đổi đ→d, thường hóa — để so khớp mã / tên gọi không phụ thuộc cách gõ.
const normKey = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().trim();

// Chuỗi created_by -> mã nhân viên (nhận cả mã lẫn tên gọi ngắn). Không nhận ra -> ''.
function toStaffId(createdBy) {
  const key = normKey(createdBy);
  if (!key || UNKNOWN_CREATORS.has(key)) return '';
  if (FULL_NAME_BY_ID[key]) return key;
  return ID_BY_SHORT_NAME[key] || '';
}

/** Mã người lập để ghi vào created_by của phiếu; chưa đăng nhập -> '' (không bịa tên). */
export function staffIdOf(user) {
  if (!user) return '';
  return String(user.id || user.name || '').trim();
}

/** Họ tên đầy đủ từ mã nhân viên hoặc tên gọi ngắn; không tra được thì giữ nguyên chuỗi gốc. */
export function resolveHoTen(createdBy) {
  const raw = String(createdBy || '').trim();
  if (!raw) return '';
  const id = toStaffId(raw);
  return id ? FULL_NAME_BY_ID[id] : raw;
}

/**
 * Người nhận in trên phiếu xuất:
 *  - tài khoản Hà hoặc admin lập phiếu  -> Nguyễn Văn Hĩu
 *  - tài khoản khác                     -> chính người lập, ghi đủ họ tên
 *  - phiếu cũ không rõ người lập        -> để trống cho ký tay
 */
export function resolveNguoiNhan(createdBy) {
  const raw = String(createdBy || '').trim();
  if (!raw) return '';
  const id = toStaffId(raw);
  if (!id) return UNKNOWN_CREATORS.has(normKey(raw)) ? '' : raw;
  return NHAN_HO_IDS.has(id) ? NGUOI_NHAN_THAY : FULL_NAME_BY_ID[id];
}
