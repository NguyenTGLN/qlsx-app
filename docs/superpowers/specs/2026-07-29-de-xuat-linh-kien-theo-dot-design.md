# Đề xuất linh kiện theo đợt — tính tươi, nổ BOM trừ tồn từng cấp

**Ngày:** 2026-07-29
**Trạng thái:** Đã chốt thiết kế với user (3/3 phần), chờ duyệt spec trước khi lập kế hoạch.
**Liên quan:** [[qlsx-dlk-system]], `2026-07-01-de-xuat-nhap-kho-co-tran-va-xu-ly-thieu-design.md`

---

## 1. Bối cảnh

### 1.1. Việc đã xử lý xong trước khi có spec này

Ngày 29/07/2026 phát hiện `bom_items` có **3 dòng khai ngược chiều** — linh kiện nhỏ được khai
là "chứa" nguyên một máy lọc nước nóng lạnh:

| Mã cha (linh kiện) | Mã con | SL |
|---|---|---:|
| `WASHER-LT` (Long đen phẳng M6*16*1) | `WT-028S-RO` | 4 |
| `V-FR-300` (Van thải 300) | `WT-028S-RO` | 1 |
| `E-V-SV-D-LM` (Van từ nhập khẩu lắp máy) | `WT-028S-RO` | 1 |

Hậu quả: app nổ BOM cho **18.705 máy WT-028S-RO** trong khi nhu cầu thật là 475. Tổng SL đề xuất
phồng lên 2.327.906. Đã xoá 3 dòng (xem `sql/fix_bom_dao_chieu_20260729.sql`), tổng còn 170.320.

**Việc đó không phải phạm vi spec này.** Nhưng nó lộ ra 3 điểm yếu thật của luồng đề xuất, và
đó mới là thứ spec này giải quyết.

### 1.2. Ba điểm yếu của luồng hiện tại

**(a) Nổ BOM bỏ qua tồn kho cấp giữa.** `explodeBom` đi một mạch từ thành phẩm xuống linh kiện lá.
Kho đang có 959 lõi `F-OCB10` và 868 lõi `F-CTO10` đã thành phẩm, app vẫn đòi mua đủ tem và
lõi thô để làm lại từ đầu.

**(b) Nhu cầu SX không bao giờ tự hạ.** `production_demand` chỉ nâng (quy tắc MAX ở
`StockSummaryTab.jsx:308`), chỉ giảm khi lập phiếu SX. Số chốt ngày 03/06 nằm ì gần 2 tháng,
cao gấp 2–4 lần con số tính lại theo tồn và doanh số hiện tại:

| Thành phẩm | DKSX | Tính lại 29/07 | Chênh |
|---|---:|---:|---:|
| F-CB-BNC | 2.021 | 704 | 2,9× |
| PREF-1-10 | 1.056 | 258 | 4,1× |
| FK-HYDRO11 | 977 | 420 | 2,3× |

**(c) Bảng đề xuất là bảng sống, bị ghi đè liên tục.** `recomputeProposals` viết đè mọi dòng
`trang_thai='Mới'`. Không có khái niệm "đợt đề xuất đã chốt". Thêm nữa, cơ chế bảo vệ dòng đã
cam kết đọc cột `trang_thai`, nhưng dropdown "Tiến độ" trên giao diện lại ghi vào cột `tien_do`
— nên 150/150 dòng đều mang `trang_thai='Mới'`, kể cả 11 dòng hiện "Đã đặt". Lời hứa ở comment
`DKSXTab.jsx:82` ("các DLK đã đặt mua vẫn giữ nguyên") **hiện không được thực hiện**.

Ngoài ra không có nút "Tính lại đề xuất". Muốn tính lại phải sang tab Tồn HH giả vờ gửi đề xuất
một thành phẩm — và ngày 29/07 thao tác này đã vô tình nâng nhu cầu ECO-100RO từ 259 lên 300.

