// Hiển thị đính kèm ở chế độ chỉ đọc + lightbox xem ảnh/video.
// AttachmentBadge: dấu hiệu gọn cho bảng/Tổng quan/Báo cáo (icon kẹp giấy + số lượng).
import { useState, useEffect, useCallback } from 'react';
import { Paperclip, FileText, Play, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { fmtSize } from '../lib/attachments';

const box = {
  border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)',
  background: 'var(--bg-card)', overflow: 'hidden',
};

export function AttachmentBadge({ list, onClick }) {
  const n = (list || []).length;
  if (!n) return null;
  return (
    <span
      onClick={onClick}
      title={`${n} file đính kèm`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
        padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: 'var(--primary-light)', color: 'var(--primary-color)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <Paperclip size={11} /> {n}
    </span>
  );
}

function Lightbox({ list, index, onClose, onMove }) {
  const item = list[index];

  const onKey = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft') onMove(-1);
    if (e.key === 'ArrowRight') onMove(1);
  }, [onClose, onMove]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (!item) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <button onClick={onClose} aria-label="Đóng"
        style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,.15)', color: '#fff', border: 0, borderRadius: 8, padding: 8, cursor: 'pointer' }}>
        <X size={20} />
      </button>

      {list.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); onMove(-1); }} aria-label="Trước"
            style={{ position: 'absolute', left: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: 0, borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <ChevronLeft size={22} />
          </button>
          <button onClick={e => { e.stopPropagation(); onMove(1); }} aria-label="Sau"
            style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: 0, borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '86vh', textAlign: 'center' }}>
        {item.kind === 'video'
          ? <video src={item.url} controls autoPlay style={{ maxWidth: '92vw', maxHeight: '78vh', borderRadius: 8 }} />
          : <img src={item.url} alt={item.name} style={{ maxWidth: '92vw', maxHeight: '78vh', borderRadius: 8, objectFit: 'contain' }} />}
        <div style={{ color: '#fff', marginTop: 10, fontSize: 13, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          <span>{item.name} · {fmtSize(item.size)}</span>
          <a href={item.url} download={item.name} target="_blank" rel="noreferrer"
            style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Download size={14} /> Tải về
          </a>
          {list.length > 1 && <span style={{ opacity: .6 }}>{index + 1}/{list.length}</span>}
        </div>
      </div>
    </div>
  );
}

export default function AttachmentList({ list, size = 76 }) {
  const items = list || [];
  const [open, setOpen] = useState(-1);

  if (!items.length) return null;

  // Chỉ ảnh/video mở được lightbox; file thì tải về.
  const viewable = items.filter(a => a.kind === 'image' || a.kind === 'video');
  const files = items.filter(a => a.kind === 'file');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {viewable.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {viewable.map((a, i) => (
            <div key={a.path || i} onClick={() => setOpen(i)} title={`${a.name} · ${fmtSize(a.size)}`}
              style={{ ...box, width: size, height: size, cursor: 'pointer', position: 'relative' }}>
              {a.kind === 'image'
                ? <img src={a.url} alt={a.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <>
                    <video src={`${a.url}#t=0.1`} preload="metadata" muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }} />
                    <span style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,.35)', color: '#fff',
                    }}><Play size={20} fill="#fff" /></span>
                  </>}
            </div>
          ))}
        </div>
      )}

      {files.map((a, i) => (
        <a key={a.path || i} href={a.url} target="_blank" rel="noreferrer" download={a.name}
          style={{ ...box, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', textDecoration: 'none', color: 'var(--text-primary)' }}>
          <FileText size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', flexShrink: 0 }}>{fmtSize(a.size)}</span>
        </a>
      ))}

      {open >= 0 && (
        <Lightbox
          list={viewable} index={open}
          onClose={() => setOpen(-1)}
          onMove={(d) => setOpen(p => (p + d + viewable.length) % viewable.length)}
        />
      )}
    </div>
  );
}
