# Đề Xuất Bảo Hành Nhiều Lần — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến chức năng "Đề xuất bảo hành" (in/tải một-lần) thành hệ thống nhiều lần có lịch sử: mỗi phiếu lưu Lần 1/Lần 2..., mỗi lần là snapshot sửa được, in/tải lại được, hủy được — giống cột "Form khai báo".

**Architecture:** Thêm cột JSON `các_lần_đề_xuất` (mảng lần, mỗi lần có `dữ_liệu` = snapshot từ `mapRowToProposal`). Cột "Đề xuất BH" đổi từ nút đơn sang ô nhiều-lần (`ProposalLanCell`) giống `KhaiBaoCell`. In/Excel dựng từ snapshot của lần (không đọc dữ liệu sống), tái dùng `WarrantyProposalPrint` + `buildProposalWorkbook`.

**Tech Stack:** React 19, Supabase (`taskDb`), `exceljs` + `file-saver`, Vitest (env node).

---

## Bối cảnh cho người thực thi (đọc trước)

- **Tab đích:** `src/pages/warranty/WarrantyProcessing.jsx` (~1370 dòng). Đã có feature đề xuất một-lần (nút "Đề xuất", state `proposalRows/proposalNow/proposalBusy`, vùng in `#wproc-print`, modal `WarrantyProposalModal`, nút hàng loạt "Đề xuất BH (N)"). Plan này **thay** phần đó bằng mô hình nhiều-lần.
- **Pattern để mô phỏng** (đang inline trong WarrantyProcessing.jsx): `LanCard` + `KhaiBaoCell` (cột "Form khai báo") và các action `persistLans/addLan/saveLan/cancelLan`. Cùng logic: cột JSON `các_lần`, thẻ mỗi lần, popover sửa, soft-delete `đã_hủy`.
- **Đã có, tái dùng:**
  - `src/lib/warrantyProposalMap.js` → `mapRowToProposal(row, currentUser, now)` trả object `{maPhieu, khachHang, sdt, diaChi, maDonHang, ngayLap, maSP, tinhTrang, linhKienList, nguoiPhuTrach, ngayText}`.
  - `src/components/WarrantyProposalPrint.jsx` → default, props `{ p }` (p = object trên).
  - `src/lib/warrantyProposalExcel.js` → `buildProposalWorkbook(templateBuffer, proposals)` (proposals = mảng object như trên), `downloadProposalExcel(rows, user, now)`.
  - `src/pages/warranty/WarrantyProposalModal.jsx` → hiện nhận `{rows, currentUser, now, busy, onPrint, onExcel, onClose}`.
- **Vitest:** env node, `npx vitest run`. Test lib bằng cách import trực tiếp.
- **Deploy:** sau khi code xong `npm run build` + copy `dist` → `deploy-netlify/` (xem plan trước).

---

## Task 1: SQL thêm cột `các_lần_đề_xuất`

**Files:**
- Create: `sql/add_cac_lan_de_xuat.sql`

- [ ] **Step 1: Tạo file SQL**

```sql
-- ============================================================
-- Đề xuất bảo hành NHIỀU LẦN: cột "các_lần_đề_xuất" (JSONB) trên xu_ly_phieu_bao_hanh.
-- Mỗi phần tử = 1 lần đề xuất: { lần, thời_điểm_tạo, người_tạo, đã_hủy, dữ_liệu:{...snapshot} }.
-- App làm chủ hoàn toàn (không đẩy CS, trigger mirror KHÔNG đụng). Chạy trong Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "các_lần_đề_xuất" JSONB DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Commit** (kèm nhắc người dùng chạy tay)

```bash
git add sql/add_cac_lan_de_xuat.sql
git commit -m "sql(bao-hanh): thêm cột các_lần_đề_xuất cho đề xuất nhiều lần"
```

> ⚠️ Người dùng phải chạy câu SQL này trong Supabase SQL Editor trước khi feature hoạt động (giống các cột JSON khác). Ghi rõ ở bước bàn giao.

---

## Task 2: Data-model helpers `warrantyProposalLan.js` (+ test)

**Files:**
- Create: `src/lib/warrantyProposalLan.js`
- Test: `src/lib/warrantyProposalLan.test.js`

- [ ] **Step 1: Viết test trước**

```js
// src/lib/warrantyProposalLan.test.js
import { test, expect, describe } from 'vitest';
import { getEffectiveProposalLan, nextProposalLanNo, buildProposalSnapshot } from './warrantyProposalLan';

const NOW = new Date('2026-07-06T10:00:00Z');

describe('getEffectiveProposalLan', () => {
  test('không có cột -> []', () => expect(getEffectiveProposalLan({})).toEqual([]));
  test('row null -> []', () => expect(getEffectiveProposalLan(null)).toEqual([]));
  test('trả mảng, đảm bảo có số lần', () => {
    const r = { 'các_lần_đề_xuất': [{ 'dữ_liệu': {} }, { 'lần': 5, 'dữ_liệu': {} }] };
    const out = getEffectiveProposalLan(r);
    expect(out[0]['lần']).toBe(1);
    expect(out[1]['lần']).toBe(5);
  });
});

