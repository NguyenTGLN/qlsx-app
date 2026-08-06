import { describe, it, expect } from 'vitest';
import { dsChuaNoiMa, demVeSomLech } from './chamCongZalo';

describe('dsChuaNoiMa', () => {
  const nhanVien = [
    { id: 'hhx', name: 'Xuyên', uid_from: '337594525259740835' },
    { id: 'lvb', name: 'Bích', uid_from: null },
    { id: 'nvh', name: 'Hĩu', uid_from: '' },
  ];

  it('bỏ người đã nối mã, giữ người chưa nối', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: '337594525259740835', sender_name: 'Hà Xuyên', content: 'Xuyên', ts: 100 },
        { uid_from: 'UID-LA', sender_name: 'ERM Trại Gà', content: 'Hà', ts: 200 },
      ],
      nhanVien,
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].uid_from).toBe('UID-LA');
  });

  it('gộp theo uid và giữ nội dung của tin MỚI NHẤT', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: 'U1', sender_name: 'A', content: 'cũ', ts: 100 },
        { uid_from: 'U1', sender_name: 'A', content: 'mới', ts: 300 },
        { uid_from: 'U1', sender_name: 'A', content: 'giữa', ts: 200 },
      ],
      nhanVien: [],
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].soTin).toBe(3);
    expect(kq[0].content).toBe('mới');
  });

  it('xếp người nhắn nhiều lên trước', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: 'IT', content: 'x', ts: 1 },
        { uid_from: 'NHIEU', content: 'y', ts: 2 },
        { uid_from: 'NHIEU', content: 'y', ts: 3 },
      ],
      nhanVien: [],
    });
    expect(kq.map(x => x.uid_from)).toEqual(['NHIEU', 'IT']);
  });

  it('không nổ khi thiếu tham số', () => {
    expect(dsChuaNoiMa()).toEqual([]);
    expect(dsChuaNoiMa({})).toEqual([]);
  });
});

describe('demVeSomLech', () => {
  it('đếm dòng có số khác nhau', () => {
    const kq = demVeSomLech({
      rows: [{ nhan_vien_id: 'a', ngay: '2026-08-03', ve_som_phut: 0 }],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 1, soThieuDong: 0 });
  });

  it('khớp thì không tính là lệch', () => {
    const kq = demVeSomLech({
      rows: [{ nhan_vien_id: 'a', ngay: '2026-08-03', ve_som_phut: 30 }],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 0, soThieuDong: 0 });
  });

  it('không có dòng chấm công thì đếm riêng, không gộp vào lệch', () => {
    const kq = demVeSomLech({
      rows: [],
      veSomTay: [{ nhan_vien_id: 'a', ngay: '2026-08-03', so_phut: 30 }],
    });
    expect(kq).toEqual({ soLech: 0, soThieuDong: 1 });
  });

  it('không nổ khi thiếu tham số', () => {
    expect(demVeSomLech()).toEqual({ soLech: 0, soThieuDong: 0 });
  });
});