---

## 2. Quyết định đã chốt với user (2026-07-29)

| # | Vấn đề | Chốt |
|---|---|---|
| Q1 | Công thức tồn an toàn | `TB bán/ngày × (lead_time_days × 2 + backup_stock_days)` — **đảo hệ số** so với hiện tại (`lead + backup×2`) |
| Q2 | Nguồn "thời gian an toàn" | Cột `backup_stock_days`, khai theo từng mã như hiện nay |
| Q3 | Lọc mã được đề xuất | Chỉ mã có bán trong 90 ngày. **Đã có sẵn**: `sales_90d_summary` lọc `type IN ('XB','XDG')`, tự loại `XBS` (xuất sản xuất) và `KHAC` (chuyển kho, gia công, test…) |
| Q4 | Vai trò DKSX | **Tính tươi mỗi lần chạy.** Không còn giữ số cũ |
| Q5 | Nổ BOM có trừ tồn cấp giữa | **Có** — netting đa cấp theo thứ tự tô-pô |
| Q6 | Sau khi Gửi có sửa số không | **Khoá `calculated_qty`, mở `actual_qty`.** Phần trừ ở đợt sau tính theo `actual_qty` |
| Q7 | Chạy lại khi đang có nháp | **Ghi đè nháp cũ**, hỏi xác nhận trước |
| Q8 | 138 dòng đề xuất hiện có | **Lưu trữ hết rồi đóng**, chạy đợt 1 sạch bằng công thức mới |
| Q9 | Mức độ thay đổi | **Hướng A — mở rộng tại chỗ.** Giữ `purchase_proposals`, thêm `proposal_batches` |

---

## 3. Hiện trạng code (đã rà 2026-07-29)

| Tệp | Vai trò hiện tại |
|---|---|
| `src/lib/dksxEngine.js` | `explodeBom`, `loadBomMap`, `loadComponentStock`, `recomputeProposals`, `sendRetailProposals`, `computeNeededDates` |
| `src/lib/proposalQty.js` | Hàm thuần: `computeCap`, `computeShortfall`, `classifyProposalRows`, `buildShortfallProposalRow`, `buildArchiveRow` |
| `src/lib/proposalQty.test.js` | Bộ test sẵn có — bám vào đây để viết test đỏ |
| `src/pages/kho/OrderProposalTab.jsx` | Bảng đề xuất, sửa SL Đặt, modal lưu trữ |
| `src/pages/kho/StockSummaryTab.jsx` | Tồn HH, tính `replenish_qty`, nút "Gửi đề xuất" |
| `src/pages/kho/DKSXTab.jsx` | Danh sách nhu cầu SX, nút "Làm phiếu SX" |
| `src/pages/kho/ImportStockTab.jsx` | Nhập kho theo `dlk_code`, trần nhập, xử lý về thiếu (LC1/LC2) |
| `src/pages/kho/ProductionOrderTab.jsx` | Lập phiếu SX; dòng 1292–1304 trừ `production_demand` |

`recomputeProposals()` chỉ được gọi từ 2 nơi: `DKSXTab.handleCancel` và
`StockSummaryTab.handleSendProposal` (khi `upserts > 0`).

Cột `batch_id` đã tồn tại trên `purchase_proposals` nhưng **chưa từng được dùng** — mặc định
`gen_random_uuid()` cho từng dòng nên 138 dòng ra 138 "đợt". Dùng lại được.

---

## 4. Thuật toán

### 4.1. Nhu cầu gốc

**Gốc là `sales_90d_summary` — dữ liệu bán 90 ngày gần nhất. KHÔNG phải bảng tồn kho.**

Lý do (user chốt 29/07/2026): theo quy trình, mã nào tồn về 0 thì **bị xoá dòng khỏi tồn
sổ sách, tồn vị trí và tồn hàng hoá cho gọn bảng**. Dữ liệu bán 90 ngày thì vẫn còn.
Nên nếu đi từ bảng tồn kho, đúng những mã đã bán sạch — thứ cần đặt gấp nhất — lại là
thứ biến mất khỏi danh sách.

