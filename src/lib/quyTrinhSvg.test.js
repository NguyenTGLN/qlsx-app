import { describe, test, expect } from 'vitest';
import { thoatXml, soDoSangSvg } from './quyTrinhSvg';
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
});
