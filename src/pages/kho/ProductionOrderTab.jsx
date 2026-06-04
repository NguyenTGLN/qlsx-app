import React, { useState, useEffect, useRef } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Play, Printer, AlertCircle, CheckCircle, Package, Upload, Check, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.5rem 1rem',borderRadius:7,border:'none',background:'#0891b2',cursor:'pointer',fontSize:'0.85rem',fontWeight:600,color:'#fff',transition:'all 0.15s' },
  btnDisabled: { background:'#cbd5e1', cursor:'not-allowed' },
  input: { padding:'0.45rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.85rem',outline:'none',background:'#f8fafc',color:'#334155',width:'100%' },
  label: { display:'block', fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:5 },
};

const removeTones = (str) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

const SearchableSelect = ({ options, value, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOpt = options.find(o => o.value === value);
  const displayVal = selectedOpt ? `${selectedOpt.value} - ${selectedOpt.label}` : '';

  const searchSafe = removeTones(search);
  const filtered = options.filter(o => 
    removeTones(o.value).includes(searchSafe) || 
    removeTones(o.label).includes(searchSafe)
  );

  const handleKeyDown = (e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < filtered.length) {
        onChange(filtered[focusedIndex].value);
        setIsOpen(false);
      } else if (filtered.length === 1) {
        onChange(filtered[0].value);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={ref} style={{position:'relative', width:'100%'}}>
      <input 
        style={s.input} 
        placeholder={placeholder} 
        value={isOpen ? search : displayVal} 
        onChange={e => { setSearch(e.target.value); setIsOpen(true); setFocusedIndex(-1); }}
        onClick={() => { setIsOpen(true); setSearch(''); setFocusedIndex(-1); }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:7, maxHeight:250, overflowY:'auto', zIndex:50, boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1)'}}>
          {filtered.map((o, idx) => (
            <div 
              key={o.value} 
              style={{
                padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:'0.8rem', color:'#334155',
                background: focusedIndex === idx ? '#e0f2fe' : 'transparent'
              }}
              onMouseEnter={() => setFocusedIndex(idx)}
              onMouseLeave={() => setFocusedIndex(-1)}
              onClick={() => { onChange(o.value); setIsOpen(false); }}
            >
              <strong>{o.value}</strong> - {o.label}
            </div>
          ))}
          {filtered.length === 0 && <div style={{padding:'8px 12px', color:'#94a3b8', fontSize:'0.8rem'}}>Không tìm thấy</div>}
        </div>
      )}
    </div>
  );
};

// Popup "Sửa phân bổ": cho phép sửa tay vị trí & SL lấy của 1 linh kiện,
// tách 1 mã ra nhiều vị trí. Chỉ chọn được vị trí có tồn thật (từ poolRows).
const EditAllocationModal = ({ comp, poolRows, onSave, onClose }) => {
  const rows = (poolRows || []).filter(p => p.quantity > 0);
  const [lines, setLines] = useState(
    (comp.allocations || []).map(a => ({ location: a.location, taken: String(a.taken) }))
  );

  const findRow = (loc) => rows.find(r => r.location === loc);

  const lineInfo = lines.map(l => {
    const row = findRow(l.location);
    const before = row ? row.quantity : null;
    const takenNum = parseFloat(l.taken);
    const takenValid = !isNaN(takenNum) && takenNum > 0;
    const overStock = !!row && takenValid && takenNum > before;
    const noRow = l.location ? !row : false;
    return { ...l, row, before, takenNum, takenValid, overStock, noRow };
  });

  const dupLocations = (() => {
    const seen = {};
    lines.forEach(l => { if (l.location) seen[l.location] = (seen[l.location] || 0) + 1; });
    return Object.keys(seen).filter(k => seen[k] > 1);
  })();

  const total = lineInfo.reduce((sum, li) => sum + (li.takenValid ? li.takenNum : 0), 0);
  const required = comp.requiredQty;
  const totalOk = Math.abs(total - required) < 1e-9;

  const everyLineValid = lineInfo.length > 0 && lineInfo.every(li =>
    li.location && li.row && li.takenValid && !li.overStock
  );
  const canSave = everyLineValid && dupLocations.length === 0 && totalOk;

  const updateLine = (idx, patch) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, { location: '', taken: '' }]);
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    const newAllocations = lineInfo.map(li => ({
      stock_id: li.row.id,
      location: li.location,
      before: li.row.quantity,
      taken: li.takenNum,
      remaining: li.row.quantity - li.takenNum
    }));
    onSave(newAllocations);
  };

  const locOptions = rows.map(r => ({ value: r.location, label: `Tồn: ${r.quantity}` }));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'#fff', padding:'1.5rem', borderRadius:16, maxWidth:560, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 0.25rem 0', fontSize:'1.1rem', color:'#0f172a', fontWeight:800 }}>Sửa phân bổ vị trí lấy</h3>
        <p style={{ margin:'0 0 1rem 0', fontSize:'0.85rem', color:'#475569' }}>
          <strong>{comp.code}</strong> — {comp.name} · SL Cần: <strong>{required}</strong>
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {lineInfo.map((li, idx) => (
            <div key={idx} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
              <div style={{ flex:1 }}>
                <SearchableSelect
                  options={locOptions}
                  value={li.location}
                  onChange={(v) => updateLine(idx, { location: v })}
                  placeholder="-- Chọn / gõ vị trí --"
                />
                {li.noRow && <div style={{ fontSize:'0.7rem', color:'#dc2626', marginTop:2 }}>Vị trí không có tồn mã này</div>}
              </div>
              <div style={{ width:120 }}>
                <input
                  type="number" min="0" step="any"
                  value={li.taken}
                  onChange={(e) => updateLine(idx, { taken: e.target.value })}
                  placeholder="SL lấy"
                  style={{ ...s.input, borderColor: (li.overStock || (li.taken !== '' && !li.takenValid)) ? '#fca5a5' : '#e2e8f0' }}
                />
                {li.row && <div style={{ fontSize:'0.7rem', color: li.overStock ? '#dc2626' : '#94a3b8', marginTop:2 }}>Tồn: {li.before}{li.overStock ? ' (vượt!)' : ''}</div>}
              </div>
              <button onClick={() => removeLine(idx)} title="Xoá dòng" style={{ border:'none', background:'#fef2f2', color:'#dc2626', borderRadius:7, width:34, height:34, cursor:'pointer', fontWeight:700, flexShrink:0 }}>✕</button>
            </div>
          ))}
          {lineInfo.length === 0 && <div style={{ fontSize:'0.8rem', color:'#94a3b8', padding:'0.5rem 0' }}>Chưa có dòng nào. Bấm "+ Thêm vị trí".</div>}
        </div>

        <button onClick={addLine} style={{ marginTop:10, ...s.btn, background:'#f1f5f9', color:'#0891b2', border:'1px dashed #94a3b8' }}>
          + Thêm vị trí
        </button>

        <div style={{ marginTop:14, padding:'0.6rem 0.8rem', borderRadius:8, background: totalOk ? '#f0fdf4' : '#fef2f2', border:`1px solid ${totalOk ? '#bbf7d0' : '#fecaca'}`, fontSize:'0.85rem' }}>
          <div style={{ color: totalOk ? '#16a34a' : '#dc2626', fontWeight:700 }}>
            Tổng đã lấy: {total} / {required} {totalOk ? '✓' : '(phải bằng SL Cần)'}
          </div>
          {dupLocations.length > 0 && <div style={{ color:'#dc2626', marginTop:4 }}>Trùng vị trí: {dupLocations.join(', ')}</div>}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:18 }}>
          <button onClick={onClose} style={{ padding:'0.55rem 1.1rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>Huỷ</button>
          <button onClick={handleSave} disabled={!canSave} style={{ padding:'0.55rem 1.1rem', borderRadius:8, border:'none', background: canSave ? '#10b981' : '#cbd5e1', color:'#fff', fontWeight:700, cursor: canSave ? 'pointer' : 'not-allowed' }}>Lưu phân bổ</button>
        </div>
      </div>
    </div>
  );
};

