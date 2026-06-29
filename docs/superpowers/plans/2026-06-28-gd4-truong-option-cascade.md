# GĐ4 — 4 trường option Caresoft: sửa trong app + đẩy ngược — Implementation Plan (rev2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps dùng checkbox (`- [ ]`).

**Goal:** Cho sửa Nhóm SP / Mã SP / Chi tiết lỗi / Linh kiện trong app (Chi tiết lỗi + Linh kiện lọc cascade theo Nhóm SP; Linh kiện multi-select) và đẩy đúng `option_id` về Caresoft.

**Architecture:** Dữ liệu option nhúng file tĩnh `src/data/caresoftFieldOptions.json` (đã sinh: 646 option, `{option_id, field_id, field_key, label, parent_option_id}`). App lưu lựa chọn dạng `*_option_id` / `linh_kiện_option_ids` trong JSONB `thông_tin_bổ_sung`. **KHÔNG dùng bảng Supabase, KHÔNG chạy SQL.** n8n outbound đẩy option_id.

**Tech Stack:** React (Vite), Vitest, n8n. Spec: `docs/superpowers/specs/2026-06-28-gd4-truong-option-cascade-design.md`.

---

## File Structure
- `src/data/caresoftFieldOptions.json` — **DONE** (đã sinh phiên này).
- `src/lib/warrantyProcessing.js` — **Modify** — thêm `OPTION_FIELDS`, `optionsFor`, `resolveOptionLabel`, `parseMultiIds`, `joinMultiIds`.
- `src/lib/warrantyProcessing.test.js` — **Modify** — test helper.
- `src/pages/warranty/WarrantyProcessing.jsx` — **Modify** — import options; `SP_FIELDS` meta; `InfoGroupCard` render flat/cascade/multi; `saveInfoGroup` lưu option_id(s)+nhãn.
- `src/pages/warranty/ProcessingModal.jsx` — **Modify** — 4 trường Sản phẩm dùng select tương ứng.
- `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json` — **Modify** — node "Chuan bi" đẩy option_id (single + multi).
- `deploy-netlify/` — **Modify** — build lại.

---

## Task 1: Dữ liệu option — ĐÃ XONG
File `src/data/caresoftFieldOptions.json` đã sinh (646 option; parent suy từ 6097 ticket). Không làm gì thêm.

---

## Task 2: Helper + meta (TDD)

**Files:** Modify `src/lib/warrantyProcessing.js`, Test `src/lib/warrantyProcessing.test.js`

- [ ] **Step 1: Test fail trước** — thêm vào test file:
```js
import { OPTION_FIELDS, optionsFor, resolveOptionLabel, parseMultiIds, joinMultiIds } from './warrantyProcessing';

describe('GĐ4 option helpers', () => {
  const L = [
    { option_id: 148351, field_key: 'nhóm_sản_phẩm', label: 'MÁY LUX', parent_option_id: null },
    { option_id: 148354, field_key: 'nhóm_sản_phẩm', label: 'COMBO LÕI LỌC', parent_option_id: null },
    { option_id: 147028, field_key: 'mã_sản_phẩm', label: 'LUX-200RO', parent_option_id: 148351 },
    { option_id: 155318, field_key: 'chi_tiết_lỗi', label: 'Máy không ra nước', parent_option_id: 148354 },
    { option_id: 155346, field_key: 'chi_tiết_lỗi', label: 'Máy không ra nước', parent_option_id: 148351 },
    { option_id: 999001, field_key: 'chi_tiết_lỗi', label: 'Lỗi lạ chưa rõ nhóm', parent_option_id: null },
  ];
  test('meta đúng cờ cascade/multi', () => {
    expect(OPTION_FIELDS['nhóm_sản_phẩm'].cascade).toBe(false);
    expect(OPTION_FIELDS['mã_sản_phẩm'].cascade).toBe(false);
    expect(OPTION_FIELDS['chi_tiết_lỗi'].cascade).toBe(true);
    expect(OPTION_FIELDS['linh_kiện'].multi).toBe(true);
  });
  test('field KHÔNG cascade → trả mọi option của field (bỏ qua parent)', () => {
    expect(optionsFor(L, 'nhóm_sản_phẩm').map(o => o.option_id)).toEqual([148351, 148354]);
  });
  test('field cascade → option đúng nhóm + nhóm "Khác" (parent null)', () => {
    const r = optionsFor(L, 'chi_tiết_lỗi', 148351);
    expect(r.map(o => o.option_id)).toEqual([155346, 999001]); // match parent + unparented
  });
  test('field cascade chưa chọn nhóm → chỉ unparented', () => {
    expect(optionsFor(L, 'chi_tiết_lỗi', null).map(o => o.option_id)).toEqual([999001]);
  });
  test('resolveOptionLabel', () => {
    expect(resolveOptionLabel(L, 155318)).toBe('Máy không ra nước');
    expect(resolveOptionLabel(L, '155318')).toBe('Máy không ra nước');
    expect(resolveOptionLabel(L, null)).toBe('');
  });
  test('parseMultiIds / joinMultiIds (định dạng CS ,id,id,)', () => {
    expect(parseMultiIds(',149905,149620,')).toEqual([149905, 149620]);
    expect(parseMultiIds('')).toEqual([]);
    expect(parseMultiIds(null)).toEqual([]);
    expect(joinMultiIds([149905, 149620])).toBe(',149905,149620,');
    expect(joinMultiIds([])).toBe('');
  });
});
```

