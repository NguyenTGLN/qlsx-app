/**
 * Module-level data cache (singleton).
 * Tồn tại xuyên suốt các lần navigate giữa các route React.
 * TTL mặc định: 5 phút — sau đó tự coi là stale và fetch lại.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 phút

const _store = new Map();

export const dataCache = {
  /**
   * Lấy dữ liệu từ cache.
   * @returns {any|null} null nếu không có hoặc đã hết hạn
   */
  get(key, ttlMs = DEFAULT_TTL_MS) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      _store.delete(key);
      return null;
    }
    return entry.data;
  },

  /**
   * Lưu dữ liệu vào cache.
   */
  set(key, data) {
    _store.set(key, { data, timestamp: Date.now() });
  },

  /**
   * Xóa một key khỏi cache (dùng khi cần force refresh).
   */
  invalidate(key) {
    _store.delete(key);
  },

  /**
   * Xóa toàn bộ cache.
   */
  clear() {
    _store.clear();
  },

  /**
   * Kiểm tra cache còn hiệu lực không (không xóa).
   */
  isValid(key, ttlMs = DEFAULT_TTL_MS) {
    const entry = _store.get(key);
    if (!entry) return false;
    return Date.now() - entry.timestamp <= ttlMs;
  },
};
