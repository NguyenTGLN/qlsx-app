import { test, expect, describe } from 'vitest';
import {
  PROCESSING_STATUSES, PROCESSING_CATEGORIES, WORKFLOW_STEPS_MAU,
  isQualifyingTicket, computeTotalCost, getEffectiveSteps, stepUrgency, TRANG_THAI_XU_LY,
} from './warrantyProcessing';

describe('isQualifyingTicket', () => {
  test('đúng khi status + phân loại đều khớp', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'open', 'phân_loại_công_việc': 'Bảo hành và Chăm sóc khách hàng' })).toBe(true);
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'new', 'phân_loại_công_việc': 'Bảo hành và Chăm sóc khách hàng' })).toBe(true);
  });
  test('sai khi status không thuộc danh sách (closed/solved)', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'closed', 'phân_loại_công_việc': 'Bảo hành và Chăm sóc khách hàng' })).toBe(false);
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'solved', 'phân_loại_công_việc': 'Bảo hành và Chăm sóc khách hàng' })).toBe(false);
  });
  test('sai khi phân loại không khớp giá trị gộp', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'open', 'phân_loại_công_việc': 'Bảo hành' })).toBe(false);
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'open', 'phân_loại_công_việc': 'Kỹ thuật' })).toBe(false);
  });
  test('sai khi null/undefined', () => {
    expect(isQualifyingTicket(null)).toBe(false);
    expect(isQualifyingTicket({})).toBe(false);
  });
});

describe('computeTotalCost', () => {
  test('cộng số_lượng × đơn_giá các dòng tính phí', () => {
    const parts = [
      { 'tên': 'Bơm', 'số_lượng': 2, 'đơn_giá': 100, 'tính_phí': true },
      { 'tên': 'Nguồn', 'số_lượng': 1, 'đơn_giá': 50, 'tính_phí': true },
    ];
    expect(computeTotalCost(parts)).toBe(250);
  });
  test('bỏ qua dòng tính_phí=false', () => {
    const parts = [
      { 'số_lượng': 2, 'đơn_giá': 100, 'tính_phí': true },
      { 'số_lượng': 5, 'đơn_giá': 100, 'tính_phí': false },
    ];
    expect(computeTotalCost(parts)).toBe(200);
  });
  test('giá trị thiếu/không phải số coi như 0', () => {
    expect(computeTotalCost([{ 'tên': 'X', 'tính_phí': true }])).toBe(0);
    expect(computeTotalCost([])).toBe(0);
    expect(computeTotalCost(null)).toBe(0);
  });
});

describe('hằng số', () => {
  test('danh sách trạng thái/phân loại đúng', () => {
    expect(PROCESSING_STATUSES).toEqual(['new', 'open', 'pending']);
    expect(PROCESSING_CATEGORIES).toEqual(['Bảo hành và Chăm sóc khách hàng']);
  });
  test('TRANG_THAI_XU_LY có id chưa_xử_lý và hoàn_tất', () => {
    const ids = TRANG_THAI_XU_LY.map(s => s.id);
    expect(ids).toContain('chưa_xử_lý');
    expect(ids).toContain('hoàn_tất');
  });
});

describe('getEffectiveSteps', () => {
  test('phiếu chưa có bước → trả workflow chuẩn, tất cả chưa_xong', () => {
    const steps = getEffectiveSteps(null);
    expect(steps.length).toBe(WORKFLOW_STEPS_MAU.length);
    expect(steps.every(s => s['trạng_thái'] === 'chưa_xong')).toBe(true);
    expect(steps[0]['tên']).toBe(WORKFLOW_STEPS_MAU[0]);
  });
  test('phiếu đã có bước tùy biến → giữ nguyên', () => {
    const custom = [{ 'tên': 'Bước A', 'trạng_thái': 'xong' }];
    expect(getEffectiveSteps(custom)).toBe(custom);
  });
  test('mảng rỗng → workflow chuẩn', () => {
    expect(getEffectiveSteps([]).length).toBe(WORKFLOW_STEPS_MAU.length);
  });
});

describe('stepUrgency', () => {
  // Dùng hạn dạng ISO-local (có giờ) để test ổn định theo múi giờ.
  const now = new Date(2026, 5, 20, 9, 0, 0).getTime(); // 20/06/2026 09:00 local

  test('quá hạn hoặc còn < 1 ngày → red', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-20T12:00:00' }, now)).toBe('red'); // cùng ngày
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-18T12:00:00' }, now)).toBe('red'); // đã quá hạn
  });
  test('còn 1–3 ngày → yellow', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-22T12:00:00' }, now)).toBe('yellow');
  });
  test('còn xa → null', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-07-10T12:00:00' }, now)).toBe(null);
  });
  test('đã xong / không có hạn → null', () => {
    expect(stepUrgency({ 'trạng_thái': 'xong', 'hạn_xử_lý': '2026-06-18T12:00:00' }, now)).toBe(null);
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong' }, now)).toBe(null);
    expect(stepUrgency(null, now)).toBe(null);
  });
});
