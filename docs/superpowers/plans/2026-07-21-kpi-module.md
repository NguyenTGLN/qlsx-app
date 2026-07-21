# Module KPI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tab KPI vào phân hệ Công việc — nhân viên xem điểm KPI hiện tại kèm bằng chứng từng lần cộng/trừ, quản lý chấm điểm và sửa bảng chỉ tiêu ngay trên app, xuất Excel/in được.

**Architecture:** Engine tính điểm là hàm thuần trong `src/lib/kpiEngine.js` (không đụng DB, test bằng vitest). Dữ liệu ở 2 bảng Supabase: `kpi_chi_tieu` (bảng chỉ tiêu nhân bản theo kỳ) và `kpi_nhat_ky` (nhật ký cộng/trừ có dấu). Giao diện là component JSX riêng `src/pages/tasks/KpiTab.jsx`, TaskApp chỉ wire tab. Script Node đọc file `.xls` gốc sinh ra SQL seed để người soát trước khi chạy.

**Tech Stack:** React 19 (JSX), Supabase JS, vitest, exceljs + file-saver (xuất Excel), xlsx/SheetJS (đọc .xls khi import), lucide-react (icon).

**Spec:** `docs/superpowers/specs/2026-07-21-kpi-module-design.md`

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `sql/create_kpi_module.sql` | Tạo 2 bảng + index + RLS. Chạy tay trên Supabase |
| `src/lib/kpiEngine.js` | Toàn bộ luật tính điểm. Hàm thuần, không import supabase |
| `src/lib/kpiEngine.test.js` | Test engine |
| `src/lib/kpiExcel.js` | Xuất Excel bảng KPI bằng exceljs |
| `src/lib/kpiExcel.test.js` | Test phần dựng dữ liệu cho Excel |
| `scripts/import-kpi-excel.mjs` | Đọc `KPI/*.xls` → sinh `sql/seed_kpi_2026_06.sql` |
| `src/pages/tasks/KpiTab.jsx` | Màn hình danh sách + bảng KPI 1 người + popup diễn giải |
| `src/components/KpiPrint.jsx` | Bản in A4 bảng KPI |
| `src/lib/permRegistry.js` | Thêm tab `kpi` vào module `tasks` (sửa) |
| `src/pages/tasks/TaskApp.jsx` | Wire tab KPI (sửa) |

Engine tách khỏi UI để test được không cần DOM/mạng — theo đúng nếp `productionAlloc.js`, `capacityGuard.js` đang có.

---

## Task 1: Migration SQL

**Files:**
- Create: `sql/create_kpi_module.sql`

- [ ] **Step 1: Viết file SQL**

```sql
-- Module KPI — phân hệ Công việc.
-- Mỗi kỳ (tháng) mỗi nhân viên một bộ dòng chỉ tiêu riêng. Sang kỳ mới = copy bộ kỳ
-- trước (INSERT...SELECT) → kỳ cũ bất biến, tra soát lịch sử được.

create table if not exists kpi_chi_tieu (
  id               uuid primary key default gen_random_uuid(),
  ky               text not null,                        -- '2026-06'
  cap_do           text not null default 'CA_NHAN',      -- 'CA_NHAN' | 'BO_PHAN'
  nhan_vien_id     text references nhan_vien(id) on delete cascade,
  lien_ket_bo_phan text,                                 -- khoá nhóm chấm chung
  nhom             text,
  thu_tu           int not null default 0,
  ten              text not null,
  mo_ta            text,
  chi_tieu         numeric,                              -- null = dòng thưởng ngoài trọng số
  trong_so         numeric not null default 0,
  cach_cham        text not null default 'NHAT_KY',      -- 'NHAT_KY' | 'THU_CONG' | 'TU_DONG'
  diem_tu_cham     numeric,
  diem_chot        numeric,
  chot_boi         text,
  chot_luc         timestamptz,
  created_at       timestamptz default now(),
  constraint kpi_chi_tieu_cap_do_hop_le check (
    (cap_do = 'CA_NHAN' and nhan_vien_id is not null) or
    (cap_do = 'BO_PHAN' and nhan_vien_id is null and lien_ket_bo_phan is not null)
  )
);

-- Nhật ký CÓ DẤU: âm = trừ, dương = cộng. Mọi biến động điểm đều có bằng chứng ở đây.
create table if not exists kpi_nhat_ky (
  id          uuid primary key default gen_random_uuid(),
  chi_tieu_id uuid not null references kpi_chi_tieu(id) on delete cascade,
  ngay        date not null,
  so_diem     numeric not null,
  ly_do       text not null,
  dinh_kem    jsonb,
  nguoi_ghi   text,
  nguon       text not null default 'TAY',               -- 'TAY' | 'TU_DONG'
  ref_id      text,                                      -- id bản ghi gốc khi nguon='TU_DONG'
  created_at  timestamptz default now()
);

create index if not exists kpi_chi_tieu_ky_nv  on kpi_chi_tieu(ky, nhan_vien_id);
create index if not exists kpi_chi_tieu_ky_bp  on kpi_chi_tieu(ky, lien_ket_bo_phan);
create index if not exists kpi_nhat_ky_ct      on kpi_nhat_ky(chi_tieu_id);

-- Chống chấm tự động chèn trùng khi job chạy lại: 1 chỉ tiêu + 1 nguồn gốc = 1 dòng.
create unique index if not exists kpi_nhat_ky_tu_dong_uniq
  on kpi_nhat_ky(chi_tieu_id, ref_id) where nguon = 'TU_DONG';

-- RLS: điểm công khai toàn bộ (quyết định nghiệp vụ) → mọi user đăng nhập đọc được.
-- Ghi thì gate ở tầng app theo cap của tab (permRegistry), giống các bảng khác trong app.
alter table kpi_chi_tieu enable row level security;
alter table kpi_nhat_ky  enable row level security;

drop policy if exists kpi_chi_tieu_all on kpi_chi_tieu;
create policy kpi_chi_tieu_all on kpi_chi_tieu for all
  to authenticated using (true) with check (true);

drop policy if exists kpi_nhat_ky_all on kpi_nhat_ky;
create policy kpi_nhat_ky_all on kpi_nhat_ky for all
  to authenticated using (true) with check (true);
```

- [ ] **Step 2: Kiểm cú pháp bằng mắt, đối chiếu nếp file SQL sẵn có**

Run: `ls sql/ | head -5` — xác nhận file mới nằm cùng chỗ. Không chạy được SQL từ máy local (Supabase cloud), chủ app sẽ chạy tay trên SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add sql/create_kpi_module.sql
git commit -m "feat(kpi): migration 2 bang kpi_chi_tieu va kpi_nhat_ky"
```

---

## Task 2: Engine — điểm đạt từ nhật ký

**Files:**
- Create: `src/lib/kpiEngine.js`
- Test: `src/lib/kpiEngine.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, it, expect } from 'vitest';
import { diemDat } from './kpiEngine';

