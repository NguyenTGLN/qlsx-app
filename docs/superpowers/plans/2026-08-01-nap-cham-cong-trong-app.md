# Nạp chấm công trong app: Kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ app tự nạp chấm công hằng tháng ngay trong app — chọn tệp Excel, xem trước ảnh hưởng lên điểm chuyên cần, bấm xác nhận. Không cần terminal, không cần mở Supabase.

**Architecture:** Logic đọc/kiểm tệp tách thành hàm thuần trong `src/lib/` (test được bằng Vitest, không cần DOM lẫn mạng). Màn hình React chỉ điều phối. Ghi xuống CSDL qua **một hàm RPC** để `delete` + `insert` nằm trong cùng một transaction — trình duyệt không mở được transaction qua PostgREST.

**Tech Stack:** React 18 + Vite, `xlsx` (đã có, đang dùng ở 4 màn hình khác), Supabase JS, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-01-nap-cham-cong-trong-app-design.md`](../specs/2026-08-01-nap-cham-cong-trong-app-design.md)

---

## Bối cảnh mà người thực hiện cần biết trước

1. **RLS bảng `cham_cong` đã cho ADMIN ghi** (`cc_ins`/`cc_upd`/`cc_del` với `nv_role='ADMIN'`). **Không sửa policy nào.**
2. **Hàm plpgsql thường VẪN chịu RLS** — đã đo 01/08/2026: hàm nháp xoá `cham_cong` gọi bằng khoá công khai → xoá 0 dòng. Đây là lý do hàm RPC ở Task 3 **không được** mang `SECURITY DEFINER`.
3. **App đã đọc Excel trong trình duyệt** ở `kho/CatalogTab.jsx:170`, `kho/BomTab.jsx:388`, `AdminDashboard.jsx:241`. Khuôn: `XLSX.read(await file.arrayBuffer(), { type: 'array' })`.
4. **`nhan_vien.name` là tên gọi tắt** ('Tuấn'), Excel ghi họ tên đầy đủ ('Vương Tuấn Anh'). Không có cột nối ⇒ Task 2 thêm `ten_cham_cong`.
5. **Không đoán tên bằng heuristic.** "Lấy chữ cuối" sai ở `Vương Tuấn Anh`, và `Nguyễn Xuân Thiện` chứa "Xuân" trùng tên gọi người khác. Đoán sai = gán chấm công sang người khác.
6. **`src/lib/*.js` là hàm thuần, không import supabase.** `src/pages/**/*.jsx` không có test — logic đáng test phải nằm ở lib.

## Bản đồ tệp

| Tệp | Việc | Trách nhiệm |
|---|---|---|
| `src/lib/chamCongExcel.js` | Tạo | Đọc mảng thô → bản ghi + kỳ + ngày cắt + cảnh báo; nối tên |
| `src/lib/chamCongExcel.test.js` | Tạo | Test cho trên |
| `src/lib/chamCongPreview.js` | Tạo | So điểm chuyên cần trước/sau, **dùng lại** luật thật |
| `src/lib/chamCongPreview.test.js` | Tạo | Test cho trên |
| `sql/them_ten_cham_cong.sql` | Tạo | Cột + chỉ mục duy nhất + điền 13 người |
| `sql/rpc_nap_cham_cong.sql` | Tạo | Hàm RPC xoá+nạp trong một transaction |
| `src/pages/tasks/NapChamCong.jsx` | Tạo | Màn hình 4 bước |
| `src/pages/tasks/ChamCongTab.jsx` | Sửa | Nút mở màn hình + sửa chú thích đầu tệp |

---

## Task 1: Hàm thuần đọc tệp — `chamCongExcel.js`

**Files:**
- Create: `src/lib/chamCongExcel.js`, `src/lib/chamCongExcel.test.js`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/chamCongExcel.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { docDongChamCong, suyRaKyVaNgayCat, noiTenNhanVien } from './chamCongExcel';

// Mảng thô đúng hình dạng XLSX.utils.sheet_to_json(..., {header:1, raw:false, defval:''}) trả về:
// hai dòng ghi chú rác ở đầu, rồi dòng tiêu đề, rồi dữ liệu.
const raw = (...dong) => [
  ['Thống kê chấm công', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', ''],
  ['Tên nhân viên', 'Ngày', 'Thứ', 'Giờ in sáng', 'Giờ in chiều', 'Giờ out (gồm tăng ca)',
   'Tăng ca', 'Đi muộn (phút)', 'Về sớm (phút)', 'Nghỉ'],
  ...dong,
];

const d = (ten, ngay, inSang = '08:00', inChieu = '13:30', out = '17:30',
           tangCa = '', muon = '0', veSom = '0', nghi = '') =>
  [ten, ngay, 'T2', inSang, inChieu, out, tangCa, muon, veSom, nghi];

describe('suyRaKyVaNgayCat', () => {
  it('tệp xuất hết tháng thì lấy trọn tháng', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026'), d('A', '31/07/2026')));
    expect(kq.ky).toBe('2026-07');
    expect(kq.denNgay).toBe('2026-07-31');
  });

  it('cắt ở ngày CUỐI CÙNG có người quét vân tay, bỏ ngày chưa tới', () => {
    // Máy xuất trọn tháng: ngày 24 trở đi chưa ai đi làm nên cột giờ vào rỗng.
    const kq = docDongChamCong(raw(
      d('A', '22/07/2026'), d('A', '23/07/2026'),
      d('A', '24/07/2026', ''), d('A', '25/07/2026', '')));
    expect(kq.denNgay).toBe('2026-07-23');
    expect(kq.dong).toHaveLength(2);
    expect(kq.boQuaNgaySau).toBe(2);
  });

  it('lẫn hai tháng thì NÉM LỖI, không tự chọn tháng nhiều dòng hơn', () => {
    expect(() => docDongChamCong(raw(
      d('A', '30/06/2026'), d('A', '01/07/2026'), d('A', '02/07/2026'))))
      .toThrow(/lẫn nhiều tháng/i);
  });

  it('không dòng nào có giờ vào thì ném lỗi thay vì trả kỳ rỗng', () => {
    expect(() => docDongChamCong(raw(d('A', '01/07/2026', ''))))
      .toThrow(/giờ vào/i);
  });
});

describe('docDongChamCong', () => {
  it('tìm đúng dòng tiêu đề dù có dòng ghi chú thừa ở đầu', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].tenExcel).toBe('A');
    expect(kq.dong[0].ngay).toBe('2026-07-01');
  });

  it('thiếu dòng tiêu đề thì ném lỗi', () => {
    expect(() => docDongChamCong([['linh tinh']])).toThrow(/Tên nhân viên/);
  });

  it('cột tăng ca dạng h:mm đổi ra phút', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026', '08:00', '13:30', '19:00', '1:27')));
    expect(kq.dong[0].tangCa).toBe(87);
  });

  it('tăng ca rỗng thì null, không phải 0 — không có số liệu khác với tăng ca bằng 0', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026')));
    expect(kq.dong[0].tangCa).toBeNull();
  });

  it('cột Nghỉ có chữ thì nghi = true', () => {
    const kq = docDongChamCong(raw(d('A', '01/07/2026', '', '', '', '', '0', '0', 'X')));
    expect(kq.dong[0].nghi).toBe(true);
  });

  it('giờ out sớm hơn giờ in chiều: bỏ về sớm, gắn nghi_van, thêm cảnh báo', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '12:00', '', '0', '330')));
    expect(kq.dong[0].veSom).toBe(0);
    expect(kq.dong[0].nghiVan).toBe('GIO_OUT_TRUOC_GIO_IN_CHIEU');
    expect(kq.canhBao).toHaveLength(1);
    expect(kq.canhBao[0]).toMatch(/330/);
  });

  it('giờ out bình thường thì giữ nguyên về sớm', () => {
    const kq = docDongChamCong(raw(
      d('A', '01/07/2026', '08:00', '13:30', '16:00', '', '0', '90')));
    expect(kq.dong[0].veSom).toBe(90);
    expect(kq.dong[0].nghiVan).toBeNull();
    expect(kq.canhBao).toHaveLength(0);
  });

  it('ngày sai định dạng thì ném lỗi kèm số dòng', () => {
    expect(() => docDongChamCong(raw(d('A', '2026-07-01')))).toThrow(/dòng 4/);
  });
});

describe('noiTenNhanVien', () => {
  const nhanVien = [
    { id: 'vta', name: 'Tuấn', ten_cham_cong: 'Vương Tuấn Anh' },
    { id: 'dvx', name: 'Xuân', ten_cham_cong: 'Đỗ Văn Xuân' },
    { id: 'hangkt', name: 'Hằng', ten_cham_cong: null },
  ];

  it('nối đúng theo ten_cham_cong', () => {
    const kq = noiTenNhanVien([{ tenExcel: 'Vương Tuấn Anh' }], nhanVien);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('vta');
    expect(kq.tenChuaBiet).toEqual([]);
  });

  it('bỏ qua khoảng trắng thừa hai đầu', () => {
    const kq = noiTenNhanVien([{ tenExcel: '  Đỗ Văn Xuân ' }], nhanVien);
    expect(kq.dongDaNoi[0].nhanVienId).toBe('dvx');
  });

  it('KHÔNG đoán: "Vương Tuấn Anh" không được tự khớp với tên gọi "Tuấn"', () => {
    const chuaKhaiBao = [{ id: 'vta', name: 'Tuấn', ten_cham_cong: null }];
    const kq = noiTenNhanVien([{ tenExcel: 'Vương Tuấn Anh' }], chuaKhaiBao);
    expect(kq.tenChuaBiet).toEqual(['Vương Tuấn Anh']);
    expect(kq.dongDaNoi[0].nhanVienId).toBeNull();
  });

  it('tên lạ gom vào tenChuaBiet, mỗi tên một lần dù nhiều dòng', () => {
    const kq = noiTenNhanVien(
      [{ tenExcel: 'Người Lạ' }, { tenExcel: 'Người Lạ' }, { tenExcel: 'Đỗ Văn Xuân' }],
      nhanVien);
    expect(kq.tenChuaBiet).toEqual(['Người Lạ']);
  });

  it('nhân viên chưa điền ten_cham_cong thì không nối nhầm vào ai', () => {
    const kq = noiTenNhanVien([{ tenExcel: 'Hằng' }], nhanVien);
    expect(kq.tenChuaBiet).toEqual(['Hằng']);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
npx vitest run src/lib/chamCongExcel.test.js
```

