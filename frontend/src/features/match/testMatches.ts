/**
 * Matches for tests, played through the real reducer.
 *
 * Shared by `rows.test.ts`, which proves a match survives the row mapping, and
 * `wire.test.ts`, which writes the same matches out as the fixtures the backend
 * tests PUT and GET -- so both languages are checked against one match.
 */
import {
  type HandInput, type MatchConfig, type MatchState,
  adjustScores, createMatch, endMatchManually, enteredMatch, recordHand, revealYaku, setMatchName,
  setRanked, toggleRiichi,
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
  emptySide: null,
  tiktok: false,
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
  const start = new Date('2026-09-21T10:00:00.000Z');
  let state = createMatch(fourPlayerConfig, start);
  // A hand every nine minutes, so the fixtures stay put and the durations are known.
  let hands = 0;
  const play = (input: HandInput) => {
    hands += 1;
    state = recordHand(state, input, new Date(start.getTime() + hands * 9 * 60_000)).state;
  };

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
    // Not the default, so the wire and the database carry a real choice.
    emptySide: 'top',
    tiktok: false,
  }, new Date('2026-09-22T20:15:30.250Z'));
  let hands = 0;
  const play = (input: HandInput) => {
    hands += 1;
    state = recordHand(state, input, new Date(Date.parse('2026-09-22T20:15:30.250Z') + hands * 600_000)).state;
  };

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
  // The first hand as one recorded before hands were timed: the wire and the
  // database carry the null too.
  return { ...state, hands: state.hands.map((h, i) => (i === 0 ? { ...h, recordedAt: null } : h)) };
}

/**
 * A four-player match played without the tracker and entered afterwards,
 * for MAKApoints: a guest dead last, and a tie between two registered seats
 * that only the starting winds break.
 */
export function enterPlayedMatch(): MatchState {
  return enteredMatch(fourPlayerConfig, [33000, 33000, 26000, 8000], {
    name: 'at the club', ranked: true, playedAt: new Date('2026-10-10T21:00:00.000Z'),
  });
}

/** A seeded generator (mulberry32), so a drawn yaku wall is the same every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A finished Tiktok match: a riichi win after a kan, with one yaku from the
 * face-up wall and one from the ura under it, then a draw. The first wall is
 * set by hand so the hand's yaku can be chosen to match it.
 */
export function playTiktok(): MatchState {
  const start = new Date('2026-11-10T21:00:00.000Z');
  const rng = seeded(9);
  let state = createMatch({ ...fourPlayerConfig, rules: [], tiktok: true }, start, undefined, rng);
  state = {
    ...state,
    yakuWall: {
      dora: ['chun', 'toitoi', 'ittsuu', 'honitsu', 'kokushiMusou'],
      ura: ['riichi', 'tanyao', 'chiitoitsu', 'haku', 'sanAnkou'],
      revealed: 1,
    },
  };
  state = revealYaku(state);
  state = toggleRiichi(state, 2);
  let hands = 0;
  const play = (input: HandInput) => {
    hands += 1;
    state = recordHand(state, input, new Date(start.getTime() + hands * 11 * 60_000), rng).state;
  };
  // Riichi (1 + 2 as an ura yaku) and chun (1 + 2 as a dora yaku): 6 han, haneman.
  play({
    kind: 'win', mode: 'ron', dealIn: 3, wins: [{
      winner: 2,
      value: {
        source: 'scored', payment: paymentFor(3000, false, 'ron'),
        han: 6, fu: 40, level: 'haneman',
        yakus: [{ yaku: 'riichi', han: 3 }, { yaku: 'chun', han: 3 }],
        handTiles: 'm1m2m3p4p5p6s7s8s9rrrm5|dora:s1|ura:p9',
        flags: ['riichi'], open: false,
      },
    }],
  });
  play({ kind: 'exhaustiveDraw', tenpai: [1] });
  state = endMatchManually(state, new Date(start.getTime() + 30 * 60_000));
  return setMatchName(state, 'the first Tiktok night');
}
