-- ============================================================
-- Xử lý phiếu bảo hành NHIỀU LẦN: cột "các_lần" (JSONB) trên xu_ly_phieu_bao_hanh.
-- Mỗi phần tử = 1 lần xử lý (1 nhiệm vụ/biên bản CNV riêng), id ghép = <số phiếu>-<lần>.
-- Phần B (app làm chủ) — trigger mirror KHÔNG đụng. Chạy trong Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "các_lần" JSONB DEFAULT '[]'::jsonb;
