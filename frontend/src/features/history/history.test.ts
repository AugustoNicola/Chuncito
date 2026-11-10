import { describe, expect, it } from 'vitest';
import { NO_FILTERS, YAKU_CHOICES, apiPath, filtersFrom, isFiltered, kindOf, paramsOf } from './history';

describe('history filters', () => {
  const full = {
    text: 'double ron', playerIds: ['p-1', 'p-2'], minLevel: 3, yaku: 'pinfu', players: 3 as const,
    kind: 'casual' as const,
  };

  it('survive the URL', () => {
    expect(filtersFrom(paramsOf(full))).toEqual(full);
    expect(filtersFrom(paramsOf(NO_FILTERS))).toEqual(NO_FILTERS);
  });

  it('leave an unfiltered list at a plain URL', () => {
    expect(paramsOf(NO_FILTERS).toString()).toBe('');
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, text: '   ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, minLevel: 1 })).toBe(true);
  });

  it('drop what the URL cannot mean rather than guess', () => {
    const f = filtersFrom(new URLSearchParams('level=9&yaku=dora&players=5&mp=maybe&player=a&player=a'));
    expect(f).toEqual({ ...NO_FILTERS, playerIds: ['a'] });
  });

  it('speak the API\'s names, and ask only for finished matches', () => {
    const path = new URL(apiPath(full), 'http://x');
    expect(path.pathname).toBe('/matches');
    expect(path.searchParams.get('status')).toBe('finished');
    expect(path.searchParams.get('min_level')).toBe('3');
    expect(path.searchParams.getAll('player')).toEqual(['p-1', 'p-2']);
    expect(path.searchParams.get('q')).toBe('double ron');
    expect(path.searchParams.get('players')).toBe('3');
    expect(path.searchParams.get('ranked')).toBe('false');
    expect(path.searchParams.get('tiktok')).toBe('false');
  });

  it('tell the three kinds of match apart', () => {
    const api = (kind: 'ranked' | 'casual' | 'tiktok') =>
      new URL(apiPath({ ...NO_FILTERS, kind }), 'http://x').searchParams;
    expect(api('ranked').get('ranked')).toBe('true');
    expect(api('ranked').get('tiktok')).toBeNull();
    expect(api('tiktok').get('tiktok')).toBe('true');
    expect(api('tiktok').get('ranked')).toBeNull();
    // Old links still mean what they meant.
    expect(filtersFrom(new URLSearchParams('mp=1')).kind).toBe('ranked');
    expect(filtersFrom(new URLSearchParams('mp=0')).kind).toBe('casual');
    expect(filtersFrom(paramsOf({ ...NO_FILTERS, kind: 'tiktok' })).kind).toBe('tiktok');
    expect(kindOf({ ranked: false, tiktok: true })).toBe('tiktok');
  });

  it('offer yaku, not dora', () => {
    const atoms = YAKU_CHOICES.map((y) => y.atom);
    expect(atoms).toContain('pinfu');
    expect(atoms).toContain('kokushiMusou');
    for (const dora of ['dora', 'akaDora', 'uraDora', 'nukiDora']) expect(atoms).not.toContain(dora);
  });
});
