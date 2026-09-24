/**
 * How a match ended: why, how long, the standings with uma, and its best hand.
 * Shared by the end screen and the history's match review, so a match reads
 * the same on the night and months later.
 */
import type { MatchState } from './matchState';
import { bestHand } from './matchState';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { placeLabel, placements } from './scoring';
import { levelName, levelTier } from '../hand/yakuNames';
import { roundLabel, seatWindOf } from './seats';
import { WindMark } from './WindMark';
import { PlayerName } from '../players/PlayerName';

const END_REASON: Record<string, string> = {
  final_round: 'Played to the end',
  bust: 'Ended on a bust',
  manual: 'Ended early',
};

const START = { wind: 'este', number: 1 } as const;

/** `linkPlayers` in a match review; never on the night, inside the match. */
export function MatchOutcome({ state, linkPlayers = false }: { state: MatchState; linkPlayers?: boolean }) {
  const standings = placements(state.scores, state.config.uma);
  const best = bestHand(state);
  const hands = state.hands.length;

  return (
    <>
      <div className="endscreen__meta">
        <span>{END_REASON[state.endReason ?? ''] ?? 'Finished'}</span>
        <span>·</span>
        <span>{hands} hand{hands === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>{roundLabel(state.round)}</span>
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
            <span className={`standings__uma${p.umaPoints < 0 ? ' standings__uma--negative' : ''}`}>
              {p.umaPoints > 0 ? '+' : ''}{p.umaPoints}
            </span>
          </li>
        ))}
      </ol>

      {best && (
        <div className="endscreen__best" data-tier={levelTier(best.win.level!)}>
          <span className="endscreen__bestlabel">Best hand</span>
          <span className="endscreen__bestvalue">
            {best.win.level === 'sinNombre'
              ? `${best.win.han} han${best.win.fu ? ` · ${best.win.fu} fu` : ''}`
              : levelName(best.win.level!)}
          </span>
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
