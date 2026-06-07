import { describe, it, expect } from 'vitest';
import { aggregateComponentDemand, allocateFIFO, buildFinishedItems, round1 } from './productionAlloc';

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
