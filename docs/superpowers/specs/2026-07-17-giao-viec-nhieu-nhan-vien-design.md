# Giao một công việc cho nhiều nhân viên (việc nhóm)

**Ngày:** 2026-07-17
**Trạng thái:** Đã duyệt thiết kế, chờ viết plan

## 1. Mục tiêu

Hiện tại `cong_viec_duoc_giao` chỉ có **một** cột `assignee_id`, nên một việc chỉ giao được cho
một người. Cần giao một việc cho hai người trở lên cùng thực hiện.

Bốn phần:

1. **Tạo/sửa việc** — chọn được nhiều nhân viên thay vì một.
2. **Tổng quan + Công việc** — hiển thị và lọc theo việc nhóm.
3. **Báo cáo** — có tên trong nhóm thì đều được tính, ở cả WorkReport lẫn AdminDashboard.
4. **Zalo / n8n** — nút "Gửi báo cáo" (dựng ảnh), "Nhắc việc", và trigger tự động đóng việc.

## 2. Quyết định đã chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Luật hoàn thành | **Ai xong trước là xong cả nhóm** | Người dùng chốt. Một việc = một trạng thái, không có trạng thái riêng từng người. |
| Mô hình dữ liệu | Cột `assignee_ids text[]` trên `cong_viec_duoc_giao`, giữ `assignee_id` làm **người đại diện** = `assignee_ids[1]` | Một việc phải là một dòng (do luật hoàn thành ở trên). Cột cũ còn nguyên nên mọi màn hình chưa sửa vẫn chạy, chỉ thấy người đại diện. |
| Bảng phụ `cong_viec_nguoi_lam` | Loại | App fetch-all rồi map trong JS (`loadAll`), join không lợi gì; phải sửa thêm ~6 chỗ và thêm 1 query mỗi lần load. |
| Nhân dòng (mỗi người 1 dòng, chung `group_id`) | Loại | Trái với luật "ai xong trước là xong cả nhóm" — sẽ phải đồng bộ trạng thái chéo giữa các dòng, rất dễ lệch. |
| Giữ `assignee_id` đồng bộ | Trigger DB hai chiều | Là nơi duy nhất canh bất biến `assignee_id = assignee_ids[1]`. Nhờ nó, code đổi mã NV ở `TaskApp.jsx:1331` (`update assignee_id where assignee_id = old`) không cần sửa. |
| Khái niệm "nhóm trưởng" | Không có | `assignee_id` chỉ là chi tiết kỹ thuật để tương thích ngược, ẩn hoàn toàn với người dùng. Người chọn đầu tiên thành đại diện. |
| Payload n8n | Tương thích ngược | Người dùng không sửa workflow n8n. Field cũ giữ nguyên tên và kiểu, chỉ thêm field mới. |
| Trigger auto-complete Zalo | Ai trong nhóm gửi cũng đóng được | Nhất quán với luật "ai xong trước là xong cả nhóm". |
| Màn hình TV (`TvDashboard.jsx`) | Ngoài phạm vi | Người dùng chốt phạm vi không gồm TV. Nhờ cột `assignee_id` còn nguyên, TV vẫn chạy đúng — chỉ hiện tên người đại diện. |

## 3. Mô hình dữ liệu

```sql
alter table cong_viec_duoc_giao add column if not exists assignee_ids text[] default '{}';

update cong_viec_duoc_giao set assignee_ids = array[assignee_id]
 where assignee_id is not null and coalesce(array_length(assignee_ids, 1), 0) = 0;

create index if not exists idx_cv_assignee_ids on cong_viec_duoc_giao using gin (assignee_ids);
```

**Bất biến:** `assignee_id = assignee_ids[1]`, hoặc cả hai cùng rỗng/NULL.

Trigger `BEFORE INSERT OR UPDATE` canh bất biến này theo cả hai chiều:

- **INSERT**: có `assignee_ids` → set `assignee_id := assignee_ids[1]`; chỉ có `assignee_id` (ghi kiểu cũ) → set `assignee_ids := ARRAY[assignee_id]`.
- **UPDATE, `assignee_ids` đổi**: `assignee_id := assignee_ids[1]` (mảng rỗng → `assignee_id := NULL`).
- **UPDATE, chỉ `assignee_id` đổi** (đường đổi mã NV ở `TaskApp.jsx:1331`):
  `assignee_ids := array_replace(OLD.assignee_ids, OLD.assignee_id, NEW.assignee_id)`.
- Nếu cả hai cùng đổi trong một câu UPDATE: `assignee_ids` thắng.

## 4. Giao diện

