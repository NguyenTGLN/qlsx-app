import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import HomePage from './pages/HomePage';

// ── Lazy-load từng phân hệ ──
// Mỗi phân hệ được tách thành 1 gói riêng, chỉ tải khi người dùng mở vào.
// → Lần mở app đầu tiên nhẹ và nhanh hơn nhiều, đặc biệt trên điện thoại.
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard'));
const WorkerInput     = lazy(() => import('./pages/WorkerInput'));
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'));
const TaskApp         = lazy(() => import('./pages/tasks/TaskApp'));
const WarrantyApp     = lazy(() => import('./pages/warranty/WarrantyApp'));
const CskhApp         = lazy(() => import('./pages/cskh/CskhApp'));
const KhoHangApp      = lazy(() => import('./pages/kho/KhoHangApp'));
const QualityApp      = lazy(() => import('./pages/quality/QualityApp'));

// Màn hình chờ trong lúc tải gói của phân hệ
function ModuleLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f8fafc', flexDirection: 'column', gap: '1rem',
    }}>
      <div style={{
        width: 44, height: 44,
        border: '4px solid #e2e8f0', borderTopColor: '#0891b2',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Đang tải phân hệ...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<ModuleLoader />}>
      <Routes>
        {/* ── Public ── */}
        {/* CHỈ được để ở đây những route KHÔNG đọc dữ liệu.
            Route /tv (TvDashboard) đã gỡ ngày 28/07/2026: nó chạy không đăng nhập
            nhưng đọc thẳng nhan_vien + cong_viec_duoc_giao, nên buộc hai bảng đó
            phải mở cho vai trò công khai — ai lấy khoá trong mã nguồn cũng đọc và
            sửa được. Hai bảng nay đã siết về {authenticated}.
            Cần màn hình hiển thị không đăng nhập thì viết RPC SECURITY DEFINER chỉ
            trả đúng phần cần hiện, TUYỆT ĐỐI không mở lại quyền cho vai trò công khai. */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Login />} />

        {/* ── Protected ── */}
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requiredModule="access_overview"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/tasks/*" element={<ProtectedRoute requiredModule="access_tasks"><TaskApp /></ProtectedRoute>} />
        <Route path="/worker" element={<ProtectedRoute requiredModule="access_production"><WorkerDashboard /></ProtectedRoute>} />
        <Route path="/worker/input/:orderId" element={<ProtectedRoute requiredModule="access_production"><WorkerInput /></ProtectedRoute>} />
        <Route path="/bao-hanh/*" element={<ProtectedRoute requiredModule="access_warranty"><WarrantyApp /></ProtectedRoute>} />
        <Route path="/cskh/*" element={<ProtectedRoute requiredModule="access_cskh"><CskhApp /></ProtectedRoute>} />
        <Route path="/kho/*" element={<ProtectedRoute requiredModule="access_warehouse"><KhoHangApp /></ProtectedRoute>} />
        <Route path="/quality/*" element={<ProtectedRoute requiredModule="access_quality"><QualityApp /></ProtectedRoute>} />
      </Routes>
    </Suspense>
  );
}

export default App;
