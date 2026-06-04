import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Layers, Calendar as CalendarIcon, Package, AlertTriangle, TrendingUp, Filter, Search, ChevronDown, Check, Wrench, FileText } from 'lucide-react';
import { 
  ComposedChart, BarChart as RechartsBarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#6366f1', '#ec4899', '#14b8a6'];

const MultiSelectDropdown = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
     <div ref={wrapperRef} style={{ position: 'relative', flex: '1 1 180px', minWidth: '150px' }}>
         <div onClick={() => setOpen(!open)} style={{ border: '1px solid #cbd5e1', padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', minHeight: '38px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, alignItems: 'center' }}>
               {selected.length === 0 ? (
                 <span style={{fontWeight: 600, fontSize:'0.9rem', color: '#475569', paddingLeft: '4px'}}>Tất cả {placeholder}</span>
               ) : (
                 <>
                   {selected.map(item => (
                      <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                         {item}
                         <span onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x !== item)); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dbeafe', color: '#3b82f6', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>&times;</span>
                      </span>
                   ))}
                   {selected.length > 1 && (
                      <span onClick={(e) => { e.stopPropagation(); onChange([]); }} style={{ display: 'inline-flex', alignItems: 'center', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                         Xóa
                      </span>
                   )}
                 </>
               )}
            </div>
            <ChevronDown size={16} color="#64748b" style={{ flexShrink: 0 }} />
         </div>
         {open && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '100%', maxHeight: '350px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <Search size={16} color="#94a3b8" />
                 <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm..." style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.9rem' }} />
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 0' }}>
                 {filtered.length === 0 ? (
                    <div style={{ padding: '0.5rem 1rem', color: '#94a3b8', fontSize: '0.9rem' }}>Không tìm thấy</div>
                 ) : (
                    filtered.map(o => {
                       const isSelected = selected.includes(o);
                       return (
                          <div key={o} onClick={() => {
                             if (isSelected) onChange(selected.filter(x => x !== o));
                             else onChange([...selected, o]);
                          }} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem 1rem', cursor: 'pointer', background: isSelected ? '#f0f9ff' : 'transparent', ':hover': {background: '#f8fafc'} }}>
                             <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: isSelected ? 'none' : '1px solid #cbd5e1', background: isSelected ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '0.8rem' }}>
                                {isSelected && <Check size={12} color="#fff" />}
                             </div>
                             <span style={{ fontSize: '0.9rem', color: isSelected ? '#1e293b' : '#475569', fontWeight: isSelected ? 600 : 400 }}>{o}</span>
                          </div>
                       );
                    })
                 )}
              </div>
           </div>
        )}
     </div>
  );
};

