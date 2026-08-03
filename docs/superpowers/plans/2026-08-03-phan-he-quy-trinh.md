# Phân hệ Quy trình — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm phân hệ thứ 9 "Quy trình" — soạn lưu đồ ISO dạng swimlane bằng nút ＋, duyệt/ban hành chỉ Admin, xuất PNG / PDF / Word A3.

**Architecture:** Toàn bộ phép tính về lưu đồ nằm trong 6 module **thuần** ở `src/lib/` (hình học, định tuyến, soát lỗi, diễn giải, SVG, DOCX) — không gọi DB, không dùng API trình duyệt, nên test được bằng vitest ở `environment: 'node'`. Component React chỉ vẽ và bắt sự kiện. Mọi hàm biến đổi sơ đồ trả về **object mới** (bất biến) để hoàn tác chỉ là đẩy/rút ngăn xếp. Quyền ban hành chặn ở DB bằng **quyền ghi theo cột** + RPC `SECURITY DEFINER`, không phải chặn ở giao diện.

**Tech Stack:** React 19, Vite 8, react-router-dom 7, Supabase (PostgREST + RPC), vitest 4, jszip + file-saver (đã có sẵn — **không thêm phụ thuộc mới**).

**Spec:** `docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md`
**Mockup đã duyệt (nguồn markup + style cho phần UI):** `docs/mockups/quy-trinh-mockup.html`

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `sql/quy_trinh.sql` | 2 bảng, RLS, quyền theo cột, 3 RPC. **Chạy tay** trong Supabase SQL Editor. |
| `src/lib/quyTrinhSoDo.js` | Hằng số hình học, toạ độ khối, định tuyến đường nối, thêm/xoá/đổi cột/tự xếp lại |
| `src/lib/quyTrinhKiemTra.js` | Soát lỗi lưu đồ trước khi ban hành |
| `src/lib/quyTrinhDienGiai.js` | Sơ đồ → các dòng bảng diễn giải |
| `src/lib/quyTrinhMau.js` | Nhóm bộ phận, mẫu ISO sẵn, sinh mã số |
| `src/lib/quyTrinhSvg.js` | Sơ đồ → chuỗi SVG + `thoatXml` dùng chung |
| `src/lib/quyTrinhDocx.js` | Dựng XML `.docx` A3 (phần thuần) + gói ZIP |
| `src/lib/quyTrinhApi.js` | Lớp gọi Supabase, chỗ duy nhất chạm DB |
| `src/pages/quy-trinh/QuyTrinhApp.jsx` | ModuleShell + tab + state dùng chung |
| `src/pages/quy-trinh/DanhMucTab.jsx` | Danh mục, lọc, modal tạo mới |
| `src/pages/quy-trinh/SoanThaoTab.jsx` | Trình vẽ |
| `src/pages/quy-trinh/ThongTinTab.jsx` | Mục 1–4, 7 của tài liệu |
| `src/pages/quy-trinh/DienGiaiTab.jsx` | Bảng diễn giải |
| `src/pages/quy-trinh/XemTruocTab.jsx` | Bản in A3 + 3 nút xuất |

**Sửa:** `src/lib/permRegistry.js`, `src/lib/AuthContext.jsx:11-19`, `src/pages/HomePage.jsx:12`, `src/App.jsx:10-17` và `:53-61`.

---

## Task 1: SQL — bảng, RLS, quyền theo cột, RPC

**Files:**
- Create: `sql/quy_trinh.sql`

Không có test tự động cho SQL. Tệp này người dùng **chạy tay** trong Supabase SQL Editor; Task 19 mới đo lại bằng khoá công khai.

- [ ] **Step 1: Viết tệp SQL**

```sql
-- ============================================================
-- PHÂN HỆ QUY TRÌNH — bảng, RLS, quyền theo cột, RPC chuyển trạng thái
-- Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại được nhiều lần.
-- ============================================================

create table if not exists quy_trinh (
  id            uuid primary key default gen_random_uuid(),
  ma_so         text not null unique,
  ten           text not null,
  nhom          text not null,
  trang_thai    text not null default 'draft',
  ban_hien_hanh uuid,
  nguoi_soan    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists quy_trinh_phien_ban (
  id              uuid primary key default gen_random_uuid(),
  quy_trinh_id    uuid not null references quy_trinh(id) on delete cascade,
  phien_ban       text not null,
  lan_ban_hanh    int  not null,
  trang_thai      text not null default 'draft',
  so_do           jsonb not null default '{}'::jsonb,
  tai_lieu        jsonb not null default '{}'::jsonb,
  ngay_hieu_luc   date,
  ghi_chu_sua_doi text,
  nguoi_tao       text not null,
  nguoi_ban_hanh  text,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique (quy_trinh_id, phien_ban)
);

create index if not exists qt_pb_quy_trinh_idx on quy_trinh_phien_ban(quy_trinh_id);

alter table quy_trinh           enable row level security;
alter table quy_trinh_phien_ban enable row level security;

-- Vai trò công khai KHÔNG có policy nào ⇒ 0 dòng, không ghi được.
drop policy if exists qt_sel on quy_trinh;
drop policy if exists qt_ins on quy_trinh;
drop policy if exists qt_upd on quy_trinh;
drop policy if exists qt_del on quy_trinh;
create policy qt_sel on quy_trinh for select to authenticated using (true);
create policy qt_ins on quy_trinh for insert to authenticated with check (true);
create policy qt_upd on quy_trinh for update to authenticated using (true) with check (true);
create policy qt_del on quy_trinh for delete to authenticated using (trang_thai = 'draft');

drop policy if exists qtpb_sel on quy_trinh_phien_ban;
drop policy if exists qtpb_ins on quy_trinh_phien_ban;
drop policy if exists qtpb_upd on quy_trinh_phien_ban;
drop policy if exists qtpb_del on quy_trinh_phien_ban;
create policy qtpb_sel on quy_trinh_phien_ban for select to authenticated using (true);
create policy qtpb_ins on quy_trinh_phien_ban for insert to authenticated with check (trang_thai = 'draft');
create policy qtpb_upd on quy_trinh_phien_ban for update to authenticated using (true) with check (true);
create policy qtpb_del on quy_trinh_phien_ban for delete to authenticated using (trang_thai = 'draft');

-- ── Chặn thật: cột trạng thái KHÔNG nằm trong quyền ghi của người dùng thường ──
revoke update on quy_trinh           from authenticated;
revoke update on quy_trinh_phien_ban from authenticated;
grant  update (ten, nhom, updated_at)            on quy_trinh           to authenticated;
grant  update (so_do, tai_lieu, ghi_chu_sua_doi) on quy_trinh_phien_ban to authenticated;

-- ── RPC 1: gửi duyệt (ai đăng nhập cũng gọi được) ──
create or replace function rpc_qt_gui_duyet(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update quy_trinh_phien_ban set trang_thai = 'wait'
   where id = p_phien_ban_id and trang_thai = 'draft';
  if not found then raise exception 'Chỉ gửi duyệt được bản đang ở trạng thái nháp'; end if;
end $$;

-- ── RPC 2: trả lại (CHỈ ADMIN) ──
create or replace function rpc_qt_tra_lai(p_phien_ban_id uuid, p_ly_do text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;
  update quy_trinh_phien_ban
     set trang_thai = 'draft', ghi_chu_sua_doi = coalesce(p_ly_do, ghi_chu_sua_doi)
   where id = p_phien_ban_id and trang_thai = 'wait';
  if not found then raise exception 'Chỉ trả lại được bản đang chờ duyệt'; end if;
end $$;

-- ── RPC 3: ban hành (CHỈ ADMIN) — một giao dịch ──
create or replace function rpc_qt_ban_hanh(p_phien_ban_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_qt uuid; v_so_do jsonb; v_nodes jsonb;
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được duyệt và ban hành quy trình';
  end if;

  select quy_trinh_id, so_do into v_qt, v_so_do from quy_trinh_phien_ban
   where id = p_phien_ban_id and trang_thai = 'wait';
  if v_qt is null then raise exception 'Chỉ ban hành được bản đang chờ duyệt'; end if;

  -- Chốt chặn cấu trúc tối thiểu ở máy chủ. Luật soát lỗi ĐẦY ĐỦ (mồ côi, nhánh
  -- thiếu nhãn, thiếu diễn giải) nằm ở quyTrinhKiemTra.js phía giao diện — cố ý
  -- KHÔNG chép sang PL/pgSQL để tránh hai bản luật lệch nhau. Đây không phải ranh
  -- giới bảo mật: chỉ Admin mới tới được bước này, và Admin được tin về nội dung.
  v_nodes := coalesce(v_so_do->'nodes', '[]'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_nodes) n where n->>'t' = 'start')
  or not exists (select 1 from jsonb_array_elements(v_nodes) n where n->>'t' = 'end') then
    raise exception 'Lưu đồ phải có đủ khối Bắt đầu và Kết thúc mới ban hành được';
  end if;

  -- Bản đang hiệu lực → hết hiệu lực
  update quy_trinh_phien_ban set trang_thai = 'expired'
   where quy_trinh_id = v_qt and trang_thai = 'published';

  update quy_trinh_phien_ban
     set trang_thai = 'published', published_at = now(),
         ngay_hieu_luc = coalesce(ngay_hieu_luc, current_date),
         nguoi_ban_hanh = coalesce(auth.jwt()->>'nv_id', 'ADMIN')
   where id = p_phien_ban_id;

  update quy_trinh
     set trang_thai = 'published', ban_hien_hanh = p_phien_ban_id, updated_at = now()
   where id = v_qt;
end $$;

revoke all on function rpc_qt_gui_duyet(uuid)      from public, anon;
revoke all on function rpc_qt_tra_lai(uuid, text)  from public, anon;
revoke all on function rpc_qt_ban_hanh(uuid)       from public, anon;
grant execute on function rpc_qt_gui_duyet(uuid)     to authenticated;
grant execute on function rpc_qt_tra_lai(uuid, text) to authenticated;
grant execute on function rpc_qt_ban_hanh(uuid)      to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add sql/quy_trinh.sql
git commit -m "sql(quy-trinh): 2 bang + RLS + quyen theo cot + 3 RPC chuyen trang thai"
```

- [ ] **Step 3: Báo người dùng chạy tay**

Nói rõ: *"Cần mở Supabase SQL Editor chạy `sql/quy_trinh.sql` trước khi phần app dùng được. Tôi không tự chạy lên DB thật."* Chờ xác nhận đã chạy xong rồi mới sang các task sau — nhưng **Task 2–12 không phụ thuộc DB**, làm song song được.

---

## Task 2: `quyTrinhSoDo.js` — hằng số & hình học

**Files:**
- Create: `src/lib/quyTrinhSoDo.js`
- Test: `src/lib/quyTrinhSoDo.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { LANE_W, LOAI_KHOI, nodeX, rectOf, drawW, drawH, phaseTop, phaseOf, timKhoi } from './quyTrinhSoDo';

const soDo = {
  lanes: [
    { name: 'Kinh doanh', owner: 'NV Kinh doanh', color: '#2563eb' },
    { name: 'Kho',        owner: 'Thủ kho',       color: '#0d9488' },
  ],
  phases: [{ name: 'Tiếp nhận', h: 130 }, { name: 'Chuẩn bị', h: 200 }],
  nodes: [
    { id: 'n1', t: 'start', lane: 0, y: 30, dx: 0, w: 164, h: 48, tx: 'Bắt đầu' },
    { id: 'n2', t: 'step',  lane: 1, y: 160, dx: 0, w: 164, h: 56, tx: 'Kiểm tra tồn' },
  ],
  edges: [],
};

describe('hình học', () => {
  test('nodeX căn giữa khối trong cột của nó', () => {
    expect(nodeX(soDo.nodes[0])).toBe(0 * LANE_W + LANE_W / 2 - 164 / 2);
    expect(nodeX(soDo.nodes[1])).toBe(1 * LANE_W + LANE_W / 2 - 164 / 2);
  });
  test('nodeX cộng thêm dx khi người dùng kéo lệch', () => {
    expect(nodeX({ ...soDo.nodes[0], dx: 24 })).toBe(LANE_W / 2 - 82 + 24);
  });
  test('rectOf trả đủ 4 cạnh và tâm', () => {
    const r = rectOf(soDo.nodes[1]);
    expect(r).toEqual({ x: LANE_W + 24, y: 160, w: 164, h: 56, cx: LANE_W + 106, cy: 188 });
  });
  test('drawW theo số cột, drawH theo tổng chiều cao hàng', () => {
    expect(drawW(soDo)).toBe(2 * LANE_W);
    expect(drawH(soDo)).toBe(330);
  });
  test('phaseTop cộng dồn chiều cao các hàng phía trên', () => {
    expect(phaseTop(soDo, 0)).toBe(0);
    expect(phaseTop(soDo, 1)).toBe(130);
  });
  test('phaseOf trả hàng chứa tâm khối', () => {
    expect(phaseOf(soDo, soDo.nodes[0])).toBe(0);
    expect(phaseOf(soDo, soDo.nodes[1])).toBe(1);
  });
  test('phaseOf kẹp về hàng cuối khi khối rơi quá đáy', () => {
    expect(phaseOf(soDo, { ...soDo.nodes[1], y: 9999 })).toBe(1);
  });
  test('timKhoi tìm theo id, không thấy trả undefined', () => {
    expect(timKhoi(soDo, 'n2').tx).toBe('Kiểm tra tồn');
    expect(timKhoi(soDo, 'zzz')).toBeUndefined();
  });
  test('LOAI_KHOI đủ 7 loại, loại nào cũng có nhãn/màu/kích thước', () => {
    expect(Object.keys(LOAI_KHOI)).toEqual(['start','end','step','dec','check','doc','data']);
    for (const k of Object.keys(LOAI_KHOI)) {
      expect(LOAI_KHOI[k].nhan).toBeTruthy();
      expect(LOAI_KHOI[k].mau).toMatch(/^#[0-9a-f]{6}$/i);
      expect(LOAI_KHOI[k].w).toBeGreaterThan(0);
      expect(LOAI_KHOI[k].h).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhSoDo"`

- [ ] **Step 3: Viết module tối thiểu**

```js
// ============================================================
// QUY TRÌNH — hình học & biến đổi sơ đồ lưu đồ swimlane.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md
//
// Cột = bộ phận, hàng = giai đoạn. Người thực hiện SUY RA từ cột,
// không lưu trùng ở khối — đổi cột là đổi người, một nguồn sự thật.
//
// Mọi hàm biến đổi trả về SƠ ĐỒ MỚI (bất biến) để hoàn tác chỉ là
// đẩy/rút ngăn xếp, và để test so sánh được trước/sau.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

export const GUT = 112;      // bề ngang cột nhãn giai đoạn
export const LANE_W = 212;   // bề ngang mỗi cột bộ phận
export const HEAD_H = 46;    // chiều cao hàng tiêu đề cột

export const LOAI_KHOI = {
  start: { nhan: 'Bắt đầu',    mau: '#16a34a', w: 164, h: 48 },
  end:   { nhan: 'Kết thúc',   mau: '#475569', w: 164, h: 48 },
  step:  { nhan: 'Thao tác',   mau: '#2563eb', w: 164, h: 56 },
  dec:   { nhan: 'Quyết định', mau: '#d97706', w: 150, h: 86 },
  check: { nhan: 'Kiểm tra',   mau: '#0891b2', w: 164, h: 56 },
  doc:   { nhan: 'Tài liệu',   mau: '#7c3aed', w: 164, h: 56 },
  data:  { nhan: 'Dữ liệu',    mau: '#db2777', w: 164, h: 56 },
};

export const MAU_DUONG = { n: '#64748b', ok: '#16a34a', ng: '#dc2626' };

export const laneX = i => i * LANE_W;
export const nodeX = n => laneX(n.lane) + LANE_W / 2 - n.w / 2 + (n.dx || 0);

export function rectOf(n) {
  const x = nodeX(n);
  return { x, y: n.y, w: n.w, h: n.h, cx: x + n.w / 2, cy: n.y + n.h / 2 };
}

export const drawW = soDo => soDo.lanes.length * LANE_W;
export const drawH = soDo => soDo.phases.reduce((s, p) => s + p.h, 0);
export const phaseTop = (soDo, i) => soDo.phases.slice(0, i).reduce((s, p) => s + p.h, 0);
export const timKhoi = (soDo, id) => soDo.nodes.find(n => n.id === id);

export function phaseOf(soDo, n) {
  let acc = 0;
  for (let i = 0; i < soDo.phases.length; i++) {
    acc += soDo.phases[i].h;
    if (n.y + n.h / 2 < acc) return i;
  }
  return soDo.phases.length - 1;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhSoDo.js src/lib/quyTrinhSoDo.test.js
git commit -m "feat(quy-trinh): hinh hoc so do swimlane"
```

