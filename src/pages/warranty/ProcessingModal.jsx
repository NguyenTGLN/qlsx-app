import React, { useState, useMemo } from 'react';
import { X, Save, Send, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { TRANG_THAI_XU_LY, computeTotalCost, WORKFLOW_STEPS_MAU, toggleStepStatus } from '../../lib/warrantyProcessing';

const s = {
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#334155' },
  input: { padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem', width: '100%' },
  section: { borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' },
  sectionTitle: { margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' },
  readonlyVal: { fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 },
  readonlyLbl: { fontSize: '0.75rem', color: '#64748b' },
};

// Field Phần A cho phép sửa (ghi vào bảng xử lý). Field Caresoft-only để chỉ đọc.
const EDITABLE_A = ['mã_đơn_hàng', 'mã_sản_phẩm', 'nhóm_sản_phẩm', 'ngày_lắp_đặt', 'linh_kiện', 'chi_tiết_lỗi'];

export default function ProcessingModal({ row, perm, currentUser, onClose, onSave, onSync }) {
  const [form, setForm] = useState(() => ({
    // Phần A (editable)
    'mã_đơn_hàng': row['mã_đơn_hàng'] || '',
    'mã_sản_phẩm': row['mã_sản_phẩm'] || '',
    'nhóm_sản_phẩm': row['nhóm_sản_phẩm'] || '',
    'ngày_lắp_đặt': row['ngày_lắp_đặt'] || '',
    'linh_kiện': row['linh_kiện'] || '',
    'chi_tiết_lỗi': row['chi_tiết_lỗi'] || '',
    // Phần B
    'người_phụ_trách': row['người_phụ_trách'] || '',
    'trạng_thái_xử_lý': row['trạng_thái_xử_lý'] || 'chưa_xử_lý',
    'ngày_hẹn': row['ngày_hẹn'] ? String(row['ngày_hẹn']).substring(0, 16) : '',
    'kết_quả_xử_lý': row['kết_quả_xử_lý'] || '',
    'trạng_thái_caresoft_muốn_set': row['trạng_thái_caresoft_muốn_set'] || '',
  }));
  const [steps, setSteps] = useState(() =>
    (Array.isArray(row['các_bước']) && row['các_bước'].length)
      ? row['các_bước']
      : WORKFLOW_STEPS_MAU.map(t => ({ 'tên': t, 'trạng_thái': 'chưa_xong', 'người_làm': '', 'ghi_chú': '', 'hạn_xử_lý': '' }))
  );
  const [parts, setParts] = useState(() => Array.isArray(row['linh_kiện_thay']) ? row['linh_kiện_thay'] : []);
  const [history] = useState(() => Array.isArray(row['lịch_sử_thao_tác']) ? row['lịch_sử_thao_tác'] : []);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const totalCost = useMemo(() => computeTotalCost(parts), [parts]);

  // ── Các bước tùy biến ──
  const addStep = () => setSteps(prev => [...prev, { 'tên': '', 'trạng_thái': 'chưa_xong', 'người_làm': '', 'ghi_chú': '', 'hạn_xử_lý': '' }]);
  const updateStep = (i, k, v) => setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, [k]: v } : st));
  const toggleStep = (i) => setSteps(prev => prev.map((st, idx) => idx === i ? toggleStepStatus(st, (currentUser && (currentUser.name || currentUser.id)) || '') : st));
  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  // ── Linh kiện thay ──
  const addPart = () => setParts(prev => [...prev, { 'tên': '', 'số_lượng': 1, 'đơn_giá': 0, 'tính_phí': true }]);
  const updatePart = (i, k, v) => setParts(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePart = (i) => setParts(prev => prev.filter((_, idx) => idx !== i));

  // Gom dữ liệu để lưu. Note mới (nếu có) append vào lịch sử.
  const buildPayload = () => {
    const editedA = {};
    EDITABLE_A.forEach(k => { editedA[k] = form[k]; });
    const operator = (currentUser && (currentUser.name || currentUser.id)) || '';
    const nextHistory = newNote.trim()
      ? [...history, { 'thời_gian': new Date().toISOString(), 'người': operator, 'nội_dung': newNote.trim() }]
      : history;
    return {
      ...editedA,
      'người_phụ_trách': form['người_phụ_trách'],
      'trạng_thái_xử_lý': form['trạng_thái_xử_lý'],
      'ngày_hẹn': form['ngày_hẹn'] || null,
      'kết_quả_xử_lý': form['kết_quả_xử_lý'],
      'trạng_thái_caresoft_muốn_set': form['trạng_thái_caresoft_muốn_set'] || null,
      'các_bước': steps,
      'linh_kiện_thay': parts,
      'tổng_chi_phí': totalCost,
      'lịch_sử_thao_tác': nextHistory,
      'người_cập_nhật': operator,
      'người_tạo': row['người_tạo'] || operator,
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>Xử lý phiếu {row['phiếu_ghi'] || row['id_phiếu_ghi']}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
        </div>

        {/* Thông tin Caresoft-only (chỉ đọc) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '10px' }}>
          <div><div style={s.readonlyLbl}>SĐT khách</div><div style={s.readonlyVal}>{row['số_điện_thoại_khách_hàng'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Ngày tạo</div><div style={s.readonlyVal}>{row['thời_điểm_tạo'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Trạng thái phiếu (Caresoft)</div><div style={s.readonlyVal}>{row['trạng_thái_phiếu_ghi'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Phân loại</div><div style={s.readonlyVal}>{row['phân_loại_công_việc'] || '-'}</div></div>
        </div>

        {/* Phần A: thông tin phiếu (sửa được) */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin phiếu</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={s.inputGroup}><label style={s.label}>Mã đơn hàng</label><input style={s.input} value={form['mã_đơn_hàng']} onChange={e => set('mã_đơn_hàng', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Mã sản phẩm</label><input style={s.input} value={form['mã_sản_phẩm']} onChange={e => set('mã_sản_phẩm', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Nhóm sản phẩm</label><input style={s.input} value={form['nhóm_sản_phẩm']} onChange={e => set('nhóm_sản_phẩm', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Ngày lắp đặt</label><input type="date" style={s.input} value={form['ngày_lắp_đặt'] ? String(form['ngày_lắp_đặt']).substring(0, 10) : ''} onChange={e => set('ngày_lắp_đặt', e.target.value)} /></div>
            <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}><label style={s.label}>Linh kiện lỗi</label><input style={s.input} value={form['linh_kiện']} onChange={e => set('linh_kiện', e.target.value)} /></div>
            <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}><label style={s.label}>Chi tiết lỗi</label><textarea rows={2} style={{ ...s.input, resize: 'vertical' }} value={form['chi_tiết_lỗi']} onChange={e => set('chi_tiết_lỗi', e.target.value)} /></div>
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
            <div style={s.inputGroup}><label style={s.label}>Trạng thái Caresoft muốn set</label><input style={s.input} placeholder="vd: solved" value={form['trạng_thái_caresoft_muốn_set']} onChange={e => set('trạng_thái_caresoft_muốn_set', e.target.value)} /></div>
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
