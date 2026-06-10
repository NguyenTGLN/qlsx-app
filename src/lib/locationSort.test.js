import { describe, it, expect } from 'vitest';
import { parseLocation, compareLocations } from './locationSort';

describe('parseLocation', () => {
  it('tách đúng dãy / tầng / ô', () => {
    expect(parseLocation('HH3')).toMatchObject({ match: true, day: 'H', tier: 2, cell: 3 });
    expect(parseLocation('HB4')).toMatchObject({ match: true, day: 'H', tier: 3, cell: 4 });
    expect(parseLocation('AH13')).toMatchObject({ match: true, day: 'A', tier: 2, cell: 13 });
    expect(parseLocation('HM5')).toMatchObject({ match: true, day: 'H', tier: 1, cell: 5 });
    expect(parseLocation('HN1')).toMatchObject({ match: true, day: 'H', tier: 5, cell: 1 });
    expect(parseLocation('HS2')).toMatchObject({ match: true, day: 'H', tier: 6, cell: 2 });
  });

  it('vị trí đặc biệt không đúng mẫu → match=false', () => {
    expect(parseLocation('VP6T2').match).toBe(false);
    expect(parseLocation('PBH1').match).toBe(false); // phòng bảo hành, KHÔNG phải dãy PB tầng H
    expect(parseLocation('SX9-PSX-01').match).toBe(false);
    expect(parseLocation('').match).toBe(false);
    expect(parseLocation(null).match).toBe(false);
  });
});

describe('compareLocations', () => {
  it('dãy sắp A→Z trước tiên', () => {
    const locs = ['HH1', 'BH1', 'AH1'];
    locs.sort(compareLocations);
    expect(locs).toEqual(['AH1', 'BH1', 'HH1']);
  });

  it('cùng dãy: tầng theo thứ tự M-H-B-T-N-S (KHÔNG theo bảng chữ cái)', () => {
    const locs = ['HS1', 'HT1', 'HB1', 'HH1', 'HN1', 'HM1'];
    locs.sort(compareLocations);
    expect(locs).toEqual(['HM1', 'HH1', 'HB1', 'HT1', 'HN1', 'HS1']);
  });

  it('cùng dãy + tầng: ô so theo giá trị 1→2→…→10→20', () => {
    const locs = ['HH20', 'HH2', 'HH10', 'HH1'];
    locs.sort(compareLocations);
    expect(locs).toEqual(['HH1', 'HH2', 'HH10', 'HH20']);
  });

  it('kết hợp dãy → tầng → ô', () => {
    const locs = ['HH3', 'HM5', 'HB4', 'HH1', 'AH2'];
    locs.sort(compareLocations);
    expect(locs).toEqual(['AH2', 'HM5', 'HH1', 'HH3', 'HB4']);
  });

  it('vị trí đặc biệt (VP…, PBH…, không đúng mẫu) luôn xếp sau vị trí chuẩn', () => {
    const locs = ['VP6T2', 'HH1', 'PBH1', 'AM1'];
    locs.sort(compareLocations);
    expect(locs.slice(0, 2)).toEqual(['AM1', 'HH1']);
    expect(locs.slice(2)).toContain('VP6T2');
    expect(locs.slice(2)).toContain('PBH1');
  });

  it('ví dụ thực tế trên phiếu: dãy E < F < H; trong dãy thì tầng M < H < B', () => {
    const locs = ['EH12', 'HH1', 'EM1', 'FH12', 'EH6', 'HB3', 'EB1', 'EH10'];
    locs.sort(compareLocations);
    expect(locs).toEqual(['EM1', 'EH6', 'EH10', 'EH12', 'EB1', 'FH12', 'HH1', 'HB3']);
  });

  it('không phân biệt hoa/thường, chịu được null', () => {
    expect(compareLocations('hh1', 'HH2')).toBeLessThan(0);
    expect(compareLocations('HH1', 'HH1')).toBe(0);
  });
});
