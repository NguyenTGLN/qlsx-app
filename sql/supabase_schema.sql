-- ==============================================
-- SCHEMA CHO APP QUẢN LÝ SẢN XUẤT V3 (THỜI GIAN THỰC)
-- Chạy toàn bộ nếu cài mới. Hoặc chạy phần CẬP NHẬT nếu đã có cài bản cũ.
-- ==============================================

-- 1. BẢNG NHÂN SỰ / NGƯỜI DÙNG ( workers )
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_code TEXT UNIQUE NOT NULL, 
  password_hash TEXT NOT NULL,      
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'worker',       
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. BẢNG LỆNH SẢN XUẤT ( production_orders )
CREATE TABLE IF NOT EXISTS public.production_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT UNIQUE NOT NULL,        
  product_code TEXT NOT NULL,             
  target_quantity NUMERIC NOT NULL,       
  standard_time_per_unit NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',          
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. BẢNG NHẬT KÝ SẢN XUẤT ( production_logs )
CREATE TABLE IF NOT EXISTS public.production_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.production_orders(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  execution_date DATE DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  actual_quantity NUMERIC NOT NULL,
  actual_time_spent NUMERIC NOT NULL,     
  workers_count INTEGER DEFAULT 1,        
  performance_rate NUMERIC NOT NULL,      
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. BẢNG NĂNG LỰC SẢN XUẤT ( product_capacities )
CREATE TABLE IF NOT EXISTS public.product_capacities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT,
  capacity_per_hour NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- BẢO MẬT CƠ BẢN RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_capacities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.workers;
DROP POLICY IF EXISTS "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.production_orders;
DROP POLICY IF EXISTS "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.production_logs;
DROP POLICY IF EXISTS "policy_capacities" ON public.product_capacities;

CREATE POLICY "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.workers FOR ALL USING (true);
CREATE POLICY "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.production_orders FOR ALL USING (true);
CREATE POLICY "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.production_logs FOR ALL USING (true);
CREATE POLICY "policy_capacities" ON public.product_capacities FOR ALL USING (true);

-- =========================================================================
-- ĐOẠN MÃ DÀNH CHO BẠN (CẬP NHẬT DATABASE CŨ ĐỂ KHÔNG BỊ XÓA DATA):
-- CHẠY RIÊNG 2 DÒNG DƯỚI ĐÂY ĐỂ NÂNG CẤP LÊN BẢN CÓ QUẢN LÝ THỜI GIAN
-- =========================================================================
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE public.production_logs ADD COLUMN IF NOT EXISTS end_time TIME;
NOTIFY pgrst, 'reload_schema';

-- ==============================================
-- 5. BẢNG SỐ LƯỢNG BÁN ( so_luong_ban )
-- ==============================================
CREATE TABLE IF NOT EXISTS public.so_luong_ban (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ngay_xuat DATE NOT NULL,
  ma_san_pham TEXT NOT NULL,
  ten_san_pham TEXT,
  so_luong NUMERIC NOT NULL DEFAULT 0,
  ma_don_hang TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.so_luong_ban ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.so_luong_ban;
CREATE POLICY "Cho phép truy cập toàn quyền (Tạm thời cho nội bộ)" ON public.so_luong_ban FOR ALL USING (true);

-- ==============================================
-- 6. VIEW THỐNG KÊ DOANH SỐ ĐỂ GIẢM TẢI 730.000+ DÒNG
-- ==============================================
CREATE OR REPLACE VIEW public.view_thong_ke_ban_hang AS
WITH deduped AS (
    SELECT DISTINCT 
        ma_don_hang,
        ma_san_pham,
        ngay_xuat,
        ten_san_pham,
        so_luong
    FROM public.so_luong_ban
    WHERE ngay_xuat IS NOT NULL
)
SELECT 
    TO_CHAR(ngay_xuat, 'YYYY-MM') as month,
    ma_san_pham,
    MAX(ten_san_pham) as ten_san_pham,
    SUM(so_luong) as so_luong
FROM deduped
GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), ma_san_pham;

-- Cấp quyền truy cập View
GRANT SELECT ON public.view_thong_ke_ban_hang TO anon;
GRANT SELECT ON public.view_thong_ke_ban_hang TO authenticated;
