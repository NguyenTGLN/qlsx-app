// Luật chấm KPI TỰ ĐỘNG từ dữ liệu app. Hàm thuần, KHÔNG import supabase.
//
// Điểm tự động KHÔNG ghi xuống DB mà tính lúc hiển thị: ghi xuống thì số cũ nằm lại khi công
// việc đổi trạng thái, phải có người nhớ bấm nút mỗi tháng, và phải phân xử điểm tay với điểm
// tự động cái nào đè cái nào. Tính live thì con số luôn khớp bảng công việc.
//
// Thêm luật mới = thêm một entry vào LUAT_TU_DONG, khoá là `ma` của chỉ tiêu. Không phải sửa
// engine, màn hình, Excel hay bản in.
import { memberIds, laTre } from './taskAssignees';

export const NGUON_TU_DONG = 'TU_DONG';

// Bỏ dấu + hạ thường: tên việc gõ tay nên 'KĨ' với 'KỸ' phải khớp như nhau.
//
// 'ĩ' và 'ỹ' không cùng gốc — bỏ dấu xong 'kĩ' ra 'ki' còn 'kỹ' ra 'ky', vẫn lệch chữ cái gốc
// (i/y là quy ước chính tả cũ/mới của tiếng Việt, không phải cùng một chữ khác dấu). Phải gộp
// thêm 'y' về 'i' mới coi hai cách viết là một, và phải gộp CẢ HAI phía so sánh như nhau.
const khongDau = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd')
  .replace(/y/gi, 'i')
  .toLowerCase();

const TU_KHOA_VIDEO = khongDau('quay video kỹ thuật');

// Việc tính cho một người trong một kỳ: tạo trong tháng đó, có tên trong nhóm, chưa huỷ.
//
// Cắt tháng theo GIỜ MÁY (giờ Việt Nam với người dùng thật), không cắt bằng chuỗi ISO: việc
// tạo 06:00 ngày 01/08 giờ VN là 23:00 ngày 31/07 giờ UTC, cắt bằng chuỗi sẽ xếp nhầm sang
// tháng 7 và người đó lãnh một việc không phải của tháng mình.
export function viecTrongThang(tasks = [], nvId, ky) {
  const [nam, thang] = String(ky || '').split('-').map(Number);
  if (!nam || !thang) return [];
  return (tasks || []).filter(t => {
    if (!t || t.status === 'CANCELLED' || !t.created_date) return false;
    if (!memberIds(t).includes(nvId)) return false;
    const d = new Date(t.created_date);
    return d.getFullYear() === nam && d.getMonth() + 1 === thang;
  });
}

const MAX_TEN_TRE = 5;

// Đúng hạn = đã xong VÀ không xong muộn. Việc chưa xong tính là không đúng hạn — nếu không,
// để việc treo mãi lại thành có lợi hơn làm xong muộn.
const dungHan = t => t.status === 'COMPLETED' && !laTre(t);

function luatHoanThanhDungHan(ct, viec) {
  if (!viec.length) {
    return { tiLe: 1, ghiChu: 'Tự động: không có việc nào được giao trong tháng — tính đủ điểm.' };
  }
  const dat = viec.filter(dungHan);
  const tre = viec.filter(t => !dungHan(t));
  const tiLe = dat.length / viec.length;

  // Cắt danh sách tên việc trễ: ô ghi chú nằm trong một ô bảng, liệt kê 30 việc là vỡ bảng.
  const ten = tre.slice(0, MAX_TEN_TRE).map(t => t.title || t.id).join(', ');
  const them = tre.length > MAX_TEN_TRE ? ` …và ${tre.length - MAX_TEN_TRE} việc nữa` : '';
  const phanTre = tre.length ? ` Chưa đúng hạn: ${ten}${them}.` : '';

  return {
    tiLe,
    ghiChu: `Tự động: ${dat.length}/${viec.length} việc đúng hạn (${Math.round(tiLe * 100)}%).${phanTre}`,
  };
}

function luatVideoKyThuat(ct, viec) {
  const video = viec.filter(t => khongDau(t.title).includes(TU_KHOA_VIDEO));

  // Không tìm thấy việc → `tiLe = null` nghĩa là KHÔNG CHẤM, khác hẳn chấm 0 điểm.
  // Chấm 0 cho việc chủ app chưa kịp tạo là oan cho nhân viên.
  if (!video.length) {
    return { tiLe: null, ghiChu: 'Chưa tạo việc quay video tháng này — chưa có căn cứ chấm.' };
  }

  const tung = video.map(t => (t.status !== 'COMPLETED' ? 0 : laTre(t) ? 0.5 : 1));
  const tiLe = tung.reduce((a, b) => a + b, 0) / video.length;

  const ghiChu = video.length === 1
    ? (tiLe === 1 ? 'Tự động: quay video đúng hạn — đủ điểm.'
      : tiLe === 0.5 ? 'Tự động: quay video xong nhưng trễ hạn — 50% điểm.'
      : 'Tự động: chưa hoàn thành việc quay video — 0 điểm.')
    : `Tự động: ${video.length} việc quay video trong tháng, trung bình ${Math.round(tiLe * 100)}% điểm.`;

  return { tiLe, ghiChu };
}