Đo thật: 19 mã có bán trong 90 ngày không còn dòng tồn kho nào, nặng nhất `FK-RO50`
(Màng RO50 liền) bán 165 cái/90 ngày, đã từng nhập kho 7 lần, khai lead 70 ngày và an
toàn 30 ngày — đủ tham số, chỉ là không ai nhìn thấy nó.

```
Danh sách gốc  = mọi mã trong sales_90d_summary có total_sales > 0
Tham số        = lead_time_days, backup_stock_days từ inventory_items
Tồn kho        = LEFT JOIN inventory_stock, không có dòng ⇒ tồn = 0
```

Tác động đo được: 100 → **112 dòng**, 30.752 → **31.441 đơn vị**.

RPC `get_stock_summary` **giữ nguyên** — nó vẫn phục vụ tab Tồn HH như cũ, không đụng tới.
Engine tự dựng danh sách bằng truy vấn riêng.

Mã nguồn `src/lib/mrp.js` **không phải sửa**: `buildProposalLines` nhận `items` từ nơi
gọi truyền vào, nó không tự đi lấy dữ liệu. Chỉ nơi gọi ở giai đoạn 2 đổi nguồn.

```
TB bán/ngày  = total_sales_90d ÷ 90
Tồn an toàn  = round( TB bán/ngày × (lead_time_days × 2 + backup_stock_days) )
Cần bổ sung  = max(0, Tồn an toàn − Tổng tồn)
```

### 4.2. Nổ BOM có trừ tồn từng cấp

Thay thế `explodeBom`. Chạy **theo thứ tự tô-pô, cha trước con** — nhờ vậy khi tới lượt một mã
thì nhu cầu từ mọi cha đã cộng đủ vào `gross`, và tồn kho chỉ bị tiêu **một lần duy nhất**.

```
gross[mã] = 0 với mọi mã
Nạp nhu cầu gốc:  gross[thành phẩm] += cần_bổ_sung[thành phẩm]

Duyệt theo thứ tự tô-pô:
    sẵn_có  = tồn_kho[mã] + đang_về[mã]
    net[mã] = max(0, gross[mã] − sẵn_có)

    nếu mã CÓ BOM và net[mã] > 0:
        với mỗi con c:  gross[c] += net[mã] × định_mức(mã → c)

Kết quả cần mua = { mã : net[mã] } với mã KHÔNG có BOM
```

- `tồn_kho` = tổng `inventory_stock` theo mã, **gồm cả vị trí WIP `SX9-`** (giữ như hiện tại)
- `đang_về[mã]` = Σ(`actual_qty` − đã nhập) của các dòng `trang_thai='CHO_HANG'` ở đợt trước
- Mã **có BOM** ⇒ tự sản xuất, không bao giờ đưa vào danh sách mua. Đã kiểm: chỉ 1 mã từng vi
  phạm quy tắc này (`FK-RO80`) và dòng đó đã tự biến mất sau lần tính lại 29/07

**Ví dụ thật** — F-CB-BNC cần bổ sung 458 bộ:

```
F-OCB10   gross 458 · tồn 959    →  net = 0   ⛔ DỪNG, không nổ xuống
             ├─ L-F-OCB10   → 0     (cách cũ đòi 458 tem)
             └─ OF-OCB10    → 0     (cách cũ đòi 458 lõi)
F-CTO10   gross 458 · tồn 868    →  net = 0   ⛔ DỪNG
F-PP10    gross 458 · tồn 0      →  net = 458  ✅ nổ tiếp
```

### 4.3. Vòng lặp BOM

Hàm cũ dùng `visited` để **âm thầm bỏ qua** khi gặp vòng lặp — chính kiểu che giấu này khiến
lỗi 3 dòng BOM đảo chiều sống được 2 tháng.

