import { describe, it, expect } from 'vitest';
import {
  docNhom, ghiNhom, daTick, doiTick, chotCaDon, xoaNhom,
  nhanTomTat, menhDeLoc,
} from './locNhomLuuXuat';

describe('docNhom / ghiNhom', () => {
  it('đọc chuỗi rỗng ra mảng rỗng', () => {
    expect(docNhom('')).toEqual([]);
    expect(docNhom(undefined)).toEqual([]);
  });

  it('đi vòng ghi rồi đọc lại thì không đổi', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }];
    expect(docNhom(ghiNhom(n))).toEqual(n);
  });

  it('chuỗi hỏng không làm sập app, trả mảng rỗng', () => {
    expect(docNhom('{không phải json')).toEqual([]);
    expect(docNhom('{"a":1}')).toEqual([]);
  });

  it('bỏ qua phần tử sai hình dạng', () => {
    expect(docNhom('[{"tu":"A","ma":["X"]},null,{"ma":["Y"]},"rác"]'))
      .toEqual([{ tu: 'A', ma: ['X'] }, { tu: '', ma: ['Y'] }]);
  });
});

describe('doiTick', () => {
  it('tick lần đầu tạo nhóm mới cho từ khoá đang gõ', () => {
    expect(doiTick([], 'VNA0240', 'F-PP10'))
      .toEqual([{ tu: 'VNA0240', ma: ['F-PP10'] }]);
  });

  it('tick thêm mã thứ hai gộp vào ĐÚNG nhóm đó, không tạo nhóm trùng', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'VNA0240', 'D-TDS');
    expect(n).toEqual([{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }]);
  });

  it('tick trong từ khoá khác thì sinh nhóm thứ hai, nhóm cũ còn nguyên', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'DLY0508', 'S-C2L6');
    expect(n).toEqual([
      { tu: 'VNA0240', ma: ['F-PP10'] },
      { tu: 'DLY0508', ma: ['S-C2L6'] },
    ]);
  });

  it('bỏ tick thì mã biến mất, nhóm còn lại thành "cả đơn"', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'VNA0240', 'F-PP10');
    expect(n).toEqual([{ tu: 'VNA0240', ma: [] }]);
  });

  it('bỏ tick khi từ khoá rỗng thì xoá hẳn nhóm, không để lại nhóm rỗng vô nghĩa', () => {
    expect(doiTick([{ tu: '', ma: ['F-PP10'] }], '', 'F-PP10')).toEqual([]);
  });

  it('không sửa tại chỗ mảng gốc — React phải nhận ra thay đổi', () => {
    const goc = [{ tu: 'A', ma: ['X'] }];
    const moi = doiTick(goc, 'A', 'Y');
    expect(goc).toEqual([{ tu: 'A', ma: ['X'] }]);
    expect(moi).not.toBe(goc);
  });
});

describe('daTick', () => {
  it('trả đúng tập mã của nhóm khớp từ khoá đang gõ', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10'] }, { tu: 'DLY0508', ma: ['S-C2L6'] }];
    expect([...daTick(n, 'DLY0508')]).toEqual(['S-C2L6']);
  });

  it('từ khoá chưa có nhóm thì không ô nào được tick sẵn', () => {
    expect(daTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'XYZ').size).toBe(0);
  });
});

describe('chotCaDon', () => {
  it('bấm Xong khi từ khoá chưa có nhóm thì chốt thành nhóm cả đơn', () => {
    expect(chotCaDon([], 'VNA0240')).toEqual([{ tu: 'VNA0240', ma: [] }]);
  });

  it('từ khoá đã có nhóm thì giữ nguyên, không nhân đôi', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10'] }];
    expect(chotCaDon(n, 'VNA0240')).toEqual(n);
  });

  it('từ khoá rỗng hoặc chỉ khoảng trắng thì không chốt gì', () => {
    expect(chotCaDon([], '')).toEqual([]);
    expect(chotCaDon([], '   ')).toEqual([]);
  });
});

describe('xoaNhom', () => {
  it('xoá đúng nhóm theo từ khoá', () => {
    const n = [{ tu: 'A', ma: ['X'] }, { tu: 'B', ma: ['Y'] }];
    expect(xoaNhom(n, 'A')).toEqual([{ tu: 'B', ma: ['Y'] }]);
  });
});