Kỳ vọng: **FAIL** — `Failed to resolve import "./chamCongExcel"`.

- [ ] **Step 3: Viết mã**

Tạo `src/lib/chamCongExcel.js`:

```js
// Đọc bảng chấm công của máy chấm công. Hàm THUẦN — không import supabase, không đụng DOM,
// cùng nếp kpiTuDong.js / kpiBangChung.js để test được không cần mạng lẫn trình duyệt.
//
// Logic này trước đây chỉ nằm trong scripts/import-cham-cong.mjs. Tách ra để màn hình nạp
// trong app và script dùng CHUNG một bản: hai bản parser sẽ trôi khỏi nhau và cho hai kết
// quả khác nhau từ cùng một tệp, mà không ai biết bản nào đúng.
//
// Cột nguồn: Tên nhân viên | Ngày | Thứ | Giờ in sáng | Giờ in chiều | Giờ out | Tăng ca
//            | Đi muộn (phút) | Về sớm (phút) | Nghỉ

// 'dd/MM/yyyy' → 'yyyy-MM-dd'. KHÔNG dùng new Date(): chuỗi dd/MM bị JS đọc thành MM/dd,
// nên 07/01 thành 1 tháng 7 thay vì 7 tháng 1 — sai lặng lẽ, không có lỗi nào báo.
function ngayISO(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// 'h:mm' → số phút. Cột tăng ca trong tệp là '1:27', không phải số.
// Rỗng trả null chứ không phải 0: "không có số liệu" khác hẳn "tăng ca 0 phút".
function phut(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = /^(\d+):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(Number(t)) ? Number(t) : null;
}

// 'HH:mm' → phút trong ngày, để so giờ out với giờ in chiều.
function gio(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Suy ra KỲ và NGÀY CẮT từ chính dữ liệu, không ai phải gõ tay.
//
// NGÀY CẮT = ngày CUỐI CÙNG có ít nhất một người quét vân tay (cột "Giờ in sáng").
// Máy chấm công xuất trọn tháng kể cả ngày chưa tới; những ngày đó không ai có giờ vào.
// Để nguyên thì mỗi ngày như vậy thành một ngày NGHỈ của cả 13 người, mà luật chuyên cần
// trừ 3 điểm mỗi ngày nghỉ vượt phép — nạp nhầm một tệp xuất giữa tháng là xoá sổ điểm
// chuyên cần của cả công ty.
//
// Quy tắc tự đúng cho cả hai trường hợp nên không cần ai nhớ chỉnh:
//   - tệp xuất giữa tháng → cắt ở ngày cuối thực sự có người đi làm
//   - tệp xuất hết tháng  → mọi ngày đều có người đi làm, lấy trọn tháng
export function suyRaKyVaNgayCat(dongTho = []) {
  const thang = new Map();
  let denNgay = null;
  for (const r of dongTho) {
    if (!r.ngay) continue;
    const k = r.ngay.slice(0, 7);
    thang.set(k, (thang.get(k) || 0) + 1);
    if (r.coGioVao && (denNgay === null || r.ngay > denNgay)) denNgay = r.ngay;
  }
  if (!thang.size) throw new Error('Tệp không có dòng dữ liệu nào đọc được.');

  // Lẫn nhiều tháng là bất thường (máy xuất lẫn, hoặc chọn sai khoảng). DỪNG chứ không
  // tự chọn tháng nhiều dòng nhất: đoán ở đây là xoá nhầm trọn một kỳ chấm công.
  if (thang.size > 1) {
    const ds = [...thang.entries()].map(([k, v]) => `${k} (${v} dòng)`).join(', ');
    throw new Error(`Tệp lẫn nhiều tháng: ${ds}. Xuất lại đúng MỘT tháng rồi thử lại.`);
  }
  if (!denNgay) {
    throw new Error('Không dòng nào có giờ vào — tệp rỗng hay sai cột?');
  }
  return { ky: [...thang.keys()][0], denNgay };
}

// `raw` = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
export function docDongChamCong(raw = []) {
  // Tìm dòng tiêu đề thay vì cắt cứng số dòng đầu: tệp xuất lại có thể thêm/bớt dòng ghi
  // chú, cắt cứng thì lệch một dòng là mất bản ghi đầu tiên mà không báo gì.
  const hdr = raw.findIndex(r => String(r?.[0] ?? '').trim() === 'Tên nhân viên');
  if (hdr < 0) {
    throw new Error('Không tìm thấy dòng tiêu đề "Tên nhân viên" — tệp có đúng định dạng không?');
  }

  const tho = [];
  for (let i = hdr + 1; i < raw.length; i++) {
    const r = raw[i];
    const tenExcel = String(r?.[0] ?? '').trim();
    if (!tenExcel) continue;
    const ngay = ngayISO(r[1]);
    if (!ngay) {
      throw new Error(`Ngày không đọc được ở dòng ${i + 1}: ${JSON.stringify(r[1])}`);
    }
    tho.push({ r, tenExcel, ngay, coGioVao: !!String(r[3] ?? '').trim() });
  }

  const { ky, denNgay } = suyRaKyVaNgayCat(tho);

  const dong = [];
  const canhBao = [];
  let boQuaNgaySau = 0;

  for (const { r, tenExcel, ngay } of tho) {
    if (ngay > denNgay) { boQuaNgaySau++; continue; }

    const inChieu = gio(r[4]);
    const out = gio(r[5]);
    let veSom = Number(r[8]) || 0;
    let nghiVan = null;

    // Máy ghi giờ ra SỚM HƠN lượt quét buổi chiều → người đó rõ ràng vẫn ở công ty, giờ
    // out bị lấy nhầm. Bản xuất T7 cũ có 9 dòng kiểu này, mỗi dòng ra "về sớm 330 phút".
    // Để nguyên thì luật chuyên cần trừ trọn 10 điểm, mà CHUYÊN CẦN BỘ PHẬN là điểm CHUNG
    // nên cả nhóm mất theo vì một lỗi máy. Bỏ phần về sớm và gắn cờ cho người soát.
    if (out !== null && inChieu !== null && out < inChieu && veSom > 0) {
      canhBao.push(`${tenExcel} ${r[1]}: giờ out ${r[5]} sớm hơn giờ in chiều ${r[4]} — bỏ ${veSom} phút về sớm`);
      veSom = 0;
      nghiVan = 'GIO_OUT_TRUOC_GIO_IN_CHIEU';
    }

    dong.push({
      tenExcel, ngay,
      thu: r[2] || null,
      inSang: r[3] || null, inChieu: r[4] || null, out: r[5] || null,
      tangCa: phut(r[6]),
      diMuon: Number(r[7]) || 0,
      veSom,
      nghi: String(r[9] ?? '').trim() !== '',
      nghiVan,
    });
  }

  return { dong, ky, denNgay, canhBao, boQuaNgaySau };
}

// Nối họ tên trong tệp với nhân viên qua cột `ten_cham_cong`.
//
// KHÔNG đoán bằng quy tắc "lấy chữ cuối họ tên": đúng 12/13 người, nhưng sai ở
// 'Vương Tuấn Anh' (tên gọi là 'Tuấn', chữ cuối là 'Anh'), và 'Nguyễn Xuân Thiện' chứa
// chữ 'Xuân' vốn là tên gọi của người KHÁC. Đoán sai ở đây là gán trọn tháng chấm công
// của người này sang người kia — không có lỗi nào báo, và điểm KPI hai người cùng sai.
export function noiTenNhanVien(dong = [], nhanVien = []) {
  const theoTen = new Map();
  for (const nv of nhanVien) {
    const t = String(nv?.ten_cham_cong ?? '').trim();
    if (t) theoTen.set(t, nv.id);
  }

  const chuaBiet = [];
  const dongDaNoi = dong.map(d => {
    const ten = String(d.tenExcel ?? '').trim();
    const nhanVienId = theoTen.get(ten) ?? null;
    if (!nhanVienId && !chuaBiet.includes(ten)) chuaBiet.push(ten);
    return { ...d, nhanVienId };
  });

  return { dongDaNoi, tenChuaBiet: chuaBiet };
}
```

