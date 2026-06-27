# Cập nhật thông tin ĐLĐ/Khách hàng & đồng bộ ngược Caresoft — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhân viên nhập/sửa 6 trường thông tin (ĐLĐ + khách hàng) trên modal Xử Lý Phiếu rồi bấm Đồng bộ để ghi ngược về custom_fields + requester của ticket Caresoft.

**Architecture:** App lưu 6 trường vào 1 cột JSONB `thông_tin_bổ_sung` (Part B, app làm chủ); modal prefill từ cột này → `phiếu_gốc_json`. Cơ chế đồng bộ giữ nguyên (cờ `pending` → Supabase Database Webhook → n8n). n8n outbound build custom_fields (bỏ ô trống), tạo/cập nhật contact khách hàng + gán requester_id, PUT ticket, rồi ACK trạng thái về Supabase.

**Tech Stack:** React (Vite), Supabase (PostgREST + Database Webhooks), vitest, n8n, Caresoft REST API v1.

**Spec:** `docs/superpowers/specs/2026-06-27-cap-nhat-thong-tin-cs-bao-hanh-design.md`

---

## File Structure

- `sql/setup_xu_ly_phieu_bao_hanh.sql` — thêm `ALTER TABLE ... ADD COLUMN thông_tin_bổ_sung` (chạy tay trong Supabase).
- `src/lib/warrantyProcessing.js` — thêm `THONG_TIN_BO_SUNG_KEYS` + helper `getThongTinBoSung(row)`.
- `src/lib/warrantyProcessing.test.js` — test cho helper.
- `src/pages/warranty/ProcessingModal.jsx` — mục UI "Thông tin Caresoft" + state + payload.
- `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json` — viết lại workflow outbound đầy đủ (contact + custom_fields + ACK).

---

## Task 1: DB — thêm cột JSONB `thông_tin_bổ_sung`

**Files:**
- Modify: `sql/setup_xu_ly_phieu_bao_hanh.sql` (chèn sau khối `CREATE TABLE`, trước `CREATE INDEX`)

- [ ] **Step 1: Thêm câu ALTER vào file SQL**

Chèn vào `sql/setup_xu_ly_phieu_bao_hanh.sql` ngay sau dòng `);` kết thúc `CREATE TABLE ... xu_ly_phieu_bao_hanh` (khoảng dòng 46):

```sql
-- Thông tin bổ sung (ĐLĐ + khách hàng) do app nhập/sửa, đẩy về Caresoft khi đồng bộ.
-- Part B (app làm chủ); trigger Phần A KHÔNG đụng. Prefill modal đọc cột này trước, rồi tới phiếu_gốc_json.
ALTER TABLE public.xu_ly_phieu_bao_hanh
  ADD COLUMN IF NOT EXISTS "thông_tin_bổ_sung" JSONB DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Chạy ALTER trên Supabase**

Mở Supabase Dashboard → SQL Editor → dán đúng câu `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "thông_tin_bổ_sung" ...` ở trên → Run.
Expected: "Success. No rows returned".

- [ ] **Step 3: Xác minh cột tồn tại**

Run (Bash):
```bash
curl -s 'https://ngwkzicrnspeggunsblr.supabase.co/rest/v1/xu_ly_phieu_bao_hanh?select=id,th%C3%B4ng_tin_b%E1%BB%95_sung&limit=1' \
  -H "apikey: $SUPABASE_ANON_KEY"
```
(Thay `$SUPABASE_ANON_KEY` bằng anon key trong `src/lib/supabase.js`.)
Expected: trả về JSON có khóa `thông_tin_bổ_sung` (giá trị `{}`), KHÔNG có lỗi `column does not exist`.

- [ ] **Step 4: Commit**

```bash
git add "sql/setup_xu_ly_phieu_bao_hanh.sql"
git commit -m "feat(bao-hanh): them cot JSONB thong_tin_bo_sung (DLD + khach hang)"
```

---

## Task 2: Helper `getThongTinBoSung` (TDD)

**Files:**
- Modify: `src/lib/warrantyProcessing.js` (thêm cuối file)
- Test: `src/lib/warrantyProcessing.test.js` (thêm `describe` mới cuối file)

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/warrantyProcessing.test.js`. Cập nhật dòng import ở đầu file để thêm `THONG_TIN_BO_SUNG_KEYS, getThongTinBoSung`:

