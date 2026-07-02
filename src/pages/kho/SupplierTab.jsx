import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase as db, fetchAllRows } from '../../lib/supabase';
import { Search, Loader2, RefreshCw, Trash2, Edit3, Download, Upload, Check, Plus, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

// Cột & nhãn của danh mục nhà cung cấp. Thứ tự này cũng dùng cho form thêm/sửa + import/export.
const NCC_COLS = ['ma_ncc', 'ten_ncc', 'nguoi_lien_he', 'so_dien_thoai', 'dia_chi', 'ghi_chu'];
const NCC_LABELS = {
  ma_ncc: 'Mã NCC', ten_ncc: 'Tên NCC', nguoi_lien_he: 'Người liên hệ',
  so_dien_thoai: 'SĐT', dia_chi: 'Địa chỉ', ghi_chu: 'Ghi chú',
};

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.4rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

const blankRow = () => ({ ma_ncc:'', ten_ncc:'', nguoi_lien_he:'', so_dien_thoai:'', dia_chi:'', ghi_chu:'' });

export default function SupplierTab({ perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [editRow, setEditRow] = useState(null);
  const [addRow, setAddRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Danh mục nhỏ (vài trăm dòng) → tải TOÀN BỘ 1 lần, lọc & hiển thị phía client.
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await fetchAllRows(() =>
        db.from('nha_cung_cap').select('*').order('ten_ncc', { ascending: true }));
      if (error) throw error;
      setRows(data || []);
      setSelectedKeys(new Set());
    } catch (e) {
      console.error(e);
      // Bảng chưa tồn tại (chưa chạy sql/setup_nha_cung_cap.sql) → báo dịu, không vỡ giao diện.
      setLoadError(e.message || 'Không tải được danh mục NCC');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  // Đổi từ khóa tìm kiếm → bỏ chọn, tránh xóa nhầm dòng đã chọn nhưng đang bị lọc ẩn.
  useEffect(() => { setSelectedKeys(new Set()); }, [searchText]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => NCC_COLS.some(c => String(r[c] || '').toLowerCase().includes(q)));
  }, [rows, searchText]);

  const toggleRow = (code) => {
    const next = new Set(selectedKeys);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelectedKeys(next);
  };
  const toggleAll = () => {
    if (filtered.length > 0 && selectedKeys.size === filtered.length) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(filtered.map(r => r.ma_ncc)));
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedKeys.size} nhà cung cấp?`)) return;
    try {
      const { error } = await db.from('nha_cung_cap').delete().in('ma_ncc', Array.from(selectedKeys));
      if (error) throw error;
      fetchSuppliers();
    } catch (e) { alert('Lỗi xóa: ' + e.message); }
  };

  const handleSaveAdd = async () => {
    const code = String(addRow.ma_ncc || '').trim();
    const name = String(addRow.ten_ncc || '').trim();
    if (!code) return alert('Vui lòng nhập Mã NCC');
    if (!name) return alert('Vui lòng nhập Tên NCC');
    setSaving(true);
    try {
      const { data: existing, error: checkErr } = await db.from('nha_cung_cap').select('ma_ncc').eq('ma_ncc', code).maybeSingle();
      if (checkErr) throw checkErr;
      if (existing) { setSaving(false); return alert('Mã NCC đã tồn tại'); }
      const payload = {};
      NCC_COLS.forEach(k => { payload[k] = String(addRow[k] ?? '').trim() || null; });
      payload.ma_ncc = code;
      payload.ten_ncc = name;
      const { error } = await db.from('nha_cung_cap').insert(payload);
      if (error) throw error;
      setAddRow(null);
      fetchSuppliers();
    } catch (e) { alert('Lỗi thêm NCC: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    const name = String(editRow.ten_ncc || '').trim();
    if (!name) return alert('Vui lòng nhập Tên NCC');
    setSaving(true);
    try {
      const payload = { updated_at: new Date().toISOString() };
      NCC_COLS.filter(k => k !== 'ma_ncc').forEach(k => { payload[k] = String(editRow[k] ?? '').trim() || null; });
      const { error } = await db.from('nha_cung_cap').update(payload).eq('ma_ncc', editRow.ma_ncc);
      if (error) throw error;
      setEditRow(null);
      fetchSuppliers();
    } catch (e) { alert('Lỗi cập nhật: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleExport = () => {
    const src = selectedKeys.size > 0 ? filtered.filter(r => selectedKeys.has(r.ma_ncc)) : filtered;
    if (src.length === 0) return alert('Không có dữ liệu để xuất');
    const data = src.map(r => NCC_COLS.reduce((acc, c) => ({ ...acc, [NCC_LABELS[c]]: r[c] || '' }), {}));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DM_NCC');
    XLSX.writeFile(wb, `Danh_Muc_NCC_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([NCC_COLS.reduce((acc, c) => ({ ...acc, [NCC_LABELS[c]]: '' }), {})], { header: NCC_COLS.map(c => NCC_LABELS[c]) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Danh_Muc_NCC.xlsx');
  };

  const executeImport = async () => {
    if (!importFile) return alert('Vui lòng chọn file');
    setImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const reverse = {};
      NCC_COLS.forEach(k => { reverse[NCC_LABELS[k]] = k; });
      const nowIso = new Date().toISOString();
      const seen = new Set();
      const upserts = [];
      for (const r of data) {
        const out = {};
        Object.keys(r).forEach(k => { if (reverse[k.trim?.() ?? k]) out[reverse[k.trim?.() ?? k]] = String(r[k] ?? '').trim(); });
        const code = String(out.ma_ncc || '').trim();
        if (!code || seen.has(code)) continue;      // bỏ dòng thiếu mã / trùng trong cùng file
        seen.add(code);
        NCC_COLS.forEach(k => { if (out[k] === '') out[k] = null; });
        out.ma_ncc = code;
        if (!out.ten_ncc) out.ten_ncc = code;         // tên rỗng → fallback = mã
        out.updated_at = nowIso;
        upserts.push(out);
      }
      if (upserts.length === 0) throw new Error('Không có dòng hợp lệ (thiếu cột "Mã NCC")');
      const BATCH = 500;
      for (let i = 0; i < upserts.length; i += BATCH) {
        const { error } = await db.from('nha_cung_cap').upsert(upserts.slice(i, i + BATCH), { onConflict: 'ma_ncc' });
        if (error) throw error;
      }
      alert(`Đã cập nhật ${upserts.length} nhà cung cấp!`);
      setShowImport(false);
      setImportFile(null);
      fetchSuppliers();
    } catch (e) { alert('Lỗi xử lý file: ' + e.message); }
    finally { setImporting(false); }
  };

  const allChecked = filtered.length > 0 && selectedKeys.size === filtered.length;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, height:'100%', position:'relative' }}>
      {/* Thanh công cụ */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0.5rem', display:'flex', alignItems:'center', gap:'0.5rem', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ flex:1, minWidth:120, display:'flex', alignItems:'center', gap:8, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:7, padding:'0.35rem 0.6rem' }}>
          <Search size={16} color="#94a3b8" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Tìm mã, tên, SĐT, người liên hệ, địa chỉ..."
            style={{ border:'none', outline:'none', background:'transparent', width:'100%', fontSize:'0.82rem', color:'#334155' }}
          />
        </div>
      </div>

      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff', paddingBottom:'3.5rem' }}>
        {loading ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, height:300 }}>
            <Loader2 size={32} style={{ animation:'spin 1s linear infinite', color:'#be123c' }} />
            <p style={{ color:'#94a3b8', fontWeight:600, fontSize:'0.85rem' }}>Đang tải danh mục NCC...</p>
          </div>
        ) : loadError ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:'2rem', textAlign:'center' }}>
            <AlertTriangle size={34} color="#f59e0b" />
            <p style={{ color:'#475569', fontWeight:700, margin:0 }}>Chưa tải được danh mục nhà cung cấp</p>
            <p style={{ color:'#94a3b8', fontSize:'0.82rem', margin:0, maxWidth:460 }}>
              Có thể bảng <code>nha_cung_cap</code> chưa được tạo. Hãy chạy file <code>sql/setup_nha_cung_cap.sql</code> trên Supabase, rồi bấm Làm mới.
            </p>
            <p style={{ color:'#cbd5e1', fontSize:'0.7rem', margin:0 }}>{loadError}</p>
            <button onClick={fetchSuppliers} style={{ ...s.btn, background:'#be123c', color:'#fff', border:'none' }}><RefreshCw size={14} /> Làm mới</button>
          </div>
        ) : (
          <div style={{ overflow:'auto', flex:1 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
              <thead>
                <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:1 }}>
                  <th style={{ padding:'0.45rem', borderBottom:'2px solid #e2e8f0', width:28, textAlign:'center' }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor:'pointer', accentColor:'#be123c' }} />
                  </th>
                  <th style={{ padding:'0.45rem', borderBottom:'2px solid #e2e8f0', width:28, textAlign:'center', color:'#94a3b8', fontSize:'0.65rem', fontWeight:700 }}>#</th>
                  {NCC_COLS.map(c => (
                    <th key={c} style={{ padding:'0.45rem 0.4rem', textAlign:'left', fontSize:'0.7rem', fontWeight:700, color:'#64748b', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{NCC_LABELS[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={NCC_COLS.length + 2} style={{ padding:'2rem', textAlign:'center', color:'#94a3b8', fontWeight:600 }}>Không có nhà cung cấp</td></tr>
                ) : filtered.map((row, ri) => (
                  <tr key={row.ma_ncc}
                      onClick={() => toggleRow(row.ma_ncc)}
                      style={{ borderBottom:'1px solid #f1f5f9', background:selectedKeys.has(row.ma_ncc) ? '#fff1f2' : 'transparent', cursor:'pointer' }}
                      onMouseEnter={e => !selectedKeys.has(row.ma_ncc) && (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => !selectedKeys.has(row.ma_ncc) && (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding:'0.35rem 0.2rem', textAlign:'center' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedKeys.has(row.ma_ncc)} onChange={() => toggleRow(row.ma_ncc)} style={{ cursor:'pointer', accentColor:'#be123c' }} />
                    </td>
                    <td style={{ padding:'0.35rem 0.2rem', textAlign:'center', color:'#cbd5e1', fontSize:'0.65rem', fontWeight:600 }}>{ri + 1}</td>
                    <td style={{ padding:'0.35rem 0.4rem', fontWeight:700, color:'#be123c', whiteSpace:'nowrap' }}>{row.ma_ncc}</td>
                    <td style={{ padding:'0.35rem 0.4rem', color:'#334155' }}>{row.ten_ncc}</td>
                    <td style={{ padding:'0.35rem 0.4rem', color:'#64748b', whiteSpace:'nowrap' }}>{row.nguoi_lien_he}</td>
                    <td style={{ padding:'0.35rem 0.4rem', color:'#64748b', whiteSpace:'nowrap' }}>{row.so_dien_thoai}</td>
                    <td style={{ padding:'0.35rem 0.4rem', color:'#64748b' }}>{row.dia_chi}</td>
                    <td style={{ padding:'0.35rem 0.4rem', color:'#94a3b8', fontStyle:'italic' }}>{row.ghi_chu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Thanh hành động dưới */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', padding:'0.75rem', display:'flex', alignItems:'center', gap:'0.5rem', borderTop:'1px solid #e2e8f0', boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)', zIndex:20, flexWrap:'nowrap', overflowX:'auto' }}>
        {selectedKeys.size > 0 ? (
          <>
            <span style={{ fontSize:'0.8rem', fontWeight:700, color:'#9f1239', whiteSpace:'nowrap' }}>{selectedKeys.size} đã chọn</span>
            <button onClick={handleExport} style={{ ...s.btn, background:'#10b981', color:'#fff', border:'none', padding:'0.4rem 0.75rem', flexShrink:0 }}><Download size={14} />Xuất</button>
            {perms.edit && selectedKeys.size === 1 && (
              <button onClick={() => setEditRow({ ...filtered.find(r => r.ma_ncc === Array.from(selectedKeys)[0]) })} style={{ ...s.btn, background:'#f59e0b', color:'#fff', border:'none', padding:'0.4rem 0.75rem', flexShrink:0 }}><Edit3 size={14} />Sửa</button>
            )}
            {perms.delete && <button onClick={handleDelete} style={{ ...s.btn, background:'#ef4444', color:'#fff', border:'none', padding:'0.4rem 0.75rem', marginLeft:'auto', flexShrink:0 }}><Trash2 size={14} />Xóa</button>}
          </>
        ) : (
          <>
            <button onClick={fetchSuppliers} disabled={loading} style={{ ...s.btn, padding:'0.4rem', flexShrink:0 }} title="Làm mới">
              <RefreshCw size={16} style={{ animation:loading ? 'spin 1s linear infinite' : 'none', color:'#be123c' }} />
            </button>
            <span style={{ fontSize:'0.78rem', color:'#64748b', whiteSpace:'nowrap' }}><strong style={{ color:'#334155' }}>{filtered.length}</strong> NCC</span>
            {perms.create && <button onClick={() => setAddRow(blankRow())} style={{ ...s.btn, padding:'0.4rem 0.75rem', background:'#be123c', color:'#fff', border:'none', flexShrink:0 }}><Plus size={14} /> Thêm NCC</button>}
            {perms.io && <button onClick={() => setShowImport(true)} style={{ ...s.btn, padding:'0.4rem 0.75rem', background:'#ffe4e6', color:'#9f1239', border:'none', flexShrink:0 }}><Upload size={14} /> Nhập Excel</button>}
            <button onClick={handleExport} disabled={loading} style={{ ...s.btn, background:'#10b981', color:'#fff', border:'none', padding:'0.4rem 0.75rem', marginLeft:'auto', flexShrink:0 }}><Download size={14} />Xuất Excel</button>
          </>
        )}
      </div>

      {/* Modal Sửa */}
      {editRow && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'1.5rem', borderRadius:12, width:420, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop:0, marginBottom:15 }}>Sửa NCC: {editRow.ma_ncc}</h3>
            {NCC_COLS.filter(k => k !== 'ma_ncc').map(k => (
              <div key={k} style={{ marginBottom:10 }}>
                <label style={{ display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:4 }}>{NCC_LABELS[k]}{k === 'ten_ncc' && <span style={{ color:'#ef4444' }}> *</span>}</label>
                <input value={editRow[k] || ''} onChange={e => setEditRow({ ...editRow, [k]: e.target.value })} style={{ ...s.input, width:'100%', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
              <button onClick={() => setEditRow(null)} style={s.btn}>Hủy</button>
              <button onClick={handleSaveEdit} disabled={saving} style={{ ...s.btn, background:'#2563eb', color:'#fff', border:'none' }}>
                {saving ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Check size={14} />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm */}
      {addRow && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'1.5rem', borderRadius:12, width:420, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop:0, marginBottom:15 }}>Thêm nhà cung cấp</h3>
            {NCC_COLS.map(k => (
              <div key={k} style={{ marginBottom:10 }}>
                <label style={{ display:'block', fontSize:'0.75rem', fontWeight:600, color:'#64748b', marginBottom:4 }}>{NCC_LABELS[k]}{(k === 'ma_ncc' || k === 'ten_ncc') && <span style={{ color:'#ef4444' }}> *</span>}</label>
                <input value={addRow[k] ?? ''} onChange={e => setAddRow({ ...addRow, [k]: e.target.value })} style={{ ...s.input, width:'100%', boxSizing:'border-box' }} />
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
              <button onClick={() => setAddRow(null)} style={s.btn}>Hủy</button>
              <button onClick={handleSaveAdd} disabled={saving} style={{ ...s.btn, background:'#be123c', color:'#fff', border:'none' }}>
                {saving ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Check size={14} />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import */}
      {showImport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', padding:'1.5rem', borderRadius:12, width:420, boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop:0, marginBottom:8 }}>Nhập NCC từ Excel</h3>
            <p style={{ fontSize:'0.76rem', color:'#64748b', marginTop:0 }}>Trùng <b>Mã NCC</b> sẽ được cập nhật (không tạo trùng).</p>
            <div style={{ marginBottom:15, textAlign:'center' }}>
              <button onClick={handleDownloadTemplate} style={{ background:'none', border:'none', color:'#2563eb', textDecoration:'underline', cursor:'pointer' }}>Tải file mẫu (Template)</button>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={e => setImportFile(e.target.files[0])} style={{ width:'100%', marginBottom:15 }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => { setShowImport(false); setImportFile(null); }} style={s.btn}>Hủy</button>
              <button onClick={executeImport} disabled={importing || !importFile} style={{ ...s.btn, background:'#10b981', color:'#fff', border:'none' }}>
                {importing ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : <Upload size={14} />} Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
