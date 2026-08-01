-- ############################################################
-- ##  ⛔ NGUY HIỂM — ĐỪNG CHẠY TỆP NÀY TRỪ KHI ĐANG CHỮA SỰ CỐ  ##
-- ############################################################
--
-- Chạy tệp này sẽ MỞ TOANG toàn bộ bảng nghiệp vụ cho `anon` — tức là cho bất kỳ ai
-- cầm khoá công khai nằm sẵn trong mã nguồn (Ctrl+U trang web là thấy). Nó xoá mọi
-- policy hiện có và thay bằng `open_all ... using(true)`, rồi `grant all to anon`.
--
-- Đây chính là trạng thái mà ngày 28/07/2026 đã mất trọn một ngày để đóng lại, sau
-- khi phát hiện 47 bảng mở toang, 396 ảnh căn cước tải được tự do, mật khẩu lưu thô.
--
-- Rà soát 29/07/2026 ghi nhận tệp này vẫn nằm đây, chạy lại được, không có dấu hiệu
-- cảnh báo nào. Nay có rồi.
--
-- TRƯỚC KHI CHẠY, phải trả lời được:
--   1. App thứ hai đó CÒN TỒN TẠI không? Nếu đã bỏ thì không có lý do gì chạy tệp này.
--   2. Có cách nào khác không — cấp token cho app đó, hay viết RPC SECURITY DEFINER
--      chỉ trả đúng phần dữ liệu nó cần?
--   3. Nếu buộc phải chạy: chạy xong ĐO NGAY bằng khoá công khai xem lộ những gì,
--      và đặt hạn chót đóng lại.
--
-- ============================================================
-- KHÔI PHỤC TẠM: mở lại quyền cho anon để app thứ hai (dùng anon key) chạy lại.
-- GIỮ NGUYÊN phần bảo vệ mật khẩu: nhan_vien_secret vẫn khoá, cột password đã xoá.
-- Đây là bước LÙI bảo mật cho dữ liệu nghiệp vụ, chờ nâng cấp app thứ hai dùng token.
-- Chạy 2 phần riêng (như security_3) để tránh lỗi giả của SQL Editor.
-- ============================================================

-- PHẦN 1 — Đưa policy về mở cho mọi vai trò (public), trừ bảng bí mật.
do $$
declare r record; drops text;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename <> 'nhan_vien_secret'
  loop
    select coalesce(string_agg(
             format('drop policy if exists %I on public.%I;', policyname, r.tablename), ' '), '')
      into drops from pg_policies where schemaname='public' and tablename=r.tablename;
    if drops <> '' then execute drops; end if;
    execute format('create policy open_all on public.%I for all using (true) with check (true);', r.tablename);
  end loop;
end $$;

-- PHẦN 2 — Cấp lại quyền cho anon; giữ bảng bí mật khoá tuyệt đối.
grant all           on all tables    in schema public to anon;
grant usage, select on all sequences in schema public to anon;
grant execute       on all functions in schema public to anon;
revoke all on public.nhan_vien_secret from anon, authenticated;
