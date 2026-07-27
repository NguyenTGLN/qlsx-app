import { describe, it, expect } from 'vitest';
import { buildReceiptProps } from './receiptView';

const ORDER_XK = {
  order_code: 'PSX-20260723-08',
  type: 'XUẤT SẢN XUẤT',
  created_at: '2026-07-24T11:07:55+07:00',
  created_by: 'ntth',
};
const LOGS_XK = [
  { component_code: 'F-OCB10', component_name: 'Lõi 10OCB', location: 'FM17', quantity_taken: -200, quantity_after: 0, notes: 'XUẤT SẢN XUẤT' },
  { component_code: 'F-PP10', component_name: 'Lõi 10PP5', location: 'GM10', quantity_taken: -132, quantity_after: 1368, notes: 'XUẤT SẢN XUẤT' },
];
const OPTS = { unitMap: { 'F-OCB10': 'Cái', 'F-PP10': 'Cái' }, nccMap: {} };

describe('buildReceiptProps — phiếu xuất', () => {
  it('nhận diện phiếu xuất kho', () => {
    expect(buildReceiptProps(ORDER_XK, LOGS_XK, OPTS).kind).toBe('XK');
  });

  it('dựng đủ dòng hàng kèm vị trí và tồn còn lại', () => {
    const { rows } = buildReceiptProps(ORDER_XK, LOGS_XK, OPTS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ma: 'F-OCB10', ten: 'Lõi 10OCB', dvt: 'Cái', sl: 200, kho: 'FM17', slConLai: 0 });
    expect(rows[1]).toMatchObject({ ma: 'F-PP10', sl: 132, kho: 'GM10', slConLai: 1368 });
  });

  it('số lượng lấy luôn là số dương dù log lưu số âm', () => {
    expect(buildReceiptProps(ORDER_XK, LOGS_XK, OPTS).rows.map(r => r.sl)).toEqual([200, 132]);
  });

  it('điền Người nhận theo tài khoản lập phiếu', () => {
    expect(buildReceiptProps(ORDER_XK, LOGS_XK, OPTS).nguoiNhan).toBe('Nguyễn Văn Hĩu');
  });

  it('gộp ghi chú các dòng thành Nội dung, không lặp', () => {
    expect(buildReceiptProps(ORDER_XK, LOGS_XK, OPTS).reason).toBe('XUẤT SẢN XUẤT');
  });

  it('không có ghi chú thì lấy loại phiếu làm Nội dung', () => {
    const logs = LOGS_XK.map(l => ({ ...l, notes: '' }));
    expect(buildReceiptProps(ORDER_XK, logs, OPTS).reason).toBe('XUẤT SẢN XUẤT');
  });
});

describe('buildReceiptProps — phiếu nhập', () => {
  const ORDER_NK = { order_code: 'PNK-20260725-08', type: 'NHẬP KHO', created_at: '2026-07-25T10:08:43+07:00', created_by: 'ptt' };
  const LOGS_NK = [
    { component_code: 'X1', component_name: 'Hàng X', location: 'A1', quantity_taken: 50, quantity_after: 50, notes: 'Nhập mua vào - Công ty ABC', ma_don_hang: 'DH01' },
  ];
  const opts = { unitMap: { X1: 'Cái' }, nccMap: { 'công ty abc': { dia_chi: 'Hà Nội', so_dien_thoai: '0900' } } };

  it('tách notes thành Lý do nhập và Nguồn nhập', () => {
    const p = buildReceiptProps(ORDER_NK, LOGS_NK, opts);
    expect(p.kind).toBe('NK');
    expect(p.reason).toBe('Nhập mua vào');
    expect(p.source).toBe('Công ty ABC');
  });

  it('tra địa chỉ + SĐT theo nhà cung cấp của nguồn nhập', () => {
    const p = buildReceiptProps(ORDER_NK, LOGS_NK, opts);
    expect(p.diaChi).toBe('Hà Nội');
    expect(p.sdt).toBe('0900');
  });

  it('giữ mã đơn hàng của từng dòng', () => {
    expect(buildReceiptProps(ORDER_NK, LOGS_NK, opts).rows[0].maDonHang).toBe('DH01');
  });
});

describe('buildReceiptProps — mã thành phẩm của phiếu sản xuất', () => {
  const logs = LOGS_XK.map(l => ({ ...l, product_code: 'CLO-XS' }));
  const opts = { ...OPTS, nameMap: { 'CLO-XS': 'Bộ lọc tổng USTopwater, model: Clo-XS' } };

  it('lấy mã thành phẩm từ product_code của các dòng bốc dỡ', () => {
    expect(buildReceiptProps(ORDER_XK, logs, opts).thanhPham).toEqual([
      { ma: 'CLO-XS', ten: 'Bộ lọc tổng USTopwater, model: Clo-XS' },
    ]);
  });

  it('phiếu sản xuất nhiều mã thì liệt kê đủ, không trùng lặp', () => {
    const nhieuMa = [
      { ...LOGS_XK[0], product_code: 'CLO-XS' },
      { ...LOGS_XK[1], product_code: 'WT-028S-RO' },
      { ...LOGS_XK[0], product_code: 'CLO-XS' },
    ];
    expect(buildReceiptProps(ORDER_XK, nhieuMa, opts).thanhPham.map(p => p.ma))
      .toEqual(['CLO-XS', 'WT-028S-RO']);
  });

  it('không tra được tên thì vẫn giữ mã', () => {
    expect(buildReceiptProps(ORDER_XK, logs, OPTS).thanhPham).toEqual([{ ma: 'CLO-XS', ten: '' }]);
  });

  it('bỏ qua mã giả của các loại phiếu không phải sản xuất', () => {
    for (const gia of ['DON_HANG', 'XUAT_KHO', 'NHAP_KHO', 'CHUYEN_SX']) {
      const l = LOGS_XK.map(x => ({ ...x, product_code: gia }));
      expect(buildReceiptProps(ORDER_XK, l, opts).thanhPham).toEqual([]);
    }
  });

  it('phiếu không có product_code thì danh sách rỗng, không lỗi', () => {
    expect(buildReceiptProps(ORDER_XK, LOGS_XK, opts).thanhPham).toEqual([]);
  });
});

describe('buildReceiptProps — phiếu chuyển vị trí', () => {
  it('nhận diện phiếu chuyển vị trí SX', () => {
    const order = { ...ORDER_XK, order_code: 'PCV-20260723-01', type: 'CHUYỂN VỊ TRÍ SX' };
    expect(buildReceiptProps(order, LOGS_XK, OPTS).kind).toBe('CV');
  });
});
