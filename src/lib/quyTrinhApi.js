// ============================================================
// QUY TRÌNH — lớp gọi Supabase. Chỗ DUY NHẤT của phân hệ chạm DB.
// Spec: docs/superpowers/specs/2026-08-03-phan-he-quy-trinh-design.md (mục B, C, H)
//
// Ba chuyển trạng thái đi qua RPC, KHÔNG update thẳng cột trang_thai —
// cột đó đã bị revoke khỏi quyền ghi của vai trò authenticated.
// ============================================================

import { supabase, fetchAllRows } from './supabase';
import { mauSoDo, mauTaiLieu, maSoTiepTheo } from './quyTrinhMau';

const nem = (e, viec) => { if (e) throw new Error(`${viec}: ${e.message || e}`); };

export async function dsQuyTrinh() {
  const { data, error } = await fetchAllRows(() =>
    supabase.from('quy_trinh').select('*').order('ma_so'));
  nem(error, 'Không tải được danh mục quy trình');
  return data || [];
}

export async function taiPhienBan(quyTrinhId) {
  const { data, error } = await supabase
    .from('quy_trinh_phien_ban').select('*')
    .eq('quy_trinh_id', quyTrinhId).order('lan_ban_hanh', { ascending: false });
  nem(error, 'Không tải được các phiên bản');
  return data || [];
}

/** Bản để mở ra sửa: ưu tiên bản nháp/chờ duyệt, không có thì bản đang hiệu lực. */
export function banDangLam(dsPhienBan) {
  return dsPhienBan.find(p => p.trang_thai === 'draft')
    || dsPhienBan.find(p => p.trang_thai === 'wait')
    || dsPhienBan.find(p => p.trang_thai === 'published')
    || dsPhienBan[0] || null;
}

export async function taoQuyTrinh({ ten, nhom, nguoiSoan, maDaCo }) {
  const ma_so = maSoTiepTheo(nhom, maDaCo);
  const { data: qt, error: e1 } = await supabase
    .from('quy_trinh')
    .insert({ ma_so, ten, nhom, nguoi_soan: nguoiSoan, trang_thai: 'draft' })
    .select().single();
  nem(e1, 'Không tạo được quy trình');

  const { data: pb, error: e2 } = await supabase
    .from('quy_trinh_phien_ban')
    .insert({
      quy_trinh_id: qt.id, phien_ban: '1.0', lan_ban_hanh: 1, trang_thai: 'draft',
      so_do: mauSoDo(nhom), tai_lieu: { ...mauTaiLieu(nhom), nguoiLap: nguoiSoan },
      nguoi_tao: nguoiSoan, ghi_chu_sua_doi: 'Ban hành lần đầu.',
    })
    .select().single();
  nem(e2, 'Không tạo được phiên bản đầu tiên');
  return { quyTrinh: qt, phienBan: pb };
}

/** Chỉ ghi 3 cột được cấp quyền. Cố ghi trang_thai ở đây sẽ bị DB từ chối. */
export async function luuNhap(phienBanId, { so_do, tai_lieu, ghi_chu_sua_doi }) {
  const { error } = await supabase.from('quy_trinh_phien_ban')
    .update({ so_do, tai_lieu, ghi_chu_sua_doi }).eq('id', phienBanId);
  nem(error, 'Không lưu được bản nháp');
}

export async function doiTenQuyTrinh(id, { ten, nhom }) {
  const { error } = await supabase.from('quy_trinh')
    .update({ ten, nhom, updated_at: new Date().toISOString() }).eq('id', id);
  nem(error, 'Không đổi được tên quy trình');
}

export async function guiDuyet(phienBanId) {
  const { error } = await supabase.rpc('rpc_qt_gui_duyet', { p_phien_ban_id: phienBanId });
  nem(error, 'Không gửi duyệt được');
}

export async function traLai(phienBanId, lyDo) {
  const { error } = await supabase.rpc('rpc_qt_tra_lai', { p_phien_ban_id: phienBanId, p_ly_do: lyDo });
  nem(error, 'Không trả lại được');
}

export async function banHanh(phienBanId) {
  const { error } = await supabase.rpc('rpc_qt_ban_hanh', { p_phien_ban_id: phienBanId });
  nem(error, 'Không ban hành được');
}

export async function xoaQuyTrinh(id) {
  const { data, error } = await supabase.from('quy_trinh').delete().eq('id', id).select('id');
  nem(error, 'Không xoá được quy trình');
  // RLS chặn xoá bằng cách LỌC dòng đi, nên PostgREST trả 204 không kèm lỗi.
  // Không kiểm ở đây thì người dùng bấm xoá, không thấy gì xảy ra, và tưởng hỏng app.
  if (!data || !data.length)
    throw new Error('Không xoá được: chỉ người soạn hoặc Admin mới xoá được, và chỉ xoá được bản nháp.');
}

/** Mục 8 "Theo dõi sửa đổi" = chính danh sách phiên bản, không cần bảng riêng. */
export function lichSuSuaDoi(dsPhienBan) {
  const ngayVn = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
  };
  return dsPhienBan
    .slice()
    .sort((a, b) => a.lan_ban_hanh - b.lan_ban_hanh)
    .map(p => ({
      lan_ban_hanh: p.lan_ban_hanh,
      ngay: ngayVn(p.published_at || p.created_at),
      phien_ban: p.phien_ban,
      noiDung: p.ghi_chu_sua_doi || '',
      nguoi: p.nguoi_ban_hanh || p.nguoi_tao || '',
    }));
}
