import React from 'react';
import { MapPin } from 'lucide-react';
import { pickKey } from '../lib/receiptView';

// Bản XEM PHIẾU cho màn hình hẹp (điện thoại) — KHÔNG dùng để in.
// Bảng A4 9 cột của <WarehouseReceiptPrint> nhồi vào màn 400px thì chữ bé không đọc nổi,
// nên ở đây đổi thành từng thẻ to: nhấn mạnh VỊ TRÍ và SỐ LƯỢNG CẦN LẤY — hai thứ
// nhân viên cần khi đi lấy hàng. Nhận đúng bộ props của WarehouseReceiptPrint.

const TITLE = { NK: 'PHIẾU NHẬP KHO', CV: 'PHIẾU CHUYỂN VỊ TRÍ', XK: 'PHIẾU XUẤT KHO' };

function fmtDate(d) {
  const dt = d instanceof Date ? d : (d ? new Date(d) : new Date());
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

export default function ReceiptPickList({ kind = 'XK', code, date, reason, source, rows = [], thanhPham = [], nguoiNhan, picked, onTogglePick }) {
  const donePicked = picked || new Set();
  const doneCount = rows.filter(r => donePicked.has(pickKey(r))).length;
  const allDone = rows.length > 0 && doneCount === rows.length;

  return (
    <div style={{ color: '#0f172a' }}>
      {/* Đầu phiếu + tiến độ gộp làm MỘT khối — mã phiếu/loại/tiến độ đã có ở thanh trên
          của popup rồi nên ở đây chỉ nhắc gọn 1 dòng, nhường chỗ cho danh sách hàng. */}
      <div style={{
        background: allDone ? '#f0fdf4' : '#f0f9ff',
        border: `1px solid ${allDone ? '#bbf7d0' : '#bae6fd'}`,
        borderRadius: 10, padding: '0.55rem 0.75rem', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0c4a6e', letterSpacing: 0.2 }}>{code}</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: allDone ? '#16a34a' : '#b45309', whiteSpace: 'nowrap' }}>
            {allDone ? '✓ Đã lấy đủ ' : 'Đã lấy '}{doneCount}/{rows.length}
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2, lineHeight: 1.45 }}>
          {[TITLE[kind] || TITLE.XK, fmtDate(date), `${rows.length} mặt hàng`].join(' · ')}
          {(reason || source) && <> · <b style={{ color: '#334155' }}>{reason || source}</b></>}
          {nguoiNhan && <> · Nhận: <b style={{ color: '#334155' }}>{nguoiNhan}</b></>}
        </div>
        {/* Phiếu sản xuất: xuất đống linh kiện này RA ĐỂ LÀM cái gì */}
        {thanhPham.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #bae6fd' }}>
            <div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: 700, letterSpacing: 0.4, marginBottom: 3 }}>
              Thành phẩm cần làm
            </div>
            {thanhPham.map(tp => (
              <div key={tp.ma} style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <b style={{ fontSize: '1rem', color: '#7c3aed', wordBreak: 'break-word' }}>{tp.ma}</b>
                {tp.ten && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{tp.ten}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Thanh tiến độ — liếc là biết còn bao nhiêu, không tốn thêm dòng chữ */}
        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 4, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ width: `${rows.length ? (doneCount / rows.length) * 100 : 0}%`, height: '100%', background: allDone ? '#16a34a' : '#0ea5e9', transition: 'width 0.2s' }} />
        </div>
      </div>

      {/* Từng dòng hàng — thẻ to, dễ đọc khi cầm điện thoại đi lấy hàng */}
      {rows.map((r, i) => {
        const isPicked = donePicked.has(pickKey(r));
        return (
        // Cả thẻ là 1 <label>: chạm đâu cũng tick được — không phải nhắm vào ô vuông bé.
        <label key={i} style={{
          display: 'block', border: `1px solid ${isPicked ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10,
          padding: '0.6rem 0.7rem', marginBottom: 8, background: isPicked ? '#f0fdf4' : '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)', cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <input
              type="checkbox"
              checked={isPicked}
              onChange={() => onTogglePick && onTogglePick(pickKey(r))}
              style={{ width: 24, height: 24, accentColor: '#16a34a', cursor: 'pointer', flexShrink: 0, margin: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0, opacity: isPicked ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '0.98rem', wordBreak: 'break-word', textDecoration: isPicked ? 'line-through' : 'none' }}>
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>{i + 1}.</span> {r.ma}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', lineHeight: 1 }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800 }}>{r.sl}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 3 }}>{r.dvt}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.35, marginTop: 1 }}>{r.ten}</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '3px 8px', minWidth: 0 }}>
                  <MapPin size={15} color="#b45309" style={{ flexShrink: 0 }} />
                  <b style={{ fontSize: '1.05rem', color: '#b45309', wordBreak: 'break-word', lineHeight: 1.25 }}>{r.kho || '—'}</b>
                </span>
                {r.slConLai != null && (
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 7, whiteSpace: 'nowrap',
                    color: r.slConLai === 0 ? '#dc2626' : '#166534',
                    background: r.slConLai === 0 ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${r.slConLai === 0 ? '#fecaca' : '#bbf7d0'}`,
                  }}>
                    {r.slConLai === 0 ? 'Còn lại 0 · HẾT' : `Còn lại ${r.slConLai}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </label>
        );
      })}

      {rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontStyle: 'italic' }}>Phiếu không có dòng hàng nào.</div>
      )}
    </div>
  );
}
