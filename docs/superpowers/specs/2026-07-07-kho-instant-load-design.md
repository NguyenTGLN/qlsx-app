# Thiết kế: Load tức thời phân hệ Kho (chuẩn WMS chuyên nghiệp)

**Ngày:** 2026-07-07
**Trạng thái:** Đã duyệt hướng (phương án A — server-side toàn bộ)

## Vấn đề

Các tab Kho load chậm vì kiến trúc "kéo hết bảng về trình duyệt rồi mới lọc/sắp/tổng hợp":

| Tab | Hiện trạng | Hậu quả khi bảng lớn |
|---|---|---|
| Tồn kho hàng hóa (StockSummaryTab) | Loop `.range()` kéo toàn bộ `inventory_stock` + join, group bằng JS | N/1000 request nối tiếp; 1 triệu dòng = không bao giờ xong |
| Tồn kho theo vị trí (InventoryTab) | Loop kéo toàn bộ dòng khớp filter, sort + phân trang client | Như trên |
| Tồn kho SX (WipStockTab) | Loop kéo toàn bộ SX9 | Như trên |
| Sổ sách (BookInventoryTab) | RPC `get_book_inventory` gọi theo trang 1000 — **mỗi trang DB tính lại từ đầu** | O(n × số trang) |
| Nhập kho / PSX / Tồn kho | Loop kéo **toàn bộ danh mục** `inventory_items` chỉ để autosuggest | Chậm + tốn RAM |
| Dữ liệu xuất (KhoHangApp) | ĐÃ phân trang server-side đúng chuẩn; nhưng search `ilike '%x%'` không có index trigram, count `exact` | Search + count chậm dần theo số dòng |

Timeout 10s trong `src/lib/supabase.js` sẽ chặn mọi truy vấn chậm → lỗi "Máy chủ phản hồi quá chậm".

## Nguyên tắc thiết kế (chuẩn WMS/ERP)

1. **Trình duyệt chỉ tải đúng cái đang hiển thị** (~50–100 dòng/trang). Không bao giờ tải cả bảng.
2. **Mọi lọc – sắp xếp – tổng hợp chạy trong Postgres**, có index khớp với từng kiểu truy vấn.
3. **Kết quả tổng hợp trả về 1 request duy nhất** (RPC trả `json` — né trần 1000 dòng của PostgREST).
4. **Đếm tổng dùng `count: 'estimated'`** trên bảng lớn (PostgREST hỗ trợ sẵn: chính xác khi nhỏ, ước lượng planner khi lớn).
5. **Autosuggest hỏi thẳng DB** (`limit 20`, có index) — không tải danh mục về trước.
6. **Stale-while-revalidate**: `dataCache` sẵn có → mở lại tab thấy dữ liệu cũ NGAY, nền tự refetch và cập nhật.

Kết quả kỳ vọng: mỗi tab 1–2 request, <1s lần đầu, tức thời từ cache các lần sau — độc lập với số dòng trong bảng.

## Thành phần

### 1. Gói SQL `sql/perf_kho_instant.sql` (chạy 1 lần trong Supabase SQL Editor)

Idempotent, chỉ THÊM hàm/view/index — không sửa/xóa dữ liệu. Gồm:

**a. Hàm sắp vị trí trong DB** — tái tạo `locationSort.js` ([dãy 1 chữ][tầng M<H<B<T<N<S][ô theo giá trị số], mã không đúng mẫu xếp cuối theo so sánh tự nhiên):
- `natural_key(text)` — chuỗi so sánh tự nhiên (số pad 10 chữ số).
- `location_sort_key(text)` IMMUTABLE — khóa sắp thứ tự vật lý kho.
- Cột sinh `inventory_stock.location_key text GENERATED ALWAYS AS (location_sort_key(location)) STORED` + index → client `order('location_key')` là ra đúng lộ trình kho, ở mọi quy mô.

