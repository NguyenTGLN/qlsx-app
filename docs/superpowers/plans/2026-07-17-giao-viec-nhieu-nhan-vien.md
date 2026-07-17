# Giao một công việc cho nhiều nhân viên (việc nhóm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giao một công việc cho nhiều nhân viên cùng thực hiện; ai xong trước là xong cả nhóm; có tên trong nhóm thì đều được tính vào báo cáo.

**Architecture:** Thêm cột `assignee_ids text[]` vào `cong_viec_duoc_giao`, giữ `assignee_id` cũ làm người đại diện (`= assignee_ids[1]`) do một trigger DB hai chiều canh giữ — nhờ vậy màn hình TV và code đổi mã NV không phải sửa. Logic thuần tách ra `src/lib/taskAssignees.js` để test bằng vitest; các màn hình đọc nhóm qua `memberIds()` (có fallback về `assignee_id` cho cache cũ).

**Tech Stack:** Supabase (PostgreSQL PL/pgSQL), React 19 (`createElement` + TailwindCSS theo style TaskApp), vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-giao-viec-nhieu-nhan-vien-design.md`

---

## File map

| File | Việc |
|---|---|
| `src/lib/taskAssignees.js` | TẠO MỚI: `memberIds`, `memberUsers`, `formatAssignees`, `joinAssignees`, `assigneesPayload` |
| `src/lib/taskAssignees.test.js` | TẠO MỚI: test toàn bộ hàm trên |
| `sql/setup_task_multi_assignee.sql` | TẠO MỚI: cột `assignee_ids` + migrate + index GIN + trigger đồng bộ + test block |
| `sql/setup_auto_complete_task.sql` | Trigger Zalo tìm việc theo cả nhóm + log ghi rõ tên người gửi |
| `src/pages/tasks/TaskApp.jsx` | AvatarGroup, hộp chọn nhiều NV, lọc/tìm/đếm theo nhóm, payload n8n, các đường ghi |
| `src/pages/tasks/WorkReport.jsx` | Cộng điểm cho mọi thành viên + lọc tab cá nhân theo nhóm |
| `src/pages/AdminDashboard.jsx` | Cộng điểm cho mọi thành viên |
| `project_context.md` | Ghi nhận cột mới + luật việc nhóm |

**Thứ tự:** Task 1 (lib+test) → Task 2 (SQL) → Task 3–7 (UI/báo cáo, dựa trên lib) → Task 8 (Zalo SQL) → Task 9 (docs).

---

### Task 1: Lib `taskAssignees.js` + test

**Files:**
- Create: `src/lib/taskAssignees.js`
- Test: `src/lib/taskAssignees.test.js`

- [ ] **Step 1: Viết test trước (đầy đủ, không rút gọn)**

Tạo `src/lib/taskAssignees.test.js`:

```js
import { test, expect, describe } from 'vitest';
import { memberIds, memberUsers, formatAssignees, joinAssignees, assigneesPayload } from './taskAssignees';

const USERS = [
  { id: 'NV01', name: 'Ngọc', email: 'ngoc@x.vn' },
  { id: 'NV02', name: 'Phong', email: null },
  { id: 'NV03', name: 'Tuấn' },
];
const uMap = new Map(USERS.map(u => [u.id, u]));

describe('memberIds', () => {
  test('đọc assignee_ids khi có', () => {
    expect(memberIds({ assignee_ids: ['NV01', 'NV02'], assignee_id: 'NV01' })).toEqual(['NV01', 'NV02']);
  });
  test('fallback assignee_id khi assignee_ids rỗng (cache cũ)', () => {
    expect(memberIds({ assignee_ids: [], assignee_id: 'NV02' })).toEqual(['NV02']);
  });
  test('fallback assignee_id khi assignee_ids undefined (cache cũ)', () => {
    expect(memberIds({ assignee_id: 'NV02' })).toEqual(['NV02']);
  });
  test('chưa giao ai thì trả mảng rỗng', () => {
    expect(memberIds({ assignee_ids: [], assignee_id: null })).toEqual([]);
    expect(memberIds({})).toEqual([]);
  });
  test('task null/undefined không ném lỗi', () => {
    expect(memberIds(null)).toEqual([]);
    expect(memberIds(undefined)).toEqual([]);
  });
  test('loại id rỗng và trùng lặp, giữ thứ tự', () => {
    expect(memberIds({ assignee_ids: ['NV02', '', 'NV01', 'NV02', null] })).toEqual(['NV02', 'NV01']);
  });
});

describe('memberUsers', () => {
  test('trả user theo đúng thứ tự trong nhóm', () => {
    expect(memberUsers({ assignee_ids: ['NV02', 'NV01'] }, uMap).map(u => u.name)).toEqual(['Phong', 'Ngọc']);
  });
  test('bỏ qua id không tìm thấy user', () => {
    expect(memberUsers({ assignee_ids: ['NV01', 'NV99'] }, uMap).map(u => u.name)).toEqual(['Ngọc']);
  });
  test('chưa giao ai thì rỗng', () => {
    expect(memberUsers({ assignee_ids: [] }, uMap)).toEqual([]);
  });
});

describe('formatAssignees', () => {
  test('rỗng → Chưa giao', () => {
    expect(formatAssignees([])).toBe('Chưa giao');
  });
  test('một người → tên trần', () => {
    expect(formatAssignees(['Ngọc'])).toBe('Ngọc');
  });
  test('nhiều người → tên đầu + số còn lại', () => {
    expect(formatAssignees(['Ngọc', 'Phong'])).toBe('Ngọc +1');
    expect(formatAssignees(['Ngọc', 'Phong', 'Tuấn'])).toBe('Ngọc +2');
  });
});

describe('joinAssignees', () => {
  test('rỗng → Chưa giao (giữ đúng chuỗi n8n đang in)', () => {
    expect(joinAssignees([])).toBe('Chưa giao');
  });
  test('gộp bằng dấu phẩy', () => {
    expect(joinAssignees(['Ngọc', 'Phong'])).toBe('Ngọc, Phong');
  });
});

