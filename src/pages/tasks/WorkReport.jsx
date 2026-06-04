import React, { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { Calendar, Filter, Package, Users, ClipboardList, ShieldAlert, CheckCircle, Clock } from 'lucide-react';

export default function WorkReport() {
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'ngoc', 'phong'
  const [workReportFilter, setWorkReportFilter] = useState('week');
  const [workReportDates, setWorkReportDates] = useState({ start: '', end: '' });
  
  const [workReportData, setWorkReportData] = useState([]);
  const [workOverallStats, setWorkOverallStats] = useState({ prodQty: 0, tasksDone: 0, tasksTotal: 0, tasksOnTime: 0, activeStaff: 0, overallProductQty: {}, absentStaff: [] });
  
  const [allTasks, setAllTasks] = useState([]);
  const [allWarranties, setAllWarranties] = useState([]);
  const [staffMap, setStaffMap] = useState({});
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
         supabase.from('nhan_vien').select('id, name'),
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
      (nvData || []).forEach(n => { sMap[n.id] = n.name; });
      setStaffMap(sMap);
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
        name: nv.name, prodQty: 0, prodDetails: [], tasksDone: 0, tasksTotal: 0, prodPerf: [], tasksDoneList: [], tasksOnTime: 0
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
    reportToolbar: { display: 'flex', gap: '0.8rem', background: '#fff', padding: '1rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', flexWrap: 'wrap', alignItems: 'center' },
    dateSelect: { padding: '0.5rem 1.8rem 0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.85rem', color: '#1e293b', fontWeight: 600, minWidth: '150px' },
    dateInput: { padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#1e293b' },
    tabButton: (isActive) => ({ padding: '0.6rem 1.2rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#fff' : '#64748b', background: isActive ? '#3b82f6' : 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }),
    statCard: { background: '#fff', padding: '1.5rem', borderRadius: '16px', display: 'flex', alignItems: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', flex: '1 1 200px' },
    statIcon: (color) => ({ width: '48px', height: '48px', borderRadius: '12px', background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
    statTitle: { margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
    statValue: { margin: '0.2rem 0 0 0', fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 },
    tableTh: { padding: '0.8rem 1rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', borderBottom: '2px solid #f1f5f9' },
    tableTd: { padding: '0.8rem 1rem', fontSize: '0.75rem', color: '#334155', borderBottom: '1px solid #f1f5f9' }
  };

  const renderPersonalTab = (nameKeyword) => {
      const pData = getPersonalData(nameKeyword);

      return (
         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '1.5rem', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.05)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>Danh Sách Việc Đang Nhận / Đang Làm</h3>
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
                               let statusColor = '#3b82f6';
                               let bgAccent = '#eff6ff';

                               if (task.due_date) {
                                  let limit = new Date(task.due_date);
                                  if (!isNaN(limit.getTime())) {
                                     const formattedDate = limit.toLocaleDateString('vi-VN');
                                     const formattedTime = limit.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                                     limitDateStr = `${formattedTime} - ${formattedDate}`;
                                     
                                     const today = new Date(); today.setHours(0, 0, 0, 0); limit.setHours(0, 0, 0, 0);
                                     const diffDays = Math.floor((today.getTime() - limit.getTime()) / 86400000);
                                     
                                     if (diffDays > 0) {
                                        statusColor = '#ef4444'; bgAccent = '#fef2f2';
                                        statusNode = <span style={{ fontWeight: 800, fontSize: '0.7rem', color: '#fff', background: '#ef4444', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>QUÁ HẠN {diffDays} NGÀY</span>;
                                     } else if (diffDays === 0) {
                                        statusColor = '#f59e0b'; bgAccent = '#fffbeb';
                                        statusNode = <span style={{ fontWeight: 800, fontSize: '0.7rem', color: '#fff', background: '#f59e0b', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>HẠN HÔM NAY</span>;
                                     } else {
                                        statusColor = '#10b981'; bgAccent = '#ecfdf5';
                                        statusNode = <span style={{ fontWeight: 800, fontSize: '0.7rem', color: '#fff', background: '#10b981', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>CÒN {Math.abs(diffDays)} NGÀY</span>;
                                     }
                                  }
                               } else {
                                  statusNode = <span style={{ fontWeight: 800, fontSize: '0.7rem', color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: '12px', letterSpacing: '0.5px' }}>KHÔNG CÓ HẠN</span>;
                               }

                               const latestCmt = task.latest_update || task.latest_comment || task.comment || null;

                               return (
                                  <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                      <div style={{ background: bgAccent, borderBottom: `1px solid ${statusColor}20`, padding: '1rem 1.25rem 2.5rem 1.25rem', position: 'relative' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>{statusNode}</div>
                                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', lineHeight:'1.4', marginTop: '0.5rem' }}>{taskName}</div>
                                      </div>

                                      <div style={{ padding: '0 1.25rem 1.25rem 1.25rem', marginTop: '-1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.03)', marginBottom: '1rem', zIndex: 1, position: 'relative' }}>
                                              <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.65rem', fontWeight: 800, color: statusColor, textTransform: 'uppercase' }}>Tiến độ gần nhất</p>
                                              <p style={{ margin: 0, fontSize: '0.85rem', color: latestCmt ? '#334155' : '#94a3b8', fontWeight: latestCmt ? 600 : 400, fontStyle: latestCmt ? 'normal' : 'italic' }}>{latestCmt || 'Chưa cập nhật...'}</p>
                                          </div>
                                          
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                             <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Deadline</span>
                                             <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 800 }}>{limitDateStr}</span>
                                          </div>
                                      </div>
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   )}
                </div>

                {/* Warranties Table */}
                <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <ShieldAlert color="#f59e0b" size={20} />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>Danh sách Bảo Hành</h3>
                   </div>

                   {pData.warranties.length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic' }}>Không có phiếu bảo hành nào.</p>
                   ) : (
                      <div style={{ height: 'calc(100vh - 360px)', minHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingBottom: '1rem' }}>
                            {pData.warranties.map((w, idx) => {
                               const bgColors = ['#eff6ff', '#fdf2f8', '#fefce8', '#f0fdf4', '#faf5ff', '#fff7ed', '#f1f5f9'];
                               const borderColors = ['#bfdbfe', '#fbcfe8', '#fef08a', '#bbf7d0', '#e9d5ff', '#fed7aa', '#cbd5e1'];
                               const headerColors = ['#3b82f6', '#ec4899', '#eab308', '#22c55e', '#a855f7', '#f97316', '#64748b'];
                               const bg = bgColors[idx % bgColors.length];
                               const brd = borderColors[idx % borderColors.length];
                               const hdr = headerColors[idx % headerColors.length];
                               
                               const ageNode = (() => {
                                    if (w._age === undefined || w._age < 0) return <span style={{ fontWeight: 800, fontSize: '0.75rem', color: '#fff', background: 'rgba(0,0,0,0.2)', padding: '3px 8px', borderRadius: '12px' }}>N/A</span>;
                                    return <span style={{ fontWeight: 800, fontSize: '0.7rem', color: '#fff', background: '#3b82f6', padding: '4px 10px', borderRadius: '12px' }}>Qua {w._age} ngày</span>;
                                 })();

                                 const stRaw = w['trạng_thái_phiếu_ghi'] || w['trang_thai_phieu_ghi'] || w.status || w.trang_thai || '';
                               const stL = String(stRaw).toLowerCase();
                               const isCompleted = stL.includes('solved') || stL.includes('close');
                               const wStatusBadge = isCompleted 
                                 ? <span style={{fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: 800}}>HOÀN THÀNH</span>
                                 : <span style={{fontSize: '0.65rem', background: '#f59e0b', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: 800}}>ĐANG XỬ LÝ</span>;

                               return (
                                  <div key={idx} style={{ background: bg, border: `1px solid ${brd}`, borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', transition: 'all 0.2s' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: hdr, flex: 1, paddingRight: '0.5rem' }}>{w.mã_sản_phẩm || w.ma_san_pham || 'Không mã SP'}</div>
                                          <div>{ageNode}</div>
                                      </div>
                                      
                                      <div style={{ background: 'rgba(255,255,255,0.6)', padding: '0.75rem', borderRadius: '6px', minHeight: '50px', border: '1px solid rgba(0,0,0,0.03)' }}>
                                          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>CHI TIẾT LỖI:</p>
                                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#ef4444', fontWeight: 700, lineHeight: '1.3' }}>{w.chi_tiết_lỗi || w.chi_tiet_loi || '-'}</p>
                                      </div>
                                      
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.4rem' }}>
                                         <div style={{ display: 'flex', alignItems: 'center' }}>{wStatusBadge}</div>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                             <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Lắp đặt:</span>
                                             <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 800 }}>{w.ngày_lắp_đặt ? w.ngày_lắp_đặt.substring(0, 10) : 'N/A'}</span>
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

if (loading) return <div style={{padding: '2rem', textAlign: 'center'}}>Đang tải báo cáo...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f1f5f9', minHeight: '100vh', padding: '1rem' }}>
      
      {/* HEADER: Tabs & Tools */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
            <button style={styles.tabButton(activeTab === 'general')} onClick={() => setActiveTab('general')}>Tổng hợp Chung</button>
            <button style={styles.tabButton(activeTab === 'ngoc')} onClick={() => setActiveTab('ngoc')}>Báo cáo Ngọc</button>
            <button style={styles.tabButton(activeTab === 'phong')} onClick={() => setActiveTab('phong')}>Báo cáo Phong</button>
         </div>

         <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b'}}>
               <Filter size={16} />
               <span style={{fontWeight: 600, fontSize: '0.85rem'}}>Khoảng T.Gian (Bảo hành & SP):</span>
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
                  <span style={{color: '#94a3b8'}}>-</span>
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
            <div style={styles.statCard}>
              <div style={styles.statIcon('var(--success-color)')}><Package size={20} /></div>
              <div style={{ marginLeft: '1rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                 <div style={{flexShrink: 0}}>
                     <p style={styles.statTitle}>Sản Lượng SX</p>
                     <p style={{...styles.statValue, margin: '0.2rem 0 0 0'}}>{Number(workOverallStats.prodQty.toFixed(1))}</p>
                 </div>
                 {workOverallStats.overallProductQty && Object.keys(workOverallStats.overallProductQty).length > 0 && (
                    <div style={{display:'flex', gap:'0.4rem', flexWrap:'wrap', flex: 1, justifyContent: 'flex-end', marginLeft: '1rem', maxWidth: '66%'}}>
                       {Object.entries(workOverallStats.overallProductQty).map(([code, qty]) => (
                          <span key={code} style={{fontSize:'0.75rem', background:'#f1f5f9', padding:'0.3rem 0.6rem', borderRadius:'12px', color:'#475569', fontWeight:600, border:'1px solid #e2e8f0', whiteSpace: 'nowrap'}}>
                            {code}: <span style={{color:'#10b981'}}>{Number(qty.toFixed(1))}</span>
                          </span>
                       ))}
                    </div>
                 )}
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
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem'}}>
             {workReportData.map(st => (
               <div key={st.name} style={{background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', border: '1px solid #edf2f7'}}>
                  <div style={{background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '1rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap'}}>
                     <h3 style={{fontSize: '1.25rem', margin: 0, fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em'}}>{st.name}</h3>
                     <div style={{display: 'flex', gap: '0.4rem'}}>
                        {st.taskRank && (
                          <span title="Hạng chuẩn xác hạn Công việc" style={{background:'#f59e0b', color:'#fff', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:700, display:'flex', alignItems:'center', gap:'0.2rem', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
                             🎯 Top {st.taskRank}
                          </span>
                        )}
                        {st.perfRank && (
                          <span title="Hạng Hiệu suất Sản xuất" style={{background:'#10b981', color:'#fff', padding:'0.2rem 0.6rem', borderRadius:'20px', fontSize:'0.75rem', fontWeight:700, display:'flex', alignItems:'center', gap:'0.2rem', boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}>
                             ⚡ Top {st.perfRank}
                          </span>
                        )}
                     </div>
                  </div>
                  
                  <div style={{padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1}}>
                     {st.tasksTotal > 0 && (
                       <div style={{padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                         <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem'}}>
                            <ClipboardList size={18} color="#3b82f6"/>
                            <p style={{margin: 0, fontSize: '1rem', fontWeight:600, color: '#3b82f6'}}>Công Việc Nội Bộ</p>
                         </div>
                         <p style={{margin: '0.2rem 0', fontSize: '0.9rem', fontWeight: 600, color: st.tasksDone === st.tasksTotal ? '#10b981' : '#1e293b'}}>Hoàn thành: {st.tasksDone} / {st.tasksTotal}</p>
                         
                         {st.tasksDone > 0 && (() => {
                            const rate = st.tasksOnTime / st.tasksDone;
                            let bg = 'rgba(234, 67, 53, 0.1)', border = '#ef4444', color = '#ef4444';
                            if (rate >= 0.8) { bg = 'rgba(16, 185, 129, 0.1)'; border = '#10b981'; color = '#10b981'; }
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
                         
                         {st.tasksDoneList && st.tasksDoneList.length > 0 && (
                           <ul style={{margin: '0.5rem 0 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#64748b', maxHeight: '120px', overflowY: 'auto', background:'#fff', padding:'0.5rem 1rem', borderRadius:'6px', border:'1px solid #e2e8f0'}}>
                             {st.tasksDoneList.map((t, idx) => <li key={idx} style={{marginBottom:'0.3rem', lineHeight: '1.3'}}>{t}</li>)}
                           </ul>
                         )}
                       </div>
                     )}
                     {st.prodQty > 0 && (
                       <div style={{padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', flex: 1}}>
                         <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem'}}>
                            <Package size={18} color="#10b981"/>
                            <p style={{margin: 0, fontSize: '1rem', fontWeight:600, color: '#10b981'}}>Sản Xuất</p>
                         </div>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <div>
                               <p style={{margin: '0', fontSize: '0.85rem', color: '#64748b'}}>Thực hiện:</p>
                               <ul style={{margin: '0.2rem 0', padding: 0, listStyle: 'none', fontSize: '0.85rem', color: '#1e293b', fontWeight: 600}}>
                                  {st.prodDetails.map((p, idx) => (
                                     <li key={idx}>{p.code}: <span style={{color: '#10b981'}}>{Number(p.qty.toFixed(1))} SP</span></li>
                                  ))}
                               </ul>
                               <p style={{margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#64748b'}}>Hiệu suất: <strong style={{color:'#1e293b'}}>{st.avgPerf ? Math.round(st.avgPerf) + '%' : 'N/A'}</strong></p>
                            </div>
                            <div style={{textAlign:'right'}}>
                              <p style={{margin: 0, fontSize: '0.85rem', color: '#94a3b8'}}>Sản lượng</p>
                              <p style={{margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#10b981', lineHeight: 1}}>{Number(st.prodQty.toFixed(1))} <span style={{fontSize:'0.9rem'}}>SP</span></p>
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
