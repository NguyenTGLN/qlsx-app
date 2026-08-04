import { describe, test, expect } from 'vitest';
import { thoatXml, soDoSangSvg } from './quyTrinhSvg';
import { GUT, LANE_W, MAU_DAI, CAO_HANG } from './quyTrinhSoDo';
import { mauSoDo } from './quyTrinhMau';

const soDo = {
  lanes: [
    { name: 'Kho', owner: 'Thủ kho', color: '#0d9488' },
    { name: 'QC',  owner: 'NV QC',   color: '#16a34a' },
  ],
  phases: [{ name: 'Chuẩn bị', h: 200 }, { name: 'Kiểm soát', h: 260 }],
  nodes: [
    { id: 's',  t: 'start', lane: 0, y: 20,  dx: 0, w: 164, h: 48, tx: 'Bắt đầu',  desc: '', form: '—', time: '—' },
    { id: 'b1', t: 'step',  lane: 0, y: 110, dx: 0, w: 164, h: 56, tx: 'Xuất kho', desc: 'x', form: '—', time: '—' },
    { id: 'd',  t: 'dec',   lane: 1, y: 230, dx: 0, w: 150, h: 86, tx: 'Đạt?',     desc: 'x', form: '—', time: '—' },
    { id: 'e',  t: 'end',   lane: 1, y: 380, dx: 0, w: 164, h: 48, tx: 'Kết thúc', desc: '', form: '—', time: '—' },
  ],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '',   k: 'n'  },
    { id: 'e2', a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
    { id: 'e3', a: 'd',  b: 'e',  lbl: 'OK', k: 'ok' },
  ],
};

