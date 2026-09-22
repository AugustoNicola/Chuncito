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
