# Khoá bảo mật QLSX (RLS + đăng nhập có token) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chặn tuyệt đối truy cập DB từ người ngoài (chỉ có anon key), băm & tách mật khẩu, khoá ghi bảng nhân viên/phân quyền cho Admin — mà không sửa 253 chỗ query và không làm hỏng luồng nào.

**Architecture:** anon key chỉ gọi được hàm `dang_nhap()`. Đăng nhập xong nhân viên nhận JWT (ký HS256 bằng `pgcrypto` + JWT secret trong Vault); client gắn token vào mọi request qua option `accessToken` của supabase-js; RLS mở cửa cho `authenticated`, khoá ghi `nhan_vien` cho Admin, khoá tuyệt đối bảng `nhan_vien_secret`. Triển khai 3 bậc (chuẩn bị → đổi đăng nhập → siết RLS) để không downtime, rollback từng bước.

**Tech Stack:** Supabase (Postgres + PostgREST + Vault + pgcrypto), `@supabase/supabase-js@2.100`, Vite/React, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-10-bao-mat-rls-design.md](../specs/2026-07-10-bao-mat-rls-design.md)

---

## Bối cảnh cho người thực thi (đọc trước)

- App gọi Supabase trực tiếp từ trình duyệt bằng **anon key** (công khai trong bundle). Hiện mọi bảng để `USING(true)` ⇒ ai cũng đọc/ghi được.
- `nhan_vien(id text PK, name, role, permissions jsonb, password text, avatar, ...)`. Đăng nhập cũ: `select * from nhan_vien where id=? and password=?` (mật khẩu thô).
- Phân quyền lưu trong cột `nhan_vien.permissions` (không có bảng riêng).
- **n8n** ghi DB bằng **service_role** (bỏ qua RLS) — đã xác nhận. **Cron nhắc việc** là hàm `security definer` (bỏ qua RLS). Cả hai KHÔNG bị ảnh hưởng.
- Deploy: `npm run build` → copy `dist/*` vào `deploy-netlify/` → user kéo-thả `deploy-netlify/` lên Netlify. Push GitHub chỉ để backup, không deploy.
- Giá trị dùng trong lệnh: Project ref `ngwkzicrnspeggunsblr`, URL `https://ngwkzicrnspeggunsblr.supabase.co`.

## File Structure

**SQL mới (dán vào Supabase SQL Editor, theo thứ tự):**
- `sql/security_1_password_secret.sql` — pgcrypto, bảng `nhan_vien_secret`, backfill băm mật khẩu.
- `sql/security_2_jwt_and_login.sql` — Vault secret, helper ký JWT, hàm `dang_nhap`, `dat_mat_khau`, `sao_chep_secret`.
- `sql/security_3_rls_lockdown.sql` — RLS toàn bộ bảng, thu hồi quyền anon, xoá cột `password`.

**JS:**
- Create: `src/lib/authToken.js` — lưu/đọc phiên (token+user) + `getAccessToken()`.
- Create: `src/lib/authToken.test.js` — vitest cho logic hết hạn.
- Modify: `src/lib/supabase.js` — thêm option `accessToken`.
- Modify: `src/lib/AuthContext.jsx` — `login()` gọi RPC; auto-login từ phiên đã lưu.
- Modify: `src/pages/tasks/TaskApp.jsx` — `handleSaveUser` chuyển ghi mật khẩu sang RPC; bỏ tham chiếu `password` trong code chết.

**Không đụng:** 253 chỗ gọi `supabase.from(...)` ở 33 file khác.

---

## PHASE 1 — Chuẩn bị (không đổi hành vi app)

### Task 1: Bảng bí mật + băm mật khẩu

**Files:**
- Create: `sql/security_1_password_secret.sql`

- [ ] **Step 1: Viết SQL**

```sql
-- sql/security_1_password_secret.sql
-- pgcrypto (crypt/gen_salt/hmac) — trên Supabase nằm ở schema extensions
create extension if not exists pgcrypto with schema extensions;

-- Bảng bí mật: mật khẩu băm, tách khỏi nhan_vien. ON UPDATE/DELETE CASCADE theo id NV.
create table if not exists public.nhan_vien_secret (
  nv_id text primary key references public.nhan_vien(id) on update cascade on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- Băm toàn bộ mật khẩu hiện có sang bảng secret (chạy 1 lần, idempotent)
insert into public.nhan_vien_secret (nv_id, password_hash)
select id, extensions.crypt(password, extensions.gen_salt('bf'))
from public.nhan_vien
where password is not null and password <> ''
on conflict (nv_id) do nothing;

-- Bật RLS, KHÔNG policy nào => anon & authenticated bị chặn tuyệt đối.
alter table public.nhan_vien_secret enable row level security;
revoke all on public.nhan_vien_secret from anon, authenticated;
```

