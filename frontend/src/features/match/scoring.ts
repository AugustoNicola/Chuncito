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
 *
 * Sanma uses the same payment table. A `Payment` is what each *payer* owes, so
 * it means the same thing at either table; what changes is how many payers a
 * tsumo has. With the fourth seat gone, a non-dealer tsumo collects from the
 * dealer and one non-dealer only -- 1000 is 500 + 300 = 800, not 1100. That
 * "tsumo loss" falls out of paying the seats that exist, and `paymentTotal`
 * has to be told the player count to report it.
 */
import type { Level, Payment, WinMode } from '../../scorer/types';
import type { PlayerCount, Seat } from './seats';
import { seatsOf, turnDistance } from './seats';

/** Payments round up to the nearest 100. */
export const ceil100 = (points: number): number => Math.ceil(points / 100) * 100;

/**
 * Points paid per honba stick.
 *
 * Four players: 300 on a ron, 100 from each payer on a tsumo. This group plays
 * sanma honba at 1000 -- 1000 on a ron, 500 from each of the two payers on a
 * tsumo -- so the counter is worth chasing with one player fewer to pay it.
 */
export const HONBA: Readonly<Record<PlayerCount, { ron: number; tsumoEach: number }>> = {
  4: { ron: 300, tsumoEach: 100 },
  3: { ron: 1000, tsumoEach: 500 },
};

/** A riichi declaration costs 1000, which becomes a stick on the table. */
export const RIICHI_STICK = 1000;

/**
 * Total paid out at an exhaustive draw, split between tenpai and noten players.
 * The same 3000 at either table; in sanma it is simply split three ways.
 */
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

/**
 * The headline number: everything the winner takes from the table, sticks
 * aside. A tsumo counts one payment per opponent, so sanma comes out smaller.
 */
export function paymentTotal(payment: Payment, players: PlayerCount): number {
  switch (payment.kind) {
    case 'ron': return payment.total;
    case 'tsumoDealer': return payment.each * (players - 1);
    case 'tsumo': return payment.nonDealer * (players - 2) + payment.dealer;
  }
}

/**
 * Whether a han/fu pair is reachable at all, for disabling the manual pickers.
 *
 * Only the two special fu values constrain anything; 30 fu and up are open at
 * every han. Both depend on how the hand was won:
 *
 * - **20 fu is pinfu**, and its only tsumo form is pinfu plus menzen tsumo, so
 *   two han is the floor. On a ron it cannot happen at all: a closed ron adds
 *   the ten-point menzen bonus, and an open all-runs hand is scored as 30 fu.
 * - **25 fu is chiitoitsu**, which is two han closed. A tsumo adds menzen tsumo
 *   on top, so three is the floor there.
 */
export function hanFuPossible(han: number, fu: number, mode: WinMode): boolean {
  if (fu === 20) return mode === 'tsumo' && han >= 2;
  if (fu === 25) return han >= (mode === 'tsumo' ? 3 : 2);
  return true;
}

/**
 * One number per seat in play: four entries, or three in sanma.
 *
 * Typed as indexable by any `Seat` so that `delta[seat]` reads as a number, but
 * only the seats of the match are ever present -- iterate with `seatsOf`, never
 * over all four.
 */
export type Delta = number[] & Record<Seat, number>;

export const zeroDelta = (players: PlayerCount): Delta =>
  Array<number>(players).fill(0) as Delta;

/** A per-seat array built from a function of the seat. */
export const deltaOf = (players: PlayerCount, f: (seat: Seat) => number): Delta =>
  seatsOf(players).map(f) as Delta;

/** One winner of a hand, with the payment their hand earns. */
export interface WinPayment {
  winner: Seat;
  payment: Payment;
}

/**
 * The riichi sticks a hand puts down are part of that hand's delta, not of some
 * earlier state change, so that replaying the deltas from the starting score
 * reproduces the table exactly. `potBefore` counts them too -- the winner
 * collects the whole table, including sticks laid moments earlier.
 */
function payRiichi(delta: Delta, riichiSeats: readonly Seat[]): void {
  for (const seat of riichiSeats) delta[seat] -= RIICHI_STICK;
}

/**
 * Per-seat point change for a tsumo. Only the seats in play pay, which is all
 * the tsumo loss in sanma amounts to.
 */
export function tsumoDelta(args: {
  players: PlayerCount;
  winner: Seat;
  dealer: Seat;
  payment: Payment;
  honba: number;
  potBefore: number;
  riichiSeats: readonly Seat[];
}): Delta {
  const { players, winner, dealer, payment, honba, potBefore, riichiSeats } = args;
  if (payment.kind === 'ron') throw new Error('a tsumo cannot carry a ron payment');
  const delta = zeroDelta(players);
  const honbaEach = HONBA[players].tsumoEach * honba;

  for (const seat of seatsOf(players)) {
    if (seat === winner) continue;
    const owed = payment.kind === 'tsumoDealer'
      ? payment.each
      : (seat === dealer ? payment.dealer : payment.nonDealer);
    delta[seat] -= owed + honbaEach;
    delta[winner] += owed + honbaEach;
  }

  delta[winner] += potBefore * RIICHI_STICK;
  payRiichi(delta, riichiSeats);
  return delta;
}

