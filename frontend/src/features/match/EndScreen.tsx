/**
 * Final standings.
 *
 * Each player's result -- final score against the target, uma, and 1st's oka
 * -- is shown with its working (`MatchOutcome`), so it can be checked at the
 * table and seen to sum to zero. The name field is
 * here because a match is much easier to find later by what happened in it than
 * by its date.
 */
import { useState } from 'react';
import type { MatchState } from './matchState';
import { MatchOutcome } from './MatchOutcome';

export function EndScreen({ state, onSave, onDiscard, onTimeline }: {
  state: MatchState;
  onSave: (name: string) => void;
  /** Throws the match away -- from this phone and the server -- instead of saving it. */
  onDiscard: () => void;
  onTimeline: () => void;
}) {
  const [name, setName] = useState(state.name);
  /** Two taps, like discarding from Manual: a whole evening is one tap from gone. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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

      {confirmDiscard ? (
        <div className="endscreen__actions">
          <button type="button" className="btn btn--danger btn--wide" onClick={onDiscard}>
            Yes, throw it away
          </button>
          <button type="button" className="btn btn--wide" onClick={() => setConfirmDiscard(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="endscreen__actions">
          <button type="button" className="btn btn--wide" onClick={() => setConfirmDiscard(true)}>
            Discard
          </button>
          <button type="button" className="btn btn--primary btn--wide" onClick={() => onSave(name.trim())}>
            Save and finish
          </button>
        </div>
      )}
      {confirmDiscard && (
        <span className="field__hint endscreen__warn">
          The match is deleted from this phone and from the history. It cannot be undone.
        </span>
      )}
    </div>
  );
}
