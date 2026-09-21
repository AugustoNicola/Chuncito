/**
 * The hand scorer in sanma: which tiles and calls exist, kita, and the nukidora
 * han that the engine cannot see -- checked against the real engine, since the
 * point is that its answer plus the kita comes out right.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  contextIssue, copiesUsed, disabledReason, initialHandState, pressTile, removeKita, setSanma,
  toSituation, toggleMode, type HandState,
} from './handState';
import { NUKIDORA, withNukidora } from './nukidora';
import { createScorer, type Scorer } from '../../scorer/engine';
import { nodeSwiplFactory } from '../../scorer/engine.node';
import type { ScoreResult, Tile } from '../../scorer/types';
import { paymentTotal } from '../match/scoring';

const T = (s: string): Tile[] => s.split(' ') as Tile[];

const sanma: HandState = { ...initialHandState, sanma: true };

const build = (tiles: string, over: Partial<HandState> = {}): HandState =>
  T(tiles).reduce(pressTile, { ...sanma, ...over });

describe('the sanma tile set', () => {
  it('has no 2m-8m, in any mode', () => {
    for (const tile of T('m2 m5 m8')) {
      expect(disabledReason(sanma, tile)).toMatch(/three-player/);
      expect(disabledReason(toggleMode(sanma, 'dora'), tile)).toMatch(/three-player/);
      expect(disabledReason(toggleMode(sanma, 'pon'), tile)).toMatch(/three-player/);
    }
    expect(disabledReason(sanma, 'm1')).toBeNull();
    expect(disabledReason(sanma, 'm9')).toBeNull();
    // Four players still have them all.
    expect(disabledReason(initialHandState, 'm5')).toBeNull();
  });

  it('has no chii', () => {
    expect(disabledReason(toggleMode(sanma, 'chii'), 'p1')).toMatch(/no chii/);
    expect(disabledReason(toggleMode(sanma, 'pon'), 'p1')).toBeNull();
  });

  it('turns a 1m indicator into a 9m dora', () => {
    const s = build('m1', { mode: 'dora' });
    expect(toSituation(s).dora).toEqual(['m9']);
  });
});

describe('kita', () => {
  it('pulls only Norths, stays armed, and leaves the hand size alone', () => {
    const armed = toggleMode(sanma, 'kita');
    expect(disabledReason(armed, 'e')).toMatch(/only a North/);
    const s = pressTile(pressTile(armed, 'n'), 'n');
    expect(s.kita).toBe(2);
    expect(s.mode).toBe('kita');
    expect(s.concealed).toEqual([]);
  });

  it('counts pulled Norths against the four copies', () => {
    const s = build('n n', { kita: 2 });
    expect(copiesUsed(s, 'n')).toBe(4);
    expect(disabledReason(s, 'n')).toMatch(/four copies/);
    expect(disabledReason(toggleMode(s, 'kita'), 'n')).toMatch(/four Norths/);
  });

  it('allows rinshan off a kita replacement draw, and drops it with the kita', () => {
    const s: HandState = { ...sanma, winMode: 'tsumo', kita: 1, rinshan: true };
    expect(contextIssue(s, 'rinshan')).toBeNull();
    const back = removeKita(s);
    expect(back.kita).toBe(0);
    expect(back.rinshan).toBe(false);
  });

  it('clears the hand when the calculator switches sets, and never sits North', () => {
    const four = build('m5 m5', { sanma: false, seatWind: 'norte' });
    const three = setSanma(four, true);
    expect(three.concealed).toEqual([]);
    expect(three.seatWind).toBe('este');
    expect(three.sanma).toBe(true);
  });
});

describe('nukidora', () => {
  const result = (over: Partial<ScoreResult> = {}): ScoreResult => ({
    yakus: [{ yaku: 'riichi', han: 1 }, { yaku: 'dora', han: 1 }],
    han: 2, fu: 30, level: 'sinNombre',
    payment: { kind: 'ron', total: 2000 },
    ...over,
  });

  it('leaves a hand with no kita untouched', () => {
    const r = result();
    expect(withNukidora(r, sanma)).toBe(r);
  });

  it('adds a han per North and re-prices the hand', () => {
    const out = withNukidora(result(), { ...sanma, kita: 3, seatWind: 'sur' });
    expect(out.han).toBe(5);
    expect(out.level).toBe('mangan');
    expect(out.payment).toEqual({ kind: 'ron', total: 8000 });
    expect(out.yakus).toEqual([
      { yaku: 'riichi', han: 1 }, { yaku: 'dora', han: 1 }, { yaku: NUKIDORA, han: 3 },
    ]);
  });

  it('counts a pulled North again for each dora and ura that is a North', () => {
    // West indicators point at North.
    const out = withNukidora(result(), {
      ...sanma, kita: 2, riichi: 'riichi', doraIndicators: ['w'], uraIndicators: ['w'],
    });
    expect(out.yakus.slice(1)).toEqual([
      { yaku: 'dora', han: 3 }, { yaku: NUKIDORA, han: 2 }, { yaku: 'uraDora', han: 2 },
    ]);
    expect(out.han).toBe(8);
  });

  it('ignores kita under a yakuman, as it does every dora', () => {
    const r = result({ yakus: [{ yaku: 'daisangen', han: 13 }], han: 13, fu: 0, level: 'yakuman' });
    expect(withNukidora(r, { ...sanma, kita: 2 })).toBe(r);
  });
});

describe('nukidora, end to end through the engine', () => {
  let scorer: Scorer;
  beforeAll(async () => { scorer = await createScorer(nodeSwiplFactory); }, 60_000);

  const score = (state: HandState) => {
    const out = scorer.score({
      hand: { concealed: state.concealed, melds: state.melds },
      winningTile: state.concealed.at(-1)!,
      mode: state.winMode,
      situation: toSituation(state),
    });
    if (!out.ok) throw new Error('expected a winning hand');
    return withNukidora(out.result, state);
  };

  // Closed tanyao, won on a pair wait: 2 han 30 fu as a tsumo.
  const tiles = 'p2 p3 p4 p5 p6 p7 s2 s3 s4 s6 s7 s8 s5 s5';

  it('scores the plain hand as the engine does when nothing is pulled', () => {
    const r = score(build(tiles, { winMode: 'tsumo', seatWind: 'sur' }));
    expect([r.han, r.fu]).toEqual([2, 30]);
    expect(r.payment).toEqual({ kind: 'tsumo', nonDealer: 500, dealer: 1000 });
    expect(paymentTotal(r.payment, 3)).toBe(1500);
  });

  it('adds two kita: 4 han 30 fu, 2000/3900, 5900 from the two payers', () => {
    const r = score(build(tiles, { winMode: 'tsumo', seatWind: 'sur', kita: 2 }));
    expect([r.han, r.fu]).toEqual([4, 30]);
    expect(r.yakus.find((y) => y.yaku === NUKIDORA)?.han).toBe(2);
    expect(r.payment).toEqual({ kind: 'tsumo', nonDealer: 2000, dealer: 3900 });
    expect(paymentTotal(r.payment, 3)).toBe(5900);
  });
});
