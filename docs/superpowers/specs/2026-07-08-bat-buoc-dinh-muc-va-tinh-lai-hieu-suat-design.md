# Bắt buộc có định mức + Nạp lại định mức chuẩn & Tính lại hiệu suất cũ

- **Ngày:** 2026-07-08
- **Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch thực thi
- **Liên quan:** Định mức năng lực (`product_capacities`) → Lệnh SX (`production_orders`) → Nhập tiến độ (`WorkerInput`) → Báo cáo hiệu suất (`WorkReport` / `AdminDashboard`)

## 1. Bối cảnh & Vấn đề gốc

Bảng `product_capacities` hiện **trống 0 dòng** trên DB production (đã kiểm chứng bằng query REST: `HTTP 200`, `Content-Range: */0`; control test `production_orders` trả 56 dòng cùng anon key ⇒ RLS không chặn, bảng rỗng thật). App hiển thị đúng empty-state — đây là vấn đề **dữ liệu**, không phải bug hiển thị.

Hệ quả nghiêm trọng: tab "Phiếu Lệnh" khi tạo Lệnh SX có **fallback cứng `0.05`** khi thiếu định mức ([ProductionOrderTab.jsx:1026](../../../src/pages/kho/ProductionOrderTab.jsx)):

```js
const stdTime = capData?.capacity_per_hour ? (1 / parseFloat(capData.capacity_per_hour)) : 0.05;
```

→ Mọi lệnh (56 lệnh, gồm cả tạo hôm nay) đều bị gán `standard_time_per_unit = 0.05` cho **mọi mã khác nhau**. Con số này bị snapshot vào lệnh, `WorkerInput` dùng nó tính `performance_rate`, và báo cáo hiệu suất lấy trung bình các `performance_rate` đó ⇒ **báo cáo hiệu suất đang chạy trên một hằng số giả 0.05, không phản ánh định mức thật**.

Đường tạo lệnh qua Excel/thủ công ở AdminDashboard (`processOrdersUpload`) đã **từ chối** mã thiếu định mức từ trước → không vi phạm.

## 2. Mục tiêu / Ngoài phạm vi

**Mục tiêu:**
1. Không có định mức ⇒ **không thể tạo Lệnh SX** và **không thể nhập tiến độ** cho mã đó (bỏ hẳn fallback 0.05).
2. Sau khi nạp lại bảng định mức chuẩn (Excel thật, người dùng tự nạp qua UI) ⇒ **tính lại toàn bộ** dữ liệu cũ: `standard_time_per_unit` trên mọi lệnh + `performance_rate` trên mọi log.

**Ngoài phạm vi (YAGNI):**
- Không đổi nguồn tính hiệu suất live của `WorkerInput` (vẫn dùng `order.standard_time_per_unit` snapshot — sau guard/recalc thì snapshot = số thật).
- Không tự hồi tố khi đổi định mức về sau (giữ nguyên nguyên tắc snapshot; muốn hồi tố thì chạy lại SQL — hành động thủ công có chủ đích).
- Không xây UI quản lý định mức mới; dùng nút "Nạp Từ Excel" / "Thêm Mã Bằng Tay" sẵn có.

## 3. Định nghĩa "thiếu định mức"

Một `product_code` bị coi là **thiếu định mức** khi: không có dòng trong `product_capacities`, HOẶC có dòng nhưng `capacity_per_hour` là null / ≤ 0.

## 4. Phần A — Chặn khi thiếu định mức (Yêu cầu 1)

### A1. Chặn tại nơi tạo Lệnh SX — tab "Phiếu Lệnh"
- **File:** `src/pages/kho/ProductionOrderTab.jsx`
- **Vị trí:** hàm `confirmDeductAndCreateOrder` (dòng 843), chèn **pre-flight check ngay sau** validation `prodFinishedItems.length === 0` (dòng 844-847) và **trước** `setIsProcessing(true)` — tức trước mọi thao tác ghi kho (updates/inserts/picking logs chạy trong `try`, write đầu tiên ở ~dòng 1008-1010).
- **Logic:**
  1. Chỉ áp cho `mode === 'production'`.
  2. Gom danh sách mã: `codes = [...new Set(prodFinishedItems.map(it => it.productCode))]`.
  3. Một query: `db.from('product_capacities').select('product_code, capacity_per_hour').in('product_code', codes)`.
  4. Tập hợp mã hợp lệ = có dòng và `capacity_per_hour > 0`. `missing = codes` không thuộc tập hợp đó.
  5. Nếu `missing.length > 0` → `alert('Các mã sau chưa có định mức năng lực, không thể tạo Lệnh SX:\n- ' + missing.join('\n- ') + '\n\nVui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức trước.')` rồi `return` (chưa ghi gì).
- **Sửa fallback (dòng 1024-1026):** bỏ `: 0.05`. Vì đã pre-flight đảm bảo có định mức, dùng `stdTime = 1 / capacity_per_hour`. Giữ một guard phòng thủ (nếu vì lý do nào đó vẫn null thì throw để dừng, không âm thầm 0.05).
- **Lưu ý gộp query:** pre-flight tra 1 lần theo `in(codes)`; vòng lặp tạo lệnh (dòng 1023) có thể tái dùng map đã tra thay vì query từng mã bằng `maybeSingle()`.

