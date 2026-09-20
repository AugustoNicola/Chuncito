/**
 * The hand as it is being built: concealed tiles (sorted, with the winning tile
 * set apart), then called melds, then the dora rows.
 *
 * Melds render the way they sit on a real table: a called meld shows one tile
 * turned sideways, and a concealed kan shows its two outer tiles face down.
 */
import { Tile } from '../../ui/Tile';
import type { DeclaredMeld, Tile as TileAtom } from '../../scorer/types';
import { concealedForDisplay, type HandState } from './handState';
import { doraFromIndicator } from '../../scorer/dora';

function MeldView({ meld, onRemove }: { meld: DeclaredMeld; onRemove: () => void }) {
  const tiles = meld.tiles as TileAtom[];

  return (
    <button type="button" className="meld" onClick={onRemove}
            title="Remove this meld" aria-label={`Remove ${meld.kind}`}>
      {tiles.map((tile, i) => {
        // An ankan is shown with its outer tiles face down.
        if (meld.kind === 'kanC') {
          const hidden = i === 0 || i === tiles.length - 1;
          return <Tile key={i} face={hidden ? 'back' : tile} />;
        }
        // Called melds: the first tile lies sideways, marking where it came from.
        return <Tile key={i} face={tile} rotated={i === 0} />;
      })}
    </button>
  );
}

/**
 * Indicators as they sit on the table, with the dora they point at shown
 * alongside -- the conversion is easy to get wrong from memory, so the UI does
 * it visibly rather than silently.
 */
function IndicatorRow({ label, indicators, onRemove }: {
  label: string; indicators: TileAtom[]; onRemove: (i: number) => void;
}) {
  if (indicators.length === 0) return null;
  return (
    <div className="dorarow">
      <span className="dorarow__label">{label}</span>
      {indicators.map((tile, i) => (
        <span className="dorarow__pair" key={i}>
          <Tile face={tile} onClick={() => onRemove(i)} label={`Remove ${label} indicator ${tile}`} />
          <span className="dorarow__arrow" aria-hidden="true">→</span>
          <Tile face={doraFromIndicator(tile)} label={`dora ${doraFromIndicator(tile)}`} />
        </span>
      ))}
    </div>
  );
}

/** Read-only rendering of a finished hand, for the score screen. */
export function HandSummary({ state }: { state: HandState }) {
  const { sorted, winning } = concealedForDisplay(state);
  return (
    <div className="handsummary">
      <div className="handsummary__tiles">
        {sorted.map(({ tile, index }) => <Tile key={index} face={tile} />)}
        {winning && <Tile face={winning.tile} winning />}
        {state.melds.map((meld, i) => (
          <span className="handsummary__meld" key={`m${i}`}>
            {(meld.tiles as TileAtom[]).map((tile, j) => (
              meld.kind === 'kanC'
                ? <Tile key={j} face={j === 0 || j === meld.tiles.length - 1 ? 'back' : tile} />
                : <Tile key={j} face={tile} rotated={j === 0} />
            ))}
          </span>
        ))}
      </div>
      <IndicatorRow label="Dora" indicators={state.doraIndicators} onRemove={() => {}} />
      <IndicatorRow label="Ura" indicators={state.uraIndicators} onRemove={() => {}} />
    </div>
  );
}

export function HandDisplay({ state, onRemoveConcealed, onRemoveMeld, onRemoveDora }: {
  state: HandState;
  onRemoveConcealed: (index: number) => void;
  onRemoveMeld: (index: number) => void;
  onRemoveDora: (index: number, ura: boolean) => void;
}) {
  const { sorted, winning } = concealedForDisplay(state);
  const empty = state.concealed.length === 0 && state.melds.length === 0;

  return (
    <div className="handdisplay">
      {empty && <p className="handdisplay__empty">Tap tiles below to build a hand.</p>}

      <div className="handdisplay__tiles">
        {sorted.map(({ tile, index }) => (
          <Tile key={index} face={tile} onClick={() => onRemoveConcealed(index)}
                label={`Remove ${tile}`} />
        ))}
        {winning && (
          <Tile face={winning.tile} winning onClick={() => onRemoveConcealed(winning.index)}
                label={`Winning tile ${winning.tile} — tap to remove`} />
        )}
      </div>

      {state.melds.length > 0 && (
        <div className="handdisplay__melds">
          {state.melds.map((meld, i) => (
            <MeldView key={i} meld={meld} onRemove={() => onRemoveMeld(i)} />
          ))}
        </div>
      )}

      <IndicatorRow label="Dora" indicators={state.doraIndicators}
                    onRemove={(i) => onRemoveDora(i, false)} />
      <IndicatorRow label="Ura" indicators={state.uraIndicators}
                    onRemove={(i) => onRemoveDora(i, true)} />
    </div>
  );
}
