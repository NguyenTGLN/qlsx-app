# Thêm BOM thủ công (tab BOM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhập một BOM bằng tay trong tab BOM: chọn 1 mã thành phẩm + nhiều mã linh kiện từ Danh mục hàng hóa qua ô gõ-tìm gợi ý, rồi lưu tất cả cùng lúc.

**Architecture:** Tách phần logic thuần (kiểm tra hợp lệ + dựng bản ghi insert, bỏ qua linh kiện trùng) ra module `src/lib/bomManualEntry.js` có unit test bằng vitest. Phần giao diện (nút, modal, ô chọn danh mục) viết trong `src/pages/kho/BomTab.jsx`, dùng lại mẫu picker `position:fixed` đã chạy ổn ở `ImportStockTab.jsx`, và gọi 2 hàm thuần khi lưu.

**Tech Stack:** React 19, Vite, Vitest, Supabase JS, lucide-react.

Spec: `docs/superpowers/specs/2026-07-09-bom-manual-entry-design.md`

---

## File Structure

- **Create** `src/lib/bomManualEntry.js` — 2 hàm thuần: `validateManualBom(product, lines)` và `buildBomInserts(product, lines, existingComps)`. Không phụ thuộc React/DB.
- **Create** `src/lib/bomManualEntry.test.js` — unit test vitest cho 2 hàm trên.
- **Modify** `src/pages/kho/BomTab.jsx`:
  - Thêm import `Plus`, `getCatalogItems`, và 2 hàm từ `bomManualEntry`.
  - Thêm component cục bộ `CatalogItemPicker` (ô gõ-tìm gợi ý danh mục, dropdown `position:fixed`).
  - Thêm state + handlers cho modal "Thêm BOM thủ công".
  - Thêm nút **Thêm BOM** vào thanh hành động dưới (nhánh chưa chọn dòng, gated `perms.create`).
  - Thêm JSX modal.

---

## Task 1: Module logic thuần `bomManualEntry.js` (TDD)

**Files:**
- Create: `src/lib/bomManualEntry.js`
- Test: `src/lib/bomManualEntry.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `src/lib/bomManualEntry.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateManualBom, buildBomInserts } from './bomManualEntry';

describe('validateManualBom', () => {
  const prod = { code: 'TP01', name: 'Máy lọc A' };

  it('lỗi khi chưa chọn thành phẩm', () => {
    const r = validateManualBom(null, [{ component_code: 'LK1', quantity: '2' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/thành phẩm/i);
  });

  it('lỗi khi không có linh kiện nào được chọn', () => {
    const r = validateManualBom(prod, [{ component_code: '', quantity: '' }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/linh kiện/i);
  });

  it('lỗi khi số lượng <= 0 hoặc không phải số', () => {
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: '0' }]).ok).toBe(false);
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: '-3' }]).ok).toBe(false);
    expect(validateManualBom(prod, [{ component_code: 'LK1', quantity: 'abc' }]).ok).toBe(false);
  });

  it('bỏ qua dòng chưa chọn linh kiện khi kiểm tra số lượng', () => {
    const r = validateManualBom(prod, [
      { component_code: 'LK1', quantity: '2' },
      { component_code: '', quantity: '' },
    ]);
    expect(r.ok).toBe(true);
  });

  it('hợp lệ khi có thành phẩm + linh kiện + SL > 0', () => {
    const r = validateManualBom(prod, [{ component_code: 'LK1', quantity: '2.5' }]);
    expect(r.ok).toBe(true);
  });
});

