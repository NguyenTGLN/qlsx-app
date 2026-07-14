# Thiết kế: Khoá bảo mật QLSX (RLS + đăng nhập có token)

- **Ngày:** 2026-07-10
- **Trạng thái:** Đã duyệt thiết kế — chờ viết kế hoạch thực thi
- **Mức bảo mật đã chọn:** Chặn người ngoài tuyệt đối + khoá ghi bảng nhân viên (chứa phân quyền)

---

## 1. Bối cảnh & vấn đề

App QLSX là web tĩnh (Vite/React) deploy lên Netlify, backend là Supabase, gọi trực tiếp
từ trình duyệt bằng **anon key**. Hiện trạng:

1. **anon key nằm công khai** trong bundle JS (`deploy-netlify/assets/index-*.js`) — ai mở
   link cũng lấy được.
2. **Mọi bảng đang mở toàn quyền**: RLS bật nhưng policy đều là `USING (true)` /
   "Allow public read/insert/update/delete". → Ai có anon key đều đọc/ghi/xoá được mọi bảng.
3. **Đăng nhập & phân quyền chạy hoàn toàn phía client**: `AuthContext` đăng nhập bằng
   `supabase.from('nhan_vien').select('*').eq('password', pw)` — **mật khẩu lưu chữ thô**.
   Vì login chạy được bằng anon key ⇒ bảng `nhan_vien` đang cho đọc công khai ⇒ **bất kỳ ai
   cũng dump được toàn bộ nhân viên + mật khẩu thô**, và có thể tự `update role='ADMIN'`.
4. Hệ RBAC (`permRegistry.js`, ma trận tick theo tab) chỉ **ẩn nút trên UI**, không bảo vệ
   dữ liệu ở tầng DB.

**Kết luận rủi ro:** lỗ hổng lộ/phá dữ liệu ở mức **rất cao** và đã tồn tại sẵn (không do
Netlify). DDoS không phải mối lo chính.

## 2. Mục tiêu & phi mục tiêu

**Mục tiêu**
- Người ngoài (chỉ có anon key, chưa đăng nhập) **không làm được gì** với DB ngoài việc gọi
  đúng một hàm đăng nhập.
- Mật khẩu **băm** (bcrypt), **không client nào đọc được** — kể cả nhân viên đã đăng nhập.
- Nhân viên thường **không tự phong Admin**, không sửa được bảng nhân viên/phân quyền.
- **Không sửa 253 chỗ gọi query** hiện có; **không làm hỏng luồng nào**; app vẫn nhanh.
- Không phá tích hợp ngầm: **n8n** (service_role) và **cron nhắc việc** (`security definer`).

**Phi mục tiêu (giai đoạn này)**
- Không chép toàn bộ ma trận phân quyền theo tab xuống RLS (chống cả nhân viên nội bộ dùng
  console) — đây là mức cao hơn, nhiều rủi ro hỏng luồng, để lại sau nếu cần.
- Không đổi sang Supabase Auth (email/mật khẩu) — sẽ làm phức tạp luồng quản lý nhân viên.
- Không chống DDoS chuyên sâu (dựa vào lớp CDN của Netlify + spending cap Supabase).

## 3. Nguyên tắc kiến trúc (một câu)

> anon key **chỉ** gọi được đúng hàm `dang_nhap()`. Đăng nhập xong nhân viên nhận **token
> JWT có hạn**; client tự gắn token vào **mọi** request; RLS chỉ mở cửa cho token hợp lệ.

Vé (JWT) được Postgres kiểm **ngay tại chỗ** (không thêm round-trip) ⇒ hiệu năng như cũ.
Toàn bộ thay đổi phía web gói trong **2 file** (`src/lib/supabase.js`, `src/lib/AuthContext.jsx`)
+ một ít ở luồng quản lý nhân viên; phần còn lại là **SQL dán vào Supabase**.

## 4. Các thành phần

### 4.1 Tách & băm mật khẩu
- Tạo bảng bí mật `nhan_vien_secret(nv_id text PK/FK → nhan_vien.id, password_hash text)`.
- Băm bằng `pgcrypto`: `crypt(pw, gen_salt('bf'))`; kiểm bằng `password_hash = crypt(pw, password_hash)`.
- Backfill: hash toàn bộ `nhan_vien.password` hiện có sang `nhan_vien_secret`, rồi **xoá cột
  `password`** khỏi `nhan_vien` (sau khi luồng mới chạy ổn).
- **RLS bảng bí mật: KHÔNG policy nào** ⇒ anon & authenticated đều bị chặn tuyệt đối. Chỉ các
  hàm `security definer` (chạy bằng quyền owner) mới đọc/ghi được.
- Lợi ích phụ: sau khi tách, `select('*')` trên `nhan_vien` (TaskApp quản lý NV) **không còn
  trả về mật khẩu** ⇒ hết lộ, mà **không phải sửa** các câu `select('*')` đó.

