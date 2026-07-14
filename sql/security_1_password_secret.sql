-- ============================================================
-- BẢO MẬT — BƯỚC 1/3: Tách & băm mật khẩu (chuẩn bị, KHÔNG đổi hành vi app)
-- Chạy trong Supabase SQL Editor. An toàn: chỉ thêm bảng mới + băm mật khẩu.
-- ============================================================

-- pgcrypto (crypt/gen_salt/hmac) — trên Supabase nằm ở schema extensions
create extension if not exists pgcrypto with schema extensions;

-- Bảng bí mật: chứa mật khẩu ĐÃ BĂM, tách khỏi nhan_vien.
-- ON UPDATE/DELETE CASCADE theo id nhân viên.
create table if not exists public.nhan_vien_secret (
  nv_id text primary key references public.nhan_vien(id) on update cascade on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- Băm toàn bộ mật khẩu hiện có sang bảng secret (chạy 1 lần, idempotent).
insert into public.nhan_vien_secret (nv_id, password_hash)
select id, extensions.crypt(password, extensions.gen_salt('bf'))
from public.nhan_vien
where password is not null and password <> ''
on conflict (nv_id) do nothing;

-- Bật RLS, KHÔNG tạo policy nào => anon & authenticated đều bị chặn TUYỆT ĐỐI.
-- Chỉ các hàm SECURITY DEFINER (chạy bằng quyền owner) mới đọc/ghi được.
alter table public.nhan_vien_secret enable row level security;
revoke all on public.nhan_vien_secret from anon, authenticated;

-- ------------------------------------------------------------
-- KIỂM CHỨNG (chạy riêng sau khi Run ở trên):
--   select (select count(*) from public.nhan_vien where password is not null and password<>'') as co_mk,
--          (select count(*) from public.nhan_vien_secret) as da_bam;
--   -- Kỳ vọng: co_mk == da_bam
--   select nv_id, left(password_hash,7) as prefix from public.nhan_vien_secret limit 3;
--   -- Kỳ vọng: prefix bắt đầu bằng $2a$ hoặc $2b$ (bcrypt)
-- ------------------------------------------------------------

-- ROLLBACK (nếu cần huỷ bước này): drop table if exists public.nhan_vien_secret;
