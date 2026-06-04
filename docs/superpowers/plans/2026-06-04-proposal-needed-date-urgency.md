# Ngày cần về kho + Mức độ khẩn cấp + Gộp 1 dòng/1 DLK — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trong tab Đề xuất, gộp nhu cầu sản xuất + bán lẻ của mỗi linh kiện thành 1 dòng/1 mã DLK, và hiển thị "Ngày cần về kho" + "Mức độ khẩn cấp" (5 mức màu) tính theo ngày cạn kho gấp nhất lùi 5 ngày.

**Architecture:** Tách `bom_qty` + `retail_qty` trong cùng 1 bản ghi `purchase_proposals` (migration DB). `recomputeProposals` chỉ ghi `bom_qty`, `sendRetailProposals` chỉ ghi `retail_qty` → không kênh nào xoá kênh kia. Helper `computeNeededDates()` tính ngày cạn kho kiểu Tồn HH + nổ BOM ngược, trả về ngày cần về + số ngày còn lại; `OrderProposalTab` hiển thị.

**Tech Stack:** React 19 + Vite, Supabase JS, không có test runner (verify bằng `npm run lint`, `npm run build`, và preview thủ công). Repo KHÔNG phải git → không có bước commit.

**Spec:** `docs/superpowers/specs/2026-06-04-proposal-needed-date-urgency-design.md`

---

## File Structure

- `sql/setup_proposal_split_qty.sql` — **(mới)** migration: thêm cột `bom_qty`/`retail_qty`, backfill, gộp dòng 'Mới' trùng mã.
- `src/lib/dksxEngine.js` — **(sửa)** `recomputeProposals` (upsert theo item_code, chỉ đụng bom_qty), `sendRetailProposals` (chỉ đụng retail_qty), `computeNeededDates` (mới).
- `src/pages/kho/StockSummaryTab.jsx` — **(sửa nhỏ)** `fetchRetailProposed` đọc theo `retail_qty`.
- `src/pages/kho/OrderProposalTab.jsx` — **(sửa)** 2 cột mới + cấu hình 5 mức khẩn cấp.

---

## Task 1: Migration SQL (cột split + gộp dòng trùng)

**Files:**
- Create: `sql/setup_proposal_split_qty.sql`

- [ ] **Step 1: Tạo file migration**

```sql
-- Tách số lượng đề xuất theo 2 kênh trong cùng 1 bản ghi: sản xuất (bom) + bán lẻ (retail).
-- calculated_qty = bom_qty + retail_qty. Mỗi mã linh kiện chỉ còn 1 dòng 'Mới'.

ALTER TABLE public.purchase_proposals
  ADD COLUMN IF NOT EXISTS bom_qty    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retail_qty numeric NOT NULL DEFAULT 0;

-- Backfill: phân bổ calculated_qty cũ về đúng kênh theo source.
UPDATE public.purchase_proposals
  SET bom_qty = COALESCE(calculated_qty, 0)
  WHERE COALESCE(source, 'bom') <> 'retail' AND bom_qty = 0;
UPDATE public.purchase_proposals
  SET retail_qty = COALESCE(calculated_qty, 0)
  WHERE source = 'retail' AND retail_qty = 0;

-- Gộp một lần các dòng trang_thai='Mới' trùng item_code thành 1 dòng (keeper = dlk_code nhỏ nhất).
DO $$
DECLARE
  grp RECORD;
  keeper_id bigint;
  sum_bom numeric;
  sum_retail numeric;
BEGIN
  FOR grp IN
    SELECT item_code
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới'
    GROUP BY item_code
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code
    ORDER BY dlk_code ASC
    LIMIT 1;

    SELECT COALESCE(SUM(bom_qty),0), COALESCE(SUM(retail_qty),0)
      INTO sum_bom, sum_retail
    FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code;

    UPDATE public.purchase_proposals
      SET bom_qty = sum_bom,
          retail_qty = sum_retail,
          calculated_qty = sum_bom + sum_retail,
          actual_qty = sum_bom + sum_retail,
          source = CASE WHEN sum_bom > 0 AND sum_retail > 0 THEN 'both'
                        WHEN sum_retail > 0 THEN 'retail' ELSE 'bom' END
    WHERE id = keeper_id;

    DELETE FROM public.purchase_proposals
    WHERE trang_thai = 'Mới' AND item_code = grp.item_code AND id <> keeper_id;
  END LOOP;
END $$;
```

- [ ] **Step 2: Người dùng chạy migration trên Supabase**

