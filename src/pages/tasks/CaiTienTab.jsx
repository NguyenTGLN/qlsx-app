import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { Plus, X, ThumbsUp, Loader2, AlertTriangle, ChevronLeft, Trophy, ListChecks, Trash2, Pencil, Rocket } from 'lucide-react';
import AttachmentInput from '../../components/AttachmentInput';
import AttachmentList from '../../components/AttachmentList';
import { deleteRemoved, collectPaths, deleteAttachments } from '../../lib/attachmentStorage';
import { CATEGORIES, DEFAULT_CONFIG, tinhGiaTri, chamDiem, fmtTien } from '../../lib/caiTienValue';

// ─────────────────────────────────────────────────────────────────────────────
// Tab CẢI TIẾN (Kaizen): nhân viên đăng đóng góp cải tiến kèm ảnh/video,
// app quy đổi giá trị thành tiền (caiTienValue.js), quản lý chấm 5 tiêu chí
// → xếp loại A/B/C, có bảng xếp hạng vinh danh.
// Spec: docs/superpowers/specs/2026-07-24-cai-tien-design.md
// Quyền: view = xem feed/xếp hạng · create = gửi bài · edit = duyệt/chấm điểm.
// ─────────────────────────────────────────────────────────────────────────────

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const STATUS_CFG = {
  CHO_DUYET:   { label: '⏳ Chờ duyệt',    bg: '#fef3c7', mau: '#b45309' },
  DA_DUYET:    { label: '✓ Đã duyệt',      bg: '#d1fae5', mau: '#047857' },
  CAN_BO_SUNG: { label: '✎ Cần bổ sung',   bg: '#ffedd5', mau: '#c2410c' },
  TU_CHOI:     { label: '✕ Từ chối',       bg: '#fee2e2', mau: '#b91c1c' },
};

// Form số liệu ĐỘNG theo loại — field name phải khớp caiTienValue.js (có test chốt).
const METRIC_FORMS = {
  nang_suat: [
    { key: 'truoc',   label: 'Thời gian TRƯỚC', unit: 'phút/SP' },
    { key: 'sau',     label: 'Thời gian SAU',   unit: 'phút/SP' },
    { key: 'sl_ngay', label: 'Sản lượng áp dụng', unit: 'SP/ngày' },
  ],
  chat_luong: [
    { key: 'loi_truoc',   label: 'Tỷ lệ lỗi TRƯỚC', unit: '%' },
    { key: 'loi_sau',     label: 'Tỷ lệ lỗi SAU',   unit: '%' },
    { key: 'sl_thang',    label: 'Sản lượng',       unit: 'SP/tháng' },
    { key: 'chi_phi_loi', label: 'Chi phí 1 SP lỗi (trống = mặc định)', unit: 'đ' },
  ],
  chi_phi: [
    { key: 'tien_truoc_thang', label: 'Chi phí TRƯỚC', unit: 'đ/tháng' },
    { key: 'tien_sau_thang',   label: 'Chi phí SAU',   unit: 'đ/tháng' },
  ],
  rui_ro: [
    { key: 'kn_truoc',     label: 'Khả năng xảy ra TRƯỚC', unit: '1-5' },
    { key: 'md_truoc',     label: 'Mức độ thiệt hại TRƯỚC', unit: '1-5' },
    { key: 'kn_sau',       label: 'Khả năng xảy ra SAU',   unit: '1-5' },
    { key: 'md_sau',       label: 'Mức độ thiệt hại SAU',  unit: '1-5' },
    { key: 'thiet_hai',    label: 'Thiệt hại nếu xảy ra',  unit: 'đ' },
    { key: 'xac_suat_nam', label: 'Số lần có thể xảy ra',  unit: 'lần/năm' },
  ],
  don_gian_hoa: [
    { key: 'gio_dt_truoc', label: 'Giờ đào tạo TRƯỚC', unit: 'giờ/người' },
    { key: 'gio_dt_sau',   label: 'Giờ đào tạo SAU',   unit: 'giờ/người' },
    { key: 'nguoi_nam',    label: 'Số người cần đào tạo', unit: 'người/năm' },
    { key: 'phut_ngay',    label: 'Phút tiết kiệm thêm mỗi ngày (nếu có)', unit: 'phút' },
    { key: 'so_nguoi',     label: 'Số người áp dụng', unit: 'người' },
  ],
  quy_trinh: [
    { key: 'phut_ngay', label: 'Thời gian tiết kiệm mỗi ngày (mỗi người)', unit: 'phút' },
    { key: 'so_nguoi',  label: 'Số người hưởng lợi', unit: 'người' },
  ],
};
METRIC_FORMS['5s'] = METRIC_FORMS.quy_trinh;
METRIC_FORMS.moi_truong = METRIC_FORMS.quy_trinh;

const TIEU_CHI = [
  { key: 'gia_tri',    label: 'Giá trị làm lợi' },
  { key: 'sang_tao',   label: 'Tính sáng tạo' },
  { key: 'nhan_rong',  label: 'Khả năng nhân rộng' },
  { key: 'no_luc',     label: 'Nỗ lực thực hiện' },
  { key: 'bang_chung', label: 'Bằng chứng đầy đủ' },
];

