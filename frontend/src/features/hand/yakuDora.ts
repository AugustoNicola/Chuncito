/**
 * Tiktok Mahjong's yaku dora: 2 han more for each revealed yaku the hand has
 * (`yakuWall.ts`).
 *
 * Added after the engine, as nukidora are, and for the same reason: the engine
 * has no input for it. It is sound for the same reasons too. The bonus is dora
 * -- han and nothing else -- on a hand the engine has already found a yaku
 * in, it never touches fu, and like any dora it is void once a yakuman
 * applies. So the level and payment are re-derived from the new han.
 *
 * The han go onto the yaku's own line rather than a line of their own, so the
 * score reads "Chun 3 han" with the 3 coloured: that is the yaku the wall
 * made worth more. Which lines got it is not stored with them; it follows
 * from the hand row's wall (`yakuDoraKind`), as it does here.
 */
import type { ScoreResult } from '../../scorer/types';
import { PSEUDO_YAKU } from '../../scorer/types';
import { basePoints, levelFor, paymentFor } from '../match/scoring';
import { YAKU_DORA_HAN, type YakuDora, yakuDoraKind } from '../match/yakuWall';
import { isYakuman } from './nukidora';

export function withYakuDora(result: ScoreResult, wall: YakuDora | null, riichi: boolean,
                             isDealer: boolean): ScoreResult {
  if (!wall || isYakuman(result.level)) return result;
  let added = 0;
  const yakus = result.yakus.map((y) => {
    if (PSEUDO_YAKU.has(y.yaku) || !yakuDoraKind(y.yaku, wall, riichi)) return y;
    added += YAKU_DORA_HAN;
    return { ...y, han: y.han + YAKU_DORA_HAN };
  });
  if (added === 0) return result;
  const han = result.han + added;
  const winMode = result.payment.kind === 'ron' ? 'ron' : 'tsumo';
  return {
    ...result,
    yakus,
    han,
    level: levelFor(han, result.fu),
    payment: paymentFor(basePoints(han, result.fu), isDealer, winMode),
  };
}
