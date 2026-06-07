# Lệnh Sản Xuất nhiều mã trên 1 phiếu — Design

**Ngày:** 2026-06-07
**File chính:** `src/pages/kho/ProductionOrderTab.jsx`
**Tab:** Kho Hàng → PSX → "Lệnh Sản Xuất"

## Bối cảnh

Hiện tại "Lệnh Sản Xuất" chỉ nhận **1 thành phẩm + số lượng**, tính BOM, phân bổ FIFO,
rồi khi lưu: tạo **1** dòng `production_orders` (hiển thị ở AdminDashboard cho chuyền),
tạo tồn WIP `SX9-[mã phiếu]`, và trừ nhu cầu DKSX của mã đó.

Người dùng cần làm **nhiều thành phẩm trên cùng 1 phiếu** (ví dụ một loạt mã dây DD6-010,
DD6-035, …), và phần **linh kiện lấy ra hiển thị số tổng chung** (gộp theo mã linh kiện —
ví dụ T-0402 "Dây 6" = 2.643 = tổng nhu cầu của tất cả thành phẩm).

Pattern này đã có sẵn ở "Xuất Kho Thủ Công" (nhiều dòng) và "Nhập Đơn Hàng"
(`handleCalculateDelivery` gom demand theo mã rồi phân bổ 1 lần).

## Quyết định đã chốt

1. **Mỗi thành phẩm = 1 dòng `production_orders` riêng** (để chuyền theo dõi năng suất từng mã),
   nhưng dùng chung 1 phiếu in.
2. **Linh kiện gộp tổng theo mã** (1 dòng/mã linh kiện, số tổng chung).
3. **Mã lệnh:** 1 mã phiếu chung `PSX-YYYYMMDD-NN`; mỗi lệnh con = `PSX-...-NN.1`, `.2`, …
   Khi chỉ 1 thành phẩm → giữ nguyên `PSX-...-NN` (không hậu tố), hành vi y như cũ.
4. **Phiếu in:** khối trên "Danh sách thành phẩm" (Mã/Tên/SL, **không** cột ngày từng dòng —
   ngày chỉ ghi ở header); khối dưới "LINH KIỆN" gộp tổng.

## Mô hình dữ liệu / state

Thay state đơn (`selectedProduct`, `quantity`) bằng danh sách dòng cho mode production:

```js
// id ổn định để giữ focus khi xoá dòng giữa (giống emptyManualRow)
let __prodRowSeq = 0;
const emptyProdRow = () => ({ id: ++__prodRowSeq, code: '', name: '', qty: 1 });
const [prodRows, setProdRows] = useState([emptyProdRow()]);
```

- Persist `prodRows` vào localStorage (`prod_rows`), thay cho `prod_selectedProduct`/`prod_quantity`.
- `sxPrefill` từ DKSX (nút "Làm phiếu SX") → set `prodRows = [{code, qty}]` (1 dòng).
- `selectedProduct`/`quantity` cũ: bỏ, hoặc giữ làm alias cho dòng đầu nếu cần ít thay đổi
  ở chỗ khác. **Quyết định:** bỏ hẳn, thay mọi tham chiếu bằng `prodRows`.

`allocations` (kết quả linh kiện gộp) giữ nguyên cấu trúc hiện tại
(`{ code, name, unit, requiredQty, allocations:[...], missing, isShortage }`),
vì đã là "1 entry / mã linh kiện".

Thêm state lưu danh sách thành phẩm của phiếu để in & để lưu lệnh:

```js
// [{ orderCode, productCode, productName, qty }] — mỗi phần tử 1 lệnh con
const [prodFinishedItems, setProdFinishedItems] = useState([]);
```

## Luồng tính toán — `handleCalculate` (viết lại cho multi)

1. **Validate:** lọc `prodRows` có `code` và `qty > 0`. Nếu rỗng → alert.
2. **Sinh mã phiếu** `PSX-YYYYMMDD-NN` (logic seq hiện tại giữ nguyên — query `PSX-${date}-%`,
   `parseInt(split('-').pop())`). Lưu vào `orderCode`.