function kyHienTai() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' → [từ, đến) dạng ISO để lọc created_at theo kỳ tháng.
function khoangKy(ky) {
  const [y, m] = ky.split('-').map(Number);
  const tu = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600000); // đầu tháng giờ VN
  const den = new Date(Date.UTC(y, m, 1) - 7 * 3600000);
  return [tu.toISOString(), den.toISOString()];
}

function fmtNgay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Bảng cai_tien chưa tạo trên Supabase → tải mềm, hiện hướng dẫn thay vì vỡ tab.
function laThieuBang(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  return err?.code === '42P01' || (msg.includes('cai_tien') && msg.includes('does not exist'))
    || msg.includes('schema cache');
}

const oInput = {
  padding: '0.55rem 0.7rem', borderRadius: 10, border: '1px solid var(--border-color, #e2e8f0)',
  fontSize: '0.85rem', width: '100%', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit',
};
const nutChinh = {
  border: 'none', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.9rem', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', color: '#fff',
  background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 4px 14px rgba(37,99,235,.3)',
};
const nutPhu = {
  borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', background: '#fff', border: '1px solid #e2e8f0', color: '#64748b',
};
const theTrang = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '0.85rem' };

function Ava({ user, id, size = 34 }) {
  const ten = user?.name || id || '?';
  if (user?.avatar) {
    return <img src={user.avatar} alt={ten} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
      color: '#fff', fontWeight: 700, fontSize: size * 0.42, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{ten.trim().charAt(0).toUpperCase()}</div>
  );
}

function ChipLoai({ cat }) {
  const c = CAT_MAP[cat];
  if (!c) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontWeight: 700,
      padding: '3px 9px', borderRadius: 999, background: c.mauNen, color: c.mau, whiteSpace: 'nowrap',
    }}>{c.icon} {c.label}</span>
  );
}

function ChipTrangThai({ row }) {
  const s = STATUS_CFG[row.status] || STATUS_CFG.CHO_DUYET;
  const nhan = row.status === 'DA_DUYET' && row.xep_loai
    ? `✓ Duyệt · Loại ${row.xep_loai === 'GHI_NHAN' ? 'Ghi nhận' : row.xep_loai}` : s.label;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.mau, whiteSpace: 'nowrap' }}>
      {nhan}{row.nhan_rong ? ' 🚀' : ''}
    </span>
  );
}

