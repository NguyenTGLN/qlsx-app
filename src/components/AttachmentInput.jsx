// Ô đính kèm cho form tạo/sửa công việc và ô cập nhật tiến độ.
// File được upload NGAY khi chọn (không đợi bấm Lưu) để thấy thumbnail liền.
// Đổi lại, nơi gọi phải dọn file thừa khi người dùng bấm Hủy — xem cleanupAdded() ở attachmentStorage.js.
import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Play, AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { planSelection, totalSize, fmtSize, MAX_COUNT } from '../lib/attachments';
import { uploadAttachment, deleteAttachments } from '../lib/attachmentStorage';

const thumb = {
  width: 62, height: 62, borderRadius: 'var(--border-radius-sm)',
  border: '1px solid var(--border-color)', overflow: 'hidden',
  position: 'relative', flexShrink: 0, background: 'var(--bg-primary)',
};

export default function AttachmentInput({ value, onChange, folder = 'tasks', userId, disabled }) {
  const list = value || [];
  const inputRef = useRef(null);
  const [pending, setPending] = useState([]);   // file đang tải / tải lỗi
  const [errors, setErrors] = useState([]);     // file bị chặn thẳng
  const [warns, setWarns] = useState([]);

  const busy = pending.some(p => p.status === 'uploading');

  const doUpload = async (file, tempId) => {
    try {
      const att = await uploadAttachment(file, { folder, userId });
      setPending(p => p.filter(x => x.id !== tempId));
      onChange([...(value || []), att]);
    } catch (e) {
      setPending(p => p.map(x => x.id === tempId ? { ...x, status: 'error', error: e?.message || 'Tải lên thất bại', file } : x));
    }
  };

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // cho phép chọn lại đúng file vừa xoá
    // Đếm cả file đang tải, và để planSelection cộng dồn trong lượt chọn này —
    // không tự đếm bằng state ở đây vì setPending chưa kịp áp trong vòng lặp đồng bộ.
    const { accepted, errors: errs, warnings: wrs } = planSelection(files, [...(value || []), ...pending]);

    for (const file of accepted) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setPending(p => [...p, { id: tempId, name: file.name, size: file.size, status: 'uploading' }]);
      doUpload(file, tempId);
    }
    setErrors(errs);
    setWarns(wrs);
  };

  const remove = async (att) => {
    onChange(list.filter(a => a.path !== att.path));
    deleteAttachments([att.path]);
  };

  const retry = (p) => {
    setPending(x => x.map(i => i.id === p.id ? { ...i, status: 'uploading' } : i));
    doUpload(p.file, p.id);
  };

  const count = list.length + pending.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" disabled={disabled || count >= MAX_COUNT} onClick={() => inputRef.current?.click()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
            borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
            cursor: (disabled || count >= MAX_COUNT) ? 'not-allowed' : 'pointer',
            opacity: (disabled || count >= MAX_COUNT) ? .5 : 1, fontFamily: 'inherit',
          }}>
          <Paperclip size={14} /> Đính kèm
        </button>
        {count > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {count} file · {fmtSize(totalSize(list))}{busy ? ' · đang tải…' : ''}
          </span>
        )}
        <input ref={inputRef} type="file" multiple onChange={pick} style={{ display: 'none' }} />
      </div>

      {errors.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--danger-color)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <AlertTriangle size={12} /> {m}
        </div>
      ))}
      {warns.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--warning-color)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <AlertTriangle size={12} /> {m}
        </div>
      ))}

      {(list.length > 0 || pending.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {list.map(a => (
            <div key={a.path} style={thumb} title={`${a.name} · ${fmtSize(a.size)}`}>
              {a.kind === 'image' && <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              {a.kind === 'video' && (
                <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff' }}>
                  <Play size={18} fill="#fff" />
                </span>
              )}
              {a.kind === 'file' && (
                <span style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 3 }}>
                  <FileText size={16} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.15, wordBreak: 'break-all' }}>
                    {a.name.slice(0, 14)}
                  </span>
                </span>
              )}
              {!disabled && (
                <button type="button" onClick={() => remove(a)} aria-label={`Xoá ${a.name}`}
                  style={{ position: 'absolute', top: 1, right: 1, width: 17, height: 17, borderRadius: '50%', border: 0, background: 'rgba(15,23,42,.72)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <X size={10} />
                </button>
              )}
            </div>
          ))}

          {pending.map(p => (
            <div key={p.id} style={{ ...thumb, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={p.status === 'error' ? p.error : p.name}>
              {p.status === 'uploading'
                ? <Loader2 size={16} className="spin" style={{ color: 'var(--text-tertiary)' }} />
                : <button type="button" onClick={() => retry(p)} title={`${p.error} — bấm để thử lại`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: 0, background: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: 8, fontFamily: 'inherit' }}>
                    <RotateCw size={14} /> Thử lại
                  </button>}
              {p.status === 'error' && (
                <button type="button" onClick={() => setPending(x => x.filter(i => i.id !== p.id))} aria-label="Bỏ qua"
                  style={{ position: 'absolute', top: 1, right: 1, width: 17, height: 17, borderRadius: '50%', border: 0, background: 'rgba(15,23,42,.72)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
