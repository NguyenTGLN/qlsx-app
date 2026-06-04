# Đề xuất mua thẳng cho mã bán lẻ (không có BOM)

**Ngày:** 2026-06-04
**Module:** Kho — tab Tồn HH (`StockSummaryTab`) + engine đề xuất (`dksxEngine.js`)

## Bối cảnh & Vấn đề

Luồng "Gửi đề xuất" hiện tại ở tab Tồn HH chỉ nhận **thành phẩm có BOM**: đưa sang DKSX (`production_demand`) → `recomputeProposals()` nổ BOM → sinh dòng DLK linh kiện cần mua trong `purchase_proposals`. Mã **không có BOM bị bỏ qua** (`skipped`).

Nhưng có những mã **nhập về bán lẻ** — *có xuất bán nhưng không có BOM* (vd `FK-RO50-CSM` "Màng RO CSM rời"). Loại này mua thẳng đúng mã đó về bán, **không sản xuất**, nên không cần qua DKSX/nổ BOM. User muốn các mã này đi **thẳng vào bảng Đề xuất (DLK)** khi bấm "Gửi đề xuất".

## Quyết định đã chốt với user

1. **Tiêu chí mã bán lẻ:** không có BOM (không là `product_code` trong `bom_items`) **VÀ** có xuất bán. Nhận diện "có xuất bán" qua `row.avg_daily > 0` (đã có sẵn trên row, từ `sales_90d_summary`).
2. **Quy tắc số lượng = MAX** (giống DKSX upsert): nếu mã đã có dòng DLK bán lẻ đang mở (`'Mới'`), **chỉ cập nhật khi SL mới > SL cũ**; nhỏ hơn hoặc bằng → **bỏ qua**. (Không cộng thật → bấm nhiều lần không nhân đôi.)
3. **Hiển thị:** badge "🛒 ĐX mua" màu khác (cam/teal) cạnh cột "SL Đề xuất", phân biệt với badge 🏭 ĐX SX của hàng có BOM. Bấm → mở tab Đề xuất.

## Vấn đề kỹ thuật cốt lõi

`recomputeProposals()` xóa **mọi** dòng DLK `trang_thai='Mới'` rồi sinh lại từ DKSX. Nếu dòng bán lẻ cũng là `'Mới'`, lần recompute kế tiếp (do gửi 1 thành phẩm BOM khác, hoặc hủy DKSX) sẽ **xóa mất** dòng bán lẻ.

→ Cần cột phân biệt nguồn để recompute chừa dòng bán lẻ.

## Thiết kế (Hướng A)

### 1. Migration SQL — `sql/setup_retail_proposals.sql`
```sql
ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'bom';  -- 'bom' (nổ BOM) | 'retail' (mua thẳng)
```
Dòng cũ `source=NULL` được coi như `'bom'` (NULL IS DISTINCT FROM 'retail' → vẫn bị recompute xóa như cũ, đúng ý).

### 2. `src/lib/dksxEngine.js`

**`recomputeProposals()`** — sửa chỗ gom `moiIds`:
- Chỉ thu các dòng `trang_thai==='Mới'` **mà `source !== 'retail'`** để xóa.
- Dòng sinh từ BOM gắn thêm `source: 'bom'` khi insert.

**Hàm mới `sendRetailProposals(items)`** với `items = [{item_code, item_name, unit, qty}]`:
- Bỏ qua item `qty <= 0`.
- Với mỗi item, tìm dòng DLK đang mở: `source='retail'` AND `item_code=...` AND `trang_thai='Mới'`.
  - **Có:** nếu `qty > actual_qty cũ` → update `actual_qty=qty`, `calculated_qty=qty`, `ngay_de_xuat=hôm nay`; ngược lại **bỏ qua** (đếm vào `skippedSmaller`).
  - **Chưa có:** tạo dòng mới `DLK-DDMMYY-NN` (tiếp nối seq trong ngày, dùng chung logic với recompute), `source='retail'`, `tien_do='Mới'`, `trang_thai='Mới'`, `calculated_qty=actual_qty=qty`.
  - Dòng đã `'Đã đặt mua'`/khác `'Mới'` → **không đụng**.
- Trả về `{ created, updated, skippedSmaller }`.

Tái dùng `makeDlkDate()` và logic đếm `seq` (`ilike 'DLK-...-%'`, lấy max suffix) — gom thành helper nội bộ để recompute và sendRetail dùng chung, tránh lặp.

### 3. `src/pages/kho/StockSummaryTab.jsx`

**`handleSendProposal`** — tách `selected` thành 3 nhóm (sau khi `loadBomMap`):
- **Có BOM** (`parents.has(code)`) → DKSX upsert MAX (như hiện tại).
- **Không BOM + `avg_daily > 0`** → gom vào `retailList` `{item_code, item_name, unit, qty}`.
- **Không BOM + `avg_daily <= 0`** → `skipped` (cảnh báo như cũ: không phải hàng bán / không có nhu cầu).

Sau vòng lặp:
- Nếu có thành phẩm BOM → `recomputeProposals()` (như cũ).
- Nếu `retailList` không rỗng → `sendRetailProposals(retailList)`.
- Thông báo gộp: số thành phẩm sang DKSX, số mã bán lẻ tạo/cập nhật, số bỏ qua (BOM-less không bán + retail nhỏ hơn cũ).
- `fetchProposed()` + thêm `fetchRetailProposed()` để refresh badge.

**Badge bán lẻ:**
- Thêm state `retailProposedMap` + `fetchRetailProposed()`: query `purchase_proposals` `select('item_code, actual_qty')` where `source='retail'` and `trang_thai='Mới'` → `{item_code: actual_qty}`.
- Ở cột `dlk_status` (đã nằm ngay sau cột `de_xuat_sl`): ưu tiên hiện 🏭 ĐX SX (DKSX) nếu có; else nếu `retailProposedMap[code] > 0` → badge **🛒 ĐX mua: N** màu cam (`#ea580c` / nền `#fff7ed` / viền `#fed7aa`), bấm → `navigateTo('de-xuat-dat-hang')` (tab Đề xuất).

## Phạm vi KHÔNG làm (YAGNI)
- Không sửa luồng nhập kho / DLK tracker ở `OrderProposalTab` (dòng `source='retail'` hiển thị & nhập kho giống mọi DLK khác — `OrderProposalTab` không lọc theo `source`).
- Không đổi định nghĩa "demand"/công thức replenish.
- Không xử lý mã vừa-là-linh-kiện-vừa-bán-lẻ (đã chốt tiêu chí đơn giản: chỉ cần không BOM + có xuất bán).

## Kiểm thử
- Migration chạy không lỗi; cột `source` mặc định `'bom'`.
- Gửi đề xuất 1 mã không-BOM có xuất bán → xuất hiện 1 dòng DLK `source='retail'` ở tab Đề xuất + badge 🛒 ở Tồn HH.
- Gửi lại cùng mã với SL lớn hơn → dòng cập nhật lên số mới; SL nhỏ hơn → giữ nguyên, báo "bỏ qua".
- Gửi 1 thành phẩm BOM (trigger recompute) → dòng bán lẻ `source='retail'` **không bị xóa**.
- Mã không-BOM không xuất bán → vẫn bị bỏ qua + cảnh báo.
