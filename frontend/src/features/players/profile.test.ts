import { describe, expect, it } from 'vitest';
import {
  averagePlacement, percent, placementSlices, ronValue, valueBins, winMethodSlices, yakuNotYet,
  yakuRows,
} from './profile';

describe('profile arithmetic', () => {
  it('rounds a share, and has none of nothing', () => {
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('–');
  });

  it('averages placements, 1 being best', () => {
    expect(averagePlacement([2, 1, 0, 1])).toBe((2 + 2 + 4) / 4);
    expect(averagePlacement([0, 0, 0])).toBeNull();
  });

  it('only mentions unrecorded win methods when there are some', () => {
    expect(winMethodSlices({ riichi: 2, dama: 1, open: 0, unknown: 0 }).map((s) => s.key))
      .toEqual(['riichi', 'dama', 'open']);
    expect(winMethodSlices({ riichi: 0, dama: 0, open: 0, unknown: 1 }).at(-1)?.label)
      .toBe('Not recorded');
  });

  it('labels a slice per seat, three in sanma', () => {
    expect(placementSlices([1, 2, 3]).map((s) => s.label)).toEqual(['1st', '2nd', '3rd']);
  });

  it('leaves dora out of the yaku, and names the rest', () => {
    expect(yakuRows([{ yaku: 'dora', count: 5 }, { yaku: 'pinfu', count: 2 },
                     { yaku: 'nukiDora', count: 1 }]))
      .toEqual([{ yaku: 'pinfu', count: 2, name: 'Pinfu' }]);
  });

  it('lists the yaku still to win with, without the dora or what sanma cannot make', () => {
    const four = yakuNotYet([{ yaku: 'pinfu', count: 2 }, { yaku: 'dora', count: 1 }], 4).map((y) => y.atom);
    expect(four).not.toContain('pinfu');
    expect(four).toContain('sanshokuDoujun');
    expect(four).not.toContain('dora');
    expect(yakuNotYet([], 3).map((y) => y.atom)).not.toContain('sanshokuDoujun');
  });
});

describe('the hand value histogram', () => {
  const count = (bins: ReturnType<typeof valueBins>) =>
    Object.fromEntries(bins.filter((b) => b.count).map((b) => [b.key, b.count]));

  it('prices a hand as a non-dealer ron', () => {
    expect(ronValue(240)).toBe(1000);    // 1 han 30 fu
    expect(ronValue(1920)).toBe(7700);   // 4 han 30 fu
  });

  it('bins below mangan by the thousand, and every limit on its own', () => {
    expect(count(valueBins([
      { level: 'sinNombre', basePoints: 240, count: 3 },   // 1,000
      { level: 'sinNombre', basePoints: 480, count: 1 },   // 2,000
      { level: 'sinNombre', basePoints: 1920, count: 1 },  // 7,700
      { level: 'mangan', basePoints: 2000, count: 2 },
      { level: 'kazoeYakuman', basePoints: 8000, count: 1 },
      { level: 'dobleYakuman', basePoints: 16000, count: 1 },
    ]))).toEqual({ k1: 3, k2: 1, k7: 1, mangan: 2, yakuman: 2 });
  });

  it('always has all twelve bars, and skips a win with no base', () => {
    const bins = valueBins([{ level: null, basePoints: null, count: 4 }]);
    expect(bins).toHaveLength(12);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });
});
