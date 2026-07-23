# Bảng chấm chung KPI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm màn hình "Bảng chấm chung" — ma trận dòng = chỉ tiêu, cột = nhân viên — để chấm một lượt các chỉ tiêu ai cũng có, điểm và lý do chảy thẳng vào bảng KPI cá nhân.

**Architecture:** Hai cột mới trên `kpi_chi_tieu` (`ma` định danh chỉ tiêu, `cham_chung` bật/tắt). Logic gom ma trận là hàm thuần trong `src/lib/kpiBangChung.js` (test bằng vitest, không import supabase). Giao diện là file riêng `src/pages/tasks/KpiBangChung.jsx`; `KpiTab.jsx` chỉ thêm nút mở và khoá dòng đã chấm chung. Engine `kpiEngine.js` **không đổi** — bảng chung chỉ ghi `diem_chot` và một dòng nhật ký `so_diem = 0`, hai thứ engine đã biết tính.

**Tech Stack:** React 19 (JSX), Supabase JS, vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-23-kpi-bang-cham-chung-design.md`

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `sql/them_ma_va_cham_chung_kpi.sql` | Tạo (mới) — 2 cột mới + 53 mã + bật 4 chỉ tiêu + sửa `tao_ky_kpi`. Chạy tay trên Supabase |
| `src/lib/kpiBangChung.js` | Tạo (mới) — hàm thuần: danh sách nhân viên, ma trận, danh sách chỉ tiêu thêm được, luật lý do |
| `src/lib/kpiBangChung.test.js` | Tạo (mới) — test hàm thuần |
| `src/pages/tasks/KpiBangChung.jsx` | Tạo (mới) — giao diện bảng + ô chấm + popup thêm chỉ tiêu |
| `src/pages/tasks/KpiTab.jsx` | Sửa — nút mở màn hình, nhãn "chấm ở bảng chung", ẩn nút chốt tay |
| `scripts/import-kpi-excel.mjs` | Sửa — sinh thêm cột `ma` khi import kỳ mới |

Quy ước sẵn có của repo phải tuân theo:
- Mọi lệnh GHI vào `kpi_chi_tieu` / `kpi_nhat_ky` phải kèm `.select()` rồi đưa qua `loiGhiKpi(error, data)` — không có nó thì RLS lọc sạch dòng mà app vẫn báo "đã lưu" (xem `src/lib/kpiWriteGuard.js`).
- Tên biến, comment, chuỗi hiển thị viết tiếng Việt như các file KPI hiện có.

---

## Task 1: Migration SQL

**Files:**
- Create: `sql/them_ma_va_cham_chung_kpi.sql`

- [ ] **Step 1: Viết file SQL**

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- BẢNG CHẤM CHUNG KPI — thêm cột `ma` + `cham_chung` vào kpi_chi_tieu
-- Dán toàn bộ vào Supabase SQL Editor, bấm Run. Chạy lại nhiều lần đều an toàn.
--
-- `ma`         : định danh chỉ tiêu. Cùng tên chỉ tiêu → cùng mã, ở mọi nhân viên,
--                mọi kỳ. Bảng chấm chung gom dòng theo mã này chứ không theo tên,
--                nên sau này đổi tên chỉ tiêu bảng chung vẫn không vỡ.
-- `cham_chung` : true = chỉ tiêu nhập điểm ở màn hình Bảng chấm chung. Bật/tắt cho
--                TẤT CẢ dòng cùng mã trong cùng kỳ, không bật lẻ một người.
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table kpi_chi_tieu add column if not exists ma text;
alter table kpi_chi_tieu add column if not exists cham_chung boolean not null default false;

-- Index một phần: chỉ đánh dấu các dòng đang chấm chung (vài chục dòng trên vài trăm).
create index if not exists kpi_chi_tieu_cham_chung_idx
  on kpi_chi_tieu (ky, ma) where cham_chung;

-- ── Điền mã cho toàn bộ chỉ tiêu đang có (cả kỳ 2026-06 lẫn 2026-07) ─────────
-- `and c.ma is null`: chạy lần hai không đè lên mã đã sửa tay.
-- Hai dòng HOTLINE CẢ TEAM có 2 tên khác nhau (tháng 7 đổi tên, tháng 6 giữ tên cũ)
-- nhưng là CÙNG một chỉ tiêu nên cùng mã.
with anh_xa(ten, ma) as (values
  ('5S', '5S'),
  ('BÁO CÁO CHI TIẾT HÀNG KHO CHỜ XỬ LÝ', 'BC_HANG_KHO_CHO_XU_LY'),
  ('BÁO CÁO KẾT QUẢ CÔNG VIỆC', 'BC_KET_QUA_CONG_VIEC'),
  ('BÁO CÁO KẾT QUẢ CÔNG VIỆC BẢO HÀNH', 'BC_KET_QUA_CV_BH'),
  ('BÁO CÁO PHÂN TÍCH BẢO HÀNH', 'BC_PHAN_TICH_BH'),
  ('BÁO CÁO PHÂN TÍCH SẢN XUẤT', 'BC_PHAN_TICH_SX'),
  ('CHUYÊN CẦN BỘ PHẬN', 'CHUYEN_CAN_BO_PHAN'),
  ('CHUYÊN CẦN CÁ NHÂN', 'CHUYEN_CAN_CA_NHAN'),
  ('CHUYỂN TRẠNG THÁI ĐƠN HÀNG EUROMADE TỰ GIAO', 'CHUYEN_TT_DON_TU_GIAO'),
  ('CHẤM KPI', 'CHAM_KPI'),
  ('CHỨNG TỪ NHẬP XUẤT', 'CHUNG_TU_NHAP_XUAT'),
  ('CỘNG THÊM NGOÀI TRỌNG SỐ', 'CONG_THEM_NGOAI_TRONG_SO'),
  ('DEADLINE', 'DEADLINE'),
  ('DEADLINE BÁO CÁO HÀNG NGÀY+ DEADLINE CÔNG VIỆC KHÁC', 'DEADLINE_BC_HANG_NGAY'),
  ('DÙNG XE ĐÚNG QUY ĐỊNH', 'DUNG_XE_DUNG_QUY_DINH'),
  ('GỬI BẢNG ĐĂNG KÝ HIỆU SUẤT', 'GUI_BANG_DK_HIEU_SUAT'),
  ('GỬI ĐÁNH GIÁ CUỘC GỌI BH CỦA TPKT VÀ GĐKT', 'GUI_DG_CUOC_GOI_BH'),
  ('HOÀN THÀNH CÔNG VIỆC ĐÚNG THỜI HẠN', 'HT_CONG_VIEC_DUNG_HAN'),
  ('HOÀN THÀNH ĐƠN BẢO HÀNH', 'HT_DON_BAO_HANH'),
  ('KIỂM SOÁT CHẤT LƯỢNG', 'KIEM_SOAT_CHAT_LUONG'),
  ('KIỂM SOÁT THỜI GIAN CHUYỂN MÁY Ở HÀNG CHỜ XỬ LÝ VỀ MÁY MỚI ĐỂ BÁN', 'KS_THOI_GIAN_CHUYEN_MAY'),
  ('LÀM SỔ KHO', 'LAM_SO_KHO'),
  ('LÀM ĐỀ XUẤT ĐẶT HÀNG', 'LAM_DE_XUAT_DAT_HANG'),
  ('PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ BH', 'PHAN_HOI_KH_BH'),
  ('PHẢN HỒI KHÁCH HÀNG VỀ DỊCH VỤ CHĂM SÓC KHÁCH HÀNG', 'PHAN_HOI_KH_CSKH'),
  ('PHỤC VỤ KHÁCH HÀNG', 'PHUC_VU_KHACH_HANG'),
  ('QUY TRÌNH LẮP, ĐÓNG GÓI', 'QUY_TRINH_LAP_DONG_GOI'),
  ('QUY ĐỊNH CÔNG TY', 'QUY_DINH_CONG_TY'),
  ('QUẢN LÝ HÀNG HÓA', 'QUAN_LY_HANG_HOA'),
  ('QUẢN LÝ KHO HÀNG', 'QUAN_LY_KHO_HANG'),
  ('QUẢN LÝ NHÂN VIÊN', 'QUAN_LY_NHAN_VIEN'),
  ('QUẢN LÝ,ĐÁNH GIÁ, CẢI TIẾN CHẤT LƯỢNG ĐÀO TẠO ZOOM', 'QL_DAO_TAO_ZOOM'),
  ('SẢN XUẤT', 'SAN_XUAT'),
  ('SẮP XẾP KHO HÀNG', 'SAP_XEP_KHO_HANG'),
  ('THẺ KHO', 'THE_KHO'),
  ('TRÁNH BẢO HÀNH 2 LẦN', 'TRANH_BAO_HANH_2_LAN'),
  ('TRÁNH GỬI SAI LINH KIỆN BH', 'TRANH_GUI_SAI_LINH_KIEN'),
  ('TRÌNH ĐỀ XUẤT NHÂN VIÊN NHÂN VIÊN XUẤT SẮC NHẤT THÁNG, QUÝ', 'TRINH_DX_NV_XUAT_SAC'),
  ('TỈ LỆ HOÀN THÀNH CUỘC GỌI HỖ TRỢ KỸ THUẬT TỚI KHÁCH HÀNG', 'TL_CUOC_GOI_HT_KY_THUAT'),
  ('TỈ LỆ THỰC HIỆN CUỘC GỌI RA THEO DANH SÁCH', 'TL_CUOC_GOI_RA'),
  ('TỈ LỆ TIẾP NHẬN CUỘC GỌI ĐẾN - CÁ NHÂN', 'TL_TIEP_NHAN_CG_DEN'),
  ('TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH(CÁ NHÂN)', 'TL_HOTLINE_CA_NHAN'),
  ('TỈ LỆ TRẢ LỜI HOTLINE( CẢ TEAM BH)', 'TL_HOTLINE_CA_TEAM'),
  ('TỈ LỆ TRẢ LỜI HOTLINE BẢO HÀNH( CẢ TEAM BH)', 'TL_HOTLINE_CA_TEAM'),
  ('VIDEO KỸ THUẬT', 'VIDEO_KY_THUAT'),
  ('VĂN HÓA CÔNG TY. ( Đây là KPI rất quan trọng, tuy nhiên điểm trọng số chỉ là tượng trưng, nhân viên phải chủ động phải hoàn thành tốt kpi này, đây là 1 trong các chỉ tiêu Kpi quan trọng để đánh giá việc thăng cấp, tăng lương, kí hợp đồng hay chấm dứt hợp đồng)', 'VAN_HOA_CONG_TY'),
  ('XÂY DỰNG QUY TRÌNH, TÀI LIỆU KIỂM SOÁT KHO HÀNG , ĐÀO TẠO NV THỰC HIỆN', 'XD_QT_KHO'),
  ('XÂY DỰNG QUY TRÌNH, TÀI LIỆU KIỂM SOÁT ĐÓNG GÓI HÀNG HÓA, ĐÀO TẠO NV THƯC HIỆN', 'XD_QT_DONG_GOI'),
  ('XÂY DỰNG TÀI LIỆU, QUY TRÌNH KIỂM SOÁT CHẤT LƯỢNG HÀNG HÓA ĐẦU RA KHÂU SẢN XUẤT, ĐÓNG GÓI, ĐÀO TẠO NV THỰC HIỆN', 'XD_TL_CL_DAU_RA'),
  ('XÂY DỰNG TÀI LIỆU, QUY TRÌNH KIỂM SOÁT CHẤT LƯỢNG HÀNG HÓA ĐẦU VÀO', 'XD_TL_CL_DAU_VAO'),
  ('ĐÁNH GIÁ CHẤT LƯỢNG CSKH', 'DANH_GIA_CL_CSKH'),
  ('ĐÁNH GIÁ ĐÚNG MỨC ĐỘ ĐAT KPI BẢN THÂN VÀ NHÂN VIÊN', 'DG_MUC_DO_DAT_KPI'),
  ('ĐÓNG GÓP CẢI TIẾN', 'DONG_GOP_CAI_TIEN')
)
update kpi_chi_tieu c set ma = a.ma
from anh_xa a
where c.ten = a.ten and c.ma is null;

-- ── Bật chấm chung cho 4 chỉ tiêu, kỳ 2026-07 ────────────────────────────────
update kpi_chi_tieu set cham_chung = true
where ky = '2026-07'
  and cap_do = 'CA_NHAN'
  and ma in ('QUY_DINH_CONG_TY', 'VAN_HOA_CONG_TY', '5S', 'CHAM_KPI');

commit;

-- ── Hàm tạo kỳ mới PHẢI copy 2 cột mới ───────────────────────────────────────
-- Thiếu `ma`, `cham_chung` ở đây thì sang kỳ sau bảng chấm chung trống trơn mà
-- KHÔNG có lỗi nào báo — chỉ khác đúng 2 tên cột so với bản trong rpc_tao_ky_kpi.sql.
create or replace function tao_ky_kpi(ky_nguon text, ky_moi text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare so_dong int;
begin
  if coalesce(auth.jwt()->>'nv_role','') <> 'ADMIN' then
    raise exception 'Chỉ Admin được tạo kỳ KPI' using errcode='42501';
  end if;

  if ky_nguon is null or ky_moi is null or ky_nguon = ky_moi then
    raise exception 'Kỳ nguồn và kỳ mới phải khác nhau và không được để trống';
  end if;

  if exists (select 1 from kpi_chi_tieu where ky = ky_moi) then
    raise exception 'Kỳ % đã có dữ liệu', ky_moi;
  end if;

  insert into kpi_chi_tieu
    (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
     chi_tieu, trong_so, cach_cham, ma, cham_chung)
  select ky_moi, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta,
         chi_tieu, trong_so, cach_cham, ma, cham_chung
  from kpi_chi_tieu where ky = ky_nguon;

  get diagnostics so_dong = row_count;
  return so_dong;
end;
$$;

revoke all on function tao_ky_kpi(text, text) from public;
grant execute on function tao_ky_kpi(text, text) to authenticated;

-- ── KIỂM TRA (chạy xong đọc 3 bảng kết quả này) ──────────────────────────────
-- 1. Chỉ tiêu chưa có mã — kỳ vọng 0 dòng. Có dòng nào tức là tên trong DB lệch so
--    với bảng ánh xạ; copy tên đó vào bảng ánh xạ rồi chạy lại file.
select ky, ten, count(*) so_dong
from kpi_chi_tieu where ma is null group by ky, ten order by ky, ten;

-- 2. Một mã bị gán cho nhiều tên khác nhau (ngoài cặp HOTLINE CẢ TEAM đã biết).
select ma, array_agg(distinct ten) cac_ten
from kpi_chi_tieu where ma is not null
group by ma having count(distinct ten) > 1;

-- 3. Các chỉ tiêu đang chấm chung ở kỳ 2026-07 — kỳ vọng đúng 4 mã, mỗi mã 13 người.
select ma, min(ten) ten, count(*) so_nguoi
from kpi_chi_tieu
where ky = '2026-07' and cham_chung
group by ma order by ma;
```

