/**
 * The match so far, hand by hand.
 *
 * This is `hands ORDER BY seq` and nothing else -- the same read the review
 * screen will do against the server in Phase 4, which is the point of the
 * timeline being a plain list of rows rather than a fold over events.
 */
import type { HandRow, MatchState } from './matchState';
import { levelName, yakuName } from '../hand/yakuNames';
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
  const winner = row.winnerSeat === null ? null : names[row.winnerSeat];
  switch (row.outcome) {
    case 'ron':
      return `${winner} ron off ${names[row.dealInSeat ?? 0]}`;
    case 'tsumo':
      return `${winner} tsumo`;
    case 'nagashi_mangan':
      return `${winner} — nagashi mangan`;
    default:
      return OUTCOME_LABEL[row.outcome];
  }
}

function HandEntry({ row, names }: { row: HandRow; names: readonly string[] }) {
  const real = row.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const isWin = row.outcome === 'ron' || row.outcome === 'tsumo';
  const level = row.level && row.level !== 'sinNombre' ? levelName(row.level) : null;

  return (
    <li className="timeline__hand">
      <div className="timeline__head">
        <span className="timeline__round">
          {roundLabel({ wind: row.roundWind, number: row.roundNumber })}
          {row.honba > 0 && <span className="timeline__honba">+{row.honba}</span>}
        </span>
        <span className="timeline__what">{headline(row, names)}</span>
      </div>

      {isWin && (
        <div className="timeline__value">
          {row.han !== null && (
            <span>{row.han} han{row.fu ? ` · ${row.fu} fu` : ''}</span>
          )}
          {level && <span className="timeline__level">{level}</span>}
          {row.pointsWon !== null && (
            <span className="timeline__points">{row.pointsWon.toLocaleString()}</span>
          )}
          {row.isManual && <span className="timeline__manual" title="Value typed in">manual</span>}
        </div>
      )}

      {real.length > 0 && (
        <div className="timeline__yakus">
          {real.map((y) => <span key={y.yaku} className="timeline__yaku">{yakuName(y.yaku)}</span>)}
        </div>
      )}

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
