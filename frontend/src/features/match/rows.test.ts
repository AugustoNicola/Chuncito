/**
 * Does a match survive the database?
 *
 * Plays a match that exercises every kind of hand, maps it to rows, rebuilds it
 * from *nothing but those rows*, and checks the result against the original.
 * The point is the reconstruction: anything the schema cannot hold shows up as a
 * difference rather than as an oversight nobody noticed until Phase 3.
 */
import { describe, expect, it } from 'vitest';
import { createMatch, recordHand } from './matchState';
import { placements } from './scoring';
import { fromRows, toRows } from './rows';
import { fourPlayerConfig as config, manual, playEverything } from './testMatches';

describe('a match survives the database', () => {
  const original = playEverything();
  const rebuilt = fromRows(toRows(original));

  it('records one of every outcome, so the check means something', () => {
    expect(new Set(original.hands.map((h) => h.outcome))).toEqual(new Set([
      'ron', 'tsumo', 'exhaustive_draw', 'abortive_draw', 'nagashi_mangan',
    ]));
    expect(original.hands.some((h) => h.wins.length > 1)).toBe(true);
    expect(original.hands.some((h) => h.wins.some((w) => w.handTiles))).toBe(true);
    expect(original.adjustments.length).toBeGreaterThan(0);
  });

  it('rebuilds every hand exactly', () => {
    expect(rebuilt.hands).toEqual(original.hands);
  });

  it('rebuilds the scores without storing them', () => {
    expect(rebuilt.scores).toEqual(original.scores);
  });

  it('rebuilds the round marker and honba from the last hand alone', () => {
    expect(rebuilt.round).toEqual(original.round);
    expect(rebuilt.honba).toEqual(original.honba);
    expect(rebuilt.potCarried).toEqual(original.potCarried);
  });

  it('keeps the match settings, including how it ended', () => {
    expect(rebuilt.config).toEqual(original.config);
    expect(rebuilt.status).toBe(original.status);
    expect(rebuilt.endReason).toBe(original.endReason);
    expect(rebuilt.name).toBe(original.name);
    expect(rebuilt.startedAt).toBe(original.startedAt);
    expect(rebuilt.endedAt).toBe(original.endedAt);
  });

  it('keeps the manual adjustments, with their notes', () => {
    expect(rebuilt.adjustments).toEqual(original.adjustments);
  });

  it('keeps the situation flags, so a hand can be re-scored later', () => {
    const win = rebuilt.hands.flatMap((h) => h.wins).find((w) => w.handTiles)!;
    expect(win.situationFlags).toEqual(['riichi', 'ippatsu']);
    // A typed-in value never had a situation, which is not the same as having
    // had one that was empty.
    const typed = rebuilt.hands.flatMap((h) => h.wins).find((w) => w.isManual && !w.handTiles)!;
    expect(typed.situationFlags).toBeNull();
  });

  it('keeps the stored tiles, so a hand can be shown back', () => {
    const tiles = rebuilt.hands.flatMap((h) => h.wins.map((w) => w.handTiles)).filter(Boolean);
    expect(tiles).toEqual(
      original.hands.flatMap((h) => h.wins.map((w) => w.handTiles)).filter(Boolean));
  });

  it('keeps the yaku of each winner against that winner', () => {
    const double = rebuilt.hands.find((h) => h.wins.length > 1)!;
    expect(double.wins[0]!.yakus).toHaveLength(3);
    expect(double.wins[1]!.yakus).toHaveLength(0);
  });

  it('is identical but for the live riichi declarations, which are not stored', () => {
    expect(rebuilt).toEqual({ ...original, pendingRiichi: [] });
  });

  it('round-trips a match still in progress', () => {
    let state = createMatch(config);
    state = recordHand(state, {
      kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 0, 'ron')],
    }).state;
    const back = fromRows(toRows(state));
    expect(back).toEqual(state);
  });

  it('keeps whether the match played with red fives', () => {
    const state = createMatch({ ...config, redFives: false });
    expect(toRows(state).match.redFives).toBe(false);
    expect(fromRows(toRows(state))).toEqual(state);
  });

  it('round-trips an empty match', () => {
    const state = createMatch(config);
    expect(fromRows(toRows(state))).toEqual(state);
  });

  it('keeps placements and uma on the seats, as the end screen gives them', () => {
    const rows = toRows(original);
    for (const p of placements(original.scores, original.config.uma)) {
      expect(rows.matchPlayers[p.seat]).toMatchObject({
        placement: p.place, umaPoints: p.umaPoints, finalScore: p.score,
      });
    }
  });

  it('leaves placements empty while the match is still being played', () => {
    const state = recordHand(createMatch(config), {
      kind: 'win', mode: 'ron', dealIn: 2, wins: [manual(1, 0, 'ron')],
    }).state;
    expect(toRows(state).matchPlayers.every((p) => p.placement === null)).toBe(true);
  });

  it('records the best level reached, for the "mangan or better" filter', () => {
    expect(toRows(original).match.maxLevel).toBe('mangan');
    expect(toRows(createMatch(config)).match.maxLevel).toBeNull();
  });

  it('keeps the match id, which the server stores it under', () => {
    expect(rebuilt.id).toBe(original.id);
    expect(toRows(original).match.id).toBe(original.id);
  });

  it('stores a double ron in seat order, however it was entered', () => {
    const double = original.hands.find((h) => h.wins.length > 1)!;
    expect(double.wins.map((w) => w.winnerSeat)).toEqual([1, 3]);
  });
});
