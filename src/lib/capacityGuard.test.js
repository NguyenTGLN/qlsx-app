import { describe, it, expect } from 'vitest';
import { capacityMap, missingCapacities } from './capacityGuard';

describe('capacityMap', () => {
  it('chỉ nhận dòng có capacity_per_hour > 0', () => {
    const m = capacityMap([
      { product_code: 'A', capacity_per_hour: 20 },
      { product_code: 'B', capacity_per_hour: 0 },
      { product_code: 'C', capacity_per_hour: null },
    ]);
    expect(m.get('A')).toBe(20);
    expect(m.has('B')).toBe(false);
    expect(m.has('C')).toBe(false);
  });
  it('trim mã và ép kiểu số', () => {
    const m = capacityMap([{ product_code: ' A ', capacity_per_hour: '10' }]);
    expect(m.get('A')).toBe(10);
  });
  it('đầu vào null/undefined → map rỗng', () => {
    expect(capacityMap(null).size).toBe(0);
    expect(capacityMap(undefined).size).toBe(0);
  });
});

describe('missingCapacities', () => {
  it('trả về mã không có định mức hợp lệ', () => {
    const caps = [{ product_code: 'A', capacity_per_hour: 20 }];
    expect(missingCapacities(['A', 'B'], caps)).toEqual(['B']);
  });
  it('mã có dòng nhưng capacity <= 0 vẫn coi là thiếu', () => {
    const caps = [{ product_code: 'A', capacity_per_hour: 0 }];
    expect(missingCapacities(['A'], caps)).toEqual(['A']);
  });
  it('bảng định mức rỗng → mọi mã đều thiếu', () => {
    expect(missingCapacities(['A', 'B'], [])).toEqual(['A', 'B']);
  });
  it('unique + giữ thứ tự, trim, bỏ rỗng', () => {
    expect(missingCapacities([' A ', 'A', '', 'B'], [])).toEqual(['A', 'B']);
  });
  it('tất cả có định mức → mảng rỗng', () => {
    const caps = [
      { product_code: 'A', capacity_per_hour: 20 },
      { product_code: 'B', capacity_per_hour: 5 },
    ];
    expect(missingCapacities(['A', 'B'], caps)).toEqual([]);
  });
});
