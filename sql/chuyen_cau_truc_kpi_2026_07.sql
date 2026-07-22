-- ════════════════════════════════════════════════════════════════════════════
-- CHUYỂN CẤU TRÚC KPI THÁNG 7/2026 (theo ma trận anh tick lại)
-- Chỉ đụng kỳ 2026-07. Tháng 6 giữ nguyên làm lịch sử đã chấm.
-- Dán toàn bộ vào Supabase SQL Editor, bấm Run. Chạy lại nhiều lần cũng an toàn.
--
-- ⚠ SAU KHI CHẠY: tổng trọng số của vài người sẽ ≠ 100 (vì thêm/bỏ chỉ tiêu).
--   Mở app → KPI → tháng 7 → từng người có cảnh báo đỏ → sửa trọng số cho đủ 100.
--   Câu SELECT cuối file liệt kê ai đang lệch.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── PHẦN 1: chuẩn hoá tên (idempotent — đã chạy rồi thì không đổi gì) ──────────
update kpi_chi_tieu set ten='5S' where ten='5 S';
update kpi_chi_tieu set ten='KIỂM SOÁT CHẤT LƯỢNG' where ten in ('KS CHẤT LƯỢNG','KIỂM SOÁT CHẤT LƯỢNG, SỐ LƯỢNG');
update kpi_chi_tieu set ten='ĐÓNG GÓP CẢI TIẾN' where ten='CẢI TIẾN';
update kpi_chi_tieu set ten='VIDEO KỸ THUẬT' where ten='VIDEO KĨ THUẬT';
update kpi_chi_tieu set ten='TỈ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH' where ten='TỶ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH';
update kpi_chi_tieu set ten='CHỨNG TỪ NHẬP XUẤT' where ten='CHỨNG TÙ NHẬP XUẤT';
update kpi_chi_tieu set ten='BÁO CÁO CHI TIẾT HÀNG KHO CHỜ XỬ LÝ' where ten='BÁO CÁO CHI TIẾT HÀNG KHO CHỞ XỬ LÝ';

-- ── PHẦN 2: THÊM chỉ tiêu cho nhân viên (22) ──────────────────────────────────
-- Chép chi tiêu/mô tả/trọng số từ một người đã có chỉ tiêu đó (trọng số tạm — anh chỉnh sau).
-- NOT EXISTS: đã có thì bỏ qua, nên chạy lại không nhân đôi.
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'admin', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='admin'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='CHẤM KPI' and ref.nhan_vien_id<>'admin'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='admin' and x.ten='CHẤM KPI')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ntth', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ntth'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='CHẤM KPI' and ref.nhan_vien_id<>'ntth'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ntth' and x.ten='CHẤM KPI')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ntth', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ntth'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='KIỂM SOÁT CHẤT LƯỢNG' and ref.nhan_vien_id<>'ntth'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ntth' and x.ten='KIỂM SOÁT CHẤT LƯỢNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ntth', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ntth'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='SẢN XUẤT' and ref.nhan_vien_id<>'ntth'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ntth' and x.ten='SẢN XUẤT')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ntth', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ntth'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='QUY TRÌNH LẮP, ĐÓNG GÓI' and ref.nhan_vien_id<>'ntth'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ntth' and x.ten='QUY TRÌNH LẮP, ĐÓNG GÓI')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'hhx', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='hhx'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH' and ref.nhan_vien_id<>'hhx'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='hhx' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nv8', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nv8'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH' and ref.nhan_vien_id<>'nv8'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nv8' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nttd', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nttd'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH' and ref.nhan_vien_id<>'nttd'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nttd' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'admin', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='admin'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC' and ref.nhan_vien_id<>'admin'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='admin' and x.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nbn', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nbn'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC' and ref.nhan_vien_id<>'nbn'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nbn' and x.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ndp', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ndp'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC' and ref.nhan_vien_id<>'ndp'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ndp' and x.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'vta', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='vta'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC' and ref.nhan_vien_id<>'vta'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='vta' and x.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ntth', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ntth'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC' and ref.nhan_vien_id<>'ntth'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ntth' and x.ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'admin', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='admin'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG' and ref.nhan_vien_id<>'admin'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='admin' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nbn', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nbn'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG' and ref.nhan_vien_id<>'nbn'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nbn' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'ndp', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='ndp'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG' and ref.nhan_vien_id<>'ndp'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='ndp' and x.ten='PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nbn', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nbn'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='TỈ LỆ TIẾP NHẬN CUỘC GỌI ĐẾN - CÁ NHÂN' and ref.nhan_vien_id<>'nbn'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nbn' and x.ten='TỈ LỆ TIẾP NHẬN CUỘC GỌI ĐẾN - CÁ NHÂN')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'admin', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='admin'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHỤC VỤ KHÁCH HÀNG' and ref.nhan_vien_id<>'admin'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='admin' and x.ten='PHỤC VỤ KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'hhx', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='hhx'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHỤC VỤ KHÁCH HÀNG' and ref.nhan_vien_id<>'hhx'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='hhx' and x.ten='PHỤC VỤ KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nv8', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nv8'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHỤC VỤ KHÁCH HÀNG' and ref.nhan_vien_id<>'nv8'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nv8' and x.ten='PHỤC VỤ KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'nttd', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='nttd'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='PHỤC VỤ KHÁCH HÀNG' and ref.nhan_vien_id<>'nttd'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='nttd' and x.ten='PHỤC VỤ KHÁCH HÀNG')
order by ref.id limit 1;
insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham)
select '2026-07', 'CA_NHAN', 'admin', ref.lien_ket_bo_phan, ref.nhom,
  (select coalesce(max(t.thu_tu),0)+1 from kpi_chi_tieu t where t.ky='2026-07' and t.nhan_vien_id='admin'),
  ref.ten, ref.mo_ta, ref.chi_tieu, ref.trong_so, ref.cach_cham
