import { describe, it, expect } from 'vitest';
import { docDongChamCong, noiTenNhanVien } from './chamCongExcel';

// Mảng thô đúng hình dạng XLSX.utils.sheet_to_json(..., {header:1, raw:false, defval:''}) trả về:
// hai dòng ghi chú rác ở đầu, rồi dòng tiêu đề, rồi dữ liệu.
const raw = (...dong) => [
  ['Thống kê chấm công', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', ''],
  ['Tên nhân viên', 'Ngày', 'Thứ', 'Giờ in sáng', 'Giờ in chiều', 'Giờ out (gồm tăng ca)',
   'Tăng ca', 'Đi muộn (phút)', 'Về sớm (phút)', 'Nghỉ'],
  ...dong,
];

const d = (ten, ngay, inSang = '08:00', inChieu = '13:30', out = '17:30',
           tangCa = '', muon = '0', veSom = '0', nghi = '') =>
  [ten, ngay, 'T2', inSang, inChieu, out, tangCa, muon, veSom, nghi];

describe('suyRaKyVaNgayCat', () => {
  it('tệp xuất hết tháng thì lấy trọn tháng', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026'), d('A', '31/07/2026')));
    expect(kq.ky).toBe('2026-07');
    expect(kq.denNgay).toBe('2026-07-31');
  });

  it('cắt ở ngày CUỐI CÙNG có người quét vân tay, bỏ ngày chưa tới', () => {
    const kq = docDongChamCong(raw(
      d('A', '22/07/2026'), d('A', '23/07/2026'),
      d('A', '24/07/2026', ''), d('A', '25/07/2026', '')));
    expect(kq.denNgay).toBe('2026-07-23');
    expect(kq.dong).toHaveLength(2);
    expect(kq.boQuaNgaySau).toBe(2);
  });

  it('lẫn hai tháng thì NÉM LỖI, không tự chọn tháng nhiều dòng hơn', () => {
    expect(() => docDongChamCong(raw(
      d('A', '30/06/2026'), d('A', '01/07/2026'), d('A', '02/07/2026'))))
      .toThrow(/lẫn nhiều tháng/i);
  });

  it('không dòng nào có giờ vào thì ném lỗi thay vì trả kỳ rỗng', () => {
    expect(() => docDongChamCong(raw(d('A', '01/07/2026', ''))))
      .toThrow(/giờ vào/i);
  });
});

describe('docDongChamCong', () => {
  it('tìm đúng dòng tiêu đề dù có dòng ghi chú thừa ở đầu', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].tenExcel).toBe('A');
    expect(kq.dong[0].ngay).toBe('2026-07-01');
  });

  it('thiếu dòng tiêu đề thì ném lỗi', () => {
    expect(() => docDongChamCong([['linh tinh']])).toThrow(/Tên nhân viên/);
  });

  it('cột tăng ca dạng h:mm đổi ra phút', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026', '08:00', '13:30', '19:00', '1:27')));
    expect(kq.dong[0].tangCa).toBe(87);
  });

  it('tăng ca rỗng thì null, không phải 0 — không có số liệu khác với tăng ca bằng 0', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].tangCa).toBeNull();
  });

  it('cột Nghỉ có chữ thì nghi = true', () => {
    // inSang PHẢI khác rỗng: đây là dòng DUY NHẤT trong tệp, nên nó cũng phải là dòng neo
    // ngày cắt (suyRaKyVaNgayCat cần ít nhất một dòng có giờ vào). Để inSang rỗng thì tệp
    // không còn dòng nào có giờ vào và bị chặn bởi lỗi "Không dòng nào có giờ vào" trước
    // khi kịp chạm tới điều đang muốn kiểm ở đây.
    const kq = docDongChamCong(raw(d('A', '01/07/2026', '08:00', '', '', '', '0', '0', 'X')));
    expect(kq.dong[0].nghi).toBe(true);
  });

  it('giờ out sớm hơn giờ in chiều: bỏ về sớm, gắn nghi_van, thêm cảnh báo', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '12:00', '', '0', '330')));
    expect(kq.dong[0].veSom).toBe(0);
    expect(kq.dong[0].nghiVan).toBe('GIO_OUT_TRUOC_GIO_IN_CHIEU');
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/330/);
  });

  it('giờ out bình thường thì giữ nguyên về sớm', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '16:00', '', '0', '90')));
    expect(kq.dong[0].veSom).toBe(90);
    expect(kq.dong[0].nghiVan).toBeNull();
    expect(kq.canhBao).toHaveLength(0);
  });

  it('ngày sai định dạng thì ném lỗi kèm số dòng', () => {
    expect(() => docDongChamCong(raw(d('A', '2026-07-01')))).toThrow(/dòng 4/);
  });
});

describe('noiTenNhanVien', () => {
  const nhanVien = [
    { id: 'vta', name: 'Tuấn', ten_cham_cong: 'Vương Tuấn Anh' },
    { id: 'dvx', name: 'Xuân', ten_cham_cong: 'Đỗ Văn Xuân' },
    { id: 'hangkt', name: 'Hằng', ten_cham_cong: null },
  ];

  it('nối đúng theo ten_cham_cong', () => {
    const kq = noiTenNhanVien([{ tenExcel: 'Vương Tuấn Anh' }], nhanVien);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('vta');
    expect(kq.tenChuaBiet).toEqual([]);
  });

  it('bỏ qua khoảng trắng thừa hai đầu', () => {
    const kq = noiTenNhanVien([{ tenExcel: '  Đỗ Văn Xuân ' }], nhanVien);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('dvx');
  });

  it('KHÔNG đoán: "Vương Tuấn Anh" không được tự khớp với tên gọi "Tuấn"', () => {
    const chuaKhaiBao = [{ id: 'vta', name: 'Tuấn', ten_cham_cong: null }];
    const kq = noiTenNhanVien([{ tenExcel: 'Vương Tuấn Anh' }], chuaKhaiBao);
    expect(kq.tenChuaBiet).toEqual(['Vương Tuấn Anh']);
    expect(kq.dongDaNoi[0].nhanVienId).toBeNull();
  });

  it('tên lạ gom vào tenChuaBiet, mỗi tên một lần dù nhiều dòng', () => {
    const kq = noiTenNhanVien(
      [{ tenExcel: 'Người Lạ' }, { tenExcel: 'Người Lạ' }, { tenExcel: 'Đỗ Văn Xuân' }],
      nhanVien);
    expect(kq.tenChuaBiet).toEqual(['Người Lạ']);
  });

  it('nhân viên chưa điền ten_cham_cong thì không nối nhầm vào ai', () => {
    const kq = noiTenNhanVien([{ tenExcel: 'Hằng' }], nhanVien);
    expect(kq.tenChuaBiet).toEqual(['Hằng']);
  });
});
