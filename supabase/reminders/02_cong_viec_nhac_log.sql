-- Chống gửi trùng cho Job B: mỗi (việc, mốc, hạn) chỉ nhắc 1 lần.
-- Đổi hạn -> due_snapshot khác -> nhắc lại theo hạn mới. Việc lặp lại sinh id mới -> log tách bạch.
create table if not exists cong_viec_nhac_log (
  task_id      text        not null,
  moc          text        not null,      -- '60' | '30' | '5'
  due_snapshot timestamptz not null,      -- hạn tại thời điểm nhắc
  sent_at      timestamptz not null default now(),
  unique (task_id, moc, due_snapshot)
);
