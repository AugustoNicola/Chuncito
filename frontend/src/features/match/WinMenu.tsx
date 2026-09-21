/**
 * Recording a win.
 *
 * Two routes to the same `HandValue`: type the value in ("3 han 50 fu",
 * "haneman"), or build the hand tile by tile and let the engine score it. The
 * second route is the whole reason the Prolog engine is here, but the first is
 * what you use when the hand has already been scattered back into the wall and
 * somebody just says the number.
 *
 * The winner's seat is known, so the seat wind is derived rather than asked for,
 * and the win mode is settled here rather than in the builder -- see
 * `HandBuilderProps.winds`.
 *
 * A ron can have more than one winner: this ruleset pays every player who wins
 * on the discard rather than aborting the hand. Winners are staged one at a
 * time -- by either route, in any mix -- and the whole set is recorded as a
 * single hand.
 *
 * Each winner's hand is scored on its own. Nothing checks that they share a
 * winning tile: in a real double ron they do, but the engine is asked one hand
 * at a time and has no way to be told about the other, so there is nothing to
 * be gained by enforcing it here.
 */
import { useState } from 'react';
import type { ScoreResult, WinMode } from '../../scorer/types';
import { HandBuilder } from '../hand/HandBuilder';
import { encodeHandTiles } from '../hand/handTiles';
import { isHandOpen, type HandState } from '../hand/handState';
import { levelName, levelTier } from '../hand/yakuNames';
import type { HandValue, MatchState, WinEntry } from './matchState';
import { dealerSeat } from './matchState';
import {
  LIMIT_BASE, basePoints, hanFuPossible, levelFor, paymentFor, paymentTotal,
} from './scoring';
import type { Seat } from './seats';
import { SEATS, seatWindOf } from './seats';

/**
 * Fu values the rules can actually produce. 25 is chiitoitsu; 20 is a pinfu
 * tsumo. The common ones get a row to themselves and share it evenly, because
 * they are what you reach for; the rest sit below at their natural width.
 */
const FU_COMMON = [20, 25, 30, 40, 50];
const FU_REST = [60, 70, 80, 90, 100, 110];
const HAN_STEPS = [1, 2, 3, 4];

/**
 * Limits offered directly, for when nobody counted the fu. Two to a row, in
 * ascending pairs, with the yakuman alone across the bottom.
 */
const LIMITS = ['mangan', 'haneman', 'baiman', 'sanbaiman', 'yakuman'] as const;

/** Three players can ron the same discard; a fourth would have nobody to pay. */
const MAX_WINNERS = 3;

type Route = 'menu' | 'tiles';

