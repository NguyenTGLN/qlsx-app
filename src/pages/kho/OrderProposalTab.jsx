import React, { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Loader2, RefreshCw, Download, Trash2, XCircle, ShoppingCart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import { computeNeededDates } from '../../lib/dksxEngine';

const TIEN_DO_OPTIONS = ['Mới','Chờ duyệt','Đã đặt','Đang vận chuyển','Đã về kho'];
// Mỗi tiến độ một màu riêng (dùng cho dropdown + bộ lọc)
const TIEN_DO_COLORS = {
  'Mới':             { bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' },
  'Chờ duyệt':       { bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  'Đã đặt':          { bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  'Đang vận chuyển': { bg:'#eef2ff', color:'#6366f1', border:'#c7d2fe' },
  'Đã về kho':       { bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
};

// 5 mức khẩn cấp theo số ngày còn lại đến "ngày cần về kho"
const URGENCY_CFG = [
  { max: 7,        label:'🔴 Cực gấp',  bg:'#fef2f2', color:'#dc2626', border:'#fca5a5' },
  { max: 15,       label:'🟠 Gấp',      bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  { max: 30,       label:'🟡 Cảnh báo', bg:'#fefce8', color:'#ca8a04', border:'#fde047' },
  { max: 45,       label:'🔵 Theo dõi', bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  { max: Infinity, label:'🟢 Thư thả',  bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
];
function urgencyOf(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null;
  const cfg = URGENCY_CFG.find(c => daysLeft < c.max) || URGENCY_CFG[URGENCY_CFG.length - 1];
  return daysLeft < 0 ? { ...cfg, label: '🔴 Quá hạn' } : cfg;
}

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569' },
  input: { padding:'0.25rem 0.4rem',border:'1px solid #e2e8f0',borderRadius:6,fontSize:'0.75rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

export default function OrderProposalTab({ navigateTo, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'all' | 'done'
  const [filterTienDo, setFilterTienDo] = useState('all'); // 'all' | một giá trị trong TIEN_DO_OPTIONS
  const [sortCol, setSortCol] = useState(null); // cột đang sắp xếp (null = giữ thứ tự gốc)
  const [sortAsc, setSortAsc] = useState(true);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      // Lấy tất cả đề xuất DLK
      const { data: proposals, error } = await db.from('purchase_proposals')
        .select('*')
        .order('dlk_code', { ascending: false });
      if (error) throw error;

      // Tổng nhập về theo dlk_code (từ du_lieu_nhap)
      const { data: nhapData } = await db.from('du_lieu_nhap')
        .select('dlk_code, so_luong_nhap')
        .not('dlk_code', 'is', null);
      const nhapMap = {};
      (nhapData || []).forEach(r => {
        if (r.dlk_code) nhapMap[r.dlk_code] = (nhapMap[r.dlk_code] || 0) + (Number(r.so_luong_nhap) || 0);
      });

      // Tính trang_thai tự động từ so_luong_nhap
      const today = todayLocal();
      let formatted = (proposals || []).map(p => {
        const received = nhapMap[p.dlk_code] || 0;
        let auto_trang_thai = p.trang_thai || 'Mới';
        if (received >= (Number(p.actual_qty) || 0) && received > 0) {
          auto_trang_thai = 'Đã về kho đủ';
        } else if (received > 0 && received < (Number(p.actual_qty) || 0)) {
          auto_trang_thai = 'Đã về kho thiếu';
        }
        // Tính days_remaining từ ngay_du_kien nếu có
        let days_remaining = null;
        if (p.ngay_du_kien) {
          const diff = Math.ceil((new Date(p.ngay_du_kien) - new Date(today)) / 86400000);
          days_remaining = diff;
        }
        return { ...p, received, auto_trang_thai, days_remaining };
      });

      // Filter
      if (filterStatus === 'active') {
        formatted = formatted.filter(r => !['Đã về kho đủ','Hủy'].includes(r.auto_trang_thai));
      } else if (filterStatus === 'done') {
        formatted = formatted.filter(r => ['Đã về kho đủ','Đã về kho thiếu','Hủy'].includes(r.auto_trang_thai));
      }

      // Ngày cần về kho + số ngày còn lại (tính realtime)
      const needed = await computeNeededDates();
      formatted = formatted.map(r => {
        const nd = needed[r.item_code];
        return { ...r, needed_ts: nd ? nd.neededTs : null, days_left: nd ? nd.daysLeft : null };
      });

      setRows(formatted);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải đề xuất: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const handleSaveRow = async (row) => {
    setSaving(true);
    try {
      const { error } = await db.from('purchase_proposals').update({
        actual_qty: Number(row.actual_qty) || 0,
        ngay_du_kien: row.ngay_du_kien || null,
        tien_do: row.tien_do,
        trang_thai: row.auto_trang_thai,
        note: row.note || '',
      }).eq('id', row.id);
      if (error) throw error;
    } catch (e) {
      alert('Lỗi lưu: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRow = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleCancel = async (row) => {
    if (!window.confirm(`Hủy đề xuất ${row.dlk_code}?`)) return;
    await db.from('purchase_proposals').update({ trang_thai:'Hủy', auto_trang_thai:'Hủy' }).eq('id', row.id);
    fetchProposals();
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Xóa vĩnh viễn đề xuất ${row.dlk_code}?`)) return;
    await db.from('purchase_proposals').delete().eq('id', row.id);
    fetchProposals();
  };

  const handleNhapMuaVao = (row) => {
    if (navigateTo) navigateTo('nhap-kho', { dlk: { dlk_code: row.dlk_code, item_code: row.item_code, item_name: row.item_name, qty: row.actual_qty, unit: row.unit } });
  };

  const handleExport = () => {
    const data = rows.map((r, i) => ({
      'STT': i + 1,
      'Mã DLK': r.dlk_code,
      'Mã HH': r.item_code,
      'Tên hàng hóa': r.item_name,
      'ĐVT': r.unit,
      'Ngày đề xuất': r.ngay_de_xuat,
      'Ngày dự kiến về': r.ngay_du_kien,
      'SL đề xuất TT': r.calculated_qty,
      'SL thực đặt': r.actual_qty,
      'SL đã nhập về': r.received,
      'Tiến độ': r.tien_do,
      'Trạng thái': r.auto_trang_thai,
      'Ghi chú': r.note,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{wch:5},{wch:16},{wch:14},{wch:36},{wch:7},{wch:13},{wch:14},{wch:12},{wch:12},{wch:12},{wch:18},{wch:20},{wch:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DLK_de_xuat');
    XLSX.writeFile(wb, `DLK_de_xuat_${todayLocal()}.xlsx`);
  };

  const countActive = rows.filter(r => !['Đã về kho đủ','Hủy'].includes(r.auto_trang_thai)).length;

  // Lọc thêm theo tiến độ (client-side, áp lên trên bộ lọc trạng thái)
  const filteredRows = filterTienDo === 'all' ? rows : rows.filter(r => (r.tien_do || 'Mới') === filterTienDo);
  const tienDoCounts = rows.reduce((acc, r) => { const k = r.tien_do || 'Mới'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  // Sắp xếp khi bấm tiêu đề cột (null/'' luôn xuống cuối)
  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  };
  const sortInd = (col) => (sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ' ⇅');
  const sortVal = (r, col) => {
    switch (col) {
      case 'urgency': return r.days_left;
      case 'needed_ts': return r.needed_ts;
      case 'calculated_qty': return Number(r.calculated_qty) || 0;
      case 'actual_qty': return Number(r.actual_qty) || 0;
      case 'received': return Number(r.received) || 0;
      default: return r[col];
    }
  };
  const visibleRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        let va = sortVal(a, sortCol), vb = sortVal(b, sortCol);
        const na = va === null || va === undefined || va === '';
        const nb = vb === null || vb === undefined || vb === '';
        if (na && nb) return 0;
        if (na) return 1;   // thiếu giá trị → cuối bảng
        if (nb) return -1;
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      })
    : filteredRows;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Toolbar */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <span style={{fontSize:'0.8rem',fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>Theo dõi đặt hàng DLK</span>
        <div style={{display:'flex',gap:4,marginLeft:8}}>
          {[['active','Đang mở'],['all','Tất cả'],['done','Hoàn tất/Hủy']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)} style={{...s.btn,background:filterStatus===v?'#7c3aed':'#f8fafc',color:filterStatus===v?'#fff':'#475569',border:'none',padding:'0.25rem 0.6rem',fontSize:'0.72rem'}}>
              {l}{v==='active'&&countActive>0?` (${countActive})`:''}
            </button>
          ))}
        </div>
        <div style={{width:1,height:20,background:'#e2e8f0',flexShrink:0}}/>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{fontSize:'0.7rem',fontWeight:700,color:'#94a3b8',whiteSpace:'nowrap'}}>Tiến độ:</span>
          {(() => {
            const active = filterTienDo==='all';
            return (
              <button onClick={()=>setFilterTienDo('all')} style={{...s.btn,padding:'0.2rem 0.55rem',fontSize:'0.7rem',border:'none',background:active?'#334155':'#f1f5f9',color:active?'#fff':'#475569'}}>
                Tất cả
              </button>
            );
          })()}
          {TIEN_DO_OPTIONS.map(o => {
            const c = TIEN_DO_COLORS[o];
            const active = filterTienDo===o;
            return (
              <button key={o} onClick={()=>setFilterTienDo(active?'all':o)} style={{...s.btn,padding:'0.2rem 0.55rem',fontSize:'0.7rem',whiteSpace:'nowrap',background:active?c.color:c.bg,color:active?'#fff':c.color,border:`1px solid ${c.border}`,fontWeight:700}}>
                {o}{tienDoCounts[o]?` (${tienDoCounts[o]})`:''}
              </button>
            );
          })}
        </div>
        <button onClick={fetchProposals} disabled={loading} style={{...s.btn,padding:'0.4rem',marginLeft:'auto',flexShrink:0}}>
          <RefreshCw size={15} style={{animation:loading?'spin 1s linear infinite':'none',color:'#7c3aed'}}/>
        </button>
        <button onClick={handleExport} disabled={rows.length===0} style={{...s.btn,color:'#059669',flexShrink:0}}><Download size={14}/>Excel</button>
      </div>

      <main style={{flex:1,overflow:'hidden',background:'#fff'}}>
        {loading ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:10}}>
            <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#7c3aed'}}/>
            <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải danh sách đề xuất...</p>
          </div>
        ) : (
          <div style={{overflowX:'auto',height:'100%'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.74rem'}}>
              <thead>
                <tr style={{background:'#faf5ff',position:'sticky',top:0,zIndex:1}}>
                  <th style={th}>#</th>
                  <th onClick={()=>handleSort('urgency')} style={sortTh(sortCol==='urgency')}>Khẩn cấp{sortInd('urgency')}</th>
                  <th onClick={()=>handleSort('dlk_code')} style={sortTh(sortCol==='dlk_code')}>Mã DLK{sortInd('dlk_code')}</th>
                  <th onClick={()=>handleSort('item_code')} style={{...sortTh(sortCol==='item_code'),textAlign:'left'}}>Sản phẩm{sortInd('item_code')}</th>
                  <th onClick={()=>handleSort('unit')} style={sortTh(sortCol==='unit')}>ĐVT{sortInd('unit')}</th>
                  <th onClick={()=>handleSort('ngay_de_xuat')} style={sortTh(sortCol==='ngay_de_xuat')}>Ngày ĐX{sortInd('ngay_de_xuat')}</th>
                  <th onClick={()=>handleSort('ngay_du_kien')} style={sortTh(sortCol==='ngay_du_kien')}>Dự kiến về{sortInd('ngay_du_kien')}</th>
                  <th onClick={()=>handleSort('needed_ts')} style={sortTh(sortCol==='needed_ts')}>Ngày cần về{sortInd('needed_ts')}</th>
                  <th onClick={()=>handleSort('calculated_qty')} style={{...sortTh(sortCol==='calculated_qty'),textAlign:'right'}}>SL ĐX{sortInd('calculated_qty')}</th>
                  <th onClick={()=>handleSort('actual_qty')} style={{...sortTh(sortCol==='actual_qty'),textAlign:'right'}}>SL Đặt{sortInd('actual_qty')}</th>
                  <th onClick={()=>handleSort('received')} style={{...sortTh(sortCol==='received'),textAlign:'right'}}>Đã nhập{sortInd('received')}</th>
                  <th onClick={()=>handleSort('tien_do')} style={sortTh(sortCol==='tien_do')}>Tiến độ{sortInd('tien_do')}</th>
                  <th style={th}>Ghi chú</th>
                  <th style={th}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={14} style={{padding:'2.5rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>
                    {filterTienDo!=='all' ? `Không có đề xuất nào ở tiến độ "${filterTienDo}"` : filterStatus==='active' ? 'Không có đề xuất nào đang mở — vào tab Tồn HH để gửi đề xuất mới' : 'Không có dữ liệu'}
                  </td></tr>
                ) : visibleRows.map((row, i) => {
                  const tdc = TIEN_DO_COLORS[row.tien_do] || TIEN_DO_COLORS['Mới'];
                  const isDone = ['Đã về kho đủ','Hủy'].includes(row.auto_trang_thai);
                  return (
                    <tr key={row.id} style={{borderBottom:'1px solid #f1f5f9',opacity:isDone?0.65:1}} onMouseEnter={e=>e.currentTarget.style.background='#faf5ff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={{...td,color:'#94a3b8'}}>{i+1}</td>
                      <td style={{...td}}>
                        {(() => {
                          const u = urgencyOf(row.days_left);
                          return u ? (
                            <span style={{display:'inline-block',padding:'0.15rem 0.45rem',borderRadius:5,fontSize:'0.66rem',fontWeight:700,background:u.bg,color:u.color,border:`1px solid ${u.border}`,whiteSpace:'nowrap'}}>
                              {u.label}{row.days_left!==null?` (${row.days_left}d)`:''}
                            </span>
                          ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>;
                        })()}
                      </td>
                      <td style={{...td,fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>{row.dlk_code}</td>
                      <td style={{...td,textAlign:'left'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>{row.item_code}</div>
                        <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</div>
                      </td>
                      <td style={{...td,color:'#64748b'}}>{row.unit}</td>
                      <td style={{...td,color:'#64748b',whiteSpace:'nowrap'}}>{row.ngay_de_xuat || '—'}</td>
                      <td style={{...td}}>
                        <input type="date" value={row.ngay_du_kien||''} disabled={isDone || !perms.edit}
                          onChange={e=>handleUpdateRow(row.id,'ngay_du_kien',e.target.value)}
                          onBlur={()=>handleSaveRow(row)}
                          style={{...s.input,width:110,color: row.days_remaining!==null&&row.days_remaining<0?'#ef4444':'#334155'}}/>
                      </td>
                      <td style={{...td,whiteSpace:'nowrap',fontWeight:600,color: row.days_left!==null&&row.days_left<7?'#dc2626':'#475569'}}>
                        {row.needed_ts ? new Date(row.needed_ts).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{...td,textAlign:'right',color:'#64748b'}}>{Number(row.calculated_qty).toLocaleString('vi-VN')}</td>
                      <td style={{...td,textAlign:'right'}}>
                        <input type="number" min="0" value={row.actual_qty} disabled={isDone || !perms.edit}
                          onChange={e=>handleUpdateRow(row.id,'actual_qty',e.target.value)}
                          onBlur={()=>handleSaveRow(row)}
                          style={{...s.input,width:60,textAlign:'right',fontWeight:700,color:'#0f172a'}}/>
                      </td>
                      <td style={{...td,textAlign:'right',fontWeight:700,color: row.received>0?'#059669':'#94a3b8'}}>
                        {row.received > 0 ? row.received.toLocaleString('vi-VN') : '—'}
                      </td>
                      <td style={{...td}}>
                        <select value={row.tien_do||'Mới'} disabled={isDone || !perms.edit}
                          onChange={e=>{handleUpdateRow(row.id,'tien_do',e.target.value);}}
                          onBlur={()=>handleSaveRow(row)}
                          style={{...s.input,minWidth:120,background:tdc.bg,color:tdc.color,border:`1px solid ${tdc.border}`,fontWeight:700}}>
                          {TIEN_DO_OPTIONS.map(o=><option key={o} style={{background:'#fff',color:'#334155',fontWeight:600}}>{o}</option>)}
                        </select>
                      </td>
                      <td style={{...td}}>
                        <input type="text" value={row.note||''} placeholder="..." disabled={isDone || !perms.edit}
                          onChange={e=>handleUpdateRow(row.id,'note',e.target.value)}
                          onBlur={()=>handleSaveRow(row)}
                          style={{...s.input,width:100}}/>
                      </td>
                      <td style={{...td}}>
                        <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                          {perms.create && !isDone && (
                            <button onClick={()=>handleNhapMuaVao(row)} title="Nhập mua vào" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#10b981',fontSize:'0.68rem',border:'1px solid #86efac'}}>
                              <ShoppingCart size={12}/>Nhập
                            </button>
                          )}
                          {perms.delete && !isDone && (
                            <button onClick={()=>handleCancel(row)} title="Hủy đề xuất" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#f59e0b',fontSize:'0.68rem',border:'1px solid #fcd34d'}}>
                              <XCircle size={12}/>
                            </button>
                          )}
                          {perms.delete && <button onClick={()=>handleDelete(row)} title="Xóa" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#ef4444',fontSize:'0.68rem',border:'1px solid #fca5a5'}}>
                            <Trash2 size={12}/>
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.5rem 0.75rem',display:'flex',alignItems:'center',gap:8,borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20}}>
        <span style={{fontSize:'0.8rem',fontWeight:600,color:'#64748b'}}>
          {visibleRows.length} đề xuất {filterStatus==='active'?'đang mở':filterStatus==='done'?'hoàn tất':'tổng cộng'}
          {filterTienDo!=='all' ? ` · tiến độ "${filterTienDo}"` : ''}
        </span>
        {saving && <span style={{fontSize:'0.75rem',color:'#7c3aed',display:'flex',alignItems:'center',gap:4}}><Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>Đang lưu...</span>}
      </div>
    </div>
  );
}

const th = { padding:'0.4rem 0.35rem', borderBottom:'2px solid #e2e8f0', fontSize:'0.68rem', fontWeight:700, color:'#64748b', textAlign:'center', whiteSpace:'nowrap' };
// Tiêu đề cột có thể bấm để sắp xếp; tô tím khi đang là cột sắp xếp
const sortTh = (active) => ({ ...th, cursor:'pointer', userSelect:'none', color: active ? '#7c3aed' : '#64748b', borderBottom: `2px solid ${active ? '#7c3aed' : '#e2e8f0'}` });
const td = { padding:'0.3rem 0.35rem', textAlign:'center', verticalAlign:'middle' };
