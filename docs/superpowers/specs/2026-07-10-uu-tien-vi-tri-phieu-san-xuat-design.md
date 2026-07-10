# Ưu tiên lấy ở vị trí tự chọn khi làm Phiếu Sản Xuất — Design

**Ngày:** 2026-07-10
**File chính:** `src/pages/kho/ProductionOrderTab.jsx`, `src/lib/productionAlloc.js`
**Tab:** Kho Hàng → PSX → "Lệnh Sản Xuất"

## Bối cảnh

Modal "Lệnh Sản Xuất" hiện có sẵn ô tick **"Ưu tiên lấy kho VTSX (SX11-...)"**. Khi bật,
`handleCalculate` truyền `priorityVTSX: true` vào [`allocateFIFO`](../../../src/lib/productionAlloc.js);
hàm này đẩy các dòng tồn có `location` bắt đầu bằng `SX11-` lên **lấy trước**, phần còn lại
vẫn theo nguyên tắc nền.

Nguyên tắc nền (giữ nguyên, KHÔNG đổi trong feature này) do `sortStockForFIFO` quyết định:
**ngày nhập cũ trước (FIFO) → cùng ngày thì theo thứ tự vị trí (dãy A→Z, tầng M-H-B-T-N-S,
ô 1→20)**. (Lưu ý: KHÔNG phải "vị trí ít số lượng hơn ưu tiên" — đây là hiểu nhầm cần ghi rõ.)

Người dùng muốn **tổng quát hóa** cơ chế ưu tiên: thay vì cứng `SX11-`, cho phép **tự tick
chọn 1 hoặc nhiều vị trí** làm ưu tiên. Sau khi ưu tiên các vị trí đã chọn, phần còn lại vẫn
áp dụng đúng nguyên tắc nền đang chạy.

## Quyết định đã chốt

1. **Nguồn danh sách vị trí = chỉ những vị trí đang có tồn của linh kiện trong phiếu.**
   Người dùng nhập thành phẩm + SL trước; khi bấm "Tìm vị trí", app tính nhu cầu linh kiện
   (BOM) + query tồn 1 lần rồi CHỈ hiện các vị trí thực sự đang chứa các linh kiện đó.
2. **Giữ nguyên ô tick SX11 cũ** + thêm phần chọn vị trí tự chọn độc lập bên dưới.
3. **Thứ tự ưu tiên khi bật cả hai:** SX11 → vị trí tự chọn → phần còn lại (3 nhóm).
4. **Khớp chính xác từng vị trí** đã tick (dùng `Set` + so sánh bằng, KHÔNG theo dãy/khu,
   KHÔNG `includes`/`startsWith`). Đúng quy ước lọc chính xác của app.
5. **Trong mỗi nhóm giữ nguyên thứ tự FIFO nền** (không sắp lại).
6. **Phạm vi: chỉ phiếu sản xuất** (`handleCalculate` → "Tính toán bốc dỡ"). Luồng xuất đơn
   hàng (`handleCalculateDelivery`) và xuất kho tay (`handleCalculateManualExport`) KHÔNG đụng.

## Thay đổi logic lõi — `allocateFIFO`

Thêm opt `priorityLocations` (mảng chuỗi vị trí). Xếp tồn `available` thành 3 nhóm bằng
filter+concat (giữ ổn định thứ tự nền, giống cách `priorityVTSX` đang làm):

```js
export function allocateFIFO(componentsRequired, stockData, opts = {}) {
  const { priorityVTSX = false, priorityLocations = [], phieuCode = '' } = opts;
  let available = JSON.parse(JSON.stringify(stockData || []));
  const priSet = new Set(priorityLocations || []);
  const isSX11 = (s) => s.location && s.location.startsWith('SX11-');
  if (priorityVTSX || priSet.size) {
    const t0 = [], t1 = [], t2 = [];
    for (const s of available) {
      if (priorityVTSX && isSX11(s)) t0.push(s);        // Nhóm 1: SX11 (khi bật SX11)
      else if (priSet.has(s.location)) t1.push(s);      // Nhóm 2: vị trí tự chọn
      else t2.push(s);                                  // Nhóm 3: phần còn lại
    }
    available = [...t0, ...t1, ...t2];
  }
  // ... phần còn lại giữ nguyên (vòng lặp phân bổ, SL âm → SX9, sort hiển thị theo vị trí)
}
```

Ghi chú tương thích ngược:
- `priorityLocations` mặc định `[]` → không tick gì thì `priSet.size === 0` và `priorityVTSX
  === false` ⇒ bỏ qua khối gộp nhóm, hành vi y hệt hiện nay.