### 4.2 Hàm đăng nhập `dang_nhap(p_id, p_pw)` (SECURITY DEFINER)
- Tra `nhan_vien` theo `id` (không phân biệt hoa/thường), join `nhan_vien_secret`, kiểm bcrypt.
- Sai ⇒ trả lỗi chung ("Mã nhân viên hoặc mật khẩu không đúng").
- Đúng ⇒ **phát JWT** ký HS256 bằng **JWT secret của dự án**, payload:
  ```json
  { "role": "authenticated", "sub": "<ma_nv>", "nv_id": "<ma_nv>",
    "nv_role": "ADMIN|AGENT", "name": "<ten>", "iat": <now>, "exp": <now + hạn> }
  ```
  Trả về `{ token, exp, user }` (user KHÔNG kèm mật khẩu).
- **Ký JWT bằng `pgcrypto`** (`hmac(signing_input, secret, 'sha256')` + base64url) — **không
  cần extension `pgjwt`, không cần Edge Function**. JWT secret cất trong **Supabase Vault**
  (`vault.secrets`), hàm đọc từ Vault khi ký.
- Cấp quyền: `GRANT EXECUTE ON FUNCTION dang_nhap TO anon;` (đây là thứ **duy nhất** anon gọi được).
- **Hạn token:** đăng nhập thường ~12 giờ; "Ghi nhớ đăng nhập" ~7 ngày (cân bằng tiện/an toàn).

> **Kiểm tra khả thi ở Bước 1 thực thi:** xác nhận ký HMAC-SHA256 bằng pgcrypto tạo JWT được
> PostgREST chấp nhận. Nếu môi trường vướng, phương án dự phòng là **Supabase Edge Function**
> ký JWT (cùng payload) — kiến trúc phía trên không đổi.

### 4.3 Client — `src/lib/supabase.js`
- Đổi khởi tạo sang dùng option `accessToken` (đã có ở `@supabase/supabase-js` 2.100):
  ```js
  createClient(url, anonKey, { accessToken: async () => getStoredToken() })
  ```
  - Chưa đăng nhập ⇒ `getStoredToken()` trả `null` ⇒ request đi bằng anon key (chỉ gọi được
    `dang_nhap`).
  - Đã đăng nhập ⇒ trả JWT ⇒ **toàn bộ 253 câu query tự mang token**, không sửa gì.
- Giữ nguyên `customFetch` (timeout), `fetchAllRows`, `fetchPageRows`, `sqlPackHint`.

### 4.4 `src/lib/AuthContext.jsx`
- `login(id, pw)` → gọi `supabase.rpc('dang_nhap', {...})`; lưu `token` + `user` vào state và
  localStorage. **Bỏ hẳn việc lưu mật khẩu thô** (điểm yếu hiện tại).
- Auto-login: lưu **cả `token` lẫn object `user`** (không nhạy cảm) trong localStorage. Khi tải
  lại: nếu token còn hạn (so `exp` với hiện tại) ⇒ khôi phục `user` từ object đã lưu (không cần
  giải mã JWT phía client). Hết hạn ⇒ xoá sạch, về màn đăng nhập.
- `logout()`: xoá token + các key localStorage cũ.
- Giữ nguyên toàn bộ API context (`user`, `perms`, `hasPerm`, `hasModule`, `useTabPerm`…) ⇒
  các nơi tiêu thụ không phải sửa.

### 4.5 RLS — chính sách mới (thay cho `USING(true)`)
| Nhóm bảng | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| **Bảng dữ liệu** (kho, sản xuất, task, CSKH, bảo hành, chất lượng, zalo, …) | đã đăng nhập (`authenticated`) | đã đăng nhập (`authenticated`) |
| **`nhan_vien`** | đã đăng nhập (để hiện tên/vai trò) | **chỉ Admin** (`jwt.nv_role = 'ADMIN'`) |
| **`nhan_vien_secret`** | không ai | không ai (chỉ hàm definer) |

- Điều kiện: `authenticated` ⇒ `auth.role() = 'authenticated'`; Admin ⇒
  `auth.jwt() ->> 'nv_role' = 'ADMIN'`.
- Defense-in-depth: `REVOKE` mọi quyền bảng của `anon` (chỉ chừa EXECUTE `dang_nhap`).
- Vì phân quyền lưu trong cột `nhan_vien.permissions`, khoá ghi `nhan_vien` **đã bảo vệ luôn
  phân quyền** — không có bảng phân quyền riêng cần khoá thêm.

### 4.6 Luồng quản lý nhân viên (Admin) — điều chỉnh tối thiểu
Vì mật khẩu chuyển sang `nhan_vien_secret`, các thao tác ghi mật khẩu phải qua RPC
`security definer` (admin-only, tự kiểm `nv_role='ADMIN'`):
- `tao_nhan_vien(...)`, `doi_mat_khau(p_id, p_pw)`, và xử lý **đổi mã NV** (di chuyển kèm bản
  ghi secret) trong `TaskApp` (`apiCreateUser`/`apiUpdateUser` + nhánh đổi id ~dòng 1177–1188).
