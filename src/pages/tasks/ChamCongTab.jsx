import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import {
  gomThongKe, tongTatCa, docNhomTuKpi, MA_CHI_TIEU_NHOM, dsNguoiPhanNhom,
} from '../../lib/chamCongThongKe';
import { loiGhiKpi } from '../../lib/kpiWriteGuard';
import NapChamCong from './NapChamCong';
import { ChevronLeft, AlertTriangle, Loader2, ChevronRight, Users, Upload } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Xem bảng chấm công gốc (dữ liệu máy chấm công) — căn cứ của 2 chỉ tiêu chuyên cần
// trong KPI. Chủ app trước đây phải vào Supabase mới xem được, nhân viên không có chỗ
// nào để tự tra vì sao mình bị trừ điểm. Từng Ô vẫn KHÔNG sửa được — dữ liệu chỉ vào
// theo CẢ KỲ một lượt, qua nút "Nạp từ Excel" ngay trong màn hình này (NapChamCong.jsx)
// hoặc qua scripts/import-cham-cong.mjs chạy tay. Cả hai ĐÁNG LẼ đọc tệp qua chung một
// bộ hàm thuần ở src/lib/chamCongExcel.js — đó là Ý ĐỊNH, nhưng CHƯA THÀNH HIỆN THỰC:
// script vẫn giữ bản sao riêng của nó (xem đầu chamCongExcel.js).
// ─────────────────────────────────────────────────────────────────────────────

// Kỳ mặc định = tháng hiện tại, dạng 'YYYY-MM'. Copy nguyên từ KpiTab.jsx cho đồng bộ.
function kyHienTai() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' → 'DD/MM'.
function ngayGon(ngay) {
  const [, thang, ngayS] = ngay.split('-');
  return `${ngayS}/${thang}`;
}

// 'HH:MM:SS' | null → 'HH:MM' | '—'.
function gioGon(v) {
  if (!v) return '—';
  return String(v).slice(0, 5);
}

// Tiêu đề rê-chuột của MỘT ô ngày công — luôn có, kể cả ô "đi làm bình thường", để rê
// chuột vào đâu cũng biết chuyện gì đã xảy ra ngày đó.
function tieuDeO(row) {
  const macDinh = `${ngayGon(row.ngay)} (${row.thu})`;
  const phan = [];
  if (row.nghi) phan.push('nghỉ');
  if (row.di_muon_phut > 0) phan.push(`muộn ${row.di_muon_phut} phút`);
  if (row.ve_som_phut > 0) phan.push(`về sớm ${row.ve_som_phut} phút`);
  if (row.tang_ca_phut > 0) phan.push(`tăng ca ${row.tang_ca_phut} phút`);
  let dong = phan.length ? phan.join(', ') : 'đi làm bình thường';
  if (row.nghi_van) {
    dong += ' — dữ liệu nghi vấn: máy chấm công ghi giờ ra sớm hơn lượt quét buổi chiều, ' +
      'phần về sớm đã bị bỏ khi tính KPI';
  }
  return `${macDinh} — ${dong}`;
}

const oInput = {
  padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: '0.8rem', width: '100%', boxSizing: 'border-box', background: '#fff',
};

