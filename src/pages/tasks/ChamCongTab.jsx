import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { ChevronLeft, AlertTriangle, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình CHỈ ĐỌC: xem bảng chấm công gốc (dữ liệu máy chấm công) — căn cứ của 2 chỉ
// tiêu chuyên cần trong KPI. Chủ app trước đây phải vào Supabase mới xem được, nhân
// viên không có chỗ nào để tự tra vì sao mình bị trừ điểm. Không có nút sửa/xoá/nhập gì
// cả — dữ liệu vào bằng scripts/import-cham-cong.mjs.
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

export default function ChamCongTab({ users = [] }) {
  const [ky, setKy] = useState(kyHienTai());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const [chon, setChon] = useState(null); // nhan_vien_id đang xem chi tiết, null = bảng tổng quan

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
    } catch (err) {
      setLoi(err?.message || String(err));
      setRows([]);
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
        ten={nv.ten} ky={ky}
        rows={rows.filter(r => r.nhan_vien_id === chon)}
        onBack={() => setChon(null)}
      />
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="month" value={ky} onChange={e => setKy(e.target.value || kyHienTai())}
          style={{ ...oInput, width: 'auto' }}
        />
        {rows.length > 0 && (
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {dsNhanVien.length} nhân viên · {rows.length} ngày công · {soDongNghiVan} dòng dữ liệu đáng ngờ
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
          Chưa có dữ liệu chấm công cho kỳ này. Dữ liệu nạp bằng scripts/import-cham-cong.mjs.
        </div>
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
              {dsNhanVien.map(nv => {
                const tong = tongTheoNguoi.get(nv.id) || { muon: 0, somSom: 0, nghi: 0 };
                return (
                  <tr key={nv.id}>
                    <td style={tdTen}>
                      <button onClick={() => setChon(nv.id)} style={nutTen}>{nv.ten}</button>
                    </td>
                    {dsNgay.map(ngay => (
                      <OChamCong key={ngay} row={oTraCuu.get(`${nv.id}|${ngay}`)} />
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
    </div>
  );
}

// Một ô ngày công trong bảng tổng quan.
//  - không có dòng (người này không có bản ghi ngày đó) → gạch ngang mờ.
//  - nghi = true → 'N' nền vàng nhạt.
//  - di_muon_phut > 0 → số phút, nền hồng nhạt, chữ đỏ.
//  - còn lại → dấu '·' xám nhạt.
//  - nghi_van khác null → thêm viền dưới đỏ, bất kể rơi vào trường hợp nào ở trên.
function OChamCong({ row }) {
  if (!row) {
    return (
      <td style={{ ...tdBase, color: '#e2e8f0' }} title="Không có dữ liệu chấm công ngày này">—</td>
    );
  }
  const style = {
    ...tdBase,
    borderBottom: row.nghi_van ? '2px solid #dc2626' : tdBase.borderBottom,
  };
  const title = tieuDeO(row);
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

function BangChiTietMotNguoi({ ten, ky, rows, onBack }) {
  const dong = useMemo(
    () => [...rows].sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)),
    [rows]);

  return (
    <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
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
                  {r.nghi_van
                    ? 'Máy chấm công ghi giờ ra sớm hơn lượt quét buổi chiều — phần về sớm đã bị bỏ khi tính KPI.'
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
