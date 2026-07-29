// Engine tính nhu cầu mua linh kiện. Hàm THUẦN — không import Supabase, không I/O.
// Phần gọi DB nằm ở giai đoạn 2. Xem spec:
//   docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

const num = (v) => Number(v) || 0;

// Tồn an toàn = TB bán/ngày × (lead_time × 2 + thời gian an toàn).
// Hệ số lead nhân 2 để phòng nhà cung cấp giao chậm gấp đôi cam kết.
export function computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays } = {}) {
  const avgDaily = num(totalSales90d) / 90;
  const days = num(leadTimeDays) * 2 + num(backupStockDays);
  return Math.round(avgDaily * days);
}

// Cần bổ sung = tồn an toàn − tồn hiện tại (không âm).
export function computeReplenishQty({ totalSales90d, leadTimeDays, backupStockDays, totalQuantity } = {}) {
  const safety = computeSafetyStock({ totalSales90d, leadTimeDays, backupStockDays });
  return Math.max(0, safety - num(totalQuantity));
}
