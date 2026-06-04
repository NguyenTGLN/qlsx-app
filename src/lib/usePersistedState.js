import { useState, useEffect, useRef } from 'react';

const PREFIX = 'qlsx_';
const DEBOUNCE_MS = 300;

/**
 * Custom hook: useState + localStorage persistence.
 * Tự động lưu state vào localStorage khi thay đổi (debounced).
 * Tự động khôi phục state khi component mount.
 *
 * @param {string} key — Unique key (sẽ được prefix "qlsx_")
 * @param {any} defaultValue — Giá trị mặc định nếu không có trong localStorage
 * @returns {[any, Function]} — Giống useState
 *
 * Hỗ trợ: primitives, arrays, objects, Set.
 * Set sẽ được serialize thành array và deserialize lại thành Set.
 */
export function usePersistedState(key, defaultValue) {
  const fullKey = PREFIX + key;
  const isSetDefault = defaultValue instanceof Set;

  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw === null) return defaultValue;
      const parsed = JSON.parse(raw);
      // Nếu default là Set, chuyển array → Set
      if (isSetDefault && Array.isArray(parsed)) return new Set(parsed);
      return parsed;
    } catch {
      return defaultValue;
    }
  });

  const timerRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Không lưu lần đầu mount (vì chính là giá trị đã đọc từ localStorage)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        // Set → array trước khi serialize
        const toStore = state instanceof Set ? [...state] : state;
        localStorage.setItem(fullKey, JSON.stringify(toStore));
      } catch (e) {
        console.warn('[usePersistedState] save error:', e);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, fullKey]);

  return [state, setState];
}
