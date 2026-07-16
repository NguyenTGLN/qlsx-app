// I/O cho đính kèm công việc: nén ảnh, upload, xoá.
// Logic thuần (phân loại, validate, dựng text Zalo) nằm ở attachments.js.
import { supabase } from './supabase';
import { kindOf } from './attachments';

export const BUCKET = 'task-attachments';

const MAX_EDGE = 1600;      // cạnh dài tối đa sau khi nén
const WEBP_QUALITY = 0.82;

const ext = (name) => {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'bin';
};

// Nén ảnh phía client: ảnh điện thoại 4MB còn ~200KB.
// Trả về { blob, mime, ext }. Không nén được thì trả nguyên bản — không chặn người dùng.
async function compressImage(file) {
  const original = { blob: file, mime: file.type, ext: ext(file.name) };
  // GIF động sẽ bị canvas làm phẳng còn 1 khung hình → giữ nguyên.
  if (file.type === 'image/gif') return original;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', WEBP_QUALITY));
    // Nén xong mà to hơn bản gốc thì giữ bản gốc.
    if (!blob || blob.size >= file.size) return original;
    return { blob, mime: 'image/webp', ext: 'webp' };
  } catch {
    return original; // ví dụ HEIC ngoài Safari: trình duyệt không decode được
  }
}

// Upload 1 file, trả về phần tử attachment để lưu vào cột jsonb.
// folder: 'tasks' (đính kèm của việc) | 'progress' (đính kèm của 1 lần cập nhật tiến độ)
export async function uploadAttachment(file, { folder, userId }) {
  const kind = kindOf(file.type);
  const prepared = kind === 'image' ? await compressImage(file) : { blob: file, mime: file.type, ext: ext(file.name) };

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const path = `${folder}/${month}/${crypto.randomUUID()}.${prepared.ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.blob, { cacheControl: '3600', upsert: false, contentType: prepared.mime });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    path,
    name: file.name,          // tên gốc để hiển thị, không phải tên đã băm
    mime: prepared.mime,
    kind,
    size: prepared.blob.size, // dung lượng SAU khi nén — đúng với cái đang nằm trong Storage
    uploaded_by: userId || null,
    uploaded_at: new Date().toISOString(),
  };
}

// Xoá file khỏi Storage. Không ném lỗi: xoá hụt chỉ để lại rác, không được chặn thao tác người dùng.
export async function deleteAttachments(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try {
    await supabase.storage.from(BUCKET).remove(list);
  } catch {
    /* rác trong Storage — chấp nhận */
  }
}

export const collectPaths = (list) => (list || []).map(a => a?.path).filter(Boolean);

// File được upload ngay lúc chọn, nên khi người dùng bấm Hủy phải xoá lại những file vừa thêm.
// added = danh sách hiện tại trừ đi danh sách lúc mở form.
export function cleanupAdded(current, initial) {
  const keep = new Set(collectPaths(initial));
  return deleteAttachments(collectPaths(current).filter(p => !keep.has(p)));
}
