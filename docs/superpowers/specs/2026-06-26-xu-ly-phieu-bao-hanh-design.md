# Tab "Xử lý phiếu bảo hành" + bảng xử lý riêng (đồng bộ Caresoft qua n8n)

**Ngày:** 2026-06-26 · **Phạm vi:** phân hệ Bảo Hành (`src/pages/warranty/`), `src/lib/permRegistry.js`, `sql/` (bảng + trigger mới)

## Vấn đề / Mục tiêu

Thêm 1 tab **"Xử lý phiếu bảo hành"** trong phân hệ Bảo Hành để nhân viên xử lý các ticket đang mở. Tab này:

- Chỉ hiển thị phiếu thỏa **đồng thời**: `trạng_thái_phiếu_ghi ∈ {new, open, pending}` **VÀ** `phân_loại_công_việc ∈ {Bảo hành, Chăm sóc khách hàng}`.
- Cho phép xem + cập nhật gần như toàn bộ trường phiếu, **cộng** các bước xử lý tùy biến để theo dõi tiến độ (phân công, trạng thái xử lý, ghi chú/lịch sử, linh kiện + chi phí).
- Dữ liệu xử lý lưu ở **một bảng database mới riêng** `xu_ly_phieu_bao_hanh`, và đồng bộ kết quả về Caresoft qua n8n.

## Bối cảnh luồng dữ liệu

```
        ┌──────────── INBOUND (Caresoft là chuẩn) ────────────┐
Caresoft ─► n8n ─► phieu_bao_hanh ─►(trigger DB)─► xu_ly_phieu_bao_hanh (Phần A)
(nguồn gốc)        (trạm trung chuyển)              │
                                                    ▼  app hiển thị + thao tác
        ┌──────────── OUTBOUND (App chủ động) ────────────┐
   App ghi xu_ly_phieu_bao_hanh ─►(cờ pending)─► webhook ─► n8n ─► HTTP ─► Caresoft
```

`phieu_bao_hanh` **không phải** nguồn gốc — nó là bản mirror do n8n đồng bộ từ Caresoft (hệ thống ticket gốc).

### Quy tắc vàng (chống vòng lặp & mất dữ liệu)

> **n8n CHỈ ghi vào `phieu_bao_hanh`. App CHỈ ghi vào `xu_ly_phieu_bao_hanh`. Outbound về Caresoft CHỈ chạy khi người dùng bấm nút "Đồng bộ".**

Vì 2 bảng khác nhau và webhook outbound chỉ đặt trên bảng mới (lọc theo cờ `pending`), n8n ghi inbound bao nhiêu lần cũng không kích hoạt outbound → không loop.

### Mức đồng nhất dữ liệu (cam kết thẳng thắn)

| Cặp dữ liệu | Mức đồng nhất | Nhờ cơ chế |
|---|---|---|
| `phieu_bao_hanh` ↔ `xu_ly_phieu_bao_hanh` (Phần A) | **Luôn khớp, tức thì** | Trigger DB (cùng giao dịch) |
| Supabase ↔ Caresoft | **Khớp sau vài giây** (eventual) | n8n + cờ đồng bộ (outbox, thử lại tới khi xác nhận) |
| App ↔ bảng mới | Khớp khi tải / bấm Làm mới | App cache 5 phút (như các phân hệ khác) |

Giới hạn được chấp nhận: trong vài giây lan truyền hoặc khi n8n chết, Caresoft và Supabase lệch tạm rồi tự khớp lại. Quy tắc xung đột: **Caresoft thắng khi trùng ô** (Phần A luôn kéo về bằng Caresoft; chỉnh sửa chưa kịp đồng bộ của nhân viên trên ô bị Caresoft đổi sẽ bị ghi đè).

## Thiết kế dữ liệu: bảng `xu_ly_phieu_bao_hanh`

Quan hệ **1–1** với phiếu, khóa nối `id_phiếu_ghi` (UNIQUE). Bản ghi **tự chứa** (có cả Phần A).

### Phần A — Thông tin phiếu (mirror từ `phieu_bao_hanh`, do trigger giữ đồng bộ)

Tên cột giữ **giống `phieu_bao_hanh`** để map 1-1 dễ dàng:
`id_phiếu_ghi` (text, UNIQUE), `phiếu_ghi`, `mã_đơn_hàng`, `mã_sản_phẩm`, `nhóm_sản_phẩm`, `số_điện_thoại_khách_hàng`, `ngày_lắp_đặt`, `thời_điểm_tạo`, `thời_điểm_cập_nhật`, `linh_kiện`, `chi_tiết_lỗi`, `trạng_thái_phiếu_ghi`, `phân_loại_công_việc`, `đáp_ứng_sla` (đều `text`/`timestamptz` tùy loại).

