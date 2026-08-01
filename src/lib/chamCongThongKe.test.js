import { describe, it, expect } from 'vitest';
import {
  nhanNhomGon, docNhomTuKpi, thongKeMotNguoi, thongKeNhom, gomThongKe, tongTatCa,
} from './chamCongThongKe';
import { apDungChamTuDong } from './kpiTuDong';

describe('nhanNhomGon', () => {
  it('cắt phần trước dấu — để lấy tên nhóm ngắn', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT')).toBe('SẢN XUẤT');
    expect(nhanNhomGon('CHUYÊN CẦN — TOÀN CÔNG TY')).toBe('TOÀN CÔNG TY');
  });

  it('không có dấu — thì giữ nguyên cả chuỗi (kỳ 2026-06 chỉ có một nhóm chung)', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN')).toBe('CHUYÊN CẦN BỘ PHẬN');
  });

  it('rỗng / null → chuỗi rỗng, không ném lỗi', () => {
    expect(nhanNhomGon('')).toBe('');
    expect(nhanNhomGon(null)).toBe('');
    expect(nhanNhomGon(undefined)).toBe('');
  });
});

describe('docNhomTuKpi', () => {
  const caNhan = (nv, khoa) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
    nhan_vien_id: nv, lien_ket_bo_phan: khoa, ten: 'CHUYÊN CẦN BỘ PHẬN',
  });
  const boPhan = (khoa, ten) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
    nhan_vien_id: null, lien_ket_bo_phan: khoa, ten,
  });

  it('gom được người → khoá nhóm, và khoá nhóm → nhãn', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([
      boPhan('CHUYEN_CAN_SX', 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
      caNhan('dvx', 'CHUYEN_CAN_SX'),
      caNhan('vta', 'CHUYEN_CAN_SX'),
      boPhan('CHUYEN_CAN_CSKH', 'CHUYÊN CẦN BỘ PHẬN — CSKH'),
      caNhan('hhx', 'CHUYEN_CAN_CSKH'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('vta')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('hhx')).toBe('CHUYEN_CAN_CSKH');
    expect(nhan.get('CHUYEN_CAN_SX')).toBe('SẢN XUẤT');
    expect(nhan.get('CHUYEN_CAN_CSKH')).toBe('CSKH');
  });

  it('bỏ qua dòng chỉ tiêu KHÁC — không phải chỉ tiêu nào cũng là nhóm chuyên cần', () => {
    const { theoNguoi } = docNhomTuKpi([
      { ma: 'HT_CONG_VIEC_DUNG_HAN', cap_do: 'CA_NHAN', nhan_vien_id: 'dvx', lien_ket_bo_phan: 'RAC' },
      caNhan('dvx', 'CHUYEN_CAN_SX'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
  });

  it('nhóm có người nhưng THIẾU dòng BO_PHAN → nhãn lấy chính khoá, không mất người', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([caNhan('dvx', 'CHUYEN_CAN_SX')]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(nhan.get('CHUYEN_CAN_SX')).toBeUndefined();
  });

  it('mảng rỗng / undefined → hai Map rỗng, không ném lỗi', () => {
    expect(docNhomTuKpi([]).theoNguoi.size).toBe(0);
    expect(docNhomTuKpi().nhan.size).toBe(0);
  });
});

describe('thongKeMotNguoi', () => {
  const d = (ngay, o = {}) => ({
    nhan_vien_id: 'a', ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o,
  });
  const khongMien = () => false;

  it('nghỉ 4 ngày không ngày nào có dấu → 1 phép, 3 quá quy định (ca của Tuấn kỳ 7)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { nghi: true }), d('2026-07-02', { nghi: true }),
      d('2026-07-03', { nghi: true }), d('2026-07-06', { nghi: true }),
    ], khongMien);
    expect(tk.tongNghi).toBe(4);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(3);
  });

  it('nghỉ 2 ngày, 1 ngày có dấu Đặc biệt → 2 phép, 0 quá quy định (ca của Xuyên kỳ 7)', () => {
    const tk = thongKeMotNguoi(
      [d('2026-07-18', { nghi: true }), d('2026-07-21', { nghi: true })],
      ngay => ngay === '2026-07-18');
    expect(tk.tongNghi).toBe(2);
    expect(tk.nghiPhep).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.soNgayMien).toBe(1);
  });

  it('nghỉ đúng 1 ngày → vừa hết hạn mức, không quá quy định', () => {
    const tk = thongKeMotNguoi([d('2026-07-06', { nghi: true })], khongMien);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('không nghỉ ngày nào → tất cả bằng 0', () => {
    const tk = thongKeMotNguoi([d('2026-07-01'), d('2026-07-02')], khongMien);
    expect(tk.tongNghi).toBe(0);
    expect(tk.nghiPhep).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('cộng phút đi muộn và về sớm', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { di_muon_phut: 20 }),
      d('2026-07-02', { di_muon_phut: 6, ve_som_phut: 15 }),
    ], khongMien);
    expect(tk.phutMuon).toBe(26);
    expect(tk.phutVeSom).toBe(15);
  });

  it('ngày có dấu Đặc biệt KHÔNG tính phút muộn (giống hệt cách KPI bỏ ngày miễn)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-20', { di_muon_phut: 1 }),
      d('2026-07-21', { di_muon_phut: 11 }),
    ], ngay => ngay === '2026-07-20');
    expect(tk.phutMuon).toBe(11);
    expect(tk.soNgayMien).toBe(1);
  });

  it('cột số là null/chuỗi từ DB vẫn cộng ra số, không ra NaN', () => {
    const tk = thongKeMotNguoi([
      { ngay: '2026-07-01', di_muon_phut: null, ve_som_phut: undefined, nghi: false },
      { ngay: '2026-07-02', di_muon_phut: '5', ve_som_phut: '3', nghi: false },
    ], khongMien);
    expect(tk.phutMuon).toBe(5);
    expect(tk.phutVeSom).toBe(3);
  });

  it('không có dòng nào → tất cả 0, không ném lỗi', () => {
    const tk = thongKeMotNguoi([], khongMien);
    expect(tk).toEqual({
      tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0,
      phutMuon: 0, phutVeSom: 0, soNgayMien: 0,
    });
  });
});

