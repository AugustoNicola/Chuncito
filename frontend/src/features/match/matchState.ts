/**
 * Match state and the `recordHand` reducer.
 *
 * React-free, for the same reason `handState.ts` is: the awkward parts here are
 * the rules, not the rendering -- dealer repeats, honba, sticks carrying across
 * a draw, sudden death, busting -- and they are worth testing directly.
 *
 * Two design points that outlive Phase 2:
 *
 * Every recorded hand is a row of exactly the shape `DATA_MODEL.md` gives
 * `hands`, with its own `scoreDelta`. Running scores are a prefix sum of those
 * deltas, so nothing recomputes from scratch and Phase 3 is wiring rather than
 * redesign.
 *
 * A hand row carries the round state it was *played under* (`roundWind`,
 * `roundNumber`, `honba`, `riichiPotBefore`, `riichiSeats`). That is what makes
 * undo exact: dropping the last row restores the table from the row itself,
 * with no compensating event and no replay.
 */
import type { Level, Payment, SituationWind, WinMode, YakuHan } from '../../scorer/types';
import type { Seat, MatchLength, Round } from './seats';
import { SEATS, dealerOf, finalRound, isSuddenDeath, nextRound, windIndex } from './seats';
import {
  LIMIT_BASE, RIICHI_STICK, type Delta, baseFromResult, drawDelta, nagashiDelta,
  paymentFor, paymentTotal, winDelta, zeroDelta,
} from './scoring';

export type Outcome =
  | 'tsumo' | 'ron' | 'exhaustive_draw' | 'abortive_draw' | 'nagashi_mangan';

/** Why an abortive draw was called. Recorded for the timeline; no rule depends on it. */
export type AbortiveReason =
  | 'nine_terminals' | 'four_riichi' | 'four_kans' | 'triple_ron' | 'other';

export interface SeatPlayer {
  /** A registered player, or null for a one-off guest. */
  playerId: string | null;
  /** Display name either way; `guest_name` in the row when `playerId` is null. */
  name: string;
}

export interface MatchConfig {
  length: MatchLength;
  startingPoints: number;
  /**
   * The score a player must reach for sudden death to end. Placement points are
   * uma only -- there is no oka -- so this drives the end condition and nothing
   * else.
   */
  returnScore: number;
  /** By placement, 1st to 4th. */
  uma: readonly [number, number, number, number];
  seats: readonly [SeatPlayer, SeatPlayer, SeatPlayer, SeatPlayer];
}

/** One recorded hand: a prospective `hands` row plus its child rows. */
export interface HandRow {
  clientUuid: string;
  seq: number;
  roundWind: SituationWind;
  roundNumber: number;
  honba: number;
  /** Sticks on the table when the hand resolved, including this hand's own. */
  riichiPotBefore: number;
  outcome: Outcome;
  winnerSeat: Seat | null;
  dealInSeat: Seat | null;
  han: number | null;
  fu: number | null;
  level: Level | null;
  basePoints: number | null;
  /** What the winner actually collected, honba and sticks aside. For display. */
  pointsWon: number | null;
  /** True when han/fu were typed in rather than scored from tiles. */
  isManual: boolean;
  winnerOpen: boolean | null;
  handTiles: string | null;
  scoreDelta: Delta;
  riichiSeats: Seat[];
  /** Exhaustive draws and nagashi only. */
  tenpaiSeats: Seat[];
  yakus: YakuHan[];
  abortiveReason: AbortiveReason | null;
}

export interface Adjustment {
  clientUuid: string;
  afterSeq: number;
  seat: Seat;
  delta: number;
  note: string;
}

export type EndReason = 'final_round' | 'bust' | 'manual';

export interface MatchState {
  config: MatchConfig;
  round: Round;
  honba: number;
  /** Sticks carried from earlier hands; this hand's declarations are separate. */
  potCarried: number;
  /** Riichi declared during the hand in progress, not yet part of any row. */
  pendingRiichi: Seat[];
  scores: Delta;
  hands: HandRow[];
  adjustments: Adjustment[];
  status: 'in_progress' | 'finished';
  endReason: EndReason | null;
  /** Set on the end screen. */
  name: string;
  startedAt: string;
  endedAt: string | null;
}

