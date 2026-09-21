/**
 * Does a match survive the database?
 *
 * Plays a match that exercises every kind of hand, maps it to rows, rebuilds it
 * from *nothing but those rows*, and checks the result against the original.
 * The point is the reconstruction: anything the schema cannot hold shows up as a
 * difference rather than as an oversight nobody noticed until Phase 3.
 */
import { describe, expect, it } from 'vitest';
import {
  type HandInput, type MatchConfig, type MatchState,
  adjustScores, createMatch, endMatchManually, recordHand, setMatchName, toggleRiichi,
} from './matchState';
import { basePoints, levelFor, paymentFor, placements } from './scoring';
import { fromRows, toRows } from './rows';
import type { Seat } from './seats';

const config: MatchConfig = {
  players: 4,
  redFives: true,
  length: 'south',
  startingPoints: 25000,
  returnScore: 30000,
  uma: [20, 10, -10, -20],
  seats: [
    { playerId: null, name: 'Ana' }, { playerId: null, name: 'Beto' },
    { playerId: null, name: 'Cami' }, { playerId: null, name: 'Dani' },
  ],
};

const manual = (winner: Seat, dealer: Seat, mode: 'ron' | 'tsumo', han = 3, fu = 30) => ({
  winner,
  value: {
    source: 'manual' as const,
    payment: paymentFor(basePoints(han, fu), winner === dealer, mode),
    han, fu, level: levelFor(han, fu), basePoints: basePoints(han, fu), open: false,
  },
});

const scored = (winner: Seat, dealer: Seat) => ({
  winner,
  value: {
    source: 'scored' as const,
    payment: paymentFor(2000, winner === dealer, 'ron'),
    han: 5, fu: 40, level: 'mangan' as const,
    yakus: [{ yaku: 'riichi', han: 1 }, { yaku: 'pinfu', han: 1 }, { yaku: 'dora', han: 3 }],
    handTiles: 'm2m2m3m4p3p4p5s3s4s5m6m7m8m5|chii:s3s4s5R|dora:m9|ura:s1',
    flags: ['riichi' as const, 'ippatsu' as const],
    open: false,
  },
});

/** A match with one of everything the tracker can record. */
function playEverything(): MatchState {
  let state = createMatch(config, new Date('2026-09-21T10:00:00.000Z'));
  const play = (input: HandInput) => { state = recordHand(state, input).state; };

  // A riichi, then a scored ron that collects the stick.
  state = toggleRiichi(state, 1);
  play({ kind: 'win', mode: 'ron', dealIn: 2, wins: [scored(1, 0)] });

  // A tsumo.
  play({ kind: 'win', mode: 'tsumo', dealIn: null, wins: [manual(2, 1, 'tsumo')] });

  // An exhaustive draw with tenpai players.
  state = toggleRiichi(state, 3);
  play({ kind: 'exhaustiveDraw', tenpai: [0, 3] });

  // An abortive draw, which carries a reason.
  play({ kind: 'abortiveDraw', reason: 'four_kans' });

  // A double ron: two winners, one discarder, one of each entry route.
  play({
    kind: 'win', mode: 'ron', dealIn: 0,
    wins: [scored(1, 2), manual(3, 2, 'ron', 2, 40)],
  });

  // A nagashi mangan.
  play({ kind: 'nagashiMangan', winner: 2, tenpai: [2] });

  state = adjustScores(state, state.scores.map((s, i) => (i === 0 ? s - 8000 : s + 2000)) as
    [number, number, number, number], 'chombo, agreed at the table');
  state = endMatchManually(state, new Date('2026-09-21T11:30:00.000Z'));
  return setMatchName(state, 'the one with the double ron');
}

