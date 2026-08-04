import { describe, test, expect } from 'vitest';
import { kiemTraLuuDo, coTheBanHanh } from './quyTrinhKiemTra';
import { CAO_HANG, LANE_W, drawH, drawW, tuXepLai } from './quyTrinhSoDo';
import { mauSoDo } from './quyTrinhMau';

const K = (id, t, lane, y, extra = {}) => ({
  id, t, lane, y, dx: 0, w: t === 'dec' ? 150 : 164, h: t === 'dec' ? 86 : 56,
  tx: id, desc: 'có diễn giải', form: 'BM-01', time: '1 giờ', ...extra,
});

/** Lưu đồ nhỏ nhưng HỢP LỆ: bắt đầu → thao tác → kết thúc. */
const sach = () => ({
  lanes: [{ name: 'A', owner: 'a', color: '#111111' }],
  phases: [{ name: 'G', h: 400 }],
  nodes: [K('s', 'start', 0, 10), K('b1', 'step', 0, 100), K('e', 'end', 0, 200)],
  edges: [
    { id: 'e1', a: 's',  b: 'b1', lbl: '', k: 'n' },
    { id: 'e2', a: 'b1', b: 'e',  lbl: '', k: 'n' },
  ],
});

describe('kiemTraLuuDo', () => {
  test('lưu đồ hợp lệ → không lỗi, không cảnh báo', () => {
    const r = kiemTraLuuDo(sach());
    expect(r.loi).toEqual([]);
    expect(r.canhBao).toEqual([]);
    expect(coTheBanHanh(sach())).toBe(true);
  });

  test('thiếu khối Bắt đầu → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'start');
    s.edges = s.edges.filter(e => e.a !== 's');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_BAT_DAU')).toBe(true);
  });

  test('thiếu khối Kết thúc → lỗi', () => {
    const s = sach(); s.nodes = s.nodes.filter(n => n.t !== 'end');
    s.edges = s.edges.filter(e => e.b !== 'e');
    expect(kiemTraLuuDo(s).loi.some(l => l.ma === 'THIEU_KET_THUC')).toBe(true);
  });

  test('khối mồ côi không có đường vào → lỗi kèm id khối', () => {
    const s = sach(); s.nodes.push(K('mc', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'mc', b: 'e', lbl: '', k: 'n' });
    const l = kiemTraLuuDo(s).loi.find(x => x.ma === 'KHONG_CO_DUONG_VAO');
    expect(l.khoiId).toBe('mc');
  });

  test('khối không có đường ra → lỗi', () => {
    const s = sach(); s.nodes.push(K('cut', 'step', 0, 300));
    s.edges.push({ id: 'e9', a: 'b1', b: 'cut', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_CO_DUONG_RA' && x.khoiId === 'cut')).toBe(true);
  });

  test('khối Quyết định chỉ có 1 nhánh ra → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300));
    s.edges.push({ id: 'e8', a: 'b1', b: 'd', lbl: '', k: 'n' });
    s.edges.push({ id: 'e9', a: 'd', b: 'e', lbl: 'OK', k: 'ok' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'QUYET_DINH_THIEU_NHANH')).toBe(true);
  });

  test('nhánh của khối Quyết định thiếu nhãn → lỗi', () => {
    const s = sach();
    s.nodes.push(K('d', 'dec', 0, 300), K('b2', 'step', 0, 420));
    s.edges.push(
      { id: 'e8',  a: 'b1', b: 'd',  lbl: '',   k: 'n'  },
      { id: 'e9',  a: 'd',  b: 'e',  lbl: 'OK', k: 'ok' },
      { id: 'e10', a: 'd',  b: 'b2', lbl: '',   k: 'ng' },
      { id: 'e11', a: 'b2', b: 'e',  lbl: '',   k: 'n'  },
    );
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NHANH_THIEU_NHAN')).toBe(true);
  });

  test('bước thiếu diễn giải → lỗi (tài liệu ISO không được có ô trống)', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '   ';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(true);
  });

  test('Bắt đầu/Kết thúc KHÔNG bị đòi diễn giải', () => {
    const s = sach();
    s.nodes.find(n => n.t === 'start').desc = '';
    s.nodes.find(n => n.t === 'end').desc = '';
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'THIEU_DIEN_GIAI')).toBe(false);
  });

  test('thiếu hồ sơ hoặc thời gian → chỉ CẢNH BÁO, vẫn ban hành được', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').form = '—';
    s.nodes.find(n => n.id === 'b1').time = '—';
    const r = kiemTraLuuDo(s);
    expect(r.loi).toEqual([]);
    expect(r.canhBao.length).toBeGreaterThan(0);
    expect(coTheBanHanh(s)).toBe(true);
  });

  test('hai khối chồng lên nhau → cảnh báo', () => {
    const s = sach(); s.nodes.push(K('ck', 'step', 0, 100));
    s.edges.push({ id: 'e8', a: 'b1', b: 'ck', lbl: '', k: 'n' }, { id: 'e9', a: 'ck', b: 'e', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).canhBao.some(x => x.ma === 'CHONG_KHOI')).toBe(true);
  });

  test('còn lỗi thì coTheBanHanh = false', () => {
    const s = sach(); s.nodes.find(n => n.id === 'b1').desc = '';
    expect(coTheBanHanh(s)).toBe(false);
  });

  test('sơ đồ rỗng không làm nổ hàm', () => {
    const r = kiemTraLuuDo({ lanes: [], phases: [], nodes: [], edges: [] });
    expect(r.loi.some(x => x.ma === 'THIEU_BAT_DAU')).toBe(true);
  });

  test('đảo hoang — hai khối nối vòng nhau nhưng không tới được từ Bắt đầu → lỗi', () => {
    const s = sach();
    s.nodes.push(K('p', 'step', 0, 300), K('q', 'step', 0, 400));
    s.edges.push({ id: 'ep', a: 'p', b: 'q', lbl: '', k: 'n' },
                 { id: 'eq', a: 'q', b: 'p', lbl: '', k: 'n' });
    const r = kiemTraLuuDo(s);
    expect(r.loi.filter(x => x.ma === 'KHONG_TOI_DUOC').map(x => x.khoiId).sort()).toEqual(['p', 'q']);
    expect(coTheBanHanh(s)).toBe(false);
  });

  test('khối tự nối vào chính nó cũng bị bắt', () => {
    const s = sach();
    s.nodes.push(K('lp', 'step', 0, 300));
    s.edges.push({ id: 'el', a: 'lp', b: 'lp', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_TOI_DUOC' && x.khoiId === 'lp')).toBe(true);
  });

  test('lưu đồ hợp lệ có VÒNG LẶP quay lại vẫn sạch — không báo nhầm', () => {
    const s = sach();
    s.nodes.push(K('b2', 'step', 0, 300));
    s.edges = [
      { id: 'e1', a: 's',  b: 'b1', lbl: '', k: 'n' },
      { id: 'e2', a: 'b1', b: 'b2', lbl: '', k: 'n' },
      { id: 'e3', a: 'b2', b: 'b1', lbl: 'Làm lại', k: 'ng' },
      { id: 'e4', a: 'b2', b: 'e',  lbl: '', k: 'n' },
    ];
    expect(kiemTraLuuDo(s).loi).toEqual([]);
  });

  test('đường nối trỏ tới khối đã xoá KHÔNG được tính là đã có đường ra', () => {
    const s = sach();
    s.nodes.push(K('cut', 'step', 0, 300));
    s.edges.push({ id: 'ein', a: 'b1', b: 'cut', lbl: '', k: 'n' },
                 { id: 'eout', a: 'cut', b: 'khong-con-nua', lbl: '', k: 'n' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_CO_DUONG_RA' && x.khoiId === 'cut')).toBe(true);
  });

  test('thiếu Bắt đầu thì KHÔNG đổ thêm một trận lỗi không-tới-được', () => {
    const s = sach();
    s.nodes = s.nodes.filter(n => n.t !== 'start');
    s.edges = s.edges.filter(e => e.a !== 's');
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'KHONG_TOI_DUOC')).toBe(false);
  });

  test('5 khối chồng nhau chỉ ra tối đa 4 cảnh báo, không phải 10', () => {
    const s = sach();
    for (let i = 0; i < 4; i++) {
      s.nodes.push(K('c' + i, 'step', 0, 100));
      s.edges.push({ id: 'ci' + i, a: 'b1', b: 'c' + i, lbl: '', k: 'n' },
                   { id: 'co' + i, a: 'c' + i, b: 'e', lbl: '', k: 'n' });
    }
    expect(kiemTraLuuDo(s).canhBao.filter(x => x.ma === 'CHONG_KHOI').length).toBeLessThanOrEqual(4);
  });

  test('quy trình rỗng giữa Bắt đầu và Kết thúc → không ban hành được', () => {
    const s = sach();
    s.nodes = s.nodes.filter(n => n.t === 'start' || n.t === 'end');
    s.edges = [{ id: 'e1', a: 's', b: 'e', lbl: '', k: 'n' }];
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'CHUA_CO_BUOC_NAO')).toBe(true);
    expect(coTheBanHanh(s)).toBe(false);
  });
});

