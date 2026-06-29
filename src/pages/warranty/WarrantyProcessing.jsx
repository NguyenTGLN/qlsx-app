import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb } from '../../lib/task_supabase';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Filter, Send, Download, CheckCircle2, RotateCcw, Calendar } from 'lucide-react';
import { useTabPerm, useAuth } from '../../lib/AuthContext';
import { TRANG_THAI_XU_LY, TRANG_THAI_DONG_BO, isQualifyingTicket, getEffectiveSteps, stepUrgency, applyStepToggle, csStatusOnClosingToggle, getThongTinBoSung, OPTION_FIELDS, OPTION_FIELD_KEYS, optionsFor, resolveOptionLabel } from '../../lib/warrantyProcessing';
import fieldOptions from '../../data/caresoftFieldOptions.json';
import ProcessingModal from './ProcessingModal';

const statusMeta = (id) => TRANG_THAI_XU_LY.find(s => s.id === id) || { label: id || 'Chưa xử lý', color: '#64748b' };
const fmtDateTime = (v) => v ? new Date(String(v).replace(/Z$/i, '')).toLocaleString('vi-VN') : '-';

// Chuẩn hóa chuỗi ngày (YYYY-MM-DD, YYYY/MM/DD, hoặc ISO kèm giờ) về 'YYYY-MM-DD' để lọc/so sánh.
const toISODate = (v) => {
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Hiển thị ngày dạng DD/MM/YYYY (bỏ giờ). Không parse được → trả nguyên gốc.
const fmtDateOnly = (v) => {
  const iso = toISODate(v);
  if (!iso) return v ? String(v) : '-';
  const [y, mo, d] = iso.split('-');
  return `${d}/${mo}/${y}`;
};
// Giá trị ngày có nằm trong [from, to] không (from/to dạng YYYY-MM-DD; rỗng = bỏ qua cận đó).
const dateInRange = (v, from, to) => {
  if (!from && !to) return true;
  const d = toISODate(v);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

// Trạng thái phiếu phía Caresoft (trạng_thái_phiếu_ghi) cho bộ lọc.
const CS_STATUS_OPTIONS = [
  { id: 'new', label: 'Mới (new)' },
  { id: 'open', label: 'Đang xử lý (open)' },
  { id: 'pending', label: 'Chờ (pending)' },
  { id: 'solved', label: 'Đã giải quyết (solved)' },
  { id: 'closed', label: 'Đã đóng (closed)' },
];
const badge = (color, label) => <span style={{ background: color + '22', color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{label}</span>;

// Tóm tắt các bước WF thành 1 chuỗi để xuất Excel (✓ = đã xong).
const summarizeSteps = (raw) => getEffectiveSteps(raw)
  .map(s => `${s['trạng_thái'] === 'xong' ? '✓ ' : ''}${s['tên'] || ''}`).filter(Boolean).join(' | ');

// ── Bộ lọc khoảng ngày: preset lọc nhanh + tiến/lùi theo kỳ + nhập tay dd/mm/yyyy ──
const dateInputStyle = { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.4rem', fontSize: '0.8rem', color: '#334155' };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }; // thứ 2 đầu tuần

const DATE_PRESETS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: 'thisWeek', label: 'Tuần này' },
  { id: 'lastWeek', label: 'Tuần trước' },
  { id: 'thisMonth', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'thisYear', label: 'Năm nay' },
  { id: 'lastYear', label: 'Năm trước' },
  { id: 'custom', label: 'Tùy chọn' },
];
const presetGranularity = (p) => (
  ['today', 'yesterday'].includes(p) ? 'day'
    : ['thisWeek', 'lastWeek'].includes(p) ? 'week'
      : ['thisMonth', 'lastMonth'].includes(p) ? 'month'
        : ['thisYear', 'lastYear'].includes(p) ? 'year' : null
);
// Khoảng [from,to] (YYYY-MM-DD) cho 1 preset, mốc theo hôm nay. all/custom → null.
const presetToRange = (p) => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  switch (p) {
    case 'today': return { from: ymd(now), to: ymd(now) };
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return { from: ymd(d), to: ymd(d) }; }
    case 'thisWeek': { const s = startOfWeek(now); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: ymd(s), to: ymd(e) }; }
    case 'lastWeek': { const s = startOfWeek(now); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: ymd(s), to: ymd(e) }; }
    case 'thisMonth': return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    case 'lastMonth': return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case 'thisYear': return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case 'lastYear': return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    default: return null;
  }
};
// Dời khoảng theo ±1 đơn vị granularity (dựa trên 'from' hiện tại).
const stepRange = (gran, from, dir) => {
  const f = new Date(from + 'T00:00:00');
  if (gran === 'day') { f.setDate(f.getDate() + dir); return { from: ymd(f), to: ymd(f) }; }
  if (gran === 'week') { const s = new Date(from + 'T00:00:00'); s.setDate(s.getDate() + 7 * dir); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: ymd(s), to: ymd(e) }; }
  if (gran === 'month') return { from: ymd(new Date(f.getFullYear(), f.getMonth() + dir, 1)), to: ymd(new Date(f.getFullYear(), f.getMonth() + dir + 1, 0)) };
  if (gran === 'year') { const y = f.getFullYear() + dir; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  return { from, to: from };
};

