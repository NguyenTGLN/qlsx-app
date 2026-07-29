// Engine tính nhu cầu mua linh kiện. Hàm THUẦN — không import Supabase, không I/O.
// Phần gọi DB nằm ở giai đoạn 2. Xem spec:
//   docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

// LƯU Ý: StockSummaryTab.jsx:94 hiện vẫn dùng công thức CŨ (lead + an toàn × 2)
// cho cột "Tồn An Toàn" ở tab Tồn HH. Hai công thức cùng tồn tại tới giai đoạn 3.
// Ai sửa chỗ này nhớ ngó cả bên đó, kẻo "chữa" nhầm bên đúng.

const SALES_WINDOW_DAYS = 90;

const num = (v) => Number(v) || 0;

// Tồn an toàn = TB bán/ngày × (lead_time × 2 + thời gian an toàn).
// Hệ số lead nhân 2 để phòng nhà cung cấp giao chậm gấp đôi cam kết.
//
// Ô nhập ở AddCatalogItemModal.jsx:71 không chặn số âm, nên lead_time hay thời gian
// an toàn bị gõ nhầm dấu là chuyện có thật. Kẹp TỪNG Ô một, KHÔNG kẹp trên tổng:
// kẹp tổng thì một ô âm sẽ ăn mất ô kia — lead −5 cạnh an toàn 30 cho ra 20 ngày
// thay vì 30, sai một nửa mà không âm, không kẹp, không ai thấy.
// Phần réo lên do buildProposalLines lo (Task 4): ô nào âm là vào missingParams.
export function computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays } = {}) {
  const avgDaily = Math.max(0, num(totalSales90d)) / SALES_WINDOW_DAYS;
  const days = Math.max(0, num(leadTimeDays)) * 2 + Math.max(0, num(backupStockDays));
  return Math.round(avgDaily * days);
}

// Cần bổ sung = tồn an toàn − tồn hiện tại (không âm).
export function computeReplenishQty({ totalSales90d, leadTimeDays, backupStockDays, totalQuantity } = {}) {
  const safety = computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays });
  return Math.max(0, safety - num(totalQuantity));
}

// Lỗi dữ liệu BOM có vòng lặp. Giữ nguyên mảng `cycle` để giao diện chỉ đúng chỗ hỏng.
// Hàm explodeBom cũ ÂM THẦM bỏ qua vòng lặp — chính kiểu che giấu đó khiến 3 dòng BOM
// khai ngược chiều sống được 2 tháng mà không ai biết. Ở đây phải nổ ra.
export class BomCycleError extends Error {
  constructor(cycle) {
    super(`BOM có vòng lặp: ${cycle.join(' → ')}`);
    this.name = 'BomCycleError';
    this.cycle = cycle;
  }
}

// Xếp mọi mã trong bomMap theo thứ tự cha trước con.
// bomMap dạng { [product_code]: [{ component, qty }] } — giống loadBomMap().
export function topoSort(bomMap = {}) {
  const nodes = new Set();
  Object.keys(bomMap).forEach((p) => {
    nodes.add(p);
    (bomMap[p] || []).forEach((c) => nodes.add(c.component));
  });

  const WHITE = 0, GRAY = 1, BLACK = 2;
  // Object.create(null) chứ không phải {}: mã hàng tên '__proto__' gán vào object
  // thường sẽ không tạo thuộc tính riêng, màu không bám, node bị duyệt nhiều lần
  // và thứ tự cha-con vỡ. Không xảy ra với danh mục hiện tại, nhưng đây là nền
  // của cả engine nên không đáng để hở.
  const color = Object.create(null);
  nodes.forEach((n) => { color[n] = WHITE; });

  const order = [];   // gom theo hậu thứ tự: con trước, cha sau
  const path = [];    // nhánh đang duyệt, để dựng lại vòng lặp khi gặp

  function visit(n) {
    if (color[n] === BLACK) return;
    if (color[n] === GRAY) {
      throw new BomCycleError(path.slice(path.indexOf(n)).concat(n));
    }
    color[n] = GRAY;
    path.push(n);
    (bomMap[n] || []).forEach((c) => visit(c.component));
    path.pop();
    color[n] = BLACK;
    order.push(n);
  }

  nodes.forEach((n) => visit(n));
  return order.reverse();   // đảo lại thành cha trước con
}

// Làm tròn 3 số lẻ — khớp cách dksxEngine đang làm, tránh sai số dấu phẩy động
// khi định mức BOM là số lẻ (ví dụ 0.6 mét dây/máy).
const round3 = (v) => Math.round(v * 1000) / 1000;

// Nổ BOM có trừ tồn ở TỪNG CẤP.
//   demand     { [mã thành phẩm]: cần bổ sung }
//   bomMap     { [mã cha]: [{ component, qty }] }
//   stockMap   { [mã]: tồn kho }            — gồm cả vị trí WIP SX9-
//   onOrderMap { [mã]: đang về }            — Σ(SL đặt − đã nhập) của dòng CHO_HANG đợt trước
//
// Trả { gross, net, buy }:
//   gross = tổng nhu cầu trước khi trừ   → lưu vào snapshot_gross
//   net   = sau khi trừ tồn và hàng đang về
//   buy   = phần net > 0 của những mã KHÔNG có BOM (mã có BOM thì tự sản xuất)
//
// Duyệt theo thứ tự tô-pô nên khi tới lượt một mã thì nhu cầu từ MỌI cha đã cộng đủ
// vào gross — nhờ vậy tồn kho chỉ bị tiêu đúng một lần.
export function explodeNetted({ demand = {}, bomMap = {}, stockMap = {}, onOrderMap = {} } = {}) {
  const order = topoSort(bomMap);

  const gross = {};
  Object.keys(demand).forEach((c) => {
    gross[c] = round3((gross[c] || 0) + num(demand[c]));
  });

  const net = {};
  const visited = new Set();

  order.forEach((code) => {
    visited.add(code);
    const avail = num(stockMap[code]) + num(onOrderMap[code]);
    const n = Math.max(0, round3((gross[code] || 0) - avail));
    net[code] = n;

    const bom = bomMap[code];
    if (bom && bom.length > 0 && n > 0) {
      bom.forEach((c) => {
        gross[c.component] = round3((gross[c.component] || 0) + n * num(c.qty));
      });
    }
  });

  // Mã có nhu cầu nhưng không xuất hiện ở đâu trong bomMap (không BOM, không là con của ai)
  Object.keys(gross).forEach((code) => {
    if (visited.has(code)) return;
    const avail = num(stockMap[code]) + num(onOrderMap[code]);
    net[code] = Math.max(0, round3(gross[code] - avail));
  });

  const buy = {};
  Object.keys(net).forEach((code) => {
    const isParent = bomMap[code] && bomMap[code].length > 0;
    if (!isParent && net[code] > 0.0001) buy[code] = net[code];
  });

  return { gross, net, buy };
}
