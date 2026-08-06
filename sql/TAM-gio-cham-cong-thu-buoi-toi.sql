-- ════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ TỆP TẠM — ĐỔI GIỜ CHẤM CÔNG SANG BUỔI TỐI ĐỂ THỬ ⚠⚠
--
-- Chủ app yêu cầu 06/08/2026: tạm đổi giờ chuẩn sang 20:00 để thử ngay trong tối,
-- không phải đợi sáng hôm sau.
--
-- ⚠ PHẢI CHẠY PHẦN B TRẢ VỀ GIỜ THẬT TRƯỚC 7h SÁNG HÔM SAU.
--   Quên chạy phần B thì tin nhắn lúc 8h sáng rơi NGOÀI mọi khung → không ai được
--   chấm công, và nếu lúc đó hàm đã nối vào n8n thì sau 22h cả nhóm bị ghi NGHỈ.
--
--   Để khó quên, phần A làm hàm trả thêm trường `CANH_BAO` trong kết quả. Hễ còn
--   thấy trường đó là còn đang chạy giờ thử.
--
-- Bảng giờ:
--                     THẬT              THỬ TỐI NAY
--   Khung sáng      04:00–11:59        19:00–20:59
--   Chuẩn sáng      08:00              20:00
--   Khung chiều     12:00–16:59        21:00–21:59
--   Chuẩn chiều     13:30              21:30
--   Tăng ca từ      17:00              22:00
--   Đóng sổ lúc     17:00              22:00
--
-- Mọi thứ khác giữ NGUYÊN: cách so tên, van an toàn theo buổi, chốt chặn không đè
-- dòng 'MAY', luật chiều thứ Bảy lần 2 và 4.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN A — ĐẶT GIỜ THỬ. Chạy phần này để thử.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function dung_cham_cong_zalo(p_tu date, p_den date)
returns jsonb language plpgsql set search_path = public, pg_temp
as $$
declare v_hom_nay date; v_gio_vn time; v_ghi int;
begin
  if p_tu is null or p_den is null or p_den < p_tu then
    return jsonb_build_object('loi', 'Khoảng ngày không hợp lệ');
  end if;
  if p_den - p_tu > 366 then
    return jsonb_build_object('loi', 'Khoảng ngày quá dài, tối đa 366 ngày');
  end if;
  v_hom_nay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_gio_vn  := (now() at time zone 'Asia/Ho_Chi_Minh')::time;

  with ngay_xet as (
    select d::date as ngay from generate_series(p_tu, p_den, interval '1 day') d
    where extract(dow from d) between 1 and 6
  ),
  nguoi as (
    -- Nối theo uid_zalo_cham_cong (mã theo tài khoản Zalo đang chạy wf chấm công),
    -- KHÔNG phải uid_from. Xem lý do đầy đủ ở sql/cham_cong_zalo.sql phần 5.
    select id as nhan_vien_id, name as ten, uid_zalo_cham_cong as uid from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_zalo_cham_cong, '') <> ''
  ),
  tin as (
    select n.nhan_vien_id, z.ngay,
           -- ⚠ GIỜ THỬ: sáng 19:00–20:59, chiều 21:00–21:59, tăng ca từ 22:00
           case when z.gio >= time '19:00' and z.gio < time '21:00' then 'S'
                when z.gio >= time '21:00' and z.gio < time '22:00' then 'C' else null end as buoi,
           z.gio
    from (select uid_from, ngay, content,
                 (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
          from zalo_cham_cong where ngay between p_tu and p_den) z
    join nguoi n on n.uid = z.uid_from
    where zalo_khop_ten(z.content, n.ten)
  ),
  dau_buoi as (
    select nhan_vien_id, ngay, buoi, min(gio) as gio from tin where buoi is not null group by 1,2,3
  ),
  co_ai as (
    select ngay, bool_or(buoi = 'S') as co_sang, bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      -- ⚠ GIỜ THỬ: đóng sổ lúc 22:00 thay vì 17:00
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '22:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false)
        and not (extract(dow from nx.ngay) = 6
                 and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as xet_chieu
    from ngay_xet nx cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
  ),
  co_cua as (
    select t.*, (t.da_dong_so and t.xet_sang and t.gio_sang is null) as thieu_sang,
                (t.da_dong_so and t.xet_chieu and t.gio_chieu is null) as thieu_chieu
    from tinh t
  ),
  ket as (
    select cc.ngay, cc.nhan_vien_id, cc.gio_sang, cc.gio_chieu,
      (cc.thieu_sang or cc.thieu_chieu) as nghi,
      case when cc.thieu_sang and cc.thieu_chieu then 'Nghỉ'
           when cc.thieu_sang then 'Nghỉ sáng'
           when cc.thieu_chieu then 'Nghỉ chiều' else null end as nghi_text,
      -- ⚠ GIỜ THỬ: chuẩn sáng 20:00, chuẩn chiều 21:30
      (coalesce(floor(greatest(0, extract(epoch from (cc.gio_sang  - time '20:00')) / 60)), 0)
       + coalesce(floor(greatest(0, extract(epoch from (cc.gio_chieu - time '21:30')) / 60)), 0))::int
        as di_muon_phut
    from co_cua cc
    where cc.gio_sang is not null or cc.gio_chieu is not null or cc.thieu_sang or cc.thieu_chieu
  )
  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nguon)
  select to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN' else 'T' || (extract(dow from k.ngay)+1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null, null,
    k.di_muon_phut, coalesce(v.so_phut, 0), k.nghi, k.nghi_text, 'ZALO'
  from ket k left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky = excluded.ky, thu = excluded.thu,
    gio_in_sang = excluded.gio_in_sang, gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut, ve_som_phut = excluded.ve_som_phut,
    nghi = excluded.nghi, nghi_text = excluded.nghi_text
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object(
    'so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den,
    -- Trường này CHỈ có ở bản giờ thử. Còn thấy nó là còn phải chạy PHẦN B.
    'CANH_BAO', 'DANG CHAY GIO THU BUOI TOI (sang 20:00, chieu 21:30, dong so 22:00) '
                || '— chay PHAN B cua sql/TAM-gio-cham-cong-thu-buoi-toi.sql de tra ve gio that');
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN B — TRẢ VỀ GIỜ THẬT. ⚠ CHẠY TRƯỚC 7h SÁNG HÔM SAU.
--
-- Sau khi chạy, gọi thử hàm và kiểm: kết quả trả về KHÔNG được còn trường 'CANH_BAO'.
--   select dung_cham_cong_zalo('1900-01-01','1900-01-01');
--   -- kỳ vọng: {"tu": "1900-01-01", "den": "1900-01-01", "so_dong_ghi": 0}
--
-- Nhớ dọn luôn dòng chấm công rác sinh ra trong lúc thử:
--   select nhan_vien_id, ngay, gio_in_sang, di_muon_phut, nghi, nguon
--   from cham_cong where nguon = 'ZALO';        -- xem trước cho chắc
--   delete from cham_cong where nguon = 'ZALO' and ngay = date '2026-08-06';
-- ════════════════════════════════════════════════════════════════════════════
create or replace function dung_cham_cong_zalo(p_tu date, p_den date)
returns jsonb language plpgsql set search_path = public, pg_temp
as $$
declare v_hom_nay date; v_gio_vn time; v_ghi int;
begin
  if p_tu is null or p_den is null or p_den < p_tu then
    return jsonb_build_object('loi', 'Khoảng ngày không hợp lệ');
  end if;
  if p_den - p_tu > 366 then
    return jsonb_build_object('loi', 'Khoảng ngày quá dài, tối đa 366 ngày');
  end if;
  v_hom_nay := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_gio_vn  := (now() at time zone 'Asia/Ho_Chi_Minh')::time;

  with ngay_xet as (
    select d::date as ngay from generate_series(p_tu, p_den, interval '1 day') d
    where extract(dow from d) between 1 and 6
  ),
  nguoi as (
    -- Nối theo uid_zalo_cham_cong (mã theo tài khoản Zalo đang chạy wf chấm công),
    -- KHÔNG phải uid_from. Xem lý do đầy đủ ở sql/cham_cong_zalo.sql phần 5.
    select id as nhan_vien_id, name as ten, uid_zalo_cham_cong as uid from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_zalo_cham_cong, '') <> ''
  ),
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '04:00' and z.gio < time '12:00' then 'S'
                when z.gio >= time '12:00' and z.gio < time '17:00' then 'C' else null end as buoi,
           z.gio
    from (select uid_from, ngay, content,
                 (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
          from zalo_cham_cong where ngay between p_tu and p_den) z
    join nguoi n on n.uid = z.uid_from
    where zalo_khop_ten(z.content, n.ten)
  ),
  dau_buoi as (
    select nhan_vien_id, ngay, buoi, min(gio) as gio from tin where buoi is not null group by 1,2,3
  ),
  co_ai as (
    select ngay, bool_or(buoi = 'S') as co_sang, bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '17:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false)
        and not (extract(dow from nx.ngay) = 6
                 and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as xet_chieu
    from ngay_xet nx cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
  ),
  co_cua as (
    select t.*, (t.da_dong_so and t.xet_sang and t.gio_sang is null) as thieu_sang,
                (t.da_dong_so and t.xet_chieu and t.gio_chieu is null) as thieu_chieu
    from tinh t
  ),
  ket as (
    select cc.ngay, cc.nhan_vien_id, cc.gio_sang, cc.gio_chieu,
      (cc.thieu_sang or cc.thieu_chieu) as nghi,
      case when cc.thieu_sang and cc.thieu_chieu then 'Nghỉ'
           when cc.thieu_sang then 'Nghỉ sáng'
           when cc.thieu_chieu then 'Nghỉ chiều' else null end as nghi_text,
      (coalesce(floor(greatest(0, extract(epoch from (cc.gio_sang  - time '08:00')) / 60)), 0)
       + coalesce(floor(greatest(0, extract(epoch from (cc.gio_chieu - time '13:30')) / 60)), 0))::int
        as di_muon_phut
    from co_cua cc
    where cc.gio_sang is not null or cc.gio_chieu is not null or cc.thieu_sang or cc.thieu_chieu
  )
  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nguon)
  select to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN' else 'T' || (extract(dow from k.ngay)+1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null, null,
    k.di_muon_phut, coalesce(v.so_phut, 0), k.nghi, k.nghi_text, 'ZALO'
  from ket k left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky = excluded.ky, thu = excluded.thu,
    gio_in_sang = excluded.gio_in_sang, gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut, ve_som_phut = excluded.ve_som_phut,
    nghi = excluded.nghi, nghi_text = excluded.nghi_text
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object('so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den);
end $$;