Hàm mới: xếp tô-pô không xong ⇒ **ném lỗi, chỉ rõ vòng lặp** (`A → B → C → A`), chặn không cho
chạy đề xuất cho tới khi dữ liệu được sửa.

---

## 5. Mô hình dữ liệu

### 5.1. Bảng mới `proposal_batches`

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | uuid PK, default `gen_random_uuid()` | |
| `ma_dot` | text UNIQUE NOT NULL | `DX-290726-01` |
| `ngay_chay` | date NOT NULL | |
| `trang_thai` | text NOT NULL default `'NHAP'` | `NHAP` · `DA_GUI` · `DONG` |
| `nguoi_tao` | text | ai bấm Chạy |
| `nguoi_gui` | text | ai bấm Gửi |
| `ngay_gui` | timestamptz | |
| `ngay_dong` | timestamptz | |
| `ghi_chu` | text | |
| `created_at` | timestamptz default `now()` | |

**Ràng buộc:** chỉ 1 đợt `NHAP` tại một thời điểm, ép ở tầng DB chứ không dựa vào giao diện:

```sql
create unique index proposal_batches_one_draft
  on proposal_batches (trang_thai) where trang_thai = 'NHAP';
```

### 5.2. Sửa `purchase_proposals`

`batch_id` trỏ về `proposal_batches(id)`, `on delete cascade`.

**Dọn lại ý nghĩa 2 cột đang lẫn lộn:**

| Cột | Trước | Sau |
|---|---|---|
| `trang_thai` | Lẫn lộn; engine dựa vào nhưng UI không ghi | **Trạng thái dòng do app đặt**: `CHO_HANG` · `DU` · `DONG_SOM` · `HUY` |
| `tien_do` | UI ghi vào, engine bỏ qua | **Thuần thông tin** cho phòng mua: Mới / Chờ duyệt / Đã đặt / Đang vận chuyển / Đã về kho. Không ảnh hưởng phép tính |

Phần trừ ở đợt sau đọc `trang_thai='CHO_HANG'` — cột do app đặt, không phải người gõ, nên không
thể lệch như hiện nay.

**Ba cột mới lưu vết tính toán:**

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `snapshot_gross` | numeric | tổng nhu cầu trước khi trừ, tại thời điểm chạy |
| `snapshot_ton` | numeric | tồn kho tại thời điểm chạy |
| `snapshot_dang_ve` | numeric | hàng đang về từ đợt trước |

```
calculated_qty = snapshot_gross − snapshot_ton − snapshot_dang_ve
```

Ba cột này cho phép tra ngược số ở đâu ra ngay trên màn hình, và chấm dứt cảnh cột "Tồn kho" là
số realtime còn "SL ĐX" là số đóng băng — hai số lệch thời điểm nên trừ không khớp nhau.

`bom_qty` / `retail_qty` giữ lại làm phần diễn giải, lấy **trước** khi netting:

```
retail_qty = cần_bổ_sung[mã]              — nhu cầu bán trực tiếp của chính mã đó
bom_qty    = gross[mã] − cần_bổ_sung[mã]  — phần do cha kéo xuống
snapshot_gross = gross[mã] = bom_qty + retail_qty
```

Mã linh kiện thuần (không bán trực tiếp) sẽ có `retail_qty = 0`.

`dlk_code` giữ nguyên định dạng `DLK-DDMMYY-NN` để luồng nhập kho không phải sửa.

### 5.3. Bảo mật

Bảng mới cấp `for all to authenticated`. **Tuyệt đối không** `to public`. Trước khi bàn giao phải
đo lại bằng chính khoá công khai `sb_publishable_...`: đọc phải trả 0 dòng, sửa/xoá trên dòng có
thật phải trả `[]`, thêm phải bị RLS từ chối.

---

## 6. Vòng đời

