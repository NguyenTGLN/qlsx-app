-- Tính lại định mức chuẩn cho Lệnh SX cũ + tính lại hiệu suất log cũ.
-- CHẠY SAU KHI đã nạp Excel định mức thật vào product_capacities.
-- Chạy trong Supabase SQL Editor.
--
-- Công thức khớp app (WorkerInput.jsx):
--   performance_rate = round( (actual_quantity / actual_time_spent) * standard_time * 100 )
--   với standard_time = 1 / capacity_per_hour; actual_quantity đã là SL/người,
--   actual_time_spent đã là số giờ của ca.
--
-- LƯU Ý KHỚP MÃ: join theo product_code là CHÍNH XÁC, phân biệt hoa/thường và khoảng trắng.
-- Nếu mã trong Excel định mức lệch hoa/thường hoặc dư khoảng trắng so với mã trong lệnh,
-- nó sẽ bị coi là "chưa có định mức" (GATE bên dưới bắt được). Hãy chuẩn hoá mã trước khi nạp.

-- ============================================================
-- BƯỚC 0 (DRY-RUN, chỉ đọc — chạy từng SELECT để xem trước; chưa ghi gì)
-- ============================================================
-- 0a. GATE: mã trong lệnh nhưng CHƯA có định mức thật. PHẢI rỗng thì Bước 1 mới cập nhật.
SELECT DISTINCT o.product_code
FROM production_orders o
LEFT JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
WHERE pc.product_code IS NULL
ORDER BY o.product_code;

-- 0b. Xem trước standard_time cũ ↔ mới (lệnh)
SELECT o.order_code, o.product_code,
       o.standard_time_per_unit AS std_cu,
       ROUND((1.0 / pc.capacity_per_hour)::numeric, 6) AS std_moi
FROM production_orders o
JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
ORDER BY o.created_at DESC LIMIT 50;

-- 0c. Xem trước performance_rate cũ ↔ mới (log)
SELECT l.id, o.product_code, l.actual_quantity, l.actual_time_spent,
       l.performance_rate AS perf_cu,
       ROUND((l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100) AS perf_moi
FROM production_logs l
JOIN production_orders o ON o.id = l.order_id
JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
WHERE l.actual_time_spent > 0
ORDER BY l.execution_date DESC LIMIT 50;

-- 0d. Log KHÔNG tính lại được (giờ = 0/null) — rà tay, sẽ giữ nguyên số cũ
SELECT l.id, o.product_code, l.actual_quantity, l.actual_time_spent, l.performance_rate
FROM production_logs l
JOIN production_orders o ON o.id = l.order_id
WHERE l.actual_time_spent IS NULL OR l.actual_time_spent <= 0;

-- ============================================================
-- BƯỚC 1: ÁP DỤNG — bôi đen TOÀN BỘ khối DO $$ ... $$; bên dưới rồi bấm Run 1 LẦN.
-- ------------------------------------------------------------
-- Khối này là 1 câu lệnh duy nhất (không thể bấm lẻ, không lo COMMIT rơi rớt):
--   1) Tự backup 2 bảng (IF NOT EXISTS — chạy lại vẫn giữ backup gốc, an toàn/idempotent).
--   2) GATE: nếu còn mã chưa có định mức thật → RAISE EXCEPTION → TỰ ROLLBACK toàn bộ,
--      KHÔNG lưu gì. Hãy bổ sung Excel định mức rồi chạy lại.
--   3) Cập nhật standard_time_per_unit trên mọi lệnh + tính lại performance_rate mọi log.
-- Chạy lại nhiều lần vô hại (kết quả idempotent — tính từ actual_quantity/actual_time_spent gốc).
-- ============================================================
DO $$
DECLARE
  uncovered  int;
  n_orders   int;
  n_logs     int;
BEGIN
  -- 1) Backup (giữ nguyên bản gốc nếu đã tồn tại)
  CREATE TABLE IF NOT EXISTS bak_production_orders_20260708 AS SELECT * FROM production_orders;
  CREATE TABLE IF NOT EXISTS bak_production_logs_20260708   AS SELECT * FROM production_logs;

  -- 2) GATE phủ 100%
  SELECT count(*) INTO uncovered
  FROM production_orders o
  LEFT JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
  WHERE pc.product_code IS NULL;

  IF uncovered > 0 THEN
    RAISE EXCEPTION
      'DUNG: con % lenh chua co dinh muc that. Bo sung Excel dinh muc roi chay lai. (Da tu rollback, KHONG luu gi.)',
      uncovered;
  END IF;

  -- 3a) Cập nhật định mức trên lệnh
  UPDATE production_orders o
  SET standard_time_per_unit = 1.0 / pc.capacity_per_hour
  FROM product_capacities pc
  WHERE pc.product_code = o.product_code AND pc.capacity_per_hour > 0;
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  -- 3b) Tính lại hiệu suất log (đúng công thức app)
  UPDATE production_logs l
  SET performance_rate = ROUND(
        (l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100
      )
  FROM production_orders o, product_capacities pc
  WHERE l.order_id = o.id
    AND o.product_code = pc.product_code
    AND pc.capacity_per_hour > 0
    AND l.actual_time_spent > 0;
  GET DIAGNOSTICS n_logs = ROW_COUNT;

  RAISE NOTICE 'XONG: cap nhat % lenh, tinh lai % log. Backup: bak_production_orders_20260708 / bak_production_logs_20260708.',
    n_orders, n_logs;
END $$;

-- ============================================================
-- BƯỚC 2: KIỂM CHỨNG SAU KHI CHẠY (chạy các SELECT này để xác nhận)
-- ============================================================
-- 2a. Không còn lệnh nào thiếu định mức (kỳ vọng = 0)
SELECT count(*) AS lenh_chua_co_dinh_muc
FROM production_orders o
LEFT JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
WHERE pc.product_code IS NULL;

-- 2b. Không còn lệnh nào dính 0.05 giả (trừ khi định mức thật đúng bằng 0.05 = 20 SP/giờ)
SELECT count(*) AS lenh_con_005 FROM production_orders WHERE standard_time_per_unit = 0.05;

-- ============================================================
-- ROLLBACK KHẨN (nếu cần huỷ sau khi đã áp): phục hồi từ backup
-- ============================================================
-- UPDATE production_orders o SET standard_time_per_unit = b.standard_time_per_unit
--   FROM bak_production_orders_20260708 b WHERE b.id = o.id;
-- UPDATE production_logs l SET performance_rate = b.performance_rate
--   FROM bak_production_logs_20260708 b WHERE b.id = l.id;
