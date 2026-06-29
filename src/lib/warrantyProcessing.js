// Helper thuần cho tab "Xử lý phiếu bảo hành".
// ⚠️ PROCESSING_STATUSES / PROCESSING_CATEGORIES phải KHỚP điều kiện lọc trong
//    sql/setup_xu_ly_phieu_bao_hanh.sql (trigger + backfill).
//    Giá trị thật xác nhận qua SELECT DISTINCT (2026-06-26):
//    - trạng_thái_phiếu_ghi: new/open/pending (mở), closed/solved (đóng).
//    - phân_loại_công_việc: MỘT giá trị gộp duy nhất, KHÔNG phải 2 loại tách rời.

export const PROCESSING_STATUSES = ['new', 'open', 'pending'];
export const PROCESSING_CATEGORIES = ['Bảo hành và Chăm sóc khách hàng'];

// Workflow CHUẨN áp cho mọi phiếu (đổi danh sách này nếu muốn quy trình khác). Mỗi phiếu
// khởi đầu hiển thị các bước này; khi tick xong sẽ "vật chất hóa" vào cột các_bước của phiếu.
// Vẫn có thể thêm/bớt bước RIÊNG cho từng phiếu trong popup.
export const WORKFLOW_STEPS_MAU = [
  'Liên hệ KH',
  'Hẹn lịch',
  'Kiểm tra / Chẩn đoán',
  'Sửa chữa / Thay linh kiện',
  'Nghiệm thu',
  'Đóng phiếu',
];

export const TRANG_THAI_XU_LY = [
  { id: 'chưa_xử_lý',    label: 'Chưa xử lý',    color: '#64748b' },
  { id: 'đang_liên_hệ',  label: 'Đang liên hệ',  color: '#0284c7' },
  { id: 'đã_hẹn_lịch',   label: 'Đã hẹn lịch',   color: '#7c3aed' },
  { id: 'đang_xử_lý',    label: 'Đang xử lý',    color: '#d97706' },
  { id: 'chờ_linh_kiện', label: 'Chờ linh kiện', color: '#dc2626' },
  { id: 'hoàn_tất',      label: 'Hoàn tất',      color: '#15803d' },
];

export const TRANG_THAI_DONG_BO = {
  'nháp':        { label: 'Nháp',        color: '#94a3b8' },
  'pending':     { label: 'Đang đẩy',    color: '#d97706' },
  'đã_đồng_bộ':  { label: 'Đã đồng bộ',  color: '#15803d' },
  'lỗi':         { label: 'Lỗi',         color: '#dc2626' },
};

export function isQualifyingTicket(t) {
  if (!t) return false;
  return PROCESSING_STATUSES.includes(t['trạng_thái_phiếu_ghi'])
    && PROCESSING_CATEGORIES.includes(t['phân_loại_công_việc']);
}

// Bước cuối CHUẨN của mọi phiếu. App luôn đảm bảo workflow kết thúc bằng bước này.
export const CLOSING_STEP = 'Đóng phiếu';

// Đảm bảo danh sách bước LUÔN kết thúc bằng "Đóng phiếu":
//  - chưa có → thêm vào cuối; đã có nhưng không ở cuối → dời xuống cuối (giữ trạng thái cũ).
// Idempotent: gọi nhiều lần không đổi kết quả.
export function ensureClosingStep(steps) {
  const arr = Array.isArray(steps) ? steps.slice() : [];
  const idx = arr.findIndex(s => s && String(s['tên'] || '').trim() === CLOSING_STEP);
  if (idx === -1) arr.push({ 'tên': CLOSING_STEP, 'trạng_thái': 'chưa_xong' });
  else if (idx !== arr.length - 1) { const [s] = arr.splice(idx, 1); arr.push(s); }
  return arr;
}

// Danh sách bước hiệu lực của 1 phiếu: dùng bước tùy biến đã lưu nếu có,
// nếu chưa có thì workflow chuẩn (tất cả 'chưa_xong'). Luôn kết thúc bằng "Đóng phiếu".
export function getEffectiveSteps(cacBuoc) {
  const base = (Array.isArray(cacBuoc) && cacBuoc.length > 0)
    ? cacBuoc
    : WORKFLOW_STEPS_MAU.map(t => ({ 'tên': t, 'trạng_thái': 'chưa_xong' }));
  return ensureClosingStep(base);
}

