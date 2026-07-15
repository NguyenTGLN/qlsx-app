import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogIn, Eye, EyeOff, Factory } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const Login = () => {
  const [workerCode, setWorkerCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorStr, setErrorStr] = useState('');
  const navigate = useNavigate();
  const { user, loading: authLoading, login } = useAuth();

  // Nếu đã đăng nhập → chuyển về /home
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/home', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorStr('');
    try {
      await login(workerCode, password, rememberMe);
      navigate('/home', { replace: true });
    } catch (err) {
      setErrorStr(err.message || 'Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Đang auto-login
  if (authLoading) {
    return (
      <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{
            width: 44, height: 44,
            border: '3px solid #e2e8f0', borderTopColor: 'var(--primary-color)',
            borderRadius: '50%', margin: '0 auto 1rem',
          }} className="spin" />
          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang đăng nhập tự động...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page} className="login-split">
      {/* ── Panel thương hiệu (trái, ẩn trên mobile) ── */}
      <aside style={S.brandPanel} className="login-brand">
        <div style={S.brandTop}>
          <div style={S.brandMark}>
            <Factory size={22} color="#fff" strokeWidth={2} />
          </div>
          <span style={S.brandName}>QLSX</span>
        </div>

        <div>
          <h1 style={S.brandHeadline}>
            Quản lý sản xuất,<br />kho và chất lượng
          </h1>
          <p style={S.brandSub}>
            Một hệ thống cho toàn bộ vận hành nhà máy: lệnh sản xuất,
            tồn kho, bảo hành và chăm sóc khách hàng.
          </p>
        </div>

        <p style={S.brandFoot}>© 2026 QLSX · Phiên bản 3.0</p>
      </aside>

      {/* ── Panel form (phải) ── */}
      <main style={S.formPanel}>
        <div style={S.formBox}>
          {/* Logo chỉ hiện trên mobile (panel trái bị ẩn) */}
          <div style={S.mobileBrand} className="login-mobile-brand">
            <div style={{ ...S.brandMark, background: 'var(--primary-color)' }}>
              <Factory size={20} color="#fff" strokeWidth={2} />
            </div>
            <span style={{ ...S.brandName, color: 'var(--text-primary)' }}>QLSX</span>
          </div>

          <h2 style={S.formTitle}>Đăng nhập</h2>
          <p style={S.formSub}>Dùng mã nhân viên được cấp để vào hệ thống.</p>

          <form onSubmit={handleLogin} style={S.form}>
            {errorStr && (
              <div role="alert" style={S.errorBox}>
                {errorStr}
              </div>
            )}

            <div style={S.inputGroup}>
              <label className="form-label" htmlFor="worker-code">Mã nhân viên</label>
              <div style={S.inputWrapper}>
                <User size={17} style={S.inputIcon} />
                <input
                  id="worker-code"
                  type="text"
                  className="form-control"
                  style={S.input}
                  placeholder="Ví dụ: NV001"
                  value={workerCode}
                  onChange={(e) => setWorkerCode(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div style={S.inputGroup}>
              <label className="form-label" htmlFor="worker-pass">Mật khẩu / Mã PIN</label>
              <div style={S.inputWrapper}>
                <Lock size={17} style={S.inputIcon} />
                <input
                  id="worker-pass"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  style={{ ...S.input, paddingRight: '2.75rem' }}
                  placeholder="Nhập mã bí mật"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={S.eyeBtn}
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Checkbox ghi nhớ */}
            <label style={S.rememberRow}>
              <span
                onClick={() => setRememberMe(r => !r)}
                role="checkbox"
                aria-checked={rememberMe}
                style={{
                  ...S.checkbox,
                  border: rememberMe ? '1px solid var(--primary-color)' : '1px solid #cbd5e1',
                  background: rememberMe ? 'var(--primary-color)' : '#fff',
                }}
              >
                {rememberMe && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              Ghi nhớ đăng nhập
            </label>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.25rem', padding: '0.85rem' }}
              disabled={loading}
            >
              {loading ? 'Đang kiểm tra...' : (
                <>Đăng nhập <LogIn size={18} /></>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Responsive: mobile ẩn panel trái, hiện logo trong form */}
      <style>{`
        .login-split { display: grid; grid-template-columns: minmax(380px, 44%) 1fr; }
        .login-mobile-brand { display: none; }
        @media (max-width: 860px) {
          .login-split { grid-template-columns: 1fr; }
          .login-brand { display: none !important; }
          .login-mobile-brand { display: flex !important; }
        }
      `}</style>
    </div>
  );
};

const S = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    background: 'var(--bg-primary)',
  },
  /* Panel trái: nền slate đậm + lưới kỹ thuật mờ (chất công nghiệp, không blob AI) */
  brandPanel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '2.5rem 3rem',
    background:
      'linear-gradient(160deg, rgba(37,99,235,0.14), rgba(37,99,235,0) 55%),' +
      'repeating-linear-gradient(0deg, rgba(148,163,184,0.07) 0 1px, transparent 1px 56px),' +
      'repeating-linear-gradient(90deg, rgba(148,163,184,0.07) 0 1px, transparent 1px 56px),' +
      '#0f172a',
    color: '#e2e8f0',
  },
  brandTop: {
    display: 'flex', alignItems: 'center', gap: '0.65rem',
  },
  brandMark: {
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--accent-gradient)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
    flexShrink: 0,
  },
  brandName: {
    fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.02em', color: '#f8fafc',
  },
  brandHeadline: {
    fontSize: 'clamp(1.6rem, 2.6vw, 2.2rem)',
    fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em',
    color: '#f8fafc', marginBottom: '1rem',
  },
  brandSub: {
    fontSize: '0.95rem', lineHeight: 1.65, color: '#94a3b8', maxWidth: 420,
  },
  brandFoot: {
    fontSize: '0.75rem', color: '#64748b', fontWeight: 500,
  },
  formPanel: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2rem 1.25rem',
    background: 'var(--bg-secondary)',
  },
  formBox: {
    width: '100%', maxWidth: 380,
  },
  mobileBrand: {
    alignItems: 'center', gap: '0.6rem', marginBottom: '1.75rem',
  },
  formTitle: {
    fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em',
    color: 'var(--text-primary)', marginBottom: '0.35rem',
  },
  formSub: {
    fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.75rem',
  },
  form: {
    display: 'flex', flexDirection: 'column', gap: '1.15rem',
  },
  errorBox: {
    padding: '0.7rem 0.9rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: 'var(--danger-color)',
    borderRadius: 'var(--border-radius-md)',
    fontSize: '0.85rem', fontWeight: 500,
  },
  inputGroup: {
    display: 'flex', flexDirection: 'column',
  },
  inputWrapper: {
    position: 'relative', display: 'flex', alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute', left: '0.9rem', color: 'var(--text-tertiary)', pointerEvents: 'none',
  },
  input: {
    paddingLeft: '2.6rem',
  },
  eyeBtn: {
    position: 'absolute', right: '0.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    color: 'var(--text-tertiary)',
  },
  rememberRow: {
    display: 'flex', alignItems: 'center', gap: '0.55rem',
    cursor: 'pointer', userSelect: 'none',
    fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500,
  },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s', cursor: 'pointer',
  },
};

export default Login;
