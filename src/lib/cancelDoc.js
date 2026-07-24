// ============================================================
// HỦY PHIẾU — wrapper gọi RPC huy_phieu (đảo ngược chứng từ nguyên tử).
// Toàn bộ nghiệp vụ (đảo tồn, chặn âm kho, WIP, lệnh SX, thống kê) nằm
// trong hàm Postgres — xem sql/create_huy_phieu.sql. Ở đây chỉ gọi + dịch lỗi.
// ============================================================
import { supabase as db } from './supabase';

export async function cancelPhieu(orderCode, user, reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('Vui lòng nhập lý do hủy phiếu.');
  }
  const { data, error } = await db.rpc('huy_phieu', {
    p_order_code: orderCode,
    p_user: user || null,
    p_reason: String(reason).trim(),
  });
  if (error) {
    // Hàm chưa tồn tại (chưa chạy SQL) → hướng dẫn rõ thay vì lỗi khó hiểu
    const msg = String(error.message || '');
    if (error.code === 'PGRST202' || /could not find the function/i.test(msg)) {
      throw new Error('Chức năng Hủy Phiếu chưa được kích hoạt trên máy chủ — cần chạy sql/create_huy_phieu.sql trong Supabase SQL Editor.');
    }
    // Hàm có rồi nhưng CHƯA có nhánh PCV (chưa chạy file SQL bổ sung)
    if (/Loại phiếu .* không hỗ trợ hủy/i.test(msg) && String(orderCode || '').startsWith('PCV')) {
      throw new Error('Hủy phiếu chuyển vị trí chưa được kích hoạt trên máy chủ — cần chạy sql/them_phieu_chuyen_sx.sql trong Supabase SQL Editor.');
    }
    throw new Error(msg);
  }
  return data; // { ok, order_code, reversed_lines }
}
