-- ============================================================
-- BẢNG DKSX: Nhu cầu sản xuất thành phẩm (trung gian giữa Tồn HH và Đề xuất DLK)
-- Chạy trong Supabase SQL Editor
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code   TEXT NOT NULL,                 -- mã thành phẩm cần sản xuất
  item_name   TEXT,
  unit        TEXT,
  qty_demand  NUMERIC NOT NULL DEFAULT 0,     -- SL CÒN cần sản xuất (max khi đề xuất, trừ dần khi làm phiếu SX)
  ngay_de_xuat DATE,
  trang_thai  TEXT DEFAULT 'Mới',             -- Mới / Đang SX / Hoàn thành / Hủy
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 1 mã thành phẩm chỉ có 1 dòng demand đang mở → dùng upsert theo item_code
CREATE UNIQUE INDEX IF NOT EXISTS uq_prod_demand_item ON public.production_demand(item_code);

ALTER TABLE public.production_demand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "full access prod_demand" ON public.production_demand;
CREATE POLICY "full access prod_demand" ON public.production_demand FOR ALL USING (true) WITH CHECK (true);

-- KIỂM TRA:
-- SELECT * FROM public.production_demand;
