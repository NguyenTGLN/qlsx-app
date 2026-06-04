import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, RefreshCw, Printer, Download, X, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';
import DateRangeDropdown from '../../components/DateRangeDropdown';
import { todayLocal } from '../../lib/dateUtils';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { ColumnToggleModal } from '../../components/WarehouseSharedUI';

const BOOK_COLS = ['san_pham','ton_dau_ky','tong_nhap','tong_xuat','kho_con','ton_thuc_te','chenh_lech'];
const BOOK_LABELS = { san_pham:'Sản phẩm', ton_dau_ky:'Tồn đầu kỳ', tong_nhap:'Tổng nhập', tong_xuat:'Tổng xuất', kho_con:'Kho còn', ton_thuc_te:'Tồn TT', chenh_lech:'Chênh lệch' };

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};



export default function BookInventoryTab() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ preset: 'Tháng này', from: '', to: '' });
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  
  const [allRows, setAllRows] = useState([]); // kết quả tổng hợp DB đã tính sẵn (get_book_inventory)
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState('bookInv_pageSize', 50);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('bookInv_hiddenCols', new Set());

  // Row selection
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Sort chênh lệch
  const [sortByLech, setSortByLech] = useState(false); // true = hàng lệch lên đầu
  const [lechFilter, setLechFilter] = useState('all'); // 'all' | 'neg'(<0) | 'zero'(=0) | 'gte0'(>=0)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText !== searchInput) { setSearchText(searchInput); setPage(1); }
    }, 500);
    return () => clearTimeout(t);
  }, [searchInput, searchText]);

  useEffect(() => { setPage(1); }, [dateRange, pageSize]);

  // Lấy dữ liệu sổ sách — DATABASE đã tính sẵn qua hàm get_book_inventory.
  // App chỉ tải kết quả cuối (vài nghìn mã hàng) thay vì kéo ~20.000 dòng thô về tự tính.
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 'Tất cả' (không chọn ngày) → kỳ rất rộng để mọi phát sinh đều tính trong kỳ.
      const p_start = dateRange.from || '1900-01-01';
      const p_end = dateRange.to || '2999-12-31';
      // DB trả tối đa 1000 dòng/lần → lấy theo từng đợt cho đủ hết mã hàng.
      let all = [];
      let from = 0; const step = 1000;
      while (true) {
        const { data, error } = await db.rpc('get_book_inventory', { p_start, p_end }).range(from, from + step - 1);
        if (error) throw error;
        if (data) all = all.concat(data);
        if (!data || data.length < step) break;
        from += step;
      }
      setAllRows(all.map(r => ({
        item_code: r.item_code,
        item_name: r.item_name,
        ton_dau_ky: Number(r.ton_dau_ky) || 0,
        tong_nhap: Number(r.tong_nhap) || 0,
        tong_xuat: Number(r.tong_xuat) || 0,
        ton_thuc_te: Number(r.ton_thuc_te) || 0,
        kho_con: Number(r.kho_con) || 0,
        chenh_lech: Number(r.chenh_lech) || 0,
      })));
      setSelectedKeys(new Set());
    } catch (e) {
      alert("Lỗi tải dữ liệu sổ sách: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const processedData = useMemo(() => {
    let result = allRows;
    if (searchText.trim()) {
      const terms = searchText.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
      if (terms.length > 0) {
        result = result.filter(item => terms.some(t => item.item_code && item.item_code.toLowerCase() === t));
      }
    }
    // Lọc theo chênh lệch
    if (lechFilter !== 'all') {
      const eps = 1e-6;
      result = result.filter(r => {
        const v = Number(r.chenh_lech) || 0;
        if (lechFilter === 'neg') return v < -eps;          // < 0
        if (lechFilter === 'pos') return v > eps;           // > 0
        if (lechFilter === 'nonzero') return Math.abs(v) > eps; // ≠ 0
        return true;
      });
    }
    // Sắp xếp: nếu đang lọc chênh lệch → hàng lệch lên đầu (theo |chênh lệch| giảm dần), cùng nhóm sort theo mã
    return [...result].sort((a, b) => {
      if (sortByLech) {
        const da = Math.abs(a.chenh_lech || 0), db = Math.abs(b.chenh_lech || 0);
        // hàng lệch khác 0 trên, hàng bằng 0 dưới
        if ((da !== 0) !== (db !== 0)) return da !== 0 ? -1 : 1;
        if (da !== db) return db - da; // lệch nhiều hơn lên trên
      }
      return a.item_code.localeCompare(b.item_code, 'vi', { numeric: true, sensitivity: 'base' });
    });
  }, [allRows, searchText, sortByLech, lechFilter]);

  // Tổng chênh lệch của các dòng đã chọn (sum trên toàn bộ dữ liệu, không phụ thuộc filter/trang)
  const selectedLechSum = useMemo(
    () => allRows.filter(r => selectedKeys.has(r.item_code)).reduce((a, r) => a + (Number(r.chenh_lech) || 0), 0),
    [allRows, selectedKeys]
  );

  const totalRows = processedData.length;
  const rows = processedData.slice((page - 1) * pageSize, page * pageSize);

  const [dateStartStr, dateEndStr] = useMemo(() => {
    const fmtVN = (s) => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
    return [fmtVN(dateRange.from), fmtVN(dateRange.to)];
  }, [dateRange]);

  const handleExport = () => {
    const source = selectedKeys.size > 0 ? processedData.filter(r => selectedKeys.has(r.item_code)) : processedData;
    const dataToExport = source.map((r, i) => ({
      'STT': i + 1,
      'Mã': r.item_code,
      'Tên': r.item_name,
      'Tồn đầu kỳ': r.ton_dau_ky,
      'Tổng nhập': r.tong_nhap,
      'Tổng xuất': r.tong_xuat,
      'Kho Còn (Sổ sách)': r.kho_con,
      'Tồn thực tế': r.ton_thuc_te,
      'Chênh Lệch': r.chenh_lech
    }));

    const ws = XLSX.utils.json_to_sheet([]);
    const dateInfo = `Thời gian: ${dateStartStr || 'Đầu kỳ'} đến ${dateEndStr || 'Hiện tại'}`;
    XLSX.utils.sheet_add_aoa(ws, [
      ['BÁO CÁO ĐỐI CHIẾU TỒN KHO SỔ SÁCH'],
      [dateInfo],
      []
    ], { origin: 'A1' });
    XLSX.utils.sheet_add_json(ws, dataToExport, { origin: 'A4' });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ton_Kho_So_Sach");
    
    const fileNameDate = `${dateStartStr ? dateStartStr.replace(/\//g,'') : 'DauKy'}_${dateEndStr ? dateEndStr.replace(/\//g,'') : 'HienTai'}`;
    XLSX.writeFile(wb, `TonKhoSoSach_${fileNameDate}.xlsx`);
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = BOOK_COLS.filter(c => vis(c)).length + 2; // + checkbox + #

  const toggleRow = (key) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (selectedKeys.size === rows.length && rows.length > 0) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(rows.map(r => r.item_code)));
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div className="mobile-toolbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{minWidth:120, flexShrink:0, flex:1}}>
          <SearchAutoSuggest
            tableName="inventory_items"
            searchColumns={['item_code','item_name']}
            displayColumn="item_code"
            placeholder="Tìm mã, tên HH..."
            value={searchInput}
            onChange={v => { setSearchInput(v); }}
          />
        </div>
        <select value={lechFilter} onChange={e=>{setLechFilter(e.target.value); setPage(1);}}
          title="Lọc theo chênh lệch"
          style={{...s.input, padding:'0.4rem 0.5rem', fontSize:'0.78rem', flexShrink:0, fontWeight:600, color: lechFilter!=='all'?'#ef4444':'#475569', borderColor: lechFilter!=='all'?'#fca5a5':'#e2e8f0'}}>
          <option value="all">Lệch: Tất cả</option>
          <option value="neg">Lệch &lt; 0 (thiếu)</option>
          <option value="pos">Lệch &gt; 0 (dư)</option>
          <option value="nonzero">Lệch ≠ 0 (có lệch)</option>
        </select>
        <DateRangeDropdown label="Kỳ" value={dateRange} onChange={setDateRange} alignRight={true} />
        <ColumnToggleModal columns={BOOK_COLS} labels={BOOK_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding: '0.6rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{margin: 0, fontSize: '0.9rem', color: '#0f172a', fontWeight: 600}}>Bảng Đối Chiếu Tồn Kho</h3>
            <span style={{fontSize: '0.8rem', color: '#0891b2', fontWeight: 600, background: '#e0f2fe', padding: '0.2rem 0.6rem', borderRadius: '4px'}}>
              Kỳ tính: {dateStartStr || 'Đầu kỳ'} - {dateEndStr || 'Hiện tại'}
            </span>
          </div>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tổng hợp dữ liệu sổ sách...</p>
            </div>
          ) : (
            <div style={{overflowX:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                <thead>
                  <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',width:28,textAlign:'center'}}>
                      <input type="checkbox" checked={selectedKeys.size > 0 && selectedKeys.size === rows.length} onChange={toggleAll} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                    </th>
                    <th style={{padding:'0.4rem',borderBottom:'2px solid #e2e8f0',textAlign:'center',color:'#94a3b8',width:28,fontSize:'0.65rem',fontWeight:700}}>#</th>
                    {vis('san_pham') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'left',color:'#64748b',fontSize:'0.7rem',fontWeight:700}}>Sản phẩm</th>}
                    {vis('ton_dau_ky') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'right',color:'#64748b',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap'}}>Tồn đầu kỳ</th>}
                    {vis('tong_nhap') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'right',color:'#64748b',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap'}}>Tổng nhập</th>}
                    {vis('tong_xuat') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'right',color:'#64748b',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap'}}>Tổng xuất</th>}
                    {vis('kho_con') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'right',color:'#1d4ed8',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap'}}>Kho còn</th>}
                    {vis('ton_thuc_te') && <th style={{padding:'0.4rem 0.3rem',borderBottom:'2px solid #e2e8f0',textAlign:'right',color:'#059669',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap'}}>Tồn TT</th>}
                    {vis('chenh_lech') && <th onClick={()=>{setSortByLech(v=>!v);setPage(1);}} style={{padding:'0.4rem 0.3rem',borderBottom:`2px solid ${sortByLech?'#ef4444':'#e2e8f0'}`,textAlign:'right',color:'#ef4444',fontSize:'0.7rem',fontWeight:700,whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}} title="Bấm để đưa hàng lệch lên đầu">Chênh lệch {sortByLech?'↑':'⇅'}</th>}
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
                      {vis('ton_dau_ky') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.ton_dau_ky.toLocaleString('vi-VN')}</td>}
                      {vis('tong_nhap') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.tong_nhap ? row.tong_nhap.toLocaleString('vi-VN') : '-'}</td>}
                      {vis('tong_xuat') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#64748b',fontVariantNumeric:'tabular-nums'}}>{row.tong_xuat ? row.tong_xuat.toLocaleString('vi-VN') : '-'}</td>}
                      {vis('kho_con') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:'#1d4ed8',background:'#eff6ff',fontVariantNumeric:'tabular-nums'}}>{row.kho_con.toLocaleString('vi-VN')}</td>}
                      {vis('ton_thuc_te') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:'#059669',background:'#ecfdf5',fontVariantNumeric:'tabular-nums'}}>{row.ton_thuc_te.toLocaleString('vi-VN')}</td>}
                      {vis('chenh_lech') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:row.chenh_lech!==0?'#ef4444':'#cbd5e1',fontVariantNumeric:'tabular-nums'}}>{row.chenh_lech ? row.chenh_lech.toLocaleString('vi-VN') : '-'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalRows > 0 && (
            <div className="mobile-toolbar" style={{padding:'0.5rem',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',fontSize:'0.75rem',color:'#64748b',flexWrap:'wrap',gap:'0.5rem'}}>
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
        <button onClick={fetchData} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
          <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
        </button>
        <button onClick={() => {
          const totalKhoCon = processedData.reduce((acc, row) => acc + (row.kho_con || 0), 0);
          const totalTonThucTe = processedData.reduce((acc, row) => acc + (row.ton_thuc_te || 0), 0);
          alert(`TỔNG SỐ LƯỢNG:\n- Kho còn: ${totalKhoCon.toLocaleString('vi-VN')}\n- Tồn thực tế: ${totalTonThucTe.toLocaleString('vi-VN')}`);
        }} style={{...s.btn, padding:'0.4rem',flexShrink:0}}>
          <Calculator size={16}/>
        </button>
        <button onClick={()=>setShowPrintModal(true)} style={{...s.btn, padding:'0.4rem',flexShrink:0}}>
          <Printer size={16}/>
        </button>
        {selectedKeys.size > 0 && (
          <span style={{fontSize:'0.78rem',fontWeight:700,color:'#1e3a8a',marginLeft:'auto',whiteSpace:'nowrap'}}>
            {selectedKeys.size} đã chọn · Σ lệch:{' '}
            <span style={{color: Math.abs(selectedLechSum)>1e-6 ? '#ef4444' : '#16a34a'}}>
              {selectedLechSum.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}
            </span>
          </span>
        )}
        <button onClick={handleExport} style={{...s.btn, background:'#10b981', color:'#fff', border:'none', padding:'0.4rem 0.75rem',marginLeft:selectedKeys.size>0?0:'auto',flexShrink:0}}>
          <Download size={14}/> {selectedKeys.size > 0 ? `Xuất (${selectedKeys.size})` : 'Xuất Excel'}
        </button>
      </div>

      {showPrintModal && (
        <div id="print-modal-overlay" style={{position:'fixed', inset:0, background:'#fff', zIndex:9999, display:'flex', flexDirection:'column'}}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #print-modal-overlay, #print-modal-overlay * { visibility: visible; }
              #print-modal-overlay { position: absolute !important; left: 0; top: 0; width: 100%; display: block !important; height: auto !important; overflow: visible !important; }
              #print-section { position: static !important; display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; }
              .no-print { display: none !important; }
              table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              thead { display: table-header-group; }
              tfoot { display: table-footer-group; }
              td, th { border: 1px solid #000; padding: 4px; }
            }
          `}</style>
          
          <div className="no-print" style={{padding:'1rem 1.5rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            <h2 style={{margin:0, fontSize:'1.2rem', color:'#0f172a', display:'flex', alignItems:'center', gap:8}}>
              <Printer size={20} color="#0891b2"/> In Đối Chiếu Tồn Kho Sổ Sách
            </h2>
            <div style={{display:'flex', alignItems:'center', gap:20}}>
              <button onClick={()=>window.print()} style={{...s.btn, background:'#0891b2', color:'#fff', border:'none', padding:'0.5rem 1rem', fontSize:'0.85rem'}}><Printer size={16}/> In báo cáo</button>
              <button onClick={()=>setShowPrintModal(false)} style={{...s.btn, fontSize:'0.85rem', padding:'0.5rem 1rem'}}><X size={16}/> Đóng</button>
            </div>
          </div>
          
          <div id="print-section" style={{flex:1, padding:'2rem', overflowY:'auto', background:'#fff', color:'#000'}}>
            <h1 style={{textAlign:'center', textTransform:'uppercase', marginBottom:'5px', fontSize:'16pt'}}>BÁO CÁO ĐỐI CHIẾU TỒN KHO SỔ SÁCH</h1>
            <p style={{textAlign:'center', marginBottom:'20px', fontSize:'11pt', color:'#333'}}>
              Từ ngày: {dateStartStr || '...'} Đến ngày: {dateEndStr || '...'}
            </p>
            
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'10pt', fontFamily:'Times New Roman, serif'}}>
              <thead>
                <tr style={{background:'#f2f2f2'}}>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'center', width:40}}>STT</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'left'}}>Mã HH</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'left'}}>Tên hàng hóa</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Tồn đầu kỳ</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Tổng nhập</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Tổng xuất</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Kho Còn</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Tồn thực tế</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right'}}>Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((row, i) => (
                  <tr key={row.item_code}>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'center'}}>{i+1}</td>
                    <td style={{border:'1px solid #000', padding:'4px'}}>{row.item_code}</td>
                    <td style={{border:'1px solid #000', padding:'4px'}}>{row.item_name}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right'}}>{row.ton_dau_ky.toLocaleString('vi-VN')}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right'}}>{row.tong_nhap ? row.tong_nhap.toLocaleString('vi-VN') : '-'}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right'}}>{row.tong_xuat ? row.tong_xuat.toLocaleString('vi-VN') : '-'}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right', fontWeight:'bold'}}>{row.kho_con.toLocaleString('vi-VN')}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right', fontWeight:'bold'}}>{row.ton_thuc_te.toLocaleString('vi-VN')}</td>
                    <td style={{border:'1px solid #000', padding:'4px', textAlign:'right'}}>{row.chenh_lech ? row.chenh_lech.toLocaleString('vi-VN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
