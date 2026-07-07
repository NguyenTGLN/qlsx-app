import { useEffect, useRef, useState, useCallback } from 'react';
import { dataCache } from './dataCache';

/**
 * Stale-while-revalidate trên dataCache:
 * - Có cache → trả NGAY (render tức thời), đồng thời refetch nền rồi cập nhật.
 * - Chưa có → loading=true cho tới khi fetch xong.
 * fetcher phải ổn định về ngữ nghĩa theo key (key đổi → dữ liệu khác).
 */
export function useCachedFetch(key, fetcher, ttlMs) {
  const [data, setData] = useState(() => dataCache.get(key, ttlMs));
  const [loading, setLoading] = useState(dataCache.get(key, ttlMs) == null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      dataCache.set(key, fresh);
      setData(fresh);
    } catch (e) {
      console.warn('useCachedFetch refresh lỗi:', key, e.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const cached = dataCache.get(key, ttlMs);
    if (cached != null) { setData(cached); setLoading(false); }
    else { setData(null); setLoading(true); }
    refresh();
  }, [key, refresh, ttlMs]);

  return { data, loading, refresh };
}
