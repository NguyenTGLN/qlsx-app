-- ============================================================
-- ĐỒNG BỘ "kết_quả_thực_hiện" TỪ phieu_bao_hanh → xu_ly_phieu_bao_hanh
-- Cột nguồn: phieu_bao_hanh."kết_quả_thực_hiện" (Caresoft).
-- Thêm cột mirror (Phần A) + cập nhật trigger giữ đồng bộ + backfill.
-- Chạy trong Supabase SQL Editor (idempotent, chạy lại được).
-- ============================================================

-- 1) Thêm cột mirror (Phần A) nếu chưa có.
ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "kết_quả_thực_hiện" TEXT;

-- 2) Cập nhật hàm trigger: bổ sung "kết_quả_thực_hiện" vào cả 3 nhánh
--    (UPDATE theo-từng-ô, INSERT khi vừa đủ điều kiện, INSERT khi TG_OP='INSERT').
--    Giữ nguyên mọi cột cũ; chỉ THÊM 1 cột.
CREATE OR REPLACE FUNCTION public.sync_xu_ly_phieu_bao_hanh()
RETURNS TRIGGER AS $$
DECLARE
  qualifies BOOLEAN := (
    NEW."trạng_thái_phiếu_ghi" IN ('new','open','pending')
    AND NEW."phân_loại_công_việc" = 'Bảo hành và Chăm sóc khách hàng'
  );
BEGIN
  IF TG_OP = 'UPDATE' THEN
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
      "kết_quả_thực_hiện"     = CASE WHEN NEW."kết_quả_thực_hiện"     IS DISTINCT FROM OLD."kết_quả_thực_hiện"     THEN NEW."kết_quả_thực_hiện"     ELSE x."kết_quả_thực_hiện"     END,
      "trạng_thái_phiếu_ghi"  = CASE WHEN NEW."trạng_thái_phiếu_ghi"  IS DISTINCT FROM OLD."trạng_thái_phiếu_ghi"  THEN NEW."trạng_thái_phiếu_ghi"  ELSE x."trạng_thái_phiếu_ghi"  END,
      "phân_loại_công_việc"   = CASE WHEN NEW."phân_loại_công_việc"   IS DISTINCT FROM OLD."phân_loại_công_việc"   THEN NEW."phân_loại_công_việc"   ELSE x."phân_loại_công_việc"   END,
      "đáp_ứng_sla"            = CASE WHEN NEW."đáp_ứng_sla"            IS DISTINCT FROM OLD."đáp_ứng_sla"            THEN NEW."đáp_ứng_sla"            ELSE x."đáp_ứng_sla"            END,
      "phiếu_gốc_json"         = to_jsonb(NEW)
    WHERE x."id_phiếu_ghi" = NEW."id_phiếu_ghi";

    IF NOT FOUND AND qualifies THEN
      INSERT INTO public.xu_ly_phieu_bao_hanh (
        "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
        "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
        "linh_kiện","chi_tiết_lỗi","kết_quả_thực_hiện","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
        caresoft_ticket_id, "phiếu_gốc_json"
      ) VALUES (
        NEW."id_phiếu_ghi", NEW."phiếu_ghi", NEW."mã_đơn_hàng", NEW."mã_sản_phẩm", NEW."nhóm_sản_phẩm",
        NEW."số_điện_thoại_khách_hàng", NEW."ngày_lắp_đặt", NEW."thời_điểm_tạo", NEW."thời_điểm_cập_nhật",
        NEW."linh_kiện", NEW."chi_tiết_lỗi", NEW."kết_quả_thực_hiện", NEW."trạng_thái_phiếu_ghi", NEW."phân_loại_công_việc", NEW."đáp_ứng_sla",
        NEW."id_phiếu_ghi", to_jsonb(NEW)
      ) ON CONFLICT ("id_phiếu_ghi") DO NOTHING;
    END IF;

  ELSE  -- TG_OP = 'INSERT'
    IF qualifies THEN
      INSERT INTO public.xu_ly_phieu_bao_hanh (
        "id_phiếu_ghi","phiếu_ghi","mã_đơn_hàng","mã_sản_phẩm","nhóm_sản_phẩm",
        "số_điện_thoại_khách_hàng","ngày_lắp_đặt","thời_điểm_tạo","thời_điểm_cập_nhật",
        "linh_kiện","chi_tiết_lỗi","kết_quả_thực_hiện","trạng_thái_phiếu_ghi","phân_loại_công_việc","đáp_ứng_sla",
        caresoft_ticket_id, "phiếu_gốc_json"
      ) VALUES (
        NEW."id_phiếu_ghi", NEW."phiếu_ghi", NEW."mã_đơn_hàng", NEW."mã_sản_phẩm", NEW."nhóm_sản_phẩm",
        NEW."số_điện_thoại_khách_hàng", NEW."ngày_lắp_đặt", NEW."thời_điểm_tạo", NEW."thời_điểm_cập_nhật",
        NEW."linh_kiện", NEW."chi_tiết_lỗi", NEW."kết_quả_thực_hiện", NEW."trạng_thái_phiếu_ghi", NEW."phân_loại_công_việc", NEW."đáp_ứng_sla",
        NEW."id_phiếu_ghi", to_jsonb(NEW)
      ) ON CONFLICT ("id_phiếu_ghi") DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (Trigger trg_sync_xu_ly đã trỏ vào hàm này — không cần tạo lại.)

-- 3) Backfill: nạp kết_quả_thực_hiện cho các dòng ĐÃ CÓ (khớp theo id_phiếu_ghi).
UPDATE public.xu_ly_phieu_bao_hanh x
SET "kết_quả_thực_hiện" = p."kết_quả_thực_hiện"
FROM public.phieu_bao_hanh p
WHERE p."id_phiếu_ghi" = x."id_phiếu_ghi"
  AND x."kết_quả_thực_hiện" IS DISTINCT FROM p."kết_quả_thực_hiện";

NOTIFY pgrst, 'reload_schema';