```js
describe('getThongTinBoSung', () => {
  test('ưu tiên giá trị đã sửa (thông_tin_bổ_sung) hơn phiếu gốc', () => {
    const row = {
      'thông_tin_bổ_sung': { 'mã_đlđ': 'ĐL99' },
      'phiếu_gốc_json': { 'mã_đlđ': 'ĐL18', 'tên_đlđ': 'A' },
    };
    const r = getThongTinBoSung(row);
    expect(r['mã_đlđ']).toBe('ĐL99');   // bản sửa thắng
    expect(r['tên_đlđ']).toBe('A');      // trống ở bản sửa → lấy phiếu gốc
  });
  test('ô sửa rỗng/null → fallback phiếu gốc', () => {
    const row = { 'thông_tin_bổ_sung': { 'tên_đlđ': '', 'sđt_đlđ': null }, 'phiếu_gốc_json': { 'tên_đlđ': 'B', 'sđt_đlđ': '0123' } };
    const r = getThongTinBoSung(row);
    expect(r['tên_đlđ']).toBe('B');
    expect(r['sđt_đlđ']).toBe('0123');
  });
  test('không có nguồn nào → chuỗi rỗng, đủ 6 khóa', () => {
    const r = getThongTinBoSung({});
    expect(Object.keys(r).sort()).toEqual([...THONG_TIN_BO_SUNG_KEYS].sort());
    expect(r['địa_chỉ_nhận_hàng']).toBe('');
  });
  test('chịu được row null và phiếu_gốc_json null', () => {
    expect(getThongTinBoSung(null)['mã_đlđ']).toBe('');
    expect(getThongTinBoSung({ 'phiếu_gốc_json': null })['mã_đlđ']).toBe('');
  });
  test('ép số từ phiếu gốc thành chuỗi', () => {
    const r = getThongTinBoSung({ 'phiếu_gốc_json': { 'số_điện_thoại_khách_hàng': 123 } });
    expect(r['số_điện_thoại_khách_hàng']).toBe('123');
  });
});
```

- [ ] **Step 2: Chạy test cho thất bại**

Run: `npx vitest run src/lib/warrantyProcessing.test.js`
Expected: FAIL — `getThongTinBoSung is not a function` / `THONG_TIN_BO_SUNG_KEYS is not defined`.

- [ ] **Step 3: Cài đặt helper**

Thêm vào cuối `src/lib/warrantyProcessing.js`:

```js
// 6 trường thông tin đẩy về Caresoft. KEY = tên cột trong phieu_bao_hanh (để prefill từ phiếu_gốc_json).
export const THONG_TIN_BO_SUNG_KEYS = [
  'mã_đlđ', 'tên_đlđ', 'sđt_đlđ',
  'tên_khách_hàng', 'số_điện_thoại_khách_hàng', 'địa_chỉ_nhận_hàng',
];

// Object 6 khóa cho modal. Ưu tiên: bản app đã sửa (thông_tin_bổ_sung) → phiếu gốc (phiếu_gốc_json) → ''.
// Giá trị luôn là chuỗi (ép từ số). Chịu được row/phiếu_gốc_json null.
export function getThongTinBoSung(row) {
  const saved = (row && row['thông_tin_bổ_sung']) || {};
  const goc = (row && row['phiếu_gốc_json']) || {};
  const out = {};
  for (const k of THONG_TIN_BO_SUNG_KEYS) {
    const v = saved[k];
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    else out[k] = goc[k] != null ? String(goc[k]) : '';
  }
  return out;
}
```

- [ ] **Step 4: Chạy test cho pass**

Run: `npx vitest run src/lib/warrantyProcessing.test.js`
Expected: PASS toàn bộ (gồm 5 test mới + các test cũ).

- [ ] **Step 5: Commit**

```bash
git add "src/lib/warrantyProcessing.js" "src/lib/warrantyProcessing.test.js"
git commit -m "feat(bao-hanh): helper getThongTinBoSung (prefill 6 truong DLD/KH)"
```

---

## Task 3: Modal — mục "Thông tin Caresoft" + lưu

**Files:**
- Modify: `src/pages/warranty/ProcessingModal.jsx`

- [ ] **Step 1: Thêm import helper**

Sửa dòng import từ warrantyProcessing (dòng 3) thành (thêm `getThongTinBoSung`):

```jsx
import { TRANG_THAI_XU_LY, computeTotalCost, WORKFLOW_STEPS_MAU, applyStepToggle, ensureClosingStep, CLOSING_STEP, getThongTinBoSung } from '../../lib/warrantyProcessing';
```

