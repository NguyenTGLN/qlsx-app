import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ngwkzicrnspeggunsblr.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nd2t6aWNybnNwZWdndW5zYmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU4MTgsImV4cCI6MjA4NzY5MTgxOH0.XgxezghOyUYgr370Ge13VN_V2r-PfR4BEq7JDDF4Pts';

const customFetch = (url, options) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  return fetch(url, { ...options, signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      return res;
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Máy chủ phản hồi quá chậm (Timeout). Có thể dự án Supabase đang bị tạm dừng, vui lòng truy cập Supabase dashboard để mở lại.');
      }
      throw err;
    });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: customFetch }
});

// Lấy TẤT CẢ dòng khớp truy vấn, vượt giới hạn mặc định ~1000 dòng của PostgREST.
// Truyền hàm tạo query MỚI mỗi lần (vì .range() áp lên builder):
//   fetchAllRows(() => supabase.from('x').select('*'))
// Trả về { data, error } để thay thẳng cho destructure { data } ở nơi gọi.
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    if (data && data.length) all = all.concat(data);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
