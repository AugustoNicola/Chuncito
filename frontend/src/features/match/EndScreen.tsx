/**
 * Final standings.
 *
 * Placement points are uma alone -- this group plays without oka -- so the raw
 * score is shown next to them rather than folded into them. The name field is
 * here because a match is much easier to find later by what happened in it than
 * by its date.
 */
import { useState } from 'react';
import type { MatchState } from './matchState';
import { bestHand } from './matchState';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { placements } from './scoring';
import { levelName, levelTier } from '../hand/yakuNames';
import { roundLabel } from './seats';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

const END_REASON: Record<string, string> = {
  final_round: 'Played to the end',
  bust: 'Ended on a bust',
  manual: 'Ended early',
};

export function EndScreen({ state, onSave, onTimeline }: {
  state: MatchState;
  onSave: (name: string) => void;
  onTimeline: () => void;
}) {
  const [name, setName] = useState(state.name);
  const standings = placements(state.scores, state.config.uma);
  const best = bestHand(state);
  const hands = state.hands.length;

  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">Final scores</h1>
        <button type="button" className="btn btn--quiet" onClick={onTimeline}>Timeline</button>
      </header>

      <div className="endscreen">
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
              <span className="standings__place">{PLACE_LABEL[p.place - 1]}</span>
              <span className="standings__name">{state.config.seats[p.seat]!.name}</span>
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
              {state.config.seats[best.seat]!.name}
              {best.win.pointsWon !== null && ` · ${best.win.pointsWon.toLocaleString()}`}
            </span>
            {best.win.handTiles && <HandSummary state={decodeHandTiles(best.win.handTiles)} />}
          </div>
        )}

        <label className="field">
          <span className="field__label">Name this match</span>
          <input className="setup__name" value={name}
                 placeholder="e.g. the one with the double yakuman"
                 onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="app__spacer" />

      <button type="button" className="btn btn--primary btn--wide" onClick={() => onSave(name.trim())}>
        Save and finish
      </button>
    </div>
  );
}
