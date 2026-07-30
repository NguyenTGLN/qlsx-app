# YÊU CẦU XỬ LÝ 2 RỦI RO CÒN LẠI

**Ngày:** 28/07/2026 · Tài liệu **tự đủ**. Đọc kèm `BAN-GIAO-CHO-AGENT.md` cùng thư mục.

Toàn bộ database đã được siết ngày 28/07: 65 bảng · 4 view · Realtime · hàm RPC — người
ngoài cầm khoá công khai đọc được **0 dòng**. Đây là 2 mục cuối chưa xử lý.

---

# BỐI CẢNH — ĐỌC TRƯỚC

| | |
|---|---|
| Khoá công khai *(đúng, đang dùng)* | `sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX` |
| Khoá JWT cũ | **ĐÃ BỊ VÔ HIỆU** — build nào còn nhúng là không ai đăng nhập được |
| Ngưỡng phải giữ | Người ngoài cầm khoá công khai **không đọc, không sửa, không xoá** được gì |
| Nguyên tắc | **Chỉ đụng đúng phần được yêu cầu.** Kéo theo ảnh hưởng chỗ khác ⇒ dừng, báo, chờ xác nhận |

---

# RỦI RO 1 · Hai bucket Storage còn công khai

Đo bằng khoá công khai:

| Bucket | Người ngoài lấy được | Nội dung |
|---|---|---|
| `qc_images` | **328 file · 605 MB** — đã tải thử 1 ảnh, HTTP 200 | 318 ảnh lỗi sản phẩm + 5 ảnh cách xử lý |
| `task-attachments` | Liệt kê được cây `progress/2026-07/…` | Ảnh đính kèm cập nhật tiến độ công việc |

Không chứa thông tin định danh khách hàng. Nhưng là **tư liệu vận hành nội bộ**: sản phẩm
lỗi ở đâu, dây chuyền lắp ráp thế nào, tần suất lỗi.

## 1A · `qc_images` — làm được ngay, không có ràng buộc

**Đã rà:** ảnh chỉ hiển thị **bên trong app** *(`QualityApp.jsx`)*. Không gửi ra Zalo,
không webhook, không nơi nào ngoài app dùng tới.

### Bước 1 — Sửa mã

`src/pages/quality/QualityApp.jsx` hiện dùng `getPublicUrl` ở 2 chỗ *(khoảng dòng 181 và
199)*, và lưu **link đầy đủ** vào cột `image_url` / `solution_images`.

Vì database đã lưu sẵn hàng trăm link dạng `.../object/public/qc_images/<tên file>`, phải
**tách tên file khỏi link cũ** rồi xin link ký — không được giả định link mới.

Mẫu đã dùng thành công cho ảnh CCCD ở app QLBB *(`3-qlbb/src/components/Modals.jsx`,
hàm `tachTenFileCccd` + `createSignedUrl`)* — làm y hệt:

```javascript
// Tách tên file khỏi link đã lưu trong database
function tachTenFile(url) {
  if (!url) return '';
  const m = String(url).match(/\/qc_images\/(.+)$/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// Xin link ký có hạn 5 phút
const { data, error } = await supabase.storage
  .from('qc_images').createSignedUrl(tachTenFile(urlDaLuu), 300);
if (error) throw error;   // hiện thông báo lỗi, ĐỪNG để trống im lặng
```

⚠️ `createSignedUrl` là **async**. Chỗ nào đang gán trực tiếp vào `src` của thẻ ảnh phải
đổi sang tải trước bằng `useEffect` + `useState`, có trạng thái *"đang tải"* và *"lỗi"*.

Phần **tải ảnh lên giữ nguyên** — không đụng.

### Bước 2 — Deploy và KIỂM ẢNH HIỆN ĐƯỢC

Chưa kiểm thấy ảnh hiện thì **không được chạy Bước 3**.

