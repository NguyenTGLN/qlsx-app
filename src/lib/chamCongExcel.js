// Đọc bảng chấm công của máy chấm công. Hàm THUẦN — không import supabase, không đụng DOM,
// cùng nếp kpiTuDong.js / kpiBangChung.js để test được không cần mạng lẫn trình duyệt.
//
// Logic này trước đây chỉ nằm trong scripts/import-cham-cong.mjs. Tách ra ĐỂ SAU NÀY màn
// hình nạp trong app và script dùng CHUNG một bản — đó là Ý ĐỊNH, nhưng CHƯA THÀNH HIỆN THỰC:
// scripts/import-cham-cong.mjs vẫn đang giữ bản sao riêng của nó, và hai bản đã trôi khỏi
// nhau — vd script kiểm "không có giờ vào" TRƯỚC "lẫn nhiều tháng", còn ở đây thì ngược lại,
// nên cùng một tệp hỏng cả hai kiểu sẽ báo lỗi khác nhau tuỳ đi qua đường nào. Việc nối script
// vào dùng chung bản này để một việc khác xử lý, KHÔNG đụng trong tệp này.
//
// Cột nguồn: Tên nhân viên | Ngày | Thứ | Giờ in sáng | Giờ in chiều | Giờ out | Tăng ca
//            | Đi muộn (phút) | Về sớm (phút) | Nghỉ

