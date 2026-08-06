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

-- ── 2b. NHẬN TIN KHAI NGHỈ (chủ app bổ sung 06/08/2026) ─────────────────────
-- So CÓ DẤU, theo TỪ. Khác zalo_khop_ten ở chỗ KHÔNG bỏ dấu — bắt buộc phải thế để phân
-- biệt 'nghỉ' (nghỉ làm) với 'nghĩ' (suy nghĩ).
--
-- Đo 06/08 trên 25.643 tin nhắn THẬT của công ty: 'nghỉ' 90 tin · 'nghĩ' 25 tin ·
-- 'nghi' (thiếu dấu) 233 tin. Bỏ dấu rồi so là gộp cả 25 tin "suy nghĩ" thành nghỉ làm —
-- 25 lần trừ oan 3 điểm chuyên cần.
create or replace function zalo_co_tu(p_content text, p_tu text) returns boolean
language sql immutable as $$
  select position(
    ' ' || lower(normalize(coalesce(p_tu, ''), nfc)) || ' '
    in ' ' || btrim(regexp_replace(lower(normalize(coalesce(p_content, ''), nfc)),
                                   '[^[:alnum:]]+', ' ', 'g')) || ' ') > 0
$$;

-- null = không phải tin khai nghỉ. Ngược lại trả đúng BA giá trị mà cột cham_cong.nghi_text
-- đang dùng, để luật KPI (trongSoNgayNghi trong kpiTuDong.js) quy ra 0,5 hay 1 ngày mà
-- không phải sửa dòng nào.
--
-- Bắt cả 'nghỉ' lẫn 'nghi' (gõ thiếu dấu), KHÔNG bắt 'nghĩ'. Chữ 'sáng'/'chiều' thì so
-- KHÔNG dấu vì hai chữ đó không đụng chữ nào khác.
create or replace function zalo_loai_nghi(p_content text) returns text
language sql immutable as $$
  select case
    when not (zalo_co_tu(p_content, 'nghỉ') or zalo_co_tu(p_content, 'nghi')) then null
    when zalo_khop_ten(p_content, 'sáng') and not zalo_khop_ten(p_content, 'chiều') then 'Nghỉ sáng'
    when zalo_khop_ten(p_content, 'chiều') and not zalo_khop_ten(p_content, 'sáng') then 'Nghỉ chiều'
    -- Nhắc CẢ HAI buổi, hoặc không nhắc buổi nào ('nghỉ', 'nghỉ hôm nay') → trọn ngày.
    else 'Nghỉ'
  end
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

-- ── HOÀN TÁC PHẦN 3 + 4 ─────────────────────────────────────────────────────
-- ⚠ Xoá ve_som_tay là mất HẲN mọi số về sớm chấm tay: máy chấm công đã ngừng xuất
--   cột đó nên không nguồn nào dựng lại được. Sao ra chỗ khác trước khi chạy.
--   drop table if exists ve_som_tay;
--   alter table cham_cong drop constraint if exists cham_cong_nguon_hop_le;
--   drop index if exists cham_cong_nguon_idx;
--   alter table cham_cong drop column if exists nguon;

-- ── 4b. CỘT MÃ ZALO DÙNG CHO CHẤM CÔNG ──────────────────────────────────────
-- ⚠ VÌ SAO KHÔNG DÙNG LẠI CỘT `nhan_vien.uid_from` SẴN CÓ:
--   Mã Zalo của CÙNG một người KHÁC NHAU tuỳ tài khoản nào đang nghe. Đo 06/08/2026 trên
--   chính nhóm "Euromade - Chấm Công" (28 thành viên):
--     tài khoản 'Hà Xuyên' thấy Nguyên là 354919541537207776
--     tài khoản 'Nguyen'   thấy Nguyên là 715086275848796206
--   Cột `uid_from` mang mã theo tài khoản CŨ và còn luồng khác dùng, nên chủ app chốt:
--   giữ nguyên cột đó, chấm công dùng cột riêng này.
--
--   Hệ quả phải nhớ: ĐỔI TÀI KHOẢN ZALO chạy workflow chấm công là phải lấy lại toàn bộ
--   13 mã. Lấy bằng API nhóm (memberIds + profiles), hoặc để tin chảy vào rồi nối lại
--   bằng ô "Nối mã Zalo" trong tab Chấm công.
begin;

alter table nhan_vien add column if not exists uid_zalo_cham_cong text;

