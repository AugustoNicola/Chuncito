/**
 * Generates matches and emits the rows they would become, to size the database.
 *
 * The hands are produced by the *real* reducer, so the number of them per match
 * is not a guess: dealer repeats, draws and sudden death all fall out of the
 * rules rather than out of an assumption about how long a hanchan runs.
 *
 * What is synthesised is the content of a hand -- which tiles, which yaku --
 * since running the Prolog engine a hundred thousand times would take hours and
 * only the *lengths* of those fields matter for storage. Tile strings go through
 * the real `encodeHandTiles`, so their length is exact for the shape given.
 *
 *   npm run sim:storage -- [matches] [scenario]
 *
 * Writes JSON on stdout for `storage-measure.py` to load into SQLite.
 */
import {
  createMatch, recordHand, toggleRiichi,
  type HandInput, type HandValue, type MatchConfig, type MatchState,
} from '../src/features/match/matchState';
import { basePoints, levelFor, paymentFor, placements } from '../src/features/match/scoring';
import { seatsOf, type Seat } from '../src/features/match/seats';

// The simulation plays four-player matches; sanma only has fewer rows.
const SEATS = seatsOf(4);
import { encodeHandTiles } from '../src/features/hand/handTiles';
import { initialHandState } from '../src/features/hand/handState';
import type { DeclaredMeld, Tile, YakuHan } from '../src/scorer/types';

// --- a small deterministic RNG, so a run can be repeated ---
let seed = 20260921;
const rnd = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const chance = (p: number): boolean => rnd() < p;
const between = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

/** Real yaku atoms, because the column stores the atom and lengths differ. */
const YAKU_POOL = [
  'riichi', 'menzenTsumo', 'pinfu', 'tanyao', 'iipeiko', 'ippatsu', 'yakuhaiHaku',
  'yakuhaiHatsu', 'yakuhaiChun', 'yakuhaiVientoRonda', 'sanshokuDoujun', 'ittsuu',
  'chanta', 'chiitoitsu', 'toitoi', 'sanankou', 'honitsu', 'junchan', 'ryanpeikou',
  'chinitsu', 'sanshokuDoukou', 'honroutou', 'shousangen',
];
const PSEUDO = ['dora', 'akaDora', 'uraDora'];

const SUITED: Tile[] = [
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9',
  'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9',
  's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9',
];
const HONORS: Tile[] = ['e', 's', 'w', 'n', 'r', 'g', 'wh'];
const REDS: Tile[] = ['m5R', 'p5R', 's5R'];

interface Scenario {
  name: string;
  /** Share of wins entered as tiles rather than as a typed value. */
  scoredShare: number;
  /** Per player, per hand. */
  riichiRate: number;
  /** Share of ron hands with more than one winner. */
  multiRonShare: number;
  /** Yaku recorded against a scored hand. */
  yaku: [number, number];
  /** Melds on a scored hand. */
  melds: [number, number];
  /** Dora indicators revealed. */
  dora: [number, number];
  /** Share of tiles written as the three-character red fives. */
  redShare: number;
  /** Manual corrections per match. */
  adjustments: [number, number];
  /** Length of a match name. */
  nameLength: [number, number];
}

const SCENARIOS: Record<string, Scenario> = {
  /**
   * What a group actually logs: most hands typed in because the table has
   * already been swept, tiles entered for the ones worth keeping.
   */
  typical: {
    name: 'typical',
    scoredShare: 0.55,
    riichiRate: 0.2,
    multiRonShare: 0.015,
    yaku: [1, 4],
    melds: [0, 2],
    dora: [1, 2],
    redShare: 0.08,
    adjustments: [0, 1],
    nameLength: [0, 30],
  },
  /**
   * Everything that can be stored, is. Every hand entered as tiles, every hand
   * four melds and five indicators, yaku lists at the top of their range, a
   * double ron every twelfth hand, and a long name on every match. Not a
   * realistic session -- an upper bound that a real one cannot exceed.
   */
  heavy: {
    name: 'heavy',
    scoredShare: 1,
    riichiRate: 0.45,
    multiRonShare: 0.08,
    yaku: [6, 11],
    melds: [3, 4],
    dora: [4, 5],
    redShare: 0.3,
    adjustments: [2, 4],
    nameLength: [40, 60],
  },
};