- [ ] **Step 2: Thêm state cho 6 trường**

Sau dòng khai báo `const [newNote, setNewNote] = useState('');` (khoảng dòng 41), thêm:

```jsx
const [tinBoSung, setTinBoSung] = useState(() => getThongTinBoSung(row));
const setTin = (k, v) => setTinBoSung(prev => ({ ...prev, [k]: v }));
```

- [ ] **Step 3: Đưa vào payload lưu**

Trong `buildPayload()`, trong object `return { ... }` (sau dòng `'người_tạo': row['người_tạo'] || operator,`), thêm:

```jsx
      'thông_tin_bổ_sung': tinBoSung,
```

- [ ] **Step 4: Thêm mục UI**

Chèn ngay SAU khối `</div>` đóng mục "Phần B: phân công + trạng thái" (block có `<h3 style={s.sectionTitle}>Xử lý</h3>`, kết thúc khoảng dòng 141) và TRƯỚC khối "Các bước tùy biến":

```jsx
        {/* Thông tin Caresoft (đẩy khi đồng bộ) */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Thông tin Caresoft (đẩy khi đồng bộ)</h3>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={s.inputGroup}><label style={s.label}>Mã ĐLĐ</label><input style={s.input} value={tinBoSung['mã_đlđ']} disabled={!perm.edit} onChange={e => setTin('mã_đlđ', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Tên ĐLĐ</label><input style={s.input} value={tinBoSung['tên_đlđ']} disabled={!perm.edit} onChange={e => setTin('tên_đlđ', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>SĐT ĐLĐ</label><input style={s.input} value={tinBoSung['sđt_đlđ']} disabled={!perm.edit} onChange={e => setTin('sđt_đlđ', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>Tên khách hàng</label><input style={s.input} value={tinBoSung['tên_khách_hàng']} disabled={!perm.edit} onChange={e => setTin('tên_khách_hàng', e.target.value)} /></div>
            <div style={s.inputGroup}><label style={s.label}>SĐT khách hàng</label><input style={s.input} value={tinBoSung['số_điện_thoại_khách_hàng']} disabled={!perm.edit} onChange={e => setTin('số_điện_thoại_khách_hàng', e.target.value)} /></div>
            <div style={{ ...s.inputGroup, gridColumn: 'span 2' }}><label style={s.label}>Địa chỉ nhận hàng</label><input style={s.input} value={tinBoSung['địa_chỉ_nhận_hàng']} disabled={!perm.edit} onChange={e => setTin('địa_chỉ_nhận_hàng', e.target.value)} /></div>
          </div>
        </div>
```

- [ ] **Step 5: Kiểm tra build/lint**