- [ ] **Step 2: Commit**

```bash
git add sql/them_ma_va_cham_chung_kpi.sql
git commit -m "feat(kpi): SQL them cot ma + cham_chung, dien 53 ma chi tieu"
```

- [ ] **Step 3: Người dùng chạy file trên Supabase**

Đưa file cho chủ app chạy trên Supabase SQL Editor và **đọc 3 bảng kiểm tra cuối file**:
- Bảng 1 phải 0 dòng.
- Bảng 2 chỉ được có `TL_HOTLINE_CA_TEAM` (2 tên, đúng như thiết kế) hoặc rỗng.
- Bảng 3 phải đúng 4 dòng: `5S`, `CHAM_KPI`, `QUY_DINH_CONG_TY`, `VAN_HOA_CONG_TY`, mỗi dòng `so_nguoi = 13`.

Không chạy được SQL thì các task sau vẫn code được, nhưng không kiểm tay trên app thật được.

---

## Task 2: Hàm thuần — danh sách nhân viên (cột của bảng)

**Files:**
- Create: `src/lib/kpiBangChung.js`
- Test: `src/lib/kpiBangChung.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
import { describe, it, expect } from 'vitest';
import { dsNhanVienChamChung } from './kpiBangChung';

describe('dsNhanVienChamChung', () => {
  const rows = [
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ten: '5S' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ten: '5S' },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ten: 'CHẤM KPI' },
    { cap_do: 'BO_PHAN', nhan_vien_id: null, ten: 'CHUYÊN CẦN BỘ PHẬN' },
  ];
  const users = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }];

  it('mỗi nhân viên đúng một cột, không trùng', () => {
    expect(dsNhanVienChamChung(rows, users).map(n => n.id)).toEqual(['a', 'b']);
  });

  it('sắp theo tên hiển thị chứ không theo thứ tự dòng', () => {
    expect(dsNhanVienChamChung(rows, users).map(n => n.ten)).toEqual(['An', 'Bình']);
  });

  it('bỏ qua dòng BO_PHAN — nó thuộc cơ chế chấm chung cả bộ phận, khác hẳn', () => {
    expect(dsNhanVienChamChung(rows, users)).toHaveLength(2);
  });

  it('không tìm thấy trong users thì lấy id làm tên, không rơi mất cột', () => {
    const r = [{ cap_do: 'CA_NHAN', nhan_vien_id: 'z', ten: '5S' }];
    expect(dsNhanVienChamChung(r, users)).toEqual([{ id: 'z', ten: 'z', avatar: undefined }]);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: FAIL — `Failed to resolve import "./kpiBangChung"`

- [ ] **Step 3: Viết code tối thiểu cho test xanh**

```js
// Hàm thuần dựng dữ liệu cho màn hình Bảng chấm chung. KHÔNG import supabase —
// cùng nếp với kpiEngine.js, để test được không cần DOM lẫn mạng.
//
// "Chấm chung" ở đây = chấm ở MỘT MÀN HÌNH chung, mỗi người vẫn có điểm riêng.
// Đừng lẫn với cap_do='BO_PHAN' (một điểm dùng cho cả bộ phận) — hai cơ chế khác nhau,
// mọi hàm dưới đây đều bỏ qua dòng BO_PHAN.

