import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROLOG_SOURCES } from './prologSource';

describe('the bundled Prolog', () => {
  // A vendored file missing from the bundle does not error: its predicates are
  // simply unknown, and every query fails as if no hand ever won. It happened
  // once, when upstream added `reglas.pl`.
  it('includes every vendored source file', () => {
    const dir = new URL('../../../scorer/mahjonglog/src/', import.meta.url);
    const vendored = readdirSync(dir).filter((f) => f.endsWith('.pl')).sort();
    expect(Object.keys(PROLOG_SOURCES).sort()).toEqual(vendored);
  });
});
