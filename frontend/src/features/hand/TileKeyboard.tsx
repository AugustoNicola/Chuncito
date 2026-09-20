/**
 * The tile "keyboard": one row per suit, honours last.
 *
 * Buttons disable themselves based on the armed mode and what the hand already
 * holds, and carry the reason as a tooltip so the rule is discoverable rather
 * than mysterious.
 */
import { Tile } from '../../ui/Tile';
import type { Tile as TileAtom } from '../../scorer/types';
import { disabledReason, type HandState } from './handState';

const ROWS: readonly (readonly TileAtom[])[] = [
  ['m1', 'm2', 'm3', 'm4', 'm5', 'm5R', 'm6', 'm7', 'm8', 'm9'],
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p5R', 'p6', 'p7', 'p8', 'p9'],
  ['s1', 's2', 's3', 's4', 's5', 's5R', 's6', 's7', 's8', 's9'],
  ['e', 's', 'w', 'n', 'wh', 'g', 'r'],
];

const TILE_LABELS: Partial<Record<TileAtom, string>> = {
  e: 'East', s: 'South', w: 'West', n: 'North',
  wh: 'White dragon', g: 'Green dragon', r: 'Red dragon',
  m5R: 'Red five (man)', p5R: 'Red five (pin)', s5R: 'Red five (sou)',
};

export function TileKeyboard({ state, onPress }: {
  state: HandState;
  onPress: (tile: TileAtom) => void;
}) {
  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div className="keyboard__row" key={i}>
          {row.map((tile) => {
            const reason = disabledReason(state, tile);
            return (
              <Tile
                key={tile}
                face={tile}
                disabled={reason !== null}
                onClick={() => onPress(tile)}
                label={reason ? `${TILE_LABELS[tile] ?? tile} — ${reason}` : TILE_LABELS[tile] ?? tile}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
