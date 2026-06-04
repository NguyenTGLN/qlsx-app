# Đề xuất: Ngày cần về kho + Mức độ khẩn cấp + Gộp 1 dòng/1 mã DLK

**Ngày:** 2026-06-04
**Module:** Kho — tab Đề xuất (`OrderProposalTab`), engine đề xuất (`dksxEngine.js`), tab Tồn HH (`StockSummaryTab` — chỉnh nhỏ)

## Bối cảnh & Mục tiêu

Bảng Đề xuất (`purchase_proposals`) hiện liệt kê linh kiện cần mua nhưng **không cho biết khi nào hàng phải về**, nên không xếp được ưu tiên. Ngoài ra, một mã linh kiện có thể phát sinh nhu cầu từ **2 kênh**:
- **Sản xuất** (`source='bom'`): nổ BOM từ nhu cầu sản xuất (DKSX → `production_demand`). Recompute đã cộng dồn mọi thành phẩm dùng chung 1 linh kiện vào **một** dòng bom.
- **Bán lẻ** (`source='retail'`): mã không phải thành phẩm nhưng có xuất bán → mua thẳng.

Hiện 2 kênh tạo **2 bản ghi DB riêng** (cố ý, để recompute BOM không xoá dòng bán lẻ). Hệ quả: cùng 1 mã có thể hiện 2 dòng, 2 mã DLK.

**Mục tiêu (đã chốt với user):**
1. Mỗi linh kiện chỉ **1 dòng / 1 mã DLK**, số lượng đủ cho **cả** sản xuất + bán lẻ (kể cả nhiều thành phẩm dùng chung mã đó).
2. Thêm cột **"Ngày cần về kho"** (tự tính realtime, chỉ đọc).
3. Thêm cột **"Mức độ khẩn cấp"** (5 mức màu) theo số ngày còn lại đến ngày cần về kho.

## Quyết định đã chốt với user

- **Ngày cần về kho = ngày cạn kho (kiểu Tồn HH) gấp nhất giữa 2 kênh, LÙI 5 ngày.**
- Linh kiện dùng cho sản xuất: lấy **ngày cạn kho của thành phẩm (có xuất bán) cạn SỚM NHẤT** trong số các thành phẩm mà BOM của chúng chứa linh kiện đó (nổ BOM ngược, đa cấp).
- Nếu mã vừa là linh kiện SX vừa có bán lẻ → so 2 ngày, lấy ngày **sớm hơn** (gấp hơn).
- Không xác định được (không thuộc thành phẩm có bán & bản thân không xuất bán) → hiển thị "—", khẩn cấp = "—".
- **Gộp dòng:** tách `bom_qty` + `retail_qty` trong **cùng một bản ghi** (cần migration). `calculated_qty = bom_qty + retail_qty`.
- **5 mức khẩn cấp** theo `số ngày còn lại = ngày cần về kho − hôm nay`:
  | Ngày còn lại | Mức | Màu (đề xuất) |
  |---|---|---|
  | `< 7` (gồm âm = quá hạn) | 🔴 Cực gấp / Quá hạn | đỏ `#dc2626` |
  | `7 – <15` | 🟠 Gấp | cam `#ea580c` |
  | `15 – <30` | 🟡 Cảnh báo | vàng `#ca8a04` |
  | `30 – <45` | 🔵 Theo dõi | lam `#2563eb` |
  | `≥ 45` | 🟢 Thư thả | lá `#16a34a` |

## Thiết kế

### Phần A — Gộp 1 dòng/1 mã DLK (split quantity)

#### A1. Migration SQL — `sql/setup_proposal_split_qty.sql`
```sql
ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS bom_qty    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retail_qty numeric NOT NULL DEFAULT 0;

-- Backfill: phân bổ calculated_qty cũ về đúng kênh theo source
UPDATE public.purchase_proposals
  SET bom_qty = COALESCE(calculated_qty,0)
  WHERE COALESCE(source,'bom') <> 'retail' AND bom_qty = 0;
UPDATE public.purchase_proposals
  SET retail_qty = COALESCE(calculated_qty,0)
  WHERE source = 'retail' AND retail_qty = 0;
```