**b. RPC tổng hợp (trả `json` — 1 request):**
- `get_stock_summary()` → mỗi mã hàng 1 dòng: tồn tổng, item_name/unit/lead_time/backup/min_stock (từ `inventory_items`), tổng bán 90 ngày (từ view `sales_90d_summary`). Client giữ nguyên phần công thức đề xuất (hay thay đổi) trên ~vài nghìn dòng kết quả.
- `get_book_inventory_json(p_start, p_end)` → toàn bộ kết quả sổ sách 1 lần (thay vòng lặp gọi RPC theo trang).
- `get_distinct_locations()` → danh sách vị trí cho dropdown.

**c. Index:**
- `inventory_stock`: `item_code`, `location`, `location text_pattern_ops` (lọc tiền tố `ilike 'X%'`), `location_key`, `import_date`.
- `pg_trgm` + GIN cho ô tìm kiếm chứa `%từ%`: `luu_xuat(ma_san_pham, ten_san_pham, ma_don_hang)`, `so_luong_ban(ma_san_pham, ten_san_pham, ma_don_hang)`, `du_lieu_nhap(ma_hang, ten_hang)`, `inventory_items(item_code, item_name)`.
- `ANALYZE` các bảng chính.

### 2. Refactor client (theo mẫu tab "Dữ liệu xuất" đã đúng chuẩn)

| Tab | Thay đổi |
|---|---|
| Tồn HH (StockSummaryTab) | Thay loop kéo stock → 1 call `rpc('get_stock_summary')`; giữ nguyên công thức/lọc/sort client trên kết quả gọn |
| Tồn kho theo vị trí (InventoryTab) | Phân trang + sort + filter server-side (`.range`, `.order('location_key')`, `.in('item_code')` theo quy ước lọc chính xác, `.ilike('location','X%')`, `.eq('location')`); count `estimated`; dropdown vị trí ← `get_distinct_locations()`; autosuggest nhập tay ← query DB `limit 20` |
| Sổ sách (BookInventoryTab) | 1 call `rpc('get_book_inventory_json')` |
| Tồn SX (WipStockTab) | Giữ nguyên code (tập SX9 là WIP, vốn nhỏ) — hưởng index `text_pattern_ops` cho `.like('SX9-%')` |
| Nhập kho (ImportStockTab), PSX (ProductionOrderTab) | Bỏ loop tải cả danh mục/tồn → autosuggest server-side (`ilike` prefix + trgm, `limit 20`) + `dataCache` |
| Dữ liệu xuất / Lưu xuất / DL nhập | Giữ phân trang hiện có; search hưởng index trigram; count → `estimated` |
| Gợi ý filter KhoHangApp (`.limit(500)`) | `limit 20` + index trigram |

**Hook chung `useCachedFetch(key, fetcher)`** (bọc `dataCache`): trả cache ngay nếu có → render tức thời, đồng thời refetch nền và cập nhật state. Áp cho dữ liệu tham chiếu (danh mục, vị trí, NCC) và kết quả RPC tổng hợp.

### 3. Xử lý lỗi & tương thích

- Nếu RPC/cột chưa tồn tại (chưa chạy gói SQL) → thông báo rõ: "Chưa chạy gói SQL sql/perf_kho_instant.sql trong Supabase".
- Không đổi schema dữ liệu nghiệp vụ; chỉ thêm cột sinh `location_key` (không ảnh hưởng ghi).
- Quy ước lọc chính xác giữ nguyên (mã chọn từ gợi ý → `eq`/`in`).

### 4. Kiểm chứng

- Preview local (đăng nhập theo memory), mở từng tab: Network chỉ 1–2 request, thời gian <1s.
- Đối chiếu số liệu trước/sau trên cùng bộ lọc (tổng tồn từng mã, tổng dòng) — kết quả phải khớp tuyệt đối.
- `npm run build` + copy `dist` → `deploy-netlify/` theo quy trình deploy.

## Ngoài phạm vi (phase 2 nếu cần)

- Materialized view + pg_cron cho sổ sách khi dữ liệu lên chục triệu dòng.
- Keyset pagination (thay offset) khi người dùng thật sự duyệt sâu hàng nghìn trang.
- `dksxEngine.js` (10 truy vấn tuần tự) — tối ưu riêng sau.
