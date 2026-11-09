import { describe, expect, it } from 'vitest';
import type { MatchState } from './matchState';
import { isNewYaku, yakusWonInMatch } from './yakuHistory';

/** Only the hands' winners and yaku matter here. */
const withWins = (wins: { seat: 0 | 1 | 2 | 3; yakus: string[] }[][]): MatchState => ({
  hands: wins.map((hand) => ({
    wins: hand.map((w) => ({ winnerSeat: w.seat, yakus: w.yakus.map((yaku) => ({ yaku, han: 1 })) })),
  })),
}) as unknown as MatchState;

describe('a yaku new to its winner', () => {
  it('collects what a seat has won with earlier in the match, a double ron included', () => {
    const state = withWins([
      [{ seat: 1, yakus: ['riichi', 'pinfu'] }],
      [],   // a draw
      [{ seat: 0, yakus: ['tanyao'] }, { seat: 1, yakus: ['yakuhaiHaku', 'dora'] }],
    ]);
    expect([...yakusWonInMatch(state, 1)].sort()).toEqual(['dora', 'pinfu', 'riichi', 'yakuhaiHaku']);
    expect([...yakusWonInMatch(state, 2)]).toEqual([]);
  });

  it('is new only against a known history, and dora never are', () => {
    const before = new Set(['riichi']);
    expect(isNewYaku('pinfu', before)).toBe(true);
    expect(isNewYaku('riichi', before)).toBe(false);
    expect(isNewYaku('dora', before)).toBe(false);
    expect(isNewYaku('akaDora', new Set())).toBe(false);
    // A guest, or no server: say nothing rather than call everything new.
    expect(isNewYaku('pinfu', null)).toBe(false);
  });
});
