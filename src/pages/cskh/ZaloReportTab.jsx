import React, { useState, useEffect, useCallback } from 'react';
import { taskDb as db } from '../../lib/task_supabase';
import { RefreshCw, ZoomIn, X, Calendar, MessageCircle, CheckCheck, Clock, User } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

// ── KPI Card ───────────────────────────────────────────────────────────────
const KpiCard = ({ icon, label, value, color, sub }) => (
  <div style={{
    background: '#fff', borderRadius: '14px',
    border: '1px solid #e2e8f0', borderLeft: `5px solid ${color}`,
    padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <span style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>
        {value?.toLocaleString('vi-VN') ?? '—'}
      </span>
    </div>
    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>{label}</p>
    {sub && <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</p>}
  </div>
);

// ── Lightbox ───────────────────────────────────────────────────────────────
const Lightbox = ({ src, onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'zoom-out', padding: '2rem',
    }}
  >
    <button
      onClick={onClose}
      style={{
        position: 'fixed', top: '16px', right: '16px',
        background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)',
        border: 'none', borderRadius: '50%', color: '#fff',
        width: '40px', height: '40px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <X size={20} />
    </button>
    <img
      src={src} alt="Ảnh báo cáo phóng to"
      onClick={e => e.stopPropagation()}
      style={{
        maxWidth: '90vw', maxHeight: '85vh',
        borderRadius: '12px', objectFit: 'contain',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        cursor: 'default',
        animation: 'zoomIn 0.2s ease-out',
      }}
    />
    <style>{`@keyframes zoomIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }`}</style>
  </div>
);

// ── Main Tab Component ─────────────────────────────────────────────────────
const ZaloReportTab = ({ refreshTrigger }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from('zalo_duty_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[ZaloReport] Fetch error:', error);
      } else {
        setRecords(data || []);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords, refreshTrigger]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalSessions = records.reduce((s, r) => s + (r.tong_cuoc_hoi_thoai || 0), 0);
  const totalAnswered = records.reduce((s, r) => s + (r.da_tra_loi || 0), 0);
  const totalUnanswered = records.reduce((s, r) => s + (r.chua_tra_loi || 0), 0);
  const answerRate = pct(totalAnswered, totalSessions);
  const totalReports = records.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fadeIn 0.3s ease' }}>

      {/* ── KPI Row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px' }}>
        <KpiCard icon="📋" label="Tổng số báo cáo" value={totalReports} color="#6366f1" />
        <KpiCard icon="💬" label="Tổng cuộc hội thoại" value={totalSessions} color="#0068ff" />
        <KpiCard icon="✅" label="Đã trả lời" value={totalAnswered} color="#16a34a"
          sub={`Tỷ lệ: ${answerRate}%`} />
        <KpiCard icon="⏳" label="Chưa trả lời" value={totalUnanswered} color="#ef4444"
          sub={`${100 - answerRate}% chưa xử lý`} />
      </div>

      {/* ── Table Header ────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: '14px',
        border: '1px solid #e2e8f0', overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          padding: '0.9rem 1.25rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #f1f5f9',
          background: 'linear-gradient(135deg, #f8faff 0%, #f0f9ff 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>📲</span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>
              Lịch Sử Báo Cáo Trực Zalo
            </span>
            <span style={{
              background: '#e0e7ff', color: '#4338ca',
              fontSize: '0.72rem', fontWeight: 700,
              padding: '2px 8px', borderRadius: '20px',
            }}>
              {totalReports} báo cáo
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {lastUpdated && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
              </span>
            )}
            <button
              onClick={fetchRecords}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '0.3rem 0.8rem', borderRadius: '7px',
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: '0.78rem', fontWeight: 600, color: '#475569',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none', color: '#6366f1' }} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Table */}
        {loading && records.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '12px', color: '#94a3b8' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTop: '3px solid #0068ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontWeight: 600 }}>Đang tải dữ liệu...</span>
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>📭</span>
            <p style={{ fontWeight: 700, color: '#64748b', margin: '0 0 4px' }}>Chưa có báo cáo nào</p>
            <p style={{ fontSize: '0.8rem', margin: 0 }}>Bấm "Gửi Báo Cáo Trực Zalo" để nhập báo cáo đầu tiên</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { icon: <Calendar size={13} />, label: 'Ngày giờ nhập' },
                    { icon: <User size={13} />, label: 'Người báo cáo' },
                    { icon: <MessageCircle size={13} />, label: 'Tổng HT' },
                    { icon: <CheckCheck size={13} />, label: 'Đã trả lời' },
                    { icon: <Clock size={13} />, label: 'Chưa trả lời' },
                    { icon: null, label: 'Tỷ lệ' },
                    { icon: null, label: 'Ghi chú' },
                    { icon: <ZoomIn size={13} />, label: 'Hình ảnh' },
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '0.6rem 1rem', textAlign: i >= 2 && i <= 5 ? 'center' : 'left',
                      fontWeight: 700, color: '#64748b', fontSize: '0.75rem',
                      borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {h.icon}{h.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => {
                  const rate = pct(r.da_tra_loi, r.tong_cuoc_hoi_thoai);
                  return (
                    <tr key={r.id} style={{
                      background: idx % 2 === 0 ? '#fff' : '#fafbff',
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbff'}
                    >
                      {/* Ngày giờ */}
                      <td style={{ padding: '0.65rem 1rem', color: '#1e293b', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                        {fmtDate(r.created_at)}
                      </td>
                      {/* Người nhập */}
                      <td style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: '#e0e7ff', color: '#4338ca',
                          padding: '2px 9px', borderRadius: '20px',
                          fontSize: '0.78rem', fontWeight: 700,
                        }}>
                          {r.nguoi_nhap || '—'}
                        </span>
                      </td>
                      {/* Tổng */}
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 800, color: '#0068ff', fontSize: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                        {(r.tong_cuoc_hoi_thoai ?? 0).toLocaleString()}
                      </td>
                      {/* Đã trả lời */}
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '1rem' }}>
                          {(r.da_tra_loi ?? 0).toLocaleString()}
                        </span>
                      </td>
                      {/* Chưa trả lời */}
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1rem' }}>
                          {(r.chua_tra_loi ?? 0).toLocaleString()}
                        </span>
                      </td>
                      {/* Tỷ lệ */}
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '64px' }}>
                          <span style={{ fontWeight: 800, color: rate >= 80 ? '#16a34a' : rate >= 50 ? '#f59e0b' : '#ef4444', fontSize: '0.9rem' }}>
                            {rate}%
                          </span>
                          <div style={{ width: '60px', height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${rate}%`, background: rate >= 80 ? '#16a34a' : rate >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '3px', transition: 'width 0.6s' }} />
                          </div>
                        </div>
                      </td>
                      {/* Ghi chú */}
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b', fontSize: '0.8rem', maxWidth: '180px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.ghi_chu || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</span>}
                        </span>
                      </td>
                      {/* Hình ảnh */}
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                        {r.image_url ? (
                          <button
                            onClick={() => setLightboxSrc(r.image_url)}
                            title="Xem ảnh phóng to"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                              borderRadius: '8px', overflow: 'hidden', display: 'inline-block',
                              transition: 'transform 0.2s, box-shadow 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                          >
                            <img
                              src={r.image_url} alt="Ảnh BC"
                              style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', display: 'block', border: '2px solid #bfdbfe' }}
                            />
                          </button>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.75rem', fontStyle: 'italic' }}>Không có</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default ZaloReportTab;
