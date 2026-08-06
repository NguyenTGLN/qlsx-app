# Bàn giao — Chấm công qua nhóm Zalo, 06/08/2026

> Nhánh `cham-cong-zalo`. **Phần CSDL đã chạy thật trên Supabase. Phần mã app đã xong, CHƯA deploy.**
> **Phần n8n bác phải tự làm** — tôi không có quyền vào đó. Cấu hình từng ô ở mục 3.
>
> Spec: `docs/superpowers/specs/2026-08-06-cham-cong-zalo-design.md`
> Kế hoạch: `docs/superpowers/plans/2026-08-06-cham-cong-zalo.md`

---

## 1. Việc này làm gì

Nhân viên nhắn tên vào nhóm **"Euromade - Chấm Công"** → n8n đổ tin thô vào bảng riêng → một hàm
trong CSDL suy ra dòng chấm công → **hai chỉ tiêu chuyên cần cập nhật ngay trong tháng**, không
phải đợi Excel máy vân tay cuối tháng.

Tin của nhóm này **không sinh hội thoại nào trong KPI Zalo**.

Luật đã chốt: giờ chuẩn **sáng 08:00 / chiều 13:30**; muộn sáng và chiều **cộng lại**; thiếu một
buổi → `Nghỉ sáng`/`Nghỉ chiều` (0,5 ngày), thiếu cả hai → `Nghỉ`; **chiều thứ Bảy lần 2 và lần 4
của tháng** không xét; tin được coi là chấm công khi **nội dung chứa tên của chính người gửi**.

---

## 2. Trạng thái từng phần

| Phần | Trạng thái |
|---|---|
| `sql/cham_cong_zalo.sql` — 6 phần | **Đã chạy thật trên Supabase**, chạy lại an toàn, có khối hoàn tác |
| `src/lib/chamCongZalo.js` + test | Xong, 11 test xanh |
| `src/pages/tasks/ChamCongTab.jsx` — 6 phần thêm | Xong, build sạch |
| `src/pages/tasks/TaskApp.jsx` — cascade thứ 5 | Xong |
| **n8n — bỏ chặn nhóm + nhánh ghi tin thô** | ⏳ **BÁC LÀM** (mục 3) |
| **n8n — gọi RPC + Schedule 17:15** | ⏳ **BÁC LÀM**, chỉ sau khi nối đủ 13 mã |
| Deploy | ⏳ kéo-thả `dist`, **không build trên Netlify** |

**`npm test` 1514/1514 xanh · `npm run build` sạch · `eslint` sạch.**

---

## 3. ⚠ THỨ TỰ TRIỂN KHAI — làm sai thứ tự là hỏng

### Bước 1 — deploy mã app trước

Kéo-thả thư mục `dist` lên Netlify. SQL đã chạy rồi nên deploy xong là tab Chấm công có sẵn các
phần mới (lúc này chưa có dữ liệu Zalo nên chưa hiện gì).

### Bước 2 — n8n: bỏ chặn + nhánh ghi tin thô (CHƯA gọi RPC)

Trong ô `ignoreThreads` của node **Zalo Trigger** có **ba mã không khớp nhóm nào** trong
`zalo_groups`, một trong ba là nhóm chấm công:

```
3288273518723273312   (đang bị ghi HAI lần)
4526062079113325581
8095429580080493978
```

1. Xoá **cả ba** mã khỏi `ignoreThreads` (mã đầu xoá cả hai lần). Giữ nguyên các mã còn lại.
2. Thêm node **If** tên "Là nhóm chấm công?" **ngay sau Zalo Trigger, trước `If1`**:
   - Điều kiện (Boolean → is true) — **bắt cả ba mã** vì chưa biết mã nào đúng:
     ```
     {{ ['3288273518723273312','4526062079113325581','8095429580080493978'].includes($json.threadId) }}
     ```
   - **Nhánh FALSE → nối vào `If1`** (nhánh cũ, không đổi gì bên trong)
   - Nhánh TRUE → node Supabase ở bước 3

   > Bắt cả ba chứ không đoán một: nhánh true **không đi qua `If1`** nên không mã nào lọt vào
   > `zalo_messages` / `zalo_conversations`. Cả ba rơi vào bảng riêng `zalo_cham_cong` — vô hại,
   > và sáng hôm sau nhìn dữ liệu là biết mã nào. Cách này khỏi phải dọn KPI Zalo.

3. Thêm node **Supabase** "Ghi tin chấm công":
   - Credential: `Supabase account 2` · Operation: **Create** · Table: `zalo_cham_cong`
   - Fields:

   | Field | Value |
   |---|---|
   | `thread_id` | `{{ $json.threadId }}` |
   | `uid_from` | `{{ $json.data.uidFrom }}` |
   | `sender_name` | `{{ $json.data.dName }}` |
   | `content` | `{{ $json.filter.content }}` |
   | `ts` | `{{ $json.data.ts }}` |

   **Không gửi `ngay`** — trigger trong CSDL tự điền theo giờ VN.

