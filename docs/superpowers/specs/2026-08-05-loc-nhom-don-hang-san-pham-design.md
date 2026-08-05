# Lọc theo nhóm "đơn hàng × sản phẩm" — tab Lưu xuất (Kho hàng)

Ngày: 2026-08-05

## Vấn đề

Tại tab **Lưu xuất**, người dùng gõ mã đơn hàng vào ô "Tìm kiếm & Lọc", app hiện đúng
danh sách mã sản phẩm thuộc đơn đó. Nhưng khi tick chọn một mã, bảng lại hiện **mọi**
dòng có mã sản phẩm ấy — của tất cả các đơn — thay vì chỉ dòng thuộc đơn vừa tìm.

Nguyên nhân: chuỗi người dùng gõ bị vứt đi.

- `src/components/SearchAutoSuggest.jsx` — khi tick, component chỉ gửi lên danh sách
  `ma_san_pham` đã chọn (`onChange([...n].join(','))`). Mã đơn hàng không đi kèm.
- `src/pages/kho/SaveExportTab.jsx` — trang lọc bằng đúng một điều kiện
  `query.in('ma_san_pham', terms)`. Không hề có ràng buộc mã đơn hàng.

Nên tick `F-PP10` nghĩa là "cho tôi mọi dòng có F-PP10", đúng như hiện tượng quan sát được.

## Mong muốn

Tìm theo mã đơn hàng → ra danh sách mã sản phẩm của đơn đó → tick 1 hoặc nhiều →
hiện **đúng những dòng của đơn đó**.

Hai điểm đã chốt với chủ app:

1. **Cộng dồn nhiều đơn.** Tìm đơn A → tick vài SP, rồi tìm đơn B → tick thêm, xem được
   cả hai cùng lúc. Mỗi tick phải nhớ kèm đúng đơn của nó.
2. **Gõ từ khoá mà không tick → hiện toàn bộ dòng khớp từ khoá đó** (gõ mã đơn = xem cả đơn).

## Thiết kế

### Khái niệm: nhóm lọc

Mỗi lần gõ một từ khoá rồi tick, app ghi lại **cặp**: *từ khoá* + *các mã SP đã tick trong
từ khoá đó*. Gọi là một **nhóm lọc**. Nhiều lần gõ = nhiều nhóm, cộng dồn.

```
Nhóm 1:  VNA02404185107  →  [F-PP10, D-TDS]     (2 SP của riêng đơn này)
Nhóm 2:  DLY05082600200  →  []                   (cả đơn)
```

Kết quả bảng = dòng thuộc nhóm 1 **hợp** dòng thuộc nhóm 2.

### Từ khoá vẫn khớp cả 3 cột — điều kiện để không phá luồng cũ

Từ khoá **không** bị ép hiểu là "mã đơn hàng". Nó vẫn khớp `ma_san_pham` **hoặc**
`ten_san_pham` **hoặc** `ma_don_hang`, y như hiện nay. Nhờ vậy cả hai luồng đều đúng:

| Gõ | Khớp cột | Tick `F-PP10` → ra |
|---|---|---|
| `VNA02404185107` | `ma_don_hang` | F-PP10 **của riêng đơn đó** — đây là chỗ được sửa |
| `F-PP` | `ma_san_pham` | F-PP10 mọi đơn — **y hệt hiện nay** |
| `Lõi sediment` | `ten_san_pham` | F-PP10 mọi đơn — **y hệt hiện nay** |

Nếu ép từ khoá thành "mã đơn hàng", luồng tìm theo mã/tên sản phẩm sẽ ra 0 dòng —
hỏng một luồng đang chạy. Vì vậy giữ nguyên phạm vi 3 cột.

### Quy tắc chốt nhóm

Cố ý **không** chốt theo từng phím gõ — nếu không, gõ `V`, `VN`, `VNA`… sẽ đẻ ra hàng
loạt nhóm rác.

