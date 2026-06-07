# Xuất Kho Thủ Công — nhiều mã + danh sách lý do xuất

**Ngày:** 2026-06-07
**Module:** Kho → PSX → "Xuất Kho Thủ Công" (`src/pages/kho/ProductionOrderTab.jsx`)

## Bối cảnh

Phân hệ "Xuất Kho Thủ Công" hiện tại chỉ cho:
- Xuất **1 mã** sản phẩm/linh kiện mỗi phiếu.
- Chọn **2 lý do** cứng (radio): `XDG` (Xuất đóng gói) / `XBS` (Xuất bổ sung lắp ráp).

Nghiệp vụ thực tế cần:
1. Một **danh sách 27 lý do xuất** chuẩn hoá (dropdown).
2. Xuất **nhiều mã trên cùng 1 phiếu**, **mỗi dòng 1 lý do riêng**.

## Mục tiêu

- Modal "Xuất Kho Thủ Công" thành **bảng nhập nhiều dòng**; mỗi dòng có mã + tên + số lượng + lý do riêng.
- Mỗi lý do tự gắn loại `type` (XB/XBS/XDG/KHAC) để phân biệt **doanh số bán** và **demand đề xuất đặt hàng**.
- Tách **demand** khỏi **doanh số**: chỉ "Xuất đóng hàng" (ngoài nhóm XB) được cộng vào demand.

## Danh sách lý do → loại → ảnh hưởng

27 lý do, hằng số trong code. Ánh xạ:

| Loại | Lý do | Vào doanh số (`thong_ke_ban_hang`) | Vào demand (`sales_90d_summary`) | Cần chọn Phiếu SX |
|---|---|:---:|:---:|:---:|
| **XB** | Bán ra · Xuất bảo hành · Đổi hàng · KM · Xuất tặng | ✅ | ✅ | — |
| **XDG** | Xuất đóng hàng | ❌ | ✅ | — |
| **XBS** | Xuất sản xuất · Xuất bổ sung · Xuất sửa chữa | ❌ | ❌ | ✅ (tùy chọn) |
| **KHAC** | Trả cho khách · Xuất đi gia công · Xuất lên VP · Xuất trả lại NCC · Xuất tạm ứng · Xuất hủy · Xuất chuyển mã · Xuất làm chương trình · Xuất cho sếp · Dùng cho kho · Chuyển kho · Tháo máy · Test · Đi kiểm nghiệm · Xuất lắp mẫu · Xuất hỏng · Cho mượn · Xuất mẫu | ❌ | ❌ | — |

Cấu trúc hằng số (đặt đầu file hoặc cạnh component):

```js
const EXPORT_REASONS = [
  { label: 'Bán ra',              type: 'XB' },
  { label: 'Trả cho khách',       type: 'KHAC' },
  { label: 'Xuất bảo hành',       type: 'XB' },
  { label: 'Xuất sản xuất',       type: 'XBS', needsOrderRef: true },
  { label: 'KM',                  type: 'XB' },
  { label: 'Xuất đi gia công',    type: 'KHAC' },
  { label: 'Xuất lên VP',         type: 'KHAC' },
  { label: 'Xuất trả lại NCC',    type: 'KHAC' },
  { label: 'Xuất tạm ứng',        type: 'KHAC' },
  { label: 'Xuất hủy',            type: 'KHAC' },
  { label: 'Xuất chuyển mã',      type: 'KHAC' },
  { label: 'Xuất làm chương trình', type: 'KHAC' },
  { label: 'Xuất cho sếp',        type: 'KHAC' },
  { label: 'Dùng cho kho',        type: 'KHAC' },
  { label: 'Chuyển kho',          type: 'KHAC' },
  { label: 'Tháo máy',            type: 'KHAC' },
  { label: 'Đổi hàng',            type: 'XB' },
  { label: 'Test',                type: 'KHAC' },
  { label: 'Đi kiểm nghiệm',      type: 'KHAC' },
  { label: 'Xuất đóng hàng',      type: 'XDG' },
  { label: 'Xuất tặng',           type: 'XB' },
  { label: 'Xuất lắp mẫu',        type: 'KHAC' },
  { label: 'Xuất hỏng',           type: 'KHAC' },
  { label: 'Xuất bổ sung',        type: 'XBS', needsOrderRef: true },
  { label: 'Xuất sửa chữa',       type: 'XBS', needsOrderRef: true },
  { label: 'Cho mượn',            type: 'KHAC' },
  { label: 'Xuất mẫu',            type: 'KHAC' },
];
```

## Thay đổi Frontend (`ProductionOrderTab.jsx`)

### State

Thay 4 state đơn (`manualProduct`, `manualQty`, `manualReason`, `manualOrderRef`) bằng **mảng dòng**:

```js
const [manualRows, setManualRows] = useState([
  { code: '', name: '', qty: '', reason: 'Bán ra', orderRef: '' }
]);
```

Giữ `recentOrders`, `stockItems` như cũ (load trong `handleOpenManualExport`).

### Modal UI

Bảng nhiều dòng, mỗi dòng gồm:

| Mã (SearchableSelect) | Tên (tự điền, disabled) | SL (number) | Lý do (dropdown 27 mục) | Phiếu SX (chỉ hiện khi `reason.needsOrderRef`) | 🗑️ Xoá dòng |

