/** Prolog `resultado/5` term (+ its fu breakdown) -> ScoreResult. */
import { asAtom, asCompound, asInt, asList, parseTerm, TermParseError, describe, type Term } from './term';
import type { FuPart, Payment, ScoreOutcome, ScoreResult, Tile, YakuHan } from './types';

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

const FIXED_FU = new Set(['fuBase', 'menzenRon', 'tsumo', 'redondeo', 'chiitoitsu', 'pinfuTsumo', 'pinfuAbierto']);
const WAITS = new Set(['tanki', 'kanchan', 'penchan']);

function decodeSet(term: Term): { set: string; tiles: Tile[] } {
  if (term.t !== 'compound') throw new TermParseError(`expected a set, got ${describe(term)}`);
  return { set: term.name, tiles: term.args.map((a) => asAtom(a) as Tile) };
}

function decodeFuPart(term: Term): FuPart {
  const [concept, fuTerm] = asCompound(term, 'fuParte', 2);
  const fu = asInt(fuTerm!);
  if (concept!.t === 'atom' && FIXED_FU.has(concept!.name)) {
    return { concept: concept!.name as 'fuBase', fu };
  }
  if (concept!.t === 'compound' && concept!.args.length === 1) {
    const arg = concept!.args[0]!;
    switch (concept!.name) {
      case 'juego': return { concept: 'juego', ...decodeSet(arg), fu };
      case 'juegoCompletadoPorRon': return { concept: 'juegoCompletadoPorRon', ...decodeSet(arg), fu };
      case 'par': return { concept: 'par', tile: asAtom(arg) as Tile, fu };
      case 'espera': {
        const wait = asAtom(arg);
        if (WAITS.has(wait)) return { concept: 'espera', wait: wait as 'tanki', fu };
      }
    }
  }
  throw new TermParseError(`unknown fu part ${describe(term)}`);
}

export function decodeResultTerm(term: Term, fuParts: Term = { t: 'list', items: [] }): ScoreResult {
  const [yakus, han, fu, level, payment] = asCompound(term, 'resultado', 5);
  return {
    yakus: asList(yakus!).map(decodeYaku),
    han: asInt(han!),
    fu: asInt(fu!),
    // `level` is an atom, but the yakuman tail ('4xYakuman', ...) is quoted;
    // asAtom handles both since the parser unquotes.
    level: asAtom(level!),
    payment: decodePayment(payment!),
    fuParts: asList(fuParts).map(decodeFuPart),
  };
}

/** Decodes what serializeScoreGoal produced: either "fail" or a canonical term. */
export function decodeScoreOutcome(canonical: string): ScoreOutcome {
  if (canonical === 'fail') return { ok: false, reason: 'noWinningHand' };
  const [result, fuParts] = asCompound(parseTerm(canonical), 'desglosado', 2);
  return { ok: true, result: decodeResultTerm(result!, fuParts!) };
}

/** Total points changing hands, for tracker bookkeeping. Excludes honba/sticks. */
export function paymentTotal(payment: Payment): number {
  switch (payment.kind) {
    case 'ron': return payment.total;
    case 'tsumoDealer': return payment.each * 3;
    case 'tsumo': return payment.nonDealer * 2 + payment.dealer;
  }
}
