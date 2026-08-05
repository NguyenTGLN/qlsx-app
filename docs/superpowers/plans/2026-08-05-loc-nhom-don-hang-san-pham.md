# Lọc theo nhóm "đơn hàng × sản phẩm" — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tại tab Lưu xuất, tick một mã sản phẩm sau khi tìm theo mã đơn hàng chỉ ra đúng
dòng của đơn đó, và cộng dồn được nhiều đơn.

**Architecture:** Tách toàn bộ logic nhóm lọc + dựng mệnh đề PostgREST ra `src/lib/locNhomLuuXuat.js`
(thuần, test được, không chạm mạng). `SearchAutoSuggest` nhận prop tuỳ chọn `groupByTerm`
(mặc định tắt ⇒ 9 tab khác không đổi). `SaveExportTab` dùng chung một hàm dựng bộ lọc cho
cả bảng lẫn Xuất Excel.

**Tech Stack:** React 18, Supabase JS (PostgREST), Vitest (`environment: node`).

**Spec:** `docs/superpowers/specs/2026-08-05-loc-nhom-don-hang-san-pham-design.md`

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `src/lib/locNhomLuuXuat.js` *(tạo)* | Đọc/ghi danh sách nhóm, bật/tắt tick, dựng mệnh đề `.or()`, nhãn nút |
| `src/lib/locNhomLuuXuat.test.js` *(tạo)* | Test cho toàn bộ hàm trên, gồm khử ký tự đặc biệt |
| `src/components/SearchAutoSuggest.jsx` *(sửa)* | Thêm nhánh `groupByTerm`; nhánh cũ giữ nguyên |
| `src/pages/kho/SaveExportTab.jsx` *(sửa)* | Bật `groupByTerm`, dùng chung hàm dựng bộ lọc |

---

### Task 1: Thư viện logic nhóm lọc