- [ ] **Step 2: Chạy trong Supabase SQL Editor**

Dán toàn bộ file, Run. Expected: `Success. No rows returned` (statement cuối), không lỗi.

- [ ] **Step 3: Kiểm chứng backfill**

Run:
```sql
select (select count(*) from public.nhan_vien where password is not null and password<>'') as co_mk,
       (select count(*) from public.nhan_vien_secret) as da_bam;
select nv_id, left(password_hash,7) as prefix from public.nhan_vien_secret limit 3;
```
Expected: `co_mk == da_bam`; `prefix` bắt đầu bằng `$2a$` hoặc `$2b$` (bcrypt).

- [ ] **Step 4: Commit (backup, không deploy)**

```bash
git add sql/security_1_password_secret.sql
git commit -m "feat(bảo mật): bảng nhan_vien_secret + băm mật khẩu (chuẩn bị)"
```

> **Rollback Task 1:** `drop table if exists public.nhan_vien_secret;` App không đổi hành vi ở phase này.

---

### Task 2: Helper ký JWT + hàm đăng nhập (backend)

**Files:**
- Create: `sql/security_2_jwt_and_login.sql`

- [ ] **Step 1: Lấy JWT secret của dự án**

Vào Supabase Dashboard → **Settings → API → JWT Settings → JWT Secret**, copy chuỗi bí mật (dùng ở Step 2).

- [ ] **Step 2: Viết SQL**

```sql
-- sql/security_2_jwt_and_login.sql

-- 1) Cất JWT secret vào Vault (thay <PASTE_JWT_SECRET>). Chạy 1 lần.
select vault.create_secret('<PASTE_JWT_SECRET>', 'jwt_secret', 'Project JWT secret for dang_nhap');
-- Nếu đã có và muốn đổi:
-- update vault.secrets set secret='<NEW>' where name='jwt_secret';

-- 2) base64url encode
create or replace function public._b64url(data bytea) returns text
language sql immutable as $$
  select translate(encode(data,'base64'), E'+/=\n', '-_');
$$;

-- 3) Ký JWT HS256
create or replace function public._sign_jwt(payload jsonb, secret text) returns text
language sql as $$
  with parts as (
    select public._b64url(convert_to('{"alg":"HS256","typ":"JWT"}','utf8')) as h,
           public._b64url(convert_to(payload::text,'utf8')) as p
  ), si as (select h||'.'||p as s from parts)
  select s||'.'||public._b64url(extensions.hmac(s, secret, 'sha256')) from si;
$$;

-- 4) Đăng nhập: kiểm bcrypt, phát JWT (role=authenticated + nv_role)
create or replace function public.dang_nhap(p_id text, p_pw text, p_remember boolean default false)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  v record; v_hash text; v_secret text;
  v_now bigint := extract(epoch from now())::bigint;
  v_ttl int := case when p_remember then 60*60*24*7 else 60*60*12 end;
  v_exp bigint; v_token text;
begin
  select id, name, role, coalesce(permissions,'{}'::jsonb) as permissions
    into v from public.nhan_vien where lower(id)=lower(p_id);
  if not found then
    raise exception 'Mã nhân viên hoặc mật khẩu không đúng' using errcode='28P01';
  end if;

  select password_hash into v_hash from public.nhan_vien_secret where nv_id=v.id;
  if v_hash is null or v_hash <> extensions.crypt(p_pw, v_hash) then
    raise exception 'Mã nhân viên hoặc mật khẩu không đúng' using errcode='28P01';
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name='jwt_secret';
  if v_secret is null then raise exception 'JWT secret chưa có trong Vault'; end if;

  v_exp := v_now + v_ttl;
  v_token := public._sign_jwt(jsonb_build_object(
    'role','authenticated','sub',v.id,'nv_id',v.id,
    'nv_role',upper(coalesce(v.role,'AGENT')),'name',v.name,
    'iat',v_now,'exp',v_exp), v_secret);

  return jsonb_build_object('token',v_token,'exp',v_exp,
    'user',jsonb_build_object('id',v.id,'name',v.name,
      'role',upper(coalesce(v.role,'AGENT')),'permissions',v.permissions));
end; $$;
revoke all on function public.dang_nhap(text,text,boolean) from public;
grant execute on function public.dang_nhap(text,text,boolean) to anon, authenticated;

-- 5) Admin-only: đặt/đổi mật khẩu (ghi vào bảng secret)
create or replace function public.dat_mat_khau(p_id text, p_pw text)
returns void language plpgsql security definer set search_path=public, extensions as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được đổi mật khẩu' using errcode='42501';
  end if;
  if not exists (select 1 from public.nhan_vien where id=p_id) then
    raise exception 'Nhân viên không tồn tại: %', p_id;
  end if;
  insert into public.nhan_vien_secret(nv_id,password_hash,updated_at)
  values (p_id, extensions.crypt(p_pw, extensions.gen_salt('bf')), now())
  on conflict (nv_id) do update set password_hash=excluded.password_hash, updated_at=now();
end; $$;
revoke all on function public.dat_mat_khau(text,text) from public, anon;
grant execute on function public.dat_mat_khau(text,text) to authenticated;

-- 6) Admin-only: sao chép secret khi đổi mã NV
create or replace function public.sao_chep_secret(p_from text, p_to text)
returns void language plpgsql security definer set search_path=public, extensions as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin' using errcode='42501';
  end if;
  insert into public.nhan_vien_secret(nv_id,password_hash,updated_at)
  select p_to, password_hash, now() from public.nhan_vien_secret where nv_id=p_from
  on conflict (nv_id) do update set password_hash=excluded.password_hash, updated_at=now();
end; $$;
revoke all on function public.sao_chep_secret(text,text) from public, anon;
grant execute on function public.sao_chep_secret(text,text) to authenticated;
```

