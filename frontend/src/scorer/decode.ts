/** Prolog `resultado/5` term -> ScoreResult. */
import { asAtom, asCompound, asInt, asList, parseTerm, TermParseError, describe, type Term } from './term';
import type { Payment, ScoreOutcome, ScoreResult, YakuHan } from './types';

function decodePayment(term: Term): Payment {
  if (term.t !== 'compound') throw new TermParseError(`expected a payment term, got ${describe(term)}`);
  switch (`${term.name}/${term.args.length}`) {
    case 'pago/1':
      return { kind: 'ron', total: asInt(term.args[0]!) };
    case 'pagoTsumoDealer/1':
      return { kind: 'tsumoDealer', each: asInt(term.args[0]!) };
    case 'pagoTsumo/2':
      return { kind: 'tsumo', nonDealer: asInt(term.args[0]!), dealer: asInt(term.args[1]!) };
    default:
      throw new TermParseError(`unknown payment shape ${describe(term)}`);
  }
}

function decodeYaku(term: Term): YakuHan {
  const [name, han] = asCompound(term, 'yakuHan', 2);
  return { yaku: asAtom(name!), han: asInt(han!) };
}

export function decodeResultTerm(term: Term): ScoreResult {
  const [yakus, han, fu, level, payment] = asCompound(term, 'resultado', 5);
  return {
    yakus: asList(yakus!).map(decodeYaku),
    han: asInt(han!),
    fu: asInt(fu!),
    // `level` is an atom, but the yakuman tail ('4xYakuman', ...) is quoted;
    // asAtom handles both since the parser unquotes.
    level: asAtom(level!),
    payment: decodePayment(payment!),
  };
}

/** Decodes what serializeScoreGoal produced: either "fail" or a canonical term. */
export function decodeScoreOutcome(canonical: string): ScoreOutcome {
  if (canonical === 'fail') return { ok: false, reason: 'noWinningHand' };
  return { ok: true, result: decodeResultTerm(parseTerm(canonical)) };
}

/** Total points changing hands, for tracker bookkeeping. Excludes honba/sticks. */
export function paymentTotal(payment: Payment): number {
  switch (payment.kind) {
    case 'ron': return payment.total;
    case 'tsumoDealer': return payment.each * 3;
    case 'tsumo': return payment.nonDealer * 2 + payment.dealer;
  }
}
