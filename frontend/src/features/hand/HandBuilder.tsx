/**
 * The hand-input screen: tile keyboard, hand display, context flap, and the
 * score result.
 *
 * Works standalone as a calculator, and embeds whole into the match tracker's
 * win menu. Embedded, it is handed the two winds -- which the match already
 * knows -- and reports the score back instead of ending at its own result
 * screen.
 */
import { useMemo, useState } from 'react';
import { TileKeyboard } from './TileKeyboard';
import { CallModeBar } from './CallModeBar';
import { HandDisplay } from './HandDisplay';
import { HandContextPanel } from './HandContextPanel';
import { ScoreResultView, type ScoreAttribution } from './ScoreResultView';
import {
  clearHand, currentSize, initialHandState, isComplete, pressTile, reconcile,
  removeConcealed, removeDora, removeKita, removeMeld, setRedFives, setSanma, targetSize,
  toSituation,
  toggleMode, toggleRed, winningTile, type CallMode, type HandState,
} from './handState';
import { withNukidora } from './nukidora';
import type { PlayerCount } from '../match/seats';
import { useScorer } from '../../scorer/useScorer';
import { validateQuery } from '../../scorer/validate';
import type {
  Rule, ScoreQuery, ScoreResult, SituationWind, Tile as TileAtom, WinMode,
} from '../../scorer/types';

type Flap = 'tiles' | 'details';

export interface HandBuilderProps {
  /**
   * Supplied by the match tracker. Fixes both winds and hides their selectors:
   * the round wind is the match's, and the seat wind follows from which player
   * is winning. The seat wind is also what tells the engine whether the winner
   * is dealer, so deriving it removes a way to score a hand wrongly in silence.
   */
  winds?: { roundWind: SituationWind; seatWind: SituationWind };
  /**
   * Also supplied by the tracker, for the same reason: the win menu asks how
   * the hand was won, and on a ron who dealt in, before the tiles are entered.
   * Asking again here could contradict the deal-in seat already chosen.
   */
  winMode?: WinMode;
  /**
   * Three or four players, from the match. Sanma changes which tiles exist,
   * removes chii and adds kita -- and a sanma tsumo is paid by two players, so
   * the total differs. The tracker fixes it; the plain calculator offers a
   * toggle instead.
   */
  players?: PlayerCount;
  /**
   * Whether the match plays with red fives. Without them the Red Five modifier
   * is gone and all four fives are plain. The tracker fixes it; the plain
   * calculator offers a toggle instead.
   */
  redFives?: boolean;
  /**
   * Whether this player's riichi button was pressed on the table. The tracker
   * already knows, so the selector follows it: no riichi declared means riichi
   * cannot be claimed here, and a declared one cannot be dropped. The double is
   * left open either way, since the tracker does not distinguish the two.
   *
   * Undefined in the standalone calculator, which has no table to consult.
   */
  riichiDeclared?: boolean;
  /** Called with a confirmed score. Absent when used as a plain calculator. */
  onConfirm?: (result: ScoreResult, state: HandState) => void;
  /**
   * Offered alongside `onConfirm` during a multiple ron: the scored hand is put
   * aside and the caller collects the next winner's, rather than the flow
   * ending at this one.
   */
  onAddAnother?: (result: ScoreResult, state: HandState) => void;
  onCancel?: () => void;
  /** Replaces the "Hand" header, e.g. with the winner's name. */
  title?: string;
  /** Names the winner, and on a ron the discarder, on the score screen. */
  attribution?: ScoreAttribution;
  /**
   * House rules for this hand, from the match. Undefined in the plain
   * calculator, which offers them as toggles instead.
   */
  rules?: Rule[];
}

function buildQuery(state: HandState): ScoreQuery | null {
  const tile = winningTile(state);
  if (!tile) return null;
  return {
    hand: { concealed: state.concealed, melds: state.melds },
    winningTile: tile,
    mode: state.winMode,
    situation: toSituation(state),
    rules: state.rules,
  };
}

export function HandBuilder({
  winds, winMode, players, redFives, riichiDeclared, onConfirm, onAddAnother, onCancel, title,
  attribution, rules,
}: HandBuilderProps = {}) {
  const [state, setState] = useState<HandState>(() => ({
    ...initialHandState,
    sanma: players === 3,
    redFives: redFives ?? true,
    rules: rules ?? [],
    ...winds,
    ...(winMode ? { winMode } : {}),
    ...(riichiDeclared ? { riichi: 'riichi' as const } : {}),
  }));
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
      // Pulled Norths are invisible to the engine; their han go on afterwards.
      setResult(withNukidora(outcome.result, state));
    } else {
      // The engine cannot tell "no yaku" from "not a winning shape", so neither can we.
      setMessage('No score: those tiles are not a winning hand, or the win has no yaku.');
    }
  }

  if (result) {
    return (
      <div className="app">
        <ScoreResultView result={result} hand={state} attribution={attribution}
                         onBack={() => setResult(null)}
                         onConfirm={onConfirm ? () => onConfirm(result, state) : undefined}
                         onAddAnother={onAddAnother ? () => onAddAnother(result, state) : undefined} />
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
        {onCancel && (
          <button type="button" className="btn btn--quiet" onClick={onCancel}>Back</button>
        )}
        <h1 className="app__title">{title ?? 'Hand'}</h1>
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
        onRemoveKita={() => apply(removeKita)}
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
        <HandContextPanel state={state} update={update}
                          showWinds={!winds} showWinMode={!winMode}
                          showPlayers={players === undefined}
                          onSanma={(on) => apply((s) => setSanma(s, on))}
                          showRedFives={redFives === undefined}
                          onRedFives={(on) => apply((s) => setRedFives(s, on))}
                          showRules={rules === undefined}
                          riichiDeclared={riichiDeclared} />
      )}
    </div>
  );
}
