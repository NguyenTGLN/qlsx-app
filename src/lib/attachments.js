// Logic thuần cho đính kèm công việc — KHÔNG import supabase/DOM để test chạy được ở môi trường node.
// Phần I/O (nén ảnh, upload, xoá) nằm ở attachmentStorage.js.

export const MAX_SIZE = 25 * 1024 * 1024;   // chặn cứng mỗi file
export const WARN_SIZE = 10 * 1024 * 1024;  // cảnh báo nhưng vẫn cho upload
export const MAX_COUNT = 10;                // mỗi việc / mỗi lần cập nhật tiến độ
export const MAX_ZALO_IMAGES = 5;           // mỗi ảnh là 1 tin nhắn cách nhau 2s → quá số này là spam nhóm

const KIND_LABEL = { image: 'Ảnh', video: 'Video', file: 'File' };

export function kindOf(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'file';
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  const mb = Math.round((n / 1024 / 1024) * 10) / 10;
  return `${mb}MB`;
}

export function validateFile(file, current) {
  if ((current || []).length >= MAX_COUNT) return { ok: false, error: `Tối đa ${MAX_COUNT} file mỗi việc` };
  if (file.size > MAX_SIZE) return { ok: false, error: 'File vượt 25MB' };
  return { ok: true };
}

export function warnFor(file) {
  if (file.size < WARN_SIZE) return null;
  return `${KIND_LABEL[kindOf(file.type)]} ${fmtSize(file.size)} — tải lên có thể lâu trên 4G`;
}

// Lọc một lượt chọn nhiều file: nhận file nào, chặn file nào, cảnh báo gì.
// Bộ đếm phải tăng dần NGAY trong vòng lặp — nơi gọi không thể dựa vào React state
// (setState bất đồng bộ, đọc trong cùng vòng lặp sẽ luôn thấy giá trị cũ → lọt quá hạn).
export function planSelection(files, current) {
  const accepted = [], errors = [], warnings = [];
  let running = [...(current || [])];
  for (const file of files) {
    const v = validateFile(file, running);
    if (!v.ok) { errors.push(`${file.name}: ${v.error}`); continue; }
    const w = warnFor(file);
    if (w) warnings.push(`${file.name} — ${w}`);
    accepted.push(file);
    running = [...running, { size: file.size }];
  }
  return { accepted, errors, warnings };
}

export function totalSize(list) {
  return (list || []).reduce((sum, a) => sum + (Number(a.size) || 0), 0);
}

// Chia đính kèm thành 2 nhóm cho nhắc việc Zalo:
//   images — upload thật lên OA (Zalo chỉ có endpoint upload cho ảnh)
//   links  — chèn link vào nội dung tin nhắn (video, file, và ảnh vượt hạn MAX_ZALO_IMAGES)
export function splitZaloAttachments(list) {
  const images = [];
  const links = [];
  for (const a of list || []) {
    if (a.kind === 'image' && images.length < MAX_ZALO_IMAGES) images.push(a);
    else links.push(a);
  }
  return { images, links };
}

// nguồn của sự thật cho node n8n "Tạo thẻ" — sửa hàm này là phải sửa cả bản copy trong n8n
// (xem docs/n8n/nhac-viec-workflows.md)
export function buildZaloAttachmentText(list) {
  const { links } = splitZaloAttachments(list);
  if (!links.length) return '';
  const lines = links.map(a => `• ${a.name} (${fmtSize(a.size)}) — ${a.url}`);
  return `📎 Đính kèm:\n${lines.join('\n')}`;
}
