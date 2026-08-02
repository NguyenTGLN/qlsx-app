# Nghỉ nửa buổi tính 0,5 ngày — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps dùng checkbox (`- [ ]`).

**Goal:** "Nghỉ sáng" / "Nghỉ chiều" tính **0,5 ngày** thay vì tròn 1 ngày, ở cả điểm KPI chuyên cần lẫn bảng thống kê chấm công.

**Architecture:** Lưu **chữ gốc** của cột Nghỉ xuống CSDL (`cham_cong.nghi_text`), rồi quy ra trọng số bằng **một hàm thuần duy nhất** `trongSoNgayNghi()` đặt trong `kpiTuDong.js` — nơi vốn giữ mọi luật chấm điểm. Cả engine KPI lẫn module thống kê gọi chung hàm đó, nên hai nơi không thể lệch nhau.

**Tech Stack:** React 19, Supabase (Postgres + RPC), vitest.

---

## Bối cảnh đã đo (01/08/2026)

- File máy chấm công có cột Nghỉ với 3 giá trị: `Nghỉ`, `Nghỉ sáng`, `Nghỉ chiều`.
- `src/lib/chamCongExcel.js` **đã đọc sẵn** chữ này ra `nghiText` — không phải viết mới.
- Nhưng `cham_cong` **không có cột nào lưu nó**: chỉ có `nghi boolean` và `nghi_van`. Chữ gốc
  bị bỏ ngay tại chỗ ghi.
- Kỳ 2026-07: **8/19 ngày nghỉ là nửa buổi**. Phong (2 buổi sáng) và Thiện (2 buổi) đang bị
  ghi "quá quy định 1 ngày" trong khi thực tế mỗi người nghỉ đúng 1 ngày = trong phép.
- Kỳ 2026-07 **chưa ai chốt điểm tay** (`diem_chot`/`chot_boi` đều null ở cả 30 dòng chuyên
  cần) → đổi luật không đè lên quyết định của ai, điểm tính live sẽ đúng ngay.

## Ngoài phạm vi

- **Không** đổi số ngày phép (`NGAY_PHEP_THANG` vẫn = 1).
- **Không** đổi ngưỡng trừ điểm, không đổi cách tính trung bình bộ phận.
- **Không** đụng luồng chấm công khác (miễn trừ đặc biệt, phân nhóm, nạp Excel về mặt UI).

## An toàn ngược

Dòng đã nạp trước thay đổi này có `nghi_text = null` nhưng `nghi = true` → `trongSoNgayNghi(null)`
trả **1**, đúng như hành vi cũ. Nên **không kỳ nào tự dưng đổi điểm** cho tới khi được nạp lại
từ Excel. Đây là chủ ý: đổi số của một kỳ phải là hành động có người bấm, không phải tác dụng
phụ của việc chạy SQL.

---

## Task 1: Cột `nghi_text` + cập nhật RPC nạp

**Files:** Create `sql/them_nghi_text_cham_cong.sql`

- [ ] **Step 1: Viết tệp SQL**

```sql
-- Lưu CHỮ GỐC cột Nghỉ của máy chấm công ('Nghỉ' / 'Nghỉ sáng' / 'Nghỉ chiều').
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao lưu CHỮ chứ không lưu sẵn số 0.5/1: chữ là BẰNG CHỨNG lấy từ nguồn, còn quy ra
-- trọng số là LUẬT — luật đổi thì sửa một hàm trong kpiTuDong.js rồi mọi kỳ tính lại đúng,
-- không phải nạp lại dữ liệu. Lưu sẵn số thì luật bị đông cứng vào từng dòng đã ghi.
begin;

alter table cham_cong add column if not exists nghi_text text;

comment on column cham_cong.nghi_text is
  'Chữ gốc cột Nghỉ trong file máy chấm công. null = không nghỉ. Quy ra số ngày bằng '
  'trongSoNgayNghi() trong src/lib/kpiTuDong.js, KHÔNG tự suy ở nơi khác.';

-- RPC nạp phải chở thêm cột này, nếu không màn "Nạp từ Excel" ghi xuống vẫn mất chữ gốc.
create or replace function nap_cham_cong(p_ky text, p_dong jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
<<GIỮ NGUYÊN TOÀN BỘ THÂN HÀM HIỆN CÓ, CHỈ SỬA 3 CHỖ:
   1. danh sách cột trong `insert into cham_cong (...)`  → thêm `nghi_text`
   2. danh sách giá trị `select ...`                      → thêm `d.nghi_text`
   3. khai báo `jsonb_to_recordset(p_dong) as d(...)`     → thêm `nghi_text text`>>
$$;

commit;

-- KIỂM TRA
select column_name from information_schema.columns
where table_name = 'cham_cong' and column_name = 'nghi_text';
```

