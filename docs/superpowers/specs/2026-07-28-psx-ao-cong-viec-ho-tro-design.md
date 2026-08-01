# PSX ảo cho công việc hỗ trợ (GH, NH, DK, DTNB, PS)

Ngày: 28/07/2026

## Vấn đề

Hàng ngày nhân viên sản xuất còn làm những việc không phải sản xuất: đóng gói hàng
giao (GH), nhập hàng (NH), dọn kho (DK), đào tạo nội bộ (DTNB), việc phát sinh (PS).
Những việc này đã được cấp mã trong danh mục hàng hóa và có bảng định mức năng lực,
nhưng **không có BOM, không có tồn kho, không có xuất nhập gì**.

Màn hình báo cáo tiến độ hiện tại ([WorkerInput.jsx:266](../../../src/pages/WorkerInput.jsx))
**bắt buộc** nhập ít nhất một vị trí kho, và sau khi lưu thì **tự động** ghi
`inventory_stock`, tạo phiếu nhập kho PNK và ghi `du_lieu_nhap`. Với việc hỗ trợ thì
cả cụm này đều sai.

Cần: thợ tự chọn việc hỗ trợ khi cần, vẫn chọn thời gian và người thực hiện, **không
chọn vị trí lưu**, và **bắt buộc ghi chú** nội dung cụ thể (nhập hàng gì, đào tạo gì,
phát sinh gì).

## Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Vòng đời phiếu ảo | **Thường trực** — mỗi mã đúng 1 phiếu, không bao giờ hết, không ai phải tạo hàng ngày |
| Tính vào KPI hiệu suất? | **Có.** `GH` tính theo định mức riêng; 4 mã còn lại chỉ ghi nhận thời gian, hiệu suất **cố định 100%** |
| Chỗ đặt trên màn hình thợ | **Nhóm riêng "Công việc khác"** nằm dưới danh sách PSX |
| Hiện ở Kho / Giao việc / Quản trị? | **Ẩn phiếu** khỏi mọi màn hình ngoài màn hình thợ. **Giữ bản ghi báo cáo** trong Lịch sử sản xuất và Báo cáo công việc để còn tra được căn cứ KPI |
| Cách đánh dấu | **Thêm cột phân loại vào `production_orders`** (thay vì quy ước theo mã phiếu, hay tách bảng riêng) |

Lý do chọn cột phân loại thay vì tách bảng riêng: KPI, Báo cáo công việc và Lịch sử
sản xuất đều đọc `production_logs`. Tách bảng thì cả ba màn hình phải gộp hai nguồn —
nhiều việc hơn và dễ lệch số giữa các màn hình.

## Thiết kế

### 1. Dữ liệu

```sql
alter table production_orders
  add column loai_viec text not null default 'SAN_XUAT'
    check (loai_viec in ('SAN_XUAT','HO_TRO')),
  add column cach_tinh_hieu_suat text not null default 'DINH_MUC'
    check (cach_tinh_hieu_suat in ('DINH_MUC','CO_DINH_100'));

alter table production_logs add column ghi_chu text;
```

Cả hai cột đều có giá trị mặc định ⇒ **8 phiếu đang có không đổi hành vi**, và lệnh
`upsert` tạo phiếu SX ở [ProductionOrderTab.jsx:1278](../../../src/pages/kho/ProductionOrderTab.jsx)
chạy y nguyên, không phải sửa dòng nào.

Năm dòng phiếu thường trực:

| Mã phiếu | Mã việc | Tên | `cach_tinh_hieu_suat` | `standard_time_per_unit` |
|---|---|---|---|---|
| `VIEC-GH` | GH | Đóng đơn giao hàng | `DINH_MUC` | 0.1667 (6 đơn/giờ) |
| `VIEC-NH` | NH | Nhập hàng | `CO_DINH_100` | 0 |
| `VIEC-DK` | DK | Dọn kho | `CO_DINH_100` | 0 |
| `VIEC-DTNB` | DTNB | Đào tạo nội bộ | `CO_DINH_100` | 0 |
| `VIEC-PS` | PS | Việc phát sinh | `CO_DINH_100` | 0 |

`target_quantity = 0`, `status = 'pending'`, `loai_viec = 'HO_TRO'`.

Tiền tố `VIEC-` (không phải `PSX-`) để bộ sinh mã ở
[ProductionOrderTab.jsx:444](../../../src/pages/kho/ProductionOrderTab.jsx) — chỉ dò
`PSX-YYYYMMDD-%` — không bao giờ đụng vào và không làm lệch số thứ tự phiếu trong ngày.

