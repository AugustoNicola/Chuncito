/**
 * Match history: the filters, and fetching from the server.
 *
 * History is the group's, not the phone's, so it comes from the server; a
 * phone offline or without the PIN says so rather than showing only what it
 * happens to hold.
 *
 * The filters live in the URL (`/matches?player=…&level=1`), so Back from a
 * match lands on the same list, and a filtered list can be shared. The URL's
 * names are short; the API's are spelled out (`min_level`), and `apiPath` is
 * the only place that knows both.
 */
import { YAKU_NAMES, isDora } from '../hand/yakuNames';
import { type MatchRows, fromRows } from '../match/rows';
import type { MatchState } from '../match/matchState';
import { type ServerMatch, fetchTransport } from '../match/syncClient';
import { nameOf } from '../players/players';

export interface HistoryFilters {
  /** The match's name or anyone seated, guests included. */
  text: string;
  /** Registered players; every one of them must have sat. */
  playerIds: string[];
  /** A rank in `LEVELS`: some hand reached at least this. */
  minLevel: number | null;
  /** An engine atom: some winner's hand had it. */
  yaku: string | null;
  /** 4, or 3 for sanma. */
  players: 3 | 4 | null;
}

export const NO_FILTERS: HistoryFilters = {
  text: '', playerIds: [], minLevel: null, yaku: null, players: null,
};

/**
 * The server's `LEVEL_RANKS`, as the choices worth offering. Kazoe sits below
 * yakuman there too: it is counted, not the real thing.
 */
export const LEVELS: readonly { rank: number; label: string }[] = [
  { rank: 1, label: 'Mangan or better' },
  { rank: 2, label: 'Haneman or better' },
  { rank: 3, label: 'Baiman or better' },
  { rank: 4, label: 'Sanbaiman or better' },
  { rank: 5, label: 'Kazoe yakuman or better' },
  { rank: 6, label: 'Yakuman' },
];

/** Every yaku worth filtering by, alphabetically by display name. */
export const YAKU_CHOICES: readonly { atom: string; name: string }[] =
  Object.entries(YAKU_NAMES)
    .filter(([atom]) => !isDora(atom))
    .map(([atom, name]) => ({ atom, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const rankOf = (raw: string | null): number | null => {
  const n = raw === null ? NaN : Number(raw);
  return LEVELS.some((l) => l.rank === n) ? n : null;
};

/** Whatever is in the URL, made safe: unknown values are dropped, not guessed at. */
export function filtersFrom(params: URLSearchParams): HistoryFilters {
  const players = params.get('players');
  const yaku = params.get('yaku');
  return {
    text: params.get('q') ?? '',
    playerIds: [...new Set(params.getAll('player'))],
    minLevel: rankOf(params.get('level')),
    yaku: yaku && YAKU_CHOICES.some((y) => y.atom === yaku) ? yaku : null,
    players: players === '3' ? 3 : players === '4' ? 4 : null,
  };
}

/** The URL's half: only what is set, so an unfiltered list is plain `/matches`. */
export function paramsOf(f: HistoryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.text.trim()) p.set('q', f.text.trim());
  for (const id of f.playerIds) p.append('player', id);
  if (f.minLevel !== null) p.set('level', String(f.minLevel));
  if (f.yaku) p.set('yaku', f.yaku);
  if (f.players) p.set('players', String(f.players));
  return p;
}

export const isFiltered = (f: HistoryFilters): boolean => paramsOf(f).toString() !== '';

/** The API's half. History is finished matches; the home screen has the rest. */
export function apiPath(f: HistoryFilters): string {
  const p = new URLSearchParams({ status: 'finished' });
  if (f.text.trim()) p.set('q', f.text.trim());
  for (const id of f.playerIds) p.append('player', id);
  if (f.minLevel !== null) p.set('min_level', String(f.minLevel));
  if (f.yaku) p.set('yaku', f.yaku);
  if (f.players) p.set('players', String(f.players));
  return `/matches?${p}`;
}

export type Fetched<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'locked' }
  | { kind: 'missing' }
  | { kind: 'unreachable' };

/** A GET, sorted into what the screens distinguish. */
export async function fetchJson(path: string): Promise<Fetched<unknown>> {
  try {
    const r = await fetchTransport('GET', path);
    if (r.status === 200) return { kind: 'ok', value: r.body };
    if (r.status === 401) return { kind: 'locked' };
    if (r.status === 404) return { kind: 'missing' };
    return { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  }
}

export const fetchHistory = async (f: HistoryFilters): Promise<Fetched<ServerMatch[]>> =>
  await fetchJson(apiPath(f)) as Fetched<ServerMatch[]>;

/** One match, rebuilt from its rows exactly as a carried-on match is. */
export async function fetchMatch(id: string): Promise<Fetched<MatchState>> {
  const got = await fetchJson(`/matches/${encodeURIComponent(id)}`);
  if (got.kind !== 'ok') return got;
  const body = got.value as { rows: MatchRows; players: { id: string; displayName: string }[] };
  const names = new Map(body.players.map((p) => [p.id, p.displayName]));
  return { kind: 'ok', value: fromRows(body.rows, (pid) => names.get(pid) ?? nameOf(pid) ?? pid) };
}
