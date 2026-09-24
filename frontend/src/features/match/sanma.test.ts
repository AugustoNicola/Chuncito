/**
 * Three-player rules: the seat arithmetic, the payments that differ from four
 * players, and a match played through to its end and through the database.
 *
 * The four-player behaviour is covered by `matchState.test.ts` and
 * `rows.test.ts`; this file only pins down what sanma changes.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULTS, type HandInput, type MatchConfig, type MatchState,
  advanceRoundManually, createMatch, recordHand, toggleRiichi, undoLastHand,
} from './matchState';
import {
  type Delta, basePoints, drawDelta, levelFor, nagashiDelta, paymentFor, paymentTotal, placements,
  ronDelta, tsumoDelta,
} from './scoring';
import { fromRows, toRows } from './rows';
import {
  dealerOf, finalRound, lastWind, nextRound, seatWindOf, seatsOf, turnDistance, type Seat,
} from './seats';

const config = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  players: 3,
  redFives: true,
  rules: [],
  length: 'south',
  startingPoints: DEFAULTS[3].startingPoints,
  targetScore: DEFAULTS[3].targetScore,
  goalScore: DEFAULTS[3].goalScore,
  uma: DEFAULTS[3].uma,
  seats: [
    { playerId: null, name: 'A' }, { playerId: null, name: 'B' }, { playerId: null, name: 'C' },
  ],
  ...over,
});

const start = () => createMatch(config());

const manual = (winner: Seat, dealer: Seat, mode: 'ron' | 'tsumo', han: number, fu: number) => ({
  winner,
  value: {
    source: 'manual' as const,
    payment: paymentFor(basePoints(han, fu), winner === dealer, mode),
    han, fu, level: levelFor(han, fu), basePoints: basePoints(han, fu), open: false,
  },
});

const play = (state: MatchState, input: HandInput): MatchState => recordHand(state, input).state;

/** Points never enter or leave the table: scores plus sticks is constant. */
const onTable = (s: MatchState) =>
  s.scores.reduce((a, b) => a + b, 0) + (s.potCarried + s.pendingRiichi.length) * 1000;

const advanceTo = (state: MatchState, wind: string, number: number): MatchState => {
  let s = state;
  while (!(s.round.wind === wind && s.round.number === number)) s = advanceRoundManually(s);
  return s;
};

describe('sanma seats and rounds', () => {
  it('has three seats; the chair that would start North is absent', () => {
    expect(seatsOf(3)).toEqual([0, 1, 2]);
    expect(seatsOf(4)).toEqual([0, 1, 2, 3]);
  });

  it('plays three rounds per wind, passing the deal round three seats', () => {
    expect(dealerOf({ wind: 'este', number: 3 }, 3)).toBe(2);
    expect(dealerOf({ wind: 'sur', number: 1 }, 3)).toBe(0);
    expect(nextRound({ wind: 'este', number: 3 }, 3)).toEqual({ wind: 'sur', number: 1 });
    expect(finalRound('south', 3)).toEqual({ wind: 'sur', number: 3 });
    expect(finalRound('east', 3)).toEqual({ wind: 'este', number: 3 });
  });

  it('seats East, South and West -- never North', () => {
    const round = { wind: 'este' as const, number: 2 };
    expect(seatsOf(3).map((s) => seatWindOf(s, round, 3))).toEqual(['oeste', 'este', 'sur']);
  });

  it('stops at West, where four players would go on to North', () => {
    expect(lastWind(3)).toBe('oeste');
    expect(lastWind(4)).toBe('norte');
  });

  it('measures turn order around three seats', () => {
    expect(turnDistance(2, 0, 3)).toBe(1);
    expect(turnDistance(0, 2, 3)).toBe(2);
  });
});

