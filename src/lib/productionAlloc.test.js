import { describe, it, expect } from 'vitest';
import { aggregateComponentDemand, allocateExport, allocateFIFO, applyPriorityOrder, buildFinishedItems, round1, sortStockForFIFO, sortResultByLocation } from './productionAlloc';

describe('sortResultByLocation', () => {
  it('các dòng phiếu sắp theo vị trí lấy đầu tiên (dãy→tầng→ô); đặc biệt rồi hết hàng xuống cuối', () => {
    const result = [
      { code: 'LK1', allocations: [{ location: 'HH4' }] },
      { code: 'LK2', allocations: [] },                       // hết hàng
      { code: 'LK3', allocations: [{ location: 'EB1' }] },
      { code: 'LK4', allocations: [{ location: 'VP6T2' }] },  // đặc biệt
      { code: 'LK5', allocations: [{ location: 'EM11' }] },
    ];
    const out = sortResultByLocation(result);
    expect(out.map(r => r.code)).toEqual(['LK5', 'LK3', 'LK1', 'LK4', 'LK2']);
  });

  it('không mutate mảng gốc', () => {
    const src = [
      { code: 'B', allocations: [{ location: 'HH2' }] },
      { code: 'A', allocations: [{ location: 'HH1' }] },
    ];
    sortResultByLocation(src);
    expect(src[0].code).toBe('B');
  });
});

describe('sortStockForFIFO', () => {
  it('ngày nhập cũ trước; cùng ngày thì SL ít hơn trước; chưa có ngày xếp cuối', () => {
    const out = sortStockForFIFO([
      { location: 'HH10', import_date: '2026-06-01', quantity: 3 },
      { location: 'BH1', import_date: '2026-05-01', quantity: 50 },
      { location: 'HH2', import_date: '2026-06-01', quantity: 8 },
      { location: 'CH1', import_date: null, quantity: 1 },
    ]);
    // BH1 nhập cũ nhất → đầu; cùng ngày 06-01: HH10 (SL 3) trước HH2 (SL 8); CH1 chưa có ngày → cuối
    expect(out.map(r => r.location)).toEqual(['BH1', 'HH10', 'HH2', 'CH1']);
  });

  it('cùng ngày nhập và cùng SL thì mới xét vị trí (dãy/tầng/ô)', () => {
    const out = sortStockForFIFO([
      { location: 'HH10', import_date: '2026-06-01', quantity: 5 },
      { location: 'HH2', import_date: '2026-06-01', quantity: 5 },
      { location: 'EM1', import_date: '2026-06-01', quantity: 5 },
    ]);
    expect(out.map(r => r.location)).toEqual(['EM1', 'HH2', 'HH10']);
  });

  it('không mutate mảng gốc', () => {
    const src = [{ location: 'HH2' }, { location: 'HH1' }];
    sortStockForFIFO(src);
    expect(src[0].location).toBe('HH2');
  });
});

describe('round1', () => {
  it('khử nhiễu dấu phẩy động, làm tròn 1 số thập phân', () => {
    expect(round1(284.30000000000007)).toBe(284.3);
    expect(round1(30.699999999999932)).toBe(30.7);
    expect(round1(35)).toBe(35);
    expect(round1(0.25)).toBe(0.3);
  });
});

