/**
 * Dora indicator -> dora tile.
 *
 * The engine takes the *actual* dora tiles and declares this conversion out of
 * scope (see situacion.pl), so it lives here. Players only ever see indicators
 * on the table, so indicators are what the UI collects and what match history
 * should record.
 *
 * The indicator points at the next tile in its own cycle, wrapping around.
 */
import type { Tile } from './types';
import { normalizeRed, numberOf, suitOf } from './order';

const WIND_CYCLE: readonly Tile[] = ['e', 's', 'w', 'n'];
/** Haku -> Hatsu -> Chun -> Haku, the conventional dragon order. */
const DRAGON_CYCLE: readonly Tile[] = ['wh', 'g', 'r'];

function nextInCycle(cycle: readonly Tile[], tile: Tile): Tile | null {
  const i = cycle.indexOf(tile);
  return i < 0 ? null : cycle[(i + 1) % cycle.length]!;
}

/**
 * `sanma` matters for manzu only. A three-player set has no 2m-8m, so the man
 * cycle is just 1m -> 9m -> 1m: a 1m indicator makes 9m the dora, not a 2m that
 * is not in the wall. Pinzu, souzu and honours cycle as usual.
 */
export function doraFromIndicator(indicator: Tile, sanma: boolean): Tile {
  // A red five indicates the same tile a plain five does.
  const plain = normalizeRed(indicator);

  if (suitOf(plain) === 'honor') {
    return nextInCycle(WIND_CYCLE, plain) ?? nextInCycle(DRAGON_CYCLE, plain)!;
  }

  const n = numberOf(plain)!;
  if (sanma && suitOf(plain) === 'man') return n === 1 ? 'm9' : 'm1';
  // 9 wraps to 1; the dora is never the red copy.
  return `${plain[0]}${n === 9 ? 1 : n + 1}` as Tile;
}

export const doraFromIndicators = (indicators: readonly Tile[], sanma: boolean): Tile[] =>
  indicators.map((t) => doraFromIndicator(t, sanma));