-- Chỉ mục DUY NHẤT không phải trang trí: hai nhân viên mang cùng một mã Zalo thì mọi tin
-- của người đó được tính cho CẢ HAI và không ai nhìn ra. Cùng khuôn với ten_cham_cong.
--
-- ⚠ Chỉ mục này BẮT BUỘC kéo theo sửa luồng đổi mã nhân viên (TaskApp.jsx ~1502): dòng mã
--   mới được insert KHI dòng mã cũ CÒN trong bảng, nên phải tách cột này khỏi bản sao rồi
--   đặt lại sau khi xoá dòng cũ — y hệt cách ten_cham_cong đang làm. Quên là cả luồng đổi
--   mã chết ngay câu insert đầu tiên với lỗi trùng khoá.
create unique index if not exists nhan_vien_uid_zalo_cham_cong_uniq
  on nhan_vien (uid_zalo_cham_cong) where uid_zalo_cham_cong is not null;

-- 13 người kho, ghép từ danh sách thành viên nhóm lấy ngày 06/08/2026.
-- Cột cuối là căn cứ ghép — ba dòng ⚠ là SUY RA, chưa có tin thật xác nhận.
update nhan_vien nv set uid_zalo_cham_cong = m.uid
from (values
  ('nxt',  '5216613630694207655'),  -- 'Nguyễn Xuân Thiện' — trùng khít họ tên chấm công
  ('vta',  '8620061781178272354'),  -- 'Vương Tuấn Anh'    — trùng khít họ tên chấm công
  ('admin','715086275848796206'),   -- 'Nguyen'      — tin thử 19:30 06/08 gửi từ mã này
  ('ndp',  '8209801293158810413'),  -- 'Kỹ Thuật Thế Giới Lọc Nước' — ảnh nhóm: nhắn "phong"
  ('nbn',  '6165910552867199315'),  -- 'Ba Ngoc'     — ảnh nhóm: nhắn "Ngoc"
  ('nttd', '2822985467255068655'),  -- 'Thùy Dương'
  ('lvb',  '5220132592047039667'),  -- 'Bich Levan'
  ('hhx',  '7700874541300459549'),  -- 'Hà Xuyên'
  ('nv8',  '9105739124680441244'),  -- 'Nguyễn Duyên'
  ('dvx',  '2490010794619253068'),  -- 'Xuân'
  ('ptt',  '3521619927191941661'),  -- 'Quỳnh Thơ'   ⚠ suy ra
  ('ntth', '4100632916116917546'),  -- 'Hà Nguyễn'   ⚠ suy ra
  ('nvh',  '7361981328537178345')   -- 'N V H'       ⚠ suy ra từ chữ viết tắt
) as m(id, uid) where nv.id = m.id;

commit;

-- Ghép nhầm KHÔNG âm thầm gán sang người khác: hàm dựng còn đòi nội dung tin phải chứa
-- TÊN GỌI của chính người đó, mà 13 tên gọi đều khác nhau. Ghép sai thì tin không khớp gì
-- cả → không sinh dòng → thấy ngay là thiếu.

