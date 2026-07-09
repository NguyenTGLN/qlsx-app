import { describe, it, expect } from 'vitest';
import { validateManualBom, buildBomInserts } from './bomManualEntry';

describe('validateManualBom', () => {
  const prod = { code: 'TP01', name: 'Máy lọc A' };

  it('lỗi khi chưa chọn thành phẩm', () => {
    const r = validateManualBom(null, [{ component_code: 'LK1', quantity: '2' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/thành phẩm/i);
  });

  it('lỗi khi không có linh kiện nào được chọn', () => {
    const r = validateManualBom(prod, [{ component_code: '', quantity: '' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/linh kiện/i);
  });

  it('lỗi khi số lượng <= 0 hoặc không phải số', () => {
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: '0' }]).ok).toBe(false);
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: '-3' }]).ok).toBe(false);
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: 'abc' }]).ok).toBe(false);
  });

  it('bỏ qua dòng chưa chọn linh kiện khi kiểm tra số lượng', () => {
    const r = validateManualBom(prod, [
      { component_code: 'LK1', quantity: '2' },
      { component_code: '', quantity: '' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('hợp lệ khi có thành phẩm + linh kiện + SL > 0', () => {
    const r = validateManualBom(prod, [{ component_code: 'LK1', quantity: '2.5' }]);
    expect(r.ok).toBe(true);
  });
});

describe('buildBomInserts', () => {
  const prod = { code: 'TP01', name: 'Máy lọc A' };

  it('tạo bản ghi cho các linh kiện mới', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', component_name: 'Lõi 1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK2', component_name: 'Lõi 2', unit: 'Bộ', quantity: '1' },
    ], new Set());
    expect(skipped).toBe(0);
    expect(inserts).toEqual([
      { product_code: 'TP01', product_name: 'Máy lọc A', component_code: 'LK1', unit: 'Cái', quantity: 2 },
      { product_code: 'TP01', product_name: 'Máy lọc A', component_code: 'LK2', unit: 'Bộ', quantity: 1 },
    ]);
  });

  it('bỏ qua linh kiện đã có sẵn trong DB', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK2', unit: 'Bộ', quantity: '1' },
    ], new Set(['LK1']));
    expect(skipped).toBe(1);
    expect(inserts.map(i => i.component_code)).toEqual(['LK2']);
  });

  it('bỏ qua linh kiện trùng trong cùng lô nhập (giữ dòng đầu)', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK1', unit: 'Cái', quantity: '5' },
    ], new Set());
    expect(skipped).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].quantity).toBe(2);
  });

  it('bỏ dòng chưa chọn linh kiện, ép quantity về số', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: '', unit: '', quantity: '' },
      { component_code: 'LK9', unit: 'Cái', quantity: '3' },
    ], new Set());
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ component_code: 'LK9', quantity: 3 });
    expect(skipped).toBe(0);
  });

  it('chấp nhận existingComps là mảng', () => {
    const { skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
    ], ['LK1']);
    expect(skipped).toBe(1);
  });
});
