import { describe, it, expect, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import WorkerDashboard from './WorkerDashboard';
import { NHAN_BO_LOC } from '../lib/locPhieuSanXuat';

// Test chạy trên node (không có DOM). Component đọc tên thợ từ localStorage lúc
// render, nên cần bản giả tối thiểu — đọc gì cũng trả null để rơi về mặc định.
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

// Render tĩnh (useEffect KHÔNG chạy) nên không chạm Supabase — đủ để kiểm chứng
// thanh lọc luôn hiện, kể cả lúc danh sách còn đang tải.
const markup = () => renderToStaticMarkup(
  <MemoryRouter><WorkerDashboard /></MemoryRouter>
);

const text = () => markup().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('WorkerDashboard — thanh lọc phiếu', () => {
  it('hiện đủ 3 nút lọc theo đúng thứ tự', () => {
    const t = text();
    const viTri = ['Tất cả', 'Hoàn thành', 'Đang làm'].map(n => t.indexOf(n));
    expect(viTri.every(i => i >= 0)).toBe(true);
    expect(viTri).toEqual([...viTri].sort((a, b) => a - b));
  });

  it('mặc định chọn "Đang làm" — giữ đúng nội dung màn hình vốn có', () => {
    // Nút đang chọn là nút duy nhất mang aria-pressed="true".
    const nutDangChon = markup().split('<button').find(s => s.includes('aria-pressed="true"'));
    expect(nutDangChon).toBeDefined();
    expect(nutDangChon).toContain('Đang làm');
  });

  it('mọi nút lọc đều bấm được và có số đếm', () => {
    const nut = markup().split('<button').filter(s => s.includes('aria-pressed'));
    expect(nut).toHaveLength(3);
    // Danh sách rỗng lúc chưa tải → cả 3 nút hiện số 0, không phải undefined/NaN.
    expect(text()).not.toMatch(/undefined|NaN/);
  });

  it('thanh lọc KHÔNG cuộn ngang — chia đều bề ngang, cột co được', () => {
    const html = markup();
    expect(html).not.toMatch(/overflow-x\s*:\s*auto/);
    // minmax(0,1fr) là thứ cho phép cột hẹp hơn nội dung; thiếu nó là tràn ngang.
    expect(html).toMatch(/grid-template-columns\s*:\s*repeat\(3\s*,\s*minmax\(0\s*,\s*1fr\)\)/);
  });

  it('chữ trên nút LUÔN 1 dòng — nowrap + cắt bằng "…", cỡ chữ co theo màn hình', () => {
    const nut = markup().split('<button').filter(s => s.includes('aria-pressed'));
    expect(nut).toHaveLength(3);
    for (const s of nut) {
      expect(s).toMatch(/white-space\s*:\s*nowrap/);       // cấm xuống dòng thứ 2
      expect(s).toMatch(/text-overflow\s*:\s*ellipsis/);   // dài quá thì cắt, không tràn
      expect(s).toMatch(/font-size\s*:\s*clamp\(/);        // co theo bề ngang máy
    }
  });

  it('nhãn đủ ngắn để không phải cắt chữ trên máy hẹp', () => {
    // Đo thực tế: máy 320px → mỗi nút ~92px, chừa cho chữ ~58px ở cỡ 9.9px.
    // Nhãn quá 10 ký tự là bắt đầu bị "…" — chặn ngay từ test thay vì để lộ ngoài xưởng.
    for (const { label } of NHAN_BO_LOC) {
      expect(label.length).toBeLessThanOrEqual(10);
    }
  });
});
