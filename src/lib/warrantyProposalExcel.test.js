import { test, expect, describe, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildProposalWorkbook } from './warrantyProposalExcel';

const NOW = new Date('2026-07-06T10:00:00');
const TEMPLATE = () => readFileSync('public/mau-de-xuat-bao-hanh.xlsx');

const P1 = {
  maPhieu: 'PBH-001', khachHang: 'Nguyễn Văn A', sdt: '0909', diaChi: '12 Lê Lợi',
  maDonHang: 'DH-77', ngayLap: '09/01/2026', maSP: 'RO-9', tinhTrang: 'Không lên nguồn',
  linhKienList: ['Bơm'], nguoiPhuTrach: 'Trần KTV',
  ngayText: 'Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam',
};
const P3 = {
  maPhieu: 'PBH-002', khachHang: 'Lê Thị B', sdt: '0911', diaChi: '3 Hai Bà Trưng',
  maDonHang: 'DH-88', ngayLap: '10/02/2026', maSP: 'RO-12', tinhTrang: 'Rò nước',
  linhKienList: ['Van', 'Màng RO', 'Adapter'], nguoiPhuTrach: 'Phạm KTV',
  ngayText: 'Hôm nay, ngày 6 tháng 7 năm 2026 tại TTBH công ty TNHH Euromade Việt Nam',
};

describe('buildProposalWorkbook', () => {
  let wb;
  beforeAll(async () => {
    const built = await buildProposalWorkbook(TEMPLATE(), [P1, P3]);
    const buf = await built.xlsx.writeBuffer();
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
  });

  test('mỗi phiếu 1 sheet, tên sheet theo mã phiếu', () => {
    expect(wb.worksheets.length).toBe(2);
    expect(wb.worksheets[0].name).toContain('PBH-001');
    expect(wb.worksheets[1].name).toContain('PBH-002');
  });

  test('sheet 1: header ghép nhãn + giá trị, §1 điền đúng ô', () => {
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A2').value)).toContain('ngày 6 tháng 7 năm 2026');
    expect(String(ws.getCell('A4').value)).toContain('Nguyễn Văn A');
    expect(String(ws.getCell('A5').value)).toContain('0909');
    expect(String(ws.getCell('A6').value)).toContain('12 Lê Lợi');
    expect(String(ws.getCell('A8').value)).toContain('DH-77');
    expect(String(ws.getCell('A9').value)).toContain('09/01/2026');
    expect(ws.getCell('B14').value).toBe('RO-9');
    expect(ws.getCell('E14').value).toBe('Không lên nguồn');
  });

  test('sheet 1 (1 linh kiện): 1 dòng linh kiện, chữ ký ở vị trí gốc (row 39)', () => {
    const ws = wb.worksheets[0];
    expect(ws.getCell('B26').value).toBe('Bơm');
    expect(ws.getCell('C26').value).toBe(1);
    expect(ws.getCell('A39').value).toBe('Trần KTV');
    expect(ws.getCell('E34').value).toBe('Bộ phận bảo hành');   // nhãn ký (thay Giám Đốc Kỹ Thuật)
    expect(ws.getCell('E39').value).toBe('Nguyễn Bá Ngọc');     // tên ký cố định
  });

  test('sheet 2 (3 linh kiện): 3 dòng liên tiếp, khối chữ ký dịch xuống 2 dòng', () => {
    const ws = wb.worksheets[1];
    expect(ws.getCell('B26').value).toBe('Van');
    expect(ws.getCell('B27').value).toBe('Màng RO');
    expect(ws.getCell('B28').value).toBe('Adapter');
    expect(ws.getCell('A26').value).toBe(1);
    expect(ws.getCell('A28').value).toBe(3);
    expect(ws.getCell('A41').value).toBe('Phạm KTV');
    expect(ws.getCell('E36').value).toBe('Bộ phận bảo hành');   // nhãn ký dịch xuống 2 (34→36)
    expect(ws.getCell('E41').value).toBe('Nguyễn Bá Ngọc');     // tên ký cố định (39→41)
  });

  test('giữ style: viền ô header §1 (A13) không mất sau khi ghi', () => {
    const ws = wb.worksheets[0];
    const b = ws.getCell('A13').border;
    expect(b && b.top && b.top.style).toBeTruthy();
  });

  test('giữ merge: tiêu đề A1:E1 và khối chữ ký được merge', () => {
    const ws2 = wb.worksheets[1];
    const merges = ws2.model.merges;
    expect(merges).toContain('A1:E1');
    expect(merges).toContain('A41:B41');
  });

  test('không linh kiện -> đúng 1 dòng trống, không còn FALSE của mẫu', async () => {
    const P0 = { ...P1, maPhieu: 'PBH-0LK', linhKienList: [] };
    const built = await buildProposalWorkbook(TEMPLATE(), [P0]);
    const rt = new ExcelJS.Workbook(); await rt.xlsx.load(await built.xlsx.writeBuffer());
    const ws = rt.worksheets[0];
    expect(['', null, undefined]).toContain(ws.getCell('B26').value); // 1 dòng linh kiện trống
    expect(ws.getCell('C26').value).toBe(1);
    expect([null, undefined]).toContain(ws.getCell('E26').value);     // đã xoá FALSE của mẫu
    expect(ws.getCell('A39').value).toBe('Trần KTV');                 // chữ ký ở vị trí gốc (extra=0)
  });

  test('tên sheet: loại ký tự cấm và chống trùng bằng hậu tố', async () => {
    const A = { ...P1, maPhieu: 'PBH/01:X*?' };
    const B = { ...P1, maPhieu: 'PBH-DUP' };
    const C = { ...P1, maPhieu: 'PBH-DUP' };
    const built = await buildProposalWorkbook(TEMPLATE(), [A, B, C]);
    const names = built.worksheets.map(w => w.name);
    expect(names[0]).not.toMatch(/[[\]*?/\\:]/);   // hết ký tự cấm
    expect(names.every(n => n.length <= 31)).toBe(true);
    expect(new Set(names).size).toBe(3);           // 3 tên phân biệt (đã chống trùng)
    expect(names[2]).toContain('(2)');
  });
});
