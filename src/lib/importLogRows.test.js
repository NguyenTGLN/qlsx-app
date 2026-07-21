import { describe, it, expect } from 'vitest';
import { splitAggIntoLogRows } from './importLogRows';

const ctx = (over = {}) => ({
  orderCode: 'PNK-20260721-01',
  reason: 'Nhập hoàn/hủy',
  userStr: 'Nguyên',
  wipDeducted: new Set(),
  ...over,
});

// entry = 1 ô gộp tồn kho (1 mã hàng tại 1 vị trí), kèm breakdown theo từng khối nguồn
const entry = (over = {}) => ({
  code: 'FK-HYDRO11', name: 'Lõi kiềm H2', location: 'FM14',
  current_qty: 176, sumImport: 3,
  byBlock: {
    a: { source: 'DH1', orderCode: 'DH1', qty: 1 },
    b: { source: 'DH2', orderCode: 'DH2', qty: 1 },
    c: { source: 'DH3', orderCode: 'DH3', qty: 1 },
  },
  ...over,
});

describe('splitAggIntoLogRows', () => {
  it('3 đơn cùng mã hàng cùng vị trí → 3 dòng log, mỗi dòng 1 mã đơn sạch', () => {
    const rows = splitAggIntoLogRows(entry(), ctx());
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.ma_don_hang)).toEqual(['DH1', 'DH2', 'DH3']);
    // không còn chuỗi ghép "DH1, DH2, DH3"
    rows.forEach(r => expect(r.ma_don_hang).not.toContain(','));
  });

  it('tồn trước/sau nối tiếp nhau, dòng cuối khớp tổng nhập', () => {
    const rows = splitAggIntoLogRows(entry(), ctx());
    expect(rows.map(r => [r.quantity_before, r.quantity_taken, r.quantity_after])).toEqual([
      [176, 1, 177],
      [177, 1, 178],
      [178, 1, 179],
    ]);
    expect(rows.at(-1).quantity_after).toBe(176 + 3);
    expect(rows.reduce((s, r) => s + r.quantity_taken, 0)).toBe(3);
  });

  it('giữ nguyên mã hàng / tên / vị trí / người tạo trên mọi dòng', () => {
    const rows = splitAggIntoLogRows(entry(), ctx());
    rows.forEach(r => {
      expect(r.order_code).toBe('PNK-20260721-01');
      expect(r.product_code).toBe('NHAP_KHO');
      expect(r.component_code).toBe('FK-HYDRO11');
      expect(r.component_name).toBe('Lõi kiềm H2');
      expect(r.location).toBe('FM14');
      expect(r.created_by).toBe('Nguyên');
    });
  });

  it('ghi chú kèm nguồn của đúng khối đó', () => {
    const rows = splitAggIntoLogRows(entry(), ctx());
    expect(rows.map(r => r.notes)).toEqual([
      'Nhập hoàn/hủy - DH1', 'Nhập hoàn/hủy - DH2', 'Nhập hoàn/hủy - DH3',
    ]);
  });

  it('khối không có nguồn → ghi chú chỉ còn lý do, mã đơn để null', () => {
    const rows = splitAggIntoLogRows(
      entry({ sumImport: 2, byBlock: { a: { source: '', orderCode: '', qty: 2 } } }),
      ctx({ reason: 'Nhập mới' })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe('Nhập mới');
    expect(rows[0].ma_don_hang).toBeNull();
  });

  it('Nhập thành phẩm: wip_source chỉ gắn cho phiếu SX thực sự bị trừ WIP', () => {
    const rows = splitAggIntoLogRows(
      entry({
        code: 'OF-QD10', sumImport: 2,
        byBlock: {
          a: { source: 'PSX-20260720-07', orderCode: '', qty: 1 },
          b: { source: 'PSX-20260720-08', orderCode: '', qty: 1 },
        },
      }),
      ctx({ reason: 'Nhập thành phẩm', wipDeducted: new Set(['OF-QD10||PSX-20260720-07']) })
    );
    expect(rows.map(r => r.wip_source)).toEqual(['PSX-20260720-07', null]);
  });

  it('lý do khác không bao giờ gắn wip_source', () => {
    const rows = splitAggIntoLogRows(
      entry({ byBlock: { a: { source: 'PSX-20260720-07', orderCode: 'DH1', qty: 3 } } }),
      ctx({ wipDeducted: new Set(['FK-HYDRO11||PSX-20260720-07']) })
    );
    expect(rows[0].wip_source).toBeNull();
  });

  it('thiếu breakdown → vẫn ra 1 dòng gộp, không mất số lượng', () => {
    const rows = splitAggIntoLogRows(entry({ byBlock: undefined, sumImport: 5 }), ctx());
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity_taken).toBe(5);
    expect(rows[0].quantity_after).toBe(181);
  });

  it('cùng một đơn đẩy 2 lần vào cùng ô thì đã được cộng dồn sẵn, không tách thừa', () => {
    const rows = splitAggIntoLogRows(
      entry({ sumImport: 4, byBlock: { a: { source: 'DH1', orderCode: 'DH1', qty: 4 } } }),
      ctx()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity_taken).toBe(4);
  });
});
