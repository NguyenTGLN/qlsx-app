# KPI ĐÓNG GÓP CẢI TIẾN — gỡ khỏi Bảng chấm chung: Kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Điểm KPI chỉ tiêu ĐÓNG GÓP CẢI TIẾN chỉ đến từ bài cải tiến đã duyệt; không còn đường nào chấm tay nó ở màn hình Bảng chấm chung.

**Architecture:** Một vị từ thuần `laChamTuDong(ct)` trong `src/lib/kpiBangChung.js` trả lời câu hỏi "chỉ tiêu này app tự tính?". Bảng chấm chung dùng nó ở **hai** chỗ — khoá ô nhập, và loại khỏi popup "＋ Thêm chỉ tiêu" — nên chỉ tiêu vừa gỡ ra không thể được thêm vào lại. Một file SQL gỡ `cham_chung` của `DONG_GOP_CAI_TIEN` ở mọi kỳ. Luật tính điểm (`luatDongGopCaiTien`) **không đụng tới**: nó đã chạy đúng.

**Tech Stack:** React 18 + Vite, Supabase (Postgres), Vitest. Không thêm thư viện nào.

**Spec:** [`docs/superpowers/specs/2026-07-31-kpi-cai-tien-go-khoi-bang-chung-design.md`](../specs/2026-07-31-kpi-cai-tien-go-khoi-bang-chung-design.md)

---

## Bối cảnh mà người thực hiện cần biết trước

Đọc 6 gạch đầu dòng này trước khi gõ dòng mã đầu tiên:

1. **Luật chấm tự động đã đúng, đừng sửa nó.** `luatDongGopCaiTien` (`src/lib/kpiTuDong.js:403`) đếm bài `DA_DUYET` theo mốc `reviewed_at`, tối thiểu 2 bài/tháng. Việc của plan này là gỡ đường chấm tay, **không** đổi cách tính điểm.
2. **Điểm tự động KHÔNG ghi xuống DB.** `apDungChamTuDong` (`src/lib/kpiTuDong.js:466`) trả bản sao của rows với `diem_chot` đã tính lại, mỗi lần mở màn hình tính lại từ đầu. Đừng đi tìm chỗ nào ghi nó xuống — không có.
3. **`KpiTab.jsx` truyền `rowsTD` (đã tính tự động) xuống `KpiBangChung`** (`src/pages/tasks/KpiTab.jsx:265`). Nên `ct.diem_chot` trong ô bảng chung **đã là** số tự động, không phải số trong DB.
4. **`rows` lấy bằng `select('*')`** (`src/pages/tasks/KpiTab.jsx:77`) nên có cột `cach_cham`; `apDungChamTuDong` trả `{ ...r }` giữ nguyên cột đó; `dungMaTran` đặt thẳng object dòng vào `o[]`. Không phải sửa câu truy vấn nào.
5. **4 chỉ tiêu chấm tay còn lại trong bảng chung** (`5S`, `CHAM_KPI`, `QUY_DINH_CONG_TY`, `VAN_HOA_CONG_TY`) đều `cach_cham = 'THU_CONG'` — đã đo trên DB 31/07/2026. Thay đổi ở Task 1–2 **không được** chạm tới chúng; Task 2 có bước kiểm chính chuyện này.
6. **Không có test cho file `.jsx`** trong dự án này — chỉ `src/lib/*.test.js`. Nên logic đáng test phải nằm ở `src/lib/`, còn phần JSX kiểm bằng build + mắt người (Task 2 Step 5).

## Bản đồ tệp

| Tệp | Việc | Trách nhiệm |
|---|---|---|
| `src/lib/kpiBangChung.js` | Sửa | Thêm vị từ `laChamTuDong`; `dsChiTieuThemDuoc` lọc bỏ chỉ tiêu tự động |
| `src/lib/kpiBangChung.test.js` | Sửa | Test cho cả hai thay đổi trên |
| `src/pages/tasks/KpiBangChung.jsx` | Sửa | Ô nhập của chỉ tiêu tự động → chỉ đọc; ẩn nút ghi lý do |
| `sql/go_cai_tien_khoi_bang_chung.sql` | Tạo | `cham_chung = false` cho `DONG_GOP_CAI_TIEN` ở mọi kỳ |

---

## Task 1: Vị từ `laChamTuDong` + lọc popup "＋ Thêm chỉ tiêu"

