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

function DoraRow({ label, tiles, onRemove }: {
  label: string; tiles: TileAtom[]; onRemove: (i: number) => void;
}) {
  if (tiles.length === 0) return null;
  return (
    <div className="dorarow">
      <span className="dorarow__label">{label}</span>
      {tiles.map((tile, i) => (
        <Tile key={i} face={tile} onClick={() => onRemove(i)} label={`Remove ${label} ${tile}`} />
      ))}
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

      <DoraRow label="Dora" tiles={state.dora} onRemove={(i) => onRemoveDora(i, false)} />
      <DoraRow label="Ura" tiles={state.uraDora} onRemove={(i) => onRemoveDora(i, true)} />
    </div>
  );
}
