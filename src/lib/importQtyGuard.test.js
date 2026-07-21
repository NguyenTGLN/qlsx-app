import { describe, it, expect } from 'vitest';
import { findZeroQtyItems, zeroQtyWarning } from './importQtyGuard';

// Khối mẫu giống cấu trúc block trong ImportStockTab:
// { sourceValue, items: [{ code, name, selected?, locations: [{ import_qty }] }] }
const loc = (q) => ({ location: 'GM1', current_qty: 0, import_qty: q });

describe('findZeroQtyItems', () => {
  it('bắt được mã đang chọn nhưng tổng SL nhập = 0 (bị rơi âm thầm khi lưu)', () => {
    const blocks = [
      { sourceValue: 'VNI05104152185', items: [
        { code: 'PREF-1-10', name: 'Bộ lọc chặn 1 cốc', locations: [loc(0), loc(1)] },
        { code: 'ECOM8000', name: 'Bộ lọc nước thương mại', locations: [loc(0)] },
      ]},
    ];
    expect(findZeroQtyItems(blocks)).toEqual([
      { source: 'VNI05104152185', code: 'ECOM8000', name: 'Bộ lọc nước thương mại' },
    ]);
  });

  it('bỏ qua mã đã bỏ tick (selected === false) — người dùng cố ý không nhập', () => {
    const blocks = [
      { sourceValue: 'DH1', items: [
        { code: 'A', name: 'A', selected: false, locations: [loc(0)] },
      ]},
    ];
    expect(findZeroQtyItems(blocks)).toEqual([]);
  });

  it('bắt được mã chưa có vị trí nhập nào (locations rỗng)', () => {
    const blocks = [
      { sourceValue: 'DH1', items: [{ code: 'B', name: 'B', locations: [] }] },
    ];
    expect(findZeroQtyItems(blocks)).toEqual([{ source: 'DH1', code: 'B', name: 'B' }]);
  });

  it('cộng dồn nhiều vị trí trước khi kết luận = 0', () => {
    const blocks = [
      { sourceValue: 'DH1', items: [{ code: 'C', name: 'C', locations: [loc(0), loc(0), loc(2)] }] },
    ];
    expect(findZeroQtyItems(blocks)).toEqual([]);
  });

  it('quét mọi khối, giữ đúng mã đơn của từng khối', () => {
    const blocks = [
      { sourceValue: 'DH1', items: [{ code: 'A', name: 'A', locations: [loc(0)] }] },
      { sourceValue: 'DH2', items: [{ code: 'A', name: 'A', locations: [loc(1)] }] },
      { sourceValue: 'DH3', items: [{ code: 'B', name: 'B', locations: [loc(0)] }] },
    ];
    expect(findZeroQtyItems(blocks)).toEqual([
      { source: 'DH1', code: 'A', name: 'A' },
      { source: 'DH3', code: 'B', name: 'B' },
    ]);
  });

  it('chịu được dữ liệu thiếu/không hợp lệ', () => {
    expect(findZeroQtyItems([])).toEqual([]);
    expect(findZeroQtyItems(undefined)).toEqual([]);
    expect(findZeroQtyItems([{ sourceValue: 'DH1' }])).toEqual([]);
    expect(findZeroQtyItems([{ items: [{ code: 'X', name: 'X', locations: [{ import_qty: '' }] }] }]))
      .toEqual([{ source: '', code: 'X', name: 'X' }]);
  });
});

describe('zeroQtyWarning', () => {
  it('không có mã nào SL 0 → không cảnh báo', () => {
    expect(zeroQtyWarning([])).toBe('');
  });

  it('nêu rõ mã sẽ bị bỏ, gom theo mã đơn', () => {
    const msg = zeroQtyWarning([
      { source: 'VNI05104152185', code: 'ECOM8000', name: 'Bộ lọc nước thương mại' },
      { source: 'VNI05104152185', code: 'WT-028S-RO', name: 'Máy lọc nước nóng lạnh' },
      { source: 'DH2', code: 'A', name: 'Hàng A' },
    ]);
    expect(msg).toContain('ECOM8000');
    expect(msg).toContain('WT-028S-RO');
    expect(msg).toContain('VNI05104152185');
    expect(msg).toContain('DH2');
    // Mã đơn chỉ xuất hiện 1 lần dù có 2 mã hàng
    expect(msg.match(/VNI05104152185/g)).toHaveLength(1);
  });

  it('khối không có mã đơn vẫn hiển thị được', () => {
    expect(zeroQtyWarning([{ source: '', code: 'X', name: 'X' }])).toContain('X');
  });
});