from kpi_chi_tieu ref
where ref.ky='2026-07' and ref.cap_do='CA_NHAN' and ref.ten='QUẢN LÝ KHO HÀNG' and ref.nhan_vien_id<>'admin'
  and not exists (select 1 from kpi_chi_tieu x where x.ky='2026-07' and x.nhan_vien_id='admin' and x.ten='QUẢN LÝ KHO HÀNG')
order by ref.id limit 1;

-- ── PHẦN 3: BỎ chỉ tiêu khỏi nhân viên (15) ───────────────────────────────────
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='nbn' and ten='KIỂM SOÁT CHẤT LƯỢNG';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='ndp' and ten='KIỂM SOÁT CHẤT LƯỢNG';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='vta' and ten='KIỂM SOÁT CHẤT LƯỢNG';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='nbn' and ten='SẢN XUẤT';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='ndp' and ten='SẢN XUẤT';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='vta' and ten='SẢN XUẤT';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='nbn' and ten='QUY TRÌNH LẮP, ĐÓNG GÓI';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='ndp' and ten='QUY TRÌNH LẮP, ĐÓNG GÓI';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='vta' and ten='QUY TRÌNH LẮP, ĐÓNG GÓI';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='nbn' and ten='ĐÁNH GIÁ CHẤT LƯỢNG CSKH';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='ndp' and ten='ĐÁNH GIÁ CHẤT LƯỢNG CSKH';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='vta' and ten='ĐÁNH GIÁ CHẤT LƯỢNG CSKH';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='admin' and ten='HOÀN THÀNH ĐƠN BẢO HÀNH';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='admin' and ten='TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH(CÁ NHÂN)';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='admin' and ten='TRÁNH GỬI SAI LINH KIỆN BH';

-- ── PHẦN 4: XOÁ HẲN 2 chỉ tiêu (DEADLINE + gộp báo cáo BH vào báo cáo công việc) ──
delete from kpi_chi_tieu where ky='2026-07' and ten='DEADLINE';
delete from kpi_chi_tieu where ky='2026-07' and ten='BÁO CÁO KẾT QUẢ CÔNG VIỆC BẢO HÀNH';

-- ── PHẦN 5: ĐỔI TÊN chỉ tiêu chấm chung + BỎ Tuấn khỏi chỉ tiêu này ───────────
update kpi_chi_tieu set ten='TỈ LỆ TRẢ LỜI HOTLINE( CẢ TEAM BH)' where ky='2026-07' and ten='TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH( CẢ TEAM BH)';
delete from kpi_chi_tieu where ky='2026-07' and cap_do='CA_NHAN' and nhan_vien_id='vta' and lien_ket_bo_phan='HOTLINE_CA_TEAM_BH';

commit;

-- ── KIỂM TRA: tổng trọng số từng người (kỳ vọng: người bị thêm/bỏ sẽ ≠ 100) ──
select nv.name as nhan_vien, sum(k.trong_so) as tong_trong_so,
       case when abs(sum(k.trong_so)-100)<0.001 then 'OK' else '⚠ CẦN CHIA LẠI' end as trang_thai
from kpi_chi_tieu k join nhan_vien nv on nv.id=k.nhan_vien_id
where k.ky='2026-07' and k.cap_do='CA_NHAN' and k.chi_tieu is not null
group by nv.name order by tong_trong_so;
