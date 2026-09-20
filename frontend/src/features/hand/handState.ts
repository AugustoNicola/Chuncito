/**
 * Hand-building state for the tile-input screen.
 *
 * Kept free of React so the fiddly parts -- which keyboard buttons are legal in
 * which mode, and when a call would illegally complete the hand -- are directly
 * testable.
 *
 * Two rules drive most of this:
 *  - The winning tile is the LAST tile acquired, so concealed tiles are held in
 *    insertion order even though they are displayed sorted.
 *  - Because of that, a call may never be the thing that completes the hand:
 *    at least one concealed tile has to come after the final meld.
 */
import type {
  DeclaredMeld, Flag, Situation, SituationWind, Tile, WinMode,
} from '../../scorer/types';
import { OPEN_MELD_KINDS } from '../../scorer/types';
import { compareTiles, isRedFive, normalizeRed, numberOf, suitOf } from '../../scorer/order';
import { doraFromIndicators } from '../../scorer/dora';

/** Which keyboard button, if any, is armed. `null` means "add a concealed tile". */
export type CallMode = 'chii' | 'pon' | 'kan' | 'closedKan' | 'dora' | 'uraDora';

export type RiichiChoice = 'none' | 'riichi' | 'dobleRiichi';

export interface HandState {
  /** Insertion order; the last entry is the winning tile. */
  concealed: Tile[];
  melds: DeclaredMeld[];
  /** What the player actually sees on the table; converted on the way out. */
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  mode: CallMode | null;
  /**
   * Independent of `mode`: when armed, the next five added -- on its own or
   * inside a call -- is the red one. A run is built from its lowest tile, so
   * this is the only way to put a red five anywhere but the start of a chii.
   */
  red: boolean;

  winMode: WinMode;
  roundWind: SituationWind;
  seatWind: SituationWind;
  riichi: RiichiChoice;
  ippatsu: boolean;
  chankan: boolean;
  rinshan: boolean;
  /** Resolves to haitei on tsumo, houtei on ron. */
  lastDraw: boolean;
  /** primeraRonda; the engine derives tenhou/chiihou/renhou from it. */
  firstRound: boolean;
}

export const initialHandState: HandState = {
  concealed: [], melds: [], doraIndicators: [], uraIndicators: [], mode: null, red: false,
  winMode: 'ron', roundWind: 'este', seatWind: 'este', riichi: 'none',
  ippatsu: false, chankan: false, rinshan: false, lastDraw: false, firstRound: false,
};

/** At most five dora indicators can ever be revealed (one plus four kan dora). */
export const MAX_DORA = 5;

const MELD_SIZE: Record<DeclaredMeld['kind'], number> = { chii: 3, pon: 3, kanA: 4, kanC: 4 };

const isKan = (meld: DeclaredMeld): boolean => meld.kind === 'kanA' || meld.kind === 'kanC';

/** Tiles physically held. Dora are *values*, not held tiles, so they don't count. */
export function heldTiles(state: HandState): Tile[] {
  return [...state.concealed, ...state.melds.flatMap((m) => m.tiles as Tile[])];
}

/** Copies of a tile's value already used, treating a red five as its plain twin. */
export function copiesUsed(state: HandState, tile: Tile): number {
  const base = normalizeRed(tile);
  return heldTiles(state).filter((t) => normalizeRed(t) === base).length;
}

/** How many red copies of a given red-five atom are in play (at most one exists). */
export function redsUsed(state: HandState, redTile: Tile): number {
  return heldTiles(state).filter((t) => t === redTile).length;
}

/**
 * Plain (non-red) copies of a tile in play.
 *
 * Fives are the interesting case: a suit has four, but only *three* of them are
 * plain. So three plain fives exhaust the supply, and any further five must be
 * the red one -- which is also why a kan of fives always contains it.
 */
export function plainUsed(state: HandState, tile: Tile): number {
  const base = normalizeRed(tile);
  return heldTiles(state).filter((t) => t === base).length;
}

/** How many plain copies of this tile exist at all: three for a five, four otherwise. */
export const plainSupply = (tile: Tile): number => (numberOf(tile) === 5 ? 3 : 4);

/** An open meld makes the hand open; a concealed kan does not. */
export function isHandOpen(state: HandState): boolean {
  return state.melds.some((m) => OPEN_MELD_KINDS.has(m.kind));
}

