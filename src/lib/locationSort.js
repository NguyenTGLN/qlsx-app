// Sắp xếp vị trí kho theo đúng quy ước vật lý của kho.
// Một vị trí "chuẩn" có dạng [DÃY][TẦNG][Ô], ví dụ: HH3, HB4, EH12, HM5.
//   1. DÃY  (đúng 1 ký tự đầu): sắp A → Z
//   2. TẦNG (1 ký tự): M < H < B < T < N < S  (Một-Hai-Ba-Tư-Năm-Sáu) —
//      thứ tự tầng kệ, KHÔNG phải thứ tự bảng chữ cái (abc sẽ là B,H,M,N,S,T → sai).
//   3. Ô    (số): so theo GIÁ TRỊ 1 → 2 → … → 10 → 20 (không phải so chuỗi).
// Vị trí đặc biệt không đúng mẫu (VP… văn phòng, PBH… phòng bảo hành, SX9-…)
// rơi về so sánh tự nhiên và luôn xếp CUỐI, sau các vị trí chuẩn.

const TIER_WEIGHT = { M: 1, H: 2, B: 3, T: 4, N: 5, S: 6 };

// Tách 1 vị trí thành { dãy, tầng, ô }. Trả match=false nếu không đúng mẫu.
// Dãy bắt buộc đúng 1 ký tự — nếu cho phép nhiều ký tự thì "PBH1" (phòng bảo hành)
// sẽ bị hiểu nhầm thành dãy "PB" + tầng "H".
export function parseLocation(loc) {
  const s = String(loc || '').toUpperCase().trim();
  const m = s.match(/^([A-Z])([MHBTNS])(\d+)$/);
  if (m) {
    return { match: true, day: m[1], tier: TIER_WEIGHT[m[2]], cell: parseInt(m[3], 10) };
  }
  return { match: false, raw: s };
}

// So sánh tự nhiên (chữ A→Z, số theo giá trị) cho mã không đúng mẫu.
function naturalCompare(a, b) {
  const segs = (s) => String(s || '').toUpperCase().match(/\d+|\D+/g) || [];
  const sa = segs(a), sb = segs(b);
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const x = sa[i], y = sb[i];
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return sa.length - sb.length;
}

// So sánh 2 vị trí để dùng với Array.prototype.sort (tăng dần).
export function compareLocations(a, b) {
  const pa = parseLocation(a), pb = parseLocation(b);
  if (pa.match && pb.match) {
    if (pa.day !== pb.day) return pa.day < pb.day ? -1 : (pa.day > pb.day ? 1 : 0);
    if (pa.tier !== pb.tier) return pa.tier - pb.tier;
    return pa.cell - pb.cell;
  }
  // Đúng mẫu luôn đứng trước không đúng mẫu
  if (pa.match !== pb.match) return pa.match ? -1 : 1;
  return naturalCompare(a, b);
}
