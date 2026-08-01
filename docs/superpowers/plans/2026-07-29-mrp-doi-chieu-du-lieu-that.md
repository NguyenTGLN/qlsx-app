# Đối chiếu engine MRP với dữ liệu thật — 29/07/2026

Task 5 của kế hoạch giai đoạn 1. **Chỉ đọc, không ghi gì vào cơ sở dữ liệu.**

---

## 1. Cách làm, và vì sao không chạy được như kế hoạch ban đầu

Kế hoạch dự định chạy `scripts/doi-chieu-mrp.mjs` — nạp dữ liệu từ Supabase bằng khoá
công khai rồi đưa qua `buildProposalLines`. **Không chạy được**, đo thật:

```
POST /rest/v1/rpc/get_stock_summary  (khoá sb_publishable_...)  →  []   [HTTP 200]
```

RLS chặn khoá công khai, đúng ngưỡng bảo mật đang giữ. Đây là kết quả **đúng**, không
phải lỗi. Nhưng nó có nghĩa engine không thể tự nạp dữ liệu thật nếu không đăng nhập.

Thay thế: dựng lại **đúng thuật toán** bằng SQL (tồn an toàn theo công thức mới, rồi nổ
BOM trừ tồn từng cấp theo thứ tự độ sâu, 8 tầng — độ sâu BOM thật tối đa là 7) và chạy
trực tiếp trên dữ liệu sản xuất.

**Phần chưa kiểm chứng được, nói thẳng:** cách này xác nhận *thuật toán* cho ra số hợp
lý trên dữ liệu thật, nhưng **không** chứng minh mã JavaScript trong `src/lib/mrp.js`
cho ra đúng những con số đó. Hai thứ được kiểm bằng hai đường khác nhau: mã JS có 40
test đơn vị (kèm kiểm chứng đột biến), SQL có dữ liệu thật. Việc chạy chính mã JS trên
dữ liệu thật phải chờ giai đoạn 2, khi engine được nối vào phiên đã đăng nhập.

---

## 2. Kết quả

| | Luồng cũ (đang chạy) | Engine mới |
|---|---:|---:|
| Số dòng đề xuất | 138 | **100** |
| Tổng số lượng | 170.320 | **30.752** |

Giảm 82%. Ba nguyên nhân cộng lại:

1. **Công thức mới đệm 60 ngày** (`lead×2 + an toàn`) thay vì 75 ngày (`lead + an toàn×2`)
2. **Nổ BOM trừ tồn từng cấp** — không đòi mua nguyên liệu cho thứ đã có sẵn thành phẩm
3. **Tính tươi từ doanh số và tồn hiện tại**, thay vì nhu cầu DKSX chốt từ 03/06 và
   không bao giờ tự hạ

### 14 dòng lớn nhất

| Mã | Tên | Gross | Tồn | **SL mới** | SL đang hiện |
|---|---|---:|---:|---:|---:|
| Q-5044 | Nối góc 6-6 nhanh | 10.373 | 3.438 | **6.935** | 21.749 |
| E-CE2.5X4 | Cos chụp đầu nối dây điện | 2.672 | 685 | **1.987** | 3.602 |
| F-PP10 | Lõi 10PP5 không bịt | 2.887 | 1.077 | **1.810** | 7.245 |
| HC-33X13X11 | Hộp đóng bình kiềm, lõi kiềm | 2.155 | 680 | **1.475** | 3.028 |
| VIT-5X20 | Vít 5x20 đầu phẳng | 5.528 | 4.067 | **1.461** | 11.869 |
| C-V-230 | Thanh nẹp góc dài 230mm | 2.840 | 1.515 | **1.325** | 4.333 |
| T-0402 | Dây 6 | 4.037,5 | 2.782,7 | **1.254,762** | 8.562,114 |
| C-V-370 | Thanh nẹp góc dài 370mm | 2.966 | 1.751 | **1.215** | 2.113 |
| OFK-PC11 | Lõi Post carbon HQ liền NCC | 957 | 38 | **919** | 1.554 |
| CTL-WT-N | Catalogue Watek mới | 827 | 45 | **782** | 1.906 |
| C-V-1180 | Thanh nẹp góc dài 1180mm | 1.486 | 791 | **695** | 1.141 |
| C-V-700 | Thanh nẹp góc dài 700mm | 1.466 | 791 | **675** | 2.165 |
| HC-32X22X12 | Hộp carton đóng combo 3 lõi | 1.048 | 400 | **648** | 2.181 |
| CUT-UPVC-WH-AS | Cút lắp cốc lọc tổng AS | 540 | 6 | **534** | 1.268 |

---

## 3. Ba điểm kiểm chứng bắt buộc

**✅ Phép trừ tồn từng cấp hoạt động thật.** `L-F-OCB10` (tem lõi số 2) **không** bị đề
xuất, vì tự nó đang tồn 2.846 — thừa nhu cầu. Luồng cũ đề xuất 2.929 tem. Đây là bằng
chứng trực tiếp trên dữ liệu thật rằng netting đúng chỗ.

**✅ Không dòng nào mang tên rỗng.** Đếm được **0** dòng trong 100 dòng có mã không nằm
trong `inventory_items`. Rủi ro tên rỗng mà vòng rà soát nêu ra là có thật về mặt logic
nhưng chưa chạm tới trong dữ liệu hiện tại.

**✅ Phép trừ khớp.** Mọi dòng thoả `gross − tồn = SL đề xuất` sau khi làm tròn 3 số lẻ.
Ví dụ `T-0402`: `4037,5 − 2782,7 = 1254,8` — lệch so với `1254,762` là do tồn được cộng
từ nhiều vị trí kho rồi mới làm tròn, đúng như thiết kế.

---

## 4. ⚠️ Đính chính số liệu tôi đưa sai trước đó

Trong lúc bàn thiết kế tôi đã nêu tồn kho bán thành phẩm bằng một truy vấn có phép nối
làm **nhân bản dòng tồn theo số BOM mà mã đó tham gia**. Các con số đó sai:

| Mã | Đã nói | Thực tế |
|---|---:|---:|
| F-OCB10 | 6.713 | **959** |
| F-CTO10 | 5.208 | **868** |
| OF-QD10 | 18.700 | **748** |

Kết luận thiết kế **không đổi** — netting vẫn đúng và vẫn đáng làm, và giờ đã được chứng
minh bằng `L-F-OCB10`. Nhưng độ lớn minh hoạ trong bản đặc tả đã được sửa lại theo số
thật. Ví dụ trong đặc tả vẫn hợp lệ vì 458 < 868 < 959.

Con số **18.705 máy WT-028S-RO** trong phần bối cảnh là **đúng** — nó đến từ một truy
vấn khác, không dính lỗi nối này.

---

## 5. Còn lại của giai đoạn 1

`scripts/doi-chieu-mrp.mjs` **chưa tạo**. Kế hoạch dự định tạo nó, nhưng vì khoá công
khai không đọc được dữ liệu, script sẽ chỉ in ra rỗng. Để giai đoạn 2 làm, khi engine
đã nối vào phiên đăng nhập — lúc đó script mới có ý nghĩa và mới đối chiếu được chính
mã JS với dữ liệu thật.
