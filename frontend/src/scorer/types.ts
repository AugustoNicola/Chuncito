/**
 * TypeScript mirror of the Prolog scorer's term vocabulary.
 * Authority: docs/SCORER_CONTRACT.md. Every name here matches a Prolog atom
 * exactly, including case — `m5R` and `wh` are spelled as the engine spells them.
 */

export type ManTile = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm5R' | 'm6' | 'm7' | 'm8' | 'm9';
export type PinTile = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p5R' | 'p6' | 'p7' | 'p8' | 'p9';
export type SouTile = 's1' | 's2' | 's3' | 's4' | 's5' | 's5R' | 's6' | 's7' | 's8' | 's9';
/** Winds e,s,w,n then dragons r(chun) g(hatsu) wh(haku). NB: `s` is South, not souzu. */
export type HonorTile = 'e' | 's' | 'w' | 'n' | 'r' | 'g' | 'wh';
export type Tile = ManTile | PinTile | SouTile | HonorTile;

export type Suit = 'man' | 'pin' | 'sou' | 'honor';

/**
 * Melds that must arrive pre-formed inside `Llamadas`: the three genuine calls
 * plus the concealed kan, which cannot be inferred from loose tiles either.
 * Concealed runs/triplets (escC/triC) are NOT here — the engine infers those.
 */
export type DeclaredMeldKind = 'chii' | 'pon' | 'kanA' | 'kanC';

export type DeclaredMeld =
  | { kind: 'chii'; tiles: [Tile, Tile, Tile] }
  | { kind: 'pon'; tiles: [Tile, Tile, Tile] }
  | { kind: 'kanA'; tiles: [Tile, Tile, Tile, Tile] }
  | { kind: 'kanC'; tiles: [Tile, Tile, Tile, Tile] };

export const OPEN_MELD_KINDS: ReadonlySet<DeclaredMeldKind> = new Set(['chii', 'pon', 'kanA']);

/** Situation winds are Spanish atoms, distinct from the wind *tiles*. */
export type SituationWind = 'este' | 'sur' | 'oeste' | 'norte';

export const SITUATION_WINDS: readonly SituationWind[] = ['este', 'sur', 'oeste', 'norte'];

/** Maps a wind tile to its situacion/5 atom (vientoCorrespondiente/2 upstream). */
export const WIND_TILE_TO_SITUATION: Readonly<Record<'e' | 's' | 'w' | 'n', SituationWind>> = {
  e: 'este', s: 'sur', w: 'oeste', n: 'norte',
};

export type WinMode = 'ron' | 'tsumo';

export type Flag =
  | 'riichi' | 'dobleRiichi' | 'ippatsu' | 'houtei'
  | 'haitei' | 'rinshan' | 'chankan' | 'primeraRonda';

export const ALL_FLAGS: readonly Flag[] = [
  'riichi', 'dobleRiichi', 'ippatsu', 'houtei', 'haitei', 'rinshan', 'chankan', 'primeraRonda',
];

export interface Hand {
  /** Concealed tiles including the winning tile, any order. */
  concealed: Tile[];
  /** Pre-formed melds (calls + ankan). */
  melds: DeclaredMeld[];
}

export interface Situation {
  roundWind: SituationWind;
  /** `este` implies the winner is dealer. */
  seatWind: SituationWind;
  /** ACTUAL dora tiles, not indicators. Duplicates are meaningful. */
  dora: Tile[];
  /** Ura dora tiles; only legal alongside a riichi. */
  uraDora: Tile[];
  flags: Flag[];
}

export interface ScoreQuery {
  hand: Hand;
  winningTile: Tile;
  mode: WinMode;
  situation: Situation;
}

export type Payment =
  | { kind: 'ron'; total: number }
  | { kind: 'tsumoDealer'; each: number }
  | { kind: 'tsumo'; nonDealer: number; dealer: number };

export interface YakuHan { yaku: string; han: number }

/**
 * Known levels, plus an open tail: the engine generates '4xYakuman', '5xYakuman',
 * ... for 4+ simultaneous yakuman, so this is deliberately not a closed union.
 */
export type KnownLevel =
  | 'sinNombre' | 'mangan' | 'haneman' | 'baiman' | 'sanbaiman'
  | 'kazoeYakuman' | 'yakuman' | 'dobleYakuman' | 'tripleYakuman';
export type Level = KnownLevel | (string & {});

export interface ScoreResult {
  yakus: YakuHan[];
  han: number;
  fu: number;
  level: Level;
  payment: Payment;
}

/**
 * The three pseudo-yaku the engine appends last; rendered apart from real yaku.
 * `nukiDora` is the client's own, added for sanma kita (see `nukidora.ts`).
 */
export const PSEUDO_YAKU: ReadonlySet<string> =
  new Set(['dora', 'akaDora', 'uraDora', 'nukiDora']);

/**
 * The engine is semidet: it *fails* for a non-winning or yaku-less hand rather
 * than raising. That failure is a normal outcome, never an exception.
 */
export type ScoreOutcome =
  | { ok: true; result: ScoreResult }
  | { ok: false; reason: 'noWinningHand' };