⚠ **Nối nhầm nhánh FALSE là toàn bộ KPI Zalo ngừng thu.** Sau khi bật, kiểm ngay:

```sql
select count(*) from zalo_cham_cong;   -- phải > 0 sau buổi sáng
select count(*) from zalo_messages      where thread_id in ('3288273518723273312','4526062079113325581','8095429580080493978');
select count(*) from zalo_conversations where thread_id in ('3288273518723273312','4526062079113325581','8095429580080493978');
```
Hai câu sau **phải = 0** — tin nhóm chấm công không được lọt vào KPI Zalo.

### Bước 3 — sáng hôm sau: chốt đúng một mã

```sql
select thread_id, count(*) so_tin, count(distinct uid_from) so_nguoi
from zalo_cham_cong group by thread_id order by so_tin desc;
```

Nhóm chấm công là dòng có **nhiều người gửi nhất**. Rồi ba việc:
- Sửa điều kiện node If thành đúng một mã: `{{ $json.threadId === 'MÃ_ĐÚNG' }}`
- Trả hai mã kia về `ignoreThreads`
- `delete from zalo_cham_cong where thread_id in ('mã2','mã3');`

### Bước 4 — nối mã Zalo cho 8 người còn thiếu

Mở **Công việc → Chấm công**. Băng vàng "Nối mã Zalo" sẽ hiện những người gửi chưa nhận ra được,
kèm tên hiển thị Zalo và nội dung gần nhất. Chọn từng người.

Hiện mới **5/13** người có mã: Nguyên, Ngọc, Xuyên, Dương, Duyên.
**Còn thiếu 8: Bích, Hĩu, Thiện, Xuân, Hà, Phong, Thơ, Tuấn.**

⚠ Chọn kỹ. Nối nhầm là chấm công người này chảy sang người khác mỗi ngày — nhưng khác màn hình nối
tên Excel một điểm có lợi: ở đây chọn lại được.

**Cổng chặn — chưa qua thì đừng sang bước 5:**

```sql
select id, name from nhan_vien where ten_cham_cong is not null and coalesce(uid_from,'') = '';
```
Phải trả **0 dòng**.

### Bước 5 — n8n: bật đường ghi

1. Thêm node **HTTP Request** "Dựng chấm công" sau node "Ghi tin chấm công" (node Supabase của n8n
   không gọi được RPC):
   - Method `POST`, URL:
     `https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/rpc/dung_cham_cong_zalo`
   - Header: `apikey` = khoá `sb_secret_…` (cùng khoá n8n đang dùng), `Authorization` =
     `Bearer <cùng khoá>`, `Content-Type: application/json`
   - Body JSON:
     ```json
     {
       "p_tu":  "={{ $now.setZone('Asia/Ho_Chi_Minh').toFormat('yyyy-MM-dd') }}",
       "p_den": "={{ $now.setZone('Asia/Ho_Chi_Minh').toFormat('yyyy-MM-dd') }}"
     }
     ```
   - ⚠ Đừng đặt User-Agent tay: khoá `sb_secret` bị trả 401 nếu UA giống trình duyệt (đã gặp 31/07).

2. Thêm **Schedule Trigger** `15 17 * * *`, timezone `Asia/Ho_Chi_Minh`, nối vào **một bản sao** của
   node HTTP Request trên.

   Vẫn cần lượt này dù mỗi tin đã gọi hàm: ngày nào không ai nhắn buổi chiều thì không có tin nào
   kích hoạt — mà đó đúng là ngày cần chốt nhất.

**Kiểm trong ngày, TRƯỚC 17:00:**
```sql
select nhan_vien_id, gio_in_sang, gio_in_chieu, di_muon_phut, nghi, nghi_text, nguon
from cham_cong where ngay = current_date order by nhan_vien_id;
```
Chỉ có dòng của người **đã nhắn**, tất cả `nghi = false`, `nguon = 'ZALO'`.
**Không được có dòng `nghi = true` nào trước 17:00.**

**Kiểm sau 17:15:** `select count(*) filter (where nghi) from cham_cong where ngay = current_date;`
— bằng đúng số người thật sự vắng.

---

## 4. Sáu lỗi bắt được khi làm — đều đã vá, đều có test khoá lại

Không cái nào lộ ra khi đọc mã; tất cả chỉ hiện khi đo thật.

