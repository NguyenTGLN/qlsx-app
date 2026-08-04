// ============================================================
// QUY TRÌNH — nhóm bộ phận, mẫu tài liệu ISO sẵn, sinh mã số.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (Q4, mục B)
//
// Mẫu để trong MÃ NGUỒN, không để trong DB: sửa mẫu là sửa mã, có test,
// không cần dựng thêm màn hình quản trị. Cần sửa mẫu trong app thì bàn riêng.
// Mọi hàm trả BẢN SAO để nơi gọi sửa thoải mái mà không hỏng mẫu gốc.
// ============================================================

import { LOAI_KHOI, CAO_HANG, yTaiHang } from './quyTrinhSoDo';

export const NHOM = [
  { ma: 'SX', ten: 'Sản xuất',              mau: '#0891b2' },
  { ma: 'CL', ten: 'Chất lượng',            mau: '#16a34a' },
  { ma: 'KH', ten: 'Kho hàng',              mau: '#0d9488' },
  { ma: 'CS', ten: 'CSKH',                  mau: '#8b5cf6' },
  { ma: 'BH', ten: 'Bảo hành',              mau: '#ef4444' },
  { ma: 'HC', ten: 'Nhân sự – Hành chính',  mau: '#64748b' },
];

const VIEN_DAN_CHUNG = ['ISO 9001:2015 — Hệ thống quản lý chất lượng'];
const DN = (tu, nghia) => ({ tu, nghia });
const HS = (ten, boPhan, thoiGian, hinhThuc) => ({ ten, boPhan, thoiGian, hinhThuc });

