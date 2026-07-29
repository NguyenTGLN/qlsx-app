# PSX ảo cho công việc hỗ trợ — Kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho thợ báo cáo 5 loại việc hỗ trợ (GH, NH, DK, DTNB, PS) qua 5 phiếu thường trực — vẫn chọn giờ và người, bỏ chọn vị trí lưu, bỏ nhập kho tự động, bắt buộc ghi chú.

**Architecture:** Đánh dấu bằng 2 cột mới trên `production_orders` (`loai_viec`, `cach_tinh_hieu_suat`) đều có giá trị mặc định, nên dữ liệu và luồng sản xuất hiện có không đổi hành vi. Quy tắc nghiệp vụ (nhãn, gợi ý ghi chú, cách tính hiệu suất, kiểm tra ghi chú) tách vào `src/lib/congViecHoTro.js` để test được mà không cần render. Năm màn hình khác chỉ thêm một điều kiện lọc.

**Tech Stack:** React 19, Vite, Supabase (PostgREST), Vitest, `renderToStaticMarkup` cho test component.

**Spec:** `docs/superpowers/specs/2026-07-28-psx-ao-cong-viec-ho-tro-design.md`

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/lib/congViecHoTro.js` *(tạo mới)* | Danh mục 5 mã việc, gợi ý ghi chú, quy tắc tính hiệu suất, quy tắc bắt buộc ghi chú. Thuần, không phụ thuộc React hay Supabase. |
| `src/lib/congViecHoTro.test.js` *(tạo mới)* | Test cho file trên. |
| `src/lib/locPhieuSanXuat.js` *(sửa)* | Loại phiếu `HO_TRO` khỏi 3 tab và số đếm; thêm hàm lấy riêng danh sách việc hỗ trợ. |
| `src/lib/locPhieuSanXuat.test.js` *(sửa)* | Test cho phần thêm. |
| `src/components/KhuViecHoTro.jsx` *(tạo mới)* | Khu "Công việc khác" — thuần hiển thị, nhận dữ liệu qua props nên test được mà không cần Supabase. |
| `src/components/KhuViecHoTro.test.jsx` *(tạo mới)* | Test cho component trên. |
| `src/pages/WorkerDashboard.jsx` *(sửa)* | Gắn khu "Công việc khác" dưới danh sách PSX. |
| `src/pages/WorkerDashboard.test.jsx` *(sửa)* | Test màn hình có gắn component. |
| `src/pages/WorkerInput.jsx` *(sửa)* | Nhánh báo cáo cho việc hỗ trợ. |
| `src/pages/tasks/TaskApp.jsx`, `src/pages/kho/ProductionOrderTab.jsx`, `src/pages/kho/ImportStockTab.jsx`, `src/pages/AdminDashboard.jsx` *(sửa)* | Thêm điều kiện lọc `SAN_XUAT`. |

**Không tạo bảng mới.** KPI, Báo cáo công việc, Lịch sử sản xuất vẫn đọc `production_logs` như cũ.

## Ghi chú cho người thực hiện

Trong 5 mã việc, DB **mới chỉ có `GH`** trong `inventory_items`. Kế hoạch này **cố ý KHÔNG** tạo 4 dòng danh mục còn lại: `inventory_items` là danh mục kho, thêm mã không có tồn kho vào đó sẽ làm bẩn màn hình Danh mục và Tồn kho. Tính năng chạy được mà không cần chúng — nhãn hiển thị lấy từ `congViecHoTro.js`. Nếu người dùng vẫn muốn có mã trong danh mục kho thì làm ở một việc riêng.

---

### Task 1: Migration DB — 2 cột mới + 5 phiếu thường trực

**Files:**
- Chạy qua MCP Supabase `apply_migration`, project `ngwkzicrnspeggunsblr`

- [ ] **Bước 1: Đo hiện trạng trước khi đổi**

Chạy `execute_sql`:

```sql
select count(*) as so_phieu,
       count(*) filter (where order_code like 'VIEC-%') as phieu_viec_da_co
from production_orders;
```

Kỳ vọng: `so_phieu` = 8, `phieu_viec_da_co` = 0. Ghi lại `so_phieu` để đối chiếu ở bước 4.

- [ ] **Bước 2: Áp migration**

Gọi `apply_migration`, tên `them_cong_viec_ho_tro`:

```sql
alter table public.production_orders
  add column loai_viec text not null default 'SAN_XUAT'
    check (loai_viec in ('SAN_XUAT','HO_TRO')),
  add column cach_tinh_hieu_suat text not null default 'DINH_MUC'
    check (cach_tinh_hieu_suat in ('DINH_MUC','CO_DINH_100'));

alter table public.production_logs
  add column ghi_chu text;

insert into public.production_orders
  (order_code, product_code, target_quantity, standard_time_per_unit, status, loai_viec, cach_tinh_hieu_suat)
values
  ('VIEC-GH',   'GH',   0, 0.1667, 'pending', 'HO_TRO', 'DINH_MUC'),
  ('VIEC-NH',   'NH',   0, 0,      'pending', 'HO_TRO', 'CO_DINH_100'),
  ('VIEC-DK',   'DK',   0, 0,      'pending', 'HO_TRO', 'CO_DINH_100'),
  ('VIEC-DTNB', 'DTNB', 0, 0,      'pending', 'HO_TRO', 'CO_DINH_100'),
  ('VIEC-PS',   'PS',   0, 0,      'pending', 'HO_TRO', 'CO_DINH_100');
```

- [ ] **Bước 3: Kiểm chứng 5 phiếu mới**

Chạy `execute_sql`:

```sql
select order_code, product_code, loai_viec, cach_tinh_hieu_suat,
       target_quantity::text, standard_time_per_unit::text
from production_orders where loai_viec = 'HO_TRO' order by order_code;
```

Kỳ vọng: đúng 5 dòng, `VIEC-GH` có `DINH_MUC` và `standard_time_per_unit` = 0.1667, bốn dòng còn lại `CO_DINH_100` và 0.

- [ ] **Bước 4: Kiểm chứng dữ liệu cũ KHÔNG đổi**

Chạy `execute_sql`:

```sql
select count(*) as tong,
       count(*) filter (where loai_viec = 'SAN_XUAT') as san_xuat,
       count(*) filter (where cach_tinh_hieu_suat = 'DINH_MUC') as dinh_muc
from production_orders where order_code not like 'VIEC-%';
```

Kỳ vọng: cả ba con số bằng `so_phieu` ghi ở bước 1 (8). Nghĩa là mọi phiếu cũ đã nhận đúng giá trị mặc định, không dòng nào bị bỏ sót.

- [ ] **Bước 5: Kiểm chứng cột ghi chú**

Chạy `execute_sql`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='production_logs' and column_name='ghi_chu';
```

Kỳ vọng: 1 dòng, `text`, `YES`.

---

### Task 2: Quy tắc việc hỗ trợ (`congViecHoTro.js`)

**Files:**
- Create: `src/lib/congViecHoTro.js`
- Test: `src/lib/congViecHoTro.test.js`

- [ ] **Bước 1: Viết test thất bại**

