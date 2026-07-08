# Bắt buộc định mức 100% + Tính lại hiệu suất cũ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Không có định mức thật thì không tạo được Lệnh SX và không nhập được tiến độ (bỏ hẳn fallback 0.05); nạp lại định mức chuẩn rồi tính lại toàn bộ dữ liệu cũ.

**Architecture:** Tách 1 helper thuần `capacityGuard.js` làm nguồn sự thật duy nhất cho quy tắc "định mức hợp lệ" (có dòng + `capacity_per_hour > 0`), dùng chung cho guard tạo Lệnh SX (ProductionOrderTab) và guard nhập tiến độ (WorkerInput). Phần tính lại dữ liệu cũ làm bằng 1 file SQL chạy 1 lần trong Supabase (backup + transaction + gate phủ 100%).

**Tech Stack:** React 19, Vite, Supabase JS, Vitest (test hàm thuần), PostgreSQL (Supabase).

**Spec:** `docs/superpowers/specs/2026-07-08-bat-buoc-dinh-muc-va-tinh-lai-hieu-suat-design.md`

---

## File Structure

- **Create** `src/lib/capacityGuard.js` — helper thuần: `capacityMap(capRows)`, `missingCapacities(codes, capRows)`. Nguồn sự thật duy nhất cho "định mức hợp lệ".
- **Create** `src/lib/capacityGuard.test.js` — vitest cho helper.
- **Modify** `src/pages/kho/ProductionOrderTab.jsx` — guard pre-flight trong `confirmDeductAndCreateOrder` + bỏ fallback 0.05.
- **Modify** `src/pages/WorkerInput.jsx` — chặn nhập tiến độ khi mã thiếu định mức (tra live).
- **Create** `sql/recalc_dinh_muc_hieu_suat.sql` — script tính lại dữ liệu cũ.
- **Modify** `deploy-netlify/` — bundle build lại (bước deploy).

---

## Task 1: Helper thuần `capacityGuard` (TDD)

**Files:**
- Create: `src/lib/capacityGuard.js`
- Test: `src/lib/capacityGuard.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/capacityGuard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { capacityMap, missingCapacities } from './capacityGuard';

describe('capacityMap', () => {
  it('chỉ nhận dòng có capacity_per_hour > 0', () => {
    const m = capacityMap([
      { product_code: 'A', capacity_per_hour: 20 },
      { product_code: 'B', capacity_per_hour: 0 },
      { product_code: 'C', capacity_per_hour: null },
    ]);
    expect(m.get('A')).toBe(20);
    expect(m.has('B')).toBe(false);
    expect(m.has('C')).toBe(false);
  });
  it('trim mã và ép kiểu số', () => {
    const m = capacityMap([{ product_code: ' A ', capacity_per_hour: '10' }]);
    expect(m.get('A')).toBe(10);
  });
  it('đầu vào null/undefined → map rỗng', () => {
    expect(capacityMap(null).size).toBe(0);
    expect(capacityMap(undefined).size).toBe(0);
  });
});

describe('missingCapacities', () => {
  it('trả về mã không có định mức hợp lệ', () => {
    const caps = [{ product_code: 'A', capacity_per_hour: 20 }];
    expect(missingCapacities(['A', 'B'], caps)).toEqual(['B']);
  });
  it('mã có dòng nhưng capacity <= 0 vẫn coi là thiếu', () => {
    const caps = [{ product_code: 'A', capacity_per_hour: 0 }];
    expect(missingCapacities(['A'], caps)).toEqual(['A']);
  });
  it('bảng định mức rỗng → mọi mã đều thiếu', () => {
    expect(missingCapacities(['A', 'B'], [])).toEqual(['A', 'B']);
  });
  it('unique + giữ thứ tự, trim, bỏ rỗng', () => {
    expect(missingCapacities([' A ', 'A', '', 'B'], [])).toEqual(['A', 'B']);
  });
  it('tất cả có định mức → mảng rỗng', () => {
    const caps = [
      { product_code: 'A', capacity_per_hour: 20 },
      { product_code: 'B', capacity_per_hour: 5 },
    ];
    expect(missingCapacities(['A', 'B'], caps)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test -- capacityGuard`
