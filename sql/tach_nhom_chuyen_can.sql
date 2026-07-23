-- ════════════════════════════════════════════════════════════════════════════
-- TÁCH CHUYÊN CẦN BỘ PHẬN THÀNH 4 NHÓM (kỳ 2026-07)
--
-- Trước: một dòng BO_PHAN duy nhất nối chung 13 người — một điểm cho tất cả.
-- Sau:   4 nhóm chấm riêng, mỗi người nối vào đúng nhóm của mình.
--
--   CHUYEN_CAN_SX        Sản xuất  — Hĩu, Hà, Tuấn, Thơ, Thiện, Bích, Xuân
--   CHUYEN_CAN_BH        Bảo hành  — Ngọc, Phong
--   CHUYEN_CAN_CSKH      CSKH      — Xuyên, Duyên, Dương
--   CHUYEN_CAN_TOAN_CTY  Toàn cty  — Nguyên (chịu trách nhiệm cả công ty)
--
-- Chỉ đụng kỳ 2026-07. Tháng 6 giữ nguyên làm lịch sử đã chấm.
-- Chạy lại nhiều lần đều an toàn.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1. Tạo 4 dòng chấm chung mới ────────────────────────────────────────────
-- `ma` vẫn là CHUYEN_CAN_BO_PHAN cho cả 4: về bản chất đây vẫn là MỘT chỉ tiêu, chỉ khác
-- phạm vi nhóm. Đặt 4 mã khác nhau sẽ làm luật chấm tự động phải biết cả 4 tên.
insert into kpi_chi_tieu (ky, cap_do, lien_ket_bo_phan, ten, mo_ta, chi_tieu, trong_so, cach_cham, ma)
select '2026-07', 'BO_PHAN', v.khoa, v.ten,
       (select mo_ta from kpi_chi_tieu
        where ky = '2026-07' and cap_do = 'BO_PHAN' and lien_ket_bo_phan = 'CHUYEN_CAN_BO_PHAN'
        limit 1),
       10, 0, 'THU_CONG', 'CHUYEN_CAN_BO_PHAN'
from (values
  ('CHUYEN_CAN_SX',       'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
  ('CHUYEN_CAN_BH',       'CHUYÊN CẦN BỘ PHẬN — BẢO HÀNH'),
  ('CHUYEN_CAN_CSKH',     'CHUYÊN CẦN BỘ PHẬN — CSKH'),
  ('CHUYEN_CAN_TOAN_CTY', 'CHUYÊN CẦN — TOÀN CÔNG TY')
) as v(khoa, ten)
where not exists (
  select 1 from kpi_chi_tieu x
  where x.ky = '2026-07' and x.cap_do = 'BO_PHAN' and x.lien_ket_bo_phan = v.khoa);

-- ── 2. Nối từng người vào đúng nhóm ─────────────────────────────────────────
update kpi_chi_tieu set lien_ket_bo_phan = 'CHUYEN_CAN_SX'
where ky = '2026-07' and cap_do = 'CA_NHAN' and ma = 'CHUYEN_CAN_BO_PHAN'
  and nhan_vien_id in ('nvh', 'ntth', 'vta', 'ptt', 'nxt', 'lvb', 'dvx');

update kpi_chi_tieu set lien_ket_bo_phan = 'CHUYEN_CAN_BH'
where ky = '2026-07' and cap_do = 'CA_NHAN' and ma = 'CHUYEN_CAN_BO_PHAN'
  and nhan_vien_id in ('nbn', 'ndp');

update kpi_chi_tieu set lien_ket_bo_phan = 'CHUYEN_CAN_CSKH'
where ky = '2026-07' and cap_do = 'CA_NHAN' and ma = 'CHUYEN_CAN_BO_PHAN'
  and nhan_vien_id in ('hhx', 'nv8', 'nttd');

update kpi_chi_tieu set lien_ket_bo_phan = 'CHUYEN_CAN_TOAN_CTY'
where ky = '2026-07' and cap_do = 'CA_NHAN' and ma = 'CHUYEN_CAN_BO_PHAN'
  and nhan_vien_id = 'admin';

-- ── 3. Bỏ dòng chấm chung cũ ────────────────────────────────────────────────
-- ⚠ Xoá dòng này CASCADE xoá luôn nhật ký gắn vào nó (ghi chú "Đi muộn … phút" nhập từ
--   Excel). Chấp nhận được vì điểm chuyên cần kỳ 2026-07 sắp tính lại từ bảng cham_cong,
--   nhưng phải biết là mất chứ không phải chuyện âm thầm. Tháng 6 KHÔNG bị đụng.
--   Muốn giữ bằng chứng cũ thì chạy câu select ở PHẦN KIỂM TRA trước, chụp lại rồi mới xoá.
delete from kpi_chi_tieu
where ky = '2026-07' and cap_do = 'BO_PHAN' and lien_ket_bo_phan = 'CHUYEN_CAN_BO_PHAN';

commit;

-- ── KIỂM TRA ────────────────────────────────────────────────────────────────
-- 1. Bốn nhóm và số người mỗi nhóm — kỳ vọng SX 7, BH 2, CSKH 3, TOÀN CTY 1.
select bp.lien_ket_bo_phan, bp.ten,
       (select count(*) from kpi_chi_tieu cn
        where cn.ky = '2026-07' and cn.cap_do = 'CA_NHAN'
          and cn.lien_ket_bo_phan = bp.lien_ket_bo_phan) so_nguoi
from kpi_chi_tieu bp
where bp.ky = '2026-07' and bp.cap_do = 'BO_PHAN' and bp.ma = 'CHUYEN_CAN_BO_PHAN'
order by bp.lien_ket_bo_phan;

-- 2. Ai còn nối vào nhóm cũ hoặc chưa nối vào nhóm nào — kỳ vọng 0 dòng.
--    Có dòng nghĩa là điểm chuyên cần của người đó lấy từ một dòng chung không tồn tại,
--    và engine sẽ báo "thiếu dòng chấm chung" thay vì cho điểm.
select nhan_vien_id, lien_ket_bo_phan
from kpi_chi_tieu
where ky = '2026-07' and cap_do = 'CA_NHAN' and ma = 'CHUYEN_CAN_BO_PHAN'
  and lien_ket_bo_phan not in ('CHUYEN_CAN_SX', 'CHUYEN_CAN_BH', 'CHUYEN_CAN_CSKH', 'CHUYEN_CAN_TOAN_CTY');
