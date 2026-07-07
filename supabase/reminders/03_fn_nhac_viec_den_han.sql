-- Job B: nhắc trước hạn theo băng 60/30/5 phút.
-- Chạy mỗi 1 phút (xem 05_schedule.sql). Chỉ gọi n8n khi thật sự có việc vào băng.
-- LƯU Ý múi giờ: nếu cột due_date là 'timestamp without time zone', đổi (t.due_date)::timestamptz
--   thành ((t.due_date)::timestamp at time zone 'UTC') ở cả 2 chỗ.
create or replace function fn_nhac_viec_den_han() returns void
language plpgsql security definer as $$
declare
  v_url text; rec record;
begin
  select value into v_url from reminder_config where key='webhook_den_han';

  for rec in
    with picked as (
      select t.id, n.name as assignee_name,
             (t.due_date)::timestamptz as due_ts,
             extract(epoch from ((t.due_date)::timestamptz - now())) / 60 as mins_left
      from cong_viec_duoc_giao t
      left join nhan_vien n on n.id = t.assignee_id
      where t.status in ('IN_PROGRESS','PENDING') and (t.due_date)::timestamptz > now()
    ),
    banded as (
      select *, case
        when mins_left <= 60 and mins_left > 30 then '60'
        when mins_left <= 30 and mins_left > 5  then '30'
        when mins_left <= 5  and mins_left > 0  then '5'
      end as moc
      from picked
    ),
    ins as (
      insert into cong_viec_nhac_log(task_id, moc, due_snapshot)
      select id, moc, due_ts from banded where moc is not null
      on conflict (task_id, moc, due_snapshot) do nothing
      returning task_id, moc
    )
    select b.* from ins join banded b on b.id = ins.task_id and b.moc = ins.moc
  loop
    -- Body khớp shape webhook nút Nhắc (n8n đọc $json.body.task.id / .assignee.name) + thêm moc/minutes_left
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'type','due_soon', 'moc', rec.moc, 'minutes_left', round(rec.mins_left),
        'task', jsonb_build_object('id', rec.id),
        'assignee', jsonb_build_object('name', rec.assignee_name)
      )
    );
  end loop;
end $$;