// Lật trạng thái 1 bước. Khi chuyển sang 'xong' → tự ghi giờ hoàn thành (ISO) + người tick;
// khi bỏ tick → xóa 2 trường đó. (nowIso truyền vào cho dễ test.)
export function toggleStepStatus(step, operator = '', nowIso = new Date().toISOString()) {
  const willDone = step['trạng_thái'] !== 'xong';
  return {
    ...step,
    'trạng_thái': willDone ? 'xong' : 'chưa_xong',
    'hoàn_thành_lúc': willDone ? nowIso : null,
    'người_hoàn_thành': willDone ? operator : null,
  };
}

// Tick/bỏ tick 1 bước theo quy tắc tuần tự:
//  - Hoàn tất bước i CHỈ khi mọi bước trước (0..i-1) đã 'xong'. Chưa đủ → trả error, không đổi.
//  - Mở lại bước i → mở lại luôn TẤT CẢ bước sau (i..hết) đang 'xong' (cascade).
// Trả { steps, error }. nowIso truyền vào cho dễ test.
export function applyStepToggle(steps, index, operator = '', nowIso = new Date().toISOString()) {
  if (!Array.isArray(steps) || index < 0 || index >= steps.length) return { steps, error: null };
  const arr = steps.map(s => ({ ...s }));
  const goingDone = arr[index]['trạng_thái'] !== 'xong';
  if (goingDone) {
    const prevAllDone = arr.slice(0, index).every(s => s['trạng_thái'] === 'xong');
    if (!prevAllDone) return { steps, error: 'Phải hoàn thành các bước trước đó trước khi hoàn tất bước này.' };
    arr[index] = toggleStepStatus(arr[index], operator, nowIso); // → xong
  } else {
    for (let i = index; i < arr.length; i++) {
      if (arr[i]['trạng_thái'] === 'xong') arr[i] = toggleStepStatus(arr[i], operator, nowIso); // → chưa_xong
    }
  }
  return { steps: arr, error: null };
}

// Bước "Đóng phiếu" hiện đã 'xong' chưa? (ensureClosingStep đảm bảo luôn tồn tại & ở cuối.)
export function isClosingStepDone(steps) {
  const arr = ensureClosingStep(Array.isArray(steps) ? steps : []);
  const closing = arr.find(s => String(s['tên'] || '').trim() === CLOSING_STEP);
  return closing ? closing['trạng_thái'] === 'xong' : false;
}

// Khi bước "Đóng phiếu" đổi trạng thái giữa prevSteps → nextSteps, trả trạng thái Caresoft cần đẩy:
//   'solved' (vừa hoàn tất Đóng phiếu) · 'open' (vừa mở lại) · '' (bước Đóng phiếu không đổi → không động CS).
// Đây là tín hiệu DUY NHẤT n8n đọc để đổi status ticket (ghi vào trạng_thái_caresoft_muốn_set).
export function csStatusOnClosingToggle(prevSteps, nextSteps) {
  const before = isClosingStepDone(prevSteps);
  const after = isClosingStepDone(nextSteps);
  if (before === after) return '';
  return after ? 'solved' : 'open';
}

// Mức khẩn của 1 bước theo hạn xử lý ngày+giờ (so với 'now' truyền vào cho dễ test).
// Chỉ áp cho bước CHƯA xong & có hạn.
//  - 'blink'  : quá hạn hoặc còn ≤ 1 giờ          → nhấp nháy cam↔đỏ
//  - 'orange' : hạn trong HÔM NAY (còn > 1 giờ)   → cam
//  - 'green'  : hạn vào ngày sau (còn thong thả)  → xanh
//  - null     : đã xong / chưa đặt hạn
export function stepUrgency(step, now = Date.now()) {
  if (!step || step['trạng_thái'] === 'xong') return null;
  const han = step['hạn_xử_lý'];
  if (!han) return null;
  const d = new Date(han);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() - now <= 3600 * 1000) return 'blink'; // quá hạn hoặc còn ≤ 1 giờ
  const nd = new Date(now);
  const startToday = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()).getTime();
  const startDl = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return startDl > startToday ? 'green' : 'orange';
}

export function computeTotalCost(parts) {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, p) => {
    if (!p || p['tính_phí'] === false) return sum;
    const qty = Number(p['số_lượng']) || 0;
    const price = Number(p['đơn_giá']) || 0;
    return sum + qty * price;
  }, 0);
}

// 6 trường thông tin đẩy về Caresoft. KEY = tên cột trong phieu_bao_hanh (để prefill từ phiếu_gốc_json).
export const THONG_TIN_BO_SUNG_KEYS = [
  'mã_đlđ', 'tên_đlđ', 'sđt_đlđ', 'khoảng_cách',
  'tên_khách_hàng', 'số_điện_thoại_khách_hàng', 'địa_chỉ_nhận_hàng',
  'tình_trạng', 'ngày_lắp_đặt',
];

