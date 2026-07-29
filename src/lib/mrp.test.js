import { describe, it, expect } from 'vitest';
import { computeSafetyStock, computeReplenishQty, topoSort, BomCycleError, explodeNetted } from './mrp';

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

  it('làm tròn LÊN khi phần lẻ ≥ 0,5 — chốt Math.round, loại Math.floor', () => {
    // 1000/90 = 11,111 ; × (1×2+3) = 55,555 → 56
    expect(computeSafetyStock({ totalSales90d: 1000, leadTimeDays: 1, backupStockDays: 3 })).toBe(56);
  });

  it('làm tròn XUỐNG khi phần lẻ < 0,5 — chốt Math.round, loại Math.ceil', () => {
    // 1000/90 = 11,111 ; × (1×2+1) = 33,333 → 33
    expect(computeSafetyStock({ totalSales90d: 1000, leadTimeDays: 1, backupStockDays: 1 })).toBe(33);
  });

  it('một ô gõ nhầm dấu âm KHÔNG được ăn mất ô còn lại', () => {
    // lead âm → coi như 0, nhưng an toàn 30 ngày vẫn giữ nguyên → 10 × 30
    expect(computeSafetyStock({ totalSales90d: 900, leadTimeDays: -5, backupStockDays: 30 })).toBe(300);
    // an toàn âm → coi như 0, nhưng lead 5 ngày vẫn giữ nguyên → 10 × (5×2)
    expect(computeSafetyStock({ totalSales90d: 900, leadTimeDays: 5, backupStockDays: -50 })).toBe(100);
  });

  it('cả hai ô đều âm → 0, không trả số âm', () => {
    expect(computeSafetyStock({ totalSales90d: 900, leadTimeDays: -5, backupStockDays: -30 })).toBe(0);
  });

  it('doanh số âm (dữ liệu hỏng) → 0, không trả số âm', () => {
    expect(computeSafetyStock({ totalSales90d: -900, leadTimeDays: 5, backupStockDays: 10 })).toBe(0);
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

  it('tồn hiện tại dạng chuỗi vẫn tính đúng', () => {
    expect(computeReplenishQty({
      totalSales90d: 900, leadTimeDays: 5, backupStockDays: 10, totalQuantity: '50',
    })).toBe(150);
  });
});

describe('topoSort — cha luôn đứng trước con', () => {
  it('chuỗi thẳng A → B → C', () => {
    const bomMap = {
      A: [{ component: 'B', qty: 1 }],
      B: [{ component: 'C', qty: 1 }],
    };
    expect(topoSort(bomMap)).toEqual(['A', 'B', 'C']);
  });

  it('một mã là con của 2 cha thì đứng sau cả hai', () => {
    const bomMap = {
      A: [{ component: 'X', qty: 2 }],
      B: [{ component: 'X', qty: 3 }],
    };
    const order = topoSort(bomMap);
    expect(order.indexOf('X')).toBeGreaterThan(order.indexOf('A'));
    expect(order.indexOf('X')).toBeGreaterThan(order.indexOf('B'));
    expect(order).toHaveLength(3);
  });

  it('BOM rỗng trả mảng rỗng', () => {
    expect(topoSort({})).toEqual([]);
  });

  it('vòng lặp trực tiếp A → B → A thì ném BomCycleError kèm đúng vòng', () => {
    const bomMap = {
      A: [{ component: 'B', qty: 1 }],
      B: [{ component: 'A', qty: 1 }],
    };
    expect(() => topoSort(bomMap)).toThrow(BomCycleError);
    try {
      topoSort(bomMap);
    } catch (e) {
      expect(e.cycle).toEqual(['A', 'B', 'A']);
      expect(e.message).toContain('A → B → A');
    }
  });

  it('mã tự trỏ vào chính nó cũng bị bắt', () => {
    expect(() => topoSort({ A: [{ component: 'A', qty: 1 }] })).toThrow(BomCycleError);
  });

  // Giữ phép cắt path.slice(path.indexOf(n)). Hai ca trên đều đặt vòng lặp ngay
  // điểm vào DFS nên indexOf luôn bằng 0 — đổi thành path.slice(0) vẫn xanh hết.
  // Ca này đặt vòng lặp SÂU dưới hai mã lành, nên bắt buộc phải cắt đúng chỗ.
  it('vòng lặp nằm sâu dưới cha lành → chỉ báo đúng mắt xích, không réo tên cha', () => {
    const bomMap = {
      'F-CB-BNC':  [{ component: 'F-OCB10', qty: 1 }],
      'F-OCB10':   [{ component: 'L-F-OCB10', qty: 1 }],
      'L-F-OCB10': [{ component: 'OF-OCB10', qty: 1 }],
      'OF-OCB10':  [{ component: 'L-F-OCB10', qty: 1 }],
    };
    try {
      topoSort(bomMap);
      throw new Error('phải ném BomCycleError');
    } catch (e) {
      expect(e).toBeInstanceOf(BomCycleError);
      expect(e.cycle).toEqual(['L-F-OCB10', 'OF-OCB10', 'L-F-OCB10']);
      expect(e.cycle).not.toContain('F-CB-BNC');   // cha lành không được réo tên
      expect(e.cycle).not.toContain('F-OCB10');
    }
  });
});

