-- Nhắc việc tự động — bật extension hẹn giờ + gọi HTTP trong DB.
-- Áp: Supabase Dashboard -> SQL Editor -> Run (hoặc Database -> Extensions: tick pg_cron, pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;
