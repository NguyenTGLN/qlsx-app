-- ════════════════════════════════════════════════════════════════════════════
-- TRANG CẢI TIẾN (Kaizen) — bảng bài đăng + cấu hình quy đổi tiền.
-- Spec: docs/superpowers/specs/2026-07-24-cai-tien-design.md
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Ảnh/video KHÔNG cần bucket mới: dùng lại bucket task-attachments
-- (sql/setup_task_attachments.sql phải chạy trước — thực tế đã chạy từ 07/2026),
-- file nằm trong folder cai-tien/ để phân biệt với file công việc.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create table if not exists cai_tien (
  id                  bigserial primary key,
  nhan_vien_id        text not null references nhan_vien(id) on delete cascade,
  title               text not null,
  category            text not null check (category in
                        ('nang_suat','chat_luong','chi_phi','rui_ro',
                         'don_gian_hoa','quy_trinh','5s','moi_truong')),
  status              text not null default 'CHO_DUYET' check (status in
                        ('CHO_DUYET','DA_DUYET','CAN_BO_SUNG','TU_CHOI')),
  before_text         text,
  after_text          text,
  attachments_before  jsonb not null default '[]'::jsonb,  -- format như cong_viec_duoc_giao.attachments
  attachments_after   jsonb not null default '[]'::jsonb,
  metrics             jsonb not null default '{}'::jsonb,  -- số liệu nhập theo loại (field theo caiTienValue.js)
  computed            jsonb not null default '{}'::jsonb,  -- {gio_thang,tien_thang,tien_nam,dien_giai} chốt lúc gửi/duyệt
  likes               jsonb not null default '[]'::jsonb,  -- mảng nv_id đã 👍
  score               jsonb,                               -- {gia_tri,sang_tao,nhan_rong,no_luc,bang_chung} mỗi ô 1-5
  tong_diem           numeric,
  xep_loai            text check (xep_loai in ('A','B','C','GHI_NHAN')),
  nhan_rong           boolean not null default false,      -- 🚀 được nhân rộng toàn nhà máy
  reviewer_id         text,
  review_note         text,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

create index if not exists cai_tien_status_idx  on cai_tien (status);
create index if not exists cai_tien_nv_idx      on cai_tien (nhan_vien_id);
create index if not exists cai_tien_created_idx on cai_tien (created_at);

-- Cấu hình quy đổi — đúng 1 dòng id=1. App đọc dòng này, hỏng thì dùng
-- DEFAULT_CONFIG trong src/lib/caiTienValue.js (cùng giá trị seed dưới đây).
create table if not exists cai_tien_config (
  id               int primary key check (id = 1),
  don_gia_gio      numeric not null default 35000,   -- đ/giờ công
  ngay_cong_thang  numeric not null default 26,
  chi_phi_loi      numeric not null default 180000,  -- đ cho 1 SP lỗi
  trong_so         jsonb not null default '{"gia_tri":40,"sang_tao":20,"nhan_rong":20,"no_luc":10,"bang_chung":10}'::jsonb,
  nguong           jsonb not null default '{"A":80,"B":60,"C":40}'::jsonb,
  updated_at       timestamptz not null default now()
);

insert into cai_tien_config (id) values (1) on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Feed công khai nội bộ (quyết định nghiệp vụ 24/07/2026: mọi người xem của nhau
-- để lan tỏa). Ghi thì siết: giá trị làm lợi + xếp loại gắn với thi đua khen
-- thưởng, chặn ở giao diện thôi thì người biết gọi API vẫn sửa được.
alter table public.cai_tien enable row level security;
alter table public.cai_tien_config enable row level security;

drop policy if exists ct_sel on public.cai_tien;
drop policy if exists ct_ins on public.cai_tien;
drop policy if exists ct_upd on public.cai_tien;
drop policy if exists ct_del on public.cai_tien;
drop policy if exists ctc_sel on public.cai_tien_config;
drop policy if exists ctc_upd on public.cai_tien_config;
drop policy if exists ctc_ins on public.cai_tien_config;

create policy ct_sel on public.cai_tien
  for select to authenticated using (true);

-- Chỉ đăng bài đứng tên MÌNH.
create policy ct_ins on public.cai_tien
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id);

-- Sửa: ADMIN mọi lúc (chấm điểm, duyệt, sửa metrics hộ);
-- TÁC GIẢ chỉ khi bài chưa chốt (CHO_DUYET / CAN_BO_SUNG).
-- Nút 👍 của mọi người KHÔNG đi qua policy này — đi qua RPC cai_tien_like bên
-- dưới (security definer, chỉ đụng cột likes) vì RLS Postgres không chặn được
-- theo-cột: mở update cả dòng cho người ngoài để họ like là mở luôn quyền sửa
-- nội dung/điểm của bài người khác.
create policy ct_upd on public.cai_tien
  for update to authenticated
  using (
    coalesce(auth.jwt()->>'nv_role','') = 'ADMIN'
    or (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id
        and status in ('CHO_DUYET','CAN_BO_SUNG'))
  )
  with check (
    coalesce(auth.jwt()->>'nv_role','') = 'ADMIN'
    or (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id
        and status in ('CHO_DUYET','CAN_BO_SUNG'))
  );

-- Xóa: tác giả khi bài chưa duyệt, hoặc ADMIN.
create policy ct_del on public.cai_tien
  for delete to authenticated
  using (
    coalesce(auth.jwt()->>'nv_role','') = 'ADMIN'
    or (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id and status <> 'DA_DUYET')
  );

create policy ctc_sel on public.cai_tien_config
  for select to authenticated using (true);
create policy ctc_ins on public.cai_tien_config
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy ctc_upd on public.cai_tien_config
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

-- ── RPC 👍 (mọi trạng thái) ──────────────────────────────────────────────────
-- security definer để vượt RLS nhưng CHỈ đụng cột likes, toggle đúng nv_id
-- của người gọi lấy từ JWT — không nhận tham số nv_id nên không giả mạo được.
create or replace function public.cai_tien_like(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nv text := coalesce(auth.jwt()->>'nv_id','');
  v_likes jsonb;
begin
  if v_nv = '' then
    raise exception 'Chưa đăng nhập';
  end if;
  select likes into v_likes from cai_tien where id = p_id for update;
  if v_likes is null then
    raise exception 'Không tìm thấy bài cải tiến %', p_id;
  end if;
  if v_likes ? v_nv then
    v_likes := (select coalesce(jsonb_agg(x), '[]'::jsonb)
                from jsonb_array_elements_text(v_likes) as t(x) where x <> v_nv);
  else
    v_likes := v_likes || to_jsonb(v_nv);
  end if;
  update cai_tien set likes = v_likes where id = p_id;
  return v_likes;
end;
$$;

revoke all on function public.cai_tien_like(bigint) from public;
grant execute on function public.cai_tien_like(bigint) to authenticated;

commit;

-- ⚠ NHẮC LẠI như create_chuyen_can_ngoai_le.sql: sql/security_3_rls_lockdown.sql
--   quét MỌI bảng public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại
--   file đó SAU file này sẽ mở toang quyền ghi điểm/xếp loại → phải chạy lại file
--   này ngay sau đó.
--   Kiểm chứng: select policyname from pg_policies
--               where tablename in ('cai_tien','cai_tien_config');
--   Kỳ vọng 7 dòng ct_*/ctc_*, TUYỆT ĐỐI không có `auth_all`.

-- KIỂM TRA SAU KHI CHẠY
select policyname, cmd from pg_policies
where tablename in ('cai_tien','cai_tien_config') order by policyname;
select * from cai_tien_config;
