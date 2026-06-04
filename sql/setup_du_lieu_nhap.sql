-- Tạo bảng Dữ liệu nhập (du_lieu_nhap)
CREATE TABLE IF NOT EXISTS public.du_lieu_nhap (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ngay_nhap DATE NOT NULL,
    ma_hang TEXT NOT NULL,
    ten_hang TEXT,
    so_luong_nhap NUMERIC NOT NULL DEFAULT 0,
    ma_ncc TEXT,
    kho_nhap TEXT,
    ly_do_nhap TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật RLS (Row Level Security)
ALTER TABLE public.du_lieu_nhap ENABLE ROW LEVEL SECURITY;

-- Tạo policy cho phép tất cả mọi người đọc/ghi (giống như các bảng khác trong app)
CREATE POLICY "Cho phép tất cả thao tác trên du_lieu_nhap" 
ON public.du_lieu_nhap
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Tạo Index để tối ưu tìm kiếm theo mã hàng và ngày nhập
CREATE INDEX IF NOT EXISTS idx_du_lieu_nhap_ma_hang ON public.du_lieu_nhap(ma_hang);
CREATE INDEX IF NOT EXISTS idx_du_lieu_nhap_ngay_nhap ON public.du_lieu_nhap(ngay_nhap);
