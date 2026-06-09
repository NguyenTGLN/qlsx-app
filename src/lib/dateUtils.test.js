import { describe, it, expect } from 'vitest';
import { parseImportDate } from './dateUtils';

describe('parseImportDate', () => {
  it('giữ nguyên chuỗi ISO YYYY-MM-DD', () => {
    expect(parseImportDate('2026-06-09')).toBe('2026-06-09');
  });
  it('parse dd/MM/yyyy về ISO', () => {
    expect(parseImportDate('09/06/2026')).toBe('2026-06-09');
  });
  it('parse số serial Excel (45817 = 2025-06-09)', () => {
    expect(parseImportDate(45817)).toBe('2025-06-09');
  });
  it('trả null khi rỗng / không hợp lệ', () => {
    expect(parseImportDate('')).toBeNull();
    expect(parseImportDate(null)).toBeNull();
    expect(parseImportDate(undefined)).toBeNull();
    expect(parseImportDate('không phải ngày')).toBeNull();
  });
});
