import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase as db } from '../../lib/supabase';
import { Loader2, RefreshCw, Download, Trash2, XCircle, ShoppingCart, Archive, Play, RotateCcw, Ban, Send, Layers, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { todayLocal } from '../../lib/dateUtils';
import { computeNeededDates, loadComponentStock } from '../../lib/dksxEngine';
import { usePersistedState } from '../../lib/usePersistedState';
import { ColumnToggleModal } from '../../components/WarehouseSharedUI';
import { useAuth } from '../../lib/AuthContext';
import { runProposalDraft, sendBatch, discardDraft, getCurrentDraft, listBatches } from '../../lib/proposalBatch';

// Các cột data có thể ẩn/hiện (cột "#" và "Thao tác" luôn hiện)
const TABLE_COLS = ['urgency','dlk_code','san_pham','unit','ngay_de_xuat','ngay_du_kien','needed_ts','stock_now','calculated_qty','actual_qty','received','con_lai','tien_do','note'];
const COL_LABELS_MAP = { urgency:'Khẩn cấp', dlk_code:'Mã DLK', san_pham:'Sản phẩm', unit:'ĐVT', ngay_de_xuat:'Ngày ĐX', ngay_du_kien:'Dự kiến về', needed_ts:'Ngày cần về', stock_now:'Tồn kho', calculated_qty:'SL ĐX', actual_qty:'SL Đặt', received:'Đã nhập', con_lai:'Còn lại', tien_do:'Tiến độ', note:'Ghi chú' };

const TIEN_DO_OPTIONS = ['Mới','Chờ duyệt','Đã đặt','Đang vận chuyển','Đã về kho'];
// Mỗi tiến độ một màu riêng (dùng cho dropdown + bộ lọc)
const TIEN_DO_COLORS = {
  'Mới':             { bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' },
  'Chờ duyệt':       { bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  'Đã đặt':          { bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  'Đang vận chuyển': { bg:'#eef2ff', color:'#6366f1', border:'#c7d2fe' },
  'Đã về kho':       { bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
};

// Trạng thái của ĐỢT đề xuất (khác trạng thái từng dòng ở trên)
const BATCH_STATUS_CFG = {
  NHAP:   { label:'Nháp',    bg:'#fefce8', color:'#ca8a04', border:'#fde047' },
  DA_GUI: { label:'Đã gửi',  bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  DONG:   { label:'Đóng',    bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' },
};

// 5 mức khẩn cấp theo số ngày còn lại đến "ngày cần về kho"
const URGENCY_CFG = [
  { max: 7,        label:'🔴 Cực gấp',  bg:'#fef2f2', color:'#dc2626', border:'#fca5a5' },
  { max: 15,       label:'🟠 Gấp',      bg:'#fff7ed', color:'#ea580c', border:'#fdba74' },
  { max: 30,       label:'🟡 Cảnh báo', bg:'#fefce8', color:'#ca8a04', border:'#fde047' },
  { max: 45,       label:'🔵 Theo dõi', bg:'#eff6ff', color:'#2563eb', border:'#93c5fd' },
  { max: Infinity, label:'🟢 Thư thả',  bg:'#f0fdf4', color:'#16a34a', border:'#86efac' },
];
function urgencyOf(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null;
  const cfg = URGENCY_CFG.find(c => daysLeft < c.max) || URGENCY_CFG[URGENCY_CFG.length - 1];
  return daysLeft < 0 ? { ...cfg, label: '🔴 Quá hạn' } : cfg;
}

const s = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569' },
  input: { padding:'0.25rem 0.4rem',border:'1px solid #e2e8f0',borderRadius:6,fontSize:'0.75rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

// Làm tròn 3 số lẻ trước khi hiển thị — khớp round3 trong mrp.js lúc ghi dữ liệu.
// Tồn/nhu cầu cộng dồn nhiều dòng có thể trôi số kiểu 464.79999999999995 (dấu phẩy
// động); không làm tròn lại ở đây thì số xấu đó lộ thẳng ra bảng nháp.
const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

export default function OrderProposalTab({ navigateTo, perms = { view: true, create: true, edit: true, delete: true, io: true } }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = usePersistedState('orderProposal_filterStatus', 'active'); // 'active' | 'all' | 'done'
  const [archiveOpen, setArchiveOpen] = useState(false);   // modal xem lưu trữ
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [filterTienDo, setFilterTienDo] = usePersistedState('orderProposal_filterTienDo', 'all'); // 'all' | một giá trị trong TIEN_DO_OPTIONS
  const [sortCol, setSortCol] = usePersistedState('orderProposal_sortCol', null); // cột đang sắp xếp (null = giữ thứ tự gốc)
  const [sortAsc, setSortAsc] = usePersistedState('orderProposal_sortAsc', true);
  // Ẩn/hiện cột — lưu localStorage, mặc định hiện hết
  const [hiddenCols, setHiddenCols] = usePersistedState('orderProposal_hiddenCols', new Set());
  // Theo dõi các lệnh lưu đang bay (để Làm mới chờ chúng commit trước khi đọc lại DB)
  const pendingRef = useRef(new Set());
  // Hẹn giờ debounce cho ô gõ tay (SL Đặt / Ghi chú) theo từng dòng id
  const debounceRef = useRef({});

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      // Chờ mọi lệnh lưu đang bay xong, tránh đọc dữ liệu cũ trước khi UPDATE commit
      if (pendingRef.current.size) await Promise.allSettled([...pendingRef.current]);
      // Lấy tất cả đề xuất DLK
      const { data: proposals, error } = await db.from('purchase_proposals')
        .select('*')
        .order('dlk_code', { ascending: false });
      if (error) throw error;

      // Ẩn dòng thuộc đợt còn là NHÁP: bản nháp chưa gửi không được lẫn vào danh sách
      // phòng mua đang dùng. Dòng cũ (batch_id không trỏ tới đợt nào) và dòng thuộc đợt
      // ĐÃ GỬI / ĐÓNG vẫn hiện bình thường. Lọc bằng JS sau khi fetch — không dùng filter
      // .not('batch_id','in',...) của PostgREST vì danh sách rỗng sẽ làm lỗi cú pháp.
      const { data: draftBatches } = await db.from('proposal_batches')
        .select('id').eq('trang_thai', 'NHAP');
      const draftIds = new Set((draftBatches || []).map(b => b.id));

      // Tổng nhập về theo dlk_code (từ du_lieu_nhap)
      const { data: nhapData } = await db.from('du_lieu_nhap')
        .select('dlk_code, so_luong_nhap')
        .not('dlk_code', 'is', null);
      const nhapMap = {};
      (nhapData || []).forEach(r => {
        if (r.dlk_code) nhapMap[r.dlk_code] = (nhapMap[r.dlk_code] || 0) + (Number(r.so_luong_nhap) || 0);
      });

      // Tính trang_thai tự động từ so_luong_nhap
      const today = todayLocal();
      let formatted = (proposals || [])
        .filter(p => !p.batch_id || !draftIds.has(p.batch_id))
        .map(p => {
          const received = nhapMap[p.dlk_code] || 0;
          let auto_trang_thai = p.trang_thai || 'Mới';
          if (received >= (Number(p.actual_qty) || 0) && received > 0) {
            auto_trang_thai = 'Đã về kho đủ';
          } else if (received > 0 && received < (Number(p.actual_qty) || 0)) {
            auto_trang_thai = 'Đã về kho thiếu';
          }
          // Tính days_remaining từ ngay_du_kien nếu có
          let days_remaining = null;
          if (p.ngay_du_kien) {
            const diff = Math.ceil((new Date(p.ngay_du_kien) - new Date(today)) / 86400000);
            days_remaining = diff;
          }
          return { ...p, received, auto_trang_thai, days_remaining };
        });

      // Filter
      if (filterStatus === 'active') {
        formatted = formatted.filter(r => !['Đã về kho đủ','Hủy'].includes(r.auto_trang_thai));
      } else if (filterStatus === 'done') {
        formatted = formatted.filter(r => ['Đã về kho đủ','Đã về kho thiếu','Hủy'].includes(r.auto_trang_thai));
      }

      // Tồn kho hiện tại (tồn hàng hóa theo mã, gồm cả WIP SX9 — khớp tab Tồn HH)
      // + Ngày cần về kho + số ngày còn lại (tính realtime). Quét inventory_stock 1 lần,
      // dùng lại bản đồ tồn cho computeNeededDates để không quét lặp.
      const stockMap = await loadComponentStock();
      const needed = await computeNeededDates(stockMap);
      formatted = formatted.map(r => {
        const nd = needed[r.item_code];
        return { ...r, stock_now: stockMap[r.item_code] || 0, needed_ts: nd ? nd.neededTs : null, days_left: nd ? nd.daysLeft : null };
      });

      setRows(formatted);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải đề xuất: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  // =====================================================================
  // BẢN NHÁP (Giai đoạn 3) — chạy/duyệt/gửi đợt đề xuất theo lô qua proposalBatch.js.
  // Bảng nháp là MỘT VIEW RIÊNG, tách khỏi bảng đã gửi ở trên — không đụng gì tới
  // state/hàm của bảng đã gửi.
  // =====================================================================
  const { user } = useAuth();
  const [draft, setDraft] = useState(null);                             // đợt NHÁP hiện tại, null = không có
  const [draftLines, setDraftLines] = useState([]);                     // dòng purchase_proposals của đợt nháp
  const [draftBusy, setDraftBusy] = useState(false);                    // đang Chạy/Gửi/Huỷ — chặn bấm chồng
  const [draftSaving, setDraftSaving] = useState(false);                // đang lưu SL Đặt của 1 dòng nháp
  const [viewMode, setViewMode] = useState('committed');                // 'committed' (bảng chính) | 'draft' (bảng nháp)
  const [missingParams, setMissingParams] = useState([]);               // mã thiếu lead time/an toàn ở lần Chạy gần nhất
  const [expandedDraft, setExpandedDraft] = useState(() => new Set());  // dòng nháp đang mở xem cách tính
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [batchListRows, setBatchListRows] = useState([]);
  const [batchListLoading, setBatchListLoading] = useState(false);
  const draftPendingRef = useRef(new Set());   // lệnh lưu SL Đặt đang bay (nháp) — riêng với pendingRef của bảng chính
  const draftDebounceRef = useRef({});         // hẹn giờ debounce SL Đặt theo từng dòng nháp

  // Tải đợt NHÁP hiện tại (tối đa 1 đợt, ép bởi chỉ mục proposal_batches_one_draft ở
  // CSDL) + toàn bộ dòng của nó.
  const fetchDraft = useCallback(async () => {
    try {
      const batch = await getCurrentDraft();
      setDraft(batch);
      if (batch) {
        const { data, error } = await db.from('purchase_proposals')
          .select('*').eq('batch_id', batch.id).order('item_code', { ascending: true });
        if (error) throw error;
        setDraftLines(data || []);
      } else {
        setDraftLines([]);
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi tải bản nháp: ' + e.message);
    }
  }, []);

  useEffect(() => { fetchDraft(); }, [fetchDraft]);

  // Lưu SL Đặt của 1 dòng nháp — theo dõi promise trong draftPendingRef, cùng kiểu
  // với handleSaveRow của bảng chính (không dùng lại chung vì trường lưu khác nhau).
  const saveDraftRow = useCallback((row, value) => {
    setDraftSaving(true);
    const p = db.from('purchase_proposals').update({ actual_qty: Number(value) || 0 }).eq('id', row.id)
      .then(({ error }) => { if (error) alert('Lỗi lưu SL Đặt: ' + error.message); })
      .finally(() => {
        draftPendingRef.current.delete(p);
        if (draftPendingRef.current.size === 0) setDraftSaving(false);
      });
    draftPendingRef.current.add(p);
    return p;
  }, []);

  const handleUpdateDraftRow = (id, field, value) => {
    setDraftLines(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Gõ tay SL Đặt: lưu sau 500ms ngừng gõ — khớp cách bảng chính đang làm.
  const queueDraftSave = useCallback((row, value) => {
    const id = row.id;
    if (draftDebounceRef.current[id]) clearTimeout(draftDebounceRef.current[id]);
    draftDebounceRef.current[id] = setTimeout(() => {
      draftDebounceRef.current[id] = null;
      saveDraftRow(row, value);
    }, 500);
  }, [saveDraftRow]);

  // Blur: huỷ debounce đang chờ rồi lưu ngay (tránh lưu 2 lần).
  const flushDraftSave = useCallback((row, value) => {
    const id = row.id;
    if (draftDebounceRef.current[id]) { clearTimeout(draftDebounceRef.current[id]); draftDebounceRef.current[id] = null; }
    saveDraftRow(row, value);
  }, [saveDraftRow]);

  // Dọn debounce còn treo khi unmount (chuyển tab) — lưu nốt phần đang chờ.
  useEffect(() => {
    const timers = draftDebounceRef.current;
    return () => Object.keys(timers).forEach(id => {
      if (timers[id]) { clearTimeout(timers[id]); timers[id] = null; }
    });
  }, []);

  const toggleExpandDraft = (id) => setExpandedDraft(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Xoá 1 dòng khỏi bản nháp (khác handleDelete — hàm đó xoá 1 đề xuất đã gửi).
  const handleDeleteDraftLine = async (row) => {
    if (!window.confirm(`Xoá dòng ${row.item_code} khỏi bản nháp?`)) return;
    const { error } = await db.from('purchase_proposals').delete().eq('id', row.id);
    if (error) { alert('Lỗi xoá dòng: ' + error.message); return; }
    setDraftLines(prev => prev.filter(r => r.id !== row.id));
  };

  // Chạy đề xuất: tạo mới bản nháp nếu chưa có, hoặc GHI ĐÈ (server tự xoá dòng cũ rồi
  // chèn lại) nếu đã có. Ghi đè xoá mất số đã sửa tay nên phải xác nhận trước khi đã có nháp.
  const handleRunDraft = async () => {
    if (draft && !window.confirm('Chạy lại sẽ TÍNH LẠI TOÀN BỘ bản nháp hiện tại — mọi số lượng đã sửa tay ở cột "SL Đặt" trong bản nháp này sẽ mất. Tiếp tục?')) return;
    setDraftBusy(true);
    try {
      const nguoiTao = (user && (user.name || user.id)) || '';
      const { missingParams: mp } = await runProposalDraft(nguoiTao);
      setMissingParams(mp || []);
      await fetchDraft();
      setViewMode('draft');
    } catch (e) {
      console.error(e);
      alert('Lỗi chạy đề xuất: ' + e.message);
    } finally {
      setDraftBusy(false);
    }
  };

  // Huỷ nháp: chỉ xoá được khi đợt CÒN là NHÁP — daHuy=0 nghĩa là ai đó đã gửi/huỷ đợt
  // này ở màn khác trước ta rồi, phải tải lại chứ không được báo "đã huỷ" khống.
  const handleDiscardDraft = async () => {
    if (!draft) return;
    if (!window.confirm(`Huỷ bản nháp ${draft.ma_dot}? Toàn bộ ${draftLines.length} dòng trong bản nháp sẽ bị xoá vĩnh viễn.`)) return;
    setDraftBusy(true);
    try {
      const { daHuy } = await discardDraft(draft.id);
      if (!daHuy) {
        alert('Bản nháp này không còn ở trạng thái nháp nữa (có thể vừa được gửi hoặc huỷ ở nơi khác). Đang tải lại...');
        await fetchDraft();
        return;
      }
      setMissingParams([]);
      setViewMode('committed');
      await fetchDraft();
    } catch (e) {
      console.error(e);
      alert('Lỗi huỷ nháp: ' + e.message);
    } finally {
      setDraftBusy(false);
    }
  };

  // Gửi đề xuất: NHÁP → ĐÃ GỬI. daGui=0 cùng lý do như trên — không được báo thành công khống.
  const handleSendDraft = async () => {
    if (!draft) return;
    if (draftLines.length === 0) { alert('Bản nháp chưa có dòng nào — không có gì để gửi.'); return; }
    if (!window.confirm(`Gửi đợt ${draft.ma_dot} với ${draftLines.length} dòng đề xuất? Sau khi gửi, các dòng này sẽ chuyển sang danh sách theo dõi đặt hàng chính.`)) return;
    setDraftBusy(true);
    try {
      const nguoiGui = (user && (user.name || user.id)) || '';
      const { daGui } = await sendBatch(draft.id, nguoiGui);
      if (!daGui) {
        alert('Đợt này không còn ở trạng thái nháp nữa (có thể vừa được gửi hoặc huỷ ở nơi khác). Đang tải lại...');
        await fetchDraft();
        await fetchProposals();
        return;
      }
      setMissingParams([]);
      setViewMode('committed');
      await fetchDraft();
      await fetchProposals();
    } catch (e) {
      console.error(e);
      alert('Lỗi gửi đề xuất: ' + e.message);
    } finally {
      setDraftBusy(false);
    }
  };

  // Danh sách đợt — modal chỉ đọc, khớp kiểu openArchive() ở dưới.
  const openBatchList = async () => {
    setBatchListOpen(true);
    setBatchListLoading(true);
    try {
      const data = await listBatches();
      setBatchListRows(data);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải danh sách đợt: ' + e.message);
    } finally {
      setBatchListLoading(false);
    }
  };

  // Lưu 1 dòng. `override` truyền thẳng giá trị vừa đổi để không phụ thuộc state đã/chưa cập nhật.
  // Theo dõi promise trong pendingRef để Làm mới chờ trước khi đọc lại DB.
  const handleSaveRow = useCallback((row, override = {}) => {
    const merged = { ...row, ...override };
    setSaving(true);
    const p = db.from('purchase_proposals').update({
      actual_qty: Number(merged.actual_qty) || 0,
      ngay_du_kien: merged.ngay_du_kien || null,
      tien_do: merged.tien_do,
      trang_thai: merged.auto_trang_thai,
      note: merged.note || '',
    }).eq('id', row.id).then(({ error }) => {
      if (error) alert('Lỗi lưu: ' + error.message);
    }).finally(() => {
      pendingRef.current.delete(p);
      if (pendingRef.current.size === 0) setSaving(false);
    });
    pendingRef.current.add(p);
    return p;
  }, []);

  // Gõ tay (SL Đặt / Ghi chú): lưu sau 500ms ngừng gõ — không mất dữ liệu nếu reload trước khi blur, không spam DB mỗi phím.
  const queueSave = useCallback((row, override) => {
    const id = row.id;
    if (debounceRef.current[id]) clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(() => {
      debounceRef.current[id] = null;
      handleSaveRow(row, override);
    }, 500);
  }, [handleSaveRow]);

  // Blur: huỷ debounce đang chờ rồi lưu ngay (tránh lưu 2 lần).
  const flushSave = useCallback((row, override = {}) => {
    const id = row.id;
    if (debounceRef.current[id]) { clearTimeout(debounceRef.current[id]); debounceRef.current[id] = null; }
    handleSaveRow(row, override);
  }, [handleSaveRow]);

  // Dọn các debounce còn treo khi unmount (chuyển tab) — lưu nốt phần đang chờ.
  useEffect(() => {
    const timers = debounceRef.current;
    return () => Object.keys(timers).forEach(id => {
      if (timers[id]) { clearTimeout(timers[id]); timers[id] = null; }
    });
  }, []);

  const handleUpdateRow = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleCancel = async (row) => {
    if (!window.confirm(`Hủy đề xuất ${row.dlk_code}?`)) return;
    await db.from('purchase_proposals').update({ trang_thai:'Hủy', auto_trang_thai:'Hủy' }).eq('id', row.id);
    fetchProposals();
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Xóa vĩnh viễn đề xuất ${row.dlk_code}?`)) return;
    await db.from('purchase_proposals').delete().eq('id', row.id);
    fetchProposals();
  };

  const handleNhapMuaVao = (row) => {
    if (navigateTo) navigateTo('nhap-kho', { dlk: { dlk_code: row.dlk_code, item_code: row.item_code, item_name: row.item_name, qty: row.actual_qty, unit: row.unit } });
  };

  const openArchive = async () => {
    setArchiveOpen(true);
    setArchiveLoading(true);
    const { data } = await db.from('purchase_proposals_archive').select('*').order('archived_at', { ascending: false }).limit(500);
    setArchiveRows(data || []);
    setArchiveLoading(false);
  };

  const handleExport = () => {
    const data = rows.map((r, i) => ({
      'STT': i + 1,
      'Mã DLK': r.dlk_code,
      'Mã HH': r.item_code,
      'Tên hàng hóa': r.item_name,
      'ĐVT': r.unit,
      'Ngày đề xuất': r.ngay_de_xuat,
      'Ngày dự kiến về': r.ngay_du_kien,
      'Tồn kho hiện tại': r.stock_now,
      'SL đề xuất TT': r.calculated_qty,
      'SL thực đặt': r.actual_qty,
      'SL đã nhập về': r.received,
      'Tiến độ': r.tien_do,
      'Trạng thái': r.auto_trang_thai,
      'Ghi chú': r.note,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{wch:5},{wch:16},{wch:14},{wch:36},{wch:7},{wch:13},{wch:14},{wch:14},{wch:12},{wch:12},{wch:12},{wch:18},{wch:20},{wch:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DLK_de_xuat');
    XLSX.writeFile(wb, `DLK_de_xuat_${todayLocal()}.xlsx`);
  };

  const countActive = rows.filter(r => !['Đã về kho đủ','Hủy'].includes(r.auto_trang_thai)).length;

  // Lọc thêm theo tiến độ (client-side, áp lên trên bộ lọc trạng thái)
  const filteredRows = filterTienDo === 'all' ? rows : rows.filter(r => (r.tien_do || 'Mới') === filterTienDo);
  const tienDoCounts = rows.reduce((acc, r) => { const k = r.tien_do || 'Mới'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  // Sắp xếp khi bấm tiêu đề cột (null/'' luôn xuống cuối)
  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  };
  const sortInd = (col) => (sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ' ⇅');
  const sortVal = (r, col) => {
    switch (col) {
      case 'urgency': return r.days_left;
      case 'needed_ts': return r.needed_ts;
      case 'stock_now': return Number(r.stock_now) || 0;
      case 'calculated_qty': return Number(r.calculated_qty) || 0;
      case 'actual_qty': return Number(r.actual_qty) || 0;
      case 'received': return Number(r.received) || 0;
      case 'con_lai': return Math.max(0, (Number(r.actual_qty) || 0) - (Number(r.received) || 0));
      default: return r[col];
    }
  };
  // Ẩn/hiện cột: vis(col) = cột đang hiện; visCount = số ô <td> mỗi dòng (cột data hiện + # + Thao tác)
  const vis = (col) => !hiddenCols.has(col);
  const visCount = TABLE_COLS.filter(vis).length + 2;

  const visibleRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        let va = sortVal(a, sortCol), vb = sortVal(b, sortCol);
        const na = va === null || va === undefined || va === '';
        const nb = vb === null || vb === undefined || vb === '';
        if (na && nb) return 0;
        if (na) return 1;   // thiếu giá trị → cuối bảng
        if (nb) return -1;
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      })
    : filteredRows;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,height:'100%',position:'relative'}}>
      {/* Toolbar */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'0.5rem',display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'nowrap',position:'sticky',top:0,zIndex:50,overflowX:'auto'}}>
        <span style={{fontSize:'0.8rem',fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>Theo dõi đặt hàng DLK</span>
        {perms.create && (
          <button onClick={handleRunDraft} disabled={draftBusy} title="Tính lại nhu cầu mua linh kiện, tạo bản nháp để duyệt trước khi gửi" style={{...s.btn,color:'#fff',background:'#7c3aed',border:'none',flexShrink:0,whiteSpace:'nowrap'}}>
            {draftBusy ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Play size={14}/>}
            Chạy đề xuất
          </button>
        )}
        <div style={{display:'flex',gap:4,marginLeft:8}}>
          {[['active','Đang mở'],['all','Tất cả'],['done','Hoàn tất/Hủy']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)} style={{...s.btn,background:filterStatus===v?'#7c3aed':'#f8fafc',color:filterStatus===v?'#fff':'#475569',border:'none',padding:'0.25rem 0.6rem',fontSize:'0.72rem'}}>
              {l}{v==='active'&&countActive>0?` (${countActive})`:''}
            </button>
          ))}
        </div>
        <div style={{width:1,height:20,background:'#e2e8f0',flexShrink:0}}/>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{fontSize:'0.7rem',fontWeight:700,color:'#94a3b8',whiteSpace:'nowrap'}}>Tiến độ:</span>
          {(() => {
            const active = filterTienDo==='all';
            return (
              <button onClick={()=>setFilterTienDo('all')} style={{...s.btn,padding:'0.2rem 0.55rem',fontSize:'0.7rem',border:'none',background:active?'#334155':'#f1f5f9',color:active?'#fff':'#475569'}}>
                Tất cả
              </button>
            );
          })()}
          {TIEN_DO_OPTIONS.map(o => {
            const c = TIEN_DO_COLORS[o];
            const active = filterTienDo===o;
            return (
              <button key={o} onClick={()=>setFilterTienDo(active?'all':o)} style={{...s.btn,padding:'0.2rem 0.55rem',fontSize:'0.7rem',whiteSpace:'nowrap',background:active?c.color:c.bg,color:active?'#fff':c.color,border:`1px solid ${c.border}`,fontWeight:700}}>
                {o}{tienDoCounts[o]?` (${tienDoCounts[o]})`:''}
              </button>
            );
          })}
        </div>
        <button onClick={fetchProposals} disabled={loading} style={{...s.btn,padding:'0.4rem',marginLeft:'auto',flexShrink:0}}>
          <RefreshCw size={15} style={{animation:loading?'spin 1s linear infinite':'none',color:'#7c3aed'}}/>
        </button>
        <button onClick={handleExport} disabled={rows.length===0} style={{...s.btn,color:'#059669',flexShrink:0}}><Download size={14}/>Excel</button>
        <button onClick={openArchive} style={{...s.btn,color:'#b45309',flexShrink:0}}><Archive size={14}/>Lưu trữ</button>
        <button onClick={openBatchList} title="Danh sách các đợt đề xuất đã chạy" style={{...s.btn,color:'#0ea5e9',flexShrink:0,whiteSpace:'nowrap'}}><Layers size={14}/>Đợt</button>
        <ColumnToggleModal columns={TABLE_COLS} labels={COL_LABELS_MAP} hiddenCols={hiddenCols} setHiddenCols={setHiddenCols} />
      </div>

      {/* Dải trạng thái bản nháp — hiện bất cứ khi nào có 1 đợt đang NHÁP, dù đang xem
          bảng nào. Bấm vào dòng chữ để bật/tắt xem bảng nháp bên dưới. */}
      {draft && (
        <div style={{background:'#f5f3ff',borderBottom:'1px solid #ddd6fe',padding:'0.45rem 0.6rem',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',rowGap:6}}>
          <button onClick={()=>setViewMode(v=>v==='draft'?'committed':'draft')} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',padding:0,fontSize:'0.74rem',fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>
            {viewMode==='draft' ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            Bản nháp {draft.ma_dot} · {draft.ngay_chay} · {draftLines.length} dòng
          </button>
          <div style={{display:'flex',gap:6,marginLeft:'auto',flexShrink:0}}>
            {perms.create && (
              <button onClick={handleRunDraft} disabled={draftBusy} title="Tính lại toàn bộ bản nháp" style={{...s.btn,padding:'0.3rem 0.55rem',fontSize:'0.7rem',color:'#7c3aed',border:'1px solid #ddd6fe',whiteSpace:'nowrap'}}>
                {draftBusy ? <Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/> : <RotateCcw size={12}/>}Chạy lại
              </button>
            )}
            {perms.delete && (
              <button onClick={handleDiscardDraft} disabled={draftBusy} title="Xoá toàn bộ bản nháp" style={{...s.btn,padding:'0.3rem 0.55rem',fontSize:'0.7rem',color:'#dc2626',border:'1px solid #fca5a5',whiteSpace:'nowrap'}}>
                <Ban size={12}/>Huỷ nháp
              </button>
            )}
            {perms.create && (
              <button onClick={handleSendDraft} disabled={draftBusy} title="Gửi đợt này sang danh sách theo dõi đặt hàng" style={{...s.btn,padding:'0.3rem 0.55rem',fontSize:'0.7rem',color:'#fff',background:'#16a34a',border:'none',whiteSpace:'nowrap'}}>
                <Send size={12}/>Gửi đề xuất
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cảnh báo mã thiếu tham số — chỉ có sau 1 lần Chạy trong phiên này (không lưu ở
          CSDL), không được ẩn đi vì đây là lý do 1 số mã bị thiếu khỏi bản nháp. */}
      {draft && missingParams.length > 0 && (
        <div style={{background:'#fef2f2',borderBottom:'1px solid #fca5a5',padding:'0.5rem 0.75rem',display:'flex',alignItems:'flex-start',gap:6}}>
          <AlertTriangle size={14} style={{color:'#dc2626',flexShrink:0,marginTop:2}}/>
          <span style={{fontSize:'0.72rem',color:'#991b1b',lineHeight:1.5}}>
            <b>{missingParams.length} mã chưa khai đủ lead time / thời gian an toàn</b> nên KHÔNG tính được nhu cầu, bản nháp đang THIẾU các mã này: <b>{missingParams.join(', ')}</b>. Vào tab Danh mục bổ sung lead time / thời gian an toàn rồi bấm "Chạy lại".
          </span>
        </div>
      )}

      <main style={{flex:1,overflow:'hidden',background:'#fff'}}>
        {viewMode === 'draft' ? (
          !draft ? (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:10}}>
              <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Không có bản nháp nào — bấm "Chạy đề xuất" ở thanh công cụ để tạo.</p>
            </div>
          ) : (
            <div style={{overflowX:'auto',height:'100%'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.74rem'}}>
                <thead>
                  <tr style={{background:'#faf5ff',position:'sticky',top:0,zIndex:1}}>
                    <th style={th}>#</th>
                    <th style={th}>Mã LK</th>
                    <th style={{...th,textAlign:'left'}}>Tên</th>
                    <th style={th}>ĐVT</th>
                    <th style={{...th,textAlign:'right'}} title="Tồn an toàn cần có, tại thời điểm chạy đợt (snapshot_gross)">Nhu cầu</th>
                    <th style={{...th,textAlign:'right'}} title="Tồn kho tại thời điểm chạy đợt (snapshot_ton)">Tồn</th>
                    <th style={{...th,textAlign:'right'}} title="Hàng đang về từ đợt trước, tại thời điểm chạy đợt (snapshot_dang_ve)">Đang về</th>
                    <th style={{...th,textAlign:'right'}} title="Nhu cầu − Tồn − Đang về, do hệ thống tính">SL ĐX</th>
                    <th style={{...th,textAlign:'right'}}>SL Đặt</th>
                    <th style={th}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {draftLines.length === 0 ? (
                    <tr><td colSpan={10} style={{padding:'2.5rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>Bản nháp chưa có dòng nào.</td></tr>
                  ) : draftLines.map((row, i) => {
                    const expanded = expandedDraft.has(row.id);
                    const gross = round3(row.snapshot_gross);
                    const ton = round3(row.snapshot_ton);
                    const dangVe = round3(row.snapshot_dang_ve);
                    const calc = round3(row.calculated_qty);
                    return (
                      <React.Fragment key={row.id}>
                        <tr style={{borderBottom: expanded ? 'none' : '1px solid #f1f5f9'}} onMouseEnter={e=>e.currentTarget.style.background='#faf5ff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td style={{...td,color:'#94a3b8'}}>{i+1}</td>
                          <td style={{...td,fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>
                            <button onClick={()=>toggleExpandDraft(row.id)} title="Xem cách tính" style={{background:'none',border:'none',cursor:'pointer',padding:0,marginRight:4,color:'#94a3b8',verticalAlign:'middle',display:'inline-flex'}}>
                              {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            </button>
                            {row.item_code}
                          </td>
                          <td style={{...td,textAlign:'left',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</td>
                          <td style={{...td,color:'#64748b'}}>{row.unit}</td>
                          <td style={{...td,textAlign:'right'}}>{gross.toLocaleString('vi-VN')}</td>
                          <td style={{...td,textAlign:'right'}}>{ton.toLocaleString('vi-VN')}</td>
                          <td style={{...td,textAlign:'right'}}>{dangVe.toLocaleString('vi-VN')}</td>
                          <td style={{...td,textAlign:'right',color:'#64748b'}}>{calc.toLocaleString('vi-VN')}</td>
                          <td style={{...td,textAlign:'right'}}>
                            <input type="number" min="0" value={round3(row.actual_qty)} disabled={!perms.edit}
                              onChange={e=>{const v=e.target.value; handleUpdateDraftRow(row.id,'actual_qty',v); queueDraftSave(row,v);}}
                              onBlur={e=>flushDraftSave(row,e.target.value)}
                              style={{...s.input,width:60,textAlign:'right',fontWeight:700,color:'#0f172a'}}/>
                          </td>
                          <td style={{...td}}>
                            <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                              {perms.delete && (
                                <button onClick={()=>handleDeleteDraftLine(row)} title="Xoá dòng khỏi bản nháp" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#ef4444',fontSize:'0.68rem',border:'1px solid #fca5a5'}}>
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr style={{borderBottom:'1px solid #f1f5f9',background:'#fafafa'}}>
                            <td/>
                            <td colSpan={9} style={{padding:'0.35rem 0.5rem 0.6rem',fontSize:'0.68rem',color:'#64748b'}}>
                              Cách tính: {gross.toLocaleString('vi-VN')} (nhu cầu) − {ton.toLocaleString('vi-VN')} (tồn) − {dangVe.toLocaleString('vi-VN')} (đang về) = <b style={{color:'#334155'}}>{calc.toLocaleString('vi-VN')}</b> (SL ĐX)
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:10}}>
            <Loader2 size={32} style={{animation:'spin 1s linear infinite',color:'#7c3aed'}}/>
            <p style={{color:'#94a3b8',fontWeight:600,fontSize:'0.85rem'}}>Đang tải danh sách đề xuất...</p>
          </div>
        ) : (
          <div style={{overflowX:'auto',height:'100%'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.74rem'}}>
              <thead>
                <tr style={{background:'#faf5ff',position:'sticky',top:0,zIndex:1}}>
                  <th style={th}>#</th>
                  {vis('urgency') && <th onClick={()=>handleSort('urgency')} style={sortTh(sortCol==='urgency')}>Khẩn cấp{sortInd('urgency')}</th>}
                  {vis('dlk_code') && <th onClick={()=>handleSort('dlk_code')} style={sortTh(sortCol==='dlk_code')}>Mã DLK{sortInd('dlk_code')}</th>}
                  {vis('san_pham') && <th onClick={()=>handleSort('item_code')} style={{...sortTh(sortCol==='item_code'),textAlign:'left'}}>Sản phẩm{sortInd('item_code')}</th>}
                  {vis('unit') && <th onClick={()=>handleSort('unit')} style={sortTh(sortCol==='unit')}>ĐVT{sortInd('unit')}</th>}
                  {vis('ngay_de_xuat') && <th onClick={()=>handleSort('ngay_de_xuat')} style={sortTh(sortCol==='ngay_de_xuat')}>Ngày ĐX{sortInd('ngay_de_xuat')}</th>}
                  {vis('ngay_du_kien') && <th onClick={()=>handleSort('ngay_du_kien')} style={sortTh(sortCol==='ngay_du_kien')}>Dự kiến về{sortInd('ngay_du_kien')}</th>}
                  {vis('needed_ts') && <th onClick={()=>handleSort('needed_ts')} style={sortTh(sortCol==='needed_ts')}>Ngày cần về{sortInd('needed_ts')}</th>}
                  {vis('stock_now') && <th onClick={()=>handleSort('stock_now')} style={{...sortTh(sortCol==='stock_now'),textAlign:'right'}} title="Tồn kho hiện tại (tồn hàng hóa theo mã, gồm cả hàng dở dang SX9)">Tồn kho{sortInd('stock_now')}</th>}
                  {vis('calculated_qty') && <th onClick={()=>handleSort('calculated_qty')} style={{...sortTh(sortCol==='calculated_qty'),textAlign:'right'}}>SL ĐX{sortInd('calculated_qty')}</th>}
                  {vis('actual_qty') && <th onClick={()=>handleSort('actual_qty')} style={{...sortTh(sortCol==='actual_qty'),textAlign:'right'}}>SL Đặt{sortInd('actual_qty')}</th>}
                  {vis('received') && <th onClick={()=>handleSort('received')} style={{...sortTh(sortCol==='received'),textAlign:'right'}}>Đã nhập{sortInd('received')}</th>}
                  {vis('con_lai') && <th onClick={()=>handleSort('con_lai')} style={{...sortTh(sortCol==='con_lai'),textAlign:'right'}}>Còn lại{sortInd('con_lai')}</th>}
                  {vis('tien_do') && <th onClick={()=>handleSort('tien_do')} style={sortTh(sortCol==='tien_do')}>Tiến độ{sortInd('tien_do')}</th>}
                  {vis('note') && <th style={th}>Ghi chú</th>}
                  <th style={th}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={visCount} style={{padding:'2.5rem',textAlign:'center',color:'#94a3b8',fontWeight:600}}>
                    {filterTienDo!=='all' ? `Không có đề xuất nào ở tiến độ "${filterTienDo}"` : filterStatus==='active' ? 'Không có đề xuất nào đang mở — vào tab Tồn HH để gửi đề xuất mới' : 'Không có dữ liệu'}
                  </td></tr>
                ) : visibleRows.map((row, i) => {
                  const tdc = TIEN_DO_COLORS[row.tien_do] || TIEN_DO_COLORS['Mới'];
                  const isDone = ['Đã về kho đủ','Hủy'].includes(row.auto_trang_thai);
                  return (
                    <tr key={row.id} style={{borderBottom:'1px solid #f1f5f9',opacity:isDone?0.65:1}} onMouseEnter={e=>e.currentTarget.style.background='#faf5ff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                      <td style={{...td,color:'#94a3b8'}}>{i+1}</td>
                      {vis('urgency') && <td style={{...td}}>
                        {(() => {
                          const u = urgencyOf(row.days_left);
                          return u ? (
                            <span style={{display:'inline-block',padding:'0.15rem 0.45rem',borderRadius:5,fontSize:'0.66rem',fontWeight:700,background:u.bg,color:u.color,border:`1px solid ${u.border}`,whiteSpace:'nowrap'}}>
                              {u.label}{row.days_left!==null?` (${row.days_left}d)`:''}
                            </span>
                          ) : <span style={{color:'#cbd5e1',fontSize:'0.68rem'}}>—</span>;
                        })()}
                      </td>}
                      {vis('dlk_code') && <td style={{...td,fontWeight:700,color:'#7c3aed',whiteSpace:'nowrap'}}>{row.dlk_code}</td>}
                      {vis('san_pham') && <td style={{...td,textAlign:'left'}}>
                        <div style={{fontWeight:600,color:'#0284c7'}}>
                          {row.item_code}
                          {row.source === 'shortfall' && <span title="Đề xuất tạo cho phần thiếu" style={{marginLeft:6,fontSize:'0.58rem',fontWeight:700,color:'#b45309',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:4,padding:'0 4px'}}>⤷ phần thiếu</span>}
                        </div>
                        <div style={{fontSize:'0.66rem',color:'#64748b',fontStyle:'italic'}}>{row.item_name}</div>
                      </td>}
                      {vis('unit') && <td style={{...td,color:'#64748b'}}>{row.unit}</td>}
                      {vis('ngay_de_xuat') && <td style={{...td,color:'#64748b',whiteSpace:'nowrap'}}>{row.ngay_de_xuat || '—'}</td>}
                      {vis('ngay_du_kien') && <td style={{...td}}>
                        <input type="date" value={row.ngay_du_kien||''} disabled={isDone || !perms.edit}
                          onChange={e=>{const v=e.target.value; handleUpdateRow(row.id,'ngay_du_kien',v); flushSave(row,{ngay_du_kien:v});}}
                          style={{...s.input,width:110,color: row.days_remaining!==null&&row.days_remaining<0?'#ef4444':'#334155'}}/>
                      </td>}
                      {vis('needed_ts') && <td style={{...td,whiteSpace:'nowrap',fontWeight:600,color: row.days_left!==null&&row.days_left<7?'#dc2626':'#475569'}}>
                        {row.needed_ts ? new Date(row.needed_ts).toLocaleDateString('vi-VN') : '—'}
                      </td>}
                      {vis('stock_now') && <td style={{...td,textAlign:'right',fontWeight:600,color:(Number(row.stock_now)||0)>0?'#0f766e':'#cbd5e1'}}>
                        {(Number(row.stock_now)||0) > 0 ? Number(row.stock_now).toLocaleString('vi-VN') : '—'}
                      </td>}
                      {vis('calculated_qty') && <td style={{...td,textAlign:'right',color:'#64748b'}}>{Number(row.calculated_qty).toLocaleString('vi-VN')}</td>}
                      {vis('actual_qty') && <td style={{...td,textAlign:'right'}}>
                        <input type="number" min="0" value={row.actual_qty} disabled={isDone || !perms.edit}
                          onChange={e=>{const v=e.target.value; handleUpdateRow(row.id,'actual_qty',v); queueSave(row,{actual_qty:v});}}
                          onBlur={e=>flushSave(row,{actual_qty:e.target.value})}
                          style={{...s.input,width:60,textAlign:'right',fontWeight:700,color:'#0f172a'}}/>
                      </td>}
                      {vis('received') && <td style={{...td,textAlign:'right',fontWeight:700,color: row.received>0?'#059669':'#94a3b8'}}>
                        {row.received > 0 ? row.received.toLocaleString('vi-VN') : '—'}
                      </td>}
                      {vis('con_lai') && (() => { const con = Math.max(0, (Number(row.actual_qty)||0) - (Number(row.received)||0)); return (
                        <td style={{...td,textAlign:'right',fontWeight:700,color: con>0?'#dc2626':'#94a3b8'}}>
                          {con.toLocaleString('vi-VN')}
                        </td>
                      ); })()}
                      {vis('tien_do') && <td style={{...td}}>
                        <select value={row.tien_do||'Mới'} disabled={isDone || !perms.edit}
                          onChange={e=>{const v=e.target.value; handleUpdateRow(row.id,'tien_do',v); flushSave(row,{tien_do:v});}}
                          style={{...s.input,minWidth:120,background:tdc.bg,color:tdc.color,border:`1px solid ${tdc.border}`,fontWeight:700}}>
                          {TIEN_DO_OPTIONS.map(o=><option key={o} style={{background:'#fff',color:'#334155',fontWeight:600}}>{o}</option>)}
                        </select>
                      </td>}
                      {vis('note') && <td style={{...td}}>
                        <input type="text" value={row.note||''} placeholder="..." disabled={isDone || !perms.edit}
                          onChange={e=>{const v=e.target.value; handleUpdateRow(row.id,'note',v); queueSave(row,{note:v});}}
                          onBlur={e=>flushSave(row,{note:e.target.value})}
                          style={{...s.input,width:100}}/>
                      </td>}
                      <td style={{...td}}>
                        <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                          {perms.create && !isDone && (
                            <button onClick={()=>handleNhapMuaVao(row)} title="Nhập mua vào" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#10b981',fontSize:'0.68rem',border:'1px solid #86efac'}}>
                              <ShoppingCart size={12}/>Nhập
                            </button>
                          )}
                          {perms.delete && !isDone && (
                            <button onClick={()=>handleCancel(row)} title="Hủy đề xuất" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#f59e0b',fontSize:'0.68rem',border:'1px solid #fcd34d'}}>
                              <XCircle size={12}/>
                            </button>
                          )}
                          {perms.delete && <button onClick={()=>handleDelete(row)} title="Xóa" style={{...s.btn,padding:'0.2rem 0.4rem',color:'#ef4444',fontSize:'0.68rem',border:'1px solid #fca5a5'}}>
                            <Trash2 size={12}/>
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',padding:'0.5rem 0.75rem',display:'flex',alignItems:'center',gap:8,borderTop:'1px solid #e2e8f0',boxShadow:'0 -4px 6px -1px rgba(0,0,0,0.05)',zIndex:20}}>
        {viewMode === 'draft' ? (
          <span style={{fontSize:'0.8rem',fontWeight:600,color:'#64748b'}}>
            {draftLines.length} dòng trong bản nháp {draft ? draft.ma_dot : ''}
          </span>
        ) : (
          <span style={{fontSize:'0.8rem',fontWeight:600,color:'#64748b'}}>
            {visibleRows.length} đề xuất {filterStatus==='active'?'đang mở':filterStatus==='done'?'hoàn tất':'tổng cộng'}
            {filterTienDo!=='all' ? ` · tiến độ "${filterTienDo}"` : ''}
          </span>
        )}
        {(viewMode === 'draft' ? draftSaving : saving) && <span style={{fontSize:'0.75rem',color:'#7c3aed',display:'flex',alignItems:'center',gap:4}}><Loader2 size={12} style={{animation:'spin 1s linear infinite'}}/>Đang lưu...</span>}
      </div>

      {archiveOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'}} onClick={()=>setArchiveOpen(false)}>
          <div style={{background:'#fff', borderRadius:'0.75rem', width:'100%', maxWidth:900, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'0.85rem 1.25rem', borderBottom:'1px solid #e2e8f0', background:'#fffbeb', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{margin:0, fontSize:'0.95rem', fontWeight:700, color:'#b45309'}}>Đề xuất đã lưu trữ (đóng do về thiếu)</h2>
              <button onClick={()=>setArchiveOpen(false)} style={{background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:'1.1rem'}}>✕</button>
            </div>
            <div style={{flex:1, overflow:'auto'}}>
              {archiveLoading ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8'}}><Loader2 size={22} style={{animation:'spin 1s linear infinite'}}/></div>
              ) : archiveRows.length === 0 ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8', fontWeight:600}}>Chưa có đề xuất nào được lưu trữ.</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.72rem'}}>
                  <thead>
                    <tr style={{background:'#fffbeb', position:'sticky', top:0}}>
                      {['DLK gốc','Mã HH','ĐX','Đặt','Đã nhận','Ngày đóng','Người đóng','Lý do','DLK phần thiếu'].map(h=>(
                        <th key={h} style={{padding:'0.4rem 0.5rem', borderBottom:'2px solid #fde68a', color:'#92400e', fontWeight:700, whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {archiveRows.map(a => (
                      <tr key={a.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'0.35rem 0.5rem', fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap'}}>{a.dlk_code}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.item_code}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right'}}>{Number(a.calculated_qty||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right'}}>{Number(a.actual_qty||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', textAlign:'right', color:'#059669', fontWeight:700}}>{Number(a.received_snapshot||0).toLocaleString('vi-VN')}</td>
                        <td style={{padding:'0.35rem 0.5rem', whiteSpace:'nowrap'}}>{a.archived_at ? new Date(a.archived_at).toLocaleString('vi-VN') : '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.archived_by || '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem'}}>{a.archive_reason || '—'}</td>
                        <td style={{padding:'0.35rem 0.5rem', fontWeight:700, color:'#b45309', whiteSpace:'nowrap'}}>{a.shortfall_dlk_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {batchListOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'}} onClick={()=>setBatchListOpen(false)}>
          <div style={{background:'#fff', borderRadius:'0.75rem', width:'100%', maxWidth:800, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'0.85rem 1.25rem', borderBottom:'1px solid #e2e8f0', background:'#faf5ff', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h2 style={{margin:0, fontSize:'0.95rem', fontWeight:700, color:'#7c3aed'}}>Danh sách các đợt đề xuất</h2>
              <button onClick={()=>setBatchListOpen(false)} style={{background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:'1.1rem'}}>✕</button>
            </div>
            <div style={{flex:1, overflow:'auto'}}>
              {batchListLoading ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8'}}><Loader2 size={22} style={{animation:'spin 1s linear infinite'}}/></div>
              ) : batchListRows.length === 0 ? (
                <div style={{padding:'2rem', textAlign:'center', color:'#94a3b8', fontWeight:600}}>Chưa có đợt đề xuất nào.</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.72rem'}}>
                  <thead>
                    <tr style={{background:'#faf5ff', position:'sticky', top:0}}>
                      {['Mã đợt','Ngày chạy','Trạng thái','Người tạo','Người gửi'].map(h=>(
                        <th key={h} style={{padding:'0.4rem 0.5rem', borderBottom:'2px solid #e9d5ff', color:'#7c3aed', fontWeight:700, whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batchListRows.map(b => {
                      const cfg = BATCH_STATUS_CFG[b.trang_thai] || { label:b.trang_thai, bg:'#f1f5f9', color:'#475569', border:'#cbd5e1' };
                      return (
                        <tr key={b.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                          <td style={{padding:'0.35rem 0.5rem', fontWeight:700, color:'#7c3aed', whiteSpace:'nowrap'}}>{b.ma_dot}</td>
                          <td style={{padding:'0.35rem 0.5rem', whiteSpace:'nowrap'}}>{b.ngay_chay}</td>
                          <td style={{padding:'0.35rem 0.5rem'}}>
                            <span style={{display:'inline-block',padding:'0.15rem 0.5rem',borderRadius:5,fontSize:'0.66rem',fontWeight:700,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,whiteSpace:'nowrap'}}>{cfg.label}</span>
                          </td>
                          <td style={{padding:'0.35rem 0.5rem'}}>{b.nguoi_tao || '—'}</td>
                          <td style={{padding:'0.35rem 0.5rem'}}>{b.nguoi_gui || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding:'0.4rem 0.35rem', borderBottom:'2px solid #e2e8f0', fontSize:'0.68rem', fontWeight:700, color:'#64748b', textAlign:'center', whiteSpace:'nowrap' };
// Tiêu đề cột có thể bấm để sắp xếp; tô tím khi đang là cột sắp xếp
const sortTh = (active) => ({ ...th, cursor:'pointer', userSelect:'none', color: active ? '#7c3aed' : '#64748b', borderBottom: `2px solid ${active ? '#7c3aed' : '#e2e8f0'}` });
const td = { padding:'0.3rem 0.35rem', textAlign:'center', verticalAlign:'middle' };
