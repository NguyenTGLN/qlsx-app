import { test, expect, describe } from 'vitest';
import { mapRowToProposal, fmtNgay, resolveProposerName } from './warrantyProposalMap';

const NOW = new Date('2026-07-06T10:00:00');

describe('fmtNgay', () => {
  test('ISO -> dd/mm/yyyy', () => expect(fmtNgay('2026-01-09')).toBe('09/01/2026'));
  test('có giờ vẫn ra ngày', () => expect(fmtNgay('2026-01-09T08:30:00')).toBe('09/01/2026'));
  test('rỗng -> chuỗi rỗng', () => expect(fmtNgay('')).toBe(''));
  test('nhận Date object', () => expect(fmtNgay(new Date('2026-12-31T00:00:00'))).toBe('31/12/2026'));
  test('chuỗi không parse được -> rỗng', () => expect(fmtNgay('abc')).toBe(''));
});

describe('mapRowToProposal', () => {
  const row = {
    'phiếu_ghi': 'PBH-001', 'id_phiếu_ghi': 111,
    'số_điện_thoại_khách_hàng': '0909123456',
    'địa_chỉ_nhận_hàng': '12 Lê Lợi, Q1',
    'mã_đơn_hàng': 'DH-77', 'ngày_lắp_đặt': '2026-01-09',
    'mã_sản_phẩm': 'RO-9', 'tình_trạng': 'Máy không lên nguồn',
    'linh_kiện': 'Bơm, Van điện từ , Adapter',
    'phiếu_gốc_json': { 'tên_người_yêu_cầu': 'Nguyễn Văn A' },
  };

  test('map đủ trường + ký người đăng nhập', () => {
    const p = mapRowToProposal(row, { name: 'Trần Kỹ Thuật' }, NOW);
    expect(p.maPhieu).toBe('PBH-001');
    expect(p.khachHang).toBe('Nguyễn Văn A');
    expect(p.sdt).toBe('0909123456');
    expect(p.diaChi).toBe('12 Lê Lợi, Q1');
    expect(p.maDonHang).toBe('DH-77');
    expect(p.ngayLap).toBe('09/01/2026');
    expect(p.maSP).toBe('RO-9');
    expect(p.tinhTrang).toBe('Tình trạng: Máy không lên nguồn\nKỹ thuật phụ trách: Nguyễn Bá Ngọc');
    expect(p.nguoiPhuTrach).toBe('Trần Kỹ Thuật');
    expect(p.ngayText).toBe('Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam');
  });

  test('tách linh kiện theo dấu phẩy, bỏ khoảng trắng thừa/rỗng', () => {
    const p = mapRowToProposal(row, {}, NOW);
    expect(p.linhKienList).toEqual(['Bơm', 'Van điện từ', 'Adapter']);
  });

  test('chi tiết lỗi hiện thành dòng riêng có nhãn (không nhập chung Tình trạng)', () => {
    const p = mapRowToProposal({ ...row, 'tình_trạng': '', 'chi_tiết_lỗi': 'Rò nước' }, {}, NOW);
    expect(p.tinhTrang).toBe('Chi tiết lỗi: Rò nước\nKỹ thuật phụ trách: Nguyễn Bá Ngọc');
  });

  test('ô Ghi chú gộp đủ 5 mục có nhãn, xuống dòng, đúng thứ tự', () => {
    const p = mapRowToProposal({
      ...row, 'chi_tiết_lỗi': 'Không ra nước', 'nguyên_nhân': 'Kẹt van', 'phương_án_xử_lý': 'Thay bo nguồn',
    }, {}, NOW);
    expect(p.tinhTrang).toBe(
      'Tình trạng: Máy không lên nguồn\nChi tiết lỗi: Không ra nước\nNguyên nhân: Kẹt van\nPhương án xử lý: Thay bo nguồn\nKỹ thuật phụ trách: Nguyễn Bá Ngọc'
    );
  });

  test('phương án xử lý đọc từ thông_tin_bổ_sung (bản app đã sửa) trước tiên', () => {
    const edited = { ...row, 'phương_án_xử_lý': 'PA gốc', 'thông_tin_bổ_sung': { 'phương_án_xử_lý': 'PA app sửa' } };
    expect(mapRowToProposal(edited, {}, NOW).tinhTrang).toContain('Phương án xử lý: PA app sửa');
  });

  test('tình trạng đọc từ thông_tin_bổ_sung (bản app đã sửa) trước tiên', () => {
    const edited = { ...row, 'tình_trạng': 'cũ (mirror)', 'thông_tin_bổ_sung': { 'tình_trạng': 'WT4200 không lạnh' } };
    expect(mapRowToProposal(edited, {}, NOW).tinhTrang).toBe('Tình trạng: WT4200 không lạnh\nKỹ thuật phụ trách: Nguyễn Bá Ngọc');
  });

  test('mã đơn hàng: bản sửa trong app (thông_tin_bổ_sung) được ưu tiên', () => {
    const edited = { ...row, 'mã_đơn_hàng': '', 'thông_tin_bổ_sung': { 'mã_đơn_hàng': 'DH-EDIT' } };
    expect(mapRowToProposal(edited, {}, NOW).maDonHang).toBe('DH-EDIT');
  });

  test('khách hàng fallback: cột mirror trước, rồi phiếu_gốc_json', () => {
    const p = mapRowToProposal({ ...row, 'tên_khách_hàng': 'Lê Thị B' }, {}, NOW);
    expect(p.khachHang).toBe('Lê Thị B');
  });

  test('linh_kiện rỗng -> mảng rỗng', () => {
    const p = mapRowToProposal({ ...row, 'linh_kiện': '' }, {}, NOW);
    expect(p.linhKienList).toEqual([]);
  });

  test('user rỗng -> nguoiPhuTrach chuỗi rỗng', () => {
    const p = mapRowToProposal(row, null, NOW);
    expect(p.nguoiPhuTrach).toBe('');
  });

  test('tên rút gọn được đổi thành tên đầy đủ trong phiếu', () => {
    expect(mapRowToProposal(row, { name: 'Dương' }, NOW).nguoiPhuTrach).toBe('Nguyễn Thị Thùy Dương');
    expect(mapRowToProposal(row, { name: 'Ngọc' }, NOW).nguoiPhuTrach).toBe('Nguyễn Bá Ngọc');
  });
});

describe('resolveProposerName', () => {
  test('map 4 tên rút gọn -> tên đầy đủ', () => {
    expect(resolveProposerName('Dương')).toBe('Nguyễn Thị Thùy Dương');
    expect(resolveProposerName('Xuyên')).toBe('Hoàng Hà Xuyên');
    expect(resolveProposerName('Ngọc')).toBe('Nguyễn Bá Ngọc');
    expect(resolveProposerName('Phong')).toBe('Nguyễn Đình Phong');
  });
  test('bỏ dấu / khác hoa-thường vẫn khớp', () => {
    expect(resolveProposerName('duong')).toBe('Nguyễn Thị Thùy Dương');
    expect(resolveProposerName('  NGỌC ')).toBe('Nguyễn Bá Ngọc');
  });
  test('tên lạ -> giữ nguyên', () => {
    expect(resolveProposerName('Trần Kỹ Thuật')).toBe('Trần Kỹ Thuật');
    expect(resolveProposerName('')).toBe('');
  });
});
