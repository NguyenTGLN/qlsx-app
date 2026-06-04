import React, { useState, useEffect } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, ChevronLeft, ChevronRight, Download, Upload, FileDown, Loader2, Trash2, Edit3, X, Check, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import DateRangeDropdown, { applyDateFilter } from '../../components/DateRangeDropdown';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';

const shortDate = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  return d;
};

function ColumnToggle({ columns, hiddenCols, setHiddenCols }) {
  const [open, setOpen] = useState(false);
  const toggle = (col) => setHiddenCols(h => { const n = new Set(h); n.has(col)?n.delete(col):n.add(col); return n; });
  const colLabel = (k) => ({ngay_nhap:'Ngày nhập', san_pham:'Sản phẩm', sl:'Số lượng', ma_ncc:'Mã NCC', kho:'Kho nhập', ly_do:'Lý do'}[k] || k);
  return (
    <div style={{position:'relative',flexShrink:0}}>
      <button onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',gap:3,padding:'0.4rem 0.5rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:'#475569'}} title="Ẩn/Hiện cột">
        <Eye size={14}/>{hiddenCols.size > 0 && <span style={{background:'#fef2f2',color:'#ef4444',borderRadius:99,padding:'0 4px',fontSize:'0.65rem',fontWeight:800}}>-{hiddenCols.size}</span>}
      </button>
      {open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          {/* Backdrop */}
          <div 
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }} 
            onClick={() => setOpen(false)} 
          />
          
          <div style={{position:'relative', background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, boxShadow:'0 20px 40px rgba(0,0,0,0.2)', zIndex:1, width:'100%', maxWidth:320, maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', animation:'fadeIn 0.15s ease-out'}}>
            <div style={{padding:'1rem', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:'0.9rem', fontWeight:800, color:'#0f172a'}}>Tùy chỉnh cột hiển thị</span>
              <button onClick={()=>setHiddenCols(new Set())} style={{border:'none', background:'none', color:'#2563eb', fontSize:'0.75rem', fontWeight:700, cursor:'pointer'}}>Hiện tất cả</button>
            </div>
            <div style={{overflowY:'auto', padding:'0.5rem 0'}}>
              {columns.map(col => (
                <label key={col} style={{display:'flex', alignItems:'center', gap:10, padding:'12px 1rem', cursor:'pointer', fontSize:'0.85rem', color:hiddenCols.has(col)?'#94a3b8':'#334155', transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <input type="checkbox" checked={!hiddenCols.has(col)} onChange={()=>toggle(col)} style={{width: 18, height: 18, accentColor:'#2563eb', cursor:'pointer'}}/>
                  <span style={{fontWeight: 600}}>{colLabel(col)}</span>
                </label>
              ))}
            </div>
            <div style={{borderTop:'1px solid #e2e8f0', padding:'1rem', textAlign:'right', background: '#f8fafc'}}>
              <button onClick={()=>setOpen(false)} style={{border:'none', background:'#2563eb', color:'#fff', borderRadius:8, padding:'0.6rem 1.5rem', fontSize:'0.85rem', fontWeight:700, cursor:'pointer'}}>Xong</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportLogsTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
  
  const [dateRange, setDateRange] = useState({ preset: 'Tất cả', from: '', to: '' });
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = usePersistedState('importLogs_pageSize', 50);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('importLogs_hiddenCols_v3', new Set());
  const TABLE_COLS = ['ngay_nhap', 'san_pham', 'sl', 'ma_ncc', 'kho', 'ly_do'];

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);

  useEffect(() => {
    fetchData();
  }, [page, search, pageSize, dateRange]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = db.from('du_lieu_nhap').select('*', { count: 'exact' });
      
      if (search) {
        const terms = search.split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          query = query.in('ma_hang', terms);
        }
      }

      query = applyDateFilter(query, dateRange, 'ngay_nhap');

      // Sort by latest
      query = query.order('ngay_nhap', { ascending: false }).order('created_at', { ascending: false });

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: resultData, count, error } = await query;
      
      if (error) throw error;
      
      setData(resultData || []);
      if (count !== null) setTotalCount(count);
      setSelectedKeys(new Set());
    } catch (e) {
      console.error("Lỗi tải dữ liệu nhập:", e);
      alert("Lỗi tải dữ liệu: " + e.message);
    }
    setLoading(false);
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      let exportData = [];
      if (selectedKeys.size > 0) {
        exportData = data.filter(r => selectedKeys.has(r.id));
      } else {
        let query = db.from('du_lieu_nhap').select('*').order('ngay_nhap', { ascending: false });
        if (search) {
          const terms = search.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) {
            query = query.in('ma_hang', terms);
          }
        }
        query = applyDateFilter(query, dateRange, 'ngay_nhap');
        
        const { data: allData, error } = await query;
        if (error) throw error;
        exportData = allData;
      }

      if (!exportData || exportData.length === 0) {
        alert("Không có dữ liệu để xuất");
        setLoading(false);
        return;
      }

      const wsData = exportData.map(r => ({
        "Ngày nhập": r.ngay_nhap,
        "Mã hàng": r.ma_hang,
        "Tên hàng": r.ten_hang,
        "Số lượng nhập": r.so_luong_nhap,
        "Mã NCC": r.ma_ncc,
        "Kho nhập": r.kho_nhap,
        "Lý do nhập": r.ly_do_nhap
      }));

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu nhập");
      XLSX.writeFile(wb, `Du_Lieu_Nhap_${todayLocal()}.xlsx`);

    } catch (e) {
      alert("Lỗi xuất Excel: " + e.message);
    }
    setLoading(false);
  };

  const handleDownloadSample = () => {
    const wsData = [
      {
        "Ngày nhập": todayLocal(),
        "Mã hàng": "MA01",
        "Tên hàng": "Tên Hàng Mẫu 01",
        "Số lượng nhập": 100,
        "Mã NCC": "NCC01",
        "Kho nhập": "Kho A",
        "Lý do nhập": "Nhập mới"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mẫu Nhập Kho");
    XLSX.writeFile(wb, "Mau_Nhap_Kho.xlsx");
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!jsonData || jsonData.length === 0) {
        throw new Error("File Excel trống hoặc không đúng định dạng.");
      }

      const insertData = jsonData.map((row, index) => {
        const ngayNhapRaw = row["Ngày nhập"] || row["ngay_nhap"];
        let ngay_nhap = todayLocal();
        
        if (typeof ngayNhapRaw === 'number') {
          const date = new Date(Math.round((ngayNhapRaw - 25569) * 86400 * 1000));
          ngay_nhap = date.toISOString().split('T')[0];
        } else if (typeof ngayNhapRaw === 'string' && ngayNhapRaw) {
          ngay_nhap = ngayNhapRaw;
        }

        const ma_hang = row["Mã hàng"] || row["ma_hang"];
        if (!ma_hang) throw new Error(`Dòng ${index + 2}: Thiếu Mã hàng`);

        return {
          ngay_nhap: ngay_nhap,
          ma_hang: String(ma_hang).trim(),
          ten_hang: String(row["Tên hàng"] || row["ten_hang"] || '').trim(),
          so_luong_nhap: parseFloat(row["Số lượng nhập"] || row["so_luong_nhap"]) || 0,
          ma_ncc: String(row["Mã NCC"] || row["ma_ncc"] || '').trim(),
          kho_nhap: String(row["Kho nhập"] || row["kho_nhap"] || '').trim(),
          ly_do_nhap: String(row["Lý do nhập"] || row["ly_do_nhap"] || '').trim()
        };
      });

      const BATCH = 500;
      for (let i = 0; i < insertData.length; i += BATCH) {
        const { error } = await db.from('du_lieu_nhap').insert(insertData.slice(i, i + BATCH));
        if (error) throw error;
      }

      alert(`Đã nhập thành công ${insertData.length} dòng!`);
      setPage(1);
      fetchData();
    } catch (error) {
      console.error("Lỗi import Excel:", error);
      alert("Lỗi nhập Excel: " + error.message);
    } finally {
      setIsImporting(false);
      setShowImportModal(false);
      if (e && e.target) e.target.value = ''; // Reset input
    }
  };

  const toggleRow = (id) => {
    const next = new Set(selectedKeys);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (selectedKeys.size === data.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(data.map(r => r.id)));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedKeys.size} dòng?`)) return;
    try {
      const { error } = await db.from('du_lieu_nhap').delete().in('id', Array.from(selectedKeys));
      if (error) throw error;
      fetchData();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        ngay_nhap: updatedRow.ngay_nhap,
        ma_hang: updatedRow.ma_hang,
        ten_hang: updatedRow.ten_hang,
        so_luong_nhap: parseFloat(updatedRow.so_luong_nhap || 0),
        ma_ncc: updatedRow.ma_ncc,
        kho_nhap: updatedRow.kho_nhap,
        ly_do_nhap: updatedRow.ly_do_nhap
      };
      const { error } = await db.from('du_lieu_nhap').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      setEditRow(null);
      fetchData();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const tdStyle = { padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155' };
  const thStyle = { padding: '10px 8px', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: '0.75rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' };

  return (
    <>
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div className="mobile-toolbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{minWidth:120, flexShrink:0, flex:1}}>
          <SearchAutoSuggest
            tableName="du_lieu_nhap"
            searchColumns={['ma_hang','ten_hang','ma_ncc','ly_do_nhap']}
            displayColumn="ma_hang"
            placeholder="Tìm mã, tên, lý do..."
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
          />
        </div>
        
        <DateRangeDropdown label="Ngày" value={dateRange} onChange={v => { setDateRange(v); setPage(1); }} alignRight={true} />
        <ColumnToggle columns={TABLE_COLS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          
          <div style={{ flex: 1, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize:'0.75rem' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{...thStyle, width:28, textAlign:'center'}}>
                <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === data.length} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
              </th>
              {!hiddenCols.has('ngay_nhap') && <th style={{...thStyle, whiteSpace: 'nowrap'}}>Ngày nhập</th>}
              {!hiddenCols.has('san_pham') && <th style={thStyle}>Sản phẩm</th>}
              {!hiddenCols.has('sl') && <th style={{...thStyle, textAlign: 'right', whiteSpace: 'nowrap'}}>SL</th>}
              {!hiddenCols.has('ma_ncc') && <th style={{...thStyle, whiteSpace: 'nowrap'}}>Mã NCC</th>}
              {!hiddenCols.has('kho') && <th style={{...thStyle, whiteSpace: 'nowrap'}}>Kho</th>}
              {!hiddenCols.has('ly_do') && <th style={thStyle}>Lý do</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7 - hiddenCols.size} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}><Loader2 size={24} className="spin" style={{ margin: '0 auto' }}/></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={7 - hiddenCols.size} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Không có dữ liệu</td></tr>
            ) : (
              data.map(row => (
                <tr key={row.id} onClick={()=>toggleRow(row.id)} style={{ transition: 'background 0.2s', background:selectedKeys.has(row.id)?'#f0f9ff':'transparent', cursor:'pointer' }} onMouseEnter={e => !selectedKeys.has(row.id) && (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => !selectedKeys.has(row.id) && (e.currentTarget.style.background = 'transparent')}>
                  <td style={{padding:'0.4rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={selectedKeys.has(row.id)} onChange={()=>toggleRow(row.id)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                  </td>
                  {!hiddenCols.has('ngay_nhap') && <td style={{padding:'0.4rem 0.2rem', fontWeight: 500, whiteSpace:'nowrap', color:'#64748b'}}>{shortDate(row.ngay_nhap)}</td>}
                  {!hiddenCols.has('san_pham') && <td style={{padding:'0.4rem 0.2rem', minWidth:110}}>
                    <div style={{fontWeight: 600, color: '#0284c7'}}>{row.ma_hang}</div>
                    <div style={{fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px'}}>{row.ten_hang}</div>
                  </td>}
                  {!hiddenCols.has('sl') && <td style={{padding:'0.4rem 0.2rem', textAlign: 'right', fontWeight: 700, color: '#16a34a', fontVariantNumeric:'tabular-nums'}}>{Number(row.so_luong_nhap).toLocaleString('vi-VN')}</td>}
                  {!hiddenCols.has('ma_ncc') && <td style={{padding:'0.4rem 0.2rem', whiteSpace:'nowrap', color:'#475569'}}>{row.ma_ncc}</td>}
                  {!hiddenCols.has('kho') && <td style={{padding:'0.4rem 0.2rem', whiteSpace:'nowrap', color:'#475569'}}>{row.kho_nhap}</td>}
                  {!hiddenCols.has('ly_do') && <td style={{padding:'0.4rem 0.2rem', color:'#475569'}}>{row.ly_do_nhap}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
          </div>

        {/* Pagination */}
        <div className="mobile-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              <strong style={{color:'#334155'}}>{totalCount}</strong> dòng
            </span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{padding:'0.2rem 0.4rem', border:'1px solid #e2e8f0', borderRadius:7, fontSize:'0.75rem', outline:'none', background:'#fff', color:'#334155'}}>
              <option value={50}>50/trang</option>
              <option value={100}>100/trang</option>
              <option value={500}>500/trang</option>
              <option value={1000}>1K/trang</option>
              <option value={5000}>5K/trang</option>
              <option value={10000}>10K/trang</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.6rem', border: '1px solid #cbd5e1', background: page === 1 ? '#f1f5f9' : '#fff', color: page === 1 ? '#94a3b8' : '#0f172a', borderRadius: '7px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize:'0.75rem', fontWeight:600 }}
            >
              Trước
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'7px', color:'#0891b2' }}>
              {page} / {totalPages || 1}
            </span>
            <button 
              disabled={page >= totalPages} 
              onClick={() => setPage(p => p + 1)}
              style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.6rem', border: '1px solid #cbd5e1', background: page >= totalPages ? '#f1f5f9' : '#fff', color: page >= totalPages ? '#94a3b8' : '#0f172a', borderRadius: '7px', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize:'0.75rem', fontWeight:600 }}
            >
              Sau
            </button>
          </div>
        </div>
      </main>
    </div>

      {/* Sticky Bottom Action Bar */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExportExcel} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#10b981',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Download size={14}/>Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(data.find(r=>r.id===Array.from(selectedKeys)[0]))} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#f59e0b',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            {perms.delete && (
              <button onClick={handleDelete} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#ef4444',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>
            )}
          </>
        ) : (
          <>
            {perms.io && (
              <button
                onClick={() => setShowImportModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, marginLeft: 'auto' }}
              >
                <Upload size={14} /> Nhập Excel
              </button>
            )}
            <button 
              onClick={handleExportExcel}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
            >
              {loading ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Xuất Excel
            </button>
          </>
        )}
      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

      {/* Modals */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa dữ liệu nhập</h3>
            <div style={{maxHeight:'60vh', overflowY:'auto', paddingRight:10}}>
              {Object.entries({
                ngay_nhap: 'Ngày nhập',
                ma_hang: 'Mã hàng',
                ten_hang: 'Tên hàng',
                so_luong_nhap: 'Số lượng nhập',
                ma_ncc: 'Mã NCC',
                kho_nhap: 'Kho nhập',
                ly_do_nhap: 'Lý do nhập'
              }).map(([k, label]) => (
                <div key={k} style={{marginBottom:10}}>
                  <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{label}</label>
                  <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{padding:'0.4rem 0.6rem', border:'1px solid #cbd5e1', borderRadius:6, fontSize:'0.8rem', outline:'none', width:'100%',boxSizing:'border-box'}} type={k==='ngay_nhap'?'date':'text'}/>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>setEditRow(null)} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.8rem',borderRadius:6,border:'1px solid #cbd5e1',background:'#fff',cursor:'pointer',fontSize:'0.8rem'}}>Hủy</button>
              <button onClick={()=>handleSaveEdit(editRow)} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.8rem',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',fontWeight:600,cursor:'pointer',fontSize:'0.8rem'}}>Lưu</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)',padding:'1rem'}} onClick={()=>setShowImportModal(false)}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',gap:20}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:0,fontSize:'1.1rem',color:'#0f172a'}}>Nhập dữ liệu từ Excel</h3>
            
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <p style={{margin:0,fontSize:'0.85rem',color:'#475569'}}>Bạn cần chuẩn bị file Excel theo đúng định dạng mẫu của hệ thống trước khi tải lên.</p>
              <button 
                onClick={handleDownloadSample}
                style={{ display: 'flex', alignItems: 'center', justifyContent:'center', gap: '8px', background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <FileDown size={18} /> Tải file mẫu (.xlsx)
              </button>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent:'center', gap: '8px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.8rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: isImporting ? 0.7 : 1, textAlign:'center' }}>
                {isImporting ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
                {isImporting ? 'Đang xử lý...' : 'Chọn file Excel & Tải lên'}
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={handleImportExcel} 
                  style={{ display: 'none' }} 
                  disabled={isImporting}
                />
              </label>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button onClick={()=>setShowImportModal(false)} style={{background:'none',border:'none',color:'#64748b',fontWeight:600,cursor:'pointer',fontSize:'0.85rem'}}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