describe('sanma payments', () => {
  it('takes a non-dealer tsumo from two players: 1000 is 500 + 300 = 800', () => {
    // 1 han 30 fu: 300 from each non-dealer, 500 from the dealer.
    const payment = paymentFor(basePoints(1, 30), false, 'tsumo');
    expect(payment).toEqual({ kind: 'tsumo', nonDealer: 300, dealer: 500 });
    expect(paymentTotal(payment, 4)).toBe(1100);
    expect(paymentTotal(payment, 3)).toBe(800);
    expect(tsumoDelta({
      players: 3, winner: 1, dealer: 0, payment, honba: 0, potBefore: 0, riichiSeats: [],
    })).toEqual([-500, 800, -300]);
  });

  it('takes a dealer tsumo from the two others only', () => {
    const payment = paymentFor(basePoints(2, 30), true, 'tsumo');
    expect(payment).toEqual({ kind: 'tsumoDealer', each: 1000 });
    expect(paymentTotal(payment, 3)).toBe(2000);
    expect(tsumoDelta({
      players: 3, winner: 0, dealer: 0, payment, honba: 0, potBefore: 0, riichiSeats: [],
    })).toEqual([2000, -1000, -1000]);
  });

  it('pays honba at 500 from each payer on a tsumo', () => {
    const payment = paymentFor(basePoints(1, 30), false, 'tsumo');
    expect(tsumoDelta({
      players: 3, winner: 1, dealer: 0, payment, honba: 2, potBefore: 0, riichiSeats: [],
    })).toEqual([-1500, 2800, -1300]);
  });

  it('pays honba at 1000 on a ron', () => {
    // 3 han 30 fu non-dealer ron is 3900, plus one honba.
    expect(ronDelta({
      players: 3, dealIn: 2, honba: 1, potBefore: 0, riichiSeats: [],
      wins: [{ winner: 1, payment: paymentFor(basePoints(3, 30), false, 'ron') }],
    })).toEqual([0, 4900, -4900]);
  });

  it('pays a double ron, with the honba to the winner nearest the discarder', () => {
    const payment = paymentFor(basePoints(1, 30), false, 'ron');
    const delta = ronDelta({
      players: 3, dealIn: 0, honba: 1, potBefore: 1, riichiSeats: [],
      wins: [{ winner: 2, payment }, { winner: 1, payment }],
    });
    // Seat 1 is next after 0, so it takes the honba and the odd stick.
    expect(delta).toEqual([-1000 - 1000 - 1000, 1000 + 1000 + 1000, 1000]);
  });

  it('splits the 3000 noten payment three ways', () => {
    expect(drawDelta(3, [0], [])).toEqual([3000, -1500, -1500]);
    expect(drawDelta(3, [0, 2], [])).toEqual([1500, -3000, 1500]);
    expect(drawDelta(3, [], [])).toEqual([0, 0, 0]);
    expect(drawDelta(3, [0, 1, 2], [])).toEqual([0, 0, 0]);
  });

  it('pays a nagashi as a mangan tsumo from two players', () => {
    expect(nagashiDelta({ players: 3, winner: 1, dealer: 0, honba: 0, riichiSeats: [] }))
      .toEqual([-4000, 6000, -2000]);
  });

  it('places three players against three uma entries', () => {
    const standings = placements([30000, 45000, 30000] as Delta, [15, 0, -15]);
    expect(standings.map((p) => [p.seat, p.place, p.umaPoints]))
      .toEqual([[1, 1, 15], [0, 2, 0], [2, 3, -15]]);
  });
});

describe('a sanma match', () => {
  it('starts everyone on 35,000', () => {
    expect(start().scores).toEqual([35000, 35000, 35000]);
  });

  it('refuses a config whose seats do not match the player count', () => {
    expect(() => createMatch(config({ uma: DEFAULTS[4].uma }))).toThrow();
  });

  it('records a tsumo with the tsumo loss applied', () => {
    const { state, row } = recordHand(start(), {
      kind: 'win', mode: 'tsumo', dealIn: null, wins: [manual(1, 0, 'tsumo', 1, 30)],
    });
    expect(row.scoreDelta).toEqual([-500, 800, -300]);
    expect(row.wins[0]!.pointsWon).toBe(800);
    expect(state.scores).toEqual([34500, 35800, 34700]);
    expect(state.round).toEqual({ wind: 'este', number: 2 });
  });

  it('keeps every point on the table through riichi, draws and undo', () => {
    let s = start();
    const before = onTable(s);
    s = toggleRiichi(s, 1);
    s = play(s, { kind: 'exhaustiveDraw', tenpai: [1] });
    s = play(s, { kind: 'win', mode: 'tsumo', dealIn: null, wins: [manual(2, 0, 'tsumo', 2, 40)] });
    s = play(s, { kind: 'nagashiMangan', winner: 0, tenpai: [] });
    expect(onTable(s)).toBe(before);
    s = undoLastHand(s);
    expect(onTable(s)).toBe(before);
  });

  it('ends after South 3 once somebody has reached the target', () => {
    let s = advanceTo(start(), 'sur', 3);
    expect(dealerOf(s.round, 3)).toBe(2);
    // A non-dealer mangan ron takes seat 1 to 43,000.
    s = play(s, { kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 2, 'ron', 5, 30)] });
    expect(s.scores[1]).toBe(43000);
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('final_round');
  });

  it('goes into West when nobody has reached the target, and stops at West 3', () => {
    let s = advanceTo(start(), 'sur', 3);
    s = play(s, { kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 2, 'ron', 1, 30)] });
    expect(s.status).toBe('in_progress');
    expect(s.round).toEqual({ wind: 'oeste', number: 1 });

    s = advanceTo(s, 'oeste', 3);
    // Nobody tenpai: the dealer passes on the last hand there is.
    s = play(s, { kind: 'exhaustiveDraw', tenpai: [] });
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('final_round');
  });

  it('survives the database, with three seats and three-entry deltas', () => {
    let s = start();
    s = toggleRiichi(s, 0);
    s = play(s, { kind: 'win', mode: 'tsumo', dealIn: null, wins: [manual(0, 0, 'tsumo', 3, 30)] });
    s = play(s, { kind: 'exhaustiveDraw', tenpai: [2] });
    s = play(s, {
      kind: 'win', mode: 'ron', dealIn: 1,
      wins: [manual(0, 0, 'ron', 2, 30), manual(2, 0, 'ron', 1, 30)],
    });
    s = play(s, { kind: 'nagashiMangan', winner: 1, tenpai: [1] });

    const rows = toRows(s);
    expect(rows.match.players).toBe(3);
    expect(rows.matchPlayers).toHaveLength(3);
    expect(rows.hands.every((h) => h.scoreDelta.split(',').length === 3)).toBe(true);
    expect(fromRows(rows)).toEqual(s);
  });
});