describe('khoá với KPI — nghiQuaQuyDinh phải bằng vuotPhep mà kpiTuDong dùng để trừ điểm', () => {
  const d = ngay => ({
    nhan_vien_id: 'a', ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: true,
  });
  const chiTieu = { id: 'ct', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_CA_NHAN', chi_tieu: 10 };

  // vuotPhep KPI đang dùng, suy ngược từ điểm: truNghi = vuotPhep × 3, không có phút muộn nào.
  const vuotPhepTheoKpi = (chamCong, ngoaiLe) => {
    const kq = apDungChamTuDong([chiTieu], [], [], '2026-07', '2026-07-31', [], chamCong, ngoaiLe);
    return (10 - kq.rows[0].diem_chot) / 3;
  };

  it('4 ngày nghỉ, không ngày nào có dấu', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03'), d('2026-07-06')];
    const tk = thongKeMotNguoi(cc, () => false);
    expect(tk.nghiQuaQuyDinh).toBe(3);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, []));
  });

  it('4 ngày nghỉ, 1 ngày có dấu Đặc biệt', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03'), d('2026-07-06')];
    const ngoaiLe = [{ nhan_vien_id: 'a', ngay: '2026-07-02', ly_do: 'ốm' }];
    const tk = thongKeMotNguoi(cc, ngay => ngay === '2026-07-02');
    expect(tk.nghiQuaQuyDinh).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, ngoaiLe));
  });

  it('1 ngày nghỉ trong hạn mức — cả hai đều ra 0', () => {
    const cc = [d('2026-07-06')];
    const tk = thongKeMotNguoi(cc, () => false);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, []));
  });

  it('mọi ngày nghỉ đều có dấu — cả hai đều ra 0', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03')];
    const ngoaiLe = cc.map(c => ({ nhan_vien_id: 'a', ngay: c.ngay, ly_do: 'ốm' }));
    const tk = thongKeMotNguoi(cc, () => true);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, ngoaiLe));
  });
});