const tile = (): Tile =>
  (chance(0.2) ? pick(HONORS) : chance(0.06) ? pick(REDS) : pick(SUITED));

/** A hand of the right shape and size; its tiles need not form a winning one. */
function fakeHandTiles(s: Scenario): string {
  const meldCount = between(...s.melds);
  const melds: DeclaredMeld[] = [];
  for (let i = 0; i < meldCount; i++) {
    const kind = pick(['chii', 'pon', 'kanA', 'kanC'] as const);
    const base = chance(s.redShare) ? pick(REDS) : pick(SUITED);
    const size = kind === 'chii' || kind === 'pon' ? 3 : 4;
    melds.push({ kind, tiles: Array<Tile>(size).fill(base) } as DeclaredMeld);
  }
  const concealed = Array.from({ length: 14 - meldCount * 3 }, tile);
  const doraCount = between(...s.dora);
  return encodeHandTiles({
    ...initialHandState,
    concealed,
    melds,
    doraIndicators: Array.from({ length: doraCount }, tile),
    // Ura only exists behind a riichi, so it is rarer than the dora itself.
    uraIndicators: chance(0.25) ? Array.from({ length: doraCount }, tile) : [],
  });
}

function fakeYakus(s: Scenario): YakuHan[] {
  const n = between(...s.yaku);
  const chosen = new Set<string>();
  while (chosen.size < Math.min(n, YAKU_POOL.length)) chosen.add(pick(YAKU_POOL));
  const out: YakuHan[] = [...chosen].map((yaku) => ({ yaku, han: between(1, 2) }));
  for (const p of PSEUDO) if (chance(0.4)) out.push({ yaku: p, han: between(1, 4) });
  return out;
}

function makeValue(s: Scenario, isDealer: boolean, mode: 'ron' | 'tsumo'): HandValue {
  const han = between(1, 6);
  const fu = pick([20, 25, 30, 40, 50, 60, 70]);
  const base = basePoints(han, fu);
  const payment = paymentFor(base, isDealer, mode);
  if (chance(s.scoredShare)) {
    return {
      source: 'scored',
      payment, han, fu,
      level: levelFor(han, fu),
      yakus: fakeYakus(s),
      handTiles: fakeHandTiles(s),
      flags: (['riichi', 'ippatsu', 'haitei'] as const).filter(() => chance(0.3)).slice(),
      open: chance(0.4),
    };
  }
  return {
    source: 'manual',
    payment, han, fu,
    level: levelFor(han, fu),
    basePoints: base,
    open: chance(0.4),
  };
}

function nextInput(s: Scenario, state: MatchState): HandInput {
  const dealer = state.round.number; // only used to vary the winner
  const roll = rnd();
  if (roll < 0.48) {
    // Ron, occasionally with a second or third winner.
    const dealIn = pick(SEATS);
    const others = SEATS.filter((x) => x !== dealIn);
    const count = chance(s.multiRonShare) ? (chance(0.2) ? 3 : 2) : 1;
    const winners = others.slice(0, count);
    return {
      kind: 'win', mode: 'ron', dealIn,
      wins: winners.map((winner) => ({
        winner, value: makeValue(s, winner === (dealer % 4), 'ron'),
      })),
    };
  }
  if (roll < 0.82) {
    const winner = pick(SEATS);
    return {
      kind: 'win', mode: 'tsumo', dealIn: null,
      wins: [{ winner, value: makeValue(s, winner === (dealer % 4), 'tsumo') }],
    };
  }
  if (roll < 0.98) {
    return { kind: 'exhaustiveDraw', tenpai: SEATS.filter(() => chance(0.45)) };
  }
  if (roll < 0.995) {
    return { kind: 'abortiveDraw', reason: pick(['nine_terminals', 'four_kans', 'other'] as const) };
  }
  return { kind: 'nagashiMangan', winner: pick(SEATS), tenpai: SEATS.filter(() => chance(0.4)) };
}