**Files:**
- Modify: `src/lib/kpiBangChung.js:10` (thêm sau `khoaChiTieu`), `src/lib/kpiBangChung.js:67-77` (`dsChiTieuThemDuoc`)
- Test: `src/lib/kpiBangChung.test.js:87-110` (thêm vào `describe('dsChiTieuThemDuoc')`)

- [ ] **Step 1: Viết test thất bại**

Mở `src/lib/kpiBangChung.test.js`. Ở dòng 3-5 có sẵn khối `import`; thêm `laChamTuDong` vào danh sách nhập:

```js
import {
  dsNhanVienChamChung, dungMaTran, dsChiTieuThemDuoc, canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG,
  demNguoiTheoChiTieu, phanLoaiChiTieu, xepTheoLoai, THU_TU_LOAI, sinhMaChiTieu, dsChiTieuCoSan,
  laChamTuDong,
} from './kpiBangChung';
```

Trong `describe('dsChiTieuThemDuoc', ...)` (bắt đầu dòng 87), **thay** mảng `rows` cũ bằng mảng dưới — thêm một dòng `DONG_GOP_CAI_TIEN` mang `cach_cham: 'TU_DONG'`, và gắn `cach_cham: 'THU_CONG'` cho các dòng cũ để test nói rõ chúng vẫn phải hiện:

```js
  const rows = [
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S', cham_chung: true, cach_cham: 'THU_CONG' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false, cach_cham: 'THU_CONG' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false, cach_cham: 'THU_CONG' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'THE_KHO', ten: 'THẺ KHO', cham_chung: false, cach_cham: 'THU_CONG' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'DONG_GOP_CAI_TIEN', ten: 'ĐÓNG GÓP CẢI TIẾN', cham_chung: false, cach_cham: 'TU_DONG' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: 'DONG_GOP_CAI_TIEN', ten: 'ĐÓNG GÓP CẢI TIẾN', cham_chung: false, cach_cham: 'TU_DONG' },
    { cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN', cham_chung: false, cach_cham: 'THU_CONG' },
  ];
```

**Ngay trước** dòng `});` đóng `describe` đó (dòng 110 bản gốc), thêm 2 test:

```js
  it('bỏ chỉ tiêu app tự tính — thêm vào bảng chung là mời chấm tay một số sẽ bị đè', () => {
    expect(dsChiTieuThemDuoc(rows).some(c => c.ma === 'DONG_GOP_CAI_TIEN')).toBe(false);
  });

  it('vẫn giữ đủ chỉ tiêu chấm tay — khoá tự động không được nuốt nhầm dòng THU_CONG', () => {
    expect(dsChiTieuThemDuoc(rows).map(c => c.ma)).toEqual(['SAN_XUAT', 'THE_KHO']);
  });
```

Thêm một `describe` mới cho vị từ, đặt **ngay trước** `describe('dsChiTieuThemDuoc'` (trước dòng 87):

```js
describe('laChamTuDong', () => {
  it('đúng khi cach_cham là TU_DONG', () => {
    expect(laChamTuDong({ cach_cham: 'TU_DONG' })).toBe(true);
  });

  it('sai với chấm tay', () => {
    expect(laChamTuDong({ cach_cham: 'THU_CONG' })).toBe(false);
  });

  it('thiếu cach_cham thì coi là chấm tay — dòng cũ chưa chạy migration không được tự khoá', () => {
    expect(laChamTuDong({})).toBe(false);
  });

  it('không nổ với null/undefined', () => {
    expect(laChamTuDong(null)).toBe(false);
    expect(laChamTuDong(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
npx vitest run src/lib/kpiBangChung.test.js
```

Kỳ vọng: **FAIL**. `describe('laChamTuDong')` báo `laChamTuDong is not a function`, và test `bỏ chỉ tiêu app tự tính` báo nhận `true` trong khi mong `false`.

- [ ] **Step 3: Viết mã tối thiểu cho qua**

Trong `src/lib/kpiBangChung.js`, thêm **ngay sau** hàm `khoaChiTieu` (sau dòng 10):

