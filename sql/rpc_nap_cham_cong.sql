-- ════════════════════════════════════════════════════════════════════════════
-- HÀM NẠP CHẤM CÔNG — xoá kỳ cũ + nạp kỳ mới trong CÙNG một transaction (01/08/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao phải là một hàm chứ không gọi rời từ trình duyệt: PostgREST không mở được
-- transaction. Gọi `delete` rồi `insert` thành hai lệnh mà rớt mạng giữa chừng là cả kỳ
-- trống rỗng — điểm chuyên cần của 13 người về 0 và không ai biết vì sao. Postgres tự
-- bọc thân hàm trong một transaction, nên hoặc ăn cả, hoặc không đổi một ly nào.
--
-- Lời hứa "ăn cả hoặc không đổi gì" chỉ đúng nếu payload rỗng/sai hình dạng bị TỪ CHỐI
-- thẳng chứ không bị coi là "nạp 0 dòng". Đo 01/08/2026: jsonb_to_recordset(null) và
-- jsonb_to_recordset('[]') đều trả 0 dòng mà KHÔNG báo lỗi gì — không chặn trước thì một
-- lần gọi với mảng rỗng xoá sạch kỳ, nạp 0 dòng, rồi trả về y như đã thành công. Vì vậy
-- hàm từ chối p_dong null/không phải mảng/mảng rỗng NGAY từ đầu, trước khi đụng tới delete,
-- và mọi lỗi ở hai lệnh ghi đều được bắt để không lệnh nào chạy dở dang (xem khối EXCEPTION
-- bên dưới).
--
-- ⚠⚠ TUYỆT ĐỐI KHÔNG THÊM `security definer` VÀO HÀM NÀY ⚠⚠
--   `security definer` bảo Postgres chạy hàm bằng quyền chủ sở hữu và BỎ QUA RLS. Lúc đó
--   người ngoài cầm khoá công khai — thứ nằm sẵn trong mã nguồn, Ctrl+U là thấy — xoá
--   sạch được cả bảng chấm công chỉ bằng một lệnh gọi.
--   Hàm để MẶC ĐỊNH (security invoker) thì vẫn chịu RLS. Đã đo 01/08/2026 bằng một hàm
--   nháp cùng hình dạng: gọi bằng khoá công khai → xoá được 0 dòng, dữ liệu còn nguyên.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function nap_cham_cong(p_ky text, p_dong jsonb)
returns jsonb
language plpgsql
-- search_path cố định: để người gọi không trỏ `cham_cong` sang bảng giả trong schema
-- của họ. Cùng nếp với các hàm khác trong dự án.
set search_path = public, pg_temp
as $$
declare so_xoa int; so_nap int;
begin
  -- Chặn sớm để câu lỗi ĐỌC HIỂU ĐƯỢC. RLS bên dưới mới là thứ thật sự chặn — dòng này
  -- chỉ để người dùng nhận "không có quyền" thay vì một lỗi RLS khó hiểu. Đừng nhầm nó
  -- là lớp bảo vệ duy nhất: xoá dòng này đi thì RLS vẫn chặn.
  if coalesce(auth.jwt() ->> 'nv_role', '') <> 'ADMIN' then
    return jsonb_build_object('loi', 'Chỉ tài khoản quản trị mới nạp được chấm công');
  end if;

  if p_ky is null or p_ky !~ '^[0-9]{4}-[0-9]{2}$' then
    return jsonb_build_object('loi', 'Kỳ không hợp lệ, phải dạng YYYY-MM');
  end if;

  -- Chặn đường MẤT DỮ LIỆU ÂM THẦM. Đo 01/08/2026: jsonb_to_recordset(null) và
  -- jsonb_to_recordset('[]') đều trả 0 dòng mà KHÔNG báo lỗi — nên nếu không chặn ở đây,
  -- một lần gọi với mảng rỗng sẽ xoá trọn kỳ, nạp 0 dòng, rồi trả về như thể thành công.
  -- Nạp một tệp chấm công rỗng không phải việc hợp lệ, nên từ chối thẳng.
  -- `p_dong is null` phải đứng TRƯỚC: jsonb_typeof(null) trả NULL chứ không phải 'null',
  -- nên so sánh <> 'array' cho ra NULL và điều kiện không bao giờ đúng.
  if p_dong is null or jsonb_typeof(p_dong) <> 'array' or jsonb_array_length(p_dong) = 0 then
    return jsonb_build_object('loi', 'Không có dòng chấm công nào để nạp — kiểm lại tệp Excel rồi thử lại.');
  end if;

  -- Bọc hai lệnh ghi trong một khối có EXCEPTION: plpgsql mở subtransaction cho khối đó,
  -- nên hỏng ở lệnh insert thì lệnh delete phía trước CŨNG bị cuộn ngược. Nhờ vậy lời hứa
  -- "hoặc ăn cả, hoặc không đổi một ly nào" vẫn đúng, mà người dùng nhận câu tiếng Việt
  -- thay vì một khối lỗi Postgres tiếng Anh kèm nguyên dòng dữ liệu.
  begin
    delete from cham_cong where ky = p_ky;
    get diagnostics so_xoa = row_count;

    insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                           tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_van)
    select p_ky, d.nhan_vien_id, d.ngay, d.thu, d.gio_in_sang, d.gio_in_chieu, d.gio_out,
           d.tang_ca_phut, d.di_muon_phut, d.ve_som_phut, d.nghi, d.nghi_van
    from jsonb_to_recordset(p_dong) as d(
      nhan_vien_id text, ngay date, thu text, gio_in_sang text, gio_in_chieu text,
      gio_out text, tang_ca_phut int, di_muon_phut int, ve_som_phut int,
      nghi boolean, nghi_van text);
    get diagnostics so_nap = row_count;
  exception
    -- KHÔNG coalesce về 0: bịa một số 0 cho ô thiếu dữ liệu chính là kiểu "số sai âm thầm"
    -- mà tính năng này sinh ra để chặn. Thà hỏng to còn hơn đúng giả.
    when not_null_violation then
      return jsonb_build_object('loi',
        'Có dòng thiếu dữ liệu bắt buộc (đi muộn / về sớm / nghỉ). KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
    when foreign_key_violation then
      return jsonb_build_object('loi',
        'Có mã nhân viên không tồn tại trong bảng nhân viên. KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
    when others then
      return jsonb_build_object('loi',
        'Nạp hỏng giữa chừng, KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
  end;

  return jsonb_build_object('so_xoa', so_xoa, 'so_nap', so_nap);
end $$;

-- Lớp thứ hai, không phải lớp duy nhất: Postgres mặc định cho `public` chạy hàm mới.
revoke execute on function nap_cham_cong(text, jsonb) from anon;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Hàm KHÔNG được là security definer (kỳ vọng: prosecdef = false):
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'nap_cham_cong';

-- 2) `anon` KHÔNG chạy được (kỳ vọng: false):
select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_chay_duoc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'nap_cham_cong';

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` rồi chạy
-- ════════════════════════════════════════════════════════════════════════════
-- drop function if exists nap_cham_cong(text, jsonb);
