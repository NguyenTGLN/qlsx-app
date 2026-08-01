-- =====================================================================
-- SỬA 3 DÒNG BOM KHAI NGƯỢC CHIỀU — 29/07/2026
-- =====================================================================
-- VẤN ĐỀ: 3 linh kiện nhỏ bị khai là "chứa" nguyên một máy lọc nước
-- nóng lạnh WT-028S-RO. Hàm nổ BOM đi xuống tiếp thay vì dừng lại,
-- khiến mỗi máy ECO-100RO kéo theo 34 "máy ma" → SL đề xuất linh kiện
-- phồng 10-290 lần (Q-5044: 296.605 thay vì ~21.451).
--
-- AN TOÀN: bảng WT-028S-RO ĐÃ CÓ SẴN 3 dòng đúng chiều, số lượng y hệt
-- (WASHER-LT x4, V-FR-300 x1, E-V-SV-D-LM x1). Nên 3 dòng dưới đây chỉ
-- là bản đảo ngược trùng lặp — xoá KHÔNG mất thông tin nào.
--
-- ĐÃ SAO LƯU: bak_bom_items_20260729 (1814 dòng)
--             bak_purchase_proposals_20260729 (150 dòng)
--             Cả hai đã REVOKE khỏi anon/authenticated + bật RLS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PHẦN 1 — KIỂM TRA TRƯỚC (chỉ đọc, chạy lúc nào cũng được)
-- ---------------------------------------------------------------------
-- 1a. Ba dòng sắp xoá — phải ra đúng 3 dòng
select product_code, component_code, quantity
from bom_items
where (product_code, component_code) in
  (('WASHER-LT','WT-028S-RO'), ('V-FR-300','WT-028S-RO'), ('E-V-SV-D-LM','WT-028S-RO'));

-- 1b. Ba dòng ĐÚNG CHIỀU vẫn còn — phải ra đúng 3 dòng, SL 4/1/1
select product_code, component_code, quantity
from bom_items
where product_code = 'WT-028S-RO'
  and component_code in ('WASHER-LT','V-FR-300','E-V-SV-D-LM');

-- 1c. Bản sao lưu đủ dòng — phải ra 1814 và 150
select (select count(*) from bak_bom_items_20260729)          as bak_bom,
       (select count(*) from bak_purchase_proposals_20260729) as bak_dx;


-- ---------------------------------------------------------------------
-- PHẦN 2 — XOÁ (BƯỚC DUY NHẤT GÂY THAY ĐỔI DỮ LIỆU)
-- ---------------------------------------------------------------------
delete from bom_items
where (product_code, component_code) in
  (('WASHER-LT','WT-028S-RO'), ('V-FR-300','WT-028S-RO'), ('E-V-SV-D-LM','WT-028S-RO'));
-- Kỳ vọng: DELETE 3


-- ---------------------------------------------------------------------
-- PHẦN 3 — KIỂM CHỨNG SAU KHI XOÁ (chỉ đọc)
-- ---------------------------------------------------------------------
-- 3a. Tổng dòng phải là 1811 (1814 - 3)
select count(*) as tong_dong_bom_items from bom_items;

-- 3b. Ba dòng đúng chiều PHẢI CÒN NGUYÊN (nếu mất là sai, hoàn tác ngay)
select product_code, component_code, quantity
from bom_items
where product_code = 'WT-028S-RO'
  and component_code in ('WASHER-LT','V-FR-300','E-V-SV-D-LM');

-- 3c. Nổ BOM lại cho Q-5044 — phải ra 24889 thay vì 298189
with recursive
demand as (select item_code, sum(qty_demand)::numeric qty
           from production_demand where qty_demand > 0 group by 1),
seed as (select d.item_code code, d.qty qty, array[d.item_code]::text[] path, 0 lvl
         from demand d
         where exists (select 1 from bom_items b where b.product_code = d.item_code)),
expl as (
  select code, qty, path, lvl from seed
  union all
  select b.component_code, e.qty * coalesce(b.quantity,1), e.path||b.component_code, e.lvl+1
  from expl e join bom_items b on b.product_code = e.code
  where not (b.component_code = any(e.path)) and e.lvl < 25)
