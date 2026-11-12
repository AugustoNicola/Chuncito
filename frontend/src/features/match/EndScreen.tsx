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
import { type MatchState, canSaveAsEast } from './matchState';
import { MatchOutcome } from './MatchOutcome';
import { HandReview, useHandReview } from './HandReview';
import { matchResults, mpLabel, mpOf } from './scoring';
import { cachedPlayers, type Player } from '../players/players';
import { refreshPlayers } from './syncClient';

export function EndScreen({ state, onSave, onDiscard, onTimeline, onContinueAsSouth }: {
  state: MatchState;
  /** `asEast`: saved as the East match a South one ended early turned out to be. */
  onSave: (name: string, ranked: boolean, asEast?: boolean) => void;
  /** Set for an East match that a South match would have carried on from. */
  onContinueAsSouth?: () => void;
  /** Throws the match away -- from this phone and the server -- instead of saving it. */
  onDiscard: () => void;
  onTimeline: () => void;
}) {
  const [name, setName] = useState(state.name);
  // Still inside the match: the review is the screen's own state.
  const review = useHandReview(true);
  /**
   * No default: somebody has to say which, so a ranked night is never saved
   * as casual (or the other way) by tapping straight past the question. A
   * Tiktok match is never ranked, so it is not asked.
   */
  const [ranked, setRanked] = useState<boolean | null>(null);
  const undecided = !state.config.tiktok && ranked === null;
  const save = (asEast?: boolean) => onSave(name.trim(), ranked ?? false, asEast);
  /** Totals before this match, from the server if it answers, else the cache. */
  const [roster, setRoster] = useState<Player[]>(cachedPlayers);
  useEffect(() => { void refreshPlayers().then((list) => { if (list) setRoster(list); }); }, []);

  const results = matchResults(state.scores, state.config);
  const mpRows = results.map((r) => {
    const seat = state.config.seats[r.seat]!;
    const before = seat.playerId ? roster.find((p) => p.id === seat.playerId)?.mpPoints : undefined;
    return { seat, gained: mpOf(r), before };
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
        <MatchOutcome state={state} ranked={ranked ?? false} onReview={review.open} />

        {/* A Tiktok match is never ranked: nothing to choose. */}
        {!state.config.tiktok && <div className="field">
          <span className="field__label">MAKApoints</span>
          <div className="segmented" role="group" aria-label="MAKApoints">
            {[true, false].map((opt) => (
              <button key={String(opt)} type="button"
                      className={`segmented__btn${ranked === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={ranked === opt}
                      onClick={() => setRanked(opt)}>
                {opt ? 'Ranked' : 'Casual'}
              </button>
            ))}
          </div>
          {ranked === null ? (
            <span className="field__hint">Choose one to save the match.</span>
          ) : ranked ? (
            <div className="mpgain">
              {mpRows.map(({ seat, gained, before }) => (
                <div key={seat.name} className="mpgain__row">
                  <span className="mpgain__name">{seat.name}</span>
                  {seat.playerId === null ? (
                    <span className="mpgain__guest">guest — not counted</span>
                  ) : (
                    <>
                      <span className={`mpgain__gained${gained < 0 ? ' mpgain__gained--loss' : ''}`}>
                        {mpLabel(gained)}
                      </span>
                      <span className="mpgain__total">
                        {before === undefined
                          ? 'total when online'
                          : `${mpLabel(before)} → ${mpLabel(before + gained)}`}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>}

        <label className="field">
          <span className="field__label">Name this match</span>
          <input className="setup__name" value={name}
                 placeholder="e.g. the one with the double yakuman"
                 onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="app__spacer" />

      {/* Pinned to the bottom, so the way on is always in sight -- even disabled. */}
      <div className="app__footer">
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
          <>
            {/* Changing the match's length -- one or the other, never both --
                sits beside Discard, so Save keeps the wide primary place. */}
            <div className="endscreen__actions">
              <button type="button" className="btn btn--wide" onClick={() => setConfirmDiscard(true)}>
                Discard
              </button>
              {canSaveAsEast(state) ? (
                <button type="button" className="btn btn--wide" disabled={undecided} onClick={() => save(true)}>
                  Save as East match
                </button>
              ) : onContinueAsSouth ? (
                <button type="button" className="btn btn--wide" onClick={onContinueAsSouth}>
                  Continue as South match
                </button>
              ) : (
                <SaveButton disabled={undecided} onClick={() => save()} />
              )}
            </div>
            {(canSaveAsEast(state) || onContinueAsSouth) && (
              <SaveButton disabled={undecided} onClick={() => save()} />
            )}
          </>
        )}
        {confirmDiscard && (
          <span className="field__hint endscreen__warn">
            The match is deleted from this phone and from the history. It cannot be undone.
          </span>
        )}
      </div>
      {review.reviewed && <HandReview state={state} reviewed={review.reviewed} onBack={review.close} />}
    </div>
  );
}

function SaveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="btn btn--primary btn--wide" disabled={disabled} onClick={onClick}>
      Save and finish
    </button>
  );
}
