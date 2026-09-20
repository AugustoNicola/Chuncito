/**
 * Canonical tile ordering, mirroring scorer/mahjonglog/src/orden.pl exactly.
 *
 * This matters more than it looks: every meld handed to the engine must already
 * have its tile arguments in this order. `chii(m2,m1,m3)` does not error — it
 * simply fails, and the whole score comes back as "no winning hand". Sorting is
 * the serializer's job, so it happens in one place: here.
 */
import type { Tile, Suit } from './types';

const SUIT_RANK: Record<Suit, number> = { man: 1, pin: 2, sou: 3, honor: 4 };

/** Wind order E,S,W,N then white, green, red (ordenHonor/2 upstream). */
const HONOR_RANK: Record<string, number> = { e: 1, s: 2, w: 3, n: 4, wh: 5, g: 6, r: 7 };

const SUIT_LETTER: Record<string, Suit> = { m: 'man', p: 'pin', s: 'sou' };

export function suitOf(tile: Tile): Suit {
  if (tile in HONOR_RANK) return 'honor';
  return SUIT_LETTER[tile[0]!]!;
}

export function isRedFive(tile: Tile): boolean {
  return tile === 'm5R' || tile === 'p5R' || tile === 's5R';
}

/** Numeric rank of a suited tile; red fives count as 5. Honors have no number. */
export function numberOf(tile: Tile): number | null {
  if (suitOf(tile) === 'honor') return null;
  return Number(tile[1]);
}

/** The plain tile a red five is equal to, per `===/2` (which ignores redness). */
export function normalizeRed(tile: Tile): Tile {
  return isRedFive(tile) ? (tile.slice(0, 2) as Tile) : tile;
}

/** Sort key: (suit, number-or-honor-rank, redFiveLast) — claveFicha/2 upstream. */
function key(tile: Tile): [number, number, number] {
  const suit = suitOf(tile);
  const rank = suit === 'honor' ? HONOR_RANK[tile]! : numberOf(tile)!;
  return [SUIT_RANK[suit], rank, isRedFive(tile) ? 1 : 0];
}

export function compareTiles(a: Tile, b: Tile): number {
  const ka = key(a), kb = key(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}

/** Stable sort into canonical order, preserving duplicates. */
export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort(compareTiles);
}

/** True when `tiles` is already canonically ordered (fichasEnOrden/1 upstream). */
export function tilesInOrder(tiles: readonly Tile[]): boolean {
  for (let i = 1; i < tiles.length; i++) {
    if (compareTiles(tiles[i - 1]!, tiles[i]!) > 0) return false;
  }
  return true;
}
