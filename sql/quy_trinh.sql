-- ============================================================
-- PHÂN HỆ QUY TRÌNH — bảng, RLS, quyền theo cột, RPC chuyển trạng thái
-- Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại được nhiều lần.
-- ============================================================

-- ⚠ NHẮC LẠI: sql/security_3_rls_lockdown.sql quét MỌI bảng public, xoá hết policy,
--   tạo `auth_all using(true)` VÀ chạy `grant all on all tables ... to authenticated`
--   (dòng 39 và 50). Chạy lại file đó SAU file này sẽ xoá quyền-theo-cột bên dưới
--   → nhân viên thường ghi thẳng được cột trang_thai qua REST API và tự ban hành.
--   PHẢI chạy lại file này ngay sau đó.
--   Trigger qt_canh_trang_thai KHÔNG bị file lockdown đụng tới, nên vẫn chặn được
--   ngay cả khi quên chạy lại — nhưng đừng dựa vào mỗi nó, hãy chạy lại cho đủ.

begin;

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

-- quy_trinh.trang_thai LÀ BẢN SAO trạng thái của phiên bản MỚI NHẤT, giữ ở đây để
-- màn hình danh mục lọc được mà không phải nối bảng phiên bản cho từng thẻ.
-- Chỉ nhận 3 giá trị: 'draft' → 'wait' → 'published'. Cả ba RPC bên dưới đều phải
-- cập nhật cột này, quên một cái là danh mục hiện sai trạng thái mà không ai báo lỗi.
-- KHÔNG bao giờ mang giá trị 'expired': hết hiệu lực là chuyện của một PHIÊN BẢN,
-- và lúc một bản cũ hết hiệu lực thì đã có bản mới ban hành ⇒ quy trình vẫn 'published'.
comment on column quy_trinh.trang_thai is
  'Trạng thái của phiên bản mới nhất: draft | wait | published. Không bao giờ là expired.';

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
-- Ai làm chủ một quy trình: chính người soạn, hoặc Admin.
-- security definer để policy trên bảng phiên bản đọc được bảng cha mà không
-- phải lồng policy vào nhau.
create or replace function qt_lam_chu(p_quy_trinh_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'nv_role', '') = 'ADMIN'
      or exists (select 1 from quy_trinh q
                  where q.id = p_quy_trinh_id
                    and q.nguoi_soan = auth.jwt()->>'nv_id');
$$;
revoke all on function qt_lam_chu(uuid) from public, anon;
grant execute on function qt_lam_chu(uuid) to authenticated;

create policy qt_sel on quy_trinh for select to authenticated using (true);
-- Bắt buộc nguoi_soan = chính mình. Nếu màn hình lỡ gửi TÊN hiển thị thay vì mã
-- nhân viên thì hỏng NGAY tại đây với thông báo rõ, thay vì tạo ra một quy trình
-- mà sau đó không ai sửa nổi vì so chủ sở hữu không bao giờ khớp.
create policy qt_ins on quy_trinh for insert to authenticated
  with check (nguoi_soan = auth.jwt()->>'nv_id');
create policy qt_upd on quy_trinh for update to authenticated
  using (nguoi_soan = auth.jwt()->>'nv_id'
         or coalesce(auth.jwt()->>'nv_role', '') = 'ADMIN')
  with check (true);
create policy qt_del on quy_trinh for delete to authenticated
  using (trang_thai = 'draft'
         and (nguoi_soan = auth.jwt()->>'nv_id'
              or coalesce(auth.jwt()->>'nv_role', '') = 'ADMIN'));

drop policy if exists qtpb_sel on quy_trinh_phien_ban;
drop policy if exists qtpb_ins on quy_trinh_phien_ban;
drop policy if exists qtpb_upd on quy_trinh_phien_ban;
drop policy if exists qtpb_del on quy_trinh_phien_ban;
-- Phiên bản THỪA KẾ chủ sở hữu từ quy trình cha: đổi chủ một lần là đổi cho cả
-- các phiên bản, không phải sửa từng dòng.
create policy qtpb_sel on quy_trinh_phien_ban for select to authenticated using (true);
create policy qtpb_ins on quy_trinh_phien_ban for insert to authenticated
  with check (trang_thai = 'draft' and qt_lam_chu(quy_trinh_id));
