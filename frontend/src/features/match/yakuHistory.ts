/**
 * Which yaku a player has already won with, so the score screen can mark the
 * ones that are new to them -- the same yaku the profile lists under "Not won
 * with yet".
 *
 * Two sources, joined: the server's count over every finished match, both
 * kinds (the profile's own figures), and the hands already won in the match
 * being played, which the server does not count until it is finished.
 *
 * The badge is a nicety, so it never holds the table up: the history arrives
 * when it arrives. And it only ever claims "new" when the history is known --
 * a guest, an offline phone or a locked server shows no badge at all rather
 * than a wrong one. Nor does a Tiktok match, whose wins are never counted.
 */
import { useEffect, useState } from 'react';
import { PSEUDO_YAKU } from '../../scorer/types';
import { cachedPlayers, slugOf } from '../players/players';
import { fetchStats } from '../players/profile';
import type { MatchState } from './matchState';
import type { Seat } from './seats';

/** The yaku this seat has won with in the hands already recorded in this match. */
export function yakusWonInMatch(state: MatchState, seat: Seat): Set<string> {
  const won = new Set<string>();
  for (const hand of state.hands) {
    for (const win of hand.wins) {
      if (win.winnerSeat === seat) for (const y of win.yakus) won.add(y.yaku);
    }
  }
  return won;
}

/**
 * Whether `yaku` is a first for someone who has won with `before`. Dora and
 * their kin are not yaku and are never new; with no history known, nothing is.
 */
export const isNewYaku = (yaku: string, before: ReadonlySet<string> | null): boolean =>
  before !== null && !PSEUDO_YAKU.has(yaku) && !before.has(yaku);

/**
 * One request per player per match, however often the win menu is opened.
 * Keyed by the match too, so the next match on the same page load asks again
 * and sees the one just finished.
 */
const fromServer = new Map<string, Promise<ReadonlySet<string> | null>>();

function serverYakus(matchId: string, playerId: string, name: string): Promise<ReadonlySet<string> | null> {
  const key = `${matchId}:${playerId}`;
  let pending = fromServer.get(key);
  if (!pending) {
    // The cached list has the current name, should they have been renamed since
    // the match began; the slug is made from it, as the server makes it.
    const current = cachedPlayers().find((p) => p.id === playerId)?.displayName ?? name;
    pending = fetchStats(slugOf(current), 4).then((r) => {
      if (r.kind !== 'ok' || r.value.player.id !== playerId) {
        fromServer.delete(key);   // try again next time
        return null;
      }
      return new Set(r.value.yakus.map((y) => y.yaku));
    });
    fromServer.set(key, pending);
  }
  return pending;
}

/**
 * For each seat, every yaku that player had won with before this hand, or
 * null while that is unknown (a guest, no server, still loading).
 */
export function useYakusWonBefore(state: MatchState): (seat: Seat) => ReadonlySet<string> | null {
  const [server, setServer] = useState<Partial<Record<Seat, ReadonlySet<string>>>>({});

  const tiktok = state.config.tiktok;
  useEffect(() => {
    if (tiktok) return;
    let cancelled = false;
    state.config.seats.forEach((p, i) => {
      if (p.playerId === null) return;
      void serverYakus(state.id, p.playerId, p.name).then((set) => {
        if (!cancelled && set) setServer((s) => ({ ...s, [i]: set }));
      });
    });
    return () => { cancelled = true; };
  }, [state.id, state.config.seats, tiktok]);

  return (seat) => {
    // A Tiktok win never reaches the stats a first is measured against.
    if (tiktok) return null;
    const known = server[seat];
    if (!known) return null;
    return new Set([...known, ...yakusWonInMatch(state, seat)]);
  };
}
