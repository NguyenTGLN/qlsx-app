import React, { useState, useEffect, useCallback } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { useNavigate } from 'react-router-dom';
import { supabase as db } from '../../lib/supabase';
import { useAuth, getTabPerm, canSeeTab } from '../../lib/AuthContext';
import { Package, RefreshCw, Search, ChevronLeft, ChevronRight, Download, Database, Loader2, Trash2, Edit3, X, Check, Calendar, Eye, EyeOff, ChevronDown, Upload, Layers, List, GitMerge, Settings, ArrowUp, ArrowDown, Printer, LayoutGrid, Star, Truck } from 'lucide-react';
import ModuleShell from '../../components/ModuleShell';
import * as XLSX from 'xlsx';
import DateRangeDropdown, { applyDateFilter } from '../../components/DateRangeDropdown';
import InventoryTab from './InventoryTab';
import StockSummaryTab from './StockSummaryTab';
import CatalogTab from './CatalogTab';
import BomTab from './BomTab';
import ProductionOrderTab from './ProductionOrderTab';
import PickingLogsTab from './PickingLogsTab';
import OrderProposalTab from './OrderProposalTab';
import DKSXTab from './DKSXTab';
import ImportLogsTab from './ImportLogsTab';
import ImportStockTab from './ImportStockTab';
import WipStockTab from './WipStockTab';
import PrintQueueTab from './PrintQueueTab';
import SaveExportTab from './SaveExportTab';
import BookInventoryTab from './BookInventoryTab';
import SupplierTab from './SupplierTab';

