import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, canSeeModule } from '../lib/AuthContext';
import {
  BarChart2, ClipboardList, Package, ShieldAlert,
  HeadphonesIcon, Warehouse, ShieldCheck, MonitorPlay,
  LogOut, Settings
} from 'lucide-react';

// ── Cấu hình 8 Phân hệ ──
// Thứ tự hiển thị theo ưu tiên vận hành: Kho → Sản xuất → Chất lượng → Bảo hành → CSKH → Công việc → (Tổng quan, TV)
const MODULES = [
  {
    id: 'warehouse',
    label: 'Kho Hàng',
    subtitle: 'Quản lý Tồn kho',
    icon: Warehouse,
    path: '/kho',
    color: '#0d9488',
    gradient: 'linear-gradient(135deg, #0d9488, #14b8a6)',
    permKey: 'access_warehouse',
    regModule: 'kho',
  },
  {
    id: 'production',
    label: 'Sản Xuất',
    subtitle: 'Nhập liệu công nhân',
    icon: Package,
    path: '/worker',
    color: '#0891b2',
    gradient: 'linear-gradient(135deg, #0891b2, #06b6d4)',
    permKey: 'access_production',
    regModule: 'production',
  },
  {
    id: 'quality',
    label: 'CL Sản Phẩm',
    subtitle: 'Ghi nhận & Đối sách',
    icon: ShieldCheck,
    path: '/quality',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a, #22c55e)',
    permKey: 'access_quality',
    regModule: 'quality',
  },
  {
    id: 'warranty',
    label: 'Bảo Hành',
    subtitle: 'Analytics & Dữ liệu',
    icon: ShieldAlert,
    path: '/bao-hanh',
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444, #f87171)',
    permKey: 'access_warranty',
    regModule: 'warranty',
  },
  {
    id: 'cskh',
    label: 'CSKH',
    subtitle: 'Chăm sóc khách hàng',
    icon: HeadphonesIcon,
    path: '/cskh',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    permKey: 'access_cskh',
    regModule: 'cskh',
  },
  {
    id: 'tasks',
    label: 'Công Việc',
    subtitle: 'Giao việc & Theo dõi',
    icon: ClipboardList,
    path: '/tasks',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1, #818cf8)',
    permKey: 'access_tasks',
    regModule: 'tasks',
  },
  {
    id: 'overview',
    label: 'Tổng Quan',
    subtitle: 'Sản Xuất & Báo Cáo',
    icon: BarChart2,
    path: '/admin',
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #2563eb, #3b82f6)',
    permKey: 'access_overview',
    regModule: 'overview',
  },
  {
    id: 'tv',
    label: 'Màn Hình TV',
    subtitle: 'Theo dõi Tiến độ',
    icon: MonitorPlay,
    path: '/tv',
    color: '#475569',
    gradient: 'linear-gradient(135deg, #334155, #475569)',
    permKey: null, // Ai cũng truy cập được
  },
];

const HomePage = () => {
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Lọc phân hệ theo quyền truy cập (tab-level: hiện nếu user có 'view' ≥ 1 tab của phân hệ)
  const accessibleModules = MODULES.filter(m => {
    if (!m.regModule) return true; // TV (không thuộc registry) luôn hiện
    return canSeeModule(user, m.regModule);
  });

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <div style={styles.logo}>
              <BarChart2 size={24} color="#fff" />
            </div>
            <div>
              <h1 style={styles.appName}>QLSX</h1>
              <p style={styles.appVersion}>Quản Lý Sản Xuất — v3.0</p>
            </div>
          </div>

          <div style={styles.userSection}>
            <div style={styles.userInfo}>
              <div style={styles.avatar}>
                {(user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={styles.userName}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                  {user?.name || 'User'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {isAdmin ? '👑 Admin' : '👤 Nhân viên'} • {user?.id}
                </span>
              </div>
            </div>
            <button onClick={handleLogout} style={styles.logoutBtn} title="Đăng xuất">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Module Grid ── */}
      <main style={styles.main}>
        <div style={styles.grid}>
          {accessibleModules.map(m => (
            <button
              key={m.id}
              onClick={() => navigate(m.path)}
              style={styles.card}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.boxShadow = `0 20px 40px -12px ${m.color}40`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.07)';
              }}
            >
              <div style={{ ...styles.cardIcon, background: m.gradient }}>
                <m.icon size={28} color="#fff" />
              </div>
              <h3 style={styles.cardTitle}>{m.label}</h3>
              <p style={styles.cardSubtitle}>{m.subtitle}</p>
            </button>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <p>© 2026 QLSX App • Phiên bản 3.0</p>
      </footer>
    </div>
  );
};

// ── Styles ──
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky', top: 0, zIndex: 50,
  },
  headerInner: {
    maxWidth: 1200, margin: '0 auto', padding: '0.75rem 1.5rem',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
  },
  logo: {
    width: 44, height: 44, borderRadius: 12,
    background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
  },
  appName: {
    margin: 0, fontSize: '1.25rem', fontWeight: 800,
    color: '#0f172a', letterSpacing: '-0.02em',
  },
  appVersion: {
    margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 500,
  },
  userSection: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
  },
  userInfo: {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
  },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: '0.9rem',
  },
  userName: {
    display: 'flex', flexDirection: 'column',
  },
  logoutBtn: {
    width: 36, height: 36, borderRadius: '50%',
    background: '#fef2f2', border: '1px solid #fecaca',
    color: '#ef4444', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s',
  },
  main: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '0.75rem',
    maxWidth: 800,
    width: '100%',
  },
  card: {
    background: '#fff', borderRadius: 16,
    border: '1px solid #e2e8f0',
    padding: '1.25rem 0.5rem',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '0.5rem', cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
    textDecoration: 'none',
  },
  cardIcon: {
    width: 46, height: 46, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  cardTitle: {
    margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a',
    textAlign: 'center',
  },
  cardSubtitle: {
    margin: 0, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center', padding: '1rem',
    color: '#94a3b8', fontSize: '0.75rem',
  },
};

export default HomePage;
