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
  const color = {};
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
