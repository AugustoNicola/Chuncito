/**
 * The group's players: created on purpose, on the Players screen, and chosen
 * from at setup.
 *
 * Creating a player needs the server -- it is rare and deliberate, and it is
 * what keeps a typo at the table from inventing a person. The list is cached
 * here so setting up a match works offline with everyone already known. A
 * visitor who is not a player sits as a guest: a name on that one match only.
 *
 * Sameness is the name ignoring case and accents -- "ana", "Ana" and "Aná"
 * are one person -- the same test the server applies (`slugify` in
 * `backend/app/store.py`), which refuses a second player by the same name.
 */
export interface Player {
  id: string;
  displayName: string;
  /**
   * MAKApoints, in points (shown in thousands), over ranked finished matches,
   * and how many. From the server's list; absent in a cache written before.
   */
  mpPoints?: number;
  mpMatches?: number;
}

const CACHE_KEY = 'chuncito.players.v2';
/** When each player last sat at a match on this phone, for ordering the history filter. */
const RECENT_KEY = 'chuncito.recent';
/** Keys from earlier versions, which kept names rather than players. */
const OLD_KEYS = ['chuncito.names', 'chuncito.players'];

/** The server's `slugify`, so both sides agree on who is who. */
export function slugOf(name: string): string {
  const plain = name.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A cache that cannot be written is refetched next time.
  }
}

/** Everyone, as of the last time the server was asked. */
export function cachedPlayers(): Player[] {
  const list = readJson<unknown>(CACHE_KEY, []);
  return Array.isArray(list)
    ? list.filter((p): p is Player => typeof p?.id === 'string' && typeof p?.displayName === 'string')
    : [];
}

export function setCachedPlayers(list: readonly Player[]): void {
  writeJson(CACHE_KEY, [...list].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  // The old name lists would only mislead now; players come from the server.
  try { for (const key of OLD_KEYS) localStorage.removeItem(key); } catch { /* ignore */ }
}

export const nameOf = (id: string): string | undefined =>
  cachedPlayers().find((p) => p.id === id)?.displayName;

/**
 * Alphabetical, ignoring case and accents (so "Álvaro" sits with the A's),
 * which is how a name is looked for in a list of the whole group.
 */
export function byName(list: readonly Player[]): Player[] {
  return [...list].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

/**
 * The ranking: MAKApoints, highest first, each with its rank. Only players
 * with a ranked match have one; the rest follow alphabetically, unranked.
 */
export function byMakapoints(list: readonly Player[]): { player: Player; rank: number | null }[] {
  const ranked = list.filter((p) => (p.mpMatches ?? 0) > 0)
    .sort((a, b) => (b.mpPoints ?? 0) - (a.mpPoints ?? 0)
      || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  const rest = byName(list.filter((p) => (p.mpMatches ?? 0) === 0));
  return [
    ...ranked.map((player, i) => ({ player, rank: i + 1 })),
    ...rest.map((player) => ({ player, rank: null })),
  ];
}

/** Recently seated first, then alphabetical. */
export function byRecent(list: readonly Player[]): Player[] {
  const recent = readJson<Record<string, string>>(RECENT_KEY, {});
  return [...list].sort((a, b) =>
    (recent[b.id] ?? '').localeCompare(recent[a.id] ?? '')
    || a.displayName.localeCompare(b.displayName));
}

export function markSeated(ids: readonly string[], now = new Date()): void {
  const recent = readJson<Record<string, string>>(RECENT_KEY, {});
  for (const id of ids) recent[id] = now.toISOString();
  writeJson(RECENT_KEY, recent);
}

/** Players whose name contains what was typed, ignoring case and accents. */
export function search(list: readonly Player[], query: string): Player[] {
  const q = slugOf(query);
  if (!query.trim()) return [...list];
  return list.filter((p) => slugOf(p.displayName).includes(q));
}

export const findByName = (list: readonly Player[], name: string): Player | undefined =>
  list.find((p) => slugOf(p.displayName) === slugOf(name));
