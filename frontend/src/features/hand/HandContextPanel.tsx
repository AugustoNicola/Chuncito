/**
 * The second flap: everything about the win that isn't tiles.
 *
 * Flag combinations the engine rejects are disabled here rather than left to
 * fail validation, since a disabled control explains itself better than an error.
 */
import type { SituationWind, WinMode } from '../../scorer/types';
import { SITUATION_WINDS } from '../../scorer/types';
import { contextIssue, isHandOpen, type HandState, type RiichiChoice } from './handState';

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

function Check({ label, checked, disabled, hint, onChange }: {
  label: string; checked: boolean; disabled?: boolean; hint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`check${disabled ? ' check--disabled' : ''}`} title={hint}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function HandContextPanel({ state, update }: {
  state: HandState;
  update: (patch: Partial<HandState>) => void;
}) {
  const riichiIssue = contextIssue(state, 'riichi');
  const issue = (k: Parameters<typeof contextIssue>[1]) => contextIssue(state, k);

  return (
    <div className="context">
      <Segmented label="Win" value={state.winMode}
                 options={['ron', 'tsumo'] as WinMode[]}
                 onChange={(v) => update({ winMode: v })}
                 render={(v) => (v === 'ron' ? 'Ron' : 'Tsumo')} />

      <Segmented label="Round wind" value={state.roundWind} options={SITUATION_WINDS}
                 onChange={(v) => update({ roundWind: v })}
                 render={(w) => <span title={WIND_NAME[w]}>{WIND_KANJI[w]}</span>} />

      <Segmented label="Seat wind" value={state.seatWind} options={SITUATION_WINDS}
                 onChange={(v) => update({ seatWind: v })}
                 render={(w) => <span title={WIND_NAME[w]}>{WIND_KANJI[w]}</span>} />

      <div className="field">
        <span className="field__label">Riichi</span>
        <div className="segmented" role="group" aria-label="Riichi">
          {(['none', 'riichi', 'dobleRiichi'] as RiichiChoice[]).map((opt) => {
            // A riichi is impossible on an open hand; the engine does not
            // enforce that, so the UI must.
            const blocked = opt !== 'none' && riichiIssue !== null;
            return (
              <button key={opt} type="button"
                      className={`segmented__btn${state.riichi === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={state.riichi === opt}
                      disabled={blocked}
                      title={blocked ? riichiIssue! : undefined}
                      onClick={() => update({ riichi: opt, ...(opt === 'none' ? { ippatsu: false } : {}) })}>
                {opt === 'none' ? 'None' : opt === 'riichi' ? 'Riichi' : 'Double'}
              </button>
            );
          })}
        </div>
        {riichiIssue && <p className="context__hint">Unavailable: {riichiIssue}.</p>}
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

      {isHandOpen(state) && (
        <p className="context__hint">
          This hand is open, so riichi, ippatsu and ura dora are unavailable.
          A concealed kan would keep it closed.
        </p>
      )}
    </div>
  );
}
