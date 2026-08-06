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
