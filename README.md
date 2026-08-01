# qlsx-app — Sản xuất, Kho, CSKH, Bảo hành

App nội bộ lớn nhất trong hệ thống, **có đăng nhập**. Gồm nhiều phân hệ: giao việc,
sản xuất, kho, CSKH/Zalo, bảo hành, chất lượng, chấm công, KPI.

*Cập nhật 28/07/2026 — mô tả đúng bản đang chạy.*

---

## Thông tin cơ bản

| | |
|---|---|
| Đang chạy | `amazing-frangollo-eb56a9.netlify.app` |
| Deploy | Netlify **Drop** — kéo-thả thư mục **`dist`** |
| Công nghệ | React + Vite + React Router + supabase-js · Vitest (658 test) |
| Khoá | `sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX` *(trong `.env`)* |
| Git | **Có kèm lịch sử** — `git log`, `git diff`, `git revert` dùng được |

Đã đối chiếu MD5 `dist/index.html` với trang đang chạy ngày 28/07/2026 — **khớp tuyệt đối**.

```bash
npm install     # node_modules không lưu kèm, tái tạo từ package-lock.json
npx vitest run  # 658 test, phải PASS hết
npm run build   # ra thư mục dist
```

---

## Cấu hình deploy trên Netlify — đọc kỹ, có bẫy

### Cách deploy đang dùng: KÉO-THẢ

Site từng được nối GitHub để tự build *(xem `netlify.toml` ở gốc dự án)*, nhưng phát sinh
nhiều vấn đề nên **đã chuyển hẳn sang kéo-thả thủ công** cho đơn giản.

Hệ quả: **không có bước build trên Netlify**. Khoá được nhúng cứng vào bundle lúc
`npm run build` chạy **trên máy**. Muốn đổi khoá: sửa `.env` → `npm run build` →
kéo-thả `dist` lên lại.

### 🔴 Cái bẫy: mã đã commit vẫn mang khoá CHẾT

| | Khoá dự phòng trong `src/lib/supabase.js` | Route `/tv` |
|---|---|---|
| **Bản đã commit** *(GitHub)* | 🔴 JWT cũ — **đã bị vô hiệu 28/07/2026** | 🔴 còn |
| Bản trên máy *(đang chạy)* | ✅ `sb_publishable_...` | ✅ đã gỡ |

7 file sửa ngày 28/07 **chưa commit**. Nếu kết nối tự động build còn sống, **chỉ cần một
cú push bất kỳ** là Netlify build mã cũ → app dùng khoá đã chết → **không ai đăng nhập được**,
và `/tv` quay lại.

### Lưới an toàn: biến môi trường

Netlify → Site configuration → Environment variables → **Add a single variable**:

| Trường | Điền |
|---|---|
| **Key** | `VITE_SUPABASE_ANON_KEY` |
| **Values** | **Same value for all deploy contexts** |
| **Value** | `sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX` |
| **Secret** | ⬜ **để trống** |

Biến môi trường **thắng** giá trị dự phòng trong mã. Có nó thì dù Netlify lỡ build từ mã
cũ, app vẫn ra khoá đúng. Không ảnh hưởng gì tới việc kéo-thả — biến chỉ có tác dụng khi
có bước build.

#### ⬜ Vì sao KHÔNG tick "Contains secret values"

Khoá này **bắt buộc phải nằm trong bundle** để trình duyệt gọi được Supabase — đó là mục
đích của tiền tố `VITE_`. Tick vào là Netlify bật quét bí mật trong kết quả build, thấy giá
trị đó trong `dist/assets/*.js` và **cho build thất bại**.

Về bản chất nó cũng **không phải bí mật**: khoá publishable nằm sẵn trong mã nguồn mọi
trang, Ctrl+U là thấy. Lớp bảo vệ là **RLS**, không phải việc giấu khoá. Cùng khoá đó,
sáng 28/07 mở được 47 bảng, chiều cùng ngày đọc được **0 dòng ở mọi bảng**.

Ô "Secret" chỉ dành cho khoá thật sự bí mật chạy phía máy chủ — `sb_secret_...`, token API
bên thứ ba, mật khẩu database. Và khi đó **tuyệt đối không đặt tên có tiền tố `VITE_`**.

#### Vì sao chọn "Same value for all deploy contexts"

Chỉ có **một** Supabase duy nhất, một khoá duy nhất. Chia giá trị theo ngữ cảnh
*(Production / Deploy Preview / Branch / Local)* là thêm phức tạp mà không được gì.

