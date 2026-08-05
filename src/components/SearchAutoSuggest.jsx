import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown } from 'lucide-react';
import { supabase as db } from '../lib/supabase';
import { docNhom, ghiNhom, daTick, doiTick, chotCaDon, xoaNhom, nhanTomTat } from '../lib/locNhomLuuXuat';

/**
 * SearchAutoSuggest – Multi-select search with autocomplete suggestions.
 *
 * Props:
 *  - tableName      : string — Supabase table to query (e.g. 'luu_xuat')
 *  - searchColumns  : string[] — columns to search in (e.g. ['ma_san_pham','ten_san_pham'])
 *  - displayColumn  : string — column to display in suggestions (defaults to searchColumns[0])
 *  - placeholder    : string
 *  - value          : string — comma-separated selected values
 *  - onChange        : (newValue: string) => void
 *  - localData      : array (optional) — if provided, search locally instead of querying DB
 *  - localSearchKeys: string[] (optional) — keys to search within localData objects
 *  - groupByTerm    : bool (optional, MẶC ĐỊNH TẮT) — chế độ "nhóm": mỗi tick được ghi
 *      kèm ĐÚNG từ khoá đã sinh ra nó, nên tìm mã đơn hàng rồi tick mã SP sẽ chỉ ra
 *      dòng của đơn ấy. Khi tắt, mọi nhánh chạy y hệt mã cũ — component này đang được
 *      10 tab dùng chung, chỉ tab Lưu xuất bật cờ này.
 *      Ở chế độ nhóm, `value` là chuỗi JSON các nhóm {tu, ma[]} (xem lib/locNhomLuuXuat).
 */