```js
// Chỉ tiêu app TỰ TÍNH điểm (luật trong kpiTuDong.js) — không ai chấm tay được.
//
// Bảng chấm chung phải hỏi câu này ở HAI chỗ: khoá ô nhập, và loại khỏi popup "＋ Thêm chỉ
// tiêu". Thiếu chỗ thứ hai thì chỉ tiêu vừa gỡ ra được thêm vào lại ngay lượt sau, và bẫy cũ
// tái diễn y nguyên.
//
// Thiếu `cach_cham` thì trả false: dòng cũ chưa chạy migration phải giữ đường chấm tay, khoá
// nhầm là cả một chỉ tiêu không ai chấm được mà không có lỗi nào báo.
export const laChamTuDong = ct => ct?.cach_cham === 'TU_DONG';
```

Trong `dsChiTieuThemDuoc` (dòng 67-77), thêm một dòng lọc ngay sau dòng `if (r.cap_do === 'BO_PHAN' || ...) continue;`:

```js
export function dsChiTieuThemDuoc(rows = []) {
  const nhom = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || r.cham_chung || !r.nhan_vien_id) continue;
    // App tự tính thì đưa vào bảng chung là mời người ta gõ một con số sẽ bị đè lúc hiển thị.
    if (laChamTuDong(r)) continue;
    const k = khoaChiTieu(r);
    if (!nhom.has(k)) nhom.set(k, { ma: r.ma || null, ten: r.ten, soNguoi: 0 });
    nhom.get(k).soNguoi += 1;
  }
  return [...nhom.values()]
    .sort((a, b) => b.soNguoi - a.soNguoi || a.ten.localeCompare(b.ten, 'vi'));
}
```

- [ ] **Step 4: Chạy lại test để thấy nó qua**

```bash
npx vitest run src/lib/kpiBangChung.test.js
```

Kỳ vọng: **PASS**, toàn bộ file, không có test nào bị bỏ qua.

- [ ] **Step 5: Chạy TOÀN BỘ test — không được làm hỏng chỗ khác**

```bash
npm test
```

Kỳ vọng: **PASS** hết. `dsChiTieuCoSan` (hàm anh em, dòng 161) **không** bị đụng ở task này — nếu test của nó đỏ thì đã sửa nhầm hàm.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kpiBangChung.js src/lib/kpiBangChung.test.js
git commit -m "feat(kpi): loc chi tieu tu dong khoi popup Them chi tieu cua Bang cham chung"
```

---

## Task 2: Khoá ô nhập của chỉ tiêu tự động trong Bảng chấm chung

**Files:**
- Modify: `src/pages/tasks/KpiBangChung.jsx:4-7` (import), `:138-212` (`OChamDiem`)

Không có test JSX trong dự án — kiểm bằng build + mắt người ở Step 4-5.

- [ ] **Step 1: Nhập vị từ vừa tạo**

Trong `src/pages/tasks/KpiBangChung.jsx`, **thay** khối import dòng 4-7 bằng:

```jsx
import {
  dsNhanVienChamChung, dungMaTran, dsChiTieuThemDuoc,
  canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG, laChamTuDong,
} from '../../lib/kpiBangChung';
```

- [ ] **Step 2: Khoá ô nhập + ẩn nút ghi lý do**

Trong hàm `OChamDiem` (dòng 138), thêm biến `tuDong` **ngay sau** dòng `const dongLyDo = timDongLyDo(logs);` (dòng 139):

```jsx
  // Chỉ tiêu app tự tính → ô CHỈ ĐỌC. Gõ tay ở đây ghi xuống DB thật rồi bị luật tự động đè
  // lại lúc hiển thị: số vừa gõ biến mất mà không báo gì. Tab KPI cá nhân đã khoá từ lâu
  // (KpiTab.jsx:1064) — đây là chỗ còn sót, và là nguyên nhân 13/13 dòng ĐÓNG GÓP CẢI TIẾN
  // kỳ 07/2026 mang dấu vết chấm tay.
  const tuDong = laChamTuDong(ct);
```

**Thay** hàm `roiO` (dòng 179-183) bằng bản có chốt chặn:

```jsx
  async function roiO() {
    // Chốt chặn thứ hai sau `disabled`: nếu sau này ai bỏ `disabled` để chỉnh giao diện thì
    // vẫn không có đường ghi lén xuống DB.
    if (tuDong) return;
    if (diem === macDinh) return;
    const xong = await luu();
    if (xong && thieu) setMoLyDo(true);
  }