/** The value of a win, however it was arrived at. */
export type HandValue =
  | {
      source: 'scored';
      payment: Payment;
      han: number;
      fu: number;
      level: Level;
      yakus: YakuHan[];
      handTiles: string;
      open: boolean;
    }
  | {
      source: 'manual';
      payment: Payment;
      /** Null when a limit was picked directly rather than counted. */
      han: number | null;
      fu: number | null;
      level: Level;
      basePoints: number;
      open: boolean;
    };

export type HandInput =
  | { kind: 'win'; winner: Seat; mode: WinMode; dealIn: Seat | null; value: HandValue }
  | { kind: 'exhaustiveDraw'; tenpai: Seat[] }
  | { kind: 'abortiveDraw'; reason: AbortiveReason }
  | { kind: 'nagashiMangan'; winner: Seat; tenpai: Seat[] };

const uuid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`);

export const DEFAULT_UMA: readonly [number, number, number, number] = [20, 10, -10, -20];

export function createMatch(config: MatchConfig, now = new Date()): MatchState {
  return {
    config,
    round: { wind: 'este', number: 1 },
    honba: 0,
    potCarried: 0,
    pendingRiichi: [],
    scores: [
      config.startingPoints, config.startingPoints,
      config.startingPoints, config.startingPoints,
    ],
    hands: [],
    adjustments: [],
    status: 'in_progress',
    endReason: null,
    name: '',
    startedAt: now.toISOString(),
    endedAt: null,
  };
}

// --- riichi declarations, live during a hand ---

/**
 * Toggling a riichi moves the 1000 immediately, because that is what happens at
 * the table -- the stick is out there and the player's score has dropped before
 * anyone knows how the hand ends.
 */
export function toggleRiichi(state: MatchState, seat: Seat): MatchState {
  if (state.status !== 'in_progress') return state;
  const on = state.pendingRiichi.includes(seat);
  const scores = [...state.scores] as Delta;
  scores[seat] += on ? RIICHI_STICK : -RIICHI_STICK;
  return {
    ...state,
    pendingRiichi: on
      ? state.pendingRiichi.filter((s) => s !== seat)
      : [...state.pendingRiichi, seat].sort(),
    scores,
  };
}

// --- recording a hand ---

const applyDelta = (scores: Delta, delta: Delta): Delta =>
  SEATS.map((s) => scores[s] + delta[s]) as Delta;

/**
 * The riichi part of a hand's delta is applied the moment it is declared, so it
 * must not be applied a second time when the hand is recorded. The row still
 * carries the full delta, including the sticks, so a replay from the starting
 * score is correct.
 */
const alreadyPaid = (riichiSeats: readonly Seat[]): Delta => {
  const paid = zeroDelta();
  for (const seat of riichiSeats) paid[seat] -= RIICHI_STICK;
  return paid;
};

/** True when the dealer keeps the dealership after this hand. */
function dealerRepeats(input: HandInput, dealer: Seat): boolean {
  switch (input.kind) {
    case 'win': return input.winner === dealer;
    case 'abortiveDraw': return true;
    // A draw repeats the dealer only if the dealer was tenpai.
    case 'exhaustiveDraw': return input.tenpai.includes(dealer);
    case 'nagashiMangan': return input.tenpai.includes(dealer);
  }
}

/**
 * Honba resets only when the dealership passes after a win. A draw of any kind
 * adds a counter whether or not the dealer keeps the deal.
 */
function nextHonba(input: HandInput, honba: number, repeats: boolean): number {
  if (input.kind === 'win') return repeats ? honba + 1 : 0;
  return honba + 1;
}

const outcomeOf = (input: HandInput, mode?: WinMode): Outcome => {
  switch (input.kind) {
    case 'win': return mode === 'tsumo' ? 'tsumo' : 'ron';
    case 'exhaustiveDraw': return 'exhaustive_draw';
    case 'abortiveDraw': return 'abortive_draw';
    case 'nagashiMangan': return 'nagashi_mangan';
  }
};

/** A nagashi pays as a mangan tsumo; the row and the delta must agree on it. */
const nagashiPayment = (winner: Seat, dealer: Seat): Payment =>
  paymentFor(LIMIT_BASE.mangan!, winner === dealer, 'tsumo');

function deltaFor(input: HandInput, state: MatchState, dealer: Seat, potBefore: number): Delta {
  const riichiSeats = state.pendingRiichi;
  switch (input.kind) {
    case 'win':
      return winDelta({
        winner: input.winner,
        dealer,
        dealIn: input.dealIn,
        payment: input.value.payment,
        honba: state.honba,
        potBefore,
        riichiSeats,
      });
    case 'exhaustiveDraw':
      return drawDelta(input.tenpai, riichiSeats);
    case 'abortiveDraw':
      return drawDelta([], riichiSeats);
    case 'nagashiMangan':
      return nagashiDelta({ winner: input.winner, dealer, honba: state.honba, riichiSeats });
  }
}

/**
 * Whether the match is over, and why.
 *
 * Busting is checked first: it ends the match immediately whatever the round.
 * Otherwise the match runs to the end of its final round, and then into sudden
 * death if nobody has reached the return score -- which ends the moment someone
 * does, at the end of any hand, not only at the end of a round.
 */
function endCheck(
  scores: Delta, round: Round, config: MatchConfig, dealerPassed: boolean,
): EndReason | null {
  if (SEATS.some((s) => scores[s] < 0)) return 'bust';

  const reached = SEATS.some((s) => scores[s] >= config.returnScore);
  const final = finalRound(config.length);

  if (isSuddenDeath(round, config.length)) {
    // Already past the nominal end: any hand that puts somebody over finishes it.
    if (reached) return 'final_round';
    // North 4 is the hard stop -- there is no wind after it.
    if (round.wind === 'norte' && round.number === 4 && dealerPassed) return 'final_round';
    return null;
  }

  const atFinal = windIndex(round.wind) === windIndex(final.wind) && round.number === final.number;
  if (atFinal && dealerPassed) return reached ? 'final_round' : null;
  return null;
}

export interface RecordResult {
  state: MatchState;
  row: HandRow;
}

export function recordHand(state: MatchState, input: HandInput, now = new Date()): RecordResult {
  const dealer = dealerOf(state.round);
  const riichiSeats = [...state.pendingRiichi];
  const potBefore = state.potCarried + riichiSeats.length;
  const delta = deltaFor(input, state, dealer, potBefore);

  const mode = input.kind === 'win' ? input.mode : undefined;
  const value = input.kind === 'win' ? input.value : null;
  const collectsPot = input.kind === 'win';

  const row: HandRow = {
    clientUuid: uuid(),
    seq: state.hands.length + 1,
    roundWind: state.round.wind,
    roundNumber: state.round.number,
    honba: state.honba,
    riichiPotBefore: potBefore,
    outcome: outcomeOf(input, mode),
    winnerSeat: input.kind === 'win' || input.kind === 'nagashiMangan' ? input.winner : null,
    dealInSeat: input.kind === 'win' ? input.dealIn : null,
    han: value ? value.han : null,
    fu: value ? value.fu : null,
    level: value ? value.level : (input.kind === 'nagashiMangan' ? 'mangan' : null),
    basePoints: value
      ? (value.source === 'manual'
          ? value.basePoints
          : baseFromResult(value.level, value.han, value.fu))
      : (input.kind === 'nagashiMangan' ? LIMIT_BASE.mangan! : null),
    pointsWon: value
      ? paymentTotal(value.payment)
      : (input.kind === 'nagashiMangan' ? paymentTotal(nagashiPayment(input.winner, dealer)) : null),
    isManual: value ? value.source === 'manual' : false,
    winnerOpen: value ? value.open : null,
    handTiles: value && value.source === 'scored' ? value.handTiles : null,
    scoreDelta: delta,
    riichiSeats,
    tenpaiSeats:
      input.kind === 'exhaustiveDraw' || input.kind === 'nagashiMangan' ? [...input.tenpai] : [],
    yakus: value && value.source === 'scored' ? value.yakus : [],
    abortiveReason: input.kind === 'abortiveDraw' ? input.reason : null,
  };

  // The sticks were deducted at declaration time; only the rest of the delta is new.
  const scores = applyDelta(state.scores, SEATS.map(
    (s) => delta[s] - alreadyPaid(riichiSeats)[s],
  ) as Delta);

  const repeats = dealerRepeats(input, dealer);
  const round = repeats ? state.round : nextRound(state.round);
  const endReason = endCheck(scores, state.round, state.config, !repeats);

  return {
    state: {
      ...state,
      round,
      honba: nextHonba(input, state.honba, repeats),
      // A win clears the table; every kind of draw leaves the sticks on it.
      potCarried: collectsPot ? 0 : potBefore,
      pendingRiichi: [],
      scores,
      hands: [...state.hands, row],
      status: endReason ? 'finished' : 'in_progress',
      endReason,
      endedAt: endReason ? now.toISOString() : null,
    },
    row,
  };
}

/**
 * Drops the last hand and puts the table back exactly as it was.
 *
 * The row itself holds the round, honba and pot it was played under, so nothing
 * has to be replayed -- and the riichi declarations it recorded go back to
 * pending, since at the table those sticks would still be out.
 */
export function undoLastHand(state: MatchState): MatchState {
  const row = state.hands.at(-1);
  if (!row) return state;
  return {
    ...state,
    round: { wind: row.roundWind, number: row.roundNumber },
    honba: row.honba,
    potCarried: row.riichiPotBefore - row.riichiSeats.length,
    pendingRiichi: [...row.riichiSeats],
    scores: SEATS.map((s) => state.scores[s] - row.scoreDelta[s] + alreadyPaid(row.riichiSeats)[s]) as Delta,
    hands: state.hands.slice(0, -1),
    status: 'in_progress',
    endReason: null,
    endedAt: null,
  };
}

// --- manual control ---

export function adjustScore(
  state: MatchState, seat: Seat, delta: number, note = '',
): MatchState {
  if (delta === 0) return state;
  const scores = [...state.scores] as Delta;
  scores[seat] += delta;
  return {
    ...state,
    scores,
    adjustments: [
      ...state.adjustments,
      { clientUuid: uuid(), afterSeq: state.hands.length, seat, delta, note },
    ],
  };
}

/** Passes the dealership without recording a hand, for fixing a mis-entry. */
export function advanceRoundManually(state: MatchState): MatchState {
  if (state.status !== 'in_progress') return state;
  return { ...state, round: nextRound(state.round), honba: 0 };
}

/** Steps the honba counter directly, for the same reason. */
export function setHonba(state: MatchState, honba: number): MatchState {
  return { ...state, honba: Math.max(0, honba) };
}

export function endMatchManually(state: MatchState, now = new Date()): MatchState {
  return {
    ...state,
    status: 'finished',
    endReason: 'manual',
    endedAt: now.toISOString(),
    // Sticks still on the table are simply lost, as they are in a real game.
  };
}

export const setMatchName = (state: MatchState, name: string): MatchState =>
  ({ ...state, name });

// --- derived ---

export const dealerSeat = (state: MatchState): Seat => dealerOf(state.round);

/** Sticks visible on the table right now, including this hand's declarations. */
export const potOnTable = (state: MatchState): number =>
  state.potCarried + state.pendingRiichi.length;

/** The best limit reached in the match, for `matches.max_level`. */
export function maxLevel(state: MatchState): Level | null {
  const ranked = ['sinNombre', 'mangan', 'haneman', 'baiman', 'sanbaiman', 'kazoeYakuman'];
  let best: Level | null = null;
  let bestRank = -1;
  for (const row of state.hands) {
    if (!row.level) continue;
    const rank = ranked.indexOf(row.level);
    // Anything the ranked list does not know is a yakuman variant, so it wins.
    const effective = rank < 0 ? ranked.length : rank;
    if (effective > bestRank) { bestRank = effective; best = row.level; }
  }
  return best;
}
