import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePersistedState } from '../../lib/usePersistedState';
import { taskDb as db } from '../../lib/task_supabase';
import { dataCache } from '../../lib/dataCache';
import { HeadphonesIcon, LayoutDashboard, Calendar, MessageSquare, Send } from 'lucide-react';
import { useAuth, canSeeTab, getTabPerm } from '../../lib/AuthContext';
import ModuleShell, { TabButton, ActionButton } from '../../components/ModuleShell';
import DateRangeDropdown from '../../components/DateRangeDropdown';
import CskhDashboard from './CskhDashboard';
import ZaloReportTab from './ZaloReportTab';
import ZaloReportModal from './ZaloReportModal';
import ZaloKpiTab from './ZaloKpiTab';

// ── Date Utility ──────────────────────────────────────────────────────────
const isDateInRange = (dateStr, preset, customRange) => {
  if (preset === 'all' || !dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const todayStart = startOfDay(now);
  
  if (preset === 'today') return d >= todayStart;
  
  if (preset === 'yesterday') {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return d >= yesterday && d < todayStart;
  }
  
  if (preset === 'this_week') {
    const startOfWeek = new Date(todayStart);
    const day = startOfWeek.getDay() || 7; 
    startOfWeek.setDate(startOfWeek.getDate() - day + 1);
    return d >= startOfWeek;
  }
  
  if (preset === 'last_week') {
    const endLastWeek = new Date(todayStart);
    const day = endLastWeek.getDay() || 7; 
    endLastWeek.setDate(endLastWeek.getDate() - day + 1);
    const startLastWeek = new Date(endLastWeek);
    startLastWeek.setDate(startLastWeek.getDate() - 7);
    return d >= startLastWeek && d < endLastWeek;
  }
  
  if (preset === 'this_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= startOfMonth;
  }
  
  if (preset === 'last_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d >= startOfLastMonth && d < startOfMonth;
  }
  
  if (preset === 'this_year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return d >= startOfYear;
  }
  
  if (preset === 'last_year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
    return d >= startOfLastYear && d < startOfYear;
  }
  
  if (preset === 'custom' && customRange.start && customRange.end) {
    const start = startOfDay(new Date(customRange.start));
    const end = new Date(customRange.end);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  
  return true;
};

const CskhApp = () => {
  const { user } = useAuth();
  const canViewDashboard = canSeeTab(user, 'cskh', 'dashboard');
  const canViewKpi = canSeeTab(user, 'cskh', 'zalo_kpi');
  const canViewReport = canSeeTab(user, 'cskh', 'zalo_report');
  const canCreateReport = getTabPerm(user, 'cskh', 'zalo_report').create;

  const [activeTab, setActiveTab] = usePersistedState('cskh_activeTab', 'menu');

  // Nếu tab đã lưu không còn quyền xem → quay về menu
  useEffect(() => {
    if (activeTab !== 'menu' && !canSeeTab(user, 'cskh', activeTab)) setActiveTab('menu');
  }, [activeTab, user, setActiveTab]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showZaloModal, setShowZaloModal] = useState(false);
  const [zaloRefresh, setZaloRefresh] = useState(0);

  // ── Date Filter States (persisted) ──────────────────────────────────────
  const [dateRange, setDateRange] = usePersistedState('cskh_dateRange', { preset: 'Tất cả', from: '', to: '' });
  // DateRangeDropdown đã tự tính from/to cho mọi preset → map sang định dạng isDateInRange đang dùng
  const datePreset = dateRange.preset === 'Tất cả' ? 'all' : 'custom';
  const customRange = { start: dateRange.from, end: dateRange.to };

  // ── Data states (Raw) ──────────────────────────────────────
  const [rawDonHang, setRawDonHang] = useState([]);
  const [rawKhaiBao, setRawKhaiBao] = useState([]);
  const [rawThanhToan, setRawThanhToan] = useState([]);
  const [rawConfirmation, setRawConfirmation] = useState([]);
  const [rawDataLinks, setRawDataLinks] = useState([]);

  const CSKH_CACHE_KEY = 'cskh_app_data';

  // 🚀 Parallel pagination: index-backed ordering + date boundary giảm I/O disk
  // - .order('created_at', { ascending: false }) → dùng index, không sort trên disk
  // - .gte('created_at', dateFrom) → giới hạn dữ liệu, giảm số trang fetch
  const MAX_DATA_MONTHS = 24; // Lấy dữ liệu 2 năm gần nhất — điều chỉnh nếu cần

  const fetchAll = useCallback(async (tableName) => {
    const boundary = new Date();
    boundary.setMonth(boundary.getMonth() - MAX_DATA_MONTHS);
    const dateFrom = boundary.toISOString();

    const { count, error: countErr } = await db
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', dateFrom);

    if (countErr || !count || count === 0) return [];

    const step = 1000;
    const pages = Math.ceil(count / step);
    const promises = Array.from({ length: pages }, (_, i) =>
      db.from(tableName)
        .select('*')
        .gte('created_at', dateFrom)
        .order('created_at', { ascending: false })
        .range(i * step, (i + 1) * step - 1)
    );
    const results = await Promise.all(promises);
    return results.flatMap(r => r.data || []);
  }, []);

  const fetchData = useCallback(async (forceRefresh = false) => {
    // 🚀 Cache hit: hiển thị ngay từ bộ nhớ
    if (!forceRefresh) {
      const cached = dataCache.get(CSKH_CACHE_KEY);
      if (cached) {
        setRawDonHang(cached.d1);
        setRawKhaiBao(cached.d2);
        setRawThanhToan(cached.d3);
        setRawConfirmation(cached.d4);
        setRawDataLinks(cached.d5);
        setLastUpdated(cached.lastUpdated);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [d1, d2, d3, d4, d5] = await Promise.all([
        fetchAll('du_lieu_don_hang_lap_moi'),
        fetchAll('du_lieu_khai_bao__bao_hanh'),
        fetchAll('du_lieu_thanh_toan_bh'),
        fetchAll('confirmation_logs'),
        fetchAll('data_links'),
      ]);
      const now = new Date();
      setRawDonHang(d1);
      setRawKhaiBao(d2);
      setRawThanhToan(d3);
      setRawConfirmation(d4);
      setRawDataLinks(d5);
      setLastUpdated(now);
      // Lưu cache
      dataCache.set(CSKH_CACHE_KEY, { d1, d2, d3, d4, d5, lastUpdated: now });
    } catch (err) {
      console.error('[CSKH] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Apply Date Filter ──────────────────────────────────────
  const filteredDonHang = useMemo(() => rawDonHang.filter(r => isDateInRange(r.created_at || r.ngay_lap_dat, datePreset, customRange)), [rawDonHang, datePreset, customRange]);
  const filteredKhaiBao = useMemo(() => rawKhaiBao.filter(r => isDateInRange(r.created_at, datePreset, customRange)), [rawKhaiBao, datePreset, customRange]);
  const filteredThanhToan = useMemo(() => rawThanhToan.filter(r => isDateInRange(r.created_at, datePreset, customRange)), [rawThanhToan, datePreset, customRange]);
  const filteredConfirmation = useMemo(() => rawConfirmation.filter(r => isDateInRange(r.created_at, datePreset, customRange)), [rawConfirmation, datePreset, customRange]);
  const filteredDataLinks = useMemo(() => rawDataLinks.filter(r => isDateInRange(r.created_at, datePreset, customRange)), [rawDataLinks, datePreset, customRange]);

  return (
    <ModuleShell
      title="CSKH"
      icon={HeadphonesIcon}
      color="#6366f1"
      loading={activeTab === 'dashboard' && loading}
      onRefresh={() => { dataCache.invalidate(CSKH_CACHE_KEY); fetchData(true); }}
      onBack={activeTab !== 'menu' ? () => setActiveTab('menu') : undefined}
      headerRight={<>
        {/* Date filter — DateRangeDropdown chuẩn (đồng bộ với Kho) */}
        <DateRangeDropdown label="Ngày" value={dateRange} onChange={setDateRange} />
        {canCreateReport && <ActionButton onClick={() => setShowZaloModal(true)} icon={Send} label="BC Zalo" color="#0068ff" />}
      </>}
      tabs={activeTab !== 'menu' ? (
        <>
          {canViewDashboard && <TabButton active={activeTab==='dashboard'} onClick={()=>setActiveTab('dashboard')} icon={LayoutDashboard} label="Tổng Quan" color="#6366f1" />}
          {canViewKpi && <TabButton active={activeTab==='zalo_kpi'} onClick={()=>setActiveTab('zalo_kpi')} icon={HeadphonesIcon} label="KPI CSKH Zalo" color="#16a34a" />}
          {canViewReport && <TabButton active={activeTab==='zalo_report'} onClick={()=>setActiveTab('zalo_report')} icon={MessageSquare} label="BC Trực Zalo" color="#0068ff" />}
        </>
      ) : null}
    >
      <main style={{ padding: activeTab === 'menu' ? '1rem' : '1rem 0.75rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'menu' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            maxWidth: 800,
            width: '100%',
            alignSelf: 'center',
          }}>
            {[
              ...(canViewDashboard ? [{ id: 'dashboard', label: 'Tổng Quan', icon: LayoutDashboard, color: '#6366f1' }] : []),
              ...(canViewKpi ? [{ id: 'zalo_kpi', label: 'KPI CSKH Zalo', icon: HeadphonesIcon, color: '#16a34a' }] : []),
              ...(canViewReport ? [{ id: 'zalo_report', label: 'BC Trực Zalo (Thủ công)', icon: MessageSquare, color: '#0068ff' }] : [])
            ].map(tabDef => (
              <button
                key={tabDef.id}
                onClick={() => setActiveTab(tabDef.id)}
                style={{
                  background: '#fff', borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  padding: '1.25rem 0.5rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '0.5rem', cursor: 'pointer',
                  transition: 'all 0.25s',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: tabDef.color || '#6366f1',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  <tabDef.icon size={24} color="#fff" />
                </div>
                <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center' }}>
                  {tabDef.label}
                </h3>
              </button>
            ))}
          </div>
        ) : activeTab === 'dashboard' ? (
          /* Dashboard cần 5 bảng dữ liệu → chờ load xong */
          loading && rawDonHang.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
              <p style={{ color: '#94a3b8', fontWeight: 600 }}>Đang tải dữ liệu Tổng Quan...</p>
            </div>
          ) : (
            <CskhDashboard
              donHangLapMoi={filteredDonHang}
              khaiBaoBH={filteredKhaiBao}
              thanhToanBH={filteredThanhToan}
              confirmationLogs={filteredConfirmation}
              dataLinks={filteredDataLinks}
            />
          )
        ) : activeTab === 'zalo_kpi' ? (
          /* KPI Zalo tự quản lý dữ liệu riêng → render ngay (nhận khoảng ngày từ header) */
          <ZaloKpiTab dateRange={dateRange} />
        ) : activeTab === 'zalo_report' ? (
          <ZaloReportTab refreshTrigger={zaloRefresh} />
        ) : null}
      </main>

      {/* ── Zalo Report Modal ── */}
      {showZaloModal && (
        <ZaloReportModal
          onClose={() => setShowZaloModal(false)}
          onSuccess={() => {
            setZaloRefresh(v => v + 1);
            setActiveTab('zalo_report');
          }}
        />
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </ModuleShell>
  );
};

export default CskhApp;
