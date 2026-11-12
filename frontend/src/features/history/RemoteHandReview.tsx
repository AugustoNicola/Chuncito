/**
 * A hand from a match that is not on screen -- a profile's best hand: fetched,
 * then shown as `HandReview` shows any other, with a way on to its match.
 */
import { useEffect, useState } from 'react';
import type { MatchState } from '../match/matchState';
import { HandReview, type Reviewed } from '../match/HandReview';
import { type Fetched, fetchMatch } from './history';

export function RemoteHandReview({ matchId, reviewed, onBack, onOpenMatch }: {
  matchId: string;
  reviewed: Reviewed;
  onBack: () => void;
  onOpenMatch: () => void;
}) {
  const [result, setResult] = useState<Fetched<MatchState> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchMatch(matchId).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [matchId]);

  if (result?.kind === 'ok') {
    return <HandReview state={result.value} reviewed={reviewed} onBack={onBack} onOpenMatch={onOpenMatch} />;
  }
  return (
    <div className="handreview" role="dialog" aria-modal="true" aria-label="Hand review">
      <div className="app">
        <header className="app__bar">
          <button type="button" className="btn btn--quiet" onClick={onBack}>Back</button>
          <h1 className="app__title">Hand</h1>
          <span className="app__barspacer" />
        </header>
        <p className="home__hint">
          {result === null ? 'Loading…' : 'The server cannot be reached, and the match is kept there.'}
        </p>
      </div>
    </div>
  );
}