export default function SearchAutoSuggest({
  tableName,
  searchColumns = [],
  displayColumn,
  placeholder = 'Tìm kiếm...',
  value = '',
  onChange,
  localData,
  localSearchKeys,
  groupByTerm = false,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);  // overlay modal (render qua portal, NẰM NGOÀI wrapRef)

  // Chế độ nhóm: `value` là chuỗi JSON các nhóm {tu, ma[]}; ô tick hiện trạng thái của
  // nhóm khớp ĐÚNG từ khoá đang gõ. Chế độ thường: `value` là chuỗi mã ngăn bởi dấu phẩy.
  const nhom = groupByTerm ? docNhom(value) : [];
  const selectedSet = groupByTerm
    ? daTick(nhom, input)
    : new Set(value ? value.split(',').map(v => v.trim()).filter(Boolean) : []);
  const coLoc = groupByTerm ? nhom.length > 0 : selectedSet.size > 0;
  const nhanNut = groupByTerm
    ? nhanTomTat(nhom)
    : (selectedSet.size === 1 ? [...selectedSet][0] : `${selectedSet.size} đã chọn`);
  const mainCol = displayColumn || searchColumns[0];

  // Click outside → close. Overlay được portal ra body nên phải loại trừ cả panelRef,
  // nếu không mousedown trong modal (ô nhập, ô tick) sẽ bị coi là "click ngoài" → đóng
  // modal trước khi thao tác chạy.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Lấy danh sách giá trị gợi ý — CHỈ 1 lần gọi, tối đa 1000 dòng.
  // Trước đây hàm này phân trang quét TOÀN BỘ bảng (có bảng hàng chục nghìn dòng) mỗi lần
  // mở/gõ bộ lọc → rất chậm. Với ô tìm kiếm, chỉ cần một nhúm gợi ý là đủ; người dùng gõ
  // thêm để thu hẹp. Giới hạn 1 request giúp bộ lọc mở gần như tức thì.
  const fetchAllUnique = useCallback(async (orClauses) => {
    const uniqueVals = new Set();
    let q = db.from(tableName).select(mainCol);
    if (orClauses) q = q.or(orClauses);
    q = q.limit(1000);
    const { data } = await q;
    if (data) data.forEach(r => { if (r[mainCol]) uniqueVals.add(r[mainCol]); });
    return [...uniqueVals].sort();
  }, [tableName, mainCol]);

  const doSearch = useCallback((q) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q || q.length < 1) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (localData && localSearchKeys) {
          // Client-side search
          const lower = q.toLowerCase();
          const matches = new Set();
          localData.forEach(item => {
            for (const key of localSearchKeys) {
              if (item[key] && String(item[key]).toLowerCase().includes(lower)) {
                matches.add(String(item[mainCol] || item[localSearchKeys[0]] || ''));
                break;
              }
            }
          });
          setResults([...matches].filter(Boolean).sort());
        } else {
          // Supabase query — fetch ALL matching unique values.
          // Escape ký tự đặc biệt của cú pháp PostgREST .or() (, ( ) *) để tránh phá filter / injection.
          const safe = q.replace(/[,()*]/g, ' ').trim();
          if (!safe) { setResults([]); }
          else {
            const orClauses = searchColumns.map(col => `${col}.ilike.%${safe}%`).join(',');
            setResults(await fetchAllUnique(orClauses));
          }
        }
      } catch (e) {
        console.warn('SearchAutoSuggest error:', e);
      }
      setSearching(false);
    }, 300);
  }, [tableName, searchColumns, mainCol, localData, localSearchKeys, fetchAllUnique]);

  const handleInput = (v) => { setInput(v); doSearch(v); };
  const toggle = (v) => {
    if (groupByTerm) { onChange(ghiNhom(doiTick(nhom, input, v))); return; }
    const n = new Set(selectedSet);
    n.has(v) ? n.delete(v) : n.add(v);
    onChange([...n].join(','));
  };
  const clear = () => { onChange(''); setInput(''); setResults([]); };

  // Bấm Xong: chốt từ khoá đang gõ thành nhóm "cả đơn" nếu người dùng chưa tick gì.
  const xong = () => {
    if (groupByTerm) onChange(ghiNhom(chotCaDon(nhom, input)));
    setOpen(false);
  };

  const handleOpen = async () => {
    setOpen(true);
    // Chế độ nhóm: mở lại là để gõ ĐƠN TIẾP THEO, nên dọn ô nhập. Các nhóm đã chốt vẫn
    // nằm nguyên dạng thẻ nên không mất trạng thái lọc.
    const inputHienTai = groupByTerm ? '' : input;
    if (groupByTerm && input) {
      // Huỷ luôn bộ đếm giờ tìm kiếm đang chờ của lần gõ trước. Không huỷ thì nó nổ sau
      // khi ô nhập đã bị dọn và ghi đè danh sách gợi ý bằng kết quả của từ khoá cũ.
      if (timerRef.current) clearTimeout(timerRef.current);
      setInput('');
      setResults([]);
    }
    // Preload initial results if empty
    if ((groupByTerm || results.length === 0) && !inputHienTai) {
      setSearching(true);
      try {
        if (localData && localSearchKeys) {
          const all = new Set();
          localData.forEach(item => {
            const val = item[mainCol] || item[localSearchKeys[0]];
            if (val) all.add(String(val));
          });
          setResults([...all].sort());
        } else {
          // Fetch ALL unique values from the table
          setResults(await fetchAllUnique(null));
        }
      } catch (e) { console.warn(e); }
      setSearching(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Trigger */}
      <div
        onClick={() => open ? setOpen(false) : handleOpen()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: open ? '#eff6ff' : '#f8fafc',
          border: `1px solid ${open ? '#93c5fd' : '#e2e8f0'}`,
          borderRadius: 8,
          padding: '0.3rem 0.6rem',
          cursor: 'pointer',
          minWidth: 140,
          transition: 'all 0.15s',
          fontSize: '0.8rem',
        }}
      >
        <Search size={13} color="#94a3b8" />
        <span style={{
          flex: 1,
          fontWeight: 600,
          color: coLoc ? '#0f172a' : '#94a3b8',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 180,
        }}>
          {coLoc ? nhanNut : placeholder}
        </span>
        {coLoc && (
          <span
            onClick={(e) => { e.stopPropagation(); clear(); }}
            style={{ color: '#ef4444', fontWeight: 800, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1 }}
            title="Xóa bộ lọc"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={12} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>

      {/* Dropdown — Fixed Modal cho mobile. Render qua Portal ra document.body để KHÔNG
          bị kẹt trong containing-block / vùng cuộn của thanh công cụ cha (sticky + overflow),
          vốn khiến iOS Safari cắt cụt overlay position:fixed (Android/Chrome thì không). */}
      {open && createPortal((
        <div ref={panelRef} style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.3)', backdropFilter: 'blur(2px)' }}
            onClick={() => setOpen(false)}
          />

          {/* Modal Content */}
          <div style={{
            position: 'relative',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            width: '100%',
            maxWidth: 340,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.15s ease-out',
            zIndex: 1,
          }}>
            {/* Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Tìm kiếm & Lọc</span>
              {coLoc && (
                <button onClick={clear} style={{ border: 'none', background: '#fef2f2', color: '#ef4444', borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  Xóa tất cả
                </button>
              )}
            </div>

            {/* Search input */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                value={input}
                onChange={e => handleInput(e.target.value)}
                placeholder="Gõ để tìm..."
                autoFocus
                style={{
                  width: '100%',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.85rem',
                  outline: 'none',
                  background: '#f8fafc',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Selected chips.
                Chế độ nhóm: mỗi thẻ là một từ khoá + các mã đã tick TRONG từ khoá đó.
                Ghi rõ "cả đơn" khi không tick mã nào — không để trạng thái lọc nào ẩn. */}
            {groupByTerm ? (nhom.length > 0 && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8' }}>Đang lọc:</span>
                {nhom.map(n => (
                  <div key={n.tu} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, fontSize: '0.74rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.tu}>
                        {n.tu || 'Mọi đơn hàng'}
                      </span>
                      {n.ma.length === 0 && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0891b2', whiteSpace: 'nowrap' }}>cả đơn</span>}
                      <span onClick={() => onChange(ghiNhom(xoaNhom(nhom, n.tu)))} style={{ cursor: 'pointer', color: '#ef4444', fontWeight: 900, lineHeight: 1 }} title="Bỏ nhóm này">×</span>
                    </div>
                    {n.ma.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {n.ma.map(m => (
                          <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eff6ff', color: '#1d4ed8', borderRadius: 99, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                            {m}
                            <span onClick={() => onChange(ghiNhom(doiTick(nhom, n.tu, m)))} style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 900, marginLeft: 2 }}>×</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )) : (selectedSet.size > 0 && (
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[...selectedSet].map(v => (
                  <span
                    key={v}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      background: '#eff6ff', color: '#1d4ed8', borderRadius: 99,
                      padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
                    }}
                  >
                    {v}
                    <span onClick={() => toggle(v)} style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 900, marginLeft: 2 }}>×</span>
                  </span>
                ))}
              </div>
            ))}

            {/* Results list */}
            <div style={{ overflow: 'auto', flex: 1, padding: '4px 0' }}>
              {searching ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', padding: 12 }}>🔍 Đang tìm...</p>
              ) : results.length === 0 && input ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', padding: 12 }}>Không tìm thấy "{input}"</p>
              ) : results.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', padding: 12 }}>Gõ để tìm kiếm</p>
              ) : (
                results.map(v => (
                  <label
                    key={v}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                      cursor: 'pointer', fontSize: '0.85rem', color: '#334155', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <input type="checkbox" checked={selectedSet.has(v)} onChange={() => toggle(v)} style={{ width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </label>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem', textAlign: 'right', background: '#f8fafc' }}>
              <button onClick={xong} style={{ border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '0.5rem 1.5rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Xong</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
