// ============================================================
// CHỐNG TRÙNG CHỨNG TỪ CHỜ IN (idempotency guard)
// ------------------------------------------------------------
// Mỗi lần điền 1 phiếu (nhập/xuất kho) app cấp 1 batch_token duy nhất và
// GIỮ NGUYÊN token đó cho tới khi lưu xong hoặc mở phiếu mới. Trước khi trừ
// kho / ghi picking-log, gọi claimDocToken(): nó INSERT token vào bảng khóa
// print_doc_guard (batch_token là PRIMARY KEY). Lần thứ 2 với cùng token bị
// Postgres từ chối (mã lỗi 23505) → trả về { ok:false, duplicate:true } để
// luồng gọi DỪNG, không tạo chứng từ / không trừ kho lần nữa.
//
// Nhờ khóa nằm ở DB nên chống trùng TUYỆT ĐỐI kể cả khi: bấm nút nhiều lần,
// tải lại trang rồi gửi lại, mở nhiều tab, hay mạng retry request.
//
// Yêu cầu: đã chạy sql/create_print_doc_guard.sql trên Supabase.
// ============================================================
import { supabase as db } from './supabase';

// Nhận biết lỗi "bảng print_doc_guard CHƯA được tạo" (SQL chưa chạy trên Supabase).
// Khi đó guard chưa sẵn sàng → fail-open (cho thao tác chạy như trước) để KHÔNG chặn
// nhập/xuất kho. Chống trùng sẽ tự kích hoạt ngay khi bảng tồn tại.
function isGuardTableMissing(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  return code === '42P01'                 // undefined_table (Postgres)
    || code === 'PGRST205'                // PostgREST: table not in schema cache
    || (msg.includes('print_doc_guard') && (msg.includes('does not exist') || msg.includes('schema cache')));
}

// Sinh token duy nhất cho 1 lần điền phiếu.
export function newDocToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (trình duyệt cũ): vẫn đủ độ duy nhất thực tế cho 1 thao tác.
  return 'tok-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

// Chiếm token trước khi tạo chứng từ.
//   token: chuỗi từ newDocToken() (bắt buộc, ổn định suốt 1 phiếu)
//   meta:  { orderCode, kind, createdBy } — thông tin phụ để tra cứu/báo lại
// Trả về:
//   { ok:true }                                   → lần đầu, được phép tạo chứng từ
//   { ok:false, duplicate:true, orderCode }       → token đã dùng → ĐỪNG tạo nữa
// Ném lỗi nếu lỗi mạng/DB khác (để luồng gọi báo lỗi bình thường).
export async function claimDocToken(token, { orderCode = null, kind = null, createdBy = null } = {}) {
  if (!token) throw new Error('Thiếu batch_token khi tạo chứng từ (docGuard).');

  const { error } = await db
    .from('print_doc_guard')
    .insert({ batch_token: token, order_code: orderCode, kind, created_by: createdBy });

  if (error) {
    // Bảng chưa tạo (chưa chạy SQL) → fail-open: cho thao tác chạy, chưa chống trùng.
    if (isGuardTableMissing(error)) {
      console.warn('[docGuard] Bảng print_doc_guard chưa tồn tại — chống trùng CHƯA kích hoạt. Hãy chạy sql/create_print_doc_guard.sql.');
      return { ok: true, guardUnavailable: true };
    }
    // 23505 = unique_violation → token đã tồn tại → đây là lần bấm/gửi trùng.
    if (error.code === '23505') {
      let existingCode = null;
      try {
        const { data } = await db
          .from('print_doc_guard')
          .select('order_code')
          .eq('batch_token', token)
          .maybeSingle();
        existingCode = data?.order_code || null;
      } catch { /* bỏ qua: không tra được mã cũ cũng không sao */ }
      return { ok: false, duplicate: true, orderCode: existingCode };
    }
    throw error;
  }
  return { ok: true };
}

// Nhả token đã chiếm khi thao tác THẤT BẠI trước lúc tạo xong chứng từ,
// để người dùng sửa rồi bấm lưu lại được (không bị kẹt "đã lưu rồi").
// CHỈ gọi khi chắc chắn chưa ghi được picking-log/chứng từ nào.
export async function releaseDocToken(token) {
  if (!token) return;
  try {
    await db.from('print_doc_guard').delete().eq('batch_token', token);
  } catch { /* không chặn luồng chính */ }
}

// Ghi lại mã chứng từ vào token sau khi đã sinh mã (nếu lúc claim chưa có).
// Chỉ để hiển thị đẹp khi trùng; lỗi ở đây KHÔNG được chặn luồng chính.
export async function setDocTokenOrderCode(token, orderCode) {
  if (!token || !orderCode) return;
  try {
    await db.from('print_doc_guard').update({ order_code: orderCode }).eq('batch_token', token);
  } catch { /* không chặn luồng chính */ }
}
