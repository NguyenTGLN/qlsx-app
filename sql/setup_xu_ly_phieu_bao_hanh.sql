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
DECLARE
  qualifies BOOLEAN := (
    NEW."trạng_thái_phiếu_ghi" IN ('new','open','pending')
    AND NEW."phân_loại_công_việc" IN ('Bảo hành','Chăm sóc khách hàng')
  );
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Phản ánh thay đổi Phần A lên dòng ĐÃ CÓ (kể cả khi phiếu vừa rời điều kiện
    -- lọc → đổi sang closed/solved; tab sẽ tự ẩn nhờ lọc isQualifyingTicket).
    -- So NEW vs OLD → chỉ ghi đè ô Caresoft THỰC SỰ đổi; KHÔNG đụng Phần B.
    UPDATE public.xu_ly_phieu_bao_hanh x SET
      "phiếu_ghi"                = CASE WHEN NEW."phiếu_ghi"                IS DISTINCT FROM OLD."phiếu_ghi"                THEN NEW."phiếu_ghi"                ELSE x."phiếu_ghi"                END,
      "mã_đơn_hàng"             = CASE WHEN NEW."mã_đơn_hàng"             IS DISTINCT FROM OLD."mã_đơn_hàng"             THEN NEW."mã_đơn_hàng"             ELSE x."mã_đơn_hàng"             END,
      "mã_sản_phẩm"            = CASE WHEN NEW."mã_sản_phẩm"            IS DISTINCT FROM OLD."mã_sản_phẩm"            THEN NEW."mã_sản_phẩm"            ELSE x."mã_sản_phẩm"            END,
      "nhóm_sản_phẩm"          = CASE WHEN NEW."nhóm_sản_phẩm"          IS DISTINCT FROM OLD."nhóm_sản_phẩm"          THEN NEW."nhóm_sản_phẩm"          ELSE x."nhóm_sản_phẩm"          END,
      "số_điện_thoại_khách_hàng" = CASE WHEN NEW."số_điện_thoại_khách_hàng" IS DISTINCT FROM OLD."số_điện_thoại_khách_hàng" THEN NEW."số_điện_thoại_khách_hàng" ELSE x."số_điện_thoại_khách_hàng" END,
      "ngày_lắp_đặt"           = CASE WHEN NEW."ngày_lắp_đặt"           IS DISTINCT FROM OLD."ngày_lắp_đặt"           THEN NEW."ngày_lắp_đặt"           ELSE x."ngày_lắp_đặt"           END,
      "thời_điểm_tạo"          = CASE WHEN NEW."thời_điểm_tạo"          IS DISTINCT FROM OLD."thời_điểm_tạo"          THEN NEW."thời_điểm_tạo"          ELSE x."thời_điểm_tạo"          END,
      "thời_điểm_cập_nhật"    = CASE WHEN NEW."thời_điểm_cập_nhật"    IS DISTINCT FROM OLD."thời_điểm_cập_nhật"    THEN NEW."thời_điểm_cập_nhật"    ELSE x."thời_điểm_cập_nhật"    END,
      "linh_kiện"               = CASE WHEN NEW."linh_kiện"               IS DISTINCT FROM OLD."linh_kiện"               THEN NEW."linh_kiện"               ELSE x."linh_kiện"               END,
      "chi_tiết_lỗi"           = CASE WHEN NEW."chi_tiết_lỗi"           IS DISTINCT FROM OLD."chi_tiết_lỗi"           THEN NEW."chi_tiết_lỗi"           ELSE x."chi_tiết_lỗi"           END,
      "trạng_thái_phiếu_ghi"  = CASE WHEN NEW."trạng_thái_phiếu_ghi"  IS DISTINCT FROM OLD."trạng_thái_phiếu_ghi"  THEN NEW."trạng_thái_phiếu_ghi"  ELSE x."trạng_thái_phiếu_ghi"  END,
      "phân_loại_công_việc"   = CASE WHEN NEW."phân_loại_công_việc"   IS DISTINCT FROM OLD."phân_loại_công_việc"   THEN NEW."phân_loại_công_việc"   ELSE x."phân_loại_công_việc"   END,
      "đáp_ứng_sla"            = CASE WHEN NEW."đáp_ứng_sla"            IS DISTINCT FROM OLD."đáp_ứng_sla"            THEN NEW."đáp_ứng_sla"            ELSE x."đáp_ứng_sla"            END,
      "phiếu_gốc_json"         = to_jsonb(NEW)
    WHERE x."id_phiếu_ghi" = NEW."id_phiếu_ghi";

    -- Phiếu vừa CHỚM đủ điều kiện mà chưa có dòng → tạo mới.
    IF NOT FOUND AND qualifies THEN
      INSERT INTO public.xu_ly_phieu_bao_hanh (
        "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
        "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
        "linh_kiện","chi_tiết_lỗi","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
        caresoft_ticket_id, "phiếu_gốc_json"
      ) VALUES (
        NEW."id_phiếu_ghi", NEW."phiếu_ghi", NEW."mã_đơn_hàng", NEW."mã_sản_phẩm", NEW."nhóm_sản_phẩm",
        NEW."số_điện_thoại_khách_hàng", NEW."ngày_lắp_đặt", NEW."thời_điểm_tạo", NEW."thời_điểm_cập_nhật",
        NEW."linh_kiện", NEW."chi_tiết_lỗi", NEW."trạng_thái_phiếu_ghi", NEW."phân_loại_công_việc", NEW."đáp_ứng_sla",
        NEW."id_phiếu_ghi", to_jsonb(NEW)
      ) ON CONFLICT ("id_phiếu_ghi") DO NOTHING;
    END IF;

  ELSE  -- TG_OP = 'INSERT' (OLD là NULL → KHÔNG tham chiếu OLD)
    IF qualifies THEN
      INSERT INTO public.xu_ly_phieu_bao_hanh (
        "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
        "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
        "linh_kiện","chi_tiết_lỗi","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
        caresoft_ticket_id, "phiếu_gốc_json"
      ) VALUES (
        NEW."id_phiếu_ghi", NEW."phiếu_ghi", NEW."mã_đơn_hàng", NEW."mã_sản_phẩm", NEW."nhóm_sản_phẩm",
        NEW."số_điện_thoại_khách_hàng", NEW."ngày_lắp_đặt", NEW."thời_điểm_tạo", NEW."thời_điểm_cập_nhật",
        NEW."linh_kiện", NEW."chi_tiết_lỗi", NEW."trạng_thái_phiếu_ghi", NEW."phân_loại_công_việc", NEW."đáp_ứng_sla",
        NEW."id_phiếu_ghi", to_jsonb(NEW)
      ) ON CONFLICT ("id_phiếu_ghi") DO NOTHING;  -- đã có (vd backfill) → giữ nguyên, không clobber Phần A/B
    END IF;
  END IF;

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
  caresoft_ticket_id, "phiếu_gốc_json"
)
SELECT
  p."id_phiếu_ghi", p."phiếu_ghi", p."mã_đơn_hàng", p."mã_sản_phẩm", p."nhóm_sản_phẩm",
  p."số_điện_thoại_khách_hàng", p."ngày_lắp_đặt", p."thời_điểm_tạo", p."thời_điểm_cập_nhật",
  p."linh_kiện", p."chi_tiết_lỗi", p."trạng_thái_phiếu_ghi", p."phân_loại_công_việc", p."đáp_ứng_sla",
  p."id_phiếu_ghi", to_jsonb(p)
FROM public.phieu_bao_hanh p
WHERE p."trạng_thái_phiếu_ghi" IN ('new','open','pending')
  AND p."phân_loại_công_việc" IN ('Bảo hành','Chăm sóc khách hàng')
ON CONFLICT ("id_phiếu_ghi") DO NOTHING;

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
