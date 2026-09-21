/**
 * Riichi point arithmetic: base points, payments, honba, sticks, noten penalties
 * and placement.
 *
 * Kept apart from the reducer because two very different callers need it. When a
 * hand is scored by the engine the *payment* arrives already computed
 * (`pago/1`, `pagoTsumo/2`, ...) and is used verbatim -- it is authoritative,
 * and it already handles yakuman multipliers the client does not model. When a
 * hand is typed in by hand ("3 han 50 fu", "haneman") there is no engine result,
 * so the same numbers have to be derived here.
 *
 * Both paths converge on a `Payment`, and everything downstream -- honba, the
 * riichi pot, the per-seat delta -- is computed once from that.
 */
import type { Level, Payment, WinMode } from '../../scorer/types';
import type { Seat } from './seats';
import { SEATS } from './seats';

/** Payments round up to the nearest 100. */
export const ceil100 = (points: number): number => Math.ceil(points / 100) * 100;

/** Points a player pays per honba stick: 300 on a ron, 100 each on a tsumo. */
export const HONBA_RON = 300;
export const HONBA_TSUMO_EACH = 100;

/** A riichi declaration costs 1000, which becomes a stick on the table. */
export const RIICHI_STICK = 1000;

/** Total paid out at an exhaustive draw, split between tenpai and noten players. */
export const NOTEN_PENALTY_TOTAL = 3000;

/**
 * Base points before the dealer/ron multiplier.
 *
 * The limits are checked by han before the fu formula, because the formula
 * overflows well past mangan at high han and the named limits are flat.
 *
 * No kiriage mangan: 4 han 30 fu is 1920 base (7700 ron), not a mangan. That is
 * a house rule and this group does not use it.
 */
export function basePoints(han: number, fu: number): number {
  if (han >= 13) return 8000;   // kazoe yakuman
  if (han >= 11) return 6000;   // sanbaiman
  if (han >= 8) return 4000;    // baiman
  if (han >= 6) return 3000;    // haneman
  if (han >= 5) return 2000;    // mangan
  return Math.min(fu * 2 ** (2 + han), 2000);
}

/** Base points for a hand entered as a limit name rather than han and fu. */
export const LIMIT_BASE: Readonly<Record<string, number>> = {
  mangan: 2000,
  haneman: 3000,
  baiman: 4000,
  sanbaiman: 6000,
  kazoeYakuman: 8000,
  yakuman: 8000,
  dobleYakuman: 16000,
  tripleYakuman: 24000,
};

/** The level a han/fu pair lands in, spelled as the engine spells it. */
export function levelFor(han: number, fu: number): Level {
  if (han >= 13) return 'kazoeYakuman';
  if (han >= 11) return 'sanbaiman';
  if (han >= 8) return 'baiman';
  if (han >= 6) return 'haneman';
  if (han >= 5) return 'mangan';
  return fu * 2 ** (2 + han) >= 2000 ? 'mangan' : 'sinNombre';
}

/**
 * What the winner collects, before honba and sticks.
 *
 * Only used for manually entered hands; an engine-scored hand brings its own.
 */
export function paymentFor(base: number, isDealer: boolean, mode: WinMode): Payment {
  if (mode === 'ron') {
    return { kind: 'ron', total: ceil100(base * (isDealer ? 6 : 4)) };
  }
  if (isDealer) {
    return { kind: 'tsumoDealer', each: ceil100(base * 2) };
  }
  return { kind: 'tsumo', nonDealer: ceil100(base), dealer: ceil100(base * 2) };
}

/**
 * Base points behind a scored result.
 *
 * The engine returns a payment, not a base, so this recovers it. Going through
 * the level first matters for the yakuman variants: `dobleYakuman` is 26 han,
 * and the han formula would flatten it back to a single yakuman's 8000.
 */
export function baseFromResult(level: Level, han: number, fu: number): number {
  return LIMIT_BASE[level] ?? basePoints(han, fu);
}

/** The headline number: everything the winner takes from the table, sticks aside. */
export function paymentTotal(payment: Payment): number {
  switch (payment.kind) {
    case 'ron': return payment.total;
    case 'tsumoDealer': return payment.each * 3;
    case 'tsumo': return payment.nonDealer * 2 + payment.dealer;
  }
}