```
[Chạy đề xuất]
      ↓
   NHÁP ──[Chạy lại]──> hỏi xác nhận, ghi đè
      │
      ├─ sửa actual_qty · xoá dòng không cần
      ├─ [Huỷ nháp] ──> xoá sạch
      └─ [Gửi] ──> ĐÃ GỬI   (khoá calculated_qty vĩnh viễn)
                      │
                      ├─ Σ nhập ≥ actual_qty ─────> dòng DU        (tự động)
                      ├─ Σ nhập < actual_qty, giữ ─> dòng CHO_HANG (còn lại tự tính)
                      ├─ Σ nhập < actual_qty, đóng > dòng DONG_SOM
                      └─ mọi dòng đã xong ────────> đợt tự chuyển ĐÓNG
```

Dòng `DONG_SOM` **không** bị trừ ở đợt sau, nên phần thiếu tự quay lại — đúng yêu cầu.

**"Chạy lại" giữ nguyên đợt:** xoá sạch dòng của đợt `NHAP` rồi tạo lại, `ma_dot` và `id` giữ
nguyên. Chỉ khi bấm Gửi (hoặc Huỷ nháp rồi Chạy mới) mới sinh mã đợt tiếp theo. Nhờ vậy không
đốt số thứ tự mỗi lần thử lại.

---

## 7. Giao diện

### 7.1. Nút "Chạy đề xuất" đặt trên tab Đề xuất

Chấm dứt việc phải sang Tồn HH giả vờ gửi một thành phẩm để kích hoạt tính lại.

### 7.2. Màn duyệt nháp

Đầu màn: `DX-290726-01 · chạy 29/07/2026 · N dòng` + `[Chạy lại] [Huỷ nháp] [Gửi đề xuất]`

| Mã LK | Nhu cầu | Tồn | Đang về | SL ĐX | SL Đặt | Ngày cần | |
|---|---:|---:|---:|---:|---:|---|---|
| Q-5044 | 24.859 | 3.438 | 0 | 21.421 | `21.421` | 12/08 🟠 | 🗑 |

Bấm vào dòng mở ra **nguồn nhu cầu**: thành phẩm nào kéo bao nhiêu (SL cần SX × định mức = tổng).
Chỉ `SL Đặt` sửa được; xoá được dòng không cần mua.

Cột "Ngày cần về" và mức khẩn cấp giữ nguyên logic `computeNeededDates` hiện có.

### 7.2b. ⚠️ RÀNG BUỘC SỐNG CÒN cho giai đoạn 3 (rà soát 29/07 xác nhận)

`OrderProposalTab.jsx:67` đọc `purchase_proposals` bằng `select('*')`, **không lọc theo
`batch_id` hay trạng thái đợt** — chỉ lọc client theo `auto_trang_thai`. Dòng đợt NHÁP mang
`trang_thai='CHO_HANG'`, không nằm trong danh sách loại trừ, nên **hiện ngay** trên màn hình
phòng mua đang dùng, lẫn vào 139 dòng thật, và còn nổi lên đầu vì `DX-...` > `DLK-...`.

⇒ **Trước khi gắn nút "Chạy đề xuất" vào màn thật, BẮT BUỘC sửa `OrderProposalTab` lọc theo
đợt** — chỉ hiện dòng của đợt `DA_GUI`/`DONG`, ẩn hẳn dòng `CHO_HANG` thuộc đợt `NHAP`. Nếu
không, chạy một đợt nháp là làm loạn danh sách phòng mua đang dùng hằng ngày.

Đây là lý do màn duyệt nháp (7.2) phải là **màn riêng**, không phải chính `OrderProposalTab`.

### 7.3. Màn đợt đã gửi

Giữ bảng hiện tại, thêm cột **Trạng thái dòng**. `SL ĐX` chuyển thành chữ thường không sửa được.
`Tiến độ` vẫn cho phòng mua chọn.

