-- ============================================================
-- GỠ BỎ tính năng "BC Trực Zalo (thủ công)"
-- Xóa bảng zalo_duty_reports + Storage bucket "zalo-reports".
-- Đảo ngược file setup_zalo_reports.sql (đã xóa khỏi repo).
--
-- ⚠️ THAO TÁC KHÔNG THỂ HOÀN TÁC — dữ liệu & ảnh báo cáo sẽ mất.
--    KPI CSKH Zalo (zalo_conversations / zalo_messages / zalo_groups)
--    KHÔNG bị ảnh hưởng — script này không đụng tới các bảng đó.
--
-- ⚠️ LƯU Ý: Supabase KHÔNG cho xóa bucket/ảnh bằng lệnh SQL
--    (DELETE FROM storage.objects/buckets sẽ báo lỗi 42501).
--    → Phần A làm bằng SQL (dưới đây).
--    → Phần B (xóa bucket) làm bằng tay trên Dashboard — xem cuối file.
-- ============================================================


-- ############################################################
-- PHẦN A — CHẠY TRONG SUPABASE SQL EDITOR
-- ############################################################

-- ---- BƯỚC 0 (TÙY CHỌN – nên làm): Sao lưu trước khi xóa ----
-- Bản sao dữ liệu bảng (đổi tên có hậu tố _backup). Bỏ qua nếu chắc không cần.
-- CREATE TABLE public.zalo_duty_reports_backup AS
--   SELECT * FROM public.zalo_duty_reports;

-- Muốn lưu lại đường dẫn ảnh trước khi xóa bucket? Lấy danh sách:
-- SELECT id, created_at, nguoi_nhap, image_path, image_url
--   FROM public.zalo_duty_reports
--   WHERE image_path IS NOT NULL
--   ORDER BY created_at;

-- ---- BƯỚC 1: Xóa bảng (CASCADE tự gỡ 2 policy của bảng) ----
DROP TABLE IF EXISTS public.zalo_duty_reports CASCADE;

-- ---- BƯỚC 2: Gỡ 2 Storage policy gắn với bucket "zalo-reports" ----
-- (DROP POLICY là DDL, không bị chặn như DELETE)
DROP POLICY IF EXISTS "Allow public upload zalo-reports" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read zalo-reports"   ON storage.objects;

-- ---- KIỂM TRA (kỳ vọng: NULL) ----
-- SELECT to_regclass('public.zalo_duty_reports');


-- ############################################################
-- PHẦN B — XÓA BUCKET "zalo-reports" (KHÔNG dùng SQL)
-- ############################################################
-- Làm 1 trong 2 cách:
--
-- CÁCH 1 — Dashboard (dễ nhất):
--   Supabase → Storage → chọn bucket "zalo-reports"
--   → xóa hết file bên trong → nút ... của bucket → Delete bucket.
--
-- CÁCH 2 — Storage API (nếu quen dùng code), ví dụ Node:
--   const { data } = await supabase.storage.from('zalo-reports').list('reports');
--   await supabase.storage.from('zalo-reports')
--     .remove(data.map(f => `reports/${f.name}`));
--   // rồi xóa bucket trong Dashboard, hoặc:
--   await supabase.storage.deleteBucket('zalo-reports');
