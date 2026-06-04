import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, hasModuleAccess } from '../lib/AuthContext';

/**
 * ProtectedRoute — Auth Guard
 * Wrap quanh routes yêu cầu đăng nhập.
 * - Nếu đang loading (auto-login): hiện spinner
 * - Nếu chưa login: redirect → /login
 * - Nếu đã login: render children
 * - Nếu yêu cầu quyền module cụ thể: kiểm tra permission
 */
export default function ProtectedRoute({ children, requiredModule }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Đang auto-login
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f8fafc', flexDirection: 'column', gap: '1rem'
      }}>
        <div style={{
          width: 48, height: 48,
          border: '4px solid #e2e8f0', borderTopColor: '#2563eb',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ color: '#64748b', fontWeight: 600, fontSize: '0.95rem' }}>
          Đang xác thực...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Chưa đăng nhập
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Kiểm tra quyền module (nếu có yêu cầu)
  if (requiredModule) {
    // Dùng hasModuleAccess (merge quyền mặc định) để khớp với HomePage —
    // tránh trường hợp menu hiện ra nhưng vào route lại bị chặn.
    const hasAccess = hasModuleAccess(user, requiredModule);

    if (!hasAccess) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#f8fafc', flexDirection: 'column', gap: '1rem',
          textAlign: 'center', padding: '2rem'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem'
          }}>🚫</div>
          <h2 style={{ color: '#0f172a', fontSize: '1.25rem', fontWeight: 700 }}>Không có quyền truy cập</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: 400 }}>
            Tài khoản của bạn chưa được cấp quyền truy cập phân hệ này.
            Vui lòng liên hệ Admin để được phân quyền.
          </p>
          <button
            onClick={() => window.location.href = '/home'}
            style={{
              marginTop: '0.5rem', padding: '0.6rem 1.5rem', borderRadius: '10px',
              background: '#2563eb', color: '#fff', border: 'none',
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
            }}
          >
            ← Về Trang Chủ
          </button>
        </div>
      );
    }
  }

  return children;
}