Tạo `src/lib/congViecHoTro.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  DANH_MUC_HO_TRO, laViecHoTro, hieuSuatCoDinh, thongTinViec,
  tinhHieuSuat, ghiChuHopLe,
} from './congViecHoTro';

const phieuHoTro = (product_code, cach = 'CO_DINH_100') => ({
  order_code: `VIEC-${product_code}`, product_code,
  loai_viec: 'HO_TRO', cach_tinh_hieu_suat: cach,
});
const phieuSanXuat = { order_code: 'PSX-20260723-12', product_code: 'WT-028S-RO', loai_viec: 'SAN_XUAT', cach_tinh_hieu_suat: 'DINH_MUC' };

describe('DANH_MUC_HO_TRO', () => {
  it('đủ 5 mã việc, đúng thứ tự hiển thị', () => {
    expect(DANH_MUC_HO_TRO.map(v => v.ma)).toEqual(['GH', 'NH', 'DK', 'DTNB', 'PS']);
  });

  it('nhãn đủ ngắn để nằm 1 dòng trên điện thoại', () => {
    // Luật giao diện của dự án: nhãn nút/thẻ tối đa 10 ký tự.
    for (const v of DANH_MUC_HO_TRO) expect(v.nhan.length).toBeLessThanOrEqual(10);
  });

  it('mã nào cũng có gợi ý ghi chú', () => {
    for (const v of DANH_MUC_HO_TRO) expect(v.goiY.length).toBeGreaterThan(0);
  });
});

describe('laViecHoTro', () => {
  it('nhận đúng phiếu hỗ trợ và phiếu sản xuất', () => {
    expect(laViecHoTro(phieuHoTro('NH'))).toBe(true);
    expect(laViecHoTro(phieuSanXuat)).toBe(false);
  });

  it('phiếu cũ chưa có cột loai_viec vẫn coi là sản xuất', () => {
    expect(laViecHoTro({ order_code: 'PSX-20260728-04' })).toBe(false);
    expect(laViecHoTro(null)).toBe(false);
  });
});

describe('hieuSuatCoDinh', () => {
  it('chỉ đúng với phiếu CO_DINH_100', () => {
    expect(hieuSuatCoDinh(phieuHoTro('NH'))).toBe(true);
    expect(hieuSuatCoDinh(phieuHoTro('GH', 'DINH_MUC'))).toBe(false);
    expect(hieuSuatCoDinh(phieuSanXuat)).toBe(false);
    expect(hieuSuatCoDinh(null)).toBe(false);
  });
});

describe('thongTinViec', () => {
  it('tra được nhãn và gợi ý theo mã', () => {
    expect(thongTinViec('DTNB')).toMatchObject({ ma: 'DTNB', nhan: 'Đào tạo' });
    expect(thongTinViec('NH').goiY).toMatch(/Nhập hàng gì/);
  });

  it('mã lạ trả null chứ không ném lỗi', () => {
    expect(thongTinViec('KHONG-CO')).toBeNull();
    expect(thongTinViec(undefined)).toBeNull();
  });
});

describe('tinhHieuSuat', () => {
  const dl = { soLuong: 20, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0.1667 };

  it('phiếu CO_DINH_100 luôn ra 100, bất kể số lượng và giờ', () => {
    expect(tinhHieuSuat(phieuHoTro('DK'), dl)).toBe(100);
    expect(tinhHieuSuat(phieuHoTro('DK'), { soLuong: 0, soGio: 8, soNguoi: 1, dinhMucGioMotSP: 0 })).toBe(100);
  });

  it('phiếu DINH_MUC tính theo đúng công thức cũ', () => {
    // (20/2 người) / 4 giờ * 0.1667 * 100 = 41.675 → làm tròn 42
    expect(tinhHieuSuat(phieuHoTro('GH', 'DINH_MUC'), dl)).toBe(42);
    expect(tinhHieuSuat(phieuSanXuat, dl)).toBe(42);
  });

  it('thiếu dữ liệu thì hiệu suất bằng 0, không ra NaN', () => {
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 0, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 0, soNguoi: 2, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 4, soNguoi: 0, dinhMucGioMotSP: 0.1667 })).toBe(0);
    expect(tinhHieuSuat(phieuSanXuat, { soLuong: 20, soGio: 4, soNguoi: 2, dinhMucGioMotSP: 0 })).toBe(0);
  });
});

describe('ghiChuHopLe', () => {
  it('việc hỗ trợ bắt buộc có ghi chú', () => {
    expect(ghiChuHopLe(phieuHoTro('PS'), 'Sửa băng chuyền số 2')).toBe(true);
    expect(ghiChuHopLe(phieuHoTro('PS'), '')).toBe(false);
    expect(ghiChuHopLe(phieuHoTro('PS'), '   ')).toBe(false);
    expect(ghiChuHopLe(phieuHoTro('PS'), null)).toBe(false);
  });

  it('phiếu sản xuất không bắt buộc ghi chú', () => {
    expect(ghiChuHopLe(phieuSanXuat, '')).toBe(true);
  });
});
```

- [ ] **Bước 2: Chạy test cho chắc là thất bại**

```bash
npx vitest run src/lib/congViecHoTro.test.js
```

Kỳ vọng: FAIL — `Failed to resolve import "./congViecHoTro"`.

- [ ] **Bước 3: Viết mã tối thiểu**

Tạo `src/lib/congViecHoTro.js`:

```js
// Quy tắc cho CÔNG VIỆC HỖ TRỢ — việc hàng ngày của thợ nhưng không phải sản xuất:
// đóng đơn giao hàng, nhập hàng, dọn kho, đào tạo nội bộ, việc phát sinh.
//
// Các việc này có mã trong danh mục nhưng KHÔNG có BOM, KHÔNG có tồn kho, KHÔNG
// xuất nhập gì. Chúng được gắn vào 5 phiếu thường trực `VIEC-*` trong
// `production_orders`, đánh dấu bằng cột `loai_viec = 'HO_TRO'`.
//
// Tách khỏi React/Supabase để test được quy tắc mà không phải dựng màn hình.

// `nhan` tối đa 10 ký tự — luật giao diện của dự án: chữ trên nút/thẻ luôn 1 dòng,
// máy 375px chia đôi màn hình thì quá 10 ký tự là bắt đầu bị cắt.
export const DANH_MUC_HO_TRO = [
  { ma: 'GH',   nhan: 'Giao hàng', tenDayDu: 'Đóng đơn giao hàng', goiY: 'Đơn nào, cho khách nào?' },
  { ma: 'NH',   nhan: 'Nhập hàng', tenDayDu: 'Nhập hàng',          goiY: 'Nhập hàng gì, của ai?' },
  { ma: 'DK',   nhan: 'Dọn kho',   tenDayDu: 'Dọn kho',            goiY: 'Dọn khu nào?' },
  { ma: 'DTNB', nhan: 'Đào tạo',   tenDayDu: 'Đào tạo nội bộ',     goiY: 'Đào tạo nội dung gì?' },
  { ma: 'PS',   nhan: 'Phát sinh', tenDayDu: 'Việc phát sinh',     goiY: 'Việc phát sinh gì?' },
];

export const laViecHoTro = order => order?.loai_viec === 'HO_TRO';

export const hieuSuatCoDinh = order =>
  laViecHoTro(order) && order?.cach_tinh_hieu_suat === 'CO_DINH_100';

export const thongTinViec = ma =>
  DANH_MUC_HO_TRO.find(v => v.ma === ma) || null;

// Hiệu suất %, làm tròn về số nguyên — giữ ĐÚNG công thức cũ của màn báo cáo để
// phiếu sản xuất thật không bị chấm lệch đi:
//   (số lượng / số người) / số giờ * định mức giờ-một-sản-phẩm * 100
export function tinhHieuSuat(order, { soLuong, soGio, soNguoi, dinhMucGioMotSP }) {
  if (hieuSuatCoDinh(order)) return 100;

  const sl = parseFloat(soLuong) || 0;
  const gio = parseFloat(soGio) || 0;
  const nguoi = parseInt(soNguoi, 10) || 0;
  const dinhMuc = parseFloat(dinhMucGioMotSP) || 0;
  if (sl <= 0 || gio <= 0 || nguoi <= 0 || dinhMuc <= 0) return 0;

  return Math.round((sl / nguoi / gio) * dinhMuc * 100);
}

// Việc hỗ trợ BẮT BUỘC ghi chú — không ghi thì bản ghi chỉ còn "ai đó làm gì đó
// 3 tiếng", không tra được. Phiếu sản xuất thì ghi chú là tùy chọn.
export const ghiChuHopLe = (order, ghiChu) =>
  !laViecHoTro(order) || String(ghiChu || '').trim().length > 0;
```