describe('thoatXml', () => {
  test('thoát & < > " và nháy đơn', () => {
    expect(thoatXml('a & b < c > d "e" \'f\'')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
  });
  test('& phải thoát TRƯỚC, không sinh &amp;lt;', () => {
    expect(thoatXml('<')).toBe('&lt;');
    expect(thoatXml('&lt;')).toBe('&amp;lt;');
  });
  test('null/undefined/số → chuỗi rỗng hoặc chuỗi số, không nổ', () => {
    expect(thoatXml(null)).toBe('');
    expect(thoatXml(undefined)).toBe('');
    expect(thoatXml(42)).toBe('42');
  });
});

describe('soDoSangSvg', () => {
  const svg = soDoSangSvg(soDo);

  test('là SVG hợp lệ, có khai báo namespace và kích thước', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
  });

  test('vẽ đủ 4 khối — mỗi khối một nhóm có data-khoi', () => {
    expect((svg.match(/data-khoi="/g) || []).length).toBe(4);
  });

  test('vẽ đủ 3 đường nối', () => {
    expect((svg.match(/data-noi="/g) || []).length).toBe(3);
  });

  test('có tên cột và tên giai đoạn', () => {
    for (const t of ['Kho', 'QC', 'Chuẩn bị', 'Kiểm soát']) expect(svg).toContain(t);
  });

  test('khối Quyết định vẽ bằng polygon hình thoi, không phải chữ nhật', () => {
    expect(svg).toContain('<polygon');
  });

  test('nhãn nhánh OK có mặt', () => {
    expect(svg).toContain('>OK<');
  });

  test('THOÁT ký tự — tên bước có & < > không làm vỡ XML', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Xuất kho & <kiểm> "tra"';
    const out = soDoSangSvg(s);
    // Chữ dài có thể bị cắt xuống dòng, nên kiểm TỪNG MẢNH đã thoát chứ không
    // kiểm cả câu liền mạch — nếu không, đổi bề rộng khối là test vỡ oan.
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;kiểm&gt;');
    expect(out).toContain('&quot;tra&quot;');
    expect(out).not.toContain('<kiểm>');
  });

  test('tỉ lệ nhân đôi kích thước ảnh nhưng giữ nguyên viewBox', () => {
    const g = soDoSangSvg(soDo, { tyLe: 2 });
    const w1 = +/width="(\d+)"/.exec(svg)[1];
    const w2 = +/width="(\d+)"/.exec(g)[1];
    expect(w2).toBe(w1 * 2);
    expect(/viewBox="([^"]+)"/.exec(g)[1]).toBe(/viewBox="([^"]+)"/.exec(svg)[1]);
  });

  test('tên dài bị cắt xuống nhiều dòng, không tràn khỏi khối', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Một tên bước rất dài cần phải xuống dòng nhiều lần mới vừa';
    expect((soDoSangSvg(s).match(/<tspan/g) || []).length).toBeGreaterThan(1);
  });

  test('sơ đồ mẫu (chỉ Bắt đầu → Kết thúc) vẽ được, không nổ', () => {
    expect(() => soDoSangSvg(mauSoDo('SX'))).not.toThrow();
  });

  test('đường nối trỏ tới khối đã xoá thì bỏ qua, không nổ', () => {
    const s = structuredClone(soDo);
    s.edges.push({ id: 'ex', a: 'b1', b: 'khong-co', lbl: '', k: 'n' });
    expect(() => soDoSangSvg(s)).not.toThrow();
    expect((soDoSangSvg(s).match(/data-noi="/g) || []).length).toBe(3);
  });

  test('từ dài không có dấu cách bị CẮT, không tràn khỏi khối', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'X'.repeat(60);
    const out = soDoSangSvg(s);
    const dongChu = [...out.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(m => m[1]);
    expect(dongChu.every(d => d.length <= 24)).toBe(true);
    expect(dongChu.some(d => d.length >= 20)).toBe(true);   // có cắt thật, không nuốt chữ
  });

  test('chữ quá dài bị cắt thì phải CÓ DẤU … cho biết là đã cắt', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Kiểm tra siết bu lông và làm sạch bề mặt sơn mối hàn và các chi tiết phụ trợ khác trước khi chuyển sang công đoạn tiếp theo của dây chuyền';
    expect(soDoSangSvg(s)).toContain('…');
  });

  test('chữ vừa đủ thì KHÔNG bị thêm dấu …', () => {
    const s = structuredClone(soDo);
    s.nodes[1].tx = 'Xuất kho theo BOM';
    expect(soDoSangSvg(s)).not.toContain('…');
  });

  test('màu khối và loại nhánh cũng được thoát khi đưa vào thuộc tính', () => {
    const s = structuredClone(soDo);
    s.nodes[1].color = '#fff" onload="x';
    s.edges[0].k = 'n" x="';
    const out = soDoSangSvg(s);
    expect(out).not.toContain('onload="x');
    expect(out).toContain('&quot;');
  });

  /* thoatXml chỉ lo phần CHỮ. Toạ độ trước đây nội suy thẳng vì mặc định là số —
     mà so_do là jsonb, không ràng buộc kiểu. Chuỗi lọt vào đó thoát ra khỏi
     thuộc tính và chèn được thẻ THẬT. Vô hại khi SVG nạp qua <img> blob (trình
     duyệt không chạy script trong ảnh), nhưng XemTruocTab nhúng thẳng chuỗi này
     vào trang bằng dangerouslySetInnerHTML — chỗ đó thì chạy. */
  test('toạ độ độc hại bị ép về SỐ, không chèn được thẻ vào SVG', () => {
    const s = structuredClone(soDo);
    s.nodes[1].y = '0"><script>alert(1)</script><rect x="0';
    s.nodes[1].h = '"><img src=x onerror=alert(1)>';
    s.phases[0].h = '"><foreignObject>';
    const out = soDoSangSvg(s);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<foreignObject');
    expect(out).not.toContain('NaN');
  });

  test('toạ độ hợp lệ dạng chuỗi số vẫn dùng được', () => {
    const s = structuredClone(soDo);
    s.nodes[1].y = '160';
    expect(soDoSangSvg(s)).toContain('160');
  });

  /* ── DẢI BƯỚC ────────────────────────────────────────────────────
     Bản in A3 là lý do có tính năng này, nên nó phải nằm trong CHÍNH chuỗi SVG
     đã dùng cho PNG, ảnh nhúng .docx và màn hình Xem trước — không riêng trình
     vẽ. Bốn khối của sơ đồ mẫu ở bốn tầm khác nhau ⇒ 4 dải ⇒ 3 vạch ngăn và 2
     dải được tô nền (so le, dải đầu để trắng). */
  test('DẢI BƯỚC — mỗi bước một hàng, có mặt trong ảnh xuất ra', () => {
    expect((svg.match(new RegExp(`stroke="${MAU_DAI.vach}"`, 'g')) || []).length).toBe(3);
    expect((svg.match(new RegExp(`fill="${MAU_DAI.nen}"`, 'g')) || []).length).toBe(2);
  });

  test('dải bước vẽ DƯỚI CÙNG — trước vạch giai đoạn, trước đường nối và khối', () => {
    const dai = svg.indexOf(MAU_DAI.vach);
    expect(dai).toBeGreaterThan(-1);
    expect(dai).toBeLessThan(svg.indexOf('#d6dee9'));      // vạch ngăn giai đoạn
    expect(dai).toBeLessThan(svg.indexOf('data-noi="'));   // đường nối
    expect(dai).toBeLessThan(svg.indexOf('data-khoi="'));  // khối
  });

  test('dải bước chỉ trải trên phần VẼ, không đè lên cột nhãn giai đoạn', () => {
    const nen = [...svg.matchAll(new RegExp(
      `<rect x="([\\d.]+)" y="[\\d.]+" width="([\\d.]+)" height="([\\d.]+)" fill="${MAU_DAI.nen}"/>`, 'g'))];
    expect(nen).toHaveLength(2);
    for (const m of nen) {
      expect(+m[1]).toBe(GUT);                 // bắt đầu sau cột nhãn giai đoạn
      expect(+m[2]).toBe(2 * LANE_W);          // đúng bề ngang phần vẽ
      expect(+m[3]).toBeGreaterThan(0);        // không có dải cao 0 hay cao âm
    }
    for (const m of svg.matchAll(new RegExp(`<line x1="([\\d.]+)"[^/]*stroke="${MAU_DAI.vach}"`, 'g'))) {
      expect(+m[1]).toBe(GUT);
    }
  });

  test('DẢI ĐỀU NHAU — mọi dải cao đúng CAO_HANG, vạch ngăn cách đều', () => {
    const nen = [...svg.matchAll(new RegExp(
      `<rect x="[\\d.]+" y="([\\d.]+)" width="[\\d.]+" height="([\\d.]+)" fill="${MAU_DAI.nen}"/>`, 'g'))];
    expect(nen.length).toBeGreaterThan(0);
    for (const m of nen) expect(+m[2]).toBe(CAO_HANG);
    const vach = [...svg.matchAll(new RegExp(
      `<line x1="[\\d.]+" y1="([\\d.]+)"[^/]*stroke="${MAU_DAI.vach}"`, 'g'))].map(m => +m[1]);
    expect(vach.length).toBeGreaterThan(1);
    for (let i = 1; i < vach.length; i++) expect(vach[i] - vach[i - 1]).toBe(CAO_HANG);
  });

  test('DỜI KHỐI ĐI ĐÂU thì dải vẫn thế — chiều cao hàng không theo chỗ khối đứng', () => {
    const s = structuredClone(soDo);
    s.nodes[2].y = 138 - 86 / 2;   // kéo Quyết định lên ngang hàng Xuất kho
    const out = soDoSangSvg(s);
    const dem = (t, re) => (t.match(re) || []).length;
    const reVach = new RegExp(`stroke="${MAU_DAI.vach}"`, 'g');
    const reNen  = new RegExp(`fill="${MAU_DAI.nen}"`, 'g');
    expect(dem(out, reVach)).toBe(dem(svg, reVach));
    expect(dem(out, reNen)).toBe(dem(svg, reNen));
  });

  test('sơ đồ mẫu (hai khối) vẫn ra dải, không nổ và không đẻ NaN', () => {
    const out = soDoSangSvg(mauSoDo('SX'));
    expect(out).not.toContain('NaN');
    expect(out).toContain(MAU_DAI.vach);
  });
});