- [ ] **Step 3: Chạy trong SQL Editor** — Run toàn bộ. Expected: không lỗi.

- [ ] **Step 4: Kiểm chứng đăng nhập trả token**

Run (thay `NV_TEST`/`PW_TEST` bằng 1 tài khoản thật đã biết mật khẩu):
```sql
select public.dang_nhap('NV_TEST','PW_TEST',false);
```
Expected: JSON có `token` (3 đoạn ngăn bởi dấu chấm), `exp`, `user` (không có mật khẩu). Sai mật khẩu ⇒ báo lỗi "Mã nhân viên hoặc mật khẩu không đúng".

- [ ] **Step 5: SMOKE TEST — PostgREST chấp nhận token (de-risk ký JWT)**

Lấy token từ Step 4 (chuỗi trong `"token":"..."`), chạy trên máy có `curl`:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  'https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/nhan_vien?select=id&limit=1' \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <TOKEN_TU_STEP_4>"
```
Expected: `200`. Nếu `401` (JWSError/invalid signature) ⇒ **DỪNG**: ký JWT không tương thích; chuyển phương án dự phòng Edge Function (xem "Fallback" cuối file) rồi tiếp tục.

- [ ] **Step 6: Commit**

```bash
git add sql/security_2_jwt_and_login.sql
git commit -m "feat(bảo mật): hàm dang_nhap phát JWT + RPC quản trị mật khẩu"
```

> **Rollback Task 2:** `drop function if exists public.dang_nhap(text,text,boolean), public.dat_mat_khau(text,text), public.sao_chep_secret(text,text), public._sign_jwt(jsonb,text), public._b64url(bytea);`

---

## PHASE 2 — Đổi đăng nhập (RLS vẫn mở, chưa thể hỏng dữ liệu)

### Task 3: Module lưu phiên `authToken.js` (TDD)

**Files:**
- Create: `src/lib/authToken.js`
- Test: `src/lib/authToken.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
// src/lib/authToken.test.js
import { describe, it, expect } from 'vitest';
import { isSessionValid } from './authToken';

