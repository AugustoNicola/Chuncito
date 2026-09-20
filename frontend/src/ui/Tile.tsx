/**
 * A single mahjong tile.
 *
 * The artwork is layered: front.svg is the tile face, and the glyph SVGs are
 * transparent overlays. Keeping them separate (rather than pre-composited) means
 * the face can be tinted or swapped for theming later.
 */
import type { Tile as TileAtom } from '../scorer/types';

export type TileFace = TileAtom | 'back' | 'blank';

export interface TileProps {
  face: TileFace;
  /** Called melds show one tile turned on its side. */
  rotated?: boolean;
  disabled?: boolean;
  /** Marks the winning tile in the hand display. */
  winning?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Tile({ face, rotated, disabled, winning, onClick, label }: TileProps) {
  const className = [
    'tile',
    rotated && 'tile--rotated',
    disabled && 'tile--disabled',
    winning && 'tile--winning',
    onClick && 'tile--button',
  ].filter(Boolean).join(' ');

  const layers = face === 'back'
    ? <img src="/tiles/back.svg" alt="" />
    : (
      <>
        <img src="/tiles/front.svg" alt="" />
        {face !== 'blank' && <img src={`/tiles/${face}.svg`} alt="" />}
      </>
    );

  if (!onClick) {
    return (
      <span className={className} role="img" data-face={face} aria-label={label ?? face}>
        {layers}
      </span>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled} data-face={face}
            onClick={onClick} aria-label={label ?? face} title={label}>
      {layers}
    </button>
  );
}
