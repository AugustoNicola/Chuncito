/**
 * Input validation.
 *
 * The engine does none: it happily scores a bogus wind, an unknown flag, or
 * fourteen identical tiles. Worse, a genuinely malformed hand usually just
 * *fails*, which is indistinguishable from "no yaku". So we check first and
 * report precisely, rather than letting the user see "not a winning hand".
 */
import type { DeclaredMeld, Flag, ScoreQuery, Situation, Tile } from './types';
import { ALL_FLAGS, ALL_RULES, RIICHI_FLAGS, SITUATION_WINDS } from './types';
import { compareTiles, isRedFive, normalizeRed, numberOf, suitOf } from './order';

export interface ValidationIssue { code: string; message: string }

/** Pairs that cannot both hold, from flagsIncompatibles/2 (order-insensitive). */
const INCOMPATIBLE_FLAGS: ReadonlyArray<readonly [Flag, Flag]> = [
  ['riichi', 'dobleRiichi'],
  ['houtei', 'haitei'],
  ['houtei', 'rinshan'],
  ['chankan', 'rinshan'],
  ['haitei', 'rinshan'],
  ['chankan', 'haitei'],
  ['primeraRonda', 'riichi'],
  ['primeraRonda', 'dobleRiichi'],
  ['primeraRonda', 'ippatsu'],
  ['riichiAbierto', 'riichi'],
  ['riichiAbierto', 'dobleRiichi'],
  ['riichiAbierto', 'primeraRonda'],
];

const isRiichi = (flags: readonly Flag[]): boolean =>
  flags.some((f) => RIICHI_FLAGS.includes(f));

function meldTiles(melds: readonly DeclaredMeld[]): Tile[] {
  return melds.flatMap((m) => m.tiles as Tile[]);
}

function validateMeldShape(meld: DeclaredMeld, issues: ValidationIssue[]): void {
  const tiles = [...meld.tiles].sort(compareTiles);
  const label = `${meld.kind}(${meld.tiles.join(',')})`;

  if (meld.kind === 'chii') {
    const suits = new Set(tiles.map(suitOf));
    if (suits.has('honor')) {
      issues.push({ code: 'chii.honor', message: `${label}: honours cannot form a run` });
      return;
    }
    if (suits.size !== 1) {
      issues.push({ code: 'chii.mixedSuit', message: `${label}: a run needs one suit` });
      return;
    }
    const ns = tiles.map((t) => numberOf(t)!);
    if (ns[1] !== ns[0]! + 1 || ns[2] !== ns[1]! + 1) {
      issues.push({ code: 'chii.notConsecutive', message: `${label}: tiles are not consecutive` });
    }
    return;
  }

  // pon / kanA / kanC: every tile the same value, ignoring redness.
  const base = normalizeRed(tiles[0]!);
  if (!tiles.every((t) => normalizeRed(t) === base)) {
    issues.push({ code: 'set.mixed', message: `${label}: all tiles must be the same` });
  }
}

export function validateSituation(s: Situation, issues: ValidationIssue[]): void {
  for (const [field, wind] of [['roundWind', s.roundWind], ['seatWind', s.seatWind]] as const) {
    if (!SITUATION_WINDS.includes(wind)) {
      issues.push({ code: `wind.unknown`, message: `${field}: ${wind} is not a wind atom` });
    }
  }
  for (const flag of s.flags) {
    if (!ALL_FLAGS.includes(flag)) {
      issues.push({ code: 'flag.unknown', message: `unknown flag ${flag}` });
    }
  }
  for (const [a, b] of INCOMPATIBLE_FLAGS) {
    if (s.flags.includes(a) && s.flags.includes(b)) {
      issues.push({ code: 'flag.incompatible', message: `${a} and ${b} cannot both apply` });
    }
  }
  if (s.flags.includes('ippatsu') && !isRiichi(s.flags)) {
    issues.push({ code: 'flag.ippatsuWithoutRiichi', message: 'ippatsu requires a riichi' });
  }
  if (s.uraDora.length > 0 && !isRiichi(s.flags)) {
    issues.push({ code: 'uraDora.withoutRiichi', message: 'ura dora requires a riichi' });
  }
}

export function validateQuery(q: ScoreQuery): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { hand, winningTile, mode, situation } = q;

  if (mode !== 'ron' && mode !== 'tsumo') {
    issues.push({ code: 'mode.unknown', message: `${mode} is not ron or tsumo` });
  }

  // An unknown rule makes the engine fail, which would read as "no yaku".
  for (const rule of q.rules ?? []) {
    if (!ALL_RULES.includes(rule)) issues.push({ code: 'rule.unknown', message: `unknown rule ${rule}` });
  }

  for (const meld of hand.melds) validateMeldShape(meld, issues);

  const all = [...hand.concealed, ...meldTiles(hand.melds)];

  // Four copies of each value exist, and a red five is one of those four --
  // so count by normalised value, then cap reds separately.
  const byValue = new Map<Tile, number>();
  const redsBySuit = new Map<string, number>();
  for (const tile of all) {
    const base = normalizeRed(tile);
    byValue.set(base, (byValue.get(base) ?? 0) + 1);
    if (isRedFive(tile)) redsBySuit.set(tile, (redsBySuit.get(tile) ?? 0) + 1);
  }
  for (const [tile, n] of byValue) {
    if (n > 4) issues.push({ code: 'tile.tooMany', message: `${n} copies of ${tile}; only 4 exist` });
  }
  for (const [tile, n] of redsBySuit) {
    if (n > 1) issues.push({ code: 'tile.tooManyRed', message: `${n} copies of ${tile}; only 1 exists` });
  }

  // A standard hand is 14 tiles; each kan contributes a fourth tile on top.
  const kans = hand.melds.filter((m) => m.kind === 'kanA' || m.kind === 'kanC').length;
  const expected = 14 + kans;
  if (all.length !== expected) {
    issues.push({
      code: 'hand.size',
      message: `hand has ${all.length} tiles, expected ${expected}` +
        (kans ? ` (14 + ${kans} kan)` : ''),
    });
  }

  if (hand.melds.length > 4) {
    issues.push({ code: 'hand.tooManyMelds', message: `${hand.melds.length} melds; at most 4` });
  }

  // The winning tile is the last one acquired, so it lives in the concealed
  // part -- you cannot call and win on the same tile.
  if (!hand.concealed.includes(winningTile)) {
    issues.push({
      code: 'winningTile.absent',
      message: `winning tile ${winningTile} is not among the concealed tiles`,
    });
  }

  validateSituation(situation, issues);
  return issues;
}

export function assertValidQuery(q: ScoreQuery): void {
  const issues = validateQuery(q);
  if (issues.length > 0) {
    throw new Error(`invalid score query:\n  ${issues.map((i) => i.message).join('\n  ')}`);
  }
}
