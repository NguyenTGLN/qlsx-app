import React, { useState } from 'react';
import { FileText, Printer, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { getEffectiveProposalLan } from '../../lib/warrantyProposalLan';

// Các ô sửa của 1 lần đề xuất (map vào dữ_liệu). linh_kiện nhập bằng text ngăn dấu phẩy.
const FIELDS = [
  ['khachHang', 'Bên nhận bảo hành'], ['sdt', 'Số điện thoại'], ['diaChi', 'Địa chỉ'],
  ['maDonHang', 'Mã đơn hàng'], ['ngayLap', 'Ngày giao (Lắp đặt)'], ['maSP', 'Sản phẩm'],
  ['tinhTrang', 'Tình trạng'], ['linhKienText', 'Linh kiện (cách nhau dấu phẩy)'], ['nguoiPhuTrach', 'Người phụ trách'],
];
const fmtNgayTao = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

// 1 thẻ lần: hiển thị "Lần N · ngày", bấm → popover sửa dữ_liệu + In / Tải / Hủy.
function ProposalLanCard({ row, lan, perm, onSave, onCancel, onPrint, onExcel }) {
  const [open, setOpen] = useState(null); // { top, left, maxH }
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const huy = !!lan['đã_hủy'];
  const dl = lan['dữ_liệu'] || {};

  const openPop = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const d = {};
    FIELDS.forEach(([k]) => {
      if (k === 'linhKienText') d[k] = (Array.isArray(dl.linhKienList) ? dl.linhKienList : []).join(', ');
      else d[k] = dl[k] || '';
    });
    setDraft(d);
    const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 380));
    setOpen({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), maxH: window.innerHeight - top - 12 });
  };
  const close = () => setOpen(null);
  // Gộp draft (text) về dạng dữ_liệu (linhKienList tách từ text).
  const draftToDuLieu = () => {
    const nd = { ...dl };
    FIELDS.forEach(([k]) => { if (k !== 'linhKienText') nd[k] = draft[k] ?? ''; });
    nd.linhKienList = String(draft['linhKienText'] || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    return nd;
  };
  const save = async () => { setBusy(true); try { await onSave(row, lan, draftToDuLieu()); close(); } finally { setBusy(false); } };
  const printOne = () => onPrint(dl);
  const excelOne = async () => { setBusy(true); try { await onExcel(dl); } finally { setBusy(false); } };
  const doCancel = async (huyVal) => {
    if (huyVal && !window.confirm(`Hủy lần ${lan['lần']}? (làm mờ + đánh dấu Đã Hủy, không xóa)`)) return;
    setBusy(true); try { await onCancel(row, lan, huyVal); close(); } finally { setBusy(false); }
  };

  return (
    <div style={{ flex: '0 0 auto' }}>
      <div onClick={openPop} className="wf-card" title={huy ? 'Lần đã hủy — bấm để xem / bỏ hủy' : 'Bấm để sửa / in / tải'}
        style={{ cursor: 'pointer', width: 150, minHeight: 90, boxSizing: 'border-box', padding: '7px 9px', borderRadius: '10px', border: `1px solid ${huy ? '#cbd5e1' : '#c7d2fe'}`, background: huy ? '#f1f5f9' : '#eef2ff', opacity: huy ? 0.6 : 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.66rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: huy ? '#64748b' : '#4338ca', textDecoration: huy ? 'line-through' : 'none' }}>Lần {lan['lần']}{huy ? ' · Đã Hủy' : ''}</div>
        <div style={{ color: '#64748b' }}>{fmtNgayTao(lan['thời_điểm_tạo'])}</div>
        {lan['người_tạo'] && <div style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lan['người_tạo']}</div>}
        {Array.isArray(dl.linhKienList) && dl.linhKienList.length > 0 && (
          <div title={dl.linhKienList.join(', ')} style={{ color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word', lineHeight: 1.25 }}>
            🔧 {dl.linhKienList.join(', ')}
          </div>
        )}
        {!huy && (
          <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
            <button onClick={(e) => { e.stopPropagation(); printOne(); }} title="In / Tạo PDF" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, fontSize: '0.6rem' }}><Printer size={11} /> In</button>
            <button disabled={busy} onClick={(e) => { e.stopPropagation(); excelOne(); }} title="Tải Excel" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, border: '1px solid #6ee7b7', background: '#fff', color: '#047857', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.6rem' }}><Download size={11} /> Excel</button>
          </div>
        )}
      </div>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); close(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: open.top, left: open.left, zIndex: 1001, width: 320, maxHeight: open.maxH, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '0.85rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.6rem' }}>Lần {lan['lần']} — nội dung phiếu{huy ? ' (Đã Hủy)' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {FIELDS.map(([k, label]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>{label}</label>
                  <input value={draft[k] ?? ''} disabled={!perm.edit || huy}
                    onChange={(e) => { const v = e.target.value; setDraft(d => ({ ...d, [k]: v })); }}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '7px', padding: '0.4rem 0.5rem', fontSize: '0.84rem', outline: 'none', background: huy ? '#f8fafc' : '#fff' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
              {perm.edit && !huy && <button disabled={busy} onClick={save} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Lưu</button>}
              {!huy && <button onClick={printOne} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>In / PDF</button>}
              {!huy && <button disabled={busy} onClick={excelOne} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#047857', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Tải Excel</button>}
              <button disabled={busy} onClick={close} style={{ padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Đóng</button>
              {perm.edit && (huy
                ? <button disabled={busy} onClick={() => doCancel(false)} style={{ marginLeft: 'auto', padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #6ee7b7', background: '#ecfdf5', color: '#047857', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Bỏ hủy</button>
                : <button disabled={busy} onClick={() => doCancel(true)} style={{ marginLeft: 'auto', padding: '0.4rem 0.7rem', borderRadius: '7px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'wait' : 'pointer' }}>Hủy lần</button>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Nút thu gọn/mở rộng: mặc định cột chỉ hiện 1 thẻ (lần mới nhất) cho đỡ tràn ngang.
function LanCollapseToggle({ expanded, count, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={expanded ? 'Thu gọn (chỉ hiện lần mới nhất)' : `Mở rộng — xem tất cả ${count} lần`}
      style={{ flex: '0 0 auto', width: 24, alignSelf: 'stretch', minHeight: 90, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontWeight: 800, fontSize: '0.68rem', padding: 0 }}>
      {expanded ? <ChevronLeft size={15} /> : <><ChevronRight size={15} /><span>{count}</span></>}
    </button>
  );
}

// Ô cột "Đề xuất BH": hàng ngang các thẻ lần + thẻ "+ Thêm lần".
// Mặc định THU GỌN (chỉ hiện lần mới nhất) khi có >1 lần; bấm nút để mở rộng xem/thêm.
export default function ProposalLanCell({ row, perm, onAddLan, onSaveLan, onCancelLan, onPrint, onExcel }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lans = getEffectiveProposalLan(row);
  const add = async (e) => { e.stopPropagation(); setBusy(true); try { await onAddLan(row); } finally { setBusy(false); } };
  if (lans.length === 0 && !perm.edit) return <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>;
  const collapsible = lans.length > 1;
  const shown = collapsible && !expanded ? lans.slice(-1) : lans; // thu gọn → chỉ lần mới nhất
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '6px', alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
      {collapsible && <LanCollapseToggle expanded={expanded} count={lans.length} onToggle={() => setExpanded(v => !v)} />}
      {shown.map((lan) => (
        <ProposalLanCard key={String(lan['lần'])} row={row} lan={lan} perm={perm}
          onSave={onSaveLan} onCancel={onCancelLan} onPrint={onPrint} onExcel={onExcel} />
      ))}
      {perm.edit && (!collapsible || expanded) && (
        <button disabled={busy} onClick={add} className="wf-card"
          style={{ flex: '0 0 auto', width: 92, minHeight: 90, borderRadius: '10px', border: '1px dashed #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.72rem', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <FileText size={14} /> {busy ? '...' : '+ Thêm lần'}
        </button>
      )}
    </div>
  );
}
