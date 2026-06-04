-- Bảng lưu trữ lịch sử đề xuất mua hàng
CREATE TABLE IF NOT EXISTS public.purchase_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    item_code TEXT NOT NULL,
    item_name TEXT,
    calculated_qty NUMERIC DEFAULT 0,
    actual_qty NUMERIC DEFAULT 0,
    note TEXT,
    batch_id UUID DEFAULT gen_random_uuid() -- Dùng để gom nhóm các đề xuất lưu cùng 1 lần
);

-- Phân quyền RLS
ALTER TABLE public.purchase_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép xem tất cả đề xuất" 
ON public.purchase_proposals FOR SELECT USING (true);

CREATE POLICY "Cho phép thêm đề xuất" 
ON public.purchase_proposals FOR INSERT WITH CHECK (true);

CREATE POLICY "Cho phép cập nhật đề xuất" 
ON public.purchase_proposals FOR UPDATE USING (true);

CREATE POLICY "Cho phép xóa đề xuất" 
ON public.purchase_proposals FOR DELETE USING (true);
