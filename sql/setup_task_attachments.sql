-- Đính kèm hình ảnh / video / file cho phân hệ Công việc
-- Spec: docs/superpowers/specs/2026-07-16-dinh-kem-file-cong-viec-design.md
--
-- Chạy 1 lần trong Supabase SQL Editor. An toàn chạy lại (idempotent).
-- File này làm TẤT CẢ: 2 cột + bucket + policy. Không phải bấm gì trong Dashboard.
--
-- (SQL Editor chạy với quyền chủ sở hữu nên tạo được bucket; app dùng anon key thì không.)

-- ============================================================
-- 1. Hai cột lưu danh sách đính kèm
-- ============================================================
alter table cong_viec_duoc_giao add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table tien_do            add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ============================================================
-- 2. Bucket chứa file
-- ============================================================
-- public = true vì: link video/file phải mở được trên điện thoại không cần đăng nhập,
-- và n8n phải tải ảnh về để upload lên Zalo OA.
-- Đánh đổi đã bàn: ai có link là xem được file. Đường dẫn đặt ngẫu nhiên nên không đoán
-- được, nhưng link đã lộ thì không thu hồi được.
-- 26214400 = 25 MB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', true, 26214400)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ============================================================
-- 3. Policy — BẮT BUỘC, thiếu là upload lỗi dù bucket đã có
-- ============================================================
-- Supabase bật RLS sẵn trên storage.objects. Bucket public chỉ mở đường ĐỌC qua URL công khai;
-- ghi và xoá vẫn cần policy. Ba policy dưới chỉ áp cho bucket này, không đụng qc_images/zalo-reports.
drop policy if exists "task_attachments_doc"     on storage.objects;
drop policy if exists "task_attachments_tai_len" on storage.objects;
drop policy if exists "task_attachments_xoa"     on storage.objects;

create policy "task_attachments_doc" on storage.objects
  for select using (bucket_id = 'task-attachments');

create policy "task_attachments_tai_len" on storage.objects
  for insert with check (bucket_id = 'task-attachments');

-- Cần cho: bấm X gỡ file, bấm Hủy form, và dọn file khi xoá công việc.
create policy "task_attachments_xoa" on storage.objects
  for delete using (bucket_id = 'task-attachments');

-- Mỗi phần tử của mảng:
-- {
--   "url": "https://<ref>.supabase.co/storage/v1/object/public/task-attachments/tasks/2026-07/9f3a1b.webp",
--   "path": "tasks/2026-07/9f3a1b.webp",     -- dùng để xoá file trong Storage
--   "name": "ban-ve-lap-dat.pdf",            -- tên gốc người dùng thấy
--   "mime": "application/pdf",
--   "kind": "image" | "video" | "file",      -- app và n8n đều rẽ nhánh theo trường này
--   "size": 128374,
--   "uploaded_by": "NV001",
--   "uploaded_at": "2026-07-16T09:12:00.000Z"
-- }
--
-- kind được tính MỘT LẦN lúc upload và lưu cứng — không nơi nào suy lại từ mime.

comment on column cong_viec_duoc_giao.attachments is
  'Mảng file đính kèm của công việc. Xem docs/superpowers/specs/2026-07-16-dinh-kem-file-cong-viec-design.md';
comment on column tien_do.attachments is
  'Mảng file đính kèm của một lần cập nhật tiến độ.';

-- ============================================================
-- Kiểm tra sau khi chạy (cả 3 câu phải ra kết quả)
-- ============================================================
--   select id, public, file_size_limit from storage.buckets where id = 'task-attachments';
--   select policyname from pg_policies where tablename = 'objects' and policyname like 'task_attachments%';
--   select id, jsonb_array_length(attachments) from cong_viec_duoc_giao limit 5;