3. **Sinh mã lệnh con + danh sách thành phẩm:**
   - Nếu 1 dòng → `orderCode` (không hậu tố).
   - Nếu nhiều dòng → `${orderCode}.${k}` (k = 1..n).
   - Build `prodFinishedItems = [{ orderCode: codeK, productCode, productName, qty }]`.
   - Lưu ý: nếu cùng 1 mã thành phẩm xuất hiện 2 dòng → vẫn tạo 2 lệnh con (.1, .2). Chấp nhận.
4. **Gom BOM tất cả thành phẩm → nhu cầu linh kiện tổng:**
   - Query `bom_items` cho tất cả `product_code` trong các dòng (`.in('product_code', codes)`).
   - `demandMap[component_code].requiredQty += b.quantity * row.qty` (cộng dồn qua mọi dòng,
     đúng cả khi nhiều thành phẩm share linh kiện).
   - Lấy `item_name` từ `inventory_items` (như hiện tại).
   - Nếu không thành phẩm nào có BOM → throw "chưa có cấu trúc BOM".
5. **Phân bổ FIFO 1 lần** trên `componentsRequired = Object.values(demandMap)` —
   tái dùng đúng vòng lặp allocation hiện có (gồm `priorityVTSX` SX11-, và nhánh số âm tháo máy).
   - Nhánh số âm (tháo máy): location trả về `SX9-${orderCode}` (mã phiếu chung). Hiếm gặp với
     multi; giữ hành vi hợp lý, không cần tối ưu.
6. Set `allocations`, `isShortage`, `stockPool` (cho popup Sửa phân bổ).

> Ghi chú: bước 4–5 gần như bản gộp của `handleCalculate` cũ + `handleCalculateDelivery`
> (gom demand). Có thể refactor chung 1 helper `allocateFIFO(componentsRequired, stockData, opts)`
> nhưng KHÔNG bắt buộc trong phạm vi này — ưu tiên ít rủi ro, viết thẳng trong `handleCalculate`.

## Luồng lưu — `confirmDeductAndCreateOrder` (nhánh production)

Phần trừ kho linh kiện + `inventory_picking_logs` + `luu_xuat` giữ nguyên cơ chế hiện tại,
chỉ khác:

- `picking_logs.product_code`: hiện dùng `selectedProduct`. Với multi không có 1 mã duy nhất →
  dùng `'SAN_XUAT'` (hằng marker, song song với `'DON_HANG'`/`'XUAT_KHO'` đã có), hoặc mã phiếu.
  **Quyết định:** dùng `prodFinishedItems[0].productCode` nếu chỉ 1 dòng (giữ nguyên hành vi cũ),
  ngược lại `'SAN_XUAT'`.
- `luu_xuat` (mode production) ghi theo `orderCode` (mã phiếu chung), type `XBS` — giữ nguyên.

Khối tạo lệnh chuyền — thay đoạn "tạo 1 lệnh + 1 WIP + trừ 1 demand" thành **vòng lặp qua
`prodFinishedItems`:**

```js
if (mode === 'production') {
  const wipInserts = [];
  const orderUpserts = [];
  for (const it of prodFinishedItems) {
    const { data: capData } = await db.from('product_capacities')
      .select('capacity_per_hour').eq('product_code', it.productCode).single();
    const stdTime = capData?.capacity_per_hour ? (1/parseFloat(capData.capacity_per_hour)) : 0.05;
    orderUpserts.push({
      order_code: it.orderCode, product_code: it.productCode,
      target_quantity: it.qty, standard_time_per_unit: stdTime, status: 'pending'
    });
    wipInserts.push({
      item_code: it.productCode,
      item_name: it.productName || `Thành phẩm ${it.productCode}`,
      unit: 'Bộ', location: `SX9-${it.orderCode}`,
      quantity: it.qty, import_date: todayLocal()
    });
  }
  await db.from('production_orders').upsert(orderUpserts, { onConflict: 'order_code' });
  await db.from('inventory_stock').insert(wipInserts);     // log warn nếu lỗi, không throw
  // Trừ DKSX: gộp theo productCode (cộng qty) rồi update từng mã (tránh update 2 lần khi trùng mã)
  ...
}
```

