/**
 * The match as database rows, and back again.
 *
 * `DATA_MODEL.md` describes the tables; this is the mapping to them, written
 * now rather than in Phase 3 so the claim that a match survives a round trip can
 * be *tested* rather than assumed. `rows.test.ts` reconstructs a played match
 * from nothing but these rows and checks it against the original.
 *
 * Two things are deliberately not persisted, and both are accounted for:
 *
 * - **`pendingRiichi`** — sticks declared for a hand that has not resolved. The
 *   server holds the match up to the last *completed* hand by design, so a
 *   resume picks up with the current hand replayed. See `ARCHITECTURE.md`.
 * - **The live round, honba, pot and scores** — all derivable. Scores are a
 *   prefix sum of `score_delta` plus adjustments; the round marker follows from
 *   the last hand's own row and outcome. Storing them would be a second source
 *   of truth that could disagree with the hands.
 */
import type { Flag, Level, Rule, SituationWind, YakuHan } from '../../scorer/types';
import {
  type AbortiveReason, type Adjustment, type EndReason, type HandRow, type MatchConfig,
  type MatchState, type Outcome, type SeatPlayer, type WinRow, maxLevel,
} from './matchState';
import { type Delta, RIICHI_STICK, deltaOf, placements } from './scoring';
import {
  type MatchLength, type PlayerCount, type Round, type Seat, dealerOf, nextRound, seatsOf,
} from './seats';

export interface MatchTableRow {
  id: string;
  name: string;
  /**
   * 3 or 4. Derivable from counting `match_players`, but it is the ruleset --
   * sanma scores differently -- so it is a column, and history can filter on it.
   */
  players: PlayerCount;
  redFives: boolean;
  rules: Rule[];
  length: MatchLength;
  startingPoints: number;
  goalScore: number;
  umaJson: string;
  status: MatchState['status'];
  endReason: EndReason | null;
  startedAt: string;
  endedAt: string | null;
  maxLevel: Level | null;
  isTest: boolean;
}

export interface MatchPlayerRow {
  seat: Seat;
  playerId: string | null;
  guestName: string | null;
  finalScore: number;
  placement: number | null;
  umaPoints: number | null;
}

export interface HandTableRow {
  clientUuid: string;
  seq: number;
  roundWind: SituationWind;
  roundNumber: number;
  honba: number;
  riichiPotBefore: number;
  outcome: Outcome;
  abortiveReason: AbortiveReason | null;
  dealInSeat: Seat | null;
  /** "+8000,-8000,0,0" across seats, as the data model spells it; three in sanma. */
  scoreDelta: string;
}

export interface HandWinRow {
  handSeq: number;
  winnerSeat: Seat;
  han: number | null;
  fu: number | null;
  level: Level | null;
  basePoints: number | null;
  pointsWon: number | null;
  isManual: boolean;
  winnerOpen: boolean | null;
  handTiles: string | null;
  /** Comma-separated flag atoms, or null for a typed-in value. */
  situationFlags: string | null;
}

export interface HandSeatRow { handSeq: number; seat: Seat }
export interface HandYakuRow { handSeq: number; winnerSeat: Seat; yaku: string; han: number }
export interface AdjustmentRow {
  clientUuid: string; afterSeq: number; seat: Seat; delta: number; note: string;
}

export interface MatchRows {
  match: MatchTableRow;
  matchPlayers: MatchPlayerRow[];
  hands: HandTableRow[];
  handWins: HandWinRow[];
  handRiichi: HandSeatRow[];
  handTenpai: HandSeatRow[];
  handYakus: HandYakuRow[];
  adjustments: AdjustmentRow[];
}

/**
 * The match as rows. Placements and uma are filled in once the match is over --
 * from the same `placements` the end screen shows -- and left null while it is
 * still being played, since a place mid-match is not a result.
 */