Run: `npx vite build`
Expected: build thành công, không lỗi cú pháp JSX.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/warranty/ProcessingModal.jsx"
git commit -m "feat(bao-hanh): modal them muc Thong tin Caresoft (6 truong, prefill + luu)"
```

---

## Task 4: n8n outbound — viết lại workflow đầy đủ

**Files:**
- Modify (ghi đè toàn bộ): `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`

- [ ] **Step 1: Ghi đè file bằng workflow đầy đủ**

Ghi toàn bộ nội dung sau vào `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`:

```json
{
  "name": "Outbound - Xu ly bao hanh -> Caresoft",
  "nodes": [
    { "parameters": { "httpMethod": "POST", "path": "caresoft-warranty-outbound", "options": {} }, "type": "n8n-nodes-base.webhook", "typeVersion": 2.1, "position": [0, 320], "id": "wh01", "name": "Webhook", "webhookId": "caresoft-warranty-outbound" },
    { "parameters": { "conditions": { "options": { "caseSensitive": true, "typeValidation": "strict" }, "combinator": "and", "conditions": [ { "id": "c1", "leftValue": "={{ $json.body.record['trạng_thái_đồng_bộ'] }}", "rightValue": "pending", "operator": { "type": "string", "operation": "equals" } } ] }, "options": {} }, "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [200, 320], "id": "ifp", "name": "Loc pending" },
    { "parameters": { "jsCode": "const r = $json.body.record;\nconst tt = r['thông_tin_bổ_sung'] || {};\nconst ticketId = r['id_phiếu_ghi'] || r['caresoft_ticket_id'];\nconst cf = [];\nconst add = (id, v) => { if (v !== null && v !== undefined && String(v).trim() !== '') cf.push({ id: String(id), value: String(v) }); };\nadd(9665, tt['mã_đlđ']);\nadd(9849, tt['tên_đlđ']);\nadd(9829, tt['sđt_đlđ']);\nadd(9694, tt['địa_chỉ_nhận_hàng']);\nadd(9706, tt['tên_khách_hàng']);\nadd(9705, tt['số_điện_thoại_khách_hàng']);\nconst steps = Array.isArray(r['các_bước']) ? r['các_bước'] : [];\nconst done = steps.filter(s => s['trạng_thái'] === 'xong').map(s => s['tên']).filter(Boolean).join(', ');\nconst parts = Array.isArray(r['linh_kiện_thay']) ? r['linh_kiện_thay'] : [];\nconst partsTxt = parts.map(p => `${p['tên']} x${p['số_lượng']}`).join('; ');\nconst cost = Number(r['tổng_chi_phí']) || 0;\nconst commentBody = ['[Cập nhật từ Webapp QLSX]', r['trạng_thái_xử_lý'] ? `Trạng thái xử lý: ${r['trạng_thái_xử_lý']}` : null, r['người_phụ_trách'] ? `Người phụ trách: ${r['người_phụ_trách']}` : null, r['kết_quả_xử_lý'] ? `Kết quả: ${r['kết_quả_xử_lý']}` : null, partsTxt ? `Linh kiện thay: ${partsTxt}` : null, cost ? `Tổng chi phí: ${cost.toLocaleString('vi-VN')} đ` : null, done ? `Bước đã hoàn thành: ${done}` : null].filter(Boolean).join('\\n');\nreturn [{ json: { rowId: r.id, ticketId, final_custom_fields: cf, commentBody, customerName: tt['tên_khách_hàng'] || '', customerPhone: tt['số_điện_thoại_khách_hàng'] || '' } }];" }, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, 320], "id": "prep", "name": "Chuan bi" },
    { "parameters": { "conditions": { "options": { "caseSensitive": true, "typeValidation": "loose" }, "combinator": "and", "conditions": [ { "id": "c2", "leftValue": "={{ $json.customerPhone }}", "rightValue": "", "operator": { "type": "string", "operation": "notEmpty", "singleValue": true } } ] }, "options": {} }, "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [600, 320], "id": "ifc", "name": "Co khach hang" },
    { "parameters": { "method": "POST", "url": "https://api.caresoft.vn/EUROMADE/api/v1/contacts/", "sendHeaders": true, "headerParameters": { "parameters": [ { "name": "Authorization", "value": "Bearer cm6e8wK4dHLdZIA" }, { "name": "Content-Type", "value": "application/json" } ] }, "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ contact: { username: $json.customerName, phone_no: $json.customerPhone } }) }}", "options": {} }, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.4, "position": [820, 220], "id": "ctNew", "name": "Tao contact", "onError": "continueErrorOutput" },
    { "parameters": { "jsCode": "const resp = $json;\nconst id = (resp.contact && resp.contact.id) || resp.id || null;\nreturn [{ json: { ...$('Chuan bi').item.json, requester_id: id } }];" }, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1040, 140], "id": "reqOk", "name": "reqOK" },
    { "parameters": { "jsCode": "const data = $input.all()[0].json;\nlet dup = null;\nif (data.error && data.error.message) { const m = String(data.error.message).match(/duplicate_id[^0-9]+([0-9]+)/); if (m) dup = m[1]; }\nreturn [{ json: { ...$('Chuan bi').item.json, caresoft_contact_id: dup } }];" }, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1040, 320], "id": "dupId", "name": "Bat ID trung" },
    { "parameters": { "method": "PUT", "url": "=https://api.caresoft.vn/EUROMADE/api/v1/contacts/{{ $json.caresoft_contact_id }}", "sendHeaders": true, "headerParameters": { "parameters": [ { "name": "Authorization", "value": "Bearer cm6e8wK4dHLdZIA" }, { "name": "Content-Type", "value": "application/json" } ] }, "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ contact: { username: $json.customerName } }) }}", "options": {} }, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.4, "position": [1240, 320], "id": "ctUpd", "name": "Cap nhat ten contact" },
    { "parameters": { "jsCode": "return [{ json: { ...$('Chuan bi').item.json, requester_id: $('Bat ID trung').item.json.caresoft_contact_id } }];" }, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1440, 320], "id": "reqDup", "name": "reqDup" },
    { "parameters": { "method": "PUT", "url": "=https://api.caresoft.vn/EUROMADE/api/v1/tickets/{{ $('Chuan bi').item.json.ticketId }}", "sendHeaders": true, "headerParameters": { "parameters": [ { "name": "Authorization", "value": "Bearer cm6e8wK4dHLdZIA" }, { "name": "Content-Type", "value": "application/json" } ] }, "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ ticket: { requester_id: $json.requester_id, ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields } }) }}", "options": {} }, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.4, "position": [1660, 240], "id": "tkReq", "name": "PUT ticket (co requester)", "onError": "continueErrorOutput" },
    { "parameters": { "method": "PUT", "url": "=https://api.caresoft.vn/EUROMADE/api/v1/tickets/{{ $('Chuan bi').item.json.ticketId }}", "sendHeaders": true, "headerParameters": { "parameters": [ { "name": "Authorization", "value": "Bearer cm6e8wK4dHLdZIA" }, { "name": "Content-Type", "value": "application/json" } ] }, "sendBody": true, "specifyBody": "json", "jsonBody": "={{ JSON.stringify({ ticket: { ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields } }) }}", "options": {} }, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.4, "position": [820, 460], "id": "tkNo", "name": "PUT ticket (khong requester)", "onError": "continueErrorOutput" },
    { "parameters": { "operation": "update", "tableId": "xu_ly_phieu_bao_hanh", "filters": { "conditions": [ { "keyName": "id", "condition": "eq", "keyValue": "={{ $('Chuan bi').item.json.rowId }}" } ] }, "fieldsUi": { "fieldValues": [ { "fieldId": "trạng_thái_đồng_bộ", "fieldValue": "đã_đồng_bộ" }, { "fieldId": "thời_điểm_đồng_bộ", "fieldValue": "={{ $now.toISO() }}" }, { "fieldId": "lỗi_đồng_bộ", "fieldValue": "" } ] } }, "type": "n8n-nodes-base.supabase", "typeVersion": 1, "position": [1900, 240], "id": "ackOk", "name": "ACK ok", "credentials": { "supabaseApi": { "id": "kAOz6fNsa8UHk4Ws", "name": "Supabase account 2" } } },
    { "parameters": { "operation": "update", "tableId": "xu_ly_phieu_bao_hanh", "filters": { "conditions": [ { "keyName": "id", "condition": "eq", "keyValue": "={{ $('Chuan bi').item.json.rowId }}" } ] }, "fieldsUi": { "fieldValues": [ { "fieldId": "trạng_thái_đồng_bộ", "fieldValue": "lỗi" }, { "fieldId": "lỗi_đồng_bộ", "fieldValue": "={{ ($json.error && $json.error.message) || $json.message || JSON.stringify($json).slice(0,500) }}" } ] } }, "type": "n8n-nodes-base.supabase", "typeVersion": 1, "position": [1900, 460], "id": "ackErr", "name": "ACK loi", "credentials": { "supabaseApi": { "id": "kAOz6fNsa8UHk4Ws", "name": "Supabase account 2" } } }
  ],
  "connections": {
    "Webhook": { "main": [ [ { "node": "Loc pending", "type": "main", "index": 0 } ] ] },
    "Loc pending": { "main": [ [ { "node": "Chuan bi", "type": "main", "index": 0 } ], [] ] },
    "Chuan bi": { "main": [ [ { "node": "Co khach hang", "type": "main", "index": 0 } ] ] },
    "Co khach hang": { "main": [ [ { "node": "Tao contact", "type": "main", "index": 0 } ], [ { "node": "PUT ticket (khong requester)", "type": "main", "index": 0 } ] ] },
    "Tao contact": { "main": [ [ { "node": "reqOK", "type": "main", "index": 0 } ], [ { "node": "Bat ID trung", "type": "main", "index": 0 } ] ] },
    "reqOK": { "main": [ [ { "node": "PUT ticket (co requester)", "type": "main", "index": 0 } ] ] },
    "Bat ID trung": { "main": [ [ { "node": "Cap nhat ten contact", "type": "main", "index": 0 } ] ] },
    "Cap nhat ten contact": { "main": [ [ { "node": "reqDup", "type": "main", "index": 0 } ] ] },
    "reqDup": { "main": [ [ { "node": "PUT ticket (co requester)", "type": "main", "index": 0 } ] ] },
    "PUT ticket (co requester)": { "main": [ [ { "node": "ACK ok", "type": "main", "index": 0 } ], [ { "node": "ACK loi", "type": "main", "index": 0 } ] ] },
    "PUT ticket (khong requester)": { "main": [ [ { "node": "ACK ok", "type": "main", "index": 0 } ], [ { "node": "ACK loi", "type": "main", "index": 0 } ] ] }
  },
  "pinData": {},
  "meta": { "templateCredsSetupCompleted": true }
}
```

- [ ] **Step 2: Kiểm tra JSON hợp lệ**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json','utf8')); console.log('JSON OK')"`
Expected: in ra `JSON OK`.

