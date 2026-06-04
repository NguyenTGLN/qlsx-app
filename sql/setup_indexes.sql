-- Tối ưu hóa truy vấn bảng so_luong_ban (hơn 700k bản ghi)
-- Chạy đoạn script này trong mục SQL Editor của Supabase

-- 1. Index cho việc sắp xếp mặc định (rất quan trọng để tránh Timeout khi tải dữ liệu)
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_created_at ON so_luong_ban(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_ngay_xuat ON so_luong_ban(ngay_xuat DESC);

-- 2. Index cho việc tìm kiếm và lọc dữ liệu (tăng tốc độ tìm kiếm mã sản phẩm, mã đơn hàng)
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_ma_san_pham ON so_luong_ban(ma_san_pham);
CREATE INDEX IF NOT EXISTS idx_so_luong_ban_ma_don_hang ON so_luong_ban(ma_don_hang);

-- 3. Cập nhật lại số liệu thống kê của bảng để PostgreSQL lên kế hoạch truy vấn chính xác hơn
ANALYZE so_luong_ban;
