import { test, expect, describe } from 'vitest';
import {
  PERM_REGISTRY, tabKey, getTabPerm, canSeeTab, canSeeModule,
  migrateLegacyToTabPerms, emptyTabPerms, CAP_LABEL, ALL_CAPS,
} from './permRegistry';

describe('registry shape', () => {
  test('mọi tab có id, label, caps không rỗng', () => {
    for (const m of PERM_REGISTRY) {
      expect(m.module).toBeTruthy();
      for (const t of m.tabs) {
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.caps.length).toBeGreaterThan(0);
        expect(t.caps).toContain('view');
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
    const p = getTabPerm(admin, 'kho', 'ton-kho-so-sach');
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

describe('tab xuLy của Bảo Hành', () => {
  test('module warranty có tab xuLy với đủ 7 cap (gồm sendForm + cancelLan)', () => {
    const warranty = PERM_REGISTRY.find(m => m.module === 'warranty');
    const xuLy = warranty.tabs.find(t => t.id === 'xuLy');
    expect(xuLy).toBeTruthy();
    expect(xuLy.label).toBe('Xử Lý Phiếu');
    expect(xuLy.caps).toEqual(['view', 'create', 'edit', 'delete', 'io', 'sendForm', 'cancelLan']);
  });
  test('cap mới có nhãn + getTabPerm trả về sendForm/cancelLan', () => {
    expect(CAP_LABEL.sendForm).toBe('Gửi Form');
    expect(CAP_LABEL.cancelLan).toBe('Hủy Lần');
    expect(ALL_CAPS).toContain('sendForm');
    expect(ALL_CAPS).toContain('cancelLan');
    const admin = getTabPerm({ role: 'ADMIN' }, 'warranty', 'xuLy');
    expect(admin.sendForm).toBe(true);
    expect(admin.cancelLan).toBe(true);
    const staff = getTabPerm({ role: 'AGENT', permissions: { 'tab.warranty.xuLy.edit': true } }, 'warranty', 'xuLy');
    expect(staff.edit).toBe(true);
    expect(staff.sendForm).toBe(false); // quyền tách riêng — không tự suy từ edit
    expect(staff.cancelLan).toBe(false);
    const granted = getTabPerm({ role: 'AGENT', permissions: { 'tab.warranty.xuLy.sendForm': true } }, 'warranty', 'xuLy');
    expect(granted.sendForm).toBe(true);
  });
});

describe('cancelDoc cap (Hủy Phiếu)', () => {
  test('print_queue có cap cancelDoc; admin mặc định được', () => {
    const admin = { role: 'ADMIN', permissions: {} };
    expect(getTabPerm(admin, 'kho', 'print_queue').cancelDoc).toBe(true);
  });
  test('user thường chỉ được khi tick đúng key', () => {
    const u = { role: 'USER', permissions: { 'tab.kho.print_queue.view': true } };
    expect(getTabPerm(u, 'kho', 'print_queue').cancelDoc).toBe(false);
    const u2 = { role: 'USER', permissions: { 'tab.kho.print_queue.cancelDoc': true } };
    expect(getTabPerm(u2, 'kho', 'print_queue').cancelDoc).toBe(true);
  });
});

describe('tab KPI', () => {
  test('có trong module tasks với đủ 4 cap', () => {
    const tasks = PERM_REGISTRY.find(m => m.module === 'tasks');
    const kpi = tasks.tabs.find(t => t.id === 'kpi');
    expect(kpi).toBeDefined();
    expect(kpi.label).toBe('KPI');
    expect(kpi.caps).toEqual(['view', 'create', 'edit', 'io']);
  });

  test('admin mặc định có mọi cap; user thường phải tick đúng key', () => {
    expect(getTabPerm({ role: 'ADMIN', permissions: {} }, 'tasks', 'kpi').edit).toBe(true);
    const u = { role: 'USER', permissions: { 'tab.tasks.kpi.view': true } };
    expect(getTabPerm(u, 'tasks', 'kpi').view).toBe(true);
    expect(getTabPerm(u, 'tasks', 'kpi').edit).toBe(false);
  });
});
