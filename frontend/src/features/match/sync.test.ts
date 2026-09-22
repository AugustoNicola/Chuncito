/**
 * The sync queue's rules, against a fake server that keeps the real one's
 * revision rules (`backend/app/store.py`): a save must name the revision it was
 * based on, and a repeat of what is already stored is accepted as-is.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMatch, recordHand, toggleRiichi, undoLastHand } from './matchState';
import { type MatchRows } from './rows';
import { type RecordStore, type SyncRecord, SyncQueue, type Timers, type Transport } from './sync';
import { fourPlayerConfig, manual } from './testMatches';

class FakeServer {
  matches = new Map<string, { revision: number; json: string }>();
  requests: string[] = [];
  pin = '1234';
  unlocked = false;
  down = false;
  lastBody: unknown = null;
  /** Holds the next request until released, to test what happens mid-flight. */
  hold: (() => void) | null = null;

  transport: Transport = async (method, path, body) => {
    this.requests.push(`${method} ${path}`);
    if (this.hold) await new Promise<void>((release) => { this.hold = release; });
    if (this.down) throw new TypeError('network down');
    if (path === '/session') {
      if (method === 'GET') return { status: 200, body: { unlocked: this.unlocked } };
      this.unlocked = (body as { pin: string }).pin === this.pin;
      return { status: this.unlocked ? 204 : 401, body: null };
    }
    if (!this.unlocked) return { status: 401, body: null };
    const id = decodeURIComponent(path.replace('/matches/', ''));
    if (method === 'DELETE') {
      this.matches.delete(id);
      return { status: 204, body: null };
    }
    const { baseRevision, rows } = body as { baseRevision: number; rows: MatchRows };
    this.lastBody = body;
    const json = JSON.stringify(rows);
    const current = this.matches.get(id);
    if (current?.json === json) return { status: 200, body: { revision: current.revision } };
    if (current && current.revision !== baseRevision) {
      return { status: 409, body: { revision: current.revision } };
    }
    const revision = (current?.revision ?? 0) + 1;
    this.matches.set(id, { revision, json });
    return { status: 200, body: { revision } };
  };

  rowsOf(id: string): MatchRows {
    return JSON.parse(this.matches.get(id)!.json) as MatchRows;
  }
}

class MemoryStore implements RecordStore {
  data = new Map<string, SyncRecord>();
  all = async () => [...this.data.values()].map((r) => structuredClone(r));
  put = async (r: SyncRecord) => { this.data.set(r.id, structuredClone(r)); };
  delete = async (id: string) => { this.data.delete(id); };
}

class ManualTimers implements Timers {
  queued: { run: () => void; ms: number }[] = [];
  set = (run: () => void, ms: number) => { const t = { run, ms }; this.queued.push(t); return t; };
  clear = (handle: unknown) => { this.queued = this.queued.filter((t) => t !== handle); };
  fire() { const all = this.queued.splice(0); for (const t of all) t.run(); }
}

