import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UMA, type HandInput, type MatchConfig, type MatchState,
  adjustScore, adjustScores, advanceRoundManually, createMatch, maxLevel, potOnTable,
  recordHand, toggleRiichi, undoLastHand,
} from './matchState';
import {
  type Delta, basePoints, hanFuPossible, levelFor, paymentFor, placeLabel, placements, placesOf,
} from './scoring';
import { dealerOf, seatWindOf } from './seats';
import type { Seat } from './seats';

const config = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  players: 4,
  redFives: true,
  length: 'south',
  startingPoints: 25000,
  returnScore: 30000,
  uma: DEFAULT_UMA,
  seats: [
    { playerId: null, name: 'A' }, { playerId: null, name: 'B' },
    { playerId: null, name: 'C' }, { playerId: null, name: 'D' },
  ],
  ...over,
});

const start = (over: Partial<MatchConfig> = {}) => createMatch(config(over));

/** A manual win, so the tests never need the engine. */
const win = (winner: Seat, dealer: Seat, opts: {
  mode?: 'ron' | 'tsumo'; dealIn?: Seat | null; han?: number; fu?: number;
} = {}): HandInput => {
  const mode = opts.mode ?? 'ron';
  const han = opts.han ?? 3;
  const fu = opts.fu ?? 30;
  const base = basePoints(han, fu);
  return {
    kind: 'win', mode, dealIn: opts.dealIn ?? null,
    wins: [{
      winner,
      value: {
        source: 'manual', payment: paymentFor(base, winner === dealer, mode),
        han, fu, level: levelFor(han, fu), basePoints: base, open: false,
      },
    }],
  };
};

/** A ron won by several players off one discard. */
const multiRon = (dealIn: Seat, dealer: Seat, winners: readonly Seat[],
                  han = 3, fu = 30): HandInput => ({
  kind: 'win', mode: 'ron', dealIn,
  wins: winners.map((winner) => ({
    winner,
    value: {
      source: 'manual' as const,
      payment: paymentFor(basePoints(han, fu), winner === dealer, 'ron'),
      han, fu, level: levelFor(han, fu), basePoints: basePoints(han, fu), open: false,
    },
  })),
});

const play = (state: MatchState, input: HandInput): MatchState => recordHand(state, input).state;

const total = (s: MatchState) => s.scores.reduce((a, b) => a + b, 0);

describe('seats and winds', () => {
  it('starts with seat 0 dealing East 1', () => {
    expect(dealerOf({ wind: 'este', number: 1 }, 4)).toBe(0);
    expect(seatWindOf(0, { wind: 'este', number: 1 }, 4)).toBe('este');
    expect(seatWindOf(3, { wind: 'este', number: 1 }, 4)).toBe('norte');
  });

  it('passes the dealership one seat per round, across winds', () => {
    expect(dealerOf({ wind: 'este', number: 4 }, 4)).toBe(3);
    expect(dealerOf({ wind: 'sur', number: 1 }, 4)).toBe(0);
    expect(dealerOf({ wind: 'sur', number: 3 }, 4)).toBe(2);
  });

  it('makes the dealer East and reads the other winds off the seat', () => {
    const round = { wind: 'sur' as const, number: 2 };
    expect(dealerOf(round, 4)).toBe(1);
    expect(seatWindOf(1, round, 4)).toBe('este');
    expect(seatWindOf(2, round, 4)).toBe('sur');
    expect(seatWindOf(0, round, 4)).toBe('norte');
  });
});

