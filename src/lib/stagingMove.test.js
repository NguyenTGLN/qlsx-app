import { describe, it, expect } from 'vitest';
import { buildStagingLocation, buildStagingMoves, buildStagingLogs } from './stagingMove';

describe('buildStagingLocation', () => {
  it('ngày phiếu YYYY-MM-DD → SX4-DD/MM/YYYY', () => {
    expect(buildStagingLocation('2026-07-24')).toBe('SX4-24/07/2026');
  });

  it('ngày rỗng / sai định dạng → ném lỗi (không tạo vị trí rác trong kho)', () => {
    expect(() => buildStagingLocation('')).toThrow();
    expect(() => buildStagingLocation('24/07/2026')).toThrow();
    expect(() => buildStagingLocation(undefined)).toThrow();
  });
});

describe('buildStagingMoves', () => {
  const DEST = 'SX4-24/07/2026';

  it('gộp nhiều vị trí nguồn của cùng 1 mã thành 1 dòng chuyển', () => {
    const { moves, totalQty, totalCodes, skippedCodes } = buildStagingMoves([
      { code: 'A', name: 'Linh kiện A', unit: 'Cái', allocations: [
        { stock_id: 1, location: 'HH1', before: 10, taken: 10, remaining: 0 },
        { stock_id: 2, location: 'HH2', before: 8, taken: 5, remaining: 3 },
      ] },
    ], DEST);
    expect(totalCodes).toBe(1);
    expect(totalQty).toBe(15);
    expect(skippedCodes).toEqual([]);
    expect(moves[0]).toMatchObject({ code: 'A', name: 'Linh kiện A', unit: 'Cái', total: 15 });
    expect(moves[0].sources.map(s => s.location)).toEqual(['HH1', 'HH2']);
    expect(moves[0].sources[1]).toMatchObject({ stock_id: 2, before: 8, taken: 5, remaining: 3 });
  });

  it('mã thiếu hàng vẫn chuyển phần đang có', () => {
    const { moves, totalQty } = buildStagingMoves([
      { code: 'A', name: 'a', unit: 'Cái', requiredQty: 100, missing: 94, isShortage: true,
        allocations: [{ stock_id: 1, location: 'HH1', before: 6, taken: 6, remaining: 0 }] },
    ], DEST);
    expect(moves).toHaveLength(1);
    expect(totalQty).toBe(6);
  });

  it('mã hết sạch hàng (không có dòng phân bổ) → vào skippedCodes, không tạo move', () => {
    const { moves, skippedCodes, totalQty } = buildStagingMoves([
      { code: 'B', name: 'b', unit: 'Cái', allocations: [] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['B']);
    expect(totalQty).toBe(0);
  });

  it('bỏ dòng tháo máy (SL âm, không có stock_id)', () => {
    const { moves, skippedCodes } = buildStagingMoves([
      { code: 'C', name: 'c', unit: 'Cái', allocations: [
        { stock_id: null, location: 'SX9-PSX-20260724-01', before: 0, taken: -4, remaining: 4 },
      ] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['C']);
  });

  it('bỏ dòng nguồn đã nằm sẵn ở vị trí đích (không trừ rồi cộng lại chính nó)', () => {
    const { moves, totalQty } = buildStagingMoves([
      { code: 'D', name: 'd', unit: 'Cái', allocations: [
        { stock_id: 9, location: DEST, before: 20, taken: 20, remaining: 0 },
        { stock_id: 10, location: 'HH3', before: 5, taken: 5, remaining: 0 },
      ] },
    ], DEST);
    expect(moves[0].sources).toHaveLength(1);
    expect(moves[0].sources[0].stock_id).toBe(10);
    expect(moves[0].total).toBe(5);
    expect(totalQty).toBe(5);
  });

  it('mã nằm TRỌN ở vị trí đích → không có gì để chuyển', () => {
    const { moves, skippedCodes } = buildStagingMoves([
      { code: 'E', name: 'e', unit: 'Cái', allocations: [
        { stock_id: 9, location: DEST, before: 20, taken: 20, remaining: 0 },
      ] },
    ], DEST);
    expect(moves).toEqual([]);
    expect(skippedCodes).toEqual(['E']);
  });

  it('thiếu vị trí đích → ném lỗi', () => {
    expect(() => buildStagingMoves([], '')).toThrow();
  });

  it('unit rỗng → mặc định "Cái" (dòng tồn mới luôn cần đơn vị)', () => {
    const { moves } = buildStagingMoves([
      { code: 'F', name: 'f', allocations: [{ stock_id: 1, location: 'HH1', before: 2, taken: 2, remaining: 0 }] },
    ], DEST);
    expect(moves[0].unit).toBe('Cái');
  });

  it('allocations rỗng/null → kế hoạch rỗng, không ném lỗi', () => {
    expect(buildStagingMoves(null, DEST)).toEqual({ moves: [], totalQty: 0, totalCodes: 0, skippedCodes: [] });
  });
});

describe('buildStagingLogs', () => {
  const DEST = 'SX4-24/07/2026';
  const BASE_MS = 1753000000000;
  const move = {
    code: 'A', name: 'Linh kiện A', unit: 'Cái', total: 15,
    sources: [
      { stock_id: 1, location: 'HH1', before: 10, taken: 10, remaining: 0 },
      { stock_id: 2, location: 'HH2', before: 8, taken: 5, remaining: 3 },
    ],
  };
  const ctx = { orderCode: 'PCV-20260724-01', destLocation: DEST, destBefore: 20, createdBy: 'NV1', baseTimeMs: BASE_MS };

  it('mọi dòng thoả before + taken === after', () => {
    const rows = buildStagingLogs(move, ctx);
    expect(rows).toHaveLength(3); // 2 dòng xuất (nguồn) + 1 dòng nhập (đích)
    rows.forEach(row => {
      expect(row.quantity_before + row.quantity_taken).toBe(row.quantity_after);
    });
  });

  it('đảo theo công thức huy_phieu (stock -= quantity_taken) trả tồn về đúng trước khi chuyển', () => {
    const rows = buildStagingLogs(move, ctx);
    // Tồn NGAY SAU khi chuyển (những gì thực sự nằm trong inventory_stock lúc này)
    const stock = { HH1: 0, HH2: 3, [DEST]: 35 };
    rows.forEach(row => {
      stock[row.location] -= row.quantity_taken;
    });
    expect(stock.HH1).toBe(10); // = before của dòng nguồn HH1
    expect(stock.HH2).toBe(8);  // = before của dòng nguồn HH2
    expect(stock[DEST]).toBe(20); // = destBefore
  });

  it('dòng nhập ở vị trí đích đóng dấu sau các dòng xuất', () => {
    const rows = buildStagingLogs(move, ctx);
    const destRow = rows[rows.length - 1];
    expect(destRow.location).toBe(DEST);
    const sourceRows = rows.slice(0, -1);
    expect(sourceRows.every(r => r.location !== DEST)).toBe(true);
    sourceRows.forEach(srcRow => {
      expect(new Date(destRow.created_at).getTime()).toBeGreaterThan(new Date(srcRow.created_at).getTime());
    });
  });

  it('mọi dòng mang order_code và product_code CHUYEN_SX', () => {
    const rows = buildStagingLogs(move, ctx);
    rows.forEach(row => {
      expect(row.order_code).toBe(ctx.orderCode);
      expect(row.product_code).toBe('CHUYEN_SX');
    });
  });
});
