-- ============================================================
-- RETAIL DIRECT PROPOSAL: mã bán lẻ (không BOM + có xuất bán)
-- đi thẳng vào purchase_proposals, không qua DKSX/nổ BOM.
-- Chạy trong Supabase SQL Editor.
-- ============================================================

-- Phân biệt nguồn dòng đề xuất:
--   'bom'    = sinh từ recomputeProposals() (nổ BOM từ DKSX)  [mặc định]
--   'retail' = mua thẳng mã bán lẻ, recompute KHÔNG được xóa
ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'bom';

-- Dòng cũ source=NULL coi như 'bom' (NULL IS DISTINCT FROM 'retail' → vẫn bị recompute xử lý như cũ).

CREATE INDEX IF NOT EXISTS idx_pp_source ON public.purchase_proposals(source);

-- KIỂM TRA:
-- SELECT source, count(*) FROM public.purchase_proposals GROUP BY source;
