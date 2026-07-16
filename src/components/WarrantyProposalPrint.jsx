import React from 'react';

// Phiếu đề nghị sửa chữa bảo hành — bản in HTML giống mẫu "Mẫu đề xuất bảo hành.xlsx".
// Chỉ render nội dung; host lo hiện/ẩn khi in. Props: { p } = object từ mapRowToProposal.
const NGUOI_KY_BP = 'Nguyễn Bá Ngọc'; // Bộ phận bảo hành — tên ký cố định

const box = { border: '1px solid #000' };
const cell = { border: '1px solid #000', padding: '4px 6px', fontSize: '0.82rem', color: '#000', verticalAlign: 'top', wordBreak: 'break-word' };
const th = { ...cell, fontWeight: 700, textAlign: 'center', background: '#f2f2f2', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

function Row({ label, value }) {
  return (
    <div style={{ margin: '3px 0', fontSize: '0.86rem', color: '#000' }}>
      <span style={{ fontWeight: 700 }}>{label}: </span><span>{value || ''}</span>
    </div>
  );
}
function Check({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0', fontSize: '0.86rem', color: '#000' }}>
      <span style={{ display: 'inline-block', width: 14, height: 14, border: '1.5px solid #000' }} /> {label}
    </div>
  );
}

export default function WarrantyProposalPrint({ p }) {
  const lk = (p.linhKienList && p.linhKienList.length) ? p.linhKienList : [''];
  return (
    <div style={{ width: '100%', color: '#000', fontFamily: 'Times New Roman, serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px' }}>
        PHIẾU ĐỀ NGHỊ SỬA CHỮA BẢO HÀNH SẢN PHẨM
      </h2>
      <div style={{ textAlign: 'center', fontSize: '0.84rem', fontStyle: 'italic', marginBottom: 10 }}>{p.ngayText}</div>

      <div style={{ marginBottom: 8 }}>
        <Row label="Bên nhận bảo hành" value={p.khachHang} />
        <Row label="Số điện thoại" value={p.sdt} />
        <Row label="Địa chỉ" value={p.diaChi} />
        <Row label="Mã đơn hàng" value={p.maDonHang} />
        <Row label="Ngày giao hàng (Lắp đặt)" value={p.ngayLap} />
      </div>

      {/* §1 Hàng hoá bảo hành */}
      <div style={{ fontWeight: 700, margin: '8px 0 4px', fontSize: '0.9rem' }}>1. Hàng hoá bảo hành</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...box }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>TT</th>
            <th style={{ ...th, width: '40%' }}>Sản phẩm</th>
            <th style={{ ...th, width: '10%' }}>ĐVT</th>
            <th style={{ ...th, width: '12%' }}>Số lượng</th>
            <th style={{ ...th, width: '32%' }}>Ghi chú (Tình trạng)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }}>1</td>
            <td style={{ ...cell, fontWeight: 600 }}>{p.maSP}</td>
            <td style={{ ...cell, textAlign: 'center' }}>Cái</td>
            <td style={{ ...cell, textAlign: 'center' }}>1</td>
            <td style={{ ...cell, whiteSpace: 'pre-line' }}>{p.tinhTrang}</td>
          </tr>
        </tbody>
      </table>

      {/* §2 Hoạt động kiểm tra */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>2. Hoạt động kiểm tra</div>
      <Check label="Đã kiểm tra" />

      {/* §3 Tình trạng lỗi */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>3. Tình trạng lỗi</div>
      <Check label="Không lỗi — Đã kiểm tra kĩ phát hiện không lỗi, đã giải thích chi tiết cho khách hàng" />
      <Check label="Có lỗi — Đã kiểm tra và xác định lỗi" />
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 6, ...box }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '6%' }}>TT</th>
            <th style={{ ...th, width: '46%' }}>Mã Linh kiện</th>
            <th style={{ ...th, width: '12%' }}>Số lượng</th>
            <th style={{ ...th, width: '18%' }}>Được bảo hành</th>
            <th style={{ ...th, width: '18%' }}>Không được bảo hành</th>
          </tr>
        </thead>
        <tbody>
          {lk.map((name, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{name}</td>
              <td style={{ ...cell, textAlign: 'center' }}>1</td>
              <td style={cell}></td>
              <td style={cell}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* §4 Thu hồi linh kiện */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '0.9rem' }}>4. Thu hồi linh kiện</div>
      <Check label="Có thu hồi linh kiện" />
      <Check label="Không thu hồi linh kiện" />

      {/* Chữ ký */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, textAlign: 'center', fontSize: '0.86rem' }}>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 700 }}>Phụ trách đơn</div>
          <div style={{ marginTop: 48, fontWeight: 700 }}>{p.nguoiPhuTrach || ' '}</div>
        </div>
        <div style={{ width: '45%' }}>
          <div style={{ fontWeight: 700 }}>Bộ phận bảo hành</div>
          <div style={{ marginTop: 48, fontWeight: 700 }}>{NGUOI_KY_BP}</div>
        </div>
      </div>
    </div>
  );
}
