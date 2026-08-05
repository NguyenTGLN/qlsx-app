import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KhoiKpi, KhoiViec } from './BangTinCaNhan';
import { NHOM } from '../lib/viecDangLam';

// Hai khối này nhận dữ liệu qua prop nên test được ĐẦY ĐỦ phần hiển thị khi đã có
// số — thứ mà test render cả trang không chạm tới được (useEffect không chạy).

const ve = el => renderToStaticMarkup(el);
const chu = el => ve(el).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const kpiRong = { tongKpi: 0, tongMat: 0, danhSachMatDiem: [], nhomThieuDongChung: [], dong: [] };

describe('KhoiKpi — trạng thái phải nói đúng chuyện đang xảy ra', () => {
  const chung = { ky: '2026-08', setKy: () => {}, onXemChiTiet: () => {} };

  test('đang tải ⇒ "Đang tải", KHÔNG hiện điểm', () => {
    const t = chu(<KhoiKpi {...chung} kpi={null} dangTai />);
    expect(t).toContain('Đang tải');
    expect(t).not.toContain('điểm');
  });

  // Đây là lỗi bắt được trên trình duyệt ngày 04/08/2026: tải hỏng mà màn hình hiện
  // "0.0 điểm · Chưa mất điểm nào" — khẳng định về dữ liệu chưa hề đọc được.
  test('tải hỏng (kpi = null, không còn đang tải) ⇒ báo hỏng, KHÔNG hiện 0.0 điểm', () => {
    const t = chu(<KhoiKpi {...chung} kpi={null} dangTai={false} />);
    expect(t).toContain('Không tải được KPI');
    expect(t).not.toContain('0.0');
    expect(t).not.toContain('Chưa mất điểm nào');
  });

  test('chưa lập chỉ tiêu cho kỳ ⇒ nói rõ, khác hẳn với hỏng', () => {
    const t = chu(<KhoiKpi {...chung} kpi={{ chuaCoBang: true }} dangTai={false} />);
    expect(t).toContain('Chưa có bảng KPI cho kỳ này');
    expect(t).not.toContain('Không tải được');
  });

  test('có bảng, đạt trọn điểm ⇒ hiện điểm và "Chưa mất điểm nào"', () => {
    const t = chu(<KhoiKpi {...chung} kpi={{ ...kpiRong, tongKpi: 100 }} dangTai={false} />);
    expect(t).toContain('100.0');
    expect(t).toContain('Chưa mất điểm nào');
  });
});

describe('KhoiKpi — danh sách chỉ tiêu mất điểm', () => {
  const chung = { ky: '2026-08', setKy: () => {}, onXemChiTiet: () => {} };
  const kpi = {
    ...kpiRong,
    tongKpi: 78.5,
    danhSachMatDiem: [
      { id: '1', ten: 'CHUYÊN CẦN CÁ NHÂN', diemMat: 12 },
      { id: '2', ten: 'HOÀN THÀNH CÔNG VIỆC ĐÚNG HẠN', diemMat: 6.5 },
      { id: '3', ten: 'QUAY VIDEO KỸ THUẬT', diemMat: 3 },
    ],
  };

  test('liệt kê đủ tên chỉ tiêu và số điểm mất, có dấu trừ', () => {
    const t = chu(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />);
    expect(t).toContain('CHUYÊN CẦN CÁ NHÂN');
    expect(t).toContain('HOÀN THÀNH CÔNG VIỆC ĐÚNG HẠN');
    expect(t).toContain('QUAY VIDEO KỸ THUẬT');
    expect(t).toContain('−12.0');
    expect(t).toContain('−6.5');
  });

  test('giữ nguyên thứ tự engine đã sắp — mất nhiều nhất lên đầu', () => {
    const t = chu(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />);
    const i = ['CHUYÊN CẦN', 'HOÀN THÀNH', 'QUAY VIDEO'].map(s => t.indexOf(s));
    expect(i).toEqual([...i].sort((a, b) => a - b));
  });

  test('đếm đúng số chỉ tiêu đang mất điểm', () => {
    expect(chu(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />)).toContain('3 chỉ tiêu');
  });

  test('mỗi chỉ tiêu là một nút bấm được (đi sang tab KPI đầy đủ)', () => {
    const h = ve(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />);
    expect(h.split('<button').length - 1).toBe(3);
  });

  test('tổng điểm hiển thị 1 chữ số thập phân', () => {
    expect(chu(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />)).toContain('78.5');
  });
});

