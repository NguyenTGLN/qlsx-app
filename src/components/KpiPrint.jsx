import React from 'react';

// Bản in A4 NGANG bảng KPI một người. Chỉ render nội dung — host lo hiện/ẩn khi in,
// cùng nếp với WarehouseReceiptPrint.
//
// Nằm ngang chứ không dọc: bảng có cột "Ghi chú / Bằng chứng" chứa nguyên câu diễn giải
// và danh sách nhật ký. In dọc thì cột đó bị bóp còn vài ký tự mỗi dòng, mà đó lại chính
// là phần người ký cần đọc để biết điểm ở đâu ra.
//
// `duLieu` là kết quả của dungDuLieuSheet() — dòng thưởng ngoài trọng số đã được để null
// ở các cột không áp dụng, ở đây chỉ việc in '—' thay vì số 0.

const o = { border: '1px solid #000', padding: '2px 3px' };
const oGiua = { ...o, textAlign: 'center' };

// Thứ tự cột dùng chung cho tiêu đề, thân bảng và dòng TỔNG — khai báo một chỗ để ba
// phần không bao giờ lệch nhau khi thêm/bớt cột.
const COT = [
  { nhan: 'Chỉ tiêu KPI', rong: '18%', canh: 'left' },
  { nhan: 'Diễn giải', rong: '26%', canh: 'left' },
  { nhan: 'Mức chỉ tiêu', rong: '6%' },
  { nhan: 'Trọng số', rong: '6%' },
  { nhan: 'Điểm đạt', rong: '6%' },
  { nhan: 'Tỉ lệ', rong: '6%' },
  { nhan: 'Quy đổi', rong: '7%' },
  { nhan: 'Điểm mất', rong: '6%' },
  { nhan: 'Ghi chú / Bằng chứng', rong: '19%', canh: 'left' },
];

const hoacGach = v => (v === null || v === undefined || v === '' ? '—' : v);

export default function KpiPrint({ duLieu }) {
  const { tenNhanVien, ky, dong, tongKpi, tongMat, tongTrongSo, trongSoHopLe } = duLieu;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>CÔNG TY TNHH EUROMADE VIỆT NAM</div>
        <div style={{ fontWeight: 700, fontSize: 13, margin: '4px 0' }}>BẢNG ĐÁNH GIÁ KPI</div>
        <div>Nhân viên: <b>{tenNhanVien}</b> — Kỳ: <b>{ky}</b></div>
        <div>Tổng điểm: <b style={{ fontSize: 12 }}>{tongKpi} / 100</b> (mất {tongMat} điểm)</div>
        {trongSoHopLe === false && (
          <div style={{ color: '#c00', fontWeight: 700, marginTop: 2 }}>
            ⚠ Σ trọng số = {tongTrongSo} (≠ 100) — bảng chỉ tiêu chưa chuẩn.
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {COT.map((c, i) => <col key={i} style={{ width: c.rong }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: '#eee' }}>
            {COT.map((c, i) => (
              <th key={i} style={{ ...o, fontSize: 8, textAlign: 'center' }}>{c.nhan}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dong.map((r, i) => r.laNhom ? (
            <tr key={i}>
              <td colSpan={COT.length} style={{ ...o, fontWeight: 700, background: '#f6f6f6' }}>
                {r.ten}
              </td>
            </tr>
          ) : (
            <tr key={i}>
              <td style={o}>
                {r.ten}
                {r.laThuong && (
                  <span style={{ fontSize: 7, color: '#555' }}> (ngoài trọng số)</span>
                )}
              </td>
              <td style={{ ...o, fontSize: 7 }}>{r.mo_ta}</td>
              <td style={oGiua}>{hoacGach(r.chi_tieu)}</td>
              <td style={oGiua}>{hoacGach(r.trong_so)}</td>
              <td style={oGiua}>{hoacGach(r.diemDat)}</td>
              <td style={oGiua}>{r.tiLePhanTram === null ? '—' : r.tiLePhanTram + '%'}</td>
              <td style={{ ...oGiua, fontWeight: 700 }}>
                {r.laThuong && r.diemQuyDoi >= 0 ? '+' : ''}{r.diemQuyDoi}
              </td>
              <td style={{ ...oGiua, color: r.diemMat > 0 ? '#c00' : '#000' }}>
                {r.diemMat ? r.diemMat : r.diemMat === null ? '—' : ''}
              </td>
              <td style={{ ...o, fontSize: 7 }}>{r.ghiChu}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={o}>TỔNG</td>
            <td style={o} />
            <td style={o} />
            <td style={oGiua}>{tongTrongSo}</td>
            <td style={o} />
            <td style={o} />
            <td style={oGiua}>{tongKpi}</td>
            <td style={oGiua}>{tongMat}</td>
            <td style={o} />
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 24, textAlign: 'center' }}>
        {['Nhân viên được đánh giá', 'Cấp trên trực tiếp', 'Ban giám đốc'].map(s => (
          <div key={s}>
            <div style={{ fontWeight: 700 }}>{s}</div>
            <div style={{ fontSize: 8 }}>(Ký/ghi rõ họ tên)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
