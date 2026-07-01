# Đề xuất mua: 2 SL + Nhập kho có trần + Xử lý về thiếu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trên module Kho: hiện cả SL đề xuất và SL đặt mua thực tế; giới hạn trần nhập kho = đặt − đã nhận; sau khi nhập thiếu, bật modal cho phép giữ đề xuất (còn lại) hoặc đóng + lưu trữ + tạo đề xuất mới cho phần thiếu.

**Architecture:** Tách logic thuần (tính trần/phần thiếu, phân loại dòng đề xuất, dựng dòng lưu trữ/phần thiếu) ra `src/lib/proposalQty.js` (unit-test bằng vitest). Orchestration DB đóng-đề-xuất đặt trong `src/lib/dksxEngine.js` (cạnh `recomputeProposals`, dùng chung `nextDlkSeq`). UI (Tồn HH badge, ImportStockTab cap + modal, OrderProposalTab cột "Còn lại" + lưu trữ) kiểm chứng bằng preview. Dòng phần thiếu mang `source='shortfall'` được engine coi là committed + không đụng tới (Cách A trong spec).

**Tech Stack:** React 19, Vite, Supabase JS, vitest, lucide-react. Deploy: `npm run build` → copy `dist` → `deploy-netlify/` (kéo-thả).

**Spec:** `docs/superpowers/specs/2026-07-01-de-xuat-nhap-kho-co-tran-va-xu-ly-thieu-design.md`

---

## File Structure

| File | Trạng thái | Trách nhiệm |
|------|-----------|-------------|
| `sql/setup_proposal_shortfall_archive.sql` | **Tạo mới** | Bảng lưu trữ `purchase_proposals_archive` |
| `src/lib/proposalQty.js` | **Tạo mới** | Hàm thuần: `computeCap`, `computeShortfall`, `classifyProposalRows`, `buildShortfallProposalRow`, `buildArchiveRow` |
| `src/lib/proposalQty.test.js` | **Tạo mới** | Unit test cho `proposalQty.js` |
| `src/lib/dksxEngine.js` | Sửa | Dùng `classifyProposalRows` trong `recomputeProposals` (+ select `source`); thêm `closeProposalWithShortfall` |
| `src/pages/kho/ImportStockTab.jsx` | Sửa | Trần nhập (Req 2) + modal xử lý sau nhập (Req 3) |
| `src/pages/kho/StockSummaryTab.jsx` | Sửa | Badge hiện 2 SL + đã nhận/còn (Req 1) |
| `src/pages/kho/OrderProposalTab.jsx` | Sửa | Cột "Còn lại (ĐX)" + nhãn phần thiếu + modal xem lưu trữ (Req 1 + truy xuất) |

---

## Task 1: SQL migration — bảng lưu trữ đề xuất

**Files:**
- Create: `sql/setup_proposal_shortfall_archive.sql`

- [ ] **Step 1: Tạo file migration**

Tạo `sql/setup_proposal_shortfall_archive.sql` với nội dung:

```sql
-- Lưu trữ đề xuất đã đóng (khi về thiếu, chọn "Đóng & tạo mới") — để truy xuất khi cần.
-- Chạy 1 lần trên Supabase SQL editor TRƯỚC khi deploy app.
CREATE TABLE IF NOT EXISTS public.purchase_proposals_archive (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orig_id            UUID,
  item_code          TEXT,
  item_name          TEXT,
  unit               TEXT,
  dlk_code           TEXT,
  calculated_qty     NUMERIC,
  actual_qty         NUMERIC,
  bom_qty            NUMERIC,
  retail_qty         NUMERIC,
  received_snapshot  NUMERIC,
  tien_do            TEXT,
  trang_thai         TEXT,
  source             TEXT,
  note               TEXT,
  ngay_de_xuat       DATE,
  ngay_du_kien       DATE,
  batch_id           UUID,
  created_at         TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  archived_by        TEXT,
  archive_reason     TEXT,
  shortfall_dlk_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_ppa_item_code   ON public.purchase_proposals_archive(item_code);
CREATE INDEX IF NOT EXISTS idx_ppa_dlk_code    ON public.purchase_proposals_archive(dlk_code);
CREATE INDEX IF NOT EXISTS idx_ppa_archived_at ON public.purchase_proposals_archive(archived_at);

ALTER TABLE public.purchase_proposals_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppa_all ON public.purchase_proposals_archive;
CREATE POLICY ppa_all ON public.purchase_proposals_archive FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.purchase_proposals_archive TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add "sql/setup_proposal_shortfall_archive.sql"
git commit -m "feat(sql): bảng lưu trữ purchase_proposals_archive"
```

> ⚠️ File này phải được **chạy thủ công trên Supabase** trước khi luồng LC2 chạy thật (Task 8 nhắc lại). Migration idempotent (IF NOT EXISTS).

---

## Task 2: Hàm thuần `proposalQty.js` + test (TDD)

**Files:**
- Create: `src/lib/proposalQty.js`
- Test: `src/lib/proposalQty.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/proposalQty.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  computeCap, computeShortfall, classifyProposalRows,
  buildShortfallProposalRow, buildArchiveRow,
} from './proposalQty';

describe('computeCap', () => {
  it('trần = đặt − đã nhận, không âm', () => {
    expect(computeCap(1000, 0)).toBe(1000);
    expect(computeCap(1000, 500)).toBe(500);
    expect(computeCap(1000, 1200)).toBe(0);
  });
  it('xử lý giá trị rỗng/không hợp lệ về 0', () => {
    expect(computeCap(null, null)).toBe(0);
    expect(computeCap('800', '300')).toBe(500);
  });
});

describe('computeShortfall', () => {
  it('thiếu = đề xuất − đã nhận, không âm', () => {
    expect(computeShortfall(1000, 500)).toBe(500);
    expect(computeShortfall(1000, 1000)).toBe(0);
    expect(computeShortfall(1000, 1500)).toBe(0);
  });
});

describe('classifyProposalRows', () => {
  it('dòng Mới thường → openByCode, không committed', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'a', item_code: 'X', actual_qty: 100, trang_thai: 'Mới', source: 'bom' },
    ]);
    expect(openByCode['X'].id).toBe('a');
    expect(committed['X']).toBeUndefined();
  });
  it('dòng đã đặt (không Mới, không Hủy) → committed', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'b', item_code: 'X', actual_qty: 100, trang_thai: 'Đã đặt mua', source: 'bom' },
    ]);
    expect(committed['X']).toBe(100);
    expect(openByCode['X']).toBeUndefined();
  });
  it('dòng Hủy → bỏ qua', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'c', item_code: 'X', actual_qty: 100, trang_thai: 'Hủy', source: 'bom' },
    ]);
    expect(committed['X']).toBeUndefined();
    expect(openByCode['X']).toBeUndefined();
  });
  it('dòng shortfall dù Mới → committed VÀ không vào openByCode (được ghim)', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'd', item_code: 'X', actual_qty: 500, trang_thai: 'Mới', source: 'shortfall' },
    ]);
    expect(committed['X']).toBe(500);
    expect(openByCode['X']).toBeUndefined();
  });
  it('cộng dồn committed nhiều dòng cùng mã', () => {
    const { committed } = classifyProposalRows([
      { id: 'e', item_code: 'X', actual_qty: 500, trang_thai: 'Mới', source: 'shortfall' },
      { id: 'f', item_code: 'X', actual_qty: 100, trang_thai: 'Đã đặt mua', source: 'bom' },
    ]);
    expect(committed['X']).toBe(600);
  });
});

describe('buildShortfallProposalRow', () => {
  it('dựng dòng phần thiếu đúng số + nhãn source', () => {
    const orig = { dlk_code: 'DLK-010726-01', item_code: 'X', item_name: 'Cái X', unit: 'Cái', calculated_qty: 1000 };
    const row = buildShortfallProposalRow({ orig, received: 500, dlkCode: 'DLK-010726-09', today: '2026-07-01' });
    expect(row.calculated_qty).toBe(500);
    expect(row.actual_qty).toBe(500);
    expect(row.bom_qty).toBe(500);
    expect(row.retail_qty).toBe(0);
    expect(row.source).toBe('shortfall');
    expect(row.trang_thai).toBe('Mới');
    expect(row.tien_do).toBe('Mới');
    expect(row.dlk_code).toBe('DLK-010726-09');
    expect(row.item_code).toBe('X');
    expect(row.ngay_de_xuat).toBe('2026-07-01');
    expect(row.note).toContain('DLK-010726-01');
  });
});

describe('buildArchiveRow', () => {
  it('sao chép dòng gốc + snapshot đã nhận + metadata lưu trữ', () => {
    const orig = {
      id: 'uuid-1', dlk_code: 'DLK-010726-01', item_code: 'X', item_name: 'Cái X', unit: 'Cái',
      calculated_qty: 1000, actual_qty: 1000, bom_qty: 1000, retail_qty: 0,
      tien_do: 'Đã về kho', trang_thai: 'Đã về kho thiếu', source: 'bom', note: '',
      ngay_de_xuat: '2026-06-20', ngay_du_kien: '2026-06-30', batch_id: null, created_at: '2026-06-20T00:00:00Z',
    };
    const a = buildArchiveRow({ orig, received: 500, archivedBy: 'Nam', shortfallDlkCode: 'DLK-010726-09' });
    expect(a.orig_id).toBe('uuid-1');
    expect(a.received_snapshot).toBe(500);
    expect(a.archived_by).toBe('Nam');
    expect(a.archive_reason).toBe('Đóng do về thiếu');
    expect(a.shortfall_dlk_code).toBe('DLK-010726-09');
    expect(a.calculated_qty).toBe(1000);
    expect(a.dlk_code).toBe('DLK-010726-01');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test -- proposalQty`
