# Tab "Xử lý phiếu bảo hành" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tab "Xử lý phiếu bảo hành" trong phân hệ Bảo Hành + bảng DB riêng `xu_ly_phieu_bao_hanh` tự chứa, có trigger giữ đồng bộ với `phieu_bao_hanh` và cờ đẩy về Caresoft qua n8n.

**Architecture:** Bảng mới gồm Phần A (mirror thông tin phiếu, do trigger DB giữ = `phieu_bao_hanh`, Caresoft thắng khi trùng — cập nhật theo-từng-ô) + Phần B (phần xử lý: phân công, trạng thái, các bước tùy biến, ghi chú, linh kiện/chi phí, cờ đồng bộ — chỉ app ghi). App đọc/ghi bảng mới; n8n chỉ ghi `phieu_bao_hanh`; outbound về Caresoft chỉ chạy khi `trạng_thái_đồng_bộ='pending'`.

**Tech Stack:** React 19 + Vite, Supabase (`taskDb` = anon client), Vitest, lucide-react, recharts. Cột DB tiếng Việt có dấu (truy cập bằng bracket notation `row['mã_đơn_hàng']`).

**Spec:** `docs/superpowers/specs/2026-06-26-xu-ly-phieu-bao-hanh-design.md`

---

## File Structure

- **Create** `sql/setup_xu_ly_phieu_bao_hanh.sql` — bảng + index + RLS + grants + trigger đồng bộ Phần A + trigger updated_at + backfill + (tài liệu webhook outbound). Chạy thủ công trong Supabase SQL Editor.
- **Create** `src/lib/warrantyProcessing.js` — hằng số + helper thuần (predicate lọc, tính tổng chi phí, danh sách trạng thái xử lý). Có test.
- **Create** `src/lib/warrantyProcessing.test.js` — unit test cho helper.
- **Create** `src/pages/warranty/WarrantyProcessing.jsx` — tab: tự nạp dữ liệu bảng mới, bộ lọc, bảng, phân trang, mở modal.
- **Create** `src/pages/warranty/ProcessingModal.jsx` — modal xử lý 1 phiếu (Phần A xem/sửa + Phần B thao tác).
- **Modify** `src/lib/permRegistry.js` — thêm tab `xuLy` vào module `warranty`.
- **Modify** `src/lib/permRegistry.test.js` — test tab mới tồn tại.
- **Modify** `src/pages/warranty/WarrantyApp.jsx` — thêm tab vào `ALL_TABS` + render `WarrantyProcessing`.
- **Build** `deploy-netlify/` — rebuild sau khi xong.

---

## Task 1: SQL — Tạo bảng `xu_ly_phieu_bao_hanh` + RLS + index

**Files:**
- Create: `sql/setup_xu_ly_phieu_bao_hanh.sql`

- [ ] **Step 1: Tạo file SQL với phần bảng + index + RLS + grants**

Tạo `sql/setup_xu_ly_phieu_bao_hanh.sql`:

```sql
-- ============================================================
-- BẢNG XỬ LÝ PHIẾU BẢO HÀNH (xu_ly_phieu_bao_hanh)
-- Bản ghi tự chứa: Phần A (mirror phieu_bao_hanh, trigger giữ đồng bộ)
--                  + Phần B (phần xử lý, chỉ app ghi).
-- Chạy trong Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.xu_ly_phieu_bao_hanh (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ── Phần A: mirror từ phieu_bao_hanh (trigger giữ đồng bộ; Caresoft thắng) ──
  "id_phiếu_ghi"              TEXT UNIQUE NOT NULL,
  "phiếu_ghi"                 TEXT,
  "mã_đơn_hàng"               TEXT,
  "mã_sản_phẩm"               TEXT,
  "nhóm_sản_phẩm"             TEXT,
  "số_điện_thoại_khách_hàng"  TEXT,
  "ngày_lắp_đặt"              TEXT,
  "thời_điểm_tạo"             TEXT,
  "thời_điểm_cập_nhật"        TEXT,
  "linh_kiện"                 TEXT,
  "chi_tiết_lỗi"              TEXT,
  "trạng_thái_phiếu_ghi"      TEXT,
  "phân_loại_công_việc"       TEXT,
  "đáp_ứng_sla"               TEXT,
  "phiếu_gốc_json"            JSONB,

  -- ── Phần B: phần xử lý (chỉ app ghi; trigger KHÔNG đụng) ──
  caresoft_ticket_id              TEXT,
  "người_phụ_trách"               TEXT,
  "trạng_thái_xử_lý"              TEXT DEFAULT 'chưa_xử_lý',
  "ngày_hẹn"                      TIMESTAMPTZ,
  "các_bước"                      JSONB DEFAULT '[]'::jsonb,
  "lịch_sử_thao_tác"             JSONB DEFAULT '[]'::jsonb,
  "linh_kiện_thay"                JSONB DEFAULT '[]'::jsonb,
  "tổng_chi_phí"                  NUMERIC DEFAULT 0,
  "kết_quả_xử_lý"                 TEXT,
  "trạng_thái_caresoft_muốn_set"  TEXT,
  "trạng_thái_đồng_bộ"            TEXT DEFAULT 'nháp',
  "lỗi_đồng_bộ"                   TEXT,
  "thời_điểm_đồng_bộ"             TIMESTAMPTZ,
  "người_tạo"                     TEXT,
  "người_cập_nhật"                TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_xlbh_id_phieu       ON public.xu_ly_phieu_bao_hanh("id_phiếu_ghi");
CREATE INDEX IF NOT EXISTS idx_xlbh_trang_thai_xl  ON public.xu_ly_phieu_bao_hanh("trạng_thái_xử_lý");
CREATE INDEX IF NOT EXISTS idx_xlbh_dong_bo        ON public.xu_ly_phieu_bao_hanh("trạng_thái_đồng_bộ");

ALTER TABLE public.xu_ly_phieu_bao_hanh ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_xu_ly_bh" ON public.xu_ly_phieu_bao_hanh;
CREATE POLICY "policy_xu_ly_bh" ON public.xu_ly_phieu_bao_hanh FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.xu_ly_phieu_bao_hanh TO anon, authenticated;

NOTIFY pgrst, 'reload_schema';
```

