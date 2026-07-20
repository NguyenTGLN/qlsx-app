// Logic thuần cho đính kèm công việc — KHÔNG import supabase/DOM để test chạy được ở môi trường node.
// Phần I/O (nén ảnh, upload, xoá) nằm ở attachmentStorage.js.

export const MAX_SIZE = 25 * 1024 * 1024;   // chặn cứng mỗi file
export const WARN_SIZE = 10 * 1024 * 1024;  // cảnh báo nhưng vẫn cho upload
export const MAX_COUNT = 10;                // mỗi việc / mỗi lần cập nhật tiến độ
export const MAX_EMBED_IMAGES = 10;         // số ảnh tối đa nhúng vào lưới trong thẻ Zalo (= MAX_COUNT)

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

// Chia đính kèm thành 2 nhóm cho nhắc việc Zalo (thiết kế v2 — một khối duy nhất):
//   images — NHÚNG vào lưới <img> trong thẻ HTML, HCTI render → cả 10 ảnh vẫn là 1 tin nhắn
//   links  — chèn link vào nội dung tin nhắn (video, file — Zalo OA không upload được video;
//            và ảnh vượt hạn MAX_EMBED_IMAGES, phòng hờ)
export function splitZaloAttachments(list) {
  const images = [];
  const links = [];
  for (const a of list || []) {
    if (a.kind === 'image' && images.length < MAX_EMBED_IMAGES) images.push(a);
    else links.push(a);
  }
  return { images, links };
}

// Webhook n8n "xem file": rút ngắn link + chọn đích thông minh (excel/word → Office Viewer
// xem trực tiếp trên điện thoại; pdf/video/ảnh → mở thẳng). Workflow: docs/n8n/wf-xem-file-dinh-kem.json
export const FILE_VIEW_BASE = 'https://thegioilocnuoc.site/webhook/f?p=';

export function attachmentViewUrl(a) {
  return a.path ? FILE_VIEW_BASE + a.path : a.url;
}

// Nhãn đứng TRƯỚC link trần. Zalo không cho gắn chữ lên link trong tin nhắn text
// (xem docs/n8n/nhac-viec-workflows.md mục 4c) nên đây là dạng gần nhất với "bấm vào đây".
const LINK_LABEL = {
  image: '🖼 Bấm vào đây để xem ảnh',
  video: '🎬 Bấm vào đây để xem video',
  file: '📄 Bấm vào đây xem file gửi kèm',
};

// nguồn của sự thật cho node n8n "Tạo thẻ" — sửa hàm này là phải sửa cả bản copy trong n8n
// (xem docs/n8n/nhac-viec-workflows.md)
//
// Liệt kê MỌI đính kèm, kể cả ảnh đã nhúng trong thẻ: ảnh nhúng bị HCTI thu nhỏ và không bấm
// được, người nhận vẫn cần link để mở bản đầy đủ.
export function buildZaloAttachmentText(list) {
  const atts = (list || []).filter(Boolean);
  if (!atts.length) return '';
  const kindOfAtt = a => a.kind || kindOf(a.mime);
  // Đánh số trong từng loại khi có nhiều hơn 1 — nhãn là chữ đứng trước link trần, không đánh số
  // thì 3 ảnh ra 3 dòng chữ giống hệt nhau, người nhận không biết link nào là ảnh nào.
  const total = {};
  for (const a of atts) { const k = kindOfAtt(a); total[k] = (total[k] || 0) + 1; }
  const seen = {};
  const lines = atts.map(a => {
    const k = kindOfAtt(a);
    seen[k] = (seen[k] || 0) + 1;
    const num = total[k] > 1 ? ` (${seen[k]}/${total[k]})` : '';
    return `${LINK_LABEL[k] || LINK_LABEL.file}${num} — ${fmtSize(a.size)}:\n${attachmentViewUrl(a)}`;
  });
  return `📎 Đính kèm:\n${lines.join('\n')}`;
}