- [ ] **Bước 4: Chạy test cho chắc là qua**

```bash
npx vitest run src/lib/congViecHoTro.test.js
```

Kỳ vọng: PASS, 13 test.

- [ ] **Bước 5: Commit**

```bash
git add src/lib/congViecHoTro.js src/lib/congViecHoTro.test.js
git commit -m "feat(sx): quy tac cong viec ho tro - nhan, goi y ghi chu, hieu suat"
```

---

### Task 3: Loại việc hỗ trợ khỏi 3 tab lọc

**Files:**
- Modify: `src/lib/locPhieuSanXuat.js`
- Test: `src/lib/locPhieuSanXuat.test.js`

Lý do: `locPhieuSanXuat` tính `còn lại = target − đã làm`. Phiếu hỗ trợ có `target = 0` nên ngay báo cáo đầu tiên `còn lại` ra số âm ⇒ `xong = true` ⇒ `VIEC-GH` rơi vào tab "Hoàn thành". Ba tab chỉ dành cho phiếu sản xuất thật.

- [ ] **Bước 1: Viết test thất bại**

Thêm vào cuối `src/lib/locPhieuSanXuat.test.js`:

```js
describe('phiếu công việc hỗ trợ', () => {
  const hoTro = (ma, daLam = []) => ({
    id: `VIEC-${ma}`, order_code: `VIEC-${ma}`, product_code: ma,
    target_quantity: 0, status: 'pending', created_at: '2026-07-01T00:00:00Z',
    loai_viec: 'HO_TRO', cach_tinh_hieu_suat: ma === 'GH' ? 'DINH_MUC' : 'CO_DINH_100',
    production_logs: daLam.map(q => ({ actual_quantity: q })),
  });

  const ds = [
    phieu('PSX-20260723-12', 26, [16], '2026-07-27T09:42:00Z'),
    phieu('PSX-20260728-01', 100, [100], '2026-07-28T03:24:00Z'),
    hoTro('GH', [5]),   // target 0, đã làm 5 → "còn lại" âm
    hoTro('NH'),
  ];

  it('không lọt vào bất kỳ tab nào trong 3 tab', () => {
    for (const bo of [BO_LOC.TAT_CA, BO_LOC.DANG_LAM, BO_LOC.HOAN_THANH]) {
      const ma = locPhieuSanXuat(ds, bo).map(o => o.order_code);
      expect(ma.some(x => x.startsWith('VIEC-'))).toBe(false);
    }
  });

  it('GH đã có báo cáo vẫn KHÔNG bị xếp vào tab Hoàn thành', () => {
    expect(locPhieuSanXuat(ds, BO_LOC.HOAN_THANH).map(o => o.order_code))
      .toEqual(['PSX-20260728-01']);
  });

  it('không được đếm vào số của 3 nút lọc', () => {
    expect(demTheoBoLoc(ds)).toEqual({
      [BO_LOC.TAT_CA]: 2,
      [BO_LOC.DANG_LAM]: 1,
      [BO_LOC.HOAN_THANH]: 1,
    });
  });
});

describe('locViecHoTro', () => {
  const hoTro = (ma) => ({
    id: `VIEC-${ma}`, order_code: `VIEC-${ma}`, product_code: ma,
    target_quantity: 0, status: 'pending', created_at: '2026-07-01T00:00:00Z',
    loai_viec: 'HO_TRO', cach_tinh_hieu_suat: 'CO_DINH_100', production_logs: [],
  });

  it('trả đúng các phiếu hỗ trợ, xếp theo thứ tự danh mục chứ không theo ngày tạo', () => {
    const ds = [hoTro('PS'), phieu('PSX-1', 5, [], '2026-07-28T00:00:00Z'), hoTro('GH'), hoTro('DK')];
    expect(locViecHoTro(ds).map(o => o.product_code)).toEqual(['GH', 'DK', 'PS']);
  });

  it('mã hỗ trợ lạ (không có trong danh mục) vẫn hiện, xếp cuối', () => {
    const la = { ...hoTro('XX'), product_code: 'XX' };
    expect(locViecHoTro([la, hoTro('GH')]).map(o => o.product_code)).toEqual(['GH', 'XX']);
  });

  it('danh sách rỗng / thiếu tham số không ném lỗi', () => {
    expect(locViecHoTro()).toEqual([]);
    expect(locViecHoTro([])).toEqual([]);
  });
});
```

Sửa dòng import đầu file `src/lib/locPhieuSanXuat.test.js` thành:

```js
import { BO_LOC, NHAN_BO_LOC, tinhDaLam, gomTienDo, locPhieuSanXuat, demTheoBoLoc, locViecHoTro } from './locPhieuSanXuat';
```

- [ ] **Bước 2: Chạy test cho chắc là thất bại**

```bash
npx vitest run src/lib/locPhieuSanXuat.test.js
```

Kỳ vọng: FAIL — `locViecHoTro is not a function`, và test "không lọt vào bất kỳ tab nào" fail vì `VIEC-GH` đang lọt vào tab Hoàn thành.

- [ ] **Bước 3: Viết mã tối thiểu**

Trong `src/lib/locPhieuSanXuat.js`, thêm import ở đầu file (ngay dưới dòng comment mở đầu):

```js
import { DANH_MUC_HO_TRO, laViecHoTro } from './congViecHoTro';
```

Sửa hàm lọc chung — thay dòng:

```js
const conHieuLuc = o => o?.status !== 'cancelled';
```

thành:

```js
// Ba tab CHỈ dành cho phiếu sản xuất thật. Phiếu hỗ trợ là phiếu thường trực,
// `target = 0` nên "còn lại" luôn ra số âm ⇒ sẽ bị xếp nhầm vào tab "Hoàn thành"
// ngay từ báo cáo đầu tiên. Chúng có khu riêng, xem `locViecHoTro`.
const conHieuLuc = o => o?.status !== 'cancelled' && !laViecHoTro(o);
```

Thêm vào cuối file:

