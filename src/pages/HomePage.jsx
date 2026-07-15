import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, canSeeModule } from '../lib/AuthContext';
import {
  BarChart2, ClipboardList, Package, ShieldAlert,
  HeadphonesIcon, Warehouse, ShieldCheck, MonitorPlay,
  LogOut, ArrowRight, Factory
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
    permKey: null, // Ai cũng truy cập được
  },
];

// Lời chào theo giờ trong ngày
function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

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

  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric',
  });

  return (
    <div style={styles.container}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <div style={styles.logo}>
              <Factory size={20} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h1 style={styles.appName}>QLSX</h1>
              <p style={styles.appVersion}>Quản Lý Sản Xuất · v3.0</p>
            </div>
          </div>

          <div style={styles.userSection}>
            <div style={styles.userInfo}>
              <div style={styles.avatar}>
                {(user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={styles.userName} className="mobile-hidden">
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  {user?.name || 'User'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                  {isAdmin ? 'Quản trị viên' : 'Nhân viên'} · {user?.id}
                </span>
              </div>
            </div>
            <button onClick={handleLogout} style={styles.logoutBtn} title="Đăng xuất">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Module Grid ── */}
      <main style={styles.main}>
        <div style={styles.mainInner}>
          <div style={styles.greetBlock}>
            <h2 style={styles.greetTitle}>{greeting()}, {user?.name || 'bạn'}</h2>
            <p style={styles.greetSub}>{today.charAt(0).toUpperCase() + today.slice(1)}</p>
          </div>

          <div style={styles.grid}>
            {accessibleModules.map(m => (
              <button
                key={m.id}
                onClick={() => navigate(m.path)}
                className="module-card"
                style={{ ...styles.card, '--card-accent': m.color }}
              >
                <div style={{ ...styles.cardIcon, background: `${m.color}14`, color: m.color }}>
                  <m.icon size={22} strokeWidth={2} />
                </div>
                <div style={styles.cardBody}>
                  <h3 style={styles.cardTitle}>{m.label}</h3>
                  <p style={styles.cardSubtitle}>{m.subtitle}</p>
                </div>
                <ArrowRight size={16} className="module-card-arrow" style={styles.cardArrow} />
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <p>© 2026 QLSX · Phiên bản 3.0</p>
      </footer>

      {/* Hover bằng CSS (mượt hơn JS, tự tắt khi prefers-reduced-motion) */}
      <style>{`
        .module-card { text-align: left; }
        .module-card .module-card-arrow { opacity: 0; transform: translateX(-4px); transition: all 0.18s ease; }
        .module-card:hover {
          border-color: var(--card-accent) !important;
          box-shadow: 0 8px 24px -8px rgba(15,23,42,0.16);
          transform: translateY(-2px);
        }
        .module-card:hover .module-card-arrow { opacity: 1; transform: translateX(0); color: var(--card-accent); }
        .module-card:active { transform: translateY(0) scale(0.99); }
        @media (prefers-reduced-motion: reduce) {
          .module-card, .module-card .module-card-arrow { transition: none; }
          .module-card:hover { transform: none; }
        }
      `}</style>
    </div>
  );
};

// ── Styles ──
const styles = {
  container: {
    minHeight: '100dvh',
    background: 'var(--bg-primary)',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderBottom: '1px solid var(--border-color)',
    position: 'sticky', top: 0, zIndex: 50,
  },
  headerInner: {
    maxWidth: 1080, margin: '0 auto', padding: '0.65rem 1.25rem',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '0.7rem',
  },
  logo: {
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--accent-gradient)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 3px 10px rgba(37,99,235,0.28)',
  },
  appName: {
    margin: 0, fontSize: '1.1rem', fontWeight: 800,
    color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2,
  },
  appVersion: {
    margin: 0, fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500,
  },
  userSection: {
    display: 'flex', alignItems: 'center', gap: '0.6rem',
  },
  userInfo: {
    display: 'flex', alignItems: 'center', gap: '0.55rem',
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'var(--accent-gradient)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '0.85rem',
  },
  userName: {
    display: 'flex', flexDirection: 'column', lineHeight: 1.25,
  },
  logoutBtn: {
    width: 34, height: 34, borderRadius: 9,
    background: '#fff', border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  main: {
    flex: 1, display: 'flex', justifyContent: 'center',
    padding: '2.25rem 1.25rem 1.5rem',
  },
  mainInner: {
    width: '100%', maxWidth: 1080,
  },
  greetBlock: {
    marginBottom: '1.5rem',
  },
  greetTitle: {
    margin: 0, fontSize: 'clamp(1.3rem, 2.4vw, 1.7rem)', fontWeight: 800,
    letterSpacing: '-0.02em', color: 'var(--text-primary)',
  },
  greetSub: {
    margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--text-tertiary)', fontWeight: 500,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
    gap: '0.8rem',
  },
  card: {
    background: 'var(--bg-card)', borderRadius: 14,
    border: '1px solid var(--border-color)',
    padding: '1.1rem 1.15rem',
    display: 'flex', alignItems: 'center',
    gap: '0.85rem', cursor: 'pointer',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
    boxShadow: 'var(--shadow-sm)',
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 11, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardBody: {
    flex: 1, minWidth: 0,
  },
  cardTitle: {
    margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  cardSubtitle: {
    margin: '0.1rem 0 0', fontSize: '0.74rem', color: 'var(--text-tertiary)', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  cardArrow: {
    flexShrink: 0, color: 'var(--text-tertiary)',
  },
  footer: {
    textAlign: 'center', padding: '1rem',
    color: 'var(--text-tertiary)', fontSize: '0.72rem', fontWeight: 500,
  },
};

export default HomePage;
