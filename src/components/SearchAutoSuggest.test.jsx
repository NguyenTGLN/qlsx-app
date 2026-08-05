import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SearchAutoSuggest from './SearchAutoSuggest';

// Nút lọc ngoài thanh công cụ là phần DUY NHẤT hiện ở lượt vẽ đầu (modal chỉ bung sau
// khi bấm). Nó cũng là chỗ dễ hỏng nhất khi thêm chế độ nhóm: nếu quên nhánh mới, nút
// sẽ phun nguyên chuỗi JSON ra màn hình.
const text = (props) => renderToStaticMarkup(
  <SearchAutoSuggest tableName="luu_xuat" searchColumns={['ma_san_pham']} onChange={() => {}} {...props} />
).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const NHOM = JSON.stringify([{ tu: 'VNA02404185107', ma: ['F-PP10', 'D-TDS'] }]);

describe('SearchAutoSuggest — chế độ thường (9 tab đang dùng)', () => {
  it('chưa chọn gì thì hiện chữ gợi ý', () => {
    expect(text({ placeholder: 'Tìm mã SP...', value: '' })).toContain('Tìm mã SP...');
  });

  it('chọn 1 mã thì hiện đúng mã đó', () => {
    expect(text({ value: 'F-PP10' })).toContain('F-PP10');
  });

  it('chọn nhiều mã thì đếm số đã chọn', () => {
    expect(text({ value: 'F-PP10,D-TDS' })).toContain('2 đã chọn');
  });
});

describe('SearchAutoSuggest — chế độ nhóm (tab Lưu xuất)', () => {
  it('hiện tóm tắt nhóm, TUYỆT ĐỐI không phun chuỗi JSON ra màn hình', () => {
    const t = text({ groupByTerm: true, value: NHOM });
    expect(t).toContain('VNA024…107 (2 SP)');
    expect(t).not.toContain('{');
    expect(t).not.toContain('"tu"');
  });

  it('chưa có nhóm nào thì vẫn hiện chữ gợi ý', () => {
    expect(text({ groupByTerm: true, value: '', placeholder: 'Tìm mã SP, tên, ĐH...' }))
      .toContain('Tìm mã SP, tên, ĐH...');
  });

  it('chuỗi hỏng cũng không làm sập nút', () => {
    expect(() => text({ groupByTerm: true, value: 'rác không phải json' })).not.toThrow();
  });

  it('nhãn LUÔN 1 dòng ngắn khi có nhiều nhóm — không đẩy thanh công cụ tràn ngang', () => {
    const nhieu = JSON.stringify([
      { tu: 'VNA02404185107', ma: ['F-PP10'] },
      { tu: 'DLY05082600200', ma: [] },
      { tu: 'MQH0508260010', ma: [] },
    ]);
    expect(text({ groupByTerm: true, value: nhieu })).toContain('3 nhóm lọc');
  });
});
