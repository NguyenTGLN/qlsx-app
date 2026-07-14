-- ============================================================
-- BẢO MẬT — BƯỚC 3/3: SIẾT RLS (khoá cửa thật sự)
-- Chạy trong Supabase SQL Editor SAU KHI đã deploy Phase 2 và đăng nhập live OK.
-- Toàn bộ file chạy trong 1 transaction: lỗi ở đâu là rollback hết, không hỏng nửa vời.
-- ============================================================

-- 1) Mọi bảng public: chỉ 'authenticated' toàn quyền; anon bị chặn.
--    Ngoại lệ: nhan_vien (ghi = chỉ Admin), nhan_vien_secret (đã khoá tuyệt đối - bỏ qua).
do $$
declare r record; drops text;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename <> 'nhan_vien_secret'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);

    -- Xoá MỌI policy cũ (gồm các policy USING(true) đang mở toang)
    select coalesce(string_agg(
             format('drop policy if exists %I on public.%I;', policyname, r.tablename), ' '), '')
      into drops
      from pg_policies where schemaname='public' and tablename=r.tablename;
    if drops <> '' then execute drops; end if;

    if r.tablename = 'nhan_vien' then
      -- Đọc: mọi người đã đăng nhập (để hiện tên/vai trò). Ghi/xoá: chỉ Admin.
      execute 'create policy nv_sel on public.nhan_vien for select to authenticated using (true)';
      execute 'create policy nv_ins on public.nhan_vien for insert to authenticated with check ((auth.jwt()->>''nv_role'')=''ADMIN'')';
      execute 'create policy nv_upd on public.nhan_vien for update to authenticated using ((auth.jwt()->>''nv_role'')=''ADMIN'') with check ((auth.jwt()->>''nv_role'')=''ADMIN'')';
      execute 'create policy nv_del on public.nhan_vien for delete to authenticated using ((auth.jwt()->>''nv_role'')=''ADMIN'')';
    else
      execute format('create policy auth_all on public.%I for all to authenticated using (true) with check (true);', r.tablename);
    end if;
  end loop;
end $$;

-- 2) Thu hồi mọi quyền của anon (trừ đúng hàm đăng nhập). Cấp lại quyền cho authenticated.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant execute on function public.dang_nhap(text,text,boolean) to anon;

grant all           on all tables    in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute       on all functions in schema public to authenticated;

-- Bảng bí mật: không ai (kể cả authenticated) chạm tới — chỉ hàm security definer đọc được.
revoke all on public.nhan_vien_secret from anon, authenticated;

-- 3) Xoá cột mật khẩu thô (đã có bản băm ở nhan_vien_secret).
--    QUAN TRỌNG: nếu không xoá, mọi nhân viên đã đăng nhập vẫn đọc được mật khẩu thô
--    qua select('*') trên nhan_vien. Bắt buộc xoá để đóng lỗ hổng.
alter table public.nhan_vien drop column if exists password;

-- ------------------------------------------------------------
-- KIỂM CHỨNG (chạy riêng sau khi Run):
--   select tablename, count(*) so_policy from pg_policies where schemaname='public' group by tablename order by tablename;
--   select has_column_privilege('anon','public.nhan_vien','select') as anon_doc_nhanvien;  -- kỳ vọng false
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='nhan_vien' and column_name='password';  -- kỳ vọng 0 dòng
-- ------------------------------------------------------------

-- ROLLBACK KHẨN (nếu 1 bảng bị chặn nhầm gây lỗi cho người dùng đã đăng nhập):
--   create policy tmp_open on public.<ten_bang> for all to authenticated using (true) with check (true);
--   -- (không mất dữ liệu; sửa xong thì bỏ policy tmp_open đi)
