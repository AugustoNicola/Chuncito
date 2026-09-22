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
import { type Player, nameOf, setCachedPlayers } from '../players/players';
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

export const sync = new SyncQueue(fetchTransport, idbRecords);

/**
 * Everyone the server knows, into the phone's cache. Resolves with the list,
 * or null when the server could not say (offline, locked), in which case the
 * cache stands.
 */
export async function refreshPlayers(): Promise<Player[] | null> {
  try {
    const response = await fetchTransport('GET', '/players');
    if (response.status !== 200) return null;
    const list = (response.body as (Player & { slug?: string })[])
      .map(({ id, displayName }) => ({ id, displayName }));
    setCachedPlayers(list);
    return list;
  } catch {
    return null;
  }
}

/** True when the server answered and wants the PIN; false if unlocked or unreachable. */
export async function sessionLocked(): Promise<boolean> {
  try {
    const response = await fetchTransport('GET', '/session');
    return response.status === 200 && !(response.body as { unlocked: boolean }).unlocked;
  } catch {
    return false;
  }
}

export type PlayerResult =
  | { ok: true; player: Player }
  | { ok: false; message: string; locked?: boolean };

async function playerRequest(method: string, path: string, name: string): Promise<PlayerResult> {
  let response;
  try {
    response = await fetchTransport(method, path, { displayName: name });
  } catch {
    return { ok: false, message: 'Could not reach the server. Players are added online.' };
  }
  if (response.status === 200 || response.status === 201) {
    const { id, displayName } = response.body as Player;
    await refreshPlayers();
    return { ok: true, player: { id, displayName } };
  }
  if (response.status === 409) {
    const existing = (response.body as { existing?: Player }).existing;
    return { ok: false, message: `${existing?.displayName ?? 'Someone'} already exists.` };
  }
  if (response.status === 401) {
    return { ok: false, message: 'The server needs the PIN first.', locked: true };
  }
  if (response.status === 422) return { ok: false, message: 'That is not a usable name.' };
  return { ok: false, message: `The server said ${response.status}.` };
}

export const createPlayer = (name: string) => playerRequest('POST', '/players', name);

export const renamePlayer = (id: string, name: string) =>
  playerRequest('PATCH', `/players/${encodeURIComponent(id)}`, name);

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
