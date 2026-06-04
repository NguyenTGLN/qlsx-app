import React, { useState, useMemo, useRef, useEffect } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb } from '../../lib/task_supabase';
import { 
   Search, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
   Edit, Trash2, Save, X, Calendar as CalendarIcon, Download, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTabPerm } from '../../lib/AuthContext';

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
     <div ref={wrapperRef} style={{ position: 'relative', flex: '1 1 180px', minWidth: '150px', maxWidth: '300px' }}>
         <div onClick={() => setOpen(!open)} style={{ border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', borderRadius: '8px', cursor: 'pointer', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', minHeight: '38px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, alignItems: 'center', overflow: 'hidden' }}>
               {selected.length === 0 ? (
                 <span style={{fontWeight: 600, fontSize:'0.85rem', color: '#475569', paddingLeft: '4px'}}>Tất cả {placeholder}</span>
               ) : (
                 <>
                   {selected.slice(0, 2).map(item => (
                      <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                         {item}
                         <span onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x !== item)); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', background: '#dbeafe', color: '#3b82f6', fontWeight: 700, fontSize: '0.7rem', lineHeight: 1 }}>&times;</span>
                      </span>
                   ))}
                   {selected.length > 2 && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e40af', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>+{selected.length - 2}</span>}
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
                             <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: isSelected ? 'none' : '1px solid #cbd5e1', background: isSelected ? '#3b82f6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '0.8rem', flexShrink: 0 }}>
                                {isSelected && <Check size={12} color="#fff" />}
                             </div>
                             <span style={{ fontSize: '0.85rem', color: isSelected ? '#1e293b' : '#475569', fontWeight: isSelected ? 600 : 400 }}>{o}</span>
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

const DateRangeDropdown = ({ label, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const presets = [
    'Tất cả', 'Hôm nay', 'Hôm qua', 'Tuần này',
    'Tuần trước', 'Tháng này', 'Tháng trước',
    'Năm nay', 'Năm trước'
  ];

  const handlePreset = (p) => {
    let from = '', to = '';
    const now = new Date();
    const f = (d) => {
       if(!d) return '';
       const pad = n => n < 10 ? '0'+n : n;
       return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }
    
    if (p === 'Hôm nay') {
       from = f(now); to = f(now);
    } else if (p === 'Hôm qua') {
       const y = new Date(now); y.setDate(y.getDate() - 1);
       from = f(y); to = f(y);
    } else if (p === 'Tuần này') {
       const w = now.getDay();
       const diff = now.getDate() - w + (w === 0 ? -6 : 1);
       const s = new Date(now); s.setDate(diff);
       const e = new Date(s); e.setDate(e.getDate() + 6);
       from = f(s); to = f(e);
    } else if (p === 'Tuần trước') {
       const w = now.getDay();
       const diff = now.getDate() - w + (w === 0 ? -6 : 1) - 7;
       const s = new Date(now); s.setDate(diff);
       const e = new Date(s); e.setDate(e.getDate() + 6);
       from = f(s); to = f(e);
    } else if (p === 'Tháng này') {
       const s = new Date(now.getFullYear(), now.getMonth(), 1);
       const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
       from = f(s); to = f(e);
    } else if (p === 'Tháng trước') {
       const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
       const e = new Date(now.getFullYear(), now.getMonth(), 0);
       from = f(s); to = f(e);
    } else if (p === 'Năm nay') {
       const s = new Date(now.getFullYear(), 0, 1);
       const e = new Date(now.getFullYear(), 11, 31);
       from = f(s); to = f(e);
    } else if (p === 'Năm trước') {
       const s = new Date(now.getFullYear() - 1, 0, 1);
       const e = new Date(now.getFullYear() - 1, 11, 31);
       from = f(s); to = f(e);
    }
    
    onChange({ preset: p, from, to });
    if(p !== 'Tùy chỉnh' && p !== 'Tất cả') setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
       <div onClick={() => setOpen(!open)} style={{ border: '1px solid #cbd5e1', padding: '0.4rem 0.6rem', borderRadius: '8px', cursor: 'pointer', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '38px', fontSize: '0.85rem' }}>
          <CalendarIcon size={16} color="#64748b" />
          <span style={{ color: '#475569', fontWeight: 600 }}>{label}:</span>
          <span style={{ color: '#1e40af', fontWeight: 700 }}>{value.preset}</span>
          <ChevronDown size={14} color="#64748b" style={{ marginLeft: '0.2rem' }} />
       </div>
       {open && (
         <div className="responsive-pop" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '320px', padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
               {presets.map(p => (
                  <button key={p} onClick={() => handlePreset(p)} style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, border: value.preset === p ? 'none' : '1px solid #e2e8f0', background: value.preset === p ? '#3b82f6' : '#fff', color: value.preset === p ? '#fff' : '#475569', cursor: 'pointer', transition: '0.2s' }}>
                     {p}
                  </button>
               ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>
                  ⏱ KHOẢNG THỜI GIAN TÙY CHỈNH
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>Từ</div>
                     <input type="date" value={value.from} onChange={e => onChange({ preset: 'Tùy chỉnh', from: e.target.value, to: value.to })} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none' }} />
                  </div>
                  <div style={{ marginTop: '1rem', color: '#94a3b8' }}>→</div>
                  <div style={{ flex: 1 }}>
                     <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>Đến</div>
                     <input type="date" value={value.to} onChange={e => onChange({ preset: 'Tùy chỉnh', from: value.from, to: e.target.value })} style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none' }} />
                  </div>
               </div>
            </div>
         </div>
       )}
    </div>
  );
};

const WarrantyDataManager = ({ data, refreshData }) => {
  const p = useTabPerm('warranty', 'dataManager');
  // Config columns dynamically
  const allColumns = useMemo(() => {
    if (!data || data.length === 0) return [
        { key: 'phiếu_ghi', label: 'Phiếu Ghi', type: 'text' },
        { key: 'mã_đơn_hàng', label: 'Mã Đơn Hàng', type: 'text' },
        { key: 'mã_sản_phẩm', label: 'Mã SP', type: 'text' },
        { key: 'ngày_cập_nhật', label: 'Ngày Cập Nhật', type: 'date' }
    ];
    
    const keys = new Set();
    data.forEach(item => {
      Object.keys(item).forEach(k => keys.add(k));
    });
    
    const knownCols = [
      { key: 'phiếu_ghi', label: 'Phiếu Ghi', type: 'text' },
      { key: 'id_phiếu_ghi', label: 'ID Phiếu', type: 'text' },
      { key: 'mã_đơn_hàng', label: 'Mã Đơn Hàng', type: 'text' },
      { key: 'mã_sản_phẩm', label: 'Mã SP', type: 'text' },
      { key: 'nhóm_sản_phẩm', label: 'Nhóm SP', type: 'text' },
      { key: 'số_điện_thoại_khách_hàng', label: 'SĐT Khách', type: 'text' },
      { key: 'ngày_lắp_đặt', label: 'Ngày Lắp', type: 'date' },
      { key: 'thời_điểm_tạo', label: 'Ngày Tạo', type: 'date' },
      { key: 'thời_điểm_cập_nhật', label: 'Thời Điểm Cập Nhật', type: 'date' },
      { key: 'ngày_cập_nhật', label: 'Ngày Cập Nhật', type: 'date' },
      { key: 'updated_at', label: 'Thời Gian Cập Nhật', type: 'date' },
      { key: 'linh_kiện', label: 'Linh Kiện Lỗi', type: 'text' },
      { key: 'chi_tiết_lỗi', label: 'Chi Tiết Lỗi', type: 'text' },
      { key: 'trạng_thái_phiếu_ghi', label: 'Trạng Thái', type: 'status' },
      { key: 'đáp_ứng_sla', label: 'SLA', type: 'badge' }
    ];
    
    const knownKeys = knownCols.map(c => c.key);
    const result = [...knownCols.filter(c => keys.has(c.key) || c.key === 'ngày_cập_nhật')];
    
    Array.from(keys).forEach(k => {
      if (!knownKeys.includes(k) && k !== 'count' && k !== 'undefined') {
         let type = 'text';
         if (k.includes('ngày') || k.includes('thời_gian') || k.includes('thời_điểm') || k.includes('_at')) type = 'date';
         let label = k.replace(/_/g, ' ');
         label = label.charAt(0).toUpperCase() + label.slice(1);
         result.push({ key: k, label: label, type });
      }
    });
    
    const finalCols = result.filter(c => {
       if (c.key === 'ngày_cập_nhật' && !keys.has('ngày_cập_nhật')) return false;
       return true;
    });

    return finalCols;
  }, [data]);

  const [visibleCols, setVisibleCols] = usePersistedState('wdm_visibleCols', ['phiếu_ghi', 'mã_đơn_hàng', 'mã_sản_phẩm', 'số_điện_thoại_khách_hàng', 'ngày_lắp_đặt', 'thời_điểm_tạo', 'thời_điểm_cập_nhật', 'linh_kiện', 'chi_tiết_lỗi', 'trạng_thái_phiếu_ghi']);

  useEffect(() => {
     if (allColumns.length > 0) {
        const availableKeys = allColumns.map(c => c.key);
        setVisibleCols(prev => {
            const valid = prev.filter(k => availableKeys.includes(k));
            if (valid.length === 0) return availableKeys.slice(0, 10);
            return valid;
        });
     }
  }, [allColumns]);

  const [showColMenu, setShowColMenu] = useState(false);
  
  // Filter States (persisted)
  const [globalSearch, setGlobalSearch] = usePersistedState('wdm_globalSearch', '');
  const [filterProducts, setFilterProducts] = usePersistedState('wdm_filterProducts', []);
  const [filterErrors, setFilterErrors] = usePersistedState('wdm_filterErrors', []);
  const [createdDateFilter, setCreatedDateFilter] = usePersistedState('wdm_createdDateFilter', { preset: 'Tất cả', from: '', to: '' });
  const [updatedDateFilter, setUpdatedDateFilter] = usePersistedState('wdm_updatedDateFilter', { preset: 'Tất cả', from: '', to: '' });
  
  const { availableProducts, availableErrors } = useMemo(() => {
     const prods = new Set();
     const errs = new Set();
     data.forEach(tk => {
        const pd = String(tk['mã_sản_phẩm'] || '').trim().toUpperCase();
        const err = String(tk['chi_tiết_lỗi'] || '').trim();
        if (pd) prods.add(pd);
        if (err && err !== 'undefined' && err !== 'null') errs.add(err);
     });
     return { availableProducts: Array.from(prods).sort(), availableErrors: Array.from(errs).sort() };
  }, [data]);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = usePersistedState('wdm_rowsPerPage', 50);
  
  // Sort State (persisted)
  const [sortConfig, setSortConfig] = usePersistedState('wdm_sortConfig', { key: 'thời_điểm_tạo', direction: 'desc' });

  // Modal State
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Selection state
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

  // Column Toggle
  const toggleCol = (key) => {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Sorting Handler
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  // Lọc và Sắp Xếp dữ liệu (Client-side)
  const processedData = useMemo(() => {
    let result = [...data];

    const parseDateRobust = (dStr) => {
      if (!dStr) return new Date(NaN);
      let s = String(dStr).trim().replace(/Z$/i, ''); // Strip Z to treat as local time
      if (s.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(s);
      
      const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const tMatch = s.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
        return new Date(match[3], parseInt(match[2])-1, parseInt(match[1]), tMatch?parseInt(tMatch[1]):0, tMatch?parseInt(tMatch[2]):0, tMatch?parseInt(tMatch[3]):0);
      }
      return new Date(s);
    };

    // Global Search
    if (globalSearch) {
       const lowerVal = globalSearch.toLowerCase();
       result = result.filter(item => {
          return visibleCols.some(key => 
             String(item[key] || '').toLowerCase().includes(lowerVal)
          );
       });
    }

    // Product Filter
    if (filterProducts.length > 0) {
       result = result.filter(item => {
          const pd = String(item['mã_sản_phẩm'] || '').trim().toUpperCase();
          return filterProducts.includes(pd);
       });
    }

    // Error Filter
    if (filterErrors.length > 0) {
       result = result.filter(item => {
          const err = String(item['chi_tiết_lỗi'] || '').trim();
          return filterErrors.includes(err);
       });
    }

    // Date Filters
    if (createdDateFilter.preset !== 'Tất cả') {
       if (createdDateFilter.from) {
          const dStart = new Date(createdDateFilter.from); dStart.setHours(0,0,0,0);
          result = result.filter(it => { const d = parseDateRobust(it.thời_điểm_tạo); return !isNaN(d) && d >= dStart; });
       }
       if (createdDateFilter.to) {
          const dEnd = new Date(createdDateFilter.to); dEnd.setHours(23,59,59,999);
          result = result.filter(it => { const d = parseDateRobust(it.thời_điểm_tạo); return !isNaN(d) && d <= dEnd; });
       }
    }
    
    if (updatedDateFilter.preset !== 'Tất cả') {
       if (updatedDateFilter.from) {
          const dStart = new Date(updatedDateFilter.from); dStart.setHours(0,0,0,0);
          result = result.filter(it => { const d = parseDateRobust(it.thời_điểm_cập_nhật || it.updated_at || it.ngày_cập_nhật); return !isNaN(d) && d >= dStart; });
       }
       if (updatedDateFilter.to) {
          const dEnd = new Date(updatedDateFilter.to); dEnd.setHours(23,59,59,999);
          result = result.filter(it => { const d = parseDateRobust(it.thời_điểm_cập_nhật || it.updated_at || it.ngày_cập_nhật); return !isNaN(d) && d <= dEnd; });
       }
    }

    // Sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key] || '';
        let valB = b[sortConfig.key] || '';
        if (sortConfig.key.includes('ngày') || sortConfig.key.includes('thời_điểm') || sortConfig.key.includes('_at')) {
           valA = parseDateRobust(valA).getTime() || 0;
           valB = parseDateRobust(valB).getTime() || 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, globalSearch, filterProducts, filterErrors, visibleCols, createdDateFilter, updatedDateFilter, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(processedData.length / rowsPerPage);
  const currentData = processedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const setPage = (p) => {
     if (p < 1) p = 1;
     if (p > totalPages) p = totalPages;
     setCurrentPage(p);
  }

  // --- SELECTION LOGIC ---
  const handleSelectRow = (id) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const currentPageIds = currentData.map(r => r.id_phiếu_ghi);
    const allSelected = currentPageIds.every(id => selectedRowIds.has(id));
    
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        currentPageIds.forEach(id => next.delete(id));
      } else {
        currentPageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => setSelectedRowIds(new Set());

  const exportToExcel = () => {
    if (selectedRowIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 dòng để xuất Excel!');
      return;
    }
    const dataToExport = processedData
      .filter(r => selectedRowIds.has(r.id_phiếu_ghi))
      .map(row => {
        const item = {};
        allColumns.forEach(c => {
           item[c.label] = row[c.key] || '';
        });
        return item;
      });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PhieuBaoHanh");
    XLSX.writeFile(workbook, `BaoHanh_Export_${new Date().getTime()}.xlsx`);
  };

  // --- ACTIONS ---
  
  // Mở Popup Sửa
  const openEdit = (row) => {
    setEditingRow(row);
    setEditForm({
      id_phiếu_ghi: row.id_phiếu_ghi,
      mã_đơn_hàng: row.mã_đơn_hàng || '',
      mã_sản_phẩm: row.mã_sản_phẩm || '',
      số_điện_thoại_khách_hàng: row.số_điện_thoại_khách_hàng || '',
      ngày_lắp_đặt: row.ngày_lắp_đặt || '',
      linh_kiện: row.linh_kiện || '',
      chi_tiết_lỗi: row.chi_tiết_lỗi || ''
    });
  };

  const handleEditChange = (k, v) => setEditForm(prev => ({...prev, [k]: v}));

  // Lưu Sửa
  const saveEdit = async () => {
    if(!editingRow) return;
    setIsSaving(true);
    try {
      const { error } = await taskDb
        .from('phieu_bao_hanh')
        .update({
           mã_đơn_hàng: editForm.mã_đơn_hàng,
           mã_sản_phẩm: editForm.mã_sản_phẩm,
           số_điện_thoại_khách_hàng: editForm.số_điện_thoại_khách_hàng,
           ngày_lắp_đặt: editForm.ngày_lắp_đặt || null,
           linh_kiện: editForm.linh_kiện,
           chi_tiết_lỗi: editForm.chi_tiết_lỗi
        })
        .eq('id_phiếu_ghi', editingRow.id_phiếu_ghi);
        
      if (error) throw error;
      alert('Đã cập nhật phiếu bảo hành thành công!');
      setEditingRow(null);
      if (refreshData) refreshData();
    } catch (e) {
      alert('Lỗi cập nhật dữ liệu: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Xóa Phiếu
  const handleDelete = async (row) => {
    const isConfirm = window.confirm(`CẢNH BÁO: Rất nguy hiểm!\nBạn chuẩn bị xóa vĩnh viễn phiếu bảo hành ${row.id_phiếu_ghi}. Thao tác này không thể hoàn tác.\nBạn có chắc chắn không?`);
    if(!isConfirm) return;

    try {
      const { error } = await taskDb
        .from('phieu_bao_hanh')
        .delete()
        .eq('id_phiếu_ghi', row.id_phiếu_ghi);
      
      if (error) throw error;
      alert('Đã xóa phiếu bảo hành thành công!');
      if (refreshData) refreshData();
    } catch (e) {
      alert('Lỗi xóa dữ liệu: ' + e.message);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', animation: 'fadeIn 0.3s', maxWidth: '100%', overflowX: 'hidden' }}>
      
      {/* 1. THANH LỌC MỚI (NEW FILTER BAR) */}
      <div className="filter-bar" style={{ background: '#fff', padding: '1rem 0.8rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1rem', display:'flex', gap:'0.8rem', alignItems:'center', flexWrap: 'wrap', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginRight: '0.5rem' }}>
             <Filter size={18} color="#3b82f6"/> BỘ LỌC TỔNG HỢP
          </div>
          
          <DateRangeDropdown 
             label="Ngày tạo"
             value={createdDateFilter}
             onChange={(v) => { setCreatedDateFilter(v); setCurrentPage(1); }}
          />

          <DateRangeDropdown 
             label="Ngày cập nhật"
             value={updatedDateFilter}
             onChange={(v) => { setUpdatedDateFilter(v); setCurrentPage(1); }}
          />

          <MultiSelectDropdown 
             options={availableProducts}
             selected={filterProducts}
             onChange={(v) => { setFilterProducts(v); setCurrentPage(1); }}
             placeholder="Mã SP"
          />

          <MultiSelectDropdown 
             options={availableErrors}
             selected={filterErrors}
             onChange={(v) => { setFilterErrors(v); setCurrentPage(1); }}
             placeholder="Chi tiết lỗi"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', flex: '1 1 200px', minWidth: '200px' }}>
             <Search size={16} color="#94a3b8" />
             <input 
                type="text" 
                placeholder="Tìm kiếm nội dung (SĐT, Phiếu, Chi tiết lỗi...)" 
                value={globalSearch}
                onChange={e => { setGlobalSearch(e.target.value); setCurrentPage(1); }}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }} 
             />
          </div>
      </div>

      {/* 2. THANH CÔNG CỤ (TOOLBAR) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem', padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Export Button */}
          {selectedRowIds.size > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {p.io && (
                <button onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#10b981', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(16,185,129,0.2)' }}>
                  <Download size={16}/> Xuất Excel ({selectedRowIds.size})
                </button>
              )}
              <button onClick={handleClearSelection} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                Bỏ chọn
              </button>
            </div>
          )}
        </div>

        {/* Ẩn Hiện Cột */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowColMenu(!showColMenu)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <Filter size={16}/> Ẩn / Hiện Cột
          </button>
          {showColMenu && (
             <div className="responsive-pop" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', padding: '1rem', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '250px', maxHeight: '400px', overflowY: 'auto' }}>
                <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '0.85rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>Các cột hiển thị</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                   {allColumns.map(col => (
                     <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={visibleCols.includes(col.key)} onChange={() => toggleCol(col.key)} />
                        {col.label}
                     </label>
                   ))}
                </div>
             </div>
          )}
        </div>
      </div>

      {/* 3. BẢNG DỮ LIỆU */}
      <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', WebkitOverflowScrolling: 'touch' }}>
         <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
            <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 10 }}>
               <tr>
                  <th style={{ padding: '1rem 0.5rem', borderBottom: '2px solid #e2e8f0', verticalAlign: 'middle', width: '30px' }}>
                     <input 
                       type="checkbox"
                       checked={currentData.length > 0 && currentData.every(r => selectedRowIds.has(r.id_phiếu_ghi))}
                       ref={input => {
                         if (input) {
                           const someSelected = currentData.some(r => selectedRowIds.has(r.id_phiếu_ghi));
                           const allSelected = currentData.every(r => selectedRowIds.has(r.id_phiếu_ghi));
                           input.indeterminate = someSelected && !allSelected;
                         }
                       }}
                       onChange={handleSelectAll}
                       style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                     />
                  </th>
                  {allColumns.filter(c => visibleCols.includes(c.key)).map(col => (
                     <th 
                       key={col.key} 
                       style={{ padding: '1rem 0.5rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap', verticalAlign: 'middle', cursor: 'pointer' }}
                       onClick={() => handleSort(col.key)}
                     >
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                         {col.label}
                         {sortConfig.key === col.key && (sortConfig.direction === 'asc' ? <ChevronUp size={14} color="#3b82f6"/> : <ChevronDown size={14} color="#3b82f6"/>)}
                       </div>
                     </th>
                  ))}
                  <th style={{ padding: '1rem 1rem', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: '0.75rem', color: '#475569', textAlign: 'right', verticalAlign: 'middle' }}>Thao Tác</th>
               </tr>
            </thead>
            <tbody>
               {currentData.length === 0 ? (
                  <tr>
                     <td colSpan={visibleCols.length + 2} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                        Không tìm thấy dữ liệu phù hợp với bộ lọc hiện tại.
                     </td>
                  </tr>
               ) : currentData.map((row, rowIndex) => {
                  const isSelected = selectedRowIds.has(row.id_phiếu_ghi);
                  const rowBg = isSelected ? '#eff6ff' : (rowIndex % 2 === 0 ? '#fff' : '#f8fafc');
                  return (
                  <tr key={row.id_phiếu_ghi} style={{ borderBottom: '1px solid #f1f5f9', background: rowBg, transition: 'all 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background=rowBg}>
                     <td style={{ padding: '0.6rem 0.5rem' }}>
                        <input 
                           type="checkbox" 
                           checked={isSelected}
                           onChange={() => handleSelectRow(row.id_phiếu_ghi)}
                           style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                        />
                     </td>
                     {allColumns.filter(c => visibleCols.includes(c.key)).map(col => (
                        <td key={col.key} style={{ padding: '0.6rem 0.5rem', fontSize: '0.75rem', color: '#334155', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: col.key==='chi_tiết_lỗi' ? 'normal' : 'nowrap' }}>
                           {col.type === 'badge' ? (
                             row[col.key] === 'Không đáp ứng SLA' 
                                ? <span style={{ background: '#fee2e2', color: '#ef4444', padding: '3px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.75rem', border: '1px solid #fca5a5' }}>Quá Hạn</span>
                                : <span style={{ background: '#dcfce3', color: '#10b981', padding: '3px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '0.75rem', border: '1px solid #86efac' }}>Đạt</span>
                           ) : col.type === 'status' ? (
                             row[col.key] === 'new' ? <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '4px 10px', borderRadius: '16px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #bae6fd' }}>Mới tạo</span> :
                             row[col.key] === 'processing' || row[col.key] === 'pending' ? <span style={{ background: '#fef3c7', color: '#d97706', padding: '4px 10px', borderRadius: '16px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fde68a' }}>Đang Xử Lý</span> :
                             row[col.key] === 'solved' || row[col.key] === 'closed' ? <span style={{ background: '#dcfce3', color: '#15803d', padding: '4px 10px', borderRadius: '16px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #bbf7d0' }}>Hoàn tất</span> :
                             <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '16px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', border: '1px solid #e2e8f0' }}>{row[col.key] || 'Trống'}</span>
                           ) : col.key === 'ngày_lắp_đặt' ? (
                             row[col.key] 
                                ? (String(row[col.key]).includes('T') ? new Date(String(row[col.key]).replace(/Z$/i, '')).toLocaleString('vi-VN') : row[col.key]) 
                                : <span style={{ color: '#ef4444', fontStyle: 'italic', fontSize: '0.8rem', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>Chưa cập nhật</span>
                           ) : col.type === 'date' ? (
                             row[col.key] ? (String(row[col.key]).includes('T') || String(row[col.key]).match(/^\d{4}-\d{2}-\d{2}/) ? new Date(String(row[col.key]).replace(/Z$/i, '')).toLocaleString('vi-VN') : row[col.key]) : '-'
                           ) : (
                             row[col.key] || '-'
                           )}
                        </td>
                     ))}
                     <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                           {p.edit && (
                             <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#3b82f6', display: 'flex', alignItems: 'center', transition: '0.2s' }} title="Sửa phiếu">
                                <Edit size={16} />
                             </button>
                           )}
                           {p.delete && (
                             <button onClick={(e) => { e.stopPropagation(); handleDelete(row); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#ef4444', display: 'flex', alignItems: 'center', transition: '0.2s' }} title="Xóa phiếu vĩnh viễn">
                                <Trash2 size={16} />
                             </button>
                           )}
                        </div>
                     </td>
                  </tr>
                  );
               })}
            </tbody>
         </table>
      </div>

      {/* 4. ĐIỀU HƯỚNG PHÂN TRANG */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
         <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Hiển thị <b>{Math.min((currentPage - 1) * rowsPerPage + 1, processedData.length)}</b> đến <b>{Math.min(currentPage * rowsPerPage, processedData.length)}</b> trong tổng <b>{processedData.length}</b> dòng
         </div>
         <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Hiển thị: 
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} style={{ marginLeft: '0.5rem', outline: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 4px' }}>
                <option value={20}>20 dòng</option>
                <option value={50}>50 dòng</option>
                <option value={100}>100 dòng</option>
                <option value={500}>500 dòng</option>
              </select>
            </span>
            <div style={{ display: 'flex', gap: '0.2rem' }}>
              <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', background: currentPage <= 1 ? '#f8fafc' : '#fff', borderRadius: '6px', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}><ChevronLeft size={16}/></button>
              <span style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 500 }}>Trang {currentPage} / {totalPages || 1}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} style={{ padding: '0.4rem', border: '1px solid #e2e8f0', background: currentPage >= totalPages ? '#f8fafc' : '#fff', borderRadius: '6px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}><ChevronRight size={16}/></button>
            </div>
         </div>
      </div>

      {/* 5. MODAL CHỈNH SỬA */}
      {editingRow && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
            <div className="modal-card" style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '600px', padding: '1.25rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'fadeIn 0.2s', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                   <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>Chỉnh Sửa Phiếu {editingRow.id_phiếu_ghi}</h2>
                   <button onClick={() => setEditingRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={24}/></button>
                </div>
                
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                   <div style={customStyles.inputGroup}>
                      <label style={customStyles.label}>Mã Sản Phẩm</label>
                      <input type="text" value={editForm.mã_sản_phẩm} onChange={e => handleEditChange('mã_sản_phẩm', e.target.value)} style={customStyles.input} />
                   </div>
                   <div style={customStyles.inputGroup}>
                      <label style={customStyles.label}>Mã Đơn Hàng</label>
                      <input type="text" value={editForm.mã_đơn_hàng} onChange={e => handleEditChange('mã_đơn_hàng', e.target.value)} style={customStyles.input} />
                   </div>
                   <div style={customStyles.inputGroup}>
                      <label style={customStyles.label}>Số Điện Thoại Khách Hàng</label>
                      <input type="text" value={editForm.số_điện_thoại_khách_hàng} onChange={e => handleEditChange('số_điện_thoại_khách_hàng', e.target.value)} style={customStyles.input} />
                   </div>
                   <div style={customStyles.inputGroup}>
                      <label style={customStyles.label}>Ngày Lắp Đặt <span style={{fontWeight: 400, color: '#94a3b8'}}>(YYYY-MM-DD)</span></label>
                      <input type="date" value={editForm.ngày_lắp_đặt ? editForm.ngày_lắp_đặt.substring(0, 10) : ''} onChange={e => handleEditChange('ngày_lắp_đặt', e.target.value)} style={customStyles.input} />
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#b45309' }}> Bỏ trống nếu không xác định</p>
                   </div>
                   <div style={{...customStyles.inputGroup, gridColumn: 'span 2'}}>
                      <label style={customStyles.label}>Linh Kiện Cần Thay (Phân Cách Bằng Dấu Phẩy)</label>
                      <input type="text" value={editForm.linh_kiện} onChange={e => handleEditChange('linh_kiện', e.target.value)} style={customStyles.input} placeholder="Vd: Bơm, Nguồn" />
                   </div>
                   <div style={{...customStyles.inputGroup, gridColumn: 'span 2'}}>
                      <label style={customStyles.label}>Chi Tiết Lỗi (Phân Cách Bằng Dấu Phẩy)</label>
                      <textarea rows={3} value={editForm.chi_tiết_lỗi} onChange={e => handleEditChange('chi_tiết_lỗi', e.target.value)} style={{...customStyles.input, resize: 'vertical'}} placeholder="Vd: Máy kêu to, Nước chảy yếu"></textarea>
                   </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                   <button onClick={() => setEditingRow(null)} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                      Hủy Bỏ
                   </button>
                   <button onClick={saveEdit} disabled={isSaving} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', background: '#3b82f6', fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: isSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isSaving ? 'Đang lưu...' : <><Save size={16}/> Lưu Thay Đổi</>}
                   </button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

const customStyles = {
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.85rem', fontWeight: 600, color: '#334155' },
  input: { padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '0.9rem', width: '100%' }
};

export default WarrantyDataManager;