Expected: FAIL — `Failed to resolve import "./proposalQty"` (file chưa tồn tại).

- [ ] **Step 3: Viết `proposalQty.js` tối thiểu để pass**

Tạo `src/lib/proposalQty.js`:

```js
// Hàm thuần cho đề xuất mua: trần nhập, phần thiếu, phân loại dòng, dựng dòng lưu trữ/phần thiếu.
// Không import DB — để unit-test dễ. Orchestration DB nằm ở dksxEngine.closeProposalWithShortfall.

const num = (v) => Number(v) || 0;

// Trần nhập kho = SL đặt − đã nhận (không âm).
export function computeCap(actualQty, received) {
  return Math.max(0, num(actualQty) - num(received));
}

// Phần thiếu so với đề xuất = SL đề xuất − đã nhận (không âm).
export function computeShortfall(calculatedQty, received) {
  return Math.max(0, num(calculatedQty) - num(received));
}

// Phân loại dòng purchase_proposals cho recomputeProposals:
//  - Hủy: bỏ qua
//  - source='shortfall': "ghim" — cộng vào committed, KHÔNG vào openByCode (engine không đụng)
//  - 'Mới' thường: openByCode (engine sở hữu, có thể cập nhật/xóa)
//  - còn lại (đã đặt...): committed
export function classifyProposalRows(rows) {
  const committed = {};
  const openByCode = {};
  (rows || []).forEach((r) => {
    if (r.trang_thai === 'Hủy') return;
    if (r.source === 'shortfall') {
      committed[r.item_code] = (committed[r.item_code] || 0) + num(r.actual_qty);
      return;
    }
    if (r.trang_thai === 'Mới') openByCode[r.item_code] = r;
    else committed[r.item_code] = (committed[r.item_code] || 0) + num(r.actual_qty);
  });
  return { committed, openByCode };
}

// Dòng purchase_proposals mới cho phần thiếu (đề xuất mới), nhãn source='shortfall' để engine ghim.
export function buildShortfallProposalRow({ orig, received, dlkCode, today }) {
  const shortfall = computeShortfall(orig.calculated_qty, received);
  return {
    dlk_code: dlkCode,
    item_code: orig.item_code,
    item_name: orig.item_name || '',
    unit: orig.unit || '',
    bom_qty: shortfall,
    retail_qty: 0,
    calculated_qty: shortfall,
    actual_qty: shortfall,
    ngay_de_xuat: today,
    tien_do: 'Mới',
    trang_thai: 'Mới',
    source: 'shortfall',
    note: `Tách từ ${orig.dlk_code} do về thiếu (đã nhận ${num(received)}/${num(orig.calculated_qty)})`,
  };
}

// Dòng bản ghi lưu trữ từ dòng gốc + snapshot đã nhận + metadata.
export function buildArchiveRow({ orig, received, archivedBy, shortfallDlkCode, archiveReason }) {
  return {
    orig_id: orig.id,
    item_code: orig.item_code,
    item_name: orig.item_name || '',
    unit: orig.unit || '',
    dlk_code: orig.dlk_code,
    calculated_qty: orig.calculated_qty,
    actual_qty: orig.actual_qty,
    bom_qty: orig.bom_qty,
    retail_qty: orig.retail_qty,
    received_snapshot: num(received),
    tien_do: orig.tien_do,
    trang_thai: orig.trang_thai,
    source: orig.source,
    note: orig.note,
    ngay_de_xuat: orig.ngay_de_xuat,
    ngay_du_kien: orig.ngay_du_kien,
    batch_id: orig.batch_id,
    created_at: orig.created_at,
    archived_by: archivedBy || '',
    archive_reason: archiveReason || 'Đóng do về thiếu',
    shortfall_dlk_code: shortfallDlkCode || null,
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test -- proposalQty`
Expected: PASS (tất cả describe xanh).

- [ ] **Step 5: Commit**

```bash
git add "src/lib/proposalQty.js" "src/lib/proposalQty.test.js"
git commit -m "feat(lib): hàm thuần proposalQty (trần/phần thiếu/phân loại/lưu trữ) + test"
```

---

## Task 3: `dksxEngine.js` — ghim phần thiếu trong recompute + `closeProposalWithShortfall`

**Files:**
- Modify: `src/lib/dksxEngine.js` (import mới ở đầu file; `recomputeProposals` ~dòng 127–134; thêm hàm mới sau `recomputeProposals`)

- [ ] **Step 1: Thêm import hàm thuần (đầu file, sau dòng `import { todayLocal } ...`)**

Sửa đầu file `src/lib/dksxEngine.js`. Tìm:

```js
import { supabase as db } from './supabase';
import { todayLocal } from './dateUtils';
```

Thay bằng:

```js
import { supabase as db } from './supabase';
import { todayLocal } from './dateUtils';
import { classifyProposalRows, buildShortfallProposalRow, buildArchiveRow, computeShortfall } from './proposalQty';
```

