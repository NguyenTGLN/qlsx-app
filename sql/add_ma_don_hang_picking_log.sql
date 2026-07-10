-- Thêm cột "Mã đơn hàng" vào bảng inventory_picking_logs.
-- Phiếu nhập kho được IN LẠI ở tab "Quản Lý Chứng Từ" dựng lại từ bảng này, nên
-- mã đơn hàng nhập tay (loại "Khác" / "Nhập mới") phải được lưu ở đây thì bản in
-- lại mới hiển thị được cột "Mã đơn hàng". (du_lieu_nhap.ma_don_hang_nhap không có
-- khóa nối với order_code của phiếu nên không dùng để in lại được.)
ALTER TABLE public.inventory_picking_logs
  ADD COLUMN IF NOT EXISTS ma_don_hang TEXT;
