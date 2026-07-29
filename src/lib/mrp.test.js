import { describe, it, expect } from 'vitest';
import { computeSafetyStock, computeReplenishQty } from './mrp';

describe('computeSafetyStock — TB bán/ngày × (lead × 2 + an toàn)', () => {
  it('ví dụ thật F-CB-BNC: bán 1473/90 ngày, lead 15, an toàn 30', () => {
    expect(computeSafetyStock({ totalSales90d: 1473, leadTimeDays: 15, backupStockDays: 30 })).toBe(982);
  });

  it('số tròn: 10 cái/ngày, lead 5, an toàn 10 → 10 × (10 + 10)', () => {
    expect(computeSafetyStock({ totalSales90d: 900, leadTimeDays: 5, backupStockDays: 10 })).toBe(200);
  });

  it('không bán gì trong 90 ngày → 0', () => {
    expect(computeSafetyStock({ totalSales90d: 0, leadTimeDays: 15, backupStockDays: 30 })).toBe(0);
  });

  it('chưa khai lead lẫn an toàn → 0', () => {
    expect(computeSafetyStock({ totalSales90d: 900, leadTimeDays: 0, backupStockDays: 0 })).toBe(0);
  });

  it('giá trị rỗng coi như 0', () => {
    expect(computeSafetyStock({})).toBe(0);
    expect(computeSafetyStock({ totalSales90d: '900', leadTimeDays: '5', backupStockDays: '10' })).toBe(200);
  });
});

describe('computeReplenishQty — tồn an toàn − tồn hiện tại, không âm', () => {
  it('ví dụ thật F-CB-BNC: 982 − 524', () => {
    expect(computeReplenishQty({
      totalSales90d: 1473, leadTimeDays: 15, backupStockDays: 30, totalQuantity: 524,
    })).toBe(458);
  });

  it('tồn thừa hơn mức an toàn → 0, không trả số âm', () => {
    expect(computeReplenishQty({
      totalSales90d: 900, leadTimeDays: 5, backupStockDays: 10, totalQuantity: 5000,
    })).toBe(0);
  });

  it('chưa có tồn nào → bằng đúng tồn an toàn', () => {
    expect(computeReplenishQty({
      totalSales90d: 900, leadTimeDays: 5, backupStockDays: 10, totalQuantity: 0,
    })).toBe(200);
  });
});
