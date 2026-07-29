# MRP Engine (Giai đoạn 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây engine tính nhu cầu mua linh kiện — công thức tồn an toàn mới, và nổ BOM có trừ tồn kho ở từng cấp — dưới dạng hàm thuần, có test đầy đủ, chưa nối vào giao diện.

**Architecture:** Một tệp mới `src/lib/mrp.js` chứa toàn bộ hàm thuần, không import Supabase. Không sửa `dksxEngine.js` — luồng đề xuất hiện tại tiếp tục chạy nguyên vẹn trong suốt giai đoạn này. Việc nối vào DB và giao diện thuộc giai đoạn 2–4.

**Tech Stack:** JavaScript (ESM), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md`

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `src/lib/mrp.js` (tạo mới) | Hàm thuần: công thức tồn an toàn, xếp tô-pô + phát hiện vòng lặp BOM, nổ BOM có netting, dựng dòng đề xuất |
| `src/lib/mrp.test.js` (tạo mới) | Test cho toàn bộ `mrp.js` |

**Không đụng tới:** `dksxEngine.js`, `proposalQty.js`, mọi tệp trong `src/pages/`. Giai đoạn 1 chỉ thêm tệp mới.

Tách khỏi `dksxEngine.js` vì tệp đó đang gánh cả hàm thuần lẫn hàm gọi Supabase. `mrp.js` giữ đúng một trách nhiệm: tính toán, không I/O — nhờ vậy test được toàn bộ mà không cần mock DB.

**Lệnh test dùng chung cho mọi task:**

```bash
npx vitest run src/lib/mrp.test.js
```

---

## Task 1: Công thức tồn an toàn và cần bổ sung

**Files:**
- Create: `src/lib/mrp.js`
- Test: `src/lib/mrp.test.js`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/lib/mrp.test.js`:

```js
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
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: FAIL — `Failed to resolve import "./mrp"`.

- [ ] **Step 3: Viết mã tối thiểu**

Tạo `src/lib/mrp.js`:

```js
// Engine tính nhu cầu mua linh kiện. Hàm THUẦN — không import Supabase, không I/O.
// Phần gọi DB nằm ở giai đoạn 2. Xem spec:
//   docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

// LƯU Ý: StockSummaryTab.jsx:94 hiện vẫn dùng công thức CŨ (lead + an toàn × 2)
// cho cột "Tồn An Toàn" ở tab Tồn HH. Hai công thức cùng tồn tại tới giai đoạn 3.
// Ai sửa chỗ này nhớ ngó cả bên đó, kẻo "chữa" nhầm bên đúng.

const SALES_WINDOW_DAYS = 90;

const num = (v) => Number(v) || 0;

// Tồn an toàn = TB bán/ngày × (lead_time × 2 + thời gian an toàn).
// Hệ số lead nhân 2 để phòng nhà cung cấp giao chậm gấp đôi cam kết.
//
// Ô nhập ở AddCatalogItemModal.jsx:71 không chặn số âm, nên lead_time hay thời gian
// an toàn bị gõ nhầm dấu là chuyện có thật. Kẹp TỪNG Ô một, KHÔNG kẹp trên tổng:
// kẹp tổng thì một ô âm sẽ ăn mất ô kia — lead −5 cạnh an toàn 30 cho ra 20 ngày
// thay vì 30, sai một nửa mà không âm, không kẹp, không ai thấy.
// Phần réo lên do buildProposalLines lo (Task 4): ô nào âm là vào missingParams.
export function computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays } = {}) {
  const avgDaily = Math.max(0, num(totalSales90d)) / SALES_WINDOW_DAYS;
  const days = Math.max(0, num(leadTimeDays)) * 2 + Math.max(0, num(backupStockDays));
  return Math.round(avgDaily * days);
}

// Cần bổ sung = tồn an toàn − tồn hiện tại (không âm).
export function computeReplenishQty({ totalSales90d, leadTimeDays, backupStockDays, totalQuantity } = {}) {
  const safety = computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays });
  return Math.max(0, safety - num(totalQuantity));
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: PASS — 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mrp.js src/lib/mrp.test.js
git commit -m "feat(mrp): cong thuc ton an toan lead x2 + an toan"
```

---

## Task 2: Xếp tô-pô và phát hiện vòng lặp BOM

Nổ BOM có netting bắt buộc phải duyệt **cha trước con**, nếu không thì tồn kho của một mã sẽ bị trừ trước khi gom đủ nhu cầu từ mọi cha. Task này dựng thứ tự đó.

**Files:**
- Modify: `src/lib/mrp.js`
- Test: `src/lib/mrp.test.js`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/lib/mrp.test.js`:

