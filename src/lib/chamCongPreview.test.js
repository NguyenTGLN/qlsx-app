import { describe, it, expect } from 'vitest';
import { soSanhDiemChuyenCan } from './chamCongPreview';

const ct = nvId => ({
  id: `ct-${nvId}`, ma: 'CHUYEN_CAN_CA_NHAN', cap_do: 'CA_NHAN',
  nhan_vien_id: nvId, ky: '2026-07', chi_tieu: 10,
});
const cc = (nvId, ngay, muon = 0, nghi = false) => ({
  ky: '2026-07', nhan_vien_id: nvId, ngay, di_muon_phut: muon, ve_som_phut: 0, nghi,
});
const users = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }];

describe('soSanhDiemChuyenCan', () => {
  it('không muộn không nghỉ thì đủ điểm ở cả hai bên', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01')],
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].diemTruoc).toBe(10);
    expect(kq[0].diemSau).toBe(10);
  });

  it('thêm ngày muộn nặng thì điểm sau tụt 5', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01'), cc('a', '2026-07-02', 30)],
    });
    expect(kq[0].diemTruoc).toBe(10);
    expect(kq[0].diemSau).toBe(5);
  });

  it('nghỉ vượt phép trừ 3 mỗi ngày, ngày phép đầu tiên không trừ', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01', 0, true)],
      chamCongMoi: [cc('a', '2026-07-01', 0, true), cc('a', '2026-07-02', 0, true),
                    cc('a', '2026-07-03', 0, true)],
    });
    expect(kq[0].diemTruoc).toBe(10);
    expect(kq[0].diemSau).toBe(4);
  });

  it('ngày được miễn trừ (có giải trình) KHÔNG bị tính trừ', () => {
    const chung = { ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')] };
    const moi = [cc('a', '2026-07-01'), cc('a', '2026-07-02', 30)];
    const khongMien = soSanhDiemChuyenCan({ ...chung, chamCongMoi: moi });
    const coMien = soSanhDiemChuyenCan({ ...chung, chamCongMoi: moi,
      ngoaiLe: [{ nhan_vien_id: 'a', ngay: '2026-07-02', ly_do: 'đi công tác' }] });
    expect(khongMien[0].diemSau).toBe(5);
    expect(coMien[0].diemSau).toBe(10);
  });

  it('người KHÔNG có chỉ tiêu chuyên cần thì bỏ khỏi bảng, không hiện 0 điểm', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01'), cc('b', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01'), cc('b', '2026-07-01')],
    });
    expect(kq.map(x => x.nhanVienId)).toEqual(['a']);
  });

  it('chưa có dữ liệu cũ thì diemTruoc là null (chưa chấm), KHÔNG phải 0', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [],
      chamCongMoi: [cc('a', '2026-07-01')],
    });
    expect(kq[0].diemTruoc).toBeNull();
    expect(kq[0].diemSau).toBe(10);
  });

  it('lấy tên hiển thị từ users, không có thì lùi về id', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a'), ct('z')], users,
      chamCongCu: [], chamCongMoi: [cc('a', '2026-07-01'), cc('z', '2026-07-01')],
    });
    expect(kq.find(x => x.nhanVienId === 'a').ten).toBe('An');
    expect(kq.find(x => x.nhanVienId === 'z').ten).toBe('z');
  });

  it('chỉ lấy dòng đúng kỳ, bỏ dòng kỳ khác lọt vào', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [],
      chamCongMoi: [cc('a', '2026-07-01'),
                    { ...cc('a', '2026-08-01', 30), ky: '2026-08' }],
    });
    expect(kq[0].diemSau).toBe(10);
  });
});

// Màn KPI thật (apDungChamTuDong, kpiTuDong.js) LUÔN giữ điểm người đã chốt tay bất kể chấm
// công mới nạp gì — luật chuyên cần cá nhân chủ động nhường vì dữ liệu chấm công chỉ đo được
// một phần quy định (không thấy có phép/không phép). Xem trước mà không mượn đúng điều kiện
// đó thì đưa ra một con số mà màn KPI sẽ không bao giờ hiện, đúng lúc người dùng tin nó nhất.
describe('chốt tay thắng điểm tự động — mượn ĐÚNG điều kiện của apDungChamTuDong', () => {
  // Chấm công "nặng": 2 ngày muộn >15 phút → nếu tính từ đây sẽ ra 0 điểm, khác hẳn 7. Dùng
  // để chứng minh khi đã chốt tay thì các dòng này KHÔNG được lộ diện vào điểm hiển thị.
  const ccNang = [cc('a', '2026-07-01'), cc('a', '2026-07-08', 30), cc('a', '2026-07-21', 30)];

  it('có CẢ diem_chot lẫn chot_boi: giữ nguyên điểm người chốt ở cả hai cột, không tính lại', () => {
    const ctChot = { ...ct('a'), diem_chot: 7, chot_boi: 'Nguyên' };
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ctChot], users,
      chamCongCu: ccNang, chamCongMoi: ccNang,
    });
    expect(kq[0].diemTruoc).toBe(7);
    expect(kq[0].diemSau).toBe(7);
    expect(kq[0].daChotTay).toBe(true);
    expect(kq[0].nguoiChot).toBe('Nguyên');
  });

  it('có diem_chot nhưng chot_boi rỗng (hàng nhập Excel cũ, không phải người chốt): vẫn tính từ chấm công', () => {
    const ctNhapExcel = { ...ct('a'), diem_chot: 7, chot_boi: null };
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ctNhapExcel], users,
      chamCongCu: [], chamCongMoi: ccNang,
    });
    expect(kq[0].daChotTay).toBe(false);
    expect(kq[0].nguoiChot).toBeNull();
    // 2 ngày muộn nặng (30′) → trừ 10 → sàn 0, KHÔNG phải giữ nguyên số 7 cũ.
    expect(kq[0].diemSau).toBe(0);
  });

  it('có chot_boi nhưng diem_chot rỗng: chưa ai thật sự chốt số, vẫn tính từ chấm công', () => {
    const ctChuaChotSo = { ...ct('a'), diem_chot: null, chot_boi: 'Nguyên' };
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ctChuaChotSo], users,
      chamCongCu: [], chamCongMoi: ccNang,
    });
    expect(kq[0].daChotTay).toBe(false);
    expect(kq[0].diemSau).toBe(0);
  });

  it('dòng bình thường (không diem_chot, không chot_boi): daChotTay false, nguoiChot null', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [], chamCongMoi: [cc('a', '2026-07-01')],
    });
    expect(kq[0].daChotTay).toBe(false);
    expect(kq[0].nguoiChot).toBeNull();
  });
});
