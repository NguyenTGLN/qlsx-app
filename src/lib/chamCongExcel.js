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
  // tự chọn tháng nhiều dòng nhất: đoán ở đây là xoá nhầm một trọn kỳ chấm công.
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
