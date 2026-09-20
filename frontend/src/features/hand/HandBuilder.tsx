/**
 * The hand-input screen: tile keyboard, hand display, context flap, and the
 * score result.
 *
 * Standalone by design -- it needs no backend, so it works as a calculator on
 * its own and is later embedded in the match tracker's win menu.
 */
import { useMemo, useState } from 'react';
import { TileKeyboard } from './TileKeyboard';
import { CallModeBar } from './CallModeBar';
import { HandDisplay } from './HandDisplay';
import { HandContextPanel } from './HandContextPanel';
import { ScoreResultView } from './ScoreResultView';
import {
  clearHand, currentSize, initialHandState, isComplete, pressTile, reconcile,
  removeConcealed, removeDora, removeMeld, targetSize, toSituation, toggleMode,
  toggleRed, winningTile, type CallMode, type HandState,
} from './handState';
import { useScorer } from '../../scorer/useScorer';
import { validateQuery } from '../../scorer/validate';
import type { ScoreQuery, ScoreResult, Tile as TileAtom } from '../../scorer/types';

type Flap = 'tiles' | 'details';

function buildQuery(state: HandState): ScoreQuery | null {
  const tile = winningTile(state);
  if (!tile) return null;
  return {
    hand: { concealed: state.concealed, melds: state.melds },
    winningTile: tile,
    mode: state.winMode,
    situation: toSituation(state),
  };
}

export function HandBuilder() {
  const [state, setState] = useState<HandState>(initialHandState);
  const [flap, setFlap] = useState<Flap>('tiles');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const scorer = useScorer();

  const query = useMemo(() => buildQuery(state), [state]);
  const issues = useMemo(() => (query ? validateQuery(query) : []), [query]);
  const complete = isComplete(state);
  const canScore = complete && issues.length === 0 && scorer.state === 'ready';

  const apply = (f: (s: HandState) => HandState) => {
    setState((s) => reconcile(f(s)));
    setMessage(null);
  };
  const update = (patch: Partial<HandState>) => apply((s) => ({ ...s, ...patch }));

  function score() {
    if (!query || scorer.state !== 'ready') return;
    setMessage(null);
    const outcome = scorer.scorer.score(query);
    if (outcome.ok) {
      setResult(outcome.result);
    } else {
      // The engine cannot tell "no yaku" from "not a winning shape", so neither can we.
      setMessage('No score: those tiles are not a winning hand, or the win has no yaku.');
    }
  }

  if (result) {
    return (
      <div className="app">
        <ScoreResultView result={result} hand={state} onBack={() => setResult(null)} />
      </div>
    );
  }

  const statusLine = () => {
    if (scorer.state === 'error') return 'The scorer failed to load.';
    // While the hand is still being built, a plain count reads better than the
    // "wrong size" complaint that validation would otherwise raise every press.
    if (!complete) return `${currentSize(state)} / ${targetSize(state)} tiles`;
    if (issues.length > 0) return issues[0]!.message;
    if (scorer.state === 'loading') return 'Loading the scorer…';
    return 'Ready to score';
  };
  const warning = message !== null || (complete && issues.length > 0);

  return (
    <div className="app">
      <header className="app__bar">
        <h1 className="app__title">Hand</h1>
        <button type="button" className="btn btn--quiet"
                onClick={() => apply(clearHand)}>
          Clear
        </button>
      </header>

      <HandDisplay
        state={state}
        onRemoveConcealed={(i) => apply((s) => removeConcealed(s, i))}
        onRemoveMeld={(i) => apply((s) => removeMeld(s, i))}
        onRemoveDora={(i, ura) => apply((s) => removeDora(s, i, ura))}
      />

      <div className="app__spacer" />

      <div className={`status${warning ? ' status--warn' : ''}`}>
        {message ?? statusLine()}
      </div>

      <button type="button" className="btn btn--primary btn--wide"
              disabled={!canScore} onClick={score}>
        Score hand
      </button>

      <div className="flaps" role="tablist">
        {(['tiles', 'details'] as Flap[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={flap === f}
                  className={`flaps__tab${flap === f ? ' flaps__tab--on' : ''}`}
                  onClick={() => setFlap(f)}>
            {f === 'tiles' ? 'Tiles' : 'Details'}
          </button>
        ))}
      </div>

      {flap === 'tiles' ? (
        <>
          <CallModeBar state={state}
                       onToggle={(m: CallMode) => apply((s) => toggleMode(s, m))}
                       onToggleRed={() => apply(toggleRed)} />
          <TileKeyboard state={state} onPress={(t: TileAtom) => apply((s) => pressTile(s, t))} />
        </>
      ) : (
        <HandContextPanel state={state} update={update} />
      )}
    </div>
  );
}
