-- Tạo bảng lưu trữ lịch sử bốc dỡ kho
CREATE TABLE public.inventory_picking_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    order_code VARCHAR(100) NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    component_code VARCHAR(100) NOT NULL,
    component_name TEXT,
    location VARCHAR(100),
    quantity_before NUMERIC NOT NULL,
    quantity_taken NUMERIC NOT NULL,
    quantity_after NUMERIC NOT NULL,
    created_by VARCHAR(255),
    notes TEXT
);

-- Bật Row Level Security (nếu cần)
ALTER TABLE public.inventory_picking_logs ENABLE ROW LEVEL SECURITY;

-- Cho phép tất cả các thao tác (vì đang ở giai đoạn dev)
CREATE POLICY "Cho phép tất cả thao tác trên picking_logs"
    ON public.inventory_picking_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);
