import { describe, expect, it } from 'vitest';
import type { Standing } from './matchState';
import { scoreAxis } from './StandingsChart';
import type { Delta } from './scoring';

const at = (...scores: number[]): Standing => ({ scores: scores as Delta, places: [] });

describe('the score axis', () => {
  it('holds every point, with gridlines on round thousands', () => {
    const axis = scoreAxis([at(25000, 25000, 33000, 17000), at(42000, 8000, 30000, 20000)],
                           [0, 1, 2, 3]);
    expect(axis.lo).toBeLessThan(8000);
    expect(axis.hi).toBeGreaterThan(42000);
    expect(axis.ticks).toEqual([10000, 20000, 30000, 40000]);
  });

  it('goes below zero for a bust, and stays readable for a close match', () => {
    expect(scoreAxis([at(-2300, 50000, 27300)], [0, 1, 2]).ticks).toEqual([0, 20000, 40000]);
    const close = scoreAxis([at(25000, 26000, 24000, 25000)], [0, 1, 2, 3]);
    expect(close.ticks).toEqual([24000, 25000, 26000]);
  });

  it('is never flat', () => {
    const axis = scoreAxis([at(25000, 25000, 25000, 25000)], [0, 1, 2, 3]);
    expect(axis.hi).toBeGreaterThan(axis.lo);
    expect(axis.ticks).toEqual([25000]);
  });
});
