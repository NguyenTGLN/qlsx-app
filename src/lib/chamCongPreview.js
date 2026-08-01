// Dựng bảng "điểm chuyên cần trước / sau khi nạp" cho màn hình nạp chấm công.
// Hàm THUẦN — không import supabase, nơi gọi tự tải dữ liệu rồi truyền vào.
//
// GỌI THẲNG LUẬT THẬT (LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN), không viết lại. Viết một bản
// riêng cho màn hình xem trước là chắc chắn có ngày hai bản trôi khỏi nhau — và khi đó
// bảng xem trước nói dối đúng vào lúc người dùng tin nó nhất, tức lúc sắp bấm Xác nhận.
import { LUAT_TU_DONG } from './kpiTuDong';

const MA = 'CHUYEN_CAN_CA_NHAN';

// Gắn cờ `mien` cho ngày đã có giải trình, y như apDungChamTuDong làm (kpiTuDong.js).
// Bỏ bước này thì ngày được miễn vẫn bị tính trừ, và con số xem trước lệch với con số
// thật mà người dùng thấy sau khi nạp.
function locVaGanMien(chamCong, nvId, ky, mienSet) {
  return (chamCong || [])
    .filter(c => c?.nhan_vien_id === nvId && String(c.ky || '') === ky)
    .map(c => (mienSet.has(`${c.nhan_vien_id}|${c.ngay}`) ? { ...c, mien: true } : c));
}

// Điểm tính được + cờ nhường chấm tay, từ một tập dòng chấm công. `diem === null` nghĩa
// là KHÔNG CHẤM (chưa có dữ liệu) — trả null chứ không phải 0, vì "chưa có căn cứ" khác
// hẳn "0 điểm".
function ketQuaLuat(ct, cc) {
  const kq = LUAT_TU_DONG[MA](ct, [], [], cc);
  const diem = (!kq || kq.tiLe == null)
    ? null
    : Math.round((Number(ct.chi_tieu) || 0) * kq.tiLe * 10) / 10;
  return { diem, nhuongChamTay: !!kq?.nhuongChamTay };
}

// → [{ nhanVienId, ten, chiTieu, diemTruoc, diemSau, daChotTay, nguoiChot }] — chỉ những
// người CÓ chỉ tiêu chuyên cần cá nhân trong kỳ. Người không có thì bỏ hẳn khỏi bảng: hiện
// họ với 0 điểm là nói rằng họ đang mất điểm, trong khi họ vốn không bị chấm chỉ tiêu này.
export function soSanhDiemChuyenCan({
  ky, ctRows = [], users = [], chamCongCu = [], chamCongMoi = [], ngoaiLe = [],
} = {}) {
  const mienSet = new Set((ngoaiLe || []).map(x => `${x.nhan_vien_id}|${x.ngay}`));
  const tenCua = id => users.find(u => u.id === id)?.name || id;

  return (ctRows || [])
    .filter(ct => ct?.ma === MA && ct.cap_do === 'CA_NHAN' && ct.nhan_vien_id)
    .map(ct => {
      const nvId = ct.nhan_vien_id;
      const truoc = ketQuaLuat(ct, locVaGanMien(chamCongCu, nvId, ky, mienSet));
      const sau = ketQuaLuat(ct, locVaGanMien(chamCongMoi, nvId, ky, mienSet));

      // Mượn ĐÚNG điều kiện apDungChamTuDong dùng để nhường điểm chốt tay (kpiTuDong.js:
      // `const daChotTay = kq.nhuongChamTay && r.diem_chot != null && !!r.chot_boi`). Màn
      // KPI thật LUÔN giữ điểm người đã chốt, bất kể chấm công mới nạp gì — xem trước mà tự
      // đặt điều kiện khác thì đưa ra một con số mà màn KPI sẽ không bao giờ hiện, đúng lúc
      // người dùng tin nó nhất. `diem_chot` KHÔNG rỗng nhưng `chot_boi` rỗng (hàng nhập từ
      // Excel cũ) KHÔNG tính là chốt tay — đúng ý nghĩa cột, người chốt để trống thì không
      // ai đứng tên chốt cả.
      const daChotTay = sau.nhuongChamTay && ct.diem_chot != null && !!ct.chot_boi;

      return {
        nhanVienId: nvId,
        ten: tenCua(nvId),
        chiTieu: Number(ct.chi_tieu) || 0,
        diemTruoc: daChotTay ? Number(ct.diem_chot) : truoc.diem,
        diemSau: daChotTay ? Number(ct.diem_chot) : sau.diem,
        daChotTay,
        nguoiChot: daChotTay ? ct.chot_boi : null,
      };
    })
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}
