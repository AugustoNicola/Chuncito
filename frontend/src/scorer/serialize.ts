/**
 * TypeScript -> Prolog goal text.
 *
 * All 37 tile atoms and every functor/flag name are plain lowercase-initial
 * alphanumerics, so none of them need quoting. Meld tiles are sorted here (see
 * order.ts) because an out-of-order meld fails silently in the engine.
 */
import type { DeclaredMeld, Hand, ScoreQuery, Situation, Tile } from './types';
import { sortTiles } from './order';

const list = (items: readonly string[]): string => `[${items.join(',')}]`;

export function serializeMeld(meld: DeclaredMeld): string {
  return `${meld.kind}(${sortTiles(meld.tiles).join(',')})`;
}

export function serializeHand(hand: Hand): string {
  // Concealed tiles may be in any order; sorted anyway to keep goals stable
  // and diffable in logs and golden tests.
  return `mano(${list(sortTiles(hand.concealed))},${list(hand.melds.map(serializeMeld))})`;
}

export function serializeSituation(s: Situation): string {
  return `situacion(${s.roundWind},${s.seatWind},${list(sortTiles(s.dora))},` +
    `${list(sortTiles(s.uraDora))},${list(s.flags)})`;
}

/**
 * The bare `resultadoDeVictoria/6` goal, with `R` as the output variable. The
 * rules are always passed, as `[]` when there are none -- `/5` is the same
 * thing upstream, so there is one shape of query rather than two.
 */
export function serializeQuery(q: ScoreQuery, outVar = 'R'): string {
  return `resultadoDeVictoria(${serializeHand(q.hand)},${q.winningTile},` +
    `${q.mode},${serializeSituation(q.situation)},[${(q.rules ?? []).join(',')}],${outVar})`;
}

/**
 * Wraps the goal so a *failure* (non-winning hand, or a win with no yaku) comes
 * back as data rather than an absent solution. The engine is semidet and failure
 * is a normal outcome, so the query itself must always succeed.
 */
export function serializeScoreGoal(q: ScoreQuery): string {
  return `( ${serializeQuery(q)} -> with_output_to(string(S), write_canonical(R)) ; S = "fail" )`;
}

export const tileAtom = (t: Tile): string => t;