export function WinMenu({ state, winner, onRecord, onCancel }: {
  state: MatchState;
  winner: Seat;
  onRecord: (args: { mode: WinMode; dealIn: Seat | null; wins: WinEntry[] }) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<WinMode>('ron');
  const [dealIn, setDealIn] = useState<Seat | null>(null);
  /** Winners already settled; the form below is the one being entered now. */
  const [staged, setStaged] = useState<WinEntry[]>([]);
  /** Null right after staging a winner, until the next one is picked. */
  const [current, setCurrent] = useState<Seat | null>(winner);
  const [han, setHan] = useState<number | null>(null);
  const [fu, setFu] = useState<number | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<Route>('menu');

  const dealer = dealerSeat(state);
  const isDealer = current === dealer;
  const nameOf = (seat: Seat) => state.config.seats[seat]!.name;

  /** Seats already holding a winning hand this discard. */
  const taken = new Set(staged.map((w) => w.winner));
  /** A ron needs a discarder, and nobody may win off their own discard. */
  const outcomeSettled = current !== null
    && (mode === 'tsumo' || (dealIn !== null && dealIn !== current));

  const clearValue = () => { setHan(null); setFu(null); setLimit(null); setOpen(false); };

  /** Everything entered so far, plus the hand on screen if it is complete. */
  const allWins = (extra?: WinEntry): WinEntry[] => [...staged, ...(extra ? [extra] : [])];

  const record = (extra?: WinEntry) => onRecord({
    mode,
    dealIn: mode === 'ron' ? dealIn : null,
    wins: allWins(extra),
  });

  /** Puts a hand aside and goes back for the next winner's. */
  const stage = (entry: WinEntry) => {
    setStaged([...staged, entry]);
    setCurrent(null);
    clearValue();
    setRoute('menu');
  };

  /** Room for another winner: three can ron one discard, a fourth has nobody to pay. */
  const roomForMore = mode === 'ron' && staged.length + 1 < MAX_WINNERS;

  if (route === 'tiles' && current !== null) {
    const scored = (result: ScoreResult, hand: HandState): WinEntry => ({
      winner: current,
      value: {
        source: 'scored',
        payment: result.payment,
        han: result.han,
        fu: result.fu,
        level: result.level,
        yakus: result.yakus,
        handTiles: encodeHandTiles(hand),
        open: isHandOpen(hand),
      },
    });
    return (
      <HandBuilder
        title={nameOf(current)}
        winds={{
          roundWind: state.round.wind,
          seatWind: seatWindOf(current, state.round),
        }}
        winMode={mode}
        riichiDeclared={state.pendingRiichi.includes(current)}
        onCancel={() => setRoute('menu')}
        onConfirm={(result, hand) => record(scored(result, hand))}
        onAddAnother={roomForMore ? (result, hand) => stage(scored(result, hand)) : undefined}
      />
    );
  }

  // A manual value is either a han/fu pair or a limit, never both.
  const manualBase = limit !== null
    ? LIMIT_BASE[limit] ?? null
    : (han !== null && fu !== null ? basePoints(han, fu) : null);

  const preview = manualBase !== null
    ? paymentTotal(paymentFor(manualBase, isDealer, mode))
    : null;

  const manualValue = (): HandValue | null => {
    if (manualBase === null || current === null) return null;
    return {
      source: 'manual',
      payment: paymentFor(manualBase, isDealer, mode),
      han: limit !== null ? null : han,
      fu: limit !== null ? null : fu,
      level: limit !== null ? limit : levelFor(han!, fu!),
      basePoints: manualBase,
      open,
    };
  };

  /**
   * The hand on screen, if it has a value yet. A winner can be selected with
   * nothing filled in -- that is a hand still being entered, not one to record.
   */
  const currentEntry: WinEntry | null = (() => {
    const value = manualValue();
    return value && current !== null ? { winner: current, value } : null;
  })();
  const currentIncomplete = current !== null && currentEntry === null;

  const pending = allWins(currentEntry ?? undefined);
  const canRecord = pending.length > 0
    && (mode === 'tsumo' || dealIn !== null)
    && !currentIncomplete;
  const canAddWinner = currentEntry !== null && roomForMore;

  /** Picking a limit clears the han/fu pair, and vice versa. */
  const pickLimit = (value: string) => {
    setLimit(limit === value ? null : value);
    setHan(null);
    setFu(null);
  };
  const pickHan = (value: number) => { setHan(han === value ? null : value); setLimit(null); };
  const pickFu = (value: number) => { setFu(fu === value ? null : value); setLimit(null); };

  // Each picker is disabled against what the *other* one already says, so the
  // impossible pairs cannot be reached from either direction.
  const hanBlocked = (value: number) =>
    fu !== null && !hanFuPossible(value, fu, mode);
  const fuBlocked = (value: number) =>
    han !== null ? !hanFuPossible(han, value, mode)
      : !HAN_STEPS.some((h) => hanFuPossible(h, value, mode));

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>Cancel</button>
        <h1 className="app__title">
          {current === null
            ? (staged.length > 0 ? 'Who else won?' : 'Who won?')
            : `${nameOf(current)} wins${isDealer ? ' (dealer)' : ''}`}
        </h1>
        <span className="app__barspacer" />
      </header>

      <div className="winmenu">
        {staged.length > 0 && (
          <div className="field">
            <span className="field__label">Also won this discard</span>
            <div className="winmenu__staged">
              {staged.map((w) => (
                <button key={w.winner} type="button" className="chip chip--staged"
                        onClick={() => setStaged(staged.filter((x) => x.winner !== w.winner))}
                        title="Remove this winner">
                  {nameOf(w.winner)} · {paymentTotal(w.value.payment).toLocaleString()} ✕
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">Winner</span>
          <div className="segmented segmented--gain" role="group" aria-label="Winner">
            {SEATS.map((seat) => (
              <button key={seat} type="button"
                      className={`segmented__btn${current === seat ? ' segmented__btn--on' : ''}`}
                      aria-pressed={current === seat}
                      // Only two things rule a seat out as winner: it already
                      // has a hand on this discard, or it is the discarder.
                      disabled={taken.has(seat) || seat === dealIn}
                      // Toggles: picking a winner by mistake must be undoable,
                      // since an unfinished hand blocks recording.
                      onClick={() => { setCurrent(current === seat ? null : seat); clearValue(); }}>
                {nameOf(seat)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">How</span>
          <div className="segmented" role="group" aria-label="How">
            {(['ron', 'tsumo'] as WinMode[]).map((opt) => (
              <button key={opt} type="button"
                      className={`segmented__btn${mode === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={mode === opt}
                      // A staged winner means a ron in progress; switching to a
                      // tsumo would leave those hands with nobody paying them.
                      disabled={staged.length > 0 && opt === 'tsumo'}
                      onClick={() => setMode(opt)}>
                {opt === 'ron' ? 'Ron' : 'Tsumo'}
              </button>
            ))}
          </div>
        </div>

        {/* Kept on screen and disabled for a tsumo rather than removed, so the
            layout does not jump when the mode is toggled. */}
        <div className="field">
          <span className="field__label">Dealt in</span>
          <div className="segmented segmented--loss" role="group" aria-label="Dealt in">
            {SEATS.map((seat) => (
              <button key={seat} type="button"
                      className={`segmented__btn${dealIn === seat ? ' segmented__btn--on' : ''}`}
                      aria-pressed={dealIn === seat}
                      // Nobody deals into their own hand, and a seat that won
                      // this discard cannot also have thrown it. Once a winner
                      // is staged the discarder is settled too -- however many
                      // players win, they all win off the same tile.
                      disabled={mode === 'tsumo' || staged.length > 0
                                || seat === current || taken.has(seat)}
                      onClick={() => setDealIn(dealIn === seat ? null : seat)}>
                {nameOf(seat)}
              </button>
            ))}
          </div>
          {staged.length > 0 && (
            <span className="field__hint">
              One discard, one discarder — {nameOf(dealIn!)} pays every winner.
            </span>
          )}
        </div>

        <button type="button" className="btn btn--primary btn--wide winmenu__tiles"
                disabled={!outcomeSettled}
                onClick={() => setRoute('tiles')}>
          Enter the hand and score it
        </button>
        {!outcomeSettled && (
          <span className="field__hint">Pick who dealt in first.</span>
        )}

        <div className="winmenu__or"><span>or set the value directly</span></div>

        <div className="field">
          <span className="field__label">Han</span>
          <div className="pills pills--fill" role="group" aria-label="Han">
            {HAN_STEPS.map((value) => (
              <button key={value} type="button"
                      className={`pill${han === value ? ' pill--on' : ''}`}
                      aria-pressed={han === value}
                      disabled={hanBlocked(value)}
                      onClick={() => pickHan(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Fu</span>
          <div className="pills pills--fill" role="group" aria-label="Fu">
            {FU_COMMON.map((value) => (
              <button key={value} type="button"
                      className={`pill${fu === value ? ' pill--on' : ''}`}
                      aria-pressed={fu === value}
                      disabled={fuBlocked(value)}
                      onClick={() => pickFu(value)}>
                {value}
              </button>
            ))}
          </div>
          <div className="pills" role="group" aria-label="Fu, higher">
            {FU_REST.map((value) => (
              <button key={value} type="button"
                      className={`pill${fu === value ? ' pill--on' : ''}`}
                      aria-pressed={fu === value}
                      disabled={fuBlocked(value)}
                      onClick={() => pickFu(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Or a limit</span>
          <div className="pills pills--grid" role="group" aria-label="Limit">
            {LIMITS.map((value) => (
              <button key={value} type="button"
                      className={`pill pill--limit${limit === value ? ' pill--on' : ''}`}
                      data-tier={levelTier(value)}
                      aria-pressed={limit === value}
                      onClick={() => pickLimit(value)}>
                {levelName(value) ?? value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Hand was</span>
          <div className="segmented" role="group" aria-label="Hand was">
            {[false, true].map((value) => (
              <button key={String(value)} type="button"
                      className={`segmented__btn${open === value ? ' segmented__btn--on' : ''}`}
                      aria-pressed={open === value}
                      onClick={() => setOpen(value)}>
                {value ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="app__spacer" />

      <div className="status">
        {current === null
          ? (staged.length > 0
              ? `${staged.length} hand${staged.length === 1 ? '' : 's'} entered — add another winner, or review.`
              : 'Pick the winner.')
          : preview !== null
            ? `${preview.toLocaleString()} points${state.honba > 0 ? ` + ${state.honba} honba` : ''}`
            : 'Pick han and fu, or a limit — or enter the tiles above.'}
      </div>

      {canAddWinner && (
        <button type="button" className="btn btn--wide"
                onClick={() => stage(currentEntry!)}>
          Add another winner on this discard
        </button>
      )}

      <button type="button" className="btn btn--primary btn--wide"
              disabled={!canRecord} onClick={() => record(currentEntry ?? undefined)}>
        {pending.length > 1 ? `Review ${pending.length} hands` : 'Review'}
      </button>
    </div>
  );
}
