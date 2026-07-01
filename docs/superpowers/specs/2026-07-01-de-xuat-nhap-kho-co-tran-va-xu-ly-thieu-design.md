# Đề xuất mua: hiển thị 2 số lượng + Nhập kho có trần + Xử lý khi về thiếu

**Ngày:** 2026-07-01
**Trạng thái:** Đã chốt thiết kế với user, chờ duyệt spec trước khi lập kế hoạch.
**Liên quan:** [[qlsx-dlk-system]], [[qlsx-order-proposal-design]], [[qlsx-netlify-deploy]]

---

## 1. Bối cảnh & mục tiêu

Trong module Kho, mã linh kiện có đề xuất mua đang mở (`purchase_proposals`, `trang_thai='Mới'`)
hiện badge **"🛒 ĐX mua: N"** trên tab **Tồn HH** (`StockSummaryTab`), kèm tiến độ và nút **Nhập kho**
(nút đã khóa, chỉ bấm được khi `tien_do='Đã về kho'`). Chi tiết đề xuất nằm ở tab
**Đề xuất đặt hàng (DLK)** (`OrderProposalTab`). Nhập kho thực hiện ở `ImportStockTab`.

User muốn 3 việc:

1. **Hiển thị cả 2 số:** số lượng **đề xuất** (`calculated_qty`) và số lượng **đặt mua thực tế**
   (`actual_qty`) — hiện badge chỉ hiện 1 số.
2. **Trần nhập kho:** khi hàng đã về kho, bấm Nhập kho chỉ được nhập **tối đa = số đã đặt − số đã nhận**.
3. **Xử lý sau nhập:** nhập xong → cập nhật tồn (đã có) → bật **modal 2 lựa chọn** cho đề xuất:
   - **LC1 — Giữ đề xuất, cập nhật còn lại:** VD đề xuất 1000, nhập 500 → hiện "còn 500/1000",
     DLK vẫn mở để nhận tiếp.
   - **LC2 — Đóng hẳn đề xuất (hoàn thành dù thiếu):** xóa dòng khỏi tab Đề xuất (có **lưu trữ**
     để truy xuất), phần thiếu được **tạo đề xuất mới**.

### Quyết định đã chốt với user (2026-07-01)

| # | Vấn đề | Chốt |
|---|--------|------|
| Q1 | Cơ sở tính trần nhập kho | **Trần = `actual_qty` (đặt) − đã nhận.** Không thêm cột "số thực về". |
| Q2 | Nơi hiện 2 lựa chọn | **Modal bật ngay sau khi lưu phiếu nhập.** |
| Q3 | Gốc tính "còn lại" & phần thiếu | **Theo `calculated_qty` (đề xuất gốc).** |
| F  | Cách option 2 tương tác engine DKSX | **Cách A — dòng phần thiếu "ghim" (`source='shortfall'`).** An toàn (không âm thầm mất) + chính xác (engine coi là committed nên không tạo trùng). |

---

## 2. Hiện trạng code (nguồn sự thật, đã rà 2026-07-01)

### 2.1. Bảng `purchase_proposals` (cột chính)
`id` (UUID), `item_code`, `item_name`, `unit`, `dlk_code` (unique),
`calculated_qty` (SL đề xuất = `bom_qty` + `retail_qty`), `actual_qty` (SL đặt thực tế),
`bom_qty`, `retail_qty`, `tien_do` (`Mới`/`Chờ duyệt`/`Đã đặt`/`Đang vận chuyển`/`Đã về kho`),
`trang_thai` (`Mới`/`Đã đặt mua`/`Đã về kho đủ`/`Đã về kho thiếu`/`Hủy`),
`source` (`bom`/`retail`/`both`), `note`, `batch_id`, `ngay_de_xuat`, `ngay_du_kien`, `created_at`.

### 2.2. "Đã nhận" là số tính realtime, không lưu
`received = SUM(du_lieu_nhap.so_luong_nhap WHERE dlk_code = X)`.
- `OrderProposalTab.fetchProposals` (dòng ~70–95): gom `nhapMap[dlk_code]`, rồi tính `auto_trang_thai`:
  `received ≥ actual_qty && received>0` → `Đã về kho đủ`; `0<received<actual_qty` → `Đã về kho thiếu`.
- `du_lieu_nhap` chỉ tham chiếu `dlk_code` bằng TEXT (không FK) → xóa dòng proposal **không** ảnh hưởng
  lịch sử nhập.

