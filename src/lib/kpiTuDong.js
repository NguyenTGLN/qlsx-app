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

// Bản ghi sản xuất của một người trong tháng, lấy từ bảng `production_logs`.
//
// `execution_date` là cột DATE (chuỗi 'YYYY-MM-DD') chứ không phải timestamptz, nên cắt tháng
// bằng tiền tố chuỗi là an toàn — không có phần giờ thì không có chuyện lệch múi giờ như
// `created_date` của công việc.
export function sanXuatTrongThang(logs = [], nvId, ky) {
  if (!ky) return [];
  return (logs || []).filter(
    l => l?.worker_id === nvId && String(l.execution_date || '').startsWith(ky));
}

const MAX_TEN_TRE = 5;

// Việc báo cáo cuối ngày. Khớp bằng HAI MẢNH rời chứ không phải cả cụm: tên thật trong app
// đang là 'Báo cáo công việc cuối ngày', nhưng chủ app gọi nó là 'Báo cáo kết quả công việc
// cuối ngày'. Khớp cả cụm thì chỉ cần lệch một chữ là chỉ tiêu tụt về 0 điểm mà không ai hiểu
// vì sao — mà chấm oan thì tệ hơn nhiều so với khớp rộng một chút.
const MANH_BAO_CAO = [khongDau('báo cáo'), khongDau('cuối ngày')];
const laBaoCaoCuoiNgay = t => {
  const k = khongDau(t.title);
  return MANH_BAO_CAO.every(m => k.includes(m));
};

// Hệ số hoàn thành của MỘT việc đã đến lúc chấm (chủ app chốt 24/07/2026):
//   xong đúng hạn = 1 · xong nhưng trễ = 0.5 · quá hạn mà chưa xong = 0.
// Việc chưa xong nhưng CHƯA tới hạn KHÔNG đi qua đây — nó bị loại khỏi cả tử lẫn mẫu (xem dưới).
const heSoHoanThanh = t => (t.status !== 'COMPLETED' ? 0 : laTre(t) ? 0.5 : 1);

// Việc chưa xong mà đã QUÁ HẠN tính tới ngày chấm `ngay` ('YYYY-MM-DD'): so phần ngày của
// due_date với ngay. due 20/07 chấm 23/07 → quá hạn; due 25/07 → chưa tới hạn (chưa chấm).
const quaHanChuaXong = (t, ngay) =>
  t.status !== 'COMPLETED' && !!t.due_date && !!ngay && String(t.due_date).slice(0, 10) < ngay;

const MOT_NGAY = 86400000;

// Vì sao một việc KHÔNG đúng hạn: xong nhưng trễ (kèm trễ bao lâu) hay là chưa xong.
// 'chưa xong' khác hẳn 'xong nhưng trễ' — người đọc cần biết để quyết định làm gì tiếp.
function moTaViecChuaDat(t) {
  if (t.status === 'COMPLETED' && t.due_date && t.completed_date) {
    const treMs = new Date(t.completed_date).getTime() - new Date(t.due_date).getTime();
    if (treMs >= MOT_NGAY) return `trễ ${Math.floor(treMs / MOT_NGAY)} ngày`;
    return `trễ ${Math.max(1, Math.ceil(treMs / 3600000))} giờ`;
  }
  return 'chưa xong';
}