describe('explodeNetted — nổ BOM có trừ tồn từng cấp', () => {
  // Dựng theo BOM thật của F-CB-BNC (đã rút gọn còn 3 con).
  const bomMap = {
    'F-CB-BNC': [
      { component: 'F-OCB10', qty: 1 },
      { component: 'F-CTO10', qty: 1 },
      { component: 'F-PP10', qty: 1 },
    ],
    'F-OCB10': [
      { component: 'L-F-OCB10', qty: 1 },
      { component: 'OF-OCB10', qty: 1 },
    ],
  };

  it('tồn cấp giữa đủ → DỪNG, không nổ xuống cấp dưới', () => {
    const { buy, net } = explodeNetted({
      demand: { 'F-CB-BNC': 458 },
      bomMap,
      stockMap: { 'F-OCB10': 6713, 'F-CTO10': 5208 },
    });
    expect(net['F-OCB10']).toBe(0);
    expect(buy['L-F-OCB10']).toBeUndefined();
    expect(buy['OF-OCB10']).toBeUndefined();
    expect(buy).toEqual({ 'F-PP10': 458 });
  });

  it('tồn cấp giữa thiếu một phần → chỉ nổ đúng phần thiếu', () => {
    const { buy } = explodeNetted({
      demand: { 'F-CB-BNC': 458 },
      bomMap,
      stockMap: { 'F-OCB10': 200, 'F-CTO10': 5208 },
    });
    expect(buy['L-F-OCB10']).toBe(258);
    expect(buy['OF-OCB10']).toBe(258);
    expect(buy['F-PP10']).toBe(458);
  });

  it('một mã là con của 2 cha → tồn chỉ bị trừ MỘT lần', () => {
    const { net, buy } = explodeNetted({
      demand: { A: 10, B: 10 },
      bomMap: { A: [{ component: 'X', qty: 2 }], B: [{ component: 'X', qty: 3 }] },
      stockMap: { X: 30 },
    });
    expect(net.X).toBe(20);        // gross 10×2 + 10×3 = 50, trừ 30 một lần
    expect(buy).toEqual({ X: 20 });
  });

  it('hàng đang về từ đợt trước cũng được trừ', () => {
    const { buy } = explodeNetted({
      demand: { A: 10 },
      bomMap: { A: [{ component: 'X', qty: 5 }] },
      stockMap: { X: 20 },
      onOrderMap: { X: 10 },
    });
    expect(buy).toEqual({ X: 20 });  // 50 − 20 − 10
  });

  it('mã có bán nhưng không có BOM → vào thẳng danh sách mua', () => {
    const { buy } = explodeNetted({ demand: { 'FK-RO80': 100 }, bomMap: {} });
    expect(buy).toEqual({ 'FK-RO80': 100 });
  });

  it('mã CÓ BOM không bao giờ vào danh sách mua, dù còn thiếu', () => {
    const { net, buy } = explodeNetted({
      demand: { A: 10 },
      bomMap: { A: [{ component: 'X', qty: 1 }] },
    });
    expect(net.A).toBe(10);
    expect(buy.A).toBeUndefined();
    expect(buy).toEqual({ X: 10 });
  });

  it('tồn thừa toàn bộ → không mua gì', () => {
    const { buy } = explodeNetted({
      demand: { A: 10 },
      bomMap: { A: [{ component: 'X', qty: 1 }] },
      stockMap: { A: 999 },
    });
    expect(buy).toEqual({});
  });

  it('định mức lẻ vẫn tính đúng, không lỗi dấu phẩy động', () => {
    const { buy } = explodeNetted({
      demand: { A: 3 },
      bomMap: { A: [{ component: 'DAY', qty: 0.6 }] },
    });
    expect(buy.DAY).toBe(1.8);
  });

  it('BOM có vòng lặp → ném BomCycleError, không trả kết quả nửa vời', () => {
    expect(() => explodeNetted({
      demand: { A: 1 },
      bomMap: { A: [{ component: 'B', qty: 1 }], B: [{ component: 'A', qty: 1 }] },
    })).toThrow(BomCycleError);
  });
});