// 'dd/MM/yyyy' → 'yyyy-MM-dd'. KHÔNG dùng new Date(): chuỗi dd/MM bị JS đọc thành MM/dd,
// nên 07/01 thành 1 tháng 7 thay vì 7 tháng 1 — sai lặng lẽ, không có lỗi nào báo.
function ngayISO(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// 'h:mm' → số phút, hoặc số nguyên nếu ô ghi thẳng bằng số. Trả {soPhut, loi, macDinh}:
//   - rỗng                          → soPhut=null, loi=null — "không có số liệu" khác hẳn
//                                      "tăng ca 0 phút", nên KHÔNG được gộp về 0.
//   - đọc được (h:mm hoặc số)       → soPhut=số phút, loi=null.
//   - có chữ nhưng KHÔNG đọc được   → soPhut=null, loi khác null, macDinh=true (số liệu THẬT
//                                      SỰ mất, không phục hồi được — khác phutKhongAm() dưới,
//                                      nơi dạng h:mm phục hồi được chứ không mất).
// Vế cuối là chỗ trước đây bị lẫn: ô rác (gõ nhầm) và ô rỗng (không ghi) đều rơi về CÙNG
// null, tức "không có số liệu" và "có ghi nhưng đọc không nổi" cho ra cùng một kết quả —
// đúng cái mà nhánh đầu vừa nói là phải phân biệt. Người gọi PHẢI đẩy `loi` vào cảnh báo,
// không được nuốt lặng lẽ.
function phut(s) {
  const t = String(s ?? '').trim();
  if (!t) return { soPhut: null, loi: null, macDinh: false };
  const m = /^(\d+):(\d{2})$/.exec(t);
  if (m) return { soPhut: Number(m[1]) * 60 + Number(m[2]), loi: null, macDinh: false };
  const n = Number(t);
  if (Number.isFinite(n)) return { soPhut: n, loi: null, macDinh: false };
  return { soPhut: null, loi: `giá trị "${t}" không đọc được`, macDinh: true };
}

// Đọc cột Đi muộn / Về sớm — HAI CỘT NÀY CỘNG THẲNG vào điểm chuyên cần (kpiTuDong.js cộng
// di_muon_phut + ve_som_phut, KHÔNG có sàn chặn số âm).
//
// THỬ HÌNH DẠNG h:mm TRƯỚC — không phải bịa 0. Máy đã ghi 'h:mm' ở cột Tăng ca của chính các
// tệp này (xem phut() trên), nên hình dạng đó hoàn toàn có thể lọt sang hai cột này; '1:27'
// đọc được là 87 phút THẬT, không phải một con số cần đoán. Trả 0 khi vốn dĩ đọc được 87 là
// SAI CÓ HƯỚNG, không trung lập: 0 luôn có lợi cho nhân viên (chuyên cần trông tốt hơn thật),
// nên bịa 0 ở đây không phải "an toàn" mà là một lựa chọn thiên vị âm thầm. Vẫn cảnh báo dù
// đọc thành công (macDinh=false): cột này đáng lẽ không có h:mm — im lặng chấp nhận thì một
// lần đổi định dạng ô trong Excel (hoặc máy chấm công đổi kiểu xuất) sẽ không ai biết.
//
// Số không đọc được theo cả hai cách (không phải h:mm, không phải số thường) hoặc số ÂM thì
// mới thật sự mất (macDinh=true) — không suy ra được giá trị đúng, đành trả 0 và cảnh báo.
//
// KHÔNG NÉM LỖI ở đây — khác với ngày sai định dạng (chặn cả tệp là đúng, vì ngày dùng để
// suy kỳ và ngày cắt). Một ô Đi muộn/Về sớm ghi sai chỉ hỏng ĐÚNG một dòng: trả 0 (không suy
// ra được thì đây là lựa chọn an toàn nhất có thể) và bắt người gọi cảnh báo, để người soát
// tự sửa tay đúng dòng đó — không chặn nạp cả tháng vì một ô lỗi. Cột này là NOT NULL trong
// DB nên luôn phải trả về một số, không được trả null như phut() ở trên.
function phutKhongAm(s) {
  const t = String(s ?? '').trim();
  if (!t) return { soPhut: 0, loi: null, macDinh: false };

  const m = /^(\d+):(\d{2})$/.exec(t);
  if (m) {
    const soPhut = Number(m[1]) * 60 + Number(m[2]);
    return {
      soPhut, macDinh: false,
      loi: `giá trị "${t}" có dạng h:mm (đáng lẽ là số phút) — đã đọc thành ${soPhut} phút, kiểm tra lại cột nguồn`,
    };
  }

  const n = Number(t);
  if (!Number.isFinite(n)) {
    return { soPhut: 0, macDinh: true, loi: `giá trị "${t}" không đọc được — tính là 0 phút` };
  }
  if (n < 0) {
    return { soPhut: 0, macDinh: true, loi: `giá trị "${t}" là số âm — tính là 0 phút` };
  }
  return { soPhut: n, loi: null, macDinh: false };
}

// 'HH:mm' → phút trong ngày, để so giờ out với giờ in chiều.
function gio(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Ngày này có phải ngày làm việc THẬT không: BẤT KỲ một trong ba cột giờ (vào sáng / vào
// chiều / ra) có ghi nhận — KHÔNG chỉ nhìn một mình "Giờ in sáng". Có ngày cả nhóm chỉ quét
// buổi CHIỀU (nghỉ sáng có việc riêng, hoặc quên quét sáng): cột sáng trống nhưng đó vẫn là
// một ngày làm việc thật. Nhìn một cột thì NGÀY CẮT (xem suyRaKyVaNgayCat dưới) lùi về trước
// ngày đó, và những dòng có thật của đúng ngày đó bị loại qua boQuaNgaySau — mất dữ liệu thật
// mà không gì phân biệt được với "ngày chưa tới" trong log.
const coGioLam = r => [3, 4, 5].some(i => String(r?.[i] ?? '').trim() !== '');

// Suy ra KỲ và NGÀY CẮT từ chính dữ liệu, không ai phải gõ tay.
//
// NGÀY CẮT = ngày CUỐI CÙNG có ít nhất một ngày làm việc thật (coGioLam — xem định nghĩa
// trên). Máy chấm công xuất trọn tháng kể cả ngày chưa tới; những ngày đó không cột giờ nào
// có dữ liệu. Để nguyên thì mỗi ngày như vậy thành một ngày NGHỈ của cả 13 người, mà luật
// chuyên cần trừ 3 điểm mỗi ngày nghỉ vượt phép — nạp nhầm một tệp xuất giữa tháng là xoá sổ
// điểm chuyên cần của cả công ty.
//
// Quy tắc tự đúng cho cả hai trường hợp nên không cần ai nhớ chỉnh:
//   - tệp xuất giữa tháng → cắt ở ngày cuối thực sự có người đi làm
//   - tệp xuất hết tháng  → mọi ngày đều có người đi làm, lấy trọn tháng
//
// Cũng trả `ngayCuoiTep` — ngày CUỐI CÙNG có mặt trong tệp, KỂ CẢ ngày không ai đi làm.
// Đây là chiều ngược lại của lỗi trên (cắt LÙI oan): một dòng quét NHẦM ngày trong tương lai
// kéo denNgay vọt LÊN, nuốt luôn mọi ngày chưa tới ở giữa — và không suy luận nào tự phân
// biệt nổi "ngày thật" với "một dòng quét nhầm" chỉ từ chính dữ liệu đó. Không tự sửa được
// thì phải LỘ RA NGOÀI: so `denNgay` với `ngayCuoiTep` lệch nhau là dấu hiệu cần người nhìn
// qua trước khi nạp — việc so sánh đó để màn hình xem trước làm, không phải hàm này.
//
// Đầu vào `dongTho` là mảng {ngay, coGioLam} — TRÙNG TÊN với hàm coGioLam() phía trên vì nó
// CHÍNH LÀ giá trị mà hàm đó tính ra cho từng dòng (docDongChamCong gán coGioLam: coGioLam(r)
// khi build mảng này); đặt tên khác thì trường dữ liệu và hàm tính ra nó lại mang hai cái tên
// khác nhau, dễ tưởng nhầm là hai khái niệm.
export function suyRaKyVaNgayCat(dongTho = []) {
  const thang = new Map();
  let denNgay = null;
  let ngayCuoiTep = null;
  for (const r of dongTho) {
    if (!r.ngay) continue;
    const k = r.ngay.slice(0, 7);
    thang.set(k, (thang.get(k) || 0) + 1);
    if (ngayCuoiTep === null || r.ngay > ngayCuoiTep) ngayCuoiTep = r.ngay;
    if (r.coGioLam && (denNgay === null || r.ngay > denNgay)) denNgay = r.ngay;
  }
  if (!thang.size) {
    throw new Error(
      'Không có dòng dữ liệu chấm công nào để đọc. Kiểm tra lại tệp nguồn (đúng sheet, '
      + 'đúng định dạng) rồi thử lại.');
  }

  // Lẫn nhiều tháng là bất thường (máy xuất lẫn, hoặc chọn sai khoảng). DỪNG chứ không
  // tự chọn tháng nhiều dòng nhất: đoán ở đây là xoá nhầm trọn một kỳ chấm công.
  if (thang.size > 1) {
    const ds = [...thang.entries()].map(([k, v]) => `${k} (${v} dòng)`).join(', ');
    throw new Error(`Tệp lẫn nhiều tháng: ${ds}. Xuất lại đúng MỘT tháng rồi thử lại.`);
  }
  if (!denNgay) {
    throw new Error(
      'Không có dòng nào ghi giờ vào/ra trong cả tệp. Kiểm tra lại tệp có đúng là bảng chấm '
      + 'công không, hoặc xuất lại từ máy chấm công rồi thử lại.');
  }
  return { ky: [...thang.keys()][0], denNgay, ngayCuoiTep };
}

const MAX_VI_DU_COT = 3;

// Đếm gộp cảnh báo THEO CỘT thay vì đẩy một dòng cho mỗi ô lỗi — một tệp hỏng cả cột (đổi
// định dạng ô trong Excel, đổi máy chấm công...) ra HÀNG TRĂM dòng gần giống hệt nhau, không
// đọc nổi trong một modal, và sự thật quan trọng nhất — "cả cột mất" — bị chôn dưới hàng trăm
// dòng lặt vặt. Tách hai loại ngay từ khi đếm, không gộp chung một con số:
//   - `macDinh`: ô THẬT SỰ mất số liệu (rơi về 0 hoặc null) — số đang SAI.
//   - `phucHoi`: ô đọc lại được (hình dạng h:mm ở phutKhongAm) nhưng đáng ngờ vì lẽ ra không
//     thuộc cột này — số ĐÚNG nhưng nguồn cần xem lại.
// Gộp chung sẽ che mất khác biệt "số đang sai, phải sửa" và "số đúng, chỉ nên liếc qua".
function taoBoDemCot() {
  return { tong: 0, macDinh: 0, phucHoi: 0, viDu: [] };
}

function ghiNhanCot(bo, kq, viDu) {
  bo.tong++;
  if (!kq.loi) return;
  if (kq.macDinh) bo.macDinh++; else bo.phucHoi++;
  if (bo.viDu.length < MAX_VI_DU_COT) bo.viDu.push(viDu);
}

// Một dòng TÓM TẮT dẫn đầu cho một cột có vấn đề — "X/Y ô có vấn đề" không đủ, người đọc cần
// biết ĐIỀU GÌ đang sai theo số đó: "chuyên cần đang bị bỏ hẳn" khác hẳn "tăng ca đang null".
function tomTatCot(ten, bo) {
  const soLoi = bo.macDinh + bo.phucHoi;
  const phan = [];
  if (bo.macDinh) {
    phan.push(ten === 'Tăng ca'
      ? `${bo.macDinh} ô không đọc được, đang tính "không có số liệu"`
      : `${bo.macDinh} ô không đọc được, đang tính 0 phút — số liệu thật đã bị BỎ`);
  }
  if (bo.phucHoi) {
    phan.push(`${bo.phucHoi} ô dạng h:mm đọc lại được (không phải hình dạng đúng của cột này) — nên kiểm tra lại`);
  }
  return `cột ${ten}: ${soLoi}/${bo.tong} ô có vấn đề — ${phan.join('; ')}.`;
}

// `raw` = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
export function docDongChamCong(raw = []) {
  // Tìm dòng tiêu đề thay vì cắt cứng số dòng đầu: tệp xuất lại có thể thêm/bớt dòng ghi
  // chú, cắt cứng thì lệch một dòng là mất bản ghi đầu tiên mà không báo gì.
  const hdr = raw.findIndex(r => String(r?.[0] ?? '').trim() === 'Tên nhân viên');
  if (hdr < 0) {
    throw new Error(
      'Không tìm thấy dòng tiêu đề "Tên nhân viên". Kiểm tra lại: tệp đã mở đúng sheet '
      + '"CHI TIẾT THEO NGÀY" trong bản xuất từ máy chấm công chưa, rồi thử lại.');
  }

  const tho = [];
  for (let i = hdr + 1; i < raw.length; i++) {
    const r = raw[i];
    const tenExcel = String(r?.[0] ?? '').trim();
    if (!tenExcel) continue;
    const ngay = ngayISO(r[1]);
    if (!ngay) {
      throw new Error(
        `Ngày không đọc được ở dòng ${i + 1}: giá trị "${r?.[1] ?? ''}". Cột Ngày phải theo `
        + 'định dạng dd/MM/yyyy (ví dụ 01/07/2026) — sửa lại ô này trong tệp Excel rồi nạp lại.');
    }
    tho.push({ r, tenExcel, ngay, coGioLam: coGioLam(r) });
  }

  const { ky, denNgay, ngayCuoiTep } = suyRaKyVaNgayCat(tho);

  const dong = [];
  const canhBao = [];
  let boQuaNgaySau = 0;
  const cotLoi = {
    'Tăng ca': taoBoDemCot(),
    'Đi muộn': taoBoDemCot(),
    'Về sớm': taoBoDemCot(),
  };

  for (const { r, tenExcel, ngay } of tho) {
    if (ngay > denNgay) { boQuaNgaySau++; continue; }

    const inChieu = gio(r[4]);
    const out = gio(r[5]);
    const tangCaKq = phut(r[6]);
    const diMuonKq = phutKhongAm(r[7]);
    const veSomKq = phutKhongAm(r[8]);
    ghiNhanCot(cotLoi['Tăng ca'], tangCaKq, `${tenExcel} ${r[1]}: ${tangCaKq.loi}`);
    ghiNhanCot(cotLoi['Đi muộn'], diMuonKq, `${tenExcel} ${r[1]}: ${diMuonKq.loi}`);
    ghiNhanCot(cotLoi['Về sớm'], veSomKq, `${tenExcel} ${r[1]}: ${veSomKq.loi}`);

    let veSom = veSomKq.soPhut;
    let nghiVan = null;

    // Máy ghi giờ ra SỚM HƠN lượt quét buổi chiều → người đó rõ ràng vẫn ở công ty, giờ
    // out bị lấy nhầm. Từng thấy 9 dòng kiểu này ở một bản xuất T7 cũ (tệp đó không còn để
    // đối chiếu — đo lại trên cả 3 tệp hiện có trên đĩa, T2/T6/T7, thì cả ba đều ra 0 dòng
    // KHỚP GUARD này — tức 0 dòng vừa out<inChieu vừa veSom>0). Guard vẫn phải giữ nguyên:
    // máy có thể lặp lại lỗi này ở bất kỳ tháng nào, và vì KHÔNG tệp thật nào đang đi qua
    // nhánh này, bộ test bên dưới LÀ đặc tả duy nhất của nó — xoá test coi như xoá luôn
    // nhánh mà không ai biết.
    // Để nguyên thì luật chuyên cần trừ trọn 10 điểm, mà CHUYÊN CẦN BỘ PHẬN là điểm CHUNG
    // nên cả nhóm mất theo vì một lỗi máy. Bỏ phần về sớm và gắn cờ cho người soát.
    //
    // Cảnh báo của nhánh này KHÔNG gộp vào cotLoi ở trên: đây là dấu hiệu về MỘT NGÀY cụ thể
    // (máy có thể ghi sai giờ ra hôm đó), không phải một CỘT đổi định dạng — gộp chung sẽ lẫn
    // hai loại vấn đề khác hẳn nhau vào cùng một tóm tắt.
    if (out !== null && inChieu !== null && out < inChieu && veSom > 0) {
      canhBao.push(`${tenExcel} ${r[1]}: giờ out ${r[5]} sớm hơn giờ in chiều ${r[4]} — bỏ ${veSom} phút về sớm`);
      veSom = 0;
      nghiVan = 'GIO_OUT_TRUOC_GIO_IN_CHIEU';
    }

    const nghiRaw = String(r[9] ?? '').trim();

    dong.push({
      tenExcel, ngay,
      thu: r[2] || null,
      inSang: r[3] || null, inChieu: r[4] || null, out: r[5] || null,
      tangCa: tangCaKq.soPhut,
      diMuon: diMuonKq.soPhut,
      veSom,
      nghi: nghiRaw !== '',
      // Chữ GỐC của cột Nghỉ, KHÔNG dùng để tính `nghi` (chủ ý — xem trên): 'Nghỉ sáng' /
      // 'Nghỉ chiều' / 'Nghỉ tết' đều gộp thành nghi=true như cũ, quyết định có tách nửa
      // ngày ra tính khác hay không là của chủ app ở một việc khác, không phải việc parser
      // tự quyết. Giữ lại chữ gốc ở đây chỉ để thông tin đó KHÔNG bị xoá mất tại nguồn — nơi
      // dùng nó có thể chưa tồn tại, và đó là chủ ý.
      nghiText: nghiRaw || null,
      nghiVan,
    });
  }

  // Một dòng TÓM TẮT dẫn đầu cho mỗi cột có ô lỗi, kèm vài ví dụ (tối đa MAX_VI_DU_COT) —
  // KHÔNG một dòng cho mỗi ô lỗi (xem taoBoDemCot/tomTatCot). `cotLoi` cũng được trả nguyên
  // dạng dữ liệu có cấu trúc (canhBaoCot) để màn hình xem trước hiển thị nổi bật, không phải
  // tự parse chuỗi trong canhBao.
  for (const [ten, bo] of Object.entries(cotLoi)) {
    if (!bo.macDinh && !bo.phucHoi) continue;
    canhBao.push(tomTatCot(ten, bo));
    bo.viDu.forEach(v => canhBao.push(`  - ${v}`));
  }

  return { dong, ky, denNgay, ngayCuoiTep, canhBao, canhBaoCot: cotLoi, boQuaNgaySau };
}

// Chuẩn hoá một họ tên trước khi so khớp: gộp Unicode về NFC + gộp khoảng trắng thừa + trim.
//
// Áp cho CẢ HAI PHÍA của phép nối, không chỉ phía Excel. Tên trong tệp Excel do máy chấm
// công xuất luôn ra NFC (đo trên cả 3 tệp thật đang có: T2/T6/T7 đều NFC), nhưng
// `ten_cham_cong` do người gõ tay qua app ở một việc sau có thể ra NFD (một số bộ gõ dựng
// chữ có dấu bằng ký tự tổ hợp riêng) — cùng một chữ, hai chuỗi byte khác nhau, so khớp
// thẳng theo Map thì trật. Chỗ đáng ngại nhất: tên đó rơi vào tenChuaBiet và hiện ra NHÌN Y
// HỆT tên đã có trong hệ thống — người xem không thể tự phát hiện hai chuỗi khác nhau ở tầng
// byte chỉ bằng mắt.
const chuanHoaTen = s => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

// Nối họ tên trong tệp với nhân viên qua cột `ten_cham_cong`.
//
// KHÔNG đoán bằng quy tắc "lấy chữ cuối họ tên": đúng 12/13 người, nhưng sai ở
// 'Vương Tuấn Anh' (tên gọi là 'Tuấn', chữ cuối là 'Anh'), và 'Nguyễn Xuân Thiện' chứa
// chữ 'Xuân' vốn là tên gọi của người KHÁC. Đoán sai ở đây là gán trọn tháng chấm công
// của người này sang người kia — không có lỗi nào báo, và điểm KPI hai người cùng sai.
export function noiTenNhanVien(dong = [], nhanVien = []) {
  // Gom theo tên đã chuẩn hoá → DANH SÁCH id (không chốt 1-1 ngay): phải biết đủ ai trùng
  // trước khi quyết định trùng đó có ĐỤNG tới tệp đang nạp hay không — quyết định "chặn hẳn
  // hay chỉ cảnh báo" chỉ ra được sau khi đã biết cả hai phía.
  const theoTen = new Map();
  for (const nv of nhanVien) {
    const t = chuanHoaTen(nv?.ten_cham_cong);
    if (!t) continue;
    if (!theoTen.has(t)) theoTen.set(t, []);
    theoTen.get(t).push(nv.id);
  }

  const tenTrongFile = new Set(dong.map(d => chuanHoaTen(d.tenExcel)));

  // Trùng ten_cham_cong sau chuẩn hoá: CHỈ CHẶN khi tệp đang nạp thật sự có dòng của tên đó.
  //
  // Trùng tồn tại trong bảng nhân viên KHÔNG có nghĩa lần nạp NÀY bị ảnh hưởng — hai người đã
  // nghỉ việc trùng tên chấm công từ lâu không liên quan gì tới việc nạp tháng này nếu tệp
  // tháng này không nhắc tới họ. Chặn cả import vì một cặp trùng NẰM YÊN là chặn oan.
  //
  // Nhưng khi tệp CÓ dòng của đúng tên trùng đó thì bắt buộc phải chặn: Task 2 chỉ đặt được
  // unique index trên giá trị RAW của ten_cham_cong, nên 'Lê Văn Bích' và 'Lê  Văn Bích' (hai
  // dấu cách) là hai dòng HỢP LỆ trong DB dù chuanHoaTen() ở trên gộp chúng làm một — DB không
  // chặn được cặp này, module này là nơi DUY NHẤT phát hiện ra va chạm trước khi nó gán nhầm
  // chấm công của người này sang người kia mà không có lỗi nào báo.
  const trungCoAnhHuong = [];
  const canhBao = [];
  for (const [t, ids] of theoTen) {
    if (ids.length < 2) continue;
    if (tenTrongFile.has(t)) {
      trungCoAnhHuong.push(`"${t}" (id: ${ids.join(', ')})`);
    } else {
      canhBao.push(
        `Nhân viên trùng ten_cham_cong "${t}" (id: ${ids.join(', ')}) — không thuộc tệp `
        + 'đang nạp lần này nên chưa chặn, nhưng nên sửa lại sớm.');
    }
  }
  if (trungCoAnhHuong.length) {
    throw new Error(
      'Trùng ten_cham_cong (sau khi bỏ khoảng trắng thừa/chuẩn hoá Unicode) mà tệp đang nạp '
      + `CÓ liên quan, không thể biết nối vào ai: ${trungCoAnhHuong.join('; ')}. Sửa lại `
      + 'ten_cham_cong cho từng người một khác nhau rồi thử lại.');
  }

  const chuaBiet = [];
  const dongDaNoi = dong.map(d => {
    const ten = chuanHoaTen(d.tenExcel);
    const ids = theoTen.get(ten);
    const nhanVienId = ids && ids.length === 1 ? ids[0] : null;
    if (!nhanVienId && !chuaBiet.includes(ten)) chuaBiet.push(ten);
    return { ...d, nhanVienId };
  });

  return { dongDaNoi, tenChuaBiet: chuaBiet, canhBao };
}
