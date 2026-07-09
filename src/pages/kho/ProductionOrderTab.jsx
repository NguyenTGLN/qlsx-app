import React, { useState, useEffect, useRef } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Play, Printer, AlertCircle, CheckCircle, Package, Upload, Check, Download, RefreshCw, Edit3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import { EXPORT_REASONS, reasonType, reasonNeedsOrderRef } from '../../lib/exportReasons';
import { aggregateComponentDemand, allocateFIFO, buildFinishedItems, round1, compareLocations, sortStockForFIFO, sortResultByLocation } from '../../lib/productionAlloc';
import { getCatalogItems, getBomProducts } from '../../lib/catalogCache';
import { missingCapacities, capacityMap } from '../../lib/capacityGuard';
import { parseManualOrders } from '../../lib/manualOrderParse';

// Làm tròn số lượng hiển thị tới 1 chữ số thập phân (khử nhiễu dấu phẩy động của mã dây, vd 284.30000000000007 → 284.3)
const fmtQty = round1;

// id ổn định cho từng dòng xuất thủ công — tránh mất focus khi xoá dòng giữa (React key)
let __manualRowSeq = 0;
const emptyManualRow = () => ({ id: ++__manualRowSeq, code: '', name: '', qty: '', reason: 'Bán ra', orderRef: '' });

// id ổn định cho từng dòng thành phẩm SX — giữ focus khi xoá dòng giữa (React key)
let __prodRowSeq = 0;
const emptyProdRow = () => ({ id: ++__prodRowSeq, code: '', name: '', qty: 1 });

// id ổn định cho từng đơn hàng / mã SP nhập tay (React key, giữ focus khi thêm-xoá)
let __manualOrderSeq = 0;
const emptyManualProduct = () => ({ id: ++__manualOrderSeq, code: '', name: '', qty: '', unit: '' });
const emptyManualOrder = () => ({ id: ++__manualOrderSeq, orderCode: '', products: [emptyManualProduct()] });

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
  // Neo dropdown bằng position:fixed để (1) không bị thân modal overflow:auto cắt cụt,
  // (2) mở rộng chiều ngang cho dễ đọc mã + tên. Xem [[qlsx-modal-dropdown-clipping]].
  const [pos, setPos] = useState(null); // {top,left,width,maxHeight}
  const ref = useRef(null);
  const inputRef = useRef(null);

  // Tính vị trí + kích thước dropdown theo ô input (viewport-based)
  const recalc = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    // Rộng cho dễ xem: tối thiểu 300px (hoặc bằng ô input nếu ô rộng hơn), không vượt màn hình
    const width = Math.min(Math.max(rect.width, 300), vw - 16);
    let left = rect.left;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
    const maxHeight = Math.max(200, Math.min(380, window.innerHeight - rect.bottom - 12));
    setPos({ top: Math.round(rect.bottom + 4), left: Math.round(left), width: Math.round(width), maxHeight });
  };

  useEffect(() => {
    const handleClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Khi mở: tính vị trí và cập nhật lại khi cuộn (capture để bắt cuộn trong modal) / resize
  useEffect(() => {
    if (!isOpen) return;
    recalc();
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [isOpen]);

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
        ref={inputRef}
        style={s.input}
        placeholder={placeholder}
        value={isOpen ? search : displayVal}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); setFocusedIndex(-1); }}
        onClick={() => { setIsOpen(true); setSearch(''); setFocusedIndex(-1); }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && pos && (
        <div style={{position:'fixed', top:pos.top, left:pos.left, width:pos.width, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, maxHeight:pos.maxHeight, overflowY:'auto', zIndex:10010, boxShadow:'0 12px 28px -6px rgba(0,0,0,0.30)'}}>
          {filtered.map((o, idx) => (
            <div
              key={o.value}
              style={{
                padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #f1f5f9', fontSize:'0.9rem', color:'#334155', lineHeight:1.35,
                background: focusedIndex === idx ? '#e0f2fe' : 'transparent'
              }}
              onMouseEnter={() => setFocusedIndex(idx)}
              onMouseLeave={() => setFocusedIndex(-1)}
              onClick={() => { onChange(o.value); setIsOpen(false); }}
            >
              <strong>{o.value}</strong> - {o.label}
            </div>
          ))}
          {filtered.length === 0 && <div style={{padding:'10px 14px', color:'#94a3b8', fontSize:'0.9rem'}}>Không tìm thấy</div>}
        </div>
      )}
    </div>
  );
};