> Để bền với việc `phieu_bao_hanh` thêm cột về sau, lưu **toàn bộ hàng gốc** thêm vào 1 cột `phiếu_gốc_json jsonb` (snapshot mirror đầy đủ). Các cột Phần A bên trên dùng cho lọc/hiển thị nhanh; `phiếu_gốc_json` dùng khi cần trường ít gặp.

### Phần B — Phần xử lý (chỉ app ghi, n8n/trigger KHÔNG đụng)

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | uuid PK | Khóa chính |
| `caresoft_ticket_id` | text | ID ticket Caresoft để n8n map khi đẩy về (nếu khác `id_phiếu_ghi`) |
| `người_phụ_trách` | text | Phân công người xử lý |
| `trạng_thái_xử_lý` | text | Tiến độ **nội bộ**: `chưa_xử_lý / đang_liên_hệ / đã_hẹn_lịch / đang_xử_lý / chờ_linh_kiện / hoàn_tất` |
| `ngày_hẹn` | timestamptz | Lịch hẹn khách |
| `các_bước` | jsonb `[]` | Bước tùy biến: `{tên, trạng_thái, người_làm, thời_gian, ghi_chú}` |
| `lịch_sử_thao_tác` | jsonb `[]` | Log: `{thời_gian, người, nội_dung}` (chỉ thêm) |
| `linh_kiện_thay` | jsonb `[]` | `{tên, số_lượng, đơn_giá, tính_phí}` |
| `tổng_chi_phí` | numeric | Tổng tiền linh kiện (tính từ `linh_kiện_thay`) |
| `kết_quả_xử_lý` | text | Nội dung kết luận (đẩy về Caresoft) |
| `trạng_thái_caresoft_muốn_set` | text | Trạng thái muốn set cho ticket Caresoft (vd `solved`) |
| `trạng_thái_đồng_bộ` | text | `nháp / pending / đã_đồng_bộ / lỗi` — **cờ điều khiển webhook** |
| `lỗi_đồng_bộ` | text | Thông báo lỗi lần đẩy gần nhất (nếu có) |
| `thời_điểm_đồng_bộ` | timestamptz | Lần đẩy Caresoft gần nhất |
| `người_tạo` / `người_cập_nhật` | text | Audit (mã NV) |
| `created_at` / `updated_at` | timestamptz | Tự động (`updated_at` qua trigger) |

### Trigger đồng bộ Phần A (Caresoft thắng, theo từng ô)

`AFTER INSERT OR UPDATE ON phieu_bao_hanh`:
- Chỉ xử lý phiếu thỏa điều kiện lọc (status ∈ {new,open,pending} AND phân_loại ∈ {Bảo hành, CSKH}).
- **Upsert** vào `xu_ly_phieu_bao_hanh` theo `id_phiếu_ghi`:
  - Nếu chưa có dòng → tạo mới (Phần A từ phiếu gốc, Phần B mặc định: `trạng_thái_xử_lý='chưa_xử_lý'`, `trạng_thái_đồng_bộ='nháp'`).
  - Nếu đã có → cập nhật **chỉ những ô Phần A thực sự đổi** ở `phieu_bao_hanh` (so `NEW` vs `OLD` từng trường) + cập nhật `phiếu_gốc_json`. **Tuyệt đối không chạm Phần B.**
- Cập nhật theo-từng-ô (thay vì ghi đè cả Phần A) để 1 thay đổi không liên quan ở Caresoft không xóa mất chỉnh sửa đang chờ đồng bộ của nhân viên ở ô khác.

### Webhook outbound (n8n đọc bảng mới → Caresoft)

- Supabase Database Webhook / trigger `pg_net` trên `xu_ly_phieu_bao_hanh`, **chỉ bắn khi** `trạng_thái_đồng_bộ` chuyển sang `pending`.
- Payload gửi n8n gồm `id_phiếu_ghi`, `caresoft_ticket_id`, các trường cần đẩy (≈80%: trạng thái, chi tiết lỗi, linh kiện, kết quả xử lý, người phụ trách... — danh sách chốt khi dựng n8n) + `trạng_thái_caresoft_muốn_set`.
- n8n đẩy HTTP về Caresoft → gọi lại Supabase set `đã_đồng_bộ` + `thời_điểm_đồng_bộ` (hoặc `lỗi` + `lỗi_đồng_bộ` nếu thất bại → giữ `pending` để thử lại).

> Phần cấu hình n8n do người dùng tự dựng. Spec này chỉ đảm bảo DB phát đúng tín hiệu + nhận đúng phản hồi.

## Thiết kế UI: tab "Xử lý phiếu bảo hành"

