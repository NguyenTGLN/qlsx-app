// Một việc giao cho nhiều nhân viên: nguồn sự thật là cột `assignee_ids` (text[]).
// Cột `assignee_id` cũ vẫn còn và luôn bằng assignee_ids[1] (trigger DB canh) — giữ cho
// màn hình TV và các query chưa đổi. Đọc nhóm phải qua memberIds(): dữ liệu trong
// dataCache của trình duyệt người dùng có thể còn là bản cũ chưa có cột mới.

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

// Nhãn ngắn cho thẻ việc / bảng việc: "Ngọc +2".
export function formatAssignees(names) {
  if (!names.length) return 'Chưa giao';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

// Chuỗi gộp gửi sang n8n — field `assignee` cũ vẫn là chuỗi nên workflow không cần sửa.
export function joinAssignees(names) {
  if (!names.length) return 'Chưa giao';
  return names.join(', ');
}

// Chia ô cho dải avatar chồng nhau. Thẻ việc chỉ rộng 44-56px và ô bảng 70px, mà avatar 'sm'
// chồng -space-x-2 ăn ~20px/ô → tối đa 3 ô. Đông hơn thì nhường 1 ô cho bong bóng "+N".
const GROUP_MAX_SLOTS = 3;
export function avatarSlots(users) {
  if (users.length <= GROUP_MAX_SLOTS) return { shown: users, more: 0 };
  const shown = users.slice(0, GROUP_MAX_SLOTS - 1);
  return { shown, more: users.length - shown.length };
}

export function assigneesPayload(task, userMap) {
  return memberUsers(task, userMap).map(u => ({ id: u.id, name: u.name, email: u.email ?? null }));
}
