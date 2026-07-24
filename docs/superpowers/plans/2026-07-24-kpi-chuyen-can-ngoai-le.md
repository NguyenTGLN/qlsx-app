# KPI chuyên cần — ghi chú chính xác + miễn trừ đặc biệt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi chú 2 chỉ tiêu chuyên cần + chỉ tiêu hoàn thành công việc nêu đúng căn cứ trừ điểm (ngày cụ thể, trễ bao lâu), và cho admin đánh dấu một ngày là "đặc biệt" kèm giải trình để loại ngày đó khỏi điểm trừ chuyên cần mà vẫn hiển thị.

**Architecture:** Miễn trừ nằm ở **bảng phủ mới** `chuyen_can_ngoai_le` (không gắn vào `cham_cong` vốn bị import xoá-nạp mỗi tháng). Luật chấm là hàm thuần trong `src/lib/kpiTuDong.js`: `apDungChamTuDong` gắn cờ `mien` vào dòng chấm công, hai luật chuyên cần loại ngày `mien` khỏi phần trừ điểm. Giao diện đánh dấu nằm trong tab Chấm công (admin), RLS chặn ghi ở DB.

**Tech Stack:** React 19 (JSX), Supabase JS, vitest. Bảng SQL chạy tay trên Supabase SQL Editor.

**Spec:** `docs/superpowers/specs/2026-07-24-kpi-chuyen-can-ngoai-le-design.md`

---

## Cấu trúc file

| File | Trách nhiệm | Hành động |
|---|---|---|
| `sql/create_chuyen_can_ngoai_le.sql` | Bảng miễn trừ + index + RLS | Tạo mới |
| `src/lib/kpiTuDong.js` | Luật chấm: annotate `mien`, ghi chú mới | Sửa |
| `src/lib/kpiTuDong.test.js` | Test luật | Sửa (thêm + cập nhật) |
| `src/pages/tasks/KpiTab.jsx` | Tải `ngoaiLe` + truyền vào engine | Sửa |
| `src/lib/permRegistry.js` | Thêm cap `edit` cho tab `cham_cong` | Sửa |
| `src/pages/tasks/TaskApp.jsx` | Truyền `me` + `perm` vào ChamCongTab | Sửa |
| `src/pages/tasks/ChamCongTab.jsx` | Hiển thị miễn trừ + modal đánh dấu (admin) | Sửa |

---

## Task 1: Bảng SQL `chuyen_can_ngoai_le`

**Files:**
- Create: `sql/create_chuyen_can_ngoai_le.sql`

Không chạy được SQL từ máy local (Supabase cloud) — chủ app chạy tay trên SQL Editor. Bước này chỉ viết + soát bằng mắt.

- [ ] **Step 1: Viết file SQL**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- MIỄN TRỪ CHUYÊN CẦN (giải trình) — lớp phủ trên bảng chấm công.
-- Mỗi dòng = một NGÀY của một NGƯỜI được admin đánh dấu "đặc biệt" kèm lý do.
-- Luật KPI loại ngày này khỏi điểm trừ chuyên cần (cá nhân + bộ phận) nhưng VẪN
-- hiển thị. Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao KHÔNG gắn cờ thẳng vào cham_cong: bảng cham_cong nạp bằng import
-- `delete ... insert ...` mỗi tháng, gắn cờ ở đó sẽ bị xoá sạch mỗi lần import lại.
-- Bảng này tách riêng nên miễn trừ sống sót qua mọi lần nạp lại chấm công.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create table if not exists chuyen_can_ngoai_le (
  id            bigserial primary key,
  ky            text not null,                    -- 'YYYY-MM', suy từ ngay, lưu sẵn cho dễ lọc
  nhan_vien_id  text not null references nhan_vien(id) on delete cascade,
  ngay          date not null,
  ly_do         text not null,                    -- giải trình BẮT BUỘC
  nguoi_ghi     text,                             -- ai đánh dấu (tên/id admin)
  created_at    timestamptz default now(),

  -- Một người một ngày một bản ghi: bấm đánh dấu lại là upsert, không nhân đôi.
  constraint ccnl_mot_nguoi_mot_ngay unique (nhan_vien_id, ngay)
);

create index if not exists ccnl_ky_idx on chuyen_can_ngoai_le (ky, nhan_vien_id);

-- ── RLS: đọc công khai (KPI vốn công khai), ghi chỉ ADMIN ────────────────────
-- Cùng lý do như bảng cham_cong: miễn trừ quyết định điểm chuyên cần, gắn thẳng
-- với lương thưởng. Chặn ở giao diện thôi thì người biết gọi API vẫn sửa được.
alter table public.chuyen_can_ngoai_le enable row level security;

drop policy if exists ccnl_sel on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_ins on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_upd on public.chuyen_can_ngoai_le;
drop policy if exists ccnl_del on public.chuyen_can_ngoai_le;

create policy ccnl_sel on public.chuyen_can_ngoai_le
  for select to authenticated using (true);

