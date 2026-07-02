import React, { useState, useEffect } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Printer, Search, Loader2, CheckCircle, Clock, RefreshCw, Check, X, CheckSquare, Square, AlertCircle } from 'lucide-react';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';

export default function PrintQueueTab() {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('UNPRINTED'); // UNPRINTED, PRINTED, ALL
  const [search, setSearch] = useState('');
  
  // Selection state
  const [selected, setSelected] = useState(new Set());

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState('printQueue_pageSize', 50);

  // States for printing modal
  const [printingOrders, setPrintingOrders] = useState([]);
  const [receiptData, setReceiptData] = useState({}); // order_code -> items
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await db.from('inventory_picking_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
        
      if (error) throw error;
      
      const orderMap = new Map();
      
      data.forEach(log => {
        if (!log.order_code) return;
        
        if (!orderMap.has(log.order_code)) {
          orderMap.set(log.order_code, {
            order_code: log.order_code,
            created_at: log.created_at,
            created_by: log.created_by,
            is_printed: log.is_printed || false,
            itemsCount: 1,
            type: log.order_code.startsWith('PNK') ? 'NHẬP KHO' : (log.order_code.startsWith('PXK') ? 'XUẤT KHO' : (log.order_code.startsWith('PDH') ? 'XUẤT LẮP RÁP' : (log.order_code.startsWith('PSX') ? 'XUẤT SẢN XUẤT' : 'KHÁC')))
          });
        } else {
          const existing = orderMap.get(log.order_code);
          existing.itemsCount += 1;
        }
      });
      
      const allOrders = Array.from(orderMap.values());
      setOrders(allOrders);
      // Clean up selection if order is no longer in the list (or changed status)
      // For simplicity, we just clear selection on reload
      setSelected(new Set());
      
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => { setPage(1); }, [filter, search, pageSize]);

  const filteredOrders = orders.filter(o => {
    if (filter === 'UNPRINTED' && o.is_printed) return false;
    if (filter === 'PRINTED' && !o.is_printed) return false;
    if (search) {
      const terms = search.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
      if (terms.length > 0 && !terms.some(t => o.order_code.toLowerCase() === t)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  // Selection handlers
  const toggleSelect = (order_code) => {
    const newSel = new Set(selected);
    if (newSel.has(order_code)) newSel.delete(order_code);
    else newSel.add(order_code);
    setSelected(newSel);
  };

  const toggleAll = () => {
    if (selected.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredOrders.map(o => o.order_code)));
    }
  };

  // Bulk Print Handler
  const handlePrintBatch = async (ordersArray) => {
    if (ordersArray.length === 0) return;
    setLoading(true);
    try {
      const orderCodes = ordersArray.map(o => o.order_code);
      const { data, error } = await db.from('inventory_picking_logs')
        .select('*')
        .in('order_code', orderCodes);
        
      if (error) throw error;
      
      const dataMap = {};
      data.forEach(item => {
        if (!dataMap[item.order_code]) dataMap[item.order_code] = [];
        dataMap[item.order_code].push(item);
      });
      
      setReceiptData(dataMap);
      setPrintingOrders(ordersArray);
      
      // Đợi DOM update hidden printable area
      setTimeout(() => {
         window.print();
         // Hiện Modal xác nhận chuyên nghiệp
         setTimeout(() => {
             setShowConfirmModal(true);
         }, 500);
      }, 500);
      
    } catch (err) {
      alert("Lỗi tải chi tiết phiếu: " + err.message);
    }
    setLoading(false);
  };

  // Confirm Modal Handler
  const confirmPrintSuccess = async (isSuccess) => {
    setShowConfirmModal(false);
    if (isSuccess) {
      setLoading(true);
      try {
        const codes = printingOrders.map(o => o.order_code);
        await db.from('inventory_picking_logs')
          .update({ is_printed: true })
          .in('order_code', codes);
          
        await loadData();
      } catch (err) {
        alert("Lỗi cập nhật trạng thái phiếu: " + err.message);
      }
      setLoading(false);
    }
    // Dọn dẹp state in
    setPrintingOrders([]);
    setReceiptData({});
  };

  const s_btn = { display:'flex',alignItems:'center',gap:5,padding:'0.45rem 0.85rem',borderRadius:7,border:'none',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,transition:'all 0.15s' };

  return (
    <div style={{padding:'0.6rem', background:'#f8fafc', minHeight:'100%', position:'relative'}}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; background: #fff !important; box-shadow: none !important; border: none !important;}
          .no-print { display: none !important; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
      
      <div className="no-print" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem'}}>
        <h2 style={{margin:0, fontSize:'0.95rem', color:'#0f172a', display:'flex', alignItems:'center', gap:6}}>
          <Printer color="#0284c7" size={18}/> Quản Lý Chứng Từ (Chờ In)
        </h2>
        
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          {selected.size > 0 && (
            <div style={{display:'flex', alignItems:'center', gap:10, background:'#e0f2fe', padding:'0.35rem 0.75rem', borderRadius:8, border:'1px solid #bae6fd'}}>
              <span style={{fontSize:'0.85rem', fontWeight:600, color:'#0369a1'}}>Đã chọn {selected.size} phiếu</span>
              <button 
                onClick={() => handlePrintBatch(filteredOrders.filter(o => selected.has(o.order_code)))}
                style={{...s_btn, background:'#0ea5e9', color:'#fff', padding:'0.35rem 0.75rem'}}
              >
                <Printer size={16}/> In Các Phiếu Chọn
              </button>
            </div>
          )}
          
          <SearchAutoSuggest
            tableName="inventory_picking_logs"
            searchColumns={['order_code']}
            displayColumn="order_code"
            placeholder="Tìm mã phiếu..."
            value={search}
            onChange={v => setSearch(v)}
          />
          
          <select 
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            style={{padding:'8px 12px', borderRadius:6, border:'1px solid #cbd5e1', outline:'none', fontSize:'0.9rem', background:'#fff'}}
          >
            <option value="UNPRINTED">Đang Chờ In</option>
            <option value="PRINTED">Đã In</option>
            <option value="ALL">Tất cả</option>
          </select>
          
          <button onClick={loadData} style={{padding:'8px 12px', borderRadius:6, border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5}}>
            <RefreshCw size={16} className={loading ? "spin" : ""} color="#475569" /> Làm mới
          </button>
        </div>
      </div>
      
      <div className="no-print" style={{background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,0.1)', overflow:'hidden'}}>
        {loading && orders.length === 0 ? (
          <div style={{textAlign:'center', padding:'3rem', color:'#64748b'}}><Loader2 size={32} className="spin" style={{margin:'0 auto'}}/></div>
        ) : (
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.75rem'}}>
            <thead>
              <tr style={{background:'#f1f5f9', borderBottom:'2px solid #e2e8f0', textAlign:'left'}}>
                <th style={{padding:'0.45rem 0.6rem', width:40}}>
                  <input 
                    type="checkbox" 
                    checked={filteredOrders.length > 0 && selected.size === filteredOrders.length}
                    onChange={toggleAll}
                    style={{width:16, height:16, cursor:'pointer', accentColor:'#0ea5e9'}}
                  />
                </th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155'}}>Mã Phiếu</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155'}}>Loại Phiếu</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155', textAlign:'center'}}>Số Mặt Hàng</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155'}}>Người Tạo</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155'}}>Ngày Lập</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155', textAlign:'center'}}>Trạng Thái</th>
                <th style={{padding:'0.45rem 0.6rem', fontWeight:600, color:'#334155', textAlign:'center'}}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center', padding:'3rem', color:'#64748b'}}>Không có chứng từ nào phù hợp.</td></tr>
              ) : (
                pagedOrders.map(o => {
                  const isSel = selected.has(o.order_code);
                  return (
                  <tr key={o.order_code} style={{borderBottom:'1px solid #e2e8f0', background: isSel ? '#f0f9ff' : 'transparent', transition:'background 0.1s'}}>
                    <td style={{padding:'0.45rem 0.6rem'}}>
                      <input 
                        type="checkbox" 
                        checked={isSel}
                        onChange={() => toggleSelect(o.order_code)}
                        style={{width:16, height:16, cursor:'pointer', accentColor:'#0ea5e9'}}
                      />
                    </td>
                    <td style={{padding:'0.45rem 0.6rem', fontWeight:700, color:'#0f172a'}}>{o.order_code}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{o.type}</td>
                    <td style={{padding:'0.45rem 0.6rem', textAlign:'center', fontWeight:600}}>{o.itemsCount}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{o.created_by || 'Auto'}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{new Date(o.created_at).toLocaleString('vi-VN')}</td>
                    <td style={{padding:'0.45rem 0.6rem', textAlign:'center'}}>
                      {o.is_printed ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#dcfce7', color:'#16a34a', padding:'4px 8px', borderRadius:20, fontSize:'0.75rem', fontWeight:700}}>
                           <CheckCircle size={14}/> Đã In
                        </span>
                      ) : (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#fff7ed', color:'#ea580c', padding:'4px 8px', borderRadius:20, fontSize:'0.75rem', fontWeight:700}}>
                           <Clock size={14}/> Chưa In
                        </span>
                      )}
                    </td>
                    <td style={{padding:'0.45rem 0.6rem', textAlign:'center'}}>
                      <button 
                        onClick={() => handlePrintBatch([o])}
                        disabled={loading}
                        style={{background: o.is_printed ? '#f1f5f9' : '#0ea5e9', color: o.is_printed ? '#475569' : '#fff', border:'none', padding:'6px 12px', borderRadius:6, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5}}
                      >
                        <Printer size={16}/> {o.is_printed ? 'In Lại' : 'In Phiếu'}
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
        {!loading && filteredOrders.length > 0 && (
          <div style={{padding:'0.5rem', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', fontSize:'0.75rem', color:'#64748b', flexWrap:'wrap', gap:'0.5rem'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span><strong style={{color:'#334155'}}>{filteredOrders.length}</strong> phiếu</span>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{padding:'0.2rem 0.4rem', border:'1px solid #e2e8f0', borderRadius:7, fontSize:'0.75rem', outline:'none', background:'#fff', color:'#334155'}}>
                <option value={50}>50/trang</option>
                <option value={100}>100/trang</option>
                <option value={500}>500/trang</option>
                <option value={1000}>1K/trang</option>
                <option value={5000}>5K/trang</option>
                <option value={10000}>10K/trang</option>
              </select>
            </div>
            <div style={{display:'flex', gap:5}}>
              <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} style={{padding:'0.25rem 0.6rem', border:'1px solid #cbd5e1', background: page===1?'#f1f5f9':'#fff', color: page===1?'#94a3b8':'#0f172a', borderRadius:7, cursor: page===1?'not-allowed':'pointer', fontSize:'0.75rem', fontWeight:600}}>Trước</button>
              <span style={{padding:'0.25rem 0.6rem', background:'#fff', border:'1px solid #e2e8f0', borderRadius:7, fontWeight:600, color:'#0891b2'}}>{page} / {totalPages}</span>
              <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} style={{padding:'0.25rem 0.6rem', border:'1px solid #cbd5e1', background: page>=totalPages?'#f1f5f9':'#fff', color: page>=totalPages?'#94a3b8':'#0f172a', borderRadius:7, cursor: page>=totalPages?'not-allowed':'pointer', fontSize:'0.75rem', fontWeight:600}}>Sau</button>
            </div>
          </div>
        )}
      </div>

      {/* Professional Confirm Modal */}
      {showConfirmModal && (
        <div className="no-print" style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#fff', width:'400px', borderRadius:16, overflow:'hidden', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation:'fadeIn 0.2s ease-out'}}>
            <div style={{background:'#f0fdf4', padding:'1.5rem', display:'flex', flexDirection:'column', alignItems:'center', borderBottom:'1px solid #e2e8f0'}}>
              <div style={{width:56, height:56, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16}}>
                <Printer size={28} color="#16a34a" />
              </div>
              <h3 style={{margin:0, fontSize:'1.25rem', color:'#166534', fontWeight:800}}>Xác Nhận In Ấn</h3>
            </div>
            
            <div style={{padding:'1.5rem', textAlign:'center'}}>
              <p style={{margin:'0 0 0.5rem 0', fontSize:'1rem', color:'#334155', fontWeight:600}}>Quá trình in đã hoàn tất chưa?</p>
              <p style={{margin:0, fontSize:'0.85rem', color:'#64748b'}}>Hệ thống sẽ chuyển trạng thái của {printingOrders.length} phiếu sang <b>"Đã In"</b> nếu bạn xác nhận Thành Công.</p>
            </div>
            
            <div style={{padding:'1rem 1.5rem', background:'#f8fafc', display:'flex', gap:'1rem', borderTop:'1px solid #e2e8f0'}}>
              <button 
                onClick={() => confirmPrintSuccess(false)}
                style={{flex:1, display:'flex', justifyContent:'center', alignItems:'center', gap:6, padding:'0.6rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:700, cursor:'pointer'}}
              >
                <X size={18}/> In Lỗi / Hủy Bỏ
              </button>
              <button 
                onClick={() => confirmPrintSuccess(true)}
                style={{flex:1, display:'flex', justifyContent:'center', alignItems:'center', gap:6, padding:'0.6rem', borderRadius:8, border:'none', background:'#16a34a', color:'#fff', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 6px -1px rgba(22,163,74,0.3)'}}
              >
                <Check size={18}/> In Thành Công
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Area - Renders multiple orders with page breaks */}
      {printingOrders.length > 0 && Object.keys(receiptData).length > 0 && (
        <div id="print-area" style={{width:'100%', maxWidth:800, background:'#fff', fontFamily:'sans-serif'}}>
          {printingOrders.map((order, index) => {
            const data = receiptData[order.order_code] || [];
            return (
            <div key={order.order_code} style={{padding:'40px', pageBreakAfter: index < printingOrders.length - 1 ? 'always' : 'auto'}}>
              <h2 style={{textAlign:'center', fontSize:24, color:'#000', margin:'0 0 20px 0'}}>
                PHIẾU {order.type}
              </h2>
              
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:20, fontSize:'0.9rem', color:'#000'}}>
                 <div>
                   <p style={{margin:'4px 0'}}><strong>Mã Phiếu:</strong> {order.order_code}</p>
                   <p style={{margin:'4px 0'}}><strong>Người lập:</strong> {order.created_by || 'Hệ thống'}</p>
                 </div>
                 <div style={{textAlign:'right'}}>
                   <p style={{margin:'4px 0'}}><strong>Ngày lập (DB):</strong> {new Date(order.created_at).toLocaleDateString('vi-VN')}</p>
                   <p style={{margin:'4px 0'}}><strong>Ngày in:</strong> {new Date().toLocaleDateString('vi-VN')}</p>
                 </div>
              </div>

              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem', color:'#000'}}>
                <thead>
                  <tr>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'left'}}>Mã hàng / LK</th>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'left'}}>Tên hàng</th>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'center'}}>Vị trí kho</th>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'center'}}>Nhập/Xuất</th>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'right'}}>Số lượng</th>
                    <th style={{borderBottom:'2px solid #000', padding:'8px', textAlign:'left'}}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => (
                    <tr key={idx} style={{borderBottom:'1px solid #ccc'}}>
                      <td style={{padding:'8px', fontWeight:600}}>{item.component_code}</td>
                      <td style={{padding:'8px'}}>{item.component_name}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>{item.location}</td>
                      <td style={{padding:'8px', textAlign:'center', fontWeight:700}}>
                        {item.quantity_taken > 0 ? 'Nhập' : 'Xuất'}
                      </td>
                      <td style={{padding:'8px', textAlign:'right', fontWeight:700}}>
                        {Math.abs(item.quantity_taken)}
                      </td>
                      <td style={{padding:'8px', textAlign:'left', color:'#555'}}>{item.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{display:'flex', justifyContent:'space-between', marginTop:50, padding:'0 30px', textAlign:'center'}}>
                 <div>
                   <b>Người lập phiếu</b><br/><i>(Ký, họ tên)</i>
                 </div>
                 <div>
                   <b>Thủ kho</b><br/><i>(Ký, họ tên)</i>
                 </div>
                 <div>
                   <b>Bên nhận/giao</b><br/><i>(Ký, họ tên)</i>
                 </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