const config = (): MatchConfig => ({
  players: 4,
  length: 'south',
  startingPoints: 25000,
  returnScore: 30000,
  uma: [20, 10, -10, -20],
  seats: [
    { playerId: 'p1', name: 'Augusto' }, { playerId: 'p2', name: 'Beto' },
    { playerId: 'p3', name: 'Camila' }, { playerId: 'p4', name: 'Daniela' },
  ],
});

function simulate(s: Scenario): MatchState {
  let state = createMatch(config());
  // A cap only in case a rule change ever makes a match unable to end; a real
  // hanchan stops far short of it.
  for (let guard = 0; guard < 60 && state.status === 'in_progress'; guard++) {
    for (const seat of SEATS) if (chance(s.riichiRate)) state = toggleRiichi(state, seat);
    state = recordHand(state, nextInput(s, state)).state;
  }
  return {
    ...state,
    name: 'x'.repeat(between(...s.nameLength)),
  };
}

/** The match as the rows `DATA_MODEL.md` describes, ready for the measurer. */
function toRows(state: MatchState, s: Scenario) {
  const standings = placements(state.scores, state.config.uma);
  return {
    match: {
      name: state.name,
      length: state.config.length,
      starting_points: state.config.startingPoints,
      uma_json: JSON.stringify(state.config.uma),
      return_score: state.config.returnScore,
      status: state.status,
      end_reason: state.endReason,
      started_at: state.startedAt,
      ended_at: state.endedAt,
      max_level: 'haneman',
      is_test: 0,
    },
    match_players: standings.map((p) => ({
      seat: p.seat,
      player_id: state.config.seats[p.seat]!.playerId,
      guest_name: null as string | null,
      final_score: p.score,
      placement: p.place,
      uma_points: p.umaPoints,
    })),
    hands: state.hands.map((row) => ({
      seq: row.seq,
      round_wind: row.roundWind,
      round_number: row.roundNumber,
      honba: row.honba,
      riichi_pot_before: row.riichiPotBefore,
      outcome: row.outcome,
      abortive_reason: row.abortiveReason,
      deal_in_seat: row.dealInSeat,
      score_delta: row.scoreDelta.join(','),
      client_uuid: row.clientUuid,
      wins: row.wins.map((win) => ({
        winner_seat: win.winnerSeat,
        han: win.han,
        fu: win.fu,
        level: win.level,
        base_points: win.basePoints,
        points_won: win.pointsWon,
        is_manual: win.isManual ? 1 : 0,
        winner_open: win.winnerOpen === null ? null : (win.winnerOpen ? 1 : 0),
        hand_tiles: win.handTiles,
        situation_flags: win.situationFlags === null ? null : win.situationFlags.join(','),
        yakus: win.yakus,
      })),
      riichi: row.riichiSeats,
      tenpai: row.tenpaiSeats,
    })),
    adjustments: Array.from({ length: between(...s.adjustments) }, () => ({
      after_seq: between(0, state.hands.length),
      seat: pick(SEATS) as Seat,
      delta: between(-8000, 8000),
      note: 'chombo agreed at the table',
    })),
  };
}

const count = Number(process.argv[2] ?? 500);
const scenarioName = process.argv[3] ?? 'typical';
const scenario = SCENARIOS[scenarioName];
if (!scenario) throw new Error(`unknown scenario ${scenarioName}`);

const matches = Array.from({ length: count }, () => toRows(simulate(scenario), scenario));
process.stdout.write(JSON.stringify({ scenario: scenario.name, matches }));
