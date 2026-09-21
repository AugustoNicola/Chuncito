/**
 * Local mirror of the match in progress.
 *
 * This is crash safety, not offline-first: the phone dies, the tab is closed,
 * the browser reclaims the page mid-hanchan. It exists so that reopening the app
 * puts you back at the table rather than at hand one.
 *
 * IndexedDB rather than localStorage because it is asynchronous and survives
 * being written to on every state change without blocking the main thread --
 * which matters here, since every tap writes.
 *
 * Everything degrades to a no-op if storage is unavailable (private windows,
 * blocked site data). Losing the mirror must never break the tracker: the
 * authority is the in-memory state, and from Phase 3 the server.
 */
import type { MatchState } from './matchState';

const DB_NAME = 'chuncito';
const DB_VERSION = 1;
const STORE = 'matches';
const CURRENT = 'current';

/** Names typed at setup, so repeat players are one tap next time. */
const NAMES_KEY = 'chuncito.names';
const MAX_REMEMBERED = 12;

let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
  return (dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * The state is structured-cloneable by construction -- plain objects, arrays,
 * numbers and strings -- so it is stored as-is rather than serialised.
 */
export const saveMatch = (state: MatchState): Promise<unknown> =>
  withStore('readwrite', (store) => store.put(state, CURRENT));

export const loadMatch = (): Promise<MatchState | null> =>
  withStore<MatchState>('readonly', (store) => store.get(CURRENT) as IDBRequest<MatchState>);

export const clearMatch = (): Promise<unknown> =>
  withStore('readwrite', (store) => store.delete(CURRENT));

/**
 * Finished matches, kept locally until Phase 3 gives them somewhere to go.
 *
 * Keyed by start time so the list is chronological, and so replaying a save
 * cannot collide with an earlier one.
 */
export const archiveMatch = (state: MatchState): Promise<unknown> =>
  withStore('readwrite', (store) => store.put(state, `done:${state.startedAt}`));

export async function listArchived(): Promise<MatchState[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => {
        const all = (request.result as MatchState[]).filter((m) => m?.status === 'finished');
        all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        resolve(all);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

// --- remembered names (localStorage: tiny, synchronous, read once at setup) ---

export function recallNames(): string[] {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recently used first, so the names in rotation stay at the front. */
export function rememberNames(names: readonly string[]): void {
  try {
    const existing = recallNames();
    const merged = [...names];
    for (const name of existing) {
      if (!merged.some((n) => n.toLowerCase() === name.toLowerCase())) merged.push(name);
    }
    localStorage.setItem(NAMES_KEY, JSON.stringify(merged.slice(0, MAX_REMEMBERED)));
  } catch {
    // Storage is a convenience here; failing to remember a name is not an error.
  }
}
