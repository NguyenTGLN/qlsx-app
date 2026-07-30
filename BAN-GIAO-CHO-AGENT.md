# BÀN GIAO — hoàn tất phần còn lại của `qlsx-app`

**Ngày:** 28/07/2026 · Tài liệu này **tự đủ**, không cần bối cảnh nào khác.
Chủ dự án đã quyết cả 3 điểm còn treo — xem Việc 1, 2, 3.

---

# PHẦN A — BỐI CẢNH BẮT BUỘC ĐỌC TRƯỚC

## A1. Ngày 28/07/2026 toàn bộ Supabase đã bị siết quyền

Trước: **47 bảng để `open_all`** — ai cầm khoá công khai *(nằm sẵn trong mã nguồn mọi
trang, Ctrl+U là thấy)* cũng **đọc, sửa, xoá được toàn bộ dữ liệu**.

Nay: **0 bảng** mở cho vai trò công khai. Mọi bảng chỉ mở cho `authenticated`.

Đo lại lúc viết tài liệu này, bằng chính khoá công khai:

| Bảng | Người ngoài đọc được |
|---|---|
| `nhan_vien` · `cong_viec_duoc_giao` | **0 dòng** |
| `inventory_stock` · `production_orders` | **0 dòng** |
| `cham_cong` · `kpi_chi_tieu` | **0 dòng** |
| `print_doc_guard` · `zalo_conversations` | **0 dòng** |

## A2. Khoá JWT cũ ĐÃ BỊ VÔ HIỆU

Khoá anon cũ *(chuỗi bắt đầu bằng `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.`)* và khoá
`service_role` đã bị thu hồi chiều 28/07 bằng **"Disable JWT-based API keys"** trên Supabase.

Gọi bằng khoá đó nay trả:

```json
{"message":"Legacy API keys are disabled"}
```

**Khoá đúng duy nhất:**

```
sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX
```

> ⚠️ **Bất kỳ bản build nào còn nhúng khoá cũ, khi deploy lên là KHÔNG AI ĐĂNG NHẬP ĐƯỢC.**

## A3. Đăng nhập hoạt động thế nào

1. App gọi RPC **`dang_nhap(p_id, p_pw, p_remember)`** — hàm `SECURITY DEFINER`
2. Hàm so mật khẩu bên trong database, trả **JWT** có claim `role: authenticated`
3. `src/lib/supabase.js` dùng tuỳ chọn **`accessToken`** tự gắn JWT vào **mọi** request

```javascript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => getAccessToken() || supabaseAnonKey,
  global: { fetch: customFetch }
});
```

**Bỏ tuỳ chọn `accessToken` là mọi truy vấn trả 0 dòng ⇒ cả app trắng.** Đừng đụng vào nó.

## A4. Route `/tv` đã bị gỡ — và không được thêm lại

`/tv` chạy **không đăng nhập** nhưng đọc thẳng `nhan_vien` + `cong_viec_duoc_giao`. Vì thế
hai bảng đó buộc phải mở cho vai trò công khai. Hậu quả đo được trước khi gỡ:

- Người ngoài đọc được 16 nhân viên *(kèm email, cột `permissions`)* và 848 công việc nội bộ
- **Sửa và xoá được** cả hai bảng
- Nguy hiểm nhất: sửa cột `permissions` của `nhan_vien` là **tự nâng quyền cho mình**

Chủ dự án đã quyết **bỏ hẳn** màn hình này.

> 🔴 **Cần màn hình hiển thị không đăng nhập ⇒ viết RPC `SECURITY DEFINER` chỉ trả đúng
> phần cần hiện. TUYỆT ĐỐI không mở lại quyền cho vai trò công khai.**
> Mẫu tham khảo: `../_SQL-VA-BAO-CAO/_TRIEN-KHAI/rpc-trang-cong-khai/`

Hiện chỉ còn 2 route công khai, cả hai **không đọc dữ liệu**:

```jsx
<Route path="/" element={<Navigate to="/home" replace />} />
<Route path="/login" element={<Login />} />
```

