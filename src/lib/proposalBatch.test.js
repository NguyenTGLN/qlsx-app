import { describe, it, expect } from 'vitest';
import { nextBatchCode } from './proposalBatch';

describe('nextBatchCode — mã đợt DX-DDMMYY-NN', () => {
  it('chưa có đợt nào trong ngày → bắt đầu từ 01', () => {
    expect(nextBatchCode([], '2026-07-29')).toBe('DX-290726-01');
  });

  it('đã có đợt hôm nay → lấy số kế tiếp', () => {
    expect(nextBatchCode(['DX-290726-01', 'DX-290726-02'], '2026-07-29')).toBe('DX-290726-03');
  });

  it('bỏ qua đợt của ngày khác', () => {
    expect(nextBatchCode(['DX-280726-07', 'DX-300726-09'], '2026-07-29')).toBe('DX-290726-01');
  });

  it('không lấp lỗ hổng — luôn lớn hơn số lớn nhất', () => {
    expect(nextBatchCode(['DX-290726-01', 'DX-290726-05'], '2026-07-29')).toBe('DX-290726-06');
  });

  it('mã hỏng trong danh sách thì bỏ qua, không làm sập', () => {
    expect(nextBatchCode(['DX-290726-XX', null, '', 'rac'], '2026-07-29')).toBe('DX-290726-01');
  });

  it('quá 99 đợt trong ngày vẫn tăng, không cắt còn 2 chữ số', () => {
    expect(nextBatchCode(['DX-290726-99'], '2026-07-29')).toBe('DX-290726-100');
  });
});
