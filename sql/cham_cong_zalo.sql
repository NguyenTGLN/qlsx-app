-- ════════════════════════════════════════════════════════════════════════════
-- CHẤM CÔNG QUA NHÓM ZALO — bảng tin thô, cột nguồn, và các hàm dựng dòng
-- chấm công. Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Spec: docs/superpowers/specs/2026-08-06-cham-cong-zalo-design.md
--
-- ⚠ NHẮC LẠI CẢNH BÁO Ở create_cham_cong.sql: sql/security_3_rls_lockdown.sql quét
--   MỌI bảng public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại tệp đó
--   sau tệp này sẽ MỞ TOANG hai bảng zalo_cham_cong và ve_som_tay → phải chạy lại
--   tệp này ngay sau.
--   Kiểm chứng: select tablename, policyname from pg_policies
--               where tablename in ('zalo_cham_cong','ve_som_tay');
--   Kỳ vọng 8 dòng zcc_* / vst_*, TUYỆT ĐỐI không có dòng `auth_all`.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1. BẢNG TIN THÔ ─────────────────────────────────────────────────────────
-- Chỉ chứa tin của ĐÚNG nhóm chấm công. Không suy luận gì ở đây: giữ nguyên văn
-- để sau này sửa luật thì tính lại được, không phải nạp lại.
create table if not exists zalo_cham_cong (
  id          bigserial primary key,
  thread_id   text   not null,
  uid_from    text   not null,   -- KHOÁ NHẬN NGƯỜI. Tên hiển thị Zalo KHÔNG dùng được:
                                 -- 'ERM Trại Gà' nhắn "Hà", 'ERM Bếu Ú' nhắn "Xuân".
  sender_name text,              -- chỉ để người soát nhìn, không tham gia tính toán
  content     text,
  ts          bigint not null,   -- ms epoch từ Zalo
  ngay        date   not null,   -- ngày giờ VN, do trigger dưới điền
  created_at  timestamptz default now(),

  -- n8n chạy lại workflow / retry sẽ gửi lại đúng tin đó. Thiếu ràng buộc này là
  -- một tin thành nhiều dòng — không sai kết quả (hàm dựng lấy min giờ) nhưng bảng
  -- phình và người soát không tin được số dòng.
  constraint zalo_cham_cong_khong_trung unique (uid_from, ts)
);

create index if not exists zalo_cham_cong_ngay_idx on zalo_cham_cong (ngay, uid_from);

