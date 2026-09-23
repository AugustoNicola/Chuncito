/**
 * The match tracker: the table, and the menus that record against it.
 *
 * All state changes go through the pure reducer in `matchState.ts`; this holds
 * only which menu is open and which change is awaiting confirmation. Every
 * change is mirrored to IndexedDB, so closing the tab mid-hanchan loses nothing.
 *
 * Nothing reaches the match without passing through `ConfirmChange` first. That
 * is possible precisely because the reducer is pure: the next state is computed,
 * shown for review, and only then committed. The review screen is therefore
 * showing the real thing rather than a description of it.
 *
 * **A back gesture never leaves the match.** The table is one route (`/match`),
 * and a swipe is blocked there: it steps back out of a review or a read-only
 * menu, as the on-screen Back would, and otherwise does nothing. It does not
 * close the win or draw menus, which would throw away what was being entered.
 * Only the explicit exits -- Back to home, Discard, saving a finished match --
 * leave, and they say so first (`leaving`) so the guard lets them through.
 */
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { HandInput, HandRow, MatchState, WinEntry } from './matchState';
import {
  adjustScores, advanceRoundManually, endMatchManually, recordHand, setHonba,
  setMatchName, toggleRiichi, undoLastHand, winnersOf,
} from './matchState';
import type { Seat } from './seats';
import { roundLabel } from './seats';
import { TableView } from './TableView';
import { WinMenu } from './WinMenu';
import { DrawMenu } from './DrawMenu';
import { TimelineView } from './TimelineView';
import { ManualControls } from './ManualControls';
import { EndScreen } from './EndScreen';
import { ConfirmChange } from './ConfirmChange';
import { archiveMatch, clearMatch, saveMatch } from './persistence';
import { SyncDot, SyncPanel } from './SyncPanel';
import { queueMatch } from './syncClient';
import type { WinMode } from '../../scorer/types';
import { warmScorer } from '../../scorer/useScorer';

type Menu =
  | { at: 'table' }
  | { at: 'win'; seat: Seat }
  | { at: 'draw' }
  | { at: 'timeline' }
  | { at: 'manual' };

/** A change that has been computed but not applied. */
interface Pending {
  after: MatchState;
  row: HandRow | null;
  title: string;
  what?: string;
  confirmLabel: string;
  /** Where Back should land. */
  back: Menu;
}

const DRAW_TITLE: Record<string, string> = {
  exhaustiveDraw: 'Exhaustive draw',
  abortiveDraw: 'Abortive draw',
  nagashiMangan: 'Nagashi mangan',
};