// Việc báo cáo cuối ngày. Khớp bằng HAI MẢNH rời chứ không phải cả cụm: tên thật trong app
// đang là 'Báo cáo công việc cuối ngày', nhưng chủ app gọi nó là 'Báo cáo kết quả công việc
// cuối ngày'. Khớp cả cụm thì chỉ cần lệch một chữ là chỉ tiêu tụt về 0 điểm mà không ai hiểu
// vì sao — mà chấm oan thì tệ hơn nhiều so với khớp rộng một chút.
const MANH_BAO_CAO = [khongDau('báo cáo'), khongDau('cuối ngày')];
const laBaoCaoCuoiNgay = t => {
  const k = khongDau(t.title);
  return MANH_BAO_CAO.every(m => k.includes(m));
};

// Ngày dạng 'dd/MM' để ghi chú nói được NGÀY NÀO chưa báo cáo. Việc báo cáo cuối ngày lặp
// hằng ngày nên tên chúng giống hệt nhau — liệt kê tên thì được một dãy chữ trùng lặp vô
// nghĩa, phải liệt kê ngày mới tra ra được.
const ngayNgan = t => {
  const d = t.due_date || t.created_date;
  if (!d) return null;
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
};

function luatBaoCaoCuoiNgay(ct, viec) {
  const bc = viec.filter(laBaoCaoCuoiNgay);

  // Chưa tạo việc → KHÔNG chấm (tiLe null), không chấm 0. Cùng lý do như việc quay video.
  if (!bc.length) {
    return { tiLe: null, ghiChu: 'Chưa có việc báo cáo cuối ngày nào trong tháng — chưa có căn cứ chấm.' };
  }

  // Tính theo TỈ LỆ HOÀN THÀNH (chủ app chốt), không theo đúng hạn: báo cáo nộp muộn vẫn là
  // đã báo cáo. Muốn siết theo đúng hạn thì đổi `xong` sang dùng laTre() như luật bên trên.
  const xong = bc.filter(t => t.status === 'COMPLETED');
  const thieu = bc.filter(t => t.status !== 'COMPLETED');
  const tiLe = xong.length / bc.length;

  const ngay = thieu.slice(0, MAX_TEN_TRE).map(ngayNgan).filter(Boolean).join(', ');
  const them = thieu.length > MAX_TEN_TRE ? ` …và ${thieu.length - MAX_TEN_TRE} ngày nữa` : '';
  const phanThieu = thieu.length ? ` Chưa làm: ${ngay}${them}.` : '';

  return {
    tiLe,
    ghiChu: `Tự động: ${xong.length}/${bc.length} báo cáo cuối ngày đã hoàn thành (${Math.round(tiLe * 100)}%).${phanThieu}`,
  };
}

// Bảng đăng ký luật, khoá theo `ma` của chỉ tiêu.
export const LUAT_TU_DONG = {
  HT_CONG_VIEC_DUNG_HAN: luatHoanThanhDungHan,
  VIDEO_KY_THUAT: luatVideoKyThuat,
  BC_KET_QUA_CONG_VIEC: luatBaoCaoCuoiNgay,
};

const homNay = () => new Date().toISOString().slice(0, 10);

// Chèn kết quả chấm tự động vào dữ liệu TRƯỚC khi engine chạy. Trả về BẢN SAO của rows/logs,
// không sửa mảng gốc.
//
// Với mỗi dòng chỉ tiêu có luật:
//   - gán `diem_chot` = chỉ tiêu × tỉ lệ (engine đã biết diem_chot thắng mọi đường tính khác)
//   - thêm MỘT dòng nhật ký ẢO `so_diem = 0` chở lời giải thích.
//
// Dòng ảo là mẹo đã dùng ở bảng chấm chung: `so_diem = 0` nên không đụng phép tính, chỉ chở
// chữ. Nhờ nó, diễn giải tự chảy ra cột ghi chú, popup bấm vào điểm, file Excel và bản in mà
// không phải sửa engine, màn hình hay phần xuất.
//
// ⚠ Dòng ảo có id 'ao-…' và KHÔNG BAO GIỜ được ghi xuống DB. Mọi chỗ ghi nhật ký đều đi qua
// form riêng, không lấy từ mảng này.
export function apDungChamTuDong(rows = [], logs = [], tasks = [], ky, ngay = homNay()) {
  const rowsMoi = [];
  const logsAo = [];

  for (const r of rows || []) {
    const luat = LUAT_TU_DONG[r?.ma];
    if (!luat || r.cap_do === 'BO_PHAN' || !r.nhan_vien_id) { rowsMoi.push(r); continue; }

    const kq = luat(r, viecTrongThang(tasks, r.nhan_vien_id, ky));
    // tiLe = null → KHÔNG chấm: giữ nguyên đường tính cũ, chỉ kèm lời giải thích.
    rowsMoi.push(kq.tiLe == null ? r : { ...r, diem_chot: (r.chi_tieu ?? 0) * kq.tiLe });
    logsAo.push({
      id: `ao-${r.id}`, chi_tieu_id: r.id, ngay,
      so_diem: 0, ly_do: kq.ghiChu, nguon: NGUON_TU_DONG, nguoi_ghi: null,
    });
  }

  return { rows: rowsMoi, logs: [...(logs || []), ...logsAo] };
}

// Dòng nhật ký này là dòng ảo do chấm tự động sinh ra, hay dòng thật nằm trong DB?
//
// Phải phân biệt ở mọi chỗ NÓI VỀ dữ liệu thật: đếm nhật ký sẽ mất khi xoá chỉ tiêu, đếm số
// bằng chứng đã ghi, hay bất cứ câu nào hứa hẹn với người dùng về cái đang nằm trong DB.
// Đếm nhầm dòng ảo vào đó là dọa người ta mất một bằng chứng vốn không tồn tại.
export const laDongAo = l => typeof l?.id === 'string' && l.id.startsWith('ao-');