create policy qtpb_upd on quy_trinh_phien_ban for update to authenticated
  using (qt_lam_chu(quy_trinh_id)) with check (true);
create policy qtpb_del on quy_trinh_phien_ban for delete to authenticated
  using (trang_thai = 'draft' and qt_lam_chu(quy_trinh_id));

-- ── Cấp quyền TƯỜNG MINH cho người đã đăng nhập ──
--    KHÔNG trông chờ quyền mặc định của Supabase: file security_3_rls_lockdown.sql
--    chạy `grant all on all tables` từ TRƯỚC, lúc hai bảng này chưa tồn tại, nên nó
--    không cấp gì cho chúng. Thiếu dòng này thì mọi lời gọi trả "permission denied
--    for table quy_trinh" ngay sau khi chạy file — hỏng cả phân hệ.
--    Cố ý KHÔNG cấp `update` ở đây: quyền ghi theo cột nằm ngay bên dưới.
grant select, insert, delete on quy_trinh           to authenticated;
grant select, insert, delete on quy_trinh_phien_ban to authenticated;

-- ── Chặn thật: cột trạng thái KHÔNG nằm trong quyền ghi của người dùng thường ──
revoke update on quy_trinh           from authenticated;
revoke update on quy_trinh_phien_ban from authenticated;
grant  update (ten, nhom, updated_at)            on quy_trinh           to authenticated;
grant  update (so_do, tai_lieu, ghi_chu_sua_doi) on quy_trinh_phien_ban to authenticated;

-- ── CHỐT CHẶN THẬT: trigger. Sống sót qua security_3_rls_lockdown.sql, thứ
--    xoá sạch policy và cấp lại `grant all` cho authenticated. Quyền theo cột
--    ở trên chỉ còn là lớp phòng thủ thứ hai.
create or replace function qt_canh_trang_thai()
returns trigger language plpgsql as $$
begin
  -- RPC security definer bật cờ này; client không gọi được set_config qua PostgREST.
  if coalesce(current_setting('qt.cho_phep', true), '') = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.trang_thai is distinct from 'draft' then
      raise exception 'Bản ghi mới phải ở trạng thái nháp. Ban hành phải qua RPC.';
    end if;
    return new;
  end if;

  if new.trang_thai is distinct from old.trang_thai then
    raise exception 'Chỉ đổi được trạng thái qua RPC gửi duyệt / trả lại / ban hành.';
  end if;

  -- CHỈ BẢN NHÁP MỚI SỬA ĐƯỢC NỘI DUNG.
  -- Chỉ áp cho bảng phiên bản; bảng quy_trinh vẫn đổi tên được khi đã ban hành.
  --
  -- 'wait' cũng khoá: trước đây người soạn gửi duyệt xong VẪN bấm "Lưu nháp" và
  -- đổi được so_do/tai_lieu, rồi Admin đóng dấu lên thứ đã bị đổi chứ không phải
  -- thứ họ vừa đọc. Cờ "chưa lưu" ở giao diện chỉ canh được trong MỘT phiên
  -- trình duyệt, không canh được giữa hai người ngồi hai máy.
  --
  -- Ba RPC bên dưới KHÔNG bị chặn ở đây: chúng bật cờ qt.cho_phep và thoát ngay
  -- ở đầu hàm — kể cả rpc_qt_tra_lai, thứ ghi ghi_chu_sua_doi lên một dòng 'wait'.
  if tg_table_name = 'quy_trinh_phien_ban'
     and old.trang_thai is distinct from 'draft' then
    if old.trang_thai = 'wait' then
      raise exception 'Bản đang chờ duyệt đã khoá nội dung, để Admin duyệt đúng thứ đang đọc. Cần sửa thì nhờ Admin bấm "Trả lại" đưa bản này về nháp.';
    end if;
    raise exception 'Không sửa được nội dung bản đã ban hành. Hãy tạo phiên bản mới.';
  end if;

  return new;
