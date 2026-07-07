-- Job A: 8:00 kích hoạt webhook "tổng hợp" a6fc08fc sẵn có (nhánh n8n tự query & dựng ảnh).
-- Chạy 1 lần/ngày (xem 05_schedule.sql).
create or replace function fn_nhac_viec_dang_thuc_hien() returns void
language plpgsql security definer as $$
declare v_url text;
begin
  select value into v_url from reminder_config where key='webhook_dang_thuc_hien';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('type','daily_8h','sent_at', now())
  );
end $$;
