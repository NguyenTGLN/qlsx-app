-- ════════════════════════════════════════════════════════════════════════════
-- CỘT `ten_cham_cong` — nối họ tên trong tệp máy chấm công với nhân viên (01/08/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao cần: `nhan_vien.name` là TÊN GỌI TẮT ('Tuấn'), còn máy chấm công xuất HỌ TÊN
-- ĐẦY ĐỦ ('Vương Tuấn Anh'). Không có cột nào nối được hai thứ đó, nên bảng ánh xạ
-- đang phải gõ cứng trong scripts/import-cham-cong.mjs — thuê người mới là phải sửa mã
-- và deploy lại.
--
-- Vì sao KHÔNG đoán bằng quy tắc: "lấy chữ cuối họ tên" đúng 12/13 người, nhưng sai ở
-- 'Vương Tuấn Anh', và 'Nguyễn Xuân Thiện' chứa chữ 'Xuân' vốn là tên gọi của người
-- khác (dvx). Đoán sai = gán trọn tháng chấm công sang nhầm người, không lỗi nào báo.
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table nhan_vien add column if not exists ten_cham_cong text;

-- Chỉ mục DUY NHẤT, không phải trang trí: hai nhân viên mang cùng một họ tên chấm công
-- thì màn hình nạp sẽ dồn hết dòng cho một người và người kia mất sạch — lỗi im lặng.
-- Ràng buộc ở CSDL làm chuyện đó không xảy ra được.
-- `where ... is not null` để nhiều người CHƯA khai báo vẫn cùng để null được.
create unique index if not exists nhan_vien_ten_cham_cong_uniq
  on nhan_vien (ten_cham_cong) where ten_cham_cong is not null;

-- Điền sẵn 13 người, chép từ MAP_NV trong scripts/import-cham-cong.mjs.
update nhan_vien set ten_cham_cong = v.ten
from (values
  ('ndp','Nguyễn Đình Phong'), ('ptt','Phùng Thị Thơ'), ('hhx','Hoàng Hà Xuyên'),
  ('admin','Đỗ Hương Nguyên'), ('nbn','Nguyễn Bá Ngọc'), ('vta','Vương Tuấn Anh'),
  ('dvx','Đỗ Văn Xuân'), ('nvh','Nguyễn Văn Hĩu'), ('nxt','Nguyễn Xuân Thiện'),
  ('nttd','Nguyễn Thị Thùy Dương'), ('nv8','Nguyễn Thị Duyên'), ('lvb','Lê Văn Bích'),
  ('ntth','Nguyễn Thị Thu Hà')
) as v(id, ten)
where nhan_vien.id = v.id
  and nhan_vien.ten_cham_cong is distinct from v.ten;

commit;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Đúng 13 người đã có họ tên chấm công (kỳ vọng: 13):
select count(*) as da_khai_bao from nhan_vien where ten_cham_cong is not null;

-- 2) Xem đủ danh sách, đối chiếu mắt thường với tệp Excel:
select id, name, ten_cham_cong from nhan_vien
where ten_cham_cong is not null order by ten_cham_cong;

-- 3) Ai CHƯA khai báo (kỳ vọng: hangkt, nva, test, TGD — bốn người không chấm công):
select id, name from nhan_vien where ten_cham_cong is null order by id;

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` ở 2 dòng cuối rồi chạy
-- Để dạng chú thích có chủ đích: dán cả tệp để chạy phần kiểm tra thì không vô tình
-- hoàn tác luôn thứ vừa làm.
-- ════════════════════════════════════════════════════════════════════════════
-- drop index if exists nhan_vien_ten_cham_cong_uniq;
-- alter table nhan_vien drop column if exists ten_cham_cong;