- [ ] **Step 4: Chạy test để thấy nó qua**

```bash
npx vitest run src/lib/chamCongExcel.test.js
```

Kỳ vọng: **PASS** cả 17 test.

- [ ] **Step 5: Chạy toàn bộ test — không được làm hỏng chỗ khác**

```bash
npm test
```

Kỳ vọng: PASS hết (trước Task 1 là 795 test; giờ 795 + 17 = 812).

- [ ] **Step 6: Commit**

```bash
git add src/lib/chamCongExcel.js src/lib/chamCongExcel.test.js
git commit -m "feat(cham-cong): ham thuan doc file Excel cham cong"
```

---

## Task 2: SQL — cột `ten_cham_cong`

**Files:**
- Create: `sql/them_ten_cham_cong.sql`

- [ ] **Step 1: Tạo tệp SQL**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- CỘT `ten_cham_cong` — nối họ tên trong tệp máy chấm công với nhân viên (01/08/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao cần: `nhan_vien.name` là TÊN GỌI TẮT ('Tuấn'), còn máy chấm công xuất HỌ TÊN
-- ĐẦY ĐỦ ('Vương Tuấn Anh'). Không có cột nào nối được hai thứ đó, nên bảng ánh xạ
-- đang phải gõ cứng trong scripts/import-cham-cong.mjs — thuê người mới là phải sửa mã
-- và deploy lại.
--
-- Vì sao KHÔNG đoán bằng quy tắc: "lấy chữ cuối họ tên" đúng 12/13 người, nhưng sai ở
-- 'Vương Tuấn Anh', và 'Nguyễn Xuân Thiện' chứa chữ 'Xuân' vốn là tên gọi của người
-- khác (dvx). Đoán sai = gán trọn tháng chấm công sang nhầm người, không lỗi nào báo.
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table nhan_vien add column if not exists ten_cham_cong text;

-- Chỉ mục DUY NHẤT, không phải trang trí: hai nhân viên mang cùng một họ tên chấm công
-- thì màn hình nạp sẽ dồn hết dòng cho một người và người kia mất sạch — lỗi im lặng.
-- Ràng buộc ở CSDL làm chuyện đó không xảy ra được.
-- `where ... is not null` để nhiều người CHƯA khai báo vẫn cùng để null được.
create unique index if not exists nhan_vien_ten_cham_cong_uniq
  on nhan_vien (ten_cham_cong) where ten_cham_cong is not null;

-- Điền sẵn 13 người, chép từ MAP_NV trong scripts/import-cham-cong.mjs:27-41.
update nhan_vien set ten_cham_cong = v.ten
from (values
  ('ndp','Nguyễn Đình Phong'), ('ptt','Phùng Thị Thơ'), ('hhx','Hoàng Hà Xuyên'),
  ('admin','Đỗ Hương Nguyên'), ('nbn','Nguyễn Bá Ngọc'), ('vta','Vương Tuấn Anh'),
  ('dvx','Đỗ Văn Xuân'), ('nvh','Nguyễn Văn Hĩu'), ('nxt','Nguyễn Xuân Thiện'),
  ('nttd','Nguyễn Thị Thùy Dương'), ('nv8','Nguyễn Thị Duyên'), ('lvb','Lê Văn Bích'),
  ('ntth','Nguyễn Thị Thu Hà')
) as v(id, ten)
where nhan_vien.id = v.id
  and nhan_vien.ten_cham_cong is distinct from v.ten;

commit;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Đúng 13 người đã có họ tên chấm công:
select count(*) as da_khai_bao from nhan_vien where ten_cham_cong is not null;

-- 2) Xem đủ danh sách, đối chiếu mắt thường với tệp Excel:
select id, name, ten_cham_cong from nhan_vien
where ten_cham_cong is not null order by ten_cham_cong;

