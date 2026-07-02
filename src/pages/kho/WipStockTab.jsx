import React, { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, RefreshCw, Download, Upload, Trash2, Edit3, X, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { shortDate, ColumnToggleModal } from '../../components/WarehouseSharedUI';

const WIP_COLS = ['location','san_pham','dvt','quantity','import_date'];
const WIP_LABELS = { location:'Mã Lệnh SX', san_pham:'Sản phẩm', dvt:'ĐVT', quantity:'SL Tồn', import_date:'Ngày' };

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

export default function WipStockTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortCol, setSortCol] = useState('location');
  const [sortAsc, setSortAsc] = useState(false); // Mới nhất lên trên

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('wipStock_hiddenCols', new Set());

  const fetchWipStock = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch inventory stock specifically for SX9 locations
      let allStock = [];
      let page = 0;
      while (true) {
        const { data: stockChunk, error: stockErr } = await db.from('inventory_stock').select(`
          id,
          item_code,
          item_name,
          unit,
          quantity,
          location,
          import_date
        `).like('location', 'SX9-%').neq('quantity', 0).range(page * 1000, (page + 1) * 1000 - 1);
        
        if (stockErr) throw stockErr;
        if (stockChunk) allStock = allStock.concat(stockChunk);
        if (!stockChunk || stockChunk.length < 1000) break;
        page++;
      }

      let formatted = allStock.map(r => ({
        id: r.id,
        item_code: r.item_code,
        item_name: r.item_name || '',
        unit: r.unit || '',
        quantity: Math.round((Number(r.quantity) || 0) * 1000) / 1000,
        location: r.location,
        import_date: r.import_date
      }));

      // Apply search filter
      if (searchText.trim()) {
        const terms = searchText.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          formatted = formatted.filter(item =>
            terms.some(t =>
              (item.item_code && item.item_code.toLowerCase() === t) ||
              (item.item_name && item.item_name.toLowerCase() === t) ||
              (item.location && item.location.toLowerCase() === t)
            )
          );
        }
      }

      // Sort
      formatted.sort((a, b) => {
        let valA = a[sortCol]; let valB = b[sortCol];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA === null) return 1;
        if (valB === null) return -1;
        
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });

      setRows(formatted);
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      alert('Lỗi tải tồn kho sản xuất: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchText, sortCol, sortAsc]);

  useEffect(() => { fetchWipStock(); }, [fetchWipStock]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const colLabel = {
    location: 'Mã Lệnh SX (Vị trí)',
    item_code: 'Mã HH',
    item_name: 'Tên hàng hóa',
    unit: 'ĐVT',
    quantity: 'Số lượng tồn tạm',
    import_date: 'Ngày tạo'
  };

  // --- Bulk Actions ---
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
      const { error } = await db.from('inventory_stock').delete().in('id', Array.from(selectedKeys));
      if (error) throw error;
      fetchWipStock();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleExport = () => {
    const dataToExport = rows.filter(r => selectedKeys.has(r.id)).map(r => {
      const out = {};
      Object.keys(colLabel).forEach(k => out[colLabel[k]] = r[k]);
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ton_Kho_SX");
    XLSX.writeFile(wb, `Ton_Kho_San_Xuat_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        location: updatedRow.location,
        item_code: updatedRow.item_code,
        item_name: updatedRow.item_name,
        unit: updatedRow.unit,
        quantity: parseFloat(updatedRow.quantity)
      };
      if (updatedRow.import_date) {
        payload.import_date = updatedRow.import_date;
      }
      const { error } = await db.from('inventory_stock').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      setEditRow(null);
      fetchWipStock();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const handleDownloadTemplate = () => {
    const cols = ['location', 'item_code', 'item_name', 'unit', 'quantity', 'import_date'];
    const ws = XLSX.utils.json_to_sheet([cols.reduce((acc, c) => ({...acc, [c]: ''}), {})], {header: cols});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_TonKho_SX.xlsx");
  };

  const executeImport = async () => {
    if (!importFile) return alert('Vui lòng chọn file');
    setImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const wb = XLSX.read(e.target.result, {type: 'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws);

          const inserts = data.map(r => ({
            location: r['location'] || 'SX9-UNKNOWN',
            item_code: r['item_code'],
            item_name: r['item_name'],
            unit: r['unit'],
            quantity: parseFloat(r['quantity'] || 0),
            import_date: r['import_date'] || todayLocal()
          })).filter(r => r.item_code && String(r.location).startsWith('SX9-'));

          if (inserts.length === 0) throw new Error('Không có dữ liệu hợp lệ (Cần có mã HH và vị trí bắt đầu bằng SX9-)');

          // Gộp (mã + vị trí) trong file rồi UPSERT để không tạo dòng trùng / không nhân đôi khi re-import
          const aggMap = {};
          for (const r of inserts) {
            const k = r.item_code + '|' + r.location;
            if (aggMap[k]) aggMap[k].quantity += r.quantity;
            else aggMap[k] = { ...r };
          }
          const { error } = await db.from('inventory_stock').upsert(Object.values(aggMap), { onConflict: 'item_code,location' });
          if (error) throw error;
          
          alert('Nhập dữ liệu thành công!');
          setShowImport(false);
          setImportFile(null);
          fetchWipStock();
        } catch(err) { alert('Lỗi xử lý file: ' + err.message); }
      };
      reader.readAsArrayBuffer(importFile);
    } catch (e) {
      alert('Lỗi đọc file: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = WIP_COLS.filter(c => vis(c)).length + 2; // +checkbox+#

  return (
    <>
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{flex:1, minWidth:120}}>
          <SearchAutoSuggest
            tableName="inventory_stock"
            searchColumns={['item_code','item_name','location']}
            displayColumn="location"
            placeholder="Tìm mã lệnh, SP..."
            value={searchText}
            onChange={v => setSearchText(v)}
          />
        </div>
        <ColumnToggleModal columns={WIP_COLS} labels={WIP_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        {loading ? (
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
            <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
            <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải dữ liệu...</p>
          </div>
        ) : (
          <div style={{overflowX:'auto',flex:1,WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
              <thead>
                  <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',width:28,textAlign:'center'}}>
                      <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === rows.length} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                    </th>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',width:28,textAlign:'center',color:'#94a3b8',fontSize:'0.65rem',fontWeight:700}}>#</th>
                    {vis('location') && <th onClick={()=>handleSort('location')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='location'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='location'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Mã Lệnh SX{sortCol==='location'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('san_pham') && <th onClick={()=>handleSort('item_code')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='item_code'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='item_code'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Sản phẩm{sortCol==='item_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('dvt') && <th onClick={()=>handleSort('unit')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='unit'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='unit'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>ĐVT{sortCol==='unit'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('quantity') && <th onClick={()=>handleSort('quantity')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='quantity'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='quantity'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>SL Tồn{sortCol==='quantity'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('import_date') && <th onClick={()=>handleSort('import_date')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='import_date'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='import_date'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Ngày{sortCol==='import_date'?(sortAsc?' ↑':' ↓'):''}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={visCount} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Không có dữ liệu</td></tr>
                  ) : rows.map((row,ri) => (
                    <tr key={row.id} onClick={()=>toggleRow(row.id)} style={{borderBottom:'1px solid #f1f5f9',background:selectedKeys.has(row.id)?'#f0f9ff':'transparent',cursor:'pointer'}} onMouseEnter={e=>!selectedKeys.has(row.id) && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>!selectedKeys.has(row.id) && (e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selectedKeys.has(row.id)} onChange={()=>toggleRow(row.id)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                      </td>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.65rem',fontWeight:600}}>{ri+1}</td>
                      {vis('location') && <td style={{padding:'0.35rem 0.2rem',fontWeight:700,color:'#0f172a',whiteSpace:'nowrap'}}>{row.location}</td>}
                      {vis('san_pham') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.item_name}</div>
                      </td>}
                      {vis('dvt') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.unit}</td>}
                      {vis('quantity') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:800,color:row.quantity<0?'#ef4444':'#10b981',fontVariantNumeric:'tabular-nums'}}>
                        {row.quantity > 0 ? `+${row.quantity.toLocaleString('vi-VN')}` : row.quantity.toLocaleString('vi-VN')}
                      </td>}
                      {vis('import_date') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{shortDate(row.import_date)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </main>
    </div>

      {/* Sticky Bottom Action Bar — Always visible */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExport} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Download size={14}/>Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(rows.find(r=>r.id===Array.from(selectedKeys)[0]))} style={{...s.btn,background:'#f59e0b',color:'#fff',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            {perms.delete && <button onClick={handleDelete} style={{...s.btn,background:'#ef4444',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>}
          </>
        ) : (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:600,color:'#64748b',whiteSpace:'nowrap'}}>Tổng <strong style={{color:'#334155'}}>{rows.length}</strong> dòng</span>
            <button onClick={fetchWipStock} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
              <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
            </button>
            {perms.io && <button onClick={()=>setShowImport(true)} style={{...s.btn, padding:'0.4rem 0.75rem', background:'#e0f2fe', color:'#0369a1', border:'none', flexShrink:0}}>
              <Upload size={14}/> Nhập Excel
            </button>}
            <button onClick={handleExport} disabled={loading} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
          </>
        )}
      </div>

      {/* Modals */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa tồn kho sản xuất</h3>
            {['location', 'item_code', 'item_name', 'unit', 'quantity', 'import_date'].map(k => (
              <div key={k} style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{colLabel[k]}</label>
                <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} type={k==='import_date'?'date':'text'}/>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>setEditRow(null)} style={s.btn}>Hủy</button>
              <button onClick={()=>handleSaveEdit(editRow)} style={{...s.btn, background:'#2563eb', color:'#fff'}}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Nhập từ Excel</h3>
            <div style={{marginBottom:15,textAlign:'center'}}>
              <button onClick={handleDownloadTemplate} style={{background:'none',border:'none',color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Tải file mẫu (Template)</button>
            </div>
            <input type="file" accept=".xlsx" onChange={e=>setImportFile(e.target.files[0])} style={{width:'100%',marginBottom:15}} />
            <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
              <button onClick={()=>setShowImport(false)} style={s.btn}>Hủy</button>
              <button onClick={executeImport} disabled={importing||!importFile} style={{...s.btn, background:'#10b981', color:'#fff'}}>
                {importing ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Upload size={14}/>} Import
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