export function MatchScreen({ match, onChange, onFinished, onLeave, onDiscard }: {
  match: MatchState;
  onChange: (state: MatchState) => void;
  onFinished: () => void;
  /** Home, with the match left in progress. */
  onLeave: () => void;
  /** Home, with the match thrown away. */
  onDiscard: () => void;
}) {
  const [menu, setMenu] = useState<Menu>({ at: 'table' });
  const [pending, setPending] = useState<Pending | null>(null);
  const [showSync, setShowSync] = useState(false);

  const leaving = useRef(false);
  const blocker = useBlocker(() => !leaving.current);
  const leave = (exit: () => void) => () => { leaving.current = true; exit(); };
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    blocker.reset();
    if (pending) {
      setMenu(pending.back);
      setPending(null);
    } else if (menu.at === 'timeline' || menu.at === 'manual') {
      setMenu({ at: 'table' });
    }
  }, [blocker, pending, menu]);

  // The mirror and the server both follow the state rather than each action, so
  // no caller can forget to save -- including the reducer paths that end the
  // match. The server copy is queued, never awaited: the table does not wait.
  useEffect(() => {
    void saveMatch(match);
    queueMatch(match);
  }, [match]);

  // Most wins at the table can be scored by tiles, so the scorer is fetched in
  // the background once the table is up rather than when somebody first opens
  // the builder mid-hand. A moment's delay lets the table draw first.
  useEffect(() => {
    const timer = setTimeout(warmScorer, 1500);
    return () => clearTimeout(timer);
  }, []);

  const nameOf = (seat: Seat) => match.config.seats[seat]!.name;

  const stage = (p: Pending) => setPending(p);

  const commit = () => {
    if (!pending) return;
    onChange(pending.after);
    setPending(null);
    setMenu({ at: 'table' });
  };

  function stageHand(input: HandInput, back: Menu) {
    const { state: after, row } = recordHand(match, input);
    const winners = winnersOf(input);
    const title = input.kind === 'win'
      ? `${winners.map(nameOf).join(' and ')} ${input.mode === 'tsumo' ? 'tsumo' : 'ron'}`
      : DRAW_TITLE[input.kind] ?? 'No winner';
    stage({ after, row, title, confirmLabel: 'Record this hand', back });
  }

  const stageWin = (args: { mode: WinMode; dealIn: Seat | null; wins: WinEntry[] }) => {
    if (menu.at !== 'win') return;
    stageHand({ kind: 'win', ...args }, menu);
  };

  if (pending) {
    return (
      <ConfirmChange
        before={match}
        after={pending.after}
        row={pending.row}
        title={pending.title}
        what={pending.what}
        confirmLabel={pending.confirmLabel}
        onConfirm={commit}
        onCancel={() => { setMenu(pending.back); setPending(null); }}
      />
    );
  }

  if (match.status === 'finished' && menu.at !== 'timeline') {
    return (
      <EndScreen
        state={match}
        onTimeline={() => setMenu({ at: 'timeline' })}
        onSave={async (name) => {
          const named = setMatchName(match, name);
          onChange(named);
          // Queued here as well as by the effect, which will not run: this
          // screen is gone by the time the state change would reach it.
          queueMatch(named);
          await archiveMatch(named);
          await clearMatch();
          leave(onFinished)();
        }}
      />
    );
  }

  switch (menu.at) {
    case 'win':
      return (
        <WinMenu state={match} winner={menu.seat}
                 onRecord={stageWin}
                 onCancel={() => setMenu({ at: 'table' })} />
      );
    case 'draw':
      return (
        <DrawMenu state={match} onRecord={(input) => stageHand(input, { at: 'draw' })}
                  onCancel={() => setMenu({ at: 'table' })} />
      );
    case 'timeline':
      return <TimelineView state={match} onClose={() => setMenu({ at: 'table' })} />;
    case 'manual': {
      const manual = (after: MatchState, title: string, what: string, confirmLabel: string) =>
        stage({ after, row: null, title, what, confirmLabel, back: { at: 'manual' } });
      return (
        <ManualControls
          state={match}
          onAdjust={(targets, note) => manual(
            adjustScores(match, targets, note),
            'Correct the scores',
            note ? `Recorded as: ${note}` : 'Recorded as a manual correction.',
            'Apply the correction',
          )}
          onAdvanceRound={() => manual(
            advanceRoundManually(match),
            'Pass the deal on',
            'No hand is recorded — the round marker moves and the honba resets.',
            'Pass the deal',
          )}
          onSetHonba={(honba) => manual(
            setHonba(match, honba),
            'Set the honba',
            `The counter goes to ${honba}. No points move.`,
            'Set it',
          )}
          onUndo={() => manual(
            undoLastHand(match),
            `Undo hand ${match.hands.length}`,
            `Takes back the hand played in ${roundLabel({
              wind: match.hands.at(-1)?.roundWind ?? match.round.wind,
              number: match.hands.at(-1)?.roundNumber ?? match.round.number,
            })}. Riichi sticks go back on the table, still declared.`,
            'Undo it',
          )}
          onEnd={() => manual(
            endMatchManually(match),
            'End the match',
            'Placements are worked out from the scores as they stand. Any riichi sticks on the table are lost, as they would be at a real table.',
            'End it now',
          )}
          onLeave={leave(onLeave)}
          onDiscard={leave(onDiscard)}
          onClose={() => setMenu({ at: 'table' })}
        />
      );
    }
    default:
      return (
        <div className="app app--table">
          <header className="app__bar">
            <button type="button" className="btn btn--quiet"
                    onClick={() => setMenu({ at: 'manual' })}>
              Manual
            </button>
            <h1 className="app__title app__title--match">
              {match.config.players === 3 && 'Sanma · '}
              {match.config.length === 'east' ? 'East match' : 'South match'}
              <SyncDot onClick={() => setShowSync((v) => !v)} />
            </h1>
            <button type="button" className="btn btn--quiet"
                    onClick={() => setMenu({ at: 'timeline' })}>
              Timeline
            </button>
          </header>

          {showSync && (
            <div className="app__syncpanel">
              <SyncPanel />
            </div>
          )}

          <TableView
            state={match}
            onOpenSeat={(seat) => setMenu({ at: 'win', seat })}
            onRiichi={(seat) => onChange(toggleRiichi(match, seat))}
            onOpenCentre={() => setMenu({ at: 'draw' })}
          />
        </div>
      );
  }
}
