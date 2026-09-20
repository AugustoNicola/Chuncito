import { describe, expect, it } from 'vitest';
import { doraFromIndicator } from './dora';
import type { Tile } from './types';

describe('dora indicators', () => {
  it('advances within a suit', () => {
    expect(doraFromIndicator('m1')).toBe('m2');
    expect(doraFromIndicator('p8')).toBe('p9');
  });

  it('wraps 9 back to 1', () => {
    for (const t of ['m9', 'p9', 's9'] as Tile[]) {
      expect(doraFromIndicator(t)).toBe(`${t[0]}1`);
    }
  });

  it('cycles the winds E -> S -> W -> N -> E', () => {
    expect(['e', 's', 'w', 'n'].map((t) => doraFromIndicator(t as Tile)))
      .toEqual(['s', 'w', 'n', 'e']);
  });

  it('cycles the dragons haku -> hatsu -> chun -> haku', () => {
    expect(['wh', 'g', 'r'].map((t) => doraFromIndicator(t as Tile)))
      .toEqual(['g', 'r', 'wh']);
  });

  it('treats a red five as a plain five, and never yields a red dora', () => {
    expect(doraFromIndicator('m5R')).toBe('m6');
    expect(doraFromIndicator('m4')).toBe('m5');
  });
});
