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
import type { Flag, Level, Payment, SituationWind, WinMode, YakuHan } from '../../scorer/types';
import type { Seat, MatchLength, PlayerCount, Round } from './seats';
import {
  dealerOf, finalRound, isLastRound, isSuddenDeath, nextRound, seatsOf, windIndex,
} from './seats';
import {
  LIMIT_BASE, RIICHI_STICK, type Delta, type WinPayment, baseFromResult, deltaOf, drawDelta,
  nagashiDelta, paymentFor, paymentTotal, ronDelta, tsumoDelta, zeroDelta,
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
  /**
   * Four players, or three for sanma. Everything rule-shaped follows from it:
   * rounds per wind, tsumo loss, honba value, the noten split, and in the hand
   * scorer the missing manzu and the nukidora.
   */
  players: PlayerCount;
  /**
   * Whether the set has one red five per suit. Off, all four fives are plain
   * and the hand scorer has no Red Five modifier; nothing else changes, since
   * aka dora only ever arrive as tiles.
   */
  redFives: boolean;
  length: MatchLength;
  startingPoints: number;
  /**
   * The score a player must reach for sudden death to end. Placement points are
   * uma only -- there is no oka -- so this drives the end condition and nothing
   * else.
   */
  returnScore: number;
  /** By placement, 1st to last; one entry per player. */
  uma: readonly number[];
  /** Indexed by seat; one entry per player. */
  seats: readonly SeatPlayer[];
}

/**
 * One winner's hand -- a `hand_wins` row.
 *
 * A hand has a *list* of these rather than a winner column, because this
 * ruleset allows multiple ron: everyone but the discarder can win the same discard,
 * each with their own hand, and each is scored separately.
 */
