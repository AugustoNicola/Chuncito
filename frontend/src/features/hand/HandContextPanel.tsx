/**
 * The second flap: everything about the win that isn't tiles.
 *
 * Flag combinations the engine rejects are disabled here rather than left to
 * fail validation, since a disabled control explains itself better than an error.
 */
import type { SituationWind, WinMode } from '../../scorer/types';
import { SITUATION_WINDS } from '../../scorer/types';
import { contextIssue, type HandState, type RiichiChoice } from './handState';

const WIND_KANJI: Record<SituationWind, string> = {
  este: '東', sur: '南', oeste: '西', norte: '北',
};
const WIND_NAME: Record<SituationWind, string> = {
  este: 'East', sur: 'South', oeste: 'West', norte: 'North',
};

function Segmented<T extends string>({ label, value, options, onChange, render }: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  render?: (v: T) => React.ReactNode;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((opt) => (
          <button key={opt} type="button"
                  className={`segmented__btn${value === opt ? ' segmented__btn--on' : ''}`}
                  aria-pressed={value === opt}
                  onClick={() => onChange(opt)}>
            {render ? render(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A toggle, styled like the segmented selectors above it. `aria-pressed` keeps
 * it announced as a two-state control despite not being a checkbox.
 */
function Check({ label, checked, disabled, hint, onChange }: {
  label: string; checked: boolean; disabled?: boolean; hint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button"
            className={`check${checked ? ' check--on' : ''}`}
            aria-pressed={checked}
            disabled={disabled}
            title={hint}
            onClick={() => onChange(!checked)}>
      {label}
    </button>
  );
}

export function HandContextPanel({
  state, update, showWinds = true, showWinMode = true, riichiDeclared, showPlayers = false, onSanma,
}: {
  state: HandState;
  update: (patch: Partial<HandState>) => void;
  /**
   * False inside the match tracker, where both winds are already known: the
   * round from the match and the seat from who is winning. Letting them be
   * picked again there would be asking for a fact the app holds -- and the seat
   * wind is what tells the engine the winner is dealer, so a wrong answer
   * silently mis-scores the hand.
   */
  showWinds?: boolean;
  /**
   * False inside the match tracker, which asked for ron/tsumo -- and for the
   * discarder -- before the hand was ever opened. Letting it be changed here
   * would leave the recorded deal-in pointing at nobody.
   */
  showWinMode?: boolean;
  /** See `HandBuilderProps.riichiDeclared`. Undefined leaves the choice free. */
  riichiDeclared?: boolean;
  /** Only in the plain calculator; the tracker's match already says. */
  showPlayers?: boolean;
  onSanma?: (on: boolean) => void;
}) {
  const riichiIssue = contextIssue(state, 'riichi');
  const issue = (k: Parameters<typeof contextIssue>[1]) => contextIssue(state, k);
  // Nobody sits North in sanma, and the round never reaches it.
  const winds = state.sanma ? SITUATION_WINDS.filter((w) => w !== 'norte') : SITUATION_WINDS;

  return (
    <div className="context">
      {showPlayers && onSanma && (
        <Segmented label="Players" value={state.sanma ? 'three' : 'four'}
                   options={['four', 'three'] as const}
                   onChange={(v) => onSanma(v === 'three')}
                   render={(v) => (v === 'four' ? 'Four' : 'Three (sanma)')} />
      )}

      {showWinMode && (
        <Segmented label="Win" value={state.winMode}
                   options={['ron', 'tsumo'] as WinMode[]}
                   onChange={(v) => update({ winMode: v })}
                   render={(v) => (v === 'ron' ? 'Ron' : 'Tsumo')} />
      )}

      {showWinds && (
        <>
          <Segmented label="Round wind" value={state.roundWind} options={winds}
                     onChange={(v) => update({ roundWind: v })}
                     render={(w) => <span title={WIND_NAME[w]}>{WIND_KANJI[w]}</span>} />

          <Segmented label="Seat wind" value={state.seatWind} options={winds}
                     onChange={(v) => update({ seatWind: v })}
                     render={(w) => <span title={WIND_NAME[w]}>{WIND_KANJI[w]}</span>} />
        </>
      )}

      <div className="field">
        <span className="field__label">Riichi</span>
        <div className="segmented" role="group" aria-label="Riichi">
          {(['none', 'riichi', 'dobleRiichi'] as RiichiChoice[]).map((opt) => {
            // A riichi is impossible on an open hand; the engine does not
            // enforce that, so the UI must.
            let blocked = opt !== 'none' && riichiIssue !== null;
            let why = blocked ? riichiIssue : null;
            // The table is the authority on whether a riichi was declared --
            // but only where one is possible at all. An open hand has already
            // retracted it, and None has to stay reachable to say so.
            if (riichiDeclared === false && opt !== 'none') {
              blocked = true;
              why = 'no riichi was declared on the table';
            } else if (riichiDeclared === true && opt === 'none' && riichiIssue === null) {
              blocked = true;
              why = 'a riichi was declared on the table';
            }
            return (
              <button key={opt} type="button"
                      className={`segmented__btn${state.riichi === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={state.riichi === opt}
                      disabled={blocked}
                      title={why ?? undefined}
                      onClick={() => update({ riichi: opt, ...(opt === 'none' ? { ippatsu: false } : {}) })}>
                {opt === 'none' ? 'None' : opt === 'riichi' ? 'Riichi' : 'Double'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Circumstances</span>
        <div className="checks">
          <Check label="Ippatsu" checked={state.ippatsu} disabled={issue('ippatsu') !== null}
                 hint={issue('ippatsu') ?? 'One-shot'}
                 onChange={(v) => update({ ippatsu: v })} />
          <Check label="Chankan" checked={state.chankan} disabled={issue('chankan') !== null}
                 hint={issue('chankan') ?? 'Robbing a kan'}
                 onChange={(v) => update({ chankan: v })} />
          <Check label="Rinshan" checked={state.rinshan} disabled={issue('rinshan') !== null}
                 hint={issue('rinshan') ?? 'After a kan'}
                 onChange={(v) => update({ rinshan: v })} />
          <Check label="Last draw" checked={state.lastDraw} disabled={issue('lastDraw') !== null}
                 hint={issue('lastDraw')
                   ?? (state.winMode === 'tsumo' ? 'Haitei — last tile drawn' : 'Houtei — last discard')}
                 onChange={(v) => update({ lastDraw: v })} />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Situational yakuman</span>
        <div className="checks checks--single">
          <Check label="First round win" checked={state.firstRound}
                 disabled={issue('firstRound') !== null}
                 hint={issue('firstRound') ?? 'An uninterrupted first go-around'}
                 onChange={(v) => update({ firstRound: v, ...(v ? { ippatsu: false } : {}) })} />
        </div>
      </div>
    </div>
  );
}
