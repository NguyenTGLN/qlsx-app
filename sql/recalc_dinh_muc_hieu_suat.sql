-- Tính lại định mức chuẩn cho Lệnh SX cũ + tính lại hiệu suất log cũ.
-- CHẠY SAU KHI đã nạp Excel định mức thật vào product_capacities.
-- Chạy trong Supabase SQL Editor, theo từng bước; KHÔNG chạy cả file một lần.
--
-- Công thức khớp app (WorkerInput.jsx):
--   performance_rate = round( (actual_quantity / actual_time_spent) * standard_time * 100 )
--   trong đó standard_time = 1 / capacity_per_hour, actual_quantity đã là SL/người,
--   actual_time_spent đã là số giờ của ca.

-- ============================================================
-- BƯỚC 0 (DRY-RUN, chỉ đọc — chưa ghi gì)
-- ============================================================
-- 0a. GATE: mã trong lệnh nhưng CHƯA có định mức thật. PHẢI rỗng mới được chạy tiếp.
SELECT DISTINCT o.product_code
FROM production_orders o
LEFT JOIN product_capacities pc ON pc.product_code = o.product_code
WHERE pc.product_code IS NULL OR pc.capacity_per_hour IS NULL OR pc.capacity_per_hour <= 0
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
-- BƯỚC 1: BACKUP (chạy 1 lần; đổi hậu tố ngày nếu cần)
-- ============================================================
CREATE TABLE bak_production_orders_20260708 AS SELECT * FROM production_orders;
CREATE TABLE bak_production_logs_20260708   AS SELECT * FROM production_logs;

-- ============================================================
-- BƯỚC 2: CẬP NHẬT (bọc transaction — chỉ COMMIT khi GATE 0a rỗng)
-- ============================================================
BEGIN;

-- 2a. Cập nhật định mức trên lệnh
UPDATE production_orders o
SET standard_time_per_unit = 1.0 / pc.capacity_per_hour
FROM product_capacities pc
WHERE pc.product_code = o.product_code AND pc.capacity_per_hour > 0;

-- 2b. Tính lại hiệu suất log (đúng công thức app: (SL/người ÷ giờ) × giờ_chuẩn × 100)
UPDATE production_logs l
SET performance_rate = ROUND(
      (l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100
    )
FROM production_orders o, product_capacities pc
WHERE l.order_id = o.id
  AND o.product_code = pc.product_code
  AND pc.capacity_per_hour > 0
  AND l.actual_time_spent > 0;

-- 2c. Kiểm chứng TRONG transaction trước khi COMMIT (kỳ vọng lenh_chua_co_dinh_muc = 0)
SELECT
  (SELECT count(*) FROM production_orders) AS tong_lenh,
  (SELECT count(*) FROM production_logs)   AS tong_log,
  (SELECT count(*) FROM production_orders o
     LEFT JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
     WHERE pc.product_code IS NULL) AS lenh_chua_co_dinh_muc;

-- COMMIT;   -- ← bỏ chú thích để LƯU, sau khi xem 2c ổn (lenh_chua_co_dinh_muc = 0)
-- ROLLBACK; -- ← dùng nếu cần HUỶ

-- ============================================================
-- ROLLBACK KHẨN (nếu đã COMMIT nhầm): phục hồi từ backup
-- ============================================================
-- UPDATE production_orders o SET standard_time_per_unit = b.standard_time_per_unit
--   FROM bak_production_orders_20260708 b WHERE b.id = o.id;
-- UPDATE production_logs l SET performance_rate = b.performance_rate
--   FROM bak_production_logs_20260708 b WHERE b.id = l.id;