// Object 6 khóa cho modal. Ưu tiên: bản app đã sửa (thông_tin_bổ_sung) → phiếu gốc (phiếu_gốc_json) → ''.
// Giá trị luôn là chuỗi (ép từ số). Chịu được row/phiếu_gốc_json null.
export function getThongTinBoSung(row) {
  const saved = (row && row['thông_tin_bổ_sung']) || {};
  const goc = (row && row['phiếu_gốc_json']) || {};
  const out = {};
  for (const k of THONG_TIN_BO_SUNG_KEYS) {
    const v = saved[k];
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    else out[k] = goc[k] != null ? String(goc[k]) : '';
  }
  return out;
}

// ── GĐ4: 4 trường option Caresoft (cascade) ──
// Cấu trúc cascade xác nhận từ config CS thật (field_value_id):
//   Nhóm SP (9850) gốc · Mã SP (9720) gốc · Chi tiết lỗi (9852) ← Nhóm SP · Linh kiện (9719, multi) ← MÃ SP.
// Dữ liệu option: src/data/caresoftFieldOptions.json {option_id, field_id, field_key, label, parent_option_id, sort_order}.
export const OPTION_FIELDS = {
  'nhóm_sản_phẩm': { fieldId: 9850, multi: false, cascade: false, parentKey: null },
  'mã_sản_phẩm':   { fieldId: 9720, multi: false, cascade: false, parentKey: null },
  'chi_tiết_lỗi':  { fieldId: 9852, multi: false, cascade: true,  parentKey: 'nhóm_sản_phẩm' },
  'linh_kiện':     { fieldId: 9719, multi: true,  cascade: true,  parentKey: 'mã_sản_phẩm' },
  // Nguyên nhân (CS field 9722): multi-select, cascade theo Nhóm SP (giống Chi tiết lỗi).
  'nguyên_nhân':   { fieldId: 9722, multi: true,  cascade: true,  parentKey: 'nhóm_sản_phẩm' },
};
export const OPTION_FIELD_KEYS = Object.keys(OPTION_FIELDS);

// Lọc option để render dropdown.
//  - field KHÔNG cascade → mọi option của field.
//  - field cascade → option có parent_option_id == parentOptionId (rỗng → mảng rỗng, buộc chọn cha trước).
export function optionsFor(list, fieldKey, parentOptionId = null) {
  if (!Array.isArray(list)) return [];
  const meta = OPTION_FIELDS[fieldKey] || {};
  const base = list.filter(o => o.field_key === fieldKey);
  if (!meta.cascade) return base;
  if (parentOptionId == null || parentOptionId === '') return [];
  return base.filter(o => String(o.parent_option_id) === String(parentOptionId));
}

// option_id → nhãn (chịu số/chuỗi). Không thấy → ''.
export function resolveOptionLabel(list, optionId) {
  if (!Array.isArray(list) || optionId == null || optionId === '') return '';
  const o = list.find(x => String(x.option_id) === String(optionId));
  return o ? o.label : '';
}

// Nhãn → option_id (chiều ngược của resolveOptionLabel), để chọn sẵn dropdown từ phiếu gốc
// (Caresoft chỉ lưu CHỮ, không có option_id). Field cascade truyền parentOptionId để phân giải
// đúng khi nhãn trùng ở nhiều nhóm (vd "Bung nắp" ở 2 nhóm). Không khớp → '' (không đoán bừa).
export function resolveOptionIdByLabel(list, fieldKey, label, parentOptionId = null) {
  const lbl = String(label == null ? '' : label).trim();
  if (!lbl || !Array.isArray(list)) return '';
  const meta = OPTION_FIELDS[fieldKey] || {};
  const pool = optionsFor(list, fieldKey, meta.cascade ? parentOptionId : null);
  const hit = pool.find(o => String(o.label).trim() === lbl);
  return hit ? hit.option_id : '';
}

// Caresoft lưu multi-select dạng ",id,id," — parse ⇄ mảng số.
export function parseMultiIds(v) {
  return String(v == null ? '' : v).split(',').map(s => s.trim()).filter(Boolean).map(Number);
}
export function joinMultiIds(ids) {
  const a = (ids || []).filter(x => x != null && x !== '');
  return a.length ? ',' + a.join(',') + ',' : '';
}

