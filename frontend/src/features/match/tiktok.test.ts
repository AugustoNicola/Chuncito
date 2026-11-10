/**
 * Tiktok Mahjong: the yaku wall, its 2 han, sanma honba at any table, and a
 * match that is never ranked.
 */
import { describe, expect, it } from 'vitest';
import {
  type HandInput, type MatchState, advanceRoundManually, continueAsSouth, createMatch,
  endMatchManually, hideYaku, recordHand, revealYaku, setRanked, toggleRiichi, undoLastHand,
} from './matchState';
import { YAKU_ATOMS } from '../hand/yakuNames';
import { withYakuDora } from '../hand/yakuDora';
import { basePoints, paymentFor, paymentTotal } from './scoring';
import { fromRows, toRows } from './rows';
import { WALL_SIZE, WALL_WEIGHTS, drawWall, wallOfRow, yakuDoraKind } from './yakuWall';
import { fourPlayerConfig, manual, nameOfTest, playTiktok, seeded } from './testMatches';
import type { ScoreResult } from '../../scorer/types';

const tiktok = { ...fourPlayerConfig, rules: [], tiktok: true };
const start = (rng = seeded(1)): MatchState => createMatch(tiktok, new Date('2026-11-10T20:00:00Z'), 'tt', rng);
const draw: HandInput = { kind: 'exhaustiveDraw', tenpai: [] };

describe('the yaku wall', () => {
  it('is ten different yaku, the first face up', () => {
    const wall = drawWall(seeded(3));
    expect(wall.dora).toHaveLength(WALL_SIZE);
    expect(wall.ura).toHaveLength(WALL_SIZE);
    expect(new Set([...wall.dora, ...wall.ura]).size).toBe(2 * WALL_SIZE);
    for (const y of [...wall.dora, ...wall.ura]) expect(WALL_WEIGHTS).toHaveProperty(y);
    expect(wall.revealed).toBe(1);
  });

  it('is drawn from every yaku but the yakuman', () => {
    const YAKUMAN = [
      'kokushiMusou', 'suuAnkou', 'daisangen', 'shousuushii', 'daisuushii', 'tsuuiisou',
      'chinroutou', 'ryuuiisou', 'chuurenPoutou', 'suuKantsu', 'tenhou', 'chiihou', 'renhou',
      'kokushiMusouJuusanmen', 'suuAnkouTanki', 'junseiChuurenPoutou', 'riichiAbiertoRon',
    ];
    // A yaku added to the names later fails here until it is given a weight.
    expect(Object.keys(WALL_WEIGHTS).sort())
      .toEqual(YAKU_ATOMS.filter((y) => !YAKUMAN.includes(y)).sort());
  });

  it('draws the common yaku more often', () => {
    const rng = seeded(21);
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      for (const y of drawWall(rng).dora) count[y] = (count[y] ?? 0) + 1;
    }
    expect(count.riichi!).toBeGreaterThan(1.5 * count.haitei!);
    expect(count.tanyao!).toBeGreaterThan(1.5 * count.sanKantsu!);
  });

  it('puts back what a hand recorded, and draws only the rest', () => {
    const wall = drawWall(seeded(4), { dora: ['chun', 'pinfu'], ura: ['haku', 'tanyao'] });
    expect(wall.dora.slice(0, 2)).toEqual(['chun', 'pinfu']);
    expect(wall.ura.slice(0, 2)).toEqual(['haku', 'tanyao']);
    expect(wall.revealed).toBe(2);
    expect(new Set([...wall.dora, ...wall.ura]).size).toBe(2 * WALL_SIZE);
  });

  it('comes with a Tiktok match and nowhere else', () => {
    expect(start().yakuWall?.revealed).toBe(1);
    expect(createMatch(fourPlayerConfig).yakuWall).toBeNull();
  });

  it('reveals one more per kan, up to five, and takes one back to at least one', () => {
    let state = start();
    for (let i = 0; i < 7; i++) state = revealYaku(state);
    expect(state.yakuWall!.revealed).toBe(5);
    for (let i = 0; i < 7; i++) state = hideYaku(state);
    expect(state.yakuWall!.revealed).toBe(1);
  });

  it('records what was face up, and the ura under it, and deals a new wall', () => {
    let state = revealYaku(start());
    const wall = state.yakuWall!;
    const { state: next, row } = recordHand(state, draw, new Date(), seeded(2));
    expect(row.yakuDora).toEqual(wall.dora.slice(0, 2));
    expect(row.yakuUra).toEqual(wall.ura.slice(0, 2));
    expect(next.yakuWall!.revealed).toBe(1);
    expect(next.yakuWall).not.toEqual(wall);
    state = next;
    // Undo restores the face-up yaku exactly.
    const undone = undoLastHand(state, seeded(5));
    expect(undone.yakuWall!.revealed).toBe(2);
    expect(undone.yakuWall!.dora.slice(0, 2)).toEqual(wall.dora.slice(0, 2));
    expect(undone.yakuWall!.ura.slice(0, 2)).toEqual(wall.ura.slice(0, 2));
  });

  it('is a fresh one when the deal is passed by hand or the match goes on as South', () => {
    const state = start();
    expect(advanceRoundManually(state, seeded(8)).yakuWall).not.toEqual(state.yakuWall);
    const east = endMatchManually({ ...state, config: { ...state.config, length: 'east' } });
    expect(east.yakuWall).toBeNull();
    expect(continueAsSouth(east, seeded(8))?.yakuWall?.revealed).toBe(1);
  });

  it('leaves no trace on a plain match', () => {
    const { row } = recordHand(createMatch(fourPlayerConfig), draw);
    expect(row.yakuDora).toEqual([]);
    expect(row.yakuUra).toEqual([]);
    expect(wallOfRow(row)).toBeNull();
  });
});