#### A2. Gộp một lần các dòng 'Mới' trùng mã (trong cùng migration)
Chỉ gộp các dòng **trang_thai='Mới'** trùng `item_code` (dòng đã `'Đã đặt mua'`/khác 'Mới' KHÔNG gộp — đã có lịch sử đặt riêng):
- Giữ 1 dòng đại diện (DLK nhỏ nhất theo `dlk_code`).
- `bom_qty = SUM(bom_qty)`, `retail_qty = SUM(retail_qty)` của nhóm; `calculated_qty = actual_qty = bom_qty + retail_qty`.
- `source` = `'both'` nếu cả hai > 0, ngược lại `'bom'`/`'retail'`.
- Xoá các dòng dư trong nhóm.

Viết bằng `DO $$ ... $$` (gom theo item_code, keeper = min dlk_code).

#### A3. `dksxEngine.recomputeProposals()` — đổi từ "xoá & tạo lại" sang "upsert theo item_code, chỉ đụng `bom_qty`"
- Tính `needMap` (net bom need / linh kiện) **như cũ**: `gross(nổ BOM toàn DKSX) − stock − committed`. `committed` = tổng `actual_qty` các dòng khác 'Mới'/'Hủy' (gộp cả 2 kênh — giữ nguyên ý nghĩa).
- Lấy các dòng `'Mới'` (sau A2 đảm bảo ≤1 dòng/mã), lập map theo `item_code`.
- Với mỗi linh kiện có `bom_need > 0`:
  - Có dòng 'Mới': `update bom_qty = bom_need`, `calculated_qty = bom_need + retail_qty`, `actual_qty = calculated_qty`, `source = retail_qty>0 ? 'both' : 'bom'`. **Không đụng `retail_qty`, giữ `dlk_code`.**
  - Chưa có: insert dòng mới (DLK mới) `bom_qty=bom_need, retail_qty=0, calculated_qty=actual_qty=bom_need, source='bom'`.
- Với dòng 'Mới' mà `bom_need` về 0:
  - `retail_qty > 0` → `bom_qty=0, calculated_qty=actual_qty=retail_qty, source='retail'` (GIỮ dòng).
  - `retail_qty = 0` → xoá dòng.
- Bỏ điều kiện cũ `if (r.source==='retail') return` (không còn dòng retail tách rời); thay bằng upsert theo item_code ở trên.

> Lưu ý regression: sửa tay `actual_qty` trên dòng 'Mới' vẫn bị recompute ghi đè — **giống hành vi hiện tại** (đang xoá & tạo lại), không phải lỗi mới.

#### A4. `dksxEngine.sendRetailProposals(items)` — chỉ đụng `retail_qty` trên cùng dòng item_code
- Tìm dòng `'Mới'` theo `item_code` (bỏ filter `source='retail'`; giờ 1 dòng/mã mọi nguồn).
- Có dòng: quy tắc **MAX** trên kênh bán lẻ → `newRetail = max(retail_qty_cũ, qty)`; nếu tăng thì `update retail_qty=newRetail, calculated_qty=bom_qty+newRetail, actual_qty=calculated_qty, source=bom_qty>0?'both':'retail'`; không tăng → đếm `skippedSmaller`.
- Chưa có dòng: insert `retail_qty=qty, bom_qty=0, calculated_qty=actual_qty=qty, source='retail'`.
- Trả về `{created, updated, skippedSmaller}` (như cũ).

#### A5. `StockSummaryTab.fetchRetailProposed()` — đọc theo `retail_qty` thay vì `source`
Đổi query: `select('item_code, retail_qty').gt('retail_qty',0).eq('trang_thai','Mới')`, cộng dồn `retail_qty`. (Vì `source` giờ có thể là `'both'`.)

### Phần B — Tính "Ngày cần về kho" + "Mức độ khẩn cấp"

#### B1. Helper mới `dksxEngine.computeNeededDates()` → `{ [item_code]: { neededTs, daysLeft } }`
- Tải song song: `loadComponentStock()` (tồn theo mã), `loadBomMap()`, `sales_90d_summary`.
- `avgDaily(X) = total_sales(X) / 90`. (Khớp Tồn HH.)
- `runoutDays(X) = floor(stock(X) / avgDaily(X))` khi `avgDaily(X) > 0`; `runoutTs(X) = hôm nay + runoutDays` (mốc ngày, bỏ giờ).
- **Kênh bán lẻ:** `retailRunout(C) = runoutTs(C)` nếu C có `avgDaily>0`.
- **Kênh sản xuất (nổ BOM ngược):** với mỗi `parent P` trong bomMap có `avgDaily(P)>0`, `explodeBom(bomMap, P, 1)` → tập lá; gán `runoutTs(P)` cho từng lá; `prodRunout(C) = min runoutTs(P)` qua các P chứa C.
- `neededRunout(C) = min(retailRunout(C), prodRunout(C))` (bỏ giá trị thiếu); nếu cả hai thiếu → không có entry.
- `neededTs(C) = neededRunout(C) − 5 ngày`; `daysLeft(C) = round((neededTs − hôm nay)/ngày)`.
- Trả map chỉ gồm mã có `neededTs`.

