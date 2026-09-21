/**
 * Compact text encoding of a hand, for the `hands.hand_tiles` column.
 *
 * History is kept re-scorable: if the engine is later fixed or extended, stored
 * hands can be run through it again. That means the *input* has to survive, not
 * just the result -- and the input is more than a bag of tiles. An open hand
 * scores differently from a closed one and a call cannot be inferred from loose
 * tiles, so melds are recorded as melds. Dora indicators are recorded as
 * indicators, which is what a player actually sees on the table.
 *
 *   m2m2m3m4p3p4p5s3s4s5m6m7m8m5|chii:s3s4s5R|dora:m9|ura:s1
 *
 * The concealed section comes first and keeps *insertion order*, because the
 * last tile in it is the winning tile. Everything else is sorted already.
 *
 * Parsing needs a longest-match scan: atoms vary in length and share prefixes,
 * so `m5R` must be tried before `m5`, and `wh` before `w`.
 */
import type { DeclaredMeld, DeclaredMeldKind, Tile } from '../../scorer/types';
import { initialHandState, type HandState } from './handState';

const MELD_KINDS: readonly DeclaredMeldKind[] = ['chii', 'pon', 'kanA', 'kanC'];

const TILE_ATOMS: readonly Tile[] = [
  'm1', 'm2', 'm3', 'm4', 'm5', 'm5R', 'm6', 'm7', 'm8', 'm9',
  'p1', 'p2', 'p3', 'p4', 'p5', 'p5R', 'p6', 'p7', 'p8', 'p9',
  's1', 's2', 's3', 's4', 's5', 's5R', 's6', 's7', 's8', 's9',
  'e', 's', 'w', 'n', 'r', 'g', 'wh',
];

/** Longest atom first, so `m5R` wins over `m5` and `wh` over `w`. */
const BY_LENGTH: readonly Tile[] = [...TILE_ATOMS].sort((a, b) => b.length - a.length);

export class HandTilesParseError extends Error {}

const joinTiles = (tiles: readonly Tile[]): string => tiles.join('');

export function encodeHandTiles(state: HandState): string {
  const sections = [joinTiles(state.concealed)];
  for (const meld of state.melds) sections.push(`${meld.kind}:${joinTiles(meld.tiles)}`);
  if (state.doraIndicators.length > 0) sections.push(`dora:${joinTiles(state.doraIndicators)}`);
  if (state.uraIndicators.length > 0) sections.push(`ura:${joinTiles(state.uraIndicators)}`);
  return sections.join('|');
}

/** Longest-match scan over a run of concatenated atoms. */
export function parseTiles(text: string): Tile[] {
  const tiles: Tile[] = [];
  let at = 0;
  while (at < text.length) {
    const atom = BY_LENGTH.find((t) => text.startsWith(t, at));
    if (!atom) throw new HandTilesParseError(`unknown tile at offset ${at} in "${text}"`);
    tiles.push(atom);
    at += atom.length;
  }
  return tiles;
}

function parseMeld(kind: DeclaredMeldKind, tiles: Tile[]): DeclaredMeld {
  const want = kind === 'chii' || kind === 'pon' ? 3 : 4;
  if (tiles.length !== want) {
    throw new HandTilesParseError(`${kind} needs ${want} tiles, got ${tiles.length}`);
  }
  return { kind, tiles } as DeclaredMeld;
}

/**
 * Rebuilds the tile half of a `HandState`. The context flags -- riichi, winds,
 * circumstances -- are stored in their own columns, so they are not in here and
 * come back at their defaults.
 */
export function decodeHandTiles(text: string): HandState {
  const [concealed, ...rest] = text.split('|');
  const state: HandState = {
    ...initialHandState,
    concealed: parseTiles(concealed ?? ''),
    melds: [],
    doraIndicators: [],
    uraIndicators: [],
  };

  for (const section of rest) {
    const at = section.indexOf(':');
    if (at < 0) throw new HandTilesParseError(`section "${section}" has no prefix`);
    const prefix = section.slice(0, at);
    const tiles = parseTiles(section.slice(at + 1));

    if (prefix === 'dora') state.doraIndicators = tiles;
    else if (prefix === 'ura') state.uraIndicators = tiles;
    else if ((MELD_KINDS as readonly string[]).includes(prefix)) {
      state.melds.push(parseMeld(prefix as DeclaredMeldKind, tiles));
    } else throw new HandTilesParseError(`unknown section prefix "${prefix}"`);
  }

  return state;
}