- [ ] **Step 2: Dùng `classifyProposalRows` trong `recomputeProposals` (+ select `source`)**

Trong `recomputeProposals`, tìm khối (hiện ~dòng 127–134):

```js
  const { data: dlkAll } = await db.from('purchase_proposals')
    .select('id, item_code, actual_qty, bom_qty, retail_qty, trang_thai');
  const committed = {};
  const openByCode = {};
  (dlkAll || []).forEach(r => {
    if (r.trang_thai === 'Mới') openByCode[r.item_code] = r;
    else if (r.trang_thai !== 'Hủy') committed[r.item_code] = (committed[r.item_code] || 0) + (Number(r.actual_qty) || 0);
  });
```

Thay bằng:

```js
  const { data: dlkAll } = await db.from('purchase_proposals')
    .select('id, item_code, actual_qty, bom_qty, retail_qty, trang_thai, source');
  // Phân loại: dòng 'shortfall' được ghim (committed, không vào openByCode) → engine không xóa/không tạo trùng.
  const { committed, openByCode } = classifyProposalRows(dlkAll);
```

- [ ] **Step 3: Thêm hàm `closeProposalWithShortfall` (ngay sau `recomputeProposals`, trước `sendRetailProposals`)**

Chèn hàm mới sau dấu `}` kết thúc `recomputeProposals` (hiện ~dòng 198), trước comment `// Đề xuất MUA THẲNG...`:

```js
// Đóng 1 đề xuất khi hàng về thiếu (chọn LC2 ở modal Nhập kho):
//  1) lưu bản ghi vào purchase_proposals_archive (kèm received_snapshot),
//  2) tạo/cộng dồn đề xuất mới cho phần thiếu (source='shortfall', được engine ghim),
//  3) xóa dòng gốc khỏi purchase_proposals.
// `orig` = đối tượng đề xuất gốc (đủ cột), `received` = tổng đã nhận, `archivedBy` = user.
export async function closeProposalWithShortfall({ orig, received, archivedBy }) {
  const shortfall = computeShortfall(orig.calculated_qty, received);
  let shortfallDlkCode = null;

  if (shortfall > 0) {
    // Cộng dồn vào dòng phần thiếu 'Mới' sẵn có cùng mã (nếu có) — tránh tạo nhiều DLK phần thiếu cho 1 mã.
    const { data: existing } = await db.from('purchase_proposals')
      .select('id, dlk_code, calculated_qty')
      .eq('item_code', orig.item_code)
      .eq('source', 'shortfall')
      .eq('trang_thai', 'Mới')
      .neq('id', orig.id)
      .limit(1);
    if (existing && existing.length > 0) {
      const ex = existing[0];
      const newQty = (Number(ex.calculated_qty) || 0) + shortfall;
      await db.from('purchase_proposals').update({
        bom_qty: newQty, calculated_qty: newQty, actual_qty: newQty,
      }).eq('id', ex.id);
      shortfallDlkCode = ex.dlk_code;
    } else {
      const { prefix, seq } = await nextDlkSeq();
      shortfallDlkCode = `${prefix}${String(seq + 1).padStart(2, '0')}`;
      const row = buildShortfallProposalRow({ orig, received, dlkCode: shortfallDlkCode, today: todayLocal() });
      await db.from('purchase_proposals').insert(row);
    }
  }

  const archiveRow = buildArchiveRow({ orig, received, archivedBy, shortfallDlkCode, archiveReason: 'Đóng do về thiếu' });
  await db.from('purchase_proposals_archive').insert(archiveRow);
  await db.from('purchase_proposals').delete().eq('id', orig.id);
  return { shortfallDlkCode, shortfall };
}
```

> `nextDlkSeq` đã là hàm module-scope trong `dksxEngine.js` (dòng ~13) — dùng lại được ngay.

- [ ] **Step 4: Chạy toàn bộ test để đảm bảo không vỡ**

Run: `npm test`
Expected: PASS toàn bộ (proposalQty + các test cũ). `dksxEngine` không có unit test riêng — chỉ cần import phân giải OK (test khác import gián tiếp không lỗi).

- [ ] **Step 5: Kiểm tra build sạch**

Run: `npm run build`
Expected: build thành công, không lỗi import/cú pháp.

- [ ] **Step 6: Commit**

```bash
git add "src/lib/dksxEngine.js"
git commit -m "feat(engine): ghim dòng shortfall trong recompute + closeProposalWithShortfall"
```

---

## Task 4: `ImportStockTab.jsx` — trần nhập kho (Req 2)

**Files:**
- Modify: `src/pages/kho/ImportStockTab.jsx` — `buildDlkItem` (~153–160), prefill useEffect (~167–169), `handleSelectDlk` (~237), validation trong `executeImport` (~398–409)

- [ ] **Step 1: `buildDlkItem` — tính trần & prefill theo trần**

Tìm hàm `buildDlkItem` (hiện ~dòng 153–160):

```js
  // Tạo item từ một DLK đề xuất, điền sẵn SL đề xuất vào vị trí đầu
  const buildDlkItem = async (info) => {
    const qty = Number(info.qty) || 0;
    const { data: stockData } = await db.from('inventory_stock').select('*').eq('item_code', info.item_code);
    let locations = (stockData || []).map(sx => ({ id: sx.id, location: sx.location || 'Kho Chính', current_qty: sx.quantity || 0, import_qty: 0 }));
    if (locations.length > 0) locations[0].import_qty = qty;
    else locations = [{ id: null, location: 'Kho Chính', current_qty: 0, import_qty: qty }];
    return { code: info.item_code, name: info.item_name, unit: info.unit, locations, fromDlk: true };
  };
```

Thay bằng:

```js
  // Tạo item từ một DLK đề xuất. Trần nhập = SL đặt (actual_qty) − đã nhận (theo dlk_code).
  // maxQty dùng chung cơ chế validate + hiển thị "Tối đa" sẵn có; điền sẵn import_qty = trần.
  const buildDlkItem = async (info) => {
    const ordered = Number(info.qty) || 0;
    let received = 0;
    if (info.dlk_code) {
      const { data: nhap } = await db.from('du_lieu_nhap').select('so_luong_nhap').eq('dlk_code', info.dlk_code);
      received = (nhap || []).reduce((sum, r) => sum + (Number(r.so_luong_nhap) || 0), 0);
    }
    const capMax = Math.max(0, ordered - received);
    const { data: stockData } = await db.from('inventory_stock').select('*').eq('item_code', info.item_code);
    let locations = (stockData || []).map(sx => ({ id: sx.id, location: sx.location || 'Kho Chính', current_qty: sx.quantity || 0, import_qty: 0 }));
    if (locations.length > 0) locations[0].import_qty = capMax;
    else locations = [{ id: null, location: 'Kho Chính', current_qty: 0, import_qty: capMax }];
    return { code: info.item_code, name: info.item_name, unit: info.unit, locations, fromDlk: true, maxQty: capMax, dlkOrdered: ordered, dlkReceived: received };
  };
```

- [ ] **Step 2: Prefill useEffect — truyền `dlk_code` vào `buildDlkItem`**

Tìm (hiện ~dòng 167–169):

```js
      const item = await buildDlkItem({
        item_code: dlkPrefill.item_code, item_name: dlkPrefill.item_name, qty: dlkPrefill.qty, unit: dlkPrefill.unit
      });
```

Thay bằng:

```js
      const item = await buildDlkItem({
        item_code: dlkPrefill.item_code, item_name: dlkPrefill.item_name, qty: dlkPrefill.qty, unit: dlkPrefill.unit,
        dlk_code: dlkPrefill.dlk_code || ''
      });
```

- [ ] **Step 3: `handleSelectDlk` — truyền `dlk_code` vào `buildDlkItem`**

Tìm (hiện ~dòng 237):

```js
    const item = await buildDlkItem({ item_code: found.item_code, item_name: found.item_name, qty: found.actual_qty, unit: found.unit });
```

Thay bằng:

```js
    const item = await buildDlkItem({ item_code: found.item_code, item_name: found.item_name, qty: found.actual_qty, unit: found.unit, dlk_code: found.dlk_code });
```

- [ ] **Step 4: Tổng quát hóa validate trần trong `executeImport`**

Tìm khối (hiện ~dòng 398–409):

```js
    // Validate maxQty cho Nhập thành phẩm (theo từng phiếu SX)
    if (reason === 'Nhập thành phẩm') {
      for (const b of blocks) {
        for (const item of b.items) {
          if (item.selected === false) continue;
          const total = item.locations.reduce((sum, loc) => sum + (parseFloat(loc.import_qty) || 0), 0);
          if (item.maxQty !== undefined && total > item.maxQty) {
            return alert(`Lỗi: Hàng hóa ${item.code} (phiếu ${b.sourceValue}) nhập quá số lượng cho phép!\nSố lượng tối đa: ${item.maxQty}\nSố lượng đang nhập: ${total}`);
          }
        }
      }
    }
```

Thay bằng:

```js
    // Validate trần SL cho mọi item có maxQty (Nhập thành phẩm theo phiếu SX; Nhập mua vào theo DLK: đặt − đã nhận)
    for (const b of blocks) {
      for (const item of b.items) {
        if (item.selected === false) continue;
        if (item.maxQty === undefined) continue;
        const total = item.locations.reduce((sum, loc) => sum + (parseFloat(loc.import_qty) || 0), 0);
        if (total > item.maxQty) {
          const ctx = item.fromDlk
            ? `DLK ${b.dlkCode || ''}: chỉ được nhập tối đa ${item.maxQty} (đã đặt ${item.dlkOrdered} − đã nhận ${item.dlkReceived}).`
            : `phiếu ${b.sourceValue}: nhập quá số lượng cho phép! Tối đa ${item.maxQty}, đang nhập ${total}.`;
          return alert(`Hàng hóa ${item.code} — ${ctx}`);
        }
      }
    }
```

- [ ] **Step 5: Kiểm chứng bằng preview**

Đăng nhập & mở Kho theo [[qlsx-preview-verification]]. Vào Tồn HH → mã có "Đã về kho" → bấm **Nhập kho**:
- Modal "Nhập mua vào" mở, item có dòng "Tối đa: {trần}" (đỏ) trong header; ô SL nhập điền sẵn = trần.
- Sửa SL nhập > trần → bấm **LƯU PHIẾU** → hiện alert chặn "chỉ được nhập tối đa ... (đã đặt ... − đã nhận ...)".
- Sửa SL nhập = trần → **LƯU PHIẾU** OK.

Dùng `preview_snapshot`/`preview_console_logs` để xác nhận không lỗi JS.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/kho/ImportStockTab.jsx"
git commit -m "feat(nhap-kho): trần nhập kho = đặt − đã nhận (Req 2)"
```

---

## Task 5: `ImportStockTab.jsx` — modal xử lý sau nhập (Req 3)

**Files:**
- Modify: `src/pages/kho/ImportStockTab.jsx` — import (dòng 1–3), state (~98–107), cuối `executeImport` (~520–524), render sau modal chính (~930)

- [ ] **Step 1: Import hàm engine + icon**

Tìm dòng 2–3:

```js
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Plus, Trash2, Printer, CheckCircle, Package, Check, ShoppingCart, RefreshCw, XCircle, MoreHorizontal, ArrowLeft } from 'lucide-react';
```

Thay bằng:

```js
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Plus, Trash2, Printer, CheckCircle, Package, Check, ShoppingCart, RefreshCw, XCircle, MoreHorizontal, ArrowLeft, Archive } from 'lucide-react';
import { closeProposalWithShortfall } from '../../lib/dksxEngine';
```

- [ ] **Step 2: Thêm state cho modal phần thiếu**

Tìm (hiện ~dòng 106–107):

```js
  const [openDlkList, setOpenDlkList] = useState([]);  // danh sách DLK đang mở để chọn (Nhập mua vào)
  const [allOrders, setAllOrders] = useState([]);
```

Thay bằng:

```js
  const [openDlkList, setOpenDlkList] = useState([]);  // danh sách DLK đang mở để chọn (Nhập mua vào)
  const [allOrders, setAllOrders] = useState([]);
  const [shortfallRows, setShortfallRows] = useState([]);   // các DLK vừa nhập còn thiếu so đề xuất → modal LC1/LC2
  const [shortfallBusy, setShortfallBusy] = useState(false); // đang xử lý LC2
```

- [ ] **Step 3: Cuối `executeImport` — tính danh sách DLK thiếu rồi mở modal**

Tìm (hiện ~dòng 522–524, ngay sau khối insert `du_lieu_nhap` và trước `catch`):

```js
      setBlocks(initBlocksFor(reason));
      setPasteCodes('');
      alert(`Đã hoàn tất lưu chứng từ nhập kho ${orderCode}!\nHệ thống đã lưu trạng thái "Chưa in". Vui lòng xem ở tab Quản Lý Chứng Từ.`);
```

Thay bằng:

```js
      // Xác định các DLK vừa nhập còn thiếu so với SL đề xuất (calculated_qty) → mở modal xử lý
      let shortfall = [];
      if (reason === 'Nhập mua vào') {
        const dlkCodes = [...new Set(blocks.map(b => b.dlkCode).filter(Boolean))];
        if (dlkCodes.length > 0) {
          const { data: props } = await db.from('purchase_proposals')
            .select('id, dlk_code, item_code, item_name, unit, calculated_qty, actual_qty, bom_qty, retail_qty, tien_do, trang_thai, source, note, ngay_de_xuat, ngay_du_kien, batch_id, created_at')
            .in('dlk_code', dlkCodes);
          const { data: nhapRows } = await db.from('du_lieu_nhap').select('dlk_code, so_luong_nhap').in('dlk_code', dlkCodes);
          const recvMap = {};
          (nhapRows || []).forEach(r => { if (r.dlk_code) recvMap[r.dlk_code] = (recvMap[r.dlk_code] || 0) + (Number(r.so_luong_nhap) || 0); });
          shortfall = (props || [])
            .map(p => ({ ...p, received: recvMap[p.dlk_code] || 0 }))
            .filter(p => (p.received) < (Number(p.calculated_qty) || 0));
        }
      }

      setBlocks(initBlocksFor(reason));
      setPasteCodes('');
      alert(`Đã hoàn tất lưu chứng từ nhập kho ${orderCode}!\nHệ thống đã lưu trạng thái "Chưa in". Vui lòng xem ở tab Quản Lý Chứng Từ.`);
      if (shortfall.length > 0) setShortfallRows(shortfall);