```js
// Phiếu công việc hỗ trợ — luôn hiện đủ, KHÔNG chịu 3 nút lọc.
// Xếp theo thứ tự trong danh mục (Giao hàng → Nhập hàng → Dọn kho → Đào tạo →
// Phát sinh) chứ không theo ngày tạo: đây là danh sách cố định, thợ nhớ theo vị trí
// trên màn hình, đảo thứ tự mỗi lần tải là bắt người ta phải đọc lại.
export function locViecHoTro(orders = []) {
  const thuTu = ma => {
    const i = DANH_MUC_HO_TRO.findIndex(v => v.ma === ma);
    return i === -1 ? DANH_MUC_HO_TRO.length : i;   // mã lạ xuống cuối
  };
  return gomTienDo(orders)
    .filter(o => laViecHoTro(o) && o?.status !== 'cancelled')
    .sort((a, b) => thuTu(a.product_code) - thuTu(b.product_code));
}
```

- [ ] **Bước 4: Chạy test cho chắc là qua**

```bash
npx vitest run src/lib/locPhieuSanXuat.test.js
```

Kỳ vọng: PASS, toàn bộ test cũ vẫn qua (chứng minh 3 tab của phiếu sản xuất không bị đổi hành vi).

- [ ] **Bước 5: Commit**

```bash
git add src/lib/locPhieuSanXuat.js src/lib/locPhieuSanXuat.test.js
git commit -m "feat(sx): tach phieu ho tro khoi 3 tab loc, them locViecHoTro"
```

---

### Task 4: Component khu "Công việc khác"

**Files:**
- Create: `src/components/KhuViecHoTro.jsx`
- Test: `src/components/KhuViecHoTro.test.jsx`

Tách thành component nhận props thay vì viết thẳng vào `WorkerDashboard`: `WorkerDashboard` tự gọi Supabase nên render tĩnh luôn ra danh sách rỗng, không test được phần hiển thị. Component nhận sẵn dữ liệu thì test được đúng cái cần test.

- [ ] **Bước 1: Viết test thất bại**

Tạo `src/components/KhuViecHoTro.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import KhuViecHoTro from './KhuViecHoTro';
import { DANH_MUC_HO_TRO } from '../lib/congViecHoTro';

const DS = DANH_MUC_HO_TRO.map(v => ({
  id: `id-${v.ma}`, order_code: `VIEC-${v.ma}`, product_code: v.ma,
  loai_viec: 'HO_TRO', cach_tinh_hieu_suat: v.ma === 'GH' ? 'DINH_MUC' : 'CO_DINH_100',
}));

const markup = (danhSach = DS) =>
  renderToStaticMarkup(<KhuViecHoTro danhSach={danhSach} onChon={() => {}} />);
const text = (danhSach = DS) => markup(danhSach).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('KhuViecHoTro', () => {
  it('hiện tiêu đề khu và đủ 5 thẻ', () => {
    const t = text();
    expect(t).toContain('Công việc khác');
    for (const v of DANH_MUC_HO_TRO) expect(t).toContain(v.nhan);
  });

  it('chia đôi bề ngang, cột co được, không cuộn ngang', () => {
    const html = markup();
    expect(html).toMatch(/grid-template-columns\s*:\s*repeat\(2\s*,\s*minmax\(0\s*,\s*1fr\)\)/);
    expect(html).not.toMatch(/overflow-x\s*:\s*auto/);
  });

  it('chữ trên thẻ luôn 1 dòng, dài quá thì cắt', () => {
    const html = markup();
    expect(html).toMatch(/white-space\s*:\s*nowrap/);
    expect(html).toMatch(/text-overflow\s*:\s*ellipsis/);
  });

  it('KHÔNG có cụm Chỉ tiêu/Đã Nhập/Còn — phiếu thường trực thì chỉ tiêu vô nghĩa', () => {
    expect(text()).not.toContain('Chỉ tiêu');
  });

  it('mỗi thẻ mang data-viec để đo giao diện và bấm được', () => {
    const html = markup();
    for (const v of DANH_MUC_HO_TRO) expect(html).toContain(`data-viec="${v.ma}"`);
  });

  it('danh sách rỗng thì không hiện gì cả', () => {
    expect(markup([])).toBe('');
  });

  it('mã lạ không có trong danh mục vẫn hiện, lấy mã làm nhãn', () => {
    const la = [{ id: 'x', order_code: 'VIEC-XX', product_code: 'XX', loai_viec: 'HO_TRO' }];
    expect(text(la)).toContain('XX');
  });
});
```

- [ ] **Bước 2: Chạy test cho chắc là thất bại**

```bash
npx vitest run src/components/KhuViecHoTro.test.jsx
```

Kỳ vọng: FAIL — `Failed to resolve import "./KhuViecHoTro"`.

- [ ] **Bước 3: Viết mã tối thiểu**

Tạo `src/components/KhuViecHoTro.jsx`:

```jsx
import React from 'react';
import { Wrench } from 'lucide-react';
import { thongTinViec } from '../lib/congViecHoTro';

// Khu "Công việc khác" trên màn hình Sản Xuất của thợ.
//
// Năm phiếu thường trực (GH/NH/DK/DTNB/PS) LUÔN hiện đủ, không chịu 3 nút lọc phía
// trên: phiếu thường trực thì "hoàn thành / đang làm" vô nghĩa. Thẻ ở đây cũng không
// có cụm "Chỉ tiêu / Đã Nhập / Còn" vì các việc này không có chỉ tiêu.
//
// Giao diện theo luật của dự án: lưới chia đều `minmax(0, 1fr)`, chữ luôn 1 dòng
// (`nowrap` + ellipsis), cỡ chữ co theo bề ngang máy — không bao giờ cuộn ngang.
const KhuViecHoTro = ({ danhSach = [], onChon }) => {
  if (!danhSach.length) return null;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Wrench size={16} color="#64748b" />
        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Công việc khác</h3>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.5rem',
      }}>
        {danhSach.map(order => {
          const tt = thongTinViec(order.product_code);
          return (
            <button
              key={order.id}
              type="button"
              data-viec={order.product_code}
              title={tt?.tenDayDu || order.product_code}
              onClick={() => onChon(order)}
              style={{
                width: '100%',
                minWidth: 0,
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '0.75rem',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{
                fontWeight: 700,
                color: '#0f172a',
                fontSize: 'clamp(0.72rem, 3.4vw, 0.9rem)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {tt?.nhan || order.product_code}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#94a3b8',
                fontWeight: 600,
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {order.product_code}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default KhuViecHoTro;
```

- [ ] **Bước 4: Chạy test cho chắc là qua**

```bash
npx vitest run src/components/KhuViecHoTro.test.jsx
```

Kỳ vọng: PASS, 7 test.

- [ ] **Bước 5: Commit**

```bash
git add src/components/KhuViecHoTro.jsx src/components/KhuViecHoTro.test.jsx
git commit -m "feat(sx): component khu Cong viec khac"
```

---

### Task 4b: Gắn khu "Công việc khác" vào màn hình thợ

**Files:**
- Modify: `src/pages/WorkerDashboard.jsx`
- Test: `src/pages/WorkerDashboard.test.jsx`

- [ ] **Bước 1: Viết test thất bại**

Thêm vào cuối `src/pages/WorkerDashboard.test.jsx`:

```js
describe('WorkerDashboard — gắn khu Công việc khác', () => {
  it('có dùng component KhuViecHoTro', async () => {
    // Render tĩnh không chạy useEffect ⇒ danh sách rỗng ⇒ component trả null.
    // Nên kiểm ở mức "màn hình có nhập và gọi component", không kiểm markup ở đây;
    // phần hiển thị đã được KhuViecHoTro.test.jsx phủ.
    const nguon = await import('fs').then(fs =>
      fs.readFileSync('src/pages/WorkerDashboard.jsx', 'utf8'));
    expect(nguon).toContain("import KhuViecHoTro from '../components/KhuViecHoTro'");
    expect(nguon).toContain('<KhuViecHoTro');
    expect(nguon).toContain('locViecHoTro');
  });
});
```

- [ ] **Bước 2: Chạy test cho chắc là thất bại**

```bash
npx vitest run src/pages/WorkerDashboard.test.jsx
```

Kỳ vọng: FAIL — không tìm thấy chuỗi import.

- [ ] **Bước 3: Viết mã tối thiểu**

Trong `src/pages/WorkerDashboard.jsx`, sửa dòng import từ `locPhieuSanXuat` và thêm import component:

```js
import { BO_LOC, NHAN_BO_LOC, locPhieuSanXuat, demTheoBoLoc, locViecHoTro } from '../lib/locPhieuSanXuat';
import KhuViecHoTro from '../components/KhuViecHoTro';
```

Thêm ngay dưới dòng `const soLuong = useMemo(...)`:

```js
  const viecHoTro = useMemo(() => locViecHoTro(allOrders), [allOrders]);
```

Chèn ngay trước thẻ `</div>` đóng của `<div style={{ padding: '1rem' }}>` (tức là sau khối danh sách PSX):

```jsx
        <KhuViecHoTro
          danhSach={viecHoTro}
          onChon={(order) => navigate(`/worker/input/${order.id}`, { state: { order } })}
        />
```

- [ ] **Bước 4: Chạy test cho chắc là qua**

```bash
npx vitest run src/pages/WorkerDashboard.test.jsx
```

Kỳ vọng: PASS, toàn bộ test cũ của file này vẫn qua.

- [ ] **Bước 5: Commit**

```bash
git add src/pages/WorkerDashboard.jsx src/pages/WorkerDashboard.test.jsx
git commit -m "feat(sx): gan khu Cong viec khac vao man hinh tho"
```

---

### Task 5: Màn báo cáo — nhánh việc hỗ trợ

**Files:**
- Modify: `src/pages/WorkerInput.jsx`

Không có test tự động cho file này (nó là màn hình lớn gắn chặt Supabase, repo chưa có hạ tầng mock). Quy tắc đã được test ở Task 2; ở đây kiểm chứng bằng chạy thật ở Task 8.

- [ ] **Bước 1: Thêm import và biến nhận dạng**

Thêm vào cụm import đầu file:

```js
import { laViecHoTro, hieuSuatCoDinh, thongTinViec, tinhHieuSuat, ghiChuHopLe } from '../lib/congViecHoTro';
```

Thêm state ngay dưới `const [dailyLogs, setDailyLogs] = useState([]);`:

```js
  const [ghiChu, setGhiChu] = useState('');
```

Thêm ngay dưới dòng `const canSubmit = p.create || p.edit;`:

```js
  // Việc hỗ trợ (GH/NH/DK/DTNB/PS): không có tồn kho nên bỏ hẳn phần vị trí và
  // nhập kho tự động; bù lại bắt buộc ghi chú.
  const hoTro = laViecHoTro(order);
  const chamCoDinh = hieuSuatCoDinh(order);
  const goiYGhiChu = thongTinViec(order?.product_code)?.goiY || 'Ghi rõ nội dung công việc';
```

- [ ] **Bước 2: Bỏ các truy vấn và ràng buộc không dùng cho việc hỗ trợ**

Trong effect lấy `remainingQty` (bắt đầu `if (order && order.id) {`), sửa dòng điều kiện thành:

```js
    if (hoTro) return;                 // phiếu thường trực: không có "chỉ tiêu còn lại"
    if (order && order.id) {
```

và đổi mảng phụ thuộc cuối effect thành `}, [order, hoTro]);`

Trong effect kiểm tra định mức (bắt đầu `if (!order) return;`), thêm ngay sau dòng đó:

```js
    // 4 mã CO_DINH_100 không dùng định mức ⇒ không được để guard chặn.
    if (chamCoDinh) { setCapacityOk(true); setCapacityErr(false); return; }
```

và đổi mảng phụ thuộc thành `}, [order, chamCoDinh]);`

Trong effect lấy vị trí kho (`const fetchLocations = async () => {`), thêm ngay sau `if (!order) return;`:

```js
      if (hoTro) return;               // việc hỗ trợ không nhập kho
```

và đổi mảng phụ thuộc thành `}, [order, hoTro]);`

Trong effect cộng dồn số lượng từ các vị trí, thêm dòng đầu:

```js
  useEffect(() => {
    if (hoTro) return;                 // việc hỗ trợ gõ thẳng số lượng, không cộng từ vị trí
    const total = locationsData.reduce((sum, loc) => sum + (parseFloat(loc.addQty) || 0), 0);
    setActualQuantity(total > 0 ? total.toString() : '');
  }, [locationsData, hoTro]);
```

- [ ] **Bước 3: Dùng hàm tính hiệu suất dùng chung**

Thay toàn bộ thân effect tính hiệu suất bằng:

```js
  useEffect(() => {
    if (!order) return;
    const timeHrs = calculateHours(startTime, endTime);
    setTotalTime(timeHrs);
    setPerformance(tinhHieuSuat(order, {
      soLuong: actualQuantity,
      soGio: timeHrs,
      soNguoi: selectedWorkers.length,
      dinhMucGioMotSP: order.standard_time_per_unit,
    }));
  }, [actualQuantity, startTime, endTime, selectedWorkers, order]);
```

- [ ] **Bước 4: Nới các chốt chặn không áp dụng cho việc hỗ trợ**

Thay hai dòng:

```js
  const isLoadingData = remainingQty === null;
  const isOverLimit = !isLoadingData && parseFloat(actualQuantity) > remainingQty;
```

bằng:

```js
  // Phiếu thường trực không có "chỉ tiêu còn lại" ⇒ không chờ tải, không có trần.
  const isLoadingData = hoTro ? false : remainingQty === null;
  const isOverLimit = !hoTro && !isLoadingData && parseFloat(actualQuantity) > remainingQty;
```

Trong `handleSubmit`, thay khối kiểm tra vị trí:

```js
    const validLocations = locationsData.filter(loc => parseFloat(loc.addQty) > 0);
    if (validLocations.length === 0) {
```

bằng:

```js
    if (!ghiChuHopLe(order, ghiChu)) {
        alert('Vui lòng ghi chú rõ nội dung công việc trước khi gửi!');
        return;
    }
    const validLocations = hoTro ? [] : locationsData.filter(loc => parseFloat(loc.addQty) > 0);
    if (!hoTro && validLocations.length === 0) {
```

và thêm `!hoTro &&` vào đầu điều kiện của hai kiểm tra vị trí ngay sau đó:

```js
    if (!hoTro && validLocations.some(loc => !String(loc.location || '').trim())) {
```