Trong 5 mã trên, hiện DB **mới chỉ có `GH`** (`inventory_items` + `product_capacities`
= 6/giờ, kèm 1 dòng `bom_items` tự trỏ chính nó). Bốn mã còn lại chưa tạo.
Bốn mã `CO_DINH_100` **không cần** dòng `product_capacities`, cũng **không cần** dòng
BOM tự trỏ — cách lách đó bỏ được.

### 2. Màn hình Sản Xuất của thợ

```
Danh sách Lệnh Sản Xuất
[ Tất cả 8 ][ Hoàn thành 6 ][ Đang làm 2 ]   ← chỉ đếm PSX sản xuất thật
  ...thẻ PSX...

Công việc khác
[ Giao hàng ] [ Nhập hàng ]
[ Dọn kho   ] [ Đào tạo   ]
[ Phát sinh ]
```

- Năm thẻ **luôn hiện đủ**, không chịu 3 nút lọc — phiếu thường trực thì
  "hoàn thành / đang làm" vô nghĩa.
- Thẻ việc hỗ trợ **không có** cụm "Chỉ tiêu / Đã nhập / Còn".
- `locPhieuSanXuat` phải **loại `HO_TRO`** khỏi cả 3 tab và khỏi số đếm. Không loại thì
  `VIEC-GH` rơi vào tab "Hoàn thành" ngay từ báo cáo đầu tiên, vì
  `còn lại = 0 − đã làm` ra số âm ⇒ `xong = true`.

Theo luật giao diện của dự án: lưới `repeat(2, minmax(0, 1fr))`, chữ 1 dòng
(`whiteSpace: nowrap` + ellipsis), cỡ chữ `clamp`. Nhãn dài nhất "Phát sinh" = 9 ký tự,
dưới ngưỡng 10. **Phải đo thật** ở 320 / 375 / 430px, không tin vào tính nhẩm.

### 3. Màn hình báo cáo tiến độ

Khi phiếu là `HO_TRO`:

| Thành phần | `GH` (`DINH_MUC`) | 4 mã còn lại (`CO_DINH_100`) |
|---|---|---|
| Ngày, giờ bắt đầu/kết thúc | giữ | giữ |
| Chọn người thực hiện | giữ | giữ |
| Cảnh báo trùng giờ | giữ | giữ |
| Chống trùng bằng token | giữ | giữ |
| Ô số lượng | giữ (1 ô, gõ thẳng) | **ẩn**, lưu `actual_quantity = 0` |
| Chọn vị trí lưu | **bỏ hẳn** | **bỏ hẳn** |
| Tự động nhập kho (PNK, `du_lieu_nhap`, `inventory_stock`, trừ WIP `SX9-`) | **không chạy** | **không chạy** |
| Chặn "vượt chỉ tiêu còn lại" | **bỏ** | **bỏ** |
| Chặn "chưa có định mức" | giữ | **bỏ** (không dùng định mức) |
| Hiệu suất | công thức cũ | **cố định 100** |
| Ghi chú | **bắt buộc** | **bắt buộc** |

Không cho gửi khi ghi chú trống hoặc chỉ có khoảng trắng. Gợi ý trong ô ghi chú đổi
theo mã việc:

| Mã | Gợi ý |
|---|---|
| GH | Đơn nào, cho khách nào? |
| NH | Nhập hàng gì, của ai? |
| DK | Dọn khu nào? |
| DTNB | Đào tạo nội dung gì? |
| PS | Việc phát sinh gì? |

### 4. Ảnh hưởng sang màn hình khác

Đã rà toàn bộ nơi đọc/ghi hai bảng này. Hai màn hình của chính tính năng —
`WorkerDashboard` (mục 2) và `WorkerInput` (mục 3) — nằm ngoài bảng dưới đây.

**Năm chỗ ở màn hình khác phải sửa** — đều chỉ *thêm điều kiện lọc*, không đổi logic:

| Chỗ | Màn hình | Sửa |
|---|---|---|
| `TaskApp.jsx:175` | Giao việc — lệnh SX đang chờ | `+ .eq('loai_viec','SAN_XUAT')` |
| `ProductionOrderTab.jsx:746` | Kho — ô chọn phiếu gần đây để in | `+ .eq('loai_viec','SAN_XUAT')` |
| `ImportStockTab.jsx:279` | Kho — ô chọn phiếu SX để nhập thành phẩm | `+ .eq('loai_viec','SAN_XUAT')` |
| `AdminDashboard.jsx:120` | Quản trị — bảng Lệnh sản xuất | `+ .eq('loai_viec','SAN_XUAT')` |
| `AdminDashboard.jsx:113` | Quản trị — ô đếm tổng số lệnh SX | `+ .eq('loai_viec','SAN_XUAT')` |

Ô đếm **"Tổng số lệnh sản xuất"** ở Quản trị: không lọc thì con số nhảy từ 8 lên 13.
Lọc để giữ đúng nghĩa "lệnh sản xuất thật".

