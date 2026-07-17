import { test, expect, describe } from 'vitest';
import { memberIds, memberUsers, formatAssignees, joinAssignees, assigneesPayload, avatarSlots } from './taskAssignees';

const USERS = [
  { id: 'NV01', name: 'Ngọc', email: 'ngoc@x.vn' },
  { id: 'NV02', name: 'Phong', email: null },
  { id: 'NV03', name: 'Tuấn' },
];
const uMap = new Map(USERS.map(u => [u.id, u]));

describe('memberIds', () => {
  test('đọc assignee_ids khi có', () => {
    expect(memberIds({ assignee_ids: ['NV01', 'NV02'], assignee_id: 'NV01' })).toEqual(['NV01', 'NV02']);
  });
  test('fallback assignee_id khi assignee_ids rỗng (cache cũ)', () => {
    expect(memberIds({ assignee_ids: [], assignee_id: 'NV02' })).toEqual(['NV02']);
  });
  test('fallback assignee_id khi assignee_ids undefined (cache cũ)', () => {
    expect(memberIds({ assignee_id: 'NV02' })).toEqual(['NV02']);
  });
  test('chưa giao ai thì trả mảng rỗng', () => {
    expect(memberIds({ assignee_ids: [], assignee_id: null })).toEqual([]);
    expect(memberIds({})).toEqual([]);
  });
  test('task null/undefined không ném lỗi', () => {
    expect(memberIds(null)).toEqual([]);
    expect(memberIds(undefined)).toEqual([]);
  });
  test('loại id rỗng và trùng lặp, giữ thứ tự', () => {
    expect(memberIds({ assignee_ids: ['NV02', '', 'NV01', 'NV02', null] })).toEqual(['NV02', 'NV01']);
  });
});

describe('memberUsers', () => {
  test('trả user theo đúng thứ tự trong nhóm', () => {
    expect(memberUsers({ assignee_ids: ['NV02', 'NV01'] }, uMap).map(u => u.name)).toEqual(['Phong', 'Ngọc']);
  });
  test('bỏ qua id không tìm thấy user', () => {
    expect(memberUsers({ assignee_ids: ['NV01', 'NV99'] }, uMap).map(u => u.name)).toEqual(['Ngọc']);
  });
  test('chưa giao ai thì rỗng', () => {
    expect(memberUsers({ assignee_ids: [] }, uMap)).toEqual([]);
  });
});

describe('formatAssignees', () => {
  test('rỗng → Chưa giao', () => {
    expect(formatAssignees([])).toBe('Chưa giao');
  });
  test('một người → tên trần', () => {
    expect(formatAssignees(['Ngọc'])).toBe('Ngọc');
  });
  test('nhiều người → tên đầu + số còn lại', () => {
    expect(formatAssignees(['Ngọc', 'Phong'])).toBe('Ngọc +1');
    expect(formatAssignees(['Ngọc', 'Phong', 'Tuấn'])).toBe('Ngọc +2');
  });
});

describe('joinAssignees', () => {
  test('rỗng → Chưa giao (giữ đúng chuỗi n8n đang in)', () => {
    expect(joinAssignees([])).toBe('Chưa giao');
  });
  test('gộp bằng dấu phẩy', () => {
    expect(joinAssignees(['Ngọc', 'Phong'])).toBe('Ngọc, Phong');
  });
});

// Thẻ việc chỉ rộng 44-56px, ô bảng 70px → tối đa 3 ô avatar, không được tràn.
describe('avatarSlots', () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: `NV0${i}`, name: `NV ${i}` }));

  test('2 người → 2 avatar, không có bong bóng +N', () => {
    expect(avatarSlots(mk(2))).toEqual({ shown: mk(2), more: 0 });
  });
  test('3 người → 3 avatar vừa khít, vẫn không có +N', () => {
    expect(avatarSlots(mk(3))).toEqual({ shown: mk(3), more: 0 });
  });
  test('4 người → 2 avatar + "+2" (tổng vẫn 3 ô)', () => {
    expect(avatarSlots(mk(4))).toEqual({ shown: mk(4).slice(0, 2), more: 2 });
  });
  test('13 người (cả công ty) → 2 avatar + "+11"', () => {
    expect(avatarSlots(mk(13))).toEqual({ shown: mk(13).slice(0, 2), more: 11 });
  });
  test('không bao giờ chiếm quá 3 ô, dù bao nhiêu người', () => {
    for (let n = 2; n <= 13; n++) {
      const { shown, more } = avatarSlots(mk(n));
      expect(shown.length + (more > 0 ? 1 : 0)).toBeLessThanOrEqual(3);
    }
  });
  test('số người hiện + số gộp luôn bằng tổng, không sót ai', () => {
    for (let n = 2; n <= 13; n++) {
      const { shown, more } = avatarSlots(mk(n));
      expect(shown.length + more).toBe(n);
    }
  });
});

describe('assigneesPayload', () => {
  test('trả id/name/email cho mọi thành viên', () => {
    expect(assigneesPayload({ assignee_ids: ['NV01', 'NV02'] }, uMap)).toEqual([
      { id: 'NV01', name: 'Ngọc', email: 'ngoc@x.vn' },
      { id: 'NV02', name: 'Phong', email: null },
    ]);
  });
  test('user thiếu email → null', () => {
    expect(assigneesPayload({ assignee_ids: ['NV03'] }, uMap)).toEqual([{ id: 'NV03', name: 'Tuấn', email: null }]);
  });
  test('chưa giao ai → mảng rỗng', () => {
    expect(assigneesPayload({ assignee_ids: [] }, uMap)).toEqual([]);
  });
});
