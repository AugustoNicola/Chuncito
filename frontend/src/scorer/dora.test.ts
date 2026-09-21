import { describe, expect, it } from 'vitest';
import { doraFromIndicator } from './dora';
import type { Tile } from './types';

describe('dora indicators', () => {
  it('advances within a suit', () => {
    expect(doraFromIndicator('m1', false)).toBe('m2');
    expect(doraFromIndicator('p8', false)).toBe('p9');
  });

  it('wraps 9 back to 1', () => {
    for (const t of ['m9', 'p9', 's9'] as Tile[]) {
      expect(doraFromIndicator(t, false)).toBe(`${t[0]}1`);
    }
  });

  it('cycles the winds E -> S -> W -> N -> E', () => {
    expect(['e', 's', 'w', 'n'].map((t) => doraFromIndicator(t as Tile, false)))
      .toEqual(['s', 'w', 'n', 'e']);
  });

  it('cycles the dragons haku -> hatsu -> chun -> haku', () => {
    expect(['wh', 'g', 'r'].map((t) => doraFromIndicator(t as Tile, false)))
      .toEqual(['g', 'r', 'wh']);
  });

  it('treats a red five as a plain five, and never yields a red dora', () => {
    expect(doraFromIndicator('m5R', false)).toBe('m6');
    expect(doraFromIndicator('m4', false)).toBe('m5');
  });

  it('skips the missing manzu in sanma: 1m points at 9m and 9m back at 1m', () => {
    expect(doraFromIndicator('m1', true)).toBe('m9');
    expect(doraFromIndicator('m9', true)).toBe('m1');
    // Only manzu is affected; the other suits and the honours cycle as usual.
    expect(doraFromIndicator('p1', true)).toBe('p2');
    expect(doraFromIndicator('s9', true)).toBe('s1');
    expect(doraFromIndicator('w', true)).toBe('n');
  });
});
