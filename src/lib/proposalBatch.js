// Đọc-ghi Supabase cho ĐỢT đề xuất linh kiện. Phần tính toán thuần nằm ở mrp.js.
// Xem spec: docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

// Mã đợt: DX-DDMMYY-NN. Đổi '2026-07-29' → '290726'.
function dateTag(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y.slice(-2)}`;
}

// Số kế tiếp trong ngày. KHÔNG lấp lỗ hổng: luôn lớn hơn số lớn nhất đang có, để một
// mã đợt đã dùng không bao giờ bị gán lại cho đợt khác — nếu không, hai đợt khác nhau
// trong cùng ngày có thể mang cùng mã sau khi một đợt bị huỷ.
export function nextBatchCode(existingCodes, isoDate) {
  const prefix = `DX-${dateTag(isoDate)}-`;
  const max = (existingCodes || []).reduce((m, c) => {
    if (typeof c !== 'string' || !c.startsWith(prefix)) return m;
    const n = parseInt(c.slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

const num = (v) => Number(v) || 0;

// Nắn dữ liệu thô từ CSDL thành đầu vào cho buildProposalLines. HÀM THUẦN — tách
// riêng khỏi phần đọc CSDL để test được mà không cần giả lập Supabase.
//
// GỐC LÀ sales (bán 90 ngày), KHÔNG phải bảng tồn kho: theo quy trình, mã nào tồn về 0
// thì bị xoá dòng khỏi tồn sổ sách/vị trí/hàng hoá cho gọn bảng. Đi từ bảng tồn kho thì
// đúng những mã đã bán sạch — thứ cần đặt gấp nhất — lại biến mất. Đo 29/07/2026: 19 mã
// có bán 90 ngày không còn dòng tồn nào, nặng nhất FK-RO50 bán 165 cái/90 ngày.
export function shapeEngineInputs({
  sales = [], catalog = [], bomRows = [], stockRows = [], openProposals = [], nhapRows = [],
} = {}) {
  const dict = {};
  catalog.forEach((c) => { dict[c.item_code] = c; });

  const moTa = (code, banRa) => ({
    item_code: code,
    item_name: dict[code]?.item_name || '',
    unit: dict[code]?.unit || '',
    total_sales_90d: banRa,
    lead_time_days: num(dict[code]?.lead_time_days),
    backup_stock_days: num(dict[code]?.backup_stock_days),
  });

  const items = [];
  const daCo = new Set();
  sales.forEach((s) => {
    if (num(s.total_sales) <= 0 || daCo.has(s.ma_san_pham)) return;
    daCo.add(s.ma_san_pham);
    items.push(moTa(s.ma_san_pham, num(s.total_sales)));
  });

  // Linh kiện chỉ nằm trong BOM, không bán — vẫn phải có mặt để lấy tên và đơn vị tính
  // khi nó lọt vào danh sách mua. total_sales_90d = 0 nên không thành nhu cầu gốc.
  const bomMap = {};
  bomRows.forEach((b) => {
    (bomMap[b.product_code] ||= []).push({ component: b.component_code, qty: num(b.quantity) || 1 });
    if (!daCo.has(b.component_code)) {
      daCo.add(b.component_code);
      items.push(moTa(b.component_code, 0));
    }
  });

  // Mã không có dòng tồn nào ⇒ vắng mặt khỏi stockMap ⇒ engine hiểu là 0.
  const stockMap = {};
  stockRows.forEach((r) => {
    stockMap[r.item_code] = (stockMap[r.item_code] || 0) + num(r.quantity);
  });

  // Hàng đang về = Σ(SL đặt − đã nhập) của dòng CHO_HANG ở đợt trước, không âm.
  const daNhap = {};
  nhapRows.forEach((n) => {
    if (n.dlk_code) daNhap[n.dlk_code] = (daNhap[n.dlk_code] || 0) + num(n.so_luong_nhap);
  });
  const onOrderMap = {};
  openProposals.forEach((p) => {
    if (p.trang_thai !== 'CHO_HANG') return;
    const conLai = Math.max(0, num(p.actual_qty) - (daNhap[p.dlk_code] || 0));
    if (conLai > 0) onOrderMap[p.item_code] = (onOrderMap[p.item_code] || 0) + conLai;
  });

  return { items, bomMap, stockMap, onOrderMap };
}