### A2. Chặn tại nơi nhập tiến độ — màn WorkerInput
- **File:** `src/pages/WorkerInput.jsx`
- **Ngữ cảnh:** `order = location.state?.order` (dòng 11), có `order.product_code`, `order.id`.
- **Logic:**
  1. Thêm state `capacityOk` (`null` = đang tải, `true`, `false`).
  2. `useEffect` khi có `order`: tra **live** `supabase.from('product_capacities').select('capacity_per_hour').eq('product_code', order.product_code).maybeSingle()`. `capacityOk = !!(data && data.capacity_per_hour > 0)`. (Nếu `order.product_code` không có trong state, fetch order theo `orderId` để lấy `product_code` trước.)
  3. Nếu `capacityOk === false`: hiện **banner đỏ** "Sản phẩm [product_code] chưa có định mức năng lực — không thể nhập tiến độ. Vui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức." và **disable nút "Lưu báo cáo"** (kết hợp với `canSubmit` sẵn có).
  4. Chặn lần 2 trong `handleSubmit`: nếu `capacityOk !== true` → `alert(...)` + `return` trước khi insert `production_logs`.
- **Vì sao tra live:** 56 lệnh cũ vẫn dính snapshot `0.05 > 0` nên guard cũ (`order.standard_time_per_unit > 0`) không chặn được; tra live `product_capacities` mới đúng nguồn sự thật "mã này đã có định mức chưa".

### A3. AdminDashboard (nhỏ, tuỳ chọn)
- `processOrdersUpload` đã bỏ qua mã thiếu định mức và cảnh báo (dòng 293, 317). Chỉ tinh chỉnh câu cảnh báo cho rõ nếu cần. Không bắt buộc cho phạm vi này.

## 5. Phần B — Nạp lại định mức chuẩn & Tính lại dữ liệu cũ (Yêu cầu 2)

Thực hiện bằng **1 file SQL chạy 1 lần trong Supabase SQL Editor** (không cần build lại app). Người dùng đã có **file Excel định mức thật** và tự nạp qua nút "Nạp Từ Excel".

### Trình tự
1. Người dùng nạp Excel định mức → `product_capacities` có dữ liệu chuẩn.
2. Chạy file SQL `sql/recalc_dinh_muc_hieu_suat.sql` gồm các bước bọc trong transaction:
   - **B0 — Backup:** `CREATE TABLE bak_production_orders_YYYYMMDD AS SELECT * FROM production_orders;` và tương tự cho `production_logs` (để rollback).
   - **B1 — Báo cáo mã chưa khớp:** `SELECT DISTINCT o.product_code FROM production_orders o LEFT JOIN product_capacities pc ON pc.product_code = o.product_code WHERE pc.product_code IS NULL OR pc.capacity_per_hour IS NULL OR pc.capacity_per_hour <= 0;` → các mã này **giữ nguyên số cũ**; người dùng bổ sung vào Excel rồi nạp lại + chạy lại.
   - **B2 — Cập nhật lệnh:** `UPDATE production_orders o SET standard_time_per_unit = 1.0 / pc.capacity_per_hour FROM product_capacities pc WHERE pc.product_code = o.product_code AND pc.capacity_per_hour > 0;`
   - **B3 — Tính lại log:** `UPDATE production_logs l SET performance_rate = ROUND( (l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100 ) FROM production_orders o, product_capacities pc WHERE l.order_id = o.id AND o.product_code = pc.product_code AND pc.capacity_per_hour > 0 AND l.actual_time_spent > 0;`
     - Đúng công thức gốc app: `perf = (qtyPerPerson / timeHrs) * standard_time * 100`, trong đó `actual_quantity = qtyPerPerson`, `actual_time_spent = timeHrs`, `standard_time = 1/capacity_per_hour`.
   - **B4 — Kiểm chứng trước COMMIT:** SELECT so sánh cũ↔mới (số lệnh/log được cập nhật, vài dòng mẫu) để người dùng xác nhận trước khi `COMMIT`.
   - **Rollback:** nếu sai, `ROLLBACK` (trong transaction) hoặc phục hồi từ bảng `bak_...`.

### Kiểm chứng công thức trước khi ghi
- Trước khi người dùng chạy UPDATE, chạy **bản SELECT read-only** (old_perf vs new_perf trên vài log) để chứng minh công thức khớp — chưa ghi gì.

## 6. Trình tự triển khai & Lưu ý deploy
1. Deploy code Phần A: `npm run build` → copy `dist` → `deploy-netlify/`, người dùng kéo-thả `deploy-netlify/` lên Netlify (theo quy trình hiện tại). Push GitHub chỉ để backup.
2. Người dùng nạp Excel định mức qua UI.
3. Chạy SQL Phần B → xem báo cáo B1 (mã chưa khớp) → bổ sung Excel nếu cần → chạy lại.

## 7. Kiểm thử
- **Guard A1:** preview local — mở tab Phiếu Lệnh, tạo lệnh cho mã chưa có định mức → bị chặn với danh sách mã, không phát sinh ghi kho.
- **Guard A2:** preview local — mở 1 lệnh của mã chưa có định mức (`/worker/input/:orderId`) → banner đỏ + nút Lưu bị khoá; mã đã có định mức → nhập bình thường.
- **SQL B:** chạy bản SELECT read-only đối chiếu cũ/mới; sau khi người dùng nạp Excel thật thì chạy trên bản backup/transaction và kiểm chứng B4 trước COMMIT.

## 8. Rủi ro
- Excel định mức không phủ hết mã trong lệnh cũ → mã đó giữ 0.05; B1 báo cáo để xử lý.
- Log có `actual_time_spent = 0`/null → bỏ qua trong B3 (tránh chia 0), giữ nguyên số cũ.
- Deploy sai quy trình (quên copy dist) → guard không lên; nhắc rõ ở bước triển khai.
