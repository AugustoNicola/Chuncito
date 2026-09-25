/**
 * Mode buttons. At most one is armed; pressing the armed one disarms it.
 * Call modes disarm themselves after use; dora and kita modes stay armed.
 *
 * In sanma there is no chii, so its button is not shown at all rather than
 * disabled -- and Kita joins the markers. A riichi disables the open calls and
 * enables Ura Dora.
 */
import { modeIssue, redAvailable, type CallMode, type HandState } from './handState';

/**
 * `sub` is a second, smaller line: "indicator" says the tile to tap is the one
 * turned over, not the dora itself, and on one line it would not fit a phone.
 */
type ModeSpec = { mode: CallMode; label: string; sub?: string; hint: string };

/** Calls on their own row; the tile-marking modifiers on a second. */
const CALLS: readonly ModeSpec[] = [
  { mode: 'chii', label: 'Chii', hint: 'Called run, starting at the tapped tile' },
  { mode: 'pon', label: 'Pon', hint: 'Called triplet' },
  { mode: 'kan', label: 'Kan', hint: 'Open kan' },
  { mode: 'closedKan', label: 'Closed kan', hint: 'Concealed kan (ankan)' },
];

const MARKERS: readonly ModeSpec[] = [
  { mode: 'dora', label: 'Dora', sub: 'indicator', hint: 'Mark the tapped tile as a dora indicator' },
  { mode: 'uraDora', label: 'Ura Dora', sub: 'indicator',
    hint: 'Mark the tapped tile as an ura dora indicator' },
];

const KITA: ModeSpec =
  { mode: 'kita', label: 'Kita', hint: 'Tap North to pull it aside as a nukidora' };

export function CallModeBar({ state, onToggle, onToggleRed }: {
  state: HandState;
  onToggle: (mode: CallMode) => void;
  onToggleRed: () => void;
}) {
  // data-mode drives the armed colour; idle buttons all look alike.
  const modeButton = ({ mode, label, sub, hint }: ModeSpec) => {
    // Calls in riichi, ura without one: see `modeIssue`.
    const issue = modeIssue(state, mode);
    return (
      <button
        key={mode}
        type="button"
        className={`modebar__btn${state.mode === mode ? ' modebar__btn--on' : ''}`}
        data-mode={mode}
        aria-pressed={state.mode === mode}
        disabled={issue !== null}
        title={issue ?? hint}
        onClick={() => onToggle(mode)}
      >
        {label}
        {sub && <> <span className="modebar__sub">{sub}</span></>}
      </button>
    );
  };

  return (
    <div className="modebar">
      <div className="modebar__row" role="group" aria-label="Calls">
        {CALLS.filter((c) => !(state.sanma && c.mode === 'chii')).map(modeButton)}
      </div>
      <div className="modebar__row" role="group" aria-label="Tile markers">
        {/* Red is independent of the modes: it combines with any of them. A set
            without red fives has no use for it, so it is not shown at all. */}
        {state.redFives && <button
          type="button"
          className={`modebar__btn${state.red ? ' modebar__btn--on' : ''}`}
          data-mode="red"
          aria-pressed={state.red}
          disabled={!redAvailable(state)}
          title="The next five you add is the red one — works on its own or inside a call"
          onClick={onToggleRed}
        >
          Red Five
        </button>}
        {MARKERS.map(modeButton)}
        {state.sanma && modeButton(KITA)}
      </div>
    </div>
  );
}
