import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, fetchAllRows } from '../../lib/supabase';
import { useTabPerm } from '../../lib/AuthContext';
import { 
  ShieldAlert, Plus, RefreshCw, AlertTriangle, X, UploadCloud, CheckCircle, Camera, Video,
  Search, Download, FileDown, ChevronRight, Package, Loader2
} from 'lucide-react';
import ModuleShell, { ActionButton } from '../../components/ModuleShell';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

const QualityApp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const p = useTabPerm('quality', 'main');
  // Nút "Lưu ý CLSP" mở modal dùng chung cho cả Thêm mới & Sửa → gộp create|edit.
  const canAddOrEdit = p.create || p.edit;
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState([]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  
  // Form state
  const [form, setForm] = useState({
    product_code: '',
    product_name: '',
    issue_description: '',
    solution_description: '',
    status: 'Chưa xử lý'
  });
  
  // Issue Images
  const [existingIssueImages, setExistingIssueImages] = useState([]);
  const [newIssueFiles, setNewIssueFiles] = useState([]);
  const [newIssuePreviews, setNewIssuePreviews] = useState([]);
  const issueFileInputRef = useRef(null);
  const issuePhotoInputRef = useRef(null);
  const issueVideoInputRef = useRef(null);

  // Solution Images
  const [existingSolutionImages, setExistingSolutionImages] = useState([]);
  const [newSolutionFiles, setNewSolutionFiles] = useState([]);
  const [newSolutionPreviews, setNewSolutionPreviews] = useState([]);
  const solutionFileInputRef = useRef(null);
  const solutionPhotoInputRef = useRef(null);
  const solutionVideoInputRef = useRef(null);

  // Filter
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProductCode, setFilterProductCode] = useState('');

  const [productCodes, setProductCodes] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Product Lookup
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [lookupSearch, setLookupSearch] = useState('');
  const [lookupSelectedCode, setLookupSelectedCode] = useState(null);
  const [lookupShowSuggestions, setLookupShowSuggestions] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCode, setDownloadingCode] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  useEffect(() => {
    fetchData();
    fetchProductCodes();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      resetForm();
      setShowModal(true);
      navigate('/quality', { replace: true });
    }
  }, [location.search, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchAllRows(() => supabase
        .from('chat_luong_san_pham')
        .select('*')
        .order('created_at', { ascending: false }));

      if (error) throw error;
      setIssues(data || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu chất lượng:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductCodes = async () => {
    try {
      let page = 0;
      let allData = [];
      while (true) {
        const { data } = await supabase.from('inventory_items').select('item_code, item_name').range(page * 1000, (page + 1) * 1000 - 1);
        if (data) allData = allData.concat(data);
        if (!data || data.length < 1000) break;
        page++;
      }
      
      const uniqueItems = [];
      const seen = new Set();
      for (const d of allData) {
         if (!seen.has(d.item_code)) {
            seen.add(d.item_code);
            uniqueItems.push({ code: d.item_code, name: d.item_name || '' });
         }
      }
      setProductCodes(uniqueItems);
    } catch (e) {
      console.error(e);
    }
  };

  const handleIssueImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setNewIssueFiles(prev => [...prev, ...files]);
      const previews = files.map(file => URL.createObjectURL(file));
      setNewIssuePreviews(prev => [...prev, ...previews]);
    }
  };

  const removeExistingIssueImage = (index) => {
    setExistingIssueImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewIssueFile = (index) => {
    setNewIssueFiles(prev => prev.filter((_, i) => i !== index));
    setNewIssuePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSolutionImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setNewSolutionFiles(prev => [...prev, ...files]);
      const previews = files.map(file => URL.createObjectURL(file));
      setNewSolutionPreviews(prev => [...prev, ...previews]);
    }
  };

  const removeExistingSolutionImage = (index) => {
    setExistingSolutionImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewSolutionFile = (index) => {
    setNewSolutionFiles(prev => prev.filter((_, i) => i !== index));
    setNewSolutionPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_code || !form.issue_description) {
      alert('Vui lòng điền mã sản phẩm và nội dung lỗi!');
      return;
    }
    
    setSubmitting(true);
    try {
      // Upload new issue images
      let uploadedIssueUrls = [];
      for (const file of newIssueFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `issue_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('qc_images')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });
          
        if (!uploadError) {
          const { data } = supabase.storage.from('qc_images').getPublicUrl(fileName);
          uploadedIssueUrls.push(data.publicUrl);
        }
      }
      
      const finalIssueImages = [...existingIssueImages, ...uploadedIssueUrls];
      const imageUrlToSave = finalIssueImages.length > 0 ? JSON.stringify(finalIssueImages) : null;
      
      // Upload new solution images
      let uploadedSolutionUrls = [];
      for (const file of newSolutionFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `sol_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('qc_images')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });
          
        if (!uploadError) {
          const { data } = supabase.storage.from('qc_images').getPublicUrl(fileName);
          uploadedSolutionUrls.push(data.publicUrl);
        }
      }
      
      const finalSolutionImages = [...existingSolutionImages, ...uploadedSolutionUrls];
      
      if (editingIssue) {
        const updatePayload = {
          product_code: form.product_code,
          issue_description: form.issue_description,
          solution_description: form.solution_description,
          status: form.status,
          solution_images: finalSolutionImages,
          image_url: imageUrlToSave
        };
        
        const { error: updateError } = await supabase
          .from('chat_luong_san_pham')
          .update(updatePayload)
          .eq('id', editingIssue);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('chat_luong_san_pham')
          .insert([{
            product_code: form.product_code,
            issue_description: form.issue_description,
            solution_description: form.solution_description,
            status: form.status,
            image_url: imageUrlToSave,
            solution_images: finalSolutionImages
          }]);
        if (insertError) throw insertError;
      }
      
      resetForm();
      setShowModal(false);
      fetchData();
      
    } catch (err) {
      console.error('Lỗi khi lưu dữ liệu:', err);
      alert('Có lỗi xảy ra: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ product_code: '', product_name: '', issue_description: '', solution_description: '', status: 'Chưa xử lý' });
    setExistingIssueImages([]);
    setNewIssueFiles([]);
    setNewIssuePreviews([]);
    setExistingSolutionImages([]);
    setNewSolutionFiles([]);
    setNewSolutionPreviews([]);
    setEditingIssue(null);
  };

  const handleEdit = (issue) => {
    setEditingIssue(issue.id);
    setForm({ 
      product_code: issue.product_code, 
      product_name: productCodes.find(p => p.code === issue.product_code)?.name || '',
      issue_description: issue.issue_description,
      solution_description: issue.solution_description || '',
      status: issue.status || 'Chưa xử lý'
    });
    
    // Parse existing image_url if JSON
    let parsedImages = [];
    if (issue.image_url) {
      if (issue.image_url.startsWith('[')) {
        try { parsedImages = JSON.parse(issue.image_url); } catch(e) { parsedImages = [issue.image_url]; }
      } else {
        parsedImages = [issue.image_url];
      }
    }
    
    setExistingIssueImages(parsedImages);
    setNewIssueFiles([]);
    setNewIssuePreviews([]);
    
    setExistingSolutionImages(issue.solution_images || []);
    setNewSolutionFiles([]);
    setNewSolutionPreviews([]);
    setShowModal(true);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) return;
    try {
      const { error } = await supabase.from('chat_luong_san_pham').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch(err) {
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  const filteredIssues = issues.filter(issue => {
    // Lọc theo trạng thái
    if (filterStatus !== 'all') {
      const issueStatus = issue.status || 'Chưa xử lý';
      if (issueStatus !== filterStatus) return false;
    }
    // Lọc theo mã sản phẩm
    if (filterProductCode) {
      const code = issue.product_code || '';
      if (!code.toLowerCase().includes(filterProductCode.toLowerCase())) return false;
    }
    return true;
  });

  const groupedIssues = filteredIssues.reduce((acc, issue) => {
    const code = issue.product_code || 'Khác';
    if (!acc[code]) acc[code] = [];
    acc[code].push(issue);
    return acc;
  }, {});

  const renderFilterTabs = () => (
    <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', alignItems: 'center', justifyContent: 'flex-start' }}>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterStatus('all')}
          style={{ whiteSpace: 'nowrap', padding: '0.4rem 0.9rem', borderRadius: '20px', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.2s', background: filterStatus === 'all' ? '#1e293b' : '#fff', color: filterStatus === 'all' ? '#fff' : '#64748b' }}
        >Tất cả</button>
        <button
          onClick={() => setFilterStatus('Chưa xử lý')}
          style={{ whiteSpace: 'nowrap', padding: '0.4rem 0.9rem', borderRadius: '20px', border: '1px solid #fdba74', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.2s', background: filterStatus === 'Chưa xử lý' ? '#ea580c' : '#fff', color: filterStatus === 'Chưa xử lý' ? '#fff' : '#ea580c' }}
        >Chưa xử lý</button>
        <button
          onClick={() => setFilterStatus('Đã xử lý')}
          style={{ whiteSpace: 'nowrap', padding: '0.4rem 0.9rem', borderRadius: '20px', border: '1px solid #6ee7b7', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', transition: 'all 0.2s', background: filterStatus === 'Đã xử lý' ? '#10b981' : '#fff', color: filterStatus === 'Đã xử lý' ? '#fff' : '#10b981' }}
        >Đã xử lý</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 160px', minWidth: '140px' }}>
         <input
            type="search"
            placeholder="Tìm mã sản phẩm..."
            value={filterProductCode}
            onChange={(e) => setFilterProductCode(e.target.value)}
            list="filter-product-codes"
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.8rem', width: '100%', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
         />
         <datalist id="filter-product-codes">
           {productCodes.map(item => <option key={item.code} value={item.code} />)}
         </datalist>
      </div>
    </div>
  );

  // === PRODUCT LOOKUP HELPERS ===
  const lookupFilteredCodes = productCodes.filter(c => {
    const q = (lookupSearch || '').toLowerCase();
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  // Issues for selected product in lookup
  const lookupIssues = lookupSelectedCode
    ? issues.filter(i => i.product_code === lookupSelectedCode)
    : [];

  const lookupProductName = lookupSelectedCode
    ? (productCodes.find(p => p.code === lookupSelectedCode)?.name || '')
    : '';

  // Parse image_url helper
  const parseImageUrls = (imageUrl) => {
    if (!imageUrl) return [];
    if (imageUrl.startsWith('[')) {
      try { return JSON.parse(imageUrl); } catch(e) { return [imageUrl]; }
    }
    return [imageUrl];
  };

  // Helper: fetch image and convert to base64 data URI
  const fetchImageAsBase64 = async (url) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch(e) {
      console.warn('Không tải được ảnh:', url, e);
      return null;
    }
  };

  // Download ZIP with HTML report + Excel — generic, works for any product
  const handleDownloadZip = async (targetCode, targetIssues) => {
    const code = targetCode || lookupSelectedCode;
    const issList = targetIssues || lookupIssues;
    const pName = productCodes.find(p => p.code === code)?.name || '';
    if (!code || issList.length === 0) return;
    setDownloading(true);
    setDownloadingCode(code);
    try {
      const zip = new JSZip();

      // ── 1. Build Excel ──
      const excelRows = issList.map((issue, idx) => ({
        'STT': idx + 1,
        'Mã SP': issue.product_code,
        'Tên SP': pName,
        'Vấn đề lỗi': issue.issue_description || '',
        'Đối sách': issue.solution_description || '',
        'Trạng thái': issue.status || 'Chưa xử lý',
        'Ngày tạo': new Date(issue.created_at).toLocaleString('vi-VN'),
      }));
      const ws = XLSX.utils.json_to_sheet(excelRows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 50 }, { wch: 50 }, { wch: 15 }, { wch: 20 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CLSP');
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file(`CLSP_${code}.xlsx`, excelBuffer);

      // ── 2. Build HTML Report with embedded images ──
      const issueDataArr = [];
      for (let i = 0; i < issList.length; i++) {
        const issue = issList[i];
        const issueImgUrls = parseImageUrls(issue.image_url);
        const solImgUrls = issue.solution_images || [];

        const issueImgB64 = [];
        for (const url of issueImgUrls) {
          const b64 = await fetchImageAsBase64(url);
          if (b64) issueImgB64.push({ src: b64, isVideo: !!url.match(/\.(mp4|webm|ogg|mov)$/i) });
        }

        const solImgB64 = [];
        for (const url of solImgUrls) {
          const b64 = await fetchImageAsBase64(url);
          if (b64) solImgB64.push({ src: b64, isVideo: !!url.match(/\.(mp4|webm|ogg|mov)$/i) });
        }

        issueDataArr.push({ issue, issueImgB64, solImgB64 });
      }

      const escHtml = (str) => (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      const today = new Date().toLocaleDateString('vi-VN');
      const totalResolved = issList.filter(i => i.status === 'Đã xử lý').length;
      const totalPending = issList.length - totalResolved;

      let issueBlocks = '';
      issueDataArr.forEach(({ issue, issueImgB64, solImgB64 }, idx) => {
        const isResolved = issue.status === 'Đã xử lý';
        const statusColor = isResolved ? '#059669' : '#ea580c';
        const statusBg = isResolved ? '#dcfce7' : '#ffedd5';
        const statusText = issue.status || 'Chưa xử lý';
        const dateStr = new Date(issue.created_at).toLocaleString('vi-VN');

        let issueImgHtml = '';
        if (issueImgB64.length > 0) {
          issueImgHtml = `<div class="img-grid">${issueImgB64.map(img =>
            img.isVideo
              ? `<video src="${img.src}" class="thumb" controls muted></video>`
              : `<img src="${img.src}" class="thumb" alt="Ảnh lỗi"/>`
          ).join('')}</div>`;
        }

        let solImgHtml = '';
        if (solImgB64.length > 0) {
          solImgHtml = `<div class="img-grid">${solImgB64.map(img =>
            img.isVideo
              ? `<video src="${img.src}" class="thumb" controls muted></video>`
              : `<img src="${img.src}" class="thumb" alt="Ảnh đối sách"/>`
          ).join('')}</div>`;
        }

        issueBlocks += `
        <div class="issue-card">
          <div class="issue-header">
            <div class="issue-num">#${idx + 1}</div>
            <div class="issue-title">Vấn đề ${idx + 1}</div>
            <span class="status-badge" style="background:${statusBg};color:${statusColor};border:1px solid ${statusColor}30">${statusText}</span>
            <span class="issue-date">${dateStr}</span>
          </div>
          <div class="issue-body">
            <div class="issue-content">
              <div class="section-label" style="color:#dc2626">📋 NỘI DUNG LỖI</div>
              <div class="section-text">${escHtml(issue.issue_description)}</div>
              ${issue.solution_description ? `
                <div class="section-label" style="color:#059669;margin-top:12px">✅ ĐỐI SÁCH / XỬ LÝ</div>
                <div class="section-text sol-text">${escHtml(issue.solution_description)}</div>
              ` : ''}
            </div>
            <div class="issue-media">
              ${issueImgB64.length > 0 ? `<div class="media-label" style="color:#dc2626">Hình ảnh lỗi</div>${issueImgHtml}` : ''}
              ${solImgB64.length > 0 ? `<div class="media-label" style="color:#059669;margin-top:10px">Hình ảnh đối sách</div>${solImgHtml}` : ''}
              ${issueImgB64.length === 0 && solImgB64.length === 0 ? '<div class="no-img">Không có hình ảnh</div>' : ''}
            </div>
          </div>
        </div>`;
      });

      const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Báo cáo CLSP - ${code}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #f1f5f9; color: #1e293b; line-height: 1.5; }
  .container { max-width: 1000px; margin: 0 auto; padding: 20px; }

  .report-header {
    background: linear-gradient(135deg, #1e40af, #3b82f6);
    color: #fff; padding: 28px 32px; border-radius: 16px;
    margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;
  }
  .report-header h1 { font-size: 22px; font-weight: 800; }
  .report-header .subtitle { font-size: 13px; opacity: 0.85; margin-top: 4px; }
  .report-header .stats {
    display: flex; gap: 10px; align-items: center;
  }
  .stat-box {
    background: rgba(255,255,255,0.18); padding: 8px 16px; border-radius: 10px;
    text-align: center; min-width: 70px;
  }
  .stat-box .num { font-size: 22px; font-weight: 800; }
  .stat-box .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85; }

  .product-info {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
    padding: 16px 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 20px;
  }
  .product-info .code { font-size: 20px; font-weight: 800; color: #dc2626; }
  .product-info .name { font-size: 14px; color: #64748b; }

  .issue-card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
    margin-bottom: 16px; overflow: hidden; break-inside: avoid;
  }
  .issue-header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    flex-wrap: wrap;
  }
  .issue-num {
    background: #1e293b; color: #fff; width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0;
  }
  .issue-title { font-weight: 700; font-size: 15px; color: #1e293b; }
  .status-badge {
    padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
    margin-left: auto; flex-shrink: 0;
  }
  .issue-date { font-size: 11px; color: #94a3b8; flex-shrink: 0; }

  .issue-body {
    display: flex; gap: 20px; padding: 16px 20px;
  }
  .issue-content { flex: 1; min-width: 0; }
  .issue-media { width: 320px; flex-shrink: 0; }

  .section-label {
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 6px;
  }
  .section-text {
    font-size: 13.5px; color: #334155; line-height: 1.65; word-break: break-word;
  }
  .sol-text {
    background: #f0fdf4; padding: 10px 14px; border-radius: 8px;
    border-left: 3px solid #10b981;
  }

  .media-label { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.3px; }
  .img-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .thumb {
    width: 95px; height: 95px; object-fit: cover; border-radius: 6px;
    border: 1px solid #e2e8f0; cursor: pointer;
  }
  .thumb:hover { opacity: 0.85; }
  .no-img { font-size: 12px; color: #cbd5e1; font-style: italic; padding: 20px 0; text-align: center; }

  .footer {
    text-align: center; padding: 20px; color: #94a3b8; font-size: 11px;
    border-top: 1px solid #e2e8f0; margin-top: 10px;
  }

  @media print {
    body { background: #fff; }
    .container { padding: 0; max-width: 100%; }
    .report-header { border-radius: 0; }
    .issue-card { box-shadow: none; border: 1px solid #ccc; }
    .thumb { width: 80px; height: 80px; }
  }
  @media (max-width: 700px) {
    .issue-body { flex-direction: column; }
    .issue-media { width: 100%; }
    .report-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="report-header">
    <div>
      <h1>🛡️ BÁO CÁO CHẤT LƯỢNG SẢN PHẨM</h1>
      <div class="subtitle">Ngày xuất: ${today}</div>
    </div>
    <div class="stats">
      <div class="stat-box"><div class="num">${issList.length}</div><div class="lbl">Tổng</div></div>
      <div class="stat-box" style="background:rgba(16,185,129,0.25)"><div class="num">${totalResolved}</div><div class="lbl">Đã xử lý</div></div>
      <div class="stat-box" style="background:rgba(234,88,12,0.25)"><div class="num">${totalPending}</div><div class="lbl">Chưa XL</div></div>
    </div>
  </div>

  <div class="product-info">
    <div>
      <div class="code">${code}</div>
      <div class="name">${escHtml(pName) || 'Không rõ tên sản phẩm'}</div>
    </div>
  </div>

  ${issueBlocks}

  <div class="footer">
    Báo cáo được tạo tự động từ hệ thống QLSX &bull; ${today}
  </div>
</div>
</body>
</html>`;

      zip.file(`BaoCao_CLSP_${code}.html`, htmlContent);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `CLSP_${code}_${new Date().toISOString().slice(0,10)}.zip`);
    } catch (err) {
      console.error('Lỗi tạo ZIP:', err);
      alert('Có lỗi khi tạo file tải về: ' + err.message);
    } finally {
      setDownloading(false);
      setDownloadingCode(null);
    }
  };

  return (
    <ModuleShell
      title="Chất Lượng Sản Phẩm"
      icon={ShieldAlert}
      color="#dc2626"
      loading={loading}
      onRefresh={fetchData}
      headerRight={
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <ActionButton onClick={() => { setShowLookupModal(true); setLookupSelectedCode(null); setLookupSearch(''); }} icon={Search} label="Tra cứu SP" color="#2563eb" />
          {canAddOrEdit && <ActionButton onClick={() => { resetForm(); setShowModal(true); }} icon={Plus} label="Lưu ý CLSP" color="#dc2626" />}
        </div>
      }
    >
      <div style={{ padding: '1rem' }}>
        
        {renderFilterTabs()}

        {loading && issues.length === 0 ? (
          <div style={{textAlign: 'center', padding: '4rem', color: '#64748b'}}>Đang tải dữ liệu...</div>
        ) : Object.keys(groupedIssues).length === 0 ? (
          <div style={{textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: '12px', color: '#64748b'}}>
            <ShieldAlert size={48} color="#cbd5e1" style={{marginBottom: '1rem'}} />
            <p>Không có dữ liệu lỗi phù hợp.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '2rem' }}>
            {Object.entries(groupedIssues).map(([productCode, codeIssues]) => {
              const matchedName = productCodes.find(p => p.code === productCode)?.name;
              return (
              <div key={productCode} style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ background: '#f1f5f9', padding: '0.75rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <AlertTriangle size={20} color="#dc2626" />
                  <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                    Mã Sản Phẩm: <strong style={{color: '#dc2626'}}>{productCode}</strong>
                    {matchedName && <span style={{fontSize: '0.9rem', color: '#64748b', fontWeight: 500, marginLeft: '0.5rem'}}>- {matchedName}</span>}
                  </h2>
                  <span style={{ background: '#e2e8f0', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 600 }}>{codeIssues.length} vấn đề</span>
                  {p.io && <button
                    onClick={(e) => { e.stopPropagation(); handleDownloadZip(productCode, codeIssues); }}
                    disabled={downloading && downloadingCode === productCode}
                    style={{ 
                      marginLeft: 'auto',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: '8px',
                      background: (downloading && downloadingCode === productCode) ? '#94a3b8' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                      color: '#fff', border: 'none', 
                      cursor: (downloading && downloadingCode === productCode) ? 'wait' : 'pointer',
                      fontWeight: 700, fontSize: '0.78rem',
                      boxShadow: '0 2px 6px rgba(59,130,246,0.25)',
                      transition: 'all 0.2s',
                      flexShrink: 0
                    }}
                  >
                    {(downloading && downloadingCode === productCode) ? (
                      <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> <span className="mobile-hidden">Đang tải...</span></>
                    ) : (
                      <><Download size={14}/> <span className="mobile-hidden">Tải báo cáo</span></>
                    )}
                  </button>}
                </div>
                
                <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
                  {codeIssues.map((issue) => {
                    const isResolved = issue.status === 'Đã xử lý';
                    return (
                      <div 
                        key={issue.id} 
                        onClick={() => handleEdit(issue)}
                        style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', position: 'relative', cursor: 'pointer', background: '#fff', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#94a3b8'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {new Date(issue.created_at).toLocaleString('vi-VN')}
                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: isResolved ? '#d1fae5' : '#ffedd5', color: isResolved ? '#059669' : '#ea580c' }}>
                              {issue.status || 'Chưa xử lý'}
                            </span>
                          </p>
                          {p.delete && <button onClick={(e) => handleDelete(issue.id, e)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}>
                            <X size={16} />
                          </button>}
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                           <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>VẤN ĐỀ:</p>
                           <p style={{ margin: 0, color: '#1e293b', fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                             {issue.issue_description}
                           </p>
                           {(() => {
                             let imgs = [];
                             if (issue.image_url) {
                               if (issue.image_url.startsWith('[')) {
                                 try { imgs = JSON.parse(issue.image_url); } catch(e) { imgs = [issue.image_url]; }
                               } else {
                                 imgs = [issue.image_url];
                               }
                             }
                             if (imgs.length === 0) return null;
                             return (
                               <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginTop: '0.5rem', paddingBottom: '0.5rem' }}>
                                 {imgs.map((img, i) => {
                                   const isVideo = img.match(/\.(mp4|webm|ogg|mov)$/i);
                                   return (
                                     <div key={i} style={{ flexShrink: 0, width: '100px', height: '100px', background: '#f8fafc', borderRadius: '6px', overflow: 'hidden' }} onClick={(e) => { e.stopPropagation(); window.open(img, '_blank'); }}>
                                       {isVideo ? (
                                         <video src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                       ) : (
                                         <img src={img} alt="QC Issue" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
                                       )}
                                     </div>
                                   );
                                 })}
                               </div>
                             );
                           })()}
                        </div>

                        {issue.solution_description && (
                          <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={14}/> ĐỐI SÁCH:</p>
                            <p style={{ margin: 0, color: '#334155', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {issue.solution_description}
                            </p>
                          </div>
                        )}

                        {issue.solution_images && issue.solution_images.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {issue.solution_images.map((img, i) => {
                               const isVideo = img.match(/\.(mp4|webm|ogg|mov)$/i);
                               return isVideo ? (
                                 <video key={i} src={img} onClick={(e) => { e.stopPropagation(); window.open(img, '_blank'); }} style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', cursor: 'zoom-in', border: '1px solid #cbd5e1' }} muted />
                               ) : (
                                 <img key={i} src={img} alt="Solution" onClick={(e) => { e.stopPropagation(); window.open(img, '_blank'); }} style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', cursor: 'zoom-in', border: '1px solid #cbd5e1' }} />
                               )
                            })}
                          </div>
                        )}
                        
                      </div>
                    );
                  })}
                </div>
              </div>
            );})}
          </div>
        )}
      </div>

      {/* MODAL THÊM LƯU Ý CLSP */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '600px', maxHeight: '90vh', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert size={20} color="#dc2626"/> {editingIssue ? 'Sửa Lưu ý & Cập nhật Đối sách' : 'Ghi nhận Lưu ý CLSP mới'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20}/></button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <form id="quality-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                
                {/* TRẠNG THÁI */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>Trạng thái xử lý:</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500, color: '#ea580c' }}>
                    <input type="radio" name="status" value="Chưa xử lý" checked={form.status === 'Chưa xử lý'} onChange={e => setForm({...form, status: e.target.value})} />
                    Chưa xử lý
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500, color: '#10b981' }}>
                    <input type="radio" name="status" value="Đã xử lý" checked={form.status === 'Đã xử lý'} onChange={e => setForm({...form, status: e.target.value})} />
                    Đã xử lý
                  </label>
                </div>

                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Mã Sản Phẩm */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Mã Sản Phẩm *</label>
                    <input 
                      type="text" 
                      required
                      value={form.product_code}
                      onChange={e => {
                         const val = e.target.value;
                         setForm({...form, product_code: val, product_name: ''});
                         setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Nhập mã SP..."
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    />
                    {showSuggestions && (
                      <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        padding: 0, margin: '4px 0 0 0', listStyle: 'none', zIndex: 10
                      }}>
                        {productCodes.filter(c => c.code.toLowerCase().includes((form.product_code || '').toLowerCase())).slice(0, 50).map(item => (
                          <li 
                            key={item.code}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm({...form, product_code: item.code, product_name: item.name});
                              setShowSuggestions(false);
                            }}
                            style={{ padding: '0.6rem 0.8rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#334155' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                          >
                            <strong>{item.code}</strong> <span style={{color: '#94a3b8'}}>- {item.name}</span>
                          </li>
                        ))}
                        {productCodes.filter(c => c.code.toLowerCase().includes((form.product_code || '').toLowerCase())).length === 0 && (
                          <li style={{ padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: '#94a3b8' }}>Không tìm thấy mã phù hợp</li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Tên Sản Phẩm */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Tên Sản Phẩm</label>
                    <input 
                      type="text" 
                      value={form.product_name}
                      onChange={e => {
                         const val = e.target.value;
                         setForm({...form, product_name: val, product_code: ''});
                         setShowNameSuggestions(true);
                      }}
                      onFocus={() => setShowNameSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                      placeholder="Tìm theo tên SP..."
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                    />
                    {showNameSuggestions && (
                      <ul style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        padding: 0, margin: '4px 0 0 0', listStyle: 'none', zIndex: 10
                      }}>
                        {productCodes.filter(c => c.name.toLowerCase().includes((form.product_name || '').toLowerCase())).slice(0, 50).map(item => (
                          <li 
                            key={item.code}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm({...form, product_code: item.code, product_name: item.name});
                              setShowNameSuggestions(false);
                            }}
                            style={{ padding: '0.6rem 0.8rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#334155' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                          >
                            {item.name} <span style={{color: '#94a3b8'}}>({item.code})</span>
                          </li>
                        ))}
                        {productCodes.filter(c => c.name.toLowerCase().includes((form.product_name || '').toLowerCase())).length === 0 && (
                          <li style={{ padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: '#94a3b8' }}>Không tìm thấy tên phù hợp</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                {/* THÔNG TIN LỖI */}
                <div style={{ borderLeft: '3px solid #ef4444', paddingLeft: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.8rem 0', color: '#ef4444', fontSize: '0.9rem' }}>THÔNG TIN VẤN ĐỀ LỖI</h4>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Mô tả lỗi *</label>
                    <textarea 
                      required
                      value={form.issue_description}
                      onChange={e => setForm({...form, issue_description: e.target.value})}
                      placeholder="Mô tả chi tiết lỗi phát hiện..."
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Hình ảnh / Video lỗi (Nhiều file)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {/* Render existing images */}
                      {existingIssueImages.map((url, i) => {
                         const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
                         return (
                          <div key={`ext-iss-${i}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            {isVideo ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted /> : <img src={url} alt="Issue" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button type="button" onClick={() => removeExistingIssueImage(i)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12}/></button>
                          </div>
                         )
                      })}
                      {/* Render new selected images */}
                      {newIssuePreviews.map((url, i) => {
                         const isVideo = newIssueFiles[i]?.type?.startsWith('video/');
                         return (
                          <div key={`new-iss-${i}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '2px solid #ef4444' }}>
                            {isVideo ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted /> : <img src={url} alt="Issue" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button type="button" onClick={() => removeNewIssueFile(i)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12}/></button>
                          </div>
                         )
                      })}
                      {/* Upload Button */}
                      <div onClick={() => issueFileInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Tải tệp lên">
                        <UploadCloud size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Tải lên</span>
                      </div>
                      {/* Photo Button */}
                      <div onClick={() => issuePhotoInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Chụp ảnh">
                        <Camera size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Chụp ảnh</span>
                      </div>
                      {/* Video Button */}
                      <div onClick={() => issueVideoInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Quay video">
                        <Video size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Quay video</span>
                      </div>
                    </div>
                    <input type="file" accept="image/*,video/*" multiple ref={issueFileInputRef} onChange={handleIssueImageChange} style={{ display: 'none' }} />
                    <input type="file" accept="image/*" capture="environment" ref={issuePhotoInputRef} onChange={handleIssueImageChange} style={{ display: 'none' }} />
                    <input type="file" accept="video/*" capture="environment" ref={issueVideoInputRef} onChange={handleIssueImageChange} style={{ display: 'none' }} />
                  </div>
                </div>

                {/* THÔNG TIN ĐỐI SÁCH */}
                <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '1rem', marginTop: '0.5rem' }}>
                  <h4 style={{ margin: '0 0 0.8rem 0', color: '#10b981', fontSize: '0.9rem' }}>ĐỐI SÁCH / PHƯƠNG ÁN XỬ LÝ</h4>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <textarea 
                      value={form.solution_description}
                      onChange={e => setForm({...form, solution_description: e.target.value})}
                      placeholder="Nhập phương án đã xử lý hoặc đối sách phòng ngừa..."
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Hình ảnh / Video đối sách (Nhiều file)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {/* Render existing images */}
                      {existingSolutionImages.map((url, i) => {
                         const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
                         return (
                          <div key={`ext-${i}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            {isVideo ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted /> : <img src={url} alt="Sol" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button type="button" onClick={() => removeExistingSolutionImage(i)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12}/></button>
                          </div>
                         )
                      })}
                      {/* Render new selected images */}
                      {newSolutionPreviews.map((url, i) => {
                         const isVideo = newSolutionFiles[i]?.type?.startsWith('video/');
                         return (
                          <div key={`new-${i}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '2px solid #3b82f6' }}>
                            {isVideo ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted /> : <img src={url} alt="Sol" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            <button type="button" onClick={() => removeNewSolutionFile(i)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={12}/></button>
                          </div>
                         )
                      })}
                      {/* Upload Button */}
                      <div onClick={() => solutionFileInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Tải tệp lên">
                        <UploadCloud size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Tải lên</span>
                      </div>
                      {/* Photo Button */}
                      <div onClick={() => solutionPhotoInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Chụp ảnh">
                        <Camera size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Chụp ảnh</span>
                      </div>
                      {/* Video Button */}
                      <div onClick={() => solutionVideoInputRef.current?.click()} style={{ width: '70px', height: '70px', border: '2px dashed #cbd5e1', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#f8fafc', color: '#64748b' }} title="Quay video">
                        <Video size={20} style={{marginBottom: '4px'}} />
                        <span style={{fontSize: '0.6rem', fontWeight: 600}}>Quay video</span>
                      </div>
                    </div>
                    <input type="file" accept="image/*,video/*" multiple ref={solutionFileInputRef} onChange={handleSolutionImageChange} style={{ display: 'none' }} />
                    <input type="file" accept="image/*" capture="environment" ref={solutionPhotoInputRef} onChange={handleSolutionImageChange} style={{ display: 'none' }} />
                    <input type="file" accept="video/*" capture="environment" ref={solutionVideoInputRef} onChange={handleSolutionImageChange} style={{ display: 'none' }} />
                  </div>
                </div>

              </form>
            </div>

            <div style={{ display: 'flex', gap: '1rem', padding: '1.2rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.8rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
                {canAddOrEdit ? 'Hủy bỏ' : 'Đóng'}
              </button>
              {canAddOrEdit && <button form="quality-form" type="submit" disabled={submitting} style={{ flex: 1, padding: '0.8rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Đang lưu...' : 'Lưu Dữ Liệu'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL TRA CỨU SẢN PHẨM CLSP
         ═══════════════════════════════════════════════════════ */}
      {showLookupModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '0.5rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ 
            background: '#fff', width: '100%', maxWidth: '800px', maxHeight: '95vh', 
            borderRadius: '16px', overflow: 'hidden', 
            boxShadow: '0 25px 60px -12px rgba(0,0,0,0.35)', 
            display: 'flex', flexDirection: 'column',
            animation: 'slideUp 0.25s ease-out'
          }}>
            {/* Header */}
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '1rem 1.5rem', 
              borderBottom: '1px solid #e2e8f0', 
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              flexShrink: 0 
            }}>
              <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 700 }}>
                <Search size={20}/> Tra cứu Chất Lượng Sản Phẩm
              </h3>
              <button onClick={() => setShowLookupModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18}/>
              </button>
            </div>

            {/* Search bar */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', flexShrink: 0, position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Nhập mã hoặc tên sản phẩm để tra cứu..."
                  value={lookupSearch}
                  onChange={e => { setLookupSearch(e.target.value); setLookupShowSuggestions(true); setLookupSelectedCode(null); }}
                  onFocus={() => setLookupShowSuggestions(true)}
                  autoFocus
                  style={{ 
                    width: '100%', padding: '0.7rem 0.8rem 0.7rem 2.2rem', 
                    borderRadius: '10px', border: '2px solid #e2e8f0', 
                    outline: 'none', fontSize: '0.9rem', fontWeight: 500,
                    transition: 'border-color 0.2s',
                    background: '#fff'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setLookupShowSuggestions(false); }
                  }}
                />
                {lookupSearch && !lookupSelectedCode && (
                  <button 
                    onClick={() => { setLookupSearch(''); setLookupSelectedCode(null); }}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                  >
                    <X size={16}/>
                  </button>
                )}
              </div>

              {/* Autocomplete suggestions */}
              {lookupShowSuggestions && lookupSearch && !lookupSelectedCode && (
                <div style={{ 
                  position: 'absolute', left: '1.5rem', right: '1.5rem', top: '100%', 
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', 
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', 
                  maxHeight: '250px', overflowY: 'auto', zIndex: 20,
                  marginTop: '4px'
                }}>
                  {lookupFilteredCodes.slice(0, 30).map(item => (
                    <div
                      key={item.code}
                      onClick={() => {
                        setLookupSelectedCode(item.code);
                        setLookupSearch(item.code);
                        setLookupShowSuggestions(false);
                      }}
                      style={{ 
                        padding: '0.7rem 1rem', cursor: 'pointer', 
                        borderBottom: '1px solid #f8fafc', 
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <div style={{ 
                        width: '36px', height: '36px', borderRadius: '8px', 
                        background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 
                      }}>
                        <Package size={16} color="#2563eb" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{item.code}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      </div>
                      <ChevronRight size={16} color="#cbd5e1" />
                    </div>
                  ))}
                  {lookupFilteredCodes.length === 0 && (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                      <Package size={32} color="#e2e8f0" style={{ marginBottom: '0.5rem' }} />
                      <p style={{ margin: 0 }}>Không tìm thấy sản phẩm phù hợp</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              {!lookupSelectedCode ? (
                /* Empty state when no product selected */
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <div style={{ 
                    width: '80px', height: '80px', borderRadius: '50%', 
                    background: '#f1f5f9', margin: '0 auto 1rem', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <Search size={36} color="#cbd5e1" />
                  </div>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b', margin: '0 0 0.5rem 0' }}>Chọn một mã sản phẩm</p>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>Nhập mã hoặc tên sản phẩm ở ô tìm kiếm bên trên để xem toàn bộ thông tin CLSP</p>
                </div>
              ) : lookupIssues.length === 0 ? (
                /* No issues found for this product */
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <div style={{ 
                    width: '80px', height: '80px', borderRadius: '50%', 
                    background: '#f0fdf4', margin: '0 auto 1rem', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <CheckCircle size={36} color="#86efac" />
                  </div>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#10b981', margin: '0 0 0.5rem 0' }}>Không có lưu ý CLSP</p>
                  <p style={{ fontSize: '0.85rem', margin: 0, color: '#64748b' }}>Sản phẩm <strong>{lookupSelectedCode}</strong> chưa có ghi nhận vấn đề chất lượng nào.</p>
                </div>
              ) : (
                /* Issues list for selected product */
                <div>
                  {/* Product header with download button */}
                  <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    marginBottom: '1rem', padding: '0.75rem 1rem', 
                    background: 'linear-gradient(135deg, #fef2f2, #fff1f2)', 
                    borderRadius: '10px', border: '1px solid #fecaca'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.15rem' }}>Mã sản phẩm</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{lookupSelectedCode}</div>
                      {lookupProductName && <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>{lookupProductName}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ 
                        background: '#dc2626', color: '#fff', padding: '0.3rem 0.7rem', 
                        borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700 
                      }}>
                        {lookupIssues.length} vấn đề
                      </div>
                      {p.io && <button
                        onClick={handleDownloadZip}
                        disabled={downloading}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.5rem 1rem', borderRadius: '8px',
                          background: downloading ? '#94a3b8' : 'linear-gradient(135deg, #059669, #10b981)',
                          color: '#fff', border: 'none', cursor: downloading ? 'wait' : 'pointer',
                          fontWeight: 700, fontSize: '0.82rem',
                          boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                          transition: 'all 0.2s'
                        }}
                      >
                        {downloading ? (
                          <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Đang tải...</>
                        ) : (
                          <><FileDown size={15}/> Tải ZIP</>
                        )}
                      </button>}
                    </div>
                  </div>

                  {/* Issues cards */}
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {lookupIssues.map((issue, idx) => {
                      const isResolved = issue.status === 'Đã xử lý';
                      const issueImgs = parseImageUrls(issue.image_url);
                      const solImgs = issue.solution_images || [];

                      return (
                        <div key={issue.id} style={{ 
                          border: '1px solid #e2e8f0', borderRadius: '12px', 
                          overflow: 'hidden', background: '#fff',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          transition: 'box-shadow 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'}
                        >
                          {/* Issue card header */}
                          <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.75rem 1rem', 
                            background: isResolved ? '#f0fdf4' : '#fffbeb',
                            borderBottom: `2px solid ${isResolved ? '#86efac' : '#fde68a'}`
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ 
                                background: '#1e293b', color: '#fff', 
                                width: '26px', height: '26px', borderRadius: '50%', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.75rem', fontWeight: 800, flexShrink: 0
                              }}>#{idx + 1}</span>
                              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                                {new Date(issue.created_at).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            <span style={{ 
                              padding: '0.25rem 0.7rem', borderRadius: '20px', 
                              fontSize: '0.75rem', fontWeight: 700,
                              background: isResolved ? '#dcfce7' : '#ffedd5', 
                              color: isResolved ? '#059669' : '#ea580c',
                              border: `1px solid ${isResolved ? '#bbf7d0' : '#fdba74'}`
                            }}>
                              {issue.status || 'Chưa xử lý'}
                            </span>
                          </div>

                          <div style={{ padding: '1rem' }}>
                            {/* Issue description */}
                            <div style={{ marginBottom: '0.75rem' }}>
                              <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>VẤN ĐỀ LỖI:</p>
                              <p style={{ margin: 0, color: '#1e293b', fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>
                                {issue.issue_description}
                              </p>
                            </div>

                            {/* Issue images */}
                            {issueImgs.length > 0 && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>HÌNH ẢNH LỖI:</p>
                                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                  {issueImgs.map((img, i) => {
                                    const isVideo = img.match(/\.(mp4|webm|ogg|mov)$/i);
                                    return (
                                      <div key={i} style={{ 
                                        flexShrink: 0, width: '120px', height: '120px', 
                                        background: '#f8fafc', borderRadius: '8px', overflow: 'hidden',
                                        border: '2px solid #fecaca', cursor: 'pointer',
                                        transition: 'transform 0.15s'
                                      }}
                                      onClick={() => setLightboxUrl(img)}
                                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                      >
                                        {isVideo ? (
                                          <video src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                        ) : (
                                          <img src={img} alt="QC Issue" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Solution description */}
                            {issue.solution_description && (
                              <div style={{ 
                                background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', 
                                marginBottom: '0.75rem', border: '1px solid #bbf7d0'
                              }}>
                                <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.72rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  <CheckCircle size={13}/> ĐỐI SÁCH:
                                </p>
                                <p style={{ margin: 0, color: '#334155', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                  {issue.solution_description}
                                </p>
                              </div>
                            )}

                            {/* Solution images */}
                            {solImgs.length > 0 && (
                              <div>
                                <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>HÌNH ẢNH ĐỐI SÁCH:</p>
                                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                  {solImgs.map((img, i) => {
                                    const isVideo = img.match(/\.(mp4|webm|ogg|mov)$/i);
                                    return (
                                      <div key={i} style={{ 
                                        flexShrink: 0, width: '100px', height: '100px', 
                                        background: '#f8fafc', borderRadius: '8px', overflow: 'hidden',
                                        border: '2px solid #bbf7d0', cursor: 'pointer',
                                        transition: 'transform 0.15s'
                                      }}
                                      onClick={() => setLightboxUrl(img)}
                                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                      >
                                        {isVideo ? (
                                          <video src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                        ) : (
                                          <img src={img} alt="Solution" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {lookupSelectedCode && lookupIssues.length > 0 && (
              <div style={{ 
                padding: '0.75rem 1.5rem', borderTop: '1px solid #e2e8f0', 
                background: '#f8fafc', flexShrink: 0,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Tổng: <strong style={{ color: '#dc2626' }}>{lookupIssues.length}</strong> vấn đề · 
                  <strong style={{ color: '#059669' }}> {lookupIssues.filter(i => i.status === 'Đã xử lý').length}</strong> đã xử lý · 
                  <strong style={{ color: '#ea580c' }}> {lookupIssues.filter(i => (i.status || 'Chưa xử lý') !== 'Đã xử lý').length}</strong> chưa xử lý
                </span>
                {p.io && <button
                  onClick={handleDownloadZip}
                  disabled={downloading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1.2rem', borderRadius: '8px',
                    background: downloading ? '#94a3b8' : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                    color: '#fff', border: 'none', cursor: downloading ? 'wait' : 'pointer',
                    fontWeight: 700, fontSize: '0.82rem',
                    boxShadow: '0 2px 8px rgba(59,130,246,0.3)'
                  }}
                >
                  {downloading ? (
                    <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Đang tạo ZIP...</>
                  ) : (
                    <><Download size={15}/> Tải toàn bộ dữ liệu</>
                  )}
                </button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox for full-size image/video */}
      {lightboxUrl && (
        <div 
          onClick={() => setLightboxUrl(null)}
          style={{ 
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            zIndex: 200, cursor: 'zoom-out', padding: '1rem'
          }}
        >
          <button 
            onClick={() => setLightboxUrl(null)}
            style={{ 
              position: 'absolute', top: '1rem', right: '1rem', 
              background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', 
              color: '#fff', borderRadius: '50%', width: '40px', height: '40px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}
          >
            <X size={22}/>
          </button>
          {lightboxUrl.match(/\.(mp4|webm|ogg|mov)$/i) ? (
            <video 
              src={lightboxUrl} 
              controls autoPlay 
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90%', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }} 
            />
          ) : (
            <img 
              src={lightboxUrl} 
              alt="Full size" 
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '90%', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }} 
            />
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      </ModuleShell>
  );
};

export default QualityApp;