### 7.4. Màn danh sách đợt

Mở lại đợt cũ, thay cho nút "Lưu trữ" hiện nay.

### 7.5. Phân quyền

Dùng lại `perms` sẵn có của tab Đề xuất, không thêm quyền mới: `perms.create` cho Chạy và Gửi,
`perms.edit` cho sửa `actual_qty`, `perms.delete` cho xoá dòng và Huỷ nháp.

---

## 8. Nối nhập kho

`ImportStockTab` đã có luồng nhập theo `dlk_code`, trần nhập, và lựa chọn khi về thiếu. Chỉ sửa
phần kết:

```
Sau mỗi lần nhập:
   Σ nhập ≥ actual_qty  →  dòng = DU, tự đóng
   Σ nhập < actual_qty  →  hỏi:  [Giữ phiếu, còn lại N]  →  dòng = CHO_HANG
                                 [Đóng, coi như xong]    →  dòng = DONG_SOM
   Mọi dòng của đợt đã xong  →  đợt = DONG
```

`closeProposalWithShortfall` được dùng lại nhưng **bỏ phần tự tạo đề xuất phần thiếu**
(`buildShortfallProposalRow`, `source='shortfall'`) — vì đợt sau tự tính ra phần đó. Phần lưu
trữ (`buildArchiveRow`) giữ nguyên.

---

## 9. Đổi hành vi luồng đang chạy — user đã duyệt

| # | Thay đổi | Người dùng thấy gì |
|---|---|---|
| 1 | **Bỏ nút "Gửi đề xuất" ở tab Tồn HH** | Không còn tạo đề xuất từ Tồn HH. Tránh 2 đường chọi nhau, và bỏ đúng chỗ đã gây nhầm 259→300 ngày 29/07 |
| 2 | **Tab DKSX đọc số tính tươi** thay vì `production_demand` | Cột "SL cần SX" là số tính lại theo tồn và doanh số mới nhất. Nút "Làm phiếu SX" giữ nguyên |
| 3 | **`production_demand` giữ nguyên, chỉ ngừng dùng để tính** | Không ai thấy gì. `ProductionOrderTab` vẫn ghi vào đó như cũ — **không sửa dòng nào** trong tệp 1.400 dòng đó |

Điểm 3 là chủ ý: chạy ổn vài tuần rồi mới bàn chuyện dọn bảng.

---

## 10. Xử lý sai sót

| Tình huống | Hành vi |
|---|---|
| BOM có vòng lặp | Chặn chạy, chỉ rõ `A → B → C → A` |
| Mã thiếu `lead_time_days` hoặc `backup_stock_days` | Vẫn chạy, liệt kê danh sách mã thiếu tham số lên đầu màn |
| Đứt mạng giữa lúc chạy | Nháp dở vẫn ở `NHAP`, chạy lại ghi đè. Không có trạng thái lửng |
| Bấm Gửi | Một lệnh đổi trạng thái đợt duy nhất — nguyên tử |
| `bom_items` > 1000 dòng | Giữ phân trang như `loadBomMap` hiện tại (hiện 1.811 dòng) |

---

## 11. Kiểm chứng

### 11.1. Test đơn vị — engine (hàm thuần, không chạm DB)

| Ca | Kỳ vọng |
|---|---|
| Tồn cấp giữa đủ | Không nổ xuống cấp dưới |
| Tồn cấp giữa thiếu một phần | Chỉ nổ phần thiếu |
| Một mã là con của 2 cha khác nhau | Tồn chỉ trừ 1 lần |
| Có "đang về" ở đợt trước | Trừ đúng phần chưa nhận |
| BOM có vòng lặp | Ném lỗi, nêu đúng vòng lặp |
| Mã có bán nhưng không BOM | Vào thẳng danh sách mua |
| `lead_time`/`backup_stock` = 0 | Tồn an toàn = 0, không đề xuất, có cảnh báo |