Bẫy nếu chọn nhầm: điền giá trị cho mỗi Production thì các ngữ cảnh còn lại **không có
giá trị**, build của chúng rơi về khoá đã chết trong mã — đúng bằng lỗ hổng đang muốn bịt,
chỉ khác là chỉ lộ ra khi có Pull Request.

Tuỳ chọn này chỉ có ích khi nào có **Supabase riêng cho thử nghiệm**, để lập trình viên
thử không đụng dữ liệu khách hàng thật.

### ✅ Đã xác nhận: KHÔNG còn nối GitHub

Chủ dự án xác nhận ngày 28/07/2026 rằng site **không còn kết nối repo**. Nghĩa là push mã
lên **không kích hoạt deploy nào** — deploy chỉ xảy ra khi có người chủ động kéo-thả.

Vì vậy cái bẫy ở trên **hiện không thể xảy ra**, và cũng **không cần** đặt biến môi trường.

⚠️ Nhưng `netlify.toml` vẫn còn trong repo. Nếu sau này có ai nối lại GitHub, phải nhớ
thêm biến `VITE_SUPABASE_ANON_KEY` = khoá publishable ở trên — nếu không, build sẽ lấy giá
trị dự phòng trong mã đã commit.

---

## 🔴 7 file đang sửa, CHƯA COMMIT

```bash
git status --short
```

| File | Sửa gì |
|---|---|
| `.env` | Khoá JWT cũ → publishable |
| `src/App.jsx` | **Gỡ route `/tv`** |
| `src/lib/supabase.js` | Đổi khoá dự phòng |
| `src/pages/cskh/ZaloKpiTab.jsx` | Realtime cập nhật cục bộ — **giảm ~198 MB/giờ** |
| `src/pages/cskh/CskhApp.jsx` | Thu hẹp `select` trên `data_links`: 15 MB → 1,1 MB mỗi lần |
| `src/pages/tasks/TaskApp.jsx` | Bỏ 11/12 lần `loadAll()` thừa mỗi giờ + realtime bù |
| `scripts/import-cham-cong.mjs` | Nhận đường dẫn Excel qua tham số; SQL sinh ra nay **xoá sạch cả kỳ** trước khi nạp lại |

Chủ dự án đã duyệt **commit chung cả 7 file**.

👉 **Hướng dẫn đầy đủ cho người/agent hoàn tất: [`BAN-GIAO-CHO-AGENT.md`](BAN-GIAO-CHO-AGENT.md)**
— gồm cả việc xoá 6 thư mục/file build cũ còn chứa **khoá đã bị vô hiệu**, và xoá hẳn
`src/pages/TvDashboard.jsx`.

Giải thích chi tiết từng thay đổi hiệu năng: `../_SQL-VA-BAO-CAO/_TRIEN-KHAI/qlsx-app/DOC-TRUOC-KHI-COMMIT.md`.

---

## Đăng nhập hoạt động thế nào — mọi màn hình đều phụ thuộc

1. Gọi RPC **`dang_nhap(p_id, p_pw, p_remember)`** — hàm `SECURITY DEFINER`
2. Hàm so mật khẩu bên trong database, trả về **JWT** có claim `role: authenticated`
3. `src/lib/supabase.js` dùng tuỳ chọn **`accessToken`** để tự gắn JWT vào **mọi** request

```javascript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Chưa đăng nhập → trả anon key (chỉ gọi được RPC dang_nhap).
  // Đã đăng nhập → trả JWT ⇒ toàn bộ query tự mang token.
  accessToken: async () => getAccessToken() || supabaseAnonKey,
  global: { fetch: customFetch }
});
```

**Toàn bộ bảng trong database chỉ mở cho `authenticated`.** Chưa đăng nhập thì mọi truy vấn
trả 0 dòng. Cơ chế token này hỏng là **cả app trắng**.

---

## 🔴 Những gì tuyệt đối không được làm

**1. Đừng bỏ tuỳ chọn `accessToken` trong `src/lib/supabase.js`.**
Bỏ là mọi truy vấn đi bằng khoá công khai ⇒ 0 dòng ⇒ app trắng hoàn toàn.

**2. Đừng thêm lại route nào chạy KHÔNG đăng nhập mà có đọc dữ liệu.**
Route `/tv` cũ đọc thẳng `nhan_vien` + `cong_viec_duoc_giao` nên **buộc hai bảng đó phải
mở cho vai trò công khai**. Hậu quả đo được: bất kỳ ai lấy khoá trong mã nguồn đều đọc
được 16 nhân viên *(kèm email, quyền hạn)* và 848 công việc nội bộ — **và sửa/xoá được**.
Nguy hiểm nhất: sửa cột `permissions` của `nhan_vien` là **tự nâng quyền cho mình**.

