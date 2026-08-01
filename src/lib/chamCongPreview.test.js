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
