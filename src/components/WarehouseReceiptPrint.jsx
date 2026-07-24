import React from 'react';

// Phiếu Xuất Kho / Nhập Kho in ra giống mẫu Excel "Mẫu phiếu XK, NK.xlsx".
// Khổ A4 DỌC (portrait) — bảng nén gọn để vừa trang.
// Dùng chung cho: tab Quản Lý Chứng Từ (PrintQueueTab) và bản in nhanh khi tạo
// phiếu nhập (ImportStockTab). Chỉ render nội dung — host tự lo hiện/ẩn khi in.
//
// Props:
//  - kind: 'NK' | 'XK' | 'CV' (chuyển vị trí trong kho — hàng không rời kho)
//  - code: mã phiếu
//  - date: Date | ISO string (ngày lập)
//  - source: Nguồn nhập (NK) — thường là loại nhập + NCC/nguồn
//  - reason: Lý do nhập (NK) / Nội dung (XK)
//  - diaChi, sdt: địa chỉ & SĐT (lấy từ NCC nếu có, không thì bỏ trống)
//  - rows: [{ ma, ten, dvt, sl, kho, ghiChu, maDonHang }]
//
// Tên người ký in sẵn theo mẫu.
const SIGNER_LAP = 'Nguyễn Thị Thu Hà';   // Người lập phiếu
const SIGNER_DUYET = 'Đỗ Hương Nguyên';   // Người duyệt / Bộ phận kỹ thuật

function fmtDate(d) {
  const dt = d instanceof Date ? d : (d ? new Date(d) : new Date());
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return { dd, mm, yyyy: dt.getFullYear() };
}

// 1 dòng nhãn + phần điền (gạch chân để viết tay khi trống)
function Field({ label, value }) {
  return (
    <div style={{ margin: '2px 0', fontSize: '0.82rem', color: '#000', display: 'flex', gap: 6 }}>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderBottom: value ? 'none' : '1px dotted #000', minHeight: '1em' }}>{value || ''}</span>
    </div>
  );
}

export default function WarehouseReceiptPrint({ kind, code, date, source, reason, diaChi, sdt, rows = [] }) {
  const isNK = kind === 'NK';
  const isCV = kind === 'CV'; // phiếu chuyển vị trí: dùng khung XK nhưng không có khách hàng
  const { dd, mm, yyyy } = fmtDate(date);

  // Bảng nén để vừa khổ A4 dọc (NK 10 cột nên chữ nhỏ hơn XK 8 cột).
  const fs = isNK ? '0.6rem' : '0.72rem';
  const pad = isNK ? '2px 3px' : '3px 5px';
  const box = { border: '1px solid #000' };
  const cell = { border: '1px solid #000', padding: pad, fontSize: fs, color: '#000', verticalAlign: 'top', wordBreak: 'break-word' };
  const th = { ...cell, fontWeight: 700, textAlign: 'center', background: '#f2f2f2', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

  return (
    <div style={{ width: '100%', color: '#000', fontFamily: 'Times New Roman, serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 700, margin: '0 0 4px' }}>
        {isNK ? 'PHIẾU NHẬP KHO' : isCV ? 'PHIẾU CHUYỂN VỊ TRÍ' : 'PHIẾU XUẤT KHO'}
      </h2>
      <div style={{ textAlign: 'center', fontSize: '0.82rem', marginBottom: 8 }}>
        Ngày {dd} tháng {mm} năm {yyyy}
      </div>

      {/* Khối thông tin đầu phiếu */}
      <div style={{ marginBottom: 8 }}>
        {code && <Field label="Mã phiếu:" value={code} />}
        {isNK ? (
          <>
            <Field label="Nguồn nhập:" value={source} />
            <Field label="Địa chỉ:" value={diaChi} />
            <Field label="ĐT:" value={sdt} />
            <Field label="Lý do nhập:" value={reason} />
          </>
        ) : isCV ? (
          <>
            <Field label="Nội dung:" value={reason} />
          </>
        ) : (
          <>
            <Field label="Khách hàng:" value="" />
            <Field label="Địa chỉ:" value={diaChi} />
            <Field label="SĐT:" value={sdt} />
            <Field label="Nội dung:" value={reason} />
          </>
        )}
      </div>

      {/* Bảng hàng hóa */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...box }}>
        <thead>
          {isNK ? (
            <tr>
              <th style={{ ...th, width: '4%' }}>Số TT</th>
              <th style={{ ...th, width: '12%' }}>Mã hàng</th>
              <th style={{ ...th, width: '22%' }}>Tên hàng hóa nhập vào thực tế</th>
              <th style={{ ...th, width: '6%' }}>Đơn vị</th>
              <th style={{ ...th, width: '8%' }}>Số lượng</th>
              <th style={{ ...th, width: '12%' }}>Vị trí</th>
              <th style={{ ...th, width: '15%' }}>Tình trạng khi nhập</th>
              <th style={{ ...th, width: '11%' }}>Kỹ thuật kiểm tra xác nhận</th>
              <th style={{ ...th, width: '10%' }}>Mã đơn hàng</th>
            </tr>
          ) : (
            <tr>
              <th style={{ ...th, width: '5%' }}>Số TT</th>
              <th style={{ ...th, width: '15%' }}>Mã hàng</th>
              <th style={{ ...th, width: '26%' }}>Tên hàng hóa</th>
              <th style={{ ...th, width: '7%' }}>Đơn vị</th>
              <th style={{ ...th, width: '9%' }}>Số lượng LT</th>
              <th style={{ ...th, width: '9%' }}>Số lượng thực</th>
              <th style={{ ...th, width: '12%' }}>Vị trí</th>
              <th style={{ ...th, width: '17%' }}>Ghi chú</th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            isNK ? (
              <tr key={i}>
                <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{r.ma}</td>
                <td style={cell}>{r.ten}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{r.dvt}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.sl}</td>
                <td style={cell}>{r.kho}</td>
                <td style={cell}></td>
                <td style={cell}></td>
                <td style={cell}>{r.maDonHang || ''}</td>
              </tr>
            ) : (
              <tr key={i}>
                <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{r.ma}</td>
                <td style={cell}>{r.ten}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{r.dvt}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.sl}</td>
                <td style={cell}></td>
                <td style={cell}>{r.kho}</td>
                <td style={cell}>{r.ghiChu || ''}</td>
              </tr>
            )
          ))}
        </tbody>
      </table>

      {/* Chữ ký */}
      {isNK ? (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 30, textAlign: 'center', fontSize: '0.82rem' }}>
          <div style={{ width: '45%' }}>
            <div style={{ fontWeight: 700 }}>Người lập phiếu</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 44, fontWeight: 700 }}>{SIGNER_LAP}</div>
          </div>
          <div style={{ width: '45%' }}>
            <div style={{ fontWeight: 700 }}>Bộ phận kỹ thuật</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 44, fontWeight: 700 }}>{SIGNER_DUYET}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 30, textAlign: 'center', fontSize: '0.82rem' }}>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người lập phiếu</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 44, fontWeight: 700 }}>{SIGNER_LAP}</div>
          </div>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người nhận</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 44, fontWeight: 700 }}>&nbsp;</div>
          </div>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người duyệt</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 44, fontWeight: 700 }}>{SIGNER_DUYET}</div>
          </div>
        </div>
      )}
    </div>
  );
}
