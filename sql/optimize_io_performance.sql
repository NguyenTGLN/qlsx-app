-- ============================================================
-- TỐI ƯU HIỆU NĂNG I/O DISK CHO CÁC BẢNG CSKH + DỌN VIEW CŨ
-- ============================================================
-- Mục đích:
--   1) Loại bỏ hoàn toàn temp_blks khi query ORDER BY created_at DESC
--      bằng cách thêm index DESC trên cột created_at.
--   2) Xóa view_thong_ke_ban_hang — nguyên nhân chính #1 gây
--      temp_blks_written > 9 triệu (UNION ALL + DISTINCT + GROUP BY
--      trên ~1.5 triệu dòng, tràn work_mem → sort trên disk).
--
-- Cách chạy: Mở Supabase Dashboard → SQL Editor → Paste & Run
-- ============================================================


-- ═══════════════════════════════════════════════════════════
-- BƯỚC 1: Tạo index DESC trên created_at cho các bảng CSKH
-- ═══════════════════════════════════════════════════════════
-- Giải quyết: temp_blks_read=4,385,088 / temp_blks_written=4,395,599
-- trên data_links (và các bảng CSKH tương tự).
-- Nguyên nhân: ORDER BY created_at DESC + LIMIT/OFFSET không có
-- index → PostgreSQL buộc phải sort toàn bộ bảng trên disk.

-- Bảng data_links (nguyên nhân chính #2 trong báo cáo)
CREATE INDEX IF NOT EXISTS idx_data_links_created_at
  ON public.data_links (created_at DESC);

-- Các bảng CSKH còn lại (cùng pattern fetch, cùng nguy cơ)
CREATE INDEX IF NOT EXISTS idx_don_hang_lap_moi_created_at
  ON public.du_lieu_don_hang_lap_moi (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_khai_bao_bh_created_at
  ON public.du_lieu_khai_bao__bao_hanh (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_thanh_toan_bh_created_at
  ON public.du_lieu_thanh_toan_bh (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_confirmation_logs_created_at
  ON public.confirmation_logs (created_at DESC);


-- ═══════════════════════════════════════════════════════════
-- BƯỚC 2: Cập nhật statistics để query planner hoạt động chính xác
-- ═══════════════════════════════════════════════════════════
ANALYZE public.data_links;
ANALYZE public.du_lieu_don_hang_lap_moi;
ANALYZE public.du_lieu_khai_bao__bao_hanh;
ANALYZE public.du_lieu_thanh_toan_bh;
ANALYZE public.confirmation_logs;


-- ═══════════════════════════════════════════════════════════
-- BƯỚC 3: Xóa view_thong_ke_ban_hang (nguyên nhân chính #1)
-- ═══════════════════════════════════════════════════════════
-- View này gây temp_blks_read=5,483,381 / temp_blks_written=9,239,301
-- do:
--   - UNION ALL giữa so_luong_ban (730K+) và luu_xuat → ~1.5M dòng
--   - SELECT DISTINCT trên 5 cột text → hash/sort tràn work_mem
--   - GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM') → không dùng được index
--
-- App đã chuyển sang đọc bảng thong_ke_ban_hang (~7K rows).
-- Nếu có hệ thống ngoài (Metabase, Excel, Cron Job...) đang dùng
-- view này, hãy chuyển sang dùng một trong hai cách:
--   ① SELECT * FROM public.thong_ke_ban_hang;
--   ② SELECT * FROM public.get_thong_ke_ban_hang();  -- RPC function
-- ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.view_thong_ke_ban_hang;


-- ═══════════════════════════════════════════════════════════
-- KIỂM TRA (sau khi chạy xong):
-- ═══════════════════════════════════════════════════════════
-- 1. Xác nhận index đã tạo:
--    SELECT indexname, tablename FROM pg_indexes
--    WHERE indexname LIKE 'idx_%_created_at';
--
-- 2. Xác nhận view đã bị xóa:
--    SELECT * FROM information_schema.views
--    WHERE table_name = 'view_thong_ke_ban_hang';
--    → Kỳ vọng: 0 rows
--
-- 3. Sau vài giờ, kiểm tra pg_stat_statements:
--    SELECT query, temp_blks_read, temp_blks_written
--    FROM pg_stat_statements
--    WHERE query LIKE '%data_links%' OR query LIKE '%view_thong_ke%'
--    ORDER BY temp_blks_written DESC;
--    → Kỳ vọng: temp_blks gần 0
-- ═══════════════════════════════════════════════════════════