describe('assigneesPayload', () => {
  test('trả id/name/email cho mọi thành viên', () => {
    expect(assigneesPayload({ assignee_ids: ['NV01', 'NV02'] }, uMap)).toEqual([
      { id: 'NV01', name: 'Ngọc', email: 'ngoc@x.vn' },
      { id: 'NV02', name: 'Phong', email: null },
    ]);
  });
  test('user thiếu email → null', () => {
    expect(assigneesPayload({ assignee_ids: ['NV03'] }, uMap)).toEqual([{ id: 'NV03', name: 'Tuấn', email: null }]);
  });
  test('chưa giao ai → mảng rỗng', () => {
    expect(assigneesPayload({ assignee_ids: [] }, uMap)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó FAIL**

Run: `npx vitest run src/lib/taskAssignees.test.js`
Expected: FAIL — `Failed to load ./taskAssignees` (file chưa tồn tại).

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/taskAssignees.js`:

```js
// Một việc giao cho nhiều nhân viên: nguồn sự thật là cột `assignee_ids` (text[]).
// Cột `assignee_id` cũ vẫn còn và luôn bằng assignee_ids[1] (trigger DB canh) — giữ cho
// màn hình TV và các query chưa đổi. Đọc nhóm phải qua memberIds(): dữ liệu trong
// dataCache của trình duyệt người dùng có thể còn là bản cũ chưa có cột mới.

export function memberIds(task) {
  if (!task) return [];
  const raw = Array.isArray(task.assignee_ids) && task.assignee_ids.length
    ? task.assignee_ids
    : (task.assignee_id ? [task.assignee_id] : []);
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function memberUsers(task, userMap) {
  return memberIds(task).map(id => userMap.get(id)).filter(Boolean);
}

// Nhãn ngắn cho thẻ việc / bảng việc: "Ngọc +2".
export function formatAssignees(names) {
  if (!names.length) return 'Chưa giao';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

// Chuỗi gộp gửi sang n8n — field `assignee` cũ vẫn là chuỗi nên workflow không cần sửa.
export function joinAssignees(names) {
  if (!names.length) return 'Chưa giao';
  return names.join(', ');
}

export function assigneesPayload(task, userMap) {
  return memberUsers(task, userMap).map(u => ({ id: u.id, name: u.name, email: u.email ?? null }));
}
```

- [ ] **Step 4: Chạy test để chắc chắn nó PASS**

Run: `npx vitest run src/lib/taskAssignees.test.js`
Expected: PASS — 17 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskAssignees.js src/lib/taskAssignees.test.js
git commit -m "feat(tasks): lib doc danh sach nguoi thuc hien viec nhom"
```

---

### Task 2: SQL — cột `assignee_ids` + trigger đồng bộ

**Files:**
- Create: `sql/setup_task_multi_assignee.sql`

- [ ] **Step 1: Viết file SQL đầy đủ**

Tạo `sql/setup_task_multi_assignee.sql`:

```sql
-- ==============================================================================
-- GIAO MỘT VIỆC CHO NHIỀU NHÂN VIÊN (VIỆC NHÓM)
-- Nguồn sự thật: cong_viec_duoc_giao.assignee_ids (text[])
-- Bất biến: assignee_id = assignee_ids[1] (người đại diện), do trigger dưới canh giữ.
-- Giữ assignee_id để TvDashboard + các query cũ chạy nguyên, không phải sửa.
-- ==============================================================================

-- 1. CỘT MỚI
ALTER TABLE public.cong_viec_duoc_giao
  ADD COLUMN IF NOT EXISTS assignee_ids text[] DEFAULT '{}';

-- 2. MIGRATE DỮ LIỆU CŨ (idempotent — chạy lại nhiều lần không hỏng)
UPDATE public.cong_viec_duoc_giao
   SET assignee_ids = ARRAY[assignee_id]
 WHERE assignee_id IS NOT NULL
   AND COALESCE(array_length(assignee_ids, 1), 0) = 0;

-- 3. INDEX cho truy vấn "việc có chứa NV này"
CREATE INDEX IF NOT EXISTS idx_cv_assignee_ids
  ON public.cong_viec_duoc_giao USING GIN (assignee_ids);

-- 4. TRIGGER ĐỒNG BỘ HAI CHIỀU
CREATE OR REPLACE FUNCTION public.sync_task_assignees()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Ghi kiểu mới (có mảng) → mảng quyết định người đại diện
        IF COALESCE(array_length(NEW.assignee_ids, 1), 0) > 0 THEN
            NEW.assignee_id := NEW.assignee_ids[1];
        -- Ghi kiểu cũ (chỉ có assignee_id) → dựng mảng một phần tử
        ELSIF NEW.assignee_id IS NOT NULL THEN
            NEW.assignee_ids := ARRAY[NEW.assignee_id];
        ELSE
            NEW.assignee_ids := '{}';
        END IF;

    ELSE  -- UPDATE
        IF NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids THEN
            -- Mảng đổi → mảng thắng (kể cả khi assignee_id cũng đổi cùng lúc)
            IF COALESCE(array_length(NEW.assignee_ids, 1), 0) > 0 THEN
                NEW.assignee_id := NEW.assignee_ids[1];
            ELSE
                NEW.assignee_id := NULL;
            END IF;
        ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
            -- Chỉ assignee_id đổi → đường đổi mã NV (TaskApp.jsx:1331).
            -- Thay đúng id cũ trong mảng, giữ nguyên các thành viên khác và thứ tự.
            IF NEW.assignee_id IS NULL THEN
                NEW.assignee_ids := '{}';
            ELSIF OLD.assignee_id IS NULL THEN
                NEW.assignee_ids := ARRAY[NEW.assignee_id];
            ELSE
                NEW.assignee_ids := array_replace(COALESCE(OLD.assignee_ids, '{}'), OLD.assignee_id, NEW.assignee_id);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_task_assignees ON public.cong_viec_duoc_giao;

CREATE TRIGGER trigger_sync_task_assignees
BEFORE INSERT OR UPDATE ON public.cong_viec_duoc_giao
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_assignees();

-- 5. VÁ DỮ LIỆU LỆCH (nếu có dòng nào assignee_id != assignee_ids[1] từ trước)
UPDATE public.cong_viec_duoc_giao
   SET assignee_ids = assignee_ids
 WHERE COALESCE(array_length(assignee_ids, 1), 0) > 0
   AND assignee_id IS DISTINCT FROM assignee_ids[1];
```

- [ ] **Step 2: Viết test block SQL (chạy tay, tự dọn)**

Nối vào cuối `sql/setup_task_multi_assignee.sql`:

```sql
-- ==============================================================================
-- TEST BLOCK — chạy tay trong SQL Editor. Tự dọn sạch, không để lại dữ liệu.
-- Kỳ vọng: chạy xong in "OK: tat ca 6 test deu dat".
-- ==============================================================================
DO $$
DECLARE
    v_ids  text[];
    v_one  text;
    v_nv   text;
BEGIN
    -- Cần 2 mã NV có thật để không vướng khoá ngoại assignee_id
    SELECT id INTO v_nv FROM public.nhan_vien ORDER BY id LIMIT 1;
    IF v_nv IS NULL THEN RAISE EXCEPTION 'Khong co nhan vien de test'; END IF;

    -- T1: INSERT kiểu cũ (chỉ assignee_id) → mảng tự dựng
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_id, created_date)
    VALUES ('CV-TEST1', 'test', 'IN_PROGRESS', v_nv, NOW());
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST1';
    IF v_ids <> ARRAY[v_nv] THEN RAISE EXCEPTION 'T1 fail: %', v_ids; END IF;

    -- T2: INSERT kiểu mới (mảng) → assignee_id = phần tử đầu
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_ids, created_date)
    VALUES ('CV-TEST2', 'test', 'IN_PROGRESS', ARRAY[v_nv], NOW());
    SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_one <> v_nv THEN RAISE EXCEPTION 'T2 fail: %', v_one; END IF;

    -- T3: UPDATE mảng → assignee_id chạy theo phần tử đầu
    UPDATE public.cong_viec_duoc_giao SET assignee_ids = ARRAY[v_nv, v_nv || '-X'] WHERE id = 'CV-TEST2';
    SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_one <> v_nv THEN RAISE EXCEPTION 'T3 fail: %', v_one; END IF;

    -- T4: UPDATE chỉ assignee_id (đổi mã NV) → array_replace giữ thành viên còn lại
    UPDATE public.cong_viec_duoc_giao SET assignee_id = 'NV-NEW' WHERE id = 'CV-TEST2';
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_ids <> ARRAY['NV-NEW', v_nv || '-X'] THEN RAISE EXCEPTION 'T4 fail: %', v_ids; END IF;

    -- T5: UPDATE mảng về rỗng → assignee_id = NULL
    UPDATE public.cong_viec_duoc_giao SET assignee_ids = '{}' WHERE id = 'CV-TEST2';
    SELECT assignee_id INTO v_one FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST2';
    IF v_one IS NOT NULL THEN RAISE EXCEPTION 'T5 fail: %', v_one; END IF;

    -- T6: UPDATE cột khác không đụng tới nhóm
    UPDATE public.cong_viec_duoc_giao SET title = 'test2' WHERE id = 'CV-TEST1';
    SELECT assignee_ids INTO v_ids FROM public.cong_viec_duoc_giao WHERE id = 'CV-TEST1';
    IF v_ids <> ARRAY[v_nv] THEN RAISE EXCEPTION 'T6 fail: %', v_ids; END IF;

    DELETE FROM public.cong_viec_duoc_giao WHERE id IN ('CV-TEST1', 'CV-TEST2');
    RAISE NOTICE 'OK: tat ca 6 test deu dat';
END $$;
```

> **Lưu ý T4:** `assignee_id` có khoá ngoại tới `nhan_vien` thì test này sẽ lỗi ràng buộc. Nếu gặp,
> bỏ T4 khỏi test block và kiểm chứng bằng cách đổi mã NV thật trên giao diện (Task 7 Step 4).

- [ ] **Step 3: Chạy SQL trên Supabase SQL Editor**

Dán toàn bộ file, Run.
Expected: `Success. No rows returned` + notice `OK: tat ca 6 test deu dat`.

- [ ] **Step 4: Kiểm chứng dữ liệu đã migrate**

Run:
```sql
SELECT count(*) FILTER (WHERE assignee_id IS NOT NULL AND COALESCE(array_length(assignee_ids,1),0) = 0) AS chua_migrate,
       count(*) FILTER (WHERE COALESCE(array_length(assignee_ids,1),0) > 0 AND assignee_id IS DISTINCT FROM assignee_ids[1]) AS lech
  FROM public.cong_viec_duoc_giao;
```
Expected: `chua_migrate = 0`, `lech = 0`.

- [ ] **Step 5: Commit**

```bash
git add sql/setup_task_multi_assignee.sql
git commit -m "feat(tasks): cot assignee_ids + trigger dong bo nguoi dai dien"
```

---

### Task 3: `AvatarGroup` + đọc nhóm trong `loadAll`

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (import; `loadAll` ~172; sau `AvatarName` ~421)

- [ ] **Step 1: Thêm import**

Sau dòng `import { collectPaths, deleteAttachments, deleteRemoved } from '../../lib/attachmentStorage';` thêm:

```js
    import { memberIds, memberUsers, formatAssignees, joinAssignees, assigneesPayload } from '../../lib/taskAssignees';
```

- [ ] **Step 2: `loadAll` map thêm `assignees`**

Thay khối `const tasks = (tRes.data||[]).map(...)` (~dòng 172):

```js
      const tasks = (tRes.data||[]).map(t=>({
        ...t, status: t.status === 'PENDING' ? 'IN_PROGRESS' : t.status,
        assignee: uMap.get(t.assignee_id)||null, assignees: memberUsers(t, uMap),
        progressUpdates: pMap.get(t.id)||[],
      }))
```

- [ ] **Step 3: Thêm `AvatarGroup` ngay sau `AvatarName`** (sau dòng ~421)

```js
    // Nhiều người thực hiện: chồng tối đa 3 avatar, dư thì gộp "+N". Tên rút gọn "Ngọc +2".
    function AvatarGroup({users = [], size='md', className=''}) {
      if (users.length <= 1) return h(AvatarName, {user: users[0] || null, size, className})
      const shown = users.slice(0, 3)
      const more = users.length - shown.length
      return h('div',{className:`flex flex-col items-center gap-0.5 min-w-0 ${className}`,
                      title: users.map(u=>u.name).join(', ')},
        h('div',{className:'flex -space-x-1.5'},
          shown.map(u=>h('div',{key:u.id, className:'ring-2 ring-white rounded-full'}, h(Avatar,{user:u, size}))),
          more > 0 && h('div',{className:`${AVATAR_SZ[size]||AVATAR_SZ.md} rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-[9px] ring-2 ring-white flex-shrink-0`}, `+${more}`)
        ),
        h('span',{className:'text-[9px] sm:text-[10px] font-bold text-gray-700 text-center leading-tight truncate w-full'},
          formatAssignees(users.map(u=>u.name)))
      )
    }
```

- [ ] **Step 4: Kiểm tra `AVATAR_SZ` có tồn tại ở scope này**

Run: `grep -n "AVATAR_SZ" src/pages/tasks/TaskApp.jsx`
Expected: thấy dòng khai báo `const AVATAR_SZ = {...}` TRƯỚC `function Avatar`. Nếu key `md` không có, dùng `AVATAR_SZ.sm` làm mặc định trong `AvatarGroup`.

- [ ] **Step 5: Build thử**

Run: `npm run build`
Expected: build thành công, không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(tasks): AvatarGroup + loadAll doc danh sach nguoi thuc hien"
```

---

### Task 4: TaskModal — hộp chọn nhiều nhân viên

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (`TaskModal` ~1019–1058)

- [ ] **Step 1: Đổi state khởi tạo của form** (dòng ~1025)

```js
      const [f, setF] = useState({ title: task?.title||'', description: task?.description||'', label: task?.label||'', assignee_ids: memberIds(task), due_date: toLocalInput(task?.due_date), recurrence_type: task?.recurrence_type||RECUR.NONE, status: task?.status||STATUS.IN_PROGRESS, attachments: task?.attachments||[] })
```

- [ ] **Step 2: Chặn submit khi chưa chọn ai** (trong `submit`, ~dòng 1029)

`<select required>` cũ lo việc này; hộp checkbox không có `required` nên phải tự chặn:

```js
      async function submit(e) {
        e.preventDefault()
        if (!f.assignee_ids.length) { alert('Chọn ít nhất một người thực hiện.'); return }
        setBusy(true)
        try {
          await onSave({...f, due_date: f.due_date ? new Date(f.due_date).toISOString() : null})
          deleteRemoved(initialFiles.current, f.attachments)
          onClose()
        } catch(e) { alert(e.message) } finally { setBusy(false) }
      }
```

- [ ] **Step 3: Thay ô `<select>` người thực hiện bằng hộp checkbox** (dòng ~1049)

Xoá dòng `h(Field,{label:'Người thực hiện' ...}, h('select',...))` và đặt hộp chọn RA NGOÀI lưới 2 cột (nó cao hơn các ô khác). Chèn NGAY TRƯỚC `h('div',{className:'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'},`:

```js
          h(Field,{label:`Người thực hiện (${f.assignee_ids.length})` + (!canChangeAssignee && isEdit ? ' 🔒' : ''),required:true},
            h('div',{className:`border border-gray-200 rounded-xl p-2 max-h-44 overflow-y-auto grid grid-cols-2 gap-1 ${(!canChangeAssignee && isEdit) ? 'bg-gray-100' : 'bg-white'}`},
              users.map(u => {
                const on = f.assignee_ids.includes(u.id)
                return h('label',{key:u.id,
                  className:`flex items-center gap-1.5 px-1.5 py-1 rounded-lg select-none ${(!canChangeAssignee && isEdit) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50'} ${on ? 'bg-blue-50' : ''}`},
                  h('input',{type:'checkbox', checked:on, disabled:(!canChangeAssignee && isEdit),
                    className:'w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0',
                    onChange:()=>setF(p=>({...p, assignee_ids: on ? p.assignee_ids.filter(x=>x!==u.id) : [...p.assignee_ids, u.id]}))}),
                  h(Avatar,{user:u, size:'sm'}),
                  h('span',{className:'text-[11px] sm:text-xs font-semibold text-gray-700 truncate'}, u.name)
                )
              })
            )
          ),
```

Người chọn đầu tiên thành đại diện — thứ tự mảng chính là thứ tự bấm, không hiển thị ra giao diện.

- [ ] **Step 4: Kiểm tra thủ công**

Run: `npm run dev`, mở `/tasks` → Tạo việc mới.
Expected:
- Hộp checkbox hiện đủ NV kèm avatar; bấm chọn 2 người → nhãn đổi thành `Người thực hiện (2)`.
- Không chọn ai, bấm Tạo → alert "Chọn ít nhất một người thực hiện.", modal không đóng.
- Sửa việc khi tài khoản không có quyền `change_assignee` → hộp xám, checkbox không bấm được.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(tasks): chon nhieu nhan vien khi tao/sua viec"
```

---

### Task 5: Đường ghi dữ liệu (create / recurring / optimistic update)

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (`apiCreateTask` ~193; `checkRecurring` ~283, ~299; `bootstrap`/interval ~1205, ~1237; `handleCreateTask`/`handleUpdateTask` ~1247)

- [ ] **Step 1: `apiCreateTask` ghi mảng thay vì một id** (dòng ~197)

```js
    async function apiCreateTask(form, createdBy) {
      const id = await genTaskId()
      const row = {
        id, title:form.title, description:form.description||'', status:STATUS.IN_PROGRESS, priority:form.priority||'', label:form.label||'',
        assignee_ids:form.assignee_ids||[], progress:0, sort_order:0, created_date:new Date().toISOString(),
        due_date:form.due_date||null, completed_date:null, updated_by:createdBy, last_reminded_date:null,
        recurrence_type:form.recurrence_type||RECUR.NONE, recurrence_parent_id:null, last_auto_created_date:null,
        attachments:form.attachments||[],
      }
      const { data, error } = await db.from('cong_viec_duoc_giao').insert(row).select().single()
      if (error) throw error; return data
    }
```

Phải `.select().single()` và trả `data`: trigger DB set `assignee_id`, còn `row` trong JS thì không có
— trả `row` sẽ khiến thẻ việc vừa tạo thiếu người đại diện cho tới lần reload sau.

- [ ] **Step 2: `checkRecurring` chép `assignee_ids` sang bản sao**

Trong `checkRecurring` có HAI chỗ dựng `clone` (dòng ~283 và ~299). Ở CẢ HAI, đổi
`assignee_id: tmpl.assignee_id,` thành:

```js
            assignee_ids: memberIds(tmpl),
```

Quên chỗ nào thì việc lặp hằng ngày của nhóm sẽ tự rơi về một người sau mỗi ngày.

- [ ] **Step 3: Ba nhánh map lại `assignee` sau `checkRecurring` phải map cả `assignees`**

Dòng ~1205–1206 (trong `setInterval`):

```js
              const all = [...newClones.map(c=>({...c, assignee:um.get(c.assignee_id)||null, assignees:memberUsers(c, um), progressUpdates:[]})), ...t]
                .map(task=>({...task, assignee:um.get(task.assignee_id)||task.assignee||null, assignees:memberUsers(task, um)}))
```

Dòng ~1237 (trong `bootstrap`):

```js
          const all = [...newClones.map(c=>({...c, assignee:um.get(c.assignee_id)||null, assignees:memberUsers(c, um), progressUpdates:[]})), ...t].map(task=>({...task, assignee:um.get(task.assignee_id)||task.assignee||null, assignees:memberUsers(task, um)}))
```

- [ ] **Step 4: `handleCreateTask` + `handleUpdateTask` dựng lại `assignees`** (dòng ~1247–1250)

```js
      async function handleCreateTask(form) {
        const raw = await apiCreateTask(form, me.id)
        const um = new Map(users.map(u=>[u.id,u]))
        setTasks(ts=>[{...raw, assignee:um.get(raw.assignee_id)||null, assignees:memberUsers(raw, um), progressUpdates:[]},...ts])
        toast('Đã tạo việc!')
      }
      async function handleUpdateTask(id, data) {
        const prev = tasks.find(t=>t.id===id)
        const um = new Map(users.map(u=>[u.id,u]))
        const merged = {...prev, ...data}
        const optimistic = {...merged, assignee:um.get(merged.assignee_id)||prev.assignee, assignees:memberUsers(merged, um)}
        setTasks(ts=>ts.map(t=>t.id===id?optimistic:t))
        if (detailTask?.id===id) setDetailTask(d=>({...d,...data,assignee:optimistic.assignee,assignees:optimistic.assignees}))
        try {
          const saved = await apiUpdateTask(id,{...data,updated_by:me.id})
          // Trigger DB đặt lại assignee_id theo assignee_ids → lấy bản DB làm chuẩn
          setTasks(ts=>ts.map(t=>t.id===id?{...t, ...saved, assignee:um.get(saved.assignee_id)||null, assignees:memberUsers(saved, um)}:t))
          toast('Đã cập nhật!')
        } catch(e) { setTasks(ts=>ts.map(t=>t.id===id?prev:t)); toast('Lỗi: '+e.message,'error') }
      }
```

`optimistic` cũ tính `assignee` từ `data.assignee_id||prev.assignee_id` — form giờ gửi `assignee_ids`
nên phải suy `assignee` từ mảng đã merge, và lấy lại bản DB sau khi lưu vì trigger mới là nơi quyết định `assignee_id`.

- [ ] **Step 5: Build + test**

Run: `npm run build && npx vitest run`
Expected: build OK, toàn bộ test PASS.

- [ ] **Step 6: Kiểm tra thủ công**

Run: `npm run dev` → tạo việc nhóm 2 người.
Expected: thẻ việc hiện ngay 2 avatar chồng nhau + "Ngọc +1" mà không cần F5.

- [ ] **Step 7: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(tasks): ghi assignee_ids khi tao/sua/lap lai viec"
```

---

### Task 6: Tổng quan + bảng việc + bảng cá nhân đọc theo nhóm

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (`Dashboard` ~587, ~774; `TaskTable` ~837–841, ~876; `UserTaskBoard` ~895, ~931)

- [ ] **Step 1: `Dashboard` — `userStats` đếm theo nhóm** (dòng ~587)

```js
        const ut = tasks.filter(t => memberIds(t).includes(u.id))
```

- [ ] **Step 2: `Dashboard` — thẻ việc dùng `AvatarGroup`** (dòng ~774)

```js
                    h(AvatarGroup, {users: t.assignees || [], className: 'w-11 sm:w-14 shrink-0 pt-0.5'}),
```

- [ ] **Step 3: `TaskTable` — lọc + tìm kiếm theo nhóm** (dòng ~837–838)

```js
      const filtered = tasks.filter(t=>{
        if (stFilter!=='ALL'&&t.status!==stFilter) return false
        if (assFilter!=='ALL'&&!memberIds(t).includes(assFilter)) return false
        if (search) { const q=search.toLowerCase(); const names=(t.assignees||[]).map(u=>u.name.toLowerCase()); if (!t.title.toLowerCase().includes(q)&&!t.id.toLowerCase().includes(q)&&!names.some(n=>n.includes(q))&&!(t.label||'').toLowerCase().includes(q)) return false }
        return true
      })
```

- [ ] **Step 4: `TaskTable` — cột "Người" dùng `AvatarGroup`** (dòng ~876)

```js
                      h('td',{className:tdClass}, h(AvatarGroup,{users:t.assignees||[], size:'md', className:'mx-auto max-w-[70px]'})),
```

Sort (dòng ~841) giữ nguyên theo `a.assignee?.name` — sắp theo người đại diện, đúng như spec.

- [ ] **Step 5: `UserTaskBoard` — lọc việc của người này theo nhóm** (dòng ~895 và ~931)

```js
      const [tab, setTab] = useState(() =>
        tasks.some(t => memberIds(t).includes(user.id) && t.status === STATUS.IN_PROGRESS) ? 'ACTIVE' : 'ALL');
```

```js
      const myTasks = sortKanbanTasks(tasks.filter(t => memberIds(t).includes(user.id)));
```

- [ ] **Step 6: `TaskDetail` — ô "NGƯỜI THỰC HIỆN" hiện ĐỦ tên, không rút gọn**

Trong `TaskDetail` (~dòng 1126) thay ô hiện một avatar + `task.assignee?.name`:

```js
              h('div',{className:'bg-gray-50 rounded-xl p-3'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1'},'NGƯỜI THỰC HIỆN'),
                (task.assignees||[]).length === 0
                  ? h('div',{className:'flex items-center gap-1.5'}, h(Avatar,{user:null,size:'sm'}), h('span',{className:'text-xs font-bold text-gray-800'},'—'))
                  : h('div',{className:'flex flex-wrap gap-x-3 gap-y-1.5'}, (task.assignees||[]).map(u =>
                      h('div',{key:u.id, className:'flex items-center gap-1.5 min-w-0'}, h(Avatar,{user:u,size:'sm'}), h('span',{className:'text-xs font-bold text-gray-800 truncate'},u.name))
                    ))
              ),
```

Đây là chỗ duy nhất hiện đủ tên mọi thành viên (thẻ việc và bảng việc đều rút gọn "Ngọc +2").

- [ ] **Step 7: Kiểm tra thủ công**

Run: `npm run dev`
Expected:
- Tổng quan: bảng "Thống kê nhân viên" — việc nhóm 2 người làm CẢ HAI dòng tăng số "Đang làm".
- Bấm vào dòng nhân viên B → bảng cá nhân của B có việc nhóm đó.
- Tab Công việc: lọc "Tất cả nhân viên" → chọn B → thấy việc nhóm; gõ tên B vào ô tìm → cũng thấy.
- Mở chi tiết việc nhóm → ô "NGƯỜI THỰC HIỆN" liệt kê đủ avatar + tên cả nhóm.

- [ ] **Step 8: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(tasks): tong quan + bang viec + bang ca nhan doc theo nhom"
```

---

### Task 7: Payload n8n (báo cáo ảnh + nhắc việc)

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (`Dashboard` nút Gửi báo cáo ~665–671; `handleRemind` ~1295–1310)

- [ ] **Step 1: Nút "Gửi báo cáo" — `tasks` trong payload** (dòng ~670)

`Dashboard` cần `users` để tra tên (đã có sẵn trong props). Thay dòng `tasks: tasks.map(...)`:

```js
              tasks: tasks.map(t => ({id: t.id, title: t.title, status: t.status, assignee: joinAssignees((t.assignees||[]).map(u=>u.name)), assignees: (t.assignees||[]).map(u=>({id:u.id, name:u.name})), due_date: t.due_date, priority: t.priority}))
```

`assignee` vẫn là chuỗi (`"Ngọc, Phong"`) → n8n in thẳng vào ảnh, không phải sửa workflow.
`userStats` trong payload tự đúng nhờ Task 6 Step 1.

- [ ] **Step 2: `handleRemind` — gửi cả nhóm** (dòng ~1299–1305)

```js
        const um = new Map(users.map(u=>[u.id,u]));
        const members = memberUsers(task, um);
        const primary = members[0] || null;
        const remindPayload = {
          type: 'reminder',
          timestamp: upd.last_reminded_date,
          sender: { id: me.id, name: me.name, role: me.role },
          assignee: { id: primary?.id||null, name: joinAssignees(members.map(u=>u.name)), email: primary?.email||null },
          assignees: assigneesPayload(task, um),
          task: { id: task.id, title: task.title, status: task.status, priority: task.priority, due_date: task.due_date, due_at_vn: fmtDueVN(task.due_date), description: task.description }
        };
```

`assignee` giữ nguyên dạng object → node mention hiện tại của n8n chạy như cũ (mention người đại
diện), còn `assignee.name` là chuỗi gộp nên tin nhắn đọc ra đủ tên nhóm.

- [ ] **Step 3: Kiểm tra payload thật sự gửi đi**

Run: `npm run dev` → mở DevTools tab Network → bấm "Nhắc" trên một việc nhóm.
Expected: request tới `thegioilocnuoc.site/webhook/47cc5412-...` có body chứa
`"assignee":{"id":"NV01","name":"Ngọc, Phong",...}` và mảng `"assignees":[{...},{...}]`.

- [ ] **Step 4: Kiểm tra trigger đổi mã NV không làm hỏng nhóm** (kiểm chứng Task 2 / T4)

Tạo việc nhóm gồm A và B → vào Tổng quan → Sửa nhân viên B → đổi mã NV của B → Lưu.
Expected: việc nhóm vẫn còn đủ 2 người, B hiện mã mới, không mất A.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(tasks): payload n8n gui du danh sach nguoi thuc hien"
```

---

### Task 8: Báo cáo — WorkReport + AdminDashboard

**Files:**
- Modify: `src/pages/tasks/WorkReport.jsx` (~150–183, ~263, import)
- Modify: `src/pages/AdminDashboard.jsx` (~119, ~199, import)

- [ ] **Step 1: `WorkReport.jsx` — import**

Sau `import { AttachmentBadge } from '../../components/AttachmentList';`:

```js
import { memberIds } from '../../lib/taskAssignees';
```

- [ ] **Step 2: `WorkReport.jsx` — cộng điểm cho mọi thành viên** (dòng ~150–183)

Thay trọn vòng `(tLogs || []).forEach(task => {...})`:

```js
      (tLogs || []).forEach(task => {
         let isDoneInRange = false;
         if (task.status === 'COMPLETED' && task.completed_date) {
             const cd = task.completed_date.split('T')[0];
             if (cd >= startStr && cd <= endStr) isDoneInRange = true;
         }
         const isPending = task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
         if (!isDoneInRange && !isPending) return;

         let isLate = false;
         if (task.due_date && task.completed_date) {
            isLate = (new Date(task.completed_date).getTime() - new Date(task.due_date).getTime()) > 60000;
         }

         // Bộ đếm toàn công ty: mỗi việc tính MỘT lần dù giao cho mấy người
         cTasksTotal += 1;
         if (isDoneInRange) {
            cTasksDone += 1;
            if (!isLate) cTasksOnTime += 1;
         }

         // Bộ đếm theo nhân viên: có tên trong nhóm là được tính
         memberIds(task).forEach(wId => {
            activeStaff.add(wId);
            if (!genStaffMap.has(wId)) return;
            const st = genStaffMap.get(wId);
            st.tasksTotal += 1;
            if (isDoneInRange) {
               st.tasksDone += 1;
               st.tasksDoneList.push(task.title);
               if (!isLate) st.tasksOnTime += 1;
            }
         });
      });
```

Khác bản cũ: `cTasksOnTime` giờ nằm cùng nhánh với `cTasksDone` (bản cũ chỉ cộng khi nhân viên có
trong `genStaffMap`, nên việc của NV đã xoá làm lệch tổng đúng hạn toàn công ty).

- [ ] **Step 3: `WorkReport.jsx` — tab cá nhân lọc theo nhóm** (dòng ~262–265)

```js
     const tasks = allTasks.filter(t => {
         const kw = nameKeyword.toLowerCase();
         return memberIds(t).some(id => (staffMap[id] || '').toLowerCase().includes(kw));
     });
```

- [ ] **Step 4: `AdminDashboard.jsx` — select thêm cột mới** (dòng ~119)

```js
        fetchAllRows(() => supabase.from('cong_viec_duoc_giao').select('id, title, assignee_id, assignee_ids, status, completed_date, due_date')),
```

Không thêm `assignee_ids` vào select thì `memberIds()` chỉ thấy `assignee_id` → việc nhóm chỉ tính cho một người.

- [ ] **Step 5: `AdminDashboard.jsx` — import**

Thêm cạnh các import lib hiện có:

```js
import { memberIds } from '../lib/taskAssignees';
```

- [ ] **Step 6: `AdminDashboard.jsx` — cộng điểm cho mọi thành viên** (dòng ~199)

Thay trọn dòng `tLogs.forEach(task => {...})` bằng:

```js
    tLogs.forEach(task => {
      let isDoneInRange = false;
      if (task.status === 'COMPLETED' && task.completed_date) {
        const cd = task.completed_date.split('T')[0];
        if (cd >= startStr && cd <= endStr) isDoneInRange = true;
      }
      const isPending = task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
      if (!isDoneInRange && !isPending) return;

      let isLate = false;
      if (task.due_date && task.completed_date) {
        isLate = (new Date(task.completed_date).getTime() - new Date(task.due_date).getTime()) > 60000;
      }

      cTasksTotal += 1;
      if (isDoneInRange) {
        cTasksDone += 1;
        if (!isLate) cTasksOnTime += 1;
      }

      memberIds(task).forEach(wId => {
        activeStaff.add(wId);
        if (!staffMap.has(wId)) return;
        const st = staffMap.get(wId);
        st.tasksTotal += 1;
        if (isDoneInRange) {
          st.tasksDone += 1;
          st.tasksDoneList.push(task.title);
          if (!isLate) st.tasksOnTime += 1;
        }
      });
    });
```

- [ ] **Step 7: Kiểm tra thủ công**

Run: `npm run dev`
Expected:
- `/tasks` → tab Báo cáo: việc nhóm 2 người đã hoàn thành → hiện trong danh sách "đã làm" của CẢ HAI, mỗi người `tasksDone` +1.
- `/admin` → Báo Cáo Công Việc: hai nhân viên đều được +1.
- Ô "Công Việc Giao" tổng: việc nhóm chỉ đếm 1.

- [ ] **Step 8: Commit**

```bash
git add src/pages/tasks/WorkReport.jsx src/pages/AdminDashboard.jsx
git commit -m "feat(tasks): bao cao tinh diem cho moi thanh vien trong nhom"
```

---

### Task 9: Trigger Zalo auto-complete

**Files:**
- Modify: `sql/setup_auto_complete_task.sql`

- [ ] **Step 1: Cập nhật header của file**

```sql
-- ==============================================================================
-- TRIGGER TỰ ĐỘNG HOÀN THÀNH CÔNG VIỆC TỪ ZALO
-- Mục đích: Đóng task "Báo cáo công việc cuối ngày" khi nhân viên nhắn vào nhóm
-- Nhóm đích: 6274675927160413910
-- Điều kiện: Tin nhắn phải chứa cụm từ "em gửi báo cáo" hoặc "em báo cáo"
-- Việc nhóm: ai trong nhóm gửi cũng đóng được việc cho cả nhóm (ai xong trước là xong cả nhóm)
-- ==============================================================================
```

- [ ] **Step 2: Khai báo thêm biến tên nhân viên**

Trong `DECLARE` thêm:

```sql
    v_staff_name TEXT;
```

- [ ] **Step 3: Lấy cả tên khi tra nhân viên**

```sql
        SELECT id, name INTO v_staff_id, v_staff_name
        FROM public.nhan_vien
        WHERE uid_from = NEW.uid_from
        LIMIT 1;
```

- [ ] **Step 4: Tìm việc theo cả nhóm**

```sql
            SELECT id INTO v_task_id
            FROM public.cong_viec_duoc_giao
            WHERE (assignee_ids @> ARRAY[v_staff_id] OR assignee_id = v_staff_id)
              AND title ILIKE '%Báo cáo công việc cuối ngày%'
              AND status = 'IN_PROGRESS'
              AND DATE(COALESCE(due_date, created_date) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            ORDER BY created_date DESC
            LIMIT 1;
```

Nhánh `OR assignee_id = v_staff_id` là lưới an toàn phòng dòng chưa migrate.

- [ ] **Step 5: Log ghi rõ ai đã gửi**

```sql
                INSERT INTO public.tien_do (
                    id, task_id, time, content, updated_by_id
                ) VALUES (
                    v_new_td_id,
                    v_task_id,
                    NOW(),
                    'Hệ thống tự động ghi nhận HOÀN THÀNH do ' || COALESCE(v_staff_name, v_staff_id) || ' đã gửi báo cáo lên nhóm Zalo.',
                    v_staff_id
                );
```

`updated_by_id` vẫn là người thật sự gửi, không phải người đại diện.

- [ ] **Step 6: Chạy SQL trên Supabase SQL Editor**

Dán toàn bộ file, Run.
Expected: `Success. No rows returned`.

- [ ] **Step 7: Test trigger bằng SQL (tự dọn)**

Run trong SQL Editor — thay `<UID>` bằng `uid_from` thật của một NV, `<NV>` bằng mã NV đó:

```sql
DO $$
DECLARE v_st TEXT; v_log TEXT;
BEGIN
    INSERT INTO public.cong_viec_duoc_giao (id, title, status, assignee_ids, due_date, created_date)
    VALUES ('CV-ZTEST', 'Báo cáo công việc cuối ngày', 'IN_PROGRESS', ARRAY['<NV_KHAC>', '<NV>'], NOW(), NOW());

    INSERT INTO public.zalo_messages (thread_id, uid_from, content, is_staff)
    VALUES ('6274675927160413910', '<UID>', 'em gửi báo cáo ạ', true);

    SELECT status INTO v_st FROM public.cong_viec_duoc_giao WHERE id = 'CV-ZTEST';
    IF v_st <> 'COMPLETED' THEN RAISE EXCEPTION 'FAIL: thanh vien thu 2 gui bao cao khong dong duoc viec (status=%)', v_st; END IF;

    SELECT content INTO v_log FROM public.tien_do WHERE task_id = 'CV-ZTEST' LIMIT 1;
    RAISE NOTICE 'OK — log: %', v_log;

    DELETE FROM public.tien_do WHERE task_id = 'CV-ZTEST';
    DELETE FROM public.cong_viec_duoc_giao WHERE id = 'CV-ZTEST';
    DELETE FROM public.zalo_messages WHERE thread_id = '6274675927160413910' AND content = 'em gửi báo cáo ạ';
END $$;
```

Expected: notice `OK — log: Hệ thống tự động ghi nhận HOÀN THÀNH do <Tên NV> đã gửi báo cáo lên nhóm Zalo.`
Điểm mấu chốt: `<NV>` là thành viên **thứ hai** trong nhóm → chứng minh không còn phụ thuộc `assignee_id`.

> Trigger KPI `trigger_zalo_kpi_process` cũng chạy khi insert `zalo_messages`. Nếu nó tạo thêm dòng
> ở `zalo_conversations`, xoá tay dòng đó sau khi test.

- [ ] **Step 8: Commit**

```bash
git add sql/setup_auto_complete_task.sql
git commit -m "feat(tasks): trigger zalo dong duoc viec nhom cho moi thanh vien"
```

---

### Task 10: Cập nhật `project_context.md`

**Files:**
- Modify: `project_context.md` (schema `cong_viec_duoc_giao` ~355–368; bảng SQL ~475–491)

- [ ] **Step 1: Thêm cột vào sơ đồ ERD** (~dòng 360)

Trong khối `cong_viec_duoc_giao { ... }` thêm dưới dòng `text assignee_id FK`:

```
        text_array assignee_ids
```

- [ ] **Step 2: Thêm ghi chú luật việc nhóm vào mục 5.2**

Dưới dòng `- **Trạng thái**: ...` trong mục "5.2 📋 Phân Hệ Công Việc (TaskApp)":

```markdown
- **Việc nhóm (07/2026)**: Một việc giao được cho nhiều NV qua cột `assignee_ids text[]`.
  `assignee_id` cũ vẫn còn = `assignee_ids[1]` (người đại diện), do trigger `sync_task_assignees`
  canh giữ → TvDashboard và các query cũ không phải sửa. Luật: **ai xong trước là xong cả nhóm**;
  báo cáo tính cho **mọi** thành viên có tên trong nhóm. Đọc nhóm luôn qua `memberIds()`
  (`src/lib/taskAssignees.js`). Script DB: `sql/setup_task_multi_assignee.sql`.
```

- [ ] **Step 3: Thêm dòng vào bảng SQL files** (mục 6.2, sau dòng 15)

```markdown
| 16 | `cong_viec_duoc_giao.assignee_ids` | Cột việc nhóm + trigger đồng bộ người đại diện | [setup_task_multi_assignee.sql](sql/setup_task_multi_assignee.sql) |
```

- [ ] **Step 4: Thêm trigger vào bảng 6.4**

```markdown
| `trigger_sync_task_assignees` | `cong_viec_duoc_giao` | BEFORE INSERT/UPDATE | Canh bất biến `assignee_id = assignee_ids[1]` cho việc nhóm; ghi kiểu cũ (chỉ `assignee_id`) vẫn hợp lệ |
```

- [ ] **Step 5: Commit**

```bash
git add project_context.md
git commit -m "docs: ghi nhan tinh nang viec nhom vao project_context"
```

---

### Task 11: Kiểm thử tổng thể + review

- [ ] **Step 1: Chạy toàn bộ test + lint + build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: test PASS hết, lint không lỗi mới, build thành công.

- [ ] **Step 2: Rà lại các nơi còn đọc `assignee_id` trực tiếp**

Run: `grep -rn "assignee_id" src --include=*.jsx --include=*.js | grep -v "assignee_ids" | grep -v taskAssignees`
Expected: chỉ còn các chỗ HỢP LỆ:
- `TvDashboard.jsx:36` — ngoài phạm vi, cố ý hiện người đại diện.
- `TaskApp.jsx:1331`, `1339`, `1350` — đường đổi mã NV, trigger DB lo `array_replace`.
- Các dòng `assignee: um.get(task.assignee_id)` — dựng người đại diện, đúng ý.
Bất kỳ chỗ nào KHÁC dùng `assignee_id` để lọc/đếm/so sánh là BỎ SÓT — sửa nốt.

- [ ] **Step 3: Kiểm tra hồi quy việc một người (không được vỡ)**

Run: `npm run dev`
Expected:
- Tạo việc giao đúng một người → thẻ hiện một avatar + tên trần (không có "+0").
- Việc cũ (tạo trước khi có tính năng) hiển thị y như trước.
- Nhắc việc một người → payload `assignee.name` là tên trần, không có dấu phẩy.

- [ ] **Step 4: Kiểm tra luật "ai xong trước là xong cả nhóm"**

Expected: việc nhóm A+B, đăng nhập bằng B bấm "Xong" → việc chuyển COMPLETED; đăng nhập bằng A
thấy việc đã xong, không còn ở "Đang làm".

- [ ] **Step 5: Code review**

Dùng skill `superpowers:requesting-code-review`. Sửa hết các điểm review đưa ra trước khi merge.

- [ ] **Step 6: Commit phần sửa sau review (nếu có)**

```bash
git add -A
git commit -m "fix(tasks): sua theo code review viec nhom"
```
