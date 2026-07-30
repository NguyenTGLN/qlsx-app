import React, { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Loader2, RefreshCw, Factory, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { loadBomMap, loadComponentStock, loadComponentStockExclWip, recomputeProposals } from '../../lib/dksxEngine';
import { computeReplenishQty } from '../../lib/mrp';

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.7rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:'#475569' },
};
const th = { padding:'0.4rem 0.35rem', borderBottom:'2px solid #e2e8f0', fontSize:'0.68rem', fontWeight:700, color:'#64748b', textAlign:'center', whiteSpace:'nowrap' };
const td = { padding:'0.35rem', textAlign:'center', verticalAlign:'middle', fontVariantNumeric:'tabular-nums' };

function pctColor(p) { return p >= 100 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626'; }

export default function DKSXTab({ navigateTo, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

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
        db.from('inventory_items').select('item_code, lead_time_days, backup_stock_days'),
      ]);

      // TB bán 90 ngày + tham số lead time/an toàn của chính THÀNH PHẨM (không phải linh kiện)
      // — để tính lại "Cần SX" tươi bằng computeReplenishQty (mrp.js), độc lập với qty_demand
      // đã chốt từ trước (số đó chỉ giảm khi làm phiếu SX, không tự cập nhật theo doanh số/tồn mới).
      const salesMap = {};
      (sales || []).forEach(r => { if (r.ma_san_pham) salesMap[r.ma_san_pham] = Number(r.total_sales) || 0; });
      const paramsMap = {};
      (items || []).forEach(r => { paramsMap[r.item_code] = { leadTimeDays: Number(r.lead_time_days) || 0, backupStockDays: Number(r.backup_stock_days) || 0 }; });

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
    } catch (e) {
      console.error(e);
      alert('Lỗi tải DKSX: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <div style={{padding:'0.5rem',display:'flex',alignItems:'center',gap:8}}>
          <Factory size={16} style={{color:'#4f46e5'}}/>
          <span style={{fontSize:'0.85rem',fontWeight:700,color:'#4f46e5'}}>DKSX — Nhu cầu sản xuất thành phẩm</span>
          <button onClick={fetchData} disabled={loading} style={{...s.btn,padding:'0.4rem',marginLeft:'auto'}}>
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
                        {(perms.create || perms.delete) ? (<>
                        {perms.create && <button onClick={()=>handleMakeOrder(row)} style={{...s.btn,padding:'0.25rem 0.5rem',color:'#fff',background:'#4f46e5',border:'none'}}>
                          <Factory size={12}/>Làm phiếu SX
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
    </div>
  );
}
