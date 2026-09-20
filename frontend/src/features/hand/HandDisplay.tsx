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
import { isRedFive } from '../../scorer/order';

function MeldView({ meld, onRemove }: { meld: DeclaredMeld; onRemove: () => void }) {
  const tiles = meld.tiles as TileAtom[];

  return (
    <button type="button" className="meld" onClick={onRemove}
            title="Remove this meld" aria-label={`Remove ${meld.kind}`}>
      {tiles.map((tile, i) => {
        // An ankan is shown with its outer tiles face down.
        if (meld.kind === 'kanC') {
          return <Tile key={i} face={ankanFaces(tiles)[i]!} />;
        }
        // Called melds: the first tile lies sideways, marking where it came from.
        return <Tile key={i} face={tile} rotated={i === 0} />;
      })}
    </button>
  );
}

/** The indicators as they sit on the table. What each points at is left implicit. */
function IndicatorRow({ label, indicators, onRemove }: {
  label: string; indicators: TileAtom[]; onRemove: (i: number) => void;
}) {
  if (indicators.length === 0) return null;
  return (
    <div className="dorarow">
      <span className="dorarow__label">{label}</span>
      {indicators.map((tile, i) => (
        <Tile key={i} face={tile} onClick={() => onRemove(i)}
              label={`${label} indicator ${tile} — points at ${doraFromIndicator(tile)}`} />
      ))}
    </div>
  );
}

/**
 * A concealed kan is shown with its outer tiles face down. Its tiles are
 * reordered first so anything worth seeing -- a red five, which a kan of fives
 * always contains -- ends up in one of the two visible slots.
 */
function ankanFaces(tiles: readonly TileAtom[]): (TileAtom | 'back')[] {
  const reds = tiles.filter(isRedFive);
  const plain = tiles.filter((t) => !isRedFive(t));
  const visible = [...reds, ...plain].slice(0, 2);
  return ['back', visible[0] ?? tiles[0]!, visible[1] ?? tiles[1]!, 'back'];
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
                ? <Tile key={j} face={ankanFaces(meld.tiles as TileAtom[])[j]!} />
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
