-- ════════════════════════════════════════════════════════════════════════════
-- ĐỔI TÊN "SẢN XUẤT" → "HIỆU SUẤT SẢN XUẤT"
-- Dán vào Supabase SQL Editor, bấm Run. Chạy lại nhiều lần đều an toàn.
--
-- ⚠ MÃ GIỮ NGUYÊN `SAN_XUAT`. Đây chính là lý do cột `ma` tồn tại: tên hiển thị đổi bao
--   nhiêu lần cũng được, mọi thứ bám vào chỉ tiêu (bảng chấm chung, luật chấm tự động, màu
--   nền) đều tra theo mã nên không vỡ. Đổi mã mới là thứ làm hỏng.
--
-- Áp cho MỌI kỳ để tháng 6 và tháng 7 gọi cùng một tên, tra soát lịch sử không bị lệch.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update kpi_chi_tieu
set ten = 'HIỆU SUẤT SẢN XUẤT'
where ma = 'SAN_XUAT' and ten <> 'HIỆU SUẤT SẢN XUẤT';

-- Lưới an toàn cho dòng chưa có mã (nếu còn): bắt theo tên cũ.
update kpi_chi_tieu
set ten = 'HIỆU SUẤT SẢN XUẤT', ma = coalesce(ma, 'SAN_XUAT')
where ten = 'SẢN XUẤT';

commit;

-- KIỂM TRA
-- 1. Không còn dòng nào mang tên cũ — kỳ vọng 0 dòng.
select ky, count(*) so_dong from kpi_chi_tieu where ten = 'SẢN XUẤT' group by ky;

-- 2. Mã SAN_XUAT giờ chỉ còn đúng MỘT tên. Ra 2 dòng nghĩa là còn sót chỗ chưa đổi.
select ma, ten, count(*) so_dong
from kpi_chi_tieu where ma = 'SAN_XUAT' group by ma, ten order by ten;