Expected: FAIL — "Failed to resolve import './capacityGuard'".

- [ ] **Step 3: Viết helper tối thiểu**

Tạo `src/lib/capacityGuard.js`:

```js
// Nguồn sự thật DUY NHẤT cho quy tắc "định mức hợp lệ": có dòng product_capacities
// và capacity_per_hour > 0. Dùng chung cho guard tạo Lệnh SX và guard nhập tiến độ.
// KHÔNG có định mức mặc định — thiếu là thiếu.

export function capacityMap(capRows) {
  const m = new Map();
  for (const r of capRows || []) {
    const code = String(r?.product_code || '').trim();
    const cap = parseFloat(r?.capacity_per_hour);
    if (code && cap > 0) m.set(code, cap);
  }
  return m;
}

// Trả về mảng mã (unique, giữ thứ tự, đã trim) KHÔNG có định mức hợp lệ trong capRows.
export function missingCapacities(codes, capRows) {
  const m = capacityMap(capRows);
  const seen = new Set();
  const missing = [];
  for (const raw of codes || []) {
    const code = String(raw || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (!m.has(code)) missing.push(code);
  }
  return missing;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test -- capacityGuard`
Expected: PASS — tất cả test xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/capacityGuard.js src/lib/capacityGuard.test.js
git commit -m "feat(dinh-muc): helper thuan capacityGuard + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Guard A1 — chặn tạo Lệnh SX khi thiếu định mức (bỏ 0.05)

**Files:**
- Modify: `src/pages/kho/ProductionOrderTab.jsx` (import; `confirmDeductAndCreateOrder` dòng ~843-847; vòng tạo lệnh dòng ~1023-1033)

- [ ] **Step 1: Thêm import helper**

Thêm dòng import cùng khối import ở đầu file `src/pages/kho/ProductionOrderTab.jsx`:

```js
import { missingCapacities, capacityMap } from '../../lib/capacityGuard';
```

- [ ] **Step 2: Chèn pre-flight guard trong `confirmDeductAndCreateOrder`**

Tìm khối đầu hàm (dòng ~843-848):

```js
  const confirmDeductAndCreateOrder = async () => {
    if (mode === 'production' && prodFinishedItems.length === 0) {
      alert('Dữ liệu phiếu sản xuất không hợp lệ (thiếu danh sách thành phẩm). Vui lòng bấm "← Quay lại" rồi tính toán lại.');
      return;
    }
    setIsProcessing(true);
```

Thay bằng (chèn guard TRƯỚC `setIsProcessing(true)` — tức trước mọi thao tác ghi kho):

```js
  const confirmDeductAndCreateOrder = async () => {
    if (mode === 'production' && prodFinishedItems.length === 0) {
      alert('Dữ liệu phiếu sản xuất không hợp lệ (thiếu danh sách thành phẩm). Vui lòng bấm "← Quay lại" rồi tính toán lại.');
      return;
    }

    // Guard 100% định mức thật: KHÔNG tạo Lệnh SX cho mã thiếu định mức (không dùng fallback 0.05)
    let prodCapMap = null;
    if (mode === 'production') {
      const codes = [...new Set(prodFinishedItems.map(it => String(it.productCode || '').trim()).filter(Boolean))];
      const { data: capRows, error: capErr } = await db.from('product_capacities')
        .select('product_code, capacity_per_hour').in('product_code', codes);
      if (capErr) { alert('Lỗi kiểm tra định mức: ' + capErr.message); return; }
      const missing = missingCapacities(codes, capRows);
      if (missing.length > 0) {
        alert('Các mã sau CHƯA có định mức năng lực, không thể tạo Lệnh SX:\n- '
          + missing.join('\n- ')
          + '\n\nVui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức trước.');
        return;
      }
      prodCapMap = capacityMap(capRows);
    }

    setIsProcessing(true);
```

