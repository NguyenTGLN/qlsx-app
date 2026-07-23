-- ════════════════════════════════════════════════════════════════════════════
-- BẢNG CHẤM CHUNG KPI — thêm cột `ma` + `cham_chung` vào kpi_chi_tieu
-- Dán toàn bộ vào Supabase SQL Editor, bấm Run. Chạy lại nhiều lần đều an toàn.
--
-- `ma`         : định danh chỉ tiêu. Cùng tên chỉ tiêu → cùng mã, ở mọi nhân viên,
--                mọi kỳ. Bảng chấm chung gom dòng theo mã này chứ không theo tên,
--                nên sau này đổi tên chỉ tiêu bảng chung vẫn không vỡ.
-- `cham_chung` : true = chỉ tiêu nhập điểm ở màn hình Bảng chấm chung. Bật/tắt cho
--                TẤT CẢ dòng cùng mã trong cùng kỳ, không bật lẻ một người.
--
-- ⚠ CHẤM CHUNG ở đây = chấm ở MỘT MÀN HÌNH chung, mỗi người vẫn có điểm riêng.
--   Khác hẳn cap_do='BO_PHAN' (một điểm dùng cho cả bộ phận) — file này không đụng tới.
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table kpi_chi_tieu add column if not exists ma text;
alter table kpi_chi_tieu add column if not exists cham_chung boolean not null default false;

-- Index một phần: chỉ đánh dấu các dòng đang chấm chung (vài chục dòng trên vài trăm).
create index if not exists kpi_chi_tieu_cham_chung_idx
  on kpi_chi_tieu (ky, ma) where cham_chung;