describe('buildBomInserts', () => {
  const prod = { code: 'TP01', name: 'Máy lọc A' };

  it('tạo bản ghi cho các linh kiện mới', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', component_name: 'Lõi 1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK2', component_name: 'Lõi 2', unit: 'Bộ', quantity: '1' },
    ], new Set());
    expect(skipped).toBe(0);
    expect(inserts).toEqual([
      { product_code: 'TP01', product_name: 'Máy lọc A', component_code: 'LK1', unit: 'Cái', quantity: 2 },
      { product_code: 'TP01', product_name: 'Máy lọc A', component_code: 'LK2', unit: 'Bộ', quantity: 1 },
    ]);
  });

  it('bỏ qua linh kiện đã có sẵn trong DB', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK2', unit: 'Bộ', quantity: '1' },
    ], new Set(['LK1']));
    expect(skipped).toBe(1);
    expect(inserts.map(i => i.component_code)).toEqual(['LK2']);
  });

  it('bỏ qua linh kiện trùng trong cùng lô nhập (giữ dòng đầu)', () => {
    const { inserts, skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
      { component_code: 'LK1', unit: 'Cái', quantity: '5' },
    ], new Set());
    expect(skipped).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].quantity).toBe(2);
  });

  it('bỏ dòng chưa chọn linh kiện, ép quantity về số', () => {
    const { inserts } = buildBomInserts(prod, [
      { component_code: '', unit: '', quantity: '' },
      { component_code: 'LK9', unit: 'Cái', quantity: '3' },
    ], new Set());
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ component_code: 'LK9', quantity: 3 });
  });

  it('chấp nhận existingComps là mảng', () => {
    const { skipped } = buildBomInserts(prod, [
      { component_code: 'LK1', unit: 'Cái', quantity: '2' },
    ], ['LK1']);
    expect(skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test -- bomManualEntry`
Expected: FAIL — không import được `./bomManualEntry` (module chưa tồn tại).

- [ ] **Step 3: Viết implementation tối thiểu**

Create `src/lib/bomManualEntry.js`:

```js
// Logic thuần cho luồng "Thêm BOM thủ công" ở tab BOM.
// Tách khỏi React/DB để unit test độc lập.
//
// product : { code, name } | null — thành phẩm đã chọn từ danh mục.
// lines   : [{ component_code, component_name, unit, quantity }] — các dòng linh kiện.
// existingComps : Set<string> | string[] — mã linh kiện ĐÃ có sẵn trong DB cho thành phẩm này.

/** Kiểm tra dữ liệu nhập trước khi lưu. Trả { ok:true } hoặc { ok:false, error }. */
export function validateManualBom(product, lines) {
  if (!product || !product.code) {
    return { ok: false, error: 'Chưa chọn mã thành phẩm.' };
  }
  const chosen = (lines || []).filter(l => (l.component_code || '').trim());
  if (chosen.length === 0) {
    return { ok: false, error: 'Chưa chọn linh kiện nào.' };
  }
  const bad = chosen.filter(l => {
    const q = parseFloat(l.quantity);
    return isNaN(q) || q <= 0;
  });
  if (bad.length > 0) {
    const codes = bad.map(l => l.component_code).join(', ');
    return { ok: false, error: `Số lượng phải là số > 0. Kiểm tra linh kiện: ${codes}` };
  }
  return { ok: true };
}

/**
 * Dựng danh sách bản ghi để insert vào bom_items.
 * Bỏ qua linh kiện đã có sẵn trong DB (existingComps) và linh kiện trùng trong cùng lô (giữ dòng đầu).
 * Trả { inserts: object[], skipped: number }.
 */
export function buildBomInserts(product, lines, existingComps = []) {
  const existing = existingComps instanceof Set ? existingComps : new Set(existingComps);
  const seen = new Set();
  const inserts = [];
  let skipped = 0;
  for (const l of (lines || [])) {
    const code = (l.component_code || '').trim();
    if (!code) continue; // dòng chưa chọn linh kiện → bỏ, không tính là trùng
    if (existing.has(code) || seen.has(code)) { skipped++; continue; }
    seen.add(code);
    inserts.push({
      product_code: product.code,
      product_name: product.name || '',
      component_code: code,
      unit: (l.unit || '').trim(),
      quantity: parseFloat(l.quantity),
    });
  }
  return { inserts, skipped };
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test -- bomManualEntry`
Expected: PASS — tất cả test trong `bomManualEntry.test.js` xanh.

- [ ] **Step 5: Commit**

```bash
git add "src/lib/bomManualEntry.js" "src/lib/bomManualEntry.test.js"
git commit -m "feat(bom): logic thuan them BOM thu cong + test"
```

---

## Task 2: Component picker danh mục + imports trong BomTab

**Files:**
- Modify: `src/pages/kho/BomTab.jsx`

- [ ] **Step 1: Cập nhật imports**

Trong `src/pages/kho/BomTab.jsx`:

Đổi dòng import icon (dòng 5) để thêm `Plus`:

```js
import { Search, Loader2, RefreshCw, Trash2, Edit3, Download, Upload, X, Check, Printer, Plus } from 'lucide-react';
```

Đổi dòng import catalogCache (dòng 4) để thêm `getCatalogItems`:

```js
import { invalidateBomProducts, getCatalogItems } from '../../lib/catalogCache';
```

Thêm import module logic (ngay sau dòng import `ColumnToggleModal`):

```js
import { validateManualBom, buildBomInserts } from '../../lib/bomManualEntry';
```

- [ ] **Step 2: Thêm component `CatalogItemPicker`**

Chèn component này NGAY TRƯỚC dòng `export default function BomTab(` (đặt ở phạm vi module, cùng file):

```jsx
// Ô chọn 1 mã hàng từ Danh mục hàng hóa — gõ để lọc gợi ý (theo mã + tên).
// Dropdown dùng position:fixed neo theo input để KHÔNG bị vùng cuộn của modal cắt cụt.
function CatalogItemPicker({ items, placeholder, onSelect, excludeCodes }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4, margin = 12;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    setPos({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight: Math.max(160, Math.min(320, spaceBelow)) });
  }, []);

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onMove = () => updatePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, updatePos]);

  const q = input.toLowerCase();
  const exclude = excludeCodes instanceof Set ? excludeCodes : new Set(excludeCodes || []);
  const results = (items || []).filter(it =>
    !exclude.has(it.item_code) && (
      (it.item_code || '').toLowerCase().includes(q) ||
      (it.item_name || '').toLowerCase().includes(q)
    )
  ).slice(0, 50);

  const pick = (it) => { onSelect(it); setInput(''); setOpen(false); };

  return (
    <div style={{ position:'relative', width:'100%' }} ref={wrapRef}>
      <div style={{ display:'flex', alignItems:'center', background:'#f8fafc', border:'1px solid #cbd5e1', borderRadius:6, padding:'6px 10px' }}>
        <Search size={15} color="#94a3b8" />
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ border:'none', outline:'none', background:'transparent', width:'100%', fontSize:'0.82rem', paddingLeft:8 }}
        />
      </div>
      {open && input && pos && (
        <div style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, background:'#fff', border:'1px solid #cbd5e1', borderRadius:6, maxHeight:pos.maxHeight, overflow:'auto', zIndex:200, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)' }}>
          {results.length === 0 ? (
            <div style={{ padding:10, fontSize:'0.8rem', color:'#64748b', textAlign:'center' }}>Không tìm thấy kết quả</div>
          ) : results.map((it, idx) => (
            <div
              key={idx}
              onClick={() => pick(it)}
              style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:'0.8rem' }}
              onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background=''}
            >
              <b>{it.item_code}</b> — {it.item_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Ghi chú: `useState, useEffect, useCallback, useRef` đã được import sẵn ở dòng 1 của file — không cần thêm.

- [ ] **Step 3: Kiểm tra build + lint**

Run: `npm run build`
Expected: build thành công, không lỗi. (`CatalogItemPicker` chưa dùng ở đâu → có thể có cảnh báo eslint "unused"; sẽ được dùng ở Task 3. Nếu `npm run lint` báo unused, bỏ qua tạm ở bước này.)

- [ ] **Step 4: Commit**

```bash
git add "src/pages/kho/BomTab.jsx"
git commit -m "feat(bom): them CatalogItemPicker + imports cho nhap BOM tay"
```

---

## Task 3: Modal "Thêm BOM thủ công" + nút + wiring lưu

**Files:**
- Modify: `src/pages/kho/BomTab.jsx`

- [ ] **Step 1: Thêm state + handlers**

Trong thân `BomTab`, thêm khối state NGAY SAU khối `// In BOM một sản phẩm` (sau dòng `const printBomReqRef = useRef(0);`):

```jsx
  // Thêm BOM thủ công
  const [showAddBom, setShowAddBom] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [addProduct, setAddProduct] = useState(null); // {code, name}
  const [existingComps, setExistingComps] = useState(new Set());
  const [addLines, setAddLines] = useState([]); // [{key, component_code, component_name, unit, quantity}]
  const [addSaving, setAddSaving] = useState(false);
  const lineKeyRef = useRef(0);
```

Thêm các handler NGAY TRƯỚC `const vis = (col) =>` (gần cuối phần logic):

```jsx
  // --- Thêm BOM thủ công ---
  const newBomLine = () => ({ key: ++lineKeyRef.current, component_code: '', component_name: '', unit: '', quantity: '' });

  const openAddBom = async () => {
    setAddProduct(null);
    setExistingComps(new Set());
    setAddLines([newBomLine()]);
    setShowAddBom(true);
    try {
      const items = await getCatalogItems();
      setCatalogItems(items || []);
    } catch (e) {
      alert('Lỗi tải danh mục hàng hóa: ' + e.message);
    }
  };

  const pickAddProduct = async (it) => {
    const product = { code: it.item_code, name: it.item_name || '' };
    setAddProduct(product);
    try {
      const { data, error } = await db.from('bom_items').select('component_code').eq('product_code', product.code);
      if (error) throw error;
      setExistingComps(new Set((data || []).map(r => r.component_code)));
    } catch (e) {
      setExistingComps(new Set());
      console.warn('Không tải được BOM sẵn có:', e.message);
    }
  };

  const clearAddProduct = () => { setAddProduct(null); setExistingComps(new Set()); };

  const setBomLine = (key, patch) => setAddLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));
  const removeBomLine = (key) => setAddLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls));
  const addBomLine = () => setAddLines(ls => [...ls, newBomLine()]);
  const pickComponent = (key, it) => setBomLine(key, {
    component_code: it.item_code,
    component_name: it.item_name || '',
    unit: it.unit || '',
  });

  const saveAddBom = async () => {
    const v = validateManualBom(addProduct, addLines);
    if (!v.ok) { alert(v.error); return; }
    const { inserts, skipped } = buildBomInserts(addProduct, addLines, existingComps);
    if (inserts.length === 0) { alert('Tất cả linh kiện đã có sẵn cho sản phẩm này.'); return; }
    setAddSaving(true);
    try {
      const { error } = await db.from('bom_items').insert(inserts);
      if (error) throw error;
      invalidateBomProducts();
      const code = addProduct.code;
      setShowAddBom(false);
      setAddProduct(null);
      setAddLines([]);
      setExistingComps(new Set());
      let msg = `Đã thêm ${inserts.length} linh kiện cho ${code}.`;
      if (skipped > 0) msg += `\nBỏ qua ${skipped} linh kiện trùng (đã có sẵn).`;
      alert(msg);
      fetchBom();
    } catch (e) {
      alert('Lỗi thêm BOM: ' + e.message);
    } finally {
      setAddSaving(false);
    }
  };
```

- [ ] **Step 2: Thêm nút "Thêm BOM" vào thanh hành động dưới**

Trong nhánh `else` của thanh dưới (khi chưa chọn dòng), chèn nút NGAY SAU nút "In BOM" (`<button onClick={openPrintBom} ...>` … `</button>`) và TRƯỚC nút "Xuất Excel":

```jsx
            {perms.create && <button onClick={openAddBom} style={{...s.btn, background:'#dcfce7', color:'#15803d', border:'none', padding:'0.4rem 0.75rem', flexShrink:0}}>
              <Plus size={14}/> Thêm BOM
            </button>}
```

- [ ] **Step 3: Thêm JSX modal**

Chèn NGAY SAU khối `{showImport && ( … )}` và TRƯỚC `</div>` đóng ngoài cùng của return:

```jsx
      {/* Modal: Thêm BOM thủ công */}
      {showAddBom && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:560,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)',display:'flex',flexDirection:'column',maxHeight:'88vh'}}>
            {/* Header */}
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0,fontSize:'1rem',display:'flex',alignItems:'center',gap:8}}><Plus size={18} color="#15803d"/> Thêm BOM thủ công</h3>
              <button onClick={()=>setShowAddBom(false)} style={{border:'none',background:'none',cursor:'pointer',color:'#94a3b8',padding:4}}><X size={18}/></button>
            </div>

            {/* Body */}
            <div style={{padding:'1rem 1.25rem',overflowY:'auto',flex:1}}>
              {/* Chọn thành phẩm */}
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:700,color:'#64748b',marginBottom:6}}>Mã thành phẩm</label>
              {addProduct ? (
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 10px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:'#15803d',fontSize:'0.85rem'}}>{addProduct.code}</div>
                    {addProduct.name && <div style={{fontSize:'0.72rem',color:'#64748b',fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{addProduct.name}</div>}
                  </div>
                  <button onClick={clearAddProduct} title="Đổi thành phẩm" style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',display:'flex',padding:2}}><X size={16}/></button>
                </div>
              ) : (
                <CatalogItemPicker items={catalogItems} placeholder="Gõ mã hoặc tên thành phẩm..." onSelect={pickAddProduct} />
              )}

              {/* Cảnh báo đã có BOM */}
              {addProduct && existingComps.size > 0 && (
                <div style={{marginTop:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 10px',fontSize:'0.75rem',color:'#92400e'}}>
                  Sản phẩm này đã có BOM với <b>{existingComps.size}</b> linh kiện — các mã trùng sẽ được bỏ qua khi lưu.
                </div>
              )}

              {/* Danh sách linh kiện */}
              <div style={{marginTop:16,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <label style={{fontSize:'0.75rem',fontWeight:700,color:'#64748b'}}>Linh kiện</label>
                <button onClick={addBomLine} style={{...s.btn,padding:'0.25rem 0.6rem',fontSize:'0.72rem',color:'#15803d',borderColor:'#bbf7d0'}}><Plus size={13}/> Thêm linh kiện</button>
              </div>

              {addLines.map((line, li) => {
                const chosenOthers = new Set(addLines.filter(l => l.key !== line.key).map(l => l.component_code).filter(Boolean));
                const isExisting = line.component_code && existingComps.has(line.component_code);
                return (
                  <div key={line.key} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 10px',marginBottom:8,background:'#fff'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:700,width:18,flexShrink:0}}>{li + 1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        {line.component_code ? (
                          <div style={{display:'flex',alignItems:'center',gap:8,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'6px 10px'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,color:'#334155',fontSize:'0.82rem'}}>{line.component_code}</div>
                              {line.component_name && <div style={{fontSize:'0.7rem',color:'#64748b',fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{line.component_name}</div>}
                            </div>
                            <button onClick={()=>setBomLine(line.key,{component_code:'',component_name:'',unit:''})} title="Đổi linh kiện" style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',display:'flex',padding:2}}><X size={15}/></button>
                          </div>
                        ) : (
                          <CatalogItemPicker items={catalogItems} placeholder="Gõ mã hoặc tên linh kiện..." excludeCodes={chosenOthers} onSelect={(it)=>pickComponent(line.key, it)} />
                        )}
                      </div>
                      <button onClick={()=>removeBomLine(line.key)} disabled={addLines.length<=1} title="Xóa dòng" style={{background:'none',border:'none',cursor:addLines.length<=1?'not-allowed':'pointer',color:addLines.length<=1?'#e2e8f0':'#ef4444',display:'flex',padding:2,flexShrink:0}}><Trash2 size={16}/></button>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',paddingLeft:26}}>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span style={{fontSize:'0.65rem',color:'#94a3b8',fontWeight:600}}>ĐVT</span>
                        <input value={line.unit} onChange={e=>setBomLine(line.key,{unit:e.target.value})} placeholder="ĐVT" style={{...s.input,width:80}} />
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span style={{fontSize:'0.65rem',color:'#94a3b8',fontWeight:600}}>Số lượng</span>
                        <input type="number" value={line.quantity} onChange={e=>setBomLine(line.key,{quantity:e.target.value})} placeholder="SL" style={{...s.input,width:100}} />
                      </div>
                      {isExisting && <span style={{fontSize:'0.7rem',color:'#dc2626',fontWeight:600,alignSelf:'flex-end',paddingBottom:6}}>đã có — sẽ bỏ qua</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{padding:'0.75rem 1.25rem',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'flex-end',gap:10,background:'#f8fafc'}}>
              <button onClick={()=>setShowAddBom(false)} style={s.btn}>Hủy</button>
              <button onClick={saveAddBom} disabled={addSaving} style={{...s.btn,background:'#16a34a',color:'#fff',border:'none',opacity:addSaving?0.6:1}}>
                {addSaving ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Check size={14}/>} Lưu BOM
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2b: (nếu chưa xuất hiện) đảm bảo `perms.create` được truyền vào BomTab**

Run: `grep -n "BomTab" src/pages/kho/KhoHangApp.jsx`
Expected: thấy `BomTab` được render với prop `perms={...}` có `create`. Nếu KhoHangApp truyền `perms` cho các tab khác (ví dụ có `perms.create`), BomTab đã nhận đúng vì default prop là `{ view, create, edit, delete, io }`. Không cần sửa gì nếu pattern giống các tab khác.

- [ ] **Step 3c: Chạy build + lint**

Run: `npm run build`
Expected: build thành công, không lỗi.

Run: `npm run lint`
Expected: không có lỗi mới ở `BomTab.jsx` / `bomManualEntry.js` (không còn cảnh báo unused cho `CatalogItemPicker`).

- [ ] **Step 4: Kiểm thử trên preview (thủ công)**

Khởi động dev server và đăng nhập theo hướng dẫn trong memory `qlsx-preview-verification` (auth tùy biến + lưu ý controlled-input). Sau đó:
1. Vào **Kho hàng → tab BOM**.
2. Bấm **Thêm BOM** → modal mở.
3. Ô **Mã thành phẩm**: gõ vài ký tự → thấy gợi ý từ danh mục → chọn 1 mã. Nếu SP đã có BOM → thấy banner cảnh báo số linh kiện.
4. Ở dòng linh kiện: gõ tìm → chọn 1 mã → **ĐVT tự điền**, tên LK hiển thị. Nhập **Số lượng**.
5. Bấm **Thêm linh kiện** → thêm dòng; xác nhận không chọn lại được mã LK đã chọn ở dòng khác (bị loại khỏi gợi ý).
6. Thử để Số lượng = 0 rồi Lưu → thấy cảnh báo chặn.
7. Sửa lại SL > 0 → **Lưu BOM** → thấy thông báo "Đã thêm N linh kiện", modal đóng, bảng BOM refresh và có dòng mới.
8. Mở lại **Thêm BOM**, chọn đúng SP đó, thêm 1 LK đã có + 1 LK mới → Lưu → thông báo có "Bỏ qua 1 linh kiện trùng", chỉ LK mới được thêm.

Xác nhận dropdown gợi ý **không bị cắt** bên trong modal (nhờ `position:fixed`).

- [ ] **Step 5: Commit**

```bash
git add "src/pages/kho/BomTab.jsx"
git commit -m "feat(bom): modal them BOM thu cong (1 TP + nhieu LK, chon tu danh muc)"
```

---

## Task 4 (tùy chọn — chỉ khi user muốn deploy ngay): Rebuild bundle Netlify

Theo memory `qlsx-netlify-deploy`: user deploy bằng cách kéo-thả thư mục `deploy-netlify/` (bundle build sẵn, đã commit). Sau khi code xong, nếu muốn deploy:

- [ ] **Step 1: Build + đồng bộ bundle**

Run: `npm run build`
Sau đó copy nội dung `dist/` sang `deploy-netlify/` (theo đúng quy trình user vẫn làm).

- [ ] **Step 2: Commit bundle (chỉ khi user yêu cầu)**

```bash
git add deploy-netlify
git commit -m "chore(deploy): rebuild bundle them BOM thu cong"
```

> Lưu ý: KHÔNG tự động deploy. Việc kéo-thả `deploy-netlify/` lên Netlify do user tự thực hiện.

---

## Self-Review

- **Spec coverage:**
  - Điểm vào (nút Thêm BOM, gated `perms.create`) → Task 3 Step 2. ✓
  - Modal 1 TP + nhiều LK, chọn từ danh mục → Task 2 (picker) + Task 3 (modal). ✓
  - Auto-fill ĐVT từ danh mục → `pickComponent` (Task 3 Step 1). ✓
  - Cảnh báo khi SP đã có BOM → banner trong modal (Task 3 Step 3) + `pickAddProduct` nạp `existingComps`. ✓
  - Chặn LK trùng trong form → `excludeCodes={chosenOthers}` trên component picker. ✓
  - Nhãn "đã có — sẽ bỏ qua" cho LK trùng DB → `isExisting` trong modal. ✓
  - Bỏ qua LK trùng khi lưu + báo số bỏ qua → `buildBomInserts` (Task 1) + thông báo trong `saveAddBom`. ✓
  - Validate SL > 0 → `validateManualBom` (Task 1). ✓
  - `invalidateBomProducts()` + `fetchBom()` sau khi lưu → `saveAddBom`. ✓
  - Picker `position:fixed` không bị modal cắt → `CatalogItemPicker` (Task 2). ✓
- **Placeholder scan:** Không có TBD/TODO; mọi step có code/command cụ thể. ✓
- **Type consistency:** `validateManualBom(product, lines)` và `buildBomInserts(product, lines, existingComps)` dùng nhất quán giữa Task 1 và `saveAddBom` (Task 3). `line` có `{key, component_code, component_name, unit, quantity}` nhất quán ở mọi handler. `CatalogItemPicker` props `{items, placeholder, onSelect, excludeCodes}` khớp mọi nơi gọi. ✓
