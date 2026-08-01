# Chấm công — thống kê theo nhóm & bảng phân nhóm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm bộ lọc theo nhóm, khối thống kê 5 chỉ số (tổng nghỉ / nghỉ phép / nghỉ quá quy định / phút đi muộn / phút về sớm) và màn hình phân nhóm cho tab Chấm công.

**Architecture:** Toàn bộ phép tính nằm trong một module hàm thuần mới `src/lib/chamCongThongKe.js` có test vitest; `ChamCongTab.jsx` chỉ tải dữ liệu và vẽ. Nhóm KHÔNG lưu ở bảng mới — đọc thẳng cột `lien_ket_bo_phan` của các dòng `kpi_chi_tieu` có `ma='CHUYEN_CAN_BO_PHAN'`, nên sửa nhóm là điểm KPI chuyên cần bộ phận tự tính lại (chủ ý, xem spec mục E).

**Tech Stack:** React 19 (không TypeScript, style inline theo đúng nếp tệp hiện có), Supabase JS v2, vitest.

**Spec:** [docs/superpowers/specs/2026-08-01-cham-cong-thong-ke-theo-nhom-design.md](../specs/2026-08-01-cham-cong-thong-ke-theo-nhom-design.md)

---

## Bối cảnh bắt buộc đọc trước khi code

Người thực hiện có thể chưa từng mở dự án này. Bốn điều dưới đây sai là hỏng việc:

1. **Không được sửa logic trong `src/lib/kpiTuDong.js`.** Task 1 chỉ thêm đúng từ khoá
   `export` vào một hằng. Tệp đó quyết định điểm KPI gắn với lương thưởng, có 60+ test.
2. **Không tạo bảng DB, không viết tệp SQL nào.** Nhóm đã tồn tại trong `kpi_chi_tieu`.
3. **Mọi lệnh ghi `kpi_chi_tieu` phải có `.select()` và đi qua `loiGhiKpi`** từ
   `src/lib/kpiWriteGuard.js`. PostgREST trả HTTP 204 `error === null` khi RLS lọc sạch dòng —
   thiếu bước này thì người không phải ADMIN bấm lưu sẽ thấy êm ru mà thật ra không ghi được.
4. **Chạy test bằng `npm test`** (= `vitest run`). Test đặt cạnh tệp nguồn, đuôi `.test.js`,
   mô tả bằng tiếng Việt — xem `src/lib/stagingMove.test.js` làm mẫu.

Dữ liệu thật kỳ `2026-07` dùng để đối chiếu bằng mắt sau khi làm xong:

| Nhóm | Người | Tổng nghỉ | Nghỉ phép | Quá quy định | Muộn (phút) |
|---|---|---|---|---|---|
| SẢN XUẤT (`CHUYEN_CAN_SX`) | 7 | 12 | 6 | 6 | 354 |
| BẢO HÀNH (`CHUYEN_CAN_BH`) | 2 | 4 | 2 | 2 | 220 |
| CSKH (`CHUYEN_CAN_CSKH`) | 3 | 2 | 2 | 0 | 14 |
| TOÀN CÔNG TY (`CHUYEN_CAN_TOAN_CTY`) | 1 | 1 | 1 | 0 | 32 |
| **TỔNG** | **13** | **19** | **11** | **8** | **620** |

---

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `src/lib/chamCongThongKe.js` | **mới** — toàn bộ phép tính, hàm thuần, không import React/Supabase |
| `src/lib/chamCongThongKe.test.js` | **mới** — test vitest cho module trên |
| `src/pages/tasks/ChamCongTab.jsx` | sửa — tải nhóm, ô lọc, khối thống kê, màn phân nhóm |
| `src/lib/kpiTuDong.js` | sửa — **chỉ** thêm `export` cho `NGAY_PHEP_THANG` (1 từ khoá) |

---

## Task 1: Mở `NGAY_PHEP_THANG` cho module khác dùng

**Files:**
- Modify: `src/lib/kpiTuDong.js:255`

Hằng số ngày phép đang là biến nội bộ. Module thống kê phải dùng CHUNG hằng này chứ không
chép số `1` sang tệp mới — hôm nào chủ app đổi số ngày phép mà hai chỗ lệch nhau thì bảng
thống kê nói một đằng, điểm KPI trừ một nẻo, và không ai biết chỗ nào đúng.

- [ ] **Step 1: Thêm từ khoá `export`**

Tìm dòng 255 trong `src/lib/kpiTuDong.js`:

```js
const NGAY_PHEP_THANG = 1;
```

Đổi thành:

```js
export const NGAY_PHEP_THANG = 1;
```

**Không** đổi giá trị, **không** đụng khối chú thích 6 dòng ngay phía trên, **không** sửa gì
khác trong tệp.

- [ ] **Step 2: Chạy toàn bộ test cũ để chắc không vỡ gì**

Chạy: `npm test`
Kỳ vọng: tất cả test PASS như trước (kpiTuDong.test.js có 60+ ca).

- [ ] **Step 3: Commit**

```bash
git add src/lib/kpiTuDong.js
git commit -m "refactor(kpi): export NGAY_PHEP_THANG de module thong ke dung chung"
```

---

## Task 2: `nhanNhomGon` + `docNhomTuKpi` — đọc nhóm từ dòng KPI

**Files:**
- Create: `src/lib/chamCongThongKe.js`
- Test: `src/lib/chamCongThongKe.test.js`

Hình dạng dữ liệu vào (đã kiểm chứng trên DB thật):

```js
// dòng CA_NHAN — chở khoá nhóm của MỘT người
{ id, ky: '2026-07', ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
  nhan_vien_id: 'dvx', lien_ket_bo_phan: 'CHUYEN_CAN_SX', ten: 'CHUYÊN CẦN BỘ PHẬN' }

// dòng BO_PHAN — chở NHÃN hiển thị của nhóm
{ id, ky: '2026-07', ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
  nhan_vien_id: null, lien_ket_bo_phan: 'CHUYEN_CAN_SX',
  ten: 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT' }
```

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/chamCongThongKe.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { nhanNhomGon, docNhomTuKpi } from './chamCongThongKe';

describe('nhanNhomGon', () => {
  it('cắt phần trước dấu — để lấy tên nhóm ngắn', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT')).toBe('SẢN XUẤT');
    expect(nhanNhomGon('CHUYÊN CẦN — TOÀN CÔNG TY')).toBe('TOÀN CÔNG TY');
  });

  it('không có dấu — thì giữ nguyên cả chuỗi (kỳ 2026-06 chỉ có một nhóm chung)', () => {
    expect(nhanNhomGon('CHUYÊN CẦN BỘ PHẬN')).toBe('CHUYÊN CẦN BỘ PHẬN');
  });

  it('rỗng / null → chuỗi rỗng, không ném lỗi', () => {
    expect(nhanNhomGon('')).toBe('');
    expect(nhanNhomGon(null)).toBe('');
    expect(nhanNhomGon(undefined)).toBe('');
  });
});

