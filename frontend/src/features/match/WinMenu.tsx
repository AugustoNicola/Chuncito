/**
 * Recording a win.
 *
 * Two routes to the same `HandValue`: type the value in ("3 han 50 fu",
 * "haneman"), or build the hand tile by tile and let the engine score it. The
 * second route is the whole reason the Prolog engine is here, but the first is
 * what you use when the hand has already been scattered back into the wall and
 * somebody just says the number.
 *
 * Either way the winner's seat is known, so the seat wind is derived rather than
 * asked for -- see `HandBuilderProps.winds`.
 */
import { useState } from 'react';
import type { ScoreResult, WinMode } from '../../scorer/types';
import { HandBuilder } from '../hand/HandBuilder';
import { encodeHandTiles } from '../hand/handTiles';
import { isHandOpen, type HandState } from '../hand/handState';
import { levelName } from '../hand/yakuNames';
import type { HandValue, MatchState } from './matchState';
import { dealerSeat } from './matchState';
import { LIMIT_BASE, basePoints, levelFor, paymentFor, paymentTotal } from './scoring';
import type { Seat } from './seats';
import { SEATS, seatWindOf } from './seats';

/** Fu values the rules can actually produce. 25 is chiitoitsu; 20 is a pinfu tsumo. */
const FU_STEPS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const HAN_STEPS = [1, 2, 3, 4];

/** Limits offered directly, for when nobody counted the fu. */
const LIMITS = ['mangan', 'haneman', 'baiman', 'sanbaiman', 'yakuman'] as const;

type Route = 'menu' | 'tiles';

export function WinMenu({ state, winner, onRecord, onCancel }: {
  state: MatchState;
  winner: Seat;
  onRecord: (args: { mode: WinMode; dealIn: Seat | null; value: HandValue }) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<WinMode>('ron');
  const [dealIn, setDealIn] = useState<Seat | null>(null);
  const [han, setHan] = useState<number | null>(null);
  const [fu, setFu] = useState<number | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<Route>('menu');

  const dealer = dealerSeat(state);
  const isDealer = winner === dealer;
  const winnerName = state.config.seats[winner]!.name;

  if (route === 'tiles') {
    return (
      <HandBuilder
        title={winnerName}
        winds={{
          roundWind: state.round.wind,
          seatWind: seatWindOf(winner, state.round),
        }}
        winMode={mode}
        onCancel={() => setRoute('menu')}
        onConfirm={(result: ScoreResult, hand: HandState) => {
          onRecord({
            mode,
            dealIn: mode === 'ron' ? dealIn : null,
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
        }}
      />
    );
  }

  // A manual value is either a han/fu pair or a limit, never both.
  const manualBase = limit !== null
    ? LIMIT_BASE[limit] ?? null
    : (han !== null && fu !== null ? basePoints(han, fu) : null);

  /** A ron needs a discarder before anything can be recorded against it. */
  const outcomeSettled = mode === 'tsumo' || dealIn !== null;
  const ready = manualBase !== null && outcomeSettled;
  const preview = manualBase !== null
    ? paymentTotal(paymentFor(manualBase, isDealer, mode))
    : null;

  function recordManual() {
    if (manualBase === null) return;
    onRecord({
      mode,
      dealIn: mode === 'ron' ? dealIn : null,
      value: {
        source: 'manual',
        payment: paymentFor(manualBase, isDealer, mode),
        han: limit !== null ? null : han,
        fu: limit !== null ? null : fu,
        level: limit !== null ? limit : levelFor(han!, fu!),
        basePoints: manualBase,
        open,
      },
    });
  }

  /** Picking a limit clears the han/fu pair, and vice versa. */
  const pickLimit = (value: string) => {
    setLimit(limit === value ? null : value);
    setHan(null);
    setFu(null);
  };
  const pickHan = (value: number) => { setHan(han === value ? null : value); setLimit(null); };
  const pickFu = (value: number) => { setFu(fu === value ? null : value); setLimit(null); };

  return (
    <div className="app">
      <header className="app__bar">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>Cancel</button>
        <h1 className="app__title">
          {winnerName} wins{isDealer ? ' (dealer)' : ''}
        </h1>
        <span className="app__barspacer" />
      </header>

      <div className="winmenu">
        <div className="field">
          <span className="field__label">How</span>
          <div className="segmented" role="group" aria-label="How">
            {(['ron', 'tsumo'] as WinMode[]).map((opt) => (
              <button key={opt} type="button"
                      className={`segmented__btn${mode === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={mode === opt}
                      onClick={() => { setMode(opt); if (opt === 'tsumo') setDealIn(null); }}>
                {opt === 'ron' ? 'Ron' : 'Tsumo'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'ron' && (
          <div className="field">
            <span className="field__label">Dealt in</span>
            <div className="segmented" role="group" aria-label="Dealt in">
              {SEATS.filter((s) => s !== winner).map((seat) => (
                <button key={seat} type="button"
                        className={`segmented__btn${dealIn === seat ? ' segmented__btn--on' : ''}`}
                        aria-pressed={dealIn === seat}
                        onClick={() => setDealIn(dealIn === seat ? null : seat)}>
                  {state.config.seats[seat]!.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <div className="pills" role="group" aria-label="Han">
            {HAN_STEPS.map((value) => (
              <button key={value} type="button"
                      className={`pill${han === value ? ' pill--on' : ''}`}
                      aria-pressed={han === value}
                      onClick={() => pickHan(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Fu</span>
          <div className="pills" role="group" aria-label="Fu">
            {FU_STEPS.map((value) => (
              <button key={value} type="button"
                      className={`pill${fu === value ? ' pill--on' : ''}`}
                      aria-pressed={fu === value}
                      onClick={() => pickFu(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Or a limit</span>
          <div className="pills" role="group" aria-label="Limit">
            {LIMITS.map((value) => (
              <button key={value} type="button"
                      className={`pill pill--limit${limit === value ? ' pill--on' : ''}`}
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
          <span className="field__hint">
            Only recorded for the stats; it does not change the points.
          </span>
        </div>
      </div>

      <div className="app__spacer" />

      <div className="status">
        {preview !== null
          ? `${preview.toLocaleString()} points${state.honba > 0 ? ` + ${state.honba} honba` : ''}`
          : 'Pick han and fu, or a limit.'}
      </div>

      <button type="button" className="btn btn--primary btn--wide"
              disabled={!ready} onClick={recordManual}>
        Record
      </button>
    </div>
  );
}
