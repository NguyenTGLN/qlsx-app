import { describe, it, expect } from 'vitest';
import { isSessionValid } from './authToken';

describe('isSessionValid', () => {
  const now = 1_000_000_000_000; // mốc thời gian cố định (ms)
  it('hợp lệ khi có token và exp còn hạn', () => {
    expect(isSessionValid({ token: 'x', exp: Math.floor(now / 1000) + 60 }, now)).toBe(true);
  });
  it('vô hiệu khi exp đã qua', () => {
    expect(isSessionValid({ token: 'x', exp: Math.floor(now / 1000) - 1 }, now)).toBe(false);
  });
  it('vô hiệu khi thiếu token hoặc null', () => {
    expect(isSessionValid(null, now)).toBe(false);
    expect(isSessionValid({ exp: Math.floor(now / 1000) + 60 }, now)).toBe(false);
  });
});