describe('KhoiKpi — cảnh báo dữ liệu hỏng phải nổi lên, không được giấu', () => {
  const chung = { ky: '2026-08', setKy: () => {}, onXemChiTiet: () => {} };

  // Thiếu dòng chấm chung = cả nhóm mất TRỌN trọng số vì dữ liệu sót, không phải vì
  // bị chấm kém. Giấu đi là để người ta mất điểm mà không biết đường nào mà hỏi.
  test('nhomThieuDongChung ⇒ hiện tên nhóm và nói điểm đang tính là 0', () => {
    const kpi = { ...kpiRong, tongKpi: 55, nhomThieuDongChung: ['CHUYEN_CAN_SX'] };
    const t = chu(<KhoiKpi {...chung} kpi={kpi} dangTai={false} />);
    expect(t).toContain('CHUYEN_CAN_SX');
    expect(t).toContain('đang tính là 0');
  });

  test('nguồn chấm tự động hỏng ⇒ nói điểm có thể chưa đủ', () => {
    const t = chu(<KhoiKpi {...chung} kpi={kpiRong} dangTai={false} loiNguon="cham_cong toang" />);
    expect(t).toContain('chưa đủ');
    expect(t).toContain('cham_cong toang');
  });

  test('không có cảnh báo nào ⇒ không hiện dải cảnh báo thừa', () => {
    const t = chu(<KhoiKpi {...chung} kpi={kpiRong} dangTai={false} />);
    expect(t).not.toContain('đang tính là 0');
    expect(t).not.toContain('chưa đủ');
  });
});