- Nút **"+ Thêm dòng"** → thêm object rỗng vào `manualRows`.
- Xoá dòng → `splice` (không cho xoá khi chỉ còn 1 dòng, hoặc xoá xong tự thêm dòng rỗng).
- Khi đổi `code` → tự set `name` từ `stockItems`.
- Ô "Phiếu SX" dùng `recentOrders` (giống ô cũ), chỉ render khi lý do của dòng có `needsOrderRef`.

Giữ style/`SearchableSelect`/`s.input`/`s.label` hiện có để đồng bộ giao diện.

### `handleCalculateManualExport`

- Validate: ít nhất 1 dòng có `code` + `qty > 0`. Bỏ qua dòng trống.
- Sinh **1 mã PXK** chung cho cả phiếu (logic sinh mã giữ nguyên).
- `componentsRequired` = map từ các dòng hợp lệ (mỗi dòng giữ thêm `reason`, `type`, `orderRef`).
- Phân bổ FIFO **từng mã**: query `inventory_stock` theo `item_code` (gộp các mã được chọn, hoặc query từng mã rồi gộp `pool`), **loại vị trí `SX9-*`** như hiện tại. Tính `isShortage`/`missing` từng mã.
- `setOrderItems` = mảng các dòng:
  ```js
  { orderCode: orderRef || generatedCode, productCode: code, productName: name, qty, reason, type }
  ```
- Lưu thông tin lý do/type theo từng `allocations[i]` (gắn `reason`, `type`, `orderRef` vào mỗi phần tử `result`) để bước lưu & preview dùng.

### Preview phiếu

- Bảng chi tiết (`allocations.map`) đã hỗ trợ nhiều mã — giữ nguyên, **thêm 1 cột "Lý do"** cho `mode === 'manual_export'`.
- Header: bỏ cách hiển thị `orderItems[0]` đơn lẻ (dòng ~1403-1407, 1425). Thay bằng tóm tắt: **Số mã xuất** + **Tổng SL xuất**, bỏ dòng "Mục đích" đơn (lý do đã nằm trong bảng chi tiết).

### `confirmDeductAndCreateOrder` (nhánh manual_export)

Khi `mode === 'manual_export'`:
- **Trừ kho FIFO** từng lô như hiện tại (vòng lặp `allocations` → `alloc.stock_id`).
- `inventory_picking_logs`: mỗi lô 1 log; `product_code` = `'XUAT_KHO'` (generic); `notes` = **text lý do của dòng** (vd "Xuất hủy").
- `luu_xuat`: mỗi mã 1 dòng:
  - `ma_don_hang` = `orderRef` của dòng nếu có, ngược lại = mã PXK.
  - `ma_san_pham` = mã; `so_luong` = qty; `ngay_xuat` = hôm nay.
  - `type` = **type của dòng đó** (không dùng 1 `exportType` chung cho cả phiếu nữa).
- Bỏ logic cũ `manualReason === 'XBS' ? 'Bổ sung' : 'XUAT_KHO'` và `exportType` chung cho manual_export.

## Thay đổi DB

File migration mới: `sql/update_demand_view_include_xdg.sql`

```sql
CREATE OR REPLACE VIEW public.sales_90d_summary AS
SELECT
    ma_san_pham,
    SUM(CAST(so_luong AS NUMERIC)) AS total_sales
FROM public.so_luong_ban
WHERE ngay_xuat >= (CURRENT_DATE - INTERVAL '90 days')
  AND type IN ('XB','XDG')              -- thêm XDG (xuất đóng hàng) vào demand
  AND CAST(so_luong AS NUMERIC) > 0
GROUP BY ma_san_pham;

GRANT SELECT ON public.sales_90d_summary TO authenticated, anon;
```

- `thong_ke_ban_hang` (doanh số bán) **giữ nguyên** `type='XB'` → doanh số vẫn tách khỏi demand.
- Chạy thủ công trên Supabase SQL Editor (giống các migration khác trong `sql/`).

## Lưu ý / hệ quả

- Cột "TB Bán/Ngày", "TB Bán/Tháng" ở tab Tồn HH (`StockSummaryTab`) sau khi sửa view sẽ **gồm cả "Xuất đóng hàng"** — đúng bản chất "tiêu thụ để đặt hàng" (đã thống nhất với user). Không đổi nhãn.
- Linh kiện cấp cho **Lệnh Sản Xuất** vẫn ghi `XBS` → **không** vào demand (tránh đếm trùng với BOM của sản phẩm bán XB).
- Các lý do `XBS` thủ công (Xuất SX/bổ sung/sửa chữa) không vào doanh số, không vào demand; chỉ để ghi nhận xuất kho + (tùy chọn) liên kết Phiếu SX.

## Phạm vi KHÔNG làm (YAGNI)

- Không quản lý danh sách lý do bằng bảng DB/Danh mục — hằng số trong code là đủ.
- Không sửa các luồng xuất khác (delivery, disassemble, production, SaveExportTab).
- Không backfill/đổi type cho dữ liệu cũ ngoài việc view demand tự bao gồm XDG lịch sử.
