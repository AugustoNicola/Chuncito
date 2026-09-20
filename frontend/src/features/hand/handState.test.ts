import { describe, expect, it } from 'vitest';
import {
  concealedForDisplay, copiesUsed, disabledReason, initialHandState, isComplete,
  pressTile, removeConcealed, toFlags, toggleMode, winningTile, type HandState,
} from './handState';
import type { Tile } from '../../scorer/types';

const T = (s: string): Tile[] => s.split(' ') as Tile[];

/** Builds a state by pressing tiles in order, honouring the current mode. */
const build = (tiles: string, over: Partial<HandState> = {}): HandState =>
  T(tiles).reduce(pressTile, { ...initialHandState, ...over });

describe('adding concealed tiles', () => {
  it('keeps insertion order and treats the last tile as the winning tile', () => {
    const s = build('m3 m1 m2');
    expect(s.concealed).toEqual(T('m3 m1 m2'));
    expect(winningTile(s)).toBe('m2');
  });

  it('displays the rest sorted but holds the winning tile apart', () => {
    const { sorted, winning } = concealedForDisplay(build('s1 m9 p3 m1'));
    expect(sorted.map((e) => e.tile)).toEqual(T('m9 p3 s1'));
    expect(winning?.tile).toBe('m1');
  });

  it('removes by insertion index, not display position', () => {
    const s = build('s1 m9 p3');
    expect(removeConcealed(s, 0).concealed).toEqual(T('m9 p3'));
  });

  it('refuses a fifth copy, counting a red five as its plain twin', () => {
    const s = build('m5 m5 m5 m5R');
    expect(copiesUsed(s, 'm5')).toBe(4);
    expect(disabledReason(s, 'm5')).toMatch(/four copies/);
    expect(disabledReason(s, 'm5R')).toMatch(/four copies/);
  });

  it('stops accepting tiles once the hand is complete', () => {
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4 n n n');
    expect(isComplete(s)).toBe(true);
    expect(disabledReason(s, 'p1')).toMatch(/already complete/);
    expect(pressTile(s, 'p1')).toBe(s);
  });
});

describe('call modes', () => {
  it('builds a run from the tapped tile upward', () => {
    const s = pressTile(toggleMode(initialHandState, 'chii'), 'm3');
    expect(s.melds).toEqual([{ kind: 'chii', tiles: T('m3 m4 m5') }]);
  });

  it('disarms a call mode after use, but keeps dora armed', () => {
    expect(pressTile(toggleMode(initialHandState, 'pon'), 'm1').mode).toBeNull();
    expect(pressTile(toggleMode(initialHandState, 'dora'), 'm1').mode).toBe('dora');
  });

  it('toggles a mode off when reselected', () => {
    const armed = toggleMode(initialHandState, 'kan');
    expect(armed.mode).toBe('kan');
    expect(toggleMode(armed, 'kan').mode).toBeNull();
  });

  it('rejects honours and high starts for a run', () => {
    const chii = toggleMode(initialHandState, 'chii');
    expect(disabledReason(chii, 'e')).toMatch(/honours/);
    expect(disabledReason(chii, 'm8')).toMatch(/above 7/);
    expect(disabledReason(chii, 'm7')).toBeNull();
  });

  it('requires enough copies left for the whole call', () => {
    const twoFives = build('m5 m5');
    // A pon needs three more; only two remain.
    expect(disabledReason(toggleMode(twoFives, 'pon'), 'm5')).toMatch(/not enough copies/);
    // A kan needs four; one already used is fatal.
    expect(disabledReason(toggleMode(build('m5'), 'kan'), 'm5')).toMatch(/not enough copies/);
    expect(disabledReason(toggleMode(initialHandState, 'kan'), 'm5')).toBeNull();
  });

  it('checks every tile a run consumes, not just the one tapped', () => {
    const noFours = build('m4 m4 m4 m4');
    expect(disabledReason(toggleMode(noFours, 'chii'), 'm3')).toMatch(/not enough copies of m4/);
  });

  it('never lets a call be the move that completes the hand', () => {
    // 11 concealed + a pon would make 14 with no winning tile left to draw.
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4');
    expect(disabledReason(toggleMode(s, 'pon'), 'n')).toMatch(/cannot complete the hand/);
  });

  it('allows a kan that leaves room, since a kan raises the target size', () => {
    const s = build('m1 m1 m2 m3 m4 p5 p6 p7 s2 s3');
    // 10 + 4 = 14 tiles against a target of 15, so one concealed tile remains.
    expect(disabledReason(toggleMode(s, 'kan'), 'n')).toBeNull();
  });

  it('caps melds at four', () => {
    let s = initialHandState;
    for (const t of T('m1 m4 m7 p1')) s = pressTile(toggleMode(s, 'chii'), t);
    expect(s.melds).toHaveLength(4);
    expect(disabledReason(toggleMode(s, 'pon'), 'e')).toMatch(/at most four melds/);
  });
});

describe('dora', () => {
  it('does not count dora against the four copies of a tile', () => {
    const s = pressTile(toggleMode(build('m5 m5 m5 m5R'), 'dora'), 'm5');
    expect(s.dora).toEqual(T('m5'));
    expect(copiesUsed(s, 'm5')).toBe(4);
  });

  it('caps at five indicators', () => {
    const s = T('m1 m2 m3 m4 m5').reduce(pressTile, toggleMode(initialHandState, 'dora'));
    expect(s.dora).toHaveLength(5);
    expect(disabledReason(s, 'm6')).toMatch(/at most 5 dora/);
  });
});

describe('flags', () => {
  it('maps the last-draw checkbox to haitei on tsumo and houtei on ron', () => {
    expect(toFlags({ ...initialHandState, lastDraw: true, winMode: 'tsumo' })).toContain('haitei');
    expect(toFlags({ ...initialHandState, lastDraw: true, winMode: 'ron' })).toContain('houtei');
  });

  it('emits the riichi choice as the matching atom', () => {
    expect(toFlags({ ...initialHandState, riichi: 'dobleRiichi' })).toEqual(['dobleRiichi']);
    expect(toFlags({ ...initialHandState, riichi: 'none' })).toEqual([]);
  });
});