**a) `p_chot` làm tham số — xoá sạch cờ nghỉ vừa chốt.** Bản nháp thiết kế để người gọi quyết đã
chốt hay chưa. Sau khi lượt 17:15 chốt xong, **một tin tăng ca lúc 18:00** khiến n8n gọi lại với
`p_chot = false`, hàm tính lại từ đầu và xoá sạch cờ nghỉ — cả 13 người bỗng thành đi làm đủ, không
báo lỗi gì. Đã bỏ hẳn tham số, để **hàm tự quyết theo đồng hồ**.

**b) Unicode NFD — bỏ dấu thất bại.** Chữ Việt có hai cách mã hoá. Bảng `translate` chỉ biết dạng
dựng sẵn, nên chuỗi tổ hợp đi qua mà **không bị bỏ dấu**: `zalo_bo_dau(normalize('Ngọc', nfd))` ra
`ngọc` chứ không phải `ngoc` → không khớp tên → người đó bị sót → **ghi nghỉ oan, mất 3 điểm**. Đã
thêm `normalize(…, nfc)`. Đo lại: 21 ca test (16 gốc + 5 ca NFD) đều đúng.

**c) Van an toàn đặt theo NGÀY thay vì theo BUỔI.** n8n chết lúc 12h trưa thì cả 13 người đủ tin
sáng nhưng trắng tin chiều — van theo ngày sẽ thấy "ngày này có người nhắn" rồi gạch `Nghỉ chiều`
cho đủ 13 người. Van nay đặt theo **từng buổi**: buổi nào không một ai nhắn thì không ghi thiếu
buổi đó cho bất kỳ ai. Che cùng lúc: ngày lễ, n8n chết, Zalo rớt phiên.

**d) "08:00 mà báo muộn 1 phút".** `::int` làm tròn nửa lên, nên tin lúc 08:00:30 ra `di_muon_phut
= 1` trong khi cột giờ vào hiển thị `08:00` — hai con số mâu thuẫn nhau trên cùng một dòng, người
bị trừ không cãi được. Đã đổi sang `floor`.

**e) Nút "Bỏ" báo thành công giả.** RLS ba bảng mới chỉ cho `nv_role='ADMIN'` ghi, còn nút chỉ ẩn
theo `perm.edit`. Người có quyền sửa tab mà không phải ADMIN sẽ bị RLS lọc sạch dòng, và PostgREST
trả **204 kèm `error === null`** — đúng cái bẫy `loiGhiKpi` sinh ra để chống. Giao diện báo đã xoá,
tải lại, số cũ hiện nguyên. Đã thêm `.select()` đếm dòng thật ở cả ba lệnh ghi.

**f) `ve_som_tay` là bảng cascade thứ NĂM.** Chú thích trong `TaskApp.jsx` ghi "BỐN bảng". Thiếu
một dòng update là **đổi mã nhân viên xoá sạch về sớm chấm tay** của người đó, không cảnh báo. Đã
thêm. Đếm lại thật bằng `pg_constraint`: có **sáu** bảng cascade — bảng thứ sáu `nhan_vien_secret`
đã được lo từ trước bằng RPC `sao_chep_secret`.

---

## 5. Kiểm tra bảo mật — đo bằng chính khoá công khai, trên dòng CÓ THẬT

Khoá lấy từ `src/lib/supabase.js:5` (`sb_publishable_…`, thứ nằm sẵn trong mã nguồn mọi trang).
Mỗi bảng đều được chèn một dòng mồi có thật trước khi đo, để "0 dòng" không mơ hồ.

| Phép thử | Kết quả |
|---|---|
| Đọc `zalo_cham_cong` (dòng mồi có thật) | `[]` |
| Đọc `ve_som_tay` (dòng mồi có thật) | `[]` |
| Đọc `cham_cong` (388 dòng thật) | `[]` |
| Đọc `nhan_vien` (17 dòng thật) | `[]` |
| Gọi `dung_cham_cong_zalo` | `42501 permission denied for function` |
| Gọi `ap_lai_ve_som_tay` | `42501 permission denied for function` |
| Sửa `zalo_cham_cong`, dòng có thật | `[]` — nội dung vẫn là `Hà`, không thành `BI SUA` |
| Sửa `ve_som_tay`, dòng có thật | `[]` — `so_phut` vẫn 11, không thành 999 |
| Sửa `cham_cong` kỳ 2026-07 | `[]` |
| Xoá `ve_som_tay`, dòng có thật | `[]` — dòng còn nguyên |
| Chèn `ve_som_tay` mới | `42501 new row violates row-level security policy` |

Hai hàm mới **không phải `security definer`** (`prosecdef = false`), đã `revoke from public` **và**
`from anon` — không chỉ từ `anon`, vì đo 01/08 đã chứng minh thu riêng `anon` không đủ.