export type Delta = [number, number, number, number];

export const zeroDelta = (): Delta => [0, 0, 0, 0];

/**
 * Per-seat point change for a win.
 *
 * `riichiSeats` are the players who declared *this* hand: their 1000 is part of
 * this hand's delta, not of some earlier state change, so that replaying the
 * deltas from the starting score reproduces the table exactly.
 *
 * `potBefore` therefore counts those sticks too -- the winner collects the whole
 * table, including sticks put down moments earlier.
 */
export function winDelta(args: {
  winner: Seat;
  dealer: Seat;
  dealIn: Seat | null;
  payment: Payment;
  honba: number;
  potBefore: number;
  riichiSeats: readonly Seat[];
}): Delta {
  const { winner, dealer, dealIn, payment, honba, potBefore, riichiSeats } = args;
  const delta = zeroDelta();

  if (payment.kind === 'ron') {
    if (dealIn === null) throw new Error('a ron needs a deal-in seat');
    const paid = payment.total + HONBA_RON * honba;
    delta[dealIn] -= paid;
    delta[winner] += paid;
  } else {
    const honbaEach = HONBA_TSUMO_EACH * honba;
    for (const seat of SEATS) {
      if (seat === winner) continue;
      const owed = payment.kind === 'tsumoDealer'
        ? payment.each
        : (seat === dealer ? payment.dealer : payment.nonDealer);
      delta[seat] -= owed + honbaEach;
      delta[winner] += owed + honbaEach;
    }
  }

  delta[winner] += potBefore * RIICHI_STICK;
  for (const seat of riichiSeats) delta[seat] -= RIICHI_STICK;
  return delta;
}

/**
 * Per-seat point change at an exhaustive draw.
 *
 * 3000 moves from the noten players to the tenpai ones, split evenly on each
 * side. Nobody pays when everyone or no-one is tenpai. Riichi sticks stay on the
 * table, so they are not collected here -- but the ones declared this hand are
 * still part of this hand's delta.
 */
export function drawDelta(tenpai: readonly Seat[], riichiSeats: readonly Seat[]): Delta {
  const delta = zeroDelta();
  const count = tenpai.length;
  if (count > 0 && count < 4) {
    const gain = NOTEN_PENALTY_TOTAL / count;
    const loss = NOTEN_PENALTY_TOTAL / (4 - count);
    for (const seat of SEATS) {
      delta[seat] += tenpai.includes(seat) ? gain : -loss;
    }
  }
  for (const seat of riichiSeats) delta[seat] -= RIICHI_STICK;
  return delta;
}

/**
 * Per-seat change for a nagashi mangan: the player whose discards were all
 * terminals and honours collects a mangan, paid as a tsumo.
 *
 * It is still a draw, so the riichi sticks stay on the table rather than being
 * collected. Honba is paid, on the reading that it pays *as* a mangan tsumo.
 */
export function nagashiDelta(args: {
  winner: Seat;
  dealer: Seat;
  honba: number;
  riichiSeats: readonly Seat[];
}): Delta {
  const { winner, dealer, honba, riichiSeats } = args;
  return winDelta({
    winner,
    dealer,
    dealIn: null,
    payment: paymentFor(LIMIT_BASE.mangan!, winner === dealer, 'tsumo'),
    honba,
    potBefore: 0,
    riichiSeats,
  });
}

export interface Placement {
  seat: Seat;
  /** 1st through 4th. */
  place: 1 | 2 | 3 | 4;
  score: number;
  umaPoints: number;
}

/**
 * Final standings.
 *
 * Ties are broken by seat order, so the player who started closer to East takes
 * the higher place -- the usual convention, and it keeps placement total.
 */
export function placements(scores: Delta, uma: readonly number[]): Placement[] {
  const ordered = [...SEATS].sort((a, b) => scores[b] - scores[a] || a - b);
  return ordered.map((seat, index) => ({
    seat,
    place: (index + 1) as 1 | 2 | 3 | 4,
    score: scores[seat],
    umaPoints: uma[index] ?? 0,
  }));
}