### 2.3. Badge Tồn HH
`StockSummaryTab.fetchPurchaseProposed` (~199–214): query `purchase_proposals`
`trang_thai='Mới' AND actual_qty>0`, gom `map[item_code].qty += actual_qty`.
Badge render ~508–520: `🛒 ĐX mua: {buyInfo.qty}`. Nút Nhập kho ~529–531 →
`handleReceiveStock(row)` (~258): `navigateTo('nhap-kho', {dlk:{dlk_code, item_code, qty: info.qty, unit}})`,
`disabled={!arrived}`.

### 2.4. Nhập kho
`ImportStockTab.executeImport` (~384–531): gom theo `(item_code, location)`, update/insert `inventory_stock`,
insert `inventory_picking_logs`, insert `du_lieu_nhap` (kèm `dlk_code` khi `ly_do='Nhập mua vào'`).
**Không** đụng `purchase_proposals`. Ô nhập `import_qty` mỗi vị trí (~597–603) chưa có trần.
Prefill DLK: `useEffect` (~163–173) + `buildDlkItem` (~153–160) — hiện set `import_qty = actual_qty`.
Load DLK mở: `.not('trang_thai','in','("Đã về kho đủ","Hủy")')`.

### 2.5. Engine `recomputeProposals` (`src/lib/dksxEngine.js`)
- `committed[item_code] = Σ actual_qty` của dòng `trang_thai ∉ {Mới, Hủy}` (dòng 131–134).
- `openByCode[item_code]` = dòng `trang_thai='Mới'` (≤1/mã sau migration).
- `bomNeed = gross − stock − committed`; nếu >0 → cập nhật `openByCode` hoặc tạo mới;
  nếu dòng `'Mới'` hết bomNeed **và** `retail_qty=0` → **XÓA** (dòng 166–178).
- ⇒ Dòng `'Mới'` thường **do engine sở hữu** (bị ghi đè/xóa). Đây là lý do dòng phần thiếu phải "ghim".

---

## 3. Thiết kế chi tiết

### 3.1. Thay đổi CSDL — migration mới `sql/setup_proposal_shortfall_archive.sql`

**Bảng lưu trữ** `purchase_proposals_archive` (mirror + audit):
```sql
CREATE TABLE IF NOT EXISTS public.purchase_proposals_archive (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orig_id           UUID,                    -- id dòng gốc (tham chiếu mềm)
  item_code         TEXT,
  item_name         TEXT,
  unit              TEXT,
  dlk_code          TEXT,                    -- DLK gốc đã đóng
  calculated_qty    NUMERIC,
  actual_qty        NUMERIC,
  bom_qty           NUMERIC,
  retail_qty        NUMERIC,
  received_snapshot NUMERIC,                 -- đã nhận tại thời điểm đóng
  tien_do           TEXT,
  trang_thai        TEXT,
  source            TEXT,
  note              TEXT,
  ngay_de_xuat      DATE,
  ngay_du_kien      DATE,
  batch_id          UUID,
  created_at        TIMESTAMPTZ,             -- created_at gốc
  archived_at       TIMESTAMPTZ DEFAULT now(),
  archived_by       TEXT,
  archive_reason    TEXT,                    -- 'Đóng do về thiếu' | 'Đóng thủ công' | ...
  shortfall_dlk_code TEXT                    -- DLK mới tạo cho phần thiếu (nếu có)
);
CREATE INDEX IF NOT EXISTS idx_ppa_item_code ON purchase_proposals_archive(item_code);
CREATE INDEX IF NOT EXISTS idx_ppa_dlk_code  ON purchase_proposals_archive(dlk_code);
CREATE INDEX IF NOT EXISTS idx_ppa_archived_at ON purchase_proposals_archive(archived_at);
-- RLS mở như các bảng khác trong app (USING true) — theo quy ước hiện tại.
```

**Không thêm cột** vào `purchase_proposals`: dùng giá trị mới `source='shortfall'` (cột `source` sẵn có).

### 3.2. Sửa engine `recomputeProposals` (Cách A — "ghim" phần thiếu)

Chỉ đổi khối phân loại dòng DLK (dòng ~129–134). Quy tắc mới cho dòng **`source='shortfall'`**:

