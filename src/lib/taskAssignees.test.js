import { test, expect, describe } from 'vitest';
import { memberIds, memberUsers, joinAssignees, assigneesPayload, tallyTasks } from './taskAssignees';

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


describe('joinAssignees', () => {
  test('rỗng → Chưa giao (giữ đúng chuỗi n8n đang in)', () => {
    expect(joinAssignees([])).toBe('Chưa giao');
  });
  test('gộp bằng dấu phẩy', () => {
    expect(joinAssignees(['Ngọc', 'Phong'])).toBe('Ngọc, Phong');
  });
});

// Luật nghiệp vụ cốt lõi: tổng toàn công ty đếm mỗi việc MỘT lần, còn từng nhân viên thì
// "có tên trong nhóm là được tính". Đây là chỗ dễ sai nhất và trước đây không có test.
describe('tallyTasks', () => {
  const RANGE = ['2026-07-01', '2026-07-31'];
  const done = (ids, extra = {}) => ({
    title: 'Việc xong', status: 'COMPLETED', assignee_ids: ids,
    due_date: '2026-07-10T17:00:00.000Z', completed_date: '2026-07-10T16:00:00.000Z', ...extra,
  });
  const tally = tasks => tallyTasks(tasks, ...RANGE);

  test('việc nhóm 3 người: công ty đếm 1, mỗi người đều được +1', () => {
    const r = tally([done(['A', 'B', 'C'])]);
    expect(r.company).toEqual({ total: 1, done: 1, onTime: 1 });
    for (const id of ['A', 'B', 'C']) {
      expect(r.perStaff.get(id)).toMatchObject({ total: 1, done: 1, onTime: 1 });
    }
  });

  test('doneList mang theo đồng đội để báo cáo ghi "cùng: ..."', () => {
    const r = tally([done(['A', 'B', 'C'])]);
    // mates = mọi thành viên KHÁC người đang xét, giữ nguyên thứ tự trong nhóm
    expect(r.perStaff.get('A').doneList).toEqual([{ title: 'Việc xong', mates: ['B', 'C'] }]);
    expect(r.perStaff.get('B').doneList).toEqual([{ title: 'Việc xong', mates: ['A', 'C'] }]);
    expect(r.perStaff.get('C').doneList).toEqual([{ title: 'Việc xong', mates: ['A', 'B'] }]);
  });

  test('việc một người: mates rỗng, không hiện "cùng: ..."', () => {
    const r = tally([done(['A'])]);
    expect(r.perStaff.get('A').doneList).toEqual([{ title: 'Việc xong', mates: [] }]);
  });

  test('việc trễ hạn: tính done nhưng không tính onTime, cho cả nhóm', () => {
    const late = done(['A', 'B'], { completed_date: '2026-07-11T17:00:00.000Z' });
    const r = tally([late]);
    expect(r.company).toEqual({ total: 1, done: 1, onTime: 0 });
    expect(r.perStaff.get('A').onTime).toBe(0);
    expect(r.perStaff.get('B').onTime).toBe(0);
  });

  test('trễ dưới 60 giây vẫn coi là đúng hạn', () => {
    const r = tally([done(['A'], { completed_date: '2026-07-10T17:00:30.000Z' })]);
    expect(r.company.onTime).toBe(1);
  });

  test('việc đã hủy bị bỏ qua hoàn toàn', () => {
    const r = tally([{ title: 'x', status: 'CANCELLED', assignee_ids: ['A'], completed_date: '2026-07-10T00:00:00.000Z' }]);
    expect(r.company).toEqual({ total: 0, done: 0, onTime: 0 });
    expect(r.perStaff.size).toBe(0);
  });

  test('việc đang làm: vào tổng nhưng chưa vào done', () => {
    const r = tally([{ title: 'x', status: 'IN_PROGRESS', assignee_ids: ['A', 'B'] }]);
    expect(r.company).toEqual({ total: 1, done: 0, onTime: 0 });
    expect(r.perStaff.get('B')).toEqual({ total: 1, done: 0, onTime: 0, doneList: [] });
  });

  test('việc xong NGOÀI khoảng thời gian lọc thì không tính', () => {
    const r = tally([done(['A'], { completed_date: '2026-06-30T10:00:00.000Z' })]);
    expect(r.company).toEqual({ total: 0, done: 0, onTime: 0 });
  });

  test('tổng theo từng NV LỚN HƠN tổng công ty khi có việc nhóm — đúng thiết kế', () => {
    const r = tally([done(['A', 'B', 'C']), done(['A'])]);
    expect(r.company.done).toBe(2);
    const sum = [...r.perStaff.values()].reduce((s, v) => s + v.done, 0);
    expect(sum).toBe(4);
  });

  test('activeStaff gồm mọi thành viên, kể cả NV đã bị xoá khỏi danh sách', () => {
    const r = tally([{ title: 'x', status: 'IN_PROGRESS', assignee_ids: ['A', 'NV_DA_XOA'] }]);
    expect([...r.activeStaff].sort()).toEqual(['A', 'NV_DA_XOA']);
  });

  test('onTime công ty KHÔNG phụ thuộc NV còn tồn tại hay không (bug cũ)', () => {
    // Trước đây cTasksOnTime chỉ cộng khi NV còn trong staffMap → việc của NV đã nghỉ làm
    // phình mẫu số mà không phình tử số, kéo tụt tỉ lệ đúng hạn toàn công ty.
    const r = tally([done(['NV_DA_NGHI'])]);
    expect(r.company).toEqual({ total: 1, done: 1, onTime: 1 });
  });

  test('việc kiểu cũ chỉ có assignee_id vẫn tính đúng', () => {
    const r = tally([{ title: 'x', status: 'IN_PROGRESS', assignee_id: 'A' }]);
    expect(r.perStaff.get('A').total).toBe(1);
  });

  test('việc chưa giao ai: vào tổng công ty, không vào ai cả', () => {
    const r = tally([{ title: 'x', status: 'IN_PROGRESS', assignee_ids: [] }]);
    expect(r.company.total).toBe(1);
    expect(r.perStaff.size).toBe(0);
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
