import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Clock, Users, PackageCheck, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTabPerm } from '../lib/AuthContext';
import { missingCapacities } from '../lib/capacityGuard';
import { newDocToken, claimDocToken, releaseDocToken } from '../lib/docGuard';

const WorkerInput = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();
  const order = location.state?.order || null;
  const p = useTabPerm('production', 'main');
  // Màn hình này là 1 form nhập liệu tạo báo cáo sản xuất → gate nút gửi bằng create|edit.
  const canSubmit = p.create || p.edit;

  const [actualQuantity, setActualQuantity] = useState('');
  const [executionDate, setExecutionDate] = useState(() => {
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  
  const [workersList, setWorkersList] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  
  const [performance, setPerformance] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [remainingQty, setRemainingQty] = useState(null);
  const [capacityOk, setCapacityOk] = useState(null); // null=đang tải | true | false
  const [capacityErr, setCapacityErr] = useState(false); // true khi KHÔNG kiểm tra được định mức (lỗi mạng/DB)
  const [dailyLogs, setDailyLogs] = useState([]);
  
  const [locationsData, setLocationsData] = useState([]);
  const [allLocations, setAllLocations] = useState([]);

  // Chống trùng: 1 token cho 1 lần gửi báo cáo (kèm PNK tự động) + cờ chặn bấm-kép tức thì.
  const reportTokenRef = useRef(null);
  const submittingRef = useRef(false);

  // Lấy data số lượng thực tế MỚI NHẤT
  useEffect(() => {
    if (order && order.id) {
       supabase.from('production_orders')
         .select('target_quantity, production_logs(actual_quantity)')
         .eq('id', order.id).single()
         .then(({data, error}) => {
             if (data && !error) {
                 const prod = (data.production_logs || []).reduce((sum,log)=>sum+parseFloat(log.actual_quantity||0), 0);
                 setRemainingQty(Math.floor(data.target_quantity - prod));
             }
         });
    }
  }, [order]);

  // Guard 100% định mức thật: chặn nhập tiến độ nếu mã SP chưa có định mức (tra LIVE product_capacities)
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    (async () => {
      let productCode = order.product_code;
      if (!productCode && order.id) {
        const { data } = await supabase.from('production_orders')
          .select('product_code').eq('id', order.id).maybeSingle();
        productCode = data?.product_code;
      }
      if (!productCode) { if (!cancelled) setCapacityOk(false); return; }
      const { data, error } = await supabase.from('product_capacities')
        .select('product_code, capacity_per_hour').eq('product_code', productCode).maybeSingle();
      if (cancelled) return;
      if (error) { setCapacityErr(true); return; } // không xác minh được → KHÔNG kết luận thiếu định mức; capacityOk giữ null (nút vẫn khoá)
      setCapacityErr(false);
      setCapacityOk(missingCapacities([productCode], data ? [data] : []).length === 0);
    })();
    return () => { cancelled = true; };
  }, [order]);

  // Lấy danh sách thợ
  useEffect(() => {
    const fetchWorkers = async () => {
      const { data } = await supabase.from('nhan_vien').select('id, name');
      if (data) setWorkersList(data);
    };
    fetchWorkers();
  }, []);

  // Lấy data logs của ngày để check trùng giờ
  useEffect(() => {
    const fetchDailyLogs = async () => {
      const { data } = await supabase.from('production_logs').select('worker_id, start_time, end_time, actual_quantity, production_orders(product_code)').eq('execution_date', executionDate);
      if (data) setDailyLogs(data);
    };
    fetchDailyLogs();
  }, [executionDate]);

  // Lấy danh sách vị trí kho và gợi ý vị trí hiện hành
  useEffect(() => {
    const fetchLocations = async () => {
      if (!order) return;
      // 1. Lấy toàn bộ vị trí cho dropdown
      const { data: allStock } = await supabase.from('inventory_stock').select('location');
      const uniqueLocs = [...new Set((allStock || []).map(d => d.location).filter(Boolean))].sort();
      if (!uniqueLocs.includes('Kho Chính')) uniqueLocs.unshift('Kho Chính');
      setAllLocations(uniqueLocs);

      // 2. Lấy các vị trí đang chứa sản phẩm này
      const { data: itemStock } = await supabase.from('inventory_stock')
        .select('id, location, quantity')
        .eq('item_code', order.product_code);
        
      if (itemStock && itemStock.length > 0) {
        // Loại bỏ các kho tạm SX9
        const validStock = itemStock.filter(s => !s.location.startsWith('SX9-'));
        if (validStock.length > 0) {
           setLocationsData(validStock.map(s => ({
             id: s.id,
             location: s.location || 'Kho Chính',
             currentQty: s.quantity || 0,
             addQty: '',
             isNew: false
           })));
           return;
        }
      }
      
      // Mặc định
      setLocationsData([{ id: null, location: 'Kho Chính', currentQty: 0, addQty: '', isNew: true }]);
    };
    fetchLocations();
  }, [order]);

  // Cập nhật actualQuantity khi có thay đổi ở các vị trí
  useEffect(() => {
    const total = locationsData.reduce((sum, loc) => sum + (parseFloat(loc.addQty) || 0), 0);
    setActualQuantity(total > 0 ? total.toString() : '');
  }, [locationsData]);

  // Tính số giờ thực tế, TỰ ĐỘNG TRỪ giờ ăn trưa 12:00 -> 13:00
  const calculateHours = (sTime, eTime) => {
    if (!sTime || !eTime) return 0;
    const [sh, sm] = sTime.split(':').map(Number);
    const [eh, em] = eTime.split(':').map(Number);
    
    const startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    
    if (endMins < startMins) endMins += 24 * 60; // Làm qua ngày hôm sau

    const lunchStart = 12 * 60; // 720
    const lunchEnd = 13 * 60;   // 780
    
    const totalMins = endMins - startMins;
    
    // Tính phần giao nhau với thời gian nghỉ trưa (overlap)
    let overlapMins = 0;
    
    // Bị trùng vào khoảng nghỉ trưa
    if (startMins < lunchEnd && endMins > lunchStart) {
        overlapMins += Math.max(0, Math.min(endMins, lunchEnd) - Math.max(startMins, lunchStart));
    }
    
    // Nếu endMins vắt sang ca qua canh khuya sang tới điểm trưa ngày mai (hiếm)
    if (endMins > 24 * 60) {
        const endDay2 = endMins - 24 * 60;
        if (endDay2 > lunchStart) {
             overlapMins += Math.max(0, Math.min(endDay2, lunchEnd) - lunchStart);
        }
    }
    
    let diffHrs = (totalMins - overlapMins) / 60;
    return diffHrs > 0 ? diffHrs : 0;
  };

  // Cập nhật hiệu suất (Performance %)
  useEffect(() => {
    if (!order) return;
    const timeHrs = calculateHours(startTime, endTime);
    setTotalTime(timeHrs);

    const qty = parseFloat(actualQuantity) || 0;
    const wCount = selectedWorkers.length;
    
    if (qty > 0 && timeHrs > 0 && wCount > 0 && order.standard_time_per_unit > 0) {
      // Mỗi người làm 1 phần 
      const qtyPerPerson = qty / wCount; 
      // (Số lượng/người / Thời gian/người) * Thời gian chuẩn 1 SP * 100
      const perf = (qtyPerPerson / timeHrs) * parseFloat(order.standard_time_per_unit) * 100;
      setPerformance(Math.round(perf));
    } else {
      setPerformance(0);
    }
  }, [actualQuantity, startTime, endTime, selectedWorkers, order]);

  const toggleWorker = (id) => {
    if (selectedWorkers.includes(id)) {
      setSelectedWorkers(selectedWorkers.filter(wId => wId !== id));
    } else {
      setSelectedWorkers([...selectedWorkers, id]);
    }
  };

  const isLoadingData = remainingQty === null;
  const isOverLimit = !isLoadingData && parseFloat(actualQuantity) > remainingQty;

  const timeToMins = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const getOverlappingWorkers = () => {
    const overlaps = [];
    const ns = timeToMins(startTime);
    const ne = timeToMins(endTime);
    
    if (ns >= ne) return overlaps;
    
    selectedWorkers.forEach(wId => {
      const wLogs = dailyLogs.filter(l => l.worker_id === wId && l.start_time && l.end_time);
      const wOverlaps = wLogs.filter(log => {
          const ls = timeToMins(log.start_time);
          const le = timeToMins(log.end_time);
          return ns < le && ne > ls;
      });
      if (wOverlaps.length > 0) {
          const workerName = workersList.find(w => w.id === wId)?.name || 'Unknown';
          const times = wOverlaps.map(o => {
              const code = o.production_orders?.product_code || 'N/A';
              const qty = Number(parseFloat(o.actual_quantity || 0).toFixed(1));
              return `${o.start_time} đến ${o.end_time} (Mã SP: ${code}, SL: ${qty})`;
          }).join(' và ');
          overlaps.push(`${workerName}: đã sản xuất từ ${times}`);
      }
    });
    return overlaps;
  };
  
  const overlappingWorkers = getOverlappingWorkers();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!order) return;
    if (capacityOk !== true) {
      alert('Sản phẩm này chưa có định mức năng lực — không thể nhập tiến độ.\nVui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức trước.');
      return;
    }
    if (isLoadingData) {
        alert("Đang kiểm tra dữ liệu máy chủ, vui lòng đợi...");
        return;
    }
    if (selectedWorkers.length === 0) {
        alert("Vui lòng tích chọn ít nhất 1 thành viên tham gia!");
        return;
    }
    if (totalTime <= 0) {
        alert("Khoảng thời gian không hợp lệ!");
        return;
    }
    if (isOverLimit) {
        alert(`Tổng số lượng nhập (${actualQuantity}) vượt quá chỉ tiêu còn lại (${remainingQty})! Hãy nhập số nhỏ hơn hoặc bằng.`);
        return;
    }
    const validLocations = locationsData.filter(loc => parseFloat(loc.addQty) > 0);
    if (validLocations.length === 0) {
        alert('Vui lòng nhập số lượng vào ít nhất 1 vị trí kho!');
        return;
    }
    // Cho gõ vị trí tự do → bắt buộc không để trống & không trùng nhau
    if (validLocations.some(loc => !String(loc.location || '').trim())) {
        alert('Có dòng đã nhập số lượng nhưng chưa nhập VỊ TRÍ. Vui lòng nhập vị trí kho!');
        return;
    }
    const locKeys = validLocations.map(loc => String(loc.location).trim().toLowerCase());
    if (new Set(locKeys).size !== locKeys.length) {
        alert('Có vị trí bị trùng nhau. Mỗi vị trí chỉ nhập 1 dòng!');
        return;
    }

    if (overlappingWorkers.length > 0) {
        const confirm = window.confirm(`CẢNH BÁO TRÙNG GIỜ!\n\n${overlappingWorkers.join('\n')}\n\nBạn có CHẮC CHẮN muốn tiếp tục lưu báo cáo này không? (Có thể dẫn đến sai số thời gian)`);
        if (!confirm) return;
    }
    
    // Chặn bấm-kép tức thì (đồng bộ) trước khi state submitting kịp khóa nút.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);

    // CHỐT CHỐNG TRÙNG: chiếm token TRƯỚC khi ghi báo cáo & tạo phiếu nhập kho tự động.
    // Gửi lại / bấm kép / nhiều tab → token đã dùng → dừng, không tạo báo cáo & phiếu trùng.
    if (!reportTokenRef.current) reportTokenRef.current = newDocToken();
    try {
      const userForGuard = workersList.find(w => w.id === selectedWorkers[0])?.name || 'Công nhân';
      const claim = await claimDocToken(reportTokenRef.current, { orderCode: order.order_code, kind: 'worker_import', createdBy: userForGuard });
      if (!claim.ok) {
        alert('Báo cáo này đã được gửi rồi' + (claim.orderCode ? ` (phiếu ${claim.orderCode})` : '') + '. Không tạo trùng.');
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
    } catch (guardErr) {
      console.error(guardErr);
      alert('Lỗi kiểm tra chống trùng: ' + guardErr.message);
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    try {
      const qtyPerPerson = parseFloat(actualQuantity) / selectedWorkers.length;

      // Chuẩn bị mảng để Insert hàng loạt cho từng thợ
      const logsToInsert = selectedWorkers.map(wId => ({
          order_id: order.id,
          worker_id: wId,
          start_time: startTime,
          end_time: endTime,
          actual_quantity: qtyPerPerson,
          actual_time_spent: totalTime,
          workers_count: 1, 
          performance_rate: performance,
          execution_date: executionDate
      }));

      const { error } = await supabase.from('production_logs').insert(logsToInsert);

      if (error) throw error;
      
      // ==========================================
      // AUTOMATED IMPORT (NHẬP KHO THÀNH PHẨM TỰ ĐỘNG)
      // ==========================================
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const dateCode = todayStr.replace(/-/g, '');
        const qtyToImport = parseFloat(actualQuantity);

        // 1. Generate Order Code (PNK-...)
        const { data: latestOrder } = await supabase.from('inventory_picking_logs')
          .select('order_code')
          .like('order_code', `PNK-${dateCode}-%`)
          .order('order_code', { ascending: false })
          .limit(1);

        let seq = 1;
        if (latestOrder && latestOrder.length > 0) {
          const lastCode = latestOrder[0].order_code;
          const lastSeq = parseInt(lastCode.split('-').pop(), 10);
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const importOrderCode = `PNK-${dateCode}-${seq.toString().padStart(2, '0')}`;

        const { data: prodData } = await supabase.from('bom_items').select('product_name').eq('product_code', order.product_code).limit(1);
        const pName = prodData && prodData[0] ? prodData[0].product_name : `Thành phẩm ${order.product_code}`;

        // Deduct from WIP stock (Chỉ trừ 1 lần tổng)
        const wipLocation = `SX9-${order.order_code}`;
        const { data: wipStock } = await supabase.from('inventory_stock')
          .select('id, quantity')
          .eq('item_code', order.product_code)
          .eq('location', wipLocation)
          .maybeSingle();
          
        if (wipStock) {
          await supabase.from('inventory_stock').update({ quantity: wipStock.quantity - qtyToImport }).eq('id', wipStock.id);
        }

        const userStr = workersList.find(w => w.id === selectedWorkers[0])?.name || 'Công nhân';

        // Lặp qua từng vị trí có nhập số lượng
        for (let i = 0; i < validLocations.length; i++) {
          const loc = validLocations[i];
          const qty = parseFloat(loc.addQty);
          const locName = String(loc.location).trim();

          // Find existing main stock
          const { data: mainStock } = await supabase.from('inventory_stock')
            .select('id, quantity')
            .eq('item_code', order.product_code)
            .eq('location', locName)
            .maybeSingle();

          let beforeQty = 0;
          if (mainStock) {
            beforeQty = mainStock.quantity;
            await supabase.from('inventory_stock').update({ quantity: beforeQty + qty }).eq('id', mainStock.id);
          } else {
            await supabase.from('inventory_stock').insert({
              item_code: order.product_code,
              item_name: pName,
              unit: 'Bộ',
              location: locName,
              quantity: qty,
              import_date: todayStr
            });
          }

          // 3. Insert Picking Log
          await supabase.from('inventory_picking_logs').insert({
            order_code: importOrderCode,
            product_code: 'NHAP_KHO',
            component_code: order.product_code,
            component_name: pName,
            location: locName,
            quantity_before: beforeQty,
            quantity_taken: qty,
            quantity_after: beforeQty + qty,
            created_by: userStr,
            notes: `Nhập tự động từ báo cáo SX - ${order.order_code}`,
            is_printed: false // Chưa in
          });

          // 4. Insert du lieu nhap
          await supabase.from('du_lieu_nhap').insert({
            ngay_nhap: todayStr,
            ma_hang: order.product_code,
            ten_hang: pName,
            so_luong_nhap: qty,
            ma_ncc: order.order_code,
            kho_nhap: locName,
            ly_do_nhap: 'Nhập thành phẩm'
          });
        }

        alert(`Đã lưu báo cáo thành công (Hiệu suất ${performance}%)!\nHệ thống cũng đã tự động nhập kho và tạo phiếu: ${importOrderCode} (Chờ In).`);
      } catch (importErr) {
        console.error("Lỗi tự động nhập kho:", importErr);
        alert(`Đã lưu báo cáo nhưng có lỗi khi tự động nhập kho: ${importErr.message}`);
      }
      
      navigate('/worker');
      
    } catch (err) {
      console.error('Lỗi lưu log:', err);
      // Thất bại khi ghi báo cáo → nhả token để gửi lại được.
      await releaseDocToken(reportTokenRef.current);
      reportTokenRef.current = newDocToken();
      alert('Không thể lưu nhật ký. Lỗi chi tiết: ' + err.message + '\n\n Nếu lỗi báo "violates foreign key constraint", bạn cần gỡ liên kết cột worker_id trên Supabase.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!order) return <div style={{padding: '2rem'}}>Lệnh không có sẵn, quay lại!</div>;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </button>
        <h2 style={{ fontSize: '1.1rem', color: '#fff', marginLeft: '0.5rem' }}>Báo Cáo Tiến Độ (Nhóm)</h2>
      </header>

      <div style={styles.infoBanner}>
        <div style={styles.badge}>
          Mã SP: <strong style={{ color: 'var(--primary-color)', fontSize: '1rem' }}>{order.product_code}</strong>
          <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px'}}>
            Định Mức: <strong>{parseFloat(order.standard_time_per_unit).toFixed(4)} Giờ/1 SP</strong>
          </div>
        </div>
      </div>

      {capacityErr ? (
        <div style={{ margin: '1rem', padding: '0.75rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', color: '#92400e', fontWeight: 600, fontSize: '0.85rem' }}>
          ⚠️ Không kiểm tra được định mức (lỗi kết nối). Vui lòng tải lại trang rồi thử lại.
        </div>
      ) : capacityOk === false && (
        <div style={{ margin: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#991b1b', fontWeight: 600, fontSize: '0.85rem' }}>
          ⛔ Sản phẩm <strong>{order.product_code}</strong> chưa có định mức năng lực — không thể nhập tiến độ. Vui lòng nạp định mức ở Tổng Quan Sản Xuất → Định Mức.
        </div>
      )}

      <main style={styles.main}>
        <form onSubmit={handleSubmit} style={styles.formCard} className="glass-panel">
          
          <div style={styles.inputGroup}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'0.5rem', flexWrap:'wrap', gap:'4px'}}>
               <label className="form-label" style={{...styles.label, marginBottom:0}}>Tổng Sản lượng TỔ đã làm</label>
               {remainingQty !== null && (
                  <span style={{fontSize:'0.75rem', fontWeight:600, color: remainingQty > 0 ? 'var(--primary-color)' : 'var(--danger-color)'}}>
                     {remainingQty > 0 ? `(Cần làm: ${remainingQty})` : `(Đã Hoàn Thành)`}
                  </span>
               )}
            </div>
            <div style={styles.inputWrapper}>
              <PackageCheck size={18} style={{...styles.inputIcon, color: isOverLimit ? 'var(--danger-color)' : 'var(--primary-color)'}} />
              <input 
                type="number" 
                className="form-control" 
                style={{...styles.bigInput, borderColor: isOverLimit ? 'var(--danger-color)' : '#e2e8f0', color: isOverLimit ? 'var(--danger-color)' : 'var(--primary-color)', background: '#f8fafc', cursor: 'not-allowed'}}
                placeholder="0"
                value={actualQuantity}
                readOnly
              />
            </div>
            {isOverLimit && <span style={{color:'var(--danger-color)', fontSize:'0.75rem', marginTop:'0.5rem', fontWeight:600}}>⚠️ Vượt quá số lượng còn lại!</span>}
          </div>

          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
             <label className="form-label" style={{...styles.label, color: 'var(--primary-color)'}}>📍 Khai báo Vị trí & Số lượng nhập kho</label>
             {/* Gợi ý vị trí đã có — vẫn cho phép gõ vị trí MỚI */}
             <datalist id="worker-loc-list">
                {allLocations.map(l => <option key={l} value={l} />)}
             </datalist>
             <div style={{marginBottom:'0.5rem'}}>
                {locationsData.map((loc, idx) => (
                   <div key={idx} style={{display:'flex', alignItems:'center', gap:'0.25rem', marginBottom:'0.5rem'}}>
                      {loc.isNew ? (
                        <input
                           type="text"
                           list="worker-loc-list"
                           className="form-control"
                           placeholder="Gõ vị trí mới hoặc chọn..."
                           style={{...styles.input, flex: 1, fontSize:'0.8rem', padding:'0.5rem'}}
                           value={loc.location}
                           onChange={(e) => {
                             const newData = [...locationsData];
                             newData[idx].location = e.target.value;
                             setLocationsData(newData);
                           }}
                        />
                      ) : (
                        <div style={{flex: 1, padding: '0.5rem 0.5rem', background: '#e2e8f0', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#334155', border: '1px solid #cbd5e1', display:'flex', justifyContent:'space-between', alignItems:'center', minWidth:0}}>
                          <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:4}}>{loc.location}</span>
                          <span style={{fontWeight: 400, color: '#64748b', fontSize: '0.7rem', flexShrink:0}}>Tồn: {loc.currentQty}</span>
                        </div>
                      )}
                      
                      <input
                        type="number"
                        placeholder="Nhập (+)"
                        className="form-control"
                        style={{...styles.input, width: '80px', flexShrink: 0, padding:'0.5rem', textAlign: 'center', borderColor: loc.addQty ? 'var(--primary-color)' : '#e2e8f0', color: 'var(--primary-color)', fontWeight: 'bold'}}
                        value={loc.addQty}
                        onChange={(e) => {
                          const newData = [...locationsData];
                          newData[idx].addQty = e.target.value;
                          setLocationsData(newData);
                        }}
                        min="0"
                      />
                      {loc.isNew && (
                        <button type="button" onClick={() => {
                           setLocationsData(locationsData.filter((_, i) => i !== idx));
                        }} style={{background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'var(--danger-color)', cursor:'pointer', width:38, height:38, flexShrink:0, fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center'}}>
                          ✕
                        </button>
                      )}
                   </div>
                ))}
             </div>
             
             <button type="button" onClick={() => {
                setLocationsData([...locationsData, { id: null, location: '', currentQty: 0, addQty: '', isNew: true }]);
             }} style={{background:'none', border:'none', color:'var(--primary-color)', fontSize:'0.8rem', fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'0.25rem'}}>
                + Thêm vị trí khác
             </button>
             
             <div style={{fontSize: '0.7rem', color: '#94a3b8', marginTop:'0.5rem'}}>
               * Điền số lượng vào các ô "Nhập (+)". Tổng Sản lượng sẽ tự động cộng dồn.
             </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <label className="form-label" style={styles.label}>Ngày & Khung Giờ Thực Hiện</label>
              
              <div style={{marginBottom: '0.5rem'}}>
                 <label style={{fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem'}}>Ngày báo cáo:</label>
                 <input type="date" className="form-control" style={styles.input} value={executionDate} onChange={(e) => setExecutionDate(e.target.value)} required />
              </div>

              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={{fontSize: '0.75rem', color: 'var(--text-tertiary)'}}>Từ giờ:</label>
                  <input type="time" className="form-control" style={styles.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </div>
                <div style={styles.inputGroup}>
                  <label style={{fontSize: '0.75rem', color: 'var(--text-tertiary)'}}>Đến giờ:</label>
                  <input type="time" className="form-control" style={styles.input} value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                </div>
              </div>
              <div style={{display: 'flex', gap: '0.5rem', background: '#fffbeb', padding: '0.5rem', borderRadius: '8px', marginTop: '0.5rem', alignItems:'center'}}>
                 <Info size={14} color="var(--warning-color)" style={{flexShrink:0}}/> 
                 <span style={{fontSize: '0.7rem', color: '#b45309'}}>Tự động trừ 1h nghỉ trưa (12:00-13:00) nếu trùng lấp.</span>
              </div>
              <div style={{textAlign: 'right', fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '0.5rem'}}>
                  Tổng cộng: <span style={{color: 'var(--primary-color)'}}>{totalTime.toFixed(2)} Tiếng</span>
              </div>
          </div>

          <div>
             <label className="form-label" style={styles.label}>Nhân Sự Tham Gia ({selectedWorkers.length})</label>
             <div style={styles.workerGrid}>
                 {workersList.map(w => {
                     const isSel = selectedWorkers.includes(w.id);
                     return (
                         <div 
                           key={w.id} 
                           onClick={() => toggleWorker(w.id)}
                           style={{...styles.workerPill, background: isSel ? 'var(--primary-light)' : '#f1f5f9', border: isSel ? '1px solid var(--primary-color)' : '1px solid transparent'}}
                         >
                            <Users size={14} color={isSel ? 'var(--primary-color)' : '#64748b'} />
                            <span style={{fontSize:'0.75rem', fontWeight:isSel?700:500, color:isSel?'var(--primary-color)':'var(--text-secondary)'}}>
                                {w.name}
                            </span>
                         </div>
                     )
                 })}
             </div>
             {overlappingWorkers.length > 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid var(--danger-color)', borderRadius: '8px' }}>
                   <p style={{ margin: 0, fontWeight: 600, color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize:'0.85rem' }}>
                      <Info size={16} /> Bị trùng thời gian!
                   </p>
                   <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1rem', color: 'var(--danger-color)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      {overlappingWorkers.map((msg, i) => <li key={i}>{msg}</li>)}
                   </ul>
                </div>
             )}
          </div>

          <div style={styles.performanceBox(performance)}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', marginBottom: '0.1rem', color: 'inherit', opacity: 0.9 }}>Hiệu suất trung bình / Người</p>
              <h1 style={{ fontSize: '2.5rem', margin: 0, fontWeight: '800' }}>
                {performance}%
              </h1>
              {selectedWorkers.length > 0 && <p style={{ fontSize: '0.75rem', fontWeight: 600, marginTop:'0.25rem', opacity: 0.9 }}>Khoán: ~{((parseFloat(actualQuantity)||0)/selectedWorkers.length).toFixed(1)} cái/người</p>}
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '0.5rem', background: (!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? '#cbd5e1' : 'var(--accent-gradient)', border: 'none', cursor: (!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)) ? 'not-allowed' : 'pointer' }}
            disabled={!canSubmit || capacityOk !== true || submitting || isOverLimit || isLoadingData || (remainingQty !== null && remainingQty <= 0)}
          >
            {!canSubmit ? 'Bạn không có quyền gửi báo cáo' : (
              capacityErr ? 'Không kiểm tra được định mức' : (
              capacityOk === null ? 'Đang kiểm tra định mức...' : (
              capacityOk === false ? 'Chưa có định mức — không thể gửi' : (
              submitting ? 'Đang gửi...' : (
                isLoadingData ? 'Đang tải...' : (
                   remainingQty !== null && remainingQty <= 0 ? 'Lệnh hoàn thành' : `Phân Bổ & Gửi`
                )
              )))))
            }
          </button>
        </form>
      </main>
    </div>
  );
};

const styles = {
  container: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' },
  header: { background: 'var(--primary-color)', padding: '1rem', display: 'flex', alignItems: 'center' },
  backBtn: { padding: '0.5rem', marginLeft: '-0.5rem', display: 'flex', alignItems: 'center', background:'transparent', border:'none', cursor:'pointer' },
  infoBanner: { background: 'var(--primary-color)', padding: '0 1rem 1.5rem 1rem', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', boxShadow: 'var(--shadow-md)' },
  badge: { background: '#fff', padding: '0.5rem 0.75rem', borderRadius: '12px', display: 'inline-block', boxShadow: 'var(--shadow-sm)', color: 'var(--text-secondary)', width: '100%', boxSizing: 'border-box' },
  main: { padding: '1rem', marginTop: '-1.5rem', paddingBottom: '3rem' },
  formCard: { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', flex: 1, minWidth:0 },
  row: { display: 'flex', gap: '0.5rem', marginBottom:'0.5rem', flexWrap:'wrap' },
  label: { fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom:'0.25rem', display:'block' },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: '0.75rem', color: 'var(--primary-color)' },
  input: { paddingLeft: '0.5rem', height: '2.5rem', fontWeight: '600', fontSize: '0.9rem', boxSizing: 'border-box' },
  bigInput: { paddingLeft: '2.5rem', height: '3rem', fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary-color)', textAlign:'center', boxSizing: 'border-box' },
  
  workerGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' },
  workerPill: { padding: '0.4rem 0.75rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', transition: 'all 0.1s ease', userSelect: 'none' },

  performanceBox: (perf) => {
    let bg = 'var(--bg-primary)';
    let color = 'var(--text-secondary)';
    
    if (perf > 0) {
      if (perf < 80) { bg = '#fef2f2'; color = 'var(--danger-color)'; }
      else if (perf < 100) { bg = '#fffbeb'; color = 'var(--warning-color)'; }
      else { bg = '#ecfdf5'; color = 'var(--success-color)'; }
    }

    return {
      marginTop: '0.5rem', padding: '1rem', borderRadius: '16px', background: bg, color: color,
      border: `2px solid ${perf > 0 ? color : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease',
    };
  }
};

export default WorkerInput;