describe('scoring arithmetic', () => {
  it('computes base points from han and fu', () => {
    expect(basePoints(1, 30)).toBe(240);
    expect(basePoints(3, 30)).toBe(960);
    expect(basePoints(4, 30)).toBe(1920);   // not a mangan: no kiriage
    expect(basePoints(4, 40)).toBe(2000);   // capped
    expect(basePoints(5, 20)).toBe(2000);
    expect(basePoints(6, 20)).toBe(3000);
    expect(basePoints(13, 20)).toBe(8000);
  });

  it('names the limit a han/fu pair reaches', () => {
    expect(levelFor(3, 30)).toBe('sinNombre');
    expect(levelFor(4, 30)).toBe('sinNombre');
    expect(levelFor(4, 40)).toBe('mangan');
    expect(levelFor(7, 30)).toBe('haneman');
    expect(levelFor(13, 30)).toBe('kazoeYakuman');
  });

  it('rounds payments up to the nearest hundred', () => {
    // 3 han 30 fu: base 960, non-dealer ron 3840 -> 3900.
    expect(paymentFor(960, false, 'ron')).toEqual({ kind: 'ron', total: 3900 });
    expect(paymentFor(960, true, 'ron')).toEqual({ kind: 'ron', total: 5800 });
    expect(paymentFor(960, false, 'tsumo')).toEqual({ kind: 'tsumo', nonDealer: 1000, dealer: 2000 });
    expect(paymentFor(2000, true, 'tsumo')).toEqual({ kind: 'tsumoDealer', each: 4000 });
  });
});

describe('recording wins', () => {
  it('moves points from the discarder on a ron and keeps the table at 100k', () => {
    const s = play(start(), win(1, 0, { mode: 'ron', dealIn: 2, han: 3, fu: 30 }));
    expect(s.scores[1]).toBe(25000 + 3900);
    expect(s.scores[2]).toBe(25000 - 3900);
    expect(total(s)).toBe(100000);
  });

  it('charges the dealer more on a non-dealer tsumo', () => {
    const s = play(start(), win(1, 0, { mode: 'tsumo', han: 3, fu: 30 }));
    expect(s.scores[0]).toBe(25000 - 2000);  // dealer
    expect(s.scores[2]).toBe(25000 - 1000);
    expect(s.scores[1]).toBe(25000 + 4000);
    expect(total(s)).toBe(100000);
  });

  it('charges everyone equally on a dealer tsumo', () => {
    const s = play(start(), win(0, 0, { mode: 'tsumo', han: 4, fu: 40 }));
    expect(s.scores[0]).toBe(25000 + 12000);
    for (const seat of [1, 2, 3] as Seat[]) expect(s.scores[seat]).toBe(25000 - 4000);
  });
});

describe('dealer repeats, honba and the round marker', () => {
  it('repeats the dealer and adds a honba when the dealer wins', () => {
    const s = play(start(), win(0, 0, { dealIn: 1 }));
    expect(s.round).toEqual({ wind: 'este', number: 1 });
    expect(s.honba).toBe(1);
  });

  it('passes the dealership and clears the honba when anyone else wins', () => {
    let s = play(start(), win(0, 0, { dealIn: 1 }));   // honba 1
    s = play(s, win(2, 0, { dealIn: 1 }));
    expect(s.round).toEqual({ wind: 'este', number: 2 });
    expect(s.honba).toBe(0);
  });

  it('charges 300 per honba on a ron', () => {
    let s = play(start(), win(0, 0, { dealIn: 1 }));   // honba 1
    const before = s.scores[2];
    s = play(s, win(2, 0, { dealIn: 1, han: 3, fu: 30 }));
    expect(s.scores[2]).toBe(before + 3900 + 300);
  });

  it('charges 100 per honba from each player on a tsumo', () => {
    // Dealer rons 3 han 30 fu off seat 1 (5800), then tsumos the same hand on
    // one honba: 2000 each from the formula, plus 100 for the counter.
    let s = play(start(), win(0, 0, { dealIn: 1 }));
    s = play(s, win(0, 0, { mode: 'tsumo', han: 3, fu: 30 }));
    expect(s.honba).toBe(2);
    expect(s.scores[1]).toBe(25000 - 5800 - (2000 + 100));
  });

  it('rolls East 4 into South 1', () => {
    let s = start();
    for (let i = 0; i < 4; i++) s = play(s, win(((i + 1) % 4) as Seat, i as Seat, { dealIn: 0 }));
    expect(s.round).toEqual({ wind: 'sur', number: 1 });
  });
});