describe('the 2 han', () => {
  const wall = { dora: ['chun', 'ittsuu'], ura: ['riichi', 'tanyao'] };
  const result = (han: number, fu: number, yakus: ScoreResult['yakus'], level = 'sinNombre'): ScoreResult => ({
    yakus, han, fu, level, payment: paymentFor(basePoints(han, fu), false, 'ron'), fuParts: [],
  });

  it('counts the face-up yaku always, and the ura only after riichi', () => {
    expect(yakuDoraKind('chun', wall, false)).toBe('dora');
    expect(yakuDoraKind('riichi', wall, false)).toBeNull();
    expect(yakuDoraKind('riichi', wall, true)).toBe('ura');
    expect(yakuDoraKind('pinfu', wall, true)).toBeNull();
  });

  it('goes onto the yaku line, and re-prices the hand', () => {
    const hand = result(3, 30, [{ yaku: 'riichi', han: 1 }, { yaku: 'chun', han: 1 }, { yaku: 'dora', han: 1 }]);
    const scored = withYakuDora(hand, wall, true, false);
    expect(scored.yakus).toEqual([{ yaku: 'riichi', han: 3 }, { yaku: 'chun', han: 3 }, { yaku: 'dora', han: 1 }]);
    expect(scored.han).toBe(7);
    expect(scored.level).toBe('haneman');
    expect(paymentTotal(scored.payment, 4)).toBe(12000);
  });

  it('leaves a hand without the yaku, or a yakuman, alone', () => {
    const plain = result(2, 30, [{ yaku: 'pinfu', han: 1 }, { yaku: 'menzenTsumo', han: 1 }]);
    expect(withYakuDora(plain, wall, true, false)).toBe(plain);
    const yakuman = result(13, 0, [{ yaku: 'kokushiMusou', han: 13 }], 'yakuman');
    expect(withYakuDora(yakuman, { dora: ['kokushiMusou'], ura: [] }, false, false)).toBe(yakuman);
  });
});

describe('a Tiktok match', () => {
  it('pays sanma honba at four: 1000 on a ron, 500 from each on a tsumo', () => {
    const at = (honba: number) => ({ ...start(), honba });
    const ron = recordHand(at(2), { kind: 'win', mode: 'ron', dealIn: 1, wins: [manual(2, 0, 'ron', 1, 30)] }).row;
    expect(ron.scoreDelta[2]).toBe(1000 + 2 * 1000);
    const tsumo = recordHand(at(1), { kind: 'win', mode: 'tsumo', dealIn: null, wins: [manual(2, 0, 'tsumo', 1, 30)] }).row;
    expect(tsumo.scoreDelta[2]).toBe(1100 + 3 * 500);
  });

  it('is never ranked', () => {
    expect(setRanked(start(), true).ranked).toBe(false);
  });

  it('survives the database, wall and all', () => {
    const played = playTiktok();
    const rebuilt = fromRows(toRows(played), nameOfTest);
    expect(rebuilt).toEqual({ ...played, pendingRiichi: [] });
    expect(rebuilt.config.tiktok).toBe(true);
    expect(rebuilt.hands[0]!.yakuDora).toEqual(['chun', 'toitoi']);
    expect(rebuilt.hands[0]!.yakuUra).toEqual(['riichi', 'tanyao']);
  });

  it('draws a new wall for a match carried on from the server', () => {
    let state = toggleRiichi(start(), 0);
    state = recordHand(state, draw).state;
    const rebuilt = fromRows(toRows(state), nameOfTest, seeded(11));
    expect(rebuilt.yakuWall?.revealed).toBe(1);
  });
});
