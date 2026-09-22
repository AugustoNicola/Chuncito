/**
 * A player's profile: the server's counts, and the arithmetic the page does on
 * them. Pure, so the rates and the chart data are tested without a browser.
 *
 * Four-player and sanma records are never mixed (a 1st of three is not a 1st
 * of four), so everything here is for one `players` at a time, and the server
 * is asked for one at a time.
 */
import { type Fetched, YAKU_CHOICES, fetchJson } from '../history/history';
import { isDora, yakuName } from '../hand/yakuNames';

export interface PlacedMatch {
  matchId: string; name: string; startedAt: string;
  placement: number; finalScore: number; umaPoints: number | null;
}

export interface BestHand {
  matchId: string; matchName: string; roundWind: string; roundNumber: number;
  level: string | null; han: number | null; fu: number | null;
  pointsWon: number | null; handTiles: string | null;
}

export interface PlayerStats {
  player: { id: string; displayName: string; slug: string };
  players: 3 | 4;
  matchesFour: number;
  matchesSanma: number;
  /** Oldest first: the placement line reads left to right. */
  matches: PlacedMatch[];
  /** How many 1sts, 2nds, ... -- one entry per seat. */
  placementCounts: number[];
  umaTotal: number;
  hands: number;
  wins: number;
  tsumoWins: number;
  dealIns: number;
  riichis: number;
  winMethods: { riichi: number; dama: number; open: number; unknown: number };
  bestHand: BestHand | null;
  yakus: { yaku: string; count: number }[];
  /** Wins grouped by level and base points, for the value histogram. */
  winValues: { level: string | null; basePoints: number | null; count: number }[];
}

export const fetchStats = async (slug: string, players: 3 | 4): Promise<Fetched<PlayerStats>> =>
  await fetchJson(`/players/${encodeURIComponent(slug)}/stats?players=${players}`) as Fetched<PlayerStats>;

/** "15%", or a dash when there is nothing to take a share of. */
export function percent(n: number, of: number): string {
  return of > 0 ? `${Math.round((100 * n) / of)}%` : '–';
}

/** Mean placement, 1 being best; null before any finished match. */
export function averagePlacement(counts: readonly number[]): number | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / total;
}

export interface Slice { key: string; label: string; value: number }

/** Riichi, dama, open -- and "not recorded" only if some typed-in win left it unknown. */
export function winMethodSlices(m: PlayerStats['winMethods']): Slice[] {
  const slices: Slice[] = [
    { key: 'riichi', label: 'Riichi', value: m.riichi },
    { key: 'dama', label: 'Closed, no riichi', value: m.dama },
    { key: 'open', label: 'Open', value: m.open },
  ];
  if (m.unknown > 0) slices.push({ key: 'unknown', label: 'Not recorded', value: m.unknown });
  return slices;
}

const PLACE = ['1st', '2nd', '3rd', '4th'];

export const placementSlices = (counts: readonly number[]): Slice[] =>
  counts.map((value, i) => ({ key: `p${i + 1}`, label: PLACE[i] ?? `${i + 1}th`, value }));

/** Yaku by how often they were won with, commonest first, as the server ordered them. */
export const yakuRows = (yakus: PlayerStats['yakus']) =>
  yakus.filter((y) => !isDora(y.yaku)).map((y) => ({ ...y, name: yakuName(y.yaku) }));

/**
 * Sanma has only 1m and 9m of manzu, so there is no manzu run and a sanshoku
 * doujun cannot be made: it is not "yet to come", and is left out.
 */
const IMPOSSIBLE_IN_SANMA = new Set(['sanshokuDoujun']);

/** Every yaku this player has still to win with, in this kind of match, by name. */
export function yakuNotYet(yakus: PlayerStats['yakus'], players: 3 | 4): { atom: string; name: string }[] {
  const won = new Set(yakus.map((y) => y.yaku));
  return YAKU_CHOICES.filter((y) => !won.has(y.atom)
    && !(players === 3 && IMPOSSIBLE_IN_SANMA.has(y.atom)));
}

export interface ValueBin {
  key: string;
  /** Short, for under a narrow bar. */
  label: string;
  /** Long, for the tooltip and screen readers. */
  title: string;
  /** The limit tier whose colour it wears (`levelTier`'s names). */
  tier: string;
  count: number;
}

const LIMIT_BINS: readonly { key: string; label: string; title: string; tier: string }[] = [
  { key: 'mangan', label: 'Man', title: 'Mangan', tier: 'mangan' },
  { key: 'haneman', label: 'Hane', title: 'Haneman', tier: 'haneman' },
  { key: 'baiman', label: 'Bai', title: 'Baiman', tier: 'baiman' },
  { key: 'sanbaiman', label: 'San', title: 'Sanbaiman', tier: 'sanbaiman' },
  { key: 'yakuman', label: 'Yaku', title: 'Yakuman (counted or not, and any multiple)', tier: 'yakuman' },
];
const LIMIT_OF: Record<string, string> = {
  mangan: 'mangan', haneman: 'haneman', baiman: 'baiman', sanbaiman: 'sanbaiman',
};

/** A below-mangan hand's value as a non-dealer ron: base x 4, rounded up to 100. */
export const ronValue = (base: number): number => Math.ceil((base * 4) / 100) * 100;

/**
 * The histogram's bars, always all twelve so two profiles compare at a glance:
 * below mangan in 1,000-point bins (1,000-1,900 up to 7,000-7,700), then one
 * bar per limit. Each win is priced as a **non-dealer ron** -- the same hand
 * pays more to a dealer or with honba, and that is the table's business, not
 * the hand's. A win with no base recorded is left out.
 */
export function valueBins(values: PlayerStats['winValues']): ValueBin[] {
  const bins: ValueBin[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      key: `k${i + 1}`, label: `${i + 1}k`,
      title: `${(i + 1).toLocaleString()},000–${i === 6 ? '7,700' : `${i + 1},900`}`,
      tier: 'none', count: 0,
    })),
    ...LIMIT_BINS.map((b) => ({ ...b, count: 0 })),
  ];
  const at = (key: string) => bins.find((b) => b.key === key)!;
  for (const v of values) {
    const level = v.level ?? 'sinNombre';
    if (level === 'sinNombre') {
      if (v.basePoints === null) continue;
      const k = Math.min(7, Math.max(1, Math.floor(ronValue(v.basePoints) / 1000)));
      at(`k${k}`).count += v.count;
    } else {
      // Kazoe and every multiple of yakuman pay at least a yakuman.
      at(LIMIT_OF[level] ?? 'yakuman').count += v.count;
    }
  }
  return bins;
}
