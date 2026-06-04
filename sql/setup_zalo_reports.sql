-- ============================================================
-- BƯỚC 1: Tạo bảng zalo_duty_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.zalo_duty_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  nguoi_nhap            text,
  tong_cuoc_hoi_thoai   integer NOT NULL DEFAULT 0,
  da_tra_loi            integer NOT NULL DEFAULT 0,
  chua_tra_loi          integer NOT NULL DEFAULT 0,
  ghi_chu               text,
  image_url             text,
  image_path            text
);

-- ============================================================
-- BƯỚC 2: Bật Row Level Security và cho phép đọc/ghi public
-- (dùng cho anon key - phù hợp với cách app đang dùng)
-- ============================================================
ALTER TABLE public.zalo_duty_reports ENABLE ROW LEVEL SECURITY;

-- Cho phép đọc (SELECT) không cần auth
CREATE POLICY "Allow public read zalo_duty_reports"
  ON public.zalo_duty_reports
  FOR SELECT
  USING (true);

-- Cho phép ghi (INSERT) không cần auth
CREATE POLICY "Allow public insert zalo_duty_reports"
  ON public.zalo_duty_reports
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- BƯỚC 3: Tạo Storage Bucket "zalo-reports"
-- (Chạy lệnh này hoặc tạo thủ công qua Supabase Dashboard)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('zalo-reports', 'zalo-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Cho phép upload ảnh (INSERT) vào bucket
CREATE POLICY "Allow public upload zalo-reports"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'zalo-reports');

-- Cho phép đọc ảnh (SELECT) từ bucket
CREATE POLICY "Allow public read zalo-reports"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'zalo-reports');
