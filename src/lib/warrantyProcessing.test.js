import { test, expect, describe } from 'vitest';
import {
  PROCESSING_STATUSES, PROCESSING_CATEGORIES, WORKFLOW_STEPS_MAU,
  isQualifyingTicket, computeTotalCost, getEffectiveSteps, ensureClosingStep, applyStepToggle, stepUrgency, toggleStepStatus, TRANG_THAI_XU_LY,
  THONG_TIN_BO_SUNG_KEYS, getThongTinBoSung,
} from './warrantyProcessing';

const mkSteps = (...states) => states.map((st, i) => ({ 'tên': `B${i}`, 'trạng_thái': st }));

describe('applyStepToggle', () => {
  const ISO = '2026-06-27T10:00:00.000Z';
  test('chặn hoàn tất khi bước trước chưa xong', () => {
    const { steps, error } = applyStepToggle(mkSteps('chưa_xong', 'chưa_xong'), 1, 'u', ISO);
    expect(error).toBeTruthy();
    expect(steps[1]['trạng_thái']).toBe('chưa_xong'); // không đổi
  });
  test('cho hoàn tất khi mọi bước trước đã xong', () => {
    const { steps, error } = applyStepToggle(mkSteps('xong', 'chưa_xong'), 1, 'u', ISO);
    expect(error).toBeNull();
    expect(steps[1]['trạng_thái']).toBe('xong');
    expect(steps[1]['người_hoàn_thành']).toBe('u');
  });
  test('mở lại 1 bước → cascade mở lại mọi bước sau đang xong', () => {
    const { steps } = applyStepToggle(mkSteps('xong', 'xong', 'xong'), 1, 'u', ISO);
    expect(steps.map(s => s['trạng_thái'])).toEqual(['xong', 'chưa_xong', 'chưa_xong']);
  });
});

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
  test('phiếu đã có bước tùy biến → giữ nguyên + ép "Đóng phiếu" ở cuối', () => {
    const custom = [{ 'tên': 'Bước A', 'trạng_thái': 'xong' }];
    const out = getEffectiveSteps(custom);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ 'tên': 'Bước A', 'trạng_thái': 'xong' });
    expect(out[out.length - 1]['tên']).toBe('Đóng phiếu');
  });
  test('mảng rỗng → workflow chuẩn', () => {
    expect(getEffectiveSteps([]).length).toBe(WORKFLOW_STEPS_MAU.length);
  });
  test('workflow luôn kết thúc bằng "Đóng phiếu"', () => {
    expect(getEffectiveSteps(null).at(-1)['tên']).toBe('Đóng phiếu');
    expect(getEffectiveSteps([{ 'tên': 'X', 'trạng_thái': 'chưa_xong' }]).at(-1)['tên']).toBe('Đóng phiếu');
  });
});

describe('ensureClosingStep', () => {
  test('thêm "Đóng phiếu" nếu chưa có', () => {
    const out = ensureClosingStep([{ 'tên': 'A', 'trạng_thái': 'chưa_xong' }]);
    expect(out.map(s => s['tên'])).toEqual(['A', 'Đóng phiếu']);
  });
  test('dời "Đóng phiếu" xuống cuối nếu đang ở giữa, giữ trạng thái', () => {
    const out = ensureClosingStep([
      { 'tên': 'Đóng phiếu', 'trạng_thái': 'xong' },
      { 'tên': 'B', 'trạng_thái': 'chưa_xong' },
    ]);
    expect(out.map(s => s['tên'])).toEqual(['B', 'Đóng phiếu']);
    expect(out.at(-1)['trạng_thái']).toBe('xong');
  });
  test('không nhân đôi khi đã ở cuối', () => {
    const out = ensureClosingStep([{ 'tên': 'A', 'trạng_thái': 'chưa_xong' }, { 'tên': 'Đóng phiếu', 'trạng_thái': 'chưa_xong' }]);
    expect(out.filter(s => s['tên'] === 'Đóng phiếu').length).toBe(1);
  });
});