/**
 * Per-seat point change for a ron -- possibly several at once.
 *
 * This ruleset allows multiple ron rather than treating them as an abortive
 * draw, so the discarder pays every winner. Two things then have to be settled
 * between winners, and both go by turn order from the discarder:
 *
 * - The **honba** is paid once, to the nearest winner.
 * - The **riichi pot** is split evenly, and a stick that will not divide goes
 *   to the nearest winner as well.
 */
export function ronDelta(args: {
  players: PlayerCount;
  dealIn: Seat;
  wins: readonly WinPayment[];
  honba: number;
  potBefore: number;
  riichiSeats: readonly Seat[];
}): Delta {
  const { players, dealIn, wins, honba, potBefore, riichiSeats } = args;
  if (wins.length === 0) throw new Error('a ron needs at least one winner');
  const delta = zeroDelta(players);

  for (const win of wins) {
    if (win.payment.kind !== 'ron') throw new Error('a ron needs a ron payment');
    delta[win.winner] += win.payment.total;
    delta[dealIn] -= win.payment.total;
  }

  const [nearest] = [...wins].sort(
    (a, b) => turnDistance(dealIn, a.winner, players) - turnDistance(dealIn, b.winner, players),
  );
  const honbaPaid = HONBA[players].ron * honba;
  delta[nearest!.winner] += honbaPaid;
  delta[dealIn] -= honbaPaid;

  const each = Math.floor(potBefore / wins.length);
  for (const win of wins) delta[win.winner] += each * RIICHI_STICK;
  delta[nearest!.winner] += (potBefore % wins.length) * RIICHI_STICK;

  payRiichi(delta, riichiSeats);
  return delta;
}

/**
 * Per-seat point change at an exhaustive draw.
 *
 * 3000 moves from the noten players to the tenpai ones, split evenly on each
 * side. Nobody pays when everyone or no-one is tenpai. Riichi sticks stay on the
 * table, so they are not collected here -- but the ones declared this hand are
 * still part of this hand's delta.
 *
 * In sanma the same 3000 splits three ways: one tenpai takes 3000 at 1500 from
 * each of the others, two tenpai take 1500 each from the one who is not.
 */
export function drawDelta(
  players: PlayerCount, tenpai: readonly Seat[], riichiSeats: readonly Seat[],
): Delta {
  const delta = zeroDelta(players);
  const count = tenpai.length;
  if (count > 0 && count < players) {
    const gain = NOTEN_PENALTY_TOTAL / count;
    const loss = NOTEN_PENALTY_TOTAL / (players - count);
    for (const seat of seatsOf(players)) {
      delta[seat] += tenpai.includes(seat) ? gain : -loss;
    }
  }
  payRiichi(delta, riichiSeats);
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
  players: PlayerCount;
  winner: Seat;
  dealer: Seat;
  honba: number;
  riichiSeats: readonly Seat[];
}): Delta {
  const { players, winner, dealer, honba, riichiSeats } = args;
  return tsumoDelta({
    players,
    winner,
    dealer,
    payment: paymentFor(LIMIT_BASE.mangan!, winner === dealer, 'tsumo'),
    honba,
    potBefore: 0,
    riichiSeats,
  });
}

export interface Placement {
  seat: Seat;
  /** 1st through 4th, or 3rd in sanma. */
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
  const seats = seatsOf(scores.length as PlayerCount);
  const ordered = [...seats].sort((a, b) => scores[b] - scores[a] || a - b);
  return ordered.map((seat, index) => ({
    seat,
    place: (index + 1) as 1 | 2 | 3 | 4,
    score: scores[seat],
    umaPoints: uma[index] ?? 0,
  }));
}

/** "1st", "2nd", ... -- a place as the table says it. */
export const placeLabel = (place: number): string =>
  `${place}${['st', 'nd', 'rd'][place - 1] ?? 'th'}`;

/**
 * Each seat's place right now, indexed by seat.
 *
 * The same ordering as the final standings, ties included, so the place a box
 * shows at the last hand is the place the end screen gives. Null while every
 * score is level: at the start of a match the seat-order tiebreak would rank
 * four identical scores 1st to 4th, which reads as information and is not.
 */
export function placesOf(scores: Delta): number[] | null {
  if (scores.every((score) => score === scores[0])) return null;
  const places: number[] = [];
  for (const p of placements(scores, [])) places[p.seat] = p.place;
  return places;
}
