import { test, expect, describe } from 'vitest';
import {
  PROCESSING_STATUSES, PROCESSING_CATEGORIES, WORKFLOW_STEPS_MAU,
  isQualifyingTicket, computeTotalCost, getEffectiveSteps, ensureClosingStep, applyStepToggle, stepUrgency, toggleStepStatus, TRANG_THAI_XU_LY,
  THONG_TIN_BO_SUNG_KEYS, getThongTinBoSung, isClosingStepDone, csStatusOnClosingToggle, CLOSING_STEP,
  OPTION_FIELDS, OPTION_FIELD_KEYS, optionsFor, resolveOptionLabel, resolveOptionIdByLabel, parseMultiIds, joinMultiIds,
  buildKhaiBaoRecord, normDateYmd, KB_TRANG_THAI_FORM, KB_XAC_NHAN_ONLINE_INIT, KB_THANH_TOAN_INIT,
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

describe('isClosingStepDone', () => {
  test('bước "Đóng phiếu" đã xong → true', () => {
    expect(isClosingStepDone([{ 'tên': 'A', 'trạng_thái': 'xong' }, { 'tên': CLOSING_STEP, 'trạng_thái': 'xong' }])).toBe(true);
  });
  test('bước "Đóng phiếu" chưa xong → false', () => {
    expect(isClosingStepDone([{ 'tên': 'A', 'trạng_thái': 'xong' }, { 'tên': CLOSING_STEP, 'trạng_thái': 'chưa_xong' }])).toBe(false);
  });
  test('chưa có bước Đóng phiếu (ensureClosingStep tự thêm, chưa_xong) → false', () => {
    expect(isClosingStepDone([{ 'tên': 'A', 'trạng_thái': 'xong' }])).toBe(false);
    expect(isClosingStepDone(null)).toBe(false);
  });
});

describe('csStatusOnClosingToggle', () => {
  const open = [{ 'tên': 'A', 'trạng_thái': 'xong' }, { 'tên': CLOSING_STEP, 'trạng_thái': 'chưa_xong' }];
  const closed = [{ 'tên': 'A', 'trạng_thái': 'xong' }, { 'tên': CLOSING_STEP, 'trạng_thái': 'xong' }];
  test('vừa hoàn tất Đóng phiếu → solved', () => {
    expect(csStatusOnClosingToggle(open, closed)).toBe('solved');
  });
  test('vừa mở lại Đóng phiếu → open', () => {
    expect(csStatusOnClosingToggle(closed, open)).toBe('open');
  });
  test('bước Đóng phiếu không đổi → "" (không động CS)', () => {
    expect(csStatusOnClosingToggle(open, open)).toBe('');
    expect(csStatusOnClosingToggle(closed, closed)).toBe('');
  });
});

describe('GĐ4 option helpers', () => {
  const L = [
    { option_id: 148351, field_key: 'nhóm_sản_phẩm', label: 'MÁY LUX', parent_option_id: null, sort_order: 1 },
    { option_id: 148354, field_key: 'nhóm_sản_phẩm', label: 'COMBO LÕI LỌC', parent_option_id: null, sort_order: 0 },
    { option_id: 147028, field_key: 'mã_sản_phẩm', label: 'LUX-200RO', parent_option_id: null, sort_order: 0 },
    { option_id: 155318, field_key: 'chi_tiết_lỗi', label: 'Máy không ra nước', parent_option_id: 148354, sort_order: 0 },
    { option_id: 155346, field_key: 'chi_tiết_lỗi', label: 'Máy không ra nước', parent_option_id: 148351, sort_order: 0 },
    { option_id: 149905, field_key: 'linh_kiện', label: 'Lõi kiềm # FK-HYDRO11', parent_option_id: 147028, sort_order: 0 },
  ];
  test('meta đúng: Mã SP phẳng, Chi tiết lỗi←Nhóm SP, Linh kiện←Mã SP + multi', () => {
    expect(OPTION_FIELDS['mã_sản_phẩm'].cascade).toBe(false);
    expect(OPTION_FIELDS['chi_tiết_lỗi'].parentKey).toBe('nhóm_sản_phẩm');
    expect(OPTION_FIELDS['linh_kiện'].parentKey).toBe('mã_sản_phẩm');
    expect(OPTION_FIELDS['linh_kiện'].multi).toBe(true);
    expect(OPTION_FIELDS['nguyên_nhân']).toEqual({ fieldId: 9722, multi: true, cascade: true, parentKey: 'nhóm_sản_phẩm' });
    expect(OPTION_FIELD_KEYS.slice().sort()).toEqual(['chi_tiết_lỗi', 'linh_kiện', 'mã_sản_phẩm', 'nguyên_nhân', 'nhóm_sản_phẩm']);
  });
  test('field phẳng → mọi option của field', () => {
    expect(optionsFor(L, 'nhóm_sản_phẩm').map(o => o.option_id)).toEqual([148351, 148354]);
  });
  test('field cascade → lọc theo parent', () => {
    expect(optionsFor(L, 'chi_tiết_lỗi', 148351).map(o => o.option_id)).toEqual([155346]);
    expect(optionsFor(L, 'linh_kiện', 147028).map(o => o.option_id)).toEqual([149905]);
  });
  test('field cascade chưa chọn cha → rỗng', () => {
    expect(optionsFor(L, 'chi_tiết_lỗi', null)).toEqual([]);
    expect(optionsFor(L, 'linh_kiện', '')).toEqual([]);
  });
  test('resolveOptionLabel chịu số & chuỗi', () => {
    expect(resolveOptionLabel(L, 155318)).toBe('Máy không ra nước');
    expect(resolveOptionLabel(L, '149905')).toBe('Lõi kiềm # FK-HYDRO11');
    expect(resolveOptionLabel(L, null)).toBe('');
  });
  test('parseMultiIds / joinMultiIds (định dạng CS ,id,id,)', () => {
    expect(parseMultiIds(',149905,149620,')).toEqual([149905, 149620]);
    expect(parseMultiIds('')).toEqual([]);
    expect(parseMultiIds(null)).toEqual([]);
    expect(joinMultiIds([149905, 149620])).toBe(',149905,149620,');
    expect(joinMultiIds([])).toBe('');
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
  test('có đủ 9 khóa gồm 3 khóa GĐ2 (khoảng_cách, tình_trạng, ngày_lắp_đặt)', () => {
    expect(THONG_TIN_BO_SUNG_KEYS).toHaveLength(9);
    ['khoảng_cách', 'tình_trạng', 'ngày_lắp_đặt'].forEach(k => expect(THONG_TIN_BO_SUNG_KEYS).toContain(k));
  });
  test('prefill tình_trạng & ngày_lắp_đặt từ phiếu gốc; khoảng_cách trống', () => {
    const r = getThongTinBoSung({ 'phiếu_gốc_json': { 'tình_trạng': 'thay lõi', 'ngày_lắp_đặt': '2024/06/14' } });
    expect(r['tình_trạng']).toBe('thay lõi');
    expect(r['ngày_lắp_đặt']).toBe('2024/06/14');
    expect(r['khoảng_cách']).toBe('');
  });
});

describe('resolveOptionIdByLabel', () => {
  // nhóm 10 "MÁY NÓNG LẠNH"; "Bung nắp" trùng nhãn ở 2 nhóm (cha 10 và 20).
  const FO = [
    { option_id: 10, field_key: 'nhóm_sản_phẩm', label: 'MÁY NÓNG LẠNH', parent_option_id: null },
    { option_id: 20, field_key: 'nhóm_sản_phẩm', label: 'MÁY LỌC', parent_option_id: null },
    { option_id: 700, field_key: 'mã_sản_phẩm', label: 'WT-4200-RO', parent_option_id: null },
    { option_id: 31, field_key: 'chi_tiết_lỗi', label: 'Bung nắp', parent_option_id: 10 },
    { option_id: 32, field_key: 'chi_tiết_lỗi', label: 'Bung nắp', parent_option_id: 20 },
    { option_id: 90, field_key: 'linh_kiện', label: 'Phao điện', parent_option_id: 700 },
  ];
  test('field không cascade: khớp nhãn duy nhất', () => {
    expect(resolveOptionIdByLabel(FO, 'nhóm_sản_phẩm', 'MÁY NÓNG LẠNH')).toBe(10);
    expect(resolveOptionIdByLabel(FO, 'mã_sản_phẩm', 'WT-4200-RO')).toBe(700);
  });
  test('field cascade: phân giải nhãn trùng theo cha', () => {
    expect(resolveOptionIdByLabel(FO, 'chi_tiết_lỗi', 'Bung nắp', 10)).toBe(31);
    expect(resolveOptionIdByLabel(FO, 'chi_tiết_lỗi', 'Bung nắp', 20)).toBe(32);
  });
  test('cascade không có cha → rỗng (không đoán bừa)', () => {
    expect(resolveOptionIdByLabel(FO, 'chi_tiết_lỗi', 'Bung nắp', '')).toBe('');
  });
  test('nhãn không tồn tại / rỗng → rỗng', () => {
    expect(resolveOptionIdByLabel(FO, 'nhóm_sản_phẩm', 'KHÔNG CÓ')).toBe('');
    expect(resolveOptionIdByLabel(FO, 'nhóm_sản_phẩm', '')).toBe('');
  });
});

describe('normDateYmd', () => {
  test('mọi định dạng → yyyy-mm-dd (gạch ngang)', () => {
    expect(normDateYmd('2026/06/22')).toBe('2026-06-22'); // yyyy/mm/dd → ngang
    expect(normDateYmd('2026-06-22')).toBe('2026-06-22');
    expect(normDateYmd('22/06/2026')).toBe('2026-06-22'); // dd/mm/yyyy
    expect(normDateYmd('22-06-2026')).toBe('2026-06-22'); // dd-mm-yyyy
    expect(normDateYmd('2026/6/2')).toBe('2026-06-02');   // pad
  });
  test('rỗng / không hợp lệ → ""', () => {
    expect(normDateYmd('')).toBe('');
    expect(normDateYmd(null)).toBe('');
    expect(normDateYmd('linh tinh')).toBe('');
  });
});

describe('buildKhaiBaoRecord', () => {
  // option_id 7 = mã SP "WT-4200-RO"; 42 = linh kiện "Phao điện # E-FS-4200".
  const FO = [
    { option_id: 7, field_key: 'mã_sản_phẩm', label: 'WT-4200-RO' },
    { option_id: 88, field_key: 'chi_tiết_lỗi', label: 'Máy không ra nước' },
    { option_id: 42, field_key: 'linh_kiện', label: 'Phao điện # E-FS-4200' },
  ];
  const baseRow = {
    'id_phiếu_ghi': '229283',
    'mã_đơn_hàng': 'VNA04002970223',
    'mã_sản_phẩm': 'WT-4200-RO',
    'số_điện_thoại_khách_hàng': '0945011809',
    'ngày_lắp_đặt': '2025-06-25',
    'phiếu_gốc_json': {
      'tên_khách_hàng': 'Phạm Thị Mai',
      'địa_chỉ_nhận_hàng': 'UBX Xã Diên Hoa Huyện Nghi Lộc Nghệ An',
      'tình_trạng': 'không ra nước',
      'nguyên_nhân': 'Phao điện không thông mạch',
      'phương_án_xử_lý': 'Lên đơn gửi phao điện',
      'tên_đlđ': 'TRẦN VĂN MẠNH',
      'mã_đlđ': 'NA84',
      'sđt_đlđ': '0984469066',
      'linh_kiện': 'Phao điện # E-FS-4200',
      'chi_tiết_lỗi': 'Máy không ra nước',
    },
  };

  test('action=CREATE, oldValues=null, đủ 20 khóa newValues', () => {
    const rec = buildKhaiBaoRecord(baseRow, FO);
    expect(rec.action).toBe('CREATE');
    expect(rec.oldValues).toBeNull();
    expect(Object.keys(rec.newValues).sort()).toEqual([
      'Chi_Tiet_Loi', 'Dia_Chi', 'Khach_Hang', 'Khoang_Cach', 'Linh_Kien', 'Ma_DLD',
      'Ma_Don_Hang', 'Ngay_Lap_Dat', 'Nguyen_Nhan', 'Phan_Loai_CV', 'Phieu_Ghi',
      'Phuong_An_XL', 'SDT_DLD', 'SDT_Khach', 'San_Pham', 'Tinh_Trang', 'Thanh_Toan',
      'Trang_Thai', 'Ten_DLD', 'Xac_Nhan_Online',
    ].sort());
  });

  test('map đúng giá trị từ mirror + phiếu_gốc_json; Ngay_Lap_Dat giữ nguyên format', () => {
    const v = buildKhaiBaoRecord(baseRow, FO).newValues;
    expect(v.Phieu_Ghi).toBe('229283');
    expect(v.Ma_Don_Hang).toBe('VNA04002970223');
    expect(v.San_Pham).toBe('WT-4200-RO');
    expect(v.Ngay_Lap_Dat).toBe('2025-06-25');
    expect(v.Khach_Hang).toBe('Phạm Thị Mai');
    expect(v.SDT_Khach).toBe('0945011809');
    expect(v.Ten_DLD).toBe('TRẦN VĂN MẠNH');
    expect(v.SDT_DLD).toBe('0984469066');
    expect(v.Linh_Kien).toBe('Phao điện # E-FS-4200');
  });

  test('3 trạng thái = hằng số; Phan_Loai_CV & Khoang_Cach rỗng khi app không có', () => {
    const v = buildKhaiBaoRecord(baseRow, FO).newValues;
    expect(v.Trang_Thai).toBe(KB_TRANG_THAI_FORM);
    expect(v.Xac_Nhan_Online).toBe(KB_XAC_NHAN_ONLINE_INIT);
    expect(v.Thanh_Toan).toBe(KB_THANH_TOAN_INIT);
    expect(v.Phan_Loai_CV).toBe('');
    expect(v.Khoang_Cach).toBe('');
  });

  test('ưu tiên giá trị app đã sửa (thông_tin_bổ_sung) cho KTV/KH & option', () => {
    const row = {
      ...baseRow,
      'thông_tin_bổ_sung': {
        'tên_đlđ': 'KTV Sửa Tay',
        'khoảng_cách': '12',
        'mã_sản_phẩm_option_id': 7,
        'linh_kiện_option_ids': [42],
      },
    };
    const v = buildKhaiBaoRecord(row, FO).newValues;
    expect(v.Ten_DLD).toBe('KTV Sửa Tay');     // override app thắng phiếu gốc
    expect(v.Khoang_Cach).toBe('12');
    expect(v.San_Pham).toBe('WT-4200-RO');      // resolve NHÃN từ option_id, không phải id
    expect(v.Linh_Kien).toBe('Phao điện # E-FS-4200');
  });

  test('Nguyên nhân & Phương án xử lý lấy bản app đã sửa (không chỉ phiếu gốc)', () => {
    const FO2 = [...FO, { option_id: 555, field_key: 'nguyên_nhân', label: 'Phao điện không thông mạch', parent_option_id: 148352 }];
    const row = {
      ...baseRow,
      'phiếu_gốc_json': { ...baseRow['phiếu_gốc_json'], 'nguyên_nhân': 'Lỗi gốc cũ', 'phương_án_xử_lý': 'PA gốc cũ' },
      'thông_tin_bổ_sung': {
        'nguyên_nhân_option_ids': [555],
        'phương_án_xử_lý': 'Thay phao điện mới (app sửa)',
      },
    };
    const v = buildKhaiBaoRecord(row, FO2).newValues;
    expect(v.Nguyen_Nhan).toBe('Phao điện không thông mạch'); // nhãn option app chọn, không phải gốc cũ
    expect(v.Phuong_An_XL).toBe('Thay phao điện mới (app sửa)');
  });
  test('Nguyên nhân & Phương án rơi về phiếu gốc khi app chưa sửa', () => {
    const row = { ...baseRow, 'phiếu_gốc_json': { ...baseRow['phiếu_gốc_json'], 'nguyên_nhân': 'NN gốc', 'phương_án_xử_lý': 'PA gốc' } };
    const v = buildKhaiBaoRecord(row, FO).newValues;
    expect(v.Nguyen_Nhan).toBe('NN gốc');
    expect(v.Phuong_An_XL).toBe('PA gốc');
  });

  test('Ngay_Lap_Dat luôn chuẩn hóa về yyyy-mm-dd dù lưu kiểu khác', () => {
    const row = { ...baseRow, 'ngày_lắp_đặt': '2026/06/22', 'thông_tin_bổ_sung': { 'ngày_lắp_đặt': '2026/06/22' } };
    expect(buildKhaiBaoRecord(row, FO).newValues.Ngay_Lap_Dat).toBe('2026-06-22');
  });

  test('chịu được row tối thiểu (không phiếu_gốc_json)', () => {
    const v = buildKhaiBaoRecord({ 'id_phiếu_ghi': '1' }, FO).newValues;
    expect(v.Phieu_Ghi).toBe('1');
    expect(v.Nguyen_Nhan).toBe('');
    expect(v.Trang_Thai).toBe(KB_TRANG_THAI_FORM);
  });
});