describe('riichi sticks', () => {
  it('takes the 1000 the moment riichi is declared', () => {
    const s = toggleRiichi(start(), 2);
    expect(s.scores[2]).toBe(24000);
    expect(potOnTable(s)).toBe(1);
  });

  it('gives the whole table to the winner, including sticks laid this hand', () => {
    let s = start();
    s = toggleRiichi(s, 1);
    s = toggleRiichi(s, 2);
    s = play(s, win(1, 0, { dealIn: 3, han: 3, fu: 30 }));
    // 3900 won, minus their own 1000 stick, plus both sticks back.
    expect(s.scores[1]).toBe(25000 - 1000 + 3900 + 2000);
    expect(s.scores[2]).toBe(24000);
    expect(potOnTable(s)).toBe(0);
    expect(total(s)).toBe(100000);
  });

  it('leaves the sticks on the table through a draw and pays them out later', () => {
    let s = start();
    s = toggleRiichi(s, 0);
    s = play(s, { kind: 'exhaustiveDraw', tenpai: [0] });
    expect(potOnTable(s)).toBe(1);
    s = play(s, win(3, 0, { dealIn: 1, han: 3, fu: 30 }));
    // Seat 3 paid 1000 noten in the draw, then takes 3900 plus the carried
    // stick and the honba the draw left behind.
    expect(s.scores[3]).toBe(25000 - 1000 + 3900 + 1000 + 300);
  });

  it('records the sticks in the row so a replay of deltas reproduces the table', () => {
    let s = start();
    s = toggleRiichi(s, 1);
    const { state, row } = recordHand(s, win(1, 0, { dealIn: 3, han: 3, fu: 30 }));
    const replayed = [0, 1, 2, 3].map((i) => 25000 + row.scoreDelta[i]!);
    expect(replayed).toEqual(state.scores);
  });
});

describe('draws', () => {
  it('pays 3000 from the noten players, split on each side', () => {
    const one = play(start(), { kind: 'exhaustiveDraw', tenpai: [0] });
    expect(one.scores[0]).toBe(28000);
    expect(one.scores[1]).toBe(24000);

    const two = play(start(), { kind: 'exhaustiveDraw', tenpai: [0, 1] });
    expect(two.scores[0]).toBe(26500);
    expect(two.scores[2]).toBe(23500);

    const three = play(start(), { kind: 'exhaustiveDraw', tenpai: [0, 1, 2] });
    expect(three.scores[0]).toBe(26000);
    expect(three.scores[3]).toBe(22000);
  });

  it('pays nothing when everyone or nobody is tenpai', () => {
    expect(play(start(), { kind: 'exhaustiveDraw', tenpai: [] }).scores).toEqual(
      [25000, 25000, 25000, 25000]);
    expect(play(start(), { kind: 'exhaustiveDraw', tenpai: [0, 1, 2, 3] }).scores).toEqual(
      [25000, 25000, 25000, 25000]);
  });

  it('repeats the dealer only when the dealer was tenpai', () => {
    const kept = play(start(), { kind: 'exhaustiveDraw', tenpai: [0, 1] });
    expect(kept.round).toEqual({ wind: 'este', number: 1 });
    expect(kept.honba).toBe(1);

    const passed = play(start(), { kind: 'exhaustiveDraw', tenpai: [1, 2] });
    expect(passed.round).toEqual({ wind: 'este', number: 2 });
    expect(passed.honba).toBe(1);
  });

  it('adds a honba and repeats the dealer on an abortive draw, paying nothing', () => {
    const s = play(start(), { kind: 'abortiveDraw', reason: 'four_riichi' });
    expect(s.scores).toEqual([25000, 25000, 25000, 25000]);
    expect(s.round).toEqual({ wind: 'este', number: 1 });
    expect(s.honba).toBe(1);
  });

  it('pays a nagashi mangan as a tsumo and leaves the sticks on the table', () => {
    let s = toggleRiichi(start(), 3);
    s = play(s, { kind: 'nagashiMangan', winner: 1, tenpai: [] });
    expect(s.scores[1]).toBe(25000 + 8000);
    expect(s.scores[0]).toBe(25000 - 4000);   // dealer pays double
    expect(s.scores[2]).toBe(25000 - 2000);
    expect(potOnTable(s)).toBe(1);
  });
});

