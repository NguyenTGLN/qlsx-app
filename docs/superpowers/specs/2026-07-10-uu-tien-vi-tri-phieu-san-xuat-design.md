# Ưu tiên lấy ở vị trí tự chọn (Sản xuất + Đơn hàng) — Design

**Ngày:** 2026-07-10
**File chính:** `src/pages/kho/ProductionOrderTab.jsx`, `src/lib/productionAlloc.js`
**Tab:** Kho Hàng → PSX → "Lệnh Sản Xuất" / "Nhập Đơn Hàng" / "Xuất Kho Thủ Công"

## Bối cảnh

Modal "Lệnh Sản Xuất" có sẵn ô tick **"Ưu tiên lấy kho VTSX (SX11-...)"**. Khi bật,
`handleCalculate` truyền `priorityVTSX: true` vào [`allocateFIFO`](../../../src/lib/productionAlloc.js),
đẩy các dòng tồn `location` bắt đầu `SX11-` lên **lấy trước**, phần còn lại theo nguyên tắc nền.

Nguyên tắc nền (GIỮ NGUYÊN) do `sortStockForFIFO`: **ngày nhập cũ trước (FIFO) → cùng ngày
thì theo thứ tự vị trí (dãy A→Z, tầng M-H-B-T-N-S, ô 1→20)**. (KHÔNG phải "ít số lượng ưu tiên".)

Người dùng muốn **tự tick chọn 1 hay nhiều vị trí** làm ưu tiên, áp cho **cả phiếu sản xuất
LẪN đơn hàng** (Excel + nhập tay). Sau khi ưu tiên các vị trí đã chọn, phần còn lại vẫn theo
nguyên tắc nền.

## Quyết định đã chốt

1. **Đặt bộ chọn vị trí ưu tiên ở MÀN KẾT QUẢ, dùng chung mọi loại phiếu.** Sau khi tính xong
   (sản xuất / đơn hàng Excel / đơn hàng nhập tay / xuất kho tay), hiện panel "Ưu tiên vị trí"
   phía trên bảng kết quả. Tick vị trí + bấm **"Tính lại theo vị trí ưu tiên"** → bảng cập nhật.
   → Phủ được cả đường Excel (vốn không có bước tùy chọn trước khi tính).
2. **Danh sách vị trí = các vị trí đang có tồn của mặt hàng trong phiếu** — lấy từ `stockPool`
   (đã có sẵn trong state ngay sau khi tính, không query thêm).
3. **Giữ nguyên ô tick SX11** trong modal sản xuất (preset nhanh, chỉ áp cho sản xuất).
4. **Thứ tự ưu tiên:** SX11 (chỉ mode sản xuất, nếu bật) → vị trí tự chọn → phần còn lại.
5. **Khớp chính xác từng vị trí** đã tick (`Set` + so sánh bằng; KHÔNG dãy/khu, KHÔNG
   `includes`/`startsWith`). Đúng quy ước lọc chính xác của app.
6. **Trong mỗi nhóm giữ nguyên thứ tự FIFO nền** (không sắp lại).

## Logic lõi — `src/lib/productionAlloc.js`

### `applyPriorityOrder(stockRows, opts)` — MỚI, thuần, có test
Gộp tồn thành 3 nhóm, giữ ổn định thứ tự nền trong mỗi nhóm (filter+concat):
```js
export function applyPriorityOrder(stockRows, { priorityVTSX = false, priorityLocations = [] } = {}) {
  const priSet = new Set(priorityLocations || []);
  const isSX11 = (s) => s.location && s.location.startsWith('SX11-');
  if (!priorityVTSX && priSet.size === 0) return [...(stockRows || [])];
  const t0 = [], t1 = [], t2 = [];
  for (const s of (stockRows || [])) {
    if (priorityVTSX && isSX11(s)) t0.push(s);       // Nhóm 1: SX11 (chỉ khi bật)
    else if (priSet.has(s.location)) t1.push(s);     // Nhóm 2: vị trí tự chọn
    else t2.push(s);                                 // Nhóm 3: phần còn lại
  }
  return [...t0, ...t1, ...t2];
}
```

