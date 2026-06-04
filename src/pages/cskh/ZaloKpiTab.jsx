import React, { useState, useEffect, useCallback, useRef } from 'react';
import { taskDb as db } from '../../lib/task_supabase';
import { RefreshCw, MessageSquare, Clock, CheckCircle, AlertCircle, Trash2, CheckSquare, Search, Filter, X, Download, Merge } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTabPerm } from '../../lib/AuthContext';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const cleanContent = (content, customerName) => {
  if (!content) return '';
  let text = String(content);
  
  // Detect raw JSON (array or object) and extract readable text
  if ((text.startsWith('[') || text.startsWith('{')) && text.length > 20) {
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const parts = items.map(item => {
        if (typeof item === 'string') return item;
        // Zalo webhook structure: { content: "...", filter: { msgType: "..." } }
        if (item.content && typeof item.content === 'string') return item.content;
        // Fallback: try common keys
        if (item.text) return item.text;
        if (item.message) return item.message;
        // If has msgType info, describe it
        if (item.filter?.msgType) {
          const type = item.filter.msgType;
          if (type.includes('photo')) return '[Hình ảnh]';
          if (type.includes('video')) return '[Video]';
          if (type.includes('file')) return '[File]';
          if (type.includes('sticker')) return '[Sticker]';
          return `[${type}]`;
        }
        return '';
      }).filter(Boolean);
      text = parts.join('\n') || '[Nội dung media]';
    } catch (_) {
      // Not valid JSON, proceed with text as-is
    }
  }
  
  if (text.startsWith('@')) {
    if (customerName) {
      const safeName = customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^@${safeName}[:\\s]*`, 'i');
      if (regex.test(text)) {
        text = text.replace(regex, '');
      }
    }
    text = text.replace(/^@[^:]+:\s*/, '').replace(/^@[^\s]+\s*/, '');
  }
  
  // Remove redundant media tags since we already render the thumbnails/links
  text = text.replace(/\[Hình ảnh\/Video\]/g, '')
             .replace(/\[Hình ảnh\]/g, '')
             .replace(/\[Video\]/g, '')
             .replace(/\[Tài liệu đính kèm\]/g, '')
             .replace(/\[Ghi âm\]/g, '')
             .trim();
             
  return text;
};

// ── Extract media from raw JSON content_summary when media_data is empty ──
const extractMediaFromContent = (content) => {
  if (!content) return [];
  const text = String(content);
  if (!text.startsWith('[') && !text.startsWith('{')) return [];
  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const media = [];
    for (const item of items) {
      // Extract from filter.href_photo
      const photos = item?.filter?.href_photo || item?.data?.content?.href_photo || [];
      for (const url of photos) {
        if (url && typeof url === 'string') {
          media.push({ type: 'photo', href: url, thumb: url });
        }
      }
      // Extract from filter.href_video
      const videos = item?.filter?.href_video || item?.data?.content?.href_video || [];
      for (const url of videos) {
        if (url && typeof url === 'string') {
          const thumb = item?.data?.content?.thumb || item?.filter?.thumb || url;
          media.push({ type: 'video', href: url, thumb });
        }
      }
      // Single thumb/href (non-group photo)
      if (media.length === 0) {
        const thumb = item?.data?.content?.thumb;
        const href = item?.filter?.href || item?.data?.content?.href;
        const msgType = item?.filter?.msgType || item?.data?.msgType || '';
        if (thumb && msgType.includes('photo')) {
          media.push({ type: 'photo', href: href || thumb, thumb });
        } else if (thumb && msgType.includes('video')) {
          media.push({ type: 'video', href: href || thumb, thumb });
        } else if (href && (msgType.includes('file') || msgType.includes('voice'))) {
          media.push({ type: msgType, href });
        }
      }
    }
    return media;
  } catch (_) {
    return [];
  }
};

const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours} giờ ${remainingMins} phút`;
};

// ── KPI Card ───────────────────────────────────────────────────────────────
const KpiCard = ({ icon, label, value, color, sub, onClick, isActive }) => (
  <div onClick={onClick} style={{
    background: '#fff', borderRadius: '14px', cursor: onClick ? 'pointer' : 'default',
    border: '1px solid', borderColor: isActive ? color : '#e2e8f0', borderLeft: `5px solid ${color}`,
    padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '4px',
    boxShadow: isActive ? `0 4px 12px ${color}33` : '0 2px 8px rgba(0,0,0,0.04)',
    transform: isActive ? 'translateY(-2px)' : 'none',
    transition: 'all 0.2s ease',
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

// ── Main Tab Component ─────────────────────────────────────────────────────
const ZaloKpiTab = () => {
  // Quyền tab (tab-level perms)
  const p = useTabPerm('cskh', 'zalo_kpi');
  const canMarkDone = p.edit;    // Đánh dấu đã xử lý
  const canDelete   = p.delete;  // Xóa
  const canExport   = p.io;      // Xuất Excel
  // Lọc nâng cao: không cần quyền (chỉ xem/lọc)

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all_time');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [searchCustomerName, setSearchCustomerName] = useState('');
  const [searchCustomerId, setSearchCustomerId] = useState('');
  const [searchGroupId, setSearchGroupId] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);  // [] = tất cả, ['_personal'] = cá nhân, ['id1','id2'] = multi-select
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [groups, setGroups] = useState([]);
  const groupDropdownRef = useRef(null);

  // Đóng dropdown khi click bên ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target)) {
        setShowGroupDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch danh sách nhóm Zalo
  useEffect(() => {
    const fetchGroups = async () => {
      const { data } = await db.from('zalo_groups').select('group_id, group_name').order('group_name');
      if (data) setGroups(data);
    };
    fetchGroups();
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let query = db.from('zalo_conversations').select('*').order('first_message_ts', { ascending: false }).limit(500);

      if (timeFilter !== 'all_time') {
        const now = new Date();
        let startTs = 0;
        let endTs = 0;
        
        if (timeFilter === 'today') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          startTs = start.getTime();
          endTs = startTs + 86400000;
        } else if (timeFilter === 'yesterday') {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          startTs = start.getTime();
          endTs = startTs + 86400000;
        } else if (timeFilter === 'this_week') {
          const day = now.getDay() || 7;
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
          startTs = start.getTime();
          endTs = now.getTime() + 86400000; // Future buffer
        } else if (timeFilter === 'last_week') {
          const day = now.getDay() || 7;
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - 6);
          startTs = start.getTime();
          endTs = startTs + 7 * 86400000;
        } else if (timeFilter === 'this_month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          startTs = start.getTime();
          endTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        } else if (timeFilter === 'last_month') {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 1);
          startTs = start.getTime();
          endTs = end.getTime();
        }
        
        if (startTs > 0) {
          query = query.gte('first_message_ts', startTs).lt('first_message_ts', endTs);
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ZaloKPI] Fetch error:', error);
      } else {
        setRecords(data || []);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  const handleMarkAsResponded = async (id, currentResponses = []) => {
    try {
      const newResp = {
        uid: 'system',
        name: 'Hệ thống',
        content: 'Đã xem (Không cần trả lời)',
        ts: Date.now()
      };
      
      const updatedResponses = [...(currentResponses || []), newResp];

      const { error } = await db.from('zalo_conversations').update({
        is_responded: true,
        responder_name: 'Hệ thống',
        response_ts: Date.now(),
        response_content: 'Đã xem (Không cần trả lời)',
        response_time_ms: 0,
        responses_data: updatedResponses
      }).eq('id', id);
      if (error) console.error(error);
      else fetchRecords();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xoá dữ liệu này?')) return;
    try {
      const { error } = await db.from('zalo_conversations').delete().eq('id', id);
      if (error) console.error(error);
      else { setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; }); fetchRecords(); }
    } catch (e) {
      console.error(e);
    }
  };

  // ── Gộp hội thoại thủ công ────────────────────────────────────────────
  const handleMerge = async () => {
    if (selectedIds.size < 2) return;
    const toMerge = records.filter(r => selectedIds.has(r.id))
      .sort((a, b) => (a.first_message_ts || 0) - (b.first_message_ts || 0));
    if (toMerge.length < 2) return;

    const names = toMerge.map(r => `"${(r.content_summary || '').slice(0, 30)}..."`).join('\n');
    if (!window.confirm(`Gộp ${toMerge.length} hội thoại lại thành 1?\n\n${names}`)) return;

    const primary = toMerge[0]; // giữ lại dòng sớm nhất
    const others = toMerge.slice(1);

    // Gộp dữ liệu
    const mergedContent = toMerge.map(r => r.content_summary).filter(Boolean).join('\n---\n');
    const mergedCount = toMerge.reduce((sum, r) => sum + (r.message_count || 1), 0);
    const lastTs = Math.max(...toMerge.map(r => r.last_message_ts || 0));
    const mergedMedia = toMerge.flatMap(r => (Array.isArray(r.media_data) ? r.media_data : []));
    const mergedResponses = toMerge.flatMap(r => (Array.isArray(r.responses_data) ? r.responses_data : []));

    // Lấy trạng thái responded: nếu bất kỳ dòng nào đã responded thì giữ lại
    const anyResponded = toMerge.some(r => r.is_responded);
    const firstResponded = toMerge.find(r => r.is_responded && r.response_ts);

    try {
      // Cập nhật dòng chính
      const { error: updateErr } = await db.from('zalo_conversations').update({
        content_summary: mergedContent,
        message_count: mergedCount,
        last_message_ts: lastTs,
        media_data: mergedMedia,
        responses_data: mergedResponses.length > 0 ? mergedResponses : primary.responses_data,
        is_responded: anyResponded || primary.is_responded,
        responder_name: anyResponded ? (firstResponded?.responder_name || primary.responder_name) : primary.responder_name,
        response_ts: firstResponded?.response_ts || primary.response_ts,
        response_time_ms: firstResponded?.response_time_ms || primary.response_time_ms,
        response_content: toMerge.map(r => r.response_content).filter(Boolean).join('\n---\n') || primary.response_content,
      }).eq('id', primary.id);

      if (updateErr) { console.error(updateErr); return; }

      // Chuyển các tin nhắn raw của các dòng phụ sang dòng chính
      const otherIds = others.map(o => o.id);
      await db.from('zalo_messages').update({ conversation_id: primary.id }).in('conversation_id', otherIds);

      // Xóa các dòng phụ
      const { error: delErr } = await db.from('zalo_conversations').delete().in('id', otherIds);
      if (delErr) console.error(delErr);

      setSelectedIds(new Set());
      fetchRecords();
    } catch (e) {
      console.error('[Merge]', e);
    }
  };

  // ── Đánh dấu hàng loạt "Không cần trả lời" ─────────────────────────
  const handleBulkMarkDone = async () => {
    const ids = [...selectedIds];
    const pending = records.filter(r => ids.includes(r.id) && !r.is_responded);
    if (pending.length === 0) { alert('Tất cả đã được xử lý rồi.'); return; }
    if (!window.confirm(`Đánh dấu ${pending.length} hội thoại là "Không cần trả lời"?`)) return;

    try {
      const newResp = { uid: 'system', name: 'Hệ thống', content: 'Đã xem (Không cần trả lời)', ts: Date.now() };
      for (const r of pending) {
        const updatedResponses = [...(r.responses_data || []), newResp];
        await db.from('zalo_conversations').update({
          is_responded: true, responder_name: 'Hệ thống',
          response_ts: Date.now(), response_content: 'Đã xem (Không cần trả lời)',
          response_time_ms: Date.now() - (r.first_message_ts || Date.now()),
          responses_data: updatedResponses,
        }).eq('id', r.id);
      }
      setSelectedIds(new Set());
      fetchRecords();
    } catch (e) {
      console.error('[BulkMarkDone]', e);
    }
  };

  // ── Xóa hàng loạt ─────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!window.confirm(`Xóa ${ids.length} hội thoại đã chọn? Thao tác này không thể hoàn tác.`)) return;
    try {
      const { error } = await db.from('zalo_conversations').delete().in('id', ids);
      if (error) console.error(error);
      setSelectedIds(new Set());
      fetchRecords();
    } catch (e) {
      console.error('[BulkDelete]', e);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayRecords.map(r => r.id)));
    }
  };

  useEffect(() => { 
    fetchRecords(); 
    
    // Đăng ký nhận luồng Realtime từ Supabase
    const channel = db.channel('zalo_realtime_kpi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zalo_conversations' }, (payload) => {
        fetchRecords(); // Tự động load lại danh sách khi có tin nhắn/trạng thái mới
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [fetchRecords]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const isIgnored = (r) => r.is_responded && r.response_content && typeof r.response_content === 'string' && r.response_content.includes('Không cần trả lời');

  const totalConversations = records.length;
  const totalRequireReply = records.filter(r => !isIgnored(r)).length;
  const totalPending = records.filter(r => !r.is_responded).length;
  const totalResolved = records.filter(r => r.is_responded && !isIgnored(r)).length;
  
  // Calculate average response time (bao gồm cả tin chưa trả lời với thời gian tạm tính)
  const now = Date.now();
  const recordsForAvg = records.filter(r => !isIgnored(r));
  const avgResponseTimeMs = recordsForAvg.length > 0 
    ? recordsForAvg.reduce((acc, r) => {
        if (r.is_responded && r.response_time_ms > 0) {
          return acc + r.response_time_ms;
        } else if (!r.is_responded && r.first_message_ts) {
          // Chưa trả lời → tạm tính = now - thời điểm khách nhắn
          return acc + (now - r.first_message_ts);
        }
        return acc;
      }, 0) / recordsForAvg.length 
    : 0;

  // Apply client-side filters (status + search + group)
  const activeFilterCount = [searchCustomerName, searchCustomerId, searchGroupId].filter(Boolean).length + (selectedGroups.length > 0 ? 1 : 0);

  // Helper: lấy tên nhóm từ ID
  const getGroupLabel = (id) => {
    if (id === '_personal') return '💬 Cá nhân';
    const g = groups.find(g => g.group_id === id);
    return g ? g.group_name : id;
  };

  // Toggle chọn/bỏ chọn nhóm
  const toggleGroup = (id) => {
    setSelectedGroups(prev => {
      if (id === '_personal') {
        // Toggle "Cá nhân" → bỏ tất cả nhóm khác
        return prev.includes('_personal') ? prev.filter(x => x !== '_personal') : [...prev.filter(x => x !== '_personal'), '_personal'];
      }
      // Toggle nhóm bình thường
      return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    });
  };

  // Danh sách nhóm đã lọc theo từ khóa tìm kiếm
  const filteredGroups = groups.filter(g =>
    !groupSearch || g.group_name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const displayRecords = records.filter(r => {
    // Status filter
    if (statusFilter === 'require_reply' && isIgnored(r)) return false;
    if (statusFilter === 'pending' && r.is_responded) return false;
    if (statusFilter === 'responded' && (!r.is_responded || isIgnored(r))) return false;
    
    // Group filter (multi-select)
    if (selectedGroups.length > 0) {
      const wantPersonal = selectedGroups.includes('_personal');
      const groupIds = selectedGroups.filter(x => x !== '_personal');
      
      if (wantPersonal && groupIds.length > 0) {
        // Muốn cả cá nhân + một số nhóm cụ thể
        if (r.is_group && !groupIds.includes(r.thread_id)) return false;
      } else if (wantPersonal) {
        // Chỉ muốn cá nhân
        if (r.is_group) return false;
      } else {
        // Chỉ muốn một số nhóm cụ thể
        if (!groupIds.includes(r.thread_id)) return false;
      }
    }

    // Search: Customer name
    if (searchCustomerName) {
      const q = searchCustomerName.toLowerCase();
      if (!(r.customer_name || '').toLowerCase().includes(q)) return false;
    }

    // Search: Customer ID
    if (searchCustomerId) {
      const q = searchCustomerId.toLowerCase();
      if (!(r.customer_uid || '').toLowerCase().includes(q)) return false;
    }

    // Search: Group/Thread ID
    if (searchGroupId) {
      const q = searchGroupId.toLowerCase();
      if (!(r.thread_id || '').toLowerCase().includes(q)) return false;
    }

    return true;
  });

  const clearAllFilters = () => {
    setSearchCustomerName('');
    setSearchCustomerId('');
    setSearchGroupId('');
    setSelectedGroups([]);
    setGroupSearch('');
  };

  // ── Xuất Excel ────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (displayRecords.length === 0) return;

    const exportData = displayRecords.map((r, idx) => {
      // Lấy tên NV xử lý
      const responders = (r.responses_data && r.responses_data.length > 0)
        ? r.responses_data.map(resp => resp.name || 'Nhân viên').join(', ')
        : (r.responder_name || '');

      // Lấy nội dung trả lời
      const responseContent = (r.responses_data && r.responses_data.length > 0)
        ? r.responses_data.map(resp => cleanContent(resp.content, r.customer_name)).join(' | ')
        : cleanContent(r.response_content, r.customer_name);

      return {
        'STT': idx + 1,
        'Thời gian gửi': fmtDate(r.first_message_ts),
        'Khách hàng': r.customer_name || 'Khách ẩn danh',
        'ID Khách hàng': r.customer_uid || '',
        'Nơi nhắn': r.is_group ? (r.group_name || `Nhóm ${r.thread_id}`) : 'Cá nhân',
        'Loại': r.is_group ? 'Nhóm' : 'Cá nhân',
        'Nội dung hỏi': cleanContent(r.content_summary, null),
        'Số tin nhắn': r.message_count || 1,
        'Trạng thái': r.is_responded ? 'Đã trả lời' : 'Chờ xử lý',
        'NV Xử lý': responders,
        'Nội dung trả lời': responseContent,
        'Tốc độ xử lý': r.is_responded ? fmtDuration(r.response_time_ms) : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Đặt độ rộng cột hợp lý
    ws['!cols'] = [
      { wch: 5 },   // STT
      { wch: 18 },  // Thời gian
      { wch: 20 },  // Khách hàng
      { wch: 22 },  // ID KH
      { wch: 25 },  // Nơi nhắn
      { wch: 10 },  // Loại
      { wch: 40 },  // Nội dung hỏi
      { wch: 10 },  // Số tin nhắn
      { wch: 14 },  // Trạng thái
      { wch: 20 },  // NV Xử lý
      { wch: 40 },  // Nội dung trả lời
      { wch: 14 },  // Tốc độ
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI CSKH Zalo');

    // Tên file: KPI_CSKH_Zalo_2026-05-26.xlsx
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `KPI_CSKH_Zalo_${today}.xlsx`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'fadeIn 0.3s ease' }}>

      {/* ── KPI Row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px' }}>
        <KpiCard icon={<MessageSquare color="#0068ff" />} label="Tổng lượt hội thoại" value={totalConversations} color="#0068ff" 
                 sub="(Bao gồm không cần trả lời)" onClick={() => setStatusFilter('all')} isActive={statusFilter === 'all'} />
        <KpiCard icon={<MessageSquare color="#0ea5e9" />} label="Hội thoại cần trả lời" value={totalRequireReply} color="#0ea5e9" 
                 sub="Chỉ tính cần phản hồi" onClick={() => setStatusFilter('require_reply')} isActive={statusFilter === 'require_reply'} />
        <KpiCard icon={<AlertCircle color="#ef4444" />} label="Đang chờ xử lý" value={totalPending} color="#ef4444"
                 sub="Nhân viên chưa Reply/Tag" onClick={() => setStatusFilter('pending')} isActive={statusFilter === 'pending'} />
        <KpiCard icon={<CheckCircle color="#16a34a" />} label="Đã xử lý xong" value={totalResolved} color="#16a34a" 
                 sub="Nhân viên đã trả lời" onClick={() => setStatusFilter('responded')} isActive={statusFilter === 'responded'} />
        <KpiCard icon={<Clock color="#f59e0b" />} label="Tốc độ phản hồi (TB)" value={fmtDuration(avgResponseTimeMs)} color="#f59e0b"
                 sub="Thời gian NV phản hồi khách" />
      </div>

      {/* ── Filter Bar (không cần quyền — chỉ lọc/xem) ──────────────── */}
      <div style={{
        background: '#fff', borderRadius: '14px',
        border: '1px solid #e2e8f0', overflow: 'visible',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            width: '100%', padding: '0.7rem 1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: showFilters ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' : '#fff',
            border: 'none', cursor: 'pointer',
            borderBottom: showFilters ? '1px solid #e2e8f0' : 'none',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} color={activeFilterCount > 0 ? '#6366f1' : '#94a3b8'} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>Bộ lọc nâng cao</span>
            {activeFilterCount > 0 && (
              <span style={{
                background: '#6366f1', color: '#fff', borderRadius: '50%',
                width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700
              }}>{activeFilterCount}</span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showFilters && (
          <div className="filter-bar" style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            {/* Lọc theo Nhóm (Multi-select searchable dropdown) */}
            <div ref={groupDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px', minWidth: '180px', position: 'relative' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Nhóm Zalo</label>
              
              {/* Input hiển thị + tìm kiếm */}
              <div
                onClick={() => setShowGroupDropdown(true)}
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center',
                  padding: '0.3rem 0.5rem', borderRadius: '8px', minHeight: '34px',
                  border: '1px solid', borderColor: selectedGroups.length > 0 ? '#6366f1' : '#e2e8f0',
                  background: selectedGroups.length > 0 ? '#eef2ff' : '#fff',
                  cursor: 'text', position: 'relative'
                }}
              >
                {/* Tags nhóm đã chọn */}
                {selectedGroups.map(id => (
                  <span key={id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '4px',
                    fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap'
                  }}>
                    {getGroupLabel(id)}
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleGroup(id); }}
                      style={{ cursor: 'pointer', marginLeft: '2px', fontWeight: 800, fontSize: '0.8rem', lineHeight: 1 }}
                    >×</span>
                  </span>
                ))}

                {/* Ô tìm kiếm */}
                <input
                  value={groupSearch}
                  onChange={(e) => { setGroupSearch(e.target.value); setShowGroupDropdown(true); }}
                  onFocus={() => setShowGroupDropdown(true)}
                  placeholder={selectedGroups.length === 0 ? 'Gõ để tìm nhóm...' : ''}
                  style={{
                    border: 'none', outline: 'none', background: 'transparent',
                    fontSize: '0.8rem', color: '#334155', flex: 1, minWidth: '80px',
                    padding: '2px 0'
                  }}
                />
              </div>

              {/* Dropdown danh sách nhóm */}
              {showGroupDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  marginTop: '4px', background: '#fff', borderRadius: '10px',
                  border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  maxHeight: '260px', overflowY: 'auto',
                }}>
                  {/* Option: Cá nhân */}
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '0.5rem 0.75rem', cursor: 'pointer',
                      background: selectedGroups.includes('_personal') ? '#eef2ff' : 'transparent',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = selectedGroups.includes('_personal') ? '#eef2ff' : 'transparent'}
                  >
                    <input type="checkbox" checked={selectedGroups.includes('_personal')} onChange={() => toggleGroup('_personal')}
                      style={{ accentColor: '#6366f1', width: 15, height: 15 }} />
                    <span style={{ fontSize: '0.82rem', color: '#334155' }}>💬 Cá nhân (1-1)</span>
                  </label>

                  {/* Separator */}
                  <div style={{ padding: '0.3rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    NHÓM ZALO ({filteredGroups.length})
                  </div>

                  {/* Danh sách nhóm (đã lọc theo từ khóa) */}
                  {filteredGroups.length === 0 ? (
                    <div style={{ padding: '0.75rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      Không tìm thấy nhóm nào
                    </div>
                  ) : filteredGroups.map(g => (
                    <label
                      key={g.group_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '0.5rem 0.75rem', cursor: 'pointer',
                        background: selectedGroups.includes(g.group_id) ? '#eef2ff' : 'transparent',
                        borderBottom: '1px solid #f8fafc',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedGroups.includes(g.group_id) ? '#eef2ff' : 'transparent'}
                    >
                      <input type="checkbox" checked={selectedGroups.includes(g.group_id)} onChange={() => toggleGroup(g.group_id)}
                        style={{ accentColor: '#6366f1', width: 15, height: 15 }} />
                      <span style={{ fontSize: '0.82rem', color: '#334155' }}>👥 {g.group_name}</span>
                    </label>
                  ))}

                  {/* Nút chọn tất cả / bỏ chọn tất cả */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
                    borderTop: '1px solid #e2e8f0', background: '#f8fafc'
                  }}>
                    <button onClick={() => setSelectedGroups(['_personal', ...groups.map(g => g.group_id)])}
                      style={{ border: 'none', background: 'none', fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', cursor: 'pointer', padding: '2px 4px' }}>
                      Chọn tất cả
                    </button>
                    <button onClick={() => { setSelectedGroups([]); setGroupSearch(''); }}
                      style={{ border: 'none', background: 'none', fontSize: '0.72rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer', padding: '2px 4px' }}>
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tìm theo Tên KH */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>Tên khách hàng</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  value={searchCustomerName}
                  onChange={(e) => setSearchCustomerName(e.target.value)}
                  placeholder="Nhập tên..."
                  style={{
                    width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '8px',
                    border: '1px solid', borderColor: searchCustomerName ? '#6366f1' : '#e2e8f0',
                    background: searchCustomerName ? '#eef2ff' : '#fff',
                    fontSize: '0.8rem', color: '#334155', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Tìm theo ID KH */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>ID khách hàng</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  value={searchCustomerId}
                  onChange={(e) => setSearchCustomerId(e.target.value)}
                  placeholder="Nhập ID..."
                  style={{
                    width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '8px',
                    border: '1px solid', borderColor: searchCustomerId ? '#6366f1' : '#e2e8f0',
                    background: searchCustomerId ? '#eef2ff' : '#fff',
                    fontSize: '0.8rem', color: '#334155', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Tìm theo ID Nhóm */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>ID Nhóm / Thread</label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  value={searchGroupId}
                  onChange={(e) => setSearchGroupId(e.target.value)}
                  placeholder="Nhập thread ID..."
                  style={{
                    width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '8px',
                    border: '1px solid', borderColor: searchGroupId ? '#6366f1' : '#e2e8f0',
                    background: searchGroupId ? '#eef2ff' : '#fff',
                    fontSize: '0.8rem', color: '#334155', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Nút xóa bộ lọc */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '0.4rem 0.8rem', borderRadius: '8px',
                  border: '1px solid #fecaca', background: '#fef2f2',
                  fontSize: '0.78rem', fontWeight: 600, color: '#ef4444',
                  cursor: 'pointer', height: 'fit-content', alignSelf: 'flex-end',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
              >
                <X size={14} /> Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table Header ────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: '14px',
        border: '1px solid #e2e8f0', overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          padding: '0.9rem 1rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
          borderBottom: '1px solid #f1f5f9',
          background: 'linear-gradient(135deg, #f8faff 0%, #f0f9ff 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontSize: '1.1rem' }}>⏱️</span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>
              Danh Sách Yêu Cầu Từ Khách Hàng (Zalo)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {lastUpdated && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
              </span>
            )}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              style={{
                padding: '0.3rem 0.6rem', borderRadius: '7px',
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: '0.78rem', fontWeight: 600, color: '#475569',
                cursor: 'pointer', outline: 'none'
              }}
            >
              <option value="all_time">Tất cả thời gian</option>
              <option value="today">Hôm nay</option>
              <option value="yesterday">Hôm qua</option>
              <option value="this_week">Tuần này</option>
              <option value="last_week">Tuần trước</option>
              <option value="this_month">Tháng này</option>
              <option value="last_month">Tháng trước</option>
            </select>
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
            {canExport && (
            <button
              onClick={handleExportExcel}
              disabled={displayRecords.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '0.3rem 0.8rem', borderRadius: '7px',
                border: '1px solid #d1fae5', background: '#ecfdf5',
                fontSize: '0.78rem', fontWeight: 600, color: '#059669',
                cursor: displayRecords.length === 0 ? 'not-allowed' : 'pointer',
                opacity: displayRecords.length === 0 ? 0.5 : 1,
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { if (displayRecords.length > 0) e.currentTarget.style.background = '#d1fae5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#ecfdf5'; }}
            >
              <Download size={13} color="#059669" />
              Xuất Excel ({displayRecords.length})
            </button>
            )}
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
            <p style={{ fontWeight: 700, color: '#64748b', margin: '0 0 4px' }}>Chưa có tin nhắn nào</p>
            <p style={{ fontSize: '0.8rem', margin: 0 }}>Hệ thống n8n chưa đẩy tin nhắn Zalo vào CSDL</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '36px' }}>
                    <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === displayRecords.length}
                      onChange={toggleSelectAll} style={{ accentColor: '#6366f1', width: 15, height: 15, cursor: 'pointer' }} />
                  </th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Thời gian gửi</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Khách hàng</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Nơi nhắn</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Nội dung hỏi</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'center', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Trạng thái</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '140px' }}>NV Xử lý</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Nội dung trả lời</th>
                  <th style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Tốc độ xử lý</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r, idx) => (
                  <tr key={r.id} style={{
                    background: idx % 2 === 0 ? '#fff' : '#fafbff',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbff'}
                  >
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)}
                        style={{ accentColor: '#6366f1', width: 15, height: 15, cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '0.65rem 1rem', color: '#1e293b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                      {fmtDate(r.first_message_ts)}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontWeight: 700, color: '#4338ca' }}>
                        {r.customer_name || 'Khách ẩn danh'}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {r.is_group ? r.thread_id : r.customer_uid}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                      {r.is_group ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', width: 'fit-content' }}>
                            Nhóm Zalo
                          </span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                            {r.group_name || `ID: ${r.thread_id}`}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', width: 'fit-content' }}>
                            Cá nhân
                          </span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                            {r.customer_name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', color: '#475569', maxWidth: '200px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {cleanContent(r.content_summary, null)}
                      </div>
                      {(() => {
                        const effectiveMedia = (r.media_data && r.media_data.length > 0) ? r.media_data : extractMediaFromContent(r.content_summary);
                        return effectiveMedia.length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                          {effectiveMedia.map((m, i) => {
                            const type = m.type || '';
                            if (type.includes('photo') || type.includes('image') || type.includes('picture') || (!type.includes('video') && m.thumb)) {
                               return <a key={i} href={m.href} target="_blank" rel="noreferrer" title="Xem ảnh">
                                 <img src={m.thumb || m.href} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                               </a>;
                            } else if (type.includes('video')) {
                               return <a key={i} href={m.href} target="_blank" rel="noreferrer" title="Xem video" style={{ position: 'relative', display: 'inline-block' }}>
                                 <img src={m.thumb} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                                 <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                   <span style={{ color: '#fff', fontSize: '10px', marginLeft: '2px' }}>▶</span>
                                 </div>
                               </a>;
                            } else if (type.includes('voice') || type.includes('file') || type.includes('link') || m.href) {
                               return <a key={i} href={m.href} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}>
                                 <span>📎</span> File đính kèm
                               </a>;
                            }
                            return null;
                          })}
                        </div>
                        ) : null;
                      })()}
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6 }}>
                        ({r.message_count} tin nhắn)
                      </div>
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      {r.is_responded ? (
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, fontSize: '0.75rem' }}>
                          Đã trả lời
                        </span>
                      ) : (
                        <span style={{ background: '#fee2e2', color: '#ef4444', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, fontSize: '0.75rem' }}>
                          Chờ xử lý
                        </span>
                      )}
                    </td>
                    <td colSpan={2} style={{ padding: 0, borderBottom: '1px solid #f1f5f9' }}>
                      {r.is_responded ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {((r.responses_data && r.responses_data.length > 0) ? r.responses_data : [{
                            uid: r.responder_uid,
                            name: r.responder_name,
                            content: r.response_content,
                            ts: r.response_ts
                          }]).map((resp, i, arr) => (
                            <div key={i} style={{ 
                              display: 'flex', 
                              borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
                              background: i % 2 !== 0 ? '#f8fafc' : 'transparent'
                            }}>
                              <div style={{ width: '140px', minWidth: '140px', padding: '0.8rem 1rem', borderRight: '1px dashed #e2e8f0' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                    {resp.name || 'Nhân viên'}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {fmtDate(resp.ts)}
                                  </span>
                                </div>
                              </div>
                              <div style={{ flex: 1, padding: '0.8rem 1rem' }}>
                                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                  {cleanContent(resp.content, r.customer_name)}
                                  
                                  {resp.href && (
                                    <div style={{ marginTop: '8px' }}>
                                      {resp.thumb ? (
                                        <a href={resp.href} target="_blank" rel="noreferrer" style={{ position: 'relative', display: 'inline-block' }}>
                                          <img src={resp.thumb} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                                          {resp.content?.includes('[Video]') && (
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              <span style={{ color: '#fff', fontSize: '10px', marginLeft: '2px' }}>▶</span>
                                            </div>
                                          )}
                                        </a>
                                      ) : (
                                        <a href={resp.href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}>
                                          <span>📎</span> File đính kèm
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex' }}>
                          <div style={{ width: '140px', minWidth: '140px', padding: '0.65rem 1rem' }}>
                            <span style={{ color: '#cbd5e1' }}>—</span>
                          </div>
                          <div style={{ flex: 1, padding: '0.65rem 1rem' }}>
                            <span style={{ color: '#cbd5e1' }}>—</span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, color: r.is_responded ? '#16a34a' : '#ef4444', borderBottom: '1px solid #f1f5f9' }}>
                      {r.is_responded ? fmtDuration(r.response_time_ms) : 'Đang đếm...'}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {!r.is_responded && canMarkDone && (
                          <button
                            onClick={() => handleMarkAsResponded(r.id, r.responses_data)}
                            title="Đánh dấu đã xử lý"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#10b981', padding: '4px', borderRadius: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#d1fae5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <CheckSquare size={16} />
                          </button>
                        )}
                        {canDelete && (
                        <button
                          onClick={() => handleDelete(r.id)}
                          title="Xóa"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <Trash2 size={16} />
                        </button>
                        )}
                        {!canMarkDone && !canDelete && (
                          <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Floating Action Bar ───────────────────────────────────── */}
      {selectedIds.size >= 1 && (
        <div style={{
          position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
          borderRadius: '16px', padding: '0.6rem 1rem',
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(67,56,202,0.4)',
          animation: 'slideUp 0.25s ease-out', zIndex: 100,
          maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box',
        }}>
          <span style={{ color: '#e0e7ff', fontSize: '0.82rem', fontWeight: 600 }}>
            Đã chọn <strong style={{ color: '#fff', fontSize: '1rem' }}>{selectedIds.size}</strong>
          </span>

          {/* Gộp (cần ≥ 2) */}
          {selectedIds.size >= 2 && (
            <button onClick={handleMerge}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.4rem 0.9rem', borderRadius: '10px', border: 'none', background: '#fff', color: '#4338ca', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eef2ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <Merge size={14} /> Gộp
            </button>
          )}

          {/* Đánh dấu không cần trả lời */}
          {canMarkDone && (
            <button onClick={handleBulkMarkDone}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.4rem 0.9rem', borderRadius: '10px', border: 'none', background: '#d1fae5', color: '#065f46', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#a7f3d0'}
              onMouseLeave={e => e.currentTarget.style.background = '#d1fae5'}
            >
              <CheckSquare size={14} /> Không cần trả lời
            </button>
          )}

          {/* Xóa hàng loạt */}
          {canDelete && (
            <button onClick={handleBulkDelete}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.4rem 0.9rem', borderRadius: '10px', border: 'none', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fecaca'}
              onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}
            >
              <Trash2 size={14} /> Xóa ({selectedIds.size})
            </button>
          )}

          {/* Bỏ chọn */}
          <button onClick={() => setSelectedIds(new Set())}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.7rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#c7d2fe', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={14} /> Bỏ chọn
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform: translate(-50%, 20px); } to { opacity:1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
};

export default ZaloKpiTab;
