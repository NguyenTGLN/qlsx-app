-- ============================================================
-- SIẾT RLS CHO 2 BẢNG KPI — chỉ ADMIN được ghi.
-- Chạy SAU sql/create_kpi_module.sql, trên Supabase SQL Editor.
--
-- ⚠⚠ THỨ TỰ CHẠY BẮT BUỘC — ĐỌC TRƯỚC KHI ĐỘNG VÀO RLS CỦA APP:
--
--      1. sql/security_3_rls_lockdown.sql   (nếu cần chạy — xem cảnh báo dưới)
--      2. sql/create_kpi_module.sql         (tạo bảng, bật RLS, KHÔNG tạo policy)
--      3. sql/rls_kpi_admin_only.sql        (FILE NÀY — tạo 8 policy ADMIN)
--
--   File này PHẢI là file chạy CUỐI CÙNG trong nhóm trên. Chạy xong bước 3 mà sau
--   này chạy lại bước 1 hoặc 2 thì phải chạy lại bước 3, nếu không quyền ghi KPI
--   hỏng (mở toang hoặc khoá sạch).
--
-- ⚠⚠ CẢNH BÁO VỀ sql/security_3_rls_lockdown.sql:
--   File đó có vòng `do $$` quét MỌI bảng trong schema public, DROP MỌI policy của
--   từng bảng rồi tạo lại `auth_all ... using(true) with check(true)`. Nó KHÔNG biết
--   gì về KPI, nên chạy lại nó sau file này sẽ XOÁ SẠCH 8 policy ADMIN bên dưới và
--   thay bằng một policy mở toang — nhân viên thường lại tự sửa được điểm KPI của
--   chính mình qua API, mà điểm KPI gắn thẳng với lương thưởng.
--   → Mỗi lần chạy security_3_rls_lockdown.sql, BẮT BUỘC chạy lại file này ngay sau.
--   → Kiểm chứng: select policyname from pg_policies
--                  where tablename in ('kpi_chi_tieu','kpi_nhat_ky');
--     Kỳ vọng 8 dòng kpi_ct_*/kpi_nk_*, và TUYỆT ĐỐI không có dòng `auth_all`.
--
-- Vì sao siết riêng 2 bảng này trong khi các bảng khác của app mở cho mọi user
-- đã đăng nhập: KPI gắn trực tiếp với lương thưởng. Nếu chỉ chặn ở tầng giao diện
-- thì nhân viên biết dùng công cụ lập trình có thể gọi thẳng API sửa điểm của mình
-- mà app không ghi lại dấu vết nào.
--
-- Dựa trên claim `nv_role` trong JWT do public.dang_nhap() phát ra
-- (xem sql/security_2_jwt_and_login.sql), cùng cơ chế đang dùng cho bảng nhan_vien.
--
-- ⚠ HỆ QUẢ PHẢI BIẾT TRƯỚC KHI CHẠY:
--   1. Quản lý KHÔNG phải ADMIN sẽ không chấm điểm được, dù giao diện có bật quyền
--      `edit`. Muốn họ chấm thì phải nâng tài khoản lên ADMIN.
--   2. Nhân viên thường KHÔNG tự điền được ô "KPI nhân viên tự đánh giá"
--      (cột diem_tu_cham). Nếu vẫn muốn giữ tính năng tự đánh giá, bỏ comment
--      khối "TỰ ĐÁNH GIÁ" ở cuối file.
-- ============================================================

begin;

alter table public.kpi_chi_tieu enable row level security;
alter table public.kpi_nhat_ky  enable row level security;

-- Dọn mọi policy mở toang có thể còn sót:
--   kpi_*_all : bản CŨ của create_kpi_module.sql từng tạo (nay đã bỏ hẳn).
--   auth_all  : do security_3_rls_lockdown.sql tạo cho mọi bảng public.
-- Policy RLS là phép OR — sót lại một cái `using(true)` là 8 policy ADMIN dưới đây
-- thành vô nghĩa, nên phải drop trước chứ không chỉ "create thêm".
drop policy if exists kpi_chi_tieu_all on public.kpi_chi_tieu;
drop policy if exists kpi_nhat_ky_all  on public.kpi_nhat_ky;
drop policy if exists auth_all         on public.kpi_chi_tieu;
drop policy if exists auth_all         on public.kpi_nhat_ky;

-- ── kpi_chi_tieu ─────────────────────────────────────────────
-- Đọc: mọi người đã đăng nhập (điểm KPI công khai toàn công ty — quyết định nghiệp vụ).
create policy kpi_ct_sel on public.kpi_chi_tieu
  for select to authenticated using (true);

create policy kpi_ct_ins on public.kpi_chi_tieu
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy kpi_ct_upd on public.kpi_chi_tieu
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy kpi_ct_del on public.kpi_chi_tieu
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

-- ── kpi_nhat_ky ──────────────────────────────────────────────
-- Đọc công khai: nhân viên phải xem được bằng chứng của từng lần cộng/trừ điểm.
create policy kpi_nk_sel on public.kpi_nhat_ky
  for select to authenticated using (true);

create policy kpi_nk_ins on public.kpi_nhat_ky
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy kpi_nk_upd on public.kpi_nhat_ky
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy kpi_nk_del on public.kpi_nhat_ky
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ============================================================
-- TỰ ĐÁNH GIÁ (tuỳ chọn) — chạy khối dưới nếu muốn nhân viên thường tự điền ô
-- "KPI nhân viên tự đánh giá" cho CHÍNH MÌNH.
--
-- Không làm bằng RLS được: ADMIN và nhân viên thường là CÙNG một database role
-- (`authenticated`), phân biệt nhau bằng claim trong JWT — nên `grant update(cột)`
-- không tách được hai nhóm. Còn policy RLS thì không so sánh được OLD với NEW để
-- biết người dùng chỉ sửa đúng cột diem_tu_cham hay sửa lén cả diem_chot.
--
-- Cách đúng: một hàm SECURITY DEFINER chỉ làm đúng một việc, tự kiểm người gọi.
-- ============================================================
-- create or replace function public.tu_cham_kpi(p_chi_tieu_id uuid, p_diem numeric)
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   update kpi_chi_tieu
--      set diem_tu_cham = p_diem
--    where id = p_chi_tieu_id
--      and nhan_vien_id = auth.jwt()->>'nv_id';   -- chỉ dòng của chính người gọi
--
--   if not found then
--     raise exception 'Không tìm thấy chỉ tiêu của bạn, hoặc bạn không có quyền sửa dòng này';
--   end if;
-- end;
-- $$;
--
-- revoke all on function public.tu_cham_kpi(uuid, numeric) from public, anon;
-- grant execute on function public.tu_cham_kpi(uuid, numeric) to authenticated;
--
-- Giao diện gọi: supabase.rpc('tu_cham_kpi', { p_chi_tieu_id: id, p_diem: 7 })
-- Hàm chỉ đụng đúng cột diem_tu_cham và đúng dòng của người gọi — không có đường
-- nào chạm tới diem_chot, trong_so hay dòng của người khác.