export default function ProductionOrderTab({ sxPrefill, onSxConsumed, perms = { view: true, create: true, edit: true, delete: true, io: true } } = {}) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const fileInputRef = useRef(null);
  
  // Form State (Persist across tab switch)
  const [selectedProduct, setSelectedProduct] = useState(() => localStorage.getItem('prod_selectedProduct') || '');
  const [quantity, setQuantity] = useState(() => Number(localStorage.getItem('prod_quantity')) || 1);
  const [prodDate, setProdDate] = useState(() => localStorage.getItem('prod_date') || todayLocal());
  const [notes, setNotes] = useState(() => localStorage.getItem('prod_notes') || '');
  const [priorityVTSX, setPriorityVTSX] = useState(() => localStorage.getItem('prod_priorityVTSX') === 'true');

  // Result State — always start with card grid (allocations=null)
  const [allocations, setAllocations] = useState(null);
  const [orderCode, setOrderCode] = useState(() => localStorage.getItem('prod_orderCode') || '');
  const [isShortage, setIsShortage] = useState(() => localStorage.getItem('prod_isShortage') === 'true');
  const [orderCreated, setOrderCreated] = useState(() => localStorage.getItem('prod_orderCreated') === 'true');
  const [isProcessing, setIsProcessing] = useState(false);

  // New States for Delivery Mode & Manual Export
  const [mode, setMode] = useState(() => localStorage.getItem('prod_mode') || 'production'); // 'production' | 'delivery' | 'manual_export'
  const [orderItems, setOrderItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_orderItems')) || []; } catch { return []; }
  });
  const [selectedShortageOrders, setSelectedShortageOrders] = useState(new Set());

  // Nhận prefill từ DKSX (nút "Làm phiếu SX") → điền sẵn mã + SL, mode sản xuất
  useEffect(() => {
    if (!sxPrefill) return;
    setMode('production');
    setSelectedProduct(sxPrefill.item_code || '');
    if (sxPrefill.qty) setQuantity(Number(sxPrefill.qty));
    if (onSxConsumed) onSxConsumed();
    // onSxConsumed cố tình bỏ khỏi deps: chỉ chạy khi sxPrefill đổi, tránh vòng lặp khi parent truyền hàm inline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sxPrefill]);

  // States for duplicate check
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateOrders, setDuplicateOrders] = useState([]);
  const [pendingParsedItems, setPendingParsedItems] = useState([]);
  
  // States for Manual Export Modal
  const [showManualExportModal, setShowManualExportModal] = useState(false);
  const [manualProduct, setManualProduct] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualReason, setManualReason] = useState('XDG'); // 'XDG' (Đóng gói) | 'XBS' (Bổ sung)
  const [manualOrderRef, setManualOrderRef] = useState('');
  const [recentOrders, setRecentOrders] = useState([]);
  const [stockItems, setStockItems] = useState([]);

  // States for Disassemble Modal
  const [showDisassembleModal, setShowDisassembleModal] = useState(false);
  const [disProduct, setDisProduct] = useState('');
  const [disQty, setDisQty] = useState('');
  const [disLocations, setDisLocations] = useState([]); // Array of {location, quantity}
  const [selectedDisLocation, setSelectedDisLocation] = useState('');
  const [generatedComponents, setGeneratedComponents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_generatedComponents')) || []; } catch { return []; }
  });

  // Tồn kho gốc (theo item_code) tại thời điểm tính toán — dùng cho popup Sửa phân bổ
  const [stockPool, setStockPool] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_stockPool')) || {}; } catch { return {}; }
  });
  // Chỉ số linh kiện đang mở popup sửa phân bổ (null = không mở)
  const [editingCompIdx, setEditingCompIdx] = useState(null);

  useEffect(() => {
    localStorage.setItem('prod_selectedProduct', selectedProduct);
    localStorage.setItem('prod_quantity', quantity);
    localStorage.setItem('prod_date', prodDate);
    localStorage.setItem('prod_notes', notes);
    localStorage.setItem('prod_priorityVTSX', priorityVTSX);
    localStorage.setItem('prod_orderCode', orderCode);
    if (allocations) {
      localStorage.setItem('prod_allocations', JSON.stringify(allocations));
      localStorage.setItem('prod_isShortage', isShortage);
      localStorage.setItem('prod_orderCreated', orderCreated);
      localStorage.setItem('prod_mode', mode);
      localStorage.setItem('prod_orderItems', JSON.stringify(orderItems));
      localStorage.setItem('prod_generatedComponents', JSON.stringify(generatedComponents));
      localStorage.setItem('prod_stockPool', JSON.stringify(stockPool));
    }
  }, [selectedProduct, quantity, prodDate, notes, priorityVTSX, orderCode, allocations, isShortage, orderCreated, mode, orderItems, generatedComponents, stockPool]);

  useEffect(() => {
    // Fetch unique products from BOM with pagination to bypass 1000 rows limit
    const fetchProducts = async () => {
      try {
        let allData = [];
        let hasMore = true;
        let from = 0;
        const limit = 1000;
        
        while (hasMore) {
          const { data, error } = await db.from('bom_items')
            .select('product_code, product_name, inventory_items!product_code(item_name)')
            .range(from, from + limit - 1);
            
          if (error) throw error;
          
          if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < limit) {
              hasMore = false;
            } else {
              from += limit;
            }
          } else {
            hasMore = false;
          }
        }

        const unique = [];
        const map = new Set();
        allData.forEach(d => {
          if (!map.has(d.product_code)) {
            map.add(d.product_code);
            // Ưu tiên lấy tên chuẩn từ danh mục hàng hóa (inventory_items)
            const realName = d.inventory_items?.item_name || d.product_name || '';
            unique.push({ code: d.product_code, name: realName });
          }
        });
        setProducts(unique.sort((a,b) => a.code.localeCompare(b.code)));
      } catch (err) {
        console.error("Error fetching BOM products:", err);
      }
    };
    fetchProducts();
  }, []);

  const handleCalculate = async () => {
    if (!selectedProduct || quantity <= 0) return alert('Vui lòng chọn mã sản phẩm và nhập số lượng > 0');
    setLoading(true);
    setMode('production');
    setAllocations(null);
    setOrderCreated(false);
    
    try {
      // 0. Tạo mã phiếu PSX-YYYYMMDD-xx
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      
      // Lấy mã Lệnh Sản Xuất lớn nhất trong ngày từ bảng production_orders
      const { data: latestOrder, error: latestErr } = await db.from('production_orders')
        .select('order_code')
        .like('order_code', `PSX-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastCode = latestOrder[0].order_code;
        const lastSeq = parseInt(lastCode.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }

      const generatedCode = `PSX-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // 1. Lấy cấu trúc BOM của SP
      const { data: bomData, error: bomErr } = await db.from('bom_items')
        .select(`component_code, quantity, unit, inventory_items!bom_items_component_code_fkey ( item_name )`)
        .eq('product_code', selectedProduct);
      
      if (bomErr) throw bomErr;
      if (!bomData || bomData.length === 0) throw new Error('Sản phẩm này chưa có cấu trúc BOM');

      const componentsRequired = bomData.map(b => ({
        code: b.component_code,
        name: b.inventory_items?.item_name || '',
        unit: b.unit,
        requiredQty: b.quantity * quantity
      }));

      const compCodes = componentsRequired.map(c => c.code);

      // 2. Lấy Tồn kho của các linh kiện này (Sắp xếp FIFO: ngay_nhap ASC, quantity ASC)
      const { data: stockData, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', compCodes)
        .order('import_date', { ascending: true })
        .order('quantity', { ascending: true });

      if (stockErr) throw stockErr;

      // Lưu tồn gốc theo item_code để popup Sửa phân bổ tra cứu/validate
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      // Deep copy stock to simulate deduction
      let availableStock = JSON.parse(JSON.stringify(stockData || []));
      
      if (priorityVTSX) {
         const priorityItems = availableStock.filter(s => s.location && s.location.startsWith('SX11-'));
         const normalItems = availableStock.filter(s => !(s.location && s.location.startsWith('SX11-')));
         availableStock = [...priorityItems, ...normalItems];
      }
      
      let hasShortage = false;
      const result = [];

      // 3. Tính toán Allocation
      componentsRequired.forEach(comp => {
        let qtyNeeded = comp.requiredQty;
        const compAllocations = [];

        // Trường hợp THÁO MÁY (SL cần âm) -> Cộng ngược lại vào kho
        if (qtyNeeded < 0) {
          compAllocations.push({
            stock_id: null, // Sẽ tạo mới hoặc update dựa vào location này lúc lưu
            location: `SX9-${generatedCode}`,
            before: 0,
            taken: qtyNeeded, // số âm
            remaining: Math.abs(qtyNeeded)
          });
          result.push({
            ...comp,
            allocations: compAllocations,
            missing: 0, // Không bị thiếu
            isShortage: false
          });
          return;
        }

        const compStockRows = availableStock.filter(s => s.item_code === comp.code && s.quantity > 0);
        
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          
          const beforeQty = row.quantity;
          row.quantity -= take;
          qtyNeeded -= take;
          
          compAllocations.push({
            stock_id: row.id,
            location: row.location,
            before: beforeQty,
            taken: take,
            remaining: row.quantity
          });
        }

        if (qtyNeeded > 0) hasShortage = true;

        result.push({
          ...comp,
          allocations: compAllocations,
          missing: qtyNeeded,
          isShortage: qtyNeeded > 0
        });
      });

      setAllocations(result);
      setIsShortage(hasShortage);

    } catch (e) {
      console.error(e);
      alert('Lỗi tính toán: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportExcel = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        
        // Tìm dòng tiêu đề
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(50, json.length); i++) {
          if (json[i] && json[i].some(cell => String(cell).includes('Mã đơn hàng'))) {
            headerRowIdx = i;
            break;
          }
        }
        
        if (headerRowIdx === -1) {
          return alert('Không tìm thấy dòng tiêu đề chứa "Mã đơn hàng". Vui lòng kiểm tra lại file Excel.');
        }

        const headers = json[headerRowIdx];
        const orderCodeIdx = headers.findIndex(h => String(h).includes('Mã đơn hàng'));
        const productCodeIdx = headers.findIndex(h => String(h).includes('Mã sản phẩm'));
        const productNameIdx = headers.findIndex(h => String(h).includes('Tên sản phẩm'));
        const qtyIdx = headers.findIndex(h => String(h).includes('Số lượng'));
        const unitIdx = headers.findIndex(h => String(h).includes('Đơn vị tính'));

        if (orderCodeIdx === -1 || productCodeIdx === -1 || qtyIdx === -1) {
          return alert('File Excel thiếu các cột bắt buộc: Mã đơn hàng, Mã sản phẩm, Số lượng');
        }

        const parsedItems = [];
        let currentOrderCode = '';

        for (let i = headerRowIdx + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          
          let orderCode = row[orderCodeIdx] ? String(row[orderCodeIdx]).trim() : '';
          if (orderCode) {
            currentOrderCode = orderCode;
          } else {
            orderCode = currentOrderCode; // Fill down
          }

          const productCode = row[productCodeIdx] ? String(row[productCodeIdx]).trim() : '';
          const productName = row[productNameIdx] ? String(row[productNameIdx]).trim() : '';
          const qtyStr = row[qtyIdx] ? String(row[qtyIdx]).trim() : '';
          const unit = row[unitIdx] ? String(row[unitIdx]).trim() : '';
          const qty = Number(qtyStr.replace(/,/g, ''));

          // Bỏ qua KTV (DLD) hoặc dòng thiếu dữ liệu
          if (!orderCode || !productCode || !qty || isNaN(qty) || unit.toUpperCase() === 'DLD') {
            continue;
          }

          parsedItems.push({ orderCode, productCode, productName, qty, unit });
        }

        if (parsedItems.length === 0) return alert('Không có dữ liệu hợp lệ (hoặc tất cả là DLD).');

        // KIỂM TRA TRÙNG LẶP MÃ ĐƠN HÀNG TRONG LUU_XUAT
        const uniqueOrderCodes = [...new Set(parsedItems.map(item => item.orderCode))];
        const checkDuplicates = async () => {
          setLoading(true);
          try {
            const { data: existingOrders, error: checkErr } = await db.from('luu_xuat')
              .select('ma_don_hang')
              .in('ma_don_hang', uniqueOrderCodes);
            
            if (checkErr) throw checkErr;
            
            const existingSet = new Set((existingOrders || []).map(r => String(r.ma_don_hang).trim()));
            const duplicates = [...existingSet];
            
            if (duplicates.length > 0) {
              setDuplicateOrders(duplicates);
              setPendingParsedItems(parsedItems);
              setShowDuplicateModal(true);
            } else {
              setMode('delivery');
              setOrderItems(parsedItems);
              setSelectedProduct('');
              setTimeout(() => handleCalculateDelivery(parsedItems), 100);
            }
          } catch (error) {
             alert('Lỗi kiểm tra trùng lặp: ' + error.message);
          } finally {
             setLoading(false);
          }
        };
        
        checkDuplicates();

      } catch (err) {
        alert('Lỗi đọc file: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(f);
  };

  const handleProceedWithoutDuplicates = () => {
    const filteredItems = pendingParsedItems.filter(item => !duplicateOrders.includes(item.orderCode));
    setShowDuplicateModal(false);
    
    if (filteredItems.length === 0) {
      alert('Tất cả đơn hàng trong file đều đã tồn tại. Không có dữ liệu mới để tạo phiếu.');
      return;
    }

    setMode('delivery');
    setOrderItems(filteredItems);
    setSelectedProduct('');
    
    setTimeout(() => handleCalculateDelivery(filteredItems), 100);
  };

  const handleCalculateDelivery = async (items) => {
    setLoading(true);
    setAllocations(null);
    setOrderCreated(false);

    try {
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('inventory_picking_logs')
        .select('order_code')
        .like('order_code', `PDH-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastCode = latestOrder[0].order_code;
        const lastSeq = parseInt(lastCode.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PDH-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Gom nhóm nhu cầu
      const demandMap = {};
      items.forEach(item => {
        if (!demandMap[item.productCode]) {
          demandMap[item.productCode] = { code: item.productCode, name: item.productName, unit: item.unit, requiredQty: 0 };
        }
        demandMap[item.productCode].requiredQty += item.qty;
      });

      const componentsRequired = Object.values(demandMap);
      const compCodes = componentsRequired.map(c => c.code);

      const { data: stockData, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', compCodes)
        .order('import_date', { ascending: true })
        .order('quantity', { ascending: true });

      if (stockErr) throw stockErr;

      // Lưu tồn gốc theo item_code để popup Sửa phân bổ tra cứu/validate
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      const availableStock = JSON.parse(JSON.stringify(stockData || []));
      let hasShortage = false;
      const result = [];

      componentsRequired.forEach(comp => {
        let qtyNeeded = comp.requiredQty;
        // Xuất bán/đơn hàng KHÔNG lấy từ kho sản xuất (SX9-*, hàng đang dở dang).
        const compStockRows = availableStock.filter(s => s.item_code === comp.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
        const compAllocations = [];
        
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          row.quantity -= take;
          qtyNeeded -= take;
          compAllocations.push({
            stock_id: row.id, location: row.location, before: row.quantity + take, taken: take, remaining: row.quantity
          });
        }
        if (qtyNeeded > 0) hasShortage = true;
        result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
      });

      setAllocations(result);
      setIsShortage(hasShortage);
    } catch (e) {
      console.error(e);
      alert('Lỗi tính toán xuất đơn: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const cols = ['Mã đơn hàng', 'Mã sản phẩm', 'Tên sản phẩm', 'Số lượng', 'Đơn vị tính'];
    const sampleData = [{
      'Mã đơn hàng': 'DH-001',
      'Mã sản phẩm': 'SP-TEST',
      'Tên sản phẩm': 'Sản phẩm ví dụ',
      'Số lượng': 10,
      'Đơn vị tính': 'Cái'
    }];
    const ws = XLSX.utils.json_to_sheet(sampleData, {header: cols});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau_Don_Hang");
    XLSX.writeFile(wb, "Mau_Nhap_Don_Hang.xlsx");
  };

  const handleOpenManualExport = async () => {
    setShowManualExportModal(true);
    const { data: orderData } = await db.from('production_orders')
      .select('order_code')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (orderData) setRecentOrders(orderData.map(d => d.order_code));

    // Lấy danh sách hàng hoá đang có tồn kho > 0 (phân trang để lấy hết)
    let allStockData = [];
    let stockPage = 0;
    while (true) {
      const { data: stockChunk } = await db.from('inventory_stock')
        .select('item_code, item_name')
        .gt('quantity', 0)
        .range(stockPage * 1000, (stockPage + 1) * 1000 - 1);
      if (stockChunk) allStockData = allStockData.concat(stockChunk);
      if (!stockChunk || stockChunk.length < 1000) break;
      stockPage++;
    }
    
    const uniqueItemsMap = new Map();
    allStockData.forEach(item => {
       if (!uniqueItemsMap.has(item.item_code)) {
          uniqueItemsMap.set(item.item_code, { code: item.item_code, name: item.item_name });
       }
    });
    const uniqueItemsList = Array.from(uniqueItemsMap.values()).sort((a,b) => a.code.localeCompare(b.code));
    setStockItems(uniqueItemsList);
  };

  const handleCalculateManualExport = async () => {
    if (!manualProduct || !manualQty || isNaN(manualQty) || Number(manualQty) <= 0) return alert('Vui lòng chọn Mã SP và nhập Số lượng hợp lệ!');
    if (manualReason === 'XBS' && !manualOrderRef) return alert('Vui lòng chọn Phiếu sản xuất để bổ sung!');

    setLoading(true);
    setMode('manual_export');
    setAllocations(null);
    setOrderCreated(false);
    setShowManualExportModal(false);

    try {
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('inventory_picking_logs')
        .select('order_code')
        .like('order_code', `PXK-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastCode = latestOrder[0].order_code;
        const lastSeq = parseInt(lastCode.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PXK-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Nhu cầu chỉ là 1 sản phẩm
      const selectedProdObj = stockItems.find(p => p.code === manualProduct);
      const componentsRequired = [{
        code: manualProduct,
        name: selectedProdObj ? selectedProdObj.name : '',
        unit: '', // có thể bỏ qua
        requiredQty: Number(manualQty)
      }];

      const { data: stockData, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .eq('item_code', manualProduct)
        .order('import_date', { ascending: true })
        .order('quantity', { ascending: true });

      if (stockErr) throw stockErr;

      // Lưu tồn gốc theo item_code để popup Sửa phân bổ tra cứu/validate
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      const availableStock = JSON.parse(JSON.stringify(stockData || []));
      let hasShortage = false;
      const result = [];

      componentsRequired.forEach(comp => {
        let qtyNeeded = comp.requiredQty;
        // Xuất thủ công cũng KHÔNG lấy từ kho sản xuất (SX9-*, hàng đang dở dang).
        const compStockRows = availableStock.filter(s => s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
        const compAllocations = [];
        
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          row.quantity -= take;
          qtyNeeded -= take;
          compAllocations.push({
            stock_id: row.id, location: row.location, before: row.quantity + take, taken: take, remaining: row.quantity
          });
        }
        if (qtyNeeded > 0) hasShortage = true;
        result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
      });

      setAllocations(result);
      setIsShortage(hasShortage);
      setOrderItems([{
        orderCode: manualReason === 'XBS' ? manualOrderRef : generatedCode,
        productCode: manualProduct,
        productName: selectedProdObj ? selectedProdObj.name : '',
        qty: Number(manualQty)
      }]);
    } catch (e) {
      console.error(e);
      alert('Lỗi xuất kho thủ công: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSave = async () => {
    if (isShortage) return alert('Không thể tạo lệnh vì thiếu linh kiện!');
    if (!allocations) return;
    
    // Bỏ qua in ấn, gọi trực tiếp hàm trừ kho và tạo phiếu
    await confirmDeductAndCreateOrder();
  };

  const confirmDeductAndCreateOrder = async () => {
    setIsProcessing(true);
    try {
      // 3. Trừ kho / Cộng kho trên DB
      const updates = [];
      const inserts = [];
      const pickingLogs = [];
      const userStr = localStorage.getItem('user_id') || localStorage.getItem('username') || localStorage.getItem('staffName') || 'Nhân viên';
      let extraSlbData = [];
      let pnkCode = '';
      let pxkCode = '';
      const duLieuNhapArr = [];
      let baseTimeMs = Date.now();

      if (mode === 'disassemble') {
        const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
        
        const { data: latestPnk } = await db.from('inventory_picking_logs')
           .select('order_code').ilike('order_code', `PNK-${todayStr}-%`).order('order_code', {ascending: false}).limit(1);
        let seqPnk = 1;
        if (latestPnk && latestPnk.length > 0) {
           const l = parseInt(latestPnk[0].order_code.split('-').pop(), 10);
           if (!isNaN(l)) seqPnk = l + 1;
        }

        const { data: latestPxk } = await db.from('inventory_picking_logs')
           .select('order_code').ilike('order_code', `PXK-${todayStr}-%`).order('order_code', {ascending: false}).limit(1);
        let seqPxk = 1;
        if (latestPxk && latestPxk.length > 0) {
           const l = parseInt(latestPxk[0].order_code.split('-').pop(), 10);
           if (!isNaN(l)) seqPxk = l + 1;
        }

        pnkCode = `PNK-${todayStr}-${seqPnk.toString().padStart(2, '0')}`;
        pxkCode = `PXK-${todayStr}-${seqPxk.toString().padStart(2, '0')}`;

        for (const genComp of generatedComponents) {
           if (genComp.exportImmediately) {
             duLieuNhapArr.push({
                ngay_nhap: todayLocal(), ma_hang: genComp.code, ten_hang: genComp.name,
                so_luong_nhap: genComp.importQty, ma_ncc: orderCode, kho_nhap: genComp.targetLocation || 'Kho', ly_do_nhap: 'Thu hồi (Phân rã từ ' + allocations[0].code + ')',
                created_at: new Date(baseTimeMs + 1000).toISOString()
             });
             pickingLogs.push({
                order_code: pnkCode, product_code: allocations[0].code, component_code: genComp.code, component_name: genComp.name,
                location: genComp.targetLocation, quantity_before: 0, quantity_taken: genComp.importQty, quantity_after: genComp.importQty,
                created_by: userStr, notes: 'Thu hồi (Phân rã từ ' + allocations[0].code + ')',
                created_at: new Date(baseTimeMs + 1000).toISOString()
             });
             
             extraSlbData.push({
                ma_don_hang: pxkCode, ma_san_pham: genComp.code, ten_san_pham: genComp.name,
                so_luong: genComp.importQty, ngay_xuat: todayLocal(),
                created_at: new Date(baseTimeMs + 2000).toISOString()
             });
             pickingLogs.push({
                order_code: pxkCode, product_code: allocations[0].code, component_code: genComp.code, component_name: genComp.name,
                location: genComp.targetLocation, quantity_before: genComp.importQty, quantity_taken: -genComp.importQty, quantity_after: 0,
                created_by: userStr, notes: 'Xuất đóng gói luôn (từ ' + allocations[0].code + ')',
                created_at: new Date(baseTimeMs + 2000).toISOString()
             });
             
           } else {
             duLieuNhapArr.push({
                ngay_nhap: todayLocal(), ma_hang: genComp.code, ten_hang: genComp.name,
                so_luong_nhap: genComp.importQty, ma_ncc: orderCode, kho_nhap: genComp.targetLocation || 'Kho', ly_do_nhap: 'Thu hồi (Phân rã từ ' + allocations[0].code + ')',
                created_at: new Date(baseTimeMs + 1000).toISOString()
             });
             
             const { data: exist } = await db.from('inventory_stock').select('id, quantity').eq('location', genComp.targetLocation).eq('item_code', genComp.code).maybeSingle();
             if (exist) {
                updates.push(db.from('inventory_stock').update({ quantity: exist.quantity + genComp.importQty }).eq('id', exist.id));
             } else {
                inserts.push({
                   item_code: genComp.code, item_name: genComp.name, unit: genComp.unit,
                   location: genComp.targetLocation, quantity: genComp.importQty, import_date: todayLocal()
                });
             }
             
             pickingLogs.push({
                order_code: pnkCode, product_code: allocations[0].code, component_code: genComp.code, component_name: genComp.name,
                location: genComp.targetLocation, quantity_before: exist ? exist.quantity : 0, quantity_taken: genComp.importQty, quantity_after: (exist ? exist.quantity : 0) + genComp.importQty,
                created_by: userStr, notes: 'Thu hồi (Phân rã từ ' + allocations[0].code + ')',
                created_at: new Date(baseTimeMs + 1000).toISOString()
             });
           }
        }
        
        if (duLieuNhapArr.length > 0) {
           const { error: pnkErr } = await db.from('du_lieu_nhap').insert(duLieuNhapArr);
           if (pnkErr) console.warn('Lỗi lưu du_lieu_nhap (phân rã):', pnkErr);
        }
      }

      for (const comp of allocations) {
        for (const alloc of comp.allocations) {
          if (alloc.taken < 0 && !alloc.stock_id) {
            // Lô linh kiện THÁO MÁY (âm) -> Nhập ngược vào kho SX9
            const returnedQty = Math.abs(alloc.taken);
            const { data: exist } = await db.from('inventory_stock')
              .select('id, quantity')
              .eq('location', alloc.location)
              .eq('item_code', comp.code)
              .maybeSingle();

            if (exist) {
              updates.push(
                db.from('inventory_stock')
                  .update({ quantity: exist.quantity + returnedQty })
                  .eq('id', exist.id)
              );
            } else {
              inserts.push({
                item_code: comp.code,
                item_name: comp.name,
                unit: comp.unit || 'Cái',
                location: alloc.location,
                quantity: returnedQty,
                import_date: todayLocal()
              });
            }

            pickingLogs.push({
              order_code: orderCode,
              product_code: selectedProduct, // Liên kết đúng với sản phẩm đang sản xuất
              component_code: comp.code,
              component_name: comp.name,
              location: alloc.location,
              quantity_before: exist ? exist.quantity : 0,
              quantity_taken: returnedQty, // Lịch sử bốc dỡ là số DƯƠNG (Cộng kho)
              quantity_after: (exist ? exist.quantity : 0) + returnedQty,
              created_by: userStr,
              notes: 'Tháo máy nhập ngược',
              created_at: new Date(baseTimeMs).toISOString()
            });

          } else if (alloc.stock_id) {
            // Lô linh kiện XUẤT KHO bình thường
            updates.push(
              db.from('inventory_stock')
                .update({ quantity: alloc.remaining })
                .eq('id', alloc.stock_id)
            );
            
            pickingLogs.push({
              order_code: orderCode,
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? (manualReason === 'XBS' ? 'Bổ sung' : 'XUAT_KHO') : (mode === 'disassemble' ? allocations[0].code : selectedProduct)),
              component_code: comp.code,
              component_name: comp.name,
              location: alloc.location,
              quantity_before: alloc.before,
              quantity_taken: -alloc.taken, // Lịch sử bốc dỡ là số ÂM (Trừ kho)
              quantity_after: alloc.remaining,
              created_by: userStr,
              notes: mode === 'disassemble' ? 'Phân rã (Xuất SP)' : notes,
              created_at: new Date(baseTimeMs).toISOString()
            });
          }
        }
      }

      await Promise.all(updates);
      if (inserts.length > 0) {
        await db.from('inventory_stock').insert(inserts);
      }

      // 4. Lưu Lịch sử bốc dỡ kho
      if (pickingLogs.length > 0) {
        const { error: logErr } = await db.from('inventory_picking_logs').insert(pickingLogs);
        if (logErr) console.warn('Không thể lưu log bốc dỡ:', logErr);
      }

      if (mode === 'production') {
        // 5. Đồng thời tạo 1 lệnh sản xuất mới đẩy sang AdminDashboard
        const { data: capData } = await db.from('product_capacities').select('capacity_per_hour').eq('product_code', selectedProduct).single();
        const stdTime = capData?.capacity_per_hour ? (1 / parseFloat(capData.capacity_per_hour)) : 0.05; 
        
        const { error: orderErr } = await db.from('production_orders').upsert([{
            order_code: orderCode,
            product_code: selectedProduct,
            target_quantity: quantity,
            standard_time_per_unit: stdTime,
            status: 'pending'
        }], { onConflict: 'order_code' });
        
        if (orderErr) throw orderErr;

        // 5.1 Tạo tồn kho tạm cho thành phẩm ở vị trí SX9-[mã phiếu]
        const { error: wipErr } = await db.from('inventory_stock').insert([{
            item_code: selectedProduct,
            item_name: selectedProductName || `Thành phẩm ${selectedProduct}`,
            unit: 'Bộ', // Mặc định thành phẩm là Bộ, hoặc có thể lấy từ DB nếu có
            location: `SX9-${orderCode}`,
            quantity: quantity,
            import_date: todayLocal()
        }]);
        if (wipErr) console.warn('Không thể tạo tồn kho tạm (WIP) cho sản phẩm:', wipErr);

        // 5.2 Trừ nhu cầu DKSX nếu mã này đang có (làm phiếu SX → giảm SL cần SX)
        try {
          const { data: pd } = await db.from('production_demand').select('id, qty_demand').eq('item_code', selectedProduct).maybeSingle();
          if (pd) {
            const remain = Math.max(0, Number(pd.qty_demand) - Number(quantity));
            await db.from('production_demand').update({
              qty_demand: remain,
              trang_thai: remain <= 0 ? 'Hoàn thành' : 'Đang SX',
              updated_at: new Date().toISOString()
            }).eq('id', pd.id);
          }
        } catch (e) { console.warn('Không cập nhật được DKSX:', e.message); }
      }

      // 6. Ghi vào Dữ liệu xuất (so_luong_ban)
      let slbData = [];
      if (mode === 'delivery' || mode === 'manual_export') {
         slbData = orderItems.map(item => ({
            ma_don_hang: item.orderCode, // Sẽ là PXK-... (hoặc PSX-... nếu bổ sung)
            ma_san_pham: item.productCode,
            ten_san_pham: item.productName,
            so_luong: item.qty,
            ngay_xuat: todayLocal(),
            created_at: new Date(baseTimeMs).toISOString()
         }));
      } else if (mode === 'disassemble') {
         slbData.push({
            ma_don_hang: orderCode,
            ma_san_pham: allocations[0].code,
            ten_san_pham: allocations[0].name,
            so_luong: allocations[0].requiredQty,
            ngay_xuat: todayLocal(),
            created_at: new Date(baseTimeMs).toISOString()
         });
         slbData = slbData.concat(extraSlbData);
      } else {
         allocations.forEach(comp => {
            const totalTaken = comp.allocations.reduce((sum, a) => sum + a.taken, 0);
            if (totalTaken !== 0) { // Sửa để ghi cả số lượng lấy (dương) và tháo máy (âm)
               slbData.push({
                  ma_don_hang: orderCode, // Hiển thị mã phiếu sản xuất (PSX-...)
                  ma_san_pham: comp.code,
                  ten_san_pham: comp.name,
                  so_luong: totalTaken,
                  ngay_xuat: todayLocal(),
                  created_at: new Date(baseTimeMs).toISOString()
               });
            }
         });
      }

      if (slbData.length > 0) {
         // Gắn loại xuất (type) theo mode để phân biệt khi tính demand:
         //   delivery -> XB (đơn hàng) | manual_export -> XBS/XDG (theo manualReason)
         //   disassemble -> KHAC (tháo máy) | production -> XBS (cấp linh kiện cho chuyền)
         const exportType = mode === 'delivery' ? 'XB'
            : mode === 'manual_export' ? manualReason
            : mode === 'disassemble' ? 'KHAC'
            : 'XBS';
         const slbDataTyped = slbData.map(r => ({ ...r, type: r.type || exportType }));
         const { error: slbErr } = await db.from('luu_xuat').insert(slbDataTyped);
         if (slbErr) console.warn('Lỗi lưu luu_xuat:', slbErr);
      }

      setOrderCreated(true);
      
      let alertMsg = `Đã hoàn tất chứng từ ${orderCode}!\nHệ thống đã lưu trạng thái "Chưa in". Vui lòng in phiếu ở tab Quản Lý Chứng Từ.`;
      if (mode === 'disassemble') {
         const hasPnk = duLieuNhapArr && duLieuNhapArr.length > 0;
         const hasPxk = extraSlbData && extraSlbData.length > 0;
         alertMsg = `Đã hoàn tất phân rã!\nCác chứng từ được tạo:\n- ${orderCode} (Xuất SP Phân rã)`;
         if (hasPnk) alertMsg += `\n- Phiếu nhập LK: ${duLieuNhapArr[0].ma_ncc}`;
         if (hasPxk) alertMsg += `\n- Phiếu xuất đóng gói: ${extraSlbData[0].ma_don_hang}`;
         alertMsg += `\nVui lòng in các phiếu tại tab Quản Lý Chứng Từ.`;
      }
      
      alert(alertMsg);
      
      
    } catch (e) {
      console.error(e);
      alert('Lỗi khi cập nhật hệ thống: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Tính toán đơn hàng bị thiếu cho UI
  const shortProductCodes = (allocations || []).filter(a => a.isShortage).map(a => a.code);
  const affectedOrderItems = mode === 'delivery' && isShortage ? orderItems.filter(item => shortProductCodes.includes(item.productCode)) : [];

  const handleToggleShortageOrder = (orderCode) => {
    setSelectedShortageOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderCode)) newSet.delete(orderCode);
      else newSet.add(orderCode);
      return newSet;
    });
  };

  const handleRemoveShortageOrders = () => {
    if (selectedShortageOrders.size === 0) return;
    const newItems = orderItems.filter(item => !selectedShortageOrders.has(item.orderCode));
    if (newItems.length === 0) {
       setOrderItems([]);
       setAllocations(null);
       setIsShortage(false);
       setSelectedShortageOrders(new Set());
       alert('Đã xóa tất cả đơn hàng.');
       return;
    }
    setOrderItems(newItems);
    setSelectedShortageOrders(new Set());
    handleCalculateDelivery(newItems);
  };

  const handleDisProductChange = async (val) => {
    setDisProduct(val);
    setSelectedDisLocation('');
    setDisLocations([]);
    if (!val) return;
    try {
      const { data, error } = await db.from('inventory_stock')
        .select('id, location, quantity')
        .eq('item_code', val)
        .gt('quantity', 0);
      if (!error && data) {
        setDisLocations(data);
      }
    } catch (err) {
      console.warn('Lỗi lấy vị trí tồn kho khi phân rã:', err);
    }
  };

  const handleCalculateDisassemble = async () => {
    if (!disProduct || !disQty || !selectedDisLocation) {
      return alert('Vui lòng chọn sản phẩm, số lượng và vị trí lấy!');
    }
    setLoading(true);
    setMode('disassemble');
    setAllocations(null);
    setOrderCreated(false);
    
    try {
      // Create code PPR
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('luu_xuat')
        .select('ma_don_hang')
        .like('ma_don_hang', `PPR-${todayStr}-%`)
        .order('ma_don_hang', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastCode = latestOrder[0].ma_don_hang;
        const lastSeq = parseInt(lastCode.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PPR-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Check BOM
      const { data: bomData, error: bomErr } = await db.from('bom_items')
        .select(`component_code, quantity, unit, inventory_items!bom_items_component_code_fkey ( item_name )`)
        .eq('product_code', disProduct);
        
      if (bomErr) throw bomErr;
      if (!bomData || bomData.length === 0) throw new Error('Sản phẩm này chưa có cấu trúc BOM');

      // Allocation for Product A (xuất đi)
      const qtyNeeded = Number(disQty);
      const chosenLocData = disLocations.find(l => l.location === selectedDisLocation);
      const maxTake = chosenLocData ? chosenLocData.quantity : 0;
      
      if (qtyNeeded > maxTake) {
        throw new Error(`Số lượng lấy (${qtyNeeded}) lớn hơn tồn kho hiện có tại ${selectedDisLocation} (${maxTake}).`);
      }

      const prodName = products.find(p=>p.code===disProduct)?.name || disProduct;
      
      setAllocations([{
        code: disProduct,
        name: prodName,
        requiredQty: qtyNeeded,
        allocations: [{
           stock_id: chosenLocData.id,
           location: selectedDisLocation,
           before: chosenLocData.quantity,
           taken: qtyNeeded,
           remaining: chosenLocData.quantity - qtyNeeded
        }],
        isShortage: false,
        missing: 0
      }]);

      // Generated Components for B,C,D
      const comps = bomData.map(b => ({
        code: b.component_code,
        name: b.inventory_items?.item_name || '',
        unit: b.unit || 'Cái',
        importQty: b.quantity * qtyNeeded,
        targetLocation: 'Kho',
        exportImmediately: false
      }));
      setGeneratedComponents(comps);

      // Tồn gốc của sản phẩm phân rã để popup Sửa phân bổ tra cứu/validate
      setStockPool({ [disProduct]: (disLocations || []).map(l => ({ id: l.id, location: l.location, quantity: l.quantity })) });

      setShowDisassembleModal(false);

    } catch(e) {
      alert("Lỗi tính toán: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedProductName = products.find(p => p.code === selectedProduct)?.name || '';

  const EXPORT_TYPES = [
    { id: 'production', label: 'Lệnh Sản Xuất', icon: Play, color: '#0891b2', desc: 'Tạo phiếu sản xuất từ BOM' },
    { id: 'delivery', label: 'Nhập Đơn Hàng', icon: Upload, color: '#7c3aed', desc: 'Nhập file Excel đơn hàng' },
    { id: 'manual_export', label: 'Xuất Kho Thủ Công', icon: Package, color: '#0284c7', desc: 'Xuất kho đóng gói / bổ sung' },
    { id: 'disassemble', label: 'Phân Rã Sản Phẩm', icon: RefreshCw, color: '#f59e0b', desc: 'Tháo sản phẩm thành linh kiện' },
  ];

  const [showProductionModal, setShowProductionModal] = useState(false);

  const handleCardClick = (typeId) => {
    if (typeId === 'production') {
      setShowProductionModal(true);
    } else if (typeId === 'delivery') {
      fileInputRef.current?.click();
    } else if (typeId === 'manual_export') {
      handleOpenManualExport();
    } else if (typeId === 'disassemble') {
      setShowDisassembleModal(true);
    }
  };

  const handleProductionSubmit = () => {
    setShowProductionModal(false);
    handleCalculate();
  };

  const handleResetToCards = () => {
    setAllocations(null);
    setOrderCreated(false);
    setMode('production');
    setSelectedProduct('');
    setQuantity(1);
    setNotes('');
    setOrderItems([]);
    setGeneratedComponents([]);
    setStockPool({});
    setEditingCompIdx(null);
  };

  // Lưu phân bổ sửa tay vào allocations[compIdx] rồi tính lại trạng thái thiếu toàn cục
  const handleSaveAllocation = (compIdx, newAllocations) => {
    const next = allocations.map((c, i) =>
      i === compIdx ? { ...c, allocations: newAllocations, missing: 0, isShortage: false } : c
    );
    setAllocations(next);
    setIsShortage(next.some(c => c.isShortage));
    setEditingCompIdx(null);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1, position:'relative', height:'100%', background:'#f8fafc'}}>
      {/* Ẩn giao diện thao tác khi in */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          body, html, #root, main { overflow: visible !important; height: auto !important; }
        }
      `}</style>

      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} ref={fileInputRef} style={{display:'none'}} />

      {/* Card Grid — shown when no result yet */}
      {!allocations ? (
        <div style={{padding:'1rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'center', flex:1, overflow:'auto'}}>
          <h2 style={{fontSize:'0.95rem', color:'#0f172a', marginBottom:'1rem', fontWeight:700, textAlign:'center'}}>Chọn loại phiếu xuất kho</h2>
          {!perms.create && <div style={{padding:'2rem 1rem', textAlign:'center', color:'#94a3b8', fontSize:'0.85rem'}}>Bạn chỉ có quyền xem Kho — không có quyền tạo phiếu xuất / lệnh sản xuất.</div>}
          {perms.create && <div style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10, width:'100%', maxWidth:460}}>
            {EXPORT_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => handleCardClick(type.id)}
                  style={{
                    background:'#fff', borderRadius:14, border:'1px solid #eef2f7', padding:'1rem 0.5rem',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem',
                    cursor:'pointer', transition:'all 0.2s', boxShadow:'0 2px 6px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => {e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = type.color;}}
                  onMouseLeave={e => {e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#eef2f7';}}
                >
                  <div style={{width:44, height:44, borderRadius:12, background:type.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 3px 8px ${type.color}40`}}>
                    <Icon size={22} />
                  </div>
                  <span style={{fontSize:'0.78rem', fontWeight:700, color:'#334155', textAlign:'center', lineHeight:1.2}}>{type.label}</span>
                  <span style={{fontSize:'0.66rem', color:'#94a3b8', textAlign:'center', lineHeight:1.3}}>{type.desc}</span>
                </button>
              );
            })}
          </div>}

          {perms.create && (
            <button
              onClick={handleDownloadTemplate}
              style={{...s.btn, marginTop:14, background:'#f1f5f9', color:'#7c3aed', border:'1px solid #ddd6fe'}}
            >
              <Download size={15}/> Tải file Excel mẫu (Nhập Đơn Hàng)
            </button>
          )}

          {loading && (
            <div style={{marginTop:'2rem', display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tính toán...</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Result header with back button */}
          <div className="no-print" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem 1rem',display:'flex',alignItems:'center',gap:'0.75rem',position:'sticky',top:0,zIndex:20}}>
            <button onClick={handleResetToCards} style={{...s.btn, background:'#f1f5f9', color:'#475569', border:'1px solid #e2e8f0', padding:'0.4rem 0.75rem'}}>
              ← Quay lại
            </button>
            <span style={{fontSize:'0.85rem',fontWeight:700,color:'#0f172a'}}>
              {mode === 'delivery' ? 'Xuất kho đơn hàng' : mode === 'manual_export' ? 'Xuất kho thủ công' : mode === 'disassemble' ? 'Phân rã sản phẩm' : 'Lệnh sản xuất'}
            </span>
            <span style={{fontSize:'0.78rem',color:'#0891b2',fontWeight:700,marginLeft:'auto'}}>{orderCode}</span>
          </div>

      {/* Main Print Area */}
      <main style={{flex:1,padding:'0',overflowY:'auto',background:'#f1f5f9'}}>
        {mode === 'delivery' && isShortage && affectedOrderItems.length > 0 && (
          <div className="no-print" style={{maxWidth:800, margin:'1rem auto 0', background:'#fff', border:'1px solid #fecaca', borderRadius:12, padding:'1rem'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <AlertCircle size={18} color="#dc2626"/>
              <strong style={{color:'#dc2626',fontSize:'0.9rem'}}>Có đơn hàng bị thiếu linh kiện</strong>
            </div>
            <p style={{fontSize:'0.8rem',color:'#64748b',margin:'0 0 10px'}}>Chọn các đơn cần loại bỏ rồi tính lại phần còn lại:</p>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
              {[...new Set(affectedOrderItems.map(i => i.orderCode))].map(oc => {
                const prods = [...new Set(affectedOrderItems.filter(i => i.orderCode === oc).map(i => i.productCode))];
                return (
                  <label key={oc} style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.8rem',color:'#334155',cursor:'pointer',background:'#fef2f2',padding:'6px 8px',borderRadius:6}}>
                    <input type="checkbox" checked={selectedShortageOrders.has(oc)} onChange={() => handleToggleShortageOrder(oc)} />
                    <strong>{oc}</strong> <span style={{color:'#94a3b8'}}>— thiếu: {prods.join(', ')}</span>
                  </label>
                );
              })}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
              <button onClick={handleRemoveShortageOrders} disabled={selectedShortageOrders.size === 0} style={{...s.btn, ...(selectedShortageOrders.size === 0 ? s.btnDisabled : {background:'#dc2626'})}}>
                Xoá đơn đã chọn & tính lại
              </button>
            </div>
          </div>
        )}
        {allocations && (
          <div id="print-area" style={{background:'#fff',padding:'1rem',borderRadius:0,boxShadow:'none',maxWidth:800,margin:'0 auto'}}>
            
            {/* Print Header */}
            <div style={{textAlign:'center',marginBottom:'2rem',borderBottom:'2px solid #334155',paddingBottom:'1rem'}}>
              <h1 style={{fontSize:'1.8rem',fontWeight:800,margin:'0 0 10px 0',color:'#0f172a',textTransform:'uppercase'}}>
                {mode === 'delivery' ? 'PHIẾU XUẤT KHO ĐƠN HÀNG' : mode === 'manual_export' ? 'PHIẾU XUẤT KHO' : mode === 'disassemble' ? 'PHIẾU PHÂN RÃ SẢN PHẨM' : 'PHIẾU SẢN XUẤT'}
              </h1>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.9rem',color:'#475569',marginTop:15}}>
                <div style={{textAlign:'left'}}>
                  {mode === 'delivery' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Số lượng đơn hàng:</strong> {new Set(orderItems.map(i=>i.orderCode)).size} đơn</p>
                       <p style={{margin:'3px 0'}}><strong>Tổng SP xuất kho:</strong> {orderItems.reduce((acc, curr) => acc + curr.qty, 0).toLocaleString('vi-VN')}</p>
                     </>
                  ) : mode === 'manual_export' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Mã SP xuất:</strong> {orderItems[0]?.productCode}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên SP xuất:</strong> {orderItems[0]?.productName}</p>
                       <p style={{margin:'3px 0'}}><strong>Mục đích:</strong> {orderItems[0]?.orderCode === 'XDG' ? 'Xuất đóng gói' : `Xuất bổ sung cho phiếu: ${orderItems[0]?.orderCode}`}</p>
                     </>
                  ) : mode === 'disassemble' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Sản phẩm phân rã:</strong> {allocations[0]?.code}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên sản phẩm:</strong> {allocations[0]?.name}</p>
                     </>
                  ) : (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Mã SP:</strong> {selectedProduct}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên SP:</strong> {selectedProductName}</p>
                     </>
                  )}
                  {notes && <p style={{margin:'3px 0'}}><strong>Ghi chú:</strong> {notes}</p>}
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{margin:'3px 0'}}><strong>Mã phiếu:</strong> <span style={{fontSize:'1.05rem',fontWeight:800,color:'#0f172a'}}>{orderCode}</span></p>
                  {mode === 'production' && <p style={{margin:'3px 0'}}><strong>Số lượng SX:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{quantity}</span></p>}
                  {mode === 'manual_export' && <p style={{margin:'3px 0'}}><strong>Số lượng xuất:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{orderItems[0]?.qty}</span></p>}
                  {mode === 'disassemble' && <p style={{margin:'3px 0'}}><strong>Số lượng phân rã:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{allocations[0]?.requiredQty}</span></p>}
                  <p style={{margin:'3px 0'}}><strong>Ngày:</strong> {new Date(prodDate).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
            </div>

            {/* Print Details */}
            <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'1rem',color:'#334155', padding:'0 1rem'}}>
              {(mode === 'delivery' || mode === 'manual_export' || mode === 'disassemble') ? 'Danh sách hàng hóa xuất kho:' : 'Danh sách linh kiện cần lấy:'}
            </h3>
            <div style={{overflowX:'auto', margin:'0 1rem'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                <thead>
                  <tr style={{background:'#f8fafc',borderBottom:'2px solid #cbd5e1',borderTop:'2px solid #cbd5e1'}}>
                    <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã LK</th>
                    <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Tên linh kiện</th>
                    <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>SL Cần</th>
                    <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Vị trí lấy</th>
                    <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>Nhập/Xuất</th>
                    <th style={{padding:'0.4rem',textAlign:'right',fontWeight:700,color:'#334155'}}>SL Lấy</th>
                    <th style={{padding:'0.4rem',textAlign:'right',fontWeight:700,color:'#334155'}}>Tồn dư</th>
                  </tr>
                </thead>
              <tbody>
                {allocations.map((comp, idx) => {
                  const rows = Math.max(comp.allocations.length, 1);
                  return (
                    <React.Fragment key={comp.code}>
                      {comp.allocations.length === 0 ? (
                        // Trường hợp cháy kho hoàn toàn
                        <tr style={{borderBottom:'1px solid #e2e8f0',background:'#fef2f2'}}>
                          <td style={{padding:'0.4rem',fontWeight:600}}>{comp.code}</td>
                          <td style={{padding:'0.4rem',minWidth:120}}>{comp.name}</td>
                          <td style={{padding:'0.4rem',textAlign:'center',fontWeight:700}}>
                            {comp.requiredQty}
                            {!orderCreated && comp.requiredQty > 0 && (
                              <button className="no-print" onClick={() => setEditingCompIdx(idx)} style={{display:'block',margin:'5px auto 0',border:'1px solid #bae6fd',background:'#f0f9ff',color:'#0891b2',borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,cursor:'pointer'}}>✎ Sửa</button>
                            )}
                          </td>
                          <td colSpan={4} style={{padding:'0.4rem',textAlign:'center',color:'#dc2626',fontWeight:600}}>Hết hàng (Thiếu {comp.missing})</td>
                        </tr>
                      ) : (
                        comp.allocations.map((alloc, i) => (
                          <tr key={`${comp.code}-${i}`} style={{borderBottom: i===rows-1 ? '1px solid #cbd5e1' : '1px dotted #e2e8f0', background: comp.isShortage ? '#fef2f2' : 'transparent'}}>
                            {i === 0 && (
                              <>
                                <td rowSpan={rows} style={{padding:'0.4rem',fontWeight:600,verticalAlign:'top',borderRight:'1px dotted #e2e8f0'}}>{comp.code}</td>
                                <td rowSpan={rows} style={{padding:'0.4rem',verticalAlign:'top',borderRight:'1px dotted #e2e8f0',minWidth:120}}>{comp.name}</td>
                                <td rowSpan={rows} style={{padding:'0.4rem',textAlign:'center',fontWeight:700,verticalAlign:'top',borderRight:'1px dotted #e2e8f0'}}>
                                  {comp.requiredQty}
                                  {comp.isShortage && <div style={{color:'#dc2626',fontSize:'0.65rem',marginTop:5}}>(Thiếu {comp.missing})</div>}
                                  {!orderCreated && comp.requiredQty > 0 && (
                                    <button className="no-print" onClick={() => setEditingCompIdx(idx)} style={{display:'block',margin:'5px auto 0',border:'1px solid #bae6fd',background:'#f0f9ff',color:'#0891b2',borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,cursor:'pointer'}}>✎ Sửa</button>
                                  )}
                                </td>
                              </>
                            )}
                            <td style={{padding:'0.4rem',fontWeight:600,color:'#0f172a'}}>{alloc.location}</td>
                            <td style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color: alloc.taken < 0 ? '#10b981' : '#0891b2'}}>
                               {alloc.taken < 0 ? 'Nhập' : 'Xuất'}
                            </td>
                            <td style={{padding:'0.4rem',textAlign:'right',fontWeight:800,color: alloc.taken < 0 ? '#10b981' : '#0891b2'}}>
                               {Math.abs(alloc.taken)}
                            </td>
                            <td style={{padding:'0.4rem',textAlign:'right',color:'#64748b'}}>{alloc.remaining}</td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>

            {/* Generated Components (Disassemble Mode) */}
            {mode === 'disassemble' && generatedComponents && generatedComponents.length > 0 && (
              <div style={{marginTop: '2rem', overflowX:'auto', margin:'2rem -1rem 0 -1rem'}}>
                <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'1rem',color:'#334155', padding:'0 1rem'}}>Danh sách linh kiện thu hồi (Nhập Kho):</h3>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                  <thead>
                    <tr style={{background:'#f8fafc',borderBottom:'2px solid #cbd5e1',borderTop:'2px solid #cbd5e1'}}>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã LK</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Tên linh kiện</th>
                      <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>SL Thu Hồi</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Vị trí nhập</th>
                      <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>Xuất đóng gói luôn?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedComponents.map((comp, idx) => (
                      <tr key={comp.code} style={{borderBottom: '1px solid #e2e8f0'}}>
                        <td style={{padding:'0.4rem',fontWeight:600,color:'#0f172a'}}>{comp.code}</td>
                        <td style={{padding:'0.4rem',minWidth:120}}>{comp.name}</td>
                        <td style={{padding:'0.4rem',textAlign:'center',fontWeight:800,color:'#10b981'}}>+{comp.importQty}</td>
                        <td style={{padding:'0.4rem'}}>
                          <input 
                            type="text" 
                            value={comp.targetLocation} 
                            onChange={(e) => {
                              const newComps = [...generatedComponents];
                              newComps[idx].targetLocation = e.target.value.toUpperCase();
                              setGeneratedComponents(newComps);
                            }}
                            style={{...s.input, width:'100px', padding:'0.2rem', fontSize:'0.75rem'}} 
                            disabled={comp.exportImmediately || orderCreated}
                          />
                        </td>
                        <td style={{padding:'0.4rem',textAlign:'center'}}>
                          <input 
                            type="checkbox" 
                            checked={comp.exportImmediately}
                            onChange={(e) => {
                              const newComps = [...generatedComponents];
                              newComps[idx].exportImmediately = e.target.checked;
                              setGeneratedComponents(newComps);
                            }}
                            style={{cursor:'pointer', width:16, height:16, accentColor:'#0ea5e9'}}
                            disabled={orderCreated}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer / Action */}
            <div className="no-print" style={{marginTop:'2rem',display:'flex',justifyContent:'flex-end',gap:'1rem'}}>
              {orderCreated ? (
                <div style={{display:'flex',alignItems:'center',gap:10,color:'#16a34a',fontWeight:700,padding:'0.5rem 1rem',background:'#dcfce7',borderRadius:8}}>
                  <CheckCircle size={20}/>
                  ĐÃ XÁC NHẬN LỆNH & TRỪ KHO (Chờ In)
                </div>
              ) : (
                <button 
                  onClick={handleExecuteSave} 
                  disabled={isShortage || isProcessing} 
                  style={{...s.btn, ...(isShortage || isProcessing ? s.btnDisabled : {background:'#10b981', color:'#fff'})}}
                >
                  {isProcessing ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}}/> : <Check size={16}/>}
                  LƯU PHIẾU (Chờ in)
                </button>
              )}
            </div>

            {/* Chữ ký cho bản in */}
            <div style={{display:'none'}} className="print-signature">
              <style>{`@media print { .print-signature { display: flex !important; justify-content: space-between; margin-top: 50px; padding: 0 50px; text-align: center; } }`}</style>
              <div>
                <strong>Người lập phiếu</strong>
                <p style={{marginTop:50}}>(Ký, họ tên)</p>
              </div>
              <div>
                <strong>Thủ kho</strong>
                <p style={{marginTop:50}}>(Ký, họ tên)</p>
              </div>
              <div>
                <strong>Nhận hàng</strong>
                <p style={{marginTop:50}}>(Ký, họ tên)</p>
              </div>
            </div>

          </div>
        )}
      </main>
        </>
      )}

      {/* Production Form Modal */}
      {showProductionModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:500, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight:800 }}>
              <Play size={24} color="#0891b2"/> Lệnh Sản Xuất
            </h3>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Thành phẩm cần sản xuất</label>
              <SearchableSelect 
                value={selectedProduct} 
                onChange={setSelectedProduct} 
                placeholder="-- Gõ hoặc chọn mã SP --"
                options={products.map(p => ({ value: p.code, label: p.name }))}
              />
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Số lượng</label>
              <input type="number" min="1" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} style={s.input}/>
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Ngày sản xuất</label>
              <input type="date" value={prodDate} onChange={e=>setProdDate(e.target.value)} style={s.input}/>
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Ghi chú (Tùy chọn)</label>
              <input type="text" placeholder="Ghi chú phiếu..." value={notes} onChange={e=>setNotes(e.target.value)} style={s.input}/>
            </div>

            <label style={{display:'flex', alignItems:'center', gap:5, marginBottom:20, fontSize:'0.8rem', cursor:'pointer', color:'#475569'}}>
              <input type="checkbox" checked={priorityVTSX} onChange={e=>setPriorityVTSX(e.target.checked)} />
              Ưu tiên lấy kho VTSX (SX11-...)
            </label>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem' }}>
              <button onClick={() => setShowProductionModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                Hủy Bỏ
              </button>
              <button 
                onClick={handleProductionSubmit} 
                disabled={!selectedProduct || quantity <= 0}
                style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:(selectedProduct && quantity > 0) ? '#0891b2' : '#cbd5e1', color:'#fff', fontWeight:600, cursor:(selectedProduct && quantity > 0) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5 }}
              >
                <Play size={16}/> Tính toán bốc dỡ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Removed Confirm Modal */}

      {/* Manual Export Modal */}
      {showManualExportModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:500, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight: 800 }}>
              <Package size={24} color="#0284c7"/> Xuất Kho Thủ Công
            </h3>
            
            <div style={{marginBottom:15}}>
              <label style={s.label}>Mã sản phẩm / linh kiện</label>
              <SearchableSelect 
                options={stockItems.map(p => ({value: p.code, label: p.name}))} 
                value={manualProduct} 
                onChange={setManualProduct} 
                placeholder="Tìm mã hoặc tên..." 
              />
            </div>
            
            <div style={{marginBottom:15}}>
              <label style={s.label}>Tên sản phẩm / linh kiện</label>
              <input 
                type="text" 
                style={{...s.input, background:'#f1f5f9', color:'#94a3b8'}} 
                value={stockItems.find(p => p.code === manualProduct)?.name || ''} 
                disabled 
              />
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Số lượng xuất</label>
              <input 
                type="number" 
                style={s.input} 
                value={manualQty} 
                onChange={e => setManualQty(e.target.value)} 
                placeholder="Nhập số lượng..." 
                min="1"
              />
            </div>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Lý do xuất kho</label>
              <div style={{display:'flex', gap:20, marginTop:8}}>
                <label style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:'0.85rem', color:'#334155'}}>
                  <input type="radio" name="reason" value="XDG" checked={manualReason === 'XDG'} onChange={() => setManualReason('XDG')} /> Xuất đóng gói
                </label>
                <label style={{display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:'0.85rem', color:'#334155'}}>
                  <input type="radio" name="reason" value="XBS" checked={manualReason === 'XBS'} onChange={() => setManualReason('XBS')} /> Xuất bổ sung lắp ráp
                </label>
              </div>
            </div>

            {manualReason === 'XBS' && (
              <div style={{marginBottom:15}}>
                <label style={s.label}>Bổ sung cho Phiếu Sản Xuất nào?</label>
                <select 
                  style={s.input} 
                  value={manualOrderRef} 
                  onChange={e => setManualOrderRef(e.target.value)}
                >
                  <option value="">-- Chọn Phiếu Sản Xuất --</option>
                  {recentOrders.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:25 }}>
              <button onClick={() => setShowManualExportModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer', transition:'0.2s' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleCalculateManualExport} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:'#0284c7', color:'#fff', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'0.2s' }}>
                Đồng ý & Tính toán
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disassemble Modal */}
      {showDisassembleModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:500, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight: 800 }}>
              <RefreshCw size={24} color="#f59e0b"/> Phân Rã Sản Phẩm
            </h3>
            
            <div style={{marginBottom:15}}>
              <label style={s.label}>Sản phẩm cần phân rã</label>
              <SearchableSelect 
                options={products.map(p => ({value: p.code, label: p.name}))} 
                value={disProduct} 
                onChange={handleDisProductChange} 
                placeholder="Tìm mã hoặc tên sản phẩm..." 
              />
            </div>

            {disLocations.length > 0 && (
              <div style={{marginBottom:15}}>
                <label style={s.label}>Chọn vị trí xuất kho</label>
                <select 
                  style={s.input} 
                  value={selectedDisLocation} 
                  onChange={e => setSelectedDisLocation(e.target.value)}
                >
                  <option value="">-- Chọn vị trí --</option>
                  {disLocations.map(loc => (
                    <option key={loc.location} value={loc.location}>
                      {loc.location} (Tồn: {loc.quantity})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {disProduct && disLocations.length === 0 && (
               <div style={{marginBottom:15, fontSize:'0.8rem', color:'#ef4444'}}>Sản phẩm này không có tồn kho. Không thể phân rã!</div>
            )}
            
            <div style={{marginBottom:15}}>
              <label style={s.label}>Số lượng phân rã</label>
              <input 
                type="number" 
                style={s.input} 
                value={disQty} 
                onChange={e => setDisQty(e.target.value)} 
                placeholder="Nhập số lượng..." 
                min="1"
              />
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:25 }}>
              <button onClick={() => setShowDisassembleModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer', transition:'0.2s' }}>
                Hủy Bỏ
              </button>
              <button 
                onClick={handleCalculateDisassemble} 
                disabled={!disProduct || !selectedDisLocation || !disQty || Number(disQty) <= 0}
                style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:(disProduct && selectedDisLocation && disQty && Number(disQty) > 0) ? '#f59e0b' : '#cbd5e1', color:'#fff', fontWeight:600, cursor:(disProduct && selectedDisLocation && disQty && Number(disQty) > 0) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5, transition:'0.2s' }}
              >
                Tính toán phân rã
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Allocation Modal — sửa tay vị trí & SL lấy */}
      {editingCompIdx !== null && allocations && allocations[editingCompIdx] && (
        <EditAllocationModal
          comp={allocations[editingCompIdx]}
          poolRows={stockPool[allocations[editingCompIdx].code] || []}
          onSave={(newAllocations) => handleSaveAllocation(editingCompIdx, newAllocations)}
          onClose={() => setEditingCompIdx(null)}
        />
      )}

      {/* Duplicate Orders Modal */}
      {showDuplicateModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:500, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 1rem 0', fontSize:'1.25rem', color:'#dc2626', display:'flex', alignItems:'center', gap:10, fontWeight: 800 }}>
              <AlertCircle size={24} color="#dc2626"/> Cảnh báo trùng lặp
            </h3>
            
            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
              Phát hiện các mã đơn hàng sau đã tồn tại trong hệ thống (đã xuất kho trước đó):
            </p>
            
            <div style={{ maxHeight: 150, overflowY: 'auto', background: '#fef2f2', padding: '0.75rem', borderRadius: 8, border: '1px solid #fecaca', marginBottom: '1.5rem' }}>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
                {duplicateOrders.map(code => (
                  <li key={code} style={{ marginBottom: 4 }}>{code}</li>
                ))}
              </ul>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', fontStyle: 'italic', lineHeight: 1.4 }}>
              Bạn có muốn xóa bỏ các đơn hàng này khỏi danh sách tải lên và tiếp tục tạo phiếu với các đơn hàng còn lại không?
            </p>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem' }}>
              <button onClick={() => setShowDuplicateModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer', transition:'0.2s' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleProceedWithoutDuplicates} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'0.2s' }}>
                Xóa đơn trùng & Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