-- `ngay` phải do CSDL tính, không để n8n gửi lên: tính múi giờ sai bên ngoài là lỗi
-- lệch đúng một ngày, rất khó thấy. Cũng không dùng cột sinh (`generated always as`)
-- được: `timestamptz at time zone <text>` là STABLE chứ không IMMUTABLE nên Postgres
-- từ chối.
--
-- Trigger này CHỈ điền một cột ngày. Nó không đụng gì tới zalo_conversations — đó là
-- khác biệt căn bản với trigger của zalo_messages, và là lý do bảng này tồn tại riêng.
create or replace function zalo_cham_cong_dat_ngay() returns trigger
language plpgsql as $$
begin
  new.ngay := (to_timestamp(new.ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::date;
  return new;
end $$;

drop trigger if exists zalo_cham_cong_tg_ngay on zalo_cham_cong;
create trigger zalo_cham_cong_tg_ngay
  before insert or update of ts on zalo_cham_cong
  for each row execute function zalo_cham_cong_dat_ngay();

-- ── RLS: đọc khi đã đăng nhập, ghi chỉ ADMIN ────────────────────────────────
-- Bảng này chứa tin nhắn của nhân viên. n8n ghi bằng khoá sb_secret (service_role)
-- nên bỏ qua RLS — không cần policy cho nó.
alter table public.zalo_cham_cong enable row level security;

drop policy if exists auth_all on public.zalo_cham_cong;
drop policy if exists zcc_sel on public.zalo_cham_cong;
drop policy if exists zcc_ins on public.zalo_cham_cong;
drop policy if exists zcc_upd on public.zalo_cham_cong;
drop policy if exists zcc_del on public.zalo_cham_cong;

create policy zcc_sel on public.zalo_cham_cong
  for select to authenticated using (true);
create policy zcc_ins on public.zalo_cham_cong
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy zcc_upd on public.zalo_cham_cong
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy zcc_del on public.zalo_cham_cong
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ── 2. SO TÊN ───────────────────────────────────────────────────────────────
-- Extension `unaccent` KHÔNG có trong project này (đã kiểm 06/08: chỉ có pg_net,
-- pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp).
-- Nên bỏ dấu bằng translate với bảng ký tự tự viết. Cũng tốt hơn unaccent một điểm:
-- xử lý được chữ 'đ'.
--
-- Số ký tự mỗi nhóm đã ĐO trên chính CSDL này ngày 06/08: 17 / 11 / 5 / 17 / 11 / 5.
-- Dùng repeat() thay vì gõ tay chuỗi đích để hai vế không thể lệch độ dài — translate
-- lệch độ dài thì nó lặng lẽ XOÁ ký tự thừa chứ không báo lỗi.
begin;

-- `normalize(…, nfc)` KHÔNG phải thừa. Cùng một chữ 'ọ' có hai cách mã hoá Unicode:
-- dựng sẵn (NFC, một ký tự) và tổ hợp (NFD, chữ 'o' + dấu rời). Bảng translate dưới đây
-- chỉ liệt kê dạng NFC, nên chuỗi NFD đi qua mà KHÔNG bị bỏ dấu — 'Ngọc' vẫn ra 'ngọc',
-- không khớp tên 'ngoc', và người đó bị sót ⇒ ghi NGHỈ oan, mất 3 điểm chuyên cần.
--
-- Đã đo 06/08 trên chính CSDL này:
--   zalo_bo_dau(normalize('Ngọc', nfd))                  → 'ngọc'   ← hỏng
--   zalo_bo_dau(normalize(normalize('Ngọc',nfd), nfc))   → 'ngoc'   ← đúng
--   normalize('Ngọc', nfc) = 'Ngọc'                      → true     ← NFC không đổi gì
-- Chưa biết Zalo/n8n đẩy lên dạng nào, và đó chính là lý do phải chuẩn hoá: rẻ, không
-- đổi gì với dữ liệu vốn đúng, và chặn hẳn một kiểu sai chỉ lộ ra ở vài cái tên.
create or replace function zalo_bo_dau(p text) returns text
language sql immutable as $$
  select translate(
    lower(normalize(coalesce(p, ''), nfc)),
    'àáạảãâầấậẩẫăằắặẳẵ' || 'èéẹẻẽêềếệểễ' || 'ìíịỉĩ'
      || 'òóọỏõôồốộổỗơờớợởỡ' || 'ùúụủũưừứựửữ' || 'ỳýỵỷỹ' || 'đ',
    repeat('a',17) || repeat('e',11) || repeat('i',5)
      || repeat('o',17) || repeat('u',11) || repeat('y',5) || 'd')
$$;

-- Tin có được coi là chấm công của NGƯỜI NÀY không.
--
-- So theo TỪ chứ không theo chuỗi con: tên 'Hà' bỏ dấu thành 'ha', nằm trong 'thang',
-- 'khach', 'nhanh'. So chuỗi con là bắt nhầm hàng loạt.
--
-- Người gọi PHẢI truyền tên của CHÍNH người gửi, không quét cả 13 tên. Bằng chứng:
-- tin của Thiện "Như đã xin phép GDKT nguyên,,em có việc, cho em xin nghỉ 2 ngày ạ"
-- chứa 'nguyên' — tên một người khác trong 13. Quét cả danh sách là ghi nhầm Thiện
-- thành có mặt đúng vào ngày họ xin nghỉ.
create or replace function zalo_khop_ten(p_content text, p_ten text) returns boolean
language sql immutable as $$
  with chuan as (
    select btrim(regexp_replace(zalo_bo_dau(p_content), '[^a-z0-9]+', ' ', 'g')) as noi_dung,
           btrim(regexp_replace(zalo_bo_dau(p_ten),     '[^a-z0-9]+', ' ', 'g')) as ten
  )
  select ten <> '' and position(' ' || ten || ' ' in ' ' || noi_dung || ' ') > 0
  from chuan
$$;

commit;

-- ── 3. CỘT NGUỒN TRÊN cham_cong ─────────────────────────────────────────────
-- Không phải để trang trí: đây là điều kiện khiến Zalo KHÔNG BAO GIỜ đè được dòng
-- của máy vân tay (xem mệnh đề `where cham_cong.nguon = 'ZALO'` trong hàm dựng).
-- Thiếu cột này thì nguồn yếu hơn (ai nhớ nhắn) đè lên nguồn mạnh hơn (ai quẹt vân tay).
--
-- KHÔNG phải sửa nap_cham_cong: hàm đó liệt kê cột rõ ràng (rpc_nap_cham_cong.sql:63-66)
-- nên cột mới lấy giá trị mặc định 'MAY'. Đã kiểm.
begin;

alter table cham_cong add column if not exists nguon text not null default 'MAY';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cham_cong_nguon_hop_le') then
    alter table cham_cong add constraint cham_cong_nguon_hop_le check (nguon in ('MAY','ZALO'));
  end if;
end $$;

create index if not exists cham_cong_nguon_idx on cham_cong (ky, nguon);

commit;

-- ── 4. VỀ SỚM CHẤM TAY ──────────────────────────────────────────────────────
-- Máy chấm công ĐÃ NGỪNG xuất cột "Về sớm" — đo 06/08: 0/388 dòng có giá trị > 0.
-- Nên chấm tay là nguồn DUY NHẤT của về sớm, và nó phải sống ở bảng riêng: hàm
-- nap_cham_cong xoá trọn kỳ rồi chèn lại từ Excel (rpc_nap_cham_cong.sql:60), ghi
-- thẳng vào cham_cong là mỗi tháng mất trắng.
--
-- Chủ app chốt 06/08: KHÔNG sửa nap_cham_cong. Bù lại bằng hàm ap_lai_ve_som_tay
-- (phần 6) + băng cảnh báo lệch trong giao diện.
--
-- ⚠ BẢNG NÀY LÀ BẢNG CASCADE THỨ NĂM trỏ vào nhan_vien. Luồng đổi mã nhân viên ở
--   src/pages/tasks/TaskApp.jsx:1525-1549 phải được sửa để chuyển cả bảng này, không
--   thì đổi mã một người là xoá sạch về sớm chấm tay của họ.
begin;

create table if not exists ve_som_tay (
  id           bigserial primary key,
  ky           text not null,
  nhan_vien_id text not null references nhan_vien(id) on delete cascade,
  ngay         date not null,
  so_phut      int  not null check (so_phut > 0),
  -- BẮT BUỘC: cột này trừ điểm chuyên cần, mà chuyên cần gắn thẳng với lương thưởng.
  -- Một con số không kèm lý do là thứ không cãi lại được khi có người thắc mắc.
  ly_do        text not null,
  nguoi_ghi    text,
  created_at   timestamptz default now(),
  constraint ve_som_tay_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);

create index if not exists ve_som_tay_ky_idx on ve_som_tay (ky);

alter table public.ve_som_tay enable row level security;

drop policy if exists auth_all on public.ve_som_tay;
drop policy if exists vst_sel on public.ve_som_tay;
drop policy if exists vst_ins on public.ve_som_tay;
drop policy if exists vst_upd on public.ve_som_tay;
drop policy if exists vst_del on public.ve_som_tay;

create policy vst_sel on public.ve_som_tay
  for select to authenticated using (true);
create policy vst_ins on public.ve_som_tay
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy vst_upd on public.ve_som_tay
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');
create policy vst_del on public.ve_som_tay
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ── 5. HÀM DỰNG DÒNG CHẤM CÔNG TỪ TIN THÔ ───────────────────────────────────
--
-- ⚠ TUYỆT ĐỐI KHÔNG THÊM `security definer`. Để mặc định (invoker) thì hàm vẫn chịu
--   RLS. Là definer thì người ngoài cầm khoá công khai — thứ nằm sẵn trong mã nguồn,
--   Ctrl+U là thấy — ghi đè được cả bảng chấm công của 13 người.
--
-- ⚠ CHỐT HAY CHƯA LÀ DO HÀM TỰ QUYẾT THEO ĐỒNG HỒ, KHÔNG PHẢI THAM SỐ NGƯỜI GỌI.
--   Bản nháp đầu để `p_chot boolean`. Sai kiểu im lặng: sau khi lượt 17:15 chốt xong,
--   một tin tăng ca lúc 18:00 khiến n8n gọi lại với p_chot = false, hàm tính lại từ
--   đầu và XOÁ SẠCH cờ nghỉ vừa chốt — cả 13 người bỗng thành đi làm đủ.
--
-- ⚠ HÀM CHỈ XÉT NGƯỜI CÓ uid_from. Đo 06/08: 13 người có ten_cham_cong nhưng chỉ 5
--   người có uid_from → hàm hiện chỉ phủ 5 người. 8 người còn lại KHÔNG được ghi dòng
--   nào (không chấm, cũng không bị ghi nghỉ oan). Điền uid_from là mở rộng phạm vi.
begin;

create or replace function dung_cham_cong_zalo(p_tu date, p_den date)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hom_nay date;
  v_gio_vn  time;
  v_ghi int;
begin
  if p_tu is null or p_den is null or p_den < p_tu then
    return jsonb_build_object('loi', 'Khoảng ngày không hợp lệ');
  end if;
  if p_den - p_tu > 366 then
    return jsonb_build_object('loi', 'Khoảng ngày quá dài, tối đa 366 ngày');
  end if;

  v_hom_nay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_gio_vn  := (now() at time zone 'Asia/Ho_Chi_Minh')::time;

  with ngay_xet as (
    -- T2..T7. Chủ nhật không xét gì cả.
    select d::date as ngay
    from generate_series(p_tu, p_den, interval '1 day') d
    where extract(dow from d) between 1 and 6
  ),
  nguoi as (
    -- 13 người kho = có ten_cham_cong. Bắt buộc có uid_from, không thì không nhận
    -- được tin của họ và ghi nghỉ oan mỗi ngày.
    select id as nhan_vien_id, name as ten, uid_from
    from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_from, '') <> ''
  ),
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '04:00' and z.gio < time '12:00' then 'S'
                when z.gio >= time '12:00' and z.gio < time '17:00' then 'C'
                else null end as buoi,      -- từ 17:00 là tăng ca, không dùng để chấm
           z.gio
    from (
      select uid_from, ngay, content,
             (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
      from zalo_cham_cong
      where ngay between p_tu and p_den
    ) z
    join nguoi n on n.uid_from = z.uid_from
    where zalo_khop_ten(z.content, n.ten)
  ),
  dau_buoi as (
    -- Nhắn hai lần trong cùng buổi thì lấy lần đầu.
    select nhan_vien_id, ngay, buoi, min(gio) as gio
    from tin where buoi is not null
    group by 1, 2, 3
  ),
  co_ai as (
    -- VAN AN TOÀN, theo TỪNG BUỔI chứ không theo ngày. n8n chết lúc 12h trưa thì cả 13
    -- người đủ tin sáng nhưng trắng tin chiều — van theo ngày sẽ gạch 'Nghỉ chiều' cho
    -- đủ 13 người, mất 0,5 ngày mỗi người, không ai biết vì sao.
    -- Van này che cùng lúc: ngày lễ, n8n chết, Zalo rớt phiên đăng nhập.
    select ngay,
           bool_or(buoi = 'S') as co_sang,
           bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select
      nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '17:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false)
        -- Chiều thứ 7 lần thứ 2 và lần thứ 4 của tháng được nghỉ.
        -- ceil(ngày/7): 1-7 → lần 1, 8-14 → lần 2, 15-21 → lần 3, 22-28 → lần 4.
        and not (extract(dow from nx.ngay) = 6
                 and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as xet_chieu
    from ngay_xet nx
    cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
  ),
  co_cua as (
    select t.*,
           (t.da_dong_so and t.xet_sang  and t.gio_sang  is null) as thieu_sang,
           (t.da_dong_so and t.xet_chieu and t.gio_chieu is null) as thieu_chieu
    from tinh t
  ),
  ket as (
    select
      cc.ngay, cc.nhan_vien_id, cc.gio_sang, cc.gio_chieu,
      (cc.thieu_sang or cc.thieu_chieu) as nghi,
      case when cc.thieu_sang and cc.thieu_chieu then 'Nghỉ'
           when cc.thieu_sang  then 'Nghỉ sáng'
           when cc.thieu_chieu then 'Nghỉ chiều'
           else null end as nghi_text,
      (coalesce(greatest(0, extract(epoch from (cc.gio_sang  - time '08:00')) / 60), 0)
       + coalesce(greatest(0, extract(epoch from (cc.gio_chieu - time '13:30')) / 60), 0))::int
        as di_muon_phut
    from co_cua cc
    -- Chỉ ghi dòng có căn cứ: hoặc người đó có tin, hoặc buổi đó đang được xét (để ghi nghỉ).
    where cc.gio_sang is not null or cc.gio_chieu is not null
       or cc.thieu_sang or cc.thieu_chieu
  )
  insert into cham_cong (
    ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
    tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nguon)
  select
    to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN'
         else 'T' || (extract(dow from k.ngay) + 1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null,
    null,                                   -- tăng ca: một tin lúc bắt đầu không nói được
                                            -- tăng ca bao nhiêu phút. Không bịa số.
    k.di_muon_phut,
    coalesce(v.so_phut, 0),                 -- về sớm chấm tay THẮNG, không bị dựng lại về 0
    k.nghi, k.nghi_text, 'ZALO'
  from ket k
  left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky           = excluded.ky,
    thu          = excluded.thu,
    gio_in_sang  = excluded.gio_in_sang,
    gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut,
    ve_som_phut  = excluded.ve_som_phut,
    nghi         = excluded.nghi,
    nghi_text    = excluded.nghi_text
  -- ⚠ CHỐT CHẶN QUAN TRỌNG NHẤT CỦA CẢ TÍNH NĂNG. Ngày nào Excel đã nạp thì dòng đó
  --   nguon = 'MAY', điều kiện sai, Zalo KHÔNG CHẠM VÀO ĐƯỢC. Bỏ mệnh đề này là số
  --   "ai nhớ nhắn" đè lên số "ai quẹt vân tay".
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object('so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den);
end $$;

revoke execute on function dung_cham_cong_zalo(date, date) from public;
revoke execute on function dung_cham_cong_zalo(date, date) from anon;
grant  execute on function dung_cham_cong_zalo(date, date) to authenticated;

commit;

-- ── HOÀN TÁC PHẦN 5 — dán chạy được ngay ────────────────────────────────────
-- Gỡ hàm KHÔNG xoá dòng chấm công nào. Muốn gỡ luôn số Zalo đã dựng thì chạy thêm
-- lệnh delete bên dưới — nó chỉ đụng dòng nguon = 'ZALO', dòng máy vân tay không hề gì.
--
--   drop function if exists dung_cham_cong_zalo(date, date);
--   -- tuỳ chọn, chỉ khi muốn xoá hẳn số Zalo đã dựng của MỘT kỳ:
--   -- delete from cham_cong where nguon = 'ZALO' and ky = '2026-08';
--
-- Kiểm lại sau khi hoàn tác:
--   select count(*) from cham_cong where nguon = 'ZALO';