describe('a match survives the database', () => {
  const original = playEverything();
  const standings = placements(original.scores, original.config.uma);
  const placementOf = (seat: Seat) => {
    const p = standings.find((x) => x.seat === seat)!;
    return { placement: p.place, umaPoints: p.umaPoints };
  };
  const rebuilt = fromRows(toRows(original, placementOf));

  it('records one of every outcome, so the check means something', () => {
    expect(new Set(original.hands.map((h) => h.outcome))).toEqual(new Set([
      'ron', 'tsumo', 'exhaustive_draw', 'abortive_draw', 'nagashi_mangan',
    ]));
    expect(original.hands.some((h) => h.wins.length > 1)).toBe(true);
    expect(original.hands.some((h) => h.wins.some((w) => w.handTiles))).toBe(true);
    expect(original.adjustments.length).toBeGreaterThan(0);
  });

  it('rebuilds every hand exactly', () => {
    expect(rebuilt.hands).toEqual(original.hands);
  });

  it('rebuilds the scores without storing them', () => {
    expect(rebuilt.scores).toEqual(original.scores);
  });

  it('rebuilds the round marker and honba from the last hand alone', () => {
    expect(rebuilt.round).toEqual(original.round);
    expect(rebuilt.honba).toEqual(original.honba);
    expect(rebuilt.potCarried).toEqual(original.potCarried);
  });

  it('keeps the match settings, including how it ended', () => {
    expect(rebuilt.config).toEqual(original.config);
    expect(rebuilt.status).toBe(original.status);
    expect(rebuilt.endReason).toBe(original.endReason);
    expect(rebuilt.name).toBe(original.name);
    expect(rebuilt.startedAt).toBe(original.startedAt);
    expect(rebuilt.endedAt).toBe(original.endedAt);
  });

  it('keeps the manual adjustments, with their notes', () => {
    expect(rebuilt.adjustments).toEqual(original.adjustments);
  });

  it('keeps the situation flags, so a hand can be re-scored later', () => {
    const win = rebuilt.hands.flatMap((h) => h.wins).find((w) => w.handTiles)!;
    expect(win.situationFlags).toEqual(['riichi', 'ippatsu']);
    // A typed-in value never had a situation, which is not the same as having
    // had one that was empty.
    const typed = rebuilt.hands.flatMap((h) => h.wins).find((w) => w.isManual && !w.handTiles)!;
    expect(typed.situationFlags).toBeNull();
  });

  it('keeps the stored tiles, so a hand can be shown back', () => {
    const tiles = rebuilt.hands.flatMap((h) => h.wins.map((w) => w.handTiles)).filter(Boolean);
    expect(tiles).toEqual(
      original.hands.flatMap((h) => h.wins.map((w) => w.handTiles)).filter(Boolean));
  });

  it('keeps the yaku of each winner against that winner', () => {
    const double = rebuilt.hands.find((h) => h.wins.length > 1)!;
    expect(double.wins[0]!.yakus).toHaveLength(3);
    expect(double.wins[1]!.yakus).toHaveLength(0);
  });

  it('is identical but for the live riichi declarations, which are not stored', () => {
    expect(rebuilt).toEqual({ ...original, pendingRiichi: [] });
  });

  it('round-trips a match still in progress', () => {
    let state = createMatch(config);
    state = recordHand(state, {
      kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 0, 'ron')],
    }).state;
    const back = fromRows(toRows(state));
    expect(back).toEqual(state);
  });

  it('keeps whether the match played with red fives', () => {
    const state = createMatch({ ...config, redFives: false });
    expect(toRows(state).match.redFives).toBe(false);
    expect(fromRows(toRows(state))).toEqual(state);
  });

  it('round-trips an empty match', () => {
    const state = createMatch(config);
    expect(fromRows(toRows(state))).toEqual(state);
  });

  it('keeps placements and uma on the seats', () => {
    const rows = toRows(original, placementOf);
    const first = rows.matchPlayers.find((p) => p.placement === 1)!;
    expect(first.umaPoints).toBe(20);
    expect(first.finalScore).toBe(original.scores[first.seat]);
  });
});
