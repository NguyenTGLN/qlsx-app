import { describe, it, expect } from 'vitest';
import { docDongChamCong, suyRaKyVaNgayCat, noiTenNhanVien } from './chamCongExcel';

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
    // Ngày "chưa tới" phải trống CẢ BA cột giờ (sáng/chiều/ra) — chỉ trống cột sáng không đủ
    // để coi là chưa tới nữa (xem mô tả coGioLam trong chamCongExcel.js): còn chiều hoặc ra
    // thì vẫn là một ngày làm việc thật.
    const kq = docDongChamCong(raw(
      d('A', '22/07/2026'), d('A', '23/07/2026'),
      d('A', '24/07/2026', '', '', ''), d('A', '25/07/2026', '', '', '')));
    expect(kq.denNgay).toBe('2026-07-23');
    expect(kq.dong).toHaveLength(2);
    expect(kq.boQuaNgaySau).toBe(2);
  });

  it('lẫn hai tháng thì NÉM LỖI, không tự chọn tháng nhiều dòng hơn', () => {
    expect(() => docDongChamCong(raw(
      d('A', '30/06/2026'), d('A', '01/07/2026'), d('A', '02/07/2026'))))
      .toThrow(/lẫn nhiều tháng/i);
  });

  it('không dòng nào có giờ vào/ra thì ném lỗi thay vì trả kỳ rỗng', () => {
    // Cả ba cột giờ đều rỗng — không chỉ cột sáng — mới đúng là "không có giờ vào/ra nào".
    expect(() => docDongChamCong(raw(d('A', '01/07/2026', '', '', ''))))
      .toThrow(/giờ vào/i);
  });

  it('chỉ có giờ vào CHIỀU (sáng trống) vẫn tính là ngày làm việc thật, không bị cắt lùi', () => {
    // Kịch bản thật: cả nhóm nghỉ sáng có việc riêng, chiều mới quét vân tay. Cột sáng trống
    // không có nghĩa "chưa tới" — bản cũ (chỉ nhìn cột sáng) sẽ cắt lùi về ngày 23, bỏ mất
    // đúng ngày 24 có người đi làm thật.
    const kq = docDongChamCong(raw(
      d('A', '23/07/2026'),
      d('A', '24/07/2026', '')));   // inSang rỗng, inChieu/out vẫn có (mặc định của helper d)
    expect(kq.denNgay).toBe('2026-07-24');
    expect(kq.dong).toHaveLength(2);
    expect(kq.boQuaNgaySau).toBe(0);
  });

  it('chỉ có giờ RA (sáng và chiều đều trống) vẫn tính là ngày làm việc thật', () => {
    const kq = docDongChamCong(raw(
      d('A', '23/07/2026'),
      d('A', '24/07/2026', '', '', '17:45')));
    expect(kq.denNgay).toBe('2026-07-24');
    expect(kq.boQuaNgaySau).toBe(0);
  });

  it('ngayCuoiTep là ngày cuối có mặt trong tệp dù không ai đi làm — khác denNgay khi có dòng lạc', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026'),
      d('A', '02/07/2026'),
      d('A', '15/07/2026', '', '', '')));   // dòng lạc: cả 3 cột giờ trống, không phải ngày làm việc thật
    expect(kq.denNgay).toBe('2026-07-02');
    expect(kq.ngayCuoiTep).toBe('2026-07-15');
    expect(kq.boQuaNgaySau).toBe(1);
  });

  it('ngayCuoiTep trùng denNgay khi không có dòng lạc nào', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026'), d('A', '20/07/2026')));
    expect(kq.ngayCuoiTep).toBe(kq.denNgay);
    expect(kq.ngayCuoiTep).toBe('2026-07-20');
  });
});

describe('suyRaKyVaNgayCat — gọi trực tiếp (không qua docDongChamCong)', () => {
  it('trường hợp bình thường: một tháng, nhiều ngày', () => {
    const kq = suyRaKyVaNgayCat([
      { ngay: '2026-07-01', coGioVao: true },
      { ngay: '2026-07-15', coGioVao: true },
    ]);
    expect(kq.ky).toBe('2026-07');
    expect(kq.denNgay).toBe('2026-07-15');
    expect(kq.ngayCuoiTep).toBe('2026-07-15');
  });

  it('lẫn nhiều tháng thì ném lỗi', () => {
    expect(() => suyRaKyVaNgayCat([
      { ngay: '2026-06-30', coGioVao: true },
      { ngay: '2026-07-01', coGioVao: true },
    ])).toThrow(/lẫn nhiều tháng/i);
  });

  it('không dòng nào coGioVao thì ném lỗi', () => {
    expect(() => suyRaKyVaNgayCat([
      { ngay: '2026-07-01', coGioVao: false },
      { ngay: '2026-07-02', coGioVao: false },
    ])).toThrow(/giờ vào/i);
  });

  it('mảng rỗng thì ném lỗi', () => {
    expect(() => suyRaKyVaNgayCat([])).toThrow(/dữ liệu/i);
  });
});

