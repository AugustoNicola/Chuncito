/**
 * Seats and winds.
 *
 * Seat 0 is the player who starts as dealer; seats run counter-clockwise, the
 * direction the dealership moves. Everything else about winds is derived from
 * the round, never stored, so the table can't drift out of step with the round
 * marker on the centre box.
 */
import type { SituationWind } from '../../scorer/types';
import { SITUATION_WINDS } from '../../scorer/types';

export type Seat = 0 | 1 | 2 | 3;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export const isSeat = (n: number): n is Seat => n === 0 || n === 1 || n === 2 || n === 3;

/** A hanchan runs to South; a tonpuusen stops at the end of East. */
export type MatchLength = 'east' | 'south';

export interface Round {
  wind: SituationWind;
  /** 1..4 within the wind. */
  number: number;
}

export const windIndex = (wind: SituationWind): number => SITUATION_WINDS.indexOf(wind);

/**
 * Who deals this round.
 *
 * Fully determined by the round: East 1 is seat 0, and each advance passes the
 * dealership on by one. A dealer repeat does not advance the round number, so
 * this stays correct through repeats without tracking them separately.
 */
export function dealerOf(round: Round): Seat {
  const passed = windIndex(round.wind) * 4 + (round.number - 1);
  return (passed % 4) as Seat;
}

/** A seat's wind this round. The dealer is always East. */
export function seatWindOf(seat: Seat, round: Round): SituationWind {
  const offset = (seat - dealerOf(round) + 4) % 4;
  return SITUATION_WINDS[offset]!;
}

/** The round after this one, when the dealership passes. */
export function nextRound(round: Round): Round {
  if (round.number < 4) return { wind: round.wind, number: round.number + 1 };
  const next = SITUATION_WINDS[windIndex(round.wind) + 1];
  // North is the last wind there is; the reducer stops the match before here.
  return { wind: next ?? 'norte', number: 1 };
}

/** The last round of the match proper, before any sudden death. */
export const finalRound = (length: MatchLength): Round =>
  ({ wind: length === 'east' ? 'este' : 'sur', number: 4 });

/** True once `round` is past the nominal end of the match, i.e. in sudden death. */
export function isSuddenDeath(round: Round, length: MatchLength): boolean {
  const final = finalRound(length);
  return windIndex(round.wind) > windIndex(final.wind);
}

/**
 * How far `to` sits from `from` in turn order, which runs counter-clockwise --
 * the same direction the dealership moves. 1 is the next player to act.
 *
 * Used to settle multiple ron: the winner nearest the discarder takes the honba
 * and any riichi stick that will not divide evenly.
 */
export const turnDistance = (from: Seat, to: Seat): number => (to - from + 4) % 4;

const ROUND_KANJI: Record<SituationWind, string> = {
  este: '東', sur: '南', oeste: '西', norte: '北',
};
const ROUND_NAME: Record<SituationWind, string> = {
  este: 'East', sur: 'South', oeste: 'West', norte: 'North',
};

export const roundKanji = (wind: SituationWind): string => ROUND_KANJI[wind];
export const roundName = (wind: SituationWind): string => ROUND_NAME[wind];

/** "East 3", for the timeline and the centre box. */
export const roundLabel = (round: Round): string =>
  `${ROUND_NAME[round.wind]} ${round.number}`;
