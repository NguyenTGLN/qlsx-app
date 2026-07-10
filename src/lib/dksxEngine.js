import { supabase as db } from './supabase';
import { todayLocal } from './dateUtils';
import { classifyProposalRows, buildShortfallProposalRow, buildArchiveRow, computeShortfall } from './proposalQty';

function makeDlkDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

// Tiền tố DLK trong ngày + số seq lớn nhất đang dùng. Dùng chung cho recompute & sendRetail.
async function nextDlkSeq() {
  const prefix = `DLK-${makeDlkDate()}-`;
  const { data: existing } = await db.from('purchase_proposals').select('dlk_code').ilike('dlk_code', `${prefix}%`);
  const seq = (existing || []).reduce((m, r) => {
    const n = parseInt((r.dlk_code || '').split('-').pop(), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return { prefix, seq };
}

// Nổ BOM đệ quy: code → linh kiện lá, cộng dồn vào acc. Chống cycle bằng visited.
export function explodeBom(bomMap, code, qty, acc = {}, visited = new Set()) {
  if (visited.has(code)) return acc;
  if (bomMap[code] && bomMap[code].length > 0) {
    visited.add(code);
    bomMap[code].forEach(c => explodeBom(bomMap, c.component, qty * c.qty, acc, visited));
    visited.delete(code);
  } else {
    acc[code] = (acc[code] || 0) + qty;
  }
  return acc;
}

// Tải BOM thành map { product_code: [{component, qty}] }
// PHẢI phân trang: bom_items > 1000 dòng, Supabase mặc định cắt ở 1000 → thiếu BOM → nổ không hết.
export async function loadBomMap() {
  let rows = [], p = 0;
  while (true) {
    const { data } = await db.from('bom_items').select('product_code, component_code, quantity').range(p * 1000, (p + 1) * 1000 - 1);
    if (data) rows = rows.concat(data);
    if (!data || data.length < 1000) break;
    p++;
  }
  const map = {};
  rows.forEach(b => {
    if (!map[b.product_code]) map[b.product_code] = [];
    map[b.product_code].push({ component: b.component_code, qty: Number(b.quantity) || 1 });
  });
  return map;
}

// Tồn kho linh kiện = "tồn hàng hóa" (cộng dồn theo mã, GỒM cả vị trí WIP SX9-).
// Nhất quán với tab Tồn HH: đặt hàng/đối chiếu dùng tồn hàng hóa; chỉ luồng XUẤT mới né SX9.
export async function loadComponentStock() {
  let stock = [], p = 0;
  while (true) {
    const { data } = await db.from('inventory_stock').select('item_code, quantity, location').range(p * 1000, (p + 1) * 1000 - 1);
    if (data) stock = stock.concat(data);
    if (!data || data.length < 1000) break;
    p++;
  }
  const map = {};
  stock.forEach(r => {
    map[r.item_code] = (map[r.item_code] || 0) + (Number(r.quantity) || 0);
  });
  return map;
}

// Tồn linh kiện KHÔNG tính kho dở dang SX9- (khớp luồng XUẤT linh kiện cho sản xuất).
export async function loadComponentStockExclWip() {
  let stock = [], p = 0;
  while (true) {
    const { data } = await db.from('inventory_stock').select('item_code, quantity, location').range(p * 1000, (p + 1) * 1000 - 1);
    if (data) stock = stock.concat(data);
    if (!data || data.length < 1000) break;
    p++;
  }
  const map = {};
  stock.forEach(r => {
    if (String(r.location || '').startsWith('SX9-')) return; // né kho dở dang (WIP)
    map[r.item_code] = (map[r.item_code] || 0) + (Number(r.quantity) || 0);
  });
  return map;
}

// "Làm được ngay" theo BOM 1 CẤP trực tiếp (khớp lệnh sản xuất — KHÔNG nổ qua bán-thành-phẩm).
// stockMap nên là tồn đã né SX9. Trả { buildable, feasibility } hoặc null nếu mã không có BOM.
export function buildableNow(bomMap, stockMap, code, demand) {
  const bom = bomMap[code];
  if (!bom || bom.length === 0) return null;
  let buildable = demand;
  bom.forEach(c => {
    const per = Number(c.qty) || 0;
    if (per > 0) {
      const canBuild = Math.floor((stockMap[c.component] || 0) / per);
      if (canBuild < buildable) buildable = canBuild;
    }
  });
  buildable = Math.max(0, buildable);
  return { buildable, feasibility: demand > 0 ? Math.min(100, Math.round(buildable / demand * 100)) : 100 };
}

// Tính lại bảng Đề xuất DLK theo NET = nổ BOM toàn bộ DKSX − tồn linh kiện − DLK đã cam kết.
// Giữ nguyên DLK đã 'Đã đặt mua'/'Chờ xác nhận'/... ; chỉ thay các dòng còn 'Mới'.
export async function recomputeProposals() {
  const [{ data: dksx }, bomMap, stockMap] = await Promise.all([
    db.from('production_demand').select('id, item_code, qty_demand').gt('qty_demand', 0),
    loadBomMap(),
    loadComponentStock(),
  ]);
  const isParent = (c) => bomMap[c] && bomMap[c].length > 0;

  // Tự dọn nhu cầu SX "rác": mã không còn là thành phẩm (đã mất BOM) thì không thể sản xuất.
  // Vô hiệu hoá (qty_demand=0, Hủy) để không hiện badge "ĐX SX" sai ở Tồn HH và không làm phồng nhu cầu linh kiện.
  const orphanDemandIds = (dksx || []).filter(d => !isParent(d.item_code)).map(d => d.id);
  if (orphanDemandIds.length) {
    await db.from('production_demand').update({ qty_demand: 0, trang_thai: 'Hủy' }).in('id', orphanDemandIds);
  }

  // Gross: chỉ nổ BOM nhu cầu của thành phẩm hợp lệ (bỏ qua mã rác vừa vô hiệu hoá)
  const gross = {};
  (dksx || []).forEach(d => { if (isParent(d.item_code)) explodeBom(bomMap, d.item_code, Number(d.qty_demand) || 0, gross); });

  // Tất cả dòng DLK: committed (đã đặt) để trừ nhu cầu; map dòng 'Mới' theo item_code (≤1/mã sau migration)
  const { data: dlkAll } = await db.from('purchase_proposals')
    .select('id, item_code, actual_qty, bom_qty, retail_qty, trang_thai, source');
  // Phân loại: dòng 'shortfall' được ghim (committed, không vào openByCode) → engine không xóa/không tạo trùng.
  const { committed, openByCode } = classifyProposalRows(dlkAll);

  // Net bom need / linh kiện lá (bỏ mã còn là thành phẩm có BOM)
  const bomNeed = {};
  Object.keys(gross).forEach(c => {
    if (isParent(c)) return;
    const need = (gross[c] || 0) - (stockMap[c] || 0) - (committed[c] || 0);
    if (need > 0.0001) bomNeed[c] = Math.round(need * 1000) / 1000;
  });

  const today = todayLocal();
  let { prefix, seq } = await nextDlkSeq();
  const toCreate = [];

  // 1) Linh kiện có bom_need > 0: cập nhật dòng 'Mới' (giữ retail_qty) hoặc tạo mới
  for (const c of Object.keys(bomNeed)) {
    const need = bomNeed[c];
    const ex = openByCode[c];
    if (ex) {
      const retail = Number(ex.retail_qty) || 0;
      const total = Math.round((need + retail) * 1000) / 1000;
      await db.from('purchase_proposals').update({
        bom_qty: need, calculated_qty: total, actual_qty: total,
        source: retail > 0 ? 'both' : 'bom',
      }).eq('id', ex.id);
      delete openByCode[c];
    } else {
      toCreate.push(c);
    }
  }

  // 2) Dòng 'Mới' còn lại (hết bom_need): giữ phần retail, hoặc xoá nếu cũng hết retail
  const toDelete = [];
  for (const c of Object.keys(openByCode)) {
    const ex = openByCode[c];
    const retail = Number(ex.retail_qty) || 0;
    if (retail > 0) {
      await db.from('purchase_proposals').update({
        bom_qty: 0, calculated_qty: retail, actual_qty: retail, source: 'retail',
      }).eq('id', ex.id);
    } else {
      toDelete.push(ex.id);
    }
  }
  if (toDelete.length) await db.from('purchase_proposals').delete().in('id', toDelete);

  // 3) Insert dòng linh kiện mới (lấy tên/đvt)
  if (toCreate.length) {
    const { data: items } = await db.from('inventory_items').select('item_code, item_name, unit').in('item_code', toCreate);
    const dict = {};
    (items || []).forEach(i => { dict[i.item_code] = i; });
    const rows = toCreate.map(c => {
      seq += 1;
      const need = bomNeed[c];
      return {
        dlk_code: `${prefix}${String(seq).padStart(2, '0')}`,
        item_code: c, item_name: dict[c]?.item_name || '', unit: dict[c]?.unit || '',
        bom_qty: need, retail_qty: 0, calculated_qty: need, actual_qty: need,
        ngay_de_xuat: today, tien_do: 'Mới', trang_thai: 'Mới', source: 'bom', note: '',
      };
    });
    await db.from('purchase_proposals').insert(rows);
  }
  return { created: toCreate.length };
}

// Đóng 1 đề xuất khi hàng về thiếu (chọn LC2 ở modal Nhập kho):
//  1) lưu bản ghi vào purchase_proposals_archive (kèm received_snapshot),
//  2) tạo/cộng dồn đề xuất mới cho phần thiếu (source='shortfall', được engine ghim),
//  3) xóa dòng gốc khỏi purchase_proposals.
// `orig` = đối tượng đề xuất gốc (đủ cột), `received` = tổng đã nhận, `archivedBy` = user.
export async function closeProposalWithShortfall({ orig, received, archivedBy }) {
  const shortfall = computeShortfall(orig.actual_qty, received);
  let shortfallDlkCode = null;

  if (shortfall > 0) {
    // Cộng dồn vào dòng phần thiếu 'Mới' sẵn có cùng mã (nếu có) — tránh tạo nhiều DLK phần thiếu cho 1 mã.
    const { data: existing } = await db.from('purchase_proposals')
      .select('id, dlk_code, calculated_qty')
      .eq('item_code', orig.item_code)
      .eq('source', 'shortfall')
      .eq('trang_thai', 'Mới')
      .neq('id', orig.id)
      .limit(1);
    if (existing && existing.length > 0) {
      const ex = existing[0];
      const newQty = (Number(ex.calculated_qty) || 0) + shortfall;
      const { error: upErr } = await db.from('purchase_proposals').update({
        bom_qty: newQty, calculated_qty: newQty, actual_qty: newQty,
      }).eq('id', ex.id);
      if (upErr) throw upErr;
      shortfallDlkCode = ex.dlk_code;
    } else {
      const { prefix, seq } = await nextDlkSeq();
      shortfallDlkCode = `${prefix}${String(seq + 1).padStart(2, '0')}`;
      const row = buildShortfallProposalRow({ orig, received, dlkCode: shortfallDlkCode, today: todayLocal() });
      const { error: insErr } = await db.from('purchase_proposals').insert(row);
      if (insErr) throw insErr;
    }
  }

  // Lưu trữ TRƯỚC, xóa gốc SAU — chặn xóa nếu lưu trữ lỗi (VD chưa chạy migration) để KHÔNG mất dữ liệu.
  const archiveRow = buildArchiveRow({ orig, received, archivedBy, shortfallDlkCode, archiveReason: 'Đóng do về thiếu' });
  const { error: archErr } = await db.from('purchase_proposals_archive').insert(archiveRow);
  if (archErr) throw archErr;
  const { error: delErr } = await db.from('purchase_proposals').delete().eq('id', orig.id);
  if (delErr) throw delErr;
  return { shortfallDlkCode, shortfall };
}

// Đề xuất MUA THẲNG cho mã bán lẻ (không BOM + có xuất bán): đi thẳng vào purchase_proposals,
// KHÔNG qua DKSX/nổ BOM. Quy tắc MAX giống DKSX: chỉ nâng số đề xuất nếu SL mới > SL cũ.
//   items = [{ item_code, item_name, unit, qty }]
export async function sendRetailProposals(items) {
  const valid = (items || []).filter(it => it && it.item_code && Number(it.qty) > 0);
  if (valid.length === 0) return { created: 0, updated: 0, skippedSmaller: 0 };

  const codes = [...new Set(valid.map(it => it.item_code))];
  // Dòng 'Mới' theo item_code (mọi nguồn — giờ ≤1 dòng/mã).
  // KHÔNG lấy dòng source='shortfall' (đã ghim): nếu không, đề xuất bán lẻ sẽ hijack + đổi source → mất ghim.
  const { data: openRows } = await db.from('purchase_proposals')
    .select('id, item_code, bom_qty, retail_qty')
    .eq('trang_thai', 'Mới')
    .neq('source', 'shortfall')
    .in('item_code', codes);
  const openMap = {};
  (openRows || []).forEach(r => { openMap[r.item_code] = r; });

  const today = todayLocal();
  let { prefix, seq } = await nextDlkSeq();
  const inserts = [];
  let updated = 0, skippedSmaller = 0;

  for (const it of valid) {
    const qty = Math.round(Number(it.qty) * 1000) / 1000;
    const ex = openMap[it.item_code];
    if (ex) {
      const oldRetail = Number(ex.retail_qty) || 0;
      if (qty > oldRetail) { // MAX trên kênh bán lẻ
        const bom = Number(ex.bom_qty) || 0;
        const total = Math.round((bom + qty) * 1000) / 1000;
        await db.from('purchase_proposals').update({
          retail_qty: qty, calculated_qty: total, actual_qty: total,
          source: bom > 0 ? 'both' : 'retail', ngay_de_xuat: today,
        }).eq('id', ex.id);
        updated++;
      } else {
        skippedSmaller++;
      }
    } else {
      seq += 1;
      inserts.push({
        dlk_code: `${prefix}${String(seq).padStart(2, '0')}`,
        item_code: it.item_code, item_name: it.item_name || '', unit: it.unit || '',
        bom_qty: 0, retail_qty: qty, calculated_qty: qty, actual_qty: qty,
        ngay_de_xuat: today, tien_do: 'Mới', trang_thai: 'Mới', source: 'retail', note: '',
      });
    }
  }
  if (inserts.length) await db.from('purchase_proposals').insert(inserts);
  return { created: inserts.length, updated, skippedSmaller };
}

// ── Ngày cần về kho ────────────────────────────────────────────────────────
// needed = ngày cạn kho GẤP NHẤT (giữa bán lẻ của chính mã & thành phẩm có bán
// chứa nó qua nổ BOM ngược) − 5 ngày đệm. Trả { [item_code]: { neededTs, daysLeft } }.
const NEEDED_BUFFER_DAYS = 5;
const DAY_MS = 86400000;

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// `preStockMap` (tuỳ chọn): tồn hàng hóa đã tải sẵn (item_code→SL) để tránh quét lại
// inventory_stock lần nữa khi caller đã cần bản đồ tồn cho mục đích khác.
export async function computeNeededDates(preStockMap = null) {
  const [stockMap, bomMap, salesRes] = await Promise.all([
    preStockMap ? Promise.resolve(preStockMap) : loadComponentStock(),
    loadBomMap(),
    db.from('sales_90d_summary').select('ma_san_pham, total_sales'),
  ]);

  // TB bán/ngày theo mã (khớp Tồn HH: tổng 90 ngày / 90)
  const avgDaily = {};
  (salesRes.data || []).forEach(r => {
    if (r.ma_san_pham) avgDaily[r.ma_san_pham] = (Number(r.total_sales) || 0) / 90;
  });

  const todayTs = startOfTodayTs();
  const runoutTs = (code) => {
    const v = avgDaily[code];
    if (!v || v <= 0) return null;
    const days = Math.floor((stockMap[code] || 0) / v);
    return todayTs + days * DAY_MS;
  };

  // Kênh sản xuất: mỗi thành phẩm (parent) CÓ bán → nổ BOM → lá; gán min runout(parent) cho lá.
  const prodRunout = {};
  Object.keys(bomMap).forEach(parent => {
    const pr = runoutTs(parent);
    if (pr === null) return;
    const leaves = explodeBom(bomMap, parent, 1);
    Object.keys(leaves).forEach(leaf => {
      if (prodRunout[leaf] === undefined || pr < prodRunout[leaf]) prodRunout[leaf] = pr;
    });
  });

  const codes = new Set([...Object.keys(prodRunout), ...Object.keys(avgDaily)]);
  const result = {};
  codes.forEach(code => {
    const cands = [runoutTs(code), prodRunout[code] ?? null].filter(v => v !== null);
    if (cands.length === 0) return;
    const neededTs = Math.min(...cands) - NEEDED_BUFFER_DAYS * DAY_MS;
    result[code] = { neededTs, daysLeft: Math.round((neededTs - todayTs) / DAY_MS) };
  });
  return result;
}