---

## Task 3: `quyTrinhSoDo.js` — định tuyến đường nối

Bốn trường hợp ở mục D của spec. Đây là phần dễ sai nhất, nên test trước từng trường hợp.

**Files:**
- Modify: `src/lib/quyTrinhSoDo.js`
- Test: `src/lib/quyTrinhSoDo.test.js`

- [ ] **Step 1: Viết test thất bại (thêm vào cuối tệp test)**

```js
import { routeEdge } from './quyTrinhSoDo';

// Đếm số đoạn thẳng trong path để biết đường bẻ mấy góc.
const soDoan = d => (d.match(/L/g) || []).length;

describe('định tuyến đường nối', () => {
  const nn = (id, lane, y, w = 164, h = 56) => ({ id, t: 'step', lane, y, dx: 0, w, h, tx: id });
  const mk = (nodes, edge) => ({ lanes: [{}, {}, {}], phases: [{ name: 'x', h: 900 }], nodes, edges: [edge] });

  test('cùng tầm cao → đi ngang, không bẻ góc', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(soDoan(d)).toBe(1);
  });

  test('đích ở dưới, thẳng cột → đi thẳng xuống', () => {
    const s = mk([nn('a', 1, 100), nn('b', 1, 300)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(soDoan(d)).toBe(1);
    expect(d.startsWith('M318 156')).toBe(true); // ra cạnh dưới khối a
  });

  test('đích ở dưới và lệch cột → bẻ 2 góc (xuống, ngang, xuống)', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 300)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(d).toContain('Q');           // có bo góc
    expect(soDoan(d)).toBeGreaterThan(1);
  });

  test('đích ở trên → vòng ngược lên rồi đâm vào cạnh bên', () => {
    const s = mk([nn('a', 0, 400), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'n', lbl: '' });
    const { d } = routeEdge(s, s.edges[0]);
    expect(d).toContain('Q');
  });

  test('trả toạ độ nhãn nằm trên đường', () => {
    const s = mk([nn('a', 0, 100), nn('b', 2, 100)], { id: 'e', a: 'a', b: 'b', k: 'ok', lbl: 'OK' });
    const { nhan } = routeEdge(s, s.edges[0]);
    expect(nhan).toHaveLength(2);
    expect(Number.isFinite(nhan[0])).toBe(true);
    expect(Number.isFinite(nhan[1])).toBe(true);
  });

  test('thiếu khối đầu hoặc cuối → trả null thay vì ném lỗi', () => {
    const s = mk([nn('a', 0, 100)], { id: 'e', a: 'a', b: 'khong-co', k: 'n', lbl: '' });
    expect(routeEdge(s, s.edges[0])).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js -t "định tuyến"`
Expected: FAIL — `routeEdge is not a function`

- [ ] **Step 3: Thêm `routeEdge` vào `quyTrinhSoDo.js`**

```js
/** Đường nối gấp khúc vuông góc, bo góc 9px — kiểu lưu đồ ISO.
 *  Trả { d, nhan:[x,y] }, hoặc null nếu thiếu khối đầu/cuối. */
export function routeEdge(soDo, e) {
  const A0 = timKhoi(soDo, e.a), B0 = timKhoi(soDo, e.b);
  if (!A0 || !B0) return null;
  const A = rectOf(A0), B = rectOf(B0);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  let pts;

  if (Math.abs(dy) < 46) {                       // cùng tầm cao → đi ngang
    const phai = dx > 0;
    pts = [[phai ? A.x + A.w : A.x, A.cy], [phai ? B.x : B.x + B.w, B.cy]];
  } else if (dy > 0) {                           // đi xuống
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y + A.h], [B.cx, B.y]];
    } else {
      const giua = Math.max(A.y + A.h + 18, (A.y + A.h + B.y) / 2);
      pts = [[A.cx, A.y + A.h], [A.cx, giua], [B.cx, giua], [B.cx, B.y]];
    }
  } else {                                       // vòng ngược lên
    if (Math.abs(dx) < 24) {
      pts = [[A.cx, A.y], [B.cx, B.y + B.h]];
    } else {
      const phai = dx > 0;
      pts = [[A.cx, A.y], [A.cx, B.cy], [phai ? B.x : B.x + B.w, B.cy]];
    }
  }

  let d = `M${pts[0][0]} ${pts[0][1]}`;
  const R = 9;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1, l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const r = Math.min(R, l1 / 2, l2 / 2);
    d += ` L${cx + (px - cx) / l1 * r} ${cy + (py - cy) / l1 * r}`;
    d += ` Q${cx} ${cy} ${cx + (nx - cx) / l2 * r} ${cy + (ny - cy) / l2 * r}`;
  }
  const cuoi = pts[pts.length - 1];
  d += ` L${cuoi[0]} ${cuoi[1]}`;

  // Nhãn đặt giữa đoạn dài nhất
  let best = 0, bl = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bl) { bl = len; best = i; }
  }
  return { d, nhan: [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2] };
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js`
Expected: PASS — 14 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhSoDo.js src/lib/quyTrinhSoDo.test.js
git commit -m "feat(quy-trinh): dinh tuyen duong noi vuong goc 4 truong hop"
```

---

## Task 4: `quyTrinhSoDo.js` — thêm bước bằng nút ＋, xoá khối, đổi cột

Đây là thao tác chính của toàn phân hệ (quyết định Q1 của spec).

**Files:**
- Modify: `src/lib/quyTrinhSoDo.js`
- Test: `src/lib/quyTrinhSoDo.test.js`

- [ ] **Step 1: Viết test thất bại (thêm vào cuối tệp test)**

```js
import { themBuoc, xoaKhoi, doiCot, thuTuBuoc } from './quyTrinhSoDo';

describe('thêm bước bằng nút ＋', () => {
  const base = () => ({
    lanes: [
      { name: 'Kế hoạch', owner: 'NV Kế hoạch', color: '#7c3aed' },
      { name: 'Kho',      owner: 'Thủ kho',     color: '#0d9488' },
      { name: 'QC',       owner: 'NV QC',       color: '#16a34a' },
    ],
    phases: [{ name: 'G1', h: 600 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 1, y: 100, dx: 0, w: 164, h: 56, tx: 'Xuất kho', desc: 'x', form: '—', time: '—' },
      { id: 'n2', t: 'dec',  lane: 1, y: 220, dx: 0, w: 150, h: 86, tx: 'Đạt?',     desc: 'x', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'n1', b: 'n2', lbl: '', k: 'n' }],
  });

  test('bước mới nằm DƯỚI khối nguồn và được nối tự động', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'check', cot: 2, ten: 'Kiểm QC' });
    const moi = s.nodes.find(n => n.tx === 'Kiểm QC');
    expect(moi).toBeTruthy();
    expect(moi.t).toBe('check');
    expect(moi.lane).toBe(2);
    expect(moi.y).toBe(100 + 56 + 46);
    expect(s.edges.some(e => e.a === 'n1' && e.b === moi.id && e.k === 'n')).toBe(true);
  });

  test('nhánh NG rẽ NGANG cùng tầm cao và mang nhãn NG', () => {
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ng', loai: 'step', cot: 0, ten: 'Tái chế' });
    const moi = s.nodes.find(n => n.tx === 'Tái chế');
    expect(moi.y).toBe(220 + Math.round((86 - 56) / 2));   // cùng tâm với khối quyết định
    const e = s.edges.find(x => x.b === moi.id);
    expect(e.k).toBe('ng');
    expect(e.lbl).toBe('NG');
  });

  test('nhánh OK mang nhãn OK', () => {
    const s = themBuoc(base(), { tuId: 'n2', nhanh: 'ok', loai: 'doc', cot: 1, ten: 'Nhập kho' });
    expect(s.edges.find(x => x.b === s.nodes.at(-1).id).lbl).toBe('OK');
  });

  test('khối đang chắn chỗ trong cùng cột bị đẩy xuống', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'Chèn giữa' });
    const n2 = s.nodes.find(n => n.id === 'n2');
    expect(n2.y).toBeGreaterThan(220);        // n2 đã bị đẩy khỏi chỗ 202..258
  });

  test('không có tên thì dùng "Bước mới", và luôn có sẵn ô diễn giải', () => {
    const s = themBuoc(base(), { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: '' });
    const moi = s.nodes.at(-1);
    expect(moi.tx).toBe('Bước mới');
    expect(typeof moi.desc).toBe('string');
  });

  test('nới chiều cao hàng cuối khi lưu đồ dài ra', () => {
    let s = base(); s.phases = [{ name: 'G1', h: 180 }];
    s = themBuoc(s, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'Dài ra' });
    expect(drawH(s)).toBeGreaterThan(180);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const goc = base();
    const truoc = JSON.stringify(goc);
    themBuoc(goc, { tuId: 'n1', nhanh: '', loai: 'step', cot: 1, ten: 'X' });
    expect(JSON.stringify(goc)).toBe(truoc);
  });

  test('nguồn không tồn tại → ném lỗi rõ ràng', () => {
    expect(() => themBuoc(base(), { tuId: 'zzz', nhanh: '', loai: 'step', cot: 0, ten: 'X' }))
      .toThrow(/không tìm thấy khối nguồn/i);
  });
});

