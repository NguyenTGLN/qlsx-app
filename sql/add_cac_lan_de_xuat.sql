-- ============================================================
-- Đề xuất bảo hành NHIỀU LẦN: cột "các_lần_đề_xuất" (JSONB) trên xu_ly_phieu_bao_hanh.
-- Mỗi phần tử = 1 lần đề xuất: { lần, thời_điểm_tạo, người_tạo, đã_hủy, dữ_liệu:{...snapshot} }.
-- App làm chủ hoàn toàn (không đẩy CS, trigger mirror KHÔNG đụng). Chạy trong Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "các_lần_đề_xuất" JSONB DEFAULT '[]'::jsonb;
