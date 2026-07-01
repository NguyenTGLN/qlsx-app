// Hàm thuần cho đề xuất mua: trần nhập, phần thiếu, phân loại dòng, dựng dòng lưu trữ/phần thiếu.
// Không import DB — để unit-test dễ. Orchestration DB nằm ở dksxEngine.closeProposalWithShortfall.

const num = (v) => Number(v) || 0;

// Trần nhập kho = SL đặt − đã nhận (không âm).
export function computeCap(actualQty, received) {
  return Math.max(0, num(actualQty) - num(received));
}

// Phần thiếu so với đề xuất = SL đề xuất − đã nhận (không âm).
export function computeShortfall(calculatedQty, received) {
  return Math.max(0, num(calculatedQty) - num(received));
}

// Phân loại dòng purchase_proposals cho recomputeProposals:
//  - Hủy: bỏ qua
//  - source='shortfall': "ghim" — cộng vào committed, KHÔNG vào openByCode (engine không đụng)
//  - 'Mới' thường: openByCode (engine sở hữu, có thể cập nhật/xóa)
//  - còn lại (đã đặt...): committed
export function classifyProposalRows(rows) {
  const committed = {};
  const openByCode = {};
  (rows || []).forEach((r) => {
    if (r.trang_thai === 'Hủy') return;
    if (r.source === 'shortfall') {
      committed[r.item_code] = (committed[r.item_code] || 0) + num(r.actual_qty);
      return;
    }
    if (r.trang_thai === 'Mới') openByCode[r.item_code] = r;
    else committed[r.item_code] = (committed[r.item_code] || 0) + num(r.actual_qty);
  });
  return { committed, openByCode };
}

// Dòng purchase_proposals mới cho phần thiếu (đề xuất mới), nhãn source='shortfall' để engine ghim.
export function buildShortfallProposalRow({ orig, received, dlkCode, today }) {
  const shortfall = computeShortfall(orig.calculated_qty, received);
  return {
    dlk_code: dlkCode,
    item_code: orig.item_code,
    item_name: orig.item_name || '',
    unit: orig.unit || '',
    bom_qty: shortfall,
    retail_qty: 0,
    calculated_qty: shortfall,
    actual_qty: shortfall,
    ngay_de_xuat: today,
    tien_do: 'Mới',
    trang_thai: 'Mới',
    source: 'shortfall',
    note: `Tách từ ${orig.dlk_code} do về thiếu (đã nhận ${num(received)}/${num(orig.calculated_qty)})`,
  };
}

// Dòng bản ghi lưu trữ từ dòng gốc + snapshot đã nhận + metadata.
export function buildArchiveRow({ orig, received, archivedBy, shortfallDlkCode, archiveReason }) {
  return {
    orig_id: orig.id,
    item_code: orig.item_code,
    item_name: orig.item_name || '',
    unit: orig.unit || '',
    dlk_code: orig.dlk_code,
    calculated_qty: orig.calculated_qty,
    actual_qty: orig.actual_qty,
    bom_qty: orig.bom_qty,
    retail_qty: orig.retail_qty,
    received_snapshot: num(received),
    tien_do: orig.tien_do,
    trang_thai: orig.trang_thai,
    source: orig.source,
    note: orig.note,
    ngay_de_xuat: orig.ngay_de_xuat,
    ngay_du_kien: orig.ngay_du_kien,
    batch_id: orig.batch_id,
    created_at: orig.created_at,
    archived_by: archivedBy || '',
    archive_reason: archiveReason || 'Đóng do về thiếu',
    shortfall_dlk_code: shortfallDlkCode || null,
  };
}
