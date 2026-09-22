/**
 * The fixtures the backend tests PUT and GET, generated from real matches.
 *
 * `backend/tests/fixtures/*.json` holds what the sync sends for each match in
 * `testMatches.ts` (`rows`, from `payloadOf`), with the random ids swapped for
 * stable ones -- and, as test data rather than wire, the registered `players`
 * those rows seat, which the backend tests create first. The backend
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
import { type MatchState } from './matchState';
import { payloadOf } from './sync';
import { fourPlayerConfig, nameOfTest, playEverything, playSanmaInProgress } from './testMatches';

interface Fixture {
  rows: MatchRows;
  players: { id: string; displayName: string }[];
}

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)),
  '../../../../backend/tests/fixtures');

/** Stable ids, so the fixture only changes when the shape does. */
function stable(state: MatchState, id: string): Fixture {
  const { rows } = payloadOf(state);
  const players = state.config.seats.flatMap((s) =>
    (s.playerId ? [{ id: s.playerId, displayName: s.name }] : []));
  return {
    rows: {
      ...rows,
      match: { ...rows.match, id },
      hands: rows.hands.map((h) => ({ ...h, clientUuid: `${id}-hand-${h.seq}` })),
      adjustments: rows.adjustments.map((a, i) => ({ ...a, clientUuid: `${id}-adj-${i + 1}` })),
    },
    players,
  };
}

const cases: Record<string, Fixture> = {
  'four-player-finished': stable(playEverything(), 'fixture-4p'),
  'sanma-in-progress': stable(playSanmaInProgress(), 'fixture-3p'),
  'empty': stable(createMatch(fourPlayerConfig, new Date('2026-09-23T00:00:00.000Z')),
    'fixture-empty'),
};

describe('backend fixtures', () => {
  for (const [name, payload] of Object.entries(cases)) {
    it(`${name} is what the sync sends`, () => {
      const file = resolve(FIXTURES, `${name}.json`);
      const text = `${JSON.stringify(payload, null, 2)}\n`;
      if (process.env.UPDATE_FIXTURES) {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(file, text);
      }
      expect(existsSync(file), `${file} is missing; run UPDATE_FIXTURES=1 npm test -- wire`)
        .toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(payload);
    });

    it(`${name} rebuilds into a match`, () => {
      // What a second device does with the server's copy.
      const rows: MatchRows = payload.rows;
      expect(toRows(fromRows(rows, nameOfTest))).toEqual(rows);
    });
  }
});
