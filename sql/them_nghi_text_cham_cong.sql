-- ════════════════════════════════════════════════════════════════════════════
-- CỘT `nghi_text` — chữ gốc cột Nghỉ của máy chấm công (01/08/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- File máy chấm công ghi cột Nghỉ bằng CHỮ: 'Nghỉ' / 'Nghỉ sáng' / 'Nghỉ chiều'. App trước
-- đây quy hết về `nghi boolean` rồi ĐẾM DÒNG, nên nghỉ nửa buổi bị tính tròn một ngày. Đo kỳ
-- 2026-07: 8/19 ngày nghỉ là nửa buổi; hai người bị ghi "quá phép 1 ngày" trong khi thực tế
-- nghỉ đúng 1 ngày — tức bị trừ điểm chuyên cần oan, mà điểm đó gắn thẳng lương thưởng.
--
-- Vì sao lưu CHỮ chứ không lưu sẵn số 0.5/1: chữ là BẰNG CHỨNG lấy từ nguồn, còn quy ra số
-- ngày là LUẬT. Luật đổi thì sửa một hàm `trongSoNgayNghi()` trong src/lib/kpiTuDong.js rồi
-- mọi kỳ tính lại đúng ngay; lưu sẵn số thì luật bị đông cứng vào từng dòng đã ghi, đổi luật
-- phải nạp lại toàn bộ lịch sử.
--
-- AN TOÀN NGƯỢC: dòng đã nạp trước file này có `nghi_text` null → `trongSoNgayNghi(null)` trả
-- 1, đúng hành vi cũ. Chạy file này KHÔNG làm đổi điểm của bất kỳ kỳ nào. Số chỉ đổi sau khi
-- kỳ đó được NẠP LẠI từ Excel — đổi điểm phải là hành động có người bấm, không phải tác dụng
-- phụ của một lần chạy SQL.
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table cham_cong add column if not exists nghi_text text;

comment on column cham_cong.nghi_text is
  'Chữ gốc cột Nghỉ trong file máy chấm công (Nghỉ / Nghỉ sáng / Nghỉ chiều). null = không '
  'nghỉ hoặc dòng nạp trước 01/08/2026. Quy ra số ngày bằng trongSoNgayNghi() trong '
  'src/lib/kpiTuDong.js — KHÔNG tự suy ở nơi khác, hai nơi suy khác nhau là điểm KPI lệch.';

-- ── Hàm nạp phải chở thêm cột này ───────────────────────────────────────────
-- Thân hàm CHÉP NGUYÊN từ sql/rpc_nap_cham_cong.sql, chỉ thêm `nghi_text` ở đúng 3 chỗ:
-- danh sách cột insert, danh sách giá trị select, và khai báo jsonb_to_recordset.
-- Mọi chốt chặn giữ nguyên: gate ADMIN, chặn kỳ sai, chặn payload rỗng, 4 nhánh EXCEPTION.
--
-- ⚠⚠ TUYỆT ĐỐI KHÔNG THÊM `security definer` ⚠⚠ — xem lời cảnh báo đầy đủ trong
--   sql/rpc_nap_cham_cong.sql. Hàm để mặc định (security invoker) thì vẫn chịu RLS; thêm
--   security definer là cho người cầm khoá công khai xoá sạch bảng chấm công bằng một lệnh.
create or replace function nap_cham_cong(p_ky text, p_dong jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare so_xoa int; so_nap int;
begin
  if coalesce(auth.jwt() ->> 'nv_role', '') <> 'ADMIN' then
    return jsonb_build_object('loi', 'Chỉ tài khoản quản trị mới nạp được chấm công');
  end if;

  if p_ky is null or p_ky !~ '^[0-9]{4}-[0-9]{2}$' then
    return jsonb_build_object('loi', 'Kỳ không hợp lệ, phải dạng YYYY-MM');
  end if;

  if p_dong is null or jsonb_typeof(p_dong) <> 'array' or jsonb_array_length(p_dong) = 0 then
    return jsonb_build_object('loi', 'Không có dòng chấm công nào để nạp — kiểm lại tệp Excel rồi thử lại.');
  end if;

  begin
    delete from cham_cong where ky = p_ky;
    get diagnostics so_xoa = row_count;

    insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                           tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nghi_van)
    select p_ky, d.nhan_vien_id, d.ngay, d.thu, d.gio_in_sang, d.gio_in_chieu, d.gio_out,
           d.tang_ca_phut, d.di_muon_phut, d.ve_som_phut, d.nghi, d.nghi_text, d.nghi_van
    from jsonb_to_recordset(p_dong) as d(
      nhan_vien_id text, ngay date, thu text, gio_in_sang text, gio_in_chieu text,
      gio_out text, tang_ca_phut int, di_muon_phut int, ve_som_phut int,
      nghi boolean, nghi_text text, nghi_van text);
    get diagnostics so_nap = row_count;
  exception
    when not_null_violation then
      return jsonb_build_object('loi',
        'Có dòng thiếu dữ liệu bắt buộc (đi muộn / về sớm / nghỉ). KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
    when foreign_key_violation then
      return jsonb_build_object('loi',
        'Có mã nhân viên không tồn tại trong bảng nhân viên. KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
    when unique_violation then
      return jsonb_build_object('loi',
        'Trùng dòng chấm công: một người bị ghi hai lần trong cùng một ngày (hoặc ngày đó đã có '
        || 'dòng cũ nằm dưới kỳ khác). KHÔNG đổi gì cả — kiểm lại tệp Excel xem có ai bị lặp '
        || 'ngày không rồi nạp lại. Chi tiết: ' || sqlerrm);
    when others then
      return jsonb_build_object('loi',
        'Nạp hỏng giữa chừng, KHÔNG đổi gì cả. Chi tiết: ' || sqlerrm);
  end;

  return jsonb_build_object('so_xoa', so_xoa, 'so_nap', so_nap);
end $$;

-- `create or replace function` ĐẶT LẠI quyền về mặc định của Postgres (cấp cho PUBLIC), nên
-- phải thu lại — không phải thừa. Thu từ `public`, KHÔNG chỉ từ `anon`: thu của riêng anon
-- không gỡ được đường thừa kế qua PUBLIC (đã đo 01/08/2026, xem rpc_nap_cham_cong.sql).
revoke execute on function nap_cham_cong(text, jsonb) from public;
revoke execute on function nap_cham_cong(text, jsonb) from anon;
grant  execute on function nap_cham_cong(text, jsonb) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- KIỂM TRA SAU KHI CHẠY
-- ════════════════════════════════════════════════════════════════════════════
-- 1) Cột đã có:
select column_name, data_type from information_schema.columns
where table_name = 'cham_cong' and column_name = 'nghi_text';

-- 2) Hàm KHÔNG được là security definer (kỳ vọng: prosecdef = false):
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'nap_cham_cong';

-- 3) `anon` KHÔNG chạy được, `authenticated` chạy được (kỳ vọng: false, true):
select has_function_privilege('anon', 'nap_cham_cong(text,jsonb)', 'EXECUTE') as anon_chay_duoc,
       has_function_privilege('authenticated', 'nap_cham_cong(text,jsonb)', 'EXECUTE') as authenticated_chay_duoc;

-- 4) Đo từ NGOÀI bằng chính khoá công khai — bảng quyền nói một đằng, thực tế có thể một nẻo:
--    curl -s -X POST "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/nap_cham_cong" \
--      -H "apikey: <KEY>" -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \
--      -d '{"p_ky":"1900-01","p_dong":[]}'
--    Kỳ vọng: {"code":"42501", ... "permission denied for function nap_cham_cong"}

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` rồi chạy. Chạy lại sql/rpc_nap_cham_cong.sql để đưa hàm về bản cũ.
-- ════════════════════════════════════════════════════════════════════════════
-- alter table cham_cong drop column if exists nghi_text;