**Dữ liệu thật sau toàn bộ quá trình:** `cham_cong` kỳ 2026-07 vẫn **388 dòng · 621 phút muộn · 19
ngày nghỉ · 388 dòng `MAY` · 0 dòng `ZALO`**; `nhan_vien` 17; hai bảng mới sạch 0 dòng.

> `zalo_conversations` và `zalo_messages` có tăng trong lúc làm (11.530 → 11.540 và 25.572 →
> 25.620). Đó là n8n đang chạy bình thường thu tin các nhóm khác, **không phải do việc này** — nhóm
> chấm công vẫn chưa chảy vào hệ thống.

---

## 6. ⚠ Phần CHƯA kiểm chứng được — nói thẳng

**Toàn bộ giao diện chưa ai nhìn bằng mắt.** App có màn hình đăng nhập và tôi **không nhập mật khẩu
thay bác**. Băng cảnh báo vàng/đỏ, cột Nguồn, ô nối mã, hai modal mới, nút "Dựng lại từ Zalo" — mới
chỉ được xác nhận là **biên dịch sạch, lint sạch, không phá test nào**, chưa được xác nhận là
**trông đúng và bấm chạy đúng**.

**Đường đi thật của n8n chưa chạy lần nào** — không có tin thật nào từ nhóm chấm công. Tôi thử bằng
tin tự chèn trên ngày rác năm 1900 và một ngày tương lai 2099.

**Ba luồng cũ tôi chỉ kiểm được gián tiếp**, bác nên bấm thử:
1. **Phân quyền → sửa một nhân viên → ĐỔI MÃ.** Đây là luồng nhánh này chạm vào. Đổi thử mã một
   người không quan trọng, rồi kiểm họ vẫn còn chấm công, KPI, cải tiến, về sớm.
2. **Chấm công → Nạp từ Excel** — dừng ở bảng xem trước, không cần bấm xác nhận. Phải hiện đủ 13
   người.
3. **Miễn trừ "Đánh dấu đặc biệt"** — bật rồi tắt một ngày.

---

## 7. Bốn điều bác nên biết trước khi có người thắc mắc

1. **Điểm chuyên cần trong tháng nhẹ hơn số cuối tháng.** Zalo không có `ve_som_phut`, mà chuyên
   cần **bộ phận** có tính về sớm. Nạp Excel xong điểm bộ phận có thể tụt.
2. **Điểm nhảy khi nạp Excel.** Số Zalo là "ai nhớ nhắn", số máy là "ai quẹt vân tay" — không bao
   giờ trùng khít. Nạp Excel **xoá trọn kỳ** rồi chèn lại, nên mọi dòng Zalo của kỳ đó biến mất và
   thay bằng số máy. Đúng ý đồ "máy vân tay thắng", nhưng nó là một chiều: Zalo không đè được máy,
   còn máy thì quét sạch Zalo.
3. **Sau mỗi lần nạp Excel phải bấm "Áp lại về sớm chấm tay".** Băng đỏ sẽ nhắc, không phải tự nhớ.
   Dữ liệu gốc nằm ở bảng `ve_som_tay` mà hàm nạp không đụng tới, nên không mất gì.
4. **Ai quên nhắn bị trừ oan cho tới cuối tháng** — hệ quả trực tiếp của luật "không nhắn = nghỉ"
   bác đã chốt. Gỡ bằng miễn trừ có giải trình như hiện nay.

Riêng người **chưa nối mã Zalo** thì **không bị ghi nghỉ oan** — hàm bỏ qua họ hoàn toàn, KPI chuyên
cần của họ chỉ để trống. Hướng lỗi an toàn.

---

## 8. Ba việc gác lại, không nằm trong phạm vi lần này

1. **`nhan_vien` cho MỌI người đã đăng nhập ghi được.** Policy `chi_nguoi_dang_nhap` là
   `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — khác hẳn ba bảng mới (ADMIN-only).
   Nghĩa là ô nối mã Zalo ghi được với bất kỳ ai đã đăng nhập, và `canEdit` phía trình duyệt là hàng
   rào duy nhất. **Policy này có từ trước**, màn hình Phân quyền đang dựa vào nó — siết lại là đụng
   luồng khác nên tôi không tự làm.
2. **Nút "Bỏ" đặt `ve_som_phut = 0` vô điều kiện.** An toàn hôm nay vì máy đã ngừng xuất cột đó
   (0/388 dòng). Nếu sau này máy xuất lại, "Bỏ" sẽ xoá luôn số của máy chứ không chỉ số chấm tay.
3. **`tang_ca_phut` để trống với dòng Zalo.** Một tin lúc bắt đầu tăng ca không nói được tăng ca bao
   nhiêu phút. Muốn có số thì phải thêm tin lúc kết thúc. Cột này **không tham gia** tính điểm
   chuyên cần nên hiện chưa ảnh hưởng gì.
