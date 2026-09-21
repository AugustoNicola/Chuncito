/**
 * The match tracker: the table, and the menus that record against it.
 *
 * All state changes go through the pure reducer in `matchState.ts`; this holds
 * only which menu is open. Every change is mirrored to IndexedDB, so closing the
 * tab mid-hanchan loses nothing.
 */
import { useEffect, useState } from 'react';
import type { HandInput, HandValue, MatchState } from './matchState';
import {
  adjustScore, advanceRoundManually, endMatchManually, recordHand, setHonba,
  setMatchName, toggleRiichi, undoLastHand,
} from './matchState';
import type { Seat } from './seats';
import { TableView } from './TableView';
import { WinMenu } from './WinMenu';
import { DrawMenu } from './DrawMenu';
import { TimelineView } from './TimelineView';
import { ManualControls } from './ManualControls';
import { EndScreen } from './EndScreen';
import { archiveMatch, clearMatch, saveMatch } from './persistence';
import type { WinMode } from '../../scorer/types';

type Menu =
  | { at: 'table' }
  | { at: 'win'; seat: Seat }
  | { at: 'draw' }
  | { at: 'timeline' }
  | { at: 'manual' };

export function MatchScreen({ match, onChange, onFinished }: {
  match: MatchState;
  onChange: (state: MatchState) => void;
  onFinished: () => void;
}) {
  const [menu, setMenu] = useState<Menu>({ at: 'table' });

  // The mirror follows the state rather than each action, so no caller can
  // forget to save -- including the reducer paths that end the match.
  useEffect(() => { void saveMatch(match); }, [match]);

  const apply = (next: MatchState) => {
    onChange(next);
    setMenu({ at: 'table' });
  };

  const record = (input: HandInput) => apply(recordHand(match, input).state);

  const recordWin = (args: { mode: WinMode; dealIn: Seat | null; value: HandValue }) => {
    if (menu.at !== 'win') return;
    record({ kind: 'win', winner: menu.seat, ...args });
  };

  if (match.status === 'finished' && menu.at !== 'timeline') {
    return (
      <EndScreen
        state={match}
        onTimeline={() => setMenu({ at: 'timeline' })}
        onSave={async (name) => {
          const named = setMatchName(match, name);
          onChange(named);
          await archiveMatch(named);
          await clearMatch();
          onFinished();
        }}
      />
    );
  }

  switch (menu.at) {
    case 'win':
      return (
        <WinMenu state={match} winner={menu.seat}
                 onRecord={recordWin}
                 onCancel={() => setMenu({ at: 'table' })} />
      );
    case 'draw':
      return (
        <DrawMenu state={match} onRecord={record}
                  onCancel={() => setMenu({ at: 'table' })} />
      );
    case 'timeline':
      return <TimelineView state={match} onClose={() => setMenu({ at: 'table' })} />;
    case 'manual':
      return (
        <ManualControls
          state={match}
          onAdjust={(seat, delta, note) => onChange(adjustScore(match, seat, delta, note))}
          onAdvanceRound={() => apply(advanceRoundManually(match))}
          onSetHonba={(honba) => onChange(setHonba(match, honba))}
          onUndo={() => apply(undoLastHand(match))}
          onEnd={() => apply(endMatchManually(match))}
          onClose={() => setMenu({ at: 'table' })}
        />
      );
    default:
      return (
        <div className="app app--table">
          <header className="app__bar">
            <button type="button" className="btn btn--quiet"
                    onClick={() => setMenu({ at: 'timeline' })}>
              Timeline
            </button>
            <h1 className="app__title app__title--match">
              {match.config.length === 'east' ? 'Tonpuusen' : 'Hanchan'}
            </h1>
            <button type="button" className="btn btn--quiet"
                    onClick={() => setMenu({ at: 'manual' })}>
              Manual
            </button>
          </header>

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
