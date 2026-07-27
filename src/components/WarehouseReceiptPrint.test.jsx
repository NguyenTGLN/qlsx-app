import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import WarehouseReceiptPrint from './WarehouseReceiptPrint';

const XK_ROWS = [
  { ma: 'F-OCB10', ten: 'Lõi 10OCB (lõi số 2)', dvt: 'Cái', sl: 200, slConLai: 42, kho: 'FM17' },
  { ma: 'F-OCB10', ten: 'Lõi 10OCB (lõi số 2)', dvt: 'Cái', sl: 300, slConLai: 0, kho: 'GM17' },
];

const render = (props) => renderToStaticMarkup(<WarehouseReceiptPrint {...props} />);
// Bóc chữ trong 1 hàng <tr> để so sánh không phụ thuộc style/thuộc tính.
const cellsOfRow = (html, idx) => {
  const tr = html.split('<tr').slice(1)[idx];
  return tr.split('</td>').slice(0, -1).map(td => td.replace(/<[^>]*>/g, '').replace(/^>/, '').trim());
};

describe('Phiếu xuất kho — cột SL còn lại', () => {
  it('có cột "SL còn lại" trong bảng hàng hóa', () => {
    expect(render({ kind: 'XK', rows: XK_ROWS })).toContain('SL còn lại');
  });

  it('in tồn còn lại tại đúng vị trí đó sau khi lấy, ngay sau cột Vị trí', () => {
    const html = render({ kind: 'XK', rows: XK_ROWS });
    expect(cellsOfRow(html, 1)).toEqual(['1', 'F-OCB10', 'Lõi 10OCB (lõi số 2)', 'Cái', '200', '', 'FM17', '42', '']);
  });

  it('lấy hết vị trí thì in số 0 chứ không bỏ trống', () => {
    const html = render({ kind: 'XK', rows: XK_ROWS });
    expect(cellsOfRow(html, 2)[7]).toBe('0');
  });

  it('phiếu chuyển vị trí (CV) cũng có cột SL còn lại', () => {
    expect(render({ kind: 'CV', rows: XK_ROWS })).toContain('SL còn lại');
  });

  it('phiếu nhập kho (NK) KHÔNG có cột SL còn lại', () => {
    expect(render({ kind: 'NK', rows: [{ ma: 'X', ten: 'Y', dvt: 'Cái', sl: 5, kho: 'A1' }] }))
      .not.toContain('SL còn lại');
  });
});

describe('Phiếu xuất kho — mã thành phẩm phiếu sản xuất', () => {
  it('in mã thành phẩm lên đầu phiếu', () => {
    const html = render({ kind: 'XK', rows: XK_ROWS, thanhPham: [{ ma: 'CLO-XS', ten: 'Bộ lọc tổng' }] });
    expect(html).toContain('Thành phẩm');
    expect(html).toContain('CLO-XS');
  });

  it('phiếu không phải sản xuất thì không in dòng thành phẩm', () => {
    expect(render({ kind: 'XK', rows: XK_ROWS, thanhPham: [] })).not.toContain('Thành phẩm');
  });
});

describe('Phiếu xuất kho — ô Người nhận', () => {
  it('in họ tên người nhận được truyền vào', () => {
    expect(render({ kind: 'XK', rows: XK_ROWS, nguoiNhan: 'Nguyễn Văn Hĩu' }))
      .toContain('Nguyễn Văn Hĩu');
  });

  it('không có người nhận thì để trống cho ký tay', () => {
    const html = render({ kind: 'XK', rows: XK_ROWS });
    expect(html).toContain('Người nhận');
    expect(html).not.toContain('Nguyễn Văn Hĩu');
  });
});
