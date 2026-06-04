-- ============================================================
-- TRIGGER: Tự động đồng bộ luu_xuat → so_luong_ban
-- ============================================================
-- Luồng dữ liệu:
--   App ghi vào luu_xuat (bảng chính)
--   → Trigger tự copy sang so_luong_ban (bảng lịch sử / bảo hành)
--
-- Cách chạy: Mở Supabase Dashboard → SQL Editor → Paste & Run
-- ============================================================

-- 1. Tạo function xử lý trigger
CREATE OR REPLACE FUNCTION sync_luu_xuat_to_so_luong_ban()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO so_luong_ban (ngay_xuat, ma_san_pham, ten_san_pham, so_luong, ma_don_hang)
  VALUES (NEW.ngay_xuat, NEW.ma_san_pham, NEW.ten_san_pham, NEW.so_luong, NEW.ma_don_hang);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Xóa trigger cũ nếu đã tồn tại (cả hướng cũ lẫn mới)
DROP TRIGGER IF EXISTS trg_sync_so_luong_ban_to_luu_xuat ON so_luong_ban;
DROP TRIGGER IF EXISTS trg_sync_luu_xuat_to_so_luong_ban ON luu_xuat;

-- 3. Xóa function cũ nếu đã tồn tại
DROP FUNCTION IF EXISTS sync_to_luu_xuat();

-- 4. Tạo trigger — kích hoạt khi INSERT vào luu_xuat
CREATE TRIGGER trg_sync_luu_xuat_to_so_luong_ban
  AFTER INSERT ON luu_xuat
  FOR EACH ROW
  EXECUTE FUNCTION sync_luu_xuat_to_so_luong_ban();

-- ============================================================
-- KIỂM TRA: Sau khi chạy, bạn có thể test bằng cách:
--   INSERT INTO luu_xuat (ngay_xuat, ma_san_pham, ten_san_pham, so_luong, ma_don_hang)
--   VALUES ('2025-01-01', 'TEST-001', 'Sản phẩm test trigger', 1, 'DH-TEST');
--
--   SELECT * FROM so_luong_ban WHERE ma_san_pham = 'TEST-001';
--   (Nếu thấy dữ liệu → Trigger hoạt động OK)
--
--   -- Xóa dữ liệu test:
--   DELETE FROM luu_xuat WHERE ma_san_pham = 'TEST-001';
--   DELETE FROM so_luong_ban WHERE ma_san_pham = 'TEST-001';
-- ============================================================
