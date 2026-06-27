# GĐ1 — Đồng bộ trạng thái phiếu về Caresoft — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép chọn trạng thái Caresoft (new/open/pending/solved/closed) trong popup từng phiếu và đẩy về ticket qua n8n outbound đã có.

**Architecture:** Tái dùng cột `trạng_thái_caresoft_muốn_set` (đã có). Modal đổi ô text → dropdown + nút "Đồng bộ" (gọi `handleSync` sẵn có, đặt cờ `pending`). n8n "Chuan bi" đọc thêm `wantStatus`; 2 node PUT ticket thêm `status` khi `wantStatus` có giá trị.

**Tech Stack:** React (Vite), n8n, Caresoft REST API v1.

**Spec:** `docs/superpowers/specs/2026-06-27-dong-bo-trang-thai-phieu-cs-design.md`

**Không có DB migration, không có unit test mới** (thay đổi UI + cấu hình n8n; verify bằng build + test thủ công).

---

## Task 1: Modal — dropdown trạng thái + nút Đồng bộ + cập nhật lạc quan

**Files:** Modify `src/pages/warranty/ProcessingModal.jsx`

- [ ] **Step 1: Đổi ô text "Trạng thái Caresoft muốn set" → dropdown + nút**

Tìm dòng (trong mục "Xử lý"):
```jsx
            <div style={s.inputGroup}><label style={s.label}>Trạng thái Caresoft muốn set</label><input style={s.input} placeholder="vd: solved" value={form['trạng_thái_caresoft_muốn_set']} onChange={e => set('trạng_thái_caresoft_muốn_set', e.target.value)} /></div>
```
Thay TOÀN BỘ dòng đó bằng:
```jsx
            <div style={s.inputGroup}>
              <label style={s.label}>Trạng thái Caresoft</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select style={{ ...s.input, flex: 1 }} value={form['trạng_thái_caresoft_muốn_set']} disabled={!perm.edit} onChange={e => set('trạng_thái_caresoft_muốn_set', e.target.value)}>
                  <option value="">(— không đổi —)</option>
                  <option value="new">new</option>
                  <option value="open">open</option>
                  <option value="pending">pending</option>
                  <option value="solved">solved</option>
                  <option value="closed">closed</option>
                </select>
                {perm.io && <button onClick={handleSync} disabled={saving} title="Lưu lựa chọn & đẩy trạng thái về Caresoft" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.7rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: saving ? 0.6 : 1 }}><Send size={14} /> Đồng bộ</button>}
              </div>
            </div>
```
(`handleSync`, `saving`, và icon `Send` đã có sẵn trong file — không cần import thêm.)

- [ ] **Step 2: Cập nhật lạc quan `trạng_thái_phiếu_ghi` trong buildPayload**

Trong `buildPayload()`, tìm dòng:
```jsx
      ...(closingDone ? { 'trạng_thái_phiếu_ghi': 'solved' } : {}),
```
Thêm NGAY SAU nó một dòng (để lựa chọn tường minh thắng nhánh closingDone):
```jsx
      ...(form['trạng_thái_caresoft_muốn_set'] ? { 'trạng_thái_phiếu_ghi': form['trạng_thái_caresoft_muốn_set'] } : {}),
```

- [ ] **Step 3: Kiểm tra build**

Run: `npx vite build`
Expected: build thành công, không lỗi JSX. (Không commit dist/.)

- [ ] **Step 4: Commit**
```bash
git add "src/pages/warranty/ProcessingModal.jsx"
git commit -m "feat(bao-hanh): dropdown trang thai CS + nut Dong bo trong popup"
```

---

## Task 2: n8n outbound — đẩy `status` về ticket

**Files:** Modify `docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json`

- [ ] **Step 1: Node "Chuan bi" — thêm `wantStatus` vào output**

Trong jsCode của node "Chuan bi", tìm đoạn cuối:
```
customerPhone: tt['số_điện_thoại_khách_hàng'] || '' } }];
```
Thay bằng (thêm `wantStatus`):
```
customerPhone: tt['số_điện_thoại_khách_hàng'] || '', wantStatus: (r['trạng_thái_caresoft_muốn_set'] || '').trim() } }];
```

