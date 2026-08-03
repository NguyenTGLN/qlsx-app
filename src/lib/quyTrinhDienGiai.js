// ============================================================
// QUY TRÌNH — sinh các dòng "Diễn giải lưu đồ" (mục 6 tài liệu ISO).
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục F)
//
// Bảng diễn giải KHÔNG có dữ liệu riêng — nó là hình chiếu của sơ đồ.
// Người thực hiện suy ra từ CỘT, nên đổi cột là bảng đổi theo.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

import { thuTuBuoc, timKhoi } from './quyTrinhSoDo';

/** Nhánh của một khối = cách nó ĐƯỢC ĐI TỚI trong luồng thường ('ok' | 'ng' | '').
 *  Có bất kỳ đường THƯỜNG nào đi vào ⇒ bước nằm trên luồng chính, không tô nhánh:
 *  một bước bị vòng "Làm lại" quay về vẫn là bước chính, và điểm hợp lưu của hai
 *  nhánh cũng vậy. Tô nhánh cho chúng là nói sai trong tài liệu ISO. */
function nhanhVao(soDo, id) {
  const vao = (soDo.edges || []).filter(e => e.b === id);
  if (vao.some(e => !e.k || e.k === 'n')) return '';
  if (vao.some(e => e.k === 'ok')) return 'ok';
  if (vao.some(e => e.k === 'ng')) return 'ng';
  return '';
}

export function dongDienGiai(soDo) {
  if (!soDo?.nodes?.length) return [];
  return thuTuBuoc(soDo).map((id, i) => {
    const n = timKhoi(soDo, id);
    const cot = soDo.lanes?.[n.lane];
    const form = String(n.form ?? '').trim();
    return {
      stt: i + 1,
      khoiId: n.id,
      ten: n.tx,
      loai: n.t,
      nguoiThucHien: cot?.owner || '—',
      boPhan: cot?.name || '—',
      dienGiai: n.desc || '',
      hoSo: form && form !== '—' ? form.split('·').map(s => s.trim()).filter(Boolean) : [],
      thoiGian: n.time || '—',
      nhanh: nhanhVao(soDo, n.id),
    };
  });
}