| Thao tác | Kết quả |
|---|---|
| Tick một ô | Chốt nhóm cho từ khoá đang gõ; tick thuộc nhóm đó |
| Bấm **Xong** khi từ khoá đang gõ chưa có nhóm | Chốt thành nhóm "cả đơn" (danh sách mã SP rỗng) |
| Mở lại ô lọc | Ô nhập trống sẵn để gõ đơn tiếp; các nhóm cũ vẫn là thẻ |
| Bỏ tick hết trong một nhóm | Nhóm đó thành "cả đơn"; thẻ ghi rõ chữ *cả đơn*, không lặng lẽ |
| Bấm × trên thẻ | Xoá nhóm đó |
| **Xóa tất cả** | Dọn sạch mọi nhóm |
| Tick lại đúng từ khoá của một nhóm đã có | Gộp vào nhóm đó, không tạo nhóm trùng |

### Giao diện trong ô "Tìm kiếm & Lọc"

```
┌ Tìm kiếm & Lọc                        [Xóa tất cả] ┐
│  [ Gõ để tìm...                                  ]  │
│                                                     │
│  Đang lọc:                                          │
│   ┌ VNA02404185107 ────────────────────────────┐ ×  │
│   │  F-PP10 ×    D-TDS ×                       │    │
│   └────────────────────────────────────────────┘    │
│   ┌ DLY05082600200 · cả đơn ───────────────────┐ ×  │
│   └────────────────────────────────────────────┘    │
│  ─────────────────────────────────────────────────  │
│   ☐ D-TDS                                           │
│   ☐ F-COMBO1-2-3       ← gợi ý của từ khoá đang gõ  │
│   ☐ F-PP10                                          │
└──────────────────────────────────── [ Xong ] ───────┘
```

Nút lọc ngoài thanh công cụ hiển thị **1 dòng**, không xuống dòng, không tràn ngang
(luật giao diện mobile của dự án):

- 1 nhóm có tick → `VNA…107 (2 SP)`
- 1 nhóm không tick → `VNA…107`
- nhiều nhóm → `3 nhóm lọc`

### Truy vấn

Bảng `luu_xuat` hàng chục nghìn dòng, đang phân trang phía máy chủ ⇒ **phải lọc ở máy
chủ trong một truy vấn duy nhất**, không lọc ở máy khách.

Một nhóm `{ term, codes }` dịch thành:

- `codes` rỗng → `or(ma_san_pham.ilike.%T%,ten_san_pham.ilike.%T%,ma_don_hang.ilike.%T%)`
- `codes` có → `and( <or 3 cột ở trên>, ma_san_pham.in.("A","B") )`

Toàn bộ bộ lọc = `or(` các nhóm nối bằng dấu phẩy `)`. Ví dụ 2 nhóm:

```
or(
  and( or(ma_san_pham.ilike.%VNA…%,ten_san_pham.ilike.%VNA…%,ma_don_hang.ilike.%VNA…%),
       ma_san_pham.in.("F-PP10","D-TDS") ),
  or(ma_san_pham.ilike.%DLY…%,ten_san_pham.ilike.%DLY…%,ma_don_hang.ilike.%DLY…%)
)
```

**Đã đo thật (2026-08-05)** bằng đúng khoá công khai trong mã nguồn, gọi thẳng PostgREST.
PostgREST phân tích cú pháp *trước* khi áp RLS nên phân biệt được lỗi cú pháp (400) với
bị RLS chặn (200 + `[]`):

| Phép đo | Kết quả |
|---|---|
| Đối chứng cú pháp sai `or=(and(or(xxx.))` | **400** `PGRST100 failed to parse logic tree` — phép đo có ý nghĩa |
| Truy vấn phẳng như hiện nay | 200 |
| Lồng 3 tầng `or(and(or(…),in.(…)), or(…))` | **200 — chấp nhận** |
| Mã SP nhiều gạch nối bọc nháy kép (`"S-PVC3043-LUX200RO"`) | 200 |
| Khoá công khai đọc `luu_xuat` | 200 nhưng `[]` — không đọc được dòng nào |

### Khử ký tự đặc biệt