-- ── Điền mã cho toàn bộ chỉ tiêu đang có (cả kỳ 2026-06 lẫn 2026-07) ─────────
-- `and c.ma is null`: chạy lần hai không đè lên mã đã sửa tay.
-- Hai dòng HOTLINE CẢ TEAM có 2 tên khác nhau (tháng 7 đổi tên, tháng 6 giữ tên cũ)
-- nhưng là CÙNG một chỉ tiêu nên cùng mã.
with anh_xa(ten, ma) as (values
  ('5S', '5S'),
  ('BÁO CÁO CHI TIẾT HÀNG KHO CHỜ XỬ LÝ', 'BC_HANG_KHO_CHO_XU_LY'),
  ('BÁO CÁO KẾT QUẢ CÔNG VIỆC', 'BC_KET_QUA_CONG_VIEC'),
  ('BÁO CÁO KẾT QUẢ CÔNG VIỆC BẢO HÀNH', 'BC_KET_QUA_CV_BH'),
  ('BÁO CÁO PHÂN TÍCH BẢO HÀNH', 'BC_PHAN_TICH_BH'),
  ('BÁO CÁO PHÂN TÍCH SẢN XUẤT', 'BC_PHAN_TICH_SX'),
  ('CHUYÊN CẦN BỘ PHẬN', 'CHUYEN_CAN_BO_PHAN'),
  ('CHUYÊN CẦN CÁ NHÂN', 'CHUYEN_CAN_CA_NHAN'),
  ('CHUYỂN TRẠNG THÁI ĐƠN HÀNG EUROMADE TỰ GIAO', 'CHUYEN_TT_DON_TU_GIAO'),
  ('CHẤM KPI', 'CHAM_KPI'),
  ('CHỨNG TỪ NHẬP XUẤT', 'CHUNG_TU_NHAP_XUAT'),
  ('CỘNG THÊM NGOÀI TRỌNG SỐ', 'CONG_THEM_NGOAI_TRONG_SO'),
  ('DEADLINE', 'DEADLINE'),
  ('DEADLINE BÁO CÁO HÀNG NGÀY+ DEADLINE CÔNG VIỆC KHÁC', 'DEADLINE_BC_HANG_NGAY'),
  ('DÙNG XE ĐÚNG QUY ĐỊNH', 'DUNG_XE_DUNG_QUY_DINH'),
  ('GỬI BẢNG ĐĂNG KÝ HIỆU SUẤT', 'GUI_BANG_DK_HIEU_SUAT'),
  ('GỬI ĐÁNH GIÁ CUỘC GỌI BH CỦA TPKT VÀ GĐKT', 'GUI_DG_CUOC_GOI_BH'),
  ('HOÀN THÀNH CÔNG VIỆC ĐÚNG THỜI HẠN', 'HT_CONG_VIEC_DUNG_HAN'),
  ('HOÀN THÀNH ĐƠN BẢO HÀNH', 'HT_DON_BAO_HANH'),
  ('KIỂM SOÁT CHẤT LƯỢNG', 'KIEM_SOAT_CHAT_LUONG'),
  ('KIỂM SOÁT THỜI GIAN CHUYỂN MÁY Ở HÀNG CHỜ XỬ LÝ VỀ MÁY MỚI ĐỂ BÁN', 'KS_THOI_GIAN_CHUYEN_MAY'),
  ('LÀM SỔ KHO', 'LAM_SO_KHO'),
  ('LÀM ĐỀ XUẤT ĐẶT HÀNG', 'LAM_DE_XUAT_DAT_HANG'),
  ('PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH', 'PHAN_HOI_KH_BH'),
  ('PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG', 'PHAN_HOI_KH_CSKH'),
  ('PHỤC VỤ KHÁCH HÀNG', 'PHUC_VU_KHACH_HANG'),
  ('QUY TRÌNH LẮP, ĐÓNG GÓI', 'QUY_TRINH_LAP_DONG_GOI'),
  ('QUY ĐỊNH CÔNG TY', 'QUY_DINH_CONG_TY'),
  ('QUẢN LÝ HÀNG HÓA', 'QUAN_LY_HANG_HOA'),
  ('QUẢN LÝ KHO HÀNG', 'QUAN_LY_KHO_HANG'),
  ('QUẢN LÝ NHÂN VIÊN', 'QUAN_LY_NHAN_VIEN'),
  ('QUẢN LÝ,ĐÁNH GIÁ, CẢI TIẾN CHẤT LƯỢNG ĐÀO TẠO ZOOM', 'QL_DAO_TAO_ZOOM'),
  ('SẢN XUẤT', 'SAN_XUAT'),
  ('HIỆU SUẤT SẢN XUẤT', 'SAN_XUAT'),
  ('SẮP XẾP KHO HÀNG', 'SAP_XEP_KHO_HANG'),
  ('THẺ KHO', 'THE_KHO'),
  ('TRÁNH BẢO HÀNH 2 LẦN', 'TRANH_BAO_HANH_2_LAN'),
  ('TRÁNH GỬI SAI LINH KIỆN BH', 'TRANH_GUI_SAI_LINH_KIEN'),
  ('TRÌNH ĐỀ XUẤT NHÂN VIÊN NHÂN VIÊN XUẤT SẮC NHẤT THÁNG, QUÝ', 'TRINH_DX_NV_XUAT_SAC'),
  ('TỈ LỆ HOÀN THÀNH CUỘC GỌI HỖ TRỢ KỸ THUẬT TỚI KHÁCH HÀNG', 'TL_CUOC_GOI_HT_KY_THUAT'),
  ('TỈ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH', 'TL_CUOC_GOI_RA'),
  ('TỈ LỆ TIẾP NHẬN CUỘC GỌI ĐẾN - CÁ NHÂN', 'TL_TIEP_NHAN_CG_DEN'),
  ('TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH(CÁ NHÂN)', 'TL_HOTLINE_CA_NHAN'),
  ('TỈ LỆ TRẢ LỜI HOTLINE( CẢ TEAM BH)', 'TL_HOTLINE_CA_TEAM'),
  ('TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH( CẢ TEAM BH)', 'TL_HOTLINE_CA_TEAM'),
  ('VIDEO KỸ THUẬT', 'VIDEO_KY_THUAT'),
  ('VĂN HÓA CÔNG TY. ( Đây là KPI rất quan trọng, tuy nhiên điểm trọng số chỉ là tượng trưng, nhân viên phải chủ động phải hoàn thành tốt kpi này, đây là 1 trong các chỉ tiêu Kpi quan trọng để đánh giá việc thăng cấp, tăng lương, kí hợp đồng hay chấm dứt hợp đồng)', 'VAN_HOA_CONG_TY'),
  ('XÂY DỰNG QUY TRÌNH, TÀI LIỆU KIỂM SOÁT KHO HÀNG , ĐÀO TẠO NV THỰC HIỆN', 'XD_QT_KHO'),
  ('XÂY DỰNG QUY TRÌNH, TÀI LIỆU KIỂM SOÁT ĐÓNG GÓI HÀNG HÓA, ĐÀO TẠO NV THƯC HIỆN', 'XD_QT_DONG_GOI'),
  ('XÂY DỰNG TÀI LIỆU, QUY TRÌNH KIỂM SOÁT CHẤT LƯỢNG HÀNG HÓA ĐẦU RA KHÂU SẢN XUẤT, ĐÓNG GÓI, ĐÀO TẠO NV THỰC HIỆN', 'XD_TL_CL_DAU_RA'),
  ('XÂY DỰNG TÀI LIỆU, QUY TRÌNH KIỂM SOÁT CHẤT LƯỢNG HÀNG HÓA ĐẦU VÀO', 'XD_TL_CL_DAU_VAO'),
  ('ĐÁNH GIÁ CHẤT LƯỢNG CSKH', 'DANH_GIA_CL_CSKH'),
  ('ĐÁNH GIÁ ĐÚNG MỨC ĐỘ ĐAT KPI BẢN THÂN VÀ NHÂN VIÊN', 'DG_MUC_DO_DAT_KPI'),
  ('ĐÓNG GÓP CẢI TIẾN', 'DONG_GOP_CAI_TIEN')
)
update kpi_chi_tieu c set ma = a.ma
from anh_xa a
where c.ten = a.ten and c.ma is null;