-- KIỂM TRA
--   select count(*) from nhan_vien where ten_cham_cong is not null and uid_zalo_cham_cong is null;
--   -- kỳ vọng 0
-- HOÀN TÁC PHẦN 4b
--   drop index if exists nhan_vien_uid_zalo_cham_cong_uniq;
--   alter table nhan_vien drop column if exists uid_zalo_cham_cong;

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
returns jsonb language plpgsql set search_path = public, pg_temp
as $$
declare v_hom_nay date; v_gio_vn time; v_ghi int;
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
    select d::date as ngay from generate_series(p_tu, p_den, interval '1 day') d
    where extract(dow from d) between 1 and 6
  ),
  nguoi as (
    select id as nhan_vien_id, name as ten, uid_zalo_cham_cong as uid from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_zalo_cham_cong, '') <> ''
  ),
  tho as (
    select uid_from, ngay, content,
           (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
    from zalo_cham_cong where ngay between p_tu and p_den
  ),
  -- Tin KHAI NGHỈ. KHÔNG giới hạn khung giờ: "nghỉ hôm nay" nhắn lúc nào cũng là khai nghỉ.
  --
  -- Chỉ nhận khi tin nhắc tên CHÍNH người gửi, hoặc không nhắc tên ai cả ("em xin nghỉ hôm
  -- nay"). Tin nhắc tên NGƯỜI KHÁC bị bỏ qua hoàn toàn — chủ app chốt 06/08 sau khi thấy tin
  -- thật "Bích tăng ca 17h30 đến 19h30" gửi từ máy Hà: nếu bắt chữ "nghỉ" mà không xét tên
  -- thì "Bích nghỉ hôm nay" sẽ ghi nghỉ cho HÀ — người đang đi làm và báo hộ đồng nghiệp.
  tin_nghi as (
    select n.nhan_vien_id, z.ngay, zalo_loai_nghi(z.content) as loai, z.gio, z.content
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_loai_nghi(z.content) is not null
      and (zalo_khop_ten(z.content, n.ten)
           or not exists (select 1 from nguoi o
                          where o.nhan_vien_id <> n.nhan_vien_id
                            and zalo_khop_ten(z.content, o.ten)))
  ),
  khai as (
    select nhan_vien_id, ngay,
           bool_or(loai = 'Nghỉ')       as khai_ngay,
           bool_or(loai = 'Nghỉ sáng')  as khai_s,
           bool_or(loai = 'Nghỉ chiều') as khai_c,
           (array_agg(content order by gio))[1] as tin_dau
    from tin_nghi group by 1, 2
  ),
  -- Tin CHẤM CÔNG. Loại hẳn tin khai nghỉ: "Hà nghỉ chiều" có chứa chữ "Hà" nhưng là khai
  -- nghỉ chứ không phải chấm công — để nguyên thì nó thành giờ vào lúc 11h.
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '04:00' and z.gio < time '12:00' then 'S'
                when z.gio >= time '12:00' and z.gio < time '17:00' then 'C' else null end as buoi,
           z.gio
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_khop_ten(z.content, n.ten) and zalo_loai_nghi(z.content) is null
  ),
  dau_buoi as (
    select nhan_vien_id, ngay, buoi, min(gio) as gio from tin where buoi is not null group by 1,2,3
  ),
  co_ai as (
    -- VAN AN TOÀN theo TỪNG BUỔI. n8n chết lúc trưa thì cả nhóm đủ tin sáng nhưng trắng tin
    -- chiều — van theo ngày sẽ gạch 'Nghỉ chiều' cho cả 13 người. Che cùng lúc: ngày lễ,
    -- n8n chết, Zalo rớt phiên. KHÔNG áp cho tin khai nghỉ: khai nghỉ là bằng chứng trực tiếp.
    select ngay, bool_or(buoi = 'S') as co_sang, bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '17:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false) as co_chieu,
      -- Lịch tách RIÊNG khỏi van an toàn: khai nghỉ chiều vào chiều T7 tuần 2/4 thì không ghi,
      -- vì hôm đó vốn không có buổi chiều để mà nghỉ.
      not (extract(dow from nx.ngay) = 6
           and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as lich_co_chieu,
      coalesce(k.khai_ngay, false) as khai_ngay,
      coalesce(k.khai_s, false)    as khai_s,
      coalesce(k.khai_c, false)    as khai_c,
      k.tin_dau
    from ngay_xet nx cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
    left join khai    k  on k.nhan_vien_id = ng.nhan_vien_id and k.ngay = nx.ngay
  ),
  co_cua as (
    select t.*,
      (t.khai_ngay or t.khai_s) as nghi_s,
      ((t.khai_ngay or t.khai_c) and t.lich_co_chieu) as nghi_c
    from tinh t
  ),
  cu as (
    select c.*,
      -- Khai nghỉ THẮNG: bỏ luôn giờ vào của buổi đó, không thì dòng tự mâu thuẫn
      -- ("Nghỉ sáng" mà vẫn có giờ vào buổi sáng).
      case when c.nghi_s then null else c.gio_sang end as gs,
      case when c.nghi_c then null else c.gio_chieu end as gc,
      (c.nghi_s or (c.da_dong_so and c.xet_sang and c.gio_sang is null))                      as thieu_sang,
      (c.nghi_c or (c.da_dong_so and c.co_chieu and c.lich_co_chieu and c.gio_chieu is null)) as thieu_chieu
    from co_cua c
  ),
  ket as (
    select cu.ngay, cu.nhan_vien_id, cu.gs as gio_sang, cu.gc as gio_chieu,
      (cu.thieu_sang or cu.thieu_chieu) as nghi,
      case when cu.thieu_sang and cu.thieu_chieu then 'Nghỉ'
           when cu.thieu_sang then 'Nghỉ sáng'
           when cu.thieu_chieu then 'Nghỉ chiều' else null end as nghi_text,
      -- Nguyên văn tin gây ra nghỉ, để người bị trừ điểm thấy được câu nào chứ không phải đoán.
      case when cu.tin_dau is not null then 'Nghỉ theo tin Zalo: "' || cu.tin_dau || '"' end as nghi_van,
      (coalesce(floor(greatest(0, extract(epoch from (cu.gs - time '08:00')) / 60)), 0)
       + coalesce(floor(greatest(0, extract(epoch from (cu.gc - time '13:30')) / 60)), 0))::int
        as di_muon_phut
    from cu
    where cu.gs is not null or cu.gc is not null or cu.thieu_sang or cu.thieu_chieu
  )
  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nghi_van, nguon)
  select to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN' else 'T' || (extract(dow from k.ngay)+1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null, null,
    k.di_muon_phut, coalesce(v.so_phut, 0), k.nghi, k.nghi_text, k.nghi_van, 'ZALO'
  from ket k left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky = excluded.ky, thu = excluded.thu,
    gio_in_sang = excluded.gio_in_sang, gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut, ve_som_phut = excluded.ve_som_phut,
    nghi = excluded.nghi, nghi_text = excluded.nghi_text, nghi_van = excluded.nghi_van
  -- ⚠ CHỐT CHẶN QUAN TRỌNG NHẤT. Ngày nào Excel đã nạp thì dòng đó nguon = 'MAY', điều kiện
  --   sai, Zalo KHÔNG CHẠM VÀO ĐƯỢC. Bỏ mệnh đề này là số "ai nhớ nhắn" đè lên số "ai quẹt
  --   vân tay".
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

-- ── 6. ÁP LẠI VỀ SỚM CHẤM TAY ───────────────────────────────────────────────
-- Dùng sau khi nạp Excel: nap_cham_cong xoá trọn kỳ (rpc_nap_cham_cong.sql:60) nên bản
-- phản chiếu về sớm trong cham_cong về 0. DỮ LIỆU GỐC KHÔNG MẤT — nó nằm ở ve_som_tay
-- mà hàm nạp không đụng tới. Hàm này chỉ dựng lại bản phản chiếu.
--
-- Chạy lại bao nhiêu lần cũng ra cùng kết quả, nên rớt mạng thì bấm lại, không có trạng
-- thái dở dang. Đây chính là lý do chủ app chọn được phương án "không sửa nap_cham_cong"
-- mà vẫn không mất dữ liệu.
--
-- Trả về HAI con số, không gộp làm một:
--   so_ap        — số dòng vừa sửa được. Bấm nút là về 0.
--   so_thieu_dong — số dòng về sớm KHÔNG có ngày công tương ứng trong cham_cong. UPDATE
--                   không tạo được dòng nên nút này không với tới; phải dựng lại từ Zalo
--                   hoặc nạp Excel. Gộp chung là người dùng bấm mãi mà con số không về 0.
--
-- ⚠ KHÔNG `security definer` — cùng lý do như hàm dựng ở phần 5.
begin;

create or replace function ap_lai_ve_som_tay(p_ky text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_ap int; v_thieu int;
begin
  if p_ky is null or p_ky !~ '^[0-9]{4}-[0-9]{2}$' then
    return jsonb_build_object('loi', 'Kỳ không hợp lệ, phải dạng YYYY-MM');
  end if;

  update cham_cong c
     set ve_som_phut = v.so_phut
    from ve_som_tay v
   where v.nhan_vien_id = c.nhan_vien_id
     and v.ngay = c.ngay
     and v.ky = p_ky
     and c.ve_som_phut is distinct from v.so_phut;
  get diagnostics v_ap = row_count;

  select count(*) into v_thieu
  from ve_som_tay v
  where v.ky = p_ky
    and not exists (select 1 from cham_cong c
                    where c.nhan_vien_id = v.nhan_vien_id and c.ngay = v.ngay);

  return jsonb_build_object('so_ap', v_ap, 'so_thieu_dong', v_thieu);
end $$;

revoke execute on function ap_lai_ve_som_tay(text) from public;
revoke execute on function ap_lai_ve_som_tay(text) from anon;
grant  execute on function ap_lai_ve_som_tay(text) to authenticated;

commit;

-- ── HOÀN TÁC PHẦN 6 ─────────────────────────────────────────────────────────
--   drop function if exists ap_lai_ve_som_tay(text);
