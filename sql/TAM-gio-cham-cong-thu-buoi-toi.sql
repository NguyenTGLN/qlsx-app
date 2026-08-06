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
    select id as nhan_vien_id, name as ten, uid_zalo_cham_cong as uid from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_zalo_cham_cong, '') <> ''
  ),
  tho as (
    select uid_from, ngay, content,
           (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
    from zalo_cham_cong where ngay between p_tu and p_den
  ),
  -- Tin KHAI NGHỈ. KHÔNG giới hạn khung giờ: "nghỉ hôm nay" nhắn lúc nào cũng là khai nghỉ.
  --
  -- Chỉ nhận khi tin nhắc tên CHÍNH người gửi, hoặc không nhắc tên ai cả ("em xin nghỉ hôm
  -- nay"). Tin nhắc tên NGƯỜI KHÁC bị bỏ qua hoàn toàn — chủ app chốt 06/08 sau khi thấy tin
  -- thật "Bích tăng ca 17h30 đến 19h30" gửi từ máy Hà: nếu bắt chữ "nghỉ" mà không xét tên
  -- thì "Bích nghỉ hôm nay" sẽ ghi nghỉ cho HÀ — người đang đi làm và báo hộ đồng nghiệp.
  tin_nghi as (
    select n.nhan_vien_id, z.ngay, zalo_loai_nghi(z.content) as loai, z.gio, z.content
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_loai_nghi(z.content) is not null
      and (zalo_khop_ten(z.content, n.ten)
           or not exists (select 1 from nguoi o
                          where o.nhan_vien_id <> n.nhan_vien_id
                            and zalo_khop_ten(z.content, o.ten)))
  ),
  khai as (
    select nhan_vien_id, ngay,
           bool_or(loai = 'Nghỉ')       as khai_ngay,
           bool_or(loai = 'Nghỉ sáng')  as khai_s,
           bool_or(loai = 'Nghỉ chiều') as khai_c,
           (array_agg(content order by gio))[1] as tin_dau
    from tin_nghi group by 1, 2
  ),
  -- Tin CHẤM CÔNG. Loại hẳn tin khai nghỉ: "Hà nghỉ chiều" có chứa chữ "Hà" nhưng là khai
  -- nghỉ chứ không phải chấm công — để nguyên thì nó thành giờ vào lúc 11h.
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '19:00' and z.gio < time '21:00' then 'S'
                when z.gio >= time '21:00' and z.gio < time '22:00' then 'C' else null end as buoi,
           z.gio
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_khop_ten(z.content, n.ten) and zalo_loai_nghi(z.content) is null
  ),
  dau_buoi as (
    select nhan_vien_id, ngay, buoi, min(gio) as gio from tin where buoi is not null group by 1,2,3
  ),
  co_ai as (
    -- VAN AN TOÀN theo TỪNG BUỔI. n8n chết lúc trưa thì cả nhóm đủ tin sáng nhưng trắng tin
    -- chiều — van theo ngày sẽ gạch 'Nghỉ chiều' cho cả 13 người. Che cùng lúc: ngày lễ,
    -- n8n chết, Zalo rớt phiên. KHÔNG áp cho tin khai nghỉ: khai nghỉ là bằng chứng trực tiếp.
    select ngay, bool_or(buoi = 'S') as co_sang, bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '22:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false) as co_chieu,
      -- Lịch tách RIÊNG khỏi van an toàn: khai nghỉ chiều vào chiều T7 tuần 2/4 thì không ghi,
      -- vì hôm đó vốn không có buổi chiều để mà nghỉ.
      not (extract(dow from nx.ngay) = 6
           and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as lich_co_chieu,
      coalesce(k.khai_ngay, false) as khai_ngay,
      coalesce(k.khai_s, false)    as khai_s,
      coalesce(k.khai_c, false)    as khai_c,
      k.tin_dau
    from ngay_xet nx cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
    left join khai    k  on k.nhan_vien_id = ng.nhan_vien_id and k.ngay = nx.ngay
  ),
  co_cua as (
    select t.*,
      (t.khai_ngay or t.khai_s) as nghi_s,
      ((t.khai_ngay or t.khai_c) and t.lich_co_chieu) as nghi_c
    from tinh t
  ),
  cu as (
    select c.*,
      -- Khai nghỉ THẮNG: bỏ luôn giờ vào của buổi đó, không thì dòng tự mâu thuẫn
      -- ("Nghỉ sáng" mà vẫn có giờ vào buổi sáng).
      case when c.nghi_s then null else c.gio_sang end as gs,
      case when c.nghi_c then null else c.gio_chieu end as gc,
      (c.nghi_s or (c.da_dong_so and c.xet_sang and c.gio_sang is null))                      as thieu_sang,
      (c.nghi_c or (c.da_dong_so and c.co_chieu and c.lich_co_chieu and c.gio_chieu is null)) as thieu_chieu
    from co_cua c
  ),
  ket as (
    select cu.ngay, cu.nhan_vien_id, cu.gs as gio_sang, cu.gc as gio_chieu,
      (cu.thieu_sang or cu.thieu_chieu) as nghi,
      case when cu.thieu_sang and cu.thieu_chieu then 'Nghỉ'
           when cu.thieu_sang then 'Nghỉ sáng'
           when cu.thieu_chieu then 'Nghỉ chiều' else null end as nghi_text,
      -- Nguyên văn tin gây ra nghỉ, để người bị trừ điểm thấy được câu nào chứ không phải đoán.
      case when cu.tin_dau is not null then 'Nghỉ theo tin Zalo: "' || cu.tin_dau || '"' end as nghi_van,
      (coalesce(floor(greatest(0, extract(epoch from (cu.gs - time '20:00')) / 60)), 0)
       + coalesce(floor(greatest(0, extract(epoch from (cu.gc - time '21:30')) / 60)), 0))::int
        as di_muon_phut
    from cu
    where cu.gs is not null or cu.gc is not null or cu.thieu_sang or cu.thieu_chieu
  )
  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nghi_van, nguon)
  select to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN' else 'T' || (extract(dow from k.ngay)+1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null, null,
    k.di_muon_phut, coalesce(v.so_phut, 0), k.nghi, k.nghi_text, k.nghi_van, 'ZALO'
  from ket k left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky = excluded.ky, thu = excluded.thu,
    gio_in_sang = excluded.gio_in_sang, gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut, ve_som_phut = excluded.ve_som_phut,
    nghi = excluded.nghi, nghi_text = excluded.nghi_text, nghi_van = excluded.nghi_van
  -- ⚠ CHỐT CHẶN QUAN TRỌNG NHẤT. Ngày nào Excel đã nạp thì dòng đó nguon = 'MAY', điều kiện
  --   sai, Zalo KHÔNG CHẠM VÀO ĐƯỢC. Bỏ mệnh đề này là số "ai nhớ nhắn" đè lên số "ai quẹt
  --   vân tay".
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object('so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den,
    'CANH_BAO', 'DANG CHAY GIO THU BUOI TOI (sang 20:00, chieu 21:30, dong so 22:00) '
                || '-- chay PHAN B cua sql/TAM-gio-cham-cong-thu-buoi-toi.sql de tra ve gio that');
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
    select id as nhan_vien_id, name as ten, uid_zalo_cham_cong as uid from nhan_vien
    where ten_cham_cong is not null and coalesce(uid_zalo_cham_cong, '') <> ''
  ),
  tho as (
    select uid_from, ngay, content,
           (to_timestamp(ts / 1000.0) at time zone 'Asia/Ho_Chi_Minh')::time as gio
    from zalo_cham_cong where ngay between p_tu and p_den
  ),
  -- Tin KHAI NGHỈ. KHÔNG giới hạn khung giờ: "nghỉ hôm nay" nhắn lúc nào cũng là khai nghỉ.
  --
  -- Chỉ nhận khi tin nhắc tên CHÍNH người gửi, hoặc không nhắc tên ai cả ("em xin nghỉ hôm
  -- nay"). Tin nhắc tên NGƯỜI KHÁC bị bỏ qua hoàn toàn — chủ app chốt 06/08 sau khi thấy tin
  -- thật "Bích tăng ca 17h30 đến 19h30" gửi từ máy Hà: nếu bắt chữ "nghỉ" mà không xét tên
  -- thì "Bích nghỉ hôm nay" sẽ ghi nghỉ cho HÀ — người đang đi làm và báo hộ đồng nghiệp.
  tin_nghi as (
    select n.nhan_vien_id, z.ngay, zalo_loai_nghi(z.content) as loai, z.gio, z.content
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_loai_nghi(z.content) is not null
      and (zalo_khop_ten(z.content, n.ten)
           or not exists (select 1 from nguoi o
                          where o.nhan_vien_id <> n.nhan_vien_id
                            and zalo_khop_ten(z.content, o.ten)))
  ),
  khai as (
    select nhan_vien_id, ngay,
           bool_or(loai = 'Nghỉ')       as khai_ngay,
           bool_or(loai = 'Nghỉ sáng')  as khai_s,
           bool_or(loai = 'Nghỉ chiều') as khai_c,
           (array_agg(content order by gio))[1] as tin_dau
    from tin_nghi group by 1, 2
  ),
  -- Tin CHẤM CÔNG. Loại hẳn tin khai nghỉ: "Hà nghỉ chiều" có chứa chữ "Hà" nhưng là khai
  -- nghỉ chứ không phải chấm công — để nguyên thì nó thành giờ vào lúc 11h.
  tin as (
    select n.nhan_vien_id, z.ngay,
           case when z.gio >= time '04:00' and z.gio < time '12:00' then 'S'
                when z.gio >= time '12:00' and z.gio < time '17:00' then 'C' else null end as buoi,
           z.gio
    from tho z join nguoi n on n.uid = z.uid_from
    where zalo_khop_ten(z.content, n.ten) and zalo_loai_nghi(z.content) is null
  ),
  dau_buoi as (
    select nhan_vien_id, ngay, buoi, min(gio) as gio from tin where buoi is not null group by 1,2,3
  ),
  co_ai as (
    -- VAN AN TOÀN theo TỪNG BUỔI. n8n chết lúc trưa thì cả nhóm đủ tin sáng nhưng trắng tin
    -- chiều — van theo ngày sẽ gạch 'Nghỉ chiều' cho cả 13 người. Che cùng lúc: ngày lễ,
    -- n8n chết, Zalo rớt phiên. KHÔNG áp cho tin khai nghỉ: khai nghỉ là bằng chứng trực tiếp.
    select ngay, bool_or(buoi = 'S') as co_sang, bool_or(buoi = 'C') as co_chieu
    from dau_buoi group by ngay
  ),
  tinh as (
    select nx.ngay, ng.nhan_vien_id, s.gio as gio_sang, c.gio as gio_chieu,
      (nx.ngay < v_hom_nay or (nx.ngay = v_hom_nay and v_gio_vn >= time '17:00')) as da_dong_so,
      coalesce(ca.co_sang, false) as xet_sang,
      coalesce(ca.co_chieu, false) as co_chieu,
      -- Lịch tách RIÊNG khỏi van an toàn: khai nghỉ chiều vào chiều T7 tuần 2/4 thì không ghi,
      -- vì hôm đó vốn không có buổi chiều để mà nghỉ.
      not (extract(dow from nx.ngay) = 6
           and ceil(extract(day from nx.ngay) / 7.0) in (2, 4)) as lich_co_chieu,
      coalesce(k.khai_ngay, false) as khai_ngay,
      coalesce(k.khai_s, false)    as khai_s,
      coalesce(k.khai_c, false)    as khai_c,
      k.tin_dau
    from ngay_xet nx cross join nguoi ng
    left join dau_buoi s on s.nhan_vien_id = ng.nhan_vien_id and s.ngay = nx.ngay and s.buoi = 'S'
    left join dau_buoi c on c.nhan_vien_id = ng.nhan_vien_id and c.ngay = nx.ngay and c.buoi = 'C'
    left join co_ai   ca on ca.ngay = nx.ngay
    left join khai    k  on k.nhan_vien_id = ng.nhan_vien_id and k.ngay = nx.ngay
  ),
  co_cua as (
    select t.*,
      (t.khai_ngay or t.khai_s) as nghi_s,
      ((t.khai_ngay or t.khai_c) and t.lich_co_chieu) as nghi_c
    from tinh t
  ),
  cu as (
    select c.*,
      -- Khai nghỉ THẮNG: bỏ luôn giờ vào của buổi đó, không thì dòng tự mâu thuẫn
      -- ("Nghỉ sáng" mà vẫn có giờ vào buổi sáng).
      case when c.nghi_s then null else c.gio_sang end as gs,
      case when c.nghi_c then null else c.gio_chieu end as gc,
      (c.nghi_s or (c.da_dong_so and c.xet_sang and c.gio_sang is null))                      as thieu_sang,
      (c.nghi_c or (c.da_dong_so and c.co_chieu and c.lich_co_chieu and c.gio_chieu is null)) as thieu_chieu
    from co_cua c
  ),
  ket as (
    select cu.ngay, cu.nhan_vien_id, cu.gs as gio_sang, cu.gc as gio_chieu,
      (cu.thieu_sang or cu.thieu_chieu) as nghi,
      case when cu.thieu_sang and cu.thieu_chieu then 'Nghỉ'
           when cu.thieu_sang then 'Nghỉ sáng'
           when cu.thieu_chieu then 'Nghỉ chiều' else null end as nghi_text,
      -- Nguyên văn tin gây ra nghỉ, để người bị trừ điểm thấy được câu nào chứ không phải đoán.
      case when cu.tin_dau is not null then 'Nghỉ theo tin Zalo: "' || cu.tin_dau || '"' end as nghi_van,
      (coalesce(floor(greatest(0, extract(epoch from (cu.gs - time '08:00')) / 60)), 0)
       + coalesce(floor(greatest(0, extract(epoch from (cu.gc - time '13:30')) / 60)), 0))::int
        as di_muon_phut
    from cu
    where cu.gs is not null or cu.gc is not null or cu.thieu_sang or cu.thieu_chieu
  )
  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_text, nghi_van, nguon)
  select to_char(k.ngay, 'YYYY-MM'), k.nhan_vien_id, k.ngay,
    case extract(dow from k.ngay) when 0 then 'CN' else 'T' || (extract(dow from k.ngay)+1)::int end,
    to_char(k.gio_sang, 'HH24:MI'), to_char(k.gio_chieu, 'HH24:MI'), null, null,
    k.di_muon_phut, coalesce(v.so_phut, 0), k.nghi, k.nghi_text, k.nghi_van, 'ZALO'
  from ket k left join ve_som_tay v on v.nhan_vien_id = k.nhan_vien_id and v.ngay = k.ngay
  on conflict (nhan_vien_id, ngay) do update set
    ky = excluded.ky, thu = excluded.thu,
    gio_in_sang = excluded.gio_in_sang, gio_in_chieu = excluded.gio_in_chieu,
    di_muon_phut = excluded.di_muon_phut, ve_som_phut = excluded.ve_som_phut,
    nghi = excluded.nghi, nghi_text = excluded.nghi_text, nghi_van = excluded.nghi_van
  -- ⚠ CHỐT CHẶN QUAN TRỌNG NHẤT. Ngày nào Excel đã nạp thì dòng đó nguon = 'MAY', điều kiện
  --   sai, Zalo KHÔNG CHẠM VÀO ĐƯỢC. Bỏ mệnh đề này là số "ai nhớ nhắn" đè lên số "ai quẹt
  --   vân tay".
  where cham_cong.nguon = 'ZALO';

  get diagnostics v_ghi = row_count;
  return jsonb_build_object('so_dong_ghi', v_ghi, 'tu', p_tu, 'den', p_den);
end $$;
