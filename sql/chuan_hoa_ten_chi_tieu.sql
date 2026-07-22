-- ════════════════════════════════════════════════════════════════════════════
-- CHUẨN HOÁ TÊN CHỈ TIÊU KPI
-- Gộp các tên "cùng nội dung nhưng khác ký tự" về một tên chuẩn, để sau này map
-- chỉ tiêu với dữ liệu app cho gọn và người đọc thấy nhất quán.
--
-- Áp cho MỌI kỳ (không lọc theo ky): tháng 6, tháng 7. Các kỳ sau tạo bằng nút
-- "Tạo kỳ ... từ kỳ trước" sẽ copy tên đã sạch nên tự đồng bộ, không phải chạy lại.
--
-- AN TOÀN:
--   • Chạy lại nhiều lần cũng được (idempotent): lần sau không còn biến thể để đổi.
--   • Đổi tên KHÔNG đụng điểm/nhật ký — nhật ký gắn theo id chỉ tiêu, không theo tên.
--   • Dán toàn bộ vào Supabase SQL Editor, bấm Run.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ① Lệch ký tự thuần: "5 S" (12 người) → "5S" (dạng chuẩn của phương pháp 5S).
update kpi_chi_tieu set ten = '5S'                       where ten = '5 S';

-- ② Viết tắt / thêm chữ → tên chuẩn "KIỂM SOÁT CHẤT LƯỢNG" (chủ app chọn).
update kpi_chi_tieu set ten = 'KIỂM SOÁT CHẤT LƯỢNG'
  where ten in ('KS CHẤT LƯỢNG', 'KIỂM SOÁT CHẤT LƯỢNG, SỐ LƯỢNG');

-- ③ Rút gọn của Hà → tên đầy đủ cả team đang dùng.
update kpi_chi_tieu set ten = 'ĐÓNG GÓP CẢI TIẾN'         where ten = 'CẢI TIẾN';

-- ④ Chính tả tiếng Việt thống nhất: kĩ → kỹ, tỷ → tỉ (theo số đông).
update kpi_chi_tieu set ten = 'VIDEO KỸ THUẬT'            where ten = 'VIDEO KĨ THUẬT';
update kpi_chi_tieu set ten = 'TỈ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH'
  where ten = 'TỶ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH';

-- ⑤ Lỗi gõ trong sheet của Hà.
update kpi_chi_tieu set ten = 'CHỨNG TỪ NHẬP XUẤT'        where ten = 'CHỨNG TÙ NHẬP XUẤT';
update kpi_chi_tieu set ten = 'BÁO CÁO CHI TIẾT HÀNG KHO CHỜ XỬ LÝ'
  where ten = 'BÁO CÁO CHI TIẾT HÀNG KHO CHỞ XỬ LÝ';

commit;

-- ── KIỂM TRA SAU KHI CHẠY ───────────────────────────────────────────────────
-- Kỳ vọng: KHÔNG trả về dòng nào (mọi biến thể cũ đã được đổi hết).
select ten, count(*) as con_sot
from kpi_chi_tieu
where ten in (
  '5 S', 'KS CHẤT LƯỢNG', 'KIỂM SOÁT CHẤT LƯỢNG, SỐ LƯỢNG', 'CẢI TIẾN',
  'VIDEO KĨ THUẬT', 'TỶ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH',
  'CHỨNG TÙ NHẬP XUẤT', 'BÁO CÁO CHI TIẾT HÀNG KHO CHỞ XỬ LÝ'
)
group by ten;
