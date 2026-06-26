import React, { useState, useEffect, useMemo } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb } from '../../lib/task_supabase';
import { Search, RefreshCw, ChevronLeft, ChevronRight, PenTool } from 'lucide-react';
import { useTabPerm, useAuth } from '../../lib/AuthContext';
import { TRANG_THAI_XU_LY, TRANG_THAI_DONG_BO, isQualifyingTicket } from '../../lib/warrantyProcessing';
import ProcessingModal from './ProcessingModal';

const statusMeta = (id) => TRANG_THAI_XU_LY.find(s => s.id === id) || { label: id || 'Chưa xử lý', color: '#64748b' };

export default function WarrantyProcessing() {
  const perm = useTabPerm('warranty', 'xuLy');
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState('wproc_search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('wproc_statusFilter', 'all');
  const [showClosed, setShowClosed] = usePersistedState('wproc_showClosed', false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = usePersistedState('wproc_rowsPerPage', 50);
  const [editing, setEditing] = useState(null);

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

  const filtered = useMemo(() => {
    let r = rows;
    // Mặc định chỉ hiện phiếu CÒN MỞ (new/open/pending + Bảo hành/CSKH). Phiếu đã đóng
    // ở Caresoft vẫn giữ bản ghi xử lý nhưng ẩn khỏi tab, trừ khi bật "Hiện cả phiếu đã đóng".
    if (!showClosed) r = r.filter(isQualifyingTicket);
    if (statusFilter !== 'all') r = r.filter(x => (x['trạng_thái_xử_lý'] || 'chưa_xử_lý') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => ['phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'chi_tiết_lỗi', 'người_phụ_trách']
        .some(k => String(x[k] || '').toLowerCase().includes(q)));
    }
    return r;
  }, [rows, statusFilter, search, showClosed]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

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

  if (loading && rows.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><RefreshCw size={36} className="spin" color="#6366f1" /></div>;
  }

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* Bộ lọc */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.6rem', flex: '1 1 240px' }}>
          <Search size={16} color="#94a3b8" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm phiếu, mã ĐH, SP, SĐT, lỗi, người phụ trách..." style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}>
          <option value="all">Tất cả trạng thái xử lý</option>
          {TRANG_THAI_XU_LY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={fetchRows} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569' }}><RefreshCw size={15} /> Làm mới</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showClosed} onChange={e => { setShowClosed(e.target.checked); setPage(1); }} /> Hiện cả phiếu đã đóng
        </label>
      </div>

      {/* Bảng */}
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              {['Phiếu ghi', 'Mã ĐH', 'Mã SP', 'SĐT', 'Chi tiết lỗi', 'Người phụ trách', 'Trạng thái xử lý', 'Đồng bộ'].map(h => (
                <th key={h} style={{ padding: '0.8rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Không có phiếu cần xử lý.</td></tr>
            ) : pageRows.map((r, idx) => {
              const sm = statusMeta(r['trạng_thái_xử_lý'] || 'chưa_xử_lý');
              const dm = TRANG_THAI_DONG_BO[r['trạng_thái_đồng_bộ']] || TRANG_THAI_DONG_BO['nháp'];
              return (
                <tr key={r.id} onClick={() => setEditing(r)} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>{r['phiếu_ghi'] || r['id_phiếu_ghi']}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['mã_đơn_hàng'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['mã_sản_phẩm'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#3b82f6' }}>{r['số_điện_thoại_khách_hàng'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#334155', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['chi_tiết_lỗi'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['người_phụ_trách'] || <span style={{ color: '#cbd5e1' }}>Chưa giao</span>}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}><span style={{ background: sm.color + '22', color: sm.color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{sm.label}</span></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}><span style={{ background: dm.color + '22', color: dm.color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{dm.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tổng <b>{filtered.length}</b> phiếu</span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px' }}>
            <option value={20}>20 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option>
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
