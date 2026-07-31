import { describe, it, expect } from 'vitest';
import { pollUntilChanged } from './pollUntilChanged';

// Đồng hồ ảo: sleep() chỉ tua giờ chứ không chờ thật → test chạy tức thì.
const makeClock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
};

describe('pollUntilChanged', () => {
  it('dừng ngay nhịp thấy giá trị đổi, không hỏi thêm nhịp nào nữa', async () => {
    const clock = makeClock();
    const seq = ['A', 'A', 'B', 'C'];
    let i = 0;
    const read = async () => seq[i++];

    const r = await pollUntilChanged({ read, baseline: 'A', intervalMs: 3000, timeoutMs: 60000, ...clock });

    expect(r.changed).toBe(true);
    expect(r.value).toBe('B');
    expect(r.polls).toBe(3);
    expect(i).toBe(3); // không đọc tới 'C'
  });

  it('hết giờ mà giá trị không đổi → changed=false, số nhịp đúng timeout/interval', async () => {
    const clock = makeClock();
    let i = 0;
    const read = async () => { i++; return 'A'; };

    const r = await pollUntilChanged({ read, baseline: 'A', intervalMs: 3000, timeoutMs: 12000, ...clock });

    expect(r.changed).toBe(false);
    expect(r.polls).toBe(4); // 3s, 6s, 9s, 12s
    expect(i).toBe(4);
  });

  it('lỗi đọc giữa chừng không làm hỏng vòng lặp — vẫn bắt được thay đổi sau đó', async () => {
    const clock = makeClock();
    let i = 0;
    const read = async () => {
      i++;
      if (i <= 2) throw new Error('mạng chập chờn');
      return 'B';
    };

    const r = await pollUntilChanged({ read, baseline: 'A', intervalMs: 3000, timeoutMs: 60000, ...clock });

    expect(r.changed).toBe(true);
    expect(r.polls).toBe(3);
  });

  it('luôn chờ hết một nhịp rồi mới hỏi (không hỏi ngay lúc vừa gọi)', async () => {
    const clock = makeClock();
    const hoiLuc = [];
    const read = async () => { hoiLuc.push(clock.now()); return 'A'; };

    await pollUntilChanged({ read, baseline: 'A', intervalMs: 5000, timeoutMs: 10000, ...clock });

    expect(hoiLuc).toEqual([5000, 10000]);
  });

  it('đọc được null/undefined thì coi như chưa đổi, không kết luận vội', async () => {
    const clock = makeClock();
    const seq = [null, undefined, 'B'];
    let i = 0;
    const read = async () => seq[i++];

    const r = await pollUntilChanged({ read, baseline: 'A', intervalMs: 3000, timeoutMs: 60000, ...clock });

    expect(r.changed).toBe(true);
    expect(r.polls).toBe(3);
  });
});