### 4.1 TaskModal (tạo/sửa việc) — `TaskApp.jsx:1049`

Ô "Người thực hiện" từ `<select>` một người → hộp checkbox có avatar + tên, mỗi dòng một nhân viên.
Danh sách chỉ ~13 NV nên không cần ô tìm kiếm. Bắt buộc chọn ít nhất một người
(thay cho `required` của thẻ `<select>` cũ — phải tự validate khi submit).

Quyền `change_assignee` áp dụng nguyên như cũ: không có quyền + đang sửa → khoá cả hộp chọn.

Thứ tự chọn quyết định người đại diện (`assignee_ids[0]`), không hiển thị điều này ra giao diện.

### 4.2 AvatarGroup — thay `AvatarName` ở thẻ việc và bảng việc

`AvatarName` (`TaskApp.jsx:416`) hiện một avatar + một tên. Thêm `AvatarGroup` nhận `users: []`:

- Xếp chồng tối đa 3 avatar (avatar thứ 4 trở đi gộp thành ô `+N`).
- Dòng tên: một người → `Ngọc`; nhiều người → `Ngọc +2`.
- Mảng rỗng → giữ nguyên hành vi cũ: `Chưa giao`.

Nơi dùng: thẻ "Việc đang thực hiện" ở Tổng quan (`TaskApp.jsx:774`), cột "Người" của bảng việc (`TaskApp.jsx:876`).

Panel chi tiết việc (`TaskDetail`) hiện đủ tên mọi thành viên, không rút gọn.

### 4.3 Lọc và đếm theo nhân viên

Đổi `t.assignee_id === u.id` → `memberIds(t).includes(u.id)` (hàm ở mục 8 — đọc phòng thủ) tại:

| Vị trí | Việc |
|---|---|
| `TaskApp.jsx:587` | `userStats` ở Tổng quan |
| `TaskApp.jsx:837` | Bộ lọc `assFilter` ở bảng việc |
| `TaskApp.jsx:895`, `931` | `UserTaskBoard` — bảng việc cá nhân |

Chọn "Ngọc" ở bộ lọc thì thấy cả việc nhóm có Ngọc.

Ô tìm kiếm ở bảng việc (`TaskApp.jsx:838`) đang khớp `t.assignee?.name` → đổi thành khớp **tên bất kỳ thành viên nào**.

Sắp xếp bảng việc (`TaskApp.jsx:841`) đang sort theo `a.assignee?.name` → sort theo tên người đại diện.

## 5. Báo cáo — "có tên trong nhóm là tính hết"

Vòng lặp cộng điểm ở `WorkReport.jsx:150` và `AdminDashboard.jsx:199` đang cộng cho một `wId`
duy nhất → đổi thành cộng cho **từng thành viên** trong `assignee_ids`:

- `st.tasksTotal`, `st.tasksDone`, `st.tasksDoneList`, `st.tasksOnTime` cộng cho mọi thành viên.
- `activeStaff.add(wId)` → thêm mọi thành viên.
- Bộ đếm toàn công ty (`cTasksTotal`, `cTasksDone`, `cTasksOnTime`) vẫn cộng **một lần** cho mỗi việc.

`getPersonalData(nameKeyword)` (`WorkReport.jsx:263`) đang lọc theo tên người đại diện →
đổi thành: giữ việc nếu **tên bất kỳ thành viên nào** khớp keyword.

**Hệ quả đã được người dùng chấp nhận:** tổng "Công việc giao" toàn công ty đếm việc nhóm một
lần, nhưng tổng cộng dồn theo từng nhân viên sẽ lớn hơn (việc nhóm 3 người tính vào cả 3). Đây là
yêu cầu, không phải lỗi.

## 6. Zalo / n8n

Người dùng không sửa workflow n8n → **field cũ giữ nguyên tên và kiểu**, chỉ thêm field mới.

### 6.1 Nút "Gửi báo cáo" (dựng ảnh) — `TaskApp.jsx:665`

```js
tasks: tasks.map(t => ({
  ...,
  assignee:  'Ngọc, Phong',                        // vẫn là chuỗi — n8n in thẳng vào ảnh, không cần sửa
  assignees: [{id:'NV01',name:'Ngọc'}, {...}],     // mới
}))
```

`userStats` trong payload tự đúng sau khi sửa mục 5.

### 6.2 Nhắc việc — `TaskApp.jsx:1300`

```js
assignee: { id: <đại diện>, name: 'Ngọc, Phong', email: <email đại diện> },  // object, đúng kiểu cũ
assignees: [{id, name, email}, ...],                                          // mới
```