-- 3) Ai CHƯA khai báo (bình thường: hangkt, nva, test, TGD — không chấm công):
select id, name from nhan_vien where ten_cham_cong is null order by id;

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` rồi chạy
-- Để dạng chú thích có chủ đích: dán cả tệp để chạy phần kiểm tra thì không vô tình
-- hoàn tác luôn thứ vừa làm.
-- ════════════════════════════════════════════════════════════════════════════
-- drop index if exists nhan_vien_ten_cham_cong_uniq;
-- alter table nhan_vien drop column if exists ten_cham_cong;
```

- [ ] **Step 2: Commit** (chưa chạy — người điều phối chạy)

```bash
git add sql/them_ten_cham_cong.sql
git commit -m "sql(cham-cong): them cot ten_cham_cong de noi ho ten voi nhan vien"
```

---

## Task 3: SQL — hàm RPC `nap_cham_cong`

**Files:**
- Create: `sql/rpc_nap_cham_cong.sql`

- [ ] **Step 1: Tạo tệp SQL**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- HÀM NẠP CHẤM CÔNG — xoá kỳ cũ + nạp kỳ mới trong CÙNG một transaction (01/08/2026)
-- Chạy tay trên Supabase SQL Editor. Chạy lại nhiều lần đều an toàn.
--
-- Vì sao phải là một hàm chứ không gọi rời từ trình duyệt: PostgREST không mở được
-- transaction. Gọi `delete` rồi `insert` thành hai lệnh mà rớt mạng giữa chừng là cả kỳ
-- trống rỗng — điểm chuyên cần của 13 người về 0 và không ai biết vì sao. Postgres tự
-- bọc thân hàm trong một transaction, nên hoặc ăn cả, hoặc không đổi một ly nào.
--
-- ⚠⚠ TUYỆT ĐỐI KHÔNG THÊM `security definer` VÀO HÀM NÀY ⚠⚠
--   `security definer` bảo Postgres chạy hàm bằng quyền chủ sở hữu và BỎ QUA RLS. Lúc đó
--   người ngoài cầm khoá công khai — thứ nằm sẵn trong mã nguồn, Ctrl+U là thấy — xoá
--   sạch được cả bảng chấm công chỉ bằng một lệnh gọi.
--   Hàm để MẶC ĐỊNH (security invoker) thì vẫn chịu RLS. Đã đo 01/08/2026 bằng một hàm
--   nháp cùng hình dạng: gọi bằng khoá công khai → xoá được 0 dòng, dữ liệu còn nguyên.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function nap_cham_cong(p_ky text, p_dong jsonb)
returns jsonb
language plpgsql
-- search_path cố định: để người gọi không trỏ `cham_cong` sang bảng giả trong schema
-- của họ. Cùng nếp với các hàm khác trong dự án.
set search_path = public, pg_temp
as $$
declare so_xoa int; so_nap int;
begin
  -- Chặn sớm để câu lỗi ĐỌC HIỂU ĐƯỢC. RLS bên dưới mới là thứ thật sự chặn — dòng này
  -- chỉ để người dùng nhận "không có quyền" thay vì một lỗi RLS khó hiểu. Đừng nhầm nó
  -- là lớp bảo vệ duy nhất: xoá dòng này đi thì RLS vẫn chặn.
  if coalesce(auth.jwt() ->> 'nv_role', '') <> 'ADMIN' then
    return jsonb_build_object('loi', 'Chỉ tài khoản quản trị mới nạp được chấm công');
  end if;

  if p_ky is null or p_ky !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('loi', 'Kỳ không hợp lệ, phải dạng YYYY-MM');
  end if;

  delete from cham_cong where ky = p_ky;
  get diagnostics so_xoa = row_count;

  insert into cham_cong (ky, nhan_vien_id, ngay, thu, gio_in_sang, gio_in_chieu, gio_out,
                         tang_ca_phut, di_muon_phut, ve_som_phut, nghi, nghi_van)
  select p_ky, d.nhan_vien_id, d.ngay, d.thu, d.gio_in_sang, d.gio_in_chieu, d.gio_out,
         d.tang_ca_phut, d.di_muon_phut, d.ve_som_phut, d.nghi, d.nghi_van
  from jsonb_to_recordset(p_dong) as d(
    nhan_vien_id text, ngay date, thu text, gio_in_sang text, gio_in_chieu text,
    gio_out text, tang_ca_phut int, di_muon_phut int, ve_som_phut int,
    nghi boolean, nghi_van text);
  get diagnostics so_nap = row_count;

  return jsonb_build_object('so_xoa', so_xoa, 'so_nap', so_nap);
end $$;

-- Lớp thứ hai, không phải lớp duy nhất: Postgres mặc định cho `public` chạy hàm mới.
revoke execute on function nap_cham_cong(text, jsonb) from anon;

-- KIỂM TRA SAU KHI CHẠY
-- 1) Hàm KHÔNG được là security definer (kỳ vọng: prosecdef = false):
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'nap_cham_cong';

-- 2) `anon` KHÔNG chạy được (kỳ vọng: false):
select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_chay_duoc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'nap_cham_cong';

