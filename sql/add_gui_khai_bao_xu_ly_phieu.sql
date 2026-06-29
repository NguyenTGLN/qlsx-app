-- ============================================================
-- Thêm cột cho tính năng "Gửi Form khai báo bảo hành" (tab Xử lý phiếu).
-- Phần B (app làm chủ) — trigger mirror Phần A KHÔNG đụng tới.
-- Chạy trong Supabase SQL Editor TRƯỚC khi deploy bản web mới.
-- ============================================================

ALTER TABLE public.xu_ly_phieu_bao_hanh
  -- Có thời điểm ⇒ đã gửi form khai báo (badge "Đã gửi form khai báo bảo hành").
  ADD COLUMN IF NOT EXISTS "thời_điểm_gửi_khai_báo"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "người_gửi_khai_báo"         TEXT,
  -- 3 dòng trạng thái hiển thị trên phiếu. Khởi tạo khi gửi; luồng cập nhật sau ghi đè.
  ADD COLUMN IF NOT EXISTS "trạng_thái_xác_nhận_online" TEXT,
  ADD COLUMN IF NOT EXISTS "trạng_thái_thanh_toán"      TEXT;
