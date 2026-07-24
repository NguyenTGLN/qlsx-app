// ============================================================
// CHUYỂN SX TRƯỚC — kê nguyên liệu của phiếu SX về 1 vị trí tập kết.
// Spec: docs/superpowers/specs/2026-07-24-chuyen-sx-truoc-design.md
//
// Nghiệp vụ: thiếu linh kiện nên KHÔNG lập được lệnh SX, nhưng xưởng vẫn muốn
// sản xuất trước bằng số hàng đang có → dồn hàng của phiếu về một vị trí duy
// nhất cho chuyền lấy. Hàng KHÔNG rời kho, chỉ đổi vị trí.
//
// Module này thuần dữ liệu (không gọi DB) để test được mọi nhánh lọc.
// ============================================================

// 'YYYY-MM-DD' → 'SX4-DD/MM/YYYY'.
// Ngày sai định dạng thì NÉM LỖI thay vì tạo vị trí rác kiểu 'SX4-undefined'
// (vị trí sai phải dọn tay trong kho, tốn hơn nhiều so với chặn tại đây).
export function buildStagingLocation(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) throw new Error('Ngày phiếu không hợp lệ, không tạo được vị trí tập kết: ' + dateStr);
  const [, y, mo, d] = m;
  return `SX4-${d}/${mo}/${y}`;
}

// Quy đổi kết quả phân bổ đang hiện trên phiếu thành kế hoạch ghi kho.
// allocations: [{ code, name, unit, allocations: [{ stock_id, location, before, taken, remaining }] }]
// → {
//     moves: [{ code, name, unit, total, sources: [{ stock_id, location, before, taken, remaining }] }],
//     totalQty, totalCodes,
//     skippedCodes,  // mã không có gì để chuyển (hết hàng / chỉ có dòng tháo máy / đã nằm sẵn ở đích)
//   }
export function buildStagingMoves(allocations, destLocation) {
  if (!destLocation) throw new Error('Thiếu vị trí đích khi chuyển SX trước.');

  const moves = [];
  const skippedCodes = [];
  let totalQty = 0;

  for (const comp of (allocations || [])) {
    const sources = (comp.allocations || []).filter(a =>
      a.stock_id                        // phải có dòng tồn thật để trừ
      && Number(a.taken) > 0            // bỏ dòng tháo máy (SL âm) và dòng 0
      && a.location !== destLocation    // đã nằm sẵn ở đích → trừ rồi cộng lại chính nó là vô nghĩa
    );

    if (sources.length === 0) { skippedCodes.push(comp.code); continue; }

    const total = sources.reduce((sum, a) => sum + Number(a.taken), 0);
    totalQty += total;
    moves.push({
      code: comp.code,
      name: comp.name,
      unit: comp.unit || 'Cái',
      total,
      sources: sources.map(a => ({
        stock_id: a.stock_id,
        location: a.location,
        before: Number(a.before),
        taken: Number(a.taken),
        remaining: Number(a.remaining),
      })),
    });
  }

  return { moves, totalQty, totalCodes: moves.length, skippedCodes };
}

// Sinh các dòng chứng từ (inventory_picking_logs) cho MỘT mã trong 1 lần chuyển.
// Mỗi vị trí nguồn 1 dòng XUẤT (quantity_taken ÂM), rồi 1 dòng NHẬP tại vị trí đích
// (quantity_taken DƯƠNG, đóng dấu sau 1 giây để bản in xếp xuất trước - nhập sau).
// Bất biến bắt buộc: before + taken === after ở MỌI dòng, và khi Hủy Phiếu áp công
// thức đảo của huy_phieu (stock -= quantity_taken) thì tồn trở lại đúng như trước.
// move: 1 phần tử của buildStagingMoves().moves
// ctx: { orderCode, destLocation, destBefore, createdBy, baseTimeMs }
export function buildStagingLogs(move, { orderCode, destLocation, destBefore, createdBy, baseTimeMs }) {
  const rows = move.sources.map(src => ({
    order_code: orderCode, product_code: 'CHUYEN_SX',
    component_code: move.code, component_name: move.name,
    location: src.location,
    quantity_before: src.before, quantity_taken: -src.taken, quantity_after: src.remaining,
    created_by: createdBy, notes: `Chuyển SX trước → ${destLocation}`,
    created_at: new Date(baseTimeMs).toISOString(),
  }));
  rows.push({
    order_code: orderCode, product_code: 'CHUYEN_SX',
    component_code: move.code, component_name: move.name,
    location: destLocation,
    quantity_before: destBefore, quantity_taken: move.total, quantity_after: destBefore + move.total,
    created_by: createdBy, notes: 'Nhận hàng chuyển SX trước',
    created_at: new Date(baseTimeMs + 1000).toISOString(),
  });
  return rows;
}