-- ════════════════════════════════════════════════════════════════════════════
-- HOÀN TÁC — bỏ dấu `--` rồi chạy
-- ════════════════════════════════════════════════════════════════════════════
-- drop function if exists nap_cham_cong(text, jsonb);
```

- [ ] **Step 2: Commit** (chưa chạy — người điều phối chạy)

```bash
git add sql/rpc_nap_cham_cong.sql
git commit -m "sql(cham-cong): ham RPC nap_cham_cong xoa+nap trong mot transaction"
```

---

## Task 4: So điểm chuyên cần trước/sau — `chamCongPreview.js`

**Files:**
- Create: `src/lib/chamCongPreview.js`, `src/lib/chamCongPreview.test.js`

**Điểm mấu chốt:** gọi thẳng `LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN` từ `kpiTuDong.js` — **không viết lại luật chấm**. Viết bản riêng cho màn hình xem trước là chắc chắn có ngày hai bản trôi khỏi nhau, và khi đó bảng xem trước nói dối đúng vào lúc người dùng tin nó nhất.

Chữ ký luật: `luat(ct, viec, sanXuat, chamCong)` → `{ tiLe, ghiChu, nhuongChamTay }`. Điểm = `(ct.chi_tieu ?? 0) × tiLe`. `tiLe === null` nghĩa là **không chấm** (chưa có dữ liệu), không phải 0 điểm.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/chamCongPreview.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { soSanhDiemChuyenCan } from './chamCongPreview';

const ct = nvId => ({
  id: `ct-${nvId}`, ma: 'CHUYEN_CAN_CA_NHAN', cap_do: 'CA_NHAN',
  nhan_vien_id: nvId, ky: '2026-07', chi_tieu: 10,
});
const cc = (nvId, ngay, muon = 0, nghi = false) => ({
  ky: '2026-07', nhan_vien_id: nvId, ngay, di_muon_phut: muon, ve_som_phut: 0, nghi,
});
const users = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }];

describe('soSanhDiemChuyenCan', () => {
  it('không muộn không nghỉ thì đủ điểm ở cả hai bên', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01')],
    });
    expect(kq).toHaveLength(1);
    expect(kq[0].diemTruoc).toBe(10);
    expect(kq[0].diemSau).toBe(10);
  });

  it('thêm ngày muộn nặng thì điểm sau tụt 5', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01'), cc('a', '2026-07-02', 30)],
    });
    expect(kq[0].diemTruoc).toBe(10);
    expect(kq[0].diemSau).toBe(5);
  });

  it('nghỉ vượt phép trừ 3 mỗi ngày, ngày phép đầu tiên không trừ', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01', 0, true)],
      chamCongMoi: [cc('a', '2026-07-01', 0, true), cc('a', '2026-07-02', 0, true),
                    cc('a', '2026-07-03', 0, true)],
    });
    expect(kq[0].diemTruoc).toBe(10);   // nghỉ 1 ngày = trong phép
    expect(kq[0].diemSau).toBe(4);      // nghỉ 3, vượt 2 ngày → −6
  });

  it('ngày được miễn trừ (có giải trình) KHÔNG bị tính trừ', () => {
    const chung = { ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01')] };
    const moi = [cc('a', '2026-07-01'), cc('a', '2026-07-02', 30)];
    const khongMien = soSanhDiemChuyenCan({ ...chung, chamCongMoi: moi });
    const coMien = soSanhDiemChuyenCan({ ...chung, chamCongMoi: moi,
      ngoaiLe: [{ nhan_vien_id: 'a', ngay: '2026-07-02', ly_do: 'đi công tác' }] });
    expect(khongMien[0].diemSau).toBe(5);
    expect(coMien[0].diemSau).toBe(10);
  });

  it('người KHÔNG có chỉ tiêu chuyên cần thì bỏ khỏi bảng, không hiện 0 điểm', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [cc('a', '2026-07-01'), cc('b', '2026-07-01')],
      chamCongMoi: [cc('a', '2026-07-01'), cc('b', '2026-07-01')],
    });
    expect(kq.map(x => x.nhanVienId)).toEqual(['a']);
  });

  it('chưa có dữ liệu cũ thì diemTruoc là null (chưa chấm), KHÔNG phải 0', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [],
      chamCongMoi: [cc('a', '2026-07-01')],
    });
    expect(kq[0].diemTruoc).toBeNull();
    expect(kq[0].diemSau).toBe(10);
  });

  it('lấy tên hiển thị từ users, không có thì lùi về id', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a'), ct('z')], users,
      chamCongCu: [], chamCongMoi: [cc('a', '2026-07-01'), cc('z', '2026-07-01')],
    });
    expect(kq.find(x => x.nhanVienId === 'a').ten).toBe('An');
    expect(kq.find(x => x.nhanVienId === 'z').ten).toBe('z');
  });

  it('chỉ lấy dòng đúng kỳ, bỏ dòng kỳ khác lọt vào', () => {
    const kq = soSanhDiemChuyenCan({
      ky: '2026-07', ctRows: [ct('a')], users,
      chamCongCu: [],
      chamCongMoi: [cc('a', '2026-07-01'),
                    { ...cc('a', '2026-08-01', 30), ky: '2026-08' }],
    });
    expect(kq[0].diemSau).toBe(10);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
npx vitest run src/lib/chamCongPreview.test.js
```

Kỳ vọng: **FAIL** — `Failed to resolve import "./chamCongPreview"`.

- [ ] **Step 3: Viết mã**

Tạo `src/lib/chamCongPreview.js`:

```js
// Dựng bảng "điểm chuyên cần trước / sau khi nạp" cho màn hình nạp chấm công.
// Hàm THUẦN — không import supabase, nơi gọi tự tải dữ liệu rồi truyền vào.
//
// GỌI THẲNG LUẬT THẬT (LUAT_TU_DONG.CHUYEN_CAN_CA_NHAN), không viết lại. Viết một bản
// riêng cho màn hình xem trước là chắc chắn có ngày hai bản trôi khỏi nhau — và khi đó
// bảng xem trước nói dối đúng vào lúc người dùng tin nó nhất, tức lúc sắp bấm Xác nhận.
import { LUAT_TU_DONG } from './kpiTuDong';

const MA = 'CHUYEN_CAN_CA_NHAN';

// Gắn cờ `mien` cho ngày đã có giải trình, y như apDungChamTuDong làm (kpiTuDong.js).
// Bỏ bước này thì ngày được miễn vẫn bị tính trừ, và con số xem trước lệch với con số
// thật mà người dùng thấy sau khi nạp.
function locVaGanMien(chamCong, nvId, ky, mienSet) {
  return (chamCong || [])
    .filter(c => c?.nhan_vien_id === nvId && String(c.ky || '') === ky)
    .map(c => (mienSet.has(`${c.nhan_vien_id}|${c.ngay}`) ? { ...c, mien: true } : c));
}

// Điểm của một người từ một tập dòng chấm công. `tiLe === null` nghĩa là KHÔNG CHẤM
// (chưa có dữ liệu) — trả null chứ không phải 0, vì "chưa có căn cứ" khác hẳn "0 điểm".
function diemTu(ct, cc) {
  const kq = LUAT_TU_DONG[MA](ct, [], [], cc);
  if (!kq || kq.tiLe == null) return null;
  return Math.round((Number(ct.chi_tieu) || 0) * kq.tiLe * 10) / 10;
}

// → [{ nhanVienId, ten, chiTieu, diemTruoc, diemSau }] — chỉ những người CÓ chỉ tiêu
// chuyên cần cá nhân trong kỳ. Người không có thì bỏ hẳn khỏi bảng: hiện họ với 0 điểm
// là nói rằng họ đang mất điểm, trong khi họ vốn không bị chấm chỉ tiêu này.
export function soSanhDiemChuyenCan({
  ky, ctRows = [], users = [], chamCongCu = [], chamCongMoi = [], ngoaiLe = [],
} = {}) {
  const mienSet = new Set((ngoaiLe || []).map(x => `${x.nhan_vien_id}|${x.ngay}`));
  const tenCua = id => users.find(u => u.id === id)?.name || id;

  return (ctRows || [])
    .filter(ct => ct?.ma === MA && ct.cap_do === 'CA_NHAN' && ct.nhan_vien_id)
    .map(ct => {
      const nvId = ct.nhan_vien_id;
      return {
        nhanVienId: nvId,
        ten: tenCua(nvId),
        chiTieu: Number(ct.chi_tieu) || 0,
        diemTruoc: diemTu(ct, locVaGanMien(chamCongCu, nvId, ky, mienSet)),
        diemSau: diemTu(ct, locVaGanMien(chamCongMoi, nvId, ky, mienSet)),
      };
    })
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}
```

- [ ] **Step 4: Chạy test để thấy nó qua**

```bash
npx vitest run src/lib/chamCongPreview.test.js
```

Kỳ vọng: **PASS** cả 8 test.

