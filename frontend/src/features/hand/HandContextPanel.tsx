/**
 * The second flap: everything about the win that isn't tiles.
 *
 * Flag combinations the engine rejects are disabled here rather than left to
 * fail validation, since a disabled control explains itself better than an error.
 */
import type { SituationWind, WinMode } from '../../scorer/types';
import { SITUATION_WINDS } from '../../scorer/types';
import type { HandState, RiichiChoice } from './handState';

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
  const riichiDeclared = state.riichi !== 'none';
  const firstRound = state.firstRound;

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
      <p className="context__note">
        Seat wind {WIND_KANJI.este} means the winner is dealer.
      </p>

      <Segmented label="Riichi" value={state.riichi}
                 options={['none', 'riichi', 'dobleRiichi'] as RiichiChoice[]}
                 onChange={(v) => update({
                   riichi: v,
                   // Dropping the riichi invalidates anything that depends on it.
                   ...(v === 'none' ? { ippatsu: false } : {}),
                 })}
                 render={(v) => (v === 'none' ? 'None' : v === 'riichi' ? 'Riichi' : 'Double')} />

      <div className="field">
        <span className="field__label">Circumstances</span>
        <div className="checks">
          <Check label="Ippatsu" checked={state.ippatsu}
                 disabled={!riichiDeclared || firstRound}
                 hint={!riichiDeclared ? 'Requires a riichi' : firstRound ? 'Not on the first round' : 'One-shot'}
                 onChange={(v) => update({ ippatsu: v })} />
          <Check label="Chankan" checked={state.chankan}
                 disabled={state.rinshan || state.lastDraw}
                 hint="Robbing a kan"
                 onChange={(v) => update({ chankan: v })} />
          <Check label="Rinshan" checked={state.rinshan}
                 disabled={state.chankan || state.lastDraw}
                 hint="After a kan"
                 onChange={(v) => update({ rinshan: v })} />
          <Check label="Last draw" checked={state.lastDraw}
                 disabled={state.rinshan || state.chankan}
                 hint={state.winMode === 'tsumo' ? 'Haitei — last tile drawn' : 'Houtei — last discard'}
                 onChange={(v) => update({ lastDraw: v })} />
          <Check label="First round" checked={state.firstRound}
                 disabled={riichiDeclared}
                 hint={riichiDeclared
                   ? 'Incompatible with a riichi'
                   : 'Uninterrupted first go-around — enables tenhou / chiihou / renhou'}
                 onChange={(v) => update({ firstRound: v, ...(v ? { ippatsu: false } : {}) })} />
        </div>
      </div>
    </div>
  );
}
