-- Tạo kỳ KPI mới bằng cách copy toàn bộ bảng chỉ tiêu của kỳ nguồn.
-- Điểm (diem_chot, diem_tu_cham, chot_boi, chot_luc) KHÔNG copy — kỳ mới bắt đầu từ
-- trạng thái đạt đủ. Nhật ký cũng không copy: nhật ký là bằng chứng của đúng kỳ đó.
--
-- Chạy tay trên Supabase SQL Editor sau sql/create_kpi_module.sql.

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
  if ky_nguon is null or ky_moi is null or ky_nguon = ky_moi then
    raise exception 'Kỳ nguồn và kỳ mới phải khác nhau và không được để trống';
  end if;

  -- Chặn chạy lần hai: không có dòng này thì bấm nhầm nút là bảng chỉ tiêu nhân đôi,
  -- mỗi người thành 2 bộ chỉ tiêu và tổng KPI vọt lên 200.
  if exists (select 1 from kpi_chi_tieu where ky = ky_moi) then
    raise exception 'Kỳ % đã có dữ liệu', ky_moi;
  end if;

  insert into kpi_chi_tieu
    (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
     chi_tieu, trong_so, cach_cham)
  select ky_moi, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
         chi_tieu, trong_so, cach_cham
  from kpi_chi_tieu where ky = ky_nguon;

  get diagnostics so_dong = row_count;
  return so_dong;
end;
$$;

-- Chỉ user đã đăng nhập mới gọi được (mặc định Postgres cấp execute cho public).
revoke all on function tao_ky_kpi(text, text) from public;
grant execute on function tao_ky_kpi(text, text) to authenticated;
