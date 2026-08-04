// Tải mọi nguồn dữ liệu cần để tính KPI của MỘT kỳ.
//
// Trước 04/08/2026 khối này nằm trong KpiTab.jsx. Tách ra vì Bảng tin cá nhân
// (/ca-nhan) phải ra ĐÚNG con số mà tab KPI đang hiện — hai bộ truy vấn viết
// riêng sẽ trôi xa nhau theo thời gian, và lúc đó cùng một người sẽ thấy hai
// điểm khác nhau ở hai màn hình. Một luật, một chỗ.
//
// ⚠ KHÔNG được lọc `kpi_chi_tieu` hay `cham_cong` xuống "chỉ người đang xem".
// apDungChamTuDong suy danh sách thành viên nhóm TỪ CHÍNH mảng rows nó nhận
// (kpiTuDong.js — biến `thanhVien`), rồi chia trung bình theo số người đó. Tải
// thiếu người ⇒ phutTB chia sai ⇒ điểm chuyên cần bộ phận sai. Đo 04/08/2026:
// 13/13 người có chỉ tiêu lấy điểm từ dòng chung, riêng nhóm bảo hành có 45/100
// trọng số nằm ở dòng chung.

import { supabase, fetchAllRows } from './supabase';

// Chia mảng thành từng lô. `.in()` của PostgREST đi qua query string, hơn 200 uuid là
// URL ~8KB — nhiều proxy/CDN cắt ở 4-8KB và request hỏng im lặng. Chia lô rồi gộp.
export function chiaLo(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * @param {string} ky  'YYYY-MM'
 * @param {{kemDanhMuc?: boolean}} tuyChon
 *   kemDanhMuc — tải danh mục chỉ tiêu của MỌI kỳ cho ô chọn ở form "Thêm chỉ tiêu".
 *   Mặc định TRUE để tab KPI giữ nguyên hành vi. Bảng tin cá nhân truyền false:
 *   nó không có form thêm chỉ tiêu, mà đây là truy vấn duy nhất không lọc theo kỳ
 *   (đo 04/08/2026: 627 dòng, gần nửa lượng dữ liệu của cả lần tải).
 *
 * Ném lỗi nếu KHÔNG lấy được `kpi_chi_tieu`/`kpi_nhat_ky` — thiếu hai nguồn này thì
 * không có KPI nào để hiện, nơi gọi phải báo hỏng. Các nguồn còn lại chỉ phục vụ chấm
 * tự động: hỏng thì để rỗng và ghi vào `loiViec`, phần còn lại của bảng vẫn dùng được.
 */
export async function taiDuLieuKpi(ky, { kemDanhMuc = true } = {}) {
  // fetchAllRows trả { data, error } chứ KHÔNG trả thẳng mảng — phải destructure.
  //
  // `.order('id')` là TIE-BREAK BẮT BUỘC, không phải trang trí (luật của repo, xem
  // lib/supabase.js): fetchAllRows gom theo từng đợt 1000 dòng, mà `thu_tu` thì mỗi
  // người đều có 1..N nên trùng dày đặc. Thứ tự các dòng bằng nhau không được bảo đảm
  // giữa hai request → đợt sau có thể trả lại dòng đã lấy hoặc bỏ sót dòng chưa lấy.
  const { data: ct, error: loiCt } = await fetchAllRows(() =>
    supabase.from('kpi_chi_tieu').select('*').eq('ky', ky).order('thu_tu').order('id'));
  if (loiCt) throw loiCt;

  const ids = (ct || []).map(r => r.id);
  const nk = [];
  for (const lo of chiaLo(ids, 100)) {
    // `ngay` trùng còn dày hơn `thu_tu` (cả bộ phận bị trừ điểm cùng một ngày là
    // chuyện thường). Một dòng trừ điểm bị lặp = trừ đôi, bị sót = không trừ —
    // cả hai đều ra sai điểm KPI, và sai âm thầm.
    const { data, error } = await fetchAllRows(() =>
      supabase.from('kpi_nhat_ky').select('*').in('chi_tieu_id', lo).order('ngay').order('id'));
    if (error) throw error;
    if (data) nk.push(...data);
  }

  // Công việc của tháng, để chấm tự động 2 chỉ tiêu HT_CONG_VIEC_DUNG_HAN + VIDEO_KY_THUAT.
  // Lọc sẵn theo tháng ở phía server và chỉ lấy 8 cột cần dùng: cong_viec_duoc_giao là bảng
  // lớn nhất app, kéo cả bảng về chỉ để đếm vài chục việc là phí băng thông của mọi người.
  //
  // Mốc tháng dựng bằng `new Date(nam, thang-1, 1)` = nửa đêm GIỜ MÁY (giờ VN), không phải
  // giờ UTC: việc tạo 06:00 ngày 01/08 giờ VN là 23:00 ngày 31/07 giờ UTC, cắt theo UTC sẽ
  // xếp nhầm nó sang tháng 7.
  //
  // Lỗi tải việc KHÔNG được làm hỏng cả màn hình KPI — bắt riêng, để danh sách rỗng và báo
  // một dòng cảnh báo, phần còn lại của bảng vẫn dùng được.
  const [nam, thang] = ky.split('-').map(Number);
  let dsViec = [];
  let loiViec = '';
  try {
    const { data, error } = await fetchAllRows(() => supabase
      .from('cong_viec_duoc_giao')
      .select('id, title, status, due_date, completed_date, created_date, assignee_ids, assignee_id')
      .gte('created_date', new Date(nam, thang - 1, 1).toISOString())
      .lt('created_date', new Date(nam, thang, 1).toISOString())
      .order('id'));
    if (error) throw error;
    dsViec = data || [];
  } catch (err) {
    loiViec = err?.message || String(err);
  }

  // Bản ghi sản xuất của tháng, để chấm tự động chỉ tiêu HIỆU SUẤT SẢN XUẤT.
  // `execution_date` là cột DATE nên lọc bằng chuỗi 'YYYY-MM-DD' là đủ, không cần dựng
  // mốc giờ như bảng công việc.
  // Cùng một lưới an toàn: hỏng chỗ này không được kéo sập cả màn hình KPI.
  let dsSanXuat = [];
  try {
    const { data, error } = await fetchAllRows(() => supabase
      .from('production_logs')
      .select('id, worker_id, performance_rate, execution_date')
      .gte('execution_date', `${ky}-01`)
      .lt('execution_date', `${thang === 12 ? nam + 1 : nam}-${String(thang === 12 ? 1 : thang + 1).padStart(2, '0')}-01`)
      .order('id'));
    if (error) throw error;
    dsSanXuat = data || [];
  } catch (err) {
    loiViec = loiViec || err?.message || String(err);
  }

  // Danh mục chỉ tiêu của MỌI kỳ, cho ô chọn ở form "Thêm chỉ tiêu". Phải rộng hơn kỳ
  // đang xem: chỉ tiêu bị gỡ khỏi kỳ này (HOÀN THÀNH ĐƠN BẢO HÀNH bị đợt chuyển cấu trúc
  // tháng 7 xoá) vẫn phải chọn lại được, không thì chỉ còn cách gõ tay từ đầu.
  // Kỳ mới nhất trước để bản gặp đầu tiên của mỗi mã là bản mới nhất.
  let dsDanhMuc = [];
  if (kemDanhMuc) {
    try {
      const { data, error } = await fetchAllRows(() => supabase
        .from('kpi_chi_tieu')
        .select('ma, ten, mo_ta, nhom, chi_tieu, trong_so, cach_cham, lien_ket_bo_phan, cap_do, nhan_vien_id, ky')
        .order('ky', { ascending: false }).order('id'));
      if (error) throw error;
      dsDanhMuc = data || [];
    } catch {
      dsDanhMuc = [];   // hỏng thì ô chọn lùi về dùng đúng kỳ đang xem, xem prop coSan
    }
  }

  // Chấm công của kỳ, để chấm tự động 2 chỉ tiêu chuyên cần. Lọc theo `ky` ở phía server.
  // Cùng lưới an toàn: hỏng chỗ này không được kéo sập cả màn hình KPI.
  let dsChamCong = [];
  try {
    const { data, error } = await fetchAllRows(() => supabase
      .from('cham_cong')
      .select('nhan_vien_id, ngay, di_muon_phut, ve_som_phut, nghi, ky')
      .eq('ky', ky).order('id'));
    if (error) throw error;
    dsChamCong = data || [];
  } catch (err) {
    loiViec = loiViec || err?.message || String(err);
  }

  // Miễn trừ chuyên cần của kỳ (bảng phủ trên chấm công). Cùng lưới an toàn: hỏng chỗ
  // này không được kéo sập cả màn hình KPI.
  let dsNgoaiLe = [];
  try {
    const { data, error } = await fetchAllRows(() => supabase
      .from('chuyen_can_ngoai_le')
      .select('nhan_vien_id, ngay, ly_do')
      .eq('ky', ky).order('id'));
    if (error) throw error;
    dsNgoaiLe = data || [];
  } catch (err) {
    loiViec = loiViec || err?.message || String(err);
  }

  // Bài cải tiến liên quan tới kỳ, để chấm tự động chỉ tiêu ĐÓNG GÓP CẢI TIẾN.
  // Lấy bài TẠO hoặc DUYỆT từ đầu tháng trở đi (bài gửi tháng trước duyệt tháng này
  // phải lọt vào) — luatDongGopCaiTien tự khớp đúng tháng theo mốc duyệt.
  // Hỏng/bảng chưa tạo → null: luật trả "không chấm", KHÔNG đè 0 lên điểm cũ.
  let dsCaiTien = null;
  try {
    const tuThang = new Date(nam, thang - 1, 1).toISOString();
    const { data, error } = await fetchAllRows(() => supabase
      .from('cai_tien')
      .select('id, nhan_vien_id, title, status, xep_loai, created_at, reviewed_at')
      .or(`created_at.gte.${tuThang},reviewed_at.gte.${tuThang}`)
      .order('id'));
    if (error) throw error;
    dsCaiTien = data || [];
  } catch {
    dsCaiTien = null;
  }

  return {
    rows: ct || [],
    logs: nk,
    viec: dsViec,
    sanXuat: dsSanXuat,
    danhMuc: dsDanhMuc,
    chamCong: dsChamCong,
    ngoaiLe: dsNgoaiLe,
    caiTien: dsCaiTien,
    loiViec,
  };
}