describe('xoá khối & đổi cột', () => {
  const base = () => ({
    lanes: [{ name: 'A', owner: 'Người A', color: '#111111' }, { name: 'B', owner: 'Người B', color: '#222222' }],
    phases: [{ name: 'G1', h: 400 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 0, y: 40,  dx: 12, w: 164, h: 56, tx: 'A', desc: '', form: '—', time: '—' },
      { id: 'n2', t: 'step', lane: 0, y: 160, dx: 0,  w: 164, h: 56, tx: 'B', desc: '', form: '—', time: '—' },
    ],
    edges: [{ id: 'e1', a: 'n1', b: 'n2', lbl: '', k: 'n' }],
  });

  test('xoá khối kéo theo mọi đường nối của nó', () => {
    const s = xoaKhoi(base(), 'n2');
    expect(s.nodes).toHaveLength(1);
    expect(s.edges).toHaveLength(0);
  });

  test('đổi cột thì reset dx để khối căn giữa cột mới', () => {
    const s = doiCot(base(), 'n1', 1);
    const n1 = s.nodes.find(n => n.id === 'n1');
    expect(n1.lane).toBe(1);
    expect(n1.dx).toBe(0);
  });

  test('thuTuBuoc bỏ Bắt đầu/Kết thúc, xếp trên→dưới rồi trái→phải', () => {
    const s = base();
    s.nodes.push({ id: 'n0', t: 'start', lane: 0, y: 0, dx: 0, w: 164, h: 48, tx: 'Bắt đầu' });
    expect(thuTuBuoc(s)).toEqual(['n1', 'n2']);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js -t "thêm bước"`
Expected: FAIL — `themBuoc is not a function`

- [ ] **Step 3: Thêm các hàm biến đổi vào `quyTrinhSoDo.js`**

```js
const KHOANG_DOC = 46;   // khoảng hở dọc giữa hai bước nối tiếp

const sao = soDo => ({
  lanes:  soDo.lanes.map(l => ({ ...l })),
  phases: soDo.phases.map(p => ({ ...p })),
  nodes:  soDo.nodes.map(n => ({ ...n })),
  edges:  soDo.edges.map(e => ({ ...e })),
});

let dem = 0;
const idMoi = tien => `${tien}${Date.now().toString(36)}${(dem++).toString(36)}`;

/** Thứ tự đánh số bước: trên xuống dưới, trái sang phải. Bỏ Bắt đầu/Kết thúc. */
export function thuTuBuoc(soDo) {
  return soDo.nodes
    .filter(n => n.t !== 'start' && n.t !== 'end')
    .slice()
    .sort((a, b) => (a.y - b.y) || (nodeX(a) - nodeX(b)))
    .map(n => n.id);
}

/** Thêm bước nối tiếp từ một khối. Tự đặt chỗ, tự nối, tự đẩy khối chắn chỗ.
 *  nhanh: '' | 'ok' | 'ng'  — 'ng' rẽ ngang cùng tầm, còn lại xuống dưới. */
export function themBuoc(soDo, { tuId, nhanh = '', loai, cot, ten }) {
  const nguon = timKhoi(soDo, tuId);
  if (!nguon) throw new Error('Không tìm thấy khối nguồn khi thêm bước: ' + tuId);
  const T = LOAI_KHOI[loai];
  if (!T) throw new Error('Loại khối không hợp lệ: ' + loai);

  const s = sao(soDo);
  const y = nhanh === 'ng'
    ? nguon.y + Math.round((nguon.h - T.h) / 2)
    : nguon.y + nguon.h + KHOANG_DOC;

  // Đẩy khối đang chắn chỗ trong cùng cột xuống dưới
  for (const n of s.nodes) {
    if (n.lane === cot && n.y + n.h > y - 12 && n.y < y + T.h + 12) n.y += T.h + KHOANG_DOC;
  }

  const id = idMoi('n');
  s.nodes.push({
    id, t: loai, lane: cot, y, dx: 0, w: T.w, h: T.h,
    tx: (ten || '').trim() || 'Bước mới',
    desc: '', form: '—', time: '—', color: null,
  });
  s.edges.push({
    id: idMoi('e'), a: tuId, b: id,
    lbl: nhanh === 'ok' ? 'OK' : nhanh === 'ng' ? 'NG' : '',
    k: nhanh || 'n',
  });

  // Nới hàng cuối nếu lưu đồ dài ra
  const can = Math.max(...s.nodes.map(n => n.y + n.h)) + 34;
  if (can > drawH(s)) s.phases[s.phases.length - 1].h += can - drawH(s);
  return s;
}

export function xoaKhoi(soDo, id) {
  const s = sao(soDo);
  s.nodes = s.nodes.filter(n => n.id !== id);
  s.edges = s.edges.filter(e => e.a !== id && e.b !== id);
  return s;
}

/** Đổi cột = đổi bộ phận phụ trách = đổi người thực hiện ở bảng diễn giải. */
export function doiCot(soDo, id, cot) {
  const s = sao(soDo);
  const n = s.nodes.find(x => x.id === id);
  if (n) { n.lane = cot; n.dx = 0; }
  return s;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js`
Expected: PASS — 25 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhSoDo.js src/lib/quyTrinhSoDo.test.js
git commit -m "feat(quy-trinh): them buoc bang nut cong, xoa khoi, doi cot"
```

---

## Task 5: `quyTrinhSoDo.js` — tự xếp lại

Ràng buộc quan trọng: **không đảo thứ tự người dùng đã dựng** — người dùng phải đoán được kết quả.

**Files:**
- Modify: `src/lib/quyTrinhSoDo.js`
- Test: `src/lib/quyTrinhSoDo.test.js`

- [ ] **Step 1: Viết test thất bại (thêm vào cuối tệp test)**

```js
import { tuXepLai } from './quyTrinhSoDo';

describe('tự xếp lại', () => {
  const base = () => ({
    lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' }],
    phases: [{ name: 'G1', h: 300 }, { name: 'G2', h: 300 }],
    nodes: [
      { id: 'n1', t: 'step', lane: 0, y: 30,  dx: 37, w: 164, h: 56, tx: 'một',  desc: '', form: '—', time: '—' },
      { id: 'n2', t: 'step', lane: 1, y: 150, dx: -9, w: 164, h: 56, tx: 'hai',  desc: '', form: '—', time: '—' },
      { id: 'n3', t: 'step', lane: 0, y: 380, dx: 21, w: 164, h: 56, tx: 'ba',   desc: '', form: '—', time: '—' },
    ],
    edges: [],
  });

  test('mọi khối căn giữa cột — dx về 0', () => {
    const s = tuXepLai(base());
    expect(s.nodes.every(n => n.dx === 0)).toBe(true);
  });

  test('KHÔNG đảo thứ tự trên-dưới đã dựng', () => {
    const s = tuXepLai(base());
    const y = id => s.nodes.find(n => n.id === id).y;
    expect(y('n1')).toBeLessThan(y('n2'));
    expect(y('n2')).toBeLessThan(y('n3'));
  });

  test('khối vẫn nằm đúng giai đoạn cũ', () => {
    const goc = base();
    const s = tuXepLai(goc);
    for (const n of s.nodes) {
      const cu = goc.nodes.find(x => x.id === n.id);
      expect(phaseOf(s, n)).toBe(phaseOf(goc, cu));
    }
  });

  test('hai khối cùng tầm cao được giữ chung một tầng', () => {
    const g = base();
    g.nodes[1].y = 34;                       // n2 gần n1 (30) → cùng tầng
    const s = tuXepLai(g);
    const n1 = s.nodes.find(n => n.id === 'n1'), n2 = s.nodes.find(n => n.id === 'n2');
    expect(n1.y).toBe(n2.y);
  });

  test('BẤT BIẾN — sơ đồ gốc không bị sửa', () => {
    const g = base(), truoc = JSON.stringify(g);
    tuXepLai(g);
    expect(JSON.stringify(g)).toBe(truoc);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js -t "tự xếp lại"`
Expected: FAIL — `tuXepLai is not a function`

- [ ] **Step 3: Thêm `tuXepLai` vào `quyTrinhSoDo.js`**

```js
/** Căn giữa khối theo cột và giãn đều trong từng giai đoạn.
 *  CỐ Ý không đảo thứ tự: người dùng phải đoán được kết quả trước khi bấm. */
export function tuXepLai(soDo) {
  const s = sao(soDo);
  const HO = 44, LE = 28;
  const nhom = s.phases.map(() => []);
  for (const n of s.nodes) nhom[phaseOf(soDo, n)].push(n);

  nhom.forEach((g, i) => {
    g.sort((a, b) => (a.y - b.y) || (nodeX(a) - nodeX(b)));
    const tang = [];
    for (const n of g) {
      const t = tang.find(t => Math.abs(t.y - n.y) < HO);
      if (t) t.items.push(n); else tang.push({ y: n.y, items: [n] });
    }
    let cur = LE;
    for (const t of tang) {
      const hMax = Math.max(...t.items.map(n => n.h));
      for (const n of t.items) {
        n.dx = 0;
        n.y = phaseTop(s, i) + cur + Math.round((hMax - n.h) / 2);
      }
      cur += hMax + HO;
    }
    s.phases[i].h = Math.max(s.phases[i].h, cur - HO + LE);
  });
  return s;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhSoDo.test.js`
Expected: PASS — 30 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhSoDo.js src/lib/quyTrinhSoDo.test.js
git commit -m "feat(quy-trinh): tu xep lai giu nguyen thu tu nguoi dung dung"
```

---

## Task 6: `quyTrinhKiemTra.js` — soát lỗi trước khi ban hành

**Files:**
- Create: `src/lib/quyTrinhKiemTra.js`
- Test: `src/lib/quyTrinhKiemTra.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { kiemTraLuuDo, coTheBanHanh } from './quyTrinhKiemTra';

const K = (id, t, lane, y, extra = {}) => ({
  id, t, lane, y, dx: 0, w: t === 'dec' ? 150 : 164, h: t === 'dec' ? 86 : 56,
  tx: id, desc: 'có diễn giải', form: 'BM-01', time: '1 giờ', ...extra,
});

/** Lưu đồ nhỏ nhưng HỢP LỆ: bắt đầu → thao tác → kết thúc. */
const sach = () => ({
  lanes: [{ name: 'A', owner: 'a', color: '#111111' }],
  phases: [{ name: 'G', h: 400 }],
  nodes: [K('s', 'start', 0, 10), K('b1', 'step', 0, 100), K('e', 'end', 0, 200)],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '', k: 'n' },
    { id: 'e2', a: 'b1', b: 'e',  lbl: '', k: 'n' },
  ],
});

describe('kiemTraLuuDo', () => {
  test('lưu đồ hợp lệ → không lỗi, không cảnh báo', () => {
    const r = kiemTraLuuDo(sach());
    expect(r.loi).toEqual([]);
    expect(r.canhBao).toEqual([]);
    expect(coTheBanHanh(sach())).toBe(true);
  });

  test('thiếu khối Bắt đầu → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'start');
    s.edges = s.edges.filter(e => e.a !== 's');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_BAT_DAU')).toBe(true);
  });

  test('thiếu khối Kết thúc → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'end');
    s.edges = s.edges.filter(e => e.b !== 'e');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_KET_THUC')).toBe(true);
  });

  test('khối mồ côi không có đường vào → lỗi kèm id khối', () => {
    const s = sach(); s.nodes.push(K('mc', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'mc', b: 'e', lbl: '', k: 'n' });
    const l = kiemTraLuuDo(s).loi.find(x => x.ma === 'KHONG_CO_DUONG_VAO');
    expect(l.khoiId).toBe('mc');
  });

  test('khối không có đường ra → lỗi', () => {
    const s = sach(); s.nodes.push(K('cut', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'b1', b: 'cut', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_CO_DUONG_RA' && x.khoiId === 'cut')).toBe(true);
  });

  test('khối Quyết định chỉ có 1 nhánh ra → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300));
    s.edges.push({ id: 'e8', a: 'b1', b: 'd', lbl: '', k: 'n' });
    s.edges.push({ id: 'e9', a: 'd', b: 'e', lbl: 'OK', k: 'ok' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'QUYET_DINH_THIEU_NHANH')).toBe(true);
  });

  test('nhánh của khối Quyết định thiếu nhãn → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300), K('b2', 'step', 0, 420));
    s.edges.push(
      { id: 'e8',  a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
      { id: 'e9',  a: 'd',  b: 'e',  lbl: 'OK', k: 'ok' },
      { id: 'e10', a: 'd',  b: 'b2', lbl: '',   k: 'ng' },   // thiếu nhãn
      { id: 'e11', a: 'b2', b: 'e',  lbl: '',   k: 'n'  },
    );
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NHANH_THIEU_NHAN')).toBe(true);
  });

  test('bước thiếu diễn giải → lỗi (tài liệu ISO không được có ô trống)', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '   ';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(true);
  });

  test('Bắt đầu/Kết thúc KHÔNG bị đòi diễn giải', () => {
    const s = sach();
    s.nodes.find(n => n.t === 'start').desc = '';
    s.nodes.find(n => n.t === 'end').desc = '';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(false);
  });

  test('thiếu hồ sơ hoặc thời gian → chỉ CẢNH BÁO, vẫn ban hành được', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').form = '—';
    s.nodes.find(n => n.id === 'b1').time = '—';
    const r = kiemTraLuuDo(s);
    expect(r.loi).toEqual([]);
    expect(r.canhBao.length).toBeGreaterThan(0);
    expect(coTheBanHanh(s)).toBe(true);
  });

  test('hai khối chồng lên nhau → cảnh báo', () => {
    const s = sach(); s.nodes.push(K('ck', 'step', 0, 100));
    s.edges.push({ id: 'e8', a: 'b1', b: 'ck', lbl: '', k: 'n' }, { id: 'e9', a: 'ck', b: 'e', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).canhBao.some(x => x.ma === 'CHONG_KHOI')).toBe(true);
  });

  test('còn lỗi thì coTheBanHanh = false', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '';
    expect(coTheBanHanh(s)).toBe(false);
  });

  test('sơ đồ rỗng không làm nổ hàm', () => {
    const r = kiemTraLuuDo({ lanes: [], phases: [], nodes: [], edges: [] });
    expect(r.loi.some(x => x.ma === 'THIEU_BAT_DAU')).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhKiemTra.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhKiemTra"`

- [ ] **Step 3: Viết module**

```js
// ============================================================
// QUY TRÌNH — soát lỗi lưu đồ trước khi ban hành.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục E)
//
// LỖI chặn ban hành. CẢNH BÁO chỉ nhắc.
// Hàm này chạy CẢ ở giao diện lẫn trong RPC ban hành phía máy chủ —
// không tin vào việc giao diện đã soát rồi.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

import { rectOf } from './quyTrinhSoDo';

const trong = v => !String(v ?? '').trim() || String(v).trim() === '—';

export function kiemTraLuuDo(soDo) {
  const loi = [], canhBao = [];
  const nodes = soDo?.nodes || [], edges = soDo?.edges || [];
  const them = (arr, ma, thongDiep, khoiId = null) => arr.push({ ma, thongDiep, khoiId });

  if (!nodes.some(n => n.t === 'start')) them(loi, 'THIEU_BAT_DAU', 'Lưu đồ chưa có khối Bắt đầu.');
  if (!nodes.some(n => n.t === 'end'))   them(loi, 'THIEU_KET_THUC', 'Lưu đồ chưa có khối Kết thúc.');

  const vao = new Set(edges.map(e => e.b));
  const ra  = new Set(edges.map(e => e.a));

  for (const n of nodes) {
    if (n.t !== 'start' && !vao.has(n.id))
      them(loi, 'KHONG_CO_DUONG_VAO', `Khối "${n.tx}" không có đường nối đi vào.`, n.id);
    if (n.t !== 'end' && !ra.has(n.id))
      them(loi, 'KHONG_CO_DUONG_RA', `Khối "${n.tx}" không có đường nối đi ra.`, n.id);

    if (n.t === 'dec') {
      const nhanh = edges.filter(e => e.a === n.id);
      if (nhanh.length < 2)
        them(loi, 'QUYET_DINH_THIEU_NHANH', `Khối quyết định "${n.tx}" phải có ít nhất 2 nhánh ra.`, n.id);
      for (const e of nhanh) {
        if (trong(e.lbl))
          them(loi, 'NHANH_THIEU_NHAN', `Một nhánh của "${n.tx}" chưa có nhãn (OK / NG / Đủ / Thiếu…).`, n.id);
      }
    }

    if (n.t !== 'start' && n.t !== 'end') {
      if (trong(n.desc))
        them(loi, 'THIEU_DIEN_GIAI', `Bước "${n.tx}" chưa có diễn giải chi tiết.`, n.id);
      if (trong(n.form))
        them(canhBao, 'THIEU_HO_SO', `Bước "${n.tx}" chưa ghi hồ sơ / biểu mẫu.`, n.id);
      if (trong(n.time))
        them(canhBao, 'THIEU_THOI_GIAN', `Bước "${n.tx}" chưa ghi thời gian chuẩn.`, n.id);
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = rectOf(nodes[i]), b = rectOf(nodes[j]);
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        them(canhBao, 'CHONG_KHOI', `Khối "${nodes[i].tx}" và "${nodes[j].tx}" đang chồng lên nhau.`, nodes[j].id);
    }
  }

  return { loi, canhBao };
}

export const coTheBanHanh = soDo => kiemTraLuuDo(soDo).loi.length === 0;
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhKiemTra.test.js`
Expected: PASS — 13 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhKiemTra.js src/lib/quyTrinhKiemTra.test.js
git commit -m "feat(quy-trinh): soat loi luu do chan ban hanh"
```

---

## Task 7: `quyTrinhDienGiai.js` — bảng diễn giải

**Files:**
- Create: `src/lib/quyTrinhDienGiai.js`
- Test: `src/lib/quyTrinhDienGiai.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { dongDienGiai } from './quyTrinhDienGiai';

const soDo = {
  lanes: [
    { name: 'Kho', owner: 'Thủ kho', color: '#0d9488' },
    { name: 'QC',  owner: 'NV QC',   color: '#16a34a' },
  ],
  phases: [{ name: 'G', h: 600 }],
  nodes: [
    { id: 's',  t: 'start', lane: 0, y: 10,  dx: 0, w: 164, h: 48, tx: 'Bắt đầu', desc: '', form: '—', time: '—' },
    { id: 'b1', t: 'step',  lane: 0, y: 100, dx: 0, w: 164, h: 56, tx: 'Xuất kho',  desc: 'Soạn hàng', form: 'PSX · BOM', time: '3 giờ' },
    { id: 'd',  t: 'dec',   lane: 1, y: 200, dx: 0, w: 150, h: 86, tx: 'Đạt?',      desc: 'Xét QC',   form: '—',        time: '—' },
    { id: 'b2', t: 'step',  lane: 1, y: 320, dx: 0, w: 164, h: 56, tx: 'Nhập kho',  desc: 'Dán tem',  form: 'PNK',      time: '1 giờ' },
    { id: 'b3', t: 'step',  lane: 0, y: 320, dx: 0, w: 164, h: 56, tx: 'Tái chế',   desc: 'Sửa lại',  form: 'NG-01',    time: '—' },
    { id: 'e',  t: 'end',   lane: 1, y: 440, dx: 0, w: 164, h: 48, tx: 'Kết thúc',  desc: '', form: '—', time: '—' },
  ],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '',   k: 'n'  },
    { id: 'e2', a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
    { id: 'e3', a: 'd',  b: 'b2', lbl: 'OK', k: 'ok' },
    { id: 'e4', a: 'd',  b: 'b3', lbl: 'NG', k: 'ng' },
    { id: 'e5', a: 'b2', b: 'e',  lbl: '',   k: 'n'  },
    { id: 'e6', a: 'b3', b: 'b1', lbl: 'Làm lại', k: 'ng' },
  ],
};

describe('dongDienGiai', () => {
  const rows = dongDienGiai(soDo);

  test('bỏ Bắt đầu/Kết thúc, đánh số 1..n liên tục', () => {
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.stt)).toEqual([1, 2, 3, 4]);
  });

  test('thứ tự trên→dưới rồi trái→phải', () => {
    expect(rows.map(r => r.ten)).toEqual(['Xuất kho', 'Đạt?', 'Tái chế', 'Nhập kho']);
  });

  test('người thực hiện SUY RA từ cột, không lấy từ khối', () => {
    expect(rows.find(r => r.ten === 'Xuất kho').nguoiThucHien).toBe('Thủ kho');
    expect(rows.find(r => r.ten === 'Nhập kho').nguoiThucHien).toBe('NV QC');
  });

  test('đánh dấu nhánh OK / NG theo đường nối đi vào', () => {
    expect(rows.find(r => r.ten === 'Nhập kho').nhanh).toBe('ok');
    expect(rows.find(r => r.ten === 'Tái chế').nhanh).toBe('ng');
    expect(rows.find(r => r.ten === 'Xuất kho').nhanh).toBe('');
  });

  test('tách hồ sơ theo dấu · thành danh sách', () => {
    expect(rows.find(r => r.ten === 'Xuất kho').hoSo).toEqual(['PSX', 'BOM']);
    expect(rows.find(r => r.ten === 'Đạt?').hoSo).toEqual([]);
  });

  test('giữ nguyên id khối để bấm vào dòng là nhảy tới khối', () => {
    expect(rows.find(r => r.ten === 'Đạt?').khoiId).toBe('d');
  });

  test('cột không tồn tại → người thực hiện là "—", không nổ', () => {
    const s = { ...soDo, nodes: [{ ...soDo.nodes[1], lane: 99 }], edges: [] };
    expect(dongDienGiai(s)[0].nguoiThucHien).toBe('—');
  });

  test('sơ đồ rỗng → mảng rỗng', () => {
    expect(dongDienGiai({ lanes: [], phases: [], nodes: [], edges: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhDienGiai.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhDienGiai"`

- [ ] **Step 3: Viết module**

```js
// ============================================================
// QUY TRÌNH — sinh các dòng "Diễn giải lưu đồ" (mục 6 tài liệu ISO).
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục F)
//
// Bảng diễn giải KHÔNG có dữ liệu riêng — nó là hình chiếu của sơ đồ.
// Người thực hiện suy ra từ CỘT, nên đổi cột là bảng đổi theo.
// Module thuần: không gọi DB, không đụng API trình duyệt.
// ============================================================

import { thuTuBuoc, timKhoi } from './quyTrinhSoDo';

/** Nhánh của một khối = loại đường nối ĐI VÀO nó ('ok' | 'ng' | ''). */
function nhanhVao(soDo, id) {
  const vao = (soDo.edges || []).filter(e => e.b === id);
  if (vao.some(e => e.k === 'ok')) return 'ok';
  if (vao.some(e => e.k === 'ng')) return 'ng';
  return '';
}

export function dongDienGiai(soDo) {
  if (!soDo?.nodes?.length) return [];
  return thuTuBuoc(soDo).map((id, i) => {
    const n = timKhoi(soDo, id);
    const cot = soDo.lanes?.[n.lane];
    const form = String(n.form ?? '').trim();
    return {
      stt: i + 1,
      khoiId: n.id,
      ten: n.tx,
      loai: n.t,
      nguoiThucHien: cot?.owner || '—',
      boPhan: cot?.name || '—',
      dienGiai: n.desc || '',
      hoSo: form && form !== '—' ? form.split('·').map(s => s.trim()).filter(Boolean) : [],
      thoiGian: n.time || '—',
      nhanh: nhanhVao(soDo, n.id),
    };
  });
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhDienGiai.test.js`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhDienGiai.js src/lib/quyTrinhDienGiai.test.js
git commit -m "feat(quy-trinh): sinh bang dien giai tu so do"
```

---

## Task 8: `quyTrinhMau.js` — nhóm bộ phận, mẫu ISO sẵn, sinh mã số

Đây là quyết định Q4 của spec: mở quy trình mới ra đã điền sẵn ~70%.

**Files:**
- Create: `src/lib/quyTrinhMau.js`
- Test: `src/lib/quyTrinhMau.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { NHOM, mauTaiLieu, mauSoDo, maSoTiepTheo } from './quyTrinhMau';
import { kiemTraLuuDo } from './quyTrinhKiemTra';

describe('NHOM', () => {
  test('đủ 6 nhóm bộ phận, mã 2 chữ, không trùng', () => {
    expect(NHOM).toHaveLength(6);
    expect(NHOM.map(n => n.ma)).toEqual(['SX', 'CL', 'KH', 'CS', 'BH', 'HC']);
    for (const n of NHOM) {
      expect(n.ma).toMatch(/^[A-Z]{2}$/);
      expect(n.ten).toBeTruthy();
      expect(n.mau).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('mauTaiLieu', () => {
  test('mỗi nhóm có đủ mục 1–4 và 7, không ô nào trống', () => {
    for (const n of NHOM) {
      const t = mauTaiLieu(n.ma);
      expect(t.mucDich.trim()).not.toBe('');
      expect(t.phamVi.trim()).not.toBe('');
      expect(t.vienDan.length).toBeGreaterThan(0);
      expect(t.dinhNghia.length).toBeGreaterThan(0);
      expect(t.hoSoLuu.length).toBeGreaterThan(0);
      for (const d of t.dinhNghia) { expect(d.tu).toBeTruthy(); expect(d.nghia).toBeTruthy(); }
      for (const h of t.hoSoLuu) {
        expect(h.ten).toBeTruthy(); expect(h.boPhan).toBeTruthy();
        expect(h.thoiGian).toBeTruthy(); expect(h.hinhThuc).toBeTruthy();
      }
    }
  });
  test('nhóm lạ → trả mẫu rỗng có đủ khoá, không nổ', () => {
    const t = mauTaiLieu('ZZ');
    expect(t.mucDich).toBe('');
    expect(Array.isArray(t.hoSoLuu)).toBe(true);
  });
  test('trả BẢN SAO — sửa kết quả không làm hỏng mẫu gốc', () => {
    const a = mauTaiLieu('SX'); a.vienDan.push('bậy');
    expect(mauTaiLieu('SX').vienDan).not.toContain('bậy');
  });
});

describe('mauSoDo', () => {
  test('có sẵn cột, hàng, khối Bắt đầu và Kết thúc đã nối nhau', () => {
    const s = mauSoDo('SX');
    expect(s.lanes.length).toBeGreaterThanOrEqual(3);
    expect(s.phases.length).toBeGreaterThanOrEqual(2);
    expect(s.nodes.some(n => n.t === 'start')).toBe(true);
    expect(s.nodes.some(n => n.t === 'end')).toBe(true);
    expect(s.edges).toHaveLength(1);
  });
  test('mỗi cột có tên và người phụ trách', () => {
    for (const l of mauSoDo('KH').lanes) { expect(l.name).toBeTruthy(); expect(l.owner).toBeTruthy(); }
  });
  test('mẫu KHÔNG có lỗi chặn ban hành ngoài việc còn thiếu bước ở giữa', () => {
    // Bắt đầu → Kết thúc là hợp lệ về cấu trúc: không mồ côi, không thiếu nhánh.
    expect(kiemTraLuuDo(mauSoDo('CL')).loi).toEqual([]);
  });
  test('trả BẢN SAO — sửa sơ đồ không làm hỏng mẫu gốc', () => {
    const a = mauSoDo('SX'); a.nodes.push({ id: 'x' });
    expect(mauSoDo('SX').nodes.some(n => n.id === 'x')).toBe(false);
  });
});

describe('maSoTiepTheo', () => {
  test('đánh số tiếp theo trong nhóm, đệm 2 chữ số', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'QT-SX-02', 'QT-CL-01'])).toBe('QT-SX-03');
  });
  test('nhóm chưa có quy trình nào → 01', () => {
    expect(maSoTiepTheo('HC', ['QT-SX-01'])).toBe('QT-HC-01');
  });
  test('lấp lỗ hổng KHÔNG được — luôn lớn hơn số lớn nhất đang có', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'QT-SX-07'])).toBe('QT-SX-08');
  });
  test('bỏ qua mã rác không đúng định dạng', () => {
    expect(maSoTiepTheo('SX', ['QT-SX-01', 'linh tinh', 'QT-SX-abc'])).toBe('QT-SX-02');
  });
  test('danh sách rỗng → 01', () => {
    expect(maSoTiepTheo('BH', [])).toBe('QT-BH-01');
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhMau.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhMau"`

- [ ] **Step 3: Viết module**

```js
// ============================================================
// QUY TRÌNH — nhóm bộ phận, mẫu tài liệu ISO sẵn, sinh mã số.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (Q4, mục B)
//
// Mẫu để trong MÃ NGUỒN, không để trong DB: sửa mẫu là sửa mã, có test,
// không cần dựng thêm màn hình quản trị. Cần sửa mẫu trong app thì bàn riêng.
// Mọi hàm trả BẢN SAO để nơi gọi sửa thoải mái mà không hỏng mẫu gốc.
// ============================================================

import { LOAI_KHOI } from './quyTrinhSoDo';

export const NHOM = [
  { ma: 'SX', ten: 'Sản xuất',              mau: '#0891b2' },
  { ma: 'CL', ten: 'Chất lượng',            mau: '#16a34a' },
  { ma: 'KH', ten: 'Kho hàng',              mau: '#0d9488' },
  { ma: 'CS', ten: 'CSKH',                  mau: '#8b5cf6' },
  { ma: 'BH', ten: 'Bảo hành',              mau: '#ef4444' },
  { ma: 'HC', ten: 'Nhân sự – Hành chính',  mau: '#64748b' },
];

const VIEN_DAN_CHUNG = ['ISO 9001:2015 — Hệ thống quản lý chất lượng'];
const DN = (tu, nghia) => ({ tu, nghia });
const HS = (ten, boPhan, thoiGian, hinhThuc) => ({ ten, boPhan, thoiGian, hinhThuc });

const MAU = {
  SX: {
    mucDich: 'Quy định trình tự và trách nhiệm trong hoạt động sản xuất, bảo đảm sản phẩm làm ra đạt yêu cầu kỹ thuật và truy xuất được khi có khiếu nại.',
    phamVi: 'Áp dụng cho toàn bộ hoạt động sản xuất tại nhà máy, từ khi tiếp nhận đơn hàng đến khi nhập kho thành phẩm.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.5 Sản xuất và cung cấp dịch vụ', 'Bảng tiêu chuẩn thao tác (TCTT) từng công đoạn'],
    dinhNghia: [DN('BOM', 'Định mức nguyên vật liệu cho một sản phẩm'), DN('DKSX', 'Đăng ký nhu cầu sản xuất'), DN('PSX', 'Phiếu lệnh sản xuất'), DN('TCTT', 'Bảng tiêu chuẩn thao tác'), DN('NG', 'Sản phẩm không đạt yêu cầu (No Good)')],
    hoSoLuu: [HS('Đăng ký nhu cầu sản xuất (DKSX)', 'P. Kế hoạch', '24 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Phiếu lệnh sản xuất (PSX)', 'Kho', '24 tháng', 'Bản cứng có ký giao nhận + bản mềm'), HS('Nhật ký sản xuất', 'Xưởng', '24 tháng', 'Bản mềm')],
    lanes: [['Kinh doanh', 'NV Kinh doanh', '#2563eb'], ['Kế hoạch SX', 'NV Kế hoạch', '#7c3aed'], ['Kho', 'Thủ kho', '#0d9488'], ['Sản xuất', 'Tổ trưởng SX', '#0891b2'], ['QC', 'NV QC', '#16a34a']],
  },
  CL: {
    mucDich: 'Quy định cách kiểm soát chất lượng và xử lý sản phẩm không phù hợp, bảo đảm hàng không đạt không lọt sang công đoạn sau.',
    phamVi: 'Áp dụng cho kiểm tra đầu vào, kiểm tra trong chuyền và kiểm tra cuối chuyền tại nhà máy.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.7 Kiểm soát đầu ra không phù hợp'],
    dinhNghia: [DN('QC', 'Kiểm tra chất lượng (Quality Control)'), DN('NG', 'Sản phẩm không đạt yêu cầu (No Good)'), DN('AQL', 'Mức chất lượng chấp nhận được')],
    hoSoLuu: [HS('Biên bản kiểm tra QC', 'P. QA', '24 tháng', 'Bản mềm kèm ảnh chụp'), HS('Phiếu xử lý hàng NG', 'P. QA', '24 tháng', 'Bản mềm trên phân hệ Chất lượng SP')],
    lanes: [['Kho', 'Thủ kho', '#0d9488'], ['QC', 'NV QC', '#16a34a'], ['Sản xuất', 'Tổ trưởng SX', '#0891b2'], ['P. QA', 'Trưởng phòng QA', '#7c3aed']],
  },
  KH: {
    mucDich: 'Quy định trình tự nhập – xuất – kiểm kê hàng hoá, bảo đảm số liệu tồn kho trên phần mềm khớp với thực tế.',
    phamVi: 'Áp dụng cho toàn bộ hoạt động kho nguyên vật liệu và kho thành phẩm.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 8.5.4 Bảo toàn'],
    dinhNghia: [DN('PNK', 'Phiếu nhập kho'), DN('PXK', 'Phiếu xuất kho'), DN('PSX', 'Phiếu lệnh sản xuất'), DN('FIFO', 'Nhập trước xuất trước')],
    hoSoLuu: [HS('Phiếu nhập kho', 'Kho', '24 tháng', 'Bản cứng + bản mềm'), HS('Phiếu xuất kho', 'Kho', '24 tháng', 'Bản cứng có ký giao nhận'), HS('Biên bản kiểm kê', 'Kho', '36 tháng', 'Bản cứng có chữ ký hội đồng')],
    lanes: [['Nhà cung cấp', 'NCC', '#64748b'], ['Kho', 'Thủ kho', '#0d9488'], ['QC', 'NV QC', '#16a34a'], ['Kế toán', 'NV Kế toán', '#2563eb']],
  },
  CS: {
    mucDich: 'Quy định cách tiếp nhận và xử lý yêu cầu của khách hàng, bảo đảm mọi phản ánh đều được trả lời và theo dõi tới khi đóng.',
    phamVi: 'Áp dụng cho toàn bộ kênh tiếp nhận: điện thoại, Zalo, tổng đài và trực tiếp tại cửa hàng.',
    vienDan: [...VIEN_DAN_CHUNG, 'ISO 9001:2015 — điều khoản 9.1.2 Sự thoả mãn của khách hàng'],
    dinhNghia: [DN('CSKH', 'Chăm sóc khách hàng'), DN('SLA', 'Thời hạn cam kết xử lý'), DN('KH', 'Khách hàng')],
    hoSoLuu: [HS('Phiếu tiếp nhận yêu cầu', 'P. CSKH', '24 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Nhật ký chăm sóc khách hàng', 'P. CSKH', '12 tháng', 'Bản mềm')],
    lanes: [['Khách hàng', 'Khách hàng', '#64748b'], ['CSKH', 'NV CSKH', '#8b5cf6'], ['Kỹ thuật', 'KTV', '#0891b2'], ['Quản lý', 'Trưởng phòng CSKH', '#2563eb']],
  },
  BH: {
    mucDich: 'Quy định trình tự tiếp nhận và xử lý phiếu bảo hành, bảo đảm khách hàng được phục vụ đúng cam kết và chi phí bảo hành được kiểm soát.',
    phamVi: 'Áp dụng cho toàn bộ sản phẩm còn trong thời hạn bảo hành do công ty cung cấp.',
    vienDan: [...VIEN_DAN_CHUNG, 'Chính sách bảo hành sản phẩm hiện hành của công ty'],
    dinhNghia: [DN('KTV', 'Kỹ thuật viên'), DN('BH', 'Bảo hành'), DN('CS', 'Phiếu chăm sóc / bảo hành trên hệ thống')],
    hoSoLuu: [HS('Phiếu bảo hành', 'P. Bảo hành', '36 tháng', 'Bản mềm trên phần mềm QLSX'), HS('Biên bản nghiệm thu tại nhà khách', 'P. Bảo hành', '24 tháng', 'Bản cứng có chữ ký khách hàng')],
    lanes: [['Khách hàng', 'Khách hàng', '#64748b'], ['CSKH', 'NV CSKH', '#8b5cf6'], ['Bảo hành', 'NV Bảo hành', '#ef4444'], ['Kỹ thuật', 'KTV', '#0891b2'], ['Kế toán', 'NV Kế toán', '#2563eb']],
  },
  HC: {
    mucDich: 'Quy định trình tự và trách nhiệm trong công tác nhân sự – hành chính, bảo đảm hồ sơ đầy đủ và đúng quy định pháp luật.',
    phamVi: 'Áp dụng cho toàn bộ cán bộ công nhân viên của công ty.',
    vienDan: [...VIEN_DAN_CHUNG, 'Bộ luật Lao động hiện hành', 'Nội quy lao động của công ty'],
    dinhNghia: [DN('CBCNV', 'Cán bộ công nhân viên'), DN('HĐLĐ', 'Hợp đồng lao động'), DN('BHXH', 'Bảo hiểm xã hội')],
    hoSoLuu: [HS('Hồ sơ nhân sự', 'P. HC-NS', 'Suốt thời gian làm việc + 12 tháng', 'Bản cứng lưu tủ hồ sơ'), HS('Bảng chấm công', 'P. HC-NS', '24 tháng', 'Bản mềm trên phần mềm QLSX')],
    lanes: [['CBCNV', 'Người lao động', '#64748b'], ['HC-NS', 'NV Hành chính', '#8b5cf6'], ['Quản lý trực tiếp', 'Trưởng bộ phận', '#2563eb'], ['Ban Giám đốc', 'Giám đốc', '#0f172a']],
  },
};

const RONG = { mucDich: '', phamVi: '', vienDan: [], dinhNghia: [], hoSoLuu: [] };

/** Mục 1–4 và 7 của tài liệu ISO, điền sẵn theo nhóm bộ phận. Trả BẢN SAO. */
export function mauTaiLieu(nhom) {
  const m = MAU[nhom];
  if (!m) return structuredClone(RONG);
  return structuredClone({
    mucDich: m.mucDich, phamVi: m.phamVi,
    vienDan: m.vienDan, dinhNghia: m.dinhNghia, hoSoLuu: m.hoSoLuu,
  });
}

/** Sơ đồ khởi tạo: cột + hàng sẵn, khối Bắt đầu → Kết thúc đã nối. Trả BẢN SAO. */
export function mauSoDo(nhom) {
  const m = MAU[nhom] || MAU.SX;
  const lanes = m.lanes.map(([name, owner, color]) => ({ name, owner, color }));
  const phases = [
    { name: 'Tiếp nhận', h: 160 },
    { name: 'Thực hiện', h: 320 },
    { name: 'Hoàn tất',  h: 200 },
  ];
  const S = LOAI_KHOI.start, E = LOAI_KHOI.end;
  return structuredClone({
    lanes, phases,
    nodes: [
      { id: 'n_start', t: 'start', lane: 0, y: 46,  dx: 0, w: S.w, h: S.h, tx: 'Bắt đầu',  desc: '', form: '—', time: '—', color: null },
      { id: 'n_end',   t: 'end',   lane: 0, y: 560, dx: 0, w: E.w, h: E.h, tx: 'Kết thúc', desc: '', form: '—', time: '—', color: null },
    ],
    edges: [{ id: 'e_se', a: 'n_start', b: 'n_end', lbl: '', k: 'n' }],
  });
}

/** 'QT-<nhóm>-<số>' lớn hơn số lớn nhất đang có trong nhóm. KHÔNG lấp lỗ hổng —
 *  mã đã cấp cho một quy trình bị xoá thì không dùng lại, tránh trùng trong hồ sơ giấy. */
export function maSoTiepTheo(nhom, maDaCo = []) {
  const re = new RegExp(`^QT-${nhom}-(\\d+)$`);
  let max = 0;
  for (const ma of maDaCo) {
    const m = re.exec(String(ma || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `QT-${nhom}-${String(max + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhMau.test.js`
Expected: PASS — 13 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhMau.js src/lib/quyTrinhMau.test.js
git commit -m "feat(quy-trinh): mau ISO theo nhom bo phan + sinh ma so"
```

---

## Task 9: `quyTrinhSvg.js` — sinh SVG + `thoatXml` dùng chung

SVG là nguồn cho cả xuất PNG lẫn ảnh nhúng vào `.docx`. `thoatXml` để ở đây, `quyTrinhDocx.js` import lại — một chỗ duy nhất, không lặp.

**Files:**
- Create: `src/lib/quyTrinhSvg.js`
- Test: `src/lib/quyTrinhSvg.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { thoatXml, soDoSangSvg } from './quyTrinhSvg';
import { mauSoDo } from './quyTrinhMau';

const soDo = {
  lanes: [
    { name: 'Kho', owner: 'Thủ kho', color: '#0d9488' },
    { name: 'QC',  owner: 'NV QC',   color: '#16a34a' },
  ],
  phases: [{ name: 'Chuẩn bị', h: 200 }, { name: 'Kiểm soát', h: 260 }],
  nodes: [
    { id: 's',  t: 'start', lane: 0, y: 20,  dx: 0, w: 164, h: 48, tx: 'Bắt đầu',  desc: '', form: '—', time: '—' },
    { id: 'b1', t: 'step',  lane: 0, y: 110, dx: 0, w: 164, h: 56, tx: 'Xuất kho', desc: 'x', form: '—', time: '—' },
    { id: 'd',  t: 'dec',   lane: 1, y: 230, dx: 0, w: 150, h: 86, tx: 'Đạt?',     desc: 'x', form: '—', time: '—' },
    { id: 'e',  t: 'end',   lane: 1, y: 380, dx: 0, w: 164, h: 48, tx: 'Kết thúc', desc: '', form: '—', time: '—' },
  ],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '',   k: 'n'  },
    { id: 'e2', a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
    { id: 'e3', a: 'd',  b: 'e',  lbl: 'OK', k: 'ok' },
  ],
};

describe('thoatXml', () => {
  test('thoát & < > " và nháy đơn', () => {
    expect(thoatXml('a & b < c > d "e" \'f\'')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });
  test('& phải thoát TRƯỚC, không sinh &amp;lt;', () => {
    expect(thoatXml('<')).toBe('&lt;');
    expect(thoatXml('&lt;')).toBe('&amp;lt;');
  });
  test('null/undefined/số → chuỗi rỗng hoặc chuỗi số, không nổ', () => {
    expect(thoatXml(null)).toBe('');
    expect(thoatXml(undefined)).toBe('');
    expect(thoatXml(42)).toBe('42');
  });
});

describe('soDoSangSvg', () => {
  const svg = soDoSangSvg(soDo);

  test('là SVG hợp lệ, có khai báo namespace và kích thước', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
  });

  test('vẽ đủ 4 khối — mỗi khối một nhóm có data-khoi', () => {
    expect((svg.match(/data-khoi="/g) || []).length).toBe(4);
  });

  test('vẽ đủ 3 đường nối', () => {
    expect((svg.match(/data-noi="/g) || []).length).toBe(3);
  });

  test('có tên cột và tên giai đoạn', () => {
    for (const t of ['Kho', 'QC', 'Chuẩn bị', 'Kiểm soát']) expect(svg).toContain(t);
  });

  test('khối Quyết định vẽ bằng polygon hình thoi, không phải chữ nhật', () => {
    expect(svg).toContain('<polygon');
  });

  test('nhãn nhánh OK có mặt', () => {
    expect(svg).toContain('>OK<');
  });

  test('THOÁT ký tự — tên bước có & < > không làm vỡ XML', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Xuất kho & <kiểm> "tra"';
    const out = soDoSangSvg(s);
    expect(out).toContain('Xuất kho &amp; &lt;kiểm&gt; &quot;tra&quot;');
    expect(out).not.toContain('<kiểm>');
  });

  test('tỉ lệ nhân đôi kích thước ảnh nhưng giữ nguyên viewBox', () => {
    const g = soDoSangSvg(soDo, { tyLe: 2 });
    const w1 = +/width="(\d+)"/.exec(svg)[1];
    const w2 = +/width="(\d+)"/.exec(g)[1];
    expect(w2).toBe(w1 * 2);
    expect(/viewBox="([^"]+)"/.exec(g)[1]).toBe(/viewBox="([^"]+)"/.exec(svg)[1]);
  });

  test('tên dài bị cắt xuống nhiều dòng, không tràn khỏi khối', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Một tên bước rất dài cần phải xuống dòng nhiều lần mới vừa';
    expect((soDoSangSvg(s).match(/<tspan/g) || []).length).toBeGreaterThan(1);
  });

  test('sơ đồ mẫu (chỉ Bắt đầu → Kết thúc) vẽ được, không nổ', () => {
    expect(() => soDoSangSvg(mauSoDo('SX'))).not.toThrow();
  });

  test('đường nối trỏ tới khối đã xoá thì bỏ qua, không nổ', () => {
    const s = structuredClone(soDo);
    s.edges.push({ id: 'ex', a: 'b1', b: 'khong-co', lbl: '', k: 'n' });
    expect(() => soDoSangSvg(s)).not.toThrow();
    expect((soDoSangSvg(s).match(/data-noi="/g) || []).length).toBe(3);
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhSvg.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhSvg"`

- [ ] **Step 3: Viết module**

```js
// ============================================================
// QUY TRÌNH — sơ đồ → chuỗi SVG.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// Một nguồn duy nhất cho: xuất PNG dán xưởng, ảnh nhúng vào .docx, và bản in.
// Dùng lại đúng các hàm hình học của trình vẽ nên ảnh xuất ra KHỚP với
// những gì người dùng thấy trên màn hình.
// Module thuần: trả về CHUỖI, không đụng DOM — nên test được ở môi trường node.
// ============================================================

import {
  GUT, LANE_W, HEAD_H, LOAI_KHOI, MAU_DUONG,
  rectOf, drawW, drawH, phaseTop, routeEdge,
} from './quyTrinhSoDo';

/** Thoát ký tự cho cả SVG lẫn DOCX. & phải thay TRƯỚC, nếu không sinh &amp;lt;. */
export function thoatXml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Cắt chữ thành nhiều dòng vừa bề ngang khối (ước lượng 6.4px/ký tự ở cỡ 11.5). */
function catDong(text, beNgang, coChu = 11.5) {
  const max = Math.max(6, Math.floor(beNgang / (coChu * 0.56)));
  const tu = String(text || '').split(/\s+/).filter(Boolean);
  const dong = [];
  let cur = '';
  for (const t of tu) {
    if (!cur) { cur = t; continue; }
    if ((cur + ' ' + t).length <= max) cur += ' ' + t;
    else { dong.push(cur); cur = t; }
  }
  if (cur) dong.push(cur);
  return dong.slice(0, 3);
}

function khoiSvg(n) {
  const T = LOAI_KHOI[n.t], mau = n.color || T.mau;
  const r = rectOf(n);
  let hinh;
  if (n.t === 'dec') {
    const p = `${r.cx},${r.y} ${r.x + r.w},${r.cy} ${r.cx},${r.y + r.h} ${r.x},${r.cy}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else if (n.t === 'doc') {
    const yb = r.y + r.h * 0.84;
    const p = `${r.x},${r.y} ${r.x + r.w},${r.y} ${r.x + r.w},${yb} ${r.cx},${r.y + r.h} ${r.x},${yb}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else if (n.t === 'data') {
    const d = r.w * 0.11;
    const p = `${r.x + d},${r.y} ${r.x + r.w},${r.y} ${r.x + r.w - d},${r.y + r.h} ${r.x},${r.y + r.h}`;
    hinh = `<polygon points="${p}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  } else {
    const rx = (n.t === 'start' || n.t === 'end') ? r.h / 2 : 9;
    hinh = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}" fill="#fff" stroke="${mau}" stroke-width="2"/>`;
  }

  const dong = catDong(n.tx, r.w - 16);
  const y0 = r.cy - ((dong.length - 1) * 14) / 2;
  const chu = dong
    .map((d, i) => `<tspan x="${r.cx}" y="${y0 + i * 14}">${thoatXml(d)}</tspan>`)
    .join('');

  return `<g data-khoi="${thoatXml(n.id)}">${hinh}`
    + `<text text-anchor="middle" dominant-baseline="middle" font-family="Be Vietnam Pro, Segoe UI, sans-serif"`
    + ` font-size="11.5" font-weight="600" fill="#0f172a">${chu}</text></g>`;
}

export function soDoSangSvg(soDo, { tyLe = 1 } = {}) {
  const W = GUT + drawW(soDo), H = HEAD_H + drawH(soDo);
  const p = [];

  p.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);

  // Tiêu đề cột
  p.push(`<rect x="0" y="0" width="${GUT}" height="${HEAD_H}" fill="#f7f9fc"/>`);
  p.push(`<text x="${GUT / 2}" y="${HEAD_H / 2}" text-anchor="middle" dominant-baseline="middle"`
    + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="10" font-weight="800" fill="#94a3b8">GIAI ĐOẠN</text>`);
  soDo.lanes.forEach((l, i) => {
    const x = GUT + i * LANE_W;
    p.push(`<rect x="${x}" y="0" width="${LANE_W}" height="${HEAD_H}" fill="#ffffff" stroke="#dfe6ef"/>`);
    p.push(`<rect x="${x}" y="${HEAD_H - 2}" width="${LANE_W}" height="2" fill="${l.color || '#64748b'}"/>`);
    p.push(`<text x="${x + LANE_W / 2}" y="${HEAD_H / 2}" text-anchor="middle" dominant-baseline="middle"`
      + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="${l.color || '#64748b'}">${thoatXml(l.name)}</text>`);
  });

  // Nhãn giai đoạn + vạch ngăn
  soDo.phases.forEach((ph, i) => {
    const y = HEAD_H + phaseTop(soDo, i);
    p.push(`<rect x="0" y="${y}" width="${GUT}" height="${ph.h}" fill="#f7f9fc" stroke="#dfe6ef"/>`);
    catDong(ph.name, GUT - 12, 11.5).forEach((d, k, arr) => {
      const cy = y + ph.h / 2 - ((arr.length - 1) * 13) / 2 + k * 13;
      p.push(`<text x="${GUT / 2}" y="${cy}" text-anchor="middle" dominant-baseline="middle"`
        + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="11.5" font-weight="700" fill="#475569">${thoatXml(d)}</text>`);
    });
    if (i) p.push(`<line x1="${GUT}" y1="${y}" x2="${W}" y2="${y}" stroke="#d6dee9" stroke-dasharray="4 4"/>`);
  });

  // Vạch dọc giữa các cột
  soDo.lanes.forEach((l, i) => {
    const x = GUT + i * LANE_W;
    p.push(`<line x1="${x}" y1="${HEAD_H}" x2="${x}" y2="${H}" stroke="#dfe6ef"/>`);
  });

  // Mũi tên
  const marker = Object.entries(MAU_DUONG).map(([k, c]) =>
    `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">`
    + `<path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');

  // Đường nối + khối, đặt trong nhóm dịch theo gutter/header
  const trong = [];
  for (const e of soDo.edges || []) {
    const r = routeEdge(soDo, e);
    if (!r) continue;                       // đường trỏ tới khối đã xoá
    const c = MAU_DUONG[e.k] || MAU_DUONG.n;
    trong.push(`<g data-noi="${thoatXml(e.id)}">`
      + `<path d="${r.d}" fill="none" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"`
      + `${e.k === 'ng' ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#ar-${e.k})"/>`
      + (e.lbl
        ? `<text x="${r.nhan[0]}" y="${r.nhan[1]}" text-anchor="middle" dominant-baseline="middle"`
          + ` font-family="Be Vietnam Pro, Segoe UI, sans-serif" font-size="10.5" font-weight="700" fill="${c}"`
          + ` paint-order="stroke" stroke="#fff" stroke-width="4">${thoatXml(e.lbl)}</text>`
        : '')
      + `</g>`);
  }
  for (const n of soDo.nodes || []) trong.push(khoiSvg(n));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * tyLe)}" height="${Math.round(H * tyLe)}"`
    + ` viewBox="0 0 ${W} ${H}"><defs>${marker}</defs>${p.join('')}`
    + `<g transform="translate(${GUT},${HEAD_H})">${trong.join('')}</g></svg>`;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhSvg.test.js`
Expected: PASS — 14 passed

- [ ] **Step 5: Chạy toàn bộ test cho chắc không vỡ chỗ nào**

Run: `npm test`
Expected: PASS — mọi tệp test cũ vẫn xanh

- [ ] **Step 6: Commit**

```bash
git add src/lib/quyTrinhSvg.js src/lib/quyTrinhSvg.test.js
git commit -m "feat(quy-trinh): sinh SVG tu so do, dung chung cho PNG va DOCX"
```

---

## Task 10: `quyTrinhDocx.js` — phần XML thuần

`.docx` là ZIP chứa XML. Task này chỉ viết **các hàm dựng chuỗi** — test được ở `environment: 'node'`. Phần gói ZIP để Task 11.

**Files:**
- Create: `src/lib/quyTrinhDocx.js`
- Test: `src/lib/quyTrinhDocx.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, test, expect } from 'vitest';
import { A3_W_TWIP, A3_H_TWIP, sectPrXml, doanXml, bangXml, anhXml, documentXml, contentTypesXml, relsXml, docRelsXml } from './quyTrinhDocx';

const duLieu = () => ({
  quyTrinh: { ma_so: 'QT-SX-01', ten: 'Sản xuất & kiểm soát chất lượng', nhom: 'SX' },
  phienBan: {
    phien_ban: '2.1', lan_ban_hanh: 2, ngay_hieu_luc: '2026-03-01',
    tai_lieu: {
      mucDich: 'Mục đích thử', phamVi: 'Phạm vi thử',
      vienDan: ['ISO 9001:2015'],
      dinhNghia: [{ tu: 'BOM', nghia: 'Định mức nguyên vật liệu' }],
      hoSoLuu: [{ ten: 'Phiếu lệnh SX', boPhan: 'Kho', thoiGian: '24 tháng', hinhThuc: 'Bản cứng' }],
      nguoiLap: 'Đỗ Hương Nguyên', nguoiKiemTra: 'Trưởng phòng QA', nguoiDuyet: 'Giám đốc',
    },
  },
  dienGiai: [
    { stt: 1, ten: 'Xuất kho', nguoiThucHien: 'Thủ kho', dienGiai: 'Soạn hàng', hoSo: ['PSX'], thoiGian: '3 giờ', nhanh: '' },
    { stt: 2, ten: 'Kiểm QC',  nguoiThucHien: 'NV QC',   dienGiai: 'Đo TDS',    hoSo: [],      thoiGian: '10 phút', nhanh: 'ok' },
  ],
  lichSu: [{ lan_ban_hanh: 1, ngay: '10/06/2025', phien_ban: '1.0', noiDung: 'Ban hành lần đầu', nguoi: 'Nguyên' }],
});

describe('khổ giấy A3 ngang', () => {
  test('hằng số đúng: 420mm = 23811 twip, 297mm = 16838 twip', () => {
    expect(A3_W_TWIP).toBe(23811);
    expect(A3_H_TWIP).toBe(16838);
  });
  test('sectPr đặt A3 NGANG — bề ngang là cạnh dài', () => {
    const x = sectPrXml();
    expect(x).toContain(`w:w="${A3_W_TWIP}"`);
    expect(x).toContain(`w:h="${A3_H_TWIP}"`);
    expect(x).toContain('w:orient="landscape"');
    expect(x).toContain('<w:pgMar');
  });
});

describe('doanXml', () => {
  test('đoạn thường có w:p và w:t', () => {
    const x = doanXml('xin chào');
    expect(x).toContain('<w:p>');
    expect(x).toContain('<w:t xml:space="preserve">xin chào</w:t>');
  });
  test('THOÁT ký tự — & < > không làm vỡ XML', () => {
    expect(doanXml('a & b < c')).toContain('a &amp; b &lt; c');
  });
  test('đậm sinh w:b, cỡ chữ nhân đôi (half-point)', () => {
    const x = doanXml('tiêu đề', { dam: true, co: 14 });
    expect(x).toContain('<w:b/>');
    expect(x).toContain('<w:sz w:val="28"/>');
  });
  test('canh giữa sinh jc=center', () => {
    expect(doanXml('x', { canGiua: true })).toContain('<w:jc w:val="center"/>');
  });
  test('phông mặc định Times New Roman', () => {
    expect(doanXml('x')).toContain('w:ascii="Times New Roman"');
  });
});

describe('bangXml', () => {
  const cols = [{ nhan: 'A', rong: 1000 }, { nhan: 'B', rong: 2000 }];
  const rows = [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']];

  test('sinh đúng số dòng — 1 dòng tiêu đề + 3 dòng dữ liệu', () => {
    expect((bangXml(cols, rows).match(/<w:tr>/g) || []).length).toBe(4);
  });
  test('sinh đúng số ô mỗi dòng', () => {
    expect((bangXml(cols, rows).match(/<w:tc>/g) || []).length).toBe(4 * 2);
  });
  test('có tblGrid khớp số cột và bề rộng', () => {
    const x = bangXml(cols, rows);
    expect((x.match(/<w:gridCol/g) || []).length).toBe(2);
    expect(x).toContain('w:w="1000"');
    expect(x).toContain('w:w="2000"');
  });
  test('có đủ 6 viền bảng', () => {
    const x = bangXml(cols, rows);
    for (const v of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) expect(x).toContain(`<w:${v} `);
  });
  test('THOÁT ký tự trong ô', () => {
    expect(bangXml(cols, [['x & y', '<z>']])).toContain('x &amp; y');
  });
  test('bảng rỗng vẫn có dòng tiêu đề', () => {
    expect((bangXml(cols, []).match(/<w:tr>/g) || []).length).toBe(1);
  });
  test('ô thiếu so với số cột được bù rỗng, không lệch bảng', () => {
    expect((bangXml(cols, [['chỉ một ô']]).match(/<w:tc>/g) || []).length).toBe(4);
  });
});

describe('anhXml', () => {
  test('nhúng ảnh bằng rId truyền vào, kích thước tính bằng EMU', () => {
    const x = anhXml('rId10', 1000, 500, 8000000);
    expect(x).toContain('r:embed="rId10"');
    expect(x).toContain('<wp:extent');
    const m = /cx="(\d+)" cy="(\d+)"/.exec(x);
    expect(+m[1]).toBe(8000000);
    expect(+m[2]).toBe(4000000);      // giữ đúng tỉ lệ 1000:500
  });
});

describe('documentXml', () => {
  // Chữ ký: documentXml(duLieu, rIdAnh, anh) — thiếu `anh` thì KHÔNG chèn ảnh.
  const x = documentXml(duLieu(), 'rId10', { w: 1200, h: 800 });

  test('bọc đúng thẻ gốc và khai đủ namespace cần cho ảnh + bảng', () => {
    expect(x).toContain('<w:document');
    expect(x).toContain('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"');
    expect(x).toContain('xmlns:r=');
    expect(x).toContain('xmlns:wp=');
    expect(x).toContain('xmlns:a=');
    expect(x).toContain('xmlns:pic=');
    expect(x.trimEnd().endsWith('</w:document>')).toBe(true);
  });

  test('có đủ 8 mục của tài liệu ISO', () => {
    for (const m of ['1. Mục đích', '2. Phạm vi áp dụng', '3. Tài liệu viện dẫn',
                     '4. Định nghĩa', '5. Lưu đồ quy trình', '6. Diễn giải lưu đồ',
                     '7. Hồ sơ lưu', '8. Theo dõi sửa đổi']) {
      expect(x).toContain(m);
    }
  });

  test('có khối kiểm soát tài liệu: mã số, lần ban hành, ngày hiệu lực', () => {
    expect(x).toContain('QT-SX-01');
    expect(x).toContain('01/03/2026');
    expect(x).toContain('02');
  });

  test('có 3 ô chữ ký', () => {
    for (const t of ['Người lập', 'Người kiểm tra', 'Người duyệt']) expect(x).toContain(t);
  });

  test('tên quy trình có & được thoát, không làm vỡ XML', () => {
    expect(x).toContain('Sản xuất &amp; kiểm soát chất lượng');
    expect(x).not.toMatch(/<w:t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  test('nhúng ảnh lưu đồ khi có rId', () => {
    expect(x).toContain('r:embed="rId10"');
  });

  test('không có rId thì bỏ ảnh, vẫn ra tài liệu hợp lệ', () => {
    const y = documentXml(duLieu(), null);
    expect(y).not.toContain('<w:drawing>');
    expect(y).toContain('6. Diễn giải lưu đồ');
  });

  test('kết thúc body bằng sectPr A3 ngang', () => {
    expect(x).toContain('w:orient="landscape"');
    expect(x.indexOf('<w:sectPr>')).toBeGreaterThan(x.indexOf('8. Theo dõi sửa đổi'));
  });

  test('bảng diễn giải có đủ số dòng dữ liệu', () => {
    const bang = x.slice(x.indexOf('6. Diễn giải lưu đồ'), x.indexOf('7. Hồ sơ lưu'));
    expect((bang.match(/<w:tr>/g) || []).length).toBe(1 + 2);
  });

  test('tài liệu thiếu tai_lieu vẫn ra được, không nổ', () => {
    const d = duLieu(); d.phienBan.tai_lieu = {};
    expect(() => documentXml(d, null)).not.toThrow();
  });
});

describe('các tệp phụ của gói docx', () => {
  test('[Content_Types].xml khai png và document.xml', () => {
    const x = contentTypesXml();
    expect(x).toContain('Extension="png"');
    expect(x).toContain('/word/document.xml');
  });
  test('_rels/.rels trỏ tới word/document.xml', () => {
    expect(relsXml()).toContain('Target="word/document.xml"');
  });
  test('document.xml.rels trỏ tới media/image1.png khi có ảnh', () => {
    expect(docRelsXml(true)).toContain('media/image1.png');
    expect(docRelsXml(false)).not.toContain('media/image1.png');
  });
  test('mọi tệp XML mở đầu bằng khai báo encoding UTF-8', () => {
    for (const x of [contentTypesXml(), relsXml(), docRelsXml(true), documentXml(duLieu(), null)]) {
      expect(x.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/quyTrinhDocx.test.js`
Expected: FAIL — `Failed to resolve import "./quyTrinhDocx"`

- [ ] **Step 3: Viết phần XML thuần**

```js
// ============================================================
// QUY TRÌNH — dựng tệp .docx khổ A3 ngang.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// .docx = ZIP chứa XML ⇒ dùng jszip có sẵn, KHÔNG thêm phụ thuộc mới.
// Các hàm dựng CHUỖI ở đây là hàm thuần, test được ở environment 'node'.
// Phần gói ZIP (taoDocx) cần Blob nên chỉ kiểm chứng tay bằng Word thật.
//
// Sai một chi tiết là Word báo hỏng tệp, nên mọi hằng số đều có test.
// ============================================================

import { thoatXml } from './quyTrinhSvg';

// A3 = 297 × 420 mm. 1mm = 1440/25.4 twip.
export const A3_W_TWIP = 23811;   // 420mm — cạnh dài, làm BỀ NGANG vì in ngang
export const A3_H_TWIP = 16838;   // 297mm
const EMU_PER_TWIP = 635;
const PHONG = 'Times New Roman';
const CO_MAC_DINH = 12;

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function sectPrXml() {
  return `<w:sectPr><w:pgSz w:w="${A3_W_TWIP}" w:h="${A3_H_TWIP}" w:orient="landscape"/>`
    + `<w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="284" w:footer="284" w:gutter="0"/></w:sectPr>`;
}

export function doanXml(text, { dam = false, co = CO_MAC_DINH, canGiua = false, mau = null } = {}) {
  const sz = Math.round(co * 2);   // Word dùng nửa-điểm
  const pPr = `<w:pPr>${canGiua ? '<w:jc w:val="center"/>' : ''}<w:spacing w:before="20" w:after="20"/></w:pPr>`;
  const rPr = `<w:rPr><w:rFonts w:ascii="${PHONG}" w:hAnsi="${PHONG}" w:cs="${PHONG}"/>`
    + `${dam ? '<w:b/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`
    + `${mau ? `<w:color w:val="${mau.replace('#', '')}"/>` : ''}</w:rPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${thoatXml(text)}</w:t></w:r></w:p>`;
}

const VIEN = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map(v => `<w:${v} w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>`).join('');

/** cols: [{nhan, rong}] (rong tính bằng twip) · rows: [[ô, ô, …]] */
export function bangXml(cols, rows, { coChu = 10 } = {}) {
  const o = (text, { dam = false, nen = null } = {}, rong) =>
    `<w:tc><w:tcPr><w:tcW w:w="${rong}" w:type="dxa"/>`
    + `${nen ? `<w:shd w:val="clear" w:color="auto" w:fill="${nen}"/>` : ''}</w:tcPr>`
    + `${doanXml(text, { dam, co: coChu })}</w:tc>`;

  const grid = `<w:tblGrid>${cols.map(c => `<w:gridCol w:w="${c.rong}"/>`).join('')}</w:tblGrid>`;
  const dauBang = `<w:tr>${cols.map(c => o(c.nhan, { dam: true, nen: 'EEF2F7' }, c.rong)).join('')}</w:tr>`;
  const than = rows.map(r =>
    `<w:tr>${cols.map((c, i) => o(r[i] ?? '', {}, c.rong)).join('')}</w:tr>`).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${VIEN}</w:tblBorders></w:tblPr>`
    + `${grid}${dauBang}${than}</w:tbl>`;
}

/** Ảnh nội tuyến. rongEmu là bề ngang mong muốn; chiều cao suy ra theo tỉ lệ ảnh. */
export function anhXml(rId, wPx, hPx, rongEmu) {
  const cx = Math.round(rongEmu), cy = Math.round(rongEmu * (hPx / wPx));
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="1" name="LuuDo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="LuuDo"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const ngayVn = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};
const tieuDeMuc = t => doanXml(t, { dam: true, co: 13 });

export function documentXml({ quyTrinh, phienBan, dienGiai, lichSu }, rIdAnh, anh = null) {
  const t = phienBan.tai_lieu || {};
  const RONG = A3_W_TWIP - 1134;                     // trừ lề hai bên
  const p = [];

  // ── Khối kiểm soát tài liệu ──
  p.push(bangXml(
    [{ nhan: 'Tên quy trình', rong: Math.round(RONG * 0.5) },
     { nhan: 'Thông tin kiểm soát tài liệu', rong: Math.round(RONG * 0.5) }],
    [[quyTrinh.ten,
      `Mã số: ${quyTrinh.ma_so}    |    Lần ban hành: ${String(phienBan.lan_ban_hanh).padStart(2, '0')}`
      + `    |    Phiên bản: ${phienBan.phien_ban}    |    Ngày hiệu lực: ${ngayVn(phienBan.ngay_hieu_luc)}`]],
    { coChu: 11 }));

  // ── Ba ô chữ ký ──
  const ba = Math.round(RONG / 3);
  p.push(bangXml(
    [{ nhan: 'Người lập', rong: ba }, { nhan: 'Người kiểm tra', rong: ba }, { nhan: 'Người duyệt', rong: ba }],
    [[t.nguoiLap || '', t.nguoiKiemTra || '', t.nguoiDuyet || ''], ['', '', '']],
    { coChu: 10 }));

  // ── Mục 1–4 ──
  p.push(tieuDeMuc('1. Mục đích'), doanXml(t.mucDich || ''));
  p.push(tieuDeMuc('2. Phạm vi áp dụng'), doanXml(t.phamVi || ''));
  p.push(tieuDeMuc('3. Tài liệu viện dẫn'));
  for (const v of (t.vienDan || [])) p.push(doanXml('• ' + v));
  p.push(tieuDeMuc('4. Định nghĩa và từ viết tắt'));
  for (const d of (t.dinhNghia || [])) p.push(doanXml(`• ${d.tu} — ${d.nghia}`));

  // ── Mục 5: lưu đồ ──
  p.push(tieuDeMuc('5. Lưu đồ quy trình'));
  if (rIdAnh && anh) p.push(anhXml(rIdAnh, anh.w, anh.h, RONG * EMU_PER_TWIP));

  // ── Mục 6: diễn giải ──
  p.push(tieuDeMuc('6. Diễn giải lưu đồ'));
  p.push(bangXml(
    [{ nhan: 'Bước', rong: Math.round(RONG * 0.04) },
     { nhan: 'Nội dung', rong: Math.round(RONG * 0.18) },
     { nhan: 'Người thực hiện', rong: Math.round(RONG * 0.12) },
     { nhan: 'Diễn giải chi tiết', rong: Math.round(RONG * 0.46) },
     { nhan: 'Hồ sơ / Biểu mẫu', rong: Math.round(RONG * 0.20) }],
    (dienGiai || []).map(r => [
      String(r.stt), r.ten, r.nguoiThucHien, r.dienGiai,
      (r.hoSo || []).join(', ') || '—',
    ])));

  // ── Mục 7: hồ sơ lưu ──
  p.push(tieuDeMuc('7. Hồ sơ lưu'));
  p.push(bangXml(
    [{ nhan: 'TT', rong: Math.round(RONG * 0.04) },
     { nhan: 'Tên hồ sơ', rong: Math.round(RONG * 0.30) },
     { nhan: 'Bộ phận lưu', rong: Math.round(RONG * 0.18) },
     { nhan: 'Thời gian lưu', rong: Math.round(RONG * 0.18) },
     { nhan: 'Hình thức lưu', rong: Math.round(RONG * 0.30) }],
    (t.hoSoLuu || []).map((h, i) => [String(i + 1), h.ten, h.boPhan, h.thoiGian, h.hinhThuc])));

  // ── Mục 8: theo dõi sửa đổi ──
  p.push(tieuDeMuc('8. Theo dõi sửa đổi tài liệu'));
  p.push(bangXml(
    [{ nhan: 'Lần sửa', rong: Math.round(RONG * 0.08) },
     { nhan: 'Ngày', rong: Math.round(RONG * 0.12) },
     { nhan: 'Phiên bản', rong: Math.round(RONG * 0.10) },
     { nhan: 'Nội dung sửa đổi', rong: Math.round(RONG * 0.50) },
     { nhan: 'Người sửa', rong: Math.round(RONG * 0.20) }],
    (lichSu || []).map(r => [
      String(r.lan_ban_hanh).padStart(2, '0'), r.ngay, r.phien_ban, r.noiDung || '', r.nguoi || '',
    ])));

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  return `${XML_HEAD}<w:document ${NS}><w:body>${p.join('')}${sectPrXml()}</w:body></w:document>`;
}

export function contentTypesXml() {
  return `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Default Extension="png" ContentType="image/png"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `</Types>`;
}

export function relsXml() {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `</Relationships>`;
}

export function docRelsXml(coAnh) {
  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + (coAnh
      ? `<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`
      : '')
    + `</Relationships>`;
}
```

- [ ] **Step 4: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/quyTrinhDocx.test.js`
Expected: PASS — 28 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/quyTrinhDocx.js src/lib/quyTrinhDocx.test.js
git commit -m "feat(quy-trinh): dung XML .docx A3 ngang du 8 muc ISO"
```

---

## Task 11: `quyTrinhDocx.js` — gói ZIP + `quyTrinhXuat.js` đổi SVG sang PNG

Phần này cần API trình duyệt (`Image`, `canvas`, `Blob`) nên **không test đơn vị được** — kiểm chứng tay ở Task 18.

**Files:**
- Modify: `src/lib/quyTrinhDocx.js`
- Create: `src/lib/quyTrinhXuat.js`

- [ ] **Step 1: Thêm `taoDocx` vào cuối `quyTrinhDocx.js`**

```js
/** Gói toàn bộ thành tệp .docx. pngBuffer là ArrayBuffer ảnh lưu đồ (có thể null).
 *  Cần jszip nên KHÔNG test đơn vị — kiểm chứng bằng cách mở tệp bằng Word thật. */
export async function taoDocx(duLieu, pngBuffer, kichThuocAnh) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const coAnh = !!pngBuffer && !!kichThuocAnh;

  zip.file('[Content_Types].xml', contentTypesXml());
  zip.folder('_rels').file('.rels', relsXml());
  const w = zip.folder('word');
  w.file('document.xml', documentXml(duLieu, coAnh ? 'rId10' : null, kichThuocAnh));
  w.folder('_rels').file('document.xml.rels', docRelsXml(coAnh));
  if (coAnh) w.folder('media').file('image1.png', pngBuffer);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
```

- [ ] **Step 2: Tạo `src/lib/quyTrinhXuat.js`**

```js
// ============================================================
// QUY TRÌNH — ba đường xuất tệp: PNG, Word .docx, và in PDF.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục G)
//
// Module này ĐỤNG API TRÌNH DUYỆT (Image, canvas, Blob) nên không test
// đơn vị được. Mọi phép tính đã đẩy hết sang quyTrinhSvg.js / quyTrinhDocx.js
// là những chỗ CÓ test — ở đây chỉ còn phần nối dây.
// ============================================================

import { saveAs } from 'file-saver';
import { soDoSangSvg } from './quyTrinhSvg';
import { dongDienGiai } from './quyTrinhDienGiai';
import { taoDocx } from './quyTrinhDocx';

/** SVG → PNG. Trả { blob, w, h }. tyLe 2 cho nét khi in. */
export async function soDoSangPng(soDo, { tyLe = 2 } = {}) {
  const svg = soDoSangSvg(soDo, { tyLe });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((ok, loi) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => loi(new Error('Không dựng được ảnh lưu đồ.'));
      i.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    return { blob, w: cv.width, h: cv.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const tenTep = (qt, pb, duoi) => `${qt.ma_so}_v${pb.phien_ban}${duoi}`;

export async function xuatPng(quyTrinh, phienBan) {
  const { blob } = await soDoSangPng(phienBan.so_do);
  saveAs(blob, tenTep(quyTrinh, phienBan, '_luu-do.png'));
}

export async function xuatDocx(quyTrinh, phienBan, lichSu) {
  const { blob, w, h } = await soDoSangPng(phienBan.so_do);
  const docx = await taoDocx(
    { quyTrinh, phienBan, dienGiai: dongDienGiai(phienBan.so_do), lichSu },
    await blob.arrayBuffer(),
    { w, h },
  );
  saveAs(docx, tenTep(quyTrinh, phienBan, '.docx'));
}

/** In PDF: dựa vào @media print của XemTruocTab, không cần thư viện. */
export function inPdf() {
  window.print();
}
```

- [ ] **Step 3: Chạy toàn bộ test cho chắc không vỡ chỗ nào**

Run: `npm test`
Expected: PASS — mọi tệp test vẫn xanh (2 tệp mới không có test, đúng như thiết kế)

- [ ] **Step 4: Commit**

```bash
git add src/lib/quyTrinhDocx.js src/lib/quyTrinhXuat.js
git commit -m "feat(quy-trinh): goi .docx bang jszip + xuat PNG tu SVG"
```

---

## Task 12: Phân quyền — thêm phân hệ vào registry

**Files:**
- Modify: `src/lib/permRegistry.js:14` (thêm phần tử vào `PERM_REGISTRY`)
- Modify: `src/lib/AuthContext.jsx:11-19` (thêm khoá vào `MODULE_PERMS`)
- Test: `src/lib/permRegistry.test.js`

- [ ] **Step 1: Viết test thất bại (thêm vào cuối `permRegistry.test.js`)**

```js
describe('phân hệ Quy trình', () => {
  const qt = () => PERM_REGISTRY.find(m => m.module === 'quy_trinh');

  test('có mặt trong registry với legacyAccess riêng', () => {
    expect(qt()).toBeTruthy();
    expect(qt().legacyAccess).toBe('access_quytrinh');
    expect(qt().label).toBe('Quy Trình');
  });

  test('có đúng 2 tab: danh mục và soạn thảo', () => {
    expect(qt().tabs.map(t => t.id)).toEqual(['danh_muc', 'soan_thao']);
  });

  test('KHÔNG có cap nào cho ban hành — quyền đó cứng theo vai trò ADMIN', () => {
    for (const t of qt().tabs) {
      expect(t.caps).not.toContain('approve');
      expect(t.caps).not.toContain('publish');
    }
  });

  test('admin thấy được phân hệ', () => {
    expect(canSeeModule({ role: 'ADMIN' }, 'quy_trinh')).toBe(true);
  });

  test('nhân viên chưa được cấp quyền thì KHÔNG thấy', () => {
    expect(canSeeModule({ role: 'AGENT', permissions: {} }, 'quy_trinh')).toBe(false);
  });

  test('nhân viên được cấp view 1 tab thì thấy phân hệ', () => {
    const u = { role: 'AGENT', permissions: { 'tab.quy_trinh.danh_muc.view': true } };
    expect(canSeeModule(u, 'quy_trinh')).toBe(true);
    expect(canSeeTab(u, 'quy_trinh', 'soan_thao')).toBe(false);
  });

  test('người dùng CŨ không tự nhiên có quyền sau khi di trú', () => {
    const cu = migrateLegacyToTabPerms({ access_warehouse: true, kho_edit: true });
    expect(cu['tab.quy_trinh.danh_muc.view']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test cho chắc là hỏng**

Run: `npx vitest run src/lib/permRegistry.test.js -t "Quy trình"`
Expected: FAIL — `expect(received).toBeTruthy()` vì chưa có module

- [ ] **Step 3: Thêm phần tử vào `PERM_REGISTRY`**

Chèn ngay sau khối `module: 'quality'` (`src/lib/permRegistry.js:72`):

```js
  {
    module: 'quy_trinh', label: 'Quy Trình', icon: '🔀', legacyAccess: 'access_quytrinh',
    tabs: [
      // io = xuất PNG / in PDF / tải Word — một người hoặc được xuất tài liệu, hoặc không.
      { id: 'danh_muc',  label: 'Danh mục quy trình', caps: ['view', 'create', 'delete', 'io'] },
      { id: 'soan_thao', label: 'Soạn thảo lưu đồ',   caps: ['view', 'edit'] },
    ],
    // KHÔNG khai cap ban hành: quyền đó cứng theo role === 'ADMIN', xem
    // docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md mục C.
  },
```

- [ ] **Step 4: Thêm khoá vào `MODULE_PERMS` (`src/lib/AuthContext.jsx:18`)**

```js
  access_quality:     'Truy cập Chất Lượng SP',
  access_quytrinh:    'Truy cập Quy Trình',
```

- [ ] **Step 5: Chạy test cho chắc là qua**

Run: `npx vitest run src/lib/permRegistry.test.js`
Expected: PASS — mọi test cũ vẫn xanh (test `registry shape` sẽ tự soát 2 tab mới có `view`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/permRegistry.js src/lib/AuthContext.jsx src/lib/permRegistry.test.js
git commit -m "feat(quy-trinh): dang ky phan he vao registry phan quyen"
```

---

## Task 13: `quyTrinhApi.js` — lớp gọi Supabase

Chỗ **duy nhất** trong phân hệ chạm DB. Component không gọi `supabase` thẳng.

**Files:**
- Create: `src/lib/quyTrinhApi.js`

Không test đơn vị (cần DB thật); kiểm chứng ở Task 18–19.

- [ ] **Step 1: Viết module**

```js
// ============================================================
// QUY TRÌNH — lớp gọi Supabase. Chỗ DUY NHẤT của phân hệ chạm DB.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục B, C, H)
//
// Ba chuyển trạng thái đi qua RPC, KHÔNG update thẳng cột trang_thai —
// cột đó đã bị revoke khỏi quyền ghi của vai trò authenticated.
// ============================================================

import { supabase, fetchAllRows } from './supabase';
import { mauSoDo, mauTaiLieu, maSoTiepTheo } from './quyTrinhMau';

const nem = (e, viec) => { if (e) throw new Error(`${viec}: ${e.message || e}`); };

export async function dsQuyTrinh() {
  const { data, error } = await fetchAllRows(() =>
    supabase.from('quy_trinh').select('*').order('ma_so'));
  nem(error, 'Không tải được danh mục quy trình');
  return data || [];
}

export async function taiPhienBan(quyTrinhId) {
  const { data, error } = await supabase
    .from('quy_trinh_phien_ban').select('*')
    .eq('quy_trinh_id', quyTrinhId).order('lan_ban_hanh', { ascending: false });
  nem(error, 'Không tải được các phiên bản');
  return data || [];
}

/** Bản để mở ra sửa: ưu tiên bản nháp/chờ duyệt, không có thì bản đang hiệu lực. */
export function banDangLam(dsPhienBan) {
  return dsPhienBan.find(p => p.trang_thai === 'draft')
    || dsPhienBan.find(p => p.trang_thai === 'wait')
    || dsPhienBan.find(p => p.trang_thai === 'published')
    || dsPhienBan[0] || null;
}

export async function taoQuyTrinh({ ten, nhom, nguoiSoan, maDaCo }) {
  const ma_so = maSoTiepTheo(nhom, maDaCo);
  const { data: qt, error: e1 } = await supabase
    .from('quy_trinh')
    .insert({ ma_so, ten, nhom, nguoi_soan: nguoiSoan, trang_thai: 'draft' })
    .select().single();
  nem(e1, 'Không tạo được quy trình');

  const { data: pb, error: e2 } = await supabase
    .from('quy_trinh_phien_ban')
    .insert({
      quy_trinh_id: qt.id, phien_ban: '1.0', lan_ban_hanh: 1, trang_thai: 'draft',
      so_do: mauSoDo(nhom), tai_lieu: { ...mauTaiLieu(nhom), nguoiLap: nguoiSoan },
      nguoi_tao: nguoiSoan, ghi_chu_sua_doi: 'Ban hành lần đầu.',
    })
    .select().single();
  nem(e2, 'Không tạo được phiên bản đầu tiên');
  return { quyTrinh: qt, phienBan: pb };
}

/** Chỉ ghi 3 cột được cấp quyền. Cố ghi trang_thai ở đây sẽ bị DB từ chối. */
export async function luuNhap(phienBanId, { so_do, tai_lieu, ghi_chu_sua_doi }) {
  const { error } = await supabase.from('quy_trinh_phien_ban')
    .update({ so_do, tai_lieu, ghi_chu_sua_doi }).eq('id', phienBanId);
  nem(error, 'Không lưu được bản nháp');
}

export async function doiTenQuyTrinh(id, { ten, nhom }) {
  const { error } = await supabase.from('quy_trinh')
    .update({ ten, nhom, updated_at: new Date().toISOString() }).eq('id', id);
  nem(error, 'Không đổi được tên quy trình');
}

export async function guiDuyet(phienBanId) {
  const { error } = await supabase.rpc('rpc_qt_gui_duyet', { p_phien_ban_id: phienBanId });
  nem(error, 'Không gửi duyệt được');
}

export async function traLai(phienBanId, lyDo) {
  const { error } = await supabase.rpc('rpc_qt_tra_lai', { p_phien_ban_id: phienBanId, p_ly_do: lyDo });
  nem(error, 'Không trả lại được');
}

export async function banHanh(phienBanId) {
  const { error } = await supabase.rpc('rpc_qt_ban_hanh', { p_phien_ban_id: phienBanId });
  nem(error, 'Không ban hành được');
}

export async function xoaQuyTrinh(id) {
  const { error } = await supabase.from('quy_trinh').delete().eq('id', id);
  nem(error, 'Không xoá được quy trình (chỉ xoá được bản nháp)');
}

/** Mục 8 "Theo dõi sửa đổi" = chính danh sách phiên bản, không cần bảng riêng. */
export function lichSuSuaDoi(dsPhienBan) {
  const ngayVn = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
  };
  return dsPhienBan
    .slice()
    .sort((a, b) => a.lan_ban_hanh - b.lan_ban_hanh)
    .map(p => ({
      lan_ban_hanh: p.lan_ban_hanh,
      ngay: ngayVn(p.published_at || p.created_at),
      phien_ban: p.phien_ban,
      noiDung: p.ghi_chu_sua_doi || '',
      nguoi: p.nguoi_ban_hanh || p.nguoi_tao || '',
    }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/quyTrinhApi.js
git commit -m "feat(quy-trinh): lop goi Supabase, 3 chuyen trang thai qua RPC"
```

---

## Task 14: `QuyTrinhApp.jsx` + nối route + trang chủ

**Files:**
- Create: `src/pages/quy-trinh/QuyTrinhApp.jsx`
- Modify: `src/App.jsx:10-17` và `:53-61`
- Modify: `src/pages/HomePage.jsx:12`

- [ ] **Step 1: Tạo `QuyTrinhApp.jsx`**

Giữ state dùng chung cho cả 5 tab (quy trình đang mở, sơ đồ, ngăn xếp hoàn tác) và truyền xuống. Dùng `ModuleShell` + `TabButton` như 8 phân hệ kia.

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import ModuleShell, { TabButton } from '../../components/ModuleShell';
import { useTabPerm, useAuth } from '../../lib/AuthContext';
import * as api from '../../lib/quyTrinhApi';
import DanhMucTab from './DanhMucTab';
import SoanThaoTab from './SoanThaoTab';
import ThongTinTab from './ThongTinTab';
import DienGiaiTab from './DienGiaiTab';
import XemTruocTab from './XemTruocTab';

const MAU = '#ea580c';   // accent riêng của phân hệ, chưa phân hệ nào dùng

const TABS = [
  { id: 'danh_muc',  nhan: 'Danh mục quy trình' },
  { id: 'soan_thao', nhan: 'Trình vẽ lưu đồ' },
  { id: 'thong_tin', nhan: 'Thông tin tài liệu' },
  { id: 'dien_giai', nhan: 'Bảng diễn giải' },
  { id: 'xem_truoc', nhan: 'Xem trước & Xuất' },
];

export default function QuyTrinhApp() {
  const { user, isAdmin } = useAuth();
  const pDanhMuc = useTabPerm('quy_trinh', 'danh_muc');
  const pSoanThao = useTabPerm('quy_trinh', 'soan_thao');

  const [tab, setTab] = useState('danh_muc');
  const [loading, setLoading] = useState(true);
  const [ds, setDs] = useState([]);
  const [mo, setMo] = useState(null);        // { quyTrinh, phienBan, dsPhienBan }
  const [soDo, setSoDo] = useState(null);
  const [truoc, setTruoc] = useState([]);    // ngăn xếp hoàn tác
  const [sau, setSau] = useState([]);

  const nap = useCallback(async () => {
    setLoading(true);
    try { setDs(await api.dsQuyTrinh()); }
    catch (e) { alert(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { nap(); }, [nap]);

  const moQuyTrinh = async (qt) => {
    const dsPb = await api.taiPhienBan(qt.id);
    const pb = api.banDangLam(dsPb);
    setMo({ quyTrinh: qt, phienBan: pb, dsPhienBan: dsPb });
    setSoDo(pb?.so_do || null);
    setTruoc([]); setSau([]);
    setTab('soan_thao');
  };

  // Mọi thay đổi sơ đồ đi qua đây ⇒ hoàn tác là đẩy/rút ngăn xếp.
  const doiSoDo = (moi) => {
    setTruoc(t => [...t.slice(-39), soDo]);
    setSau([]);
    setSoDo(moi);
  };
  const hoanTac = () => {
    if (!truoc.length) return;
    setSau(s => [...s, soDo]);
    setSoDo(truoc.at(-1));
    setTruoc(t => t.slice(0, -1));
  };
  const lamLai = () => {
    if (!sau.length) return;
    setTruoc(t => [...t, soDo]);
    setSoDo(sau.at(-1));
    setSau(s => s.slice(0, -1));
  };

  const chung = { user, isAdmin, mo, setMo, soDo, doiSoDo, hoanTac, lamLai,
    coHoanTac: truoc.length > 0, coLamLai: sau.length > 0,
    pDanhMuc, pSoanThao, napLai: nap, mau: MAU };

  return (
    <ModuleShell
      title="Quy Trình" icon={GitBranch} color={MAU}
      loading={loading} onRefresh={nap}
      tabs={TABS.map(t => (
        <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}
          label={t.nhan} color={MAU} />
      ))}
    >
      {tab === 'danh_muc'  && <DanhMucTab  {...chung} ds={ds} onMo={moQuyTrinh} />}
      {tab === 'soan_thao' && <SoanThaoTab {...chung} />}
      {tab === 'thong_tin' && <ThongTinTab {...chung} />}
      {tab === 'dien_giai' && <DienGiaiTab {...chung} />}
      {tab === 'xem_truoc' && <XemTruocTab {...chung} />}
    </ModuleShell>
  );
}
```

- [ ] **Step 2: Nối route trong `src/App.jsx`**

Thêm vào khối lazy import (sau dòng 17):

```js
const QuyTrinhApp    = lazy(() => import('./pages/quy-trinh/QuyTrinhApp'));
```

Thêm vào khối route (sau dòng 61):

```jsx
        <Route path="/quy-trinh/*" element={<ProtectedRoute requiredModule="access_quytrinh"><QuyTrinhApp /></ProtectedRoute>} />
```

- [ ] **Step 3: Thêm thẻ vào trang chủ `src/pages/HomePage.jsx`**

Thêm phần tử vào mảng `MODULES`, đặt sau `quality`:

```js
  {
    id: 'quy_trinh',
    label: 'Quy Trình',
    subtitle: 'Lưu đồ & tài liệu ISO',
    icon: GitBranch,
    path: '/quy-trinh',
    color: '#ea580c',
    permKey: 'access_quytrinh',
    regModule: 'quy_trinh',
  },
```

Và thêm `GitBranch` vào dòng import `lucide-react` ở đầu tệp.

- [ ] **Step 4: Chạy dev server, đăng nhập admin, kiểm tra**

Dùng cấu hình `qlsx-dev`. Vào `/home` → phải thấy thẻ **Quy Trình** màu cam. Bấm vào → mở được `/quy-trinh`, hiện ModuleShell với 5 tab, chưa có nội dung.

- [ ] **Step 5: Commit**

```bash
git add src/pages/quy-trinh/QuyTrinhApp.jsx src/App.jsx src/pages/HomePage.jsx
git commit -m "feat(quy-trinh): khung phan he, route va the o trang chu"
```

---

## Task 15: `DanhMucTab.jsx`

**Files:**
- Create: `src/pages/quy-trinh/DanhMucTab.jsx`

**Nguồn markup và style:** `docs/mockups/quy-trinh-mockup.html`, phần `<section class="view" id="v-list">` cùng các lớp CSS `.list-wrap .rail .rail-item .grid .card .pill .code .ver` và modal `#mask`. Chuyển sang JSX, đổi biến màu CSS sang giá trị thật của app (`#f6f8fb`, `#e2e8f0`, `#0f172a`, accent `#ea580c`).

- [ ] **Step 1: Dựng component**

Yêu cầu chức năng, đối chiếu mockup:

1. Rail trái: lọc theo `NHOM` (từ `quyTrinhMau.js`) kèm số đếm, và lọc theo trạng thái (`draft` Bản nháp / `wait` Chờ duyệt / `published` Đã ban hành / `expired` Hết hiệu lực).
2. Ô tìm kiếm lọc theo `ten` hoặc `ma_so`, không phân biệt hoa thường.
3. Lưới thẻ: mã số, tên, pill trạng thái, số bước (`so_do.nodes` trừ start/end), ngày hiệu lực, người soạn, phiên bản. Bấm thẻ → gọi `onMo(qt)`.
4. Nút **Tạo quy trình mới** chỉ hiện khi `pDanhMuc.create`. Modal gồm: tên, nhóm (select `NHOM`), mã số tự sinh bằng `maSoTiepTheo(nhom, ds.map(d => d.ma_so))` cập nhật khi đổi nhóm, người soạn (readonly `user.name`). Bấm Tạo → `api.taoQuyTrinh(...)` → `napLai()` → `onMo(quyTrinh)`.
5. Nút **Xoá** trên thẻ chỉ hiện khi `pDanhMuc.delete` **và** `trang_thai === 'draft'`; hỏi xác nhận trước khi gọi `api.xoaQuyTrinh`.

- [ ] **Step 2: Kiểm chứng tay**

Đăng nhập admin → tab Danh mục: lọc nhóm và trạng thái ra đúng số; gõ tìm kiếm lọc đúng; tạo một quy trình mới nhóm Chất lượng → mã phải là `QT-CL-01` (hoặc số tiếp theo), trạng thái **Bản nháp**, và tự nhảy sang trình vẽ.

- [ ] **Step 3: Commit**

```bash
git add src/pages/quy-trinh/DanhMucTab.jsx
git commit -m "feat(quy-trinh): man hinh danh muc + tao quy trinh moi"
```

---

## Task 16: `SoanThaoTab.jsx` — trình vẽ

Màn hình quan trọng nhất. **Toàn bộ phép tính đã nằm ở `quyTrinhSoDo.js`** — tệp này chỉ vẽ và bắt sự kiện.

**Files:**
- Create: `src/pages/quy-trinh/SoanThaoTab.jsx`

**Nguồn markup và style:** `docs/mockups/quy-trinh-mockup.html`, phần `<section class="view" id="v-editor">` cùng CSS `.ed .ed-bar .palette .cv-scroll .cv .lane-head .phase-lbl .node .addh .pop .insp .rolebar`. Riêng phần JS trong mockup **không bê nguyên** — thay bằng lời gọi vào `quyTrinhSoDo.js`.

- [ ] **Step 1: Dựng khung 3 cột + canvas**

Bố cục lưới `184px 1fr 264px`: bảng trái, canvas giữa, bảng thuộc tính phải. Canvas vẽ từ `soDo` bằng chính các hàm đã có:

```jsx
import {
  GUT, LANE_W, HEAD_H, LOAI_KHOI, MAU_DUONG,
  nodeX, drawW, drawH, phaseTop, routeEdge, thuTuBuoc,
  themBuoc, xoaKhoi, doiCot, tuXepLai,
} from '../../lib/quyTrinhSoDo';
```

Khối vẽ bằng `<div>` chồng lớp (hình nền màu + lớp trong trắng) đúng như mockup; đường nối vẽ bằng một `<svg>` phủ lên, `d` lấy từ `routeEdge(soDo, e)`.

- [ ] **Step 2: Nút ＋ — thao tác chính**

Khối đang chọn hiện nút ＋; khối `dec` hiện hai nút (OK xuống, NG trái). Bấm → mở bảng chọn (tên / loại / cột) → khi bấm Thêm:

```js
doiSoDo(themBuoc(soDo, { tuId, nhanh, loai, cot, ten }));
```

- [ ] **Step 3: Kéo khối, đổi cột, xoá, tự xếp lại**

- Kéo: cập nhật `dx`/`y` cục bộ trong lúc kéo cho mượt; **thả xong** mới gọi `doiSoDo`. Xác định cột rơi vào bằng `Math.floor((nodeX(n) + n.w / 2) / LANE_W)` rồi `doiCot`, và báo bằng toast: *"Đã chuyển sang cột X — người thực hiện thành Y."*
- Xoá: `doiSoDo(xoaKhoi(soDo, id))`. Phím `Delete` cũng gọi hàm này.
- Tự xếp lại: `doiSoDo(tuXepLai(soDo))`.
- Hoàn tác / Làm lại: gọi `hoanTac()` / `lamLai()` từ props. `Ctrl+Z` / `Ctrl+Shift+Z`.

- [ ] **Step 4: Bảng thuộc tính bên phải**

Chọn khối → sửa Tên bước, Cột (select — đổi là gọi `doiCot`), Người thực hiện (readonly, lấy `soDo.lanes[n.lane].owner`), Diễn giải chi tiết, Hồ sơ/Biểu mẫu, Thời gian chuẩn, Màu khối. Chọn đường nối → sửa Nhãn và Loại nhánh (`n`/`ok`/`ng`).

Mọi ô nhập chỉ gọi `doiSoDo` khi **rời ô** (`onBlur`), không phải mỗi lần gõ — tránh đẩy 40 bản vào ngăn xếp hoàn tác chỉ vì gõ một câu.

- [ ] **Step 5: Thanh trạng thái & vòng duyệt**

```jsx
const { loi, canhBao } = kiemTraLuuDo(soDo);
const banHanhDuoc = isAdmin && loi.length === 0 && phienBan.trang_thai === 'wait';
```

- **Lưu nháp** — `pSoanThao.edit`, gọi `api.luuNhap`.
- **Gửi duyệt** — `pSoanThao.edit` và trạng thái `draft`, gọi `api.guiDuyet`.
- **Ban hành** — **chỉ `isAdmin`**. Khi `loi.length > 0` thì khoá nút và hiện danh sách lỗi ngay dưới thanh công cụ, mỗi lỗi bấm được để nhảy tới khối. Gọi `api.banHanh`.
- **Trả lại** — chỉ `isAdmin`, trạng thái `wait`.

- [ ] **Step 6: Kiểm chứng tay**

Vẽ 5 bước bằng nút ＋ (có 1 khối Quyết định với 2 nhánh OK/NG) → kéo một khối sang cột khác, kiểm tra người thực hiện đổi theo → `Ctrl+Z` trả lại → Tự xếp lại → Lưu nháp → tải lại trang, sơ đồ phải còn nguyên.

- [ ] **Step 7: Commit**

```bash
git add src/pages/quy-trinh/SoanThaoTab.jsx
git commit -m "feat(quy-trinh): trinh ve luu do bang nut cong"
```

---

## Task 17: `ThongTinTab.jsx` + `DienGiaiTab.jsx`

**Files:**
- Create: `src/pages/quy-trinh/ThongTinTab.jsx`
- Create: `src/pages/quy-trinh/DienGiaiTab.jsx`

- [ ] **Step 1: `ThongTinTab.jsx` — mục 1–4 và 7**

Biểu mẫu sửa `phienBan.tai_lieu`, mở ra đã điền sẵn mẫu theo nhóm (đã nạp lúc `taoQuyTrinh`). Các trường: `mucDich`, `phamVi` (textarea); `vienDan` (danh sách chuỗi, thêm/xoá dòng); `dinhNghia` (danh sách `{tu, nghia}`); `hoSoLuu` (bảng `{ten, boPhan, thoiGian, hinhThuc}`); `nguoiLap`, `nguoiKiemTra`, `nguoiDuyet`.

Thêm nút **Nạp lại mẫu theo nhóm** gọi `mauTaiLieu(quyTrinh.nhom)` — hỏi xác nhận vì sẽ đè nội dung đang có.

Chỉ sửa được khi `pSoanThao.edit`; lưu bằng `api.luuNhap`.

- [ ] **Step 2: `DienGiaiTab.jsx` — bảng diễn giải**

```jsx
import { dongDienGiai } from '../../lib/quyTrinhDienGiai';
const rows = dongDienGiai(soDo);
```

Bảng theo mockup (`#v-table`): Bước · Người thực hiện · Diễn giải chi tiết · Hồ sơ/Biểu mẫu · Thời gian. Dòng `nhanh === 'ok'` viền trái xanh, `'ng'` viền trái đỏ.

Sửa ở bảng ghi ngược vào khối: ô Diễn giải / Hồ sơ / Thời gian sửa được (khi có `pSoanThao.edit`), `onBlur` gọi:

```js
doiSoDo({ ...soDo, nodes: soDo.nodes.map(n => n.id === khoiId ? { ...n, desc: giaTri } : n) });
```

Cột **Người thực hiện** để readonly kèm chú thích *"đổi bằng cách đổi cột của bước ở trình vẽ"* — một nguồn sự thật duy nhất.

- [ ] **Step 3: Kiểm chứng tay**

Sửa một ô Diễn giải ở bảng → sang trình vẽ, chọn đúng khối đó, ô Diễn giải phải đổi theo.

- [ ] **Step 4: Commit**

```bash
git add src/pages/quy-trinh/ThongTinTab.jsx src/pages/quy-trinh/DienGiaiTab.jsx
git commit -m "feat(quy-trinh): man hinh thong tin tai lieu va bang dien giai"
```

---

## Task 18: `XemTruocTab.jsx` — bản in A3 và ba nút xuất

**Files:**
- Create: `src/pages/quy-trinh/XemTruocTab.jsx`

**Nguồn markup và style:** mockup phần `<section class="view" id="v-print">` cùng CSS `.paper .doc-ctl .doc-sign .sec-h .iso-grid .ptbl`.

- [ ] **Step 1: Dựng bản xem trước**

Dựng đúng 8 mục như mục F của spec. Lưu đồ chèn bằng SVG sinh sẵn:

```jsx
<div dangerouslySetInnerHTML={{ __html: soDoSangSvg(soDo) }} />
```

An toàn vì `soDoSangSvg` đã thoát mọi ký tự người dùng nhập qua `thoatXml` — có test riêng cho việc này ở Task 9.

Bảng mục 8 lấy từ `api.lichSuSuaDoi(dsPhienBan)`.

- [ ] **Step 2: Nối ba nút xuất**

```jsx
import { xuatPng, xuatDocx, inPdf } from '../../lib/quyTrinhXuat';
```

Cả ba nút chỉ hiện khi `pDanhMuc.io`.

- [ ] **Step 3: CSS in khổ A3 ngang**

Thêm vào tệp component một khối `<style>`:

```css
@media print {
  @page { size: A3 landscape; margin: 10mm; }
  body * { visibility: hidden; }
  .qt-paper, .qt-paper * { visibility: visible; }
  .qt-paper { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
}
```

- [ ] **Step 4: Kiểm chứng tay — quan trọng nhất của task này**

1. Bấm **Xuất PNG** → mở tệp tải về, lưu đồ phải khớp với những gì thấy trên trình vẽ.
2. Bấm **In** → hộp thoại in phải hiện khổ **A3 ngang**, chỉ có tờ giấy, không có khung ứng dụng.
3. Bấm **Xuất Word** → **mở tệp bằng Microsoft Word thật**. Phải: mở được không báo hỏng tệp; đúng khổ A3 ngang (Layout → Size); có ảnh lưu đồ; đủ 8 mục; tiếng Việt có dấu đúng.
4. Thử với một quy trình có tên bước chứa ký tự `&` và `<` → cả PNG lẫn Word vẫn mở được.

- [ ] **Step 5: Commit**

```bash
git add src/pages/quy-trinh/XemTruocTab.jsx
git commit -m "feat(quy-trinh): ban in A3 va xuat PNG/PDF/Word"
```

---

## Task 19: Đo bảo mật — BẮT BUỘC trước khi bàn giao

**Files:** không sửa mã, trừ khi phát hiện lỗ hổng.

- [ ] **Step 1: Gọi skill**

Gọi skill `kiem-tra-bao-mat-du-lieu` và làm đủ phần kiểm chứng trong đó. Đây là yêu cầu bắt buộc trong `CLAUDE.md` của người dùng cho mọi thay đổi chạm Supabase.

- [ ] **Step 2: Đo bằng chính khoá công khai, trên dòng dữ liệu có thật**

Ngưỡng phải đạt — **đo thật, không suy luận**:

| Phép thử với khoá công khai (anon) | Kết quả phải là |
|---|---|
| `select * from quy_trinh` | 0 dòng |
| `select * from quy_trinh_phien_ban` | 0 dòng |
| `insert into quy_trinh (...)` | bị từ chối |
| `update quy_trinh set ten = 'hack'` | bị từ chối |
| `delete from quy_trinh` | bị từ chối |
| gọi `rpc_qt_ban_hanh` | bị từ chối |

- [ ] **Step 3: Đo bằng tài khoản nhân viên thường (KHÔNG phải admin)**

| Phép thử | Kết quả phải là |
|---|---|
| Đọc danh mục quy trình | được |
| Lưu bản nháp (`so_do`, `tai_lieu`) | được |
| `update quy_trinh_phien_ban set trang_thai='published'` gọi thẳng REST | **bị từ chối** (cột đã revoke) |
| Gọi `rpc_qt_ban_hanh` | **bị từ chối** với thông báo *"Chỉ Admin được duyệt và ban hành"* |

Phép thử thứ ba là quan trọng nhất: nó chứng minh khoá nút ở giao diện **không phải** chỗ chặn duy nhất.

- [ ] **Step 4: Rà lại các luồng khác không vỡ**

Mở lần lượt: màn hình **Phân quyền** (phải hiện thêm phân hệ Quy Trình, 8 phân hệ cũ vẫn nguyên), **Kho hàng**, **Công việc**, **Bảo hành**, **CSKH**, **Chất lượng SP** — không màn hình nào lỗi.

Run: `npm test`
Expected: PASS — toàn bộ test cũ và mới đều xanh

- [ ] **Step 5: Báo cáo trung thực**

Nói rõ phần nào đã đo được và phần nào chưa. Không nói "đã chặn" nếu chưa có kết quả thử thật bằng chính khoá công khai.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(quy-trinh): do bao mat RLS va quyen theo cot"
```

---

## Nhắc người dùng sau khi lên bản thật

1. Chạy `sql/quy_trinh.sql` trong Supabase SQL Editor (nếu chưa chạy ở Task 1).
2. Vào màn hình **Phân quyền** cấp quyền tab **Quy Trình** cho từng người — không cấp thì họ không thấy phân hệ ở trang chủ. Giống hệt lúc thêm tab Cải tiến.
3. Chỉ tài khoản **Admin** ban hành được quy trình. Nhân viên soạn xong bấm **Gửi duyệt**.