- [ ] **Step 2: Chạy & kiểm tra trong Supabase SQL Editor**

Chạy đoạn trên, rồi chạy kiểm tra:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'xu_ly_phieu_bao_hanh' ORDER BY ordinal_position;
```
Expected: liệt kê đủ các cột Phần A + Phần B ở trên.

- [ ] **Step 3: Commit**

```bash
git add "sql/setup_xu_ly_phieu_bao_hanh.sql"
git commit -m "feat(bao-hanh): tạo bảng xu_ly_phieu_bao_hanh + RLS + index"
```

---

## Task 2: SQL — Trigger đồng bộ Phần A (Caresoft thắng, theo-từng-ô) + updated_at + backfill

**Files:**
- Modify: `sql/setup_xu_ly_phieu_bao_hanh.sql` (thêm cuối file)

- [ ] **Step 1: Thêm function + trigger đồng bộ Phần A**

Thêm vào cuối `sql/setup_xu_ly_phieu_bao_hanh.sql`:

```sql
-- ============================================================
-- TRIGGER 1: giữ Phần A của xu_ly_phieu_bao_hanh = phieu_bao_hanh.
--   - Chỉ xử lý phiếu thỏa điều kiện lọc.
--   - Cập nhật theo-từng-ô: chỉ ghi đè ô mà Caresoft thực sự đổi
--     (NEW khác OLD) → không xóa mất chỉnh sửa đang chờ đồng bộ của app
--     ở ô Caresoft không đụng tới.
--   - KHÔNG bao giờ chạm cột Phần B.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_xu_ly_phieu_bao_hanh()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (
    NEW."trạng_thái_phiếu_ghi" IN ('new','open','pending')
    AND NEW."phân_loại_công_việc" IN ('Bảo hành','Chăm sóc khách hàng')
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.xu_ly_phieu_bao_hanh (
    "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
    "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
    "linh_kiện","chi_tiết_lỗi","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
    "phiếu_gốc_json"
  ) VALUES (
    NEW."id_phiếu_ghi", NEW."phiếu_ghi", NEW."mã_đơn_hàng", NEW."mã_sản_phẩm", NEW."nhóm_sản_phẩm",
    NEW."số_điện_thoại_khách_hàng", NEW."ngày_lắp_đặt", NEW."thời_điểm_tạo", NEW."thời_điểm_cập_nhật",
    NEW."linh_kiện", NEW."chi_tiết_lỗi", NEW."trạng_thái_phiếu_ghi", NEW."phân_loại_công_việc", NEW."đáp_ứng_sla",
    to_jsonb(NEW)
  )
  ON CONFLICT ("id_phiếu_ghi") DO UPDATE SET
    "phiếu_ghi"                = CASE WHEN NEW."phiếu_ghi"                IS DISTINCT FROM OLD."phiếu_ghi"                THEN NEW."phiếu_ghi"                ELSE public.xu_ly_phieu_bao_hanh."phiếu_ghi"                END,
    "mã_đơn_hàng"             = CASE WHEN NEW."mã_đơn_hàng"             IS DISTINCT FROM OLD."mã_đơn_hàng"             THEN NEW."mã_đơn_hàng"             ELSE public.xu_ly_phieu_bao_hanh."mã_đơn_hàng"             END,
    "mã_sản_phẩm"            = CASE WHEN NEW."mã_sản_phẩm"            IS DISTINCT FROM OLD."mã_sản_phẩm"            THEN NEW."mã_sản_phẩm"            ELSE public.xu_ly_phieu_bao_hanh."mã_sản_phẩm"            END,
    "nhóm_sản_phẩm"          = CASE WHEN NEW."nhóm_sản_phẩm"          IS DISTINCT FROM OLD."nhóm_sản_phẩm"          THEN NEW."nhóm_sản_phẩm"          ELSE public.xu_ly_phieu_bao_hanh."nhóm_sản_phẩm"          END,
    "số_điện_thoại_khách_hàng" = CASE WHEN NEW."số_điện_thoại_khách_hàng" IS DISTINCT FROM OLD."số_điện_thoại_khách_hàng" THEN NEW."số_điện_thoại_khách_hàng" ELSE public.xu_ly_phieu_bao_hanh."số_điện_thoại_khách_hàng" END,
    "ngày_lắp_đặt"           = CASE WHEN NEW."ngày_lắp_đặt"           IS DISTINCT FROM OLD."ngày_lắp_đặt"           THEN NEW."ngày_lắp_đặt"           ELSE public.xu_ly_phieu_bao_hanh."ngày_lắp_đặt"           END,
    "thời_điểm_tạo"          = CASE WHEN NEW."thời_điểm_tạo"          IS DISTINCT FROM OLD."thời_điểm_tạo"          THEN NEW."thời_điểm_tạo"          ELSE public.xu_ly_phieu_bao_hanh."thời_điểm_tạo"          END,
    "thời_điểm_cập_nhật"    = CASE WHEN NEW."thời_điểm_cập_nhật"    IS DISTINCT FROM OLD."thời_điểm_cập_nhật"    THEN NEW."thời_điểm_cập_nhật"    ELSE public.xu_ly_phieu_bao_hanh."thời_điểm_cập_nhật"    END,
    "linh_kiện"               = CASE WHEN NEW."linh_kiện"               IS DISTINCT FROM OLD."linh_kiện"               THEN NEW."linh_kiện"               ELSE public.xu_ly_phieu_bao_hanh."linh_kiện"               END,
    "chi_tiết_lỗi"           = CASE WHEN NEW."chi_tiết_lỗi"           IS DISTINCT FROM OLD."chi_tiết_lỗi"           THEN NEW."chi_tiết_lỗi"           ELSE public.xu_ly_phieu_bao_hanh."chi_tiết_lỗi"           END,
    "trạng_thái_phiếu_ghi"  = CASE WHEN NEW."trạng_thái_phiếu_ghi"  IS DISTINCT FROM OLD."trạng_thái_phiếu_ghi"  THEN NEW."trạng_thái_phiếu_ghi"  ELSE public.xu_ly_phieu_bao_hanh."trạng_thái_phiếu_ghi"  END,
    "phân_loại_công_việc"   = CASE WHEN NEW."phân_loại_công_việc"   IS DISTINCT FROM OLD."phân_loại_công_việc"   THEN NEW."phân_loại_công_việc"   ELSE public.xu_ly_phieu_bao_hanh."phân_loại_công_việc"   END,
    "đáp_ứng_sla"            = CASE WHEN NEW."đáp_ứng_sla"            IS DISTINCT FROM OLD."đáp_ứng_sla"            THEN NEW."đáp_ứng_sla"            ELSE public.xu_ly_phieu_bao_hanh."đáp_ứng_sla"            END,
    "phiếu_gốc_json"         = to_jsonb(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_xu_ly ON public.phieu_bao_hanh;
CREATE TRIGGER trg_sync_xu_ly
AFTER INSERT OR UPDATE ON public.phieu_bao_hanh
FOR EACH ROW EXECUTE FUNCTION public.sync_xu_ly_phieu_bao_hanh();

-- ============================================================
-- TRIGGER 2: tự cập nhật updated_at khi sửa bảng xử lý
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_xu_ly()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_xu_ly_updated_at ON public.xu_ly_phieu_bao_hanh;
CREATE TRIGGER trg_xu_ly_updated_at
BEFORE UPDATE ON public.xu_ly_phieu_bao_hanh
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_xu_ly();

-- ============================================================
-- BACKFILL: nạp các phiếu đang mở hiện có vào bảng xử lý
-- ============================================================
INSERT INTO public.xu_ly_phieu_bao_hanh (
  "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
  "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
  "linh_kiện","chi_tiết_lỗi","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
  "phiếu_gốc_json"
)
SELECT
  p."id_phiếu_ghi", p."phiếu_ghi", p."mã_đơn_hàng", p."mã_sản_phẩm", p."nhóm_sản_phẩm",
  p."số_điện_thoại_khách_hàng", p."ngày_lắp_đặt", p."thời_điểm_tạo", p."thời_điểm_cập_nhật",
  p."linh_kiện", p."chi_tiết_lỗi", p."trạng_thái_phiếu_ghi", p."phân_loại_công_việc", p."đáp_ứng_sla",
  to_jsonb(p)
FROM public.phieu_bao_hanh p
WHERE p."trạng_thái_phiếu_ghi" IN ('new','open','pending')
  AND p."phân_loại_công_việc" IN ('Bảo hành','Chăm sóc khách hàng')
ON CONFLICT ("id_phiếu_ghi") DO NOTHING;
```

> ⚠️ **Trước khi chạy, xác nhận giá trị thật** của `trạng_thái_phiếu_ghi` và `phân_loại_công_việc`:
> ```sql
> SELECT DISTINCT "trạng_thái_phiếu_ghi" FROM public.phieu_bao_hanh;
> SELECT DISTINCT "phân_loại_công_việc"  FROM public.phieu_bao_hanh;
> ```
> Nếu khác (vd `processing` thay cho `open`), sửa lại danh sách trong `IN (...)` ở cả function lẫn backfill **và** trong `src/lib/warrantyProcessing.js` (Task 4) cho khớp.

- [ ] **Step 2: Chạy & kiểm tra**

Chạy phần thêm. Kiểm tra backfill:
```sql
SELECT count(*) FROM public.xu_ly_phieu_bao_hanh;
```
Expected: > 0 (bằng số phiếu đang mở thỏa điều kiện).

Kiểm tra trigger (đổi 1 phiếu test rồi xem Phần A có cập nhật, Phần B giữ nguyên):
```sql
-- Sửa thử 1 ô ở phieu_bao_hanh, rồi xem dòng tương ứng ở bảng xử lý
SELECT "id_phiếu_ghi","chi_tiết_lỗi","trạng_thái_xử_lý"
FROM public.xu_ly_phieu_bao_hanh LIMIT 5;
```

- [ ] **Step 3: Commit**

```bash
git add "sql/setup_xu_ly_phieu_bao_hanh.sql"
git commit -m "feat(bao-hanh): trigger đồng bộ Phần A + updated_at + backfill"
```

---

## Task 3: SQL — Tài liệu webhook outbound về n8n (cờ pending)

**Files:**
- Modify: `sql/setup_xu_ly_phieu_bao_hanh.sql` (thêm cuối file, dạng tài liệu)

- [ ] **Step 1: Thêm phần hướng dẫn webhook (comment + ví dụ tùy chọn)**

Thêm vào cuối file:

```sql
-- ============================================================
-- OUTBOUND → n8n → Caresoft (người dùng tự dựng workflow n8n)
-- Khuyến nghị: cấu hình qua Supabase Dashboard → Database → Webhooks:
--   • Table: xu_ly_phieu_bao_hanh
--   • Events: UPDATE
--   • Condition (nếu hỗ trợ): record."trạng_thái_đồng_bộ" = 'pending'
--   • URL: webhook n8n của bạn
-- n8n nhận payload → HTTP cập nhật Caresoft (dùng caresoft_ticket_id) →
--   gọi lại Supabase REST cập nhật dòng:
--     trạng_thái_đồng_bộ='đã_đồng_bộ', thời_điểm_đồng_bộ=now()
--     (hoặc 'lỗi' + lỗi_đồng_bộ='...'; giữ 'pending' để thử lại).
--
-- QUY TẮC VÀNG: n8n CHỈ ghi phieu_bao_hanh (inbound) + ghi cờ đồng bộ ở
-- bảng xử lý (outbound ack). App CHỈ ghi xu_ly_phieu_bao_hanh.
-- KHÔNG đặt webhook outbound trên phieu_bao_hanh (tránh vòng lặp).
--
-- (TÙY CHỌN) Nếu muốn trigger bằng pg_net thay vì Dashboard Webhook:
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- CREATE OR REPLACE FUNCTION public.notify_caresoft_sync()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF NEW."trạng_thái_đồng_bộ" = 'pending'
--      AND NEW."trạng_thái_đồng_bộ" IS DISTINCT FROM OLD."trạng_thái_đồng_bộ" THEN
--     PERFORM net.http_post(
--       url := 'https://YOUR-N8N/webhook/caresoft-sync',
--       body := to_jsonb(NEW)
--     );
--   END IF;
--   RETURN NEW;
-- END; $$ LANGUAGE plpgsql;
-- DROP TRIGGER IF EXISTS trg_notify_caresoft ON public.xu_ly_phieu_bao_hanh;
-- CREATE TRIGGER trg_notify_caresoft AFTER UPDATE ON public.xu_ly_phieu_bao_hanh
-- FOR EACH ROW EXECUTE FUNCTION public.notify_caresoft_sync();
```

- [ ] **Step 2: Commit**

```bash
git add "sql/setup_xu_ly_phieu_bao_hanh.sql"
git commit -m "docs(bao-hanh): hướng dẫn webhook outbound n8n trong SQL setup"
```

---

## Task 4: lib helper `warrantyProcessing.js` + tests (TDD)

**Files:**
- Create: `src/lib/warrantyProcessing.js`
- Create: `src/lib/warrantyProcessing.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/warrantyProcessing.test.js`:

```js
import { test, expect, describe } from 'vitest';
import {
  PROCESSING_STATUSES, PROCESSING_CATEGORIES,
  isQualifyingTicket, computeTotalCost, TRANG_THAI_XU_LY,
} from './warrantyProcessing';

describe('isQualifyingTicket', () => {
  test('đúng khi status + phân loại đều khớp', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'open', 'phân_loại_công_việc': 'Bảo hành' })).toBe(true);
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'new', 'phân_loại_công_việc': 'Chăm sóc khách hàng' })).toBe(true);
  });
  test('sai khi status không thuộc danh sách', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'closed', 'phân_loại_công_việc': 'Bảo hành' })).toBe(false);
  });
  test('sai khi phân loại không thuộc danh sách', () => {
    expect(isQualifyingTicket({ 'trạng_thái_phiếu_ghi': 'open', 'phân_loại_công_việc': 'Kỹ thuật' })).toBe(false);
  });
  test('sai khi null/undefined', () => {
    expect(isQualifyingTicket(null)).toBe(false);
    expect(isQualifyingTicket({})).toBe(false);
  });
});

