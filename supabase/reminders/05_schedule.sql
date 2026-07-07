-- Đăng ký 2 cron job. Chạy lại file an toàn (gỡ job trùng tên trước).
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');

-- Job B: mỗi 1 phút
select cron.schedule('nhac_den_han', '* * * * *', $$ select fn_nhac_viec_den_han(); $$);

-- Job A: 08:00 giờ VN = 01:00 UTC (VN không có DST)
select cron.schedule('nhac_8h', '0 1 * * *', $$ select fn_nhac_viec_dang_thuc_hien(); $$);
