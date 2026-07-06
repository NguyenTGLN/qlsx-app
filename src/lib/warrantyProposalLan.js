// Data-model cho "đề xuất bảo hành nhiều lần" — cột các_lần_đề_xuất trên xu_ly_phieu_bao_hanh.
// Mỗi lần: { lần, thời_điểm_tạo, người_tạo, đã_hủy, dữ_liệu: <object từ mapRowToProposal> }.
import { mapRowToProposal } from './warrantyProposalMap';

// Danh sách lần đề xuất hiệu lực của 1 phiếu (đảm bảo mỗi lần có số 'lần'). Không có → [].
export function getEffectiveProposalLan(row) {
  const arr = Array.isArray(row && row['các_lần_đề_xuất']) ? row['các_lần_đề_xuất'] : [];
  return arr.map((l, i) => ({ ...l, 'lần': l['lần'] || i + 1 }));
}

// Số lần kế tiếp = max(lần)+1 (rỗng → 1).
export function nextProposalLanNo(lans) {
  return (Array.isArray(lans) ? lans : []).reduce((m, l) => Math.max(m, l['lần'] || 0), 0) + 1;
}

// Dựng 1 lần MỚI (chưa gán số 'lần' — caller gán bằng nextProposalLanNo): snapshot nội dung phiếu.
export function buildProposalSnapshot(row, currentUser, now = new Date()) {
  const operator = currentUser ? (currentUser.name || currentUser.id || '') : '';
  return {
    'thời_điểm_tạo': now.toISOString(),
    'người_tạo': String(operator || ''),
    'đã_hủy': false,
    'dữ_liệu': mapRowToProposal(row, currentUser, now),
  };
}