describe('ending the match', () => {
  it('ends immediately when a player goes below zero', () => {
    let s = start();
    s = adjustScore(s, 1, -24000, 'setup for the test');
    s = play(s, win(0, 0, { mode: 'ron', dealIn: 1, han: 4, fu: 40 }));
    expect(s.scores[1]).toBeLessThan(0);
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('bust');
  });

  it('ends at the end of the final round when someone has reached the target', () => {
    let s = start({ length: 'east' });
    s = adjustScore(s, 1, 10000, '');
    for (let i = 0; i < 4; i++) s = play(s, win(((i + 1) % 4) as Seat, i as Seat, { dealIn: 0 }));
    expect(s.status).toBe('finished');
    expect(s.endReason).toBe('final_round');
  });

  it('goes to sudden death when nobody has reached the target', () => {
    let s = start({ length: 'east' });
    // Four flat draws: the dealership passes each time, nobody gets near 30000.
    for (let i = 0; i < 4; i++) s = play(s, { kind: 'exhaustiveDraw', tenpai: [] });
    expect(s.status).toBe('in_progress');
    expect(s.round).toEqual({ wind: 'sur', number: 1 });
  });

  it('ends sudden death the moment a hand puts someone over the target', () => {
    let s = start({ length: 'east' });
    for (let i = 0; i < 4; i++) s = play(s, { kind: 'exhaustiveDraw', tenpai: [] });
    expect(s.status).toBe('in_progress');
    s = play(s, win(1, 0, { mode: 'ron', dealIn: 2, han: 5, fu: 30 }));
    expect(s.scores[1]).toBeGreaterThanOrEqual(30000);
    expect(s.status).toBe('finished');
  });

  it('keeps playing in the final round while the dealer repeats', () => {
    let s = start({ length: 'east' });
    s = adjustScore(s, 3, 10000, '');
    for (let i = 0; i < 3; i++) s = play(s, win(((i + 1) % 4) as Seat, i as Seat, { dealIn: 0 }));
    expect(s.round).toEqual({ wind: 'este', number: 4 });
    s = play(s, win(3, 3, { dealIn: 0 }));    // dealer wins East 4
    expect(s.status).toBe('in_progress');
    expect(s.round).toEqual({ wind: 'este', number: 4 });
    expect(s.honba).toBe(1);
  });
});

describe('undo', () => {
  it('puts the table back exactly, including the round and the honba', () => {
    let s = play(start(), win(0, 0, { dealIn: 1 }));
    const before = structuredClone(s);
    s = play(s, win(2, 0, { dealIn: 1, han: 4, fu: 40 }));
    expect(undoLastHand(s)).toEqual(before);
  });

  it('gives the riichi sticks back to the table, still declared', () => {
    let s = start();
    s = toggleRiichi(s, 1);
    const before = structuredClone(s);
    s = play(s, win(1, 0, { dealIn: 3 }));
    const undone = undoLastHand(s);
    expect(undone.pendingRiichi).toEqual([1]);
    expect(undone.scores).toEqual(before.scores);
    expect(potOnTable(undone)).toBe(1);
  });

  it('reopens a match that a bust had finished', () => {
    let s = adjustScore(start(), 1, -24000, '');
    s = play(s, win(0, 0, { mode: 'ron', dealIn: 1, han: 4, fu: 40 }));
    expect(s.status).toBe('finished');
    expect(undoLastHand(s).status).toBe('in_progress');
  });

  it('does nothing on a match with no hands', () => {
    const s = start();
    expect(undoLastHand(s)).toEqual(s);
  });
});

describe('manual control', () => {
  it('records an adjustment row alongside the score change', () => {
    const s = adjustScore(start(), 2, -8000, 'chombo, agreed at the table');
    expect(s.scores[2]).toBe(17000);
    expect(s.adjustments).toHaveLength(1);
    expect(s.adjustments[0]).toMatchObject({ seat: 2, delta: -8000, afterSeq: 0 });
  });

  it('advances the round without recording a hand', () => {
    const s = advanceRoundManually(start());
    expect(s.round).toEqual({ wind: 'este', number: 2 });
    expect(s.hands).toHaveLength(0);
  });
});

