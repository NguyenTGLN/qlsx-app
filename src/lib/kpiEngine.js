// Luật tính KPI — hàm thuần, KHÔNG import supabase. Mọi màn hình KPI và phần
// xuất Excel đều gọi ở đây, nên luật chỉ được viết một chỗ này.
//
// Nguồn nghiệp vụ: KPI/Copy of KPI kho 06.2026.xls (16 sheet, công thức giống nhau).
//   tỉ lệ đạt  = điểm đạt / chỉ tiêu   (trần 100%)
//   quy đổi    = tỉ lệ × trọng số
//   tổng KPI   = Σ quy đổi             (Σ trọng số = 100)

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Điểm đạt của MỘT chỉ tiêu. `diem_chot` (quản lý chốt tay) thắng nhật ký.
// So sánh với null/undefined chứ không dùng falsy — diem_chot = 0 là giá trị hợp lệ.
//
// `diem_chot` cũng bị kẹp trong [0, chi_tieu] y như đường nhật ký: về ngữ nghĩa nó CHÍNH LÀ
// điểm đạt, mà điểm đạt vượt chỉ tiêu hoặc âm là trạng thái vô nghĩa. Kẹp ở đây (thay vì chỉ
// chặn ở form nhập) để dữ liệu xấu sẵn có trong DB — nhất là bản import từ Excel — không chảy
// ra giao diện, Excel và bản in. Form vẫn phải validate riêng để quản lý biết mình gõ sai.
export function diemDat(ct, logs = []) {
  // Dòng thưởng ngoài trọng số: chi_tieu bỏ trống nên KHÔNG có trần để kẹp.
  // Kẹp về [0, 0] ở đây sẽ nuốt sạch điểm thưởng.
  const laThuong = ct.chi_tieu == null;
  const max = num(ct.chi_tieu);
  if (ct.diem_chot != null) {
    return laThuong ? num(ct.diem_chot) : clamp(num(ct.diem_chot), 0, max);
  }
  const tong = logs.reduce((s, l) => s + num(l.so_diem), 0);
  return clamp(max + tong, 0, max);
}

// Kết quả tính của MỘT dòng chỉ tiêu.
// `bpMap`: { [lien_ket_bo_phan]: điểm đạt của dòng BO_PHAN } — xem tinhBangKpi().
//
// Dòng có lien_ket_bo_phan lấy ĐIỂM ĐẠT từ dòng bộ phận nhưng giữ TRỌNG SỐ riêng:
// chấm một lần cho cả bộ phận, mỗi người quy đổi theo trọng số của mình.
export function tinhChiTieu(ct, logs = [], bpMap = {}) {
  const laBoPhan = !!ct.lien_ket_bo_phan;
  const dat = laBoPhan ? num(bpMap[ct.lien_ket_bo_phan]) : diemDat(ct, logs);
  const max = num(ct.chi_tieu);
  const trongSo = num(ct.trong_so);

  // Dòng thưởng ngoài trọng số nhận diện bằng chi_tieu BỎ TRỐNG (null/undefined), KHÔNG phải
  // chi_tieu = 0. Trong Excel gốc cột chỉ tiêu chỉ có 2/5/6/10/15/24 và dòng thưởng để trống,
  // nên số 0 chỉ có thể là lỗi nhập — suy "thưởng" từ !max sẽ nuốt mất lỗi đó.
  if (ct.chi_tieu == null) {
    // "Chốt tay đè lên nhật ký" là luật chung, KHÔNG có ngoại lệ cho dòng thưởng.
    // Trước đây nhánh này luôn lấy tổng nhật ký nên số chốt bị nuốt im lặng.
    const thuong = ct.diem_chot != null
      ? num(ct.diem_chot)
      : logs.reduce((s, l) => s + num(l.so_diem), 0);
    // CHÚ Ý cho người đọc sau: `diemDat` của dòng thưởng KHÔNG phải điểm thật của dòng
    // (mặc định là 0) — điểm thật nằm ở `diemQuyDoi`. UI/Excel phải đọc cờ `laThuong`
    // để render đúng cột, đừng lấy `diemDat` ra hiển thị.
    return { diemDat: dat, tiLeDat: null, diemQuyDoi: thuong, diemMat: 0, laThuong: true };
  }

  // chi_tieu = 0 (lỗi nhập): không chia cho 0, cho mất trọn trọng số để lỗi lộ ra ngay
  // trên bảng thay vì âm thầm thành dòng thưởng 0 điểm.
  const tiLeDat = max > 0 ? clamp(dat / max, 0, 1) : 0;
  const diemQuyDoi = tiLeDat * trongSo;
  return { diemDat: dat, tiLeDat, diemQuyDoi, diemMat: trongSo - diemQuyDoi, laThuong: false };
}

