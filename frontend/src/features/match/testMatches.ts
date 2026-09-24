/**
 * Matches for tests, played through the real reducer.
 *
 * Shared by `rows.test.ts`, which proves a match survives the row mapping, and
 * `wire.test.ts`, which writes the same matches out as the fixtures the backend
 * tests PUT and GET -- so both languages are checked against one match.
 */
import {
  type HandInput, type MatchConfig, type MatchState,
  adjustScores, createMatch, endMatchManually, recordHand, setMatchName, setRanked, toggleRiichi,
} from './matchState';
import { DEFAULTS } from './matchState';
import { basePoints, levelFor, paymentFor } from './scoring';
import type { Seat } from './seats';

/** Two registered players and two guests, so both kinds of seat are covered. */
export const fourPlayerConfig: MatchConfig = {
  players: 4,
  redFives: true,
  // A house rule on, so the round trip and the wire carry a non-empty list.
  rules: ['riichiAbiertoRonYakuman'],
  length: 'south',
  startingPoints: 25000,
  targetScore: 30000,
  goalScore: 30000,
  uma: [20, 10, -10, -20],
  seats: [
    { playerId: 'player-ana', name: 'Ana' }, { playerId: 'player-beto', name: 'Beto' },
    { playerId: null, name: 'Cami' }, { playerId: null, name: 'Dani' },
  ],
};

/** Display names for the registered seats above, as `fromRows` wants them. */
export const testNames: Readonly<Record<string, string>> = {
  'player-ana': 'Ana', 'player-beto': 'Beto',
};
export const nameOfTest = (id: string): string => testNames[id] ?? id;

export const manual = (winner: Seat, dealer: Seat, mode: 'ron' | 'tsumo', han = 3, fu = 30) => ({
  winner,
  value: {
    source: 'manual' as const,
    payment: paymentFor(basePoints(han, fu), winner === dealer, mode),
    han, fu, level: levelFor(han, fu), basePoints: basePoints(han, fu), open: false,
  },
});

export const scored = (winner: Seat, dealer: Seat) => ({
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

/** A four-player match with one of everything the tracker can record. */
export function playEverything(): MatchState {
  let state = createMatch(fourPlayerConfig, new Date('2026-09-21T10:00:00.000Z'));
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

  // A double ron: two winners, one discarder, one of each entry route --
  // entered out of seat order, which the reducer puts right.
  play({
    kind: 'win', mode: 'ron', dealIn: 0,
    wins: [manual(3, 2, 'ron', 2, 40), scored(1, 2)],
  });

  // A nagashi mangan.
  play({ kind: 'nagashiMangan', winner: 2, tenpai: [2] });

  state = adjustScores(state, state.scores.map((s, i) => (i === 0 ? s - 8000 : s + 2000)),
    'chombo, agreed at the table');
  state = endMatchManually(state, new Date('2026-09-21T11:30:00.000Z'));
  // Played for MAKApoints, so the wire and the backend's totals see one that was.
  return setRanked(setMatchName(state, 'the one with the double ron'), true);
}

/** A sanma match still in progress, with kita in a stored hand. */
export function playSanmaInProgress(): MatchState {
  let state = createMatch({
    players: 3,
    redFives: false,
    rules: [],
    length: 'east',
    startingPoints: DEFAULTS[3].startingPoints,
    targetScore: DEFAULTS[3].targetScore,
    goalScore: DEFAULTS[3].goalScore,
    uma: DEFAULTS[3].uma,
    seats: [
      { playerId: null, name: 'Ana' }, { playerId: null, name: 'Beto' },
      { playerId: null, name: 'Cami' },
    ],
  }, new Date('2026-09-22T20:15:30.250Z'));
  const play = (input: HandInput) => { state = recordHand(state, input).state; };

  state = toggleRiichi(state, 0);
  play({
    kind: 'win', mode: 'tsumo', dealIn: null, wins: [{
      winner: 0,
      value: {
        source: 'scored', payment: paymentFor(2000, true, 'tsumo'),
        han: 5, fu: 30, level: 'mangan',
        yakus: [
          { yaku: 'riichi', han: 1 }, { yaku: 'menzenTsumo', han: 1 },
          { yaku: 'dora', han: 1 }, { yaku: 'nukiDora', han: 2 },
        ],
        handTiles: 'p2p3p4p5p6p7s2s3s4s6s7s8s5s5|kita:nn|dora:m1',
        flags: ['riichi'], open: false,
      },
    }],
  });
  play({ kind: 'exhaustiveDraw', tenpai: [2, 1] });
  return state;
}