describe('docDongChamCong', () => {
  it('tìm đúng dòng tiêu đề dù có dòng ghi chú thừa ở đầu', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].tenExcel).toBe('A');
    expect(kq.dong[0].ngay).toBe('2026-07-01');
  });

  it('thiếu dòng tiêu đề thì ném lỗi kèm gợi ý đúng sheet', () => {
    expect(() => docDongChamCong([['linh tinh']])).toThrow(/Tên nhân viên/);
    expect(() => docDongChamCong([['linh tinh']])).toThrow(/CHI TIẾT THEO NGÀY/);
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
    // ngày cắt (suyRaKyVaNgayCat cần ít nhất một dòng có giờ vào/ra). Để inSang rỗng thì tệp
    // không còn dòng nào có giờ vào/ra và bị chặn bởi lỗi "Không có dòng nào ghi giờ vào/ra"
    // trước khi kịp chạm tới điều đang muốn kiểm ở đây.
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

  it('ngày sai định dạng thì ném lỗi kèm số dòng và định dạng đúng', () => {
    expect(() => docDongChamCong(raw(d('A', '2026-07-01')))).toThrow(/dòng 4/);
    expect(() => docDongChamCong(raw(d('A', '2026-07-01')))).toThrow(/dd\/MM\/yyyy/);
  });

  it('mọi cột đọc đúng vị trí — khoá cả object dòng đầu để lộ ngay một cột bị lệch', () => {
    //                     [0]tên     [1]ngày        [2]thứ  [3]inSáng [4]inChiều [5]out    [6]tăngCa [7]muộn [8]sớm [9]nghỉ
    const hang = ['Bích', '05/07/2026', 'CN', '07:55', '13:28', '17:35', '0:15', '3', '7', ''];
    const kq = docDongChamCong(raw(hang));
    expect(kq.dong[0]).toEqual({
      tenExcel: 'Bích', ngay: '2026-07-05', thu: 'CN',
      inSang: '07:55', inChieu: '13:28', out: '17:35',
      tangCa: 15, diMuon: 3, veSom: 7,
      nghi: false, nghiText: null, nghiVan: null,
    });
    expect(kq.canhBao).toHaveLength(0);
  });
});

describe('Đi muộn / Về sớm / Tăng ca — giá trị lạ KHÔNG được lặng lẽ thành 0 hay null', () => {
  it('cột Đi muộn dạng h:mm (hình dạng máy vẫn ghi ở cột Tăng ca): cảnh báo, tính 0', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '17:30', '', '1:27')));
    expect(kq.dong[0].diMuon).toBe(0);
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/Đi muộn/);
    expect(kq.canhBao[0]).toMatch(/1:27/);
  });

  it('cột Đi muộn rác không phải số: cảnh báo, tính 0', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '17:30', '', 'abc')));
    expect(kq.dong[0].diMuon).toBe(0);
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/Đi muộn/);
  });

  it('cột Về sớm số âm: KHÔNG được lọt thẳng qua như trước, phải cảnh báo và tính 0', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '17:30', '', '0', '-30')));
    expect(kq.dong[0].veSom).toBe(0);
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/Về sớm/);
    expect(kq.canhBao[0]).toMatch(/-30/);
  });

  it('cột Tăng ca rác không phải số cũng phải cảnh báo, không lặng lẽ thành null giống ô rỗng', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '17:30', 'abc')));
    expect(kq.dong[0].tangCa).toBeNull();
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/Tăng ca/);
  });

  it('ba cột đều rỗng thì không cảnh báo gì — rỗng khác rác', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.canhBao).toHaveLength(0);
  });
});

