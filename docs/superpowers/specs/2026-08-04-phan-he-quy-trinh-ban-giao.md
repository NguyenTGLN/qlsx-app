# Phân hệ Quy trình — bàn giao

> Ngày: 2026-08-04 · Nhánh `feat/phan-he-quy-trinh` → gộp vào `master`
> Thiết kế gốc: [2026-08-03-phan-he-quy-trinh-design.md](2026-08-03-phan-he-quy-trinh-design.md)
> **Tài liệu này ghi thứ THẬT SỰ ĐÃ LÀM.** Bản thiết kế gốc là ghi chép lịch sử, nhiều
> chỗ đã bị thực tế sửa lại — chỗ nào lệch thì tin tài liệu này.

## Tình trạng

54 commit · **1355 test / 52 tệp**, xanh · build sạch · eslint không thêm lỗi nào
(17 lỗi có sẵn nằm ở `AuthContext.jsx`, `attachmentSignedUrl.js`, `chamCongThongKe.test.js`,
không thuộc phân hệ này).

`sql/quy_trinh.sql` **đã chạy trên cơ sở dữ liệu thật**. Có một quy trình thật đang lưu.

## Đã ĐO được về bảo mật (không phải suy luận)

Đo bằng chính khoá công khai trong mã nguồn, trên dòng dữ liệu có thật:

| Phép thử — khoá công khai | Kết quả |
|---|---|
| Đọc `quy_trinh`, `quy_trinh_phien_ban` | `Content-Range: */0`, thân `[]` |
| Thêm dòng | `42501 — violates row-level security policy` |
| Sửa `trang_thai` → published trên dòng thật | `[]`, DB xác nhận vẫn `wait` |
| Ghi đè `so_do` trên dòng thật | `[]`, DB xác nhận không bị ghi đè |
| Xoá dòng thật | `[]`, DB xác nhận dòng còn nguyên |
| Gọi 4 RPC (đúng chữ ký) | `42501 — permission denied for function` |

| Phép thử — nhân viên thường (`ntth`, vai trò AGENT) | Kết quả |
|---|---|
| Đọc danh mục *(đối chứng — phải được)* | ✅ đọc được |
| Ghi thẳng cột `trang_thai` qua REST | `403 · 42501 permission denied for table` |
| Gọi `rpc_qt_ban_hanh` | `400 · P0001 — "Chỉ Admin được duyệt và ban hành quy trình"` |

Đối chứng là thứ làm hai kết quả chặn có giá trị: phiên đăng nhập hợp lệ, nên đó là
**chặn thật**, không phải hỏng kết nối.

Hai tầng chặn độc lập: RPC chặn bằng **vai trò**, PATCH chặn bằng **quyền ghi theo cột**.
Nếu ai chạy lại `security_3_rls_lockdown.sql` và xoá sạch policy thì **trigger vẫn giữ**.

## Những chỗ ĐÃ LỆCH so với thiết kế gốc

| Thiết kế gốc | Thực tế đã làm | Vì sao |
|---|---|---|
| Khổ in **A3 ngang** | **A4 dọc** (210×297mm) | Người dùng đổi ý 04/08. Cái giá: lưu đồ 5 cột 8 bước từ 288×277mm còn 190×183mm, chữ từ ~8pt còn **~5,3pt**. Muốn dán xưởng thì dùng nút Xuất PNG. |
| Cột trái là **Giai đoạn** có tên | Cột **Bước**, tự đánh số theo hàng | Người dùng đổi ý 04/08. Mất tầng gom nhóm Tiếp nhận/Thực hiện/Hoàn tất. `phases` cũ **vẫn giữ trong dữ liệu**, chỉ thôi dùng để dựng hình. |
| Vị trí khối tự do theo `y` | **Lưới hàng đều 120px**, khối rơi tâm ô | Người dùng yêu cầu hàng cao bằng nhau. `y` vẫn là nguồn sự thật, lưới là luật đặt khối. |
| RPC ban hành soát đủ luật | RPC chỉ soát **cấu trúc tối thiểu** | Chép 80 dòng luật sang PL/pgSQL sinh hai bản luật lệch nhau. Máy chủ chặn **ai** được ban hành, không chặn **nội dung có đạt không**. |

## Chức năng đã có ngoài thiết kế gốc

Đều do người dùng yêu cầu sau khi dùng thử thật:

- Xoá cột / xoá hàng (có ánh xạ lại chỉ số, từ chối khi còn khối)
- **Đổi chỗ cột** bằng kéo tên cột hoặc nút, ánh xạ lại `lane` của mọi khối
- Nối bằng **kéo chuột** (giữ cả cách bấm-bấm cho vòng lặp quay lại)
- **Kéo tay chỉnh đường nối** (`e.lech`, độ dời tương đối)
- **Lách khối**: đường nối tự vòng qua khối chắn (2.848 → 229 lần cắt, giảm 92%)
- **Bắc cầu** chỗ hai đường giao nhau
- **Ghim điểm nối** vào 4 cạnh khối kiểu Visio (`e.raA` / `e.vaoB`)
- **Kéo nhãn** OK/NG dọc theo đường (`e.viTriNhan`, tỉ lệ 0…1)
- **Hút ngang hàng** khi kéo khối, có đường gióng
- **Đánh số bước bằng tay** (`soDo.thuTu`), bảng diễn giải và bản in đi theo
- **Tạo phiên bản mới** từ bản đã ban hành

Mọi trường mới đều nằm trong `so_do` (jsonb) — **không đổi lược đồ, không migration**.

## Bốn lỗi nghiêm trọng tìm được ở đợt rà soát cuối và đã vá

Cả bốn đều là lỗi **xuyên chức năng** — mỗi mảnh riêng lẻ đều đúng, chỗ nối mới hỏng.
Review từng-task không thấy được.

1. **Số bước sai** — `thuTuBuoc` sắp theo mép trên trong khi lưới căn theo tâm, nên khối
   Quyết định (cao 86) luôn đánh số trước khối thường (cao 56) cùng hàng. Bảng in ra
   đánh số ngược với hình. → sắp theo tâm.
2. **Khối lọt ra ngoài trang** vẫn hiện trên màn hình nhưng **mất khỏi PNG/Word/bản in**,
   mà không bị chặn ban hành. → thêm lỗi chặn `NGOAI_TRANG` + kẹp không cho kéo ra ngoài.
3. **Bản đã ban hành kẹt vĩnh viễn** — giao diện bảo "tạo phiên bản mới", app không có
   chức năng đó. → `rpc_qt_tao_phien_ban` + nút.
4. **Bản chờ duyệt vẫn sửa được** → Admin đóng dấu lên thứ chưa xem. → trigger khoá luôn
   `wait`.

Và một lỗi loại DoS tìm được trong lượt rà bảo mật: `soHang` đọc từ jsonb đưa thẳng vào
`Array.from({length})` — `1e9` **giết tiến trình vì hết bộ nhớ**, không bắt được, trên
trình duyệt là màn hình trắng. Cửa này **đã mở sẵn từ trước** qua `phases[].h`. Đã chặn
cả hai bằng ngưỡng 500 hàng.

## CHƯA kiểm chứng — phải làm trước khi tin là xong

- **Ảnh PNG có tràn chữ không.** Ảnh dựng qua `blob:` URL **không đọc được `@font-face`
  của trang** nên rơi về Segoe UI, trong khi hàm ngắt dòng tính theo Be Vietnam Pro.
  Soi **cột nhãn bước bên trái trước** — chỗ đó hẹp nhất (112px) nên tràn ở đó đầu tiên.
- **Tệp `.docx` mở bằng Word thật** — không hiện hộp thoại sửa lỗi, đúng khổ A4 dọc.
- **Hộp thoại In** báo A4 dọc, chỉ có tờ giấy.
- **Toàn bộ thao tác chuột** (kéo khối, kéo nối, kéo nhãn, kéo cột, bấm chấm ghim) chưa
  bấm thử bằng chuột thật lần nào — không được phép đăng nhập vào bản chạy thật.

## Còn nợ — 5 lỗi đáng sửa, 9 lỗi vặt

Đáng chú ý nhất:

- Cột **"Thời gian chuẩn"** người dùng nhập, bị cảnh báo nếu bỏ trống, nhưng **không in
  ra đâu cả** — không có trong bảng mục 6 của Word lẫn tờ xem trước.
- **Word mất dấu nhánh OK/NG** mà tờ xem trước có.
- Cờ "Chưa lưu" bị xoá nhầm nếu người dùng sửa trong lúc đang lưu (cửa sổ ~1 vòng gọi).
- Ghim hai đầu trên hai khối **cùng cột** ⇒ đường đâm thẳng qua mọi khối ở giữa, không
  có núm để kéo, `lech` vô hiệu.
- Đường nối **đi ngang cùng hàng** chưa được lách khối.

## Nhắc lại điều dễ quên nhất

`sql/security_3_rls_lockdown.sql` quét **mọi** bảng public, xoá hết policy và chạy
`grant all on all tables to authenticated`. **Chạy lại file đó là xoá sạch quyền-theo-cột
của phân hệ này** ⇒ nhân viên thường tự ban hành được. Chạy xong **phải chạy lại
`sql/quy_trinh.sql`**. Kiểm bằng:

```sql
select has_column_privilege('authenticated','quy_trinh_phien_ban','trang_thai','update');
-- phải false
```

Trigger `qt_canh_trang_thai` không bị file lockdown đụng tới nên vẫn chặn được — nhưng
đừng dựa vào mỗi nó.