/** A standard hand is 14 tiles, plus one extra per kan. */
export function targetSize(state: HandState): number {
  return 14 + state.melds.filter(isKan).length;
}

export function currentSize(state: HandState): number {
  return heldTiles(state).length;
}

export function isComplete(state: HandState): boolean {
  return currentSize(state) === targetSize(state);
}

/** The winning tile: the last one acquired, and always a concealed one. */
export function winningTile(state: HandState): Tile | null {
  return state.concealed.at(-1) ?? null;
}

/** Is this tile a five of a numbered suit (red or not)? */
const isFive = (tile: Tile): boolean => numberOf(tile) === 5;

/** Replaces the first plain five in a meld with its red copy. No-op if one is already red. */
function reddenOne(tiles: Tile[]): Tile[] {
  if (tiles.some(isRedFive)) return tiles;
  const at = tiles.findIndex(isFive);
  if (at < 0) return tiles;
  return tiles.map((t, i) => (i === at ? (`${normalizeRed(t)}R` as Tile) : t));
}

/**
 * A four-tile set of fives uses every copy in the suit, and only three of those
 * are plain -- so the red one is necessarily part of it.
 */
const forcesRed = (kind: DeclaredMeld['kind'], tiles: readonly Tile[]): boolean =>
  (kind === 'kanA' || kind === 'kanC') && tiles.every(isFive);

/**
 * Builds the meld a keyboard press implies, from plain tiles.
 *
 * Redness is applied afterwards by `reddenOne`, driven by the red modifier --
 * that way a red five can land anywhere in a run, not just at its start.
 */
function meldFor(mode: CallMode, tile: Tile): DeclaredMeld | null {
  const plain = normalizeRed(tile);
  const copies = (n: number): Tile[] => Array<Tile>(n).fill(plain);

  /** Kans of fives are reddened here, since that is forced rather than chosen. */
  const kan = (kind: 'kanA' | 'kanC'): DeclaredMeld => {
    const tiles = copies(4);
    return { kind, tiles: (forcesRed(kind, tiles) ? reddenOne(tiles) : tiles) } as DeclaredMeld;
  };

  switch (mode) {
    case 'pon': return { kind: 'pon', tiles: copies(3) as [Tile, Tile, Tile] };
    case 'kan': return kan('kanA');
    case 'closedKan': return kan('kanC');
    case 'chii': {
      const n = numberOf(plain);
      if (n === null || n > 7) return null;
      const suit = plain[0];
      return {
        kind: 'chii',
        tiles: [plain, `${suit}${n + 1}` as Tile, `${suit}${n + 2}` as Tile],
      };
    }
    default: return null;
  }
}

/** The meld a press produces, with the red modifier applied. */
function meldForPress(state: HandState, tile: Tile): DeclaredMeld | null {
  const meld = state.mode && state.mode !== 'dora' && state.mode !== 'uraDora'
    ? meldFor(state.mode, tile) : null;
  if (!meld || !state.red) return meld;
  return { ...meld, tiles: reddenOne([...meld.tiles]) } as DeclaredMeld;
}

/** The concealed tile a press produces, with the red modifier applied. */
function tileForPress(state: HandState, tile: Tile): Tile {
  const plain = normalizeRed(tile);
  return state.red && isFive(plain) ? (`${plain}R` as Tile) : plain;
}

/**
 * Why a keyboard button is unavailable, or null if it can be pressed.
 * Returning the reason (rather than a bare boolean) lets the UI explain itself.
 */
