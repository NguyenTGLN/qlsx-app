// Logic thuần cho "Lệnh Sản Xuất nhiều mã / 1 phiếu".
// Tách khỏi ProductionOrderTab.jsx để unit-test (vitest).

// Làm tròn tới tối đa 1 chữ số thập phân, khử nhiễu dấu phẩy động
// (vd: 284.30000000000007 → 284.3, 30.699999999999932 → 30.7, 35 → 35).
export function round1(n) {
  const num = Number(n);
  return isFinite(num) ? Math.round(num * 10) / 10 : n;
}

// Gộp BOM của nhiều thành phẩm thành nhu cầu linh kiện tổng (cộng theo mã linh kiện).
// rows: [{ code, name, qty }]
// bomByProduct: { [productCode]: [{ component_code, quantity, unit, item_name }] }
// → [{ code, name, unit, requiredQty }]  (requiredQty làm tròn 1 số thập phân)
export function aggregateComponentDemand(rows, bomByProduct) {
  const demandMap = {};
  for (const row of rows) {
    const bom = bomByProduct[row.code] || [];
    for (const b of bom) {
      const key = b.component_code;
      if (!demandMap[key]) {
        demandMap[key] = { code: key, name: b.item_name || '', unit: b.unit || '', requiredQty: 0 };
      }
      demandMap[key].requiredQty += Number(b.quantity) * Number(row.qty);
    }
  }
  return Object.values(demandMap).map(c => ({ ...c, requiredQty: round1(c.requiredQty) }));
}

// Phân bổ FIFO. stockData nên đã sort sẵn (import_date asc, quantity asc).
// componentsRequired: [{ code, name, unit, requiredQty }]
// stockData: [{ id, item_code, location, quantity }]
// opts: { priorityVTSX?: bool, phieuCode?: string }
// → { result: [{ ...comp, allocations, missing, isShortage }], isShortage }
export function allocateFIFO(componentsRequired, stockData, opts = {}) {
  const { priorityVTSX = false, phieuCode = '' } = opts;
  let available = JSON.parse(JSON.stringify(stockData || [])); // copy để trừ dần, không mutate gốc
  if (priorityVTSX) {
    const pri = available.filter(s => s.location && s.location.startsWith('SX11-'));
    const norm = available.filter(s => !(s.location && s.location.startsWith('SX11-')));
    available = [...pri, ...norm];
  }

  let isShortage = false;
  const result = [];

  for (const comp of componentsRequired) {
    let qtyNeeded = comp.requiredQty;
    const compAllocations = [];

    // Tháo máy (SL âm) → nhập ngược vào kho SX9 của phiếu
    if (qtyNeeded < 0) {
      compAllocations.push({
        stock_id: null,
        location: `SX9-${phieuCode}`,
        before: 0,
        taken: qtyNeeded,            // âm
        remaining: Math.abs(qtyNeeded),
      });
      result.push({ ...comp, allocations: compAllocations, missing: 0, isShortage: false });
      continue;
    }

    const rows = available.filter(s => s.item_code === comp.code && s.quantity > 0);
    for (let i = 0; i < rows.length && qtyNeeded > 0; i++) {
      const r = rows[i];
      const take = Math.min(r.quantity, qtyNeeded);
      const before = r.quantity;
      r.quantity -= take;
      qtyNeeded -= take;
      compAllocations.push({ stock_id: r.id, location: r.location, before, taken: take, remaining: r.quantity });
    }

    if (qtyNeeded > 0) isShortage = true;
    result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
  }

  return { result, isShortage };
}

// Sinh danh sách lệnh con từ các dòng thành phẩm + mã phiếu chung.
// 1 dòng → dùng đúng mã phiếu (không hậu tố). Nhiều dòng → phiếu.1, phiếu.2, ...
// rows: [{ code, name, qty }] → [{ orderCode, productCode, productName, qty }]
export function buildFinishedItems(rows, phieuCode) {
  if (rows.length === 1) {
    const r = rows[0];
    return [{ orderCode: phieuCode, productCode: r.code, productName: r.name || '', qty: Number(r.qty) }];
  }
  return rows.map((r, i) => ({
    orderCode: `${phieuCode}.${i + 1}`,
    productCode: r.code,
    productName: r.name || '',
    qty: Number(r.qty),
  }));
}