- WIP location dùng **mã lệnh con** (`SX9-${it.orderCode}`) → mỗi thành phẩm có ô SX9 riêng,
  khớp với việc mỗi lệnh con theo dõi độc lập ở Tồn SX.
- Trừ `production_demand`: gom theo `productCode` (Σqty) trước khi update để không trừ thiếu/thừa
  khi 1 mã xuất hiện nhiều dòng.

## Phiếu in / kết quả (mode production)

Trong `#print-area`, khi `mode === 'production'`:

- **Header:** thay block "Mã SP / Tên SP / Số lượng SX" đơn lẻ bằng:
  - Trái: tổng quan — `Số mã SX: {prodFinishedItems.length}` · `Tổng SL: Σqty`.
  - Phải: `Mã phiếu: {orderCode}` · `Ngày: ...` (ngày chỉ ở header — đã chốt).
- **Khối "Danh sách thành phẩm sản xuất"** (mới, đặt TRÊN bảng linh kiện): bảng
  cột `Mã SP | Tên | Số lượng | Mã lệnh`. (Mã lệnh hiển thị để chuyền đối chiếu;
  bỏ nếu thấy rườm — nhưng giữ vì có nhiều lệnh con.)
- **Khối "LINH KIỆN"** (`allocations`): giữ nguyên bảng hiện tại, tiêu đề đổi thành
  "Danh sách linh kiện cần lấy (tổng chung):".
- Tiêu đề phiếu `PHIẾU SẢN XUẤT` giữ nguyên.

Các mode khác (delivery / manual_export / disassemble) **không đổi**.

## Form modal (showProductionModal)

Viết lại nội dung modal production thành bảng nhiều dòng:

- Mỗi dòng: `SearchableSelect` (options = products từ BOM) cho mã + ô số lượng + nút xoá.
  Khi chọn mã → set luôn `name` từ `products`.
- Nút **+ Thêm thành phẩm** (thêm `emptyProdRow()`).
- Dùng `key={row.id}` để giữ focus khi xoá dòng giữa (bài học từ commit 75bbb96).
- Field dùng chung dưới bảng: Ngày SX, Ghi chú, checkbox "Ưu tiên kho VTSX (SX11-...)".
- Nút "Tính toán bốc dỡ" disabled khi không có dòng hợp lệ nào.
- Modal có thể cần rộng hơn (maxWidth ~640) để chứa bảng.

## Persistence / reset

- `prod_rows` thay `prod_selectedProduct`/`prod_quantity` trong effect lưu localStorage.
- Lưu thêm `prod_finishedItems` cùng nhóm với `allocations` (để giữ kết quả qua chuyển tab).
- `handleResetToCards`: reset `prodRows = [emptyProdRow()]`, `prodFinishedItems = []`.

## Phạm vi KHÔNG làm (YAGNI)

- Không refactor chung allocation helper cho cả 4 mode (rủi ro cao, lợi ích thấp ở bước này).
- Không thêm cột "Ngày" từng dòng thành phẩm trên phiếu in.
- Không đổi schema DB (tận dụng `order_code` UNIQUE sẵn có với hậu tố `.k`).
- Không gộp các mode khác.

## Rủi ro / lưu ý

- **Seq mã phiếu:** mã lệnh con dạng `PSX-...-NN.k`; bộ sinh seq dùng
  `parseInt(order_code.split('-').pop())` → với `"...-01.2"` cho `parseInt("01.2") = 1`,
  nên seq phiếu kế tiếp vẫn đúng (= 2). Cần kiểm thử khi có cả phiếu 1-mã và nhiều-mã trong ngày.
- **Trùng mã thành phẩm trong cùng phiếu:** tạo nhiều lệnh con .k cho cùng product_code → OK với
  `order_code` UNIQUE; nhưng DKSX phải gộp Σqty trước khi trừ.
- **picking_logs.product_code = 'SAN_XUAT'** với multi: kiểm tra các tab đọc picking_logs
  (LS bốc dỡ) không vỡ khi gặp marker này (đã có tiền lệ 'DON_HANG'/'XUAT_KHO').
