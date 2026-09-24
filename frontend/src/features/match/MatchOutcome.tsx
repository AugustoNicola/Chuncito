/**
 * How a match ended: why, how long, the standings with uma, and its best hand.
 * Shared by the end screen and the history's match review, so a match reads
 * the same on the night and months later.
 */
import type { MatchState } from './matchState';
import { bestHand } from './matchState';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { matchResults, okaOf, placeLabel, resultLabel } from './scoring';
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
  const standings = matchResults(state.scores, state.config);
  const oka = okaOf(state.config);
  const sum = standings.reduce((a, p) => a + p.total, 0);
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
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
            <span className={`standings__uma${p.total < 0 ? ' standings__uma--negative' : ''}`}>
              {resultLabel(p.total)}
            </span>
            {/* The working, so the result can be checked at the table. */}
            <span className="standings__working">
              {resultLabel(p.vsTarget)} vs target · {signed(p.umaPoints)} uma
              {p.oka !== 0 && ` · ${resultLabel(p.oka)} oka`}
            </span>
          </li>
        ))}
      </ol>
      <p className="standings__rules">
        Result = final score − target ({state.config.targetScore.toLocaleString()}) + uma
        ({state.config.uma.map(signed).join(' / ')}), in thousands.
        {oka !== 0
          ? ` 1st also takes the oka: (${state.config.targetScore.toLocaleString()} − ${
            state.config.startingPoints.toLocaleString()}) × ${state.config.players} = ${resultLabel(oka)}.`
          : ' No oka: the target is the starting score.'}
        {' '}The results sum to {resultLabel(sum)}.
      </p>

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
