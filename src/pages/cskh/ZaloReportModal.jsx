import React, { useState, useRef, useEffect } from 'react';
import { taskDb as db } from '../../lib/task_supabase';
import { X, Upload, Send, Loader2, ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';

const BUCKET_NAME = 'zalo-reports';

const ZaloReportModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    nguoi_nhap: '',
    tong_cuoc_hoi_thoai: '',
    da_tra_loi: '',
    chua_tra_loi: '',
    ghi_chu: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Giải phóng blob URL của ảnh preview khi đổi ảnh / đóng modal (tránh rò bộ nhớ)
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // Auto-tính chưa trả lời
  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };
    if (field === 'tong_cuoc_hoi_thoai' || field === 'da_tra_loi') {
      const tong = parseInt(field === 'tong_cuoc_hoi_thoai' ? value : updated.tong_cuoc_hoi_thoai) || 0;
      const da = parseInt(field === 'da_tra_loi' ? value : updated.da_tra_loi) || 0;
      updated.chua_tra_loi = Math.max(0, tong - da).toString();
    }
    setForm(updated);
    setError('');
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Chỉ chấp nhận file ảnh (jpg, png, webp...)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Ảnh quá lớn, tối đa 10MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect({ target: { files: [file] } });
  };

  const handleSubmit = async () => {
    // Validate
    if (!form.nguoi_nhap.trim()) return setError('Vui lòng nhập tên người báo cáo');
    if (!form.tong_cuoc_hoi_thoai || isNaN(parseInt(form.tong_cuoc_hoi_thoai))) return setError('Vui lòng nhập tổng số cuộc hội thoại');
    if (!form.da_tra_loi || isNaN(parseInt(form.da_tra_loi))) return setError('Vui lòng nhập số cuộc đã trả lời');
    const tong = parseInt(form.tong_cuoc_hoi_thoai);
    const da = parseInt(form.da_tra_loi);
    if (da > tong) return setError('Số đã trả lời không thể lớn hơn tổng');

    setUploading(true);
    setError('');

    try {
      let image_url = null;
      let image_path = null;

      // Upload ảnh nếu có
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const filename = `report_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = `reports/${filename}`;

        const { error: upErr } = await db.storage
          .from(BUCKET_NAME)
          .upload(filePath, imageFile, { cacheControl: '3600', upsert: false });

        if (upErr) throw new Error(`Lỗi upload ảnh: ${upErr.message}`);

        const { data: urlData } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
        image_url = urlData?.publicUrl || null;
        image_path = filePath;
      }

      // Insert vào DB
      const { error: insErr } = await db.from('zalo_duty_reports').insert([{
        nguoi_nhap: form.nguoi_nhap.trim(),
        tong_cuoc_hoi_thoai: tong,
        da_tra_loi: da,
        chua_tra_loi: Math.max(0, tong - da),
        ghi_chu: form.ghi_chu.trim() || null,
        image_url,
        image_path,
      }]);

      if (insErr) throw new Error(`Lỗi lưu dữ liệu: ${insErr.message}`);

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1400);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }} onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}>

      <div style={{
        background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '500px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden', animation: 'slideUp 0.25s ease-out',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0068ff 0%, #06b6d4 100%)',
          padding: '1.25rem 1.5rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📲</span>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>
                Gửi Báo Cáo Trực Zalo
              </h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }}>
                Nhập thông tin ca trực Zalo hôm nay
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={uploading} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
            color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer',
            padding: '6px', display: 'flex', alignItems: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {success ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#16a34a' }}>
              <CheckCircle2 size={48} style={{ marginBottom: '0.75rem' }} />
              <p style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>Lưu báo cáo thành công!</p>
            </div>
          ) : (
            <>
              {/* Người nhập */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  👤 Người báo cáo *
                </label>
                <input
                  type="text"
                  value={form.nguoi_nhap}
                  onChange={e => handleChange('nguoi_nhap', e.target.value)}
                  placeholder="VD: Nguyễn Văn A"
                  style={inputStyle}
                />
              </div>

              {/* Số liệu - 3 ô */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '5px' }}>
                    💬 Tổng HT *
                  </label>
                  <input
                    type="number" min="0"
                    value={form.tong_cuoc_hoi_thoai}
                    onChange={e => handleChange('tong_cuoc_hoi_thoai', e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', display: 'block', marginBottom: '5px' }}>
                    ✅ Đã trả lời *
                  </label>
                  <input
                    type="number" min="0"
                    value={form.da_tra_loi}
                    onChange={e => handleChange('da_tra_loi', e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#16a34a', borderColor: '#bbf7d0' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', display: 'block', marginBottom: '5px' }}>
                    ⏳ Chưa trả lời
                  </label>
                  <input
                    type="number" min="0"
                    value={form.chua_tra_loi}
                    readOnly
                    placeholder="0"
                    style={{ ...inputStyle, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              {/* Ghi chú */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  📝 Ghi chú (tùy chọn)
                </label>
                <textarea
                  value={form.ghi_chu}
                  onChange={e => handleChange('ghi_chu', e.target.value)}
                  placeholder="Ghi chú thêm về ca trực..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Upload ảnh */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  🖼️ Hình ảnh đính kèm (tùy chọn)
                </label>
                {imagePreview ? (
                  <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '2px solid #bfdbfe' }}>
                    <img src={imagePreview} alt="preview" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                        color: '#fff', cursor: 'pointer', width: '28px', height: '28px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X size={14} />
                    </button>
                    <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '20px' }}>
                      {imageFile?.name}
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    style={{
                      border: '2px dashed #cbd5e1', borderRadius: '10px',
                      padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
                      background: '#f8fafc', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#0068ff'; e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                  >
                    <ImageIcon size={28} color="#94a3b8" style={{ marginBottom: '6px' }} />
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                      Kéo thả ảnh hoặc <span style={{ color: '#0068ff', fontWeight: 700 }}>chọn file</span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>JPG, PNG, WEBP · Tối đa 10MB</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: '8px', padding: '10px 12px',
                  color: '#dc2626', fontSize: '0.8rem', fontWeight: 500,
                }}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button
                  onClick={onClose}
                  disabled={uploading}
                  style={{
                    flex: 1, padding: '0.7rem', border: '1px solid #e2e8f0',
                    borderRadius: '10px', background: '#fff', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600, color: '#64748b',
                  }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={uploading}
                  style={{
                    flex: 2, padding: '0.7rem',
                    background: uploading ? '#93c5fd' : 'linear-gradient(135deg, #0068ff, #06b6d4)',
                    border: 'none', borderRadius: '10px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem', fontWeight: 700, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 4px 14px rgba(0,104,255,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  {uploading ? (
                    <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Đang lưu...</>
                  ) : (
                    <><Send size={16} /> Lưu Báo Cáo</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const inputStyle = {
  width: '100%', padding: '0.6rem 0.75rem',
  border: '1.5px solid #e2e8f0', borderRadius: '8px',
  fontSize: '0.9rem', color: '#1e293b',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  transition: 'border-color 0.2s',
};

export default ZaloReportModal;
