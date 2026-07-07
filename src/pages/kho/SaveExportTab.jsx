import React, { useState, useEffect } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, ChevronLeft, ChevronRight, Download, Upload, FileDown, Loader2, Trash2, Edit3, X, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import DateRangeDropdown, { applyDateFilter } from '../../components/DateRangeDropdown';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { shortDate, ColumnToggleModal } from '../../components/WarehouseSharedUI';

const TABLE_COLS = ['ngay_xuat', 'san_pham', 'sl', 'ma_don_hang'];
const COL_LABELS = { ngay_xuat: 'Ngày xuất', san_pham: 'Sản phẩm', sl: 'Số lượng', ma_don_hang: 'Mã ĐH' };

export default function SaveExportTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
  
  const [dateRange, setDateRange] = useState({ preset: 'Tất cả', from: '', to: '' });
  
  const [searchInput, setSearchInput] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = usePersistedState('saveExport_pageSize', 50);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('saveExport_hiddenCols_v3', new Set());

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchInput) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    fetchData();
  }, [page, search, pageSize, dateRange]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = db.from('luu_xuat').select('*', { count: 'estimated' });
      
      if (search) {
        const terms = search.split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          query = query.in('ma_san_pham', terms);
        }
      }

      query = applyDateFilter(query, dateRange, 'ngay_xuat');

      // Sort by latest
      query = query.order('ngay_xuat', { ascending: false }).order('created_at', { ascending: false });

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
      console.error("Lỗi tải dữ liệu lưu xuất:", e);
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
        let query = db.from('luu_xuat').select('*').order('ngay_xuat', { ascending: false });
        if (search) {
          const terms = search.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) query = query.in('ma_san_pham', terms);
        }
        query = applyDateFilter(query, dateRange, 'ngay_xuat');
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
        "Ngày xuất": r.ngay_xuat,
        "Mã SP": r.ma_san_pham,
        "Tên sản phẩm": r.ten_san_pham,
        "Số lượng": r.so_luong,
        "Mã đơn hàng": r.ma_don_hang
      }));

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lưu xuất");
      XLSX.writeFile(wb, `Luu_Xuat_${todayLocal()}.xlsx`);

    } catch (e) {
      alert("Lỗi xuất Excel: " + e.message);
    }
    setLoading(false);
  };

  const handleDownloadSample = () => {
    const wsData = [
      {
        "Ngày xuất": todayLocal(),
        "Mã SP": "SP01",
        "Tên sản phẩm": "Sản phẩm mẫu",
        "Số lượng": 10,
        "Mã đơn hàng": "DH01"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mẫu Lưu Xuất");
    XLSX.writeFile(wb, "Mau_Luu_Xuat.xlsx");
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const dataBuf = await file.arrayBuffer();
      const workbook = XLSX.read(dataBuf);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!jsonData || jsonData.length === 0) {
        throw new Error("File Excel trống hoặc không đúng định dạng.");
      }

      const insertData = jsonData.map((row, index) => {
        const ngayXuatRaw = row["Ngày xuất"] || row["ngay_xuat"];
        let ngay_xuat = todayLocal();
        
        if (typeof ngayXuatRaw === 'number') {
          const date = new Date(Math.round((ngayXuatRaw - 25569) * 86400 * 1000));
          ngay_xuat = date.toISOString().split('T')[0];
        } else if (typeof ngayXuatRaw === 'string' && ngayXuatRaw) {
          ngay_xuat = ngayXuatRaw;
        }

        const ma_san_pham = row["Mã SP"] || row["ma_san_pham"] || row["Mã sản phẩm"];
        if (!ma_san_pham) throw new Error(`Dòng ${index + 2}: Thiếu Mã SP`);

        return {
          ngay_xuat: ngay_xuat,
          ma_san_pham: String(ma_san_pham).trim(),
          ten_san_pham: String(row["Tên sản phẩm"] || row["ten_san_pham"] || '').trim(),
          so_luong: parseFloat(row["Số lượng"] || row["so_luong"]) || 0,
          ma_don_hang: String(row["Mã đơn hàng"] || row["ma_don_hang"] || '').trim()
        };
      });

      const BATCH = 500;
      for (let i = 0; i < insertData.length; i += BATCH) {
        const { error } = await db.from('luu_xuat').insert(insertData.slice(i, i + BATCH));
        if (error) throw error;
      }

      alert(`Đã nhập thành công ${insertData.length} dòng!`);
      setShowImportModal(false);
      setPage(1);
      fetchData();
    } catch (error) {
      console.error("Lỗi import Excel:", error);
      alert("Lỗi nhập Excel: " + error.message);
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
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
      const { error } = await db.from('luu_xuat').delete().in('id', Array.from(selectedKeys));
      if (error) throw error;
      fetchData();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        ngay_xuat: updatedRow.ngay_xuat,
        ma_san_pham: updatedRow.ma_san_pham,
        ten_san_pham: updatedRow.ten_san_pham,
        so_luong: parseFloat(updatedRow.so_luong || 0),
        ma_don_hang: updatedRow.ma_don_hang
      };
      const { error } = await db.from('luu_xuat').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      setEditRow(null);
      fetchData();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const thStyle = { padding: '10px 8px', textAlign: 'left', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontSize: '0.72rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = TABLE_COLS.filter(c => vis(c)).length + 1; // +1 for checkbox

  return (
    <>
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar — Search + DateFilter + ColumnToggle only */}
      <div className="mobile-toolbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{minWidth:120, flexShrink:0, flex:1}}>
          <SearchAutoSuggest
            tableName="luu_xuat"
            searchColumns={['ma_san_pham','ten_san_pham','ma_don_hang']}
            displayColumn="ma_san_pham"
            placeholder="Tìm mã SP, tên, ĐH..."
            value={searchInput}
            onChange={v => { setSearchInput(v); setPage(1); }}
          />
        </div>

        <DateRangeDropdown label="Ngày" value={dateRange} onChange={v => { setDateRange(v); setPage(1); }} alignRight={true} />
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
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
              {vis('ngay_xuat') && <th style={{...thStyle, whiteSpace:'nowrap'}}>Ngày xuất</th>}
              {vis('san_pham') && <th style={thStyle}>Sản phẩm</th>}
              {vis('sl') && <th style={{...thStyle, textAlign: 'right', whiteSpace:'nowrap'}}>SL</th>}
              {vis('ma_don_hang') && <th style={{...thStyle, whiteSpace:'nowrap'}}>Mã ĐH</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={visCount} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}><Loader2 size={24} className="spin" style={{ margin: '0 auto' }}/></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={visCount} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Không có dữ liệu</td></tr>
            ) : (
              data.map(row => (
                <tr key={row.id} onClick={()=>toggleRow(row.id)} style={{ transition: 'background 0.2s', background:selectedKeys.has(row.id)?'#f0f9ff':'transparent', cursor:'pointer' }} onMouseEnter={e => !selectedKeys.has(row.id) && (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => !selectedKeys.has(row.id) && (e.currentTarget.style.background = 'transparent')}>
                  <td style={{padding:'0.4rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={selectedKeys.has(row.id)} onChange={()=>toggleRow(row.id)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                  </td>
                  {vis('ngay_xuat') && <td style={{padding:'0.4rem 0.2rem', fontWeight: 500, whiteSpace:'nowrap', color:'#64748b'}}>{shortDate(row.ngay_xuat)}</td>}
                  {vis('san_pham') && <td style={{padding:'0.4rem 0.2rem', minWidth:110}}>
                    <div style={{fontWeight: 600, color: '#0284c7'}}>{row.ma_san_pham}</div>
                    <div style={{fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px'}}>{row.ten_san_pham}</div>
                  </td>}
                  {vis('sl') && <td style={{padding:'0.4rem 0.2rem', textAlign: 'right', fontWeight: 700, color: '#16a34a', fontVariantNumeric:'tabular-nums'}}>{Number(row.so_luong).toLocaleString('vi-VN')}</td>}
                  {vis('ma_don_hang') && <td style={{padding:'0.4rem 0.2rem', whiteSpace:'nowrap', color:'#475569'}}>{row.ma_don_hang}</td>}
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

      {/* Sticky Bottom Action Bar — Always visible */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExportExcel} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#10b981',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Download size={14}/>Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(data.find(r=>r.id===Array.from(selectedKeys)[0]))} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#f59e0b',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            {perms.delete && <button onClick={handleDelete} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#ef4444',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>}
          </>
        ) : (
          <>
            {perms.io && <button
              onClick={() => setShowImportModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, marginLeft: 'auto' }}
            >
              <Upload size={14} /> Nhập Excel
            </button>}
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

      {/* Import Modal */}
      {showImportModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:'100%',maxWidth:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              📥 Nhập Excel
              <button onClick={()=>setShowImportModal(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b'}}><X size={18}/></button>
            </h3>
            <div style={{textAlign:'center',marginBottom:'1rem'}}>
              <button onClick={handleDownloadSample} style={{background:'none',border:'none',color:'#7c3aed',fontSize:'0.78rem',fontWeight:700,cursor:'pointer',textDecoration:'underline',display:'inline-flex',alignItems:'center',gap:4}}>
                <FileDown size={13}/> Tải file mẫu Excel
              </button>
            </div>
            <label style={{display:'block',border:'2px dashed #e2e8f0',borderRadius:10,padding:'1.5rem',textAlign:'center',background:'#f8fafc',cursor:'pointer'}}>
              {isImporting ? <Loader2 size={24} className="spin" style={{margin:'0 auto'}}/> : <Upload size={24} color="#7c3aed" style={{margin:'0 auto'}}/>}
              <div style={{fontSize:'0.85rem',fontWeight:600,color:'#334155',marginTop:8}}>Chọn file Excel (.xlsx, .xls)</div>
              <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} style={{display:'none'}} disabled={isImporting}/>
            </label>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:'100%',maxWidth:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa lưu xuất</h3>
            <div style={{maxHeight:'60vh', overflowY:'auto', paddingRight:10}}>
              {Object.entries({
                ngay_xuat: 'Ngày xuất',
                ma_san_pham: 'Mã SP',
                ten_san_pham: 'Tên sản phẩm',
                so_luong: 'Số lượng',
                ma_don_hang: 'Mã đơn hàng'
              }).map(([k, label]) => (
                <div key={k} style={{marginBottom:10}}>
                  <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{label}</label>
                  <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{padding:'0.4rem 0.6rem', border:'1px solid #cbd5e1', borderRadius:6, fontSize:'0.8rem', outline:'none', width:'100%',boxSizing:'border-box'}} type={k==='ngay_xuat'?'date':'text'}/>
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
    </>
  );
}