function luatHoanThanhDungHan(ct, viec, sanXuat, chamCong, thanhVien, ngay) {
  // BỎ việc báo cáo cuối ngày: chúng đã có chỉ tiêu BÁO CÁO KẾT QUẢ CÔNG VIỆC chấm riêng, để
  // lại là một việc bị tính điểm hai lần. Nặng hơn thế: báo cáo lặp HẰNG NGÀY nên áp đảo về
  // số lượng (có người 14/17 việc trong tháng là báo cáo), giữ lại thì chỉ tiêu này thực chất
  // chỉ còn đo chuyện báo cáo chứ không đo công việc nữa.
  const dem = viec.filter(t => !laBaoCaoCuoiNgay(t));
  const boBaoCao = viec.length - dem.length;

  // CHỈ chấm việc ĐÃ ĐẾN LÚC phán xét được: đã xong, HOẶC chưa xong nhưng đã quá hạn. Việc
  // chưa xong mà deadline CHƯA qua thì không thể coi là trượt — bỏ khỏi cả tử lẫn mẫu, nếu
  // không người vừa được giao việc dài hạn đã bị kéo tụt điểm oan (chủ app chốt 24/07/2026).
  const tinh = dem.filter(t => t.status === 'COMPLETED' || quaHanChuaXong(t, ngay));
  const chuaToiHan = dem.length - tinh.length;

  const phuChu = [];
  if (boBaoCao) phuChu.push(`không tính ${boBaoCao} báo cáo cuối ngày`);
  if (chuaToiHan) phuChu.push(`bỏ ${chuaToiHan} việc chưa tới hạn`);

  if (!tinh.length) {
    const vi = phuChu.length ? ` (${phuChu.join(', ')})` : '';
    return { tiLe: 1, ghiChu: `Tự động: chưa có việc nào đến hạn chấm trong tháng${vi} — tính đủ điểm.` };
  }

  // Tỉ lệ = trung bình HỆ SỐ (1 / 0.5 / 0), không phải đếm nhị phân đạt/không.
  const tong = tinh.reduce((s, t) => s + heSoHoanThanh(t), 0);
  const tiLe = tong / tinh.length;

  // Việc chưa đạt trọn (hệ số < 1): xong trễ (0.5) hoặc quá hạn chưa xong (0). Ghi rõ lý do + hệ số.
  const moTa = t => t.status === 'COMPLETED'
    ? `${t.title || t.id} (${moTaViecChuaDat(t)}, hệ số 0.5)`
    : `${t.title || t.id} (quá hạn chưa xong, hệ số 0)`;
  const mat = tinh.filter(t => heSoHoanThanh(t) < 1);
  // Cắt danh sách: ô ghi chú nằm trong một ô bảng, liệt kê 30 việc là vỡ bảng.
  const ten = mat.slice(0, MAX_TEN_TRE).map(moTa).join('; ');
  const them = mat.length > MAX_TEN_TRE ? ` …và ${mat.length - MAX_TEN_TRE} việc nữa` : '';
  const phanMat = mat.length ? ` Chưa đạt: ${ten}${them}.` : '';
  const phanPhu = phuChu.length ? `, ${phuChu.join(', ')}` : '';

  return {
    tiLe,
    ghiChu: `Tự động: đạt ${Math.round(tiLe * 100)}% trên ${tinh.length} việc đến hạn${phanPhu}.${phanMat}`,
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

// Ngày dạng 'dd/MM' để ghi chú nói được NGÀY NÀO chưa báo cáo. Việc báo cáo cuối ngày lặp
// hằng ngày nên tên chúng giống hệt nhau — liệt kê tên thì được một dãy chữ trùng lặp vô
// nghĩa, phải liệt kê ngày mới tra ra được.
const ngayNgan = t => {
  const d = t.due_date || t.created_date;
  if (!d) return null;
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
};

function luatBaoCaoCuoiNgay(ct, viec, sanXuat, chamCong, thanhVien, ngay) {
  const bc = viec.filter(laBaoCaoCuoiNgay);

  // Chưa tạo việc báo cáo nào → KHÔNG chấm (tiLe null), không chấm 0. Cùng lý do như quay video.
  if (!bc.length) {
    return { tiLe: null, ghiChu: 'Chưa có việc báo cáo cuối ngày nào trong tháng — chưa có căn cứ chấm.' };
  }

  // Chỉ chấm báo cáo ĐÃ ĐẾN HẠN: đã nộp, hoặc quá hạn mà chưa nộp. Báo cáo của ngày CHƯA tới
  // hạn (vd báo cáo hôm nay — cuối ngày mới phải nộp) thì chưa chấm, không kéo điểm oan.
  const tinh = bc.filter(t => t.status === 'COMPLETED' || quaHanChuaXong(t, ngay));
  if (!tinh.length) {
    return { tiLe: null, ghiChu: 'Chưa có báo cáo cuối ngày nào đến hạn chấm — chưa có căn cứ chấm.' };
  }

  // Hệ số mỗi báo cáo (chủ app chốt 24/07/2026): nộp đúng hạn 1, nộp trễ 0.5, quá hạn chưa nộp 0.
  const tong = tinh.reduce((s, t) => s + heSoHoanThanh(t), 0);
  const tiLe = tong / tinh.length;

  // Ghi chú liệt kê theo NGÀY (tên báo cáo trùng nhau nên liệt kê tên là vô nghĩa), kèm lý do + hệ số.
  const mat = tinh.filter(t => heSoHoanThanh(t) < 1).slice().sort((a, b) => {
    const da = a.due_date || a.created_date || '', db = b.due_date || b.created_date || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const moTa = t => t.status === 'COMPLETED'
    ? `${ngayNgan(t)} (nộp trễ, hệ số 0.5)`
    : `${ngayNgan(t)} (chưa làm, hệ số 0)`;
  const ds = mat.slice(0, MAX_TEN_TRE).map(moTa).join(', ');
  const them = mat.length > MAX_TEN_TRE ? ` …và ${mat.length - MAX_TEN_TRE} ngày nữa` : '';
  const phanMat = mat.length ? ` Chưa đạt: ${ds}${them}.` : '';
  const chuaToiHan = bc.length - tinh.length;
  const phanPhu = chuaToiHan ? `, bỏ ${chuaToiHan} báo cáo chưa tới hạn` : '';

  return {
    tiLe,
    ghiChu: `Tự động: đạt ${Math.round(tiLe * 100)}% trên ${tinh.length} báo cáo đến hạn${phanPhu}.${phanMat}`,
  };
}

// Chỉ tiêu HIỆU SUẤT SẢN XUẤT: lấy thẳng hiệu suất trung bình tháng ở bảng phân tích sản xuất.
// Nhận thêm tham số thứ 3 là bản ghi production_logs của người đó — hai luật trên không cần
// nên bỏ qua, đó là lý do tham số này đứng cuối.
function luatHieuSuatSanXuat(ct, viec, sanXuat = []) {
  if (!sanXuat.length) {
    return { tiLe: null, ghiChu: 'Chưa có bản ghi sản xuất nào trong tháng — chưa có căn cứ chấm.' };
  }

  // TRUNG BÌNH CỘNG các lần chấm, KHÔNG bình quân gia quyền theo sản lượng. Phải khớp đúng
  // cách tab Báo cáo tính `avgPerf` (WorkReport.jsx) — hai màn hình mà tính khác nhau thì
  // cùng một người sẽ thấy hai con số "hiệu suất trung bình", và không ai biết tin cái nào.
  const ds = sanXuat.map(l => Number(l.performance_rate) || 0);
  const tb = ds.reduce((a, b) => a + b, 0) / ds.length;

  // Kẹp trong [0,1]: hiệu suất vượt 100% là chuyện thường (làm nhanh hơn định mức), nhưng
  // điểm chỉ tiêu thì không được vượt trần — engine cũng kẹp, kẹp sẵn ở đây để ghi chú nói
  // đúng chuyện đang xảy ra thay vì để người đọc tự đoán vì sao 110% mà không thêm điểm.
  const tiLe = Math.min(1, Math.max(0, tb / 100));
  const vuot = tb > 100 ? ' (vượt 100% chỉ tính tối đa)' : '';

  return {
    tiLe,
    ghiChu: `Tự động: hiệu suất trung bình ${Math.round(tb)}% trên ${ds.length} lần chấm trong tháng${vuot}.`,
  };
}

// ── Chuyên cần ──────────────────────────────────────────────────────────────
// 'YYYY-MM-DD' → 'd/M' (bỏ số 0 đầu). Ghi chú chuyên cần cần NGÀY cụ thể chứ không chỉ
// số đếm — người bị trừ điểm phải tra được là ngày nào, không phải "nghỉ 2 ngày" chung chung.
const ngayDM = ngay => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ngay || ''));
  return m ? `${Number(m[2])}/${Number(m[1])}` : String(ngay || '');
};

// Số ngày tối đa liệt kê trong một mảnh ghi chú. Ô ghi chú nằm trong ô bảng và bản in A4,
// liệt kê 25 ngày là vỡ ô — cắt bớt, ghi "…+N" để người đọc biết còn nữa.
const MAX_NGAY = 8;
const noiNgay = ds => {
  const ten = ds.slice(0, MAX_NGAY).join(', ');
  return ds.length > MAX_NGAY ? `${ten} …+${ds.length - MAX_NGAY}` : ten;
};

// Ngưỡng chép nguyên từ mô tả chỉ tiêu trong file KPI gốc. Đọc từ nặng xuống nhẹ, lấy mức
// đầu tiên khớp.
const NGUONG_PHUT = [[91, 10], [61, 3], [30, 1]];   // phút đi muộn + về sớm cộng dồn
const NGUONG_NGHI = [[4, 10], [1, 5]];              // số ngày nghỉ VƯỢT phép

// Số ngày nghỉ KHÔNG bị trừ điểm trong một tháng — chủ app xác nhận 23/07/2026: 1 ngày phép.
//
// Cột `nghi` trong bảng chấm công là nghỉ CHUNG, gồm cả ngày phép. Nên số ngày vượt phép =
// tổng ngày nghỉ − 1, không phải đếm riêng loại nghỉ nào. Đây là chỗ ảnh hưởng mạnh nhất tới
// điểm chuyên cần: nghỉ 5 ngày là trừ 12 điểm, quá cả mức chỉ tiêu, trong khi muộn 200 phút
// cả tháng chỉ trừ 6. Đổi con số này là đổi thứ hạng của cả bảng.
const NGAY_PHEP_THANG = 1;

const truTheoNguong = (v, bang) => (bang.find(([m]) => v >= m) || [0, 0])[1];

// Nhóm "toàn công ty": người phụ trách chung chịu trách nhiệm chuyên cần của TẤT CẢ nhân
// viên chứ không riêng mình. Ngoại lệ có chủ đích — đặt tên rõ để người đọc sau không tưởng
// là lỗi khi thấy nhóm chỉ nối 1 người mà lại tính trên 13 người.
export const NHOM_TOAN_CTY = 'CHUYEN_CAN_TOAN_CTY';

// Luật nào chấm được cho DÒNG CHUNG cấp bộ phận. Danh sách trắng chứ không mặc định cho tất
// cả: luật lấy dữ liệu theo từng người (việc được giao, sản xuất) mà gặp dòng chung sẽ thấy
// danh sách rỗng và kết luận "không có việc nào → đủ điểm", tức chấm tối đa cho một dòng nó
// không hề có dữ liệu.
export const LUAT_THEO_NHOM = new Set(['CHUYEN_CAN_BO_PHAN']);

// Điểm từ số điểm bị trừ. Sàn 0 — trừ quá mức chỉ tiêu không ra điểm âm.
function tuDiemTru(ct, tru, ghiChu) {
  const max = Number(ct?.chi_tieu) || 0;
  if (!max) return { tiLe: null, ghiChu };
  return { tiLe: Math.max(0, max - tru) / max, ghiChu };
}

// CHUYÊN CẦN BỘ PHẬN — một điểm cho cả nhóm, tính trên TRUNG BÌNH ĐẦU NGƯỜI.
//
// Vì sao trung bình chứ không phải tổng nhóm hay người tệ nhất (chủ app chốt 23/07):
//   - Tổng nhóm phạt nhóm ĐÔNG NGƯỜI: 7 người mỗi người muộn 20 phút là đã 140 phút, mất
//     trọn điểm — nhóm lớn không bao giờ với tới điểm tối đa dù kỷ luật ngang nhóm nhỏ.
//   - Người tệ nhất làm công sức của 6 người còn lại thành vô hình: họ đi đúng giờ cả tháng
//     mà con số của nhóm không nhúc nhích. Đó là cách chắc nhất để họ bỏ cuộc.
//   - Trung bình: ai cố gắng thì con số nhóm nhúc nhích theo, và ngưỡng 30/61/91 vốn được
//     viết cho MỘT người nên hợp với con số trung bình đầu người.
function luatChuyenCanBoPhan(ct, viec, sanXuat, chamCong = [], thanhVien = []) {
  const soNguoi = thanhVien.length;
  if (!soNguoi || !chamCong.length) {
    return { tiLe: null, ghiChu: 'Chưa có dữ liệu chấm công của nhóm trong tháng — chưa có căn cứ chấm.' };
  }

  // Ngày được miễn (giải trình) không tính vào phút trễ lẫn ngày nghỉ của nhóm.
  const ccTru = chamCong.filter(c => !c.mien);
  const soMien = chamCong.length - ccTru.length;

  const phut = ccTru.reduce(
    (s, c) => s + (Number(c.di_muon_phut) || 0) + (Number(c.ve_som_phut) || 0), 0);
  const nghi = ccTru.filter(c => c.nghi).length;
  const phutTB = phut / soNguoi;
  const nghiTB = nghi / soNguoi;
  const vuotPhep = Math.max(0, nghiTB - NGAY_PHEP_THANG);

  const truPhut = truTheoNguong(phutTB, NGUONG_PHUT);
  const truNghi = truTheoNguong(vuotPhep, NGUONG_NGHI);

  const phanMien = soMien ? ` (miễn ${soMien} ngày có giải trình)` : '';
  const ghiChu = `Tự động: ${soNguoi} người — trung bình ${Math.round(phutTB)} phút muộn/về sớm`
    + ` (−${truPhut}) và ${nghiTB.toFixed(1)} ngày nghỉ mỗi người, vượt ${vuotPhep.toFixed(1)}`
    + ` ngày so với ${NGAY_PHEP_THANG} ngày phép (−${truNghi}).`
    + ` Cả nhóm: ${phut} phút, ${nghi} ngày nghỉ${phanMien}.`;

  return tuDiemTru(ct, truPhut + truNghi, ghiChu);
}

// CHUYÊN CẦN CÁ NHÂN — tính phần ĐO ĐƯỢC từ chấm công, phần còn lại để người chấm tự trừ.
//
// Bảng chấm công KHÔNG có: có phép / không phép, quên chấm công, chấm công sai. Ba thứ đó
// chiếm phần lớn quy định trừ điểm của chỉ tiêu này. Nên luật này KHÔNG khoá chấm tay:
// `nhuongChamTay` báo cho phần chèn biết là điểm chốt tay của người thật thắng điểm tự động.
function luatChuyenCanCaNhan(ct, viec, sanXuat, chamCong = []) {
  if (!chamCong.length) {
    return { tiLe: null, nhuongChamTay: true, ghiChu: 'Chưa có dữ liệu chấm công trong tháng — chưa có căn cứ chấm.' };
  }

  // Ngày được miễn (giải trình) KHÔNG tính điểm trừ — nhưng vẫn nêu ở ghi chú.
  const ccTru = chamCong.filter(c => !c.mien);
  const theoNgay = (a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0);

  const muonNgay = ccTru.filter(c => (Number(c.di_muon_phut) || 0) > 5).slice().sort(theoNgay);
  // Hai bậc TÁCH RỜI, không cộng chồng: quá 15 phút trừ 5, còn 6–15 phút trừ 1.
  const nang = ccTru.filter(c => (Number(c.di_muon_phut) || 0) > 15).length;
  const nhe = ccTru.filter(c => { const p = Number(c.di_muon_phut) || 0; return p > 5 && p <= 15; }).length;

  const nghiNgay = ccTru.filter(c => c.nghi).slice().sort(theoNgay);
  const nghi = nghiNgay.length;
  const vuotPhep = Math.max(0, nghi - NGAY_PHEP_THANG);
  const truMuon = nang * 5 + nhe * 1;
  const truNghi = vuotPhep * 3;
  const tru = truMuon + truNghi;

  const mienNgay = chamCong.filter(c => c.mien).slice().sort(theoNgay);

  const phan = [];
  if (muonNgay.length) {
    const ds = muonNgay.map(c => `${ngayDM(c.ngay)} (${Number(c.di_muon_phut)}′)`);
    phan.push(`Đi muộn ${muonNgay.length} ngày (−${truMuon}): ${noiNgay(ds)}.`);
  }
  if (nghi) {
    const ds = nghiNgay.map(c => ngayDM(c.ngay));
    phan.push(vuotPhep > 0
      ? `Nghỉ ${nghi} ngày, quá ${vuotPhep} phép (−${truNghi}): ${noiNgay(ds)}.`
      : `Nghỉ ${nghi} ngày (trong phép): ${noiNgay(ds)}.`);
  }
  if (mienNgay.length) {
    phan.push(`Miễn ${mienNgay.length} ngày có giải trình (không trừ): ${noiNgay(mienNgay.map(c => ngayDM(c.ngay)))}.`);
  }
  // Chỉ nói "đủ điểm" khi KHÔNG có mảnh nào ở trên — nếu không, một ngày nghỉ trong phép sẽ
  // vừa ghi "Nghỉ 1 ngày (trong phép)" vừa ghi "không nghỉ quá phép", đọc mâu thuẫn.
  if (!phan.length) {
    phan.push('Không muộn, không nghỉ quá phép — đủ điểm.');
  }

  const ghiChu = `Tự động: ${phan.join(' ')}`
    + ' Chưa tính có phép/không phép, quên/sai chấm công — chốt tay đè lên.';

  return { ...tuDiemTru(ct, tru, ghiChu), nhuongChamTay: true };
}

// ── Đóng góp cải tiến ───────────────────────────────────────────────────────
// Bài cải tiến tính cho một người trong một kỳ (bảng cai_tien, tab Cải tiến):
//   - ĐÃ DUYỆT với mốc DUYỆT (reviewed_at) rơi trong tháng — bài được tính điểm.
//     Mốc duyệt chứ không phải mốc gửi (chủ app chốt 24/07/2026): gửi 30/07 mà
//     02/08 mới duyệt thì là điểm của tháng 8, không ai bị mất bài vì duyệt chậm.
//   - CHỜ DUYỆT / CẦN BỔ SUNG gửi trong tháng — không tính điểm, chỉ để ghi chú
//     nói "còn N bài chờ duyệt" thay vì im lặng chấm 0.
//   - NHÁP / TỪ CHỐI không bao giờ tính.
// Cắt tháng theo giờ máy, cùng lý do với viecTrongThang ở đầu file.
export function caiTienTrongThang(caiTien = [], nvId, ky) {
  const [nam, thang] = String(ky || '').split('-').map(Number);
  if (!nam || !thang) return [];
  const trongThang = iso => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === nam && d.getMonth() + 1 === thang;
  };
  return (caiTien || []).filter(b => {
    if (!b || b.nhan_vien_id !== nvId) return false;
    if (b.status === 'DA_DUYET') return trongThang(b.reviewed_at);
    if (b.status === 'CHO_DUYET' || b.status === 'CAN_BO_SUNG') return trongThang(b.created_at);
    return false;
  });
}

