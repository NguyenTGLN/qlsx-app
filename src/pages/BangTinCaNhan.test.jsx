import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { tabKey } from '../lib/permRegistry';

// Người đăng nhập giả — đổi được giữa các test. Chỉ thay `useAuth`, giữ nguyên
// `canSeeTab` thật để test chạy đúng luật phân quyền của app, không phải luật bịa.
let nguoiDung = null;
vi.mock('../lib/AuthContext', async (importOriginal) => {
  const goc = await importOriginal();
  return { ...goc, useAuth: () => ({ user: nguoiDung, logout: () => {} }) };
});

const BangTinCaNhan = (await import('./BangTinCaNhan')).default;

const KPI = tabKey('tasks', 'kpi', 'view');
const VIEC = tabKey('tasks', 'tasks', 'view');
const nv = (...caps) => ({
  id: 'nv', name: 'Thơ', role: 'AGENT',
  permissions: Object.fromEntries(caps.map(k => [k, true])),
});

// Render TĨNH: useEffect không chạy nên không có lời gọi Supabase nào.
// Đủ để kiểm chứng phần khung — gác quyền, nút Home, ô chọn kỳ, luật bề ngang.
const html = () => renderToStaticMarkup(
  <MemoryRouter><BangTinCaNhan /></MemoryRouter>
);
const chu = () => html().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => { nguoiDung = nv(KPI, VIEC); });

describe('gác quyền từng khối', () => {
  test('có cả hai quyền ⇒ hiện cả khối KPI lẫn khối Việc', () => {
    const t = chu();
    expect(t).toContain('KPI của tôi');
    expect(t).toContain('Việc đang làm');
  });

  test('chỉ có quyền KPI ⇒ KHÔNG hiện khối Việc', () => {
    nguoiDung = nv(KPI);
    const t = chu();
    expect(t).toContain('KPI của tôi');
    expect(t).not.toContain('Việc đang làm');
  });

  test('chỉ có quyền Việc ⇒ KHÔNG hiện khối KPI', () => {
    nguoiDung = nv(VIEC);
    const t = chu();
    expect(t).toContain('Việc đang làm');
    expect(t).not.toContain('KPI của tôi');
  });

  // Vào bằng cách gõ thẳng URL /ca-nhan. DiemDenDauTien đã đẩy nhóm này sang /home,
  // nhưng màn hình vẫn phải nói được chuyện gì đang xảy ra thay vì hiện khung trắng.
  test('không có quyền nào ⇒ nói rõ và chỉ sang nút Trang chủ', () => {
    nguoiDung = nv();
    const t = chu();
    expect(t).not.toContain('KPI của tôi');
    expect(t).not.toContain('Việc đang làm');
    expect(t).toContain('chưa được cấp quyền');
    expect(t).toContain('Trang chủ');
  });

  test('ADMIN xem được cả hai khối (canSeeTab mở hết cho ADMIN)', () => {
    nguoiDung = { id: 'admin', name: 'Nguyên', role: 'ADMIN', permissions: {} };
    const t = chu();
    expect(t).toContain('KPI của tôi');
    expect(t).toContain('Việc đang làm');
  });
});

describe('đường về Trang chủ — yêu cầu gốc của màn hình này', () => {
  test('có nút Home trỏ về /home', () => {
    // ModuleShell dựng nút Home với title="Trang chủ ứng dụng".
    expect(html()).toContain('Trang chủ ứng dụng');
  });
});

describe('chọn kỳ — "tháng này + xem được tháng khác"', () => {
  test('có ô chọn tháng, mặc định là kỳ hiện tại', () => {
    const d = new Date();
    const ky = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const h = html();
    expect(h).toContain('type="month"');
    expect(h).toContain(`value="${ky}"`);
  });

  test('ô chọn kỳ có nhãn cho trình đọc màn hình', () => {
    expect(html()).toContain('aria-label="Chọn kỳ KPI"');
  });

  test('không có quyền KPI ⇒ không có ô chọn kỳ', () => {
    nguoiDung = nv(VIEC);
    expect(html()).not.toContain('type="month"');
  });
});

describe('lúc chưa tải xong', () => {
  test('hiện "Đang tải" chứ không hiện 0 điểm hay "không có việc"', () => {
    const t = chu();
    expect(t).toContain('Đang tải');
    expect(t).not.toContain('Không có việc nào đang làm');
    expect(t).not.toContain('Chưa mất điểm nào');
  });

  test('không lộ undefined/NaN ra màn hình', () => {
    expect(chu()).not.toMatch(/undefined|NaN/);
  });
});

describe('luật giao diện: không cuộn ngang trên điện thoại', () => {
  const h = () => html();

  test('lưới hai khối co về 1 cột khi màn hình hẹp', () => {
    // minmax(min(100%, 320px), 1fr): dưới 320px thì cột co theo bề ngang máy,
    // không đẩy trang rộng ra. Dùng minmax(320px,…) trơn là cuộn ngang trên máy nhỏ.
    expect(h()).toContain('min(100%, 320px)');
  });

  test('tên chỉ tiêu và tên việc ngắt được trong từ, không đẩy khung rộng', () => {
    expect(h()).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test('thẻ có min-width 0 để nội dung dài không phá lưới', () => {
    expect(h()).toMatch(/min-width:\s*0/);
  });

  test('khung ngoài tính cả padding vào bề ngang (border-box)', () => {
    expect(h()).toMatch(/box-sizing:\s*border-box/);
  });
});

describe('chào hỏi', () => {
  test('gọi đúng tên người đăng nhập', () => {
    expect(chu()).toContain('Thơ');
  });

  test('không có tên thì vẫn chào được, không hiện "undefined"', () => {
    nguoiDung = { id: 'x', role: 'AGENT', permissions: { [KPI]: true } };
    const t = chu();
    expect(t).toContain('bạn');
    expect(t).not.toContain('undefined');
  });
});
