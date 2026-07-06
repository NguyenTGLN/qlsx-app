import { test, expect, describe } from 'vitest';
import { getEffectiveProposalLan, nextProposalLanNo, buildProposalSnapshot } from './warrantyProposalLan';

const NOW = new Date('2026-07-06T10:00:00Z');

describe('getEffectiveProposalLan', () => {
  test('không có cột -> []', () => expect(getEffectiveProposalLan({})).toEqual([]));
  test('row null -> []', () => expect(getEffectiveProposalLan(null)).toEqual([]));
  test('trả mảng, đảm bảo có số lần', () => {
    const r = { 'các_lần_đề_xuất': [{ 'dữ_liệu': {} }, { 'lần': 5, 'dữ_liệu': {} }] };
    const out = getEffectiveProposalLan(r);
    expect(out[0]['lần']).toBe(1);
    expect(out[1]['lần']).toBe(5);
  });
});

describe('nextProposalLanNo', () => {
  test('rỗng -> 1', () => expect(nextProposalLanNo([])).toBe(1));
  test('max+1', () => expect(nextProposalLanNo([{ 'lần': 1 }, { 'lần': 3 }])).toBe(4));
});

describe('buildProposalSnapshot', () => {
  test('đủ khóa + đã_hủy false + dữ_liệu là proposal (chưa gán số lần)', () => {
    const row = { 'phiếu_ghi': 'PBH-1', 'mã_sản_phẩm': 'RO-9', 'linh_kiện': 'Bơm, Van' };
    const snap = buildProposalSnapshot(row, { name: 'KTV A' }, NOW);
    expect(snap['đã_hủy']).toBe(false);
    expect(snap['người_tạo']).toBe('KTV A');
    expect(snap['thời_điểm_tạo']).toBe(NOW.toISOString());
    expect(snap['lần']).toBeUndefined();
    expect(snap['dữ_liệu'].maPhieu).toBe('PBH-1');
    expect(snap['dữ_liệu'].maSP).toBe('RO-9');
    expect(snap['dữ_liệu'].linhKienList).toEqual(['Bơm', 'Van']);
  });
});
