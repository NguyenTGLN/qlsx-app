// Trải phẳng danh sách đơn hàng nhập tay (nhóm) thành mảng item cho luồng tính toán,
// đồng thời kiểm tra hợp lệ. Trả về { items, error } — error là chuỗi (đã kèm số thứ tự) hoặc null.
export function parseManualOrders(orders) {
  const items = [];
  const list = Array.isArray(orders) ? orders : [];
  for (let oIdx = 0; oIdx < list.length; oIdx++) {
    const order = list[oIdx] || {};
    const orderCode = String(order.orderCode || '').trim();
    const products = Array.isArray(order.products) ? order.products : [];
    for (let pIdx = 0; pIdx < products.length; pIdx++) {
      const p = products[pIdx] || {};
      const code = String(p.code || '').trim();
      const qtyStr = String(p.qty ?? '').trim();
      // Ô sản phẩm trống hoàn toàn — bỏ qua
      if (!code && !qtyStr) continue;
      if (!orderCode) return { items: [], error: `Đơn hàng ${oIdx + 1}: thiếu Mã đơn hàng.` };
      if (!code) return { items: [], error: `Đơn hàng ${oIdx + 1} — Sản phẩm ${pIdx + 1}: thiếu Mã sản phẩm.` };
      const qty = Number(p.qty);
      if (isNaN(qty) || qty <= 0) return { items: [], error: `Đơn hàng ${oIdx + 1} — Sản phẩm ${pIdx + 1}: Số lượng phải lớn hơn 0.` };
      items.push({
        orderCode,
        productCode: code,
        productName: p.name || '',
        qty,
        unit: String(p.unit || '').trim(),
      });
    }
  }
  if (items.length === 0) {
    return { items: [], error: 'Vui lòng nhập ít nhất 1 đơn hàng có Mã đơn, Mã sản phẩm và Số lượng hợp lệ!' };
  }
  return { items, error: null };
}
