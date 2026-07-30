import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { attachmentPath, signAttachmentUrl } from './attachmentSignedUrl';

const BASE = 'https://ngwkzicrnspeggunsblr.supabase.co/storage/v1/object/public/task-attachments/';

describe('attachmentPath', () => {
  it('ưu tiên dùng path có sẵn', () => {
    expect(attachmentPath({ path: 'tasks/2026-07/ab12cd34ef.webp', url: BASE + 'khac.webp' }))
      .toBe('tasks/2026-07/ab12cd34ef.webp');
  });
  it('tách path khỏi url công khai khi bản ghi cũ không có path', () => {
    expect(attachmentPath({ url: BASE + 'progress/2026-07/9f3a1b.webp' }))
      .toBe('progress/2026-07/9f3a1b.webp');
  });
  it('giải mã ký tự đã encode và bỏ query', () => {
    expect(attachmentPath({ url: BASE + 'tasks/2026-07/a%20b.pdf?x=1' })).toBe('tasks/2026-07/a b.pdf');
  });
  it('trả rỗng khi không có gì để lần', () => {
    expect(attachmentPath(null)).toBe('');
    expect(attachmentPath({})).toBe('');
    expect(attachmentPath({ url: 'https://khac.example/f.png' })).toBe('');
  });
});

describe('signAttachmentUrl', () => {
  beforeEach(() => { createSignedUrl.mockReset(); });

  it('ký theo path và trả link ký', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/ta/f.webp?token=t' }, error: null });
    const url = await signAttachmentUrl({ path: 'tasks/2026-07/f.webp' });
    expect(url).toBe('https://x/sign/ta/f.webp?token=t');
    expect(createSignedUrl).toHaveBeenCalledWith('tasks/2026-07/f.webp', 3600);
  });

  it('đệm link — 2 lần cùng path chỉ ký 1 lần', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/ta/g.webp?token=t' }, error: null });
    await signAttachmentUrl({ path: 'tasks/2026-07/g.webp' });
    await signAttachmentUrl({ path: 'tasks/2026-07/g.webp' });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('ném lỗi khi Storage trả lỗi', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('Object not found') });
    await expect(signAttachmentUrl({ path: 'tasks/2026-07/h.webp' })).rejects.toThrow('Object not found');
  });

  it('ném lỗi khi không lần ra path — không gọi Storage', async () => {
    await expect(signAttachmentUrl({ url: 'https://khac.example/f.png' })).rejects.toThrow('Không xác định được đường dẫn');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