describe('docNhomTuKpi', () => {
  const caNhan = (nv, khoa) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
    nhan_vien_id: nv, lien_ket_bo_phan: khoa, ten: 'CHUYÊN CẦN BỘ PHẬN',
  });
  const boPhan = (khoa, ten) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
    nhan_vien_id: null, lien_ket_bo_phan: khoa, ten,
  });

  it('gom được người → khoá nhóm, và khoá nhóm → nhãn', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([
      boPhan('CHUYEN_CAN_SX', 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
      caNhan('dvx', 'CHUYEN_CAN_SX'),
      caNhan('vta', 'CHUYEN_CAN_SX'),
      boPhan('CHUYEN_CAN_CSKH', 'CHUYÊN CẦN BỘ PHẬN — CSKH'),
      caNhan('hhx', 'CHUYEN_CAN_CSKH'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('vta')).toBe('CHUYEN_CAN_SX');
    expect(theoNguoi.get('hhx')).toBe('CHUYEN_CAN_CSKH');
    expect(nhan.get('CHUYEN_CAN_SX')).toBe('SẢN XUẤT');
    expect(nhan.get('CHUYEN_CAN_CSKH')).toBe('CSKH');
  });

  it('bỏ qua dòng chỉ tiêu KHÁC — không phải chỉ tiêu nào cũng là nhóm chuyên cần', () => {
    const { theoNguoi } = docNhomTuKpi([
      { ma: 'HT_CONG_VIEC_DUNG_HAN', cap_do: 'CA_NHAN', nhan_vien_id: 'dvx', lien_ket_bo_phan: 'RAC' },
      caNhan('dvx', 'CHUYEN_CAN_SX'),
    ]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
  });

  it('nhóm có người nhưng THIẾU dòng BO_PHAN → nhãn lấy chính khoá, không mất người', () => {
    const { theoNguoi, nhan } = docNhomTuKpi([caNhan('dvx', 'CHUYEN_CAN_SX')]);
    expect(theoNguoi.get('dvx')).toBe('CHUYEN_CAN_SX');
    expect(nhan.get('CHUYEN_CAN_SX')).toBeUndefined();
  });

  it('mảng rỗng / undefined → hai Map rỗng, không ném lỗi', () => {
    expect(docNhomTuKpi([]).theoNguoi.size).toBe(0);
    expect(docNhomTuKpi().nhan.size).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để chắc nó ĐỎ**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: FAIL — `Failed to resolve import "./chamCongThongKe"`.

- [ ] **Step 3: Viết code tối thiểu cho xanh**

Tạo `src/lib/chamCongThongKe.js`:

```js
// ─────────────────────────────────────────────────────────────────────────────
// Thống kê chấm công theo nhóm — hàm thuần, không chạm Supabase, không chạm React.
//
// Nhóm KHÔNG có bảng riêng: nó là cột `lien_ket_bo_phan` của dòng chỉ tiêu
// `ma = 'CHUYEN_CAN_BO_PHAN'` trong kpi_chi_tieu, tức CÙNG một nguồn với điểm KPI chuyên cần
// bộ phận. Cố ý vậy: chủ app muốn đổi nhóm là điểm KPI đổi theo, không có hai nơi lệch nhau.
// ─────────────────────────────────────────────────────────────────────────────

import { NGAY_PHEP_THANG } from './kpiTuDong';

// `ma` của dòng chỉ tiêu mang khoá nhóm. Dòng chỉ tiêu khác cũng có cột lien_ket_bo_phan
// nhưng nghĩa khác — lọc theo `ma` chứ không quét bừa.
export const MA_CHI_TIEU_NHOM = 'CHUYEN_CAN_BO_PHAN';

// Nhãn nhóm trong DB viết dài cho bảng KPI ("CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT"). Ở đây cột hẹp,
// lấy phần sau dấu — cho gọn. Không có dấu — thì giữ nguyên: kỳ 2026-06 cả công ty chung một
// nhóm tên "CHUYÊN CẦN BỘ PHẬN", cắt bừa là ra chuỗi rỗng.
export function nhanNhomGon(ten) {
  if (!ten) return '';
  const i = String(ten).lastIndexOf('—');
  const gon = i >= 0 ? String(ten).slice(i + 1) : String(ten);
  return gon.trim();
}

// kpiRows → { theoNguoi: Map(nhan_vien_id → khoáNhóm), nhan: Map(khoáNhóm → nhãn) }
export function docNhomTuKpi(kpiRows = []) {
  const theoNguoi = new Map();
  const nhan = new Map();
  for (const r of kpiRows || []) {
    if (r?.ma !== MA_CHI_TIEU_NHOM || !r.lien_ket_bo_phan) continue;
    if (r.cap_do === 'CA_NHAN' && r.nhan_vien_id) {
      theoNguoi.set(r.nhan_vien_id, r.lien_ket_bo_phan);
    } else if (r.cap_do === 'BO_PHAN') {
      const n = nhanNhomGon(r.ten);
      if (n) nhan.set(r.lien_ket_bo_phan, n);
    }
  }
  return { theoNguoi, nhan };
}
```

- [ ] **Step 4: Chạy test để chắc nó XANH**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: PASS, 8 ca.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chamCongThongKe.js src/lib/chamCongThongKe.test.js
git commit -m "feat(cham-cong): doc nhom chuyen can tu dong chi tieu KPI"
```

---

## Task 3: `thongKeMotNguoi` — 5 chỉ số của một người

**Files:**
- Modify: `src/lib/chamCongThongKe.js`
- Test: `src/lib/chamCongThongKe.test.js`

Công thức chốt (spec mục B2):

```
nghiCoDau      = số dòng nghi === true VÀ ngày đó được miễn ("Đặc biệt")
nghiChuaDau    = số dòng nghi === true VÀ ngày đó KHÔNG được miễn
tongNghi       = nghiCoDau + nghiChuaDau
nghiPhep       = nghiCoDau + min(nghiChuaDau, NGAY_PHEP_THANG)
nghiQuaQuyDinh = max(0, nghiChuaDau − NGAY_PHEP_THANG)
phutMuon       = tổng di_muon_phut của các dòng KHÔNG được miễn
phutVeSom      = tổng ve_som_phut  của các dòng KHÔNG được miễn
```

**Không tự xử lý cờ `nghi_van`.** Script nạp `scripts/import-cham-cong.mjs` đã đặt
`ve_som_phut = 0` cho các dòng đáng ngờ ngay lúc ghi vào DB. Trừ thêm lần nữa ở đây là trừ hai lần.

- [ ] **Step 1: Viết test thất bại**

Trước hết sửa dòng `import` sẵn có ở ĐẦU `src/lib/chamCongThongKe.test.js` thành:

```js
import { nhanNhomGon, docNhomTuKpi, thongKeMotNguoi } from './chamCongThongKe';
```

(Thêm tên vào dòng cũ, **không** viết thêm một dòng `import` thứ hai cùng module — eslint của
dự án báo lỗi import trùng.)

Rồi thêm vào cuối tệp:

```js
describe('thongKeMotNguoi', () => {
  const d = (ngay, o = {}) => ({
    nhan_vien_id: 'a', ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o,
  });
  const khongMien = () => false;

  it('nghỉ 4 ngày không ngày nào có dấu → 1 phép, 3 quá quy định (ca của Tuấn kỳ 7)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { nghi: true }), d('2026-07-02', { nghi: true }),
      d('2026-07-03', { nghi: true }), d('2026-07-06', { nghi: true }),
    ], khongMien);
    expect(tk.tongNghi).toBe(4);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(3);
  });

  it('nghỉ 2 ngày, 1 ngày có dấu Đặc biệt → 2 phép, 0 quá quy định (ca của Xuyên kỳ 7)', () => {
    const tk = thongKeMotNguoi(
      [d('2026-07-18', { nghi: true }), d('2026-07-21', { nghi: true })],
      ngay => ngay === '2026-07-18');
    expect(tk.tongNghi).toBe(2);
    expect(tk.nghiPhep).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.soNgayMien).toBe(1);
  });

  it('nghỉ đúng 1 ngày → vừa hết hạn mức, không quá quy định', () => {
    const tk = thongKeMotNguoi([d('2026-07-06', { nghi: true })], khongMien);
    expect(tk.nghiPhep).toBe(1);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('không nghỉ ngày nào → tất cả bằng 0', () => {
    const tk = thongKeMotNguoi([d('2026-07-01'), d('2026-07-02')], khongMien);
    expect(tk.tongNghi).toBe(0);
    expect(tk.nghiPhep).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(0);
  });

  it('cộng phút đi muộn và về sớm', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-01', { di_muon_phut: 20 }),
      d('2026-07-02', { di_muon_phut: 6, ve_som_phut: 15 }),
    ], khongMien);
    expect(tk.phutMuon).toBe(26);
    expect(tk.phutVeSom).toBe(15);
  });

  it('ngày có dấu Đặc biệt KHÔNG tính phút muộn (giống hệt cách KPI bỏ ngày miễn)', () => {
    const tk = thongKeMotNguoi([
      d('2026-07-20', { di_muon_phut: 1 }),
      d('2026-07-21', { di_muon_phut: 11 }),
    ], ngay => ngay === '2026-07-20');
    expect(tk.phutMuon).toBe(11);
    expect(tk.soNgayMien).toBe(1);
  });

  it('cột số là null/chuỗi từ DB vẫn cộng ra số, không ra NaN', () => {
    const tk = thongKeMotNguoi([
      { ngay: '2026-07-01', di_muon_phut: null, ve_som_phut: undefined, nghi: false },
      { ngay: '2026-07-02', di_muon_phut: '5', ve_som_phut: '3', nghi: false },
    ], khongMien);
    expect(tk.phutMuon).toBe(5);
    expect(tk.phutVeSom).toBe(3);
  });

  it('không có dòng nào → tất cả 0, không ném lỗi', () => {
    const tk = thongKeMotNguoi([], khongMien);
    expect(tk).toEqual({
      tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0,
      phutMuon: 0, phutVeSom: 0, soNgayMien: 0,
    });
  });
});
```

- [ ] **Step 2: Chạy test để chắc nó ĐỎ**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: FAIL — `thongKeMotNguoi is not a function`.

- [ ] **Step 3: Viết code tối thiểu cho xanh**

Thêm vào cuối `src/lib/chamCongThongKe.js`:

```js
const so = v => Number(v) || 0;