- [ ] **Step 2: Chạy → fail.** `npx vitest run src/lib/warrantyProcessing.test.js` → FAIL.

- [ ] **Step 3: Cài helper** — thêm cuối `src/lib/warrantyProcessing.js`:
```js
// Meta 4 trường option Caresoft (GĐ4). cascade=lọc theo Nhóm SP; multi=chọn nhiều.
export const OPTION_FIELDS = {
  'nhóm_sản_phẩm': { fieldId: 9850, multi: false, cascade: false, parentKey: null },
  'mã_sản_phẩm':   { fieldId: 9720, multi: false, cascade: false, parentKey: null },
  'chi_tiết_lỗi':  { fieldId: 9852, multi: false, cascade: true,  parentKey: 'nhóm_sản_phẩm' },
  'linh_kiện':     { fieldId: 9719, multi: true,  cascade: true,  parentKey: 'mã_sản_phẩm' }, // cascade theo MÃ SP (máy)
};
export const OPTION_FIELD_KEYS = Object.keys(OPTION_FIELDS);

// Lọc option để render dropdown.
//  - field KHÔNG cascade → mọi option của field.
//  - field cascade → option có parent == parentOptionId, KÈM option parent null (mục "Khác").
//    parentOptionId rỗng → chỉ option parent null.
export function optionsFor(list, fieldKey, parentOptionId = null) {
  if (!Array.isArray(list)) return [];
  const meta = OPTION_FIELDS[fieldKey] || {};
  const base = list.filter(o => o.field_key === fieldKey);
  if (!meta.cascade) return base;
  const pid = parentOptionId == null || parentOptionId === '' ? null : String(parentOptionId);
  return base.filter(o => {
    const par = o.parent_option_id == null ? null : String(o.parent_option_id);
    return par === null || par === pid; // unparented ("Khác") luôn hiện; còn lại khớp nhóm
  });
}

export function resolveOptionLabel(list, optionId) {
  if (!Array.isArray(list) || optionId == null || optionId === '') return '';
  const o = list.find(x => String(x.option_id) === String(optionId));
  return o ? o.label : '';
}

// CS lưu multi-select dạng ",id,id," — parse ra mảng số, và ngược lại.
export function parseMultiIds(v) {
  return String(v == null ? '' : v).split(',').map(s => s.trim()).filter(Boolean).map(Number);
}
export function joinMultiIds(ids) {
  const a = (ids || []).filter(x => x != null && x !== '');
  return a.length ? ',' + a.join(',') + ',' : '';
}
```

- [ ] **Step 4: Chạy → pass.** `npx vitest run src/lib/warrantyProcessing.test.js` → PASS.

- [ ] **Step 5: Commit.** `git add src/lib/warrantyProcessing.js src/lib/warrantyProcessing.test.js && git commit -m "feat(bao-hanh): GĐ4 option helpers + meta (cascade/multi)"`

---

## Task 3: InfoGroupCard (card Sản phẩm) — flat + cascade + multi

**Files:** Modify `src/pages/warranty/WarrantyProcessing.jsx`

- [ ] **Step 1: Import options + helper.**
```jsx
import fieldOptions from '../../data/caresoftFieldOptions.json';
// thêm vào import từ warrantyProcessing:
import { /*...,*/ OPTION_FIELDS, OPTION_FIELD_KEYS, optionsFor, resolveOptionLabel, parseMultiIds } from '../../lib/warrantyProcessing';
```
(Bỏ `loadCaresoftOptions`/module fetch — dùng JSON nhúng trực tiếp.)