const BatchAnalytics = ({ data, salesData, onUpdateMissingInfo }) => {
  const [filterYear, setFilterYear] = useState('all');
  const [filterProducts, setFilterProducts] = useState([]);
  const [filterGroups, setFilterGroups] = useState([]);

  // Bảng map mã sản phẩm -> nhóm sản phẩm (được trích xuất từ dữ liệu bảo hành)
  const { availableProducts, availableGroups, productToGroupMap } = useMemo(() => {
     const prods = new Set();
     const grps = new Set();
     const p2g = {};
     data.forEach(tk => {
        const pd = String(tk['mã_sản_phẩm'] || '').trim().toUpperCase();
        const grp = String(tk['nhóm_sản_phẩm'] || '').trim();
        if (pd && grp && grp !== 'undefined' && grp !== 'null' && grp !== '') {
           p2g[pd] = grp;
           grps.add(grp);
        }
        if (pd) prods.add(pd); // Bao gồm cả SP bị lỗi trong Filter để người dùng tìm được
     });
     salesData.forEach(s => {
         const pd = String(s.ma_san_pham || '').trim().toUpperCase();
         if (pd) prods.add(pd);
     });
     return { availableProducts: Array.from(prods).sort(), availableGroups: Array.from(grps).sort(), productToGroupMap: p2g };
  }, [salesData, data]);

  const parseDateStr = (dStr) => {
      if (!dStr) return null;
      let s = String(dStr).trim();
      const match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
         const tMatch = s.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
         return new Date(match[3], parseInt(match[2])-1, match[1], tMatch?parseInt(tMatch[1]):0, tMatch?parseInt(tMatch[2]):0, tMatch?parseInt(tMatch[3]):0);
      }
      return new Date(s);
  };

  useEffect(() => {
     if (!onUpdateMissingInfo) return;
     const info = data.reduce((acc, tk) => {
         const pd = String(tk['mã_sản_phẩm'] || '').trim().toUpperCase();
         const pdGrp = productToGroupMap[pd] || 'Chưa phân nhóm';
         if (filterProducts.length > 0 && !filterProducts.includes(pd)) return acc;
         if (filterGroups.length > 0 && !filterGroups.includes(pdGrp)) return acc;

         if (filterYear !== 'all') {
            let year = null;
            if (tk['ngày_lắp_đặt']) {
               let d = parseDateStr(tk['ngày_lắp_đặt']);
               if (d && !isNaN(d.getTime())) year = String(d.getFullYear());
            }
            if (!year && tk['thời_điểm_tạo']) {
               let d = parseDateStr(tk['thời_điểm_tạo']);
               if (d && !isNaN(d.getTime())) year = String(d.getFullYear());
            }
            if (year !== String(filterYear)) return acc;
         }

         let missing = false;
         const isMissing = (val) => !val || String(val).trim() === '' || String(val).trim().toLowerCase() === 'không xác định';
         if (isMissing(tk['mã_đơn_hàng'])) { acc.maDonHang++; missing = true; }
         if (isMissing(tk['mã_sản_phẩm'])) { acc.maSanPham++; missing = true; }
         if (isMissing(tk['chi_tiết_lỗi'])) { acc.chiTietLoi++; missing = true; }
         if (isMissing(tk['linh_kiện'])) { acc.linhKien++; missing = true; }
         if (isMissing(tk['ngày_lắp_đặt'])) { acc.ngayLap++; missing = true; }
         if (missing) acc.totalTickets++;
         return acc;
     }, { maDonHang: 0, maSanPham: 0, chiTietLoi: 0, linhKien: 0, ngayLap: 0, totalTickets: 0 });
     
     onUpdateMissingInfo(info);
  }, [data, filterProducts, filterGroups, filterYear, productToGroupMap, onUpdateMissingInfo]);

  // Chế độ so sánh: khi chọn >= 2 sản phẩm
  const isCompareMode = filterProducts.length >= 2;

  // Logic 1: Map dữ liệu độc lập
  const { monthStatsArray, topFailedProducts, lifespanStats, unmappedCount, availableYears, perProductMonthData, perProductLifespanStats } = useMemo(() => {

    const mStats = {};
    const pStats = {};
    const yrs = new Set();
    // Per-product per-month stats cho chế độ so sánh
    const ppMonth = {}; // { 'YYYY-MM': { 'PRODUCT_CODE': { sold: X, failed: Y } } }
    
    // TỔNG HỢP XUẤT KHO THEO THÁNG
    salesData.forEach(sale => {
      if (!sale.ngay_xuat) return;
      const d = new Date(sale.ngay_xuat);
      const year = String(d.getFullYear());
      yrs.add(year);
      
      if (filterYear !== 'all' && filterYear !== year) return; 

      const pd = String(sale.ma_san_pham || '').trim().toUpperCase();
      const pdGrp = productToGroupMap[pd] || 'Chưa phân nhóm';
      if (filterProducts.length > 0 && !filterProducts.includes(pd)) return;
      if (filterGroups.length > 0 && !filterGroups.includes(pdGrp)) return;

      const mKey = `${year}-${String(d.getMonth()+1).padStart(2, '0')}`;
      if (!mStats[mKey]) mStats[mKey] = { month: mKey, totalSold: 0, totalFailed: 0 };
      mStats[mKey].totalSold += parseFloat(sale.so_luong || 0);

      // Per-product tracking
      if (pd && isCompareMode) {
        if (!ppMonth[mKey]) ppMonth[mKey] = {};
        if (!ppMonth[mKey][pd]) ppMonth[mKey][pd] = { sold: 0, failed: 0 };
        ppMonth[mKey][pd].sold += parseFloat(sale.so_luong || 0);
      }

      if (pd) {
        if (!pStats[pd]) pStats[pd] = { productCode: pd, productName: sale.ten_san_pham || pd, sold: 0, failed: 0 };
        pStats[pd].sold += parseFloat(sale.so_luong || 0);
      }
    });

    // TỔNG HỢP PHIẾU BẢO HÀNH (Mỗi phiếu đạt ĐK là 1 trường hợp bảo hành)
    let unmap = data.filter(t => !t['ngày_lắp_đặt'] || String(t['ngày_lắp_đặt']).trim() === '').length;
    
    const LIFESPAN_KEYS = ['Dưới 1 tháng', '1 - 3 tháng', '3 - 6 tháng', '6 - 12 tháng', 'Trên 1 năm'];
    const lStatsMap = {
       'Lỗi khi vừa xuất/lắp': 0, 'Dưới 1 tháng': 0, '1 - 3 tháng': 0, 
       '3 - 6 tháng': 0, '6 - 12 tháng': 0, 'Trên 1 năm': 0, 'Ngày tháng lỗi': 0 
    };
    // Per-product lifespan for compare mode
    const perProductLifespan = {};

    data.forEach(ticket => {
       const mh = String(ticket['mã_đơn_hàng'] || '').trim().toUpperCase() || 'KHÔNG XÁC ĐỊNH';
       const pd = String(ticket['mã_sản_phẩm'] || '').trim().toUpperCase() || 'KHÔNG XÁC ĐỊNH';
       const ctl = String(ticket['chi_tiết_lỗi'] || '').trim() || 'Không xác định';

       let installDateStr = ticket['ngày_lắp_đặt'];
       // Fallback: nếu không có ngày lắp đặt → dùng thời điểm tạo phiếu
       if (!installDateStr || String(installDateStr).trim() === '') {
         installDateStr = ticket['thời_điểm_tạo'];
       }
       if (!installDateStr || String(installDateStr).trim() === '') return;

       let installDate = parseDateStr(installDateStr);
       if (!installDate || isNaN(installDate.getTime())) return;

       const year = String(installDate.getFullYear());
       yrs.add(year);
       if (filterYear !== 'all' && filterYear !== year) return; 

       const mKey = `${year}-${String(installDate.getMonth()+1).padStart(2, '0')}`;
       const pdGrp = productToGroupMap[pd] || 'Chưa phân nhóm';
       if (filterProducts.length > 0 && !filterProducts.includes(pd)) return;
       if (filterGroups.length > 0 && !filterGroups.includes(pdGrp)) return;

       if (!mStats[mKey]) mStats[mKey] = { month: mKey, totalSold: 0, totalFailed: 0 };
       mStats[mKey].totalFailed += 1;
       
       // Per-product tracking
       if (pd && isCompareMode) {
         if (!ppMonth[mKey]) ppMonth[mKey] = {};
         if (!ppMonth[mKey][pd]) ppMonth[mKey][pd] = { sold: 0, failed: 0 };
         ppMonth[mKey][pd].failed += 1;
       }

       if (!pStats[pd]) pStats[pd] = { productCode: pd, productName: pd, sold: 0, failed: 0 };
       pStats[pd].failed += 1;

       let createDate = parseDateStr(ticket['thời_điểm_tạo']);

       let lifespanCategory = null;
       if (!createDate || isNaN(createDate.getTime())) {
          lStatsMap['Ngày tháng lỗi']++;
          lifespanCategory = 'Ngày tháng lỗi';
       } else {
          const diffD = (createDate.getTime() - installDate.getTime()) / 86400000;
          if (diffD < 0) { lStatsMap['Lỗi khi vừa xuất/lắp']++; lifespanCategory = 'Lỗi khi vừa xuất/lắp'; }
          else if (diffD <= 30) { lStatsMap['Dưới 1 tháng']++; lifespanCategory = 'Dưới 1 tháng'; }
          else if (diffD <= 90) { lStatsMap['1 - 3 tháng']++; lifespanCategory = '1 - 3 tháng'; }
          else if (diffD <= 180) { lStatsMap['3 - 6 tháng']++; lifespanCategory = '3 - 6 tháng'; }
          else if (diffD <= 365) { lStatsMap['6 - 12 tháng']++; lifespanCategory = '6 - 12 tháng'; }
          else { lStatsMap['Trên 1 năm']++; lifespanCategory = 'Trên 1 năm'; }
       }
       // Per-product lifespan
       if (lifespanCategory && pd) {
          if (!perProductLifespan[pd]) perProductLifespan[pd] = {};
          perProductLifespan[pd][lifespanCategory] = (perProductLifespan[pd][lifespanCategory] || 0) + 1;
       }
    });

    const rnd = (v) => Math.round(v * 1000) / 1000;
    const mArray = Object.values(mStats).sort((a,b) => a.month.localeCompare(b.month)).map(m => {
        m.totalSold = rnd(m.totalSold);
        let rate = m.totalSold > 0 ? (m.totalFailed / m.totalSold) * 100 : 0;
        const soldOk = Math.max(0, rnd(m.totalSold - m.totalFailed));
        const row = { ...m, soldOk, failureRate: parseFloat(rate.toFixed(2)) };
        // Gắn per-product data vào mỗi dòng
        if (isCompareMode && ppMonth[m.month]) {
           filterProducts.forEach(fp => {
              const pp = ppMonth[m.month]?.[fp] || { sold: 0, failed: 0 };
              row[`sold_${fp}`] = rnd(pp.sold);
              row[`failed_${fp}`] = pp.failed;
              row[`soldOk_${fp}`] = Math.max(0, rnd(pp.sold - pp.failed));
              row[`rate_${fp}`] = pp.sold > 0 ? parseFloat((pp.failed / pp.sold * 100).toFixed(2)) : 0;
           });
        }
        return row;
    });

    const pArray = Object.values(pStats).filter(p => p.sold > 0 || p.failed > 0).map(p => {
        let r = p.sold > 0 ? (p.failed / p.sold) * 100 : 100;
        return { ...p, rate: parseFloat(r.toFixed(2)) };
    }).sort((a,b) => b.rate - a.rate).slice(0, 15);

    const lArray = Object.entries(lStatsMap).filter(e => e[1] > 0).map(e => ({ name: e[0], value: e[1] }));
    const aYears = Array.from(yrs).sort().reverse();

    // Per-product lifespan arrays
    const ppLifespan = {};
    Object.keys(perProductLifespan).forEach(pd => {
       ppLifespan[pd] = Object.entries(perProductLifespan[pd]).filter(e => e[1] > 0).map(e => ({ name: e[0], value: e[1] }));
    });

    return { monthStatsArray: mArray, topFailedProducts: pArray, lifespanStats: lArray, unmappedCount: unmap, availableYears: aYears, perProductMonthData: ppMonth, perProductLifespanStats: ppLifespan };
  }, [data, salesData, filterYear, filterProducts, filterGroups, productToGroupMap, isCompareMode]);

  // Thống kê liên quan đến phiếu BH đã lọc (nhóm SP, linh kiện, chi tiết lỗi)
  const { groupBreakdown, componentBreakdown, errorBreakdown } = useMemo(() => {
    const filteredTickets = data.filter(tk => {
      const pd = String(tk['mã_sản_phẩm'] || '').trim().toUpperCase();
      const pdGrp = productToGroupMap[pd] || 'Chưa phân nhóm';
      if (filterProducts.length > 0 && !filterProducts.includes(pd)) return false;
      if (filterGroups.length > 0 && !filterGroups.includes(pdGrp)) return false;
      if (filterYear !== 'all') {
        let d = null;
        const dStr = tk['ngày_lắp_đặt'];
        if (dStr) d = parseDateStr(String(dStr));
        if (!d || isNaN(d.getTime()) || String(d.getFullYear()) !== filterYear) return false;
      }
      return true;
    });
    const countField = (field) => {
      const counts = {};
      filteredTickets.forEach(tk => {
        const val = tk[field];
        const pd = String(tk['mã_sản_phẩm'] || '').trim().toUpperCase();
        if (val && String(val).trim() !== '') {
          // Tách bằng dấu phẩy trong trường hợp nhập nhiều linh kiện/lỗi trên 1 dòng
          const parts = String(val).split(',').map(s => s.trim()).filter(s => s !== '');
          parts.forEach(k => {
             if (!counts[k]) counts[k] = { name: k, value: 0 };
             counts[k].value += 1;
             counts[k][pd] = (counts[k][pd] || 0) + 1;
          });
        }
      });
      return Object.values(counts).sort((a, b) => b.value - a.value);
    };
    return {
      groupBreakdown: countField('nhóm_sản_phẩm'),
      componentBreakdown: countField('linh_kiện').slice(0, 15),
      errorBreakdown: countField('chi_tiết_lỗi').slice(0, 15),
    };
  }, [data, filterYear, filterProducts, filterGroups, productToGroupMap]);

  // Màu sắc cho từng SP khi so sánh
  const PRODUCT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6'];
  const LINE_COLORS_DARK = ['#1d4ed8', '#6d28d9', '#047857', '#d97706', '#be185d', '#0e7490', '#4338ca', '#0f766e'];


  const CustomTooltip2 = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = monthStatsArray.find(m => m.month === label);
      return (
        <div style={{ background: '#fff', padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', maxWidth: '350px' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
          {isCompareMode && dataPoint ? filterProducts.map((fp, i) => (
            <div key={fp} style={{ borderBottom: i < filterProducts.length - 1 ? '1px solid #f1f5f9' : 'none', padding: '4px 0' }}>
              <p style={{ margin: '3px 0', color: PRODUCT_COLORS[i % PRODUCT_COLORS.length], fontWeight: 700, fontSize: '0.85rem' }}>{fp}</p>
              <p style={{ margin: '1px 0', fontSize: '0.8rem', color: '#475569' }}>Xuất: {dataPoint[`sold_${fp}`] || 0} | BH: {dataPoint[`failed_${fp}`] || 0} | Lỗi: {dataPoint[`rate_${fp}`] || 0}%</p>
            </div>
          )) : dataPoint && <>
            <p style={{ margin: '5px 0 0 0', color: '#3b82f6', fontWeight: 700 }}>Số Lượng Bán Ra: {dataPoint.totalSold}</p>
            <p style={{ margin: '5px 0 0 0', color: '#ef4444', fontWeight: 700 }}>Số Bảo Hành: {dataPoint.totalFailed}</p>
            <p style={{ margin: '5px 0 0 0', color: '#f59e0b', fontWeight: 700 }}>Tỷ lệ lỗi: {dataPoint.failureRate}%</p>
          </>}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
       {/* Filter Bar */}
       <div className="filter-bar" style={{ background: '#fff', padding: '1rem 0.8rem', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', marginBottom: '2rem', display:'flex', gap:'0.8rem', alignItems:'center', flexWrap: 'wrap' }}>
          <Filter size={20} color="var(--primary-color)" style={{flexShrink: 0}} />
          <span style={{ fontWeight: 600 }}>Phân tích lô bán theo năm:</span>
          <select 
             value={filterYear} onChange={e => setFilterYear(e.target.value)}
             style={{ padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 600 }}
          >
             <option value="all">Tất cả thời gian</option>
             {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <span style={{ fontWeight: 600, marginLeft: '1rem' }}>Mã Sản Phẩm:</span>
          <MultiSelectDropdown 
             options={availableProducts}
             selected={filterProducts}
             onChange={setFilterProducts}
             placeholder="Mã SP"
          />

          <span style={{ fontWeight: 600, marginLeft: '1rem' }}>Nhóm SP:</span>
          <MultiSelectDropdown 
             options={availableGroups}
             selected={filterGroups}
             onChange={setFilterGroups}
             placeholder="Nhóm SP"
          />
       </div>

       {monthStatsArray.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: '16px', color: 'var(--text-tertiary)' }}>
            Chưa có đủ dữ liệu bán hàng đồng bộ để phân tích.
          </div>
       ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.5rem' }}>
             
             {/* Chart 1: Xu Hướng */}
             <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#1e293b' }}>
                  <TrendingUp size={20} color="#6366f1"/> Tỷ lệ lỗi / Tổng xuất kho theo Tháng
                </h3>
                <div style={{ height: '400px', overflowX: 'auto', overflowY: 'hidden' }}>
                   <div style={{ width: Math.max(640, monthStatsArray.length * 56), height: '100%' }}>
                   <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthStatsArray} margin={{ top: 30, right: 20, bottom: 20, left: 0 }}>
                         <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3"/>
                         <XAxis dataKey="month" tick={{fontSize: 12, fontWeight: 500}} />
                         <YAxis yAxisId="left" orientation="left" stroke="#cbd5e1" tick={{fontSize: 12}} />
                         <YAxis yAxisId="right" orientation="right" stroke="#ef4444" tick={{fontSize: 12}} tickFormatter={v => `${v}%`} />
                         <RechartsTooltip content={<CustomTooltip2 />} />
                         <Legend wrapperStyle={{ fontSize: '12px' }} />
                         {isCompareMode ? (
                            filterProducts.map((fp, i) => {
                               const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length];
                               const failColor = '#f87171';
                               return [
                                  <Bar key={`fail_${fp}`} yAxisId="left" dataKey={`failed_${fp}`} name={`BH ${fp}`} fill={failColor} stackId={`stack_${fp}`} radius={[0,0,0,0]} maxBarSize={40} label={{ position: 'inside', fill: '#fff', fontSize: 11, fontWeight: 700, formatter: (v) => v > 0 ? v : '' }} />,
                                  <Bar key={`ok_${fp}`} yAxisId="left" dataKey={`soldOk_${fp}`} name={fp} fill={color} stackId={`stack_${fp}`} radius={[4,4,0,0]} maxBarSize={40} label={(props) => { const { x, y, width, value } = props; if (!value || value <= 0) return null; const total = props.payload?.[`sold_${fp}`] ?? value; return total > 0 ? <text x={x + width/2} y={y - 5} fill="#334155" fontSize={11} fontWeight={700} textAnchor="middle">{total}</text> : null; }} />
                               ];
                            }).flat()
                         ) : (<>
                            <Bar yAxisId="left" dataKey="totalFailed" name="Bảo Hành" fill="#f87171" stackId="sales" radius={[0,0,0,0]} maxBarSize={50} label={{ position: 'inside', fill: '#fff', fontSize: 12, fontWeight: 700, formatter: (v) => v > 0 ? v : '' }} />
                            <Bar yAxisId="left" dataKey="soldOk" name="Bình thường" fill="#60a5fa" stackId="sales" radius={[4,4,0,0]} maxBarSize={50} label={(props) => { const { x, y, width, value } = props; if (!value || value <= 0) return null; const total = props.payload?.totalSold ?? value; return <text x={x + width/2} y={y - 5} fill="#334155" fontSize={12} fontWeight={700} textAnchor="middle">{total}</text>; }} />
                         </>)}
                         {!isCompareMode && <Line yAxisId="right" type="monotone" dataKey="failureRate" name="Tỷ lệ lỗi (%)" stroke="#f59e0b" strokeWidth={3} dot={{r: 4, fill: '#f59e0b'}} activeDot={{r: 6}} label={{ position: 'top', fill: '#b45309', fontSize: 12, fontWeight: 700, formatter: (v) => `${v}%`, offset: 8 }} />}
                         {isCompareMode && filterProducts.map((fp, i) => (
                            <Line key={`line_${fp}`} yAxisId="right" type="monotone" dataKey={`rate_${fp}`} name={`% ${fp}`} stroke={LINE_COLORS_DARK[i % LINE_COLORS_DARK.length]} strokeWidth={3} dot={{r: 5, fill: LINE_COLORS_DARK[i % LINE_COLORS_DARK.length], strokeWidth: 2, stroke: '#fff'}} label={{ position: 'top', fill: LINE_COLORS_DARK[i % LINE_COLORS_DARK.length], fontSize: 11, fontWeight: 700, formatter: (v) => v > 0 ? `${v}%` : '', offset: 8 }} />
                         ))}
                      </ComposedChart>
                   </ResponsiveContainer>
                   </div>
                </div>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                 {/* Trái: Pie vòng đời */}
                 <div style={{ position: 'relative', minHeight: '350px' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingRight: '0.5rem' }}>
                       {isCompareMode ? (
                          filterProducts.map((fp, i) => {
                             const ppData = perProductLifespanStats[fp] || [];
                          return (
                             <div key={fp} style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', flex: 1, minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>
                                   <CalendarIcon size={16}/> Vòng đời: {fp}
                                </h3>
                                <div style={{ flex: 1 }}>
                                   <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                         <Pie data={ppData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, value, percent}) => `${name} (${(percent*100).toFixed(1)}%)`}>
                                            {ppData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                         </Pie>
                                         <RechartsTooltip />
                                      </PieChart>
                                   </ResponsiveContainer>
                                </div>
                             </div>
                          );
                       })
                    ) : (
                       <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: '#1e293b' }}>
                            <CalendarIcon size={18} color="#f59e0b"/> Vòng đời sử dụng trước khi hỏng
                          </h3>
                          <div style={{ flex: 1, minHeight: '350px' }}>
                             <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                   <Pie data={lifespanStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label={({name, value, percent}) => `${name}: ${value} (${(percent*100).toFixed(1)}%)`}>
                                      {lifespanStats.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                   </Pie>
                                   <RechartsTooltip />
                                </PieChart>
                             </ResponsiveContainer>
                          </div>
                       </div>
                    )}
                    </div>
                 </div>

                 {/* Phải: 2 bar charts xếp dọc */}
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Trên: Bar linh kiện lỗi */}
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                       <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: '#1e293b' }}>
                         <Wrench size={18} color="#f59e0b"/> Thống kê Linh Kiện Lỗi (Top 15)
                       </h3>
                       <div style={{ height: '250px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                             <RechartsBarChart data={componentBreakdown} margin={{ top: 10, right: 10, bottom: 60, left: 0 }}>
                                <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3"/>
                                <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 500, angle: -45, textAnchor: 'end'}} interval={0} height={80} />
                                <YAxis tick={{fontSize: 12}} />
                                <RechartsTooltip />
                                {isCompareMode && <Legend wrapperStyle={{ fontSize: '12px', bottom: 0 }} />}
                                {isCompareMode ? (
                                   filterProducts.map((fp, i) => (
                                      <Bar key={`comp_${fp}`} dataKey={fp} name={fp} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} radius={[4,4,0,0]} maxBarSize={40} label={{ position: 'top', fill: PRODUCT_COLORS[i % PRODUCT_COLORS.length], fontSize: 11, fontWeight: 700, formatter: (v) => v > 0 ? v : '' }} />
                                   ))
                                ) : (
                                   <Bar dataKey="value" name="Số lượng" fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={50} label={{ position: 'top', fill: '#b45309', fontSize: 12, fontWeight: 700 }} />
                                )}
                             </RechartsBarChart>
                          </ResponsiveContainer>
                       </div>
                    </div>

                    {/* Dưới: Bar chi tiết lỗi */}
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                       <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: '#1e293b' }}>
                         <FileText size={18} color="#ef4444"/> Chi Tiết Lỗi Thường Gặp (Top 15)
                       </h3>
                       <div style={{ height: '250px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                             <RechartsBarChart data={errorBreakdown} margin={{ top: 10, right: 10, bottom: 60, left: 0 }}>
                                <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3"/>
                                <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 500, angle: -45, textAnchor: 'end'}} interval={0} height={80} />
                                <YAxis tick={{fontSize: 12}} />
                                <RechartsTooltip />
                                {isCompareMode && <Legend wrapperStyle={{ fontSize: '12px', bottom: 0 }} />}
                                {isCompareMode ? (
                                   filterProducts.map((fp, i) => (
                                      <Bar key={`err_${fp}`} dataKey={fp} name={fp} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} radius={[4,4,0,0]} maxBarSize={40} label={{ position: 'top', fill: PRODUCT_COLORS[i % PRODUCT_COLORS.length], fontSize: 11, fontWeight: 700, formatter: (v) => v > 0 ? v : '' }} />
                                   ))
                                ) : (
                                   <Bar dataKey="value" name="Số lượng" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={50} label={{ position: 'top', fill: '#991b1b', fontSize: 12, fontWeight: 700 }} />
                                )}
                             </RechartsBarChart>
                          </ResponsiveContainer>
                       </div>
                    </div>
                 </div>
             </div>

             {/* Bảng Chi Tiết - full width */}
             <div style={{ marginTop: '0.5rem' }}>
                 <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#1e293b' }}>
                      <Layers size={20} color="#6366f1"/> Chi tiết xuất bán & bảo hành theo tháng
                    </h3>
                    <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                       <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize:'0.85rem' }}>
                          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', zIndex: 2 }}>
                            {isCompareMode ? (<>
                              <tr>
                                <th rowSpan={2} style={{ padding: '0.6rem', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e2e8f0', color: 'var(--text-secondary)', verticalAlign: 'bottom', background: '#f8fafc' }}>Tháng</th>
                                <th colSpan={filterProducts.length} style={{ padding: '0.6rem', borderBottom: '1px solid #bfdbfe', borderRight: '1px solid #bfdbfe', color: '#1d4ed8', textAlign: 'center', fontWeight: 700, background: '#eff6ff' }}>SỐ LƯỢNG XUẤT</th>
                                <th colSpan={filterProducts.length} style={{ padding: '0.6rem', borderBottom: '1px solid #fecaca', borderRight: '1px solid #fecaca', color: '#b91c1c', textAlign: 'center', fontWeight: 700, background: '#fef2f2' }}>SỐ BẢO HÀNH</th>
                                <th colSpan={filterProducts.length} style={{ padding: '0.6rem', borderBottom: '1px solid #fde68a', color: '#b45309', textAlign: 'center', fontWeight: 700, background: '#fffbeb' }}>TỶ LỆ %</th>
                              </tr>
                              <tr>
                                {filterProducts.map((fp, i) => <th key={`sh_${fp}`} style={{ background: '#eff6ff', padding: '0.4rem', borderBottom: '2px solid #bfdbfe', borderRight: i === filterProducts.length-1 ? '1px solid #bfdbfe' : 'none', color: PRODUCT_COLORS[i % PRODUCT_COLORS.length], textAlign: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{fp}</th>)}
                                {filterProducts.map((fp, i) => <th key={`bh_${fp}`} style={{ background: '#fef2f2', padding: '0.4rem', borderBottom: '2px solid #fecaca', borderRight: i === filterProducts.length-1 ? '1px solid #fecaca' : 'none', color: PRODUCT_COLORS[i % PRODUCT_COLORS.length], textAlign: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{fp}</th>)}
                                {filterProducts.map((fp, i) => <th key={`rt_${fp}`} style={{ background: '#fffbeb', padding: '0.4rem', borderBottom: '2px solid #fde68a', color: PRODUCT_COLORS[i % PRODUCT_COLORS.length], textAlign: 'center', fontSize: '0.75rem', fontWeight: 700 }}>{fp}</th>)}
                              </tr>
                            </>) : (
                              <tr>
                                <th style={{ padding: '0.8rem', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e2e8f0', color: 'var(--text-secondary)', background: '#f8fafc' }}>Tháng</th>
                                <th style={{ padding: '0.8rem', borderBottom: '2px solid #bfdbfe', borderRight: '1px solid #bfdbfe', color: '#1d4ed8', textAlign: 'center', background: '#eff6ff' }}>SỐ LƯỢNG XUẤT</th>
                                <th style={{ padding: '0.8rem', borderBottom: '2px solid #fecaca', borderRight: '1px solid #fecaca', color: '#b91c1c', textAlign: 'center', background: '#fef2f2' }}>SỐ BẢO HÀNH</th>
                                <th style={{ padding: '0.8rem', borderBottom: '2px solid #fde68a', color: '#b45309', textAlign: 'right', background: '#fffbeb' }}>TỶ LỆ %</th>
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {monthStatsArray.map((m, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.6rem', fontWeight: 600, color: 'var(--primary-color)', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0', background: '#f8fafc' }}>{m.month}</td>
                                {isCompareMode ? (<>
                                  {filterProducts.map((fp, i) => <td key={`s_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 600, borderRight: i === filterProducts.length-1 ? '1px solid #e2e8f0' : 'none', background: '#fafafa' }}>{m[`sold_${fp}`] || 0}</td>)}
                                  {filterProducts.map((fp, i) => <td key={`f_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', color: '#ef4444', fontWeight: 600, borderRight: i === filterProducts.length-1 ? '1px solid #e2e8f0' : 'none' }}>{m[`failed_${fp}`] || 0}</td>)}
                                  {filterProducts.map((fp, i) => { const r = m[`rate_${fp}`] || 0; return <td key={`r_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: r > 5 ? '#ef4444' : (r > 2 ? '#f59e0b' : '#10b981'), background: '#fafafa' }}>{r}%</td>; })}
                                </>) : (<>
                                  <td style={{ padding: '0.8rem', textAlign: 'center', fontWeight: 600, borderRight: '1px solid #e2e8f0', background: '#fafafa' }}>{m.totalSold}</td>
                                  <td style={{ padding: '0.8rem', textAlign: 'center', color: '#ef4444', fontWeight: 600, borderRight: '1px solid #e2e8f0' }}>{m.totalFailed}</td>
                                  <td style={{ padding: '0.8rem', textAlign: 'right', fontWeight: 700, color: m.failureRate > 5 ? '#ef4444' : (m.failureRate > 2 ? '#f59e0b' : '#10b981'), background: '#fafafa' }}>{m.failureRate}%</td>
                                </>)}
                              </tr>
                            ))}
                            {monthStatsArray.length > 0 && (
                              <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                                <td style={{ padding: '0.6rem', fontWeight: 700, color: '#1e293b', borderRight: '1px solid #cbd5e1' }}>Tổng</td>
                                {isCompareMode ? (<>
                                  {filterProducts.map((fp, i) => <td key={`ts_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, borderRight: i === filterProducts.length-1 ? '1px solid #cbd5e1' : 'none', background: '#f8fafc' }}>{monthStatsArray.reduce((a, m) => a + (m[`sold_${fp}`] || 0), 0)}</td>)}
                                  {filterProducts.map((fp, i) => <td key={`tf_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: '#ef4444', borderRight: i === filterProducts.length-1 ? '1px solid #cbd5e1' : 'none' }}>{monthStatsArray.reduce((a, m) => a + (m[`failed_${fp}`] || 0), 0)}</td>)}
                                  {filterProducts.map((fp, i) => { const ts = monthStatsArray.reduce((a, m) => a + (m[`sold_${fp}`] || 0), 0); const tf = monthStatsArray.reduce((a, m) => a + (m[`failed_${fp}`] || 0), 0); const r = ts > 0 ? (tf/ts*100).toFixed(2) : 0; return <td key={`tr_${fp}`} style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: '#6366f1', background: '#f8fafc' }}>{r}%</td>; })}
                                </>) : (<>
                                  <td style={{ padding: '0.8rem', textAlign: 'center', fontWeight: 700, color: '#1e293b', borderRight: '1px solid #cbd5e1', background: '#f8fafc' }}>{monthStatsArray.reduce((a, m) => a + m.totalSold, 0)}</td>
                                  <td style={{ padding: '0.8rem', textAlign: 'center', fontWeight: 700, color: '#ef4444', borderRight: '1px solid #cbd5e1' }}>{monthStatsArray.reduce((a, m) => a + m.totalFailed, 0)}</td>
                                  <td style={{ padding: '0.8rem', textAlign: 'right', fontWeight: 700, color: '#6366f1', background: '#f8fafc' }}>
                                    {(() => { const ts = monthStatsArray.reduce((a, m) => a + m.totalSold, 0); const tf = monthStatsArray.reduce((a, m) => a + m.totalFailed, 0); return ts > 0 ? (tf / ts * 100).toFixed(2) : 0; })()}%
                                  </td>
                                </>)}
                              </tr>
                            )}
                            {monthStatsArray.length === 0 && (
                              <tr><td colSpan={isCompareMode ? 1 + filterProducts.length * 3 : 4} style={{padding:'2rem', textAlign:'center', color:'#94a3b8'}}>Không có dữ liệu.</td></tr>
                            )}
                          </tbody>
                       </table>
                    </div>
                 </div>
             </div>
          </div>
       )}
       <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
       `}</style>
    </div>
  );
};

export default BatchAnalytics;