⚠️ Agent KHÔNG tự chạy được. Báo user mở Supabase SQL Editor, dán nội dung `sql/setup_proposal_split_qty.sql`, chạy. Xác nhận không lỗi và `purchase_proposals` đã có cột `bom_qty`, `retail_qty` trước khi sang Task 2+ (code tham chiếu 2 cột này sẽ lỗi nếu chưa chạy).

- [ ] **Step 3: Verify (sau khi user xác nhận đã chạy)**

Preview đang chạy. Chạy nhanh trong preview console:
```js
// preview_eval
(async () => {
  const { data, error } = await window.__sb?.from?.('purchase_proposals').select('id,bom_qty,retail_qty,calculated_qty').limit(1);
  return error ? 'ERR:'+error.message : 'OK cols present';
})()
```
Nếu không có `window.__sb`, bỏ qua — đã xác nhận thủ công ở Step 2.

---

## Task 2: Helper `computeNeededDates()` trong dksxEngine

**Files:**
- Modify: `src/lib/dksxEngine.js` (thêm hằng + hàm mới, cuối file, sau `sendRetailProposals`)

- [ ] **Step 1: Thêm helper**

Thêm vào cuối `src/lib/dksxEngine.js`:

```js
// ── Ngày cần về kho ────────────────────────────────────────────────────────
// needed = ngày cạn kho GẤP NHẤT (giữa bán lẻ của chính mã & thành phẩm có bán
// chứa nó qua nổ BOM ngược) − 5 ngày đệm. Trả { [item_code]: { neededTs, daysLeft } }.
const NEEDED_BUFFER_DAYS = 5;
const DAY_MS = 86400000;

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function computeNeededDates() {
  const [stockMap, bomMap, salesRes] = await Promise.all([
    loadComponentStock(),
    loadBomMap(),
    db.from('sales_90d_summary').select('ma_san_pham, total_sales'),
  ]);

  // TB bán/ngày theo mã (khớp Tồn HH: tổng 90 ngày / 90)
  const avgDaily = {};
  (salesRes.data || []).forEach(r => {
    if (r.ma_san_pham) avgDaily[r.ma_san_pham] = (Number(r.total_sales) || 0) / 90;
  });

  const todayTs = startOfTodayTs();
  const runoutTs = (code) => {
    const v = avgDaily[code];
    if (!v || v <= 0) return null;
    const days = Math.floor((stockMap[code] || 0) / v);
    return todayTs + days * DAY_MS;
  };

  // Kênh sản xuất: mỗi thành phẩm (parent) CÓ bán → nổ BOM → lá; gán min runout(parent) cho lá.
  const prodRunout = {};
  Object.keys(bomMap).forEach(parent => {
    const pr = runoutTs(parent);
    if (pr === null) return;
    const leaves = explodeBom(bomMap, parent, 1);
    Object.keys(leaves).forEach(leaf => {
      if (prodRunout[leaf] === undefined || pr < prodRunout[leaf]) prodRunout[leaf] = pr;
    });
  });

  const codes = new Set([...Object.keys(prodRunout), ...Object.keys(avgDaily)]);
  const result = {};
  codes.forEach(code => {
    const cands = [runoutTs(code), prodRunout[code] ?? null].filter(v => v !== null);
    if (cands.length === 0) return;
    const neededTs = Math.min(...cands) - NEEDED_BUFFER_DAYS * DAY_MS;
    result[code] = { neededTs, daysLeft: Math.round((neededTs - todayTs) / DAY_MS) };
  });
  return result;
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: không thêm lỗi mới ở `dksxEngine.js`.

---

## Task 3: Refactor `recomputeProposals` (upsert theo item_code, chỉ đụng bom_qty)

**Files:**
- Modify: `src/lib/dksxEngine.js:73-134` (toàn bộ thân hàm `recomputeProposals`)

- [ ] **Step 1: Thay toàn bộ hàm `recomputeProposals`**

Thay từ `export async function recomputeProposals() {` đến `}` tương ứng bằng:

```js
export async function recomputeProposals() {
  const [{ data: dksx }, bomMap, stockMap] = await Promise.all([
    db.from('production_demand').select('item_code, qty_demand').gt('qty_demand', 0),
    loadBomMap(),
    loadComponentStock(),
  ]);

  // Gross: nổ BOM tổng nhu cầu sản xuất
  const gross = {};
  (dksx || []).forEach(d => explodeBom(bomMap, d.item_code, Number(d.qty_demand) || 0, gross));

  // Tất cả dòng DLK: committed (đã đặt) để trừ nhu cầu; map dòng 'Mới' theo item_code (≤1/mã sau migration)
  const { data: dlkAll } = await db.from('purchase_proposals')
    .select('id, item_code, actual_qty, bom_qty, retail_qty, trang_thai');
  const committed = {};
  const openByCode = {};
  (dlkAll || []).forEach(r => {
    if (r.trang_thai === 'Mới') openByCode[r.item_code] = r;
    else if (r.trang_thai !== 'Hủy') committed[r.item_code] = (committed[r.item_code] || 0) + (Number(r.actual_qty) || 0);
  });

  // Net bom need / linh kiện lá (bỏ mã còn là thành phẩm có BOM)
  const isParent = (c) => bomMap[c] && bomMap[c].length > 0;
  const bomNeed = {};
  Object.keys(gross).forEach(c => {
    if (isParent(c)) return;
    const need = (gross[c] || 0) - (stockMap[c] || 0) - (committed[c] || 0);
    if (need > 0.0001) bomNeed[c] = Math.round(need * 1000) / 1000;
  });

  const today = todayLocal();
  let { prefix, seq } = await nextDlkSeq();
  const toCreate = [];

  // 1) Linh kiện có bom_need > 0: cập nhật dòng 'Mới' (giữ retail_qty) hoặc tạo mới
  for (const c of Object.keys(bomNeed)) {
    const need = bomNeed[c];
    const ex = openByCode[c];
    if (ex) {
      const retail = Number(ex.retail_qty) || 0;
      const total = Math.round((need + retail) * 1000) / 1000;
      await db.from('purchase_proposals').update({
        bom_qty: need, calculated_qty: total, actual_qty: total,
        source: retail > 0 ? 'both' : 'bom',
      }).eq('id', ex.id);
      delete openByCode[c];
    } else {
      toCreate.push(c);
    }
  }

  // 2) Dòng 'Mới' còn lại (hết bom_need): giữ phần retail, hoặc xoá nếu cũng hết retail
  const toDelete = [];
  for (const c of Object.keys(openByCode)) {
    const ex = openByCode[c];
    const retail = Number(ex.retail_qty) || 0;
    if (retail > 0) {
      await db.from('purchase_proposals').update({
        bom_qty: 0, calculated_qty: retail, actual_qty: retail, source: 'retail',
      }).eq('id', ex.id);
    } else {
      toDelete.push(ex.id);
    }
  }
  if (toDelete.length) await db.from('purchase_proposals').delete().in('id', toDelete);

  // 3) Insert dòng linh kiện mới (lấy tên/đvt)
  if (toCreate.length) {
    const { data: items } = await db.from('inventory_items').select('item_code, item_name, unit').in('item_code', toCreate);
    const dict = {};
    (items || []).forEach(i => { dict[i.item_code] = i; });
    const rows = toCreate.map(c => {
      seq += 1;
      const need = bomNeed[c];
      return {
        dlk_code: `${prefix}${String(seq).padStart(2, '0')}`,
        item_code: c, item_name: dict[c]?.item_name || '', unit: dict[c]?.unit || '',
        bom_qty: need, retail_qty: 0, calculated_qty: need, actual_qty: need,
        ngay_de_xuat: today, tien_do: 'Mới', trang_thai: 'Mới', source: 'bom', note: '',
      };
    });
    await db.from('purchase_proposals').insert(rows);
  }
  return { created: toCreate.length };
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: không lỗi mới.

---

## Task 4: Refactor `sendRetailProposals` (chỉ đụng retail_qty trên cùng dòng item_code)

**Files:**
- Modify: `src/lib/dksxEngine.js` (toàn bộ thân hàm `sendRetailProposals`)

- [ ] **Step 1: Thay toàn bộ hàm `sendRetailProposals`**

```js
export async function sendRetailProposals(items) {
  const valid = (items || []).filter(it => it && it.item_code && Number(it.qty) > 0);
  if (valid.length === 0) return { created: 0, updated: 0, skippedSmaller: 0 };

  const codes = [...new Set(valid.map(it => it.item_code))];
  // Dòng 'Mới' theo item_code (mọi nguồn — giờ ≤1 dòng/mã)
  const { data: openRows } = await db.from('purchase_proposals')
    .select('id, item_code, bom_qty, retail_qty')
    .eq('trang_thai', 'Mới')
    .in('item_code', codes);
  const openMap = {};
  (openRows || []).forEach(r => { openMap[r.item_code] = r; });

  const today = todayLocal();
  let { prefix, seq } = await nextDlkSeq();
  const inserts = [];
  let updated = 0, skippedSmaller = 0;

  for (const it of valid) {
    const qty = Math.round(Number(it.qty) * 1000) / 1000;
    const ex = openMap[it.item_code];
    if (ex) {
      const oldRetail = Number(ex.retail_qty) || 0;
      if (qty > oldRetail) { // MAX trên kênh bán lẻ
        const bom = Number(ex.bom_qty) || 0;
        const total = Math.round((bom + qty) * 1000) / 1000;
        await db.from('purchase_proposals').update({
          retail_qty: qty, calculated_qty: total, actual_qty: total,
          source: bom > 0 ? 'both' : 'retail', ngay_de_xuat: today,
        }).eq('id', ex.id);
        updated++;
      } else {
        skippedSmaller++;
      }
    } else {
      seq += 1;
      inserts.push({
        dlk_code: `${prefix}${String(seq).padStart(2, '0')}`,
        item_code: it.item_code, item_name: it.item_name || '', unit: it.unit || '',
        bom_qty: 0, retail_qty: qty, calculated_qty: qty, actual_qty: qty,
        ngay_de_xuat: today, tien_do: 'Mới', trang_thai: 'Mới', source: 'retail', note: '',
      });
    }
  }
  if (inserts.length) await db.from('purchase_proposals').insert(inserts);
  return { created: inserts.length, updated, skippedSmaller };
}
```

- [ ] **Step 2: Verify lint + build**

Run: `npm run lint` rồi `npm run build`
Expected: build thành công, không lỗi.

---

## Task 5: `StockSummaryTab.fetchRetailProposed` đọc theo `retail_qty`

**Files:**
- Modify: `src/pages/kho/StockSummaryTab.jsx:184-189`

- [ ] **Step 1: Thay thân `fetchRetailProposed`**

Thay:
```js
  const fetchRetailProposed = useCallback(async () => {
    const { data } = await db.from('purchase_proposals').select('item_code, actual_qty').eq('source', 'retail').eq('trang_thai', 'Mới');
    const map = {};
    (data || []).forEach(r => { map[r.item_code] = (map[r.item_code] || 0) + (Number(r.actual_qty) || 0); });
    setRetailProposedMap(map);
  }, []);
```
bằng:
```js
  const fetchRetailProposed = useCallback(async () => {
    const { data } = await db.from('purchase_proposals').select('item_code, retail_qty').gt('retail_qty', 0).eq('trang_thai', 'Mới');
    const map = {};
    (data || []).forEach(r => { map[r.item_code] = (map[r.item_code] || 0) + (Number(r.retail_qty) || 0); });
    setRetailProposedMap(map);
  }, []);
```

- [ ] **Step 2: Verify (preview)**

Mở tab Tồn HH trong preview; badge "🛒 ĐX mua" vẫn hiện đúng cho mã có retail_qty>0. Không lỗi console.

---

## Task 6: OrderProposalTab — 2 cột "Ngày cần về" + "Khẩn cấp"

**Files:**
- Modify: `src/pages/kho/OrderProposalTab.jsx`

- [ ] **Step 1: Import helper**

Sửa dòng import dksx (hiện chỉ import từ supabase). Thêm import:
```js
import { computeNeededDates } from '../../lib/dksxEngine';
```
(đặt ngay dưới `import { todayLocal } from '../../lib/dateUtils';`)

- [ ] **Step 2: Thêm cấu hình 5 mức khẩn cấp**

Thêm sau khối `TIEN_DO_COLORS` (gần đầu file):
```js
// 5 mức khẩn cấp theo số ngày còn lại đến "ngày cần về kho"
const URGENCY_CFG = [
  { max: 7,        label:'🔴 Cực gấp',  bg:'#fef2f2', color:'#dc2626', border:'#fca5a5' },
  { max: 15,       label:'🟠 Gấp',      bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  { max: 30,       label:'🟡 Cảnh báo', bg:'#fefce8', color:'#ca8a04', border:'#fde047' },
  { max: 45,       label:'🔵 Theo dõi', bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  { max: Infinity, label:'🟢 Thư thả',  bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
];
function urgencyOf(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null;
  const cfg = URGENCY_CFG.find(c => daysLeft < c.max) || URGENCY_CFG[URGENCY_CFG.length - 1];
  return daysLeft < 0 ? { ...cfg, label: '🔴 Quá hạn' } : cfg;
}
```

- [ ] **Step 3: Merge ngày cần về vào rows trong `fetchProposals`**

Trong `fetchProposals`, ngay trước `setRows(formatted);`, chèn:
```js
      // Ngày cần về kho + số ngày còn lại (tính realtime)
      const needed = await computeNeededDates();
      formatted = formatted.map(r => {
        const nd = needed[r.item_code];
        return { ...r, needed_ts: nd ? nd.neededTs : null, days_left: nd ? nd.daysLeft : null };
      });
```

- [ ] **Step 4: Thêm 2 `<th>` vào thead**

(a) Thêm cột "Khẩn cấp" ngay sau `<th style={th}>#</th>`:
```jsx
                  <th style={th}>Khẩn cấp</th>
```
(b) Thêm cột "Ngày cần về" ngay sau ô header `<th style={th}>Dự kiến về</th>`:
```jsx
                  <th style={th}>Ngày cần về</th>
```

- [ ] **Step 5: Cập nhật colSpan ô rỗng**

Đổi `colSpan={12}` → `colSpan={14}` trong dòng empty-state.

- [ ] **Step 6: Thêm 2 `<td>` vào mỗi row**

(a) Cột "Khẩn cấp" — thêm ngay sau ô STT `<td style={{...td,color:'#94a3b8'}}>{i+1}</td>`:
```jsx
                      <td style={{...td}}>
                        {(() => {
                          const u = urgencyOf(row.days_left);
                          return u ? (
                            <span style={{display:'inline-block',padding:'0.15rem 0.45rem',borderRadius:5,fontSize:'0.66rem',fontWeight:700,background:u.bg,color:u.color,border:`1px solid ${u.border}`,whiteSpace:'nowrap'}}>
                              {u.label}{row.days_left!==null?` (${row.days_left}d)`:''}
                            </span>
                          ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>;
                        })()}
                      </td>
```
(b) Cột "Ngày cần về" — thêm ngay sau ô "Dự kiến về" (ô có `<input type="date" ... ngay_du_kien ...>` đóng bằng `</td>`):
```jsx
                      <td style={{...td,whiteSpace:'nowrap',fontWeight:600,color: row.days_left!==null&&row.days_left<7?'#dc2626':'#475569'}}>
                        {row.needed_ts ? new Date(row.needed_ts).toLocaleDateString('vi-VN') : '—'}
                      </td>
```

- [ ] **Step 7: Verify lint + build**

Run: `npm run lint` rồi `npm run build`
Expected: build OK, không lỗi/không cảnh báo biến thừa.

---

## Task 7: Verify end-to-end trong preview

**Files:** (không sửa — chỉ kiểm thử)

- [ ] **Step 1: Mở tab Đề xuất, kiểm tra cấu trúc**

Dùng preview_eval đọc header + vài dòng:
```js
(() => {
  const heads=[...document.querySelectorAll('thead th')].map(t=>t.innerText.trim());
  const r0=[...document.querySelectorAll('tbody tr')][0];
  const cells=r0?[...r0.querySelectorAll('td')].map(c=>c.innerText.trim()):[];
  return {heads, hasKhanCap:heads.includes('Khẩn cấp'), hasNgayCanVe:heads.includes('Ngày cần về'), firstRow:cells};
})()
```
Expected: header có "Khẩn cấp" + "Ngày cần về"; dòng có badge mức khẩn cấp + ngày (hoặc "—").

- [ ] **Step 2: Kiểm tra 1 mã có xuất bán (bán lẻ) — ngày = cạn kho − 5**

Chọn 1 `item_code` có trong bảng, đối chiếu với Tồn HH: `ngày cần về` = `Ngày cạn kho` (Tồn HH) − 5 ngày. Khớp.

- [ ] **Step 3: Kiểm tra console không lỗi**

preview_console_logs level=error → không có lỗi.

- [ ] **Step 4: Báo cáo bằng chứng**

Tổng hợp: header mới, ví dụ 1 dòng có ngày + mức khẩn cấp đúng màu, không lỗi console.

---

## Self-Review (đã rà soát khi viết)

- **Spec coverage:** A1→Task1; A2→Task1 Step1 (DO block); A3→Task3; A4→Task4; A5→Task5; B1→Task2; B2→Task6. Đủ.
- **Type consistency:** `bom_qty`/`retail_qty`/`calculated_qty`/`actual_qty`/`source` dùng nhất quán mọi task; `computeNeededDates()` trả `{neededTs, daysLeft}` — Task6 đọc đúng tên.
- **Placeholder:** không có TBD/TODO; mọi step có code/lệnh cụ thể.
- **Lưu ý vận hành:** Task 1 phải chạy migration trên Supabase TRƯỚC khi preview chạy code Task 2+ (nếu không, query cột mới sẽ lỗi).