// Tính cả bảng KPI của MỘT người trong MỘT kỳ.
//   rows: mọi dòng kpi_chi_tieu của kỳ đó — gồm cả dòng cap_do='BO_PHAN' (dùng để lấy
//         điểm chung, KHÔNG hiển thị như chỉ tiêu của cá nhân).
//   logs: mọi dòng kpi_nhat_ky liên quan, gom theo chi_tieu_id.
export function tinhBangKpi(rows = [], logs = []) {
  const logMap = new Map();
  for (const l of logs) {
    if (!logMap.has(l.chi_tieu_id)) logMap.set(l.chi_tieu_id, []);
    logMap.get(l.chi_tieu_id).push(l);
  }

  // Điểm đạt chung của từng nhóm bộ phận, tính trước vì dòng cá nhân phụ thuộc vào nó.
  // Đồng thời nhớ luôn id dòng chung để dòng cá nhân tra ra ngay, khỏi quét lại rows.
  const bpMap = {};
  const bpIdMap = {};
  for (const r of rows) {
    if (r.cap_do !== 'BO_PHAN') continue;
    bpMap[r.lien_ket_bo_phan] = diemDat(r, logMap.get(r.id) || []);
    bpIdMap[r.lien_ket_bo_phan] = r.id;
  }

  const dong = rows
    .filter(r => r.cap_do !== 'BO_PHAN')
    .map(r => {
      const rLogs = logMap.get(r.id) || [];
      // Dòng liên kết bộ phận: bằng chứng VÀ chỗ ghi nhật ký đều nằm ở dòng chung,
      // không phải dòng cá nhân. `__bpId` để form ghi điểm biết insert vào đâu.
      const bpId = r.lien_ket_bo_phan ? bpIdMap[r.lien_ket_bo_phan] : undefined;
      return {
        ...r,
        ...tinhChiTieu(r, rLogs, bpMap),
        logs: bpId ? (logMap.get(bpId) || []) : rLogs,
        __bpId: bpId,
      };
    });

  const tongKpi = dong.reduce((s, d) => s + d.diemQuyDoi, 0);
  const tongMat = dong.reduce((s, d) => s + d.diemMat, 0);
  const danhSachMatDiem = dong
    .filter(d => d.diemMat > 0.0001)
    .sort((a, b) => b.diemMat - a.diemMat);

  return { dong, tongKpi, tongMat, danhSachMatDiem, bpMap };
}

// Σ trọng số phải = 100. Excel không cảnh báo cái này nên rất dễ lệch mà không ai biết.
// Chỉ cộng dòng cá nhân có chi_tieu (bỏ dòng BO_PHAN và dòng thưởng ngoài trọng số).
// Lọc theo `chi_tieu != null` chứ không phải `> 0`: dòng lỗi nhập chi_tieu = 0 vẫn mang
// trọng số thật, phải cộng vào thì cảnh báo lệch mới nổ đúng lúc.
export function kiemTraTrongSo(rows = []) {
  const tong = rows
    .filter(r => r.cap_do !== 'BO_PHAN' && r.chi_tieu != null)
    .reduce((s, r) => s + num(r.trong_so), 0);
  const lech = Math.round((tong - 100) * 1000) / 1000;
  return { tong, lech, hopLe: Math.abs(lech) < 0.001 };
}