// 5 chỉ số của MỘT người trong kỳ. `laMien(ngay)` trả true khi ngày đó đã được admin đánh dấu
// "Đặc biệt" (bảng chuyen_can_ngoai_le).
//
// Quy ước nghỉ phép do chủ app chốt 01/08/2026: ngày nghỉ có giải trình KHÔNG tiêu hạn mức,
// hạn mức NGAY_PHEP_THANG chỉ áp lên các ngày nghỉ chưa có giải trình. Nhờ vậy
// `nghiQuaQuyDinh` bằng ĐÚNG `vuotPhep` mà luatChuyenCanCaNhan dùng để trừ điểm — Task 5 khoá
// điều này bằng test, đừng đổi công thức mà không sửa test đó.
export function thongKeMotNguoi(rows = [], laMien = () => false) {
  let nghiCoDau = 0, nghiChuaDau = 0, phutMuon = 0, phutVeSom = 0, soNgayMien = 0;
  for (const r of rows || []) {
    const mien = !!laMien(r.ngay);
    if (mien) soNgayMien += 1;
    if (r.nghi) {
      if (mien) nghiCoDau += 1;
      else nghiChuaDau += 1;
    }
    if (!mien) {
      phutMuon += so(r.di_muon_phut);
      phutVeSom += so(r.ve_som_phut);
    }
  }
  return {
    tongNghi: nghiCoDau + nghiChuaDau,
    nghiPhep: nghiCoDau + Math.min(nghiChuaDau, NGAY_PHEP_THANG),
    nghiQuaQuyDinh: Math.max(0, nghiChuaDau - NGAY_PHEP_THANG),
    phutMuon, phutVeSom, soNgayMien,
  };
}
```

- [ ] **Step 4: Chạy test để chắc nó XANH**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: PASS, 16 ca.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chamCongThongKe.js src/lib/chamCongThongKe.test.js
git commit -m "feat(cham-cong): tinh 5 chi so chuyen can cho tung nguoi"
```

---

## Task 4: Test khoá — số của bảng phải khớp số KPI dùng để trừ điểm

**Files:**
- Test: `src/lib/chamCongThongKe.test.js`

Đây là test quan trọng nhất của cả tính năng. Nếu ai đó sau này sửa công thức nghỉ phép ở một
trong hai nơi, test này đỏ ngay — thay vì để nhân viên phát hiện bằng cách thắc mắc vì sao
bảng ghi "quá 2 ngày" mà KPI trừ như "quá 3 ngày".

**Cách khoá:** `luatChuyenCanCaNhan` trừ `vuotPhep × 3` điểm cho phần nghỉ. Cho đầu vào không
có ai đi muộn (`di_muon_phut: 0`) thì `diem_chot = chi_tieu − vuotPhep × 3`, suy ngược ra
`vuotPhep = (10 − diem_chot) / 3`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/chamCongThongKe.test.js`:

```js
import { apDungChamTuDong } from './kpiTuDong';

