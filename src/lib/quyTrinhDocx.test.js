import { describe, test, expect } from 'vitest';
import { A3_W_TWIP, A3_H_TWIP, sectPrXml, doanXml, bangXml, anhXml, documentXml, contentTypesXml, relsXml, docRelsXml } from './quyTrinhDocx';

const duLieu = () => ({
  quyTrinh: { ma_so: 'QT-SX-01', ten: 'Sản xuất & kiểm soát chất lượng', nhom: 'SX' },
  phienBan: {
    phien_ban: '2.1', lan_ban_hanh: 2, ngay_hieu_luc: '2026-03-01',
    tai_lieu: {
      mucDich: 'Mục đích thử', phamVi: 'Phạm vi thử',
      vienDan: ['ISO 9001:2015'],
      dinhNghia: [{ tu: 'BOM', nghia: 'Định mức nguyên vật liệu' }],
      hoSoLuu: [{ ten: 'Phiếu lệnh SX', boPhan: 'Kho', thoiGian: '24 tháng', hinhThuc: 'Bản cứng' }],
      nguoiLap: 'Đỗ Hương Nguyên', nguoiKiemTra: 'Trưởng phòng QA', nguoiDuyet: 'Giám đốc',
    },
  },
  dienGiai: [
    { stt: 1, ten: 'Xuất kho', nguoiThucHien: 'Thủ kho', dienGiai: 'Soạn hàng', hoSo: ['PSX'], thoiGian: '3 giờ', nhanh: '' },
    { stt: 2, ten: 'Kiểm QC',  nguoiThucHien: 'NV QC',   dienGiai: 'Đo TDS',    hoSo: [],      thoiGian: '10 phút', nhanh: 'ok' },
  ],
  lichSu: [{ lan_ban_hanh: 1, ngay: '10/06/2025', phien_ban: '1.0', noiDung: 'Ban hành lần đầu', nguoi: 'Nguyên' }],
});

describe('khổ giấy A3 ngang', () => {
  test('hằng số đúng: 420mm = 23811 twip, 297mm = 16838 twip', () => {
    expect(A3_W_TWIP).toBe(23811);
    expect(A3_H_TWIP).toBe(16838);
  });
  test('sectPr đặt A3 NGANG — bề ngang là cạnh dài', () => {
    const x = sectPrXml();
    expect(x).toContain(`w:w="${A3_W_TWIP}"`);
    expect(x).toContain(`w:h="${A3_H_TWIP}"`);
    expect(x).toContain('w:orient="landscape"');
    expect(x).toContain('<w:pgMar');
  });
});

describe('doanXml', () => {
  test('đoạn thường có w:p và w:t', () => {
    const x = doanXml('xin chào');
    expect(x).toContain('<w:p>');
    expect(x).toContain('<w:t xml:space="preserve">xin chào</w:t>');
  });
  test('THOÁT ký tự — & < > không làm vỡ XML', () => {
    expect(doanXml('a & b < c')).toContain('a &amp; b &lt; c');
  });
  test('đậm sinh w:b, cỡ chữ nhân đôi (half-point)', () => {
    const x = doanXml('tiêu đề', { dam: true, co: 14 });
    expect(x).toContain('<w:b/>');
    expect(x).toContain('<w:sz w:val="28"/>');
  });
  test('canh giữa sinh jc=center', () => {
    expect(doanXml('x', { canGiua: true })).toContain('<w:jc w:val="center"/>');
  });
  test('phông mặc định Times New Roman', () => {
    expect(doanXml('x')).toContain('w:ascii="Times New Roman"');
  });
});

