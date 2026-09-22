import { describe, expect, it } from 'vitest';
import { averagePlacement, percent, placementSlices, winMethodSlices, yakuRows } from './profile';

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
});