### `allocateFIFO` — thêm opt `priorityLocations`
Thay khối SX11 nội tuyến hiện tại bằng `available = applyPriorityOrder(available, { priorityVTSX, priorityLocations })`.
Chữ ký: `opts = { priorityVTSX, priorityLocations = [], phieuCode }`. Tương thích ngược: không
tick gì → `applyPriorityOrder` trả copy nguyên thứ tự → hành vi y hệt hiện nay.

### `allocateExport(demandRows, stockData, opts)` — MỚI, thuần, có test
Rút gọn 2 vòng lặp phân bổ **trùng lặp** đang nằm trong `handleCalculateDelivery` và
`handleCalculateManualExport` thành 1 hàm chung (giảm trùng code, để "tính lần đầu" == "tính lại"):
```js
export function allocateExport(demandRows, stockData, opts = {}) {
  const { priorityLocations = [] } = opts;
  const working = applyPriorityOrder(JSON.parse(JSON.stringify(stockData || [])), { priorityLocations });
  let isShortage = false;
  const result = [];
  for (const d of demandRows) {
    let qtyNeeded = Number(d.requiredQty);
    // Xuất bán/đơn hàng KHÔNG lấy từ kho sản xuất dở dang (SX9-*)
    const rows = working.filter(s => s.item_code === d.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
    const allocs = [];
    for (let i = 0; i < rows.length && qtyNeeded > 0; i++) {
      const r = rows[i]; const take = Math.min(r.quantity, qtyNeeded);
      const before = r.quantity; r.quantity -= take; qtyNeeded -= take;
      allocs.push({ stock_id: r.id, location: r.location, before, taken: take, remaining: r.quantity });
    }
    if (qtyNeeded > 0) isShortage = true;
    allocs.sort((x, y) => compareLocations(x.location, y.location)); // hiển thị theo lộ trình
    result.push({ ...d, requiredQty: Number(d.requiredQty), allocations: allocs, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
  }
  return { result, isShortage };
}
```
- `...d` giữ passthrough (name/unit/reason/type/orderRef) cho delivery & manual.
- `working` chia sẻ giữa các dòng → nhiều dòng cùng mã (manual) trừ dồn đúng.

### Refactor các handler dùng `allocateExport`
- `handleCalculateDelivery`: thay vòng lặp nội tuyến bằng
  `const { result, isShortage } = allocateExport(componentsRequired, stockData, { priorityLocations })`.
- `handleCalculateManualExport`: dùng `allocateExport(rowsAsDemand, stockData, { priorityLocations })`
  với `rowsAsDemand = rows.map(r => ({ code:r.code, name:r.name, unit:'', requiredQty:Number(r.qty), reason:r.reason, type:reasonType(r.reason), orderRef:r.orderRef||'' }))`.
  Phần build `orderItemsArr` tách riêng (map từ `rows`, không phụ thuộc phân bổ) — giữ nguyên.

## State + recompute — `ProductionOrderTab`

State mới:
```js
const [priorityLocations, setPriorityLocations] = useState([]);   // vị trí tự chọn (mảng chuỗi)
const [recomputeDemand, setRecomputeDemand] = useState(null);     // demand đã dùng để tính (theo mode)
```
Persist `prod_priorityLocations`, `prod_recomputeDemand` cùng chỗ với `prod_allocations`
(để sống qua chuyển tab). **Reset `priorityLocations=[]`** ở đầu mỗi lần tính mới
(`handleCalculate`, `handleCalculateDelivery`, `handleCalculateManualExport`).

Mỗi handler tính toán: sau khi có `demand`, `setRecomputeDemand({ mode, demand })` (production:
`componentsRequired`; delivery: `Object.values(demandMap)`; manual: `rowsAsDemand`).

