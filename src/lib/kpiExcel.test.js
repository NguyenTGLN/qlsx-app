import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { dungDuLieuSheet, xuatExcelKpi } from './kpiExcel';

// saveAs cần DOM; thay bằng hàm giả để giữ lại tên file mà kiểm.
// vi.hoisted vì vi.mock được kéo lên trên các import — mảng khai báo thường sẽ chưa tồn tại.
const daLuu = vi.hoisted(() => []);
vi.mock('file-saver', () => ({ saveAs: (blob, ten) => { daLuu.push({ blob, ten }); } }));

describe('dungDuLieuSheet', () => {
  const rows = [
    { id: 'a', cap_do: 'CA_NHAN', nhom: 'A. NỘI QUY', ten: 'QUY ĐỊNH',
      chi_tieu: 10, trong_so: 30, diem_chot: 10 },
    { id: 'b', cap_do: 'CA_NHAN', nhom: 'A. NỘI QUY', ten: 'CHUYÊN CẦN',
      chi_tieu: 10, trong_so: 70, diem_chot: 5 },
  ];

  it('chèn dòng nhóm trước các chỉ tiêu cùng nhóm', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    expect(d.dong[0].laNhom).toBe(true);
    expect(d.dong[0].ten).toBe('A. NỘI QUY');
  });

  it('mỗi chỉ tiêu có đủ cột như bảng Excel gốc', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    const ct = d.dong[1];
    expect(ct.chi_tieu).toBe(10);
    expect(ct.trong_so).toBe(30);
    expect(ct.tiLePhanTram).toBe(100);
    expect(ct.diemQuyDoi).toBe(30);
  });

  it('tổng khớp engine', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    expect(d.tongKpi).toBeCloseTo(65);   // 30 + 70×0.5
    expect(d.tongTrongSo).toBe(100);
  });

  it('ghép nhật ký thành cột ghi chú', () => {
    const logs = [{ chi_tieu_id: 'b', ngay: '2026-06-17', so_diem: -1, ly_do: 'Đi muộn' }];
    const d = dungDuLieuSheet(rows, logs, 'Lê Văn Bích', '2026-06');
    expect(d.dong[2].ghiChu).toContain('Đi muộn');
  });

  // ── Bẫy 1: dòng thưởng ngoài trọng số ──────────────────────────────────────
  // `diemDat` của dòng thưởng LUÔN là 0 và `chi_tieu` là null — điểm thật nằm ở
  // `diemQuyDoi`. Đổ thẳng ra Excel sẽ in "0" ở cột Điểm đạt cho một dòng vừa được
  // cộng 1.5 điểm, người đọc bản in không thể nào hiểu đúng.
  describe('dòng thưởng ngoài trọng số', () => {
    const rowsThuong = [
      { id: 'a', cap_do: 'CA_NHAN', ten: 'QUY ĐỊNH', chi_tieu: 10, trong_so: 100, diem_chot: 10 },
      { id: 't', cap_do: 'CA_NHAN', ten: 'CỘNG THÊM NGOÀI TRỌNG SỐ', chi_tieu: null, trong_so: 0 },
    ];
    const logs = [{ chi_tieu_id: 't', ngay: '2026-06-30', so_diem: 1.5, ly_do: 'Ý tưởng tốt' }];

    it('không in "0" ở các cột không áp dụng', () => {
      const d = dungDuLieuSheet(rowsThuong, logs, 'Bích', '2026-06');
      const t = d.dong.find(r => r.ten === 'CỘNG THÊM NGOÀI TRỌNG SỐ');
      expect(t.laThuong).toBe(true);
      expect(t.diemDat).toBeNull();
      expect(t.chi_tieu).toBeNull();
      expect(t.tiLePhanTram).toBeNull();
      expect(t.trong_so).toBeNull();
      expect(t.diemMat).toBeNull();
    });

    it('điểm thật của dòng thưởng nằm ở cột quy đổi', () => {
      const d = dungDuLieuSheet(rowsThuong, logs, 'Bích', '2026-06');
      const t = d.dong.find(r => r.ten === 'CỘNG THÊM NGOÀI TRỌNG SỐ');
      expect(t.diemQuyDoi).toBeCloseTo(1.5);
      expect(d.tongKpi).toBeCloseTo(101.5);
    });

    it('chốt tay ở dòng thưởng đè lên nhật ký, ghi chú nói rõ nguồn', () => {
      const rowsChot = rowsThuong.map(r =>
        r.id === 't' ? { ...r, diem_chot: 3, chot_boi: 'Nguyên' } : r);
      const d = dungDuLieuSheet(rowsChot, logs, 'Bích', '2026-06');
      const t = d.dong.find(r => r.ten === 'CỘNG THÊM NGOÀI TRỌNG SỐ');
      expect(t.diemQuyDoi).toBeCloseTo(3);
      expect(t.ghiChu).toContain('chốt tay');
      expect(t.ghiChu).toContain('Nguyên');
    });
  });

  // ── Bẫy 2: dòng liên kết bộ phận ───────────────────────────────────────────
  // Điểm đến từ dòng chung, KHÔNG từ `diem_chot` của dòng cá nhân. Ghi chú phải nói
  // đúng nguồn, và nhật ký kèm theo phải là nhật ký của dòng chung.
  describe('dòng liên kết bộ phận', () => {
    const rowsBp = [
      { id: 'bp1', cap_do: 'BO_PHAN', lien_ket_bo_phan: 'CC',
        ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 0 },
      { id: 'c1', cap_do: 'CA_NHAN', lien_ket_bo_phan: 'CC',
        ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 100, diem_chot: 9 },
    ];
    const logs = [{ chi_tieu_id: 'bp1', ngay: '2026-06-05', so_diem: -2, ly_do: 'Cả tổ đi muộn' }];

    it('lấy điểm từ dòng chung, bỏ qua diem_chot của dòng cá nhân', () => {
      const d = dungDuLieuSheet(rowsBp, logs, 'Bích', '2026-06');
      const c = d.dong.find(r => !r.laNhom);
      expect(c.diemDat).toBe(8);          // 10 − 2 của dòng chung, KHÔNG phải 9
      expect(c.diemQuyDoi).toBeCloseTo(80);
    });

    it('ghi chú nêu là chấm chung và kèm nhật ký của dòng chung', () => {
      const d = dungDuLieuSheet(rowsBp, logs, 'Bích', '2026-06');
      const c = d.dong.find(r => !r.laNhom);
      expect(c.ghiChu).toContain('bộ phận');
      expect(c.ghiChu).toContain('Cả tổ đi muộn');
    });

    it('dòng BO_PHAN không xuất hiện như một chỉ tiêu của cá nhân', () => {
      const d = dungDuLieuSheet(rowsBp, logs, 'Bích', '2026-06');
      expect(d.dong.filter(r => !r.laNhom)).toHaveLength(1);
    });
  });

  // Σ trọng số trong file xuất phải dùng CHUNG luật với cảnh báo trên giao diện,
  // nếu không file Excel sẽ nói 100 trong khi màn hình đang báo lệch.
  it('tổng trọng số dùng chung luật với kiemTraTrongSo (dòng chi_tieu = 0 vẫn cộng)', () => {
    const d = dungDuLieuSheet([
      { id: 'a', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 60 },
      { id: 'b', cap_do: 'CA_NHAN', ten: 'LỖI NHẬP', chi_tieu: 0, trong_so: 40 },
    ], [], 'Bích', '2026-06');
    expect(d.tongTrongSo).toBe(100);
    expect(d.trongSoHopLe).toBe(true);
  });

  it('báo trọng số lệch để người mở file biết bảng chưa chuẩn', () => {
    const d = dungDuLieuSheet(
      [{ id: 'a', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 90 }],
      [], 'Bích', '2026-06');
    expect(d.trongSoHopLe).toBe(false);
    expect(d.tongTrongSo).toBe(90);
  });
});

