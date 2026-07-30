import { describe, it, expect } from 'vitest';
import { nextBatchCode, shapeEngineInputs } from './proposalBatch';

describe('nextBatchCode — mã đợt DX-DDMMYY-NN', () => {
  it('chưa có đợt nào trong ngày → bắt đầu từ 01', () => {
    expect(nextBatchCode([], '2026-07-29')).toBe('DX-290726-01');
  });

  it('đã có đợt hôm nay → lấy số kế tiếp', () => {
    expect(nextBatchCode(['DX-290726-01', 'DX-290726-02'], '2026-07-29')).toBe('DX-290726-03');
  });

  it('bỏ qua đợt của ngày khác', () => {
    expect(nextBatchCode(['DX-280726-07', 'DX-300726-09'], '2026-07-29')).toBe('DX-290726-01');
  });

  // Cố tình xếp NGƯỢC: số lớn nhất không phải phần tử cuối. Nếu xếp tăng dần thì
  // "lấy max" và "lấy phần tử cuối" cho cùng kết quả, test mất tác dụng phân biệt.
  it('không lấp lỗ hổng — lấy số LỚN NHẤT, không phải số cuối danh sách', () => {
    expect(nextBatchCode(['DX-290726-05', 'DX-290726-01'], '2026-07-29')).toBe('DX-290726-06');
  });

  it('mã hỏng trong danh sách thì bỏ qua, không làm sập', () => {
    expect(nextBatchCode(['DX-290726-XX', null, '', 'rac'], '2026-07-29')).toBe('DX-290726-01');
  });

  it('quá 99 đợt trong ngày vẫn tăng, không cắt còn 2 chữ số', () => {
    expect(nextBatchCode(['DX-290726-99'], '2026-07-29')).toBe('DX-290726-100');
  });
});

describe('shapeEngineInputs — nắn dữ liệu thô thành đầu vào cho engine', () => {
  const raw = {
    sales: [{ ma_san_pham: 'MAY-A', total_sales: 900 }, { ma_san_pham: 'HET-BAN', total_sales: 0 }],
    catalog: [
      { item_code: 'MAY-A', item_name: 'Máy A', unit: 'Cái', lead_time_days: 5, backup_stock_days: 10 },
      { item_code: 'LK-X', item_name: 'Linh kiện X', unit: 'Cái', lead_time_days: 7, backup_stock_days: 14 },
    ],
    bomRows: [{ product_code: 'MAY-A', component_code: 'LK-X', quantity: 2 }],
    stockRows: [{ item_code: 'LK-X', quantity: 30 }, { item_code: 'LK-X', quantity: 20 }],
    openProposals: [{ item_code: 'LK-X', actual_qty: 100, dlk_code: 'DX-01-001', trang_thai: 'CHO_HANG' }],
    nhapRows: [{ dlk_code: 'DX-01-001', so_luong_nhap: 40 }],
  };

  it('chỉ mã CÓ bán mới thành nhu cầu gốc', () => {
    const { items } = shapeEngineInputs(raw);
    const mayA = items.find(i => i.item_code === 'MAY-A');
    expect(mayA.total_sales_90d).toBe(900);
    expect(items.find(i => i.item_code === 'HET-BAN')).toBeUndefined();
  });

  it('linh kiện chỉ nằm trong BOM vẫn có mặt, nhưng doanh số = 0', () => {
    const { items } = shapeEngineInputs(raw);
    const lk = items.find(i => i.item_code === 'LK-X');
    expect(lk).toBeDefined();
    expect(lk.total_sales_90d).toBe(0);
    expect(lk.item_name).toBe('Linh kiện X');   // lấy được tên từ danh mục
  });

  it('tham số lấy từ danh mục, thiếu thì về 0', () => {
    const { items } = shapeEngineInputs(raw);
    expect(items.find(i => i.item_code === 'MAY-A').lead_time_days).toBe(5);
    const la = shapeEngineInputs({ ...raw, catalog: [] }).items.find(i => i.item_code === 'MAY-A');
    expect(la.lead_time_days).toBe(0);
    expect(la.item_name).toBe('');
  });

  it('tồn kho cộng dồn nhiều vị trí', () => {
    expect(shapeEngineInputs(raw).stockMap['LK-X']).toBe(50);
  });

  it('mã không có dòng tồn nào thì vắng mặt khỏi stockMap, engine hiểu là 0', () => {
    expect(shapeEngineInputs(raw).stockMap['MAY-A']).toBeUndefined();
  });

  it('hàng đang về = SL đặt trừ đã nhập', () => {
    expect(shapeEngineInputs(raw).onOrderMap['LK-X']).toBe(60);   // 100 − 40
  });

  it('nhập đủ rồi thì không còn hàng đang về', () => {
    const r = { ...raw, nhapRows: [{ dlk_code: 'DX-01-001', so_luong_nhap: 100 }] };
    expect(shapeEngineInputs(r).onOrderMap['LK-X']).toBeUndefined();
  });

  it('nhập vượt cũng không cho ra số âm', () => {
    const r = { ...raw, nhapRows: [{ dlk_code: 'DX-01-001', so_luong_nhap: 500 }] };
    expect(shapeEngineInputs(r).onOrderMap['LK-X']).toBeUndefined();
  });

  it('chỉ dòng CHO_HANG mới tính là hàng đang về — dòng đã đóng thì bỏ qua', () => {
    const r = {
      ...raw,
      openProposals: [
        { item_code: 'LK-X', actual_qty: 100, dlk_code: 'DX-01-001', trang_thai: 'CHO_HANG' },
        { item_code: 'LK-Y', actual_qty: 200, dlk_code: 'DX-01-002', trang_thai: 'DU' },
        { item_code: 'LK-Z', actual_qty: 300, dlk_code: 'DX-01-003', trang_thai: 'DONG_SOM' },
      ],
      nhapRows: [{ dlk_code: 'DX-01-001', so_luong_nhap: 40 }],
    };
    const { onOrderMap } = shapeEngineInputs(r);
    expect(onOrderMap['LK-X']).toBe(60);          // CHO_HANG, còn 100 − 40
    expect(onOrderMap['LK-Y']).toBeUndefined();   // DU → không tính
    expect(onOrderMap['LK-Z']).toBeUndefined();   // DONG_SOM → không tính
  });

  it('bomMap gom nhiều dòng cùng cha, giữ cả dòng trùng', () => {
    const r = { ...raw, bomRows: [
      { product_code: 'MAY-A', component_code: 'LK-X', quantity: 2 },
      { product_code: 'MAY-A', component_code: 'LK-X', quantity: 1 },
    ] };
    expect(shapeEngineInputs(r).bomMap['MAY-A']).toEqual([
      { component: 'LK-X', qty: 2 }, { component: 'LK-X', qty: 1 },
    ]);
  });

  it('đầu vào rỗng không làm sập', () => {
    const out = shapeEngineInputs({});
    expect(out.items).toEqual([]);
    expect(out.bomMap).toEqual({});
    expect(out.stockMap).toEqual({});
    expect(out.onOrderMap).toEqual({});
  });
});
