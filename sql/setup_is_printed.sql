-- Bổ sung trạng thái In ấn cho bảng lịch sử bốc dỡ kho
ALTER TABLE public.inventory_picking_logs 
ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;

-- Cập nhật các phiếu cũ thành "Đã in" để không làm rối dữ liệu lịch sử
UPDATE public.inventory_picking_logs 
SET is_printed = true 
WHERE is_printed IS false;