Cú pháp logic tree của PostgREST dùng `, ( )` làm ký tự phân tách. Cả **từ khoá** lẫn
**mã sản phẩm** đều do người dùng nhập ⇒ phải khử trước khi ghép chuỗi, nếu không sẽ
phá cú pháp truy vấn (và là đường tiêm lọc).

- Từ khoá: bỏ `, ( ) *` → thay bằng khoảng trắng (giữ đúng quy tắc đang có trong
  `SearchAutoSuggest.doSearch`).
- Mã sản phẩm trong `in.(...)`: bọc nháy kép, bỏ `" \ , ( )`.
- Nhóm có từ khoá rỗng sau khi khử thì bỏ qua, không sinh mệnh đề.

### Lưu trạng thái

`SaveExportTab` đang giữ bộ lọc trong `searchInput`/`search` là **chuỗi**, và có một
`useEffect` giảm rung so sánh `search !== searchInput`. Nếu đổi sang mảng, phép so sánh
`!==` trên mảng luôn đúng ⇒ **vòng lặp gọi lại dữ liệu vô tận**.

⇒ Danh sách nhóm được **tuần tự hoá thành chuỗi JSON** khi đi qua `value`/`onChange`.
Kiểu dữ liệu giữa component và trang vẫn là *chuỗi vào, chuỗi ra*, đúng như hiện nay;
việc phân tích/ghép JSON nằm gọn bên trong component và hàm dựng truy vấn.

## Phạm vi ảnh hưởng

`SearchAutoSuggest` đang được **10 tab** dùng chung: BomTab, InventoryTab, WipStockTab,
CatalogTab, PrintQueueTab, StockSummaryTab, ImportLogsTab, BookInventoryTab,
PickingLogsTab, SaveExportTab.

⇒ Chế độ nhóm là **prop tuỳ chọn `groupByTerm`, mặc định TẮT**. Khi tắt, component chạy
đúng nhánh mã cũ, không đổi một hành vi nào. Chỉ `SaveExportTab` bật.

Không đụng tới: lọc theo ngày, phân trang, chọn dòng, Sửa, Xoá, Nhập Excel, Tải file mẫu.

Nút **Xuất Excel** phải dùng **chung một hàm dựng bộ lọc** với bảng. Hiện hai chỗ đang
chép tay điều kiện giống nhau (`SaveExportTab.jsx` dòng ~66 và ~108); tách ra một hàm để
bảng và file xuất không bao giờ lệch nhau.

### Một thay đổi hành vi đã được chủ app đồng ý

Hiện nay gõ từ khoá mà không tick thì **không lọc gì cả** (bảng vẫn ra toàn bộ dữ liệu).
Sau thay đổi, tab Lưu xuất sẽ lọc theo từ khoá đó. Đây là điều đã chốt ở mục Mong muốn (2).
Người dùng luôn nhìn thấy thẻ nhóm đang áp dụng và xoá được bằng dấu ×, nên không có
trạng thái lọc ẩn.

## Kiểm chứng

Phải **đo trên dữ liệu thật**, không suy luận:

1. Đơn `VNA02404185107` + tick `F-PP10` → mọi dòng trả về đều có `ma_don_hang` chứa
   `VNA02404185107` **và** `ma_san_pham = F-PP10`. Đối chiếu số dòng với truy vấn SQL trực tiếp.
2. Không tick → số dòng đúng bằng tổng số dòng của đơn đó.
3. Cộng dồn 2 đơn → số dòng bằng tổng hai nhóm, không thiếu không thừa.
4. Gõ `F-PP` rồi tick `F-PP10` (luồng cũ) → **số dòng không đổi** so với bản hiện hành.
5. Bấm Xuất Excel → số dòng trong file khớp với số dòng bảng đang hiện.
6. 9 tab còn lại: lọc vẫn ra đúng như trước.
7. Chạy skill `kiem-tra-bao-mat-du-lieu` trước khi bàn giao (thay đổi chạm mã đọc dữ liệu
   Supabase), gồm thử tiêm ký tự `,()"` vào từ khoá.
