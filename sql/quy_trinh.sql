-- ============================================================
-- PHÂN HỆ QUY TRÌNH — bảng, RLS, quyền theo cột, RPC chuyển trạng thái
-- Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại được nhiều lần.
-- ============================================================

create table if not exists quy_trinh (
  id            uuid primary key default gen_random_uuid(),
  ma_so         text not null unique,
  ten           text not null,
  nhom          text not null,
  trang_thai    text not null default 'draft',
  ban_hien_hanh uuid,
  nguoi_soan    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists quy_trinh_phien_ban (
  id              uuid primary key default gen_random_uuid(),
  quy_trinh_id    uuid not null references quy_trinh(id) on delete cascade,
  phien_ban       text not null,
  lan_ban_hanh    int  not null,
  trang_thai      text not null default 'draft',
  so_do           jsonb not null default '{}'::jsonb,
  tai_lieu        jsonb not null default '{}'::jsonb,
  ngay_hieu_luc   date,
  ghi_chu_sua_doi text,
  nguoi_tao       text not null,
  nguoi_ban_hanh  text,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique (quy_trinh_id, phien_ban)
);

create index if not exists qt_pb_quy_trinh_idx on quy_trinh_phien_ban(quy_trinh_id);

alter table quy_trinh           enable row level security;
alter table quy_trinh_phien_ban enable row level security;

-- Vai trò công khai KHÔNG có policy nào ⇒ 0 dòng, không ghi được.
drop policy if exists qt_sel on quy_trinh;
drop policy if exists qt_ins on quy_trinh;
drop policy if exists qt_upd on quy_trinh;
drop policy if exists qt_del on quy_trinh;
create policy qt_sel on quy_trinh for select to authenticated using (true);
create policy qt_ins on quy_trinh for insert to authenticated with check (true);
create policy qt_upd on quy_trinh for update to authenticated using (true) with check (true);
create policy qt_del on quy_trinh for delete to authenticated using (trang_thai = 'draft');

drop policy if exists qtpb_sel on quy_trinh_phien_ban;
drop policy if exists qtpb_ins on quy_trinh_phien_ban;
drop policy if exists qtpb_upd on quy_trinh_phien_ban;
drop policy if exists qtpb_del on quy_trinh_phien_ban;
create policy qtpb_sel on quy_trinh_phien_ban for select to authenticated using (true);
create policy qtpb_ins on quy_trinh_phien_ban for insert to authenticated with check (trang_thai = 'draft');
create policy qtpb_upd on quy_trinh_phien_ban for update to authenticated using (true) with check (true);
create policy qtpb_del on quy_trinh_phien_ban for delete to authenticated using (trang_thai = 'draft');

-- ── Chặn thật: cột trạng thái KHÔNG nằm trong quyền ghi của người dùng thường ──
revoke update on quy_trinh           from authenticated;
revoke update on quy_trinh_phien_ban from authenticated;
grant  update (ten, nhom, updated_at)            on quy_trinh           to authenticated;
grant  update (so_do, tai_lieu, ghi_chu_sua_doi) on quy_trinh_phien_ban to authenticated;

-- ── RPC 1: gửi duyệt (ai đăng nhập cũng gọi được) ──
create or replace function rpc_qt_gui_duyet(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update quy_trinh_phien_ban set trang_thai = 'wait'
   where id = p_phien_ban_id and trang_thai = 'draft';
  if not found then raise exception 'Chỉ gửi duyệt được bản đang ở trạng thái nháp'; end if;
end $$;

-- ── RPC 2: trả lại (CHỈ ADMIN) ──
create or replace function rpc_qt_tra_lai(p_phien_ban_id uuid, p_ly_do text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;
  update quy_trinh_phien_ban
     set trang_thai = 'draft', ghi_chu_sua_doi = coalesce(p_ly_do, ghi_chu_sua_doi)
   where id = p_phien_ban_id and trang_thai = 'wait';
  if not found then raise exception 'Chỉ trả lại được bản đang chờ duyệt'; end if;
end $$;

-- ── RPC 3: ban hành (CHỈ ADMIN) — một giao dịch ──
create or replace function rpc_qt_ban_hanh(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_qt uuid; v_so_do jsonb; v_nodes jsonb;
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;

  select quy_trinh_id, so_do into v_qt, v_so_do from quy_trinh_phien_ban
   where id = p_phien_ban_id and trang_thai = 'wait';
  if v_qt is null then raise exception 'Chỉ ban hành được bản đang chờ duyệt'; end if;

  -- Chốt chặn cấu trúc tối thiểu ở máy chủ. Luật soát lỗi ĐẦY ĐỦ (mồ côi, nhánh
  -- thiếu nhãn, thiếu diễn giải) nằm ở quyTrinhKiemTra.js phía giao diện — cố ý
  -- KHÔNG chép sang PL/pgSQL để tránh hai bản luật lệch nhau. Đây không phải ranh
  -- giới bảo mật: chỉ Admin mới tới được bước này, và Admin được tin về nội dung.
  v_nodes := coalesce(v_so_do->'nodes', '[]'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_nodes) n where n->>'t' = 'start')
  or not exists (select 1 from jsonb_array_elements(v_nodes) n where n->>'t' = 'end') then
    raise exception 'Lưu đồ phải có đủ khối Bắt đầu và Kết thúc mới ban hành được';
  end if;

  -- Bản đang hiệu lực → hết hiệu lực
  update quy_trinh_phien_ban set trang_thai = 'expired'
   where quy_trinh_id = v_qt and trang_thai = 'published';

  update quy_trinh_phien_ban
     set trang_thai = 'published', published_at = now(),
         ngay_hieu_luc = coalesce(ngay_hieu_luc, current_date),
         nguoi_ban_hanh = coalesce(auth.jwt()->>'nv_id', 'ADMIN')
   where id = p_phien_ban_id;

  update quy_trinh
     set trang_thai = 'published', ban_hien_hanh = p_phien_ban_id, updated_at = now()
   where id = v_qt;
end $$;

revoke all on function rpc_qt_gui_duyet(uuid)      from public, anon;
revoke all on function rpc_qt_tra_lai(uuid, text)  from public, anon;
revoke all on function rpc_qt_ban_hanh(uuid)       from public, anon;
grant execute on function rpc_qt_gui_duyet(uuid)     to authenticated;
grant execute on function rpc_qt_tra_lai(uuid, text) to authenticated;
grant execute on function rpc_qt_ban_hanh(uuid)      to authenticated;
