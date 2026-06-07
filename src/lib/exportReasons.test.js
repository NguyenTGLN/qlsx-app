import { describe, it, expect } from 'vitest';
import { EXPORT_REASONS, reasonType, reasonNeedsOrderRef } from './exportReasons';

describe('exportReasons', () => {
  it('có đủ 27 lý do', () => {
    expect(EXPORT_REASONS).toHaveLength(27);
  });

  it('mỗi lý do có label không rỗng và type hợp lệ', () => {
    const valid = new Set(['XB', 'XBS', 'XDG', 'KHAC']);
    for (const r of EXPORT_REASONS) {
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
      expect(valid.has(r.type)).toBe(true);
    }
  });

  it('label là duy nhất', () => {
    const labels = EXPORT_REASONS.map(r => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('reasonType trả đúng loại', () => {
    expect(reasonType('Bán ra')).toBe('XB');
    expect(reasonType('Xuất bảo hành')).toBe('XB');
    expect(reasonType('Xuất tặng')).toBe('XB');
    expect(reasonType('Xuất đóng hàng')).toBe('XDG');
    expect(reasonType('Xuất bổ sung')).toBe('XBS');
    expect(reasonType('Xuất sản xuất')).toBe('XBS');
    expect(reasonType('Xuất sửa chữa')).toBe('XBS');
    expect(reasonType('Trả cho khách')).toBe('KHAC');
    expect(reasonType('Tháo máy')).toBe('KHAC');
  });

  it('reasonType với lý do lạ trả KHAC', () => {
    expect(reasonType('không tồn tại')).toBe('KHAC');
  });

  it('chỉ nhóm sản xuất cần chọn Phiếu SX', () => {
    expect(reasonNeedsOrderRef('Xuất sản xuất')).toBe(true);
    expect(reasonNeedsOrderRef('Xuất bổ sung')).toBe(true);
    expect(reasonNeedsOrderRef('Xuất sửa chữa')).toBe(true);
    expect(reasonNeedsOrderRef('Bán ra')).toBe(false);
    expect(reasonNeedsOrderRef('Xuất đóng hàng')).toBe(false);
  });
});