- [ ] **Step 3: Commit**

```bash
git add "docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json"
git commit -m "feat(bao-hanh): n8n outbound day custom_fields + contact requester + ACK"
```

- [ ] **Step 4 (thủ công, ngoài git): Import & nối Supabase Webhook**

1. n8n → Import from File → chọn file JSON trên.
2. Mở node "Webhook" → copy Production URL.
3. Supabase Dashboard → Database → Webhooks → Create: Table `xu_ly_phieu_bao_hanh`, Events **UPDATE**, Type HTTP POST, URL = Production URL. (Header `Content-type: application/json` mặc định là đủ.)
4. Kích hoạt (Activate) workflow n8n.

---

## Task 5: Verification end-to-end (thủ công)

**Files:** không sửa code.

- [ ] **Step 1: Chạy toàn bộ test + build**

Run: `npx vitest run && npx vite build`
Expected: tất cả test PASS, build thành công.

- [ ] **Step 2: Test trên app (localhost hoặc deploy)**

1. Mở 1 phiếu test trong tab Xử Lý Phiếu → mục "Thông tin Caresoft" prefill đúng dữ liệu gốc (so với `phiếu_gốc_json`).
2. Sửa vài ô (vd Tên ĐLĐ) → bấm **Lưu** → đóng, mở lại phiếu → giá trị đã sửa được giữ.
3. Bấm **Hoàn tất & Đồng bộ Caresoft** → badge cột Đồng bộ chuyển "Đang đẩy".