describe('rows for the history', () => {
  it('shapes a win row the way DATA_MODEL describes', () => {
    const { row } = recordHand(start(), win(1, 0, { mode: 'ron', dealIn: 2, han: 3, fu: 30 }));
    expect(row).toMatchObject({
      seq: 1, roundWind: 'este', roundNumber: 1, honba: 0, riichiPotBefore: 0,
      outcome: 'ron', dealInSeat: 2,
    });
    expect(row.wins).toEqual([{
      winnerSeat: 1, han: 3, fu: 30, level: 'sinNombre', basePoints: 960,
      pointsWon: 3900, isManual: true, winnerOpen: false, handTiles: null,
      // A typed-in value carries no situation, which is not an empty one.
      situationFlags: null, yakus: [],
    }]);
    expect(row.scoreDelta).toEqual([0, 3900, -3900, 0]);
    expect(row.clientUuid).toBeTruthy();
  });

  it('numbers hands from one, in order', () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = play(s, win(1, dealerOf(s.round, 4), { dealIn: 2 }));
    expect(s.hands.map((h) => h.seq)).toEqual([1, 2, 3]);
  });

  it('tracks the best limit reached, for matches.max_level', () => {
    let s = start();
    expect(maxLevel(s)).toBeNull();
    s = play(s, win(1, 0, { dealIn: 2, han: 2, fu: 30 }));
    s = play(s, win(1, 1, { dealIn: 2, han: 7, fu: 30 }));
    s = play(s, win(1, 1, { dealIn: 2, han: 3, fu: 30 }));
    expect(maxLevel(s)).toBe('haneman');
  });
});