describe('khoá với KPI — nghiQuaQuyDinh phải bằng vuotPhep mà kpiTuDong dùng để trừ điểm', () => {
  const d = ngay => ({
    nhan_vien_id: 'a', ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: true,
  });
  const chiTieu = { id: 'ct', cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHUYEN_CAN_CA_NHAN', chi_tieu: 10 };

  // vuotPhep KPI đang dùng, suy ngược từ điểm: truNghi = vuotPhep × 3, không có phút muộn nào.
  const vuotPhepTheoKpi = (chamCong, ngoaiLe) => {
    const kq = apDungChamTuDong([chiTieu], [], [], '2026-07', '2026-07-31', [], chamCong, ngoaiLe);
    return (10 - kq.rows[0].diem_chot) / 3;
  };

  it('4 ngày nghỉ, không ngày nào có dấu', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03'), d('2026-07-06')];
    const tk = thongKeMotNguoi(cc, () => false);
    expect(tk.nghiQuaQuyDinh).toBe(3);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, []));
  });

  it('4 ngày nghỉ, 1 ngày có dấu Đặc biệt', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03'), d('2026-07-06')];
    const ngoaiLe = [{ nhan_vien_id: 'a', ngay: '2026-07-02', ly_do: 'ốm' }];
    const tk = thongKeMotNguoi(cc, ngay => ngay === '2026-07-02');
    expect(tk.nghiQuaQuyDinh).toBe(2);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, ngoaiLe));
  });

  it('1 ngày nghỉ trong hạn mức — cả hai đều ra 0', () => {
    const cc = [d('2026-07-06')];
    const tk = thongKeMotNguoi(cc, () => false);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, []));
  });

  it('mọi ngày nghỉ đều có dấu — cả hai đều ra 0', () => {
    const cc = [d('2026-07-01'), d('2026-07-02'), d('2026-07-03')];
    const ngoaiLe = cc.map(c => ({ nhan_vien_id: 'a', ngay: c.ngay, ly_do: 'ốm' }));
    const tk = thongKeMotNguoi(cc, () => true);
    expect(tk.nghiQuaQuyDinh).toBe(0);
    expect(tk.nghiQuaQuyDinh).toBe(vuotPhepTheoKpi(cc, ngoaiLe));
  });
});
```

- [ ] **Step 2: Chạy test**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: PASS cả 4 ca ngay lần đầu — code Task 3 đã đúng.

Nếu ĐỎ: **không được sửa `kpiTuDong.js` cho vừa**. Sửa công thức trong `thongKeMotNguoi`
cho khớp `kpiTuDong.js`, vì `kpiTuDong.js` là bên đang thật sự trừ điểm lương thưởng.

- [ ] **Step 3: Commit**

```bash
git add src/lib/chamCongThongKe.test.js
git commit -m "test(cham-cong): khoa cong thuc nghi qua quy dinh vao dung luat KPI"
```

---

## Task 5: `thongKeNhom` + `gomThongKe` + `tongTatCa` — gom theo nhóm

**Files:**
- Modify: `src/lib/chamCongThongKe.js`
- Test: `src/lib/chamCongThongKe.test.js`

`gomThongKe` là hàm duy nhất giao diện gọi. Trả về mảng nhóm, mỗi nhóm có sẵn số tổng và danh
sách thành viên đã tính.

- [ ] **Step 1: Viết test thất bại**

Trước hết sửa dòng `import` sẵn có ở ĐẦU `src/lib/chamCongThongKe.test.js` thành (dòng import
`./kpiTuDong` của Task 4 giữ nguyên, không đụng):

```js
import {
  nhanNhomGon, docNhomTuKpi, thongKeMotNguoi, thongKeNhom, gomThongKe, tongTatCa,
} from './chamCongThongKe';
```

Rồi thêm vào cuối tệp:

```js
describe('gomThongKe', () => {
  const cc = (nv, ngay, o = {}) => ({
    nhan_vien_id: nv, ky: '2026-07', ngay,
    di_muon_phut: 0, ve_som_phut: 0, nghi: false, ...o,
  });
  const caNhan = (nv, khoa) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'CA_NHAN',
    nhan_vien_id: nv, lien_ket_bo_phan: khoa,
  });
  const boPhan = (khoa, ten) => ({
    ma: 'CHUYEN_CAN_BO_PHAN', cap_do: 'BO_PHAN',
    nhan_vien_id: null, lien_ket_bo_phan: khoa, ten,
  });

  const kpiRows = [
    boPhan('CHUYEN_CAN_SX', 'CHUYÊN CẦN BỘ PHẬN — SẢN XUẤT'),
    boPhan('CHUYEN_CAN_CSKH', 'CHUYÊN CẦN BỘ PHẬN — CSKH'),
    caNhan('dvx', 'CHUYEN_CAN_SX'), caNhan('vta', 'CHUYEN_CAN_SX'),
    caNhan('hhx', 'CHUYEN_CAN_CSKH'),
  ];
  const users = [
    { id: 'dvx', name: 'Xuân' }, { id: 'vta', name: 'Tuấn' }, { id: 'hhx', name: 'Xuyên' },
  ];
  const rows = [
    cc('dvx', '2026-07-01', { nghi: true }), cc('dvx', '2026-07-02', { di_muon_phut: 20 }),
    cc('vta', '2026-07-01', { nghi: true }), cc('vta', '2026-07-02', { nghi: true }),
    cc('hhx', '2026-07-01', { di_muon_phut: 5 }),
  ];

  it('gom đúng nhóm, cộng đúng số, kèm danh sách thành viên', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows, users });
    const sx = ds.find(n => n.khoa === 'CHUYEN_CAN_SX');
    expect(sx.nhan).toBe('SẢN XUẤT');
    expect(sx.soNguoi).toBe(2);
    expect(sx.tongNghi).toBe(3);          // Xuân 1 + Tuấn 2
    expect(sx.nghiPhep).toBe(2);          // mỗi người 1 ngày hạn mức
    expect(sx.nghiQuaQuyDinh).toBe(1);    // Tuấn vượt 1
    expect(sx.phutMuon).toBe(20);
    expect(sx.thanhVien.map(x => x.ten)).toEqual(['Tuấn', 'Xuân']);  // sắp theo tên
  });

  it('sắp nhóm theo số người giảm dần', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows, users });
    expect(ds.map(n => n.khoa)).toEqual(['CHUYEN_CAN_SX', 'CHUYEN_CAN_CSKH']);
  });

  it('người có chấm công mà không có dòng KPI → nhóm "Chưa phân nhóm", luôn xếp CUỐI', () => {
    const ds = gomThongKe({
      rows: [...rows, cc('moi', '2026-07-01', { nghi: true })],
      ngoaiLe: [], kpiRows, users,
    });
    const cuoi = ds[ds.length - 1];
    expect(cuoi.khoa).toBeNull();
    expect(cuoi.nhan).toBe('Chưa phân nhóm');
    expect(cuoi.soNguoi).toBe(1);
    expect(cuoi.thanhVien[0].ten).toBe('moi');   // không có trong users → lấy id
  });

  it('ngoaiLe áp đúng người đúng ngày, không lẫn sang người khác', () => {
    const ds = gomThongKe({
      rows, kpiRows, users,
      ngoaiLe: [{ nhan_vien_id: 'vta', ngay: '2026-07-01', ly_do: 'ốm' }],
    });
    const sx = ds.find(n => n.khoa === 'CHUYEN_CAN_SX');
    const tuan = sx.thanhVien.find(x => x.ten === 'Tuấn');
    const xuan = sx.thanhVien.find(x => x.ten === 'Xuân');
    expect(tuan.nghiQuaQuyDinh).toBe(0);   // 2 nghỉ, 1 có dấu → còn 1 trong hạn mức
    expect(xuan.tongNghi).toBe(1);         // ngày 01 của Xuân KHÔNG bị miễn lây
    expect(xuan.soNgayMien).toBe(0);
  });

  it('kpiRows rỗng (không đọc được KPI) → tất cả dồn vào một nhóm "Chưa phân nhóm"', () => {
    const ds = gomThongKe({ rows, ngoaiLe: [], kpiRows: [], users });
    expect(ds).toHaveLength(1);
    expect(ds[0].khoa).toBeNull();
    expect(ds[0].soNguoi).toBe(3);
  });

  it('không có dòng chấm công nào → mảng rỗng', () => {
    expect(gomThongKe({ rows: [], ngoaiLe: [], kpiRows, users })).toEqual([]);
  });
});

