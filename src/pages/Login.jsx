import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogIn } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const Login = () => {
  const [workerCode, setWorkerCode] = useState('');
  const [password, setPassword] = useState('');
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
      <div style={styles.container}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{
            width: 48, height: 48,
            border: '4px solid #e2e8f0', borderTopColor: '#2563eb',
            borderRadius: '50%', margin: '0 auto 1rem',
            animation: 'spin 0.8s linear infinite'
          }} />
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Đang đăng nhập tự động...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: 400 }}>
        <div className="glass-panel" style={styles.card}>
          <div style={styles.header}>
            <div style={styles.iconWrapper}>
              <User size={32} color="#fff" />
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Đăng Nhập QLSX</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Quản Lý Sản Xuất — v3.0</p>
          </div>

          <form onSubmit={handleLogin} style={styles.form}>
            {errorStr && (
              <div style={{
                padding: '0.75rem', background: '#fef2f2',
                color: 'var(--danger-color)', borderRadius: 8,
                fontSize: '0.9rem', textAlign: 'center',
              }}>
                {errorStr}
              </div>
            )}

            <div style={styles.inputGroup}>
              <label className="form-label">Mã nhân viên</label>
              <div style={styles.inputWrapper}>
                <User size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  className="form-control"
                  style={styles.input}
                  placeholder="Ví dụ: NV001"
                  value={workerCode}
                  onChange={(e) => setWorkerCode(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label className="form-label">Mật khẩu / Mã PIN</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type="password"
                  className="form-control"
                  style={styles.input}
                  placeholder="Nhập mã bí mật"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Checkbox ghi nhớ */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              cursor: 'pointer', userSelect: 'none',
              fontSize: '0.9rem', color: '#475569', fontWeight: 500,
            }}>
              <div
                onClick={() => setRememberMe(r => !r)}
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  border: rememberMe ? 'none' : '2px solid #cbd5e1',
                  background: rememberMe ? '#2563eb' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', cursor: 'pointer',
                  boxShadow: rememberMe ? '0 2px 6px rgba(37,99,235,0.4)' : 'none',
                }}
              >
                {rememberMe && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              Ghi nhớ đăng nhập
            </label>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '1rem' }}
              disabled={loading}
            >
              {loading ? 'Đang kiểm tra...' : (
                <>Đăng Nhập <LogIn size={20} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background: 'linear-gradient(135deg, #eef2ff 0%, #f0fdf4 50%, #f8fafc 100%)',
    minHeight: '100vh',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: '2rem',
    borderRadius: 'var(--border-radius-lg)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  iconWrapper: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'var(--accent-gradient)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 1rem',
    boxShadow: 'var(--shadow-glow)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '1rem',
    color: 'var(--text-tertiary)',
  },
  input: {
    paddingLeft: '2.75rem',
  },
};

export default Login;
