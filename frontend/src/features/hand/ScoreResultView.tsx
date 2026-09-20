/**
 * The score screen: yaku list, then the totals, themed by limit hand.
 *
 * dora / akaDora / uraDora are separated from real yaku, matching how the engine
 * already sorts them and how online clients present them.
 */
import type { Payment, ScoreResult } from '../../scorer/types';
import { PSEUDO_YAKU } from '../../scorer/types';
import { paymentTotal } from '../../scorer/decode';
import { isYakumanLevel, levelColorVar, levelName, yakuName } from './yakuNames';

function paymentLine(payment: Payment): string {
  switch (payment.kind) {
    case 'ron': return `${payment.total.toLocaleString()} from the discarder`;
    case 'tsumoDealer': return `${payment.each.toLocaleString()} all`;
    case 'tsumo':
      return `${payment.nonDealer.toLocaleString()} / ${payment.dealer.toLocaleString()}`;
  }
}

export function ScoreResultView({ result, onBack }: { result: ScoreResult; onBack: () => void }) {
  const real = result.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const extras = result.yakus.filter((y) => PSEUDO_YAKU.has(y.yaku));
  const title = levelName(result.level);
  const color = levelColorVar(result.level);

  return (
    <div className="score" style={{ ['--limit' as string]: color }}>
      <div className="score__yakus">
        {real.map((y) => (
          <div className="score__yaku" key={y.yaku}>
            <span>{yakuName(y.yaku)}</span>
            <span className="score__han">{y.han}</span>
          </div>
        ))}
        {extras.length > 0 && <div className="score__divider" />}
        {extras.map((y) => (
          <div className="score__yaku score__yaku--extra" key={y.yaku}>
            <span>{yakuName(y.yaku)}</span>
            <span className="score__han">{y.han}</span>
          </div>
        ))}
      </div>

      {title && (
        <div className={`score__title${isYakumanLevel(result.level) ? ' score__title--yakuman' : ''}`}>
          {title}
        </div>
      )}

      <div className="score__totals">
        <span className="score__hanfu">
          {result.han} han
          {/* Fu is 0 whenever a yakuman applies, so showing it would be noise. */}
          {result.fu > 0 && ` · ${result.fu} fu`}
        </span>
        <span className="score__points">{paymentTotal(result.payment).toLocaleString()}</span>
        <span className="score__breakdown">{paymentLine(result.payment)}</span>
      </div>

      <button type="button" className="btn btn--wide" onClick={onBack}>Back to the hand</button>
    </div>
  );
}