export function toRows(state: MatchState): MatchRows {
  const standings = state.status === 'finished'
    ? placements(state.scores, state.config.uma)
    : [];
  const rows: MatchRows = {
    match: {
      id: state.id,
      name: state.name,
      players: state.config.players,
      redFives: state.config.redFives,
      rules: [...state.config.rules],
      length: state.config.length,
      startingPoints: state.config.startingPoints,
      goalScore: state.config.goalScore,
      umaJson: JSON.stringify(state.config.uma),
      status: state.status,
      endReason: state.endReason,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      maxLevel: maxLevel(state),
      isTest: false,
    },
    matchPlayers: seatsOf(state.config.players).map((seat) => {
      const player = state.config.seats[seat]!;
      const place = standings.find((p) => p.seat === seat);
      return {
        seat,
        playerId: player.playerId,
        // A guest is a seat with no player behind it; that is where the name lives.
        guestName: player.playerId === null ? player.name : null,
        // As of the last completed hand: a stick declared in the hand being
        // played is not in any row yet, so it is not taken off here either.
        // Once the match is over, sticks still out were lost and it is.
        finalScore: state.scores[seat]
          + (state.status === 'in_progress' && state.pendingRiichi.includes(seat)
            ? RIICHI_STICK : 0),
        placement: place?.place ?? null,
        umaPoints: place?.umaPoints ?? null,
      };
    }),
    hands: [],
    handWins: [],
    handRiichi: [],
    handTenpai: [],
    handYakus: [],
    adjustments: state.adjustments.map((a) => ({ ...a })),
  };

  for (const hand of state.hands) {
    rows.hands.push({
      clientUuid: hand.clientUuid,
      seq: hand.seq,
      roundWind: hand.roundWind,
      roundNumber: hand.roundNumber,
      honba: hand.honba,
      riichiPotBefore: hand.riichiPotBefore,
      outcome: hand.outcome,
      abortiveReason: hand.abortiveReason,
      dealInSeat: hand.dealInSeat,
      scoreDelta: hand.scoreDelta.join(','),
    });
    for (const win of hand.wins) {
      rows.handWins.push({
        handSeq: hand.seq,
        winnerSeat: win.winnerSeat,
        han: win.han,
        fu: win.fu,
        level: win.level,
        basePoints: win.basePoints,
        pointsWon: win.pointsWon,
        isManual: win.isManual,
        winnerOpen: win.winnerOpen,
        handTiles: win.handTiles,
        situationFlags: win.situationFlags === null ? null : win.situationFlags.join(','),
      });
      for (const yaku of win.yakus) {
        rows.handYakus.push({
          handSeq: hand.seq, winnerSeat: win.winnerSeat, yaku: yaku.yaku, han: yaku.han,
        });
      }
    }
    for (const seat of hand.riichiSeats) rows.handRiichi.push({ handSeq: hand.seq, seat });
    for (const seat of hand.tenpaiSeats) rows.handTenpai.push({ handSeq: hand.seq, seat });
  }

  return rows;
}

const parseDelta = (text: string): Delta =>
  text.split(',').map(Number) as Delta;

/**
 * Where the match stands after a hand.
 *
 * The same rules as `recordHand`, read off the stored row instead of the input
 * that produced it: a hand row carries the round it was played under, and its
 * outcome says whether the dealership moved. That is the same property that
 * makes undo exact.
 */
function advance(players: PlayerCount, row: HandTableRow, wins: HandWinRow[], tenpai: Seat[],
                 ended: boolean): {
  round: Round; honba: number; pot: number;
} {
  const played: Round = { wind: row.roundWind, number: row.roundNumber };
  const dealer = dealerOf(played, players);
  const isWin = row.outcome === 'ron' || row.outcome === 'tsumo';

  const repeats = isWin
    ? wins.some((w) => w.winnerSeat === dealer)
    : row.outcome === 'abortive_draw' || tenpai.includes(dealer);

  return {
    // The hand that ended the match leaves the round where it was, as in
    // `recordHand`: there is no next round to name.
    round: repeats || ended ? played : nextRound(played, players),
    honba: isWin ? (repeats ? row.honba + 1 : 0) : row.honba + 1,
    // Only a win clears the table; every kind of draw leaves the sticks on it.
    pot: isWin ? 0 : row.riichiPotBefore,
  };
}