describe('computeTotalCost', () => {
  test('cộng số_lượng × đơn_giá các dòng tính phí', () => {
    const parts = [
      { 'tên': 'Bơm', 'số_lượng': 2, 'đơn_giá': 100, 'tính_phí': true },
      { 'tên': 'Nguồn', 'số_lượng': 1, 'đơn_giá': 50, 'tính_phí': true },
    ];
    expect(computeTotalCost(parts)).toBe(250);
  });
  test('bỏ qua dòng tính_phí=false', () => {
    const parts = [
      { 'số_lượng': 2, 'đơn_giá': 100, 'tính_phí': true },
      { 'số_lượng': 5, 'đơn_giá': 100, 'tính_phí': false },
    ];
    expect(computeTotalCost(parts)).toBe(200);
  });
  test('giá trị thiếu/không phải số coi như 0', () => {
    expect(computeTotalCost([{ 'tên': 'X', 'tính_phí': true }])).toBe(0);
    expect(computeTotalCost([])).toBe(0);
    expect(computeTotalCost(null)).toBe(0);
  });
});

describe('hằng số', () => {
  test('danh sách trạng thái/phân loại đúng', () => {
    expect(PROCESSING_STATUSES).toEqual(['new', 'open', 'pending']);
    expect(PROCESSING_CATEGORIES).toEqual(['Bảo hành', 'Chăm sóc khách hàng']);
  });
  test('TRANG_THAI_XU_LY có id chưa_xử_lý và hoàn_tất', () => {
    const ids = TRANG_THAI_XU_LY.map(s => s.id);
    expect(ids).toContain('chưa_xử_lý');
    expect(ids).toContain('hoàn_tất');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test -- warrantyProcessing`
Expected: FAIL — "Failed to resolve import './warrantyProcessing'".

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/warrantyProcessing.js`:

```js
// Helper thuần cho tab "Xử lý phiếu bảo hành".
// ⚠️ PROCESSING_STATUSES / PROCESSING_CATEGORIES phải KHỚP danh sách IN(...) trong
//    sql/setup_xu_ly_phieu_bao_hanh.sql (trigger + backfill).

export const PROCESSING_STATUSES = ['new', 'open', 'pending'];
export const PROCESSING_CATEGORIES = ['Bảo hành', 'Chăm sóc khách hàng'];

export const TRANG_THAI_XU_LY = [
  { id: 'chưa_xử_lý',    label: 'Chưa xử lý',    color: '#64748b' },
  { id: 'đang_liên_hệ',  label: 'Đang liên hệ',  color: '#0284c7' },
  { id: 'đã_hẹn_lịch',   label: 'Đã hẹn lịch',   color: '#7c3aed' },
  { id: 'đang_xử_lý',    label: 'Đang xử lý',    color: '#d97706' },
  { id: 'chờ_linh_kiện', label: 'Chờ linh kiện', color: '#dc2626' },
  { id: 'hoàn_tất',      label: 'Hoàn tất',      color: '#15803d' },
];

export const TRANG_THAI_DONG_BO = {
  'nháp':        { label: 'Nháp',        color: '#94a3b8' },
  'pending':     { label: 'Đang đẩy',    color: '#d97706' },
  'đã_đồng_bộ':  { label: 'Đã đồng bộ',  color: '#15803d' },
  'lỗi':         { label: 'Lỗi',         color: '#dc2626' },
};

export function isQualifyingTicket(t) {
  if (!t) return false;
  return PROCESSING_STATUSES.includes(t['trạng_thái_phiếu_ghi'])
    && PROCESSING_CATEGORIES.includes(t['phân_loại_công_việc']);
}

export function computeTotalCost(parts) {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, p) => {
    if (!p || p['tính_phí'] === false) return sum;
    const qty = Number(p['số_lượng']) || 0;
    const price = Number(p['đơn_giá']) || 0;
    return sum + qty * price;
  }, 0);
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test -- warrantyProcessing`
Expected: PASS (toàn bộ test xanh).

- [ ] **Step 5: Commit**

```bash
git add "src/lib/warrantyProcessing.js" "src/lib/warrantyProcessing.test.js"
git commit -m "feat(bao-hanh): helper warrantyProcessing (predicate lọc, tính chi phí) + test"
```

---

## Task 5: permRegistry — thêm tab `xuLy` (TDD)

**Files:**
- Modify: `src/lib/permRegistry.js:43-49`
- Modify: `src/lib/permRegistry.test.js`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/permRegistry.test.js` (trước dòng cuối hoặc sau block cuối):

```js
describe('tab xuLy của Bảo Hành', () => {
  test('module warranty có tab xuLy với đủ 5 cap', () => {
    const warranty = PERM_REGISTRY.find(m => m.module === 'warranty');
    const xuLy = warranty.tabs.find(t => t.id === 'xuLy');
    expect(xuLy).toBeTruthy();
    expect(xuLy.label).toBe('Xử Lý Phiếu');
    expect(xuLy.caps).toEqual(['view', 'create', 'edit', 'delete', 'io']);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test -- permRegistry`
Expected: FAIL — `xuLy` is undefined.

- [ ] **Step 3: Thêm tab vào registry**

Trong `src/lib/permRegistry.js`, sửa block module `warranty` (dòng 43-49) — thêm 1 dòng tab sau `history`:

```js
  {
    module: 'warranty', label: 'Bảo Hành', icon: '🛡️', legacyAccess: 'access_warranty',
    tabs: [
      { id: 'history',        label: 'Lịch Sử Phiếu', caps: ['view'] }, // nội dung chỉ-đọc (thẻ + biểu đồ)
      { id: 'xuLy',           label: 'Xử Lý Phiếu',   caps: ['view', 'create', 'edit', 'delete', 'io'] }, // xử lý phiếu đang mở + đồng bộ Caresoft
      { id: 'batchAnalytics', label: 'Phân Tích Lỗi', caps: ['view'] }, // chỉ-đọc
      { id: 'dataManager',    label: 'QL Dữ Liệu',    caps: ['view', 'edit', 'delete', 'io'] }, // bản ghi vào qua import, không có nút Thêm tay
    ],
  },
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test -- permRegistry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/lib/permRegistry.js" "src/lib/permRegistry.test.js"
git commit -m "feat(bao-hanh): thêm tab phân quyền xuLy cho phân hệ Bảo Hành"
```

---

## Task 6: Component `ProcessingModal.jsx` (modal xử lý 1 phiếu)

**Files:**
- Create: `src/pages/warranty/ProcessingModal.jsx`

Modal nhận 1 dòng từ `xu_ly_phieu_bao_hanh`, cho xem Phần A + thao tác Phần B, gọi `onSave`/`onSync`/`onClose` do tab cha cung cấp. Toàn bộ logic state cục bộ trong modal; cha chỉ nhận object cần lưu.

- [ ] **Step 1: Tạo file modal với đầy đủ Phần B**

Tạo `src/pages/warranty/ProcessingModal.jsx`:

```jsx
import React, { useState, useMemo } from 'react';
import { X, Save, Send, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { TRANG_THAI_XU_LY, computeTotalCost } from '../../lib/warrantyProcessing';

const s = {
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#334155' },
  input: { padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem', width: '100%' },
  section: { borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' },
  sectionTitle: { margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' },
  readonlyVal: { fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 },
  readonlyLbl: { fontSize: '0.75rem', color: '#64748b' },
};

// Field Phần A cho phép sửa (ghi vào bảng xử lý). Field Caresoft-only để chỉ đọc.
const EDITABLE_A = ['mã_đơn_hàng', 'mã_sản_phẩm', 'nhóm_sản_phẩm', 'ngày_lắp_đặt', 'linh_kiện', 'chi_tiết_lỗi'];

export default function ProcessingModal({ row, perm, onClose, onSave, onSync }) {
  const [form, setForm] = useState(() => ({
    // Phần A (editable)
    'mã_đơn_hàng': row['mã_đơn_hàng'] || '',
    'mã_sản_phẩm': row['mã_sản_phẩm'] || '',
    'nhóm_sản_phẩm': row['nhóm_sản_phẩm'] || '',
    'ngày_lắp_đặt': row['ngày_lắp_đặt'] || '',
    'linh_kiện': row['linh_kiện'] || '',
    'chi_tiết_lỗi': row['chi_tiết_lỗi'] || '',
    // Phần B
    'người_phụ_trách': row['người_phụ_trách'] || '',
    'trạng_thái_xử_lý': row['trạng_thái_xử_lý'] || 'chưa_xử_lý',
    'ngày_hẹn': row['ngày_hẹn'] ? String(row['ngày_hẹn']).substring(0, 16) : '',
    'kết_quả_xử_lý': row['kết_quả_xử_lý'] || '',
    'trạng_thái_caresoft_muốn_set': row['trạng_thái_caresoft_muốn_set'] || '',
  }));
  const [steps, setSteps] = useState(() => Array.isArray(row['các_bước']) ? row['các_bước'] : []);
  const [parts, setParts] = useState(() => Array.isArray(row['linh_kiện_thay']) ? row['linh_kiện_thay'] : []);
  const [history] = useState(() => Array.isArray(row['lịch_sử_thao_tác']) ? row['lịch_sử_thao_tác'] : []);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const totalCost = useMemo(() => computeTotalCost(parts), [parts]);

  // ── Các bước tùy biến ──
  const addStep = () => setSteps(prev => [...prev, { 'tên': '', 'trạng_thái': 'chưa_xong', 'người_làm': '', 'ghi_chú': '' }]);
  const updateStep = (i, k, v) => setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, [k]: v } : st));
  const toggleStep = (i) => setSteps(prev => prev.map((st, idx) => idx === i ? { ...st, 'trạng_thái': st['trạng_thái'] === 'xong' ? 'chưa_xong' : 'xong' } : st));
  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  // ── Linh kiện thay ──
  const addPart = () => setParts(prev => [...prev, { 'tên': '', 'số_lượng': 1, 'đơn_giá': 0, 'tính_phí': true }]);
  const updatePart = (i, k, v) => setParts(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const removePart = (i) => setParts(prev => prev.filter((_, idx) => idx !== i));

  // Gom dữ liệu để lưu. Note mới (nếu có) append vào lịch sử.
  const buildPayload = () => {
    const editedA = {};
    EDITABLE_A.forEach(k => { editedA[k] = form[k]; });
    const nextHistory = newNote.trim()
      ? [...history, { 'thời_gian': new Date().toISOString(), 'người': row['người_phụ_trách'] || '', 'nội_dung': newNote.trim() }]
      : history;
    return {
      ...editedA,
      'người_phụ_trách': form['người_phụ_trách'],
      'trạng_thái_xử_lý': form['trạng_thái_xử_lý'],
      'ngày_hẹn': form['ngày_hẹn'] || null,
      'kết_quả_xử_lý': form['kết_quả_xử_lý'],
      'trạng_thái_caresoft_muốn_set': form['trạng_thái_caresoft_muốn_set'] || null,
      'các_bước': steps,
      'linh_kiện_thay': parts,
      'tổng_chi_phí': totalCost,
      'lịch_sử_thao_tác': nextHistory,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(row.id, buildPayload()); } finally { setSaving(false); }
  };
  const handleSync = async () => {
    setSaving(true);
    try { await onSync(row.id, buildPayload()); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
      <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '720px', padding: '1.25rem', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>Xử lý phiếu {row['phiếu_ghi'] || row['id_phiếu_ghi']}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24} /></button>
        </div>

        {/* Thông tin Caresoft-only (chỉ đọc) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '10px' }}>
          <div><div style={s.readonlyLbl}>SĐT khách</div><div style={s.readonlyVal}>{row['số_điện_thoại_khách_hàng'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Ngày tạo</div><div style={s.readonlyVal}>{row['thời_điểm_tạo'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Trạng thái phiếu (Caresoft)</div><div style={s.readonlyVal}>{row['trạng_thái_phiếu_ghi'] || '-'}</div></div>
          <div><div style={s.readonlyLbl}>Phân loại</div><div style={s.readonlyVal}>{row['phân_loại_công_việc'] || '-'}</div></div>
        </div>

        {/* Phần A: thông tin phiếu (sửa được) */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin phiếu</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={s.inputGroup}><label style={s.label}>Mã đơn hàng</label><input style={s.input} value={form['mã_đơn_hàng']} onChange={e => set('mã_đơn_hàng', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Mã sản phẩm</label><input style={s.input} value={form['mã_sản_phẩm']} onChange={e => set('mã_sản_phẩm', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Nhóm sản phẩm</label><input style={s.input} value={form['nhóm_sản_phẩm']} onChange={e => set('nhóm_sản_phẩm', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Ngày lắp đặt</label><input type="date" style={s.input} value={form['ngày_lắp_đặt'] ? String(form['ngày_lắp_đặt']).substring(0, 10) : ''} onChange={e => set('ngày_lắp_đặt', e.target.value)} /></div>
            <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}><label style={s.label}>Linh kiện lỗi</label><input style={s.input} value={form['linh_kiện']} onChange={e => set('linh_kiện', e.target.value)} /></div>
            <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}><label style={s.label}>Chi tiết lỗi</label><textarea rows={2} style={{ ...s.input, resize: 'vertical' }} value={form['chi_tiết_lỗi']} onChange={e => set('chi_tiết_lỗi', e.target.value)} /></div>
          </div>
        </div>

        {/* Phần B: phân công + trạng thái */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Xử lý</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={s.inputGroup}><label style={s.label}>Người phụ trách</label><input style={s.input} value={form['người_phụ_trách']} onChange={e => set('người_phụ_trách', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Trạng thái xử lý</label>
              <select style={s.input} value={form['trạng_thái_xử_lý']} onChange={e => set('trạng_thái_xử_lý', e.target.value)}>
                {TRANG_THAI_XU_LY.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
              </select>
            </div>
            <div style={s.inputGroup}><label style={s.label}>Ngày hẹn</label><input type="datetime-local" style={s.input} value={form['ngày_hẹn']} onChange={e => set('ngày_hẹn', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Trạng thái Caresoft muốn set</label><input style={s.input} placeholder="vd: solved" value={form['trạng_thái_caresoft_muốn_set']} onChange={e => set('trạng_thái_caresoft_muốn_set', e.target.value)} /></div>
          </div>
        </div>

        {/* Các bước tùy biến */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ ...s.sectionTitle, margin: 0 }}>Các bước xử lý</h3>
            <button onClick={addStep} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}><Plus size={14} /> Thêm bước</button>
          </div>
          {steps.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Chưa có bước nào.</p> : steps.map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <button onClick={() => toggleStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: st['trạng_thái'] === 'xong' ? '#15803d' : '#cbd5e1' }}>
                {st['trạng_thái'] === 'xong' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              <input style={{ ...s.input, flex: 2 }} placeholder="Tên bước" value={st['tên']} onChange={e => updateStep(i, 'tên', e.target.value)} />
              <input style={{ ...s.input, flex: 1 }} placeholder="Người làm" value={st['người_làm']} onChange={e => updateStep(i, 'người_làm', e.target.value)} />
              <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        {/* Linh kiện thay + chi phí */}
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ ...s.sectionTitle, margin: 0 }}>Linh kiện thay</h3>
            <button onClick={addPart} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}><Plus size={14} /> Thêm linh kiện</button>
          </div>
          {parts.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input style={{ ...s.input, flex: 2 }} placeholder="Tên" value={p['tên']} onChange={e => updatePart(i, 'tên', e.target.value)} />
              <input type="number" style={{ ...s.input, flex: 1 }} placeholder="SL" value={p['số_lượng']} onChange={e => updatePart(i, 'số_lượng', e.target.value)} />
              <input type="number" style={{ ...s.input, flex: 1 }} placeholder="Đơn giá" value={p['đơn_giá']} onChange={e => updatePart(i, 'đơn_giá', e.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={p['tính_phí'] !== false} onChange={e => updatePart(i, 'tính_phí', e.target.checked)} /> Tính phí
              </label>
              <button onClick={() => removePart(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>Tổng chi phí: {totalCost.toLocaleString('vi-VN')} đ</div>
        </div>

        {/* Ghi chú + kết quả */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Ghi chú & kết quả</h3>
          {history.length > 0 && (
            <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#f8fafc', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.5rem' }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '0.3rem' }}>
                  <b>{h['người'] || 'NV'}</b> · <span style={{ color: '#94a3b8' }}>{h['thời_gian'] ? new Date(h['thời_gian']).toLocaleString('vi-VN') : ''}</span>: {h['nội_dung']}
                </div>
              ))}
            </div>
          )}
          <div style={s.inputGroup}><label style={s.label}>Thêm ghi chú</label><input style={s.input} value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Ghi chú thao tác lần này..." /></div>
          <div style={{ ...s.inputGroup, marginTop: '0.5rem' }}><label style={s.label}>Kết quả xử lý (đẩy về Caresoft)</label><textarea rows={2} style={{ ...s.input, resize: 'vertical' }} value={form['kết_quả_xử_lý']} onChange={e => set('kết_quả_xử_lý', e.target.value)} /></div>
        </div>

        {/* Nút hành động */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Đóng</button>
          {perm.edit && <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#3b82f6', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Save size={16} /> Lưu</button>}
          {perm.edit && <button onClick={handleSync} disabled={saving} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#10b981', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Send size={16} /> Hoàn tất & Đồng bộ Caresoft</button>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/pages/warranty/ProcessingModal.jsx"
git commit -m "feat(bao-hanh): ProcessingModal — màn xử lý 1 phiếu (Phần A + Phần B)"
```

---

## Task 7: Component `WarrantyProcessing.jsx` (tab: danh sách + nạp/lưu/đồng bộ)

**Files:**
- Create: `src/pages/warranty/WarrantyProcessing.jsx`

Tab tự nạp dữ liệu từ `xu_ly_phieu_bao_hanh`, lọc/tìm/phân trang, mở `ProcessingModal`, lưu/đồng bộ về DB.

- [ ] **Step 1: Tạo file tab**

Tạo `src/pages/warranty/WarrantyProcessing.jsx`:

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb } from '../../lib/task_supabase';
import { Search, RefreshCw, ChevronLeft, ChevronRight, PenTool } from 'lucide-react';
import { useTabPerm } from '../../lib/AuthContext';
import { TRANG_THAI_XU_LY, TRANG_THAI_DONG_BO } from '../../lib/warrantyProcessing';
import ProcessingModal from './ProcessingModal';

const statusMeta = (id) => TRANG_THAI_XU_LY.find(s => s.id === id) || { label: id || 'Chưa xử lý', color: '#64748b' };

export default function WarrantyProcessing() {
  const perm = useTabPerm('warranty', 'xuLy');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState('wproc_search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('wproc_statusFilter', 'all');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = usePersistedState('wproc_rowsPerPage', 50);
  const [editing, setEditing] = useState(null);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const all = [];
      const step = 1000;
      for (let from = 0; ; from += step) {
        const { data, error } = await taskDb
          .from('xu_ly_phieu_bao_hanh')
          .select('*')
          .order('thời_điểm_tạo', { ascending: false })
          .range(from, from + step - 1);
        if (error) { console.warn('[WarrantyProcessing] fetch error:', error.message); break; }
        all.push(...(data || []));
        if (!data || data.length < step) break;
      }
      setRows(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== 'all') r = r.filter(x => (x['trạng_thái_xử_lý'] || 'chưa_xử_lý') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => ['phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'chi_tiết_lỗi', 'người_phụ_trách']
        .some(k => String(x[k] || '').toLowerCase().includes(q)));
    }
    return r;
  }, [rows, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Lưu (giữ trạng_thái_đồng_bộ hiện tại, không đẩy)
  const handleSave = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(payload).eq('id', id);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setEditing(null);
    await fetchRows();
  };

  // Hoàn tất & đồng bộ: set cờ pending → webhook n8n sẽ đẩy về Caresoft
  const handleSync = async (id, payload) => {
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh')
      .update({ ...payload, 'trạng_thái_đồng_bộ': 'pending', 'lỗi_đồng_bộ': null }).eq('id', id);
    if (error) { alert('Lỗi đồng bộ: ' + error.message); return; }
    alert('Đã đánh dấu phiếu chờ đồng bộ về Caresoft.');
    setEditing(null);
    await fetchRows();
  };

  if (loading && rows.length === 0) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><RefreshCw size={36} className="spin" color="#6366f1" /></div>;
  }

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
      {/* Bộ lọc */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.4rem 0.6rem', flex: '1 1 240px' }}>
          <Search size={16} color="#94a3b8" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Tìm phiếu, mã ĐH, SP, SĐT, lỗi, người phụ trách..." style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}>
          <option value="all">Tất cả trạng thái xử lý</option>
          {TRANG_THAI_XU_LY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={fetchRows} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#475569' }}><RefreshCw size={15} /> Làm mới</button>
      </div>

      {/* Bảng */}
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              {['Phiếu ghi', 'Mã ĐH', 'Mã SP', 'SĐT', 'Chi tiết lỗi', 'Người phụ trách', 'Trạng thái xử lý', 'Đồng bộ'].map(h => (
                <th key={h} style={{ padding: '0.8rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Không có phiếu cần xử lý.</td></tr>
            ) : pageRows.map((r, idx) => {
              const sm = statusMeta(r['trạng_thái_xử_lý'] || 'chưa_xử_lý');
              const dm = TRANG_THAI_DONG_BO[r['trạng_thái_đồng_bộ']] || TRANG_THAI_DONG_BO['nháp'];
              return (
                <tr key={r.id} onClick={() => setEditing(r)} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>{r['phiếu_ghi'] || r['id_phiếu_ghi']}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['mã_đơn_hàng'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['mã_sản_phẩm'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#3b82f6' }}>{r['số_điện_thoại_khách_hàng'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#334155', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['chi_tiết_lỗi'] || '-'}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.78rem', color: '#475569' }}>{r['người_phụ_trách'] || <span style={{ color: '#cbd5e1' }}>Chưa giao</span>}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}><span style={{ background: sm.color + '22', color: sm.color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{sm.label}</span></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}><span style={{ background: dm.color + '22', color: dm.color, padding: '3px 9px', borderRadius: '12px', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{dm.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tổng <b>{filtered.length}</b> phiếu</span>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px' }}>
            <option value={20}>20 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option>
          </select>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}><ChevronLeft size={16} /></button>
            <span style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>Trang {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {editing && <ProcessingModal row={editing} perm={perm} onClose={() => setEditing(null)} onSave={handleSave} onSync={handleSync} />}
    </div>
  );
}
```

- [ ] **Step 2: Kiểm tra build không lỗi cú pháp**

Run: `npm run build`
Expected: build PASS (không lỗi import/JSX).

- [ ] **Step 3: Commit**

```bash
git add "src/pages/warranty/WarrantyProcessing.jsx"
git commit -m "feat(bao-hanh): tab WarrantyProcessing — danh sách + lọc + nạp/lưu/đồng bộ"
```

---

## Task 8: Wire vào `WarrantyApp.jsx`

**Files:**
- Modify: `src/pages/warranty/WarrantyApp.jsx:16-18` (import), `:122-126` (ALL_TABS), `:489-495` (render)

- [ ] **Step 1: Thêm import**

Trong `src/pages/warranty/WarrantyApp.jsx`, sau dòng `import WarrantyDataManager from './WarrantyDataManager';` (dòng 17) thêm:

```jsx
import WarrantyProcessing from './WarrantyProcessing';
```

Và thêm icon `Wrench` vào import lucide-react (dòng 6-9), thêm vào danh sách:

```jsx
import {
  ArrowLeft, Calendar as CalendarIcon, ShieldAlert, BarChart2,
  Activity, Layers, AlertTriangle, PenTool, RefreshCw, Wrench
} from 'lucide-react';
```

- [ ] **Step 2: Thêm tab vào ALL_TABS**

Sửa `ALL_TABS` (dòng 122-126) — thêm tab `xuLy` sau `history`:

```jsx
  const ALL_TABS = [
    { id: 'history', label: 'Lịch Sử Phiếu', icon: Layers },
    { id: 'xuLy', label: 'Xử Lý Phiếu', icon: Wrench },
    { id: 'batchAnalytics', label: 'Phân Tích Lỗi', icon: BarChart2 },
    { id: 'dataManager', label: 'QL Dữ Liệu', icon: PenTool }
  ];
```

- [ ] **Step 3: Render tab khi viewMode === 'xuLy'**

Trong khối render (sau block `batchAnalytics`, trước block `dataManager`, khoảng dòng 489), thêm:

```jsx
        <div style={{ display: viewMode === 'xuLy' ? 'block' : 'none' }}>
          {viewMode === 'xuLy' && <WarrantyProcessing />}
        </div>
```

> Lưu ý: render có điều kiện `viewMode === 'xuLy'` để component chỉ nạp dữ liệu khi tab được mở (tránh fetch sớm). `comment` viewMode persisted: giá trị `'xuLy'` hợp lệ vì danh sách tab động.

- [ ] **Step 4: Kiểm tra build + lint**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Verify trên preview**

Đăng nhập (xem memo preview), vào phân hệ **Bảo Hành** → bấm tab **Xử Lý Phiếu**:
- Danh sách phiếu hiện ra (status new/open/pending + Bảo hành/CSKH).
- Bấm 1 dòng → modal mở: xem thông tin + sửa Phần B (thêm bước, thêm linh kiện, ghi chú).
- Bấm **Lưu** → đóng modal, dòng cập nhật trạng thái xử lý.
- Bấm **Hoàn tất & Đồng bộ Caresoft** → badge "Đồng bộ" chuyển "Đang đẩy".

Kiểm console không có lỗi đỏ.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/warranty/WarrantyApp.jsx"
git commit -m "feat(bao-hanh): gắn tab Xử Lý Phiếu vào WarrantyApp"
```

---

## Task 9: Chạy toàn bộ test + build lại deploy-netlify

**Files:**
- Modify: `deploy-netlify/` (bundle build)

- [ ] **Step 1: Chạy toàn bộ test**

Run: `npm test`
Expected: tất cả test PASS (gồm warrantyProcessing + permRegistry mới).

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: PASS, sinh thư mục `dist/`.

- [ ] **Step 3: Copy dist → deploy-netlify**

Theo quy trình deploy hiện tại (memo `qlsx-netlify-deploy`): copy nội dung `dist/` đè vào `deploy-netlify/`.

Run (PowerShell): `Copy-Item -Path dist/* -Destination deploy-netlify/ -Recurse -Force`

- [ ] **Step 4: Commit**

```bash
git add "deploy-netlify"
git commit -m "chore: build lại deploy-netlify (tab Xử Lý Phiếu bảo hành)"
```

---

## Self-Review checklist (đã rà)

- **Spec coverage:** bảng mới (Task 1) · trigger Phần A Caresoft-thắng theo-từng-ô + backfill (Task 2) · webhook outbound (Task 3) · predicate lọc + tính chi phí (Task 4) · phân quyền tab (Task 5) · modal Phần A+B với các bước tùy biến/linh kiện/ghi chú (Task 6) · tab danh sách + nạp/lưu/đồng bộ cờ pending (Task 7) · wire UI (Task 8) · build/deploy (Task 9). ✅
- **Quy tắc vàng (chống loop):** app chỉ ghi `xu_ly_phieu_bao_hanh`; n8n chỉ ghi `phieu_bao_hanh`; outbound chỉ khi cờ `pending`. ✅
- **Type/tên nhất quán:** cột DB (Phần A/B) khớp giữa SQL ↔ modal ↔ tab; `PROCESSING_STATUSES` khớp `IN(...)` trong SQL (đã ghi chú đồng bộ ở Task 2 & 4). `computeTotalCost` dùng key `số_lượng/đơn_giá/tính_phí` khớp modal. ✅
- **Điểm cần xác nhận khi làm (đã đánh dấu trong Task 2):** giá trị thật của `trạng_thái_phiếu_ghi`/`phân_loại_công_việc`; `caresoft_ticket_id` map từ trường nào; danh sách trường đẩy CS chốt khi dựng n8n. ✅
```