**Bốn chỗ cố ý KHÔNG sửa:**

- `ProductionOrderTab.jsx:444` sinh mã phiếu — chỉ dò `PSX-YYYYMMDD-%`, `VIEC-` không lọt.
- `ProductionOrderTab.jsx:1278` upsert tạo phiếu SX — cột mới có mặc định.
- `WorkerInput.jsx:93` cảnh báo trùng giờ (đọc `production_logs` theo ngày) — **giữ
  tính cả việc hỗ trợ là đúng**: một người không thể vừa đóng hàng vừa đứng chuyền
  cùng khung giờ.
- `ImportStockTab.jsx:338` — chỉ chạy với phiếu đã chọn từ ô đã lọc ở trên.

**Ba chỗ giữ nguyên, chỉ thêm hiển thị:**

- `KpiTab.jsx:125` — giữ nguyên hoàn toàn, việc hỗ trợ tính vào KPI theo đúng thỏa thuận.
- `AdminDashboard.jsx:114` (Lịch sử sản xuất) và `WorkReport.jsx:75` (Báo cáo công
  việc) — thêm nhãn loại việc + cột ghi chú để tra được căn cứ KPI.

### 5. Hệ quả lên điểm KPI

Việc hỗ trợ chấm 100% sẽ kéo **trung bình hiệu suất tháng** xuống, vì thợ hiện đạt
103–154%.

Nhưng luật KPI kẹp trần ở 100% ([kpiTuDong.js:219](../../../src/lib/kpiTuDong.js)) nên
với 8 người hiện tại **điểm KPI không đổi**: trung bình của toàn số ≥100 vẫn ≥100, vẫn
đạt trần. Điểm chỉ đổi khi ai đó có hiệu suất sản xuất thật **dưới** 100% — lúc đó việc
hỗ trợ 100% **kéo điểm họ lên**. Đây là hướng đúng (người đi dọn kho cả ngày không bị
phạt), nhưng là thay đổi thật về cách chấm điểm.

## Kiểm thử

Viết test trước theo lối TDD sẵn có của repo:

- `locPhieuSanXuat`: phiếu `HO_TRO` không lọt vào cả 3 tab và không vào số đếm; hàm
  tách nhóm trả đúng 5 thẻ.
- Tính hiệu suất: `CO_DINH_100` luôn ra 100 bất kể số lượng/giờ; `DINH_MUC` giữ đúng
  công thức cũ (test hồi quy — chặn việc làm lệch cách chấm của phiếu sản xuất thật).
- Chặn gửi khi ghi chú trống hoặc chỉ có khoảng trắng.
- Render `WorkerDashboard`: có khu "Công việc khác", 5 thẻ, chữ 1 dòng, không `overflow-x`.
- Đo giao diện thật ở 320 / 375 / 430px: `scrollWidth == clientWidth`, số dòng nhãn = 1.
- Chạy lại toàn bộ test hiện có (679 test) trước khi bàn giao.

## Bảo mật

Bắt buộc gọi skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao, và **đo bằng chính
khoá công khai** trong mã nguồn: 2 cột mới và 5 dòng phiếu mới không cho `anon`
đọc/sửa/xoá. Ô `ghi_chu` là chỗ đáng lo nhất vì sẽ chứa tên khách, nội dung đào tạo,
chuyện phát sinh nội bộ.

**Điểm phải báo lại, không tự sửa:** policy hiện tại của hai bảng là
`chi_nguoi_dang_nhap` cấp `ALL` cho mọi tài khoản đã đăng nhập với điều kiện `true`.
Nghĩa là mọi nhân viên đăng nhập được đều đọc — và sửa, xoá — được ghi chú của người
khác. Đây là hiện trạng sẵn có của bảng chứ không phải do tính năng này gây ra, nhưng
ghi chú tự do làm hậu quả nặng hơn. Đo xong báo số thật; siết lại hay không là quyết
định của người dùng, vì đụng tới quyền của các màn hình khác.

## Đường lùi

Hai cột mới đều có mặc định, 5 dòng phiếu nhận diện bằng `loai_viec = 'HO_TRO'`. Gỡ bỏ
chỉ là xoá 5 dòng đó — dữ liệu sản xuất cũ không dính gì. Cột `ghi_chu` để lại cũng vô
hại vì nullable.

## Ngoài phạm vi

- Không làm màn hình quản lý riêng cho việc hỗ trợ (Lịch sử sản xuất đã đủ tra cứu).
- Không tự sinh phiếu theo ngày.
- Không siết RLS của `production_orders` / `production_logs` — chỉ đo và báo.
- Không sửa các thanh lọc còn cuộn ngang ở Admin / Chất lượng / Cải tiến.
