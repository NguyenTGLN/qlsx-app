import React, { useState, useMemo } from 'react';
import { X, Save, Send, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { TRANG_THAI_XU_LY, computeTotalCost, WORKFLOW_STEPS_MAU, applyStepToggle, ensureClosingStep, isClosingStepDone, getThongTinBoSung, OPTION_FIELDS, OPTION_FIELD_KEYS, optionsFor, resolveOptionLabel } from '../../lib/warrantyProcessing';
import fieldOptions from '../../data/caresoftFieldOptions.json';

const s = {
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#334155' },
  input: { padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem', width: '100%' },
  section: { borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' },
  sectionTitle: { margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' },
  readonlyVal: { fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 },
  readonlyLbl: { fontSize: '0.75rem', color: '#64748b' },
};

// Ô sửa từng-trường: bấm để mở sửa; có nút Lưu (lưu DB) + Đồng bộ (lưu + đẩy CS) + Hủy.
//  - editable=false → chỉ hiển thị giá trị (trường option chỉ-đọc).
//  - canSync=false → ẩn nút Đồng bộ (không có quyền N/X).
function EditableField({ label, value, editable, canSync, saving, onSave, onSync, full }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  // Vào chế độ sửa thì nạp lại draft = value hiện tại (thay cho useEffect đồng bộ — tránh cascading render).
  const startEdit = () => { setDraft(value || ''); setEditing(true); };
  const wrap = full ? { ...s.inputGroup, gridColumn: 'span 2' } : s.inputGroup;
  if (!editable) {
    return (
      <div style={wrap}>
        <label style={s.label}>{label}</label>
        <div style={{ ...s.readonlyVal, padding: '0.55rem 0', minHeight: '1.2em' }}>{value || <span style={{ color: '#cbd5e1', fontWeight: 400 }}>—</span>}</div>
      </div>
    );
  }
  if (!editing) {
    return (
      <div style={wrap}>
        <label style={s.label}>{label}</label>
        <div onClick={startEdit} title="Bấm để sửa" style={{ ...s.input, cursor: 'pointer', background: '#f8fafc', minHeight: '1.2em', display: 'flex', alignItems: 'center' }}>
          {value || <span style={{ color: '#94a3b8' }}>(bấm để nhập)</span>}
        </div>
      </div>
    );
  }
  const btn = (bg) => ({ padding: '0.35rem 0.7rem', borderRadius: '7px', border: 'none', background: bg, color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.25rem' });
  return (
    <div style={wrap}>
      <label style={s.label}>{label}</label>
      <input autoFocus style={s.input} value={draft} onChange={e => setDraft(e.target.value)} />
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
        <button disabled={saving} onClick={async () => { await onSave(draft); setEditing(false); }} style={btn('#3b82f6')}><Save size={13} /> Lưu</button>
        {canSync && <button disabled={saving} onClick={async () => { await onSync(draft); setEditing(false); }} style={btn('#10b981')}><Send size={13} /> Đồng bộ</button>}
        <button disabled={saving} onClick={() => { setDraft(value || ''); setEditing(false); }} style={{ padding: '0.35rem 0.7rem', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Hủy</button>
      </div>
    </div>
  );
}

export default function ProcessingModal({ row, perm, currentUser, onClose, onSave, onSync }) {
  const [form, setForm] = useState(() => ({
    'người_phụ_trách': row['người_phụ_trách'] || '',
    'trạng_thái_xử_lý': row['trạng_thái_xử_lý'] || 'chưa_xử_lý',
    'ngày_hẹn': row['ngày_hẹn'] ? String(row['ngày_hẹn']).substring(0, 16) : '',
    'kết_quả_xử_lý': row['kết_quả_xử_lý'] || '',
    'trạng_thái_caresoft_muốn_set': row['trạng_thái_caresoft_muốn_set'] || '',
  }));
  const [steps, setSteps] = useState(() => ensureClosingStep(
    (Array.isArray(row['các_bước']) && row['các_bước'].length)
      ? row['các_bước']
      : WORKFLOW_STEPS_MAU.map(t => ({ 'tên': t, 'trạng_thái': 'chưa_xong', 'người_làm': '', 'ghi_chú': '', 'hạn_xử_lý': '' }))
  ));
  const [parts, setParts] = useState(() => Array.isArray(row['linh_kiện_thay']) ? row['linh_kiện_thay'] : []);
  const [history] = useState(() => Array.isArray(row['lịch_sử_thao_tác']) ? row['lịch_sử_thao_tác'] : []);
  const [newNote, setNewNote] = useState('');
  const [tinBoSung, setTinBoSung] = useState(() => getThongTinBoSung(row));
  // 4 trường option (Nhóm/Mã SP single, Chi tiết lỗi single, Linh kiện multi). Prefill từ thông_tin_bổ_sung.
  const [optIds, setOptIds] = useState(() => {
    const tt = row['thông_tin_bổ_sung'] || {};
    return {
      'nhóm_sản_phẩm': tt['nhóm_sản_phẩm_option_id'] || '',
      'mã_sản_phẩm': tt['mã_sản_phẩm_option_id'] || '',
      'chi_tiết_lỗi': tt['chi_tiết_lỗi_option_id'] || '',
      'linh_kiện': Array.isArray(tt['linh_kiện_option_ids']) ? tt['linh_kiện_option_ids'] : [],
    };
  });
  const [saving, setSaving] = useState(false);

  // Đổi 1 option-single → reset con cascade phụ thuộc (nhóm→chi tiết lỗi, mã→linh kiện).
  const setOpt = (fieldKey, v) => setOptIds(prev => {
    const nd = { ...prev, [fieldKey]: v };
    for (const ck of OPTION_FIELD_KEYS) { const cm = OPTION_FIELDS[ck]; if (cm.parentKey === fieldKey) nd[ck] = cm.multi ? [] : ''; }
    return nd;
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const totalCost = useMemo(() => computeTotalCost(parts), [parts]);

  // ── Các bước tùy biến ──
  const addStep = () => setSteps(prev => [...prev, { 'tên': '', 'trạng_thái': 'chưa_xong', 'người_làm': '', 'ghi_chú': '', 'hạn_xử_lý': '' }]);
  const updateStep = (i, k, v) => setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, [k]: v } : st));
  const toggleStep = (i) => setSteps(prev => {
    const { steps: next, error } = applyStepToggle(prev, i, (currentUser && (currentUser.name || currentUser.id)) || '');
    if (error) { alert(error); return prev; }
    return next;
  });
  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  // ── Linh kiện thay ──
  const addPart = () => setParts(prev => [...prev, { 'tên': '', 'số_lượng': 1, 'đơn_giá': 0, 'tính_phí': true }]);
  const updatePart = (i, k, v) => setParts(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePart = (i) => setParts(prev => prev.filter((_, idx) => idx !== i));

  // Gom dữ liệu để lưu. tinOverride: dùng khi sửa-từng-ô (tránh state cũ). Note mới append vào lịch sử.
  const buildPayload = (tinOverride) => {
    const operator = (currentUser && (currentUser.name || currentUser.id)) || '';
    const nextHistory = newNote.trim()
      ? [...history, { 'thời_gian': new Date().toISOString(), 'người': operator, 'nội_dung': newNote.trim() }]
      : history;
    // Luôn đảm bảo bước cuối là "Đóng phiếu". Nếu bước đó đã xong → đóng phiếu (solved).
    const finalSteps = ensureClosingStep(steps);
    // Trạng thái Caresoft muốn đẩy: ưu tiên lựa chọn ở dropdown; nếu để trống mà bước "Đóng phiếu"
    // đã xong → 'solved'. Đây là tín hiệu DUY NHẤT n8n đọc để đổi status ticket (thiếu nó CS không đóng).
    const wantCs = form['trạng_thái_caresoft_muốn_set'] || (isClosingStepDone(finalSteps) ? 'solved' : '');
    // thông_tin_bổ_sung: giữ key cũ + 9 ô text (resolve) + 4 trường option (id + nhãn).
    const tin = { ...(row['thông_tin_bổ_sung'] || {}), ...(tinOverride || tinBoSung) };
    tin['nhóm_sản_phẩm_option_id'] = optIds['nhóm_sản_phẩm'] || '';
    tin['mã_sản_phẩm_option_id'] = optIds['mã_sản_phẩm'] || '';
    tin['chi_tiết_lỗi_option_id'] = optIds['chi_tiết_lỗi'] || '';
    tin['linh_kiện_option_ids'] = optIds['linh_kiện'] || [];
    for (const k of ['nhóm_sản_phẩm', 'mã_sản_phẩm', 'chi_tiết_lỗi']) tin[k] = resolveOptionLabel(fieldOptions, tin[k + '_option_id']) || tin[k] || '';
    tin['linh_kiện'] = (tin['linh_kiện_option_ids'] || []).map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ') || tin['linh_kiện'] || '';
    return {
      'người_phụ_trách': form['người_phụ_trách'],
      'trạng_thái_xử_lý': form['trạng_thái_xử_lý'],
      'ngày_hẹn': form['ngày_hẹn'] || null,
      'kết_quả_xử_lý': form['kết_quả_xử_lý'],
      'trạng_thái_caresoft_muốn_set': wantCs || null,
      'các_bước': finalSteps,
      ...(wantCs ? { 'trạng_thái_phiếu_ghi': wantCs } : {}),
      'linh_kiện_thay': parts,
      'tổng_chi_phí': totalCost,
      'lịch_sử_thao_tác': nextHistory,
      'người_cập_nhật': operator,
      'người_tạo': row['người_tạo'] || operator,
      'thông_tin_bổ_sung': tin,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(row.id, buildPayload()); } finally { setSaving(false); }
  };
  const handleSync = async () => {
    setSaving(true);
    try { await onSync(row.id, buildPayload()); } finally { setSaving(false); }
  };

  // Sửa-từng-ô: cập nhật 1 khóa của thông_tin_bổ_sung rồi Lưu/Đồng bộ ngay (dùng giá trị mới, không chờ state).
  const onSaveField = async (key, value) => {
    const next = { ...tinBoSung, [key]: value };
    setTinBoSung(next);
    setSaving(true);
    try { await onSave(row.id, buildPayload(next)); } finally { setSaving(false); }
  };
  const onSyncField = async (key, value) => {
    const next = { ...tinBoSung, [key]: value };
    setTinBoSung(next);
    setSaving(true);
    try { await onSync(row.id, buildPayload(next)); } finally { setSaving(false); }
  };
  // EditableField cho 1 khóa thông_tin_bổ_sung (gọn ở JSX).
  const tinField = (label, key, full) => (
    <EditableField label={label} value={tinBoSung[key]} editable={perm.edit} canSync={perm.io} saving={saving}
      onSave={v => onSaveField(key, v)} onSync={v => onSyncField(key, v)} full={full} />
  );

  // Trường option (dropdown/cascade). Lưu vào state optIds; buildPayload sẽ ghi *_option_id + nhãn khi bấm Lưu/Đồng bộ dưới.
  const optField = (fieldKey, label, full) => {
    const meta = OPTION_FIELDS[fieldKey];
    const parentOid = meta.parentKey ? optIds[meta.parentKey] : null;
    const opts = optionsFor(fieldOptions, fieldKey, meta.cascade ? parentOid : null);
    const blocked = meta.cascade && !parentOid;
    const parentLabel = meta.parentKey === 'mã_sản_phẩm' ? 'Mã SP' : 'Nhóm SP';
    const wrap = full ? { ...s.inputGroup, gridColumn: 'span 2' } : s.inputGroup;
    return (
      <div style={wrap}>
        <label style={s.label}>{label}</label>
        {meta.multi ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', maxHeight: 170, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
            {blocked ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>(chọn {parentLabel} trước)</span>
              : opts.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>(không có linh kiện cho máy này)</span>
              : opts.map(o => {
                const sel = (optIds[fieldKey] || []).map(String).includes(String(o.option_id));
                return (
                  <label key={o.option_id} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.85rem', alignItems: 'flex-start' }}>
                    <input type="checkbox" disabled={!perm.edit} checked={sel}
                      onChange={e => setOptIds(prev => {
                        const cur = new Set((prev[fieldKey] || []).map(String));
                        if (e.target.checked) cur.add(String(o.option_id)); else cur.delete(String(o.option_id));
                        return { ...prev, [fieldKey]: [...cur].map(Number) };
                      })} />
                    <span>{o.label}</span>
                  </label>
                );
              })}
          </div>
        ) : (
          <select style={s.input} value={optIds[fieldKey] || ''} disabled={!perm.edit || blocked} onChange={e => setOpt(fieldKey, e.target.value)}>
            <option value="">{blocked ? `(chọn ${parentLabel} trước)` : '— chọn —'}</option>
            {opts.map(o => <option key={o.option_id} value={o.option_id}>{o.label}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>Xử lý phiếu {row['phiếu_ghi'] || row['id_phiếu_ghi']}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
        </div>

        {/* Nhóm 1: Thông tin phiếu (chỉ đọc) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '10px' }}>
          <div><div style={s.readonlyLbl}>Phiếu ghi</div><div style={s.readonlyVal}>{row['phiếu_ghi'] || row['id_phiếu_ghi'] || '-'}</div></div>
          <EditableField label="Mã đơn hàng" value={tinBoSung['mã_đơn_hàng'] || row['mã_đơn_hàng'] || ''} editable={perm.edit} canSync={perm.io} saving={saving}
            onSave={v => onSaveField('mã_đơn_hàng', v)} onSync={v => onSyncField('mã_đơn_hàng', v)} />
          <div><div style={s.readonlyLbl}>Ngày tạo</div><div style={s.readonlyVal}>{row['thời_điểm_tạo'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Trạng thái phiếu (Caresoft)</div><div style={s.readonlyVal}>{row['trạng_thái_phiếu_ghi'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Phân loại</div><div style={s.readonlyVal}>{row['phân_loại_công_việc'] || '-'}</div></div>
        </div>

        {/* Nhóm 2: Thông tin sản phẩm — dropdown cascade (Nhóm SP→Chi tiết lỗi · Mã SP→Linh kiện) */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin sản phẩm</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {optField('nhóm_sản_phẩm', 'Nhóm sản phẩm')}
            {optField('chi_tiết_lỗi', 'Chi tiết lỗi')}
            {optField('mã_sản_phẩm', 'Mã sản phẩm')}
            {optField('linh_kiện', 'Linh kiện lỗi', true)}
            {tinField('Ngày lắp đặt', 'ngày_lắp_đặt')}
            {tinField('Tình trạng', 'tình_trạng')}
          </div>
        </div>

        {/* Nhóm 3: Thông tin KTV (ĐLĐ) */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin KTV (ĐLĐ)</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {tinField('Mã ĐLĐ', 'mã_đlđ')}
            {tinField('Tên ĐLĐ', 'tên_đlđ')}
            {tinField('SĐT ĐLĐ', 'sđt_đlđ')}
            {tinField('Khoảng cách', 'khoảng_cách')}
          </div>
        </div>

        {/* Nhóm 4: Thông tin khách hàng */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin khách hàng</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {tinField('Tên khách hàng', 'tên_khách_hàng')}
            {tinField('SĐT khách hàng', 'số_điện_thoại_khách_hàng')}
            {tinField('Địa chỉ nhận hàng', 'địa_chỉ_nhận_hàng', true)}
          </div>
        </div>

        {/* Phần B: phân công + trạng thái */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Xử lý</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={s.inputGroup}><label style={s.label}>Người phụ trách</label><input style={s.input} value={form['người_phụ_trách']} onChange={e => set('người_phụ_trách', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Trạng thái xử lý</label>
              <select style={s.input} value={form['trạng_thái_xử_lý']} onChange={e => set('trạng_thái_xử_lý', e.target.value)}>
                {TRANG_THAI_XU_LY.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
              </select>
            </div>
            <div style={s.inputGroup}><label style={s.label}>Ngày hẹn</label><input type="datetime-local" style={s.input} value={form['ngày_hẹn']} onChange={e => set('ngày_hẹn', e.target.value)} /></div>
            <div style={s.inputGroup}>
              <label style={s.label}>Trạng thái Caresoft</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select style={{ ...s.input, flex: 1 }} value={form['trạng_thái_caresoft_muốn_set']} disabled={!perm.edit} onChange={e => set('trạng_thái_caresoft_muốn_set', e.target.value)}>
                  <option value="">(— không đổi —)</option>
                  <option value="new">new</option>
                  <option value="open">open</option>
                  <option value="pending">pending</option>
                  <option value="solved">solved</option>
                  <option value="closed">closed</option>
                </select>
                {perm.io && <button onClick={handleSync} disabled={saving} title="Lưu lựa chọn & đẩy trạng thái về Caresoft" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.7rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: saving ? 0.6 : 1 }}><Send size={14} /> Đồng bộ</button>}
              </div>
            </div>
          </div>
        </div>

        {/* Các bước tùy biến */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ ...s.sectionTitle, margin: 0 }}>Các bước xử lý</h3>
            {perm.edit && <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}><Plus size={14} /> Thêm bước</button>}
          </div>
          {steps.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Chưa có bước nào.</p> : steps.map((st, i) => (
            <React.Fragment key={i}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => toggleStep(i)} disabled={!perm.edit} style={{ background: 'none', border: 'none', cursor: perm.edit ? 'pointer' : 'default', color: st['trạng_thái'] === 'xong' ? '#15803d' : '#cbd5e1' }}>
                {st['trạng_thái'] === 'xong' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              <input style={{ ...s.input, flex: '2 1 140px' }} placeholder="Tên bước" value={st['tên'] || ''} disabled={!perm.edit} onChange={e => updateStep(i, 'tên', e.target.value)} />
              <input style={{ ...s.input, flex: '1 1 100px' }} placeholder="Người làm" value={st['người_làm'] || ''} disabled={!perm.edit} onChange={e => updateStep(i, 'người_làm', e.target.value)} />
              <input type="datetime-local" title="Hạn xử lý (ngày + giờ)" style={{ ...s.input, flex: '0 1 200px', minWidth: 180 }} value={st['hạn_xử_lý'] ? String(st['hạn_xử_lý']).substring(0, 16) : ''} disabled={!perm.edit} onChange={e => updateStep(i, 'hạn_xử_lý', e.target.value)} />
              {perm.edit && <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>}
            </div>
            {st['trạng_thái'] === 'xong' && st['hoàn_thành_lúc'] && (
              <div style={{ fontSize: '0.72rem', color: '#15803d', margin: '-0.2rem 0 0.55rem 1.9rem' }}>
                ✓ Xong lúc {new Date(st['hoàn_thành_lúc']).toLocaleString('vi-VN')}{st['người_hoàn_thành'] ? ` · ${st['người_hoàn_thành']}` : ''}
              </div>
            )}
            </React.Fragment>
          ))}
        </div>

        {/* Linh kiện thay + chi phí */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ ...s.sectionTitle, margin: 0 }}>Linh kiện thay</h3>
            <button onClick={addPart} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}><Plus size={14} /> Thêm linh kiện</button>
          </div>
          {parts.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input style={{ ...s.input, flex: 2 }} placeholder="Tên" value={p['tên']} onChange={e => updatePart(i, 'tên', e.target.value)} />
              <input type="number" style={{ ...s.input, flex: 1 }} placeholder="SL" value={p['số_lượng']} onChange={e => updatePart(i, 'số_lượng', e.target.value)} />
              <input type="number" style={{ ...s.input, flex: 1 }} placeholder="Đơn giá" value={p['đơn_giá']} onChange={e => updatePart(i, 'đơn_giá', e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={p['tính_phí'] !== false} onChange={e => updatePart(i, 'tính_phí', e.target.checked)} /> Tính phí
              </label>
              <button onClick={() => removePart(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>Tổng chi phí: {totalCost.toLocaleString('vi-VN')} đ</div>
        </div>

        {/* Ghi chú + kết quả */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Ghi chú & kết quả</h3>
          {history.length > 0 && (
            <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#f8fafc', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.5rem' }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.3rem' }}>
                  <b>{h['người'] || 'NV'}</b> · <span style={{ color: '#94a3b8' }}>{h['thời_gian'] ? new Date(h['thời_gian']).toLocaleString('vi-VN') : ''}</span>: {h['nội_dung']}
                </div>
              ))}
            </div>
          )}
          <div style={s.inputGroup}><label style={s.label}>Thêm ghi chú</label><input style={s.input} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Ghi chú thao tác lần này..." /></div>
          <div style={{ ...s.inputGroup, marginTop: '0.5rem' }}><label style={s.label}>Kết quả xử lý (đẩy về Caresoft)</label><textarea rows={2} style={{ ...s.input, resize: 'vertical' }} value={form['kết_quả_xử_lý']} onChange={e => set('kết_quả_xử_lý', e.target.value)} /></div>
        </div>

        {/* Nút hành động */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Đóng</button>
          {perm.edit && <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#3b82f6', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Save size={16} /> Lưu</button>}
          {perm.io && <button onClick={handleSync} disabled={saving} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#10b981', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Send size={16} /> Hoàn tất & Đồng bộ Caresoft</button>}
        </div>
      </div>
    </div>
  );
}
