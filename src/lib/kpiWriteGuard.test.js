import { describe, it, expect } from 'vitest';
import { loiGhiKpi } from './kpiWriteGuard';

describe('loiGhiKpi', () => {
  it('ghi được ít nhất 1 dòng → không có lỗi', () => {
    expect(loiGhiKpi(null, [{ id: 'x' }])).toBeNull();
  });

  it('lỗi thật thì trả nguyên thông báo của server', () => {
    expect(loiGhiKpi({ message: 'duplicate key' }, null))
      .toContain('duplicate key');
  });

  // ĐÂY LÀ LÕI CỦA LỖI: PostgREST trả HTTP 204 + error=null khi RLS USING lọc hết
  // dòng. Người không phải ADMIN gõ điểm chốt 3, form đóng êm, reload thấy vẫn 10 —
  // tin là đã chốt, cuối thang bảng lương lấy sai số.
  it('0 dòng + error null (RLS chặn im lặng) PHẢI báo lỗi', () => {
    const msg = loiGhiKpi(null, []);
    expect(msg).not.toBeNull();
    expect(msg).toContain('không có quyền');
    expect(msg).toContain('Admin');
  });

  it('data null + error null cũng là ghi hụt, không được coi là thành công', () => {
    expect(loiGhiKpi(null, null)).not.toBeNull();
  });

  it('data undefined (quên .select()) cũng bị chặn', () => {
    expect(loiGhiKpi(null, undefined)).not.toBeNull();
  });

  it('lỗi thật được ưu tiên báo trước, không nuốt vào thông báo quyền', () => {
    expect(loiGhiKpi({ message: 'timeout' }, [])).toContain('timeout');
  });

  it('nói rõ dữ liệu chưa đổi để người dùng không tưởng đã lưu một nửa', () => {
    expect(loiGhiKpi(null, [])).toMatch(/chưa (thay đổi|được)/i);
  });
});
