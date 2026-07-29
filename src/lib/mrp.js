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
