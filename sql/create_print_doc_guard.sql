-- ============================================================
-- BẢNG KHÓA CHỐNG TRÙNG CHỨNG TỪ CHỜ IN: print_doc_guard
-- ============================================================
-- Mục đích: đảm bảo TUYỆT ĐỐI một lần điền phiếu (nhập/xuất kho) chỉ
-- tạo ra ĐÚNG 1 chứng từ chờ in — dù người dùng bấm nút nhiều lần,
-- tải lại trang, mở nhiều tab, hay mạng gửi lại request.
--
-- Cơ chế: mỗi phiếu đang thao tác được app cấp 1 "batch_token" duy nhất.
-- Trước khi ghi picking-log (và trừ/cộng kho), app INSERT token này vào
-- bảng khóa. batch_token là KHÓA CHÍNH → lần thứ 2 với cùng token sẽ bị
-- Postgres từ chối (lỗi 23505). App bắt lỗi đó và báo "đã tạo rồi",
-- KHÔNG trừ kho / KHÔNG tạo chứng từ lần nữa.
--
-- Cách chạy: Mở Supabase Dashboard → SQL Editor → Paste & Run.
-- Chạy 1 lần là đủ (idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.print_doc_guard (
  batch_token TEXT PRIMARY KEY,          -- token duy nhất của 1 lần điền phiếu (uuid do app sinh)
  order_code  TEXT,                      -- mã chứng từ đã tạo (PNK/PXK/PDH/PSX/PPR...) — để báo lại khi trùng
  kind        TEXT,                      -- loại thao tác (import / production / delivery / manual_export / disassemble / worker_import)
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tra cứu nhanh theo mã chứng từ (khi cần đối chiếu)
CREATE INDEX IF NOT EXISTS idx_print_doc_guard_order_code ON public.print_doc_guard (order_code);

-- ── Quyền truy cập ─────────────────────────────────────────
-- App hiện dùng anon key (theo hiện trạng đã rollback mở anon cho nghiệp vụ).
-- DELETE cần thiết cho releaseDocToken (nhả token khi thao tác lỗi để lưu lại được).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_doc_guard TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_doc_guard TO authenticated;

ALTER TABLE public.print_doc_guard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "print_doc_guard_select" ON public.print_doc_guard;
DROP POLICY IF EXISTS "print_doc_guard_insert" ON public.print_doc_guard;
DROP POLICY IF EXISTS "print_doc_guard_update" ON public.print_doc_guard;
DROP POLICY IF EXISTS "print_doc_guard_delete" ON public.print_doc_guard;

CREATE POLICY "print_doc_guard_select" ON public.print_doc_guard FOR SELECT USING (true);
CREATE POLICY "print_doc_guard_insert" ON public.print_doc_guard FOR INSERT WITH CHECK (true);
CREATE POLICY "print_doc_guard_update" ON public.print_doc_guard FOR UPDATE USING (true);
CREATE POLICY "print_doc_guard_delete" ON public.print_doc_guard FOR DELETE USING (true);

-- ============================================================
-- KIỂM TRA (sau khi chạy):
--   -- Chèn thử 1 token:
--   INSERT INTO print_doc_guard (batch_token, order_code, kind) VALUES ('test-token-1','PNK-TEST','import');
--   -- Chèn lại CÙNG token → phải báo lỗi "duplicate key ... 23505":
--   INSERT INTO print_doc_guard (batch_token, order_code, kind) VALUES ('test-token-1','PNK-TEST-2','import');
--   -- Dọn:
--   DELETE FROM print_doc_guard WHERE batch_token = 'test-token-1';
-- ============================================================
