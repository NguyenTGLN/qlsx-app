import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────
const norm = (val) => (val ? String(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '');
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

// Reusable Progress Bar Component
const ProgressBar = ({ label, val, total, color }) => {
  const p = pct(val, total);
  return (
    <div style={{ marginBottom: 'clamp(6px, 1.2vh, 12px)' }}>
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', 
        fontSize: 'clamp(11px, 1.4vh, 14px)', marginBottom: '4px', fontWeight: 500 
      }}>
        <span style={{ color: '#64748b' }}>{label}</span>
        <span style={{ fontWeight: 700, color: color }}>
          {val.toLocaleString('vi-VN')} <span style={{ fontSize: '0.85em', opacity: 0.8 }}>({p}%)</span>
        </span>
      </div>
      <div style={{ height: 'clamp(6px, 1.2vh, 10px)', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: '8px', transition: 'width 0.5s ease-out' }} />
      </div>
    </div>
  );
};

// Reusable Dashboard Card
const DashCard = ({ title, icon, total, color, children, pctText }) => (
  <div style={{
    background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
    borderTop: `4px solid ${color}`, padding: 'clamp(12px, 1.5vh, 20px)',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(10px, 1.5vh, 16px)' }}>
      <span style={{ fontSize: 'clamp(13px, 1.6vh, 16px)', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {icon} {title}
      </span>
      <span style={{ fontSize: 'clamp(20px, 3vh, 32px)', fontWeight: 800, color: color, lineHeight: 1 }}>
        {total.toLocaleString('vi-VN')}
      </span>
    </div>
    <div style={{ flex: 1 }}>
      {children}
    </div>
    {pctText && (
      <div style={{ textAlign: 'right', marginTop: 'auto', paddingTop: '8px', fontSize: 'clamp(11px, 1.4vh, 13px)', fontWeight: 700, color: color }}>
        {pctText}
      </div>
    )}
  </div>
);

// Reusable Top KTV Chart (Composed Bar + Line)
const TopKtvChart = ({ data, bar1Key, bar1Name, bar1Color, bar2Key, bar2Name, bar2Color, lineKey, lineName, lineColor }) => {
  // Format data for chart truncating name
  const chartData = data.map(d => ({
    ...d,
    shortName: d.name.split(' ').slice(-2).join(' ') // Only show last 2 words of name for space
  }));

  return (
    <div style={{ width: '100%', height: '360px', padding: '10px 10px 0 0' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 40, right: 20, bottom: 20, left: -20 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="shortName" 
            height={50}
            tick={{ fill: '#334155', fontSize: 10, fontWeight: 700 }} 
            angle={-25} 
            textAnchor="end" 
            tickLine={false} 
            axisLine={{ stroke: '#cbd5e1' }} 
          />
          
          {/* Main Y-Axis for bar values */}
          <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          
          {/* Secondary Y-Axis for percentage line */}
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '13px' }}
            cursor={{ fill: '#f8fafc' }}
            formatter={(value, name) => name === lineName ? `${value}%` : value}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          
          <Bar yAxisId="left" dataKey={bar1Key} name={bar1Name} fill={bar1Color} radius={[4, 4, 0, 0]} maxBarSize={32}>
            <LabelList dataKey={bar1Key} position="top" style={{ fontSize: '10px', fill: '#64748b', fontWeight: 600 }} />
          </Bar>
          <Bar yAxisId="left" dataKey={bar2Key} name={bar2Name} fill={bar2Color} radius={[4, 4, 0, 0]} maxBarSize={32}>
            <LabelList dataKey={bar2Key} position="top" style={{ fontSize: '11px', fill: bar2Color, fontWeight: 800 }} />
          </Bar>
          
          <Line yAxisId="right" type="monotone" dataKey={lineKey} name={lineName} stroke={lineColor} strokeWidth={3} dot={{ stroke: lineColor, strokeWidth: 2, r: 4, fill: '#fff' }} activeDot={{ r: 6 }}>
            <LabelList dataKey={lineKey} position="top" offset={10} style={{ fontSize: '11px', fill: lineColor, fontWeight: 800 }} formatter={(v) => `${v}%`} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};


const CskhDashboard = ({ donHangLapMoi, khaiBaoBH, thanhToanBH, confirmationLogs, dataLinks }) => {

  // 1. Datalinks (Sử dụng dataLinks)
  const statsDL = useMemo(() => {
    const data = dataLinks || [];
    const total = data.length;
    const sent = data.filter(r => {
      const s = r.status || '';
      return s === 'Đã gửi biên bản xác nhận';
    }).length;
    const cancel = data.filter(r => {
      const s = r.status || '';
      return s === 'Hủy';
    }).length;
    const pending = data.filter(r => {
      const s = r.status || '';
      return s !== 'Đã gửi biên bản xác nhận' && s !== 'Hủy';
    }).length;

    return { total, sent, pending, cancel };
  }, [dataLinks]);

  // 2. Khai báo BH
  const statsKB = useMemo(() => {
    const data = khaiBaoBH || [];
    const total = data.length;
    const sent = data.filter(r => {
      const s = r.trang_thai || '';
      return norm(s) === norm('đã gửi biên bản xác nhận') || norm(s) === norm('đã gửi biên bản');
    }).length;
    const paid = data.filter(r => r.payment_status === 'Đã thanh toán').length;
    const pending = total - sent;
    return { total, sent, paid, pending };
  }, [khaiBaoBH]);

  // 3. XN Nghiệm Thu (confirmationLogs)
  const statsXN = useMemo(() => {
    const data = confirmationLogs || [];
    const total = data.length;
    const done = data.filter(r => r.status === 'Đã hoàn thành xác nhận' || r.status === 'Đã hoàn thành').length;
    const kh = data.filter(r => r.status === 'KH chưa xác nhận').length;
    const ktv = data.filter(r => r.status === 'KTV chưa xác nhận').length;
    const paid = data.filter(r => r.payment_status === 'Đã thanh toán').length;
    const unpaid = data.filter(r => !r.payment_status || r.payment_status === 'Chưa thanh toán').length;
    return { total, done, kh, ktv, paid, unpaid };
  }, [confirmationLogs]);

  // 4. Thanh toán BH
  const statsTT = useMemo(() => {
    const data = thanhToanBH || [];
    const total = data.length;
    const paid = data.filter(r => r.payment_status === 'Đã thanh toán').length;
    const waiting = data.filter(r => r.payment_status === 'Đang chờ duyệt').length;
    const unpaid = total - paid - waiting;
    return { total, paid, waiting, unpaid };
  }, [thanhToanBH]);

  // Top KTV XN (confirmationLogs)
  const topKtvXN = useMemo(() => {
    const ktvMap = {};
    (confirmationLogs || []).forEach(r => {
      if (!r.ktv_name) return;
      const key = `${r.ktv_name}|${r.ktv_code || ''}`;
      if (!ktvMap[key]) ktvMap[key] = { name: r.ktv_name, code: r.ktv_code || '—', total: 0, done: 0, paid: 0 };
      ktvMap[key].total++;
      if (r.status === 'Đã hoàn thành xác nhận' || r.status === 'Đã hoàn thành') ktvMap[key].done++;
      if (r.payment_status === 'Đã thanh toán') ktvMap[key].paid++;
    });
    return Object.values(ktvMap)
      .map(k => ({ ...k, vals: [k.total, k.done, k.paid], rate: pct(k.done, k.total) }))
      .sort((a, b) => b.total - a.total || b.done - a.done)
      .slice(0, 12);
  }, [confirmationLogs]);

  // Top KTV TT BH (Dùng thanhToanBH)
  const topKtvTT = useMemo(() => {
    const ktvMap = {};
    (thanhToanBH || []).forEach(r => {
      if (!r.ktv_name) return;
      const key = `${r.ktv_name}|${r.ktv_code || ''}`;
      if (!ktvMap[key]) ktvMap[key] = { name: r.ktv_name, code: r.ktv_code || '—', total: 0, paid: 0, waiting: 0 };
      ktvMap[key].total++;
      if (r.payment_status === 'Đã thanh toán') ktvMap[key].paid++;
      if (r.payment_status === 'Đang chờ duyệt') ktvMap[key].waiting++;
    });
    return Object.values(ktvMap)
      .map(k => ({ ...k, vals: [k.total, k.paid, k.waiting], rate: pct(k.paid, k.total) }))
      .sort((a, b) => b.total - a.total || b.paid - a.paid)
      .slice(0, 12);
  }, [thanhToanBH]);

  return (
    <div style={{ width: '100%', margin: '0 auto', gap: '20px', display: 'flex', flexDirection: 'column' }}>
      
      {/* KHỐI TRÊN: 4 Thẻ KPI nằm trên 1 hàng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '16px' }}>
        
        {/* Card 1: Datalinks */}
        <DashCard title="Datalinks" icon="📋" total={statsDL.total} color="#3b82f6" pctText={`Hoàn thành: ${pct(statsDL.sent, statsDL.total)}%`}>
          <ProgressBar label="Đã gửi BB" val={statsDL.sent} total={statsDL.total} color="#10b981" />
          <ProgressBar label="Chờ xử lý" val={statsDL.pending} total={statsDL.total} color="#f59e0b" />
          <ProgressBar label="Đã hủy" val={statsDL.cancel} total={statsDL.total} color="#ef4444" />
        </DashCard>

        {/* Card 2: Khai báo BH */}
        <DashCard title="Khai Báo BH" icon="📝" total={statsKB.total} color="#8b5cf6" pctText={`Gửi BB: ${pct(statsKB.sent, statsKB.total)}%`}>
          <ProgressBar label="Đã gửi BB" val={statsKB.sent} total={statsKB.total} color="#10b981" />
          <ProgressBar label="Chờ xử lý" val={statsKB.pending} total={statsKB.total} color="#f59e0b" />
          <ProgressBar label="Đã TT" val={statsKB.paid} total={statsKB.total} color="#8b5cf6" />
        </DashCard>

        {/* Card 3: XN Nghiệm Thu */}
        <DashCard title="XN Nghiệm Thu" icon="✅" total={statsXN.total} color="#16a34a" pctText={`XN: ${pct(statsXN.done, statsXN.total)}% · TT: ${pct(statsXN.paid, statsXN.total)}%`}>
          <ProgressBar label="Hoàn thành" val={statsXN.done} total={statsXN.total} color="#16a34a" />
          <ProgressBar label="KH chưa XN" val={statsXN.kh} total={statsXN.total} color="#f59e0b" />
          <ProgressBar label="KTV chưa XN" val={statsXN.ktv} total={statsXN.total} color="#f97316" />
          <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: '12px', paddingTop: '12px' }}>
            <ProgressBar label="💳 Đã TT" val={statsXN.paid} total={statsXN.total} color="#8b5cf6" />
            <ProgressBar label="❌ Chưa TT" val={statsXN.unpaid} total={statsXN.total} color="#ef4444" />
          </div>
        </DashCard>

        {/* Card 4: Thanh toán BH */}
        <DashCard title="Thanh Toán BH" icon="💰" total={statsTT.total} color="#ef4444" pctText={`Đã TT: ${pct(statsTT.paid, statsTT.total)}%`}>
          <ProgressBar label="Đã TT" val={statsTT.paid} total={statsTT.total} color="#16a34a" />
          <ProgressBar label="Chờ duyệt" val={statsTT.waiting} total={statsTT.total} color="#f59e0b" />
          <ProgressBar label="Chưa TT" val={statsTT.unpaid} total={statsTT.total} color="#ef4444" />
        </DashCard>

      </div>

      {/* KHỐI DƯỚI: 2 Bảng Top KTV nằm cạnh nhau */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px', marginTop: '8px' }}>
        
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', borderTop: '4px solid #16a34a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', fontWeight: 700, fontSize: '15px', color: '#1e293b', borderBottom: '1px solid #f1f5f9' }}>
            🏆 Top KTV — Nghiệm Thu
          </div>
          <div style={{ flex: 1, minHeight: '360px' }}>
            <TopKtvChart 
              data={topKtvXN} 
              bar1Key="total" bar1Name="Tổng phiếu" bar1Color="#94a3b8"
              bar2Key="done" bar2Name="Hoàn thành" bar2Color="#16a34a"
              lineKey="rate" lineName="Tỷ lệ HT (%)" lineColor="#f59e0b"
            />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', borderTop: '4px solid #ef4444', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', fontWeight: 700, fontSize: '15px', color: '#1e293b', borderBottom: '1px solid #f1f5f9' }}>
            💰 Top KTV — Thanh Toán BH
          </div>
          <div style={{ flex: 1, minHeight: '360px' }}>
            <TopKtvChart 
              data={topKtvTT} 
              bar1Key="total" bar1Name="Tổng phiếu" bar1Color="#94a3b8"
              bar2Key="paid" bar2Name="Đã Thanh Toán" bar2Color="#3b82f6"
              lineKey="rate" lineName="Tỷ lệ TT (%)" lineColor="#ef4444"
            />
          </div>
        </div>

      </div>

    </div>
  );
};

export default CskhDashboard;
