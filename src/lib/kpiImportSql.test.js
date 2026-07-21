import { describe, it, expect } from 'vitest';
import { q, ngayCuoiKy, sqlChiTieuKemGhiChu } from './kpiImportSql';

describe('q — literal SQL', () => {
  it('rỗng/null thành null chứ không phải chuỗi rỗng', () => {
    expect(q(null)).toBe('null');
    expect(q(undefined)).toBe('null');
    expect(q('')).toBe('null');
  });

  it('nhân đôi dấu nháy đơn — ghi chú tiếng Việt hay có "nghỉ 1/2 ngày, cty\'s"', () => {
    expect(q("Nghỉ quá 1 ngày, đi muộn 17/6 'lý do'")).toBe(
      "'Nghỉ quá 1 ngày, đi muộn 17/6 ''lý do'''");
  });
});

describe('ngayCuoiKy', () => {
  it('tháng 30 ngày', () => expect(ngayCuoiKy('2026-06')).toBe('2026-06-30'));
  it('tháng 31 ngày', () => expect(ngayCuoiKy('2026-07')).toBe('2026-07-31'));
  it('tháng 2 năm thường', () => expect(ngayCuoiKy('2026-02')).toBe('2026-02-28'));
  it('tháng 2 năm nhuận', () => expect(ngayCuoiKy('2024-02')).toBe('2024-02-29'));
  it('tháng 12 không tràn sang năm sau', () => expect(ngayCuoiKy('2026-12')).toBe('2026-12-31'));
});

describe('sqlChiTieuKemGhiChu', () => {
  const ins = "insert into kpi_chi_tieu (ky, ten) values ('2026-06', 'CHUYÊN CẦN')";

  it('không có ghi chú → giữ nguyên câu insert, không sinh nhật ký thừa', () => {
    expect(sqlChiTieuKemGhiChu(ins, { ghiChu: null, ngay: '2026-06-30' })).toBe(ins + ';');
    expect(sqlChiTieuKemGhiChu(ins, { ghiChu: '   ', ngay: '2026-06-30' })).toBe(ins + ';');
  });

  // Ghi chú cột O là LÝ DO trừ điểm của kỳ đã chấm. Không sinh kpi_nhat_ky thì popup
  // bằng chứng hiện "Chưa có ghi nhận nào" trong khi diem_chot = 3/10 — nhân viên
  // khiếu nại thì không ai chứng minh được vì sao mất 7 điểm.
  it('có ghi chú → bọc CTE sinh kèm 1 dòng kpi_nhat_ky', () => {
    const out = sqlChiTieuKemGhiChu(ins, {
      ghiChu: 'Nghỉ quá 1 ngày. Đi muộn 17/6', ngay: '2026-06-30',
    });
    expect(out).toContain('with ct as (');
    expect(out).toContain('returning id');
    expect(out).toContain('insert into kpi_nhat_ky');
    expect(out).toContain('select id,');
    expect(out).toContain('from ct;');
    expect(out).toContain("'Nghỉ quá 1 ngày. Đi muộn 17/6'");
  });

  it('so_diem = 0 — chỉ giữ bằng chứng, KHÔNG được đụng vào phép tính điểm', () => {
    const out = sqlChiTieuKemGhiChu(ins, { ghiChu: 'x', ngay: '2026-06-30' });
    expect(out).toMatch(/select id,\s*'2026-06-30',\s*0,/);
  });

  it('nguồn TAY và người ghi ghi rõ là nhập từ Excel', () => {
    const out = sqlChiTieuKemGhiChu(ins, { ghiChu: 'x', ngay: '2026-06-30' });
    expect(out).toContain("'TAY'");
    expect(out).toContain("'Nhập từ Excel'");
  });

  it('ngày là ngày cuối kỳ, không phải hôm nay', () => {
    const out = sqlChiTieuKemGhiChu(ins, { ghiChu: 'x', ngay: ngayCuoiKy('2026-06') });
    expect(out).toContain("'2026-06-30'");
  });

  it('ghi chú có nháy đơn không làm vỡ câu SQL', () => {
    const out = sqlChiTieuKemGhiChu(ins, { ghiChu: "quên ký 'biên bản'", ngay: '2026-06-30' });
    expect(out).toContain("'quên ký ''biên bản'''");
  });

  it('ghi chú dạng số (cột O đôi khi là tỉ lệ) vẫn giữ được', () => {
    const out = sqlChiTieuKemGhiChu(ins, { ghiChu: 1.021, ngay: '2026-06-30' });
    expect(out).toContain("'1.021'");
  });
});
