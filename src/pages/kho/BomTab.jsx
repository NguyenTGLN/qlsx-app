import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase as db, fetchPageRows } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { invalidateBomProducts, getCatalogItems } from '../../lib/catalogCache';
import { Search, Loader2, RefreshCw, Trash2, Edit3, Download, Upload, X, Check, Printer, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { ColumnToggleModal, PageSizeSelect } from '../../components/WarehouseSharedUI';
import { validateManualBom, buildBomInserts } from '../../lib/bomManualEntry';

const BOM_COLS = ['thanh_pham','linh_kien','dvt','quantity'];
const BOM_LABELS = { thanh_pham:'Thành phẩm', linh_kien:'Linh kiện', dvt:'ĐVT', quantity:'Số lượng' };

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

// Ô chọn 1 mã hàng từ Danh mục hàng hóa — gõ để lọc gợi ý (theo mã + tên).
// Dropdown dùng position:fixed neo theo input để KHÔNG bị vùng cuộn của modal cắt cụt.
function CatalogItemPicker({ items, placeholder, onSelect, excludeCodes }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);

  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4, margin = 12;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    setPos({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight: Math.max(160, Math.min(320, spaceBelow)) });
  }, []);

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onMove = () => updatePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, updatePos]);

  const q = input.toLowerCase();
  const exclude = excludeCodes instanceof Set ? excludeCodes : new Set(excludeCodes || []);
  const results = (items || []).filter(it =>
    !exclude.has(it.item_code) && (
      (it.item_code || '').toLowerCase().includes(q) ||
      (it.item_name || '').toLowerCase().includes(q)
    )
  ).slice(0, 50);

  const pick = (it) => { onSelect(it); setInput(''); setOpen(false); };

  return (
    <div style={{ position:'relative', width:'100%' }} ref={wrapRef}>
      <div style={{ display:'flex', alignItems:'center', background:'#f8fafc', border:'1px solid #cbd5e1', borderRadius:6, padding:'6px 10px' }}>
        <Search size={15} color="#94a3b8" />
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ border:'none', outline:'none', background:'transparent', width:'100%', fontSize:'0.82rem', paddingLeft:8 }}
        />
      </div>
      {open && input && pos && (
        <div style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, background:'#fff', border:'1px solid #cbd5e1', borderRadius:6, maxHeight:pos.maxHeight, overflow:'auto', zIndex:200, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)' }}>
          {results.length === 0 ? (
            <div style={{ padding:10, fontSize:'0.8rem', color:'#64748b', textAlign:'center' }}>Không tìm thấy kết quả</div>
          ) : results.map((it, idx) => (
            <div
              key={idx}
              onClick={() => pick(it)}
              style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:'0.8rem' }}
              onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background=''}
            >
              <b>{it.item_code}</b> — {it.item_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BomTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  // const PAGE_SIZE = 50;
  const [pageSize, setPageSize] = usePersistedState('bom_pageSize', 50);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [sortCol, setSortCol] = useState('product_code');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('bom_hiddenCols', new Set());

  // In BOM một sản phẩm
  const [showPrintBom, setShowPrintBom] = useState(false);
  const [bomProducts, setBomProducts] = useState([]);
  const [bomProductsLoading, setBomProductsLoading] = useState(false);
  const [printBomQuery, setPrintBomQuery] = useState('');
  const [printBomProduct, setPrintBomProduct] = useState(null);
  const [printBomRows, setPrintBomRows] = useState([]);
  const [printBomLoading, setPrintBomLoading] = useState(false);
  const printBomReqRef = useRef(0); // chặn response cũ ghi đè khi đổi sản phẩm giữa chừng

  // Thêm BOM thủ công
  const [showAddBom, setShowAddBom] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [addProduct, setAddProduct] = useState(null); // {code, name}
  const [existingComps, setExistingComps] = useState(new Set());
  const [addLines, setAddLines] = useState([]); // [{key, component_code, component_name, unit, quantity}]
  const [addSaving, setAddSaving] = useState(false);
  const lineKeyRef = useRef(0);
  const addProductReqRef = useRef(0); // chặn response cũ ghi đè existingComps khi đổi SP giữa chừng

  // Reset page on search
  useEffect(() => { setPage(1); }, [searchText, pageSize]);

  const fetchBom = useCallback(async () => {
    setLoading(true);
    try {
      const makeQ = () => {
        let q = db.from('bom_items').select(`
          id,
          product_code,
          component_code,
          unit,
          quantity,
          product_name,
          inventory_items!bom_items_component_code_fkey ( item_name )
        `, { count: 'exact' });

        if (searchText.trim()) {
          // Giá trị là các mã đã chọn từ gợi ý → lọc chính xác tuyệt đối, không khớp gần đúng
          const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
          if (terms.length > 0) {
            const list = terms.map(t => `"${t}"`).join(',');
            q = q.or(`product_code.in.(${list}),component_code.in.(${list})`);
          }
        }

        if (sortCol === 'component_name') {
          q = q.order('item_name', { foreignTable: 'inventory_items', ascending: sortAsc });
        } else {
          q = q.order(sortCol, { ascending: sortAsc });
        }
        return q.order('id', { ascending: true }); // tie-break: các đợt không trùng/sót
      };

      // fetchPageRows: trang 5K/10K vượt trần 1000 dòng/request của PostgREST → gom từng đợt
      const from = (page - 1) * pageSize;
      const { data, count, error } = await fetchPageRows(makeQ, from, from + pageSize - 1);
      if (error) throw error;

      const formatted = data.map(r => ({
        ...r,
        component_name: r.inventory_items?.item_name || ''
      }));

      setTotalRows(count || 0);
      setRows(formatted);
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      alert('Lỗi tải BOM: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchText, sortCol, sortAsc, page, pageSize]);

  useEffect(() => { fetchBom(); }, [fetchBom]);

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const colLabel = {
    product_code: 'Mã TP',
    product_name: 'Tên SP',
    component_code: 'Mã LK',
    component_name: 'Tên LK',
    unit: 'ĐVT',
    quantity: 'Số lượng'
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
      const { error } = await db.from('bom_items').delete().in('id', Array.from(selectedKeys));
      if (error) throw error;
      invalidateBomProducts(); // picker thành phẩm ở Phiếu SX thấy thay đổi ngay
      fetchBom();
    } catch(e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleExport = async () => {
    let sourceRows;
    if (selectedKeys.size > 0) {
      // Có chọn dòng → chỉ xuất các dòng đã chọn
      sourceRows = rows.filter(r => selectedKeys.has(r.id));
    } else {
      // Không chọn dòng nào → xuất TOÀN BỘ BOM từ DB (phân trang để lấy hết, tránh giới hạn 1000 dòng của Supabase)
      try {
        let all = [];
        let from = 0;
        while (true) {
          let q = db.from('bom_items').select(`
            id, product_code, component_code, unit, quantity, product_name,
            inventory_items!bom_items_component_code_fkey ( item_name )
          `);
          if (searchText.trim()) {
            const terms = searchText.split(',').map(t => t.trim()).filter(Boolean);
            if (terms.length > 0) {
              const list = terms.map(t => `"${t}"`).join(',');
              q = q.or(`product_code.in.(${list}),component_code.in.(${list})`);
            }
          }
          if (sortCol === 'component_name') {
            q = q.order('item_name', { foreignTable: 'inventory_items', ascending: sortAsc });
          } else {
            q = q.order(sortCol, { ascending: sortAsc });
          }
          q = q.range(from, from + 999);
          const { data, error } = await q;
          if (error) throw error;
          all = all.concat((data || []).map(r => ({ ...r, component_name: r.inventory_items?.item_name || '' })));
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
    XLSX.utils.book_append_sheet(wb, ws, "BOM");
    XLSX.writeFile(wb, `BOM_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- In BOM một sản phẩm ---
  const openPrintBom = async () => {
    setShowPrintBom(true);
    setPrintBomProduct(null);
    setPrintBomRows([]);
    setPrintBomQuery('');
    // Luôn tải lại danh sách để không sót sản phẩm vừa import/sửa trong phiên
    setBomProductsLoading(true);
    try {
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await db.from('bom_items')
          .select('product_code, product_name')
          .order('product_code')
          .range(from, from + 999);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      const seen = new Map();
      all.forEach(r => { if (r.product_code && !seen.has(r.product_code)) seen.set(r.product_code, r.product_name || ''); });
      setBomProducts([...seen.entries()].map(([code, name]) => ({ code, name })));
    } catch (e) {
      alert('Lỗi tải danh sách sản phẩm: ' + e.message);
      setShowPrintBom(false);
    } finally {
      setBomProductsLoading(false);
    }
  };

  const selectPrintBomProduct = async (p) => {
    const reqId = ++printBomReqRef.current;
    setPrintBomProduct(p);
    setPrintBomRows([]);
    setPrintBomLoading(true);
    try {
      const { data, error } = await db.from('bom_items').select(`
        id, product_code, component_code, unit, quantity, product_name,
        inventory_items!bom_items_component_code_fkey ( item_name )
      `).eq('product_code', p.code).order('component_code');
      if (reqId !== printBomReqRef.current) return;
      if (error) throw error;
      setPrintBomRows((data || []).map(r => ({ ...r, component_name: r.inventory_items?.item_name || '' })));
    } catch (e) {
      if (reqId !== printBomReqRef.current) return;
      alert('Lỗi tải BOM: ' + e.message);
      setPrintBomProduct(null);
    } finally {
      if (reqId === printBomReqRef.current) setPrintBomLoading(false);
    }
  };

  const exportPrintBomExcel = () => {
    if (!printBomProduct || printBomRows.length === 0) return;
    const aoa = [
      ['BẢNG ĐỊNH MỨC NGUYÊN VẬT LIỆU (BOM)'],
      [],
      ['Mã sản phẩm:', printBomProduct.code],
      ['Tên sản phẩm:', printBomProduct.name],
      ['Ngày xuất:', new Date().toLocaleDateString('vi-VN')],
      ['Số linh kiện:', printBomRows.length],
      [],
      ['STT', 'Mã linh kiện', 'Tên linh kiện', 'ĐVT', 'Số lượng'],
      ...printBomRows.map((r, i) => [i + 1, r.component_code, r.component_name, r.unit, r.quantity]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 45 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    XLSX.writeFile(wb, `BOM_${printBomProduct.code}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleSaveEdit = async (updatedRow) => {
    try {
      const payload = {
        product_code: updatedRow.product_code,
        component_code: updatedRow.component_code,
        product_name: updatedRow.product_name,
        unit: updatedRow.unit,
        quantity: parseFloat(updatedRow.quantity)
      };
      const { error } = await db.from('bom_items').update(payload).eq('id', updatedRow.id);
      if (error) throw error;
      invalidateBomProducts();
      setEditRow(null);
      fetchBom();
    } catch(e) { alert('Lỗi cập nhật: ' + e.message); }
  };

  const handleDownloadTemplate = () => {
    const cols = ['product_code', 'product_name', 'component_code', 'unit', 'quantity'];
    const ws = XLSX.utils.json_to_sheet([cols.reduce((acc, c) => ({...acc, [c]: ''}), {})], {header: cols});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_BOM.xlsx");
  };

  const executeImport = async () => {
    if (!importFile) return alert('Vui lòng chọn file');
    setImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, {type: 'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws);

          const inserts = data.map(r => ({
            product_code: r['product_code'] ? String(r['product_code']).trim() : '',
            product_name: r['product_name'] ? String(r['product_name']).trim() : '',
            component_code: r['component_code'] ? String(r['component_code']).trim() : '',
            unit: r['unit'] ? String(r['unit']).trim() : '',
            quantity: parseFloat(r['quantity'] || 0)
          })).filter(r => r.product_code && r.component_code);

          if (inserts.length === 0) throw new Error('Không có dữ liệu hợp lệ');

          // 1. Kiểm tra số lượng hợp lệ (phải khác 0)
          const invalidQtys = [];
          data.forEach((r, idx) => {
            const q = parseFloat(r['quantity']);
            if (isNaN(q) || q === 0) {
              invalidQtys.push({ line: idx + 2, prod: r['product_code'], comp: r['component_code'], qty: r['quantity'] });
            }
          });

          if (invalidQtys.length > 0) {
            let msg = `Lỗi: Có ${invalidQtys.length} dòng có Số lượng (quantity) không hợp lệ (phải khác 0):\n`;
            invalidQtys.slice(0, 10).forEach(x => {
              msg += `- Dòng ${x.line}: Thành phẩm '${x.prod}', Linh kiện '${x.comp}', Số lượng: '${x.qty}'\n`;
            });
            if (invalidQtys.length > 10) msg += `... và ${invalidQtys.length - 10} dòng khác.\n`;
            msg += '\nVui lòng sửa lại số lượng trong file Excel trước khi import.';
            alert(msg);
            setImporting(false);
            return;
          }

          // 2. Lấy toàn bộ mã hàng hiện có trong danh mục để đối chiếu (sử dụng phân trang để tránh giới hạn 1000 dòng của Supabase)
          let dbItems = [];
          let from = 0;
          while (true) {
            const { data: batch, error: dbError } = await db
              .from('inventory_items')
              .select('item_code')
              .range(from, from + 999);
              
            if (dbError) throw new Error('Không thể lấy danh mục hàng hóa: ' + dbError.message);
            dbItems = dbItems.concat(batch);
            if (batch.length < 1000) break;
            from += 1000;
          }

          const existingCodes = new Set(dbItems.map(item => item.item_code));

          // Hỗ trợ không phân biệt chữ hoa/thường: Tự động sửa lại case cho khớp với DB
          const lowerCaseMap = new Map();
          dbItems.forEach(item => {
            lowerCaseMap.set(item.item_code.toLowerCase(), item.item_code);
          });

          inserts.forEach(r => {
            const prodLower = r.product_code.toLowerCase();
            const compLower = r.component_code.toLowerCase();
            
            if (lowerCaseMap.has(prodLower)) {
              r.product_code = lowerCaseMap.get(prodLower);
            }
            if (lowerCaseMap.has(compLower)) {
              r.component_code = lowerCaseMap.get(compLower);
            }
          });

          // 3. Kiểm tra mã thành phẩm và mã linh kiện chưa tồn tại
          const missingProds = new Set();
          const missingComps = new Set();

          inserts.forEach(r => {
            if (!existingCodes.has(r.product_code)) missingProds.add(r.product_code);
            if (!existingCodes.has(r.component_code)) missingComps.add(r.component_code);
          });

          if (missingProds.size > 0 || missingComps.size > 0) {
            let msg = 'Lỗi: Phát hiện mã chưa có trong Danh mục hàng hóa!\n\n';
            if (missingProds.size > 0) {
              msg += `❌ ${missingProds.size} Mã thành phẩm thiếu:\n`;
              msg += `  ${Array.from(missingProds).slice(0, 15).join(', ')}`;
              if (missingProds.size > 15) msg += '...';
              msg += '\n\n';
            }
            if (missingComps.size > 0) {
              msg += `❌ ${missingComps.size} Mã linh kiện thiếu:\n`;
              msg += `  ${Array.from(missingComps).slice(0, 15).join(', ')}`;
              if (missingComps.size > 15) msg += '...';
              msg += '\n\n';
            }
            msg += '👉 Cách xử lý: Vui lòng thêm các mã hàng trên vào Tab "Danh mục hàng hóa" trước khi import BOM.';
            alert(msg);
            setImporting(false);
            return;
          }
          
          const BATCH = 500;
          for (let i = 0; i < inserts.length; i += BATCH) {
            const { error } = await db.from('bom_items').insert(inserts.slice(i, i + BATCH));
            if (error) throw error;
          }
          
          invalidateBomProducts();
          alert('Nhập dữ liệu thành công!');
          setShowImport(false);
          setImportFile(null);
          fetchBom();
    } catch (e) {
      alert('Lỗi xử lý file: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  // --- Thêm BOM thủ công ---
  const newBomLine = () => ({ key: ++lineKeyRef.current, component_code: '', component_name: '', unit: '', quantity: '' });

  const openAddBom = async () => {
    addProductReqRef.current++;
    setAddProduct(null);
    setExistingComps(new Set());
    setAddLines([newBomLine()]);
    setShowAddBom(true);
    try {
      const items = await getCatalogItems();
      setCatalogItems(items || []);
    } catch (e) {
      alert('Lỗi tải danh mục hàng hóa: ' + e.message);
    }
  };

  const pickAddProduct = async (it) => {
    const reqId = ++addProductReqRef.current;
    const product = { code: it.item_code, name: it.item_name || '' };
    setAddProduct(product);
    setExistingComps(new Set()); // reset ngay, tránh giữ set của SP cũ trong lúc tải
    try {
      const { data, error } = await db.from('bom_items').select('component_code').eq('product_code', product.code);
      if (reqId !== addProductReqRef.current) return; // SP đã đổi giữa chừng → bỏ response cũ
      if (error) throw error;
      setExistingComps(new Set((data || []).map(r => r.component_code)));
    } catch (e) {
      if (reqId !== addProductReqRef.current) return;
      setExistingComps(new Set());
      console.warn('Không tải được BOM sẵn có:', e.message);
    }
  };

  const clearAddProduct = () => { addProductReqRef.current++; setAddProduct(null); setExistingComps(new Set()); };

  const setBomLine = (key, patch) => setAddLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));
  const removeBomLine = (key) => setAddLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls));
  const addBomLine = () => setAddLines(ls => [...ls, newBomLine()]);
  const pickComponent = (key, it) => setBomLine(key, {
    component_code: it.item_code,
    component_name: it.item_name || '',
    unit: it.unit || '',
  });

  const saveAddBom = async () => {
    const v = validateManualBom(addProduct, addLines, existingComps);
    if (!v.ok) { alert(v.error); return; }
    const { inserts, skipped } = buildBomInserts(addProduct, addLines, existingComps);
    if (inserts.length === 0) { alert('Tất cả linh kiện đã có sẵn cho sản phẩm này.'); return; }
    setAddSaving(true);
    try {
      const { error } = await db.from('bom_items').insert(inserts);
      if (error) throw error;
      invalidateBomProducts();
      const code = addProduct.code;
      setShowAddBom(false);
      setAddProduct(null);
      setAddLines([]);
      setExistingComps(new Set());
      let msg = `Đã thêm ${inserts.length} linh kiện cho ${code}.`;
      if (skipped > 0) msg += `\nBỏ qua ${skipped} linh kiện trùng (đã có sẵn).`;
      alert(msg);
      fetchBom();
    } catch (e) {
      alert('Lỗi thêm BOM: ' + e.message);
    } finally {
      setAddSaving(false);
    }
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = BOM_COLS.filter(c => vis(c)).length + 2;

  // Gợi ý sản phẩm cho modal In BOM (gõ để tìm → hiện nhiều; chọn 1 mã → in chính xác mã đó)
  const printBomMatches = (() => {
    if (!showPrintBom || printBomProduct) return [];
    const q = printBomQuery.trim().toLowerCase();
    const list = q
      ? bomProducts.filter(p => p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q))
      : bomProducts;
    return list.slice(0, 100);
  })();

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      <div className="mobile-toolbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
        <div style={{minWidth:120, flexShrink:0, flex:1}}>
          <SearchAutoSuggest
            tableName="bom_items"
            searchColumns={['product_code','component_code']}
            displayColumn="product_code"
            placeholder="Tìm mã TP, LK..."
            value={searchText}
            onChange={v => setSearchText(v)}
          />
        </div>
        <ColumnToggleModal columns={BOM_COLS} labels={BOM_LABELS} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải BOM...</p>
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
                    {vis('thanh_pham') && <th onClick={()=>handleSort('product_code')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='product_code'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='product_code'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Thành phẩm{sortCol==='product_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('linh_kien') && <th onClick={()=>handleSort('component_code')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='component_code'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='component_code'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>Linh kiện{sortCol==='component_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('dvt') && <th onClick={()=>handleSort('unit')} style={{padding:'0.4rem 0.3rem',fontSize:'0.7rem',fontWeight:700,color:sortCol==='unit'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='unit'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>ĐVT{sortCol==='unit'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('quantity') && <th onClick={()=>handleSort('quantity')} style={{padding:'0.4rem 0.3rem',textAlign:'right',fontSize:'0.7rem',fontWeight:700,color:sortCol==='quantity'?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol==='quantity'?'#0891b2':'#e2e8f0'}`,cursor:'pointer',whiteSpace:'nowrap'}}>SL{sortCol==='quantity'?(sortAsc?' ↑':' ↓'):''}</th>}
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
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.65rem',fontWeight:600}}>{(page-1)*pageSize + ri + 1}</td>
                      {vis('thanh_pham') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:700,color:'#0891b2'}}>{row.product_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.product_name}</div>
                      </td>}
                      {vis('linh_kien') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:600,color:'#334155'}}>{row.component_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.component_name}</div>
                      </td>}
                      {vis('dvt') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',textAlign:'center'}}>{row.unit}</td>}
                      {vis('quantity') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',color:'#1d4ed8',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{row.quantity}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
            {/* Pagination */}
            {!loading && totalRows > 0 && (
              <div className="mobile-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    <strong style={{color:'#334155'}}>{totalRows}</strong> dòng
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
                    {page} / {Math.ceil(totalRows/pageSize)}
                  </span>
                  <button 
                    disabled={page >= Math.ceil(totalRows/pageSize)} 
                    onClick={() => setPage(p => p + 1)}
                    style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.6rem', border: '1px solid #cbd5e1', background: page >= Math.ceil(totalRows/pageSize) ? '#f1f5f9' : '#fff', color: page >= Math.ceil(totalRows/pageSize) ? '#94a3b8' : '#0f172a', borderRadius: '7px', cursor: page >= Math.ceil(totalRows/pageSize) ? 'not-allowed' : 'pointer', fontSize:'0.75rem', fontWeight:600 }}
                  >
                    Sau
                  </button>
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
            <button onClick={handleExport} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#10b981',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Download size={14}/>Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={()=>setEditRow(rows.find(r=>r.id===Array.from(selectedKeys)[0]))} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#f59e0b',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,flexShrink:0}}><Edit3 size={14}/>Sửa</button>
            )}
            {perms.delete && <button onClick={handleDelete} style={{display:'flex',alignItems:'center',gap:5,padding:'0.4rem 0.75rem',borderRadius:7,border:'none',background:'#ef4444',color:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,marginLeft:'auto',flexShrink:0}}><Trash2 size={14}/>Xóa</button>}
          </>
        ) : (
          <>
            <button onClick={fetchBom} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
              <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
            </button>
            {perms.io && <button onClick={()=>setShowImport(true)} style={{...s.btn, background:'#e0f2fe', color:'#0369a1', border:'none', padding:'0.4rem 0.75rem', flexShrink:0}}>
              <Upload size={14}/> Nhập Excel
            </button>}
            <button onClick={openPrintBom} style={{...s.btn, background:'#ede9fe', color:'#6d28d9', border:'none', padding:'0.4rem 0.75rem', flexShrink:0}}>
              <Printer size={14}/> In BOM
            </button>
            {perms.create && <button onClick={openAddBom} style={{...s.btn, background:'#dcfce7', color:'#15803d', border:'none', padding:'0.4rem 0.75rem', flexShrink:0}}>
              <Plus size={14}/> Thêm BOM
            </button>}
            <button onClick={handleExport} disabled={loading} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
          </>
        )}
      </div>

      {/* Modals */}
      {editRow && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
            <h3 style={{marginTop:0,marginBottom:15}}>Sửa BOM</h3>
            {['product_code', 'product_name', 'component_code', 'unit', 'quantity'].map(k => (
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

      {/* Modal In BOM — bước 1: chọn sản phẩm */}
      {showPrintBom && !printBomProduct && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:440,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)',display:'flex',flexDirection:'column',maxHeight:'80vh'}}>
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0,fontSize:'1rem',display:'flex',alignItems:'center',gap:8}}><Printer size={18} color="#7c3aed"/> In BOM — Chọn sản phẩm</h3>
              <button onClick={()=>setShowPrintBom(false)} style={{border:'none',background:'none',cursor:'pointer',color:'#94a3b8',padding:4}}><X size={18}/></button>
            </div>
            <div style={{padding:'0.75rem 1.25rem',borderBottom:'1px solid #f1f5f9'}}>
              <input
                value={printBomQuery}
                onChange={e=>setPrintBomQuery(e.target.value)}
                placeholder="Gõ mã hoặc tên sản phẩm..."
                autoFocus
                style={{...s.input,width:'100%',boxSizing:'border-box'}}
              />
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'0.4rem 0.5rem',minHeight:120}}>
              {bomProductsLoading ? (
                <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.8rem',padding:16}}>Đang tải danh sách sản phẩm...</p>
              ) : bomProducts.length===0 ? (
                <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.8rem',padding:16}}>Chưa có dữ liệu BOM.</p>
              ) : printBomMatches.length===0 ? (
                <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.8rem',padding:16}}>Không tìm thấy "{printBomQuery}"</p>
              ) : printBomMatches.map(p => (
                <div
                  key={p.code}
                  onClick={()=>selectPrintBomProduct(p)}
                  style={{padding:'0.45rem 0.75rem',cursor:'pointer',borderRadius:8}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f1f5f9')}
                  onMouseLeave={e=>(e.currentTarget.style.background='')}
                >
                  <div style={{fontWeight:700,color:'#0891b2',fontSize:'0.8rem'}}>{p.code}</div>
                  {p.name && <div style={{fontSize:'0.72rem',color:'#64748b',fontStyle:'italic'}}>{p.name}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal In BOM — bước 2: xem trước, in hoặc xuất Excel */}
      {showPrintBom && printBomProduct && (
        <div id="bom-print-overlay" style={{position:'fixed',inset:0,background:'#fff',zIndex:9999,display:'flex',flexDirection:'column'}}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #bom-print-overlay, #bom-print-overlay * { visibility: visible; }
              #bom-print-overlay {
                position: absolute !important;
                left: 0; top: 0; width: 100%;
                display: block !important;
                height: auto !important;
                overflow: visible !important;
              }
              #bom-print-section {
                position: static !important;
                display: block !important;
                height: auto !important;
                overflow: visible !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .no-print { display: none !important; }
              table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              thead { display: table-header-group; }
            }
          `}</style>

          <div className="no-print" style={{padding:'0.75rem 1.5rem',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc',flexWrap:'wrap',gap:8}}>
            <h2 style={{margin:0,fontSize:'1.05rem',color:'#0f172a',display:'flex',alignItems:'center',gap:8}}>
              <Printer size={20} color="#7c3aed"/> In BOM: {printBomProduct.code}
            </h2>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>{printBomReqRef.current++;setPrintBomProduct(null);setPrintBomRows([]);setPrintBomLoading(false);}} style={{...s.btn,fontSize:'0.82rem',padding:'0.45rem 0.9rem'}}>Chọn SP khác</button>
              <button onClick={exportPrintBomExcel} disabled={printBomLoading||printBomRows.length===0} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.45rem 0.9rem',fontSize:'0.82rem',opacity:(printBomLoading||printBomRows.length===0)?0.5:1}}><Download size={15}/> Xuất Excel</button>
              <button onClick={()=>window.print()} disabled={printBomLoading||printBomRows.length===0} style={{...s.btn,background:'#7c3aed',color:'#fff',border:'none',padding:'0.45rem 0.9rem',fontSize:'0.82rem',opacity:(printBomLoading||printBomRows.length===0)?0.5:1}}><Printer size={15}/> In ngay</button>
              <button onClick={()=>{printBomReqRef.current++;setShowPrintBom(false);}} style={{...s.btn,fontSize:'0.82rem',padding:'0.45rem 0.9rem'}}><X size={15}/> Đóng</button>
            </div>
          </div>

          <div id="bom-print-section" style={{flex:1,padding:'2rem',overflowY:'auto',background:'#fff',color:'#000',fontFamily:'Times New Roman, serif'}}>
            {printBomLoading ? (
              <p style={{textAlign:'center',color:'#94a3b8'}}>Đang tải BOM...</p>
            ) : printBomRows.length === 0 ? (
              <p style={{textAlign:'center',color:'#94a3b8'}}>Sản phẩm này chưa có BOM.</p>
            ) : (
              <>
                <h1 style={{textAlign:'center',textTransform:'uppercase',marginBottom:5,fontSize:'16pt'}}>Bảng Định Mức Nguyên Vật Liệu (BOM)</h1>
                <p style={{textAlign:'center',marginBottom:20,fontSize:'11pt',color:'#333'}}>Ngày in: {new Date().toLocaleDateString('vi-VN')}</p>
                <div style={{fontSize:'12pt',marginBottom:14,lineHeight:1.7}}>
                  <div><strong>Mã sản phẩm:</strong> {printBomProduct.code}</div>
                  <div><strong>Tên sản phẩm:</strong> {printBomProduct.name}</div>
                  <div><strong>Số linh kiện:</strong> {printBomRows.length}</div>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11pt'}}>
                  <thead>
                    <tr>
                      <th style={{border:'1px solid #000',padding:'6px',textAlign:'center',width:40}}>STT</th>
                      <th style={{border:'1px solid #000',padding:'6px',textAlign:'left',width:150}}>Mã linh kiện</th>
                      <th style={{border:'1px solid #000',padding:'6px',textAlign:'left'}}>Tên linh kiện</th>
                      <th style={{border:'1px solid #000',padding:'6px',textAlign:'center',width:60}}>ĐVT</th>
                      <th style={{border:'1px solid #000',padding:'6px',textAlign:'right',width:80}}>Số lượng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printBomRows.map((r,i)=>(
                      <tr key={r.id}>
                        <td style={{border:'1px solid #000',padding:'6px',textAlign:'center'}}>{i+1}</td>
                        <td style={{border:'1px solid #000',padding:'6px'}}>{r.component_code}</td>
                        <td style={{border:'1px solid #000',padding:'6px'}}>{r.component_name}</td>
                        <td style={{border:'1px solid #000',padding:'6px',textAlign:'center'}}>{r.unit}</td>
                        <td style={{border:'1px solid #000',padding:'6px',textAlign:'right'}}>{r.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
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

      {/* Modal: Thêm BOM thủ công */}
      {showAddBom && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:560,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)',display:'flex',flexDirection:'column',maxHeight:'88vh'}}>
            {/* Header */}
            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0,fontSize:'1rem',display:'flex',alignItems:'center',gap:8}}><Plus size={18} color="#15803d"/> Thêm BOM thủ công</h3>
              <button onClick={()=>setShowAddBom(false)} disabled={addSaving} style={{border:'none',background:'none',cursor:addSaving?'not-allowed':'pointer',color:'#94a3b8',padding:4,opacity:addSaving?0.5:1}}><X size={18}/></button>
            </div>

            {/* Body */}
            <div style={{padding:'1rem 1.25rem',overflowY:'auto',flex:1}}>
              {/* Chọn thành phẩm */}
              <label style={{display:'block',fontSize:'0.75rem',fontWeight:700,color:'#64748b',marginBottom:6}}>Mã thành phẩm</label>
              {addProduct ? (
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 10px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:'#15803d',fontSize:'0.85rem'}}>{addProduct.code}</div>
                    {addProduct.name && <div style={{fontSize:'0.72rem',color:'#64748b',fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{addProduct.name}</div>}
                  </div>
                  <button onClick={clearAddProduct} title="Đổi thành phẩm" style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',display:'flex',padding:2}}><X size={16}/></button>
                </div>
              ) : (
                <CatalogItemPicker items={catalogItems} placeholder="Gõ mã hoặc tên thành phẩm..." onSelect={pickAddProduct} />
              )}

              {/* Cảnh báo đã có BOM */}
              {addProduct && existingComps.size > 0 && (
                <div style={{marginTop:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 10px',fontSize:'0.75rem',color:'#92400e'}}>
                  Sản phẩm này đã có BOM với <b>{existingComps.size}</b> linh kiện — các mã trùng sẽ được bỏ qua khi lưu.
                </div>
              )}

              {/* Danh sách linh kiện */}
              <div style={{marginTop:16,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <label style={{fontSize:'0.75rem',fontWeight:700,color:'#64748b'}}>Linh kiện</label>
                <button onClick={addBomLine} style={{...s.btn,padding:'0.25rem 0.6rem',fontSize:'0.72rem',color:'#15803d',borderColor:'#bbf7d0'}}><Plus size={13}/> Thêm linh kiện</button>
              </div>

              {addLines.map((line, li) => {
                const chosenOthers = new Set(addLines.filter(l => l.key !== line.key).map(l => l.component_code).filter(Boolean));
                const isExisting = line.component_code && existingComps.has(line.component_code);
                return (
                  <div key={line.key} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 10px',marginBottom:8,background:'#fff'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                      <span style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:700,width:18,flexShrink:0}}>{li + 1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        {line.component_code ? (
                          <div style={{display:'flex',alignItems:'center',gap:8,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'6px 10px'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,color:'#334155',fontSize:'0.82rem'}}>{line.component_code}</div>
                              {line.component_name && <div style={{fontSize:'0.7rem',color:'#64748b',fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{line.component_name}</div>}
                            </div>
                            <button onClick={()=>setBomLine(line.key,{component_code:'',component_name:'',unit:''})} title="Đổi linh kiện" style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',display:'flex',padding:2}}><X size={15}/></button>
                          </div>
                        ) : (
                          <CatalogItemPicker items={catalogItems} placeholder="Gõ mã hoặc tên linh kiện..." excludeCodes={chosenOthers} onSelect={(it)=>pickComponent(line.key, it)} />
                        )}
                      </div>
                      <button onClick={()=>removeBomLine(line.key)} disabled={addLines.length<=1} title="Xóa dòng" style={{background:'none',border:'none',cursor:addLines.length<=1?'not-allowed':'pointer',color:addLines.length<=1?'#e2e8f0':'#ef4444',display:'flex',padding:2,flexShrink:0}}><Trash2 size={16}/></button>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',paddingLeft:26}}>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span style={{fontSize:'0.65rem',color:'#94a3b8',fontWeight:600}}>ĐVT</span>
                        <input value={line.unit} onChange={e=>setBomLine(line.key,{unit:e.target.value})} placeholder="ĐVT" disabled={isExisting} style={{...s.input,width:80,opacity:isExisting?0.5:1}} />
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span style={{fontSize:'0.65rem',color:'#94a3b8',fontWeight:600}}>Số lượng</span>
                        <input type="number" value={line.quantity} onChange={e=>setBomLine(line.key,{quantity:e.target.value})} placeholder="SL" disabled={isExisting} style={{...s.input,width:100,opacity:isExisting?0.5:1}} />
                      </div>
                      {isExisting && <span style={{fontSize:'0.7rem',color:'#dc2626',fontWeight:600,alignSelf:'flex-end',paddingBottom:6}}>đã có — sẽ bỏ qua</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{padding:'0.75rem 1.25rem',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'flex-end',gap:10,background:'#f8fafc'}}>
              <button onClick={()=>setShowAddBom(false)} disabled={addSaving} style={{...s.btn,opacity:addSaving?0.5:1}}>Hủy</button>
              <button onClick={saveAddBom} disabled={addSaving} style={{...s.btn,background:'#16a34a',color:'#fff',border:'none',opacity:addSaving?0.6:1}}>
                {addSaving ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Check size={14}/>} Lưu BOM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
