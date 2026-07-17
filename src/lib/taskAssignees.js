// Một việc giao cho nhiều nhân viên: nguồn sự thật là cột `assignee_ids` (text[]).
// Cột `assignee_id` cũ vẫn còn và luôn bằng assignee_ids[1] (trigger DB canh) — giữ cho
// màn hình TV và các query chưa đổi.
//
// Đọc nhóm PHẢI qua memberIds(). Nhánh fallback về assignee_id bảo vệ các dòng chưa được
// `sql/setup_task_multi_assignee.sql` migrate, và cửa sổ giữa lúc chạy SQL với lúc deploy
// bundle. Không được gỡ chỉ vì "chắc migrate hết rồi".

export function memberIds(task) {
  if (!task) return [];
  const raw = Array.isArray(task.assignee_ids) && task.assignee_ids.length
    ? task.assignee_ids
    : (task.assignee_id ? [task.assignee_id] : []);
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function memberUsers(task, userMap) {
  return memberIds(task).map(id => userMap.get(id)).filter(Boolean);
}

// Chuỗi gộp tên: dùng cho payload n8n (field `assignee` cũ vẫn là chuỗi nên workflow không cần
// sửa), cho màn hình TV, và cho phần "cùng: ..." trong báo cáo.
export function joinAssignees(names) {
  if (!names.length) return 'Chưa giao';
  return names.join(', ');
}

export function assigneesPayload(task, userMap) {
  return memberUsers(task, userMap).map(u => ({ id: u.id, name: u.name, email: u.email ?? null }));
}

// Cộng điểm công việc cho báo cáo. Dùng chung cho WorkReport (tab Báo cáo) và AdminDashboard —
// hai nơi phải ra CÙNG một con số, nên luật chỉ được viết ở đây.
//
// Hai bộ đếm khác nhau, đừng nhầm:
//   - `company`: mỗi việc tính MỘT lần, dù giao cho mấy người.
//   - `perStaff`: việc nhóm tính cho MỌI thành viên → tổng cộng dồn theo NV sẽ lớn hơn
//     tổng công ty. Đây là yêu cầu nghiệp vụ ("có tên trong nhóm là tính hết"), không phải lỗi.
//
// `startStr`/`endStr` dạng 'YYYY-MM-DD', so sánh theo chuỗi như code gốc.
export function tallyTasks(tasks, startStr, endStr) {
  const company = { total: 0, done: 0, onTime: 0 };
  const perStaff = new Map();
  const activeStaff = new Set();

  for (const task of tasks) {
    let isDoneInRange = false;
    if (task.status === 'COMPLETED' && task.completed_date) {
      const cd = task.completed_date.split('T')[0];
      if (cd >= startStr && cd <= endStr) isDoneInRange = true;
    }
    const isPending = task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
    if (!isDoneInRange && !isPending) continue;

    // Trễ quá 60 giây mới coi là trễ — nới cho lệch giờ giữa máy và server.
    let isLate = false;
    if (task.due_date && task.completed_date) {
      isLate = (new Date(task.completed_date).getTime() - new Date(task.due_date).getTime()) > 60000;
    }

    company.total += 1;
    if (isDoneInRange) {
      company.done += 1;
      if (!isLate) company.onTime += 1;
    }

    const ids = memberIds(task);
    for (const id of ids) {
      activeStaff.add(id);
      if (!perStaff.has(id)) perStaff.set(id, { total: 0, done: 0, onTime: 0, doneList: [] });
      const st = perStaff.get(id);
      st.total += 1;
      if (isDoneInRange) {
        st.done += 1;
        // `mates` = các thành viên KHÁC, để báo cáo ghi "cùng: Phong, Tuấn" — nhìn là hiểu vì sao
        // một việc lại được tính cho nhiều người. Trả id, phần hiển thị tự tra tên.
        st.doneList.push({ title: task.title, mates: ids.filter(x => x !== id) });
        if (!isLate) st.onTime += 1;
      }
    }
  }

  return { company, perStaff, activeStaff };
}
