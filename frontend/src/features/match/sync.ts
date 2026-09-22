/**
 * Getting matches to the server, and keeping them there.
 *
 * **Every save is the whole match.** The server replaces its copy with what
 * `toRows()` produces (see `backend/app/store.py`), so undo, corrections and the
 * end screen's placements need no special handling: they are just the next save.
 * A match is a few KB.
 *
 * **Saves coalesce.** Each match holds at most one pending save, and a newer
 * state replaces an unsent one, so ten hands recorded offline go up as one
 * request when the connection returns rather than ten.
 *
 * **The server holds the match up to the last completed hand**, not to the last
 * tap: `toRows` leaves out riichi declared in a hand that has not resolved, so
 * toggling a stick produces the same rows and sends nothing.
 *
 * **Nothing here can break the tracker.** The phone's own copy (IndexedDB, via
 * `persistence.ts`) is what the table plays from; a server that is missing,
 * down, locked or refusing only shows up in the status line.
 *
 * The queue itself is transport- and storage-agnostic so the retry, conflict and
 * coalescing rules are unit-tested (`sync.test.ts`) without a browser.
 */
import type { MatchState } from './matchState';
import { type MatchRows, toRows } from './rows';

type Pending =
  | { kind: 'put'; rows: MatchRows; json: string }
  | { kind: 'delete' };

/** One match's sync bookkeeping, persisted so a reload does not lose a pending save. */
export interface SyncRecord {
  id: string;
  /** The server's revision as of our last accepted save; 0 if never saved. */
  revision: number;
  /** What the server last acknowledged, to tell a real change from a repeat. */
  sentJson: string | null;
  pending: Pending | null;
  /**
   * `conflict`: the match changed on another device since this phone last saved
   * it, and the server refused to overwrite that. `rejected`: the server says
   * the match itself is malformed. Either way the phone's copy is untouched and
   * nothing more is sent until someone decides.
   */
  problem: 'conflict' | 'rejected' | null;
  /** The revision the server reported with a conflict, for `keepThisPhone`. */
  serverRevision?: number;
}

export interface Response { status: number; body: unknown }

/** Resolves with any HTTP response; rejects only when the server could not be reached. */
export type Transport = (method: string, path: string, body?: unknown) => Promise<Response>;

