import { createElement as h, useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
    import { supabase as db, fetchAllRows } from '../../lib/supabase';
    import { dataCache } from '../../lib/dataCache';
    import WorkReport from './WorkReport';
    import { useAuth } from '../../lib/AuthContext';
    import { MODULE_PERMS, ALL_PERMS, canSeeTab, getTabPerm } from '../../lib/AuthContext';
    import { PERM_REGISTRY, ALL_CAPS, CAP_LABEL, tabKey, migrateLegacyToTabPerms } from '../../lib/permRegistry';
    import ModuleShell, { TabButton } from '../../components/ModuleShell';
    import AttachmentInput from '../../components/AttachmentInput';
    import AttachmentList, { AttachmentBadge } from '../../components/AttachmentList';
    import { collectPaths, deleteAttachments, deleteRemoved } from '../../lib/attachmentStorage';
    import {
      ClipboardCheck, LayoutDashboard, ListTodo, FileBarChart,
      ListChecks, Loader2, CheckCircle2, AlertTriangle, Send, Search,
      Clock, MessageSquare, Factory, UserPlus, Users as UsersIcon,
    } from 'lucide-react';

    // ============================================================
    // ⚙️  CẤU HÌNH
    // ============================================================
    const SUPABASE_URL    = 'https://ngwkzicrnspeggunsblr.supabase.co'
    const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nd2t6aWNybnNwZWdndW5zYmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU4MTgsImV4cCI6MjA4NzY5MTgxOH0.XgxezghOyUYgr370Ge13VN_V2r-PfR4BEq7JDDF4Pts'
    const N8N_WEBHOOK     = 'https://YOUR_N8N_HOST/webhook/YOUR_WEBHOOK_ID'

    

    // ============================================================
    // CONSTANTS
    // ============================================================
    const STATUS = { IN_PROGRESS:'IN_PROGRESS', COMPLETED:'COMPLETED', CANCELLED:'CANCELLED' }
    const RECUR  = { NONE:'NONE', DAILY:'DAILY', WEEKLY:'WEEKLY', MONTHLY:'MONTHLY' }
    const ROLE   = { ADMIN:'ADMIN', AGENT:'AGENT' }

    // Hệ thống phân quyền
    const PERMS = {
      view_dashboard:    'Xem Tổng quan',
      view_tasks:        'Xem Công việc',
      create_task:       'Tạo việc mới',
      edit_task:         'Sửa công việc',
      delete_task:       'Xóa công việc',
      edit_due_date:     'Sửa thời hạn',
      change_assignee:   'Đổi người thực hiện',
      edit_recurrence:   'Sửa lặp lại',
      change_status:     'Đổi trạng thái',
      add_update:        'Cập nhật tiến độ',
      cancel_task:       'Hủy công việc',
      remind_task:       'Nhắc việc',
    }
    const DEFAULT_PERMS_ADMIN = Object.keys(PERMS).reduce((a,k)=>({...a,[k]:true}),{})
    const DEFAULT_PERMS_AGENT = { view_dashboard:false, view_tasks:true, create_task:false, edit_task:false, delete_task:false, edit_due_date:false, change_assignee:false, edit_recurrence:false, change_status:true, add_update:true, cancel_task:false, remind_task:false }
    function getUserPerms(user) {
      if (!user) return DEFAULT_PERMS_AGENT
      if (user.role === ROLE.ADMIN) return DEFAULT_PERMS_ADMIN
      const saved = user.permissions
      if (saved && typeof saved === 'object') return {...DEFAULT_PERMS_AGENT, ...saved}
      return DEFAULT_PERMS_AGENT
    }
    function hasPerm(user, perm) { return getUserPerms(user)[perm] === true }

    const STATUS_CFG = {
      IN_PROGRESS: { label:'Đang thực hiện', cls:'bg-blue-100 text-blue-700' },
      COMPLETED:   { label:'Hoàn thành',     cls:'bg-emerald-100 text-emerald-700' }, 
      CANCELLED:   { label:'Đã hủy',         cls:'bg-red-100 text-red-600' },
    }

    const RECUR_CFG = { NONE: 'None', DAILY: 'Day', WEEKLY: 'Week', MONTHLY: 'Month' }

    // ============================================================
    // UTILS
    // ============================================================
    const fmtDate = d => {
      if (!d) return '—'
      const dt = new Date(d)
      return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    }
    const fmtDT = d => d ? new Date(d).toLocaleString('vi-VN') : '—'
    const fmtDateStr = d => {
      if (!d) return '—'
      const dt = new Date(d)
      return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}`
    }
    // UTC ISO -> chuỗi cho ô <input type="datetime-local"> theo giờ máy (VN).
    // Dùng khi PRE-FILL form sửa: KHÔNG được cắt chuỗi UTC thô (sẽ lệch -7).
    const toLocalInput = iso => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    // UTC ISO -> "HH:mm dd/MM/yyyy" theo GIỜ VIỆT NAM (ép Asia/Ho_Chi_Minh, không phụ thuộc TZ trình duyệt).
    // Gửi kèm payload nhắc việc để n8n in thẳng, khỏi phải cộng +7.
    const fmtDueVN = iso => {
      if (!iso) return null
      const p = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Ho_Chi_Minh', hour12:false, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).formatToParts(new Date(iso))
      const g = t => p.find(x=>x.type===t)?.value
      return `${g('hour')}:${g('minute')} ${g('day')}/${g('month')}/${g('year')}`
    }

    function daysFrom(d) {
      if (!d) return null
      const due = new Date(d);
      const now = new Date();
      const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
      const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.floor((dueDay - nowDay) / 86400000);
    }

    function addPeriod(iso, type) {
      const d = new Date(iso)
      if (type === RECUR.DAILY)   d.setDate(d.getDate() + 1)
      if (type === RECUR.WEEKLY)  d.setDate(d.getDate() + 7)
      if (type === RECUR.MONTHLY) d.setMonth(d.getMonth() + 1)
      return d.toISOString()
    }

    function pad(n, len = 2) { return String(n).padStart(len, '0') }

    function getDetailedCompletionText(due_date, completed_date) {
        if (!due_date || !completed_date) return null;
        const due = new Date(due_date).getTime();
        const done = new Date(completed_date).getTime();
        const diff = done - due;
        const absDiff = Math.abs(diff);
        
        const d = Math.floor(absDiff / 86400000);
        const h = Math.floor((absDiff % 86400000) / 3600000);
        const m = Math.floor((absDiff % 3600000) / 60000);
        
        let parts = [];
        if (d > 0) parts.push(`${d} ngày`);
        if (h > 0) parts.push(`${h} giờ`);
        if (m > 0) parts.push(`${m} phút`);
        
        if (parts.length === 0) return { text: 'Hoàn thành đúng hạn', color: 'text-emerald-600', isLate: false };
        
        const timeStr = parts.join(' ');
        if (diff > 60000) return { text: `Hoàn thành trễ ${timeStr}`, color: 'text-red-600', isLate: true };
        if (diff < -60000) return { text: `Hoàn thành sớm ${timeStr}`, color: 'text-emerald-600', isLate: false };
        return { text: 'Hoàn thành đúng hạn', color: 'text-emerald-600', isLate: false };
    }

    // ============================================================
    // API
    // ============================================================
    async function genTaskId() {
      const { data } = await db.from('cong_viec_duoc_giao').select('id').like('id','CV-%').order('id',{ascending:false}).limit(20)
      let max = 0; for (const r of (data||[])) { const m=r.id.match(/^CV-(\d+)$/); if(m&&+m[1]>max) max=+m[1] }
      return `CV-${String(max+1).padStart(3, '0')}`
    }

    async function genUpdateId() {
      const { data } = await db.from('tien_do').select('id').like('id','TD-%').order('id',{ascending:false}).limit(10)
      let max = 0; for (const r of (data||[])) { const m=r.id.match(/^TD-(\d+)$/); if(m&&+m[1]>max) max=+m[1] }
      return `TD-${String(max+1).padStart(3, '0')}`
    }

    async function loadAll() {
      const [tRes, uRes, pRes, poRes] = await Promise.all([
        fetchAllRows(() => db.from('cong_viec_duoc_giao').select('*').order('created_date',{ascending:false})),
        db.from('nhan_vien').select('*'),
        fetchAllRows(() => db.from('tien_do').select('*').order('time',{ascending:true})),
        db.from('production_orders').select('*, production_logs(actual_quantity)').not('status', 'eq', 'cancelled').order('created_at', { ascending: false }),
      ])
      if (tRes.error) throw tRes.error; if (uRes.error) throw uRes.error

      const users = (uRes.data||[]).map(u => ({...u, role: u.role ? u.role.toUpperCase() : u.role}));
      const uMap = new Map(users.map(u=>[u.id,u]))
      const pMap = new Map()
      for (const p of (pRes.data||[])) {
        const arr = pMap.get(p.task_id) || []; arr.push({...p, updatedBy: uMap.get(p.updated_by_id)||null}); pMap.set(p.task_id, arr)
      }
      const tasks = (tRes.data||[]).map(t=>({
        ...t, status: t.status === 'PENDING' ? 'IN_PROGRESS' : t.status, assignee: uMap.get(t.assignee_id)||null, progressUpdates: pMap.get(t.id)||[],
      }))

      const pendingOrders = (poRes.data || []).map(o => {
        const produced = (o.production_logs || []).reduce((sum, log) => sum + parseFloat(log.actual_quantity || 0), 0);
        const remaining = o.target_quantity - produced;
        return { ...o, produced, remaining };
      }).filter(o => o.remaining > 0 && o.status !== 'completed');

      return { tasks, users, pendingOrders }
    }

    async function apiLogin(id, pw) {
      const { data, error } = await db.from('nhan_vien').select('*').eq('id',id).single()
      if (error||!data) throw new Error('Mã nhân viên không tồn tại.')
      if (data.password !== pw) throw new Error('Mật khẩu không đúng.')
      data.role = data.role ? data.role.toUpperCase() : data.role;
      return data
    }

    async function apiCreateTask(form, createdBy) {
      const id = await genTaskId()
      const row = {
        id, title:form.title, description:form.description||'', status:STATUS.IN_PROGRESS, priority:form.priority||'', label:form.label||'',
        assignee_id:form.assignee_id, progress:0, sort_order:0, created_date:new Date().toISOString(),
        due_date:form.due_date||null, completed_date:null, updated_by:createdBy, last_reminded_date:null,
        recurrence_type:form.recurrence_type||RECUR.NONE, recurrence_parent_id:null, last_auto_created_date:null,
        attachments:form.attachments||[],
      }
      const { error } = await db.from('cong_viec_duoc_giao').insert(row)
      if (error) throw error; return row
    }

    async function apiUpdateTask(id, data) {
      const { data:updated, error } = await db.from('cong_viec_duoc_giao').update(data).eq('id',id).select().single()
      if (error) throw error; return updated
    }

    // Xoá file đính kèm của việc + của mọi lần cập nhật tiến độ thuộc việc đó.
    // Phải chạy TRƯỚC khi xoá row: mất row là mất luôn đường tìm path trong Storage.
    // Dọn hụt chỉ để lại rác nên không bao giờ được chặn thao tác xoá việc.
    async function cleanupTaskFiles(ids) {
      if (!ids.length) return
      try {
        const [{ data:tasks }, { data:logs }] = await Promise.all([
          db.from('cong_viec_duoc_giao').select('attachments').in('id',ids),
          db.from('tien_do').select('attachments').in('task_id',ids),
        ])
        const paths = [...(tasks||[]), ...(logs||[])].flatMap(r => collectPaths(r.attachments))
        await deleteAttachments(paths)
      } catch { /* dọn hụt chỉ để lại rác trong Storage — không chặn xoá việc */ }
    }

    async function apiDeleteTask(id) {
      await cleanupTaskFiles([id])
      await db.from('tien_do').delete().eq('task_id',id)
      await db.from('cong_viec_duoc_giao').update({ recurrence_parent_id: null }).eq('recurrence_parent_id', id)
      const { error } = await db.from('cong_viec_duoc_giao').delete().eq('id',id)
      if (error) throw error
    }

    async function apiAddUpdate(taskId, comment, userId, attachments) {
      const id = await genUpdateId()
      const row = { id, task_id:taskId, time:new Date().toISOString(), content:comment, updated_by_id:userId, attachments:attachments||[] }
      const { error } = await db.from('tien_do').insert(row)
      if (error) throw error; return row
    }

    async function apiCreateUser(form) {
      const { password, ...row } = form;                 // tách password khỏi cột bảng
      const { error } = await db.from('nhan_vien').insert(row)
      if (error) {
        if (error.message.includes('duplicate')||error.message.includes('unique')) throw new Error(`Mã nhân viên "${form.id}" đã tồn tại.`)
        throw error
      }
      if (password) {
        const { error: pErr } = await db.rpc('dat_mat_khau', { p_id: form.id, p_pw: password });
        if (pErr) throw new Error('Tạo NV xong nhưng đặt mật khẩu lỗi: ' + pErr.message);
      }
    }

    async function apiUpdateUser(id, data) {
      const { error } = await db.from('nhan_vien').update(data).eq('id',id)
      if (error) throw error
    }

    async function checkRecurring(tasks) {
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const todayStart = new Date(todayStr + 'T00:00:00')

      const templates = tasks.filter(t => t.recurrence_type !== RECUR.NONE && !t.recurrence_parent_id && t.status !== STATUS.CANCELLED)
      const newTasks = []

      for (const tmpl of templates) {
        if (!tmpl.due_date) continue
        if (tmpl.last_auto_created_date === todayStr) continue

        const instances = tasks.filter(t => t.recurrence_parent_id === tmpl.id).sort((a,b) => new Date(b.due_date) - new Date(a.due_date))
        const latestDue = instances[0]?.due_date || tmpl.due_date
        const latestDueDayStart = new Date(new Date(latestDue).toISOString().split('T')[0] + 'T00:00:00')

        if (todayStart <= latestDueDayStart) continue

        let nextDue = addPeriod(latestDue, tmpl.recurrence_type)
        let nextDueDay = new Date(nextDue).toISOString().split('T')[0]
        let count = 0

        while (new Date(nextDueDay + 'T00:00:00') < todayStart && count < 30) {
          const newId = await genTaskId()
          const clone = {
            id: newId, title: tmpl.title, description: tmpl.description || '', priority: tmpl.priority || '', label: tmpl.label || '',
            assignee_id: tmpl.assignee_id, status: STATUS.IN_PROGRESS, progress: 0, sort_order: 0,
            due_date: nextDue, completed_date: null, created_date: new Date().toISOString(), updated_by: tmpl.updated_by, last_reminded_date: null,
            recurrence_type: RECUR.NONE, recurrence_parent_id: tmpl.id, last_auto_created_date: null,
          }
          await db.from('cong_viec_duoc_giao').insert(clone)
          newTasks.push(clone)
          nextDue = addPeriod(nextDue, tmpl.recurrence_type)
          nextDueDay = new Date(nextDue).toISOString().split('T')[0]
          count++
        }

        const alreadyHasCurrent = [...instances, ...newTasks].some(t => t.recurrence_parent_id === tmpl.id && new Date(t.due_date).toISOString().split('T')[0] >= todayStr)
        if (!alreadyHasCurrent) {
          const newId = await genTaskId()
          const clone = {
            id: newId, title: tmpl.title, description: tmpl.description || '', priority: tmpl.priority || '', label: tmpl.label || '',
            assignee_id: tmpl.assignee_id, status: STATUS.IN_PROGRESS, progress: 0, sort_order: 0,
            due_date: nextDue, completed_date: null, created_date: new Date().toISOString(), updated_by: tmpl.updated_by, last_reminded_date: null,
            recurrence_type: RECUR.NONE, recurrence_parent_id: tmpl.id, last_auto_created_date: null,
          }
          await db.from('cong_viec_duoc_giao').insert(clone)
          newTasks.push(clone)
        }
        await db.from('cong_viec_duoc_giao').update({last_auto_created_date: todayStr}).eq('id', tmpl.id)
      }
      return newTasks
    }

    async function callWebhook(payload) {
      try { await fetch(N8N_WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }) } catch(_) {}
    }

    // ============================================================
    // HOOKS & SHARED UI
    // ============================================================
    function useToast() {
      const [list, setList] = useState([])
      const show = useCallback((msg, type='success') => {
        const id = Date.now(); setList(l => [...l,{id,msg,type}]); setTimeout(() => setList(l => l.filter(x=>x.id!==id)), 3500)
      }, [])
      return {list, show}
    }

    const inp   = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all'
    const sel   = inp + ' bg-white cursor-pointer'
    const btn   = {
      primary:   'px-3 sm:px-4 py-2 sm:py-2.5 bg-blue-600 text-white text-[11px] sm:text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm',
      secondary: 'px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-700 text-[11px] sm:text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors',
      ghost:     'px-2 py-1 text-gray-500 text-[10px] sm:text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors',
      orange:    'px-3 sm:px-4 py-2 sm:py-2.5 bg-yellow-500 text-white text-[11px] sm:text-sm font-semibold rounded-xl hover:bg-yellow-600 transition-colors shadow-sm whitespace-nowrap',
      danger:    'px-3 sm:px-4 py-2 sm:py-2.5 bg-red-100 text-red-600 text-[11px] sm:text-sm font-semibold rounded-xl hover:bg-red-200 transition-colors whitespace-nowrap',
    }

    function ToastList({list}) {
      return h('div',{className:'fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-[calc(100%-2rem)] md:max-w-sm'},
        list.map(t => h('div',{key:t.id, className:`fade-in px-4 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 ${t.type==='success'?'bg-blue-600 text-white':t.type==='error'?'bg-red-600 text-white':'bg-slate-800 text-white'}`}, t.type==='success'?'✓':t.type==='error'?'✕':'ℹ', t.msg))
      )
    }

    function Modal({title, onClose, children, wide=false}) {
      return h(Fragment,null,
        h('div',{className:'fixed inset-0 bg-black/50 z-40 backdrop-blur-sm fade-in',onClick:onClose}),
        h('div',{className:'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6'},
          h('div',{className:`bg-white rounded-2xl shadow-2xl w-full ${wide?'max-w-2xl':'max-w-md'} max-h-[96vh] flex flex-col fade-up`},
            h('div',{className:'flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0'},
              h('h2',{className:'text-[15px] sm:text-lg font-bold text-gray-900'},title),
              h('button',{onClick:onClose,className:'w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full text-xl transition-colors'},'×')
            ),
            h('div',{className:'px-4 sm:px-6 py-4 overflow-y-auto hide-scroll'},children)
          )
        )
      )
    }

    function Field({label, children, required}) {
      return h('div',{className:'mb-3 sm:mb-4'}, h('label',{className:'block text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-1.5 uppercase tracking-wide'}, label, required&&h('span',{className:'text-red-500 ml-0.5'},'*')), children)
    }

    // Badge trạng thái: chấm màu + nhãn chữ (không bao giờ chỉ dùng màu trần)
    const STATUS_DOT = { IN_PROGRESS:'bg-blue-500', COMPLETED:'bg-emerald-500', CANCELLED:'bg-red-400' }
    function StatusBadge({status}) {
      const c = STATUS_CFG[status]||STATUS_CFG.IN_PROGRESS
      return h('span',{className:`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold whitespace-nowrap ${c.cls}`},
        h('span',{className:`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]||'bg-gray-400'}`}),
        c.label
      )
    }

    function CompactWarning({due_date, status, completed_date}) {
      if (!due_date) return h('span', {className: 'text-gray-400 text-center text-[10px] sm:text-[11px]'}, '—');
      const isCompleted = status === STATUS.COMPLETED || status === STATUS.CANCELLED;
      const d = daysFrom(due_date);
      
      if (isCompleted) {
         const done = new Date(completed_date || due_date).getTime();
         const due = new Date(due_date).getTime();
         const diff = done - due;
         if (diff > 60000) {
            const absDiff = Math.abs(diff);
            const dNum = Math.floor(absDiff / 86400000);
            const hNum = Math.floor((absDiff % 86400000) / 3600000);
            const mNum = Math.floor((absDiff % 3600000) / 60000);
            let s = ''; if(dNum>0)s+=`${dNum}n `; if(hNum>0)s+=`${hNum}g `; if(mNum>0)s+=`${mNum}p`;
            return h('span', {className: 'font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] whitespace-nowrap'}, `Trễ ${s.trim()}`);
         }
         return h('span', {className: 'text-emerald-500 font-bold text-[10px] sm:text-[11px]'}, '✓');
      }

      // Hiện chữ rõ nghĩa thay con số trần (số 4 đỏ không ai hiểu là "trễ 4 ngày")
      if (d < 0) return h('span', {className: 'font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded text-[9px] sm:text-[11px] whitespace-nowrap'}, `Trễ ${-d} ngày`);
      if (d === 0) return h('span', {className: 'font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[9px] sm:text-[11px] whitespace-nowrap'}, 'Hạn hôm nay');
      return h('span', {className: 'font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] sm:text-[11px] whitespace-nowrap'}, `Còn ${d} ngày`);
    }

    const AVATAR_SZ = {
      sm: 'w-4 h-4 sm:w-6 sm:h-6 text-[8px] sm:text-xs',
      md: 'w-12 h-12 sm:w-14 sm:h-14 text-sm sm:text-base',
      lg: 'w-14 h-14 sm:w-[72px] sm:h-[72px] text-lg sm:text-xl',
    }
    function Avatar({user, size='sm'}) {
      const sz = AVATAR_SZ[size] || AVATAR_SZ.sm
      if (!user) return h('div',{className:`${sz} rounded-full bg-gray-100 flex-shrink-0`})
      if (user.avatar) return h('img',{src:user.avatar, alt:user.name||'', className:`${sz} rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200`})
      const name = user.name || '?';
      const initials = name.trim().split(' ').map(w=>w[0]).slice(-2).join('').toUpperCase() || '?'
      const pal = ['bg-blue-500','bg-yellow-500','bg-red-500','bg-emerald-500']
      const col = pal[(user.id||'').charCodeAt(0)%pal.length] || 'bg-gray-400'
      return h('div',{className:`${sz} rounded-full ${col} text-white flex items-center justify-center font-bold flex-shrink-0`},initials)
    }

    // Avatar to + tên bên dưới (dùng ở thẻ việc / cột Người trong bảng)
    function AvatarName({user, size='md', className=''}) {
      return h('div',{className:`flex flex-col items-center gap-0.5 min-w-0 ${className}`},
        h(Avatar,{user, size}),
        h('span',{className:'text-[9px] sm:text-[10px] font-bold text-gray-700 text-center leading-tight truncate w-full'}, user?.name || 'Chưa giao')
      )
    }

    const IconBell = () => h('svg',{className:'w-3 h-3 sm:w-3.5 sm:h-3.5', fill:'currentColor', viewBox:'0 0 20 20'}, h('path',{d:'M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z'}))
    const IconEye = () => h('svg',{className:'w-3 h-3 sm:w-4 sm:h-4', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M15 12a3 3 0 11-6 0 3 3 0 016 0z'}), h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'}))
    const IconEdit = () => h('svg',{className:'w-3 h-3 sm:w-3.5 sm:h-3.5', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'}))
    const IconCheck = () => h('svg',{className:'w-3 h-3 sm:w-4 sm:h-4', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2.5}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M5 13l4 4L19 7'}))
    const IconX = () => h('svg',{className:'w-3 h-3 sm:w-4 sm:h-4', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2.5}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M6 18L18 6M6 6l12 12'}))
    const IconUndo = () => h('svg',{className:'w-3 h-3 sm:w-4 sm:h-4', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2.5}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6'}))
    const IconTrash = () => h('svg',{className:'w-3.5 h-3.5', fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2}, h('path',{strokeLinecap:'round', strokeLinejoin:'round', d:'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'}))

    // ============================================================
    // QUẢN LÝ NHÂN VIÊN MODAL
    // ============================================================
    function UserModal({user, onSave, onClose}) {
      const isEdit = !!user
      const hasTabKeys = user && user.permissions &&
        Object.keys(user.permissions).some(k => k.startsWith('tab.'));
      const seedPerms = !user
        ? { ...DEFAULT_PERMS_AGENT }
        : (hasTabKeys ? { ...user.permissions } : migrateLegacyToTabPerms(user.permissions || {}));
      const [f,setF] = useState({id:user?.id||'',name:user?.name||'',password:'',role:user?.role||ROLE.AGENT,avatar:user?.avatar||'',originalId:user?.id||'',permissions:{...seedPerms}})
      const [busy,setBusy] = useState(false)
      const set = (k,v)=>setF(p=>({...p,[k]:v}))
      const tabOn = (m, t, cap) => f.permissions[tabKey(m, t, cap)] === true;
      const setTab = (m, t, cap, val) => setF(p => {
        const np = { ...p.permissions };
        const k = tabKey(m, t, cap);
        if (val) np[k] = true; else delete np[k];
        if (cap === 'view' && !val) {
          for (const c of ALL_CAPS) if (c !== 'view') delete np[tabKey(m, t, c)];
        }
        return { ...p, permissions: np };
      });
      const bulkModule = (mod, mode) => setF(p => {
        const np = { ...p.permissions };
        for (const t of mod.tabs) for (const c of t.caps) {
          const k = tabKey(mod.module, t.id, c);
          if (mode === 'clear') delete np[k];
          else if (mode === 'view') { if (c === 'view') np[k] = true; else delete np[k]; }
          else if (mode === 'all') np[k] = true;
        }
        return { ...p, permissions: np };
      });

      function changeRole(newRole) {
        const defPerms = newRole === ROLE.ADMIN
          ? Object.keys(ALL_PERMS).reduce((a,k)=>({...a,[k]:true}),{})
          : {...DEFAULT_PERMS_AGENT, ...Object.keys(MODULE_PERMS).reduce((a,k)=>({...a,[k]:false}),{})}
        setF(p=>({...p, role:newRole, permissions:{...defPerms}}))
      }

      async function submit(e) {
        e.preventDefault(); setBusy(true)
        try { await onSave(f,isEdit); onClose() }
        catch(e) { alert(e.message) }
        finally { setBusy(false) }
      }

      // Group styling for permission sections
      const sectionStyle = {marginBottom:'0.75rem',padding:'0.6rem',background:'#f8fafc',borderRadius:'10px',border:'1px solid #e2e8f0'}

      return h(Modal,{title:isEdit?'Sửa nhân viên':'Thêm nhân viên',onClose},
        h('form',{onSubmit:submit},
          h(Field,{label:'Mã NV',required:true}, h('input',{className:inp,value:f.id,onChange:e=>set('id',e.target.value),placeholder:'NV001',required:true})),
          h(Field,{label:'Họ Tên',required:true}, h('input',{className:inp,value:f.name,onChange:e=>set('name',e.target.value),required:true})),
          h(Field,{label:isEdit?'Mật khẩu mới (trống = ko đổi)':'Mật khẩu',required:!isEdit}, h('input',{type:'password',className:inp,value:f.password,onChange:e=>set('password',e.target.value),required:!isEdit})),
          h(Field,{label:'Vai trò'}, h('select',{className:sel,value:f.role,onChange:e=>changeRole(e.target.value)}, h('option',{value:ROLE.AGENT},'Nhân viên'), h('option',{value:ROLE.ADMIN},'Admin'))),
          
          f.role !== ROLE.ADMIN && h('div',{style:{marginTop:'0.75rem',paddingTop:'0.75rem',borderTop:'1px solid #e2e8f0'}},
            PERM_REGISTRY.map(mod => {
              const onCount = mod.tabs.filter(t => tabOn(mod.module, t.id, 'view')).length;
              return h('details', {key:mod.module, style:sectionStyle},
                h('summary', {style:{cursor:'pointer',fontSize:'0.8rem',fontWeight:700,color:'#334155',display:'flex',alignItems:'center',gap:'0.4rem'}},
                  h('span',null, mod.icon+' '+mod.label),
                  h('span',{style:{color:'#94a3b8',fontWeight:400}}, ` — ${onCount}/${mod.tabs.length} tab`),
                ),
                h('div',{style:{display:'flex',gap:'0.3rem',margin:'0.4rem 0'}},
                  h('button',{type:'button',onClick:()=>bulkModule(mod,'view'),className:'text-xs px-2 py-0.5 rounded bg-slate-100'},'Chỉ xem'),
                  h('button',{type:'button',onClick:()=>bulkModule(mod,'all'),className:'text-xs px-2 py-0.5 rounded bg-blue-100'},'Toàn quyền'),
                  h('button',{type:'button',onClick:()=>bulkModule(mod,'clear'),className:'text-xs px-2 py-0.5 rounded bg-slate-100'},'Bỏ chọn'),
                ),
                h('div',{style:{display:'grid',gridTemplateColumns:`1.6fr repeat(${ALL_CAPS.length}, 1fr)`,gap:'0.2rem',fontSize:'0.65rem',color:'#64748b',fontWeight:600,padding:'0.2rem 0'}},
                  h('span',null,'Tab'), ...ALL_CAPS.map(c => h('span',{key:c,style:{textAlign:'center'}}, CAP_LABEL[c])),
                ),
                mod.tabs.map(t => h('div',{key:t.id, style:{display:'grid',gridTemplateColumns:`1.6fr repeat(${ALL_CAPS.length}, 1fr)`,gap:'0.2rem',alignItems:'center',padding:'0.15rem 0'}},
                  h('span',{style:{fontSize:'0.7rem',color:'#0f172a'}}, t.label),
                  ...ALL_CAPS.map(c => {
                    if (!t.caps.includes(c)) return h('span',{key:c,style:{textAlign:'center',color:'#cbd5e1'}}, '—');
                    const disabled = c !== 'view' && !tabOn(mod.module, t.id, 'view');
                    return h('span',{key:c,style:{textAlign:'center'}},
                      h('input',{type:'checkbox', disabled, checked:tabOn(mod.module,t.id,c),
                        onChange:e=>setTab(mod.module,t.id,c,e.target.checked),
                        style:{width:'14px',height:'14px',accentColor:'#2563eb',opacity:disabled?0.4:1}}),
                    );
                  }),
                )),
              );
            }),
          ),

          h('div',{className:'flex justify-end gap-2 pt-3 mt-3 border-t border-gray-100'}, h('button',{type:'button',onClick:onClose,className:btn.secondary+' px-3 py-1.5 text-xs'},'Hủy'), h('button',{type:'submit',disabled:busy,className:btn.primary+' px-3 py-1.5 text-xs'},busy?'...':'Lưu'))
        )
      )
    }

    // ============================================================
    // LOGIN SCREEN
    // ============================================================
    function LoginScreen({onLogin}) {
      const [id,setId]   = useState('')
      const [pw,setPw]   = useState('')
      const [rem,setRem] = useState(false)
      const [err,setErr] = useState('')
      const [busy,setBusy] = useState(false)

      useEffect(() => {
        try {
          const s = localStorage.getItem('qlcv_auth');
          if (s) {
            const p = JSON.parse(s);
            setId(p.id); setPw(p.pw); setRem(true);
            setBusy(true);
            apiLogin(p.id, p.pw).then(user => { onLogin(user); }).catch(() => { localStorage.removeItem('qlcv_auth'); setBusy(false); });
          }
        } catch(_) {}
      }, [])

      async function submit(e) {
        e.preventDefault(); setErr(''); setBusy(true)
        try { const user = await apiLogin(id.trim(), pw); if (rem) localStorage.setItem('qlcv_auth',JSON.stringify({id:id.trim(),pw})); else localStorage.removeItem('qlcv_auth'); onLogin(user) } 
        catch(e) { setErr(e.message) } finally { setBusy(false) }
      }

      return h('div',{className:'min-h-screen bg-slate-50 flex items-center justify-center p-4'},
        h('div',{className:'bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-md p-6 sm:p-10 fade-up'},
          h('div',{className:'text-center mb-6 sm:mb-8'},
            h('div',{className:'w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-2xl mx-auto mb-4 sm:mb-5 flex items-center justify-center shadow-lg shadow-blue-600/30'}, h('svg',{className:'w-6 h-6 sm:w-8 sm:h-8 text-white',fill:'none',stroke:'currentColor',viewBox:'0 0 24 24'}, h('path',{strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:2.5,d:'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'}))),
            h('h1',{className:'text-xl sm:text-2xl font-bold text-gray-900'},'Quản Lý Công Việc'), h('p',{className:'text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2 font-medium'},'Phiên bản 2.4')
          ),
          h('form',{onSubmit:submit},
            h(Field,{label:'Mã nhân viên'}, h('input',{className:inp,value:id,onChange:e=>setId(e.target.value),placeholder:'VD: NV001',required:true,autoFocus:true})),
            h(Field,{label:'Mật khẩu'}, h('input',{type:'password',className:inp,value:pw,onChange:e=>setPw(e.target.value),placeholder:'••••••••',required:true})),
            h('label',{className:'flex items-center gap-2 text-xs sm:text-sm text-gray-600 mb-5 sm:mb-6 cursor-pointer select-none font-medium'}, h('input',{type:'checkbox',checked:rem,onChange:e=>setRem(e.target.checked),className:'w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'}),'Ghi nhớ đăng nhập'),
            err && h('div',{className:'text-red-600 text-xs sm:text-sm font-medium mb-4 sm:mb-5 bg-red-50 border border-red-100 px-3 sm:px-4 py-2 sm:py-3 rounded-xl'},err),
            h('button',{type:'submit',disabled:busy,className:btn.primary+' w-full py-2.5 sm:py-3'},busy?'Đang đăng nhập...':'Đăng nhập')
          )
        )
      )
    }

    // ============================================================
    // DASHBOARD COMPONENT
    // ============================================================
    function Dashboard({tasks, users, currentUser, onUserClick, onDetail, onAddUser, onEditUser, pendingOrders}) {
      // pendingOrders is now received from props (pre-fetched in loadAll)

      const activeTasks = tasks.filter(t => t.status !== STATUS.COMPLETED && t.status !== STATUS.CANCELLED);
      const stats = {
        total: tasks.length,
        inProgress: tasks.filter(t => t.status === STATUS.IN_PROGRESS).length,
        done: tasks.filter(t => t.status === STATUS.COMPLETED).length,
        canceled: tasks.filter(t => t.status === STATUS.CANCELLED).length,
        late: tasks.filter(t => t.status === STATUS.IN_PROGRESS && t.due_date && daysFrom(t.due_date) < 0).length,
      }

      const userStats = users.map(u => {
        const ut = tasks.filter(t => t.assignee_id === u.id)
        return {
          ...u, total: ut.length,
          active: ut.filter(t => t.status === STATUS.IN_PROGRESS).length,
          done: ut.filter(t => t.status === STATUS.COMPLETED).length,
          canceled: ut.filter(t => t.status === STATUS.CANCELLED).length,
          late: ut.filter(t => t.status === STATUS.IN_PROGRESS && t.due_date && daysFrom(t.due_date) < 0).length,
        }
      })

      const sortDashboardTasks = (taskArray) => {
        const now = new Date();
        const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

        return taskArray.sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;

          const dateA = new Date(a.due_date);
          const timeA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
          const diffA = Math.floor((timeA - todayStart) / 86400000);

          const dateB = new Date(b.due_date);
          const timeB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
          const diffB = Math.floor((timeB - todayStart) / 86400000);

          if (diffA < 0 && diffB < 0) return timeA - timeB; 
          if (diffA < 0) return -1;
          if (diffB < 0) return 1;
          if (diffA === 0 && diffB === 0) return timeA - timeB;
          if (diffA === 0) return -1;
          if (diffB === 0) return 1;
          if (diffA > 0 && diffB > 0) return timeA - timeB; 
          return 0;
        });
      };

      // Việc đang thực hiện: 1 danh sách phẳng (khẩn nhất trước), người nhận hiện ngay trên thẻ.
      // Bỏ kiểu chia mỗi nhân viên 1 section riêng — tốn chỗ và khó quét khi mỗi người chỉ 1-2 việc.
      const dashActiveTasks = sortDashboardTasks([...activeTasks]);

      // Bảng nhân viên: sắp A-Z theo tên (có dấu tiếng Việt) để dễ dò tìm
      const sortedUserStats = [...userStats].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

      const getLatestUpdate = (t) => {
        if (!t.progressUpdates || t.progressUpdates.length === 0) return '—'
        return t.progressUpdates[t.progressUpdates.length - 1].content
      }

      const thClass = "text-[9px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-tighter border-b border-gray-100 px-1.5 py-1.5 sm:py-2"
      const tdClass = "text-[10px] sm:text-[12px] px-1.5 py-1.5 sm:py-2 border-b border-gray-50"

      // Ô KPI: nhãn nhỏ + con số lớn + icon nền tint (không emoji, số dùng token chữ chính)
      const StatTile = ({label, value, icon: TileIcon, tone, sub}) => {
        const tones = {
          slate:   { box:'bg-slate-100 text-slate-500',   val:'text-gray-900' },
          blue:    { box:'bg-blue-50 text-blue-600',      val:'text-gray-900' },
          emerald: { box:'bg-emerald-50 text-emerald-600',val:'text-gray-900' },
          red:     { box:'bg-red-50 text-red-600',        val: value > 0 ? 'text-red-600' : 'text-gray-900' },
        }
        const t = tones[tone] || tones.slate
        return h('div', {className: 'bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2.5 sm:gap-3 min-w-0'},
          h('div', {className: `w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${t.box}`}, h(TileIcon, {size: 18})),
          h('div', {className: 'min-w-0'},
            h('p', {className: 'text-[10px] sm:text-xs font-semibold text-gray-500 truncate'}, label),
            h('p', {className: `text-lg sm:text-2xl font-bold leading-tight ${t.val}`}, value,
              sub && h('span', {className: 'ml-1.5 text-[10px] sm:text-xs font-semibold text-gray-400'}, sub)
            )
          )
        )
      }

      return h('div', {className: 'space-y-3 sm:space-y-4 fade-in pb-24 max-w-[1400px] mx-auto w-full'},
        h('div', {className: 'flex items-center justify-between gap-2'},
          h('h1', {className: 'text-sm sm:text-lg font-bold text-gray-900 tracking-tight'}, 'Tổng quan công việc'),
          h('button', {className: btn.primary + ' shrink-0 !px-2.5 sm:!px-3 !py-1.5 text-[10px] sm:text-xs flex items-center gap-1.5', onClick: async () => {
            const WEBHOOK_URL = 'https://thegioilocnuoc.site/webhook/a6fc08fc-dc4e-432e-9588-424d78470769';
            const payload = {
              timestamp: new Date().toISOString(),
              reporter: currentUser?.name || 'Unknown',
              stats,
              userStats: userStats.map(u => ({name: u.name, total: u.total, active: u.active, done: u.done, canceled: u.canceled, late: u.late})),
              tasks: tasks.map(t => ({id: t.id, title: t.title, status: t.status, assignee: users.find(u=>u.id===t.assignee_id)?.name||'Chưa giao', due_date: t.due_date, priority: t.priority}))
            };
            try {
              const res = await fetch(WEBHOOK_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
              alert(res.ok ? '✅ Đã gửi báo cáo thành công!' : '❌ Gửi thất bại: ' + res.status);
            } catch(e) { alert('❌ Lỗi kết nối: ' + e.message); }
          }}, h(Send, {size: 13}), 'Gửi báo cáo'),
        ),

        // Hàng KPI tổng
        h('div', {className: 'grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3'},
          h(StatTile, {label: 'Tổng công việc', value: stats.total, icon: ListChecks, tone: 'slate', sub: stats.canceled > 0 ? `(${stats.canceled} đã hủy)` : null}),
          h(StatTile, {label: 'Đang thực hiện', value: stats.inProgress, icon: Loader2, tone: 'blue'}),
          h(StatTile, {label: 'Hoàn thành', value: stats.done, icon: CheckCircle2, tone: 'emerald'}),
          h(StatTile, {label: 'Trễ hạn', value: stats.late, icon: AlertTriangle, tone: 'red'}),
        ),

        h('div', {className: 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden'},
          h('div', {className: 'px-3 py-2 sm:py-2.5 border-b border-gray-100 flex justify-between items-center'},
            h('div', {className: 'flex items-center gap-1.5'},
              h(UsersIcon, {size: 14, className: 'text-gray-400'}),
              h('span', {className: 'text-[11px] sm:text-sm font-bold text-gray-800'}, 'Thống kê nhân viên')
            ),
            currentUser?.role === ROLE.ADMIN && h('button', {onClick: onAddUser, className: 'flex items-center gap-1 text-[9px] sm:text-xs bg-blue-600 text-white px-2 py-1 rounded-md hover:bg-blue-700 font-semibold transition-colors'}, h(UserPlus, {size: 12}), 'Thêm NV')
          ),
          // Bảng gọn: tên nhân viên là cột đầu, đậm, luôn thấy ngay; sắp theo trễ/đang làm nhiều nhất
          h('div', {className: 'w-full overflow-x-auto'},
            h('table', {className: 'w-full min-w-[480px]'},
              h('thead', null, h('tr', {className: 'border-b border-gray-200'},
                h('th', {className: thClass + ' text-left w-[30%]'}, 'NHÂN VIÊN'),
                h('th', {className: thClass + ' text-left w-[34%]'}, 'HOÀN THÀNH'),
                h('th', {className: thClass + ' text-center w-[14%]'}, 'ĐANG LÀM'),
                h('th', {className: thClass + ' text-center w-[12%]'}, 'TRỄ'),
                h('th', {className: thClass + ' w-[10%]'}, '')
              )),
              h('tbody', null,
                sortedUserStats.map(u => {
                  const pctDone = u.total > 0 ? Math.round((u.done / u.total) * 100) : 0
                  return h('tr', {key: u.id, onClick: () => onUserClick(u.id), className: 'table-row-hover cursor-pointer group border-b border-gray-50'},
                    h('td', {className: tdClass},
                      h('div', {className: 'flex items-center gap-2 min-w-0'},
                        h(Avatar, {user: u, size: 'sm'}),
                        h('span', {className: 'font-bold text-gray-900 truncate text-[11px] sm:text-[13px]'}, u.name)
                      )
                    ),
                    h('td', {className: tdClass},
                      h('div', {className: 'flex items-center gap-2'},
                        h('div', {className: 'flex-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden min-w-[60px]'},
                          h('div', {className: 'h-full rounded-full bg-emerald-500', style: {width: `${pctDone}%`}})
                        ),
                        h('span', {className: 'text-[10px] sm:text-[11px] font-bold text-gray-700 whitespace-nowrap w-[52px] text-right'}, `${u.done}/${u.total}`)
                      )
                    ),
                    h('td', {className: tdClass + ' text-center'},
                      u.active > 0
                        ? h('span', {className: 'inline-block min-w-[24px] text-[11px] sm:text-xs font-bold text-blue-700 bg-blue-50 rounded-md px-1.5 py-0.5'}, u.active)
                        : h('span', {className: 'text-[11px] text-gray-300 font-semibold'}, '0')
                    ),
                    h('td', {className: tdClass + ' text-center'},
                      u.late > 0
                        ? h('span', {className: 'inline-block min-w-[24px] text-[11px] sm:text-xs font-bold text-red-700 bg-red-50 rounded-md px-1.5 py-0.5'}, u.late)
                        : h('span', {className: 'text-[11px] text-gray-300 font-semibold'}, '0')
                    ),
                    h('td', {className: tdClass + ' text-right'},
                      currentUser?.role === ROLE.ADMIN && h('button', {
                        onClick: (e) => { e.stopPropagation(); onEditUser(u); },
                        className: 'text-gray-300 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors',
                        title: 'Sửa nhân viên'
                      }, h(IconEdit))
                    )
                  )
                })
              )
            )
          )
        ),

        // Việc đang thực hiện: 1 lưới phẳng, người nhận nổi bật trên từng thẻ
        h('div', {className: 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden'},
          h('div', {className: 'px-3 py-2 sm:py-2.5 border-b border-gray-100 flex items-center gap-1.5'},
            h(Loader2, {size: 14, className: 'text-blue-500'}),
            h('span', {className: 'text-[11px] sm:text-sm font-bold text-gray-800'}, 'Việc đang thực hiện'),
            h('span', {className: 'bg-blue-50 text-blue-700 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-bold'}, dashActiveTasks.length)
          ),
          dashActiveTasks.length === 0
            ? h('p', {className: 'text-center text-gray-400 py-8 text-xs font-semibold'}, 'Không có việc nào đang thực hiện.')
            : h('div', {className: 'p-2.5 sm:p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5'},
                dashActiveTasks.map(t => {
                  const d = daysFrom(t.due_date);
                  // Màu hạn chỉ ở viền trái + badge; chữ giữ token chính
                  let accent = '#cbd5e1';
                  if (d !== null) {
                      if (d < 0) accent = '#dc2626';
                      else if (d === 0) accent = '#d97706';
                      else accent = '#059669';
                  }

                  return h('div', {
                      key: t.id,
                      onClick: () => onDetail(t),
                      style: {borderLeft: `3px solid ${accent}`},
                      className: 'bg-white border border-gray-200 hover:border-blue-400 hover:shadow-md rounded-lg p-2.5 sm:p-3 cursor-pointer transition-all flex gap-2.5 relative shadow-sm'
                    },
                    // Avatar to + tên bên dưới, đứng riêng cột trái
                    h(AvatarName, {user: t.assignee, className: 'w-11 sm:w-14 shrink-0 pt-0.5'}),
                    h('div', {className: 'flex-1 min-w-0 flex flex-col gap-1.5'},
                      h('div', {className: 'flex items-start justify-between gap-2'},
                        h('span', {className: 'font-bold text-[12px] sm:text-[13px] line-clamp-2 text-gray-900'}, t.title, h(AttachmentBadge,{list:t.attachments})),
                        h('div', {className: 'shrink-0'}, h(CompactWarning, {due_date: t.due_date, status: t.status, completed_date: t.completed_date}))
                      ),
                      h('div', {className: 'flex flex-col gap-1 mt-auto pt-1.5 border-t border-gray-100'},
                        h('div', {className: 'flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-500 font-medium'},
                          h(Clock, {size: 11, className: 'shrink-0 text-gray-400'}),
                          h('span', null, 'Hạn:'),
                          h('span', {className: 'text-gray-800 font-bold'}, t.due_date ? fmtDateStr(t.due_date) : 'Chưa đặt')
                        ),
                        h('div', {className: 'flex items-start gap-1.5 text-[10px] sm:text-[11px] text-gray-500 font-medium'},
                          h(MessageSquare, {size: 11, className: 'shrink-0 mt-0.5 text-gray-400'}),
                          h('span', {className: 'text-gray-700 line-clamp-2'}, getLatestUpdate(t))
                        )
                      )
                    )
                  )
                })
              )
        ),

        // Khối hiển thị Phiếu Sản Xuất Còn Nợ
        h('div', {className: 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden'},
          h('div', {className: 'px-3 py-2 sm:py-2.5 border-b border-gray-100 flex items-center gap-1.5'},
            h(Factory, {size: 14, className: 'text-gray-400'}),
            h('span', {className: 'text-[11px] sm:text-sm font-bold text-gray-800'}, 'Phiếu sản xuất còn nợ'),
            pendingOrders.length > 0 && h('span', {className: 'bg-red-50 text-red-600 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-bold'}, pendingOrders.length)
          ),
          h('div', {className: 'w-full max-h-[300px] overflow-y-auto'},
            h('table', {className: 'w-full table-fixed text-left'},
              h('thead', {className: 'sticky top-0 bg-gray-50'}, h('tr', null,
                h('th', {className: thClass + ' w-[25%]'}, 'MÃ LỆNH'),
                h('th', {className: thClass + ' w-[25%]'}, 'SẢN PHẨM'),
                h('th', {className: thClass + ' w-[25%] text-center'}, 'ĐÃ LÀM / MỤC TIÊU'),
                h('th', {className: thClass + ' w-[25%] text-center'}, 'CÒN NỢ')
              )),
              h('tbody', null, pendingOrders.length > 0 ? pendingOrders.map(o => {
                  return h('tr', {key: o.id, className: 'table-row-hover'},
                    h('td', {className: tdClass + ' font-bold text-gray-900 truncate', title: o.order_code}, o.order_code || o.id.split('-')[0]),
                    h('td', {className: tdClass + ' truncate font-semibold text-gray-700'}, o.product_code),
                    h('td', {className: tdClass + ' text-center'},
                        h('span', {className:'text-gray-900 font-bold'}, Number(o.produced.toFixed(1))),
                        h('span', {className:'text-gray-400'}, ' / '),
                        h('span', {className:'text-gray-500 font-medium'}, o.target_quantity)
                    ),
                    h('td', {className: tdClass + ' text-center font-bold text-red-600'}, Number(o.remaining.toFixed(1)))
                  )
              }) : h('tr', null, h('td', {colSpan: 4, className: 'text-center text-gray-400 py-6 text-xs font-semibold'}, 'Không có phiếu sản xuất nào đang nợ.')))
            )
          )
        )
      )
    }

    // ============================================================
    // TASK TABLE (Danh sách tất cả công việc)
    // ============================================================
    function TaskTable({tasks,users,currentUser,assFilter,setAssFilter,onEdit,onDetail,onDelete,onBulkDelete}) {
      const [search,setSearch] = useState(''); const [stFilter,setStFilter] = useState('IN_PROGRESS'); const isAdmin = currentUser.role===ROLE.ADMIN
      const canDelete = getTabPerm(currentUser, 'tasks', 'tasks').delete;
      const filtered = tasks.filter(t=>{
        if (stFilter!=='ALL'&&t.status!==stFilter) return false; if (assFilter!=='ALL'&&t.assignee_id!==assFilter) return false
        if (search) { const q=search.toLowerCase(); if (!t.title.toLowerCase().includes(q)&&!t.id.toLowerCase().includes(q)&&!(t.assignee?.name||'').toLowerCase().includes(q)&&!(t.label||'').toLowerCase().includes(q)) return false }
        return true
      }).sort((a, b) => {
        const nameA = (a.assignee?.name || 'zzz').toLowerCase(); const nameB = (b.assignee?.name || 'zzz').toLowerCase()
        if (nameA < nameB) return -1; if (nameA > nameB) return 1
        if (!a.due_date && !b.due_date) return 0; if (!a.due_date) return 1; if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      })
      const thClass = "text-left text-[9px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-2 bg-gray-50 text-gray-500 tracking-wide uppercase"; const tdClass = "px-1.5 sm:px-2 py-1.5 sm:py-2 truncate text-[10px] sm:text-[12px]"

      return h('div',{className:'max-w-[1400px] mx-auto w-full'},
        h('div',{className:'flex gap-1.5 mb-3 flex-wrap items-center w-full justify-between'},
          h('div', {className:'flex gap-1.5 items-center flex-1 flex-wrap'},
             h('div',{className:'relative w-[180px] sm:w-[220px] shrink-0'},
               h(Search,{size:13, className:'absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none'}),
               h('input',{className:inp+' !pl-7 !px-2 !py-1.5 text-[11px]',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Tìm việc, người, nhãn...'})
             ),
             h('select',{className:sel+' !w-auto !px-2 !py-1.5 text-[11px]',value:stFilter,onChange:e=>setStFilter(e.target.value)}, h('option',{value:'ALL'},'Tất cả trạng thái'), Object.entries(STATUS_CFG).map(([k,v])=>h('option',{key:k,value:k},v.label))),
             isAdmin && h('select',{className:sel+' !w-auto !px-2 !py-1.5 text-[11px]',value:assFilter,onChange:e=>setAssFilter(e.target.value)}, h('option',{value:'ALL'},'Tất cả nhân viên'), users.map(u=>h('option',{key:u.id,value:u.id},u.name))),
             h('span',{className:'text-[10px] sm:text-[11px] text-gray-400 font-semibold whitespace-nowrap'}, `${filtered.length} việc`)
          ),
          isAdmin && h('button', {onClick: onBulkDelete, className: btn.danger + ' flex items-center gap-1 !px-2 !py-1.5 text-[10px] sm:text-xs'}, h(IconTrash), 'Dọn việc đã hủy')
        ),
        h('div',{className:'bg-white rounded-xl border border-gray-200 shadow-sm w-full overflow-hidden'},
          h('table',{className:'w-full table-fixed'},
            h('thead',null, h('tr',{className:'border-b border-gray-200'},
                h('th',{className:`${thClass} w-[30%] sm:w-[28%]`}, 'Công việc'),
                h('th',{className:`${thClass} w-[15%] sm:w-[14%]`}, 'Người'),
                h('th',{className:`${thClass} w-[12%] sm:w-[13%]`}, 'Trạng thái'),
                h('th',{className:`${thClass} w-[13%] text-center`}, 'Hạn'),
                h('th',{className:`${thClass} w-[22%]`}, 'Cập nhật'),
                canDelete && h('th',{className:`${thClass} w-[8%] text-center`}, '')
            )),
            h('tbody',null,
              filtered.length===0 ? h('tr',null,h('td',{colSpan:canDelete?6:5,className:'text-center text-gray-400 py-10 text-[11px]'},'Không tìm thấy công việc nào'))
                : filtered.map(t=>
                    h('tr',{key:t.id, className:'border-b border-gray-100 cursor-pointer table-row-hover group', onClick:()=>onDetail(t)},
                      h('td',{className:tdClass}, h('div',{className:'font-bold text-gray-900 truncate flex items-center gap-1.5'},h('span',{className:'truncate'},t.title),h(AttachmentBadge,{list:t.attachments}))),
                      h('td',{className:tdClass}, h(AvatarName,{user:t.assignee, size:'md', className:'mx-auto max-w-[70px]'})),
                      h('td',{className:tdClass}, h(StatusBadge,{status:t.status})),
                      h('td',{className:tdClass+' text-center'}, h(CompactWarning,{due_date:t.due_date,status:t.status, completed_date:t.completed_date})),
                      h('td',{className:tdClass+' text-gray-500'}, t.progressUpdates?.length ? t.progressUpdates[t.progressUpdates.length - 1].content : 'Chưa cập nhật'),
                      canDelete && h('td',{className:tdClass+' text-center'}, h('button',{onClick:(e)=>{e.stopPropagation(); onDelete(t)},className:'text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors', title:'Xóa'}, h(IconTrash)))
                    )
                  )
            )
          )
        )
      )
    }

    // ============================================================
    // USER TASK BOARD COMPONENT
    // ============================================================
    function UserTaskBoard({user, tasks, onBack, onDetail, onEdit, onUpdate, onRemind, onDelete, currentUser}) {
      // Mặc định mở tab "Đang làm"; nếu người này không có việc đang làm thì về "Tất cả" (tránh mở trang trống)
      const [tab, setTab] = useState(() =>
        tasks.some(t => t.assignee_id === user.id && t.status === STATUS.IN_PROGRESS) ? 'ACTIVE' : 'ALL');
      const isAdmin = currentUser.role === ROLE.ADMIN;
      const tPerm = getTabPerm(currentUser, 'tasks', 'tasks');
      const canDelete = tPerm.delete;

      const sortKanbanTasks = (taskArray) => {
        const now = new Date();
        const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

        return [...taskArray].sort((a, b) => {
          if (a.status === STATUS.COMPLETED && b.status !== STATUS.COMPLETED) return 1;
          if (a.status !== STATUS.COMPLETED && b.status === STATUS.COMPLETED) return -1;
          
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;

          const dateA = new Date(a.due_date);
          const timeA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
          const diffA = Math.floor((timeA - todayStart) / 86400000);

          const dateB = new Date(b.due_date);
          const timeB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
          const diffB = Math.floor((timeB - todayStart) / 86400000);

          if (diffA < 0 && diffB < 0) return timeA - timeB; 
          if (diffA < 0) return -1;
          if (diffB < 0) return 1;
          if (diffA === 0 && diffB === 0) return timeA - timeB;
          if (diffA === 0) return -1;
          if (diffB === 0) return 1;
          if (diffA > 0 && diffB > 0) return timeA - timeB; 
          return 0;
        });
      };

      const myTasks = sortKanbanTasks(tasks.filter(t => t.assignee_id === user.id));
      const activeTasks = myTasks.filter(t => t.status === STATUS.IN_PROGRESS);
      const completedTasks = myTasks.filter(t => t.status === STATUS.COMPLETED);
      const displayTasks = tab === 'ALL' ? myTasks : (tab === 'ACTIVE' ? activeTasks : completedTasks);

      function quickStatus(t, s) {
        const upd = {status:s}; 
        if (s===STATUS.COMPLETED || s===STATUS.CANCELLED) upd.completed_date=new Date().toISOString(); 
        if (s===STATUS.IN_PROGRESS && t.status===STATUS.COMPLETED) upd.completed_date=null;
        onUpdate(t.id, upd)
      }

      return h('div', {className: 'max-w-7xl mx-auto fade-in pb-24'},
        h('div', {className: 'flex items-center gap-1.5 sm:gap-4 mb-3 sm:mb-6 w-full'},
           onBack && h('button', {onClick: onBack, className: 'w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 transition-colors text-lg sm:text-xl shrink-0'}, '←'),
           h(Avatar, {user, size: 'lg'}),
           h('div', {className: 'truncate flex-1'},
             h('h2', {className: 'text-sm sm:text-2xl font-bold text-gray-900 truncate'}, user.name),
             h('p', {className: 'text-[9px] sm:text-sm text-gray-500 font-medium'}, `${activeTasks.length} việc đang làm`)
           )
        ),

        h('div', {className: 'flex w-full gap-1 mb-3 sm:mb-5 border-b border-gray-100 pb-2 sm:pb-4'},
          [ {id: 'ALL', label: 'Tất cả', count: myTasks.length}, {id: 'ACTIVE', label: 'Đang làm', count: activeTasks.length}, {id: 'COMPLETED', label: 'Xong', count: completedTasks.length} ].map(tb =>
            h('button', {
              key: tb.id, onClick: () => setTab(tb.id),
              className: `flex-1 py-1.5 px-1 sm:px-4 rounded-lg sm:rounded-xl text-[9px] sm:text-sm font-bold flex justify-center items-center gap-0.5 sm:gap-2 transition-all border ${tab === tb.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`
            }, h('span', {className:'truncate'}, tb.label), h('span', {className: `text-[8px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded-full shrink-0 ${tab === tb.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}, tb.count))
          )
        ),

        h('div', {className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5 w-full'},
          displayTasks.map(t => {
            const isCompleted = t.status === STATUS.COMPLETED;
            const statusConfig = STATUS_CFG[t.status] || STATUS_CFG.IN_PROGRESS;
            const d = daysFrom(t.due_date);
            const over = d !== null && d < 0;

            return h('div', {key: t.id, className: 'bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm p-2.5 sm:p-4 flex flex-col hover:shadow-md transition-shadow relative overflow-hidden w-full'},
              h('div', {className:`absolute left-0 top-0 bottom-0 w-1 ${isCompleted?'bg-emerald-500':(over&&!isCompleted)?'bg-red-500':'bg-blue-500'}`}),
              
              h('div', {className: 'flex justify-between items-start mb-2 sm:mb-4 gap-2 pl-1.5 sm:pl-3'},
                h('h3', {className: 'font-bold text-gray-900 text-[12px] sm:text-[15px] leading-snug line-clamp-2'}, t.title, h(AttachmentBadge,{list:t.attachments})),
                h('span', {className: `whitespace-nowrap text-[8px] sm:text-[11px] px-1.5 py-0.5 sm:py-1 rounded font-bold tracking-wide shrink-0 ${statusConfig.cls}`}, statusConfig.label)
              ),

              h('div', {className: 'w-full pl-1.5 sm:pl-3 mt-auto mb-2.5 sm:mb-4'},
                h('div', {className: 'grid grid-cols-3 items-center w-full text-[9px] sm:text-[11px] gap-1'},
                  
                  // NÚT TẮT LẶP LẠI ĐƯỢC CHUYỂN VÀO ĐÂY (NẰM CẠNH TAG LẶP LẠI)
                  h('div', {className: 'text-left overflow-hidden flex items-center gap-0.5 sm:gap-1'},
                    t.recurrence_type !== RECUR.NONE ? h('span', {className: 'font-bold px-1 py-0.5 bg-yellow-50 text-yellow-600 rounded border border-yellow-200 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0'}, '🔁', RECUR_CFG[t.recurrence_type]) : h('span', null),
                    (!t.recurrence_parent_id && t.recurrence_type !== RECUR.NONE && hasPerm(currentUser, 'edit_recurrence')) && h('button', {
                      onClick: (e) => { 
                        e.stopPropagation(); 
                        if(confirm('Bạn muốn tắt tính năng lặp lại cho công việc này?')) {
                          onUpdate(t.id, {recurrence_type: RECUR.NONE});
                        }
                      },
                      className: 'bg-red-100 text-red-600 border border-red-200 px-1 py-0.5 rounded font-bold hover:bg-red-200 transition-colors shrink-0 text-[8px] sm:text-[9px]',
                      title: 'Tắt tự động sinh việc'
                    }, '⏹ Tắt')
                  ),

                  h('div', {className: 'text-center overflow-hidden whitespace-nowrap'}, t.due_date ? h('span', {className: 'font-semibold text-gray-600'}, '🕒', fmtDateStr(t.due_date)) : h('span', {className: 'text-gray-400'}, '—')),
                  h('div', {className: 'text-right overflow-hidden whitespace-nowrap flex justify-end'}, h(CompactWarning, {due_date: t.due_date, status: t.status, completed_date: t.completed_date}))
                )
              ),

              // THANH NÚT BẤM (Đã bỏ nút Tắt khỏi đây)
              h('div', {className: 'pt-2 sm:pt-3 border-t border-gray-100 flex justify-between gap-1 w-full pl-1 sm:pl-3'},
                hasPerm(currentUser,'remind_task') && !isCompleted && h('button', {onClick: () => onRemind(t), className: 'flex-1 px-0 bg-blue-600 text-white py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-blue-700 flex items-center justify-center gap-0.5 transition-colors shadow-sm'}, h(IconBell), 'Nhắc'),
                h('button', {onClick: () => onDetail(t), className: 'flex-1 px-0 bg-gray-100 text-gray-700 py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-gray-200 flex items-center justify-center gap-0.5 transition-colors'}, h(IconEye), 'Xem'),
                tPerm.edit && (!isCompleted || isAdmin) && h('button', {onClick: () => onEdit(t), className: 'flex-1 px-0 border border-gray-200 text-gray-700 py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-gray-50 flex items-center justify-center gap-0.5 transition-colors'}, h(IconEdit), 'Sửa'),
                hasPerm(currentUser,'change_status') && !isCompleted && h('button', {onClick: () => quickStatus(t, STATUS.COMPLETED), className: 'flex-1 px-0 bg-emerald-500 text-white py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-emerald-600 flex items-center justify-center gap-0.5 transition-colors shadow-sm'}, h(IconCheck), 'Xong'),
                hasPerm(currentUser,'cancel_task') && t.status !== STATUS.CANCELLED && h('button', {onClick: () => quickStatus(t, STATUS.CANCELLED), className: 'flex-1 px-0 bg-yellow-100 text-yellow-700 py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-yellow-200 flex items-center justify-center gap-0.5 transition-colors shadow-sm'}, h(IconX), 'Hủy'),
                canDelete && h('button', {onClick: (e) => { e.stopPropagation(); onDelete(t); }, className: 'flex-1 px-0 bg-red-100 text-red-600 py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-red-200 flex items-center justify-center gap-0.5 transition-colors shadow-sm'}, h(IconTrash), 'Xóa'),
                isAdmin && isCompleted && h('button', {onClick: () => quickStatus(t, STATUS.IN_PROGRESS), className: 'flex-1 px-0 bg-blue-50 text-blue-600 border border-blue-200 py-1 sm:py-2 rounded-lg text-[9px] sm:text-[11px] font-bold hover:bg-blue-100 flex items-center justify-center gap-0.5 transition-colors'}, h(IconUndo), 'Làm lại')
              )
            )
          })
        )
      )
    }

    // ============================================================
    // TASK MODAL 
    // ============================================================
    function TaskModal({task, users, currentUser, onSave, onClose}) {
      const isEdit = !!task; const isAdmin = currentUser.role === ROLE.ADMIN
      const canEditDueDate = hasPerm(currentUser,'edit_due_date');
      const canChangeAssignee = hasPerm(currentUser,'change_assignee');
      const canEditRecurrence = hasPerm(currentUser,'edit_recurrence');
      
      const [f, setF] = useState({ title: task?.title||'', description: task?.description||'', label: task?.label||'', assignee_id: task?.assignee_id||'', due_date: toLocalInput(task?.due_date), recurrence_type: task?.recurrence_type||RECUR.NONE, status: task?.status||STATUS.IN_PROGRESS, attachments: task?.attachments||[] })
      const [busy, setBusy] = useState(false); const set = (k,v) => setF(p=>({...p,[k]:v}))
      const initialFiles = useRef(task?.attachments||[])   // mốc so sánh để dọn file thừa khi bấm Hủy

      async function submit(e) {
        e.preventDefault(); setBusy(true)
        try {
          await onSave({...f, due_date: f.due_date ? new Date(f.due_date).toISOString() : null})
          // Lưu xong mới xoá file cũ đã bị gỡ khỏi form (xoá sớm hơn mà người dùng bấm Hủy
          // hoặc lưu lỗi thì DB vẫn trỏ tới file đã mất → link hỏng).
          deleteRemoved(initialFiles.current, f.attachments)
          onClose()
        } catch(e) { alert(e.message) } finally { setBusy(false) }
      }

      // File đã upload ngay lúc chọn, nên bấm Hủy phải xoá lại những file vừa thêm.
      function cancel() { deleteRemoved(f.attachments, initialFiles.current); onClose() }

      return h(Modal,{title:isEdit?'Chỉnh sửa công việc':'Tạo việc mới',onClose:cancel,wide:true},
        h('form',{onSubmit:submit},
          h(Field,{label:'Tiêu đề',required:true}, h('input',{className:inp,value:f.title,onChange:e=>set('title',e.target.value),placeholder:'Tên việc...',required:true,autoFocus:true})),
          h(Field,{label:'Mô tả'}, h('textarea',{className:inp+' resize-none',rows:2,value:f.description,onChange:e=>set('description',e.target.value),placeholder:'Chi tiết...'})),
          h(Field,{label:'Đính kèm'}, h(AttachmentInput,{value:f.attachments,onChange:up=>setF(p=>({...p,attachments:up(p.attachments||[])})),folder:'tasks',userId:currentUser.id,protectedPaths:collectPaths(initialFiles.current)})),
          h('div',{className:'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'},
            h(Field,{label:'Người thực hiện' + (!canChangeAssignee && isEdit ? ' 🔒' : ''),required:true}, h('select',{className:sel + (!canChangeAssignee && isEdit ? ' bg-gray-100 cursor-not-allowed' : ''),value:f.assignee_id,onChange:e=>set('assignee_id',e.target.value),required:true,disabled:(!canChangeAssignee && isEdit)}, h('option',{value:''},'-- Chọn --'), users.map(u=>h('option',{key:u.id,value:u.id},u.name)))),
            h(Field,{label:'Hạn chót' + (!canEditDueDate && isEdit ? ' 🔒' : '')}, h('input',{type:'datetime-local',className:inp + (!canEditDueDate && isEdit ? ' bg-gray-100 cursor-not-allowed' : ''),value:f.due_date,onChange:e=>set('due_date',e.target.value),disabled:!canEditDueDate && isEdit})),
            h(Field,{label:'Nhãn'}, h('input',{className:inp,value:f.label,onChange:e=>set('label',e.target.value),placeholder:'Bảo hành, KH...'})),
            h(Field,{label:'Lặp lại' + (!canEditRecurrence && isEdit ? ' 🔒' : '')}, h('select',{className:sel + (!canEditRecurrence && isEdit ? ' bg-gray-100 cursor-not-allowed' : ''),value:f.recurrence_type,onChange:e=>set('recurrence_type',e.target.value),disabled:!canEditRecurrence && isEdit}, Object.entries(RECUR_CFG).map(([k,v])=>h('option',{key:k,value:k},v)))),
          ),
          isEdit && h('div',{className:'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1'}, h(Field,{label:'Trạng thái'}, h('select',{className:sel,value:f.status,onChange:e=>set('status',e.target.value)}, Object.entries(STATUS_CFG).map(([k,v])=>h('option',{key:k,value:k},v.label))))),
          h('div',{className:'flex justify-end gap-2 pt-3 mt-3 border-t border-gray-100'}, h('button',{type:'button',onClick:cancel,className:btn.secondary+' px-3 py-1.5 text-xs'},'Hủy'), h('button',{type:'submit',disabled:busy,className:btn.primary+' px-3 py-1.5 text-xs'},busy?'...':isEdit?'Lưu':'Tạo'))
        )
      )
    }

    // ============================================================
    // TASK DETAIL PANEL
    // ============================================================
    function TaskDetail({task, currentUser, onUpdate, onAddUpdate, onDelete, onRemind, onClose, onOpenEdit}) {
      const [comment, setComment] = useState(''); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false); const isAdmin  = currentUser.role === ROLE.ADMIN;
      const tPerm = getTabPerm(currentUser, 'tasks', 'tasks');
      const canEdit = tPerm.edit;
      const canDelete = tPerm.delete;
      const canStatus = hasPerm(currentUser,'change_status');
      const canUpdate = hasPerm(currentUser,'add_update');
      const canCancel = hasPerm(currentUser,'cancel_task');

      // File của ô tiến độ được upload ngay lúc chọn. Nếu người dùng chọn ảnh rồi đóng panel
      // mà không bấm Gửi thì file thành rác vĩnh viễn — không row nào trỏ tới để dọn về sau.
      // Form tạo việc có nút Hủy lo việc này; ô tiến độ thì không, nên dọn lúc panel đóng.
      // Phải khai báo TRƯỚC `if (!task) return null` — hook không được gọi sau early return.
      const filesRef = useRef([]); filesRef.current = files;
      const sentRef = useRef([]);   // file đã gửi đi -> đã nằm trong DB, KHÔNG được xoá
      useEffect(() => () => { deleteRemoved(filesRef.current, sentRef.current) }, [])

      if (!task) return null;
      const isCompleted = task.status===STATUS.COMPLETED;
      const isActive = !isCompleted && task.status!==STATUS.CANCELLED;

      // Gửi được khi chỉ có file mà không có chữ — đính kèm ảnh là đã nói lên điều cần nói.
      async function submitComment(e) {
        e.preventDefault(); if (!comment.trim() && !files.length) return; setBusy(true)
        const sending = files
        sentRef.current = [...sentRef.current, ...sending]   // đánh dấu trước khi await, phòng panel đóng giữa chừng
        try { await onAddUpdate(task.id, comment.trim(), sending); setComment(''); setFiles([]) } finally { setBusy(false) }
      }
      function quickStatus(s) { 
          const upd = {status:s}; 
          if (s===STATUS.COMPLETED || s===STATUS.CANCELLED) upd.completed_date=new Date().toISOString(); 
          if (s===STATUS.IN_PROGRESS && isCompleted) upd.completed_date=null; 
          onUpdate(task.id, upd) 
      }

      const completionInfo = isCompleted ? getDetailedCompletionText(task.due_date, task.completed_date) : null;

      return h(Fragment,null,
        h('div',{className:'fixed inset-0 bg-black/40 z-40 backdrop-blur-sm',onClick:onClose}),
        h('div',{className:'fixed right-0 top-0 bottom-0 w-full max-w-[400px] bg-white shadow-2xl z-50 flex flex-col slide-in'},
          h('div',{className:'px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-white sticky top-0 z-10'},
            h('button',{onClick:onClose,className:'w-7 h-7 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-full text-lg'},'←'),
            h('div',{className:'flex-1 min-w-0'}, h('div',{className:'text-[10px] font-bold text-gray-400 font-mono'},task.id), h('h3',{className:'font-bold text-gray-900 truncate text-sm leading-snug'},task.title)),
            canEdit && (!isCompleted || isAdmin) && h('button',{onClick:()=>onOpenEdit(task),className:btn.ghost+' text-blue-600 px-2 py-1 text-[11px]'},'Sửa'),
            canDelete && h('button',{onClick:()=>onDelete(task),className:btn.ghost+' text-red-500 px-2 py-1 text-[11px] flex items-center gap-1'}, h(IconTrash), 'Xóa')
          ),
          h('div',{className:'flex-1 overflow-y-auto p-4 space-y-4 hide-scroll'},
            h('div',{className:'flex flex-wrap items-center gap-1.5'},
              h(StatusBadge,{status:task.status}),
              canStatus && h(Fragment,null,
                isActive && h('button',{onClick:()=>quickStatus(STATUS.COMPLETED),className:'text-[10px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-bold'},'✓ Xong'),
                canCancel && task.status !== STATUS.CANCELLED && h('button',{onClick:()=>quickStatus(STATUS.CANCELLED),className:'text-[10px] px-2 py-1 bg-yellow-50 text-yellow-700 rounded font-bold'},'✕ Hủy')
              ),
              isAdmin && isCompleted && h('button',{onClick:()=>quickStatus(STATUS.IN_PROGRESS),className:'text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded font-bold flex items-center gap-1'}, h(IconUndo), 'Làm lại')
            ),

            isCompleted && h('div', {className: `rounded-xl p-3 border mt-2 ${completionInfo?.isLate ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`},
              h('div', {className: `text-[9px] font-bold mb-1 uppercase ${completionInfo?.isLate ? 'text-red-500' : 'text-emerald-500'}`}, 'THÔNG TIN HOÀN THÀNH'),
              h('div', {className: 'text-xs text-gray-800 font-medium mb-1'}, `Lúc: ${fmtDT(task.completed_date || task.due_date)}`),
              h('div', {className: `text-xs font-bold ${completionInfo?.color}`}, completionInfo?.text)
            ),

            h('div',{className:'grid grid-cols-2 gap-2'},
              h('div',{className:'bg-gray-50 rounded-xl p-3'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1'},'NGƯỜI THỰC HIỆN'), h('div',{className:'flex items-center gap-1.5'}, h(Avatar,{user:task.assignee,size:'sm'}), h('span',{className:'text-xs font-bold text-gray-800 truncate'},task.assignee?.name||'—'))),
              h('div',{className:'bg-gray-50 rounded-xl p-3'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1'},'HẠN CHÓT'), h(CompactWarning,{due_date:task.due_date,status:task.status, completed_date:task.completed_date})),
              task.label && h('div',{className:'bg-gray-50 rounded-xl p-3'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1'},'NHÃN'), h('span',{className:'text-xs font-bold text-gray-700'},task.label)),
              
              task.recurrence_type!==RECUR.NONE && h('div',{className:'bg-yellow-50 rounded-xl p-3'}, 
                h('div',{className:'flex justify-between items-start mb-1'},
                  h('div',{className:'text-[9px] font-bold text-yellow-500'},'LẶP LẠI'),
                  (!task.recurrence_parent_id && hasPerm(currentUser, 'edit_recurrence')) && h('button', {
                    onClick: () => { if(confirm('Bạn muốn tắt tính năng lặp lại? Công việc gốc vẫn được giữ nguyên.')) onUpdate(task.id, {recurrence_type: RECUR.NONE}) }, 
                    className: 'text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold hover:bg-red-200 transition-colors'
                  }, '⏹ Tắt')
                ),
                h('span',{className:'text-xs font-bold text-yellow-700'},RECUR_CFG[task.recurrence_type]||'—')
              ),
              
              task.description && h('div',{className:'bg-gray-50 rounded-xl p-3 col-span-2'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1'},'MÔ TẢ'), h('p',{className:'text-xs text-gray-700 leading-relaxed font-medium'},task.description)),

              (task.attachments||[]).length>0 && h('div',{className:'bg-gray-50 rounded-xl p-3 col-span-2'}, h('div',{className:'text-[9px] font-bold text-gray-400 mb-1.5'},`ĐÍNH KÈM (${task.attachments.length})`), h(AttachmentList,{list:task.attachments}))
            ),
            hasPerm(currentUser,'remind_task') && isActive && h('button',{onClick:()=>onRemind(task),className:'w-full py-2 border border-yellow-200 bg-yellow-50 text-yellow-700 rounded-xl text-xs font-bold hover:bg-yellow-100 flex items-center justify-center gap-1.5'}, h(IconBell, null), task.last_reminded_date ? `Đã nhắc: ${fmtDT(task.last_reminded_date)}` : 'Gửi nhắc việc'),
            h('div',null,
              h('div',{className:'flex items-center justify-between mb-3 border-t border-gray-100 pt-3'}, h('h4',{className:'text-xs font-bold text-gray-800'},'CẬP NHẬT'), h('span',{className:'text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded'},(task.progressUpdates||[]).length)),
              (task.progressUpdates||[]).length===0 ? h('p',{className:'text-[11px] text-gray-400 italic'},'Chưa có cập nhật.') : h('div',{className:'space-y-2'}, [...(task.progressUpdates||[])].reverse().map((u,i)=> h('div',{key:u.id||i,className:'flex gap-2'}, h(Avatar,{user:u.updatedBy,size:'sm'}), h('div',{className:'flex-1 bg-gray-50 rounded-xl p-2.5'}, h('div',{className:'flex justify-between gap-2 mb-1'}, h('span',{className:'font-bold text-gray-800 text-[10px]'},u.updatedBy?.name||'?'), h('span',{className:'text-gray-400 text-[9px] font-medium'},fmtDT(u.time))), u.content && h('p',{className:'text-[11px] text-gray-700 font-medium'},u.content), (u.attachments||[]).length>0 && h('div',{className:'mt-1.5'}, h(AttachmentList,{list:u.attachments,size:56})))))),
              (canUpdate && (!isCompleted || isAdmin)) ? h('form',{onSubmit:submitComment,className:'mt-3 space-y-1.5'},
                h('div',{className:'flex gap-1.5'}, h('input',{className:inp+' flex-1 rounded-xl px-3 py-1.5 text-[11px] bg-gray-50',value:comment,onChange:e=>setComment(e.target.value),placeholder:'Viết cập nhật...'}), h('button',{type:'submit',disabled:busy||(!comment.trim()&&!files.length),className:btn.primary+' rounded-xl px-3 py-1.5 text-[11px]'},busy?'...':'Gửi')),
                h(AttachmentInput,{value:files,onChange:setFiles,folder:'progress',userId:currentUser.id})
              ) : !canUpdate ? null : h('p', {className: 'text-[10px] text-red-500 italic mt-2'}, 'Việc đã hoàn thành. Chỉ Admin mới có thể cập nhật thêm.')
            )
          )
        )
      )
    }

    // ============================================================
    // MAIN APP COMPONENT
    // ============================================================
    function App() {
      const navigate = useNavigate();
      const { user: authUser, logout: authLogout } = useAuth();
      const [me, setMe] = useState(null)
      const [tasks, setTasks] = useState([])
      const [users, setUsers] = useState([])
      const [view, setView] = useState('menu') 
      const [busy, setBusy] = useState(false)
      const [assFilter, setAssFilter] = useState('ALL') 
      const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
      const [taskModal, setTaskModal] = useState(null)
      const [detailTask, setDetailTask] = useState(null)
      const [userModal, setUserModal] = useState(null)

      const [pendingOrders, setPendingOrders] = useState([])

      const {list:toasts, show:toast} = useToast()
      const isAdmin = me?.role===ROLE.ADMIN

      // Auto-login from AuthContext (thay thế LoginScreen)
      useEffect(() => {
        if (authUser && !me) {
          const u = {...authUser, role: authUser.role ? authUser.role.toUpperCase() : 'AGENT'};
          setMe(u);
          bootstrap(u);
        }
      }, [authUser])

      useEffect(() => { if (me && !canSeeTab(me,'tasks','dashboard') && view === 'dashboard') { setView('tasks'); setAssFilter(me.id) } }, [me, view])

      const lastCheckDayRef = useRef(new Date().toISOString().split('T')[0])
      useEffect(() => {
        if (!me) return
        const interval = setInterval(async () => {
          const today = new Date().toISOString().split('T')[0]
          const isNewDay = today !== lastCheckDayRef.current
          lastCheckDayRef.current = today
          try {
            const {tasks:t, users:u, pendingOrders:po} = await loadAll()
            setPendingOrders(po)
            const newClones = await checkRecurring(t)
            if (newClones.length > 0 || isNewDay) {
              const um = new Map(u.map(x=>[x.id,x]))
              const all = [...newClones.map(c=>({...c, assignee:um.get(c.assignee_id)||null, progressUpdates:[]})), ...t]
                .map(task=>({...task, assignee:um.get(task.assignee_id)||task.assignee||null}))
              setUsers(u)
              setTasks(all)
              if (newClones.length > 0) toast(`Tự động tạo ${newClones.length} việc lặp lại`)
            }
          } catch(_) {}
        }, 5 * 60 * 1000) 
        return () => clearInterval(interval)
      }, [me])

      const TASK_CACHE_KEY = 'task_app_data';

      async function bootstrap(user, forceRefresh = false) {
        // 🚀 Cache hit: load tức thì, bỏ qua cả checkRecurring (rất chậm)
        if (!forceRefresh) {
          const cached = dataCache.get(TASK_CACHE_KEY);
          if (cached) {
            setUsers(cached.users);
            setTasks(cached.tasks);
            setPendingOrders(cached.pendingOrders);
            return;
          }
        }

        setBusy(true)
        try {
          const {tasks:t, users:u, pendingOrders:po} = await loadAll()
          setUsers(u)
          setPendingOrders(po)
          const newClones = await checkRecurring(t)
          const um = new Map(u.map(x=>[x.id,x]))
          const all = [...newClones.map(c=>({...c, assignee:um.get(c.assignee_id)||null, progressUpdates:[]})), ...t].map(task=>({...task, assignee:um.get(task.assignee_id)||task.assignee||null}))
          setTasks(all)
          // Lưu cache sau khi fetch xong
          dataCache.set(TASK_CACHE_KEY, { users: u, tasks: all, pendingOrders: po });
        } catch(e) { toast('Lỗi: '+e.message,'error') } finally { setBusy(false) }
      }

      // handleLogin giữ lại cho tương thích nhưng không dùng LoginScreen nữa
      function handleLogin(user) { setMe(user); bootstrap(user) }
      
      async function handleCreateTask(form) { const raw = await apiCreateTask(form, me.id); setTasks(ts=>[{...raw,assignee:users.find(u=>u.id===raw.assignee_id)||null,progressUpdates:[]},...ts]); toast('Đã tạo việc!') }
      async function handleUpdateTask(id, data) {
        const prev = tasks.find(t=>t.id===id); const optimistic = {...prev,...data, assignee:users.find(u=>u.id===(data.assignee_id||prev.assignee_id))||prev.assignee}
        setTasks(ts=>ts.map(t=>t.id===id?optimistic:t)); if (detailTask?.id===id) setDetailTask(d=>({...d,...data,assignee:optimistic.assignee}))
        try { await apiUpdateTask(id,{...data,updated_by:me.id}); toast('Đã cập nhật!') } catch(e) { setTasks(ts=>ts.map(t=>t.id===id?prev:t)); toast('Lỗi: '+e.message,'error') }
      }
      
      async function handleDeleteTask(task) { 
        if (!confirm(`Xóa vĩnh viễn việc "${task.title}"?`)) return; 
        try { 
          await apiDeleteTask(task.id); 
          setTasks(ts=>ts.filter(t=>t.id!==task.id)); 
          if (detailTask?.id===task.id) setDetailTask(null); 
          toast('Đã xóa thành công!'); 
        } catch(e) { 
          toast('Lỗi khi xóa: '+e.message,'error'); 
        } 
      }
      
      async function handleBulkDelete() {
        if (!confirm('Xóa vĩnh viễn TOÀN BỘ công việc đang ở trạng thái ĐÃ HỦY? Hành động này sẽ dọn dẹp Database và không thể khôi phục.')) return;
        const tasksToDelete = tasks.filter(t => t.status === STATUS.CANCELLED);
        if (tasksToDelete.length === 0) { toast('Không có công việc nào đã hủy để dọn dẹp.', 'error'); return; }
        setBusy(true);
        try {
          const ids = tasksToDelete.map(t => t.id);
          // 0. Dọn file đính kèm trong Storage trước khi mất row (mất row là mất đường tìm path)
          await cleanupTaskFiles(ids);
          // 1. Xóa tiến độ
          await db.from('tien_do').delete().in('task_id', ids);
          // 2. Ngắt liên kết các task con
          for (const id of ids) {
            await db.from('cong_viec_duoc_giao').update({ recurrence_parent_id: null }).eq('recurrence_parent_id', id);
          }
          // 3. Xóa task
          const { error } = await db.from('cong_viec_duoc_giao').delete().in('id', ids);
          if (error) throw error;
          
          setTasks(ts => ts.filter(t => t.status !== STATUS.CANCELLED));
          toast(`Đã xóa sạch ${ids.length} việc đã hủy khỏi database!`);
        } catch(e) { toast('Lỗi xóa: ' + e.message, 'error'); } 
        finally { setBusy(false); }
      }

      async function handleAddUpdate(taskId, comment, attachments) {
        const entry = {...await apiAddUpdate(taskId, comment, me.id, attachments), updatedBy:me}; setTasks(ts=>ts.map(t=>t.id===taskId?{...t,progressUpdates:[...(t.progressUpdates||[]),entry]}:t)); if (detailTask?.id===taskId) setDetailTask(d=>({...d,progressUpdates:[...(d.progressUpdates||[]),entry]})); toast('Đã cập nhật!')
      }
      
      async function handleRemind(taskArg) {
        const task = tasks.find(t => t.id === taskArg.id) || taskArg;
        const upd = {last_reminded_date:new Date().toISOString()};
        await handleUpdateTask(task.id,upd);
        const assignee = users.find(u=>u.id===task.assignee_id);
        const remindPayload = {
          type: 'reminder',
          timestamp: upd.last_reminded_date,
          sender: { id: me.id, name: me.name, role: me.role },
          assignee: { id: assignee?.id||null, name: assignee?.name||'Chưa giao', email: assignee?.email||null },
          task: { id: task.id, title: task.title, status: task.status, priority: task.priority, due_date: task.due_date, due_at_vn: fmtDueVN(task.due_date), description: task.description }
        };
        try { await fetch('https://thegioilocnuoc.site/webhook/47cc5412-40b2-4747-af7f-8d7090cb40c2', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(remindPayload)}); } catch(_) {}
        await callWebhook({type:'reminder',task:{...task,...upd,due_at_vn:fmtDueVN(task.due_date)},sender:me});
        toast('Đã nhắc việc!');
      }

      async function handleSaveUser(form, isEdit) {
        if (isEdit) {
          const originalId = form.originalId;
          const idChanged = form.id !== originalId;
          const data = {name:form.name, role:form.role, avatar:form.avatar, permissions:form.permissions||null};

          if (idChanged) {
            const {data:oldRow, error:fetchErr} = await db.from('nhan_vien').select('*').eq('id', originalId).single();
            if (fetchErr) throw new Error('Không tìm thấy NV: ' + fetchErr.message);
            const { password:_omit, ...oldNoPw } = oldRow;          // không mang cột password (sẽ bị bỏ)
            const newUser = {...oldNoPw, ...data, id: form.id};
            const {error:insErr} = await db.from('nhan_vien').insert(newUser);
            if (insErr) throw new Error('Lỗi tạo ID: ' + insErr.message);
            const {error:cpErr} = await db.rpc('sao_chep_secret', { p_from: originalId, p_to: form.id });
            if (cpErr) throw new Error('Lỗi chuyển mật khẩu: ' + cpErr.message);
            if (form.password) {
              const {error:pErr} = await db.rpc('dat_mat_khau', { p_id: form.id, p_pw: form.password });
              if (pErr) throw new Error('Lỗi đặt mật khẩu: ' + pErr.message);
            }
            await db.from('cong_viec_duoc_giao').update({assignee_id: form.id}).eq('assignee_id', originalId);
            await db.from('cong_viec_duoc_giao').update({updated_by: form.id}).eq('updated_by', originalId);
            await db.from('tien_do').update({updated_by_id: form.id}).eq('updated_by_id', originalId);
            const {error:delErr} = await db.from('nhan_vien').delete().eq('id', originalId);
            if (delErr) throw new Error('Lỗi xóa ID cũ: ' + delErr.message);
            setUsers(us => us.map(u => u.id === originalId ? {...u, ...data, id: form.id} : u));
            setTasks(ts => ts.map(t => {
              let updated = {...t};
              if (t.assignee_id === originalId) { updated.assignee_id = form.id; updated.assignee = {...t.assignee,...data,id:form.id}; }
              return updated;
            }));
            if (me.id === originalId) setMe(prev => ({...prev, ...data, id: form.id}));
          } else {
            await apiUpdateUser(originalId, data);
            if (form.password) {
              const {error:pErr} = await db.rpc('dat_mat_khau', { p_id: originalId, p_pw: form.password });
              if (pErr) throw new Error('Lỗi đổi mật khẩu: ' + pErr.message);
            }
            setUsers(us => us.map(u => u.id === originalId ? {...u,...data} : u));
            setTasks(ts => ts.map(t => t.assignee_id === originalId ? {...t, assignee:{...t.assignee,...data}} : t));
            if (me.id === originalId) setMe(prev => ({...prev, ...data}));
          }
          toast('Đã cập nhật nhân viên!');
        } else {
          await apiCreateUser({id:form.id, name:form.name, password:form.password, role:form.role, avatar:form.avatar, permissions:form.permissions||null});
          setUsers(us => [...us, {id:form.id, name:form.name, role:form.role, avatar:form.avatar, permissions:form.permissions||null}]);
          toast(`Đã thêm nhân viên ${form.name}!`);
        }
      }

      function handleUserClick(userId) { setView('tasks'); setAssFilter(userId); setIsMobileMenuOpen(false); }
      function navTo(v) { setView(v); if(v==='tasks'&&isAdmin) setAssFilter('ALL'); setIsMobileMenuOpen(false); }

      if (!me) return h('div',{className:'flex items-center justify-center h-64'}, h('div',{className:'text-blue-500 font-bold animate-pulse text-sm'},'Đang tải...'))

      const tPerm = getTabPerm(me, 'tasks', 'tasks'); // {view,create,edit,delete}

      // Build tabs array based on permissions
      const tabItems = [
        canSeeTab(me,'tasks','dashboard') && h(TabButton, {key:'dashboard', active: view==='dashboard', onClick: ()=>navTo('dashboard'), label:'Tổng quan', color:'#2563eb'}),
        canSeeTab(me,'tasks','tasks') && h(TabButton, {key:'tasks', active: view==='tasks', onClick: ()=>navTo('tasks'), label:'Công việc', color:'#2563eb'}),
        canSeeTab(me,'tasks','work_report') && h(TabButton, {key:'work_report', active: view==='work_report', onClick: ()=>navTo('work_report'), label:'Báo Cáo', color:'#2563eb'}),
      ].filter(Boolean)

      return h(ModuleShell, {
        title: 'Công Việc',
        icon: ClipboardCheck,
        color: '#2563eb',
        loading: busy,
        onRefresh: ()=>{ dataCache.invalidate(TASK_CACHE_KEY); bootstrap(me,true); },
        onBack: view !== 'menu' ? () => setView('menu') : undefined,
        tabs: view !== 'menu' ? h(Fragment, null, ...tabItems) : null,
      },
        h(ToastList,{list:toasts}),

        h('main',{style:{flex:1,width:'100%',overflowX:'hidden',padding:view==='menu'?'1rem 1rem 4rem':'0.75rem 0.75rem 4rem',background:'var(--bg-primary)',minHeight:'calc(100vh - 90px)', display:'flex', flexDirection:'column'}},
          busy ? h('div',{className:'flex items-center justify-center h-64'}, h('div',{className:'text-blue-500 font-bold animate-pulse text-sm'},'Đang tải...'))
               : view==='menu' ? h('div', {
                   style: {
                     display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', maxWidth: 800, width: '100%', alignSelf: 'center', margin: '0 auto'
                   }
                 },
                   canSeeTab(me,'tasks','dashboard') && h('button', {
                     onClick: () => navTo('dashboard'),
                     style: { background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }
                   },
                     h('div', {style: {width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'}}, h(LayoutDashboard, {size: 24, color: '#fff'})),
                     h('h3', {style: {margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center'}}, 'Tổng quan')
                   ),
                   canSeeTab(me,'tasks','tasks') && h('button', {
                     onClick: () => navTo('tasks'),
                     style: { background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }
                   },
                     h('div', {style: {width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'}}, h(ListTodo, {size: 24, color: '#fff'})),
                     h('h3', {style: {margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center'}}, 'Công việc')
                   ),
                   canSeeTab(me,'tasks','work_report') && h('button', {
                     onClick: () => navTo('work_report'),
                     style: { background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }
                   },
                     h('div', {style: {width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'}}, h(FileBarChart, {size: 24, color: '#fff'})),
                     h('h3', {style: {margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', textAlign: 'center'}}, 'Báo Cáo')
                   )
                 )
               : view==='dashboard'&&canSeeTab(me,'tasks','dashboard') ? h(Dashboard, {tasks, users, currentUser: me, pendingOrders, onUserClick:handleUserClick, onDetail:t=>setDetailTask(t), onAddUser: ()=>setUserModal({}), onEditUser: u=>setUserModal({user:u})})
               : view==='work_report' && canSeeTab(me,'tasks','work_report') ? h(WorkReport)
               : view==='tasks' && assFilter !== 'ALL' ? h(UserTaskBoard, { user: users.find(u=>u.id===assFilter) || me, tasks, currentUser: me, onBack: canSeeTab(me,'tasks','dashboard') ? () => { setView('dashboard'); setAssFilter('ALL'); } : null, onDetail: t=>setDetailTask(t), onEdit: t=>setTaskModal({task:t}), onUpdate: handleUpdateTask, onRemind: handleRemind, onDelete: handleDeleteTask })
               : view==='tasks' && assFilter === 'ALL' ? h('div',null, h('div',{className:'flex items-center justify-between mb-4 max-w-[1400px] mx-auto w-full'}, h('h1',{className:'text-sm sm:text-xl font-bold text-gray-900'}, 'Tất cả công việc'), h('button',{onClick:()=>{dataCache.invalidate(TASK_CACHE_KEY);bootstrap(me,true);},className:btn.secondary+' px-2 py-1 text-[10px] sm:text-xs'},'↻ Làm mới')), h(TaskTable,{ tasks, users, currentUser:me, assFilter, setAssFilter, onEdit: t=>setTaskModal({task:t}), onDetail:t=>setDetailTask(t), onDelete:handleDeleteTask, onBulkDelete:handleBulkDelete }))
               : null
        ),

        // ── Bottom Action Bar (fixed) ──────────────────────────────────
        !busy && h('div', {
          style: {
            position: 'fixed', bottom: 0, right: 0,
            left: 0,
            zIndex: 29,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            padding: '0.4rem 0.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            gap: '0.4rem',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
          }
        },
          // Cập nhật CLSP
          h('button', {
            onClick: () => navigate('/quality?action=new'),
            style: {
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#dc2626',
              color: '#fff', border: 'none',
              borderRadius: '8px', padding: '0.45rem 0.7rem',
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(220,38,38,0.35)',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            },
            onMouseEnter: e => { e.currentTarget.style.opacity='0.9'; e.currentTarget.style.transform='translateY(-1px)'; },
            onMouseLeave: e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.transform='translateY(0)'; },
          },
            h('svg', {style:{width:'15px',height:'15px',flexShrink:0}, fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2.5}, h('path', {strokeLinecap:'round', strokeLinejoin:'round', d:'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'})),
            'Cập nhật CLSP'
          ),

          // Tạo việc mới
          tPerm.create && h('button', {
            onClick: () => setTaskModal({}),
            style: {
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#2563eb',
              color: '#fff', border: 'none',
              borderRadius: '8px', padding: '0.45rem 0.7rem',
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(37,99,235,0.4)',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            },
            onMouseEnter: e => { e.currentTarget.style.background='#1d4ed8'; e.currentTarget.style.transform='translateY(-1px)'; },
            onMouseLeave: e => { e.currentTarget.style.background='#2563eb'; e.currentTarget.style.transform='translateY(0)'; },
          },
            h('svg', {style:{width:'15px',height:'15px',flexShrink:0}, fill:'none', stroke:'currentColor', viewBox:'0 0 24 24', strokeWidth:2.5}, h('path', {strokeLinecap:'round', strokeLinejoin:'round', d:'M12 4v16m8-8H4'})),
            '+ Việc mới'
          ),
        ),

        taskModal && h(TaskModal,{ task: taskModal.task||null, users, currentUser:me, onSave: taskModal.task ? d=>handleUpdateTask(taskModal.task.id,d) : handleCreateTask, onClose: ()=>setTaskModal(null) }),
        detailTask && h(TaskDetail,{ task: tasks.find(t=>t.id===detailTask.id)||detailTask, currentUser: me, onUpdate: handleUpdateTask, onAddUpdate: handleAddUpdate, onDelete: t=>{setDetailTask(null);handleDeleteTask(t)}, onRemind: handleRemind, onClose: ()=>setDetailTask(null), onOpenEdit: t=>{setDetailTask(null);setTaskModal({task:t})} }),
        userModal && h(UserModal,{ user: userModal.user||null, onSave: handleSaveUser, onClose: ()=>setUserModal(null) })
      )
    }
export default App;