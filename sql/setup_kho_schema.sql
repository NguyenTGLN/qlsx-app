-- ==============================================
-- SCHEMA CHO MODULE KHO - QUẢN LÝ TỒN KHO & LẮP RÁP BOM
-- ==============================================

-- 1. BẢNG DANH MỤC HÀNG HÓA (từ file: danh muc hang hoa.csv)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  item_code TEXT PRIMARY KEY,               -- Mã hàng (ví dụ: 030S-COCKDECO)
  item_name TEXT NOT NULL,                  -- Tên hàng
  unit TEXT,                                -- Đơn vị tính (Cái, Bộ, Cuộn...)
  min_stock_days INTEGER DEFAULT 0,         -- Số ngày Min
  backup_stock_days INTEGER DEFAULT 0,      -- Số ngày tồn kho dự phòng
  warehouse TEXT,                           -- Kho (ví dụ: Kho Chính, Kho bảo hành...)
  lead_time_days INTEGER DEFAULT 0,         -- Lead Time (Số ngày chuẩn bị hàng)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. BẢNG BOM SẢN XUẤT (từ file: BOM san xuat.csv)
CREATE TABLE IF NOT EXISTS public.bom_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT NOT NULL REFERENCES public.inventory_items(item_code) ON DELETE CASCADE,  -- Mã Thành Phẩm
  component_code TEXT NOT NULL REFERENCES public.inventory_items(item_code) ON DELETE CASCADE, -- Mã Linh Kiện
  unit TEXT,                                -- Đơn Vị Tính
  quantity NUMERIC NOT NULL DEFAULT 0,      -- Số Lượng linh kiện cần cho 1 thành phẩm
  product_name TEXT,                        -- Tên SP (Có thể bỏ qua nếu join với inventory_items, nhưng giữ lại để import cho tiện)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo Index để truy vấn BOM nhanh hơn
CREATE INDEX IF NOT EXISTS idx_bom_product_code ON public.bom_items(product_code);
CREATE INDEX IF NOT EXISTS idx_bom_component_code ON public.bom_items(component_code);

-- 3. BẢNG TỒN KHO THỰC TẾ (từ file: ton kho thuc te.csv)
CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code TEXT NOT NULL REFERENCES public.inventory_items(item_code) ON DELETE CASCADE, -- Ma HH
  item_name TEXT,                           -- Ten HH
  unit TEXT,                                -- DVT
  location TEXT,                            -- Vị trí (ví dụ: VP1T4)
  import_date DATE,                         -- Ngày nhập
  quantity NUMERIC NOT NULL DEFAULT 0,      -- SL (Số lượng tồn thực tế)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo Index để truy vấn tồn kho theo mã hàng
CREATE INDEX IF NOT EXISTS idx_stock_item_code ON public.inventory_stock(item_code);


-- ==============================================
-- CÀI ĐẶT BẢO MẬT RLS (Cho phép truy cập toàn quyền)
-- ==============================================
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable full access for all users" ON public.inventory_items;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.bom_items;
DROP POLICY IF EXISTS "Enable full access for all users" ON public.inventory_stock;

CREATE POLICY "Enable full access for all users" ON public.inventory_items FOR ALL USING (true);
CREATE POLICY "Enable full access for all users" ON public.bom_items FOR ALL USING (true);
CREATE POLICY "Enable full access for all users" ON public.inventory_stock FOR ALL USING (true);
