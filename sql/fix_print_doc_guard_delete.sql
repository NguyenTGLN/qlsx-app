-- ============================================================
-- BỔ SUNG: quyền DELETE cho print_doc_guard
-- ------------------------------------------------------------
-- Bản create_print_doc_guard.sql chạy lần đầu thiếu quyền DELETE nên
-- releaseDocToken (nhả token khi thao tác lỗi để lưu lại được) không xóa được.
-- Chạy đoạn này 1 lần trên Supabase SQL Editor để vá.
-- (Nếu sau này chạy lại create_print_doc_guard.sql bản mới thì không cần file này.)
-- ============================================================

GRANT DELETE ON public.print_doc_guard TO anon;
GRANT DELETE ON public.print_doc_guard TO authenticated;

DROP POLICY IF EXISTS "print_doc_guard_delete" ON public.print_doc_guard;
CREATE POLICY "print_doc_guard_delete" ON public.print_doc_guard FOR DELETE USING (true);

-- Dọn dòng test do quá trình kiểm thử để lại (nếu có)
DELETE FROM public.print_doc_guard WHERE batch_token = 'verify-claude-doc-guard-001';
