import { describe, expect, it } from 'vitest';
import { NO_FILTERS, YAKU_CHOICES, apiPath, filtersFrom, isFiltered, paramsOf } from './history';

describe('history filters', () => {
  const full = {
    text: 'double ron', playerIds: ['p-1', 'p-2'], minLevel: 3, yaku: 'pinfu', players: 3 as const,
    ranked: false,
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
  });

  it('offer yaku, not dora', () => {
    const atoms = YAKU_CHOICES.map((y) => y.atom);
    expect(atoms).toContain('pinfu');
    expect(atoms).toContain('kokushiMusou');
    for (const dora of ['dora', 'akaDora', 'uraDora', 'nukiDora']) expect(atoms).not.toContain(dora);
  });
});
