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

// ── Danh sách thành phẩm từ BOM (cho picker Phiếu Sản Xuất) ──
const BOM_KEY = 'catalog:bom_products';
let bomInflight = null;

/** Thành phẩm distinct từ bom_items [{code, name}] — cache 10', dedup in-flight. */
export async function getBomProducts() {
  const cached = dataCache.get(BOM_KEY, TTL);
  if (cached) return cached;
  if (bomInflight) return bomInflight;
  bomInflight = (async () => {
    try {
      const { data, error } = await fetchAllRows(() =>
        db.from('bom_items').select('product_code, product_name, inventory_items!product_code(item_name)'));
      if (error) throw error;
      const seen = new Set(); const unique = [];
      for (const d of (data || [])) {
        if (!seen.has(d.product_code)) {
          seen.add(d.product_code);
          // Ưu tiên tên chuẩn từ danh mục hàng hóa (inventory_items)
          unique.push({ code: d.product_code, name: d.inventory_items?.item_name || d.product_name || '' });
        }
      }
      unique.sort((a, b) => a.code.localeCompare(b.code));
      dataCache.set(BOM_KEY, unique); // chỉ cache danh sách đã rút gọn, không giữ dòng BOM thô
      return unique;
    } finally { bomInflight = null; }
  })();
  return bomInflight;
}

/** Gọi sau khi thêm/sửa/xóa BOM để picker thành phẩm thấy thay đổi ngay. */
export function invalidateBomProducts() { dataCache.invalidate(BOM_KEY); }
