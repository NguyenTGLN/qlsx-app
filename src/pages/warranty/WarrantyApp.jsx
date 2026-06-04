import React, { useState, useEffect } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { useNavigate } from 'react-router-dom';
import { taskDb } from '../../lib/task_supabase';
import { dataCache } from '../../lib/dataCache';
import { 
  ArrowLeft, Calendar as CalendarIcon, ShieldAlert, BarChart2, 
  Activity, Layers, AlertTriangle, PenTool, RefreshCw
} from 'lucide-react';
import ModuleShell, { TabButton } from '../../components/ModuleShell';
import DateRangeDropdown from '../../components/DateRangeDropdown';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import BatchAnalytics from './BatchAnalytics';
import WarrantyDataManager from './WarrantyDataManager';

// Nếu dùng supabase của taskDb (ẩn danh)
const db = taskDb;

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];

const WarrantyApp = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [salesData, setSalesData] = useState([]);
  const [viewMode, setViewMode] = usePersistedState('warranty_viewMode', 'menu'); // 'menu' | 'history' | 'batchAnalytics' | 'dataManager'
  
  // States cho bộ lọc (persisted) — dùng DateRangeDropdown chuẩn (đồng bộ với Kho)
  const [dateRange, setDateRange] = usePersistedState('warranty_dateRange', (() => {
    const n = new Date(); const pad = x => String(x).padStart(2, '0');
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0);
    return { preset: 'Tháng này', from: `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`, to: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}` };
  })());
  // Map preset của DateRangeDropdown → id để tái dùng nguyên switch tính khoảng ngày bên dưới
  const PRESET_TO_ID = { 'Hôm nay':'today','Hôm qua':'yesterday','Tuần này':'week','Tuần trước':'last_week','Tháng này':'month','Tháng trước':'last_month','Năm nay':'year','Năm trước':'last_year','Tùy chỉnh':'custom','Tất cả':'all' };
  const filterType = PRESET_TO_ID[dateRange.preset] || 'all';
  const customDates = { start: dateRange.from, end: dateRange.to };

  const WARRANTY_CACHE_KEY = 'warranty_app_data';

  // 🚀 Batched pagination: giới hạn số request đồng thời để tránh Supabase timeout
  const paginateFetch = async (table, selectCols = '*') => {
    const { count, error: countErr } = await db.from(table).select(selectCols, { count: 'exact', head: true });
    if (countErr) { console.warn(`[paginateFetch] ${table} count error:`, countErr.message); return []; }
    if (!count || count === 0) return [];
    
    const step = 1000;
    const totalPages = Math.ceil(count / step);
    const BATCH_SIZE = 5; // Tối đa 5 request song song cùng lúc
    const allData = [];

    for (let batch = 0; batch < totalPages; batch += BATCH_SIZE) {
      const batchPromises = [];
      for (let i = batch; i < Math.min(batch + BATCH_SIZE, totalPages); i++) {
        batchPromises.push(
          db.from(table).select(selectCols).range(i * step, (i + 1) * step - 1)
            .then(r => r.data || [])
            .catch(() => []) // Bỏ qua lỗi từng trang
        );
      }
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(data => allData.push(...data));
    }

    return allData;
  };

  // Fetch dữ liệu — 🚀 OPTIMIZED: Parallel pagination + Module Cache + Progressive Loading
  const fetchData = async (forceRefresh = false) => {
    // 🚀 Cache hit: hiển thị ngay dữ liệu từ bộ nhớ
    if (!forceRefresh) {
      const cached = dataCache.get(WARRANTY_CACHE_KEY);
      if (cached) {
        setData(cached.data);
        setSalesData(cached.salesData);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      // 🚀 Phase 1: Load warranty tickets first (fast, typically smaller dataset)
      const allRecords = await paginateFetch('phieu_bao_hanh');
      setData(allRecords);
      setLoading(false); // Hiển thị UI ngay lập tức với dữ liệu phiếu BH

      // 🚀 Phase 2: Đọc bảng tổng hợp bán hàng (đã aggregate sẵn bởi trigger DB)
      // Luồng: luu_xuat → [trigger 1] → so_luong_ban → [trigger 2] → thong_ke_ban_hang
      // Bảng thong_ke_ban_hang ~7.5K rows → dùng paginateFetch để lấy hết
      const aggData = await paginateFetch('thong_ke_ban_hang', 'month, ma_san_pham, ten_san_pham, so_luong');

      const mappedSales = (aggData || []).map(v => ({
        ngay_xuat: v.month + '-01',
        ma_san_pham: v.ma_san_pham,
        ten_san_pham: v.ten_san_pham,
        so_luong: v.so_luong
      }));

      // Lưu cache (5 phút)
      dataCache.set(WARRANTY_CACHE_KEY, { data: allRecords, salesData: mappedSales });
      setSalesData(mappedSales);

    } catch (err) {
      console.error('Lỗi khi tải dữ liệu:', err);
      alert('Không thể tải dữ liệu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Lọc dữ liệu theo thời gian
  const getFilteredData = () => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    // Hàm support lấy đầu ngày
    const startOfD = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const endOfD = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

    let start = new Date('2000-01-01');
    let end = new Date('2100-01-01');

    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday
    
    switch (filterType) {
      case 'today':
        start = startOfD(today); end = endOfD(today); break;
      case 'yesterday': {
        const y = new Date(today.getTime() - 86400000);
        start = startOfD(y); end = endOfD(y); break;
      }
      case 'week': {
        start = new Date(today);
        start.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
        start = startOfD(start); end = endOfD(today); break;
      }
      case 'last_week': {
        const lastSun = new Date(today); lastSun.setDate(today.getDate() - (currentDay === 0 ? 0 : currentDay) - 0); // last sub = end of last week wait...
        const diff = currentDay === 0 ? 6 : currentDay - 1; 
        const mondayThw = new Date(today); mondayThw.setDate(today.getDate() - diff);
        const lastSun2 = new Date(mondayThw); lastSun2.setDate(mondayThw.getDate() - 1);
        const lastMon = new Date(lastSun2); lastMon.setDate(lastSun2.getDate() - 6);
        start = startOfD(lastMon); end = endOfD(lastSun2); break;
      }
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1); end = endOfD(today); break;
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59); break;
      case 'year':
        start = new Date(today.getFullYear(), 0, 1); end = endOfD(today); break;
      case 'last_year':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31, 23, 59, 59); break;
      case 'custom':
        if (customDates.start) start = new Date(customDates.start);
        if (customDates.end) { end = new Date(customDates.end); end.setHours(23, 59, 59); }
        break;
      default: // all
        break;
    }

    return data.filter(item => {
      if (!item.thời_điểm_tạo) return false;
      let dStr = String(item.thời_điểm_tạo).trim();
      let d;
      const match = dStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const tMatch = dStr.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        d = new Date(match[3], parseInt(match[2])-1, match[1], tMatch?parseInt(tMatch[1]):0, tMatch?parseInt(tMatch[2]):0, tMatch?parseInt(tMatch[3]):0);
      } else {
        d = new Date(dStr);
      }
      return d >= start && d <= end;
    });
  };

  const filtered = getFilteredData();

  // Metrics
  const totalTickets = filtered.length;
  const missingSla = filtered.filter(f => f['đáp_ứng_sla'] === 'Không đáp ứng SLA').length;
  const closedTickets = filtered.filter(f => f['trạng_thái_phiếu_ghi'] === 'closed').length;
  const activeTickets = totalTickets - closedTickets;

  // Phân luồng Cảnh báo thiếu thông tin theo từng Tab
  const [batchMissingInfo, setBatchMissingInfo] = useState(null);

  // 1. Thống kê theo bộ lọc Lịch sử (viewMode = history)
  const historyMissingInfo = filtered.reduce((acc, tk) => {
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

  // 2. Thống kê tuyệt đối toàn cục (Cho Data Manager)
  const globalMissingInfo = data.reduce((acc, tk) => {
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

  let displayMissingInfo = globalMissingInfo;
  if (viewMode === 'history') displayMissingInfo = historyMissingInfo;
  else if (viewMode === 'batchAnalytics') displayMissingInfo = batchMissingInfo || globalMissingInfo;


  // Xử lý thống kê (Phân bổ)
  const countStats = (field) => {
    const counts = {};
    filtered.forEach(it => {
       const val = it[field];
       if (val && String(val).trim() !== '') {
          const k = String(val).trim();
          counts[k] = (counts[k] || 0) + 1;
       }
    });
    return Object.keys(counts).map(k => ({ name: k, value: counts[k] })).sort((a,b) => b.value - a.value);
  };

  const groupStats = countStats('nhóm_sản_phẩm');
  const productStats = countStats('mã_sản_phẩm').slice(0, 15); // Top 15
  const componentStats = countStats('linh_kiện').slice(0, 15); // Top 15
  const errorStats = countStats('chi_tiết_lỗi').slice(0, 15); // Top 15

  // Custom Tooltip cho biểu đồ
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#fff', padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{label || payload[0].name}</p>
          <p style={{ margin: '5px 0 0 0', color: 'var(--danger-color)', fontWeight: 700 }}>
            Số lượng: {payload[0].value} ca
          </p>
        </div>
      );
    }
    return null;
  };

  const renderFilterButtons = () => (
    <DateRangeDropdown label="Ngày" value={dateRange} onChange={setDateRange} />
  );

  if (loading && data.length === 0) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc', flexDirection: 'column'}}>
         <RefreshCw size={48} color="var(--danger-color)" className="spin" />
         <p style={{marginTop: '1rem', color: 'var(--text-secondary)', fontWeight: 600}}>Đang tải dữ liệu...</p>
      </div>
    );
  }

  return (
    <ModuleShell
      title="Bảo Hành"
      icon={Activity}
      color="#6366f1"
      loading={loading}
      onRefresh={() => { dataCache.invalidate(WARRANTY_CACHE_KEY); fetchData(true); }}
      onBack={viewMode !== 'menu' ? () => setViewMode('menu') : undefined}
      tabs={viewMode !== 'menu' ? (
        <>
          <TabButton active={viewMode==='history'} onClick={()=>setViewMode('history')} icon={Layers} label="Lịch Sử Phiếu" color="#6366f1" />
          <TabButton active={viewMode==='batchAnalytics'} onClick={()=>setViewMode('batchAnalytics')} icon={BarChart2} label="Phân Tích Lỗi" color="#6366f1" />
          <TabButton active={viewMode==='dataManager'} onClick={()=>setViewMode('dataManager')} icon={PenTool} label="QL Dữ Liệu" color="#6366f1" />
        </>
      ) : null}
    >
      {/* Bộ lọc (chỉ hiện trong Lịch Sử) */}
      {viewMode === 'history' && (
         <div style={{ padding: '0.4rem 0.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {renderFilterButtons()}
         </div>
      )}

      <main style={{ width: '100%', margin: '0 auto', padding: viewMode === 'menu' ? '1rem' : '1rem 0.5rem', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'menu' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            maxWidth: 800,
            width: '100%',
            alignSelf: 'center',
          }}>
            {[
              { id: 'history', label: 'Lịch Sử Phiếu', icon: Layers },
              { id: 'batchAnalytics', label: 'Phân Tích Lỗi', icon: BarChart2 },
              { id: 'dataManager', label: 'QL Dữ Liệu', icon: PenTool }
            ].map(tabDef => (
              <button
                key={tabDef.id}
                onClick={() => setViewMode(tabDef.id)}
                style={{
                  background: '#fff', borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  padding: '1.25rem 0.5rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '0.5rem', cursor: 'pointer',
                  transition: 'all 0.25s',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                }}>
                  <tabDef.icon size={24} color="#fff" />
                </div>
                <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center' }}>
                  {tabDef.label}
                </h3>
              </button>
            ))}
          </div>
        ) : (
          <>
        <div style={{ display: viewMode === 'history' ? 'block' : 'none' }}>

        {/* Global Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
           <div style={{...styles.metricCard, borderBottom: '4px solid #3b82f6'}}>
              <div>
                <p style={styles.metricLabel}>TỔNG SỐ CA PHÁT SINH</p>
                <h2 style={{...styles.metricValue, color: '#3b82f6'}}>{totalTickets}</h2>
              </div>
              <div style={styles.metricIcon('#eff6ff', '#3b82f6')}><Activity size={24}/></div>
           </div>
           
           <div style={{...styles.metricCard, borderBottom: '4px solid #f59e0b'}}>
              <div>
                <p style={styles.metricLabel}>CHƯA XỬ LÝ XONG (OPEN)</p>
                <h2 style={{...styles.metricValue, color: '#f59e0b'}}>{activeTickets}</h2>
              </div>
              <div style={styles.metricIcon('#fef3c7', '#f59e0b')}><AlertTriangle size={24}/></div>
           </div>

           <div style={{...styles.metricCard, borderBottom: '4px solid #ef4444'}}>
              <div>
                <p style={styles.metricLabel}>KHÔNG ĐÁP ỨNG SLA</p>
                <h2 style={{...styles.metricValue, color: '#ef4444'}}>{missingSla} <span style={{fontSize:'1rem', color:'var(--text-tertiary)', fontWeight:500}}>/ {totalTickets}</span></h2>
              </div>
              <div style={styles.metricIcon('#fee2e2', '#ef4444')}><Activity size={24}/></div>
           </div>

           <div style={{...styles.metricCard, borderBottom: '4px solid #10b981'}}>
              <div>
                <p style={styles.metricLabel}>ĐÃ HOÀN THÀNH (CLOSED)</p>
                <h2 style={{...styles.metricValue, color: '#10b981'}}>{closedTickets}</h2>
              </div>
              <div style={styles.metricIcon('#d1fae5', '#10b981')}><ShieldAlert size={24}/></div>
           </div>
        </div>

        {/* BIỂU ĐỒ */}
        {filtered.length === 0 ? (
           <div style={{ textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: '16px', color: 'var(--text-tertiary)' }}>
             <p style={{margin: '0'}}>Không có dữ liệu phiếu bảo hành trong khoảng thời gian được chọn.</p>
           </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
               
               {/* Trái trên - Pie: Nhóm SP */}
               <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}><Layers size={20}/> Tỷ Lệ Theo Nhóm Sản Phẩm</h3>
                  <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                          <Pie 
                            data={groupStats} 
                            cx="50%" cy="50%" 
                            innerRadius={60} outerRadius={100} 
                            paddingAngle={5} dataKey="value"
                            label={({name, percent}) => `${name} (${(percent * 100).toFixed(1)}%)`}
                            labelLine={false}
                          >
                            {groupStats.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip content={<CustomTooltip />} />
                       </PieChart>
                    </ResponsiveContainer>
                  </div>
               </div>

               {/* Phải trên - Bar: SP lỗi nhiều nhất */}
               <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}><ShieldAlert size={20} color="#ef4444"/> Sản Phẩm Báo Lỗi Nhiều Nhất (Top 15)</h3>
                  <div style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={productStats} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                          <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} angle={-(45)} textAnchor="end" height={60} />
                          <YAxis />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]}>
                             <LabelList dataKey="value" position="top" style={{fill: '#475569', fontSize: 12, fontWeight: 600}} />
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>

               {/* Trái dưới - Bar: Lỗi thường gặp */}
               <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}><AlertTriangle size={20} color="#f59e0b"/> Các Lỗi Thường Gặp (Top 15)</h3>
                  <div style={{ height: '350px', paddingRight: '1rem' }}>
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={errorStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9"/>
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 11}} />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]}>
                            <LabelList dataKey="value" position="right" style={{fill: '#475569', fontSize: 12, fontWeight: 600}} />
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>

               {/* Phải dưới - Bar: Linh kiện lỗi */}
               <div style={styles.chartCard}>
                  <h3 style={styles.chartTitle}><PenTool size={20} color="#3b82f6"/> Thống Kê Linh Kiện Lỗi / Cần Thay (Top 15)</h3>
                  <div style={{ height: '350px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={componentStats} margin={{ top: 20, right: 20, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                          <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} angle={-(30)} textAnchor="end" height={80} />
                          <YAxis />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                             <LabelList dataKey="value" position="top" style={{fill: '#475569', fontSize: 12, fontWeight: 600}} />
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
               
            </div>

             {/* KHU VỰC PHÂN TÍCH CHUYÊN Sâu TRỰC QUAN */}
             <DeepAnalytics filteredData={filtered} />
          </>
        )}
        </div>

        <div style={{ display: viewMode === 'batchAnalytics' ? 'block' : 'none' }}>
          <BatchAnalytics data={data} salesData={salesData} onUpdateMissingInfo={setBatchMissingInfo} />
        </div>

        <div style={{ display: viewMode === 'dataManager' ? 'block' : 'none' }}>
          <WarrantyDataManager data={data} refreshData={fetchData} />
        </div>
        </>
      )}
      </main>
    </ModuleShell>
  );
};

const DeepAnalytics = ({ filteredData }) => {
  const [tab, setTab] = useState('nhóm_sản_phẩm');
  const [expandedRow, setExpandedRow] = useState(null);

  const tabs = [
    { id: 'nhóm_sản_phẩm', label: 'Theo Nhóm Sản Phẩm' },
    { id: 'mã_sản_phẩm', label: 'Theo Mã Sản Phẩm' },
    { id: 'linh_kiện', label: 'Theo Linh Kiện' },
    { id: 'chi_tiết_lỗi', label: 'Theo Chi Tiết Lỗi' },
    { id: 'tuổi_thọ', label: 'Tuổi Thọ (Bảo Hành Lần 1)' },
    { id: 'tần_suất', label: 'Tần Suất Phân Bổ' },
    { id: 'máy_lỗi_nhiều', label: 'Top Máy Trục Trặc Nhiều' }
  ];

  // Dynamic columns based on current grouping tab
  let col1 = 'linh_kiện', col1lbl = 'Linh Kiện';
  let col2 = 'chi_tiết_lỗi', col2lbl = 'Chi Tiết Lỗi';
  let col3 = null, col3lbl = null;
  
  if (tab === 'nhóm_sản_phẩm') {
    col3 = 'mã_sản_phẩm'; col3lbl = 'Mã Sản Phẩm';
  }
  else if (tab === 'linh_kiện') { 
    col1 = 'mã_sản_phẩm'; col1lbl = 'Mã Sản Phẩm'; 
  }
  else if (tab === 'chi_tiết_lỗi') { 
    col1 = 'mã_sản_phẩm'; col1lbl = 'Mã Sản Phẩm'; 
    col2 = 'linh_kiện'; col2lbl = 'Linh Kiện'; 
  }
  else if (tab === 'tuổi_thọ' || tab === 'tần_suất') {
    col1 = 'nhóm_sản_phẩm'; col1lbl = 'Nhóm Sản Phẩm';
    col2 = 'mã_sản_phẩm'; col2lbl = 'Mã Sản Phẩm';
  }

  // Pre-calculate groups
  const statsMap = {};

  const parseD = (dStr) => {
    if (!dStr) return new Date(0);
    dStr = String(dStr);
    if (dStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
      const parts = dStr.split(/[\s/:]+/);
      return new Date(parts[2], parseInt(parts[1]||1)-1, parts[0], parts[3]||0, parts[4]||0, parts[5]||0);
    }
    return new Date(dStr);
  };
  let topMachines = [];

  if (tab === 'máy_lỗi_nhiều') {
     const machineClusters = {};
     filteredData.forEach((it, idx) => {
       const msp = String(it['mã_sản_phẩm'] || '').trim() || 'Không xác định';
       const sdt = String(it['số_điện_thoại_khách_hàng'] || '').trim() || 'Không xác định';
       const rawMdh = String(it['mã_đơn_hàng'] || '').trim();
       const mdh = rawMdh || 'Không xác định';

       let key;
       if (!rawMdh || rawMdh.toLowerCase() === 'không xác định') {
           key = `TICKET_${it['id_phiếu_ghi'] || ('idx' + idx)}_${msp}`;
       } else {
           key = `${mdh}_${msp}`;
       }

       if (!machineClusters[key]) machineClusters[key] = { msp, mdh, sdt, count: 0 };
       machineClusters[key].count++;
     });
     topMachines = Object.values(machineClusters)
         .filter(m => m.count > 1) // Chỉ cần hiển thị máy bảo hành >1 lần (hoặc nếu muốn hiện hết thì bỏ filter)
         .sort((a, b) => b.count - a.count);
  }
  else if (tab === 'tuổi_thọ' || tab === 'tần_suất') {
     // Cluster by Machine
     const machineClusters = {};
     filteredData.forEach((it, idx) => {
       const msp = String(it['mã_sản_phẩm'] || '').trim() || 'UnknownProduct';
       const rawMdh = String(it['mã_đơn_hàng'] || '').trim();

       let mID;
       if (!rawMdh || rawMdh.toLowerCase() === 'không xác định') {
           mID = `TICKET_${it['id_phiếu_ghi'] || ('idx' + idx)}_${msp}`;
       } else {
           mID = `${rawMdh}_${msp}`;
       }

       if (!machineClusters[mID]) machineClusters[mID] = [];
       machineClusters[mID].push(it);
     });

     if (tab === 'tuổi_thọ') {
       Object.values(machineClusters).forEach(tickets => {
         tickets.sort((a, b) => parseD(a['thời_điểm_tạo']) - parseD(b['thời_điểm_tạo']));
         const firstTicket = tickets[0];
         const lapDat = parseD(firstTicket['ngày_lắp_đặt']);
         if (lapDat.getTime() === new Date(0).getTime() || isNaN(lapDat.getTime())) {
            const b = 'Không có ngày lắp';
            if (!statsMap[b]) statsMap[b] = { name: b, count: 0, items: [], order: 99 };
            statsMap[b].count++;
            statsMap[b].items.push(firstTicket);
            return;
         }
         const tao = parseD(firstTicket['thời_điểm_tạo']);
         const diffDays = (tao - lapDat) / (1000 * 60 * 60 * 24);
         
         let b = '', order = 0;
         if (diffDays <= 30) { b = 'Dưới 1 tháng'; order = 1; }
         else if (diffDays <= 90) { b = '1 - 3 tháng'; order = 2; }
         else if (diffDays <= 180) { b = '3 - 6 tháng'; order = 3; }
         else if (diffDays <= 365) { b = '6 - 12 tháng'; order = 4; }
         else if (diffDays <= 547) { b = '12 - 18 tháng'; order = 5; }
         else if (diffDays <= 730) { b = '18 - 24 tháng'; order = 6; }
         else if (diffDays <= 1095) { b = '24 - 36 tháng'; order = 7; }
         else if (diffDays <= 1825) { b = '36 - 60 tháng'; order = 8; }
         else { b = 'Trên 60 tháng'; order = 9; }
         
         if (!statsMap[b]) statsMap[b] = { name: b, count: 0, items: [], order };
         statsMap[b].count++;
         statsMap[b].items.push(firstTicket);
       });
     } else {
       // Tần suất bảo hành
       Object.values(machineClusters).forEach(tickets => {
         const freq = tickets.length;
         let b = '', order = 0;
         if (freq === 1) { b = 'Bảo hành 1 Lần'; order = 1; }
         else if (freq === 2) { b = 'Bảo hành 2 Lần'; order = 2; }
         else if (freq === 3) { b = 'Bảo hành 3 Lần'; order = 3; }
         else if (freq === 4) { b = 'Bảo hành 4 Lần'; order = 4; }
         else { b = `Bảo hành ${freq} Lần`; order = freq; }
         
         if (!statsMap[b]) statsMap[b] = { name: b, count: 0, items: [], order };
         statsMap[b].count++;
         statsMap[b].items.push(tickets[0]);
       });
     }
  } else {
    // Normal grouping
    filteredData.forEach(it => {
       let key = String(it[tab] || '').trim();
       if (!key) key = 'Không xác định';
       if (!statsMap[key]) statsMap[key] = { name: key, count: 0, items: [] };
       statsMap[key].count++;
       statsMap[key].items.push(it);
    });
  }

  const statsArray = Object.values(statsMap).sort((a, b) => {
    if (tab === 'tuổi_thọ' || tab === 'tần_suất') return a.order - b.order;
    return b.count - a.count;
  });

  const totalRowsContext = (tab === 'tuổi_thọ' || tab === 'tần_suất') 
      ? statsArray.reduce((sum, item) => sum + item.count, 0)
      : filteredData.length;

  return (
    <div style={{ ...styles.chartCard, marginTop: '2rem' }}>
       <h3 style={styles.chartTitle}><Layers size={20} color="#6366f1"/> Ma Trận Phân Tích Đa Chiều (Drill-down Analytics)</h3>
       
       <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1rem', flexWrap: 'wrap' }}>
         {tabs.map(t => (
           <button
             key={t.id}
             onClick={() => { setTab(t.id); setExpandedRow(null); }}
             style={{
               padding: '0.5rem 0.9rem', background: 'none', border: 'none', fontWeight: 600, fontSize: '0.8rem',
               color: tab === t.id ? '#6366f1' : 'var(--text-secondary)',
               borderBottom: tab === t.id ? '3px solid #6366f1' : '3px solid transparent',
               cursor: 'pointer', transition: '0.2s', marginBottom: '-1px', whiteSpace: 'nowrap'
             }}
           >
             {t.label}
           </button>
         ))}
       </div>

       <div style={{ overflowX: 'auto' }}>
         {tab === 'máy_lỗi_nhiều' ? (
           <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
             <thead>
               <tr style={{ background: '#f8fafc', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                 <th style={{...styles.th, width: '60px', textAlign: 'center'}}>STT</th>
                 <th style={styles.th}>Mã Sản Phẩm</th>
                 <th style={styles.th}>Mã Đơn Hàng</th>
                 <th style={styles.th}>SĐT Khách Hàng</th>
                 <th style={{...styles.th, textAlign: 'center', width: '200px'}}>Tổng Số Lần Bảo Hành</th>
               </tr>
             </thead>
             <tbody>
               {topMachines.length === 0 ? (
                 <tr><td colSpan={5} style={{padding: '2rem', textAlign: 'center', color: '#94a3b8'}}>Chưa có máy nào bảo hành nhiều lần</td></tr>
               ) : topMachines.map((m, i) => (
                 <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }} onMouseOver={e=>e.currentTarget.style.background='#f8fafc'} onMouseOut={e=>e.currentTarget.style.background='#fff'}>
                   <td style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                   <td style={{ padding: '1rem', fontWeight: 600, color: '#1e293b' }}>{m.msp}</td>
                   <td style={{ padding: '1rem', color: '#475569' }}>{m.mdh}</td>
                   <td style={{ padding: '1rem', color: '#3b82f6', fontWeight: 500 }}>{m.sdt}</td>
                   <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: '#ef4444' }}>{m.count} Lần</td>
                 </tr>
               ))}
             </tbody>
           </table>
         ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
             <tr style={{ background: '#f8fafc', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
               <th style={styles.th}></th>
               <th style={styles.th}>{tabs.find(t=>t.id===tab).label}</th>
               <th style={{...styles.th, textAlign: 'center'}}>Số Lượng Cảnh Báo</th>
               <th style={{...styles.th, textAlign: 'center'}}>Tỷ Lệ (Trọng Số)</th>
               {col3 && <th style={styles.th}>Phân Bổ {col3lbl} (Top 2)</th>}
               <th style={styles.th}>Phân Bổ {col1lbl} (Top 2)</th>
               <th style={styles.th}>Phân Bổ {col2lbl} (Top 2)</th>
             </tr>
           </thead>
           <tbody>
             {statsArray.length === 0 ? (
               <tr><td colSpan={6} style={{padding: '2rem', textAlign: 'center', color: '#94a3b8'}}>Không có dữ liệu</td></tr>
             ) : statsArray.map((row, idx) => {
               const isExpanded = expandedRow === row.name;
               
               // Calculate deeper distributions
               const map1 = {}; const map2 = {}; const map3 = {}; const mapAge = {};
               row.items.forEach(it => {
                 let v1 = String(it[col1] || '').trim(); if(!v1) v1 = 'Không xác định';
                 let v2 = String(it[col2] || '').trim(); if(!v2) v2 = 'Không xác định';
                 if (!map1[v1]) map1[v1] = 0; map1[v1]++;
                 if (!map2[v2]) map2[v2] = 0; map2[v2]++;
                 if (col3) {
                   let v3 = String(it[col3] || '').trim(); if(!v3) v3 = 'Không xác định';
                   if (!map3[v3]) map3[v3] = 0; map3[v3]++;
                 }
                 
                 // Fallback for Tuổi Thọ dynamic panel
                 if (tab !== 'tuổi_thọ' && tab !== 'tần_suất') {
                   const lapDat = parseD(it['ngày_lắp_đặt']);
                   let bAge = 'Không có ngày lắp';
                   if (lapDat.getTime() !== new Date(0).getTime() && !isNaN(lapDat.getTime())) {
                       const tao = parseD(it['thời_điểm_tạo']);
                       const diffDays = (tao - lapDat) / (1000 * 60 * 60 * 24);
                       if (diffDays < 0) { bAge = 'Lỗi dữ liệu'; }
                       else if (diffDays <= 30) { bAge = 'Dưới 1 tháng'; }
                       else if (diffDays <= 90) { bAge = '1 - 3 tháng'; }
                       else if (diffDays <= 180) { bAge = '3 - 6 tháng'; }
                       else if (diffDays <= 365) { bAge = '6 - 12 tháng'; }
                       else if (diffDays <= 547) { bAge = '12 - 18 tháng'; }
                       else if (diffDays <= 730) { bAge = '18 - 24 tháng'; }
                       else if (diffDays <= 1095) { bAge = '24 - 36 tháng'; }
                       else if (diffDays <= 1825) { bAge = '36 - 60 tháng'; }
                       else { bAge = 'Trên 60 tháng'; }
                   }
                   if (!mapAge[bAge]) mapAge[bAge] = 0; mapAge[bAge]++;
                 }
               });
               const top1 = Object.entries(map1).sort((a,b)=>b[1]-a[1]);
               const top2 = Object.entries(map2).sort((a,b)=>b[1]-a[1]);
               const top3 = col3 ? Object.entries(map3).sort((a,b)=>b[1]-a[1]) : [];
               
               const ageOrderMap = { 'Không có ngày lắp': 99, 'Lỗi dữ liệu': 98, 'Dưới 1 tháng': 1, '1 - 3 tháng': 2, '3 - 6 tháng': 3, '6 - 12 tháng': 4, '12 - 18 tháng': 5, '18 - 24 tháng': 6, '24 - 36 tháng': 7, '36 - 60 tháng': 8, 'Trên 60 tháng': 9 };
               const topAge = Object.entries(mapAge).sort((a,b) => ageOrderMap[a[0]] - ageOrderMap[b[0]]);
               const shouldShowAgePanel = tab !== 'tuổi_thọ' && tab !== 'tần_suất';

               return (
                 <React.Fragment key={idx}>
                   <tr 
                     onClick={() => setExpandedRow(isExpanded ? null : row.name)}
                     style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isExpanded ? '#f8fafc' : '#fff', transition: '0.2s' }}
                     onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                     onMouseOut={e => e.currentTarget.style.background = isExpanded ? '#f8fafc' : '#fff'}
                   >
                     <td style={{ padding: '1rem', width: '40px', color: '#94a3b8', fontSize: '0.8rem' }}>
                       {isExpanded ? '▼' : '▶'}
                     </td>
                     <td style={{ padding: '1rem', fontWeight: 700, color: '#1e293b' }}>{row.name}</td>
                     <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>{row.count}</td>
                     <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600 }}>{totalRowsContext ? ((row.count / totalRowsContext) * 100).toFixed(1) : 0}%</td>
                     {col3 && (
                       <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                         {top3.slice(0, 2).map((c, i) => <div key={i} style={{marginBottom: '2px'}}>• <span style={{fontWeight:600}}>{c[0]}</span> ({c[1]} ca)</div>)}
                       </td>
                     )}
                     <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                       {top1.slice(0, 2).map((c, i) => <div key={i} style={{marginBottom: '2px'}}>• <span style={{fontWeight:600}}>{c[0]}</span> ({c[1]} ca)</div>)}
                     </td>
                     <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                       {top2.slice(0, 2).map((e, i) => <div key={i} style={{marginBottom: '2px'}}>• <span style={{fontWeight:600}}>{e[0]}</span> ({e[1]} ca)</div>)}
                     </td>
                   </tr>

                   {isExpanded && (
                     <tr>
                        <td colSpan={col3 ? 7 : 6} style={{ padding: '1.5rem', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: (!shouldShowAgePanel ? (col3 ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)') : (col3 ? 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)')), gap: '1.5rem' }}>
                           {col3 && (
                             <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                               <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Báo cáo phân bổ {col3lbl}</h4>
                               <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                 <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                   <tbody>
                                     {top3.map((c, i) => (
                                       <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                         <td style={{ padding: '0.6rem 0', fontWeight: 500, color: '#334155' }}>{c[0]}</td>
                                         <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{c[1]}</td>
                                         <td style={{ padding: '0.6rem 0', textAlign: 'right', color: '#64748b', width: '60px' }}>{((c[1]/row.count)*100).toFixed(1)}%</td>
                                       </tr>
                                     ))}
                                   </tbody>
                                 </table>
                               </div>
                             </div>
                           )}
                           {/* Panel 1 */}
                           <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                             <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Báo cáo phân bổ {col1lbl}</h4>
                             <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                               <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                 <tbody>
                                   {top1.map((c, i) => (
                                     <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td style={{ padding: '0.6rem 0', fontWeight: 500, color: '#334155' }}>{c[0]}</td>
                                       <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{c[1]}</td>
                                       <td style={{ padding: '0.6rem 0', textAlign: 'right', color: '#64748b', width: '60px' }}>{((c[1]/row.count)*100).toFixed(1)}%</td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                           </div>
                           {/* Panel 2 */}
                           <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                             <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Báo cáo phân bổ {col2lbl}</h4>
                             <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                               <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                 <tbody>
                                   {top2.map((e, i) => (
                                     <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                       <td style={{ padding: '0.6rem 0', fontWeight: 500, color: '#334155' }}>{e[0]}</td>
                                       <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{e[1]}</td>
                                       <td style={{ padding: '0.6rem 0', textAlign: 'right', color: '#64748b', width: '60px' }}>{((e[1]/row.count)*100).toFixed(1)}%</td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                            </div>
                            
                            {/* Panel Age */}
                            {shouldShowAgePanel && (
                              <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                <h4 style={{ margin: '0 0 1rem 0', color: '#10b981', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Báo Cáo Mốc Tuổi Thọ</h4>
                                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                    <tbody>
                                      {topAge.map((ag, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '0.6rem 0', fontWeight: 500, color: '#334155' }}>{ag[0]}</td>
                                          <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{ag[1]}</td>
                                          <td style={{ padding: '0.6rem 0', textAlign: 'right', color: '#64748b', width: '60px' }}>{((ag[1]/row.count)*100).toFixed(1)}%</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
             })}
           </tbody>
         </table>
         )}
       </div>
    </div>
  );
};

const styles = {
  dateInput: {
    padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none'
  },
  metricCard: {
    background: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  },
  metricLabel: {
    margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.05em'
  },
  metricValue: {
    margin: '0.5rem 0 0 0', fontSize: '2rem', fontWeight: 800, lineHeight: 1
  },
  metricIcon: (bg, color) => ({
    width: '56px', height: '56px', borderRadius: '50%', background: bg, color: color, display: 'flex', justifyContent: 'center', alignItems: 'center'
  }),
  chartCard: {
    background: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    display: 'flex', flexDirection: 'column'
  },
  chartTitle: {
    margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#1e293b'
  },
  th: {
    padding: '0.6rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap'
  }
}

export default WarrantyApp;