- [ ] **Step 2: Node "PUT ticket (co requester)" — thêm `status` có điều kiện**

Tìm jsonBody:
```
={{ JSON.stringify({ ticket: { requester_id: $json.requester_id, ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields } }) }}
```
Thay bằng:
```
={{ JSON.stringify({ ticket: Object.assign({ requester_id: $json.requester_id, ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields }, $('Chuan bi').item.json.wantStatus ? { status: $('Chuan bi').item.json.wantStatus } : {}) }) }}
```

- [ ] **Step 3: Node "PUT ticket (khong requester)" — thêm `status` có điều kiện**

Tìm jsonBody:
```
={{ JSON.stringify({ ticket: { ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields } }) }}
```
Thay bằng:
```
={{ JSON.stringify({ ticket: Object.assign({ ticket_comment: { body: $('Chuan bi').item.json.commentBody, is_public: 0, author_id: 195739221 }, custom_fields: $('Chuan bi').item.json.final_custom_fields }, $('Chuan bi').item.json.wantStatus ? { status: $('Chuan bi').item.json.wantStatus } : {}) }) }}
```

- [ ] **Step 4: Kiểm tra JSON hợp lệ**

Run: `node -e "const w=JSON.parse(require('fs').readFileSync('docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json','utf8')); const prep=w.nodes.find(n=>n.name==='Chuan bi'); console.log('wantStatus in prep:', prep.parameters.jsCode.includes('wantStatus')); console.log('status in PUTs:', w.nodes.filter(n=>n.name.startsWith('PUT ticket')).every(n=>n.parameters.jsonBody.includes('status: $(\'Chuan bi\').item.json.wantStatus')));"`
Expected: `wantStatus in prep: true` và `status in PUTs: true`.

- [ ] **Step 5: Commit**
```bash
git add "docs/n8n/2026-06-27-outbound-xu-ly-bao-hanh.json"
git commit -m "feat(bao-hanh): n8n outbound day status ticket (khi co chon trang thai)"
```

---

## Task 3: Verify

- [ ] **Step 1: Build + test toàn bộ**

Run: `npx vitest run && npx vite build`
Expected: tất cả test PASS, build thành công.

- [ ] **Step 2 (thủ công): Re-import n8n**

Import lại file JSON vào n8n (đè workflow cũ) để áp thay đổi `status`. Activate.

- [ ] **Step 3 (thủ công): Test live**

Mở 1 phiếu `open` → dropdown chọn `solved` → bấm "Đồng bộ" → badge "Đang đẩy", list đổi sang solved ngay. Sau khi n8n chạy, kiểm CS:
```bash
curl -s "https://api.caresoft.vn/EUROMADE/api/v1/tickets/<id_phiếu_ghi>" \
  -H "Authorization: Bearer cm6e8wK4dHLdZIA" \
  | node -e "const t=JSON.parse(require('fs').readFileSync(0));const tk=t.ticket||t;console.log('ticket_status =', tk.ticket_status)"
```
Expected: `ticket_status = solved`.
**Nếu vẫn `open`** (CS không nhận key `status`): trong 2 node PUT, đổi `status:` thành `ticket_status:` rồi re-import, test lại.

- [ ] **Step 4 (thủ công): Test "không đổi"**

Mở phiếu khác, dropdown để `(— không đổi —)`, đồng bộ 1 trường ĐLĐ → xác nhận `ticket_status` trên CS KHÔNG đổi.

---

## Self-Review

- **Spec coverage:** dropdown 5+rỗng → T1 Step1. Cập nhật lạc quan trạng_thái_phiếu_ghi → T1 Step2. n8n wantStatus → T2 Step1. status có điều kiện ở 2 PUT → T2 Step2-3. Verify key `status` vs `ticket_status` → T3 Step3. "Không đổi" khi rỗng → T3 Step4. ✅ Đủ.
- **Placeholder scan:** `<id_phiếu_ghi>` là chỗ thay giá trị thật khi test. Không TBD.
- **Type consistency:** `trạng_thái_caresoft_muốn_set`, `wantStatus`, `$('Chuan bi')`, `handleSync`, `Send` nhất quán với code/n8n hiện có.