## A5. Cách deploy: KÉO-THẢ, không build trên Netlify

| | |
|---|---|
| Site | `amazing-frangollo-eb56a9.netlify.app` |
| Cách deploy | Netlify **Drop** — kéo-thả thư mục `dist` |
| Kết nối GitHub | ✅ **Đã gỡ** — chủ dự án xác nhận không còn nối |
| Biến môi trường trên Netlify | Không có biến nào — không cần |

Vì không nối GitHub và không có bước build trên Netlify, **push mã lên không kích hoạt
deploy nào**. Deploy chỉ xảy ra khi có người chủ động kéo-thả.

Khoá được nhúng cứng vào bundle lúc `npm run build` chạy **trên máy**, lấy từ `.env`
*(`.env` bị `.gitignore`, giá trị hiện tại đã đúng)*.

⚠️ Repo vẫn còn `netlify.toml` cấu hình tự build. Nó **hiện không có tác dụng** vì đã gỡ
kết nối. Nhưng nếu sau này ai nối lại GitHub, phải nhớ thêm biến
`VITE_SUPABASE_ANON_KEY` = khoá publishable ở trên, nếu không build sẽ dùng giá trị
dự phòng trong mã.

---

# PHẦN B — CÁC VIỆC CẦN LÀM

## Việc 1 — Commit toàn bộ 7 file

```bash
git status --short
```

| File | Sửa gì |
|---|---|
| `src/App.jsx` | Gỡ route `/tv` + phần nạp `TvDashboard` |
| `src/lib/supabase.js` | Khoá dự phòng → publishable |
| `src/pages/cskh/ZaloKpiTab.jsx` | Realtime cập nhật cục bộ — **giảm ~198 MB/giờ** |
| `src/pages/cskh/CskhApp.jsx` | Thu hẹp `select` trên `data_links`: 15 MB → 1,1 MB/lần |
| `src/pages/tasks/TaskApp.jsx` | Bỏ 11/12 lần `loadAll()` thừa mỗi giờ + realtime bù |
| `README.md` | Tài liệu dự án viết lại |
| `scripts/import-cham-cong.mjs` | ✅ **Chủ dự án đã duyệt commit chung** — xem ghi chú dưới |

```bash
git add -A src/ scripts/import-cham-cong.mjs README.md
git status --short          # xem lại trước khi commit
git commit -m "fix(bao-mat): go route /tv chay khong dang nhap, doi sang publishable key; perf: giam tai Supabase o KPI Zalo, CskhApp, TaskApp"
```

### Ghi chú về `scripts/import-cham-cong.mjs`

Script này **chỉ sinh ra file SQL**, không tự chạy vào database. Hai thay đổi:

1. Nhận đường dẫn file Excel qua tham số dòng lệnh thay vì cố định trong mã
2. SQL sinh ra nay có thêm `delete from cham_cong where ky = '<kỳ>';` **trước khi** nạp lại

> ⚠️ Ai chạy file SQL do script này sinh ra cần biết: nó **xoá sạch cả kỳ** rồi nạp lại.
> Lý do ghi trong chú thích của chính script: chỉ dùng upsert thì người/ngày đã bị gỡ khỏi
> file nguồn *(vd nghỉ việc)* vẫn còn sót lại. Toàn bộ nằm trong một transaction, hỏng thì
> `rollback`.

## Việc 2 — Xoá 6 thứ chứa khoá đã chết 🔴

Đây là **bẫy thật**: kéo-thả nhầm một trong số này là app hỏng ngay, và `/tv` quay lại.

Đã kiểm chứng từng cái đều chứa khoá cũ **và** mã `/tv`:

```
deploy-moi/                          ← thư mục build cũ
deploy-netlify/                      ← thư mục build cũ
dist-SAO-LUU-truoc-khi-doi-khoa/     ← bản sao lưu tạm, không cần nữa
deploy-netlify.zip
deploy.zip
qlsx-deploy-moi.zip
```

Xoá hết. Thư mục `dist/` hiện tại **đã đúng** — giữ lại.

Rồi thêm vào `.gitignore` để không tái diễn:

```gitignore
deploy-moi/
deploy-netlify/
dist-SAO-LUU-*/
*.zip
```

## Việc 3 — Xoá hẳn `src/pages/TvDashboard.jsx`

✅ **Chủ dự án đã quyết: xoá hẳn**, không giữ làm tư liệu.

File 18 KB, **không nơi nào nạp nữa** *(chỉ còn nhắc trong chú thích ở `App.jsx`)*.

```bash
git rm src/pages/TvDashboard.jsx
```

Xoá xong sửa chú thích trong `App.jsx` — bỏ câu *"File src/pages/TvDashboard.jsx còn nằm
lại nhưng không được nạp nữa"*, **giữ nguyên phần giải thích vì sao `/tv` bị gỡ**. Phần
giải thích đó là thứ ngăn người sau vô tình nối lại route.

## Việc 4 — Kiểm chứng lại

```bash
npm install
npx vitest run          # phải PASS hết — mốc hiện tại: 658 test / 32 file
npm run build
```

Rồi kiểm bản build:

```bash
grep -rl 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' dist/     # phải KHÔNG có kết quả
grep -rl 'sb_publishable_I_2VImB' dist/                    # phải CÓ kết quả
ls dist/assets/ | grep -i tv                               # phải KHÔNG có gói TvDashboard
```

Nếu Việc 3 làm rơi test nào *(có thể có test tham chiếu `TvDashboard`)* thì xoá luôn test
đó, đừng khôi phục file.

## Việc 5 — Hai rủi ro bảo mật còn lại

Có tài liệu riêng, chi tiết hơn phần này:

👉 **[`YEU-CAU-XU-LY-2-RUI-RO-CON-LAI.md`](YEU-CAU-XU-LY-2-RUI-RO-CON-LAI.md)**

Tóm tắt:

| # | Rủi ro | Ràng buộc |
|---|---|---|
| 1A | `qc_images` — **328 file · 605 MB** người ngoài tải được | Không có. Ảnh chỉ hiện trong app |
| 1B | `task-attachments` — liệt kê được cây thư mục | 🔴 **Link gửi ra Zalo** — phải kiểm webhook n8n trước |
| 2 | `huy_phieu` không kiểm đăng nhập bên trong | Chỉ chèn thêm khối `IF`, **đừng viết lại hàm** |

⚠️ Mục 1B có một điểm **tôi chưa xác định được**: webhook n8n lấy file bằng khoá Secret hay
bằng link công khai. Đoán sai là **mọi link Zalo đã gửi cho khách đều chết**. Tài liệu riêng
ghi rõ cách kiểm và ba tình huống xử lý.

⚠️ Bucket `tgln-assets` *(trống)* và `zalo-reports` *(0 file)* để nguyên.

## Việc 6 — Deploy

Sau Việc 3, nội dung `dist` **sẽ đổi** *(bớt phần mã của `TvDashboard`)*, nên cần deploy lại.

Kéo-thả thư mục **`dist`** lên Netlify site `amazing-frangollo-eb56a9`.

---

# PHẦN C — KIỂM THỬ SAU KHI DEPLOY

## C1. Quyền truy cập *(quan trọng nhất)*

- [ ] Đăng nhập → vào được
- [ ] Kho / Sản xuất / KPI / Chấm công → hiện đủ dữ liệu
- [ ] Công việc → hiện đủ, sửa trạng thái lưu được
- [ ] Nhân viên / phân quyền → hiện đủ
- [ ] In chứng từ giao hàng → in được; in lại đúng chứng từ đó → **phải bị chặn**
- [ ] **Chưa đăng nhập** mà mở thẳng một trang bất kỳ → **không thấy dữ liệu nào**
- [ ] Mở `/tv` → trống *(đúng chủ ý)*

Mục áp chót là phép thử then chốt: còn thấy dữ liệu nghĩa là còn màn hình bỏ qua đăng nhập.

## C2. Hiệu năng