// Ô nhập 1 ngày dạng dd/mm/yyyy (gõ tay) + nút lịch (input date ẩn chồng lên icon).
const SmartDateInput = ({ value, onChange }) => {
  const display = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? (() => { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}`; })() : '';
  const [text, setText] = useState(display);
  useEffect(() => { setText(display); }, [display]);
  const commit = (s) => {
    const t = s.trim();
    if (t === '') { onChange(''); return; }
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) onChange(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    else setText(display); // không hợp lệ → trả lại giá trị cũ
  };
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <input
        type="text" value={text} placeholder="dd/mm/yyyy"
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
        style={{ ...dateInputStyle, width: 104, paddingRight: 24 }}
      />
      <input
        type="date" value={value || ''} onChange={e => onChange(e.target.value)}
        title="Chọn từ lịch"
        style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 26, opacity: 0, cursor: 'pointer' }}
      />
      <Calendar size={14} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
    </span>
  );
};

// Bộ lọc 1 trường ngày: preset + tiến/lùi + 2 ô dd/mm/yyyy. onChange nhận {preset, from, to}.
const QuickDateRange = ({ label, preset, from, to, onChange }) => {
  const gran = presetGranularity(preset);
  const canStep = !!gran && !!from;
  const setPreset = (p) => {
    if (p === 'all') onChange({ preset: 'all', from: '', to: '' });
    else if (p === 'custom') onChange({ preset: 'custom', from, to });
    else onChange({ preset: p, ...presetToRange(p) });
  };
  const step = (dir) => { if (canStep) onChange({ preset, ...stepRange(gran, from, dir) }); };
  const arrowStyle = (on) => ({ display: 'flex', alignItems: 'center', padding: '0.3rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: on ? 'pointer' : 'not-allowed', color: on ? '#475569' : '#cbd5e1' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
        <select value={preset} onChange={e => setPreset(e.target.value)} style={{ ...dateInputStyle, padding: '0.35rem 0.3rem' }}>
          {DATE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={() => step(-1)} disabled={!canStep} title="Kỳ trước" style={arrowStyle(canStep)}><ChevronLeft size={15} /></button>
        <SmartDateInput value={from} onChange={v => onChange({ preset: 'custom', from: v, to })} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <SmartDateInput value={to} onChange={v => onChange({ preset: 'custom', from, to: v })} />
        <button onClick={() => step(1)} disabled={!canStep} title="Kỳ sau" style={arrowStyle(canStep)}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
};

// Thẻ số liệu trên bảng dashboard tổng quan.
const DashCard = ({ label, value, color }) => (
  <div style={{
    flex: '1 1 130px', minWidth: 120, background: color + '0d',
    border: `1.5px solid ${color}33`, borderRadius: 12, padding: '0.65rem 0.85rem',
  }}>
    <div style={{ fontSize: '1.55rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 5, fontWeight: 600 }}>{label}</div>
  </div>
);

// Tên khách hàng — mirror chỉ lưu ~15 cột Phần A nên KHÔNG có cột tên_người_yêu_cầu riêng;
// đọc từ phiếu_gốc_json (đầy đủ phiếu gốc). Ưu tiên cột thật nếu sau này promote lên bảng.
const tenKhachHang = (r) => {
  const g = (r && r['phiếu_gốc_json']) || {};
  return r['tên_người_yêu_cầu'] || r['tên_khách_hàng'] || g['tên_người_yêu_cầu'] || g['tên_khách_hàng'] || '';
};

// Cột workflow: dãy "đèn" các bước. Vàng SÁNG = chưa xong, vàng NHẠT (tắt đèn) = đã xong.
// Bấm 1 đèn để bật/tắt xong ngay trên danh sách (cần quyền sửa). Không mở popup khi bấm đèn.
const fmtDeadline = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (!String(v).includes('T')) return `${dd}/${mm}`;
  return `${dd}/${mm} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Màu chip theo (đã xong, mức khẩn). xanh = ngày sau · cam = hôm nay · nháy cam↔đỏ = ≤1h/quá hạn.
const chipPalette = (done, urg) => {
  if (done) return { background: '#fefce8', color: '#a8a29e', border: '1px solid #fde68a', textDecoration: 'line-through' };
  if (urg === 'green') return { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' };
  if (urg === 'orange' || urg === 'blink') return { background: '#fed7aa', color: '#9a3412', border: '1px solid #fb923c' };
  return { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }; // chưa đặt hạn → xanh (bước bình thường)
};

// Dãy chip bước WF. Bấm 1 chip → mở popover: nhập "đã thực hiện gì" (ghi_chú) rồi 1 nút duy nhất
// "Hoàn thành & Đồng bộ" (lật xong + đẩy về Caresoft; bước "Đóng phiếu" → đóng ticket Solved) + "Đóng".
// Popover position:fixed (không bị cắt).
function StepChips({ row, perm, onCompleteSync }) {
  const steps = getEffectiveSteps(row['các_bước']);
  const [open, setOpen] = useState(null); // { index, top, left }
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = open != null ? steps[open.index] : null;
  const curDone = cur ? cur['trạng_thái'] === 'xong' : false;

  const openPop = (e, i) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setDraft(steps[i]?.['ghi_chú'] || '');
    setOpen({ index: i, top: Math.min(r.bottom + 6, window.innerHeight - 220), left: Math.max(8, Math.min(r.left, window.innerWidth - 320)) });
  };
  const close = () => setOpen(null);
  // sync = có quyền N/X (perm.io) → đẩy về Caresoft; không thì chỉ lưu/đánh dấu xong tại app.
  const doAction = async () => {
    setBusy(true);
    try { await onCompleteSync(row, open.index, steps, draft, perm.io); close(); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '4px', alignItems: 'stretch', height: '100%' }}>
      {steps.map((st, i) => {
        const done = st['trạng_thái'] === 'xong';
        const name = st['tên'] || `Bước ${i + 1}`;
        const dl = fmtDeadline(st['hạn_xử_lý']);
        const urg = stepUrgency(st); // 'green' | 'orange' | 'blink' | null
        return (
          <span
            key={i}
            className={`wf-card${urg === 'blink' ? ' wf-blink' : ''}`}
            onClick={(e) => openPop(e, i)}
            title={name + (dl ? ` · hạn ${dl}` : '') + (done
              ? ` — ✓ xong${st['hoàn_thành_lúc'] ? ' lúc ' + fmtDeadline(st['hoàn_thành_lúc']) : ''}${st['người_hoàn_thành'] ? ' bởi ' + st['người_hoàn_thành'] : ''}`
              : urg === 'blink' ? ' — quá/sắp hết hạn!' : ' — chưa xong') + ' · bấm để ghi chú / cập nhật'}
            style={{
              display: 'inline-flex', flexDirection: 'column', justifyContent: 'space-between', gap: '3px',
              width: 106, minHeight: 44, padding: '6px 8px', borderRadius: '10px', fontSize: '0.6rem', fontWeight: 600,
              lineHeight: 1.15, userSelect: 'none', cursor: 'pointer', flex: '0 0 auto',
              ...chipPalette(done, urg),
            }}
          >
            {/* 2 dòng đầu: nội dung bước (tự cắt nếu dài; 📝 = đã có ghi chú) */}
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {done ? '✓ ' : ''}{name}{st['ghi_chú'] ? ' 📝' : ''}
            </span>
            {/* dòng cuối: thời hạn */}
            {dl && <span style={{ fontSize: '0.54rem', fontWeight: 700, whiteSpace: 'nowrap', opacity: 0.9 }}>{dl}</span>}
          </span>
        );
      })}
      {open != null && (
        <>
          <div onClick={(e) => { e.stopPropagation(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: open.top, left: open.left, zIndex: 1001, width: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '0.8rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>{cur?.['tên'] || 'Bước'}</div>
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Đã thực hiện gì... (vd: đã liên hệ chị A, khách hài lòng)" rows={3} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.5rem', fontSize: '0.82rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
              {perm.edit && (
                <button disabled={busy} onClick={doAction} title={perm.io ? 'Lật trạng thái bước & đẩy về Caresoft' : 'Lật trạng thái bước (không có quyền đồng bộ)'} style={{ padding: '0.35rem 0.7rem', borderRadius: '7px', border: 'none', background: curDone ? '#f59e0b' : '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.78rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                  {curDone
                    ? (perm.io ? 'Mở lại & Đồng bộ' : 'Mở lại')
                    : (perm.io ? 'Hoàn thành & Đồng bộ' : 'Hoàn thành')}
                </button>
              )}
              <button disabled={busy} onClick={close} style={{ padding: '0.35rem 0.7rem', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>Đóng</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ô cột "Đồng bộ": badge trạng thái + nút đẩy nhanh phiếu về Caresoft ngay từ danh sách.
function SyncCell({ row, perm, onSync }) {
  const st = row['trạng_thái_đồng_bộ'];
  const m = TRANG_THAI_DONG_BO[st] || TRANG_THAI_DONG_BO['nháp'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
      {badge(m.color, m.label)}
      {perm.io && st !== 'pending' && (
        <button
          className="wf-card"
          onClick={(e) => { e.stopPropagation(); onSync(row); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '8px', border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#047857', cursor: 'pointer', fontWeight: 700, fontSize: '0.62rem', whiteSpace: 'nowrap' }}
        >
          <Send size={11} /> Đồng bộ
        </button>
      )}
    </div>
  );
}

// Khai báo trường cho từng card nhóm thông tin (ngoài danh sách).
//  - kind:'option' → dropdown từ caresoftFieldOptions (cascade theo OPTION_FIELDS[fieldKey].parentKey).
//  - readOnly → chỉ hiển thị (đọc từ row mirror); còn lại = ô text sửa thông_tin_bổ_sung.
// Thứ tự đặt cha trên con: Nhóm SP→Chi tiết lỗi, Mã SP→Linh kiện.
const SP_FIELDS = [
  { key: 'nhóm_sản_phẩm', label: 'Nhóm SP', kind: 'option', fieldKey: 'nhóm_sản_phẩm' },
  { key: 'chi_tiết_lỗi', label: 'Chi tiết lỗi', kind: 'option', fieldKey: 'chi_tiết_lỗi' },
  { key: 'mã_sản_phẩm', label: 'Mã SP', kind: 'option', fieldKey: 'mã_sản_phẩm' },
  { key: 'linh_kiện', label: 'Linh kiện lỗi', kind: 'option', fieldKey: 'linh_kiện' },
  { key: 'ngày_lắp_đặt', label: 'Ngày lắp' },
  { key: 'tình_trạng', label: 'Tình trạng' },
];
const KTV_FIELDS = [
  { key: 'mã_đlđ', label: 'Mã ĐLĐ' }, { key: 'tên_đlđ', label: 'Tên ĐLĐ' },
  { key: 'sđt_đlđ', label: 'SĐT ĐLĐ' }, { key: 'khoảng_cách', label: 'Khoảng cách' },
];
const KH_FIELDS = [
  { key: 'tên_khách_hàng', label: 'Tên KH' }, { key: 'số_điện_thoại_khách_hàng', label: 'SĐT KH' },
  { key: 'địa_chỉ_nhận_hàng', label: 'Địa chỉ' },
];

// Card 1 nhóm thông tin hiển thị NGAY trên danh sách. Bấm card → popover sửa các ô của nhóm đó
// (readOnly đọc từ row; editable đọc/ghi thông_tin_bổ_sung) + Lưu / Đồng bộ (đặt cờ pending).
function InfoGroupCard({ row, perm, title, accent, fields, onSaveGroup }) {
  const [open, setOpen] = useState(null); // { top, left }
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const tin = getThongTinBoSung(row);
  const ttRaw = (row && row['thông_tin_bổ_sung']) || {}; // chứa *_option_id / linh_kiện_option_ids

  // Hiển thị nhãn 1 ô. option-single: resolve theo *_option_id; option-multi: nối nhãn; fallback mirror row[key].
  const valOf = (f) => {
    if (f.kind === 'option') {
      const meta = OPTION_FIELDS[f.fieldKey];
      if (meta.multi) {
        const ids = Array.isArray(ttRaw[f.key + '_option_ids']) ? ttRaw[f.key + '_option_ids'] : [];
        return ids.map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ') || (row[f.key] || '');
      }
      return resolveOptionLabel(fieldOptions, ttRaw[f.key + '_option_id']) || (row[f.key] || '');
    }
    return f.readOnly ? (row[f.key] || '') : (tin[f.key] || '');
  };
  const hasEditable = fields.some(f => f.kind === 'option' || !f.readOnly);

  const openPop = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const d = {};
    fields.forEach(f => {
      if (f.kind === 'option') {
        if (OPTION_FIELDS[f.fieldKey].multi) d[f.key + '_option_ids'] = Array.isArray(ttRaw[f.key + '_option_ids']) ? [...ttRaw[f.key + '_option_ids']] : [];
        else d[f.key + '_option_id'] = ttRaw[f.key + '_option_id'] || '';
      } else if (!f.readOnly) d[f.key] = tin[f.key] || '';
    });
    setDraft(d);
    const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 160));
    setOpen({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), maxH: window.innerHeight - top - 12 });
  };
  const close = () => setOpen(null);
  const save = async (sync) => { setBusy(true); try { await onSaveGroup(row, draft, sync); close(); } finally { setBusy(false); } };

  // Đổi 1 option-single: cập nhật + reset con cascade phụ thuộc nó (nhóm→chi tiết lỗi, mã→linh kiện).
  const setSingleOpt = (fieldKey, v) => setDraft(d => {
    const nd = { ...d, [fieldKey + '_option_id']: v };
    for (const ck of OPTION_FIELD_KEYS) {
      const cm = OPTION_FIELDS[ck];
      if (cm.parentKey === fieldKey) { if (cm.multi) nd[ck + '_option_ids'] = []; else nd[ck + '_option_id'] = ''; }
    }
    return nd;
  });

  const renderEditor = (f) => {
    const meta = OPTION_FIELDS[f.fieldKey];
    const parentOid = meta.parentKey ? (draft[meta.parentKey + '_option_id'] || '') : null;
    const opts = optionsFor(fieldOptions, f.fieldKey, meta.cascade ? parentOid : null);
    const blocked = meta.cascade && !parentOid;
    const parentLabel = meta.parentKey === 'mã_sản_phẩm' ? 'Mã SP' : 'Nhóm SP';
    if (meta.multi) {
      const sel = new Set((draft[f.key + '_option_ids'] || []).map(String));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', maxHeight: 150, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '0.35rem 0.5rem' }}>
          {blocked ? <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>(chọn {parentLabel} trước)</span>
            : opts.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>(không có linh kiện cho máy này)</span>
            : opts.map(o => (
              <label key={o.option_id} style={{ display: 'flex', gap: '0.4rem', fontSize: '0.8rem', alignItems: 'flex-start' }}>
                <input type="checkbox" disabled={!perm.edit} checked={sel.has(String(o.option_id))}
                  onChange={e => setDraft(d => {
                    const cur = new Set((d[f.key + '_option_ids'] || []).map(String));
                    if (e.target.checked) cur.add(String(o.option_id)); else cur.delete(String(o.option_id));
                    return { ...d, [f.key + '_option_ids']: [...cur].map(Number) };
                  })} />
                <span>{o.label}</span>
              </label>
            ))}
        </div>
      );
    }
    return (
      <select value={draft[f.key + '_option_id'] || ''} disabled={!perm.edit || blocked}
        onChange={e => setSingleOpt(f.key, e.target.value)}
        style={{ border: '1px solid #cbd5e1', borderRadius: '7px', padding: '0.4rem 0.5rem', fontSize: '0.84rem', outline: 'none', background: '#fff' }}>
        <option value="">{blocked ? `(chọn ${parentLabel} trước)` : '— chọn —'}</option>
        {opts.map(o => <option key={o.option_id} value={o.option_id}>{o.label}</option>)}
      </select>
    );
  };

  return (
    <div style={{ height: '100%' }}>
      <div onClick={openPop} className="wf-card" title="Bấm để xem / sửa" style={{ cursor: 'pointer', height: '100%', minHeight: 150, boxSizing: 'border-box', minWidth: 150, maxWidth: 230, padding: '7px 9px', borderRadius: '10px', border: `1px solid ${accent}55`, background: `${accent}0d`, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 700, fontSize: '0.66rem', color: accent, marginBottom: 2 }}>{title}</div>
        {fields.map(f => (
          <div key={f.key} style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: '#94a3b8' }}>{f.label}:</span> {valOf(f) || '—'}
          </div>
        ))}
      </div>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: open.top, left: open.left, zIndex: 1001, width: 320, maxHeight: open.maxH, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '0.85rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.6rem' }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {fields.map(f => (
                <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>{f.label}{f.readOnly ? ' (chỉ đọc)' : ''}</label>
                  {f.kind === 'option'
                    ? renderEditor(f)
                    : f.readOnly
                      ? <div style={{ fontSize: '0.82rem', color: '#0f172a', padding: '0.3rem 0' }}>{valOf(f) || '—'}</div>
                      : <input value={draft[f.key] ?? ''} disabled={!perm.edit} onChange={(e) => { const v = e.target.value; setDraft(d => ({ ...d, [f.key]: v })); }} style={{ border: '1px solid #cbd5e1', borderRadius: '7px', padding: '0.4rem 0.5rem', fontSize: '0.84rem', outline: 'none' }} />}
                </div>
              ))}
            </div>
            {hasEditable && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                {perm.edit && <button disabled={busy} onClick={() => save(false)} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>Lưu</button>}
                {perm.io && <button disabled={busy} onClick={() => save(true)} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>Đồng bộ</button>}
                <button disabled={busy} onClick={close} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Đóng</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Đăng ký cột danh sách. Thứ tự hiển thị = thứ tự ở đây. Người dùng bật/tắt qua nút "Ẩn/Hiện cột".
const LIST_COLUMNS = [
  {
    key: 'phiếu_ghi', label: 'Phiếu ghi', render: r => {
      const id = r['id_phiếu_ghi'];
      const label = r['phiếu_ghi'] || id || '-';
      // Bấm số phiếu → mở ticket trên Caresoft (tab mới); không mở popup xử lý.
      return id ? (
        <a
          href={`https://web.caresoft.vn/EUROMADE/ticket/${id}`}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Mở phiếu trên Caresoft"
          style={{ fontWeight: 700, color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >{label}</a>
      ) : <span style={{ fontWeight: 600, color: '#1e293b' }}>{label}</span>;
    }
  },
  // Ô gộp gọn: Mã SP · Chi tiết lỗi · Ngày lắp · Mã ĐH · Tên KH · SĐT (xếp dọc, đúng thứ tự yêu cầu).
  {
    key: 'thông_tin', label: 'Thông tin phiếu', render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.74rem', lineHeight: 1.35 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r['mã_sản_phẩm'] || '-'}</span>
        <span style={{ color: '#475569' }}>{r['chi_tiết_lỗi'] || '-'}</span>
        <span style={{ color: '#64748b' }}>Lắp: {fmtDateOnly(r['ngày_lắp_đặt'])}</span>
        <span style={{ color: '#64748b' }}>ĐH: {r['mã_đơn_hàng'] || '-'}</span>
        <span style={{ color: '#334155' }}>{tenKhachHang(r) || '-'}</span>
        <span style={{ color: '#3b82f6' }}>{r['số_điện_thoại_khách_hàng'] || '-'}</span>
      </div>
    )
  },
  { key: 'card_sp', label: 'Sản phẩm', render: (r, ctx) => <InfoGroupCard row={r} perm={ctx.perm} title="Sản phẩm" accent="#0ea5e9" fields={SP_FIELDS} onSaveGroup={ctx.onSaveGroup} /> },
  { key: 'card_ktv', label: 'KTV (ĐLĐ)', render: (r, ctx) => <InfoGroupCard row={r} perm={ctx.perm} title="KTV (ĐLĐ)" accent="#8b5cf6" fields={KTV_FIELDS} onSaveGroup={ctx.onSaveGroup} /> },
  { key: 'card_kh', label: 'Khách hàng', render: (r, ctx) => <InfoGroupCard row={r} perm={ctx.perm} title="Khách hàng" accent="#16a34a" fields={KH_FIELDS} onSaveGroup={ctx.onSaveGroup} /> },
  { key: 'mã_đơn_hàng', label: 'Mã ĐH', render: r => r['mã_đơn_hàng'] || '-' },
  { key: 'mã_sản_phẩm', label: 'Mã SP', render: r => r['mã_sản_phẩm'] || '-' },
  { key: 'nhóm_sản_phẩm', label: 'Nhóm SP', render: r => r['nhóm_sản_phẩm'] || '-' },
  { key: 'tên_khách_hàng', label: 'Tên KH', render: r => tenKhachHang(r) || '-' },
  { key: 'số_điện_thoại_khách_hàng', label: 'SĐT', render: r => <span style={{ color: '#3b82f6' }}>{r['số_điện_thoại_khách_hàng'] || '-'}</span> },
  { key: 'chi_tiết_lỗi', label: 'Chi tiết lỗi', render: r => r['chi_tiết_lỗi'] || '-' },
  { key: 'linh_kiện', label: 'Linh kiện lỗi', render: r => r['linh_kiện'] || '-' },
  { key: 'ngày_lắp_đặt', label: 'Ngày lắp', render: r => fmtDateOnly(r['ngày_lắp_đặt']) },
  { key: 'thời_điểm_tạo', label: 'Ngày tạo', render: r => fmtDateOnly(r['thời_điểm_tạo']) },
  { key: 'thời_điểm_cập_nhật', label: 'Ngày cập nhật', render: r => fmtDateOnly(r['thời_điểm_cập_nhật']) },
  { key: 'trạng_thái_phiếu_ghi', label: 'TT phiếu (CS)', render: r => r['trạng_thái_phiếu_ghi'] || '-' },
  { key: 'người_phụ_trách', label: 'Người phụ trách', render: r => r['người_phụ_trách'] || <span style={{ color: '#cbd5e1' }}>Chưa giao</span> },
  { key: 'ngày_hẹn', label: 'Ngày hẹn', render: r => r['ngày_hẹn'] ? fmtDateTime(r['ngày_hẹn']) : '-' },
  { key: 'tổng_chi_phí', label: 'Chi phí', render: r => (Number(r['tổng_chi_phí']) || 0).toLocaleString('vi-VN') + ' đ' },
  { key: 'kết_quả_xử_lý', label: 'Kết quả', render: r => r['kết_quả_xử_lý'] || '-' },
  { key: 'trạng_thái_xử_lý', label: 'Trạng thái xử lý', render: r => { const m = statusMeta(r['trạng_thái_xử_lý'] || 'chưa_xử_lý'); return badge(m.color, m.label); } },
  { key: 'các_bước', label: 'Các bước (WF)', render: (r, ctx) => <StepChips row={r} perm={ctx.perm} onCompleteSync={ctx.onCompleteSync} /> },
  { key: 'trạng_thái_đồng_bộ', label: 'Đồng bộ', render: (r, ctx) => <SyncCell row={r} perm={ctx.perm} onSync={ctx.onQuickSync} /> },
];
const TRUNCATE_KEYS = ['chi_tiết_lỗi', 'kết_quả_xử_lý', 'linh_kiện'];
const DEFAULT_VISIBLE = ['phiếu_ghi', 'card_sp', 'card_ktv', 'card_kh', 'trạng_thái_xử_lý', 'các_bước', 'trạng_thái_đồng_bộ'];

export default function WarrantyProcessing() {
  const perm = useTabPerm('warranty', 'xuLy');
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState('wproc_search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('wproc_statusFilter', 'all');
  const [csStatusFilter, setCsStatusFilter] = usePersistedState('wproc_csStatusFilter', 'all'); // lọc trạng_thái_phiếu_ghi (CS)
  const [createdPreset, setCreatedPreset] = usePersistedState('wproc_createdPreset', 'all');
  const [createdFrom, setCreatedFrom] = usePersistedState('wproc_createdFrom', '');
  const [createdTo, setCreatedTo] = usePersistedState('wproc_createdTo', '');
  const [installPreset, setInstallPreset] = usePersistedState('wproc_installPreset', 'all');
  const [installFrom, setInstallFrom] = usePersistedState('wproc_installFrom', '');
  const [installTo, setInstallTo] = usePersistedState('wproc_installTo', '');
  const [updatedPreset, setUpdatedPreset] = usePersistedState('wproc_updatedPreset', 'all');
  const [updatedFrom, setUpdatedFrom] = usePersistedState('wproc_updatedFrom', '');
  const [updatedTo, setUpdatedTo] = usePersistedState('wproc_updatedTo', '');
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [showClosed, setShowClosed] = usePersistedState('wproc_showClosed', false);
  const [visibleCols, setVisibleCols] = usePersistedState('wproc_visibleCols3', DEFAULT_VISIBLE);
  const [showColMenu, setShowColMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = usePersistedState('wproc_rowsPerPage', 50);
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // tick chọn phiếu để tải Excel / cập nhật hàng loạt (giữ qua các trang)

  // Cột đang hiện (giữ thứ tự đăng ký, bỏ qua key lạ trong localStorage cũ).
  const cols = LIST_COLUMNS.filter(c => visibleCols.includes(c.key));
  const toggleCol = (key) => setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const all = [];
      const step = 1000;
      for (let from = 0; ; from += step) {
        const { data, error } = await taskDb
          .from('xu_ly_phieu_bao_hanh')
          .select('*')
          .order('thời_điểm_tạo', { ascending: false })
          .range(from, from + step - 1);
        if (error) { console.warn('[WarrantyProcessing] fetch error:', error.message); break; }
        all.push(...(data || []));
        if (!data || data.length < step) break;
      }
      setRows(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  // Auto-refresh phiếu đang "pending": n8n đẩy về Caresoft rồi ghi 'đã_đồng_bộ'/'lỗi' vào DB BẤT ĐỒNG BỘ
  // (vài giây sau). Poll nhẹ trạng thái các phiếu pending để badge tự nhảy, khỏi phải bấm "Làm mới".
  // Dừng khi hết pending hoặc sau ~2 phút (tránh poll vô hạn nếu n8n lỗi). Chỉ tải lại các cột đồng bộ.
  const pendingKey = useMemo(
    () => rows.filter(r => r['trạng_thái_đồng_bộ'] === 'pending').map(r => r.id).sort().join(','),
    [rows]
  );
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(',');
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const { data, error } = await taskDb
        .from('xu_ly_phieu_bao_hanh')
        .select('id, "trạng_thái_đồng_bộ", "thời_điểm_đồng_bộ", "lỗi_đồng_bộ"')
        .in('id', ids);
      if (!error && data) {
        setRows(prev => prev.map(r => {
          const u = data.find(d => d.id === r.id);
          return u && u['trạng_thái_đồng_bộ'] !== r['trạng_thái_đồng_bộ'] ? { ...r, ...u } : r;
        }));
      }
      if (tries >= 24) clearInterval(timer);
    };
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [pendingKey]);

  // Số liệu dashboard — đếm theo trạng thái Caresoft (trạng_thái_phiếu_ghi) trên CHÍNH bảng
  // xử lý (rows). Đếm từ rows (không phải bảng nguồn) để khi đóng/mở phiếu là số đổi ngay.
  const stats = useMemo(() => {
    const s = { total: rows.length, new: 0, open: 0, pending: 0, done: 0 };
    for (const r of rows) {
      const st = String(r['trạng_thái_phiếu_ghi'] || '').toLowerCase().trim();
      if (st === 'new') s.new++;
      else if (st === 'open' || st === 'processing') s.open++;
      else if (st === 'pending') s.pending++;
      else if (st === 'closed' || st === 'close' || st === 'solved') s.done++;
    }
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    // Lọc trạng thái phiếu (CS): nếu chọn cụ thể → hiện đúng nhóm đó (kể cả đã đóng).
    // Ngược lại, mặc định chỉ hiện phiếu CÒN MỞ, trừ khi bật "Hiện cả phiếu đã đóng".
    if (csStatusFilter !== 'all') r = r.filter(x => String(x['trạng_thái_phiếu_ghi'] || '').toLowerCase() === csStatusFilter);
    else if (!showClosed) r = r.filter(isQualifyingTicket);
    if (statusFilter !== 'all') r = r.filter(x => (x['trạng_thái_xử_lý'] || 'chưa_xử_lý') === statusFilter);
    // Lọc theo các khoảng ngày (ngày tạo / lắp đặt / cập nhật).
    if (createdFrom || createdTo) r = r.filter(x => dateInRange(x['thời_điểm_tạo'], createdFrom, createdTo));
    if (installFrom || installTo) r = r.filter(x => dateInRange(x['ngày_lắp_đặt'], installFrom, installTo));
    if (updatedFrom || updatedTo) r = r.filter(x => dateInRange(x['thời_điểm_cập_nhật'], updatedFrom, updatedTo));
    if (search.trim()) {
      // Tách nhiều từ khóa theo dấu cách → tìm HOẶC: 1 dòng khớp nếu chứa BẤT KỲ từ khóa nào
      // (cho phép dán nhiều mã ticket 1 lần, vd "11721 13514 21398").
      const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
      const fields = ['phiếu_ghi', 'id_phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'chi_tiết_lỗi', 'người_phụ_trách'];
      r = r.filter(x => {
        const hay = fields.map(k => String(x[k] || '').toLowerCase());
        hay.push(tenKhachHang(x).toLowerCase()); // tìm cả theo tên khách hàng (từ phiếu_gốc_json)
        return tokens.some(tok => hay.some(h => h.includes(tok)));
      });
    }
    return r;
  }, [rows, statusFilter, csStatusFilter, search, showClosed, createdFrom, createdTo, installFrom, installTo, updatedFrom, updatedTo]);

  // Đếm số bộ lọc nâng cao đang bật (cho badge trên nút).
  const advActiveCount = [csStatusFilter !== 'all', createdFrom || createdTo, installFrom || installTo, updatedFrom || updatedTo].filter(Boolean).length;
  const clearAdvFilters = () => {
    setCsStatusFilter('all');
    setCreatedPreset('all'); setCreatedFrom(''); setCreatedTo('');
    setInstallPreset('all'); setInstallFrom(''); setInstallTo('');
    setUpdatedPreset('all'); setUpdatedFrom(''); setUpdatedTo('');
    setPage(1);
  };

  // rowsPerPage có thể là số hoặc 'all' (hiện tất cả). 'all' → 1 trang chứa toàn bộ.
  const pageSize = rowsPerPage === 'all' ? (filtered.length || 1) : Number(rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Lưu (giữ trạng_thái_đồng_bộ hiện tại, không đẩy)
  const handleSave = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(payload).eq('id', id);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setEditing(null);
    await fetchRows();
  };

  // Hoàn tất & đồng bộ: set cờ pending → webhook n8n sẽ đẩy về Caresoft
  const handleSync = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh')
      .update({ ...payload, 'trạng_thái_đồng_bộ': 'pending', 'lỗi_đồng_bộ': null }).eq('id', id);
    if (error) { alert('Lỗi đồng bộ: ' + error.message); return; }
    alert('Đã đánh dấu phiếu chờ đồng bộ về Caresoft.');
    setEditing(null);
    await fetchRows();
  };

  // Hoàn thành (hoặc mở lại) 1 bước + ghi chú "đã thực hiện" + (tùy chọn) đồng bộ về Caresoft.
  // Gộp 3 thao tác cũ (tick xong / lưu ghi chú / đồng bộ) làm 1 nút "Hoàn thành & Đồng bộ".
  //  - Lật trạng_thái bước (theo quy tắc tuần tự của applyStepToggle), vật chất hóa workflow chuẩn.
  //  - Khi bước "Đóng phiếu" đổi trạng thái → set trạng_thái_caresoft_muốn_set ('solved'/'open').
  //    ĐÂY là tín hiệu n8n đọc để đổi status ticket; thiếu nó thì CS không bao giờ chuyển Solved.
  //  - doSync=true → ghi chú bước thành comment + cờ pending (n8n đẩy về Caresoft). Cập nhật lạc quan UI.
  const completeStepAndSync = async (row, index, steps, note, doSync) => {
    const operator = (user && (user.name || user.id)) || '';
    const { steps: toggled, error: gateErr } = applyStepToggle(steps, index, operator);
    if (gateErr) { alert(gateErr); return; } // chưa đủ điều kiện hoàn tất (bước trước chưa xong)
    const nextSteps = toggled.map((st, i) => i === index ? { ...st, 'ghi_chú': note } : st);
    const patch = { 'các_bước': nextSteps, 'người_cập_nhật': operator };
    // Đổi trạng thái phiếu (+ tín hiệu cho Caresoft) khi bước "Đóng phiếu" được hoàn tất / mở lại.
    const csWant = csStatusOnClosingToggle(steps, nextSteps); // 'solved' | 'open' | ''
    if (csWant) {
      patch['trạng_thái_phiếu_ghi'] = csWant;
      patch['trạng_thái_caresoft_muốn_set'] = csWant;
    }
    if (doSync) {
      const tt = { ...(row['thông_tin_bổ_sung'] || {}) };
      if (note && note.trim()) {
        const stepName = String(steps[index]?.['tên'] || `Bước ${index + 1}`).trim();
        tt['ghi_chú_đồng_bộ'] = `[Cập nhật từ Webapp QLSX]\n${stepName}: ${note.trim()}`;
      } else {
        delete tt['ghi_chú_đồng_bộ']; // để n8n tự dựng tóm tắt chung (gồm các bước đã xong)
      }
      patch['thông_tin_bổ_sung'] = tt;
      patch['trạng_thái_đồng_bộ'] = 'pending';
      patch['lỗi_đồng_bộ'] = null;
    }
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, ...patch } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(patch).eq('id', row.id);
    if (error) { alert('Lỗi cập nhật bước: ' + error.message); await fetchRows(); }
  };

  // Lưu 1 nhóm thông tin từ card ngoài danh sách: merge các ô sửa vào thông_tin_bổ_sung.
  // Với trường option (Nhóm/Mã SP/Chi tiết lỗi/Linh kiện): draft chứa *_option_id / *_option_ids;
  // ghi kèm NHÃN vào key gốc để hiển thị & comment đồng bộ. doSync=true → cờ pending (n8n đẩy về CS).
  const saveInfoGroup = async (row, draft, doSync) => {
    const operator = (user && (user.name || user.id)) || '';
    const tt = { ...(row['thông_tin_bổ_sung'] || {}), ...draft };
    for (const k of OPTION_FIELD_KEYS) {
      const meta = OPTION_FIELDS[k];
      if (meta.multi) {
        if (Array.isArray(tt[k + '_option_ids'])) tt[k] = tt[k + '_option_ids'].map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ');
      } else if (tt[k + '_option_id'] !== undefined) {
        tt[k] = resolveOptionLabel(fieldOptions, tt[k + '_option_id']) || '';
      }
    }
    const patch = { 'thông_tin_bổ_sung': tt, 'người_cập_nhật': operator };
    if (doSync) { patch['trạng_thái_đồng_bộ'] = 'pending'; patch['lỗi_đồng_bộ'] = null; }
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, ...patch } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(patch).eq('id', row.id);
    if (error) { alert('Lỗi lưu nhóm thông tin: ' + error.message); await fetchRows(); }
  };

  // Đẩy nhanh 1 phiếu về Caresoft ngay từ danh sách (đặt cờ pending → webhook n8n xử lý).
  const quickSync = async (row) => {
    const label = row['phiếu_ghi'] || row['id_phiếu_ghi'];
    if (!window.confirm(`Đẩy phiếu ${label} về Caresoft?`)) return;
    const operator = (user && (user.name || user.id)) || '';
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, 'trạng_thái_đồng_bộ': 'pending' } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh')
      .update({ 'trạng_thái_đồng_bộ': 'pending', 'lỗi_đồng_bộ': null, 'người_cập_nhật': operator }).eq('id', row.id);
    if (error) { alert('Lỗi đồng bộ: ' + error.message); await fetchRows(); }
  };

  // ── Tick chọn phiếu để tải Excel ──
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const pageAllSelected = pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id));
  const togglePageAll = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (pageAllSelected) pageRows.forEach(r => next.delete(r.id));
    else pageRows.forEach(r => next.add(r.id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  // Đóng (solved) / Mở lại (open) phiếu — áp cho TẤT CẢ phiếu đã tick (1 hoặc nhiều).
  //  - Luôn ghi trạng_thái_phiếu_ghi (mirror) + trạng_thái_caresoft_muốn_set (ý muốn — tín hiệu DUY NHẤT
  //    n8n đọc để đổi status ticket). Thiếu trường này thì CS không bao giờ chuyển Solved.
  //  - Có quyền N/X (perm.io) → đặt cờ pending để n8n đẩy về Caresoft ngay; không thì chỉ lưu, lần
  //    "Đồng bộ" sau (của người có quyền) sẽ mang theo ý muốn này. Cập nhật lạc quan UI.
  const bulkSetStatus = async (status) => {
    const ids = [...selectedIds];
    if (ids.length === 0) { alert('Vui lòng tick chọn ít nhất 1 phiếu!'); return; }
    const verb = status === 'solved' ? 'ĐÓNG' : 'MỞ LẠI';
    if (!window.confirm(`${verb} ${ids.length} phiếu đã chọn?${perm.io ? ' (đồng bộ về Caresoft)' : ''}`)) return;
    const operator = (user && (user.name || user.id)) || '';
    const patch = { 'trạng_thái_phiếu_ghi': status, 'trạng_thái_caresoft_muốn_set': status, 'người_cập_nhật': operator };
    if (perm.io) { patch['trạng_thái_đồng_bộ'] = 'pending'; patch['lỗi_đồng_bộ'] = null; }
    setRows(prev => prev.map(x => selectedIds.has(x.id) ? { ...x, ...patch } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(patch).in('id', ids);
    if (error) { alert('Lỗi cập nhật trạng thái: ' + error.message); await fetchRows(); return; }
    clearSelection();
  };

  // Tải các phiếu đã tick ra file .xlsx (giữ thứ tự cột theo bảng).
  const exportToExcel = () => {
    const chosen = filtered.filter(r => selectedIds.has(r.id));
    if (chosen.length === 0) { alert('Vui lòng tick chọn ít nhất 1 phiếu để tải Excel!'); return; }
    const data = chosen.map(r => ({
      'Phiếu ghi': r['phiếu_ghi'] || r['id_phiếu_ghi'] || '',
      'Mã ĐH': r['mã_đơn_hàng'] || '',
      'Mã SP': r['mã_sản_phẩm'] || '',
      'Nhóm SP': r['nhóm_sản_phẩm'] || '',
      'Tên KH': tenKhachHang(r),
      'SĐT': r['số_điện_thoại_khách_hàng'] || '',
      'Chi tiết lỗi': r['chi_tiết_lỗi'] || '',
      'Linh kiện lỗi': r['linh_kiện'] || '',
      'Ngày lắp đặt': fmtDateOnly(r['ngày_lắp_đặt']),
      'Ngày tạo': fmtDateOnly(r['thời_điểm_tạo']),
      'Ngày cập nhật': fmtDateOnly(r['thời_điểm_cập_nhật']),
      'TT phiếu (CS)': r['trạng_thái_phiếu_ghi'] || '',
      'Người phụ trách': r['người_phụ_trách'] || '',
      'Ngày hẹn': r['ngày_hẹn'] ? fmtDateTime(r['ngày_hẹn']) : '',
      'Tổng chi phí': Number(r['tổng_chi_phí']) || 0,
      'Kết quả xử lý': r['kết_quả_xử_lý'] || '',
      'Trạng thái xử lý': statusMeta(r['trạng_thái_xử_lý'] || 'chưa_xử_lý').label,
      'Các bước (WF)': summarizeSteps(r['các_bước']),
      'Trạng thái đồng bộ': (TRANG_THAI_DONG_BO[r['trạng_thái_đồng_bộ']] || TRANG_THAI_DONG_BO['nháp']).label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'XuLyPhieu');
    XLSX.writeFile(wb, `XuLyPhieu_${new Date().getTime()}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><RefreshCw size={36} className="spin" color="#6366f1" /></div>;
  }

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* Dashboard tổng quan — đếm theo trạng thái ticket Caresoft, lấy trực tiếp từ bảng
          nguồn phieu_bao_hanh nên gồm cả phiếu đã đóng (không có trong tab xử lý). */}
      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', margin: '0 0.5rem 1rem' }}>
        <DashCard label="Tổng phiếu" value={stats.total} color="#6366f1" />
        <DashCard label="Mới (new)" value={stats.new} color="#0ea5e9" />
        <DashCard label="Đang xử lý (open)" value={stats.open} color="#f59e0b" />
        <DashCard label="Chờ đẩy (pending)" value={stats.pending} color="#d97706" />
        <DashCard label="Đã xử lý (closed/solved)" value={stats.done} color="#16a34a" />
      </div>

      {/* Bộ lọc */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.6rem', flex: '1 1 240px' }}>
          <Search size={16} color="#94a3b8" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm phiếu, mã ĐH, SP, SĐT, lỗi... (nhiều mã cách nhau bằng dấu cách)" style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}>
          <option value="all">Tất cả trạng thái xử lý</option>
          {TRANG_THAI_XU_LY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={fetchRows} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: loading ? 'wait' : 'pointer', fontWeight: 600, color: '#475569', opacity: loading ? 0.65 : 1 }}><RefreshCw size={15} className={loading ? 'spin' : undefined} /> {loading ? 'Đang tải...' : 'Làm mới'}</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showClosed} onChange={e => { setShowClosed(e.target.checked); setPage(1); }} /> Hiện cả phiếu đã đóng
        </label>

        {/* Ẩn / Hiện cột */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowColMenu(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569' }}><Filter size={15} /> Ẩn / Hiện cột</button>
          {showColMenu && (
            <div className="responsive-pop" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '230px', maxHeight: '360px', overflowY: 'auto', padding: '0.8rem' }}>
              <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>Cột hiển thị</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {LIST_COLUMNS.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bật/tắt panel lọc nâng cao (trạng thái phiếu CS + các khoảng ngày) */}
        <button onClick={() => setShowAdvFilter(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: `1px solid ${advActiveCount ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', background: advActiveCount ? '#eef2ff' : '#fff', cursor: 'pointer', fontWeight: 600, color: advActiveCount ? '#4f46e5' : '#475569' }}>
          <Filter size={15} /> Lọc nâng cao{advActiveCount ? ` (${advActiveCount})` : ''}
        </button>

        {/* Hành động trên phiếu đã tick: đổi trạng thái hàng loạt (quyền Sửa) + tải Excel (quyền N/X) */}
        {(perm.edit || perm.io) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
            {selectedIds.size > 0 && (
              <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>Đã chọn {selectedIds.size}</span>
            )}
            {perm.edit && selectedIds.size > 0 && (
              <>
                <button
                  onClick={() => bulkSetStatus('solved')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', border: 'none', borderRadius: '8px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', boxShadow: '0 2px 4px rgba(22,163,74,0.25)' }}
                >
                  <CheckCircle2 size={15} /> Đóng phiếu
                </button>
                <button
                  onClick={() => bulkSetStatus('open')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', border: '1px solid #f59e0b', borderRadius: '8px', background: '#fffbeb', color: '#b45309', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  <RotateCcw size={15} /> Mở lại
                </button>
              </>
            )}
            {selectedIds.size > 0 && (
              <button onClick={clearSelection} style={{ padding: '0.5rem 0.7rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>Bỏ chọn</button>
            )}
            {perm.io && (
              <button
                onClick={exportToExcel}
                disabled={selectedIds.size === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', border: 'none', borderRadius: '8px', background: selectedIds.size === 0 ? '#cbd5e1' : '#10b981', color: '#fff', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', boxShadow: selectedIds.size === 0 ? 'none' : '0 2px 4px rgba(16,185,129,0.25)' }}
              >
                <Download size={15} /> Tải Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Panel lọc nâng cao */}
      {showAdvFilter && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', margin: '0 0.5rem 1rem', padding: '0.9rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Trạng thái phiếu (CS)</span>
              <select value={csStatusFilter} onChange={e => { setCsStatusFilter(e.target.value); setPage(1); }} style={{ ...dateInputStyle, padding: '0.35rem 0.4rem' }}>
                <option value="all">Tất cả</option>
                {CS_STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            {advActiveCount > 0 && (
              <button onClick={clearAdvFilters} style={{ padding: '0.45rem 0.8rem', border: '1px solid #fca5a5', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>Xóa lọc</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <QuickDateRange label="Ngày tạo" preset={createdPreset} from={createdFrom} to={createdTo}
              onChange={({ preset, from, to }) => { setCreatedPreset(preset); setCreatedFrom(from); setCreatedTo(to); setPage(1); }} />
            <QuickDateRange label="Ngày lắp đặt" preset={installPreset} from={installFrom} to={installTo}
              onChange={({ preset, from, to }) => { setInstallPreset(preset); setInstallFrom(from); setInstallTo(to); setPage(1); }} />
            <QuickDateRange label="Ngày cập nhật" preset={updatedPreset} from={updatedFrom} to={updatedTo}
              onChange={({ preset, from, to }) => { setUpdatedPreset(preset); setUpdatedFrom(from); setUpdatedTo(to); setPage(1); }} />
          </div>
        </div>
      )}

      {/* Bảng */}
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: Math.max(600, cols.length * 130) }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: '0.8rem 0.5rem', borderBottom: '2px solid #e2e8f0', width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  ref={el => { if (el) el.indeterminate = !pageAllSelected && pageRows.some(r => selectedIds.has(r.id)); }}
                  onChange={togglePageAll}
                  title="Chọn/bỏ chọn cả trang"
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '0.8rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={Math.max(1, cols.length) + 1} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Không có phiếu cần xử lý.</td></tr>
            ) : pageRows.map((r, idx) => (
              <tr key={r.id} onClick={() => setEditing(r)} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.has(r.id) ? '#eef2ff' : (idx % 2 ? '#f8fafc' : '#fff'), cursor: 'pointer' }}>
                <td onClick={e => e.stopPropagation()} style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ cursor: 'pointer' }} />
                </td>
                {cols.map(c => {
                  const isSteps = c.key === 'các_bước';
                  const isInfo = c.key === 'thông_tin';
                  return (
                    <td key={c.key} style={{
                      padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#334155', verticalAlign: 'top',
                      maxWidth: isSteps ? 'none' : isInfo ? 300 : (TRUNCATE_KEYS.includes(c.key) ? '220px' : 'none'),
                      minWidth: isSteps ? 260 : isInfo ? 210 : undefined,
                      overflow: (isSteps || isInfo) ? 'visible' : 'hidden',
                      textOverflow: (isSteps || isInfo) ? 'clip' : 'ellipsis',
                      whiteSpace: isInfo ? 'normal' : 'nowrap',
                    }}>
                      {c.render(r, { perm, onCompleteSync: completeStepAndSync, onQuickSync: quickSync, onSaveGroup: saveInfoGroup })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tổng <b>{filtered.length}</b> phiếu</span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select value={rowsPerPage} onChange={e => { const v = e.target.value; setRowsPerPage(v === 'all' ? 'all' : Number(v)); setPage(1); }} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px' }}>
            <option value={20}>20 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option>
            <option value={500}>500 dòng</option><option value={1000}>1000 dòng</option><option value="all">Tất cả</option>
          </select>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}><ChevronLeft size={16} /></button>
            <span style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Trang {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {editing && <ProcessingModal row={editing} perm={perm} currentUser={user} onClose={() => setEditing(null)} onSave={handleSave} onSync={handleSync} />}
    </div>
  );
}