- [ ] Đăng nhập → màn hình Chất lượng → mở một lỗi **có ảnh** → ảnh hiện
- [ ] Ảnh phần "cách xử lý" cũng hiện
- [ ] Tải ảnh mới lên → lưu được → mở lại thấy ảnh

### Bước 3 — Siết quyền *(chỉ khi Bước 2 đạt)*

```sql
update storage.buckets set public = false where id = 'qc_images';

drop policy if exists "Cho phép mọi người xem ảnh" on storage.objects;

create policy qc_images_doc_khi_dang_nhap on storage.objects
  for select to authenticated using (bucket_id = 'qc_images');

-- Kiểm: chỉ còn đúng 2 policy cho qc_images — INSERT{public}, SELECT{authenticated}
select policyname, cmd, roles::text from pg_policies
where schemaname='storage' and tablename='objects'
  and (qual like '%qc_images%' or with_check like '%qc_images%')
order by cmd;
```

⚠️ **Giữ nguyên policy `INSERT` cho vai trò công khai** — bỏ là không tải ảnh lên được.

**Hoàn tác:**

```sql
update storage.buckets set public = true where id = 'qc_images';
create policy "Cho phép mọi người xem ảnh" on storage.objects
  for select to public using (bucket_id = 'qc_images');
```

---

## 1B · `task-attachments` — 🔴 CÓ RÀNG BUỘC, PHẢI KIỂM TRƯỚC

**Đừng đóng bucket này trước khi làm xong bước kiểm dưới đây.**

Link đính kèm được **gửi ra ngoài qua Zalo** cho nhân viên và khách. Xem
`src/lib/attachments.js`:

```javascript
export const FILE_VIEW_BASE = 'https://thegioilocnuoc.site/webhook/f?p=';
export function attachmentViewUrl(a) {
  return a.path ? FILE_VIEW_BASE + a.path : a.url;
}
```

Link không trỏ thẳng Supabase mà **đi qua một webhook n8n**. Tôi đã gọi thử webhook với một
path có thật: trả về `HTTP 200 · image/webp · 146 KB` — webhook tự lấy file.

### ⚠️ Điều TÔI CHƯA XÁC ĐỊNH ĐƯỢC

**Webhook đó lấy file bằng khoá nào?** Không xem được workflow n8n từ ngoài.

| Nếu webhook dùng | Đóng bucket thì |
|---|---|
| Khoá **Secret** *(`sb_secret_…`)* hoặc link ký | ✅ Link Zalo vẫn chạy |
| Link **công khai** *(`/object/public/…`)* | 🔴 **Mọi link Zalo đã gửi đều chết** |

Số link đã gửi cho khách và nhân viên là **không đếm được và không thu hồi được**. Đoán sai
ở đây là hỏng một luồng đang chạy với người ngoài công ty.

### Bước 1 — Mở n8n kiểm workflow của webhook `f`

Tìm node lấy file trong workflow xử lý `webhook/f`, xem nó gọi URL nào:

- Gọi `/storage/v1/object/public/task-attachments/…` → **đang dùng link công khai**
- Gọi `/storage/v1/object/task-attachments/…` kèm header `apikey: sb_secret_…` → **đang dùng khoá bí mật**

### Bước 2 — Xử lý theo kết quả

**Trường hợp A — webhook đã dùng khoá Secret:** chạy luôn SQL bên dưới, không cần sửa gì.

**Trường hợp B — webhook dùng link công khai:** phải sửa node n8n **trước**, cho nó gọi
`/storage/v1/object/task-attachments/<path>` kèm header `apikey` và `Authorization: Bearer`
bằng khoá Secret. Test lại link Zalo cũ vẫn mở được, **rồi mới** chạy SQL.

**Trường hợp C — không xác định được:** ❌ **DỪNG, báo chủ dự án.** Đừng đoán.
Rủi ro của bucket này là *lộ tư liệu nội bộ*; rủi ro của việc đoán sai là *khách hàng bấm
link nhận được thì không mở được*. Cái sau nặng hơn.

### Bước 3 — SQL *(chỉ khi Bước 2 đã rõ ràng)*

