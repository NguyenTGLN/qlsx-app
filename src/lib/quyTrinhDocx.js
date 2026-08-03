// ============================================================
// QUY TRÌNH — dựng tệp .docx khổ A3 ngang.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// .docx = ZIP chứa XML ⇒ dùng jszip có sẵn, KHÔNG thêm phụ thuộc mới.
// Các hàm dựng CHUỖI ở đây là hàm thuần, test được ở environment 'node'.
// Phần gói ZIP (taoDocx) cần Blob nên chỉ kiểm chứng tay bằng Word thật.
//
// Sai một chi tiết là Word báo hỏng tệp, nên mọi hằng số đều có test.
// ============================================================

import { thoatXml } from './quyTrinhSvg';

// A3 = 297 × 420 mm. 1mm = 1440/25.4 twip.
export const A3_W_TWIP = 23811;   // 420mm — cạnh dài, làm BỀ NGANG vì in ngang
export const A3_H_TWIP = 16838;   // 297mm
const EMU_PER_TWIP = 635;
// Vùng in A3 ngang sau khi trừ lề trên+dưới (567+567 twip), tính bằng EMU.
export const CAO_IN_EMU = (A3_H_TWIP - 1134) * EMU_PER_TWIP;
const PHONG = 'Times New Roman';
const CO_MAC_DINH = 12;

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function sectPrXml() {
  return `<w:sectPr><w:pgSz w:w="${A3_W_TWIP}" w:h="${A3_H_TWIP}" w:orient="landscape"/>`
    + `<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="284" w:footer="284" w:gutter="0"/></w:sectPr>`;
}

export function doanXml(text, { dam = false, co = CO_MAC_DINH, canGiua = false, mau = null } = {}) {
  const sz = Math.round(co * 2);   // Word dùng nửa-điểm
  // Thứ tự con trong pPr/rPr theo ECMA-376 là BẮT BUỘC: spacing (22) trước jc (27),
  // color (19) trước sz (24). Sai thứ tự thì Word báo "không mở được tệp", không nói lý do.
  const pPr = `<w:pPr><w:spacing w:before="20" w:after="20"/>${canGiua ? '<w:jc w:val="center"/>' : ''}</w:pPr>`;
  const rPr = `<w:rPr><w:rFonts w:ascii="${PHONG}" w:hAnsi="${PHONG}" w:cs="${PHONG}"/>`
    + `${dam ? '<w:b/>' : ''}${mau ? `<w:color w:val="${thoatXml(mau).replace('#', '')}"/>` : ''}`
    + `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${thoatXml(text)}</w:t></w:r></w:p>`;
}

const VIEN = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map(v => `<w:${v} w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>`).join('');

