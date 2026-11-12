/**
 * The match so far, hand by hand.
 *
 * This is `hands ORDER BY seq` and nothing else -- the same read the review
 * screen will do against the server in Phase 4, which is the point of the
 * timeline being a plain list of rows rather than a fold over events.
 */
import type { HandRow, MatchState, SeatPlayer, Standing, WinRow } from './matchState';
import type { KeyboardEvent } from 'react';
import { PlayerName } from '../players/PlayerName';
import { HandReview, type Reviewed, reviewable, useHandReview } from './HandReview';
import { standingsOverTime, topLevel } from './matchState';
import { StandingsChart } from './StandingsChart';
import { durationLabel, handDurations } from './duration';
import { levelName, levelTier, yakuName } from '../hand/yakuNames';
import { HandSummary } from '../hand/HandDisplay';
import { YakuDoraMark } from '../hand/ScoreResultView';
import { type YakuDora, wallOfRow, wonAfterRiichi, yakuDoraKind } from './yakuWall';
import { decodeHandTiles } from '../hand/handTiles';
import { PSEUDO_YAKU } from '../../scorer/types';
import type { Seat } from './seats';
import { roundLabel, seatsOf } from './seats';

const OUTCOME_LABEL: Record<HandRow['outcome'], string> = {
  tsumo: 'tsumo',
  ron: 'ron',
  exhaustive_draw: 'Exhaustive draw',
  abortive_draw: 'Abortive draw',
  nagashi_mangan: 'Nagashi mangan',
};

export function headline(row: HandRow, names: readonly string[]): string {
  const winners = row.wins.map((w) => names[w.winnerSeat]).join(' and ');
  switch (row.outcome) {
    case 'ron':
      return `${winners} ron off ${names[row.dealInSeat ?? 0]}`;
    case 'tsumo':
      return `${winners} tsumo`;
    case 'nagashi_mangan':
      return `${winners} — nagashi mangan`;
    default:
      return OUTCOME_LABEL[row.outcome];
  }
}

/** One winner's value line. A double ron shows one of these per winner. */
function WinLine({ win, names, showName, sanma, wall }: {
  win: WinRow; names: readonly string[]; showName: boolean; sanma: boolean;
  /** A Tiktok hand's wall; null otherwise. */
  wall: YakuDora | null;
}) {
  const real = win.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const level = win.level && win.level !== 'sinNombre' ? levelName(win.level) : null;

  return (
    <div className="timeline__win">
      <div className="timeline__value">
        {showName && <span className="timeline__winner">{names[win.winnerSeat]}</span>}
        {win.han !== null && (
          <span>{win.han} han{win.fu ? ` · ${win.fu} fu` : ''}</span>
        )}
        {level && <span className="timeline__level" data-tier={levelTier(win.level!)}>{level}</span>}
        {win.pointsWon !== null && (
          <span className="timeline__points">{win.pointsWon.toLocaleString()}</span>
        )}
        {win.isManual && <span className="timeline__manual" title="Value typed in">manual</span>}
      </div>
      {real.length > 0 && (
        <div className="timeline__yakus">
          {real.map((y) => {
            const kind = yakuDoraKind(y.yaku, wall, wonAfterRiichi(win));
            return (
              <span key={y.yaku} className="timeline__yaku">
                {yakuName(y.yaku)}
                {kind && <YakuDoraMark kind={kind} />}
              </span>
            );
          })}
        </div>
      )}
      {/* This is what `hand_tiles` is stored for -- reviewing the hand, and one
          day re-scoring it. */}
      {win.handTiles && <HandSummary state={decodeHandTiles(win.handTiles, sanma)} />}
    </div>
  );
}

/**
 * Which palette an entry wears.
 *
 * A limit hand is worth spotting while scrolling, so it carries its tier's
 * colour; a double ron takes its best hand's. Draws share a red one -- they are
 * the other thing you scan for, and they are not a limit of anything.
 */
function tierOf(row: HandRow): string | undefined {
  if (row.outcome === 'exhaustive_draw' || row.outcome === 'abortive_draw') return 'draw';
  const level = topLevel(row.wins);
  if (!level || level === 'sinNombre') return undefined;
  return levelTier(level);
}

/** Everyone on the same score: no place means anything yet. */
const level = (standing: Standing): boolean =>
  standing.scores.every((score) => score === standing.scores[0]);

