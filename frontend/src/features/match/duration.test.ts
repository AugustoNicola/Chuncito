import { describe, expect, it } from 'vitest';
import { durationLabel, handDurations, matchDuration } from './duration';
import { type HandInput, type MatchConfig, createMatch, recordHand, undoLastHand } from './matchState';

const config: MatchConfig = {
  players: 4, redFives: true, rules: [], length: 'south',
  startingPoints: 25000, targetScore: 30000, goalScore: 30000, uma: [20, 10, -10, -20],
  seats: [{ playerId: null, name: 'A' }, { playerId: null, name: 'B' },
          { playerId: null, name: 'C' }, { playerId: null, name: 'D' }],
  emptySide: null,
};
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 20, minutes));
const draw: HandInput = { kind: 'exhaustiveDraw', tenpai: [] };

describe('durations', () => {
  it('times each hand from the one before it, the first from the start', () => {
    let s = createMatch(config, at(0));
    s = recordHand(s, draw, at(9)).state;
    s = recordHand(s, draw, at(21)).state;
    expect(handDurations(s)).toEqual([9 * 60_000, 12 * 60_000]);
  });

  it('re-times a hand taken back and recorded again', () => {
    let s = createMatch(config, at(0));
    s = recordHand(s, draw, at(9)).state;
    s = undoLastHand(s);
    s = recordHand(s, draw, at(11)).state;
    expect(handDurations(s)).toEqual([11 * 60_000]);
  });

  it('leaves a hand untimed when either end of it is unknown', () => {
    let s = createMatch(config, at(0));
    s = recordHand(s, draw, at(9)).state;
    s = recordHand(s, draw, at(21)).state;
    s = { ...s, hands: [{ ...s.hands[0]!, recordedAt: null }, s.hands[1]!] };
    expect(handDurations(s)).toEqual([null, null]);
  });

  it('times a match from start to end, and not while it is going', () => {
    expect(matchDuration({ startedAt: at(0).toISOString(), endedAt: at(83).toISOString() })).toBe(83 * 60_000);
    expect(matchDuration({ startedAt: at(0).toISOString(), endedAt: null })).toBeNull();
  });

  it('says it to the minute', () => {
    expect(durationLabel(20_000)).toBe('<1 min');
    expect(durationLabel(12 * 60_000)).toBe('12 min');
    expect(durationLabel(65 * 60_000)).toBe('1 h 05 min');
  });
});