Nếu test "ngày được miễn trừ" đỏ: kiểm lại `luatChuyenCanCaNhan` trong `kpiTuDong.js` đọc cờ tên gì (`c.mien`), và cờ đó có được gắn trước khi truyền vào không.

- [ ] **Step 5: Chạy toàn bộ test**

```bash
npm test
```

Kỳ vọng: PASS hết (812 + 8 = 820).

- [ ] **Step 6: Commit**

```bash
git add src/lib/chamCongPreview.js src/lib/chamCongPreview.test.js
git commit -m "feat(cham-cong): bang diem chuyen can truoc/sau, dung lai luat that"
```

---

## Task 5: Màn hình nạp — `NapChamCong.jsx`

**Files:**
- Create: `src/pages/tasks/NapChamCong.jsx`

Không có test JSX trong dự án — kiểm bằng build + mắt người ở Task 7.

- [ ] **Step 1: Tạo tệp**

```jsx
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { docDongChamCong, noiTenNhanVien } from '../../lib/chamCongExcel';
import { soSanhDiemChuyenCan } from '../../lib/chamCongPreview';
import { X, Upload, AlertTriangle, Check, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Nạp chấm công từ tệp Excel của máy chấm công. Bốn bước một chiều:
//   chọn tệp → nối tên lạ (nếu có) → xem trước → xác nhận ghi.
//
// Ghi bằng MỘT lệnh rpc('nap_cham_cong'): PostgREST không mở được transaction, gọi
// delete rồi insert thành hai lệnh mà rớt mạng giữa chừng là cả kỳ trống rỗng và điểm
// chuyên cần 13 người về 0. Hàm trong CSDL thì Postgres tự bọc transaction.
// ─────────────────────────────────────────────────────────────────────────────

const SHEET = 'CHI TIẾT THEO NGÀY';

const so1 = v => (v == null ? '—' : String(Math.round(v * 10) / 10));

export default function NapChamCong({ users = [], onXong, onDong }) {
  const [buoc, setBuoc] = useState('chon');      // chon | noiTen | xemTruoc | dangGhi | xong
  const [loi, setLoi] = useState('');
  const [ketQua, setKetQua] = useState(null);    // { dong, ky, denNgay, canhBao, boQuaNgaySau }
  const [chuaBiet, setChuaBiet] = useState([]);  // tên trong Excel chưa nối được
  const [ganCho, setGanCho] = useState({});      // tenExcel → nhan_vien_id
  const [nhanVien, setNhanVien] = useState([]);
  const [bangDiem, setBangDiem] = useState([]);
  const [soXoaDuKien, setSoXoaDuKien] = useState(0);
  const [dongDaNoi, setDongDaNoi] = useState([]);
  const [ketThuc, setKetThuc] = useState(null);  // { so_xoa, so_nap }

  async function chonTep(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoi(''); setKetQua(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[SHEET];
      if (!ws) throw new Error(`Không thấy sheet "${SHEET}" trong tệp. Xuất lại từ máy chấm công.`);
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const kq = docDongChamCong(raw);

      const { data: dsNv, error } = await supabase
        .from('nhan_vien').select('id, name, ten_cham_cong').order('id');
      if (error) throw error;
      setNhanVien(dsNv || []);

      const noi = noiTenNhanVien(kq.dong, dsNv || []);
      setKetQua(kq);
      setDongDaNoi(noi.dongDaNoi);
      if (noi.tenChuaBiet.length) { setChuaBiet(noi.tenChuaBiet); setBuoc('noiTen'); }
      else await dungXemTruoc(kq, noi.dongDaNoi);
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }

  // Ghi ánh xạ vừa chọn xuống nhan_vien để LẦN SAU tự nhận, rồi nối lại.
  async function luuGanTen() {
    setLoi('');
    try {
      for (const [ten, nvId] of Object.entries(ganCho)) {
        if (!nvId) throw new Error(`Chưa chọn ai cho "${ten}".`);
        const { error } = await supabase
          .from('nhan_vien').update({ ten_cham_cong: ten }).eq('id', nvId).select();
        if (error) throw error;
      }
      const { data: dsNv } = await supabase
        .from('nhan_vien').select('id, name, ten_cham_cong').order('id');
      setNhanVien(dsNv || []);
      const noi = noiTenNhanVien(ketQua.dong, dsNv || []);
      if (noi.tenChuaBiet.length) {
        throw new Error(`Vẫn còn tên chưa nối: ${noi.tenChuaBiet.join(', ')}`);
      }
      setDongDaNoi(noi.dongDaNoi);
      await dungXemTruoc(ketQua, noi.dongDaNoi);
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }

  async function dungXemTruoc(kq, dsDong) {
    const [ccCu, ctRows, ngoaiLe] = await Promise.all([
      fetchAllRows(() => supabase.from('cham_cong').select('*').eq('ky', kq.ky).order('id')),
      fetchAllRows(() => supabase.from('kpi_chi_tieu').select('*').eq('ky', kq.ky).order('id')),
      fetchAllRows(() => supabase.from('chuyen_can_ngoai_le').select('*').eq('ky', kq.ky).order('id')),
    ]);
    // fetchAllRows TRẢ { data, error } chứ không ném — bỏ qua `error` thì một lỗi tải
    // thành mảng rỗng, và bảng xem trước hiện "trước = đủ điểm" cho cả 13 người. Đó đúng
    // là loại số sai âm thầm mà màn hình này sinh ra để chặn, nên phải dừng hẳn.
    const loiTai = ccCu.error || ctRows.error || ngoaiLe.error;
    if (loiTai) throw new Error(`Không đọc được dữ liệu hiện tại: ${loiTai.message || loiTai}`);

    const chamCongMoi = dsDong.map(d => ({
      ky: kq.ky, nhan_vien_id: d.nhanVienId, ngay: d.ngay,
      di_muon_phut: d.diMuon, ve_som_phut: d.veSom, nghi: d.nghi,
    }));
    setSoXoaDuKien((ccCu.data || []).length);
    setBangDiem(soSanhDiemChuyenCan({
      ky: kq.ky, ctRows: ctRows.data || [], users,
      chamCongCu: ccCu.data || [], chamCongMoi, ngoaiLe: ngoaiLe.data || [],
    }));
    setBuoc('xemTruoc');
  }

  async function ghi() {
    setBuoc('dangGhi'); setLoi('');
    try {
      const p_dong = dongDaNoi.map(d => ({
        nhan_vien_id: d.nhanVienId, ngay: d.ngay, thu: d.thu,
        gio_in_sang: d.inSang, gio_in_chieu: d.inChieu, gio_out: d.out,
        tang_ca_phut: d.tangCa, di_muon_phut: d.diMuon, ve_som_phut: d.veSom,
        nghi: d.nghi, nghi_van: d.nghiVan,
      }));
      const { data, error } = await supabase.rpc('nap_cham_cong', { p_ky: ketQua.ky, p_dong });
      if (error) throw error;
      if (data?.loi) throw new Error(data.loi);
      setKetThuc(data);
      setBuoc('xong');
      onXong?.();
    } catch (err) {
      setLoi(err?.message || String(err));
      setBuoc('xemTruoc');
    }
  }

  return (
    <div onClick={onDong} style={nen}>
      <div onClick={e => e.stopPropagation()} style={hop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>Nạp chấm công từ Excel</div>
          <button onClick={onDong} style={nutPhu}><X size={14} /></button>
        </div>

        {loi && (
          <div style={khungLoi}><AlertTriangle size={14} /> {loi}</div>
        )}

        {buoc === 'chon' && (
          <div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 10 }}>
              Chọn tệp Excel xuất từ máy chấm công (sheet “{SHEET}”). App tự nhận ra kỳ và
              tự bỏ những ngày chưa ai đi làm.
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={chonTep} style={{ fontSize: '0.8rem' }} />
          </div>
        )}

        {buoc === 'noiTen' && (
          <div>
            <div style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: 10 }}>
              Có {chuaBiet.length} tên trong tệp app chưa biết là ai. Chọn giúp — lần sau app tự nhận.
            </div>
            {chuaBiet.map(ten => (
              <div key={ten} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{ten}</div>
                <select
                  value={ganCho[ten] || ''}
                  onChange={e => setGanCho({ ...ganCho, [ten]: e.target.value })}
                  style={{ ...oInput, width: 180 }}
                >
                  <option value="">— chọn nhân viên —</option>
                  {nhanVien.filter(nv => !nv.ten_cham_cong).map(nv => (
                    <option key={nv.id} value={nv.id}>{nv.name} ({nv.id})</option>
                  ))}
                </select>
              </div>
            ))}
            <button onClick={luuGanTen} style={{ ...nutChinh, marginTop: 10 }}>Lưu và xem trước</button>
          </div>
        )}

        {(buoc === 'xemTruoc' || buoc === 'dangGhi') && ketQua && (
          <div>
            <div style={khungTin}>
              <b>Kỳ {ketQua.ky}</b> · {ketQua.dong.length} dòng · {new Set(dongDaNoi.map(d => d.nhanVienId)).size} người
              · đến hết ngày {ketQua.denNgay}
              {ketQua.boQuaNgaySau > 0 && <> · bỏ {ketQua.boQuaNgaySau} dòng của ngày chưa ai đi làm</>}
              <div style={{ marginTop: 4 }}>
                Sẽ xoá {soXoaDuKien} dòng cũ của kỳ này rồi nạp {ketQua.dong.length} dòng mới.
              </div>
            </div>

            {ketQua.canhBao.length > 0 && (
              <div style={khungCanhBao}>
                <b>{ketQua.canhBao.length} dòng giờ ra bất thường</b> — đã bỏ phần về sớm:
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {ketQua.canhBao.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}
                  {ketQua.canhBao.length > 5 && <li>…và {ketQua.canhBao.length - 5} dòng nữa</li>}
                </ul>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: '0.82rem', margin: '12px 0 6px' }}>
              Điểm chuyên cần cá nhân sẽ đổi thế nào
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={th}>Nhân viên</th><th style={th}>Trước</th><th style={th}>Sau</th><th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {bangDiem.map(d => {
                    const lech = d.diemTruoc == null || d.diemSau == null ? null : d.diemSau - d.diemTruoc;
                    const mau = lech == null || lech === 0 ? '#64748b' : lech > 0 ? '#047857' : '#b91c1c';
                    return (
                      <tr key={d.nhanVienId}>
                        <td style={td}>{d.ten}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{so1(d.diemTruoc)}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: mau }}>{so1(d.diemSau)}</td>
                        <td style={{ ...td, textAlign: 'center', color: mau, fontWeight: 700 }}>
                          {lech == null || lech === 0 ? '' : lech > 0 ? `▲ +${so1(lech)}` : `▼ ${so1(lech)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
              Chuyên cần BỘ PHẬN (một điểm chung cả nhóm) cũng đổi theo, không xếp trong bảng này.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={ghi} disabled={buoc === 'dangGhi'} style={nutChinh}>
                {buoc === 'dangGhi'
                  ? <><Loader2 size={13} /> Đang ghi…</>
                  : <><Upload size={13} /> Xác nhận nạp</>}
              </button>
              <button onClick={onDong} disabled={buoc === 'dangGhi'} style={nutPhu}>Huỷ</button>
            </div>
          </div>
        )}

        {buoc === 'xong' && ketThuc && (
          <div style={khungXong}>
            <Check size={16} /> Đã nạp xong kỳ {ketQua.ky}: xoá {ketThuc.so_xoa} dòng cũ, nạp {ketThuc.so_nap} dòng mới.
            <button onClick={onDong} style={{ ...nutChinh, marginTop: 10 }}>Đóng</button>
          </div>
        )}
      </div>
    </div>
  );
}

