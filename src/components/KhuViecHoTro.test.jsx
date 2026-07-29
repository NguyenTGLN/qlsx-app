import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import KhuViecHoTro from './KhuViecHoTro';
import { DANH_MUC_HO_TRO } from '../lib/congViecHoTro';

const DS = DANH_MUC_HO_TRO.map(v => ({
  id: `id-${v.ma}`, order_code: `VIEC-${v.ma}`, product_code: v.ma,
  loai_viec: 'HO_TRO', cach_tinh_hieu_suat: v.ma === 'GH' ? 'DINH_MUC' : 'CO_DINH_100',
}));

const markup = (danhSach = DS) =>
  renderToStaticMarkup(<KhuViecHoTro danhSach={danhSach} onChon={() => {}} />);
const text = (danhSach = DS) => markup(danhSach).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('KhuViecHoTro', () => {
  it('hiện tiêu đề khu và đủ 5 thẻ', () => {
    const t = text();
    expect(t).toContain('Công việc khác');
    for (const v of DANH_MUC_HO_TRO) expect(t).toContain(v.nhan);
  });

  it('chia đôi bề ngang, cột co được, không cuộn ngang', () => {
    const html = markup();
    expect(html).toMatch(/grid-template-columns\s*:\s*repeat\(2\s*,\s*minmax\(0\s*,\s*1fr\)\)/);
    expect(html).not.toMatch(/overflow-x\s*:\s*auto/);
  });

  it('chữ trên thẻ luôn 1 dòng, dài quá thì cắt', () => {
    const html = markup();
    expect(html).toMatch(/white-space\s*:\s*nowrap/);
    expect(html).toMatch(/text-overflow\s*:\s*ellipsis/);
  });

  it('KHÔNG có cụm Chỉ tiêu/Đã Nhập/Còn — phiếu thường trực thì chỉ tiêu vô nghĩa', () => {
    expect(text()).not.toContain('Chỉ tiêu');
  });

  it('mỗi thẻ mang data-viec để đo giao diện và bấm được', () => {
    const html = markup();
    for (const v of DANH_MUC_HO_TRO) expect(html).toContain(`data-viec="${v.ma}"`);
  });

  it('danh sách rỗng thì không hiện gì cả', () => {
    expect(markup([])).toBe('');
  });

  it('mã lạ không có trong danh mục vẫn hiện, lấy mã làm nhãn', () => {
    const la = [{ id: 'x', order_code: 'VIEC-XX', product_code: 'XX', loai_viec: 'HO_TRO' }];
    expect(text(la)).toContain('XX');
  });
});