const soGon = n => Math.round(n * 100) / 100;
// Phần trăm hiển thị: làm tròn 2 chữ số thay vì lấy số nguyên, để chuỗi diễn giải
// không mâu thuẫn với kết quả thật (vd 1/3 phải là "33.33% × 9 = 3" chứ không phải "33% × 9 = 3").
const phanTram = ti => `${soGon(ti * 100)}%`;

// Diễn giải cách ra được con số — dùng cho popup bằng chứng khi bấm vào bất kỳ điểm nào.
// Trả cấu trúc dữ liệu thuần; UI chỉ render, không tự tính lại (tránh lệch luật).
export function giaiThich(ct, logs = [], bpMap = {}) {
  const kq = tinhChiTieu(ct, logs, bpMap);

  const chotTay = ct.diem_chot != null;
  // Chốt tay ghi rõ ai chốt, lúc nào — dùng chung cho cả dòng thường lẫn dòng thưởng.
  const nguoiChot = ct.chot_boi ? ` bởi ${ct.chot_boi}` : '';
  const lucChot = ct.chot_luc ? ` (${new Date(ct.chot_luc).toLocaleDateString('vi-VN')})` : '';

  if (kq.laThuong) {
    return {
      ten: ct.ten,
      buoc: [{
        nhan: 'Điểm cộng thêm',
        // Chốt tay thì nhật ký KHÔNG còn quyết định điểm nữa, nên diễn giải phải nói đúng
        // nguồn — liệt kê "+1.5" trong khi kết quả là 3 sẽ phá chính mục đích popup bằng chứng.
        dienGiai: chotTay
          ? `Quản lý chốt tay${nguoiChot}${lucChot}: ${soGon(kq.diemQuyDoi)}`
          : (logs.map(l => `${num(l.so_diem) > 0 ? '+' : ''}${num(l.so_diem)}`).join(' ') || '0'),
        ketQua: soGon(kq.diemQuyDoi),
        nguon: chotTay ? 'CHOT_TAY' : 'NHAT_KY',
      }],
      nhatKy: logs,
    };
  }

  const tongLog = logs.reduce((s, l) => s + num(l.so_diem), 0);
  const boPhan = !!ct.lien_ket_bo_phan;

  let buocDat;
  if (boPhan) {
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'BO_PHAN',
      dienGiai: `Chấm chung cả bộ phận: ${soGon(kq.diemDat)}/${ct.chi_tieu}`,
      ketQua: soGon(kq.diemDat),
    };
  } else if (chotTay) {
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'CHOT_TAY',
      dienGiai: `Quản lý chốt tay${nguoiChot}${lucChot}: ${soGon(kq.diemDat)}`,
      ketQua: soGon(kq.diemDat),
    };
  } else {
    const dau = tongLog < 0 ? '−' : '+';
    buocDat = {
      nhan: 'Điểm đạt', nguon: 'NHAT_KY',
      dienGiai: `${ct.chi_tieu} ${dau} ${Math.abs(soGon(tongLog))} = ${soGon(kq.diemDat)}`,
      ketQua: soGon(kq.diemDat),
    };
  }

  return {
    ten: ct.ten,
    buoc: [
      buocDat,
      {
        nhan: 'Tỉ lệ đạt', nguon: 'CONG_THUC',
        dienGiai: `${soGon(kq.diemDat)} / ${ct.chi_tieu} = ${phanTram(kq.tiLeDat)}`,
        ketQua: kq.tiLeDat,
      },
      {
        nhan: 'Điểm quy đổi', nguon: 'CONG_THUC',
        dienGiai: `${phanTram(kq.tiLeDat)} × trọng số ${ct.trong_so} = ${soGon(kq.diemQuyDoi)}`,
        ketQua: soGon(kq.diemQuyDoi),
      },
    ],
    nhatKy: logs,
  };
}