end $$;

drop trigger if exists qt_tg_trang_thai    on quy_trinh;
drop trigger if exists qt_pb_tg_trang_thai on quy_trinh_phien_ban;
create trigger qt_tg_trang_thai    before insert or update on quy_trinh
  for each row execute function qt_canh_trang_thai();
create trigger qt_pb_tg_trang_thai before insert or update on quy_trinh_phien_ban
  for each row execute function qt_canh_trang_thai();

-- ── RPC 1: gửi duyệt (ai đăng nhập cũng gọi được) ──
create or replace function rpc_qt_gui_duyet(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_qt uuid;
begin
  select quy_trinh_id into v_qt from quy_trinh_phien_ban where id = p_phien_ban_id;
  if v_qt is null then raise exception 'Không tìm thấy phiên bản cần gửi duyệt'; end if;
  if not qt_lam_chu(v_qt) then
    raise exception 'Chỉ người soạn hoặc Admin mới gửi duyệt được quy trình này';
  end if;
  perform set_config('qt.cho_phep', '1', true);
  update quy_trinh_phien_ban set trang_thai = 'wait'
   where id = p_phien_ban_id and trang_thai = 'draft';
  if not found then raise exception 'Chỉ gửi duyệt được bản đang ở trạng thái nháp'; end if;
  -- Đầu bảng quy trình bám theo trạng thái của bản MỚI NHẤT, nếu không thì
  -- màn hình danh mục vẫn hiện "Bản nháp" cho quy trình đang chờ Admin duyệt.
  update quy_trinh set trang_thai = 'wait', updated_at = now() where id = v_qt;
end $$;

-- ── RPC 2: trả lại (CHỈ ADMIN) ──
create or replace function rpc_qt_tra_lai(p_phien_ban_id uuid, p_ly_do text)
returns void language plpgsql security definer set search_path = public as $$
declare v_qt uuid;
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;
  select quy_trinh_id into v_qt from quy_trinh_phien_ban
   where id = p_phien_ban_id and trang_thai = 'wait';
  if v_qt is null then raise exception 'Chỉ trả lại được bản đang chờ duyệt'; end if;
  perform set_config('qt.cho_phep', '1', true);
  update quy_trinh_phien_ban
     set trang_thai = 'draft', ghi_chu_sua_doi = coalesce(p_ly_do, ghi_chu_sua_doi)
   where id = p_phien_ban_id;
  -- Trả lại thì đầu bảng phải lùi về nháp cùng bản, xem chú thích ở cột trang_thai.
  update quy_trinh set trang_thai = 'draft', updated_at = now() where id = v_qt;
end $$;

-- ── RPC 3: ban hành (CHỈ ADMIN) — một giao dịch ──
create or replace function rpc_qt_ban_hanh(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_qt uuid; v_so_do jsonb; v_nodes jsonb;
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;
  perform set_config('qt.cho_phep', '1', true);

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
  -- Mẫu mới tinh chỉ có Bắt đầu → Kết thúc. Tài liệu ISO không có bước nào
  -- thì không phải quy trình, nên chặn luôn ở đây chứ không chỉ ở giao diện.
  if not exists (select 1 from jsonb_array_elements(v_nodes) n
                  where n->>'t' not in ('start', 'end')) then
    raise exception 'Quy trình chưa có bước nào giữa Bắt đầu và Kết thúc';
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

-- ── RPC 4: tạo phiên bản MỚI từ bản đang hiệu lực ──
--    Trước đây chỉ có ĐÚNG MỘT chỗ chèn phiên bản (taoQuyTrinh, v1.0). Ban hành
--    xong là ba tab soạn thảo khoá lại và bảo "muốn sửa thì tạo phiên bản mới" —
--    một việc app không hề có. Một lỗi chính tả trong quy trình ISO đã ban hành
--    vì thế kẹt vĩnh viễn.
create or replace function rpc_qt_tao_phien_ban(p_quy_trinh_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cu  quy_trinh_phien_ban%rowtype;
  v_lan int;
  v_so  int;
  v_dau text;
  v_ten text;
  v_moi uuid;
begin
  if not qt_lam_chu(p_quy_trinh_id) then
    raise exception 'Chỉ người soạn hoặc Admin mới tạo được phiên bản mới của quy trình này';
  end if;

  -- MỘT việc dở dang tại một thời điểm. Không chặn thì hai người mỗi người mở
  -- một bản nháp từ cùng một bản đã ban hành, rồi bản nào ban hành sau sẽ đè
  -- mất công của bản kia mà không ai thấy có gì bất thường.
  if exists (select 1 from quy_trinh_phien_ban
              where quy_trinh_id = p_quy_trinh_id and trang_thai in ('draft', 'wait')) then
    raise exception 'Quy trình này đang có một bản nháp hoặc bản chờ duyệt. Hãy hoàn tất hoặc xoá bản đó trước khi tạo phiên bản mới.';
  end if;

  select * into v_cu from quy_trinh_phien_ban
   where quy_trinh_id = p_quy_trinh_id and trang_thai = 'published'
   order by lan_ban_hanh desc limit 1;
  if not found then
    raise exception 'Quy trình này chưa có bản nào đang hiệu lực để soát xét';
  end if;

  select coalesce(max(lan_ban_hanh), 0) + 1 into v_lan
    from quy_trinh_phien_ban where quy_trinh_id = p_quy_trinh_id;

  -- Nhãn phiên bản suy từ nhãn CŨ: '2.1' → '3.0'. phien_ban là text không ràng
  -- buộc định dạng, nên chỉ nhận dãy số đầu dài tối đa 6 chữ số — dài hơn thì
  -- ::int tràn kiểu và cả lời gọi vỡ. Không đọc được thì lấy '<lần ban hành>.0'.
  v_dau := substring(v_cu.phien_ban from '^\s*(\d{1,6})(?:\D|$)');
  v_so  := case when v_dau is null then v_lan else v_dau::int + 1 end;
  v_ten := v_so || '.0';
  -- unique (quy_trinh_id, phien_ban): đụng nhãn thì nhích lên cho tới khi trống,
  -- thay vì để lời gọi vỡ bằng một lỗi unique violation không ai đọc được.
  while exists (select 1 from quy_trinh_phien_ban
                 where quy_trinh_id = p_quy_trinh_id and phien_ban = v_ten) loop
    v_so  := v_so + 1;
    v_ten := v_so || '.0';
  end loop;

  perform set_config('qt.cho_phep', '1', true);

  -- Chép NGUYÊN VĂN so_do và tai_lieu: người soát xét sửa một chỗ chính tả,
  -- không phải dựng lại lưu đồ từ đầu. ngay_hieu_luc / published_at /
  -- nguoi_ban_hanh cố ý để trống — chúng thuộc về lần ban hành SAU này.
  insert into quy_trinh_phien_ban (
    quy_trinh_id, phien_ban, lan_ban_hanh, trang_thai,
    so_do, tai_lieu, ghi_chu_sua_doi, nguoi_tao)
  values (
    p_quy_trinh_id, v_ten, v_lan, 'draft',
    v_cu.so_do, v_cu.tai_lieu,
    'Soát xét từ phiên bản ' || v_cu.phien_ban || '.',
    coalesce(auth.jwt()->>'nv_id', v_cu.nguoi_tao))
  returning id into v_moi;

  -- Đầu bảng bám theo trạng thái của bản MỚI NHẤT, xem chú thích ở cột trang_thai.
  -- Bản đang hiệu lực KHÔNG bị đụng: nó vẫn là 'published' và vẫn là ban_hien_hanh
  -- cho tới khi bản mới được ban hành — xưởng vẫn in ra đúng tài liệu đang có hiệu lực.
  update quy_trinh set trang_thai = 'draft', updated_at = now() where id = p_quy_trinh_id;
  return v_moi;
end $$;

revoke all on function rpc_qt_gui_duyet(uuid)      from public, anon;
revoke all on function rpc_qt_tra_lai(uuid, text)  from public, anon;
revoke all on function rpc_qt_ban_hanh(uuid)       from public, anon;
revoke all on function rpc_qt_tao_phien_ban(uuid)  from public, anon;
grant execute on function rpc_qt_gui_duyet(uuid)     to authenticated;
grant execute on function rpc_qt_tra_lai(uuid, text) to authenticated;
grant execute on function rpc_qt_ban_hanh(uuid)      to authenticated;
grant execute on function rpc_qt_tao_phien_ban(uuid) to authenticated;

commit;

-- ------------------------------------------------------------
-- KIỂM CHỨNG (chạy riêng sau khi Run)
--   select has_column_privilege('authenticated','quy_trinh_phien_ban','trang_thai','update');
--     → kỳ vọng false. Nếu true: file lockdown đã chạy đè, phải chạy lại file này.
--   select tgname from pg_trigger where tgrelid in ('quy_trinh'::regclass,'quy_trinh_phien_ban'::regclass) and not tgisinternal;
--     → kỳ vọng 2 dòng qt_tg_trang_thai, qt_pb_tg_trang_thai
--   select policyname from pg_policies where tablename in ('quy_trinh','quy_trinh_phien_ban');
--     → kỳ vọng 8 dòng qt_*/qtpb_*, TUYỆT ĐỐI không có `auth_all`.
--   select distinct trang_thai from quy_trinh;
--     → chỉ được có draft / wait / published. Ra 'expired' nghĩa là có đường ghi
--       nào đó lọt qua RPC; ra 'draft' cho quy trình đang chờ duyệt nghĩa là một
--       RPC quên cập nhật đầu bảng — màn hình danh mục sẽ hiện sai trạng thái.
--
--   Kiểm kê ĐỦ loại đối tượng, không chỉ bảng — view bỏ qua RLS nếu thiếu
--   security_invoker, materialized view thì không hỗ trợ nó:
--   select c.relname, c.relkind,
--          coalesce(c.reloptions::text,'') like '%security_invoker=true%' as co_si
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname='public' and c.relkind in ('r','v','m','p')
--      and c.relname like 'quy_trinh%';
--     → kỳ vọng đúng 2 dòng, cả hai relkind='r'. Có 'v' hoặc 'm' nghĩa là ai đó
--       thêm view lên hai bảng này — phải đặt security_invoker=true ngay.
--
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_goi_duoc
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'qt_%' or p.proname like 'rpc_qt_%';
--     → cả 5 hàm phải là false (qt_lam_chu, qt_canh_trang_thai và 4 rpc_qt_*
--       — qt_canh_trang_thai là hàm trigger, anon không gọi thẳng được).
--
--   ── Sau khi siết khoá nội dung bản CHỜ DUYỆT ──
--   Đăng nhập bằng một tài khoản THƯỜNG (không phải Admin) là người soạn của một
--   quy trình đang ở 'wait', rồi thử qua REST:
--     patch /rest/v1/quy_trinh_phien_ban?id=eq.<id bản wait>  body {"so_do":{}}
--     → kỳ vọng LỖI 'Bản đang chờ duyệt đã khoá nội dung…'. Ra 204 nghĩa là
--       trigger chưa được chạy lại — chạy lại cả file này.
--   Rồi để Admin bấm "Trả lại": phải chạy được (RPC bật cờ qt.cho_phep nên đi
--   qua trigger), và ghi_chu_sua_doi phải đổi thành lý do vừa nhập.
--
--   ── Sau khi thêm rpc_qt_tao_phien_ban ──
--   Trên một quy trình ĐÃ BAN HÀNH:
--     select rpc_qt_tao_phien_ban('<quy_trinh_id>');
--     → trả về uuid bản mới; select lại phải thấy đúng 1 dòng 'draft' có
--       so_do/tai_lieu giống hệt bản 'published', và bản 'published' cũ KHÔNG đổi.
--     → gọi lần thứ hai phải BÁO LỖI 'đang có một bản nháp hoặc bản chờ duyệt'.
--     → gọi bằng tài khoản không phải người soạn và không phải Admin phải báo
--       'Chỉ người soạn hoặc Admin…'.
--   select trang_thai from quy_trinh where id='<quy_trinh_id>';  → 'draft'.
--   select ban_hien_hanh from quy_trinh where id='<quy_trinh_id>';
--     → vẫn trỏ vào bản 'published' cũ: xưởng phải in ra tài liệu đang có hiệu
--       lực, không phải bản nháp đang soạn dở.
-- ------------------------------------------------------------

-- ============================================================
-- HOÀN TÁC — dán chạy được ngay. Đang để dưới dạng chú thích để chạy cả file
-- không lỡ tay xoá mất gì; bỏ dấu -- ở khối cần dùng.
--
-- ⚠ ĐỌC TRƯỚC KHI CHẠY: phần B XOÁ BẢNG, tức là MẤT TOÀN BỘ quy trình đã soạn,
--   kể cả bản đã ban hành. Muốn tắt phân hệ mà GIỮ dữ liệu thì chỉ chạy phần A.
-- ============================================================

-- ── A) TẮT PHÂN HỆ, GIỮ NGUYÊN DỮ LIỆU ──
--   Người dùng mất quyền đọc/ghi, màn hình báo lỗi, nhưng không mất dòng nào.
--   Chạy được lúc nào cũng được, đảo lại bằng cách chạy lại file này từ đầu.
-- begin;
-- revoke all on quy_trinh           from authenticated;
-- revoke all on quy_trinh_phien_ban from authenticated;
-- revoke execute on function rpc_qt_gui_duyet(uuid)      from authenticated;
-- revoke execute on function rpc_qt_tra_lai(uuid, text)  from authenticated;
-- revoke execute on function rpc_qt_ban_hanh(uuid)       from authenticated;
-- revoke execute on function rpc_qt_tao_phien_ban(uuid)  from authenticated;
-- revoke execute on function qt_lam_chu(uuid)            from authenticated;
-- commit;

-- ── B) XOÁ HẲN — MẤT DỮ LIỆU, KHÔNG LẤY LẠI ĐƯỢC ──
--   Chỉ dùng khi muốn gỡ sạch phân hệ. Sao lưu trước nếu còn tiếc:
--     create table quy_trinh_backup           as select * from quy_trinh;
--     create table quy_trinh_phien_ban_backup as select * from quy_trinh_phien_ban;
-- begin;
-- drop trigger  if exists qt_pb_tg_trang_thai on quy_trinh_phien_ban;
-- drop trigger  if exists qt_tg_trang_thai    on quy_trinh;
-- drop function if exists qt_canh_trang_thai() cascade;
-- drop function if exists rpc_qt_tao_phien_ban(uuid);
-- drop function if exists rpc_qt_ban_hanh(uuid);
-- drop function if exists rpc_qt_tra_lai(uuid, text);
-- drop function if exists rpc_qt_gui_duyet(uuid);
-- drop table    if exists quy_trinh_phien_ban;   -- xoá trước: có khoá ngoại trỏ sang quy_trinh
-- drop function if exists qt_lam_chu(uuid);      -- xoá sau policy, vì policy có gọi hàm này
-- drop table    if exists quy_trinh;
-- commit;