describe('isSessionValid', () => {
  const now = 1_000_000_000_000; // mốc thời gian cố định (ms)
  it('hợp lệ khi có token và exp còn hạn', () => {
    expect(isSessionValid({ token: 'x', exp: Math.floor(now/1000) + 60 }, now)).toBe(true);
  });
  it('vô hiệu khi exp đã qua', () => {
    expect(isSessionValid({ token: 'x', exp: Math.floor(now/1000) - 1 }, now)).toBe(false);
  });
  it('vô hiệu khi thiếu token hoặc null', () => {
    expect(isSessionValid(null, now)).toBe(false);
    expect(isSessionValid({ exp: Math.floor(now/1000) + 60 }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — kỳ vọng FAIL**

Run: `npm run test -- authToken`
Expected: FAIL ("isSessionValid is not a function" / không import được).

- [ ] **Step 3: Viết `authToken.js`**

```js
// src/lib/authToken.js
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
```

- [ ] **Step 4: Chạy test — kỳ vọng PASS**

Run: `npm run test -- authToken`
Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authToken.js src/lib/authToken.test.js
git commit -m "feat(bảo mật): module lưu phiên + getAccessToken (có test)"
```

---

### Task 4: Gắn token vào mọi request — `supabase.js`

**Files:**
- Modify: `src/lib/supabase.js:24-26`

- [ ] **Step 1: Sửa khởi tạo client**

Thêm import ở đầu file (sau dòng `import { createClient } ...`):
```js
import { getAccessToken } from './authToken';
```
Thay khối `export const supabase = createClient(...)` hiện tại bằng:
```js
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Chưa đăng nhập → trả anon key (chỉ gọi được dang_nhap).
  // Đã đăng nhập → trả JWT ⇒ toàn bộ query tự mang token, không sửa nơi gọi.
  accessToken: async () => getAccessToken() || supabaseAnonKey,
  global: { fetch: customFetch },
});
```
Giữ nguyên `customFetch`, `fetchAllRows`, `fetchPageRows`, `sqlPackHint`.

- [ ] **Step 2: Kiểm biên dịch**

Run: `npm run build`
Expected: build thành công, không lỗi import.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat(bảo mật): supabase-js gắn accessToken cho mọi request"
```

---

### Task 5: Đăng nhập qua RPC — `AuthContext.jsx`

**Files:**
- Modify: `src/lib/AuthContext.jsx:146-221` (AuthProvider: auto-login effect, `login`, `logout`)

- [ ] **Step 1: Thêm import**

Sau dòng `import { supabase } from './supabase';` thêm:
```js
import { setSession, clearSession, getSessionUser } from './authToken';
```

- [ ] **Step 2: Thay effect auto-login (dòng ~151-172)**

Thay toàn bộ `useEffect(() => { const saved = localStorage.getItem(STORAGE_KEY); ... }, [])` bằng:
```js
  // Khôi phục phiên từ token đã lưu (không gọi mạng, không lưu mật khẩu thô)
  useEffect(() => {
    const u = getSessionUser();
    if (u) {
      u.role = u.role ? u.role.toUpperCase() : 'AGENT';
      setUser(withMigratedPerms(u));
    }
    setLoading(false);
  }, []);
```

- [ ] **Step 3: Thay hàm `login` (dòng ~174-210)**

```js
  const login = useCallback(async (id, password, remember = false) => {
    const { data, error } = await supabase.rpc('dang_nhap', {
      p_id: id, p_pw: password, p_remember: remember,
    });
    if (error || !data?.token) {
      const msg = error?.message || '';
      if (msg.includes('quá chậm') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
        throw new Error('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
      }
      throw new Error('Mã nhân viên hoặc mật khẩu không đúng!');
    }

    const u = { ...data.user, role: (data.user.role || 'AGENT').toUpperCase() };
    setSession({ token: data.token, exp: data.exp, user: u });
    setUser(withMigratedPerms(u));

    // Legacy keys — giữ tương thích các module cũ
    localStorage.setItem('workerId', u.id);
    localStorage.setItem('workerCode', u.id);
    localStorage.setItem('workerName', u.name);
    localStorage.setItem('workerRole', u.role === 'ADMIN' ? 'admin' : 'worker');

    return u;
  }, []);
```

- [ ] **Step 4: Thay hàm `logout` (dòng ~212-221)**

```js
  const logout = useCallback(() => {
    setUser(null);
    clearSession();
    ['qlcv_auth','qlsx_remember_auth','qlsx_auth','workerId','workerCode','workerName','workerRole']
      .forEach(k => localStorage.removeItem(k));
  }, []);
```

- [ ] **Step 5: Kiểm biên dịch**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 6: Commit**

```bash
git add src/lib/AuthContext.jsx
git commit -m "feat(bảo mật): AuthContext đăng nhập qua RPC dang_nhap, bỏ lưu mật khẩu thô"
```

---

### Task 6: Chuyển ghi mật khẩu sang RPC + dọn code chết — `TaskApp.jsx`

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx:164-170` (xoá `apiLogin` chết), `:203-214` (`apiCreateUser`/`apiUpdateUser`), `:1170-1208` (`handleSaveUser`)

Lý do: sau khi xoá cột `password` (Task 8), mọi chỗ ghi `nhan_vien.password` sẽ hỏng. `apiLogin` là code chết (đọc `me` từ AuthContext ở dòng 1023-1045) nhưng vẫn tham chiếu `data.password` → xoá luôn.

- [ ] **Step 1: Xoá hàm `apiLogin` chết (dòng 164-170)**

Xoá nguyên khối:
```js
    async function apiLogin(id, pw) {
      const { data, error } = await db.from('nhan_vien').select('*').eq('id',id).single()
      if (error||!data) throw new Error('Mã nhân viên không tồn tại.')
      if (data.password !== pw) throw new Error('Mật khẩu không đúng.')
      data.role = data.role ? data.role.toUpperCase() : data.role;
      return data
    }
```
(Nếu `LoginScreen` dòng ~467 báo lỗi vì gọi `apiLogin`, xoá luôn component `LoginScreen` — nó không còn được render; xác nhận bằng `grep "LoginScreen" src/pages/tasks/TaskApp.jsx` chỉ còn định nghĩa, không có `<LoginScreen`.)

- [ ] **Step 2: Bỏ ghi `password` trong `apiCreateUser` (dòng 203-209)**

`apiCreateUser` nhận `form`; đảm bảo KHÔNG chèn `password` vào bảng. Thay:
```js
    async function apiCreateUser(form) {
      const { password, ...row } = form;           // tách password ra khỏi cột bảng
      const { error } = await db.from('nhan_vien').insert(row)
      if (error) {
        if (error.message.includes('duplicate')||error.message.includes('unique')) throw new Error(`Mã nhân viên "${form.id}" đã tồn tại.`)
        throw error
      }
      if (password) {
        const { error: pErr } = await db.rpc('dat_mat_khau', { p_id: form.id, p_pw: password });
        if (pErr) throw new Error('Tạo NV xong nhưng đặt mật khẩu lỗi: ' + pErr.message);
      }
    }
```

- [ ] **Step 3: Sửa `handleSaveUser` — nhánh tạo mới (dòng 1203-1207)**

Thay:
```js
        } else {
          const newForm = {id:form.id, name:form.name, password:form.password, role:form.role, avatar:form.avatar, permissions:form.permissions||null};
          await apiCreateUser(newForm);
          setUsers(us => [...us, newForm]);
          toast(`Đã thêm nhân viên ${form.name}!`);
        }
```
bằng (apiCreateUser đã tự tách password + gọi RPC; không đưa password vào state users):
```js
        } else {
          await apiCreateUser({id:form.id, name:form.name, password:form.password, role:form.role, avatar:form.avatar, permissions:form.permissions||null});
          setUsers(us => [...us, {id:form.id, name:form.name, role:form.role, avatar:form.avatar, permissions:form.permissions||null}]);
          toast(`Đã thêm nhân viên ${form.name}!`);
        }
```

- [ ] **Step 4: Sửa `handleSaveUser` — nhánh sửa (dòng 1171-1201)**

Thay khối `if (isEdit) { ... }` (đến trước `toast('Đã cập nhật nhân viên!')`) bằng:
```js
        if (isEdit) {
          const originalId = form.originalId;
          const idChanged = form.id !== originalId;
          const data = {name:form.name, role:form.role, avatar:form.avatar, permissions:form.permissions||null};

          if (idChanged) {
            const {data:oldRow, error:fetchErr} = await db.from('nhan_vien').select('*').eq('id', originalId).single();
            if (fetchErr) throw new Error('Không tìm thấy NV: ' + fetchErr.message);
            const { password:_omit, ...oldNoPw } = oldRow;              // không mang cột password (đã bỏ)
            const newUser = {...oldNoPw, ...data, id: form.id};
            const {error:insErr} = await db.from('nhan_vien').insert(newUser);
            if (insErr) throw new Error('Lỗi tạo ID: ' + insErr.message);
            // chuyển bí mật cũ sang id mới, rồi ghi đè nếu admin nhập mật khẩu mới
            const {error:cpErr} = await db.rpc('sao_chep_secret', { p_from: originalId, p_to: form.id });
            if (cpErr) throw new Error('Lỗi chuyển mật khẩu: ' + cpErr.message);
            if (form.password) {
              const {error:pErr} = await db.rpc('dat_mat_khau', { p_id: form.id, p_pw: form.password });
              if (pErr) throw new Error('Lỗi đặt mật khẩu: ' + pErr.message);
            }
            await db.from('cong_viec_duoc_giao').update({assignee_id: form.id}).eq('assignee_id', originalId);
            await db.from('cong_viec_duoc_giao').update({updated_by: form.id}).eq('updated_by', originalId);
            await db.from('tien_do').update({updated_by_id: form.id}).eq('updated_by_id', originalId);
            const {error:delErr} = await db.from('nhan_vien').delete().eq('id', originalId); // cascade xoá secret cũ
            if (delErr) throw new Error('Lỗi xóa ID cũ: ' + delErr.message);
            setUsers(us => us.map(u => u.id === originalId ? {...u, ...data, id: form.id} : u));
            setTasks(ts => ts.map(t => {
              let updated = {...t};
              if (t.assignee_id === originalId) { updated.assignee_id = form.id; updated.assignee = {...t.assignee,...data,id:form.id}; }
              return updated;
            }));
            if (me.id === originalId) setMe(prev => ({...prev, ...data, id: form.id}));
          } else {
            await apiUpdateUser(originalId, data);                       // data KHÔNG còn password
            if (form.password) {
              const {error:pErr} = await db.rpc('dat_mat_khau', { p_id: originalId, p_pw: form.password });
              if (pErr) throw new Error('Lỗi đổi mật khẩu: ' + pErr.message);
            }
            setUsers(us => us.map(u => u.id === originalId ? {...u,...data} : u));
            setTasks(ts => ts.map(t => t.assignee_id === originalId ? {...t, assignee:{...t.assignee,...data}} : t));
            if (me.id === originalId) setMe(prev => ({...prev, ...data}));
          }
          toast('Đã cập nhật nhân viên!');
```
(Đã bỏ 2 dòng cũ `if (form.password) data.password = form.password;` và `if (form.password) newUser.password = form.password;`.)

- [ ] **Step 5: Kiểm biên dịch + lint**

Run: `npm run build`
Expected: build thành công, không còn tham chiếu `data.password`/`newUser.password`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(bảo mật): TaskApp ghi mật khẩu qua RPC dat_mat_khau, xoá apiLogin chết"
```

---

### Task 7: Build, deploy, kiểm đăng nhập (checkpoint — RLS còn mở)

**Files:** (không sửa code)

- [ ] **Step 1: Build + đồng bộ bundle deploy**

Run:
```bash
npm run build
```
Rồi copy `dist/*` vào `deploy-netlify/` theo quy ước dự án (ghi đè assets + index.html).

- [ ] **Step 2: Kiểm tại preview trước khi deploy thật**

Chạy dev/preview, đăng nhập bằng 1 tài khoản thật:
- Đăng nhập thành công, vào `/home`.
- Mở DevTools → Application → Local Storage: có key `qlsx_session` (chứa token+user), **KHÔNG còn** lưu mật khẩu thô.
- Tải lại trang → vẫn đăng nhập (auto-login từ token).
- Mở 1 module bất kỳ (vd Kho) → dữ liệu tải bình thường (query mang token, RLS còn mở nên chắc chắn chạy).

Expected: tất cả OK. Nếu đăng nhập lỗi `401/JWSError` → ký JWT sai (quay lại Task 2 Step 5 / Fallback).

- [ ] **Step 3: Deploy** — user kéo-thả `deploy-netlify/` lên Netlify. Kiểm đăng nhập trên bản live.

- [ ] **Step 4: Commit bundle**

```bash
git add deploy-netlify dist
git commit -m "build(bảo mật): bundle đăng nhập qua token (RLS chưa siết)"
```

> **Rollback Phase 2:** revert 4 commit JS + deploy lại bundle cũ. Dữ liệu chưa bị ảnh hưởng (RLS vẫn mở).

---

## PHASE 3 — Siết RLS (khoá cửa thật sự)

### Task 8: RLS lockdown + thu hồi anon + xoá cột mật khẩu

**Files:**
- Create: `sql/security_3_rls_lockdown.sql`

- [ ] **Step 1: Viết SQL**

```sql
-- sql/security_3_rls_lockdown.sql

-- 1) Mọi bảng public: chỉ authenticated toàn quyền; anon bị chặn.
--    Ngoại lệ: nhan_vien (ghi=Admin), nhan_vien_secret (không đụng — đã khoá tuyệt đối).
do $$
declare r record; drops text;
begin
  for r in
    select tablename from pg_tables
    where schemaname='public' and tablename <> 'nhan_vien_secret'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, r.tablename),' '),'')
      into drops from pg_policies where schemaname='public' and tablename=r.tablename;
    if drops <> '' then execute drops; end if;

    if r.tablename='nhan_vien' then
      execute 'create policy nv_sel on public.nhan_vien for select to authenticated using (true)';
      execute 'create policy nv_ins on public.nhan_vien for insert to authenticated with check ((auth.jwt()->>''nv_role'')=''ADMIN'')';
      execute 'create policy nv_upd on public.nhan_vien for update to authenticated using ((auth.jwt()->>''nv_role'')=''ADMIN'') with check ((auth.jwt()->>''nv_role'')=''ADMIN'')';
      execute 'create policy nv_del on public.nhan_vien for delete to authenticated using ((auth.jwt()->>''nv_role'')=''ADMIN'')';
    else
      execute format('create policy auth_all on public.%I for all to authenticated using (true) with check (true);', r.tablename);
    end if;
  end loop;
end $$;

-- 2) Thu hồi mọi quyền của anon (trừ hàm dang_nhap). Cấp lại quyền cho authenticated.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant execute on function public.dang_nhap(text,text,boolean) to anon;

grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 3) Xoá cột mật khẩu thô (đã có bản băm ở nhan_vien_secret)
alter table public.nhan_vien drop column if exists password;
```

- [ ] **Step 2: Chạy trong SQL Editor** — Run toàn bộ. Expected: không lỗi (`DO`, `REVOKE`, `GRANT`, `ALTER TABLE` đều Success).

- [ ] **Step 3: Kiểm chính sách đã áp**

Run:
```sql
select tablename, count(*) as so_policy from pg_policies where schemaname='public' group by tablename order by tablename;
select has_column_privilege('anon','public.nhan_vien','select') as anon_doc_nhanvien; -- kỳ vọng false
```
Expected: `nhan_vien` có 4 policy; `anon_doc_nhanvien = false`; cột `password` đã biến mất (`\d nhan_vien` không còn).

- [ ] **Step 4: Commit**

```bash
git add sql/security_3_rls_lockdown.sql
git commit -m "feat(bảo mật): siết RLS toàn bộ, thu hồi anon, xoá cột mật khẩu thô"
```

> **Rollback khẩn Task 8 (nếu 1 bảng chặn nhầm):**
> ```sql
> -- mở tạm đúng bảng đang lỗi để không gián đoạn, sửa xong siết lại:
> create policy tmp_open on public.<ten_bang> for all to authenticated using (true) with check (true);
> ```
> Không mất dữ liệu. Nếu cần khôi phục anon tạm thời: `grant select on public.<ten_bang> to anon;` (chỉ khi bất khả kháng).

---

### Task 9: Kiểm thử bảo mật cuối cùng (Definition of Done)

**Files:** (không sửa code — đây là nghiệm thu)

- [ ] **Step 1: Luồng người dùng thật**

Trên bản live: đăng nhập **Admin** và **1 nhân viên thường**. Với mỗi vai trò, mở lần lượt **Kho / Công việc / CSKH / Bảo hành / Chất lượng** và thử thao tác CRUD tiêu biểu (thêm/sửa/xoá 1 bản ghi thử). Expected: chạy đúng như trước khi đổi.

- [ ] **Step 2: TẤN CÔNG THỬ bằng anon key (phải bị chặn)**

Mở 1 tab ẩn danh (chưa đăng nhập), vào Console, chạy (thay `<ANON_KEY>` lấy từ bundle):
```js
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const c = createClient('https://ngwkzicrnspeggunsblr.supabase.co', '<ANON_KEY>');
console.log('nhan_vien:', await c.from('nhan_vien').select('*'));      // kỳ vọng: data rỗng/null + error permission
console.log('inventory:', await c.from('inventory_stock').select('*')); // kỳ vọng: bị chặn
console.log('rpc:', await c.rpc('get_stock_summary'));                   // kỳ vọng: bị chặn (anon không execute)
```
Expected: **không lấy được dòng nào**; chỉ `c.rpc('dang_nhap', {...})` với đúng mật khẩu mới trả token.

- [ ] **Step 3: Nhân viên thường không leo thang quyền**

Đăng nhập NV thường, trong Console (token của chính họ đang được app dùng) thử:
```js
// dùng client của app (đã đăng nhập) trong Console trang:
await window.__supabaseTest?.(); // hoặc thao tác qua Uez; kiểm bằng gọi trực tiếp nếu truy cập được client
```
Kiểm tối thiểu: NV thường **không** sửa được `nhan_vien` của người khác (RLS `nv_upd` chỉ Admin) và **không** đọc được `nhan_vien_secret`. Nếu không tiện gọi client trong Console, xác nhận gián tiếp: tài khoản NV thường không thấy chức năng quản lý NV (UI) và mọi update role bị RLS chặn (thử bằng tài khoản test).

- [ ] **Step 4: Tích hợp ngầm vẫn chạy**

- Kích 1 workflow n8n có ghi Supabase (vd đồng bộ xử lý bảo hành) → vẫn thành công (service_role bỏ qua RLS).
- Kiểm cron nhắc việc vẫn bắn (xem log n8n/`cong_viec_nhac_log`).
- CSKH realtime (nếu dùng) vẫn cập nhật khi đã đăng nhập.

- [ ] **Step 5: Quản lý nhân viên (Admin)**

Đăng nhập Admin → Quản lý nhân viên: **tạo NV mới có mật khẩu**, **đổi mật khẩu 1 NV**, **đổi mã NV**. Sau mỗi thao tác, đăng xuất và **đăng nhập lại bằng tài khoản vừa tạo/đổi** → thành công. Xác nhận `dat_mat_khau`/`sao_chep_secret` hoạt động.

- [ ] **Step 6: Token hết hạn**

Đặt tạm TTL ngắn để kiểm (tuỳ chọn): sau khi token hết hạn, request trả 401 → app đưa về màn đăng nhập, đăng nhập lại OK.

- [ ] **Step 7: Chốt**

Khi tất cả bước trên đạt: coi như **đã xử lý bảo mật**. Ghi nhận kết quả (ảnh chụp bước 2 cho thấy anon bị chặn) làm bằng chứng.

---

## Fallback: nếu ký JWT bằng pgcrypto không được PostgREST chấp nhận (Task 2 Step 5 trả 401)

Thay hàm ký bằng **Supabase Edge Function** (Deno), giữ nguyên payload & phần còn lại:
1. `supabase functions new dang-nhap` (hoặc tạo trong Dashboard → Edge Functions).
2. Trong function: nhận `{id, pw, remember}`, dùng service_role client kiểm `nhan_vien_secret` (hoặc gọi 1 RPC nội bộ `kiem_mat_khau(id,pw)` trả boolean), rồi ký JWT bằng thư viện `djwt`/`jose` với `Deno.env.get('SUPABASE_JWT_SECRET')`, trả `{token, exp, user}`.
3. `AuthContext.login` đổi từ `supabase.rpc('dang_nhap', ...)` sang `supabase.functions.invoke('dang-nhap', { body: {...} })`. Phần client/RLS/authToken **không đổi**.

---

## Self-Review (đã rà)

- **Phủ spec:** §4.1 băm/tách MK → Task 1; §4.2 hàm đăng nhập+JWT → Task 2; §4.3 accessToken → Task 4; §4.4 AuthContext → Task 5; §4.5 RLS → Task 8; §4.6 quản lý NV qua RPC → Task 6; §4.7 apiLogin phụ → Task 6 Step 1; §5 n8n/cron → Task 9 Step 4; §6 triển khai 3 bậc → Phase 1/2/3; §8 kiểm thử → Task 9. Không thiếu mục.
- **Không placeholder:** mọi Step có SQL/JS/commands cụ thể.
- **Nhất quán tên:** `dang_nhap`, `dat_mat_khau`, `sao_chep_secret`, `_sign_jwt`, `_b64url`, `authToken.js` (`isSessionValid/loadSession/setSession/clearSession/getAccessToken/getSessionUser`), key `qlsx_session` — dùng đồng nhất giữa các task.
