/**
 * Seats and winds.
 *
 * Seat 0 is the player who starts as dealer; seats run counter-clockwise, the
 * direction the dealership moves. Everything else about winds is derived from
 * the round, never stored, so the table can't drift out of step with the round
 * marker on the centre box.
 *
 * Every function here takes the player count, because sanma changes the
 * arithmetic rather than just dropping a chair: a wind has three rounds, the
 * dealership cycles through three seats, and nobody ever sits North. Seat 3 is
 * simply absent in a three-player match -- it is the chair that would have
 * started as North.
 */
import type { SituationWind } from '../../scorer/types';
import { SITUATION_WINDS } from '../../scorer/types';

export type Seat = 0 | 1 | 2 | 3;

/** Yonma or sanma. */
export type PlayerCount = 3 | 4;

const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3];

/** The seats in play, in turn order. */
export const seatsOf = (players: PlayerCount): readonly Seat[] => ALL_SEATS.slice(0, players);

export const isSeat = (n: number): n is Seat => n === 0 || n === 1 || n === 2 || n === 3;

/** A hanchan runs to South; a tonpuusen stops at the end of East. */
export type MatchLength = 'east' | 'south';

export interface Round {
  wind: SituationWind;
  /** 1..players within the wind: East 1-4, or East 1-3 in sanma. */
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
export function dealerOf(round: Round, players: PlayerCount): Seat {
  const passed = windIndex(round.wind) * players + (round.number - 1);
  return (passed % players) as Seat;
}

/**
 * A seat's wind this round. The dealer is always East; in sanma the seats run
 * East, South, West and North is never anybody's.
 */
export function seatWindOf(seat: Seat, round: Round, players: PlayerCount): SituationWind {
  const offset = (seat - dealerOf(round, players) + players) % players;
  return SITUATION_WINDS[offset]!;
}

/**
 * The last round wind a match can reach, however long sudden death runs. Four
 * players can play into North; sanma stops at West, since North is not a wind
 * anybody sits in -- its tiles are pulled as nukidora instead.
 */
export const lastWind = (players: PlayerCount): SituationWind =>
  (players === 4 ? 'norte' : 'oeste');

/** The round after this one, when the dealership passes. */
export function nextRound(round: Round, players: PlayerCount): Round {
  if (round.number < players) return { wind: round.wind, number: round.number + 1 };
  const next = SITUATION_WINDS[windIndex(round.wind) + 1];
  // The reducer stops the match at the last wind, before this can run out.
  return { wind: next ?? lastWind(players), number: 1 };
}

/** The last round of the match proper, before any sudden death. */
export const finalRound = (length: MatchLength, players: PlayerCount): Round =>
  ({ wind: length === 'east' ? 'este' : 'sur', number: players });

/**
 * The hard stop: the last round of the one extra wind that sudden death plays
 * -- South for an East match, West for a South one.
 */
export const isExtensionEnd = (round: Round, length: MatchLength, players: PlayerCount): boolean =>
  round.wind === (length === 'east' ? 'sur' : 'oeste') && round.number === players;

/** True once `round` is past the nominal end of the match, i.e. in sudden death. */
export function isSuddenDeath(round: Round, length: MatchLength): boolean {
  // Only the wind matters, so this holds for either player count.
  return windIndex(round.wind) > windIndex(length === 'east' ? 'este' : 'sur');
}

/**
 * How far `to` sits from `from` in turn order, which runs counter-clockwise --
 * the same direction the dealership moves. 1 is the next player to act.
 *
 * Used to settle multiple ron: the winner nearest the discarder takes the honba
 * and any riichi stick that will not divide evenly.
 */
export const turnDistance = (from: Seat, to: Seat, players: PlayerCount): number =>
  (to - from + players) % players;

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
