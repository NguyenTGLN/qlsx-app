import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { getTabPerm as _getTabPerm, canSeeTab as _canSeeTab, canSeeModule as _canSeeModule, migrateLegacyToTabPerms } from './permRegistry';

// ============================================================
// 🔐 RBAC — Hệ thống Phân quyền Toàn App
// ============================================================

// Quyền truy cập Phân hệ (Module-level)
export const MODULE_PERMS = {
  access_overview:    'Truy cập Tổng Quan / Sản Xuất',
  access_tasks:       'Truy cập Công Việc',
  access_production:  'Truy cập Nhập Liệu Sản Xuất',
  access_warranty:    'Truy cập Bảo Hành',
  access_cskh:        'Truy cập CSKH',
  access_warehouse:   'Truy cập Kho Hàng',
  access_quality:     'Truy cập Chất Lượng SP',
};

// Quyền tính năng chi tiết (Feature-level) — kế thừa từ TaskApp
export const FEATURE_PERMS = {
  view_dashboard:     'Xem Tổng quan',
  view_tasks:         'Xem Công việc',
  create_task:        'Tạo việc mới',
  edit_task:          'Sửa công việc',
  delete_task:        'Xóa công việc',
  edit_due_date:      'Sửa thời hạn',
  change_assignee:    'Đổi người thực hiện',
  edit_recurrence:    'Sửa lặp lại',
  change_status:      'Đổi trạng thái',
  add_update:         'Cập nhật tiến độ',
  cancel_task:        'Hủy công việc',
  remind_task:        'Nhắc việc',
  manage_users:       'Quản lý nhân viên',
  manage_settings:    'Quản lý cài đặt',
  // ── KPI CSKH Zalo ──
  zalo_kpi_view:      'Xem KPI CSKH Zalo',
  zalo_kpi_mark_done: 'Đánh dấu đã xử lý (Zalo)',
  zalo_kpi_delete:    'Xóa dữ liệu KPI Zalo',
  zalo_kpi_filter:    'Lọc nâng cao KPI Zalo',
  zalo_kpi_export:    'Xuất Excel KPI Zalo',
  // ── Kho Hàng (theo nhóm thao tác — cần access_warehouse để vào; không có nhóm nào = chỉ xem) ──
  kho_edit:           'Kho — Nhập/Xuất kho & sửa tồn',
  kho_catalog:        'Kho — Sửa danh mục & BOM',
  kho_delete:         'Kho — Xóa dữ liệu',
  kho_order:          'Kho — Đề xuất & đặt hàng',
  // ── Chất Lượng SP ──
  quality_edit:       'Chất lượng — Thêm/sửa',
  quality_delete:     'Chất lượng — Xóa',
};

// Tổng hợp tất cả permissions
export const ALL_PERMS = { ...MODULE_PERMS, ...FEATURE_PERMS };

// Quyền mặc định cho ADMIN (tất cả)
const DEFAULT_PERMS_ADMIN = Object.keys(ALL_PERMS).reduce((a, k) => ({ ...a, [k]: true }), {});

// Quyền mặc định cho nhân viên thường
const DEFAULT_PERMS_AGENT = {
  // Module access — mặc định chỉ truy cập được Công Việc + Sản Xuất
  access_overview:    false,
  access_tasks:       true,
  access_production:  true,
  access_warranty:    false,
  access_cskh:        false,
  access_warehouse:   false,
  access_quality:     false,
  // Feature access
  view_dashboard:     false,
  view_tasks:         true,
  create_task:        false,
  edit_task:          false,
  delete_task:        false,
  edit_due_date:      false,
  change_assignee:    false,
  edit_recurrence:    false,
  change_status:      true,
  add_update:         true,
  cancel_task:        false,
  remind_task:        false,
  manage_users:       false,
  manage_settings:    false,
  // KPI CSKH Zalo — mặc định NV không được xem, phải được cấp quyền
  zalo_kpi_view:      false,
  zalo_kpi_mark_done: false,
  zalo_kpi_delete:    false,
  zalo_kpi_filter:    false,
  zalo_kpi_export:    false,
  // Kho Hàng — mặc định NV không có nhóm nào (chỉ xem nếu được cấp access_warehouse)
  kho_edit:           false,
  kho_catalog:        false,
  kho_delete:         false,
  kho_order:          false,
  // Chất Lượng SP
  quality_edit:       false,
  quality_delete:     false,
  // Mặc định nhân viên mới: chỉ thấy & làm tab Công việc
  'tab.tasks.tasks.view': true,
  'tab.tasks.tasks.edit': true,
};

