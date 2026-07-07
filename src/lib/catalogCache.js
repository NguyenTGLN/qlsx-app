import { supabase as db, fetchAllRows } from './supabase';
import { dataCache } from './dataCache';

const KEY = 'catalog:inventory_items';
const TTL = 10 * 60 * 1000;
let inflight = null;

/**
 * Danh mục hàng hóa [{item_code, item_name, unit}] — nơi tải DUY NHẤT,
 * cache 10 phút, gộp các lời gọi song song (nhiều tab mount cùng lúc chỉ tải 1 lần).
 */
export async function getCatalogItems() {
  const cached = dataCache.get(KEY, TTL);
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await fetchAllRows(() =>
        db.from('inventory_items').select('item_code, item_name, unit').order('item_code'));
      if (error) throw error;
      dataCache.set(KEY, data || []);
      return data || [];
    } finally { inflight = null; }
  })();
  return inflight;
}

/** Gọi sau khi thêm/sửa/xóa mã trong danh mục để lần sau tải lại. */
export function invalidateCatalog() { dataCache.invalidate(KEY); }