```js
    const locKeys = validLocations.map(loc => String(loc.location).trim().toLowerCase());
    if (!hoTro && new Set(locKeys).size !== locKeys.length) {
```

- [ ] **Bước 5: Ghi ghi chú vào bản ghi và bỏ qua nhập kho tự động**

Trong `handleSubmit`, thêm `ghi_chu` vào bản ghi:

```js
      const logsToInsert = selectedWorkers.map(wId => ({
          order_id: order.id,
          worker_id: wId,
          start_time: startTime,
          end_time: endTime,
          actual_quantity: qtyPerPerson,
          actual_time_spent: totalTime,
          workers_count: 1,
          performance_rate: performance,
          execution_date: executionDate,
          ghi_chu: String(ghiChu || '').trim() || null,
      }));
```

Ngay sau `if (error) throw error;` (dòng ngay dưới lệnh insert `production_logs`), chèn:

```js
      // Việc hỗ trợ KHÔNG có tồn kho: không tạo phiếu nhập kho, không ghi
      // du_lieu_nhap, không đụng inventory_stock, không trừ WIP.
      if (hoTro) {
        alert(`Đã lưu báo cáo công việc thành công (Hiệu suất ${performance}%)!`);
        navigate('/worker');
        return;
      }
```

Ghi chú cho người thực hiện: `return` này nằm trong `try`, nên `finally` vẫn chạy và cờ `submitting` vẫn được nhả — đúng ý.

Với việc hỗ trợ `CO_DINH_100`, `qtyPerPerson` = `0 / số người` = 0, hợp lệ vì `actual_quantity` là `NOT NULL` chứ không có ràng buộc dương.

- [ ] **Bước 6: Sửa giao diện**

Bọc khối số lượng (từ `<div style={styles.inputGroup}>` chứa nhãn "Tổng Sản lượng TỔ đã làm" đến hết `</div>` của nó) bằng điều kiện `{!chamCoDinh && (...)}`, và trong đó:

- thay `{remainingQty !== null && (` bằng `{!hoTro && remainingQty !== null && (`
- thay thuộc tính `readOnly` của ô số lượng bằng:

```jsx
                readOnly={!hoTro}
                onChange={(e) => setActualQuantity(e.target.value)}
```

- và trong `style` của ô đó, thay `cursor: 'not-allowed'` bằng `cursor: hoTro ? 'text' : 'not-allowed'`

Bọc toàn bộ khối "📍 Khai báo Vị trí & Số lượng nhập kho" bằng `{!hoTro && (...)}`.

Chèn khối ghi chú ngay TRƯỚC khối "Ngày & Khung Giờ Thực Hiện":

```jsx
          {hoTro && (
            <div style={styles.inputGroup}>
              <label className="form-label" style={styles.label}>
                Ghi chú <span style={{ color: 'var(--danger-color)' }}>*</span>
              </label>
              <textarea
                className="form-control"
                style={{ ...styles.input, minHeight: 80, resize: 'vertical', lineHeight: 1.4 }}
                placeholder={goiYGhiChu}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                required
              />
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                * Bắt buộc — ghi rõ để sau này tra lại được.
              </div>
            </div>
          )}
```

Trong banner đầu trang, bọc dòng "Định Mức" bằng `{!chamCoDinh && (...)}` — hiển thị `0.0000 Giờ/1 SP` cho việc chấm cố định là thông tin sai.

Trong nút gửi, thay mọi lần xuất hiện của `(remainingQty !== null && remainingQty <= 0)` (có 3 chỗ: `style.background`, `style.cursor`, `disabled`) bằng `(!hoTro && remainingQty !== null && remainingQty <= 0)`, và thay nhãn:

```jsx
                   !hoTro && remainingQty !== null && remainingQty <= 0 ? 'Lệnh hoàn thành' : `Phân Bổ & Gửi`
```

- [ ] **Bước 7: Chạy toàn bộ test + lint để chắc không vỡ gì**

```bash
npx vitest run
```

Kỳ vọng: PASS toàn bộ.

```bash
npx eslint src/pages/WorkerInput.jsx
```

Kỳ vọng: không có dòng nào in ra.

- [ ] **Bước 8: Commit**

```bash
git add src/pages/WorkerInput.jsx
git commit -m "feat(sx): man bao cao cho viec ho tro - bo vi tri, bat buoc ghi chu"
```

---

### Task 6: Ẩn phiếu hỗ trợ khỏi 5 chỗ ở màn hình khác

**Files:**
- Modify: `src/pages/tasks/TaskApp.jsx:175`
- Modify: `src/pages/kho/ProductionOrderTab.jsx:746`
- Modify: `src/pages/kho/ImportStockTab.jsx:279`
- Modify: `src/pages/AdminDashboard.jsx:113`, `src/pages/AdminDashboard.jsx:120`

Mỗi chỗ chỉ thêm đúng một điều kiện lọc, không đổi logic. Dùng `.eq('loai_viec','SAN_XUAT')` chứ không dùng `.neq(...,'HO_TRO')`: nếu sau này có thêm loại việc thứ ba, `eq` vẫn đúng còn `neq` thì lọt.

- [ ] **Bước 1: Giao việc — danh sách lệnh SX đang chờ**

`src/pages/tasks/TaskApp.jsx`, thay:

```js
        db.from('production_orders').select('*, production_logs(actual_quantity)').not('status', 'eq', 'cancelled').order('created_at', { ascending: false }),
```

bằng:

```js
        db.from('production_orders').select('*, production_logs(actual_quantity)').eq('loai_viec', 'SAN_XUAT').not('status', 'eq', 'cancelled').order('created_at', { ascending: false }),
```

- [ ] **Bước 2: Kho — ô chọn phiếu gần đây để in**

`src/pages/kho/ProductionOrderTab.jsx`, thay:

```js
    const { data: orderData } = await db.from('production_orders')
      .select('order_code, product_code')
      .in('status', ['pending', 'in_progress'])
```

bằng:

```js
    const { data: orderData } = await db.from('production_orders')
      .select('order_code, product_code')
      .eq('loai_viec', 'SAN_XUAT')
      .in('status', ['pending', 'in_progress'])
```

- [ ] **Bước 3: Kho — ô chọn phiếu SX để nhập thành phẩm**

`src/pages/kho/ImportStockTab.jsx`, thay:

```js
      const { data: ordersData } = await db.from('production_orders').select('id, order_code, product_code, target_quantity, status, created_at').order('created_at', { ascending: false });
```

bằng:

```js
      const { data: ordersData } = await db.from('production_orders').select('id, order_code, product_code, target_quantity, status, created_at').eq('loai_viec', 'SAN_XUAT').order('created_at', { ascending: false });
```

- [ ] **Bước 4: Quản trị — ô đếm và bảng Lệnh sản xuất**

`src/pages/AdminDashboard.jsx`, thay:

```js
        supabase.from('production_orders').select('*', { count: 'exact', head: true }),
```

bằng:

```js
        supabase.from('production_orders').select('*', { count: 'exact', head: true }).eq('loai_viec', 'SAN_XUAT'),
```

và thay:

```js
        supabase.from('production_orders').select('*, production_logs(actual_quantity)').order('created_at', { ascending: false }).limit(50),
```

bằng:

```js
        supabase.from('production_orders').select('*, production_logs(actual_quantity)').eq('loai_viec', 'SAN_XUAT').order('created_at', { ascending: false }).limit(50),
```

