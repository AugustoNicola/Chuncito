/**
 * How long hands and matches took, worked out from when things happened
 * rather than timed: a hand's row says when it was recorded, and a match has
 * its start and end. Nothing ticks while a match is played -- the table shows
 * no clock, by request.
 *
 * Hands recorded before their time was kept (0006) have none, so their
 * durations are null and shown as nothing; a match's total needs only its
 * start and end, which every match has had all along.
 */
import type { MatchState } from './matchState';

const ms = (iso: string): number => new Date(iso).getTime();

/**
 * Each hand's duration in milliseconds, in hand order: from the hand before
 * it -- or the match's start, for the first -- to its own recording. Null when
 * either end is unknown.
 */
export function handDurations(state: Pick<MatchState, 'hands' | 'startedAt'>): (number | null)[] {
  return state.hands.map((row, i) => {
    const from = i === 0 ? state.startedAt : state.hands[i - 1]!.recordedAt;
    return row.recordedAt && from ? Math.max(0, ms(row.recordedAt) - ms(from)) : null;
  });
}

/** Start to end, for a finished match; null while one is still going. */
export const matchDuration = (match: { startedAt: string; endedAt: string | null }): number | null =>
  match.endedAt ? Math.max(0, ms(match.endedAt) - ms(match.startedAt)) : null;

/** "<1 min", "12 min", "1 h 05 min": to the minute, which is all a table cares about. */
export function durationLabel(duration: number): string {
  const minutes = Math.round(duration / 60_000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
