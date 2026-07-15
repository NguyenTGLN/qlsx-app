import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, RefreshCw, ChevronLeft } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   ModuleShell — Layout chuẩn cho mỗi Phân hệ (Mobile-first)
   Hover/focus dùng CSS class (inject 1 lần) thay vì JS để mượt
   và tự tôn trọng prefers-reduced-motion.
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
            <button onClick={() => navigate('/home')} className="ms-ghost-btn" style={{ ...S.homeBtn, padding: '0.35rem', borderRadius: 9 }} title="Trang chủ ứng dụng">
              <Home size={15} />
            </button>
            {onBack && (
              <button onClick={onBack} className="ms-ghost-btn" style={{ ...S.homeBtn, padding: '0.35rem 0.5rem' }} title="Quay lại phân hệ chính">
                <ChevronLeft size={15} /> <span className="mobile-hidden">Quay lại</span>
              </button>
            )}
            <div style={S.sep} />
            {Icon && (
              <div style={{ ...S.iconBox, background: color, boxShadow: `0 2px 8px ${color}45` }}>
                <Icon size={15} color="#fff" strokeWidth={2.2} />
              </div>
            )}
            <h1 style={S.title}>{title}</h1>
          </div>

          {/* Right: Actions */}
          <div style={S.headerRight}>
            {headerRight}
            {onRefresh && (
              <button onClick={onRefresh} disabled={loading} className="ms-ghost-btn" style={S.refreshBtn}>
                <RefreshCw size={13} className={loading ? 'spin' : ''} style={{ color }} />
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

      {/* Hover/focus states dùng chung cho shell (inject 1 lần mỗi shell) */}
      <style>{`
        .ms-ghost-btn { transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
        .ms-ghost-btn:hover:not(:disabled) { background: #eef2f7 !important; color: #0f172a !important; }
        .ms-ghost-btn:active:not(:disabled) { transform: translateY(1px); }
        .ms-tab { transition: color 0.15s ease, background 0.15s ease; }
        .ms-tab:hover { background: #f1f5f9; }
        @media (prefers-reduced-motion: reduce) {
          .ms-ghost-btn, .ms-tab { transition: none; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TabButton — Nút tab chuẩn trong ModuleShell
   ═══════════════════════════════════════════════════════════════ */
export function TabButton({ active, onClick, icon: Icon, label, color = '#2563eb' }) {
  return (
    <button onClick={onClick} className="ms-tab" style={{
      ...S.tabBtn,
      boxShadow: active ? `inset 0 -2px 0 ${color}` : 'none',
      color: active ? color : '#64748b',
      fontWeight: active ? 700 : 500,
      background: active ? `${color}0d` : 'none',
    }}>
      {Icon && <Icon size={14} strokeWidth={active ? 2.4 : 2} />}
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
    <button onClick={onClick} className={isPrimary ? '' : 'ms-ghost-btn'} style={{
      display: 'flex', alignItems: 'center', gap: '5px',
      padding: '0.38rem 0.7rem', borderRadius: 9,
      fontSize: '0.78rem', fontWeight: 600,
      border: isPrimary ? 'none' : '1px solid #e2e8f0',
      background: isPrimary ? color : '#fff',
      color: isPrimary ? '#fff' : '#475569',
      cursor: 'pointer', whiteSpace: 'nowrap',
      boxShadow: isPrimary ? `0 2px 8px ${color}40, inset 0 1px 0 rgba(255,255,255,0.15)` : 'none',
      transition: 'all 0.15s',
    }}>
      {Icon && <Icon size={14} />} <span className="mobile-hidden">{label}</span>
    </button>
  );
}

// ── Shared Styles (mobile-first) ──
const S = {
  root: {
    minHeight: '100dvh',
    background: 'var(--bg-primary, #f6f8fb)',
    fontFamily: 'var(--font-sans)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 50,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(14px) saturate(160%)',
    WebkitBackdropFilter: 'blur(14px) saturate(160%)',
    borderBottom: '1px solid #e2e8f0',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.4rem 0.65rem',
    gap: '0.4rem',
    minHeight: '46px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: 0,
  },
  homeBtn: {
    display: 'flex', alignItems: 'center', gap: '4px',
    border: '1px solid transparent', background: '#f1f5f9', color: '#475569',
    fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
    padding: '0.35rem 0.55rem', borderRadius: 9,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  sep: { width: 1, height: 20, background: '#e2e8f0', flexShrink: 0 },
  iconBox: {
    borderRadius: 8, padding: 6, display: 'flex', flexShrink: 0,
  },
  title: {
    margin: 0, fontSize: '0.9rem', fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#0f172a', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0,
  },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '0.32rem 0.6rem', borderRadius: 9,
    border: '1px solid #e2e8f0', background: '#fff',
    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
    color: '#475569', whiteSpace: 'nowrap',
  },
  tabBar: {
    display: 'flex', alignItems: 'center',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    padding: '0.25rem 0.65rem 0',
    gap: 2,
  },
  tabBtn: {
    padding: '0.5rem 0.7rem',
    background: 'none', border: 'none',
    borderRadius: '8px 8px 0 0',
    fontSize: '0.78rem',
    display: 'flex', alignItems: 'center', gap: 5,
    flexShrink: 0, whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  main: {
    flex: 1, display: 'flex', flexDirection: 'column',
  },
};
