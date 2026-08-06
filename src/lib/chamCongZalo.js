// ─────────────────────────────────────────────────────────────────────────────
// Hàm thuần cho phần chấm công qua nhóm Zalo — không chạm Supabase, không chạm React.
//
// Luật so tên KHÔNG nằm ở đây mà nằm trong SQL (`zalo_khop_ten`). Cố ý: viết bản sao
// bằng JS thì hai bản sẽ lệch nhau, đúng lỗi scripts/import-cham-cong.mjs đã mắc — từ
// cùng một tệp cho ra bốn kết quả khác app. Tệp này chỉ lo phần giao diện cần.
// ─────────────────────────────────────────────────────────────────────────────

// Người gửi trong nhóm chấm công CHƯA nối được với nhân viên nào.
//
// Chưa nối mã thì hàm dựng bỏ qua họ hoàn toàn — không chấm công, cũng không ghi nghỉ
// oan. Hướng lỗi an toàn, nhưng hệ quả là KPI chuyên cần của họ để TRỐNG cả tháng. Nên
// danh sách này không phải tiện ích cho vui, nó là màn hình sửa chỗ đó.
export function dsChuaNoiMa({ zaloRows = [], nhanVien = [] } = {}) {
  const daNoi = new Set(
    (nhanVien || []).map(n => String(n?.uid_from ?? '').trim()).filter(Boolean));

  const theoUid = new Map();
  for (const r of zaloRows || []) {
    const uid = String(r?.uid_from ?? '').trim();
    if (!uid || daNoi.has(uid)) continue;
    const ts = Number(r?.ts) || 0;
    const cu = theoUid.get(uid);
    if (!cu) {
      theoUid.set(uid, {
        uid_from: uid, sender_name: r?.sender_name || '', content: r?.content || '',
        ts, soTin: 1,
      });
      continue;
    }
    cu.soTin += 1;
    // Giữ tin MỚI NHẤT: tên hiển thị Zalo đổi được, và nội dung gần đây phản ánh đúng
    // hơn người đó tự xưng là ai.
    if (ts > cu.ts) {
      cu.ts = ts;
      cu.content = r?.content || '';
      cu.sender_name = r?.sender_name || cu.sender_name;
    }
  }
  return [...theoUid.values()].sort((a, b) => b.soTin - a.soTin || b.ts - a.ts);
}

// Bản phản chiếu về sớm trong cham_cong có khớp bảng gốc ve_som_tay không.
//
// Tách hai con số chứ không gộp: `soLech` bấm nút "Áp lại" là xong, còn `soThieuDong`
// thì nút đó KHÔNG với tới được (UPDATE không tạo được dòng) — phải dựng lại từ Zalo
// hoặc nạp Excel. Gộp làm một là người dùng bấm mãi mà con số không về 0.
export function demVeSomLech({ rows = [], veSomTay = [] } = {}) {
  const tra = new Map();
  for (const r of rows || []) {
    tra.set(`${r?.nhan_vien_id}|${r?.ngay}`, Number(r?.ve_som_phut) || 0);
  }
  let soLech = 0, soThieuDong = 0;
  for (const v of veSomTay || []) {
    const hien = tra.get(`${v?.nhan_vien_id}|${v?.ngay}`);
    if (hien === undefined) { soThieuDong += 1; continue; }
    if (hien !== (Number(v?.so_phut) || 0)) soLech += 1;
  }
  return { soLech, soThieuDong };
}