- [ ] **Bước 5: Chạy test + lint**

```bash
npx vitest run
```

Kỳ vọng: PASS toàn bộ.

```bash
npx eslint src/pages/tasks/TaskApp.jsx src/pages/kho/ProductionOrderTab.jsx src/pages/kho/ImportStockTab.jsx src/pages/AdminDashboard.jsx
```

Kỳ vọng: không có lỗi mới so với trước khi sửa (bốn file này có sẵn cảnh báo cũ; so sánh số dòng in ra trước/sau).

- [ ] **Bước 6: Commit**

```bash
git add src/pages/tasks/TaskApp.jsx src/pages/kho/ProductionOrderTab.jsx src/pages/kho/ImportStockTab.jsx src/pages/AdminDashboard.jsx
git commit -m "feat(sx): an phieu cong viec ho tro khoi Kho, Giao viec, Quan tri"
```

---

### Task 7: Hiện ghi chú ở Lịch sử sản xuất và Báo cáo công việc

**Files:**
- Modify: `src/pages/AdminDashboard.jsx` (truy vấn dòng 114 + bảng Lịch sử sản xuất)
- Modify: `src/pages/tasks/WorkReport.jsx` (truy vấn dòng 75 + bảng hiển thị)

Đây là phần giữ cho KPI tra được căn cứ: việc hỗ trợ có tính điểm thì phải xem được ai ghi gì.

- [ ] **Bước 1: Lấy thêm cột ở Quản trị**

`src/pages/AdminDashboard.jsx`, thay:

```js
        fetchAllRows(() => supabase.from('production_logs').select(`
          id, actual_quantity, performance_rate, execution_date, start_time, end_time, worker_id,
          production_orders ( order_code, product_code )
        `).order('created_at', { ascending: false })),
```

bằng:

```js
        fetchAllRows(() => supabase.from('production_logs').select(`
          id, actual_quantity, performance_rate, execution_date, start_time, end_time, worker_id, ghi_chu,
          production_orders ( order_code, product_code, loai_viec )
        `).order('created_at', { ascending: false })),
```

- [ ] **Bước 2: Thêm cột Ghi chú vào bảng Lịch sử sản xuất**

Trong bảng Lịch sử sản xuất của `AdminDashboard.jsx`, thêm một ô tiêu đề `<th>Ghi chú</th>` vào cuối hàng tiêu đề, và ô dữ liệu tương ứng vào cuối mỗi hàng:

```jsx
                  <td style={{ maxWidth: 220, fontSize: '0.8rem', color: '#64748b' }}>
                    {log.production_orders?.loai_viec === 'HO_TRO' && (
                      <span style={{
                        display: 'inline-block', marginRight: 6, padding: '1px 6px',
                        borderRadius: 999, background: '#f1f5f9', color: '#475569',
                        fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
                      }}>Việc hỗ trợ</span>
                    )}
                    {log.ghi_chu || ''}
                  </td>
```

- [ ] **Bước 3: Lấy thêm cột ở Báo cáo công việc**

`src/pages/tasks/WorkReport.jsx`, thay:

```js
      let pQuery = supabase.from('production_logs').select(`
        id, actual_quantity, worker_id, execution_date, performance_rate,
        production_orders ( product_code )
      `);
```

bằng:

```js
      let pQuery = supabase.from('production_logs').select(`
        id, actual_quantity, worker_id, execution_date, performance_rate, ghi_chu,
        production_orders ( product_code, loai_viec )
      `);
```

- [ ] **Bước 4: Chạy test + lint**

```bash
npx vitest run
```

Kỳ vọng: PASS toàn bộ.

```bash
npx eslint src/pages/AdminDashboard.jsx src/pages/tasks/WorkReport.jsx
```

Kỳ vọng: không có lỗi mới so với trước khi sửa.

- [ ] **Bước 5: Commit**

```bash
git add src/pages/AdminDashboard.jsx src/pages/tasks/WorkReport.jsx
git commit -m "feat(sx): hien ghi chu va nhan viec ho tro o Lich su SX va Bao cao"
```

---

### Task 8: Đo giao diện thật và chạy thử luồng

**Files:** không sửa file nào — đây là bước kiểm chứng.

- [ ] **Bước 1: Mở preview và đăng nhập bằng tài khoản thợ**

Dùng `preview_start` với cấu hình `qlsx-dev`, đăng nhập, vào `/worker`.

Màn hình `/worker` nằm sau `ProtectedRoute` nên **phải đăng nhập thật mới đo được**. Nếu không có tài khoản thợ để dùng, **dừng lại và hỏi người dùng** — đừng đo bằng trang giả rồi báo là đã kiểm chứng.

- [ ] **Bước 2: Đo ở 3 khổ màn hình**

Với mỗi khổ 320 / 375 / 430px, dùng `resize_window` rồi chạy:

```js
(async () => { await document.fonts.ready;
  const de = document.documentElement;
  // `data-viec` chỉ có trên thẻ việc hỗ trợ — KHÔNG dùng `button[title]` vì 3 nút lọc
  // phía trên cũng có thuộc tính `title`, sẽ bắt nhầm.
  const the = [...document.querySelectorAll('button[data-viec]')];
  return {
    viewport: innerWidth,
    TRAN_NGANG: de.scrollWidth > de.clientWidth,
    soThe: the.length,
    soDongChu: the.map(x => { const s = x.firstElementChild; const r = document.createRange(); r.selectNodeContents(s); return r.getClientRects().length; }),
    biCat: the.map(x => { const s = x.firstElementChild; return s.scrollWidth > s.clientWidth + 0.5; }),
  };
})()
```

Kỳ vọng ở cả 3 khổ: `TRAN_NGANG` = `false`, `soThe` = 5, mọi phần tử `soDongChu` = 1, mọi phần tử `biCat` = `false`.

Nếu có chỗ bị cắt: **rút gọn nhãn trong `DANH_MUC_HO_TRO`**, không hạ cỡ chữ xuống dưới `0.72rem`.

- [ ] **Bước 3: Đo tồn kho TRƯỚC khi gửi báo cáo**

Chạy `execute_sql` và **ghi lại 3 con số**:

```sql
select
 (select count(*) from inventory_stock) as ton_kho,
 (select count(*) from inventory_picking_logs) as phieu_kho,
 (select count(*) from du_lieu_nhap) as du_lieu_nhap;
```

Đo trước thì mới có mốc để so; đo sau rồi mới đi tìm mốc là không chứng minh được gì.

- [ ] **Bước 4: Chạy thử một báo cáo việc hỗ trợ thật**

Bấm thẻ "Nhập hàng" → xác nhận màn báo cáo **không có** khối vị trí kho, **không có** ô số lượng, **có** ô ghi chú với gợi ý "Nhập hàng gì, của ai?". Thử bấm gửi khi ghi chú trống → phải bị chặn. Điền ghi chú, chọn người và giờ, gửi.

Sau đó bấm thẻ "Giao hàng" (mã GH) → xác nhận màn này **có** ô số lượng gõ được, **không có** khối vị trí kho, và ô ghi chú vẫn bắt buộc.

- [ ] **Bước 5: Kiểm chứng dữ liệu đã ghi và KHÔNG có gì chạm vào kho**

Chạy `execute_sql`:

```sql
select l.ghi_chu, l.performance_rate::text, l.actual_quantity::text, o.order_code
from production_logs l join production_orders o on o.id = l.order_id
where o.loai_viec = 'HO_TRO' order by l.created_at desc limit 5;
```

Kỳ vọng: có bản ghi vừa tạo; với `VIEC-NH` thì `ghi_chu` đúng nội dung đã gõ, `performance_rate` = 100, `actual_quantity` = 0; với `VIEC-GH` thì `performance_rate` tính theo định mức và `actual_quantity` > 0.

```sql
select
 (select count(*) from inventory_stock) as ton_kho,
 (select count(*) from inventory_picking_logs) as phieu_kho,
 (select count(*) from du_lieu_nhap) as du_lieu_nhap;
```

Kỳ vọng: cả ba con số **bằng đúng** con số đã ghi ở bước 3. Đây là bằng chứng việc hỗ trợ không đụng vào kho.

Nếu có người khác đang dùng app cùng lúc thì con số có thể **tăng** vì việc của họ — khi đó phải kiểm bằng cách khác: xác nhận không có dòng `inventory_picking_logs` nào mang `notes` trỏ về `VIEC-*`:

```sql
select count(*) from inventory_picking_logs where notes like '%VIEC-%';
```

Kỳ vọng: 0.

- [ ] **Bước 6: Kiểm chứng phiếu hỗ trợ đã ẩn khỏi các màn hình khác**

Mở lần lượt: Kho → Tạo phiếu SX (ô chọn phiếu gần đây), Kho → Nhập kho (ô chọn phiếu SX), Giao việc (danh sách lệnh SX đang chờ), Quản trị (bảng Lệnh sản xuất + ô đếm tổng). Xác nhận **không có** mã `VIEC-*` nào, và ô đếm vẫn là số phiếu sản xuất thật.

- [ ] **Bước 7: Chạy lại toàn bộ test**

```bash
npx vitest run
```

Kỳ vọng: PASS toàn bộ, số test ≥ 679 + số test mới của các task trên.

---

### Task 9: Kiểm tra bảo mật trước khi bàn giao

**Files:** không sửa file nào.

Bắt buộc theo quy tắc của dự án: mọi thay đổi chạm Supabase đều phải qua bước này.

- [ ] **Bước 1: Gọi skill kiểm tra bảo mật**

Gọi `Skill` với `kiem-tra-bao-mat-du-lieu` và làm đủ phần kiểm chứng trong đó.

- [ ] **Bước 2: Đo bằng chính khoá công khai**

Khoá công khai nằm sẵn trong `src/lib/supabase.js`. Với mỗi phép thử dưới đây, chạy và ghi lại mã HTTP + nội dung trả về:

```bash
K=sb_publishable_I_2VImB-EKu5Vork7t--QQ_4Qi8nXwX
U=https://ngwkzicrnspeggunsblr.supabase.co/rest/v1
echo "== doc phieu ho tro"
curl -s -w "\nHTTP %{http_code}\n" "$U/production_orders?select=order_code,loai_viec&loai_viec=eq.HO_TRO" -H "apikey: $K" -H "Authorization: Bearer $K"
echo "== doc ghi chu"
curl -s -w "\nHTTP %{http_code}\n" "$U/production_logs?select=ghi_chu&ghi_chu=not.is.null&limit=5" -H "apikey: $K" -H "Authorization: Bearer $K"
echo "== thu ghi ban ghi moi"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$U/production_logs" -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"order_id":null,"actual_quantity":1,"actual_time_spent":1,"performance_rate":100,"ghi_chu":"anon probe"}'
```

Kỳ vọng: hai phép đọc trả `[]`; phép ghi bị chặn bởi RLS (`401` kèm thông báo vi phạm row-level security). Nếu **bất kỳ** phép nào trả về dữ liệu thật, hoặc phép ghi thành công, thì **dừng, không bàn giao**, báo ngay cho người dùng.

Lưu ý khi đọc kết quả: `HTTP 200` kèm thân `[]` nghĩa là RLS đã chặn hết dòng — đó là **đạt**. Còn `HTTP 200` kèm dữ liệu thật mới là hỏng. Riêng với `DELETE`, mã `204` **không** chứng minh được gì (PostgREST trả `204` cả khi không dòng nào khớp), nên đừng dùng `DELETE` làm phép đo.

- [ ] **Bước 3: Báo lại hiện trạng quyền giữa các nhân viên**

Chạy `execute_sql`:

```sql
select tablename, policyname, cmd, roles::text, qual
from pg_policies where schemaname='public'
  and tablename in ('production_orders','production_logs');
```

Báo lại nguyên văn cho người dùng: policy `chi_nguoi_dang_nhap` cấp `ALL` cho `authenticated` với điều kiện `true` ⇒ **mọi nhân viên đăng nhập được đều đọc, sửa, xoá được ghi chú của người khác**. Đây là hiện trạng sẵn có, **không tự sửa** — siết lại sẽ đụng quyền của các màn hình khác, để người dùng quyết.

- [ ] **Bước 4: Báo cáo kết quả**

Trình bày: các con số đo được ở Task 8 bước 5 (kho không đổi), mã HTTP của từng phép thử ở bước 2, và phần chưa kiểm chứng được (nếu có) kèm lý do.

---

## Tự rà kế hoạch

**Bám spec:** Mục 1 Dữ liệu → Task 1. Mục 2 Màn hình thợ → Task 3, 4, 4b. Mục 3 Màn báo cáo → Task 2, 5. Mục 4 Ảnh hưởng → Task 6 (5 chỗ sửa), Task 7 (3 chỗ giữ + thêm hiển thị); 4 chỗ cố ý không sửa được nêu ở đầu Task 6. Mục 5 Hệ quả KPI → không cần code, đã báo trước. Mục Kiểm thử → Task 2, 3, 4, 4b (test đơn vị), Task 8 (đo giao diện + chạy thật). Mục Bảo mật → Task 9. Mục Đường lùi → nêu trong spec.

**Tên hàm nhất quán:** `laViecHoTro`, `hieuSuatCoDinh`, `thongTinViec`, `tinhHieuSuat`, `ghiChuHopLe` (Task 2) — dùng lại đúng tên ở Task 3 (`laViecHoTro`), Task 4 (`thongTinViec`), Task 5 (cả 5 hàm). `locViecHoTro` định nghĩa ở Task 3, dùng ở Task 4b. `DANH_MUC_HO_TRO` định nghĩa ở Task 2, dùng ở Task 3, 4 và test. Component `KhuViecHoTro` nhận props `danhSach` + `onChon` (Task 4), truyền đúng hai props đó ở Task 4b. Thuộc tính `data-viec` đặt ở Task 4, dùng làm selector đo ở Task 8 bước 2.

**Bốn lỗi đã sửa khi tự rà:** (1) test khu "Công việc khác" ban đầu đặt ở `WorkerDashboard` — không thể qua vì render tĩnh cho danh sách rỗng, đã tách thành component nhận props; (2) selector đo dùng `button[title]` sẽ bắt nhầm 3 nút lọc, đổi sang `button[data-viec]`; (3) Task 8 thiếu bước đo tồn kho *trước* khi gửi báo cáo nên không có mốc so sánh; (4) `curl -w "%{code}"` sai tên biến, phải là `%{http_code}`.
