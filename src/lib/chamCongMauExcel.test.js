import { describe, it, expect } from 'vitest';
import { dongMauChamCong, TEN_SHEET_MAU, TEN_TEP_MAU } from './chamCongMauExcel';
import { docDongChamCong } from './chamCongExcel';

describe('dongMauChamCong', () => {
  it('file mẫu phải ĐỌC ĐƯỢC bằng chính bộ đọc của app — chống mẫu trôi khỏi bộ đọc', () => {
    const kq = docDongChamCong(dongMauChamCong());
    expect(kq.dong).toHaveLength(5);
  });

  it('đọc ra đúng số liệu của 5 dòng ví dụ', () => {
    const { dong } = docDongChamCong(dongMauChamCong());
    expect(dong[0]).toMatchObject({ ngay: '2026-08-03', tangCa: 135, nghi: false });
    expect(dong[1]).toMatchObject({ diMuon: 6, nghi: false });
    expect(dong[2]).toMatchObject({ veSom: 15, nghi: false });
    expect(dong[3]).toMatchObject({ nghi: true, nghiText: 'Nghỉ sáng' });
    expect(dong[4]).toMatchObject({ nghi: true, nghiText: 'Nghỉ' });
  });

  it('có đủ 3 dòng tiêu đề rồi mới tới dòng tên cột, y khuôn máy chấm công xuất ra', () => {
    const aoa = dongMauChamCong();
    expect(aoa[0][0]).toContain('EUROMADE');
    expect(aoa[3]).toEqual([
      'Tên nhân viên', 'Ngày', 'Thứ', 'Giờ in sáng', 'Giờ in chiều',
      'Giờ out (gồm tăng ca)', 'Tăng ca', 'Đi muộn (phút)', 'Về sớm (phút)', 'Nghỉ',
    ]);
  });

  it('tên sheet và tên tệp đúng như bộ đọc mong đợi', () => {
    expect(TEN_SHEET_MAU).toBe('CHI TIẾT THEO NGÀY');
    expect(TEN_TEP_MAU).toMatch(/\.xlsx$/);
  });
});
