import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchAllRows } from '../lib/supabase';
import { useAuth, canSeeTab } from '../lib/AuthContext';
import { taiDuLieuKpi } from '../lib/kpiDuLieu';
import { apDungChamTuDong } from '../lib/kpiTuDong';
import { tinhBangKpi } from '../lib/kpiEngine';
import { xepViecDangLam, NHOM } from '../lib/viecDangLam';
import ModuleShell from '../components/ModuleShell';
import {
  LayoutDashboard, Trophy, ListTodo, AlertTriangle, LogOut,
  Loader2, ChevronRight, CalendarClock,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// Bảng tin cá nhân — màn hình ĐẦU TIÊN nhân viên thấy khi mở app.
// Bấm nút Home trên header mới sang lưới 9 phân hệ (/home).
//
// Hai khối, mỗi khối tự gác quyền của chính nó:
//   KPI       ← tab.tasks.kpi.view
//   Công việc ← tab.tasks.tasks.view
// Không có khối nào thì DiemDenDauTien đã đưa thẳng người dùng sang /home,
// nhưng màn hình vẫn phải chịu được trường hợp vào bằng cách gõ URL.
// ═══════════════════════════════════════════════════════════════════

const kyHienTai = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const so1 = n => (Math.abs(n) < 0.05 ? '0.0' : n.toFixed(1));
const mauTheoDiem = d => (d >= 90 ? '#059669' : d >= 75 ? '#d97706' : '#dc2626');

function loiChao() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// Hạn hiển thị gọn: "14:30 05/08". Không có hạn thì nói thẳng là không có.
function nhanHan(iso) {
  if (!iso) return 'Không có hạn';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Không có hạn';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

const MAU_NHOM = {
  [NHOM.QUA_HAN]: { vien: '#fecaca', nen: '#fef2f2', chu: '#b91c1c', nhan: 'Quá hạn' },
  [NHOM.SAP_HAN]: { vien: '#fed7aa', nen: '#fff7ed', chu: '#c2410c', nhan: 'Sắp đến hạn' },
  [NHOM.CON_LAI]: { vien: '#e2e8f0', nen: '#fff', chu: '#475569', nhan: '' },
};

export default function BangTinCaNhan() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const xemKpi = canSeeTab(user, 'tasks', 'kpi');
  const xemViec = canSeeTab(user, 'tasks', 'tasks');

  const [ky, setKy] = useState(kyHienTai);
  // null = CHƯA CÓ dữ liệu (đang tải hoặc tải hỏng), khác hẳn "tải được nhưng rỗng".
  // Trộn hai chuyện này lại là màn hình sẽ khoe "0.0 điểm · chưa mất điểm nào" cho
  // người mà thật ra ta chưa đọc được gì của họ — trấn an bằng một con số không có thật.
  const [duLieu, setDuLieu] = useState(null);
  const [viec, setViec] = useState(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');

  // Đếm lượt tải. Đổi kỳ hai lần liên tiếp thì hai truy vấn cùng bay; lượt cũ về sau
  // sẽ ghi đè kết quả của lượt mới và màn hình hiện số tháng cũ dưới nhãn tháng mới.
  const luotRef = useRef(0);

  const tai = useCallback(async () => {
    const luot = ++luotRef.current;
    const conHieuLuc = () => luot === luotRef.current;
    setDangTai(true);
    setLoi('');
    try {
      // Hai nguồn độc lập, chạy song song. Dùng allSettled chứ không phải all:
      // hỏng KPI không được xoá sạch khối công việc và ngược lại.
      const [kq1, kq2] = await Promise.allSettled([
        // kemDanhMuc:false — màn hình này không có form "Thêm chỉ tiêu", mà đó là
        // truy vấn duy nhất không lọc theo kỳ (627 dòng đo ngày 04/08/2026).
        xemKpi ? taiDuLieuKpi(ky, { kemDanhMuc: false }) : Promise.resolve(null),
        // Việc ĐANG LÀM của cả công ty — không lọc theo người ở phía máy chủ.
        // Lý do: dòng chưa migrate multi-assignee chỉ có `assignee_id`, lọc bằng
        // `.contains('assignee_ids', …)` sẽ làm chúng biến mất. Số việc đang làm
        // tự giới hạn theo bản chất (đo 04/08/2026: 10 việc toàn công ty), nên
        // lọc bằng memberIds() ở phía trình duyệt vừa đúng vừa rẻ.
        xemViec
          ? fetchAllRows(() => supabase
            .from('cong_viec_duoc_giao')
            .select('id, title, status, due_date, assignee_ids, assignee_id')
            .eq('status', 'IN_PROGRESS')
            .order('id'))
          : Promise.resolve(null),
      ]);

      if (!conHieuLuc()) return;   // đã có lượt tải mới — bỏ hẳn kết quả của lượt này

      // Gắn kèm kỳ vào dữ liệu: phần tính bên dưới đối chiếu để không bao giờ ghép
      // số của kỳ này với nhãn của kỳ kia.
      if (kq1.status === 'fulfilled') setDuLieu(kq1.value && { ...kq1.value, kyCuaDuLieu: ky });
      else { setDuLieu(null); setLoi(kq1.reason?.message || String(kq1.reason)); }

      if (kq2.status === 'rejected') {
        setViec(null);
        setLoi(p => p || kq2.reason?.message || String(kq2.reason));
      } else if (kq2.value?.error) {
        // fetchAllRows trả lỗi trong { error } chứ không ném — không bắt ở đây thì
        // danh sách rỗng vì lỗi sẽ hiện thành "không có việc nào đang làm".
        setViec(null);
        setLoi(p => p || kq2.value.error.message || String(kq2.value.error));
      } else if (kq2.value) {
        setViec(kq2.value.data || []);
      }
    } catch (err) {
      if (conHieuLuc()) setLoi(p => p || err?.message || String(err));
    } finally {
      if (conHieuLuc()) setDangTai(false);
    }
  }, [ky, xemKpi, xemViec]);

  useEffect(() => { tai(); }, [tai]);

  // Dữ liệu chỉ được dùng khi ĐÚNG kỳ đang chọn. Ngay sau khi bấm đổi kỳ có một lượt
  // vẽ mà `ky` đã mới còn `duLieu` vẫn cũ — không chặn ở đây thì điểm tháng cũ loé lên
  // dưới nhãn tháng mới, và đó đúng là kiểu sai mà màn hình này sinh ra để tránh.
  const duLieuDungKy = duLieu && duLieu.kyCuaDuLieu === ky ? duLieu : null;
  const dangTaiKpi = dangTai || (duLieu !== null && duLieu.kyCuaDuLieu !== ky);

  // Tính KPI của CHÍNH MÌNH — đúng ba dòng mà KpiTab dùng để dựng bảng từng người,
  // nên hai màn hình không thể ra hai con số khác nhau.
  const kpi = useMemo(() => {
    const d = duLieuDungKy;
    if (!d || !user) return null;
    const { rows, logs } = apDungChamTuDong(
      d.rows, d.logs, d.viec, ky, undefined,
      d.sanXuat, d.chamCong, d.ngoaiLe, d.caiTien);
    const dongBoPhan = rows.filter(r => r.cap_do === 'BO_PHAN');
    const cuaToi = rows.filter(r => r.cap_do !== 'BO_PHAN' && r.nhan_vien_id === user.id);
    // "Chưa có bảng KPI cho kỳ này" khác hẳn "có bảng, đạt trọn điểm". Trả cờ để
    // phần hiển thị nói đúng chuyện, đừng khoe 0 điểm cho người chưa được lập chỉ tiêu.
    if (!cuaToi.length) return { chuaCoBang: true };
    return tinhBangKpi([...dongBoPhan, ...cuaToi], logs);
  }, [duLieuDungKy, user, ky]);

  // Giữ null xuyên suốt khi chưa đọc được: khối việc phải nói "không tải được"
  // chứ không phải "không có việc nào đang làm".
  const viecCuaToi = useMemo(
    () => (viec === null ? null : xepViecDangLam(viec, user?.id)),
    [viec, user]);

  const hoSo = (
    <div style={S.hoSo}>
      <span style={S.tenNguoi} className="mobile-hidden">{user?.name || 'Bạn'}</span>
      <button onClick={() => { logout(); navigate('/login'); }} style={S.nutThoat} title="Đăng xuất">
        <LogOut size={14} />
      </button>
    </div>
  );

  return (
    <ModuleShell
      title="Bảng tin của tôi"
      icon={LayoutDashboard}
      color="#2563eb"
      loading={dangTai}
      onRefresh={tai}
      headerRight={hoSo}
    >
      <div style={S.than}>
        <div style={S.chao}>
          <h2 style={S.chaoTitle}>{loiChao()}, {user?.name || 'bạn'}</h2>
          <p style={S.chaoSub}>
            {new Date().toLocaleDateString('vi-VN', {
              weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric',
            })}
          </p>
        </div>

        {loi && (
          <div style={S.dangLoi}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>Không tải được đầy đủ dữ liệu: {loi}</span>
          </div>
        )}

        <div style={S.luoi}>
          {xemKpi && (
            <KhoiKpi
              ky={ky} setKy={setKy} kpi={kpi} dangTai={dangTaiKpi}
              loiNguon={duLieuDungKy?.loiViec}
              // KHÔNG kèm mã nhân viên vào URL: mã đó cũng là tên đăng nhập, và màn hình
              // này chỉ bao giờ mở KPI của CHÍNH người đang đăng nhập — TaskApp tự biết
              // họ là ai. Thêm tham số chỉ để lộ tên đăng nhập ra thanh địa chỉ.
              onXemChiTiet={() => navigate('/tasks?view=kpi')}
            />
          )}

          {xemViec && (
            <KhoiViec ds={viecCuaToi} dangTai={dangTai} onMo={() => navigate('/tasks')} />
          )}

          {!xemKpi && !xemViec && (
            <div style={S.the}>
              <p style={S.rong}>
                Tài khoản của bạn chưa được cấp quyền xem KPI hay Công việc.
                Bấm nút Trang chủ ở góc trên để vào các phân hệ khác.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModuleShell>
  );
}

// ── Khối KPI ──────────────────────────────────────────────────────
// Xuất ra để test được với dữ liệu thật: render tĩnh không chạy useEffect nên
// không có cách nào khác để kiểm chứng phần hiển thị khi ĐÃ có số.
export function KhoiKpi({ ky, setKy, kpi, dangTai, loiNguon, onXemChiTiet }) {
  const mat = kpi?.danhSachMatDiem || [];
  const diem = kpi?.tongKpi ?? 0;

  return (
    <section style={S.the}>
      <div style={S.dauThe}>
        <div style={S.tenThe}>
          <Trophy size={15} color="#2563eb" />
          <h3 style={S.tieuDe}>KPI của tôi</h3>
        </div>
        <input
          type="month" value={ky} aria-label="Chọn kỳ KPI"
          onChange={e => setKy(e.target.value || ky)}
          style={S.oKy}
        />
      </div>

      {dangTai ? (
        <p style={S.rong}><Loader2 size={14} style={{ verticalAlign: 'middle' }} /> Đang tải…</p>
      ) : !kpi ? (
        // Tải hỏng. TUYỆT ĐỐI không rơi xuống nhánh dưới: nó sẽ hiện "0.0 điểm" và
        // "Chưa mất điểm nào trong tháng này" — hai câu khẳng định về dữ liệu mà ta
        // chưa hề đọc được. Người dùng yên tâm nhầm rồi mất điểm mà không biết.
        <p style={S.rong}>Không tải được KPI. Bấm “Làm mới” ở góc trên để thử lại.</p>
      ) : kpi.chuaCoBang ? (
        <p style={S.rong}>Chưa có bảng KPI cho kỳ này.</p>
      ) : (
        <>
          <div style={S.oDiem}>
            <span style={{ ...S.soDiem, color: mauTheoDiem(diem) }}>{so1(diem)}</span>
            <span style={S.donVi}>điểm</span>
          </div>

          {/* Thiếu dòng chấm chung = HỎNG DỮ LIỆU làm mất trọn trọng số, không phải
              kết quả chấm. Giấu nó đi là để người ta mất điểm mà không biết vì sao. */}
          {kpi?.nhomThieuDongChung?.length > 0 && (
            <div style={S.dangCanhBao}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>
                Thiếu dòng chấm chung cho nhóm {kpi.nhomThieuDongChung.join(', ')} —
                phần điểm này đang tính là 0. Báo quản lý để bổ sung.
              </span>
            </div>
          )}

          {loiNguon && (
            <div style={S.dangCanhBao}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>Một nguồn chấm tự động chưa tải được, điểm có thể chưa đủ: {loiNguon}</span>
            </div>
          )}

          <p style={S.nhanNhom}>
            {mat.length > 0 ? `Đang mất điểm ở ${mat.length} chỉ tiêu` : 'Chỉ tiêu đang mất điểm'}
          </p>

          {mat.length === 0 ? (
            <p style={S.rong}>Chưa mất điểm nào trong tháng này.</p>
          ) : (
            <ul style={S.ds}>
              {mat.map(d => (
                <li key={d.id}>
                  <button onClick={onXemChiTiet} className="bt-dong" style={S.dongMat}>
                    <span style={S.tenChiTieu}>{d.ten}</span>
                    <span style={S.soMat}>−{so1(d.diemMat)}</span>
                    <ChevronRight size={14} style={{ flexShrink: 0, color: '#94a3b8' }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <style>{`
        .bt-dong { transition: background 0.15s ease; }
        .bt-dong:hover { background: #f1f5f9; }
        @media (prefers-reduced-motion: reduce) { .bt-dong { transition: none; } }
      `}</style>
    </section>
  );
}

// ── Khối Công việc ────────────────────────────────────────────────
export function KhoiViec({ ds, dangTai, onMo }) {
  const soTre = (ds || []).filter(v => v.nhom === NHOM.QUA_HAN).length;

  return (
    <section style={S.the}>
      <div style={S.dauThe}>
        <div style={S.tenThe}>
          <ListTodo size={15} color="#6366f1" />
          <h3 style={S.tieuDe}>Việc đang làm</h3>
        </div>
        <button onClick={onMo} style={S.nutPhu}>Mở phân hệ</button>
      </div>

      {dangTai ? (
        <p style={S.rong}><Loader2 size={14} style={{ verticalAlign: 'middle' }} /> Đang tải…</p>
      ) : ds === null ? (
        // Cùng lý do như khối KPI: "không đọc được" ≠ "không có việc nào".
        <p style={S.rong}>Không tải được danh sách việc. Bấm “Làm mới” ở góc trên để thử lại.</p>
      ) : ds.length === 0 ? (
        <p style={S.rong}>Không có việc nào đang làm.</p>
      ) : (
        <>
          <p style={S.nhanNhom}>
            {ds.length} việc{soTre > 0 ? ` · ${soTre} quá hạn` : ''}
          </p>
          <ul style={S.ds}>
            {ds.map(v => {
              const m = MAU_NHOM[v.nhom];
              return (
                <li key={v.id}>
                  <button
                    onClick={onMo} className="bt-dong"
                    style={{ ...S.dongViec, borderColor: m.vien, background: m.nen }}
                  >
                    <span style={S.tenViec}>{v.title || '(không có tiêu đề)'}</span>
                    <span style={{ ...S.han, color: m.chu }}>
                      <CalendarClock size={12} style={{ flexShrink: 0 }} />
                      {m.nhan ? `${m.nhan} · ` : ''}{nhanHan(v.due_date)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ── Styles ────────────────────────────────────────────────────────
// Luật giao diện của app này: KHÔNG cuộn ngang ở bất kỳ bề ngang nào, chữ trên
// nút/nhãn luôn một dòng. Nội dung dài (tên việc, tên chỉ tiêu) được xuống dòng
// và ngắt trong từ thay vì đẩy khung rộng ra.
const S = {
  than: {
    width: '100%', maxWidth: 1080, margin: '0 auto',
    padding: '1rem 0.85rem 2rem', boxSizing: 'border-box',
  },
  chao: { marginBottom: '0.9rem' },
  chaoTitle: {
    margin: 0, fontSize: 'clamp(1.05rem, 3.6vw, 1.4rem)', fontWeight: 800,
    letterSpacing: '-0.02em', color: '#0f172a',
    overflowWrap: 'anywhere',
  },
  chaoSub: { margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 },

  luoi: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: '0.8rem', alignItems: 'start',
  },

  the: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
    padding: '0.9rem', minWidth: 0,
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  },
  dauThe: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '0.5rem', marginBottom: '0.7rem', minWidth: 0, flexWrap: 'wrap',
  },
  tenThe: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  tieuDe: {
    margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  oKy: {
    padding: '0.3rem 0.45rem', borderRadius: 8, border: '1px solid #e2e8f0',
    fontSize: '0.78rem', background: '#fff', color: '#475569',
    maxWidth: '100%', minWidth: 0,
  },
  nutPhu: {
    padding: '0.3rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0',
    background: '#fff', color: '#475569', fontSize: '0.75rem', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },

  oDiem: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: '0.35rem' },
  soDiem: { fontSize: 'clamp(1.8rem, 7vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 },
  donVi: { fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 },

  nhanNhom: {
    margin: '0.7rem 0 0.4rem', fontSize: '0.72rem', fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em',
  },
  ds: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 },

  dongMat: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '0.5rem 0.55rem', borderRadius: 9,
    border: '1px solid #e2e8f0', background: '#fff',
    cursor: 'pointer', textAlign: 'left', minWidth: 0,
  },
  tenChiTieu: {
    flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600, color: '#334155',
    overflowWrap: 'anywhere',
  },
  soMat: { fontSize: '0.82rem', fontWeight: 800, color: '#dc2626', flexShrink: 0 },

  dongViec: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 3,
    padding: '0.5rem 0.55rem', borderRadius: 9, border: '1px solid',
    cursor: 'pointer', textAlign: 'left', minWidth: 0,
  },
  tenViec: {
    fontSize: '0.82rem', fontWeight: 600, color: '#0f172a',
    overflowWrap: 'anywhere',
  },
  han: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: '0.72rem', fontWeight: 600,
  },

  rong: { margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 },

  dangLoi: {
    display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: '0.7rem',
    padding: '0.55rem 0.65rem', borderRadius: 10,
    background: '#fef2f2', color: '#b91c1c', fontSize: '0.76rem', lineHeight: 1.45,
  },
  dangCanhBao: {
    display: 'flex', alignItems: 'flex-start', gap: 6, margin: '0.5rem 0 0',
    padding: '0.5rem 0.6rem', borderRadius: 9,
    background: '#fffbeb', color: '#92400e', fontSize: '0.74rem', lineHeight: 1.45,
  },

  hoSo: { display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 },
  tenNguoi: {
    fontSize: '0.78rem', fontWeight: 700, color: '#334155',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140,
  },
  nutThoat: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
};