describe('stepUrgency', () => {
  // Dùng hạn dạng ISO-local (có giờ) để test ổn định theo múi giờ.
  const now = new Date(2026, 5, 20, 9, 0, 0).getTime(); // 20/06/2026 09:00 local

  test('quá hạn hoặc còn ≤ 1 giờ → blink', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-20T09:30:00' }, now)).toBe('blink'); // còn 30 phút
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-19T12:00:00' }, now)).toBe('blink'); // đã quá hạn
  });
  test('hạn trong hôm nay (còn > 1 giờ) → orange', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-20T18:00:00' }, now)).toBe('orange');
  });
  test('hạn ngày sau → green', () => {
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-21T08:00:00' }, now)).toBe('green'); // mai
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong', 'hạn_xử_lý': '2026-06-25T09:00:00' }, now)).toBe('green');
  });
  test('đã xong / không có hạn → null', () => {
    expect(stepUrgency({ 'trạng_thái': 'xong', 'hạn_xử_lý': '2026-06-19T12:00:00' }, now)).toBe(null);
    expect(stepUrgency({ 'trạng_thái': 'chưa_xong' }, now)).toBe(null);
    expect(stepUrgency(null, now)).toBe(null);
  });
});

describe('toggleStepStatus', () => {
  test('chưa_xong → xong: ghi giờ + người', () => {
    const out = toggleStepStatus({ 'tên': 'A', 'trạng_thái': 'chưa_xong' }, 'Nguyên', '2026-06-26T10:00:00.000Z');
    expect(out['trạng_thái']).toBe('xong');
    expect(out['hoàn_thành_lúc']).toBe('2026-06-26T10:00:00.000Z');
    expect(out['người_hoàn_thành']).toBe('Nguyên');
    expect(out['tên']).toBe('A'); // giữ các trường khác
  });
  test('xong → chưa_xong: xóa giờ + người', () => {
    const out = toggleStepStatus({ 'tên': 'A', 'trạng_thái': 'xong', 'hoàn_thành_lúc': 'x', 'người_hoàn_thành': 'Y' }, 'Z');
    expect(out['trạng_thái']).toBe('chưa_xong');
    expect(out['hoàn_thành_lúc']).toBe(null);
    expect(out['người_hoàn_thành']).toBe(null);
  });
});

describe('getThongTinBoSung', () => {
  test('ưu tiên giá trị đã sửa (thông_tin_bổ_sung) hơn phiếu gốc', () => {
    const row = {
      'thông_tin_bổ_sung': { 'mã_đlđ': 'ĐL99' },
      'phiếu_gốc_json': { 'mã_đlđ': 'ĐL18', 'tên_đlđ': 'A' },
    };
    const r = getThongTinBoSung(row);
    expect(r['mã_đlđ']).toBe('ĐL99');
    expect(r['tên_đlđ']).toBe('A');
  });
  test('ô sửa rỗng/null → fallback phiếu gốc', () => {
    const row = { 'thông_tin_bổ_sung': { 'tên_đlđ': '', 'sđt_đlđ': null }, 'phiếu_gốc_json': { 'tên_đlđ': 'B', 'sđt_đlđ': '0123' } };
    const r = getThongTinBoSung(row);
    expect(r['tên_đlđ']).toBe('B');
    expect(r['sđt_đlđ']).toBe('0123');
  });
  test('không có nguồn nào → chuỗi rỗng, đủ 6 khóa', () => {
    const r = getThongTinBoSung({});
    expect(Object.keys(r).sort()).toEqual([...THONG_TIN_BO_SUNG_KEYS].sort());
    expect(r['địa_chỉ_nhận_hàng']).toBe('');
  });
  test('chịu được row null và phiếu_gốc_json null', () => {
    expect(getThongTinBoSung(null)['mã_đlđ']).toBe('');
    expect(getThongTinBoSung({ 'phiếu_gốc_json': null })['mã_đlđ']).toBe('');
  });
  test('ép số từ phiếu gốc thành chuỗi', () => {
    const r = getThongTinBoSung({ 'phiếu_gốc_json': { 'số_điện_thoại_khách_hàng': 123 } });
    expect(r['số_điện_thoại_khách_hàng']).toBe('123');
  });
});
