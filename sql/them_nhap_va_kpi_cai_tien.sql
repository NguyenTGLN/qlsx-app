-- ════════════════════════════════════════════════════════════════════════════
-- CẢI TIẾN đợt 2 (24/07/2026): trạng thái NHÁP + chấm KPI tự động.
-- Chạy SAU sql/create_cai_tien.sql. Chạy tay trên Supabase SQL Editor,
-- chạy lại nhiều lần đều an toàn.
--
-- 1) Thêm trạng thái NHAP: nhân viên bấm "Lưu nháp" — bài lưu lại cho riêng
--    mình, CHƯA gửi duyệt. Nháp là của riêng tác giả: người khác (kể cả admin)
--    không thấy trong feed.
-- 2) Đánh dấu chỉ tiêu ĐÓNG GÓP CẢI TIẾN chấm TỰ ĐỘNG: app đếm bài ĐÃ DUYỆT
--    theo tháng của MỐC DUYỆT (reviewed_at), tối thiểu 2 bài/tháng (luật ở
--    src/lib/kpiTuDong.js — luatDongGopCaiTien). Như các chỉ tiêu tự động khác,
--    cach_cham='TU_DONG' chỉ để giao diện KHÓA nút chấm tay; điểm tính live.
--    Kỳ TRƯỚC 2026-07 luật tự trả "không chấm" nên điểm tay cũ không bị đè.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1a. Nới ràng buộc trạng thái ─────────────────────────────────────────────
alter table cai_tien drop constraint if exists cai_tien_status_check;
alter table cai_tien add constraint cai_tien_status_check
  check (status in ('NHAP','CHO_DUYET','DA_DUYET','CAN_BO_SUNG','TU_CHOI'));

-- ── 1b. RLS đọc: giấu nháp của người khác ────────────────────────────────────
-- Feed vẫn công khai nội bộ, riêng bài NHAP chỉ tác giả thấy — nháp là chỗ
-- viết dở, đưa lên feed chung (hay cho admin soi) là không ai dám lưu nháp nữa.
drop policy if exists ct_sel on public.cai_tien;
create policy ct_sel on public.cai_tien
  for select to authenticated
  using (
    status <> 'NHAP'
    or coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id
  );

-- ── 1c. RLS sửa: tác giả sửa được cả bài NHÁP ────────────────────────────────
-- Giữ nguyên phần còn lại của luật cũ: ADMIN mọi lúc; tác giả khi bài chưa chốt.
drop policy if exists ct_upd on public.cai_tien;
create policy ct_upd on public.cai_tien
  for update to authenticated
  using (
    coalesce(auth.jwt()->>'nv_role','') = 'ADMIN'
    or (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id
        and status in ('NHAP','CHO_DUYET','CAN_BO_SUNG'))
  )
  with check (
    coalesce(auth.jwt()->>'nv_role','') = 'ADMIN'
    or (coalesce(auth.jwt()->>'nv_id','') = nhan_vien_id
        and status in ('NHAP','CHO_DUYET','CAN_BO_SUNG'))
  );

-- (ct_del giữ nguyên: tác giả xóa được mọi bài chưa DA_DUYET — gồm cả nháp.)

-- ── 2. Chỉ tiêu ĐÓNG GÓP CẢI TIẾN → chấm tự động ─────────────────────────────
-- Áp cho MỌI kỳ như danh_dau_chi_tieu_tu_dong.sql: kỳ cũ luật tự trả "không
-- chấm" (xem đầu file), nên đánh dấu toàn bộ không làm hỏng điểm lịch sử.
update kpi_chi_tieu
set cach_cham = 'TU_DONG'
where ma = 'DONG_GOP_CAI_TIEN'
  and cach_cham is distinct from 'TU_DONG';

commit;

-- ⚠ NHẮC LẠI: sql/security_3_rls_lockdown.sql chạy lại sẽ đè policy ct_* —
--   khi đó phải chạy lại create_cai_tien.sql RỒI file này (đúng thứ tự).

-- KIỂM TRA SAU KHI CHẠY
-- 1) Ràng buộc mới phải chứa NHAP:
select pg_get_constraintdef(oid) from pg_constraint where conname = 'cai_tien_status_check';
-- 2) Kỳ vọng ct_sel/ct_upd vừa tạo lại + ct_ins/ct_del cũ, không có auth_all:
select policyname, cmd from pg_policies where tablename = 'cai_tien' order by policyname;
-- 3) Chỉ tiêu cải tiến đã TU_DONG (mỗi kỳ một dòng, cach_cham = TU_DONG):
select ky, cach_cham, count(*) from kpi_chi_tieu where ma = 'DONG_GOP_CAI_TIEN' group by ky, cach_cham order by ky;