```sql
update storage.buckets set public = false where id = 'task-attachments';

drop policy if exists task_attachments_doc on storage.objects;

create policy task_attachments_doc_khi_dang_nhap on storage.objects
  for select to authenticated using (bucket_id = 'task-attachments');
```

⚠️ **Giữ nguyên** `task_attachments_tai_len` (INSERT) và `task_attachments_xoa` (DELETE).

### Bước 4 — Kiểm thử, làm đủ cả 3

- [ ] Đính kèm ảnh vào một cập nhật tiến độ → tải lên được
- [ ] **Bấm link Zalo của một đính kèm CŨ** *(gửi trước hôm nay)* → mở được ← quan trọng nhất
- [ ] Bấm link Zalo của đính kèm **vừa tạo** → mở được

**Hoàn tác:**

```sql
update storage.buckets set public = true where id = 'task-attachments';
create policy task_attachments_doc on storage.objects
  for select to public using (bucket_id = 'task-attachments');
```

---

## 1C · Phương án tạm nếu chưa làm được 1A/1B

Nếu chưa kịp sửa mã hoặc chưa rõ webhook: **chặn liệt kê, giữ tải theo tên file**.

Người ngoài mất khả năng lấy danh sách 328 tên file. Tên file là chuỗi ngẫu nhiên
*(`issue_<dấu thời gian>_<6 ký tự>`, path đính kèm 10 ký tự hex ≈ 40 bit)* nên không đoán
nổi. Ảnh cũ trong app và link Zalo **vẫn chạy** vì bucket còn công khai.

Đây **không phải** giải pháp cuối — chỉ giảm rủi ro trong lúc chờ.

```sql
-- Chặn liệt kê: thu quyền SELECT trên storage.objects của vai trò công khai,
-- nhưng GIỮ bucket ở chế độ công khai nên đường /object/public/... vẫn mở.
drop policy if exists "Cho phép mọi người xem ảnh" on storage.objects;
drop policy if exists task_attachments_doc          on storage.objects;

create policy qc_images_doc_khi_dang_nhap on storage.objects
  for select to authenticated using (bucket_id = 'qc_images');
create policy task_attachments_doc_khi_dang_nhap on storage.objects
  for select to authenticated using (bucket_id = 'task-attachments');
```

Kiểm sau khi chạy:

```bash
KEY="sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX"
S="https://ngwkzicrnspeggunsblr.supabase.co/storage/v1"
# Liệt kê → phải 0 file
curl -s -X POST "$S/object/list/qc_images" -H "apikey: $KEY" \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"prefix":"","limit":10}'
# Tải theo tên file → phải VẪN 200 (chủ ý, để app và link Zalo còn chạy)
curl -s -o /dev/null -w '%{http_code}\n' "$S/object/public/qc_images/1777263245187_lvkc3r.png"
```

⚠️ Nếu app dùng `.list()` ở đâu đó để duyệt file thì cách này làm hỏng chỗ đó — rà trước:
`grep -rn "\.list(" src/`

---

# RỦI RO 2 · `huy_phieu` không có kiểm tra đăng nhập bên trong

## Hiện trạng

Hàm `public.huy_phieu(p_order_code text, p_user text, p_reason text)` là `SECURITY DEFINER`
*(bỏ qua RLS)* và **không kiểm `auth.jwt()`, không kiểm vai trò, không kiểm gì**.

Nó làm những việc không hoàn tác tự động được:

- Đảo tồn kho: `UPDATE` / `DELETE` trên `inventory_stock`
- `DELETE` dòng trên `luu_xuat` và `du_lieu_nhap`
- `DELETE` lệnh sản xuất trên `production_orders`
- `UPDATE` `production_demand`

Mã chứng từ dạng `PDH-20260607-01`, `PXK-…`, `PNK-…`, `PSX-…` — **đoán được theo ngày**.

## Đã chặn tạm bằng gì

Ngày 28/07 đã thu quyền gọi của `anon`:

```sql
revoke execute on function public.huy_phieu(text,text,text) from public;
revoke execute on function public.huy_phieu(text,text,text) from anon;
grant  execute on function public.huy_phieu(text,text,text) to authenticated, service_role;
```

Đo lại: người ngoài gọi → `42501 permission denied` ✅

**Nhưng đây chỉ là một lớp.** Ai `grant execute … to anon` trở lại — hoặc Supabase đổi mặc
định cấp quyền — là lỗ hổng trở lại ngay, và lần đó không ai biết.

## Việc cần làm

Thêm kiểm tra vào **ngay đầu** hàm, theo đúng mẫu các hàm khác trong cùng dự án
*(`dat_mat_khau`, `tao_ky_kpi` đều làm vậy)*:

```sql
create or replace function public.huy_phieu(
  p_order_code text, p_user text default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  -- … giữ NGUYÊN toàn bộ phần DECLARE hiện có …
BEGIN
  -- ⬇ THÊM MỚI: chặn người chưa đăng nhập, dù quyền gọi có bị cấp lại
  IF coalesce(auth.jwt() ->> 'nv_role', '') = '' THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING errcode = '42501';
  END IF;

  -- … giữ NGUYÊN toàn bộ phần thân hiện có, không sửa một dòng logic nào …
END;
$function$;
```

⚠️ **Cách làm an toàn:** lấy định nghĩa hiện tại bằng
`select pg_get_functiondef('public.huy_phieu(text,text,text)'::regprocedure);`
rồi chỉ **chèn thêm** khối `IF` ở đầu. **Đừng viết lại hàm từ đầu** — thân hàm dài, xử lý
đảo tồn kho nhiều nhánh *(PNK/PXK/PDH/PSX/PPR/PCV)*, viết lại là dễ làm sai nghiệp vụ kho.

### Kiểm tra claim đúng tên

Trước khi dùng `nv_role`, xác nhận đó đúng là claim mà hàm `dang_nhap` đặt vào JWT:

```sql
select pg_get_functiondef('public.dang_nhap(text,text,boolean)'::regprocedure);
-- tìm phần jsonb_build_object dựng payload, xem tên claim thật là gì
```

Sai tên claim ⇒ **người đã đăng nhập cũng không huỷ được phiếu**.

### Kiểm thử

- [ ] Đăng nhập `qlsx-app` → Kho → **huỷ một phiếu thật** → huỷ được ← quan trọng nhất
- [ ] Kiểm tồn kho sau khi huỷ → đã đảo đúng
- [ ] Người ngoài gọi bằng khoá công khai → vẫn `42501`

```bash
KEY="sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX"
curl -s -X POST "https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/huy_phieu" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"p_order_code":"KHONG-CO-THAT","p_user":"x","p_reason":"t"}'
# ✅ phải là lỗi quyền, KHÔNG được là "Không tìm thấy chứng từ"
```

**Hoàn tác:** chạy lại `create or replace` với định nghĩa cũ *(bỏ khối `IF` vừa thêm)*.

---

# BÁO CÁO KHI XONG — nộp bằng chứng, không chỉ nói "đã làm"

1. **`qc_images`:** kết quả `curl` liệt kê *(phải 0 file)* và ảnh hiện được trong app —
   nói rõ đã kiểm bằng cách nào
2. **`task-attachments`:** webhook n8n đang dùng khoá gì *(A/B/C)*, và nếu đã đóng bucket
   thì **link Zalo CŨ có mở được không**
3. **`huy_phieu`:** tên claim thật trong JWT, kết quả huỷ một phiếu thật, và kết quả `curl`
   của người ngoài
4. **Mục nào chưa kiểm được và vì sao** — đừng bỏ trống, đừng đánh dấu đạt cho thứ chưa thử

Nếu chọn phương án tạm 1C thay vì 1A/1B, nói rõ lý do để chủ dự án biết đây là trạng thái
trung gian, chưa phải đã đóng.