const MAU = {
  SX: {
    mucDich: 'Quy định trình tự và trách nhiệm trong hoạt động sản xuất, bảo đảm sản phẩm làm ra đạt yêu cầu kỹ thuật và truy xuất được khi có khiếu nại.',
    phamVi: 'Áp dụng cho toàn bộ hoạt động sản xuất tại nhà máy, từ khi tiếp nhận đơn hàng đến khi nhập kho thành phẩm.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.5 Sản xuất và cung cấp dịch vụ', 'Bảng tiêu chuẩn thao tác (TCTT) từng công đoạn'],
    dinhNghia: [DN('BOM', 'Định mức nguyên vật liệu cho một sản phẩm'), DN('DKSX', 'Đăng ký nhu cầu sản xuất'), DN('PSX', 'Phiếu lệnh sản xuất'), DN('TCTT', 'Bảng tiêu chuẩn thao tác'), DN('NG', 'Sản phẩm không đạt yêu cầu (No Good)')],
    hoSoLuu: [HS('Đăng ký nhu cầu sản xuất (DKSX)', 'P. Kế hoạch', '24 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Phiếu lệnh sản xuất (PSX)', 'Kho', '24 tháng', 'Bản cứng có ký giao nhận + bản mềm'), HS('Nhật ký sản xuất', 'Xưởng', '24 tháng', 'Bản mềm')],
    lanes: [['Kinh doanh', 'NV Kinh doanh', '#2563eb'], ['Kế hoạch SX', 'NV Kế hoạch', '#7c3aed'], ['Kho', 'Thủ kho', '#0d9488'], ['Sản xuất', 'Tổ trưởng SX', '#0891b2'], ['QC', 'NV QC', '#16a34a']],
  },
  CL: {
    mucDich: 'Quy định cách kiểm soát chất lượng và xử lý sản phẩm không phù hợp, bảo đảm hàng không đạt không lọt sang công đoạn sau.',
    phamVi: 'Áp dụng cho kiểm tra đầu vào, kiểm tra trong chuyền và kiểm tra cuối chuyền tại nhà máy.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.7 Kiểm soát đầu ra không phù hợp'],
    dinhNghia: [DN('QC', 'Kiểm tra chất lượng (Quality Control)'), DN('NG', 'Sản phẩm không đạt yêu cầu (No Good)'), DN('AQL', 'Mức chất lượng chấp nhận được')],
    hoSoLuu: [HS('Biên bản kiểm tra QC', 'P. QA', '24 tháng', 'Bản mềm kèm ảnh chụp'), HS('Phiếu xử lý hàng NG', 'P. QA', '24 tháng', 'Bản mềm trên phân hệ Chất lượng SP')],
    lanes: [['Kho', 'Thủ kho', '#0d9488'], ['QC', 'NV QC', '#16a34a'], ['Sản xuất', 'Tổ trưởng SX', '#0891b2'], ['P. QA', 'Trưởng phòng QA', '#7c3aed']],
  },
  KH: {
    mucDich: 'Quy định trình tự nhập – xuất – kiểm kê hàng hoá, bảo đảm số liệu tồn kho trên phần mềm khớp với thực tế.',
    phamVi: 'Áp dụng cho toàn bộ hoạt động kho nguyên vật liệu và kho thành phẩm.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.5.4 Bảo toàn'],
    dinhNghia: [DN('PNK', 'Phiếu nhập kho'), DN('PXK', 'Phiếu xuất kho'), DN('PSX', 'Phiếu lệnh sản xuất'), DN('FIFO', 'Nhập trước xuất trước')],
    hoSoLuu: [HS('Phiếu nhập kho', 'Kho', '24 tháng', 'Bản cứng + bản mềm'), HS('Phiếu xuất kho', 'Kho', '24 tháng', 'Bản cứng có ký giao nhận'), HS('Biên bản kiểm kê', 'Kho', '36 tháng', 'Bản cứng có chữ ký hội đồng')],
    lanes: [['Nhà cung cấp', 'NCC', '#64748b'], ['Kho', 'Thủ kho', '#0d9488'], ['QC', 'NV QC', '#16a34a'], ['Kế toán', 'NV Kế toán', '#2563eb']],
  },
  CS: {
    mucDich: 'Quy định cách tiếp nhận và xử lý yêu cầu của khách hàng, bảo đảm mọi phản ánh đều được trả lời và theo dõi tới khi đóng.',
    phamVi: 'Áp dụng cho toàn bộ kênh tiếp nhận: điện thoại, Zalo, tổng đài và trực tiếp tại cửa hàng.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 9.1.2 Sự thoả mãn của khách hàng'],
    dinhNghia: [DN('CSKH', 'Chăm sóc khách hàng'), DN('SLA', 'Thời hạn cam kết xử lý'), DN('KH', 'Khách hàng')],
    hoSoLuu: [HS('Phiếu tiếp nhận yêu cầu', 'P. CSKH', '24 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Nhật ký chăm sóc khách hàng', 'P. CSKH', '12 tháng', 'Bản mềm')],
    lanes: [['Khách hàng', 'Khách hàng', '#64748b'], ['CSKH', 'NV CSKH', '#8b5cf6'], ['Kỹ thuật', 'KTV', '#0891b2'], ['Quản lý', 'Trưởng phòng CSKH', '#2563eb']],
  },
  BH: {
    mucDich: 'Quy định trình tự tiếp nhận và xử lý phiếu bảo hành, bảo đảm khách hàng được phục vụ đúng cam kết và chi phí bảo hành được kiểm soát.',
    phamVi: 'Áp dụng cho toàn bộ sản phẩm còn trong thời hạn bảo hành do công ty cung cấp.',
    vienDan: [...VIEN_DAN_CHUNG, 'Chính sách bảo hành sản phẩm hiện hành của công ty'],
    dinhNghia: [DN('KTV', 'Kỹ thuật viên'), DN('BH', 'Bảo hành'), DN('CS', 'Phiếu chăm sóc / bảo hành trên hệ thống')],
    hoSoLuu: [HS('Phiếu bảo hành', 'P. Bảo hành', '36 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Biên bản nghiệm thu tại nhà khách', 'P. Bảo hành', '24 tháng', 'Bản cứng có chữ ký khách hàng')],
    lanes: [['Khách hàng', 'Khách hàng', '#64748b'], ['CSKH', 'NV CSKH', '#8b5cf6'], ['Bảo hành', 'NV Bảo hành', '#ef4444'], ['Kỹ thuật', 'KTV', '#0891b2'], ['Kế toán', 'NV Kế toán', '#2563eb']],
  },
  HC: {
    mucDich: 'Quy định trình tự và trách nhiệm trong công tác nhân sự – hành chính, bảo đảm hồ sơ đầy đủ và đúng quy định pháp luật.',
    phamVi: 'Áp dụng cho toàn bộ cán bộ công nhân viên của công ty.',
    vienDan: [...VIEN_DAN_CHUNG, 'Bộ luật Lao động hiện hành', 'Nội quy lao động của công ty'],
    dinhNghia: [DN('CBCNV', 'Cán bộ công nhân viên'), DN('HĐLĐ', 'Hợp đồng lao động'), DN('BHXH', 'Bảo hiểm xã hội')],
    hoSoLuu: [HS('Hồ sơ nhân sự', 'P. HC-NS', 'Suốt thời gian làm việc + 12 tháng', 'Bản cứng lưu tủ hồ sơ'), HS('Bảng chấm công', 'P. HC-NS', '24 tháng', 'Bản mềm trên phần mềm QLSX')],
    lanes: [['CBCNV', 'Người lao động', '#64748b'], ['HC-NS', 'NV Hành chính', '#8b5cf6'], ['Quản lý trực tiếp', 'Trưởng bộ phận', '#2563eb'], ['Ban Giám đốc', 'Giám đốc', '#0f172a']],
  },
};

