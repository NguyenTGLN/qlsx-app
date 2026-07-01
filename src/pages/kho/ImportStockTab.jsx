import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Search, Loader2, Plus, Trash2, Printer, CheckCircle, Package, Check, ShoppingCart, RefreshCw, XCircle, MoreHorizontal, ArrowLeft } from 'lucide-react';

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
function AutoSuggest({ onChange, placeholder, data, keyField = 'item_code', labelField = 'item_name' }) {
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

  const results = data.filter(item =>
    (item[keyField]||'').toLowerCase().includes(input.toLowerCase()) ||
    (item[labelField]||'').toLowerCase().includes(input.toLowerCase())
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
          {results.length === 0 ? <div style={{padding:10, fontSize:'0.8rem', color:'#64748b', textAlign:'center'}}>Không tìm thấy kết quả</div> :
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

export default function ImportStockTab({ dlkPrefill, onDlkConsumed, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  // Mô hình "source-block": mỗi khối = 1 nguồn (PSX / mã đơn / NCC) + danh sách hàng của nguồn đó.
  // block = { id, sourceType:'psx'|'order'|'ncc'|'none', sourceValue, dlkCode, items:[...] }
  const [blocks, setBlocks] = useState([]);
  const [pasteCodes, setPasteCodes] = useState('');   // ô dán nhiều mã đơn cho Nhập hoàn/hủy
  const [openDlkList, setOpenDlkList] = useState([]);  // danh sách DLK đang mở để chọn (Nhập mua vào)
  const [allOrders, setAllOrders] = useState([]);

  const blockIdRef = useRef(1);
  const newBlockId = () => blockIdRef.current++;

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
    let received = 0;
    if (info.dlk_code) {
      const { data: nhap } = await db.from('du_lieu_nhap').select('so_luong_nhap').eq('dlk_code', info.dlk_code);
      received = (nhap || []).reduce((sum, r) => sum + (Number(r.so_luong_nhap) || 0), 0);
    }
    const capMax = Math.max(0, ordered - received);
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
      let allItems = [];
      let from = 0;
      let limit = 1000;
      let hasMore = true;
      while(hasMore) {
         const { data: catData, error } = await db.from('inventory_items').select('item_code, item_name, unit').range(from, from + limit - 1);
         if (error) {
            console.error("Error fetching catalog:", error);
            hasMore = false;
         } else if (catData && catData.length > 0) {
            allItems = [...allItems, ...catData];
            from += limit;
            if (catData.length < limit) hasMore = false;
         } else {
            hasMore = false;
         }
      }
      setCatalog(allItems);

      const { data: ordersData } = await db.from('production_orders').select('id, order_code, product_code, status').order('created_at', { ascending: false });
      if (ordersData) setAllOrders(ordersData);
    };
    loadData();
  }, []);

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

  // Nhập hoàn/hủy: dán nhiều mã đơn cách nhau bằng dấu cách → mỗi mã 1 khối
  const handleFetchHoanHuy = async () => {
    const raw = (pasteCodes || '').trim();
    if (!raw) return alert("Vui lòng nhập Mã đơn hàng!");
    const codes = [...new Set(raw.split(/\s+/).map(c => c.trim().toUpperCase()).filter(Boolean))];
    setLoading(true);
    const newBlocks = [];
    const missing = [];
    const skipped = [];
    for (const code of codes) {
      if (blocks.find(b => b.sourceValue === code) || newBlocks.find(b => b.sourceValue === code)) { skipped.push(code); continue; }
      const { data, error } = await db.from('luu_xuat').select('*').eq('ma_don_hang', code);
      if (error) { missing.push(code); continue; }
      if (!data || data.length === 0) { missing.push(code); continue; }
      const grouped = {};
      data.forEach(item => {
        if (!grouped[item.ma_san_pham]) grouped[item.ma_san_pham] = { code: item.ma_san_pham, name: item.ten_san_pham, returnedQty: item.so_luong, unit: 'Cái', locations: [] };
        else grouped[item.ma_san_pham].returnedQty += item.so_luong;
      });
      const items = await attachUnitsAndStock(Object.values(grouped));
      newBlocks.push({ id: newBlockId(), sourceType: 'order', sourceValue: code, dlkCode: '', items });
    }
    if (newBlocks.length > 0) setBlocks(prev => [...prev, ...newBlocks]);
    setPasteCodes('');
    setLoading(false);
    const msgs = [];
    if (missing.length) msgs.push("Không tìm thấy dữ liệu cho: " + missing.join(', '));
    if (skipped.length) msgs.push("Đã có sẵn (bỏ qua): " + skipped.join(', '));
    if (msgs.length) alert(msgs.join('\n'));
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

    setLoading(true);
    try {
      const orderCode = await generateOrderCode();
      const userStr = localStorage.getItem('qlsx_user') || 'Nhân viên';
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
                agg[key] = { code: item.code, name: item.name, unit: item.unit, location: loc.location, id: loc.id || null, current_qty: Number(loc.current_qty) || 0, sumImport: 0, sources: new Set() };
              }
              if (!agg[key].id && loc.id) { agg[key].id = loc.id; agg[key].current_qty = Number(loc.current_qty) || 0; }
              agg[key].sumImport += q;
              if (b.sourceValue) agg[key].sources.add(b.sourceValue);
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
          notes: srcStr ? `${reason} - ${srcStr}` : reason
        });
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

      setBlocks(initBlocksFor(reason));
      setPasteCodes('');
      alert(`Đã hoàn tất lưu chứng từ nhập kho ${orderCode}!\nHệ thống đã lưu trạng thái "Chưa in". Vui lòng xem ở tab Quản Lý Chứng Từ.`);

    } catch (e) {
      console.error(e);
      alert("Có lỗi xảy ra khi cập nhật kho: " + e.message);
    }
    setLoading(false);
  };

  const s = {
    input: { padding:'6px 10px', border:'1px solid #cbd5e1', borderRadius:6, fontSize:'0.85rem', width:'100%', outline:'none' },
    label: { fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:4, display:'block' },
    btn: { padding:'8px 16px', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.85rem' }
  };

  const showItemCheckbox = (reason === 'Nhập dư sản xuất' || reason === 'Nhập hoàn/hủy');

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

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background:'#f8fafc', position:'relative'}}>
      {/* Ẩn giao diện thao tác khi in */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute !important; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; background: #fff !important; box-shadow: none !important; border: none !important;}
          .no-print { display: none !important; }
          body, html, #root, main { overflow: visible !important; height: auto !important; background: #fff !important; }
          /* Ghi đè các thuộc tính có thể gây lỗi clipping layout */
          div { overflow: visible !important; }
          .print-signature { display: flex !important; justify-content: space-around; margin-top: 50px; text-align: center; }
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
                  onClick={() => { setReason(type.id); setBlocks(initBlocksFor(type.id)); setPasteCodes(''); }}
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
                  <select
                    style={{...s.input, padding:'8px', fontSize:'0.85rem'}}
                    value=""
                    onChange={e => { if (e.target.value) handleAddPSX(e.target.value); }}
                  >
                    <option value="">-- Chọn phiếu SX để thêm --</option>
                    {allOrders
                      .filter(o => reason === 'Nhập thành phẩm' ? true : (o.status === 'pending' || o.status === 'in_progress'))
                      .filter(o => !blocks.find(b => b.sourceValue === o.order_code))
                      .map(o => (
                        <option key={o.order_code} value={o.order_code}>{o.order_code}</option>
                      ))}
                  </select>
                </div>
              )}

              {reason === 'Nhập hoàn/hủy' && (
                <div className="no-print" style={{marginBottom:'1.25rem', background:'#f8fafc', padding:'1rem', borderRadius:'0.75rem', border:'1px solid #e2e8f0'}}>
                  <label style={s.label}>Mã đơn hàng <span style={{fontWeight:400, color:'#94a3b8'}}>(dán nhiều mã, cách nhau bằng dấu cách)</span></label>
                  <div style={{display:'flex', gap:5}}>
                    <input
                      style={{...s.input, padding:'8px'}}
                      value={pasteCodes}
                      onChange={e=>setPasteCodes(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') handleFetchHoanHuy(); }}
                      placeholder="VD: DH01 DH02 DH03"
                    />
                    <button onClick={handleFetchHoanHuy} style={{...s.btn, background:'#0284c7', color:'#fff', padding:'8px 12px'}}>
                      <Search size={16}/>
                    </button>
                  </div>
                </div>
              )}

              {/* Khu vực in + danh sách block */}
              <div id="print-area" style={{width:'100%', background:'#fff'}}>
                <h2 className="only-print" style={{display:'none', textAlign:'center', fontSize:20, color:'#0f172a', margin:'0 0 20px 0', letterSpacing:1}}>PHIẾU NHẬP KHO</h2>
                <style>{`@media print { .only-print { display: block !important; } }`}</style>

                <div className="only-print" style={{display:'none', justifyContent:'space-between', marginBottom:20, fontSize:'0.9rem', color:'#334155'}}>
                   <div>
                     <p style={{margin:'4px 0'}}><strong>Lý do nhập:</strong> {reason}</p>
                     <p style={{margin:'4px 0'}}><strong>Nguồn:</strong> {blocks.map(b => b.sourceValue).filter(Boolean).join(', ') || '---'}</p>
                   </div>
                   <div style={{textAlign:'right'}}>
                     <p style={{margin:'4px 0'}}><strong>Ngày lập:</strong> {new Date().toLocaleDateString('vi-VN')}</p>
                     <p style={{margin:'4px 0'}}><strong>Người tạo:</strong> {localStorage.getItem('qlsx_user') || 'Nhân viên'}</p>
                   </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {blocks.map((block) => (
                    <div key={block.id} style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', background:'#fff' }}>

                      {/* Block source header */}
                      <div style={{ padding:'0.7rem 0.9rem', background:'#eef2ff', borderBottom:'1px solid #e2e8f0' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            {block.sourceType === 'ncc' && (
                              <>
                                <label style={s.label} className="no-print">Nhà cung cấp</label>
                                <input
                                  className="no-print"
                                  style={{...s.input, padding:'8px'}}
                                  value={block.sourceValue}
                                  onChange={e=>updateBlock(block.id, b=>({ ...b, sourceValue: e.target.value }))}
                                  placeholder="VD: NCC A"
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
                                <input
                                  className="no-print"
                                  style={{...s.input, padding:'8px'}}
                                  value={block.sourceValue}
                                  onChange={e=>updateBlock(block.id, b=>({ ...b, sourceValue: e.target.value }))}
                                  placeholder="VD: NCC A"
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

                <div className="print-signature" style={{display:'none'}}>
                   <div>
                     <b>Người giao hàng</b><br/>
                     <i>(Ký, ghi rõ họ tên)</i>
                   </div>
                   <div>
                     <b>Thủ kho</b><br/>
                     <i>(Ký, ghi rõ họ tên)</i>
                   </div>
                   <div>
                     <b>Người tạo phiếu</b><br/>
                     <i>(Ký, ghi rõ họ tên)</i><br/><br/><br/>
                     {localStorage.getItem('qlsx_user') || 'Nhân viên'}
                   </div>
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

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
