import { describe, test, expect } from 'vitest';
import { dongDienGiai } from './quyTrinhDienGiai';

const soDo = {
  lanes: [
    { name: 'Kho', owner: 'Thủ kho', color: '#0d9488' },
    { name: 'QC',  owner: 'NV QC',   color: '#16a34a' },
  ],
  phases: [{ name: 'G', h: 600 }],
  nodes: [
    { id: 's',  t: 'start', lane: 0, y: 10,  dx: 0, w: 164, h: 48, tx: 'Bắt đầu', desc: '', form: '—', time: '—' },
    { id: 'b1', t: 'step',  lane: 0, y: 100, dx: 0, w: 164, h: 56, tx: 'Xuất kho',  desc: 'Soạn hàng', form: 'PSX · BOM', time: '3 giờ' },
    { id: 'd',  t: 'dec',   lane: 1, y: 200, dx: 0, w: 150, h: 86, tx: 'Đạt?',      desc: 'Xét QC',   form: '—',        time: '—' },
    { id: 'b2', t: 'step',  lane: 1, y: 320, dx: 0, w: 164, h: 56, tx: 'Nhập kho',  desc: 'Dán tem',  form: 'PNK',      time: '1 giờ' },
    { id: 'b3', t: 'step',  lane: 0, y: 320, dx: 0, w: 164, h: 56, tx: 'Tái chế',   desc: 'Sửa lại',  form: 'NG-01',    time: '—' },
    { id: 'e',  t: 'end',   lane: 1, y: 440, dx: 0, w: 164, h: 48, tx: 'Kết thúc',  desc: '', form: '—', time: '—' },
  ],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '',   k: 'n'  },
    { id: 'e2', a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
    { id: 'e3', a: 'd',  b: 'b2', lbl: 'OK', k: 'ok' },
    { id: 'e4', a: 'd',  b: 'b3', lbl: 'NG', k: 'ng' },
    { id: 'e5', a: 'b2', b: 'e',  lbl: '',   k: 'n'  },
    { id: 'e6', a: 'b3', b: 'b1', lbl: 'Làm lại', k: 'ng' },
  ],
};

describe('dongDienGiai', () => {
  const rows = dongDienGiai(soDo);

  test('bỏ Bắt đầu/Kết thúc, đánh số 1..n liên tục', () => {
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.stt)).toEqual([1, 2, 3, 4]);
  });

  test('thứ tự trên→dưới rồi trái→phải', () => {
    expect(rows.map(r => r.ten)).toEqual(['Xuất kho', 'Đạt?', 'Tái chế', 'Nhập kho']);
  });

  test('người thực hiện SUY RA từ cột, không lấy từ khối', () => {
    expect(rows.find(r => r.ten === 'Xuất kho').nguoiThucHien).toBe('Thủ kho');
    expect(rows.find(r => r.ten === 'Nhập kho').nguoiThucHien).toBe('NV QC');
  });

  test('đánh dấu nhánh OK / NG theo đường nối đi vào', () => {
    expect(rows.find(r => r.ten === 'Nhập kho').nhanh).toBe('ok');
    expect(rows.find(r => r.ten === 'Tái chế').nhanh).toBe('ng');
    expect(rows.find(r => r.ten === 'Xuất kho').nhanh).toBe('');
  });

  test('tách hồ sơ theo dấu · thành danh sách', () => {
    expect(rows.find(r => r.ten === 'Xuất kho').hoSo).toEqual(['PSX', 'BOM']);
    expect(rows.find(r => r.ten === 'Đạt?').hoSo).toEqual([]);
  });

  test('giữ nguyên id khối để bấm vào dòng là nhảy tới khối', () => {
    expect(rows.find(r => r.ten === 'Đạt?').khoiId).toBe('d');
  });

  test('cột không tồn tại → người thực hiện là "—", không nổ', () => {
    const s = { ...soDo, nodes: [{ ...soDo.nodes[1], lane: 99 }], edges: [] };
    expect(dongDienGiai(s)[0].nguoiThucHien).toBe('—');
  });

  test('sơ đồ rỗng → mảng rỗng', () => {
    expect(dongDienGiai({ lanes: [], phases: [], nodes: [], edges: [] })).toEqual([]);
  });

  test('bước bị vòng "Làm lại" quay về VẪN là bước chính, không tô nhánh NG', () => {
    // b1 có 2 đường vào: e1 thường từ Bắt đầu, e6 nhánh NG từ Tái chế.
    expect(rows.find(r => r.ten === 'Xuất kho').nhanh).toBe('');
  });

  test('điểm hợp lưu — vừa có đường thường vừa có nhánh OK → không tô nhánh', () => {
    const s = structuredClone(soDo);
    s.edges.push({ id: 'e7', a: 'b3', b: 'b2', lbl: 'OK', k: 'ok' });
    const r = dongDienGiai(s).find(x => x.ten === 'Nhập kho');
    expect(r.nhanh).toBe('ok');     // vẫn 'ok': mọi đường vào đều là nhánh
    const s2 = structuredClone(s);
    s2.edges.push({ id: 'e8', a: 'b1', b: 'b2', lbl: '', k: 'n' });
    expect(dongDienGiai(s2).find(x => x.ten === 'Nhập kho').nhanh).toBe('');
  });
});
