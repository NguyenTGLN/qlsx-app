import { describe, test, expect } from 'vitest';
import { dongDienGiai } from './quyTrinhDienGiai';
import { datThuTu } from './quyTrinhSoDo';

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

  test('bảng đánh số CÙNG CHIỀU với lưu đồ khi khối cao thấp đứng chung một hàng', () => {
    // Bảng diễn giải in ngay dưới lưu đồ, trên cùng một trang A3. Khối Quyết
    // định (cao 86) ở cột PHẢI và khối Thao tác (cao 56) ở cột TRÁI đặt chung
    // một hàng thì trên hình phải đọc trái → phải; đánh số theo mép trên là
    // Quyết định lên trước, tức bảng nói ngược lại chính cái hình bên trên nó.
    const s = {
      lanes: [{ name: 'Kho', owner: 'Thủ kho', color: '#0d9488' },
              { name: 'QC', owner: 'NV QC', color: '#16a34a' }],
      phases: [{ name: 'G', h: 360 }],
      nodes: [
        { id: 's', t: 'start', lane: 0, y: 36, dx: 0, w: 164, h: 48, tx: 'Bắt đầu', desc: '', form: '—', time: '—' },
        // Cùng tâm 180: Thao tác y=152, Quyết định y=137.
        { id: 'tt', t: 'step', lane: 0, y: 152, dx: 0, w: 164, h: 56, tx: 'Soạn hàng', desc: 'x', form: '—', time: '—' },
        { id: 'qd', t: 'dec',  lane: 1, y: 137, dx: 0, w: 150, h: 86, tx: 'Đạt?',      desc: 'x', form: '—', time: '—' },
      ],
      edges: [{ id: 'e1', a: 's', b: 'tt', lbl: '', k: 'n' }, { id: 'e2', a: 'tt', b: 'qd', lbl: '', k: 'n' }],
    };
    expect(dongDienGiai(s).map(r => r.ten)).toEqual(['Soạn hàng', 'Đạt?']);
    expect(dongDienGiai(s).map(r => r.stt)).toEqual([1, 2]);
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

describe('dongDienGiai đi theo thứ tự bước ĐÃ ĐÁNH TAY', () => {
  // Bảng diễn giải (và bản in ISO dựng từ nó) không có thứ tự riêng — nó đọc
  // thuTuBuoc. Đổi số bước ở trình vẽ mà bảng không đổi theo là hai tài liệu
  // nói hai điều khác nhau về cùng một quy trình.
  test('stt và tên chạy đúng theo soDo.thuTu', () => {
    const s = { ...soDo, thuTu: ['b2', 'd', 'b3', 'b1'] };
    const r = dongDienGiai(s);
    expect(r.map(x => x.stt)).toEqual([1, 2, 3, 4]);
    expect(r.map(x => x.ten)).toEqual(['Nhập kho', 'Đạt?', 'Tái chế', 'Xuất kho']);
  });

  test('đổi bước 3 thành bước 2 ⇒ bảng đổi theo, bước 2 cũ thành 3', () => {
    const truoc = dongDienGiai(soDo);
    expect(truoc.map(x => x.ten)).toEqual(['Xuất kho', 'Đạt?', 'Tái chế', 'Nhập kho']);
    const id3 = truoc.find(x => x.stt === 3).khoiId;      // 'b3' — Tái chế
    const id2 = truoc.find(x => x.stt === 2).khoiId;      // 'd'  — Đạt?
    const sau = dongDienGiai(datThuTu(soDo, id3, 2));
    expect(sau.find(x => x.khoiId === id3).stt).toBe(2);
    expect(sau.find(x => x.khoiId === id2).stt).toBe(3);
    expect(sau.map(x => x.stt)).toEqual([1, 2, 3, 4]);
    expect(sau.map(x => x.ten)).toEqual(['Xuất kho', 'Tái chế', 'Đạt?', 'Nhập kho']);
  });

  test('mọi thứ khác của dòng giữ nguyên — chỉ số thứ tự đổi', () => {
    const truoc = dongDienGiai(soDo);
    const sau = dongDienGiai(datThuTu(soDo, 'b3', 2));
    for (const d of truoc) {
      const m = sau.find(x => x.khoiId === d.khoiId);
      expect({ ...m, stt: 0 }).toEqual({ ...d, stt: 0 });
    }
  });

  test('thuTu RÁC ⇒ bảng vẫn đánh số 1..n theo vị trí, không trùng không hụt', () => {
    for (const rac of [null, 'abc', [1, 2, 3], ['zzz'], ['b1', 'b1']]) {
      const r = dongDienGiai({ ...soDo, thuTu: rac });
      expect(r.map(x => x.stt)).toEqual([1, 2, 3, 4]);
      expect(new Set(r.map(x => x.khoiId)).size).toBe(4);
    }
  });
});
