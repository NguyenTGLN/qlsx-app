// Đọc-ghi Supabase cho ĐỢT đề xuất linh kiện. Phần tính toán thuần nằm ở mrp.js.
// Xem spec: docs/superpowers/specs/2026-07-29-de-xuat-linh-kien-theo-dot-design.md

import { supabase as db } from './supabase';
import { buildProposalLines } from './mrp';
import { todayLocal } from './dateUtils';

// Mã đợt: DX-DDMMYY-NN. Đổi '2026-07-29' → '290726'.
function dateTag(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  return `${d}${m}${y.slice(-2)}`;
}

// Số kế tiếp trong ngày. KHÔNG lấp lỗ hổng: luôn lớn hơn số lớn nhất đang có, để một
// mã đợt đã dùng không bao giờ bị gán lại cho đợt khác — nếu không, hai đợt khác nhau
// trong cùng ngày có thể mang cùng mã sau khi một đợt bị huỷ.
export function nextBatchCode(existingCodes, isoDate) {
  const prefix = `DX-${dateTag(isoDate)}-`;
  const max = (existingCodes || []).reduce((m, c) => {
    if (typeof c !== 'string' || !c.startsWith(prefix)) return m;
    const n = parseInt(c.slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

const num = (v) => Number(v) || 0;

// Nắn dữ liệu thô từ CSDL thành đầu vào cho buildProposalLines. HÀM THUẦN — tách
// riêng khỏi phần đọc CSDL để test được mà không cần giả lập Supabase.
//
// GỐC LÀ sales (bán 90 ngày), KHÔNG phải bảng tồn kho: theo quy trình, mã nào tồn về 0
// thì bị xoá dòng khỏi tồn sổ sách/vị trí/hàng hoá cho gọn bảng. Đi từ bảng tồn kho thì
// đúng những mã đã bán sạch — thứ cần đặt gấp nhất — lại biến mất. Đo 29/07/2026: 19 mã
// có bán 90 ngày không còn dòng tồn nào, nặng nhất FK-RO50 bán 165 cái/90 ngày.
export function shapeEngineInputs({
  sales = [], catalog = [], bomRows = [], stockRows = [], openProposals = [], nhapRows = [],
} = {}) {
  const dict = {};
  catalog.forEach((c) => { dict[c.item_code] = c; });

  const moTa = (code, banRa) => ({
    item_code: code,
    item_name: dict[code]?.item_name || '',
    unit: dict[code]?.unit || '',
    total_sales_90d: banRa,
    lead_time_days: num(dict[code]?.lead_time_days),
    backup_stock_days: num(dict[code]?.backup_stock_days),
  });

  const items = [];
  const daCo = new Set();
  sales.forEach((s) => {
    if (num(s.total_sales) <= 0 || daCo.has(s.ma_san_pham)) return;
    daCo.add(s.ma_san_pham);
    items.push(moTa(s.ma_san_pham, num(s.total_sales)));
  });

  // Linh kiện chỉ nằm trong BOM, không bán — vẫn phải có mặt để lấy tên và đơn vị tính
  // khi nó lọt vào danh sách mua. total_sales_90d = 0 nên không thành nhu cầu gốc.
  const bomMap = {};
  bomRows.forEach((b) => {
    (bomMap[b.product_code] ||= []).push({ component: b.component_code, qty: num(b.quantity) || 1 });
    if (!daCo.has(b.component_code)) {
      daCo.add(b.component_code);
      items.push(moTa(b.component_code, 0));
    }
  });

  // Mã không có dòng tồn nào ⇒ vắng mặt khỏi stockMap ⇒ engine hiểu là 0.
  const stockMap = {};
  stockRows.forEach((r) => {
    stockMap[r.item_code] = (stockMap[r.item_code] || 0) + num(r.quantity);
  });

  // Hàng đang về = Σ(SL đặt − đã nhập) của dòng CHO_HANG ở đợt trước, không âm.
  const daNhap = {};
  nhapRows.forEach((n) => {
    if (n.dlk_code) daNhap[n.dlk_code] = (daNhap[n.dlk_code] || 0) + num(n.so_luong_nhap);
  });
  const onOrderMap = {};
  openProposals.forEach((p) => {
    if (p.trang_thai !== 'CHO_HANG') return;
    const conLai = Math.max(0, num(p.actual_qty) - (daNhap[p.dlk_code] || 0));
    if (conLai > 0) onOrderMap[p.item_code] = (onOrderMap[p.item_code] || 0) + conLai;
  });

  return { items, bomMap, stockMap, onOrderMap };
}

// Lấy tất cả dòng, vượt trần 1000 dòng của PostgREST. Giống loadBomMap ở dksxEngine.
async function pagedAll(table, cols) {
  let rows = [], p = 0;
  while (true) {
    const { data, error } = await db.from(table).select(cols).range(p * 1000, (p + 1) * 1000 - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
    p++;
  }
  return rows;
}

// Đọc CSDL rồi giao cho shapeEngineInputs nắn. Lớp mỏng, không có logic.
export async function loadEngineInputs() {
  const [sales, catalog, bomRows, stockRows, openProposals, nhapRows] = await Promise.all([
    pagedAll('sales_90d_summary', 'ma_san_pham, total_sales'),
    pagedAll('inventory_items', 'item_code, item_name, unit, lead_time_days, backup_stock_days'),
    pagedAll('bom_items', 'product_code, component_code, quantity'),
    pagedAll('inventory_stock', 'item_code, quantity'),
    pagedAll('purchase_proposals', 'item_code, actual_qty, dlk_code, trang_thai'),
    pagedAll('du_lieu_nhap', 'dlk_code, so_luong_nhap'),
  ]);
  return shapeEngineInputs({ sales, catalog, bomRows, stockRows, openProposals, nhapRows });
}

// Đợt NHÁP đang mở (tối đa 1 theo chỉ mục proposal_batches_one_draft). null nếu không có.
export async function getCurrentDraft() {
  const { data, error } = await db.from('proposal_batches')
    .select('*').eq('trang_thai', 'NHAP').maybeSingle();
  if (error) throw error;
  return data || null;
}

// Chạy đề xuất → tạo hoặc GHI ĐÈ đợt NHÁP.
// Ghi đè giữ nguyên id và ma_dot, chỉ thay toàn bộ dòng — chạy thử lại nhiều lần
// không đốt số thứ tự đợt.
export async function runProposalDraft(nguoiTao) {
  const inputs = await loadEngineInputs();
  const { lines, missingParams } = buildProposalLines(inputs);

  let batch = await getCurrentDraft();
  // Xoá-rồi-chèn không transactional: nếu crash giữa chừng, đợt NHÁP còn lại rỗng dòng
  // — không mất gì, và lượt chạy kế tiếp tự vá (đi vào nhánh if(batch) này, xoá 0 dòng
  // rồi chèn lại đủ). Cố ý để vậy, không cần transaction cho luồng một người dùng bình thường.
  if (batch) {
    const { error } = await db.from('purchase_proposals').delete().eq('batch_id', batch.id);
    if (error) throw error;
  } else {
    const { data: existing } = await db.from('proposal_batches').select('ma_dot');
    const ma_dot = nextBatchCode((existing || []).map((r) => r.ma_dot), todayLocal());
    const { data, error } = await db.from('proposal_batches')
      .insert({ ma_dot, ngay_chay: todayLocal(), trang_thai: 'NHAP', nguoi_tao: nguoiTao || '' })
      .select().single();
    if (error) {
      // 23505 = có người vừa tạo nháp trước ta (chỉ mục one_draft chặn). Dùng nháp của họ.
      if (error.code === '23505') {
        const winner = await getCurrentDraft();
        if (winner) { batch = winner; await db.from('purchase_proposals').delete().eq('batch_id', winner.id); }
        else throw error;
      } else {
        throw error;
      }
    } else {
      batch = data;
    }
  }

  const today = todayLocal();
  const rows = lines.map((l, i) => ({
    ...l,
    batch_id: batch.id,
    dlk_code: `${batch.ma_dot}-${String(i + 1).padStart(3, '0')}`,
    ngay_de_xuat: today,
    tien_do: 'Mới',
    trang_thai: 'CHO_HANG',
    source: l.bom_qty > 0 && l.retail_qty > 0 ? 'both' : (l.retail_qty > 0 ? 'retail' : 'bom'),
    note: '',
  }));
  if (rows.length) {
    const { error } = await db.from('purchase_proposals').insert(rows);
    if (error) throw error;
  }
  return { batch, soDong: rows.length, missingParams };
}

// Gửi đợt: NHÁP → ĐÃ GỬI. Trả số đợt đã chuyển (0 nếu đợt không còn là nháp) để nơi
// gọi báo cho người dùng "đợt này không còn là bản nháp — hãy làm mới".
export async function sendBatch(batchId, nguoiGui) {
  const { data, error } = await db.from('proposal_batches').update({
    trang_thai: 'DA_GUI', nguoi_gui: nguoiGui || '', ngay_gui: new Date().toISOString(),
  }).eq('id', batchId).eq('trang_thai', 'NHAP').select();
  if (error) throw error;
  return { daGui: (data || []).length };
}

// Huỷ nháp: chỉ khi CÒN là NHÁP. Xoá dòng con của đợt SAU khi chắc chắn đợt vẫn là
// nháp và vừa bị xoá — nếu ai đó đã bấm Gửi ở màn khác, ta không được đụng vào dòng
// của một đợt đã gửi. Trả số đợt đã huỷ để nơi gọi biết có làm gì không.
export async function discardDraft(batchId) {
  const { data, error } = await db.from('proposal_batches')
    .delete().eq('id', batchId).eq('trang_thai', 'NHAP').select();
  if (error) throw error;
  const daHuy = (data || []).length;
  if (daHuy > 0) {
    const { error: e2 } = await db.from('purchase_proposals').delete().eq('batch_id', batchId);
    if (e2) throw e2;
  }
  return { daHuy };   // 0 = đợt không còn là nháp, không xoá gì
}

// Danh sách đợt, mới nhất trước.
export async function listBatches(limit = 50) {
  const { data, error } = await db.from('proposal_batches')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