Cần màn hình hiển thị không đăng nhập ⇒ viết hàm RPC `SECURITY DEFINER` chỉ trả đúng phần
cần hiện. **Không bao giờ mở lại quyền cho vai trò công khai.**
Mẫu tham khảo: `_SQL-VA-BAO-CAO/_TRIEN-KHAI/rpc-trang-cong-khai/`.

*(File `src/pages/TvDashboard.jsx` còn nằm lại nhưng không được nạp. Xoá hẳn cũng được.)*

**3. Đừng gọi lại toàn bảng trong callback realtime.**
`ZaloKpiTab.jsx` từng đăng ký realtime trên `zalo_conversations` rồi gọi thẳng
`fetchRecords()` — mỗi sự kiện kéo về **9,9 MB**. Thao tác đánh dấu 50 dòng sinh 50 sự
kiện ⇒ **~600 request / 495 MB trong vài giây**, đủ chiếm hết pool kết nối
*(`max_connections = 60`)*. Nay cập nhật cục bộ từ `payload`.

**4. Đừng dùng `select('*')` trên bảng lớn.**
`data_links` là 4.359 byte/dòng × 3.734 dòng = **15 MB** mỗi lần mở dashboard.
`CskhApp.jsx` có sẵn `COT_THEO_BANG` — thêm cột cần vào đó.

**5. Đừng thêm `setInterval` gọi `loadAll()`.**
`TaskApp.jsx` từng làm vậy mỗi 5 phút *(12 lượt/giờ, 4 bảng, đều `select('*')`)* nhưng kết
quả **chỉ dùng khi sang ngày mới**. Nay có realtime bù, nhanh hơn mức 5 phút cũ.

---

## Phân hệ và đường dẫn

| Đường dẫn | Phân hệ | Quyền cần |
|---|---|---|
| `/home` | Trang chủ | đăng nhập |
| `/admin` | Tổng quan | `access_overview` |
| `/tasks/*` | Giao việc, cải tiến, KPI | `access_tasks` |
| `/worker` · `/worker/input/:id` | Công nhân sản xuất | `access_production` |
| `/kho/*` | Kho hàng | `access_warehouse` |
| `/cskh/*` | CSKH, KPI Zalo | `access_cskh` |
| `/bao-hanh/*` | Bảo hành | `access_warranty` |
| `/quality/*` | Chất lượng | `access_quality` |

Quyền lấy từ cột `permissions` của bảng `nhan_vien`.

---

## Kiểm thử sau khi deploy

**Nhóm A — quyền truy cập:**

- [ ] Đăng nhập → vào được
- [ ] Kho / Sản xuất / KPI / Chấm công → hiện đủ dữ liệu
- [ ] Công việc → hiện đủ, sửa trạng thái lưu được
- [ ] Nhân viên / phân quyền → hiện đủ
- [ ] In chứng từ giao hàng → in được; in lại đúng chứng từ đó → **phải bị chặn**
- [ ] **Chưa đăng nhập** mà mở thẳng một trang bất kỳ → **không thấy dữ liệu nào**

Mục cuối quan trọng nhất: còn thấy dữ liệu nghĩa là còn màn hình bỏ qua đăng nhập chưa gỡ.

**Nhóm B — hiệu năng:**

- [ ] CSKH → Tổng Quan: từng ô số khớp như trước, đổi bộ lọc ngày vẫn đúng
- [ ] KPI Zalo: gửi 1 tin Zalo thật → dòng mới hiện trong vài giây
- [ ] **Chọn 20 hội thoại → "Không cần trả lời"** → Network phải thấy **20 PATCH** và
      **KHÔNG** thấy `zalo_conversations?select=` lặp lại ← *phép thử then chốt*
- [ ] Tasks: tạo việc từ máy khác → máy này thấy trong vài giây
- [ ] Để app mở 30 phút → Network **không** thấy `cong_viec_duoc_giao` tải lại theo chu kỳ

## Hoàn tác

- **Trang web:** Netlify → Deploys → bản trước → **Publish deploy**
- **Mã nguồn:** `git checkout -- <file>` *(chưa commit)* hoặc `git revert <hash>` *(đã commit)*
- **Phía database:** phần hoàn tác cuối mỗi file trong `_SQL-VA-BAO-CAO/_TRIEN-KHAI/` —
  liên quan: `siet-rls/`, `rpc-trang-cong-khai/10-SIET-3-BANG-CUOI.sql`,
  `rpc-trang-cong-khai/12-SIET-PRINT-DOC-GUARD.sql`.