// Dựng workbook thật rồi đọc ngược lại. Chỉ số cột (`getCell(8)` là quy đổi hay điểm mất?)
// và dòng TỔNG chỉ sai lúc chạy, test dữ liệu thuần ở trên không bắt được.
describe('xuatExcelKpi', () => {
  const rows = [
    { id: 'a', cap_do: 'CA_NHAN', nhom: 'A. NỘI QUY', ten: 'QUY ĐỊNH',
      chi_tieu: 10, trong_so: 100, diem_chot: 5 },
    { id: 't', cap_do: 'CA_NHAN', ten: 'CỘNG THÊM NGOÀI TRỌNG SỐ', chi_tieu: null, trong_so: 0 },
  ];
  const logs = [{ chi_tieu_id: 't', ngay: '2026-06-30', so_diem: 1.5, ly_do: 'Ý tưởng tốt' }];

  async function docLai(danhSach, ky) {
    daLuu.length = 0;
    await xuatExcelKpi(danhSach, ky);
    const buf = await daLuu[0].blob.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    return { wb, ten: daLuu[0].ten };
  }

  it('đặt tên file theo kỳ và mỗi người một sheet', async () => {
    const { wb, ten } = await docLai(
      [{ rows, logs, tenNhanVien: 'Lê Văn Bích' }, { rows, logs, tenNhanVien: 'Trần Xuân' }],
      '2026-06');
    expect(ten).toBe('KPI-2026-06.xlsx');
    expect(wb.worksheets.map(w => w.name)).toEqual(['Lê Văn Bích', 'Trần Xuân']);
  });

  it('dòng TỔNG rơi đúng cột trọng số / quy đổi / điểm mất', async () => {
    const { wb } = await docLai([{ rows, logs, tenNhanVien: 'Bích' }], '2026-06');
    const ws = wb.worksheets[0];
    const tong = ws.getRow(ws.rowCount);
    expect(tong.getCell(1).value).toBe('TỔNG');
    expect(tong.getCell(4).value).toBe(100);    // Σ trọng số
    expect(tong.getCell(8).value).toBe(51.5);   // 100×0.5 + 1.5 thưởng
    expect(tong.getCell(9).value).toBe(50);     // điểm mất
  });

  it('dòng thưởng không in số 0 ở cột điểm đạt / chỉ tiêu', async () => {
    const { wb } = await docLai([{ rows, logs, tenNhanVien: 'Bích' }], '2026-06');
    const ws = wb.worksheets[0];
    let dongThuong = null;
    ws.eachRow(r => { if (r.getCell(1).value === 'CỘNG THÊM NGOÀI TRỌNG SỐ') dongThuong = r; });
    expect(dongThuong).not.toBeNull();
    expect(dongThuong.getCell(3).value).toBeNull();       // chỉ tiêu
    expect(dongThuong.getCell(6).value).toBeNull();       // điểm đạt
    expect(dongThuong.getCell(7).value).toBeNull();       // tỉ lệ
    expect(dongThuong.getCell(4).value).toBe('ngoài TS'); // trọng số → nhãn, không phải 0
    expect(dongThuong.getCell(8).value).toBe(1.5);        // điểm thật nằm ở quy đổi
  });

  it('cảnh báo Σ trọng số lệch nằm ngay trong file', async () => {
    const lech = [{ id: 'a', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 90 }];
    const { wb } = await docLai([{ rows: lech, logs: [], tenNhanVien: 'Bích' }], '2026-06');
    const ws = wb.worksheets[0];
    const chu = [];
    ws.eachRow(r => chu.push(String(r.getCell(1).value ?? '')));
    expect(chu.some(s => s.includes('Σ trọng số = 90'))).toBe(true);
  });
});