describe('giờ out < giờ in chiều — nhánh nghiVan (đo trên T2/T6/T7: 0 dòng khớp — test là đặc tả duy nhất của nhánh này)', () => {
  it('inChieu rỗng, out "sớm" hơn giờ in sáng: về sớm PHẢI giữ nguyên (không phải trường hợp giờ ra ghi nhầm)', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '', '12:00', '', '0', '90')));
    expect(kq.dong[0].veSom).toBe(90);
    expect(kq.dong[0].nghiVan).toBeNull();
    expect(kq.canhBao).toHaveLength(0);
  });

  it('out đúng bằng inChieu (biên, không nhỏ hơn): không cảnh báo, về sớm giữ nguyên', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '13:30', '', '0', '90')));
    expect(kq.dong[0].veSom).toBe(90);
    expect(kq.dong[0].nghiVan).toBeNull();
    expect(kq.canhBao).toHaveLength(0);
  });

  it('out < inChieu nhưng veSom vốn đã bằng 0: không cảnh báo, nghiVan vẫn null', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '12:00', '', '0', '0')));
    expect(kq.dong[0].veSom).toBe(0);
    expect(kq.dong[0].nghiVan).toBeNull();
    expect(kq.canhBao).toHaveLength(0);
  });

  it('hai dòng cùng lỗi trong một tệp: canhBao có đúng 2 phần tử, chỉ đúng 2 dòng đó bị sửa', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '12:00', '', '0', '330'),
      d('B', '01/07/2026', '08:00', '13:30', '11:00', '', '0', '150'),
      d('C', '01/07/2026', '08:00', '13:30', '17:00', '', '0', '20')));
    expect(kq.canhBao).toHaveLength(2);
    const A = kq.dong.find(x => x.tenExcel === 'A');
    const B = kq.dong.find(x => x.tenExcel === 'B');
    const C = kq.dong.find(x => x.tenExcel === 'C');
    expect(A.veSom).toBe(0);
    expect(A.nghiVan).toBe('GIO_OUT_TRUOC_GIO_IN_CHIEU');
    expect(B.veSom).toBe(0);
    expect(B.nghiVan).toBe('GIO_OUT_TRUOC_GIO_IN_CHIEU');
    expect(C.veSom).toBe(20);
    expect(C.nghiVan).toBeNull();
  });
});

describe('nghiText — giữ nguyên chữ gốc cột Nghỉ (KHÔNG đổi cách tính nghi)', () => {
  it('có chữ thì nghiText giữ nguyên (đã trim), nghi vẫn chỉ là boolean true', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026', '08:00', '', '', '', '0', '0', 'Nghỉ sáng')));
    expect(kq.dong[0].nghi).toBe(true);
    expect(kq.dong[0].nghiText).toBe('Nghỉ sáng');
  });

  it('rỗng thì nghiText là null, không phải chuỗi rỗng', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].nghi).toBe(false);
    expect(kq.dong[0].nghiText).toBeNull();
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

describe('noiTenNhanVien — chuẩn hoá Unicode/khoảng trắng trước khi so khớp', () => {
  it('NFD (dấu tổ hợp, có thể phát sinh khi gõ tay ten_cham_cong) vẫn khớp NFC (Excel máy xuất)', () => {
    const nfc = 'Đỗ Văn Xuân';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc); // xác nhận hai chuỗi thật sự khác nhau ở tầng byte trước khi test
    const kq = noiTenNhanVien([{ tenExcel: nfc }], [{ id: 'dvx', ten_cham_cong: nfd }]);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('dvx');
    expect(kq.tenChuaBiet).toEqual([]);
  });

  it('khoảng trắng kép ở giữa tên (ten_cham_cong gõ tay lỡ tay) vẫn khớp', () => {
    const kq = noiTenNhanVien(
      [{ tenExcel: 'Đỗ Văn Xuân' }], [{ id: 'dvx', ten_cham_cong: 'Đỗ  Văn   Xuân' }]);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('dvx');
  });

  it('hai nhân viên cùng khai một ten_cham_cong thì ném lỗi, không lặng lẽ lấy người cuối', () => {
    const trung = [
      { id: 'a1', ten_cham_cong: 'Trùng Tên' },
      { id: 'a2', ten_cham_cong: 'Trùng Tên' },
    ];
    let loi = null;
    try {
      noiTenNhanVien([{ tenExcel: 'Trùng Tên' }], trung);
    } catch (e) {
      loi = e;
    }
    expect(loi).not.toBeNull();
    expect(loi.message).toContain('a1');
    expect(loi.message).toContain('a2');
    expect(loi.message).toContain('Trùng Tên');
  });
});
