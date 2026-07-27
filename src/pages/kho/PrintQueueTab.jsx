import React, { useState, useEffect } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Printer, Search, Loader2, CheckCircle, Clock, RefreshCw, Check, X, CheckSquare, Square, AlertCircle, Ban, Eye } from 'lucide-react';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import WarehouseReceiptPrint from '../../components/WarehouseReceiptPrint';
import ReceiptPickList from '../../components/ReceiptPickList';
import { PageSizeSelect } from '../../components/WarehouseSharedUI';
import DateRangeDropdown from '../../components/DateRangeDropdown';
import { cancelPhieu } from '../../lib/cancelDoc';
import { buildReceiptProps } from '../../lib/receiptView';
// created_at (timestamp) -> YYYY-MM-DD theo giờ địa phương, để so với khoảng ngày (from/to) của DateRangeDropdown.
const toLocalDate = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function PrintQueueTab({ cancelPerm = false }) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('UNPRINTED'); // UNPRINTED, PRINTED, ALL
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ preset: 'Tất cả', from: '', to: '' }); // lọc theo Ngày Lập (created_at)
  
  // Selection state
  const [selected, setSelected] = useState(new Set());

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState('printQueue_pageSize', 50);

  // States for printing modal
  const [printingOrders, setPrintingOrders] = useState([]);
  const [receiptData, setReceiptData] = useState({}); // order_code -> items
  const [unitMap, setUnitMap] = useState({}); // item_code -> ĐVT (tra từ danh mục HH)
  const [nameMap, setNameMap] = useState({}); // item_code -> tên hàng (dùng cho mã thành phẩm phiếu SX)
  const [nccMap, setNccMap] = useState({});   // tên/mã NCC (lowercase) -> { dia_chi, so_dien_thoai }
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // States for view-receipt modal (xem phiếu trên màn hình — KHÔNG đánh dấu đã in)
  const [viewOrder, setViewOrder] = useState(null);   // phiếu đang mở xem
  const [viewRows, setViewRows] = useState([]);       // các dòng picking-log của phiếu đó
  const [viewLoading, setViewLoading] = useState(false);
  // Tick "đã lấy" theo từng phiếu: { [order_code]: [key,...] }. Lưu localStorage nên đóng
  // phiếu / tải lại trang vẫn còn — riêng từng máy, không đẩy lên máy chủ.
  const [pickedMap, setPickedMap] = usePersistedState('printQueue_picked', {});
  const pickedOfView = React.useMemo(
    () => new Set(viewOrder ? (pickedMap[viewOrder.order_code] || []) : []),
    [pickedMap, viewOrder]
  );
  const togglePick = (key) => {
    if (!viewOrder) return;
    const code = viewOrder.order_code;
    setPickedMap(prev => {
      const cur = new Set(prev[code] || []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      return { ...prev, [code]: [...cur] };
    });
  };
  const clearPicks = () => {
    if (!viewOrder) return;
    setPickedMap(prev => ({ ...prev, [viewOrder.order_code]: [] }));
  };

  // States for cancel-document modal
  const [cancelTarget, setCancelTarget] = useState(null); // order đang hủy
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

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
            is_cancelled: !!log.is_cancelled,
            itemsCount: 1,
            type: log.order_code.startsWith('PNK') ? 'NHẬP KHO' : (log.order_code.startsWith('PXK') ? 'XUẤT KHO' : (log.order_code.startsWith('PDH') ? 'XUẤT LẮP RÁP' : (log.order_code.startsWith('PSX') ? 'XUẤT SẢN XUẤT' : (log.order_code.startsWith('PCV') ? 'CHUYỂN VỊ TRÍ SX' : 'KHÁC'))))
          });
        } else {
          const existing = orderMap.get(log.order_code);
          existing.itemsCount += 1;
          if (log.is_cancelled) existing.is_cancelled = true;
        }
      });
      
      // Sắp xếp theo Ngày Lập từ mới đến cũ (không phụ thuộc thứ tự gom Map).
      // Cùng thời điểm tạo → mã phiếu mới hơn (sequence lớn hơn) lên trước cho ổn định.
      const allOrders = Array.from(orderMap.values())
        .sort((a, b) => {
          const dt = new Date(b.created_at) - new Date(a.created_at);
          if (dt !== 0) return dt;
          return String(b.order_code).localeCompare(String(a.order_code));
        });
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

  useEffect(() => { setPage(1); }, [filter, search, pageSize, dateRange]);

  const filteredOrders = orders.filter(o => {
    if (filter === 'UNPRINTED' && (o.is_printed || o.is_cancelled)) return false;
    if (filter === 'PRINTED' && (!o.is_printed || o.is_cancelled)) return false;
    if (filter === 'CANCELLED' && !o.is_cancelled) return false;
    if (dateRange.preset !== 'Tất cả') {
      const d = toLocalDate(o.created_at);
      if (dateRange.from && d < dateRange.from) return false;
      if (dateRange.to && d > dateRange.to) return false;
    }
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
    const selectableOrders = filteredOrders.filter(o => !o.is_cancelled);
    if (selected.size === selectableOrders.length && selectableOrders.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableOrders.map(o => o.order_code)));
    }
  };

  // Bulk Print Handler
  const handlePrintBatch = async (ordersArrayIn) => {
    const ordersArray = ordersArrayIn.filter(o => !o.is_cancelled);
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

      // Tra ĐVT + tên hàng từ danh mục HH (1 truy vấn cho cả lô).
      // Gộp luôn product_code để lấy TÊN thành phẩm của phiếu sản xuất.
      const codes = [...new Set([
        ...data.map(d => d.component_code),
        ...data.map(d => d.product_code),
      ].filter(Boolean))];
      const uMap = {}, nameM = {};
      if (codes.length > 0) {
        const { data: items } = await db.from('inventory_items').select('item_code, unit, item_name').in('item_code', codes);
        (items || []).forEach(it => { uMap[it.item_code] = it.unit || ''; nameM[it.item_code] = it.item_name || ''; });
      }

      // Tra địa chỉ + SĐT theo NCC (khớp theo tên hoặc mã NCC, lowercase)
      const nMap = {};
      const { data: nccs } = await db.from('nha_cung_cap').select('ma_ncc, ten_ncc, dia_chi, so_dien_thoai');
      (nccs || []).forEach(n => {
        const info = { dia_chi: n.dia_chi || '', so_dien_thoai: n.so_dien_thoai || '' };
        if (n.ten_ncc) nMap[n.ten_ncc.trim().toLowerCase()] = info;
        if (n.ma_ncc) nMap[n.ma_ncc.trim().toLowerCase()] = info;
      });

      setUnitMap(uMap);
      setNameMap(nameM);
      setNccMap(nMap);
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
    setUnitMap({});
    setNameMap({});
    setNccMap({});
  };

  // Xem phiếu trên màn hình — để nhân viên biết đi lấy linh kiện ở vị trí nào.
  // Chỉ ĐỌC: không đụng vào is_printed, phiếu vẫn nằm nguyên ở danh sách chờ in.
  const handleViewDoc = async (order) => {
    setViewOrder(order);
    setViewRows([]);
    setViewLoading(true);
    try {
      const { data, error } = await db.from('inventory_picking_logs')
        .select('*')
        .eq('order_code', order.order_code);
      if (error) throw error;

      const codes = [...new Set([
        ...(data || []).map(d => d.component_code),
        ...(data || []).map(d => d.product_code),
      ].filter(Boolean))];
      const uMap = {}, nameM = {};
      if (codes.length > 0) {
        const { data: items } = await db.from('inventory_items').select('item_code, unit, item_name').in('item_code', codes);
        (items || []).forEach(it => { uMap[it.item_code] = it.unit || ''; nameM[it.item_code] = it.item_name || ''; });
      }
      setUnitMap(prev => ({ ...prev, ...uMap }));
      setNameMap(prev => ({ ...prev, ...nameM }));
      setViewRows(data || []);
    } catch (err) {
      alert('Lỗi tải chi tiết phiếu: ' + err.message);
      setViewOrder(null);
    }
    setViewLoading(false);
  };

  // Cancel Document Handler
  const handleCancelDoc = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { alert('Vui lòng nhập lý do hủy phiếu.'); return; }
    setCancelBusy(true);
    try {
      const user = localStorage.getItem('qlsx_user') || 'Nhân viên';
      const res = await cancelPhieu(cancelTarget.order_code, user, cancelReason);
      alert(`Đã hủy phiếu ${res.order_code} (đảo ${res.reversed_lines} dòng). Tồn kho đã hoàn về trạng thái trước khi lập phiếu.`);
      setCancelTarget(null);
      setCancelReason('');
      await loadData();
    } catch (e) {
      alert('Không thể hủy phiếu:\n' + e.message);
    }
    setCancelBusy(false);
  };

  const s_btn = { display:'flex',alignItems:'center',gap:5,padding:'0.45rem 0.85rem',borderRadius:7,border:'none',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,transition:'all 0.15s' };

  return (
    <div style={{padding:'0.6rem', background:'#f8fafc', minHeight:'100%', position:'relative'}}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; background: #fff !important; box-shadow: none !important; border: none !important;}
          .no-print { display: none !important; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        /* Điện thoại: bảng 8 cột tràn ngang làm cột Thao Tác (nút Xem/In) lọt ra ngoài màn hình
           → đổi sang danh sách thẻ, mỗi phiếu 1 thẻ có sẵn nút bấm. */
        .pq-cards { display: none; }
        .pq-modal-desktop { display: block; }
        .pq-modal-mobile { display: none; }
        @media (max-width: 860px) {
          .pq-table-wrap { display: none; }
          .pq-cards { display: block; }
          .pq-toolbar { width: 100%; }
          .pq-toolbar > * { flex: 1 1 auto; min-width: 0; }
          /* Xem phiếu: chiếm gần trọn màn hình để nhìn rõ nhất */
          .pq-modal-backdrop { padding: 0 !important; }
          .pq-modal { width: 100% !important; max-width: 100% !important; height: 100%; max-height: 100% !important; border-radius: 0 !important; }
          .pq-modal-desktop { display: none; }
          .pq-modal-mobile { display: block; }
        }
      `}</style>
      
      <div className="no-print" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem'}}>
        <h2 style={{margin:0, fontSize:'0.95rem', color:'#0f172a', display:'flex', alignItems:'center', gap:6}}>
          <Printer color="#0284c7" size={18}/> Quản Lý Chứng Từ (Chờ In)
        </h2>
        
        <div className="pq-toolbar" style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
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

          <DateRangeDropdown label="Ngày lập" value={dateRange} onChange={setDateRange} alignRight={true} />

          <select
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            style={{padding:'8px 12px', borderRadius:6, border:'1px solid #cbd5e1', outline:'none', fontSize:'0.9rem', background:'#fff'}}
          >
            <option value="UNPRINTED">Đang Chờ In</option>
            <option value="PRINTED">Đã In</option>
            <option value="CANCELLED">Đã Hủy</option>
            <option value="ALL">Tất cả</option>
          </select>

          <PageSizeSelect value={pageSize} onChange={setPageSize} style={{padding:'8px 12px', fontSize:'0.9rem'}} />

          <button onClick={loadData} style={{padding:'8px 12px', borderRadius:6, border:'1px solid #cbd5e1', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5}}>
            <RefreshCw size={16} className={loading ? "spin" : ""} color="#475569" /> Làm mới
          </button>
        </div>
      </div>
      
      <div className="no-print" style={{background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,0.1)', overflow:'hidden'}}>
        {loading && orders.length === 0 ? (
          <div style={{textAlign:'center', padding:'3rem', color:'#64748b'}}><Loader2 size={32} className="spin" style={{margin:'0 auto'}}/></div>
        ) : (
          <>
          <div className="pq-table-wrap">
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.75rem'}}>
            <thead>
              <tr style={{background:'#f1f5f9', borderBottom:'2px solid #e2e8f0', textAlign:'left'}}>
                <th style={{padding:'0.45rem 0.6rem', width:40}}>
                  <input
                    type="checkbox"
                    checked={(() => { const sel = filteredOrders.filter(o => !o.is_cancelled); return sel.length > 0 && selected.size === sel.length; })()}
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
                        disabled={o.is_cancelled}
                        onChange={() => toggleSelect(o.order_code)}
                        style={{width:16, height:16, cursor: o.is_cancelled ? 'not-allowed' : 'pointer', accentColor:'#0ea5e9'}}
                      />
                    </td>
                    <td style={{padding:'0.45rem 0.6rem', fontWeight:700, color:'#0f172a'}}>{o.order_code}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{o.type}</td>
                    <td style={{padding:'0.45rem 0.6rem', textAlign:'center', fontWeight:600}}>{o.itemsCount}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{o.created_by || 'Auto'}</td>
                    <td style={{padding:'0.45rem 0.6rem'}}>{new Date(o.created_at).toLocaleString('vi-VN')}</td>
                    <td style={{padding:'0.45rem 0.6rem', textAlign:'center'}}>
                      {o.is_cancelled ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#f1f5f9', color:'#64748b', padding:'4px 8px', borderRadius:20, fontSize:'0.75rem', fontWeight:700, textDecoration:'line-through'}}>
                           <Ban size={14}/> Đã Hủy
                        </span>
                      ) : o.is_printed ? (
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
                      {o.is_cancelled ? (
                        <span style={{color:'#94a3b8', fontSize:'0.75rem'}}>Đã hủy</span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleViewDoc(o)}
                            disabled={loading}
                            title="Mở phiếu xem trên màn hình (không tính là đã in)"
                            style={{background:'#fff', color:'#0369a1', border:'1px solid #bae6fd', padding:'6px 12px', borderRadius:6, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5, marginRight:6}}
                          >
                            <Eye size={16}/> Xem Phiếu
                          </button>
                          <button
                            onClick={() => handlePrintBatch([o])}
                            disabled={loading}
                            style={{background: o.is_printed ? '#f1f5f9' : '#0ea5e9', color: o.is_printed ? '#475569' : '#fff', border:'none', padding:'6px 12px', borderRadius:6, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5}}
                          >
                            <Printer size={16}/> {o.is_printed ? 'In Lại' : 'In Phiếu'}
                          </button>
                          {cancelPerm && (
                            <button onClick={() => { setCancelTarget(o); setCancelReason(''); }} disabled={loading}
                              style={{background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', padding:'6px 10px', borderRadius:6, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, marginLeft:6}}>
                              <Ban size={14}/> Hủy
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          {/* Bản cho điện thoại: mỗi phiếu 1 thẻ, nút Xem/In luôn nằm trong màn hình */}
          <div className="pq-cards">
            {filteredOrders.length === 0 ? (
              <div style={{textAlign:'center', padding:'3rem', color:'#64748b'}}>Không có chứng từ nào phù hợp.</div>
            ) : pagedOrders.map(o => {
              const isSel = selected.has(o.order_code);
              return (
                <div key={o.order_code} style={{borderBottom:'1px solid #e2e8f0', padding:'0.75rem', background: isSel ? '#f0f9ff' : '#fff'}}>
                  <div style={{display:'flex', alignItems:'flex-start', gap:10}}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      disabled={o.is_cancelled}
                      onChange={() => toggleSelect(o.order_code)}
                      style={{width:18, height:18, marginTop:2, cursor: o.is_cancelled ? 'not-allowed' : 'pointer', accentColor:'#0ea5e9', flexShrink:0}}
                    />
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:800, fontSize:'0.95rem', color:'#0f172a', wordBreak:'break-word'}}>{o.order_code}</div>
                      <div style={{fontSize:'0.78rem', color:'#475569', marginTop:2}}>
                        {o.type} · <b>{o.itemsCount}</b> mặt hàng
                      </div>
                      <div style={{fontSize:'0.72rem', color:'#64748b', marginTop:2}}>
                        {o.created_by || 'Auto'} · {new Date(o.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <div style={{flexShrink:0}}>
                      {o.is_cancelled ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#f1f5f9', color:'#64748b', padding:'4px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:700, textDecoration:'line-through'}}>
                          <Ban size={13}/> Đã Hủy
                        </span>
                      ) : o.is_printed ? (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#dcfce7', color:'#16a34a', padding:'4px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:700}}>
                          <CheckCircle size={13}/> Đã In
                        </span>
                      ) : (
                        <span style={{display:'inline-flex', alignItems:'center', gap:4, background:'#fff7ed', color:'#ea580c', padding:'4px 8px', borderRadius:20, fontSize:'0.7rem', fontWeight:700}}>
                          <Clock size={13}/> Chưa In
                        </span>
                      )}
                    </div>
                  </div>

                  {!o.is_cancelled && (
                    <div style={{display:'flex', gap:8, marginTop:10}}>
                      <button
                        onClick={() => handleViewDoc(o)}
                        disabled={loading}
                        style={{flex:2, justifyContent:'center', background:'#0369a1', color:'#fff', border:'none', padding:'10px', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}
                      >
                        <Eye size={17}/> Xem Phiếu
                      </button>
                      <button
                        onClick={() => handlePrintBatch([o])}
                        disabled={loading}
                        style={{flex:1, justifyContent:'center', background: o.is_printed ? '#f1f5f9' : '#0ea5e9', color: o.is_printed ? '#475569' : '#fff', border:'none', padding:'10px', borderRadius:8, fontWeight:700, fontSize:'0.85rem', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6}}
                      >
                        <Printer size={17}/> {o.is_printed ? 'In Lại' : 'In'}
                      </button>
                      {cancelPerm && (
                        <button onClick={() => { setCancelTarget(o); setCancelReason(''); }} disabled={loading}
                          style={{background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', padding:'10px 12px', borderRadius:8, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4}}>
                          <Ban size={15}/>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
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

      {/* Cancel Document Confirm Modal */}
      {cancelTarget && (
        <div className="no-print" style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{background:'#fff', width:'430px', maxWidth:'92vw', borderRadius:16, overflow:'hidden', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <div style={{background:'#fef2f2', padding:'1.25rem 1.5rem', borderBottom:'1px solid #fecaca'}}>
              <h3 style={{margin:0, fontSize:'1.1rem', color:'#991b1b', fontWeight:800, display:'flex', alignItems:'center', gap:8}}>
                <Ban size={20}/> Hủy Phiếu {cancelTarget.order_code}
              </h3>
            </div>
            <div style={{padding:'1.25rem 1.5rem'}}>
              <p style={{margin:'0 0 0.75rem 0', fontSize:'0.85rem', color:'#334155'}}>
                Hệ thống sẽ <b>đảo ngược toàn bộ</b>: hoàn tồn kho về đúng vị trí, gỡ dữ liệu nhập/xuất và thống kê liên quan. Phiếu chuyển thành <b>"Đã Hủy"</b> (không in, không khôi phục được).
              </p>
              {String(cancelTarget.order_code || '').startsWith('PCV') && (
                <p style={{margin:'0 0 0.75rem 0', fontSize:'0.8rem', color:'#b45309', fontWeight:700, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 10px'}}>
                  ⚠️ Phiếu chuyển vị trí: hủy chỉ sửa SỔ SÁCH — phải mang hàng từ vị trí tập kết SX4 trả về vị trí cũ.
                  Chỉ hủy khi hàng ở SX4 CHƯA được dùng để sản xuất; nếu đã dùng thì tồn sẽ sai vị trí.
                </p>
              )}
              {cancelTarget.is_printed && (
                <p style={{margin:'0 0 0.75rem 0', fontSize:'0.8rem', color:'#dc2626', fontWeight:700}}>⚠️ Phiếu này ĐÃ IN — hãy thu hồi bản in giấy sau khi hủy.</p>
              )}
              <label style={{fontSize:'0.8rem', fontWeight:700, color:'#475569', display:'block', marginBottom:4}}>Lý do hủy (bắt buộc)</label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
                placeholder="VD: khách hủy đơn / lập nhầm phiếu..."
                style={{width:'100%', padding:'8px 10px', border:'1px solid #cbd5e1', borderRadius:8, fontSize:'0.85rem', outline:'none', resize:'vertical', boxSizing:'border-box'}} />
            </div>
            <div style={{padding:'1rem 1.5rem', background:'#f8fafc', display:'flex', gap:'0.75rem', borderTop:'1px solid #e2e8f0'}}>
              <button onClick={() => setCancelTarget(null)} disabled={cancelBusy}
                style={{flex:1, padding:'0.6rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:700, cursor:'pointer'}}>Không hủy</button>
              <button onClick={handleCancelDoc} disabled={cancelBusy || !cancelReason.trim()}
                style={{flex:1, padding:'0.6rem', borderRadius:8, border:'none', background: cancelBusy || !cancelReason.trim() ? '#fca5a5' : '#dc2626', color:'#fff', fontWeight:700, cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:6}}>
                {cancelBusy ? <Loader2 size={16} className="spin"/> : <Ban size={16}/>} XÁC NHẬN HỦY
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Modal XEM PHIẾU — chỉ đọc, không đổi trạng thái in. Cuộn được để xem trên điện thoại. */}
      {viewOrder && (
        <div className="no-print pq-modal-backdrop" onClick={() => setViewOrder(null)}
          style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'}}>
          <div className="pq-modal" onClick={e => e.stopPropagation()}
            style={{background:'#fff', width:900, maxWidth:'100%', height:'92vh', maxHeight:'92vh', borderRadius:16, overflow:'hidden', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.2)', display:'flex', flexDirection:'column'}}>

            {/* Thanh đầu: mã phiếu + nút Đóng luôn nhìn thấy, không bị cuộn mất */}
            <div style={{padding:'0.5rem 0.75rem', background:'#f0f9ff', borderBottom:'1px solid #bae6fd', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexShrink:0}}>
              <div style={{minWidth:0, display:'flex', alignItems:'center', gap:7}}>
                <Eye size={17} color="#0369a1" style={{flexShrink:0}}/>
                <span style={{fontSize:'0.95rem', color:'#0c4a6e', fontWeight:800, wordBreak:'break-word'}}>{viewOrder.order_code}</span>
                <span title="Chỉ xem — không tính là đã in"
                  style={{fontSize:'0.62rem', color:'#0369a1', background:'#e0f2fe', border:'1px solid #bae6fd', padding:'1px 6px', borderRadius:20, fontWeight:700, whiteSpace:'nowrap', flexShrink:0}}>
                  CHỈ XEM
                </span>
              </div>
              <button onClick={() => setViewOrder(null)} aria-label="Đóng"
                style={{...s_btn, background:'#0f172a', color:'#fff', padding:'0.45rem 0.85rem', flexShrink:0, fontSize:'0.85rem'}}>
                <X size={17}/> Đóng
              </button>
            </div>

            <div style={{overflow:'auto', padding:'1rem', background:'#f8fafc', flex:1, WebkitOverflowScrolling:'touch'}}>
              {viewLoading ? (
                <div style={{textAlign:'center', padding:'3rem', color:'#64748b'}}><Loader2 size={32} className="spin" style={{margin:'0 auto'}}/></div>
              ) : (
                <>
                  {/* Máy tính: đúng bản phiếu như khi in. Điện thoại: danh sách thẻ to, dễ đọc khi đi lấy hàng. */}
                  <div className="pq-modal-desktop" style={{background:'#fff', padding:'1.25rem', borderRadius:8, border:'1px solid #e2e8f0'}}>
                    <WarehouseReceiptPrint {...buildReceiptProps(viewOrder, viewRows, { unitMap, nccMap, nameMap })} />
                  </div>
                  <div className="pq-modal-mobile">
                    <ReceiptPickList
                      {...buildReceiptProps(viewOrder, viewRows, { unitMap, nccMap, nameMap })}
                      picked={pickedOfView}
                      onTogglePick={togglePick}
                    />
                    {pickedOfView.size > 0 && (
                      <button onClick={clearPicks}
                        style={{width:'100%', padding:'0.7rem', marginBottom:8, borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:700, fontSize:'0.85rem', cursor:'pointer'}}>
                        Bỏ hết đánh dấu đã lấy
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Thanh cuối: In phiếu + Đóng, ngón tay với tới dễ khi cầm điện thoại */}
            <div style={{padding:'0.75rem 1rem', background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', gap:10, flexShrink:0}}>
              <button onClick={() => { const o = viewOrder; setViewOrder(null); handlePrintBatch([o]); }} disabled={viewLoading}
                style={{...s_btn, flex:1, justifyContent:'center', background:'#0ea5e9', color:'#fff', padding:'0.7rem', fontSize:'0.9rem'}}>
                <Printer size={18}/> In Phiếu
              </button>
              <button onClick={() => setViewOrder(null)}
                style={{...s_btn, flex:1, justifyContent:'center', background:'#fff', color:'#475569', border:'1px solid #cbd5e1', padding:'0.7rem', fontSize:'0.9rem'}}>
                <X size={18}/> Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Print Area - Renders multiple orders with page breaks */}
      {printingOrders.length > 0 && Object.keys(receiptData).length > 0 && (
        <div id="print-area" style={{width:'100%', background:'#fff'}}>
          {printingOrders.map((order, index) => (
            <div key={order.order_code} style={{padding:'24px 20px', pageBreakAfter: index < printingOrders.length - 1 ? 'always' : 'auto'}}>
              <WarehouseReceiptPrint {...buildReceiptProps(order, receiptData[order.order_code] || [], { unitMap, nccMap, nameMap })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
