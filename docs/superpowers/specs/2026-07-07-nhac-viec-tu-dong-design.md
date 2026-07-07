# Thiết kế: Nhắc việc tự động cho phân hệ Công việc

- **Ngày:** 2026-07-07
- **Phạm vi:** Phân hệ Công việc (`cong_viec_duoc_giao`)
- **Phương án chốt:** Cách 2 — hẹn giờ & truy vấn nằm trong Supabase (`pg_cron` + `pg_net`), n8n chỉ nhận và gửi Zalo.
- **Không đụng tới app:** không sửa React, không build/deploy lại Netlify.

---

## 1. Mục tiêu

Tự động nhắc việc qua Zalo (thông qua n8n) mà **không cần ai mở app**:

1. **08:00 giờ VN mỗi ngày** → gửi danh sách việc đang thực hiện (`IN_PROGRESS`) tới webhook
   `https://thegioilocnuoc.site/webhook/cong_viec_dang_thuc_hien`.
   - Nếu không có việc nào → vẫn gửi tin "hôm nay không có việc đang thực hiện".
2. **Trước hạn từng việc**: gửi nhắc ở 3 mốc **60 / 30 / 5 phút** trước `due_date` tới webhook
   `https://thegioilocnuoc.site/webhook-test/cong_viec_den_han` (URL test khi làm; đổi sang `/webhook/...` khi chạy thật).

## 2. Bối cảnh & ràng buộc

- App QLSX là web tĩnh (deploy Netlify kéo-thả) → **không** chạy nền được, nên logic hẹn giờ đặt ở Supabase.
- Supabase đã được n8n dùng trực tiếp (node `n8n-nodes-base.supabase`); webhook n8n tại `thegioilocnuoc.site`.
- Gửi Zalo hiện đi theo **nhóm** (bảng `zalo_groups(group_id, group_name)`), không map theo cá nhân. n8n quyết định nhóm gửi; Supabase **không** cần thêm cột người nhận.
- Yêu cầu quan trọng của người dùng: **không quét n8n mỗi 5 phút**. Giải pháp: pg_cron quét bằng SQL (rất rẻ, chạy trong DB), **chỉ gọi n8n khi thật sự có việc cần nhắc**.

## 3. Kiến trúc tổng quan

```
                 ┌─────────────────────── Supabase (Postgres) ───────────────────────┐
   pg_cron  ──▶  │  Job A  (0 1 * * * UTC = 08:00 VN)  →  fn_nhac_viec_dang_thuc_hien │
   (hẹn giờ)     │  Job B  (* * * * *  mỗi 1 phút)      →  fn_nhac_viec_den_han        │
                 │        │                                     │                     │
                 │        │ đọc cong_viec_duoc_giao + nhan_vien  │ ghi cong_viec_nhac_log
                 │        ▼                                     ▼                     │
                 │      pg_net.http_post(...)  ──────────────────────────────────────┼──▶ n8n webhook
                 └───────────────────────────────────────────────────────────────────┘        │
                                                                                                ▼
                                                                                       Định dạng + gửi
                                                                                       vào nhóm Zalo
```

- **pg_cron**: bộ hẹn giờ trong Postgres.
- **pg_net**: gọi HTTP (POST webhook) từ trong Postgres, bất đồng bộ.
- Hai hàm SQL (`fn_...`) chứa toàn bộ truy vấn + build payload + gọi `pg_net`.
- n8n: 2 workflow webhook, chỉ lo định dạng nội dung và gửi Zalo.

## 4. Thành phần chi tiết

### 4.1. Extensions
- Bật `pg_cron` và `pg_net` trong Supabase (Dashboard → Database → Extensions). Cả hai đều có sẵn trên mọi gói.

### 4.2. Bảng cấu hình `reminder_config`
Để đổi URL test ↔ thật và đổi secret mà không phải sửa hàm:

| key             | value (ví dụ)                                                        |
|-----------------|----------------------------------------------------------------------|
| `webhook_daily` | `https://thegioilocnuoc.site/webhook/cong_viec_dang_thuc_hien`       |
| `webhook_due`   | `https://thegioilocnuoc.site/webhook-test/cong_viec_den_han`         |
| `secret`        | (chuỗi bí mật ngẫu nhiên)                                            |

Hàm SQL đọc URL/secret từ bảng này. (Tuỳ chọn nâng cao: dùng Supabase Vault thay bảng thường.)

### 4.3. Bảng chống gửi trùng `cong_viec_nhac_log`

| cột            | kiểu         | ghi chú                                    |
|----------------|--------------|--------------------------------------------|
| `task_id`      | text         | id việc (`CV-###`)                         |
| `moc`          | text         | `8H` \| `60` \| `30` \| `5`                |
| `due_snapshot` | timestamptz  | hạn tại thời điểm nhắc (để phát hiện đổi hạn)|
| `sent_at`      | timestamptz  | mặc định `now()`                           |

- **UNIQUE `(task_id, moc, due_snapshot)`** → `INSERT ... ON CONFLICT DO NOTHING` bảo đảm mỗi (việc, mốc, hạn) chỉ bắn 1 lần.
- Mốc `8H` **không** dùng bảng này (Job A luôn gửi 1 lần/ngày, không cần chống trùng theo việc).

