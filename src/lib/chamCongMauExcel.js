// Sinh dữ liệu MẪU cho màn Nạp chấm công (NapChamCong.jsx) — y khuôn tệp máy chấm công xuất
// ra, để người dùng tải về đối chiếu thứ tự cột trước khi nạp. Sinh bằng CODE thay vì để sẵn
// một tệp .xlsx tĩnh trong repo: tệp tĩnh không ai kiểm được là còn khớp docDongChamCong() hay
// không sau mỗi lần sửa chamCongExcel.js — phải mở Excel lên đối chiếu tay mới phát hiện lệch.
// Cách này thì mẫu và bộ đọc luôn chạy CHUNG một bộ test (xem chamCongMauExcel.test.js): mẫu
// trôi khỏi bộ đọc là test đỏ ngay lúc sửa, không phải đợi người dùng report.

export const TEN_SHEET_MAU = 'CHI TIẾT THEO NGÀY';
export const TEN_TEP_MAU = 'mau-cham-cong.xlsx';

// Trả về mảng-của-mảng (AOA) để dựng sheet bằng XLSX.utils.aoa_to_sheet. docDongChamCong tìm
// dòng tiêu đề bằng cách dò cột A = 'Tên nhân viên' (không đếm cứng số dòng — xem `hdr` trong
// chamCongExcel.js), nên 3 dòng ghi chú phía trên muốn viết gì cũng được, miễn dòng thứ 4 đúng
// tên cột. 5 dòng ví dụ phủ các trường hợp hay gặp: tăng ca, đi muộn, về sớm, nghỉ nửa buổi
// sáng, nghỉ cả ngày.
//
// Dòng "nghỉ cả ngày" (Trần Thị B) CỐ Ý mang ngày 04/08 chứ KHÔNG PHẢI 06/08 — dù 06/08 mới là
// ngày nghe hợp lý hơn vì nó đứng cuối mảng. Lý do: dòng nghỉ cả ngày để trống CẢ BA cột giờ
// (in sáng/in chiều/out), nên coGioLam() ở chamCongExcel.js coi ngày đó là "không ai đi làm".
// suyRaKyVaNgayCat() lấy NGÀY CẮT (denNgay) là ngày CUỐI CÙNG có người đi làm THẬT — không tính
// những ngày chỉ toàn dòng nghỉ. Nếu để dòng nghỉ cả ngày ở 06/08 (ngày lớn nhất trong mẫu, và
// không dòng nào khác cùng ngày có giờ làm) thì denNgay dừng lại ở 05/08, còn dòng 06/08 bị
// tính là "sau ngày cắt" — docDongChamCong ÂM THẦM BỎ dòng đó (cộng vào boQuaNgaySau, không
// đẩy vào `dong`). Mẫu khi đó chỉ đọc ra 4 dòng thay vì 5, hỏng đúng ca tự kiểm quan trọng nhất
// (xem test 'file mẫu phải ĐỌC ĐƯỢC...'). Gán ngày 04/08 — trùng ngày với dòng "đi muộn" của
// Nguyễn Văn A nhưng khác người nên không đụng nhau — để dòng nghỉ nằm TRONG khoảng ngày cắt.
// Đây là hành vi thật của bộ đọc với một tệp xuất giữa tháng (đúng ý thiết kế của nó — xem
// suyRaKyVaNgayCat), không phải lỗi của mẫu, nên sửa NGÀY của dòng ví dụ ở đây, không đụng
// chamCongExcel.js.
export function dongMauChamCong() {
  return [
    ['CÔNG TY TNHH EUROMADE VIỆT NAM'],
    ['THỐNG KÊ CHẤM CÔNG THÁNG 8/2026 (CHI TIẾT THEO NGÀY)'],
    ['Tăng ca: ngày thường sau 17:30 · thứ 7 tuần chẵn (04/07, 18/07) từ 13:30 · Chủ nhật từ 08:00 (trừ nghỉ trưa 12:00–13:30)'],
    [
      'Tên nhân viên', 'Ngày', 'Thứ', 'Giờ in sáng', 'Giờ in chiều',
      'Giờ out (gồm tăng ca)', 'Tăng ca', 'Đi muộn (phút)', 'Về sớm (phút)', 'Nghỉ',
    ],
    // Ngày thường có tăng ca (2:15 = 135 phút).
    ['Nguyễn Văn A', '03/08/2026', 'T2', '07:54', '13:27', '19:45', '2:15', '', '', ''],
    // Đi muộn 6 phút.
    ['Nguyễn Văn A', '04/08/2026', 'T3', '08:06', '13:24', '17:30', '', '6', '', ''],
    // Về sớm 15 phút.
    ['Nguyễn Văn A', '05/08/2026', 'T4', '07:58', '13:25', '17:15', '', '', '15', ''],
    // Nghỉ nửa buổi sáng — vẫn có giờ vào/ra buổi chiều nên vẫn là "ngày làm việc thật".
    ['Trần Thị B', '05/08/2026', 'T4', '', '13:28', '17:30', '', '', '', 'Nghỉ sáng'],
    // Nghỉ cả ngày — ngày 04/08 (không phải 06/08), lý do xem chú thích hàm ở trên.
    ['Trần Thị B', '04/08/2026', 'T3', '', '', '', '', '', '', 'Nghỉ'],
  ];
}