- [ ] CSKH → Tổng Quan: từng ô số khớp như trước, đổi bộ lọc ngày vẫn đúng
- [ ] KPI Zalo: gửi 1 tin Zalo thật → dòng mới hiện trong vài giây
- [ ] **Chọn 20 hội thoại → "Không cần trả lời"** → DevTools/Network phải thấy **20 PATCH**
      và **KHÔNG** thấy `zalo_conversations?select=` lặp lại ← *phép thử then chốt*
- [ ] Tasks: tạo việc từ máy khác → máy này thấy trong vài giây
- [ ] Để app mở 30 phút → Network **không** thấy `cong_viec_duoc_giao` tải lại theo chu kỳ

---

# PHẦN D — RÀNG BUỘC BẮT BUỘC VỚI MỌI THAY ĐỔI

## D1. Ngưỡng bảo mật phải giữ

> Người ngoài cầm **khoá công khai** *(nằm sẵn trong mã nguồn, Ctrl+U là thấy)*
> **không đọc, không sửa, không xoá được bất kỳ dữ liệu nào.**

Trước khi bàn giao bất kỳ thay đổi nào chạm tới Supabase, RLS, Storage, khoá, đăng nhập —
**phải đo thật**, không được suy luận:

```bash
KEY="sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX"
API="https://ngwkzicrnspeggunsblr.supabase.co/rest/v1"

# ĐỌC — phải trả 0 dòng
curl -s "$API/<bang>?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
     -H "Prefer: count=exact" -D- -o /dev/null | grep -i content-range

# SỬA — phải dùng dòng CÓ THẬT, kèm return=representation, kết quả phải là []
curl -s -X PATCH "$API/<bang>?<cot>=eq.<gia_tri_co_that>" \
     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
     -H "Content-Type: application/json" -H "Prefer: return=representation" \
     -d '{"<cot>":"HACKED"}'
```

⚠️ **Đừng dùng điều kiện không khớp dòng nào** *(kiểu `id=eq.-999999`)*. PostgREST trả
`204` cho cả "bị chặn" lẫn "không có dòng nào khớp" — phép thử đó không chứng minh gì.

## D2. Không được làm đổi luồng khác của app

Sửa gì thì **chỉ đụng đúng phần được yêu cầu**. Nếu thay đổi kéo theo ảnh hưởng sang chỗ
khác: **dừng lại, nói rõ, chờ xác nhận** — đừng tự quyết là "chấp nhận được".

Trước khi sửa một hàm/tệp dùng chung, **rà xem còn nơi nào gọi tới nó**.

Ba lần vi phạm thật trong ngày 28/07/2026, cả ba đều là *"sửa đúng việc được giao nhưng
làm hỏng luồng khác"*:

- Siết bảng `app_users` chặn đọc mật khẩu ⇒ **màn hình Phân quyền hỏng hoàn toàn**, nhiều
  giờ không ai biết vì lúc đó không ai mở màn hình đó
- Bỏ `x-upsert` khi tải ảnh ⇒ **KTV chụp lại CCCD thì ảnh mới không được lưu**
- Siết RLS mà chỉ rà đường **ghi**, quên đường **đọc** của trang công khai ⇒ **trang treo
  ở "Đang tải dữ liệu…"**, khách hàng không xác nhận được

## D3. Hai điều tuyệt đối

- **Không suy luận thay cho đo đạc.** Nói "đã chặn" thì phải có kết quả thử thật.
- **Nói thẳng phần chưa kiểm chứng được**, thay vì để người dùng tin nhầm là đã an toàn.

---

# PHẦN E — BÁO CÁO KHI XONG

Báo lại đủ 5 mục, kèm bằng chứng chứ không chỉ nói "đã làm":

1. Mã băm của commit, và `git status --short` sau khi commit *(phải sạch)*
2. Kết quả `npx vitest run` — số test pass
3. Kết quả 3 lệnh `grep` kiểm bản build ở Việc 4
4. Đã xoá đủ 6 thứ ở Việc 2 chưa, và `.gitignore` đã thêm chưa
5. **Mục nào trong checklist C chưa kiểm được, và vì sao** — đừng bỏ trống, đừng đánh dấu
   đạt cho thứ chưa thử
