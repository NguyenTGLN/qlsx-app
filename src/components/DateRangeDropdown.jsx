import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown } from 'lucide-react';

/**
 * DateRangeDropdown – Reusable date filter component.
 *
 * Props:
 *  - label   : string  (e.g. "Ngày xuất")
 *  - value   : { preset: string, from: string, to: string }
 *  - onChange : (newValue) => void
 *
 * value.from / value.to are YYYY-MM-DD strings (local timezone).
 */

const PRESETS = [
  'Tất cả', 'Hôm nay', 'Hôm qua',
  'Tuần này', 'Tuần trước', 'Tháng này',
  'Tháng trước', 'Năm nay', 'Năm trước'
];

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function calcPresetRange(p) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (p) {
    case 'Hôm nay': return [fmt(now), fmt(now)];
    case 'Hôm qua': { const yd = new Date(y,m,d-1); return [fmt(yd), fmt(yd)]; }
    case 'Tuần này': {
      const dow = now.getDay() || 7; // Monday=1 .. Sunday=7
      const mon = new Date(y,m,d - dow + 1);
      const sun = new Date(y,m,d - dow + 7);
      return [fmt(mon), fmt(sun)];
    }
    case 'Tuần trước': {
      const dow = now.getDay() || 7;
      const mon = new Date(y,m,d - dow - 6);
      const sun = new Date(y,m,d - dow);
      return [fmt(mon), fmt(sun)];
    }
    case 'Tháng này': return [fmt(new Date(y,m,1)), fmt(new Date(y,m+1,0))];
    case 'Tháng trước': return [fmt(new Date(y,m-1,1)), fmt(new Date(y,m,0))];
    case 'Năm nay': return [fmt(new Date(y,0,1)), fmt(new Date(y,11,31))];
    case 'Năm trước': return [fmt(new Date(y-1,0,1)), fmt(new Date(y-1,11,31))];
    default: return ['', ''];
  }
}

export default function DateRangeDropdown({ label = 'Ngày', value, onChange, alignRight = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);  // overlay modal (render qua portal, NẰM NGOÀI wrapRef)

  // Click outside → close. Modal được portal ra body nên phải loại trừ cả panelRef,
  // nếu không mousedown trên chip sẽ bị coi là "click ngoài" và đóng modal trước khi onClick chạy.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handlePreset = (p) => {
    if (p === 'Tất cả') {
      onChange({ preset: 'Tất cả', from: '', to: '' });
    } else {
      const [from, to] = calcPresetRange(p);
      onChange({ preset: p, from, to });
    }
    setOpen(false);
  };

  const handleCustomFrom = (v) => onChange({ preset: 'Tùy chỉnh', from: v, to: value.to });
  const handleCustomTo   = (v) => onChange({ preset: 'Tùy chỉnh', from: value.from, to: v });

  const displayLabel = value.preset || 'Tất cả';

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger Button */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          border: '1px solid #cbd5e1',
          padding: '0.25rem 0.5rem',
          borderRadius: 8,
          cursor: 'pointer',
          background: open ? '#f0f9ff' : '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.72rem',
          userSelect: 'none',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={14} color="#64748b" />
        <span style={{ color: '#475569', fontWeight: 600 }}>{label}:</span>
        <span style={{ color: '#1e40af', fontWeight: 700 }}>{displayLabel}</span>
        <ChevronDown size={13} color="#64748b" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {/* Dropdown Panel - Fixed Modal cho Mobile/Desktop để chống tràn.
          Render qua Portal ra document.body để KHÔNG bị kẹt trong containing-block
          của header (header có backdrop-filter → vô hiệu hoá position:fixed). */}
      {open && createPortal((
        <div ref={panelRef} style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          {/* Backdrop */}
          <div 
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }} 
            onClick={() => setOpen(false)} 
          />
          
          {/* Modal Content */}
          <div style={{
            position: 'relative',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: 14,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            width: '100%',
            maxWidth: 340,
            padding: '1.25rem',
            animation: 'fadeIn 0.15s ease-out',
            zIndex: 1
          }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#0f172a', fontWeight: 800 }}>Chọn khoảng thời gian</h4>

            {/* Preset Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.25rem' }}>
              {PRESETS.map(p => {
                const active = value.preset === p;
                return (
                  <button
                    key={p}
                    onClick={() => handlePreset(p)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 20,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: active ? 'none' : '1px solid #e2e8f0',
                      background: active ? '#3b82f6' : '#f8fafc',
                      color: active ? '#fff' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Range */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem', color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                ⏱ Tùy chỉnh (Từ - Đến)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={value.from}
                    onChange={e => handleCustomFrom(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      outline: 'none',
                      background: '#f8fafc',
                      color: '#334155',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ color: '#94a3b8', fontWeight: 600 }}>→</div>
                <div style={{ flex: 1 }}>
                  <input
                    type="date"
                    value={value.to}
                    onChange={e => handleCustomTo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      outline: 'none',
                      background: '#f8fafc',
                      color: '#334155',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button 
                onClick={() => setOpen(false)}
                style={{
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

/**
 * Helper: Build Supabase .gte / .lte from DateRangeDropdown value.
 * Usage:
 *   let q = db.from('table').select('*');
 *   q = applyDateFilter(q, dateRange, 'ngay_xuat');
 */
export function applyDateFilter(query, dateRange, column) {
  if (!dateRange || dateRange.preset === 'Tất cả') return query;
  if (dateRange.from) query = query.gte(column, dateRange.from);
  if (dateRange.to)   query = query.lte(column, dateRange.to);
  return query;
}
