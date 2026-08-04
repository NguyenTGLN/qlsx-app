import { describe, test, expect } from 'vitest';
import { xepViecDangLam, NHOM } from './viecDangLam';

// Mốc thời gian cố định để test không đổi kết quả theo ngày chạy.
const BAY_GIO = new Date('2026-08-04T10:00:00+07:00').getTime();
const gio = h => new Date(BAY_GIO + h * 3600000).toISOString();
const ngay = d => gio(d * 24);

const viec = (id, thuoc = {}) => ({
  id, title: `Việc ${id}`, status: 'IN_PROGRESS', assignee_ids: ['toi'], due_date: null, ...thuoc,
});

describe('lọc — chỉ việc ĐANG LÀM có tên mình', () => {
  test('bỏ việc đã xong và đã huỷ', () => {
    const ds = [
      viec('a'),
      viec('b', { status: 'COMPLETED' }),
      viec('c', { status: 'CANCELLED' }),
    ];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => v.id)).toEqual(['a']);
  });

  test('bỏ việc của người khác', () => {
    const ds = [viec('a'), viec('b', { assignee_ids: ['nguoi_khac'] })];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => v.id)).toEqual(['a']);
  });

  test('việc nhóm có tên mình thì tính', () => {
    const ds = [viec('a', { assignee_ids: ['nguoi_khac', 'toi', 'ai_do'] })];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO)).toHaveLength(1);
  });

  // Dòng chưa migrate multi-assignee chỉ có `assignee_id`. Đọc thẳng assignee_ids
  // sẽ làm những việc đó biến mất khỏi màn hình đầu tiên của nhân viên.
  test('dòng cũ chỉ có assignee_id vẫn đọc được', () => {
    const ds = [{ id: 'cu', title: 'Việc cũ', status: 'IN_PROGRESS', assignee_id: 'toi' }];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => v.id)).toEqual(['cu']);
  });

  test('assignee_ids rỗng ⇒ lùi về assignee_id, không văng', () => {
    const ds = [{ id: 'x', status: 'IN_PROGRESS', assignee_ids: [], assignee_id: 'toi' }];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO)).toHaveLength(1);
  });

  test.each([[null], [undefined], [[]]])('danh sách %s ⇒ mảng rỗng, không văng', (ds) => {
    expect(xepViecDangLam(ds, 'toi', BAY_GIO)).toEqual([]);
  });

  test('không có id người dùng ⇒ mảng rỗng, KHÔNG trả việc của cả công ty', () => {
    expect(xepViecDangLam([viec('a')], null, BAY_GIO)).toEqual([]);
  });
});

describe('phân nhóm theo hạn', () => {
  test('quá hạn / sắp đến hạn trong 3 ngày / còn lại', () => {
    const ds = [
      viec('tre', { due_date: gio(-1) }),
      viec('gap', { due_date: ngay(2) }),
      viec('thong_tha', { due_date: ngay(9) }),
      viec('khong_han'),
    ];
    const m = Object.fromEntries(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => [v.id, v.nhom]));
    expect(m).toEqual({
      tre: NHOM.QUA_HAN,
      gap: NHOM.SAP_HAN,
      thong_tha: NHOM.CON_LAI,
      khong_han: NHOM.CON_LAI,
    });
  });

  test('đúng mốc 3 ngày vẫn là "còn lại", không phải "sắp đến hạn"', () => {
    const ds = [viec('bien', { due_date: ngay(3) })];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO)[0].nhom).toBe(NHOM.CON_LAI);
  });

  test('hạn đúng lúc này tính là quá hạn', () => {
    const ds = [viec('ngay_bay_gio', { due_date: new Date(BAY_GIO).toISOString() })];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO)[0].nhom).toBe(NHOM.QUA_HAN);
  });

  test('due_date rác ⇒ xếp vào "còn lại", không thành quá hạn giả', () => {
    const ds = [viec('rac', { due_date: 'khong-phai-ngay' })];
    const kq = xepViecDangLam(ds, 'toi', BAY_GIO);
    expect(kq[0].nhom).toBe(NHOM.CON_LAI);
  });
});

describe('thứ tự — quá hạn lên đầu, trong nhóm thì hạn gần trước', () => {
  test('ba nhóm xếp đúng thứ tự dù đầu vào lộn xộn', () => {
    const ds = [
      viec('con_lai', { due_date: ngay(10) }),
      viec('sap_1', { due_date: ngay(2) }),
      viec('tre_1', { due_date: gio(-50) }),
      viec('sap_2', { due_date: gio(1) }),
      viec('tre_2', { due_date: gio(-2) }),
    ];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => v.id))
      .toEqual(['tre_1', 'tre_2', 'sap_2', 'sap_1', 'con_lai']);
  });

  test('việc không hạn xuống cuối nhóm "còn lại"', () => {
    const ds = [
      viec('khong_han'),
      viec('co_han', { due_date: ngay(20) }),
    ];
    expect(xepViecDangLam(ds, 'toi', BAY_GIO).map(v => v.id)).toEqual(['co_han', 'khong_han']);
  });

  test('không sửa mảng gốc', () => {
    const ds = [viec('b', { due_date: ngay(5) }), viec('a', { due_date: gio(-1) })];
    const truoc = ds.map(v => v.id);
    xepViecDangLam(ds, 'toi', BAY_GIO);
    expect(ds.map(v => v.id)).toEqual(truoc);
  });
});
