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
import type { Rule, ScoreResult, WinMode } from '../../scorer/types';
import { HandBuilder } from '../hand/HandBuilder';
import { encodeHandTiles } from '../hand/handTiles';
import { isHandOpen, toFlags, type HandState } from '../hand/handState';
import { levelName, levelTier } from '../hand/yakuNames';
import type { HandValue, MatchState, WinEntry } from './matchState';
import { dealerSeat, seatsIn } from './matchState';
import {
  LIMIT_BASE, MANUAL_FU, MANUAL_HAN, basePoints, levelFor, manualReachable, paymentFor,
  paymentTotal, type ManualShape,
} from './scoring';
import type { Seat } from './seats';
import { seatWindOf } from './seats';

/**
 * The common fu get a row to themselves because they are what you reach for;
 * the rest sit below. Both rows share their width evenly.
 */
const FU_COMMON = MANUAL_FU.filter((fu) => fu <= 50);
const FU_REST = MANUAL_FU.filter((fu) => fu > 50);

/**
 * Limits offered directly, for when nobody counted the fu. Two to a row, in
 * ascending pairs, with the yakuman alone across its own row and the double
 * and triple below it -- a double yakuman hand, or two yakuman at once.
 */
const LIMITS = [
  'mangan', 'haneman', 'baiman', 'sanbaiman', 'yakuman', 'dobleYakuman', 'tripleYakuman',
] as const;


type Route = 'menu' | 'tiles';

/**
 * Everything entered in the menu, so it can be handed back: the review screen
 * sits outside the menu, and Back from it must return to the form as it was
 * left -- winners, value, tiles and all -- rather than to an empty one.
 */
export interface WinDraft {
  mode: WinMode;
  dealIn: Seat | null;
  staged: WinEntry[];
  current: Seat | null;
  han: number | null;
  fu: number | null;
  limit: string | null;
  open: boolean | null;
  route: Route;
  /** The tiles of the hand being built, kept when the builder is left. */
  hand: HandState | null;
}

