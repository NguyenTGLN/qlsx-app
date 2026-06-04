import React, { useState, useEffect } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, Calendar, FileText, Download, Upload, Trash2, Edit3, X, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import DateRangeDropdown, { applyDateFilter } from '../../components/DateRangeDropdown';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { shortDateTime, ColumnToggleModal } from '../../components/WarehouseSharedUI';

const TABLE_COLS = ['thoi_gian', 'ma_lenh', 'ma_tp', 'linh_kien', 'vi_tri', 'ton_truoc', 'sl_lay', 'ton_sau', 'nguoi_tao', 'ghi_chu'];
const COL_LABELS = {
  thoi_gian: 'Thời gian', ma_lenh: 'Mã Lệnh', ma_tp: 'Mã TP',
  linh_kien: 'Linh kiện', vi_tri: 'Vị trí',
  ton_truoc: 'Tồn Trước', sl_lay: 'SL Lấy', ton_sau: 'Tồn Sau',
  nguoi_tao: 'Người tạo', ghi_chu: 'Ghi chú'
};

const s = {
  th: { padding:'0.4rem 0.3rem', textAlign:'left', fontWeight:700, color:'#334155', borderBottom:'2px solid #cbd5e1', fontSize:'0.72rem', whiteSpace:'nowrap', position:'sticky', top:0, background:'#f8fafc', zIndex:10 },
  td: { padding:'0.35rem 0.3rem', borderBottom:'1px solid #e2e8f0', fontSize:'0.75rem', color:'#475569', whiteSpace:'nowrap' },
  btn: { display:'flex', alignItems:'center', gap:5, padding:'0.4rem 0.8rem', borderRadius:6, border:'1px solid #e2e8f0', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer', fontSize:'0.8rem' }
};

export default function PickingLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [searchCode, setSearchCode] = useState('');
  const [dateRange, setDateRange] = useState({ preset: 'Tất cả', from: '', to: '' });

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('pickingLogs_hiddenCols', new Set());

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState('pickingLogs_pageSize', 50);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = db.from('inventory_picking_logs').select('*').order('created_at', { ascending: false });
      
      if (searchCode) {
        const terms = searchCode.split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          const orClauses = terms.map(t => `order_code.eq.${t}`).join(',');
          query = query.or(orClauses);
        }
      }
      
      query = applyDateFilter(query, dateRange, 'created_at');
      
      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
      setSelectedKeys(new Set());
      setPage(1);
    } catch (e) {
      console.error(e);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [dateRange]);

  useEffect(() => { setPage(1); }, [pageSize]);

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') fetchLogs();
  };

  const toggleRow = (id) => {
    const next = new Set(selectedKeys);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (selectedKeys.size === rows.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(rows.map(r => r.id)));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedKeys.size} dòng?`)) return;
    try {
      const { error } = await db.from('inventory_picking_logs').delete().in('id', Array.from(selectedKeys));
      if (error) throw error;
      fetchLogs();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        order_code: updatedRow.order_code,
        product_code: updatedRow.product_code,
        component_code: updatedRow.component_code,
        component_name: updatedRow.component_name,
        location: updatedRow.location,
        quantity_before: parseFloat(updatedRow.quantity_before || 0),
        quantity_taken: parseFloat(updatedRow.quantity_taken || 0),
        quantity_after: parseFloat(updatedRow.quantity_after || 0),
        notes: updatedRow.notes
      };
      const { error } = await db.from('inventory_picking_logs').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      setEditRow(null);
      fetchLogs();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const exportExcel = () => {
    const dataToExport = selectedKeys.size > 0 ? logs.filter(r => selectedKeys.has(r.id)) : logs;
    if (dataToExport.length === 0) return alert('Không có dữ liệu để xuất');
    const exportData = dataToExport.map(l => ({
      'Ngày giờ': new Date(l.created_at).toLocaleString('vi-VN'),
      'Mã Lệnh': l.order_code,
      'Thành phẩm': l.product_code,
      'Mã Linh kiện': l.component_code,
      'Tên Linh kiện': l.component_name,
      'Vị trí': l.location,
      'Tồn trước': l.quantity_before,
      'Số lượng lấy': l.quantity_taken,
      'Tồn sau': l.quantity_after,
      'Người tạo': l.created_by,
      'Ghi chú': l.notes
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LichSuBocDo");
    XLSX.writeFile(wb, `Lich_Su_Boc_Do_${new Date().getTime()}.xlsx`);
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = TABLE_COLS.filter(c => vis(c)).length + 1;

  const totalRows = logs.length;
  const rows = logs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, height:'100%', overflow:'hidden', position:'relative'}}>
      {/* Control Panel */}
      <div className="mobile-toolbar" style={{background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0.5rem', display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'nowrap', position:'sticky', top:0, zIndex:50, overflowX:'auto'}}>
        <div style={{minWidth:120, flexShrink:0, flex:1}}>
          <SearchAutoSuggest
            tableName="inventory_picking_logs"
            searchColumns={['order_code','product_code','component_code']}
            displayColumn="order_code"
            placeholder="Tìm mã lệnh, TP, LK..."
            value={searchCode}
            onChange={v => setSearchCode(v)}
          />
        </div>
        
        <DateRangeDropdown label="Thời gian" value={dateRange} onChange={v => { setDateRange(v); }} alignRight={true} />
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      {/* Data Table */}
      <div style={{flex:1, overflow:'auto', background:'#fff', position:'relative'}}>
        {loading && (
          <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,background:'rgba(255,255,255,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
            <Loader2 size={30} color="#0891b2" style={{animation:'spin 1s linear infinite'}}/>
          </div>
        )}
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{...s.th, width:28, textAlign:'center'}}>
                <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === rows.length} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
              </th>
              {vis('thoi_gian') && <th style={s.th}>Thời gian</th>}
              {vis('ma_lenh') && <th style={s.th}>Mã Lệnh</th>}
              {vis('ma_tp') && <th style={s.th}>Mã TP</th>}
              {vis('linh_kien') && <th style={s.th}>Linh kiện</th>}
              {vis('vi_tri') && <th style={s.th}>Vị trí</th>}
              {vis('ton_truoc') && <th style={{...s.th, textAlign:'right'}}>Tồn Trước</th>}
              {vis('sl_lay') && <th style={{...s.th, textAlign:'right', color:'#dc2626'}}>SL Lấy</th>}
              {vis('ton_sau') && <th style={{...s.th, textAlign:'right'}}>Tồn Sau</th>}
              {vis('nguoi_tao') && <th style={s.th}>Người tạo</th>}
              {vis('ghi_chu') && <th style={s.th}>Ghi chú</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(log => (
              <tr key={log.id} onClick={()=>toggleRow(log.id)} style={{transition:'background 0.15s', background:selectedKeys.has(log.id)?'#f0f9ff':'transparent', cursor:'pointer'}} onMouseEnter={e=>!selectedKeys.has(log.id) && (e.currentTarget.style.background='#f1f5f9')} onMouseLeave={e=>!selectedKeys.has(log.id) && (e.currentTarget.style.background='transparent')}>
                <td style={{...s.td, padding:'0.35rem 0.2rem', textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" checked={selectedKeys.has(log.id)} onChange={()=>toggleRow(log.id)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                </td>
                {vis('thoi_gian') && <td style={s.td}>{shortDateTime(log.created_at)}</td>}
                {vis('ma_lenh') && <td style={{...s.td, fontWeight:700, color:'#0f172a'}}>{log.order_code}</td>}
                {vis('ma_tp') && <td style={{...s.td, fontWeight:600, color:'#0891b2'}}>{log.product_code}</td>}
                {vis('linh_kien') && <td style={s.td}>
                  <div style={{fontWeight:600, color:'#334155'}}>{log.component_code}</div>
                  <div style={{fontSize:'0.68rem', color:'#64748b', fontStyle:'italic', marginTop:1}}>{log.component_name}</div>
                </td>}
                {vis('vi_tri') && <td style={s.td}>{log.location}</td>}
                {vis('ton_truoc') && <td style={{...s.td, textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{log.quantity_before}</td>}
                {vis('sl_lay') && <td style={{...s.td, textAlign:'right', fontWeight:700, color: log.quantity_taken > 0 ? '#10b981' : '#dc2626', fontVariantNumeric:'tabular-nums'}}>
                  {log.quantity_taken > 0 ? `+${log.quantity_taken}` : log.quantity_taken}
                </td>}
                {vis('ton_sau') && <td style={{...s.td, textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{log.quantity_after}</td>}
                {vis('nguoi_tao') && <td style={s.td}>{log.created_by}</td>}
                {vis('ghi_chu') && <td style={s.td}>{log.notes}</td>}
              </tr>
            ))}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={visCount} style={{padding:'2rem', textAlign:'center', color:'#94a3b8'}}>
                  Không có dữ liệu lịch sử bốc dỡ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalRows > 0 && (
        <div className="mobile-toolbar" style={{padding:'0.5rem',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',fontSize:'0.75rem',color:'#64748b',flexWrap:'wrap',gap:'0.5rem'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span><strong style={{color:'#334155'}}>{totalRows}</strong> dòng</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{padding:'0.2rem 0.4rem', border:'1px solid #e2e8f0', borderRadius:7, fontSize:'0.75rem', outline:'none', background:'#fff', color:'#334155'}}>
              <option value={50}>50/trang</option>
              <option value={100}>100/trang</option>
              <option value={500}>500/trang</option>
              <option value={1000}>1K/trang</option>
              <option value={5000}>5K/trang</option>
              <option value={10000}>10K/trang</option>
            </select>
          </div>
          <div style={{display:'flex',gap:5}}>
            <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{...s.btn,padding:'0.25rem 0.6rem'}}>Trước</button>
            <div style={{padding:'0.25rem 0.6rem',background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontWeight:600,color:'#0891b2'}}>{page} / {Math.ceil(totalRows/pageSize) || 1}</div>
            <button disabled={page>=Math.ceil(totalRows/pageSize)} onClick={()=>setPage(p=>p+1)} style={{...s.btn,padding:'0.25rem 0.6rem'}}>Sau</button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar — Always visible */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={exportExcel} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#10b981',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Download size={14}/>Xuất</button>
            {selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(logs.find(r=>r.id===Array.from(selectedKeys)[0]))} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#f59e0b',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            <button onClick={handleDelete} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#ef4444',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>
          </>
        ) : (
          <>
            <button onClick={fetchLogs} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',flexShrink:0}}><Search size={14}/>Tìm</button>
            <button onClick={exportExcel} disabled={loading} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#10b981',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,marginLeft:'auto',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
          </>
        )}
      </div>

      {/* Modals */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:'100%',maxWidth:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa lịch sử bốc dỡ</h3>
            <div style={{maxHeight:'60vh', overflowY:'auto', paddingRight:10}}>
              {['order_code', 'product_code', 'component_code', 'component_name', 'location', 'quantity_before', 'quantity_taken', 'quantity_after', 'notes'].map(k => (
                <div key={k} style={{marginBottom:10}}>
                  <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{k}</label>
                  <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{padding:'0.4rem 0.6rem',border:'1px solid #cbd5e1',borderRadius:6,fontSize:'0.8rem',outline:'none', width:'100%',boxSizing:'border-box'}} />
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>setEditRow(null)} style={s.btn}>Hủy</button>
              <button onClick={()=>handleSaveEdit(editRow)} style={{...s.btn, background:'#2563eb', color:'#fff'}}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
