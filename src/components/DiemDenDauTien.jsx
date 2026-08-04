import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { chonDiemDen } from '../lib/diemDen';

// Chọn màn hình đầu tiên khi mở app (route '/'). Luật chọn nằm ở lib/diemDen.js.
//
// Trong lúc AuthContext còn khôi phục phiên, PHẢI đứng yên ở màn hình chờ. Trả
// <Navigate to="/login"> ở đây sẽ làm màn hình đăng nhập loé lên mỗi lần mở app,
// rồi mới nhảy về đúng chỗ — người dùng tưởng bị đăng xuất.
export default function DiemDenDauTien() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: '#f8fafc', flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{
          width: 44, height: 44,
          border: '4px solid #e2e8f0', borderTopColor: '#2563eb',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Đang mở ứng dụng…</p>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  return <Navigate to={chonDiemDen(user)} replace />;
}
