# Load Tức Thời Phân Hệ Kho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi tab Kho load <1s (tức thời từ cache) bất kể bảng bao nhiêu dòng — client chỉ tải trang/kết quả tổng hợp, DB làm toàn bộ lọc/sắp/tổng hợp.

**Architecture:** Gói SQL `sql/perf_kho_instant.sql` thêm RPC trả json (1 request), cột sinh `location_key` + index. Client refactor theo mẫu tab "Dữ liệu xuất" (đã chuẩn): `.range()` + `.order()` + `count: 'estimated'`; dữ liệu tham chiếu qua cache stale-while-revalidate.

**Tech Stack:** React 18 + Vite, supabase-js (PostgREST), Postgres (Supabase), vitest cho lib thuần.

**Spec:** `docs/superpowers/specs/2026-07-07-kho-instant-load-design.md`

**Lưu ý chung:**
- KHÔNG có test framework cho component JSX (vitest chỉ cho lib thuần) → kiểm chứng tab bằng preview local (đăng nhập theo memory `qlsx-preview-verification`) + đối chiếu số liệu.
- Sau mỗi task chạy `npm test` (vitest lib) + mở preview kiểm tra tab liên quan rồi mới commit.
- Mọi thông báo lỗi RPC thiếu phải gợi ý: *"cần chạy sql/perf_kho_instant.sql trong Supabase SQL Editor"*.

---

### Task 0: Chạy gói SQL (NGƯỜI DÙNG làm — điều kiện tiên quyết)

**Files:** `sql/perf_kho_instant.sql` (đã viết sẵn)

- [ ] **Step 1:** Người dùng mở Supabase Dashboard → SQL Editor → dán toàn bộ nội dung `sql/perf_kho_instant.sql` → Run. (Idempotent, chỉ thêm hàm/cột sinh/index. Lệnh `ALTER TABLE ... ADD COLUMN location_key` sẽ rewrite bảng `inventory_stock` — mất vài giây tới ~1 phút tùy số dòng.)
- [ ] **Step 2:** Chạy 3 câu kiểm tra ở cuối file, kỳ vọng:
  - `location_sort_key('HM5') < location_sort_key('HH3')` (tầng M trước H); `location_sort_key('VP1T4')` bắt đầu bằng `'1'`.
  - `json_array_length(get_stock_summary())` ≈ số mã hàng có tồn.
  - `json_array_length(get_book_inventory_json('1900-01-01','2999-12-31'))` ≈ số mã từng phát sinh.
- [ ] **Step 3:** Báo Claude "đã chạy SQL xong" → bắt đầu Task 1.

---

### Task 1: Hook cache stale-while-revalidate + module catalog dùng chung

**Files:**
- Create: `src/lib/useCachedFetch.js`
- Create: `src/lib/catalogCache.js`

- [ ] **Step 1: Viết `src/lib/useCachedFetch.js`**

```js
import { useEffect, useRef, useState, useCallback } from 'react';
import { dataCache } from './dataCache';

/**
 * Stale-while-revalidate trên dataCache:
 * - Có cache → trả NGAY (render tức thời), đồng thời refetch nền rồi cập nhật.
 * - Chưa có → loading=true cho tới khi fetch xong.
 * fetcher phải ổn định về ngữ nghĩa theo key (key đổi → dữ liệu khác).
 */
export function useCachedFetch(key, fetcher, ttlMs) {
  const [data, setData] = useState(() => dataCache.get(key, ttlMs));
  const [loading, setLoading] = useState(dataCache.get(key, ttlMs) == null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      dataCache.set(key, fresh);
      setData(fresh);
    } catch (e) {
      console.warn('useCachedFetch refresh lỗi:', key, e.message);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const cached = dataCache.get(key, ttlMs);
    if (cached != null) { setData(cached); setLoading(false); }
    else { setData(null); setLoading(true); }
    refresh();
  }, [key, refresh, ttlMs]);

  return { data, loading, refresh };
}
```

- [ ] **Step 2: Viết `src/lib/catalogCache.js`** — nơi DUY NHẤT tải danh mục hàng hóa (bảng `inventory_items`, cỡ nghìn dòng — bounded), cache 10 phút, gộp các lời gọi song song:

