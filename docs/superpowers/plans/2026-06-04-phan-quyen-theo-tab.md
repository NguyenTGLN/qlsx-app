# Phân quyền chi tiết theo Tab (View / CRUD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho admin tick tay quyền của từng nhân viên ở mức Phân hệ → Tab → tác vụ CRUD (view/create/edit/delete/io), mặc định tắt hết, ẩn tab/phân hệ không có quyền xem.

**Architecture:** Một registry trung tâm (`permRegistry.js`) khai báo mọi phân hệ/tab/cap. Helper thuần + hook `useTabPerm` đọc key phẳng `tab.<module>.<tabId>.<cap>` trong cột JSON `nhan_vien.permissions`. Modal Sửa nhân viên tự sinh ma trận tick từ registry. Mỗi tab component ẩn tab/nút theo cap. Quyền cũ được giữ + có hàm đồng bộ sang key mới.

**Tech Stack:** React 19, Vite 8, Supabase JS, Vitest (mới, chỉ test hàm lõi), ESLint.

**Spec:** `docs/superpowers/specs/2026-06-04-phan-quyen-theo-tab-design.md`

**Lưu ý môi trường:** Thư mục KHÔNG phải git repo → **bỏ qua mọi bước `git commit`** trong plan; thay bằng "lưu file + chạy lệnh kiểm thử". Shell là PowerShell trên Windows.

---

## File Structure

- **Create** `src/lib/permRegistry.js` — registry + helper thuần (`tabKey`, `getTabPerm`, `canSeeTab`, `canSeeModule`, `migrateLegacyToTabPerms`, `emptyTabPerms`).
- **Create** `src/lib/permRegistry.test.js` — unit test Vitest cho các hàm thuần.
- **Modify** `src/lib/AuthContext.jsx` — export thêm `useTabPerm` (hook), re-export helper; cập nhật `DEFAULT_PERMS_AGENT`.
- **Modify** `src/pages/tasks/TaskApp.jsx` — thay 2 khối checkbox phẳng trong `UserModal` bằng component ma trận `<PermMatrix>`; gate tab Công Việc bằng `canSeeTab`.
- **Modify** `src/pages/kho/KhoHangApp.jsx` — lọc `ALL_TABS` theo `canSeeTab`; tính `perms` per-tab.
- **Modify** các tab Kho (`StockSummaryTab`, `InventoryTab`, `WipStockTab`, `CatalogTab`, `BomTab`, `ProductionOrderTab`, `DKSXTab`, `OrderProposalTab`, `ImportStockTab`, `SaveExportTab`, `PrintQueueTab`) — đọc cap mới.
- **Modify** `src/pages/warranty/WarrantyApp.jsx`, `src/pages/cskh/CskhApp.jsx`, `src/pages/quality/QualityApp.jsx`, các app Sản Xuất/Tổng Quan, và menu phân hệ (`HomePage.jsx`).
- **Create** `vitest.config.js` + cập nhật `package.json` (script `test`, devDeps `vitest`).

---

## Phase 0 — Cài Vitest

### Task 1: Thêm Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Cài vitest (dev-only)**

Run (PowerShell):
```powershell
npm install -D vitest
```
Expected: `package.json` có `vitest` trong `devDependencies`, không lỗi.

- [ ] **Step 2: Thêm script test vào `package.json`**

Trong khối `"scripts"`, thêm dòng:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Tạo `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Smoke test**

Tạo tạm `src/lib/_smoke.test.js`:
```js
import { test, expect } from 'vitest';
test('vitest chạy', () => { expect(1 + 1).toBe(2); });
```
Run: `npm test`
Expected: PASS 1 test. Sau đó **xoá** `src/lib/_smoke.test.js`.

---

## Phase 1 — Khung phân quyền (registry + helper + test)

### Task 2: Registry + helper thuần (TDD)

**Files:**
- Create: `src/lib/permRegistry.js`
- Test: `src/lib/permRegistry.test.js`

- [ ] **Step 1: Viết test thất bại**

`src/lib/permRegistry.test.js`:
```js
import { test, expect, describe } from 'vitest';
import {
  PERM_REGISTRY, tabKey, getTabPerm, canSeeTab, canSeeModule,
  migrateLegacyToTabPerms, emptyTabPerms,
} from './permRegistry';

