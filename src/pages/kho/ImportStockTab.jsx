import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Plus, Trash2, Printer, CheckCircle, Package, Check, ShoppingCart, RefreshCw, XCircle, MoreHorizontal, ArrowLeft, Archive, Truck, X } from 'lucide-react';
import { closeProposalWithShortfall } from '../../lib/dksxEngine';
import { getCatalogItems, invalidateCatalog } from '../../lib/catalogCache';
import { dlkImportCap } from '../../lib/proposalQty';
import { newDocToken, claimDocToken, setDocTokenOrderCode, releaseDocToken } from '../../lib/docGuard';
import AddCatalogItemModal from '../../components/AddCatalogItemModal';
import WarehouseReceiptPrint from '../../components/WarehouseReceiptPrint';

const IMPORT_TYPES = [
  { id: 'Nhập mới', label: 'Nhập mới', icon: Plus, color: '#3b82f6' },
  { id: 'Nhập mua vào', label: 'Nhập mua vào', icon: ShoppingCart, color: '#10b981' },
  { id: 'Nhập thành phẩm', label: 'Nhập thành phẩm', icon: Package, color: '#8b5cf6' },
  { id: 'Nhập dư sản xuất', label: 'Nhập dư sản xuất', icon: RefreshCw, color: '#f59e0b' },
  { id: 'Nhập hoàn/hủy', label: 'Nhập hoàn/hủy', icon: XCircle, color: '#ef4444' },
  { id: 'Khác', label: 'Khác', icon: MoreHorizontal, color: '#64748b' }
];
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';

