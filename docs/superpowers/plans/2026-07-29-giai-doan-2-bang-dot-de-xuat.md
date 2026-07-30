# Giai đoạn 2 — Bảng đợt đề xuất & nối engine vào CSDL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dựng bảng `proposal_batches` với vòng đời NHÁP → ĐÃ GỬI → ĐÓNG, và nối engine `mrp.js` vào cơ sở dữ liệu — chưa làm giao diện.

**Architecture:** Thêm một tệp `src/lib/proposalBatch.js` chứa phần đọc-ghi Supabase, gọi vào `src/lib/mrp.js` (hàm thuần, đã xong ở giai đoạn 1). Phần logic tách được ra hàm thuần thì để trong `proposalBatch.js` và test bằng vitest; phần chạm DB thì kiểm chứng tay trên dữ liệu thật.

**Tech Stack:** JavaScript (ESM), Supabase JS, Vitest, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md`

---

## Ràng buộc tuyệt đối của giai đoạn này

**Người dùng ĐANG dùng app.** Bản đang chạy trên web là `master`, không biết gì về "đợt", và
màn hình Đề xuất (`OrderProposalTab`) đọc `purchase_proposals` bằng `select('*')` — hiện
**mọi dòng**.

Do đó:

1. **Kết thúc giai đoạn 2, `purchase_proposals` phải còn đúng 139 dòng như trước.** Mọi dòng
   nháp tạo ra để kiểm chứng đều phải xoá sạch.
2. **Không deploy.** Không chạm `dist`.
3. **Không sửa tệp nào trong `src/pages/`.** Giao diện là giai đoạn 3.
4. Thêm cột vào `purchase_proposals` thì chỉ được **thêm cột cho phép NULL** — mã đang chạy
   bỏ qua cột lạ, không vỡ.
5. **Chưa thêm khoá ngoại `batch_id`.** 139 dòng hiện có mang `batch_id` ngẫu nhiên
   (`default gen_random_uuid()`) không trỏ tới đâu; thêm khoá ngoại bây giờ sẽ lỗi kiểm tra.
   Để giai đoạn 4, sau khi dọn xong dòng cũ.

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `sql/giai_doan_2_bang_dot_de_xuat.sql` (tạo mới) | DDL: bảng mới, RLS, chỉ mục, cột thêm — kèm phần hoàn tác |
| `src/lib/proposalBatch.js` (tạo mới) | Đọc-ghi Supabase cho đợt đề xuất; gọi `mrp.js` |
| `src/lib/proposalBatch.test.js` (tạo mới) | Test cho phần hàm thuần trong tệp trên |

**Không đụng:** `src/lib/mrp.js`, `src/lib/dksxEngine.js`, `src/lib/proposalQty.js`, `src/pages/`.

Lệnh test: `npx vitest run src/lib/proposalBatch.test.js` · toàn bộ: `npm test`

---

## Task 1: Sinh mã đợt (hàm thuần)

**Files:**
- Create: `src/lib/proposalBatch.js`
- Test: `src/lib/proposalBatch.test.js`

- [ ] **Step 1: Viết test đỏ**

Tạo `src/lib/proposalBatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { nextBatchCode } from './proposalBatch';