// Chép từ mô tả chỉ tiêu gốc: "mỗi nhân viên cần tối thiểu 2 đóng góp cải tiến/tháng".
// KHÔNG lấy từ ct.chi_tieu — cột đó là ĐIỂM tối đa (tình cờ cũng bằng 2), trùng số
// chứ không trùng nghĩa; mai chủ app nâng điểm tối đa lên 5 mà số bài yêu cầu vẫn là 2.
const SO_CAI_TIEN_TOI_THIEU = 2;

// Tab Cải tiến chạy từ kỳ này. Kỳ TRƯỚC đó phải trả tiLe null (không chấm) chứ không
// phải 0: mở lại tháng 6 mà chấm 0 là đè mất điểm đã chấm tay của cả công ty.
const KY_CAI_TIEN_BAT_DAU = '2026-07';

function luatDongGopCaiTien(ct, viec, sanXuat, chamCong, thanhVien, ngay, caiTien, ky) {
  if (ky && ky < KY_CAI_TIEN_BAT_DAU) {
    return { tiLe: null, ghiChu: 'Tab Cải tiến hoạt động từ 07/2026 — kỳ này giữ điểm chấm tay.' };
  }
  // null = KHÔNG nối được nguồn dữ liệu (bảng chưa tạo / lỗi tải) — khác hẳn mảng rỗng
  // (nối được nhưng người này chưa có bài nào, cái đó chấm 0 thật).
  if (caiTien == null) {
    return { tiLe: null, ghiChu: 'Chưa đọc được dữ liệu tab Cải tiến — chưa có căn cứ chấm.' };
  }

  const duyet = caiTien.filter(b => b.status === 'DA_DUYET');
  const dangCho = caiTien.length - duyet.length;
  const tiLe = Math.min(1, duyet.length / SO_CAI_TIEN_TOI_THIEU);

  const tenBai = b => `"${b.title}" (loại ${b.xep_loai === 'GHI_NHAN' ? 'Ghi nhận' : b.xep_loai || '—'})`;
  const ds = duyet.slice(0, MAX_TEN_TRE).map(tenBai).join(', ');
  const them = duyet.length > MAX_TEN_TRE ? ` …và ${duyet.length - MAX_TEN_TRE} bài nữa` : '';
  const phanCho = dangCho
    ? ` Còn ${dangCho} bài đang chờ duyệt/bổ sung — duyệt xong điểm tự cộng.` : '';

  if (!duyet.length) {
    return {
      tiLe,
      ghiChu: `Tự động: chưa có cải tiến nào được duyệt trong tháng`
        + ` (chỉ tiêu tối thiểu ${SO_CAI_TIEN_TOI_THIEU} bài, tính theo mốc duyệt) — 0 điểm.${phanCho}`,
    };
  }
  return {
    tiLe,
    ghiChu: `Tự động: ${duyet.length} cải tiến được duyệt trong tháng (tính theo mốc duyệt),`
      + ` chỉ tiêu tối thiểu ${SO_CAI_TIEN_TOI_THIEU} bài — đạt ${Math.round(tiLe * 100)}%: ${ds}${them}.${phanCho}`,
  };
}