// Màu ở màn hình này MANG THÔNG TIN. Hai luật ngược nhau, đều phải giữ:
//   KPI  — mỗi chỉ tiêu một màu riêng, nóng dần về phía mất nhiều nhất.
//   Việc — màu theo mức gấp, nên hai việc cùng quá hạn PHẢI cùng màu.
const mauVienTrai = h => [...h.matchAll(/border-left-color:\s*([^;"]+)/g)].map(m => m[1].trim());

describe('màu thẻ nhỏ trong khối KPI — mỗi chỉ tiêu một màu', () => {
  const chung = { ky: '2026-08', setKy: () => {}, onXemChiTiet: () => {} };
  const dungMat = n => ({
    ...kpiRong, tongKpi: 50, tongMat: 50,
    danhSachMatDiem: Array.from({ length: n }, (_, i) => ({
      id: String(i), ten: `CHỈ TIÊU ${i}`, diemMat: n - i,
    })),
  });

  test('4 chỉ tiêu ⇒ 4 màu KHÁC NHAU', () => {
    const mau = mauVienTrai(ve(<KhoiKpi {...chung} kpi={dungMat(4)} dangTai={false} />));
    expect(mau).toHaveLength(4);
    expect(new Set(mau).size).toBe(4);
  });

  test('chỉ tiêu mất nhiều nhất mang màu đỏ (engine đã sắp giảm dần)', () => {
    expect(mauVienTrai(ve(<KhoiKpi {...chung} kpi={dungMat(3)} dangTai={false} />))[0])
      .toBe('#dc2626');
  });

  test('quá 8 chỉ tiêu thì quay vòng bảng màu, không văng và không mất thẻ nào', () => {
    const mau = mauVienTrai(ve(<KhoiKpi {...chung} kpi={dungMat(11)} dangTai={false} />));
    expect(mau).toHaveLength(11);
    expect(mau[8]).toBe(mau[0]);
  });

  test('chip tổng điểm đã mất chỉ hiện khi thật sự có mất', () => {
    expect(chu(<KhoiKpi {...chung} kpi={dungMat(2)} dangTai={false} />)).toContain('đã mất');
    // Đạt trọn điểm mà vẫn dán chip "−0.0 đã mất" là nói sai về kết quả.
    expect(chu(<KhoiKpi {...chung} kpi={{ ...kpiRong, tongKpi: 100 }} dangTai={false} />))
      .not.toContain('đã mất');
  });
});

describe('KhoiViec', () => {
  const viec = (id, title, nhom, due_date) => ({ id, title, nhom, due_date });

  test('đang tải ⇒ "Đang tải"', () => {
    expect(chu(<KhoiViec ds={null} dangTai onMo={() => {}} />)).toContain('Đang tải');
  });

  test('tải hỏng (null) ⇒ báo hỏng, KHÔNG nói "không có việc nào"', () => {
    const t = chu(<KhoiViec ds={null} dangTai={false} onMo={() => {}} />);
    expect(t).toContain('Không tải được danh sách việc');
    expect(t).not.toContain('Không có việc nào đang làm');
  });

  test('tải được nhưng rỗng ⇒ "Không có việc nào đang làm"', () => {
    expect(chu(<KhoiViec ds={[]} dangTai={false} onMo={() => {}} />))
      .toContain('Không có việc nào đang làm');
  });

  test('hiện tên việc, hạn, và nhãn nhóm', () => {
    const ds = [
      viec('a', 'Sửa máy lọc RO', NHOM.QUA_HAN, '2026-08-01T09:30:00+07:00'),
      viec('b', 'Gọi khách xác nhận', NHOM.SAP_HAN, '2026-08-05T14:00:00+07:00'),
      viec('c', 'Dọn kho lõi', NHOM.CON_LAI, null),
    ];
    const t = chu(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />);
    expect(t).toContain('Sửa máy lọc RO');
    expect(t).toContain('Quá hạn');
    expect(t).toContain('Sắp đến hạn');
    expect(t).toContain('Không có hạn');
    expect(t).toContain('09:30 01/08');
  });

  test('đếm tổng việc và số quá hạn ở đầu khối', () => {
    const ds = [
      viec('a', 'A', NHOM.QUA_HAN, '2026-08-01T09:00:00+07:00'),
      viec('b', 'B', NHOM.QUA_HAN, '2026-08-02T09:00:00+07:00'),
      viec('c', 'C', NHOM.CON_LAI, null),
    ];
    const t = chu(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />);
    expect(t).toContain('3 việc');
    expect(t).toContain('2 quá hạn');
  });

  test('không có việc quá hạn ⇒ không nhắc "quá hạn"', () => {
    const ds = [viec('c', 'C', NHOM.CON_LAI, null)];
    expect(chu(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />)).not.toContain('quá hạn');
  });

  test('việc không có tiêu đề vẫn hiện được, không ra chuỗi rỗng', () => {
    const ds = [viec('x', null, NHOM.CON_LAI, null)];
    const t = chu(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />);
    expect(t).toContain('không có tiêu đề');
    expect(t).not.toContain('undefined');
  });

  test('due_date rác ⇒ "Không có hạn", không hiện Invalid Date/NaN', () => {
    const ds = [viec('x', 'Việc', NHOM.CON_LAI, 'khong-phai-ngay')];
    const t = chu(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />);
    expect(t).toContain('Không có hạn');
    expect(t).not.toMatch(/Invalid Date|NaN/);
  });

  // Ngược hẳn luật của khối KPI, và có chủ đích: ở đây màu là MỨC GẤP.
  // Tô hai việc cùng quá hạn thành hai màu cho "đẹp" là nói dối về mức độ.
  test('hai việc CÙNG nhóm ⇒ CÙNG màu', () => {
    const ds = [
      viec('a', 'A', NHOM.QUA_HAN, '2026-08-01T09:00:00+07:00'),
      viec('b', 'B', NHOM.QUA_HAN, '2026-08-02T09:00:00+07:00'),
    ];
    const mau = mauVienTrai(ve(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />));
    expect(new Set(mau).size).toBe(1);
  });

  test('ba mức gấp ⇒ ba màu khác nhau', () => {
    const ds = [
      viec('a', 'A', NHOM.QUA_HAN, '2026-08-01T09:00:00+07:00'),
      viec('b', 'B', NHOM.SAP_HAN, '2026-08-06T09:00:00+07:00'),
      viec('c', 'C', NHOM.CON_LAI, null),
    ];
    expect(new Set(mauVienTrai(ve(<KhoiViec ds={ds} dangTai={false} onMo={() => {}} />))).size).toBe(3);
  });
});

describe('hai khối lớn phải phân biệt được với nhau', () => {
  const vienKhoi = h => h.match(/border-color:\s*([^;"]+)/)?.[1]?.trim();

  test('khối KPI và khối Việc mang hai màu nhận dạng khác nhau', () => {
    const kpiH = ve(<KhoiKpi ky="2026-08" setKy={() => {}} kpi={kpiRong} dangTai={false} onXemChiTiet={() => {}} />);
    const viecH = ve(<KhoiViec ds={[]} dangTai={false} onMo={() => {}} />);
    expect(vienKhoi(kpiH)).toBeDefined();
    expect(vienKhoi(viecH)).toBeDefined();
    expect(vienKhoi(kpiH)).not.toBe(vienKhoi(viecH));
  });

  test('khối lớn cắt nội dung theo góc bo — dải màu đầu khối không tràn ra góc vuông', () => {
    const h = ve(<KhoiViec ds={[]} dangTai={false} onMo={() => {}} />);
    expect(h).toMatch(/overflow:\s*hidden/);
    expect(h).toMatch(/border-radius:\s*16px/);
  });
});