⚠ **Phải mở `sql/rpc_nap_cham_cong.sql` và chép nguyên thân hàm hiện có sang**, chỉ thêm đúng
3 chỗ nêu trên. Hàm này có nhiều chốt chặn (kiểm quyền ADMIN, chặn payload rỗng, chặn kỳ sai)
— viết lại từ đầu là mất chốt chặn mà không ai biết.

- [ ] **Step 2:** Đọc lại tệp, đối chiếu từng dòng thân hàm với bản gốc. Báo lại đã giữ đủ
  mấy nhánh `return jsonb_build_object('loi', …)`.

- [ ] **Step 3:** Commit `sql/them_nghi_text_cham_cong.sql`. **KHÔNG tự chạy trên Supabase** —
  người điều phối sẽ chạy.

---

## Task 2: `trongSoNgayNghi` trong `kpiTuDong.js` (TDD)

**Files:** Modify `src/lib/kpiTuDong.js`, `src/lib/kpiTuDong.test.js`

- [ ] **Step 1: Viết test thất bại.** Thêm vào `src/lib/kpiTuDong.test.js` (gộp tên hàm vào
  dòng `import` `./kpiTuDong` sẵn có, đừng thêm dòng import thứ hai):

```js
describe('trongSoNgayNghi', () => {
  it('nghỉ nửa buổi tính 0,5 ngày', () => {
    expect(trongSoNgayNghi('Nghỉ sáng')).toBe(0.5);
    expect(trongSoNgayNghi('Nghỉ chiều')).toBe(0.5);
  });

  it('nghỉ cả ngày tính 1 ngày', () => {
    expect(trongSoNgayNghi('Nghỉ')).toBe(1);
  });

  it('chữ lạ tính TRÒN 1 ngày — thà tính thừa còn hơn bỏ sót ngày nghỉ', () => {
    expect(trongSoNgayNghi('Nghỉ tết')).toBe(1);
    expect(trongSoNgayNghi('nghỉ ốm')).toBe(1);
  });

  it('null/rỗng (dữ liệu nạp TRƯỚC khi có cột nghi_text) tính 1 ngày như hành vi cũ', () => {
    expect(trongSoNgayNghi(null)).toBe(1);
    expect(trongSoNgayNghi(undefined)).toBe(1);
    expect(trongSoNgayNghi('')).toBe(1);
  });

  it('không phân biệt hoa thường và khoảng trắng thừa', () => {
    expect(trongSoNgayNghi('  NGHỈ SÁNG  ')).toBe(0.5);
  });
});
```

- [ ] **Step 2:** `npm test -- kpiTuDong` → FAIL (`trongSoNgayNghi is not a function`).

- [ ] **Step 3: Viết code.** Thêm vào `src/lib/kpiTuDong.js`, ngay dưới `NGAY_PHEP_THANG`:

```js
// Chữ gốc cột Nghỉ của máy chấm công → số NGÀY nghỉ.
//
// Đặt ở đây chứ không ở module thống kê: đây là LUẬT chấm điểm, mà mọi luật chấm điểm đều
// nằm trong tệp này. Bảng thống kê chấm công gọi chung hàm này, nên con số người xem thấy và
// con số bị trừ điểm không thể lệch nhau.
//
// Chữ LẠ trả 1 chứ không phải 0.5: máy chấm công có thể xuất ra chữ chưa lường trước ('Nghỉ
// tết', 'Nghỉ bù'…). Đoán thấp là âm thầm cho không ngày phép; đoán cao thì người bị trừ oan
// sẽ khiếu nại và ta sửa được. Trong hai kiểu sai, chỉ kiểu sau tự lộ ra.
const NGHI_NUA_BUOI = new Set(['nghỉ sáng', 'nghỉ chiều']);

export function trongSoNgayNghi(nghiText) {
  return NGHI_NUA_BUOI.has(String(nghiText ?? '').trim().toLowerCase()) ? 0.5 : 1;
}
```

- [ ] **Step 4:** `npm test -- kpiTuDong` → PASS.
- [ ] **Step 5:** Commit.

---

## Task 3: Áp trọng số vào 2 luật chuyên cần

**Files:** Modify `src/lib/kpiTuDong.js`, `src/lib/kpiTuDong.test.js`

Hiện cả hai luật đếm ngày nghỉ bằng `.filter(c => c.nghi).length`. Đổi thành **cộng trọng số**.

