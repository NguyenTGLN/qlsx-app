import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRight, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ModuleShell from '../components/ModuleShell';

const WorkerDashboard = () => {
  const navigate = useNavigate();
  const workerCode = localStorage.getItem('workerCode') || 'Khách';
  const workerName = localStorage.getItem('workerName') || '';

  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch dữ liệu từ DB (dùng chung cho lần đầu + nút Làm mới)
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*, production_logs(actual_quantity)')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ordersWithStats = (data || []).map(order => {
         const produced = (order.production_logs || []).reduce((sum, log) => sum + parseFloat(log.actual_quantity || 0), 0);
         return { ...order, produced, remaining: order.target_quantity - produced };
      }).filter(order => order.remaining > 0);

      setActiveOrders(ordersWithStats);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
                  <p>Hiện tại không có lệnh sản xuất nào.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModuleShell>
  );
};

export default WorkerDashboard;