describe('tongTatCa', () => {
  it('cộng mọi thành viên của mọi nhóm, đếm đúng số người', () => {
    const ds = [
      { soNguoi: 2, thanhVien: [
        { tongNghi: 1, nghiPhep: 1, nghiQuaQuyDinh: 0, phutMuon: 20, phutVeSom: 0, soNgayMien: 0 },
        { tongNghi: 2, nghiPhep: 1, nghiQuaQuyDinh: 1, phutMuon: 0, phutVeSom: 5, soNgayMien: 0 },
      ] },
      { soNguoi: 1, thanhVien: [
        { tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0, phutMuon: 3, phutVeSom: 0, soNgayMien: 1 },
      ] },
    ];
    expect(tongTatCa(ds)).toEqual({
      soNguoi: 3, tongNghi: 3, nghiPhep: 2, nghiQuaQuyDinh: 1,
      phutMuon: 23, phutVeSom: 5, soNgayMien: 1,
    });
  });

  it('mảng rỗng → tất cả 0', () => {
    expect(tongTatCa([]).soNguoi).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để chắc nó ĐỎ**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: FAIL — `gomThongKe is not a function`.

- [ ] **Step 3: Viết code tối thiểu cho xanh**

Thêm vào cuối `src/lib/chamCongThongKe.js`:

```js
const CHUA_PHAN_NHOM = 'Chưa phân nhóm';

// Cộng 5 chỉ số của một danh sách người đã tính. KHÔNG tính trung bình ở đây — trung bình đầu
// người là chuyện của điểm KPI bộ phận, bảng này chỉ trình bày con số cộng dồn.
export function thongKeNhom(dsCaNhan = []) {
  const t = {
    soNguoi: (dsCaNhan || []).length,
    tongNghi: 0, nghiPhep: 0, nghiQuaQuyDinh: 0, phutMuon: 0, phutVeSom: 0, soNgayMien: 0,
  };
  for (const x of dsCaNhan || []) {
    t.tongNghi += so(x.tongNghi);
    t.nghiPhep += so(x.nghiPhep);
    t.nghiQuaQuyDinh += so(x.nghiQuaQuyDinh);
    t.phutMuon += so(x.phutMuon);
    t.phutVeSom += so(x.phutVeSom);
    t.soNgayMien += so(x.soNgayMien);
  }
  return t;
}

// Hàm DUY NHẤT giao diện gọi. Trả mảng nhóm, mỗi nhóm đã có sẵn số tổng + thành viên đã tính.
export function gomThongKe({ rows = [], ngoaiLe = [], kpiRows = [], users = [] } = {}) {
  const { theoNguoi, nhan } = docNhomTuKpi(kpiRows);
  const mienSet = new Set((ngoaiLe || []).map(x => `${x.nhan_vien_id}|${x.ngay}`));

  // Người có trong cham_cong mà KHÔNG có trong users vẫn phải hiện — lấy id làm tên. Lặng lẽ
  // bỏ dòng là giấu mất một người khỏi bảng thống kê chuyên cần.
  const tenCua = id => (users || []).find(u => u.id === id)?.name || id;

  const dongTheoNguoi = new Map();
  for (const r of rows || []) {
    const a = dongTheoNguoi.get(r.nhan_vien_id) || [];
    a.push(r);
    dongTheoNguoi.set(r.nhan_vien_id, a);
  }

  const theoNhom = new Map();     // khoá (string | null) → thành viên đã tính
  for (const [id, ds] of dongTheoNguoi) {
    const khoa = theoNguoi.get(id) ?? null;
    const tk = thongKeMotNguoi(ds, ngay => mienSet.has(`${id}|${ngay}`));
    const a = theoNhom.get(khoa) || [];
    a.push({ id, ten: tenCua(id), ...tk });
    theoNhom.set(khoa, a);
  }

  const ds = [];
  for (const [khoa, thanhVien] of theoNhom) {
    thanhVien.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    ds.push({
      khoa,
      nhan: khoa == null ? CHUA_PHAN_NHOM : (nhan.get(khoa) || khoa),
      ...thongKeNhom(thanhVien),
      thanhVien,
    });
  }

  ds.sort((a, b) => {
    if ((a.khoa == null) !== (b.khoa == null)) return a.khoa == null ? 1 : -1;  // chưa nhóm xuống cuối
    if (b.soNguoi !== a.soNguoi) return b.soNguoi - a.soNguoi;
    return a.nhan.localeCompare(b.nhan, 'vi');
  });
  return ds;
}

// Dòng TỔNG của bảng thống kê. Cộng lại từ thành viên chứ không cộng số nhóm — hai đường phải
// ra cùng kết quả, và cộng từ gốc thì không sai khi sau này thêm cột.
export function tongTatCa(dsNhom = []) {
  return thongKeNhom((dsNhom || []).flatMap(n => n.thanhVien || []));
}
```

- [ ] **Step 4: Chạy test để chắc nó XANH**

Chạy: `npm test -- chamCongThongKe`
Kỳ vọng: PASS, 28 ca.

- [ ] **Step 5: Chạy TOÀN BỘ test của dự án**

Chạy: `npm test`
Kỳ vọng: mọi tệp test PASS. Nếu `kpiTuDong.test.js` đỏ thì Task 1 đã sửa quá tay — quay lại
kiểm tra chỉ thêm đúng một từ `export`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/chamCongThongKe.js src/lib/chamCongThongKe.test.js
git commit -m "feat(cham-cong): gom thong ke theo nhom + dong tong"
```

---

## Task 6: Tải nhóm và thêm ô lọc vào `ChamCongTab`

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

Từ đây là giao diện. Đọc `src/pages/tasks/ChamCongTab.jsx` trọn vẹn trước khi sửa — tệp dùng
style inline, không dùng Tailwind, không dùng thư viện bảng.

- [ ] **Step 1: Thêm import**

Ở đầu tệp, sau dòng `import { supabase, fetchAllRows } ...`, thêm:

```js
import { gomThongKe, tongTatCa, docNhomTuKpi, MA_CHI_TIEU_NHOM } from '../../lib/chamCongThongKe';
import { loiGhiKpi } from '../../lib/kpiWriteGuard';
```

Và sửa dòng import icon (đang là `import { ChevronLeft, AlertTriangle, Loader2 } from 'lucide-react';`) thành:

```js
import { ChevronLeft, AlertTriangle, Loader2, ChevronRight, Users } from 'lucide-react';
```

- [ ] **Step 2: Thêm state**

Trong `export default function ChamCongTab(...)`, ngay sau dòng
`const [chon, setChon] = useState(null);`, thêm:

```js
  const [kpiRows, setKpiRows] = useState([]);       // dòng chỉ tiêu chở khoá nhóm
  const [locNhom, setLocNhom] = useState('');       // '' = tất cả; 'KHONG_NHOM' = chưa phân nhóm
  const [bung, setBung] = useState(() => new Set()); // khoá nhóm đang bung trong khối thống kê
  const [manPhanNhom, setManPhanNhom] = useState(false);
```

- [ ] **Step 3: Tải nhóm trong `taiDuLieu`, tải MỀM**

Trong `taiDuLieu`, ngay sau khối `try { ... setNgoaiLe(nl || []); } catch { setNgoaiLe([]); }`,
thêm khối tương tự:

```js
      // Nhóm tải RIÊNG và MỀM, cùng lý do như miễn trừ: hỏng chỗ này (mất mạng, RLS đổi) KHÔNG
      // được xoá bảng chấm công đang hiển thị. Mất nhóm thì tab lui về đúng hành vi cũ — một
      // danh sách phẳng, không lọc được — vẫn dùng được.
      try {
        const { data: kp, error: loiKp } = await fetchAllRows(() =>
          supabase.from('kpi_chi_tieu')
            .select('id, ky, cap_do, nhan_vien_id, lien_ket_bo_phan, ten, ma')
            .eq('ky', ky).eq('ma', MA_CHI_TIEU_NHOM).order('id'));
        if (loiKp) throw loiKp;
        setKpiRows(kp || []);
      } catch {
        setKpiRows([]);
      }
```

Và trong khối `catch (err)` của `taiDuLieu`, thêm `setKpiRows([]);` cạnh `setNgoaiLe([]);`.

- [ ] **Step 4: Thêm dữ liệu dẫn xuất**

Ngay sau `const soDongNghiVan = useMemo(...)`, thêm:

```js
  const dsThongKe = useMemo(
    () => gomThongKe({ rows, ngoaiLe, kpiRows, users }),
    [rows, ngoaiLe, kpiRows, users]);

  const nhomCuaNguoi = useMemo(() => docNhomTuKpi(kpiRows).theoNguoi, [kpiRows]);

  // Danh sách nhóm cho ô lọc — chỉ nhóm THẬT SỰ có người trong kỳ, không liệt kê nhóm rỗng.
  const dsNhomLoc = useMemo(
    () => dsThongKe.map(n => ({ gia: n.khoa == null ? 'KHONG_NHOM' : n.khoa, nhan: n.nhan })),
    [dsThongKe]);

  const dsThongKeLoc = useMemo(() => {
    if (!locNhom) return dsThongKe;
    return dsThongKe.filter(n => (n.khoa == null ? 'KHONG_NHOM' : n.khoa) === locNhom);
  }, [dsThongKe, locNhom]);

  const idsHienThi = useMemo(
    () => new Set(dsThongKeLoc.flatMap(n => n.thanhVien.map(x => x.id))),
    [dsThongKeLoc]);

  // Lưới lịch lọc theo NGƯỜI, KHÔNG lọc theo ngày: bỏ bớt cột ngày khi lọc nhóm sẽ làm người
  // đọc tưởng những ngày đó cả công ty nghỉ.
  const dsNhanVienLoc = useMemo(
    () => dsNhanVien.filter(nv => idsHienThi.has(nv.id)), [dsNhanVien, idsHienThi]);

  const soNgayCongLoc = useMemo(
    () => rows.filter(r => idsHienThi.has(r.nhan_vien_id)).length, [rows, idsHienThi]);

  const soNghiVanLoc = useMemo(
    () => rows.filter(r => r.nghi_van && idsHienThi.has(r.nhan_vien_id)).length,
    [rows, idsHienThi]);

  const tenNhomDangLoc = useMemo(
    () => dsNhomLoc.find(n => n.gia === locNhom)?.nhan || '', [dsNhomLoc, locNhom]);

  // Lọc một nhóm thì bung sẵn nhóm đó — người dùng vừa nói rõ họ quan tâm nhóm nào.
  useEffect(() => {
    if (locNhom) setBung(new Set([locNhom]));
  }, [locNhom]);

  // Bộ lọc TỰ GỠ khi nhóm đang chọn không còn tồn tại. Bắt buộc phải có: đang lọc SẢN XUẤT ở
  // kỳ 2026-07 rồi chuyển sang kỳ 2026-06 (kỳ đó cả công ty chung MỘT nhóm, không có
  // CHUYEN_CAN_SX) thì không có nhóm nào khớp — màn hình trắng trơn và người dùng không hiểu
  // vì sao, vì ô lọc lúc đó cũng đã biến mất.
  useEffect(() => {
    if (locNhom && !dsNhomLoc.some(n => n.gia === locNhom)) setLocNhom('');
  }, [dsNhomLoc, locNhom]);
```

- [ ] **Step 5: Thay ô chọn tháng bằng thanh lọc đầy đủ**

Tìm khối JSX bắt đầu bằng `<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>`
và thay TRỌN khối `<div>` đó (tới thẻ `</div>` đóng của nó) bằng:

```jsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="month" value={ky} onChange={e => setKy(e.target.value || kyHienTai())}
          style={{ ...oInput, width: 'auto' }}
        />
        {dsNhomLoc.length > 1 && (
          <select value={locNhom} onChange={e => setLocNhom(e.target.value)}
            style={{ ...oInput, width: 'auto' }}>
            <option value="">Tất cả nhóm</option>
            {dsNhomLoc.map(n => <option key={n.gia} value={n.gia}>{n.nhan}</option>)}
          </select>
        )}
        {canEdit && kpiRows.length > 0 && (
          <button onClick={() => setManPhanNhom(true)} style={nutPhanNhom}>
            <Users size={13} /> Phân nhóm
          </button>
        )}
        {rows.length > 0 && (
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {dsNhanVienLoc.length} nhân viên · {soNgayCongLoc} ngày công · {soNghiVanLoc} dòng dữ liệu đáng ngờ
            {locNhom ? ` (lọc theo ${tenNhomDangLoc})` : ''}
          </span>
        )}
      </div>
```

- [ ] **Step 6: Lưới lịch dùng danh sách đã lọc**

Trong `<tbody>` của bảng lịch, đổi `{dsNhanVien.map(nv => {` thành `{dsNhanVienLoc.map(nv => {`.
Không đổi gì khác trong bảng — 3 cột tổng giữ nguyên số thô như hôm nay.

- [ ] **Step 7: Thêm style nút**

Ở cuối tệp, cạnh các hằng style khác, thêm:

```js
const nutPhanNhom = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb',
  fontSize: '0.78rem', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer',
  whiteSpace: 'nowrap',
};
```

- [ ] **Step 8: Chạy build để chắc không lỗi cú pháp**

Chạy: `npm run build`
Kỳ vọng: build xong, không lỗi. (Cảnh báo về kích thước bundle là bình thường, bỏ qua.)

- [ ] **Step 9: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): tai nhom tu KPI + o loc theo nhom"
```

---

## Task 7: Khối thống kê

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

- [ ] **Step 1: Thêm component `KhoiThongKe` ở cuối tệp**

Đặt trước phần khai báo style, sau `function BangChiTietMotNguoi(...)`:

```jsx
// ─────────────────────────────────────────────────────────────────────────────
// Khối thống kê hai cấp: dòng nhóm bấm được để bung ra từng nhân viên.
//
// Con số ở đây ĐÃ TRỪ ngày đánh dấu Đặc biệt, nên sẽ lệch với 3 cột tổng của lưới lịch bên
// dưới (số thô). Cố ý: đổi ý nghĩa cột cũ là cách chắc nhất để người quen đọc nó đọc sai.
// ─────────────────────────────────────────────────────────────────────────────
function KhoiThongKe({ dsNhom, bung, onBung, onChonNguoi }) {
  const tong = useMemo(() => tongTatCa(dsNhom), [dsNhom]);
  if (!dsNhom.length) return null;

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, background: '#fff' }}>
        <thead>
          <tr>
            <th style={thTK.left}>Nhóm / Nhân viên</th>
            <th style={thTK.num}>Người</th>
            <th style={thTK.num}>Tổng nghỉ</th>
            <th style={thTK.num} title={TIP_PHEP}>Nghỉ phép</th>
            <th style={thTK.num} title={TIP_QUA}>Quá quy định</th>
            <th style={thTK.num} title={TIP_PHUT}>Muộn (phút)</th>
            <th style={thTK.num} title={TIP_PHUT}>Về sớm (phút)</th>
          </tr>
        </thead>
        <tbody>
          {dsNhom.map(n => {
            const khoa = n.khoa == null ? 'KHONG_NHOM' : n.khoa;
            const mo = bung.has(khoa);
            return (
              <React.Fragment key={khoa}>
                <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => onBung(khoa)}>
                  <td style={{ ...tdTK.left, fontWeight: 700 }}>
                    {mo ? <ChevronDownNho /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />}
                    {' '}{n.nhan}
                  </td>
                  <td style={tdTK.num}>{n.soNguoi}</td>
                  <SoTK v={n.tongNghi} dam />
                  <SoTK v={n.nghiPhep} dam />
                  <SoTK v={n.nghiQuaQuyDinh} dam canhBao />
                  <SoTK v={n.phutMuon} dam canhBao />
                  <SoTK v={n.phutVeSom} dam canhBao />
                </tr>
                {mo && n.thanhVien.map(x => (
                  <tr key={x.id}>
                    <td style={{ ...tdTK.left, paddingLeft: 30 }}>
                      <button onClick={() => onChonNguoi(x.id)} style={nutTenTK}>{x.ten}</button>
                    </td>
                    <td style={tdTK.num} />
                    <SoTK v={x.tongNghi} />
                    <SoTK v={x.nghiPhep} />
                    <SoTK v={x.nghiQuaQuyDinh} canhBao />
                    <SoTK v={x.phutMuon} canhBao />
                    <SoTK v={x.phutVeSom} canhBao />
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
            <td style={{ ...tdTK.left, fontWeight: 700 }}>TỔNG</td>
            <td style={{ ...tdTK.num, fontWeight: 700 }}>{tong.soNguoi}</td>
            <SoTK v={tong.tongNghi} dam />
            <SoTK v={tong.nghiPhep} dam />
            <SoTK v={tong.nghiQuaQuyDinh} dam canhBao />
            <SoTK v={tong.phutMuon} dam canhBao />
            <SoTK v={tong.phutVeSom} dam canhBao />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Số 0 để mờ — bắt mắt đọc một cột đầy số 0 là làm người ta bỏ sót con số thật sự khác 0.
// `canhBao` = cột mà khác 0 là chuyện xấu (quá quy định, muộn, về sớm) → tô đỏ.
function SoTK({ v, dam, canhBao }) {
  const khac0 = Number(v) > 0;
  return (
    <td style={{
      ...tdTK.num,
      fontWeight: dam ? 700 : 400,
      color: !khac0 ? '#cbd5e1' : (canhBao ? '#b91c1c' : '#0f172a'),
    }}>{v}</td>
  );
}

const ChevronDownNho = () => (
  <ChevronRight size={13} style={{ verticalAlign: -2, transform: 'rotate(90deg)' }} />
);

const TIP_PHEP = 'Ngày nghỉ đã đánh dấu Đặc biệt (có giải trình) + tối đa 1 ngày phép trong tháng.';
const TIP_QUA = 'Số ngày nghỉ CHƯA đánh dấu Đặc biệt, trừ đi 1 ngày phép. Đây đúng là con số KPI dùng để trừ điểm chuyên cần.';
const TIP_PHUT = 'Đã bỏ các ngày được đánh dấu Đặc biệt — nên có thể lệch với cột tổng của bảng lịch bên dưới (số thô).';
```

- [ ] **Step 2: Thêm `React` vào import nếu chưa có**

Dòng đầu tệp phải là `import React, { useState, useEffect, useMemo, useCallback } from 'react';`
(đã đúng sẵn) — `React.Fragment` ở trên cần nó.

- [ ] **Step 3: Thêm style bảng thống kê**

Ở cuối tệp cạnh các style khác:

```js
const thTK = {
  left: {
    background: '#f8fafc', textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
  num: {
    background: '#f8fafc', textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
};
const tdTK = {
  left: { padding: '7px 10px', borderBottom: '1px solid #eef2f7', fontSize: '0.78rem', whiteSpace: 'nowrap' },
  num: {
    padding: '7px 10px', borderBottom: '1px solid #eef2f7', fontSize: '0.78rem',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
};
const nutTenTK = {
  border: 'none', background: 'none', cursor: 'pointer', padding: 0,
  font: 'inherit', fontSize: '0.78rem', color: '#0f172a', textAlign: 'left',
};
```

- [ ] **Step 4: Gắn khối thống kê vào màn hình chính**

Trong phần `return` của `ChamCongTab`, chèn ngay TRƯỚC khối `{rows.length > 0 && (` của bảng lịch:

```jsx
      {rows.length > 0 && (
        <KhoiThongKe
          dsNhom={dsThongKeLoc} bung={bung}
          onBung={khoa => setBung(s => {
            const m = new Set(s);
            if (m.has(khoa)) m.delete(khoa); else m.add(khoa);
            return m;
          })}
          onChonNguoi={setChon}
        />
      )}
```

- [ ] **Step 5: Chạy build**

Chạy: `npm run build`
Kỳ vọng: build xong, không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): khoi thong ke 5 chi so theo nhom va tung nguoi"
```

---

## Task 8: Màn hình phân nhóm

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx`

- [ ] **Step 1: Thêm hàm đổi nhóm trong `ChamCongTab`**

Sau `const doiNgoaiLe = useCallback(...)`, thêm:

```js
  // Đổi nhóm chuyên cần của MỘT người trong kỳ đang xem.
  //
  // ⚠ Đây là lệnh ghi vào kpi_chi_tieu — cùng bảng quyết định điểm KPI. Điểm chuyên cần bộ
  // phận của CẢ nhóm cũ lẫn nhóm mới sẽ đổi ngay lần mở tab KPI kế tiếp, vì điểm tính trên
  // trung bình đầu người. Chủ app chọn có chủ đích (01/08/2026).
  //
  // `.select()` + loiGhiKpi là BẮT BUỘC: PostgREST trả 204 với error === null khi RLS lọc sạch
  // dòng, nên chỉ kiểm `if (error)` là báo "đã lưu" cho một thao tác không chạm được dòng nào.
  const doiNhom = useCallback(async (nvId, khoaMoi) => {
    setLoi('');
    const { data, error } = await supabase.from('kpi_chi_tieu')
      .update({ lien_ket_bo_phan: khoaMoi })
      .eq('ky', ky).eq('ma', MA_CHI_TIEU_NHOM)
      .eq('cap_do', 'CA_NHAN').eq('nhan_vien_id', nvId)
      .select();
    const loiGhi = loiGhiKpi(error, data);
    if (loiGhi) { setLoi(loiGhi); return; }
    await taiDuLieu();
  }, [ky, taiDuLieu]);
```

- [ ] **Step 2: Thêm màn hình con, TRƯỚC nhánh `if (chon)`**

```jsx
  if (manPhanNhom) {
    return (
      <ManPhanNhom
        ky={ky} kpiRows={kpiRows} dsNhanVien={dsNhanVien} nhomCuaNguoi={nhomCuaNguoi}
        loi={loi} onDoiNhom={doiNhom} onBack={() => setManPhanNhom(false)}
      />
    );
  }
```

- [ ] **Step 3: Thêm component `ManPhanNhom` ở cuối tệp**

```jsx
// ─────────────────────────────────────────────────────────────────────────────
// Xếp từng nhân viên vào một trong các nhóm chuyên cần SẴN CÓ của kỳ.
//
// Không tạo/xoá/đổi tên nhóm ở đây: tạo nhóm mới là sinh thêm một dòng chỉ tiêu KPI cho mọi
// thành viên, phải đặt đúng chỉ tiêu và trọng số — việc đó làm ở tab KPI.
// ─────────────────────────────────────────────────────────────────────────────
function ManPhanNhom({ ky, kpiRows, dsNhanVien, nhomCuaNguoi, loi, onDoiNhom, onBack }) {
  // Nhóm chọn được = các nhóm có dòng BO_PHAN trong kỳ. Sắp theo nhãn cho ổn định.
  const dsNhom = useMemo(() => {
    const { nhan } = docNhomTuKpi(kpiRows);
    return Array.from(nhan.entries())
      .map(([khoa, ten]) => ({ khoa, ten }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  }, [kpiRows]);

  // Ai CÓ dòng chỉ tiêu nhóm trong kỳ này. Người không có thì ô chọn phải khoá — tự insert là
  // tự thêm một chỉ tiêu KPI vào bảng điểm của họ mà không ai yêu cầu.
  const coDong = useMemo(() => new Set(
    kpiRows.filter(r => r.ma === MA_CHI_TIEU_NHOM && r.cap_do === 'CA_NHAN' && r.nhan_vien_id)
      .map(r => r.nhan_vien_id)), [kpiRows]);

  return (
    <div style={{ width: '100%' }}>
      <button onClick={onBack} style={nutQuayLai}>
        <ChevronLeft size={14} /> Bảng chấm công
      </button>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', border: '1px solid #e2e8f0', marginBottom: 12 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Phân nhóm chuyên cần</div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kỳ {ky} · {dsNhanVien.length} nhân viên · {dsNhom.length} nhóm</div>
      </div>

      {loi && (
        <div style={{
          padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
          fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> {loi}
        </div>
      )}

      <div style={{
        padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fffbeb', color: '#b45309',
        fontSize: '0.78rem', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Đổi nhóm sẽ làm điểm KPI <b>Chuyên cần bộ phận</b> của <b>cả nhóm cũ lẫn nhóm mới</b> tính
          lại ngay, vì điểm tính trên trung bình đầu người. Áp dụng cho <b>kỳ {ky}</b>; các kỳ tạo
          sau sẽ tự chép nhóm này.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {dsNhanVien.map(nv => (
          <div key={nv.id} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: '0.6rem 0.7rem',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 }}>{nv.ten}</div>
            {coDong.has(nv.id) ? (
              <select
                value={nhomCuaNguoi.get(nv.id) || ''}
                onChange={e => onDoiNhom(nv.id, e.target.value)}
                style={{ ...oInput, width: '100%' }}
              >
                {!nhomCuaNguoi.get(nv.id) && <option value="">— chưa chọn —</option>}
                {dsNhom.map(n => <option key={n.khoa} value={n.khoa}>{n.ten}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Chưa có chỉ tiêu Chuyên cần bộ phận trong kỳ này — thêm ở tab KPI trước.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Chạy build**

Chạy: `npm run build`
Kỳ vọng: build xong, không lỗi.

- [ ] **Step 5: Chạy toàn bộ test**

Chạy: `npm test`
Kỳ vọng: PASS hết.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): man phan nhom chuyen can cho admin"
```

---

## Task 9: Kiểm tra thật trên app đang chạy

**Files:** không sửa tệp nào (trừ khi phát hiện lỗi)

- [ ] **Step 1: Bật dev server**

Dùng công cụ preview của Claude Code (`preview_start`), **không** chạy `npm run dev` qua Bash.
Nếu `.claude/launch.json` chưa có mục cho dự án này thì tạo với `runtimeExecutable: "npm"`,
`runtimeArgs: ["run","dev"]`, `port: 5173`.

Đăng nhập bằng tài khoản admin (xem ghi nhớ `local-app-testing`), vào **Công việc → Chấm công**.

- [ ] **Step 2: Đối chiếu số với bảng ở đầu plan**

Chọn kỳ `2026-07`. Khối thống kê phải ra ĐÚNG:

| Nhóm | Người | Tổng nghỉ | Nghỉ phép | Quá quy định | Muộn |
|---|---|---|---|---|---|
| SẢN XUẤT | 7 | 12 | 6 | 6 | 354 |
| BẢO HÀNH | 2 | 4 | 2 | 2 | 220 |
| CSKH | 3 | 2 | 2 | 0 | 14 |
| TOÀN CÔNG TY | 1 | 1 | 1 | 0 | 32 |
| TỔNG | 13 | 19 | 11 | 8 | 620 |

Lệch một con số nào cũng phải dừng lại tìm nguyên nhân, không được "chắc do làm tròn".

- [ ] **Step 3: Thử bộ lọc**

Chọn nhóm SẢN XUẤT: khối thống kê còn 1 nhóm và tự bung; lưới lịch còn 7 dòng; dòng đếm ghi
`7 nhân viên · … (lọc theo SẢN XUẤT)`. Số cột ngày **không** đổi.

- [ ] **Step 4: Thử màn phân nhóm (KHÔNG lưu thay đổi thật)**

Bấm **Phân nhóm** → thấy 13 thẻ, mỗi thẻ một ô chọn đúng nhóm hiện tại, kèm câu cảnh báo có
đúng chữ "kỳ 2026-07". Bấm Quay lại. **Không đổi nhóm ai** ở bước này.

- [ ] **Step 5: Thử kỳ 2026-06 (chỉ có một nhóm chung)**

Chọn kỳ `2026-06`: ô lọc nhóm **không hiện** (chỉ có 1 nhóm), khối thống kê hiện đúng một nhóm
13 người, không vỡ giao diện.

- [ ] **Step 6: Chụp màn hình gửi chủ app**

Dùng `computer {action:"screenshot"}`, gửi kèm ảnh khối thống kê kỳ 2026-07.

- [ ] **Step 7: Commit nếu có sửa**

Không có lỗi thì không commit gì ở task này.

---

## Task 10: Kiểm tra bảo mật — BẮT BUỘC trước khi báo hoàn thành

**Files:** không sửa tệp nào

Thay đổi này đọc và **ghi** `kpi_chi_tieu`. Theo luật chung của chủ app, phải đo thật chứ
không được suy luận.

- [ ] **Step 1: Gọi skill**

Gọi skill `kiem-tra-bao-mat-du-lieu` và làm đủ phần kiểm chứng trong đó.

- [ ] **Step 2: Đo bằng khoá công khai (anon), chưa đăng nhập**

Kỳ vọng: `select` trên `kpi_chi_tieu` trả rỗng hoặc lỗi; `update lien_ket_bo_phan` bị chặn.
Phải có **kết quả chạy thật** dán lại, không được viết "chắc là bị chặn".

- [ ] **Step 3: Đo bằng tài khoản đã đăng nhập nhưng KHÔNG phải ADMIN**

Kỳ vọng: đọc được nhóm (tab Chấm công hiện đủ, không vỡ); `update` trả **0 dòng** và giao diện
hiện thông báo của `loiGhiKpi` — tuyệt đối không được báo "đã lưu".

- [ ] **Step 4: Báo cáo**

Ghi rõ mục nào đo được, mục nào chưa đo được và vì sao. Thà báo "chỗ này chưa đo được" còn hơn
để chủ app tin nhầm là đã an toàn.

---

## Ghi chú bàn giao

Sau khi xong hết: **chưa deploy**. Theo ghi nhớ `deploy-workflow`, việc build → đồng bộ
`deploy-netlify` → kéo-thả Netlify là bước riêng, chủ app quyết định thời điểm.
