import React, { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { Calendar, Filter, Package, Users, ClipboardList, ShieldAlert, CheckCircle, Clock, Target, Zap } from 'lucide-react';
import { AttachmentBadge } from '../../components/AttachmentList';

// Avatar tròn: ảnh thật nếu có, không thì chữ cái đầu tên trên nền gradient brand
function RepAvatar({ name, avatar, size = 40 }) {
  const initials = (name || '?').trim().split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() || '?';
  const common = { width: size, height: size, borderRadius: '50%', flexShrink: 0 };
  if (avatar) {
    return <img src={avatar} alt={name || ''} style={{ ...common, objectFit: 'cover', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }} />;
  }
  return (
    <div style={{ ...common, background: 'var(--accent-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export default function WorkReport() {
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'ngoc', 'phong'
  const [workReportFilter, setWorkReportFilter] = useState('week');
  const [workReportDates, setWorkReportDates] = useState({ start: '', end: '' });
  
  const [workReportData, setWorkReportData] = useState([]);
  const [workOverallStats, setWorkOverallStats] = useState({ prodQty: 0, tasksDone: 0, tasksTotal: 0, tasksOnTime: 0, activeStaff: 0, overallProductQty: {}, absentStaff: [] });
  
  const [allTasks, setAllTasks] = useState([]);
  const [allWarranties, setAllWarranties] = useState([]);
  const [staffMap, setStaffMap] = useState({});
  const [avatarMap, setAvatarMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWorkReportData();
  }, [workReportFilter, workReportDates]);

  const fetchWorkReportData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      now.setHours(0,0,0,0);
      let start, end;
      const currentDay = now.getDay();
      const offset = now.getTimezoneOffset() * 60000;
      
      let startStr = '2000-01-01', endStr = '2100-01-01';
      
      if (workReportFilter === 'custom') {
         startStr = workReportDates.start || '2000-01-01';
         endStr = workReportDates.end || '2100-01-01';
      } else if (workReportFilter !== 'all') {
          if (workReportFilter === 'today') {
            start = new Date(now); end = new Date(now);
          } else if (workReportFilter === 'yesterday') {
            const yes = new Date(now.getTime() - 86400000);
            start = yes; end = yes;
          } else if (workReportFilter === 'week') {
            start = new Date(now);
            start.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
            end = new Date(now);
          } else if (workReportFilter === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now);
          } else if (workReportFilter === 'year') {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now);
          }
          startStr = new Date(start.getTime() - offset).toISOString().split('T')[0];
          endStr = new Date(end.getTime() - offset).toISOString().split('T')[0];
      }

      // --- Execute queries in PARALLEL mode to fix slow loading ---
      let pQuery = supabase.from('production_logs').select(`
        id, actual_quantity, worker_id, execution_date, performance_rate,
        production_orders ( product_code )
      `);
      if (workReportFilter !== 'all') {
         if (workReportFilter === 'custom' && !workReportDates.start && !workReportDates.end) { } 
         else {
            if (startStr !== '2000-01-01') pQuery = pQuery.gte('execution_date', startStr);
            if (endStr !== '2100-01-01') pQuery = pQuery.lte('execution_date', endStr);
         }
      }

      // Parallelize the heavy IO operations (Running them concurrently cuts load time by ~75%)
      const [
         { data: nvData },
         { data: pLogs },
         { data: tLogs },
         { data: wData },
         { data: tdLogs }
      ] = await Promise.all([
         supabase.from('nhan_vien').select('id, name, avatar'),
         pQuery,
         fetchAllRows(() => supabase.from('cong_viec_duoc_giao').select('*')),
         supabase.from('phieu_bao_hanh').select('*').order('thời_điểm_cập_nhật', {ascending: false}).limit(2500),
         fetchAllRows(() => supabase.from('tien_do').select('task_id, content, time').order('time', {ascending: false}))
      ]);

      // Build map: task_id -> latest content from tien_do
      const latestUpdateMap = {};
      (tdLogs || []).forEach(td => {
         if (!latestUpdateMap[td.task_id]) {
            latestUpdateMap[td.task_id] = td.content;
         }
      });

      const sMap = {};
      const aMap = {};
      (nvData || []).forEach(n => { sMap[n.id] = n.name; aMap[n.id] = n.avatar || ''; });
      setStaffMap(sMap);
      setAvatarMap(aMap);
      // Attach latest_update from tien_do into each task
      const tasksWithUpdates = (tLogs || []).map(t => ({
         ...t,
         latest_update: latestUpdateMap[t.id] || null
      }));
      setAllTasks(tasksWithUpdates);
      setAllWarranties(wData || []);

      // --- Processing General Report (WorkReportData) ---
      let cProdQty = 0, cTasksDone = 0, cTasksTotal = 0, cTasksOnTime = 0;
      let activeStaff = new Set();
      let overallProductQty = {};
      
      const genStaffMap = new Map((nvData||[]).map(nv => [nv.id, {
        name: nv.name, avatar: nv.avatar || '', prodQty: 0, prodDetails: [], tasksDone: 0, tasksTotal: 0, prodPerf: [], tasksDoneList: [], tasksOnTime: 0
      }]));

      (pLogs || []).forEach(log => {
         const qty = parseFloat(log.actual_quantity || 0);
         const pName = log.production_orders?.product_code || '';
         const wId = log.worker_id;
         cProdQty += qty;
         activeStaff.add(wId);
         
         if (pName) overallProductQty[pName] = (overallProductQty[pName] || 0) + qty;
         
         if (wId && genStaffMap.has(wId)) {
           const st = genStaffMap.get(wId);
           st.prodQty += qty;
           const existingP = st.prodDetails.find(p => p.code === pName);
           if (existingP) existingP.qty += qty;
           else if (pName) st.prodDetails.push({code: pName, qty: qty});
           st.prodPerf.push(parseFloat(log.performance_rate||0));
         }
      });

      (tLogs || []).forEach(task => {
         let isDoneInRange = false;
         if (task.status === 'COMPLETED' && task.completed_date) {
             const cd = task.completed_date.split('T')[0];
             if (cd >= startStr && cd <= endStr) isDoneInRange = true;
         }
         const isPending = task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
         if (!isDoneInRange && !isPending) return;

         const wId = task.assignee_id;
         cTasksTotal += 1;
         if (isDoneInRange) cTasksDone += 1;
         activeStaff.add(wId);

         if (wId && genStaffMap.has(wId)) {
            const st = genStaffMap.get(wId);
            st.tasksTotal += 1;
            if (isDoneInRange) {
               st.tasksDone += 1;
               st.tasksDoneList.push(task.title);

               let isLate = false;
               if (task.due_date && task.completed_date) {
                  const due = new Date(task.due_date).getTime();
                  const done = new Date(task.completed_date).getTime();
                  if ((done - due) > 60000) isLate = true;
               }
               if (!isLate) {
                  st.tasksOnTime += 1;
                  cTasksOnTime += 1;
               }
            }
         }
      });

      let finalReport = Array.from(genStaffMap.values()).filter(s => s.prodQty > 0 || s.tasksTotal > 0);
      finalReport = finalReport.map(s => {
         const avgPerf = s.prodPerf.length > 0 ? (s.prodPerf.reduce((a,b)=>a+b,0)/s.prodPerf.length) : null;
         const taskRate = s.tasksDone > 0 ? s.tasksOnTime / s.tasksDone : null;
         return { ...s, avgPerf, taskRate };
      });
      
      const rankPerfScores = [...new Set(finalReport.map(s => s.avgPerf).filter(v => v !== null))].sort((a,b) => b - a);
      const rankTaskRates = [...new Set(finalReport.map(s => s.taskRate).filter(v => v !== null))].sort((a,b) => b - a);

      finalReport = finalReport.map(s => ({
           ...s,
           perfRank: s.avgPerf !== null ? rankPerfScores.indexOf(s.avgPerf) + 1 : null,
           taskRank: s.taskRate !== null ? rankTaskRates.indexOf(s.taskRate) + 1 : null
      }));
      
      finalReport.sort((a,b) => {
         const aTR = a.taskRank !== null ? a.taskRank : 9999;
         const bTR = b.taskRank !== null ? b.taskRank : 9999;
         if (aTR !== bTR) return aTR - bTR;
         const aPR = a.perfRank !== null ? a.perfRank : 9999;
         const bPR = b.perfRank !== null ? b.perfRank : 9999;
         if (aPR !== bPR) return aPR - bPR;
         return (b.prodQty + b.tasksDone) - (a.prodQty + a.tasksDone);
      });
      
      setWorkReportData(finalReport);
      
      const absentStaff = Array.from(genStaffMap.values()).filter(s => s.prodQty === 0 && s.tasksTotal === 0).map(s => s.name);
      setWorkOverallStats({ prodQty: cProdQty, tasksDone: cTasksDone, tasksTotal: cTasksTotal, tasksOnTime: cTasksOnTime, activeStaff: activeStaff.size, overallProductQty, absentStaff });
      
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- Filter Helpers for Date ---
  const isDateInRange = (dateStr) => {
       if (workReportFilter === 'all' || !dateStr) return true;
       const dStr = String(dateStr); const d = dStr.includes('T') ? new Date(dStr) : new Date(dStr + 'T00:00:00');
       if (isNaN(d.getTime())) return true;
       
       const today = new Date();
       if (workReportFilter === 'today') {
          return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
       } else if (workReportFilter === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          return d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
       } else if (workReportFilter === 'week') {
          const startOfWeek = new Date(today);
          const day = startOfWeek.getDay() || 7;
          startOfWeek.setDate(today.getDate() - day + 1);
          startOfWeek.setHours(0,0,0,0);
          return d.getTime() >= startOfWeek.getTime();
       } else if (workReportFilter === 'month') {
          return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
       } else if (workReportFilter === 'year') {
          return d.getFullYear() === today.getFullYear();
       } else if (workReportFilter === 'custom' && workReportDates && workReportDates.start && workReportDates.end) {
          const from = new Date(workReportDates.start); from.setHours(0,0,0,0);
          const to = new Date(workReportDates.end); to.setHours(23,59,59,999);
          return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
       }
       return true;
    };
  
    const filteredWarranties = React.useMemo(() => allWarranties.filter(w => {
             let updateDate = w['thời_điểm_cập_nhật'] || w['thoi_diem_cap_nhat'] || w['updated_at'] || w['thời_điểm_tạo'] || w['created_at'];
             return isDateInRange(updateDate);
          }), [allWarranties, workReportFilter, workReportDates]);
  
    // Specific Personal Data Generator
    const getPersonalData = (nameKeyword) => {
     // 1. Filter TASKS
     const tasks = allTasks.filter(t => {
         const name = staffMap[t.assignee_id] || '';
         return name.toLowerCase().includes(nameKeyword.toLowerCase());
     });

     const getOD = (dStr) => {
         if (!dStr) return -9999;
         let limit = new Date(dStr);
         if (isNaN(limit.getTime())) return -9999;
         const today = new Date(); today.setHours(0,0,0,0); limit.setHours(0,0,0,0);
         return Math.floor((today.getTime() - limit.getTime()) / 86400000);
     };

     // Pre-compute O.D. to avoid O(N log N) Date allocations
     const activeTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
         .map(t => ({ ...t, _od: getOD(t.due_date) }))
         .sort((a,b) => b._od - a._od);

     const doneTasks = tasks.filter(t => t.status === 'COMPLETED');
     const totalAssigned = tasks.filter(t => t.status !== 'CANCELLED').length;
     const doneCount = doneTasks.length;
     const pendingCount = activeTasks.length;

     const onTimeCount = doneTasks.filter(t => {
        if (!t.due_date || !t.completed_date) return true;
        return new Date(t.completed_date).getTime() - new Date(t.due_date).getTime() <= 60000;
     }).length;

     const completionRate = totalAssigned > 0 ? ((doneCount / totalAssigned) * 100).toFixed(1) : 0;
     const onTimeRate = doneCount > 0 ? ((onTimeCount / doneCount) * 100).toFixed(1) : 0;

     // 2. Load ALL WARRANTIES within the timeframe (Ngoc and Phong share workload)
     const myWarranties = filteredWarranties;

     const getAge = (w) => {
         let cStr = w['thời_điểm_tạo'] || w['thoi_diem_tao'] || w['ngày_tạo'] || w['ngay_tao'] || w.created_at;
         if (!cStr) return -1;
         let cr = new Date(cStr);
         if (isNaN(cr.getTime()) && String(cStr).includes('/')) {
            const parts = cStr.split(' ')[0].split('/');
            if (parts.length >= 3) cr = new Date(parts[2], parts[1]-1, parts[0]);
         }
         if (isNaN(cr.getTime())) return -1;
         const today = new Date(); today.setHours(0,0,0,0); cr.setHours(0,0,0,0);
         return Math.floor((today.getTime() - cr.getTime()) / 86400000);
     };

     // Pre-compute Age to avoid O(N log N) Date allocations
     const warranties = myWarranties
         .map(w => ({ ...w, _age: getAge(w) }))
         .sort((a, b) => b._age - a._age);

     return { activeTasks, doneTasks, warranties, totalAssigned, doneCount, pendingCount, completionRate, onTimeRate };
  };

  const styles = {
    reportToolbar: { display: 'flex', gap: '0.8rem', background: '#fff', padding: '1rem', borderRadius: 14, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', alignItems: 'center' },
    dateSelect: { padding: '0.5rem 1.8rem 0.5rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-strong)', background: '#fff', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, minWidth: '150px', cursor: 'pointer' },
    dateInput: { padding: '0.5rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-strong)', fontSize: '0.85rem', color: 'var(--text-primary)' },
    // Tab dạng segmented control: nền slate, tab active nổi trắng
    tabButton: (isActive) => ({
      padding: '0.45rem 1.1rem', fontWeight: isActive ? 700 : 500, fontSize: '0.85rem',
      color: isActive ? 'var(--primary-color)' : 'var(--text-secondary)',
      background: isActive ? '#fff' : 'transparent',
      border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
    }),
    statCard: { background: '#fff', padding: '1.1rem 1.25rem', borderRadius: 14, display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', flex: '1 1 200px' },
    statIcon: (color) => ({ width: 42, height: 42, borderRadius: 11, background: `${color}14`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }),
    statTitle: { margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 },
    statValue: { margin: '0.2rem 0 0 0', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 },
    tableTh: { padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' },
    tableTd: { padding: '0.8rem 1rem', fontSize: '0.78rem', color: 'var(--text-primary)', borderBottom: '1px solid #f1f5f9' },
    // Chip hạng thi đua trong card nhân viên (icon + nhãn, không emoji)
    rankChip: (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color: fg, padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }),
  };

  const renderPersonalTab = (nameKeyword) => {
      const pData = getPersonalData(nameKeyword);
      // Tìm nhân viên khớp keyword để lấy avatar + tên đầy đủ cho header
      const matchId = Object.keys(staffMap).find(id => (staffMap[id] || '').toLowerCase().includes(nameKeyword.toLowerCase()));
      const repName = matchId ? staffMap[matchId] : nameKeyword;
      const repAvatar = matchId ? avatarMap[matchId] : '';

      return (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header nhân viên: avatar to + tên + vai trò báo cáo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', background: '#fff', padding: '0.85rem 1.1rem', borderRadius: 14, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
               <RepAvatar name={repName} avatar={repAvatar} size={64} />
               <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{repName}</h2>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Báo cáo công việc &amp; bảo hành cá nhân</p>
               </div>
            </div>

            {/* Top Cards */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.2rem'}}>
                
                {/* Active Task KPI */}
                <div style={{...styles.statCard, padding: '1rem 1.2rem', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem'}}>
                  <div style={{...styles.statIcon('#3b82f6'), flexShrink: 0, width: '42px', height: '42px'}}><ClipboardList size={20} /></div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <p style={{...styles.statTitle, fontSize: '0.8rem', margin: 0}}>VIỆC ĐÃ GIAO</p>
                         <div style={{display: 'flex', alignItems: 'baseline', gap: '0.2rem'}}>
                            <p style={{...styles.statValue, fontSize: '1.6rem', lineHeight: '1', margin: 0}}>{pData.totalAssigned}</p>
                         </div>
                     </div>
                     <div style={{ background: '#eff6ff', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{fontSize: '0.75rem', color: '#1e3a8a', fontWeight: 700}}>Còn chưa làm:</span>
                        <span style={{fontSize: '0.9rem', color: '#dc2626', fontWeight: 800}}>{pData.pendingCount}</span>
                     </div>
                  </div>
                </div>

                {/* Completed KPI */}
                <div style={{...styles.statCard, padding: '1rem 1.2rem', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem'}}>
                  <div style={{...styles.statIcon('#10b981'), flexShrink: 0, width: '42px', height: '42px'}}><CheckCircle size={20} /></div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                            <p style={{...styles.statTitle, fontSize: '0.8rem', margin: 0}}>HOÀN THÀNH</p>
                            <span style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '12px', color: '#166534', fontWeight: 800, fontSize: '0.65rem' }}>Đạt {pData.completionRate}%</span>
                         </div>
                         <div style={{display: 'flex', alignItems: 'baseline', gap: '0.2rem'}}>
                            <p style={{...styles.statValue, fontSize: '1.6rem', lineHeight: '1', margin: 0}}>{pData.doneCount}</p>
                         </div>
                     </div>
                     
                     {(()=>{
                        const otRate = parseFloat(pData.onTimeRate) || 0;
                        let otColor = '#166534'; let otBg = '#dcfce7'; let otBrd = '#bbf7d0'; // Green
                        if (otRate < 50) { otColor = '#991b1b'; otBg = '#fee2e2'; otBrd = '#fecaca'; } // Red
                        else if (otRate < 80) { otColor = '#92400e'; otBg = '#fef3c7'; otBrd = '#fde68a'; } // Yellow

                        return (
                           <div style={{ background: otBg, border: `1px solid ${otBrd}`, padding: '0.25rem 0.6rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{fontSize: '0.75rem', color: otColor, fontWeight: 700}}>Đúng hạn:</span>
                              <span style={{fontSize: '0.9rem', color: otColor, fontWeight: 800}}>{pData.onTimeRate}%</span>
                           </div>
                        );
                     })()}
                  </div>
                </div>

                {/* Warranties KPI */}
                <div style={{...styles.statCard, padding: '1rem 1.2rem', borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem'}}>
                  <div style={{...styles.statIcon('#f59e0b'), flexShrink: 0, width: '42px', height: '42px'}}><ShieldAlert size={20} /></div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.2rem' }}>
                         <p style={{...styles.statTitle, fontSize: '0.8rem', margin: 0}}>PHIẾU BẢO HÀNH</p>
                         <p style={{...styles.statValue, fontSize: '1.6rem', lineHeight: '1', margin: 0}}>{pData.warranties.length}</p>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                         <span style={{fontSize: '0.65rem', color: '#64748b', fontWeight: 600}}>Đã lọc theo T.Điểm cập nhật</span>
                      </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
                {/* Active Tasks Listing */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <Clock size={18} color="#2563eb" />
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Việc đang nhận / đang làm</h3>
                      <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{pData.activeTasks.length}</span>
                   </div>
                   
                   {pData.activeTasks.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>Không có công việc nào đang nhận.</p>
                   ) : (
                      <div style={{ height: 'calc(100vh - 360px)', minHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingBottom: '1rem' }}>
                            {pData.activeTasks.map((task, idx) => {

                               const taskName = task.title || task.ten_viec || task.name || 'Công việc không tên';
                               let statusNode = null;
                               let limitDateStr = '-- : --';
                               let statusColor = '#94a3b8';

                               if (task.due_date) {
                                  let limit = new Date(task.due_date);
                                  if (!isNaN(limit.getTime())) {
                                     const formattedDate = limit.toLocaleDateString('vi-VN');
                                     const formattedTime = limit.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                                     limitDateStr = `${formattedTime} - ${formattedDate}`;

                                     const today = new Date(); today.setHours(0, 0, 0, 0); limit.setHours(0, 0, 0, 0);
                                     const diffDays = Math.floor((today.getTime() - limit.getTime()) / 86400000);

                                     if (diffDays > 0) {
                                        statusColor = '#dc2626';
                                        statusNode = <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#b91c1c', background: '#fee2e2', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>Quá hạn {diffDays} ngày</span>;
                                     } else if (diffDays === 0) {
                                        statusColor = '#d97706';
                                        statusNode = <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>Hạn hôm nay</span>;
                                     } else {
                                        statusColor = '#059669';
                                        statusNode = <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#065f46', background: '#d1fae5', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>Còn {Math.abs(diffDays)} ngày</span>;
                                     }
                                  }
                               } else {
                                  statusNode = <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#475569', background: '#f1f5f9', padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>Không có hạn</span>;
                               }

                               const latestCmt = task.latest_update || task.latest_comment || task.comment || null;

                               return (
                                  <div key={idx} style={{ background: '#fff', border: '1px solid var(--border-color)', borderLeft: `3px solid ${statusColor}`, borderRadius: 12, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', boxShadow: 'var(--shadow-sm)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.4', flex: 1, minWidth: 0 }}>{taskName} <AttachmentBadge list={task.attachments} /></div>
                                          <div>{statusNode}</div>
                                      </div>

                                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', padding: '0.6rem 0.75rem', borderRadius: 8 }}>
                                          <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tiến độ gần nhất</p>
                                          <p style={{ margin: 0, fontSize: '0.85rem', color: latestCmt ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: latestCmt ? 600 : 400, fontStyle: latestCmt ? 'normal' : 'italic' }}>{latestCmt || 'Chưa cập nhật...'}</p>
                                      </div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}><Clock size={12} /> Hạn chót</span>
                                         <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>{limitDateStr}</span>
                                      </div>
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   )}
                </div>

                {/* Warranties Table */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <ShieldAlert color="#d97706" size={18} />
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Danh sách bảo hành</h3>
                      <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{pData.warranties.length}</span>
                   </div>

                   {pData.warranties.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>Không có phiếu bảo hành nào.</p>
                   ) : (
                      <div style={{ height: 'calc(100vh - 360px)', minHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingBottom: '1rem' }}>
                            {pData.warranties.map((w, idx) => {
                               const stRaw = w['trạng_thái_phiếu_ghi'] || w['trang_thai_phieu_ghi'] || w.status || w.trang_thai || '';
                               const stL = String(stRaw).toLowerCase();
                               const isCompleted = stL.includes('solved') || stL.includes('close');

                               // Chip tuổi phiếu: cảnh báo dần theo số ngày tồn (slate → amber → red)
                               const ageNode = (() => {
                                    if (w._age === undefined || w._age < 0) return <span style={{ fontWeight: 700, fontSize: '0.7rem', color: 'var(--text-tertiary)', background: '#f1f5f9', padding: '3px 8px', borderRadius: 999 }}>N/A</span>;
                                    let bg = '#f1f5f9', fg = '#475569';
                                    if (!isCompleted && w._age > 14) { bg = '#fee2e2'; fg = '#b91c1c'; }
                                    else if (!isCompleted && w._age > 7) { bg = '#fef3c7'; fg = '#92400e'; }
                                    return <span style={{ fontWeight: 700, fontSize: '0.7rem', color: fg, background: bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>Qua {w._age} ngày</span>;
                                 })();

                               const wStatusBadge = isCompleted
                                 ? <span style={{fontSize: '0.68rem', background: '#d1fae5', color: '#065f46', padding: '3px 8px', borderRadius: 999, fontWeight: 700}}>Hoàn thành</span>
                                 : <span style={{fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 999, fontWeight: 700}}>Đang xử lý</span>;

                               return (
                                  <div key={idx} style={{ background: '#fff', border: '1px solid var(--border-color)', borderLeft: `3px solid ${isCompleted ? '#059669' : '#d97706'}`, borderRadius: 12, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', boxShadow: 'var(--shadow-sm)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{w.mã_sản_phẩm || w.ma_san_pham || 'Không mã SP'}</div>
                                          <div>{ageNode}</div>
                                      </div>

                                      <div style={{ background: '#f8fafc', padding: '0.6rem 0.75rem', borderRadius: 8, minHeight: '48px', border: '1px solid var(--border-color)' }}>
                                          <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Chi tiết lỗi</p>
                                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: '1.35' }}>{w.chi_tiết_lỗi || w.chi_tiet_loi || '-'}</p>
                                      </div>

                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.2rem' }}>
                                         <div style={{ display: 'flex', alignItems: 'center' }}>{wStatusBadge}</div>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                             <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Lắp đặt:</span>
                                             <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>{w.ngày_lắp_đặt ? w.ngày_lắp_đặt.substring(0, 10) : 'N/A'}</span>
                                         </div>
                                      </div>
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   )}
                </div>

              </div>
         </div>
      );
  };

if (loading) return (
    <div style={{padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
      <div className="spin" style={{width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: 'var(--primary-color)', borderRadius: '50%', margin: '0 auto 0.8rem'}} />
      <p style={{fontWeight: 600, fontSize: '0.9rem'}}>Đang tải báo cáo...</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'var(--bg-primary)', minHeight: '100vh', padding: '1rem', maxWidth: 1400, margin: '0 auto', width: '100%' }}>

      {/* HEADER: Tabs & Tools */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: '#fff', padding: '0.85rem 1rem', borderRadius: 14, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
         <div className="hide-scroll" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflowX: 'auto', background: '#f1f5f9', padding: 4, borderRadius: 10, alignSelf: 'flex-start', maxWidth: '100%' }}>
            <button style={styles.tabButton(activeTab === 'general')} onClick={() => setActiveTab('general')}>Tổng hợp chung</button>
            <button style={styles.tabButton(activeTab === 'ngoc')} onClick={() => setActiveTab('ngoc')}>Báo cáo Ngọc</button>
            <button style={styles.tabButton(activeTab === 'phong')} onClick={() => setActiveTab('phong')}>Báo cáo Phong</button>
         </div>

         <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)'}}>
               <Filter size={15} />
               <span style={{fontWeight: 600, fontSize: '0.82rem'}}>Khoảng thời gian (bảo hành & sản phẩm):</span>
            </div>
            <select value={workReportFilter} onChange={e => setWorkReportFilter(e.target.value)} style={styles.dateSelect}>
               <option value="today">Hôm nay</option>
               <option value="yesterday">Hôm qua</option>
               <option value="week">Tuần này</option>
               <option value="month">Tháng này</option>
               <option value="year">Năm nay</option>
               <option value="all">Tất cả</option>
               <option value="custom">Tuỳ chọn...</option>
            </select>

            {workReportFilter === 'custom' && (
               <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  <input type="date" value={workReportDates.start} onChange={e => setWorkReportDates({...workReportDates, start: e.target.value})} style={styles.dateInput} />
                  <span style={{color: 'var(--text-tertiary)'}}>-</span>
                  <input type="date" value={workReportDates.end} onChange={e => setWorkReportDates({...workReportDates, end: e.target.value})} style={styles.dateInput} />
               </div>
            )}
         </div>
      </div>

      {activeTab === 'general' && (
        <>
          {/* STATS */}
          <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
            <div style={styles.statCard}>
              <div style={styles.statIcon('var(--primary-color)')}><ClipboardList size={20} /></div>
              <div style={{ marginLeft: '1rem' }}><p style={styles.statTitle}>Công Việc Giao</p><p style={styles.statValue}>{workOverallStats.tasksDone} / {workOverallStats.tasksTotal}</p></div>
            </div>
            <div style={{...styles.statCard, flex: '2 1 320px'}}>
              <div style={styles.statIcon('var(--success-color)')}><Package size={20} /></div>
              <div style={{ marginLeft: '1rem', flex: 1, minWidth: 0 }}>
                 <p style={styles.statTitle}>Sản Lượng SX</p>
                 <p style={{...styles.statValue, margin: '0.2rem 0 0 0'}}>{Number(workOverallStats.prodQty.toFixed(1))} <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>SP</span></p>
                 {workOverallStats.overallProductQty && Object.keys(workOverallStats.overallProductQty).length > 0 && (() => {
                    // Chỉ hiện 6 mã nhiều nhất, còn lại gộp "+N mã khác" để card không vỡ layout
                    const entries = Object.entries(workOverallStats.overallProductQty).sort((a, b) => b[1] - a[1]);
                    const shown = entries.slice(0, 6);
                    const more = entries.length - shown.length;
                    return (
                       <div style={{display:'flex', gap:'0.35rem', flexWrap:'wrap', marginTop: '0.5rem'}}>
                          {shown.map(([code, qty]) => (
                             <span key={code} style={{fontSize:'0.72rem', background:'#f1f5f9', padding:'0.25rem 0.55rem', borderRadius:999, color:'#475569', fontWeight:600, whiteSpace: 'nowrap'}}>
                               {code}: <span style={{color:'#0f172a', fontWeight:700}}>{Number(qty.toFixed(1))}</span>
                             </span>
                          ))}
                          {more > 0 && <span style={{fontSize:'0.72rem', background:'#eff6ff', padding:'0.25rem 0.55rem', borderRadius:999, color:'#1d4ed8', fontWeight:700, whiteSpace: 'nowrap'}}>+{more} mã khác</span>}
                       </div>
                    );
                 })()}
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon('var(--warning-color)')}><Users size={20} /></div>
              <div style={{ marginLeft: '1rem', flex: 1 }}>
                 <p style={styles.statTitle}>Nhân Sự</p>
                 <div style={{display:'flex', alignItems: 'flex-end', gap: '0.8rem', marginTop:'0.2rem'}}>
                     <p style={{...styles.statValue, margin: 0}}>{workOverallStats.activeStaff}</p>
                     <span style={{fontSize:'0.85rem', color:'#64748b', fontWeight:600, marginBottom:'0.25rem'}}>hoạt động</span>
                 </div>
                 {workOverallStats.absentStaff && workOverallStats.absentStaff.length > 0 && (
                    <div style={{marginTop:'0.5rem', fontSize:'0.75rem', color:'#ef4444', fontWeight:500, background:'#fef2f2', padding:'0.3rem 0.5rem', borderRadius:'6px', border:'1px solid #fee2e2'}}>
                       <strong>Chưa có hoạt động ({workOverallStats.absentStaff.length}):</strong> {workOverallStats.absentStaff.join(', ')}
                    </div>
                 )}
              </div>
            </div>
          </div>
          
          {/* GRID */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1rem'}}>
             {workReportData.map(st => (
               <div key={st.name} style={{background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-color)'}}>
                  <div style={{padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)'}}>
                     <RepAvatar name={st.name} avatar={st.avatar} size={52} />
                     <h3 style={{fontSize: '1.05rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: 0}}>{st.name}</h3>
                     {/* Chỉ gắn huy hiệu top 3 — gắn hạng cho tất cả làm chip mất ý nghĩa */}
                     <div style={{display: 'flex', gap: '0.35rem'}}>
                        {st.taskRank && st.taskRank <= 3 && (
                          <span title="Top chuẩn xác hạn công việc" style={styles.rankChip('#fef3c7', '#92400e')}>
                             <Target size={12} /> Top {st.taskRank} đúng hạn
                          </span>
                        )}
                        {st.perfRank && st.perfRank <= 3 && (
                          <span title="Top hiệu suất sản xuất" style={styles.rankChip('#d1fae5', '#065f46')}>
                             <Zap size={12} /> Top {st.perfRank} hiệu suất
                          </span>
                        )}
                     </div>
                  </div>

                  <div style={{padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', flex: 1}}>
                     {st.tasksTotal > 0 && (
                       <div style={{padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border-color)'}}>
                         <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem', marginBottom:'0.6rem'}}>
                            <div style={{display:'flex', alignItems:'center', gap:'0.45rem'}}>
                               <ClipboardList size={16} color="#2563eb"/>
                               <p style={{margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)'}}>Công việc nội bộ</p>
                            </div>
                            <span style={{fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)'}}>{st.tasksDone} / {st.tasksTotal}</span>
                         </div>
                         {/* Thanh tiến độ hoàn thành */}
                         <div style={{height: 6, borderRadius: 999, background: '#dbeafe', overflow: 'hidden', marginBottom: '0.6rem'}}>
                            <div style={{height: '100%', borderRadius: 999, background: '#2563eb', width: `${st.tasksTotal > 0 ? Math.round((st.tasksDone / st.tasksTotal) * 100) : 0}%`, transition: 'width 0.3s'}} />
                         </div>

                         {st.tasksDone > 0 && (() => {
                            const rate = st.tasksOnTime / st.tasksDone;
                            let bg = '#fee2e2', color = '#b91c1c';
                            if (rate >= 0.8) { bg = '#d1fae5'; color = '#065f46'; }
                            else if (rate >= 0.5) { bg = '#fef3c7'; color = '#92400e'; }
                            return (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '0.25rem 0.55rem', borderRadius: 999,
                                    background: bg,
                                    fontSize: '0.75rem', fontWeight: 700, color: color
                                }}>
                                   <Target size={12} /> Đúng hạn: {st.tasksOnTime} / {st.tasksDone} ({Math.round(rate * 100)}%)
                                </div>
                            );
                         })()}

                         {st.tasksDoneList && st.tasksDoneList.length > 0 && (() => {
                            // Gom việc trùng tên (VD "Báo cáo công việc cuối ngày" x5) và chỉ hiện 5 dòng đầu
                            const counted = new Map();
                            st.tasksDoneList.forEach(t => counted.set(t, (counted.get(t) || 0) + 1));
                            const items = [...counted.entries()];
                            const shown = items.slice(0, 5);
                            const more = items.length - shown.length;
                            return (
                              <ul style={{margin: '0.6rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', background:'#fff', padding:'0.5rem 0.9rem 0.5rem 1.6rem', borderRadius: 8, border:'1px solid var(--border-color)'}}>
                                {shown.map(([t, n], idx) => (
                                  <li key={idx} style={{marginBottom:'0.25rem', lineHeight: '1.35'}}>
                                    {t}{n > 1 && <span style={{color: 'var(--text-tertiary)', fontWeight: 700}}> ×{n}</span>}
                                  </li>
                                ))}
                                {more > 0 && <li style={{listStyle: 'none', marginLeft: '-1.2rem', color: '#1d4ed8', fontWeight: 700, fontSize: '0.75rem'}}>+{more} việc khác</li>}
                              </ul>
                            );
                         })()}
                       </div>
                     )}
                     {st.prodQty > 0 && (
                       <div style={{padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border-color)', flex: 1}}>
                         <div style={{display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'0.5rem'}}>
                            <Package size={16} color="#059669"/>
                            <p style={{margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)'}}>Sản xuất</p>
                         </div>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem'}}>
                            <div style={{minWidth: 0}}>
                               <ul style={{margin: 0, padding: 0, listStyle: 'none', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600}}>
                                  {st.prodDetails.map((p, idx) => (
                                     <li key={idx} style={{marginBottom: 2}}>{p.code}: <span style={{fontWeight: 700}}>{Number(p.qty.toFixed(1))} SP</span></li>
                                  ))}
                               </ul>
                               <p style={{margin: '0.45rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Hiệu suất: <strong style={{color: 'var(--text-primary)'}}>{st.avgPerf ? Math.round(st.avgPerf) + '%' : 'N/A'}</strong></p>
                            </div>
                            <div style={{textAlign:'right', flexShrink: 0}}>
                              <p style={{margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600}}>Sản lượng</p>
                              <p style={{margin: 0, fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1}}>{Number(st.prodQty.toFixed(1))} <span style={{fontSize:'0.8rem', color: 'var(--text-secondary)', fontWeight: 600}}>SP</span></p>
                            </div>
                         </div>
                       </div>
                     )}
                  </div>
               </div>
             ))}
             {workReportData.length === 0 && (
                <div style={{padding: '3rem', textAlign: 'center', gridColumn: '1 / -1', color: '#94a3b8', background: '#fff', borderRadius: '12px'}}>
                   Không có hoạt động nào được ghi nhận trong khoảng thời gian này.
                </div>
             )}
          </div>
        </>
      )}

      {activeTab === 'ngoc' && renderPersonalTab('Ngọc')}
      {activeTab === 'phong' && renderPersonalTab('Phong')}

    </div>
  );
}
