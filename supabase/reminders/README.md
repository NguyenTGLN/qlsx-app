# Nhắc việc tự động (pg_cron + pg_net → n8n image pipeline)

Tự động nhắc việc qua Zalo, không cần mở app. Timing chạy trong Supabase (`pg_cron`),
gọi webhook n8n (`pg_net`), tái dùng chuỗi dựng ảnh HCTI + mention `id_zalo_oa` sẵn có.

- **Job A — 8:00 giờ VN**: kích hoạt webhook tổng hợp `a6fc08fc` → ảnh bảng tổng hợp + từng người.
- **Job B — mỗi phút**: việc `IN_PROGRESS`/`PENDING` vào băng 60/30/5 phút trước hạn → webhook `cong_viec_den_han` → thẻ ảnh + mention.

## Áp lần đầu (SQL Editor, đúng thứ tự)
```
00_extensions.sql
01_reminder_config.sql
02_cong_viec_nhac_log.sql
03_fn_nhac_viec_den_han.sql
04_fn_nhac_viec_dang_thuc_hien.sql
05_schedule.sql
```
Rồi import `../../docs/n8n/wf-nhac-viec-updated.json`, Activate workflow, và **bỏ `triggerAtHour: 8`**
trong node `Schedule 8h & 17h` (giữ 17h) để tránh gửi trùng 8:00.

## Đổi test ↔ production (webhook đến hạn)
```sql
update reminder_config set value='https://thegioilocnuoc.site/webhook/cong_viec_den_han' where key='webhook_den_han';
```

## Đổi mốc / giờ
- Mốc 60/30/5: sửa `CASE` trong `03_fn_nhac_viec_den_han.sql` rồi chạy lại file.
- Giờ 8:00: sửa `'0 1 * * *'` (UTC) trong `05_schedule.sql` rồi chạy lại file.

## Gỡ
Dán `99_rollback.sql`. Khôi phục `triggerAtHour: 8` trong node Schedule n8n nếu cần.

## Theo dõi
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
select * from net._http_response order by created desc limit 20;
```

## Lưu ý múi giờ
Nếu cột `cong_viec_duoc_giao.due_date` là `timestamp without time zone`, đổi `(t.due_date)::timestamptz`
thành `((t.due_date)::timestamp at time zone 'UTC')` trong `03_fn_nhac_viec_den_han.sql`.
