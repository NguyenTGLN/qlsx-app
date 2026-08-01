-- ════════════════════════════════════════════════════════════════════════════
-- GỠ "ĐÓNG GÓP CẢI TIẾN" KHỎI BẢNG CHẤM CHUNG (31/07/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao: điểm chỉ tiêu này app TỰ TÍNH từ bài cải tiến ĐÃ DUYỆT (luật
-- luatDongGopCaiTien trong src/lib/kpiTuDong.js, đếm theo mốc reviewed_at,
-- tối thiểu 2 bài/tháng). Luật đó ĐÈ lên diem_chot mỗi lần hiển thị — nên ô
-- nhập ở Bảng chấm chung chỉ mời người ta gõ một con số rồi vứt đi. Đo
-- 31/07/2026: cả 13 dòng kỳ 2026-07 đã mang chot_boi = 'Nguyên'.
--
-- Áp cho MỌI kỳ chứ không riêng 2026-07: hàm tao_ky_kpi (them_ma_va_cham_chung_kpi.sql)
-- COPY cột cham_chung sang kỳ mới, chặn một kỳ thì tháng sau nó quay lại mà
-- không có lỗi nào báo.
--
-- ⚠ KHÔNG xoá diem_chot / chot_boi. Khi bảng cai_tien lỗi tải, KpiTab đặt
--   caiTien = null → luật trả "không chấm" → rơi về diem_chot trong DB.
--   diem_chot = 0 là số an toàn; đặt null thì engine coi là ĐẠT ĐỦ ĐIỂM
--   (xem KpiBangChung.jsx:145-146), tức một lỗi mạng hoá thành 2/2 điểm cho
--   cả 13 người.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update kpi_chi_tieu
set cham_chung = false
where ma = 'DONG_GOP_CAI_TIEN'
  and cham_chung;

commit;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Không còn dòng nào của chỉ tiêu này nằm trong bảng chung (kỳ vọng: 0 dòng):
select ky, count(*) from kpi_chi_tieu
where ma = 'DONG_GOP_CAI_TIEN' and cham_chung group by ky;

-- 2) Điểm và người chốt GIỮ NGUYÊN, không bị xoá (kỳ vọng: 13 dòng kỳ 2026-07,
--    diem_chot = 0, chot_boi = 'Nguyên'):
select ky, count(*) as so_dong, count(diem_chot) as con_diem, count(chot_boi) as con_nguoi_chot
from kpi_chi_tieu where ma = 'DONG_GOP_CAI_TIEN' group by ky order by ky desc;

-- 3) Còn chỉ tiêu TỰ ĐỘNG nào khác đang nằm trong bảng chung không?
--    Kỳ vọng: 0 dòng. Có dòng nào hiện ra là một bẫy y hệt đang chờ ở chỉ tiêu
--    khác — xử lý tiếp, đừng bỏ qua.
select ky, ma, count(*) from kpi_chi_tieu
where cham_chung and cach_cham = 'TU_DONG' group by ky, ma order by ky desc, ma;

-- 4) 4 chỉ tiêu chấm tay còn lại PHẢI còn nguyên trong bảng chung (kỳ vọng:
--    5S, CHAM_KPI, QUY_DINH_CONG_TY, VAN_HOA_CONG_TY — đủ 4 mã, đều THU_CONG):
select ma, cach_cham, count(*) from kpi_chi_tieu
where ky = '2026-07' and cham_chung and cap_do = 'CA_NHAN'
group by ma, cach_cham order by ma;

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` ở 4 dòng cuối rồi chạy
--
-- Để nguyên dạng chú thích có chủ đích: dán cả file để chạy phần kiểm tra thì
-- không được vô tình hoàn tác luôn thứ vừa làm.
--
-- Phải ghi RÕ KỲ, không hoàn tác toàn bộ. Lệnh trên gỡ ở mọi kỳ, nhưng chỉ kỳ
-- 2026-07 vốn có cham_chung = true (đo 31/07/2026: kỳ 2026-06 vốn đã false).
-- Hoàn tác không kèm `ky` sẽ BẬT chấm chung cho cả những kỳ chưa từng bật —
-- tạo ra trạng thái chưa bao giờ tồn tại, tệ hơn là để nguyên.
--
-- ⚠ Hoàn tác chỉ đưa chỉ tiêu HIỆN LẠI trong Bảng chấm chung. Ô nhập vẫn KHOÁ,
--   vì phần khoá nằm ở mã nguồn (laChamTuDong trong src/lib/kpiBangChung.js),
--   không nằm ở cột này. Muốn chấm tay lại thật thì phải lùi cả mã nguồn.
-- ════════════════════════════════════════════════════════════════════════════
-- update kpi_chi_tieu
-- set cham_chung = true
-- where ma = 'DONG_GOP_CAI_TIEN'
--   and ky = '2026-07';
