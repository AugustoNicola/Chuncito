/**
 * The escape hatches: fix the scores, move the round on, take back the last
 * hand, stop the match early.
 *
 * Score correction is a field per player showing what each *will* hold, rather
 * than a delta to apply. That is how the table talks about it -- "you should be
 * on 23,400" -- and it makes the safety check obvious: the four numbers have to
 * still add up to what they added up to before. Points do not enter or leave a
 * riichi table, so a total that has moved means a typo, and the screen says so
 * instead of quietly banking it.
 *
 * Each correction still writes an `adjustments` row per seat that moved, so the
 * timeline can explain where the points went.
 */
import { useState } from 'react';
import type { MatchState } from './matchState';
import { potOnTable } from './matchState';
import { roundLabel } from './seats';
import type { Seat } from './seats';
import { SEATS } from './seats';

export function ManualControls({
  state, onAdjust, onAdvanceRound, onSetHonba, onUndo, onEnd, onClose,
}: {
  state: MatchState;
  onAdjust: (targets: number[], note: string) => void;
  onAdvanceRound: () => void;
  onSetHonba: (honba: number) => void;
  onUndo: () => void;
  onEnd: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(() => state.scores.map(String));
  const [note, setNote] = useState('');

  const last = state.hands.at(-1);
  const names = state.config.seats.map((p) => p.name);

  const parsed = draft.map((v) => Number(v.replace(/[\s,]/g, '')));
  const valid = parsed.every((n) => Number.isFinite(n) && Number.isInteger(n));
  const wasTotal = state.scores.reduce((a, b) => a + b, 0);
  const nowTotal = valid ? parsed.reduce((a, b) => a + b, 0) : NaN;
  const balanced = valid && nowTotal === wasTotal;
  const changed = valid && SEATS.some((s) => parsed[s] !== state.scores[s]);

  const setSeat = (seat: Seat, value: string) =>
    setDraft((d) => d.map((v, i) => (i === seat ? value : v)));

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Back</button>
        <h1 className="app__title">Manual control</h1>
        <span className="app__barspacer" />
      </header>

      <div className="manual">
        <div className="field">
          <span className="field__label">Scores</span>
          {SEATS.map((seat) => (
            <div className="manual__seat" key={seat}>
              <span className="manual__seatname">{names[seat]}</span>
              <input className="setup__name manual__score"
                     type="text" inputMode="numeric"
                     value={draft[seat]}
                     aria-label={`${names[seat]} score`}
                     onChange={(e) => setSeat(seat, e.target.value)} />
              <span className={`manual__diff${
                valid && parsed[seat]! !== state.scores[seat]
                  ? (parsed[seat]! > state.scores[seat] ? ' manual__diff--gain' : ' manual__diff--loss')
                  : ''}`}>
                {valid && parsed[seat]! !== state.scores[seat]
                  ? `${parsed[seat]! > state.scores[seat] ? '+' : ''}${(parsed[seat]! - state.scores[seat]).toLocaleString()}`
                  : ''}
              </span>
            </div>
          ))}

          <div className={`manual__total${balanced ? '' : ' manual__total--off'}`}>
            <span>Total</span>
            <span>
              {valid ? nowTotal.toLocaleString() : '—'}
              {' / '}
              {wasTotal.toLocaleString()}
            </span>
          </div>
          {!valid && <span className="setup__warn">Those are not all whole numbers.</span>}
          {valid && !balanced && (
            <span className="setup__warn">
              The table is {Math.abs(nowTotal - wasTotal).toLocaleString()} points
              {nowTotal > wasTotal ? ' over' : ' short'}. Points cannot appear or
              vanish, so something is mistyped.
            </span>
          )}

          <input className="setup__name" value={note} placeholder="Why (optional)"
                 aria-label="Reason for the adjustment"
                 onChange={(e) => setNote(e.target.value)} />

          <button type="button" className="btn btn--wide"
                  disabled={!balanced || !changed}
                  onClick={() => onAdjust(parsed, note.trim())}>
            Review the correction
          </button>
          <button type="button" className="btn btn--quiet"
                  onClick={() => { setDraft(state.scores.map(String)); setNote(''); }}>
            Reset these fields
          </button>
        </div>

        <div className="field">
          <span className="field__label">
            Round — {roundLabel(state.round)} · {state.honba} repeat
            {state.honba === 1 ? '' : 's'} · {potOnTable(state)} riichi
          </span>
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
          <button type="button" className="btn btn--wide" onClick={onEnd}>
            End early
          </button>
          <span className="field__hint">
            Placements are worked out from the scores as they stand.
          </span>
        </div>
      </div>
    </div>
  );
}