-- ── Bật chấm chung cho 4 chỉ tiêu, kỳ 2026-07 ────────────────────────────────
update kpi_chi_tieu set cham_chung = true
where ky = '2026-07'
  and cap_do = 'CA_NHAN'
  and ma in ('QUY_DINH_CONG_TY', 'VAN_HOA_CONG_TY', '5S', 'CHAM_KPI');

commit;

-- ── Hàm tạo kỳ mới PHẢI copy 2 cột mới ───────────────────────────────────────
-- Thiếu `ma`, `cham_chung` ở đây thì sang kỳ sau bảng chấm chung trống trơn mà
-- KHÔNG có lỗi nào báo — chỉ khác đúng 2 tên cột so với bản trong rpc_tao_ky_kpi.sql.
create or replace function tao_ky_kpi(ky_nguon text, ky_moi text)
returns int
language plpgsql
security definer
-- search_path cố định: hàm security definer chạy bằng quyền chủ sở hữu, để search_path
-- thả nổi thì người gọi có thể trỏ `kpi_chi_tieu` sang bảng giả trong schema của họ.
set search_path = public, pg_temp
as $$
declare so_dong int;
begin
  -- Hàm SECURITY DEFINER bỏ qua RLS nên phải tự kiểm quyền, xem rpc_tao_ky_kpi.sql.
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được tạo kỳ KPI' using errcode='42501';
  end if;

  if ky_nguon is null or ky_moi is null or ky_nguon = ky_moi then
    raise exception 'Kỳ nguồn và kỳ mới phải khác nhau và không được để trống';
  end if;

  -- Chặn chạy lần hai: bấm nhầm nút là bảng chỉ tiêu nhân đôi, tổng KPI vọt lên 200.
  if exists (select 1 from kpi_chi_tieu where ky = ky_moi) then
    raise exception 'Kỳ % đã có dữ liệu', ky_moi;
  end if;

  insert into kpi_chi_tieu
    (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
     chi_tieu, trong_so, cach_cham, ma, cham_chung)
  select ky_moi, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
         chi_tieu, trong_so, cach_cham, ma, cham_chung
  from kpi_chi_tieu where ky = ky_nguon;

  get diagnostics so_dong = row_count;
  return so_dong;
end;
$$;

revoke all on function tao_ky_kpi(text, text) from public;
grant execute on function tao_ky_kpi(text, text) to authenticated;

-- ── KIỂM TRA (chạy xong đọc 3 bảng kết quả này) ──────────────────────────────
-- 1. Chỉ tiêu chưa có mã — kỳ vọng 0 dòng. Có dòng nào tức là tên trong DB lệch so
--    với bảng ánh xạ; copy tên đó vào bảng ánh xạ rồi chạy lại file.
select ky, ten, count(*) so_dong
from kpi_chi_tieu where ma is null group by ky, ten order by ky, ten;

-- 2. Một mã bị gán cho nhiều tên khác nhau (ngoài cặp HOTLINE CẢ TEAM đã biết).
select ma, array_agg(distinct ten) cac_ten
from kpi_chi_tieu where ma is not null
group by ma having count(distinct ten) > 1;

-- 3. Các chỉ tiêu đang chấm chung ở kỳ 2026-07 — kỳ vọng đúng 4 mã, mỗi mã 13 người.
select ma, min(ten) ten, count(*) so_nguoi
from kpi_chi_tieu
where ky = '2026-07' and cham_chung
group by ma order by ma;
