import React, { useState } from 'react';
import { Eye } from 'lucide-react';

/**
 * shortDate — Convert YYYY-MM-DD to dd/mm/yy
 */
export const shortDate = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  return d;
};

/**
 * shortDateTime — Convert ISO datetime to dd/mm/yy HH:mm
 */
export const shortDateTime = (d) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = String(dt.getFullYear()).slice(-2);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  } catch { return d; }
};

/**
 * PageSizeSelect — ô chọn số dòng hiển thị mỗi trang.
 * Đặt trên THANH CÔNG CỤ TRÊN CÙNG (luôn thấy) — trước đây ô này bị chôn ở thanh
 * phân trang dưới đáy trang cao, người dùng phải cuộn hết mới thấy và bị thanh nút
 * cố định che khuất. Giá trị đổi → các tab tự reset về trang 1 qua effect có sẵn.
 */
export const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000, 5000, 10000];
export function PageSizeSelect({ value, onChange, options = PAGE_SIZE_OPTIONS, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      title="Số dòng hiển thị mỗi trang"
      style={{ padding:'0.35rem 0.4rem', border:'1px solid #cbd5e1', borderRadius:7, fontSize:'0.75rem', fontWeight:600, outline:'none', background:'#fff', color:'#334155', cursor:'pointer', flexShrink:0, ...style }}
    >
      {options.map(n => <option key={n} value={n}>{n >= 1000 ? `${n / 1000}K` : n}/trang</option>)}
    </select>
  );
}

/**
 * ColumnToggleModal — Fixed Modal for toggling table columns (mobile-friendly)
 *
 * Props:
 *  - columns: string[]       — list of column keys
 *  - labels:  Record<string, string>  — human-readable labels
 *  - hiddenCols: Set         — currently hidden columns
 *  - setHiddenCols: fn       — state setter
 */
export function ColumnToggleModal({ columns, labels = {}, hiddenCols, setHiddenCols }) {
  const [open, setOpen] = useState(false);
  const toggle = (col) => setHiddenCols(h => { const n = new Set(h); n.has(col) ? n.delete(col) : n.add(col); return n; });

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '0.4rem 0.5rem', borderRadius: 7,
          border: '1px solid #e2e8f0', background: '#fff',
          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: '#475569'
        }}
        title="Ẩn/Hiện cột"
      >
        <Eye size={14} />
        {hiddenCols.size > 0 && (
          <span style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 99, padding: '0 4px', fontSize: '0.65rem', fontWeight: 800 }}>
            -{hiddenCols.size}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'relative', background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 14, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', zIndex: 1,
            width: '100%', maxWidth: 320, maxHeight: '80vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.15s ease-out'
          }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Tùy chỉnh cột hiển thị</span>
              <button onClick={() => setHiddenCols(new Set())} style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Hiện tất cả</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0.5rem 0' }}>
              {columns.map(col => (
                <label key={col} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 1rem',
                  cursor: 'pointer', fontSize: '0.85rem',
                  color: hiddenCols.has(col) ? '#94a3b8' : '#334155', transition: 'background 0.15s'
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <input type="checkbox" checked={!hiddenCols.has(col)} onChange={() => toggle(col)} style={{ width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer' }} />
                  <span style={{ fontWeight: 600 }}>{labels[col] || col}</span>
                </label>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '1rem', textAlign: 'right', background: '#f8fafc' }}>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '0.6rem 1.5rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Xong</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