```

- [ ] **Step 4: Thêm handler LC1/LC2 (đặt ngay trước `const s = {` ~dòng 533)**

Tìm (hiện ~dòng 531–533):

```js
    setLoading(false);
  };

  const s = {
```

Thay bằng:

```js
    setLoading(false);
  };

  // LC1: giữ đề xuất — chỉ đóng dòng trong modal (không đổi cấu trúc DB).
  const handleKeepProposal = (id) => {
    setShortfallRows(prev => prev.filter(r => r.id !== id));
  };
  // LC2: đóng đề xuất + lưu trữ + tạo/cộng dồn đề xuất mới cho phần thiếu.
  const handleCloseAndReorder = async (row) => {
    setShortfallBusy(true);
    try {
      const user = localStorage.getItem('qlsx_user') || 'Nhân viên';
      const res = await closeProposalWithShortfall({ orig: row, received: row.received, archivedBy: user });
      setShortfallRows(prev => prev.filter(r => r.id !== row.id));
      alert(res.shortfall > 0
        ? `Đã đóng ${row.dlk_code} (lưu trữ). Tạo đề xuất mới cho phần thiếu ${res.shortfall} → ${res.shortfallDlkCode}.`
        : `Đã đóng & lưu trữ ${row.dlk_code}.`);
    } catch (e) {
      console.error(e);
      alert('Lỗi đóng đề xuất: ' + e.message);
    }
    setShortfallBusy(false);
  };

  const s = {
```

- [ ] **Step 5: Render modal phần thiếu (chèn ngay trước `<style>{`...spin...`}</style>` cuối JSX, ~dòng 932)**

Tìm (hiện ~dòng 930–935):

```js
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
```

Thay bằng:

```js
        </div>
      )}

      {/* Modal xử lý đề xuất về thiếu (Req 3) */}
      {shortfallRows.length > 0 && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'1rem'}}>
          <div style={{background:'#fff', borderRadius:'1rem', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)', width:'100%', maxWidth:640, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden'}}>
            <div style={{padding:'1rem 1.5rem', borderBottom:'1px solid #e2e8f0', background:'#fff7ed'}}>
              <h2 style={{margin:0, fontSize:'1rem', fontWeight:700, color:'#c2410c'}}>Đề xuất về thiếu — chọn cách xử lý</h2>
              <p style={{margin:'4px 0 0', fontSize:'0.78rem', color:'#9a3412'}}>Số đã nhận nhỏ hơn SL đề xuất. Chọn cho từng dòng.</p>
            </div>
            <div style={{flex:1, overflow:'auto', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
              {shortfallRows.map(row => {
                const con = Math.max(0, (Number(row.calculated_qty) || 0) - (Number(row.received) || 0));
                const fullyOrdered = (Number(row.received) || 0) >= (Number(row.actual_qty) || 0);
                return (
                  <div key={row.id} style={{border:'1px solid #e2e8f0', borderRadius:10, padding:'0.75rem 0.9rem', background:'#f8fafc'}}>
                    <div style={{fontWeight:700, color:'#0f172a', fontSize:'0.85rem'}}>{row.item_code} — <span style={{fontWeight:500, color:'#64748b'}}>{row.item_name}</span></div>
                    <div style={{fontSize:'0.72rem', color:'#475569', margin:'4px 0 8px', display:'flex', flexWrap:'wrap', gap:'2px 14px'}}>
                      <span>DLK: <b style={{color:'#7c3aed'}}>{row.dlk_code}</b></span>
                      <span>Đề xuất: <b>{Number(row.calculated_qty).toLocaleString('vi-VN')}</b></span>
                      <span>Đặt: <b>{Number(row.actual_qty).toLocaleString('vi-VN')}</b></span>
                      <span>Đã nhận: <b style={{color:'#059669'}}>{Number(row.received).toLocaleString('vi-VN')}</b></span>
                      <span>Còn thiếu (ĐX): <b style={{color:'#dc2626'}}>{con.toLocaleString('vi-VN')}</b></span>
                    </div>
                    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                      <button onClick={()=>handleKeepProposal(row.id)} disabled={shortfallBusy}
                        style={{...s.btn, padding:'7px 12px', fontSize:'0.78rem', background: fullyOrdered ? '#f1f5f9' : '#0ea5e9', color: fullyOrdered ? '#475569' : '#fff', border: fullyOrdered ? '1px solid #cbd5e1' : 'none'}}>
                        Giữ đề xuất (còn {con.toLocaleString('vi-VN')}/{Number(row.calculated_qty).toLocaleString('vi-VN')})
                      </button>
                      <button onClick={()=>handleCloseAndReorder(row)} disabled={shortfallBusy}
                        style={{...s.btn, padding:'7px 12px', fontSize:'0.78rem', background: fullyOrdered ? '#f59e0b' : '#fff7ed', color: fullyOrdered ? '#fff' : '#ea580c', border: fullyOrdered ? 'none' : '1px solid #fdba74'}}>
                        {shortfallBusy ? <Loader2 size={14} className="spin"/> : <Archive size={14}/>} Đóng &amp; tạo ĐX mới cho phần thiếu
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{padding:'0.75rem 1.25rem', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end'}}>
              <button onClick={()=>setShortfallRows([])} disabled={shortfallBusy} style={{...s.btn, background:'#f1f5f9', color:'#64748b', padding:'8px 18px'}}>Để sau (giữ tất cả)</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 6: Build sạch**

Run: `npm run build`
Expected: build thành công (import `closeProposalWithShortfall`, `Archive` phân giải OK).

- [ ] **Step 7: Kiểm chứng bằng preview**

Chuẩn bị 1 DLK có `calculated_qty` (ĐX) > 0, `actual_qty` (đặt) ≥ ĐX, `tien_do='Đã về kho'`. Nhập kho một phần (VD 500/1000):
- Sau **LƯU PHIẾU** → alert nhập kho → **modal "Đề xuất về thiếu"** hiện dòng đúng số (Đề xuất 1000, Đặt 1000, Đã nhận 500, Còn thiếu 500).
- **LC1 "Giữ đề xuất"** → dòng biến khỏi modal; sang tab Đề xuất thấy dòng vẫn mở, "Đã nhập 500".
- Lặp lại kịch bản khác, chọn **LC2 "Đóng & tạo ĐX mới"** → alert báo tạo phần thiếu 500 → DLK mới; sang tab Đề xuất: dòng gốc biến mất, có dòng mới ĐX 500 (source shortfall). Kiểm `preview_console_logs` không lỗi.

- [ ] **Step 8: Commit**

```bash
git add "src/pages/kho/ImportStockTab.jsx"
git commit -m "feat(nhap-kho): modal xử lý đề xuất về thiếu — giữ/đóng+tạo mới (Req 3)"
```

---

## Task 6: `StockSummaryTab.jsx` — badge 2 số lượng (Req 1)

**Files:**
- Modify: `src/pages/kho/StockSummaryTab.jsx` — `fetchPurchaseProposed` (~199–214), badge render (~508–520)

- [ ] **Step 1: `fetchPurchaseProposed` — lấy thêm `calculated_qty` + đã nhận**

Tìm hàm (hiện ~dòng 199–214):

```js
  const fetchPurchaseProposed = useCallback(async () => {
    const { data } = await db.from('purchase_proposals').select('item_code, actual_qty, tien_do, dlk_code, unit').eq('trang_thai', 'Mới').gt('actual_qty', 0);
    const map = {};
    (data || []).forEach(r => {
      const code = r.item_code;
      const td = r.tien_do || 'Mới';
      const rank = TIEN_DO_RANK[td] ?? 0;
      if (!map[code]) map[code] = { qty: 0, tien_do: td, dlk_code: r.dlk_code, unit: r.unit, _maxRank: rank };
      map[code].qty += (Number(r.actual_qty) || 0);
      // Badge: giữ tiến độ "sớm nhất" (ít hoàn tất nhất) cho an toàn
      if (rank < (TIEN_DO_RANK[map[code].tien_do] ?? 99)) map[code].tien_do = td;
      // Nhập kho: nhắm dòng DLK tiến độ "xa nhất" (gần về kho nhất)
      if (rank >= map[code]._maxRank) { map[code]._maxRank = rank; map[code].dlk_code = r.dlk_code; map[code].unit = r.unit; }
    });
    setPurchaseProposedMap(map);
  }, []);
```

Thay bằng:

```js
  const fetchPurchaseProposed = useCallback(async () => {
    const { data } = await db.from('purchase_proposals').select('item_code, actual_qty, calculated_qty, tien_do, dlk_code, unit').eq('trang_thai', 'Mới').gt('actual_qty', 0);
    // Đã nhận theo dlk_code (từ du_lieu_nhap) để hiện "Đã nhận · Còn"
    const dlkCodes = [...new Set((data || []).map(r => r.dlk_code).filter(Boolean))];
    const recvByDlk = {};
    if (dlkCodes.length) {
      const { data: nhap } = await db.from('du_lieu_nhap').select('dlk_code, so_luong_nhap').in('dlk_code', dlkCodes);
      (nhap || []).forEach(r => { if (r.dlk_code) recvByDlk[r.dlk_code] = (recvByDlk[r.dlk_code] || 0) + (Number(r.so_luong_nhap) || 0); });
    }
    const map = {};
    (data || []).forEach(r => {
      const code = r.item_code;
      const td = r.tien_do || 'Mới';
      const rank = TIEN_DO_RANK[td] ?? 0;
      if (!map[code]) map[code] = { qty: 0, calculated: 0, received: 0, tien_do: td, dlk_code: r.dlk_code, unit: r.unit, _maxRank: rank };
      map[code].qty += (Number(r.actual_qty) || 0);
      map[code].calculated += (Number(r.calculated_qty) || 0);
      map[code].received += (recvByDlk[r.dlk_code] || 0);
      // Badge: giữ tiến độ "sớm nhất" (ít hoàn tất nhất) cho an toàn
      if (rank < (TIEN_DO_RANK[map[code].tien_do] ?? 99)) map[code].tien_do = td;
      // Nhập kho: nhắm dòng DLK tiến độ "xa nhất" (gần về kho nhất)
      if (rank >= map[code]._maxRank) { map[code]._maxRank = rank; map[code].dlk_code = r.dlk_code; map[code].unit = r.unit; }
    });
    setPurchaseProposedMap(map);
  }, []);
```

- [ ] **Step 2: Badge — hiện `ĐX · Đặt` + dòng `Đã nhận · Còn`**

Tìm khối badge (hiện ~dòng 508–520):

```js
                        ) : buyInfo && buyInfo.qty > 0 ? (
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
                            <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'0.18rem 0.5rem',borderRadius:6,fontSize:'0.65rem',fontWeight:700,background:'#fff7ed',color:'#ea580c',border:'1px solid #fed7aa',whiteSpace:'nowrap',cursor:'pointer'}}
                              title="Đang có đề xuất đặt mua (DLK) — bấm để mở tab Đề xuất"
                              onClick={() => navigateTo && navigateTo('de-xuat-dat-hang')}>
                              🛒 ĐX mua: {buyInfo.qty.toLocaleString('vi-VN')}
                            </span>
                            <div style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                              <span style={{fontSize:'0.62rem',color:'#94a3b8'}}>Tiến độ</span>
                              <span style={{fontSize:'0.6rem',fontWeight:700,padding:'0.05rem 6px',borderRadius:5,background:tdc.bg,color:tdc.color,border:`1px solid ${tdc.border}`}}>{buyInfo.tien_do || 'Mới'}</span>
                            </div>
                          </div>
                        ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>}
```

Thay bằng:

```js
                        ) : buyInfo && buyInfo.qty > 0 ? (
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
                            <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'0.18rem 0.5rem',borderRadius:6,fontSize:'0.65rem',fontWeight:700,background:'#fff7ed',color:'#ea580c',border:'1px solid #fed7aa',whiteSpace:'nowrap',cursor:'pointer'}}
                              title="Đề xuất đặt mua (DLK): ĐX = SL đề xuất · Đặt = SL đặt thực tế — bấm để mở tab Đề xuất"
                              onClick={() => navigateTo && navigateTo('de-xuat-dat-hang')}>
                              🛒 ĐX: {(buyInfo.calculated || 0).toLocaleString('vi-VN')} · Đặt: {buyInfo.qty.toLocaleString('vi-VN')}
                            </span>
                            {buyInfo.received > 0 && (
                              <span style={{fontSize:'0.6rem',color:'#64748b',whiteSpace:'nowrap'}}>
                                Đã nhận {buyInfo.received.toLocaleString('vi-VN')} · Còn {Math.max(0, (buyInfo.calculated || 0) - buyInfo.received).toLocaleString('vi-VN')}
                              </span>
                            )}
                            <div style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                              <span style={{fontSize:'0.62rem',color:'#94a3b8'}}>Tiến độ</span>
                              <span style={{fontSize:'0.6rem',fontWeight:700,padding:'0.05rem 6px',borderRadius:5,background:tdc.bg,color:tdc.color,border:`1px solid ${tdc.border}`}}>{buyInfo.tien_do || 'Mới'}</span>
                            </div>
                          </div>
                        ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>}
```

- [ ] **Step 3: Build sạch**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 4: Kiểm chứng bằng preview**

Vào Tồn HH: mã có đề xuất mua hiện badge **"🛒 ĐX: N · Đặt: M"**; mã đã nhập một phần hiện thêm dòng **"Đã nhận X · Còn Y"**. Chụp `preview_screenshot` xác nhận trực quan.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/kho/StockSummaryTab.jsx"
git commit -m "feat(ton-hh): badge hiện SL đề xuất + đặt + đã nhận/còn (Req 1)"
```

---

## Task 7: `OrderProposalTab.jsx` — cột "Còn lại (ĐX)" + nhãn phần thiếu + xem lưu trữ

**Files:**
- Modify: `src/pages/kho/OrderProposalTab.jsx` — imports (1–8), `TABLE_COLS`/`COL_LABELS_MAP` (11–12), state (43–52), `sortVal` (223–232), header (312–316), cell san_pham (342–345) & cột mới sau `received` (365), toolbar (289–290), + modal lưu trữ

- [ ] **Step 1: Import icon `Archive`**

Tìm dòng 3:

```js
import { Loader2, RefreshCw, Download, Trash2, XCircle, ShoppingCart } from 'lucide-react';
```

Thay bằng:

```js
import { Loader2, RefreshCw, Download, Trash2, XCircle, ShoppingCart, Archive } from 'lucide-react';
```

- [ ] **Step 2: Thêm cột `con_lai` vào danh mục cột**

Tìm dòng 11–12:

```js
const TABLE_COLS = ['urgency','dlk_code','san_pham','unit','ngay_de_xuat','ngay_du_kien','needed_ts','calculated_qty','actual_qty','received','tien_do','note'];
const COL_LABELS_MAP = { urgency:'Khẩn cấp', dlk_code:'Mã DLK', san_pham:'Sản phẩm', unit:'ĐVT', ngay_de_xuat:'Ngày ĐX', ngay_du_kien:'Dự kiến về', needed_ts:'Ngày cần về', calculated_qty:'SL ĐX', actual_qty:'SL Đặt', received:'Đã nhập', tien_do:'Tiến độ', note:'Ghi chú' };
```

Thay bằng:

```js
const TABLE_COLS = ['urgency','dlk_code','san_pham','unit','ngay_de_xuat','ngay_du_kien','needed_ts','calculated_qty','actual_qty','received','con_lai','tien_do','note'];
const COL_LABELS_MAP = { urgency:'Khẩn cấp', dlk_code:'Mã DLK', san_pham:'Sản phẩm', unit:'ĐVT', ngay_de_xuat:'Ngày ĐX', ngay_du_kien:'Dự kiến về', needed_ts:'Ngày cần về', calculated_qty:'SL ĐX', actual_qty:'SL Đặt', received:'Đã nhập', con_lai:'Còn lại (ĐX)', tien_do:'Tiến độ', note:'Ghi chú' };
```

- [ ] **Step 3: Thêm state modal lưu trữ**

Tìm dòng 44–47:

```js
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'all' | 'done'
```

Thay bằng:

```js
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'all' | 'done'
  const [archiveOpen, setArchiveOpen] = useState(false);   // modal xem lưu trữ
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
```

- [ ] **Step 4: Hàm tải lưu trữ (đặt ngay trước `const handleExport`)**

Tìm dòng 188:

```js
  const handleExport = () => {
```

Chèn TRƯỚC nó:

```js
  const openArchive = async () => {
    setArchiveOpen(true);
    setArchiveLoading(true);
    const { data } = await db.from('purchase_proposals_archive').select('*').order('archived_at', { ascending: false }).limit(500);
    setArchiveRows(data || []);
    setArchiveLoading(false);
  };

```

- [ ] **Step 5: `sortVal` — thêm case `con_lai`**

Tìm dòng 223–232:

```js
  const sortVal = (r, col) => {
    switch (col) {
      case 'urgency': return r.days_left;
      case 'needed_ts': return r.needed_ts;
      case 'calculated_qty': return Number(r.calculated_qty) || 0;
      case 'actual_qty': return Number(r.actual_qty) || 0;
      case 'received': return Number(r.received) || 0;
      default: return r[col];
    }
  };
```

Thay bằng:

```js
  const sortVal = (r, col) => {
    switch (col) {
      case 'urgency': return r.days_left;
      case 'needed_ts': return r.needed_ts;
      case 'calculated_qty': return Number(r.calculated_qty) || 0;
      case 'actual_qty': return Number(r.actual_qty) || 0;
      case 'received': return Number(r.received) || 0;
      case 'con_lai': return Math.max(0, (Number(r.calculated_qty) || 0) - (Number(r.received) || 0));
      default: return r[col];
    }
  };
```

- [ ] **Step 6: Nút "Lưu trữ" trên toolbar**

Tìm dòng 289–290:

```js
        <button onClick={handleExport} disabled={rows.length===0} style={{...s.btn,color:'#059669',flexShrink:0}}><Download size={14}/>Excel</button>
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS_MAP} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
```

Thay bằng:

```js
        <button onClick={handleExport} disabled={rows.length===0} style={{...s.btn,color:'#059669',flexShrink:0}}><Download size={14}/>Excel</button>
        <button onClick={openArchive} style={{...s.btn,color:'#b45309',flexShrink:0}}><Archive size={14}/>Lưu trữ</button>
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS_MAP} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
```

- [ ] **Step 7: Header cột "Còn lại (ĐX)" (sau cột `received`)**

Tìm dòng 314–315:

```js
                  {vis('received') && <th onClick={()=>handleSort('received')} style={{...sortTh(sortCol==='received'),textAlign:'right'}}>Đã nhập{sortInd('received')}</th>}
                  {vis('tien_do') && <th onClick={()=>handleSort('tien_do')} style={sortTh(sortCol==='tien_do')}>Tiến độ{sortInd('tien_do')}</th>}
```

Thay bằng:

```js
                  {vis('received') && <th onClick={()=>handleSort('received')} style={{...sortTh(sortCol==='received'),textAlign:'right'}}>Đã nhập{sortInd('received')}</th>}
                  {vis('con_lai') && <th onClick={()=>handleSort('con_lai')} style={{...sortTh(sortCol==='con_lai'),textAlign:'right'}}>Còn lại (ĐX){sortInd('con_lai')}</th>}
                  {vis('tien_do') && <th onClick={()=>handleSort('tien_do')} style={sortTh(sortCol==='tien_do')}>Tiến độ{sortInd('tien_do')}</th>}
```

- [ ] **Step 8: Nhãn "phần thiếu" ở cột sản phẩm**

Tìm dòng 342–345:

```js
                      {vis('san_pham') && <td style={{...td,textAlign:'left'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</div>
                      </td>}
```

Thay bằng:

```js
                      {vis('san_pham') && <td style={{...td,textAlign:'left'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>
                          {row.item_code}
                          {row.source === 'shortfall' && <span title="Đề xuất tạo cho phần thiếu" style={{marginLeft:6,fontSize:'0.58rem',fontWeight:700,color:'#b45309',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:4,padding:'0 4px'}}>⤷ phần thiếu</span>}
                        </div>
                        <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</div>
                      </td>}
```

- [ ] **Step 9: Ô "Còn lại (ĐX)" (sau ô `received`)**

Tìm dòng 363–365:

```js
                      {vis('received') && <td style={{...td,textAlign:'right',fontWeight:700,color: row.received>0?'#059669':'#94a3b8'}}>
                        {row.received > 0 ? row.received.toLocaleString('vi-VN') : '—'}
                      </td>}
```

Thay bằng:

```js
                      {vis('received') && <td style={{...td,textAlign:'right',fontWeight:700,color: row.received>0?'#059669':'#94a3b8'}}>
                        {row.received > 0 ? row.received.toLocaleString('vi-VN') : '—'}
                      </td>}
                      {vis('con_lai') && (() => { const con = Math.max(0, (Number(row.calculated_qty)||0) - (Number(row.received)||0)); return (
                        <td style={{...td,textAlign:'right',fontWeight:700,color: con>0?'#dc2626':'#94a3b8'}}>
                          {con.toLocaleString('vi-VN')}
                        </td>
                      ); })()}
```

- [ ] **Step 10: Modal xem lưu trữ (chèn trước `</div>` cuối cùng của component, ngay sau thanh trạng thái đáy ~dòng 411)**

Tìm dòng 409–413:

```js
        {saving && <span style={{fontSize:'0.75rem',color:'#7c3aed',display:'flex',alignItems:'center',gap:4}}><Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>Đang lưu...</span>}
      </div>
    </div>
  );
}
```

Thay bằng:

```js
        {saving && <span style={{fontSize:'0.75rem',color:'#7c3aed',display:'flex',alignItems:'center',gap:4}}><Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>Đang lưu...</span>}
      </div>

      {archiveOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'}} onClick={()=>setArchiveOpen(false)}>
          <div style={{background:'#fff', borderRadius:'0.75rem', width:'100%', maxWidth:900, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'0.85rem 1.25rem', borderBottom:'1px solid #e2e8f0', background:'#fffbeb', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{margin:0, fontSize:'0.95rem', fontWeight:700, color:'#b45309'}}>Đề xuất đã lưu trữ (đóng do về thiếu)</h2>
              <button onClick={()=>setArchiveOpen(false)} style={{background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:'1.1rem'}}>✕</button>
            </div>
            <div style={{flex:1, overflow:'auto'}}>
              {archiveLoading ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8'}}><Loader2 size={22} style={{animation:'spin 1s linear infinite'}}/></div>
              ) : archiveRows.length === 0 ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8', fontWeight:600}}>Chưa có đề xuất nào được lưu trữ.</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.72rem'}}>
                  <thead>
                    <tr style={{background:'#fffbeb', position:'sticky', top:0}}>
                      {['DLK gốc','Mã HH','ĐX','Đặt','Đã nhận','Ngày đóng','Người đóng','Lý do','DLK phần thiếu'].map(h=>(
                        <th key={h} style={{padding:'0.4rem 0.5rem', borderBottom:'2px solid #fde68a', color:'#92400e', fontWeight:700, whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {archiveRows.map(a => (
                      <tr key={a.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'0.35rem 0.5rem', fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap'}}>{a.dlk_code}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.item_code}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right'}}>{Number(a.calculated_qty||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right'}}>{Number(a.actual_qty||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right', color:'#059669', fontWeight:700}}>{Number(a.received_snapshot||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', whiteSpace:'nowrap'}}>{a.archived_at ? new Date(a.archived_at).toLocaleString('vi-VN') : '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.archived_by || '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.archive_reason || '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem', fontWeight:700, color:'#b45309', whiteSpace:'nowrap'}}>{a.shortfall_dlk_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Build sạch**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 12: Kiểm chứng bằng preview**

Vào tab **Đề xuất đặt hàng (DLK)**:
- Có cột **"Còn lại (ĐX)"** = SL ĐX − Đã nhập (đỏ khi > 0), bấm tiêu đề sắp xếp được.
- Dòng phần thiếu (tạo từ LC2 ở Task 5) hiện nhãn **"⤷ phần thiếu"**.
- Bấm nút **"Lưu trữ"** trên toolbar → modal hiện bản ghi đã đóng (từ Task 5 LC2): DLK gốc, đã nhận snapshot, người đóng, DLK phần thiếu.

- [ ] **Step 13: Commit**

```bash
git add "src/pages/kho/OrderProposalTab.jsx"
git commit -m "feat(de-xuat): cột Còn lại (ĐX) + nhãn phần thiếu + modal xem lưu trữ"
```

---

## Task 8: Kiểm chứng tổng hợp + build bundle deploy

**Files:**
- Modify: `deploy-netlify/` (copy từ `dist/`)

- [ ] **Step 1: Chạy migration trên Supabase (thủ công — bắt buộc trước khi luồng LC2 chạy thật)**

Mở Supabase SQL editor của project, dán & chạy toàn bộ `sql/setup_proposal_shortfall_archive.sql`. Xác nhận bảng `purchase_proposals_archive` tồn tại.

> Nếu chưa chạy migration, LC1 và Req 1/Req 2 vẫn chạy; chỉ **LC2** (đóng & tạo mới) sẽ lỗi insert archive.

- [ ] **Step 2: Chạy full test suite**

Run: `npm test`
Expected: PASS toàn bộ (gồm `proposalQty.test.js`).

- [ ] **Step 3: Kiểm chứng end-to-end trên preview (theo §6 spec + [[qlsx-preview-verification]])**

Chạy lần lượt (dùng preview_* tools, không nhờ user):
1. Tồn HH: badge "ĐX · Đặt", dòng "Đã nhận · Còn" khi đã nhập một phần.
2. Nhập kho: prefill = trần, nhập vượt trần → chặn; nhập ≤ trần → OK.
3. LC1: sau nhập thiếu → modal → "Giữ" → tab Đề xuất còn dòng, "Đã nhập" tăng, "Còn lại (ĐX)" đúng.
4. LC2: chọn "Đóng & tạo mới" → dòng gốc biến mất, dòng mới ĐX = phần thiếu, nhãn "⤷ phần thiếu"; modal Lưu trữ có bản ghi.
5. Chống trùng engine: gửi 1 đề xuất mới bất kỳ từ Tồn HH (kích hoạt `recomputeProposals`) → mã vừa LC2 **không** sinh thêm dòng phần thiếu thứ 2, dòng "⤷ phần thiếu" **vẫn còn**.
6. Ca biên: DLK có Đặt < ĐX, nhập đủ số Đặt → modal vẫn bật (còn thiếu so ĐX), nút "Đóng & tạo mới" nổi bật.

Kiểm `preview_console_logs` sạch lỗi ở mỗi bước.

- [ ] **Step 4: Build + copy bundle sang `deploy-netlify/`**

Run:

```bash
npm run build
```

Sau đó copy toàn bộ `dist/` đè lên `deploy-netlify/` (PowerShell):

```powershell
Copy-Item -Path "dist/*" -Destination "deploy-netlify/" -Recurse -Force
```

- [ ] **Step 5: Commit bundle**

```bash
git add "deploy-netlify" "dist"
git commit -m "chore(deploy): rebuild bundle cho đề xuất 2 SL + nhập kho có trần + xử lý về thiếu"
```

- [ ] **Step 6: Bàn giao cho user**

Thông báo user: đã chạy migration Supabase chưa (nhắc nếu chưa), và deploy bằng kéo-thả thư mục `deploy-netlify/` theo [[qlsx-netlify-deploy]].

---

## Self-Review (đã rà)

**Spec coverage:**
- Req 1 (2 SL): Task 6 (badge Tồn HH) + Task 7 (cột Còn lại; SL ĐX/Đặt/Đã nhập đã có sẵn). ✓
- Req 2 (trần nhập): Task 4. ✓
- Req 3 (modal LC1/LC2): Task 5; LC2 orchestration Task 3; bảng lưu trữ Task 1; hàm thuần Task 2. ✓
- Cách A (ghim shortfall, chống trùng/không xóa): Task 2 `classifyProposalRows` + Task 3 tích hợp recompute. ✓
- Truy xuất lưu trữ: Task 7 modal "Lưu trữ". ✓
- Ca biên (Đặt<ĐX; cộng dồn phần thiếu cùng mã; chống trùng engine): Task 3 (merge + committed) + Task 8 kiểm chứng #5/#6. ✓
- Deploy (migration trước + build + copy): Task 1/Task 8. ✓

**Placeholder scan:** không có TODO/TBD; mọi step code có mã đầy đủ. ✓

**Type consistency:** `maxQty`/`fromDlk`/`dlkOrdered`/`dlkReceived` đặt ở `buildDlkItem` (Task 4) dùng lại ở validate (Task 4) & modal đọc `received/calculated_qty/actual_qty` (Task 5). `source='shortfall'` nhất quán giữa `buildShortfallProposalRow` (Task 2), `classifyProposalRows` (Task 2/3), nhãn UI (Task 7). `purchaseProposedMap[code].{qty,calculated,received}` đặt ở fetch (Task 6) dùng ở badge (Task 6). ✓
