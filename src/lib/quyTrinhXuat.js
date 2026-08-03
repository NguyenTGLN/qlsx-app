// ============================================================
// QUY TRÌNH — ba đường xuất tệp: PNG, Word .docx, và in PDF.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// Module này ĐỤNG API TRÌNH DUYỆT (Image, canvas, Blob) nên không test
// đơn vị được. Mọi phép tính đã đẩy hết sang quyTrinhSvg.js / quyTrinhDocx.js
// là những chỗ CÓ test — ở đây chỉ còn phần nối dây.
// ============================================================

import { saveAs } from 'file-saver';
import { soDoSangSvg } from './quyTrinhSvg';
import { dongDienGiai } from './quyTrinhDienGiai';
import { taoDocx } from './quyTrinhDocx';

/** SVG → PNG. Trả { blob, w, h }. tyLe 2 cho nét khi in. */
export async function soDoSangPng(soDo, { tyLe = 2 } = {}) {
  const svg = soDoSangSvg(soDo, { tyLe });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((ok, loi) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => loi(new Error('Không dựng được ảnh lưu đồ.'));
      i.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không dựng được ảnh lưu đồ.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('Không dựng được ảnh lưu đồ — lưu đồ quá lớn so với giới hạn của trình duyệt. Hãy bớt cột hoặc bớt hàng rồi xuất lại.');
    return { blob, w: cv.width, h: cv.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const tenTep = (qt, pb, duoi) => `${qt.ma_so}_v${pb.phien_ban}${duoi}`;

export async function xuatPng(quyTrinh, phienBan) {
  const { blob } = await soDoSangPng(phienBan.so_do);
  saveAs(blob, tenTep(quyTrinh, phienBan, '_luu-do.png'));
}

export async function xuatDocx(quyTrinh, phienBan, lichSu) {
  const { blob, w, h } = await soDoSangPng(phienBan.so_do);
  const docx = await taoDocx(
    { quyTrinh, phienBan, dienGiai: dongDienGiai(phienBan.so_do), lichSu },
    await blob.arrayBuffer(),
    { w, h },
  );
  saveAs(docx, tenTep(quyTrinh, phienBan, '.docx'));
}

/** In PDF: dựa vào @media print của XemTruocTab, không cần thư viện. */
export function inPdf() {
  window.print();
}