- [ ] **Step 3: Kiểm chứng phía Caresoft**

Sau vài giây, GET lại ticket để xác nhận custom_fields cập nhật + requester đúng:
```bash
curl -s "https://api.caresoft.vn/EUROMADE/api/v1/tickets/<id_phiếu_ghi>" \
  -H "Authorization: Bearer cm6e8wK4dHLdZIA" \
  | node -e "const t=JSON.parse(require('fs').readFileSync(0));const tk=t.ticket||t;console.log('requester_id:',tk.requester_id);(tk.custom_filed||[]).filter(f=>[9665,9849,9829,9694,9706,9705].includes(Number(f.id))).forEach(f=>console.log(f.id,f.label,'=',JSON.stringify(f.value)))"
```
Expected: 6 ô custom_fields có giá trị mới; `requester_id` trỏ tới contact khách hàng. Badge app chuyển "Đã đồng bộ".

- [ ] **Step 4: Test bất biến "không đè trắng"**

Mở phiếu khác, để TRỐNG 1 ô vốn có dữ liệu trên CS (vd xóa Địa chỉ trong app) → Đồng bộ → GET ticket: ô Địa chỉ trên CS **giữ nguyên** giá trị cũ (không bị xóa). Vì n8n bỏ qua ô trống.

- [ ] **Step 5: Cập nhật bundle deploy (theo quy ước repo)**

Run: `npx vite build` rồi copy `dist/` → `deploy-netlify/` theo [[qlsx-netlify-deploy]].
```bash
git add -A && git commit -m "chore(bao-hanh): build + cap nhat bundle deploy-netlify"
```

---

## Self-Review

- **Spec coverage:** §2 bộ trường+ID → Task 4 Code "Chuan bi". §3 JSONB → Task 1. §4 prefill → Task 2. §5 modal → Task 3. §6 luồng pending → giữ nguyên (không cần task). §7 n8n → Task 4. §8 an toàn (skip empty, chống loop) → Task 4 (`add` skip empty, IF pending) + Task 5 Step 4. §10 test → Task 2 + Task 5. ✅ Đủ.
- **Placeholder scan:** `<id_phiếu_ghi>` / `<id>` / `$SUPABASE_ANON_KEY` là chỗ thay giá trị thật khi chạy, không phải TODO. Không còn TBD.
- **Type consistency:** `THONG_TIN_BO_SUNG_KEYS`, `getThongTinBoSung`, `thông_tin_bổ_sung`, `final_custom_fields`, `rowId`, `ticketId`, `requester_id` dùng nhất quán giữa các task. ID 9665/9849/9829/9694/9706/9705 khớp spec.