describe('khối lọt ra NGOÀI TRANG — NGOAI_TRANG', () => {
  // Ảnh xuất ra (PNG dán xưởng, ảnh nhúng .docx, bản in A3) lấy viewBox đúng
  // bằng drawW × drawH. Khối nằm ngoài khung đó VẪN hiện trên màn hình soạn
  // thảo và VẪN có một dòng trong bảng diễn giải, nhưng RỤNG khỏi mọi bản in.
  // Người dùng nhìn thấy đủ bước, rồi in ra một tài liệu ISO thiếu bước.
  // Nên đây là LỖI CHẶN, không phải cảnh báo.

  test('lưu đồ đàng hoàng KHÔNG bị báo nhầm — không có lỗi này', () => {
    expect(kiemTraLuuDo(sach()).loi.some(x => x.ma === 'NGOAI_TRANG')).toBe(false);
    expect(kiemTraLuuDo(sach()).canhBao.some(x => x.ma === 'NGOAI_TRANG')).toBe(false);
  });

  test('mẫu sơ đồ khởi tạo của MỌI nhóm đều nằm trọn trong trang', () => {
    for (const nhom of ['SX', 'CL', 'KH', 'CS', 'BH', 'HC']) {
      const s = mauSoDo(nhom);
      expect(kiemTraLuuDo(s).loi.filter(x => x.ma === 'NGOAI_TRANG')).toEqual([]);
    }
  });

  test('khối sát mép trang vẫn là TRONG trang — chạm mép không tính là lọt ra', () => {
    const s = sach();
    s.phases = [{ name: 'G', h: 4 * CAO_HANG }];
    const e = s.nodes.find(n => n.id === 'e');
    e.y = drawH(s) - e.h;                       // đáy khối trùng đúng đáy trang
    const b1 = s.nodes.find(n => n.id === 'b1');
    b1.dx = drawW(s) - (LANE_W / 2 + b1.w / 2); // mép phải khối trùng mép phải trang
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG')).toBe(false);
  });

  // ── Bốn phía ──
  test('BÓP THẤP giai đoạn ⇒ khối dưới cùng lọt ra ngoài đáy trang → lỗi CHẶN', () => {
    const s = sach();
    s.phases = [{ name: 'G', h: 200 }];         // 'e' đang ở y=200, cao 56 ⇒ đáy 256
    const l = kiemTraLuuDo(s).loi.find(x => x.ma === 'NGOAI_TRANG');
    expect(l).toBeTruthy();
    expect(l.khoiId).toBe('e');
    expect(coTheBanHanh(s)).toBe(false);
  });

  test('kéo khối lên quá MÉP TRÊN trang → lỗi', () => {
    const s = sach();
    s.nodes.find(n => n.id === 's').y = -10;
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG' && x.khoiId === 's')).toBe(true);
  });

  test('dx đẩy khối vượt MÉP PHẢI trang → lỗi', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').dx = 400;
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG' && x.khoiId === 'b1')).toBe(true);
  });

  test('dx đẩy khối vượt MÉP TRÁI trang → lỗi', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').dx = -400;
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG' && x.khoiId === 'b1')).toBe(true);
  });

  test('thông điệp gọi TÊN khối và chỉ đúng nút phải bấm', () => {
    const s = sach();
    s.nodes.find(n => n.id === 'b1').tx = 'Soạn hàng theo phiếu';
    s.nodes.find(n => n.id === 'b1').dx = 400;
    const l = kiemTraLuuDo(s).loi.find(x => x.ma === 'NGOAI_TRANG');
    expect(l.thongDiep).toContain('Soạn hàng theo phiếu');
    expect(l.thongDiep).toContain('Tự xếp lại');
  });

  test('mỗi khối lọt ra chỉ báo MỘT dòng, không nhân đôi khi lọt cả hai trục', () => {
    const s = sach();
    const b1 = s.nodes.find(n => n.id === 'b1');
    b1.dx = -400; b1.y = -400;
    expect(kiemTraLuuDo(s).loi.filter(x => x.ma === 'NGOAI_TRANG' && x.khoiId === 'b1')).toHaveLength(1);
  });

  test('sơ đồ rỗng / thiếu mảng không làm nổ hàm', () => {
    expect(() => kiemTraLuuDo({ lanes: [], phases: [], nodes: [], edges: [] })).not.toThrow();
    expect(() => kiemTraLuuDo({ nodes: [], edges: [] })).not.toThrow();
    expect(kiemTraLuuDo({ lanes: [], phases: [], nodes: [], edges: [] })
      .loi.some(x => x.ma === 'NGOAI_TRANG')).toBe(false);
  });

  // Lỗi này CHẶN ban hành, nên lối thoát nó chỉ ra phải thật sự gỡ được. Chỉ sai
  // đường là người dùng bấm "Tự xếp lại" mấy lần rồi kẹt hẳn, không ban hành nổi
  // một quy trình vốn không có gì sai về nội dung.
  test('bấm "Tự xếp lại" GỠ ĐƯỢC lỗi này — lối thoát trong thông điệp có thật', () => {
    const s = sach();
    s.phases = [{ name: 'G', h: 200 }];
    s.nodes.find(n => n.id === 'b1').dx = 500;      // lọt mép phải
    s.nodes.find(n => n.id === 'e').y = 900;        // lọt đáy
    s.nodes.find(n => n.id === 's').y = -60;        // lọt mép trên
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG')).toBe(true);
    expect(kiemTraLuuDo(tuXepLai(s)).loi.filter(x => x.ma === 'NGOAI_TRANG')).toEqual([]);
  });

  test('"Tự xếp lại" giữ mọi khối trong trang ở cả sơ đồ nhiều cột nhiều giai đoạn', () => {
    const s = {
      lanes: [{ name: 'A', owner: 'a', color: '#111111' }, { name: 'B', owner: 'b', color: '#222222' },
              { name: 'C', owner: 'c', color: '#333333' }],
      phases: [{ name: 'G1', h: CAO_HANG }, { name: 'G2', h: 2 * CAO_HANG }],
      nodes: [
        K('s', 'start', 0, -30), K('b1', 'step', 2, 40, { dx: 700 }),
        K('d', 'dec', 1, 150), K('b2', 'step', 2, 800), K('e', 'end', 0, 999),
      ],
      edges: [],
    };
    expect(kiemTraLuuDo(tuXepLai(s)).loi.filter(x => x.ma === 'NGOAI_TRANG')).toEqual([]);
  });

  test('toạ độ RÁC (jsonb) KHÔNG bị báo lọt trang — bản xuất tính chúng như 0', () => {
    // quyTrinhSvg.soDoSach ép rác về 0 trước khi vẽ, tức khối rác đậu ở góc
    // trên-trái và vẫn nằm trong ảnh. Báo lỗi ở đây là chặn ban hành vì một
    // thứ bản in không hề mất.
    const s = sach();
    s.nodes.push({ id: 'rac', t: 'step', lane: 0, y: null, dx: undefined, w: '164', h: NaN,
      tx: 'rác', desc: 'x', form: 'BM', time: '1 giờ' });
    expect(kiemTraLuuDo(s).loi.some(x => x.ma === 'NGOAI_TRANG' && x.khoiId === 'rac')).toBe(false);
  });
});
