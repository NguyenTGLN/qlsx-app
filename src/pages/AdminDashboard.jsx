import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckCircle, TrendingUp, Users, RefreshCw, Plus, X, Upload, Download, Package, Activity, Smartphone, Edit, Trash2, BarChart2, ArrowUpRight, ArrowDownRight, Minus, ClipboardList, CalendarClock } from 'lucide-react';
import ModuleShell, { TabButton } from '../components/ModuleShell';
import { supabase, fetchAllRows } from '../lib/supabase';
import { dedupeByProductCode } from '../lib/capacityGuard';
import { tallyTasks } from '../lib/taskAssignees';
import { dataCache } from '../lib/dataCache';
import { useTabPerm } from '../lib/AuthContext';
import * as XLSX from 'xlsx';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const p = useTabPerm('overview', 'main'); // view/create/edit/delete/io — gate nút Thêm/Sửa/Xóa & Tải mẫu/Nạp Excel
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' | overview | capacities | orders | timeline
  
  // States
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ orders: 0, completed: 0, avgPerf: 0, workers: 0 });
  const [capacities, setCapacities] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportFilter, setReportFilter] = useState('today');
  const [reportData, setReportData] = useState([]);

  // States cho Báo Cáo Công Việc (Work Report)
  const [workReportData, setWorkReportData] = useState([]);
  const [workReportFilter, setWorkReportFilter] = useState('today');
  const [workReportDates, setWorkReportDates] = useState({ start: '', end: '' });
  const [workOverallStats, setWorkOverallStats] = useState({ prodQty: 0, tasksDone: 0, tasksTotal: 0, tasksOnTime: 0, activeStaff: 0 });

  // States cho Bảng Tiến Độ
  const [timelineDate, setTimelineDate] = useState(() => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  });

  // Thêm mới Lệnh UX
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [newOrder, setNewOrder] = useState({ order_code: '', product_code: '', target_quantity: '' });
  
  // Thêm mới Năng Lực UX
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [newCapacity, setNewCapacity] = useState({ product_code: '', product_name: '', standard_time: '' });

  const fileInputRef = useRef(null);
  const orderFileRef = useRef(null);

  // Helpers: lock/unlock body scroll khi mở modal (fix mobile)
  const openModal = (setFn) => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.body.style.overflow = 'hidden';
    setFn(true);
  };
  const closeModal = (setFn, resetFn, resetVal) => {
    document.body.style.overflow = '';
    setFn(false);
    if (resetFn && resetVal !== undefined) resetFn(resetVal);
  };

  // An toàn: khôi phục scroll của body khi unmount (phòng khi rời trang lúc modal đang mở)
  useEffect(() => {
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ============================================================
  // 🚀 OPTIMIZED: Raw data cache — fetch once, derive everywhere
  // ============================================================
  const [rawData, setRawData] = useState(null);

  const CACHE_KEY = 'admin_dashboard_data';

  // Hàm áp dữ liệu (từ cache hoặc fresh fetch) vào state
  const applyData = useCallback(({ workersCount, ordersCount, allLogs, nvData, nvMap, tLogs, capData, ordData }) => {
    setRawData({ workersCount, ordersCount, allLogs, nvData, nvMap, tLogs });
    setCapacities(capData);
    setProductionOrders(ordData);
    const recentLogs = allLogs.slice(0, 20);
    let avg = 0;
    if (recentLogs.length > 0) {
      const sum = recentLogs.reduce((acc, curr) => acc + parseFloat(curr.performance_rate), 0);
      avg = Math.round(sum / recentLogs.length);
    }
    setLogs(recentLogs);
    setStats({ orders: ordersCount || 0, completed: recentLogs.length, avgPerf: avg, workers: workersCount || 0 });
  }, []);

  const fetchAllData = useCallback(async (forceRefresh = false) => {
    // 🚀 Cache hit: load tức thì từ bộ nhớ, không cần fetch lại
    if (!forceRefresh) {
      const cached = dataCache.get(CACHE_KEY);
      if (cached) {
        applyData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [
        { count: workersCount },
        { count: ordersCount },
        { data: allLogsRaw },
        { data: nvData },
        { data: capData },
        { data: ordData },
        { data: tLogs }
      ] = await Promise.all([
        supabase.from('nhan_vien').select('*', { count: 'exact', head: true }),
        supabase.from('production_orders').select('*', { count: 'exact', head: true }),
        fetchAllRows(() => supabase.from('production_logs').select(`
          id, actual_quantity, performance_rate, execution_date, start_time, end_time, worker_id,
          production_orders ( order_code, product_code )
        `).order('created_at', { ascending: false })),
        supabase.from('nhan_vien').select('id, name'),
        supabase.from('product_capacities').select('*').order('product_code'),
        supabase.from('production_orders').select('*, production_logs(actual_quantity)').order('created_at', { ascending: false }).limit(50),
        // assignee_ids = việc nhóm; assignee_id giữ lại làm fallback của memberIds() cho dòng chưa migrate
        fetchAllRows(() => supabase.from('cong_viec_duoc_giao').select('id, title, assignee_id, assignee_ids, status, completed_date, due_date')),
      ]);
        
      const nvMap = new Map((nvData || []).map(nv => [nv.id, nv.name]));
      const allLogs = (allLogsRaw || []).map(log => ({
        ...log,
        nhan_vien: { name: nvMap.get(log.worker_id) || log.worker_id }
      }));

      const freshData = {
        workersCount: workersCount || 0,
        ordersCount: ordersCount || 0,
        allLogs,
        nvData: nvData || [],
        nvMap,
        tLogs: tLogs || [],
        capData: capData || [],
        ordData: ordData || [],
      };

      // Lưu vào cache
      dataCache.set(CACHE_KEY, freshData);
      applyData(freshData);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  // 🚀 Derive report data from cache (no API call on filter change)
  useEffect(() => {
    if (!rawData) return;
    const { allLogs } = rawData;
    const now = new Date(); now.setHours(0,0,0,0);
    let currentStart, currentEnd, pastEnd;
    const currentDay = now.getDay();
    const offset = now.getTimezoneOffset() * 60000;
    if (reportFilter === 'today') { currentStart = new Date(now); currentEnd = new Date(now); pastEnd = new Date(now.getTime() - 86400000); }
    else if (reportFilter === 'yesterday') { const y = new Date(now.getTime() - 86400000); currentStart = y; currentEnd = y; pastEnd = new Date(y.getTime() - 86400000); }
    else if (reportFilter === 'week') { const s = new Date(now); s.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); currentStart = s; currentEnd = new Date(now); pastEnd = new Date(s.getTime() - 86400000); }
    else if (reportFilter === 'month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); currentStart = s; currentEnd = new Date(now); pastEnd = new Date(s.getTime() - 86400000); }
    else if (reportFilter === 'year') { const s = new Date(now.getFullYear(), 0, 1); currentStart = s; currentEnd = new Date(now); pastEnd = new Date(s.getTime() - 86400000); }
    const toIsoDate = (d) => new Date(d.getTime() - offset).toISOString().split('T')[0];
    const cStartStr = toIsoDate(currentStart), cEndStr = toIsoDate(currentEnd), pEndStr = toIsoDate(pastEnd);
    const pStats = {};
    allLogs.forEach(log => {
      const code = log.production_orders?.product_code || 'Unknown'; const wName = log.nhan_vien?.name || log.worker_id || 'N/A';
      const qty = parseFloat(log.actual_quantity || 0); const perf = parseFloat(log.performance_rate || 0); const date = log.execution_date;
      if (!pStats[wName]) pStats[wName] = { currQty:0, currPerf:0, currC:0, products:new Set(), pastPerf:0, pastC:0 };
      if (date >= cStartStr && date <= cEndStr) { pStats[wName].currQty += qty; pStats[wName].currPerf += perf; pStats[wName].currC += 1; pStats[wName].products.add(code); }
      else if (date <= pEndStr) { pStats[wName].pastPerf += perf; pStats[wName].pastC += 1; }
    });
    setReportData(Object.keys(pStats).map(wName => { const st = pStats[wName]; if (st.currC === 0) return null; const cAvg = st.currPerf / st.currC; const pAvg = st.pastC > 0 ? (st.pastPerf / st.pastC) : 0; let t = null; if (st.pastC > 0) t = cAvg - pAvg; return { name: wName, qty: st.currQty, products: Array.from(st.products).join(', '), perf: cAvg, pastPerf: pAvg, trend: t }; }).filter(Boolean));
  }, [rawData, reportFilter]);

  // 🚀 Derive work report from cache (no API call on filter change)
  useEffect(() => {
    if (!rawData) return;
    const { allLogs, nvData, tLogs } = rawData;
    const now = new Date(); now.setHours(0,0,0,0); let start, end; const currentDay = now.getDay(); const offset = now.getTimezoneOffset() * 60000;
    let startStr = '2000-01-01', endStr = '2100-01-01';
    if (workReportFilter === 'custom') { startStr = workReportDates.start || '2000-01-01'; endStr = workReportDates.end || '2100-01-01'; }
    else if (workReportFilter !== 'all') {
      if (workReportFilter === 'today') { start = new Date(now); end = new Date(now); }
      else if (workReportFilter === 'yesterday') { const y = new Date(now.getTime() - 86400000); start = y; end = y; }
      else if (workReportFilter === 'week') { start = new Date(now); start.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); end = new Date(now); }
      else if (workReportFilter === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now); }
      else if (workReportFilter === 'year') { start = new Date(now.getFullYear(), 0, 1); end = new Date(now); }
      startStr = new Date(start.getTime() - offset).toISOString().split('T')[0]; endStr = new Date(end.getTime() - offset).toISOString().split('T')[0];
    }
    let filteredLogs = allLogs;
    if (workReportFilter !== 'all' && !(workReportFilter === 'custom' && !workReportDates.start && !workReportDates.end)) {
      filteredLogs = allLogs.filter(log => { const d = log.execution_date; if (!d) return false; return (startStr === '2000-01-01' || d >= startStr) && (endStr === '2100-01-01' || d <= endStr); });
    }
    let cProdQty = 0, cTasksDone = 0, cTasksTotal = 0, cTasksOnTime = 0; let activeStaff = new Set();
    const staffMap = new Map((nvData||[]).map(nv => [nv.id, { name: nv.name, prodQty: 0, prodDetails: [], tasksDone: 0, tasksTotal: 0, prodPerf: [], tasksDoneList: [], tasksOnTime: 0 }]));
    filteredLogs.forEach(log => { const qty = parseFloat(log.actual_quantity || 0); const pName = log.production_orders?.product_code || ''; const wId = log.worker_id; cProdQty += qty; activeStaff.add(wId); if (wId && staffMap.has(wId)) { const st = staffMap.get(wId); st.prodQty += qty; if(pName && !st.prodDetails.includes(pName)) st.prodDetails.push(pName); st.prodPerf.push(parseFloat(log.performance_rate||0)); } });
    // Luật cộng điểm nằm trong tallyTasks (dùng chung với WorkReport, có test)
    const tally = tallyTasks(tLogs, startStr, endStr);
    cTasksTotal = tally.company.total;
    cTasksDone = tally.company.done;
    cTasksOnTime = tally.company.onTime;
    tally.activeStaff.forEach(id => activeStaff.add(id));
    tally.perStaff.forEach((v, wId) => {
      const st = staffMap.get(wId);
      if (!st) return;                        // NV đã bị xoá khỏi nhan_vien
      st.tasksTotal += v.total;
      st.tasksDone += v.done;
      st.tasksOnTime += v.onTime;
      // Đổi id đồng đội sang tên ngay tại đây — lúc render không còn danh sách nhân viên
      st.tasksDoneList.push(...v.doneList.map(d => ({
        title: d.title,
        mates: d.mates.map(id => staffMap.get(id)?.name).filter(Boolean),
      })));
    });
    let finalReport = Array.from(staffMap.values()).filter(s => s.prodQty > 0 || s.tasksTotal > 0).map(s => { const avgPerf = s.prodPerf.length > 0 ? (s.prodPerf.reduce((a,b)=>a+b,0)/s.prodPerf.length) : null; const taskRate = s.tasksDone > 0 ? s.tasksOnTime / s.tasksDone : null; return { ...s, avgPerf, taskRate }; });
    const rankPerfScores = [...new Set(finalReport.map(s => s.avgPerf).filter(v => v !== null))].sort((a,b) => b - a);
    const rankTaskRates = [...new Set(finalReport.map(s => s.taskRate).filter(v => v !== null))].sort((a,b) => b - a);
    finalReport = finalReport.map(s => ({ ...s, perfRank: s.avgPerf !== null ? rankPerfScores.indexOf(s.avgPerf) + 1 : null, taskRank: s.taskRate !== null ? rankTaskRates.indexOf(s.taskRate) + 1 : null }));
    finalReport.sort((a,b) => { const aTR = a.taskRank !== null ? a.taskRank : 9999; const bTR = b.taskRank !== null ? b.taskRank : 9999; if (aTR !== bTR) return aTR - bTR; const aPR = a.perfRank !== null ? a.perfRank : 9999; const bPR = b.perfRank !== null ? b.perfRank : 9999; if (aPR !== bPR) return aPR - bPR; return (b.prodQty + b.tasksDone) - (a.prodQty + a.tasksDone); });
    setWorkReportData(finalReport);
    setWorkOverallStats({ prodQty: cProdQty, tasksDone: cTasksDone, tasksTotal: cTasksTotal, tasksOnTime: cTasksOnTime, activeStaff: activeStaff.size });
  }, [rawData, workReportFilter, workReportDates]);

  // ---------- XỬ LÝ NĂNG LỰC SẢN XUẤT ----------
  const handleCapacityUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, {type:'binary'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const formattedData = data.map(item => {
            const timePerUnit = parseFloat(item['Thời gian chuẩn (Giờ/SP)'] || item['Định mức'] || item['thoi_gian']);
            return {
              product_code: String(item['Mã SP'] || item['product_code'] || '').trim(),
              product_name: String(item['Tên SP'] || item['product_name'] || '').trim(),
              capacity_per_hour: timePerUnit > 0 ? (1 / timePerUnit) : 0
            };
        }).filter(i => i.product_code && i.capacity_per_hour > 0);

        if (formattedData.length === 0) {
            alert("File không đúng định dạng. Yêu cầu Cột: 'Mã SP', 'Tên SP', 'Thời gian chuẩn (Giờ/SP)'"); return;
        }

        // Gộp trùng Mã SP ngay trong file (dòng cuối ghi đè) — nếu không, Postgres báo lỗi
        // "ON CONFLICT DO UPDATE command cannot affect row a second time".
        const uniqueData = dedupeByProductCode(formattedData);
        const dupCount = formattedData.length - uniqueData.length;

        const { error } = await supabase.from('product_capacities').upsert(uniqueData, { onConflict: 'product_code' });
        if (error) throw error;

        alert(`Đã nạp thành công định mức cho ${uniqueData.length} mã SP!`
          + (dupCount > 0 ? `\n(Đã gộp ${dupCount} dòng trùng Mã SP trong file — giữ giá trị của dòng cuối cùng.)` : ''));
        fetchAllData();
      } catch (err) { alert('Lỗi: ' + err.message); }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const createSingleCapacity = async (e) => {
    e.preventDefault();
    try {
      const timePerUnit = parseFloat(newCapacity.standard_time);
      if(timePerUnit <= 0) { alert('Thời gian chuẩn phải lớn hơn 0'); return; }
      const { error } = await supabase.from('product_capacities').upsert([{
        product_code: newCapacity.product_code,
        product_name: newCapacity.product_name,
        capacity_per_hour: 1 / timePerUnit
      }], { onConflict: 'product_code' });

      if (error) throw error;
      
      alert('Đã lưu dữ liệu định mức năng lực mới / Cập nhật thành công!');
      closeModal(setShowCapacityModal, setNewCapacity, { product_code: '', product_name: '', standard_time: '' });
      fetchAllData();
    } catch (err) {
      alert('Lỗi cập nhật: ' + err.message);
    }
  };

  const editCapacity = (cap) => {
    setNewCapacity({
      product_code: cap.product_code,
      product_name: cap.product_name,
      standard_time: (1 / parseFloat(cap.capacity_per_hour)).toFixed(4)
    });
    openModal(setShowCapacityModal);
  };

  const downloadCapacityTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "Mã SP": "BTM-207D", "Tên SP": "Sản phẩm Mẫu", "Thời gian chuẩn (Giờ/SP)": 0.5 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DinhMuc");
    XLSX.writeFile(wb, "Template_DinhMucThoiGian.xlsx");
  };


  // ---------- XỬ LÝ LỆNH SẢN XUẤT ----------
  const processOrdersUpload = async (formattedOrders) => {
    const { data: caps } = await supabase.from('product_capacities').select('product_code, capacity_per_hour');
    const capMap = {};
    if(caps) caps.forEach(c => capMap[c.product_code] = parseFloat(c.capacity_per_hour));

    let successCount = 0;
    let missingMã = 0;
    const finalOrders = [];

    for (const order of formattedOrders) {
      if (capMap[order.product_code]) {
        const stdTime = 1 / capMap[order.product_code];
        finalOrders.push({
          order_code: order.order_code,
          product_code: order.product_code,
          target_quantity: order.target_quantity,
          standard_time_per_unit: stdTime,
          status: 'pending'
        });
        successCount++;
      } else {
        missingMã++;
      }
    }

    if (finalOrders.length > 0) {
      const { error } = await supabase.from('production_orders').upsert(finalOrders, { onConflict: 'order_code' });
      if (error) {
        alert("Lỗi khi lưu Lệnh vào DB: " + error.message);
        return;
      }
    }

    let msg = `Nạp thành công ${successCount} Lệnh sản xuất. `;
    if (missingMã > 0) msg += `Cảnh báo: Có ${missingMã} lệnh bị từ chối do KHÔNG TÌM THẤY Mã SP trong CSDL Định Mức Năng lực!`;
    alert(msg);
    fetchAllData();
  };

  const handleOrderUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, {type:'binary'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const formattedData = data.map(item => ({
            order_code: String(item['Mã Lệnh'] || item['order_code'] || '').trim(),
            product_code: String(item['Mã SP'] || item['product_code'] || '').trim(),
            target_quantity: parseFloat(item['Số Lượng'] || item['target_quantity'])
        })).filter(i => i.order_code && i.product_code && i.target_quantity > 0);

        if (formattedData.length === 0) {
            alert("Lỗi format mẫu. Cần: 'Mã Lệnh', 'Mã SP', 'Số Lượng'"); return;
        }

        await processOrdersUpload(formattedData);
      } catch (err) { alert('Lỗi: ' + err.message); }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const createSingleOrder = async (e) => {
    e.preventDefault();
    await processOrdersUpload([newOrder]);
    closeModal(setShowOrderModal, setNewOrder, { order_code: '', product_code: '', target_quantity: '' });
  };

  const downloadOrderTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "Mã Lệnh": "LSX-001", "Mã SP": "BTM-207D", "Số Lượng": 100 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LenhSX");
    XLSX.writeFile(wb, "Template_LenhSX.xlsx");
  };

  const deleteLog = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này? Lịch sử này sẽ bị xóa vĩnh viễn khỏi hệ thống!')) return;
    try {
      const { error } = await supabase.from('production_logs').delete().eq('id', id);
      if (error) throw error;
      fetchAllData();
    } catch(err) { alert('Lỗi xóa: ' + err.message); }
  };

  // UI RENDERERS
  const renderOverview = () => (
    <>
      <div style={styles.statsGrid}>
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statIcon('var(--primary-color)')}><LayoutDashboard size={20} /></div>
          <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Lệnh Đã Giao</p><p style={styles.statValue}>{stats.orders}</p></div>
        </div>
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statIcon('var(--success-color)')}><CheckCircle size={20} /></div>
          <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Nhật Ký Mới</p><p style={styles.statValue}>{stats.completed}</p></div>
        </div>
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statIcon('var(--warning-color)')}><TrendingUp size={20} /></div>
          <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Hiệu Suất TB</p><p style={styles.statValue}>{stats.avgPerf}%</p></div>
        </div>
      </div>

      <div className="glass-panel" style={styles.tableContainer}>
        <div style={styles.tableHeader}><h3>Nhật Ký Sản Xuất Gần Đây</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={styles.table}>
            <thead>
              <tr>
                <th>Mã Phiếu</th><th>Mã SP</th><th>Người Làm</th><th>Ngày</th><th>Số Lượng</th><th>Hiệu Suất</th><th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.production_orders?.order_code}</strong></td>
                  <td>{log.production_orders?.product_code}</td>
                  <td>{log.nhan_vien?.name || log.nhan_vien?.id || log.worker_id}</td>
                  <td>{new Date(log.execution_date).toLocaleDateString('vi-VN')}</td>
                  <td><strong>{Number(parseFloat(log.actual_quantity).toFixed(1))}</strong></td>
                  <td><span style={styles.badge(parseInt(log.performance_rate))}>{Math.round(log.performance_rate)}%</span></td>
                  <td>
                    {p.delete && <button onClick={() => deleteLog(log.id)} style={{background: 'none', border:'none', color:'var(--danger-color)', cursor:'pointer'}} title="Xóa dữ liệu này">
                      <Trash2 size={16} />
                    </button>}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan="7" style={{textAlign: 'center', padding: '2rem'}}>Trống.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const deleteCapacity = async (id, productCode) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Định mức của mã: ${productCode}?`)) return;
    try {
      const { error } = await supabase.from('product_capacities').delete().eq('id', id);
      if (error) throw error;
      fetchAllData();
    } catch(err) { alert('Lỗi xóa: ' + err.message); }
  };

  const renderCapacities = () => (
    <div className="glass-panel" style={styles.tableContainer}>
      <div style={styles.tableHeaderFlex}>
        <h3>Quản Lý Năng Lực SX / Mã Sản Phẩm</h3>
        <div style={{display:'flex', gap:'0.75rem'}}>
          {p.create && <button onClick={() => { setNewCapacity({product_code: '', product_name: '', standard_time: ''}); openModal(setShowCapacityModal); }} className="btn-secondary">
            <Plus size={16}/> Thêm Mã Bằng Tay
          </button>}
          {p.io && <button onClick={downloadCapacityTemplate} className="btn-secondary"><Download size={16}/> Tải Template</button>}
          {p.io && <button onClick={() => fileInputRef.current?.click()} className="btn-primary" style={{background: 'var(--success-gradient)'}}>
            <Upload size={16} /> Nạp Từ Excel
          </button>}
          <input type="file" accept=".xlsx, .xls, .csv" onChange={handleCapacityUpload} ref={fileInputRef} style={{display:'none'}} />
        </div>
      </div>
      <div style={{ overflowX: 'auto', padding: '1rem 0' }}>
         <table className="admin-table" style={styles.table}>
            <thead>
              <tr><th>STT</th><th>Mã Sản Phẩm</th><th>Tên Tham Khảo</th><th>Thời Gian (Giờ/SP)</th><th>Thao Tác</th></tr>
            </thead>
            <tbody>
              {capacities.map((cap, i) => (
                <tr key={cap.id}>
                  <td>{i+1}</td>
                  <td><strong style={{color:'var(--primary-color)'}}>{cap.product_code}</strong></td>
                  <td>{cap.product_name}</td>
                  <td><strong>{(1/parseFloat(cap.capacity_per_hour)).toFixed(4)}</strong> <span style={{fontSize:'0.8rem', color:'var(--text-tertiary)'}}>(~ {parseFloat(cap.capacity_per_hour).toFixed(2)} SP/Giờ)</span></td>
                  <td>
                    <div style={{display:'flex', gap:'0.5rem'}}>
                       {p.edit && <button onClick={() => editCapacity(cap)} style={{background: 'none', border:'none', color:'var(--text-secondary)', cursor:'pointer'}} title="Sửa rập">
                         <Edit size={16} />
                       </button>}
                       {p.delete && <button onClick={() => deleteCapacity(cap.id, cap.product_code)} style={{background: 'none', border:'none', color:'var(--danger-color)', cursor:'pointer'}} title="Xóa dữ liệu này">
                         <Trash2 size={16} />
                       </button>}
                    </div>
                  </td>
                </tr>
              ))}
              {capacities.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Hệ thống chưa có định mức năng lực nào. Tải Mẫu về Đăng lên hoặc Thêm Bằng Tay.</td></tr>}
            </tbody>
          </table>
      </div>
    </div>
  );

  const deleteOrder = async (id, orderCode) => {
    if (!window.confirm(`XÓA LỆNH (${orderCode}): BẠN CÓ CHẮC KHÔNG?\nToàn bộ nhật ký sản xuất và lịch sử chấm công của công nhân cho lệnh này cũng sẽ bị XÓA SẠCH theo! Việc này không thể phục hồi.`)) return;
    try {
      const { error } = await supabase.from('production_orders').delete().eq('id', id);
      if (error) throw error;
      fetchAllData();
    } catch(err) { alert('Lỗi xóa: ' + err.message); }
  };

  const renderOrders = () => (
    <div className="glass-panel" style={styles.tableContainer}>
      <div style={styles.tableHeaderFlex}>
        <h3>Lệnh Sản Xuất Nền</h3>
        <div style={{display:'flex', gap:'0.75rem'}}>
          {p.create && <button onClick={() => openModal(setShowOrderModal)} className="btn-secondary"><Plus size={16}/> Thêm 1 Lệnh</button>}
          {p.io && <button onClick={downloadOrderTemplate} className="btn-secondary"><Download size={16}/> Tải Mẫu</button>}
          {p.io && <button onClick={() => orderFileRef.current?.click()} className="btn-primary" style={{background: 'var(--success-gradient)'}}>
            <Upload size={16} /> Nạp Từ Excel
          </button>}
          <input type="file" accept=".xlsx, .xls, .csv" onChange={handleOrderUpload} ref={orderFileRef} style={{display:'none'}} />
        </div>
      </div>
      <div style={{ overflowX: 'auto', padding: '1rem 0' }}>
         <table className="admin-table" style={styles.table}>
            <thead>
              <tr><th>Mã Lệnh</th><th>Mã SP</th><th>Mục Tiêu (SP)</th><th>Đã Tích Luỹ</th><th>Còn Lại</th><th>Giờ Chuẩn/1SP</th><th>Ngày Tạo</th><th>Thao Tác</th></tr>
            </thead>
            <tbody>
              {productionOrders.map((ord) => {
                 const produced = (ord.production_logs || []).reduce((sum, log) => sum + parseFloat(log.actual_quantity || 0), 0);
                 const remaining = ord.target_quantity - produced;
                 return (
                <tr key={ord.id}>
                  <td><strong>{ord.order_code}</strong></td>
                  <td>{ord.product_code}</td>
                  <td>{ord.target_quantity}</td>
                  <td style={{color: produced > 0 ? 'var(--success-color)' : 'inherit', fontWeight: produced ? 600 : 400}}>{Number(produced.toFixed(1))}</td>
                  <td style={{color: remaining <= 0 ? 'var(--success-color)' : (remaining < ord.target_quantity ? 'var(--warning-color)' : 'var(--danger-color)'), fontWeight: 'bold'}}>{remaining <= 0 ? 'Hoàn thành' : Number(remaining.toFixed(1))}</td>
                  <td>{parseFloat(ord.standard_time_per_unit).toFixed(3)}</td>
                  <td>{new Date(ord.created_at).toLocaleDateString('vi-VN')}</td>
                  <td>
                    {p.delete && <button onClick={() => deleteOrder(ord.id, ord.order_code)} style={{background: 'none', border:'none', color:'var(--danger-color)', cursor:'pointer'}} title="Xóa toàn bộ Lệnh và Nhật ký của lệnh này">
                      <Trash2 size={16} />
                    </button>}
                  </td>
                </tr>
                 );
              })}
              {productionOrders.length === 0 && <tr><td colSpan="8" style={{textAlign: 'center', padding: '2rem'}}>Trống.</td></tr>}
            </tbody>
          </table>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="glass-panel" style={{...styles.tableContainer, padding: '1.5rem'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem'}}>
        <h3 style={{display:'flex', alignItems:'center', gap:'0.5rem'}}><BarChart2 size={24} color="var(--primary-color)"/> Phân Tích Báo Cáo Sản Xuất</h3>
        <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
          {['today', 'yesterday', 'week', 'month', 'year'].map(f => {
            const labels = {today:'Hôm Nay', yesterday:'Hôm Qua', week:'Tuần Này', month:'Tháng Này', year:'Năm Nay'};
            const isSel = reportFilter === f;
            return (
              <button 
                key={f} 
                className={isSel ? 'btn-primary' : 'btn-secondary'} 
                onClick={() => setReportFilter(f)}
                style={isSel ? {background:'var(--primary-color)', color:'#fff', border:'none'} : {padding:'0.4rem 0.8rem', fontSize:'0.85rem'}}
              >
                {labels[f]}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table" style={styles.table}>
          <thead>
            <tr><th>Tên Nhân Viên</th><th>Tổng Sản Lượng Tích Luỹ</th><th>Mã SP Đã Làm</th><th>Hiệu Suất TB</th><th>So sánh Cùng kỳ (Cá nhân)</th></tr>
          </thead>
          <tbody>
            {reportData.map((rd, i) => (
              <tr key={i}>
                <td><strong style={{color:'var(--primary-color)'}}>{rd.name}</strong></td>
                <td><strong style={{fontSize:'1.1rem'}}>{Number(rd.qty.toFixed(1))}</strong> <span style={{fontSize:'0.8rem', color:'var(--text-tertiary)'}}>cái</span></td>
                <td><span style={{color:'var(--text-primary)', fontSize:'0.9rem'}}>{rd.products}</span></td>
                <td><span style={styles.badge(parseInt(rd.perf))}>{Math.round(rd.perf)}%</span></td>
                <td>
                  {rd.trend === null ? (
                    <span style={{color:'var(--text-tertiary)', fontSize:'0.85rem'}}>✨ Mới (Chưa có dữ liệu cũ)</span>
                  ) : (
                    <div style={{display:'flex', alignItems:'center', gap:'0.25rem', color: rd.trend > 0 ? 'var(--success-color)' : (rd.trend < 0 ? 'var(--danger-color)' : 'var(--warning-color)'), fontWeight:600}}>
                      {rd.trend > 0 ? <ArrowUpRight size={18}/> : (rd.trend < 0 ? <ArrowDownRight size={18}/> : <Minus size={18}/>)}
                      {rd.trend > 0 ? '+' : ''}{Math.round(rd.trend)}% 
                      <span style={{fontSize:'0.8rem', color:'var(--text-tertiary)', marginLeft:'0.5rem', fontWeight:400}}>(Kỳ trước: {Math.round(rd.pastPerf)}%)</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {reportData.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding:'3rem', color:'var(--text-tertiary)'}}>Chưa có nhật ký sản xuất nào thuộc khoảng thời gian bạn chọn.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderWorkReport = () => (
    <div style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem'}}>
         <h3 style={{margin:0, display:'flex', alignItems:'center', gap:'0.5rem'}}><ClipboardList size={22} color="var(--primary-color)"/> Báo Cáo Công Việc</h3>
         <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center'}}>
          {['today', 'yesterday', 'week', 'month', 'year', 'all', 'custom'].map(f => {
            const labels = {today:'Hôm Nay', yesterday:'Hôm Qua', week:'Tuần Này', month:'Tháng Này', year:'Năm Nay', all:'Tất Cả', custom:'Tùy Chọn'};
            const isSel = workReportFilter === f;
            return (
              <button 
                key={f} 
                className={isSel ? 'btn-primary' : 'btn-secondary'} 
                onClick={() => setWorkReportFilter(f)}
                style={isSel ? {background:'var(--primary-color)', color:'#fff', border:'none', padding:'0.4rem 0.8rem', fontSize:'0.85rem'} : {padding:'0.4rem 0.8rem', fontSize:'0.85rem'}}
              >
                {labels[f]}
              </button>
            )
          })}
          {workReportFilter === 'custom' && (
            <div style={{display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'0.5rem'}}>
               <input type="date" value={workReportDates.start} onChange={e => setWorkReportDates(prev => ({...prev, start: e.target.value}))} style={{padding:'0.3rem', borderRadius:'4px', border:'1px solid #ddd'}}/>
               <span style={{color: 'var(--text-secondary)'}}>-</span>
               <input type="date" value={workReportDates.end} onChange={e => setWorkReportDates(prev => ({...prev, end: e.target.value}))} style={{padding:'0.3rem', borderRadius:'4px', border:'1px solid #ddd'}}/>
            </div>
          )}
        </div>
      </div>
       <div style={styles.statsGrid}>
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statIcon('var(--primary-color)')}><ClipboardList size={20} /></div>
          <div style={{ marginLeft: '1rem' }}>
             <p style={styles.statTitle}>Việc Đã Hoàn Thành</p>
             <p style={styles.statValue}>{workOverallStats.tasksDone} <span style={{fontSize:'1rem', color:'var(--text-tertiary)'}}>/ {workOverallStats.tasksTotal} Việc Mở</span></p>
             {workOverallStats.tasksDone > 0 && (() => {
                 const rate = workOverallStats.tasksOnTime / workOverallStats.tasksDone;
                 let color = 'var(--danger-color)';
                 if (rate >= 0.8) color = 'var(--success-color)';
                 else if (rate >= 0.5) color = '#f59e0b';
                 return <p style={{fontSize:'0.85rem', color, margin:0, fontWeight: 600}}>Đúng hạn: {Math.round(rate * 100)}%</p>
             })()}
          </div>
        </div>
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statIcon('var(--success-color)')}><Package size={20} /></div>
          <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Sản Lượng SX</p><p style={styles.statValue}>{Number(workOverallStats.prodQty.toFixed(1))}</p></div>
        </div>
        <div className="glass-panel" style={styles.statCard}>
<div style={styles.statIcon('var(--warning-color)')}><Users size={20} /></div>
          <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Nhân Sự Hoạt Động</p><p style={styles.statValue}>{workOverallStats.activeStaff}</p></div>
        </div>
      </div>
      
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem'}}>
         {workReportData.map(st => (
           <div key={st.name} style={{background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', border: '1px solid #edf2f7'}}>
              <div style={{background: 'var(--accent-gradient)', padding: '1rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap'}}>
                 <h3 style={{fontSize: '1.25rem', margin: 0, fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em'}}>{st.name}</h3>
                 <div style={{display: 'flex', gap: '0.4rem'}}>
                    {st.taskRank && (
                      <span title="Hạng chuẩn xác hạn Công việc" style={{background:'#f59e0b', color:'#fff', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:700, display:'flex', alignItems:'center', gap:'0.2rem', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
                         🎯 Top {st.taskRank}
                      </span>
                    )}
                    {st.perfRank && (
                      <span title="Hạng Hiệu suất Sản xuất" style={{background:'var(--success-color)', color:'#fff', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:700, display:'flex', alignItems:'center', gap:'0.2rem', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
                         ⚡ Top {st.perfRank}
                      </span>
                    )}
                 </div>
              </div>
              
              <div style={{padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1}}>
                 {st.tasksTotal > 0 && (
                   <div style={{padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                     <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem'}}>
                        <ClipboardList size={18} color="var(--primary-color)"/>
                        <p style={{margin: 0, fontSize: '1rem', fontWeight:600, color: 'var(--primary-color)'}}>Công Việc Nội Bộ</p>
                     </div>
                     <p style={{margin: '0.2rem 0', fontSize: '0.9rem', fontWeight: 600, color: st.tasksDone === st.tasksTotal ? 'var(--success-color)' : 'var(--text-primary)'}}>Hoàn thành: {st.tasksDone} / {st.tasksTotal}</p>
                     
                     {st.tasksDone > 0 && (() => {
                        const rate = st.tasksOnTime / st.tasksDone;
                        let bg = 'rgba(234, 67, 53, 0.1)', border = 'var(--danger-color)', color = 'var(--danger-color)';
                        if (rate >= 0.8) { bg = 'rgba(52, 168, 83, 0.1)'; border = 'var(--success-color)'; color = 'var(--success-color)'; }
                        else if (rate >= 0.5) { bg = 'rgba(245, 158, 11, 0.1)'; border = '#f59e0b'; color = '#d97706'; }
                        return (
                            <div style={{
                                display: 'inline-block', marginTop: '0.4rem', marginBottom: '0.4rem',
                                padding: '0.3rem 0.6rem', borderRadius: '6px',
                                background: bg, border: `1px solid ${border}`,
                                fontSize: '0.8rem', fontWeight: 700, color: color
                            }}>
                               🎯 Đúng hạn: {st.tasksOnTime} / {st.tasksDone} ({Math.round(rate * 100)}%)
                            </div>
                        );
                     })()}
                     
                     {st.tasksDoneList.length > 0 && (
                       <ul style={{margin: '0.5rem 0 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '120px', overflowY: 'auto', background:'#fff', padding:'0.5rem 1rem', borderRadius:'6px', border:'1px solid #e2e8f0'}}>
                         {st.tasksDoneList.map((t, idx) => {
                           // Việc nhóm: ghi rõ ai cùng làm, để không tưởng báo cáo đếm trùng
                           const mates = t.mates || [];
                           return (
                             <li key={idx} style={{marginBottom:'0.3rem', lineHeight: '1.3'}}>
                               {t.title}
                               {mates.length > 0 && <span style={{color: '#1d4ed8', fontWeight: 600}}> — cùng: {mates.join(', ')}</span>}
                             </li>
                           );
                         })}
                       </ul>
                     )}
                   </div>
                 )}
                 
                 {st.prodQty > 0 && (
                   <div style={{marginTop: 'auto', padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)'}}>
                     <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.75rem'}}>
                        <Package size={18} color="var(--success-color)"/>
                        <p style={{margin: 0, fontSize: '1rem', fontWeight:600, color: 'var(--success-color)'}}>Sản Xuất Dưới Xưởng</p>
                     </div>
                     <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                        <div>
                          <p style={{margin: '0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>Mã SP: <strong style={{color:'var(--text-primary)'}}>{st.prodDetails.join(', ')}</strong></p>
                          <p style={{margin: '0.3rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>Hiệu suất: <strong style={{color:'var(--text-primary)'}}>{st.avgPerf ? Math.round(st.avgPerf) + '%' : 'N/A'}</strong></p>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <p style={{margin: 0, fontSize: '0.85rem', color: 'var(--text-tertiary)'}}>Sản lượng</p>
                          <p style={{margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--success-color)', lineHeight: 1}}>{Number(st.prodQty.toFixed(1))} <span style={{fontSize:'0.9rem'}}>SP</span></p>
                        </div>
                     </div>
                   </div>
                 )}
              </div>
           </div>
         ))}
         {workReportData.length === 0 && (
            <div className="glass-panel" style={{padding: '3rem', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-tertiary)'}}>
               Không có hoạt động nào được ghi nhận trong khoảng thời gian này.
            </div>
         )}
      </div>
    </div>
  );

  // --- TIMELINE RENDERER ---
  const renderTimeline = () => {
    if (!rawData) return null;
    const { allLogs } = rawData;
    
    const logsOnDate = allLogs.filter(log => log.execution_date === timelineDate && log.start_time && log.end_time);
    
    const workerLogs = {};
    logsOnDate.forEach(log => {
      const wId = log.worker_id;
      const wName = log.nhan_vien?.name || wId || 'Unknown';
      if (!workerLogs[wId]) workerLogs[wId] = { name: wName, logs: [] };
      workerLogs[wId].logs.push(log);
    });
    
    const workers = Object.values(workerLogs);
    
    const stringToColor = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    };
    
    const START_H = 8;
    const END_H = 21;
    const TOTAL_MINS = (END_H - START_H) * 60;
    const hours = Array.from({length: END_H - START_H + 1}, (_, i) => START_H + i);
    
    const calcPos = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        const mins = (h - START_H) * 60 + m;
        return (mins / TOTAL_MINS) * 100;
    };

    return (
      <div className="glass-panel" style={{...styles.tableContainer, padding: '1.5rem'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem'}}>
          <h3 style={{display:'flex', alignItems:'center', gap:'0.5rem'}}><CalendarClock size={24} color="var(--primary-color)"/> Bảng Tiến Độ Sản Xuất Trong Ngày</h3>
          <input type="date" value={timelineDate} onChange={e => setTimelineDate(e.target.value)} className="form-control" style={{width: '200px', padding: '0.4rem 0.8rem'}} />
        </div>
        
        {workers.length === 0 ? (
           <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)'}}>Không có dữ liệu làm việc trong ngày này.</div>
        ) : (
        <div style={{overflowX: 'auto', paddingBottom: '1rem'}}>
          <div style={{ minWidth: '800px', position: 'relative' }}>
             <div style={{display: 'flex', marginLeft: '120px', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem'}}>
                {hours.map((h, i) => (
                  <div key={h} style={{ flex: i === hours.length - 1 ? 0 : 1, minWidth: i === hours.length - 1 ? 'auto' : '60px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {h}:00
                  </div>
                ))}
             </div>
             
             <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                <div style={{ position: 'absolute', left: '120px', right: 0, top: 0, bottom: 0, display: 'flex', pointerEvents: 'none', zIndex: 0 }}>
                    {hours.map((h, i) => (
                       <div key={h} style={{ flex: i === hours.length - 1 ? 0 : 1, borderLeft: '1px dashed #e2e8f0', minWidth: i === hours.length - 1 ? 'auto' : '60px' }}></div>
                    ))}
                </div>
                
                {workers.map((w, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', minHeight: '50px', borderBottom: '1px solid #f1f5f9', position: 'relative', zIndex: 1, padding: '0.25rem 0' }}>
                     <div style={{ width: '120px', flexShrink: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }} title={w.name}>
                        {w.name}
                     </div>
                     <div style={{ flex: 1, position: 'relative', height: '36px' }}>
                        {w.logs.map((log, lidx) => {
                           let lPercent = calcPos(log.start_time);
                           let rPercent = calcPos(log.end_time);
                           
                           if (lPercent < 0) lPercent = 0;
                           if (rPercent > 100) rPercent = 100;
                           if (rPercent <= lPercent) return null;
                           
                           const wPercent = rPercent - lPercent;
                           const bg = stringToColor(log.production_orders?.product_code || 'default');
                           const qty = parseFloat(log.actual_quantity || 0).toFixed(1);
                           
                           return (
                             <div 
                               key={log.id || lidx}
                               title={`Mã SP: ${log.production_orders?.product_code || 'N/A'}\nBắt đầu: ${log.start_time}\nKết thúc: ${log.end_time}\nSản lượng: ${qty}`}
                               style={{
                                 position: 'absolute', left: `${lPercent}%`, width: `${wPercent}%`, top: '2px', bottom: '2px',
                                 background: bg, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                 color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.5)', opacity: 0.9, cursor: 'help', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                               }}
                             >
                               {wPercent > 5 ? log.production_orders?.product_code : ''}
                             </div>
                           );
                        })}
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <ModuleShell
      title="Tổng Quan Sản Xuất"
      icon={LayoutDashboard}
      color="#2563eb"
      loading={loading}
      onRefresh={() => { dataCache.invalidate(CACHE_KEY); fetchAllData(true); }}
      onBack={activeTab !== 'menu' ? () => setActiveTab('menu') : undefined}
      tabs={activeTab !== 'menu' ? (
        <>
          <TabButton active={activeTab==='overview'} onClick={()=>setActiveTab('overview')} icon={LayoutDashboard} label="Báo Cáo" color="#2563eb" />
          <TabButton active={activeTab==='reports'} onClick={()=>setActiveTab('reports')} icon={BarChart2} label="Phân Tích" color="#2563eb" />
          <TabButton active={activeTab==='orders'} onClick={()=>setActiveTab('orders')} icon={Package} label="Phiếu Lệnh" color="#2563eb" />
          <TabButton active={activeTab==='capacities'} onClick={()=>setActiveTab('capacities')} icon={Activity} label="Định Mức" color="#2563eb" />
          <TabButton active={activeTab==='timeline'} onClick={()=>setActiveTab('timeline')} icon={CalendarClock} label="Tiến Độ" color="#2563eb" />
        </>
      ) : null}
    >
      <div style={{ padding: activeTab === 'menu' ? '1rem' : '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {activeTab === 'menu' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            maxWidth: 800,
            width: '100%',
            alignSelf: 'center',
          }}>
            {[
              { id: 'overview', label: 'Báo Cáo', icon: LayoutDashboard },
              { id: 'reports', label: 'Phân Tích', icon: BarChart2 },
              { id: 'orders', label: 'Phiếu Lệnh', icon: Package },
              { id: 'capacities', label: 'Định Mức', icon: Activity },
              { id: 'timeline', label: 'Tiến Độ', icon: CalendarClock },
            ].map(tabDef => (
              <button
                key={tabDef.id}
                onClick={() => setActiveTab(tabDef.id)}
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
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
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
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'reports' && renderReports()}
            {activeTab === 'capacities' && renderCapacities()}
            {activeTab === 'orders' && renderOrders()}
            {activeTab === 'timeline' && renderTimeline()}
          </>
        )}

        {/* Modals rendered via Portal to avoid z-index & overflow issues on mobile */}
        {showCapacityModal && ReactDOM.createPortal(
          <div style={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(setShowCapacityModal); }}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h3 style={{margin:0, fontSize:'1.1rem'}}>Cập Nhật Năng Lực / Định Mức</h3>
                <button onClick={() => closeModal(setShowCapacityModal, setNewCapacity, { product_code: '', product_name: '', standard_time: '' })} style={styles.closeBtn}><X size={20} /></button>
              </div>
              <form onSubmit={createSingleCapacity} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label className="form-label">Mã Sản Phẩm *</label><input type="text" className="form-control" value={newCapacity.product_code} onChange={e => setNewCapacity({...newCapacity, product_code: e.target.value})} required placeholder="Ví dụ: BTM-001"/></div>
                <div><label className="form-label">Tên Sản Phẩm (Tuỳ chọn)</label><input type="text" className="form-control" value={newCapacity.product_name} onChange={e => setNewCapacity({...newCapacity, product_name: e.target.value})} placeholder="Ví dụ: Quạt tản nhiệt..." /></div>
                <div><label className="form-label">Thời Gian Chuẩn (Giờ / 1 SP) *</label><input type="number" step="0.001" className="form-control" value={newCapacity.standard_time} onChange={e => setNewCapacity({...newCapacity, standard_time: e.target.value})} required min="0.001" placeholder="Ví dụ: 0.5"/></div>
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>Lưu Định Mức</button>
              </form>
            </div>
          </div>,
          document.body
        )}

        {/* Modal Lệnh thủ công */}
        {showOrderModal && ReactDOM.createPortal(
          <div style={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(setShowOrderModal); }}>
            <div style={styles.modalContent}>
              <div style={styles.modalHeader}>
                <h3 style={{margin:0, fontSize:'1.1rem'}}>Tạo Nhanh 1 Lệnh</h3>
                <button onClick={() => closeModal(setShowOrderModal, setNewOrder, { order_code: '', product_code: '', target_quantity: '' })} style={styles.closeBtn}><X size={20} /></button>
              </div>
              <form onSubmit={createSingleOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label className="form-label">Mã Lệnh</label><input type="text" className="form-control" value={newOrder.order_code} onChange={e => setNewOrder({...newOrder, order_code: e.target.value})} required /></div>
                <div><label className="form-label">Mã SP (Phải đúng CSDL Định mức)</label><input type="text" className="form-control" value={newOrder.product_code} onChange={e => setNewOrder({...newOrder, product_code: e.target.value})} required /></div>
                <div><label className="form-label">Số Lượng</label><input type="number" className="form-control" value={newOrder.target_quantity} onChange={e => setNewOrder({...newOrder, target_quantity: e.target.value})} required min="1"/></div>
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>Xác Nhận</button>
              </form>
            </div>
          </div>,
          document.body
        )}

      </div>
    </ModuleShell>
  );
};

const styles = {
  container: { minHeight: '100vh', background: 'var(--bg-primary)' },
  header: { background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 },
  headerContent: { width: '100%', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { background: 'var(--accent-gradient)', color: '#fff', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontWeight: 'bold' },
  logoutBtn: { padding: '0.5rem 1rem', color: 'var(--text-secondary)', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' },
  workerBtn: { padding: '0.5rem 1rem', color: '#fff', border: 'none', background:'var(--primary-color)', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  main: { width: '100%', margin: '0 auto', padding: '1.5rem' },
  tabMenu: { display: 'flex', gap: '1rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', overflowX: 'auto' },
  tabItem: { padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid transparent', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' },
  tabActive: { padding: '0.75rem 1rem', color: 'var(--primary-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid var(--primary-color)', cursor: 'pointer', whiteSpace: 'nowrap' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' },
  statCard: { display: 'flex', alignItems: 'center', padding: '1.5rem' },
  statIcon: (color) => ({ width: '48px', height: '48px', borderRadius: '12px', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
  statTitle: { color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 },
  statValue: { color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 700, marginTop: '0.25rem' },
  tableContainer: { overflow: 'hidden' },
  tableHeader: { padding: '1.5rem', borderBottom: '1px solid #f1f5f9' },
  tableHeaderFlex: { padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  badge: (val) => ({ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, background: val >= 100 ? '#ecfdf5' : (val < 80 ? '#fef2f2' : '#fffbeb'), color: val >= 100 ? 'var(--success-color)' : (val < 80 ? 'var(--danger-color)' : 'var(--warning-color)') }),
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modalContent: { width: '100%', maxWidth: '400px', background: '#fff', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', boxSizing: 'border-box', overflowY: 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  closeBtn: { background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, margin: 0, padding: 0 }
};

const setupGlobalCSS = () => {
    if (typeof document !== 'undefined') {
        if (!document.getElementById('admin-custom-css')) {
          const style = document.createElement('style');
          style.id = 'admin-custom-css';
          style.innerHTML = `
              .admin-table th { padding: 1rem 1.5rem; background: #f8fafc; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
              .admin-table td { padding: 1rem 1.5rem; border-bottom: 1px solid #f1f5f9; color: var(--text-primary); }
              .admin-table tr:hover td { background: #f8fafc; }
              .btn-secondary { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; transition: 0.2s; font-size: 0.9rem; font-weight: 500;}
              .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
              .form-control { width: 100%; box-sizing: border-box; }
              .spin { animation: spin 1s linear infinite; }
              @keyframes spin { 100% { transform: rotate(360deg); } }
          `;
          document.head.appendChild(style);
        }
    }
};
setupGlobalCSS();

export default AdminDashboard;
