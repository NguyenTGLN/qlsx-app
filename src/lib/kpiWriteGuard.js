// Kiểm một lệnh GHI KPI (update/delete/insert) có thật sự chạm được vào dòng nào không.
//
// Vì sao cần: PostgREST KHÔNG coi "RLS lọc hết dòng" là lỗi. Một UPDATE/DELETE mà policy
// `USING` loại sạch dòng sẽ trả HTTP 204 với `error === null` và 0 dòng — y hệt một lệnh
// thành công. Chỉ kiểm `if (error)` là thất bại IM LẶNG:
//   người không phải ADMIN gõ điểm chốt 3 → bấm Lưu → form đóng êm → reload thấy vẫn 10.
//   Họ tin là đã chốt. Cuối tháng bảng lương lấy con số cũ.
//
// Cách dùng: gắn `.select()` vào cuối chuỗi query để PostgREST trả về mảng dòng đã ghi,
// rồi đưa cả `error` lẫn `data` vào đây.
//
//   const { data, error } = await supabase.from('kpi_chi_tieu')
//     .update(ban).eq('id', id).select();
//   const loi = loiGhiKpi(error, data);
//   if (loi) { setLoi(loi); return; }
//
// Trả null nếu ghi được, hoặc chuỗi thông báo tiếng Việt để hiện inline cho người dùng.
export function loiGhiKpi(error, data) {
  // Lỗi thật (mất mạng, vi phạm ràng buộc, insert bị RLS chặn -> 42501) báo trước:
  // thông báo của server cụ thể hơn suy đoán về quyền.
  if (error) return 'Lỗi lưu: ' + (error.message || String(error));
  if (!Array.isArray(data) || data.length === 0) {
    return 'Không lưu được — tài khoản của bạn không có quyền ghi KPI (chỉ Admin). '
      + 'Dữ liệu chưa thay đổi.';
  }
  return null;
}