function HandEntry({ row, after, duration, names, seats, sanma, onReview }: {
  row: HandRow;
  /** How long the hand took, in ms; null when it was not timed. */
  duration: number | null;
  /** The standings once this hand (and anything adjusted after it) was in. */
  after: Standing | undefined;
  names: readonly string[]; seats: readonly SeatPlayer[]; sanma: boolean;
  /** Opens the hand's score, for a hand somebody won. */
  onReview?: () => void;
}) {
  // The whole box opens the hand.
  const open = onReview && reviewable(row) ? onReview : undefined;
  return (
    <li className={`timeline__hand${open ? ' timeline__hand--open' : ''}`} data-tier={tierOf(row)}
        {...(open ? {
          role: 'button', tabIndex: 0, 'aria-label': `Review ${headline(row, names)}`,
          onClick: open,
          onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
        } : {})}>
      <div className="timeline__head">
        <span className="timeline__round">
          {roundLabel({ wind: row.roundWind, number: row.roundNumber })}
          {row.honba > 0 && <span className="timeline__honba">+{row.honba}</span>}
        </span>
        <span className="timeline__what">{headline(row, names)}</span>
        {duration !== null && (
          <span className="timeline__duration" title="How long the hand took">{durationLabel(duration)}</span>
        )}
      </div>

      {row.wins.map((win) => (
        <WinLine key={win.winnerSeat} win={win} names={names}
                 showName={row.wins.length > 1} sanma={sanma} wall={wallOfRow(row)} />
      ))}

      {/* The wall as it stood when the hand ended. The ura only once a
          riichi winner has turned them over, as at the table. */}
      {row.yakuDora.length > 0 && (
        <div className="timeline__wall">
          <span className="timeline__walllabel">Yaku dora</span>
          <span>{row.yakuDora.map(yakuName).join(' · ')}</span>
          {row.wins.some(wonAfterRiichi) && (
            <>
              <span className="timeline__walllabel">Ura</span>
              <span>{row.yakuUra.map(yakuName).join(' · ')}</span>
            </>
          )}
        </div>
      )}

      {/* Everyone after the hand: the name in the colour of their place
          (gold, silver, bronze; none while the table is level), a chevron
          for whether this hand won or lost them points, and their total. */}
      <div className="timeline__deltas">
        {seatsOf(sanma ? 3 : 4).map((seat) => {
          const delta = row.scoreDelta[seat];
          const total = after?.scores[seat];
          return (
            <span key={seat} className="timeline__delta">
              <span className="timeline__seatname"
                    data-place={after && !level(after) ? after.places[seat] : undefined}>
                {/* Plain text, never a link: the whole box opens the hand. */}
                <span>{seats[seat]!.name}</span>
                {delta !== 0 && (
                  <span className={delta > 0 ? 'timeline__move timeline__move--up' : 'timeline__move timeline__move--down'}
                        aria-label={`${delta > 0 ? 'won' : 'lost'} ${Math.abs(delta).toLocaleString()}`}>
                    {delta > 0 ? '▲' : '▼'}
                  </span>
                )}
              </span>
              {total !== undefined && (
                <span className={`timeline__total${total < 0 ? ' timeline__total--negative' : ''}`}>
                  {total.toLocaleString()}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {(row.riichiSeats.length > 0 || row.tenpaiSeats.length > 0) && (
        <div className="timeline__tags">
          {row.riichiSeats.map((s: Seat) => (
            <span key={`r${s}`} className="timeline__tag timeline__tag--riichi">
              {names[s]} riichi
            </span>
          ))}
          {row.tenpaiSeats.map((s: Seat) => (
            <span key={`t${s}`} className="timeline__tag">{names[s]} tenpai</span>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * The hands, and any manual adjustments. At the table you are almost always
 * checking the last hand, so a match in progress reads newest first. A
 * finished one is read as a story, East 1 down to the last hand -- which is
 * how the history shows it too.
 */
/** `linkPlayers` in a match review; never during the match itself. */
export function TimelineList({ state, linkPlayers = false, onReview }: {
  state: MatchState; linkPlayers?: boolean;
  /** Opens a won hand's score (`HandReview`), wherever the page keeps it. */
  onReview?: (r: Reviewed) => void;
}) {
  const names = state.config.seats.map((p) => p.name);
  const rows = state.status === 'finished' ? state.hands : [...state.hands].reverse();
  const over = standingsOverTime(state);
  /** Entry 0 is the start, so a hand's standings are one along from its index. */
  const afterOf = new Map(state.hands.map((row, i) => [row.clientUuid, over[i + 1]]));
  const durations = handDurations(state);
  const durationOf = new Map(state.hands.map((row, i) => [row.clientUuid, durations[i] ?? null]));

  return (
    <>
      {/* Always left to right from the start, whichever way the list runs. */}
      {rows.length > 0 && <StandingsChart state={state} over={over} />}
      {rows.length === 0 ? (
        <p className="timeline__empty">No hands recorded yet.</p>
      ) : (
        <ol className="timeline">
          {rows.map((row) => <HandEntry key={row.clientUuid} row={row} after={afterOf.get(row.clientUuid)}
                                            duration={durationOf.get(row.clientUuid) ?? null} names={names}
                                            seats={state.config.seats}
                                            sanma={state.config.players === 3}
                                            onReview={onReview && (() => onReview({ seq: row.seq }))} />)}
        </ol>
      )}

      {state.adjustments.length > 0 && (
        <div className="timeline__adjustments">
          <span className="field__label">Manual adjustments</span>
          {state.adjustments.map((adj) => (
            <div key={adj.clientUuid} className="timeline__adjustment">
              <span><PlayerName seat={state.config.seats[adj.seat]!} link={linkPlayers} /></span>
              <span className={adj.delta < 0 ? 'timeline__loss' : 'timeline__gain'}>
                {adj.delta > 0 ? '+' : ''}{adj.delta.toLocaleString()}
              </span>
              {adj.note && <span className="timeline__note">{adj.note}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function TimelineView({ state, onClose }: { state: MatchState; onClose: () => void }) {
  // Inside the match: the review is the timeline's own state, not the address.
  const review = useHandReview(true);
  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Back</button>
        <h1 className="app__title">Timeline</h1>
        <span className="app__barspacer" />
      </header>

      <TimelineList state={state} onReview={review.open} />
      {review.reviewed && <HandReview state={state} reviewed={review.reviewed} onBack={review.close} />}
    </div>
  );
}
