// Tách 1 ô gộp tồn kho thành các dòng inventory_picking_logs — mỗi khối nguồn 1 dòng.
//
// Tồn kho BUỘC phải gộp theo (mã hàng, vị trí), nếu không các lệnh update sẽ ghi đè nhau
// thay vì cộng dồn. Nhưng trước đây dòng log cũng gộp theo đúng khóa đó, nên 2-3 mã đơn
// cùng trả một mã hàng về một vị trí bị dính thành 1 dòng với ma_don_hang = "DH1, DH2".
// Phiếu in trước khi lưu ra 3 dòng, in lại từ Quản Lý Chứng Từ ra 1 dòng.
//
// Ở đây giữ nguyên việc gộp tồn kho, chỉ tách phần GHI LOG theo từng khối nguồn —
// đúng cơ chế mà "Nhập thành phẩm" vốn đã dùng để giữ wip_source riêng cho từng phiếu SX.
// quantity_before/after nối tiếp nhau nên tổng vẫn khớp với số tồn thực tế.

// entry: { code, name, location, current_qty, sumImport, byBlock: { k: { source, orderCode, qty } } }
// ctx:   { orderCode, reason, userStr, wipDeducted: Set<'mã hàng||PSX'> }
export function splitAggIntoLogRows(entry, ctx) {
  const { orderCode, reason, userStr, wipDeducted } = ctx;

  // Thiếu breakdown (dữ liệu cũ/bất thường) → không được làm mất số lượng: gộp về 1 dòng.
  const parts = entry.byBlock && Object.keys(entry.byBlock).length > 0
    ? Object.values(entry.byBlock)
    : [{ source: '', orderCode: '', qty: entry.sumImport }];

  const rows = [];
  let running = Number(entry.current_qty) || 0;
  for (const p of parts) {
    const qty = Number(p.qty) || 0;
    const isWip = reason === 'Nhập thành phẩm'
      && p.source && p.source.startsWith('PSX-')
      && wipDeducted && wipDeducted.has(entry.code + '||' + p.source);
    rows.push({
      order_code: orderCode,
      product_code: 'NHAP_KHO',
      component_code: entry.code,
      component_name: entry.name,
      location: entry.location,
      quantity_before: running,
      quantity_taken: qty,
      quantity_after: running + qty,
      created_by: userStr,
      notes: p.source ? `${reason} - ${p.source}` : reason,
      ma_don_hang: p.orderCode || null,
      wip_source: isWip ? p.source : null,
    });
    running += qty;
  }
  return rows;
}