```

**Thay** thẻ `<input>` (dòng 187-198) và điều kiện nút lý do (dòng 199) bằng:

```jsx
      <input
        type="text" inputMode="decimal" value={diem} disabled={tuDong || !doiDuoc || dangLuu}
        onChange={e => setDiem(e.target.value)}
        onBlur={roiO}
        aria-label={`Điểm ${ct.ten}`}
        title={tuDong ? 'App tự tính chỉ tiêu này — không chấm tay được' : undefined}
        style={{
          width: 62, padding: '0.35rem', borderRadius: 7, textAlign: 'center',
          border: `1px solid ${loi ? '#dc2626' : '#e2e8f0'}`,
          background: tuDong ? '#f1f5f9' : loi ? '#fef2f2' : thieu ? '#fff5f6' : '#f0fdf4',
          color: tuDong ? '#64748b' : undefined,
          fontWeight: 700, fontSize: '0.82rem',
        }}
      />
      {tuDong && (
        <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 2, lineHeight: 1.2 }}>
          tự tính
        </div>
      )}
      {thieu && !tuDong && (
```

Phần còn lại của nút "＋ ghi lý do" (dòng 200-212) **giữ nguyên**, không sửa. Lý do ẩn nó: diễn giải điểm đã nằm sẵn trong ghi chú của dòng ảo do `apDungChamTuDong` sinh ra — thêm ô lý do thứ hai là hai chỗ nói cùng một chuyện, và chỗ thứ hai thì không ai đọc.

- [ ] **Step 3: Lint + build**

```bash
npm run lint
```

Kỳ vọng: không lỗi mới. (Nếu repo vốn đã có cảnh báo cũ thì so với lần chạy trước khi sửa.)

```bash
npm run build
```

Kỳ vọng: `built in ...` không lỗi.

- [ ] **Step 4: Mở app và nhìn tận mắt**

```bash
npm run dev
```

Vào **Công việc → KPI → kỳ 2026-07 → nút Bảng chấm chung**. Kiểm đúng 4 điểm:

1. Dòng **ĐÓNG GÓP CẢI TIẾN**: cả 13 ô **xám, không gõ được**, dưới ô có chữ "tự tính", rê chuột hiện chú thích.
2. Dòng **5S**, **CHẤM KPI**, **QUY ĐỊNH CÔNG TY**, **VĂN HÓA CÔNG TY**: ô vẫn **trắng/xanh và gõ được như cũ**. Đây là luồng không được phép hỏng — nếu bốn dòng này cũng bị khoá thì `laChamTuDong` đang bắt nhầm, dừng lại sửa.
3. Gõ thử một số vào ô **5S** rồi tab ra: vẫn lưu bình thường, nếu chấm thiếu vẫn hiện nút "＋ ghi lý do".
4. Popup **"＋ Thêm chỉ tiêu"**: trong danh sách **không còn** ĐÓNG GÓP CẢI TIẾN.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/KpiBangChung.jsx
git commit -m "fix(kpi): khoa o nhap Bang cham chung cho moi chi tieu cham tu dong"
```

---

## Task 3: SQL gỡ `cham_chung` của ĐÓNG GÓP CẢI TIẾN

**Files:**
- Create: `sql/go_cai_tien_khoi_bang_chung.sql`

- [ ] **Step 1: Đo trạng thái TRƯỚC khi chạy**

Chạy trên Supabase SQL Editor (dự án `ngwkzicrnspeggunsblr`), ghi lại kết quả để đối chiếu sau:

```sql
select ky, cach_cham, cham_chung, count(*) as so_dong
from kpi_chi_tieu where ma = 'DONG_GOP_CAI_TIEN'
group by ky, cach_cham, cham_chung order by ky desc;
```

Kỳ vọng (đo 31/07/2026): `2026-07 | TU_DONG | true | 13` và `2026-06 | TU_DONG | false | 13`.

- [ ] **Step 2: Tạo file SQL**

Tạo `sql/go_cai_tien_khoi_bang_chung.sql` với đúng nội dung:

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- GỠ "ĐÓNG GÓP CẢI TIẾN" KHỎI BẢNG CHẤM CHUNG (31/07/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao: điểm chỉ tiêu này app TỰ TÍNH từ bài cải tiến ĐÃ DUYỆT (luật
-- luatDongGopCaiTien trong src/lib/kpiTuDong.js, đếm theo mốc reviewed_at,
-- tối thiểu 2 bài/tháng). Luật đó ĐÈ lên diem_chot mỗi lần hiển thị — nên ô
-- nhập ở Bảng chấm chung chỉ mời người ta gõ một con số rồi vứt đi. Đo
-- 31/07/2026: cả 13 dòng kỳ 2026-07 đã mang chot_boi = 'Nguyên'.
--
-- Áp cho MỌI kỳ chứ không riêng 2026-07: hàm tao_ky_kpi (them_ma_va_cham_chung_kpi.sql)
-- COPY cột cham_chung sang kỳ mới, chặn một kỳ thì tháng sau nó quay lại mà
-- không có lỗi nào báo.
--
-- ⚠ KHÔNG xoá diem_chot / chot_boi. Khi bảng cai_tien lỗi tải, KpiTab đặt
--   caiTien = null → luật trả "không chấm" → rơi về diem_chot trong DB.
--   diem_chot = 0 là số an toàn; đặt null thì engine coi là ĐẠT ĐỦ ĐIỂM
--   (xem KpiBangChung.jsx:140-141), tức một lỗi mạng hoá thành 2/2 điểm cho
--   cả 13 người.
-- ════════════════════════════════════════════════════════════════════════════
begin;

update kpi_chi_tieu
set cham_chung = false
where ma = 'DONG_GOP_CAI_TIEN'
  and cham_chung;

commit;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Không còn dòng nào của chỉ tiêu này nằm trong bảng chung (kỳ vọng: 0 dòng):
select ky, count(*) from kpi_chi_tieu
where ma = 'DONG_GOP_CAI_TIEN' and cham_chung group by ky;

-- 2) Điểm và người chốt GIỮ NGUYÊN, không bị xoá (kỳ vọng: 13 dòng kỳ 2026-07,
--    diem_chot = 0, chot_boi = 'Nguyên'):
select ky, count(*) as so_dong, count(diem_chot) as con_diem, count(chot_boi) as con_nguoi_chot
from kpi_chi_tieu where ma = 'DONG_GOP_CAI_TIEN' group by ky order by ky desc;

-- 3) Còn chỉ tiêu TỰ ĐỘNG nào khác đang nằm trong bảng chung không?
--    Kỳ vọng: 0 dòng. Có dòng nào hiện ra là một bẫy y hệt đang chờ ở chỉ tiêu
--    khác — xử lý tiếp, đừng bỏ qua.
select ky, ma, count(*) from kpi_chi_tieu
where cham_chung and cach_cham = 'TU_DONG' group by ky, ma order by ky desc, ma;

-- 4) 4 chỉ tiêu chấm tay còn lại PHẢI còn nguyên trong bảng chung (kỳ vọng:
--    5S, CHAM_KPI, QUY_DINH_CONG_TY, VAN_HOA_CONG_TY — đủ 4 mã, đều THU_CONG):
select ma, cach_cham, count(*) from kpi_chi_tieu
where ky = '2026-07' and cham_chung and cap_do = 'CA_NHAN'
group by ma, cach_cham order by ma;
```

- [ ] **Step 3: Chạy phần `begin … commit` trên Supabase SQL Editor**

Chỉ chạy đoạn từ `begin;` tới `commit;`. Kỳ vọng: `UPDATE 13`.

- [ ] **Step 4: Chạy 4 câu KIỂM TRA, đối chiếu từng cái**

| Câu | Kỳ vọng |
|---|---|
| 1 | **0 dòng** |
| 2 | `2026-07 \| 13 \| 13 \| 13` và `2026-06 \| 13 \| 12 \| 0` — điểm và người chốt còn nguyên |
| 3 | **0 dòng** |
| 4 | Đúng 4 mã `5S`, `CHAM_KPI`, `QUY_DINH_CONG_TY`, `VAN_HOA_CONG_TY`, tất cả `THU_CONG` |

Câu 2 mà `con_diem` tụt xuống dưới 13 nghĩa là đã xoá nhầm `diem_chot` — **dừng lại**, đó là lỗi.

- [ ] **Step 5: Mở lại app kiểm tra bằng mắt**

Vào **Công việc → KPI → kỳ 2026-07 → Bảng chấm chung**. Kỳ vọng: bảng còn **4 dòng** (5S, CHẤM KPI, QUY ĐỊNH CÔNG TY, VĂN HÓA CÔNG TY), **không còn** ĐÓNG GÓP CẢI TIẾN. Dòng chữ đầu màn hình đọc "4 chỉ tiêu × 13 nhân viên".

Quay lại bảng KPI của một nhân viên bất kỳ: chỉ tiêu ĐÓNG GÓP CẢI TIẾN vẫn còn trong bảng chỉ tiêu cá nhân, nền **tím** (loại `TU_DONG`), điểm **0/2**, ghi chú nói "chưa có cải tiến nào được duyệt trong tháng… Còn 1 bài đang chờ duyệt/bổ sung".

- [ ] **Step 6: Commit**

```bash
git add sql/go_cai_tien_khoi_bang_chung.sql
git commit -m "sql(kpi): go DONG_GOP_CAI_TIEN khoi bang cham chung o moi ky"
```

---

## Task 4: Kiểm tra bảo mật + bàn giao

**Files:** không sửa mã. Task này là cổng bắt buộc trước khi bàn giao.

- [ ] **Step 1: Chạy skill kiểm tra bảo mật**

Thay đổi có đụng SQL trên `kpi_chi_tieu` → theo `CLAUDE.md` **bắt buộc** gọi skill và làm đủ phần kiểm chứng trong đó:

```
Skill: kiem-tra-bao-mat-du-lieu
```

Phạm vi cần đo, nêu rõ trong báo cáo:
- Người ngoài cầm **khoá công khai** (publishable, nằm sẵn trong mã nguồn) **không đọc/sửa/xoá** được `kpi_chi_tieu` và `cai_tien`.
- Thay đổi này **không** sửa RLS/policy/Storage/khoá API nào — chỉ `update` một cột boolean. Nói rõ chỗ nào chưa đo được và vì sao, đừng để người dùng tin nhầm là đã an toàn.

- [ ] **Step 2: Chạy lại toàn bộ test + build lần cuối**

```bash
npm test
```

Kỳ vọng: PASS hết.

```bash
npm run build
```

Kỳ vọng: build xong, sinh thư mục `dist/`.

- [ ] **Step 3: Viết ghi chú bàn giao**

Nối vào cuối `BAN-GIAO-31-07-2026.md` một mục ngắn ghi đúng bốn điều:
1. ĐÓNG GÓP CẢI TIẾN đã gỡ khỏi Bảng chấm chung ở **mọi kỳ**; điểm chỉ đến từ bài cải tiến **đã duyệt**.
2. Mọi chỉ tiêu `cach_cham = 'TU_DONG'` từ nay **khoá ô nhập** ở Bảng chấm chung và **không hiện** trong popup "＋ Thêm chỉ tiêu".
3. **Tháng 7 cả công ty 0 điểm chỉ tiêu này** vì mới có 1 bài cải tiến và bài đó chưa duyệt. Muốn có điểm thì **duyệt bài ở tab Cải tiến**, không phải chấm tay. Duyệt xong điểm tự cộng.
4. `diem_chot = 0` và `chot_boi` cũ **cố ý giữ lại** làm số dự phòng khi lỗi tải — không phải rác quên xoá.

- [ ] **Step 4: Commit + nhắc kéo-thả `dist`**

```bash
git add BAN-GIAO-31-07-2026.md
git commit -m "docs(ban-giao): KPI cai tien chi lay diem tu bai da duyet"
```

Nhắc chủ app: deploy bằng **kéo-thả thư mục `dist`** lên Netlify, **không** build trên Netlify.

---

## Tự soát plan (đã chạy)

| Mục spec | Task thực hiện |
|---|---|
| A. SQL `cham_chung = false` mọi kỳ, giữ `diem_chot` | Task 3 Step 2-4 |
| B.1 Ô chỉ đọc cho `TU_DONG` | Task 2 Step 2 |
| B.2 Ẩn nút "＋ ghi lý do" | Task 2 Step 2 (`{thieu && !tuDong && (`) |
| B.3 Lọc popup "＋ Thêm chỉ tiêu" | Task 1 Step 3 |
| C. Test `dsChiTieuThemDuoc` | Task 1 Step 1-4 |
| Không hỏng 4 chỉ tiêu `THU_CONG` | Task 1 Step 1 (test), Task 2 Step 4.2 (mắt), Task 3 Step 4 câu 4 (DB) |
| Bảo mật | Task 4 Step 1 |

Tên hàm dùng xuyên suốt: `laChamTuDong` (Task 1 định nghĩa, Task 2 dùng). Biến trong JSX: `tuDong`. Không có placeholder, mọi bước sửa mã đều kèm mã thật.