describe('placements', () => {
  it('orders by score and applies uma by placement', () => {
    const result = placements([31000, 25000, 24000, 20000], DEFAULT_UMA);
    expect(result.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    expect(result.map((p) => p.umaPoints)).toEqual([20, 10, -10, -20]);
  });

  it('breaks ties towards the seat closer to the starting East', () => {
    const result = placements([25000, 25000, 25000, 25000], DEFAULT_UMA);
    expect(result.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    expect(result.map((p) => p.place)).toEqual([1, 2, 3, 4]);
  });

  it('sums uma to zero', () => {
    const result = placements([40000, 30000, 20000, 10000], DEFAULT_UMA);
    expect(result.reduce((a, p) => a + p.umaPoints, 0)).toBe(0);
  });
});


describe('han and fu that cannot happen', () => {
  it('allows 20 fu only on a tsumo, from two han', () => {
    expect(hanFuPossible(1, 20, 'tsumo')).toBe(false);   // pinfu alone is 1 han
    expect(hanFuPossible(2, 20, 'tsumo')).toBe(true);    // pinfu + menzen tsumo
    expect(hanFuPossible(2, 20, 'ron')).toBe(false);     // a closed ron adds 10 fu
    expect(hanFuPossible(4, 20, 'ron')).toBe(false);
  });

  it('allows 25 fu from two han on a ron and three on a tsumo', () => {
    expect(hanFuPossible(1, 25, 'ron')).toBe(false);     // chiitoitsu is 2 han
    expect(hanFuPossible(2, 25, 'ron')).toBe(true);
    expect(hanFuPossible(2, 25, 'tsumo')).toBe(false);   // + menzen tsumo
    expect(hanFuPossible(3, 25, 'tsumo')).toBe(true);
  });

  it('leaves 30 fu and up open at every han', () => {
    for (const fu of [30, 40, 50, 60, 70, 80, 90, 100, 110]) {
      for (const han of [1, 2, 3, 4]) {
        expect(hanFuPossible(han, fu, 'ron')).toBe(true);
        expect(hanFuPossible(han, fu, 'tsumo')).toBe(true);
      }
    }
  });
});

describe('multiple ron', () => {
  it('makes the discarder pay every winner', () => {
    const s = play(start(), multiRon(2, 0, [1, 3]));
    expect(s.scores[1]).toBe(25000 + 3900);
    expect(s.scores[3]).toBe(25000 + 3900);
    expect(s.scores[2]).toBe(25000 - 7800);
    expect(total(s)).toBe(100000);
  });

  it('pays the honba once, to the winner nearest the discarder', () => {
    let s = play(start(), win(0, 0, { dealIn: 1 }));     // dealer win: honba 1
    const before = [...s.scores];
    // Seat 1 discards; seats 2 and 0 ron. Seat 2 is next in turn order.
    s = play(s, multiRon(1, 0, [2, 0]));
    expect(s.scores[2]).toBe(before[2]! + 3900 + 300);
    expect(s.scores[0]).toBe(before[0]! + 5800);          // dealer rate, no honba
    expect(s.scores[1]).toBe(before[1]! - 3900 - 5800 - 300);
    expect(total(s)).toBe(100000);
  });

  it('splits the riichi pot, giving the odd stick to the nearest winner', () => {
    let s = start();
    s = toggleRiichi(s, 0);
    s = toggleRiichi(s, 1);
    s = toggleRiichi(s, 3);                              // three sticks on the table
    // Seat 1 discards; seats 2 and 3 ron. Seat 2 is nearest in turn order.
    s = play(s, multiRon(1, 0, [2, 3]));
    expect(s.scores[2]).toBe(25000 + 3900 + 2000);       // one stick plus the odd one
    expect(s.scores[3]).toBe(25000 - 1000 + 3900 + 1000);
    expect(potOnTable(s)).toBe(0);
    expect(total(s)).toBe(100000);
  });

  it('repeats the dealer when the dealer is any of the winners', () => {
    const s = play(start(), multiRon(2, 0, [1, 0]));
    expect(s.round).toEqual({ wind: 'este', number: 1 });
    expect(s.honba).toBe(1);
  });

  it('passes the deal when the dealer is not among the winners', () => {
    const s = play(start(), multiRon(0, 0, [1, 2]));
    expect(s.round).toEqual({ wind: 'este', number: 2 });
  });

  it('records one win row per winner, each with its own value', () => {
    const { row } = recordHand(start(), multiRon(2, 0, [1, 3]));
    expect(row.wins).toHaveLength(2);
    expect(row.wins.map((w) => w.winnerSeat)).toEqual([1, 3]);
    expect(row.outcome).toBe('ron');
    expect(row.dealInSeat).toBe(2);
  });

  it('undoes cleanly', () => {
    const before = start();
    const after = play(before, multiRon(2, 0, [1, 3]));
    expect(undoLastHand(after)).toEqual(before);
  });
});

describe('correcting the whole table', () => {
  it('writes one adjustment per seat that moved', () => {
    const s = adjustScores(start(), [26000, 24000, 25000, 25000], 'miscount');
    expect(s.scores).toEqual([26000, 24000, 25000, 25000]);
    expect(s.adjustments).toHaveLength(2);
    expect(s.adjustments.map((a) => a.seat)).toEqual([0, 1]);
    expect(s.adjustments.every((a) => a.note === 'miscount')).toBe(true);
  });

  it('does nothing when nothing moved', () => {
    const s = adjustScores(start(), [25000, 25000, 25000, 25000]);
    expect(s.adjustments).toHaveLength(0);
  });
});

describe('live places', () => {
  it('has none while every score is level', () => {
    expect(placesOf([25000, 25000, 25000, 25000] as Delta)).toBeNull();
  });

  it('ranks by score, indexed by seat, breaking ties by seat as the end screen does', () => {
    expect(placesOf([24000, 30000, 24000, 22000] as Delta)).toEqual([2, 1, 3, 4]);
    expect(placesOf([35800, 34500, 34700] as Delta)).toEqual([1, 3, 2]);
  });

  it('names places as the table says them', () => {
    expect([1, 2, 3, 4].map(placeLabel)).toEqual(['1st', '2nd', '3rd', '4th']);
  });
});