describe('aggregateComponentDemand', () => {
  const bomByProduct = {
    'SP-A': [
      { component_code: 'T-0402', quantity: 2, unit: 'm', item_name: 'Dây 6' },
      { component_code: 'OC-1', quantity: 4, unit: 'cái', item_name: 'Ốc' },
    ],
    'SP-B': [
      { component_code: 'T-0402', quantity: 3, unit: 'm', item_name: 'Dây 6' },
    ],
  };

  it('làm tròn requiredQty 1 số thập phân (khử nhiễu float khi nhân dây)', () => {
    const out = aggregateComponentDemand(
      [{ code: 'SP-A', name: 'A', qty: 0.1 }], { 'SP-A': [{ component_code: 'T-0402', quantity: 2.843, item_name: 'Dây 6' }] });
    // 2.843 * 0.1 = 0.2843 → làm tròn 0.3
    expect(out[0].requiredQty).toBe(0.3);
  });

  it('gộp tổng theo mã linh kiện qua nhiều thành phẩm', () => {
    const rows = [{ code: 'SP-A', name: 'A', qty: 10 }, { code: 'SP-B', name: 'B', qty: 5 }];
    const out = aggregateComponentDemand(rows, bomByProduct);
    const day6 = out.find(c => c.code === 'T-0402');
    const oc = out.find(c => c.code === 'OC-1');
    expect(day6.requiredQty).toBe(2 * 10 + 3 * 5); // 35
    expect(day6.name).toBe('Dây 6');
    expect(oc.requiredQty).toBe(4 * 10); // 40
    expect(out).toHaveLength(2);
  });

  it('mã thành phẩm chưa có BOM thì bỏ qua, không vỡ', () => {
    const rows = [{ code: 'SP-X', name: 'X', qty: 3 }];
    expect(aggregateComponentDemand(rows, bomByProduct)).toEqual([]);
  });
});

describe('allocateFIFO', () => {
  const stock = [
    { id: 1, item_code: 'T-0402', location: 'HM5', quantity: 20 },
    { id: 2, item_code: 'T-0402', location: 'HM6', quantity: 20 },
  ];

  it('phân bổ đủ qua nhiều vị trí, tính tồn dư đúng', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 35 }], stock, {});
    expect(isShortage).toBe(false);
    expect(result[0].allocations).toHaveLength(2);
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 1, taken: 20, remaining: 0 });
    expect(result[0].allocations[1]).toMatchObject({ stock_id: 2, taken: 15, remaining: 5 });
    expect(result[0].missing).toBe(0);
  });

  it('đánh dấu thiếu khi không đủ tồn', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 100 }], stock, {});
    expect(isShortage).toBe(true);
    expect(result[0].isShortage).toBe(true);
    expect(result[0].missing).toBe(60);
  });

  it('vị trí trên phiếu được sắp theo dãy/tầng/ô dù thứ tự lấy FIFO khác', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HH10', quantity: 5 }, // FIFO lấy trước (đứng đầu mảng)
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
    ];
    const { result } = allocateFIFO([{ code: 'A', name: 'a', unit: '', requiredQty: 8 }], s, {});
    expect(result[0].allocations.map(a => a.location)).toEqual(['HH2', 'HH10']);
  });

  it('không mutate stockData gốc', () => {
    allocateFIFO([{ code: 'T-0402', name: 'Dây 6', unit: 'm', requiredQty: 35 }], stock, {});
    expect(stock[0].quantity).toBe(20);
  });

  it('ưu tiên kho SX11- khi priorityVTSX', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HM1', quantity: 5 },
      { id: 2, item_code: 'A', location: 'SX11-01', quantity: 5 },
    ];
    const { result } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], s, { priorityVTSX: true });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'SX11-01' });
  });

  it('ưu tiên vị trí tự chọn trước FIFO nền', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 }, // FIFO đứng đầu
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
    ];
    const { result } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], s, { priorityLocations: ['HH2'] });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'HH2' });
  });

  it('SL âm (tháo máy) nhập ngược vào SX9 của phiếu', () => {
    const { result, isShortage } = allocateFIFO(
      [{ code: 'A', name: 'a', unit: '', requiredQty: -3 }], [], { phieuCode: 'PSX-X-01' });
    expect(isShortage).toBe(false);
    expect(result[0].allocations[0]).toMatchObject({
      stock_id: null, location: 'SX9-PSX-X-01', taken: -3, remaining: 3,
    });
  });
});