describe('nextBatchCode — mã đợt DX-DDMMYY-NN', () => {
  it('chưa có đợt nào trong ngày → bắt đầu từ 01', () => {
    expect(nextBatchCode([], '2026-07-29')).toBe('DX-290726-01');
  });

  it('đã có đợt hôm nay → lấy số kế tiếp', () => {
    expect(nextBatchCode(['DX-290726-01', 'DX-290726-02'], '2026-07-29')).toBe('DX-290726-03');
  });

  it('bỏ qua đợt của ngày khác', () => {
    expect(nextBatchCode(['DX-280726-07', 'DX-300726-09'], '2026-07-29')).toBe('DX-290726-01');
  });

  it('không lấp lỗ hổng — luôn lớn hơn số lớn nhất', () => {
    expect(nextBatchCode(['DX-290726-01', 'DX-290726-05'], '2026-07-29')).toBe('DX-290726-06');
  });

  it('mã hỏng trong danh sách thì bỏ qua, không làm sập', () => {
    expect(nextBatchCode(['DX-290726-XX', null, '', 'rac'], '2026-07-29')).toBe('DX-290726-01');
  });

  it('quá 99 đợt trong ngày vẫn tăng, không cắt còn 2 chữ số', () => {
    expect(nextBatchCode(['DX-290726-99'], '2026-07-29')).toBe('DX-290726-100');
  });
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

`npx vitest run src/lib/proposalBatch.test.js` → FAIL, `nextBatchCode is not a function`.

- [ ] **Step 3: Viết mã tối thiểu**

Tạo `src/lib/proposalBatch.js`:

```js
// Đọc-ghi Supabase cho ĐỢT đề xuất linh kiện. Phần tính toán thuần nằm ở mrp.js.
// Xem spec: docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

// Mã đợt: DX-DDMMYY-NN. Đổi '2026-07-29' → '290726'.
function dateTag(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y.slice(-2)}`;
}

// Số kế tiếp trong ngày. Không lấp lỗ hổng: luôn lớn hơn số lớn nhất đang có,
// để mã đợt không bao giờ bị dùng lại cho đợt khác.
export function nextBatchCode(existingCodes, isoDate) {
  const prefix = `DX-${dateTag(isoDate)}-`;
  const max = (existingCodes || []).reduce((m, c) => {
    if (typeof c !== 'string' || !c.startsWith(prefix)) return m;
    const n = parseInt(c.slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Chạy, xác nhận XANH** — 6 test.

- [ ] **Step 5: Kiểm chứng đột biến**

Đổi `Math.max(m, n)` thành `n`, chạy, xác nhận test "không lấp lỗ hổng" đỏ. Khôi phục.
Đổi `max + 1` thành `max`, xác nhận có test đỏ. Khôi phục.

- [ ] **Step 6: Commit**

```bash
git add src/lib/proposalBatch.js src/lib/proposalBatch.test.js
git commit -m "feat(dot): sinh ma dot de xuat DX-DDMMYY-NN"
```

---

## Task 2: Tệp SQL dựng bảng — CHƯA CHẠY

**Files:**
- Create: `sql/giai_doan_2_bang_dot_de_xuat.sql`

- [ ] **Step 1: Viết tệp**

```sql
-- =====================================================================
-- GIAI ĐOẠN 2 — BẢNG ĐỢT ĐỀ XUẤT — 29/07/2026
-- =====================================================================
-- Chỉ THÊM: bảng mới + cột mới cho phép NULL. Không sửa, không xoá gì.
-- Mã đang chạy trên web bỏ qua cột lạ nên không vỡ.
-- CHƯA thêm khoá ngoại batch_id — để giai đoạn 4, sau khi dọn 139 dòng cũ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PHẦN 1 — BẢNG ĐỢT
-- ---------------------------------------------------------------------
create table if not exists public.proposal_batches (
  id          uuid primary key default gen_random_uuid(),
  ma_dot      text not null unique,
  ngay_chay   date not null,
  trang_thai  text not null default 'NHAP'
              check (trang_thai in ('NHAP', 'DA_GUI', 'DONG')),
  nguoi_tao   text,
  nguoi_gui   text,
  ngay_gui    timestamptz,
  ngay_dong   timestamptz,
  ghi_chu     text,
  created_at  timestamptz not null default now()
);

-- Chỉ được tồn tại MỘT đợt NHÁP tại một thời điểm. Ép ở tầng CSDL, không
-- dựa vào giao diện — hai người bấm Chạy cùng lúc vẫn không tạo được 2 nháp.
create unique index if not exists proposal_batches_one_draft
  on public.proposal_batches (trang_thai) where trang_thai = 'NHAP';

create index if not exists proposal_batches_ngay_chay
  on public.proposal_batches (ngay_chay desc);

-- ---------------------------------------------------------------------
-- PHẦN 2 — BẢO MẬT
-- ---------------------------------------------------------------------
-- Bảng mới ⇒ chỉ người ĐÃ ĐĂNG NHẬP. Tuyệt đối không cấp cho public/anon.
alter table public.proposal_batches enable row level security;

revoke all on public.proposal_batches from anon;

drop policy if exists proposal_batches_authenticated on public.proposal_batches;
create policy proposal_batches_authenticated
  on public.proposal_batches for all to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- PHẦN 3 — CỘT THÊM VÀO purchase_proposals (đều cho phép NULL)
-- ---------------------------------------------------------------------
alter table public.purchase_proposals
  add column if not exists snapshot_gross   numeric,
  add column if not exists snapshot_ton     numeric,
  add column if not exists snapshot_dang_ve numeric;

comment on column public.purchase_proposals.snapshot_gross   is 'Tổng nhu cầu trước khi trừ, tại thời điểm chạy đợt';
comment on column public.purchase_proposals.snapshot_ton     is 'Tồn kho tại thời điểm chạy đợt (đã làm tròn 3 số lẻ)';
comment on column public.purchase_proposals.snapshot_dang_ve is 'Hàng đang về từ đợt trước, tại thời điểm chạy đợt';

-- ---------------------------------------------------------------------
-- PHẦN 4 — KIỂM CHỨNG (chỉ đọc)
-- ---------------------------------------------------------------------
-- 4a. Bảng đã có, RLS bật, đúng 1 policy cho authenticated
select c.relname, c.relrowsecurity as rls_bat,
       (select count(*) from pg_policies p where p.tablename = c.relname) as so_policy
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'proposal_batches';

-- 4b. Ba cột mới đã có
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'purchase_proposals'
  and column_name in ('snapshot_gross', 'snapshot_ton', 'snapshot_dang_ve');

-- 4c. purchase_proposals KHÔNG mất dòng nào — phải vẫn là 139
select count(*) as so_dong_de_xuat from public.purchase_proposals;

-- ---------------------------------------------------------------------
-- PHẦN 5 — HOÀN TÁC (dán chạy được ngay)
-- ---------------------------------------------------------------------
-- drop table if exists public.proposal_batches cascade;
-- alter table public.purchase_proposals
--   drop column if exists snapshot_gross,
--   drop column if exists snapshot_ton,
--   drop column if exists snapshot_dang_ve;
```

- [ ] **Step 2: Commit tệp, CHƯA chạy**

```bash
git add sql/giai_doan_2_bang_dot_de_xuat.sql
git commit -m "sql(dot): tep dung bang proposal_batches va cot snapshot"
```

Việc chạy tệp này và đo bảo mật là Task 3, do người điều phối làm — **không giao cho subagent**.

---

## Task 3: Chạy SQL và đo bảo mật

Người điều phối tự làm. Không giao subagent vì có ghi vào CSDL thật.

- [ ] Chạy Phần 1–3 của tệp SQL
- [ ] Chạy Phần 4, xác nhận: RLS bật, đúng 1 policy, 3 cột mới có, `purchase_proposals` vẫn **139 dòng**
- [ ] Gọi skill `kiem-tra-bao-mat-du-lieu` và đo bằng chính khoá công khai trong `src/lib/supabase.js`:
  - đọc `proposal_batches` → phải 0 dòng
  - thêm dòng vào `proposal_batches` → phải bị từ chối
  - sửa/xoá trên dòng CÓ THẬT (tự tạo 1 dòng bằng quyền quản trị trước) → phải trả `[]`
  - đối chiếu lại trong CSDL: không dòng nào bị đổi
- [ ] Xoá dòng thử nghiệm, xác nhận bảng rỗng

---

## Task 4: Nạp dữ liệu đầu vào cho engine

**Files:**
- Modify: `src/lib/proposalBatch.js`

Đây là phần hiện thực quyết định đã chốt: **gốc là `sales_90d_summary`, không phải bảng tồn kho.**

- [ ] **Step 1: Viết hàm**

Thêm vào `src/lib/proposalBatch.js`:

```js
import { supabase as db } from './supabase';
import { buildProposalLines } from './mrp';
import { todayLocal } from './dateUtils';

// Lấy tất cả dòng, vượt trần 1000 dòng của PostgREST.
async function pagedAll(table, cols) {
  let rows = [], p = 0;
  while (true) {
    const { data, error } = await db.from(table).select(cols).range(p * 1000, (p + 1) * 1000 - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
    p++;
  }
  return rows;
}

// Nạp toàn bộ đầu vào cho engine.
//
// GỐC LÀ sales_90d_summary, KHÔNG phải inventory_stock — vì theo quy trình, mã nào tồn
// về 0 thì bị xoá dòng khỏi tồn sổ sách/vị trí/hàng hoá cho gọn bảng. Đi từ bảng tồn kho
// thì đúng những mã đã bán sạch — thứ cần đặt gấp nhất — lại biến mất khỏi danh sách.
// Đo 29/07/2026: 19 mã có bán 90 ngày không còn dòng tồn nào, nặng nhất FK-RO50 bán
// 165 cái/90 ngày. Xem spec mục 4.1.
export async function loadEngineInputs() {
  const [sales, items, bomRows, stockRows, openRows] = await Promise.all([
    pagedAll('sales_90d_summary', 'ma_san_pham, total_sales'),
    pagedAll('inventory_items', 'item_code, item_name, unit, lead_time_days, backup_stock_days'),
    pagedAll('bom_items', 'product_code, component_code, quantity'),
    pagedAll('inventory_stock', 'item_code, quantity'),
    db.from('purchase_proposals').select('item_code, actual_qty, dlk_code, trang_thai')
      .eq('trang_thai', 'CHO_HANG').then(r => r.data || []),
  ]);

  const dict = {};
  items.forEach((i) => { dict[i.item_code] = i; });

  // Chỉ mã CÓ bán trong 90 ngày mới thành nhu cầu gốc.
  const engineItems = sales
    .filter((s) => Number(s.total_sales) > 0)
    .map((s) => ({
      item_code: s.ma_san_pham,
      item_name: dict[s.ma_san_pham]?.item_name || '',
      unit: dict[s.ma_san_pham]?.unit || '',
      total_sales_90d: Number(s.total_sales) || 0,
      lead_time_days: Number(dict[s.ma_san_pham]?.lead_time_days) || 0,
      backup_stock_days: Number(dict[s.ma_san_pham]?.backup_stock_days) || 0,
    }));

  // Linh kiện chỉ nằm trong BOM, không bán — vẫn cần tên và đơn vị tính khi vào danh sách mua.
  const inItems = new Set(engineItems.map((i) => i.item_code));
  bomRows.forEach((b) => {
    if (inItems.has(b.component_code)) return;
    inItems.add(b.component_code);
    engineItems.push({
      item_code: b.component_code,
      item_name: dict[b.component_code]?.item_name || '',
      unit: dict[b.component_code]?.unit || '',
      total_sales_90d: 0,                       // không bán ⇒ không thành nhu cầu gốc
      lead_time_days: Number(dict[b.component_code]?.lead_time_days) || 0,
      backup_stock_days: Number(dict[b.component_code]?.backup_stock_days) || 0,
    });
  });

  const bomMap = {};
  bomRows.forEach((b) => {
    (bomMap[b.product_code] ||= []).push({
      component: b.component_code, qty: Number(b.quantity) || 1,
    });
  });

  // Tồn kho: mã không có dòng nào ⇒ vắng mặt ⇒ engine hiểu là 0.
  const stockMap = {};
  stockRows.forEach((r) => {
    stockMap[r.item_code] = (stockMap[r.item_code] || 0) + (Number(r.quantity) || 0);
  });

  // Hàng đang về = Σ(SL đặt − đã nhập) của dòng CHO_HANG ở đợt trước.
  const nhap = await pagedAll('du_lieu_nhap', 'dlk_code, so_luong_nhap');
  const daNhap = {};
  nhap.forEach((n) => {
    if (n.dlk_code) daNhap[n.dlk_code] = (daNhap[n.dlk_code] || 0) + (Number(n.so_luong_nhap) || 0);
  });
  const onOrderMap = {};
  openRows.forEach((r) => {
    const conLai = Math.max(0, (Number(r.actual_qty) || 0) - (daNhap[r.dlk_code] || 0));
    if (conLai > 0) onOrderMap[r.item_code] = (onOrderMap[r.item_code] || 0) + conLai;
  });

  return { items: engineItems, bomMap, stockMap, onOrderMap };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/proposalBatch.js
git commit -m "feat(dot): nap dau vao engine tu du lieu ban 90 ngay"
```

---

## Task 5: Vòng đời đợt

**Files:**
- Modify: `src/lib/proposalBatch.js`

- [ ] **Step 1: Viết các hàm**

```js
import { nextBatchCode } from './proposalBatch';   // đã có trong cùng tệp
import { todayLocal } from './dateUtils';

// Đợt NHÁP đang mở (tối đa 1). Trả null nếu không có.
export async function getCurrentDraft() {
  const { data, error } = await db.from('proposal_batches')
    .select('*').eq('trang_thai', 'NHAP').maybeSingle();
  if (error) throw error;
  return data || null;
}

// Chạy đề xuất → tạo (hoặc ghi đè) đợt NHÁP.
// Ghi đè: giữ nguyên id và ma_dot, chỉ thay toàn bộ dòng — không đốt số thứ tự
// mỗi lần thử lại.
export async function runProposalDraft(nguoiTao) {
  const inputs = await loadEngineInputs();
  const { lines, missingParams } = buildProposalLines(inputs);

  let batch = await getCurrentDraft();
  if (batch) {
    await db.from('purchase_proposals').delete().eq('batch_id', batch.id);
  } else {
    const { data: existing } = await db.from('proposal_batches').select('ma_dot');
    const today = todayLocal();
    const ma_dot = nextBatchCode((existing || []).map((r) => r.ma_dot), today);
    const { data, error } = await db.from('proposal_batches')
      .insert({ ma_dot, ngay_chay: today, trang_thai: 'NHAP', nguoi_tao: nguoiTao || '' })
      .select().single();
    if (error) throw error;
    batch = data;
  }

  const today = todayLocal();
  const rows = lines.map((l, i) => ({
    ...l,
    batch_id: batch.id,
    dlk_code: `${batch.ma_dot}-${String(i + 1).padStart(3, '0')}`,
    ngay_de_xuat: today,
    tien_do: 'Mới',
    trang_thai: 'CHO_HANG',
    source: l.bom_qty > 0 && l.retail_qty > 0 ? 'both' : (l.retail_qty > 0 ? 'retail' : 'bom'),
    note: '',
  }));
  if (rows.length) {
    const { error } = await db.from('purchase_proposals').insert(rows);
    if (error) throw error;
  }
  return { batch, soDong: rows.length, missingParams };
}

// Gửi đợt: NHÁP → ĐÃ GỬI. Từ đây calculated_qty khoá, chỉ actual_qty sửa được.
export async function sendBatch(batchId, nguoiGui) {
  const { error } = await db.from('proposal_batches').update({
    trang_thai: 'DA_GUI', nguoi_gui: nguoiGui || '', ngay_gui: new Date().toISOString(),
  }).eq('id', batchId).eq('trang_thai', 'NHAP');
  if (error) throw error;
}

// Huỷ nháp: xoá dòng rồi xoá đợt. Chỉ cho phép khi còn là NHÁP.
export async function discardDraft(batchId) {
  await db.from('purchase_proposals').delete().eq('batch_id', batchId);
  const { error } = await db.from('proposal_batches')
    .delete().eq('id', batchId).eq('trang_thai', 'NHAP');
  if (error) throw error;
}

// Danh sách đợt, mới nhất trước.
export async function listBatches(limit = 50) {
  const { data, error } = await db.from('proposal_batches')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/proposalBatch.js
git commit -m "feat(dot): vong doi dot NHAP - DA_GUI - DONG"
```

---

## Task 6: Kiểm chứng trên dữ liệu thật — rồi DỌN SẠCH

Người điều phối tự làm. Đây là chỗ dễ để lại rác nhất.

- [ ] Ghi lại số dòng `purchase_proposals` trước khi thử (kỳ vọng 139)
- [ ] Tạo một đợt NHÁP bằng SQL mô phỏng đúng logic `runProposalDraft`
- [ ] Đối chiếu: số dòng phải là **112**, tổng SL **31.441**, có `FK-RO50` = 312
- [ ] Kiểm `snapshot_gross − snapshot_ton − snapshot_dang_ve = calculated_qty` sau khi làm tròn
- [ ] Thử tạo đợt NHÁP thứ hai → phải bị chỉ mục duy nhất chặn
- [ ] **Xoá sạch**: xoá dòng theo `batch_id`, xoá đợt
- [ ] Xác nhận `purchase_proposals` trở lại đúng **139 dòng**, `proposal_batches` rỗng

---

## Hết giai đoạn 2

Sau đó `proposal_batches` tồn tại và rỗng, `purchase_proposals` có thêm 3 cột NULL và vẫn
đủ 139 dòng cũ, `src/lib/proposalBatch.js` chạy được nhưng **chưa màn hình nào gọi tới**.
App đang chạy không đổi hành vi nào.

Giai đoạn 3 làm giao diện.
