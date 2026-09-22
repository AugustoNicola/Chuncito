/**
 * The app's one `SyncQueue`, wired to `fetch` and IndexedDB.
 *
 * `/api` is same-origin: in development Vite proxies it to the FastAPI server
 * (`vite.config.ts`), and in production the backend serves both. The PIN
 * cookie therefore rides along on every request without any CORS setup.
 */
import { useSyncExternalStore } from 'react';
import type { MatchState } from './matchState';
import { SYNC_STORE, listArchived, loadMatch, withStore } from './persistence';
import { applyAliases, mergeServerPlayers, nameOf } from './players';
import { type MatchRows, fromRows } from './rows';
import { type RecordStore, type SyncRecord, type SyncStatus, SyncQueue, type Transport } from './sync';

const fetchTransport: Transport = async (method, path, body) => {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
};

/** IndexedDB when it works; otherwise records live for the page's lifetime only. */
const idbRecords: RecordStore = {
  all: async () => (await withStore<SyncRecord[]>(
    'readonly', (s) => s.getAll() as IDBRequest<SyncRecord[]>, SYNC_STORE)) ?? [],
  put: async (record) => { await withStore('readwrite', (s) => s.put(record, record.id), SYNC_STORE); },
  delete: async (id) => { await withStore('readwrite', (s) => s.delete(id), SYNC_STORE); },
};

export const sync = new SyncQueue(fetchTransport, idbRecords, undefined, applyAliases);

/** Everyone the server knows, into this phone's roster. Quietly does nothing offline. */
export async function refreshPlayers(): Promise<void> {
  try {
    const response = await fetchTransport('GET', '/players');
    if (response.status === 200) {
      mergeServerPlayers(response.body as { id: string; displayName: string }[]);
    }
  } catch {
    // Offline; the roster on the phone is enough to set up a match.
  }
}

export interface ServerMatch {
  id: string;
  name: string;
  players: number;
  status: string;
  startedAt: string;
  hands: number;
  seats: string[];
  scores: number[];
  revision: number;
}

/** Matches still being played, on any device. Empty when the server cannot say. */
export async function matchesInProgress(): Promise<ServerMatch[]> {
  try {
    const response = await fetchTransport('GET', '/matches?status=in_progress');
    return response.status === 200 ? response.body as ServerMatch[] : [];
  } catch {
    return [];
  }
}

/**
 * Carries on a match from another device: fetched, rebuilt with `fromRows`, and
 * registered with the queue at the server's revision so the next hand recorded
 * here builds on it. Null if it could not be fetched.
 *
 * Riichi sticks declared on the other phone in a hand it has not finished are
 * not on the server (only completed hands are), so they have to be declared
 * again here -- the same as a reload.
 */
export async function resumeFromServer(id: string): Promise<MatchState | null> {
  try {
    const response = await fetchTransport('GET', `/matches/${encodeURIComponent(id)}`);
    if (response.status !== 200) return null;
    const body = response.body as {
      revision: number; rows: MatchRows; players: { id: string; displayName: string }[];
    };
    mergeServerPlayers(body.players);
    const names = new Map(body.players.map((p) => [p.id, p.displayName]));
    const state = fromRows(body.rows, (pid) => names.get(pid) ?? nameOf(pid) ?? pid);
    sync.adopt(state, body.revision);
    return state;
  } catch {
    return null;
  }
}

let started: Promise<void> | null = null;

/**
 * Once per page load: pick up where the last one left off, and queue anything
 * on the phone the server has not got -- which is how matches finished before
 * there was a server get uploaded.
 */
export function startSync(): Promise<void> {
  return (started ??= (async () => {
    await sync.load();
    void sync.checkSession();
    void refreshPlayers();
    const current = await loadMatch();
    if (current) sync.enqueue(current);
    for (const match of await listArchived()) sync.enqueue(match);

    window.addEventListener('online', () => sync.kick());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync.kick();
    });
  })());
}

export const queueMatch = (state: MatchState): void => { sync.enqueue(state); };

export const useSyncStatus = (): SyncStatus =>
  useSyncExternalStore(sync.subscribe, sync.getStatus);