select sum(qty) as gross_q5044_sau_khi_sua
from expl e
where e.code = 'Q-5044'
  and not exists (select 1 from bom_items b where b.product_code = e.code);

-- 3d. Số máy WT-028S-RO app đang nổ BOM — phải về đúng 475 (trước là 18.705)
with recursive
demand as (select item_code, sum(qty_demand)::numeric qty
           from production_demand where qty_demand > 0 group by 1),
seed as (select d.item_code code, d.qty qty, array[d.item_code]::text[] path, 0 lvl
         from demand d
         where exists (select 1 from bom_items b where b.product_code = d.item_code)),
expl as (
  select code, qty, path, lvl from seed
  union all
  select b.component_code, e.qty * coalesce(b.quantity,1), e.path||b.component_code, e.lvl+1
  from expl e join bom_items b on b.product_code = e.code
  where not (b.component_code = any(e.path)) and e.lvl < 25)
select sum(qty) as so_may_028s_sau_khi_sua from expl where code = 'WT-028S-RO';


-- ---------------------------------------------------------------------
-- PHẦN 4 — HOÀN TÁC (dán chạy được ngay, khôi phục 100%)
-- ---------------------------------------------------------------------
-- 4a. Trả lại 3 dòng BOM vừa xoá
insert into bom_items (product_code, component_code, quantity)
values ('WASHER-LT','WT-028S-RO',4),
       ('V-FR-300','WT-028S-RO',1),
       ('E-V-SV-D-LM','WT-028S-RO',1);

-- 4b. Nếu ĐÃ chạy Bước 2 (tính lại đề xuất) và muốn quay lại nguyên trạng:
--     khôi phục toàn bộ bảng đề xuất từ bản sao lưu.
--     CẢNH BÁO: xoá sạch bảng hiện tại rồi nạp lại bản 29/07.
-- delete from purchase_proposals;
-- insert into purchase_proposals select * from bak_purchase_proposals_20260729;

-- 4c. Khôi phục toàn bộ bom_items từ bản sao lưu (phương án mạnh nhất)
-- delete from bom_items;
-- insert into bom_items select * from bak_bom_items_20260729;


-- =====================================================================
-- PHẦN 5 — TRẢ NHU CẦU SX CỦA ECO-100RO VỀ 259
-- =====================================================================
-- BỐI CẢNH: lúc kích hoạt tính lại (18:50 ngày 29/07/2026), ô "SL đề xuất"
-- ở tab Tồn HH được gõ 300. Quy tắc MAX ở StockSummaryTab.jsx:308 chỉ NÂNG
-- chứ không hạ, mà 300 > 259 nên nhu cầu DKSX bị nâng từ 259 lên 300.
-- Toàn bộ đề xuất linh kiện vừa tính đã gồm 41 máy dôi này.
-- Giá trị đúng trước đó: 259 (đo lúc 2026-07-29, updated_at cũ 2026-07-22 14:01:19).
--
-- LƯU Ý: tab DKSX không có ô sửa số lượng, Tồn HH chỉ nâng được — nên
-- phải hạ bằng SQL.

-- 5a. Xem trạng thái hiện tại — kỳ vọng 300
select item_code, qty_demand, trang_thai, updated_at
from production_demand where item_code = 'ECO-100RO';

-- 5b. HẠ VỀ 259 (bước gây thay đổi)
update production_demand
set qty_demand = 259, updated_at = now()
where item_code = 'ECO-100RO' and qty_demand = 300;
-- Kỳ vọng: UPDATE 1

-- 5c. Kiểm chứng — kỳ vọng 259
select item_code, qty_demand, updated_at
from production_demand where item_code = 'ECO-100RO';

-- 5d. HOÀN TÁC phần 5 (nếu muốn quay lại 300)
-- update production_demand set qty_demand = 300, updated_at = now()
-- where item_code = 'ECO-100RO';

-- SAU KHI CHẠY 5b: phải kích hoạt tính lại đề xuất lần nữa —
--   Tab Tồn HH → chọn ECO-100RO → gõ SL đề xuất đúng bằng số 1 → Gửi đề xuất.
--   (1 < 259 nên quy tắc MAX không đụng nhu cầu, nhưng recompute vẫn chạy.)
-- Kỳ vọng sau đó: Q-5044 = 21.421 (giảm 328 = 41 máy x 8 cái/máy).