describe('gomThongKe', () => {
  const cc = (nv, ngay, o = {}) => ({
    nhan_vien_id: nv, ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o,
  });
  const caNhan = (nv, khoa) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
    nhan_vien_id: nv, lien_ket_bo_phan: khoa,
  });
  const boPhan = (khoa, ten) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
    nhan_vien_id: null, lien_ket_bo_phan: khoa, ten,
  });

  const kpiRows = [
    boPhan('CHUYEN_CAN_SX', 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
    boPhan('CHUYEN_CAN_CSKH', 'CHUYÊN CẦN BỘ PHẬN — CSKH'),
    caNhan('dvx', 'CHUYEN_CAN_SX'), caNhan('vta', 'CHUYEN_CAN_SX'),
    caNhan('hhx', 'CHUYEN_CAN_CSKH'),
  ];
  const users = [
    { id: 'dvx', name: 'Xuân' }, { id: 'vta', name: 'Tuấn' }, { id: 'hhx', name: 'Xuyên' },
  ];
  const rows = [
    cc('dvx', '2026-07-01', { nghi: true }), cc('dvx', '2026-07-02', { di_muon_phut: 20 }),
    cc('vta', '2026-07-01', { nghi: true }), cc('vta', '2026-07-02', { nghi: true }),
    cc('hhx', '2026-07-01', { di_muon_phut: 5 }),
  ];

  it('gom đúng nhóm, cộng đúng số, kèm danh sách thành viên', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows, users });
    const sx = ds.find(n => n.khoa === 'CHUYEN_CAN_SX');
    expect(sx.nhan).toBe('SẢN XUẤT');
    expect(sx.soNguoi).toBe(2);
    expect(sx.tongNghi).toBe(3);
    expect(sx.nghiPhep).toBe(2);
    expect(sx.nghiQuaQuyDinh).toBe(1);
    expect(sx.phutMuon).toBe(20);
    expect(sx.thanhVien.map(x => x.ten)).toEqual(['Tuấn', 'Xuân']);
  });

  it('sắp nhóm theo số người giảm dần', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows, users });
    expect(ds.map(n => n.khoa)).toEqual(['CHUYEN_CAN_SX', 'CHUYEN_CAN_CSKH']);
  });

  it('người có chấm công mà không có dòng KPI → nhóm "Chưa phân nhóm", luôn xếp CUỐI', () => {
    const ds = gomThongKe({
      rows: [...rows, cc('moi', '2026-07-01', { nghi: true })],
      ngoaiLe: [], kpiRows, users,
    });
    const cuoi = ds[ds.length - 1];
    expect(cuoi.khoa).toBeNull();
    expect(cuoi.nhan).toBe('Chưa phân nhóm');
    expect(cuoi.soNguoi).toBe(1);
    expect(cuoi.thanhVien[0].ten).toBe('moi');
  });

  it('ngoaiLe áp đúng người đúng ngày, không lẫn sang người khác', () => {
    const ds = gomThongKe({
      rows, kpiRows, users,
      ngoaiLe: [{ nhan_vien_id: 'vta', ngay: '2026-07-01', ly_do: 'ốm' }],
    });
    const sx = ds.find(n => n.khoa === 'CHUYEN_CAN_SX');
    const tuan = sx.thanhVien.find(x => x.ten === 'Tuấn');
    const xuan = sx.thanhVien.find(x => x.ten === 'Xuân');
    expect(tuan.nghiQuaQuyDinh).toBe(0);
    expect(xuan.tongNghi).toBe(1);
    expect(xuan.soNgayMien).toBe(0);
  });

  it('kpiRows rỗng (không đọc được KPI) → tất cả dồn vào một nhóm "Chưa phân nhóm"', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows: [], users });
    expect(ds).toHaveLength(1);
    expect(ds[0].khoa).toBeNull();
    expect(ds[0].soNguoi).toBe(3);
  });

  it('không có dòng chấm công nào → mảng rỗng', () => {
    expect(gomThongKe({ rows: [], ngoaiLe: [], kpiRows, users })).toEqual([]);
  });
});

describe('tongTatCa', () => {
  it('cộng mọi thành viên của mọi nhóm, đếm đúng số người', () => {
    const ds = [
      { soNguoi: 2, thanhVien: [
        { tongNghi: 1, nghiPhep: 1, nghiQuaQuyDinh: 0, phutMuon: 20, phutVeSom: 0, soNgayMien: 0 },
        { tongNghi: 2, nghiPhep: 1, nghiQuaQuyDinh: 1, phutMuon: 0, phutVeSom: 5, soNgayMien: 0 },
      ] },
      { soNguoi: 1, thanhVien: [
        { tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0, phutMuon: 3, phutVeSom: 0, soNgayMien: 1 },
      ] },
    ];
    expect(tongTatCa(ds)).toEqual({
      soNguoi: 3, tongNghi: 3, nghiPhep: 2, nghiQuaQuyDinh: 1,
      phutMuon: 23, phutVeSom: 5, soNgayMien: 1,
    });
  });

  it('mảng rỗng → tất cả 0', () => {
    expect(tongTatCa([]).soNguoi).toBe(0);
  });
});