export function disabledReason(state: HandState, tile: Tile): string | null {
  const mode = state.mode;

  if (mode === 'dora' || mode === 'uraDora') {
    const list = mode === 'dora' ? state.doraIndicators : state.uraIndicators;
    // Ura is enterable before the riichi is picked -- the tile flap comes first,
    // and validation catches the combination when the hand is scored.
    return list.length >= MAX_DORA ? `at most ${MAX_DORA} indicators` : null;
  }

  if (mode === null) {
    if (isComplete(state)) return 'the hand is already complete';
    if (state.red && !isFive(tile)) return 'the red modifier only applies to fives';
    const actual = tileForPress(state, tile);
    if (copiesUsed(state, actual) >= 4) return 'all four copies are already used';
    if (isRedFive(actual)) {
      return redsUsed(state, actual) >= 1 ? `the ${actual} is already used` : null;
    }
    if (plainUsed(state, actual) >= plainSupply(actual)) {
      return isFive(actual)
        ? 'all three plain fives are used — arm Red 5 for the last one'
        : 'all four copies are already used';
    }
    return null;
  }

  // A call mode.
  if (state.melds.length >= 4) return 'a hand holds at most four melds';

  const meld = meldForPress(state, tile);
  if (!meld) {
    if (mode === 'chii') {
      return suitOf(tile) === 'honor'
        ? 'honours cannot form a run'
        : 'a run cannot start above 7';
    }
    return 'not available';
  }

  if (state.red && !meld.tiles.some(isFive)) {
    return 'the red modifier only applies to melds containing a five';
  }

  // Every tile the call consumes must still be available: four copies of each
  // value exist, and at most one of those four is the red one.
  const needed = new Map<Tile, number>();
  const neededRed = new Map<Tile, number>();
  const neededPlain = new Map<Tile, number>();
  for (const t of meld.tiles) {
    const base = normalizeRed(t);
    needed.set(base, (needed.get(base) ?? 0) + 1);
    if (isRedFive(t)) neededRed.set(t, (neededRed.get(t) ?? 0) + 1);
    else neededPlain.set(base, (neededPlain.get(base) ?? 0) + 1);
  }
  for (const [base, count] of needed) {
    if (copiesUsed(state, base) + count > 4) return `not enough copies of ${base} left`;
  }
  for (const [redTile, count] of neededRed) {
    if (redsUsed(state, redTile) + count > 1) return `the ${redTile} is already used`;
  }
  for (const [base, count] of neededPlain) {
    if (plainUsed(state, base) + count > plainSupply(base)) {
      return isFive(base)
        ? `only three plain ${base} exist`
        : `not enough copies of ${base} left`;
    }
  }

  // The winning tile must come after the last call, so a call can never be the
  // move that completes the hand.
  const newSize = currentSize(state) + MELD_SIZE[meld.kind];
  const newTarget = targetSize(state) + (isKan(meld) ? 1 : 0);
  if (newSize >= newTarget) return 'a call cannot complete the hand';

  return null;
}

export const isDisabled = (state: HandState, tile: Tile): boolean =>
  disabledReason(state, tile) !== null;

// --- transitions ---

export function toggleMode(state: HandState, mode: CallMode): HandState {
  const next = state.mode === mode ? null : mode;
  // The red modifier is meaningless while marking dora indicators.
  const red = next === 'dora' || next === 'uraDora' ? false : state.red;
  return { ...state, mode: next, red };
}

/** Independent of the call modes: arms the next five to be the red one. */
export function toggleRed(state: HandState): HandState {
  return { ...state, red: !state.red };
}

/** Whether the red modifier can be armed at all right now. */
export function redAvailable(state: HandState): boolean {
  return state.mode !== 'dora' && state.mode !== 'uraDora';
}

export function pressTile(state: HandState, tile: Tile): HandState {
  if (isDisabled(state, tile)) return state;
  const mode = state.mode;

  if (mode === 'dora') return { ...state, doraIndicators: [...state.doraIndicators, tile] };
  if (mode === 'uraDora') return { ...state, uraIndicators: [...state.uraIndicators, tile] };
  if (mode === null) {
    return { ...state, concealed: [...state.concealed, tileForPress(state, tile)], red: false };
  }

  const meld = meldForPress(state, tile);
  if (!meld) return state;
  // Call modes disarm after use -- you almost always want to add tiles next.
  // Dora modes stay armed, since revealing several dora is routine.
  return reconcile({ ...state, melds: [...state.melds, meld], mode: null, red: false });
}

export const removeConcealed = (state: HandState, index: number): HandState =>
  ({ ...state, concealed: state.concealed.filter((_, i) => i !== index) });

export const removeMeld = (state: HandState, index: number): HandState =>
  reconcile({ ...state, melds: state.melds.filter((_, i) => i !== index) });

export const removeDora = (state: HandState, index: number, ura = false): HandState =>
  ura
    ? { ...state, uraIndicators: state.uraIndicators.filter((_, i) => i !== index) }
    : { ...state, doraIndicators: state.doraIndicators.filter((_, i) => i !== index) };

export const clearHand = (state: HandState): HandState =>
  ({ ...initialHandState, winMode: state.winMode, roundWind: state.roundWind, seatWind: state.seatWind });

/**
 * Display order: concealed tiles sorted, but the winning tile pulled out so the
 * player can see which one it is. Indices refer back to insertion order.
 */