Thêm vào `WarrantyApp.jsx` như tab thứ 4 (component mới `WarrantyProcessing.jsx`).

### Danh sách phiếu
- Nguồn: query `xu_ly_phieu_bao_hanh` (đã được trigger nạp sẵn từ `phieu_bao_hanh`). Không cần JOIN khi hiển thị danh sách.
- Cột: phiếu ghi · mã ĐH · mã SP · SĐT · chi tiết lỗi · **người phụ trách** · **trạng thái xử lý** (badge Phần B) · **trạng thái đồng bộ** (badge) · ngày tạo.
- Lọc / tìm kiếm / phân trang / ẩn-hiện cột theo chuẩn `WarrantyDataManager` (đồng bộ font & pagination toàn app).
- Badge "Chưa xử lý" cho phiếu `trạng_thái_xử_lý='chưa_xử_lý'`.

### Màn xử lý 1 phiếu (modal/panel)
- **Khối thông tin phiếu** (Phần A): hiển thị; các trường được phép sửa thì cho sửa (ghi vào Phần A của bảng mới). Trường Caresoft-only (SĐT, thời điểm tạo gốc) để chỉ-đọc.
- **Khối xử lý** (Phần B):
  - Phân công người phụ trách.
  - Chọn trạng thái xử lý nội bộ + ngày hẹn.
  - **Checklist các bước tùy biến**: thêm/sửa/xóa/đánh dấu hoàn tất từng bước.
  - Ghi chú → append vào `lịch_sử_thao_tác`.
  - Bảng linh kiện thay (tên/SL/đơn giá/tính phí) → tự tính `tổng_chi_phí`.
  - Ô kết quả xử lý + chọn trạng thái Caresoft muốn set.
- **Nút "Lưu"**: ghi Phần B (+ Phần A nếu sửa) vào bảng mới. `trạng_thái_đồng_bộ` giữ `nháp`.
- **Nút "Hoàn tất & Đồng bộ Caresoft"**: lưu + set `trạng_thái_đồng_bộ='pending'` → kích hoạt webhook.
- Hiển thị trạng thái đồng bộ (nháp / đang đẩy / đã đồng bộ / lỗi + nút thử lại).

### Phân quyền
- Thêm tab `xuLy` vào module `warranty` trong `permRegistry.js`, caps `['view','create','edit','delete','io']`.
- Thêm vào `ALL_TABS` trong `WarrantyApp.jsx` (lọc theo `canSeeTab`).
- Component dùng `useTabPerm('warranty','xuLy')` để gate nút Sửa/Xóa/Đồng bộ/Xuất.

## Thay đổi code / Deliverables

1. **`sql/setup_xu_ly_phieu_bao_hanh.sql`** (mới): tạo bảng + index (`id_phiếu_ghi`, `trạng_thái_xử_lý`, `trạng_thái_đồng_bộ`) + RLS policy (toàn quyền nội bộ như các bảng khác) + trigger đồng bộ Phần A + trigger `updated_at` + (tùy chọn) webhook outbound. Có sẵn lệnh backfill nạp các phiếu đang mở hiện có.
2. **`src/pages/warranty/WarrantyProcessing.jsx`** (mới): tab xử lý (danh sách + màn xử lý).
3. **`src/pages/warranty/WarrantyApp.jsx`**: thêm tab vào `ALL_TABS`, render `WarrantyProcessing`, nạp dữ liệu bảng mới.
4. **`src/lib/permRegistry.js`**: thêm tab `xuLy` vào module `warranty`.
5. **Build lại `deploy-netlify/`**: `npm run build` + copy `dist` → `deploy-netlify/` (theo quy trình deploy hiện tại).

## Giả định cần xác nhận khi triển khai

- **Giá trị trạng thái thực tế**: dùng literal `new`, `open`, `pending` theo yêu cầu. Cần đối chiếu giá trị thật trong `phieu_bao_hanh` (code cũ còn thấy `processing`, `solved`, `closed`) — danh sách lọc đặt thành hằng dễ chỉnh.
- **`caresoft_ticket_id`**: xác định trường nào trong `phieu_bao_hanh` là ID ticket Caresoft (có thể chính là `id_phiếu_ghi`).
- **Danh sách ~80% trường đẩy về Caresoft**: chốt cụ thể khi dựng n8n.

## Ngoài phạm vi (Non-goals)

- Không sửa cấu trúc / luồng inbound n8n hiện có ghi vào `phieu_bao_hanh`.
- Không tự dựng workflow n8n (người dùng tự làm); spec chỉ chuẩn bị DB + tín hiệu.
- Không đổi 3 tab Bảo Hành hiện có (Lịch Sử Phiếu, Phân Tích Lỗi, QL Dữ Liệu).