// Khoá gom nhóm một chỉ tiêu. Ưu tiên `ma`; chưa chạy migration thì lùi về `ten` để
// màn hình vẫn chạy được thay vì gom tất cả vào một nhóm `null`.
export const khoaChiTieu = ct => ct.ma || ct.ten;

// Danh sách nhân viên = các cột của bảng, sắp theo tên hiển thị.
export function dsNhanVienChamChung(rows = [], users = []) {
  const ids = [];
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || !r.nhan_vien_id) continue;
    if (!ids.includes(r.nhan_vien_id)) ids.push(r.nhan_vien_id);
  }
  return ids
    .map(id => {
      const u = users.find(x => x.id === id);
      return { id, ten: u?.name || id, avatar: u?.avatar };
    })
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: PASS — 4 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiBangChung.js src/lib/kpiBangChung.test.js
git commit -m "feat(kpi): ham dung danh sach nhan vien cho bang cham chung"
```

---

## Task 3: Hàm thuần — ma trận chỉ tiêu × nhân viên

**Files:**
- Modify: `src/lib/kpiBangChung.js`
- Test: `src/lib/kpiBangChung.test.js`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `src/lib/kpiBangChung.test.js` (và bổ sung `dungMaTran` vào dòng import ở đầu file):

```js
describe('dungMaTran', () => {
  const nv = [{ id: 'a', ten: 'An' }, { id: 'b', ten: 'Bình' }, { id: 'c', ten: 'Cường' }];
  const rows = [
    { id: 1, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S', chi_tieu: 10, thu_tu: 5, cham_chung: true },
    { id: 2, cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: '5S', ten: '5S', chi_tieu: 10, thu_tu: 3, cham_chung: true },
    { id: 3, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'CHAM_KPI', ten: 'CHẤM KPI', chi_tieu: 10, thu_tu: 9, cham_chung: true },
    { id: 4, cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', chi_tieu: 10, thu_tu: 6, cham_chung: false },
    { id: 5, cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN', chi_tieu: 10, cham_chung: true },
  ];

  it('chỉ lấy dòng cham_chung, mỗi mã một dòng bảng', () => {
    expect(dungMaTran(rows, nv).map(d => d.ma)).toEqual(['5S', 'CHAM_KPI']);
  });

  it('sắp dòng theo thu_tu nhỏ nhất của chỉ tiêu đó', () => {
    const d = dungMaTran(rows, nv);
    expect(d[0].ma).toBe('5S');        // thu_tu nhỏ nhất = 3
    expect(d[1].ma).toBe('CHAM_KPI');  // thu_tu = 9
  });

  it('ô của người CÓ chỉ tiêu là chính dòng chỉ tiêu đó', () => {
    const d5s = dungMaTran(rows, nv)[0];
    expect(d5s.o[0].id).toBe(1);   // An
    expect(d5s.o[1].id).toBe(2);   // Bình
  });

  it('ô của người KHÔNG có chỉ tiêu là null — vẽ gạch chéo, khác hẳn ô chưa chấm', () => {
    const d5s = dungMaTran(rows, nv)[0];
    expect(d5s.o[2]).toBeNull();   // Cường không có 5S
    expect(dungMaTran(rows, nv)[1].o[1]).toBeNull();
  });

  it('dòng BO_PHAN không lọt vào ma trận dù cham_chung = true', () => {
    expect(dungMaTran(rows, nv).some(d => d.ma === 'CHUYEN_CAN_BO_PHAN')).toBe(false);
  });

  it('mức chỉ tiêu giống nhau ở mọi ô thì hiện số đó', () => {
    expect(dungMaTran(rows, nv)[0].chi_tieu).toBe(10);
  });

  it('mức chỉ tiêu khác nhau giữa các người thì để null, không được bịa một số', () => {
    const lech = rows.map(r => (r.id === 2 ? { ...r, chi_tieu: 6 } : r));
    expect(dungMaTran(lech, nv)[0].chi_tieu).toBeNull();
  });

  it('chưa chạy migration (ma = null) thì gom theo tên, không dồn hết vào một dòng', () => {
    const cuMa = rows
      .filter(r => r.cap_do === 'CA_NHAN' && r.cham_chung)
      .map(r => ({ ...r, ma: null }));
    expect(dungMaTran(cuMa, nv).map(d => d.ten)).toEqual(['5S', 'CHẤM KPI']);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: FAIL — `dungMaTran is not a function`

- [ ] **Step 3: Viết code tối thiểu cho test xanh**

Thêm vào `src/lib/kpiBangChung.js`:

```js
// Ma trận của màn hình: mỗi phần tử là MỘT DÒNG (một chỉ tiêu), `o[i]` là ô ứng với
// nhanVien[i].
//
//   o[i] === null  → người đó KHÔNG có chỉ tiêu này (vẽ gạch chéo)
//   o[i] === dòng  → có chỉ tiêu; chấm hay chưa xem `diem_chot`
//
// Hai trạng thái đó tuyệt đối không được lẫn: "không có chỉ tiêu" mà vẽ thành ô nhập
// trống sẽ mời người dùng chấm điểm cho một dòng không tồn tại.
export function dungMaTran(rows = [], nhanVien = []) {
  const nhom = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || !r.cham_chung || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (!nhom.has(k)) nhom.set(k, []);
    nhom.get(k).push(r);
  }

  const dong = [];
  for (const [, ds] of nhom) {
    const mucs = [...new Set(ds.map(r => r.chi_tieu))];
    dong.push({
      ma: ds[0].ma || null,
      ten: ds[0].ten,
      // Mức chỉ tiêu chỉ hiện ở đầu dòng khi MỌI người cùng mức. Lệch nhau (VIDEO KỸ
      // THUẬT có người 6 người 2) thì để null — mỗi ô tự biết mức của mình.
      chi_tieu: mucs.length === 1 ? mucs[0] : null,
      thuTu: Math.min(...ds.map(r => (typeof r.thu_tu === 'number' ? r.thu_tu : 9999))),
      o: nhanVien.map(nv => ds.find(r => r.nhan_vien_id === nv.id) || null),
    });
  }
  return dong.sort((a, b) => a.thuTu - b.thuTu || a.ten.localeCompare(b.ten, 'vi'));
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: PASS — 12 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiBangChung.js src/lib/kpiBangChung.test.js
git commit -m "feat(kpi): ham dung ma tran chi tieu x nhan vien"
```

---

## Task 4: Hàm thuần — danh sách chỉ tiêu thêm được + luật lý do

**Files:**
- Modify: `src/lib/kpiBangChung.js`
- Test: `src/lib/kpiBangChung.test.js`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối file test (bổ sung `dsChiTieuThemDuoc, canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG` vào dòng import):

```js
describe('dsChiTieuThemDuoc', () => {
  const rows = [
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: '5S', ten: '5S', cham_chung: true },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'b', ma: 'SAN_XUAT', ten: 'SẢN XUẤT', cham_chung: false },
    { cap_do: 'CA_NHAN', nhan_vien_id: 'a', ma: 'THE_KHO', ten: 'THẺ KHO', cham_chung: false },
    { cap_do: 'BO_PHAN', nhan_vien_id: null, ma: 'CHUYEN_CAN_BO_PHAN', ten: 'CHUYÊN CẦN BỘ PHẬN', cham_chung: false },
  ];

  it('không liệt kê chỉ tiêu đã ở trong bảng chung', () => {
    expect(dsChiTieuThemDuoc(rows).some(c => c.ma === '5S')).toBe(false);
  });

  it('đếm đúng số người có mỗi chỉ tiêu', () => {
    expect(dsChiTieuThemDuoc(rows).find(c => c.ma === 'SAN_XUAT').soNguoi).toBe(2);
  });

  it('nhiều người có thì xếp lên trước', () => {
    expect(dsChiTieuThemDuoc(rows).map(c => c.ma)).toEqual(['SAN_XUAT', 'THE_KHO']);
  });

  it('bỏ dòng BO_PHAN — không đưa chỉ tiêu cả bộ phận vào bảng chung được', () => {
    expect(dsChiTieuThemDuoc(rows).some(c => c.ma === 'CHUYEN_CAN_BO_PHAN')).toBe(false);
  });
});

describe('canHoiLyDo', () => {
  it('đủ điểm tối đa thì không hỏi lý do', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 10)).toBe(false);
  });

  it('thiếu điểm thì hỏi lý do', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 9)).toBe(true);
  });

  it('0 điểm cũng phải có lý do — đây là lúc cần giải thích nhất', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, 0)).toBe(true);
  });

  it('chưa chấm (null) thì chưa hỏi gì', () => {
    expect(canHoiLyDo({ chi_tieu: 10 }, null)).toBe(false);
  });

  it('dòng thưởng ngoài trọng số (chi_tieu null) không có mức để so', () => {
    expect(canHoiLyDo({ chi_tieu: null }, 3)).toBe(false);
  });
});

describe('timDongLyDo', () => {
  it('chỉ nhận dòng do bảng chung ghi ra', () => {
    const logs = [
      { id: 1, nguon: 'TAY', ly_do: 'trừ tay' },
      { id: 2, nguon: NGUON_BANG_CHUNG, ly_do: 'để bàn bừa' },
    ];
    expect(timDongLyDo(logs).id).toBe(2);
  });

  it('không có thì trả null chứ không trả dòng nhật ký tay', () => {
    expect(timDongLyDo([{ id: 1, nguon: 'TAY' }])).toBeNull();
  });

  it('danh sách rỗng cũng không nổ', () => {
    expect(timDongLyDo()).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó fail**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: FAIL — `dsChiTieuThemDuoc is not a function`

- [ ] **Step 3: Viết code tối thiểu cho test xanh**

Thêm vào `src/lib/kpiBangChung.js`:

```js
// Nguồn của dòng nhật ký do bảng chấm chung sinh ra. Dòng này mang `so_diem = 0` nên
// KHÔNG đụng vào phép tính điểm — nó chỉ chở lý do sang bảng KPI cá nhân, Excel và bản in.
// Có khoá riêng để tìm lại đúng dòng của mình mà sửa/xoá, không đụng nhật ký nhập tay.
export const NGUON_BANG_CHUNG = 'BANG_CHUNG';

// Các chỉ tiêu CHƯA vào bảng chung — nội dung popup "＋ Thêm chỉ tiêu".
// `soNguoi` để chủ app biết thêm vào thì bảng rộng ra bao nhiêu ô thật, bao nhiêu ô gạch chéo.
export function dsChiTieuThemDuoc(rows = []) {
  const nhom = new Map();
  for (const r of rows) {
    if (r.cap_do === 'BO_PHAN' || r.cham_chung || !r.nhan_vien_id) continue;
    const k = khoaChiTieu(r);
    if (!nhom.has(k)) nhom.set(k, { ma: r.ma || null, ten: r.ten, soNguoi: 0 });
    nhom.get(k).soNguoi += 1;
  }
  return [...nhom.values()]
    .sort((a, b) => b.soNguoi - a.soNguoi || a.ten.localeCompare(b.ten, 'vi'));
}

// Có phải hỏi lý do cho ô này không: chỉ khi đã chấm và chấm thiếu so với mức chỉ tiêu.
// So sánh với null/undefined chứ không dùng falsy — 0 điểm là giá trị hợp lệ, và đó chính
// là lúc bắt buộc phải có lý do.
export function canHoiLyDo(ct, diem) {
  if (diem === null || diem === undefined) return false;
  if (ct?.chi_tieu === null || ct?.chi_tieu === undefined) return false;
  return Number(diem) < Number(ct.chi_tieu);
}

// Dòng lý do của bảng chung trong nhật ký của một chỉ tiêu. Mỗi chỉ tiêu giữ đúng một dòng.
export function timDongLyDo(logs = []) {
  return (logs || []).find(l => l.nguon === NGUON_BANG_CHUNG) || null;
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `npx vitest run src/lib/kpiBangChung.test.js`
Expected: PASS — 24 test

- [ ] **Step 5: Commit**

```bash
git add src/lib/kpiBangChung.js src/lib/kpiBangChung.test.js
git commit -m "feat(kpi): ham ds chi tieu them duoc + luat ly do bang chung"
```

---

## Task 5: Màn hình bảng chấm chung — khung bảng (chưa ghi được)

**Files:**
- Create: `src/pages/tasks/KpiBangChung.jsx`

- [ ] **Step 1: Viết component**

```jsx
import React, { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loiGhiKpi } from '../../lib/kpiWriteGuard';
import {
  dsNhanVienChamChung, dungMaTran, dsChiTieuThemDuoc,
  canHoiLyDo, timDongLyDo, NGUON_BANG_CHUNG,
} from '../../lib/kpiBangChung';
import { ChevronLeft, Plus, X, AlertTriangle } from 'lucide-react';

const soNgan = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const homNay = () => new Date().toISOString().slice(0, 10);

// Bảng chấm chung: dòng = chỉ tiêu, cột = nhân viên, ô = điểm cuối cùng của người đó.
// Mỗi người vẫn có điểm riêng — "chung" là chung MÀN HÌNH NHẬP, không phải chung điểm.
export default function KpiBangChung({ ky, rows, logs, users, me, perm, onBack, onReload }) {
  const [themCT, setThemCT] = useState(false);
  const [loi, setLoi] = useState('');

  const nhanVien = useMemo(() => dsNhanVienChamChung(rows, users), [rows, users]);
  const bang = useMemo(() => dungMaTran(rows, nhanVien), [rows, nhanVien]);

  // Nhật ký gom sẵn theo chi_tieu_id để mỗi ô khỏi quét lại cả mảng.
  const logTheoCT = useMemo(() => {
    const m = new Map();
    for (const l of logs || []) {
      if (!m.has(l.chi_tieu_id)) m.set(l.chi_tieu_id, []);
      m.get(l.chi_tieu_id).push(l);
    }
    return m;
  }, [logs]);

  async function doiChamChung(dong, bat) {
    setLoi('');
    let q = supabase.from('kpi_chi_tieu').update({ cham_chung: bat }).eq('ky', ky).eq('cap_do', 'CA_NHAN');
    // Gom theo mã; chưa chạy migration thì lùi về tên, đúng như khoaChiTieu().
    q = dong.ma ? q.eq('ma', dong.ma) : q.eq('ten', dong.ten);
    const { data, error } = await q.select();
    const l = loiGhiKpi(error, data);
    if (l) { setLoi(l); return; }
    setThemCT(false);
    onReload?.();
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onBack} style={nutPhu}>
          <ChevronLeft size={13} style={{ verticalAlign: 'middle' }} /> Quay lại
        </button>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Bảng chấm chung — kỳ {ky}</div>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {bang.length} chỉ tiêu × {nhanVien.length} nhân viên
        </span>
      </div>

      {loi && (
        <div style={khungLoi}>
          <AlertTriangle size={14} /> {loi}
        </div>
      )}

      {bang.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          Chưa có chỉ tiêu nào ở bảng chung. Bấm “Thêm chỉ tiêu” để đưa vào.
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thChung, ...cotGhim, minWidth: 240 }}>Chỉ tiêu</th>
              {nhanVien.map(nv => (
                <th key={nv.id} style={{ ...thChung, minWidth: 110, textAlign: 'center' }}>{nv.ten}</th>
              ))}
              {perm?.create && <th style={{ ...thChung, width: 34 }} aria-label="Bỏ khỏi bảng chung" />}
            </tr>
          </thead>
          <tbody>
            {bang.map(d => (
              <tr key={d.ma || d.ten}>
                <td style={{ ...tdChung, ...cotGhim }}>
                  {d.ma && <div style={nhanMa}>{d.ma}</div>}
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.8rem' }}>
                    {d.ten}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {d.chi_tieu == null ? 'mức khác nhau theo người' : `tối đa ${soNgan(d.chi_tieu)}`}
                  </div>
                </td>
                {d.o.map((ct, i) => (
                  <td key={nhanVien[i].id} style={{ ...tdChung, padding: 4, textAlign: 'center' }}>
                    {ct
                      ? <OChamDiem
                          ct={ct} logs={logTheoCT.get(ct.id) || []} me={me}
                          doiDuoc={!!perm?.edit} onXong={onReload}
                        />
                      : <span title="Nhân viên này không có chỉ tiêu đó" style={oTrong}>▨</span>}
                  </td>
                ))}
                {perm?.create && (
                  <td style={{ ...tdChung, textAlign: 'center' }}>
                    <button
                      onClick={() => doiChamChung(d, false)}
                      title="Bỏ khỏi bảng chung (điểm đã chấm vẫn giữ nguyên)"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <X size={13} color="#94a3b8" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {perm?.create && (
        <button onClick={() => setThemCT(true)} style={{ ...nutPhu, marginTop: 10 }}>
          <Plus size={13} style={{ verticalAlign: 'middle' }} /> Thêm chỉ tiêu
        </button>
      )}

      {themCT && (
        <PopupThemChiTieu
          rows={rows}
          onChon={dong => doiChamChung(dong, true)}
          onClose={() => setThemCT(false)}
        />
      )}
    </div>
  );
}
```

Style dùng chung, đặt cuối file:

```jsx
const thChung = {
  background: '#f8fafc', textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem',
  textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0,
};
const tdChung = { padding: '8px 10px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' };
// Cột tên chỉ tiêu ghim trái: cuộn ngang 13 cột mà mất tên dòng thì không biết đang chấm cái gì.
const cotGhim = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #e2e8f0' };
const nhanMa = {
  display: 'inline-block', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 5, background: '#f1f5f9', color: '#64748b', marginBottom: 3,
};
const oTrong = { color: '#e2e8f0', fontSize: '1rem' };
const nutPhu = {
  padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid #e2e8f0',
  background: '#fff', fontSize: '0.76rem', cursor: 'pointer',
};
const khungLoi = {
  padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
  fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
};
```

- [ ] **Step 2: Kiểm cú pháp**

Run: `npx eslint src/pages/tasks/KpiBangChung.jsx`
Expected: báo `OChamDiem` và `PopupThemChiTieu` chưa định nghĩa (`no-undef`) — đúng như dự kiến, hai component đó là Task 6 và Task 7.

- [ ] **Step 3: Chưa commit** — file chưa chạy được. Commit ở cuối Task 6.

---

## Task 6: Ô chấm điểm + ô lý do

**Files:**
- Modify: `src/pages/tasks/KpiBangChung.jsx`

- [ ] **Step 1: Viết component `OChamDiem`**

Thêm vào `src/pages/tasks/KpiBangChung.jsx`, ngay dưới component chính:

```jsx
// Một ô của ma trận. Lưu khi rời ô (blur) chứ không có nút "Lưu tất cả": điền tới đâu chắc
// tới đó, và lỗi hiện ngay tại ô sai thay vì một thông báo chung chung cho 52 ô.
function OChamDiem({ ct, logs, me, doiDuoc, onXong }) {
  const dongLyDo = timDongLyDo(logs);
  const [diem, setDiem] = useState(ct.diem_chot == null ? '' : String(ct.diem_chot));
  const [lyDo, setLyDo] = useState(dongLyDo?.ly_do || '');
  const [loi, setLoi] = useState('');
  const [dangLuu, setDangLuu] = useState(false);

  const soDiem = diem.trim() === '' ? null : Number(diem);
  const hoiLyDo = canHoiLyDo(ct, soDiem);
  const thieu = hoiLyDo;
  const du = soDiem != null && !thieu;

  async function luu() {
    setLoi('');
    if (diem.trim() !== '' && !Number.isFinite(soDiem)) { setLoi('Không phải số'); return; }
    if (soDiem != null && (soDiem < 0 || (ct.chi_tieu != null && soDiem > ct.chi_tieu))) {
      setLoi(`Phải trong khoảng 0…${soNgan(ct.chi_tieu)}`);
      return;
    }
    setDangLuu(true);
    const l = await ghiOChamChung({ ct, diem: soDiem, lyDo, logs, me });
    setDangLuu(false);
    if (l) { setLoi(l); return; }
    onXong?.();
  }

  return (
    <div>
      <input
        type="text" inputMode="decimal" value={diem} disabled={!doiDuoc || dangLuu}
        onChange={e => setDiem(e.target.value)}
        onBlur={luu}
        aria-label={`Điểm ${ct.ten}`}
        style={{
          width: 62, padding: '0.35rem', borderRadius: 7, textAlign: 'center',
          border: `1px solid ${loi ? '#dc2626' : '#e2e8f0'}`,
          background: loi ? '#fef2f2' : thieu ? '#fff5f6' : du ? '#f0fdf4' : '#fff',
          fontWeight: 700, fontSize: '0.82rem',
        }}
      />
      {hoiLyDo && (
        <input
          type="text" value={lyDo} disabled={!doiDuoc || dangLuu}
          onChange={e => setLyDo(e.target.value)}
          onBlur={luu}
          placeholder="lý do trừ điểm"
          aria-label={`Lý do ${ct.ten}`}
          style={{
            marginTop: 3, width: 100, padding: '0.25rem 0.35rem', borderRadius: 6,
            border: '1px solid #fecaca', fontSize: '0.68rem',
          }}
        />
      )}
      {loi && <div style={{ fontSize: '0.65rem', color: '#b91c1c', marginTop: 2 }}>{loi}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Viết hàm ghi xuống DB**

Thêm vào cùng file, ngay dưới `OChamDiem`:

```jsx
// Ghi một ô: điểm vào kpi_chi_tieu.diem_chot, lý do vào MỘT dòng kpi_nhat_ky nguồn
// BANG_CHUNG (so_diem = 0 nên không đụng phép tính, chỉ chở chữ).
//
// `.select()` ở mọi lệnh là BẮT BUỘC: PostgREST coi "RLS lọc hết dòng" là thành công,
// trả 204 với error = null. Không kiểm qua loiGhiKpi thì người không phải ADMIN gõ điểm,
// thấy form đóng êm, tưởng đã chấm — cuối tháng bảng lương lấy số cũ.
// Trả null nếu ghi được, hoặc chuỗi lỗi tiếng Việt.
async function ghiOChamChung({ ct, diem, lyDo, logs, me }) {
  const nguoi = me?.name || me?.id || null;
  const { data, error } = await supabase
    .from('kpi_chi_tieu')
    .update({
      diem_chot: diem,
      chot_boi: diem == null ? null : nguoi,
      chot_luc: diem == null ? null : new Date().toISOString(),
    })
    .eq('id', ct.id)
    .select();
  const l = loiGhiKpi(error, data);
  if (l) return l;

  const cu = timDongLyDo(logs);
  const can = canHoiLyDo(ct, diem);
  const chu = (lyDo || '').trim();

  // Kéo điểm về tối đa (hoặc xoá điểm) → dọn luôn dòng lý do, đừng để lý do cũ nằm lại
  // trên một chỉ tiêu đã đủ điểm.
  if (!can || !chu) {
    if (!cu) return null;
    const r = await supabase.from('kpi_nhat_ky').delete().eq('id', cu.id).select();
    return loiGhiKpi(r.error, r.data);
  }

  if (cu) {
    const r = await supabase.from('kpi_nhat_ky')
      .update({ ly_do: chu, ngay: homNay(), nguoi_ghi: nguoi })
      .eq('id', cu.id).select();
    return loiGhiKpi(r.error, r.data);
  }

  const r = await supabase.from('kpi_nhat_ky').insert({
    chi_tieu_id: ct.id, ngay: homNay(), so_diem: 0,
    ly_do: chu, nguon: NGUON_BANG_CHUNG, nguoi_ghi: nguoi,
  }).select();
  return loiGhiKpi(r.error, r.data);
}
```

- [ ] **Step 3: Viết popup thêm chỉ tiêu**

Thêm vào cuối file, trước phần style:

```jsx
// Popup “＋ Thêm chỉ tiêu”: liệt kê các chỉ tiêu chưa vào bảng chung, kèm mã và số người có.
function PopupThemChiTieu({ rows, onChon, onClose }) {
  const [tim, setTim] = useState('');
  const ds = useMemo(() => dsChiTieuThemDuoc(rows), [rows]);
  const loc = ds.filter(c =>
    !tim.trim()
    || c.ten.toLowerCase().includes(tim.toLowerCase())
    || (c.ma || '').toLowerCase().includes(tim.toLowerCase()));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: 16, width: 'min(560px,100%)',
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', flex: 1 }}>Thêm chỉ tiêu vào bảng chung</div>
          <button onClick={onClose} style={{ ...nutPhu, padding: '0.25rem 0.5rem' }}><X size={13} /></button>
        </div>

        <input
          value={tim} onChange={e => setTim(e.target.value)}
          placeholder="Tìm theo mã hoặc tên…"
          style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', marginBottom: 8 }}
        />

        {loc.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '0.8rem 0' }}>
            Không còn chỉ tiêu nào để thêm.
          </div>
        )}

        {loc.map(c => (
          <button
            key={c.ma || c.ten}
            onClick={() => onChon(c)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '0.5rem 0.6rem', marginBottom: 4, borderRadius: 9,
              border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
            }}
          >
            {c.ma && <span style={nhanMa}>{c.ma}</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.ten}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0 }}>{c.soNguoi} người</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Chạy lint để chắc file sạch**

Run: `npx eslint src/pages/tasks/KpiBangChung.jsx`
Expected: không còn lỗi nào

- [ ] **Step 5: Commit**

```bash
git add src/pages/tasks/KpiBangChung.jsx
git commit -m "feat(kpi): man hinh bang cham chung - ma tran, o cham diem, popup them chi tieu"
```

---

## Task 7: Nối vào KpiTab

**Files:**
- Modify: `src/pages/tasks/KpiTab.jsx`

- [ ] **Step 1: Thêm import**

Sau dòng `import KpiPrint from '../../components/KpiPrint';` (dòng 6), thêm:

```jsx
import KpiBangChung from './KpiBangChung';
```

Và thêm `Table2` vào danh sách icon lucide-react đang import ở dòng 7-10:

```jsx
import {
  Trophy, ChevronRight, ChevronLeft, AlertTriangle, Plus, X, Loader2,
  FileDown, Printer, Pencil, CalendarPlus, Table2,
} from 'lucide-react';
```

- [ ] **Step 2: Thêm state + nhánh render trong `KpiTab`**

Ngay dưới dòng `const [chon, setChon] = useState(null);` (dòng 52), thêm:

```jsx
  const [xemBangChung, setXemBangChung] = useState(false);
```

Ngay TRƯỚC khối `if (chon) return (` (dòng 119), thêm:

```jsx
  if (xemBangChung) return (
    <KpiBangChung
      ky={ky} rows={rows} logs={logs} users={users} me={me} perm={perm}
      onBack={() => setXemBangChung(false)} onReload={taiDuLieu}
    />
  );
```

- [ ] **Step 3: Thêm nút mở**

Trong thanh công cụ của màn danh sách, ngay sau khối nút "Xuất Excel cả team" (kết thúc ở dòng 152 bằng `)}`), thêm:

```jsx
        {rows.length > 0 && (
          <button
            onClick={() => setXemBangChung(true)}
            style={{ ...nutPhu, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
          >
            <Table2 size={13} /> Bảng chấm chung
          </button>
        )}
```

Điều kiện là `rows.length > 0` chứ **không** phải `rows.some(r => r.cham_chung)`: bỏ hết chỉ tiêu khỏi bảng chung thì nút cũng biến mất, và không còn đường nào quay vào để thêm lại.

- [ ] **Step 4: Gắn nhãn "chấm ở bảng chung" cho dòng trong bảng cá nhân**

Trong `DongBangKpi`, sửa khối nhãn (dòng 563-568) thành:

```jsx
        {(d.lien_ket_bo_phan || thuong || d.cham_chung) && (
          <div style={{ marginTop: 3 }}>
            {d.lien_ket_bo_phan && <span style={tagChung}>chung bộ phận</span>}
            {d.cham_chung && <span style={tagBangChung}>chấm ở bảng chung</span>}
            {thuong && <span style={tagThuong}>ngoài trọng số</span>}
          </div>
        )}
```

Thêm style mới ngay sau `const tagChung = {...};` (dòng 622):

```jsx
const tagBangChung = {
  display: 'inline-block', fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px',
  borderRadius: 6, background: 'rgba(217,119,6,0.12)', color: '#b45309', marginLeft: 6, whiteSpace: 'nowrap',
};
```

- [ ] **Step 5: Ẩn nút chốt tay cho dòng đã chấm chung**

Trong `PopupDienGiai`, sửa khối `{perm?.edit && (...)}` (dòng 778-795) thành:

```jsx
      {perm?.edit && (
        <>
          {laBoPhan && (
            <div style={{
              marginTop: 10, padding: '0.45rem 0.6rem', borderRadius: 8,
              background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem',
            }}>
              Ghi vào dòng chung của bộ phận — mọi người trong nhóm đều đổi điểm theo.
            </div>
          )}
          {ghi.cham_chung && (
            <div style={{
              marginTop: 10, padding: '0.45rem 0.6rem', borderRadius: 8,
              background: '#fffbeb', color: '#b45309', fontSize: '0.72rem',
            }}>
              Chỉ tiêu này chấm ở màn hình Bảng chấm chung. Sửa điểm tại đó để cả bảng
              cùng nhất quán — nút chốt tay ẩn đi để không có hai chỗ sửa một con số.
            </div>
          )}
          <FormGhiDiem
            chiTieuId={ghi.id}
            dangChotTay={ghi.diem_chot !== null && ghi.diem_chot !== undefined}
            me={me} onXong={onReload}
          />
          {!ghi.cham_chung && <FormChotDiem ctGhi={ghi} me={me} onXong={onReload} />}
        </>
      )}
```

- [ ] **Step 6: Tải lại dữ liệu KHÔNG bật màn chờ**

Bảng chung lưu mỗi khi rời một ô. Nếu lần lưu nào cũng gọi `taiDuLieu()` như hiện tại thì `setLoading(true)` sẽ thay cả màn hình bằng chữ "Đang tải KPI…", bảng biến mất và con trỏ nhảy ra khỏi ô đang gõ — điền 52 ô thành cực hình.

Sửa `taiDuLieu` (dòng 54) nhận thêm một tham số:

```jsx
  const taiDuLieu = useCallback(async (im = false) => {
    if (!im) setLoading(true);
    setLoi('');
```

Phần thân còn lại giữ nguyên. Rồi ở nhánh render bảng chung (Step 2), truyền bản tải lại im lặng:

```jsx
      onBack={() => setXemBangChung(false)} onReload={() => taiDuLieu(true)}
```

`useEffect(() => { taiDuLieu(); }, [taiDuLieu])` giữ nguyên — lần tải đầu vẫn có màn chờ.

- [ ] **Step 7: Xác nhận `cham_chung` đi qua được engine**

`DongBangKpi` và `PopupDienGiai` đọc `d.cham_chung` / `ghi.cham_chung`, hai giá trị đó do `tinhBangKpi` trả ra. Hàm này dựng kết quả bằng `{ ...r, ...tinhChiTieu(...) }` (`src/lib/kpiEngine.js`, trong `.map()`), nên mọi cột mới của bảng đi qua tự động — **không phải sửa engine**. Chạy để chắc:

Run: `npx vitest run src/lib/kpiEngine.test.js`
Expected: PASS

- [ ] **Step 8: Chạy toàn bộ test + lint + build**

```bash
npm test
npx eslint src/pages/tasks/KpiTab.jsx src/pages/tasks/KpiBangChung.jsx src/lib/kpiBangChung.js
npm run build
```

Expected: test PASS hết, eslint không lỗi, build thành công.

- [ ] **Step 9: Commit**

```bash
git add src/pages/tasks/KpiTab.jsx
git commit -m "feat(kpi): wire bang cham chung vao KpiTab + khoa dong da cham chung"
```

---

## Task 8: Sửa script import để sinh mã

**Files:**
- Modify: `scripts/import-kpi-excel.mjs:142`, `scripts/import-kpi-excel.mjs:153`

- [ ] **Step 1: Thêm hàm sinh mã**

Thêm gần đầu file, cạnh các hàm tiện ích có sẵn:

```js
// Mã chỉ tiêu: bỏ dấu, hoa, gạch dưới, tối đa 4 từ. Cùng tên → cùng mã, nên bảng chấm
// chung gom được các dòng của mọi nhân viên. Mã trùng nhau sau khi cắt thì sửa tay trong
// sql/them_ma_va_cham_chung_kpi.sql — file đó là bảng ánh xạ chuẩn.
function sinhMa(ten) {
  return String(ten)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .split('(')[0]
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_').filter(Boolean).slice(0, 4).join('_');
}
```

- [ ] **Step 2: Thêm cột `ma` vào 2 câu insert**

Dòng 142-143 (câu insert dòng bộ phận) đổi thành:

```js
      const insBP = `insert into kpi_chi_tieu (ky, cap_do, lien_ket_bo_phan, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_chot, ma)`
        + ` values ('${KY}', 'BO_PHAN', ${q(r.lien_ket_bo_phan)}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, 0, 'THU_CONG', ${n(r.diem_chot)}, ${q(sinhMa(r.ten))})`;
```

Dòng 153-154 (câu insert dòng cá nhân) đổi thành:

```js
    const insCN = `insert into kpi_chi_tieu (ky, cap_do, nhan_vien_id, lien_ket_bo_phan, nhom, thu_tu, ten, mo_ta, chi_tieu, trong_so, cach_cham, diem_tu_cham, diem_chot, ma)`
      + ` values ('${KY}', 'CA_NHAN', ${q(nvId)}, ${q(r.lien_ket_bo_phan)}, ${q(r.nhom)}, ${r.thu_tu}, ${q(r.ten)}, ${q(r.mo_ta)}, ${n(r.chi_tieu)}, ${r.trong_so}, 'THU_CONG', ${n(r.diem_tu_cham)}, ${n(r.diem_chot)}, ${q(sinhMa(r.ten))})`;
```

`q()` là hàm bọc nháy SQL sẵn có trong file, `n()` là hàm cho số/null — dùng đúng như các cột khác.

- [ ] **Step 3: Chạy thử script trên file Excel thật**

Run: `node scripts/import-kpi-excel.mjs`
Expected: chạy xong không lỗi, file SQL sinh ra có cột `ma` ở mọi dòng insert. Mở file kiểm mắt vài dòng.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-kpi-excel.mjs
git commit -m "feat(kpi): script import sinh them cot ma cho chi tieu"
```

---

## Task 9: Kiểm tay trên app thật

Chỉ làm được sau khi chủ app đã chạy `sql/them_ma_va_cham_chung_kpi.sql` (Task 1 Step 3).

- [ ] **Step 1: Chạy dev server**

Dùng preview tool với `.claude/launch.json`, KHÔNG chạy `npm run dev` qua Bash.

- [ ] **Step 2: Đi hết luồng, đăng nhập bằng tài khoản ADMIN**

1. Vào Công việc → KPI → chọn kỳ `2026-07` → bấm **Bảng chấm chung**.
2. Kỳ vọng: 4 dòng (`5S`, `CHAM_KPI`, `QUY_DINH_CONG_TY`, `VAN_HOA_CONG_TY`) × 13 cột, không ô nào gạch chéo.
3. Điền ô 5S của một người thành `8` (dưới mức 10) → ô lý do hiện ra → gõ `để bàn bừa 12/7` → bấm ra ngoài.
4. Quay lại → mở bảng KPI của đúng người đó → dòng 5S phải: điểm quy đổi giảm, nền hồng, cột ghi chú hiện `để bàn bừa 12/7`, có nhãn **chấm ở bảng chung**.
5. Bấm vào dòng 5S đó → popup **không** còn nút "Chốt điểm tay", có khung vàng giải thích.
6. Về bảng chung, sửa ô đó về `10` → mở lại bảng cá nhân: điểm đủ, ghi chú biến mất (dòng lý do đã bị xoá).
7. Bấm **Thêm chỉ tiêu** → chọn `SAN_XUAT` (7 người) → bảng có thêm 1 dòng, 6 ô gạch chéo.
8. Bấm nút ✕ trên dòng `SAN_XUAT` → dòng biến mất, nhưng điểm đã chấm trước đó vẫn còn khi mở bảng cá nhân.

- [ ] **Step 3: Kiểm chặn quyền**

Đăng nhập bằng tài khoản KHÔNG phải ADMIN, mở bảng chung, gõ điểm vào một ô rồi bấm ra ngoài.
Expected: ô hiện chữ đỏ "Không lưu được — tài khoản của bạn không có quyền ghi KPI (chỉ Admin)". **Tuyệt đối không được im lặng như đã lưu.**

- [ ] **Step 4: Chụp màn hình gửi chủ app**

Chụp bảng chung và bảng KPI cá nhân của cùng một người để đối chiếu điểm + lý do.