**Files:**
- Create: `src/lib/locNhomLuuXuat.js`
- Test: `src/lib/locNhomLuuXuat.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/locNhomLuuXuat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  docNhom, ghiNhom, daTick, doiTick, chotCaDon, xoaNhom,
  nhanTomTat, menhDeLoc,
} from './locNhomLuuXuat';

describe('docNhom / ghiNhom', () => {
  it('đọc chuỗi rỗng ra mảng rỗng', () => {
    expect(docNhom('')).toEqual([]);
    expect(docNhom(undefined)).toEqual([]);
  });

  it('đi vòng ghi rồi đọc lại thì không đổi', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }];
    expect(docNhom(ghiNhom(n))).toEqual(n);
  });

  it('chuỗi hỏng không làm sập app, trả mảng rỗng', () => {
    expect(docNhom('{không phải json')).toEqual([]);
    expect(docNhom('{"a":1}')).toEqual([]);
  });

  it('bỏ qua phần tử sai hình dạng', () => {
    expect(docNhom('[{"tu":"A","ma":["X"]},null,{"ma":["Y"]},"rác"]'))
      .toEqual([{ tu: 'A', ma: ['X'] }, { tu: '', ma: ['Y'] }]);
  });
});

describe('doiTick', () => {
  it('tick lần đầu tạo nhóm mới cho từ khoá đang gõ', () => {
    expect(doiTick([], 'VNA0240', 'F-PP10'))
      .toEqual([{ tu: 'VNA0240', ma: ['F-PP10'] }]);
  });

  it('tick thêm mã thứ hai gộp vào ĐÚNG nhóm đó, không tạo nhóm trùng', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'VNA0240', 'D-TDS');
    expect(n).toEqual([{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }]);
  });

  it('tick trong từ khoá khác thì sinh nhóm thứ hai, nhóm cũ còn nguyên', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'DLY0508', 'S-C2L6');
    expect(n).toEqual([
      { tu: 'VNA0240', ma: ['F-PP10'] },
      { tu: 'DLY0508', ma: ['S-C2L6'] },
    ]);
  });

  it('bỏ tick thì mã biến mất, nhóm còn lại thành "cả đơn"', () => {
    const n = doiTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'VNA0240', 'F-PP10');
    expect(n).toEqual([{ tu: 'VNA0240', ma: [] }]);
  });

  it('bỏ tick khi từ khoá rỗng thì xoá hẳn nhóm, không để lại nhóm rỗng vô nghĩa', () => {
    expect(doiTick([{ tu: '', ma: ['F-PP10'] }], '', 'F-PP10')).toEqual([]);
  });
});

describe('daTick', () => {
  it('trả đúng tập mã của nhóm khớp từ khoá đang gõ', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10'] }, { tu: 'DLY0508', ma: ['S-C2L6'] }];
    expect([...daTick(n, 'DLY0508')]).toEqual(['S-C2L6']);
  });

  it('từ khoá chưa có nhóm thì không ô nào được tick sẵn', () => {
    expect(daTick([{ tu: 'VNA0240', ma: ['F-PP10'] }], 'XYZ').size).toBe(0);
  });
});

describe('chotCaDon', () => {
  it('bấm Xong khi từ khoá chưa có nhóm thì chốt thành nhóm cả đơn', () => {
    expect(chotCaDon([], 'VNA0240')).toEqual([{ tu: 'VNA0240', ma: [] }]);
  });

  it('từ khoá đã có nhóm thì giữ nguyên, không nhân đôi', () => {
    const n = [{ tu: 'VNA0240', ma: ['F-PP10'] }];
    expect(chotCaDon(n, 'VNA0240')).toEqual(n);
  });

  it('từ khoá rỗng hoặc chỉ khoảng trắng thì không chốt gì', () => {
    expect(chotCaDon([], '')).toEqual([]);
    expect(chotCaDon([], '   ')).toEqual([]);
  });
});

describe('xoaNhom', () => {
  it('xoá đúng nhóm theo từ khoá', () => {
    const n = [{ tu: 'A', ma: ['X'] }, { tu: 'B', ma: ['Y'] }];
    expect(xoaNhom(n, 'A')).toEqual([{ tu: 'B', ma: ['Y'] }]);
  });
});

describe('menhDeLoc', () => {
  it('không có nhóm nào thì không lọc', () => {
    expect(menhDeLoc([])).toBe('');
  });

  it('nhóm có từ khoá + mã ⇒ and(or 3 cột, in mã)', () => {
    expect(menhDeLoc([{ tu: 'VNA0240', ma: ['F-PP10', 'D-TDS'] }])).toBe(
      'and(or(ma_san_pham.ilike.%VNA0240%,ten_san_pham.ilike.%VNA0240%,ma_don_hang.ilike.%VNA0240%),ma_san_pham.in.("F-PP10","D-TDS"))'
    );
  });

  it('nhóm chỉ có từ khoá ⇒ or 3 cột, nghĩa là cả đơn', () => {
    expect(menhDeLoc([{ tu: 'DLY0508', ma: [] }])).toBe(
      'or(ma_san_pham.ilike.%DLY0508%,ten_san_pham.ilike.%DLY0508%,ma_don_hang.ilike.%DLY0508%)'
    );
  });

  it('nhóm không có từ khoá, chỉ có mã ⇒ lọc phẳng như hành vi CŨ', () => {
    expect(menhDeLoc([{ tu: '', ma: ['F-PP10'] }])).toBe('ma_san_pham.in.("F-PP10")');
  });

  it('nhiều nhóm thì nối bằng dấu phẩy để .or() hợp lại', () => {
    const s = menhDeLoc([
      { tu: 'VNA0240', ma: ['F-PP10'] },
      { tu: 'DLY0508', ma: [] },
    ]);
    expect(s).toBe(
      'and(or(ma_san_pham.ilike.%VNA0240%,ten_san_pham.ilike.%VNA0240%,ma_don_hang.ilike.%VNA0240%),ma_san_pham.in.("F-PP10")),' +
      'or(ma_san_pham.ilike.%DLY0508%,ten_san_pham.ilike.%DLY0508%,ma_don_hang.ilike.%DLY0508%)'
    );
  });

  it('nhóm rỗng hoàn toàn bị bỏ qua, không sinh mệnh đề què', () => {
    expect(menhDeLoc([{ tu: '  ', ma: [] }])).toBe('');
    expect(menhDeLoc([{ tu: '', ma: [] }, { tu: 'A', ma: [] }]))
      .toBe('or(ma_san_pham.ilike.%A%,ten_san_pham.ilike.%A%,ma_don_hang.ilike.%A%)');
  });

  it('KHỬ ký tự phá cú pháp trong từ khoá', () => {
    // ,()* là ký tự phân tách của logic tree PostgREST — lọt vào là vỡ truy vấn.
    const s = menhDeLoc([{ tu: 'A,B)or(x', ma: [] }]);
    expect(s).not.toContain('A,B');
    expect(s).toBe('or(ma_san_pham.ilike.%A B or x%,ten_san_pham.ilike.%A B or x%,ma_don_hang.ilike.%A B or x%)');
  });

  it('KHỬ ký tự phá cú pháp trong mã sản phẩm', () => {
    const s = menhDeLoc([{ tu: '', ma: ['F"),x.eq.1--'] }]);
    expect(s).toBe('ma_san_pham.in.("Fx.eq.1--")');
  });

  it('giữ nguyên mã nhiều gạch nối', () => {
    expect(menhDeLoc([{ tu: '', ma: ['S-PVC3043-LUX200RO'] }]))
      .toBe('ma_san_pham.in.("S-PVC3043-LUX200RO")');
  });
});

describe('nhanTomTat', () => {
  it('chưa lọc gì thì rỗng', () => {
    expect(nhanTomTat([])).toBe('');
  });

  it('một nhóm có tick thì hiện từ khoá kèm số SP', () => {
    expect(nhanTomTat([{ tu: 'VNA02404185107', ma: ['F-PP10', 'D-TDS'] }]))
      .toBe('VNA024…107 (2 SP)');
  });

  it('một nhóm không tick thì chỉ hiện từ khoá', () => {
    expect(nhanTomTat([{ tu: 'VNA02404185107', ma: [] }])).toBe('VNA024…107');
  });

  it('từ khoá ngắn thì không cắt', () => {
    expect(nhanTomTat([{ tu: 'F-PP10', ma: [] }])).toBe('F-PP10');
  });

  it('nhóm không từ khoá thì đếm số SP', () => {
    expect(nhanTomTat([{ tu: '', ma: ['A', 'B'] }])).toBe('2 SP');
  });

  it('nhiều nhóm thì đếm nhóm — nhãn LUÔN 1 dòng ngắn', () => {
    expect(nhanTomTat([{ tu: 'A', ma: [] }, { tu: 'B', ma: [] }, { tu: 'C', ma: [] }]))
      .toBe('3 nhóm lọc');
  });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó THẤT BẠI**

Run: `npm test -- src/lib/locNhomLuuXuat.test.js`
Expected: FAIL — `Failed to load url ./locNhomLuuXuat`

- [ ] **Step 3: Viết `src/lib/locNhomLuuXuat.js`**

```js
// Bộ lọc "nhóm" cho tab Lưu xuất (Kho hàng).
//
// VÌ SAO CÓ TỆP NÀY: ô lọc cũ chỉ gửi lên danh sách mã sản phẩm đã tick, chuỗi người
// dùng gõ bị vứt đi. Nên tìm theo mã đơn hàng rồi tick một mã SP thì bảng ra dòng của
// MỌI đơn có mã SP ấy. Ở đây mỗi lần gõ + tick được ghi thành một "nhóm" {tu, ma[]}:
// tick luôn dính liền với từ khoá đã sinh ra nó.
//
// Từ khoá CỐ Ý vẫn khớp cả 3 cột (mã SP / tên SP / mã ĐH) chứ không ép là mã đơn hàng.
// Nếu ép, luồng cũ "gõ F-PP rồi tick F-PP10" sẽ thành ma_don_hang ilike %F-PP% AND
// ma_san_pham = F-PP10 ⇒ 0 dòng, tức là sửa được việc này thì hỏng việc kia.