- Test cũ "ưu tiên kho SX11- khi priorityVTSX" vẫn đúng (t0=[SX11], t1=[], t2=[rest]).
- Vị trí tự chọn trùng SX11 và đang bật SX11 → rơi vào t0 (vẫn được ưu tiên, không nhân đôi).

## UI — modal Lệnh Sản Xuất

State mới trong `ProductionOrderTab`:
```js
const [priorityLocEnabled, setPriorityLocEnabled] = useState(() => localStorage.getItem('prod_priorityLocEnabled') === 'true');
const [priorityLocations, setPriorityLocations] = useState(() => { try { return JSON.parse(localStorage.getItem('prod_priorityLocations')) || []; } catch { return []; } }); // mảng chuỗi vị trí đã chọn
const [priorityLocOptions, setPriorityLocOptions] = useState(null); // null=chưa tìm; []=đã tìm, rỗng
const [loadingPriorityLoc, setLoadingPriorityLoc] = useState(false);
```
Persist `prod_priorityLocEnabled`, `prod_priorityLocations` trong effect lưu localStorage
hiện có (cùng chỗ với `prod_priorityVTSX`).

Dưới ô tick SX11 (dòng ~1737), thêm:
- Ô tick **"Ưu tiên lấy ở vị trí tự chọn"** → khi bật, hiện nút **"🔍 Tìm vị trí"**.
- Bấm "Tìm vị trí" → gọi `loadPriorityLocationOptions()`:
  1. Lấy `rows` hợp lệ từ `prodRows` (giống đầu `handleCalculate`); rỗng → alert "Nhập thành
     phẩm + SL trước".
  2. Query `bom_items` theo mã SP → `aggregateComponentDemand` → `compCodes`.
  3. Query `inventory_stock` where `item_code in compCodes and quantity > 0`.
  4. Gom distinct theo `location`: mỗi vị trí = `{ location, totalQty, codeCount }`
     (tổng tồn linh kiện & số mã linh kiện tại vị trí đó, để người dùng dễ chọn).
  5. Sắp bằng `compareLocations`; set vào `priorityLocOptions`.
- Component nội bộ **`PriorityLocationPicker`** (co-located, giống `SearchableSelect`/
  `EditAllocationModal`): ô tìm kiếm gõ lọc (tone-insensitive qua `removeTones`) + danh sách
  **checkbox** cuộn trong khung (maxHeight ~220px, KHÔNG dropdown nổi để tránh lỗi cắt cụt
  trong modal [[qlsx-modal-dropdown-clipping]]). Mỗi dòng: `[✓] <vị trí>  (tồn: X · N mã)`.
  Vị trí đã chọn hiển thị thành các **chip bỏ được** phía trên danh sách.

`handleCalculate` (dòng ~442): truyền thêm `priorityLocations` vào `allocateFIFO`:
```js
const { result, isShortage: hasShortage } = allocateFIFO(componentsRequired, stockData, {
  priorityVTSX,
  priorityLocations: priorityLocEnabled ? priorityLocations : [],
  phieuCode: generatedCode,
});
```

## Edge cases

- Bật "vị trí tự chọn" nhưng chưa tick vị trí nào (hoặc chưa bấm Tìm) → `priorityLocations`
  rỗng → không ảnh hưởng phân bổ.
- Đổi thành phẩm sau khi đã chọn vị trí → giữ nguyên lựa chọn cũ; vị trí nào không còn chứa
  linh kiện cần thì tự động vô hại (rơi vào nhóm 3). Không cần xoá cứng.
- Vị trí đã chọn hết tồn khi phân bổ → không lấy được ở đó, tự chuyển xuống theo thứ tự — như
  hành vi thiếu hàng hiện tại.

## Kiểm thử — `src/lib/productionAlloc.test.js`

Thêm vào `describe('allocateFIFO')`:
1. **Ưu tiên vị trí tự chọn trước FIFO nền:** stock 2 vị trí, chọn vị trí đứng sau trong FIFO
   → alloc đầu tiên là vị trí đã chọn.
2. **Kết hợp SX11 + tự chọn đúng thứ tự 3 nhóm:** có SX11, có vị trí tự chọn, có vị trí thường
   → thứ tự lấy SX11 → tự chọn → thường.
3. **Khớp chính xác:** chọn `HH2` KHÔNG kéo theo `HH20`.
4. (Regression) không tick gì → giữ nguyên thứ tự `sortStockForFIFO`.

## Ngoài phạm vi (YAGNI)

- Không đổi nguyên tắc nền sang "ít số lượng trước".
- Không ưu tiên theo dãy/khu (prefix).
- Không áp cho luồng xuất đơn hàng / xuất kho tay.