- [ ] **Step 1: Viết test thất bại.** Thêm vào `src/lib/kpiTuDong.test.js`:

```js
describe('chuyên cần tính nghỉ nửa buổi là 0,5 ngày', () => {
  const cc = (o = {}) => ({ nhan_vien_id: 'a', ky: '2026-07', di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o });

  it('CÁ NHÂN: 2 buổi sáng = 1 ngày = đúng phép, KHÔNG trừ điểm (ca của Phong kỳ 7)', () => {
    const kq = LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN({ chi_tieu: 10 }, [], [], [
      cc({ nghi: true, nghi_text: 'Nghỉ sáng', ngay: '2026-07-13' }),
      cc({ nghi: true, nghi_text: 'Nghỉ sáng', ngay: '2026-07-22' }),
    ]);
    expect(kq.tiLe).toBe(1);
  });

  it('CÁ NHÂN: 3 buổi = 1,5 ngày → vượt 0,5 phép → trừ 1,5 điểm', () => {
    const kq = LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN({ chi_tieu: 10 }, [], [], [
      cc({ nghi: true, nghi_text: 'Nghỉ sáng', ngay: '2026-07-01' }),
      cc({ nghi: true, nghi_text: 'Nghỉ chiều', ngay: '2026-07-02' }),
      cc({ nghi: true, nghi_text: 'Nghỉ sáng', ngay: '2026-07-03' }),
    ]);
    expect(kq.tiLe).toBeCloseTo(0.85, 5);   // (10 − 0.5×3) / 10
  });

  it('CÁ NHÂN: dữ liệu CŨ không có nghi_text vẫn tính tròn 1 ngày như trước', () => {
    const kq = LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN({ chi_tieu: 10 }, [], [], [
      cc({ nghi: true, ngay: '2026-07-01' }), cc({ nghi: true, ngay: '2026-07-02' }),
    ]);
    expect(kq.tiLe).toBe(0.7);   // vượt 1 ngày → trừ 3
  });

  it('BỘ PHẬN: cộng theo trọng số rồi mới chia đầu người', () => {
    const kq = LUAT_TU_DONG.CHUYEN_CAN_BO_PHAN({ chi_tieu: 10 }, [], [], [
      cc({ nghi: true, nghi_text: 'Nghỉ sáng' }), cc({ nghi: true, nghi_text: 'Nghỉ chiều' }),
    ], ['a', 'b']);
    // tổng 1 ngày / 2 người = 0,5 ngày mỗi người → dưới 1 ngày phép → không trừ phần nghỉ
    expect(kq.tiLe).toBe(1);
  });
});
```

- [ ] **Step 2:** `npm test -- kpiTuDong` → FAIL.

- [ ] **Step 3: Sửa `luatChuyenCanCaNhan`.** Đổi:
```js
  const nghi = nghiNgay.length;
```
thành:
```js
  // Cộng TRỌNG SỐ chứ không đếm dòng: nghỉ nửa buổi là 0,5 ngày (xem trongSoNgayNghi).
  const nghi = nghiNgay.reduce((s, c) => s + trongSoNgayNghi(c.nghi_text), 0);
```
Và trong phần ghi chú, chỗ `Nghỉ ${nghi} ngày` phải in được số lẻ cho gọn — dùng
`soNgayGon(nghi)` với helper mới đặt cạnh `noiNgay`:
```js
// 1.5 → '1,5'; 2 → '2'. Dấu phẩy thập phân cho đúng lối viết tiếng Việt, và bỏ '.0' thừa để
// người đọc không phải phân vân "2,0 ngày" là gì.
const soNgayGon = n => String(Number(n.toFixed(2))).replace('.', ',');
```
Áp `soNgayGon` cho cả `nghi` lẫn `vuotPhep` trong chuỗi ghi chú.

- [ ] **Step 4: Sửa `luatChuyenCanBoPhan`.** Đổi:
```js
  const nghi = ccTru.filter(c => c.nghi).length;
```
thành:
```js
  const nghi = ccTru.reduce((s, c) => s + (c.nghi ? trongSoNgayNghi(c.nghi_text) : 0), 0);
```
Ghi chú của luật này đang dùng `nghiTB.toFixed(1)` — giữ nguyên, nhưng chỗ in tổng nhóm
(`${nghi} ngày nghỉ`) đổi sang `soNgayGon(nghi)`.

- [ ] **Step 5:** `npm test` → toàn bộ PASS. Nếu có ca CŨ đỏ, **đọc kỹ ca đó trước khi sửa**:
  ca cũ không truyền `nghi_text` nên phải vẫn ra kết quả như trước (trọng số 1). Ca cũ đỏ nghĩa
  là code mới sai, KHÔNG phải ca cũ lỗi thời.
