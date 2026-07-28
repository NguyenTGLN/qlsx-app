import React from 'react';
import { Wrench } from 'lucide-react';
import { thongTinViec } from '../lib/congViecHoTro';

// Khu "Công việc khác" trên màn hình Sản Xuất của thợ.
//
// Năm phiếu thường trực (GH/NH/DK/DTNB/PS) LUÔN hiện đủ, không chịu 3 nút lọc phía
// trên: phiếu thường trực thì "hoàn thành / đang làm" vô nghĩa. Thẻ ở đây cũng không
// có cụm "Chỉ tiêu / Đã Nhập / Còn" vì các việc này không có chỉ tiêu.
//
// Giao diện theo luật của dự án: lưới chia đều `minmax(0, 1fr)`, chữ luôn 1 dòng
// (`nowrap` + ellipsis), cỡ chữ co theo bề ngang máy — không bao giờ cuộn ngang.
const KhuViecHoTro = ({ danhSach = [], onChon }) => {
  if (!danhSach.length) return null;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Wrench size={16} color="#64748b" />
        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Công việc khác</h3>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.5rem',
      }}>
        {danhSach.map(order => {
          const tt = thongTinViec(order.product_code);
          return (
            <button
              key={order.id}
              type="button"
              data-viec={order.product_code}
              title={tt?.tenDayDu || order.product_code}
              onClick={() => onChon(order)}
              style={{
                width: '100%',
                minWidth: 0,
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '0.75rem',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{
                fontWeight: 700,
                color: '#0f172a',
                fontSize: 'clamp(0.72rem, 3.4vw, 0.9rem)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {tt?.nhan || order.product_code}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: '#94a3b8',
                fontWeight: 600,
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {order.product_code}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default KhuViecHoTro;