// Component Autocomplete Component
function AutoSuggest({ onChange, placeholder, data, keyField = 'item_code', labelField = 'item_name', extraFields = [], onAddNew }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // {top,left,width,maxHeight} cho dropdown position:fixed
  const wrapRef = useRef(null);

  // Tính vị trí dropdown theo ô input. Dùng position:fixed để dropdown KHÔNG bị cắt
  // bởi vùng cuộn (overflow:auto) của thân modal — vốn làm danh sách gợi ý quá ngắn.
  const updatePos = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4, margin = 12;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    setPos({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight: Math.max(180, Math.min(360, spaceBelow)) });
  }, []);

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Khi mở: tính vị trí và bám theo khi cuộn/đổi kích thước cửa sổ.
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
  const results = data.filter(item =>
    (item[keyField]||'').toLowerCase().includes(q) ||
    (item[labelField]||'').toLowerCase().includes(q) ||
    extraFields.some(f => String(item[f]||'').toLowerCase().includes(q))
  ).slice(0, 50);

  const handleSelect = (item) => {
    onChange(item);
    setInput('');
    setOpen(false);
  };

  return (
    <div style={{position:'relative', width:'100%'}} ref={wrapRef}>
      <div style={{display:'flex', alignItems:'center', background:'#f8fafc', border:'1px solid #cbd5e1', borderRadius:6, padding:'6px 10px'}}>
        <Search size={16} color="#94a3b8"/>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{border:'none', outline:'none', background:'transparent', width:'100%', fontSize:'0.85rem', paddingLeft:8}}
        />
      </div>
      {open && input && pos && (
        <div style={{position:'fixed', top:pos.top, left:pos.left, width:pos.width, background:'#fff', border:'1px solid #cbd5e1', borderRadius:6, maxHeight:pos.maxHeight, overflow:'auto', zIndex:200, boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}}>
          {results.length === 0 ? (
            onAddNew ? (
              <div
                onClick={() => { onAddNew(input); setInput(''); setOpen(false); }}
                style={{padding:'10px 12px', cursor:'pointer', fontSize:'0.8rem'}}
                onMouseEnter={e=>e.currentTarget.style.background='#f0fdf4'}
                onMouseLeave={e=>e.currentTarget.style.background=''}
              >
                <div style={{color:'#64748b', marginBottom:4}}>Không tìm thấy "{input}".</div>
                <div style={{color:'#0891b2', fontWeight:700, display:'flex', alignItems:'center', gap:6}}><Plus size={15}/> Thêm mã hàng hóa mới</div>
              </div>
            ) : (
              <div style={{padding:10, fontSize:'0.8rem', color:'#64748b', textAlign:'center'}}>Không tìm thấy kết quả</div>
            )
          ) :
            results.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleSelect(item)}
                style={{padding:'8px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:'0.8rem'}}
                onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'}
                onMouseLeave={e=>e.currentTarget.style.background=''}
              >
                <b>{item[keyField]}</b> - {item[labelField]}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// Ô chọn Nhà cung cấp: đã chọn → hiện chip có nút đổi; chưa chọn → ô gõ-tìm gợi ý từ danh mục NCC.
function NccPicker({ value, suppliers, onPick, onClear }) {
  if (value) {
    return (
      <div className="no-print" style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:'1px solid #cbd5e1', borderRadius:6, padding:'8px 10px' }}>
        <Truck size={15} color="#be123c" style={{ flexShrink:0 }} />
        <span style={{ flex:1, fontWeight:700, color:'#0f172a', fontSize:'0.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</span>
        <button type="button" onClick={onClear} title="Đổi nhà cung cấp" style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', display:'flex', padding:0 }}><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="no-print">
      <AutoSuggest
        data={suppliers}
        keyField="ma_ncc"
        labelField="ten_ncc"
        extraFields={['so_dien_thoai', 'nguoi_lien_he']}
        placeholder="Gõ tên / mã / SĐT nhà cung cấp..."
        onChange={onPick}
      />
      <span style={{ display:'block', fontSize:'0.7rem', color:'#94a3b8', marginTop:4 }}>NCC chưa có? Thêm ở tab <b>Danh mục NCC</b>.</span>
    </div>
  );
}

// Mã đơn hàng để in vào cột "Mã đơn hàng" của phiếu, theo loại nguồn của khối:
//  - 'none'  (Khác / Nhập mới)     → mã nhập tay (orderCode)
//  - 'ncc'   (Nhập mua vào)        → mã DLK đề xuất
//  - 'order' (Nhập hoàn/hủy)       → mã đơn hàng (sourceValue, tra từ luu_xuat)
// psx (Nhập thành phẩm / dư SX) không phải mã đơn hàng nên bỏ trống.
const blockOrderCode = (b) =>
  (b.orderCode && b.orderCode.trim())
  || (b.dlkCode && b.dlkCode.trim())
  || (b.sourceType === 'order' && b.sourceValue ? String(b.sourceValue).trim() : '')
  || '';

export default function ImportStockTab({ dlkPrefill, onDlkConsumed, onImportComplete, perms = { view: true, create: true, edit: true, delete: true, io: true }, catalogCreatePerm = false }) {
  const [catalog, setCatalog] = useState([]);
  const [suppliers, setSuppliers] = useState([]);   // danh mục NCC cho ô gõ-tìm gợi ý
  const [addItemCtx, setAddItemCtx] = useState(null); // { blockId, code } — mở form thêm mã HH mới ngay tại đây
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  // Mô hình "source-block": mỗi khối = 1 nguồn (PSX / mã đơn / NCC) + danh sách hàng của nguồn đó.
  // block = { id, sourceType:'psx'|'order'|'ncc'|'none', sourceValue, dlkCode, items:[...] }
  const [blocks, setBlocks] = useState([]);
  const [pasteCodes, setPasteCodes] = useState('');   // ô dán nhiều mã đơn cho Nhập hoàn/hủy
  const [hoanHuyMatches, setHoanHuyMatches] = useState([]);  // khi gõ 6 số cuối khớp nhiều mã đơn → cho user click chọn
  const [openDlkList, setOpenDlkList] = useState([]);  // danh sách DLK đang mở để chọn (Nhập mua vào)
  const [allOrders, setAllOrders] = useState([]);
  const [shortfallRows, setShortfallRows] = useState([]);   // các DLK vừa nhập còn thiếu so SL Đặt → hộp kết quả
  const [shortfallBusy, setShortfallBusy] = useState(false); // đang xử lý LC2
  const [successOrder, setSuccessOrder] = useState('');      // mã PNK vừa lưu → mở hộp kết quả (thay popup trình duyệt)
  const [psxDateFilter, setPsxDateFilter] = useState('');    // lọc phiếu SX theo ngày (yyyy-mm-dd) trong ô "Thêm phiếu SX"
  const [psxSearchFilter, setPsxSearchFilter] = useState(''); // lọc phiếu SX theo mã thành phẩm / mã phiếu

  const blockIdRef = useRef(1);
  const newBlockId = () => blockIdRef.current++;

  // Chống trùng chứng từ chờ in: 1 token/phiếu (ổn định suốt lần điền) + cờ chặn bấm-kép tức thì.
  const importTokenRef = useRef(null);
  const submittingRef = useRef(false);

  const initBlocksFor = (r) => {
    if (r === 'Nhập mua vào') return [{ id: newBlockId(), sourceType: 'ncc', sourceValue: '', dlkCode: '', items: [] }];
    if (r === 'Nhập mới' || r === 'Khác') return [{ id: newBlockId(), sourceType: 'none', sourceValue: '', dlkCode: '', orderCode: '', items: [] }];
    return []; // psx / order: tạo block khi fetch nguồn
  };

  const resetModal = () => { setReason(''); setBlocks([]); setPasteCodes(''); };

  const totalItems = blocks.reduce((n, b) => n + b.items.length, 0);

  // --- Helpers cập nhật block ---
  const updateBlock = (blockId, updater) => setBlocks(prev => prev.map(b => b.id === blockId ? updater(b) : b));
  const removeBlock = (blockId) => setBlocks(prev => prev.filter(b => b.id !== blockId));
  const addNccBlock = () => setBlocks(prev => [...prev, { id: newBlockId(), sourceType: 'ncc', sourceValue: '', dlkCode: '', items: [] }]);
  const addNoneBlock = () => setBlocks(prev => [...prev, { id: newBlockId(), sourceType: 'none', sourceValue: '', dlkCode: '', orderCode: '', items: [] }]);

  // Gắn ĐVT + vị trí tồn kho hiện tại cho danh sách item (dùng cho dư SX & hoàn/hủy)
  const attachUnitsAndStock = async (newItems) => {
    const itemCodes = newItems.map(i => i.code);
    if (itemCodes.length > 0) {
      const { data: catData } = await db.from('inventory_items').select('code, unit').in('code', itemCodes);
      if (catData) {
        newItems.forEach(i => {
          const match = catData.find(c => c.code === i.code);
          if (match && match.unit) i.unit = match.unit;
        });
      }
      const { data: stockData } = await db.from('inventory_stock').select('*').in('item_code', itemCodes);
      if (stockData) {
        newItems.forEach(i => {
          const sItems = stockData.filter(s => s.item_code === i.code);
          if (sItems.length > 0) {
            i.locations = sItems.map(s => ({ id: s.id, location: s.location || 'Kho', current_qty: s.quantity || 0, import_qty: 0 }));
          }
        });
      }
    }
    return newItems;
  };

  // Tạo item từ một DLK đề xuất. Trần nhập = SL đặt (actual_qty) − đã nhận (theo dlk_code).
  // maxQty dùng chung cơ chế validate + hiển thị "Tối đa" sẵn có; điền sẵn import_qty = trần.
  const buildDlkItem = async (info) => {
    const ordered = Number(info.qty) || 0;
    let nhapRows = [];
    if (info.dlk_code) {
      const { data } = await db.from('du_lieu_nhap').select('so_luong_nhap').eq('dlk_code', info.dlk_code);
      nhapRows = data || [];
    }
    const { received, capMax } = dlkImportCap(ordered, nhapRows);
    const { data: stockData } = await db.from('inventory_stock').select('*').eq('item_code', info.item_code);
    let locations = (stockData || []).map(sx => ({ id: sx.id, location: sx.location || 'Kho Chính', current_qty: sx.quantity || 0, import_qty: 0 }));
    if (locations.length > 0) locations[0].import_qty = capMax;
    else locations = [{ id: null, location: 'Kho Chính', current_qty: 0, import_qty: capMax }];
    return { code: info.item_code, name: info.item_name, unit: info.unit, locations, fromDlk: true, maxQty: capMax, dlkOrdered: ordered, dlkReceived: received };
  };

  // Luồng navigate từ tab Đề xuất (nút "Nhập") → mở "Nhập mua vào" với 1 khối DLK
  useEffect(() => {
    if (!dlkPrefill) return;
    (async () => {
      setReason('Nhập mua vào');
      importTokenRef.current = newDocToken();
      const item = await buildDlkItem({
        item_code: dlkPrefill.item_code, item_name: dlkPrefill.item_name, qty: dlkPrefill.qty, unit: dlkPrefill.unit,
        dlk_code: dlkPrefill.dlk_code || ''
      });
      setBlocks([{ id: newBlockId(), sourceType: 'ncc', sourceValue: '', dlkCode: dlkPrefill.dlk_code || '', items: [item] }]);
      if (onDlkConsumed) onDlkConsumed();
    })();
  }, [dlkPrefill]);

  // Load danh sách DLK đang mở khi chọn "Nhập mua vào"
  useEffect(() => {
    if (reason === 'Nhập mua vào') {
      db.from('purchase_proposals')
        .select('dlk_code, item_code, item_name, actual_qty, unit')
        .not('trang_thai', 'in', '("Đã về kho đủ","Hủy")')
        .order('dlk_code', { ascending: false })
        .then(({ data }) => setOpenDlkList(data || []));
    }
  }, [reason]);

  // Load danh mục hàng hóa để auto suggest và danh sách phiếu sản xuất
  useEffect(() => {
    const loadData = async () => {
      const allItems = await getCatalogItems().catch(e => { console.error("Error fetching catalog:", e); return []; });
      setCatalog(allItems);

      const { data: ordersData } = await db.from('production_orders').select('id, order_code, product_code, target_quantity, status, created_at').order('created_at', { ascending: false });
      if (ordersData) setAllOrders(ordersData);

      // Danh mục NCC cho ô chọn nhà cung cấp (nhỏ ~vài trăm dòng). Lỗi (bảng chưa tạo) → để trống, không chặn nhập.
      const { data: nccData, error: nccErr } = await db.from('nha_cung_cap').select('ma_ncc, ten_ncc, so_dien_thoai, nguoi_lien_he, dia_chi').order('ten_ncc');
      if (nccErr) console.error('Không tải được danh mục NCC:', nccErr.message);
      else if (nccData) setSuppliers(nccData);
    };
    loadData();
  }, []);

  // Reset bộ lọc chọn phiếu SX mỗi khi đổi loại phiếu (mở/đóng modal)
  useEffect(() => { setPsxDateFilter(''); setPsxSearchFilter(''); }, [reason]);

  // Thêm 1 hàng hóa vào 1 khối (Nhập mua vào / Nhập mới / Khác)
  const handleSelectItem = async (blockId, catItem) => {
    const block = blocks.find(b => b.id === blockId);
    if (block && block.items.find(i => i.code === catItem.item_code)) {
      alert("Hàng hóa này đã có trong khối nhập này!");
      return;
    }
    setLoading(true);
    const { data: stockData } = await db.from('inventory_stock').select('*').eq('item_code', catItem.item_code);
    const locations = (stockData || []).map(s => ({ id: s.id, location: s.location || 'Kho Chính', current_qty: s.quantity || 0, import_qty: 0 }));
    const newItem = { code: catItem.item_code, name: catItem.item_name, unit: catItem.unit, maxQty: catItem.maxQty, locations };
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, items: [...b.items, newItem] } : b));
    setLoading(false);
  };

  // Chọn DLK cho một khối NCC → điền tự động mã hàng của DLK
  const handleSelectDlk = async (blockId, code) => {
    if (!code) {
      setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, dlkCode: '', items: b.items.filter(i => !i.fromDlk) } : b));
      return;
    }
    const found = openDlkList.find(d => d.dlk_code === code);
    if (!found) return;
    if (blocks.some(b => b.id !== blockId && b.dlkCode === code)) { alert('DLK này đã được chọn ở khối khác — tránh nhập trùng vượt trần.'); return; }
    const item = await buildDlkItem({ item_code: found.item_code, item_name: found.item_name, qty: found.actual_qty, unit: found.unit, dlk_code: found.dlk_code });
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, dlkCode: code, items: [item] } : b));
  };

  // Thêm 1 phiếu SX (thành phẩm / dư sản xuất) thành 1 khối nguồn
  const handleAddPSX = async (orderCode) => {
    if (!orderCode) return;
    if (blocks.find(b => b.sourceValue === orderCode)) { alert("Phiếu SX này đã được thêm!"); return; }
    setLoading(true);
    try {
      if (reason === 'Nhập thành phẩm') {
        const order = allOrders.find(o => o.order_code === orderCode);
        if (!order || !order.product_code) { alert("Phiếu SX không có mã thành phẩm!"); setLoading(false); return; }
        let catItem = catalog.find(c => c.item_code === order.product_code);
        if (!catItem) {
          const { data } = await db.from('bom_items').select('product_name').eq('product_code', order.product_code).limit(1);
          const pName = (data && data.length > 0 && data[0].product_name) ? data[0].product_name : 'Thành phẩm ' + order.product_code;
          catItem = { item_code: order.product_code, item_name: pName, unit: 'Bộ' };
        }
        // maxQty = đã sản xuất - đã nhập
        let totalProduced = 0;
        const { data: prodLogs } = await db.from('production_logs').select('actual_quantity').eq('order_id', order.id);
        if (prodLogs) totalProduced = prodLogs.reduce((sum, log) => sum + parseFloat(log.actual_quantity || 0), 0);
        let totalImported = 0;
        const { data: importLogs } = await db.from('du_lieu_nhap').select('so_luong_nhap').eq('ma_ncc', orderCode).eq('ly_do_nhap', 'Nhập thành phẩm');
        if (importLogs) totalImported = importLogs.reduce((sum, log) => sum + parseFloat(log.so_luong_nhap || 0), 0);
        const maxQty = Math.max(0, Math.floor(totalProduced - totalImported));

        const { data: stockData } = await db.from('inventory_stock').select('*').eq('item_code', catItem.item_code);
        const locations = (stockData || []).map(s => ({ id: s.id, location: s.location || 'Kho Chính', current_qty: s.quantity || 0, import_qty: 0 }));
        const item = { code: catItem.item_code, name: catItem.item_name, unit: catItem.unit, maxQty, locations };
        setBlocks(prev => [...prev, { id: newBlockId(), sourceType: 'psx', sourceValue: orderCode, dlkCode: '', items: [item] }]);
      } else {
        // Nhập dư sản xuất: lấy linh kiện đã xuất cho phiếu này
        const { data, error } = await db.from('inventory_picking_logs').select('*').eq('order_code', orderCode).neq('product_code', 'NHAP_KHO');
        if (error) { alert("Lỗi truy xuất: " + error.message); setLoading(false); return; }
        if (!data || data.length === 0) { alert(`Phiếu ${orderCode}: không tìm thấy dữ liệu xuất linh kiện!`); setLoading(false); return; }
        const grouped = {};
        data.forEach(it => {
          const c = it.component_code;
          if (!grouped[c]) grouped[c] = { code: c, name: it.component_name, returnedQty: Math.abs(it.quantity_taken), unit: 'Cái', locations: [], selected: false };
          else grouped[c].returnedQty += Math.abs(it.quantity_taken);
        });
        const items = await attachUnitsAndStock(Object.values(grouped));
        setBlocks(prev => [...prev, { id: newBlockId(), sourceType: 'psx', sourceValue: orderCode, dlkCode: '', items }]);
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi: " + e.message);
    }
    setLoading(false);
  };

  // Gom các dòng luu_xuat của 1 mã đơn thành 1 khối (mỗi mã hàng 1 dòng)
  const buildHoanHuyBlock = async (fullCode, rows) => {
    const grouped = {};
    rows.forEach(item => {
      if (!grouped[item.ma_san_pham]) grouped[item.ma_san_pham] = { code: item.ma_san_pham, name: item.ten_san_pham, returnedQty: item.so_luong, unit: 'Cái', locations: [] };
      else grouped[item.ma_san_pham].returnedQty += item.so_luong;
    });
    const items = await attachUnitsAndStock(Object.values(grouped));
    return { id: newBlockId(), sourceType: 'order', sourceValue: fullCode, dlkCode: '', items };
  };

  // Nhập hoàn/hủy:
  //  - Dán NHIỀU mã đơn cách nhau bằng dấu cách → mỗi mã khớp CHÍNH XÁC, 1 khối/mã.
  //  - Nhập 1 mã (không có dấu cách)            → khớp theo ĐUÔI (VD gõ 6 số cuối):
  //    khớp đúng 1 đơn → nạp thẳng; khớp nhiều đơn → đổ vào hoanHuyMatches cho user click chọn.
  const handleFetchHoanHuy = async () => {
    const raw = (pasteCodes || '').trim();
    if (!raw) return alert("Vui lòng nhập Mã đơn hàng!");
    const codes = [...new Set(raw.split(/\s+/).map(c => c.trim().toUpperCase()).filter(Boolean))];

    // --- Chế độ 1 mã: tìm theo ĐUÔI (khớp mã đơn kết thúc bằng chuỗi đã gõ) ---
    if (codes.length === 1) {
      const suffix = codes[0];
      setHoanHuyMatches([]);
      setLoading(true);
      const { data, error } = await db.from('luu_xuat').select('*').ilike('ma_don_hang', '%' + suffix);
      setLoading(false);
      if (error || !data || data.length === 0) return alert("Không tìm thấy dữ liệu cho: " + suffix);
      const distinct = [...new Set(data.map(r => r.ma_don_hang))];
      if (distinct.length === 1) {
        const fullCode = distinct[0];
        if (blocks.find(b => b.sourceValue === fullCode)) { setPasteCodes(''); return alert("Đã có sẵn mã đơn: " + fullCode); }
        const block = await buildHoanHuyBlock(fullCode, data);
        setBlocks(prev => [...prev, block]);
        setPasteCodes('');
        return;
      }
      // Khớp nhiều mã đơn → hiện danh sách để user click chọn 1 đơn
      setHoanHuyMatches(distinct.map(code => ({ code, lines: data.filter(r => r.ma_don_hang === code).length })));
      return;
    }

    // --- Chế độ nhiều mã: khớp CHÍNH XÁC tuyệt đối như cũ ---
    setHoanHuyMatches([]);
    setLoading(true);
    const newBlocks = [];
    const missing = [];
    const skipped = [];
    for (const code of codes) {
      if (blocks.find(b => b.sourceValue === code) || newBlocks.find(b => b.sourceValue === code)) { skipped.push(code); continue; }
      const { data, error } = await db.from('luu_xuat').select('*').eq('ma_don_hang', code);
      if (error) { missing.push(code); continue; }
      if (!data || data.length === 0) { missing.push(code); continue; }
      newBlocks.push(await buildHoanHuyBlock(code, data));
    }
    if (newBlocks.length > 0) setBlocks(prev => [...prev, ...newBlocks]);
    setPasteCodes('');
    setLoading(false);
    const msgs = [];
    if (missing.length) msgs.push("Không tìm thấy dữ liệu cho: " + missing.join(', '));
    if (skipped.length) msgs.push("Đã có sẵn (bỏ qua): " + skipped.join(', '));
    if (msgs.length) alert(msgs.join('\n'));
  };

  // Click chọn 1 mã đơn từ danh sách khớp (khi gõ 6 số cuối trùng nhiều đơn)
  const pickHoanHuyMatch = async (fullCode) => {
    setHoanHuyMatches([]);
    if (blocks.find(b => b.sourceValue === fullCode)) { setPasteCodes(''); return alert("Đã có sẵn mã đơn: " + fullCode); }
    setLoading(true);
    const { data, error } = await db.from('luu_xuat').select('*').eq('ma_don_hang', fullCode);
    setLoading(false);
    if (error || !data || data.length === 0) return alert("Không tìm thấy dữ liệu cho: " + fullCode);
    const block = await buildHoanHuyBlock(fullCode, data);
    setBlocks(prev => [...prev, block]);
    setPasteCodes('');
  };

  // --- Cập nhật item trong block ---
  const handleUpdateImportQty = (blockId, itemIdx, locIdx, val) => {
    const num = Number(val);
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const items = [...b.items];
      const locs = [...items[itemIdx].locations];
      locs[locIdx] = { ...locs[locIdx], import_qty: num };
      items[itemIdx] = { ...items[itemIdx], locations: locs };
      return { ...b, items };
    }));
  };

  const handleAddLocation = (blockId, itemIdx) => {
    const locName = prompt("Nhập tên vị trí mới:");
    if (!locName || !locName.trim()) return;
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const items = [...b.items];
      if (items[itemIdx].locations.find(l => l.location === locName.trim())) {
        alert("Vị trí này đã có trong danh sách!");
        return b;
      }
      items[itemIdx] = { ...items[itemIdx], locations: [...items[itemIdx].locations, { id: null, location: locName.trim(), current_qty: 0, import_qty: 0 }] };
      return { ...b, items };
    }));
  };

  const handleRemoveItem = (blockId, itemIdx) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, items: b.items.filter((_, i) => i !== itemIdx) } : b));
  };

  const handleToggleItem = (blockId, itemIdx) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const items = [...b.items];
      items[itemIdx] = { ...items[itemIdx], selected: items[itemIdx].selected === false ? true : false };
      return { ...b, items };
    }));
  };

  const generateOrderCode = async () => {
    const yyyymmdd = todayLocal().replace(/-/g, '');
    const prefix = `PNK-${yyyymmdd}-`;

    const { data, error } = await db
      .from('inventory_picking_logs')
      .select('order_code')
      .ilike('order_code', `${prefix}%`)
      .order('order_code', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (!error && data && data.length > 0) {
      const lastCode = data[0].order_code;
      const parts = lastCode.split('-');
      if (parts.length === 3) {
        nextNum = parseInt(parts[2], 10) + 1;
      }
    }
    return `${prefix}${nextNum.toString().padStart(2, '0')}`;
  };

  const executeImport = async () => {
    if (totalItems === 0) return alert("Vui lòng chọn hàng hóa để nhập!");
    if (!reason) return alert("Vui lòng chọn Lý do nhập!");

    // Phải có ít nhất 1 vị trí có SL > 0
    let hasQuantity = false;
    for (const b of blocks) {
      for (const item of b.items) {
        if (item.selected === false) continue;
        for (const loc of item.locations) if (Number(loc.import_qty) > 0) hasQuantity = true;
      }
    }
    if (!hasQuantity) return alert("Bạn chưa nhập số lượng nhập (phải > 0) cho vị trí nào cả!");

    // Validate trần SL cho mọi item có maxQty (Nhập thành phẩm theo phiếu SX; Nhập mua vào theo DLK: đặt − đã nhận)
    for (const b of blocks) {
      for (const item of b.items) {
        if (item.selected === false) continue;
        if (item.maxQty === undefined) continue;
        const total = item.locations.reduce((sum, loc) => sum + (parseFloat(loc.import_qty) || 0), 0);
        if (total > item.maxQty) {
          const ctx = item.fromDlk
            ? `DLK ${b.dlkCode || ''}: chỉ được nhập tối đa ${item.maxQty} (đã đặt ${item.dlkOrdered} − đã nhận ${item.dlkReceived}).`
            : `phiếu ${b.sourceValue}: nhập quá số lượng cho phép! Tối đa ${item.maxQty}, đang nhập ${total}.`;
          return alert(`Hàng hóa ${item.code} — ${ctx}`);
        }
      }
    }

    // Cảnh báo khối thiếu nguồn
    const needSource = reason !== 'Nhập mới' && reason !== 'Khác';
    if (needSource) {
      const anyMissing = blocks.some(b => b.items.some(i => i.selected !== false) && !String(b.sourceValue || '').trim());
      if (anyMissing && !window.confirm("Có khối chưa điền nguồn (NCC / Mã phiếu / Mã đơn). Vẫn tiếp tục?")) return;
    }

    // Chặn bấm-kép tức thì (đồng bộ, không chờ re-render như disabled={loading}).
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    try {
      const userStr = localStorage.getItem('qlsx_user') || 'Nhân viên';

      // CHỐT CHỐNG TRÙNG: chiếm token TRƯỚC khi sinh mã / trừ-cộng kho.
      // Nếu token đã dùng (bấm lại / tải lại / nhiều tab) → dừng, không tạo chứng từ lần 2.
      if (!importTokenRef.current) importTokenRef.current = newDocToken();
      const claim = await claimDocToken(importTokenRef.current, { kind: 'import', createdBy: userStr });
      if (!claim.ok) {
        alert('Phiếu nhập này đã được lưu rồi' + (claim.orderCode ? ` (mã ${claim.orderCode})` : '') + '. Không tạo chứng từ trùng.');
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      const orderCode = await generateOrderCode();
      await setDocTokenOrderCode(importTokenRef.current, orderCode);
      const todayStr = todayLocal();

      const duLieuNhap = [];
      const wipUpdates = [];
      // Gộp tồn kho theo (mã hàng, vị trí) trên toàn bộ block để tránh ghi đè khi trùng mã/vị trí
      const agg = {}; // key = code||location

      for (const b of blocks) {
        for (const item of b.items) {
          if (item.selected === false) continue;

          let totalForItem = 0;
          let mainLocation = '';
          for (const loc of item.locations) {
            const q = Number(loc.import_qty) || 0;
            if (q > 0) {
              totalForItem += q;
              if (!mainLocation) mainLocation = loc.location;
              const key = item.code + '||' + loc.location;
              if (!agg[key]) {
                agg[key] = { code: item.code, name: item.name, unit: item.unit, location: loc.location, id: loc.id || null, current_qty: Number(loc.current_qty) || 0, sumImport: 0, sources: new Set(), orderCodes: new Set() };
              }
              if (!agg[key].id && loc.id) { agg[key].id = loc.id; agg[key].current_qty = Number(loc.current_qty) || 0; }
              agg[key].sumImport += q;
              // Breakdown theo nguồn: chỉ dùng cho "Nhập thành phẩm" để mỗi dòng log
              // mang wip_source riêng (hủy phiếu trả WIP đúng phiếu SX nguồn).
              if (reason === 'Nhập thành phẩm') {
                const src = b.sourceValue || '';
                if (!agg[key].bySource) agg[key].bySource = {};
                agg[key].bySource[src] = (agg[key].bySource[src] || 0) + q;
              }
              if (b.sourceValue) agg[key].sources.add(b.sourceValue);
              // Mã đơn hàng (nhập tay / DLK / hoàn-hủy) — khớp cột "Mã đơn hàng" trên bản in.
              const donCode = blockOrderCode(b);
              if (donCode) agg[key].orderCodes.add(donCode);
            }
          }

          if (totalForItem > 0) {
            // 1 dòng du_lieu_nhap / mỗi nguồn → giữ truy vết nguồn gốc
            duLieuNhap.push({
              ngay_nhap: todayStr,
              ma_hang: item.code,
              ten_hang: item.name,
              so_luong_nhap: totalForItem,
              ma_ncc: b.sourceValue || '',
              kho_nhap: mainLocation || 'Kho',
              ly_do_nhap: reason,
              dlk_code: (reason === 'Nhập mua vào' && b.dlkCode) ? b.dlkCode : null,
              ma_don_hang_nhap: (b.sourceType === 'none' && b.orderCode) ? b.orderCode.trim() : null,
              phieu_code: orderCode, // truy vết về chứng từ PNK để Hủy Phiếu xóa đúng dòng
            });

            // Trừ tồn WIP nếu nhập thành phẩm (theo phiếu SX nguồn)
            if (reason === 'Nhập thành phẩm' && b.sourceValue && b.sourceValue.startsWith('PSX-')) {
              const { data: wipStock } = await db.from('inventory_stock')
                .select('id, quantity')
                .eq('item_code', item.code)
                .eq('location', `SX9-${b.sourceValue}`)
                .maybeSingle();
              if (wipStock) {
                wipUpdates.push(db.from('inventory_stock').update({ quantity: wipStock.quantity - totalForItem }).eq('id', wipStock.id));
              }
            }
          }
        }
      }

      // Từ map gộp → cập nhật/insert tồn kho + picking log (1 dòng / mỗi vị trí)
      const updates = [...wipUpdates];
      const inserts = [];
      const pickingLogs = [];
      for (const key in agg) {
        const a = agg[key];
        const before = a.current_qty;
        const after = before + a.sumImport;
        const srcStr = [...a.sources].join(', ');
        if (a.id) {
          updates.push(db.from('inventory_stock').update({ quantity: after, import_date: todayStr }).eq('id', a.id));
        } else {
          inserts.push({ item_code: a.code, item_name: a.name, unit: a.unit, location: a.location, quantity: a.sumImport, import_date: todayStr });
        }
        if (reason === 'Nhập thành phẩm' && a.bySource && Object.keys(a.bySource).length > 0) {
          // 1 dòng log / mỗi phiếu SX nguồn — wip_source để Hủy Phiếu cộng trả đúng WIP.
          let running = before;
          for (const [src, q] of Object.entries(a.bySource)) {
            pickingLogs.push({
              order_code: orderCode,
              product_code: 'NHAP_KHO',
              component_code: a.code,
              component_name: a.name,
              location: a.location,
              quantity_before: running,
              quantity_taken: q,
              quantity_after: running + q,
              created_by: userStr,
              notes: src ? `${reason} - ${src}` : reason,
              ma_don_hang: a.orderCodes.size > 0 ? [...a.orderCodes].join(', ') : null,
              wip_source: src && src.startsWith('PSX-') ? src : null,
            });
            running += q;
          }
        } else {
          pickingLogs.push({
            order_code: orderCode,
            product_code: 'NHAP_KHO',
            component_code: a.code,
            component_name: a.name,
            location: a.location,
            quantity_before: before,
            quantity_taken: a.sumImport,
            quantity_after: after,
            created_by: userStr,
            notes: srcStr ? `${reason} - ${srcStr}` : reason,
            ma_don_hang: a.orderCodes.size > 0 ? [...a.orderCodes].join(', ') : null
          });
        }
      }

      // Thực thi
      await Promise.all(updates);
      if (inserts.length > 0) {
        const { error } = await db.from('inventory_stock').insert(inserts);
        if (error) console.error("Lỗi insert stock:", error);
      }
      if (pickingLogs.length > 0) {
        const { error } = await db.from('inventory_picking_logs').insert(pickingLogs);
        if (error) console.error("Lỗi insert log:", error);
      }
      if (duLieuNhap.length > 0) {
        const { error } = await db.from('du_lieu_nhap').insert(duLieuNhap);
        if (error) console.error("Lỗi insert du_lieu_nhap:", error);
      }

      // Xác định các DLK vừa nhập còn thiếu so với SL Đặt (actual_qty) → hiện trong hộp kết quả
      let shortfall = [];
      if (reason === 'Nhập mua vào') {
        const dlkCodes = [...new Set(blocks.map(b => b.dlkCode).filter(Boolean))];
        if (dlkCodes.length > 0) {
          const { data: props } = await db.from('purchase_proposals')
            .select('id, dlk_code, item_code, item_name, unit, calculated_qty, actual_qty, bom_qty, retail_qty, tien_do, trang_thai, source, note, ngay_de_xuat, ngay_du_kien, batch_id, created_at')
            .in('dlk_code', dlkCodes);
          const { data: nhapRows } = await db.from('du_lieu_nhap').select('dlk_code, so_luong_nhap').in('dlk_code', dlkCodes);
          const recvMap = {};
          (nhapRows || []).forEach(r => { if (r.dlk_code) recvMap[r.dlk_code] = (recvMap[r.dlk_code] || 0) + (Number(r.so_luong_nhap) || 0); });
          shortfall = (props || [])
            .map(p => ({ ...p, received: recvMap[p.dlk_code] || 0 }))
            .filter(p => (p.received) < (Number(p.actual_qty) || 0));
        }
      }

      setBlocks(initBlocksFor(reason));
      setPasteCodes('');
      setShortfallRows(shortfall);        // danh sách đề xuất nhận thiếu (có thể rỗng)
      setSuccessOrder(orderCode);         // mở hộp kết quả (thay popup trình duyệt xấu)
      importTokenRef.current = newDocToken(); // phiếu mới (nếu tiếp tục nhập) → token mới

    } catch (e) {
      console.error(e);
      // Thất bại trước khi ghi được chứng từ → nhả token để sửa & lưu lại được.
      await releaseDocToken(importTokenRef.current);
      importTokenRef.current = newDocToken();
      alert("Có lỗi xảy ra khi cập nhật kho: " + e.message);
    }
    submittingRef.current = false;
    setLoading(false);
  };

  // LC1: giữ đề xuất — chỉ đánh dấu đã xử lý dòng trong hộp (không đổi cấu trúc DB).
  const handleKeepProposal = (id) => {
    setShortfallRows(prev => prev.map(r => r.id === id ? { ...r, _resolved: 'keep' } : r));
  };
  // LC2: đóng đề xuất + lưu trữ + tạo/cộng dồn đề xuất mới cho phần thiếu.
  const handleCloseAndReorder = async (row) => {
    setShortfallBusy(true);
    try {
      const user = localStorage.getItem('qlsx_user') || 'Nhân viên';
      const res = await closeProposalWithShortfall({ orig: row, received: row.received, archivedBy: user });
      setShortfallRows(prev => prev.map(r => r.id === row.id ? { ...r, _resolved: 'close', _newDlk: res.shortfallDlkCode, _shortfall: res.shortfall } : r));
    } catch (e) {
      console.error(e);
      alert('Lỗi đóng đề xuất: ' + e.message);
    }
    setShortfallBusy(false);
  };
  // Đóng hộp kết quả → đóng phiếu nhập → quay về tab đã mở phiếu (nếu có).
  const handleFinishImport = () => {
    setSuccessOrder('');
    setShortfallRows([]);
    setReason('');
    if (onImportComplete) onImportComplete();
  };

  const s = {
    input: { padding:'6px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:'0.85rem', width:'100%', outline:'none' },
    label: { fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:4, display:'block' },
    btn: { padding:'8px 16px', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.85rem' }
  };

  const showItemCheckbox = (reason === 'Nhập dư sản xuất' || reason === 'Nhập hoàn/hủy');

  // Ngày của phiếu SX cho bộ lọc lịch: ưu tiên ngày nhúng trong mã (PSX-YYYYMMDD-… → 'YYYY-MM-DD');
  // mã không đúng định dạng thì lùi về ngày tạo bản ghi (created_at).
  const psxDateOf = (o) => {
    const m = /(\d{4})(\d{2})(\d{2})/.exec(o.order_code || '');
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return (o.created_at || '').slice(0, 10);
  };

  // Danh sách phiếu SX cho ô "Thêm phiếu SX" sau khi áp trạng thái + bộ lọc ngày/mã thành phẩm.
  const psxSearch = psxSearchFilter.trim().toLowerCase();
  const psxOptions = allOrders
    .filter(o => reason === 'Nhập thành phẩm' ? true : (o.status === 'pending' || o.status === 'in_progress'))
    .filter(o => !blocks.find(b => b.sourceValue === o.order_code))
    .filter(o => !psxDateFilter || psxDateOf(o) === psxDateFilter)
    .filter(o => !psxSearch || (o.product_code || '').toLowerCase().includes(psxSearch) || (o.order_code || '').toLowerCase().includes(psxSearch));

  // Tổng SL nhập theo (mã hàng, vị trí) trên TẤT CẢ các khối — để "Tồn sau" phản ánh
  // đúng kết quả gộp khi nhiều nguồn cùng đẩy 1 mã về cùng 1 vị trí (khớp executeImport).
  const locTotals = {};
  for (const b of blocks) {
    for (const item of b.items) {
      if (item.selected === false) continue;
      for (const loc of item.locations) {
        const key = item.code + '||' + loc.location;
        locTotals[key] = (locTotals[key] || 0) + (Number(loc.import_qty) || 0);
      }
    }
  }

  // Render 1 thẻ hàng hóa (dùng chung cho mọi block)
  const renderItemCard = (block, item, idx) => (
    <div key={idx} className={item.selected === false ? "no-print" : ""} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', background: item.selected === false ? '#f8fafc' : '#fff', overflow: 'hidden', opacity: item.selected === false ? 0.6 : 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      {/* Product Header */}
      <div style={{ padding: '0.8rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '8px', background: item.selected === false ? '#f8fafc' : '#f1f5f9' }}>
        {showItemCheckbox && (
          <input
            type="checkbox"
            checked={item.selected !== false}
            onChange={() => handleToggleItem(block.id, idx)}
            className="no-print"
            style={{ width: 18, height: 18, marginTop: 2, accentColor: '#0ea5e9', cursor: 'pointer' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem', lineHeight: '1.3', marginBottom: 4 }}>{item.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
            <span>Mã: <b style={{color: '#0f172a'}}>{item.code}</b></span>
            <span>ĐVT: <b style={{color: '#0f172a'}}>{item.unit}</b></span>
            {item.returnedQty !== undefined && <span>Đã xuất: <b style={{color: '#0f172a'}}>{item.returnedQty}</b></span>}
            {item.maxQty !== undefined && <span style={{ color: '#ef4444' }}>Tối đa: <b>{item.maxQty}</b></span>}
          </div>
        </div>
        <button className="no-print" onClick={()=>handleRemoveItem(block.id, idx)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:4}} title="Xóa">
          <Trash2 size={18}/>
        </button>
      </div>

      {/* Locations */}
      <div style={{ padding: '0.5rem 0' }}>
        {item.locations.length === 0 ? (
          <div style={{ padding: '0.8rem', textAlign: 'center', color: '#ef4444', fontStyle: 'italic', fontSize: '0.75rem', background: '#fef2f2', margin: '0 0.8rem', borderRadius: 6 }}>
            ⚠️ Chưa có vị trí nhập kho. Bấm "Thêm vị trí" ở dưới.
          </div>
        ) : (
          item.locations.map((loc, lIdx) => (
            <div key={lIdx} style={{ padding: '0.6rem 0.5rem', display: 'flex', gap: '6px', borderBottom: lIdx < item.locations.length - 1 ? '1px dashed #e2e8f0' : 'none', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1.2, minWidth: 0 }}>
                <div style={{fontSize: '0.55rem', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0, whiteSpace: 'nowrap'}}>Vị trí nhập</div>
                <div style={{fontWeight: 700, fontSize: '0.75rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{loc.location}</div>
              </div>
              <div style={{ flex: 1.2, minWidth: 0 }}>
                <div style={{fontSize: '0.55rem', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0, whiteSpace: 'nowrap'}}>SL nhập</div>
                <input
                  type="number" min="0" value={loc.import_qty || ''}
                  onChange={e => handleUpdateImportQty(block.id, idx, lIdx, e.target.value)}
                  placeholder="0"
                  disabled={item.selected === false}
                  style={{ ...s.input, padding: '0.3rem 0', textAlign: 'center', borderColor: item.selected === false ? '#cbd5e1' : '#10b981', color: item.selected === false ? '#94a3b8' : '#10b981', fontWeight: 'bold', width: '100%', maxWidth: '60px', fontSize: '0.8rem', borderRadius: 4, background: item.selected === false ? '#f1f5f9' : '#fff' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{fontSize: '0.55rem', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0, whiteSpace: 'nowrap'}}>Tồn trước</div>
                <div style={{fontWeight: 600, fontSize: '0.75rem', color: '#64748b'}}>{loc.current_qty}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{fontSize: '0.55rem', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0, whiteSpace: 'nowrap'}}>Tồn sau</div>
                <div style={{fontWeight: 700, fontSize: '0.75rem', color: '#10b981'}}>{(item.selected === false) ? Number(loc.current_qty) : (Number(loc.current_qty) + (locTotals[item.code + '||' + loc.location] || 0))}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="no-print" style={{ padding: '0.5rem 0.8rem 0.8rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9' }}>
        <button
          onClick={() => handleAddLocation(block.id, idx)}
          disabled={item.selected === false}
          style={{ background: 'none', border: 'none', color: '#0891b2', fontSize: '0.75rem', fontWeight: 600, cursor: item.selected === false ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={14}/> Thêm vị trí
        </button>
      </div>
    </div>
  );

  // NCC khớp nguồn đầu tiên (để in địa chỉ/SĐT lên phiếu; không khớp thì bỏ trống)
  const printSourceName = blocks.map(b => b.sourceValue).find(Boolean);
  const printNcc = printSourceName ? suppliers.find(x => x.ten_ncc === printSourceName) : null;

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background:'#f8fafc', position:'relative'}}>
      {/* Ẩn giao diện thao tác khi in */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; background: #fff !important; box-shadow: none !important; border: none !important;}
          .no-print { display: none !important; }
          body, html, #root, main { overflow: visible !important; height: auto !important; background: #fff !important; }
          /* Ghi đè các thuộc tính có thể gây lỗi clipping layout */
          div { overflow: visible !important; }
          th, td { border-color: #333 !important; }
          th { background: #f2f2f2 !important; -webkit-print-color-adjust: exact; }
          input { border: none !important; padding: 0 !important; background: transparent !important; outline: none !important; }
          /* Ẩn bớt cột công cụ thao tác khi in */
          .no-print-col { display: none !important; }
        }
      `}</style>

      {/* Màn hình chính luôn hiển thị các Card */}
      <div style={{padding:'1rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'center', flex:1, overflow:'auto'}}>
          <h2 style={{fontSize:'0.95rem', color:'#0f172a', marginBottom:'1rem', fontWeight:700, textAlign:'center'}}>Chọn loại phiếu nhập kho</h2>
          {!perms.create && <div style={{padding:'2rem 1rem', textAlign:'center', color:'#94a3b8', fontSize:'0.85rem'}}>Bạn chỉ có quyền xem Kho — không có quyền nhập kho.</div>}
          {perms.create && <div style={{display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10, width:'100%', maxWidth:480}}>
            {IMPORT_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => { setReason(type.id); setBlocks(initBlocksFor(type.id)); setPasteCodes(''); importTokenRef.current = newDocToken(); }}
                  style={{
                    background:'#fff', borderRadius:14, border:'1px solid #eef2f7', padding:'0.9rem 0.3rem',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem',
                    cursor:'pointer', transition:'all 0.2s', boxShadow:'0 2px 6px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={e => {e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = type.color;}}
                  onMouseLeave={e => {e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#eef2f7';}}
                >
                  <div style={{width:44, height:44, borderRadius:12, background:type.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 3px 8px ${type.color}40`}}>
                    <Icon size={22} />
                  </div>
                  <span style={{fontSize:'0.72rem', fontWeight:700, color:'#334155', textAlign:'center', lineHeight:1.2}}>{type.label}</span>
                </button>
              )
            })}
          </div>}
      </div>

      {/* Modal nhập liệu */}
      {reason && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'1rem'}} onClick={resetModal}>
          <div style={{background:'#fff', borderRadius:'1rem', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)', width:'100%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', animation:'fadeIn 0.2s ease-out'}} onClick={e=>e.stopPropagation()}>

            {/* Modal Header */}
            <div className="no-print" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.5rem', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', flexShrink:0}}>
              <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:700, color:'#0f172a', display:'flex', alignItems:'center', gap:8}}>
                 {(() => {
                   const typeObj = IMPORT_TYPES.find(t => t.id === reason);
                   if (!typeObj) return null;
                   const Icon = typeObj.icon;
                   return <Icon size={20} color={typeObj.color} />;
                 })()}
                 Tạo phiếu: {reason}
              </h2>
              <button onClick={resetModal} style={{background:'none', border:'none', color:'#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'50%', fontSize:'1.2rem', transition:'all 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.color='#ef4444';}} onMouseLeave={e=>{e.currentTarget.style.background='none'; e.currentTarget.style.color='#94a3b8';}}>✕</button>
            </div>

            {/* Modal Body */}
            <div style={{flex:1, overflow:'auto', padding:'1.5rem'}}>

              {/* Vùng chọn nguồn (đa nguồn) — theo loại phiếu */}
              {(reason === 'Nhập thành phẩm' || reason === 'Nhập dư sản xuất') && (
                <div className="no-print" style={{marginBottom:'1.25rem', background:'#f8fafc', padding:'1rem', borderRadius:'0.75rem', border:'1px solid #e2e8f0'}}>
                  <label style={s.label}>Thêm phiếu SX <span style={{fontWeight:400, color:'#94a3b8'}}>(chọn nhiều lần để nhập nhiều phiếu cùng lúc)</span></label>

                  {/* Bộ lọc: theo ngày (lịch) + theo mã thành phẩm — thu hẹp danh sách phiếu bên dưới */}
                  <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:8}}>
                    <input
                      type="date"
                      value={psxDateFilter}
                      onChange={e => setPsxDateFilter(e.target.value)}
                      title="Lọc theo ngày phiếu SX"
                      style={{...s.input, padding:'6px 8px', width:'auto', flex:'0 0 auto'}}
                    />
                    <input
                      type="text"
                      value={psxSearchFilter}
                      onChange={e => setPsxSearchFilter(e.target.value)}
                      placeholder="Tìm mã thành phẩm..."
                      style={{...s.input, padding:'6px 8px', flex:'1 1 140px', minWidth:120}}
                    />
                    {(psxDateFilter || psxSearchFilter) && (
                      <button
                        type="button"
                        onClick={() => { setPsxDateFilter(''); setPsxSearchFilter(''); }}
                        style={{...s.btn, background:'#e2e8f0', color:'#475569', padding:'6px 10px'}}
                      >
                        <X size={14}/> Xóa lọc
                      </button>
                    )}
                  </div>

                  <select
                    style={{...s.input, padding:'8px', fontSize:'0.85rem'}}
                    value=""
                    onChange={e => { if (e.target.value) handleAddPSX(e.target.value); }}
                  >
                    <option value="">-- Chọn phiếu SX để thêm ({psxOptions.length} phiếu) --</option>
                    {psxOptions.map(o => (
                      <option key={o.order_code} value={o.order_code}>
                        {o.order_code} ({o.product_code || '—'}{o.target_quantity != null ? ` · SL ${o.target_quantity}` : ''})
                      </option>
                    ))}
                  </select>
                  {psxOptions.length === 0 && (
                    <div style={{fontSize:'0.75rem', color:'#ef4444', marginTop:6}}>
                      Không có phiếu SX khớp bộ lọc{(psxDateFilter || psxSearchFilter) ? ' — thử xóa lọc.' : '.'}
                    </div>
                  )}
                </div>
              )}

              {reason === 'Nhập hoàn/hủy' && (
                <div className="no-print" style={{marginBottom:'1.25rem', background:'#f8fafc', padding:'1rem', borderRadius:'0.75rem', border:'1px solid #e2e8f0'}}>
                  <label style={s.label}>Mã đơn hàng <span style={{fontWeight:400, color:'#94a3b8'}}>(nhiều mã: cách nhau bằng dấu cách · 1 mã: gõ được 6 số cuối)</span></label>
                  <div style={{display:'flex', gap:5}}>
                    <input
                      style={{...s.input, padding:'8px'}}
                      value={pasteCodes}
                      onChange={e=>{ setPasteCodes(e.target.value.toUpperCase()); if (hoanHuyMatches.length) setHoanHuyMatches([]); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleFetchHoanHuy(); }}
                      placeholder="Nhiều mã: DH01 DH02 · 1 mã: 6 số cuối, VD 001234"
                    />
                    <button onClick={handleFetchHoanHuy} style={{...s.btn, background:'#0284c7', color:'#fff', padding:'8px 12px'}}>
                      <Search size={16}/>
                    </button>
                  </div>
                  {hoanHuyMatches.length > 0 && (
                    <div style={{marginTop:8, border:'1px solid #cbd5e1', borderRadius:'0.5rem', background:'#fff', overflow:'hidden'}}>
                      <div style={{padding:'6px 10px', fontSize:'0.78rem', color:'#475569', background:'#f1f5f9', borderBottom:'1px solid #e2e8f0'}}>
                        Khớp <b>{hoanHuyMatches.length}</b> mã đơn — chọn 1 đơn:
                      </div>
                      {hoanHuyMatches.map(m => (
                        <button
                          key={m.code}
                          type="button"
                          onClick={() => pickHoanHuyMatch(m.code)}
                          style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', textAlign:'left', padding:'8px 10px', background:'#fff', border:'none', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:'0.85rem'}}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <span style={{fontWeight:600, color:'#0f172a'}}>{m.code}</span>
                          <span style={{fontSize:'0.75rem', color:'#94a3b8'}}>{m.lines} mã hàng</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Khu vực in + danh sách block */}
              <div id="print-area" style={{width:'100%', background:'#fff'}}>
                <style>{`@media print { .only-print { display: block !important; } }`}</style>

                {/* Bản in giống mẫu Excel (PHIẾU NHẬP KHO) — chỉ hiện khi in */}
                <div className="only-print" style={{display:'none'}}>
                  <WarehouseReceiptPrint
                    kind="NK"
                    date={new Date()}
                    source={[...new Set(blocks.map(b => b.sourceValue).filter(Boolean))].join(', ') || reason}
                    reason={reason}
                    diaChi={printNcc ? (printNcc.dia_chi || '') : ''}
                    sdt={printNcc ? (printNcc.so_dien_thoai || '') : ''}
                    rows={blocks.flatMap(b =>
                      b.items.filter(it => it.selected !== false).flatMap(it =>
                        it.locations.filter(loc => (Number(loc.import_qty) || 0) > 0).map(loc => ({
                          ma: it.code, ten: it.name, dvt: it.unit || '',
                          sl: Number(loc.import_qty) || 0, kho: loc.location,
                          maDonHang: blockOrderCode(b),
                        }))
                      )
                    )}
                  />
                </div>

                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {blocks.map((block) => (
                    <div key={block.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff' }}>

                      {/* Block source header */}
                      <div style={{ padding:'0.7rem 0.9rem', background:'#eef2ff', borderBottom:'1px solid #e2e8f0' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            {block.sourceType === 'ncc' && (
                              <>
                                <label style={s.label} className="no-print">Nhà cung cấp</label>
                                <NccPicker
                                  value={block.sourceValue}
                                  suppliers={suppliers}
                                  onPick={ncc=>updateBlock(block.id, b=>({ ...b, sourceValue: ncc.ten_ncc }))}
                                  onClear={()=>updateBlock(block.id, b=>({ ...b, sourceValue: '' }))}
                                />
                                <span className="only-print" style={{display:'none', fontWeight:700, color:'#0f172a'}}>Nhà cung cấp: {block.sourceValue || '---'}</span>
                                <label style={{...s.label, marginTop:8}} className="no-print">Mã DLK đề xuất (tùy chọn)</label>
                                <select
                                  className="no-print"
                                  style={{...s.input, padding:'8px'}}
                                  value={block.dlkCode}
                                  onChange={e=>handleSelectDlk(block.id, e.target.value)}
                                >
                                  <option value="">-- Không liên kết DLK --</option>
                                  {openDlkList.map(d=>(
                                    <option key={d.dlk_code} value={d.dlk_code}>
                                      {d.dlk_code} | {d.item_code} | SL đề xuất: {d.actual_qty} {d.unit}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                            {block.sourceType === 'none' && (
                              <>
                                <label style={s.label} className="no-print">Nhà cung cấp</label>
                                <NccPicker
                                  value={block.sourceValue}
                                  suppliers={suppliers}
                                  onPick={ncc=>updateBlock(block.id, b=>({ ...b, sourceValue: ncc.ten_ncc }))}
                                  onClear={()=>updateBlock(block.id, b=>({ ...b, sourceValue: '' }))}
                                />
                                <span className="only-print" style={{display:'none', fontWeight:700, color:'#0f172a'}}>Nhà cung cấp: {block.sourceValue || '---'}</span>
                                <label style={{...s.label, marginTop:8}} className="no-print">Mã đơn hàng nhập (tùy chọn)</label>
                                <input
                                  className="no-print"
                                  style={{...s.input, padding:'8px'}}
                                  value={block.orderCode || ''}
                                  onChange={e=>updateBlock(block.id, b=>({ ...b, orderCode: e.target.value }))}
                                  placeholder="VD: PO-2026-001"
                                />
                                <span className="only-print" style={{display:'none', fontWeight:700, color:'#0f172a'}}>Mã đơn hàng nhập: {block.orderCode || '---'}</span>
                              </>
                            )}
                            {block.sourceType === 'psx' && (
                              <div style={{ fontWeight:700, color:'#3730a3', fontSize:'0.85rem' }}>📋 Phiếu SX: {block.sourceValue}</div>
                            )}
                            {block.sourceType === 'order' && (
                              <div style={{ fontWeight:700, color:'#3730a3', fontSize:'0.85rem' }}>📄 Đơn hàng: {block.sourceValue}</div>
                            )}
                          </div>
                          <button className="no-print" onClick={()=>removeBlock(block.id)} title="Xóa khối" style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:4, flexShrink:0}}>
                            <Trash2 size={18}/>
                          </button>
                        </div>

                        {block.sourceType === 'ncc' && block.dlkCode && (
                          <div className="no-print" style={{marginTop:8, padding:'8px 12px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, fontSize:'0.8rem', color:'#7c3aed', fontWeight:600}}>
                            🔒 Đang nhập theo đề xuất <strong>{block.dlkCode}</strong> — mã hàng đã được điền tự động. Bỏ chọn DLK để nhập mã khác.
                          </div>
                        )}

                        {(block.sourceType === 'ncc' || block.sourceType === 'none') && !(block.sourceType === 'ncc' && block.dlkCode) && (
                          <div className="no-print" style={{marginTop:10}}>
                            <label style={s.label}>Tìm và thêm hàng hóa</label>
                            <AutoSuggest
                              data={catalog}
                              placeholder="🔍 Gõ mã hoặc tên hàng hóa cần nhập..."
                              onChange={(it)=>handleSelectItem(block.id, it)}
                              onAddNew={catalogCreatePerm ? (text)=>setAddItemCtx({ blockId: block.id, code: (text||'').trim() }) : undefined}
                            />
                          </div>
                        )}
                      </div>

                      {/* Items của block */}
                      <div style={{ padding:'0.8rem', display:'flex', flexDirection:'column', gap:'0.8rem' }}>
                        {block.items.length === 0 ? (
                          <div className="no-print" style={{ padding:'0.5rem', textAlign:'center', color:'#94a3b8', fontStyle:'italic', fontSize:'0.8rem' }}>
                            Chưa có hàng hóa trong khối này.
                          </div>
                        ) : (
                          block.items.map((item, idx) => renderItemCard(block, item, idx))
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Nút thêm khối NCC cho Nhập mua vào */}
                {reason === 'Nhập mua vào' && (
                  <button
                    className="no-print"
                    onClick={addNccBlock}
                    style={{...s.btn, marginTop:'1rem', background:'#ecfdf5', color:'#059669', border:'1px dashed #6ee7b7', width:'100%', justifyContent:'center', padding:'10px'}}
                  >
                    <Plus size={16}/> Thêm nhà cung cấp
                  </button>
                )}

                {/* Nút thêm mã đơn hàng (khối mới) cho Khác / Nhập mới */}
                {(reason === 'Khác' || reason === 'Nhập mới') && (
                  <button
                    className="no-print"
                    onClick={addNoneBlock}
                    style={{...s.btn, marginTop:'1rem', background:'#ecfdf5', color:'#059669', border:'1px dashed #6ee7b7', width:'100%', justifyContent:'center', padding:'10px'}}
                  >
                    <Plus size={16}/> Thêm mã đơn hàng
                  </button>
                )}

                {/* Trạng thái rỗng */}
                {totalItems === 0 && blocks.length === 0 && (
                  <div className="no-print" style={{margin:'2rem 0', color:'#94a3b8', fontStyle:'italic', textAlign:'center', width:'100%'}}>
                    Vui lòng điền thông tin và thêm hàng hóa để bắt đầu.
                  </div>
                )}

                {/* Actions */}
                <div className="no-print" style={{marginTop:'1.5rem', display:'flex', justifyContent:'flex-end', gap:'1rem'}}>
                   <button
                     onClick={resetModal}
                     style={{...s.btn, background:'#f1f5f9', color:'#64748b', padding:'10px 20px', fontSize:'0.9rem'}}
                   >
                     Hủy
                   </button>
                   <button
                     onClick={executeImport}
                     disabled={loading}
                     style={{...s.btn, background:'#10b981', color:'#fff', padding:'10px 20px', fontSize:'0.9rem', boxShadow:'0 4px 6px -1px rgba(16, 185, 129, 0.4)'}}
                   >
                     {loading ? <Loader2 size={18} className="spin"/> : <Check size={18}/>} LƯU PHIẾU
                   </button>
                </div>

              </div>

              {loading && totalItems === 0 && (
                <div className="no-print" style={{display:'flex', justifyContent:'center', margin:'1.5rem 0'}}>
                  <Loader2 size={32} className="spin" color="#0891b2"/>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Thêm nhanh mã hàng hóa mới ngay tại màn hình nhập → tự chọn vào khối */}
      {addItemCtx && (
        <AddCatalogItemModal
          initialCode={addItemCtx.code}
          onClose={()=>setAddItemCtx(null)}
          onSaved={(item)=>{
            setCatalog(prev => [...prev, item]);        // để lần tìm sau thấy ngay
            invalidateCatalog();                        // cache dùng chung tải lại có mã mới
            handleSelectItem(addItemCtx.blockId, item); // tự thêm vào khối đang nhập
            setAddItemCtx(null);
          }}
        />
      )}

      {/* Hộp kết quả nhập kho: báo thành công + (nếu nhận < SL Đặt) chọn giữ/đóng đề xuất — thay popup trình duyệt */}
      {successOrder && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:'1rem'}}>
          <div style={{background:'#fff', borderRadius:'1rem', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)', width:'100%', maxWidth:640, maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden'}}>
            <div style={{padding:'1.1rem 1.5rem', borderBottom:'1px solid #e2e8f0', background:'#f0fdf4', display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:40, height:40, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                <CheckCircle size={24} color="#16a34a"/>
              </div>
              <div>
                <h2 style={{margin:0, fontSize:'1.02rem', fontWeight:700, color:'#15803d'}}>Đã lưu phiếu nhập kho {successOrder}</h2>
                <p style={{margin:'2px 0 0', fontSize:'0.75rem', color:'#64748b'}}>Trạng thái "Chưa in" — xem lại ở tab Quản Lý Chứng Từ.</p>
              </div>
            </div>
            <div style={{flex:1, overflow:'auto', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
              {shortfallRows.length === 0 ? (
                <div style={{textAlign:'center', color:'#16a34a', fontWeight:600, fontSize:'0.85rem', padding:'0.5rem 0'}}>Nhập kho hoàn tất — không có đề xuất nào nhận thiếu.</div>
              ) : (
                <>
                  <div style={{fontSize:'0.8rem', color:'#c2410c', fontWeight:600}}>
                    {shortfallRows.length} đề xuất nhận chưa đủ số đặt — chọn cách xử lý:
                  </div>
                  {shortfallRows.map(row => {
                    const con = Math.max(0, (Number(row.actual_qty) || 0) - (Number(row.received) || 0));
                    return (
                      <div key={row.id} style={{border:'1px solid #e2e8f0', borderRadius:10, padding:'0.75rem 0.9rem', background: row._resolved ? '#f0fdf4' : '#f8fafc'}}>
                        <div style={{fontWeight:700, color:'#0f172a', fontSize:'0.85rem'}}>{row.item_code} — <span style={{fontWeight:500, color:'#64748b'}}>{row.item_name}</span></div>
                        <div style={{fontSize:'0.72rem', color:'#475569', margin:'4px 0 8px', display:'flex', flexWrap:'wrap', gap:'2px 14px'}}>
                          <span>DLK: <b style={{color:'#7c3aed'}}>{row.dlk_code}</b></span>
                          <span>Đặt: <b>{Number(row.actual_qty).toLocaleString('vi-VN')}</b></span>
                          <span>Đã nhận: <b style={{color:'#059669'}}>{Number(row.received).toLocaleString('vi-VN')}</b></span>
                          <span>Còn thiếu: <b style={{color:'#dc2626'}}>{con.toLocaleString('vi-VN')}</b></span>
                        </div>
                        {row._resolved === 'keep' ? (
                          <div style={{fontSize:'0.75rem', fontWeight:600, color:'#0369a1', display:'flex', alignItems:'center', gap:6}}><Check size={14}/> Đã giữ đề xuất (còn {con.toLocaleString('vi-VN')}/{Number(row.actual_qty).toLocaleString('vi-VN')})</div>
                        ) : row._resolved === 'close' ? (
                          <div style={{fontSize:'0.75rem', fontWeight:600, color:'#15803d', display:'flex', alignItems:'center', gap:6}}><Check size={14}/> Đã đóng &amp; lưu trữ{row._shortfall > 0 ? ` — tạo ĐX mới ${Number(row._shortfall).toLocaleString('vi-VN')} (${row._newDlk})` : ''}</div>
                        ) : (
                          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                            <button onClick={()=>handleKeepProposal(row.id)} disabled={shortfallBusy}
                              style={{...s.btn, padding:'7px 12px', fontSize:'0.78rem', background:'#0ea5e9', color:'#fff', border:'none'}}>
                              Giữ đề xuất (còn {con.toLocaleString('vi-VN')})
                            </button>
                            <button onClick={()=>handleCloseAndReorder(row)} disabled={shortfallBusy}
                              style={{...s.btn, padding:'7px 12px', fontSize:'0.78rem', background:'#fff7ed', color:'#ea580c', border:'1px solid #fdba74'}}>
                              {shortfallBusy ? <Loader2 size={14} className="spin"/> : <Archive size={14}/>} Đóng &amp; tạo ĐX mới cho phần thiếu
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            <div style={{padding:'0.75rem 1.25rem', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'flex-end'}}>
              <button onClick={handleFinishImport} disabled={shortfallBusy} style={{...s.btn, background:'#16a34a', color:'#fff', padding:'9px 26px'}}>Xong</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
