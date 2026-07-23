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

// Ma trận của màn hình: mỗi phần tử là MỘT DÒNG (một chỉ tiêu), `o[i]` là ô ứng với
// nhanVien[i].
//
//   o[i] === null  → người đó KHÔNG có chỉ tiêu này (vẽ gạch chéo)
//   o[i] === dòng  → có chỉ tiêu; chấm hay chưa xem `diem_chot`
//
// Hai trạng thái đó tuyệt đối không được lẫn: "không có chỉ tiêu" mà vẽ thành ô nhập
// trống sẽ mời người dùng chấm điểm cho một dòng không tồn tại.
export function dungMaTran(rows = [], nhanVien = []) {
  const nhom = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || !r.cham_chung || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (!nhom.has(k)) nhom.set(k, []);
    nhom.get(k).push(r);
  }

  const dong = [];
  for (const [, ds] of nhom) {
    const mucs = [...new Set(ds.map(r => r.chi_tieu))];
    dong.push({
      ma: ds[0].ma || null,
      ten: ds[0].ten,
      // Mức chỉ tiêu chỉ hiện ở đầu dòng khi MỌI người cùng mức. Lệch nhau (VIDEO KỸ
      // THUẬT có người 6 người 2) thì để null — mỗi ô tự biết mức của mình.
      chi_tieu: mucs.length === 1 ? mucs[0] : null,
      thuTu: Math.min(...ds.map(r => (typeof r.thu_tu === 'number' ? r.thu_tu : 9999))),
      o: nhanVien.map(nv => ds.find(r => r.nhan_vien_id === nv.id) || null),
    });
  }
  return dong.sort((a, b) => a.thuTu - b.thuTu || a.ten.localeCompare(b.ten, 'vi'));
}

// Nguồn của dòng nhật ký do bảng chấm chung sinh ra. Dòng này mang `so_diem = 0` nên
// KHÔNG đụng vào phép tính điểm — nó chỉ chở lý do sang bảng KPI cá nhân, Excel và bản in.
// Có khoá riêng để tìm lại đúng dòng của mình mà sửa/xoá, không đụng nhật ký nhập tay.
export const NGUON_BANG_CHUNG = 'BANG_CHUNG';

// Các chỉ tiêu CHƯA vào bảng chung — nội dung popup "＋ Thêm chỉ tiêu".
// `soNguoi` để chủ app biết thêm vào thì bảng rộng ra bao nhiêu ô thật, bao nhiêu ô gạch chéo.
export function dsChiTieuThemDuoc(rows = []) {
  const nhom = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || r.cham_chung || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (!nhom.has(k)) nhom.set(k, { ma: r.ma || null, ten: r.ten, soNguoi: 0 });
    nhom.get(k).soNguoi += 1;
  }
  return [...nhom.values()]
    .sort((a, b) => b.soNguoi - a.soNguoi || a.ten.localeCompare(b.ten, 'vi'));
}

// Có phải hỏi lý do cho ô này không: chỉ khi đã chấm và chấm thiếu so với mức chỉ tiêu.
// So sánh với null/undefined chứ không dùng falsy — 0 điểm là giá trị hợp lệ, và đó chính
// là lúc bắt buộc phải có lý do.
export function canHoiLyDo(ct, diem) {
  if (diem === null || diem === undefined) return false;
  if (ct?.chi_tieu === null || ct?.chi_tieu === undefined) return false;
  return Number(diem) < Number(ct.chi_tieu);
}

// Dòng lý do của bảng chung trong nhật ký của một chỉ tiêu. Mỗi chỉ tiêu giữ đúng một dòng.
export function timDongLyDo(logs = []) {
  return (logs || []).find(l => l.nguon === NGUON_BANG_CHUNG) || null;
}

// Số NGƯỜI có mỗi chỉ tiêu trong kỳ → Map(khoaChiTieu → số người).
// Đếm theo tập nhân viên chứ không đếm dòng: dữ liệu lỡ có dòng trùng thì con số vẫn đúng,
// và "chỉ tiêu ai cũng có" mới là khái niệm đáng tin để tô màu bảng.
export function demNguoiTheoChiTieu(rows = []) {
  const nguoi = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (!nguoi.has(k)) nguoi.set(k, new Set());
    nguoi.get(k).add(r.nhan_vien_id);
  }
  const dem = new Map();
  for (const [k, s] of nguoi) dem.set(k, s.size);
  return dem;
}

// Phân loại một dòng chỉ tiêu để bảng KPI cá nhân tô nền — mỗi màu là một CÁCH CHẤM:
//   'TU_DONG'         — app tự tính từ dữ liệu công việc
//   'BANG_CHUNG'      — chấm ở màn hình Bảng chấm chung
//   'BO_PHAN'         — một điểm chấm chung cho cả bộ phận
//   'CHUNG_MOI_NGUOI' — chấm tay, nhưng mọi nhân viên đều có (ứng viên đưa vào bảng chung)
//   'RIENG'           — chấm tay, riêng vị trí này
//
// THỨ TỰ Ở ĐÂY LÀ MỘT QUYẾT ĐỊNH, không phải tình cờ: CHUYÊN CẦN BỘ PHẬN vừa liên kết bộ phận
// vừa có ở 13/13 người, nên phải nói rõ cái nào thắng. Ưu tiên theo mức "điểm này từ đâu ra":
// nguồn điểm càng đặc biệt càng cần được nhìn thấy trước.
//
// `soNhanVien <= 0` (chưa tải xong danh sách) thì KHÔNG được kết luận là chung: đoán bừa ở
// đây sẽ tô cả bảng thành một màu trong lúc đang tải, người dùng đọc sai ngay từ cái nhìn đầu.
export function phanLoaiChiTieu(ct, demNguoi, soNhanVien = 0) {
  if (ct?.cach_cham === 'TU_DONG') return 'TU_DONG';
  if (ct?.cham_chung) return 'BANG_CHUNG';
  if (ct?.lien_ket_bo_phan) return 'BO_PHAN';
  const n = demNguoi?.get?.(khoaChiTieu(ct || {})) || 0;
  return soNhanVien > 0 && n >= soNhanVien ? 'CHUNG_MOI_NGUOI' : 'RIENG';
}