/** cols: [{nhan, rong}] (rong tính bằng twip) · rows: [[ô, ô, …]] */
export function bangXml(cols, rows, { coChu = 10 } = {}) {
  const o = (text, { dam = false, nen = null } = {}, rong) =>
    `<w:tc><w:tcPr><w:tcW w:w="${rong}" w:type="dxa"/>`
    + `${nen ? `<w:shd w:val="clear" w:color="auto" w:fill="${nen}"/>` : ''}</w:tcPr>`
    + `${doanXml(text, { dam, co: coChu })}</w:tc>`;

  const grid = `<w:tblGrid>${cols.map(c => `<w:gridCol w:w="${c.rong}"/>`).join('')}</w:tblGrid>`;
  const dauBang = `<w:tr>${cols.map(c => o(c.nhan, { dam: true, nen: 'EEF2F7' }, c.rong)).join('')}</w:tr>`;
  const than = rows.map(r =>
    `<w:tr>${cols.map((c, i) => o(r[i] ?? '', {}, c.rong)).join('')}</w:tr>`).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${VIEN}</w:tblBorders></w:tblPr>`
    + `${grid}${dauBang}${than}</w:tbl>`;
}

/** Ảnh nội tuyến. rongEmu là bề ngang mong muốn; chiều cao suy ra theo tỉ lệ ảnh. */
export function anhXml(rId, wPx, hPx, rongEmu) {
  const cx = Math.round(rongEmu), cy = Math.round(rongEmu * (hPx / wPx));
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="1" name="LuuDo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="LuuDo"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const ngayVn = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};
const tieuDeMuc = t => doanXml(t, { dam: true, co: 13 });

export function documentXml({ quyTrinh, phienBan, dienGiai, lichSu }, rIdAnh, anh = null) {
  const t = phienBan.tai_lieu || {};
  const RONG = A3_W_TWIP - 1134;                     // trừ lề hai bên
  const p = [];

  // ── Khối kiểm soát tài liệu ──
  p.push(bangXml(
    [{ nhan: 'Tên quy trình', rong: Math.round(RONG * 0.5) },
     { nhan: 'Thông tin kiểm soát tài liệu', rong: Math.round(RONG * 0.5) }],
    [[quyTrinh.ten,
      `Mã số: ${quyTrinh.ma_so}    |    Lần ban hành: ${String(phienBan.lan_ban_hanh).padStart(2, '0')}`
      + `    |    Phiên bản: ${phienBan.phien_ban}    |    Ngày hiệu lực: ${ngayVn(phienBan.ngay_hieu_luc)}`]],
    { coChu: 11 }));

  // ── Ba ô chữ ký ──
  const ba = Math.round(RONG / 3);
  p.push(bangXml(
    [{ nhan: 'Người lập', rong: ba }, { nhan: 'Người kiểm tra', rong: ba }, { nhan: 'Người duyệt', rong: ba }],
    [[t.nguoiLap || '', t.nguoiKiemTra || '', t.nguoiDuyet || ''], ['', '', '']],
    { coChu: 10 }));

  // ── Mục 1–4 ──
  p.push(tieuDeMuc('1. Mục đích'), doanXml(t.mucDich || ''));
  p.push(tieuDeMuc('2. Phạm vi áp dụng'), doanXml(t.phamVi || ''));
  p.push(tieuDeMuc('3. Tài liệu viện dẫn'));
  for (const v of (t.vienDan || [])) p.push(doanXml('• ' + v));
  p.push(tieuDeMuc('4. Định nghĩa và từ viết tắt'));
  for (const d of (t.dinhNghia || [])) p.push(doanXml(`• ${d.tu} — ${d.nghia}`));

  // ── Mục 5: lưu đồ ──
  p.push(tieuDeMuc('5. Lưu đồ quy trình'));
  if (rIdAnh && anh) {
    // Kẹp theo CẢ hai chiều. Ép full bề ngang rồi thôi là sai: lưu đồ ÍT CỘT thì
    // hẹp, ép ra 400mm sẽ phóng to nhiều hơn nên lại CAO hơn — nhóm 4 cột tràn
    // khổ giấy ngay lần xuất đầu, trước khi vẽ thêm bước nào.
    const rongToiDa = RONG * EMU_PER_TWIP;
    const rongVua = Math.min(rongToiDa, CAO_IN_EMU * (anh.w / anh.h));
    p.push(anhXml(rIdAnh, anh.w, anh.h, rongVua));
  }

  // ── Mục 6: diễn giải ──
  p.push(tieuDeMuc('6. Diễn giải lưu đồ'));
  p.push(bangXml(
    [{ nhan: 'Bước', rong: Math.round(RONG * 0.04) },
     { nhan: 'Nội dung', rong: Math.round(RONG * 0.18) },
     { nhan: 'Người thực hiện', rong: Math.round(RONG * 0.12) },
     { nhan: 'Diễn giải chi tiết', rong: Math.round(RONG * 0.46) },
     { nhan: 'Hồ sơ / Biểu mẫu', rong: Math.round(RONG * 0.20) }],
    (dienGiai || []).map(r => [
      String(r.stt), r.ten, r.nguoiThucHien, r.dienGiai,
      (r.hoSo || []).join(', ') || '—',
    ])));

  // ── Mục 7: hồ sơ lưu ──
  p.push(tieuDeMuc('7. Hồ sơ lưu'));
  p.push(bangXml(
    [{ nhan: 'TT', rong: Math.round(RONG * 0.04) },
     { nhan: 'Tên hồ sơ', rong: Math.round(RONG * 0.30) },
     { nhan: 'Bộ phận lưu', rong: Math.round(RONG * 0.18) },
     { nhan: 'Thời gian lưu', rong: Math.round(RONG * 0.18) },
     { nhan: 'Hình thức lưu', rong: Math.round(RONG * 0.30) }],
    (t.hoSoLuu || []).map((h, i) => [String(i + 1), h.ten, h.boPhan, h.thoiGian, h.hinhThuc])));

  // ── Mục 8: theo dõi sửa đổi ──
  p.push(tieuDeMuc('8. Theo dõi sửa đổi tài liệu'));
  p.push(bangXml(
    [{ nhan: 'Lần sửa', rong: Math.round(RONG * 0.08) },
     { nhan: 'Ngày', rong: Math.round(RONG * 0.12) },
     { nhan: 'Phiên bản', rong: Math.round(RONG * 0.10) },
     { nhan: 'Nội dung sửa đổi', rong: Math.round(RONG * 0.50) },
     { nhan: 'Người sửa', rong: Math.round(RONG * 0.20) }],
    (lichSu || []).map(r => [
      String(r.lan_ban_hanh).padStart(2, '0'), r.ngay, r.phien_ban, r.noiDung || '', r.nguoi || '',
    ])));

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  return `${XML_HEAD}<w:document ${NS}><w:body>${p.join('')}${sectPrXml()}</w:body></w:document>`;
}

export function contentTypesXml() {
  return `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Default Extension="png" ContentType="image/png"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `</Types>`;
}

export function relsXml() {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `</Relationships>`;
}

export function docRelsXml(coAnh) {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + (coAnh
      ? `<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`
      : '')
    + `</Relationships>`;
}