```js
import { supabase as db, fetchAllRows } from './supabase';
import { dataCache } from './dataCache';

const KEY = 'catalog:inventory_items';
const TTL = 10 * 60 * 1000;
let inflight = null;

/** Danh mục hàng hóa [{item_code, item_name, unit}] — cache 10', dedup in-flight. */
export async function getCatalogItems() {
  const cached = dataCache.get(KEY, TTL);
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await fetchAllRows(() =>
        db.from('inventory_items').select('item_code, item_name, unit').order('item_code'));
      if (error) throw error;
      dataCache.set(KEY, data || []);
      return data || [];
    } finally { inflight = null; }
  })();
  return inflight;
}

export function invalidateCatalog() { dataCache.invalidate(KEY); }
```

- [ ] **Step 3:** `npm test` → toàn bộ vitest hiện có PASS (không đụng lib cũ).
- [ ] **Step 4: Commit** — `git add src/lib/useCachedFetch.js src/lib/catalogCache.js && git commit -m "feat(kho): hook cache SWR + catalog cache dung chung"`

---

### Task 2: Tồn kho hàng hóa (StockSummaryTab) → 1 call RPC

**Files:**
- Modify: `src/pages/kho/StockSummaryTab.jsx:69-115` (hàm `fetchStockSummary`, phần kéo stock + salesMap + group)

- [ ] **Step 1:** Trong `fetchStockSummary`, XÓA: vòng `while` kéo `inventory_stock` (dòng 72–85), câu fetch `sales_90d_summary` + `salesMap` (87–96), khối group `summaryMap` (98–114). THAY bằng:

```js
      // DB tổng hợp sẵn theo mã hàng (1 request, json) — xem sql/perf_kho_instant.sql
      const { data: summary, error: sumErr } = await db.rpc('get_stock_summary');
      if (sumErr) throw new Error(sumErr.message + ' — nếu báo thiếu function, cần chạy sql/perf_kho_instant.sql trong Supabase SQL Editor');
```

- [ ] **Step 2:** Sửa đoạn `let formatted = Object.values(summaryMap).map(item => {` thành `let formatted = (summary || []).map(raw => {` và mở đầu callback bằng chuẩn hóa kiểu (json trả string/number tùy cột):

```js
        const item = {
          item_code: raw.item_code,
          item_name: raw.item_name || '',
          unit: raw.unit || '',
          lead_time_days: Number(raw.lead_time_days) || 0,
          backup_stock_days: Number(raw.backup_stock_days) || 0,
          min_stock_days: Number(raw.min_stock_days) || 0,
          total_quantity: Number(raw.total_quantity) || 0,
        };
        const totalSales90d = Number(raw.total_sales_90d) || 0;
```

Giữ NGUYÊN toàn bộ công thức phía sau (avgMonthlySales, safe_inventory, replenish_qty, urgency…) — chỉ bỏ dòng cũ `const totalSales90d = salesMap[item.item_code] || 0;` và dòng `item.total_quantity = Math.round(...)` (DB đã round 3).

- [ ] **Step 3:** Preview: mở tab **Tồn HH** — Network chỉ còn ~4 request nhỏ (rpc + production_demand + purchase_proposals + BOM), tải <1s. Đối chiếu 3 mã hàng bất kỳ: cột "Tồn kho" khớp với trước khi sửa (hoặc khớp query tay `SELECT sum(quantity) FROM inventory_stock WHERE item_code='...'`).
- [ ] **Step 4: Commit** — `git commit -am "perf(kho): ton HH dung RPC get_stock_summary — 1 request thay N vong lap"`

---

### Task 3: Sổ sách (BookInventoryTab) → 1 call RPC json

**Files:**
- Modify: `src/pages/kho/BookInventoryTab.jsx:62-71`

- [ ] **Step 1:** Thay vòng lặp `while` gọi `rpc('get_book_inventory').range(...)` bằng:

