import { describe, test, expect } from 'vitest';
import { A4_W_TWIP, A4_H_TWIP, CAO_IN_EMU, RONG_IN_TWIP, sectPrXml, doanXml, bangXml, anhXml, documentXml, contentTypesXml, relsXml, docRelsXml } from './quyTrinhDocx';

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

const MM_EMU = 36000;                        // 1 mm = 36 000 EMU (chuẩn OOXML)
const mm = emu => emu / MM_EMU;

describe('khổ giấy A4 dọc', () => {
  test('hằng số đúng: 210mm = 11906 twip, 297mm = 16838 twip', () => {
    expect(A4_W_TWIP).toBe(11906);
    expect(A4_H_TWIP).toBe(16838);
    // 1mm = 1440/25.4 twip — làm tròn tới số nguyên gần nhất.
    expect(A4_W_TWIP).toBe(Math.round(210 * 1440 / 25.4));
    expect(A4_H_TWIP).toBe(Math.round(297 * 1440 / 25.4));
  });

  test('sectPr đặt A4 DỌC — bề ngang là cạnh NGẮN', () => {
    const x = sectPrXml();
    expect(x).toContain(`w:w="${A4_W_TWIP}"`);
    expect(x).toContain(`w:h="${A4_H_TWIP}"`);
    expect(A4_W_TWIP).toBeLessThan(A4_H_TWIP);
    expect(x).toContain('<w:pgMar');
  });

  // w:orient BỎ HẲN, không ghi "portrait". ST_PageOrientation lấy portrait làm
  // MẶC ĐỊNH của lược đồ, và chính Word cũng không ghi thuộc tính này ra khi
  // trang đứng — ghi thêm là mở ra khả năng orient chọi nhau với cặp w/h.
  // Ở đây w < h nên hướng trang đã không thể hiểu nhầm.
  test('KHÔNG ghi w:orient — portrait là mặc định của lược đồ', () => {
    expect(sectPrXml()).not.toContain('w:orient');
  });

  test('vùng in trừ đúng lề: ngang 10772 twip, dọc 15704 twip', () => {
    expect(RONG_IN_TWIP).toBe(A4_W_TWIP - 1134);
    expect(RONG_IN_TWIP).toBe(10772);
    expect(CAO_IN_EMU).toBe((A4_H_TWIP - 1134) * 635);
    // 190 × 277 mm — đúng A4 trừ lề 10mm mỗi bên.
    expect(Math.round(mm(RONG_IN_TWIP * 635))).toBe(190);
    expect(Math.round(mm(CAO_IN_EMU))).toBe(277);
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

  test('kết thúc body bằng sectPr A4 dọc', () => {
    expect(x).toContain(`w:w="${A4_W_TWIP}" w:h="${A4_H_TWIP}"`);
    expect(x).not.toContain('w:orient');
    expect(x.indexOf('<w:sectPr>')).toBeGreaterThan(x.indexOf('8. Theo dõi sửa đổi'));
  });

  // Bề rộng cột khai bằng PHÂN SỐ của vùng in. Tổng lệch là bảng thò ra ngoài
  // lề (tổng lớn hơn) hoặc chừa một vệt trắng bên phải (tổng nhỏ hơn) — cả hai
  // đều nhìn thấy ngay trên tờ A4, vốn hẹp hơn A3 cũ hơn một nửa.
  test('bề rộng các cột của MỌI bảng cộng đúng bằng vùng in', () => {
    const bang = x.split('<w:tbl>').slice(1);
    expect(bang.length).toBe(5);              // kiểm soát, chữ ký, diễn giải, hồ sơ, sửa đổi
    for (const b of bang) {
      const grid = b.slice(0, b.indexOf('</w:tblGrid>'));
      const tong = [...grid.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].reduce((s, m) => s + +m[1], 0);
      // Mỗi cột làm tròn riêng nên tổng lệch nhiều nhất nửa twip mỗi cột — với
      // 5 cột là 2 twip, tức 0.035 mm. Ngoài khoảng đó là phân số cộng không đủ 1.
      expect(Math.abs(tong - RONG_IN_TWIP)).toBeLessThanOrEqual(3);
    }
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

describe('ảnh lưu đồ phải nằm vừa trang', () => {
  const vua = (w, h) => {
    const x = documentXml(duLieu(), 'rId10', { w, h });
    const m = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(x);
    return { cx: +m[1], cy: +m[2] };
  };

  test('lưu đồ 4 cột KHÔNG tràn chiều cao trang', () => {
    const { cy } = vua(960, 726);          // nhóm CL/HC, chưa thêm bước nào
    expect(cy).toBeLessThanOrEqual(CAO_IN_EMU);
  });

  test('lưu đồ rất cao vẫn nằm trong trang', () => {
    const { cy } = vua(960, 1806);         // CL sau khi thêm 16 bước
    expect(cy).toBeLessThanOrEqual(CAO_IN_EMU);
  });

  test('lưu đồ rộng bẹt thì kẹp theo BỀ NGANG, không phóng quá khổ', () => {
    const { cx } = vua(2400, 700);
    expect(cx).toBeLessThanOrEqual(RONG_IN_TWIP * 635);
  });

  test('giữ đúng tỉ lệ ảnh sau khi kẹp', () => {
    const { cx, cy } = vua(960, 1806);
    expect(Math.abs(cx / cy - 960 / 1806)).toBeLessThan(0.01);
  });

  // Lưu đồ THẬT dùng để đo: nhóm SX (5 cột) + 8 bước ⇒ ảnh 1172 × 1126 px.
  // Đây là kích thước soDoSangSvg trả về, đo bằng chính hàm đó (xem
  // quyTrinhSvg.test.js) — không phải con số bịa ra cho vừa bài kiểm tra.
  test('LƯU ĐỒ 5 CỘT nằm gọn trong CẢ HAI chiều của trang A4 dọc', () => {
    const { cx, cy } = vua(1172, 1126);
    expect(cx).toBeLessThanOrEqual(RONG_IN_TWIP * 635);
    expect(cy).toBeLessThanOrEqual(CAO_IN_EMU);
    // 190.0 × 182.5 mm trong vùng in 190 × 277 mm — chạm mép ngang, dư chiều cao.
    expect(mm(cx)).toBeCloseTo(190.0, 1);
    expect(mm(cy)).toBeCloseTo(182.5, 1);
  });

  test('KẸP THEO CHIỀU CAO vẫn còn hiệu lực — lưu đồ cao gầy không tràn đáy', () => {
    const { cx, cy } = vua(700, 2400);
    expect(cy).toBeLessThanOrEqual(CAO_IN_EMU);
    expect(cx).toBeLessThanOrEqual(RONG_IN_TWIP * 635);
  });
});

test('doanXml xếp con theo đúng thứ tự ECMA-376', () => {
  const x = doanXml('x', { canGiua: true, dam: true, mau: '#ff0000', co: 12 });
  expect(x.indexOf('<w:spacing')).toBeLessThan(x.indexOf('<w:jc'));
  expect(x.indexOf('<w:color')).toBeLessThan(x.indexOf('<w:sz '));
  expect(x.indexOf('<w:b/>')).toBeLessThan(x.indexOf('<w:color'));
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