### 11.2. Test vòng đời

- Gửi rồi thì `calculated_qty` không đổi được nữa
- Chạy đợt 2 khi đợt 1 còn `CHO_HANG` → trừ đúng phần chưa nhận
- Dòng `DONG_SOM` không bị trừ, phần thiếu quay lại ở đợt sau
- Nhập vượt `actual_qty` → dòng vẫn `DU`, không âm
- Không tạo được 2 đợt `NHAP` cùng lúc (unique index chặn)

### 11.3. Đo bảo mật trước khi bàn giao

Bằng khoá công khai lấy từ `src/lib/supabase.js`, trên **dòng có thật**:

- Đọc `proposal_batches` → 0 dòng
- Sửa/xoá dòng có thật với `Prefer: return=representation` → `[]`
- Thêm dòng → bị RLS từ chối
- Đối chiếu lại trong DB: không dòng nào bị đổi

### 11.4. Đối chiếu tay

Sau khi chạy đợt 1, đối chiếu ít nhất 3 mã bằng SQL độc lập với code — trong đó bắt buộc có 1 mã
đi qua bán thành phẩm có tồn (`F-OCB10` hoặc `F-CTO10`), để chứng minh netting hoạt động.

---

## 12. Chuyển đổi dữ liệu

1. Đẩy 138 dòng hiện có vào `purchase_proposals_archive` với
   `archive_reason = 'Chuyển sang luồng đề xuất theo đợt'`
2. Xoá khỏi `purchase_proposals`
3. Chạy đợt `DX-...-01` sạch bằng công thức mới
4. Lớp sao lưu thứ hai đã có: `bak_purchase_proposals_20260729` (150 dòng, RLS bật + REVOKE)

Mọi tệp SQL phải có phần **hoàn tác dán chạy được ngay** ở cuối.

---

## 12b. Chia giai đoạn triển khai

Mỗi giai đoạn phải chạy được và kiểm chứng được trước khi sang giai đoạn sau.

| GĐ | Nội dung | Kiểm chứng | Đụng dữ liệu thật? |
|---|---|---|---|
| 1 | Engine mới: công thức + netting đa cấp + phát hiện vòng lặp. Hàm thuần, chưa nối UI | Test đỏ trước, đối chiếu tay 3 mã | Không |
| 2 | Bảng `proposal_batches` + RLS + vòng đời NHAP→DA_GUI→DONG | Đo bảo mật bằng khoá công khai | Chỉ thêm bảng mới |
| 3 | Màn duyệt nháp + nút Chạy/Gửi/Huỷ + màn danh sách đợt | User duyệt thử 1 đợt nháp, chưa gửi | Không (nháp xoá được) |
| 4 | Nối nhập kho, đóng dòng, trừ đợt sau; lưu trữ và đóng 138 dòng cũ | Chạy 2 đợt liên tiếp, kiểm phần trừ | **Có** — bước duy nhất gây gián đoạn |

Giai đoạn 4 là bước duy nhất chạm dữ liệu đang dùng. Trước khi chạy phải sao lưu và có tệp hoàn tác.

---

## 13. Ngoài phạm vi

- Không sửa `ProductionOrderTab.jsx`
- Không xoá bảng `production_demand`
- Không đụng luồng bảo hành, KPI, chấm công
- Không đổi công thức "Ngày cần về kho" (`computeNeededDates`)
- Không xử lý mã có BOM nhưng thực tế mua ngoài (hiện không còn trường hợp nào)

---

## 13b. Bốn điểm phải chốt TRƯỚC khi giai đoạn 2 sửa bảng

Phát hiện trong lúc làm giai đoạn 1. Cả bốn đều đổi thứ được lưu xuống cơ sở dữ liệu,
nên phải quyết trước khi dựng bảng, không phải sau.

**1. ✅ ĐÃ CHỐT 29/07/2026 — engine lấy gốc từ `sales_90d_summary`, không từ bảng tồn kho.**

