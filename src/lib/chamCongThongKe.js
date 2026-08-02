// ─────────────────────────────────────────────────────────────────────────────
// Thống kê chấm công theo nhóm — hàm thuần, không chạm Supabase, không chạm React.
//
// Nhóm KHÔNG có bảng riêng: nó là cột `lien_ket_bo_phan` của dòng chỉ tiêu
// `ma = 'CHUYEN_CAN_BO_PHAN'` trong kpi_chi_tieu, tức CÙNG một nguồn với điểm KPI chuyên cần
// bộ phận. Cố ý vậy: chủ app muốn đổi nhóm là điểm KPI đổi theo, không có hai nơi lệch nhau.
// ─────────────────────────────────────────────────────────────────────────────

import { NGAY_PHEP_THANG, trongSoNgayNghi } from './kpiTuDong';

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

const so = v => Number(v) || 0;

// 5 chỉ số của MỘT người trong kỳ. `laMien(ngay)` trả true khi ngày đó đã được admin đánh dấu
// "Đặc biệt" (bảng chuyen_can_ngoai_le).
//
// Quy ước nghỉ phép do chủ app chốt 01/08/2026: ngày nghỉ có giải trình KHÔNG tiêu hạn mức,
// hạn mức NGAY_PHEP_THANG chỉ áp lên các ngày nghỉ chưa có giải trình. Nhờ vậy
// `nghiQuaQuyDinh` bằng ĐÚNG `vuotPhep` mà luatChuyenCanCaNhan dùng để trừ điểm — Task 4 khoá
// điều này bằng test, đừng đổi công thức mà không sửa test đó.
export function thongKeMotNguoi(rows = [], laMien = () => false) {
  let nghiCoDau = 0, nghiChuaDau = 0, phutMuon = 0, phutVeSom = 0, soNgayMien = 0;
  for (const r of rows || []) {
    const mien = !!laMien(r.ngay);
    if (mien) soNgayMien += 1;
    if (r.nghi) {
      // Cộng TRỌNG SỐ chứ không đếm dòng — dùng CHUNG hàm với kpiTuDong.js để con số người
      // xem thấy và con số bị trừ điểm không thể lệch nhau.
      const w = trongSoNgayNghi(r.nghi_text);
      if (mien) nghiCoDau += w;
      else nghiChuaDau += w;
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

// Ai được hiện trong màn phân nhóm của một kỳ.
//
// HỢP của hai nguồn, không phải chỉ lấy theo chấm công: người có dòng chỉ tiêu chuyên cần bộ
// phận trong kỳ là người xếp nhóm ĐƯỢC, còn người có chấm công là người cần THẤY để biết họ
// chưa có chỉ tiêu. Lấy mỗi chấm công thì kỳ chưa nạp chấm công sẽ không phân nhóm được ai —
// đúng lúc cần làm việc đó nhất — và người có chỉ tiêu nhưng không có ngày công nào trong
// tháng (mới vào, nghỉ dài) sẽ biến mất khỏi màn hình.
//
// `coDong` = có dòng chỉ tiêu để mà UPDATE. Người không có thì màn hình khoá ô chọn: tự thêm
// dòng là tự thêm một chỉ tiêu vào bảng KPI của họ mà không ai yêu cầu.
export function dsNguoiPhanNhom({ kpiRows = [], dsNhanVien = [], users = [] } = {}) {
  const coDong = new Set();
  for (const r of kpiRows || []) {
    if (r?.ma === MA_CHI_TIEU_NHOM && r.cap_do === 'CA_NHAN' && r.nhan_vien_id) {
      coDong.add(r.nhan_vien_id);
    }
  }
  const tenCua = id => (users || []).find(u => u.id === id)?.name
    || (dsNhanVien || []).find(x => x.id === id)?.ten
    || id;
  const ids = new Set([...coDong, ...(dsNhanVien || []).map(x => x.id)]);
  return [...ids]
    .map(id => ({ id, ten: tenCua(id), coDong: coDong.has(id) }))
    .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
}