describe('nextProposalLanNo', () => {
  test('rỗng -> 1', () => expect(nextProposalLanNo([])).toBe(1));
  test('max+1', () => expect(nextProposalLanNo([{ 'lần': 1 }, { 'lần': 3 }])).toBe(4));
});

describe('buildProposalSnapshot', () => {
  test('đủ khóa + đã_hủy false + dữ_liệu là proposal (chưa gán số lần)', () => {
    const row = { 'phiếu_ghi': 'PBH-1', 'mã_sản_phẩm': 'RO-9', 'linh_kiện': 'Bơm, Van' };
    const snap = buildProposalSnapshot(row, { name: 'KTV A' }, NOW);
    expect(snap['đã_hủy']).toBe(false);
    expect(snap['người_tạo']).toBe('KTV A');
    expect(snap['thời_điểm_tạo']).toBe(NOW.toISOString());
    expect(snap['lần']).toBeUndefined();
    expect(snap['dữ_liệu'].maPhieu).toBe('PBH-1');
    expect(snap['dữ_liệu'].maSP).toBe('RO-9');
    expect(snap['dữ_liệu'].linhKienList).toEqual(['Bơm', 'Van']);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL** (module chưa có)

Run: `npx vitest run src/lib/warrantyProposalLan.test.js`
Expected: FAIL `Failed to resolve import './warrantyProposalLan'`.

- [ ] **Step 3: Viết implementation**

```js
// src/lib/warrantyProposalLan.js
// Data-model cho "đề xuất bảo hành nhiều lần" — cột các_lần_đề_xuất trên xu_ly_phieu_bao_hanh.
// Mỗi lần: { lần, thời_điểm_tạo, người_tạo, đã_hủy, dữ_liệu: <object từ mapRowToProposal> }.
import { mapRowToProposal } from './warrantyProposalMap';

// Danh sách lần đề xuất hiệu lực của 1 phiếu (đảm bảo mỗi lần có số 'lần'). Không có → [].
export function getEffectiveProposalLan(row) {
  const arr = Array.isArray(row && row['các_lần_đề_xuất']) ? row['các_lần_đề_xuất'] : [];
  return arr.map((l, i) => ({ ...l, 'lần': l['lần'] || i + 1 }));
}

// Số lần kế tiếp = max(lần)+1 (rỗng → 1).
export function nextProposalLanNo(lans) {
  return (Array.isArray(lans) ? lans : []).reduce((m, l) => Math.max(m, l['lần'] || 0), 0) + 1;
}

// Dựng 1 lần MỚI (chưa gán số 'lần' — caller gán bằng nextProposalLanNo): snapshot nội dung phiếu.
export function buildProposalSnapshot(row, currentUser, now = new Date()) {
  const operator = currentUser ? (currentUser.name || currentUser.id || '') : '';
  return {
    'thời_điểm_tạo': now.toISOString(),
    'người_tạo': String(operator || ''),
    'đã_hủy': false,
    'dữ_liệu': mapRowToProposal(row, currentUser, now),
  };
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run src/lib/warrantyProposalLan.test.js`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/warrantyProposalLan.js src/lib/warrantyProposalLan.test.js
git commit -m "feat(bao-hanh): data-model lần đề xuất (snapshot/đánh số) + test"
```

---

## Task 3: `warrantyProposalExcel.js` — hàm `downloadProposals` (tải từ mảng snapshot)

Tách phần tải Excel để nhận thẳng mảng proposal (snapshot của lần), thay vì chỉ nhận rows.

**Files:**
- Modify: `src/lib/warrantyProposalExcel.js`

- [ ] **Step 1: Thay `downloadProposalExcel` bằng `downloadProposals`** — mở `src/lib/warrantyProposalExcel.js`, tìm khối:

```js
// Dùng ở trình duyệt: fetch mẫu → map dòng → dựng workbook → tải file.
export async function downloadProposalExcel(rows, currentUser, now = new Date()) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu: HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const proposals = rows.map((r) => mapRowToProposal(r, currentUser, now));
  const wb = await buildProposalWorkbook(buf, proposals);
  const out = await wb.xlsx.writeBuffer();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fname = proposals.length === 1
    ? `PhieuDeXuatBH_${(proposals[0].maPhieu || 'phieu').replace(/[^\w-]/g, '_')}.xlsx`
    : `PhieuDeXuatBH_${proposals.length}phieu_${stamp}.xlsx`;
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
}
```

thay bằng:

```js
// Dùng ở trình duyệt: nhận thẳng mảng proposal (snapshot dữ_liệu của lần) → dựng workbook theo mẫu → tải file.
export async function downloadProposals(proposals, now = new Date()) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu: HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const wb = await buildProposalWorkbook(buf, proposals);
  const out = await wb.xlsx.writeBuffer();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fname = proposals.length === 1
    ? `PhieuDeXuatBH_${(proposals[0].maPhieu || 'phieu').replace(/[^\w-]/g, '_')}.xlsx`
    : `PhieuDeXuatBH_${proposals.length}phieu_${stamp}.xlsx`;
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
}
```

- [ ] **Step 2: Bỏ import không dùng** — đầu file có `import { mapRowToProposal } from './warrantyProposalMap';`. Vì `downloadProposals` không dùng `mapRowToProposal` nữa, **xóa dòng import đó**.

- [ ] **Step 3: Lint + test**

Run: `npx eslint src/lib/warrantyProposalExcel.js && npx vitest run src/lib/warrantyProposalExcel.test.js`
Expected: eslint sạch (không còn `mapRowToProposal` unused); test buildProposalWorkbook vẫn PASS (không đụng).

- [ ] **Step 4: Commit**

```bash
git add src/lib/warrantyProposalExcel.js
git commit -m "refactor(bao-hanh): downloadProposals nhận mảng snapshot (thay downloadProposalExcel)"
```

---

## Task 4: `WarrantyProposalModal.jsx` — nhận `proposals` (snapshot) thay vì rows

**Files:**
- Modify: `src/pages/warranty/WarrantyProposalModal.jsx`

- [ ] **Step 1: Thay toàn bộ nội dung file** bằng (chỉ đổi: nhận `proposals` trực tiếp, bỏ map từ rows):

```jsx
import React from 'react';
import { Printer, Download, X } from 'lucide-react';

// Modal chọn cách xuất phiếu đề xuất BH cho 1 hoặc nhiều LẦN (dùng cho hàng loạt).
// Nhận thẳng mảng proposal (snapshot dữ_liệu của lần). Overlay có class "no-print" để ẩn khi in.
export default function WarrantyProposalModal({ proposals, busy, onPrint, onExcel, onClose }) {
  if (!proposals || proposals.length === 0) return null;
  const btn = (bg, disabled) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1rem', border: 'none',
    borderRadius: 8, background: bg, color: '#fff', fontWeight: 700, fontSize: '0.9rem',
    cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.6 : 1,
  });
  return (
    <div className="no-print" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="modal-card"
        style={{ background: '#fff', borderRadius: 14, width: 'min(560px, 96vw)', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', padding: '1.1rem 1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Đề xuất bảo hành ({proposals.length})</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>Đã tạo lần đề xuất cho các phiếu dưới đây. Chọn In hoặc Tải Excel.</div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          {proposals.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '0.5rem 0.7rem', fontSize: '0.82rem', borderBottom: i < proposals.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 ? '#f8fafc' : '#fff' }}>
              <span style={{ fontWeight: 700, color: '#1e293b', minWidth: 90 }}>{p.maPhieu || '—'}</span>
              <span style={{ color: '#475569', flex: 1 }}>{p.khachHang || '—'} · {p.maSP || '—'}{p.linhKienList && p.linhKienList.length ? ` · ${p.linhKienList.length} LK` : ''}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={onPrint} style={btn('#4f46e5', busy)}><Printer size={16} /> In / Tạo PDF</button>
          <button disabled={busy} onClick={onExcel} style={btn('#10b981', busy)}><Download size={16} /> {busy ? 'Đang tạo...' : 'Tải Excel'}</button>
          <button disabled={busy} onClick={onClose} style={{ padding: '0.6rem 1rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/pages/warranty/WarrantyProposalModal.jsx`
Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add src/pages/warranty/WarrantyProposalModal.jsx
git commit -m "refactor(bao-hanh): modal đề xuất nhận proposals (snapshot) cho hàng loạt"
```

---

## Task 5: Component `WarrantyProposalLanCell.jsx` (ô nhiều-lần + thẻ + popover sửa)

Mô phỏng `LanCard`/`KhaiBaoCell`. Ô hiển thị các thẻ lần + "+ Thêm lần"; bấm thẻ → popover sửa `dữ_liệu` + In/Tải/Hủy.

**Files:**
- Create: `src/pages/warranty/WarrantyProposalLanCell.jsx`

- [ ] **Step 1: Tạo file**

```jsx
import React, { useState } from 'react';
import { FileText, Printer, Download } from 'lucide-react';
import { getEffectiveProposalLan } from '../../lib/warrantyProposalLan';

// Các ô sửa của 1 lần đề xuất (map vào dữ_liệu). linh_kiện nhập bằng text ngăn dấu phẩy.
const FIELDS = [
  ['khachHang', 'Bên nhận bảo hành'], ['sdt', 'Số điện thoại'], ['diaChi', 'Địa chỉ'],
  ['maDonHang', 'Mã đơn hàng'], ['ngayLap', 'Ngày giao (Lắp đặt)'], ['maSP', 'Sản phẩm'],
  ['tinhTrang', 'Tình trạng'], ['linhKienText', 'Linh kiện (cách nhau dấu phẩy)'], ['nguoiPhuTrach', 'Người phụ trách'],
];
const fmtNgayTao = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

// 1 thẻ lần: hiển thị "Lần N · ngày", bấm → popover sửa dữ_liệu + In / Tải / Hủy.
function ProposalLanCard({ row, lan, perm, onSave, onCancel, onPrint, onExcel }) {
  const [open, setOpen] = useState(null); // { top, left, maxH }
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const huy = !!lan['đã_hủy'];
  const dl = lan['dữ_liệu'] || {};

  const openPop = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const d = {};
    FIELDS.forEach(([k]) => {
      if (k === 'linhKienText') d[k] = (Array.isArray(dl.linhKienList) ? dl.linhKienList : []).join(', ');
      else d[k] = dl[k] || '';
    });
    setDraft(d);
    const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 380));
    setOpen({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), maxH: window.innerHeight - top - 12 });
  };
  const close = () => setOpen(null);
  // Gộp draft (text) về dạng dữ_liệu (linhKienList tách từ text).
  const draftToDuLieu = () => {
    const nd = { ...dl };
    FIELDS.forEach(([k]) => { if (k !== 'linhKienText') nd[k] = draft[k] ?? ''; });
    nd.linhKienList = String(draft['linhKienText'] || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    return nd;
  };
  const save = async () => { setBusy(true); try { await onSave(row, lan, draftToDuLieu()); close(); } finally { setBusy(false); } };
  const printOne = () => onPrint(dl);
  const excelOne = async () => { setBusy(true); try { await onExcel(dl); } finally { setBusy(false); } };
  const doCancel = async (huyVal) => {
    if (huyVal && !window.confirm(`Hủy lần ${lan['lần']}? (làm mờ + đánh dấu Đã Hủy, không xóa)`)) return;
    setBusy(true); try { await onCancel(row, lan, huyVal); close(); } finally { setBusy(false); }
  };

  return (
    <div style={{ flex: '0 0 auto' }}>
      <div onClick={openPop} className="wf-card" title={huy ? 'Lần đã hủy — bấm để xem / bỏ hủy' : 'Bấm để sửa / in / tải'}
        style={{ cursor: 'pointer', width: 150, minHeight: 90, boxSizing: 'border-box', padding: '7px 9px', borderRadius: '10px', border: `1px solid ${huy ? '#cbd5e1' : '#c7d2fe'}`, background: huy ? '#f1f5f9' : '#eef2ff', opacity: huy ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.66rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: huy ? '#64748b' : '#4338ca', textDecoration: huy ? 'line-through' : 'none' }}>Lần {lan['lần']}{huy ? ' · Đã Hủy' : ''}</div>
        <div style={{ color: '#64748b' }}>{fmtNgayTao(lan['thời_điểm_tạo'])}</div>
        {lan['người_tạo'] && <div style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lan['người_tạo']}</div>}
        {!huy && (
          <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
            <button onClick={(e) => { e.stopPropagation(); printOne(); }} title="In / Tạo PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, fontSize: '0.6rem' }}><Printer size={11} /> In</button>
            <button disabled={busy} onClick={(e) => { e.stopPropagation(); excelOne(); }} title="Tải Excel" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, border: '1px solid #6ee7b7', background: '#fff', color: '#047857', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.6rem' }}><Download size={11} /> Excel</button>
          </div>
        )}
      </div>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: open.top, left: open.left, zIndex: 1001, width: 320, maxHeight: open.maxH, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '0.85rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.6rem' }}>Lần {lan['lần']} — nội dung phiếu{huy ? ' (Đã Hủy)' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {FIELDS.map(([k, label]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>{label}</label>
                  <input value={draft[k] ?? ''} disabled={!perm.edit || huy}
                    onChange={(e) => { const v = e.target.value; setDraft(d => ({ ...d, [k]: v })); }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '7px', padding: '0.4rem 0.5rem', fontSize: '0.84rem', outline: 'none', background: huy ? '#f8fafc' : '#fff' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
              {perm.edit && !huy && <button disabled={busy} onClick={save} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Lưu</button>}
              {!huy && <button onClick={printOne} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>In / PDF</button>}
              {!huy && <button disabled={busy} onClick={excelOne} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#047857', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Tải Excel</button>}
              <button disabled={busy} onClick={close} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Đóng</button>
              {perm.edit && (huy
                ? <button disabled={busy} onClick={() => doCancel(false)} style={{ marginLeft: 'auto', padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#047857', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Bỏ hủy</button>
                : <button disabled={busy} onClick={() => doCancel(true)} style={{ marginLeft: 'auto', padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Hủy lần</button>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ô cột "Đề xuất BH": hàng ngang các thẻ lần + thẻ "+ Thêm lần".
export default function ProposalLanCell({ row, perm, onAddLan, onSaveLan, onCancelLan, onPrint, onExcel }) {
  const [busy, setBusy] = useState(false);
  const lans = getEffectiveProposalLan(row);
  const add = async (e) => { e.stopPropagation(); setBusy(true); try { await onAddLan(row); } finally { setBusy(false); } };
  if (lans.length === 0 && !perm.edit) return <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
      {lans.map((lan) => (
        <ProposalLanCard key={String(lan['lần'])} row={row} lan={lan} perm={perm}
          onSave={onSaveLan} onCancel={onCancelLan} onPrint={onPrint} onExcel={onExcel} />
      ))}
      {perm.edit && (
        <button disabled={busy} onClick={add} className="wf-card"
          style={{ flex: '0 0 auto', width: 92, minHeight: 90, borderRadius: '10px', border: '1px dashed #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <FileText size={14} /> {busy ? '...' : '+ Thêm lần'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/pages/warranty/WarrantyProposalLanCell.jsx`
Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add src/pages/warranty/WarrantyProposalLanCell.jsx
git commit -m "feat(bao-hanh): ô nhiều-lần đề xuất (thẻ lần + popover sửa + in/tải/hủy)"
```

---

## Task 6: Ghép vào `WarrantyProcessing.jsx`

Đổi cột `de_xuat_bh` sang `ProposalLanCell`; thêm actions lần đề xuất; đổi vùng in sang snapshot; đổi hàng loạt sang tạo-lần-rồi-mở-modal.

**Files:**
- Modify: `src/pages/warranty/WarrantyProcessing.jsx`

**READ trước** file để định vị chính xác từng anchor rồi dùng Edit.

- [ ] **Step 1: Sửa import** — hiện có (khoảng đầu file):
```jsx
import WarrantyProposalModal from './WarrantyProposalModal';
import WarrantyProposalPrint from '../../components/WarrantyProposalPrint';
import { mapRowToProposal } from '../../lib/warrantyProposalMap';
import { downloadProposalExcel } from '../../lib/warrantyProposalExcel';
import { FileText } from 'lucide-react';
```
thay bằng:
```jsx
import WarrantyProposalModal from './WarrantyProposalModal';
import WarrantyProposalPrint from '../../components/WarrantyProposalPrint';
import ProposalLanCell from './WarrantyProposalLanCell';
import { getEffectiveProposalLan, nextProposalLanNo, buildProposalSnapshot } from '../../lib/warrantyProposalLan';
import { downloadProposals } from '../../lib/warrantyProposalExcel';
import { FileText } from 'lucide-react';
```
(Bỏ `mapRowToProposal` & `downloadProposalExcel` — không dùng nữa; thêm ProposalLanCell + helpers lần + downloadProposals.)

- [ ] **Step 2: Đổi cột `de_xuat_bh`** — tìm khối:
```jsx
  {
    key: 'de_xuat_bh', label: 'Đề xuất BH', render: (r, ctx) => (
      <button
        onClick={(e) => { e.stopPropagation(); ctx.onProposal([r]); }}
        title="Tạo phiếu đề xuất bảo hành"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
      >
        <FileText size={12} /> Đề xuất
      </button>
    )
  },
```
thay bằng:
```jsx
  {
    key: 'de_xuat_bh', label: 'Đề xuất BH', render: (r, ctx) => (
      <ProposalLanCell row={r} perm={ctx.perm}
        onAddLan={ctx.onAddProposalLan} onSaveLan={ctx.onSaveProposalLan} onCancelLan={ctx.onCancelProposalLan}
        onPrint={ctx.onPrintProposal} onExcel={ctx.onExcelProposal} />
    )
  },
```

- [ ] **Step 3: Đổi state** — tìm:
```jsx
  const [proposalRows, setProposalRows] = useState(null); // dòng đang tạo phiếu đề xuất (null = đóng)
  const [proposalNow, setProposalNow] = useState(null);   // mốc thời gian tạo (snapshot)
  const [proposalBusy, setProposalBusy] = useState(false);
```
thay bằng:
```jsx
  const [printingProposals, setPrintingProposals] = useState(null); // mảng snapshot dữ_liệu để IN (#wproc-print)
  const [batchProposals, setBatchProposals] = useState(null);       // snapshot cho modal hàng loạt (null = đóng)
  const [proposalBusy, setProposalBusy] = useState(false);
```

- [ ] **Step 4: Đổi handlers** — tìm khối (từ comment "Mở modal tạo phiếu đề xuất BH" tới dòng `const selectedRows = ...`):
```jsx
  // Mở modal tạo phiếu đề xuất BH (1 hoặc nhiều dòng). Chốt mốc thời gian tạo tại đây (snapshot).
  const openProposal = (rowsArg) => {
    const list = (rowsArg || []).filter(Boolean);
    if (list.length === 0) { alert('Vui lòng chọn ít nhất 1 phiếu để tạo đề xuất!'); return; }
    setProposalNow(new Date());
    setProposalRows(list);
  };
  const closeProposal = () => { if (!proposalBusy) { setProposalRows(null); setProposalNow(null); } };
  // In/PDF: vùng #wproc-print đã render sẵn theo proposalRows → chỉ cần gọi in.
  const printProposal = () => { setTimeout(() => window.print(), 60); };
  // Tải Excel theo mẫu.
  const excelProposal = async () => {
    setProposalBusy(true);
    try {
      await downloadProposalExcel(proposalRows, user, proposalNow || new Date());
      setProposalRows(null); setProposalNow(null);
    } catch (e) {
      alert('Lỗi tạo Excel: ' + (e?.message || e));
    } finally {
      setProposalBusy(false);
    }
  };
  // Danh sách phiếu đã tick (theo filtered) — cho nút hàng loạt.
  const selectedRows = filtered.filter(r => selectedIds.has(r.id));
```
thay bằng:
```jsx
  // ── Đề xuất bảo hành NHIỀU LẦN ──
  // Ghi cột các_lần_đề_xuất (lạc quan + DB).
  const persistProposalLans = async (row, newLans) => {
    const operator = (user && (user.name || user.id)) || '';
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, 'các_lần_đề_xuất': newLans, 'người_cập_nhật': operator } : x));
    const { error } = await taskDb.from('xu_ly_phieu_bao_hanh').update({ 'các_lần_đề_xuất': newLans, 'người_cập_nhật': operator }).eq('id', row.id);
    if (error) { alert('Lỗi lưu lần đề xuất: ' + error.message); await fetchRows(); }
  };
  // Thêm 1 lần đề xuất mới (snapshot nội dung phiếu hiện tại). Trả về snapshot vừa tạo.
  const addProposalLan = async (row) => {
    const lans = getEffectiveProposalLan(row);
    const snap = { ...buildProposalSnapshot(row, user, new Date()), 'lần': nextProposalLanNo(lans) };
    await persistProposalLans(row, [...lans, snap]);
    return snap;
  };
  // Lưu sửa nội dung 1 lần (draft = dữ_liệu mới).
  const saveProposalLan = async (row, lan, duLieu) => {
    const lans = getEffectiveProposalLan(row).map(l => l['lần'] === lan['lần'] ? { ...l, 'dữ_liệu': duLieu } : l);
    await persistProposalLans(row, lans);
  };
  // Hủy / bỏ hủy 1 lần (soft-delete).
  const cancelProposalLan = async (row, lan, huy) => {
    const lans = getEffectiveProposalLan(row).map(l => l['lần'] === lan['lần'] ? { ...l, 'đã_hủy': !!huy } : l);
    await persistProposalLans(row, lans);
  };
  // In 1 hoặc nhiều snapshot: render vùng #wproc-print rồi gọi in.
  const printProposals = (proposals) => { setPrintingProposals(proposals); setTimeout(() => window.print(), 80); };
  // Tải Excel 1 hoặc nhiều snapshot.
  const excelProposals = async (proposals) => {
    setProposalBusy(true);
    try { await downloadProposals(proposals, new Date()); }
    catch (e) { alert('Lỗi tạo Excel: ' + (e?.message || e)); }
    finally { setProposalBusy(false); }
  };
  // Hàng loạt: tạo 1 lần đề xuất trên MỖI phiếu đã tick, rồi mở modal in/tải gộp các snapshot vừa tạo.
  const bulkAddProposalLan = async () => {
    const list = filtered.filter(r => selectedIds.has(r.id));
    if (list.length === 0) { alert('Vui lòng tick chọn ít nhất 1 phiếu!'); return; }
    if (!perm.edit) { alert('Bạn không có quyền tạo lần đề xuất.'); return; }
    const now = new Date();
    const snaps = [];
    for (const row of list) {
      const lans = getEffectiveProposalLan(row);
      const snap = { ...buildProposalSnapshot(row, user, now), 'lần': nextProposalLanNo(lans) };
      await persistProposalLans(row, [...lans, snap]);
      snaps.push(snap['dữ_liệu']);
    }
    setBatchProposals(snaps);
  };
```

- [ ] **Step 5: Truyền handlers vào ctx render cột** — tìm:
```jsx
                      {c.render(r, { perm, onCompleteSync: completeStepAndSync, onQuickSync: quickSync, onSaveGroup: saveInfoGroup, onSaveLan: saveLan, onSendLan: sendLan, onAddLan: addLan, onCancelLan: cancelLan, khaiBaoExt, onProposal: openProposal })}
```
thay bằng:
```jsx
                      {c.render(r, { perm, onCompleteSync: completeStepAndSync, onQuickSync: quickSync, onSaveGroup: saveInfoGroup, onSaveLan: saveLan, onSendLan: sendLan, onAddLan: addLan, onCancelLan: cancelLan, khaiBaoExt, onAddProposalLan: addProposalLan, onSaveProposalLan: saveProposalLan, onCancelProposalLan: cancelProposalLan, onPrintProposal: (dl) => printProposals([dl]), onExcelProposal: (dl) => excelProposals([dl]) })}
```

- [ ] **Step 6: Đổi nút hàng loạt** — tìm:
```jsx
        {/* Tạo phiếu đề xuất BH cho các phiếu đã tick (hàng loạt) */}
        <button
          onClick={() => openProposal(selectedRows)}
          disabled={selectedIds.size === 0}
          title={selectedIds.size === 0 ? 'Tick chọn phiếu để tạo đề xuất' : 'Tạo phiếu đề xuất BH cho các phiếu đã chọn'}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: 'none', borderRadius: '8px', background: selectedIds.size === 0 ? '#cbd5e1' : '#4f46e5', color: '#fff', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          <FileText size={15} /> Đề xuất BH{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
```
thay bằng (đổi onClick + title):
```jsx
        {/* Hàng loạt: tạo 1 lần đề xuất trên mỗi phiếu đã tick rồi in/tải gộp */}
        <button
          onClick={bulkAddProposalLan}
          disabled={selectedIds.size === 0}
          title={selectedIds.size === 0 ? 'Tick chọn phiếu để tạo đề xuất' : 'Tạo lần đề xuất cho các phiếu đã chọn'}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', border: 'none', borderRadius: '8px', background: selectedIds.size === 0 ? '#cbd5e1' : '#4f46e5', color: '#fff', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 600 }}
        >
          <FileText size={15} /> Đề xuất BH{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
```

- [ ] **Step 7: Đổi vùng in + modal** — tìm khối (từ comment "Vùng in" tới đóng WarrantyProposalModal):
```jsx
      {/* Vùng in (ẩn ngoài màn hình lúc xem; hiện khi in). Mỗi phiếu 1 trang. */}
      {proposalRows && (
        <div id="wproc-print" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', background: '#fff' }}>
          {proposalRows.map((r, i) => (
            <div key={r.id ?? i} style={{ padding: '6mm 4mm', pageBreakAfter: i < proposalRows.length - 1 ? 'always' : 'auto' }}>
              <WarrantyProposalPrint p={mapRowToProposal(r, user, proposalNow || undefined)} />
            </div>
          ))}
        </div>
      )}

      {proposalRows && (
        <WarrantyProposalModal
          rows={proposalRows} currentUser={user} now={proposalNow || undefined} busy={proposalBusy}
          onPrint={printProposal} onExcel={excelProposal} onClose={closeProposal}
        />
      )}
```
thay bằng:
```jsx
      {/* Vùng in (ẩn ngoài màn hình lúc xem; hiện khi in). Render thẳng snapshot của lần. Mỗi phiếu 1 trang. */}
      {printingProposals && (
        <div id="wproc-print" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', background: '#fff' }}>
          {printingProposals.map((p, i) => (
            <div key={i} style={{ padding: '6mm 4mm', pageBreakAfter: i < printingProposals.length - 1 ? 'always' : 'auto' }}>
              <WarrantyProposalPrint p={p} />
            </div>
          ))}
        </div>
      )}

      {batchProposals && (
        <WarrantyProposalModal
          proposals={batchProposals} busy={proposalBusy}
          onPrint={() => printProposals(batchProposals)} onExcel={() => excelProposals(batchProposals)}
          onClose={() => { if (!proposalBusy) setBatchProposals(null); }}
        />
      )}
```

- [ ] **Step 8: Lint + test toàn bộ + build**

Run:
```bash
npx eslint src/pages/warranty/WarrantyProcessing.jsx src/pages/warranty/WarrantyProposalLanCell.jsx src/pages/warranty/WarrantyProposalModal.jsx src/lib/warrantyProposalLan.js src/lib/warrantyProposalExcel.js && npx vitest run && npx vite build
```
Expected: eslint sạch; tất cả test PASS; build xanh. Nếu eslint báo biến/không dùng (vd `mapRowToProposal`, `WarrantyProposalPrint` nếu lỡ) → sửa. `WarrantyProposalPrint` VẪN dùng (trong #wproc-print) nên giữ import.

- [ ] **Step 9: Commit**

```bash
git add src/pages/warranty/WarrantyProcessing.jsx
git commit -m "feat(bao-hanh): cột đề xuất nhiều lần (thêm/sửa/hủy lần, in/tải từ snapshot, hàng loạt)"
```

---

## Task 7: Verify trong preview

**Files:** không sửa.

- [ ] **Step 1: Chạy SQL cột mới** (tự làm được qua PostgREST anon? KHÔNG — DDL cần quyền). Ghi chú: nếu cột chưa có, thao tác lưu lần sẽ lỗi. Với verify preview KHÔNG cần DB thật — mount component với row giả.

- [ ] **Step 2: Build + start preview**

Run `npx vite build` (đảm bảo không lỗi). `preview_start` "qlsx-dev".

- [ ] **Step 3: Verify data-model + Excel qua module graph** (không cần đăng nhập) — `preview_eval`:
```js
(async () => {
  const [Lan, Excel] = await Promise.all([
    import('/src/lib/warrantyProposalLan.js?t=' + Date.now()),
    import('/src/lib/warrantyProposalExcel.js?t=' + Date.now()),
  ]);
  const row = { 'phiếu_ghi': 'PBH-9', 'mã_sản_phẩm': 'RO-X', 'linh_kiện': 'Bơm, Van', 'thông_tin_bổ_sung': { 'tình_trạng': 'Không lạnh', 'mã_đơn_hàng': 'DH-1' }, 'phiếu_gốc_json': { 'tên_người_yêu_cầu': 'KH A' } };
  const snap = { ...Lan.buildProposalSnapshot(row, { name: 'KTV' }, new Date()), 'lần': Lan.nextProposalLanNo([]) };
  const buf = await (await fetch('/mau-de-xuat-bao-hanh.xlsx')).arrayBuffer();
  const wb = await Excel.buildProposalWorkbook(buf, [snap['dữ_liệu']]);
  const out = await wb.xlsx.writeBuffer();
  return JSON.stringify({ lan: snap['lần'], tinhTrang: snap['dữ_liệu'].tinhTrang, maDH: snap['dữ_liệu'].maDonHang, sheets: wb.worksheets.length, bytes: out.byteLength });
})()
```
Expected: `lan:1`, tinhTrang "Không lạnh", maDH "DH-1", sheets 1, bytes > 0.

- [ ] **Step 4: Verify UI `ProposalLanCell`** — mount với row có sẵn `các_lần_đề_xuất`, kiểm tra thẻ "Lần 1" + nút "+ Thêm lần" + popover mở khi bấm. `preview_eval` mount `ProposalLanCell` (perm `{edit:true, view:true}`), snapshot DOM: có text "Lần 1", "+ Thêm lần". Bấm thẻ → có input "Bên nhận bảo hành".

- [ ] **Step 5: Chụp màn hình** `preview_screenshot` ô nhiều-lần (mount) làm bằng chứng. Dừng preview.

- [ ] **Step 6: Không commit** (chỉ verify). Sửa lỗi nếu có rồi commit theo nội dung.

---

## Task 8: Cập nhật bundle deploy-netlify

**Files:**
- Modify: `deploy-netlify/**`

- [ ] **Step 1: Build**: `npm run build` (xanh).
- [ ] **Step 2: Đồng bộ**: `rm -rf deploy-netlify/assets && cp -r dist/* deploy-netlify/` (giữ HUONG-DAN-DEPLOY.txt).
- [ ] **Step 3: Commit**:
```bash
git add deploy-netlify
git commit -m "chore(deploy): cập nhật bundle (đề xuất bảo hành nhiều lần)"
```
- [ ] **Step 4: Nhắc người dùng**: (a) chạy `sql/add_cac_lan_de_xuat.sql` trong Supabase; (b) kéo-thả `deploy-netlify/` để deploy.

---

## Self-Review (đã rà)

**1. Spec coverage:**
- Cột `các_lần_đề_xuất` → Task 1 (SQL) + Task 2 (helpers). ✅
- Snapshot mỗi lần (`dữ_liệu` = mapRowToProposal) → Task 2 `buildProposalSnapshot`. ✅
- Ô nhiều-lần giống Form khai báo → Task 5 `ProposalLanCell`/`ProposalLanCard`; Task 6 đổi cột. ✅
- Thêm/Sửa/Hủy lần → Task 6 `addProposalLan/saveProposalLan/cancelProposalLan`. ✅
- In/Tải từ snapshot (không đọc dữ liệu sống) → Task 6 `printProposals/excelProposals` từ `dữ_liệu`; vùng in render snapshot. ✅
- Hàng loạt tạo lần trên mỗi phiếu → Task 6 `bulkAddProposalLan` + modal. ✅
- Quyền: thêm/sửa/hủy = perm.edit; in/tải = perm.view → ProposalLanCell gate `+ Thêm lần`/Lưu/Hủy theo perm.edit; nút In/Excel luôn hiện. ✅
- Tái dùng Print/Excel/mapRowToProposal → Task 3 `downloadProposals`, giữ `WarrantyProposalPrint`, `buildProposalWorkbook`. ✅

**2. Placeholder scan:** không có TBD/TODO; mọi step có code đầy đủ. ✅

**3. Type consistency:** lần object `{lần, thời_điểm_tạo, người_tạo, đã_hủy, dữ_liệu}` nhất quán giữa Task 2/5/6. Hàm: `getEffectiveProposalLan`, `nextProposalLanNo`, `buildProposalSnapshot`, `downloadProposals(proposals, now)`, `buildProposalWorkbook(buf, proposals)` — khớp giữa các task. ctx handlers: `onAddProposalLan/onSaveProposalLan/onCancelProposalLan/onPrintProposal/onExcelProposal` khớp giữa Task 6 Step 2 (dùng) và Step 5 (cấp). ✅

**4. Ambiguity:** linh kiện sửa dạng text ngăn dấu phẩy → tách `linhKienList` khi Lưu (Task 5 `draftToDuLieu`). In/Tải per-lần dùng đúng `dữ_liệu` của lần (đã snapshot). ✅
