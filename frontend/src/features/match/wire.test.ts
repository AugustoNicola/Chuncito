/**
 * The fixtures the backend tests PUT and GET, generated from real matches.
 *
 * `backend/tests/fixtures/*.json` is `toRows()` of the matches in
 * `testMatches.ts`, with the random ids swapped for stable ones. The backend
 * checks that it hands each fixture back unchanged; this checks that the
 * fixtures are still what the client actually sends. Between the two, a field
 * added to `rows.ts` cannot quietly fail to reach the database.
 *
 * When `rows.ts` changes on purpose, regenerate with
 * `UPDATE_FIXTURES=1 npm test -- wire`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMatch } from './matchState';
import { type MatchRows, fromRows, toRows } from './rows';
import { fourPlayerConfig, playEverything, playSanmaInProgress } from './testMatches';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)),
  '../../../../backend/tests/fixtures');

/** Stable ids, so the fixture only changes when the shape does. */
function stable(rows: MatchRows, id: string): MatchRows {
  return {
    ...rows,
    match: { ...rows.match, id },
    hands: rows.hands.map((h) => ({ ...h, clientUuid: `${id}-hand-${h.seq}` })),
    adjustments: rows.adjustments.map((a, i) => ({ ...a, clientUuid: `${id}-adj-${i + 1}` })),
  };
}

const cases: Record<string, MatchRows> = {
  'four-player-finished': stable(toRows(playEverything()), 'fixture-4p'),
  'sanma-in-progress': stable(toRows(playSanmaInProgress()), 'fixture-3p'),
  'empty': stable(toRows(createMatch(fourPlayerConfig, new Date('2026-09-23T00:00:00.000Z'))),
    'fixture-empty'),
};

describe('backend fixtures', () => {
  for (const [name, rows] of Object.entries(cases)) {
    it(`${name} is what toRows sends`, () => {
      const file = resolve(FIXTURES, `${name}.json`);
      const text = `${JSON.stringify(rows, null, 2)}\n`;
      if (process.env.UPDATE_FIXTURES) {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(file, text);
      }
      expect(existsSync(file), `${file} is missing; run UPDATE_FIXTURES=1 npm test -- wire`)
        .toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(rows);
    });

    it(`${name} rebuilds into a match`, () => {
      // What a second device does with the server's copy.
      expect(toRows(fromRows(rows))).toEqual(rows);
    });
  }
});
