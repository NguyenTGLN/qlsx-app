-- Gỡ toàn bộ hệ nhắc việc.
select cron.unschedule('nhac_den_han') where exists (select 1 from cron.job where jobname='nhac_den_han');
select cron.unschedule('nhac_8h')      where exists (select 1 from cron.job where jobname='nhac_8h');
drop function if exists fn_nhac_viec_den_han();
drop function if exists fn_nhac_viec_dang_thuc_hien();
drop table if exists cong_viec_nhac_log;
drop table if exists reminder_config;
-- Không drop extension (module khác có thể dùng).
-- Nhớ khôi phục triggerAtHour:8 trong node "Schedule 8h & 17h" của n8n nếu muốn quay lại lịch cũ.
