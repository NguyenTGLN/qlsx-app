// Xếp "việc đang làm của tôi" cho Bảng tin cá nhân (/ca-nhan).
// Hàm THUẦN, không chạm mạng — mọi luật xếp việc chỉ viết ở đây để test được.

import { memberIds } from './taskAssignees';

export const NHOM = {
  QUA_HAN: 'qua_han',
  SAP_HAN: 'sap_han',
  CON_LAI: 'con_lai',
};

// "Sắp đến hạn" = còn dưới 3 ngày. Đủ dài để làm kịp, đủ ngắn để không nhuộm cam cả bảng.
const SAP_HAN_MS = 3 * 24 * 3600 * 1000;

const THU_TU_NHOM = { [NHOM.QUA_HAN]: 0, [NHOM.SAP_HAN]: 1, [NHOM.CON_LAI]: 2 };

// Trả mốc thời gian, hoặc null nếu không có hạn / hạn là chuỗi rác.
// Chuỗi rác PHẢI ra null chứ không phải NaN: NaN so sánh nào cũng false nên việc đó sẽ
// lẳng lặng rơi vào nhóm "còn lại" — đúng chỗ ta muốn, nhưng chỉ khi có ý; để NaN chảy
// vào phần sắp xếp thì thứ tự trong nhóm thành ngẫu nhiên.
function hanCua(t) {
  if (!t?.due_date) return null;
  const ms = new Date(t.due_date).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function nhomCua(han, bayGio) {
  if (han == null) return NHOM.CON_LAI;
  if (han <= bayGio) return NHOM.QUA_HAN;
  return han - bayGio < SAP_HAN_MS ? NHOM.SAP_HAN : NHOM.CON_LAI;
}

/**
 * @param {Array} tasks   toàn bộ việc đã tải
 * @param {string} meId   id nhân viên đang đăng nhập
 * @param {number} bayGio mốc "hiện tại" (ms) — truyền vào để test được
 * @returns {Array} việc đang làm của người đó, mỗi phần tử thêm { nhom, han }
 */
export function xepViecDangLam(tasks, meId, bayGio = Date.now()) {
  // Không có id thì trả rỗng. Nếu bỏ qua bước này, `memberIds(t).includes(undefined)`
  // vẫn là false nên may mà không lộ việc — nhưng đừng dựa vào may: chặn thẳng ở đây.
  if (!meId || !Array.isArray(tasks)) return [];

  return tasks
    // Chỉ IN_PROGRESS. Không suy ra bằng "khác COMPLETED": trạng thái lạ trong DB sẽ
    // lọt lên màn hình đầu tiên của nhân viên dưới danh nghĩa việc đang làm.
    .filter(t => t?.status === 'IN_PROGRESS' && memberIds(t).includes(meId))
    .map(t => {
      const han = hanCua(t);
      return { ...t, han, nhom: nhomCua(han, bayGio) };
    })
    .sort((a, b) => {
      const d = THU_TU_NHOM[a.nhom] - THU_TU_NHOM[b.nhom];
      if (d !== 0) return d;
      // Trong cùng nhóm: hạn gần trước. Việc không hạn xuống cuối — nó không gấp,
      // và xếp nó lẫn vào giữa các việc có hạn thì danh sách đọc không ra quy luật.
      if (a.han == null && b.han == null) return 0;
      if (a.han == null) return 1;
      if (b.han == null) return -1;
      return a.han - b.han;
    });
}
