// Lưu phiên đăng nhập (token JWT + user) và cấp token cho supabase-js.
const KEY = 'qlsx_session';
const mem = {}; // fallback khi không có localStorage (test/node)

function store() { try { return window.localStorage; } catch { return null; } }
function raw() { const s = store(); return s ? s.getItem(KEY) : (mem[KEY] || null); }
function writeRaw(v) { const s = store(); if (s) s.setItem(KEY, v); else mem[KEY] = v; }
function delRaw() { const s = store(); if (s) s.removeItem(KEY); else delete mem[KEY]; }

/** Phiên hợp lệ = có token và exp (giây) còn hạn so với nowMs (mili-giây). */
export function isSessionValid(session, nowMs = Date.now()) {
  return !!(session && session.token && session.exp && session.exp * 1000 > nowMs);
}

export function loadSession() {
  try {
    const r = raw(); if (!r) return null;
    const s = JSON.parse(r);
    if (!isSessionValid(s)) { delRaw(); return null; }
    return s;
  } catch { return null; }
}

export function setSession(session) { writeRaw(JSON.stringify(session)); }
export function clearSession() { delRaw(); }
export function getAccessToken() { return loadSession()?.token || null; }
export function getSessionUser() { return loadSession()?.user || null; }