- [ ] **Step 6:** Commit.

---

## Task 4: Module thống kê dùng chung trọng số

**Files:** Modify `src/lib/chamCongThongKe.js`, `src/lib/chamCongThongKe.test.js`

- [ ] **Step 1: Viết test thất bại.** Thêm vào `src/lib/chamCongThongKe.test.js`:

```js
describe('thongKeMotNguoi với nghỉ nửa buổi', () => {
  const d = (ngay, o = {}) => ({ nhan_vien_id: 'a', ky: '2026-07', ngay, di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o });

  it('2 buổi sáng = 1 ngày → đúng phép, không quá quy định (ca của Phong kỳ 7)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-13', { nghi: true, nghi_text: 'Nghỉ sáng' }),
      d('2026-07-22', { nghi: true, nghi_text: 'Nghỉ sáng' }),
    ], () => false);
    expect(tk.tongNghi).toBe(1);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('1 ngày + 1 buổi = 1,5 ngày → quá 0,5', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { nghi: true, nghi_text: 'Nghỉ' }),
      d('2026-07-02', { nghi: true, nghi_text: 'Nghỉ chiều' }),
    ], () => false);
    expect(tk.tongNghi).toBe(1.5);
    expect(tk.nghiQuaQuyDinh).toBe(0.5);
  });

  it('dữ liệu cũ không có nghi_text vẫn tính tròn 1 ngày', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { nghi: true }), d('2026-07-02', { nghi: true }),
    ], () => false);
    expect(tk.tongNghi).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(1);
  });
});
```

- [ ] **Step 2:** `npm test -- chamCongThongKe` → FAIL.

- [ ] **Step 3: Sửa `thongKeMotNguoi`.** Import `trongSoNgayNghi` cùng `NGAY_PHEP_THANG` từ
  `./kpiTuDong`. Đổi hai biến đếm thành cộng trọng số:
```js
      if (mien) nghiCoDau += trongSoNgayNghi(r.nghi_text);
      else nghiChuaDau += trongSoNgayNghi(r.nghi_text);
```
Phần còn lại của công thức giữ NGUYÊN — `min`/`max` chạy đúng với số lẻ.

- [ ] **Step 4:** Ca test khoá với KPI (đã có sẵn trong tệp) phải vẫn XANH. Nếu đỏ nghĩa là hai
  bên đã lệch nhau — sửa cho khớp `kpiTuDong.js`, không sửa ngược lại.
- [ ] **Step 5:** `npm test` toàn bộ → PASS. Commit.

---

## Task 5: Hai đường nạp chở thêm `nghi_text`

**Files:** Modify `src/pages/tasks/NapChamCong.jsx`, `scripts/import-cham-cong.mjs`

- [ ] **Step 1:** Trong `NapChamCong.jsx`, tìm chỗ dựng `p_dong` (khoảng dòng 245–258) và thêm
  trường `nghi_text: d.nghiText ?? null` vào mỗi phần tử. `docDongChamCong` đã trả sẵn
  `nghiText` — chỉ là chưa ai chuyển tiếp.

- [ ] **Step 2:** Trong `scripts/import-cham-cong.mjs`, thêm `nghi_text` vào danh sách cột và
  giá trị của câu `insert`. Chuỗi phải được escape đúng như các cột text khác trong tệp đó
  (xem cách `nghi_van` đang làm) — **đừng nối chuỗi trần**.

- [ ] **Step 3:** `npm test` → PASS. `npm run build` → thành công. `npx eslint` 2 tệp → 0 lỗi.
- [ ] **Step 4:** Commit.

---

## Task 6: Nạp lại kỳ 2026-07 và đối chiếu

**Files:** không sửa tệp

- [ ] **Step 1:** Người điều phối chạy `sql/them_nghi_text_cham_cong.sql` trên Supabase.
- [ ] **Step 2:** Nạp lại kỳ 2026-07 từ file gốc bằng nút "Nạp từ Excel".
- [ ] **Step 3:** Đối chiếu bảng thống kê. Kỳ vọng sau khi nạp lại:

| | Trước | Sau |
|---|---|---|
| TỔNG tổng nghỉ | 19 | **15** (8 nửa buổi → 4) |
| Phong — quá quy định | 1 | **0** |
| Thiện — quá quy định | 1 | **0** |
| Tuấn — tổng nghỉ | 4 | **3,5** |

- [ ] **Step 4:** Mở tab KPI, xác nhận điểm chuyên cần của Phong và Thiện đã được cộng lại.
