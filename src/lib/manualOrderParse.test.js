import { describe, it, expect } from 'vitest';
import { parseManualOrders } from './manualOrderParse';

const order = (orderCode, products) => ({ id: 1, orderCode, products });
const prod = (code, qty, extra = {}) => ({ id: 1, code, name: '', qty, unit: '', ...extra });

describe('parseManualOrders', () => {
  it('trải phẳng nhiều mã SP của 1 đơn thành từng item mang cùng orderCode', () => {
    const { items, error } = parseManualOrders([
      order('DH-001', [prod('A', '10', { name: 'Máy A', unit: 'Cái' }), prod('B', '5', { unit: 'Bộ' })]),
    ]);
    expect(error).toBe(null);
    expect(items).toEqual([
      { orderCode: 'DH-001', productCode: 'A', productName: 'Máy A', qty: 10, unit: 'Cái' },
      { orderCode: 'DH-001', productCode: 'B', productName: '', qty: 5, unit: 'Bộ' },
    ]);
  });

  it('nhiều đơn — mỗi item giữ orderCode của đơn tương ứng', () => {
    const { items } = parseManualOrders([
      order('DH-001', [prod('A', '1')]),
      order('DH-002', [prod('B', '2')]),
    ]);
    expect(items.map(i => i.orderCode)).toEqual(['DH-001', 'DH-002']);
  });

  it('bỏ qua ô sản phẩm trống hoàn toàn (không code, không qty)', () => {
    const { items, error } = parseManualOrders([
      order('DH-001', [prod('A', '1'), prod('', '')]),
    ]);
    expect(error).toBe(null);
    expect(items).toHaveLength(1);
  });

  it('trim mã đơn, mã SP và đơn vị', () => {
    const { items } = parseManualOrders([
      order('  DH-001  ', [prod('  A  ', '1', { unit: '  Cái  ' })]),
    ]);
    expect(items[0]).toMatchObject({ orderCode: 'DH-001', productCode: 'A', unit: 'Cái' });
  });

  it('đơn có mã SP hợp lệ nhưng thiếu Mã đơn hàng → lỗi theo số thứ tự đơn', () => {
    const { error } = parseManualOrders([
      order('DH-001', [prod('A', '1')]),
      order('   ', [prod('B', '2')]),
    ]);
    expect(error).toBe('Đơn hàng 2: thiếu Mã đơn hàng.');
  });

  it('thiếu Mã sản phẩm (có qty) → lỗi theo số thứ tự đơn + sản phẩm', () => {
    const { error } = parseManualOrders([
      order('DH-001', [prod('', '3')]),
    ]);
    expect(error).toBe('Đơn hàng 1 — Sản phẩm 1: thiếu Mã sản phẩm.');
  });

  it('Số lượng không hợp lệ (0, âm, không phải số) → lỗi', () => {
    expect(parseManualOrders([order('DH-001', [prod('A', '0')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
    expect(parseManualOrders([order('DH-001', [prod('A', '-2')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
    expect(parseManualOrders([order('DH-001', [prod('A', 'abc')])]).error)
      .toBe('Đơn hàng 1 — Sản phẩm 1: Số lượng phải lớn hơn 0.');
  });

  it('không có item hợp lệ nào → lỗi yêu cầu nhập ít nhất 1 dòng', () => {
    const { items, error } = parseManualOrders([order('', [prod('', '')])]);
    expect(items).toEqual([]);
    expect(error).toBe('Vui lòng nhập ít nhất 1 đơn hàng có Mã đơn, Mã sản phẩm và Số lượng hợp lệ!');
  });

  it('đơn hoàn toàn trống bị bỏ qua, không chặn đơn hợp lệ khác', () => {
    const { items, error } = parseManualOrders([
      order('', [prod('', '')]),
      order('DH-002', [prod('B', '2')]),
    ]);
    expect(error).toBe(null);
    expect(items).toEqual([
      { orderCode: 'DH-002', productCode: 'B', productName: '', qty: 2, unit: '' },
    ]);
  });
});