```js
(dlkAll || []).forEach(r => {
  if (r.trang_thai === 'Hủy') return;                 // bỏ
  if (r.source === 'shortfall') {                      // GHIM: coi như đã cam kết, engine không đụng
    committed[r.item_code] = (committed[r.item_code] || 0) + (Number(r.actual_qty) || 0);
    return;                                            // KHÔNG đưa vào openByCode → không bị update/xóa
  }
  if (r.trang_thai === 'Mới') openByCode[r.item_code] = r;
  else committed[r.item_code] = (committed[r.item_code] || 0) + (Number(r.actual_qty) || 0);
});
```

Hệ quả (đã kiểm chứng logic):
- Dòng phần thiếu vào `committed` → engine **không tạo trùng** cho cùng nhu cầu.
- Dòng phần thiếu **không** ở `openByCode` → engine **không ghi đè/không xóa** → ổn định qua mọi recompute.
- Khi nhu cầu tăng thật, phần dôi vẫn được engine tạo dòng riêng (không lẫn).
- Khi nhu cầu về 0, dòng phần thiếu vẫn còn (user chủ động Hủy nếu không cần) → **không âm thầm mất**.
- Ngoài trạng thái `'Mới'`, dòng phần thiếu hành xử y như dòng đã đặt bình thường (không bất nhất).

> ⚠️ Lưu ý: badge Tồn HH và `sendRetailProposals` lọc theo `trang_thai='Mới'`/`item_code`, **không** lọc theo
> `source`, nên dòng `source='shortfall'` vẫn hiện đúng ở Tồn HH và Đề xuất. `sendRetailProposals` chỉ ghi
> `retail_qty`, không đụng dòng shortfall (khác item hoặc cộng dồn retail — chấp nhận được; xem §5 ca biên).

### 3.3. Req 1 — Hiển thị 2 số lượng

**Tab Tồn HH (`StockSummaryTab`):**
- `fetchPurchaseProposed`: gom thêm `calculated` (Σ `calculated_qty`) và `received` (Σ theo `dlk_code`
  từ `du_lieu_nhap`) song song với `qty` (Σ `actual_qty`). *(Mã có thể có nhiều dòng proposal → vẫn gom theo `item_code`.)*
- Badge đổi thành 2 dòng gọn:
  - Dòng 1: `🛒 ĐX: {calculated} · Đặt: {actual}`
  - Dòng 2 (chỉ khi `received>0` hoặc đang mở): `Đã nhận {received} · Còn {max(0, calculated − received)}`
- Giữ nguyên logic khóa nút Nhập kho theo `tien_do='Đã về kho'`.

**Tab Đề xuất (`OrderProposalTab`):**
- Đã có cột `calculated_qty` (ĐX) và `actual_qty` (Đặt, ô sửa tay) và `received`. Thêm/đảm bảo cột hiển thị:
  **"Còn lại (ĐX)"** = `max(0, calculated_qty − received)`, và nhãn "Đã nhận" rõ ràng.
- Với dòng `source='shortfall'`: hiện nhãn nhỏ **"⤷ phần thiếu"** để phân biệt nguồn gốc.

### 3.4. Req 2 — Trần nhập kho (`ImportStockTab`)

- Khi build block từ DLK (prefill hoặc chọn DLK trong dropdown): tính
  `received = Σ du_lieu_nhap.so_luong_nhap WHERE dlk_code`, và **`capMax = max(0, actual_qty − received)`**.
  Lưu `capMax` trên item của block.
- **Prefill mặc định** `import_qty` = `capMax` (thay vì `actual_qty` thô), gom về vị trí đầu.
- **Hiển thị** cạnh dòng item: `Tối đa: {capMax}` (khi có DLK). Nếu `Σ import_qty` các vị trí của item vượt
  `capMax` → tô đỏ + hiện cảnh báo.
- **Chặn Lưu** trong `executeImport` (validate đầu hàm): nếu item gắn DLK mà `Σ import_qty > capMax` →
  `alert('Mã X: chỉ được nhập tối đa {capMax} (đã đặt {actual_qty} − đã nhận {received}).')` và dừng.
- Trần chỉ áp cho block **có `dlkCode`** (`ly_do='Nhập mua vào'`); nhập mới/thành phẩm/khác không đổi.

### 3.5. Req 3 — Modal sau khi lưu phiếu nhập

Sau khi `executeImport` ghi DB thành công, tính danh sách DLK vừa nhập có
`received_sau < calculated_qty` (còn thiếu so đề xuất). **Hiện 1 modal duy nhất liệt kê tất cả DLK thiếu**,
mỗi DLK là 1 dòng với 2 nút LC1/LC2 riêng; user xử lý từng dòng, xong dòng nào ẩn dòng đó; hết dòng → đóng
modal. Nội dung mỗi dòng:

```
Mã: {item_code} — {item_name}   (DLK-xxx)
Đề xuất: {calculated_qty}   Đặt: {actual_qty}   Đã nhận: {received_sau}   Còn thiếu (ĐX): {calculated_qty − received_sau}

[ Giữ đề xuất, còn {còn} / {calculated_qty} ]   [ Đóng đề xuất & tạo ĐX mới cho phần thiếu ]
```

**LC1 — Giữ đề xuất (không đổi cấu trúc):**
- Không thao tác DB cấu trúc. DLK vẫn mở; tab Đề xuất hiển thị `đã nhận / đề xuất` + phần còn thiếu.
- `auto_trang_thai` do tab tự tính theo `received` vs `actual_qty` (thiếu → `Đã về kho thiếu`; đủ số đặt →
  `Đã về kho đủ` dù vẫn thiếu so đề xuất — ca này nên chọn LC2, xem §5 ca biên #1). Dòng vẫn tính `committed`.
- Chỉ đóng dòng trong modal.

**LC2 — Đóng đề xuất & tạo mới cho phần thiếu (giao dịch 3 bước):**
1. **Archive:** insert 1 dòng vào `purchase_proposals_archive` từ dòng gốc + `received_snapshot=received_sau`,
   `archived_by=user`, `archive_reason='Đóng do về thiếu'`, `shortfall_dlk_code = <DLK mới>`.
2. **Xóa** dòng gốc khỏi `purchase_proposals` (`.delete().eq('id', orig_id)`).
   *(Lịch sử `du_lieu_nhap` giữ nguyên.)*
3. **Tạo dòng mới** phần thiếu:
   ```
   dlk_code   = DLK mới (nextDlkSeq)
   item_code, item_name, unit = như gốc
   calculated_qty = actual_qty = shortfall = max(0, calculated_qty_gốc − received_sau)
   bom_qty = shortfall, retail_qty = 0
   source = 'shortfall'
   tien_do = 'Mới', trang_thai = 'Mới'
   ngay_de_xuat = hôm nay
   note = 'Tách từ {DLK gốc} do về thiếu (đã nhận {received_sau}/{calculated_qty_gốc})'
   ```
   → nhờ §3.2, dòng này ổn định, không bị engine xóa/nhân đôi.

**Mặc định gợi ý trong modal:** nếu `received_sau ≥ actual_qty` (đơn đã nhận đủ số đặt nhưng vẫn thiếu so
đề xuất) → **highlight LC2** (đơn coi như xong, nên đóng & đặt lại phần thiếu). Ngược lại
(`received_sau < actual_qty`, đơn còn hàng về tiếp) → highlight LC1.

**Truy xuất lưu trữ:** thêm bộ lọc **"Đã lưu trữ"** ở `OrderProposalTab` (bên cạnh active/all/done) đọc
`purchase_proposals_archive` (chỉ đọc), hiển thị: DLK gốc, mã, ĐX/đặt/đã nhận, ngày đóng, người đóng, lý do,
DLK phần thiếu. Đủ để "truy xuất khi cần".

---

## 4. Luồng dữ liệu (end-to-end, ví dụ ĐX 1000 / nhận 500, chọn LC2)

```
Tồn HH: badge "ĐX: 1000 · Đặt: 1000"  → user đặt hàng → tien_do='Đã về kho'
  → bấm Nhập kho (mở ImportStockTab, prefill DLK, capMax = 1000 − 0 = 1000)
  → user nhập 500 (≤ capMax) → Lưu phiếu
     • inventory_stock += 500  (đã có)
     • du_lieu_nhap += {dlk_code, so_luong_nhap:500}  (đã có)
  → received_sau = 500 < calculated_qty 1000 → BẬT MODAL
     • Chọn LC2:
        - archive dòng gốc (received_snapshot=500, reason='Đóng do về thiếu', shortfall_dlk_code=DLK-mới)
        - delete dòng gốc
        - insert dòng mới: calculated_qty=500, source='shortfall', tien_do='Mới'
  → Lần recompute kế tiếp: committed(shortfall)=500; gross 1000 − stock 500 − 500 = 0 → không tạo trùng,
    dòng phần thiếu (500) được giữ nguyên.
```

---

## 5. Ca biên & cách xử lý

1. **`actual_qty < calculated_qty` (đặt ít hơn đề xuất), nhận đủ số đặt:**
   `received=actual_qty` → `auto_trang_thai='Đã về kho đủ'` nhưng vẫn thiếu so đề xuất → modal vẫn bật
   (điều kiện `received < calculated_qty`), highlight LC2. Đúng bản chất "đơn xong nhưng cần đặt thêm".
2. **Nhập nhiều lần trên cùng DLK (LC1):** mỗi lần nhập, `capMax` tự giảm theo `received` mới; modal chỉ bật
   khi vẫn còn thiếu so đề xuất. Khi `received ≥ calculated_qty` → không bật modal (coi như đủ).
3. **Nhiều lần "phần thiếu" cùng một mã:** có thể tồn tại >1 dòng `source='shortfall'` cùng `item_code`.
   Không vỡ (badge/tab gom theo `item_code`; engine loại shortfall khỏi `openByCode` nên bất biến "≤1 dòng
   'Mới'/mã" của engine không bị phá). **Tùy chọn tinh gọn (khuyến nghị làm):** khi tạo phần thiếu, nếu đã có
   dòng `source='shortfall'`+`trang_thai='Mới'` cùng `item_code` thì **cộng dồn** vào dòng đó thay vì tạo mới.
4. **Phiếu nhập nhiều DLK cùng lúc:** modal xử lý theo danh sách; mỗi DLK thiếu là 1 mục chọn LC1/LC2 độc lập.
5. **Nhập vượt trần do đua ghi (2 người):** trần tính từ `received` đọc lúc mở phiếu; validate lại `capMax`
   ngay trước khi ghi (`executeImport`) để giảm rủi ro. (Không giải quyết triệt để race — cùng nhóm nợ kỹ
   thuật ghi tồn phi nguyên tử ở [[qlsx-tech-debt]]; chấp nhận trong phạm vi này.)
6. **User bỏ qua modal (đóng không chọn):** mặc định = LC1 (giữ nguyên) — không mất dữ liệu, xử lý lại sau ở
   tab Đề xuất nếu cần. *(Không làm nút ở tab Đề xuất trong phạm vi này trừ khi user yêu cầu — Q2 chốt chỉ modal.)*

---

## 6. Kiểm thử (preview, theo [[qlsx-preview-verification]])

1. **Req 1:** mở Tồn HH — mã có ĐX≠Đặt hiện đúng cả 2 số + dòng "Đã nhận/Còn". Tab Đề xuất hiện cột "Còn lại (ĐX)".
2. **Req 2:** mở Nhập kho từ 1 DLK (ĐX/đặt 1000, đã nhận 0) → prefill 1000, gõ 1200 → chặn Lưu + báo trần.
   Gõ 500 → Lưu OK; mở lại → capMax còn 500.
3. **Req 3 – LC1:** sau nhập 500, chọn "Giữ" → tab Đề xuất dòng đó "đã nhận 500 / ĐX 1000", vẫn ở filter active.
4. **Req 3 – LC2:** chọn "Đóng & tạo mới" → dòng gốc biến mất khỏi Đề xuất; xuất hiện dòng mới ĐX 500
   `source='shortfall'`, note tách; filter "Đã lưu trữ" thấy bản ghi archive (received_snapshot=500).
5. **Chống trùng engine:** sau LC2, kích hoạt recompute (gửi 1 đề xuất khác / reload trigger) → **không** sinh
   thêm dòng 500 thứ hai cho mã đó; dòng phần thiếu **không** bị xóa.
6. **Ca biên #1:** đặt 800/ĐX 1000, nhận 800 → modal bật, highlight LC2.

---

## 7. Triển khai / deploy (bắt buộc theo [[qlsx-netlify-deploy]])

1. **Chạy migration `sql/setup_proposal_shortfall_archive.sql` trên Supabase TRƯỚC.**
2. `npm run build` → copy `dist/*` → `deploy-netlify/`.
3. User deploy bằng kéo-thả `deploy-netlify/`.

---

## 8. Ngoài phạm vi (YAGNI)

- Không thêm cột "số thực về kho" (Q1 chốt trần theo `actual_qty`).
- Không sửa cơ chế ghi tồn phi nguyên tử / race (nợ kỹ thuật riêng).
- Không thêm nút xử lý ở tab Đề xuất (Q2 chốt chỉ modal); có thể bổ sung sau nếu user cần.
- Không đổi công thức tính `calculated_qty`/`replenish` (đã chốt ở [[qlsx-order-proposal-design]]).
