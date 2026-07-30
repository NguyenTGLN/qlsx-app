// Link ký cho đính kèm công việc — bucket task-attachments không cho đọc công khai.
// Bản ghi lưu sẵn `url` công khai (hàng chục dòng cũ) và `path`; nhận cả hai để dòng cũ
// vẫn xem được: có `path` thì dùng luôn, không thì tách khỏi `url` đã lưu.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { BUCKET } from './attachmentStorage';

const TTL = 3600; // giây — 1 giờ, khớp hạn link ký của webhook Zalo
// Đệm theo path, trừ hao 60s để không đưa ra link sắp hết hạn
const cache = new Map();

export function attachmentPath(a) {
  if (!a) return '';
  if (a.path) return String(a.path);
  const m = String(a.url || '').match(/\/task-attachments\/([^?]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export async function signAttachmentUrl(a) {
  const p = attachmentPath(a);
  if (!p) throw new Error('Không xác định được đường dẫn tệp đính kèm');
  const hit = cache.get(p);
  if (hit && hit.hetHan > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, TTL);
  if (error) throw error;
  cache.set(p, { url: data.signedUrl, hetHan: Date.now() + (TTL - 60) * 1000 });
  return data.signedUrl;
}

// Hook cho các nơi hiển thị: url = null là đang xin link, loi = true là xin thất bại.
// Không trả link công khai làm phương án dự phòng — link đó đã bị chặn, hiện ra chỉ thành ảnh vỡ.
export function useSignedAttachment(a) {
  const key = attachmentPath(a);
  const [url, setUrl] = useState(null);
  const [loi, setLoi] = useState(false);

  useEffect(() => {
    setUrl(null);
    setLoi(false);
    if (!key) {
      if (a) setLoi(true); // có đính kèm nhưng không lần ra path → báo lỗi, đừng im lặng
      return;
    }
    let alive = true;
    signAttachmentUrl(a)
      .then(u => { if (alive) setUrl(u); })
      .catch(err => {
        console.error('Không ký được link đính kèm:', key, err);
        if (alive) setLoi(true);
      });
    return () => { alive = false; };
  }, [key]);

  return { url, loi };
}
