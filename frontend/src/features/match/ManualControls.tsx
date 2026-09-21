/**
 * The escape hatches: fix a score, move the round on, take back the last hand,
 * stop the match early.
 *
 * Everything here is a correction for something the table got wrong, so each one
 * is either reversible or recorded. A score change writes an `adjustments` row
 * with a note rather than quietly moving the number, so the timeline still
 * explains where the points went.
 */
import { useState } from 'react';
import type { MatchState } from './matchState';
import { roundLabel } from './seats';
import type { Seat } from './seats';
import { SEATS } from './seats';

const STEPS = [1000, 1000, 5000, 10000];

export function ManualControls({ state, onAdjust, onAdvanceRound, onSetHonba, onUndo, onEnd, onClose }: {
  state: MatchState;
  onAdjust: (seat: Seat, delta: number, note: string) => void;
  onAdvanceRound: () => void;
  onSetHonba: (honba: number) => void;
  onUndo: () => void;
  onEnd: () => void;
  onClose: () => void;
}) {
  const [seat, setSeat] = useState<Seat>(0);
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const last = state.hands.at(-1);
  const names = state.config.seats.map((p) => p.name);

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Back</button>
        <h1 className="app__title">Manual control</h1>
        <span className="app__barspacer" />
      </header>

      <div className="manual">
        <div className="field">
          <span className="field__label">Adjust a score</span>
          <div className="segmented" role="group" aria-label="Whose score">
            {SEATS.map((s) => (
              <button key={s} type="button"
                      className={`segmented__btn${seat === s ? ' segmented__btn--on' : ''}`}
                      aria-pressed={seat === s}
                      onClick={() => setSeat(s)}>
                {names[s]}
              </button>
            ))}
          </div>

          <div className="manual__steps">
            {STEPS.map((step, i) => (
              <button key={`-${step}-${i}`} type="button" className="pill"
                      onClick={() => setDelta((d) => d - step)}>
                −{step.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="manual__amount" aria-live="polite">
            {delta > 0 ? '+' : ''}{delta.toLocaleString()}
          </div>
          <div className="manual__steps">
            {STEPS.map((step, i) => (
              <button key={`+${step}-${i}`} type="button" className="pill"
                      onClick={() => setDelta((d) => d + step)}>
                +{step.toLocaleString()}
              </button>
            ))}
          </div>

          <input className="setup__name" value={note} placeholder="Why (optional)"
                 aria-label="Reason for the adjustment"
                 onChange={(e) => setNote(e.target.value)} />

          <button type="button" className="btn btn--wide" disabled={delta === 0}
                  onClick={() => { onAdjust(seat, delta, note.trim()); setDelta(0); setNote(''); }}>
            Apply to {names[seat]}
          </button>
        </div>

        <div className="field">
          <span className="field__label">Round — currently {roundLabel(state.round)}</span>
          <div className="manual__row">
            <button type="button" className="btn" onClick={onAdvanceRound}>
              Pass the deal on
            </button>
            <button type="button" className="btn" disabled={state.honba === 0}
                    onClick={() => onSetHonba(state.honba - 1)}>
              Honba −
            </button>
            <button type="button" className="btn" onClick={() => onSetHonba(state.honba + 1)}>
              Honba +
            </button>
          </div>
          <span className="field__hint">
            Passing the deal on here records no hand — it is for fixing a mis-entry,
            not for playing one.
          </span>
        </div>

        <div className="field">
          <span className="field__label">Last hand</span>
          <button type="button" className="btn btn--wide" disabled={!last} onClick={onUndo}>
            {last
              ? `Undo hand ${last.seq} — ${roundLabel({ wind: last.roundWind, number: last.roundNumber })}`
              : 'Nothing to undo'}
          </button>
          <span className="field__hint">
            Puts the table back exactly, riichi sticks included.
          </span>
        </div>

        <div className="field">
          <span className="field__label">End the match</span>
          {confirmEnd ? (
            <div className="manual__row">
              <button type="button" className="btn btn--danger" onClick={onEnd}>
                Yes, end it now
              </button>
              <button type="button" className="btn" onClick={() => setConfirmEnd(false)}>
                Keep playing
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn--wide" onClick={() => setConfirmEnd(true)}>
              End early
            </button>
          )}
          <span className="field__hint">
            Placements are worked out from the scores as they stand.
          </span>
        </div>
      </div>
    </div>
  );
}
