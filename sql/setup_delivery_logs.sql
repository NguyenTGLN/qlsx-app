-- Bảng lưu trữ chi tiết đơn hàng xuất kho
CREATE TABLE IF NOT EXISTS public.delivery_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ticket_code TEXT NOT NULL, -- Mã phiếu xuất (VD: PDH-20240101-01)
    order_code TEXT NOT NULL,  -- Mã đơn hàng (VD: VNA02403...)
    product_code TEXT NOT NULL,
    product_name TEXT,
    quantity NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by TEXT
);

-- Tạo index để query nhanh theo mã phiếu và mã đơn hàng
CREATE INDEX IF NOT EXISTS idx_delivery_logs_ticket ON public.delivery_logs(ticket_code);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_order ON public.delivery_logs(order_code);
