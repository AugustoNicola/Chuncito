/**
 * Mode buttons. At most one is armed; pressing the armed one disarms it.
 * Call modes disarm themselves after use; dora modes stay armed.
 */
import { redAvailable, type CallMode, type HandState } from './handState';

const MODES: readonly { mode: CallMode; label: string; hint: string }[] = [
  { mode: 'chii', label: 'Chii', hint: 'Called run, starting at the tapped tile' },
  { mode: 'pon', label: 'Pon', hint: 'Called triplet' },
  { mode: 'kan', label: 'Kan', hint: 'Open kan' },
  { mode: 'closedKan', label: 'Closed kan', hint: 'Concealed kan (ankan)' },
  { mode: 'dora', label: 'Dora', hint: 'Mark the tapped tile as dora' },
  { mode: 'uraDora', label: 'Ura', hint: 'Mark the tapped tile as ura dora' },
];

export function CallModeBar({ state, onToggle, onToggleRed }: {
  state: HandState;
  onToggle: (mode: CallMode) => void;
  onToggleRed: () => void;
}) {
  return (
    <div className="modebar" role="group" aria-label="Call modes">
      {MODES.map(({ mode, label, hint }) => (
        <button
          key={mode}
          type="button"
          className={`modebar__btn${state.mode === mode ? ' modebar__btn--on' : ''}`}
          aria-pressed={state.mode === mode}
          title={hint}
          onClick={() => onToggle(mode)}
        >
          {label}
        </button>
      ))}
      {/* Independent of the modes above: combines with any of them. */}
      <button
        type="button"
        className={`modebar__btn modebar__btn--red${state.red ? ' modebar__btn--on' : ''}`}
        aria-pressed={state.red}
        disabled={!redAvailable(state)}
        title="The next five you add is the red one — works on its own or inside a call"
        onClick={onToggleRed}
      >
        Red 5
      </button>
    </div>
  );
}