`assignee` giữ nguyên dạng object để node mention hiện tại của n8n chạy như cũ (mention người đại
diện), `assignee.name` là chuỗi gộp nên tin nhắn Zalo đọc ra đủ tên nhóm. Khi nào muốn mention đủ
nhóm thì n8n lặp trên `assignees` — không cần đổi app.

### 6.3 Trigger auto-complete — `sql/setup_auto_complete_task.sql`

```sql
-- cũ:  WHERE assignee_id = v_staff_id
-- mới: WHERE (assignee_ids @> ARRAY[v_staff_id] OR assignee_id = v_staff_id)
```

Nhánh `OR assignee_id = ...` là lưới an toàn phòng khi có dòng chưa được migrate.

Nội dung log `tien_do` ghi rõ ai đã gửi, vì việc nhóm thì "nhân viên" là chưa đủ:

> `Hệ thống tự động ghi nhận HOÀN THÀNH do <tên NV> đã gửi báo cáo lên nhóm Zalo.`

`updated_by` vẫn là người thật sự gửi (`v_staff_id`), không phải người đại diện.

## 7. Các đường ghi dữ liệu khác phải sửa

| Vị trí | Việc |
|---|---|
| `apiCreateTask` (`TaskApp.jsx:193`) | Ghi `assignee_ids: form.assignee_ids` (bỏ `assignee_id` — trigger tự set) |
| `checkRecurring` (`TaskApp.jsx:285`, `301`) | Bản sao việc lặp phải chép `assignee_ids` của bản gốc |
| `loadAll` (`TaskApp.jsx:172`) | Map thêm `assignees: assignee_ids.map(id => uMap.get(id))`, giữ `assignee` cũ cho code chưa đổi |
| `handleCreateTask` / `handleUpdateTask` (`TaskApp.jsx:1247`, `1249`) | Optimistic update phải dựng lại `assignees` |
| `TaskApp.jsx:1205`, `1237` | Hai nhánh map `assignee` sau `checkRecurring` — bổ sung `assignees` |
| `TaskApp.jsx:1331` | **Không sửa** — trigger DB lo `array_replace` khi đổi mã NV |

Dòng cũ có `assignee_ids` NULL/rỗng: đã được xử lý ở bước migrate. App vẫn nên phòng thủ bằng
`t.assignee_ids?.length ? t.assignee_ids : (t.assignee_id ? [t.assignee_id] : [])` khi đọc, để
cache `dataCache` cũ trong trình duyệt người dùng không làm vỡ giao diện ngay sau khi deploy.

## 8. Kiểm thử

Logic thuần tách ra `src/lib/taskAssignees.js` để test bằng vitest (theo tiền lệ `permRegistry.js`,
`docGuard.js`):

- `memberIds(task)` — đọc `assignee_ids`, fallback về `assignee_id`, khử trùng lặp, trả `[]` khi chưa giao.
- `memberUsers(task, userMap)` — trả mảng user đầy đủ, giữ đúng thứ tự, bỏ id không tra được.
- `formatAssignees(names)` — `[]` → `'Chưa giao'`; `['Ngọc']` → `'Ngọc'`; `['Ngọc','Phong']` → `'Ngọc +1'`.
- `joinAssignees(names)` — chuỗi gộp cho payload n8n: `'Ngọc, Phong'`.
- `assigneesPayload(task, userMap)` — mảng `{id, name, email}` cho field `assignees` mới của n8n.

Trigger SQL: test block trong file SQL (theo tiền lệ `sql/create_huy_phieu.sql`) phủ 4 nhánh —
insert kiểu cũ, insert kiểu mới, update mảng, update `assignee_id` (đổi mã NV).

## 9. Thứ tự triển khai (bắt buộc)

1. Chạy `sql/setup_task_multi_assignee.sql` trên Supabase SQL Editor (kèm test block).
2. Chạy `sql/setup_auto_complete_task.sql` (trigger Zalo bản mới).
3. Deploy bundle.

**Không được đảo bước 1 và 3.** Bundle mới ghi `assignee_ids` ở mọi lần tạo/sửa việc → lên trước
SQL thì PostgREST trả `PGRST204 Could not find the 'assignee_ids' column`, cả công ty không tạo/sửa
được việc nào. Chiều ngược lại an toàn nhờ nhánh fallback của `memberIds()` và trigger đồng bộ.

## 10. Ngoài phạm vi

- `TvDashboard.jsx` — vẫn hiện tên người đại diện.
- Trạng thái riêng từng người, tiến độ riêng từng người.
- Mention đủ nhóm trong tin nhắn Zalo (app đã gửi sẵn `assignees`, chờ n8n dùng).
