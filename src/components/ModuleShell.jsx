import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, RefreshCw, ChevronLeft } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ModuleShell — Layout chuẩn cho mỗi Phân hệ (Mobile-first)
   ═══════════════════════════════════════════════════════════════ */

export default function ModuleShell({
  title = 'Module',
  icon: Icon,
  color = '#2563eb',
  loading = false,
  onRefresh,
  onBack,
  headerRight,
  tabs,
  children,
}) {
  const navigate = useNavigate();

  return (
    <div style={S.root}>
      {/* ── Sticky Header ── */}
      <header style={S.header}>
        <div style={S.headerRow}>
          {/* Left: Home + Module branding */}
          <div style={S.headerLeft}>
            <button onClick={() => navigate('/home')} style={{...S.homeBtn, padding:'0.35rem', borderRadius: '50%'}} title="Trang chủ ứng dụng">
              <Home size={16} />
            </button>
            {onBack && (
              <button onClick={onBack} style={{...S.homeBtn, padding:'0.35rem 0.5rem', marginLeft:'0.1rem', background:'#e0e7ff', color:'#3730a3'}} title="Quay lại phân hệ chính">
                <ChevronLeft size={16} /> <span className="mobile-hidden">Quay lại</span>
              </button>
            )}
            <div style={S.sep} />
            {Icon && (
              <div style={{ ...S.iconBox, background: `linear-gradient(135deg, ${color}, ${adjust(color, 30)})` }}>
                <Icon size={16} color="#fff" />
              </div>
            )}
            <h1 style={S.title}>{title}</h1>
          </div>

          {/* Right: Actions */}
          <div style={S.headerRight}>
            {headerRight}
            {onRefresh && (
              <button onClick={onRefresh} disabled={loading} style={S.refreshBtn}>
                <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none', color }} />
                <span className="mobile-hidden">{loading ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab bar (if any) */}
        {tabs && <div style={S.tabBar}>{tabs}</div>}
      </header>

      {/* ── Content ── */}
      <main style={S.main}>{children}</main>

      {/* Keyframe injection */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TabButton — Nút tab chuẩn trong ModuleShell
   ═══════════════════════════════════════════════════════════════ */
export function TabButton({ active, onClick, icon: Icon, label, color = '#2563eb' }) {
  return (
    <button onClick={onClick} style={{
      ...S.tabBtn,
      borderBottom: active ? `2.5px solid ${color}` : '2.5px solid transparent',
      color: active ? color : '#64748b',
      fontWeight: active ? 700 : 600,
    }}>
      {Icon && <Icon size={14} />}
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ActionButton — Nút hành động chuẩn trong header
   ═══════════════════════════════════════════════════════════════ */
export function ActionButton({ onClick, icon: Icon, label, color = '#2563eb', variant = 'primary' }) {
  const isPrimary = variant === 'primary';
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '5px',
      padding: '0.35rem 0.65rem', borderRadius: '8px',
      fontSize: '0.78rem', fontWeight: 700,
      border: isPrimary ? 'none' : '1px solid #e2e8f0',
      background: isPrimary ? color : '#fff',
      color: isPrimary ? '#fff' : '#475569',
      cursor: 'pointer', whiteSpace: 'nowrap',
      boxShadow: isPrimary ? `0 2px 8px ${color}40` : 'none',
      transition: 'all 0.15s',
    }}>
      {Icon && <Icon size={14} />} <span className="mobile-hidden">{label}</span>
    </button>
  );
}

// ── Shared Styles (mobile-first) ──
const S = {
  root: {
    minHeight: '100vh',
    background: '#f1f5f9',
    fontFamily: "'Inter','Segoe UI',sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 50,
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #e2e8f0',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.4rem 0.6rem',
    gap: '0.4rem',
    minHeight: '44px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: 0,
  },
  homeBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    border: 'none', background: '#f1f5f9', color: '#334155',
    fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
    padding: '0.35rem 0.55rem', borderRadius: '8px',
    whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'background 0.15s',
  },
  sep: { width: 1, height: 22, background: '#e2e8f0', flexShrink: 0 },
  iconBox: {
    borderRadius: 8, padding: 5, display: 'flex', flexShrink: 0,
  },
  title: {
    margin: 0, fontSize: '0.88rem', fontWeight: 800,
    color: '#0f172a', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
  },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '0.3rem 0.55rem', borderRadius: '8px',
    border: '1px solid #e2e8f0', background: '#fff',
    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
    color: '#475569', whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  tabBar: {
    display: 'flex', alignItems: 'center',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    padding: '0 0.6rem',
    borderTop: '1px solid #f1f5f9',
    gap: 0,
  },
  tabBtn: {
    padding: '0.5rem 0.75rem',
    background: 'none', border: 'none',
    fontSize: '0.78rem',
    display: 'flex', alignItems: 'center', gap: 4,
    flexShrink: 0, whiteSpace: 'nowrap',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  main: {
    flex: 1, display: 'flex', flexDirection: 'column',
  },
};

// Helper
function adjust(hex, amount) {
  try {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 0xFF) + amount));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xFF) + amount));
    const b = Math.min(255, Math.max(0, (n & 0xFF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch { return hex; }
}
