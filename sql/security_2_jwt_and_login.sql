-- ============================================================
-- BẢO MẬT — BƯỚC 2/3: Hàm đăng nhập phát JWT + RPC quản trị mật khẩu
-- Chạy trong Supabase SQL Editor SAU security_1. Chưa siết RLS ở bước này.
-- ============================================================

-- 1) Cất JWT secret của dự án vào Vault — CHỈ tạo nếu chưa có (idempotent, không lỗi).
--    Lấy secret tại: Dashboard -> Settings -> API -> JWT Settings -> JWT Secret
--    >>> THAY <PASTE_JWT_SECRET> bằng chuỗi bí mật đó (giữ nguyên 'jwt_secret' là TÊN) <<<
do $$
begin
  if not exists (select 1 from vault.secrets where name='jwt_secret') then
    perform vault.create_secret('<PASTE_JWT_SECRET>', 'jwt_secret', 'Project JWT secret for dang_nhap');
  end if;
end $$;
-- Nếu cần ĐỔI secret đã lưu (vd lần đầu lỡ lưu sai), dùng hàm chính chủ của Vault:
--   select vault.update_secret(
--     (select id from vault.secrets where name='jwt_secret'),
--     'SECRET_MỚI', 'jwt_secret');

-- 2) Helper: base64url encode
create or replace function public._b64url(data bytea) returns text
language sql immutable as $$
  select translate(encode(data,'base64'), E'+/=\n', '-_');
$$;

-- 3) Helper: ký JWT HS256
create or replace function public._sign_jwt(payload jsonb, secret text) returns text
language sql as $$
  with parts as (
    select public._b64url(convert_to('{"alg":"HS256","typ":"JWT"}','utf8')) as h,
           public._b64url(convert_to(payload::text,'utf8')) as p
  ), si as (select h||'.'||p as s from parts)
  select s||'.'||public._b64url(extensions.hmac(s, secret, 'sha256')) from si;
$$;

-- 4) Đăng nhập: kiểm bcrypt, phát JWT (role=authenticated + nv_role trong claim)
create or replace function public.dang_nhap(p_id text, p_pw text, p_remember boolean default false)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  v record; v_hash text; v_secret text;
  v_now bigint := extract(epoch from now())::bigint;
  v_ttl int := case when p_remember then 60*60*24*7 else 60*60*12 end;  -- 7 ngày nếu ghi nhớ, else 12h
  v_exp bigint; v_token text;
begin
  select id, name, role, coalesce(permissions,'{}'::jsonb) as permissions
    into v from public.nhan_vien where lower(id)=lower(p_id);
  if not found then
    raise exception 'Mã nhân viên hoặc mật khẩu không đúng' using errcode='28P01';
  end if;

  select password_hash into v_hash from public.nhan_vien_secret where nv_id=v.id;
  if v_hash is null or v_hash <> extensions.crypt(p_pw, v_hash) then
    raise exception 'Mã nhân viên hoặc mật khẩu không đúng' using errcode='28P01';
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name='jwt_secret';
  if v_secret is null then raise exception 'JWT secret chưa có trong Vault'; end if;

  v_exp := v_now + v_ttl;
  v_token := public._sign_jwt(jsonb_build_object(
    'role','authenticated','sub',v.id,'nv_id',v.id,
    'nv_role',upper(coalesce(v.role,'AGENT')),'name',v.name,
    'iat',v_now,'exp',v_exp), v_secret);

  return jsonb_build_object('token',v_token,'exp',v_exp,
    'user',jsonb_build_object('id',v.id,'name',v.name,
      'role',upper(coalesce(v.role,'AGENT')),'permissions',v.permissions));
end; $$;
revoke all on function public.dang_nhap(text,text,boolean) from public;
grant execute on function public.dang_nhap(text,text,boolean) to anon, authenticated;

-- 5) Admin-only: đặt/đổi mật khẩu (ghi vào bảng secret)
create or replace function public.dat_mat_khau(p_id text, p_pw text)
returns void language plpgsql security definer set search_path=public, extensions as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được đổi mật khẩu' using errcode='42501';
  end if;
  if not exists (select 1 from public.nhan_vien where id=p_id) then
    raise exception 'Nhân viên không tồn tại: %', p_id;
  end if;
  insert into public.nhan_vien_secret(nv_id,password_hash,updated_at)
  values (p_id, extensions.crypt(p_pw, extensions.gen_salt('bf')), now())
  on conflict (nv_id) do update set password_hash=excluded.password_hash, updated_at=now();
end; $$;
revoke all on function public.dat_mat_khau(text,text) from public, anon;
grant execute on function public.dat_mat_khau(text,text) to authenticated;

-- 6) Admin-only: sao chép secret khi đổi mã NV
create or replace function public.sao_chep_secret(p_from text, p_to text)
returns void language plpgsql security definer set search_path=public, extensions as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin' using errcode='42501';
  end if;
  insert into public.nhan_vien_secret(nv_id,password_hash,updated_at)
  select p_to, password_hash, now() from public.nhan_vien_secret where nv_id=p_from
  on conflict (nv_id) do update set password_hash=excluded.password_hash, updated_at=now();
end; $$;
revoke all on function public.sao_chep_secret(text,text) from public, anon;
grant execute on function public.sao_chep_secret(text,text) to authenticated;

-- ------------------------------------------------------------
-- KIỂM CHỨNG (chạy riêng, thay NV_TEST/PW_TEST bằng 1 tài khoản thật):
--   select public.dang_nhap('NV_TEST','PW_TEST',false);
--   -- Kỳ vọng: JSON có "token" (3 đoạn ngăn bởi dấu chấm), "exp", "user" (KHÔNG có mật khẩu).
--   -- Sai mật khẩu => lỗi "Mã nhân viên hoặc mật khẩu không đúng".
-- ------------------------------------------------------------

-- ROLLBACK (nếu cần):
--   drop function if exists public.dang_nhap(text,text,boolean),
--     public.dat_mat_khau(text,text), public.sao_chep_secret(text,text),
--     public._sign_jwt(jsonb,text), public._b64url(bytea);