describe('buildFinishedItems', () => {
  it('1 thành phẩm dùng đúng mã phiếu, không hậu tố', () => {
    const out = buildFinishedItems([{ code: 'SP-A', name: 'A', qty: 10 }], 'PSX-X-01');
    expect(out).toEqual([{ orderCode: 'PSX-X-01', productCode: 'SP-A', productName: 'A', qty: 10 }]);
  });

  it('nhiều thành phẩm thêm hậu tố .1 .2', () => {
    const out = buildFinishedItems(
      [{ code: 'SP-A', name: 'A', qty: 10 }, { code: 'SP-B', name: 'B', qty: 5 }], 'PSX-X-02');
    expect(out.map(o => o.orderCode)).toEqual(['PSX-X-02.1', 'PSX-X-02.2']);
    expect(out[1]).toMatchObject({ productCode: 'SP-B', qty: 5 });
  });
});

describe('applyPriorityOrder', () => {
  it('đưa vị trí tự chọn lên trước, giữ thứ tự nền trong nhóm', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 },
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
      { id: 3, item_code: 'A', location: 'HH3', quantity: 5 },
    ];
    const out = applyPriorityOrder(stock, { priorityLocations: ['HH3'] });
    expect(out.map(s => s.location)).toEqual(['HH3', 'HH1', 'HH2']);
  });

  it('SX11 (khi bật) trước, rồi vị trí tự chọn, rồi phần còn lại', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 5 },     // còn lại
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },     // tự chọn
      { id: 3, item_code: 'A', location: 'SX11-01', quantity: 5 }, // SX11
    ];
    const out = applyPriorityOrder(stock, { priorityVTSX: true, priorityLocations: ['HH2'] });
    expect(out.map(s => s.location)).toEqual(['SX11-01', 'HH2', 'HH1']);
  });

  it('khớp chính xác — HH2 không kéo theo HH20', () => {
    const stock = [
      { id: 1, item_code: 'A', location: 'HH20', quantity: 5 },
      { id: 2, item_code: 'A', location: 'HH2', quantity: 5 },
    ];
    const out = applyPriorityOrder(stock, { priorityLocations: ['HH2'] });
    expect(out.map(s => s.location)).toEqual(['HH2', 'HH20']);
  });

  it('không tick gì → giữ nguyên thứ tự, trả mảng mới (không mutate)', () => {
    const stock = [{ id: 1, location: 'HH2' }, { id: 2, location: 'HH1' }];
    const out = applyPriorityOrder(stock, {});
    expect(out.map(s => s.location)).toEqual(['HH2', 'HH1']);
    expect(out).not.toBe(stock);
  });
});

describe('allocateExport', () => {
  const stock = [
    { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
    { id: 2, item_code: 'A', location: 'SX9-PSX-1', quantity: 100 }, // WIP, KHÔNG được lấy
    { id: 3, item_code: 'A', location: 'HH2', quantity: 10 },
  ];

  it('không lấy từ kho sản xuất dở dang (SX9-*)', () => {
    const { result, isShortage } = allocateExport(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 15 }], stock, {});
    expect(isShortage).toBe(false);
    const locs = result[0].allocations.map(a => a.location);
    expect(locs).not.toContain('SX9-PSX-1');
    expect(locs.sort()).toEqual(['HH1', 'HH2']);
  });

  it('nhiều dòng cùng mã trừ dồn trên cùng bản tồn', () => {
    const { result, isShortage } = allocateExport(
      [
        { code: 'A', name: 'a', unit: '', requiredQty: 8 },
        { code: 'A', name: 'a', unit: '', requiredQty: 8 },
      ],
      [{ id: 1, item_code: 'A', location: 'HH1', quantity: 10 }],
      {});
    expect(result[0].missing).toBe(0); // dòng 1 lấy 8/10
    expect(result[1].missing).toBe(6); // dòng 2 chỉ còn 2 → thiếu 6
    expect(isShortage).toBe(true);
  });

  it('ưu tiên vị trí tự chọn trước', () => {
    const { result } = allocateExport(
      [{ code: 'A', name: 'a', unit: '', requiredQty: 10 }],
      [
        { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
        { id: 2, item_code: 'A', location: 'HH2', quantity: 10 },
      ],
      { priorityLocations: ['HH2'] });
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'HH2' });
  });

  it('giữ passthrough name/unit', () => {
    const { result } = allocateExport(
      [{ code: 'A', name: 'Vat tu A', unit: 'cai', requiredQty: 1 }],
      [{ id: 1, item_code: 'A', location: 'HH1', quantity: 5 }], {});
    expect(result[0]).toMatchObject({ code: 'A', name: 'Vat tu A', unit: 'cai' });
  });
});

