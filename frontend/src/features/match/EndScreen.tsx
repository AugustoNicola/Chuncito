/**
 * Final standings.
 *
 * Each player's result -- final score against the target, uma, and 1st's oka
 * -- is shown with its working (`MatchOutcome`), so it can be checked at the
 * table and seen to sum to zero. The name field is
 * here because a match is much easier to find later by what happened in it than
 * by its date.
 */
import { useEffect, useState } from 'react';
import type { MatchState } from './matchState';
import { MatchOutcome } from './MatchOutcome';
import { matchResults, resultLabel } from './scoring';
import { cachedPlayers, type Player } from '../players/players';
import { refreshPlayers } from './syncClient';

export function EndScreen({ state, onSave, onDiscard, onTimeline }: {
  state: MatchState;
  onSave: (name: string, ranked: boolean) => void;
  /** Throws the match away -- from this phone and the server -- instead of saving it. */
  onDiscard: () => void;
  onTimeline: () => void;
}) {
  const [name, setName] = useState(state.name);
  /** For MAKApoints unless said otherwise: that is what the ranking is for. */
  const [ranked, setRanked] = useState(true);
  /** Totals before this match, from the server if it answers, else the cache. */
  const [roster, setRoster] = useState<Player[]>(cachedPlayers);
  useEffect(() => { void refreshPlayers().then((list) => { if (list) setRoster(list); }); }, []);

  const results = matchResults(state.scores, state.config);
  const mpRows = results.map((r) => {
    const seat = state.config.seats[r.seat]!;
    const before = seat.playerId ? roster.find((p) => p.id === seat.playerId)?.mpPoints : undefined;
    return { seat, gained: r.total, before };
  });
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

        <div className="field">
          <span className="field__label">MAKApoints</span>
          <div className="segmented" role="group" aria-label="MAKApoints">
            {[true, false].map((opt) => (
              <button key={String(opt)} type="button"
                      className={`segmented__btn${ranked === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={ranked === opt}
                      onClick={() => setRanked(opt)}>
                {opt ? 'Played for MPs' : 'Just for fun'}
              </button>
            ))}
          </div>
          {ranked ? (
            <div className="mpgain">
              {mpRows.map(({ seat, gained, before }) => (
                <div key={seat.name} className="mpgain__row">
                  <span className="mpgain__name">{seat.name}</span>
                  {seat.playerId === null ? (
                    <span className="mpgain__guest">guest — not counted</span>
                  ) : (
                    <>
                      <span className={`mpgain__gained${gained < 0 ? ' mpgain__gained--loss' : ''}`}>
                        {resultLabel(gained)}
                      </span>
                      <span className="mpgain__total">
                        {before === undefined
                          ? 'total when online'
                          : `${resultLabel(before)} → ${resultLabel(before + gained)} MP`}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="field__hint">Saved to the history, but no MAKApoints change hands.</span>
          )}
        </div>

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
          <button type="button" className="btn btn--primary btn--wide" onClick={() => onSave(name.trim(), ranked)}>
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