export const COT_TIM = ['ma_san_pham', 'ten_san_pham', 'ma_don_hang'];

// `, ( ) *` là ký tự phân tách của logic tree PostgREST. Từ khoá do người dùng gõ nên
// phải khử trước khi ghép chuỗi — vừa tránh vỡ truy vấn, vừa chặn đường tiêm bộ lọc.
const khuTuKhoa = (t) => String(t ?? '').replace(/[,()*]/g, ' ').trim();

// Mã SP nằm trong in.("...") nên nguy hiểm thêm ở dấu nháy kép và gạch chéo ngược.
const khuMa = (m) => String(m ?? '').replace(/["\\,()]/g, '').trim();

export function docNhom(value) {
  if (!value) return [];
  let raw;
  try { raw = JSON.parse(value); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(n => n && typeof n === 'object')
    .map(n => ({
      tu: typeof n.tu === 'string' ? n.tu : '',
      ma: Array.isArray(n.ma) ? n.ma.filter(x => typeof x === 'string') : [],
    }));
}

export const ghiNhom = (nhom) => JSON.stringify(nhom ?? []);

export const daTick = (nhom, tu) =>
  new Set((nhom ?? []).find(n => n.tu === tu)?.ma ?? []);

// Bật/tắt một mã trong nhóm của từ khoá đang gõ. Trả MẢNG MỚI (không sửa tại chỗ) để
// React nhận ra thay đổi.
export function doiTick(nhom, tu, ma) {
  const ds = (nhom ?? []).map(n => ({ ...n, ma: [...n.ma] }));
  const i = ds.findIndex(n => n.tu === tu);
  if (i === -1) return [...ds, { tu, ma: [ma] }];

  const j = ds[i].ma.indexOf(ma);
  if (j === -1) ds[i].ma.push(ma);
  else ds[i].ma.splice(j, 1);

  // Nhóm không từ khoá mà cũng hết mã thì chẳng lọc gì — bỏ hẳn thay vì để lại thẻ rỗng.
  if (!ds[i].tu && ds[i].ma.length === 0) ds.splice(i, 1);
  return ds;
}

// Bấm Xong: từ khoá đang gõ chưa thành nhóm thì chốt nó thành nhóm "cả đơn".
// CỐ Ý không chốt theo từng phím gõ — nếu không, gõ V / VN / VNA… sẽ đẻ ra nhóm rác.
export function chotCaDon(nhom, tu) {
  const ds = nhom ?? [];
  if (!khuTuKhoa(tu)) return ds;
  if (ds.some(n => n.tu === tu)) return ds;
  return [...ds, { tu, ma: [] }];
}

export const xoaNhom = (nhom, tu) => (nhom ?? []).filter(n => n.tu !== tu);

// Dựng phần trong ngoặc của .or(...) cho supabase-js.
// Mỗi nhóm:
//   có từ khoá + mã : and( or(3 cột ilike), ma_san_pham.in.(...) )
//   chỉ từ khoá     : or(3 cột ilike)                     → cả đơn
//   chỉ mã          : ma_san_pham.in.(...)                → đúng hành vi CŨ
// Đã đo thật 2026-08-05: PostgREST chấp nhận lồng or(and(or(...),in.(...)),or(...)).
export function menhDeLoc(nhom) {
  const ve = [];
  for (const n of nhom ?? []) {
    const tu = khuTuKhoa(n.tu);
    const ma = (n.ma ?? []).map(khuMa).filter(Boolean);
    const dsMa = ma.length ? `ma_san_pham.in.(${ma.map(m => `"${m}"`).join(',')})` : '';
    const orTu = tu ? `or(${COT_TIM.map(c => `${c}.ilike.%${tu}%`).join(',')})` : '';

    if (orTu && dsMa) ve.push(`and(${orTu},${dsMa})`);
    else if (orTu) ve.push(orTu);
    else if (dsMa) ve.push(dsMa);
  }
  return ve.join(',');
}

// Nhãn cho nút lọc ngoài thanh công cụ. LUÔN 1 dòng ngắn — luật giao diện mobile của
// dự án: nút không được xuống dòng 2, không được đẩy thanh công cụ tràn ngang.
export function nhanTomTat(nhom) {
  const ds = nhom ?? [];
  if (ds.length === 0) return '';
  if (ds.length > 1) return `${ds.length} nhóm lọc`;

  const { tu, ma } = ds[0];
  if (!tu) return `${ma.length} SP`;
  const ngan = tu.length > 12 ? `${tu.slice(0, 6)}…${tu.slice(-3)}` : tu;
  return ma.length ? `${ngan} (${ma.length} SP)` : ngan;
}
```

- [ ] **Step 4: Chạy test để chắc chắn nó ĐẠT**

Run: `npm test -- src/lib/locNhomLuuXuat.test.js`
Expected: PASS, toàn bộ khối describe xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/locNhomLuuXuat.js src/lib/locNhomLuuXuat.test.js
git commit -m "feat(kho): thu vien nhom loc don hang x san pham cho Luu xuat"
```

---

### Task 2: Bật chế độ nhóm trong `SearchAutoSuggest` (mặc định TẮT)

**Files:**
- Modify: `src/components/SearchAutoSuggest.jsx`

Ràng buộc sống còn: component này đang được **10 tab** dùng chung (BomTab, InventoryTab,
WipStockTab, CatalogTab, PrintQueueTab, StockSummaryTab, ImportLogsTab, BookInventoryTab,
PickingLogsTab, SaveExportTab). Khi `groupByTerm` không được truyền, mọi nhánh phải chạy
đúng mã cũ.

- [ ] **Step 1: Thêm import và prop**

Thêm vào đầu tệp, ngay sau import `supabase`:

```js
import { docNhom, ghiNhom, daTick, doiTick, chotCaDon, xoaNhom, nhanTomTat } from '../lib/locNhomLuuXuat';
```

Thêm `groupByTerm = false,` vào danh sách props (sau `localSearchKeys,`).

- [ ] **Step 2: Thay khối tính `selectedSet` bằng view-model hai chế độ**

Thay dòng:

```js
  const selectedSet = new Set(value ? value.split(',').map(v => v.trim()).filter(Boolean) : []);
```

bằng:

```js
  // Chế độ nhóm: `value` là chuỗi JSON các nhóm {tu, ma[]}; ô tick hiện trạng thái của
  // nhóm khớp ĐÚNG từ khoá đang gõ. Chế độ thường: `value` là chuỗi mã ngăn bởi dấu phẩy.
  const nhom = groupByTerm ? docNhom(value) : [];
  const selectedSet = groupByTerm
    ? daTick(nhom, input)
    : new Set(value ? value.split(',').map(v => v.trim()).filter(Boolean) : []);
  const coLoc = groupByTerm ? nhom.length > 0 : selectedSet.size > 0;
  const nhanNut = groupByTerm
    ? nhanTomTat(nhom)
    : (selectedSet.size === 1 ? [...selectedSet][0] : `${selectedSet.size} đã chọn`);
```

- [ ] **Step 3: Cho `toggle` / `clear` / Xong biết hai chế độ**

Thay khối:

```js
  const toggle = (v) => {
    const n = new Set(selectedSet);
    n.has(v) ? n.delete(v) : n.add(v);
    onChange([...n].join(','));
  };
  const clear = () => { onChange(''); setInput(''); setResults([]); };
```

bằng:

```js
  const toggle = (v) => {
    if (groupByTerm) { onChange(ghiNhom(doiTick(nhom, input, v))); return; }
    const n = new Set(selectedSet);
    n.has(v) ? n.delete(v) : n.add(v);
    onChange([...n].join(','));
  };
  const clear = () => { onChange(''); setInput(''); setResults([]); };

  // Bấm Xong: chốt từ khoá đang gõ thành nhóm "cả đơn" nếu người dùng chưa tick gì.
  const xong = () => {
    if (groupByTerm) onChange(ghiNhom(chotCaDon(nhom, input)));
    setOpen(false);
  };
```

- [ ] **Step 4: Mở ô lọc thì xoá ô nhập (chỉ chế độ nhóm)**

Trong `handleOpen`, thay hai dòng đầu:

```js
  const handleOpen = async () => {
    setOpen(true);
    // Preload initial results if empty
    if (results.length === 0 && !input) {
```

bằng:

```js
  const handleOpen = async () => {
    setOpen(true);
    // Chế độ nhóm: mở lại là để gõ ĐƠN TIẾP THEO, nên dọn ô nhập. Các nhóm đã chốt vẫn
    // nằm nguyên dạng thẻ nên không mất trạng thái lọc.
    const tuoiInput = groupByTerm ? '' : input;
    if (groupByTerm && input) { setInput(''); setResults([]); }
    // Preload initial results if empty
    if ((groupByTerm || results.length === 0) && !tuoiInput) {
```

- [ ] **Step 5: Nút ngoài thanh công cụ dùng `coLoc` / `nhanNut`**

Trong khối Trigger, thay:

```js
          color: selectedSet.size > 0 ? '#0f172a' : '#94a3b8',
```
bằng
```js
          color: coLoc ? '#0f172a' : '#94a3b8',
```

và thay:

```js
          {selectedSet.size > 0
            ? (selectedSet.size === 1 ? [...selectedSet][0] : `${selectedSet.size} đã chọn`)
            : placeholder}
        </span>
        {selectedSet.size > 0 && (
```
bằng
```js
          {coLoc ? nhanNut : placeholder}
        </span>
        {coLoc && (
```

- [ ] **Step 6: Nút "Xóa tất cả" trong header dùng `coLoc`**

Thay `{selectedSet.size > 0 && (` ngay dưới dòng `<span …>Tìm kiếm & Lọc</span>` bằng `{coLoc && (`.

- [ ] **Step 7: Vẽ thẻ nhóm (chế độ nhóm) thay cho dãy chip phẳng**

Thay nguyên khối `{/* Selected chips */}` (từ `{selectedSet.size > 0 && (` tới `)}` đóng khối)
bằng:

```js
            {/* Chế độ nhóm: mỗi thẻ là một từ khoá + các mã đã tick trong từ khoá đó.
                Ghi rõ "cả đơn" khi không tick mã nào — không để trạng thái lọc nào ẩn. */}
            {groupByTerm ? (nhom.length > 0 && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8' }}>Đang lọc:</span>
                {nhom.map(n => (
                  <div key={n.tu} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, fontSize: '0.74rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.tu}>
                        {n.tu || 'Mọi đơn hàng'}
                      </span>
                      {n.ma.length === 0 && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0891b2', whiteSpace: 'nowrap' }}>cả đơn</span>}
                      <span onClick={() => onChange(ghiNhom(xoaNhom(nhom, n.tu)))} style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 900, lineHeight: 1 }} title="Bỏ nhóm này">×</span>
                    </div>
                    {n.ma.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {n.ma.map(m => (
                          <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eff6ff', color: '#1d4ed8', borderRadius: 99, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                            {m}
                            <span onClick={() => onChange(ghiNhom(doiTick(nhom, n.tu, m)))} style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 900, marginLeft: 2 }}>×</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )) : (selectedSet.size > 0 && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[...selectedSet].map(v => (
                  <span
                    key={v}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      background: '#eff6ff', color: '#1d4ed8', borderRadius: 99,
                      padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
                    }}
                  >
                    {v}
                    <span onClick={() => toggle(v)} style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 900, marginLeft: 2 }}>×</span>
                  </span>
                ))}
              </div>
            ))}
```

- [ ] **Step 8: Nút Xong gọi `xong()`**

Thay `<button onClick={() => setOpen(false)} style={{ border: 'none', background: '#2563eb'` … `>Xong</button>`
sao cho `onClick={xong}`.

- [ ] **Step 9: Kiểm tra không phá 9 tab kia**

Run: `npm run lint && npm test`
Expected: lint sạch, toàn bộ test cũ vẫn PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/SearchAutoSuggest.jsx
git commit -m "feat(kho): SearchAutoSuggest ho tro che do nhom (mac dinh tat)"
```

---

### Task 3: `SaveExportTab` dùng nhóm lọc

**Files:**
- Modify: `src/pages/kho/SaveExportTab.jsx`

- [ ] **Step 1: Import thư viện**

Thêm sau dòng import `SearchAutoSuggest`:

```js
import { docNhom, menhDeLoc } from '../../lib/locNhomLuuXuat';
```

- [ ] **Step 2: Một hàm dựng bộ lọc dùng chung cho bảng và Xuất Excel**

Thêm ngay trên `const fetchData = async () => {`:

```js
  // Bảng và nút Xuất Excel PHẢI lọc y hệt nhau. Trước đây hai chỗ chép tay cùng một
  // điều kiện nên rất dễ sửa một chỗ quên chỗ kia ⇒ gom về một hàm.
  const apDungLoc = (query, chuoiNhom) => {
    const menhDe = menhDeLoc(docNhom(chuoiNhom));
    return menhDe ? query.or(menhDe) : query;
  };
```

- [ ] **Step 3: Dùng nó trong `fetchData`**

Thay:

```js
        if (search) {
          const terms = search.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) {
            query = query.in('ma_san_pham', terms);
          }
        }
```
bằng
```js
        query = apDungLoc(query, search);
```

- [ ] **Step 4: Dùng nó trong `handleExportExcel`**

Thay:

```js
          let query = db.from('luu_xuat').select('*');
          if (search) {
            const terms = search.split(',').map(t => t.trim()).filter(Boolean);
            if (terms.length > 0) query = query.in('ma_san_pham', terms);
          }
```
bằng
```js
          let query = apDungLoc(db.from('luu_xuat').select('*'), search);
```

- [ ] **Step 5: Bật `groupByTerm` cho ô lọc**

Thêm `groupByTerm` vào thẻ `<SearchAutoSuggest …>` của tệp này (chỉ tệp này):

```jsx
          <SearchAutoSuggest
            tableName="luu_xuat"
            searchColumns={['ma_san_pham','ten_san_pham','ma_don_hang']}
            displayColumn="ma_san_pham"
            placeholder="Tìm mã SP, tên, ĐH..."
            groupByTerm
            value={searchInput}
            onChange={v => { setSearchInput(v); setPage(1); }}
          />
```

- [ ] **Step 6: Lint + test**

Run: `npm run lint && npm test`
Expected: sạch, PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/kho/SaveExportTab.jsx
git commit -m "fix(kho): Luu xuat loc dung dong cua don hang da tim"
```

---

### Task 4: Đo trên dữ liệu thật

**Files:**
- Create: `<scratchpad>/do-loc-nhom.mjs` (tệp tạm, KHÔNG commit)

- [ ] **Step 1: So số dòng của mệnh đề mới với truy vấn SQL trực tiếp**

Dùng MCP Supabase `execute_sql` lấy số dòng chuẩn:

```sql
select count(*) from luu_xuat
where ma_don_hang ilike '%VNA02404185107%' and ma_san_pham = 'F-PP10';
```

Rồi đối chiếu với số dòng PostgREST trả về khi áp mệnh đề do `menhDeLoc` sinh ra.
Hai số phải bằng nhau.

- [ ] **Step 2: Kiểm tra luồng CŨ không đổi**

So `count(*) where ma_san_pham in ('F-PP10')` với mệnh đề của nhóm `{tu:'F-PP', ma:['F-PP10']}`.
Ghi lại chênh lệch nếu có và giải thích (từ khoá `F-PP` khớp `ma_san_pham` nên tập kết quả
phải trùng khít).

- [ ] **Step 3: Kiểm tra cộng dồn 2 đơn**

Số dòng của nhóm A ∪ nhóm B phải bằng tổng hai truy vấn riêng trừ phần giao.

- [ ] **Step 4: Thử tiêm ký tự phá cú pháp**

Gửi từ khoá `A,B)or(x` và mã SP `F"),x.eq.1--` qua đúng đường app dựng truy vấn.
Expected: HTTP 200 (đã bị khử), tuyệt đối không có 400 `PGRST100`, không lộ thêm dòng nào.

- [ ] **Step 5: Chạy skill bảo mật**

Chạy skill `kiem-tra-bao-mat-du-lieu` và làm đủ phần kiểm chứng: khoá công khai không
đọc/sửa/xoá được `luu_xuat`.

- [ ] **Step 6: Dựng bản phát hành**

Run: `npm run build`
Expected: build thành công, thư mục `dist` sẵn sàng để kéo-thả lên Netlify.

---

## Tự soát kế hoạch

**Phủ spec:** khái niệm nhóm → Task 1; quy tắc chốt nhóm (tick / Xong / mở lại / bỏ tick hết /
xoá thẻ / gộp không trùng) → Task 1 Step 3 + Task 2 Step 3-4; giao diện thẻ → Task 2 Step 7;
nhãn nút 1 dòng → Task 1 (`nhanTomTat`) + Task 2 Step 5; truy vấn lồng → Task 1 (`menhDeLoc`);
khử ký tự → Task 1 (`khuTuKhoa`/`khuMa`) + test Step 1; lưu bằng chuỗi JSON tránh vòng lặp
tải lại → Task 1 (`docNhom`/`ghiNhom`) + Task 3 giữ nguyên kiểu chuỗi; dùng chung hàm lọc cho
Xuất Excel → Task 3 Step 2-4; 9 tab không đổi → Task 2 (mặc định tắt) + Step 9; kiểm chứng
trên dữ liệu thật + bảo mật → Task 4.

**Chỗ chưa được spec nói rõ, đã bổ sung:** nhóm **không có từ khoá** (người dùng mở ô lọc,
không gõ, tick thẳng từ danh sách nạp sẵn). Đây là hành vi đang chạy hôm nay ở tab này, nên
`menhDeLoc` phải sinh `ma_san_pham.in.(...)` phẳng — đã có test riêng ở Task 1.

**Không còn chỗ trống:** không có TBD/TODO; mọi bước sửa mã đều kèm mã thật.

**Nhất quán tên:** `docNhom` / `ghiNhom` / `daTick` / `doiTick` / `chotCaDon` / `xoaNhom` /
`menhDeLoc` / `nhanTomTat` — dùng đúng các tên này ở Task 2 và Task 3.
