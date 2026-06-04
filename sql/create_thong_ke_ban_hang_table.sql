-- ============================================================
-- BẢNG TỔNG HỢP: thong_ke_ban_hang
-- ============================================================
-- Mục đích: Lưu dữ liệu bán hàng đã aggregate theo (tháng, mã SP)
-- Luồng: luu_xuat → [Trigger 1 đã có] → so_luong_ban → [Trigger 2] → thong_ke_ban_hang
-- App Warranty chỉ cần đọc bảng này (~7K rows thay vì 730K)
--
-- Cách chạy: Mở Supabase Dashboard → SQL Editor → Paste & Run
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- BƯỚC 1: Tạo bảng
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.thong_ke_ban_hang (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,                -- 'YYYY-MM'
  ma_san_pham TEXT NOT NULL,
  ten_san_pham TEXT,
  so_luong NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, ma_san_pham)          -- Đảm bảo mỗi combo tháng+SP chỉ 1 dòng
);

-- Index để tăng tốc đọc
CREATE INDEX IF NOT EXISTS idx_thong_ke_month ON public.thong_ke_ban_hang (month);
CREATE INDEX IF NOT EXISTS idx_thong_ke_ma_sp ON public.thong_ke_ban_hang (ma_san_pham);

-- ═══════════════════════════════════════════════════════════
-- BƯỚC 2: Populate từ dữ liệu hiện có (chạy 1 lần)
-- ═══════════════════════════════════════════════════════════
-- Dedup bảng so_luong_ban rồi aggregate theo tháng + mã SP
INSERT INTO public.thong_ke_ban_hang (month, ma_san_pham, ten_san_pham, so_luong)
SELECT 
  TO_CHAR(ngay_xuat, 'YYYY-MM') as month,
  ma_san_pham,
  MAX(ten_san_pham) as ten_san_pham,
  SUM(so_luong) as so_luong
FROM (
  SELECT DISTINCT 
    ma_don_hang,
    ma_san_pham,
    ngay_xuat,
    ten_san_pham,
    so_luong
  FROM public.so_luong_ban
  WHERE ngay_xuat IS NOT NULL
    AND ma_san_pham IS NOT NULL
) deduped
GROUP BY TO_CHAR(ngay_xuat, 'YYYY-MM'), ma_san_pham
ON CONFLICT (month, ma_san_pham) DO UPDATE 
  SET so_luong = EXCLUDED.so_luong,
      ten_san_pham = EXCLUDED.ten_san_pham,
      updated_at = now();

-- ═══════════════════════════════════════════════════════════
-- BƯỚC 3: Trigger 2 — so_luong_ban → thong_ke_ban_hang
-- ═══════════════════════════════════════════════════════════
-- Mỗi khi có INSERT mới vào so_luong_ban (từ trigger 1),
-- tự động cộng dồn vào bảng tổng hợp

CREATE OR REPLACE FUNCTION public.sync_so_luong_ban_to_thong_ke()
RETURNS TRIGGER AS $$
BEGIN
  -- Chỉ xử lý khi có đủ thông tin
  IF NEW.ngay_xuat IS NOT NULL AND NEW.ma_san_pham IS NOT NULL THEN
    INSERT INTO public.thong_ke_ban_hang (month, ma_san_pham, ten_san_pham, so_luong)
    VALUES (
      TO_CHAR(NEW.ngay_xuat, 'YYYY-MM'),
      NEW.ma_san_pham,
      NEW.ten_san_pham,
      NEW.so_luong
    )
    ON CONFLICT (month, ma_san_pham) DO UPDATE 
      SET so_luong = thong_ke_ban_hang.so_luong + EXCLUDED.so_luong,
          ten_san_pham = COALESCE(EXCLUDED.ten_san_pham, thong_ke_ban_hang.ten_san_pham),
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Xóa trigger cũ nếu tồn tại
DROP TRIGGER IF EXISTS trg_sync_to_thong_ke ON public.so_luong_ban;

-- Tạo trigger mới
CREATE TRIGGER trg_sync_to_thong_ke
  AFTER INSERT ON public.so_luong_ban
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_so_luong_ban_to_thong_ke();

-- ═══════════════════════════════════════════════════════════
-- BƯỚC 4: Cấp quyền truy cập
-- ═══════════════════════════════════════════════════════════
GRANT SELECT ON public.thong_ke_ban_hang TO anon;
GRANT SELECT ON public.thong_ke_ban_hang TO authenticated;

-- ⚠️ RLS: Supabase bật RLS mặc định cho bảng mới
-- Cần tạo policy cho phép đọc, nếu không anon sẽ không thấy dữ liệu
ALTER TABLE public.thong_ke_ban_hang ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read thong_ke" ON public.thong_ke_ban_hang
  FOR SELECT USING (true);
CREATE POLICY "Allow public insert thong_ke" ON public.thong_ke_ban_hang
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update thong_ke" ON public.thong_ke_ban_hang
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════
-- KIỂM TRA (sau khi chạy xong):
-- ═══════════════════════════════════════════════════════════
-- 1. Kiểm tra số dòng:
--    SELECT COUNT(*) FROM thong_ke_ban_hang;
--    → Kỳ vọng: ~7K rows
--
-- 2. Xem dữ liệu mẫu:
--    SELECT * FROM thong_ke_ban_hang ORDER BY month DESC LIMIT 20;
--
-- 3. Test trigger chain:
--    INSERT INTO luu_xuat (ngay_xuat, ma_san_pham, ten_san_pham, so_luong, ma_don_hang)
--    VALUES ('2026-05-05', 'TEST-TRIGGER', 'Test trigger chain', 1, 'DH-TEST');
--
--    SELECT * FROM so_luong_ban WHERE ma_san_pham = 'TEST-TRIGGER';
--    SELECT * FROM thong_ke_ban_hang WHERE ma_san_pham = 'TEST-TRIGGER';
--    (Nếu cả 2 đều thấy dữ liệu → Chuỗi trigger hoạt động OK)
--
--    -- Xóa dữ liệu test:
--    DELETE FROM luu_xuat WHERE ma_san_pham = 'TEST-TRIGGER';
--    DELETE FROM so_luong_ban WHERE ma_san_pham = 'TEST-TRIGGER';
--    DELETE FROM thong_ke_ban_hang WHERE ma_san_pham = 'TEST-TRIGGER';
-- ═══════════════════════════════════════════════════════════
