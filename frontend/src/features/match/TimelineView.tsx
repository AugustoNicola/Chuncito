/**
 * The match so far, hand by hand.
 *
 * This is `hands ORDER BY seq` and nothing else -- the same read the review
 * screen will do against the server in Phase 4, which is the point of the
 * timeline being a plain list of rows rather than a fold over events.
 */
import type { HandRow, MatchState, WinRow } from './matchState';
import { topLevel } from './matchState';
import { levelName, levelTier, yakuName } from '../hand/yakuNames';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { PSEUDO_YAKU } from '../../scorer/types';
import type { Seat } from './seats';
import { SEATS, roundLabel } from './seats';

const OUTCOME_LABEL: Record<HandRow['outcome'], string> = {
  tsumo: 'tsumo',
  ron: 'ron',
  exhaustive_draw: 'Exhaustive draw',
  abortive_draw: 'Abortive draw',
  nagashi_mangan: 'Nagashi mangan',
};

function headline(row: HandRow, names: readonly string[]): string {
  const winners = row.wins.map((w) => names[w.winnerSeat]).join(' and ');
  switch (row.outcome) {
    case 'ron':
      return `${winners} ron off ${names[row.dealInSeat ?? 0]}`;
    case 'tsumo':
      return `${winners} tsumo`;
    case 'nagashi_mangan':
      return `${winners} — nagashi mangan`;
    default:
      return OUTCOME_LABEL[row.outcome];
  }
}

/** One winner's value line. A double ron shows one of these per winner. */
function WinLine({ win, names, showName }: {
  win: WinRow; names: readonly string[]; showName: boolean;
}) {
  const real = win.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const level = win.level && win.level !== 'sinNombre' ? levelName(win.level) : null;

  return (
    <div className="timeline__win">
      <div className="timeline__value">
        {showName && <span className="timeline__winner">{names[win.winnerSeat]}</span>}
        {win.han !== null && (
          <span>{win.han} han{win.fu ? ` · ${win.fu} fu` : ''}</span>
        )}
        {level && <span className="timeline__level" data-tier={levelTier(win.level!)}>{level}</span>}
        {win.pointsWon !== null && (
          <span className="timeline__points">{win.pointsWon.toLocaleString()}</span>
        )}
        {win.isManual && <span className="timeline__manual" title="Value typed in">manual</span>}
      </div>
      {real.length > 0 && (
        <div className="timeline__yakus">
          {real.map((y) => (
            <span key={y.yaku} className="timeline__yaku">{yakuName(y.yaku)}</span>
          ))}
        </div>
      )}
      {/* This is what `hand_tiles` is stored for -- reviewing the hand, and one
          day re-scoring it. */}
      {win.handTiles && <HandSummary state={decodeHandTiles(win.handTiles)} />}
    </div>
  );
}

/**
 * Which palette an entry wears.
 *
 * A limit hand is worth spotting while scrolling, so it carries its tier's
 * colour; a double ron takes its best hand's. Draws share a red one -- they are
 * the other thing you scan for, and they are not a limit of anything.
 */
function tierOf(row: HandRow): string | undefined {
  if (row.outcome === 'exhaustive_draw' || row.outcome === 'abortive_draw') return 'draw';
  const level = topLevel(row.wins);
  if (!level || level === 'sinNombre') return undefined;
  return levelTier(level);
}

function HandEntry({ row, names }: { row: HandRow; names: readonly string[] }) {
  return (
    <li className="timeline__hand" data-tier={tierOf(row)}>
      <div className="timeline__head">
        <span className="timeline__round">
          {roundLabel({ wind: row.roundWind, number: row.roundNumber })}
          {row.honba > 0 && <span className="timeline__honba">+{row.honba}</span>}
        </span>
        <span className="timeline__what">{headline(row, names)}</span>
      </div>

      {row.wins.map((win) => (
        <WinLine key={win.winnerSeat} win={win} names={names}
                 showName={row.wins.length > 1} />
      ))}

      <div className="timeline__deltas">
        {SEATS.map((seat) => (
          <span key={seat} className="timeline__delta">
            <span className="timeline__seatname">{names[seat]}</span>
            <span className={row.scoreDelta[seat] < 0 ? 'timeline__loss'
              : row.scoreDelta[seat] > 0 ? 'timeline__gain' : 'timeline__flat'}>
              {row.scoreDelta[seat] > 0 ? '+' : ''}{row.scoreDelta[seat].toLocaleString()}
            </span>
          </span>
        ))}
      </div>

      {(row.riichiSeats.length > 0 || row.tenpaiSeats.length > 0) && (
        <div className="timeline__tags">
          {row.riichiSeats.map((s: Seat) => (
            <span key={`r${s}`} className="timeline__tag timeline__tag--riichi">
              {names[s]} riichi
            </span>
          ))}
          {row.tenpaiSeats.map((s: Seat) => (
            <span key={`t${s}`} className="timeline__tag">{names[s]} tenpai</span>
          ))}
        </div>
      )}
    </li>
  );
}

export function TimelineView({ state, onClose }: { state: MatchState; onClose: () => void }) {
  const names = state.config.seats.map((p) => p.name);
  // Newest first: at the table you are almost always checking the last hand.
  const rows = [...state.hands].reverse();

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Back</button>
        <h1 className="app__title">Timeline</h1>
        <span className="app__barspacer" />
      </header>

      {rows.length === 0 ? (
        <p className="timeline__empty">No hands recorded yet.</p>
      ) : (
        <ol className="timeline">
          {rows.map((row) => <HandEntry key={row.clientUuid} row={row} names={names} />)}
        </ol>
      )}

      {state.adjustments.length > 0 && (
        <div className="timeline__adjustments">
          <span className="field__label">Manual adjustments</span>
          {state.adjustments.map((adj) => (
            <div key={adj.clientUuid} className="timeline__adjustment">
              <span>{names[adj.seat]}</span>
              <span className={adj.delta < 0 ? 'timeline__loss' : 'timeline__gain'}>
                {adj.delta > 0 ? '+' : ''}{adj.delta.toLocaleString()}
              </span>
              {adj.note && <span className="timeline__note">{adj.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