// ── Gửi Form khai báo bảo hành → DB trung gian CNV ──
// 3 trạng thái khởi tạo khi gửi form (CREATE). Luồng cập nhật về sau (đã gửi/đã hoàn thành
// xác nhận online, đã thanh toán) ghi đè vào cùng cột — triển khai sau.
export const KB_TRANG_THAI_FORM = 'Đã gửi form';
export const KB_XAC_NHAN_ONLINE_INIT = 'Chưa gửi xác nhận online';
export const KB_THANH_TOAN_INIT = 'Chưa thanh toán';

// Chuẩn hóa ngày BẤT KỲ định dạng → 'YYYY-MM-DD' (gạch ngang) cho payload. Rỗng/không parse → ''.
//  Nhận: yyyy-mm-dd, yyyy/mm/dd, dd-mm-yyyy, dd/mm/yyyy, ISO kèm giờ.
export function normDateYmd(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);   // năm trước: yyyy-mm-dd | yyyy/mm/dd
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);       // ngày trước: dd-mm-yyyy | dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dựng record gửi sang DB trung gian CNV (key Pascal_Snake, action=CREATE).
//  - Lấy GIÁ TRỊ HIỂN THỊ ở tab: ưu tiên thông_tin_bổ_sung (bản app đã sửa) → phiếu_gốc_json → mirror.
//  - Trường option (mã SP / chi tiết lỗi / linh kiện / nguyên nhân) resolve NHÃN từ *_option_id(s).
//  - Trường app không lưu (Phan_Loai_CV) → ''. Trạng thái → hằng số khởi tạo.
//  - fieldOptions = src/data/caresoftFieldOptions.json (để resolve nhãn option).
export function buildKhaiBaoRecord(row, fieldOptions = []) {
  const goc = (row && row['phiếu_gốc_json']) || {};
  const tin = getThongTinBoSung(row); // 9 trường KTV/KH hiệu lực (app sửa → gốc)
  const ttRaw = (row && row['thông_tin_bổ_sung']) || {};
  // Nhãn hiệu lực 1 trường option: app sửa (*_option_id) → mirror row[key] → gốc.
  const optLabel = (key) => {
    const meta = OPTION_FIELDS[key] || {};
    if (meta.multi) {
      const ids = Array.isArray(ttRaw[key + '_option_ids']) ? ttRaw[key + '_option_ids'] : [];
      const lbl = ids.map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ');
      return lbl || (row && row[key]) || goc[key] || '';
    }
    return resolveOptionLabel(fieldOptions, ttRaw[key + '_option_id']) || (row && row[key]) || goc[key] || '';
  };
  const s = (v) => (v === undefined || v === null) ? '' : String(v);
  return {
    action: 'CREATE',
    oldValues: null,
    newValues: {
      Phieu_Ghi:       s((row && (row['id_phiếu_ghi'] || row['phiếu_ghi']))),
      Ma_Don_Hang:     s((row && row['mã_đơn_hàng']) || goc['mã_đơn_hàng']),
      San_Pham:        s(optLabel('mã_sản_phẩm')),
      Ngay_Lap_Dat:    normDateYmd(tin['ngày_lắp_đặt'] || (row && row['ngày_lắp_đặt'])),
      Chi_Tiet_Loi:    s(optLabel('chi_tiết_lỗi')),
      Khach_Hang:      s(tin['tên_khách_hàng']),
      SDT_Khach:       s(tin['số_điện_thoại_khách_hàng'] || (row && row['số_điện_thoại_khách_hàng'])),
      Dia_Chi:         s(tin['địa_chỉ_nhận_hàng']),
      Tinh_Trang:      s(tin['tình_trạng']),
      Nguyen_Nhan:     s(optLabel('nguyên_nhân')),                                   // option (app sửa → gốc)
      Phuong_An_XL:    s(ttRaw['phương_án_xử_lý'] || goc['phương_án_xử_lý']),         // text (app sửa → gốc)
      Ten_DLD:         s(tin['tên_đlđ']),
      Ma_DLD:          s(tin['mã_đlđ']),
      SDT_DLD:         s(tin['sđt_đlđ']),
      Khoang_Cach:     s(tin['khoảng_cách']),
      Phan_Loai_CV:    '', // app không lưu trường này → để rỗng (theo quyết định)
      Linh_Kien:       s(optLabel('linh_kiện')),
      Trang_Thai:      KB_TRANG_THAI_FORM,
      Xac_Nhan_Online: KB_XAC_NHAN_ONLINE_INIT,
      Thanh_Toan:      KB_THANH_TOAN_INIT,
    },
  };
}