- Ghi các cột **không nhạy cảm** của `nhan_vien` (name, role, permissions…) vẫn qua
  `update/insert` bình thường — RLS admin-only lo phần chặn.

### 4.7 Đường đăng nhập phụ trong TaskApp
`TaskApp.jsx` `apiLogin` (~dòng 165) hiện **chỉ kiểm id tồn tại, không kiểm mật khẩu**. Gộp
về `dang_nhap()` an toàn (hoặc dùng luôn phiên từ `AuthContext`).

## 5. Bảo toàn tích hợp ngoài (đã xác minh)
- **n8n**: credential "Supabase account 2" dùng **Service Role Secret** (đã xác nhận qua ảnh
  cấu hình). service_role **bỏ qua RLS** ⇒ mọi workflow n8n **không bị ảnh hưởng**.
- **Cron nhắc việc**: các hàm `fn_nhac_viec_*` là `SECURITY DEFINER` + `pg_net`, chạy bằng
  quyền owner ⇒ **bỏ qua RLS**, không ảnh hưởng.

## 6. Kế hoạch triển khai theo bậc thang (không downtime, có rollback)
- **Bước 1 — Chuẩn bị (không đổi hành vi):** tạo `nhan_vien_secret`, bật `pgcrypto`, cất JWT
  secret vào Vault, backfill hash. Kiểm hàm ký JWT chạy được. App vẫn chạy y hệt (RLS còn mở).
  *Rollback:* drop bảng secret.
- **Bước 2 — Đổi đăng nhập (RLS vẫn mở):** tạo `dang_nhap()` + RPC admin; sửa `supabase.js` +
  `AuthContext.jsx` + luồng quản lý NV/TaskApp; build → cập nhật `deploy-netlify` → deploy.
  Kiểm đăng nhập Admin + NV thường chạy tốt. Vì RLS còn mở nên **không thể hỏng dữ liệu**.
  *Rollback:* revert 2 file JS, deploy lại bản cũ.
- **Bước 3 — Khoá cửa (siết RLS):** chạy SQL thay policy `USING(true)` bằng policy mới; revoke
  quyền anon; xoá cột `password`. *Rollback khẩn:* dán lại policy `USING(true)` cho bảng lỗi
  (1 phút, không mất dữ liệu), sửa xong siết lại.

## 7. Hiệu năng
- JWT kiểm tại Postgres, **không thêm round-trip** ⇒ tốc độ query như cũ.
- Chỉ *đăng nhập* tốn thêm ~50–100ms (bcrypt) — không đáng kể.

## 8. Kiểm thử (Definition of Done)
1. Đăng nhập Admin + NV thường: vào lần lượt **Kho / Công việc / CSKH / Bảo hành / Chất lượng**,
   kiểm CRUD chạy đúng như trước.
2. **Tấn công thử bằng anon key qua console phải bị chặn** (`select('*')` trên `nhan_vien` và
   các bảng ⇒ 0 dòng / lỗi permission).
3. NV thường thử `update nhan_vien role='ADMIN'` ⇒ **bị chặn**. Không đọc được `nhan_vien_secret`.
4. n8n chạy 1 workflow ghi (vd đồng bộ bảo hành) ⇒ vẫn thành công.
5. Cron nhắc việc vẫn bắn (kiểm log).
6. Token hết hạn ⇒ tự về màn đăng nhập, đăng nhập lại OK.

## 9. Rủi ro & giảm thiểu
| Rủi ro | Giảm thiểu |
|---|---|
| Ký JWT bằng pgcrypto không tương thích môi trường | Kiểm ở Bước 1; dự phòng Edge Function ký JWT |
| Siết RLS chặn nhầm một bảng đang dùng | Bậc thang: chỉ siết ở Bước 3; rollback 1 dòng/bảng |
| Luồng quản lý NV (đổi mã/mật khẩu) hỏng | Chuyển qua RPC + test kỹ từng thao tác ở Bước 2 |
| JWT dài hạn không thu hồi được (NV nghỉ việc vẫn còn token tới khi hết hạn) | Hạn ngắn hợp lý (12h/7 ngày); tuỳ chọn tương lai: `token_version` trên nhan_vien |
| Token bị đánh cắp nếu có XSS | Vẫn **an toàn hơn** lưu mật khẩu thô hiện tại; cân nhắc rút ngắn hạn sau |

## 10. Phạm vi thay đổi file (dự kiến)
- **SQL mới** (dán vào Supabase): `nhan_vien_secret` + backfill; hàm `dang_nhap` + RPC admin;
  policy RLS mới cho tất cả bảng; revoke anon. (Đặt trong `sql/` theo quy ước dự án.)
- **JS:** `src/lib/supabase.js`, `src/lib/AuthContext.jsx`, `src/pages/tasks/TaskApp.jsx`
  (luồng quản lý NV + apiLogin). Có thể thêm helper giải mã JWT.
- **Không đụng:** 253 chỗ gọi `supabase.from(...)` ở 33 file khác.
