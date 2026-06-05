import React, { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, RefreshCw, Trash2, Edit3, Download, Upload, X, Check, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { ColumnToggleModal } from '../../components/WarehouseSharedUI';

const CAT_COLS = ['san_pham','dvt','min_stock_days','backup_stock_days','warehouse','lead_time_days'];
const CAT_LABELS = { san_pham:'Sản phẩm', dvt:'ĐVT', min_stock_days:'Ngày Min', backup_stock_days:'Tồn DP', warehouse:'Kho', lead_time_days:'Lead Time' };

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

export default function CatalogTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  // const PAGE_SIZE = 50;
  const [pageSize, setPageSize] = usePersistedState('catalog_pageSize', 50);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortCol, setSortCol] = useState('item_code');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [addRow, setAddRow] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('catalog_hiddenCols', new Set());

  // Reset page on search
  useEffect(() => { setPage(1); }, [searchText, pageSize]);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      let q = db.from('inventory_items').select('*', { count: 'exact' });

      if (searchText.trim()) {
        const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          const orClauses = terms.map(t => `item_code.ilike.%${t}%,item_name.ilike.%${t}%`).join(',');
          q = q.or(orClauses);
        }
      }

      q = q.order(sortCol, { ascending: sortAsc });
      q = q.range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      setTotalRows(count || 0);
      setRows(data || []);
      // Reset selection when data changes
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      alert('Lỗi tải danh mục: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchText, sortCol, sortAsc, page, pageSize]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const colLabel = {
    item_code: 'Mã HH',
    item_name: 'Tên hàng hóa',
    unit: 'ĐVT',
    min_stock_days: 'Ngày Min',
    backup_stock_days: 'Tồn DP',
    warehouse: 'Kho',
    lead_time_days: 'Lead Time'
  };

  // --- Bulk Actions ---
  const toggleRow = (code) => {
    const next = new Set(selectedKeys);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (selectedKeys.size === rows.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(rows.map(r => r.item_code)));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedKeys.size} dòng?`)) return;
    try {
      const { error } = await db.from('inventory_items').delete().in('item_code', Array.from(selectedKeys));
      if (error) throw error;
      fetchCatalog();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleExport = async () => {
    let sourceRows;
    if (selectedKeys.size > 0) {
      // Có chọn dòng → chỉ xuất các dòng đã chọn
      sourceRows = rows.filter(r => selectedKeys.has(r.item_code));
    } else {
      // Không chọn dòng nào → xuất TOÀN BỘ danh mục từ DB (phân trang để lấy hết, tránh giới hạn 1000 dòng của Supabase)
      try {
        let all = [];
        let from = 0;
        while (true) {
          let q = db.from('inventory_items').select('*');
          if (searchText.trim()) {
            const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
            if (terms.length > 0) {
              const orClauses = terms.map(t => `item_code.ilike.%${t}%,item_name.ilike.%${t}%`).join(',');
              q = q.or(orClauses);
            }
          }
          q = q.order(sortCol, { ascending: sortAsc }).range(from, from + 999);
          const { data, error } = await q;
          if (error) throw error;
          all = all.concat(data || []);
          if (!data || data.length < 1000) break;
          from += 1000;
        }
        sourceRows = all;
      } catch (e) {
        alert('Lỗi xuất dữ liệu: ' + e.message);
        return;
      }
    }
    if (sourceRows.length === 0) { alert('Không có dữ liệu để xuất'); return; }
    const dataToExport = sourceRows.map(r => {
      const out = {};
      Object.keys(colLabel).forEach(k => out[colLabel[k]] = r[k]);
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_Muc");
    XLSX.writeFile(wb, `Danh_Muc_HH_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const { error } = await db.from('inventory_items').update(updatedRow).eq('item_code', updatedRow.item_code);
      if (error) throw error;
      setEditRow(null);
      fetchCatalog();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const NUM_FIELDS = ['min_stock_days', 'backup_stock_days', 'lead_time_days'];

  const handleSaveAdd = async (newRow) => {
    const allFilled = Object.keys(colLabel).every(k => String(newRow[k] ?? '').trim() !== '');
    if (!allFilled) return alert('Vui lòng nhập đầy đủ tất cả các trường');
    setAdding(true);
    try {
      const code = String(newRow.item_code).trim();
      // Kiểm tra trùng mã trước khi thêm
      const { data: existing, error: checkErr } = await db.from('inventory_items').select('item_code').eq('item_code', code).maybeSingle();
      if (checkErr) throw checkErr;
      if (existing) { setAdding(false); return alert('Mã HH đã tồn tại'); }
      // Dựng payload, ép kiểu số cho các trường số
      const payload = {};
      Object.keys(colLabel).forEach(k => {
        payload[k] = NUM_FIELDS.includes(k) ? Number(newRow[k]) : String(newRow[k]).trim();
      });
      const { error } = await db.from('inventory_items').insert(payload);
      if (error) throw error;
      setAddRow(null);
      fetchCatalog();
    } catch(e) {
      alert('Lỗi thêm mã: ' + e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDownloadTemplate = () => {
    const cols = Object.keys(colLabel);
    const ws = XLSX.utils.json_to_sheet([cols.reduce((acc, c) => ({...acc, [colLabel[c]]: ''}), {})], {header: Object.values(colLabel)});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Danh_Muc.xlsx");
  };

  const executeImport = async () => {
    if (!importFile) return alert('Vui lòng chọn file');
    setImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      
      const reverseLabel = {};
      Object.keys(colLabel).forEach(k => {
        reverseLabel[colLabel[k]] = k;
      });

      const inserts = data.map(r => {
        const out = {};
        Object.keys(r).forEach(k => {
          if (reverseLabel[k]) out[reverseLabel[k]] = r[k];
        });
        return out;
      }).filter(r => r.item_code);

      if (inserts.length === 0) throw new Error('Không có dữ liệu hợp lệ');
      
      const BATCH = 500;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const { error } = await db.from('inventory_items').upsert(inserts.slice(i, i + BATCH), { onConflict: 'item_code' });
        if (error) throw error;
      }
      
      alert('Nhập dữ liệu thành công!');
      setShowImport(false);
      setImportFile(null);
      fetchCatalog();
    } catch (e) {
      alert('Lỗi xử lý file: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = CAT_COLS.filter(c => vis(c)).length + 2;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{flex:1, minWidth:120}}>
          <SearchAutoSuggest
            tableName="inventory_items"
            searchColumns={['item_code','item_name']}
            displayColumn="item_code"
            placeholder="Tìm mã, tên HH..."
            value={searchText}
            onChange={v => setSearchText(v)}
          />
        </div>
        <ColumnToggleModal columns={CAT_COLS} labels={CAT_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải danh mục...</p>
            </div>
          ) : (
            <div style={{overflowX:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                <thead>
                  <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',width:28,textAlign:'center'}}>
                      <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === rows.length} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                    </th>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',width:28,textAlign:'center',color:'#94a3b8',fontSize:'0.65rem',fontWeight:700}}>#</th>
                    {vis('san_pham') && <th onClick={()=>handleSort('item_code')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='item_code'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='item_code'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Sản phẩm{sortCol==='item_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('dvt') && <th onClick={()=>handleSort('unit')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='unit'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='unit'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>ĐVT{sortCol==='unit'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('min_stock_days') && <th onClick={()=>handleSort('min_stock_days')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='min_stock_days'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='min_stock_days'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Min{sortCol==='min_stock_days'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('backup_stock_days') && <th onClick={()=>handleSort('backup_stock_days')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='backup_stock_days'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='backup_stock_days'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>DP{sortCol==='backup_stock_days'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('warehouse') && <th onClick={()=>handleSort('warehouse')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='warehouse'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='warehouse'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Kho{sortCol==='warehouse'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('lead_time_days') && <th onClick={()=>handleSort('lead_time_days')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='lead_time_days'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='lead_time_days'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>LT{sortCol==='lead_time_days'?(sortAsc?' ↑':' ↓'):''}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={visCount} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Không có dữ liệu</td></tr>
                  ) : rows.map((row,ri) => (
                    <tr key={row.item_code} onClick={()=>toggleRow(row.item_code)} style={{borderBottom:'1px solid #f1f5f9',background:selectedKeys.has(row.item_code)?'#f0f9ff':'transparent',cursor:'pointer'}} onMouseEnter={e=>!selectedKeys.has(row.item_code) && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>!selectedKeys.has(row.item_code) && (e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selectedKeys.has(row.item_code)} onChange={()=>toggleRow(row.item_code)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                      </td>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.65rem',fontWeight:600}}>{(page-1)*pageSize + ri + 1}</td>
                      {vis('san_pham') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.item_name}</div>
                      </td>}
                      {vis('dvt') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.unit}</td>}
                      {vis('min_stock_days') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.min_stock_days}</td>}
                      {vis('backup_stock_days') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.backup_stock_days}</td>}
                      {vis('warehouse') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.warehouse}</td>}
                      {vis('lead_time_days') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.lead_time_days}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {!loading && totalRows > 0 && (
            <div style={{padding:'0.5rem',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',fontSize:'0.75rem',color:'#64748b',flexWrap:'wrap',gap:'0.5rem'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <span><strong style={{color:'#334155'}}>{totalRows}</strong> dòng</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{...s.input, padding:'0.2rem 0.4rem', fontSize:'0.75rem'}}>
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
                <div style={{padding:'0.25rem 0.6rem',background:'#fff',border:'1px solid #e2e8f0',borderRadius:7,fontWeight:600,color:'#0891b2'}}>{page} / {Math.ceil(totalRows/pageSize)}</div>
                <button disabled={page>=Math.ceil(totalRows/pageSize)} onClick={()=>setPage(p=>p+1)} style={{...s.btn,padding:'0.25rem 0.6rem'}}>Sau</button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Sticky Bottom Action Bar — Always visible */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExport} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Download size={14}/>Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(rows.find(r=>r.item_code===Array.from(selectedKeys)[0]))} style={{...s.btn,background:'#f59e0b',color:'#fff',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            {perms.delete && <button onClick={handleDelete} style={{...s.btn,background:'#ef4444',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>}
          </>
        ) : (
          <>
            <button onClick={fetchCatalog} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
              <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
            </button>
            {perms.create && <button onClick={()=>setAddRow({item_code:'',item_name:'',unit:'',min_stock_days:'',backup_stock_days:'',warehouse:'',lead_time_days:''})} style={{...s.btn, padding:'0.4rem 0.75rem', background:'#0891b2', color:'#fff', border:'none', flexShrink:0}}>
              <Plus size={14}/> Thêm mã
            </button>}
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
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa {editRow.item_code}</h3>
            {Object.keys(colLabel).filter(k=>k!=='item_code').map(k => (
              <div key={k} style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{colLabel[k]}</label>
                <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} />
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>setEditRow(null)} style={s.btn}>Hủy</button>
              <button onClick={()=>handleSaveEdit(editRow)} style={{...s.btn, background:'#2563eb', color:'#fff'}}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {addRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Thêm mã hàng hóa</h3>
            {Object.keys(colLabel).map(k => (
              <div key={k} style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{colLabel[k]} <span style={{color:'#ef4444'}}>*</span></label>
                <input
                  type={NUM_FIELDS.includes(k) ? 'number' : 'text'}
                  value={addRow[k] ?? ''}
                  onChange={e=>setAddRow({...addRow, [k]: e.target.value})}
                  style={{...s.input, width:'100%',boxSizing:'border-box'}}
                />
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>setAddRow(null)} style={s.btn}>Hủy</button>
              <button onClick={()=>handleSaveAdd(addRow)} disabled={adding} style={{...s.btn, background:'#0891b2', color:'#fff'}}>
                {adding ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Check size={14}/>} Lưu
              </button>
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
    </div>
  );
}
