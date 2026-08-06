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

  // Phát hiện khi tự soát (chưa có trong bản giao ban đầu): `content` luôn ghi đè
  // theo tin MỚI NHẤT kể cả khi rỗng, nhưng `sender_name` chỉ ghi đè khi tin mới có
  // tên — tin mới rỗng tên thì giữ tên cũ. Hai field cùng "thuộc về tin mới nhất"
  // nhưng lệch quy tắc nhau. Ghi test để chốt hành vi hiện tại, không phải khẳng định
  // đây là điều nên có — cần chủ app xác nhận có đúng ý muốn không.
  it('tin mới nhất rỗng sender_name thì giữ tên cũ, nhưng content vẫn bị ghi đè rỗng', () => {
    const kq = dsChuaNoiMa({
      zaloRows: [
        { uid_from: 'U1', sender_name: 'Tên Cũ', content: 'chào', ts: 100 },
        { uid_from: 'U1', sender_name: '', content: '', ts: 200 },
      ],
      nhanVien: [],
    });
    expect(kq[0].sender_name).toBe('Tên Cũ');
    expect(kq[0].content).toBe('');
  });

  // Phát hiện khi tự soát: default tham số (`zaloRows = []`) chỉ áp dụng khi field
  // là `undefined`. Nếu caller lỡ truyền một object không phải mảng (ví dụ nhầm cả
  // response `{data,error}` của Supabase thay vì chỉ mảng `data`), `zaloRows || []`
  // vẫn giữ nguyên object đó (vì object rỗng cũng truthy) rồi `for...of` NỔ
  // TypeError. Ghi test để chốt giới hạn này — hàm KHÔNG tự bảo vệ khỏi sai kiểu dữ
  // liệu ngoài undefined/null, phần gọi hàm (tab Chấm công ở task sau) phải tự đảm
  // bảo truyền đúng mảng.
  it('zaloRows không phải mảng (object) làm hàm nổ — chưa có phòng vệ kiểu dữ liệu', () => {
    expect(() => dsChuaNoiMa({ zaloRows: {} })).toThrow();
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

  // Cùng giới hạn như dsChuaNoiMa: chỉ đỡ được undefined/null, không đỡ được object
  // không phải mảng.
  it('rows không phải mảng (object) làm hàm nổ — chưa có phòng vệ kiểu dữ liệu', () => {
    expect(() => demVeSomLech({ rows: {} })).toThrow();
  });
});