// Ô nhập số liệu theo loại — dùng chung cho wizard bước 3 và màn duyệt (admin sửa hộ).
function MetricFields({ category, metrics, onChange, disabled }) {
  const fields = METRIC_FORMS[category] || [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
      {fields.map(f => (
        <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>
          <span>{f.label} <em style={{ fontStyle: 'normal', fontWeight: 600, color: '#94a3b8' }}>({f.unit})</em></span>
          <input type="number" style={oInput} disabled={disabled} min="0" step="any"
            value={metrics[f.key] ?? ''} placeholder="0"
            onChange={e => onChange({ ...metrics, [f.key]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

function OKetQua({ category, metrics, config }) {
  const kq = tinhGiaTri(category, metrics, config);
  return (
    <div style={{
      background: 'linear-gradient(135deg,#2563eb,#3b82f6)', borderRadius: 16, padding: '0.9rem 1rem',
      color: '#fff', margin: '0.75rem 0',
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.85, letterSpacing: 0.5, marginBottom: 4 }}>
        💎 GIÁ TRỊ LÀM LỢI (APP TỰ TÍNH)
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>≈ {fmtTien(kq.tien_nam)}/năm</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.92 }}>
        {kq.dien_giai}{kq.tien_thang > 0 ? ` ≈ ${fmtTien(kq.tien_thang)}/tháng` : ''}
      </div>
    </div>
  );
}

// ═════════════════════════ WIZARD GỬI / SỬA BÀI ═════════════════════════════
function WizardGui({ me, config, row, onClose, onSaved }) {
  const suaBai = !!row?.id;
  const [buoc, setBuoc] = useState(suaBai ? 2 : 1);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');
  const [f, setF] = useState({
    category: row?.category || '',
    title: row?.title || '',
    before_text: row?.before_text || '',
    after_text: row?.after_text || '',
    attachments_before: row?.attachments_before || [],
    attachments_after: row?.attachments_after || [],
    metrics: row?.metrics || {},
  });
  // File đã lưu trong DB: bấm X chỉ gỡ khỏi form, KHÔNG xoá Storage (người dùng có thể Hủy).
  const pathsGoc = useMemo(
    () => collectPaths([...(row?.attachments_before || []), ...(row?.attachments_after || [])]),
    [row],
  );

  const huy = () => {
    // Dọn file MỚI tải lên trong phiên wizard này (file gốc giữ nguyên).
    deleteRemoved([...f.attachments_before, ...f.attachments_after],
      [...(row?.attachments_before || []), ...(row?.attachments_after || [])]);
    onClose();
  };

  const gui = async () => {
    if (!f.title.trim()) { setLoi('Nhập tên cải tiến đã nhé'); setBuoc(2); return; }
    setDangLuu(true);
    setLoi('');
    try {
      const computed = tinhGiaTri(f.category, f.metrics, config);
      const payload = {
        title: f.title.trim(), category: f.category,
        before_text: f.before_text.trim(), after_text: f.after_text.trim(),
        attachments_before: f.attachments_before, attachments_after: f.attachments_after,
        metrics: f.metrics, computed, status: 'CHO_DUYET',
      };
      if (suaBai) {
        const { error } = await supabase.from('cai_tien').update(payload).eq('id', row.id);
        if (error) throw error;
        // File gốc bị người dùng gỡ khỏi form → giờ mới xoá thật khỏi Storage.
        deleteRemoved([...(row.attachments_before || []), ...(row.attachments_after || [])],
          [...f.attachments_before, ...f.attachments_after]);
      } else {
        const { error } = await supabase.from('cai_tien').insert({ ...payload, nhan_vien_id: me.id });
        if (error) throw error;
      }
      onSaved();
    } catch (err) {
      setLoi(err?.message || String(err));
    } finally {
      setDangLuu(false);
    }
  };

  const BuocChip = ({ n, nhan }) => (
    <div onClick={() => (n < buoc || (n === 2 && f.category) || (n === 3 && f.category)) && setBuoc(n)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <span style={{
        width: 26, height: 26, borderRadius: '50%', fontSize: '0.78rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: buoc === n ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : buoc > n ? '#059669' : '#e2e8f0',
        color: buoc >= n ? '#fff' : '#64748b',
      }}>{buoc > n ? '✓' : n}</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: buoc === n ? '#0f172a' : '#64748b' }}>{nhan}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-primary, #f6f8fb)', borderRadius: 16, width: '100%', maxWidth: 520, padding: '1rem', margin: 'auto 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{suaBai ? 'Sửa cải tiến' : 'Gửi cải tiến'}</h3>
          <button onClick={huy} style={{ ...nutPhu, padding: '0.35rem 0.5rem' }} aria-label="Đóng"><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <BuocChip n={1} nhan="Loại" />
          <div style={{ flex: 1, height: 2, background: '#e2e8f0' }} />
          <BuocChip n={2} nhan="Mô tả" />
          <div style={{ flex: 1, height: 2, background: '#e2e8f0' }} />
          <BuocChip n={3} nhan="Số liệu" />
        </div>

        {buoc === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => { setF(p => ({ ...p, category: c.key })); setBuoc(2); }}
                  style={{
                    ...theTrang, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    borderWidth: 1.5, borderColor: f.category === c.key ? '#2563eb' : '#e2e8f0',
                    background: f.category === c.key ? '#eff6ff' : '#fff',
                  }}>
                  <span style={{ fontSize: '1.4rem', display: 'block', marginBottom: 4 }}>{c.icon}</span>
                  <b style={{ fontSize: '0.82rem', display: 'block', color: '#0f172a' }}>{c.label}</b>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.35 }}>{c.goiY}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {buoc === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Tên cải tiến
              <input style={{ ...oInput, marginTop: 4 }} value={f.title} maxLength={200}
                placeholder="VD: Làm đồ gá bắn vít nắp trên"
                onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
            </label>
            <div style={{ ...theTrang, borderLeft: '4px solid #f43f5e' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>🔴 TRƯỚC cải tiến — hiện trạng & vấn đề</div>
              <textarea style={{ ...oInput, resize: 'none' }} rows={3} value={f.before_text}
                placeholder="Trước đây phải… mất khoảng… phút, hay bị…"
                onChange={e => setF(p => ({ ...p, before_text: e.target.value }))} />
              <div style={{ marginTop: 6 }}>
                <AttachmentInput value={f.attachments_before} folder="cai-tien" userId={me.id} protectedPaths={pathsGoc}
                  onChange={fn => setF(p => ({ ...p, attachments_before: fn(p.attachments_before) }))} />
              </div>
            </div>
            <div style={{ ...theTrang, borderLeft: '4px solid #059669' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>🟢 SAU cải tiến — giải pháp & kết quả</div>
              <textarea style={{ ...oInput, resize: 'none' }} rows={3} value={f.after_text}
                placeholder="Tôi đã… nhờ đó bây giờ…"
                onChange={e => setF(p => ({ ...p, after_text: e.target.value }))} />
              <div style={{ marginTop: 6 }}>
                <AttachmentInput value={f.attachments_after} folder="cai-tien" userId={me.id} protectedPaths={pathsGoc}
                  onChange={fn => setF(p => ({ ...p, attachments_after: fn(p.attachments_after) }))} />
              </div>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.75rem', color: '#92400e' }}>
              💡 Mẹo: quay <b>video 15–30 giây</b> thao tác trước và sau — bằng chứng tốt nhất, được cộng điểm.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!suaBai && <button style={{ ...nutPhu, flex: 1 }} onClick={() => setBuoc(1)}>← Quay lại</button>}
              <button style={{ ...nutChinh, flex: 1 }} onClick={() => setBuoc(3)}>Tiếp tục →</button>
            </div>
          </div>
        )}

        {buoc === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {CAT_MAP[f.category]?.icon} <b>{CAT_MAP[f.category]?.label}</b> — nhập vài con số, app tự quy đổi.
              Đơn giá công {Number(config.don_gia_gio).toLocaleString('vi-VN')} đ/giờ · {config.ngay_cong_thang} ngày công/tháng (admin cấu hình).
            </div>
            {!f.metrics.chua_do && (
              <MetricFields category={f.category} metrics={f.metrics}
                onChange={m => setF(p => ({ ...p, metrics: m }))} />
            )}
            <label style={{ ...theTrang, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
              <input type="checkbox" checked={!!f.metrics.chua_do}
                onChange={e => setF(p => ({ ...p, metrics: { ...p.metrics, chua_do: e.target.checked } }))} />
              Chưa đo được số liệu — nhờ quản lý đánh giá giúp
            </label>
            <OKetQua category={f.category} metrics={f.metrics} config={config} />
            {loi && <div style={{ color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600 }}><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {loi}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...nutPhu, flex: 1 }} onClick={() => setBuoc(2)}>← Quay lại</button>
              <button style={{ ...nutChinh, flex: 1, opacity: dangLuu ? 0.6 : 1 }} disabled={dangLuu} onClick={gui}>
                {dangLuu ? <Loader2 size={15} className="animate-spin" style={{ verticalAlign: -3 }} /> : '📤'} {suaBai ? 'Gửi lại' : 'Gửi cải tiến'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════ CHI TIẾT + DUYỆT ═════════════════════════════════
function ChiTietModal({ row, me, users, perm, config, onClose, onChanged, onEdit }) {
  const [score, setScore] = useState(row.score || {});
  const [ghiChu, setGhiChu] = useState(row.review_note || '');
  const [metrics, setMetrics] = useState(row.metrics || {});
  const [suaSoLieu, setSuaSoLieu] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  const tacGia = users.find(u => u.id === row.nhan_vien_id);
  const laCuaToi = row.nhan_vien_id === me.id;
  const choDuyet = row.status === 'CHO_DUYET' || row.status === 'CAN_BO_SUNG';
  const kqCham = chamDiem(score, config);
  const computed = row.computed || {};

  const capNhat = async (patch) => {
    setDangLuu(true);
    setLoi('');
    try {
      const { error } = await supabase.from('cai_tien').update(patch).eq('id', row.id);
      if (error) throw error;
      onChanged();
    } catch (err) {
      setLoi(err?.message || String(err));
    } finally {
      setDangLuu(false);
    }
  };

  const duyet = () => {
    if (!kqCham) { setLoi('Chấm đủ 5 tiêu chí rồi mới duyệt được'); return; }
    const computedMoi = tinhGiaTri(row.category, metrics, config);
    capNhat({
      score, tong_diem: kqCham.tong_diem, xep_loai: kqCham.xep_loai,
      metrics, computed: computedMoi, review_note: ghiChu.trim() || null,
      status: 'DA_DUYET', reviewer_id: me.id, reviewed_at: new Date().toISOString(),
    });
  };

  const traLai = () => {
    if (!ghiChu.trim()) { setLoi('Ghi rõ cần bổ sung gì để nhân viên biết đường sửa'); return; }
    capNhat({ status: 'CAN_BO_SUNG', review_note: ghiChu.trim(), reviewer_id: me.id });
  };

  const tuChoi = () => {
    if (!window.confirm('Từ chối cải tiến này?')) return;
    capNhat({ status: 'TU_CHOI', review_note: ghiChu.trim() || null, reviewer_id: me.id, reviewed_at: new Date().toISOString() });
  };

  const xoa = async () => {
    if (!window.confirm('Xóa cải tiến này? Ảnh/video đính kèm cũng bị xóa.')) return;
    setDangLuu(true);
    try {
      const { error } = await supabase.from('cai_tien').delete().eq('id', row.id);
      if (error) throw error;
      deleteAttachments(collectPaths([...(row.attachments_before || []), ...(row.attachments_after || [])]));
      onChanged();
    } catch (err) {
      setLoi(err?.message || String(err));
      setDangLuu(false);
    }
  };

  const fields = METRIC_FORMS[row.category] || [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg-primary, #f6f8fb)', borderRadius: 16, width: '100%', maxWidth: 560, padding: '1rem', margin: 'auto 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={onClose} style={{ ...nutPhu, padding: '0.35rem 0.5rem' }} aria-label="Đóng"><ChevronLeft size={16} /></button>
          <h3 style={{ margin: 0, fontSize: '1rem', flex: 1 }}>Chi tiết cải tiến</h3>
          <ChipTrangThai row={row} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ava user={tacGia} id={row.nhan_vien_id} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: '0.85rem' }}>{tacGia?.name || row.nhan_vien_id}</b>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gửi {fmtNgay(row.created_at)}</div>
          </div>
          <ChipLoai cat={row.category} />
        </div>

        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>{row.title}</div>

        <div style={{ ...theTrang, borderLeft: '4px solid #f43f5e', marginBottom: 8 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🔴 Trước cải tiến</div>
          <p style={{ margin: '0 0 6px', fontSize: '0.83rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{row.before_text || '—'}</p>
          <AttachmentList list={row.attachments_before} size={64} />
        </div>
        <div style={{ ...theTrang, borderLeft: '4px solid #059669', marginBottom: 8 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🟢 Sau cải tiến</div>
          <p style={{ margin: '0 0 6px', fontSize: '0.83rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{row.after_text || '—'}</p>
          <AttachmentList list={row.attachments_after} size={64} />
        </div>

        <div style={{ ...theTrang, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>📊 Số liệu & giá trị</div>
            {perm.edit && choDuyet && (
              <button style={{ ...nutPhu, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setSuaSoLieu(s => !s)}>
                <Pencil size={11} style={{ verticalAlign: -1 }} /> {suaSoLieu ? 'Xong' : 'Sửa số liệu'}
              </button>
            )}
          </div>
          {suaSoLieu ? (
            <MetricFields category={row.category} metrics={metrics} onChange={setMetrics} />
          ) : (
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <tbody>
                {fields.filter(fd => metrics[fd.key] !== undefined && metrics[fd.key] !== '').map(fd => (
                  <tr key={fd.key}>
                    <td style={{ padding: '3px 0', color: '#475569' }}>{fd.label}</td>
                    <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 700 }}>{Number(metrics[fd.key]).toLocaleString('vi-VN')} {fd.unit}</td>
                  </tr>
                ))}
                {metrics.chua_do && <tr><td colSpan={2} style={{ padding: '3px 0', color: '#b45309', fontWeight: 600 }}>Chưa đo được — chờ quản lý đánh giá</td></tr>}
              </tbody>
            </table>
          )}
          {(() => {
            const kq = suaSoLieu || choDuyet ? tinhGiaTri(row.category, metrics, config)
              : { tien_nam: computed.tien_nam || 0, dien_giai: computed.dien_giai || '' };
            return (
              <div style={{ marginTop: 6, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '0.5rem 0.7rem', fontSize: '0.82rem', fontWeight: 700, color: '#047857' }}>
                💎 ≈ {fmtTien(kq.tien_nam)}/năm <span style={{ fontWeight: 600, color: '#059669' }}>· {kq.dien_giai}</span>
              </div>
            );
          })()}
        </div>

        {row.review_note && row.status !== 'DA_DUYET' && (
          <div style={{ background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: 10, padding: '0.55rem 0.75rem', fontSize: '0.78rem', color: '#9a3412', marginBottom: 8 }}>
            <b>Quản lý nhắn:</b> {row.review_note}
          </div>
        )}

        {/* Khu chấm điểm: admin chấm khi chờ duyệt; mọi người xem lại điểm khi đã duyệt */}
        {(perm.edit && choDuyet) || row.score ? (
          <div style={{ ...theTrang, borderLeft: '4px solid #2563eb', marginBottom: 8 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>⭐ Chấm điểm (5 tiêu chí)</div>
            {TIEU_CHI.map(tc => {
              const ts = (config.trong_so || DEFAULT_CONFIG.trong_so)[tc.key];
              const v = Number(score?.[tc.key]) || 0;
              const choPhepCham = perm.edit && choDuyet;
              return (
                <div key={tc.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, width: 128, flexShrink: 0 }}>{tc.label}</span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', width: 30 }}>{ts}%</span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} onClick={() => choPhepCham && setScore(s => ({ ...s, [tc.key]: n }))}
                        style={{
                          width: 20, height: 20, borderRadius: '50%', cursor: choPhepCham ? 'pointer' : 'default',
                          background: n <= v ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
                        }} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.5rem 0.8rem', marginTop: 4 }}>
              <span style={{ fontSize: '0.85rem' }}>Tổng điểm: <b>{kqCham ? `${kqCham.tong_diem}/100` : '—'}</b></span>
              {kqCham && (
                <span style={{
                  background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', fontWeight: 800,
                  fontSize: '0.8rem', padding: '3px 12px', borderRadius: 999,
                }}>{kqCham.xep_loai === 'GHI_NHAN' ? 'Ghi nhận' : `Loại ${kqCham.xep_loai}`}</span>
              )}
            </div>
          </div>
        ) : null}

        {perm.edit && choDuyet && (
          <textarea style={{ ...oInput, resize: 'none', marginBottom: 8 }} rows={2} value={ghiChu}
            placeholder="Nhận xét / yêu cầu bổ sung…" onChange={e => setGhiChu(e.target.value)} />
        )}

        {perm.edit && row.status === 'DA_DUYET' && (
          <label style={{ ...theTrang, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>
            <input type="checkbox" checked={!!row.nhan_rong} disabled={dangLuu}
              onChange={e => capNhat({ nhan_rong: e.target.checked })} />
            <Rocket size={14} color="#7c3aed" /> Nhân rộng toàn nhà máy (cộng điểm vinh danh)
          </label>
        )}

        {loi && <div style={{ color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600, marginBottom: 8 }}><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {loi}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {perm.edit && choDuyet && (
            <>
              <button style={{ ...nutPhu, flex: 1, color: '#c2410c' }} disabled={dangLuu} onClick={traLai}>Cần bổ sung</button>
              <button style={{ ...nutPhu, color: '#b91c1c' }} disabled={dangLuu} onClick={tuChoi}>Từ chối</button>
              <button style={{ ...nutChinh, flex: 1.4, opacity: !kqCham || dangLuu ? 0.55 : 1 }} disabled={dangLuu} onClick={duyet}>
                ✓ Duyệt{kqCham ? ` · ${kqCham.xep_loai === 'GHI_NHAN' ? 'Ghi nhận' : 'Loại ' + kqCham.xep_loai}` : ''}
              </button>
            </>
          )}
          {laCuaToi && choDuyet && (
            <button style={{ ...nutPhu, flex: 1 }} disabled={dangLuu} onClick={() => onEdit(row)}>
              <Pencil size={13} style={{ verticalAlign: -2 }} /> Sửa bài
            </button>
          )}
          {((laCuaToi && row.status !== 'DA_DUYET') || perm.edit) && (
            <button style={{ ...nutPhu, color: '#b91c1c' }} disabled={dangLuu} onClick={xoa}>
              <Trash2 size={13} style={{ verticalAlign: -2 }} /> Xóa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════ XẾP HẠNG ═════════════════════════════════════════
function XepHang({ rows, users }) {
  // Chỉ bài ĐÃ DUYỆT mới lên bảng — giá trị đã được quản lý xác nhận.
  const bang = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.status !== 'DA_DUYET') continue;
      const cur = m.get(r.nhan_vien_id) || { id: r.nhan_vien_id, tien: 0, soCT: 0, soA: 0 };
      cur.tien += Number(r.computed?.tien_nam) || 0;
      cur.soCT += 1;
      if (r.xep_loai === 'A') cur.soA += 1;
      m.set(r.nhan_vien_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.tien - a.tien || b.soCT - a.soCT);
  }, [rows]);

  if (!bang.length) {
    return <div style={{ ...theTrang, textAlign: 'center', color: '#64748b', fontSize: '0.85rem', padding: '2rem 1rem' }}>
      Chưa có cải tiến nào được duyệt trong kỳ này.
    </div>;
  }

  const top3 = bang.slice(0, 3);
  const conLai = bang.slice(3);
  const thuTuBuc = [1, 0, 2].filter(i => top3[i]); // bạc | vàng | đồng
  const cauHinhBuc = { 0: { h: 86, bg: 'linear-gradient(180deg,#fbbf24,#d97706)', av: 56 }, 1: { h: 62, bg: 'linear-gradient(180deg,#cbd5e1,#94a3b8)', av: 46 }, 2: { h: 46, bg: 'linear-gradient(180deg,#fda4af,#fb7185)', av: 46 } };

  const TenNV = ({ id }) => users.find(u => u.id === id)?.name || id;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, margin: '0.5rem 0 0.9rem' }}>
        {thuTuBuc.map(i => {
          const nv = top3[i];
          const c = cauHinhBuc[i];
          return (
            <div key={nv.id} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <Ava user={users.find(u => u.id === nv.id)} id={nv.id} size={c.av} />
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}><TenNV id={nv.id} /></div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669' }}>{fmtTien(nv.tien)} · {nv.soCT} CT</div>
              <div style={{ height: c.h, background: c.bg, borderRadius: '10px 10px 0 0', marginTop: 5, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 5, color: '#fff', fontWeight: 800 }}>{i + 1}</div>
            </div>
          );
        })}
      </div>
      {conLai.map((nv, idx) => (
        <div key={nv.id} style={{ ...theTrang, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '0.55rem 0.8rem' }}>
          <span style={{ width: 20, fontWeight: 800, color: '#64748b', fontSize: '0.82rem' }}>{idx + 4}</span>
          <Ava user={users.find(u => u.id === nv.id)} id={nv.id} size={30} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: '0.82rem' }}><TenNV id={nv.id} /></b>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{nv.soCT} cải tiến{nv.soA ? ` · ${nv.soA} loại A` : ''}</div>
          </div>
          <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.82rem' }}>{fmtTien(nv.tien)}</span>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════ TAB CHÍNH ═════════════════════════════════════════
export default function CaiTienTab({ me, users = [], perm = {} }) {
  const [ky, setKy] = useState(kyHienTai());
  const [view, setView] = useState('feed');          // 'feed' | 'rank'
  const [rankKy, setRankKy] = useState('thang');      // 'thang' | 'quy' | 'nam'
  const [rows, setRows] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState('');
  const [thieuBang, setThieuBang] = useState(false);
  const [filter, setFilter] = useState('ALL');        // ALL | CHO_DUYET | DA_DUYET | MINE
  const [wizard, setWizard] = useState(null);         // null | {} | {row}
  const [chiTietId, setChiTietId] = useState(null);

  const taiDuLieu = useCallback(async () => {
    setLoading(true);
    setLoi('');
    try {
      let tu, den = null;
      if (view === 'rank') {
        const d = new Date();
        if (rankKy === 'thang') tu = new Date(d.getFullYear(), d.getMonth(), 1);
        else if (rankKy === 'quy') tu = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
        else tu = new Date(d.getFullYear(), 0, 1);
        tu = tu.toISOString();
      } else {
        [tu, den] = khoangKy(ky);
      }
      // makeQuery phải tạo builder MỚI mỗi lần gọi (luật của fetchAllRows —
      // dùng lại 1 builder thì .range các đợt sau chồng lên nhau).
      const denCuoi = den;
      const { data, error } = await fetchAllRows(() => {
        let q = supabase.from('cai_tien').select('*').gte('created_at', tu);
        if (denCuoi) q = q.lt('created_at', denCuoi);
        return q.order('id', { ascending: false });
      });
      if (error) throw error;
      setRows(data || []);
      setThieuBang(false);
    } catch (err) {
      if (laThieuBang(err)) { setThieuBang(true); }
      else setLoi(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ky, view, rankKy]);

  useEffect(() => { taiDuLieu(); }, [taiDuLieu]);

  // Cấu hình tải mềm 1 lần: hỏng/chưa có → DEFAULT_CONFIG, tab vẫn chạy.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('cai_tien_config').select('*').eq('id', 1).maybeSingle();
        if (data) setConfig(c => ({ ...c, ...data }));
      } catch { /* dùng mặc định */ }
    })();
  }, []);

  const rowsLoc = useMemo(() => {
    if (filter === 'MINE') return rows.filter(r => r.nhan_vien_id === me.id);
    if (filter === 'ALL') return rows;
    return rows.filter(r => r.status === filter);
  }, [rows, filter, me.id]);

  const thongKe = useMemo(() => ({
    tong: rows.length,
    tienNam: rows.filter(r => r.status === 'DA_DUYET').reduce((s, r) => s + (Number(r.computed?.tien_nam) || 0), 0),
    cuaToi: rows.filter(r => r.nhan_vien_id === me.id).length,
  }), [rows, me.id]);

  const like = async (row) => {
    const daLike = (row.likes || []).includes(me.id);
    // Optimistic — RPC trả mảng chuẩn để đồng bộ lại.
    setRows(rs => rs.map(r => r.id === row.id
      ? { ...r, likes: daLike ? (r.likes || []).filter(x => x !== me.id) : [...(r.likes || []), me.id] } : r));
    try {
      const { data, error } = await supabase.rpc('cai_tien_like', { p_id: row.id });
      if (error) throw error;
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, likes: data } : r));
    } catch {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, likes: row.likes || [] } : r));
    }
  };

  const chiTiet = chiTietId ? rows.find(r => r.id === chiTietId) : null;

  if (thieuBang) {
    return (
      <div style={{ maxWidth: 620, margin: '2rem auto', ...theTrang, padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle color="#b45309" size={22} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            <b>Chưa có bảng dữ liệu Cải tiến trên Supabase.</b><br />
            Chạy file <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 6 }}>sql/create_cai_tien.sql</code> trong
            Supabase SQL Editor (1 lần) rồi bấm tải lại. Tab khác không bị ảnh hưởng.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', position: 'relative', paddingBottom: 80 }}>
      {/* thanh đầu: đổi view + kỳ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0.25rem 0 0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('feed')}
            style={{ ...nutPhu, padding: '0.45rem 0.9rem', fontSize: '0.8rem', ...(view === 'feed' ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}>
            <ListChecks size={13} style={{ verticalAlign: -2 }} /> Cải tiến
          </button>
          <button onClick={() => setView('rank')}
            style={{ ...nutPhu, padding: '0.45rem 0.9rem', fontSize: '0.8rem', ...(view === 'rank' ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}>
            <Trophy size={13} style={{ verticalAlign: -2 }} /> Xếp hạng
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {view === 'feed' ? (
          <input type="month" value={ky} onChange={e => e.target.value && setKy(e.target.value)}
            style={{ ...oInput, width: 150 }} />
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            {[['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm']].map(([k, nhan]) => (
              <button key={k} onClick={() => setRankKy(k)}
                style={{ ...nutPhu, padding: '0.45rem 0.8rem', fontSize: '0.8rem', ...(rankKy === k ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}) }}>{nhan}</button>
            ))}
          </div>
        )}
      </div>

      {loi && <div style={{ ...theTrang, color: '#b91c1c', fontSize: '0.82rem', fontWeight: 600, marginBottom: 10 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {loi}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#2563eb', fontWeight: 700, fontSize: '0.85rem' }}>
          <Loader2 size={18} className="animate-spin" style={{ verticalAlign: -4 }} /> Đang tải…
        </div>
      ) : view === 'rank' ? (
        <XepHang rows={rows} users={users} />
      ) : (
        <>
          {/* thống kê kỳ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
            <div style={{ ...theTrang, textAlign: 'center', padding: '0.6rem 0.4rem' }}>
              <b style={{ fontSize: '1.05rem' }}>{thongKe.tong}</b>
              <div style={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>Cải tiến trong kỳ</div>
            </div>
            <div style={{ ...theTrang, textAlign: 'center', padding: '0.6rem 0.4rem' }}>
              <b style={{ fontSize: '1.05rem', color: '#059669' }}>{fmtTien(thongKe.tienNam)}</b>
              <div style={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>Làm lợi/năm (đã duyệt)</div>
            </div>
            <div style={{ ...theTrang, textAlign: 'center', padding: '0.6rem 0.4rem' }}>
              <b style={{ fontSize: '1.05rem' }}>{thongKe.cuaToi}</b>
              <div style={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600 }}>Của tôi</div>
            </div>
          </div>

          {/* chip lọc */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {[['ALL', 'Tất cả'], ['CHO_DUYET', '⏳ Chờ duyệt'], ['DA_DUYET', '✅ Đã duyệt'], ['MINE', '👤 Của tôi']].map(([k, nhan]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{
                  ...nutPhu, padding: '0.35rem 0.8rem', fontSize: '0.75rem', whiteSpace: 'nowrap',
                  ...(filter === k ? { background: '#0f172a', color: '#fff', borderColor: '#0f172a' } : {}),
                }}>{nhan}</button>
            ))}
          </div>

          {!rowsLoc.length && (
            <div style={{ ...theTrang, textAlign: 'center', color: '#64748b', fontSize: '0.85rem', padding: '2.5rem 1rem' }}>
              Chưa có cải tiến nào trong kỳ này.{perm.create ? ' Bấm nút + để gửi cải tiến đầu tiên! 💡' : ''}
            </div>
          )}

          {/* feed card */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
            {rowsLoc.map(row => {
              const tacGia = users.find(u => u.id === row.nhan_vien_id);
              const anhTruoc = (row.attachments_before || [])[0];
              const anhSau = (row.attachments_after || [])[0];
              const OAnh = ({ att, nhan }) => (
                <div style={{
                  flex: 1, height: 96, borderRadius: 10, overflow: 'hidden', position: 'relative',
                  background: att?.kind === 'image' ? `url(${att.url}) center/cover` : 'linear-gradient(135deg,#64748b,#94a3b8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {att?.kind !== 'image' && <span style={{ fontSize: 22 }}>{att ? '🎬' : '📷'}</span>}
                  <span style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(15,23,42,.65)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, letterSpacing: 0.5, padding: '2px 7px', borderRadius: 999 }}>{nhan}</span>
                </div>
              );
              const soLike = (row.likes || []).length;
              const daLike = (row.likes || []).includes(me.id);
              return (
                <div key={row.id} style={{ ...theTrang, cursor: 'pointer' }} onClick={() => setChiTietId(row.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Ava user={tacGia} id={row.nhan_vien_id} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: '0.8rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tacGia?.name || row.nhan_vien_id}</b>
                      <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{fmtNgay(row.created_at)}</span>
                    </div>
                    <ChipLoai cat={row.category} />
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.35, marginBottom: 8 }}>{row.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <OAnh att={anhTruoc} nhan="TRƯỚC" />
                    <span style={{ color: '#2563eb', fontWeight: 800 }}>➜</span>
                    <OAnh att={anhSau} nhan="SAU" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {Number(row.computed?.tien_nam) > 0 ? (
                      <span style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999 }}>
                        ≈ {fmtTien(row.computed.tien_nam)}/năm
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999 }}>Chờ định giá</span>
                    )}
                    <ChipTrangThai row={row} />
                    <button onClick={e => { e.stopPropagation(); like(row); }}
                      style={{
                        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
                        border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: '0.78rem', fontWeight: 700, color: daLike ? '#2563eb' : '#64748b',
                      }}>
                      <ThumbsUp size={14} fill={daLike ? '#2563eb' : 'none'} /> {soLike || ''}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* FAB gửi cải tiến */}
      {perm.create && view === 'feed' && (
        <button onClick={() => setWizard({})} aria-label="Gửi cải tiến"
          style={{
            position: 'fixed', bottom: 24, right: 20, width: 56, height: 56, borderRadius: '50%',
            border: 'none', cursor: 'pointer', color: '#fff', zIndex: 900,
            background: 'linear-gradient(135deg,#2563eb,#3b82f6)', boxShadow: '0 8px 20px rgba(37,99,235,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Plus size={26} />
        </button>
      )}

      {wizard && (
        <WizardGui me={me} config={config} row={wizard.row}
          onClose={() => setWizard(null)}
          onSaved={() => { setWizard(null); setChiTietId(null); taiDuLieu(); }} />
      )}
      {chiTiet && (
        <ChiTietModal row={chiTiet} me={me} users={users} perm={perm} config={config}
          onClose={() => setChiTietId(null)}
          onChanged={() => { setChiTietId(null); taiDuLieu(); }}
          onEdit={r => { setChiTietId(null); setWizard({ row: r }); }} />
      )}
    </div>
  );
}
