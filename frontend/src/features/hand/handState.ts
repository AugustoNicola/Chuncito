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
import { compareTiles, normalizeRed, numberOf, suitOf } from '../../scorer/order';

/** Which keyboard button, if any, is armed. `null` means "add a concealed tile". */
export type CallMode = 'chii' | 'pon' | 'kan' | 'closedKan' | 'dora' | 'uraDora';

export type RiichiChoice = 'none' | 'riichi' | 'dobleRiichi';

export interface HandState {
  /** Insertion order; the last entry is the winning tile. */
  concealed: Tile[];
  melds: DeclaredMeld[];
  dora: Tile[];
  uraDora: Tile[];
  mode: CallMode | null;

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
  concealed: [], melds: [], dora: [], uraDora: [], mode: null,
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

function meldFor(mode: CallMode, tile: Tile): DeclaredMeld | null {
  switch (mode) {
    case 'pon': return { kind: 'pon', tiles: [tile, tile, tile] };
    case 'kan': return { kind: 'kanA', tiles: [tile, tile, tile, tile] };
    case 'closedKan': return { kind: 'kanC', tiles: [tile, tile, tile, tile] };
    case 'chii': {
      const n = numberOf(tile);
      if (n === null || n > 7) return null;
      const suit = tile[0];
      return { kind: 'chii', tiles: [tile, `${suit}${n + 1}` as Tile, `${suit}${n + 2}` as Tile] };
    }
    default: return null;
  }
}

/**
 * Why a keyboard button is unavailable, or null if it can be pressed.
 * Returning the reason (rather than a bare boolean) lets the UI explain itself.
 */
export function disabledReason(state: HandState, tile: Tile): string | null {
  const mode = state.mode;

  if (mode === 'dora' || mode === 'uraDora') {
    const list = mode === 'dora' ? state.dora : state.uraDora;
    return list.length >= MAX_DORA ? `at most ${MAX_DORA} dora` : null;
  }

  if (mode === null) {
    if (isComplete(state)) return 'the hand is already complete';
    return copiesUsed(state, tile) >= 4 ? 'all four copies are already used' : null;
  }

  // A call mode.
  if (state.melds.length >= 4) return 'a hand holds at most four melds';

  const meld = meldFor(mode, tile);
  if (!meld) {
    if (mode === 'chii') {
      return suitOf(tile) === 'honor'
        ? 'honours cannot form a run'
        : 'a run cannot start above 7';
    }
    return 'not available';
  }

  // Every tile the call consumes must still be available.
  const needed = new Map<Tile, number>();
  for (const t of meld.tiles) {
    const base = normalizeRed(t);
    needed.set(base, (needed.get(base) ?? 0) + 1);
  }
  for (const [base, count] of needed) {
    if (copiesUsed(state, base) + count > 4) {
      return `not enough copies of ${base} left`;
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
  return { ...state, mode: state.mode === mode ? null : mode };
}

export function pressTile(state: HandState, tile: Tile): HandState {
  if (isDisabled(state, tile)) return state;
  const mode = state.mode;

  if (mode === 'dora') return { ...state, dora: [...state.dora, tile] };
  if (mode === 'uraDora') return { ...state, uraDora: [...state.uraDora, tile] };
  if (mode === null) return { ...state, concealed: [...state.concealed, tile] };

  const meld = meldFor(mode, tile);
  if (!meld) return state;
  // Call modes disarm after use -- you almost always want to add tiles next.
  // Dora modes stay armed, since revealing several dora is routine.
  return { ...state, melds: [...state.melds, meld], mode: null };
}

export const removeConcealed = (state: HandState, index: number): HandState =>
  ({ ...state, concealed: state.concealed.filter((_, i) => i !== index) });

export const removeMeld = (state: HandState, index: number): HandState =>
  ({ ...state, melds: state.melds.filter((_, i) => i !== index) });

export const removeDora = (state: HandState, index: number, ura = false): HandState =>
  ura
    ? { ...state, uraDora: state.uraDora.filter((_, i) => i !== index) }
    : { ...state, dora: state.dora.filter((_, i) => i !== index) };

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
    dora: state.dora,
    uraDora: state.uraDora,
    flags: toFlags(state),
  };
}