describe('menhDeLoc', () => {
  it('không có nhóm nào thì không lọc', () => {
    expect(menhDeLoc([])).toBe('');
  });

  it('nhóm có từ khoá + mã ⇒ and(or 3 cột, in mã)', () => {
    expect(menhDeLoc([{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }])).toBe(
      'and(or(ma_san_pham.ilike.%VNA0240%,ten_san_pham.ilike.%VNA0240%,ma_don_hang.ilike.%VNA0240%),ma_san_pham.in.("F-PP10","D-TDS"))'
    );
  });

  it('nhóm chỉ có từ khoá ⇒ or 3 cột, nghĩa là cả đơn', () => {
    expect(menhDeLoc([{ tu: 'DLY0508', ma: [] }])).toBe(
      'or(ma_san_pham.ilike.%DLY0508%,ten_san_pham.ilike.%DLY0508%,ma_don_hang.ilike.%DLY0508%)'
    );
  });

  it('nhóm không có từ khoá, chỉ có mã ⇒ lọc phẳng như hành vi CŨ', () => {
    expect(menhDeLoc([{ tu: '', ma: ['F-PP10'] }])).toBe('ma_san_pham.in.("F-PP10")');
  });

  it('nhiều nhóm thì nối bằng dấu phẩy để .or() hợp lại', () => {
    const s = menhDeLoc([
      { tu: 'VNA0240', ma: ['F-PP10'] },
      { tu: 'DLY0508', ma: [] },
    ]);
    expect(s).toBe(
      'and(or(ma_san_pham.ilike.%VNA0240%,ten_san_pham.ilike.%VNA0240%,ma_don_hang.ilike.%VNA0240%),ma_san_pham.in.("F-PP10")),' +
      'or(ma_san_pham.ilike.%DLY0508%,ten_san_pham.ilike.%DLY0508%,ma_don_hang.ilike.%DLY0508%)'
    );
  });

  it('nhóm rỗng hoàn toàn bị bỏ qua, không sinh mệnh đề què', () => {
    expect(menhDeLoc([{ tu: '  ', ma: [] }])).toBe('');
    expect(menhDeLoc([{ tu: '', ma: [] }, { tu: 'A', ma: [] }]))
      .toBe('or(ma_san_pham.ilike.%A%,ten_san_pham.ilike.%A%,ma_don_hang.ilike.%A%)');
  });

  it('KHỬ ký tự phá cú pháp trong từ khoá', () => {
    // ,()* là ký tự phân tách của logic tree PostgREST — lọt vào là vỡ truy vấn.
    const s = menhDeLoc([{ tu: 'A,B)or(x', ma: [] }]);
    expect(s).not.toContain('A,B');
    expect(s).toBe('or(ma_san_pham.ilike.%A B or x%,ten_san_pham.ilike.%A B or x%,ma_don_hang.ilike.%A B or x%)');
  });

  it('KHỬ ký tự phá cú pháp trong mã sản phẩm', () => {
    const s = menhDeLoc([{ tu: '', ma: ['F"),x.eq.1--'] }]);
    expect(s).toBe('ma_san_pham.in.("Fx.eq.1--")');
  });

  it('giữ nguyên mã nhiều gạch nối', () => {
    expect(menhDeLoc([{ tu: '', ma: ['S-PVC3043-LUX200RO'] }]))
      .toBe('ma_san_pham.in.("S-PVC3043-LUX200RO")');
  });
});

describe('nhanTomTat', () => {
  it('chưa lọc gì thì rỗng', () => {
    expect(nhanTomTat([])).toBe('');
  });

  it('một nhóm có tick thì hiện từ khoá kèm số SP', () => {
    expect(nhanTomTat([{ tu: 'VNA02404185107', ma: ['F-PP10', 'D-TDS'] }]))
      .toBe('VNA024…107 (2 SP)');
  });

  it('một nhóm không tick thì chỉ hiện từ khoá', () => {
    expect(nhanTomTat([{ tu: 'VNA02404185107', ma: [] }])).toBe('VNA024…107');
  });

  it('từ khoá ngắn thì không cắt', () => {
    expect(nhanTomTat([{ tu: 'F-PP10', ma: [] }])).toBe('F-PP10');
  });

  it('nhóm không từ khoá thì đếm số SP', () => {
    expect(nhanTomTat([{ tu: '', ma: ['A', 'B'] }])).toBe('2 SP');
  });

  it('nhiều nhóm thì đếm nhóm — nhãn LUÔN 1 dòng ngắn', () => {
    expect(nhanTomTat([{ tu: 'A', ma: [] }, { tu: 'B', ma: [] }, { tu: 'C', ma: [] }]))
      .toBe('3 nhóm lọc');
  });
});