describe('ưu tiên vị trí tập kết SX4 (chuyển SX trước)', () => {
  const stock = [
    { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
    { id: 2, item_code: 'A', location: 'SX4-24/07/2026', quantity: 10 },
    { id: 3, item_code: 'A', location: 'SX11-VTSX', quantity: 10 },
  ];

  it('allocateFIFO lấy ở SX4 trước tiên dù không tick ưu tiên gì', () => {
    const { result } = allocateFIFO([{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], stock, {});
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 2, location: 'SX4-24/07/2026' });
  });

  it('SX4 đứng trên cả SX11 lẫn vị trí tự tick', () => {
    const out = applyPriorityOrder(stock, {
      prioritySX4: true, priorityVTSX: true, priorityLocations: ['HH1'],
    });
    expect(out.map(s => s.id)).toEqual([2, 3, 1]);
  });

  it('không bật prioritySX4 → giữ nguyên thứ tự nền', () => {
    const out = applyPriorityOrder(stock, {});
    expect(out.map(s => s.id)).toEqual([1, 2, 3]);
  });

  it('allocateExport KHÔNG ưu tiên SX4 (đơn hàng không cướp hàng đã kê ra chuyền)', () => {
    const { result } = allocateExport([{ code: 'A', name: 'a', unit: '', requiredQty: 5 }], stock, {});
    expect(result[0].allocations[0]).toMatchObject({ stock_id: 1, location: 'HH1' });
  });

  it('nhiều dòng SX4 của cùng 1 mã giữ đúng thứ tự FIFO nền với nhau', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'SX4-01', quantity: 5 },
      { id: 2, item_code: 'A', location: 'SX4-02', quantity: 5 },
      { id: 3, item_code: 'A', location: 'SX4-03', quantity: 5 },
    ];
    const { result } = allocateFIFO([{ code: 'A', name: 'a', unit: '', requiredQty: 12 }], s, {});
    // phải lấy từ SX4-01, SX4-02, SX4-03 theo thứ tự (không đảo lộn)
    expect(result[0].allocations.map(a => a.stock_id)).toEqual([1, 2, 3]);
  });

  it('prioritySX4 khi SX4 chỉ đủ một phần nhu cầu: lấy hết SX4 trước rồi mới sang tồn thường', () => {
    const s = [
      { id: 1, item_code: 'A', location: 'HH1', quantity: 10 },
      { id: 2, item_code: 'A', location: 'SX4-24/07', quantity: 3 },
    ];
    const { result, isShortage } = allocateFIFO([{ code: 'A', name: 'a', unit: '', requiredQty: 8 }], s, {});
    // lấy 3 từ SX4 trước, rồi 5 từ HH1 → còn thiếu 0
    // allocations được sắp xếp theo vị trí nên HH1 trước SX4 trong kết quả, nhưng tồn bị trừ từ SX4 trước
    const sx4Alloc = result[0].allocations.find(a => a.stock_id === 2);
    const hh1Alloc = result[0].allocations.find(a => a.stock_id === 1);
    expect(sx4Alloc).toMatchObject({ location: 'SX4-24/07', taken: 3 });
    expect(hh1Alloc).toMatchObject({ location: 'HH1', taken: 5 });
    expect(result[0].missing).toBe(0);
    expect(isShortage).toBe(false);
  });
});