### 4.4. Job A — 08:00 VN mỗi ngày (`fn_nhac_viec_dang_thuc_hien`)
- Lịch pg_cron: `0 1 * * *` (01:00 UTC = 08:00 giờ VN, VN không có DST).
- Lấy **mọi** việc `status='IN_PROGRESS'`, join `nhan_vien` lấy tên người phụ trách.
- POST **một** gói tổng tới `webhook_daily`. Kể cả danh sách rỗng vẫn POST (n8n tự nhắn "không có việc").

### 4.5. Job B — mỗi 1 phút (`fn_nhac_viec_den_han`)
- Lịch pg_cron: `* * * * *`.
- Xét việc `status='IN_PROGRESS'` **và** `due_date > now()`.
- Tính `mins_left = (due_date - now())` theo phút, phân **băng**:
  - `mins_left ≤ 60` và `> 30` → mốc **`60`**
  - `mins_left ≤ 30` và `> 5`  → mốc **`30`**
  - `mins_left ≤ 5`  và `> 0`  → mốc **`5`**
  - còn lại → bỏ qua.
- Với mỗi việc trúng băng: `INSERT` vào `cong_viec_nhac_log`; **chỉ khi chèn thành công** (chưa từng nhắc mốc đó cho hạn đó) mới `pg_net.http_post` tới `webhook_due`.

## 5. Logic "băng giờ" — vì sao chọn cách này

- Mỗi băng bắn đúng 1 lần, không phụ thuộc thời điểm tạo việc.
- Việc tạo sát hạn (VD tạo lúc còn 40 phút) sẽ rơi vào băng "≤60" và gửi mốc `60` một lần, rồi tới `30`, `5` — **không** gửi sai kiểu "còn 60 phút" khi thực tế còn 40. Vì vậy nội dung tin nên diễn đạt theo băng ("còn dưới 1 tiếng / dưới 30 phút / dưới 5 phút") thay vì con số tuyệt đối.
- Nếu DB/n8n chết trọn một băng → bỏ qua băng đó, **không spam trễ**.
- **Việc lặp lại**: mỗi lần sinh ra id mới (`recurrence_parent_id`), nên log tách theo id, không đè nhau.
- **Sửa hạn**: `due_snapshot` đổi → khoá UNIQUE khác → nhắc lại theo hạn mới (đúng ý muốn).

## 6. Hợp đồng payload (Supabase → n8n)

Header mọi request: `Content-Type: application/json`, `x-reminder-secret: <secret>`.

### Job A → `cong_viec_dang_thuc_hien`
```json
{
  "type": "daily_8h",
  "sent_at": "2026-07-07T01:00:00Z",
  "count": 2,
  "tasks": [
    { "id": "CV-012", "title": "...", "assignee_id": "NV003",
      "assignee_name": "Ngọc", "due_date": "2026-07-07T09:00:00Z", "label": "Bảo hành" }
  ]
}
```
- `count = 0` + `tasks = []` khi không có việc.

### Job B → `cong_viec_den_han`
```json
{
  "type": "due_soon",
  "moc": "60",
  "minutes_left": 58,
  "sent_at": "2026-07-07T02:02:00Z",
  "task": {
    "id": "CV-012", "title": "...", "description": "...",
    "assignee_id": "NV003", "assignee_name": "Ngọc",
    "due_date": "2026-07-07T03:00:00Z", "label": "Bảo hành"
  }
}
```

## 7. Bảo mật
- pg_net gửi kèm `x-reminder-secret`. n8n kiểm tra header này ở đầu workflow, sai thì bỏ qua → tránh người ngoài spam webhook.
- Không lộ thêm khoá Supabase nào (truy vấn chạy nội bộ trong DB; webhook chỉ nhận payload đã build sẵn).

## 8. Xử lý lỗi & trường hợp biên
- **Kiểu cột `due_date`**: app lưu bằng `new Date().toISOString()`. Trong SQL sẽ ép `due_date::timestamptz` để so sánh an toàn dù cột là `timestamptz` hay `text`. → **Cần xác nhận kiểu cột khi triển khai.**
- **Múi giờ**: mọi so sánh dùng `now()` (UTC) với `due_date` dạng timestamptz → tuyệt đối, không lệch. Chỉ lịch 08:00 cần quy đổi (01:00 UTC).
- **pg_net thất bại/timeout**: fire-and-forget; phản hồi lưu ở `net._http_response`. Bản đầu chấp nhận không retry (mốc kế tiếp vẫn chạy độc lập). Có thể bổ sung kiểm tra lỗi sau.
- **8:00 danh sách rỗng**: vẫn POST, n8n nhắn "không có việc".
- **Việc quá hạn**: Job B chỉ xét `due_date > now()` nên việc đã quá hạn không bị nhắc "sắp đến hạn".

## 9. Mở rộng tương lai (không làm bây giờ)
- **Gửi Zalo cá nhân**: payload đã mang `assignee_id`. Sau này thêm cột `nhan_vien.zalo_user_id` và để n8n route theo `assignee_id`; hoặc thêm key cấu hình chọn "gửi nhóm / gửi cá nhân". Không cần đổi cấu trúc cron/log.