```js
      // 1 request duy nhất — DB tính 1 lần, trả json (hết cảnh mỗi trang tính lại từ đầu)
      const { data: all, error } = await db.rpc('get_book_inventory_json', { p_start, p_end });
      if (error) throw new Error(error.message + ' — nếu báo thiếu function, cần chạy sql/perf_kho_instant.sql');
```

(giữ nguyên `setAllRows((all || []).map(...))` phía dưới, đổi tên biến cho khớp)

- [ ] **Step 2:** Preview: tab **Sổ sách** — 1 request, so tổng số dòng hiển thị với trước khi sửa (phải bằng nhau).
- [ ] **Step 3: Commit** — `git commit -am "perf(kho): so sach goi get_book_inventory_json 1 lan"`

---

### Task 4: Tồn kho theo vị trí (InventoryTab) → phân trang/sort/filter server-side

**Files:**
- Modify: `src/pages/kho/InventoryTab.jsx` (fetchCat :54-75, fetchLocs :96-110, fetchInventory :112-154, processedData :156-186, print :724)

- [ ] **Step 1: Danh mục autosuggest nhập tay** — thay toàn bộ effect `fetchCat` (:54-75) bằng:

```js
  useEffect(() => {
    getCatalogItems().then(items => {
      const seen = new Set(); const unique = [];
      for (const d of items) if (!seen.has(d.item_code)) { seen.add(d.item_code); unique.push(d); }
      setProductCatalog(unique);
    }).catch(e => console.warn('Không tải được danh mục:', e.message));
  }, []);
```

import: `import { getCatalogItems } from '../../lib/catalogCache';`

- [ ] **Step 2: Dropdown vị trí** — XÓA state `locations` + effect `fetchLocs` (:96-110), thay bằng hook SWR (hiện tức thời từ cache, nền tự làm mới):

```js
  const { data: locationsData } = useCachedFetch('kho:locations', async () => {
    const { data, error } = await db.rpc('get_distinct_locations');
    if (error) throw new Error(error.message + ' — cần chạy sql/perf_kho_instant.sql');
    return data || []; // DB đã sắp theo lộ trình kho
  });
  const locations = locationsData || [];
```

import: `import { useCachedFetch } from '../../lib/useCachedFetch';`. Sau Step 3, kiểm tra và xóa import `compareLocations` nếu không còn nơi nào trong file dùng.

- [ ] **Step 3: fetch trang server-side** — thay `fetchInventory` (:112-154) + memo `processedData`/`totalRows`/`rows` (:156-184) bằng:

```js
  const [totalRows, setTotalRows] = useState(0);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      let q = db.from('inventory_stock').select(
        'id, item_code, item_name, unit, location, import_date, quantity',
        { count: 'estimated' }
      );
      if (searchText.trim()) {
        const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) q = q.in('item_code', terms); // lọc chính xác theo quy ước
      }
      if (filterPrefix.trim()) q = q.ilike('location', `${filterPrefix.trim()}%`);
      if (filterLocation) q = q.eq('location', filterLocation);

      // Sort server-side: 'location' → cột sinh location_key (đúng lộ trình dãy/tầng/ô)
      const orderCol = sortCol === 'location' ? 'location_key' : sortCol;
      if (orderCol) q = q.order(orderCol, { ascending: sortAsc, nullsFirst: false });
      q = q.order('id', { ascending: true }); // tie-break để phân trang ổn định

      q = q.range((page - 1) * pageSize, page * pageSize - 1);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message + (String(error.message).includes('location_key') ? ' — cần chạy sql/perf_kho_instant.sql' : ''));

      setAllData((data || []).map(r => ({ ...r, quantity: Math.round(parseFloat(r.quantity || 0) * 1000) / 1000 })));
      if (count != null) setTotalRows(count);
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      alert('Lỗi tải tồn kho: ' + e.message);
    } finally { setLoading(false); }
  }, [searchText, filterLocation, filterPrefix, sortCol, sortAsc, page, pageSize]);

  const rows = allData; // dữ liệu đã đúng trang từ server
```

XÓA memo `processedData` và dòng `const totalRows = processedData.length; const rows = processedData.slice(...)`. Giữ `useEffect(() => { fetchInventory(); }, [fetchInventory]);` (deps mới đã gồm page/pageSize/sort).

