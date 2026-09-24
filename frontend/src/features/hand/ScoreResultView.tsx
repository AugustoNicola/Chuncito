/**
 * The score screen: yaku list, then the totals, themed by limit hand.
 *
 * dora / akaDora / uraDora are separated from real yaku, matching how the engine
 * already sorts them and how online clients present them.
 */
import type { Payment, ScoreResult } from '../../scorer/types';
import { PSEUDO_YAKU } from '../../scorer/types';
import { paymentTotal } from '../match/scoring';
import { fuPartName, isYakumanLevel, levelName, levelTier, yakuName } from './yakuNames';
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

/**
 * Said out loud on a sanma tsumo, since it is the one place the total differs
 * from the table everybody knows: the same hand, one payer fewer.
 */
function tsumoLoss(payment: Payment): string | null {
  switch (payment.kind) {
    case 'ron': return null;
    case 'tsumoDealer':
      return `Sanma: 2 payers, not 3 (${paymentTotal(payment, 4).toLocaleString()} at four)`;
    case 'tsumo':
      return `Sanma: dealer + 1 non-dealer (${paymentTotal(payment, 4).toLocaleString()} at four)`;
  }
}

/**
 * Who won, and on a ron who paid. The tracker knows both, so the score names
 * them; the plain calculator has nobody to name.
 */
export interface ScoreAttribution {
  winner: string;
  /** Absent on a tsumo. */
  dealIn?: string;
}

export function ScoreResultView({
  result, hand, attribution, onBack, onConfirm, confirmLabel, onAddAnother,
}: {
  result: ScoreResult;
  /** Omitted by the limit-theming preview; the score stands on its own. */
  hand?: HandState;
  attribution?: ScoreAttribution;
  onBack: () => void;
  /** Set when the score is about to be recorded against a match. */
  onConfirm?: () => void;
  confirmLabel?: string;
  /**
   * Set during a multiple ron: puts this hand aside and goes back for the next
   * winner's, instead of ending the flow here.
   */
  onAddAnother?: () => void;
}) {
  const real = result.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const extras = result.yakus.filter((y) => PSEUDO_YAKU.has(y.yaku));
  const title = levelName(result.level);
  const split = paymentSplit(result.payment);
  // The engine reads dealership straight off the seat wind.
  const seat = hand ? (hand.seatWind === 'este' ? 'Dealer' : 'Non-dealer') : null;
  const winType = hand?.winMode === 'tsumo' ? 'tsumo' : 'ron';
  const players = hand?.sanma ? 3 : 4;
  const loss = hand?.sanma ? tsumoLoss(result.payment) : null;

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
        {/* How the fu were counted: secondary to the han, so muted. None for
            a yakuman, whose fu do not count. */}
        {result.fuParts.length > 0 && <div className="score__divider" />}
        {result.fuParts.map((part, i) => (
          <div className="score__fuline" key={i}>
            <span>{fuPartName(part)}</span>
            <span className="score__fu">{part.fu} fu</span>
          </div>
        ))}
      </div>

      {title && (
        <div className={`score__title${isYakumanLevel(result.level) ? ' score__title--yakuman' : ''}`}>
          {title}
        </div>
      )}

      <div className="score__totals">
        {attribution && (
          <span className="score__who">
            <span className="score__winner">{attribution.winner}</span>
            {attribution.dealIn !== undefined
              ? <> off <span className="score__dealin">{attribution.dealIn}</span>’s discard</>
              : ', self-drawn'}
          </span>
        )}
        <span className="score__hanfu">
          {result.han} han
          {/* Fu is 0 whenever a yakuman applies, so showing it would be noise. */}
          {result.fu > 0 && ` · ${result.fu} fu`}
        </span>
        <span className="score__points">{paymentTotal(result.payment, players).toLocaleString()}</span>
        {seat && <span className="score__seat">{seat} {winType}</span>}
        {split && <span className="score__breakdown">{split}</span>}
        {loss && <span className="score__breakdown score__breakdown--note">{loss}</span>}
      </div>

      <div className="score__actions">
        <button type="button" className="btn btn--wide" onClick={onBack}>
          {onConfirm ? 'Edit the hand' : 'Back to the hand'}
        </button>
        {onAddAnother && (
          <button type="button" className="btn btn--wide" onClick={onAddAnother}>
            Add another winner on this discard
          </button>
        )}
        {onConfirm && (
          <button type="button" className="btn btn--primary btn--wide" onClick={onConfirm}>
            {confirmLabel ?? 'Record this hand'}
          </button>
        )}
      </div>
    </div>
  );
}