const RONG = { mucDich: '', phamVi: '', vienDan: [], dinhNghia: [], hoSoLuu: [] };

/** Mục 1–4 và 7 của tài liệu ISO, điền sẵn theo nhóm bộ phận. Trả BẢN SAO. */
export function mauTaiLieu(nhom) {
  const m = MAU[nhom];
  if (!m) return structuredClone(RONG);
  return structuredClone({
    mucDich: m.mucDich, phamVi: m.phamVi,
    vienDan: m.vienDan, dinhNghia: m.dinhNghia, hoSoLuu: m.hoSoLuu,
  });
}

/** Sơ đồ khởi tạo: cột + hàng sẵn, khối Bắt đầu → Kết thúc đã nối. Trả BẢN SAO.
 *
 *  ĐÃ THẲNG LƯỚI ngay từ đầu — chiều cao giai đoạn là bội số CAO_HANG, hai khối
 *  đậu đúng tâm ô. Quy trình mới vì thế không bao giờ phải bấm "Tự xếp lại" mới
 *  ngay hàng, và mọi bước thêm sau đó cũng rơi đúng lưới. */
export function mauSoDo(nhom) {
  const m = MAU[nhom] || MAU.SX;
  const lanes = m.lanes.map(([name, owner, color]) => ({ name, owner, color }));
  const phases = [                                    // 1 + 3 + 2 = 6 hàng
    { name: 'Tiếp nhận', h: 1 * CAO_HANG },
    { name: 'Thực hiện', h: 3 * CAO_HANG },
    { name: 'Hoàn tất',  h: 2 * CAO_HANG },
  ];
  const S = LOAI_KHOI.start, E = LOAI_KHOI.end;
  return structuredClone({
    lanes, phases,
    nodes: [
      { id: 'n_start', t: 'start', lane: 0, y: yTaiHang(0, S.h), dx: 0, w: S.w, h: S.h, tx: 'Bắt đầu',  desc: '', form: '—', time: '—', color: null },
      { id: 'n_end',   t: 'end',   lane: 0, y: yTaiHang(5, E.h), dx: 0, w: E.w, h: E.h, tx: 'Kết thúc', desc: '', form: '—', time: '—', color: null },
    ],
    edges: [{ id: 'e_se', a: 'n_start', b: 'n_end', lbl: '', k: 'n' }],
  });
}

/** 'QT-<nhóm>-<số>' lớn hơn số lớn nhất đang có trong nhóm. KHÔNG lấp lỗ hổng —
 *  mã đã cấp cho một quy trình bị xoá thì không dùng lại, tránh trùng trong hồ sơ giấy.
 *  Nhóm phải nằm trong NHOM: thà ném lỗi còn hơn ghi 'QT-undefined-01' vào sổ. */
export function maSoTiepTheo(nhom, maDaCo = []) {
  const ma = String(nhom ?? '').trim().toUpperCase();
  if (!NHOM.some(n => n.ma === ma))
    throw new Error('Nhóm bộ phận không hợp lệ khi sinh mã số: ' + nhom);
  const re = new RegExp(`^QT-${ma}-(\\d+)$`);
  let max = 0;
  for (const x of (maDaCo || [])) {          // truy vấn Supabase lỗi trả null, không phải undefined
    const m = re.exec(String(x ?? '').trim().toUpperCase());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `QT-${ma}-${String(max + 1).padStart(2, '0')}`;
}