```js
import { topoSort, BomCycleError } from './mrp';

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
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: FAIL — `topoSort is not a function`.

- [ ] **Step 3: Viết mã tối thiểu**

Thêm vào cuối `src/lib/mrp.js`:

```js
// Lỗi dữ liệu BOM có vòng lặp. Giữ nguyên mảng `cycle` để giao diện chỉ đúng chỗ hỏng.
// Hàm explodeBom cũ ÂM THẦM bỏ qua vòng lặp — chính kiểu che giấu đó khiến 3 dòng BOM
// khai ngược chiều sống được 2 tháng mà không ai biết. Ở đây phải nổ ra.
export class BomCycleError extends Error {
  constructor(cycle) {
    super(`BOM có vòng lặp: ${cycle.join(' → ')}`);
    this.name = 'BomCycleError';
    this.cycle = cycle;
  }
}

// Xếp mọi mã trong bomMap theo thứ tự cha trước con.
// bomMap dạng { [product_code]: [{ component, qty }] } — giống loadBomMap().
export function topoSort(bomMap = {}) {
  const nodes = new Set();
  Object.keys(bomMap).forEach((p) => {
    nodes.add(p);
    (bomMap[p] || []).forEach((c) => nodes.add(c.component));
  });

  const WHITE = 0, GRAY = 1, BLACK = 2;
  // Object.create(null) chứ không phải {}: mã hàng tên '__proto__' gán vào object
  // thường sẽ không tạo thuộc tính riêng, màu không bám, node bị duyệt nhiều lần
  // và thứ tự cha-con vỡ. Không xảy ra với danh mục hiện tại, nhưng đây là nền
  // của cả engine nên không đáng để hở.
  const color = Object.create(null);
  nodes.forEach((n) => { color[n] = WHITE; });

  const order = [];   // gom theo hậu thứ tự: con trước, cha sau
  const path = [];    // nhánh đang duyệt, để dựng lại vòng lặp khi gặp

  function visit(n) {
    if (color[n] === BLACK) return;
    if (color[n] === GRAY) {
      throw new BomCycleError(path.slice(path.indexOf(n)).concat(n));
    }
    color[n] = GRAY;
    path.push(n);
    (bomMap[n] || []).forEach((c) => visit(c.component));
    path.pop();
    color[n] = BLACK;
    order.push(n);
  }

  nodes.forEach((n) => visit(n));
  return order.reverse();   // đảo lại thành cha trước con
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: PASS — 13 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mrp.js src/lib/mrp.test.js
git commit -m "feat(mrp): xep to-po BOM va bat vong lap thay vi bo qua"
```

---

## Task 3: Nổ BOM có trừ tồn từng cấp

Phần lõi. Đây là thứ thay thế `explodeBom` cũ.

**Files:**
- Modify: `src/lib/mrp.js`
- Test: `src/lib/mrp.test.js`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/lib/mrp.test.js`:

```js
import { explodeNetted } from './mrp';

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
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: FAIL — `explodeNetted is not a function`.

- [ ] **Step 3: Viết mã tối thiểu**

Thêm vào cuối `src/lib/mrp.js`:

```js
// Làm tròn 3 số lẻ — khớp cách dksxEngine đang làm, tránh sai số dấu phẩy động
// khi định mức BOM là số lẻ (ví dụ 0.6 mét dây/máy).
const round3 = (v) => Math.round(v * 1000) / 1000;

// Nổ BOM có trừ tồn ở TỪNG CẤP.
//   demand     { [mã thành phẩm]: cần bổ sung }
//   bomMap     { [mã cha]: [{ component, qty }] }
//   stockMap   { [mã]: tồn kho }            — gồm cả vị trí WIP SX9-
//   onOrderMap { [mã]: đang về }            — Σ(SL đặt − đã nhập) của dòng CHO_HANG đợt trước
//
// Trả { gross, net, buy }:
//   gross = tổng nhu cầu trước khi trừ   → lưu vào snapshot_gross
//   net   = sau khi trừ tồn và hàng đang về
//   buy   = phần net > 0 của những mã KHÔNG có BOM (mã có BOM thì tự sản xuất)
//
// Duyệt theo thứ tự tô-pô nên khi tới lượt một mã thì nhu cầu từ MỌI cha đã cộng đủ
// vào gross — nhờ vậy tồn kho chỉ bị tiêu đúng một lần.
export function explodeNetted({ demand = {}, bomMap = {}, stockMap = {}, onOrderMap = {} } = {}) {
  const order = topoSort(bomMap);

  const gross = {};
  Object.keys(demand).forEach((c) => {
    gross[c] = round3((gross[c] || 0) + num(demand[c]));
  });

  const net = {};
  const visited = new Set();

  order.forEach((code) => {
    visited.add(code);
    const avail = num(stockMap[code]) + num(onOrderMap[code]);
    const n = Math.max(0, round3((gross[code] || 0) - avail));
    net[code] = n;

    const bom = bomMap[code];
    if (bom && bom.length > 0 && n > 0) {
      bom.forEach((c) => {
        gross[c.component] = round3((gross[c.component] || 0) + n * num(c.qty));
      });
    }
  });

  // Mã có nhu cầu nhưng không xuất hiện ở đâu trong bomMap (không BOM, không là con của ai)
  Object.keys(gross).forEach((code) => {
    if (visited.has(code)) return;
    const avail = num(stockMap[code]) + num(onOrderMap[code]);
    net[code] = Math.max(0, round3(gross[code] - avail));
  });

  const buy = {};
  Object.keys(net).forEach((code) => {
    const isParent = bomMap[code] && bomMap[code].length > 0;
    if (!isParent && net[code] > 0.0001) buy[code] = net[code];
  });

  return { gross, net, buy };
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: PASS — 22 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mrp.js src/lib/mrp.test.js
git commit -m "feat(mrp): no BOM co tru ton tung cap theo thu tu to-po"
```

---

## Task 4: Dựng dòng đề xuất kèm vết tính toán

Gộp Task 1 và 3 thành một hàm cho ra đúng các dòng sẽ ghi vào `purchase_proposals`.

**Files:**
- Modify: `src/lib/mrp.js`
- Test: `src/lib/mrp.test.js`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `src/lib/mrp.test.js`:

```js
import { buildProposalLines } from './mrp';

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
    // LK-X vừa được máy dùng, vừa bán lẻ trực tiếp
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
    expect(l.retail_qty).toBe(200);        // LK-X tự bán, cần bổ sung 200
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

  it('liệt kê mã chưa khai lead_time lẫn thời gian an toàn', () => {
    const { missingParams } = buildProposalLines({
      items: [{ item_code: 'MAY-B', total_sales_90d: 900, lead_time_days: 0, backup_stock_days: 0 }],
      bomMap: {}, stockMap: {}, onOrderMap: {},
    });
    expect(missingParams).toEqual(['MAY-B']);
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
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: FAIL — `buildProposalLines is not a function`.

- [ ] **Step 3: Viết mã tối thiểu**

Thêm vào cuối `src/lib/mrp.js`:

```js
// Dựng các dòng sẽ ghi vào purchase_proposals cho một đợt đề xuất.
//   items = mảng từ RPC get_stock_summary, mỗi phần tử có:
//     item_code, item_name, unit, total_sales_90d,
//     lead_time_days, backup_stock_days, total_quantity
//
// Trả { lines, missingParams }:
//   lines        = dòng đề xuất, đã sắp theo mã
//   missingParams = mã có bán nhưng chưa khai lead_time lẫn thời gian an toàn
//                   → hiện lên đầu màn để người dùng biết mà khai bổ sung,
//                     KHÔNG âm thầm bỏ qua
export function buildProposalLines({ items = [], bomMap = {}, stockMap = {}, onOrderMap = {} } = {}) {
  const dict = {};
  items.forEach((it) => { dict[it.item_code] = it; });

  // Làm tròn tồn và hàng đang về NGAY TỪ ĐẦU, trước khi đưa vào nổ BOM. Tồn thật có
  // dòng bị trôi số thực: T-0402 tại HM5 đang là 2782.7000000000003 (13 chữ số lẻ, do
  // cộng dồn nhiều lần). Không làm tròn trước thì số ghi vào snapshot_ton khác số thực
  // sự dùng để tính, và phép trừ hiện trên màn hình không khớp calculated_qty.
  const ton = {};
  Object.keys(stockMap).forEach((k) => { ton[k] = round3(num(stockMap[k])); });
  const dangVe = {};
  Object.keys(onOrderMap).forEach((k) => { dangVe[k] = round3(num(onOrderMap[k])); });

  // Nhu cầu gốc = TỒN AN TOÀN (mức cần có trong kho), KHÔNG phải "cần bổ sung".
  // Phép trừ tồn để explodeNetted lo, và nó trừ đúng MỘT lần cho mọi cấp.
  // Nếu gieo bằng "cần bổ sung" (đã trừ tồn rồi) thì tồn bị trừ HAI lần và nhu cầu
  // bốc hơi: F-CB-BNC an toàn 982, tồn 524 → gieo 458 → net = 458 − 524 = 0.
  const rootDemand = {};
  const missingParams = [];

  items.forEach((it) => {
    if (num(it.total_sales_90d) <= 0) return;   // không bán trong 90 ngày → không đề xuất
    // Réo lên khi BẤT KỲ ô nào âm, hoặc khi cả hai ô đều bỏ trống.
    // Không dùng `lt <= 0 && bs <= 0`: lỗi hay gặp nhất là MỘT ô gõ nhầm dấu nằm
    // cạnh một ô đúng — điều kiện "và" bỏ lọt đúng ca đó, mã bị tính hụt trong im lặng.
    const lt = num(it.lead_time_days);
    const bs = num(it.backup_stock_days);
    if (lt < 0 || bs < 0 || (lt === 0 && bs === 0)) {
      missingParams.push(it.item_code);
    }
    const safety = computeSafetyStock({
      totalSales90d: it.total_sales_90d,
      leadTimeDays: it.lead_time_days,
      backupStockDays: it.backup_stock_days,
    });
    if (safety > 0) rootDemand[it.item_code] = safety;
  });

  const { gross, buy } = explodeNetted({
    demand: rootDemand, bomMap, stockMap: ton, onOrderMap: dangVe,
  });

  const lines = Object.keys(buy).sort().map((code) => {
    const retail = num(rootDemand[code]);          // phần do chính mã này bán ra
    const g = num(gross[code]);
    return {
      item_code: code,
      item_name: dict[code]?.item_name || '',
      unit: dict[code]?.unit || '',
      snapshot_gross: g,
      snapshot_ton: num(ton[code]),
      snapshot_dang_ve: num(dangVe[code]),
      retail_qty: retail,
      bom_qty: round3(g - retail),                 // phần do cha kéo xuống
      calculated_qty: buy[code],
      actual_qty: buy[code],
    };
  });

  return { lines, missingParams };
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run src/lib/mrp.test.js
```

Kỳ vọng: PASS — 29 test.

- [ ] **Step 5: Chạy toàn bộ bộ test để chắc không vỡ gì khác**

```bash
npm test
```

Kỳ vọng: PASS toàn bộ, gồm cả `proposalQty.test.js` sẵn có.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mrp.js src/lib/mrp.test.js
git commit -m "feat(mrp): dung dong de xuat kem snapshot de tra nguoc so"
```

---

## Task 5: Đối chiếu engine với dữ liệu thật

Engine xanh test chưa chứng minh nó đúng trên dữ liệu thật. Task này chạy engine trên dữ liệu Supabase thật rồi so tay, **chỉ đọc, không ghi gì**.

**Files:**
- Create: `scripts/doi-chieu-mrp.mjs`

- [ ] **Step 1: Viết script đối chiếu**

Tạo `scripts/doi-chieu-mrp.mjs`:

```js
// Chạy engine MRP trên dữ liệu Supabase THẬT rồi in ra để đối chiếu tay.
// CHỈ ĐỌC — không ghi, không sửa, không xoá gì.
// Chạy:  node scripts/doi-chieu-mrp.mjs
import { createClient } from '@supabase/supabase-js';
import { buildProposalLines } from '../src/lib/mrp.js';

const db = createClient(
  'https://ngwkzicrnspeggunsblr.supabase.co',
  process.env.SUPABASE_KEY,           // truyền khoá qua biến môi trường, không ghi vào tệp
);

async function pagedAll(table, cols) {
  let rows = [], p = 0;
  while (true) {
    const { data, error } = await db.from(table).select(cols).range(p * 1000, (p + 1) * 1000 - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
    p++;
  }
  return rows;
}

const [{ data: summary }, bomRows, stockRows] = await Promise.all([
  db.rpc('get_stock_summary'),
  pagedAll('bom_items', 'product_code, component_code, quantity'),
  pagedAll('inventory_stock', 'item_code, quantity'),
]);

const bomMap = {};
bomRows.forEach((b) => {
  (bomMap[b.product_code] ||= []).push({ component: b.component_code, qty: Number(b.quantity) || 1 });
});

const stockMap = {};
stockRows.forEach((r) => {
  stockMap[r.item_code] = (stockMap[r.item_code] || 0) + (Number(r.quantity) || 0);
});

const items = (summary || []).map((r) => ({
  item_code: r.item_code,
  item_name: r.item_name,
  unit: r.unit,
  total_sales_90d: r.total_sales_90d,
  lead_time_days: r.lead_time_days,
  backup_stock_days: r.backup_stock_days,
  total_quantity: r.total_quantity,
}));

const { lines, missingParams } = buildProposalLines({ items, bomMap, stockMap, onOrderMap: {} });

console.log(`Tong so dong de xuat: ${lines.length}`);
console.log(`Tong so luong:        ${lines.reduce((s, l) => s + l.calculated_qty, 0).toLocaleString('vi-VN')}`);
console.log(`Ma thieu tham so:     ${missingParams.length}`);
console.log('\n--- 15 dong lon nhat ---');
[...lines].sort((a, b) => b.calculated_qty - a.calculated_qty).slice(0, 15).forEach((l) => {
  console.log(
    `${l.item_code.padEnd(20)} gross ${String(l.snapshot_gross).padStart(9)}` +
    ` - ton ${String(l.snapshot_ton).padStart(8)} = ${String(l.calculated_qty).padStart(9)}`
  );
});

console.log('\n--- Kiem chung netting: 2 ma phai KHONG xuat hien ---');
['L-F-OCB10', 'OF-OCB10'].forEach((c) => {
  const l = lines.find((x) => x.item_code === c);
  console.log(`${c.padEnd(20)} ${l ? `⚠ CO, SL ${l.calculated_qty}` : '✅ khong co (ton F-OCB10 da du)'}`);
});
```

- [ ] **Step 2: Chạy script**

Máy này là Windows. PowerShell **không** hiểu cú pháp gán biến ngay trước lệnh, phải tách làm hai:

```powershell
$env:SUPABASE_KEY = 'sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX'
node scripts/doi-chieu-mrp.mjs
```

Nếu chạy bằng Git Bash thì dùng dạng một dòng:

```bash
SUPABASE_KEY=sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX node scripts/doi-chieu-mrp.mjs
```

Kỳ vọng: chạy xong không lỗi, in ra 3 khối.

Nếu RPC `get_stock_summary` trả 0 dòng do RLS chặn khoá công khai, thì đây là kết quả **đúng về mặt bảo mật** — khi đó chuyển sang chạy cùng truy vấn bằng SQL Editor và so tay, ghi rõ vào báo cáo là script không chạy được bằng khoá công khai.

- [ ] **Step 3: Đối chiếu 3 điểm bắt buộc**

| Kiểm tra | Kỳ vọng |
|---|---|
| `L-F-OCB10` và `OF-OCB10` | **Không** xuất hiện — vì tồn `F-OCB10` là 6.713, thừa nhu cầu |
| Mọi dòng | `snapshot_gross − snapshot_ton − snapshot_dang_ve = calculated_qty` |
| Tổng SL | Nhỏ hơn hẳn 170.320 của luồng cũ (công thức mới đệm 60 ngày thay vì 75, lại thêm netting) |

Chọn 1 mã bất kỳ trong 15 dòng lớn nhất, tính tay lại bằng SQL độc lập với code, ghi kết quả vào báo cáo.

- [ ] **Step 4: Commit**

```bash
git add scripts/doi-chieu-mrp.mjs
git commit -m "chore(mrp): script doi chieu engine voi du lieu that (chi doc)"
```

- [ ] **Step 5: Báo cáo cho người dùng**

Trình bảng so sánh: số dòng và tổng SL của luồng cũ (138 dòng / 170.320) so với engine mới, kèm kết quả 3 điểm kiểm chứng ở Step 3. **Nêu rõ phần nào chưa kiểm chứng được và vì sao.**

---

## Hết giai đoạn 1

Sau Task 5, `src/lib/mrp.js` là engine hoàn chỉnh có test, đã đối chiếu dữ liệu thật, và **chưa ảnh hưởng gì tới app đang chạy** — không tệp nào trong `src/pages/` bị sửa, `dksxEngine.js` còn nguyên.

**Các giai đoạn sau sẽ có kế hoạch riêng, lập sau khi giai đoạn này xong:**

| GĐ | Nội dung | Vì sao lập kế hoạch sau |
|---|---|---|
| 2 | Bảng `proposal_batches` + RLS + vòng đời NHAP → DA_GUI → DONG | Cần biết engine trả về hình dạng dữ liệu nào rồi mới chốt cột |
| 3 | Màn duyệt nháp, nút Chạy/Gửi/Huỷ, màn danh sách đợt | Bố cục màn hình phụ thuộc số cột thực tế engine cho ra |
| 4 | Nối nhập kho, đóng dòng, trừ đợt sau, chuyển 138 dòng cũ | Bước duy nhất chạm dữ liệu đang dùng — cần sao lưu và tệp hoàn tác riêng |