- [ ] **Step 4: Phiếu kiểm kê in** — print-section đang map `processedData` (toàn bộ kết quả lọc). Thêm state `printData` + khi mở modal in thì tải đủ theo cùng bộ lọc:

```js
  const [printData, setPrintData] = useState([]);

  const openPrintModal = async () => {
    setLoading(true);
    try {
      const makeQ = () => {
        let q = db.from('inventory_stock').select('id, item_code, item_name, unit, location, import_date, quantity');
        if (searchText.trim()) {
          const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) q = q.in('item_code', terms);
        }
        if (filterPrefix.trim()) q = q.ilike('location', `${filterPrefix.trim()}%`);
        if (filterLocation) q = q.eq('location', filterLocation);
        return q.order('location_key', { ascending: true });
      };
      const { data, error } = await fetchAllRows(makeQ);
      if (error) throw error;
      setPrintData((data || []).map(r => ({ ...r, quantity: Math.round(parseFloat(r.quantity || 0) * 1000) / 1000 })));
      setShowPrintModal(true);
    } catch (e) { alert('Lỗi chuẩn bị phiếu in: ' + e.message); }
    finally { setLoading(false); }
  };
```

- Import `fetchAllRows` từ `../../lib/supabase`.
- Nút đang `setShowPrintModal(true)` → gọi `openPrintModal()`.
- Trong print-section (:724) đổi `processedData.map` → `printData.map`.

- [ ] **Step 5:** Preview tab **Tồn kho theo vị trí**: (a) load đầu 1–2 request <1s; (b) sort cột Vị trí ra đúng thứ tự dãy→tầng M-H-B-T-N-S→ô, VP/PBH cuối; (c) lọc dãy tiền tố + vị trí + mã hàng hoạt động; (d) chuyển trang giữ đúng thứ tự; (e) phiếu in đủ toàn bộ dòng theo bộ lọc.
- [ ] **Step 6: Commit** — `git commit -am "perf(kho): ton kho vi tri phan trang/sort/loc server-side (location_key)"`

---

### Task 5: Bỏ các vòng lặp tải cả danh mục ở Nhập kho & PSX

**Files:**
- Modify: `src/pages/kho/ImportStockTab.jsx:246-265`
- Modify: `src/pages/kho/ProductionOrderTab.jsx:684-704` và `:323-360`

- [ ] **Step 1: ImportStockTab** — trong effect `loadData` thay vòng `while` (248–264) bằng:

```js
      const allItems = await getCatalogItems().catch(e => { console.error('Error fetching catalog:', e); return []; });
      setCatalog(allItems);
```

import `getCatalogItems` từ `../../lib/catalogCache`.

- [ ] **Step 2: ProductionOrderTab `loadStockItems`** (:684-704) — thay vòng `while` bằng:

```js
  const loadStockItems = async () => {
    const items = await getCatalogItems().catch(() => []);
    const uniqueItemsMap = new Map();
    items.forEach(item => {
      if (!uniqueItemsMap.has(item.item_code)) {
        uniqueItemsMap.set(item.item_code, { code: item.item_code, name: item.item_name });
      }
    });
    setStockItems(Array.from(uniqueItemsMap.values()).sort((a, b) => a.code.localeCompare(b.code)));
  };
```

- [ ] **Step 3: ProductionOrderTab `fetchProducts`** (:323-360, danh sách thành phẩm từ BOM) — giữ nguyên logic nhưng bọc dataCache để chỉ tải 1 lần mỗi 10 phút:

```js
        const KEY = 'catalog:bom_products'; const TTL = 10 * 60 * 1000;
        const cached = dataCache.get(KEY, TTL);
        let allData;
        if (cached) { allData = cached; }
        else {
          allData = [];
          // ... (vòng while hiện có giữ nguyên, đổ vào allData) ...
          dataCache.set(KEY, allData);
        }
```

import `dataCache` từ `../../lib/dataCache`.

