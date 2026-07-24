-- ════════════════════════════════════════════════════════════════════════════
-- MIỄN TRỪ CHUYÊN CẦN (giải trình) — lớp phủ trên bảng chấm công.
-- Mỗi dòng = một NGÀY của một NGƯỜI được admin đánh dấu "đặc biệt" kèm lý do.
-- Luật KPI loại ngày này khỏi điểm trừ chuyên cần (cá nhân + bộ phận) nhưng VẪN
-- hiển thị. Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao KHÔNG gắn cờ thẳng vào cham_cong: bảng cham_cong nạp bằng import
-- `delete ... insert ...` mỗi tháng, gắn cờ ở đó sẽ bị xoá sạch mỗi lần import lại.
-- Bảng này tách riêng nên miễn trừ sống sót qua mọi lần nạp lại chấm công.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create table if not exists chuyen_can_ngoai_le (
  id            bigserial primary key,
  ky            text not null,                    -- 'YYYY-MM', suy từ ngay, lưu sẵn cho dễ lọc
  nhan_vien_id  text not null references nhan_vien(id) on delete cascade,
  ngay          date not null,
  ly_do         text not null,                    -- giải trình BẮT BUỘC
  nguoi_ghi     text,                             -- ai đánh dấu (tên/id admin)
  created_at    timestamptz default now(),

  -- Một người một ngày một bản ghi: bấm đánh dấu lại là upsert, không nhân đôi.
  constraint ccnl_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);

create index if not exists ccnl_ky_idx on chuyen_can_ngoai_le (ky, nhan_vien_id);

-- ── RLS: đọc công khai (KPI vốn công khai), ghi chỉ ADMIN ────────────────────
-- Cùng lý do như bảng cham_cong: miễn trừ quyết định điểm chuyên cần, gắn thẳng
-- với lương thưởng. Chặn ở giao diện thôi thì người biết gọi API vẫn sửa được.
alter table public.chuyen_can_ngoai_le enable row level security;

drop policy if exists ccnl_sel on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_ins on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_upd on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_del on public.chuyen_can_ngoai_le;

create policy ccnl_sel on public.chuyen_can_ngoai_le
  for select to authenticated using (true);

create policy ccnl_ins on public.chuyen_can_ngoai_le
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy ccnl_upd on public.chuyen_can_ngoai_le
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy ccnl_del on public.chuyen_can_ngoai_le
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ⚠ NHẮC LẠI như create_cham_cong.sql: sql/security_3_rls_lockdown.sql quét MỌI bảng
--   public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại file đó SAU file
--   này sẽ mở toang quyền ghi miễn trừ → phải chạy lại file này ngay sau.
--   Kiểm chứng: select policyname from pg_policies where tablename = 'chuyen_can_ngoai_le';
--   Kỳ vọng 4 dòng ccnl_*, TUYỆT ĐỐI không có dòng `auth_all`.

-- KIỂM TRA
select policyname, cmd from pg_policies where tablename = 'chuyen_can_ngoai_le' order by policyname;