## 10. Kế hoạch kiểm thử
1. **Payload thật (n8n test mode)**: bật "Listen for test event" ở workflow `cong_viec_den_han`, seed 1 việc `IN_PROGRESS` có `due_date = now() + 59 phút`, chạy tay `SELECT fn_nhac_viec_den_han();` → thấy 1 request tới n8n, log có dòng `(task, '60', due)`.
2. **Chống trùng**: chạy `fn_nhac_viec_den_han()` lần 2 ngay sau → không chèn log, không gửi.
3. **Chuyển băng**: chỉnh `due_date` xuống `now() + 29 phút`, chạy lại → gửi mốc `30`; xuống `now() + 4 phút` → gửi mốc `5`.
4. **Đổi hạn nhắc lại**: đổi `due_date` sang mốc mới (khác `due_snapshot` cũ) → nhắc lại đúng theo hạn mới.
5. **Job A rỗng**: khi không có việc `IN_PROGRESS`, chạy `fn_nhac_viec_dang_thuc_hien()` → vẫn POST `count:0`.
6. **Lịch thật**: đăng ký 2 cron job, xác nhận `cron.job` / `cron.job_run_details` chạy đúng nhịp.
7. Sau khi n8n test OK → đổi `reminder_config.webhook_due` sang URL `/webhook/...` production.

## 11. Việc KHÔNG làm (YAGNI)
- Không sửa app React / không deploy lại.
- Không làm gửi Zalo cá nhân trong lần này (chỉ chừa chỗ).
- Không làm cơ chế retry phức tạp cho pg_net ở bản đầu.
- Không thêm UI cấu hình mốc nhắc (60/30/5 cố định trong hàm; đổi thì sửa SQL).

## 12. Giả định cần người dùng xác nhận khi review
- **A.** Job A (8:00) liệt kê **mọi** việc `IN_PROGRESS` giống hệt tập "đang thực hiện" của app, **bao gồm** cả việc gốc lặp lại (recurrence template) nếu nó còn `IN_PROGRESS`. Nếu muốn loại việc gốc lặp lại khỏi danh sách 8:00, cần nói rõ.
- **B.** Nội dung tin Zalo do **n8n** soạn (spec này chỉ định nghĩa payload). Cần bạn dựng 2 workflow n8n tương ứng (hoặc tôi mô tả từng node để bạn dựng).
- **C.** `x-reminder-secret` sẽ được đặt và n8n phải kiểm tra header này.

---

## Phụ lục A — Phác SQL (minh hoạ, bản đầy đủ nằm ở implementation plan)

```sql
-- Bảng log
create table if not exists cong_viec_nhac_log (
  task_id      text        not null,
  moc          text        not null,
  due_snapshot timestamptz not null,
  sent_at      timestamptz not null default now(),
  unique (task_id, moc, due_snapshot)
);

-- Job B: nhắc trước hạn 60/30/5
create or replace function fn_nhac_viec_den_han() returns void language plpgsql as $$
declare
  v_url text; v_secret text; rec record;
begin
  select value into v_url    from reminder_config where key='webhook_due';
  select value into v_secret from reminder_config where key='secret';

  -- Chèn các mốc chưa nhắc rồi lặp qua đúng những dòng vừa chèn để gọi webhook
  for rec in
    with picked as (
      select t.id, t.title, t.description, t.label, t.assignee_id,
             (t.due_date)::timestamptz as due_ts, n.name as assignee_name,
             extract(epoch from ((t.due_date)::timestamptz - now()))/60 as mins_left
      from cong_viec_duoc_giao t
      left join nhan_vien n on n.id = t.assignee_id
      where t.status='IN_PROGRESS' and (t.due_date)::timestamptz > now()
    ),
    banded as (
      select *, case
        when mins_left <= 60 and mins_left > 30 then '60'
        when mins_left <= 30 and mins_left > 5  then '30'
        when mins_left <= 5  and mins_left > 0  then '5'
      end as moc from picked
    ),
    ins as (
      insert into cong_viec_nhac_log(task_id, moc, due_snapshot)
      select id, moc, due_ts from banded where moc is not null
      on conflict (task_id, moc, due_snapshot) do nothing
      returning task_id, moc
    )
    select b.* from ins join banded b on b.id=ins.task_id and b.moc=ins.moc
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-reminder-secret',v_secret),
      body := jsonb_build_object(
        'type','due_soon','moc',rec.moc,'minutes_left',round(rec.mins_left),
        'sent_at', now(),
        'task', jsonb_build_object('id',rec.id,'title',rec.title,'description',rec.description,
                'assignee_id',rec.assignee_id,'assignee_name',rec.assignee_name,
                'due_date',rec.due_ts,'label',rec.label)));
  end loop;
end $$;

-- Đăng ký lịch
select cron.schedule('nhac_den_han', '* * * * *', $$select fn_nhac_viec_den_han()$$);
select cron.schedule('nhac_8h',      '0 1 * * *', $$select fn_nhac_viec_dang_thuc_hien()$$);
```