// Bảng đăng ký luật, khoá theo `ma` của chỉ tiêu.
export const LUAT_TU_DONG = {
  HT_CONG_VIEC_DUNG_HAN: luatHoanThanhDungHan,
  VIDEO_KY_THUAT: luatVideoKyThuat,
  BC_KET_QUA_CONG_VIEC: luatBaoCaoCuoiNgay,
  SAN_XUAT: luatHieuSuatSanXuat,
  CHUYEN_CAN_BO_PHAN: luatChuyenCanBoPhan,
  CHUYEN_CAN_CA_NHAN: luatChuyenCanCaNhan,
  DONG_GOP_CAI_TIEN: luatDongGopCaiTien,
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
// `caiTien` để MẶC ĐỊNH null chứ không phải []: null nghĩa là nơi gọi không nối/không
// tải được nguồn Cải tiến → luật trả "không chấm" thay vì đè 0 lên điểm cũ. Mảng rỗng
// mới có nghĩa "nối được nhưng chưa ai có bài".
export function apDungChamTuDong(
  rows = [], logs = [], tasks = [], ky, ngay = homNay(), sanXuat = [], chamCong = [], ngoaiLe = [],
  caiTien = null) {
  const rowsMoi = [];
  const logsAo = [];
  const ds = rows || [];

  // Miễn trừ đặc biệt (giải trình): khoá theo người+ngày, giữ cả lý do để ghi chú nói được.
  const mienSet = new Set();
  const mienMap = new Map();
  for (const x of (ngoaiLe || [])) {
    const k = `${x.nhan_vien_id}|${x.ngay}`;
    mienSet.add(k);
    mienMap.set(k, x.ly_do || null);
  }

  for (const r of ds) {
    const luat = LUAT_TU_DONG[r?.ma];
    const laBoPhan = r?.cap_do === 'BO_PHAN';
    if (!luat || (!laBoPhan && !r.nhan_vien_id)) { rowsMoi.push(r); continue; }
    if (laBoPhan && !LUAT_THEO_NHOM.has(r.ma)) { rowsMoi.push(r); continue; }

    // Dòng CÁ NHÂN có liên kết bộ phận thì chấm nó là vô nghĩa: engine lấy điểm TỪ dòng chung
    // và bỏ qua diem_chot của dòng này, nhật ký hiển thị cũng là nhật ký của dòng chung. Chấm
    // ở đây chỉ tạo ra một con số không ai nhìn thấy.
    if (!laBoPhan && r.lien_ket_bo_phan) { rowsMoi.push(r); continue; }

    // Ai nằm trong phạm vi tính của dòng này.
    const thanhVien = laBoPhan
      ? [...new Set(ds
        .filter(x => x.cap_do === 'CA_NHAN' && x.nhan_vien_id
          && (r.lien_ket_bo_phan === NHOM_TOAN_CTY || x.lien_ket_bo_phan === r.lien_ket_bo_phan))
        .map(x => x.nhan_vien_id))]
      : [r.nhan_vien_id];

    const cc = (chamCong || [])
      .filter(c => thanhVien.includes(c.nhan_vien_id) && String(c.ky || '') === ky)
      .map(c => {
        const k = `${c.nhan_vien_id}|${c.ngay}`;
        return mienSet.has(k) ? { ...c, mien: true, mien_ly_do: mienMap.get(k) || null } : c;
      });

    const kq = luat(
      r,
      laBoPhan ? [] : viecTrongThang(tasks, r.nhan_vien_id, ky),
      laBoPhan ? [] : sanXuatTrongThang(sanXuat, r.nhan_vien_id, ky),
      cc,
      thanhVien,
      ngay,
      laBoPhan || caiTien == null ? null : caiTienTrongThang(caiTien, r.nhan_vien_id, ky),
      ky);

    // Luật nhường chấm tay: có người thật đã chốt điểm thì giữ nguyên số của họ, chỉ kèm lời
    // giải thích. Dùng cho chỉ tiêu mà dữ liệu chỉ đo được một phần (chuyên cần cá nhân).
    const daChotTay = kq.nhuongChamTay && r.diem_chot != null && !!r.chot_boi;
    // tiLe = null → KHÔNG chấm: giữ nguyên đường tính cũ, chỉ kèm lời giải thích.
    const boQua = daChotTay || kq.tiLe == null;
    rowsMoi.push(boQua ? r : { ...r, diem_chot: (r.chi_tieu ?? 0) * kq.tiLe });

    logsAo.push({
      id: `ao-${r.id}`, chi_tieu_id: r.id, ngay, so_diem: 0,
      ly_do: daChotTay ? `${kq.ghiChu} (đang dùng điểm chốt tay của ${r.chot_boi})` : kq.ghiChu,
      nguon: NGUON_TU_DONG, nguoi_ghi: null,
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