describe('diemDat', () => {
  it('không có nhật ký thì đạt tối đa', () => {
    expect(diemDat({ chi_tieu: 10 }, [])).toBe(10);
  });

  it('trừ dần theo nhật ký âm', () => {
    const logs = [{ so_diem: -1 }, { so_diem: -3 }, { so_diem: -3 }];
    expect(diemDat({ chi_tieu: 10 }, logs)).toBe(3);
  });

  it('sàn 0 — trừ quá chỉ tiêu không ra số âm', () => {
    expect(diemDat({ chi_tieu: 10 }, [{ so_diem: -15 }])).toBe(0);
  });

  it('trần chi_tieu — cộng vượt không quá chỉ tiêu', () => {
    expect(diemDat({ chi_tieu: 10 }, [{ so_diem: 5 }])).toBe(10);
  });

  it('diem_chot ghi đè hoàn toàn nhật ký', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: 3 }, [{ so_diem: -1 }])).toBe(3);
  });

  it('diem_chot = 0 vẫn được tôn trọng (không nhầm với null)', () => {
    expect(diemDat({ chi_tieu: 10, diem_chot: 0 }, [])).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- kpiEngine`
Expected: FAIL — `Failed to resolve import "./kpiEngine"`

- [ ] **Step 3: Viết implementation tối thiểu**

```js
// src/lib/kpiEngine.js
// Luật tính KPI — hàm thuần, KHÔNG import supabase. Mọi màn hình KPI và phần
// xuất Excel đều gọi ở đây, nên luật chỉ được viết một chỗ này.
//
// Nguồn nghiệp vụ: KPI/Copy of KPI kho 06.2026.xls (16 sheet, công thức giống nhau).
//   tỉ lệ đạt  = điểm đạt / chỉ tiêu   (trần 100%)
//   quy đổi    = tỉ lệ × trọng số
//   tổng KPI   = Σ quy đổi             (Σ trọng số = 100)

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Điểm đạt của MỘT chỉ tiêu. `diem_chot` (quản lý chốt tay) thắng nhật ký.
// So sánh với null/undefined chứ không dùng falsy — diem_chot = 0 là giá trị hợp lệ.
export function diemDat(ct, logs = []) {
  if (ct.diem_chot !== null && ct.diem_chot !== undefined) return num(ct.diem_chot);
  const tong = logs.reduce((s, l) => s + num(l.so_diem), 0);
  const max = num(ct.chi_tieu);
  return clamp(max + tong, 0, max);
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- kpiEngine`
Expected: PASS — 6 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiEngine.js src/lib/kpiEngine.test.js
git commit -m "feat(kpi): engine tinh diem dat tu nhat ky"
```

---

## Task 3: Engine — quy đổi 1 chỉ tiêu + chỉ tiêu bộ phận

**Files:**
- Modify: `src/lib/kpiEngine.js`
- Test: `src/lib/kpiEngine.test.js`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/kpiEngine.test.js`:

```js
import { tinhChiTieu } from './kpiEngine';

describe('tinhChiTieu', () => {
  it('quy đổi theo trọng số — ca thật của Bích T6/2026', () => {
    const r = tinhChiTieu({ chi_tieu: 10, trong_so: 7, diem_chot: 3 }, []);
    expect(r.diemDat).toBe(3);
    expect(r.tiLeDat).toBeCloseTo(0.3);
    expect(r.diemQuyDoi).toBeCloseTo(2.1);
    expect(r.diemMat).toBeCloseTo(4.9);
  });

  it('trần 100% — điểm đạt vượt chỉ tiêu vẫn chỉ tính 100%', () => {
    const r = tinhChiTieu({ chi_tieu: 10, trong_so: 5, diem_chot: 20 }, []);
    expect(r.tiLeDat).toBe(1);
    expect(r.diemQuyDoi).toBe(5);
    expect(r.diemMat).toBe(0);
  });

  it('dòng thưởng ngoài trọng số (chi_tieu null) cộng thẳng, không mất điểm', () => {
    const r = tinhChiTieu({ chi_tieu: null, trong_so: 0 }, [{ so_diem: 1.5 }]);
    expect(r.tiLeDat).toBeNull();
    expect(r.diemQuyDoi).toBeCloseTo(1.5);
    expect(r.diemMat).toBe(0);
  });

  it('chỉ tiêu bộ phận: một điểm đạt, hai trọng số → hai quy đổi khác nhau', () => {
    const bpMap = { CHUYEN_CAN_KHO: 0 }; // điểm đạt chung = 0/10
    const nguyen = tinhChiTieu(
      { chi_tieu: 10, trong_so: 5, lien_ket_bo_phan: 'CHUYEN_CAN_KHO' }, [], bpMap);
    const duong = tinhChiTieu(
      { chi_tieu: 10, trong_so: 9, lien_ket_bo_phan: 'CHUYEN_CAN_KHO' }, [], bpMap);
    expect(nguyen.diemMat).toBe(5);
    expect(duong.diemMat).toBe(9);
  });

  it('chỉ tiêu bộ phận bỏ qua nhật ký riêng của dòng cá nhân', () => {
    const r = tinhChiTieu(
      { chi_tieu: 10, trong_so: 5, lien_ket_bo_phan: 'X' },
      [{ so_diem: -10 }],            // nhật ký này KHÔNG được tính
      { X: 8 });
    expect(r.diemDat).toBe(8);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- kpiEngine`
Expected: FAIL — `tinhChiTieu is not a function`

- [ ] **Step 3: Viết implementation**

Thêm vào `src/lib/kpiEngine.js`:

```js
// Kết quả tính của MỘT dòng chỉ tiêu.
// `bpMap`: { [lien_ket_bo_phan]: điểm đạt của dòng BO_PHAN } — xem tinhBangKpi().
//
// Dòng có lien_ket_bo_phan lấy ĐIỂM ĐẠT từ dòng bộ phận nhưng giữ TRỌNG SỐ riêng:
// chấm một lần cho cả bộ phận, mỗi người quy đổi theo trọng số của mình.
export function tinhChiTieu(ct, logs = [], bpMap = {}) {
  const laBoPhan = !!ct.lien_ket_bo_phan;
  const dat = laBoPhan ? num(bpMap[ct.lien_ket_bo_phan]) : diemDat(ct, logs);
  const max = num(ct.chi_tieu);
  const trongSo = num(ct.trong_so);

  // chi_tieu null/0 = dòng thưởng ngoài trọng số: cộng thẳng điểm nhật ký, không có tỉ lệ.
  if (!max) {
    const thuong = logs.reduce((s, l) => s + num(l.so_diem), 0);
    return { diemDat: dat, tiLeDat: null, diemQuyDoi: thuong, diemMat: 0, laThuong: true };
  }

  const tiLeDat = clamp(dat / max, 0, 1);
  const diemQuyDoi = tiLeDat * trongSo;
  return { diemDat: dat, tiLeDat, diemQuyDoi, diemMat: trongSo - diemQuyDoi, laThuong: false };
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- kpiEngine`
Expected: PASS — 11 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiEngine.js src/lib/kpiEngine.test.js
git commit -m "feat(kpi): quy doi diem 1 chi tieu, ho tro chi tieu bo phan"
```

---

## Task 4: Engine — tính cả bảng của một người

**Files:**
- Modify: `src/lib/kpiEngine.js`
- Test: `src/lib/kpiEngine.test.js`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/kpiEngine.test.js`:

```js
import { tinhBangKpi, kiemTraTrongSo } from './kpiEngine';

// Bảng thật của Lê Văn Bích, kỳ 2026-06, rút gọn còn các dòng có mất điểm
// + 1 dòng gộp đại diện 8 chỉ tiêu đạt đủ (tổng trọng số 84).
function bangBich() {
  const rows = [
    { id: 'bp1', cap_do: 'BO_PHAN', lien_ket_bo_phan: 'CHUYEN_CAN_KHO',
      ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 0, diem_chot: 0 },
    { id: 'c1', cap_do: 'CA_NHAN', lien_ket_bo_phan: 'CHUYEN_CAN_KHO',
      ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, trong_so: 5, nhom: 'A' },
    { id: 'c2', cap_do: 'CA_NHAN', ten: 'CHUYÊN CẦN CÁ NHÂN',
      chi_tieu: 10, trong_so: 7, diem_chot: 3, nhom: 'A' },
    { id: 'c3', cap_do: 'CA_NHAN', ten: 'ĐÓNG GÓP CẢI TIẾN',
      chi_tieu: 2, trong_so: 4, diem_chot: 0, nhom: 'C' },
    { id: 'c4', cap_do: 'CA_NHAN', ten: 'CÁC CHỈ TIÊU ĐẠT ĐỦ',
      chi_tieu: 10, trong_so: 84, diem_chot: 10, nhom: 'B' },
  ];
  return rows;
}

describe('tinhBangKpi', () => {
  it('tổng điểm Bích T6/2026 = 86.1 (đối chiếu Excel thật)', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.tongKpi).toBeCloseTo(86.1);
    expect(r.tongMat).toBeCloseTo(13.9);
  });

  it('dòng BO_PHAN không nằm trong danh sách hiển thị của cá nhân', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.dong.map(d => d.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('danhSachMatDiem xếp giảm dần theo điểm mất', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.danhSachMatDiem.map(d => d.id)).toEqual(['c1', 'c2', 'c3']);
    expect(r.danhSachMatDiem[0].diemMat).toBe(5);
  });

  it('nhật ký được gom đúng về từng chỉ tiêu', () => {
    const rows = [{ id: 'c1', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 100 }];
    const logs = [{ chi_tieu_id: 'c1', so_diem: -4, ly_do: 'Đi muộn' }];
    const r = tinhBangKpi(rows, logs);
    expect(r.tongKpi).toBeCloseTo(60);
    expect(r.dong[0].logs).toHaveLength(1);
  });

  it('dòng liên kết bộ phận trả __bpId để ghi nhật ký đúng chỗ chung', () => {
    const r = tinhBangKpi(bangBich(), []);
    expect(r.dong.find(d => d.id === 'c1').__bpId).toBe('bp1');
    expect(r.dong.find(d => d.id === 'c2').__bpId).toBeUndefined();
  });

  it('dòng thưởng đẩy tổng vượt 100', () => {
    const rows = [
      { id: 'a', cap_do: 'CA_NHAN', ten: 'X', chi_tieu: 10, trong_so: 100, diem_chot: 10 },
      { id: 'b', cap_do: 'CA_NHAN', ten: 'THƯỞNG', chi_tieu: null, trong_so: 0 },
    ];
    const r = tinhBangKpi(rows, [{ chi_tieu_id: 'b', so_diem: 2 }]);
    expect(r.tongKpi).toBeCloseTo(102);
  });
});

describe('kiemTraTrongSo', () => {
  it('Σ trọng số = 100 thì không cảnh báo', () => {
    expect(kiemTraTrongSo(bangBich()).hopLe).toBe(true);
  });

  it('Σ trọng số ≠ 100 thì cảnh báo kèm độ lệch', () => {
    const r = kiemTraTrongSo([{ cap_do: 'CA_NHAN', chi_tieu: 10, trong_so: 90 }]);
    expect(r.hopLe).toBe(false);
    expect(r.tong).toBe(90);
    expect(r.lech).toBe(-10);
  });

  it('bỏ qua dòng BO_PHAN và dòng thưởng khi cộng trọng số', () => {
    const r = kiemTraTrongSo([
      { cap_do: 'BO_PHAN', lien_ket_bo_phan: 'X', chi_tieu: 10, trong_so: 999 },
      { cap_do: 'CA_NHAN', chi_tieu: null, trong_so: 999 },
      { cap_do: 'CA_NHAN', chi_tieu: 10, trong_so: 100 },
    ]);
    expect(r.tong).toBe(100);
    expect(r.hopLe).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- kpiEngine`
Expected: FAIL — `tinhBangKpi is not a function`

- [ ] **Step 3: Viết implementation**

Thêm vào `src/lib/kpiEngine.js`:

```js
// Tính cả bảng KPI của MỘT người trong MỘT kỳ.
//   rows: mọi dòng kpi_chi_tieu của kỳ đó — gồm cả dòng cap_do='BO_PHAN' (dùng để lấy
//         điểm chung, KHÔNG hiển thị như chỉ tiêu của cá nhân).
//   logs: mọi dòng kpi_nhat_ky liên quan, gom theo chi_tieu_id.
export function tinhBangKpi(rows = [], logs = []) {
  const logMap = new Map();
  for (const l of logs) {
    if (!logMap.has(l.chi_tieu_id)) logMap.set(l.chi_tieu_id, []);
    logMap.get(l.chi_tieu_id).push(l);
  }

  // Điểm đạt chung của từng nhóm bộ phận, tính trước vì dòng cá nhân phụ thuộc vào nó.
  const bpMap = {};
  for (const r of rows) {
    if (r.cap_do !== 'BO_PHAN') continue;
    bpMap[r.lien_ket_bo_phan] = diemDat(r, logMap.get(r.id) || []);
  }

  const dong = rows
    .filter(r => r.cap_do !== 'BO_PHAN')
    .map(r => {
      const rLogs = logMap.get(r.id) || [];
      // Dòng liên kết bộ phận: bằng chứng VÀ chỗ ghi nhật ký đều nằm ở dòng chung,
      // không phải dòng cá nhân. `__bpId` để form ghi điểm biết insert vào đâu.
      const bpRow = r.lien_ket_bo_phan
        ? rows.find(x => x.cap_do === 'BO_PHAN' && x.lien_ket_bo_phan === r.lien_ket_bo_phan)
        : null;
      return {
        ...r,
        ...tinhChiTieu(r, rLogs, bpMap),
        logs: bpRow ? (logMap.get(bpRow.id) || []) : rLogs,
        __bpId: bpRow?.id,
      };
    });

  const tongKpi = dong.reduce((s, d) => s + d.diemQuyDoi, 0);
  const tongMat = dong.reduce((s, d) => s + d.diemMat, 0);
  const danhSachMatDiem = dong
    .filter(d => d.diemMat > 0.0001)
    .sort((a, b) => b.diemMat - a.diemMat);

  return { dong, tongKpi, tongMat, danhSachMatDiem, bpMap };
}

// Σ trọng số phải = 100. Excel không cảnh báo cái này nên rất dễ lệch mà không ai biết.
// Chỉ cộng dòng cá nhân có chi_tieu (bỏ dòng BO_PHAN và dòng thưởng ngoài trọng số).
export function kiemTraTrongSo(rows = []) {
  const tong = rows
    .filter(r => r.cap_do !== 'BO_PHAN' && num(r.chi_tieu) > 0)
    .reduce((s, r) => s + num(r.trong_so), 0);
  const lech = Math.round((tong - 100) * 1000) / 1000;
  return { tong, lech, hopLe: Math.abs(lech) < 0.001 };
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- kpiEngine`
Expected: PASS — 20 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiEngine.js src/lib/kpiEngine.test.js
git commit -m "feat(kpi): tinh ca bang KPI mot nguoi + kiem tra tong trong so"
```

---

## Task 5: Engine — diễn giải cách tính (popup bằng chứng)

**Files:**
- Modify: `src/lib/kpiEngine.js`
- Test: `src/lib/kpiEngine.test.js`

Đây là yêu cầu "bấm vào bất cứ điểm số nào lập tức hiện diễn giải cách tính ra con số đó". Engine trả cấu trúc, UI chỉ render.

- [ ] **Step 1: Viết test thất bại**

```js
import { giaiThich } from './kpiEngine';

describe('giaiThich', () => {
  const ct = {
    id: 'c2', ten: 'CHUYÊN CẦN CÁ NHÂN', chi_tieu: 10, trong_so: 7,
    diem_chot: 3, chot_boi: 'Nguyên', chot_luc: '2026-06-30T10:00:00Z',
  };
  const logs = [
    { ngay: '2026-06-17', so_diem: -1, ly_do: 'Đi muộn', nguoi_ghi: 'Nguyên' },
    { ngay: '2026-06-27', so_diem: -3, ly_do: 'Quên chấm công', nguoi_ghi: 'Nguyên' },
  ];

  it('trả đủ các bước tính', () => {
    const g = giaiThich(ct, logs);
    expect(g.buoc.map(b => b.nhan)).toEqual(['Điểm đạt', 'Tỉ lệ đạt', 'Điểm quy đổi']);
    expect(g.buoc[2].ketQua).toBeCloseTo(2.1);
  });

  it('nêu rõ điểm do quản lý chốt tay, kèm ai chốt', () => {
    const g = giaiThich(ct, logs);
    expect(g.buoc[0].nguon).toBe('CHOT_TAY');
    expect(g.buoc[0].dienGiai).toContain('Nguyên');
  });

  it('khi không chốt tay thì diễn giải phép trừ từ nhật ký', () => {
    const g = giaiThich({ ...ct, diem_chot: null, chot_boi: null }, logs);
    expect(g.buoc[0].nguon).toBe('NHAT_KY');
    expect(g.buoc[0].dienGiai).toBe('10 − 4 = 6');
  });

  it('trả kèm nhật ký làm bằng chứng', () => {
    expect(giaiThich(ct, logs).nhatKy).toHaveLength(2);
  });

  it('dòng thưởng diễn giải bằng phép cộng, không có tỉ lệ', () => {
    const g = giaiThich({ ten: 'THƯỞNG', chi_tieu: null, trong_so: 0 },
      [{ ngay: '2026-06-30', so_diem: 1.5, ly_do: 'Ý tưởng tốt' }]);
    expect(g.buoc.map(b => b.nhan)).toEqual(['Điểm cộng thêm']);
    expect(g.buoc[0].ketQua).toBeCloseTo(1.5);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- kpiEngine`
Expected: FAIL — `giaiThich is not a function`

- [ ] **Step 3: Viết implementation**

Thêm vào `src/lib/kpiEngine.js`:

```js
const soGon = n => Math.round(n * 100) / 100;

// Diễn giải cách ra được con số — dùng cho popup bằng chứng khi bấm vào bất kỳ điểm nào.
// Trả cấu trúc dữ liệu thuần; UI chỉ render, không tự tính lại (tránh lệch luật).
export function giaiThich(ct, logs = [], bpMap = {}) {
  const kq = tinhChiTieu(ct, logs, bpMap);

  if (kq.laThuong) {
    return {
      ten: ct.ten,
      buoc: [{
        nhan: 'Điểm cộng thêm',
        dienGiai: logs.map(l => `${l.so_diem > 0 ? '+' : ''}${l.so_diem}`).join(' ') || '0',
        ketQua: soGon(kq.diemQuyDoi),
        nguon: 'NHAT_KY',
      }],
      nhatKy: logs,
    };
  }

  const tongLog = logs.reduce((s, l) => s + num(l.so_diem), 0);
  const chotTay = ct.diem_chot !== null && ct.diem_chot !== undefined;
  const boPhan = !!ct.lien_ket_bo_phan;

  let buocDat;
  if (boPhan) {
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'BO_PHAN',
      dienGiai: `Chấm chung cả bộ phận: ${soGon(kq.diemDat)}/${ct.chi_tieu}`,
      ketQua: soGon(kq.diemDat),
    };
  } else if (chotTay) {
    const ai = ct.chot_boi ? ` bởi ${ct.chot_boi}` : '';
    const luc = ct.chot_luc ? ` (${new Date(ct.chot_luc).toLocaleDateString('vi-VN')})` : '';
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'CHOT_TAY',
      dienGiai: `Quản lý chốt tay${ai}${luc}: ${soGon(kq.diemDat)}`,
      ketQua: soGon(kq.diemDat),
    };
  } else {
    const dau = tongLog < 0 ? '−' : '+';
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'NHAT_KY',
      dienGiai: `${ct.chi_tieu} ${dau} ${Math.abs(soGon(tongLog))} = ${soGon(kq.diemDat)}`,
      ketQua: soGon(kq.diemDat),
    };
  }

  return {
    ten: ct.ten,
    buoc: [
      buocDat,
      {
        nhan: 'Tỉ lệ đạt', nguon: 'CONG_THUC',
        dienGiai: `${soGon(kq.diemDat)} / ${ct.chi_tieu} = ${Math.round(kq.tiLeDat * 100)}%`,
        ketQua: kq.tiLeDat,
      },
      {
        nhan: 'Điểm quy đổi', nguon: 'CONG_THUC',
        dienGiai: `${Math.round(kq.tiLeDat * 100)}% × trọng số ${ct.trong_so} = ${soGon(kq.diemQuyDoi)}`,
        ketQua: soGon(kq.diemQuyDoi),
      },
    ],
    nhatKy: logs,
  };
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- kpiEngine`
Expected: PASS — 24 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiEngine.js src/lib/kpiEngine.test.js
git commit -m "feat(kpi): dien giai cach tinh diem cho popup bang chung"
```

---

## Task 6: Script import file Excel gốc

**Files:**
- Create: `scripts/import-kpi-excel.mjs`

Script chạy 1 lần, đọc `.xls` → sinh SQL seed để người soát rồi tự chạy. **Không ghi thẳng DB** — dữ liệu gắn lương thưởng.

- [ ] **Step 1: Viết script**

```js
// Đọc KPI/Copy of KPI kho 06.2026.xls → sinh sql/seed_kpi_2026_06.sql.
// Chạy: node scripts/import-kpi-excel.mjs
// KHÔNG ghi thẳng vào Supabase — mở file SQL sinh ra, soát rồi tự chạy trên SQL Editor.
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const FILE = 'KPI/Copy of KPI kho 06.2026.xls';
const KY = '2026-06';
const OUT = 'sql/seed_kpi_2026_06.sql';

// Bản cũ T12/2023 còn sót trong file — bỏ qua.
const BO_QUA = ['KPI T9 - BH - NB Ngọc', 'KPI T12 - KTSX'];

// Ánh xạ KHAI TAY sheet → nhan_vien.id. Tên sheet không khớp tên nhân viên
// (thừa dấu cách, sai chính tả, có tiền tố phòng ban) nên KHÔNG đoán tự động —
// ghép nhầm KPI sang người khác là lỗi không được phép xảy ra.
// Các id dưới đây là GIẢ ĐỊNH. Trước khi chạy thật phải chạy `select id, name from
// nhan_vien` trên Supabase và thay bằng id thật — script tự kiểm ở cuối và dừng nếu
// còn id chưa thay.
const MAP_NV = {
  'NGUYÊN ': 'NV_NGUYEN', 'HÀ ': 'NV_HA',       'NGỌC': 'NV_NGOC',
  'PHONG':   'NV_PHONG',  'TUẤN': 'NV_TUAN',    'HĨU': 'NV_HUU',
  'BÍCH':    'NV_BICH',   'XUÂN': 'NV_XUAN',    'ĐỨC': 'NV_DUC',
  'THIỆN':   'NV_THIEN',  'THƠ':  'NV_THO',     'XUYÊN': 'NV_XUYEN',
  'DUYÊN':   'NV_DUYEN',  'DƯƠNG': 'NV_DUONG',
};

// Chỉ tiêu chấm chung cả bộ phận → gom về một dòng BO_PHAN duy nhất mỗi nhóm.
const NHOM_BO_PHAN = [
  { khop: /BỘ PHẬN/i,  khoa: 'CHUYEN_CAN_BO_PHAN' },
  { khop: /CẢ TEAM/i,  khoa: 'HOTLINE_CA_TEAM_BH' },
];

const q = v => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 'null');

function docSheet(ws) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  const o = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
  const val = (r, c) => { const cell = o(r, c); return cell ? cell.v : undefined; };

  // Hàng tiêu đề nằm ở dòng 8/9/10 tuỳ sheet → dò theo ô "Chỉ tiêu KPI", không hardcode.
  let hdr = -1;
  for (let R = range.s.r; R <= range.e.r; R++) {
    if (String(val(R, 2) ?? '').trim() === 'Chỉ tiêu KPI') { hdr = R; break; }
  }
  if (hdr < 0) throw new Error('Không tìm thấy hàng tiêu đề "Chỉ tiêu KPI"');

  const rows = [];
  let nhom = null, thuTu = 0;

  // hdr+1 là dòng "Tổng Điểm" (công thức SUM) → bỏ, bắt đầu từ hdr+2.
  for (let R = hdr + 2; R <= range.e.r; R++) {
    const ten = val(R, 1);                       // cột B
    const nhanNhom = val(R, 0);                  // cột A
    const G = o(R, 6), H = o(R, 7);
    const laSo = c => c && typeof c.v === 'number' && !c.f;

    // Dòng nhóm: cột A có nhãn "A. ...", không có điểm.
    if (!laSo(G) && !laSo(H) && typeof nhanNhom === 'string' && /^[A-F]\./.test(nhanNhom.trim())) {
      nhom = nhanNhom.trim();
      continue;
    }
    if (!ten) continue;

    const tenS = String(ten).replace(/\s+/g, ' ').trim();
    const chiTieu = laSo(G) ? G.v : null;
    const trongSo = laSo(H) ? H.v : 0;
    if (chiTieu === null && !trongSo) {
      // Dòng "CỘNG THÊM NGOÀI TRỌNG SỐ": không có G/H → dòng thưởng, chi_tieu null.
      if (!/CỘNG THÊM/i.test(tenS)) continue;
    }

    const bp = NHOM_BO_PHAN.find(x => x.khop.test(tenS));
    rows.push({
      thu_tu: ++thuTu,
      nhom,
      ten: tenS,
      mo_ta: val(R, 2) ? String(val(R, 2)).replace(/\s+/g, ' ').trim() : null,
      chi_tieu: chiTieu,
      trong_so: trongSo,
      diem_tu_cham: typeof val(R, 8) === 'number' ? val(R, 8) : null,   // cột I
      diem_chot: typeof val(R, 10) === 'number' ? val(R, 10) : null,    // cột K (KPI duyệt)
      ghi_chu: val(R, 14) ? String(val(R, 14)).replace(/\s+/g, ' ').trim() : null, // cột O
      lien_ket_bo_phan: bp ? bp.khoa : null,
    });
  }
  return rows;
}

// Chặn chạy nhầm với id giả định — ghép sai KPI sang người khác là lỗi không sửa được
// sau khi đã chấm. Truyền --cho-phep-id-gia-dinh để chạy thử khi chưa có id thật.
const idGiaDinh = Object.values(MAP_NV).filter(v => v.startsWith('NV_'));
if (idGiaDinh.length && !process.argv.includes('--cho-phep-id-gia-dinh')) {
  console.error(`✖ Còn ${idGiaDinh.length} id giả định trong MAP_NV: ${idGiaDinh.join(', ')}`);
  console.error('  Thay bằng id thật từ `select id, name from nhan_vien`, hoặc chạy lại với');
  console.error('  --cho-phep-id-gia-dinh nếu chỉ muốn xem thử file SQL sinh ra.');
  process.exit(1);
}

const wb = XLSX.readFile(FILE);
const sql = [
  `-- Sinh tự động bởi scripts/import-kpi-excel.mjs từ ${FILE}`,
  `-- Kỳ ${KY}. SOÁT KỸ trước khi chạy — dữ liệu này gắn với lương thưởng.`,
  `begin;`,
  `delete from kpi_chi_tieu where ky = '${KY}';`,
  ``,
];

const boPhanDaTao = new Set();
const canhBao = [];

for (const sheet of wb.SheetNames) {
  if (BO_QUA.includes(sheet)) { canhBao.push(`BỎ QUA sheet cũ: ${sheet}`); continue; }
  const nvId = MAP_NV[sheet];
  if (!nvId) throw new Error(`Sheet "${sheet}" chưa có trong MAP_NV — bổ sung rồi chạy lại`);

  const rows = docSheet(wb.Sheets[sheet]);

  // Kiểm Σ trọng số ngay lúc import — bắt lỗi trước khi vào DB.
  const tong = rows.filter(r => r.chi_tieu > 0).reduce((s, r) => s + r.trong_so, 0);
  if (Math.abs(tong - 100) > 0.001) canhBao.push(`⚠ ${sheet}: Σ trọng số = ${tong} (≠100)`);

  sql.push(`-- ── ${sheet} → ${nvId} (${rows.length} chỉ tiêu, Σ trọng số ${tong})`);

  for (const r of rows) {
    // Dòng BO_PHAN tạo một lần cho cả kỳ, dùng chung cho mọi người trong nhóm.
    if (r.lien_ket_bo_phan && !boPhanDaTao.has(r.lien_ket_bo_phan)) {
      boPhanDaTao.add(r.lien_ket_bo_phan);
      sql.push(`insert into kpi_chi_tieu (ky, cap_do, lien_ket_bo_phan, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_chot)`
        + ` values ('${KY}', 'BO_PHAN', ${q(r.lien_ket_bo_phan)}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, 0, 'THU_CONG', ${n(r.diem_chot)});`);
    }
    sql.push(`insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_tu_cham, diem_chot)`
      + ` values ('${KY}', 'CA_NHAN', ${q(nvId)}, ${q(r.lien_ket_bo_phan)}, ${q(r.nhom)}, ${r.thu_tu}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, ${r.trong_so}, 'THU_CONG', ${n(r.diem_tu_cham)}, ${n(r.diem_chot)});`);
  }
  sql.push('');
}

sql.push('commit;');
writeFileSync(OUT, sql.join('\n'), 'utf8');
console.log(`✔ Đã sinh ${OUT}`);
for (const c of canhBao) console.log('  ' + c);
```

- [ ] **Step 2: Kiểm cơ chế chặn id giả định**

Run: `node scripts/import-kpi-excel.mjs`
Expected: FAIL với `✖ Còn 14 id giả định trong MAP_NV` và exit code 1.

- [ ] **Step 3: Chạy thử với cờ cho phép**

Run: `node scripts/import-kpi-excel.mjs --cho-phep-id-gia-dinh`
Expected: `✔ Đã sinh sql/seed_kpi_2026_06.sql` + 2 dòng "BỎ QUA sheet cũ", **không có dòng ⚠ Σ trọng số** (đã kiểm trước: cả 14 sheet đều = 100).

- [ ] **Step 4: Kiểm file SQL sinh ra**

Run: `grep -c "insert into kpi_chi_tieu" sql/seed_kpi_2026_06.sql`
Expected: khoảng 197 — 195 dòng chỉ tiêu cá nhân (32+16+20+19+20+11+11+11+11+11+11+14+14+14) + 2 dòng BO_PHAN. Nếu lệch nhiều thì luật lọc dòng nhóm/dòng thưởng đang sai, phải soát lại `docSheet` trước khi đi tiếp.

Run: `head -20 sql/seed_kpi_2026_06.sql` — soát bằng mắt: có `begin;`, có `delete ... where ky = '2026-06'`, tên chỉ tiêu tiếng Việt không vỡ dấu.

- [ ] **Step 5: Commit**

File SQL sinh ra chứa id giả định nên KHÔNG commit — chỉ commit script.

```bash
git add scripts/import-kpi-excel.mjs
git commit -m "feat(kpi): script import bang chi tieu tu file Excel goc"
```

---

## Task 7: Đăng ký tab KPI trong permRegistry

**Files:**
- Modify: `src/lib/permRegistry.js` (module `tasks`, quanh dòng 39-45)

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/permRegistry.test.js`:

```js
import { PERM_REGISTRY } from './permRegistry';

describe('tab KPI', () => {
  it('có trong module tasks với đủ 4 cap', () => {
    const tasks = PERM_REGISTRY.find(m => m.module === 'tasks');
    const kpi = tasks.tabs.find(t => t.id === 'kpi');
    expect(kpi).toBeDefined();
    expect(kpi.label).toBe('KPI');
    expect(kpi.caps).toEqual(['view', 'create', 'edit', 'io']);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- permRegistry`
Expected: FAIL — `expected undefined to be defined`

- [ ] **Step 3: Thêm tab vào registry**

Trong `src/lib/permRegistry.js`, module `tasks`, thêm sau dòng `work_report`:

```js
      { id: 'work_report', label: 'Báo Cáo',   caps: ['view', 'io'] },
      // view = xem KPI mọi người (điểm công khai toàn bộ theo quyết định nghiệp vụ)
      // edit = ghi nhật ký ± điểm, chốt điểm | create = sửa bảng chỉ tiêu, tạo kỳ mới
      { id: 'kpi',         label: 'KPI',       caps: ['view', 'create', 'edit', 'io'] },
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- permRegistry`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/permRegistry.js src/lib/permRegistry.test.js
git commit -m "feat(kpi): dang ky tab KPI trong permRegistry"
```

---

## Task 8: Màn hình KPI — danh sách nhân viên

**Files:**
- Create: `src/pages/tasks/KpiTab.jsx`

Viết bằng JSX (giống `WorkReport.jsx`), không dùng `createElement` như TaskApp.

- [ ] **Step 1: Viết component danh sách**

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { tinhBangKpi } from '../../lib/kpiEngine';
import { Trophy, ChevronRight, Loader2 } from 'lucide-react';

// Kỳ mặc định = tháng hiện tại, dạng 'YYYY-MM'.
function kyHienTai() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function KpiTab({ me, users = [], perm = {} }) {
  const [ky, setKy] = useState(kyHienTai());
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chon, setChon] = useState(null);   // nhan_vien_id đang xem chi tiết

  useEffect(() => { taiDuLieu(); }, [ky]);

  async function taiDuLieu() {
    setLoading(true);
    try {
      const ct = await fetchAllRows(() =>
        supabase.from('kpi_chi_tieu').select('*').eq('ky', ky).order('thu_tu'));
      const ids = (ct || []).map(r => r.id);
      const nk = ids.length
        ? await fetchAllRows(() =>
            supabase.from('kpi_nhat_ky').select('*').in('chi_tieu_id', ids).order('ngay'))
        : [];
      setRows(ct || []); setLogs(nk || []);
    } finally { setLoading(false); }
  }

  // Dòng BO_PHAN dùng chung cho mọi người → luôn kèm vào bảng của từng cá nhân.
  const dongBoPhan = useMemo(() => rows.filter(r => r.cap_do === 'BO_PHAN'), [rows]);

  const bangTheoNguoi = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.cap_do === 'BO_PHAN') continue;
      if (!m.has(r.nhan_vien_id)) m.set(r.nhan_vien_id, []);
      m.get(r.nhan_vien_id).push(r);
    }
    const out = [];
    for (const [nvId, list] of m) {
      const kq = tinhBangKpi([...dongBoPhan, ...list], logs);
      const u = users.find(x => x.id === nvId);
      out.push({ nvId, ten: u?.name || nvId, avatar: u?.avatar, ...kq });
    }
    return out.sort((a, b) => b.tongKpi - a.tongKpi);
  }, [rows, logs, users, dongBoPhan]);

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
      <Loader2 size={20} className="spin" /> Đang tải KPI…
    </div>
  );

  if (chon) return (
    <BangKpiMotNguoi
      nvId={chon} ky={ky} users={users} me={me} perm={perm}
      rows={[...dongBoPhan, ...rows.filter(r => r.nhan_vien_id === chon)]}
      logs={logs} onBack={() => setChon(null)} onReload={taiDuLieu}
    />
  );

  return (
    <div style={{ padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input type="month" value={ky} onChange={e => setKy(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {bangTheoNguoi.length} nhân viên
        </span>
      </div>

      {bangTheoNguoi.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          Chưa có bảng KPI cho kỳ này.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
        {bangTheoNguoi.map((p, i) => (
          <button key={p.nvId} onClick={() => setChon(p.nvId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem',
              borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              outline: p.nvId === me?.id ? '2px solid #2563eb' : 'none',
            }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', width: 20 }}>
              {i === 0 ? <Trophy size={14} color="#f59e0b" /> : `#${i + 1}`}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.ten}{p.nvId === me?.id && ' (bạn)'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {p.danhSachMatDiem[0] ? `Mất nhiều nhất: ${p.danhSachMatDiem[0].ten}` : 'Đạt đủ mọi chỉ tiêu'}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: p.tongKpi >= 90 ? '#059669' : p.tongKpi >= 75 ? '#d97706' : '#dc2626' }}>
              {p.tongKpi.toFixed(1)}
            </div>
            <ChevronRight size={14} color="#cbd5e1" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Kiểm build không lỗi cú pháp**

Run: `npm run build`
Expected: build thành công (component chưa được import ở đâu nên chỉ kiểm cú pháp qua lint)

Run: `npx eslint src/pages/tasks/KpiTab.jsx`
Expected: không có error (warning về `BangKpiMotNguoi` chưa định nghĩa là bình thường — Task 9 thêm)

- [ ] **Step 3: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): man hinh danh sach nhan vien kem diem KPI"
```

---

## Task 9: Màn hình KPI — bảng chi tiết một người + popup diễn giải

**Files:**
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Bổ sung import ở ĐẦU file**

Sửa 2 dòng import sẵn có ở đầu `src/pages/tasks/KpiTab.jsx` (import phải nằm trên cùng, không được rải giữa file):

```jsx
import { tinhBangKpi, giaiThich, kiemTraTrongSo } from '../../lib/kpiEngine';
import { Trophy, ChevronRight, ChevronLeft, AlertTriangle, Plus, X, Loader2 } from 'lucide-react';
```

- [ ] **Step 2: Thêm component bảng chi tiết + popup vào CUỐI file**

```jsx
// Popup "bằng chứng": bấm vào BẤT KỲ con số nào cũng ra cách tính + nhật ký.
function PopupDienGiai({ ct, logs, bpMap, onClose }) {
  const g = giaiThich(ct, logs, bpMap);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 460, width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700 }}>{g.ten}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {g.buoc.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0.45rem 0', borderBottom: '1px dashed #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>{b.nhan}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{b.dienGiai}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                {typeof b.ketQua === 'number' ? b.ketQua : ''}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Nhật ký ({g.nhatKy.length})
          </div>
          {g.nhatKy.length === 0 && (
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Chưa có ghi nhận nào.</div>
          )}
          {g.nhatKy.map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: '0.74rem', padding: '0.3rem 0' }}>
              <span style={{ color: '#94a3b8', minWidth: 62 }}>
                {new Date(l.ngay).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
              </span>
              <span style={{ flex: 1 }}>{l.ly_do}</span>
              <span style={{ fontWeight: 700, color: l.so_diem < 0 ? '#dc2626' : '#059669' }}>
                {l.so_diem > 0 ? '+' : ''}{l.so_diem}
              </span>
              {l.nguon === 'TU_DONG' && (
                <span style={{ fontSize: '0.65rem', color: '#2563eb' }} title="Chấm tự động">⚙</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BangKpiMotNguoi({ nvId, ky, users, me, perm, rows, logs, onBack, onReload }) {
  const [popup, setPopup] = useState(null);
  const kq = useMemo(() => tinhBangKpi(rows, logs), [rows, logs]);
  const canhBaoTrongSo = useMemo(() => kiemTraTrongSo(rows), [rows]);
  const nguoi = users.find(u => u.id === nvId);

  const mau = kq.tongKpi >= 90 ? '#059669' : kq.tongKpi >= 75 ? '#d97706' : '#dc2626';

  return (
    <div style={{ padding: '0.75rem' }}>
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
        color: '#2563eb', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: 10,
      }}>
        <ChevronLeft size={14} /> Danh sách
      </button>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{nguoi?.name || nvId}</div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kỳ {ky}</div>
        <button onClick={() => setPopup({ tong: true })} style={{
          border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginTop: 6,
          fontSize: '2rem', fontWeight: 800, color: mau,
        }} title="Bấm để xem cách tính">
          {kq.tongKpi.toFixed(1)}<span style={{ fontSize: '0.9rem', color: '#94a3b8' }}> / 100</span>
        </button>

        {!canhBaoTrongSo.hopLe && (
          <div style={{
            marginTop: 8, padding: '0.5rem 0.6rem', borderRadius: 8,
            background: '#fef2f2', color: '#b91c1c', fontSize: '0.74rem',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertTriangle size={14} />
            Σ trọng số = {canhBaoTrongSo.tong} (lệch {canhBaoTrongSo.lech > 0 ? '+' : ''}{canhBaoTrongSo.lech}) — bảng chỉ tiêu chưa chuẩn.
          </div>
        )}
      </div>

      {kq.danhSachMatDiem.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
            ĐANG MẤT {kq.tongMat.toFixed(1)} ĐIỂM
          </div>
          {kq.danhSachMatDiem.map(d => (
            <button key={d.id} onClick={() => setPopup({ ct: d })} style={{
              display: 'flex', width: '100%', alignItems: 'center', gap: 10, textAlign: 'left',
              padding: '0.55rem 0.7rem', marginBottom: 5, borderRadius: 10,
              border: '1px solid #fecaca', background: '#fff', cursor: 'pointer',
            }}>
              <span style={{ fontWeight: 800, color: '#dc2626', minWidth: 44 }}>
                −{d.diemMat.toFixed(1)}
              </span>
              <span style={{ flex: 1, fontSize: '0.78rem' }}>{d.ten}</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {d.diemDat}/{d.chi_tieu}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
          TOÀN BỘ CHỈ TIÊU ({kq.dong.length})
        </div>
        {kq.dong.map(d => (
          <button key={d.id} onClick={() => setPopup({ ct: d })} style={{
            display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
            padding: '0.5rem 0.65rem', marginBottom: 4, borderRadius: 9,
            border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
          }}>
            <span style={{ flex: 1, fontSize: '0.76rem' }}>
              {d.ten}
              {d.lien_ket_bo_phan && (
                <span style={{ fontSize: '0.64rem', color: '#2563eb', marginLeft: 5 }}>chung bộ phận</span>
              )}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>×{d.trong_so}</span>
            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: d.diemMat > 0.001 ? '#dc2626' : '#059669', minWidth: 36, textAlign: 'right' }}>
              {d.diemQuyDoi.toFixed(1)}
            </span>
          </button>
        ))}
      </div>

      {popup?.ct && (
        <PopupDienGiai ct={popup.ct} logs={popup.ct.logs} bpMap={kq.bpMap}
          onClose={() => setPopup(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Kiểm lint**

Run: `npx eslint src/pages/tasks/KpiTab.jsx`
Expected: không có error

- [ ] **Step 4: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): bang chi tiet mot nguoi + popup dien giai bang chung"
```

---

## Task 10: Wire tab KPI vào TaskApp

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx` (import quanh dòng 5; tabs dòng ~1494-1496; render dòng ~1539-1541)

- [ ] **Step 1: Thêm import**

Sau dòng `import WorkReport from './WorkReport';`:

```js
    import KpiTab from './KpiTab';
```

- [ ] **Step 2: Thêm nút tab**

Sau dòng tab `work_report` (~1496):

```js
        canSeeTab(me,'tasks','kpi') && h(TabButton, {key:'kpi', active: view==='kpi', onClick: ()=>navTo('kpi'), label:'KPI', color:'#2563eb'}),
```

- [ ] **Step 3: Thêm nhánh render**

Sau nhánh `view==='work_report'` (~1540):

```js
              : view==='kpi' && canSeeTab(me,'tasks','kpi') ? h(KpiTab, { me, users, perm: getTabPerm(me, 'tasks', 'kpi') })
```

- [ ] **Step 4: Chạy dev server và kiểm bằng mắt**

Dùng `preview_start` với `.claude/launch.json` (name `dev`, `npm run dev`, port 5173), đăng nhập, vào `/tasks`, bấm tab KPI.
Expected: tab hiện, chưa có dữ liệu thì hiện "Chưa có bảng KPI cho kỳ này." — không lỗi console.

Kiểm console: `read_console_messages` với `onlyErrors: true` → rỗng.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx
git commit -m "feat(kpi): wire tab KPI vao phan he Cong viec"
```

---

## Task 11: Ghi nhật ký ± điểm và chốt điểm (quyền `edit`)

**Files:**
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Thêm form ghi nhật ký vào popup**

Trong `PopupDienGiai`, thêm props `perm`, `me`, `onReload`, và chèn khối này ngay trước thẻ đóng `</div>` ngoài cùng của popup:

```jsx
{perm?.edit && (
  <FormGhiDiem chiTieuId={ct.lien_ket_bo_phan ? ct.__bpId : ct.id} me={me} onXong={onReload} />
)}
```

Và thêm component:

```jsx
function FormGhiDiem({ chiTieuId, me, onXong }) {
  const [mo, setMo] = useState(false);
  const [f, setF] = useState({ ngay: new Date().toISOString().slice(0, 10), so_diem: '', ly_do: '' });
  const [busy, setBusy] = useState(false);

  async function luu() {
    const diem = Number(f.so_diem);
    if (!Number.isFinite(diem) || diem === 0) { alert('Số điểm phải khác 0'); return; }
    if (!f.ly_do.trim()) { alert('Phải ghi lý do — đây là bằng chứng của điểm số'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('kpi_nhat_ky').insert({
        chi_tieu_id: chiTieuId, ngay: f.ngay, so_diem: diem,
        ly_do: f.ly_do.trim(), nguoi_ghi: me?.name || me?.id, nguon: 'TAY',
      });
      if (error) { alert('Lỗi: ' + error.message); return; }
      setF({ ngay: new Date().toISOString().slice(0, 10), so_diem: '', ly_do: '' });
      setMo(false);
      onXong?.();
    } finally { setBusy(false); }
  }

  if (!mo) return (
    <button onClick={() => setMo(true)} style={{
      marginTop: 10, width: '100%', padding: '0.5rem', borderRadius: 9,
      border: '1px dashed #cbd5e1', background: '#f8fafc', cursor: 'pointer',
      fontSize: '0.76rem', fontWeight: 600, color: '#475569',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    }}>
      <Plus size={13} /> Ghi cộng / trừ điểm
    </button>
  );

  return (
    <div style={{ marginTop: 10, padding: '0.6rem', borderRadius: 10, background: '#f8fafc', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="date" value={f.ngay} onChange={e => setF({ ...f, ngay: e.target.value })}
          style={{ flex: 1, padding: '0.35rem', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.76rem' }} />
        <input type="number" step="0.5" placeholder="±điểm" value={f.so_diem}
          onChange={e => setF({ ...f, so_diem: e.target.value })}
          style={{ width: 88, padding: '0.35rem', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.76rem' }} />
      </div>
      <input placeholder="Lý do (bắt buộc)" value={f.ly_do}
        onChange={e => setF({ ...f, ly_do: e.target.value })}
        style={{ padding: '0.35rem', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.76rem' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={luu} disabled={busy} style={{
          flex: 1, padding: '0.4rem', borderRadius: 7, border: 'none',
          background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: '0.76rem', cursor: 'pointer',
        }}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        <button onClick={() => setMo(false)} style={{
          padding: '0.4rem 0.7rem', borderRadius: 7, border: '1px solid #e2e8f0',
          background: '#fff', fontSize: '0.76rem', cursor: 'pointer',
        }}>Huỷ</button>
      </div>
    </div>
  );
}
```

`__bpId` đã có sẵn từ Task 4 — dòng liên kết bộ phận ghi nhật ký vào dòng chung, nên chấm một lần là cả nhóm cập nhật.

- [ ] **Step 2: Truyền props xuống popup**

Trong `BangKpiMotNguoi`, sửa lời gọi popup:

```jsx
      {popup?.ct && (
        <PopupDienGiai ct={popup.ct} logs={popup.ct.logs} bpMap={kq.bpMap}
          perm={perm} me={me} onReload={onReload}
          onClose={() => setPopup(null)} />
      )}
```

Và sửa chữ ký: `function PopupDienGiai({ ct, logs, bpMap, perm, me, onReload, onClose })`.

- [ ] **Step 3: Kiểm trên dev server**

Đăng nhập tài khoản có quyền `edit` tab kpi, mở 1 chỉ tiêu, ghi thử `-2 / "Test ghi điểm"`, xác nhận điểm tổng giảm đúng 2 × (trọng số/chỉ tiêu) và nhật ký hiện dòng mới.

Kiểm console errors: rỗng.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): ghi nhat ky cong tru diem tren app"
```

---

## Task 12: Xuất Excel

**Files:**
- Create: `src/lib/kpiExcel.js`
- Test: `src/lib/kpiExcel.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, it, expect } from 'vitest';
import { dungDuLieuSheet } from './kpiExcel';

describe('dungDuLieuSheet', () => {
  const rows = [
    { id: 'a', cap_do: 'CA_NHAN', nhom: 'A. NỘI QUY', ten: 'QUY ĐỊNH',
      chi_tieu: 10, trong_so: 30, diem_chot: 10 },
    { id: 'b', cap_do: 'CA_NHAN', nhom: 'A. NỘI QUY', ten: 'CHUYÊN CẦN',
      chi_tieu: 10, trong_so: 70, diem_chot: 5 },
  ];

  it('chèn dòng nhóm trước các chỉ tiêu cùng nhóm', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    expect(d.dong[0].laNhom).toBe(true);
    expect(d.dong[0].ten).toBe('A. NỘI QUY');
  });

  it('mỗi chỉ tiêu có đủ cột như bảng Excel gốc', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    const ct = d.dong[1];
    expect(ct.chi_tieu).toBe(10);
    expect(ct.trong_so).toBe(30);
    expect(ct.tiLePhanTram).toBe(100);
    expect(ct.diemQuyDoi).toBe(30);
  });

  it('tổng khớp engine', () => {
    const d = dungDuLieuSheet(rows, [], 'Lê Văn Bích', '2026-06');
    expect(d.tongKpi).toBeCloseTo(65);   // 30 + 70×0.5
    expect(d.tongTrongSo).toBe(100);
  });

  it('ghép nhật ký thành cột ghi chú', () => {
    const logs = [{ chi_tieu_id: 'b', ngay: '2026-06-17', so_diem: -1, ly_do: 'Đi muộn' }];
    const d = dungDuLieuSheet(rows, logs, 'Lê Văn Bích', '2026-06');
    expect(d.dong[2].ghiChu).toContain('Đi muộn');
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npm test -- kpiExcel`
Expected: FAIL — `Failed to resolve import "./kpiExcel"`

- [ ] **Step 3: Viết implementation**

```js
// Xuất bảng KPI ra Excel theo bố cục file gốc (KPI kho 06.2026.xls) để bộ phận khác
// đọc quen mắt. Phần dựng dữ liệu tách riêng (dungDuLieuSheet) để test được mà không
// cần chạy ExcelJS.
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { tinhBangKpi } from './kpiEngine';

const soGon = n => Math.round(n * 100) / 100;

// Dựng dữ liệu phẳng cho 1 sheet: dòng nhóm xen giữa các dòng chỉ tiêu, đúng như Excel gốc.
export function dungDuLieuSheet(rows, logs, tenNhanVien, ky) {
  const kq = tinhBangKpi(rows, logs);
  const dong = [];
  let nhomHienTai = null;

  for (const d of kq.dong) {
    if (d.nhom && d.nhom !== nhomHienTai) {
      nhomHienTai = d.nhom;
      dong.push({ laNhom: true, ten: d.nhom });
    }
    dong.push({
      laNhom: false,
      ten: d.ten,
      mo_ta: d.mo_ta || '',
      chi_tieu: d.chi_tieu,
      trong_so: d.trong_so,
      diem_tu_cham: d.diem_tu_cham ?? null,
      diemDat: soGon(d.diemDat),
      tiLePhanTram: d.tiLeDat === null ? null : Math.round(d.tiLeDat * 100),
      diemQuyDoi: soGon(d.diemQuyDoi),
      diemMat: soGon(d.diemMat),
      ghiChu: (d.logs || [])
        .map(l => `${new Date(l.ngay).toLocaleDateString('vi-VN')} ${l.ly_do} (${l.so_diem > 0 ? '+' : ''}${l.so_diem})`)
        .join('; '),
    });
  }

  return {
    tenNhanVien, ky, dong,
    tongKpi: soGon(kq.tongKpi),
    tongMat: soGon(kq.tongMat),
    tongTrongSo: kq.dong.reduce((s, d) => s + (d.chi_tieu > 0 ? d.trong_so : 0), 0),
  };
}

const COT = [
  { key: 'ten', header: 'Chỉ tiêu KPI', width: 30 },
  { key: 'mo_ta', header: 'Diễn giải', width: 60 },
  { key: 'chi_tieu', header: 'Chỉ tiêu', width: 9 },
  { key: 'trong_so', header: 'Trọng số', width: 9 },
  { key: 'diem_tu_cham', header: 'Tự đánh giá', width: 11 },
  { key: 'diemDat', header: 'Điểm đạt', width: 9 },
  { key: 'tiLePhanTram', header: 'Tỉ lệ đạt (%)', width: 11 },
  { key: 'diemQuyDoi', header: 'Điểm quy đổi', width: 12 },
  { key: 'diemMat', header: 'Điểm mất', width: 9 },
  { key: 'ghiChu', header: 'Ghi chú / Bằng chứng', width: 45 },
];

// Tên sheet Excel: bỏ ký tự cấm, ≤31 ký tự, chống trùng — cùng luật với warrantyProposalExcel.
function tenSheet(name, used) {
  let s = String(name || 'KPI').replace(/[[\]*?/\\:]/g, ' ').trim().slice(0, 28) || 'KPI';
  const base = s; let i = 2;
  while (used.has(s)) s = `${base} (${i++})`.slice(0, 31);
  used.add(s);
  return s;
}

// `danhSach`: [{ rows, logs, tenNhanVien }] — 1 người hoặc cả team.
export async function xuatExcelKpi(danhSach, ky) {
  const wb = new ExcelJS.Workbook();
  const used = new Set();

  for (const item of danhSach) {
    const d = dungDuLieuSheet(item.rows, item.logs, item.tenNhanVien, ky);
    const ws = wb.addWorksheet(tenSheet(item.tenNhanVien, used));

    ws.addRow(['CÔNG TY TNHH EUROMADE VIỆT NAM']);
    ws.addRow([`BẢNG ĐÁNH GIÁ KPI — Kỳ ${ky}`]);
    ws.addRow([`Tên nhân viên: ${d.tenNhanVien}`]);
    ws.addRow([`Tổng điểm: ${d.tongKpi} / 100 — Mất ${d.tongMat} điểm`]);
    ws.addRow([]);
    ws.getRow(1).font = { bold: true };
    ws.getRow(4).font = { bold: true, size: 12 };

    const hdr = ws.addRow(COT.map(c => c.header));
    hdr.font = { bold: true };
    hdr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    COT.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

    for (const r of d.dong) {
      if (r.laNhom) {
        const row = ws.addRow([r.ten]);
        row.font = { bold: true };
        continue;
      }
      const row = ws.addRow(COT.map(c => r[c.key]));
      row.alignment = { vertical: 'top', wrapText: true };
      if (r.diemMat > 0.001) {
        row.getCell(9).font = { color: { argb: 'FFDC2626' }, bold: true };
      }
    }

    const tong = ws.addRow(['TỔNG', '', '', d.tongTrongSo, '', '', '', d.tongKpi, d.tongMat, '']);
    tong.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `KPI-${ky}.xlsx`);
}
```

- [ ] **Step 4: Chạy test để thấy nó pass**

Run: `npm test -- kpiExcel`
Expected: PASS — 4 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiExcel.js src/lib/kpiExcel.test.js
git commit -m "feat(kpi): xuat bang KPI ra Excel"
```

---

## Task 13: Nút xuất Excel + in trên giao diện

**Files:**
- Create: `src/components/KpiPrint.jsx`
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Viết component in**

```jsx
import React from 'react';

// Bản in A4 dọc bảng KPI một người. Chỉ render nội dung — host lo hiện/ẩn khi in,
// cùng nếp với WarehouseReceiptPrint.
export default function KpiPrint({ duLieu }) {
  const { tenNhanVien, ky, dong, tongKpi, tongMat, tongTrongSo } = duLieu;
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, color: '#000', padding: '8mm' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>CÔNG TY TNHH EUROMADE VIỆT NAM</div>
        <div style={{ fontWeight: 700, fontSize: 13, margin: '4px 0' }}>BẢNG ĐÁNH GIÁ KPI</div>
        <div>Nhân viên: <b>{tenNhanVien}</b> — Kỳ: <b>{ky}</b></div>
        <div>Tổng điểm: <b style={{ fontSize: 12 }}>{tongKpi} / 100</b> (mất {tongMat} điểm)</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            {['Chỉ tiêu', 'Chỉ tiêu', 'Trọng số', 'Đạt', 'Tỉ lệ', 'Quy đổi', 'Mất', 'Ghi chú'].map((h, i) => (
              <th key={i} style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dong.map((r, i) => r.laNhom ? (
            <tr key={i}><td colSpan={8} style={{ border: '1px solid #000', padding: '2px 3px', fontWeight: 700, background: '#f6f6f6' }}>{r.ten}</td></tr>
          ) : (
            <tr key={i}>
              <td style={{ border: '1px solid #000', padding: '2px 3px' }}>{r.ten}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{r.chi_tieu}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{r.trong_so}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{r.diemDat}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{r.tiLePhanTram === null ? '—' : r.tiLePhanTram + '%'}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{r.diemQuyDoi}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', color: r.diemMat > 0 ? '#c00' : '#000' }}>{r.diemMat || ''}</td>
              <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 7 }}>{r.ghiChu}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>TỔNG</td>
            <td style={{ border: '1px solid #000' }} />
            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{tongTrongSo}</td>
            <td style={{ border: '1px solid #000' }} colSpan={2} />
            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{tongKpi}</td>
            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{tongMat}</td>
            <td style={{ border: '1px solid #000' }} />
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 24, textAlign: 'center' }}>
        {['Nhân viên được đánh giá', 'Cấp trên trực tiếp', 'Ban giám đốc'].map(s => (
          <div key={s}>
            <div style={{ fontWeight: 700 }}>{s}</div>
            <div style={{ fontSize: 8 }}>(Ký/ghi rõ họ tên)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Thêm nút vào `BangKpiMotNguoi`**

Trong `src/pages/tasks/KpiTab.jsx`, thêm 2 import mới ở đầu file và bổ sung 2 icon vào dòng import `lucide-react` sẵn có:

```jsx
import { xuatExcelKpi, dungDuLieuSheet } from '../../lib/kpiExcel';
import KpiPrint from '../../components/KpiPrint';
import { Trophy, ChevronRight, ChevronLeft, AlertTriangle, Plus, X, Loader2, FileDown, Printer } from 'lucide-react';
```

Thêm state và nút ngay dưới nút "Danh sách" trong `BangKpiMotNguoi`:

```jsx
  const [inBan, setInBan] = useState(false);
  const duLieuIn = useMemo(
    () => dungDuLieuSheet(rows, logs, nguoi?.name || nvId, ky), [rows, logs, nguoi, nvId, ky]);

  useEffect(() => {
    if (!inBan) return;
    const t = setTimeout(() => { window.print(); setInBan(false); }, 60);
    return () => clearTimeout(t);
  }, [inBan]);
```

```jsx
      {perm?.io && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={() => xuatExcelKpi(
            [{ rows, logs, tenNhanVien: nguoi?.name || nvId }], ky)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.7rem',
              borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
              fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
            }}>
            <FileDown size={13} /> Xuất Excel
          </button>
          <button onClick={() => setInBan(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '0.35rem 0.7rem',
              borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
              fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
            }}>
            <Printer size={13} /> In
          </button>
        </div>
      )}

      {inBan && (
        <div className="kpi-print-only">
          <KpiPrint duLieu={duLieuIn} />
        </div>
      )}
```

Và thêm style in ở cuối component `KpiTab` (trước thẻ đóng):

```jsx
      <style>{`
        .kpi-print-only { display: none; }
        @media print {
          body > * { display: none !important; }
          .kpi-print-only { display: block !important; position: absolute; inset: 0; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
```

- [ ] **Step 3: Kiểm lint + build**

Run: `npx eslint src/pages/tasks/KpiTab.jsx src/components/KpiPrint.jsx`
Expected: không có error

Run: `npm run build`
Expected: build thành công

- [ ] **Step 4: Commit**

```bash
git add src/components/KpiPrint.jsx src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): nut xuat Excel va in bang KPI"
```

---

## Task 14: Sửa bảng chỉ tiêu trên app (quyền `create`)

**Files:**
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Thêm chế độ sửa vào `BangKpiMotNguoi`**

Thêm state và hàm lưu:

```jsx
  const [suaCT, setSuaCT] = useState(null);   // dòng đang sửa, null = không sửa

  async function luuChiTieu(ct) {
    const { error } = ct.id
      ? await supabase.from('kpi_chi_tieu').update({
          ten: ct.ten, mo_ta: ct.mo_ta, chi_tieu: ct.chi_tieu,
          trong_so: ct.trong_so, nhom: ct.nhom,
        }).eq('id', ct.id)
      : await supabase.from('kpi_chi_tieu').insert({
          ky, cap_do: 'CA_NHAN', nhan_vien_id: nvId, ten: ct.ten, mo_ta: ct.mo_ta,
          chi_tieu: ct.chi_tieu, trong_so: ct.trong_so, nhom: ct.nhom,
          thu_tu: (rows.filter(r => r.cap_do === 'CA_NHAN').length || 0) + 1,
        });
    if (error) { alert('Lỗi: ' + error.message); return; }
    setSuaCT(null); onReload?.();
  }

  async function xoaChiTieu(id) {
    if (!confirm('Xoá chỉ tiêu này? Nhật ký kèm theo cũng bị xoá.')) return;
    const { error } = await supabase.from('kpi_chi_tieu').delete().eq('id', id);
    if (error) { alert('Lỗi: ' + error.message); return; }
    onReload?.();
  }
```

Thêm nút "Thêm chỉ tiêu" dưới khối TOÀN BỘ CHỈ TIÊU:

```jsx
      {perm?.create && (
        <button onClick={() => setSuaCT({ ten: '', mo_ta: '', chi_tieu: 10, trong_so: 0, nhom: '' })}
          style={{
            marginTop: 8, width: '100%', padding: '0.5rem', borderRadius: 9,
            border: '1px dashed #cbd5e1', background: '#f8fafc', cursor: 'pointer',
            fontSize: '0.76rem', fontWeight: 600, color: '#475569',
          }}>
          + Thêm chỉ tiêu
        </button>
      )}

      {suaCT && (
        <FormSuaChiTieu ct={suaCT} onLuu={luuChiTieu} onXoa={xoaChiTieu}
          onHuy={() => setSuaCT(null)} />
      )}
```

Thêm component:

```jsx
function FormSuaChiTieu({ ct, onLuu, onXoa, onHuy }) {
  const [f, setF] = useState(ct);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const oInput = { padding: '0.4rem', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.78rem', width: '100%' };

  return (
    <div onClick={onHuy} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 210,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 460, width: '100%',
        display: 'grid', gap: 8, maxHeight: '85vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: 0, fontSize: '0.88rem' }}>
          {f.id ? 'Sửa chỉ tiêu' : 'Thêm chỉ tiêu'}
        </h3>
        <input placeholder="Nhóm (VD: A. THỰC HIỆN NỘI QUY)" value={f.nhom || ''}
          onChange={e => set('nhom', e.target.value)} style={oInput} />
        <input placeholder="Tên chỉ tiêu" value={f.ten || ''}
          onChange={e => set('ten', e.target.value)} style={oInput} />
        <textarea placeholder="Diễn giải / quy định trừ điểm" rows={4} value={f.mo_ta || ''}
          onChange={e => set('mo_ta', e.target.value)} style={{ ...oInput, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: '0.74rem', color: '#64748b' }}>
            Chỉ tiêu (điểm tối đa)
            <input type="number" step="1" value={f.chi_tieu ?? ''}
              onChange={e => set('chi_tieu', e.target.value === '' ? null : Number(e.target.value))}
              style={oInput} />
          </label>
          <label style={{ flex: 1, fontSize: '0.74rem', color: '#64748b' }}>
            Trọng số
            <input type="number" step="0.5" value={f.trong_so ?? 0}
              onChange={e => set('trong_so', Number(e.target.value))} style={oInput} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onLuu(f)} disabled={!f.ten?.trim()} style={{
            flex: 1, padding: '0.45rem', borderRadius: 8, border: 'none',
            background: f.ten?.trim() ? '#2563eb' : '#cbd5e1', color: '#fff',
            fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
          }}>Lưu</button>
          {f.id && (
            <button onClick={() => onXoa(f.id)} style={{
              padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #fecaca',
              background: '#fff', color: '#dc2626', fontSize: '0.78rem', cursor: 'pointer',
            }}>Xoá</button>
          )}
          <button onClick={onHuy} style={{
            padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', fontSize: '0.78rem', cursor: 'pointer',
          }}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}
```

Thêm nút sửa vào mỗi dòng chỉ tiêu trong danh sách TOÀN BỘ CHỈ TIÊU (khi `perm?.create`): đổi `onClick` của nút dòng để mở popup diễn giải như cũ, và thêm một nút bút chì nhỏ bên phải gọi `setSuaCT(d)`.

- [ ] **Step 2: Kiểm lint**

Run: `npx eslint src/pages/tasks/KpiTab.jsx`
Expected: không có error

- [ ] **Step 3: Kiểm trên dev server**

Với tài khoản có quyền `create`: thêm 1 chỉ tiêu trọng số 5 → cảnh báo đỏ "Σ trọng số = 105" hiện ra. Xoá chỉ tiêu đó → cảnh báo biến mất.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): sua bang chi tieu ngay tren app"
```

---

## Task 15: Tạo kỳ mới (copy bảng kỳ trước)

**Files:**
- Create: `sql/rpc_tao_ky_kpi.sql`
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Viết RPC**

```sql
-- Tạo kỳ KPI mới bằng cách copy toàn bộ bảng chỉ tiêu của kỳ nguồn.
-- Điểm (diem_chot, diem_tu_cham) KHÔNG copy — kỳ mới bắt đầu từ đạt đủ.
create or replace function tao_ky_kpi(ky_nguon text, ky_moi text)
returns int
language plpgsql
security definer
as $$
declare so_dong int;
begin
  if exists (select 1 from kpi_chi_tieu where ky = ky_moi) then
    raise exception 'Kỳ % đã có dữ liệu', ky_moi;
  end if;

  insert into kpi_chi_tieu
    (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
     chi_tieu, trong_so, cach_cham)
  select ky_moi, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
         chi_tieu, trong_so, cach_cham
  from kpi_chi_tieu where ky = ky_nguon;

  get diagnostics so_dong = row_count;
  return so_dong;
end;
$$;
```

- [ ] **Step 2: Thêm nút vào màn hình danh sách**

Trong `KpiTab`, thêm cạnh ô chọn kỳ:

```jsx
        {perm?.create && bangTheoNguoi.length === 0 && (
          <button onClick={async () => {
            const nguon = prompt('Copy bảng chỉ tiêu từ kỳ nào? (VD: 2026-06)');
            if (!nguon) return;
            const { data, error } = await supabase.rpc('tao_ky_kpi', { ky_nguon: nguon, ky_moi: ky });
            if (error) { alert('Lỗi: ' + error.message); return; }
            alert(`Đã tạo ${data} dòng chỉ tiêu cho kỳ ${ky}`);
            taiDuLieu();
          }} style={{
            padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #2563eb',
            background: '#fff', color: '#2563eb', fontSize: '0.76rem',
            fontWeight: 600, cursor: 'pointer',
          }}>
            Tạo kỳ từ kỳ trước
          </button>
        )}
```

- [ ] **Step 3: Kiểm lint**

Run: `npx eslint src/pages/tasks/KpiTab.jsx`
Expected: không có error

- [ ] **Step 4: Commit**

```bash
git add sql/rpc_tao_ky_kpi.sql src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): tao ky moi bang cach copy bang chi tieu ky truoc"
```

---

## Task 16: Chạy toàn bộ test + build cuối

- [ ] **Step 1: Chạy toàn bộ test**

Run: `npm test`
Expected: tất cả PASS, gồm 25 test `kpiEngine` + 4 test `kpiExcel` + 1 test `permRegistry` mới + các test cũ không hỏng.

- [ ] **Step 2: Lint toàn dự án**

Run: `npm run lint`
Expected: không có error mới so với trước khi làm module này.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 4: Cập nhật `deploy-netlify` theo nếp deploy của dự án**

Xem `docs/` hoặc lịch sử commit `build(deploy): dong bo deploy-netlify ...` để đồng bộ đúng cách dự án đang làm.

- [ ] **Step 5: Commit cuối**

```bash
git add -A
git commit -m "build(kpi): dong bo deploy sau khi them module KPI"
```

---

## Việc chủ app phải làm tay (không tự động được)

1. Chạy `sql/create_kpi_module.sql` trên Supabase SQL Editor.
2. Chạy `sql/rpc_tao_ky_kpi.sql`.
3. Sửa `MAP_NV` trong `scripts/import-kpi-excel.mjs` cho khớp `select id, name from nhan_vien`, chạy lại script, soát `sql/seed_kpi_2026_06.sql`, rồi chạy trên SQL Editor.
4. Bật quyền tab KPI cho từng tài khoản trong màn hình quản lý người dùng.
