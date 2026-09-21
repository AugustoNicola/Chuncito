/**
 * The score screen: yaku list, then the totals, themed by limit hand.
 *
 * dora / akaDora / uraDora are separated from real yaku, matching how the engine
 * already sorts them and how online clients present them.
 */
import type { Payment, ScoreResult } from '../../scorer/types';
import { PSEUDO_YAKU } from '../../scorer/types';
import { paymentTotal } from '../../scorer/decode';
import { isYakumanLevel, levelName, levelTier, yakuName } from './yakuNames';
import { HandSummary } from './HandDisplay';
import type { HandState } from './handState';

/**
 * How the total splits. Omitted for a ron, where "<seat> ron" already says the
 * discarder pays all of it.
 */
function paymentSplit(payment: Payment): string | null {
  switch (payment.kind) {
    case 'ron': return null;
    case 'tsumoDealer': return `${payment.each.toLocaleString()} all`;
    case 'tsumo':
      return `${payment.nonDealer.toLocaleString()} / ${payment.dealer.toLocaleString()}`;
  }
}

export function ScoreResultView({ result, hand, onBack, onConfirm, confirmLabel }: {
  result: ScoreResult;
  /** Omitted by the limit-theming preview; the score stands on its own. */
  hand?: HandState;
  onBack: () => void;
  /** Set when the score is about to be recorded against a match. */
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const real = result.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const extras = result.yakus.filter((y) => PSEUDO_YAKU.has(y.yaku));
  const title = levelName(result.level);
  const split = paymentSplit(result.payment);
  // The engine reads dealership straight off the seat wind.
  const seat = hand ? (hand.seatWind === 'este' ? 'Dealer' : 'Non-dealer') : null;
  const winType = hand?.winMode === 'tsumo' ? 'tsumo' : 'ron';

  return (
    <div className="score" data-tier={levelTier(result.level)}>
      {hand && <HandSummary state={hand} />}

      <div className="score__yakus">
        {real.map((y) => (
          <div className="score__yaku" key={y.yaku}>
            <span>{yakuName(y.yaku)}</span>
            <span className="score__han">{y.han} han</span>
          </div>
        ))}
        {extras.length > 0 && <div className="score__divider" />}
        {extras.map((y) => (
          <div className="score__yaku score__yaku--extra" data-yaku={y.yaku} key={y.yaku}>
            <span>{yakuName(y.yaku)}</span>
            <span className="score__han">{y.han} han</span>
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
        {seat && <span className="score__seat">{seat} {winType}</span>}
        {split && <span className="score__breakdown">{split}</span>}
      </div>

      <div className="score__actions">
        <button type="button" className="btn btn--wide" onClick={onBack}>
          {onConfirm ? 'Edit the hand' : 'Back to the hand'}
        </button>
        {onConfirm && (
          <button type="button" className="btn btn--primary btn--wide" onClick={onConfirm}>
            {confirmLabel ?? 'Record this hand'}
          </button>
        )}
      </div>
    </div>
  );
}
