// Ảnh/video CLSP: xin link ký rồi mới hiển thị (bucket qc_images không còn đọc công khai).
// createSignedUrl là async nên có trạng thái "đang tải" và "lỗi" — không để trống im lặng.
import React, { useEffect, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { signQcUrl, laVideo } from '../../lib/qcSignedUrl';

const QcMedia = ({ url, alt = 'QC', style, videoProps = {}, imgProps = {} }) => {
  const [src, setSrc] = useState(null);
  const [loi, setLoi] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setLoi(false);
    signQcUrl(url)
      .then(u => { if (alive) setSrc(u); })
      .catch(err => {
        console.error('Không xin được link ký cho ảnh CLSP:', url, err);
        if (alive) setLoi(true);
      });
    return () => { alive = false; };
  }, [url]);

  if (loi) {
    return (
      <div
        title="Không tải được ảnh — kiểm tra đăng nhập rồi bấm Làm mới"
        style={{ minWidth: '60px', minHeight: '60px', ...style, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#dc2626' }}
      >
        <ImageOff size={18} />
        <span style={{ fontSize: '0.55rem', fontWeight: 600, marginTop: '2px' }}>Lỗi tải ảnh</span>
      </div>
    );
  }
  if (!src) {
    return (
      <div style={{ minWidth: '60px', minHeight: '60px', ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', color: '#94a3b8' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  return laVideo(url)
    ? <video src={src} style={style} muted {...videoProps} />
    : <img src={src} alt={alt} style={style} {...imgProps} />;
};

export default QcMedia;
