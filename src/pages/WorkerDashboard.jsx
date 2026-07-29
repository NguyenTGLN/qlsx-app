import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRight, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ModuleShell from '../components/ModuleShell';
import { BO_LOC, NHAN_BO_LOC, locPhieuSanXuat, demTheoBoLoc, locViecHoTro } from '../lib/locPhieuSanXuat';
import KhuViecHoTro from '../components/KhuViecHoTro';

const WorkerDashboard = () => {
  const navigate = useNavigate();
  const workerCode = localStorage.getItem('workerCode') || 'Khách';
  const workerName = localStorage.getItem('workerName') || '';

  const [allOrders, setAllOrders] = useState([]);
  const [boLoc, setBoLoc] = useState(BO_LOC.DANG_LAM);
  const [loading, setLoading] = useState(true);

  // Fetch dữ liệu từ DB (dùng chung cho lần đầu + nút Làm mới)
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Lấy cả 'completed': tab "Đã hoàn thành" phải thấy được lệnh đã chốt xong,
      // trước đây danh sách chỉ hiện việc đang dở nên không cần lấy.
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, production_logs(actual_quantity)')
        .in('status', ['pending', 'in_progress', 'completed'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Không cắt bớt ở đây nữa — việc lọc do người dùng chọn, xem locPhieuSanXuat.
      setAllOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const activeOrders = useMemo(() => locPhieuSanXuat(allOrders, boLoc), [allOrders, boLoc]);
  const soLuong = useMemo(() => demTheoBoLoc(allOrders), [allOrders]);
  const viecHoTro = useMemo(() => locViecHoTro(allOrders), [allOrders]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <ModuleShell
      title={`Sản Xuất — ${workerName || workerCode}`}
      icon={ClipboardList}
      color="#f97316"
      loading={loading}
      onRefresh={fetchOrders}
    >
      <div style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <ClipboardList size={18} color="#f97316" />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>Danh sách Lệnh Sản Xuất</h3>
        </div>

        {/* Nút lọc — CHIA ĐỀU bề ngang màn hình, KHÔNG cuộn ngang, chữ LUÔN 1 DÒNG.
            `minmax(0, 1fr)` là mấu chốt: mặc định cột grid không co nhỏ hơn nội dung
            bên trong (min-width:auto), nên chỉ `1fr` thôi thì nhãn dài vẫn đẩy tràn ra
            ngoài. `nowrap` chặn xuống dòng; cỡ chữ co theo vw để máy hẹp vẫn đủ chỗ. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${NHAN_BO_LOC.length}, minmax(0, 1fr))`,
          gap: '0.35rem',
          marginBottom: '1rem',
        }}>
          {NHAN_BO_LOC.map(({ key, label }) => {
            const dangChon = boLoc === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setBoLoc(key)}
                aria-pressed={dangChon}
                title={label}
                style={{
                  width: '100%',
                  minWidth: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', columnGap: '0.25rem',
                  padding: '0.45rem 0.35rem',
                  borderRadius: '999px',
                  border: `1px solid ${dangChon ? '#f97316' : '#e2e8f0'}`,
                  background: dangChon ? '#f97316' : '#fff',
                  color: dangChon ? '#fff' : '#475569',
                  // Sàn 0.62rem (≈9.9px) là mức vừa đủ để nhãn dài nhất nằm 1 dòng ở máy
                  // 320px — đo thực tế, không phải áng chừng. Hạ sàn thấp hơn nữa thì chữ
                  // bắt đầu khó đọc; nhãn nào dài hơn thì rút gọn chữ chứ đừng hạ tiếp.
                  fontSize: 'clamp(0.62rem, 3.1vw, 0.8rem)',
                  lineHeight: 1.25,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',   // luôn 1 dòng — không bao giờ xuống dòng thứ 2
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                {/* minWidth:0 + ellipsis: nếu có ai đổi nhãn dài hơn thì cắt bớt bằng "…"
                    chứ tuyệt đối không đẩy tràn ra khỏi mép màn hình. */}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {label}
                </span>
                <span style={{
                  flexShrink: 0,
                  fontSize: '0.72em',
                  fontWeight: 700,
                  padding: '0.05rem 0.3rem',
                  borderRadius: '999px',
                  background: dangChon ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: dangChon ? '#fff' : '#64748b',
                }}>
                  {soLuong[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <p style={{textAlign: 'center', color: '#64748b'}}>Đang tải dữ liệu...</p>
          ) : (
            <>
              {activeOrders.map(order => (
                <div
                  key={order.id}
                  style={{ background: '#fff', borderRadius: '12px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer', transition: 'transform 0.15s', border: '1px solid #e2e8f0' }}
                  onClick={() => navigate(`/worker/input/${order.id}`, { state: { order } })}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff7ed', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                      <Package size={14} color="#f97316" />
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f97316' }}>{order.product_code}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{formatDate(order.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0, flexShrink: 1 }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Mã Phiếu</p>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.order_code}</p>
                    </div>
                    <div style={{textAlign: 'right', flexShrink: 0}}>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Chỉ tiêu / Đã Nhập / Còn</p>
                      <p style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        <span style={{fontSize:'0.95rem', color:'#64748b'}}>{Number(parseFloat(order.target_quantity).toFixed(1))} / </span>
                        <span style={{fontSize:'0.95rem', color:'#10b981', fontWeight:700}}>{Number(parseFloat(order.produced).toFixed(1))} / </span>
                        <span style={{fontSize:'0.95rem', fontWeight:700, color: order.remaining > 0 ? '#ef4444' : '#10b981'}}>{order.remaining > 0 ? Number(parseFloat(order.remaining).toFixed(1)) : 'Xong'}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {activeOrders.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#fff', borderRadius: '12px' }}>
                  <p style={{ margin: 0 }}>
                    {boLoc === BO_LOC.DANG_LAM ? 'Không có lệnh nào đang thực hiện.'
                      : boLoc === BO_LOC.HOAN_THANH ? 'Chưa có lệnh nào hoàn thành.'
                      : 'Hiện tại không có lệnh sản xuất nào.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <KhuViecHoTro
          danhSach={viecHoTro}
          onChon={(order) => navigate(`/worker/input/${order.id}`, { state: { order } })}
        />
      </div>
    </ModuleShell>
  );
};

export default WorkerDashboard;
