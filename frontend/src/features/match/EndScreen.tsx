/**
 * Final standings.
 *
 * Placement points are uma alone -- this group plays without oka -- so the raw
 * score is shown next to them rather than folded into them. The name field is
 * here because a match is much easier to find later by what happened in it than
 * by its date.
 */
import { useState } from 'react';
import type { MatchState } from './matchState';
import { MatchOutcome } from './MatchOutcome';

export function EndScreen({ state, onSave, onTimeline }: {
  state: MatchState;
  onSave: (name: string) => void;
  onTimeline: () => void;
}) {
  const [name, setName] = useState(state.name);

  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">Final scores</h1>
        <button type="button" className="btn btn--quiet" onClick={onTimeline}>Timeline</button>
      </header>

      <div className="endscreen">
        <MatchOutcome state={state} />

        <label className="field">
          <span className="field__label">Name this match</span>
          <input className="setup__name" value={name}
                 placeholder="e.g. the one with the double yakuman"
                 onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="app__spacer" />

      <button type="button" className="btn btn--primary btn--wide" onClick={() => onSave(name.trim())}>
        Save and finish
      </button>
    </div>
  );
}
