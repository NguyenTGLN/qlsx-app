import { describe, it, expect } from 'vitest';
import {
  kindOf, fmtSize, validateFile, warnFor, totalSize, planSelection,
  splitZaloAttachments, buildZaloAttachmentText,
  MAX_SIZE, MAX_COUNT, MAX_EMBED_IMAGES,
} from './attachments';

const img = (over = {}) => ({ url: 'https://x/a.webp', name: 'a.webp', mime: 'image/webp', kind: 'image', size: 200 * 1024, ...over });
const vid = (over = {}) => ({ url: 'https://x/v.mp4', name: 'v.mp4', mime: 'video/mp4', kind: 'video', size: 18 * 1024 * 1024, ...over });
const doc = (over = {}) => ({ url: 'https://x/d.pdf', name: 'd.pdf', mime: 'application/pdf', kind: 'file', size: 128 * 1024, ...over });

describe('kindOf', () => {
  it('phân loại theo tiền tố mime', () => {
    expect(kindOf('image/jpeg')).toBe('image');
    expect(kindOf('image/webp')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('video/quicktime')).toBe('video');
    expect(kindOf('application/pdf')).toBe('file');
  });
  it('không phân biệt hoa thường', () => {
    expect(kindOf('IMAGE/PNG')).toBe('image');
    expect(kindOf('Video/MP4')).toBe('video');
  });
  it('mime rỗng/thiếu coi là file', () => {
    expect(kindOf('')).toBe('file');
    expect(kindOf(null)).toBe('file');
    expect(kindOf(undefined)).toBe('file');
  });
});

describe('fmtSize', () => {
  it('dưới 1MB hiện KB', () => {
    expect(fmtSize(200 * 1024)).toBe('200KB');
    expect(fmtSize(128374)).toBe('125KB');
  });
  it('từ 1MB trở lên hiện MB, bỏ đuôi .0', () => {
    expect(fmtSize(18 * 1024 * 1024)).toBe('18MB');
    expect(fmtSize(1.5 * 1024 * 1024)).toBe('1.5MB');
  });
  it('giá trị rỗng/không hợp lệ về 0KB', () => {
    expect(fmtSize(0)).toBe('0KB');
    expect(fmtSize(null)).toBe('0KB');
    expect(fmtSize(undefined)).toBe('0KB');
  });
});

describe('validateFile', () => {
  it('chấp nhận file trong hạn', () => {
    expect(validateFile({ name: 'a.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' }, [])).toEqual({ ok: true });
  });
  it('chấp nhận file đúng bằng 25MB', () => {
    expect(validateFile({ name: 'v.mp4', size: MAX_SIZE, type: 'video/mp4' }, []).ok).toBe(true);
  });
  it('chặn file vượt 25MB', () => {
    const r = validateFile({ name: 'v.mp4', size: MAX_SIZE + 1, type: 'video/mp4' }, []);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('File vượt 25MB');
  });
  it('chặn khi đã đủ 10 file', () => {
    const current = Array.from({ length: MAX_COUNT }, () => img());
    const r = validateFile({ name: 'a.jpg', size: 1024, type: 'image/jpeg' }, current);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Tối đa 10 file mỗi việc');
  });
  it('còn 9 file thì vẫn nhận thêm 1', () => {
    const current = Array.from({ length: MAX_COUNT - 1 }, () => img());
    expect(validateFile({ name: 'a.jpg', size: 1024, type: 'image/jpeg' }, current).ok).toBe(true);
  });
});

describe('warnFor', () => {
  it('cảnh báo file từ 10MB đến 25MB', () => {
    expect(warnFor({ size: 18 * 1024 * 1024, type: 'video/mp4' })).toBe('Video 18MB — tải lên có thể lâu trên 4G');
    expect(warnFor({ size: 12 * 1024 * 1024, type: 'application/pdf' })).toBe('File 12MB — tải lên có thể lâu trên 4G');
  });
  it('không cảnh báo file nhỏ', () => {
    expect(warnFor({ size: 2 * 1024 * 1024, type: 'image/jpeg' })).toBe(null);
    expect(warnFor({ size: 9.9 * 1024 * 1024, type: 'video/mp4' })).toBe(null);
  });
});

