import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase as db } from '../../lib/supabase';
import { todayLocal } from '../../lib/dateUtils';
import { Loader2, RefreshCw, Factory, Trash2, ChevronDown, ChevronRight, Plus, Pencil, X, Search } from 'lucide-react';
import { loadBomMap, loadComponentStock, loadComponentStockExclWip, recomputeProposals } from '../../lib/dksxEngine';
import { computeReplenishQty } from '../../lib/mrp';

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.7rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:'#475569' },
};
const th = { padding:'0.4rem 0.35rem', borderBottom:'2px solid #e2e8f0', fontSize:'0.68rem', fontWeight:700, color:'#64748b', textAlign:'center', whiteSpace:'nowrap' };
const td = { padding:'0.35rem', textAlign:'center', verticalAlign:'middle', fontVariantNumeric:'tabular-nums' };

function pctColor(p) { return p >= 100 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626'; }

// Modal "Thêm / Sửa nhu cầu SX" — điểm ghi DUY NHẤT của tính năng này vào production_demand.
// SET đúng số gõ vào — KHÔNG so sánh với số cũ, KHÔNG giữ số lớn hơn (không có quy tắc MAX).
// Đây là bài học từ vụ ECO-100RO 29/07: quy tắc MAX ở màn hình Tồn HH (đã gỡ) từng khiến một
// lần gõ nhầm 300 thay vì 1 nâng VĨNH VIỄN nhu cầu sản xuất thật (259 → 300), vì MAX chỉ tăng
// không giảm — gõ lại số đúng không sửa được nữa. Ở đây gõ lại số đúng là sửa được ngay.
//
// initialCode có giá trị khi mở từ bút chì trên MỘT dòng có sẵn ở bảng DKSX → khoá cứng sản
// phẩm đó, không cho đổi sang mã khác (đây là chỗ sửa một dòng cụ thể, không phải chỗ duyệt
// danh sách để thêm mới).
function DemandModal({ initialCode, bomMap, itemInfoMap, demandRows, computeSuggestion, onClose, onSaved }) {
  const [selectedCode, setSelectedCode] = useState(initialCode || null);
  const [filterText, setFilterText] = useState('');
  const [qtyInput, setQtyInput] = useState(() => (initialCode ? String(computeSuggestion(initialCode)) : ''));
  const [saving, setSaving] = useState(false);

  const finishedCodes = useMemo(() => Object.keys(bomMap).sort(), [bomMap]);
  const filteredCodes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const list = !q ? finishedCodes : finishedCodes.filter(c => {
      const name = (itemInfoMap[c]?.item_name || '').toLowerCase();
      return c.toLowerCase().includes(q) || name.includes(q);
    });
    return list.slice(0, 200); // danh sách vài trăm mã — gõ lọc để thu hẹp, khỏi dựng phân trang
  }, [finishedCodes, filterText, itemInfoMap]);

  const pickCode = (code) => {
    setSelectedCode(code);
    setQtyInput(String(computeSuggestion(code))); // mặc định = số tính lại → đúng yêu cầu "1 click là xong"
  };

  const selInfo = selectedCode ? (itemInfoMap[selectedCode] || {}) : {};
  const existingRow = selectedCode ? demandRows.find(r => r.item_code === selectedCode) : null;
  const currentQty = existingRow ? (Number(existingRow.qty_demand) || 0) : null;

  const qtyNum = Number(qtyInput);
  const qtyValid = qtyInput.trim() !== '' && Number.isFinite(qtyNum) && qtyNum >= 0;

  const handleSave = async () => {
    if (!selectedCode || !qtyValid || saving) return;
    setSaving(true);
    try {
      // Đọc lại NGAY TRƯỚC KHI GHI — không tin danh sách `rows` đang hiển thị ở bảng (chỉ tải
      // các dòng qty_demand>0, có thể đã cũ hoặc bỏ sót dòng qty_demand=0 do Hủy trước đó nhưng
      // theo uq_prod_demand_item vẫn còn đúng 1 dòng cho mã này). Đây là căn cứ DUY NHẤT để
      // quyết định insert hay update — tách biệt với phần hiển thị "SL đã chốt hiện tại" phía dưới.
      const { data: ex, error: selErr } = await db.from('production_demand')
        .select('id, qty_demand').eq('item_code', selectedCode).maybeSingle();
      if (selErr) throw selErr;

      const oldQtyDisplay = ex ? Math.round((Number(ex.qty_demand) || 0) * 1000) / 1000 : null;
      const newQtyDisplay = Math.round(qtyNum * 1000) / 1000;
      const label = `${selectedCode}${selInfo.item_name ? ' - ' + selInfo.item_name : ''}`;
      const confirmMsg = ex
        ? `Cập nhật nhu cầu SX ${label}?\n${oldQtyDisplay.toLocaleString('vi-VN')} → ${newQtyDisplay.toLocaleString('vi-VN')}`
        : `Tạo mới nhu cầu SX ${label}: ${newQtyDisplay.toLocaleString('vi-VN')}${selInfo.unit ? ' ' + selInfo.unit : ''}?`;
      if (!window.confirm(confirmMsg)) { setSaving(false); return; }

      // GHI ĐÚNG SỐ NGƯỜI DÙNG GÕ (qtyNum) — không so sánh, không MAX, không cộng dồn với ex.qty_demand.
      if (ex) {
        const { error } = await db.from('production_demand').update({
          qty_demand: qtyNum, trang_thai: 'Mới', updated_at: new Date().toISOString(),
        }).eq('id', ex.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('production_demand').insert({
          item_code: selectedCode, item_name: selInfo.item_name || '', unit: selInfo.unit || '',
          qty_demand: qtyNum, ngay_de_xuat: todayLocal(), trang_thai: 'Mới',
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      alert('Lỗi lưu nhu cầu SX: ' + e.message);
      setSaving(false);
    }
  };

  return createPortal((
    <div style={{position:'fixed',inset:0,zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.3)',backdropFilter:'blur(2px)'}} onClick={onClose}/>
      <div style={{position:'relative',background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,boxShadow:'0 20px 40px rgba(0,0,0,0.2)',width:'100%',maxWidth:380,maxHeight:'85vh',display:'flex',flexDirection:'column',zIndex:1}}>
        <div style={{padding:'1rem',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:'0.9rem',fontWeight:800,color:'#0f172a'}}>{selectedCode ? 'Nhu cầu SX' : 'Chọn thành phẩm'}</span>
          <span onClick={onClose} style={{cursor:'pointer',color:'#94a3b8'}}><X size={18}/></span>
        </div>

        {!selectedCode ? (
          <>
            <div style={{padding:'8px 12px',borderBottom:'1px solid #f1f5f9'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,border:'1px solid #e2e8f0',borderRadius:8,padding:'0.5rem 0.75rem',background:'#f8fafc'}}>
                <Search size={14} color="#94a3b8"/>
                <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Gõ mã hoặc tên thành phẩm..." autoFocus
                  style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:'0.85rem'}}/>
              </div>
            </div>
            <div style={{overflow:'auto',flex:1,padding:'4px 0'}}>
              {filteredCodes.length === 0 ? (
                <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.78rem',padding:12}}>Không tìm thấy thành phẩm nào</p>
              ) : filteredCodes.map(code => (
                <div key={code} onClick={()=>pickCode(code)} style={{padding:'8px 14px',cursor:'pointer',borderBottom:'1px solid #f8fafc'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <div style={{fontWeight:700,color:'#4f46e5',fontSize:'0.82rem'}}>{code}</div>
                  {itemInfoMap[code]?.item_name && <div style={{fontSize:'0.7rem',color:'#64748b',fontStyle:'italic'}}>{itemInfoMap[code].item_name}</div>}
                </div>
              ))}
              {finishedCodes.length > filteredCodes.length && (
                <p style={{textAlign:'center',color:'#cbd5e1',fontSize:'0.68rem',padding:'6px'}}>Đang hiện {filteredCodes.length}/{finishedCodes.length} mã — gõ thêm để thu hẹp</p>
              )}
            </div>
          </>
        ) : (
          <div style={{padding:'1rem',overflow:'auto',flex:1}}>
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,color:'#4f46e5',fontSize:'0.9rem'}}>{selectedCode}</div>
              <div style={{fontSize:'0.75rem',color:'#64748b',fontStyle:'italic'}}>{selInfo.item_name || '—'}{selInfo.unit ? ` · ${selInfo.unit}` : ''}</div>
              {!initialCode && (
                <span onClick={()=>setSelectedCode(null)} style={{display:'inline-block',marginTop:4,fontSize:'0.7rem',color:'#2563eb',cursor:'pointer',fontWeight:600}}>← Chọn thành phẩm khác</span>
              )}
            </div>

            <div style={{display:'flex',gap:10,marginBottom:12}}>
              <div style={{flex:1,background:'#f8fafc',borderRadius:8,padding:'0.5rem 0.7rem'}}>
                <div style={{fontSize:'0.65rem',color:'#94a3b8',fontWeight:700}}>SL đã chốt hiện tại</div>
                <div style={{fontSize:'0.95rem',fontWeight:700,color:'#0f172a'}}>{currentQty === null ? 'Chưa có' : (Math.round(currentQty*1000)/1000).toLocaleString('vi-VN')}</div>
              </div>
              <div style={{flex:1,background:'#eef2ff',borderRadius:8,padding:'0.5rem 0.7rem'}}>
                <div style={{fontSize:'0.65rem',color:'#6366f1',fontWeight:700}}>Cần SX (tính lại)</div>
                <div style={{fontSize:'0.95rem',fontWeight:700,color:'#4f46e5'}}>{computeSuggestion(selectedCode).toLocaleString('vi-VN')}</div>
              </div>
            </div>

            <label style={{fontSize:'0.72rem',fontWeight:700,color:'#475569'}}>Số lượng ghi vào nhu cầu SX</label>
            <input type="number" value={qtyInput} onChange={e=>setQtyInput(e.target.value)} min="0" step="any" autoFocus={!!initialCode}
              style={{width:'100%',boxSizing:'border-box',marginTop:4,padding:'0.5rem 0.7rem',border:`1px solid ${qtyValid?'#e2e8f0':'#fca5a5'}`,borderRadius:8,fontSize:'0.95rem',fontWeight:700,color:'#0f172a',outline:'none'}}/>
            {!qtyValid && <div style={{color:'#dc2626',fontSize:'0.68rem',marginTop:3}}>Nhập số lượng hợp lệ (≥ 0).</div>}
            <div style={{fontSize:'0.68rem',color:'#94a3b8',marginTop:4}}>Ghi đúng số này — không cộng dồn, không giữ số lớn hơn số cũ.</div>
          </div>
        )}

        <div style={{borderTop:'1px solid #e2e8f0',padding:'0.75rem 1rem',display:'flex',justifyContent:'flex-end',gap:8,background:'#f8fafc'}}>
          <button onClick={onClose} style={{border:'1px solid #e2e8f0',background:'#fff',color:'#475569',borderRadius:8,padding:'0.5rem 1rem',fontSize:'0.8rem',fontWeight:700,cursor:'pointer'}}>Hủy</button>
          {selectedCode && (
            <button onClick={handleSave} disabled={!qtyValid || saving}
              style={{border:'none',background:(!qtyValid||saving)?'#c7d2fe':'#4f46e5',color:'#fff',borderRadius:8,padding:'0.5rem 1.25rem',fontSize:'0.8rem',fontWeight:700,cursor:(!qtyValid||saving)?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6}}>
              {saving && <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>}
              Lưu
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

export default function DKSXTab({ navigateTo, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [demandModal, setDemandModal] = useState(null); // null = đóng; { initialCode } = đang mở (initialCode=null → mở từ toolbar, chưa chọn SP)

  // Dữ liệu để phục vụ modal Thêm/Sửa nhu cầu SX — TOÀN BỘ thành phẩm có BOM (không chỉ những
  // mã đang có dòng ở `rows`), lấy lại từ đúng dữ liệu fetchData() đã tải, không gọi query mới.
  const [allBomMap, setAllBomMap] = useState({});     // { item_code: [{component, qty}] }
  const [allSalesMap, setAllSalesMap] = useState({});  // { item_code: total_sales_90d }
  const [allItemMeta, setAllItemMeta] = useState({});  // { item_code: { leadTimeDays, backupStockDays, item_name, unit } }
  const [allStockMap, setAllStockMap] = useState({});  // { item_code: tồn hiện tại (gồm WIP) } — khớp "Cần SX (tính lại)"

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: demand }, bomMap, stockMap, totalStockMap, { data: sales }, { data: items }] = await Promise.all([
        db.from('production_demand').select('*').gt('qty_demand', 0).order('updated_at', { ascending: false }),
        loadBomMap(),
        loadComponentStockExclWip(),         // né SX9 — dùng cho "Khả năng SX"/"Làm được ngay" (đúng luồng XUẤT linh kiện)
        loadComponentStock(),                // GỒM SX9 — dùng cho "Cần SX (tính lại)": đây là tồn của chính THÀNH PHẨM,
                                              // kiểu đối chiếu/tính lại giống Tồn HH, không phải luồng xuất linh kiện.
        db.from('sales_90d_summary').select('ma_san_pham, total_sales'),
        db.from('inventory_items').select('item_code, lead_time_days, backup_stock_days, item_name, unit'),
      ]);

      // TB bán 90 ngày + tham số lead time/an toàn của chính THÀNH PHẨM (không phải linh kiện)
      // — để tính lại "Cần SX" tươi bằng computeReplenishQty (mrp.js), độc lập với qty_demand
      // đã chốt từ trước (số đó chỉ giảm khi làm phiếu SX, không tự cập nhật theo doanh số/tồn mới).
      const salesMap = {};
      (sales || []).forEach(r => { if (r.ma_san_pham) salesMap[r.ma_san_pham] = Number(r.total_sales) || 0; });
      const paramsMap = {};
      (items || []).forEach(r => { paramsMap[r.item_code] = { leadTimeDays: Number(r.lead_time_days) || 0, backupStockDays: Number(r.backup_stock_days) || 0, item_name: r.item_name || '', unit: r.unit || '' }; });

      const formatted = (demand || []).map(d => {
        const N = Number(d.qty_demand) || 0;
        // BOM 1 cấp trực tiếp (khớp lệnh SX — KHÔNG nổ qua bán-thành-phẩm)
        const perUnit = {};
        (bomMap[d.item_code] || []).forEach(c => { perUnit[c.component] = (perUnit[c.component] || 0) + (Number(c.qty) || 0); });
        const comps = Object.keys(perUnit).map(c => {
          const required = perUnit[c] * N;
          const onHand = stockMap[c] || 0;
          const cover = required > 0 ? Math.min(100, Math.round(onHand / required * 100)) : 100;
          return { code: c, perUnit: perUnit[c], required: Math.round(required * 1000) / 1000, onHand, cover };
        }).sort((a, b) => a.cover - b.cover);

        // Khả năng SX = bottleneck (% SL làm được ngay)
        let feasibility = 100, buildable = N;
        comps.forEach(c => {
          if (c.perUnit > 0) {
            const canBuild = Math.floor(c.onHand / c.perUnit);
            if (canBuild < buildable) buildable = canBuild;
          }
        });
        feasibility = N > 0 ? Math.min(100, Math.round(buildable / N * 100)) : 100;

        // Cần SX (tính lại) = computeReplenishQty của thành phẩm này theo doanh số 90 ngày
        // và tổng tồn hiện tại (gồm cả WIP SX9- — xem lý do ở totalStockMap phía trên).
        const params = paramsMap[d.item_code] || {};
        const recomputedRaw = computeReplenishQty({
          totalSales90d: salesMap[d.item_code] || 0,
          leadTimeDays: params.leadTimeDays || 0,
          backupStockDays: params.backupStockDays || 0,
          totalQuantity: totalStockMap[d.item_code] || 0,
        });
        const recomputed = Math.round(recomputedRaw * 1000) / 1000;
        // Lệch so với số đã chốt — quá 20% thì tô nổi bật cho người lập kế hoạch để ý.
        const diffPct = N > 0 ? Math.abs(recomputed - N) / N : (recomputed > 0 ? 1 : 0);

        return { ...d, qty_demand: N, comps, feasibility, buildable: Math.max(0, buildable), recomputed, diffPct };
      });

      setRows(formatted);
      // Giữ lại đủ dữ liệu để modal Thêm/Sửa nhu cầu SX tính gợi ý cho BẤT KỲ thành phẩm nào
      // (không chỉ những mã đã có dòng ở `rows`), dùng đúng công thức vừa chạy ở trên.
      setAllBomMap(bomMap);
      setAllSalesMap(salesMap);
      setAllItemMeta(paramsMap);
      setAllStockMap(totalStockMap);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải DKSX: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Gợi ý SL cho modal = ĐÚNG công thức "Cần SX (tính lại)" dùng cho từng dòng ở bảng trên —
  // dùng chung một nguồn để số gợi ý trong modal luôn khớp số hiển thị ở bảng khi dòng đó đã có sẵn.
  const computeSuggestionFor = useCallback((code) => {
    const meta = allItemMeta[code] || {};
    const raw = computeReplenishQty({
      totalSales90d: allSalesMap[code] || 0,
      leadTimeDays: meta.leadTimeDays || 0,
      backupStockDays: meta.backupStockDays || 0,
      totalQuantity: allStockMap[code] || 0,
    });
    return Math.round(raw * 1000) / 1000;
  }, [allItemMeta, allSalesMap, allStockMap]);

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const handleMakeOrder = (row) => {
    const qtyStr = window.prompt(`Làm phiếu sản xuất cho ${row.item_code}\nSL cần SX còn lại: ${row.qty_demand}\nNhập số lượng sản xuất:`, String(row.buildable || row.qty_demand));
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) return alert('Số lượng không hợp lệ.');
    if (navigateTo) navigateTo('lenh-sx', { sx: { item_code: row.item_code, item_name: row.item_name, qty } });
  };

  const handleCancel = async (row) => {
    if (!window.confirm(`Hủy nhu cầu sản xuất ${row.item_code}?\nCác đề xuất đặt linh kiện (DLK) còn ở trạng thái "Mới" liên quan sẽ được tính lại theo nhu cầu mới.`)) return;
    await db.from('production_demand').update({ qty_demand: 0, trang_thai: 'Hủy' }).eq('id', row.id);
    // Hủy DKSX → tính lại đề xuất linh kiện: dòng DLK 'Mới' của khối lượng vừa hủy sẽ tự biến mất,
    // các DLK đã đặt mua/đang xử lý vẫn giữ nguyên (cam kết với bên mua hàng).
    try { await recomputeProposals(); } catch (e) { console.warn('Không tính lại được đề xuất sau khi hủy DKSX:', e.message); }
    fetchData();
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',position:'sticky',top:0,zIndex:50}}>
        <div style={{padding:'0.5rem',display:'flex',alignItems:'center',gap:6}}>
          <Factory size={16} style={{color:'#4f46e5',flexShrink:0}}/>
          <span style={{fontSize:'0.85rem',fontWeight:700,color:'#4f46e5',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>DKSX — Nhu cầu sản xuất thành phẩm</span>
          {perms.create && (
            <button onClick={()=>setDemandModal({ initialCode: null })} disabled={loading} title="Thêm nhu cầu SX" style={{...s.btn,padding:'0.35rem 0.6rem',color:'#fff',background:'#4f46e5',border:'none',flexShrink:0,whiteSpace:'nowrap'}}>
              <Plus size={14}/>Thêm nhu cầu SX
            </button>
          )}
          <button onClick={fetchData} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}}>
            <RefreshCw size={15} style={{animation:loading?'spin 1s linear infinite':'none',color:'#4f46e5'}}/>
          </button>
        </div>
        <div style={{padding:'0 0.5rem 0.4rem',overflow:'hidden'}}>
          <span style={{fontSize:'0.7rem',color:'#64748b',fontStyle:'italic',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}>
            "SL đã chốt" = số đang ghim · "Cần SX (tính lại)" = theo doanh số & tồn hôm nay
          </span>
        </div>
      </div>

      <main style={{flex:1,overflow:'auto',background:'#fff'}}>
        {loading ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:10}}>
            <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#4f46e5'}}/>
            <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tính khả năng sản xuất...</p>
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.74rem'}}>
            <thead>
              <tr style={{background:'#eef2ff',position:'sticky',top:0,zIndex:1}}>
                <th style={{...th,width:28}}></th>
                <th style={th}>#</th>
                <th style={{...th,textAlign:'left'}}>Thành phẩm</th>
                <th style={th}>ĐVT</th>
                <th style={{...th,textAlign:'right'}} title="Số đang ghim trong production_demand — chỉ giảm khi làm phiếu SX, không tự cập nhật theo doanh số/tồn mới">SL đã chốt</th>
                <th style={{...th,textAlign:'right'}} title="Tính lại ngay từ doanh số 90 ngày và tồn hiện tại — không ghi vào CSDL">Cần SX (tính lại)</th>
                <th style={th}>Khả năng SX</th>
                <th style={{...th,textAlign:'right'}}>Làm được ngay</th>
                <th style={th}>Ngày ĐX</th>
                <th style={th}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} style={{padding:'2.5rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Chưa có nhu cầu sản xuất nào đang mở</td></tr>
              ) : rows.map((row, i) => (
                <React.Fragment key={row.id}>
                  <tr style={{borderBottom: expanded.has(row.id)?'none':'1px solid #f1f5f9'}} onMouseEnter={e=>e.currentTarget.style.background='#fafaff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{...td,cursor:'pointer'}} onClick={()=>toggleExpand(row.id)}>
                      {expanded.has(row.id) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </td>
                    <td style={{...td,color:'#94a3b8'}}>{i+1}</td>
                    <td style={{...td,textAlign:'left'}}>
                      <div style={{fontWeight:700,color:'#4f46e5'}}>{row.item_code}</div>
                      <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</div>
                    </td>
                    <td style={{...td,color:'#64748b'}}>{row.unit}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,color:'#0f172a'}}>{row.qty_demand.toLocaleString('vi-VN')}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,...(row.diffPct > 0.2 ? {background:'#fffbeb',color:'#d97706'} : {color:'#334155'})}} title={row.diffPct > 0.2 ? `Lệch ${Math.round(row.diffPct*100)}% so với SL đã chốt` : 'Tính lại theo doanh số & tồn hiện tại'}>
                      {row.recomputed.toLocaleString('vi-VN')}
                    </td>
                    <td style={td}>
                      <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'center'}}>
                        <div style={{width:60,height:7,background:'#e2e8f0',borderRadius:4,overflow:'hidden'}}>
                          <div style={{width:`${row.feasibility}%`,height:'100%',background:pctColor(row.feasibility)}}/>
                        </div>
                        <span style={{fontWeight:700,color:pctColor(row.feasibility),fontSize:'0.72rem'}}>{row.feasibility}%</span>
                      </div>
                    </td>
                    <td style={{...td,textAlign:'right',fontWeight:700,color:pctColor(row.feasibility)}}>{row.buildable.toLocaleString('vi-VN')}</td>
                    <td style={{...td,color:'#64748b',whiteSpace:'nowrap'}}>{row.ngay_de_xuat || '—'}</td>
                    <td style={td}>
                      <div style={{display:'flex',gap:5,justifyContent:'center'}}>
                        {(perms.create || perms.edit || perms.delete) ? (<>
                        {perms.create && <button onClick={()=>handleMakeOrder(row)} style={{...s.btn,padding:'0.25rem 0.5rem',color:'#fff',background:'#4f46e5',border:'none'}}>
                          <Factory size={12}/>Làm phiếu SX
                        </button>}
                        {perms.edit && <button onClick={()=>setDemandModal({ initialCode: row.item_code })} title="Sửa nhu cầu SX" style={{...s.btn,padding:'0.25rem 0.4rem',color:'#4f46e5',border:'1px solid #c7d2fe'}}>
                          <Pencil size={12}/>
                        </button>}
                        {perms.delete && <button onClick={()=>handleCancel(row)} title="Hủy" style={{...s.btn,padding:'0.25rem 0.4rem',color:'#ef4444',border:'1px solid #fca5a5'}}>
                          <Trash2 size={12}/>
                        </button>}
                        </>) : <span style={{color:'#94a3b8',fontSize:'0.7rem'}}>—</span>}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(row.id) && (
                    <tr style={{borderBottom:'1px solid #e2e8f0'}}>
                      <td colSpan={10} style={{padding:'0.5rem 1rem 0.75rem 3rem',background:'#fafaff'}}>
                        <div style={{fontSize:'0.7rem',fontWeight:700,color:'#475569',marginBottom:4}}>Linh kiện cần ({row.comps.length}) — để SX {row.qty_demand} {row.unit}:</div>
                        <table style={{width:'auto',borderCollapse:'collapse',fontSize:'0.7rem'}}>
                          <thead>
                            <tr style={{color:'#94a3b8'}}>
                              <th style={{textAlign:'left',padding:'2px 12px 2px 0'}}>Linh kiện</th>
                              <th style={{textAlign:'right',padding:'2px 12px'}}>Cần</th>
                              <th style={{textAlign:'right',padding:'2px 12px'}}>Tồn</th>
                              <th style={{textAlign:'right',padding:'2px 12px'}}>Đáp ứng</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.comps.map(c => (
                              <tr key={c.code}>
                                <td style={{padding:'2px 12px 2px 0',fontWeight:600,color:'#0284c7'}}>{c.code}</td>
                                <td style={{padding:'2px 12px',textAlign:'right',fontWeight:600}}>{c.required.toLocaleString('vi-VN')}</td>
                                <td style={{padding:'2px 12px',textAlign:'right',color: c.onHand>=c.required?'#16a34a':'#ef4444'}}>{c.onHand.toLocaleString('vi-VN')}</td>
                                <td style={{padding:'2px 12px',textAlign:'right',fontWeight:700,color:pctColor(c.cover)}}>{c.cover}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </main>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.5rem 0.75rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,fontSize:'0.8rem',fontWeight:600,color:'#64748b'}}>
        {rows.length} thành phẩm đang cần sản xuất
      </div>

      {demandModal && (
        <DemandModal
          initialCode={demandModal.initialCode}
          bomMap={allBomMap}
          itemInfoMap={allItemMeta}
          demandRows={rows}
          computeSuggestion={computeSuggestionFor}
          onClose={() => setDemandModal(null)}
          onSaved={() => { setDemandModal(null); fetchData(); }}
        />
      )}
    </div>
  );
}
