/**
 * How a match ended: why, how long, the standings with uma, and its best hand.
 * Shared by the end screen and the history's match review, so a match reads
 * the same on the night and months later.
 */
import type { MatchState } from './matchState';
import { bestHand } from './matchState';
import type { KeyboardEvent, MouseEvent } from 'react';
import { HandSummary } from '../hand/HandDisplay';
import type { Reviewed } from './HandReview';
import { BurningWord } from '../hand/Flames';
import { decodeHandTiles } from '../hand/handTiles';
import { MP_BONUS, matchResults, mpLabel, mpOf, placeLabel, resultLabel } from './scoring';
import { levelName, levelTier } from '../hand/yakuNames';
import { roundLabel, seatWindOf } from './seats';
import { WindMark } from './WindMark';
import { durationLabel, matchDuration } from './duration';
import { PlayerName } from '../players/PlayerName';

const END_REASON: Record<string, string> = {
  final_round: 'Played to the end',
  bust: 'Ended on a bust',
  manual: 'Ended early',
};

const START = { wind: 'este', number: 1 } as const;

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/** `linkPlayers` in a match review; never on the night, inside the match. */
export function MatchOutcome({ state, linkPlayers = false, ranked = state.ranked, onReview }: {
  state: MatchState;
  linkPlayers?: boolean;
  /** Opens the best hand's score (`HandReview`), wherever the page keeps it. */
  onReview?: (r: Reviewed) => void;
  /** Whether the results are MAKApoints: the end screen's choice before it is saved. */
  ranked?: boolean;
}) {
  const standings = matchResults(state.scores, state.config);
  const best = bestHand(state);
  const hands = state.hands.length;
  const took = matchDuration(state);

  return (
    <>
      <div className="endscreen__meta">
        {state.imported ? (
          // Played without the tracker: no hands, no round, no time to show.
          <span>Entered after it was played</span>
        ) : (
          <>
            <span>{END_REASON[state.endReason ?? ''] ?? 'Finished'}</span>
            <span>·</span>
            <span>{hands} hand{hands === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{roundLabel(state.round)}</span>
            {took !== null && <><span>·</span><span className="endscreen__duration">{durationLabel(took)}</span></>}
          </>
        )}
      </div>

      <ol className="standings">
        {standings.map((p) => (
          <li key={p.seat} className="standings__row" data-place={p.place}>
            <span className="standings__place">{placeLabel(p.place)}</span>
            {/* The wind each player started the match on: the seat, as it was
                drawn, rather than wherever the deal had got to by the end. */}
            <span className="standings__name">
              <WindMark wind={seatWindOf(p.seat, START, state.config.players)} />
              <PlayerName seat={state.config.seats[p.seat]!} link={linkPlayers} />
            </span>
            <span className={`standings__score${p.score < 0 ? ' standings__score--negative' : ''}`}>
              {p.score.toLocaleString()}
            </span>
            <span className={`standings__uma${(ranked ? mpOf(p) : p.total) < 0 ? ' standings__uma--negative' : ''}`}>
              {/* A ranked match's results are MAKApoints, bonus included, and say so. */}
              {ranked ? mpLabel(mpOf(p)) : resultLabel(p.total)}
            </span>
            {/* The working, so the result can be checked at the table. */}
            <span className="standings__working">
              {resultLabel(p.vsTarget)} vs target · {signed(p.umaPoints)} uma
              {p.oka !== 0 && ` · ${resultLabel(p.oka)} oka`}
              {ranked && ` · ${resultLabel(MP_BONUS)} bonus`}
            </span>
          </li>
        ))}
      </ol>

      {best && (
        <div className={`endscreen__best${onReview ? ' endscreen__best--link' : ''}`}
             data-tier={levelTier(best.win.level!)}
             {...(onReview ? {
               role: 'button', tabIndex: 0, 'aria-label': 'Review the best hand',
               // A player's name is a link of its own.
               onClick: (e: MouseEvent) => {
                 if (!(e.target as Element).closest('a')) onReview({ seq: best.seq, winner: best.seat });
               },
               onKeyDown: (e: KeyboardEvent) => {
                 if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReview({ seq: best.seq, winner: best.seat }); }
               },
             } : {})}>
          <span className="endscreen__bestlabel">Best hand</span>
          {/* A limit hand burns, as on the score screen. */}
          <BurningWord className="endscreen__bestvalue"
                       burn={best.win.level !== 'sinNombre'}
                       text={best.win.level === 'sinNombre'
                         ? `${best.win.han} han${best.win.fu ? ` · ${best.win.fu} fu` : ''}`
                         : levelName(best.win.level!)} />
          <span className="endscreen__bestwho">
            <PlayerName seat={state.config.seats[best.seat]!} link={linkPlayers} />
            {best.win.pointsWon !== null && ` · ${best.win.pointsWon.toLocaleString()}`}
          </span>
          {best.win.handTiles && <HandSummary state={decodeHandTiles(best.win.handTiles, state.config.players === 3)} />}
        </div>
      )}
    </>
  );
}
