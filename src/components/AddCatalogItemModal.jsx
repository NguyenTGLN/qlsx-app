import React, { useState } from 'react';
import { supabase as db } from '../lib/supabase';
import { Loader2, Check } from 'lucide-react';

// Nhãn + thứ tự các trường của danh mục hàng hóa (inventory_items).
// Export để CatalogTab dùng chung, tránh định nghĩa 2 nơi.
export const CATALOG_COL_LABEL = {
  item_code: 'Mã HH',
  item_name: 'Tên hàng hóa',
  unit: 'ĐVT',
  min_stock_days: 'Ngày Min',
  backup_stock_days: 'Tồn DP',
  warehouse: 'Kho',
  lead_time_days: 'Lead Time',
};
export const CATALOG_NUM_FIELDS = ['min_stock_days', 'backup_stock_days', 'lead_time_days'];

const st = {
  btn: { display:'flex',alignItems:'center',gap:5,padding:'0.35rem 0.75rem',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:'0.78rem',fontWeight:600,color:'#475569',transition:'all 0.15s' },
  input: { padding:'0.35rem 0.6rem',border:'1px solid #e2e8f0',borderRadius:7,fontSize:'0.8rem',outline:'none',background:'#f8fafc',color:'#334155' },
};

// Form thêm 1 mã hàng hóa vào danh mục (inventory_items). Dùng chung cho:
//  - tab Danh mục hàng hóa (nút "Thêm mã")
//  - màn hình Nhập kho (thêm nhanh khi mã chưa có trong danh mục)
// Props:
//  - initialCode: prefill sẵn ô Mã HH (mã người dùng vừa gõ ở ô tìm hàng hóa)
//  - onSaved(newItem): gọi sau khi insert thành công, truyền lại object đã lưu
//  - onClose(): đóng modal
export default function AddCatalogItemModal({ initialCode = '', onSaved, onClose }) {
  const [row, setRow] = useState({
    item_code: initialCode, item_name: '', unit: '',
    min_stock_days: '', backup_stock_days: '', warehouse: '', lead_time_days: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const allFilled = Object.keys(CATALOG_COL_LABEL).every(k => String(row[k] ?? '').trim() !== '');
    if (!allFilled) return alert('Vui lòng nhập đầy đủ tất cả các trường');
    setSaving(true);
    try {
      const code = String(row.item_code).trim();
      // Kiểm tra trùng mã trước khi thêm
      const { data: existing, error: checkErr } = await db.from('inventory_items').select('item_code').eq('item_code', code).maybeSingle();
      if (checkErr) throw checkErr;
      if (existing) { setSaving(false); return alert('Mã HH đã tồn tại'); }
      // Dựng payload, ép kiểu số cho các trường số
      const payload = {};
      Object.keys(CATALOG_COL_LABEL).forEach(k => {
        payload[k] = CATALOG_NUM_FIELDS.includes(k) ? Number(row[k]) : String(row[k]).trim();
      });
      const { error } = await db.from('inventory_items').insert(payload);
      if (error) throw error;
      onSaved && onSaved(payload);
      onClose && onClose();
    } catch (e) {
      alert('Lỗi thêm mã: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',padding:'1.5rem',borderRadius:12,width:400,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)'}}>
        <h3 style={{marginTop:0,marginBottom:15}}>Thêm mã hàng hóa</h3>
        {Object.keys(CATALOG_COL_LABEL).map(k => (
          <div key={k} style={{marginBottom:10}}>
            <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,color:'#64748b',marginBottom:4}}>{CATALOG_COL_LABEL[k]} <span style={{color:'#ef4444'}}>*</span></label>
            <input
              type={CATALOG_NUM_FIELDS.includes(k) ? 'number' : 'text'}
              value={row[k] ?? ''}
              onChange={e=>setRow({...row, [k]: e.target.value})}
              style={{...st.input, width:'100%',boxSizing:'border-box'}}
            />
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
          <button onClick={onClose} style={st.btn}>Hủy</button>
          <button onClick={handleSave} disabled={saving} style={{...st.btn, background:'#0891b2', color:'#fff'}}>
            {saving ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Check size={14}/>} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
