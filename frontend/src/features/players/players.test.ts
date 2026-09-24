/**
 * The cached player list: searching it, ordering it, and telling one person
 * from another the way the server does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Player, byMakapoints, byName, byRecent, cachedPlayers, findByName, markSeated, nameOf, search, setCachedPlayers,
  slugOf,
} from './players';

/** vitest runs in Node, which has no localStorage. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => { this.data.set(k, v); };
  removeItem = (k: string) => { this.data.delete(k); };
}

const ana: Player = { id: 'a', displayName: 'Ana' };
const beto: Player = { id: 'b', displayName: 'Beto' };
const jose: Player = { id: 'j', displayName: 'José Luis' };

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe('names', () => {
  it('ignores case and accents, as the server does', () => {
    expect(slugOf('José Luis')).toBe('jose-luis');
    expect(slugOf('  ANA ')).toBe('ana');
    expect(findByName([ana, jose], 'jose luis')).toBe(jose);
    expect(findByName([ana], 'Anna')).toBeUndefined();
  });

  it('searches inside names, the same way', () => {
    expect(search([ana, beto, jose], 'jOSE')).toEqual([jose]);
    expect(search([ana, beto, jose], 'e')).toEqual([beto, jose]);
    expect(search([ana, beto], '  ')).toEqual([ana, beto]);
  });
});

describe('the cache', () => {
  it('keeps the server list, alphabetically, and names ids from it', () => {
    setCachedPlayers([jose, beto, ana]);
    expect(cachedPlayers().map((p) => p.displayName)).toEqual(['Ana', 'Beto', 'José Luis']);
    expect(nameOf('b')).toBe('Beto');
    expect(nameOf('nobody')).toBeUndefined();
  });

  it('forgets the name lists older versions kept', () => {
    localStorage.setItem('chuncito.names', '["Ana"]');
    setCachedPlayers([ana]);
    expect(localStorage.getItem('chuncito.names')).toBeNull();
  });

  it('is empty rather than broken when storage holds rubbish', () => {
    localStorage.setItem('chuncito.players.v2', '{not json');
    expect(cachedPlayers()).toEqual([]);
  });
});

describe('ordering the picker', () => {
  it('puts whoever sat most recently first, then goes alphabetically', () => {
    markSeated(['b'], new Date('2026-09-01T00:00:00Z'));
    markSeated(['j'], new Date('2026-09-10T00:00:00Z'));
    expect(byRecent([ana, beto, jose]).map((p) => p.id)).toEqual(['j', 'b', 'a']);
  });
});

describe('byName', () => {
  it('sorts alphabetically, ignoring case and accents', () => {
    const p = (displayName: string) => ({ id: displayName, displayName, slug: displayName }) as Player;
    expect(byName([p('beto'), p('Álvaro'), p('Ana'), p('Cami')]).map((x) => x.displayName))
      .toEqual(['Álvaro', 'Ana', 'beto', 'Cami']);
  });
});

describe('byMakapoints', () => {
  it('ranks by MP, then lists the unranked alphabetically', () => {
    const p = (displayName: string, mpPoints?: number, mpMatches?: number) =>
      ({ id: displayName, displayName, mpPoints, mpMatches }) as Player;
    const out = byMakapoints([p('Cami', 0, 0), p('Ana', -3000, 2), p('Beto', 14500, 1), p('Dani')]);
    expect(out.map((r) => [r.player.displayName, r.rank])).toEqual([
      ['Beto', 1], ['Ana', 2], ['Cami', null], ['Dani', null],
    ]);
  });
});