/** Migrate legacy perms -> tab.* keys in memory (transitional). Admin unaffected; users with tab.* keys unchanged. */
function withMigratedPerms(data) {
  if (!data || data.role === 'ADMIN') return data;
  const perms = data.permissions;
  const hasTabKeys = perms && typeof perms === 'object' &&
    Object.keys(perms).some(k => k.startsWith('tab.'));
  if (hasTabKeys) return data;
  return { ...data, permissions: migrateLegacyToTabPerms(perms || {}) };
}

/**
 * Lấy permissions cho user dựa trên role + saved permissions
 */
export function getUserPerms(user) {
  if (!user) return DEFAULT_PERMS_AGENT;
  if (user.role === 'ADMIN') return DEFAULT_PERMS_ADMIN;
  const saved = user.permissions;
  if (saved && typeof saved === 'object') return { ...DEFAULT_PERMS_AGENT, ...saved };
  return DEFAULT_PERMS_AGENT;
}

/**
 * Kiểm tra 1 permission cụ thể
 */
export function hasPerm(user, perm) {
  return getUserPerms(user)[perm] === true;
}

/**
 * Kiểm tra user có quyền truy cập phân hệ không
 */
export function hasModuleAccess(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return hasPerm(user, moduleKey);
}

// ============================================================
// 🔑 Auth Context
// ============================================================

const STORAGE_KEY = 'qlsx_auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-login from saved credentials
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { id, pw } = JSON.parse(saved);
        if (id && pw) {
          supabase.from('nhan_vien').select('*').ilike('id', id).eq('password', pw).single()
            .then(({ data, error }) => {
              if (!error && data) {
                data.role = data.role ? data.role.toUpperCase() : 'AGENT';
                setUser(withMigratedPerms(data));
              } else {
                localStorage.removeItem(STORAGE_KEY);
              }
            })
            .finally(() => setLoading(false));
          return;
        }
      } catch (_) { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (id, password, remember = false) => {
    const { data, error } = await supabase
      .from('nhan_vien').select('*').ilike('id', id).eq('password', password).single();

    if (error) {
      // Lỗi do timeout hoặc fetch error (dự án bị tạm dừng)
      if (error.message && (error.message.includes('quá chậm') || error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        throw new Error('Không thể kết nối đến máy chủ. Máy chủ có thể đang ngủ, vui lòng thử lại sau.');
      }
      throw new Error('Mã nhân viên hoặc mật khẩu không đúng!');
    }
    
    if (!data) {
      throw new Error('Mã nhân viên hoặc mật khẩu không đúng!');
    }

    data.role = data.role ? data.role.toUpperCase() : 'AGENT';
    setUser(withMigratedPerms(data));

    // Lưu credentials
    const authData = JSON.stringify({ id: data.id, pw: password });
    localStorage.setItem(STORAGE_KEY, authData);
    // Legacy keys — giữ tương thích cho các module cũ chưa migrate
    localStorage.setItem('workerId', data.id);
    localStorage.setItem('workerCode', data.id);
    localStorage.setItem('workerName', data.name);
    localStorage.setItem('workerRole', data.role === 'ADMIN' ? 'admin' : 'worker');
    localStorage.setItem('qlcv_auth', authData);
    localStorage.setItem('qlsx_remember_auth', authData);

    if (!remember) {
      // Nếu không ghi nhớ, ta vẫn lưu cho session hiện tại
      // nhưng đánh dấu để không auto-login lần sau
    }

    return data;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('qlcv_auth');
    localStorage.removeItem('qlsx_remember_auth');
    localStorage.removeItem('workerId');
    localStorage.removeItem('workerCode');
    localStorage.removeItem('workerName');
    localStorage.removeItem('workerRole');
  }, []);

  const value = {
    user,
    setUser,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'ADMIN',
    perms: getUserPerms(user),
    hasPerm: (perm) => hasPerm(user, perm),
    hasModule: (moduleKey) => hasModuleAccess(user, moduleKey),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export { getTabPerm, canSeeTab, canSeeModule } from './permRegistry';

/** Hook: trả {view,create,edit,delete,io} cho 1 tab của user hiện tại */
export function useTabPerm(module, tabId) {
  const { user } = useAuth();
  return _getTabPerm(user, module, tabId);
}
/** Hook tiện ích */
export function useCanSeeTab(module, tabId) {
  const { user } = useAuth();
  return _canSeeTab(user, module, tabId);
}
export function useCanSeeModule(module) {
  const { user } = useAuth();
  return _canSeeModule(user, module);
}

export default AuthContext;