Vấn đề: RPC `get_stock_summary` dựng `FROM inventory_stock`, mà theo quy trình thì mã nào
tồn về 0 sẽ **bị xoá dòng khỏi tồn sổ sách / tồn vị trí / tồn hàng hoá cho gọn bảng**.
Nên 19 mã có bán trong 90 ngày không còn dòng tồn nào ⇒ engine không hề biết tới.

Quyết định: **giữ nguyên RPC** (tab Tồn HH không đổi gì), engine tự dựng danh sách gốc từ
`sales_90d_summary`, lấy tham số từ `inventory_items`, lấy tồn bằng LEFT JOIN — không có
dòng thì tồn = 0. Chi tiết ở mục 4.1. Tác động: 100 → 112 dòng, 30.752 → 31.441 đơn vị.

Còn lại phải xử lý ở giai đoạn 2: 15/19 mã đã khai đủ lead_time và thời gian an toàn, **4 mã
chưa khai** (`HM-KTM1`, `HM-KTM2`, `HM-KTM5`, `BHM-NAP-DE-BTH101T`) — chúng sẽ tự rơi vào
`missingParams` và hiện lên đầu màn hình để người dùng khai bổ sung. Đó là hành vi đúng,
không cần sửa mã.

Riêng 91 linh kiện trong BOM không có dòng tồn: đo trên kết quả thật, **0 dòng** bị tên rỗng,
vì các mã đó vẫn có trong `inventory_items`. Vẫn nên chốt chặn ở giai đoạn 2 để không lọt.

**2. `retail_qty` / `bom_qty` đụng ý nghĩa cũ.** Bảng `purchase_proposals` hiện dùng hai
cột này với nghĩa "số lượng mua". Engine mới dùng chúng với nghĩa "phần nhu cầu gộp
trước khi trừ tồn", và `retail_qty + bom_qty = snapshot_gross ≠ calculated_qty` — nên
trên màn hình hai phần sẽ **không cộng lại thành số đang đặt**. Hoặc đổi tên cột mới,
hoặc đổi cách tách.

**3. `missingParams` chưa đủ để người mua hàng xử lý.** Hiện chỉ là mảng mã. Ba thiếu sót:
mã bị réo **vẫn sinh ra dòng đề xuất trông bình thường** nhưng tính theo tham số đã bị
kẹp (lead −5 cạnh an toàn 30 cho ra 30 ngày thay vì 40, dòng thấp ~25% mà nhìn không
ra); mảng chứa mã **thành phẩm** trong khi `lines` chứa mã **linh kiện** nên khó nối
cảnh báo với dòng nào; và mã lặp trong `items` bị đẩy hai lần. Nên trả
`{item_code, lead_time_days, backup_stock_days, lý_do}` và cân nhắc đánh dấu luôn các
dòng dẫn xuất từ tham số hỏng.

**4. Phép trừ hiển thị phải làm tròn.** `snapshot_gross − snapshot_ton − snapshot_dang_ve`
bằng float có thể lệch chữ số cuối (838,8 − 374 = 464,79999999999995 trong khi
`calculated_qty` = 464,8). Đo trên lô 154 dòng dạng thật: **3,2% số dòng lệch**. Màn
hình giai đoạn 3 phải làm tròn 3 số lẻ khi hiện hiệu số, nếu không người dùng sẽ thấy
số lẻ vô nghĩa và nghi ngờ toàn bộ.

---

## 14. Việc liên quan đã ghi nhận riêng

Lỗi "cột Tiến độ 'Đã đặt' không bảo vệ dòng khỏi bị ghi đè" đã được tách thành task riêng.
Spec này **giải quyết luôn lỗi đó** ở mục 5.2 (tách bạch `trang_thai` do app đặt và `tien_do`
thuần thông tin), nên task kia trở thành thừa khi spec này được triển khai.
