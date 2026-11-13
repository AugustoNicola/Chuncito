/**
 * Tiktok Mahjong's yaku wall: the group's own variant.
 *
 * Beside the dead wall's dora indicators there is a second wall of five yaku,
 * with five ura yaku under them. They are revealed when the tile indicators
 * are: the first as the hand starts, one more for every kan. A winning hand
 * that has a revealed yaku gets 2 han more for it; an ura yaku counts the
 * same way, but only for a winner who declared riichi -- as ura dora do.
 *
 * Nobody draws the yaku at the table, so the app does: ten different yaku,
 * no yakuman, the common ones likelier (`WALL_WEIGHTS`), and in sanma none
 * that cannot be made there (`SANMA_IMPOSSIBLE`), drawn afresh for every hand. The wall lives in the match state for the hand in
 * progress, and each recorded hand keeps what was revealed of it -- the dora
 * yaku and the ura yaku beneath them -- never the ones still face down.
 *
 * Pure, with the randomness passed in, so the reducer stays testable.
 */
import { type Flag, RIICHI_FLAGS } from '../../scorer/types';

/** As many as the dora indicators: the first, and one per kan up to four. */
export const WALL_SIZE = 5;

/** What a revealed yaku adds to a hand that has it. */
export const YAKU_DORA_HAN = 2;

export interface YakuWall {
  /** The five dora yaku, in the order they are revealed. */
  dora: readonly string[];
  /** The ura yaku, one under each dora yaku; seen only once the hand is won. */
  ura: readonly string[];
  /** How many of `dora` are face up, 1 to `WALL_SIZE`. */
  revealed: number;
}

export type Rng = () => number;

/**
 * What the wall is drawn from, and how likely each yaku is: every yaku but
 * the yakuman, which almost never come up and so made a dead slot on the
 * wall. The common ones are drawn more often, so a revealed yaku is one a
 * hand can actually go for. Draws are without replacement, so the ten on a
 * wall are still all different. Riichi first: a test relies on it.
 */
export const WALL_WEIGHTS: Readonly<Record<string, number>> = {
  // Common: in a good share of winning hands.
  riichi: 3, menzenTsumo: 3, pinfu: 3, tanyao: 3,
  haku: 3, hatsu: 3, chun: 3, bakazehai: 3, jikazehai: 3,
  // Now and then.
  ippatsu: 2, iipeikou: 2, chiitoitsu: 2, toitoi: 2, honitsu: 2,
  ittsuu: 2, sanshokuDoujun: 2, chanta: 2,
  // Rare, but not out of reach.
  dobleRiichi: 1, riichiAbierto: 1, haitei: 1, houtei: 1, rinshan: 1, chankan: 1,
  ryanpeikou: 1, junchan: 1, sanAnkou: 1, sanKantsu: 1, sanshokuDoukou: 1,
  shousangen: 1, honroutou: 1, chinitsu: 1,
};

/**
 * Yaku a three-player set cannot make: sanshoku doujun needs a run in every
 * suit, and 2m–8m are not in the set. (Sanshoku doukou can still be 111 or
 * 999 in all three; ittsuu, chinitsu and the rest go in pinzu or souzu.) A
 * dora yaku nobody can have would only be a dead slot on the wall.
 */
export const SANMA_IMPOSSIBLE: ReadonlySet<string> = new Set(['sanshokuDoujun']);

/** One yaku from what is left, by weight, taken out of it. */
function drawOne(left: Map<string, number>, rng: Rng): string {
  const total = [...left.values()].reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let pick: string | undefined;
  for (const [yaku, weight] of left) {
    pick = yaku;
    if (r < weight) break;
    r -= weight;
  }
  left.delete(pick!);
  return pick!;
}

/**
 * A fresh wall with its first yaku face up. `kept` puts back what a hand row
 * recorded -- the face-up yaku and the ura under them, which undo has to
 * restore exactly -- and only the face-down rest is drawn anew.
 */
export function drawWall(rng: Rng = Math.random,
                         kept?: { dora: readonly string[]; ura: readonly string[] },
                         sanma = false): YakuWall {
  const dora = [...(kept?.dora ?? [])].slice(0, WALL_SIZE);
  const ura = [...(kept?.ura ?? [])].slice(0, dora.length);
  const used = new Set([...dora, ...ura, ...(sanma ? SANMA_IMPOSSIBLE : [])]);
  const left = new Map(Object.entries(WALL_WEIGHTS).filter(([y]) => !used.has(y)));
  while (ura.length < dora.length) ura.push(drawOne(left, rng));
  const revealed = Math.max(1, dora.length);
  while (dora.length < WALL_SIZE) dora.push(drawOne(left, rng));
  while (ura.length < WALL_SIZE) ura.push(drawOne(left, rng));
  return { dora, ura, revealed };
}

/** A kan: one more yaku face up. */
export const revealNext = (wall: YakuWall): YakuWall =>
  ({ ...wall, revealed: Math.min(WALL_SIZE, wall.revealed + 1) });

/** Takes back a reveal tapped by mistake. The first one is always up. */
export const hideLast = (wall: YakuWall): YakuWall =>
  ({ ...wall, revealed: Math.max(1, wall.revealed - 1) });

/** The face-up yaku, and the ura yaku under them: what a hand row records. */
export const revealedOf = (wall: YakuWall): { dora: string[]; ura: string[] } => ({
  dora: wall.dora.slice(0, wall.revealed),
  ura: wall.ura.slice(0, wall.revealed),
});

/** The yaku wall as it bears on one winner: the ura only count after a riichi. */
export interface YakuDora {
  dora: readonly string[];
  ura: readonly string[];
}

export type YakuDoraKind = 'dora' | 'ura';

/** Whether a yaku in a hand is worth the bonus, and as which. */
export function yakuDoraKind(yaku: string, wall: YakuDora | null, riichi: boolean): YakuDoraKind | null {
  if (!wall) return null;
  if (wall.dora.includes(yaku)) return 'dora';
  if (riichi && wall.ura.includes(yaku)) return 'ura';
  return null;
}

/** A recorded hand's wall, or null outside Tiktok. */
export const wallOfRow = (row: { yakuDora: readonly string[]; yakuUra: readonly string[] }): YakuDora | null =>
  (row.yakuDora.length > 0 ? { dora: row.yakuDora, ura: row.yakuUra } : null);

/** Whether a recorded win was scored after a riichi, so its ura yaku counted. */
export const wonAfterRiichi = (win: { situationFlags: readonly string[] | null }): boolean =>
  (win.situationFlags ?? []).some((f) => RIICHI_FLAGS.includes(f as Flag));