/**
 * Rebuilds the match. `nameOf` resolves a registered player's display name,
 * which lives in `players` rather than on the seat; guests carry their own.
 */
export function fromRows(rows: MatchRows, nameOf?: (playerId: string) => string): MatchState {
  const seats = [...rows.matchPlayers]
    .sort((a, b) => a.seat - b.seat)
    .map<SeatPlayer>((p) => ({
      playerId: p.playerId,
      name: p.guestName ?? (p.playerId ? nameOf?.(p.playerId) ?? p.playerId : ''),
    }));

  const config: MatchConfig = {
    players: rows.match.players,
    redFives: rows.match.redFives,
    rules: rows.match.rules,
    length: rows.match.length,
    startingPoints: rows.match.startingPoints,
    goalScore: rows.match.goalScore,
    uma: JSON.parse(rows.match.umaJson) as MatchConfig['uma'],
    seats,
  };

  const bySeq = <T extends { handSeq: number }>(list: T[], seq: number): T[] =>
    list.filter((r) => r.handSeq === seq);

  const ordered = [...rows.hands].sort((a, b) => a.seq - b.seq);
  const hands: HandRow[] = ordered.map((row) => {
    const wins = bySeq(rows.handWins, row.seq);
    return {
      clientUuid: row.clientUuid,
      seq: row.seq,
      roundWind: row.roundWind,
      roundNumber: row.roundNumber,
      honba: row.honba,
      riichiPotBefore: row.riichiPotBefore,
      outcome: row.outcome,
      dealInSeat: row.dealInSeat,
      abortiveReason: row.abortiveReason,
      scoreDelta: parseDelta(row.scoreDelta),
      riichiSeats: bySeq(rows.handRiichi, row.seq).map((r) => r.seat),
      tenpaiSeats: bySeq(rows.handTenpai, row.seq).map((r) => r.seat),
      wins: wins.map<WinRow>((w) => ({
        winnerSeat: w.winnerSeat,
        han: w.han,
        fu: w.fu,
        level: w.level,
        basePoints: w.basePoints,
        pointsWon: w.pointsWon,
        isManual: w.isManual,
        winnerOpen: w.winnerOpen,
        handTiles: w.handTiles,
        situationFlags: w.situationFlags === null
          ? null
          // An empty string is a hand scored with no flags at all, which is not
          // the same as a typed-in value that never had any.
          : (w.situationFlags === '' ? [] : w.situationFlags.split(',') as Flag[]),
        yakus: bySeq(rows.handYakus, row.seq)
          .filter((y) => y.winnerSeat === w.winnerSeat)
          .map<YakuHan>((y) => ({ yaku: y.yaku, han: y.han })),
      })),
    };
  });

  // Scores are the prefix sum the data model promises, plus any corrections.
  const scores: Delta = deltaOf(config.players, (seat) => {
    let total = config.startingPoints;
    for (const hand of hands) total += hand.scoreDelta[seat];
    for (const a of rows.adjustments) if (a.seat === seat) total += a.delta;
    return total;
  });

  const last = ordered.at(-1);
  const after = last
    ? advance(config.players, last, bySeq(rows.handWins, last.seq),
              bySeq(rows.handTenpai, last.seq).map((r) => r.seat),
              rows.match.status === 'finished' && rows.match.endReason !== 'manual')
    : { round: { wind: 'este' as const, number: 1 }, honba: 0, pot: 0 };

  return {
    id: rows.match.id,
    config,
    round: after.round,
    honba: after.honba,
    potCarried: after.pot,
    // Not persisted: a declaration belongs to a hand that has not resolved.
    pendingRiichi: [],
    scores,
    hands,
    adjustments: rows.adjustments.map<Adjustment>((a) => ({ ...a })),
    status: rows.match.status,
    endReason: rows.match.endReason,
    name: rows.match.name,
    startedAt: rows.match.startedAt,
    endedAt: rows.match.endedAt,
  };
}

/** Sticks on the table are worth this much, for a review screen that shows them. */
export const potValue = (sticks: number): number => sticks * RIICHI_STICK;