describe('bangXml', () => {
  const cols = [{ nhan: 'A', rong: 1000 }, { nhan: 'B', rong: 2000 }];
  const rows = [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']];

  test('sinh đúng số dòng — 1 dòng tiêu đề + 3 dòng dữ liệu', () => {
    expect((bangXml(cols, rows).match(/<w:tr>/g) || []).length).toBe(4);
  });
  test('sinh đúng số ô mỗi dòng', () => {
    expect((bangXml(cols, rows).match(/<w:tc>/g) || []).length).toBe(4 * 2);
  });
  test('có tblGrid khớp số cột và bề rộng', () => {
    const x = bangXml(cols, rows);
    expect((x.match(/<w:gridCol/g) || []).length).toBe(2);
    expect(x).toContain('w:w="1000"');
    expect(x).toContain('w:w="2000"');
  });
  test('có đủ 6 viền bảng', () => {
    const x = bangXml(cols, rows);
    for (const v of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) expect(x).toContain(`<w:${v} `);
  });
  test('THOÁT ký tự trong ô', () => {
    expect(bangXml(cols, [['x & y', '<z>']])).toContain('x &amp; y');
  });
  test('bảng rỗng vẫn có dòng tiêu đề', () => {
    expect((bangXml(cols, []).match(/<w:tr>/g) || []).length).toBe(1);
  });
  test('ô thiếu so với số cột được bù rỗng, không lệch bảng', () => {
    expect((bangXml(cols, [['chỉ một ô']]).match(/<w:tc>/g) || []).length).toBe(4);
  });
});

describe('anhXml', () => {
  test('nhúng ảnh bằng rId truyền vào, kích thước tính bằng EMU', () => {
    const x = anhXml('rId10', 1000, 500, 8000000);
    expect(x).toContain('r:embed="rId10"');
    expect(x).toContain('<wp:extent');
    const m = /cx="(\d+)" cy="(\d+)"/.exec(x);
    expect(+m[1]).toBe(8000000);
    expect(+m[2]).toBe(4000000);      // giữ đúng tỉ lệ 1000:500
  });
});

describe('documentXml', () => {
  // Chữ ký: documentXml(duLieu, rIdAnh, anh) — thiếu `anh` thì KHÔNG chèn ảnh.
  const x = documentXml(duLieu(), 'rId10', { w: 1200, h: 800 });

  test('bọc đúng thẻ gốc và khai đủ namespace cần cho ảnh + bảng', () => {
    expect(x).toContain('<w:document');
    expect(x).toContain('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"');
    expect(x).toContain('xmlns:r=');
    expect(x).toContain('xmlns:wp=');
    expect(x).toContain('xmlns:a=');
    expect(x).toContain('xmlns:pic=');
    expect(x.trimEnd().endsWith('</w:document>')).toBe(true);
  });

  test('có đủ 8 mục của tài liệu ISO', () => {
    for (const m of ['1. Mục đích', '2. Phạm vi áp dụng', '3. Tài liệu viện dẫn',
                     '4. Định nghĩa', '5. Lưu đồ quy trình', '6. Diễn giải lưu đồ',
                     '7. Hồ sơ lưu', '8. Theo dõi sửa đổi']) {
      expect(x).toContain(m);
    }
  });

  test('có khối kiểm soát tài liệu: mã số, lần ban hành, ngày hiệu lực', () => {
    expect(x).toContain('QT-SX-01');
    expect(x).toContain('01/03/2026');
    expect(x).toContain('02');
  });

  test('có 3 ô chữ ký', () => {
    for (const t of ['Người lập', 'Người kiểm tra', 'Người duyệt']) expect(x).toContain(t);
  });

  test('tên quy trình có & được thoát, không làm vỡ XML', () => {
    expect(x).toContain('Sản xuất &amp; kiểm soát chất lượng');
    expect(x).not.toMatch(/<w:t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  test('nhúng ảnh lưu đồ khi có rId', () => {
    expect(x).toContain('r:embed="rId10"');
  });

  test('không có rId thì bỏ ảnh, vẫn ra tài liệu hợp lệ', () => {
    const y = documentXml(duLieu(), null);
    expect(y).not.toContain('<w:drawing>');
    expect(y).toContain('6. Diễn giải lưu đồ');
  });

  test('kết thúc body bằng sectPr A3 ngang', () => {
    expect(x).toContain('w:orient="landscape"');
    expect(x.indexOf('<w:sectPr>')).toBeGreaterThan(x.indexOf('8. Theo dõi sửa đổi'));
  });

  test('bảng diễn giải có đủ số dòng dữ liệu', () => {
    const bang = x.slice(x.indexOf('6. Diễn giải lưu đồ'), x.indexOf('7. Hồ sơ lưu'));
    expect((bang.match(/<w:tr>/g) || []).length).toBe(1 + 2);
  });

  test('tài liệu thiếu tai_lieu vẫn ra được, không nổ', () => {
    const d = duLieu(); d.phienBan.tai_lieu = {};
    expect(() => documentXml(d, null)).not.toThrow();
  });
});

describe('các tệp phụ của gói docx', () => {
  test('[Content_Types].xml khai png và document.xml', () => {
    const x = contentTypesXml();
    expect(x).toContain('Extension="png"');
    expect(x).toContain('/word/document.xml');
  });
  test('_rels/.rels trỏ tới word/document.xml', () => {
    expect(relsXml()).toContain('Target="word/document.xml"');
  });
  test('document.xml.rels trỏ tới media/image1.png khi có ảnh', () => {
    expect(docRelsXml(true)).toContain('media/image1.png');
    expect(docRelsXml(false)).not.toContain('media/image1.png');
  });
  test('mọi tệp XML mở đầu bằng khai báo encoding UTF-8', () => {
    for (const x of [contentTypesXml(), relsXml(), docRelsXml(true), documentXml(duLieu(), null)]) {
      expect(x.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    }
  });
});
