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

// Lấy 1 TRANG [from..to] cho phân trang server-side. PostgREST trần 1000 dòng/request
// nên trang 5K/10K phải gom theo từng đợt 1000 — nếu gọi .range(0,4999) thẳng sẽ chỉ
// nhận 1000 dòng và các dòng 1001-4999 bị MẤT khi chuyển trang.
// makeQuery phải tạo builder MỚI mỗi lần và đã gắn sẵn filter + order (kèm tie-break
// duy nhất, vd .order('id'), để các đợt không trùng/sót dòng).
// Trả { data, count, error } — count lấy từ đợt đầu (nếu query có yêu cầu count).
export async function fetchPageRows(makeQuery, from, to, chunk = 1000) {
  let all = [];
  let count = null;
  let start = from;
  while (start <= to) {
    const end = Math.min(start + chunk - 1, to);
    const { data, count: c, error } = await makeQuery().range(start, end);
    if (error) return { data: all, count, error };
    if (c != null && count == null) count = c;
    if (data && data.length) all = all.concat(data);
    if (!data || data.length < end - start + 1) break; // hết dữ liệu
    start = end + 1;
  }
  return { data: all, count, error: null };
}

// Gắn gợi ý khắc phục khi lỗi do CHƯA chạy gói SQL tăng tốc (thiếu function/cột).
// Dùng: throw sqlPackHint(error)
export function sqlPackHint(error) {
  const msg = String(error?.message || error || '');
  const missing = /does not exist|not find the function|schema cache|location_key/i.test(msg);
  return new Error(msg + (missing ? ' — cần chạy sql/perf_kho_instant.sql trong Supabase SQL Editor' : ''));
}