// Sinh mã cho chỉ tiêu gõ tay: bỏ dấu, hoa, gạch dưới, tối đa 4 từ. Cắt phần trong ngoặc vì
// vài tên chỉ tiêu kéo theo cả đoạn giải thích dài.
//
// Vì sao BẮT BUỘC phải có: `ma` là khoá mà mọi thứ khác bám vào — bảng chấm chung gom theo nó,
// luật chấm tự động tra theo nó, màu nền phân loại theo nó. Một dòng thêm tay thiếu mã sẽ
// LẶNG LẼ đứng ngoài tất cả những thứ đó, không báo lỗi gì.
export function sinhMaChiTieu(ten) {
  const ma = String(ten || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .split('(')[0]
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_').filter(Boolean).slice(0, 4).join('_');
  return ma || null;   // tên rỗng thì trả null, đừng ghi chuỗi rỗng xuống DB
}

// Nội dung ô chọn của form "Thêm chỉ tiêu": mọi chỉ tiêu TỪNG DÙNG mà người này chưa có,
// kèm mô tả/mức/trọng số/mã của một dòng mẫu để điền tự động.
//
// Hai nguồn khác nhau, đừng gộp:
//   `danhMuc` — dòng chỉ tiêu của MỌI KỲ. Danh mục phải rộng hơn một kỳ: chỉ tiêu bị gỡ khỏi
//               kỳ này (HOÀN THÀNH ĐƠN BẢO HÀNH bị đợt chuyển cấu trúc tháng 7 xoá) vẫn phải
//               chọn lại được, nếu không muốn thêm lại thì chỉ còn cách gõ tay từ đầu.
//   `rowsKy`  — dòng của KỲ ĐANG XEM. Dùng để biết người này đã có gì, và để đếm "mấy người
//               đang dùng" — con số đó chỉ có nghĩa trong kỳ hiện tại.
//
// Chọn từ danh sách thay vì gõ tay giữ cho cùng một chỉ tiêu có cùng TÊN và cùng MÃ ở mọi
// người. Gõ tay thì chỉ cần thừa một dấu cách là thành chỉ tiêu khác, và bảng chấm chung sẽ
// tách nó thành hai dòng riêng mà nhìn ngoài y hệt nhau.
export function dsChiTieuCoSan(danhMuc = [], rowsKy = [], nvId) {
  const daCo = new Set();
  for (const r of rowsKy || []) {
    if (r.cap_do !== 'BO_PHAN' && r.nhan_vien_id === nvId) daCo.add(khoaChiTieu(r));
  }
  const dem = demNguoiTheoChiTieu(rowsKy);

  // `danhMuc` xếp kỳ mới nhất trước, nên bản gặp đầu tiên của mỗi mã là bản mới nhất — tên và
  // mô tả lấy theo lần sửa gần nhất chứ không phải bản cũ từ nhiều tháng trước.
  const nhom = new Map();
  for (const r of danhMuc || []) {
    if (r.cap_do === 'BO_PHAN' || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (daCo.has(k) || nhom.has(k)) continue;
    nhom.set(k, {
      ma: r.ma || null, ten: r.ten, mo_ta: r.mo_ta ?? null, nhom: r.nhom ?? null,
      chi_tieu: r.chi_tieu ?? null, trong_so: r.trong_so ?? 0,
      cach_cham: r.cach_cham ?? null, lien_ket_bo_phan: r.lien_ket_bo_phan ?? null,
      soNguoi: dem.get(k) || 0,
    });
  }

  return [...nhom.values()]
    .sort((a, b) => b.soNguoi - a.soNguoi || a.ten.localeCompare(b.ten, 'vi'));
}

// Thứ tự các khối khi xếp bảng KPI cá nhân — do chủ app chốt, đi từ chỗ chấm tập trung nhất
// tới chỗ riêng của từng người. KHÁC với thứ tự ưu tiên trong phanLoaiChiTieu ở trên: cái kia
// trả lời "dòng này thuộc loại nào", cái này trả lời "loại nào xếp trước". Đừng gộp hai cái.
export const THU_TU_LOAI = ['BANG_CHUNG', 'BO_PHAN', 'CHUNG_MOI_NGUOI', 'TU_DONG', 'RIENG'];

// Xếp các dòng chỉ tiêu thành từng khối theo cách chấm, GIỮ NGUYÊN thứ tự cũ trong mỗi khối
// (nên vẫn theo `thu_tu` như trước). Trả mảng { d, loai } để nơi gọi khỏi phân loại lại lúc
// render. Không sửa mảng gốc — `kq.dong` còn được bản in và Excel dùng lại.
export function xepTheoLoai(dong = [], demNguoi, soNhanVien = 0) {
  const hang = loai => {
    const i = THU_TU_LOAI.indexOf(loai);
    return i === -1 ? THU_TU_LOAI.length : i;   // loại lạ thì xuống cuối, không nuốt mất dòng
  };
  return (dong || [])
    .map((d, i) => ({ d, loai: phanLoaiChiTieu(d, demNguoi, soNhanVien), i }))
    .sort((a, b) => hang(a.loai) - hang(b.loai) || a.i - b.i)
    .map(({ d, loai }) => ({ d, loai }));
}
