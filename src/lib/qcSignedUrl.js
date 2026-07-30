// Link ký cho ảnh CLSP — bucket qc_images không còn cho đọc công khai.
// Database lưu link đầy đủ dạng .../object/public/qc_images/<tên file> (hàng trăm dòng cũ),
// nên phải TÁCH TÊN FILE khỏi link đã lưu rồi xin link ký — không được giả định link mới.
import { supabase } from './supabase';

export const QC_BUCKET = 'qc_images';
const TTL = 300; // giây — link ký sống 5 phút
// Đệm link ký theo tên file, trừ hao 60s để không đưa ra link sắp hết hạn
const cache = new Map();

// Tách tên file khỏi link đã lưu. Nhận cả link đầy đủ lẫn tên file trần.
export function tachTenFile(url) {
  if (!url) return '';
  const s = String(url);
  const m = s.match(/\/qc_images\/([^?]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  // Không phải link qc_images: chuỗi không chứa '/' thì coi là tên file trần
  return s.includes('/') ? '' : s;
}

// Nhận diện video theo link GỐC đã lưu — link ký có đuôi ?token=... nên đừng test trên link ký
export const laVideo = (url) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(String(url || ''));

export async function signQcUrl(urlDaLuu) {
  const ten = tachTenFile(urlDaLuu);
  if (!ten) throw new Error('Không tách được tên file từ link ảnh: ' + urlDaLuu);
  const hit = cache.get(ten);
  if (hit && hit.hetHan > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(QC_BUCKET).createSignedUrl(ten, TTL);
  if (error) throw error;
  cache.set(ten, { url: data.signedUrl, hetHan: Date.now() + (TTL - 60) * 1000 });
  return data.signedUrl;
}
