import { describe, it, expect } from 'vitest';
import {
  computeCap, computeShortfall, classifyProposalRows,
  buildShortfallProposalRow, buildArchiveRow, dlkImportCap,
} from './proposalQty';

describe('computeCap', () => {
  it('trần = đặt − đã nhận, không âm', () => {
    expect(computeCap(1000, 0)).toBe(1000);
    expect(computeCap(1000, 500)).toBe(500);
    expect(computeCap(1000, 1200)).toBe(0);
  });
  it('xử lý giá trị rỗng/không hợp lệ về 0', () => {
    expect(computeCap(null, null)).toBe(0);
    expect(computeCap('800', '300')).toBe(500);
  });
});

describe('computeShortfall', () => {
  it('thiếu = đề xuất − đã nhận, không âm', () => {
    expect(computeShortfall(1000, 500)).toBe(500);
    expect(computeShortfall(1000, 1000)).toBe(0);
    expect(computeShortfall(1000, 1500)).toBe(0);
  });
});

describe('dlkImportCap — kịch bản nhập nhiều lần (đặt 527)', () => {
  it('lần 1: chưa nhận gì → trần = 527', () => {
    expect(dlkImportCap(527, [])).toEqual({ received: 0, capMax: 527 });
  });
  it('lần 2: đã nhận 327 → trần = 200 (KHÔNG cho nhập 527)', () => {
    expect(dlkImportCap(527, [{ so_luong_nhap: 327 }])).toEqual({ received: 327, capMax: 200 });
  });
  it('lần 3: đã nhận 327+200 = 527 → trần = 0', () => {
    expect(dlkImportCap(527, [{ so_luong_nhap: 327 }, { so_luong_nhap: 200 }])).toEqual({ received: 527, capMax: 0 });
  });
  it('cộng dồn nhiều dòng du_lieu_nhap + né giá trị rỗng', () => {
    expect(dlkImportCap(1000, [{ so_luong_nhap: 100 }, { so_luong_nhap: null }, { so_luong_nhap: 250 }])).toEqual({ received: 350, capMax: 650 });
  });
});

describe('classifyProposalRows', () => {
  it('dòng Mới thường → openByCode, không committed', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'a', item_code: 'X', actual_qty: 100, trang_thai: 'Mới', source: 'bom' },
    ]);
    expect(openByCode['X'].id).toBe('a');
    expect(committed['X']).toBeUndefined();
  });
  it('dòng đã đặt (không Mới, không Hủy) → committed', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'b', item_code: 'X', actual_qty: 100, trang_thai: 'Đã đặt mua', source: 'bom' },
    ]);
    expect(committed['X']).toBe(100);
    expect(openByCode['X']).toBeUndefined();
  });
  it('dòng Hủy → bỏ qua', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'c', item_code: 'X', actual_qty: 100, trang_thai: 'Hủy', source: 'bom' },
    ]);
    expect(committed['X']).toBeUndefined();
    expect(openByCode['X']).toBeUndefined();
  });
  it('dòng shortfall dù Mới → committed VÀ không vào openByCode (được ghim)', () => {
    const { committed, openByCode } = classifyProposalRows([
      { id: 'd', item_code: 'X', actual_qty: 500, trang_thai: 'Mới', source: 'shortfall' },
    ]);
    expect(committed['X']).toBe(500);
    expect(openByCode['X']).toBeUndefined();
  });
  it('cộng dồn committed nhiều dòng cùng mã', () => {
    const { committed } = classifyProposalRows([
      { id: 'e', item_code: 'X', actual_qty: 500, trang_thai: 'Mới', source: 'shortfall' },
      { id: 'f', item_code: 'X', actual_qty: 100, trang_thai: 'Đã đặt mua', source: 'bom' },
    ]);
    expect(committed['X']).toBe(600);
  });
});

describe('buildShortfallProposalRow', () => {
  it('dựng dòng phần thiếu đúng số + nhãn source', () => {
    const orig = { dlk_code: 'DLK-010726-01', item_code: 'X', item_name: 'Cái X', unit: 'Cái', calculated_qty: 1000 };
    const row = buildShortfallProposalRow({ orig, received: 500, dlkCode: 'DLK-010726-09', today: '2026-07-01' });
    expect(row.calculated_qty).toBe(500);
    expect(row.actual_qty).toBe(500);
    expect(row.bom_qty).toBe(500);
    expect(row.retail_qty).toBe(0);
    expect(row.source).toBe('shortfall');
    expect(row.trang_thai).toBe('Mới');
    expect(row.tien_do).toBe('Mới');
    expect(row.dlk_code).toBe('DLK-010726-09');
    expect(row.item_code).toBe('X');
    expect(row.ngay_de_xuat).toBe('2026-07-01');
    expect(row.note).toContain('DLK-010726-01');
  });
});

describe('buildArchiveRow', () => {
  it('sao chép dòng gốc + snapshot đã nhận + metadata lưu trữ', () => {
    const orig = {
      id: 'uuid-1', dlk_code: 'DLK-010726-01', item_code: 'X', item_name: 'Cái X', unit: 'Cái',
      calculated_qty: 1000, actual_qty: 1000, bom_qty: 1000, retail_qty: 0,
      tien_do: 'Đã về kho', trang_thai: 'Đã về kho thiếu', source: 'bom', note: '',
      ngay_de_xuat: '2026-06-20', ngay_du_kien: '2026-06-30', batch_id: null, created_at: '2026-06-20T00:00:00Z',
    };
    const a = buildArchiveRow({ orig, received: 500, archivedBy: 'Nam', shortfallDlkCode: 'DLK-010726-09' });
    expect(a.orig_id).toBe('uuid-1');
    expect(a.received_snapshot).toBe(500);
    expect(a.archived_by).toBe('Nam');
    expect(a.archive_reason).toBe('Đóng do về thiếu');
    expect(a.shortfall_dlk_code).toBe('DLK-010726-09');
    expect(a.calculated_qty).toBe(1000);
    expect(a.dlk_code).toBe('DLK-010726-01');
  });
});