const nen = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
};
const hop = {
  background: '#fff', borderRadius: 12, padding: '1rem 1.1rem',
  width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
};
const oInput = {
  padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: '0.8rem', boxSizing: 'border-box', background: '#fff',
};
const nutChinh = {
  padding: '0.45rem 0.8rem', borderRadius: 8, border: 'none', background: '#2563eb',
  color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const nutPhu = {
  padding: '0.45rem 0.8rem', borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', fontSize: '0.8rem', cursor: 'pointer',
};
const khungLoi = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fef2f2', color: '#b91c1c',
  fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
};
const khungTin = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8',
  fontSize: '0.78rem',
};
const khungCanhBao = {
  padding: '0.5rem 0.7rem', borderRadius: 8, background: '#fffbeb', color: '#b45309',
  fontSize: '0.75rem', marginTop: 8,
};
const khungXong = {
  padding: '0.6rem 0.7rem', borderRadius: 8, background: '#f0fdf4', color: '#047857',
  fontSize: '0.82rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
};
const th = {
  padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left',
  fontSize: '0.72rem', color: '#64748b', background: '#f8fafc', position: 'sticky', top: 0,
};
const td = { padding: '0.35rem 0.5rem', borderBottom: '1px solid #f1f5f9' };
```

- [ ] **Step 2: Lint + build**

```bash
npm run lint
```
Nền có 92 lỗi cũ ở CÁC TỆP KHÁC — không được thêm lỗi nào ở tệp vừa tạo.

```bash
npm run build
```
Kỳ vọng: `built in …`, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/pages/tasks/NapChamCong.jsx
git commit -m "feat(cham-cong): man hinh nap cham cong tu Excel"
```

---

## Task 6: Gắn nút vào tab Chấm công

**Files:**
- Modify: `src/pages/tasks/ChamCongTab.jsx` (chú thích đầu tệp; import; state; nút; render)

- [ ] **Step 1: Sửa chú thích đầu tệp**

Chú thích hiện tại (dòng 5-9) nói màn hình này CHỈ ĐỌC và dữ liệu chỉ vào bằng script — sắp không còn đúng. Thay đoạn đó bằng:

```jsx
// ─────────────────────────────────────────────────────────────────────────────
// Xem bảng chấm công gốc (dữ liệu máy chấm công) — căn cứ của 2 chỉ tiêu chuyên cần
// trong KPI. Chủ app trước đây phải vào Supabase mới xem được, nhân viên không có chỗ
// nào để tự tra vì sao mình bị trừ điểm.
//
// Không sửa được từng ô: dữ liệu vào TRỌN KỲ một lần, qua nút "Nạp từ Excel"
// (NapChamCong.jsx) hoặc scripts/import-cham-cong.mjs. Cả hai dùng chung bộ hàm đọc
// tệp ở src/lib/chamCongExcel.js.
// ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Thêm import**

Sau dòng `import { supabase, fetchAllRows } from '../../lib/supabase';` thêm:

```jsx
import NapChamCong from './NapChamCong';
```

Và thêm `Upload` vào danh sách icon đang nhập từ `lucide-react`:

```jsx
import { ChevronLeft, AlertTriangle, Loader2, Upload } from 'lucide-react';
```

- [ ] **Step 3: Thêm state**

Ngay sau `const [chon, setChon] = useState(null);` thêm:

```jsx
  const [moNap, setMoNap] = useState(false);
