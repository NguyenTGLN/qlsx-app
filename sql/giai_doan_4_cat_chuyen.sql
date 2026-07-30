-- =====================================================================
-- GIAI ĐOẠN 4 — CẮT CHUYỂN SANG LUỒNG ĐỀ XUẤT THEO ĐỢT — 29/07/2026
-- =====================================================================
-- Bước DUY NHẤT gây gián đoạn của cả dự án: lưu trữ toàn bộ dòng đề xuất
-- luồng cũ rồi xoá khỏi bảng sống. Sau bước này bảng đề xuất RỖNG cho tới
-- khi người dùng bấm "Chạy đề xuất" trên bản web mới.
--
-- User đã chốt (29/07): "dữ liệu cũ coi như bỏ, làm mới từ đầu" và
-- "Claude chạy SQL lưu trữ ngay trước deploy".
--
-- TRÌNH TỰ BẮT BUỘC:  chạy tệp này  →  kéo-thả dist lên Netlify
--                      →  đăng nhập, bấm "Chạy đề xuất", duyệt, Gửi.
-- Chạy tệp này mà KHÔNG deploy thì phòng mua nhìn thấy bảng rỗng trên
-- bản web cũ — khoảng trống đó đã được user chấp nhận, nhưng đừng kéo dài.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PHẦN 0 — KIỂM TRA TRƯỚC (chỉ đọc)
-- ---------------------------------------------------------------------
select (select count(*) from purchase_proposals)          as dong_song,      -- kỳ vọng 139
       (select count(*) from purchase_proposals_archive)  as da_luu_truoc,
       (select count(*) from proposal_batches)            as dot;            -- kỳ vọng 0


-- ---------------------------------------------------------------------
-- PHẦN 1 — SAO LƯU LẦN HAI (bản bak_ buổi sáng chụp lúc còn 150 dòng,
--          không khớp 139 dòng hiện tại nên chụp mới cho đúng thời điểm)
-- ---------------------------------------------------------------------
create table if not exists bak_purchase_proposals_20260729_catchuyen as
  select * from purchase_proposals;
alter table bak_purchase_proposals_20260729_catchuyen enable row level security;
revoke all on bak_purchase_proposals_20260729_catchuyen from anon, authenticated;


-- ---------------------------------------------------------------------
-- PHẦN 2 — LƯU TRỮ (kèm snapshot đã-nhận tính từ du_lieu_nhap)
-- ---------------------------------------------------------------------
insert into purchase_proposals_archive
  (orig_id, item_code, item_name, unit, dlk_code, calculated_qty, actual_qty,
   bom_qty, retail_qty, received_snapshot, tien_do, trang_thai, source, note,
   ngay_de_xuat, ngay_du_kien, batch_id, created_at, archived_by, archive_reason)
select p.id, p.item_code, p.item_name, p.unit, p.dlk_code, p.calculated_qty,
       p.actual_qty, p.bom_qty, p.retail_qty,
       coalesce((select sum(n.so_luong_nhap) from du_lieu_nhap n
                 where n.dlk_code = p.dlk_code), 0),
       p.tien_do, p.trang_thai, p.source, p.note, p.ngay_de_xuat, p.ngay_du_kien,
       p.batch_id, p.created_at, 'he_thong',
       'Chuyen sang luong de xuat theo dot 29/07/2026'
from purchase_proposals p;
-- Kỳ vọng: INSERT 139


-- ---------------------------------------------------------------------
-- PHẦN 3 — XOÁ DÒNG SỐNG (chỉ chạy khi PHẦN 2 báo đủ 139)
-- ---------------------------------------------------------------------
delete from purchase_proposals;
-- Kỳ vọng: DELETE 139


-- ---------------------------------------------------------------------
-- PHẦN 4 — KHOÁ NGOẠI batch_id (giờ mới thêm được: bảng đã rỗng,
--          không còn dòng cũ mang batch_id ngẫu nhiên trỏ vào hư không)
-- ---------------------------------------------------------------------
-- Bỏ default gen_random_uuid() TRƯỚC khi thêm khoá ngoại: nếu giữ, bất kỳ INSERT
-- nào quên batch_id sẽ nhận UUID ngẫu nhiên và vỡ khoá ngoại ngay. Bỏ default thì
-- dòng lạc rơi về NULL — cột nullable, khoá ngoại cho qua, không nổ giữa chừng.
alter table purchase_proposals alter column batch_id drop default;

alter table purchase_proposals
  add constraint purchase_proposals_batch_fk
  foreign key (batch_id) references proposal_batches(id) on delete cascade;


-- ---------------------------------------------------------------------
-- PHẦN 5 — KIỂM CHỨNG (chỉ đọc)
-- ---------------------------------------------------------------------
select (select count(*) from purchase_proposals)         as dong_song_con_lai, -- 0
       (select count(*) from purchase_proposals_archive
        where archive_reason like 'Chuyen sang luong%')  as vua_luu,           -- 139
       (select count(*) from bak_purchase_proposals_20260729_catchuyen) as bak, -- 139
       (select count(*) from pg_constraint
        where conname='purchase_proposals_batch_fk')     as co_khoa_ngoai;     -- 1


-- ---------------------------------------------------------------------
-- PHẦN 6 — HOÀN TÁC (dán chạy được ngay, khôi phục 100% trạng thái trước)
-- ---------------------------------------------------------------------
-- alter table purchase_proposals drop constraint if exists purchase_proposals_batch_fk;
-- alter table purchase_proposals alter column batch_id set default gen_random_uuid();
-- insert into purchase_proposals select * from bak_purchase_proposals_20260729_catchuyen;
-- delete from purchase_proposals_archive
--   where archive_reason = 'Chuyen sang luong de xuat theo dot 29/07/2026';