export interface WinRow {
  winnerSeat: Seat;
  han: number | null;
  fu: number | null;
  level: Level | null;
  /** Before the dealer/ron multiplier; compares hands across matches. */
  basePoints: number | null;
  /** What this winner actually collected, honba and sticks aside. */
  pointsWon: number | null;
  /** True when han/fu were typed in rather than scored from tiles. */
  isManual: boolean;
  winnerOpen: boolean | null;
  handTiles: string | null;
  /**
   * The situation flags the hand was scored under -- ippatsu, haitei, rinshan
   * and the rest. Null for a typed-in value, which has no situation to record.
   *
   * Stored because `hand_tiles` on its own is not enough to re-score a hand:
   * the tiles do not say whether the win was on the last discard or off a kan
   * replacement, and the yaku list would come back short without them.
   */
  situationFlags: Flag[] | null;
  yakus: YakuHan[];
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
  dealInSeat: Seat | null;
  /** Empty on a draw; one entry per winner otherwise. */
  wins: WinRow[];
  scoreDelta: Delta;
  riichiSeats: Seat[];
  /** Exhaustive draws and nagashi only. */
  tenpaiSeats: Seat[];
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
  /**
   * Made on the phone when the match starts, so it can be saved before the
   * server has ever heard of it; the server stores it as given.
   */
  id: string;
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
      /** From `toFlags()`; the other half of what re-scoring needs. */
      flags: Flag[];
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

export interface WinEntry {
  winner: Seat;
  value: HandValue;
}

export type HandInput =
  /** `wins` holds one entry on a tsumo, and one to three on a ron (two in sanma). */
  | { kind: 'win'; mode: WinMode; dealIn: Seat | null; wins: WinEntry[] }
  | { kind: 'exhaustiveDraw'; tenpai: Seat[] }
  | { kind: 'abortiveDraw'; reason: AbortiveReason }
  | { kind: 'nagashiMangan'; winner: Seat; tenpai: Seat[] };

/** The seats that won a hand, whatever kind of win it was. */
export function winnersOf(input: HandInput): Seat[] {
  if (input.kind === 'win') return input.wins.map((w) => w.winner);
  if (input.kind === 'nagashiMangan') return [input.winner];
  return [];
}

/**
 * A version-4 UUID. `randomUUID` exists only in a secure context, and the phone
 * reaches the dev server over plain HTTP on the LAN, so there is a fallback that
 * builds the same thing from `getRandomValues`, which is available everywhere.
 * (Matches recorded before this carry `id-...` strings; the server takes those
 * too, since it stores ids as text.)
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Setup defaults, per player count. Every one of them is editable at setup. */
export const DEFAULTS: Readonly<Record<PlayerCount, {
  uma: readonly number[]; startingPoints: number; returnScore: number;
}>> = {
  4: { uma: [20, 10, -10, -20], startingPoints: 25000, returnScore: 30000 },
  3: { uma: [15, 0, -15], startingPoints: 35000, returnScore: 40000 },
};

export const DEFAULT_UMA: readonly number[] = DEFAULTS[4].uma;

/** The seats of this match, in turn order. */
export const seatsIn = (state: { config: MatchConfig }): readonly Seat[] =>
  seatsOf(state.config.players);

export function createMatch(config: MatchConfig, now = new Date(), id = uuid()): MatchState {
  if (config.seats.length !== config.players || config.uma.length !== config.players) {
    throw new Error(`a ${config.players}-player match needs ${config.players} seats and uma`);
  }
  return {
    id,
    config,
    round: { wind: 'este', number: 1 },
    honba: 0,
    potCarried: 0,
    pendingRiichi: [],
    scores: deltaOf(config.players, () => config.startingPoints),
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
  scores.map((score, s) => score + delta[s as Seat]) as Delta;

/**
 * The riichi part of a hand's delta is applied the moment it is declared, so it
 * must not be applied a second time when the hand is recorded. The row still
 * carries the full delta, including the sticks, so a replay from the starting
 * score is correct.
 */
const alreadyPaid = (players: PlayerCount, riichiSeats: readonly Seat[]): Delta => {
  const paid = zeroDelta(players);
  for (const seat of riichiSeats) paid[seat] -= RIICHI_STICK;
  return paid;
};

/**
 * True when the dealer keeps the dealership after this hand.
 *
 * On a multiple ron the dealer repeats if they are among the winners at all --
 * it is their own win that keeps the deal, not whether they were first.
 */
function dealerRepeats(input: HandInput, dealer: Seat): boolean {
  switch (input.kind) {
    case 'win': return input.wins.some((w) => w.winner === dealer);
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
  const players = state.config.players;
  switch (input.kind) {
    case 'win': {
      const first = input.wins[0];
      if (!first) throw new Error('a win needs a winner');
      if (input.mode === 'tsumo') {
        return tsumoDelta({
          players,
          winner: first.winner,
          dealer,
          payment: first.value.payment,
          honba: state.honba,
          potBefore,
          riichiSeats,
        });
      }
      if (input.dealIn === null) throw new Error('a ron needs a deal-in seat');
      const wins: WinPayment[] = input.wins.map((w) => ({
        winner: w.winner, payment: w.value.payment,
      }));
      return ronDelta({
        players, dealIn: input.dealIn, wins, honba: state.honba, potBefore, riichiSeats,
      });
    }
    case 'exhaustiveDraw':
      return drawDelta(players, input.tenpai, riichiSeats);
    case 'abortiveDraw':
      return drawDelta(players, [], riichiSeats);
    case 'nagashiMangan':
      return nagashiDelta({
        players, winner: input.winner, dealer, honba: state.honba, riichiSeats,
      });
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
  if (scores.some((score) => score < 0)) return 'bust';

  const reached = scores.some((score) => score >= config.returnScore);
  const final = finalRound(config.length, config.players);

  if (isSuddenDeath(round, config.length)) {
    // Already past the nominal end: any hand that puts somebody over finishes it.
    if (reached) return 'final_round';
    // North 4 (West 3 in sanma) is the hard stop -- there is no wind after it.
    if (isLastRound(round, config.players) && dealerPassed) return 'final_round';
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
  const players = state.config.players;
  const dealer = dealerOf(state.round, players);
  const riichiSeats = [...state.pendingRiichi];
  const potBefore = state.potCarried + riichiSeats.length;
  const delta = deltaFor(input, state, dealer, potBefore);

  const mode = input.kind === 'win' ? input.mode : undefined;
  const collectsPot = input.kind === 'win';

  // Winners in seat order, whatever order they were entered in. The order means
  // nothing -- the honba and odd stick already went by turn order in the delta --
  // so it is fixed here, where the database can reproduce it: `hand_wins` has no
  // column to remember an arbitrary one.
  const wins: WinRow[] = input.kind === 'win'
    ? [...input.wins].sort((a, b) => a.winner - b.winner).map(({ winner, value }) => ({
        winnerSeat: winner,
        han: value.han,
        fu: value.fu,
        level: value.level,
        basePoints: value.source === 'manual'
          ? value.basePoints
          : baseFromResult(value.level, value.han, value.fu),
        pointsWon: paymentTotal(value.payment, players),
        isManual: value.source === 'manual',
        winnerOpen: value.open,
        handTiles: value.source === 'scored' ? value.handTiles : null,
        situationFlags: value.source === 'scored' ? value.flags : null,
        yakus: value.source === 'scored' ? value.yakus : [],
      }))
    : input.kind === 'nagashiMangan'
      ? [{
          winnerSeat: input.winner,
          han: null,
          fu: null,
          level: 'mangan',
          basePoints: LIMIT_BASE.mangan!,
          pointsWon: paymentTotal(nagashiPayment(input.winner, dealer), players),
          isManual: true,
          winnerOpen: null,
          handTiles: null,
          situationFlags: null,
          yakus: [],
        }]
      : [];

  const row: HandRow = {
    clientUuid: uuid(),
    seq: state.hands.length + 1,
    roundWind: state.round.wind,
    roundNumber: state.round.number,
    honba: state.honba,
    riichiPotBefore: potBefore,
    outcome: outcomeOf(input, mode),
    dealInSeat: input.kind === 'win' ? input.dealIn : null,
    wins,
    scoreDelta: delta,
    riichiSeats,
    tenpaiSeats:
      input.kind === 'exhaustiveDraw' || input.kind === 'nagashiMangan'
        ? [...input.tenpai].sort((a, b) => a - b) : [],
    abortiveReason: input.kind === 'abortiveDraw' ? input.reason : null,
  };

  // The sticks were deducted at declaration time; only the rest of the delta is new.
  const paid = alreadyPaid(players, riichiSeats);
  const scores = applyDelta(state.scores, deltaOf(players, (s) => delta[s] - paid[s]));

  const repeats = dealerRepeats(input, dealer);
  const round = repeats ? state.round : nextRound(state.round, players);
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
    scores: deltaOf(state.config.players, (s) =>
      state.scores[s] - row.scoreDelta[s] + alreadyPaid(state.config.players, row.riichiSeats)[s]),
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

/**
 * Corrects the whole table at once, from the target each seat should hold.
 *
 * One `adjustments` row per seat that actually moved, so the timeline still
 * accounts for the points. The caller is expected to have checked that the
 * totals balance; this does not enforce it, because a genuinely lost stick is a
 * thing that happens and refusing to record it would be worse.
 */
export function adjustScores(
  state: MatchState, targets: readonly number[], note = '',
): MatchState {
  let next = state;
  for (const seat of seatsIn(state)) {
    const delta = (targets[seat] ?? state.scores[seat]) - state.scores[seat];
    if (delta !== 0) next = adjustScore(next, seat, delta, note);
  }
  return next;
}

/** Passes the dealership without recording a hand, for fixing a mis-entry. */
export function advanceRoundManually(state: MatchState): MatchState {
  if (state.status !== 'in_progress') return state;
  return { ...state, round: nextRound(state.round, state.config.players), honba: 0 };
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

export const dealerSeat = (state: MatchState): Seat =>
  dealerOf(state.round, state.config.players);

/** Sticks visible on the table right now, including this hand's declarations. */
export const potOnTable = (state: MatchState): number =>
  state.potCarried + state.pendingRiichi.length;

const LEVEL_RANK: readonly string[] =
  ['sinNombre', 'mangan', 'haneman', 'baiman', 'sanbaiman', 'kazoeYakuman'];

/** Anything the list does not know is a yakuman variant, so it outranks them all. */
const rankOf = (level: Level): number => {
  const at = LEVEL_RANK.indexOf(level);
  return at < 0 ? LEVEL_RANK.length : at;
};

/**
 * The biggest level among a hand's winners.
 *
 * A double ron is themed by its most expensive hand, on the reasoning that what
 * makes a hand worth spotting in the timeline is the best thing that happened
 * in it.
 */
export function topLevel(wins: readonly WinRow[]): Level | null {
  let best: Level | null = null;
  for (const win of wins) {
    if (!win.level) continue;
    if (best === null || rankOf(win.level) > rankOf(best)) best = win.level;
  }
  return best;
}

export interface BestHand {
  seat: Seat;
  win: WinRow;
  /** Which hand of the match it was. */
  seq: number;
}

/**
 * The biggest hand anyone made, by limit first and base points second.
 *
 * Base points rather than points won, because that is the hand's own size: a
 * dealer collects half again as much for the same hand, and honba would let a
 * long repeat flatter a small one.
 */
export function bestHand(state: MatchState): BestHand | null {
  let best: BestHand | null = null;
  let bestKey: [number, number] = [-1, -1];
  for (const row of state.hands) {
    for (const win of row.wins) {
      if (!win.level) continue;
      const key: [number, number] = [rankOf(win.level), win.basePoints ?? 0];
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        bestKey = key;
        best = { seat: win.winnerSeat, win, seq: row.seq };
      }
    }
  }
  return best;
}

/** The best limit reached in the match, for `matches.max_level`. */
export const maxLevel = (state: MatchState): Level | null =>
  bestHand(state)?.win.level ?? null;
