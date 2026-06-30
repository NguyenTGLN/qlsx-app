import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase as db } from '../../lib/supabase';
import { usePersistedState } from '../../lib/usePersistedState';
import { Search, Loader2, RefreshCw, Download, Send, Factory, ExternalLink, ArrowUpDown, PackageCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import SearchAutoSuggest from '../../components/SearchAutoSuggest';
import { ColumnToggleModal } from '../../components/WarehouseSharedUI';
import { todayLocal } from '../../lib/dateUtils';
import { recomputeProposals, loadBomMap, loadComponentStockExclWip, buildableNow, sendRetailProposals } from '../../lib/dksxEngine';

const TABLE_COLS = ['urgency','san_pham','dvt','total_quantity','avg_monthly_sales','avg_daily','days_remaining','runout_date','safe_inventory','replenish_qty','de_xuat_sl','dlk_status','actions'];
const COL_LABELS_MAP = { urgency:'Cảnh báo', san_pham:'Sản phẩm', dvt:'ĐVT', total_quantity:'Tổng Tồn', avg_monthly_sales:'TB Bán/Tháng', avg_daily:'TB Bán/Ngày', days_remaining:'Ngày Bán KD', runout_date:'Ngày cạn kho', safe_inventory:'Tồn An Toàn', replenish_qty:'Cần Bổ Sung', de_xuat_sl:'SL Đề xuất', dlk_status:'Đã đề xuất (SX/Mua)', actions:'Thao tác' };

// Màu badge tiến độ mua — đồng bộ với tab Đề xuất (OrderProposalTab)
const TIEN_DO_CFG = {
  'Mới':             { bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' },
  'Chờ duyệt':       { bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  'Đã đặt':          { bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  'Đang vận chuyển': { bg:'#eef2ff', color:'#6366f1', border:'#c7d2fe' },
  'Đã về kho':       { bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
};
const TIEN_DO_RANK = { 'Mới':0, 'Chờ duyệt':1, 'Đã đặt':2, 'Đang vận chuyển':3, 'Đã về kho':4 };
function pctColor(p) { return p >= 100 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626'; }

const URGENCY_CFG = {
  CRITICAL: { label:'🔴 Gấp',     bg:'#fef2f2', color:'#dc2626', border:'#fca5a5', rowBg:'#fff5f5' },
  WARNING:  { label:'🟡 Cảnh báo', bg:'#fffbeb', color:'#d97706', border:'#fcd34d', rowBg:'#fffdf0' },
  SAFE:     { label:'🟢 Đủ',      bg:'#f0fdf4', color:'#16a34a', border:'#86efac', rowBg:'' },
};
function calcUrgency(days_remaining, safety, alert) {
  if (days_remaining === null) return 'SAFE';
  if (days_remaining <= safety) return 'CRITICAL';
  if (days_remaining <= alert) return 'WARNING';
  return 'SAFE';
}
function addDaysVN(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return d.toLocaleDateString('vi-VN');
}

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

export default function StockSummaryTab({ navigateTo, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortCol, setSortCol] = useState('replenish_qty'); // mặc định: sắp theo SL cần Bổ Sung
  const [sortAsc, setSortAsc] = useState(false);           // giảm dần — mã cần bổ sung nhiều nhất lên đầu
  const [proposalQty, setProposalQty] = useState({}); // { item_code: qty }
  const [proposedMap, setProposedMap] = useState({}); // { item_code: qty_demand } — SL đã đề xuất sang DKSX
  const [purchaseProposedMap, setPurchaseProposedMap] = useState({}); // { item_code: { qty, tien_do } } — đề xuất đặt mua (DLK) đang mở
  const [bomMap, setBomMap] = useState({}); // { product_code: [{component, qty}] } — để tính "làm được ngay"
  const [compStock, setCompStock] = useState({}); // { item_code: tồn } — tồn linh kiện (né SX9, khớp lệnh SX)
  const [sortByProposal, setSortByProposal] = useState(false); // true = SL đề xuất > 0 lên đầu
  const [groupByType, setGroupByType] = useState(true);        // mặc định: nhóm Sản xuất (SX) trước → Đặt mua → còn lại
  const [groupOrder, setGroupOrder] = useState('sx');          // 'sx' = SX lên đầu | 'mua' = Đặt mua lên đầu

  // Advanced features
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Column Toggle
  const [hiddenCols, setHiddenCols] = usePersistedState('stockSummary_hiddenCols', new Set());

  const fetchStockSummary = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch inventory stock (lấy toàn bộ vượt 1000 dòng)
      let allStock = [];
      let page = 0;
      while (true) {
        const { data: stockChunk, error: stockErr } = await db.from('inventory_stock').select(`
          item_code,
          quantity,
          inventory_items ( item_name, unit, lead_time_days, backup_stock_days, min_stock_days )
        `).range(page * 1000, (page + 1) * 1000 - 1);
        if (stockErr) throw stockErr;
        if (stockChunk) allStock = allStock.concat(stockChunk);
        if (!stockChunk || stockChunk.length < 1000) break;
        page++;
      }

      // 2. Fetch sales from View (rất nhanh vì Database đã tính sẵn)
      const { data: salesSummary, error: salesErr } = await db.from('sales_90d_summary').select('*');
      if (salesErr) throw salesErr;

      const salesMap = {};
      (salesSummary || []).forEach(r => {
        if (r.ma_san_pham) {
          salesMap[r.ma_san_pham] = Number(r.total_sales) || 0;
        }
      });

      // Group stock by item_code
      const summaryMap = {};
      allStock.forEach(r => {
        const code = r.item_code;
        if (!summaryMap[code]) {
          summaryMap[code] = {
            item_code: code,
            item_name: r.inventory_items?.item_name || '',
            unit: r.inventory_items?.unit || '',
            lead_time_days: Number(r.inventory_items?.lead_time_days) || 0,
            backup_stock_days: Number(r.inventory_items?.backup_stock_days) || 0,
            min_stock_days: Number(r.inventory_items?.min_stock_days) || 0,
            total_quantity: 0
          };
        }
        summaryMap[code].total_quantity += (Number(r.quantity) || 0);
      });

      // Calculate days remaining and monthly avg
      let formatted = Object.values(summaryMap).map(item => {
        item.total_quantity = Math.round(item.total_quantity * 1000) / 1000;
        const totalSales90d = salesMap[item.item_code] || 0;
        const avgMonthlySales = Math.round(totalSales90d / 3); // Trung bình tháng
        const avgDailySales = totalSales90d / 90;
        const daysRemaining = avgDailySales > 0 ? Math.round(item.total_quantity / avgDailySales) : null;

        // Tồn kho an toàn = TB bán ngày × (lead_time + safety_stock × 2) — theo đặc tả gốc
        const safe_inventory = Math.round(avgDailySales * (item.lead_time_days + (item.backup_stock_days * 2)));

        // Số lượng cần bổ sung = Max(0, Tồn an toàn - Tổng tồn)
        const replenish_qty = Math.max(0, safe_inventory - item.total_quantity);

        // Cảnh báo + ngày cạn kho (chỉ với mã có tiêu thụ)
        const alertThreshold = item.min_stock_days || (item.backup_stock_days + 3);
        const urgency = calcUrgency(daysRemaining, item.backup_stock_days, alertThreshold);
        const urgency_rank = urgency === 'CRITICAL' ? 0 : urgency === 'WARNING' ? 1 : 2;
        const runout_date = daysRemaining !== null ? addDaysVN(daysRemaining) : '—';

        return {
          ...item,
          avg_monthly_sales: avgMonthlySales,
          avg_daily: Math.round(avgDailySales * 100) / 100, // TB bán/ngày (2 số lẻ)
          days_remaining: daysRemaining,
          runout_date,
          urgency,
          urgency_rank,
          safe_inventory,
          replenish_qty
        };
      });

      // Apply search filter
      if (searchText.trim()) {
        const terms = searchText.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          formatted = formatted.filter(item => 
            terms.some(t => 
              (item.item_code && item.item_code.toLowerCase() === t)
            )
          );
        }
      }

      // Sort
      formatted.sort((a, b) => {
        let valA = a[sortCol]; let valB = b[sortCol];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA === null) return 1;
        if (valB === null) return -1;
        
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });

      setRows(formatted);
      setSelectedKeys(new Set());
      // Khởi tạo proposalQty mặc định = replenish_qty
      setProposalQty(prev => {
        const next = { ...prev };
        formatted.forEach(r => { if (!(r.item_code in next)) next[r.item_code] = r.replenish_qty; });
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('Lỗi tải tổng hợp tồn kho: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchText, sortCol, sortAsc]);

  // Fetch nhu cầu SX đang mở (DKSX) để hiển thị cột "đã đề xuất"
  const fetchProposed = useCallback(async () => {
    const { data } = await db.from('production_demand').select('item_code, qty_demand').gt('qty_demand', 0);
    const map = {};
    (data || []).forEach(r => { map[r.item_code] = Number(r.qty_demand) || 0; });
    setProposedMap(map);
  }, []);

  // Fetch đề xuất đặt mua (DLK) đang mở → "ĐX mua" = SL đang đề xuất thực tế + tiến độ + thông tin để nhập kho.
  const fetchPurchaseProposed = useCallback(async () => {
    const { data } = await db.from('purchase_proposals').select('item_code, actual_qty, tien_do, dlk_code, unit').eq('trang_thai', 'Mới').gt('actual_qty', 0);
    const map = {};
    (data || []).forEach(r => {
      const code = r.item_code;
      const td = r.tien_do || 'Mới';
      const rank = TIEN_DO_RANK[td] ?? 0;
      if (!map[code]) map[code] = { qty: 0, tien_do: td, dlk_code: r.dlk_code, unit: r.unit, _maxRank: rank };
      map[code].qty += (Number(r.actual_qty) || 0);
      // Badge: giữ tiến độ "sớm nhất" (ít hoàn tất nhất) cho an toàn
      if (rank < (TIEN_DO_RANK[map[code].tien_do] ?? 99)) map[code].tien_do = td;
      // Nhập kho: nhắm dòng DLK tiến độ "xa nhất" (gần về kho nhất)
      if (rank >= map[code]._maxRank) { map[code]._maxRank = rank; map[code].dlk_code = r.dlk_code; map[code].unit = r.unit; }
    });
    setPurchaseProposedMap(map);
  }, []);

  useEffect(() => { fetchStockSummary(); }, [fetchStockSummary]);
  useEffect(() => { fetchProposed(); }, [fetchProposed]);
  useEffect(() => { fetchPurchaseProposed(); }, [fetchPurchaseProposed]);

  // Tải BOM + tồn linh kiện 1 lần để tính "làm được ngay" (độc lập với bộ lọc tìm kiếm của bảng).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [bm, sm] = await Promise.all([loadBomMap(), loadComponentStockExclWip()]);
        if (alive) { setBomMap(bm); setCompStock(sm); }
      } catch (e) { console.warn('Không tải được BOM/tồn linh kiện để tính khả năng SX:', e.message); }
    })();
    return () => { alive = false; };
  }, []);

  // Khả năng SX cho mỗi mã có nhu cầu DKSX — BOM 1 cấp trực tiếp + tồn né SX9 (khớp đúng lệnh sản xuất).
  const buildableMap = useMemo(() => {
    const out = {};
    if (!bomMap || Object.keys(bomMap).length === 0) return out;
    Object.keys(proposedMap).forEach(code => {
      const N = proposedMap[code];
      if (!(N > 0)) return;
      const r = buildableNow(bomMap, compStock, code, N);
      if (r) out[code] = r;
    });
    return out;
  }, [bomMap, compStock, proposedMap]);

  // Tạo phiếu sản xuất ngay từ Tồn HH (giống tab DKSX): nhập SL → sang màn Lệnh SX với thông tin điền sẵn.
  const handleMakeProductionOrder = (row) => {
    const bd = buildableMap[row.item_code];
    const need = proposedMap[row.item_code] || 0;
    const def = (bd && bd.buildable > 0) ? bd.buildable : (need || row.replenish_qty || 0);
    const qtyStr = window.prompt(`Làm phiếu sản xuất cho ${row.item_code}\nSL cần SX: ${need.toLocaleString('vi-VN')}${bd ? `  ·  Làm được ngay: ${bd.buildable.toLocaleString('vi-VN')}` : ''}\nNhập số lượng sản xuất:`, String(def));
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) return alert('Số lượng không hợp lệ.');
    if (navigateTo) navigateTo('lenh-sx', { sx: { item_code: row.item_code, item_name: row.item_name, qty } });
  };

  // Nhập kho ngay cho mã đặt mua: điều hướng sang tab Nhập kho với khối DLK điền sẵn (mã + SL + ĐVT).
  const handleReceiveStock = (row) => {
    const info = purchaseProposedMap[row.item_code];
    if (!info) return;
    if (navigateTo) navigateTo('nhap-kho', { dlk: { dlk_code: info.dlk_code || '', item_code: row.item_code, item_name: row.item_name, qty: info.qty, unit: info.unit || row.unit } });
  };

  const handleSort = (col) => {
    setSortByProposal(false); // sort cột thường → tắt ưu tiên SL đề xuất
    setGroupByType(false);    // và tắt nhóm SX/Mua
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const colLabel = {
    item_code: 'Mã HH',
    item_name: 'Tên hàng hóa',
    unit: 'ĐVT',
    total_quantity: 'Tổng Tồn',
    avg_monthly_sales: 'TB Bán/Tháng (3T)',
    days_remaining: 'Số ngày bán khả dụng',
    safe_inventory: 'Tồn Kho An Toàn',
    replenish_qty: 'Cần Bổ Sung'
  };

  const toggleRow = (code) => {
    const next = new Set(selectedKeys);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (selectedKeys.size === rows.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(rows.map(r => r.item_code)));
  };

  const handleSendProposal = async () => {
    const selected = rows.filter(r => selectedKeys.has(r.item_code));
    if (selected.length === 0) return alert('Chọn ít nhất 1 mã hàng để gửi đề xuất.');
    if (!window.confirm(`Gửi đề xuất ${selected.length} mã? Thành phẩm có BOM sang DKSX (tự tính linh kiện); mã bán lẻ (không BOM, có xuất bán) đi thẳng vào Đề xuất (DLK).`)) return;
    setSending(true);
    try {
      // Chỉ thành phẩm (có BOM) mới đưa vào DKSX. Dùng loadBomMap (đã phân trang đủ 1868 dòng).
      const bomMap = await loadBomMap();
      const parents = new Set(Object.keys(bomMap));

      const today = todayLocal();
      let upserts = 0;          // thành phẩm BOM → DKSX
      const retailList = [];    // mã bán lẻ (không BOM + có xuất bán) → DLK mua thẳng
      const skipped = [];       // không BOM + không xuất bán → bỏ qua
      for (const row of selected) {
        const N = Number(proposalQty[row.item_code] ?? row.replenish_qty) || 0;
        if (N <= 0) continue;

        if (parents.has(row.item_code)) {
          // Upsert DKSX theo quy tắc MAX: chỉ nâng lên nếu số mới lớn hơn
          const { data: ex } = await db.from('production_demand').select('id, qty_demand').eq('item_code', row.item_code).maybeSingle();
          if (ex) {
            if (N > Number(ex.qty_demand)) {
              await db.from('production_demand').update({ qty_demand: N, trang_thai: 'Mới', updated_at: new Date().toISOString() }).eq('id', ex.id);
            }
          } else {
            await db.from('production_demand').insert({ item_code: row.item_code, item_name: row.item_name, unit: row.unit, qty_demand: N, ngay_de_xuat: today, trang_thai: 'Mới' });
          }
          upserts++;
        } else if (row.avg_daily > 0) {
          // Mã bán lẻ: không có BOM nhưng có xuất bán → mua thẳng
          retailList.push({ item_code: row.item_code, item_name: row.item_name, unit: row.unit, qty: N });
        } else {
          // Không BOM, không xuất bán → không phải hàng bán, bỏ qua
          skipped.push(row.item_code);
        }
      }

      if (upserts === 0 && retailList.length === 0) {
        return alert(skipped.length
          ? `Các mã đã chọn không có BOM và cũng không có xuất bán, không thể đề xuất:\n${skipped.slice(0, 8).join(', ')}`
          : 'Không có mã nào hợp lệ (SL đề xuất = 0).');
      }

      // Thành phẩm BOM → tính lại bảng Đề xuất DLK (net) từ toàn bộ DKSX
      if (upserts > 0) await recomputeProposals();
      // Mã bán lẻ → đẩy thẳng vào DLK (quy tắc MAX)
      let retail = { created: 0, updated: 0, skippedSmaller: 0 };
      if (retailList.length > 0) retail = await sendRetailProposals(retailList);

      const parts = [];
      if (upserts > 0) parts.push(`Đã đưa ${upserts} thành phẩm sang DKSX (linh kiện DLK đã cập nhật).`);
      if (retailList.length > 0) parts.push(`Mã bán lẻ vào Đề xuất: tạo ${retail.created}, cập nhật ${retail.updated}${retail.skippedSmaller ? `, bỏ qua ${retail.skippedSmaller} mã (SL ≤ đề xuất cũ)` : ''}.`);
      if (skipped.length) parts.push(`⚠️ Bỏ qua ${skipped.length} mã không BOM & không xuất bán: ${skipped.slice(0, 5).join(', ')}`);
      alert(parts.join('\n'));

      setSelectedKeys(new Set());
      await fetchProposed();
      await fetchPurchaseProposed();
      // Điều hướng: ưu tiên DKSX nếu có thành phẩm, ngược lại sang tab Đề xuất
      if (navigateTo) navigateTo(upserts > 0 ? 'dksx' : 'de-xuat-dat-hang');
    } catch (e) {
      console.error(e);
      alert('Lỗi gửi đề xuất: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleExport = () => {
    const dataToExport = rows.filter(r => selectedKeys.has(r.item_code)).map(r => {
      const out = {};
      Object.keys(colLabel).forEach(k => out[colLabel[k]] = r[k]);
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ton_Kho_Tong");
    XLSX.writeFile(wb, `Ton_Kho_Tong_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const vis = (col) => !hiddenCols.has(col);
  const visCount = TABLE_COLS.filter(c => vis(c)).length + 2; // +checkbox+#

  // Sắp xếp hiển thị (ưu tiên): nhóm theo loại đề xuất (SX/Mua tuỳ groupOrder), hoặc đưa SL đề xuất > 0 lên đầu.
  // Trong nhóm SX: đủ 100% (làm được ngay) lên trước. Trong nhóm Mua: "Đã về kho" lên trước. Sort ổn định → còn lại giữ Bổ Sung giảm dần.
  const qOf = (r) => proposalQty[r.item_code] ?? r.replenish_qty ?? 0;
  const isSX = (r) => proposedMap[r.item_code] > 0;
  const isMua = (r) => (purchaseProposedMap[r.item_code]?.qty || 0) > 0;
  const feasOf = (r) => buildableMap[r.item_code]?.feasibility ?? -1;
  const arrivedOf = (r) => (purchaseProposedMap[r.item_code]?.tien_do === 'Đã về kho') ? 1 : 0;
  const groupRank = (r) => {
    const sx = isSX(r), mua = isMua(r);
    if (groupOrder === 'mua') return mua ? 0 : (sx ? 1 : 2);
    return sx ? 0 : (mua ? 1 : 2);
  };
  const displayRows = groupByType
    ? [...rows].sort((a, b) => {
        const g = groupRank(a) - groupRank(b);
        if (g) return g;
        if (isSX(a) && isSX(b)) { const d = feasOf(b) - feasOf(a); if (d) return d; }
        else if (isMua(a) && isMua(b)) { const d = arrivedOf(b) - arrivedOf(a); if (d) return d; }
        return 0;
      })
    : sortByProposal
      ? [...rows].sort((a, b) => {
          const qa = qOf(a), qb = qOf(b);
          if ((qa > 0) !== (qb > 0)) return qa > 0 ? -1 : 1;
          return qb - qa;
        })
      : rows;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Sticky Toolbar */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <div style={{flex:1, minWidth:120}}>
          <SearchAutoSuggest
            tableName="inventory_items"
            searchColumns={['item_code','item_name']}
            displayColumn="item_code"
            placeholder="Tìm mã, tên HH..."
            value={searchText}
            onChange={v => setSearchText(v)}
          />
        </div>
        <button onClick={fetchStockSummary} disabled={loading} style={{...s.btn,padding:'0.4rem',flexShrink:0}} title="Làm mới">
          <RefreshCw size={16} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
        </button>
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS_MAP} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
        <button onClick={()=>{ setSortByProposal(false); setGroupByType(true); setGroupOrder(o => o === 'sx' ? 'mua' : 'sx'); }} title="Đổi nhóm ưu tiên lên đầu: Sản xuất ↔ Đặt mua" style={{...s.btn,flexShrink:0,whiteSpace:'nowrap',borderColor:'#c7d2fe',color:'#4f46e5'}}>
          <ArrowUpDown size={14}/>Ưu tiên: {groupOrder === 'sx' ? 'SX' : 'Mua'}
        </button>
      </div>

      <main style={{flex:1,padding:'0',display:'flex',flexDirection:'column',overflow:'hidden',background:'#fff'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tính toán tổng tồn kho và dự báo...</p>
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
                    {vis('urgency') && <th onClick={()=>handleSort('urgency_rank')} title="Bấm để sắp xếp theo mức ưu tiên cảnh báo (🔴 lên đầu)" style={{padding:'0.4rem 0.3rem',textAlign:'center',borderBottom:`2px solid ${sortCol==='urgency_rank'?'#dc2626':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='urgency_rank'?'#dc2626':'#64748b',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}}>Cảnh báo{sortCol==='urgency_rank'?(sortAsc?' ↑':' ↓'):' ⇅'}</th>}
                    {vis('san_pham') && <th onClick={()=>handleSort('item_code')} style={{padding:'0.4rem 0.3rem',borderBottom:`2px solid ${sortCol==='item_code'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='item_code'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>Sản phẩm{sortCol==='item_code'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('dvt') && <th onClick={()=>handleSort('unit')} style={{padding:'0.4rem 0.3rem',borderBottom:`2px solid ${sortCol==='unit'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='unit'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>ĐVT{sortCol==='unit'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('total_quantity') && <th onClick={()=>handleSort('total_quantity')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='total_quantity'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='total_quantity'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>Tổng Tồn{sortCol==='total_quantity'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('avg_monthly_sales') && <th onClick={()=>handleSort('avg_monthly_sales')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='avg_monthly_sales'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='avg_monthly_sales'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>TB/Tháng{sortCol==='avg_monthly_sales'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('avg_daily') && <th onClick={()=>handleSort('avg_daily')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='avg_daily'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='avg_daily'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>TB/Ngày{sortCol==='avg_daily'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('days_remaining') && <th onClick={()=>handleSort('days_remaining')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='days_remaining'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='days_remaining'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>Ngày KD{sortCol==='days_remaining'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('runout_date') && <th style={{padding:'0.4rem 0.3rem',textAlign:'center',borderBottom:'2px solid #e2e8f0',fontSize:'0.7rem',fontWeight:700,color:'#64748b',whiteSpace:'nowrap'}}>Ngày cạn kho</th>}
                    {vis('safe_inventory') && <th onClick={()=>handleSort('safe_inventory')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='safe_inventory'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='safe_inventory'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>Tồn AT{sortCol==='safe_inventory'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('replenish_qty') && <th onClick={()=>handleSort('replenish_qty')} style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortCol==='replenish_qty'?'#0891b2':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:sortCol==='replenish_qty'?'#0891b2':'#64748b',cursor:'pointer',whiteSpace:'nowrap'}}>Bổ Sung{sortCol==='replenish_qty'?(sortAsc?' ↑':' ↓'):''}</th>}
                    {vis('de_xuat_sl') && <th onClick={()=>{ setGroupByType(false); setSortByProposal(v=>!v); }} title="Bấm để đưa dòng có SL đề xuất > 0 lên đầu" style={{padding:'0.4rem 0.3rem',textAlign:'right',borderBottom:`2px solid ${sortByProposal?'#7c3aed':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}}>SL Đề xuất {sortByProposal?'↑':'⇅'}</th>}
                    {vis('dlk_status') && <th onClick={()=>{ setSortByProposal(false); setGroupByType(v=>!v); }} title="Bấm để nhóm: Sản xuất (ĐX SX) trước → Đặt mua (ĐX mua) → còn lại" style={{padding:'0.4rem 0.5rem',textAlign:'left',borderBottom:`2px solid ${groupByType?'#4f46e5':'#e2e8f0'}`,fontSize:'0.7rem',fontWeight:700,color:'#4f46e5',whiteSpace:'nowrap',cursor:'pointer',userSelect:'none'}}>Đã ĐX {groupByType?'≡':'⇅'}</th>}
                    {vis('actions') && <th style={{padding:'0.4rem 0.3rem',textAlign:'center',borderBottom:'2px solid #e2e8f0',fontSize:'0.7rem',fontWeight:700,color:'#64748b',whiteSpace:'nowrap'}}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={visCount} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Không có dữ liệu tồn kho</td></tr>
                  ) : displayRows.map((row,ri) => (
                    <tr key={row.item_code} onClick={()=>toggleRow(row.item_code)} style={{borderBottom:'1px solid #f1f5f9',background:selectedKeys.has(row.item_code)?'#f0f9ff':'transparent',cursor:'pointer'}} onMouseEnter={e=>!selectedKeys.has(row.item_code) && (e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>!selectedKeys.has(row.item_code) && (e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selectedKeys.has(row.item_code)} onChange={()=>toggleRow(row.item_code)} style={{cursor:'pointer',accentColor:'#0891b2'}}/>
                      </td>
                      <td style={{padding:'0.35rem 0.2rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.65rem',fontWeight:600}}>{ri+1}</td>
                      {vis('urgency') && <td style={{padding:'0.25rem 0.2rem',textAlign:'center'}}>
                        <span style={{display:'inline-block',padding:'0.15rem 0.4rem',borderRadius:5,fontSize:'0.65rem',fontWeight:700,background:URGENCY_CFG[row.urgency].bg,color:URGENCY_CFG[row.urgency].color,border:`1px solid ${URGENCY_CFG[row.urgency].border}`,whiteSpace:'nowrap'}}>
                          {URGENCY_CFG[row.urgency].label}
                        </span>
                      </td>}
                      {vis('san_pham') && <td style={{padding:'0.35rem 0.2rem'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.68rem',color:'#64748b',fontStyle:'italic',marginTop:1}}>{row.item_name}</div>
                      </td>}
                      {vis('dvt') && <td style={{padding:'0.35rem 0.2rem',color:'#64748b',whiteSpace:'nowrap'}}>{row.unit}</td>}
                      {vis('total_quantity') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:row.total_quantity<=0?'#ef4444':'#059669',fontVariantNumeric:'tabular-nums'}}>{row.total_quantity.toLocaleString('vi-VN')}</td>}
                      {vis('avg_monthly_sales') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#f59e0b',fontVariantNumeric:'tabular-nums'}}>{row.avg_monthly_sales.toLocaleString('vi-VN')}</td>}
                      {vis('avg_daily') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#d97706',fontVariantNumeric:'tabular-nums'}}>{row.avg_daily ? row.avg_daily.toLocaleString('vi-VN') : <span style={{color:'#94a3b8',fontSize:'0.68rem'}}>—</span>}</td>}
                      {vis('days_remaining') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:URGENCY_CFG[row.urgency].color,fontVariantNumeric:'tabular-nums'}}>
                        {row.days_remaining !== null ? row.days_remaining.toLocaleString('vi-VN') : <span style={{color:'#94a3b8',fontSize:'0.68rem'}}>—</span>}
                      </td>}
                      {vis('runout_date') && <td style={{padding:'0.35rem 0.2rem',textAlign:'center',fontSize:'0.7rem',color:row.urgency==='CRITICAL'?'#dc2626':'#475569',whiteSpace:'nowrap'}}>{row.runout_date}</td>}
                      {vis('safe_inventory') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:600,color:'#475569',fontVariantNumeric:'tabular-nums'}}>{row.safe_inventory.toLocaleString('vi-VN')}</td>}
                      {vis('replenish_qty') && <td style={{padding:'0.35rem 0.2rem',textAlign:'right',fontWeight:700,color:row.replenish_qty > 0 ? '#ef4444' : '#64748b',fontVariantNumeric:'tabular-nums'}}>{row.replenish_qty.toLocaleString('vi-VN')}</td>}
                      {vis('de_xuat_sl') && <td style={{padding:'0.2rem 0.2rem',textAlign:'right'}} onClick={e=>e.stopPropagation()}>
                        <input
                          type="number" min="0"
                          value={proposalQty[row.item_code] ?? row.replenish_qty}
                          onChange={e => setProposalQty(p => ({...p, [row.item_code]: Number(e.target.value)}))}
                          style={{...s.input, width:68, padding:'0.2rem 0.3rem', textAlign:'right', fontWeight:700, color:'#7c3aed', borderColor:'#c4b5fd'}}
                        />
                      </td>}
                      {(() => { const sxQty = proposedMap[row.item_code]; const buyInfo = purchaseProposedMap[row.item_code]; const bd = buildableMap[row.item_code]; const tdc = buyInfo ? (TIEN_DO_CFG[buyInfo.tien_do] || TIEN_DO_CFG['Mới']) : null; const arrived = !!buyInfo && buyInfo.tien_do === 'Đã về kho'; return (<>
                      {vis('dlk_status') && <td style={{padding:'0.4rem 0.5rem',textAlign:'left'}} onClick={e=>e.stopPropagation()}>
                        {sxQty > 0 ? (
                          <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}
                            title={`Đề xuất SX ${sxQty.toLocaleString('vi-VN')}${bd ? ` · làm được ngay ${bd.buildable.toLocaleString('vi-VN')}` : ''} — bấm để mở DKSX`}
                            onClick={() => navigateTo && navigateTo('dksx')}>
                            <Factory size={14} style={{color:'#4f46e5',flexShrink:0}}/>
                            {bd && <div style={{position:'relative',width:92,height:16,background:'#e5e7eb',borderRadius:4,overflow:'hidden',flexShrink:0}}>
                              <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${bd.feasibility}%`,background:pctColor(bd.feasibility)}}/>
                              <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.6rem',fontWeight:700,color:bd.feasibility>=50?'#fff':'#334155'}}>{bd.feasibility}%</span>
                            </div>}
                            <span style={{fontSize:'0.72rem',fontWeight:700,color:'#4f46e5',whiteSpace:'nowrap'}}>{sxQty.toLocaleString('vi-VN')}</span>
                          </div>
                        ) : buyInfo && buyInfo.qty > 0 ? (
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
                            <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'0.18rem 0.5rem',borderRadius:6,fontSize:'0.65rem',fontWeight:700,background:'#fff7ed',color:'#ea580c',border:'1px solid #fed7aa',whiteSpace:'nowrap',cursor:'pointer'}}
                              title="Đang có đề xuất đặt mua (DLK) — bấm để mở tab Đề xuất"
                              onClick={() => navigateTo && navigateTo('de-xuat-dat-hang')}>
                              🛒 ĐX mua: {buyInfo.qty.toLocaleString('vi-VN')}
                            </span>
                            <div style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                              <span style={{fontSize:'0.62rem',color:'#94a3b8'}}>Tiến độ</span>
                              <span style={{fontSize:'0.6rem',fontWeight:700,padding:'0.05rem 6px',borderRadius:5,background:tdc.bg,color:tdc.color,border:`1px solid ${tdc.border}`}}>{buyInfo.tien_do || 'Mới'}</span>
                            </div>
                          </div>
                        ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>}
                      </td>}
                      {vis('actions') && <td style={{padding:'0.4rem 0.4rem',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        {sxQty > 0 ? (
                          perms.create
                            ? <button onClick={()=>handleMakeProductionOrder(row)} title="Tạo phiếu sản xuất ngay" style={{...s.btn,padding:'0.32rem 0.7rem',fontSize:'0.7rem',fontWeight:600,background:'#4f46e5',color:'#fff',border:'none',whiteSpace:'nowrap'}}><Factory size={13}/>Tạo phiếu SX</button>
                            : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>
                        ) : buyInfo && buyInfo.qty > 0 ? (
                          <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}>
                            <button onClick={()=>handleReceiveStock(row)} disabled={!arrived}
                              title={arrived ? 'Nhập kho số đã về (điền sẵn DLK)' : `Chỉ nhập kho khi tiến độ = "Đã về kho" (hiện: ${buyInfo.tien_do || 'Mới'})`}
                              style={{...s.btn,padding:'0.32rem 0.7rem',fontSize:'0.7rem',fontWeight:600,background:arrived?'#0d9488':'#e2e8f0',color:arrived?'#fff':'#94a3b8',border:'none',whiteSpace:'nowrap',cursor:arrived?'pointer':'not-allowed'}}><PackageCheck size={13}/>Nhập kho</button>
                            <button onClick={()=>navigateTo && navigateTo('de-xuat-dat-hang')} title="Mở tab Đề xuất (DLK)" style={{...s.btn,padding:'0.32rem 0.45rem',fontSize:'0.7rem',color:'#ea580c',border:'1px solid #fed7aa'}}><ExternalLink size={13}/></button>
                          </div>
                        ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>}
                      </td>}
                      </>); })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom Action Bar — Always visible */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.75rem',display:'flex',alignItems:'center',gap:'0.5rem',borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20,flexWrap:'nowrap',overflowX:'auto'}}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:700,color:'#1e3a8a',whiteSpace:'nowrap'}}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExport} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
            {perms.create && <button onClick={handleSendProposal} disabled={sending} style={{...s.btn,background:'#7c3aed',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}>
              {sending ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Send size={14}/>}
              Gửi đề xuất ({selectedKeys.size})
            </button>}
          </>
        ) : (
          <>
            <span style={{fontSize:'0.8rem',fontWeight:600,color:'#64748b',whiteSpace:'nowrap'}}>Tổng <strong style={{color:'#334155'}}>{rows.length}</strong> dòng</span>
            <button onClick={handleExport} disabled={loading} style={{...s.btn,background:'#10b981',color:'#fff',border:'none',padding:'0.4rem 0.75rem',marginLeft:'auto',flexShrink:0}}><Download size={14}/>Xuất Excel</button>
          </>
        )}
      </div>
    </div>
  );
}
