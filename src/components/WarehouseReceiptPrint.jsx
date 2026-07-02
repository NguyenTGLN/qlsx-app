import React from 'react';

// Phiếu Xuất Kho / Nhập Kho in ra giống mẫu Excel "Mẫu phiếu XK, NK.xlsx".
// Dùng chung cho: tab Quản Lý Chứng Từ (PrintQueueTab) và bản in nhanh khi tạo
// phiếu nhập (ImportStockTab). Chỉ render nội dung — host tự lo hiện/ẩn khi in.
//
// Props:
//  - kind: 'NK' | 'XK'
//  - code: mã phiếu
//  - date: Date | ISO string (ngày lập)
//  - source: Nguồn nhập (NK) — thường là loại nhập + NCC/nguồn
//  - reason: Lý do nhập (NK) / Nội dung (XK)
//  - rows: [{ ma, ten, dvt, sl, kho, ghiChu, maDonHang }]
//
// Tên người ký in sẵn theo mẫu.
const SIGNER_LAP = 'Nguyễn Thị Thu Hà';   // Người lập phiếu
const SIGNER_DUYET = 'Đỗ Hương Nguyên';   // Người duyệt / Bộ phận kỹ thuật

const box = { border: '1px solid #000' };
const cell = { border: '1px solid #000', padding: '4px 6px', fontSize: '0.8rem', color: '#000', verticalAlign: 'middle' };
const th = { ...cell, fontWeight: 700, textAlign: 'center', background: '#f2f2f2', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

function fmtDate(d) {
  const dt = d instanceof Date ? d : (d ? new Date(d) : new Date());
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return { dd, mm, yyyy: dt.getFullYear() };
}

// 1 dòng nhãn + phần điền (gạch chân để viết tay khi trống)
function Field({ label, value }) {
  return (
    <div style={{ margin: '3px 0', fontSize: '0.85rem', color: '#000', display: 'flex', gap: 6 }}>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderBottom: value ? 'none' : '1px dotted #000', minHeight: '1em' }}>{value || ''}</span>
    </div>
  );
}

export default function WarehouseReceiptPrint({ kind, code, date, source, reason, rows = [] }) {
  const isNK = kind === 'NK';
  const { dd, mm, yyyy } = fmtDate(date);

  return (
    <div style={{ width: '100%', color: '#000', fontFamily: 'Times New Roman, serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: '1.4rem', fontWeight: 700, margin: '0 0 4px' }}>
        {isNK ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}
      </h2>
      <div style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: 10 }}>
        Ngày {dd} tháng {mm} năm {yyyy} {isNK ? 'nhập' : 'xuất'}
      </div>

      {/* Khối thông tin đầu phiếu */}
      <div style={{ marginBottom: 10 }}>
        {code && <Field label="Mã phiếu:" value={code} />}
        {isNK ? (
          <>
            <Field label="Nguồn nhập:" value={source} />
            <Field label="Địa chỉ:" value="" />
            <Field label="ĐT:" value="" />
            <Field label="Lý do nhập:" value={reason} />
          </>
        ) : (
          <>
            <Field label="Khách hàng:" value="" />
            <Field label="Địa chỉ:" value="" />
            <Field label="SĐT:" value="" />
            <Field label="Nội dung:" value={reason} />
          </>
        )}
      </div>

      {/* Bảng hàng hóa */}
      <table style={{ width: '100%', borderCollapse: 'collapse', ...box }}>
        <thead>
          {isNK ? (
            <tr>
              <th style={{ ...th, width: 34 }}>Số TT</th>
              <th style={th}>Mã hàng</th>
              <th style={th}>Tên hàng hóa nhập vào thực tế</th>
              <th style={{ ...th, width: 44 }}>Đơn vị</th>
              <th style={{ ...th, width: 54 }}>Số lượng</th>
              <th style={th}>Kho nhập</th>
              <th style={th}>Tình trạng khi nhập</th>
              <th style={th}>Tem nhãn, in ấn, khắc có cần xử lý không?</th>
              <th style={th}>Kỹ thuật kiểm tra xác nhận</th>
              <th style={th}>Mã đơn hàng</th>
            </tr>
          ) : (
            <tr>
              <th style={{ ...th, width: 34 }}>Số TT</th>
              <th style={th}>Mã hàng</th>
              <th style={th}>Tên hàng hóa</th>
              <th style={{ ...th, width: 44 }}>Đơn vị</th>
              <th style={{ ...th, width: 60 }}>Số lượng LT</th>
              <th style={{ ...th, width: 66 }}>Số lượng thực</th>
              <th style={th}>Kho Xuất</th>
              <th style={th}>Ghi chú</th>
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
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 36, textAlign: 'center', fontSize: '0.85rem' }}>
          <div style={{ width: '45%' }}>
            <div style={{ fontWeight: 700 }}>Người lập phiếu</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 48, fontWeight: 700 }}>{SIGNER_LAP}</div>
          </div>
          <div style={{ width: '45%' }}>
            <div style={{ fontWeight: 700 }}>Bộ phận kỹ thuật</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 48, fontWeight: 700 }}>{SIGNER_DUYET}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 36, textAlign: 'center', fontSize: '0.85rem' }}>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người lập phiếu</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 48, fontWeight: 700 }}>{SIGNER_LAP}</div>
          </div>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người nhận</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 48, fontWeight: 700 }}>&nbsp;</div>
          </div>
          <div style={{ width: '32%' }}>
            <div style={{ fontWeight: 700 }}>Người duyệt</div>
            <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(kí & ghi rõ họ tên)</div>
            <div style={{ marginTop: 48, fontWeight: 700 }}>{SIGNER_DUYET}</div>
          </div>
        </div>
      )}
    </div>
  );
}