- [ ] **Step 2: SP_FIELDS đánh dấu option.**
```jsx
const SP_FIELDS = [
  { key: 'nhóm_sản_phẩm', label: 'Nhóm SP', kind: 'option', fieldKey: 'nhóm_sản_phẩm' },
  { key: 'mã_sản_phẩm',  label: 'Mã SP',    kind: 'option', fieldKey: 'mã_sản_phẩm' },
  { key: 'chi_tiết_lỗi', label: 'Chi tiết lỗi', kind: 'option', fieldKey: 'chi_tiết_lỗi' },
  { key: 'linh_kiện',    label: 'Linh kiện lỗi', kind: 'option', fieldKey: 'linh_kiện' },
  { key: 'ngày_lắp_đặt', label: 'Ngày lắp' },
  { key: 'tình_trạng',   label: 'Tình trạng' },
];
```

- [ ] **Step 3: InfoGroupCard — hiển thị + popover sửa.** Sửa component:
  - `valOf(f)`: với `kind:'option'`: nếu multi → join nhãn các id trong `tin['linh_kiện_option_ids']`; nếu single → `resolveOptionLabel(fieldOptions, tin[f.key+'_option_id'])`; fallback `row[f.key]`.
  - `openPop`: nạp draft từ `tin` — single: `draft[f.key+'_option_id']`; multi: `draft['linh_kiện_option_ids']` (mảng).
  - Render theo `OPTION_FIELDS[f.fieldKey]`:
    - **flat single** (Nhóm SP, Mã SP): `<select>` mọi option (`optionsFor(fieldOptions, fieldKey)`).
    - **cascade single** (Chi tiết lỗi): `<select>` `optionsFor(fieldOptions, fieldKey, draft['nhóm_sản_phẩm_option_id'])`; tách `<optgroup label="Khác">` cho option parent null. Khi đổi Nhóm SP → reset `chi_tiết_lỗi_option_id` + `linh_kiện_option_ids`.
    - **cascade multi** (Linh kiện): nhóm checkbox từ `optionsFor(...)` ; lưu mảng id vào `draft['linh_kiện_option_ids']`.
  - `hasEditable = fields.some(f => f.kind==='option' || !f.readOnly)`.
```jsx
// trong vòng render field:
{f.kind === 'option' ? (() => {
  const meta = OPTION_FIELDS[f.fieldKey];
  const parentOid = meta.parentKey ? (draft[meta.parentKey + '_option_id'] || '') : null;
  const opts = optionsFor(fieldOptions, f.fieldKey, meta.cascade ? parentOid : null);
  if (meta.multi) {
    const sel = new Set((draft['linh_kiện_option_ids'] || []).map(String));
    const disabled = !perm.edit || (meta.cascade && !parentOid);
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem', maxHeight:160, overflowY:'auto', border:'1px solid #cbd5e1', borderRadius:'7px', padding:'0.3rem 0.5rem' }}>
        {meta.cascade && !parentOid && <span style={{ color:'#94a3b8', fontSize:'0.78rem' }}>(chọn Nhóm SP trước)</span>}
        {opts.map(o => (
          <label key={o.option_id} style={{ display:'flex', gap:'0.4rem', fontSize:'0.8rem', alignItems:'center' }}>
            <input type="checkbox" disabled={disabled} checked={sel.has(String(o.option_id))}
              onChange={e => setDraft(d => {
                const cur = new Set((d['linh_kiện_option_ids'] || []).map(String));
                if (e.target.checked) cur.add(String(o.option_id)); else cur.delete(String(o.option_id));
                return { ...d, 'linh_kiện_option_ids': [...cur].map(Number) };
              })} />
            {o.label}{o.parent_option_id == null ? ' (khác)' : ''}
          </label>
        ))}
      </div>
    );
  }
  const disabled = !perm.edit || (meta.cascade && !parentOid);
  return (
    <select value={draft[f.key + '_option_id'] || ''} disabled={disabled}
      onChange={e => { const v = e.target.value; setDraft(d => {
        const nd = { ...d, [f.key + '_option_id']: v };
        if (f.key === 'nhóm_sản_phẩm') { nd['chi_tiết_lỗi_option_id'] = ''; nd['linh_kiện_option_ids'] = []; }
        return nd; }); }}
      style={{ border:'1px solid #cbd5e1', borderRadius:'7px', padding:'0.4rem 0.5rem', fontSize:'0.84rem' }}>
      <option value="">{meta.cascade && !parentOid ? '(chọn Nhóm SP trước)' : '— chọn —'}</option>
      {opts.filter(o => o.parent_option_id != null).map(o => <option key={o.option_id} value={o.option_id}>{o.label}</option>)}
      {opts.some(o => o.parent_option_id == null) && <optgroup label="Khác">{opts.filter(o => o.parent_option_id == null).map(o => <option key={o.option_id} value={o.option_id}>{o.label}</option>)}</optgroup>}
    </select>
  );
})() : f.readOnly
  ? <div style={{ fontSize:'0.82rem', color:'#0f172a', padding:'0.3rem 0' }}>{valOf(f) || '—'}</div>
  : <input value={draft[f.key] ?? ''} disabled={!perm.edit} onChange={e => { const v=e.target.value; setDraft(d=>({...d,[f.key]:v})); }} style={{ border:'1px solid #cbd5e1', borderRadius:'7px', padding:'0.4rem 0.5rem', fontSize:'0.84rem' }} />}
```

