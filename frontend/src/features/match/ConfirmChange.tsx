/**
 * The "are you sure" step in front of anything that changes the match.
 *
 * It works by running the change and showing the result rather than describing
 * it. Every transition in `matchState.ts` is pure, so the caller can produce the
 * next state, hand it here for review, and only then commit it. Nothing is
 * duplicated: what you read on this screen is the state you get.
 *
 * That also means one component covers wins, draws, adjustments, undo and the
 * manual round controls -- it diffs two states and does not care how they
 * differ.
 */
import type { HandRow, MatchState } from './matchState';
import { potOnTable } from './matchState';
import { levelName, levelTier, yakuName } from '../hand/yakuNames';
import { HandSummary } from '../hand/HandDisplay';
import { decodeHandTiles } from '../hand/handTiles';
import { PSEUDO_YAKU } from '../../scorer/types';
import { SEATS, roundLabel } from './seats';

/** "East 3 · 1 repeat", the state of the round as a player would say it. */
function roundPhrase(label: string, honba: number): string {
  return `${label} · ${honba} repeat${honba === 1 ? '' : 's'}`;
}

function ValueLine({ win, name, showName }: {
  win: HandRow['wins'][number]; name: string; showName: boolean;
}) {
  const real = win.yakus.filter((y) => !PSEUDO_YAKU.has(y.yaku));
  const level = win.level && win.level !== 'sinNombre' ? levelName(win.level) : null;

  return (
    <div className="confirm__value"
         data-tier={win.level ? levelTier(win.level) : undefined}>
      <div className="confirm__valuehead">
        {showName && <span className="confirm__winner">{name}</span>}
        {win.han !== null
          ? <span className="confirm__hanfu">{win.han} han{win.fu ? ` · ${win.fu} fu` : ''}</span>
          : <span className="confirm__hanfu">—</span>}
        {level && (
          <span className="confirm__level" data-tier={levelTier(win.level!)}>{level}</span>
        )}
        {win.pointsWon !== null && (
          <span className="confirm__points">{win.pointsWon.toLocaleString()}</span>
        )}
      </div>
      {real.length > 0 && (
        <div className="confirm__yakus">
          {real.map((y) => (
            <span key={y.yaku} className="confirm__yaku">{yakuName(y.yaku)}</span>
          ))}
        </div>
      )}
      {/* Only a hand entered as tiles has any to show; a typed-in value has
          nothing but its number. */}
      {win.handTiles && <HandSummary state={decodeHandTiles(win.handTiles)} />}
    </div>
  );
}

export function ConfirmChange({
  before, after, row, title, what, confirmLabel, onConfirm, onCancel,
}: {
  before: MatchState;
  after: MatchState;
  /** The hand being recorded, when there is one. */
  row?: HandRow | null;
  title: string;
  /** One line saying what is about to happen, for changes with no hand row. */
  what?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const names = before.config.seats.map((p) => p.name);
  // What the players will actually see move, which is the honest thing to show:
  // a riichi declared this hand already came off the score before this screen.
  const delta = SEATS.map((s) => after.scores[s] - before.scores[s]);
  const moved = delta.some((d) => d !== 0);

  const roundChanged = roundLabel(before.round) !== roundLabel(after.round)
    || before.honba !== after.honba;

  /**
   * Sticks lifted off the table by this hand.
   *
   * Worth calling out, because it is why these numbers can disagree with the
   * hand's own value: a 3,900 hand moves a player 4,900 if they also pick up a
   * stick. The columns here have to be self-consistent -- before, change, after
   * -- so the change includes the sticks, and this line says so rather than
   * leaving the arithmetic looking wrong.
   */
  const collected = potOnTable(before) - potOnTable(after);

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>Back</button>
        <h1 className="app__title">{title}</h1>
        <span className="app__barspacer" />
      </header>

      <div className="confirm">
        {what && <p className="confirm__what">{what}</p>}

        {row && row.wins.length > 0 && (
          <div className="field">
            <span className="field__label">
              {row.wins.length > 1 ? 'Hands' : 'Hand'}
            </span>
            {row.wins.map((win) => (
              <ValueLine key={win.winnerSeat} win={win}
                         name={names[win.winnerSeat] ?? ''}
                         showName={row.wins.length > 1} />
            ))}
          </div>
        )}

        <div className="field">
          <span className="field__label">Points</span>
          <div className="confirm__table">
            {SEATS.map((seat) => (
              <div key={seat} className="confirm__row">
                <span className="confirm__name">{names[seat]}</span>
                <span className="confirm__was">{before.scores[seat].toLocaleString()}</span>
                <span className={`confirm__delta${
                  delta[seat]! < 0 ? ' confirm__delta--loss'
                    : delta[seat]! > 0 ? ' confirm__delta--gain' : ''}`}>
                  {delta[seat]! > 0 ? '+' : ''}{delta[seat]!.toLocaleString()}
                </span>
                <span className={`confirm__now${
                  after.scores[seat] < 0 ? ' confirm__now--negative' : ''}`}>
                  {after.scores[seat].toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {!moved && <span className="field__hint">No points change hands.</span>}
          {collected > 0 && (
            <span className="field__hint">
              Includes {collected} riichi stick{collected === 1 ? '' : 's'} collected
              from the table ({(collected * 1000).toLocaleString()}).
            </span>
          )}
          {before.pendingRiichi.length > 0 && (
            <span className="field__hint">
              {before.pendingRiichi.map((s) => names[s]).join(' and ')} already paid
              1,000 when the riichi was declared, so it is not counted again here.
            </span>
          )}
        </div>

        {roundChanged && (
          <div className="field">
            <span className="field__label">Round</span>
            <div className="confirm__round">
              <span className="confirm__from">
                {roundPhrase(roundLabel(before.round), before.honba)}
              </span>
              <span className="confirm__arrow" aria-label="becomes">→</span>
              <span className="confirm__to">
                {roundPhrase(roundLabel(after.round), after.honba)}
              </span>
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">On the table next hand</span>
          <div className="confirm__sticks">
            <span>Riichi <strong>{potOnTable(after)}</strong></span>
            <span>Honba <strong>{after.honba}</strong></span>
          </div>
        </div>

        {after.status === 'finished' && (
          <p className="confirm__ends">
            {after.endReason === 'bust'
              ? 'This ends the match — a player goes below zero.'
              : 'This ends the match.'}
          </p>
        )}
      </div>

      <div className="app__spacer" />

      <div className="confirm__actions">
        <button type="button" className="btn btn--wide" onClick={onCancel}>Go back</button>
        <button type="button" className="btn btn--primary btn--wide" onClick={onConfirm}>
          {confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </div>
  );
}
