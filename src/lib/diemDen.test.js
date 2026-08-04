import { describe, test, expect } from 'vitest';
import { chonDiemDen } from './diemDen';
import { tabKey } from './permRegistry';

const nv = (...caps) => ({
  id: 'nv', role: 'AGENT',
  permissions: Object.fromEntries(caps.map(k => [k, true])),
});

const KPI = tabKey('tasks', 'kpi', 'view');
const VIEC = tabKey('tasks', 'tasks', 'view');

describe('chonDiemDen — màn hình đầu tiên khi mở app', () => {
  test.each([[null], [undefined]])('chưa đăng nhập (%s) ⇒ /login', (u) => {
    expect(chonDiemDen(u)).toBe('/login');
  });

  // Đã chốt 04/08/2026: tài khoản quản trị KHÔNG đổi thói quen mở app.
  // canSeeTab trả true cho mọi tab của ADMIN nên nếu hỏi sai thứ tự, admin sẽ bị
  // đẩy sang /ca-nhan — test này khoá đúng chuyện đó.
  test('ADMIN ⇒ /home, kể cả khi có đủ mọi quyền', () => {
    expect(chonDiemDen({ id: 'admin', role: 'ADMIN', permissions: {} })).toBe('/home');
  });

  test('nhân viên có quyền xem KPI ⇒ /ca-nhan', () => {
    expect(chonDiemDen(nv(KPI))).toBe('/ca-nhan');
  });

  test('nhân viên chỉ có quyền xem Công việc ⇒ /ca-nhan', () => {
    expect(chonDiemDen(nv(VIEC))).toBe('/ca-nhan');
  });

  test('nhân viên có cả hai ⇒ /ca-nhan', () => {
    expect(chonDiemDen(nv(KPI, VIEC))).toBe('/ca-nhan');
  });

  // Đo 04/08/2026: hangkt, nva, TGD, test rơi vào nhánh này.
  test('nhân viên không có khối nào ⇒ /home như hôm nay', () => {
    expect(chonDiemDen(nv())).toBe('/home');
  });

  test('quyền của phân hệ khác KHÔNG đủ để vào bảng tin', () => {
    expect(chonDiemDen(nv(tabKey('kho', 'nhap-kho', 'view')))).toBe('/home');
  });

  test('permissions thiếu hẳn ⇒ /home, không văng', () => {
    expect(chonDiemDen({ id: 'x', role: 'AGENT' })).toBe('/home');
  });

  test('role viết thường vẫn là nhân viên (AuthContext đã hoa hoá, đây là lưới an toàn)', () => {
    expect(chonDiemDen({ id: 'x', role: 'agent', permissions: { [KPI]: true } })).toBe('/ca-nhan');
  });
});

// Login.jsx điều hướng bằng giá trị `login()` trả về — bản THÔ, chưa chuyển quyền cũ.
// Nếu chonDiemDen không tự chuyển thì hai đường vào app đưa cùng một người tới hai chỗ
// khác nhau: mở app sẵn phiên thì vào /ca-nhan, vừa đăng nhập lại rơi về /home.
describe('quyền cũ (chưa có khoá tab.*) — hình dạng có thật trong CSDL', () => {
  test('view_tasks: true, 0 khoá tab.* ⇒ /ca-nhan (hình dạng của tài khoản TGD)', () => {
    expect(chonDiemDen({ id: 'TGD', role: 'AGENT', permissions: { view_tasks: true } }))
      .toBe('/ca-nhan');
  });

  test('view_tasks: false ⇒ /home (hình dạng của tài khoản hangkt)', () => {
    expect(chonDiemDen({
      id: 'hangkt', role: 'AGENT', permissions: { view_tasks: false, view_dashboard: false },
    })).toBe('/home');
  });

  test('access_tasks cũ mở mọi tab của phân hệ ⇒ /ca-nhan', () => {
    expect(chonDiemDen({ id: 'x', role: 'AGENT', permissions: { access_tasks: true } }))
      .toBe('/ca-nhan');
  });

  test('quyền cũ của phân hệ khác KHÔNG đưa vào bảng tin', () => {
    expect(chonDiemDen({ id: 'x', role: 'AGENT', permissions: { access_warehouse: true } }))
      .toBe('/home');
  });
});
