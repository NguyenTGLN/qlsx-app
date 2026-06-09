import React, { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, RefreshCw, Package, Database, Download, Upload, Trash2, Edit3, X, Check, Printer, Calculator, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { ColumnToggleModal, shortDate } from '../../components/WarehouseSharedUI';

const INVENTORY_COLS = ['san_pham','dvt','location','import_date','quantity'];
const INVENTORY_LABELS = { san_pham:'Sản phẩm', dvt:'ĐVT', location:'Vị trí', import_date:'Ngày nhập', quantity:'Tồn kho' };

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

export default function InventoryTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  // const PAGE_SIZE = 50;
  const [pageSize, setPageSize] = usePersistedState('inventory_pageSize', 50);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [prefixInput, setPrefixInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filterPrefix, setFilterPrefix] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [locations, setLocations] = useState([]);
  const [sortCol, setSortCol] = useState('item_code');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState([]);

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printShowStock, setPrintShowStock] = useState(false);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('inventory_hiddenCols', new Set());

  // Manual Input State
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputData, setManualInputData] = useState({ item_code: '', item_name: '', unit: 'Cái', location: '', quantity: '' });
  const [productCatalog, setProductCatalog] = useState([]);
  const [showCodeSuggest, setShowCodeSuggest] = useState(false);
  const [showNameSuggest, setShowNameSuggest] = useState(false);

  // Fetch product catalog for manual input suggestions
  useEffect(() => {
    const fetchCat = async () => {
      let page = 0;
      let all = [];
      while(true) {
        const { data } = await db.from('inventory_items').select('item_code, item_name, unit').range(page*1000, (page+1)*1000-1);
        if(data) all = all.concat(data);
        if(!data || data.length < 1000) break;
        page++;
      }
      const unique = [];
      const seen = new Set();
      for(let d of all) {
        if(!seen.has(d.item_code)) {
          seen.add(d.item_code);
          unique.push(d);
        }
      }
      setProductCatalog(unique);
    };
    fetchCat();
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchText, filterLocation, filterPrefix, pageSize]);

  // Debounce search and prefix
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText !== searchInput) setSearchText(searchInput);
      if (filterPrefix !== prefixInput) { 
        setFilterPrefix(prefixInput); 
        if (prefixInput.trim() !== '') {
          setSortCol('location');
          setSortAsc(true);
        }
      }
    }, 500);
    return () => clearTimeout(t);
  }, [searchInput, prefixInput, searchText, filterPrefix]);

  // Fetch unique locations once
  useEffect(() => {
    const fetchLocs = async () => {
      let allLocs = [];
      let page = 0;
      while (true) {
        const { data } = await db.from('inventory_stock').select('location').range(page * 1000, (page + 1) * 1000 - 1);
        if (data) allLocs = allLocs.concat(data);
        if (!data || data.length < 1000) break;
        page++;
      }
      const unique = [...new Set(allLocs.map(d => d.location).filter(Boolean))];
      setLocations(unique.sort());
    };
    fetchLocs();
  }, []);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      let allFetched = [];
      let currentOffset = 0;
      const fetchSize = 1000;

      while (true) {
        let q = db.from('inventory_stock').select(`
          id, item_code, item_name, unit, location, import_date, quantity
        `);

        if (searchText.trim()) {
          const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) {
            q = q.in('item_code', terms);
          }
        }
        if (filterPrefix.trim()) {
          q = q.ilike('location', `${filterPrefix.trim()}%`);
        }
        if (filterLocation) {
          q = q.eq('location', filterLocation);
        }

        q = q.range(currentOffset, currentOffset + fetchSize - 1);
        const { data, error } = await q;
        if (error) throw error;

        if (data) allFetched = allFetched.concat(data);
        if (!data || data.length < fetchSize) break;
        currentOffset += fetchSize;
      }

      setAllData((allFetched || []).map(r => ({...r, quantity: Math.round(parseFloat(r.quantity || 0) * 1000) / 1000})));
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      alert('Lỗi tải tồn kho: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchText, filterLocation, filterPrefix]);

  const processedData = React.useMemo(() => {
    let result = [...allData];
    if (sortCol) {
      result.sort((a, b) => {
        let valA = a[sortCol] == null ? '' : a[sortCol];
        let valB = b[sortCol] == null ? '' : b[sortCol];
        
        if (sortCol === 'location') {
          const strA = String(valA).toUpperCase();
          const strB = String(valB).toUpperCase();
          
          const parseLoc = (loc) => {
            const m = loc.match(/^([A-Z]+)(M|H|B|T)(\d+)$/);
            if (m) {
              const weight = { 'M': 1, 'H': 2, 'B': 3, 'T': 4 }[m[2]];
              return { match: true, day: m[1], weight, num: parseInt(m[3], 10) };
            }
            return { match: false, orig: loc };
          };
          
          const pA = parseLoc(strA);
          const pB = parseLoc(strB);

          if (pA.match && pB.match) {
            if (pA.day !== pB.day) return sortAsc ? pA.day.localeCompare(pB.day) : pB.day.localeCompare(pA.day);
            if (pA.weight !== pB.weight) return sortAsc ? pA.weight - pB.weight : pB.weight - pA.weight;
            if (pA.num !== pB.num) return sortAsc ? pA.num - pB.num : pB.num - pA.num;
            return 0;
          }
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        
        valA = String(valA);
        valB = String(valB);
        // Use numeric: true for Natural Sorting (AH1, AH2, AH13)
        const comp = valA.localeCompare(valB, 'vi', { numeric: true, sensitivity: 'base' });
        return sortAsc ? comp : -comp;
      });
    }
    return result;
  }, [allData, sortCol, sortAsc]);

  const totalRows = processedData.length;
  const rows = processedData.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const colLabel = {
    item_code: 'Mã HH',
    item_name: 'Tên hàng hóa',
    unit: 'ĐVT',
    location: 'Vị trí',
    import_date: 'Ngày nhập',
    quantity: 'Tồn kho',
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
      fetchInventory();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleExport = () => {
    const dataToExport = (selectedKeys.size > 0 ? rows.filter(r => selectedKeys.has(r.id)) : processedData).map(r => {
      const out = {};
      Object.keys(colLabel).forEach(k => out[colLabel[k]] = r[k]);
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ton_Kho");
    XLSX.writeFile(wb, `Ton_Kho_Vi_Tri_${todayLocal()}.xlsx`);
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        item_code: updatedRow.item_code,
        item_name: updatedRow.item_name,
        unit: updatedRow.unit,
        location: updatedRow.location,
        import_date: updatedRow.import_date || null,
        quantity: parseFloat(updatedRow.quantity)
      };
      const { error } = await db.from('inventory_stock').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      setEditRow(null);
      fetchInventory();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const handleDownloadTemplate = () => {
    const cols = ['item_code', 'item_name', 'unit', 'location', 'quantity'];
    const ws = XLSX.utils.json_to_sheet([cols.reduce((acc, c) => ({...acc, [c]: ''}), {})], {header: cols});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_TonKho.xlsx");
  };

  const executeImport = async () => {
    if (!importFile) return alert('Vui lòng chọn file');
    setImporting(true);
    try {
      let buf;
      try {
        buf = await importFile.arrayBuffer();
      } catch (readErr) {
        throw new Error('Không đọc được file. Thường do file ĐANG MỞ trong Excel (Windows khóa file), hoặc file đã bị di chuyển/đổi tên, hoặc đang ở trên OneDrive chưa tải về máy.\n\nCách xử lý: ĐÓNG Excel → copy file ra Desktop → chọn lại file → import lại.');
      }
      const wb = XLSX.read(buf, {type: 'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws);

          // Nhận diện cột linh hoạt: chấp nhận tên tiếng Anh lẫn tiếng Việt phổ biến
          const get = (row, aliases) => {
            for (const k of Object.keys(row)) {
              if (aliases.includes(k.toString().trim().toLowerCase())) return row[k];
            }
            return undefined;
          };
          const ALIAS = {
            code: ['item_code','mã hàng','mã hh','mã hàng hóa','mã sp','ma_hang','mã','mã vật tư','ma hh'],
            name: ['item_name','tên hàng','tên hàng hóa','tên','ten_hang','tên sp'],
            unit: ['unit','đvt','đơn vị','đơn vị tính','dvt'],
            loc:  ['location','vị trí','vị trí kho','vi_tri','kho','vị trí lưu'],
            qty:  ['quantity','số lượng','sl','so_luong','tồn','số lượng tồn','tồn kho'],
          };
          const inserts = data.map(r => ({
            item_code: String(get(r, ALIAS.code) ?? '').trim(),
            item_name: String(get(r, ALIAS.name) ?? '').trim(),
            unit: String(get(r, ALIAS.unit) ?? '').trim(),
            location: String(get(r, ALIAS.loc) ?? '').trim() || 'Kho',
            quantity: parseFloat(get(r, ALIAS.qty) || 0) || 0,
            import_date: todayLocal()
          })).filter(r => r.item_code);

          if (inserts.length === 0) {
            const found = data.length ? Object.keys(data[0]).join('  |  ') : '(không đọc được dòng nào — sai sheet hoặc file rỗng)';
            throw new Error(`Không nhận ra cột MÃ HÀNG.\nCột đang có trong file: [ ${found} ]\nCần 1 cột tên: item_code (hoặc "Mã hàng" / "Mã HH").`);
          }
          
          // Auto-register missing catalog items to avoid foreign key errors
          const catalogItems = inserts.map(r => ({
            item_code: r.item_code,
            item_name: r.item_name || 'Hàng hóa tự động',
            unit: r.unit || 'Cái'
          }));
          
          const uniqueCatalog = [];
          const seen = new Set();
          for (let c of catalogItems) {
            if (!seen.has(c.item_code)) {
              seen.add(c.item_code);
              uniqueCatalog.push(c);
            }
          }

          if (uniqueCatalog.length > 0) {
            const { error: catErr } = await db.from('inventory_items').upsert(uniqueCatalog, { onConflict: 'item_code', ignoreDuplicates: true });
            if (catErr) console.warn("Lỗi tạo danh mục tự động:", catErr);
          }
          
          // Gộp các dòng cùng (mã + vị trí) NGAY TRONG FILE để không nhân đôi,
          // rồi UPSERT theo (item_code, location): đã có thì GHI ĐÈ số lượng (import là bản chụp tồn),
          // chưa có thì tạo mới. Re-import cùng file → kết quả không đổi (không cộng dồn 2 lần).
          const aggMap = {};
          for (const r of inserts) {
            const k = r.item_code + '|' + r.location;
            if (aggMap[k]) aggMap[k].quantity += r.quantity;
            else aggMap[k] = { ...r };
          }
          const aggRows = Object.values(aggMap);
          const BATCH = 500;
          for (let i = 0; i < aggRows.length; i += BATCH) {
            const { error } = await db.from('inventory_stock').upsert(aggRows.slice(i, i + BATCH), { onConflict: 'item_code,location' });
            if (error) throw error;
          }
          
          alert('Nhập dữ liệu thành công!');
          setShowImport(false);
          setImportFile(null);
          fetchInventory();
    } catch (e) {
      alert('Lỗi xử lý file: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveManualInput = async () => {
    if (!manualInputData.item_code || !manualInputData.location || !manualInputData.quantity) {
      return alert("Vui lòng nhập đủ Mã HH, Vị trí và Số lượng!");
    }
    
    try {
      const { error: catErr } = await db.from('inventory_items').upsert([{
        item_code: manualInputData.item_code.trim(),
        item_name: manualInputData.item_name.trim() || 'Hàng hóa tự động',
        unit: manualInputData.unit.trim() || 'Cái'
      }], { onConflict: 'item_code', ignoreDuplicates: true });
      if (catErr) console.warn("Lỗi tạo danh mục:", catErr);

      const payload = {
        item_code: manualInputData.item_code.trim(),
        item_name: manualInputData.item_name.trim(),
        unit: manualInputData.unit.trim(),
        location: manualInputData.location.trim().toUpperCase(),
        quantity: parseFloat(manualInputData.quantity),
        import_date: todayLocal()
      };

      // 1 mã + 1 vị trí = 1 dòng: đã có thì CỘNG DỒN, chưa có thì tạo mới
      const { data: existing } = await db.from('inventory_stock')
        .select('id, quantity').eq('item_code', payload.item_code).eq('location', payload.location).maybeSingle();
      if (existing) {
        const { error } = await db.from('inventory_stock')
          .update({ quantity: (Number(existing.quantity) || 0) + payload.quantity }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('inventory_stock').insert([payload]);
        if (error) throw error;
      }

      setShowManualInput(false);
      setManualInputData({ item_code: '', item_name: '', unit: 'Cái', location: '', quantity: '' });
      fetchInventory();
    } catch (e) {
      alert("Lỗi thêm vị trí: " + e.message);
    }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div className="mobile-toolbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{minWidth:120, flexShrink:0}}>
          <SearchAutoSuggest
            tableName="inventory_stock"
            searchColumns={['item_code','item_name']}
            displayColumn="item_code"
            placeholder="Tìm mã, tên HH..."
            value={searchInput}
            onChange={v => setSearchInput(v)}
          />
        </div>
        <div style={{display:'flex', alignItems:'center', gap:5, background:'#f8fafc', padding:'0.3rem 0.5rem', borderRadius:7, border:'1px solid #e2e8f0', flexShrink:0}}>
          <span style={{fontSize:'0.75rem', fontWeight:600, color:'#64748b'}}>Dãy:</span>
          <input value={prefixInput} onChange={e=>setPrefixInput(e.target.value)} placeholder="VD: A" style={{border:'none', background:'transparent', outline:'none', fontSize:'0.75rem', width: 40, color:'#334155'}} />
        </div>
        <select value={filterLocation} onChange={e=>setFilterLocation(e.target.value)} style={{...s.input, width: 100, padding:'0.3rem', cursor:'pointer', flexShrink:0}}>
          <option value="">Tất cả vị trí</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <ColumnToggleModal columns={INVENTORY_COLS} labels={INVENTORY_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải tồn kho...</p>
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
                    {!hiddenCols.has('san_pham') && <th onClick={()=>handleSort('item_code')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='item_code'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='item_code'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Sản phẩm{sortCol==='item_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {!hiddenCols.has('dvt') && <th onClick={()=>handleSort('unit')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='unit'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='unit'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>ĐVT{sortCol==='unit'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {!hiddenCols.has('location') && <th onClick={()=>handleSort('location')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='location'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='location'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Vị trí{sortCol==='location'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {!hiddenCols.has('import_date') && <th onClick={()=>handleSort('import_date')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='import_date'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='import_date'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Ngày nhập{sortCol==='import_date'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {!hiddenCols.has('quantity') && <th onClick={()=>handleSort('quantity')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='quantity'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='quantity'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Tồn kho{sortCol==='quantity'?(sortAsc?' ↑':' ↓'):''}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={INVENTORY_COLS.filter(c=>!hiddenCols.has(c)).length+2} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Không có dữ liệu tồn kho</td></tr>
                  ) : rows.map((row,ri) => (
                    <tr key={row.id} onClick={()=>toggleRow(row.id)} style={{borderBottom:'1px solid #f1f5f9',background:selectedKeys.has(row.id)?'#f0f9ff':'transparent',cursor:'pointer'}} onMouseEnter={e=>!selectedKeys.has(row.id) && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>!selectedKeys.has(row.id) && (e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selectedKeys.has(row.id)} onChange={()=>toggleRow(row.id)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                      </td>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.65rem',fontWeight:600}}>{(page-1)*pageSize + ri + 1}</td>
                      {!hiddenCols.has('san_pham') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.item_name}</div>
                      </td>}
                      {!hiddenCols.has('dvt') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.unit}</td>}
                      {!hiddenCols.has('location') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.location}</td>}
                      {!hiddenCols.has('import_date') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.import_date ? shortDate(row.import_date) : '—'}</td>}
                      {!hiddenCols.has('quantity') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:row.quantity<=0?'#ef4444':'#059669',fontVariantNumeric:'tabular-nums'}}>
                        {row.quantity.toLocaleString('vi-VN')}
                      </td>}
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
            <button onClick={fetchInventory} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
              <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
            </button>
            {perms.create && <button onClick={()=>setShowManualInput(true)} style={{...s.btn,padding:'0.4rem 0.75rem',flexShrink:0}}><Plus size={14}/>Thêm vị trí</button>}
            {perms.io && <button onClick={()=>setShowImport(true)} style={{...s.btn,background:'#e0f2fe',color:'#0369a1',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Upload size={14}/>Nhập Excel</button>}
            <button onClick={()=>setShowPrintModal(true)} style={{...s.btn,padding:'0.4rem 0.75rem',flexShrink:0}}><Printer size={14}/>In phiếu</button>
            <button onClick={handleExport} disabled={loading} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
          </>
        )}
      </div>

      {/* Modals */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa tồn kho</h3>
            {['item_code', 'item_name', 'unit', 'location', 'quantity'].map(k => (
              <div key={k} style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{colLabel[k]}</label>
                <input value={editRow[k] || ''} onChange={e=>setEditRow({...editRow, [k]: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} />
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Ngày nhập</label>
              <input type="date" value={editRow.import_date || ''} onChange={e=>setEditRow({...editRow, import_date: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} />
            </div>
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

      {showManualInput && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Thêm vị trí thủ công</h3>
            
            <div style={{marginBottom:10, position: 'relative'}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Mã HH *</label>
              <input 
                value={manualInputData.item_code} 
                onChange={e=>{
                  setManualInputData({...manualInputData, item_code: e.target.value, item_name: '', unit: 'Cái'});
                  setShowCodeSuggest(true);
                }}
                onFocus={()=>setShowCodeSuggest(true)}
                onBlur={()=>setTimeout(()=>setShowCodeSuggest(false), 200)}
                style={{...s.input, width:'100%',boxSizing:'border-box'}} 
                placeholder="Nhập mã hàng hóa" 
              />
              {showCodeSuggest && (
                <ul style={{position:'absolute', top:'100%', left:0, right:0, maxHeight:180, overflowY:'auto', background:'#fff', border:'1px solid #cbd5e1', borderRadius:8, padding:0, margin:'4px 0 0 0', listStyle:'none', zIndex:10, boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                  {productCatalog.filter(c=>(c.item_code||'').toLowerCase().includes((manualInputData.item_code||'').toLowerCase())).slice(0,50).map(item=>(
                    <li key={item.item_code} onMouseDown={(e)=>{e.preventDefault(); setManualInputData({...manualInputData, item_code: item.item_code, item_name: item.item_name||'', unit: item.unit||'Cái'}); setShowCodeSuggest(false);}} style={{padding:'0.5rem 0.8rem', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#334155'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                      <strong>{item.item_code}</strong> <span style={{color:'#94a3b8'}}>- {item.item_name}</span>
                    </li>
                  ))}
                  {productCatalog.filter(c=>(c.item_code||'').toLowerCase().includes((manualInputData.item_code||'').toLowerCase())).length===0 && (
                    <li style={{padding:'0.5rem 0.8rem', fontSize:'0.8rem', color:'#94a3b8'}}>Không tìm thấy mã</li>
                  )}
                </ul>
              )}
            </div>
            <div style={{marginBottom:10, position: 'relative'}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Tên hàng hóa</label>
              <input 
                value={manualInputData.item_name} 
                onChange={e=>{
                  setManualInputData({...manualInputData, item_name: e.target.value, item_code: '', unit: 'Cái'});
                  setShowNameSuggest(true);
                }}
                onFocus={()=>setShowNameSuggest(true)}
                onBlur={()=>setTimeout(()=>setShowNameSuggest(false), 200)}
                style={{...s.input, width:'100%',boxSizing:'border-box'}} 
                placeholder="Nhập tên hàng hóa" 
              />
              {showNameSuggest && (
                <ul style={{position:'absolute', top:'100%', left:0, right:0, maxHeight:180, overflowY:'auto', background:'#fff', border:'1px solid #cbd5e1', borderRadius:8, padding:0, margin:'4px 0 0 0', listStyle:'none', zIndex:10, boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)'}}>
                  {productCatalog.filter(c=>(c.item_name||'').toLowerCase().includes((manualInputData.item_name||'').toLowerCase())).slice(0,50).map((item, idx)=>(
                    <li key={item.item_code + '_' + idx} onMouseDown={(e)=>{e.preventDefault(); setManualInputData({...manualInputData, item_code: item.item_code, item_name: item.item_name||'', unit: item.unit||'Cái'}); setShowNameSuggest(false);}} style={{padding:'0.5rem 0.8rem', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#334155'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                      {item.item_name} <span style={{color:'#94a3b8'}}>({item.item_code})</span>
                    </li>
                  ))}
                  {productCatalog.filter(c=>(c.item_name||'').toLowerCase().includes((manualInputData.item_name||'').toLowerCase())).length===0 && (
                    <li style={{padding:'0.5rem 0.8rem', fontSize:'0.8rem', color:'#94a3b8'}}>Không tìm thấy tên</li>
                  )}
                </ul>
              )}
            </div>
            <div style={{display:'flex', gap:10, marginBottom:10}}>
              <div style={{flex:1}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Vị trí mới *</label>
                <input value={manualInputData.location} onChange={e=>setManualInputData({...manualInputData, location: e.target.value.toUpperCase()})} style={{...s.input, width:'100%',boxSizing:'border-box'}} placeholder="Ví dụ: VP1T4" />
              </div>
              <div style={{flex:1}}>
                <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Số lượng *</label>
                <input type="number" value={manualInputData.quantity} onChange={e=>setManualInputData({...manualInputData, quantity: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} placeholder="0" />
              </div>
            </div>
            <div style={{marginBottom:15}}>
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>Đơn vị tính</label>
              <input value={manualInputData.unit} onChange={e=>setManualInputData({...manualInputData, unit: e.target.value})} style={{...s.input, width:'100%',boxSizing:'border-box'}} placeholder="Cái" />
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
              <button onClick={()=>{
                setShowManualInput(false);
                setManualInputData({ item_code: '', item_name: '', unit: 'Cái', location: '', quantity: '' });
              }} style={s.btn}>Hủy</button>
              <button onClick={handleSaveManualInput} style={{...s.btn, background:'#16a34a', color:'#fff'}}>
                <Check size={14}/> Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintModal && (
        <div id="print-modal-overlay" style={{position:'fixed', inset:0, background:'#fff', zIndex:9999, display:'flex', flexDirection:'column'}}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #print-modal-overlay, #print-modal-overlay * { visibility: visible; }
              
              /* Override scroll and fixed properties that break pagination */
              #print-modal-overlay {
                position: absolute !important;
                left: 0;
                top: 0;
                width: 100%;
                display: block !important;
                height: auto !important;
                overflow: visible !important;
              }
              
              #print-section { 
                position: static !important; 
                display: block !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important; 
                margin: 0 !important; 
              }
              
              .no-print { display: none !important; }
              
              /* Table print rules to prevent breaking inside rows */
              table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              thead { display: table-header-group; }
              tfoot { display: table-footer-group; }
            }
          `}</style>
          
          <div className="no-print" style={{padding:'1rem 1.5rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            <h2 style={{margin:0, fontSize:'1.2rem', color:'#0f172a', display:'flex', alignItems:'center', gap:8}}>
              <Printer size={20} color="#0891b2"/> In phiếu kiểm kê
            </h2>
            <div style={{display:'flex', alignItems:'center', gap:20}}>
              <label style={{display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontWeight:600, color:'#334155', fontSize:'0.85rem'}}>
                <input type="checkbox" checked={printShowStock} onChange={e=>setPrintShowStock(e.target.checked)} style={{accentColor:'#0891b2', width:16, height:16}}/>
                Hiển thị Tồn kho sổ sách
              </label>
              <div style={{width:1, height:24, background:'#cbd5e1'}} />
              <button onClick={()=>window.print()} style={{...s.btn, background:'#0891b2', color:'#fff', border:'none', padding:'0.5rem 1rem', fontSize:'0.85rem'}}><Printer size={16}/> In ngay</button>
              <button onClick={()=>setShowPrintModal(false)} style={{...s.btn, fontSize:'0.85rem', padding:'0.5rem 1rem'}}><X size={16}/> Đóng</button>
            </div>
          </div>
          
          <div id="print-section" style={{flex:1, padding:'2rem', overflowY:'auto', background:'#fff', color:'#000'}}>
            <h1 style={{textAlign:'center', textTransform:'uppercase', marginBottom:'5px', fontSize:'18pt'}}>Phiếu Kiểm Kê Kho</h1>
            <p style={{textAlign:'center', marginBottom:'20px', fontSize:'11pt', color:'#333'}}>
              Ngày: {new Date().toLocaleDateString('vi-VN')}
              {filterPrefix && ` - Dãy: ${filterPrefix}`}
              {filterLocation && ` - Vị trí: ${filterLocation}`}
            </p>
            
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'11pt', fontFamily:'Times New Roman, serif'}}>
              <thead>
                <tr>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'center', width:40}}>STT</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'left', width:120}}>Mã HH</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'left'}}>Tên hàng hóa</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'center', width:60}}>ĐVT</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'center', width:80}}>Vị trí</th>
                  {printShowStock && <th style={{border:'1px solid #000', padding:'6px', textAlign:'right', width:80}}>Sổ sách</th>}
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'right', width:100}}>Thực tế</th>
                  <th style={{border:'1px solid #000', padding:'6px', textAlign:'left', width:150}}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((row, i) => (
                  <tr key={row.id}>
                    <td style={{border:'1px solid #000', padding:'6px', textAlign:'center'}}>{i+1}</td>
                    <td style={{border:'1px solid #000', padding:'6px'}}>{row.item_code}</td>
                    <td style={{border:'1px solid #000', padding:'6px'}}>{row.item_name}</td>
                    <td style={{border:'1px solid #000', padding:'6px', textAlign:'center'}}>{row.unit}</td>
                    <td style={{border:'1px solid #000', padding:'6px', textAlign:'center'}}>{row.location}</td>
                    {printShowStock && <td style={{border:'1px solid #000', padding:'6px', textAlign:'right', fontWeight:'bold'}}>{row.quantity.toLocaleString('vi-VN')}</td>}
                    <td style={{border:'1px solid #000', padding:'6px'}}></td>
                    <td style={{border:'1px solid #000', padding:'6px'}}></td>
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
