/**
 * The score screen: the hand, then the totals (a limit hand burning on top),
 * then the yaku list, themed by limit hand.
 *
 * dora / akaDora / uraDora are separated from real yaku, matching how the engine
 * already sorts them and how online clients present them.
 */
import type { Payment, ScoreResult } from '../../scorer/types';
import { PSEUDO_YAKU } from '../../scorer/types';
import { HONBA, type HonbaRates, honbaExtra, paymentTotal } from '../match/scoring';
import { type YakuDora, type YakuDoraKind, yakuDoraKind } from '../match/yakuWall';
import { fuPartName, isYakumanLevel, levelName, levelTier, yakuName } from './yakuNames';
import { HandSummary } from './HandDisplay';
import { Flames } from './Flames';
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
 * Who won, and on a ron who paid. The tracker knows both, so the score names
 * them; the plain calculator has nobody to name.
 */
export interface ScoreAttribution {
  winner: string;
  /** Absent on a tsumo. */
  dealIn?: string;
}

/** "NEW", in gold, beside a yaku the winner has never won with before. */
export function NewMark() {
  return <span className="yaku__new" title="The first time this player wins with it">New</span>;
}

/**
 * "DORA" or "URA" beside a yaku a Tiktok match's wall made worth 2 han more,
 * in the colour of the dora line of the same kind.
 */
export function YakuDoraMark({ kind }: { kind: YakuDoraKind }) {
  return (
    <span className="yaku__dora" data-kind={kind}
          title={kind === 'dora' ? 'A revealed yaku dora: +2 han' : 'An ura yaku, after riichi: +2 han'}>
      {kind === 'dora' ? 'Dora' : 'Ura'}
    </span>
  );
}

/**
 * The wall as it stood for this hand, under the yaku: what was face up, and
 * after a riichi what lay beneath. Said even when the hand has none of them,
 * so a win that missed one does not leave anybody wondering.
 */
export function YakuWallLine({ wall }: { wall: YakuDora & { riichi: boolean } }) {
  return (
    <div className="score__wall">
      <span className="score__walllabel">Yaku dora</span>
      <span>{wall.dora.map(yakuName).join(' · ')}</span>
      {wall.riichi && (
        <>
          <span className="score__walllabel">Ura</span>
          <span>{wall.ura.map(yakuName).join(' · ')}</span>
        </>
      )}
    </div>
  );
}

export function ScoreResultView({
  result, hand, attribution, honba = 0, honbaRates, onBack, onConfirm, confirmLabel, onAddAnother, isNewYaku,
  yakuDora,
}: {
  result: ScoreResult;
  /**
   * Honba on the table that this win collects. Only the tracker knows them;
   * the plain calculator, and a multiple ron's winner further from the
   * discarder, get none.
   */
  honba?: number;
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
  /** Marks a yaku the winner has never won with before. The tracker's only. */
  isNewYaku?: (yaku: string) => boolean;
  /** Defaults to the table's own. */
  honbaRates?: HonbaRates;
  /** A Tiktok match's wall for this hand, and whether the winner declared riichi. */
  yakuDora?: YakuDora & { riichi: boolean };
}) {
  const real = result.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const extras = result.yakus.filter((y) => PSEUDO_YAKU.has(y.yaku));
  const title = levelName(result.level);
  const split = paymentSplit(result.payment);
  // The engine reads dealership straight off the seat wind.
  const seat = hand ? (hand.seatWind === 'este' ? 'Dealer' : 'Non-dealer') : null;
  const winType = hand?.winMode === 'tsumo' ? 'tsumo' : 'ron';
  const players = hand?.sanma ? 3 : 4;
  const extra = honba > 0
    ? honbaExtra(honbaRates ?? HONBA[players], winType, honba).toLocaleString() : null;
  const doraKind = (yaku: string) =>
    (yakuDora ? yakuDoraKind(yaku, yakuDora, yakuDora.riichi) : null);

  return (
    <div className="score" data-tier={levelTier(result.level)}>
      {hand && <HandSummary state={hand} />}

      {/* The result straight under the hand, the yaku that make it after:
          a limit hand's fire is the first thing on the screen. */}
      {title && (
        // The title stands in front of its own fire; only limit hands have a
        // title, so an ordinary hand never pays for the flames.
        <div className="blaze">
          <Flames text={title} />
          <div className={`score__title${isYakumanLevel(result.level) ? ' score__title--yakuman' : ''}`}
               data-burns="">
            {title}
          </div>
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
        {/* A limit hand's total sits in a lens flare (theme.css). */}
        <span className="score__flare">
          <span className="score__points">{paymentTotal(result.payment, players).toLocaleString()}</span>
        </span>
        {seat && <span className="score__seat">{seat} {winType}</span>}
        {split && <span className="score__breakdown">{split}</span>}
        {/* Paid on top of the hand's value, not part of it: the total above
            stays the hand's, as the engine priced it. */}
        {extra && (
          <span className="score__honba">
            +{extra}{winType === 'tsumo' ? ' all' : ''} due to {honba} honba
          </span>
        )}
      </div>

      <div className="score__yakus">
        {real.map((y) => {
          const kind = doraKind(y.yaku);
          return (
            <div className="score__yaku" key={y.yaku} data-dora={kind ?? undefined}>
              <span>
                {yakuName(y.yaku)}
                {kind && <YakuDoraMark kind={kind} />}
                {isNewYaku?.(y.yaku) && <NewMark />}
              </span>
              <span className="score__han">{y.han} han</span>
            </div>
          );
        })}
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
        {yakuDora && (
          <>
            <div className="score__divider" />
            <YakuWallLine wall={yakuDora} />
          </>
        )}
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
