import { describe, it, expect } from 'vitest';
import { computeSafetyStock, computeReplenishQty, topoSort, BomCycleError, explodeNetted, buildProposalLines } from './mrp';

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

  it('mã vừa bán lẻ vừa bị cha dùng → gộp cả hai nguồn vào gross', () => {
    const { gross, buy } = explodeNetted({
      demand: { A: 10, X: 5 },                          // X vừa tự bán 5
      bomMap: { A: [{ component: 'X', qty: 2 }] },      // vừa bị A kéo 10×2
    });
    expect(gross.X).toBe(25);
    expect(buy).toEqual({ X: 25 });
    expect(buy.A).toBeUndefined();                      // A có BOM → tự sản xuất
  });

  it('nhiều tầng, định mức khác 1, tồn nằm ở tầng giữa', () => {
    const { net, buy } = explodeNetted({
      demand: { A: 100 },
      bomMap: {
        A: [{ component: 'B', qty: 2 }],
        B: [{ component: 'C', qty: 3 }],
      },
      stockMap: { B: 50, C: 40 },
    });
    expect(net.B).toBe(150);   // gross 100×2 = 200, trừ tồn 50
    expect(net.C).toBe(410);   // gross 150×3 = 450, trừ tồn 40
    expect(buy).toEqual({ C: 410 });
  });
});

describe('buildProposalLines — dòng đề xuất kèm snapshot', () => {
  const items = [
    { item_code: 'MAY-A', item_name: 'Máy A', unit: 'Cái',
      total_sales_90d: 900, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
    { item_code: 'LK-X', item_name: 'Linh kiện X', unit: 'Cái',
      total_sales_90d: 0, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
  ];
  const bomMap = { 'MAY-A': [{ component: 'LK-X', qty: 2 }] };

  it('chỉ lấy mã CÓ bán trong 90 ngày làm nhu cầu gốc', () => {
    const { lines } = buildProposalLines({ items, bomMap, stockMap: {}, onOrderMap: {} });
    expect(lines).toHaveLength(1);
    expect(lines[0].item_code).toBe('LK-X');
    expect(lines[0].calculated_qty).toBe(400);   // MAY-A cần 200, mỗi máy 2 LK-X
  });

  it('ghi đủ vết tính toán để tra ngược', () => {
    const { lines } = buildProposalLines({
      items, bomMap, stockMap: { 'LK-X': 150 }, onOrderMap: { 'LK-X': 50 },
    });
    const l = lines[0];
    expect(l.snapshot_gross).toBe(400);
    expect(l.snapshot_ton).toBe(150);
    expect(l.snapshot_dang_ve).toBe(50);
    expect(l.calculated_qty).toBe(200);
    expect(l.snapshot_gross - l.snapshot_ton - l.snapshot_dang_ve).toBe(l.calculated_qty);
  });

  it('tách bom_qty và retail_qty: phần do cha kéo xuống vs phần tự bán', () => {
    const itemsCoBanLe = [
      { item_code: 'MAY-A', item_name: 'Máy A', unit: 'Cái',
        total_sales_90d: 900, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
      { item_code: 'LK-X', item_name: 'Linh kiện X', unit: 'Cái',
        total_sales_90d: 900, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
    ];
    const { lines } = buildProposalLines({
      items: itemsCoBanLe, bomMap, stockMap: {}, onOrderMap: {},
    });
    const l = lines.find(x => x.item_code === 'LK-X');
    expect(l.retail_qty).toBe(200);        // LK-X tự bán, tồn an toàn 200
    expect(l.bom_qty).toBe(400);           // MAY-A cần 200 máy × 2 = 400
    expect(l.snapshot_gross).toBe(600);
    expect(l.calculated_qty).toBe(600);
    expect(l.bom_qty + l.retail_qty).toBe(l.snapshot_gross);
  });

  it('tồn thành phẩm chỉ bị trừ MỘT lần, không trừ cả lúc gieo lẫn lúc nổ BOM', () => {
    // MAY-A: tồn an toàn 200, kho đang có 120 → còn phải làm 80 máy → 160 linh kiện.
    // Nếu gieo bằng "cần bổ sung" thì thành 200−120=80 rồi lại trừ 120 nữa → mất sạch.
    const { lines } = buildProposalLines({
      items: [{ item_code: 'MAY-A', total_sales_90d: 900, lead_time_days: 5,
                backup_stock_days: 10, total_quantity: 120 }],
      bomMap: { 'MAY-A': [{ component: 'LK-X', qty: 2 }] },
      stockMap: { 'MAY-A': 120 },
      onOrderMap: {},
    });
    const l = lines.find(x => x.item_code === 'LK-X');
    expect(l).toBeDefined();
    expect(l.calculated_qty).toBe(160);
  });

  it('tồn kho bị trôi số thực vẫn cho phép trừ khớp trên màn hình', () => {
    // T-0402 tại HM5 thật sự đang là 2782.7000000000003 do cộng dồn nhiều lần.
    const { lines } = buildProposalLines({
      items: [
        { item_code: 'MAY-A', total_sales_90d: 900, lead_time_days: 5,
          backup_stock_days: 10, total_quantity: 0 },
        { item_code: 'T-0402', item_name: 'Dây 6', unit: 'Mét', total_sales_90d: 0 },
      ],
      bomMap: { 'MAY-A': [{ component: 'T-0402', qty: 20 }] },
      stockMap: { 'T-0402': 2782.7000000000003 },
      onOrderMap: {},
    });
    const l = lines.find(x => x.item_code === 'T-0402');
    expect(l.snapshot_ton).toBe(2782.7);        // đã làm tròn, hết 13 chữ số lẻ
    expect(l.snapshot_gross).toBe(4000);        // 200 máy × 20 mét
    expect(l.calculated_qty).toBe(1217.3);      // 4000 − 2782.7
  });

  it('actual_qty khởi tạo bằng calculated_qty để người duyệt sửa tiếp', () => {
    const { lines } = buildProposalLines({ items, bomMap, stockMap: {}, onOrderMap: {} });
    expect(lines[0].actual_qty).toBe(lines[0].calculated_qty);
  });

  it('mang theo tên và đơn vị tính từ danh mục', () => {
    const { lines } = buildProposalLines({ items, bomMap, stockMap: {}, onOrderMap: {} });
    expect(lines[0].item_name).toBe('Linh kiện X');
    expect(lines[0].unit).toBe('Cái');
  });

  it('réo lên khi ô nào âm hoặc cả hai ô đều bỏ trống', () => {
    const goi = (lt, bs) => buildProposalLines({
      items: [{ item_code: 'MAY-B', total_sales_90d: 900, lead_time_days: lt, backup_stock_days: bs }],
      bomMap: {}, stockMap: {}, onOrderMap: {},
    }).missingParams;
    expect(goi(0, 0)).toEqual(['MAY-B']);      // bỏ trống cả hai
    expect(goi(-5, 30)).toEqual(['MAY-B']);    // một ô âm cạnh một ô đúng
    expect(goi(5, -50)).toEqual(['MAY-B']);
    expect(goi(5, 30)).toEqual([]);            // hợp lệ thì im lặng
  });

  it('sắp xếp theo mã để kết quả ổn định giữa các lần chạy', () => {
    const { lines } = buildProposalLines({
      items: [
        { item_code: 'Z', total_sales_90d: 900, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
        { item_code: 'A', total_sales_90d: 900, lead_time_days: 5, backup_stock_days: 10, total_quantity: 0 },
      ],
      bomMap: {}, stockMap: {}, onOrderMap: {},
    });
    expect(lines.map(l => l.item_code)).toEqual(['A', 'Z']);
  });
});
