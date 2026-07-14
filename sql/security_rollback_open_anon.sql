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