export function concealedForDisplay(state: HandState): {
  sorted: { tile: Tile; index: number }[];
  winning: { tile: Tile; index: number } | null;
} {
  const last = state.concealed.length - 1;
  const entries = state.concealed.map((tile, index) => ({ tile, index }));
  const rest = entries.filter((e) => e.index !== last);
  // Canonical order, so the display matches how the engine reads the hand.
  rest.sort((a, b) => compareTiles(a.tile, b.tile));
  return {
    sorted: rest,
    winning: last >= 0 ? entries[last]! : null,
  };
}

/** True when the hand contains any kan, which rinshan requires. */
export function hasKan(state: HandState): boolean {
  return state.melds.some(isKan);
}

/**
 * Why a context option is unavailable, or null. Centralised so the panel and
 * `reconcile` can never disagree about what is legal.
 *
 * Several of these the *engine* does not enforce -- notably it will happily
 * score riichi on an open hand -- so they have to hold here.
 */
export function contextIssue(state: HandState, option:
  'riichi' | 'ippatsu' | 'chankan' | 'rinshan' | 'lastDraw' | 'firstRound' | 'uraDora',
): string | null {
  const open = isHandOpen(state);
  const riichiDeclared = state.riichi !== 'none';

  switch (option) {
    case 'riichi':
      if (open) return 'riichi needs a closed hand';
      if (state.firstRound) return 'incompatible with a first-round win';
      return null;
    case 'ippatsu':
      if (!riichiDeclared) return 'requires a riichi';
      if (state.firstRound) return 'incompatible with a first-round win';
      return null;
    case 'uraDora':
      return riichiDeclared ? null : 'ura dora requires a riichi';
    case 'chankan':
      if (state.winMode !== 'ron') return 'robbing a kan is always a ron';
      if (state.rinshan || state.lastDraw) return 'conflicts with another circumstance';
      return null;
    case 'rinshan':
      if (state.winMode !== 'tsumo') return 'winning off a kan draw is always a tsumo';
      if (state.chankan || state.lastDraw) return 'conflicts with another circumstance';
      if (!hasKan(state)) return 'the hand has no kan';
      return null;
    case 'lastDraw':
      return state.rinshan || state.chankan ? 'conflicts with another circumstance' : null;
    case 'firstRound':
      if (riichiDeclared) return 'incompatible with a riichi';
      if (state.melds.length > 0) return 'no calls can have been made';
      return null;
  }
}

/**
 * Clears options that the current hand has made impossible -- adding an open
 * meld retracts a riichi, switching to tsumo retracts chankan, and so on.
 *
 * Applied after every transition so the state can never drift into a shape the
 * panel would refuse to let you build directly.
 */
export function reconcile(state: HandState): HandState {
  let s = state;
  if (contextIssue(s, 'riichi') && s.riichi !== 'none') s = { ...s, riichi: 'none' };
  if (contextIssue(s, 'ippatsu') && s.ippatsu) s = { ...s, ippatsu: false };
  if (contextIssue(s, 'chankan') && s.chankan) s = { ...s, chankan: false };
  if (s.winMode !== 'tsumo' && s.rinshan) s = { ...s, rinshan: false };
  if (contextIssue(s, 'firstRound') && s.firstRound) s = { ...s, firstRound: false };
  // Ura indicators are deliberately kept even without a riichi: they are entered
  // on the tile flap, before the riichi is picked. validateQuery reports the
  // combination at score time.
  return s;
}

export function toFlags(state: HandState): Flag[] {
  const flags: Flag[] = [];
  if (state.riichi === 'riichi') flags.push('riichi');
  if (state.riichi === 'dobleRiichi') flags.push('dobleRiichi');
  if (state.ippatsu) flags.push('ippatsu');
  if (state.chankan) flags.push('chankan');
  if (state.rinshan) flags.push('rinshan');
  if (state.lastDraw) flags.push(state.winMode === 'tsumo' ? 'haitei' : 'houtei');
  if (state.firstRound) flags.push('primeraRonda');
  return flags;
}

export function toSituation(state: HandState): Situation {
  return {
    roundWind: state.roundWind,
    seatWind: state.seatWind,
    // Indicators are what the UI collects; the engine wants the dora themselves.
    dora: doraFromIndicators(state.doraIndicators),
    uraDora: doraFromIndicators(state.uraIndicators),
    flags: toFlags(state),
  };
}
