import React from 'react';
import { Printer, Download, X } from 'lucide-react';
import { mapRowToProposal } from '../../lib/warrantyProposalMap';

// Modal chọn cách xuất phiếu đề xuất BH cho 1 hoặc nhiều phiếu đã chọn.
// className "no-print" ở toàn bộ overlay để ẩn khi in (vùng in thật là #wproc-print ở host).
export default function WarrantyProposalModal({ rows, currentUser, now, busy, onPrint, onExcel, onClose }) {
  if (!rows || rows.length === 0) return null;
  const list = rows.map((r) => mapRowToProposal(r, currentUser, now));
  const btn = (bg, disabled) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1rem', border: 'none',
    borderRadius: 8, background: bg, color: '#fff', fontWeight: 700, fontSize: '0.9rem',
    cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1,
  });
  return (
    <div className="no-print" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-card"
        style={{ background: '#fff', borderRadius: 14, width: 'min(560px, 96vw)', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', padding: '1.1rem 1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Tạo phiếu đề xuất bảo hành ({list.length})</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>Nội dung lấy từ dữ liệu phiếu tại thời điểm này. Các ô kiểm tra/thu hồi để trống cho ký tay.</div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          {list.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '0.5rem 0.7rem', fontSize: '0.82rem', borderBottom: i < list.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 ? '#f8fafc' : '#fff' }}>
              <span style={{ fontWeight: 700, color: '#1e293b', minWidth: 90 }}>{p.maPhieu || '—'}</span>
              <span style={{ color: '#475569', flex: 1 }}>{p.khachHang || '—'} · {p.maSP || '—'}{p.linhKienList.length ? ` · ${p.linhKienList.length} LK` : ''}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={onPrint} style={btn('#4f46e5', busy)}><Printer size={16} /> In / Tạo PDF</button>
          <button disabled={busy} onClick={onExcel} style={btn('#10b981', busy)}><Download size={16} /> {busy ? 'Đang tạo...' : 'Tải Excel'}</button>
          <button disabled={busy} onClick={onClose} style={{ padding: '0.6rem 1rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
