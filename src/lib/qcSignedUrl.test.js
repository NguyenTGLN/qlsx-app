import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { tachTenFile, laVideo, signQcUrl } from './qcSignedUrl';

const BASE = 'https://ngwkzicrnspeggunsblr.supabase.co/storage/v1/object/public/qc_images/';

describe('tachTenFile', () => {
  it('tách tên file khỏi link công khai đã lưu trong database', () => {
    expect(tachTenFile(BASE + '1777263245187_lvkc3r.png')).toBe('1777263245187_lvkc3r.png');
    expect(tachTenFile(BASE + 'sol_1777263251215_x6mhb.mp4')).toBe('sol_1777263251215_x6mhb.mp4');
  });
  it('giải mã ký tự đã encode trong tên file', () => {
    expect(tachTenFile(BASE + 'a%20b.png')).toBe('a b.png');
  });
  it('bỏ query string nếu có', () => {
    expect(tachTenFile(BASE + 'x.png?t=123')).toBe('x.png');
  });
  it('nhận tên file trần (không phải link)', () => {
    expect(tachTenFile('issue_123_abc.png')).toBe('issue_123_abc.png');
  });
  it('trả rỗng cho link không thuộc qc_images, null, rỗng', () => {
    expect(tachTenFile('https://khac.example/anh.png')).toBe('');
    expect(tachTenFile(null)).toBe('');
    expect(tachTenFile('')).toBe('');
  });
});

describe('laVideo', () => {
  it('nhận diện đuôi video trên link gốc', () => {
    expect(laVideo(BASE + 'v.mp4')).toBe(true);
    expect(laVideo(BASE + 'v.mov')).toBe(true);
    expect(laVideo(BASE + 'a.png')).toBe(false);
  });
  it('vẫn đúng khi link có query string (link ký)', () => {
    expect(laVideo('https://x/sign/qc_images/v.mp4?token=abc')).toBe(true);
    expect(laVideo('https://x/sign/qc_images/a.webp?token=abc')).toBe(false);
  });
  it('không vỡ với null/rỗng', () => {
    expect(laVideo(null)).toBe(false);
    expect(laVideo('')).toBe(false);
  });
});

describe('signQcUrl', () => {
  beforeEach(() => { createSignedUrl.mockReset(); });

  it('xin link ký từ tên file tách được', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/qc_images/f1.png?token=t' }, error: null });
    const url = await signQcUrl(BASE + 'f1.png');
    expect(url).toBe('https://x/sign/qc_images/f1.png?token=t');
    expect(createSignedUrl).toHaveBeenCalledWith('f1.png', 300);
  });

  it('đệm link ký — gọi 2 lần cùng file chỉ xin 1 lần', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/qc_images/f2.png?token=t2' }, error: null });
    await signQcUrl(BASE + 'f2.png');
    await signQcUrl(BASE + 'f2.png');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('ném lỗi khi Supabase trả lỗi — không nuốt im lặng', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('Object not found') });
    await expect(signQcUrl(BASE + 'f3.png')).rejects.toThrow('Object not found');
  });

  it('ném lỗi khi không tách được tên file', async () => {
    await expect(signQcUrl('https://khac.example/x.png')).rejects.toThrow('Không tách được tên file');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