- [ ] **Step 4: saveInfoGroup lưu option_id(s) + nhãn.**
```jsx
const saveInfoGroup = async (row, draft, doSync) => {
  const operator = (user && (user.name || user.id)) || '';
  const merged = { ...(row['thông_tin_bổ_sung'] || {}), ...draft };
  for (const k of OPTION_FIELD_KEYS) {
    const meta = OPTION_FIELDS[k];
    if (meta.multi) {
      const ids = merged['linh_kiện_option_ids'] || [];
      merged[k] = ids.map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ');
    } else {
      const oid = merged[k + '_option_id'];
      if (oid) merged[k] = resolveOptionLabel(fieldOptions, oid) || merged[k] || '';
    }
  }
  const patch = { 'thông_tin_bổ_sung': merged, 'người_cập_nhật': operator };
  if (doSync) { patch['trạng_thái_đồng_bộ'] = 'pending'; patch['lỗi_đồng_bộ'] = null; }
  setRows(prev => prev.map(x => x.id === row.id ? { ...x, ...patch } : x));
  const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update(patch).eq('id', row.id);
  if (error) { alert('Lỗi lưu nhóm thông tin: ' + error.message); await fetchRows(); }
};
```
Bỏ state/ctx `fieldOptions` cũ nếu đã thêm ở rev1 (giờ import trực tiếp). InfoGroupCard không cần prop fieldOptions (dùng import module-level).

- [ ] **Step 5: Build.** `npm run build` → thành công.

- [ ] **Step 6: Commit.** `git commit -am "feat(bao-hanh): card San pham — Nhom/Ma SP phang, Chi tiet loi cascade, Linh kien cascade multi"`

---

## Task 4: ProcessingModal — 4 trường Sản phẩm

**Files:** Modify `src/pages/warranty/ProcessingModal.jsx`

- [ ] **Step 1: Import + state.**
```jsx
import fieldOptions from '../../data/caresoftFieldOptions.json';
import { /*...,*/ OPTION_FIELDS, OPTION_FIELD_KEYS, optionsFor, resolveOptionLabel } from '../../lib/warrantyProcessing';
// state:
const [optIds, setOptIds] = useState(() => {
  const tt = row['thông_tin_bổ_sung'] || {};
  return {
    'nhóm_sản_phẩm': tt['nhóm_sản_phẩm_option_id'] || '',
    'mã_sản_phẩm': tt['mã_sản_phẩm_option_id'] || '',
    'chi_tiết_lỗi': tt['chi_tiết_lỗi_option_id'] || '',
    'linh_kiện': Array.isArray(tt['linh_kiện_option_ids']) ? tt['linh_kiện_option_ids'] : [],
  };
});
```

- [ ] **Step 2: Thay 4 EditableField readOnly bằng control select/checkbox** (giống logic Task 3: Nhóm SP & Mã SP phẳng; Chi tiết lỗi cascade single; Linh kiện cascade multi). Đổi Nhóm SP → reset chi_tiết_lỗi + linh_kiện. (Tái dùng cấu trúc render của Task 3.)