// ── AutoSuggest Component (live search from Supabase) ──
function AutoSuggest({ value, onChange, placeholder, columnName, isOpen, onToggle }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const selectedSet = new Set(value ? value.split(',').map(v=>v.trim()).filter(Boolean) : []);

  // Click outside → close
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onToggle(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  const doSearch = (q) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q || q.length < 1) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await db.from('luu_xuat').select(columnName).ilike(columnName, `%${q}%`).limit(50);
        setResults([...new Set((data||[]).map(r=>r[columnName]).filter(Boolean))].sort());
      } catch(e) { console.warn('Search err:', e); }
      setSearching(false);
    }, 300);
  };

  const handleInput = (v) => { setInput(v); doSearch(v); };
  const toggle = (v) => { const n = new Set(selectedSet); n.has(v)?n.delete(v):n.add(v); onChange([...n].join(',')); };
  const clear = () => { onChange(''); setInput(''); setResults([]); };

  const handleOpen = async () => {
    onToggle(true);
    if (results.length === 0 && !input) {
      setSearching(true);
      try {
        const { data } = await db.from('luu_xuat').select(columnName).limit(50);
        setResults([...new Set((data||[]).map(r=>r[columnName]).filter(Boolean))].sort());
      } catch(e) { console.warn(e); }
      setSearching(false);
    }
  };

  return (
    <div style={{position:'relative'}} ref={wrapRef}>
      <div style={{display:'flex',alignItems:'center',gap:3,background:isOpen?'#eff6ff':'#f8fafc',border:`1px solid ${isOpen?'#93c5fd':'#e2e8f0'}`,borderRadius:7,padding:'2px 5px',cursor:'pointer',minWidth:50,transition:'all 0.15s'}} onClick={()=>isOpen?onToggle(false):handleOpen()}>
        <span style={{fontSize:'0.73rem',fontWeight:600,color:selectedSet.size?'#0f172a':'#94a3b8',flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
          {selectedSet.size ? `${selectedSet.size} đã chọn` : placeholder}
        </span>
        <ChevronDown size={12} color="#94a3b8" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.15s'}}/>
      </div>
      {isOpen && (
        <div style={{position:'fixed',inset:0,zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          {/* Backdrop */}
          <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.3)',backdropFilter:'blur(2px)'}} onClick={()=>onToggle(false)} />

          {/* Modal Content */}
          <div style={{position:'relative',background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,boxShadow:'0 20px 40px rgba(0,0,0,0.2)',width:'100%',maxWidth:340,maxHeight:'80vh',display:'flex',flexDirection:'column',animation:'fadeIn 0.15s ease-out',zIndex:1}}>
            {/* Header */}
            <div style={{padding:'1rem',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'0.9rem',fontWeight:800,color:'#0f172a'}}>Lọc {placeholder}</span>
              {selectedSet.size > 0 && <button onClick={clear} style={{border:'none',background:'#fef2f2',color:'#ef4444',borderRadius:6,padding:'3px 10px',fontSize:'0.75rem',fontWeight:700,cursor:'pointer'}}>Xóa tất cả</button>}
            </div>

            {/* Search input */}
            <div style={{padding:'8px 12px',borderBottom:'1px solid #f1f5f9'}}>
              <input value={input} onChange={e=>handleInput(e.target.value)} placeholder="Gõ để tìm..." autoFocus style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'0.5rem 0.75rem',fontSize:'0.85rem',outline:'none',background:'#f8fafc',boxSizing:'border-box'}}/>
            </div>

            {/* Selected chips */}
            {selectedSet.size > 0 && (
              <div style={{padding:'6px 12px',borderBottom:'1px solid #f1f5f9',display:'flex',flexWrap:'wrap',gap:4}}>
                {[...selectedSet].map(v => (
                  <span key={v} style={{display:'inline-flex',alignItems:'center',gap:3,background:'#eff6ff',color:'#1d4ed8',borderRadius:99,padding:'2px 8px',fontSize:'0.72rem',fontWeight:700}}>
                    {v} <span onClick={()=>toggle(v)} style={{cursor:'pointer',color:'#93c5fd',fontWeight:900}}>×</span>
                  </span>
                ))}
              </div>
            )}

            {/* Results list */}
            <div style={{overflow:'auto',flex:1,padding:'4px 0'}}>
              {searching ? <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.78rem',padding:12}}>🔍 Đang tìm...</p> :
               results.length === 0 && input ? <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.78rem',padding:12}}>Không tìm thấy "{input}"</p> :
               results.length === 0 ? <p style={{textAlign:'center',color:'#94a3b8',fontSize:'0.78rem',padding:12}}>Gõ để tìm kiếm</p> :
               results.map(v => (
                <label key={v} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',cursor:'pointer',fontSize:'0.85rem',color:'#334155',transition:'background 0.1s'}} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <input type="checkbox" checked={selectedSet.has(v)} onChange={()=>toggle(v)} style={{width:18,height:18,accentColor:'#2563eb',cursor:'pointer'}}/>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span>
                </label>
              ))}
            </div>

            {/* Footer */}
            <div style={{borderTop:'1px solid #e2e8f0',padding:'0.75rem 1rem',textAlign:'right',background:'#f8fafc'}}>
              <button onClick={()=>onToggle(false)} style={{border:'none',background:'#2563eb',color:'#fff',borderRadius:8,padding:'0.5rem 1.5rem',fontSize:'0.85rem',fontWeight:700,cursor:'pointer'}}>Xong</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ColumnToggle Component ──
function ColumnToggle({ columns, hiddenCols, setHiddenCols }) {
  const [open, setOpen] = useState(false);
  const toggle = (col) => setHiddenCols(h => { const n = new Set(h); n.has(col)?n.delete(col):n.add(col); return n; });
  return (
    <div style={{position:'relative',flexShrink:0}}>
      <button onClick={()=>setOpen(!open)} style={{display:'flex',alignItems:'center',gap:3,padding:'0.35rem 0.5rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,color:'#475569'}} title="Ẩn/Hiện cột">
        <Eye size={13}/>{hiddenCols.size > 0 && <span style={{background:'#fef2f2',color:'#ef4444',borderRadius:99,padding:'0 4px',fontSize:'0.65rem',fontWeight:800}}>-{hiddenCols.size}</span>}
      </button>
      {open && (
        <div style={{position:'absolute',top:'100%',right:0,marginTop:4,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:60,width:200,maxHeight:320,overflow:'auto',padding:'6px 0'}}>
          <div style={{padding:'4px 10px 6px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:'0.7rem',fontWeight:700,color:'#64748b',textTransform:'uppercase'}}>Ẩn/Hiện cột</span>
            <button onClick={()=>setHiddenCols(new Set())} style={{border:'none',background:'none',color:'#2563eb',fontSize:'0.68rem',fontWeight:700,cursor:'pointer'}}>Hiện tất cả</button>
          </div>
          {columns.map(col => (
            <label key={col} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',cursor:'pointer',fontSize:'0.76rem',color:hiddenCols.has(col)?'#94a3b8':'#334155'}} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background=''}>
              <input type="checkbox" checked={!hiddenCols.has(col)} onChange={()=>toggle(col)} style={{accentColor:'#2563eb',cursor:'pointer'}}/>
              {colLabel(col)}
            </label>
          ))}
          <div style={{borderTop:'1px solid #f1f5f9',padding:6,textAlign:'right'}}>
            <button onClick={()=>setOpen(false)} style={{border:'none',background:'#2563eb',color:'#fff',borderRadius:5,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700,cursor:'pointer'}}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}

// const PAGE_SIZE = 50; // Thay thế bằng state trong component

function fmtCell(v) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    const rounded = Math.round(v * 1000) / 1000;
    return rounded.toLocaleString('vi-VN');
  }
  if (typeof v === 'string') {
    // Date-only: "2026-05-03" → hiển thị trực tiếp không qua new Date() để tránh lệch timezone
    const dateOnly = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1].slice(2)}`;
    // Full timestamp: "2026-05-03T10:30:00..." → dùng locale
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('vi-VN');
  }
  return String(v);
}

const colLabel = (k) => ({id:'ID',created_at:'Ngày tạo',ngay_xuat:'Ngày xuất',ma_san_pham:'Mã SP',ten_san_pham:'Tên sản phẩm',so_luong:'Số lượng',ma_don_hang:'Mã đơn hàng',don_vi:'Đơn vị',ghi_chu:'Ghi chú'}[k] || k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));

// Thứ tự cột ưu tiên: cột hữu ích lên trước; các cột kỹ thuật (id, created_at) để cuối & ẩn mặc định
const COL_ORDER = ['ngay_xuat','ma_san_pham','ten_san_pham','so_luong','ma_don_hang','don_vi','ghi_chu'];
const orderColumns = (cols) => {
  const known = COL_ORDER.filter(c => cols.includes(c));
  const rest = cols.filter(c => !COL_ORDER.includes(c));
  return [...known, ...rest];
};

// Tiêu đề cột NGẮN (cho bảng gọn trên điện thoại). Tên đầy đủ vẫn dùng trong menu ẩn/hiện cột.
const SHORT_HDR = { ngay_xuat:'Ngày', ma_san_pham:'Mã SP', ten_san_pham:'Tên', so_luong:'SL', ma_don_hang:'Mã ĐH', don_vi:'ĐVT', ghi_chu:'Ghi chú', id:'ID', created_at:'Ngày tạo' };

const s = { // style shortcuts
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  btnP: { background:'#2563eb',color:'#fff',border:'none',boxShadow:'0 2px 8px rgba(37,99,235,0.3)' },
  btnD: { background:'#ef4444',color:'#fff',border:'none',boxShadow:'0 2px 8px rgba(239,68,68,0.3)' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
  pill: (bg,fg) => ({ display:'inline-flex',alignItems:'center',gap:4,padding:'0.2rem 0.6rem',borderRadius:999,fontSize:'0.75rem',fontWeight:700,background:bg,color:fg }),
};

// ── Cấu hình Tabs Mặc định ──
// Mỗi tab có: label (đầy đủ, dùng ở menu), short (nhãn ngắn cho pill), icon, color (màu riêng)
const ALL_TABS = [
  { id: 'nhap-kho',         label: 'Bốc dỡ & Nhập kho',     short: 'Nhập kho',  icon: Package,   color: '#0d9488' },
  { id: 'du-lieu-nhap',     label: 'Dữ liệu nhập',          short: 'DL nhập',   icon: Database,  color: '#2563eb' },
  { id: 'luu-xuat',         label: 'Lưu xuất',              short: 'Lưu xuất',  icon: Database,  color: '#6366f1' },
  { id: 'xuat',             label: 'Dữ liệu xuất',          short: 'DL xuất',   icon: Database,  color: '#8b5cf6' },
  { id: 'ton-kho-tong',     label: 'Tồn kho hàng hóa',      short: 'Tồn HH',    icon: Package,   color: '#0891b2' },
  { id: 'ton-kho-so-sach',  label: 'Tồn kho sổ sách',       short: 'Sổ sách',   icon: Database,  color: '#16a34a' },
  { id: 'ton-kho',          label: 'Tồn kho theo vị trí',   short: 'Vị trí',    icon: Layers,    color: '#0284c7' },
  { id: 'danh-muc',         label: 'Danh mục hàng hóa',     short: 'Danh mục',  icon: List,      color: '#d97706' },
  { id: 'danh-muc-ncc',     label: 'Danh mục NCC',          short: 'NCC',       icon: Truck,     color: '#be123c' },
  { id: 'bom',              label: 'BOM Sản xuất',          short: 'BOM',       icon: GitMerge,  color: '#db2777' },
  { id: 'lenh-sx',          label: 'Bốc dỡ & Xuất kho (PSX)', short: 'PSX',     icon: Package,   color: '#dc2626' },
  { id: 'lich-su-boc-do',   label: 'Lịch sử bốc dỡ',        short: 'LS bốc dỡ', icon: RefreshCw, color: '#475569' },
  { id: 'dksx',             label: 'DKSX — Nhu cầu sản xuất', short: 'DKSX',    icon: GitMerge,  color: '#4f46e5' },
  { id: 'de-xuat-dat-hang', label: 'Đề xuất đặt hàng (DLK)', short: 'Đề xuất',  icon: Database,  color: '#ea580c' },
  { id: 'ton-kho-sx',       label: 'Tồn kho Sản xuất',      short: 'Tồn SX',    icon: Layers,    color: '#059669' },
  { id: 'print_queue',      label: 'Quản Lý Chứng Từ',      short: 'Chứng từ',  icon: Printer,   color: '#7c3aed' },
];

function TabSettingsModal({ config, setConfig, onClose }) {
  const [localConfig, setLocalConfig] = useState([...config]);

  const toggleVis = (id) => {
    setLocalConfig(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const move = (index, dir) => {
    if ((dir === -1 && index === 0) || (dir === 1 && index === localConfig.length - 1)) return;
    const newConf = [...localConfig];
    const temp = newConf[index];
    newConf[index] = newConf[index + dir];
    newConf[index + dir] = temp;
    setLocalConfig(newConf);
  };

  const handleSave = () => {
    setConfig(localConfig);
    onClose();
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(4px)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'#fff',width:400,maxHeight:'90vh',borderRadius:16,boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'fadeIn 0.2s ease-out'}}>
        <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8fafc'}}>
          <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:700,color:'#0f172a',display:'flex',alignItems:'center',gap:8}}>
            <Settings size={18} color="#0891b2"/> Cấu hình hiển thị Tab
          </h2>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#64748b'}}><X size={20}/></button>
        </div>
        <div style={{padding:'1rem',overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:8}}>
          <p style={{margin:'0 0 10px 0',fontSize:'0.8rem',color:'#64748b'}}>Bạn có thể bật/tắt hoặc dùng mũi tên để sắp xếp thứ tự hiển thị các tab theo ý muốn. Cài đặt này sẽ được lưu trên máy của bạn.</p>
          {localConfig.map((t, idx) => {
             const tabDef = ALL_TABS.find(a => a.id === t.id);
             if (!tabDef) return null;
             const Icon = tabDef.icon;
             return (
               <div key={t.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <input type="checkbox" checked={t.visible} onChange={() => toggleVis(t.id)} style={{width:16,height:16,accentColor:'#0891b2',cursor:'pointer'}} />
                    <div style={{display:'flex',alignItems:'center',gap:6,color:t.visible?'#0f172a':'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>
                      <Icon size={16} /> {tabDef.label}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button onClick={()=>move(idx, -1)} disabled={idx===0} style={{...s.btn,padding:'4px',border:'none',background:idx===0?'transparent':'#f1f5f9',opacity:idx===0?0.3:1}}><ArrowUp size={16}/></button>
                    <button onClick={()=>move(idx, 1)} disabled={idx===localConfig.length-1} style={{...s.btn,padding:'4px',border:'none',background:idx===localConfig.length-1?'transparent':'#f1f5f9',opacity:idx===localConfig.length-1?0.3:1}}><ArrowDown size={16}/></button>
                  </div>
               </div>
             );
          })}
        </div>
        <div style={{padding:'1rem 1.25rem',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:10,background:'#f8fafc'}}>
          <button onClick={onClose} style={{...s.btn}}>Hủy bỏ</button>
          <button onClick={handleSave} style={{...s.btn, ...s.btnP}}>Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
}


// ── EditModal ──
function EditModal({ row, columns, onSave, onClose }) {
  const [form, setForm] = useState({...row});
  const editableCols = columns.filter(c => c !== 'id' && c !== 'created_at');

  // #5: hiện tồn các vị trí của mã hàng này (chỉ để đối chiếu — tự điều chỉnh ở tab Tồn kho nếu cần)
  const maSP = row?.ma_san_pham;
  const [stockRows, setStockRows] = useState(null);
  useEffect(() => {
    if (!maSP) { setStockRows([]); return; }
    let alive = true;
    db.from('inventory_stock').select('location, quantity, import_date').eq('item_code', maSP).order('location')
      .then(({ data }) => { if (alive) setStockRows(data || []); });
    return () => { alive = false; };
  }, [maSP]);
  const stockTotal = (stockRows || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:14,padding:'1.5rem',width:480,maxHeight:'80vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <h3 style={{margin:0,fontSize:'1rem',fontWeight:800,color:'#0f172a'}}>✏️ Sửa dữ liệu</h3>
          <button onClick={onClose} style={{...s.btn,border:'none',padding:4}}><X size={18}/></button>
        </div>
        {editableCols.map(c => (
          <div key={c} style={{marginBottom:'0.75rem'}}>
            <label style={{display:'block',fontSize:'0.72rem',fontWeight:700,color:'#64748b',marginBottom:3,textTransform:'uppercase'}}>{colLabel(c)}</label>
            <input value={form[c]??''} onChange={e=>setForm(f=>({...f,[c]:e.target.value}))} style={{...s.input,width:'100%'}} />
          </div>
        ))}

        {/* #5: Tồn các vị trí của mã hàng (chỉ đọc — để đối chiếu khi sửa/xóa lưu xuất) */}
        {maSP && (
          <div style={{marginTop:'0.5rem',marginBottom:'0.75rem',padding:'0.6rem 0.75rem',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
            <div style={{fontSize:'0.72rem',fontWeight:700,color:'#475569',marginBottom:5,display:'flex',justifyContent:'space-between'}}>
              <span>📦 Tồn vị trí của {maSP}</span>
              <span style={{color:'#0891b2'}}>Tổng: {stockTotal.toLocaleString('vi-VN')}</span>
            </div>
            {stockRows === null ? (
              <div style={{fontSize:'0.72rem',color:'#94a3b8'}}>Đang tải…</div>
            ) : stockRows.length === 0 ? (
              <div style={{fontSize:'0.72rem',color:'#94a3b8'}}>Mã này hiện không có dòng tồn nào.</div>
            ) : (
              <div style={{maxHeight:120,overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.72rem'}}>
                  <thead><tr style={{color:'#64748b'}}>
                    <th style={{textAlign:'left',padding:'2px 4px'}}>Vị trí</th>
                    <th style={{textAlign:'right',padding:'2px 4px'}}>SL tồn</th>
                    <th style={{textAlign:'left',padding:'2px 4px'}}>Ngày nhập</th>
                  </tr></thead>
                  <tbody>
                    {stockRows.map((r,i)=>(
                      <tr key={i} style={{borderTop:'1px solid #eef2f7'}}>
                        <td style={{padding:'2px 4px',color: String(r.location||'').startsWith('SX9-')?'#d97706':'#334155'}}>{r.location||'—'}{String(r.location||'').startsWith('SX9-')&&' (SX)'}</td>
                        <td style={{padding:'2px 4px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{Number(r.quantity).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'2px 4px',color:'#94a3b8'}}>{r.import_date||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{fontSize:'0.66rem',color:'#94a3b8',marginTop:4,fontStyle:'italic'}}>Chỉ để đối chiếu. Nếu cần chỉnh tồn, vào tab Tồn kho thực tế.</div>
          </div>
        )}

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:'1rem'}}>
          <button onClick={onClose} style={s.btn}>Hủy</button>
          <button onClick={()=>onSave(form)} style={{...s.btn,...s.btnP}}><Check size={14}/>Lưu</button>
        </div>
      </div>
    </div>
  );
}

// ── ImportModal ──
function ImportModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { cols, rows }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });

  const AUTO_COLS = ['id', 'created_at']; // DB tự tạo

  // Tải file mẫu Excel — lấy cột từ chính bảng ĐÍCH (luu_xuat) để mẫu luôn khớp khi import
  const downloadTemplate = async () => {
    try {
      const { data } = await db.from('luu_xuat').select('*').limit(1);
      if (!data || data.length === 0) { alert('Không thể lấy cấu trúc bảng'); return; }
      const templateCols = Object.keys(data[0]).filter(c => !AUTO_COLS.includes(c));
      const sampleRow = {};
      templateCols.forEach(c => { sampleRow[c] = data[0][c] ?? ''; });
      const ws = XLSX.utils.json_to_sheet([sampleRow], { header: templateCols });
      ws['!cols'] = templateCols.map(c => ({ wch: Math.max(colLabel(c).length, 18) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Mẫu Import');
      XLSX.writeFile(wb, 'mau_import_kho_hang.xlsx');
    } catch(e) { alert('Lỗi: ' + e.message); }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (json.length === 0) { alert('File trống!'); return; }
        const cols = Object.keys(json[0]).filter(c => !AUTO_COLS.includes(c.toLowerCase()));
        setPreview({ cols, rows: json, total: json.length });
      } catch (err) { alert('Lỗi đọc file: ' + err.message); }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    const BATCH = 200;
    const errors = [];
    const cleanRows = preview.rows.map(r => {
      const clean = {};
      preview.cols.forEach(c => { clean[c] = r[c] === '' ? null : r[c]; });
      return clean;
    });
    setProgress({ done: 0, total: cleanRows.length, errors: [] });

    for (let i = 0; i < cleanRows.length; i += BATCH) {
      const batch = cleanRows.slice(i, i + BATCH);
      try {
        const { error } = await db.from('luu_xuat').insert(batch);
        if (error) errors.push(`Dòng ${i+1}-${i+batch.length}: ${error.message}`);
      } catch (e) { errors.push(`Dòng ${i+1}-${i+batch.length}: ${e.message}`); }
      setProgress({ done: Math.min(i + BATCH, cleanRows.length), total: cleanRows.length, errors: [...errors] });
    }

    setImporting(false);
    if (errors.length === 0) {
      alert(`✅ Import thành công ${cleanRows.length} dòng!`);
      onSuccess();
    } else {
      alert(`⚠️ Import xong với ${errors.length} lỗi. Kiểm tra chi tiết bên dưới.`);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div style={{background:'#fff',borderRadius:14,padding:'1.5rem',width:680,maxHeight:'85vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
          <h3 style={{margin:0,fontSize:'1rem',fontWeight:800,color:'#0f172a'}}>📥 Import dữ liệu từ Excel</h3>
          <button onClick={onClose} style={{...s.btn,border:'none',padding:4}}><X size={18}/></button>
        </div>

        {/* File picker */}
        <div style={{border:'2px dashed #e2e8f0',borderRadius:10,padding:'1.5rem',textAlign:'center',marginBottom:'0.5rem',background:'#f8fafc'}}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:'none'}} id="excel-import"/>
          <label htmlFor="excel-import" style={{cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
            <Upload size={32} color="#7c3aed"/>
            <span style={{fontSize:'0.85rem',fontWeight:700,color:'#334155'}}>{file ? file.name : 'Chọn file Excel (.xlsx, .xls, .csv)'}</span>
            <span style={{fontSize:'0.72rem',color:'#94a3b8'}}>Cột ID và Ngày tạo sẽ được bỏ qua (DB tự tạo)</span>
          </label>
        </div>
        {/* Download template */}
        <div style={{textAlign:'center',marginBottom:'1rem'}}>
          <button onClick={downloadTemplate} style={{background:'none',border:'none',color:'#7c3aed',fontSize:'0.78rem',fontWeight:700,cursor:'pointer',textDecoration:'underline',display:'inline-flex',alignItems:'center',gap:4}}>
            <Download size={13}/> Tải file mẫu Excel
          </button>
        </div>

        {/* Preview */}
        {preview && (
          <>
            <div style={{marginBottom:'0.75rem',display:'flex',alignItems:'center',gap:8}}>
              <span style={s.pill('#f0fdf4','#166534')}>✅ {preview.total.toLocaleString()} dòng</span>
              <span style={s.pill('#e0f2fe','#0369a1')}>📋 {preview.cols.length} cột</span>
              <span style={{fontSize:'0.72rem',color:'#94a3b8'}}>(xem trước 5 dòng đầu)</span>
            </div>
            <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #e2e8f0',marginBottom:'1rem',maxHeight:200}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.72rem'}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {preview.cols.map(c => <th key={c} style={{padding:'6px 8px',textAlign:'left',fontWeight:700,color:'#475569',borderBottom:'2px solid #e2e8f0',whiteSpace:'nowrap'}}>{colLabel(c)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                      {preview.cols.map(c => <td key={c} style={{padding:'4px 8px',whiteSpace:'nowrap',color:'#334155'}}>{String(r[c] ?? '—')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Progress */}
        {importing && (
          <div style={{marginBottom:'1rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',fontWeight:600,color:'#475569',marginBottom:4}}>
              <span>Đang import...</span>
              <span>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)</span>
            </div>
            <div style={{height:8,background:'#e2e8f0',borderRadius:99,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,#7c3aed,#2563eb)',borderRadius:99,transition:'width 0.3s'}}/>
            </div>
          </div>
        )}

        {/* Errors */}
        {progress.errors.length > 0 && (
          <div style={{marginBottom:'1rem',background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'0.5rem 0.75rem',maxHeight:100,overflow:'auto'}}>
            {progress.errors.map((e, i) => <p key={i} style={{margin:'2px 0',fontSize:'0.72rem',color:'#ef4444'}}>{e}</p>)}
          </div>
        )}

        {/* Actions */}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} disabled={importing} style={s.btn}>Hủy</button>
          <button onClick={handleImport} disabled={!preview || importing} style={{...s.btn,background:'#7c3aed',color:'#fff',border:'none',opacity:(!preview||importing)?0.5:1,boxShadow:'0 2px 8px rgba(124,58,237,0.3)'}}>
            {importing ? <><Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> Đang import...</> : <><Upload size={14}/> Import {preview ? preview.total.toLocaleString() + ' dòng' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──
export default function KhoHangApp() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState('kho_pageSize', 50);
  const [sortCol, setSortCol] = usePersistedState('kho_sortCol', 'created_at');
  const [sortAsc, setSortAsc] = usePersistedState('kho_sortAsc', false);

  // Filters (persisted)
  const [dateRange, setDateRange] = usePersistedState('kho_dateRange', { preset: 'Tất cả', from: '', to: '' });
  const [filterSP, setFilterSP] = usePersistedState('kho_filterSP', '');
  const [filterDH, setFilterDH] = usePersistedState('kho_filterDH', '');
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = usePersistedState('kho_searchInput', '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== searchInput) {
        setSearchText(searchInput);
        setPage(1);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchInput, searchText]);

  // Selection
  const [selected, setSelected] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [hiddenCols, setHiddenCols] = usePersistedState('kho_xuat_hiddenCols_v2', new Set(['id','created_at','ten_san_pham']));
  const [openDropdown, setOpenDropdown] = useState(null); // 'sp' | 'dh' | null
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = usePersistedState('kho_activeTab', 'menu');
  const [dlkPrefill, setDlkPrefill] = useState(null); // { dlk_code, item_code, item_name, qty, unit } khi navigate từ tab đề xuất → nhập kho
  const [sxPrefill, setSxPrefill] = useState(null);   // { item_code, item_name, qty } khi navigate từ DKSX → lệnh SX
  const [importReturnTab, setImportReturnTab] = useState(null); // tab gốc để quay về sau khi lưu phiếu nhập

  const navigateTo = (tab, params = null) => {
    if (tab === 'nhap-kho' && activeTab !== 'nhap-kho') setImportReturnTab(activeTab); // nhớ chỗ bấm "Nhập kho" để quay lại
    if (params?.dlk) setDlkPrefill(params.dlk);
    if (params?.sx) setSxPrefill(params.sx);
    setActiveTab(tab);
  };

  // Phân quyền theo nhóm thao tác trong Kho. Vào được Kho (access_warehouse) mà
  // không có nhóm nào = chỉ xem. Admin có hết qua getTabPerm/canSeeTab.
  const { user } = useAuth();
  // perms của TAB đang mở — dùng CAP CHUẨN (chính xác) cho từng nút trong tab.
  const tp = getTabPerm(user, 'kho', activeTab);
  const perms = {
    view: tp.view, create: tp.create, edit: tp.edit, delete: tp.delete, io: tp.io,
  };

  // Tabs Config State (persisted)
  const [showTabSettings, setShowTabSettings] = useState(false);
  const [showTabPicker, setShowTabPicker] = useState(false);
  // Các tab được "ghim" hiện sẵn ngoài thanh tab (người dùng tick ⭐ trong bảng lưới)
  const [pinnedTabs, setPinnedTabs] = usePersistedState('kho_pinnedTabs', ['nhap-kho','xuat','ton-kho-tong','lenh-sx']);
  const [rawTabsConfig, setRawTabsConfig] = usePersistedState('kho_tabsConfig', ALL_TABS.map(t => ({ id: t.id, visible: true })));
  // Merge: đảm bảo tab mới được thêm vào cấu hình
  const tabsConfig = (() => {
    const merged = [...rawTabsConfig];
    ALL_TABS.forEach(t => {
      if (!merged.find(m => m.id === t.id)) {
        merged.push({ id: t.id, visible: true });
      }
    });
    return merged;
  })();
  const setTabsConfig = setRawTabsConfig;

  // Tab nào user được xem (view). Admin = tất cả. AND với cấu hình visible ở từng render site.
  const visibleTabIds = ALL_TABS.filter(t => canSeeTab(user, 'kho', t.id)).map(t => t.id);

  // Nếu tab đang mở mất quyền xem → quay về menu.
  useEffect(() => {
    if (activeTab !== 'menu' && !visibleTabIds.includes(activeTab)) setActiveTab('menu');
  }, [activeTab, visibleTabIds, setActiveTab]);

  // ── Build query with filters ──
  const buildQuery = useCallback((countOnly = false) => {
    // count 'estimated': chính xác khi kết quả nhỏ, ước lượng planner khi lớn — không quét cả bảng triệu dòng
    let q = db.from('luu_xuat').select('*', countOnly ? { count: 'estimated', head: true } : {});

    // Date filter
    q = applyDateFilter(q, dateRange, 'ngay_xuat');
    // Multi-select filter: comma-separated values → .in() query
    if (filterSP.trim()) {
      const vals = filterSP.split(',').map(v=>v.trim()).filter(Boolean);
      if (vals.length > 0) q = q.in('ma_san_pham', vals);
    }
    if (filterDH.trim()) {
      const vals = filterDH.split(',').map(v=>v.trim()).filter(Boolean);
      if (vals.length > 0) q = q.in('ma_don_hang', vals);
    }
    if (searchText.trim()) {
      const term = searchText.trim().replace(/"/g, '');
      q = q.or(`ma_san_pham.ilike."%${term}%",ten_san_pham.ilike."%${term}%",ma_don_hang.ilike."%${term}%"`);
    }
    return q;
  }, [dateRange, filterSP, filterDH, searchText]);

  // ── Fetch (server-side) ──
  const fetchPage = useCallback(async () => {
    setLoading(true);
    let currentStep = 'data';
    try {
      const from = (page - 1) * pageSize;
      let q = buildQuery(false).range(from, from + pageSize - 1);
      if (sortCol) q = q.order(sortCol, { ascending: sortAsc });

      const { data, error } = await q;
      if (error) throw new Error(error.message || JSON.stringify(error));

      if (data?.length > 0 && columns.length === 0) {
        setColumns(orderColumns(Object.keys(data[0]).filter(k => k !== '__')));
      }
      setRows(data || []);
      setSelected(new Set());
      setLoading(false);

      // Fetch count in background so it doesn't block data rendering or trigger timeout alerts
      buildQuery(true).then(({ count, error: countErr }) => {
        if (!countErr && count !== null) {
          setTotalCount(count);
        }
      }).catch(() => {});

    } catch (e) {
      console.error('[Kho] fetchPage error at step:', currentStep, e);
      alert(`Lỗi khi tải (${currentStep}): ${e.message || JSON.stringify(e)}`);
    } finally { setLoading(false); }
  }, [buildQuery, page, sortCol, sortAsc, columns.length]);

  useEffect(() => { if (activeTab === 'xuat') fetchPage(); }, [fetchPage, activeTab]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // ── Actions ──
  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(new Set(rows.map(r => r.id)));
  const deselectAll = () => setSelected(new Set());
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Xóa ${selected.size} dòng đã chọn? Không thể hoàn tác!`)) return;
    setLoading(true);
    try {
      const { error } = await db.from('luu_xuat').delete().in('id', [...selected]);
      if (error) throw error;
      await fetchPage();
    } catch (e) { alert('Lỗi xóa: ' + (e.message || JSON.stringify(e))); setLoading(false); }
  };

  const handleSaveEdit = async (form) => {
    try {
      const { id, ...data } = form;
      // Convert so_luong to number if present
      if (data.so_luong != null) data.so_luong = Number(data.so_luong) || 0;
      const { error } = await db.from('luu_xuat').update(data).eq('id', id);
      if (error) throw error;
      setEditRow(null);
      await fetchPage();
    } catch (e) { alert('Lỗi cập nhật: ' + (e.message || JSON.stringify(e))); }
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
    setPage(1);
  };

  const applyFilters = () => setPage(1);

  // Khi thay đổi pageSize
  useEffect(() => {
    setPage(1);
    fetchPage();
  }, [pageSize]);

  const exportCSV = async () => {
    setLoading(true);
    try {
      let q = buildQuery(false);
      if (sortCol) q = q.order(sortCol, { ascending: sortAsc });
      q = q.limit(50000);
      const { data } = await q;
      if (!data?.length) { alert('Không có dữ liệu'); setLoading(false); return; }
      const cols = Object.keys(data[0]).filter(k=>k!=='__');
      const header = cols.map(colLabel).join(',');
      const body = data.map(r => cols.map(c => { const v=fmtCell(r[c]); return v.includes(',')||v.includes('"')?`"${v.replace(/"/g,'""')}"`:v; }).join(',')).join('\n');
      const blob = new Blob(['\uFEFF'+header+'\n'+body], {type:'text/csv;charset=utf-8;'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`kho_hang_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    } catch(e) { alert('Lỗi xuất: '+e.message); }
    setLoading(false);
  };

  // ── Render ──
  return (
    <ModuleShell
      title="Kho Hàng"
      icon={Package}
      color="#0891b2"
      loading={loading}
      onRefresh={activeTab === 'xuat' ? () => { setPage(1); fetchPage(); } : undefined}
      onBack={activeTab !== 'menu' ? () => setActiveTab('menu') : undefined}
      tabs={
        activeTab !== 'menu' ? (
          <div style={{display:'flex',alignItems:'center',gap:6,flex:1,padding:'0.35rem 0',minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:5,overflowX:'auto',flex:1,minWidth:0}}>
              {(() => {
                const pinnedDefs = tabsConfig.filter(t=>t.visible && pinnedTabs.includes(t.id) && visibleTabIds.includes(t.id)).map(t=>ALL_TABS.find(a=>a.id===t.id)).filter(Boolean);
                const activeDef = ALL_TABS.find(t => t.id === activeTab);
                const showList = (activeDef && !pinnedDefs.some(d=>d.id===activeTab)) ? [activeDef, ...pinnedDefs] : pinnedDefs;
                return showList.map(tabDef => {
                  const active = activeTab===tabDef.id;
                  return (
                    <button key={tabDef.id} onClick={()=>setActiveTab(tabDef.id)} style={{
                      display:'inline-flex',alignItems:'center',flexShrink:0,
                      padding:'0.3rem 0.7rem',borderRadius:8,
                      fontSize:'0.74rem',fontWeight:active?700:600,whiteSpace:'nowrap',cursor:'pointer',
                      border:`1px solid ${active?tabDef.color:tabDef.color+'40'}`,
                      background:active?tabDef.color:tabDef.color+'14',
                      color:active?'#fff':tabDef.color,
                      transition:'all 0.15s'
                    }}>
                      {tabDef.short}
                    </button>
                  );
                });
              })()}
            </div>
            <button onClick={()=>setShowTabPicker(true)} style={{
              display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,
              padding:'0.35rem 0.6rem',borderRadius:9,border:'1px solid #e2e8f0',background:'#fff',
              color:'#475569',fontSize:'0.75rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'
            }} title="Xem tất cả chức năng Kho">
              <LayoutGrid size={15}/> Tất cả
            </button>
          </div>
        ) : null
      }
    >

      {showTabSettings && (
        <TabSettingsModal config={tabsConfig} setConfig={setTabsConfig} onClose={() => setShowTabSettings(false)} />
      )}

      {/* Bảng lưới chọn tab (mở từ thanh tab 1 dòng) */}
      {showTabPicker && (
        <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'0.75rem'}}>
          <div onClick={()=>setShowTabPicker(false)} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.35)',backdropFilter:'blur(2px)'}}/>
          <div style={{position:'relative',zIndex:1,background:'#fff',borderRadius:16,boxShadow:'0 20px 40px rgba(0,0,0,0.25)',width:'100%',maxWidth:430,marginTop:'2.5rem',padding:'0.9rem',animation:'fadeIn 0.15s ease-out',maxHeight:'82vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
              <span style={{fontSize:'0.95rem',fontWeight:800,color:'#0f172a'}}>Chọn chức năng Kho</span>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>{setShowTabPicker(false);setShowTabSettings(true);}} style={{...s.btn,padding:'0.3rem 0.45rem'}} title="Ẩn/hiện & sắp xếp tab"><Settings size={15}/></button>
                <button onClick={()=>setShowTabPicker(false)} style={{...s.btn,padding:'0.3rem 0.45rem'}}><X size={15}/></button>
              </div>
            </div>
            <p style={{margin:'0 0 0.7rem 0',fontSize:'0.72rem',color:'#94a3b8',display:'flex',alignItems:'center',gap:4}}><Star size={13} color="#f59e0b" fill="#f59e0b"/> Chạm ngôi sao để ghim tab dùng thường xuyên ra thanh ngoài.</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8}}>
              {tabsConfig.filter(t => t.visible && visibleTabIds.includes(t.id)).map(tConfig => {
                const tabDef = ALL_TABS.find(t => t.id === tConfig.id);
                if (!tabDef) return null;
                const Icon = tabDef.icon;
                const active = activeTab===tabDef.id;
                const pinned = pinnedTabs.includes(tabDef.id);
                return (
                  <button key={tabDef.id} onClick={()=>{setActiveTab(tabDef.id);setShowTabPicker(false);}} style={{
                    position:'relative',
                    display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'0.7rem 0.25rem',borderRadius:12,cursor:'pointer',
                    border:`1.5px solid ${active?tabDef.color:'#eef2f7'}`,
                    background:active?tabDef.color+'14':'#fff',transition:'all 0.15s'
                  }}>
                    <span onClick={(e)=>{e.stopPropagation(); setPinnedTabs(p=>p.includes(tabDef.id)?p.filter(x=>x!==tabDef.id):[...p,tabDef.id]);}}
                      title={pinned?'Bỏ ghim khỏi thanh ngoài':'Ghim ra thanh ngoài'}
                      style={{position:'absolute',top:5,right:5,width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:7,background:pinned?'#fffbeb':'#f1f5f9',cursor:'pointer'}}>
                      <Star size={15} color={pinned?'#f59e0b':'#cbd5e1'} fill={pinned?'#f59e0b':'none'}/>
                    </span>
                    <div style={{width:38,height:38,borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',background:tabDef.color,boxShadow:`0 3px 8px ${tabDef.color}40`}}>
                      <Icon size={19} color="#fff"/>
                    </div>
                    <span style={{fontSize:'0.7rem',fontWeight:active?800:600,color:active?tabDef.color:'#334155',textAlign:'center',lineHeight:1.15}}>{tabDef.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'menu' ? (
        <main style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', background: '#f8fafc', overflowY: 'auto'}}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            maxWidth: 800,
            width: '100%',
          }}>
            {tabsConfig.filter(t => t.visible && visibleTabIds.includes(t.id)).map(tConfig => {
              const tabDef = ALL_TABS.find(t => t.id === tConfig.id);
              if (!tabDef) return null;
              const Icon = tabDef.icon;
              return (
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
                    background: tabDef.color || '#0891b2',
                    boxShadow: `0 4px 12px ${(tabDef.color||'#0891b2')}33`,
                  }}>
                    <Icon size={24} color="#fff" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center' }}>
                    {tabDef.label}
                  </h3>
                </button>
              )
            })}
          </div>
          <button onClick={()=>setShowTabSettings(true)} style={{...s.btn, marginTop: '2rem', background: '#f1f5f9', color: '#64748b', border: 'none'}}>
            <Settings size={14}/> Cấu hình hiển thị Phân hệ
          </button>
        </main>
      ) : activeTab === 'ton-kho-tong' ? (
        <StockSummaryTab navigateTo={navigateTo} perms={perms} />
      ) : activeTab === 'ton-kho' ? (
        <InventoryTab perms={perms} />
      ) : activeTab === 'ton-kho-sx' ? (
        <WipStockTab perms={perms} />
      ) : activeTab === 'danh-muc' ? (
        <CatalogTab perms={perms} />
      ) : activeTab === 'danh-muc-ncc' ? (
        <SupplierTab perms={perms} />
      ) : activeTab === 'bom' ? (
        <BomTab perms={perms} />
      ) : activeTab === 'lenh-sx' ? (
        <ProductionOrderTab sxPrefill={sxPrefill} onSxConsumed={() => setSxPrefill(null)} perms={perms} />
      ) : activeTab === 'lich-su-boc-do' ? (
        <PickingLogsTab />
      ) : activeTab === 'dksx' ? (
        <DKSXTab navigateTo={navigateTo} perms={perms} />
      ) : activeTab === 'de-xuat-dat-hang' ? (
        <OrderProposalTab navigateTo={navigateTo} perms={perms} />
      ) : activeTab === 'nhap-kho' ? (
        <ImportStockTab dlkPrefill={dlkPrefill} onDlkConsumed={() => setDlkPrefill(null)} onImportComplete={() => { if (importReturnTab) { setActiveTab(importReturnTab); setImportReturnTab(null); } }} perms={perms} catalogCreatePerm={getTabPerm(user, 'kho', 'danh-muc').create} />
      ) : activeTab === 'print_queue' ? (
        <PrintQueueTab />
      ) : activeTab === 'du-lieu-nhap' ? (
        <ImportLogsTab perms={perms} />
      ) : activeTab === 'luu-xuat' ? (
        <SaveExportTab perms={perms} />
      ) : activeTab === 'ton-kho-so-sach' ? (
        <BookInventoryTab perms={perms} />
      ) : (
        <>
          {/* Filter row (below tab bar, always visible for 'xuat') */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.3rem 0.4rem',display:'flex',alignItems:'center',gap:4,flexWrap:'nowrap'}}>
        <DateRangeDropdown label="Ngày" value={dateRange} onChange={v => { setDateRange(v); setPage(1); }} />
        <div style={{flexShrink:0}}>
          <AutoSuggest value={filterSP} onChange={v=>{setFilterSP(v);setPage(1);}} placeholder="Mã SP" columnName="ma_san_pham" isOpen={openDropdown==='sp'} onToggle={v=>setOpenDropdown(v?'sp':null)}/>
        </div>
        <div style={{flexShrink:0}}>
          <AutoSuggest value={filterDH} onChange={v=>{setFilterDH(v);setPage(1);}} placeholder="Mã ĐH" columnName="ma_don_hang" isOpen={openDropdown==='dh'} onToggle={v=>setOpenDropdown(v?'dh':null)}/>
        </div>
        <div style={{position:'relative',flex:1,minWidth:50}}>
          <Search size={12} style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
          <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Tìm" style={{...s.input,width:'100%',fontSize:'0.72rem',padding:'0.25rem 0.35rem 0.25rem 22px',boxSizing:'border-box'}}/>
        </div>
        <ColumnToggle columns={columns} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols}/>
      </div>

      {/* Content */}
      <main style={{flex:1,paddingTop:'0.4rem',paddingLeft:'0.5rem',paddingRight:'0.5rem',paddingBottom:'4rem',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
        {/* Chỉ báo đã chọn (chỉ hiện khi có chọn) */}
        {!loading && selected.size > 0 && (
          <span style={{...s.pill('#fef2f2','#ef4444'),alignSelf:'flex-start'}}>✓ Đã chọn {selected.size}</span>
        )}

        {/* Table */}
        <div style={{flex:1,background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          {loading ? (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,height:300}}>
              <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#0891b2'}}/>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải...</p>
            </div>
          ) : (
            <div style={{overflowX:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                <thead>
                  <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'0.5rem',borderBottom:'2px solid #e2e8f0',width:36,textAlign:'center'}}>
                      <input type="checkbox" checked={allSelected} onChange={()=>allSelected?deselectAll():selectAll()} style={{cursor:'pointer',accentColor:'#2563eb'}}/>
                    </th>
                    <th style={{padding:'0.5rem',borderBottom:'2px solid #e2e8f0',width:32,textAlign:'center',color:'#94a3b8',fontSize:'0.68rem',fontWeight:700}}>#</th>
                    {columns.filter(col=>!hiddenCols.has(col)).map(col=>(
                      <th key={col} onClick={()=>handleSort(col)} style={{
                        padding:'0.4rem 0.45rem',textAlign:'left',fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em',
                        color:sortCol===col?'#0891b2':'#64748b',borderBottom:`2px solid ${sortCol===col?'#0891b2':'#e2e8f0'}`,
                        cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'
                      }}>
                        {(SHORT_HDR[col]||colLabel(col))}{sortCol===col?(sortAsc?' ↑':' ↓'):''}
                      </th>
                    ))}
                    <th style={{padding:'0.5rem',borderBottom:'2px solid #e2e8f0',width:44,textAlign:'center',color:'#94a3b8',fontSize:'0.68rem',fontWeight:700}}>SỬA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={columns.filter(c=>!hiddenCols.has(c)).length+3} style={{padding:'3rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Không có dữ liệu</td></tr>
                  ) : rows.map((row,ri) => {
                    const isSel = selected.has(row.id);
                    return (
                      <tr key={row.id??ri} style={{borderBottom:'1px solid #f1f5f9',background:isSel?'#eff6ff':'',transition:'background 0.1s'}}
                        onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#f8fafc'}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=''}}>
                        <td style={{padding:'0.4rem 0.5rem',textAlign:'center'}}>
                          <input type="checkbox" checked={isSel} onChange={()=>toggleSelect(row.id)} style={{cursor:'pointer',accentColor:'#2563eb'}}/>
                        </td>
                        <td style={{padding:'0.4rem',textAlign:'center',color:'#cbd5e1',fontSize:'0.68rem',fontWeight:600}}>{(page-1)*pageSize+ri+1}</td>
                        {columns.filter(col=>!hiddenCols.has(col)).map(col=>{
                          const v=row[col], isNum=typeof v==='number';
                          // Cột Mã SP: gộp Mã + Tên (tự xuống dòng) — ô co giãn lấp đầy, đồng bộ với tab Lưu xuất
                          if (col==='ma_san_pham') {
                            return (
                              <td key={col} style={{padding:'0.3rem 0.5rem',maxWidth:130}}>
                                <div style={{fontWeight:600,color:'#0284c7',whiteSpace:'normal',wordBreak:'break-word',lineHeight:1.2}}>{row.ma_san_pham}</div>
                                {row.ten_san_pham && <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic',whiteSpace:'normal',wordBreak:'break-word',marginTop:1}}>{row.ten_san_pham}</div>}
                              </td>
                            );
                          }
                          return <td key={col} style={{padding:'0.3rem 0.5rem',color:v==null?'#cbd5e1':'#334155',textAlign:isNum?'right':'left',whiteSpace:'nowrap',fontWeight:isNum?600:400,fontVariantNumeric:isNum?'tabular-nums':undefined,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis'}}>{fmtCell(v)}</td>;
                        })}
                        <td style={{padding:'0.4rem',textAlign:'center'}}>
                          {perms.edit && <button onClick={()=>setEditRow(row)} style={{background:'none',border:'none',cursor:'pointer',color:'#3b82f6',padding:2}} title="Sửa"><Edit3 size={14}/></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,paddingBottom:'0.5rem'}}>
            <button onClick={()=>setPage(1)} disabled={page===1} style={{...s.btn,opacity:page===1?0.4:1}}>«</button>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{...s.btn,opacity:page===1?0.4:1}}><ChevronLeft size={14}/></button>
            {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
              let p; if(totalPages<=7)p=i+1; else if(page<=4)p=i+1; else if(page>=totalPages-3)p=totalPages-6+i; else p=page-3+i;
              return <button key={p} onClick={()=>setPage(p)} style={{...s.btn,border:`1px solid ${p===page?'#0891b2':'#e2e8f0'}`,background:p===page?'#0891b2':'#fff',color:p===page?'#fff':'#64748b',fontWeight:700}}>{p}</button>;
            })}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{...s.btn,opacity:page===totalPages?0.4:1}}><ChevronRight size={14}/></button>
            <button onClick={()=>setPage(totalPages)} disabled={page===totalPages} style={{...s.btn,opacity:page===totalPages?0.4:1}}>»</button>
          </div>
        )}
      </main>
        </>
      )}

      {/* Edit Modal */}
      {editRow && <EditModal row={editRow} columns={columns} onSave={handleSaveEdit} onClose={()=>setEditRow(null)}/>}
      {/* Import Modal */}
      {showImport && <ImportModal onClose={()=>setShowImport(false)} onSuccess={()=>{setShowImport(false);setPage(1);fetchPage();}}/>
      }

      {/* ── Bottom Action Bar (fixed, per-tab) ── */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:50,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(12px)',borderTop:'1px solid #e2e8f0',padding:'0.4rem 0.75rem',display:'flex',alignItems:'center',gap:5,flexWrap:'nowrap',overflowX:'auto',WebkitOverflowScrolling:'touch',boxShadow:'0 -4px 16px rgba(0,0,0,0.07)'}}>
        {activeTab === 'xuat' && <>
          <span style={{...s.pill('#e0f2fe','#0369a1'),flexShrink:0}} title="Tổng số dòng">📦 {totalCount.toLocaleString('vi-VN')}</span>
          <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{...s.input,padding:'0.25rem 0.35rem',fontSize:'0.72rem',flexShrink:0}} title="Số dòng mỗi trang">
            <option value={50}>50</option><option value={100}>100</option><option value={500}>500</option><option value={1000}>1.000</option><option value={5000}>5.000</option><option value={10000}>10.000</option>
          </select>
          {selected.size > 0 && <>
            <span style={{...s.pill('#fef2f2','#ef4444'),flexShrink:0}}>✓ {selected.size}</span>
            {perms.delete && <button onClick={handleDelete} style={{...s.btn,...s.btnD,fontSize:'0.75rem',flexShrink:0}}><Trash2 size={13}/>Xóa</button>}
            <button onClick={deselectAll} style={{...s.btn,fontSize:'0.75rem',padding:'0.35rem 0.4rem',flexShrink:0}}><X size={13}/></button>
          </>}
          <button onClick={exportCSV} disabled={loading} style={{...s.btn,color:'#059669',flexShrink:0,marginLeft:'auto'}}><Download size={14}/>CSV</button>
          {perms.io && <button onClick={()=>setShowImport(true)} disabled={loading} style={{...s.btn,color:'#7c3aed',flexShrink:0}}><Upload size={14}/>Import</button>}
          <button onClick={()=>{setPage(1);fetchPage();}} disabled={loading} style={{...s.btn,padding:'0.35rem 0.4rem',flexShrink:0}} title="Làm mới">
            <RefreshCw size={14} style={{animation:loading?'spin 1s linear infinite':'none',color:'#0891b2'}}/>
          </button>
        </>}
        {/* activeTab === 'nhap' && <> ... future tab actions ... </> */}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </ModuleShell>
  );
}