export default function ChamCongTab({ users = [], me, perm = {} }) {
  const canEdit = !!perm.edit;
  const [ky, setKy] = useState(kyHienTai());
  const [rows, setRows] = useState([]);
  const [ngoaiLe, setNgoaiLe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState(null); // nhan_vien_id đang xem chi tiết, null = bảng tổng quan
  const [kpiRows, setKpiRows] = useState([]);       // dòng chỉ tiêu chở khoá nhóm
  // Tập khoá nhóm đang lọc. RỖNG = xem tất cả (không phải "không xem gì") — giữ đúng hành vi
  // cũ khi chưa ai bấm nút nào. 'KHONG_NHOM' là khoá giả của nhóm "Chưa phân nhóm".
  const [locNhom, setLocNhom] = useState(() => new Set());
  const [bung, setBung] = useState(() => new Set()); // khoá nhóm đang bung trong khối thống kê
  const [manPhanNhom, setManPhanNhom] = useState(false);
  const [moNap, setMoNap] = useState(false); // true = đang mở modal "Nạp từ Excel" (NapChamCong.jsx)

  const taiDuLieu = useCallback(async () => {
    setLoading(true);
    setLoi('');
    try {
      // `.order('id')` là tie-break bắt buộc, xem luật ở KpiTab.jsx / lib/supabase.js:
      // fetchAllRows gom theo từng đợt 1000 dòng, nhiều dòng cùng `ngay` sẽ trùng dày đặc
      // nếu không có tie-break cố định.
      const { data, error } = await fetchAllRows(() =>
        supabase.from('cham_cong').select('*').eq('ky', ky).order('id'));
      if (error) throw error;
      setRows(data || []);
      // Miễn trừ tải RIÊNG và mềm: hỏng chỗ này (vd bảng chuyen_can_ngoai_le chưa tạo trên
      // Supabase) KHÔNG được xoá bảng chấm công đang hiển thị — chỉ là không có badge miễn trừ.
      try {
        const { data: nl, error: loiNl } = await fetchAllRows(() =>
          supabase.from('chuyen_can_ngoai_le').select('*').eq('ky', ky).order('id'));
        if (loiNl) throw loiNl;
        setNgoaiLe(nl || []);
      } catch {
        setNgoaiLe([]);
      }
      // Nhóm tải RIÊNG và MỀM, cùng lý do như miễn trừ: hỏng chỗ này (mất mạng, RLS đổi) KHÔNG
      // được xoá bảng chấm công đang hiển thị. Mất nhóm thì tab lui về đúng hành vi cũ — một
      // danh sách phẳng, không lọc được — vẫn dùng được.
      try {
        const { data: kp, error: loiKp } = await fetchAllRows(() =>
          supabase.from('kpi_chi_tieu')
            .select('id, ky, cap_do, nhan_vien_id, lien_ket_bo_phan, ten, ma')
            .eq('ky', ky).eq('ma', MA_CHI_TIEU_NHOM).order('id'));
        if (loiKp) throw loiKp;
        setKpiRows(kp || []);
      } catch {
        setKpiRows([]);
      }
    } catch (err) {
      setLoi(err?.message || String(err));
      setRows([]);
      setNgoaiLe([]);
      setKpiRows([]);
    } finally {
      setLoading(false);
    }
  }, [ky]);

  useEffect(() => { taiDuLieu(); }, [taiDuLieu]);

  // Các ngày CÓ trong dữ liệu — không vẽ cứng 1→31, dữ liệu tháng có thể chỉ tới giữa
  // tháng và vẽ thừa cột trống sẽ làm người đọc tưởng cả công ty nghỉ những ngày đó.
  const dsNgay = useMemo(() => {
    const set = new Set(rows.map(r => r.ngay));
    return Array.from(set).sort();
  }, [rows]);

  const thuTheoNgay = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (!m.has(r.ngay)) m.set(r.ngay, r.thu);
    return m;
  }, [rows]);

  // Người có trong cham_cong mà không có trong `users` vẫn phải hiện — lấy id làm tên,
  // không được lặng lẽ bỏ dòng.
  const dsNhanVien = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.nhan_vien_id)));
    return ids
      .map(id => ({ id, ten: users.find(u => u.id === id)?.name || id }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  }, [rows, users]);

  const oTraCuu = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(`${r.nhan_vien_id}|${r.ngay}`, r);
    return m;
  }, [rows]);

  const ngoaiLeTra = useMemo(() => {
    const m = new Map();
    for (const x of ngoaiLe) m.set(`${x.nhan_vien_id}|${x.ngay}`, x);
    return m;
  }, [ngoaiLe]);

  // Bật (lyDo là chuỗi) hoặc tắt (lyDo = null) miễn trừ cho một (người, ngày).
  // RLS ở DB chỉ cho ADMIN ghi — nút chỉ hiện khi canEdit, còn đây là hàng rào mềm.
  const doiNgoaiLe = useCallback(async (nvId, ngay, lyDo) => {
    setLoi('');
    try {
      if (lyDo == null) {
        const { error } = await supabase.from('chuyen_can_ngoai_le')
          .delete().eq('nhan_vien_id', nvId).eq('ngay', ngay);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chuyen_can_ngoai_le').upsert(
          { ky: ngay.slice(0, 7), nhan_vien_id: nvId, ngay, ly_do: lyDo, nguoi_ghi: me?.name || me?.id || null },
          { onConflict: 'nhan_vien_id,ngay' });
        if (error) throw error;
      }
      await taiDuLieu();
    } catch (err) {
      setLoi(err?.message || String(err));
    }
  }, [me, taiDuLieu]);

  // Đổi nhóm chuyên cần của MỘT người trong kỳ đang xem.
  //
  // ⚠ Đây là lệnh ghi vào kpi_chi_tieu — cùng bảng quyết định điểm KPI. Điểm chuyên cần bộ
  // phận của CẢ nhóm cũ lẫn nhóm mới sẽ đổi ngay lần mở tab KPI kế tiếp, vì điểm tính trên
  // trung bình đầu người. Chủ app chọn có chủ đích (01/08/2026).
  //
  // `.select()` + loiGhiKpi là BẮT BUỘC: PostgREST trả 204 với error === null khi RLS lọc sạch
  // dòng, nên chỉ kiểm `if (error)` là báo "đã lưu" cho một thao tác không chạm được dòng nào.
  const doiNhom = useCallback(async (nvId, khoaMoi) => {
    setLoi('');
    const { data, error } = await supabase.from('kpi_chi_tieu')
      .update({ lien_ket_bo_phan: khoaMoi })
      .eq('ky', ky).eq('ma', MA_CHI_TIEU_NHOM)
      .eq('cap_do', 'CA_NHAN').eq('nhan_vien_id', nvId)
      .select();
    const loiGhi = loiGhiKpi(error, data);
    if (loiGhi) { setLoi(loiGhi); return; }
    await taiDuLieu();
  }, [ky, taiDuLieu]);

  const tongTheoNguoi = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const cur = m.get(r.nhan_vien_id) || { muon: 0, somSom: 0, nghi: 0 };
      cur.muon += r.di_muon_phut || 0;
      cur.somSom += r.ve_som_phut || 0;
      if (r.nghi) cur.nghi += 1;
      m.set(r.nhan_vien_id, cur);
    }
    return m;
  }, [rows]);

  const soDongNghiVan = useMemo(() => rows.filter(r => r.nghi_van).length, [rows]);

  const dsThongKe = useMemo(
    () => gomThongKe({ rows, ngoaiLe, kpiRows, users }),
    [rows, ngoaiLe, kpiRows, users]);

  const nhomCuaNguoi = useMemo(() => docNhomTuKpi(kpiRows).theoNguoi, [kpiRows]);

  // Người hiện trong màn phân nhóm = HỢP của (người có chỉ tiêu KPI nhóm) và (người có chấm
  // công) trong kỳ — xem chamCongThongKe.js. Phải tính TRƯỚC mọi return sớm bên dưới, vì
  // return sớm if (manPhanNhom) dùng ngay kết quả này.
  const dsNguoiXepNhom = useMemo(
    () => dsNguoiPhanNhom({ kpiRows, dsNhanVien, users }), [kpiRows, dsNhanVien, users]);

  // Danh sách nhóm cho ô lọc — chỉ nhóm THẬT SỰ có người trong kỳ, không liệt kê nhóm rỗng.
  const dsNhomLoc = useMemo(
    () => dsThongKe.map(n => ({ gia: n.khoa == null ? 'KHONG_NHOM' : n.khoa, nhan: n.nhan })),
    [dsThongKe]);

  const dsThongKeLoc = useMemo(() => {
    if (!locNhom.size) return dsThongKe;
    return dsThongKe.filter(n => locNhom.has(n.khoa == null ? 'KHONG_NHOM' : n.khoa));
  }, [dsThongKe, locNhom]);

  const idsHienThi = useMemo(
    () => new Set(dsThongKeLoc.flatMap(n => n.thanhVien.map(x => x.id))),
    [dsThongKeLoc]);

  // Lưới lịch lọc theo NGƯỜI, KHÔNG lọc theo ngày: bỏ bớt cột ngày khi lọc nhóm sẽ làm người
  // đọc tưởng những ngày đó cả công ty nghỉ.
  const dsNhanVienLoc = useMemo(
    () => dsNhanVien.filter(nv => idsHienThi.has(nv.id)), [dsNhanVien, idsHienThi]);

  const soNgayCongLoc = useMemo(
    () => rows.filter(r => idsHienThi.has(r.nhan_vien_id)).length, [rows, idsHienThi]);

  const soNghiVanLoc = useMemo(
    () => rows.filter(r => r.nghi_van && idsHienThi.has(r.nhan_vien_id)).length,
    [rows, idsHienThi]);

  const tenNhomDangLoc = useMemo(
    () => dsNhomLoc.filter(n => locNhom.has(n.gia)).map(n => n.nhan).join(', '),
    [dsNhomLoc, locNhom]);

  // Mỗi lần ĐỔI bộ lọc thì đặt lại phần bung theo bộ lọc: chọn đúng một nhóm thì bung sẵn nhóm
  // đó (người dùng vừa nói rõ họ quan tâm nhóm nào), còn lại thì thu hết.
  //
  // Phải THU khi có từ 2 nhóm, không chỉ "không bung thêm": người ta chọn nhiều nhóm bằng cách
  // bấm lần lượt, nên nhóm bấm đầu tiên đã tự bung lúc nó còn một mình. Để nguyên thì màn hình
  // thành một nhóm xổ hết người chen trên một nhóm thu gọn — đúng cái bố cục làm mất khả năng
  // so sánh hai nhóm với nhau, mà so sánh mới là lý do người ta chọn nhiều nhóm.
  //
  // Không sợ đè lên thao tác tay: effect chỉ chạy khi `locNhom` đổi, còn tự bung/thu một nhóm
  // chỉ đụng `bung` — bấm bung xong vẫn giữ nguyên cho tới khi đổi bộ lọc.
  useEffect(() => {
    setBung(locNhom.size === 1 ? new Set(locNhom) : new Set());
  }, [locNhom]);

  // Bộ lọc TỰ GỠ những nhóm không còn tồn tại, giữ lại các nhóm vẫn còn. Bắt buộc phải có:
  // đang lọc SẢN XUẤT ở kỳ 2026-07 rồi chuyển sang kỳ 2026-06 (kỳ đó cả công ty chung MỘT
  // nhóm, không có CHUYEN_CAN_SX) thì không nhóm nào khớp — màn hình trắng trơn và người dùng
  // không hiểu vì sao, vì dãy nút lọc lúc đó cũng đã biến mất.
  useEffect(() => {
    const con = new Set(dsNhomLoc.map(n => n.gia));
    if ([...locNhom].every(k => con.has(k))) return;   // không đổi gì → không setState, tránh lặp vô hạn
    setLocNhom(s => new Set([...s].filter(k => con.has(k))));
  }, [dsNhomLoc, locNhom]);

  // if (manPhanNhom) PHẢI đứng trước if (loading): doiNhom (đổi nhóm) gọi taiDuLieu() ở cuối,
  // mà taiDuLieu() luôn setLoading(true) trước khi fetch. Nếu if (loading) đứng trước, mỗi lần
  // chọn một nhóm trong ô select cả màn hình sẽ nháy về "Đang tải chấm công…" rồi mới quay lại
  // màn phân nhóm — trong khi dữ liệu cũ (kpiRows, dsNhanVien) vẫn hiển thị đúng bình thường
  // cho tới khi có dữ liệu mới, không có lý do gì phải nhường chỗ cho màn hình tải.
  if (manPhanNhom) {
    return (
      <ManPhanNhom
        ky={ky} kpiRows={kpiRows} dsNguoi={dsNguoiXepNhom} nhomCuaNguoi={nhomCuaNguoi}
        loi={loi} onDoiNhom={doiNhom} onBack={() => setManPhanNhom(false)}
      />
    );
  }

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
      <Loader2 size={18} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />
      Đang tải chấm công…
    </div>
  );

  if (chon) {
    const nv = dsNhanVien.find(x => x.id === chon) || { id: chon, ten: chon };
    return (
      <BangChiTietMotNguoi
        ten={nv.ten} ky={ky} nvId={chon}
        rows={rows.filter(r => r.nhan_vien_id === chon)}
        ngoaiLeTra={ngoaiLeTra} canEdit={canEdit} onDoiNgoaiLe={doiNgoaiLe}
        onBack={() => setChon(null)}
      />
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="month" value={ky} onChange={e => setKy(e.target.value || kyHienTai())}
          style={{ ...oInput, width: 'auto' }}
        />
        {/* Hai nút VIỆC đứng liền ô chọn tháng, dãy nút LỌC đứng sau: nút việc luôn có mặt và
            rộng cố định, còn dãy lọc dài ngắn theo số nhóm của kỳ — xếp ngược lại thì mỗi lần
            đổi kỳ hai nút việc lại nhảy chỗ. */}
        {canEdit && (
          <button onClick={() => setMoNap(true)} style={nutNapExcel}>
            <Upload size={13} /> Nạp từ Excel
          </button>
        )}
        {canEdit && kpiRows.length > 0 && (
          <button onClick={() => setManPhanNhom(true)} style={nutPhanNhom}>
            <Users size={13} /> Phân nhóm
          </button>
        )}
        {dsNhomLoc.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Nhóm:</span>
            {dsNhomLoc.map(n => {
              const dangChon = locNhom.has(n.gia);
              return (
                <button
                  key={n.gia} aria-pressed={dangChon} style={dangChon ? chipChon : chip}
                  onClick={() => setLocNhom(s => {
                    const m = new Set(s);
                    if (m.has(n.gia)) m.delete(n.gia); else m.add(n.gia);
                    return m;
                  })}
                >{n.nhan}</button>
              );
            })}
            {locNhom.size > 0 && (
              <button onClick={() => setLocNhom(new Set())} style={nutBoLoc}>✕ Bỏ lọc</button>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {dsNhanVienLoc.length} nhân viên · {soNgayCongLoc} ngày công · {soNghiVanLoc} dòng dữ liệu đáng ngờ
            {locNhom.size ? ` (lọc theo ${tenNhomDangLoc})` : ''}
          </span>
        )}
      </div>

      {loi && (
        <div style={{
          padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
          fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> Không tải được chấm công: {loi}
        </div>
      )}

      {soDongNghiVan > 0 && (
        <div style={{
          padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fffbeb', color: '#b45309',
          fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Có <b>{soDongNghiVan}</b> dòng dữ liệu đáng ngờ (viền đỏ dưới ô trong bảng, hoặc cột
            "Ghi chú" trong bảng chi tiết từng người): máy chấm công ghi giờ ra sớm hơn lượt quét
            buổi chiều — dữ liệu sai, phần "về sớm" của các dòng này đã bị bỏ khi tính KPI.
          </span>
        </div>
      )}

      {!loi && rows.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          Chưa có dữ liệu chấm công cho kỳ này. Nạp bằng nút “Nạp từ Excel” ở trên (cần quyền
          chỉnh sửa), hoặc chạy scripts/import-cham-cong.mjs.
        </div>
      )}

      {rows.length > 0 && (
        <KhoiThongKe
          dsNhom={dsThongKeLoc} bung={bung}
          onBung={khoa => setBung(s => {
            const m = new Set(s);
            if (m.has(khoa)) m.delete(khoa); else m.add(khoa);
            return m;
          })}
          onChonNguoi={setChon}
        />
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}>
            <thead>
              <tr>
                <th style={thTen}>Nhân viên</th>
                {dsNgay.map(ngay => (
                  <th key={ngay} style={thNgay}>
                    <div>{ngay.slice(8, 10)}</div>
                    <div style={{ fontWeight: 400, color: '#94a3b8' }}>{thuTheoNgay.get(ngay)}</div>
                  </th>
                ))}
                <th style={thTong}>Muộn (phút)</th>
                <th style={thTong}>Về sớm (phút)</th>
                <th style={thTong}>Nghỉ (ngày)</th>
              </tr>
            </thead>
            <tbody>
              {dsNhanVienLoc.map(nv => {
                const tong = tongTheoNguoi.get(nv.id) || { muon: 0, somSom: 0, nghi: 0 };
                return (
                  <tr key={nv.id}>
                    <td style={tdTen}>
                      <button onClick={() => setChon(nv.id)} style={nutTen}>{nv.ten}</button>
                    </td>
                    {dsNgay.map(ngay => (
                      <OChamCong key={ngay} row={oTraCuu.get(`${nv.id}|${ngay}`)}
                        mien={ngoaiLeTra.get(`${nv.id}|${ngay}`)} />
                    ))}
                    <td style={{ ...tdBase, fontWeight: 700, color: tong.muon > 0 ? '#b91c1c' : '#94a3b8' }}>
                      {tong.muon}
                    </td>
                    <td style={{ ...tdBase, fontWeight: 700, color: tong.somSom > 0 ? '#b91c1c' : '#94a3b8' }}>
                      {tong.somSom}
                    </td>
                    <td style={{ ...tdBase, fontWeight: 700, color: tong.nghi > 0 ? '#b45309' : '#94a3b8' }}>
                      {tong.nghi}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {moNap && (
        <NapChamCong
          users={users}
          onXong={kyDaNap => {
            // Kỳ của NapChamCong suy từ NỘI DUNG tệp Excel; kỳ của tab này là ô chọn tháng
            // — hai thứ độc lập. Nạp tệp tháng 8 trong khi ô đang chọn tháng 7 mà chỉ gọi
            // taiDuLieu() thì nó tải lại đúng tháng 7, màn hình không đổi gì, chủ app
            // tưởng nạp hỏng rồi bấm nạp lại — lần hai vẫn im lặng y hệt. Đổi ky sang đúng
            // kỳ vừa nạp thì tự tải lại (taiDuLieu là useCallback phụ thuộc [ky], useEffect
            // ở trên phụ thuộc taiDuLieu — cùng cơ chế ô <input type="month"> đang dùng),
            // không cần gọi thêm taiDuLieu() ở nhánh đó.
            //
            // NapChamCong.jsx truyền kèm kỳ vừa nạp (onXong?.(ketQua.ky)). Nhánh else vẫn giữ
            // để phòng nơi gọi khác không truyền gì, và cho trường hợp kỳ vừa nạp TRÙNG kỳ đang
            // chọn — lúc đó setKy là lệnh rỗng (React bỏ qua giá trị nguyên thuỷ không đổi) nên
            // không có gì kích hoạt tải lại, phải gọi taiDuLieu() tay.
            if (kyDaNap && kyDaNap !== ky) setKy(kyDaNap);
            else taiDuLieu();
          }}
          onDong={() => setMoNap(false)}
        />
      )}
    </div>
  );
}

// Một ô ngày công trong bảng tổng quan.
//  - không có dòng (người này không có bản ghi ngày đó) → gạch ngang mờ.
//  - nghi = true → 'N' nền vàng nhạt.
//  - di_muon_phut > 0 → số phút, nền hồng nhạt, chữ đỏ.
//  - còn lại → dấu '·' xám nhạt.
//  - nghi_van khác null → thêm viền dưới đỏ, bất kể rơi vào trường hợp nào ở trên.
function OChamCong({ row, mien }) {
  if (!row) {
    return (
      <td style={{ ...tdBase, color: '#e2e8f0' }} title="Không có dữ liệu chấm công ngày này">—</td>
    );
  }
  const style = {
    ...tdBase,
    borderBottom: row.nghi_van ? '2px solid #dc2626' : tdBase.borderBottom,
    // Viền trong xanh dương = ngày được miễn trừ (giải trình) — không lẫn với viền đỏ nghi vấn.
    ...(mien ? { boxShadow: 'inset 0 0 0 2px #60a5fa' } : null),
  };
  const title = tieuDeO(row) + (mien ? ` — ĐẶC BIỆT (không trừ KPI): ${mien.ly_do}` : '');
  if (row.nghi) {
    return <td style={{ ...style, background: '#fef9c3', fontWeight: 700 }} title={title}>N</td>;
  }
  if (row.di_muon_phut > 0) {
    return (
      <td style={{ ...style, background: '#fff5f6', color: '#b91c1c', fontWeight: 700 }} title={title}>
        {row.di_muon_phut}
      </td>
    );
  }
  return <td style={{ ...style, color: '#cbd5e1' }} title={title}>·</td>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bảng chi tiết từng ngày của một người
// ─────────────────────────────────────────────────────────────────────────────

function BangChiTietMotNguoi({ ten, ky, nvId, rows, ngoaiLeTra, canEdit, onDoiNgoaiLe, onBack }) {
  const dong = useMemo(
    () => [...rows].sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)),
    [rows]);
  const [modalNgay, setModalNgay] = useState(null);   // ngày đang nhập lý do
  const [lyDoInput, setLyDoInput] = useState('');
  const mienCua = ngay => ngoaiLeTra?.get(`${nvId}|${ngay}`);

  const moModal = (ngay, lyDoCu) => { setLyDoInput(lyDoCu || ''); setModalNgay(ngay); };
  const luuModal = () => {
    const t = lyDoInput.trim();
    if (!t) return;
    onDoiNgoaiLe(nvId, modalNgay, t);
    setModalNgay(null);
  };

  return (
    <div style={{ width: '100%' }}>
      <button onClick={onBack} style={nutQuayLai}>
        <ChevronLeft size={14} /> Danh sách
      </button>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', border: '1px solid #e2e8f0', marginBottom: 12 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{ten}</div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kỳ {ky} · {dong.length} ngày công</div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, background: '#fff', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={thChiTiet.left}>Ngày</th>
              <th style={thChiTiet.left}>Thứ</th>
              <th style={thChiTiet.left}>In sáng</th>
              <th style={thChiTiet.left}>In chiều</th>
              <th style={thChiTiet.left}>Giờ ra</th>
              <th style={thChiTiet.num}>Tăng ca</th>
              <th style={thChiTiet.num}>Đi muộn</th>
              <th style={thChiTiet.num}>Về sớm</th>
              <th style={thChiTiet.left}>Nghỉ</th>
              <th style={thChiTiet.left}>Ghi chú</th>
              {canEdit && <th style={thChiTiet.left}>Đặc biệt</th>}
            </tr>
          </thead>
          <tbody>
            {dong.map(r => (
              <tr key={r.id} style={{ background: r.nghi_van ? '#fef2f2' : '#fff' }}>
                <td style={tdChiTiet.body}>{ngayGon(r.ngay)}</td>
                <td style={tdChiTiet.body}>{r.thu}</td>
                <td style={tdChiTiet.body}>{gioGon(r.gio_in_sang)}</td>
                <td style={tdChiTiet.body}>{gioGon(r.gio_in_chieu)}</td>
                <td style={tdChiTiet.body}>{gioGon(r.gio_out)}</td>
                <td style={{ ...tdChiTiet.body, textAlign: 'right' }}>
                  {r.tang_ca_phut > 0 ? `${r.tang_ca_phut} phút` : '—'}
                </td>
                <td style={{ ...tdChiTiet.body, textAlign: 'right', color: r.di_muon_phut > 0 ? '#b91c1c' : undefined, fontWeight: r.di_muon_phut > 0 ? 700 : 400 }}>
                  {r.di_muon_phut > 0 ? `${r.di_muon_phut} phút` : '—'}
                </td>
                <td style={{ ...tdChiTiet.body, textAlign: 'right', color: r.ve_som_phut > 0 ? '#b91c1c' : undefined, fontWeight: r.ve_som_phut > 0 ? 700 : 400 }}>
                  {r.ve_som_phut > 0 ? `${r.ve_som_phut} phút` : '—'}
                </td>
                <td style={tdChiTiet.body}>{r.nghi ? 'Có' : '—'}</td>
                <td style={{ ...tdChiTiet.body, color: r.nghi_van ? '#b91c1c' : '#94a3b8' }}>
                  {mienCua(r.ngay) && (
                    <div style={{ color: '#2563eb', fontWeight: 600 }}>
                      Đặc biệt — {mienCua(r.ngay).ly_do}
                    </div>
                  )}
                  {r.nghi_van
                    ? 'Máy chấm công ghi giờ ra sớm hơn lượt quét buổi chiều — phần về sớm đã bị bỏ khi tính KPI.'
                    : ''}
                </td>
                {canEdit && (
                  <td style={tdChiTiet.body}>
                    {mienCua(r.ngay) ? (
                      <button onClick={() => onDoiNgoaiLe(nvId, r.ngay, null)} style={nutBoDacBiet}>
                        Bỏ đặc biệt
                      </button>
                    ) : (
                      <button onClick={() => moModal(r.ngay, '')} style={nutDacBiet}>
                        Đánh dấu đặc biệt
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalNgay && (
        <div onClick={() => setModalNgay(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14, padding: '1rem', maxWidth: 420, width: '100%',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>
              Đánh dấu đặc biệt — {ngayGon(modalNgay)}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 10 }}>
              Ngày này sẽ KHÔNG bị trừ điểm chuyên cần (cá nhân + bộ phận), nhưng vẫn hiển thị. Bắt buộc nhập lý do giải trình.
            </div>
            <textarea
              value={lyDoInput} onChange={e => setLyDoInput(e.target.value)} rows={3}
              placeholder="VD: nghỉ ốm có đơn, đi khám bệnh…"
              style={{ ...oInput, resize: 'vertical' }} autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setModalNgay(null)} style={nutHuy}>Huỷ</button>
              <button onClick={luuModal} disabled={!lyDoInput.trim()} style={nutLuu}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Khối thống kê hai cấp: dòng nhóm bấm được để bung ra từng nhân viên.
//
// Con số ở đây ĐÃ TRỪ ngày đánh dấu Đặc biệt, nên sẽ lệch với 3 cột tổng của lưới lịch bên
// dưới (số thô). Cố ý: đổi ý nghĩa cột cũ là cách chắc nhất để người quen đọc nó đọc sai.
// ─────────────────────────────────────────────────────────────────────────────
function KhoiThongKe({ dsNhom, bung, onBung, onChonNguoi }) {
  const tong = useMemo(() => tongTatCa(dsNhom), [dsNhom]);
  if (!dsNhom.length) return null;

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, background: '#fff' }}>
        <thead>
          <tr>
            <th style={thTK.left}>Nhóm / Nhân viên</th>
            <th style={thTK.num}>Người</th>
            <th style={thTK.num}>Tổng nghỉ</th>
            <th style={thTK.num} title={TIP_PHEP}>Nghỉ phép</th>
            <th style={thTK.num} title={TIP_QUA}>Quá quy định</th>
            <th style={thTK.num} title={TIP_PHUT}>Muộn (phút)</th>
            <th style={thTK.num} title={TIP_PHUT}>Về sớm (phút)</th>
          </tr>
        </thead>
        <tbody>
          {dsNhom.map(n => {
            const khoa = n.khoa == null ? 'KHONG_NHOM' : n.khoa;
            const mo = bung.has(khoa);
            return (
              <React.Fragment key={khoa}>
                <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => onBung(khoa)}>
                  <td style={{ ...tdTK.left, fontWeight: 700 }}>
                    {mo ? <ChevronDownNho /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />}
                    {' '}{n.nhan}
                  </td>
                  <td style={tdTK.num}>{n.soNguoi}</td>
                  <SoTK v={n.tongNghi} dam />
                  <SoTK v={n.nghiPhep} dam />
                  <SoTK v={n.nghiQuaQuyDinh} dam canhBao />
                  <SoTK v={n.phutMuon} dam canhBao />
                  <SoTK v={n.phutVeSom} dam canhBao />
                </tr>
                {mo && n.thanhVien.map(x => (
                  <tr key={x.id}>
                    <td style={{ ...tdTK.left, paddingLeft: 30 }}>
                      <button onClick={() => onChonNguoi(x.id)} style={nutTenTK}>{x.ten}</button>
                    </td>
                    <td style={tdTK.num} />
                    <SoTK v={x.tongNghi} />
                    <SoTK v={x.nghiPhep} />
                    <SoTK v={x.nghiQuaQuyDinh} canhBao />
                    <SoTK v={x.phutMuon} canhBao />
                    <SoTK v={x.phutVeSom} canhBao />
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
            <td style={{ ...tdTK.left, fontWeight: 700 }}>TỔNG</td>
            <td style={{ ...tdTK.num, fontWeight: 700 }}>{tong.soNguoi}</td>
            <SoTK v={tong.tongNghi} dam />
            <SoTK v={tong.nghiPhep} dam />
            <SoTK v={tong.nghiQuaQuyDinh} dam canhBao />
            <SoTK v={tong.phutMuon} dam canhBao />
            <SoTK v={tong.phutVeSom} dam canhBao />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Số 0 để mờ — bắt mắt đọc một cột đầy số 0 là làm người ta bỏ sót con số thật sự khác 0.
// `canhBao` = cột mà khác 0 là chuyện xấu (quá quy định, muộn, về sớm) → tô đỏ.
function SoTK({ v, dam, canhBao }) {
  const khac0 = Number(v) > 0;
  return (
    <td style={{
      ...tdTK.num,
      fontWeight: dam ? 700 : 400,
      color: !khac0 ? '#cbd5e1' : (canhBao ? '#b91c1c' : '#0f172a'),
    }}>{soGon(v)}</td>
  );
}

// 3.5 → '3,5'; 15 → '15'. Từ khi nghỉ nửa buổi tính 0,5 ngày, các cột ngày ra số lẻ — để
// JavaScript tự vẽ thì ra '3.5' với dấu chấm, lạc lõng trong một màn hình toàn tiếng Việt.
// `toFixed(2)` rồi bỏ số 0 thừa: vừa cắt đuôi dấu phẩy động, vừa không hiện '15,00' cho cột
// phút vốn luôn là số nguyên. Bản song sinh của hàm này là `soNgayGon` trong kpiTuDong.js,
// dùng cho chuỗi ghi chú KPI — hai nơi chỉ khác chỗ dùng, cùng một quy tắc hiển thị.
const soGon = v => String(Number(Number(v || 0).toFixed(2))).replace('.', ',');

const ChevronDownNho = () => (
  <ChevronRight size={13} style={{ verticalAlign: -2, transform: 'rotate(90deg)' }} />
);

const TIP_PHEP = 'Ngày nghỉ đã đánh dấu Đặc biệt (có giải trình) + tối đa 1 ngày phép trong tháng.';
const TIP_QUA = 'Số ngày nghỉ CHƯA đánh dấu Đặc biệt, trừ đi 1 ngày phép. Đây đúng là con số KPI dùng để trừ điểm chuyên cần.';
const TIP_PHUT = 'Đã bỏ các ngày được đánh dấu Đặc biệt — nên có thể lệch với cột tổng của bảng lịch bên dưới (số thô).';

// ─────────────────────────────────────────────────────────────────────────────
// Xếp từng nhân viên vào một trong các nhóm chuyên cần SẴN CÓ của kỳ.
//
// Không tạo/xoá/đổi tên nhóm ở đây: tạo nhóm mới là sinh thêm một dòng chỉ tiêu KPI cho mọi
// thành viên, phải đặt đúng chỉ tiêu và trọng số — việc đó làm ở tab KPI.
// ─────────────────────────────────────────────────────────────────────────────
function ManPhanNhom({ ky, kpiRows, dsNguoi, nhomCuaNguoi, loi, onDoiNhom, onBack }) {
  // Nhóm chọn được = các nhóm có dòng BO_PHAN trong kỳ. Sắp theo nhãn cho ổn định.
  const dsNhom = useMemo(() => {
    const { nhan } = docNhomTuKpi(kpiRows);
    return Array.from(nhan.entries())
      .map(([khoa, ten]) => ({ khoa, ten }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  }, [kpiRows]);

  return (
    <div style={{ width: '100%' }}>
      <button onClick={onBack} style={nutQuayLai}>
        <ChevronLeft size={14} /> Bảng chấm công
      </button>

      <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', border: '1px solid #e2e8f0', marginBottom: 12 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Phân nhóm chuyên cần</div>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Kỳ {ky} · {dsNguoi.length} nhân viên · {dsNhom.length} nhóm</div>
      </div>

      {loi && (
        <div style={{
          padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fef2f2', color: '#b91c1c',
          fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> {loi}
        </div>
      )}

      <div style={{
        padding: '0.6rem 0.7rem', borderRadius: 10, background: '#fffbeb', color: '#b45309',
        fontSize: '0.78rem', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Đổi nhóm sẽ làm điểm KPI <b>Chuyên cần bộ phận</b> của <b>cả nhóm cũ lẫn nhóm mới</b> tính
          lại ngay, vì điểm tính trên trung bình đầu người. Áp dụng cho <b>kỳ {ky}</b>; các kỳ tạo
          sau sẽ tự chép nhóm này.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {dsNguoi.map(nv => (
          <div key={nv.id} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: '0.6rem 0.7rem',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 }}>{nv.ten}</div>
            {nv.coDong ? (
              <select
                value={nhomCuaNguoi.get(nv.id) || ''}
                onChange={e => onDoiNhom(nv.id, e.target.value)}
                style={{ ...oInput, width: '100%' }}
              >
                {!nhomCuaNguoi.get(nv.id) && <option value="">— chưa chọn —</option>}
                {dsNhom.map(n => <option key={n.khoa} value={n.khoa}>{n.ten}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Chưa có chỉ tiêu Chuyên cần bộ phận trong kỳ này — thêm ở tab KPI trước.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Style
// ─────────────────────────────────────────────────────────────────────────────

const nutQuayLai = {
  display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none',
  color: '#2563eb', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: 10,
};

const nutTen = {
  width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer',
  padding: '8px 10px', font: 'inherit', fontWeight: 600, fontSize: '0.78rem', color: '#0f172a',
};

const nutNapExcel = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8,
  background: '#2563eb', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
  padding: '0.4rem 0.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
};

// Cột trái ghim cứng: cuộn ngang qua vài chục cột ngày mà mất tên dòng thì không biết
// đang xem ai.
const thTen = {
  position: 'sticky', left: 0, zIndex: 3, background: '#f8fafc',
  textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase',
  letterSpacing: '0.03em', color: '#64748b', borderBottom: '1px solid #e2e8f0',
  borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap',
};
const tdTen = {
  position: 'sticky', left: 0, zIndex: 1, background: '#fff', padding: 0,
  borderBottom: '1px solid #eef2f7', borderRight: '1px solid #e2e8f0', whiteSpace: 'nowrap',
};
const thNgay = {
  background: '#f8fafc', textAlign: 'center', padding: '4px 6px', fontSize: '0.64rem',
  fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap', minWidth: 30,
};
const thTong = {
  ...thNgay, textTransform: 'uppercase', letterSpacing: '0.02em', fontSize: '0.62rem', minWidth: 64,
};
const tdBase = {
  textAlign: 'center', padding: '6px 4px', fontSize: '0.72rem',
  borderBottom: '1px solid #eef2f7', fontVariantNumeric: 'tabular-nums', minWidth: 30,
};

const thChiTiet = {
  left: {
    background: '#f8fafc', textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
  num: {
    background: '#f8fafc', textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
};
const tdChiTiet = {
  body: { padding: '8px 10px', borderBottom: '1px solid #eef2f7', color: '#0f172a', whiteSpace: 'nowrap' },
};

const nutDacBiet = {
  border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb',
  fontSize: '0.72rem', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};
const nutBoDacBiet = {
  border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
  fontSize: '0.72rem', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};
const nutHuy = {
  border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
  fontSize: '0.78rem', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
};
const nutLuu = {
  border: 'none', background: '#2563eb', color: '#fff',
  fontSize: '0.78rem', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600,
};

const nutPhanNhom = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb',
  fontSize: '0.78rem', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const thTK = {
  left: {
    background: '#f8fafc', textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
  num: {
    background: '#f8fafc', textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b',
    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
  },
};
const tdTK = {
  left: { padding: '7px 10px', borderBottom: '1px solid #eef2f7', fontSize: '0.78rem', whiteSpace: 'nowrap' },
  num: {
    padding: '7px 10px', borderBottom: '1px solid #eef2f7', fontSize: '0.78rem',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
};
const nutTenTK = {
  border: 'none', background: 'none', cursor: 'pointer', padding: 0,
  font: 'inherit', fontSize: '0.78rem', color: '#0f172a', textAlign: 'left',
};

const chip = {
  border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
  fontSize: '0.74rem', borderRadius: 999, padding: '0.3rem 0.7rem', cursor: 'pointer',
  whiteSpace: 'nowrap', font: 'inherit', fontWeight: 400, lineHeight: 1.4,
};
const chipChon = {
  // Ghi lại trọn `border` chứ KHÔNG chỉ đè `borderColor`: `chip` đặt viết tắt `border`, trộn
  // viết tắt với viết riêng cho cùng một thuộc tính làm React cảnh báo và có thể mất viền khi
  // vẽ lại — nút đang chọn hết sáng viền xanh.
  ...chip, border: '1px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600,
};
const nutBoLoc = {
  border: 'none', background: 'none', color: '#64748b', fontSize: '0.74rem',
  cursor: 'pointer', padding: '0.3rem 0.2rem', whiteSpace: 'nowrap',
};
