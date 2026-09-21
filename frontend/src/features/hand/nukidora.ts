/**
 * Nukidora: the han for Norths pulled aside in sanma.
 *
 * The engine has no notion of a pulled North -- `situacion/5` has no slot for
 * one, and the tiles are no longer in the hand -- so it scores the hand without
 * them and this adds them afterwards. Logged in `docs/SCORER_GAPS.md`.
 *
 * That is sound because nukidora is dora: it adds han and nothing else. It is
 * never a yaku (a hand with only kita still has no yaku, and the engine has
 * already refused it), it does not touch fu, and like every dora it is void
 * once a yakuman applies. So the result keeps its yaku and fu, gains the han,
 * and the level and payment are re-derived from the new han through the same
 * table the manual entry uses.
 *
 * Each pulled North is worth one han as nukidora -- and, like any North, one
 * more for every dora or ura dora that is a North. Those extra han are added to
 * the existing dora lines, so `hand_yakus` counts dora the same way whether the
 * North was pulled or kept.
 */
import type { ScoreResult, YakuHan } from '../../scorer/types';
import { basePoints, levelFor, paymentFor } from '../match/scoring';
import { toSituation, type HandState } from './handState';

/** The atom for the nukidora line; client-side, since the engine never emits it. */
export const NUKIDORA = 'nukiDora';

/** Anything scored as a yakuman proper. Kazoe is han-counted and keeps its dora. */
const isYakuman = (level: string): boolean =>
  level !== 'kazoeYakuman' && /[yY]akuman$/.test(level);

/** Display order for the trailing dora lines, matching the engine's. */
const EXTRA_ORDER = ['dora', 'akaDora', NUKIDORA, 'uraDora'];

export function withNukidora(result: ScoreResult, state: HandState): ScoreResult {
  if (state.kita === 0 || isYakuman(result.level)) return result;

  const situation = toSituation(state);
  const riichi = situation.flags.includes('riichi') || situation.flags.includes('dobleRiichi');
  const doraNorths = situation.dora.filter((t) => t === 'n').length;
  const uraNorths = riichi ? situation.uraDora.filter((t) => t === 'n').length : 0;

  const extra: Record<string, number> = {
    [NUKIDORA]: state.kita,
    dora: state.kita * doraNorths,
    uraDora: state.kita * uraNorths,
  };

  const byName = new Map<string, number>(result.yakus.map((y) => [y.yaku, y.han]));
  for (const [name, han] of Object.entries(extra)) {
    if (han > 0) byName.set(name, (byName.get(name) ?? 0) + han);
  }
  const real = result.yakus.filter((y) => !EXTRA_ORDER.includes(y.yaku));
  const trailing: YakuHan[] = EXTRA_ORDER
    .filter((name) => byName.has(name))
    .map((name) => ({ yaku: name, han: byName.get(name)! }));

  const added = Object.values(extra).reduce((a, b) => a + b, 0);
  const han = result.han + added;
  // The engine reads dealership off the seat wind, so this does too.
  const isDealer = state.seatWind === 'este';

  return {
    yakus: [...real, ...trailing],
    han,
    fu: result.fu,
    level: levelFor(han, result.fu),
    payment: paymentFor(basePoints(han, result.fu), isDealer, state.winMode),
  };
}