> Hiệu năng: vài trăm parent có bán × explode rẻ; chạy 1 lần khi mở tab. Chấp nhận được (tab đã có nhiều fetch).

#### B2. `OrderProposalTab` — hiển thị 2 cột mới
- Trong `fetchProposals`: sau khi có `proposals`, gọi `computeNeededDates()`, merge vào mỗi row: `needed_ts`, `days_left`.
- Định dạng ngày: `neededTs.toLocaleDateString('vi-VN')`; nếu không có → "—".
- Cấu hình màu khẩn cấp (5 mức) như bảng ở trên; hàm `urgencyOf(daysLeft)` trả `{label,bg,color,border}`; `daysLeft===null → {label:'—', xám}`; `daysLeft<0 → label "Quá hạn"` (vẫn nhóm đỏ).
- Thêm 2 `<th>` "Ngày cần về" + "Khẩn cấp" (đặt cạnh "Dự kiến về"/"Đã nhập" — vị trí cụ thể chốt khi code). Cập nhật `colSpan` ô rỗng.
- (Tùy chọn nhỏ) tooltip trên SL ĐX hiển thị tách kênh: `SX: {bom_qty} · Bán lẻ: {retail_qty}`.
- (Tùy chọn) cho sắp xếp theo `days_left` (gấp lên đầu) — để sau nếu user muốn.

### Phần C — Không làm (YAGNI)
- Không lưu `needed_date`/`urgency` vào DB (phụ thuộc tồn & bán đổi mỗi ngày → tính realtime).
- Không trừ lead_time vào ngày cần về (đã chốt: lùi cố định 5 ngày).
- Không gộp dòng đã `'Đã đặt mua'` với dòng 'Mới' (khác vòng đời).
- Không đổi luồng Nhập kho / DLK tracker (vẫn theo `dlk_code` từng dòng — giờ mỗi mã 1 DLK nên tự nhất quán).

## Phạm vi file
- `sql/setup_proposal_split_qty.sql` (mới)
- `src/lib/dksxEngine.js` (recompute, sendRetail, computeNeededDates)
- `src/pages/kho/OrderProposalTab.jsx` (2 cột mới)
- `src/pages/kho/StockSummaryTab.jsx` (fetchRetailProposed: đọc retail_qty)

## Kiểm thử
1. **Migration**: chạy không lỗi; cột `bom_qty/retail_qty` có; backfill đúng; các dòng 'Mới' trùng mã gộp còn 1 dòng/mã, tổng SL = tổng cũ.
2. **Recompute giữ bán lẻ**: tạo dòng bán lẻ (retail_qty>0) → gửi 1 thành phẩm BOM (recompute) → dòng vẫn còn, `bom_qty` cập nhật, `retail_qty` nguyên, `calculated_qty = tổng`.
3. **Gộp 1 mã/1 DLK**: mã vừa là linh kiện SX vừa bán lẻ → đúng 1 dòng, SL = SX+lẻ.
4. **Nhiều thành phẩm chung linh kiện**: gửi 2 thành phẩm cùng dùng 1 linh kiện → 1 dòng, `bom_qty` = tổng nhu cầu.
5. **Ngày cần về (bán lẻ)**: mã có xuất bán → ngày = cạn kho − 5; khớp tay.
6. **Ngày cần về (sản xuất)**: linh kiện thuộc 2 thành phẩm, lấy thành phẩm cạn sớm hơn − 5.
7. **Gấp hơn**: mã có cả 2 kênh → lấy ngày sớm hơn.
8. **5 mức màu** đúng ngưỡng (<7/7-15/15-30/30-45/≥45) + "Quá hạn" khi âm; mã không có ngày → "—".
9. Tồn HH badge 🛒 ĐX mua vẫn hiện đúng (đọc retail_qty).
