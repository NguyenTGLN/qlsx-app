-- Đính kèm hình ảnh / video / file cho phân hệ Công việc
-- Spec: docs/superpowers/specs/2026-07-16-dinh-kem-file-cong-viec-design.md
--
-- Chạy 1 lần trong Supabase SQL Editor. An toàn chạy lại (idempotent).
--
-- SAU KHI CHẠY FILE NÀY, phải tạo bucket bằng tay trong Supabase Dashboard → Storage:
--   Tên      : task-attachments
--   Public   : BẬT  (link video/file phải mở được trên điện thoại không cần đăng nhập,
--                    và n8n phải tải ảnh về để upload lên Zalo OA)
--   File size: 25 MB
-- Không tạo bucket bằng SQL vì cần service_role key.

alter table cong_viec_duoc_giao add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table tien_do            add column if not exists attachments jsonb not null default '[]'::jsonb;

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

-- Kiểm tra:
--   select id, jsonb_array_length(attachments) from cong_viec_duoc_giao limit 5;