describe('registry shape', () => {
  test('mọi tab có id, label, caps không rỗng', () => {
    for (const m of PERM_REGISTRY) {
      expect(m.module).toBeTruthy();
      for (const t of m.tabs) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.caps.length).toBeGreaterThan(0);
        expect(t.caps).toContain('view'); // mọi tab phải có view
      }
    }
  });
  test('module ids là duy nhất', () => {
    const ids = PERM_REGISTRY.map(m => m.module);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('tabKey', () => {
  test('định dạng đúng', () => {
    expect(tabKey('kho', 'nhap-kho', 'edit')).toBe('tab.kho.nhap-kho.edit');
  });
});

describe('getTabPerm', () => {
  test('admin có mọi cap mà tab hỗ trợ', () => {
    const admin = { role: 'ADMIN' };
    const p = getTabPerm(admin, 'kho', 'nhap-kho');
    expect(p).toEqual({ view: true, create: true, edit: true, delete: true, io: true });
  });
  test('cap tab không hỗ trợ luôn false (kể cả admin)', () => {
    const admin = { role: 'ADMIN' };
    const p = getTabPerm(admin, 'kho', 'ton-kho-so-sach'); // chỉ ['view']
    expect(p).toEqual({ view: true, create: false, edit: false, delete: false, io: false });
  });
  test('agent đọc theo key đã lưu', () => {
    const u = { role: 'AGENT', permissions: { 'tab.kho.nhap-kho.view': true, 'tab.kho.nhap-kho.edit': true } };
    expect(getTabPerm(u, 'kho', 'nhap-kho')).toEqual({ view: true, create: false, edit: true, delete: false, io: false });
  });
  test('agent không có key nào -> tất cả false', () => {
    const u = { role: 'AGENT', permissions: {} };
    expect(getTabPerm(u, 'kho', 'nhap-kho')).toEqual({ view: false, create: false, edit: false, delete: false, io: false });
  });
});

describe('canSeeTab / canSeeModule', () => {
  test('canSeeTab = view', () => {
    const u = { role: 'AGENT', permissions: { 'tab.kho.nhap-kho.view': true } };
    expect(canSeeTab(u, 'kho', 'nhap-kho')).toBe(true);
    expect(canSeeTab(u, 'kho', 'bom')).toBe(false);
  });
  test('canSeeModule = có >=1 tab view', () => {
    const u = { role: 'AGENT', permissions: { 'tab.kho.bom.view': true } };
    expect(canSeeModule(u, 'kho')).toBe(true);
    expect(canSeeModule(u, 'tasks')).toBe(false);
  });
  test('admin thấy mọi module/tab', () => {
    const admin = { role: 'ADMIN' };
    expect(canSeeModule(admin, 'kho')).toBe(true);
    expect(canSeeTab(admin, 'cskh', 'zalo_kpi')).toBe(true);
  });
});

describe('migrateLegacyToTabPerms', () => {
  test('access_warehouse -> view mọi tab Kho', () => {
    const out = migrateLegacyToTabPerms({ access_warehouse: true });
    expect(out['tab.kho.nhap-kho.view']).toBe(true);
    expect(out['tab.kho.ton-kho-so-sach.view']).toBe(true);
  });
  test('kho_edit -> create/edit/io cho tab hỗ trợ', () => {
    const out = migrateLegacyToTabPerms({ access_warehouse: true, kho_edit: true });
    expect(out['tab.kho.nhap-kho.create']).toBe(true);
    expect(out['tab.kho.nhap-kho.edit']).toBe(true);
    expect(out['tab.kho.nhap-kho.io']).toBe(true);
    // tab chỉ-đọc không nhận create
    expect(out['tab.kho.ton-kho-so-sach.create']).toBeUndefined();
  });
  test('kho_delete -> delete; quality_edit -> create/edit/io', () => {
    const out = migrateLegacyToTabPerms({ access_warehouse: true, kho_delete: true, access_quality: true, quality_edit: true });
    expect(out['tab.kho.nhap-kho.delete']).toBe(true);
    expect(out['tab.quality.main.create']).toBe(true);
    expect(out['tab.quality.main.io']).toBe(true);
  });
  test('giữ nguyên key cũ trong output', () => {
    const out = migrateLegacyToTabPerms({ access_warehouse: true, kho_edit: true });
    expect(out.access_warehouse).toBe(true);
    expect(out.kho_edit).toBe(true);
  });
  test('không có access_* -> không sinh tab key cho module đó', () => {
    const out = migrateLegacyToTabPerms({ access_warehouse: true });
    expect(out['tab.tasks.tasks.view']).toBeUndefined();
  });
});

describe('emptyTabPerms', () => {
  test('trả object đủ 5 cap = false', () => {
    expect(emptyTabPerms()).toEqual({ view: false, create: false, edit: false, delete: false, io: false });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — không import được `./permRegistry`.

- [ ] **Step 3: Viết `src/lib/permRegistry.js`**

```js
// ============================================================
// 🗂️ Registry phân quyền 3 cấp: Phân hệ → Tab → Cap (CRUD)
//    caps: 'view' | 'create' | 'edit' | 'delete' | 'io'
//    Tab chỉ-đọc -> caps = ['view']. Mọi tab BẮT BUỘC có 'view'.
//    legacyAccess: key access_* cũ để đồng bộ.
// ============================================================
export const ALL_CAPS = ['view', 'create', 'edit', 'delete', 'io'];

export const CAP_LABEL = {
  view: 'Xem', create: 'Thêm', edit: 'Sửa', delete: 'Xóa', io: 'N/X',
};

export const PERM_REGISTRY = [
  {
    module: 'kho', label: 'Kho Hàng', icon: '🏬', legacyAccess: 'access_warehouse',
    tabs: [
      { id: 'nhap-kho',         label: 'Bốc dỡ & Nhập kho',        caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'du-lieu-nhap',     label: 'Dữ liệu nhập',             caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'luu-xuat',         label: 'Lưu xuất',                 caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'xuat',             label: 'Dữ liệu xuất',             caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'ton-kho-tong',     label: 'Tồn kho hàng hóa',         caps: ['view', 'create', 'io'] }, // create = "Gửi đề xuất"
      { id: 'ton-kho-so-sach',  label: 'Tồn kho sổ sách',          caps: ['view'] },
      { id: 'ton-kho',          label: 'Tồn kho theo vị trí',      caps: ['view', 'io'] },
      { id: 'danh-muc',         label: 'Danh mục hàng hóa',        caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'bom',              label: 'BOM Sản xuất',             caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'lenh-sx',          label: 'Bốc dỡ & Xuất kho (PSX)',  caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'lich-su-boc-do',   label: 'Lịch sử bốc dỡ',           caps: ['view'] },
      { id: 'dksx',             label: 'DKSX — Nhu cầu sản xuất',  caps: ['view', 'create', 'delete'] },
      { id: 'de-xuat-dat-hang', label: 'Đề xuất đặt hàng (DLK)',   caps: ['view', 'create', 'edit', 'delete'] },
      { id: 'ton-kho-sx',       label: 'Tồn kho Sản xuất',         caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'print_queue',      label: 'Quản Lý Chứng Từ',         caps: ['view', 'create', 'delete'] },
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
      { id: 'history',        label: 'Lịch Sử Phiếu', caps: ['view', 'create', 'edit', 'delete', 'io'] },
      { id: 'batchAnalytics', label: 'Phân Tích Lỗi', caps: ['view', 'io'] },
      { id: 'dataManager',    label: 'QL Dữ Liệu',    caps: ['view', 'create', 'edit', 'delete', 'io'] },
    ],
  },
  {
    module: 'cskh', label: 'CSKH', icon: '🎧', legacyAccess: 'access_cskh',
    tabs: [
      { id: 'dashboard',   label: 'Tổng Quan',     caps: ['view'] },
      { id: 'zalo_kpi',    label: 'KPI CSKH Zalo', caps: ['view', 'edit', 'delete', 'io'] },
      { id: 'zalo_report', label: 'BC Trực Zalo',  caps: ['view', 'create', 'edit', 'delete'] },
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
      { id: 'main', label: 'Tổng quan sản xuất', caps: ['view', 'io'] },
    ],
  },
];

// Tra cứu nhanh
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

// Bảng map nhóm thao tác cũ -> cap mới (chỉ áp cho cap tab hỗ trợ).
// Mỗi entry: legacyKey -> { module, caps: [...] }  (áp cho MỌI tab của module)
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
  // 1) access_<module> -> view mọi tab module đó
  for (const m of PERM_REGISTRY) {
    if (out[m.legacyAccess] === true) {
      for (const t of m.tabs) setCap(m.module, t.id, 'view');
    }
  }
  // 2) view_dashboard / view_tasks (Công Việc đặc thù)
  if (out.view_dashboard === true) { setCap('tasks', 'dashboard', 'view'); setCap('tasks', 'work_report', 'view'); }
  if (out.view_tasks === true) setCap('tasks', 'tasks', 'view');
  if (out.zalo_kpi_view === true) setCap('cskh', 'zalo_kpi', 'view');
  // 3) các nhóm thao tác -> cap
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
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS toàn bộ test trong `permRegistry.test.js`.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: không lỗi mới ở `src/lib/permRegistry.js`.

### Task 3: Hook `useTabPerm` + default mới trong AuthContext

**Files:**
- Modify: `src/lib/AuthContext.jsx`

- [ ] **Step 1: Re-export helper + thêm hook**

Cuối `src/lib/AuthContext.jsx` (trước `export default`), thêm:
```js
import {
  getTabPerm as _getTabPerm, canSeeTab as _canSeeTab, canSeeModule as _canSeeModule,
} from './permRegistry';

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
```

- [ ] **Step 2: Cập nhật `DEFAULT_PERMS_AGENT`** — nhân viên mới chỉ thấy "Công việc"

Trong object `DEFAULT_PERMS_AGENT`, thêm các key tab mặc định (giữ nguyên các key cũ đang có để không gãy code chưa migrate):
```js
  // Mặc định nhân viên mới: chỉ thấy & làm tab Công việc
  'tab.tasks.tasks.view': true,
  'tab.tasks.tasks.edit': true,
```

- [ ] **Step 3: Build kiểm tra không gãy import**

Run: `npm run build`
Expected: build thành công.

---

## Phase 2 — Giao diện gán quyền (ma trận)

### Task 4: Component `PermMatrix` trong UserModal

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (`UserModal`, ~dòng 371–431)

- [ ] **Step 1: Import registry**

Đầu file, cạnh import AuthContext hiện có, thêm:
```js
import { PERM_REGISTRY, ALL_CAPS, CAP_LABEL, tabKey } from '../../lib/permRegistry';
import { migrateLegacyToTabPerms } from '../../lib/permRegistry';
```

- [ ] **Step 2: Prefill quyền cũ khi mở modal (nếu chưa có key tab.*)**

Trong `UserModal`, sau dòng khởi tạo `currentPerms`, đổi khởi tạo state để tự đồng bộ 1 lần:
```js
const hasTabKeys = user && user.permissions &&
  Object.keys(user.permissions).some(k => k.startsWith('tab.'));
const seedPerms = hasTabKeys ? { ...currentPerms } : migrateLegacyToTabPerms(currentPerms);
const [f,setF] = useState({id:user?.id||'',name:user?.name||'',password:'',role:user?.role||ROLE.AGENT,avatar:user?.avatar||'',originalId:user?.id||'',permissions:{...seedPerms}})
```

- [ ] **Step 3: Helper tick theo key tab + nút nhanh**

Trong `UserModal`, thêm:
```js
const tabOn = (m, t, cap) => f.permissions[tabKey(m, t, cap)] === true;
const setTab = (m, t, cap, val) => setF(p => {
  const np = { ...p.permissions };
  const k = tabKey(m, t, cap);
  if (val) np[k] = true; else delete np[k];
  // Bỏ "view" -> bỏ luôn các cap khác của tab đó
  if (cap === 'view' && !val) {
    for (const c of ALL_CAPS) if (c !== 'view') delete np[tabKey(m, t, c)];
  }
  return { ...p, permissions: np };
});
const bulkModule = (mod, mode) => setF(p => {
  const np = { ...p.permissions };
  for (const t of mod.tabs) for (const c of t.caps) {
    const k = tabKey(mod.module, t.id, c);
    if (mode === 'clear') delete np[k];
    else if (mode === 'view') { if (c === 'view') np[k] = true; else delete np[k]; }
    else if (mode === 'all') np[k] = true;
  }
  return { ...p, permissions: np };
});
```

- [ ] **Step 4: Render ma trận thay 2 khối cũ**

Thay block `f.role !== ROLE.ADMIN && h('div',{...}, Section1, Section2)` (dòng ~411–426) bằng:
```js
f.role !== ROLE.ADMIN && h('div',{style:{marginTop:'0.75rem',paddingTop:'0.75rem',borderTop:'1px solid #e2e8f0'}},
  PERM_REGISTRY.map(mod => {
    const onCount = mod.tabs.filter(t => tabOn(mod.module, t.id, 'view')).length;
    return h('details', {key:mod.module, style:sectionStyle, open: mod.module==='kho' ? false : false},
      h('summary', {style:{cursor:'pointer',fontSize:'0.8rem',fontWeight:700,color:'#334155',display:'flex',alignItems:'center',gap:'0.4rem'}},
        h('span',null, mod.icon+' '+mod.label),
        h('span',{style:{color:'#94a3b8',fontWeight:400}}, ` — ${onCount}/${mod.tabs.length} tab`),
      ),
      h('div',{style:{display:'flex',gap:'0.3rem',margin:'0.4rem 0'}},
        h('button',{type:'button',onClick:()=>bulkModule(mod,'view'),className:'text-xs px-2 py-0.5 rounded bg-slate-100'},'Chỉ xem'),
        h('button',{type:'button',onClick:()=>bulkModule(mod,'all'),className:'text-xs px-2 py-0.5 rounded bg-blue-100'},'Toàn quyền'),
        h('button',{type:'button',onClick:()=>bulkModule(mod,'clear'),className:'text-xs px-2 py-0.5 rounded bg-slate-100'},'Bỏ chọn'),
      ),
      // Header cột
      h('div',{style:{display:'grid',gridTemplateColumns:'1.6fr repeat(5, 1fr)',gap:'0.2rem',fontSize:'0.65rem',color:'#64748b',fontWeight:600,padding:'0.2rem 0'}},
        h('span',null,'Tab'), ...ALL_CAPS.map(c => h('span',{key:c,style:{textAlign:'center'}}, CAP_LABEL[c])),
      ),
      // Hàng tab
      mod.tabs.map(t => h('div',{key:t.id, style:{display:'grid',gridTemplateColumns:'1.6fr repeat(5, 1fr)',gap:'0.2rem',alignItems:'center',padding:'0.15rem 0'}},
        h('span',{style:{fontSize:'0.7rem',color:'#0f172a'}}, t.label),
        ...ALL_CAPS.map(c => {
          if (!t.caps.includes(c)) return h('span',{key:c,style:{textAlign:'center',color:'#cbd5e1'}}, '—');
          const disabled = c !== 'view' && !tabOn(mod.module, t.id, 'view');
          return h('span',{key:c,style:{textAlign:'center'}},
            h('input',{type:'checkbox', disabled, checked:tabOn(mod.module,t.id,c),
              onChange:e=>setTab(mod.module,t.id,c,e.target.checked),
              style:{width:'14px',height:'14px',accentColor:'#2563eb',opacity:disabled?0.4:1}}),
          );
        }),
      )),
    );
  }),
)
```

- [ ] **Step 5: Verify trên preview**

Theo `qlsx-preview-verification` (login admin). Mở Quản lý nhân viên → Sửa 1 nhân viên thường → xác nhận ma trận hiện 7 phân hệ gập được, tick "Xem" mở khoá các cột tác vụ, "Toàn quyền/Chỉ xem/Bỏ chọn" hoạt động, đếm "x/y tab" đúng. Lưu → mở lại thấy giữ đúng tick.

Run kèm: `npm run lint` (không lỗi mới).

---

## Phase 3 — Gài quyền module Kho

### Task 5: KhoHangApp — lọc tab + perms per-tab

**Files:**
- Modify: `src/pages/kho/KhoHangApp.jsx`

- [ ] **Step 1: Import helper**

Đổi import dòng 5:
```js
import { useAuth, getTabPerm, canSeeTab } from '../../lib/AuthContext';
```

- [ ] **Step 2: Tính perms theo tab đang mở + lọc danh sách tab**

Thay block `perms` (dòng ~563–568) bằng:
```js
const { user } = useAuth();
// perms của TAB đang mở, kèm alias tương thích các tab component cũ (edit/catalog/del/order)
const tp = getTabPerm(user, 'kho', activeTab);
const perms = {
  ...tp,
  edit: tp.create || tp.edit || tp.io, // tab Kho cũ gộp thêm/sửa/nhập-xuất vào 'edit'
  catalog: tp.create || tp.edit,       // danh-muc/bom dùng 'catalog'
  del: tp.delete,
  order: tp.create || tp.edit,         // dksx/de-xuat/ton-kho-tong dùng 'order'
};
```
> Ghi chú: alias giữ các tab component Kho hiện tại chạy ngay (chúng đọc `perms.edit/catalog/del/order`). Cap chi tiết (`tp.create` vs `tp.edit`) có sẵn cho tinh chỉnh sau ở Task 6.

- [ ] **Step 3: Lọc `ALL_TABS` chỉ còn tab có quyền xem**

Tìm nơi build danh sách tab hiển thị (dùng `ALL_TABS` + `tabsConfig`). Thêm bộ lọc `canSeeTab`. Cụ thể, ngay sau `const tabsConfig = ...` (quanh dòng 576–581), thêm:
```js
const visibleTabIds = ALL_TABS.filter(t => canSeeTab(user, 'kho', t.id)).map(t => t.id);
```
Rồi ở mọi chỗ render danh sách tab (menu grid dòng ~810, picker dòng ~770, thanh tab) bọc thêm điều kiện `visibleTabIds.includes(tConfig.id)` / `.includes(tabDef.id)`.

- [ ] **Step 4: Nếu tab đang mở mất quyền → về menu**

Sau khai báo `visibleTabIds`, thêm effect:
```js
useEffect(() => {
  if (activeTab !== 'menu' && !visibleTabIds.includes(activeTab)) setActiveTab('menu');
}, [activeTab, visibleTabIds]);
```

- [ ] **Step 5: Verify preview**

Login admin → tạo nhân viên test `NVTEST` (mật khẩu bất kỳ) chỉ tick `tab.kho.ton-kho-so-sach.view` + `tab.kho.danh-muc.view/edit`. Đăng nhập NVTEST → vào Kho → chỉ thấy 2 tab đó; "Tồn kho sổ sách" không nút sửa; "Danh mục" có nút Sửa, không có Xóa. Các tab khác ẩn. (Theo `qlsx-preview-verification` để login.)

### Task 6: Chuẩn hoá nút trong từng tab Kho (tách Thêm/Sửa/N-X)

> Mục tiêu: thay vì alias gộp, dùng đúng cap chi tiết. Mỗi tab component nhận prop `perms` đã chứa `{view,create,edit,delete,io}` (Task 5 đã truyền). Sửa các nút theo bảng map dưới. Mỗi file là một step độc lập.

**Bảng map nút → cap** (áp khi mở từng file):
- Nút **Thêm/Thêm mới/Gửi đề xuất/Làm phiếu SX/Tạo** → `perms.create`
- Nút **Sửa/Lưu chỉnh sửa** → `perms.edit`
- Nút **Xóa/Hủy** → `perms.delete`
- Nút **Import/Export/Nhập Excel/Xuất Excel** → `perms.io`

- [ ] **Step 1: `CatalogTab.jsx` + `BomTab.jsx`** — đổi `perms.catalog` → tách: nút Thêm dùng `perms.create`, Sửa dùng `perms.edit`, Import/Export dùng `perms.io`, Xóa dùng `perms.delete`. Mở file, tìm các `perms.catalog`/`perms.del` và thay theo bảng.
- [ ] **Step 2: `InventoryTab.jsx` + `WipStockTab.jsx`** — đổi `perms.edit`(gộp) → Thêm=`perms.create`, Sửa=`perms.edit`, Import=`perms.io`, Xóa=`perms.delete`.
- [ ] **Step 3: `ImportStockTab.jsx` + `ProductionOrderTab.jsx`** — màn chọn loại phiếu & nút commit: tạo phiếu=`perms.create`, sửa=`perms.edit`.
- [ ] **Step 4: `SaveExportTab.jsx`** (tab "Lưu xuất"/"Dữ liệu xuất") — Sửa=`perms.edit`, Import=`perms.io`, Xóa=`perms.delete`.
- [ ] **Step 5: `StockSummaryTab.jsx`** (Tồn HH) — nút "Gửi đề xuất"=`perms.create`; Export=`perms.io`.
- [ ] **Step 6: `DKSXTab.jsx`** — "Làm phiếu SX"=`perms.create`; "Hủy"=`perms.delete`.
- [ ] **Step 7: `OrderProposalTab.jsx`** — input + "Nhập" = `perms.create`/`perms.edit`; "Hủy"=`perms.delete`; "Xóa"=`perms.delete`.
- [ ] **Step 8: `PrintQueueTab.jsx`** (Quản Lý Chứng Từ) — tạo chứng từ=`perms.create`; Xóa=`perms.delete`.
- [ ] **Step 9: Verify preview** — với NVTEST cấp `tab.kho.danh-muc.create` (không `edit`) → thấy nút Thêm, ẩn nút Sửa. Đảo lại để xác nhận tách đúng. `npm run lint` không lỗi mới.

> Nếu một tab Kho không phân biệt rõ Thêm vs Sửa trong UI hiện tại (cùng 1 form), gán cả 2 nút mở form đó theo `perms.create || perms.edit` và nút Lưu cuối form theo hành động thực (record mới=create, sửa=edit). Ghi log nếu không tách được sạch.

---

## Phase 4 — Module Công Việc

### Task 7: TaskApp — gate tab + nút theo cap

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx`

- [ ] **Step 1: Import + tính perms**

Cạnh import permRegistry (Task 4), thêm `canSeeTab, getTabPerm` từ AuthContext. Trong component chính (nơi có `me`), thêm:
```js
const tPerm = getTabPerm(me, 'tasks', 'tasks'); // {view,create,edit,delete}
```

- [ ] **Step 2: Đổi điều kiện tab (dòng ~1184–1188 và menu ~1208–1221)**

Thay `hasPerm(me,'view_dashboard')` → `canSeeTab(me,'tasks','dashboard')`, `hasPerm(me,'view_tasks')` → `canSeeTab(me,'tasks','tasks')`, và tab Báo Cáo dùng `canSeeTab(me,'tasks','work_report')`.

- [ ] **Step 3: Gate nút tạo/sửa/xóa việc**

Tìm các nút và điều kiện cũ `hasPerm(me,'create_task')` → `tPerm.create`; `edit_task` → `tPerm.edit`; `delete_task` → `tPerm.delete`. (Các quyền phụ như change_status/add_update giữ nguyên key cũ — không thuộc CRUD chuẩn.)

- [ ] **Step 4: Verify preview** — NVTEST cấp `tab.tasks.tasks.view`+`edit` (không create) → thấy Công việc, sửa được, không có nút tạo mới. `npm run lint`.

---

## Phase 5 — Bảo Hành + CSKH

### Task 8: WarrantyApp

**Files:**
- Modify: `src/pages/warranty/WarrantyApp.jsx` (+ `WarrantyDataManager.jsx`, `BatchAnalytics.jsx` cho nút)

- [ ] **Step 1:** Import `canSeeTab, useTabPerm`. Lọc 3 tab (`history`, `batchAnalytics`, `dataManager`) ở mảng tabs (dòng ~311–313) và menu bằng `canSeeTab(user,'warranty',id)`.
- [ ] **Step 2:** Trong `WarrantyDataManager`: nút Thêm=`create`, Sửa=`edit`, Xóa=`delete`, Import/Export=`io` (dùng `useTabPerm('warranty','dataManager')`); trong `history` tương tự với `useTabPerm('warranty','history')`; `BatchAnalytics` Export=`io`.
- [ ] **Step 3: Verify preview** — NVTEST cấp chỉ `tab.warranty.batchAnalytics.view` → chỉ thấy Phân Tích Lỗi, không thấy 2 tab kia. `npm run lint`.

### Task 9: CskhApp

**Files:**
- Modify: `src/pages/cskh/CskhApp.jsx` (+ `ZaloKpiTab.jsx`, `ZaloReportTab.jsx`)

- [ ] **Step 1:** Thay `canViewKpi` (dòng ~202, 219) bằng `canSeeTab(user,'cskh','zalo_kpi')`. Lọc tab `dashboard`/`zalo_report` bằng `canSeeTab` tương ứng.
- [ ] **Step 2:** `ZaloKpiTab`: dùng `useTabPerm('cskh','zalo_kpi')` — "Đánh dấu đã xử lý"=`edit`, Xóa=`delete`, Xuất Excel=`io` (lọc nâng cao không cần quyền). `ZaloReportTab`: Thêm=`create`, Sửa=`edit`, Xóa=`delete`.
- [ ] **Step 3: Verify preview** — NVTEST cấp `tab.cskh.zalo_kpi.view` (không edit/delete) → thấy KPI, không nút đánh dấu/xóa. `npm run lint`.

---

## Phase 6 — Chất Lượng + Sản Xuất + Tổng Quan + menu phân hệ

### Task 10: QualityApp + Production + Overview

**Files:**
- Modify: `src/pages/quality/QualityApp.jsx`, app Sản Xuất (`WorkerInput.jsx`/màn sản xuất), Tổng Quan (`AdminDashboard.jsx`/`TvDashboard.jsx`/`WorkerDashboard.jsx`)

- [ ] **Step 1: Quality** — thay `canEdit/canDelete` (đang đọc `quality_edit/quality_delete`) bằng `useTabPerm('quality','main')`: Thêm/Sửa=`create`/`edit`, Xóa=`delete`, Import/Export=`io`.
- [ ] **Step 2: Production** — gate vào module bằng `canSeeModule(user,'production')`; các nút nhập liệu theo `useTabPerm('production','main')`.
- [ ] **Step 3: Overview** — gate bằng `canSeeModule(user,'overview')`; Export=`io`.
- [ ] **Step 4: Verify preview** mỗi module với NVTEST. `npm run lint`.

### Task 11: Menu phân hệ (HomePage)

**Files:**
- Modify: `src/pages/HomePage.jsx`

- [ ] **Step 1:** Import `canSeeModule` từ AuthContext. Với mỗi ô phân hệ, thay điều kiện hiển thị `hasModule(...)`/`hasPerm(access_*)` cũ bằng `canSeeModule(user, '<module>')`. Map: Tổng Quan→`overview`, Công Việc→`tasks`, Sản Xuất→`production`, Bảo Hành→`warranty`, CSKH→`cskh`, Kho→`kho`, Chất Lượng→`quality`.
- [ ] **Step 2: Verify preview** — NVTEST chỉ có vài tab Kho → trang chủ chỉ hiện ô "Kho Hàng", các phân hệ khác ẩn. Admin thấy đủ.
- [ ] **Step 3:** Build cuối: `npm run build` thành công; `npm test` PASS; `npm run lint` không lỗi mới.

---

## Phase 7 — Dọn & memory

### Task 12: Cập nhật memory

- [ ] **Step 1:** Cập nhật file memory `qlsx-kho-quality-permissions.md` (và thêm pointer trong `MEMORY.md` nếu cần) mô tả mô hình mới 3 cấp `tab.<module>.<tabId>.<cap>`, registry `src/lib/permRegistry.js`, hook `useTabPerm`, hàm `migrateLegacyToTabPerms`, và lưu ý vẫn chỉ chặn client-side.
- [ ] **Step 2:** Xoá nhân viên test `NVTEST` khỏi DB (nếu đã tạo) để không để lại rác.

---

## Self-Review (đã rà)

- **Spec coverage:** Mục 3 registry→Task 2; mục 4 lưu trữ/migrate→Task 2–4; mục 5 UI ma trận→Task 4; mục 6 gài từng module→Task 5–11; mục 7 default→Task 3 Step 2; mục 8 lộ trình→Phase 0–7; mục 9 kiểm thử→các Step Verify; mục 10 rủi ro→ghi chú Task 6.
- **Placeholder scan:** code lõi (Task 1–4) đầy đủ. Task 6/8/9/10 cố ý ở mức "mở file + áp bảng map nút→cap" vì button gating là cơ học theo bảng đã cho — KHÔNG phải TBD; mỗi step nêu rõ file, cap, và cách map. Executor đọc từng file lúc thực thi.
- **Type consistency:** tên hàm thống nhất `getTabPerm/canSeeTab/canSeeModule/tabKey/migrateLegacyToTabPerms/emptyTabPerms`; cap luôn `view/create/edit/delete/io`; key luôn `tab.<module>.<tabId>.<cap>`.