```

- [ ] **Step 4: Thêm nút và popup**

Đặt nút cạnh ô chọn kỳ ở đầu màn hình (tìm khối chứa `value={ky}`), thêm ngay sau nó:

```jsx
        {canEdit && (
          <button onClick={() => setMoNap(true)} style={nutNap}>
            <Upload size={13} style={{ verticalAlign: 'middle' }} /> Nạp từ Excel
          </button>
        )}
```

Trước thẻ đóng ngoài cùng của component, thêm:

```jsx
      {moNap && (
        <NapChamCong
          users={users}
          onXong={taiDuLieu}
          onDong={() => setMoNap(false)}
        />
      )}
```

Thêm style cạnh các style khác ở cuối tệp:

```jsx
const nutNap = {
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #bfdbfe',
  background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '0.78rem',
  cursor: 'pointer', whiteSpace: 'nowrap',
};
```

Nếu hàm tải dữ liệu trong tệp không tên `taiDuLieu`, dùng đúng tên đang có — mục đích là tải lại bảng sau khi nạp xong.

- [ ] **Step 5: Lint + build + test**

```bash
npm run lint
npm run build
npm test
```

Kỳ vọng: lint không thêm lỗi mới; build xong; test vẫn 820 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/tasks/ChamCongTab.jsx
git commit -m "feat(cham-cong): nut Nap tu Excel trong tab Cham cong"
```

---

## Task 7: Chạy SQL, kiểm bảo mật, bàn giao

**Files:** không sửa mã.

- [ ] **Step 1: Chạy hai tệp SQL trên Supabase**

Chạy `sql/them_ten_cham_cong.sql` (phần `begin…commit`), rồi 3 câu kiểm tra. Kỳ vọng: 13 người có `ten_cham_cong`; danh sách khớp tệp Excel; người chưa khai báo là `hangkt`, `nva`, `test`, `TGD`.

Chạy `sql/rpc_nap_cham_cong.sql`, rồi 2 câu kiểm tra. Kỳ vọng: `prosecdef = false`, `anon_chay_duoc = false`.

- [ ] **Step 2: Chạy skill kiểm tra bảo mật**

```
Skill: kiem-tra-bao-mat-du-lieu
```

Bốn phép BẮT BUỘC đo, chép từ spec:
1. Khoá công khai gọi `nap_cham_cong` → bị chặn, và `cham_cong` **không đổi một dòng nào** (đếm trước/sau).
2. Tài khoản đã đăng nhập nhưng **không phải ADMIN** → cũng bị chặn.
3. `select proname, prosecdef from pg_proc where proname='nap_cham_cong'` → `false`.
4. Khoá công khai đọc `nhan_vien` → 0 dòng (cột `ten_cham_cong` là họ tên người thật).

Nói thẳng phần nào chưa đo được và vì sao.

- [ ] **Step 3: Thử thật bằng tệp tháng 7**

Đăng nhập app bằng tài khoản quản trị → **Công việc → Chấm công → Nạp từ Excel** → chọn
`C:/Users/PC/Desktop/3. Cải tiến/12. Wepapp/Xử lý bảng chấm công/Thống kê chấm công T7.2026.xlsx`.

Kỳ vọng:
- Không hỏi nối tên nào (13 người đã điền ở Step 1).
- Tổng quan: kỳ 2026-07, 388 dòng, 13 người, đến hết ngày 2026-07-31, bỏ 0 dòng.
- "Sẽ xoá 388 dòng cũ rồi nạp 388 dòng mới."
- Bảng điểm: **mọi người đều 0 chênh lệch** — vì dữ liệu hiện tại đã nạp đúng từ chính tệp này hôm nay. Có ai lệch nghĩa là hàm đọc tệp trong app khác với script, dừng lại tìm nguyên nhân.
- Bấm Xác nhận → "xoá 388 dòng cũ, nạp 388 dòng mới".

Sau đó kiểm lại trong CSDL:

```sql
select count(*) so_dong, count(distinct nhan_vien_id) so_nguoi,
       min(ngay) dau, max(ngay) cuoi, sum(di_muon_phut) tong_muon
from cham_cong where ky = '2026-07';
```
Kỳ vọng: `388 | 13 | 2026-07-01 | 2026-07-31 | 621`.

Con số `tong_muon` phải khớp đúng — lệch nghĩa là đường nạp trong app làm sai dữ liệu.

- [ ] **Step 4: Viết bàn giao**

Tạo mục mới trong `BAN-GIAO-01-08-2026.md` ghi đúng bốn điều:
1. Tab Chấm công có nút "Nạp từ Excel" — chọn tệp, xem trước, xác nhận. Không cần terminal.
2. Bảng xem trước cho biết **ai tăng ai giảm điểm chuyên cần** trước khi ghi.
3. Thuê người mới: điền `ten_cham_cong` — hoặc cứ nạp, app sẽ hỏi và tự nhớ.
4. Script `scripts/import-cham-cong.mjs` **vẫn còn**, dùng được như cũ.

- [ ] **Step 5: Commit + nhắc deploy**

```bash
git add BAN-GIAO-01-08-2026.md
git commit -m "docs(ban-giao): man hinh nap cham cong trong app"
```

Nhắc: deploy bằng **kéo-thả `dist`** lên Netlify, không build trên Netlify. **SQL phải chạy TRƯỚC khi deploy** — bản mới gọi `nap_cham_cong`, chưa có hàm thì nút báo lỗi.

---

## Tự soát plan (đã chạy)

| Mục spec | Task |
|---|---|
| A. Cột `ten_cham_cong` + chỉ mục duy nhất + điền 13 người | Task 2 |
| B. `docDongChamCong` / `suyRaKyVaNgayCat` / `noiTenNhanVien` | Task 1 |
| B. Cảnh báo giờ out bất thường | Task 1 Step 1 (test), Step 3 (mã) |
| C. Màn hình 4 bước | Task 5 |
| C. Bảng trước/sau dùng lại luật thật, gắn cờ `mien`, bỏ người không có chỉ tiêu | Task 4 |
| D. RPC xoá+nạp một transaction, KHÔNG `SECURITY DEFINER`, revoke anon | Task 3 |
| E. Test `chamCongExcel` | Task 1 |
| Nút trong tab Chấm công | Task 6 |
| Bảo mật (4 phép đo) | Task 7 Step 2 |

Tên dùng xuyên suốt: `docDongChamCong` · `suyRaKyVaNgayCat` · `noiTenNhanVien` · `soSanhDiemChuyenCan` · `nap_cham_cong(p_ky, p_dong)` · trường `nhanVienId` / `tenExcel` / `diemTruoc` / `diemSau`. Không có placeholder; mọi bước sửa mã đều kèm mã thật.
