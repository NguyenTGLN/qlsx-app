import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReceiptPickList from './ReceiptPickList';
import { pickKey } from '../lib/receiptView';

const PROPS = {
  kind: 'XK',
  code: 'PSX-20260723-08',
  date: '2026-07-24T11:07:55+07:00',
  reason: 'XUẤT SẢN XUẤT',
  nguoiNhan: 'Nguyễn Văn Hĩu',
  rows: [
    { ma: 'F-OCB10', ten: 'Lõi 10OCB (lõi số 2)', dvt: 'Cái', sl: 200, slConLai: 0, kho: 'FM17' },
    { ma: 'F-PP10', ten: 'Lõi 10PP5 không bịt', dvt: 'Cái', sl: 132, slConLai: 1368, kho: 'GM10' },
  ],
};

const text = (props) => renderToStaticMarkup(<ReceiptPickList {...props} />)
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('ReceiptPickList — bản xem phiếu trên điện thoại', () => {
  it('hiện mã phiếu và loại phiếu ở đầu', () => {
    const t = text(PROPS);
    expect(t).toContain('PSX-20260723-08');
    expect(t).toContain('PHIẾU XUẤT KHO');
  });

  it('hiện đủ mã hàng, tên hàng, số lượng cần lấy của từng dòng', () => {
    const t = text(PROPS);
    expect(t).toContain('F-OCB10');
    expect(t).toContain('Lõi 10OCB (lõi số 2)');
    expect(t).toContain('200');
  });

  it('hiện vị trí lấy hàng của từng dòng — thứ nhân viên cần nhất', () => {
    const t = text(PROPS);
    expect(t).toContain('FM17');
    expect(t).toContain('GM10');
  });

  it('hiện tồn còn lại tại vị trí sau khi lấy, kể cả khi bằng 0', () => {
    const t = text(PROPS);
    expect(t).toContain('Còn lại');
    expect(t).toMatch(/FM17[^]*?0\b/);
    expect(t).toContain('1368');
  });

  it('đánh số thứ tự từng dòng để dò theo phiếu giấy', () => {
    expect(text(PROPS)).toMatch(/\b1\b[^]*F-OCB10/);
  });

  it('đếm tổng số dòng cần lấy', () => {
    expect(text(PROPS)).toContain('2');
  });

  it('phiếu nhập kho hiện đúng tiêu đề nhập', () => {
    expect(text({ ...PROPS, kind: 'NK' })).toContain('PHIẾU NHẬP KHO');
  });

  it('phiếu chuyển vị trí hiện đúng tiêu đề chuyển', () => {
    expect(text({ ...PROPS, kind: 'CV' })).toContain('PHIẾU CHUYỂN VỊ TRÍ');
  });

  it('phiếu rỗng không làm vỡ giao diện', () => {
    expect(() => text({ ...PROPS, rows: [] })).not.toThrow();
  });
});

describe('ReceiptPickList — mã thành phẩm phiếu sản xuất', () => {
  const withTP = { ...PROPS, thanhPham: [{ ma: 'CLO-XS', ten: 'Bộ lọc tổng USTopwater, model: Clo-XS' }] };

  it('hiện mã thành phẩm nổi bật để biết xuất linh kiện ra làm gì', () => {
    const t = text(withTP);
    expect(t).toContain('CLO-XS');
    expect(t).toContain('Bộ lọc tổng USTopwater, model: Clo-XS');
  });

  it('có nhãn "Thành phẩm" cho khỏi nhầm với mã linh kiện', () => {
    expect(text(withTP)).toContain('Thành phẩm');
  });

  it('phiếu nhiều thành phẩm thì liệt kê đủ', () => {
    const t = text({ ...PROPS, thanhPham: [{ ma: 'CLO-XS', ten: '' }, { ma: 'WT-028S-RO', ten: '' }] });
    expect(t).toContain('CLO-XS');
    expect(t).toContain('WT-028S-RO');
  });

  it('phiếu xuất thủ công không có thành phẩm thì không hiện nhãn thừa', () => {
    expect(text({ ...PROPS, thanhPham: [] })).not.toContain('Thành phẩm');
  });

  it('không truyền thanhPham cũng không lỗi', () => {
    expect(() => text(PROPS)).not.toThrow();
  });
});

describe('pickKey — khóa đánh dấu "đã lấy" của từng dòng', () => {
  it('khóa gồm mã hàng và vị trí — cùng mã khác vị trí là 2 lần lấy khác nhau', () => {
    const a = pickKey({ ma: 'F-OCB10', kho: 'FM17' });
    const b = pickKey({ ma: 'F-OCB10', kho: 'GM17' });
    expect(a).not.toBe(b);
  });

  it('cùng mã cùng vị trí thì cùng khóa', () => {
    expect(pickKey({ ma: 'F-OCB10', kho: 'FM17' })).toBe(pickKey({ ma: 'F-OCB10', kho: 'FM17' }));
  });

  it('không phụ thuộc thứ tự dòng trả về từ máy chủ', () => {
    const rows = [{ ma: 'A', kho: 'X1' }, { ma: 'B', kho: 'Y2' }];
    expect(rows.map(pickKey)).toEqual([...rows].reverse().map(pickKey).reverse());
  });
});

describe('ReceiptPickList — tick đã lấy', () => {
  const html = (props) => renderToStaticMarkup(<ReceiptPickList {...props} />);

  it('mỗi dòng có 1 ô tick để đánh dấu đã lấy', () => {
    expect((html(PROPS).match(/type="checkbox"/g) || [])).toHaveLength(2);
  });

  it('dòng đã tick thì ô tick ở trạng thái đã chọn', () => {
    const picked = new Set([pickKey(PROPS.rows[0])]);
    const out = html({ ...PROPS, picked });
    expect(out).toContain('checked=""');
    expect((out.match(/checked=""/g) || [])).toHaveLength(1);
  });

  it('đếm tiến độ đã lấy trên tổng số dòng', () => {
    const picked = new Set([pickKey(PROPS.rows[0])]);
    expect(text({ ...PROPS, picked })).toContain('Đã lấy 1/2');
  });

  it('chưa tick dòng nào thì tiến độ là 0', () => {
    expect(text(PROPS)).toContain('Đã lấy 0/2');
  });

  it('tick hết thì báo đã lấy đủ', () => {
    const picked = new Set(PROPS.rows.map(pickKey));
    const t = text({ ...PROPS, picked });
    expect(t).toContain('Đã lấy đủ 2/2');
  });
});

describe('ReceiptPickList — gọn, không lặp thông tin', () => {
  it('tiến độ "Đã lấy" chỉ hiện 1 lần, không lặp', () => {
    expect(text(PROPS).match(/Đã lấy/g)).toHaveLength(1);
  });

  it('mã phiếu chỉ hiện 1 lần', () => {
    expect(text(PROPS).match(/PSX-20260723-08/g)).toHaveLength(1);
  });

  it('gộp ngày lập, nội dung, số mặt hàng vào 1 dòng thay vì mỗi thứ 1 dòng', () => {
    const t = text(PROPS);
    expect(t).not.toContain('Ngày lập:');
    expect(t).not.toContain('Số mặt hàng:');
    expect(t).toContain('24/07/2026');
    expect(t).toContain('XUẤT SẢN XUẤT');
    expect(t).toContain('2 mặt hàng');
  });

  it('vị trí lấy hết hàng báo gọn bằng chữ HẾT, không thêm dòng cảnh báo riêng', () => {
    const t = text(PROPS);
    expect(t).toContain('HẾT');
    expect(t).not.toContain('Lấy hết vị trí này');
  });
});