- [ ] **Step 3: Bỏ fallback 0.05 trong vòng tạo lệnh**

Tìm khối (dòng ~1023-1033):

```js
        for (const it of prodFinishedItems) {
          const { data: capData } = await db.from('product_capacities')
            .select('capacity_per_hour').eq('product_code', it.productCode).maybeSingle();
          const stdTime = capData?.capacity_per_hour ? (1 / parseFloat(capData.capacity_per_hour)) : 0.05;
          orderUpserts.push({
            order_code: it.orderCode,
            product_code: it.productCode,
            target_quantity: it.qty,
            standard_time_per_unit: stdTime,
            status: 'pending',
          });
```

Thay bằng (dùng `prodCapMap` đã tra ở pre-flight, không query lại, không fallback):

```js
        for (const it of prodFinishedItems) {
          const cap = prodCapMap.get(String(it.productCode).trim());
          if (!cap) throw new Error('Thiếu định mức cho mã ' + it.productCode); // pre-flight đã chặn; phòng thủ
          const stdTime = 1 / cap;
          orderUpserts.push({
            order_code: it.orderCode,
            product_code: it.productCode,
            target_quantity: it.qty,
            standard_time_per_unit: stdTime,
            status: 'pending',
          });
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: không lỗi mới ở `ProductionOrderTab.jsx` (biến `capacityMap`/`missingCapacities` đã dùng; `prodCapMap` đã dùng).

- [ ] **Step 5: Verify bằng preview**

- Chạy dev server (preview_start), đăng nhập theo `qlsx-preview-verification`.
- Vào Kho → tab "Phiếu Lệnh", tạo phiếu sản xuất cho 1 mã CHƯA có trong `product_capacities`.
- Expected: hiện alert liệt kê mã thiếu định mức; **không** phát sinh trừ kho / tạo lệnh (kiểm tra `production_orders` không có dòng mới).

- [ ] **Step 6: Commit**

```bash
git add src/pages/kho/ProductionOrderTab.jsx
git commit -m "feat(dinh-muc): chan tao Lenh SX khi thieu dinh muc, bo fallback 0.05

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Guard A2 — chặn nhập tiến độ khi thiếu định mức

**Files:**
- Modify: `src/pages/WorkerInput.jsx` (import; state; effect; `handleSubmit` dòng ~213-215; banner sau dòng ~404; nút submit dòng ~565-578)

- [ ] **Step 1: Thêm import helper**

Thêm cùng khối import đầu `src/pages/WorkerInput.jsx`:

```js
import { missingCapacities } from '../lib/capacityGuard';
```

- [ ] **Step 2: Thêm state `capacityOk`**

Ngay sau dòng `const [remainingQty, setRemainingQty] = useState(null);` (dòng ~30), thêm:

```js
  const [capacityOk, setCapacityOk] = useState(null); // null=đang tải | true | false
```

- [ ] **Step 3: Thêm effect tra định mức LIVE**

Sau khối `useEffect` lấy `remainingQty` (kết thúc dòng ~49), thêm effect mới:

```js
  // Guard 100% định mức thật: chặn nhập tiến độ nếu mã SP chưa có định mức (tra LIVE product_capacities)
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    (async () => {
      let productCode = order.product_code;
      if (!productCode && order.id) {
        const { data } = await supabase.from('production_orders')
          .select('product_code').eq('id', order.id).maybeSingle();
        productCode = data?.product_code;
      }
      if (!productCode) { if (!cancelled) setCapacityOk(false); return; }
      const { data } = await supabase.from('product_capacities')
        .select('product_code, capacity_per_hour').eq('product_code', productCode).maybeSingle();
      const ok = missingCapacities([productCode], data ? [data] : []).length === 0;
      if (!cancelled) setCapacityOk(ok);
    })();
    return () => { cancelled = true; };
  }, [order]);
```

- [ ] **Step 4: Chặn trong `handleSubmit`**

Tìm (dòng ~213-215):

```js
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!order) return;
```

Thay bằng:

```js
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!order) return;
    if (capacityOk !== true) {
      alert('Sản phẩm này chưa có định mức năng lực — không thể nhập tiến độ.\nVui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức trước.');
      return;
    }
```

- [ ] **Step 5: Thêm banner đỏ**

Tìm khối info banner đóng lại (dòng ~397-404):

```jsx
      <div style={styles.infoBanner}>
        <div style={styles.badge}>
          Mã SP: <strong style={{ color: 'var(--primary-color)', fontSize: '1rem' }}>{order.product_code}</strong>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px'}}>
            Định Mức: <strong>{parseFloat(order.standard_time_per_unit).toFixed(4)} Giờ/1 SP</strong>
          </div>
        </div>
      </div>
```

Chèn banner NGAY SAU khối trên:

```jsx
      <div style={styles.infoBanner}>
        <div style={styles.badge}>
          Mã SP: <strong style={{ color: 'var(--primary-color)', fontSize: '1rem' }}>{order.product_code}</strong>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px'}}>
            Định Mức: <strong>{parseFloat(order.standard_time_per_unit).toFixed(4)} Giờ/1 SP</strong>
          </div>
        </div>
      </div>

      {capacityOk === false && (
        <div style={{ margin: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#991b1b', fontWeight: 600, fontSize: '0.85rem' }}>
          ⛔ Sản phẩm <strong>{order.product_code}</strong> chưa có định mức năng lực — không thể nhập tiến độ. Vui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức.
        </div>
      )}
```

- [ ] **Step 6: Khoá nút submit + đổi nhãn khi thiếu định mức**

Tìm nút submit (dòng ~565-578):

```jsx
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.5rem', background: (!canSubmit || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? '#cbd5e1' : 'var(--accent-gradient)', border: 'none', cursor: (!canSubmit || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? 'not-allowed' : 'pointer' }}
            disabled={!canSubmit || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)}
          >
            {!canSubmit ? 'Bạn không có quyền gửi báo cáo' : (
              submitting ? 'Đang gửi...' : (
                isLoadingData ? 'Đang tải...' : (
                   remainingQty !== null && remainingQty <= 0 ? 'Lệnh hoàn thành' : `Phân Bổ & Gửi`
                )
              )
            )}
          </button>
```

Thay bằng (thêm `|| capacityOk !== true` vào cả style, disabled; thêm nhánh nhãn):

```jsx
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.5rem', background: (!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? '#cbd5e1' : 'var(--accent-gradient)', border: 'none', cursor: (!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? 'not-allowed' : 'pointer' }}
            disabled={!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)}
          >
            {!canSubmit ? 'Bạn không có quyền gửi báo cáo' : (
              capacityOk === false ? 'Chưa có định mức — không thể gửi' : (
              submitting ? 'Đang gửi...' : (
                isLoadingData ? 'Đang tải...' : (
                   remainingQty !== null && remainingQty <= 0 ? 'Lệnh hoàn thành' : `Phân Bổ & Gửi`
                )
              )))
            }
          </button>
```

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: không lỗi mới ở `WorkerInput.jsx`.

- [ ] **Step 8: Verify bằng preview**

- Mở màn nhập tiến độ (`/worker/input/:orderId`) cho 1 lệnh của mã CHƯA có định mức.
- Expected: banner đỏ hiện; nút hiển thị "Chưa có định mức — không thể gửi" và bị khoá.
- Sau khi mã có định mức (Task 5 đã nạp), mở lại: banner mất, nút bật, gửi được.

- [ ] **Step 9: Commit**

