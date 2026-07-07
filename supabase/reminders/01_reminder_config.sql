-- Cấu hình URL webhook cho hệ nhắc việc. Đổi test <-> prod bằng UPDATE, không phải sửa hàm.
create table if not exists reminder_config (
  key   text primary key,
  value text not null
);

-- webhook_den_han: URL TEST khi đang dựng n8n; đổi sang /webhook/ khi go-live (xem 05/Task 8).
-- webhook_dang_thuc_hien: webhook "tổng hợp" a6fc08fc SẴN CÓ (tái dùng chuỗi ảnh tổng hợp lúc 8:00).
insert into reminder_config(key, value) values
  ('webhook_den_han',        'https://thegioilocnuoc.site/webhook-test/cong_viec_den_han'),
  ('webhook_dang_thuc_hien', 'https://thegioilocnuoc.site/webhook/a6fc08fc-dc4e-432e-9588-424d78470769')
on conflict (key) do update set value = excluded.value;
