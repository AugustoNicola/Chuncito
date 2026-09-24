import { describe, expect, it } from 'vitest';
import { upgrade } from './persistence';
import { playSanmaInProgress } from './testMatches';
import type { MatchState } from './matchState';

describe('an old mirror on a phone', () => {
  it('keeps its return score as the goal score', () => {
    const current = playSanmaInProgress();
    const { goalScore, ...rest } = current.config;
    const old = { ...current, config: { ...rest, returnScore: 38000 } } as unknown as MatchState;
    const { state, changed } = upgrade(old);
    expect(changed).toBe(true);
    expect(state.config.goalScore).toBe(38000);
    expect('returnScore' in state.config).toBe(false);
    expect(goalScore).toBeGreaterThan(0);
  });

  it('leaves a current one alone', () => {
    expect(upgrade(playSanmaInProgress()).changed).toBe(false);
  });
});