`recomputeWithPriority()`:
1. Rebuild stock từ `stockPool` (giữ thứ tự FIFO trong từng mã):
   `Object.entries(stockPool).flatMap(([item_code, rows]) => rows.map(r => ({ id:r.id, item_code, location:r.location, quantity:r.quantity })))`.
2. Theo `recomputeDemand.mode`:
   - `production`: `allocateFIFO(demand, stock, { priorityVTSX, priorityLocations, phieuCode: orderCode })`.
   - `delivery` | `manual_export`: `allocateExport(demand, stock, { priorityLocations })`.
3. `setAllocations(sortResultByLocation(result)); setIsShortage(isShortage)`.
   (Không đụng `orderItems` — không đổi theo vị trí.)

> Lưu ý `stockPool` là tồn GỐC (trước khi trừ) → tính lại luôn từ đầu, đúng.

## UI — panel "Ưu tiên vị trí" ở màn kết quả

Đặt ngay dưới header kết quả ([dòng ~1414](../../../src/pages/kho/ProductionOrderTab.jsx)),
là `<div className="no-print">` (không in ra phiếu), chỉ hiện khi
`mode ∈ {production, delivery, manual_export}` và có `allocations`.

Nội dung:
- Tiêu đề "Ưu tiên lấy ở vị trí" + gợi ý ngắn.
- Options = distinct location từ `stockPool`: `{ location, totalQty, codeCount }`, sắp theo
  `compareLocations`. **Với delivery/manual loại bỏ `SX9-*`** (phân bổ vốn không lấy ở đó).
- Component nội bộ `PriorityLocationPicker`: ô tìm kiếm (tone-insensitive `removeTones`) +
  danh sách **checkbox** cuộn trong khung (maxHeight ~220px, KHÔNG dropdown nổi — tránh lỗi cắt
  cụt trong modal [[qlsx-modal-dropdown-clipping]]). Mỗi dòng `[✓] <vị trí> (tồn: X · N mã)`.
  Vị trí đã chọn = các **chip bỏ được** phía trên.
- Nút **"Tính lại theo vị trí ưu tiên"** (disabled khi `priorityLocations` rỗng) → gọi
  `recomputeWithPriority()`. Nút phụ "Bỏ ưu tiên" → `setPriorityLocations([])` + tính lại.

## Edge cases

- Chưa tick vị trí nào → không ảnh hưởng (giống hiện nay).
- Vị trí đã chọn hết tồn khi phân bổ → không lấy được ở đó, chuyển xuống theo thứ tự (như xử
  lý thiếu hàng hiện tại).
- Bấm "Tính lại" nhiều lần → luôn tính từ `stockPool` gốc, không cộng dồn sai.
- Delivery đang có sẵn luồng "xoá đơn thiếu & tính lại" → độc lập, không xung đột (đều gọi lại
  từ đầu). Ưu tiên vị trí tính trên toàn bộ đơn hiện có.

## Kiểm thử — `src/lib/productionAlloc.test.js`

- `applyPriorityOrder`: (a) vị trí tự chọn lên trước, giữ FIFO nền trong nhóm; (b) SX11 + tự
  chọn đúng thứ tự 3 nhóm; (c) khớp chính xác ('HH2' không kéo 'HH20'); (d) không tick → nguyên thứ tự.
- `allocateFIFO`: test cũ giữ nguyên + 1 test `priorityLocations` ưu tiên trước FIFO nền.
- `allocateExport`: (a) loại trừ `SX9-*`; (b) nhiều dòng cùng mã trừ dồn đúng; (c) `priorityLocations`
  ưu tiên trước; (d) đánh dấu thiếu khi không đủ; (e) giữ passthrough reason/type/orderRef.

## Ngoài phạm vi (YAGNI)

- Không đổi nguyên tắc nền sang "ít số lượng trước".
- Không ưu tiên theo dãy/khu (prefix).
- Không áp SX11 preset cho delivery/manual (chỉ vị trí tự chọn).
- Mode `disassemble` (phân rã) không có panel ưu tiên.
