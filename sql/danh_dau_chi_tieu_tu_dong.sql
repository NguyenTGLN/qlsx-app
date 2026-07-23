-- ════════════════════════════════════════════════════════════════════════════
-- ĐÁNH DẤU 5 CHỈ TIÊU CHẤM TỰ ĐỘNG
-- Dán vào Supabase SQL Editor, bấm Run. Chạy lại nhiều lần đều an toàn.
--
-- `cach_cham = 'TU_DONG'` KHÔNG làm app tính điểm — điểm vẫn tính ở phía app từ bảng
-- cong_viec_duoc_giao mỗi lần mở màn hình. Cột này chỉ để giao diện biết mà KHOÁ nút chấm
-- tay: chấm tay lên chỉ tiêu tự động chỉ tạo ảo giác, vì lần mở sau điểm tự động lại đè lên.
--
-- Áp cho MỌI kỳ, không chỉ 2026-07: mở lại tháng 6 thì các chỉ tiêu này cũng phải tính
-- tự động, nếu không cùng một chỉ tiêu lại chấm hai kiểu ở hai tháng.
--
-- ⚠ CHUYEN_CAN_CA_NHAN CỐ Ý KHÔNG có trong danh sách. Bảng chấm công không có "có phép /
--   không phép", "quên chấm công", "chấm công sai" — ba thứ chiếm phần lớn quy định trừ điểm
--   của chỉ tiêu đó. App vẫn tính phần đo được và hiện diễn giải, nhưng nút chốt tay phải để
--   MỞ cho người chấm trừ nốt phần máy không biết; điểm chốt tay sẽ thắng điểm tự động.
--   Đánh dấu TU_DONG sẽ khoá nút đó và phần còn thiếu vĩnh viễn không ai trừ được.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update kpi_chi_tieu
set cach_cham = 'TU_DONG'
where ma in ('HT_CONG_VIEC_DUNG_HAN', 'VIDEO_KY_THUAT', 'BC_KET_QUA_CONG_VIEC', 'SAN_XUAT', 'CHUYEN_CAN_BO_PHAN')
  and cach_cham is distinct from 'TU_DONG';

commit;

-- KIỂM TRA: kỳ vọng đúng 5 mã, mỗi mã CHỈ MỘT dòng kết quả (một dòng = còn sót THU_CONG).
select ma, min(ten) ten, cach_cham, count(*) so_dong
from kpi_chi_tieu
where ma in ('HT_CONG_VIEC_DUNG_HAN', 'VIDEO_KY_THUAT', 'BC_KET_QUA_CONG_VIEC', 'SAN_XUAT', 'CHUYEN_CAN_BO_PHAN')
group by ma, cach_cham order by ma, cach_cham;