create policy ccnl_ins on public.chuyen_can_ngoai_le
  for insert to authenticated
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy ccnl_upd on public.chuyen_can_ngoai_le
  for update to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN')
  with check (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

create policy ccnl_del on public.chuyen_can_ngoai_le
  for delete to authenticated
  using (coalesce(auth.jwt()->>'nv_role','') = 'ADMIN');

commit;

-- ⚠ NHẮC LẠI như create_cham_cong.sql: sql/security_3_rls_lockdown.sql quét MỌI bảng
--   public, drop hết policy rồi tạo `auth_all using(true)`. Chạy lại file đó SAU file
--   này sẽ mở toang quyền ghi miễn trừ → phải chạy lại file này ngay sau.
--   Kiểm chứng: select policyname from pg_policies where tablename = 'chuyen_can_ngoai_le';
--   Kỳ vọng 4 dòng ccnl_*, TUYỆT ĐỐI không có dòng `auth_all`.

-- KIỂM TRA
select policyname, cmd from pg_policies where tablename = 'chuyen_can_ngoai_le' order by policyname;
```

- [ ] **Step 2: Soát bằng mắt**

Run: `ls sql/ | grep chuyen_can`
Expected: thấy `create_chuyen_can_ngoai_le.sql`. Đối chiếu `sql/create_cham_cong.sql` — cùng khuôn RLS 4 policy, cùng cảnh báo lockdown.

- [ ] **Step 3: Commit**

```bash
git add sql/create_chuyen_can_ngoai_le.sql
git commit -m "feat(kpi): bang chuyen_can_ngoai_le cho mien tru chuyen can"
```

---

## Task 2: Engine — chuyên cần cá nhân loại ngày miễn + ghi chú theo ngày

**Files:**
- Modify: `src/lib/kpiTuDong.js` (hàm `luatChuyenCanCaNhan`, khối "── Chuyên cần ──")
- Test: `src/lib/kpiTuDong.test.js` (describe `luật CHUYEN_CAN_CA_NHAN`)

- [ ] **Step 1: Viết test mới + cập nhật test cũ (để chúng fail)**

Trong `src/lib/kpiTuDong.test.js`, describe `luật CHUYEN_CAN_CA_NHAN`, **thay** test `'hai bậc KHÔNG cộng chồng…'` bằng bản dưới, và **thêm** 2 test mới vào cuối describe đó:

```js
  it('hai bậc KHÔNG cộng chồng — muộn 20 phút trừ 5, không phải 6', () => {
    const kq = luat({ chi_tieu: 10 }, [], [], [cc({ di_muon_phut: 20, ngay: '2026-07-06' })]);
    expect(kq.tiLe).toBe(0.5);
    expect(kq.ghiChu).toContain('Đi muộn 1 ngày (−5): 6/7 (20′)');
    expect(kq.ghiChu).not.toContain('6–15 phút');
  });

  it('ngày được miễn không tính vào điểm trừ', () => {
    const ds = [
      cc({ nghi: true, ngay: '2026-07-01' }),
      cc({ nghi: true, ngay: '2026-07-02', mien: true }),
      cc({ nghi: true, ngay: '2026-07-03', mien: true }),
    ];
    // ccTru còn 1 ngày nghỉ (07-01) → trong 1 ngày phép → không trừ.
    expect(luat({ chi_tieu: 10 }, [], [], ds).tiLe).toBe(1);
  });

  it('ghi chú nêu ngày muộn/nghỉ cụ thể + ngày miễn, bỏ mục 0', () => {
    const ds = [
      cc({ di_muon_phut: 15, ngay: '2026-07-06' }),
      cc({ nghi: true, ngay: '2026-07-07' }),
      cc({ nghi: true, ngay: '2026-07-08' }),
      cc({ nghi: true, ngay: '2026-07-01', mien: true }),
    ];
    const g = luat({ chi_tieu: 10 }, [], [], ds).ghiChu;
    expect(g).toContain('6/7 (15′)');
    expect(g).toContain('Nghỉ 2 ngày, quá 1 phép');
    expect(g).toContain('7/7');
    expect(g).toContain('Miễn 1 ngày có giải trình');
    expect(g).toContain('1/7');
    expect(g).not.toContain('lần muộn quá 15 phút');
  });
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `npm test -- kpiTuDong`
Expected: FAIL ở describe `luật CHUYEN_CAN_CA_NHAN` (ghi chú còn định dạng cũ, chưa loại ngày `mien`).

- [ ] **Step 3: Thêm 3 helper vào đầu khối "── Chuyên cần ──"**

Trong `src/lib/kpiTuDong.js`, ngay **trước** dòng `const NGUONG_PHUT = ...`, thêm:

```js
// 'YYYY-MM-DD' → 'd/M' (bỏ số 0 đầu). Ghi chú chuyên cần cần NGÀY cụ thể chứ không chỉ
// số đếm — người bị trừ điểm phải tra được là ngày nào, không phải "nghỉ 2 ngày" chung chung.
const ngayDM = ngay => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ngay || ''));
  return m ? `${Number(m[2])}/${Number(m[1])}` : String(ngay || '');
};

// Số ngày tối đa liệt kê trong một mảnh ghi chú. Ô ghi chú nằm trong ô bảng và bản in A4,
// liệt kê 25 ngày là vỡ ô — cắt bớt, ghi "…+N" để người đọc biết còn nữa.
const MAX_NGAY = 8;
const noiNgay = ds => {
  const ten = ds.slice(0, MAX_NGAY).join(', ');
  return ds.length > MAX_NGAY ? `${ten} …+${ds.length - MAX_NGAY}` : ten;
};
```

- [ ] **Step 4: Thay toàn bộ hàm `luatChuyenCanCaNhan`**

Thay hàm hiện tại bằng:

```js
function luatChuyenCanCaNhan(ct, viec, sanXuat, chamCong = []) {
  if (!chamCong.length) {
    return { tiLe: null, nhuongChamTay: true, ghiChu: 'Chưa có dữ liệu chấm công trong tháng — chưa có căn cứ chấm.' };
  }

  // Ngày được miễn (giải trình) KHÔNG tính điểm trừ — nhưng vẫn nêu ở ghi chú.
  const ccTru = chamCong.filter(c => !c.mien);
  const theoNgay = (a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0);

  const muonNgay = ccTru.filter(c => (Number(c.di_muon_phut) || 0) > 5).slice().sort(theoNgay);
  // Hai bậc TÁCH RỜI, không cộng chồng: quá 15 phút trừ 5, còn 6–15 phút trừ 1.
  const nang = ccTru.filter(c => (Number(c.di_muon_phut) || 0) > 15).length;
  const nhe = ccTru.filter(c => { const p = Number(c.di_muon_phut) || 0; return p > 5 && p <= 15; }).length;

  const nghiNgay = ccTru.filter(c => c.nghi).slice().sort(theoNgay);
  const nghi = nghiNgay.length;
  const vuotPhep = Math.max(0, nghi - NGAY_PHEP_THANG);
  const truMuon = nang * 5 + nhe * 1;
  const truNghi = vuotPhep * 3;
  const tru = truMuon + truNghi;

  const mienNgay = chamCong.filter(c => c.mien).slice().sort(theoNgay);

  const phan = [];
  if (muonNgay.length) {
    const ds = muonNgay.map(c => `${ngayDM(c.ngay)} (${Number(c.di_muon_phut)}′)`);
    phan.push(`Đi muộn ${muonNgay.length} ngày (−${truMuon}): ${noiNgay(ds)}.`);
  }
  if (nghi) {
    const ds = nghiNgay.map(c => ngayDM(c.ngay));
    phan.push(vuotPhep > 0
      ? `Nghỉ ${nghi} ngày, quá ${vuotPhep} phép (−${truNghi}): ${noiNgay(ds)}.`
      : `Nghỉ ${nghi} ngày (trong phép): ${noiNgay(ds)}.`);
  }
  if (mienNgay.length) {
    phan.push(`Miễn ${mienNgay.length} ngày có giải trình (không trừ): ${noiNgay(mienNgay.map(c => ngayDM(c.ngay)))}.`);
  }
  if (!tru && !mienNgay.length) {
    phan.push('Không muộn, không nghỉ quá phép — đủ điểm.');
  }

  const ghiChu = `Tự động: ${phan.join(' ')}`
    + ' Chưa tính có phép/không phép, quên/sai chấm công — chốt tay đè lên.';

  return { ...tuDiemTru(ct, tru, ghiChu), nhuongChamTay: true };
}
```

- [ ] **Step 5: Chạy test để thấy pass**

Run: `npm test -- kpiTuDong`
Expected: PASS — describe `luật CHUYEN_CAN_CA_NHAN` xanh. Các số điểm cũ không đổi (chỉ ghi chú đổi).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpiTuDong.js src/lib/kpiTuDong.test.js
git commit -m "feat(kpi): chuyen can ca nhan loai ngay mien + ghi chu theo ngay"
```

---

## Task 3: Engine — chuyên cần bộ phận loại ngày miễn

**Files:**
- Modify: `src/lib/kpiTuDong.js` (hàm `luatChuyenCanBoPhan`)
- Test: `src/lib/kpiTuDong.test.js` (describe `luật CHUYEN_CAN_BO_PHAN`)

- [ ] **Step 1: Thêm 2 test mới (fail)**

Thêm vào cuối describe `luật CHUYEN_CAN_BO_PHAN (trung bình đầu người)`:

```js
  it('ngày được miễn không tính vào phút/nghỉ của bộ phận', () => {
    const ds = [
      cc('a', { nghi: true, ngay: '2026-07-01' }),
      cc('a', { nghi: true, ngay: '2026-07-02', mien: true }),
    ];
    // ccTru còn 1 ngày nghỉ / 1 người → trong phép → không trừ.
    expect(luat({ chi_tieu: 10 }, [], [], ds, ['a']).tiLe).toBe(1);
  });

  it('ghi chú nêu số ngày miễn của nhóm', () => {
    const ds = [cc('a', { nghi: true, ngay: '2026-07-01', mien: true })];
    expect(luat({ chi_tieu: 10 }, [], [], ds, ['a']).ghiChu).toContain('miễn 1 ngày có giải trình');
  });
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `npm test -- kpiTuDong`
Expected: FAIL 2 test mới (luật chưa loại `mien`, ghi chú chưa có mệnh đề miễn).

- [ ] **Step 3: Thay toàn bộ hàm `luatChuyenCanBoPhan`**

```js
function luatChuyenCanBoPhan(ct, viec, sanXuat, chamCong = [], thanhVien = []) {
  const soNguoi = thanhVien.length;
  if (!soNguoi || !chamCong.length) {
    return { tiLe: null, ghiChu: 'Chưa có dữ liệu chấm công của nhóm trong tháng — chưa có căn cứ chấm.' };
  }

  // Ngày được miễn (giải trình) không tính vào phút trễ lẫn ngày nghỉ của nhóm.
  const ccTru = chamCong.filter(c => !c.mien);
  const soMien = chamCong.length - ccTru.length;

  const phut = ccTru.reduce(
    (s, c) => s + (Number(c.di_muon_phut) || 0) + (Number(c.ve_som_phut) || 0), 0);
  const nghi = ccTru.filter(c => c.nghi).length;
  const phutTB = phut / soNguoi;
  const nghiTB = nghi / soNguoi;
  const vuotPhep = Math.max(0, nghiTB - NGAY_PHEP_THANG);

  const truPhut = truTheoNguong(phutTB, NGUONG_PHUT);
  const truNghi = truTheoNguong(vuotPhep, NGUONG_NGHI);

  const phanMien = soMien ? ` (miễn ${soMien} ngày có giải trình)` : '';
  const ghiChu = `Tự động: ${soNguoi} người — trung bình ${Math.round(phutTB)} phút muộn/về sớm`
    + ` (−${truPhut}) và ${nghiTB.toFixed(1)} ngày nghỉ mỗi người, vượt ${vuotPhep.toFixed(1)}`
    + ` ngày so với ${NGAY_PHEP_THANG} ngày phép (−${truNghi}).`
    + ` Cả nhóm: ${phut} phút, ${nghi} ngày nghỉ${phanMien}.`;

  return tuDiemTru(ct, truPhut + truNghi, ghiChu);
}
```

- [ ] **Step 4: Chạy test để thấy pass**

Run: `npm test -- kpiTuDong`
Expected: PASS — describe bộ phận xanh; các test cũ (`'2 người'`, `'30 phút'`, `'60 phút'`) vẫn đúng.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiTuDong.js src/lib/kpiTuDong.test.js
git commit -m "feat(kpi): chuyen can bo phan loai ngay mien khoi diem tru"
```

---

## Task 4: Engine — hoàn thành công việc ghi lý do trễ/chưa xong

**Files:**
- Modify: `src/lib/kpiTuDong.js` (hàm `luatHoanThanhDungHan` + helper mới)
- Test: `src/lib/kpiTuDong.test.js` (describe `luật HT_CONG_VIEC_DUNG_HAN`)

- [ ] **Step 1: Thêm test mới (fail)**

Thêm vào cuối describe `luật HT_CONG_VIEC_DUNG_HAN`:

```js
  it('việc xong muộn ghi (trễ N ngày), việc chưa xong ghi (chưa xong)', () => {
    const ds = [
      viec({ id: 'A', title: 'Sửa máy', completed_date: '2026-07-13T10:00:00Z' }), // due 07-10 → trễ 3 ngày
      viec({ id: 'B', title: 'Kiểm kê', status: 'IN_PROGRESS', completed_date: null }),
    ];
    const g = luat({ chi_tieu: 10 }, ds).ghiChu;
    expect(g).toContain('Sửa máy (trễ 3 ngày)');
    expect(g).toContain('Kiểm kê (chưa xong)');
  });
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `npm test -- kpiTuDong`
Expected: FAIL — ghi chú hiện chỉ có tên việc, chưa có `(trễ …)` / `(chưa xong)`.

- [ ] **Step 3: Thêm helper `moTaViecChuaDat`**

Trong `src/lib/kpiTuDong.js`, ngay **sau** dòng `const dungHan = t => ...` (trước `function luatHoanThanhDungHan`), thêm:

```js
const MOT_NGAY = 86400000;

// Vì sao một việc KHÔNG đúng hạn: xong nhưng trễ (kèm trễ bao lâu) hay là chưa xong.
// 'chưa xong' khác hẳn 'xong nhưng trễ' — người đọc cần biết để quyết định làm gì tiếp.
function moTaViecChuaDat(t) {
  if (t.status === 'COMPLETED' && t.due_date && t.completed_date) {
    const treMs = new Date(t.completed_date).getTime() - new Date(t.due_date).getTime();
    if (treMs >= MOT_NGAY) return `trễ ${Math.floor(treMs / MOT_NGAY)} ngày`;
    return `trễ ${Math.max(1, Math.ceil(treMs / 3600000))} giờ`;
  }
  return 'chưa xong';
}
```

- [ ] **Step 4: Sửa phần dựng danh sách việc trễ trong `luatHoanThanhDungHan`**

Tìm 3 dòng hiện tại:

```js
  const ten = tre.slice(0, MAX_TEN_TRE).map(t => t.title || t.id).join(', ');
  const them = tre.length > MAX_TEN_TRE ? ` …và ${tre.length - MAX_TEN_TRE} việc nữa` : '';
  const phanTre = tre.length ? ` Chưa đúng hạn: ${ten}${them}.` : '';
```

Thay bằng:

```js
  const ten = tre.slice(0, MAX_TEN_TRE)
    .map(t => `${t.title || t.id} (${moTaViecChuaDat(t)})`).join('; ');
  const them = tre.length > MAX_TEN_TRE ? ` …và ${tre.length - MAX_TEN_TRE} việc nữa` : '';
  const phanTre = tre.length ? ` Chưa đúng hạn: ${ten}${them}.` : '';
```

- [ ] **Step 5: Chạy test để thấy pass**

Run: `npm test -- kpiTuDong`
Expected: PASS — test mới xanh; test cũ (`'Gửi báo cáo tuần 3'`, `'Kiểm kê kho'`, `'3 việc nữa'`, `'Sửa máy'`) vẫn đúng (đều là chuỗi con).

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpiTuDong.js src/lib/kpiTuDong.test.js
git commit -m "feat(kpi): hoan thanh cong viec ghi ro tre bao lau / chua xong"
```

---

## Task 5: Engine — `apDungChamTuDong` nhận `ngoaiLe`, gắn cờ `mien`

**Files:**
- Modify: `src/lib/kpiTuDong.js` (hàm `apDungChamTuDong`)
- Test: `src/lib/kpiTuDong.test.js`

- [ ] **Step 1: Thêm describe test mới (fail)**

Thêm vào cuối `src/lib/kpiTuDong.test.js`:

```js
describe('apDungChamTuDong với miễn trừ (ngoaiLe)', () => {
  const NGAY = '2026-07-23';
  const r = { id: 'ct-cn', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_CA_NHAN', chi_tieu: 10 };
  const cc = ngay => ({ nhan_vien_id: 'a', ky: '2026-07', di_muon_phut: 0, ve_som_phut: 0, nghi: true, ngay });
  const ds = [cc('2026-07-01'), cc('2026-07-02'), cc('2026-07-03')]; // 3 ngày nghỉ

  it('không miễn: nghỉ 3 ngày vượt 2 phép → điểm 4/10', () => {
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY, [], ds);
    expect(kq.rows[0].diem_chot).toBe(4);
  });

  it('miễn 2 ngày → còn 1 nghỉ trong phép → điểm đủ 10', () => {
    const ngoaiLe = [
      { nhan_vien_id: 'a', ngay: '2026-07-02', ly_do: 'ốm' },
      { nhan_vien_id: 'a', ngay: '2026-07-03', ly_do: 'ốm' },
    ];
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY, [], ds, ngoaiLe);
    expect(kq.rows[0].diem_chot).toBe(10);
    const ao = kq.logs.find(l => l.chi_tieu_id === 'ct-cn');
    expect(ao.ly_do).toContain('Miễn 2 ngày có giải trình');
  });

  it('miễn của người khác/ngày khác không lọt vào', () => {
    const ngoaiLe = [
      { nhan_vien_id: 'b', ngay: '2026-07-02', ly_do: 'ốm' },   // khác người
      { nhan_vien_id: 'a', ngay: '2026-07-30', ly_do: 'ốm' },   // ngày không có trong chấm công
    ];
    const kq = apDungChamTuDong([r], [], [], '2026-07', NGAY, [], ds, ngoaiLe);
    expect(kq.rows[0].diem_chot).toBe(4);   // không miễn được ngày nào → vẫn 4
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `npm test -- kpiTuDong`
Expected: FAIL — `apDungChamTuDong` chưa nhận `ngoaiLe`, ngày nghỉ chưa được miễn (test 2 ra 4 thay vì 10).

- [ ] **Step 3: Sửa chữ ký + gắn cờ `mien`**

Trong `src/lib/kpiTuDong.js`, đổi chữ ký hàm:

```js
export function apDungChamTuDong(
  rows = [], logs = [], tasks = [], ky, ngay = homNay(), sanXuat = [], chamCong = [], ngoaiLe = []) {
```

Ngay sau `const ds = rows || [];`, thêm dựng bảng tra miễn trừ:

```js
  // Miễn trừ đặc biệt (giải trình): khoá theo người+ngày, giữ cả lý do để ghi chú nói được.
  const mienSet = new Set();
  const mienMap = new Map();
  for (const x of (ngoaiLe || [])) {
    const k = `${x.nhan_vien_id}|${x.ngay}`;
    mienSet.add(k);
    mienMap.set(k, x.ly_do || null);
  }
```

Tìm khối lọc `cc` hiện tại:

```js
    const cc = (chamCong || []).filter(
      c => thanhVien.includes(c.nhan_vien_id) && String(c.ky || '') === ky);
```

Thay bằng (gắn cờ `mien` cho ngày có trong bảng miễn trừ):

```js
    const cc = (chamCong || [])
      .filter(c => thanhVien.includes(c.nhan_vien_id) && String(c.ky || '') === ky)
      .map(c => {
        const k = `${c.nhan_vien_id}|${c.ngay}`;
        return mienSet.has(k) ? { ...c, mien: true, mien_ly_do: mienMap.get(k) || null } : c;
      });
```

- [ ] **Step 4: Chạy test để thấy pass**

Run: `npm test -- kpiTuDong`
Expected: PASS — cả 3 test mới xanh, toàn bộ file `kpiTuDong.test.js` xanh.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiTuDong.js src/lib/kpiTuDong.test.js
git commit -m "feat(kpi): apDungChamTuDong nhan ngoaiLe, gan co mien cho ngay dac biet"
```

---

## Task 6: KpiTab — tải `chuyen_can_ngoai_le` và truyền vào engine

**Files:**
- Modify: `src/pages/tasks/KpiTab.jsx`

Không có test UI trong repo — kiểm bằng build + lint.

- [ ] **Step 1: Thêm state `ngoaiLe`**

Tìm dòng (khoảng 56):

```jsx
  const [chamCong, setChamCong] = useState([]);  // bảng chấm công của kỳ
```

Thêm ngay sau:

```jsx
  const [ngoaiLe, setNgoaiLe] = useState([]);    // miễn trừ chuyên cần của kỳ
```

- [ ] **Step 2: Tải bảng miễn trừ trong `taiDuLieu`**

Tìm khối tải chấm công hiện tại (kết thúc bằng `dsChamCong = data || [];` trong try/catch). Ngay **sau** khối đó (trước `setRows(ct || []);`), thêm:

```jsx
      // Miễn trừ chuyên cần của kỳ (bảng phủ trên chấm công). Cùng lưới an toàn: hỏng chỗ
      // này không được kéo sập cả màn hình KPI.
      let dsNgoaiLe = [];
      try {
        const { data, error } = await fetchAllRows(() => supabase
          .from('chuyen_can_ngoai_le')
          .select('nhan_vien_id, ngay, ly_do')
          .eq('ky', ky).order('id'));
        if (error) throw error;
        dsNgoaiLe = data || [];
      } catch (err) {
        loiTaiViec = loiTaiViec || err?.message || String(err);
      }
```

Trong nhóm `set*` (cạnh `setChamCong(dsChamCong);`), thêm:

```jsx
      setNgoaiLe(dsNgoaiLe);
```

Trong `catch` cuối (cạnh `setChamCong([]);`), thêm:

```jsx
      setNgoaiLe([]);
```

- [ ] **Step 3: Truyền `ngoaiLe` vào engine**

Tìm:

```jsx
  const { rows: rowsTD, logs: logsTD } = useMemo(
    () => apDungChamTuDong(rows, logs, viec, ky, undefined, sanXuat, chamCong),
    [rows, logs, viec, ky, sanXuat, chamCong]);
```

Thay bằng:

```jsx
  const { rows: rowsTD, logs: logsTD } = useMemo(
    () => apDungChamTuDong(rows, logs, viec, ky, undefined, sanXuat, chamCong, ngoaiLe),
    [rows, logs, viec, ky, sanXuat, chamCong, ngoaiLe]);
```

- [ ] **Step 4: Build + lint**

Run: `npx eslint src/pages/tasks/KpiTab.jsx`
Expected: không có error.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): KpiTab tai chuyen_can_ngoai_le, truyen vao cham tu dong"
```

---

## Task 7: permRegistry cap `edit` + TaskApp truyền `me/perm`

**Files:**
- Modify: `src/lib/permRegistry.js` (dòng tab `cham_cong`, ~46)
- Modify: `src/pages/tasks/TaskApp.jsx` (dòng render ChamCongTab, ~1568)

- [ ] **Step 1: Thêm cap `edit` cho tab `cham_cong`**

Trong `src/lib/permRegistry.js`, tìm:

```js
      // view = xem bảng chấm công (căn cứ của 2 chỉ tiêu KPI chuyên cần)
      { id: 'cham_cong',   label: 'Chấm công', caps: ['view'] },
```

Thay bằng:

```js
      // view = xem bảng chấm công + miễn trừ | edit = đánh dấu/bỏ ngày đặc biệt (miễn trừ)
      { id: 'cham_cong',   label: 'Chấm công', caps: ['view', 'edit'] },
```

- [ ] **Step 2: Truyền `me` + `perm` vào ChamCongTab**

Trong `src/pages/tasks/TaskApp.jsx`, tìm:

```jsx
               : view==='cham_cong' && canSeeTab(me,'tasks','cham_cong') ? h(ChamCongTab, { users })
```

Thay bằng:

```jsx
               : view==='cham_cong' && canSeeTab(me,'tasks','cham_cong') ? h(ChamCongTab, { users, me, perm: getTabPerm(me, 'tasks', 'cham_cong') })
```

(`getTabPerm` đã được import sẵn ở đầu TaskApp.jsx — xác nhận dòng `import { MODULE_PERMS, ALL_PERMS, canSeeTab, getTabPerm } from '../../lib/AuthContext';`.)

- [ ] **Step 3: Build + lint**

Run: `npx eslint src/lib/permRegistry.js src/pages/tasks/TaskApp.jsx`
Expected: không có error.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 4: Commit**

```bash
git add src/lib/permRegistry.js src/pages/tasks/TaskApp.jsx
git commit -m "feat(kpi): them cap edit cho tab cham cong, truyen me/perm"
```

---

## Task 8: ChamCongTab — hiển thị miễn trừ + modal đánh dấu (admin)

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

Component lớn; các sửa đổi độc lập nhau. Làm tuần tự rồi kiểm build/lint/preview ở cuối.

- [ ] **Step 1: Đổi chữ ký + state + tải bảng miễn trừ**

Đổi dòng khai báo component:

```jsx
export default function ChamCongTab({ users = [] }) {
```

thành:

```jsx
export default function ChamCongTab({ users = [], me, perm = {} }) {
  const canEdit = !!perm.edit;
```

Thêm state (cạnh `const [rows, setRows] = useState([]);`):

```jsx
  const [ngoaiLe, setNgoaiLe] = useState([]);
```

Trong `taiDuLieu`, sau khi `setRows(data || [])`, thêm truy vấn thứ 2 (trong cùng try):

```jsx
      const { data: nl, error: loiNl } = await fetchAllRows(() =>
        supabase.from('chuyen_can_ngoai_le').select('*').eq('ky', ky).order('id'));
      if (loiNl) throw loiNl;
      setNgoaiLe(nl || []);
```

Trong `catch` của `taiDuLieu` (cạnh `setRows([])`), thêm:

```jsx
      setNgoaiLe([]);
```

- [ ] **Step 2: Bảng tra miễn trừ + handler bật/tắt**

Sau `const oTraCuu = useMemo(...)` (khoảng dòng 106), thêm:

```jsx
  const ngoaiLeTra = useMemo(() => {
    const m = new Map();
    for (const x of ngoaiLe) m.set(`${x.nhan_vien_id}|${x.ngay}`, x);
    return m;
  }, [ngoaiLe]);

  // Bật (lyDo là chuỗi) hoặc tắt (lyDo = null) miễn trừ cho một (người, ngày).
  // RLS ở DB chỉ cho ADMIN ghi — nút chỉ hiện khi canEdit, còn đây là hàng rào mềm.
  const doiNgoaiLe = useCallback(async (nvId, ngay, lyDo) => {
    setLoi('');
    try {
      if (lyDo == null) {
        const { error } = await supabase.from('chuyen_can_ngoai_le')
          .delete().eq('nhan_vien_id', nvId).eq('ngay', ngay);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chuyen_can_ngoai_le').upsert(
          { ky: ngay.slice(0, 7), nhan_vien_id: nvId, ngay, ly_do: lyDo, nguoi_ghi: me?.name || me?.id || null },
          { onConflict: 'nhan_vien_id,ngay' });
        if (error) throw error;
      }
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }, [me, taiDuLieu]);
```

- [ ] **Step 3: Truyền miễn trừ xuống ô tổng quan + bảng chi tiết**

Trong bảng tổng quan, tìm:

```jsx
                    {dsNgay.map(ngay => (
                      <OChamCong key={ngay} row={oTraCuu.get(`${nv.id}|${ngay}`)} />
                    ))}
```

Thay bằng:

```jsx
                    {dsNgay.map(ngay => (
                      <OChamCong key={ngay} row={oTraCuu.get(`${nv.id}|${ngay}`)}
                        mien={ngoaiLeTra.get(`${nv.id}|${ngay}`)} />
                    ))}
```

Trong nhánh `if (chon) { ... }`, tìm chỗ render `BangChiTietMotNguoi` và thêm props:

```jsx
      <BangChiTietMotNguoi
        ten={nv.ten} ky={ky} nvId={chon}
        rows={rows.filter(r => r.nhan_vien_id === chon)}
        ngoaiLeTra={ngoaiLeTra} canEdit={canEdit} onDoiNgoaiLe={doiNgoaiLe}
        onBack={() => setChon(null)}
      />
```

- [ ] **Step 4: Ô tổng quan hiện dấu miễn trừ**

Thay hàm `OChamCong` bằng:

```jsx
function OChamCong({ row, mien }) {
  if (!row) {
    return (
      <td style={{ ...tdBase, color: '#e2e8f0' }} title="Không có dữ liệu chấm công ngày này">—</td>
    );
  }
  const style = {
    ...tdBase,
    borderBottom: row.nghi_van ? '2px solid #dc2626' : tdBase.borderBottom,
    // Viền trong xanh dương = ngày được miễn trừ (giải trình) — không lẫn với viền đỏ nghi vấn.
    ...(mien ? { boxShadow: 'inset 0 0 0 2px #60a5fa' } : null),
  };
  const title = tieuDeO(row) + (mien ? ` — ĐẶC BIỆT (không trừ KPI): ${mien.ly_do}` : '');
  if (row.nghi) {
    return <td style={{ ...style, background: '#fef9c3', fontWeight: 700 }} title={title}>N</td>;
  }
  if (row.di_muon_phut > 0) {
    return (
      <td style={{ ...style, background: '#fff5f6', color: '#b91c1c', fontWeight: 700 }} title={title}>
        {row.di_muon_phut}
      </td>
    );
  }
  return <td style={{ ...style, color: '#cbd5e1' }} title={title}>·</td>;
}
```

- [ ] **Step 5: Bảng chi tiết một người — cột miễn trừ + modal**

Thay chữ ký + thân `BangChiTietMotNguoi`. Tìm:

```jsx
function BangChiTietMotNguoi({ ten, ky, rows, onBack }) {
  const dong = useMemo(
    () => [...rows].sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)),
    [rows]);
```

Thay bằng:

```jsx
function BangChiTietMotNguoi({ ten, ky, nvId, rows, ngoaiLeTra, canEdit, onDoiNgoaiLe, onBack }) {
  const dong = useMemo(
    () => [...rows].sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)),
    [rows]);
  const [modalNgay, setModalNgay] = useState(null);   // ngày đang nhập lý do
  const [lyDoInput, setLyDoInput] = useState('');
  const mienCua = ngay => ngoaiLeTra?.get(`${nvId}|${ngay}`);

  const moModal = (ngay, lyDoCu) => { setLyDoInput(lyDoCu || ''); setModalNgay(ngay); };
  const luuModal = () => {
    const t = lyDoInput.trim();
    if (!t) return;
    onDoiNgoaiLe(nvId, modalNgay, t);
    setModalNgay(null);
  };
```

Trong `<thead><tr>` của bảng chi tiết, sau `<th style={thChiTiet.left}>Ghi chú</th>`, thêm cột (chỉ khi `canEdit`):

```jsx
              {canEdit && <th style={thChiTiet.left}>Đặc biệt</th>}
```

Trong `<tbody>`, thay dòng render (`dong.map(r => ( ... ))`) — cụ thể ô "Ghi chú" và thêm ô "Đặc biệt". Tìm ô ghi chú hiện tại:

```jsx
                <td style={{ ...tdChiTiet.body, color: r.nghi_van ? '#b91c1c' : '#94a3b8' }}>
                  {r.nghi_van
                    ? 'Máy chấm công ghi giờ ra sớm hơn lượt quét buổi chiều — phần về sớm đã bị bỏ khi tính KPI.'
                    : ''}
                </td>
              </tr>
```

Thay bằng:

```jsx
                <td style={{ ...tdChiTiet.body, color: r.nghi_van ? '#b91c1c' : '#94a3b8' }}>
                  {mienCua(r.ngay) && (
                    <div style={{ color: '#2563eb', fontWeight: 600 }}>
                      Đặc biệt — {mienCua(r.ngay).ly_do}
                    </div>
                  )}
                  {r.nghi_van
                    ? 'Máy chấm công ghi giờ ra sớm hơn lượt quét buổi chiều — phần về sớm đã bị bỏ khi tính KPI.'
                    : ''}
                </td>
                {canEdit && (
                  <td style={tdChiTiet.body}>
                    {mienCua(r.ngay) ? (
                      <button onClick={() => onDoiNgoaiLe(nvId, r.ngay, null)} style={nutBoDacBiet}>
                        Bỏ đặc biệt
                      </button>
                    ) : (
                      <button onClick={() => moModal(r.ngay, '')} style={nutDacBiet}>
                        Đánh dấu đặc biệt
                      </button>
                    )}
                  </td>
                )}
              </tr>
```

Ngay **trước** `</div>` đóng của `BangChiTietMotNguoi` (sau khối `<div style={{ overflowX: 'auto' ... }}>...</div>`), thêm modal:

```jsx
      {modalNgay && (
        <div onClick={() => setModalNgay(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>
              Đánh dấu đặc biệt — {ngayGon(modalNgay)}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 10 }}>
              Ngày này sẽ KHÔNG bị trừ điểm chuyên cần (cá nhân + bộ phận), nhưng vẫn hiển thị. Bắt buộc nhập lý do giải trình.
            </div>
            <textarea
              value={lyDoInput} onChange={e => setLyDoInput(e.target.value)} rows={3}
              placeholder="VD: nghỉ ốm có đơn, đi khám bệnh…"
              style={{ ...oInput, resize: 'vertical' }} autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setModalNgay(null)} style={nutHuy}>Huỷ</button>
              <button onClick={luuModal} disabled={!lyDoInput.trim()} style={nutLuu}>Lưu</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Thêm style cho các nút mới**

Ở cuối file (khối Style), thêm:

```jsx
const nutDacBiet = {
  border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb',
  fontSize: '0.72rem', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};
const nutBoDacBiet = {
  border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
  fontSize: '0.72rem', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};
const nutHuy = {
  border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
  fontSize: '0.78rem', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
};
const nutLuu = {
  border: 'none', background: '#2563eb', color: '#fff',
  fontSize: '0.78rem', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600,
};
```

- [ ] **Step 7: Build + lint**

Run: `npx eslint src/pages/tasks/ChamCongTab.jsx`
Expected: không có error.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 8: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(kpi): tab Cham cong hien mien tru + admin danh dau dac biet"
```

---

## Task 9: Kiểm thử tổng thể + xem thật

**Files:** không sửa — chỉ kiểm.

- [ ] **Step 1: Toàn bộ test xanh**

Run: `npm test`
Expected: PASS toàn bộ, không có test đỏ. Đặc biệt `kpiTuDong.test.js` và `permRegistry.test.js`.

- [ ] **Step 2: Build sạch**

Run: `npm run build`
Expected: build thành công, không lỗi.

- [ ] **Step 3: Xem thật bằng preview (tuỳ chọn nếu có Supabase kết nối)**

- Mở dev server (preview_start theme `.claude/launch.json` hoặc `npm run dev`), vào tab **Chấm công**:
  - Người thường: thấy badge ngày đặc biệt (nếu có) + tooltip, KHÔNG thấy nút.
  - Admin: vào chi tiết một người → thấy nút "Đánh dấu đặc biệt" mỗi dòng → nhập lý do → lưu → ngày đó có badge xanh.
- Sang tab **KPI** cùng kỳ: mở chỉ tiêu CHUYÊN CẦN CÁ NHÂN của người vừa đánh dấu → ghi chú nêu "Miễn N ngày có giải trình", điểm trừ giảm tương ứng.

- [ ] **Step 4: Chạy bảng SQL trên Supabase**

Nhắc chủ app: mở Supabase SQL Editor, dán chạy `sql/create_chuyen_can_ngoai_le.sql` (nếu chưa). Không có bước này thì tab Chấm công báo lỗi tải `chuyen_can_ngoai_le`.

---

## Ghi chú triển khai

- **Thứ tự chạy DB**: bảng SQL (Task 1) phải chạy trên Supabase trước khi phần UI/KPI đọc được — nếu chưa chạy, query `chuyen_can_ngoai_le` sẽ lỗi (đã bọc lưới an toàn ở KpiTab, nhưng ChamCongTab sẽ hiện lỗi tải).
- **Số điểm không đổi cho dữ liệu chưa có miễn trừ**: mọi thay đổi luật đều giữ nguyên công thức trừ; chỉ khi có bản ghi trong `chuyen_can_ngoai_le` mới có khác biệt điểm.
- **Không đụng** Excel/bản in — chúng nhận rows/logs đã tính từ KpiTab.
