// ============================================================
// 🗂️ Registry phân quyền 3 cấp: Phân hệ → Tab → Cap (CRUD)
//    caps: 'view' | 'create' | 'edit' | 'delete' | 'io'
//    Tab chỉ-đọc -> caps = ['view']. Mọi tab BẮT BUỘC có 'view'.
//    legacyAccess: key access_* cũ để đồng bộ.
// ============================================================
export const ALL_CAPS = ['view', 'create', 'edit', 'delete', 'io', 'sendForm', 'cancelLan'];

export const CAP_LABEL = {
  view: 'Xem', create: 'Thêm', edit: 'Sửa', delete: 'Xóa', io: 'N/X',
  sendForm: 'Gửi Form', cancelLan: 'Hủy Lần',
};

export const PERM_REGISTRY = [
  {
    module: 'kho', label: 'Kho Hàng', icon: '🏬', legacyAccess: 'access_warehouse',
    tabs: [
      { id: 'nhap-kho',         label: 'Bốc dỡ & Nhập kho',        caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'du-lieu-nhap',     label: 'Dữ liệu nhập',             caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'luu-xuat',         label: 'Lưu xuất',                 caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'xuat',             label: 'Dữ liệu xuất',             caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'ton-kho-tong',     label: 'Tồn kho hàng hóa',         caps: ['view', 'create'] }, // create = "Gửi đề xuất" (xuất Excel để mở, không gate)
      { id: 'ton-kho-so-sach',  label: 'Tồn kho sổ sách',          caps: ['view'] },
      { id: 'ton-kho',          label: 'Tồn kho theo vị trí',      caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'danh-muc',         label: 'Danh mục hàng hóa',        caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'danh-muc-ncc',     label: 'Danh mục NCC',             caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'bom',              label: 'BOM Sản xuất',             caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'lenh-sx',          label: 'Bốc dỡ & Xuất kho (PSX)',  caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'lich-su-boc-do',   label: 'Lịch sử bốc dỡ',           caps: ['view'] },
      { id: 'dksx',             label: 'DKSX — Nhu cầu sản xuất',  caps: ['view', 'create', 'delete'] },
      { id: 'de-xuat-dat-hang', label: 'Đề xuất đặt hàng (DLK)',   caps: ['view', 'create', 'edit', 'delete'] },
      { id: 'ton-kho-sx',       label: 'Tồn kho Sản xuất',         caps: ['view', 'edit', 'delete', 'io'] }, // không có nút Thêm
      { id: 'print_queue',      label: 'Quản Lý Chứng Từ',         caps: ['view'] }, // chỉ in/in lại (workflow), không CRUD
    ],
  },
  {
    module: 'tasks', label: 'Công Việc', icon: '📋', legacyAccess: 'access_tasks',
    tabs: [
      { id: 'dashboard',   label: 'Tổng quan', caps: ['view'] },
      { id: 'tasks',       label: 'Công việc', caps: ['view', 'create', 'edit', 'delete'] },
      { id: 'work_report', label: 'Báo Cáo',   caps: ['view', 'io'] },
    ],
  },
  {
    module: 'warranty', label: 'Bảo Hành', icon: '🛡️', legacyAccess: 'access_warranty',
    tabs: [
      { id: 'history',        label: 'Lịch Sử Phiếu', caps: ['view'] }, // nội dung chỉ-đọc (thẻ + biểu đồ)
      { id: 'xuLy',           label: 'Xử Lý Phiếu',   caps: ['view', 'create', 'edit', 'delete', 'io', 'sendForm', 'cancelLan'] }, // xử lý phiếu mở + đồng bộ CS + gửi form khai báo + hủy lần
      { id: 'batchAnalytics', label: 'Phân Tích Lỗi', caps: ['view'] }, // chỉ-đọc
      { id: 'dataManager',    label: 'QL Dữ Liệu',    caps: ['view', 'edit', 'delete', 'io'] }, // bản ghi vào qua import, không có nút Thêm tay
    ],
  },
  {
    module: 'cskh', label: 'CSKH', icon: '🎧', legacyAccess: 'access_cskh',
    tabs: [
      { id: 'dashboard',   label: 'Tổng Quan',     caps: ['view'] },
      { id: 'zalo_kpi',    label: 'KPI CSKH Zalo', caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'zalo_report', label: 'BC Trực Zalo',  caps: ['view', 'create'] }, // bảng chỉ-đọc; tạo qua nút header
    ],
  },
  {
    module: 'quality', label: 'Chất Lượng SP', icon: '🔬', legacyAccess: 'access_quality',
    tabs: [
      { id: 'main', label: 'Chất lượng SP', caps: ['view', 'create', 'edit', 'delete', 'io'] },
    ],
  },
  {
    module: 'production', label: 'Nhập Liệu Sản Xuất', icon: '🏭', legacyAccess: 'access_production',
    tabs: [
      { id: 'main', label: 'Nhập liệu sản xuất', caps: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    module: 'overview', label: 'Tổng Quan / Sản Xuất', icon: '📊', legacyAccess: 'access_overview',
    tabs: [
      { id: 'main', label: 'Tổng quan sản xuất', caps: ['view', 'create', 'edit', 'delete', 'io'] },
    ],
  },
];

const MODULE_MAP = Object.fromEntries(PERM_REGISTRY.map(m => [m.module, m]));
function findTab(module, tabId) {
  const m = MODULE_MAP[module];
  return m ? m.tabs.find(t => t.id === tabId) : undefined;
}

export function tabKey(module, tabId, cap) {
  return `tab.${module}.${tabId}.${cap}`;
}

export function emptyTabPerms() {
  return { view: false, create: false, edit: false, delete: false, io: false };
}

export function getTabPerm(user, module, tabId) {
  const tab = findTab(module, tabId);
  const out = emptyTabPerms();
  if (!tab) return out;
  const isAdmin = user && user.role === 'ADMIN';
  const perms = (user && user.permissions) || {};
  for (const cap of tab.caps) {
    out[cap] = isAdmin ? true : perms[tabKey(module, tabId, cap)] === true;
  }
  return out;
}

export function canSeeTab(user, module, tabId) {
  if (user && user.role === 'ADMIN') return true;
  const perms = (user && user.permissions) || {};
  return perms[tabKey(module, tabId, 'view')] === true;
}

export function canSeeModule(user, module) {
  if (user && user.role === 'ADMIN') return true;
  const m = MODULE_MAP[module];
  if (!m) return false;
  return m.tabs.some(t => canSeeTab(user, module, t.id));
}

const LEGACY_CAP_MAP = [
  { key: 'kho_edit',      module: 'kho',     caps: ['create', 'edit', 'io'] },
  { key: 'kho_delete',    module: 'kho',     caps: ['delete'] },
  { key: 'kho_catalog',   module: 'kho',     caps: ['create', 'edit', 'delete', 'io'], onlyTabs: ['danh-muc', 'bom'] },
  { key: 'kho_order',     module: 'kho',     caps: ['create', 'edit', 'delete'], onlyTabs: ['dksx', 'de-xuat-dat-hang', 'ton-kho-tong'] },
  { key: 'create_task',   module: 'tasks',   caps: ['create'], onlyTabs: ['tasks'] },
  { key: 'edit_task',     module: 'tasks',   caps: ['edit'], onlyTabs: ['tasks'] },
  { key: 'delete_task',   module: 'tasks',   caps: ['delete'], onlyTabs: ['tasks'] },
  { key: 'quality_edit',  module: 'quality', caps: ['create', 'edit', 'io'] },
  { key: 'quality_delete',module: 'quality', caps: ['delete'] },
  { key: 'zalo_kpi_mark_done', module: 'cskh', caps: ['edit'], onlyTabs: ['zalo_kpi'] },
  { key: 'zalo_kpi_delete',    module: 'cskh', caps: ['delete'], onlyTabs: ['zalo_kpi'] },
  { key: 'zalo_kpi_export',    module: 'cskh', caps: ['io'], onlyTabs: ['zalo_kpi'] },
];

export function migrateLegacyToTabPerms(perms) {
  const out = { ...(perms || {}) };
  const setCap = (module, tabId, cap) => {
    const tab = findTab(module, tabId);
    if (tab && tab.caps.includes(cap)) out[tabKey(module, tabId, cap)] = true;
  };
  for (const m of PERM_REGISTRY) {
    if (out[m.legacyAccess] === true) {
      for (const t of m.tabs) setCap(m.module, t.id, 'view');
    }
  }
  if (out.view_dashboard === true) { setCap('tasks', 'dashboard', 'view'); setCap('tasks', 'work_report', 'view'); }
  if (out.view_tasks === true) setCap('tasks', 'tasks', 'view');
  if (out.zalo_kpi_view === true) setCap('cskh', 'zalo_kpi', 'view');
  for (const rule of LEGACY_CAP_MAP) {
    if (out[rule.key] !== true) continue;
    const m = MODULE_MAP[rule.module];
    if (!m) continue;
    for (const t of m.tabs) {
      if (rule.onlyTabs && !rule.onlyTabs.includes(t.id)) continue;
      for (const cap of rule.caps) setCap(rule.module, t.id, cap);
    }
  }
  return out;
}