- [ ] **Step 4:** Preview: tab **Nhập kho** và **PSX** mở <1s từ lần 2 (cache); autosuggest mã hàng vẫn gợi ý đúng; tạo thử 1 dòng phiếu (không lưu) để chắc suggest hoạt động.
- [ ] **Step 5: Commit** — `git commit -am "perf(kho): nhap kho/PSX dung catalog cache — bo vong lap tai ca danh muc"`

---

### Task 6: Count ước lượng + gợi ý filter gọn trên bảng lớn

**Files:**
- Modify: `src/pages/kho/KhoHangApp.jsx:49,65,602`
- Modify: `src/pages/kho/SaveExportTab.jsx:59`
- Modify: `src/pages/kho/ImportLogsTab.jsx:98`

- [ ] **Step 1:** `KhoHangApp.jsx:602` — `{ count: 'exact', head: true }` → `{ count: 'estimated', head: true }` (PostgREST: chính xác khi kết quả nhỏ, ước lượng planner khi lớn — pager hiển thị ≈ đủ dùng).
- [ ] **Step 2:** `KhoHangApp.jsx:49` — `.limit(500)` → `.limit(50)`; `:65` — `.limit(200)` → `.limit(50)` (đã có index trigram, trả gọn).
- [ ] **Step 3:** `SaveExportTab.jsx:59` và `ImportLogsTab.jsx:98` — `count: 'exact'` → `count: 'estimated'`. (BomTab/CatalogTab giữ `exact` — bảng nhỏ.)
- [ ] **Step 4:** Preview: tab **Dữ liệu xuất** gõ tìm kiếm 1 từ giữa chuỗi (vd "LOC") — kết quả <1s; tổng số trang hiển thị hợp lý; **Lưu xuất**, **DL nhập** phân trang bình thường.
- [ ] **Step 5: Commit** — `git commit -am "perf(kho): count uoc luong + gon goi y filter tren bang lon"`

---

### Task 7: Build, kiểm chứng tổng thể, deploy bundle

**Files:**
- Modify: `deploy-netlify/` (bundle build sẵn — quy ước deploy kéo-thả của user)

- [ ] **Step 1:** `npm test` → PASS; `npm run build` → thành công không warning mới.
- [ ] **Step 2:** Preview production build (hoặc dev): đăng nhập, đi qua đủ các tab Kho: Nhập kho, DL nhập, Lưu xuất, DL xuất, Tồn HH, Sổ sách, Tồn vị trí, Danh mục, NCC, BOM, PSX, LS bốc dỡ, DKSX, Đề xuất, Tồn SX, Chứng từ. Mỗi tab: không lỗi console, không alert lỗi, dữ liệu hiện đúng.
- [ ] **Step 3:** Đo bằng Network: tab Tồn HH / Tồn vị trí / Sổ sách ≤ 4 request, tổng thời gian <1s. Ghi kết quả trước–sau vào commit message.
- [ ] **Step 4:** Copy `dist/*` → `deploy-netlify/` theo quy ước (`npm run build` rồi copy đè).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "chore(deploy): cap nhat bundle (kho load tuc thoi — server-side + cache)"`
- [ ] **Step 6:** Nhắc user: kéo-thả thư mục `deploy-netlify/` lên Netlify. Nhấn mạnh: **phải chạy sql/perf_kho_instant.sql TRƯỚC khi deploy** (Task 0), nếu không tab Tồn HH/Sổ sách/Tồn vị trí sẽ báo lỗi thiếu function/cột.

---

## Ghi chú cho người thực thi

- Quy ước lọc chính xác: mã chọn từ gợi ý → `eq`/`in`, KHÔNG `ilike` (memory `qlsx-exact-filter-convention`).
- Không refactor ngoài phạm vi (dksxEngine, các tab đã phân trang đúng) — phase 2.
- Nếu preview báo `column inventory_stock.location_key does not exist` hoặc `function ... does not exist` → user chưa chạy Task 0; dừng và nhắc chạy SQL.
- Sau khi xong: cập nhật memory `qlsx-tech-debt` (mục unbounded fetches đã xử lý cho Kho) và `qlsx-kho-tab-consistency` nếu liên quan.