// Popup "Sửa phân bổ": cho phép sửa tay vị trí & SL lấy của 1 linh kiện,
// tách 1 mã ra nhiều vị trí. Chỉ chọn được vị trí có tồn thật (từ poolRows).
const EditAllocationModal = ({ comp, poolRows, onSave, onClose }) => {
  const rows = (poolRows || []).filter(p => p.quantity > 0)
    .sort((a, b) => compareLocations(a.location, b.location));
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
    })).sort((a, b) => compareLocations(a.location, b.location));
    onSave(newAllocations);
  };

  const locOptions = rows.map(r => ({ value: r.location, label: `Tồn: ${fmtQty(r.quantity)}` }));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ background:'#fff', padding:'1.5rem', borderRadius:16, maxWidth:560, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight:'90vh', overflowY:'auto' }}>
        <h3 style={{ margin:'0 0 0.25rem 0', fontSize:'1.1rem', color:'#0f172a', fontWeight:800 }}>Sửa phân bổ vị trí lấy</h3>
        <p style={{ margin:'0 0 1rem 0', fontSize:'0.85rem', color:'#475569' }}>
          <strong>{comp.code}</strong> — {comp.name} · SL Cần: <strong>{fmtQty(required)}</strong>
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
                {li.row && <div style={{ fontSize:'0.7rem', color: li.overStock ? '#dc2626' : '#94a3b8', marginTop:2 }}>Tồn: {fmtQty(li.before)}{li.overStock ? ' (vượt!)' : ''}</div>}
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
            Tổng đã lấy: {fmtQty(total)} / {fmtQty(required)} {totalOk ? '✓' : '(phải bằng SL Cần)'}
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
  // Danh sách thành phẩm trên 1 phiếu SX (multi). Mỗi dòng: { id, code, name, qty }
  const [prodRows, setProdRows] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('prod_rows'));
      if (Array.isArray(saved) && saved.length > 0) {
        return saved.map(r => ({ ...r, id: ++__prodRowSeq }));
      }
    } catch { /* ignore */ }
    return [emptyProdRow()];
  });
  // Các lệnh con sinh ra cho phiếu hiện tại: [{ orderCode, productCode, productName, qty }]
  const [prodFinishedItems, setProdFinishedItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('prod_finishedItems')) || []; } catch { return []; }
  });

  const updateProdRow = (id, patch) => setProdRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  const addProdRow = () => setProdRows(prev => [...prev, emptyProdRow()]);
  const removeProdRow = (id) => setProdRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));

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
    setProdRows([{ id: ++__prodRowSeq, code: sxPrefill.item_code || '', name: '', qty: sxPrefill.qty ? Number(sxPrefill.qty) : 1 }]);
    setShowProductionModal(true); // mở thẳng form Phiếu sản xuất (bỏ bước "Chọn loại phiếu xuất kho")
    if (onSxConsumed) onSxConsumed();
    // onSxConsumed cố tình bỏ khỏi deps: chỉ chạy khi sxPrefill đổi, tránh vòng lặp khi parent truyền hàm inline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sxPrefill]);

  // States for duplicate check
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateOrders, setDuplicateOrders] = useState([]);
  const [pendingParsedItems, setPendingParsedItems] = useState([]);
  
  // States for Manual Export Modal — nhiều mã trên 1 phiếu, mỗi dòng 1 lý do
  const [showManualExportModal, setShowManualExportModal] = useState(false);
  const [manualRows, setManualRows] = useState([emptyManualRow()]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [stockItems, setStockItems] = useState([]);

  // States for Manual Order Entry — nhập đơn hàng tay (thay cho file Excel), nhiều đơn / nhiều dòng
  const [showDeliveryChoiceModal, setShowDeliveryChoiceModal] = useState(false);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [manualOrders, setManualOrders] = useState([emptyManualOrder()]);

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
    localStorage.setItem('prod_rows', JSON.stringify(prodRows));
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
      localStorage.setItem('prod_finishedItems', JSON.stringify(prodFinishedItems));
    }
  }, [prodRows, prodDate, notes, priorityVTSX, orderCode, allocations, isShortage, orderCreated, mode, orderItems, generatedComponents, stockPool, prodFinishedItems]);

  useEffect(() => {
    // Thành phẩm distinct từ BOM — cache dùng chung (getBomProducts), BOM tab sẽ invalidate khi sửa
    getBomProducts()
      .then(setProducts)
      .catch(err => console.error("Error fetching BOM products:", err));
  }, []);

  const handleCalculate = async () => {
    const rows = prodRows
      .filter(r => r.code && Number(r.qty) > 0)
      .map(r => ({ code: r.code, name: r.name || (products.find(p => p.code === r.code)?.name || ''), qty: Number(r.qty) }));
    if (rows.length === 0) return alert('Vui lòng nhập ít nhất 1 thành phẩm và số lượng > 0');

    setLoading(true);
    setMode('production');
    setAllocations(null);
    setOrderCreated(false);

    try {
      // 0. Tạo mã phiếu PSX-YYYYMMDD-NN
      const todayStr = new Date(prodDate).toISOString().split('T')[0].replace(/-/g, '');
      const { data: latestOrder, error: latestErr } = await db.from('production_orders')
        .select('order_code')
        .like('order_code', `PSX-${todayStr}-%`)
        .order('order_code', { ascending: false })
        .limit(1);

      let seq = 1;
      if (!latestErr && latestOrder && latestOrder.length > 0) {
        const lastSeq = parseInt(latestOrder[0].order_code.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PSX-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Danh sách lệnh con (mỗi thành phẩm 1 lệnh)
      const finishedItems = buildFinishedItems(rows, generatedCode);
      setProdFinishedItems(finishedItems);

      // 1. Lấy BOM của tất cả thành phẩm
      const prodCodes = [...new Set(rows.map(r => r.code))];
      const { data: bomData, error: bomErr } = await db.from('bom_items')
        .select(`product_code, component_code, quantity, unit, inventory_items!bom_items_component_code_fkey ( item_name )`)
        .in('product_code', prodCodes);
      if (bomErr) throw bomErr;
      if (!bomData || bomData.length === 0) throw new Error('Các thành phẩm này chưa có cấu trúc BOM');

      const bomByProduct = {};
      bomData.forEach(b => {
        if (!bomByProduct[b.product_code]) bomByProduct[b.product_code] = [];
        bomByProduct[b.product_code].push({
          component_code: b.component_code,
          quantity: b.quantity,
          unit: b.unit,
          item_name: b.inventory_items?.item_name || '',
        });
      });

      // Cảnh báo nếu có thành phẩm chưa khai báo BOM (sẽ bị bỏ qua linh kiện → xuất thiếu).
      const missingBom = prodCodes.filter(c => !bomByProduct[c]);
      if (missingBom.length > 0) {
        throw new Error('Các thành phẩm sau chưa có cấu trúc BOM: ' + missingBom.join(', '));
      }

      // 2. Gộp nhu cầu linh kiện tổng theo mã
      const componentsRequired = aggregateComponentDemand(rows, bomByProduct);
      const compCodes = componentsRequired.map(c => c.code);

      // 3. Lấy tồn kho (FIFO: import_date asc, cùng ngày thì vị trí A→Z, 1→20)
      const { data: stockRaw, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', compCodes);
      if (stockErr) throw stockErr;
      const stockData = sortStockForFIFO(stockRaw);

      // Lưu tồn gốc theo item_code cho popup "Sửa phân bổ"
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      // 4. Phân bổ FIFO 1 lần trên nhu cầu tổng
      const { result, isShortage: hasShortage } = allocateFIFO(componentsRequired, stockData, {
        priorityVTSX, phieuCode: generatedCode,
      });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
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

        checkDuplicatesAndCalculate(parsedItems);

      } catch (err) {
        alert('Lỗi đọc file: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(f);
  };

  // Kiểm tra trùng mã đơn hàng trong luu_xuat rồi vào luồng tính toán xuất đơn (dùng chung Excel + nhập tay)
  const checkDuplicatesAndCalculate = async (parsedItems) => {
    const uniqueOrderCodes = [...new Set(parsedItems.map(item => item.orderCode))];
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
        setTimeout(() => handleCalculateDelivery(parsedItems), 100);
      }
    } catch (error) {
      alert('Lỗi kiểm tra trùng lặp: ' + error.message);
    } finally {
      setLoading(false);
    }
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

      // FIFO theo import_date, cùng ngày thì vị trí A→Z, 1→20
      const { data: stockRaw, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', compCodes);

      if (stockErr) throw stockErr;
      const stockData = sortStockForFIFO(stockRaw);

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
        // Vị trí trong 1 dòng sắp theo dãy→tầng→ô cho dễ đi lấy hàng
        compAllocations.sort((x, y) => compareLocations(x.location, y.location));
        result.push({ ...comp, allocations: compAllocations, missing: qtyNeeded, isShortage: qtyNeeded > 0 });
      });

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
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

  // Lấy TOÀN BỘ danh mục hàng hóa (inventory_items, phân trang để lấy hết) cho autosuggest mã SP.
  // Dùng cả danh mục (không lọc theo tồn) để tìm được mọi mã kể cả tồn = 0 (vd BCCTV);
  // bước "Tính toán" vẫn kiểm tra tồn và cảnh báo "thiếu linh kiện" nếu không đủ.
  const loadStockItems = async () => {
    // item_code là PK của inventory_items nên không cần dedup; catalog đã sắp theo item_code
    const items = await getCatalogItems().catch(() => []);
    setStockItems(items.map(item => ({ code: item.item_code, name: item.item_name })));
  };

  const handleOpenManualExport = async () => {
    setShowManualExportModal(true);
    setManualRows([emptyManualRow()]);
    const { data: orderData } = await db.from('production_orders')
      .select('order_code')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (orderData) setRecentOrders(orderData.map(d => d.order_code));

    await loadStockItems();
  };

  const handleOpenManualOrder = () => {
    setShowDeliveryChoiceModal(false);
    setShowManualOrderModal(true);
    setManualOrders([emptyManualOrder()]);
    loadStockItems();
  };

  // Thao tác trên nhóm đơn hàng nhập tay (cập nhật bất biến theo id)
  const addManualOrder = () => setManualOrders(os => [...os, emptyManualOrder()]);
  const removeManualOrder = (orderId) =>
    setManualOrders(os => os.length > 1 ? os.filter(o => o.id !== orderId) : os);
  const setManualOrderCode = (orderId, val) =>
    setManualOrders(os => os.map(o => o.id === orderId ? { ...o, orderCode: val } : o));
  const addManualProduct = (orderId) =>
    setManualOrders(os => os.map(o => o.id === orderId ? { ...o, products: [...o.products, emptyManualProduct()] } : o));
  const removeManualProduct = (orderId, prodId) =>
    setManualOrders(os => os.map(o => o.id === orderId
      ? { ...o, products: o.products.length > 1 ? o.products.filter(p => p.id !== prodId) : o.products }
      : o));
  const setManualProductField = (orderId, prodId, patch) =>
    setManualOrders(os => os.map(o => o.id === orderId
      ? { ...o, products: o.products.map(p => p.id === prodId ? { ...p, ...patch } : p) }
      : o));

  const handleCalculateManualOrder = () => {
    const { items, error } = parseManualOrders(manualOrders);
    if (error) return alert(error);
    setShowManualOrderModal(false);
    checkDuplicatesAndCalculate(items);
  };

  const handleCalculateManualExport = async () => {
    // Lọc dòng hợp lệ
    const rows = manualRows.filter(r => r.code && r.qty && !isNaN(r.qty) && Number(r.qty) > 0);
    if (rows.length === 0) return alert('Vui lòng nhập ít nhất 1 dòng có Mã và Số lượng hợp lệ!');
    // Ô Phiếu SX là TÙY CHỌN — để trống thì dùng mã phiếu PXK chung. Không bắt buộc.

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
        const lastSeq = parseInt(latestOrder[0].order_code.split('-').pop(), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const generatedCode = `PXK-${todayStr}-${seq.toString().padStart(2, '0')}`;
      setOrderCode(generatedCode);

      // Lấy tồn của tất cả mã được chọn (FIFO theo import_date, cùng ngày thì vị trí A→Z, 1→20)
      const codes = [...new Set(rows.map(r => r.code))];
      const { data: stockRaw, error: stockErr } = await db.from('inventory_stock')
        .select('*')
        .in('item_code', codes);
      if (stockErr) throw stockErr;
      const stockData = sortStockForFIFO(stockRaw);

      // Lưu tồn gốc theo item_code cho popup "Sửa phân bổ"
      const pool = {};
      (stockData || []).forEach(r => {
        if (!pool[r.item_code]) pool[r.item_code] = [];
        pool[r.item_code].push({ id: r.id, location: r.location, quantity: r.quantity });
      });
      setStockPool(pool);

      // Bản sao tồn để trừ dần, dùng chung cho mọi dòng (nhiều dòng cùng mã sẽ trừ tiếp)
      const working = JSON.parse(JSON.stringify(stockData || []));
      let hasShortage = false;
      const result = [];
      const orderItemsArr = [];

      for (const r of rows) {
        let qtyNeeded = Number(r.qty);
        const type = reasonType(r.reason);
        // Không lấy từ kho sản xuất dở dang (SX9-*)
        const compStockRows = working.filter(s => s.item_code === r.code && s.quantity > 0 && !String(s.location || '').startsWith('SX9-'));
        const compAllocations = [];
        for (let i = 0; i < compStockRows.length && qtyNeeded > 0; i++) {
          const row = compStockRows[i];
          const take = Math.min(row.quantity, qtyNeeded);
          row.quantity -= take;
          qtyNeeded -= take;
          compAllocations.push({ stock_id: row.id, location: row.location, before: row.quantity + take, taken: take, remaining: row.quantity });
        }
        if (qtyNeeded > 0) hasShortage = true;
        // Hiển thị vị trí trên phiếu theo thứ tự tự nhiên (A→Z, 1→20) cho dễ đi lấy hàng
        compAllocations.sort((x, y) => compareLocations(x.location, y.location));
        result.push({
          code: r.code,
          name: r.name,
          unit: '',
          requiredQty: Number(r.qty),
          reason: r.reason,
          type,
          orderRef: r.orderRef || '',
          allocations: compAllocations,
          missing: qtyNeeded,
          isShortage: qtyNeeded > 0,
        });
        orderItemsArr.push({
          orderCode: r.orderRef || generatedCode,
          productCode: r.code,
          productName: r.name,
          qty: Number(r.qty),
          reason: r.reason,
          type,
        });
      }

      // Sắp các dòng phiếu theo lộ trình lấy hàng (vị trí dãy→tầng→ô, đặc biệt/hết hàng xuống cuối)
      setAllocations(sortResultByLocation(result));
      setIsShortage(hasShortage);
      setOrderItems(orderItemsArr);
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
    if (mode === 'production' && prodFinishedItems.length === 0) {
      alert('Dữ liệu phiếu sản xuất không hợp lệ (thiếu danh sách thành phẩm). Vui lòng bấm "← Quay lại" rồi tính toán lại.');
      return;
    }

    // Guard 100% định mức thật: KHÔNG tạo Lệnh SX cho mã thiếu định mức (không dùng fallback 0.05)
    let prodCapMap = null;
    if (mode === 'production') {
      const codes = [...new Set(prodFinishedItems.map(it => String(it.productCode || '').trim()).filter(Boolean))];
      const { data: capRows, error: capErr } = await db.from('product_capacities')
        .select('product_code, capacity_per_hour').in('product_code', codes);
      if (capErr) { alert('Lỗi kiểm tra định mức: ' + capErr.message); return; }
      const missing = missingCapacities(codes, capRows);
      if (missing.length > 0) {
        alert('Các mã sau CHƯA có định mức năng lực, không thể tạo Lệnh SX:\n- '
          + missing.join('\n- ')
          + '\n\nVui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức trước.');
        return;
      }
      prodCapMap = capacityMap(capRows);
    }

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
              product_code: prodFinishedItems.length === 1 ? prodFinishedItems[0].productCode : 'SAN_XUAT',
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
              product_code: mode === 'delivery' ? 'DON_HANG' : (mode === 'manual_export' ? 'XUAT_KHO' : (mode === 'disassemble' ? allocations[0].code : (prodFinishedItems.length === 1 ? prodFinishedItems[0].productCode : 'SAN_XUAT'))),
              component_code: comp.code,
              component_name: comp.name,
              location: alloc.location,
              quantity_before: alloc.before,
              quantity_taken: -alloc.taken, // Lịch sử bốc dỡ là số ÂM (Trừ kho)
              quantity_after: alloc.remaining,
              created_by: userStr,
              notes: mode === 'manual_export' ? (comp.reason || 'Xuất kho') : (mode === 'disassemble' ? 'Phân rã (Xuất SP)' : notes),
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
        // 5. Tạo 1 lệnh sản xuất + 1 tồn WIP (SX9-...) cho MỖI thành phẩm
        const orderUpserts = [];
        const wipInserts = [];
        for (const it of prodFinishedItems) {
          const cap = prodCapMap.get(String(it.productCode).trim());
          if (!cap) throw new Error('Thiếu định mức cho mã ' + it.productCode); // pre-flight đã chặn; phòng thủ
          const stdTime = 1 / cap;
          orderUpserts.push({
            order_code: it.orderCode,
            product_code: it.productCode,
            target_quantity: it.qty,
            standard_time_per_unit: stdTime,
            status: 'pending',
          });
          wipInserts.push({
            item_code: it.productCode,
            item_name: it.productName || `Thành phẩm ${it.productCode}`,
            unit: 'Bộ',
            location: `SX9-${it.orderCode}`,
            quantity: it.qty,
            import_date: todayLocal(),
          });
        }

        const { error: orderErr } = await db.from('production_orders').upsert(orderUpserts, { onConflict: 'order_code' });
        if (orderErr) throw orderErr;

        const { error: wipErr } = await db.from('inventory_stock').insert(wipInserts);
        if (wipErr) console.warn('Không thể tạo tồn kho tạm (WIP):', wipErr);

        // 5.2 Trừ nhu cầu DKSX — gộp theo mã thành phẩm (Σqty) để không trừ thiếu/thừa khi trùng mã
        const demandByCode = {};
        for (const it of prodFinishedItems) {
          demandByCode[it.productCode] = (demandByCode[it.productCode] || 0) + Number(it.qty);
        }
        for (const [code, qtySum] of Object.entries(demandByCode)) {
          try {
            const { data: pd } = await db.from('production_demand').select('id, qty_demand').eq('item_code', code).maybeSingle();
            if (pd) {
              const remain = Math.max(0, Number(pd.qty_demand) - qtySum);
              await db.from('production_demand').update({
                qty_demand: remain,
                trang_thai: remain <= 0 ? 'Hoàn thành' : 'Đang SX',
                updated_at: new Date().toISOString(),
              }).eq('id', pd.id);
            }
          } catch (e) { console.warn('Không cập nhật được DKSX:', e.message); }
        }
      }

      // 6. Ghi vào Dữ liệu xuất (so_luong_ban)
      let slbData = [];
      if (mode === 'delivery' || mode === 'manual_export') {
         slbData = orderItems.map(item => ({
            ma_don_hang: item.orderCode, // PXK-... (hoặc PSX-... nếu chọn Phiếu SX)
            ma_san_pham: item.productCode,
            ten_san_pham: item.productName,
            so_luong: item.qty,
            ngay_xuat: todayLocal(),
            type: item.type, // manual_export: type theo lý do từng dòng; delivery: undefined -> dùng exportType
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
         //   delivery -> XB (đơn hàng) | manual_export -> type đã nhúng vào từng item
         //   disassemble -> KHAC (tháo máy) | production -> XBS (cấp linh kiện cho chuyền)
         const exportType = mode === 'delivery' ? 'XB'
            : mode === 'manual_export' ? 'KHAC' // fallback; item.type từng dòng được ưu tiên qua r.type || exportType
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
        setDisLocations([...data].sort((a, b) => compareLocations(a.location, b.location)));
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
    setIsShortage(false); // Phân rã đã validate SL <= tồn ở trên → không bao giờ thiếu; reset cờ cũ để không khoá nút Lưu

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

  const totalProdQty = prodFinishedItems.reduce((sum, it) => sum + Number(it.qty || 0), 0);

  const EXPORT_TYPES = [
    { id: 'production', label: 'Lệnh Sản Xuất', icon: Play, color: '#0891b2', desc: 'Tạo phiếu sản xuất từ BOM' },
    { id: 'delivery', label: 'Nhập Đơn Hàng', icon: Upload, color: '#7c3aed', desc: 'File Excel hoặc nhập tay' },
    { id: 'manual_export', label: 'Xuất Kho Thủ Công', icon: Package, color: '#0284c7', desc: 'Xuất kho đóng gói / bổ sung' },
    { id: 'disassemble', label: 'Phân Rã Sản Phẩm', icon: RefreshCw, color: '#f59e0b', desc: 'Tháo sản phẩm thành linh kiện' },
  ];

  const [showProductionModal, setShowProductionModal] = useState(false);

  const handleCardClick = (typeId) => {
    if (typeId === 'production') {
      setShowProductionModal(true);
    } else if (typeId === 'delivery') {
      setShowDeliveryChoiceModal(true);
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
    setIsShortage(false); // xoá cờ thiếu cũ khi về lưới thẻ, tránh khoá nút Lưu ở phiếu mới
    setMode('production');
    setProdRows([emptyProdRow()]);
    setProdFinishedItems([]);
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
    // Vị trí đầu của dòng có thể đã đổi → sắp lại theo lộ trình lấy hàng
    setAllocations(sortResultByLocation(next));
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
                       <p style={{margin:'3px 0'}}><strong>Số mã xuất:</strong> {orderItems.length}</p>
                       <p style={{margin:'3px 0'}}><strong>Tổng SL xuất:</strong> {orderItems.reduce((acc, c) => acc + (Number(c.qty) || 0), 0).toLocaleString('vi-VN')}</p>
                     </>
                  ) : mode === 'disassemble' ? (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Sản phẩm phân rã:</strong> {allocations[0]?.code}</p>
                       <p style={{margin:'3px 0'}}><strong>Tên sản phẩm:</strong> {allocations[0]?.name}</p>
                     </>
                  ) : (
                     <>
                       <p style={{margin:'3px 0'}}><strong>Số mã SX:</strong> {prodFinishedItems.length}</p>
                       <p style={{margin:'3px 0'}}><strong>Tổng SL:</strong> {totalProdQty.toLocaleString('vi-VN')}</p>
                     </>
                  )}
                  {notes && <p style={{margin:'3px 0'}}><strong>Ghi chú:</strong> {notes}</p>}
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{margin:'3px 0'}}><strong>Mã phiếu:</strong> <span style={{fontSize:'1.05rem',fontWeight:800,color:'#0f172a'}}>{orderCode}</span></p>
                  {mode === 'production' && <p style={{margin:'3px 0'}}><strong>Tổng SL SX:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{totalProdQty.toLocaleString('vi-VN')}</span></p>}
                  {mode === 'disassemble' && <p style={{margin:'3px 0'}}><strong>Số lượng phân rã:</strong> <span style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a'}}>{fmtQty(allocations[0]?.requiredQty)}</span></p>}
                  <p style={{margin:'3px 0'}}><strong>Ngày:</strong> {new Date(prodDate).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
            </div>

            {/* Danh sách thành phẩm (mode production, nhiều mã / 1 phiếu) */}
            {mode === 'production' && (
              <div style={{margin:'0 1rem 1.5rem'}}>
                <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'0.75rem',color:'#334155'}}>Danh sách thành phẩm sản xuất:</h3>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                  <thead>
                    <tr style={{background:'#f8fafc',borderBottom:'2px solid #cbd5e1',borderTop:'2px solid #cbd5e1'}}>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã SP</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Tên</th>
                      <th style={{padding:'0.4rem',textAlign:'center',fontWeight:700,color:'#334155'}}>Số lượng</th>
                      <th style={{padding:'0.4rem',textAlign:'left',fontWeight:700,color:'#334155'}}>Mã lệnh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodFinishedItems.map(it => (
                      <tr key={it.orderCode} style={{borderBottom:'1px solid #e2e8f0'}}>
                        <td style={{padding:'0.4rem',fontWeight:600,color:'#0f172a'}}>{it.productCode}</td>
                        <td style={{padding:'0.4rem'}}>{it.productName}</td>
                        <td style={{padding:'0.4rem',textAlign:'center',fontWeight:700}}>{it.qty}</td>
                        <td style={{padding:'0.4rem',color:'#64748b'}}>{it.orderCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Print Details */}
            <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:'1rem',color:'#334155', padding:'0 1rem'}}>
              {(mode === 'delivery' || mode === 'manual_export' || mode === 'disassemble') ? 'Danh sách hàng hóa xuất kho:' : 'Danh sách linh kiện cần lấy (tổng chung):'}
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
                          <td style={{padding:'0.4rem',minWidth:120}}>
                            {comp.name}
                            {mode === 'manual_export' && comp.reason && <div style={{fontSize:'0.65rem',color:'#0284c7',fontWeight:700,marginTop:3}}>Lý do: {comp.reason}{comp.orderRef ? ` → ${comp.orderRef}` : ''}</div>}
                          </td>
                          <td style={{padding:'0.4rem',textAlign:'center',fontWeight:700}}>
                            {fmtQty(comp.requiredQty)}
                            {!orderCreated && comp.requiredQty > 0 && (
                              <button className="no-print" onClick={() => setEditingCompIdx(idx)} style={{display:'block',margin:'5px auto 0',border:'1px solid #bae6fd',background:'#f0f9ff',color:'#0891b2',borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,cursor:'pointer'}}>✎ Sửa</button>
                            )}
                          </td>
                          <td colSpan={4} style={{padding:'0.4rem',textAlign:'center',color:'#dc2626',fontWeight:600}}>Hết hàng (Thiếu {fmtQty(comp.missing)})</td>
                        </tr>
                      ) : (
                        comp.allocations.map((alloc, i) => (
                          <tr key={`${comp.code}-${i}`} style={{borderBottom: i===rows-1 ? '1px solid #cbd5e1' : '1px dotted #e2e8f0', background: comp.isShortage ? '#fef2f2' : 'transparent'}}>
                            {i === 0 && (
                              <>
                                <td rowSpan={rows} style={{padding:'0.4rem',fontWeight:600,verticalAlign:'top',borderRight:'1px dotted #e2e8f0'}}>{comp.code}</td>
                                <td rowSpan={rows} style={{padding:'0.4rem',verticalAlign:'top',borderRight:'1px dotted #e2e8f0',minWidth:120}}>
                                  {comp.name}
                                  {mode === 'manual_export' && comp.reason && <div style={{fontSize:'0.65rem',color:'#0284c7',fontWeight:700,marginTop:3}}>Lý do: {comp.reason}{comp.orderRef ? ` → ${comp.orderRef}` : ''}</div>}
                                </td>
                                <td rowSpan={rows} style={{padding:'0.4rem',textAlign:'center',fontWeight:700,verticalAlign:'top',borderRight:'1px dotted #e2e8f0'}}>
                                  {fmtQty(comp.requiredQty)}
                                  {comp.isShortage && <div style={{color:'#dc2626',fontSize:'0.65rem',marginTop:5}}>(Thiếu {fmtQty(comp.missing)})</div>}
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
                               {fmtQty(Math.abs(alloc.taken))}
                            </td>
                            <td style={{padding:'0.4rem',textAlign:'right',color:'#64748b'}}>{fmtQty(alloc.remaining)}</td>
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
                        <td style={{padding:'0.4rem',textAlign:'center',fontWeight:800,color:'#10b981'}}>+{fmtQty(comp.importQty)}</td>
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
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:640, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight:800 }}>
              <Play size={24} color="#0891b2"/> Lệnh Sản Xuất
            </h3>

            <div style={{marginBottom:15}}>
              <label style={s.label}>Thành phẩm cần sản xuất</label>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {prodRows.map(row => (
                  <div key={row.id} style={{display:'flex', gap:8, alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <SearchableSelect
                        value={row.code}
                        onChange={(v) => updateProdRow(row.id, { code: v, name: products.find(p => p.code === v)?.name || '' })}
                        placeholder="-- Gõ hoặc chọn mã SP --"
                        options={products.map(p => ({ value: p.code, label: p.name }))}
                      />
                    </div>
                    <input
                      type="number" min="1"
                      value={row.qty}
                      onChange={(e) => updateProdRow(row.id, { qty: e.target.value })}
                      placeholder="SL"
                      style={{...s.input, width:90}}
                    />
                    <button
                      onClick={() => removeProdRow(row.id)}
                      disabled={prodRows.length <= 1}
                      title="Xoá dòng"
                      style={{border:'none', background:'#fef2f2', color: prodRows.length <= 1 ? '#cbd5e1' : '#dc2626', borderRadius:7, width:34, height:34, cursor: prodRows.length <= 1 ? 'not-allowed' : 'pointer', fontWeight:700, flexShrink:0}}
                    >✕</button>
                  </div>
                ))}
              </div>
              <button onClick={addProdRow} style={{marginTop:8, ...s.btn, background:'#f1f5f9', color:'#0891b2', border:'1px dashed #94a3b8'}}>
                + Thêm thành phẩm
              </button>
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
                disabled={!prodRows.some(r => r.code && Number(r.qty) > 0)}
                style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background: prodRows.some(r => r.code && Number(r.qty) > 0) ? '#0891b2' : '#cbd5e1', color:'#fff', fontWeight:600, cursor: prodRows.some(r => r.code && Number(r.qty) > 0) ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', gap:5 }}
              >
                <Play size={16}/> Tính toán bốc dỡ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Removed Confirm Modal */}

      {/* Delivery Choice Modal — chọn cách nhập đơn hàng: Excel hoặc nhập tay */}
      {showDeliveryChoiceModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:440, width:'100%', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 0.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight:800 }}>
              <Upload size={24} color="#7c3aed"/> Nhập Đơn Hàng
            </h3>
            <p style={{ margin:'0 0 1.25rem 0', fontSize:'0.85rem', color:'#64748b' }}>Chọn cách nhập dữ liệu đơn hàng:</p>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button
                onClick={() => { setShowDeliveryChoiceModal(false); fileInputRef.current?.click(); }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'0.9rem 1rem', borderRadius:12, border:'1px solid #ddd6fe', background:'#faf5ff', cursor:'pointer', textAlign:'left' }}
              >
                <div style={{ width:38, height:38, borderRadius:10, background:'#7c3aed', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Upload size={19}/></div>
                <div>
                  <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#334155' }}>Tải file Excel</div>
                  <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>Nhập danh sách đơn hàng từ file Excel theo mẫu</div>
                </div>
              </button>
              <button
                onClick={handleOpenManualOrder}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'0.9rem 1rem', borderRadius:12, border:'1px solid #bae6fd', background:'#f0f9ff', cursor:'pointer', textAlign:'left' }}
              >
                <div style={{ width:38, height:38, borderRadius:10, background:'#0284c7', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Edit3 size={19}/></div>
                <div>
                  <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#334155' }}>Nhập tay</div>
                  <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>Gõ trực tiếp mã đơn hàng, mã sản phẩm, số lượng</div>
                </div>
              </button>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'1.25rem' }}>
              <button onClick={() => setShowDeliveryChoiceModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                Hủy Bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order Entry Modal — nhập đơn hàng tay, nhiều đơn / nhiều dòng, đi luồng delivery như Excel */}
      {showManualOrderModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:920, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 0.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight:800 }}>
              <Edit3 size={24} color="#7c3aed"/> Nhập Đơn Hàng Tay
            </h3>
            <p style={{ margin:'0 0 1.25rem 0', fontSize:'0.8rem', color:'#64748b' }}>
              Mỗi dòng là 1 mã sản phẩm của 1 đơn hàng. Dòng mới tự lấy Mã đơn hàng của dòng trên — gõ mã mới khi sang đơn khác.
            </p>

            {manualOrders.map((order, oIdx) => (
              <div key={order.id} style={{ border:'1px solid #ddd6fe', borderRadius:12, padding:'0.9rem', marginBottom:14, background:'#faf7ff' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:'0.8rem', fontWeight:700, color:'#7c3aed' }}>Đơn hàng #{oIdx + 1}</span>
                  {manualOrders.length > 1 && (
                    <button onClick={() => removeManualOrder(order.id)} title="Xoá đơn hàng"
                      style={{ height:30, padding:'0 10px', borderRadius:8, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700, fontSize:'0.75rem' }}>✕ Xoá đơn</button>
                  )}
                </div>

                <div style={{ marginBottom:10 }}>
                  <label style={s.label}>Mã đơn hàng</label>
                  <input type="text" style={s.input} value={order.orderCode}
                    onChange={e => setManualOrderCode(order.id, e.target.value)}
                    placeholder="VD: DH-001" />
                </div>

                {order.products.map((row, pIdx) => (
                  <div key={row.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'0.75rem', marginBottom:8, background:'#fff' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:'0.72rem', fontWeight:600, color:'#94a3b8' }}>Sản phẩm {pIdx + 1}</span>
                      {order.products.length > 1 && (
                        <button onClick={() => removeManualProduct(order.id, row.id)} title="Xoá mã sản phẩm"
                          style={{ height:26, width:26, borderRadius:7, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>✕</button>
                      )}
                    </div>
                    <div className="manual-order-row" style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 0.6fr 0.55fr', gap:10, alignItems:'end' }}>
                      <div className="mor-code">
                        <label style={s.label}>Mã sản phẩm</label>
                        <SearchableSelect
                          options={stockItems.map(p => ({value: p.code, label: p.name}))}
                          value={row.code}
                          onChange={(val) => setManualProductField(order.id, row.id, { code: val, name: stockItems.find(p => p.code === val)?.name || '' })}
                          placeholder="Tìm mã hoặc tên..."
                        />
                      </div>
                      <div className="mor-name">
                        <label style={s.label}>Tên</label>
                        <input type="text" style={{...s.input, background:'#eef2f7', color:'#64748b'}} value={row.name} disabled />
                      </div>
                      <div className="mor-qty">
                        <label style={s.label}>Số lượng</label>
                        <input type="number" min="1" step="any" style={s.input} value={row.qty}
                          onChange={e => setManualProductField(order.id, row.id, { qty: e.target.value })}
                          placeholder="SL..." />
                      </div>
                      <div className="mor-unit">
                        <label style={s.label}>Đơn vị</label>
                        <input type="text" style={s.input} value={row.unit}
                          onChange={e => setManualProductField(order.id, row.id, { unit: e.target.value })}
                          placeholder="Cái" />
                      </div>
                    </div>
                  </div>
                ))}

                <button onClick={() => addManualProduct(order.id)}
                  style={{ padding:'0.4rem 0.9rem', borderRadius:8, border:'1px dashed #7c3aed', background:'#fff', color:'#7c3aed', fontWeight:700, cursor:'pointer', fontSize:'0.8rem' }}>
                  + Thêm mã sản phẩm
                </button>
              </div>
            ))}

            <button onClick={addManualOrder}
              style={{ padding:'0.55rem 1rem', borderRadius:8, border:'1px dashed #94a3b8', background:'#f8fafc', color:'#475569', fontWeight:700, cursor:'pointer', marginBottom:10, width:'100%' }}>
              + Thêm đơn hàng
            </button>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:15 }}>
              <button onClick={() => setShowManualOrderModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleCalculateManualOrder} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:'#7c3aed', color:'#fff', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                <Play size={16}/> Tính toán xuất kho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Export Modal */}
      {showManualExportModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'2rem', borderRadius:16, maxWidth:880, width:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)', animation:'fadeIn 0.2s ease-out' }}>
            <h3 style={{ margin:'0 0 1.5rem 0', fontSize:'1.25rem', color:'#0f172a', display:'flex', alignItems:'center', gap:10, fontWeight: 800 }}>
              <Package size={24} color="#0284c7"/> Xuất Kho Thủ Công
            </h3>

            {manualRows.map((row, idx) => {
              const needRef = reasonNeedsOrderRef(row.reason);
              return (
                <div key={row.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'0.9rem', marginBottom:12, background:'#f8fafc' }}>
                  <div className="manual-export-row" style={{ display:'grid', gridTemplateColumns:'1.4fr 1.4fr 0.7fr 1.2fr auto', gap:10, alignItems:'end' }}>
                    <div className="mer-code">
                      <label style={s.label}>Mã SP / linh kiện</label>
                      <SearchableSelect
                        options={stockItems.map(p => ({value: p.code, label: p.name}))}
                        value={row.code}
                        onChange={(val) => setManualRows(rs => rs.map((r, i) => i === idx
                          ? { ...r, code: val, name: stockItems.find(p => p.code === val)?.name || '' }
                          : r))}
                        placeholder="Tìm mã hoặc tên..."
                      />
                    </div>
                    <div className="mer-name">
                      <label style={s.label}>Tên</label>
                      <input type="text" style={{...s.input, background:'#eef2f7', color:'#64748b'}} value={row.name} disabled />
                    </div>
                    <div className="mer-qty">
                      <label style={s.label}>Số lượng</label>
                      <input type="number" min="1" style={s.input} value={row.qty}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                        placeholder="SL..." />
                    </div>
                    <div className="mer-reason">
                      <label style={s.label}>Lý do xuất</label>
                      <select style={s.input} value={row.reason}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, reason: e.target.value, orderRef: '' } : r))}>
                        {EXPORT_REASONS.map(opt => <option key={opt.label} value={opt.label}>{opt.label}</option>)}
                      </select>
                    </div>
                    <button className="mer-del" onClick={() => setManualRows(rs => rs.length > 1 ? rs.filter((_, i) => i !== idx) : [emptyManualRow()])}
                      title="Xoá dòng"
                      style={{ height:38, width:38, borderRadius:8, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontWeight:700 }}>✕</button>
                  </div>
                  {needRef && (
                    <div style={{ marginTop:10 }}>
                      <label style={s.label}>Bổ sung cho Phiếu Sản Xuất (tùy chọn)</label>
                      <select style={s.input} value={row.orderRef}
                        onChange={e => setManualRows(rs => rs.map((r, i) => i === idx ? { ...r, orderRef: e.target.value } : r))}>
                        <option value="">-- Dùng mã phiếu PXK chung --</option>
                        {recentOrders.map(code => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}

            <button onClick={() => setManualRows(rs => [...rs, emptyManualRow()])}
              style={{ padding:'0.5rem 1rem', borderRadius:8, border:'1px dashed #0284c7', background:'#f0f9ff', color:'#0284c7', fontWeight:700, cursor:'pointer', marginBottom:10 }}>
              + Thêm dòng
            </button>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:15 }}>
              <button onClick={() => setShowManualExportModal(false)} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'1px solid #cbd5e1', background:'#fff', color:'#475569', fontWeight:600, cursor:'pointer' }}>
                Hủy Bỏ
              </button>
              <button onClick={handleCalculateManualExport} style={{ padding:'0.6rem 1.2rem', borderRadius:8, border:'none', background:'#0284c7', color:'#fff', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
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
