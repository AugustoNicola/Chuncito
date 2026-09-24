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
import { type MatchState, uuid } from './matchState';

const DB_NAME = 'chuncito';
const DB_VERSION = 2;
const STORE = 'matches';
/** What the server has acknowledged and what is still to send; see `sync.ts`. */
export const SYNC_STORE = 'sync';
const CURRENT = 'current';

let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
  return (dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

export async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
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

/**
 * Brings a mirror written by an older version up to date.
 *
 * Mirrors written before sanma existed have no player count, ones written
 * before red fives were optional have no setting for them, and ones written
 * before house rules have no rules; they were all four-player matches with red
 * fives and no house rules. Ones written before the server existed
 * have no id. Filled in on the way out so nothing downstream has to guess --
 * and the caller writes an upgraded mirror back, because an id made up afresh
 * on every load would upload the same match under a new name each time.
 */
function upgrade(state: MatchState): { state: MatchState; changed: boolean } {
  const { players = 4, redFives = true, rules = [] } = state.config as Partial<MatchState['config']>;
  const id = (state as Partial<MatchState>).id ?? uuid();
  if (state.config.players === players && state.config.redFives === redFives
      && state.config.rules === rules && state.id === id) {
    return { state, changed: false };
  }
  return {
    state: { ...state, id, config: { ...state.config, players, redFives, rules } },
    changed: true,
  };
}

export const loadMatch = async (): Promise<MatchState | null> => {
  const saved = await withStore<MatchState>(
    'readonly', (store) => store.get(CURRENT) as IDBRequest<MatchState>);
  if (!saved) return null;
  const { state, changed } = upgrade(saved);
  if (changed) await saveMatch(state);
  return state;
};

export const clearMatch = (): Promise<unknown> =>
  withStore('readwrite', (store) => store.delete(CURRENT));

/**
 * Finished matches, kept on the phone as well as on the server. `sync.ts` reads
 * them at start-up, which is how matches finished before the server existed get
 * uploaded -- through `upgrade`, like everything else read from here.
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
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.openCursor();
      const all: MatchState[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          resolve(all);
          return;
        }
        const saved = cursor.value as MatchState | undefined;
        if (cursor.key !== CURRENT && saved?.status === 'finished') {
          const { state, changed } = upgrade(saved);
          if (changed) cursor.update(state);
          all.push(state);
        }
        cursor.continue();
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}