```bash
git add src/pages/WorkerInput.jsx
git commit -m "feat(dinh-muc): chan nhap tien do khi ma SP thieu dinh muc (tra live)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Build & deploy bundle guard

**Files:**
- Modify: `deploy-netlify/` (bundle build lại)

> Deploy code guard TRƯỚC. Lưu ý: sau khi deploy mà `product_capacities` còn rỗng thì toàn bộ nhập tiến độ + tạo lệnh SX bị chặn — hãy có sẵn file Excel định mức để nạp ngay (Task 5).

- [ ] **Step 1: Chạy full test**

Run: `npm run test`
Expected: PASS toàn bộ (gồm `capacityGuard`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build thành công, sinh thư mục `dist/`.

- [ ] **Step 3: Copy bundle sang deploy-netlify**

```bash
rm -rf deploy-netlify/assets
cp -r dist/* deploy-netlify/
```
Expected: `deploy-netlify/index.html` + `deploy-netlify/assets/*` là bundle mới. (Đối chiếu cấu trúc với commit deploy trước nếu nghi ngờ.)

- [ ] **Step 4: Commit bundle**

```bash
git add deploy-netlify
git commit -m "chore(deploy): rebuild bundle guard dinh muc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Người dùng deploy**

Người dùng kéo-thả thư mục `deploy-netlify/` lên Netlify (theo quy trình hiện tại). (Push GitHub chỉ để backup, không deploy.)

---

## Task 5: Nạp định mức chuẩn + SQL tính lại dữ liệu cũ

**Files:**
- Create: `sql/recalc_dinh_muc_hieu_suat.sql`

- [ ] **Step 1: Người dùng nạp Excel định mức**

Trên app (đã deploy): Tổng Quan Sản Xuất → tab Định Mức → "Nạp Từ Excel" với file định mức thật (cột `Mã SP`, `Tên SP`, `Thời gian chuẩn (Giờ/SP)`). Xác nhận bảng đã có dữ liệu.

- [ ] **Step 2: Tạo file SQL**

Tạo `sql/recalc_dinh_muc_hieu_suat.sql`:

```sql
-- Tính lại định mức chuẩn cho Lệnh SX cũ + tính lại hiệu suất log cũ.
-- CHẠY SAU KHI đã nạp Excel định mức thật vào product_capacities.
-- Chạy trong Supabase SQL Editor, theo từng bước; KHÔNG chạy cả file một lần.

-- ============================================================
-- BƯỚC 0 (DRY-RUN, chỉ đọc — chưa ghi gì)
-- ============================================================
-- 0a. GATE: mã trong lệnh nhưng CHƯA có định mức thật. PHẢI rỗng mới được chạy tiếp.
SELECT DISTINCT o.product_code
FROM production_orders o
LEFT JOIN product_capacities pc ON pc.product_code = o.product_code
WHERE pc.product_code IS NULL OR pc.capacity_per_hour IS NULL OR pc.capacity_per_hour <= 0
ORDER BY o.product_code;

-- 0b. Xem trước standard_time cũ ↔ mới (lệnh)
SELECT o.order_code, o.product_code,
       o.standard_time_per_unit AS std_cu,
       ROUND((1.0 / pc.capacity_per_hour)::numeric, 6) AS std_moi
FROM production_orders o
JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
ORDER BY o.created_at DESC LIMIT 50;

-- 0c. Xem trước performance_rate cũ ↔ mới (log)
SELECT l.id, o.product_code, l.actual_quantity, l.actual_time_spent,
       l.performance_rate AS perf_cu,
       ROUND((l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100) AS perf_moi
FROM production_logs l
JOIN production_orders o ON o.id = l.order_id
JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
WHERE l.actual_time_spent > 0
ORDER BY l.execution_date DESC LIMIT 50;

-- 0d. Log KHÔNG tính lại được (giờ = 0/null) — rà tay
SELECT l.id, o.product_code, l.actual_quantity, l.actual_time_spent, l.performance_rate
FROM production_logs l
JOIN production_orders o ON o.id = l.order_id
WHERE l.actual_time_spent IS NULL OR l.actual_time_spent <= 0;

-- ============================================================
-- BƯỚC 1: BACKUP (chạy 1 lần; đổi hậu tố ngày nếu cần)
-- ============================================================
CREATE TABLE bak_production_orders_20260708 AS SELECT * FROM production_orders;
CREATE TABLE bak_production_logs_20260708   AS SELECT * FROM production_logs;

-- ============================================================
-- BƯỚC 2: CẬP NHẬT (bọc transaction — chỉ COMMIT khi GATE 0a rỗng)
-- ============================================================
BEGIN;

-- 2a. Cập nhật định mức trên lệnh
UPDATE production_orders o
SET standard_time_per_unit = 1.0 / pc.capacity_per_hour
FROM product_capacities pc
WHERE pc.product_code = o.product_code AND pc.capacity_per_hour > 0;

-- 2b. Tính lại hiệu suất log (đúng công thức app: (SL/người ÷ giờ) × giờ_chuẩn × 100)
UPDATE production_logs l
SET performance_rate = ROUND(
      (l.actual_quantity / NULLIF(l.actual_time_spent,0)) * (1.0 / pc.capacity_per_hour) * 100
    )
FROM production_orders o, product_capacities pc
WHERE l.order_id = o.id
  AND o.product_code = pc.product_code
  AND pc.capacity_per_hour > 0
  AND l.actual_time_spent > 0;

-- 2c. Kiểm chứng TRONG transaction trước khi COMMIT
SELECT
  (SELECT count(*) FROM production_orders) AS tong_lenh,
  (SELECT count(*) FROM production_logs)   AS tong_log,
  (SELECT count(*) FROM production_orders o
     LEFT JOIN product_capacities pc ON pc.product_code = o.product_code AND pc.capacity_per_hour > 0
     WHERE pc.product_code IS NULL) AS lenh_chua_co_dinh_muc;  -- kỳ vọng = 0

-- COMMIT;   -- ← bỏ chú thích để LƯU, sau khi xem 2c ổn (lenh_chua_co_dinh_muc = 0)
-- ROLLBACK; -- ← dùng nếu cần HUỶ

-- ============================================================
-- ROLLBACK KHẨN (nếu đã COMMIT nhầm): phục hồi từ backup
-- ============================================================
-- UPDATE production_orders o SET standard_time_per_unit = b.standard_time_per_unit
--   FROM bak_production_orders_20260708 b WHERE b.id = o.id;
-- UPDATE production_logs l SET performance_rate = b.performance_rate
--   FROM bak_production_logs_20260708 b WHERE b.id = l.id;
```

- [ ] **Step 3: Chạy DRY-RUN (Bước 0) trong Supabase SQL Editor**

- Chạy 0a: nếu trả về mã nào → dừng lại, bổ sung mã đó vào Excel định mức, nạp lại (Step 1), chạy lại 0a cho tới khi **rỗng**.
- Chạy 0b/0c: đối chiếu std_moi/perf_moi hợp lý.
- Chạy 0d: ghi nhận log giờ=0/null (sẽ không đổi).

- [ ] **Step 4: Chạy Bước 1 + 2, kiểm chứng, COMMIT**

- Chạy Bước 1 (backup).
- Chạy `BEGIN;` + 2a + 2b + 2c. Xem 2c: `lenh_chua_co_dinh_muc = 0`.
- Nếu ổn → chạy `COMMIT;`. Nếu sai → `ROLLBACK;`.

- [ ] **Step 5: Verify trên app**

- Vào Báo cáo hiệu suất (WorkReport / AdminDashboard): số hiệu suất phản ánh định mức mới (không còn đồng loạt theo 0.05).
- Mở 1 lệnh cũ trong màn nhập tiến độ: "Định Mức" hiển thị đúng giờ/SP thật.

- [ ] **Step 6: Commit file SQL**

```bash
git add sql/recalc_dinh_muc_hieu_suat.sql
git commit -m "feat(dinh-muc): SQL tinh lai standard_time + performance_rate tu dinh muc that

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Ghi chú vận hành
- Thứ tự bắt buộc: Task 1→2→3 (code) → Task 4 (deploy) → Task 5 (nạp Excel + SQL). Nạp Excel càng sớm sau deploy càng tốt để không gián đoạn nhập tiến độ.
- Snapshot vẫn giữ nguyên nguyên tắc: đổi định mức về sau không tự hồi tố; chạy lại `recalc_dinh_muc_hieu_suat.sql` khi cần đồng bộ.