- [ ] **Step 3: buildPayload ghi option_id(s) + nhãn vào `thông_tin_bổ_sung`.**
```jsx
const tin = { ...(tinOverride || tinBoSung) };
tin['nhóm_sản_phẩm_option_id'] = optIds['nhóm_sản_phẩm'] || '';
tin['mã_sản_phẩm_option_id']   = optIds['mã_sản_phẩm'] || '';
tin['chi_tiết_lỗi_option_id']  = optIds['chi_tiết_lỗi'] || '';
tin['linh_kiện_option_ids']    = optIds['linh_kiện'] || [];
for (const k of ['nhóm_sản_phẩm','mã_sản_phẩm','chi_tiết_lỗi']) { const o = tin[k+'_option_id']; if (o) tin[k] = resolveOptionLabel(fieldOptions, o) || tin[k] || ''; }
tin['linh_kiện'] = (tin['linh_kiện_option_ids']||[]).map(id => resolveOptionLabel(fieldOptions, id)).filter(Boolean).join(', ');
// ... 'thông_tin_bổ_sung': tin,
```

- [ ] **Step 4: Build.** `npm run build` → thành công.

- [ ] **Step 5: Commit.** `git commit -am "feat(bao-hanh): modal 4 truong San pham select/checkbox + luu option_id"`

---

## Task 5: n8n outbound đẩy option_id

**Files:** Modify `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`

- [ ] **Step 1: Node "Chuan bi" — thêm đẩy option.** Sau các `add(...)`:
```js
const addOpt = (id, v) => { if (v !== null && v !== undefined && String(v).trim() !== '') cf.push({ id: String(id), value: String(v) }); };
addOpt(9850, tt['nhóm_sản_phẩm_option_id']);
addOpt(9720, tt['mã_sản_phẩm_option_id']);
addOpt(9852, tt['chi_tiết_lỗi_option_id']);
const lk = Array.isArray(tt['linh_kiện_option_ids']) ? tt['linh_kiện_option_ids'].filter(Boolean) : [];
if (lk.length) cf.push({ id: '9719', value: ',' + lk.join(',') + ',' }); // multi-select dạng CS
```

- [ ] **Step 2: User import workflow vào n8n** (ghi đè outbound).

- [ ] **Step 3: Verify ticket thật.** Sửa Nhóm SP + Chi tiết lỗi + Linh kiện 1 phiếu test → Đồng bộ → kiểm CS đổi đúng. ⚠️ Nếu CS không nhận: thử định dạng value khác (single: option_id; multi: thử không dấu phẩy đầu/cuối) — sửa ở n8n. Ghi kết quả memory.

- [ ] **Step 4: Commit.** `git commit -am "feat(bao-hanh): n8n outbound day option_id 4 truong (single + multi linh kien)"`

---

## Task 6: Build + deploy-netlify

- [ ] **Step 1:** `npx vitest run src/lib/warrantyProcessing.test.js` (PASS) + `npm run build` (built).
- [ ] **Step 2:** Sync dist→deploy-netlify (PowerShell):
```powershell
Remove-Item -Recurse -Force "deploy-netlify/assets"
Copy-Item -Recurse -Force "dist/assets" "deploy-netlify/assets"
Copy-Item -Force "dist/index.html","dist/favicon.svg","dist/icons.svg","dist/_redirects" "deploy-netlify/"
```
- [ ] **Step 3: Commit.** `git commit -am "chore(bao-hanh): build + deploy-netlify (GĐ4 cascade option)"`

---

## Self-Review
- **Spec coverage:** data file (Task1✓) · helper+meta (Task2✓) · card flat/cascade/multi (Task3✓) · modal (Task4✓) · n8n option_id single+multi (Task5✓) · build/deploy (Task6✓).
- **Quyết định đã khóa:** Nhóm SP+Mã SP phẳng; Chi tiết lỗi single cascade; Linh kiện multi cascade; option "Khác"=parent null; lưu `*_option_id`/`linh_kiện_option_ids` trong `thông_tin_bổ_sung`; KHÔNG SQL.
- **Type consistency:** key lưu: `nhóm_sản_phẩm_option_id`, `mã_sản_phẩm_option_id`, `chi_tiết_lỗi_option_id`, `linh_kiện_option_ids`(mảng). Helper `optionsFor/resolveOptionLabel/parseMultiIds/joinMultiIds` + `OPTION_FIELDS` đồng nhất Task2/3/4.
- **Rủi ro:** định dạng value multi-select khi PUT CS (verify Task5.3); option chưa từng dùng nằm "Khác" (chấp nhận).