export function WinMenu({ state, winner, draft, onRecord, onCancel }: {
  state: MatchState;
  winner: Seat;
  /** The form as it was left, when coming back from the review. */
  draft?: WinDraft;
  onRecord: (args: { mode: WinMode; dealIn: Seat | null; wins: WinEntry[] }, draft: WinDraft) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<WinMode>(draft?.mode ?? 'ron');
  const [dealIn, setDealIn] = useState<Seat | null>(draft?.dealIn ?? null);
  /** Winners already settled; the form below is the one being entered now. */
  const [staged, setStaged] = useState<WinEntry[]>(draft?.staged ?? []);
  /** Null right after staging a winner, until the next one is picked. */
  const [current, setCurrent] = useState<Seat | null>(draft ? draft.current : winner);
  const [han, setHan] = useState<number | null>(draft?.han ?? null);
  const [fu, setFu] = useState<number | null>(draft?.fu ?? null);
  const [limit, setLimit] = useState<string | null>(draft?.limit ?? null);
  /** Optional: null until somebody says, and a second tap takes it back. */
  const [open, setOpen] = useState<boolean | null>(draft?.open ?? null);
  const [route, setRoute] = useState<Route>(draft?.route ?? 'menu');
  /**
   * The tile builder's hand, put aside when it is left, so Back and a second
   * "Enter the hand" carry on from it. Changing the winner or the win keeps
   * it: the builder brings it in line with whatever changed.
   */
  const [hand, setHand] = useState<HandState | null>(draft?.hand ?? null);

  const players = state.config.players;
  const seats = seatsIn(state);
  const dealer = dealerSeat(state);
  const isDealer = current === dealer;
  /**
   * From the table, like the tile builder's riichi: a declared riichi means a
   * closed hand, so the menu says so rather than asking.
   */
  const riichi = current !== null && state.pendingRiichi.includes(current);
  const handOpen = riichi ? false : open;
  /**
   * Everybody but the discarder can ron the same tile: three winners at a
   * four-player table, two in sanma.
   */
  const maxWinners = players - 1;
  const nameOf = (seat: Seat) => state.config.seats[seat]!.name;

  /** Seats already holding a winning hand this discard. */
  const taken = new Set(staged.map((w) => w.winner));
  /** A ron needs a discarder, and nobody may win off their own discard. */
  const outcomeSettled = current !== null
    && (mode === 'tsumo' || (dealIn !== null && dealIn !== current));

  const clearValue = () => { setHan(null); setFu(null); setLimit(null); setOpen(null); };

  /** Everything entered so far, plus the hand on screen if it is complete. */
  const allWins = (extra?: WinEntry): WinEntry[] => [...staged, ...(extra ? [extra] : [])];

  const record = (extra?: WinEntry, from: Route = route, tiles: HandState | null = hand) => onRecord({
    mode,
    dealIn: mode === 'ron' ? dealIn : null,
    wins: allWins(extra),
  }, { mode, dealIn, staged, current, han, fu, limit, open, route: from, hand: tiles });

  /** Puts a hand aside and goes back for the next winner's. */
  const stage = (entry: WinEntry) => {
    setStaged([...staged, entry]);
    setCurrent(null);
    clearValue();
    setHand(null);
    setRoute('menu');
  };

  /** Room for another winner: everyone but the discarder can ron one discard. */
  const roomForMore = mode === 'ron' && staged.length + 1 < maxWinners;

  /**
   * The match's house rules, as they apply to this hand. A ron on an open
   * riichi is a yakuman only when the discarder was not in riichi too: a
   * player in riichi has no choice about what to throw.
   */
  const rulesForHand: Rule[] = state.config.rules.filter((rule) => rule !== 'riichiAbiertoRonYakuman'
    || (mode === 'ron' && dealIn !== null && !state.pendingRiichi.includes(dealIn)));

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
        // The tiles alone cannot be re-scored: nothing in them says the win was
        // on the last discard, or off a kan replacement.
        flags: toFlags(hand),
        open: isHandOpen(hand),
      },
    });
    return (
      <HandBuilder
        title={nameOf(current)}
        attribution={{
          winner: nameOf(current),
          ...(mode === 'ron' && dealIn !== null ? { dealIn: nameOf(dealIn) } : {}),
        }}
        winds={{
          roundWind: state.round.wind,
          seatWind: seatWindOf(current, state.round, players),
        }}
        players={players}
        redFives={state.config.redFives}
        winMode={mode}
        riichiDeclared={state.pendingRiichi.includes(current)}
        rules={rulesForHand}
        draft={hand ?? undefined}
        onCancel={(tiles) => { setHand(tiles); setRoute('menu'); }}
        onConfirm={(result, tiles) => record(scored(result, tiles), 'tiles', tiles)}
        onAddAnother={roomForMore ? (result, hand) => stage(scored(result, hand)) : undefined}
      />
    );
  }

  // A manual value is either a han/fu pair or a limit, never both.
  const manualBase = limit !== null
    ? LIMIT_BASE[limit] ?? null
    : (han !== null && fu !== null ? basePoints(han, fu) : null);

  const preview = manualBase !== null
    ? paymentTotal(paymentFor(manualBase, isDealer, mode), players)
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
      open: handOpen,
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

  // A button is disabled when choosing it would leave no real hand, given
  // everything else already chosen -- so an impossible combination cannot be
  // reached from any direction. See `manualReachable`.
  const shape: ManualShape = { mode, riichi, open: handOpen, han, fu };
  const blocked = (patch: Partial<ManualShape>) => !manualReachable({ ...shape, ...patch });

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
                  {nameOf(w.winner)} · {paymentTotal(w.value.payment, players).toLocaleString()} ✕
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">Winner</span>
          <div className="segmented segmented--gain" role="group" aria-label="Winner">
            {seats.map((seat) => (
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
                      disabled={(staged.length > 0 && opt === 'tsumo') || blocked({ mode: opt })}
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
            {seats.map((seat) => (
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
            {MANUAL_HAN.map((value) => (
              <button key={value} type="button"
                      className={`pill${han === value ? ' pill--on' : ''}`}
                      aria-pressed={han === value}
                      disabled={blocked({ han: value })}
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
                      disabled={blocked({ fu: value })}
                      onClick={() => pickFu(value)}>
                {value}
              </button>
            ))}
          </div>
          <div className="pills pills--fill" role="group" aria-label="Fu, higher">
            {FU_REST.map((value) => (
              <button key={value} type="button"
                      className={`pill${fu === value ? ' pill--on' : ''}`}
                      aria-pressed={fu === value}
                      disabled={blocked({ fu: value })}
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
                      data-level={value}
                      aria-pressed={limit === value}
                      onClick={() => pickLimit(value)}>
                {levelName(value) ?? value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">
            Hand was{!riichi && <span className="field__optional">optional</span>}
          </span>
          <div className="segmented" role="group" aria-label="Hand was">
            {[false, true].map((value) => (
              <button key={String(value)} type="button"
                      className={`segmented__btn${handOpen === value ? ' segmented__btn--on' : ''}`}
                      aria-pressed={handOpen === value}
                      disabled={riichi || blocked({ open: value })}
                      onClick={() => setOpen(open === value ? null : value)}>
                {value ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>
          {riichi && (
            <span className="field__hint">
              {nameOf(current!)} declared riichi, so the hand was closed.
            </span>
          )}
        </div>
      </div>

      <div className="app__spacer" />

      {/* Pinned to the bottom, so the way on is always in sight -- even disabled. */}
      <div className="app__footer">
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
    </div>
  );
}
