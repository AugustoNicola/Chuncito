/**
 * One finished match, read back: how it ended, then every hand in the order
 * it was played. Rebuilt from the server's rows with `fromRows`, the same way
 * a match is carried on to another phone, and shown with the end screen's and
 * the timeline's own components -- so it reads exactly as it did on the night.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MatchState } from '../match/matchState';
import { MatchOutcome } from '../match/MatchOutcome';
import { PinForm } from '../match/SyncPanel';
import { TimelineList } from '../match/TimelineView';
import { type Fetched, fetchMatch } from './history';
import { matchDate } from './MatchList';

export function MatchReview({ onBack }: { onBack: () => void }) {
  const { id = '' } = useParams();
  const [result, setResult] = useState<Fetched<MatchState> | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    void fetchMatch(id).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [id, reload]);

  const state = result?.kind === 'ok' ? result.value : null;

  return (
    <div className="app app--wide">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
        <h1 className="app__title review__title">
          {state ? state.name || 'Unnamed match' : 'Match'}
        </h1>
        <span className="app__barspacer" />
      </header>

      {result === null && <p className="home__hint">Loading…</p>}
      {result?.kind === 'locked' && (
        <PinForm reason="The history is kept on the server. Enter the group's PIN to see it."
                 onUnlocked={() => setReload((n) => n + 1)} />
      )}
      {result?.kind === 'missing' && <p className="home__hint">There is no such match.</p>}
      {result?.kind === 'unreachable' && (
        <p className="home__hint">The server cannot be reached, and the history is kept there.</p>
      )}

      {state && (
        <>
          <p className="review__when">
            {matchDate(state.startedAt)}
            {' · '}{state.config.players === 3 ? 'Sanma · ' : ''}
            {state.config.length === 'east' ? 'East match' : 'South match'}
          </p>
          <div className="review">
            <div className="endscreen review__outcome">
              <MatchOutcome state={state} />
            </div>
            <section className="review__hands">
              <h2 className="home__heading review__heading">Hands</h2>
              <TimelineList state={state} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