/** Lets queued promise chains run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let server: FakeServer;
let store: MemoryStore;
let timers: ManualTimers;
let queue: SyncQueue;

const start = () => createMatch(fourPlayerConfig, new Date('2026-09-21T10:00:00.000Z'), 'm1');
const ron = (state: ReturnType<typeof start>) => recordHand(state, {
  kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 0, 'ron')],
}).state;

beforeEach(async () => {
  server = new FakeServer();
  server.unlocked = true;
  store = new MemoryStore();
  timers = new ManualTimers();
  queue = new SyncQueue(server.transport, store, timers);
  await queue.load();
});

describe('saving', () => {
  it('sends a match and records the revision the server gave it', async () => {
    queue.enqueue(start());
    await settle();
    expect(server.matches.get('m1')?.revision).toBe(1);
    expect(queue.getStatus()).toEqual({ state: 'synced', pending: 0, problems: [] });
    expect(store.data.get('m1')).toMatchObject({ revision: 1, pending: null });
  });

  it('sends the next hand on top of the last save', async () => {
    let s = start();
    queue.enqueue(s);
    await settle();
    s = ron(s);
    queue.enqueue(s);
    await settle();
    expect(server.matches.get('m1')?.revision).toBe(2);
    expect(server.rowsOf('m1').hands).toHaveLength(1);
  });

  it('sends nothing for a riichi stick, which is not a completed hand', async () => {
    const s = start();
    queue.enqueue(s);
    await settle();
    const before = server.requests.length;
    queue.enqueue(toggleRiichi(s, 2));
    await settle();
    expect(server.requests.length).toBe(before);
  });

  it('sends an undo like any other change', async () => {
    const s = ron(start());
    queue.enqueue(s);
    await settle();
    queue.enqueue(undoLastHand(s));
    await settle();
    expect(server.rowsOf('m1').hands).toHaveLength(0);
  });
});

describe('what a save sends', () => {
  it('is the revision and the rows, and nothing that could create a player', async () => {
    queue.enqueue(start());
    await settle();
    expect(Object.keys(server.lastBody as object).sort()).toEqual(['baseRevision', 'rows']);
  });
});

describe('carrying on a match from another device', () => {
  it('builds the next save on the revision it was fetched at', async () => {
    const s = start();
    server.matches.set('m1', { revision: 7, json: 'whatever the other phone sent' });
    queue.adopt(s, 7);
    await settle();
    expect(server.requests).toEqual([]);      // nothing new to send yet

    queue.enqueue(s);                         // the match screen's first save
    await settle();
    expect(server.requests).toEqual([]);      // still the same match

    queue.enqueue(ron(s));
    await settle();
    expect(server.matches.get('m1')?.revision).toBe(8);
  });
});

describe('offline', () => {
  it('keeps the save, backs off, and sends it when the network returns', async () => {
    server.down = true;
    queue.enqueue(start());
    await settle();
    expect(queue.getStatus()).toMatchObject({ state: 'waiting', pending: 1 });
    expect(timers.queued.map((t) => t.ms)).toEqual([2000]);

    timers.fire();
    await settle();
    expect(timers.queued.map((t) => t.ms)).toEqual([4000]);

    server.down = false;
    queue.kick();
    await settle();
    expect(timers.queued).toEqual([]);
    expect(queue.getStatus().state).toBe('synced');
    expect(server.matches.has('m1')).toBe(true);
  });

  it('sends several offline hands as one save', async () => {
    server.down = true;
    let s = start();
    queue.enqueue(s);
    for (let i = 0; i < 3; i++) { s = ron(s); queue.enqueue(s); }
    await settle();
    server.down = false;
    server.requests = [];
    queue.kick();
    await settle();
    expect(server.requests).toEqual(['PUT /matches/m1']);
    expect(server.rowsOf('m1').hands).toHaveLength(3);
  });

  it('survives a reload with the save still pending', async () => {
    server.down = true;
    queue.enqueue(ron(start()));
    await settle();

    server.down = false;
    const reloaded = new SyncQueue(server.transport, store, timers);
    await reloaded.load();
    await reloaded.flush();
    expect(server.rowsOf('m1').hands).toHaveLength(1);
  });

  it('holds calls made before the stored records have loaded', async () => {
    queue.enqueue(start());
    await settle();
    const s = ron(start());
    const fresh = new SyncQueue(server.transport, store, timers);
    fresh.enqueue(s);             // before load
    await fresh.load();
    await settle();
    // Built on revision 1 from the store, so the server took it.
    expect(server.matches.get('m1')?.revision).toBe(2);
  });

  it('keeps a hand recorded while the previous save was in flight', async () => {
    let s = start();
    server.hold = () => {};
    queue.enqueue(s);
    await settle();
    s = ron(s);
    queue.enqueue(s);             // queued behind the held request
    const release = server.hold!;
    server.hold = null;
    release();
    await settle();
    await settle();
    expect(server.rowsOf('m1').hands).toHaveLength(1);
    expect(queue.getStatus().state).toBe('synced');
  });
});

describe('the PIN', () => {
  it('stops at a locked server and carries on once unlocked', async () => {
    server.unlocked = false;
    queue.enqueue(start());
    await settle();
    expect(queue.getStatus().state).toBe('locked');

    expect(await queue.unlock('0000')).toMatch(/not the PIN/);
    expect(await queue.unlock('1234')).toBeNull();
    await settle();
    expect(queue.getStatus().state).toBe('synced');
    expect(server.matches.has('m1')).toBe(true);
  });
});

describe('conflicts', () => {
  it('refuses to overwrite a match changed elsewhere, until told to', async () => {
    const s = start();
    queue.enqueue(s);
    await settle();
    // Another device moves the server on.
    server.matches.set('m1', { revision: 5, json: '{"elsewhere":true}' });

    queue.enqueue(ron(s));
    await settle();
    expect(queue.getStatus()).toMatchObject({
      state: 'problem', problems: [{ id: 'm1', problem: 'conflict' }],
    });
    expect(server.matches.get('m1')?.json).toBe('{"elsewhere":true}');

    queue.keepThisPhone('m1');
    await settle();
    expect(server.matches.get('m1')?.revision).toBe(6);
    expect(server.rowsOf('m1').hands).toHaveLength(1);
    expect(queue.getStatus().state).toBe('synced');
  });
});

describe('discarding', () => {
  it('deletes a match the server has', async () => {
    queue.enqueue(start());
    await settle();
    queue.discard('m1');
    await settle();
    expect(server.matches.has('m1')).toBe(false);
    expect(store.data.has('m1')).toBe(false);
  });

  it('never bothers the server with a match it never had', async () => {
    server.down = true;
    queue.enqueue(start());
    await settle();
    server.down = false;
    server.requests = [];
    queue.discard('m1');
    await settle();
    expect(server.requests).toEqual([]);
    expect(queue.getStatus().pending).toBe(0);
  });

  it('takes a match back off the server if it landed after being discarded', async () => {
    server.hold = () => {};
    queue.enqueue(start());
    await settle();
    queue.discard('m1');          // the first save is still in flight
    const release = server.hold!;
    server.hold = null;
    release();
    await settle();
    await settle();
    expect(server.matches.has('m1')).toBe(false);
  });
});