export interface RecordStore {
  all(): Promise<SyncRecord[]>;
  put(record: SyncRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export type SyncState =
  /** Everything the phone has is on the server. */
  | 'synced'
  | 'saving'
  /** Changes are waiting for the server: offline, or the server is down. */
  | 'waiting'
  /** The server wants the PIN before it takes anything. */
  | 'locked'
  /** A match needs a decision; see `SyncRecord.problem`. */
  | 'problem';

export interface SyncStatus {
  state: SyncState;
  /** Matches with a save or delete still to send. */
  pending: number;
  problems: { id: string; problem: 'conflict' | 'rejected' }[];
}

const RETRY_MIN = 2_000;
const RETRY_MAX = 60_000;

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class SyncQueue {
  private records = new Map<string, SyncRecord>();
  /**
   * Calls that arrive before `load` has read the stored records -- the match
   * screen saves as soon as it mounts -- wait for it, or they would build on
   * a blank record and then be overwritten by the stored one.
   */
  private loaded = false;
  private early: (() => void)[] = [];
  private locked = false;
  private flushing = false;
  private again = false;
  private failures = 0;
  private retry: unknown = null;
  private status: SyncStatus = { state: 'synced', pending: 0, problems: [] };
  private listeners = new Set<() => void>();

  constructor(
    private readonly transport: Transport,
    private readonly store: RecordStore,
    private readonly timers: Timers = realTimers,
  ) {}

  async load(): Promise<void> {
    for (const record of await this.store.all()) this.records.set(record.id, record);
    this.loaded = true;
    for (const run of this.early.splice(0)) run();
    this.publish();
  }

  private whenLoaded(run: () => void): boolean {
    if (this.loaded) return false;
    this.early.push(run);
    return true;
  }

  // --- what the app calls ---

  /** Queues the match's current state, if the server does not already have it. */
  enqueue(state: MatchState): void {
    if (this.whenLoaded(() => this.enqueue(state))) return;
    const rows = toRows(state);
    const json = JSON.stringify(rows);
    const record = this.records.get(state.id) ?? {
      id: state.id, revision: 0, sentJson: null, pending: null, problem: null,
    };
    const unsent = record.pending?.kind === 'put' ? record.pending.json : record.sentJson;
    if (unsent === json && record.pending?.kind !== 'delete') return;
    record.pending = { kind: 'put', rows, json };
    // A malformed match that has since changed may well be fine now.
    if (record.problem === 'rejected') record.problem = null;
    this.save(record);
    this.kick();
  }

  /** The match was thrown away at the table; take it off the server too. */
  discard(id: string): void {
    if (this.whenLoaded(() => this.discard(id))) return;
    const record = this.records.get(id);
    if (!record) return;
    if (record.revision === 0 && record.sentJson === null) {
      // The server never had it.
      this.records.delete(id);
      void this.store.delete(id);
      this.publish();
      return;
    }
    record.pending = { kind: 'delete' };
    record.problem = null;
    this.save(record);
    this.kick();
  }

  /**
   * Resolves a conflict in this phone's favour: the next save overwrites what
   * the other device sent. The only resolution offered, because the tracker has
   * no way to merge two tables' worth of hands -- and the other copy stays
   * reachable on the device that made it.
   */
  keepThisPhone(id: string): void {
    if (this.whenLoaded(() => this.keepThisPhone(id))) return;
    const record = this.records.get(id);
    if (!record || record.problem !== 'conflict') return;
    record.revision = record.serverRevision ?? record.revision;
    record.problem = null;
    this.save(record);
    this.kick();
  }

  /** Returns null when unlocked, or what to tell the person otherwise. */
  async unlock(pin: string): Promise<string | null> {
    let response: Response;
    try {
      response = await this.transport('POST', '/session', { pin });
    } catch {
      return 'Could not reach the server.';
    }
    if (response.status === 204) {
      this.locked = false;
      this.failures = 0;
      this.publish();
      this.kick();
      return null;
    }
    if (response.status === 401) return 'That is not the PIN.';
    if (response.status === 429) return 'Too many wrong tries. Wait a few minutes.';
    if (response.status === 503) return 'The server has no PIN set up yet.';
    return `The server said ${response.status}.`;
  }

  /** Asks the server whether this browser still has its PIN cookie. */
  async checkSession(): Promise<void> {
    try {
      const response = await this.transport('GET', '/session');
      const body = response.body as { unlocked?: boolean } | null;
      if (response.status === 200 && body) {
        this.locked = !body.unlocked;
        this.publish();
      }
    } catch {
      // Offline; the next flush will find out.
    }
  }

  // --- status ---

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(): void {
    const all = [...this.records.values()];
    const problems = all
      .filter((r): r is SyncRecord & { problem: 'conflict' | 'rejected' } => r.problem !== null)
      .map((r) => ({ id: r.id, problem: r.problem }));
    const pending = all.filter((r) => r.pending !== null).length;
    const state: SyncState = problems.length > 0 ? 'problem'
      : this.locked && pending > 0 ? 'locked'
      : this.flushing ? 'saving'
      : pending > 0 ? 'waiting'
      : 'synced';
    const next = { state, pending, problems };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    for (const listener of this.listeners) listener();
  }

  // --- sending ---

  private save(record: SyncRecord): void {
    this.records.set(record.id, record);
    void this.store.put(record);
    this.publish();
  }

  /** Flushes now, cancelling any backoff. For "the network is back". */
  kick(): void {
    if (this.retry !== null) {
      this.timers.clear(this.retry);
      this.retry = null;
    }
    void this.flush();
  }

  /** Sends everything pending, one match at a time. */
  async flush(): Promise<void> {
    if (this.flushing) {
      // Something was queued mid-flush; go round again once this pass ends.
      this.again = true;
      return;
    }
    if (this.locked || !this.loaded) return;
    this.flushing = true;
    this.publish();
    try {
      do {
        this.again = false;
        for (const record of [...this.records.values()]) {
          if (!record.pending || record.problem) continue;
          const outcome = await this.send(record);
          if (outcome === 'stop') return;
        }
      } while (this.again);
      this.failures = 0;
    } finally {
      this.flushing = false;
      this.publish();
    }
  }

  private async send(record: SyncRecord): Promise<'next' | 'stop'> {
    const pending = record.pending!;
    let response: Response;
    try {
      response = pending.kind === 'put'
        ? await this.transport('PUT', `/matches/${encodeURIComponent(record.id)}`,
          { baseRevision: record.revision, rows: pending.rows })
        : await this.transport('DELETE', `/matches/${encodeURIComponent(record.id)}`);
    } catch {
      this.backOff();
      return 'stop';
    }

    if (response.status === 401) {
      this.locked = true;
      return 'stop';
    }
    if (response.status >= 500 || response.status === 404 && pending.kind === 'put') {
      // Down, or no API behind this address yet (a static preview): try later.
      this.backOff();
      return 'stop';
    }

    if (pending.kind === 'delete') {
      this.records.delete(record.id);
      void this.store.delete(record.id);
      return 'next';
    }

    if (response.status === 200) {
      record.revision = (response.body as { revision: number }).revision;
      record.sentJson = pending.json;
      if (!this.records.has(record.id)) {
        // Discarded while its first save was in flight: it did land, so it has
        // to come off again.
        record.pending = { kind: 'delete' };
        this.again = true;
      } else if (record.pending === pending) {
        // Otherwise a newer state may have been queued meanwhile; that one stays.
        record.pending = null;
      }
    } else if (response.status === 409) {
      const body = response.body as { revision?: number } | null;
      record.problem = 'conflict';
      if (typeof body?.revision === 'number') record.serverRevision = body.revision;
    } else {
      record.problem = 'rejected';
      console.error('the server refused match', record.id, response.body);
    }
    this.save(record);
    return 'next';
  }

  private backOff(): void {
    const delay = Math.min(RETRY_MAX, RETRY_MIN * 2 ** this.failures);
    this.failures += 1;
    this.retry = this.timers.set(() => {
      this.retry = null;
      void this.flush();
    }, delay);
  }
}