// Chọn NHIỀU file cùng lúc: hạn 10 file phải tính dồn trong một lần chọn.
// Bug thật đã gặp: component đọc số file đang tải từ React state, mà state chưa kịp cập nhật
// trong vòng lặp đồng bộ → chọn 11 file một lúc thì lọt cả 11.
describe('planSelection', () => {
  const f = (name, size = 1024, type = 'image/jpeg') => ({ name, size, type });

  it('chọn 11 file một lúc thì chỉ nhận 10, file thứ 11 bị chặn', () => {
    const files = Array.from({ length: 11 }, (_, i) => f(`anh-${i + 1}.jpg`));
    const r = planSelection(files, []);
    expect(r.accepted).toHaveLength(MAX_COUNT);
    expect(r.accepted.at(-1).name).toBe('anh-10.jpg');
    expect(r.errors).toEqual(['anh-11.jpg: Tối đa 10 file mỗi việc']);
  });

  it('tính dồn cả file đã có sẵn', () => {
    const current = Array.from({ length: 8 }, () => img());
    const r = planSelection([f('a.jpg'), f('b.jpg'), f('c.jpg')], current);
    expect(r.accepted.map(x => x.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(r.errors).toEqual(['c.jpg: Tối đa 10 file mỗi việc']);
  });

  it('file quá to bị loại nhưng không chặn các file hợp lệ sau nó', () => {
    const r = planSelection([f('to.mp4', MAX_SIZE + 1, 'video/mp4'), f('ok.jpg')], []);
    expect(r.accepted.map(x => x.name)).toEqual(['ok.jpg']);
    expect(r.errors).toEqual(['to.mp4: File vượt 25MB']);
  });

  it('gom cảnh báo cho file lớn nhưng vẫn nhận', () => {
    const r = planSelection([f('v.mp4', 18 * 1024 * 1024, 'video/mp4')], []);
    expect(r.accepted).toHaveLength(1);
    expect(r.warnings).toEqual(['v.mp4 — Video 18MB — tải lên có thể lâu trên 4G']);
  });

  it('không chọn gì thì không có lỗi', () => {
    expect(planSelection([], [])).toEqual({ accepted: [], errors: [], warnings: [] });
  });
});

describe('totalSize', () => {
  it('cộng dung lượng cả danh sách', () => {
    expect(totalSize([img({ size: 100 }), vid({ size: 200 })])).toBe(300);
  });
  it('danh sách rỗng/null về 0', () => {
    expect(totalSize([])).toBe(0);
    expect(totalSize(null)).toBe(0);
  });
});

// Thiết kế Zalo v2 (2026-07-16): ảnh KHÔNG gửi thành tin nhắn riêng nữa — chúng được
// NHÚNG vào lưới trong thẻ HTML (HCTI render), cả 10 ảnh vẫn chỉ là 1 tin nhắn.
// links = video/file (+ ảnh vượt hạn nhúng MAX_EMBED_IMAGES, phòng hờ).
describe('splitZaloAttachments', () => {
  it('mọi ảnh vào nhóm nhúng, video và file rơi xuống link', () => {
    const r = splitZaloAttachments([img(), vid(), doc()]);
    expect(r.images).toHaveLength(1);
    expect(r.links.map(a => a.name)).toEqual(['v.mp4', 'd.pdf']);
  });
  it('10 ảnh đều được nhúng hết — không tin nhắn lẻ, không link', () => {
    const list = Array.from({ length: 10 }, (_, i) => img({ name: `a${i}.webp` }));
    const r = splitZaloAttachments(list);
    expect(r.images).toHaveLength(10);
    expect(r.links).toEqual([]);
  });
  it('ảnh vượt hạn nhúng rơi xuống link, xếp sau video/file', () => {
    const list = [...Array.from({ length: MAX_EMBED_IMAGES + 1 }, (_, i) => img({ name: `a${i}.webp` })), vid()];
    const r = splitZaloAttachments(list);
    expect(r.images).toHaveLength(MAX_EMBED_IMAGES);
    expect(r.links.map(a => a.name)).toEqual([`a${MAX_EMBED_IMAGES}.webp`, 'v.mp4']);
  });
  it('danh sách rỗng/null cho hai mảng rỗng', () => {
    expect(splitZaloAttachments([])).toEqual({ images: [], links: [] });
    expect(splitZaloAttachments(null)).toEqual({ images: [], links: [] });
  });
});

describe('buildZaloAttachmentText', () => {
  it('liệt kê video và file kèm dung lượng và link', () => {
    expect(buildZaloAttachmentText([vid(), doc()])).toBe(
      '📎 Đính kèm:\n• v.mp4 (18MB) — https://x/v.mp4\n• d.pdf (128KB) — https://x/d.pdf'
    );
  });
  it('bỏ qua ảnh vì ảnh đã nhúng trong thẻ', () => {
    const list = Array.from({ length: 10 }, () => img());
    expect(buildZaloAttachmentText(list)).toBe('');
  });
  it('không có đính kèm thì trả chuỗi rỗng', () => {
    expect(buildZaloAttachmentText([])).toBe('');
    expect(buildZaloAttachmentText(null)).toBe('');
  });
});
