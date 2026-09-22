/**
 * The roster: names become players, the same name is the same player, and the
 * server's word wins when two phones disagree.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAliases, mergeServerPlayers, nameOf, recentNames, roster, seatPlayers, slugOf,
} from './players';

/** vitest runs in Node, which has no localStorage. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => { this.data.set(k, v); };
  removeItem = (k: string) => { this.data.delete(k); };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('seating players', () => {
  it('makes a player of a new name, and seats the same one next time', () => {
    const [ana] = seatPlayers(['Ana']);
    expect(ana!.playerId).toBeTruthy();
    const [again] = seatPlayers(['  ana ']);
    expect(again).toEqual(ana);   // same id, registered spelling
    expect(roster()).toHaveLength(1);
  });

  it('treats case and accents as the same name, as the server does', () => {
    expect(slugOf('José Luis')).toBe('jose-luis');
    const [first] = seatPlayers(['José']);
    const [second] = seatPlayers(['jose']);
    expect(second!.playerId).toBe(first!.playerId);
  });

  it('offers the most recent players first', () => {
    seatPlayers(['Ana', 'Beto'], new Date('2026-09-01T00:00:00Z'));
    seatPlayers(['Cami'], new Date('2026-09-10T00:00:00Z'));
    expect(recentNames()[0]).toBe('Cami');
  });

  it('brings over the names the pre-roster version remembered', () => {
    localStorage.setItem('chuncito.names', JSON.stringify(['Ana', 'Beto']));
    expect(roster().map((p) => p.name)).toEqual(['Ana', 'Beto']);
  });
});

describe('the server', () => {
  it('adds the players it knows and takes its spelling', () => {
    seatPlayers(['ana']);
    mergeServerPlayers([
      { id: 'srv-ana', displayName: 'Ana' },
      { id: 'srv-dani', displayName: 'Dani' },
    ]);
    // The local "ana" was the server's Ana all along; it takes that id.
    expect(roster().map((p) => [p.id, p.name])).toEqual([['srv-ana', 'Ana'], ['srv-dani', 'Dani']]);
    expect(seatPlayers(['ANA'])[0]!.playerId).toBe('srv-ana');
  });

  it('follows an alias, merging the duplicate', () => {
    const [local] = seatPlayers(['Beto']);
    mergeServerPlayers([{ id: 'srv-beto', displayName: 'Beto' }]);
    // Already merged by name; an alias for the old id is harmless.
    applyAliases({ [local!.playerId!]: 'srv-beto' });
    expect(roster().filter((p) => p.name === 'Beto')).toHaveLength(1);
    expect(nameOf('srv-beto')).toBe('Beto');
  });

  it('renames a local id to the one the server stored it under', () => {
    const [local] = seatPlayers(['Cami']);
    applyAliases({ [local!.playerId!]: 'srv-cami' });
    expect(seatPlayers(['Cami'])[0]!.playerId).toBe('srv-cami');
  });
});
