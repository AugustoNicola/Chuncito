/**
 * Match setup: who is playing, where they sit, and the rules.
 *
 * Players are plain names for now. Phase 3 introduces the `players` table and a
 * real roster; until then names typed here are remembered locally and offered
 * as chips, which is most of the convenience of a roster at none of the cost.
 * `playerId` stays null, so every seat is a `guest_name` row -- exactly what the
 * data model already says a guest is.
 */
import { useState } from 'react';
import { DEFAULT_UMA, type MatchConfig, type SeatPlayer } from './matchState';
import type { MatchLength, Seat } from './seats';
import { SEATS } from './seats';
import { recallNames, rememberNames } from './persistence';

type Names = [string, string, string, string];

const UMA_PRESETS: { label: string; uma: readonly [number, number, number, number] }[] = [
  { label: '10 / 20', uma: [20, 10, -10, -20] },
  { label: '10 / 30', uma: [30, 10, -10, -30] },
  { label: '5 / 15', uma: [15, 5, -5, -15] },
];

/** Fisher-Yates, so every seating is equally likely. */
function shuffled(names: Names): Names {
  const out = [...names];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out as Names;
}

export function SetupScreen({ onStart, onCancel }: {
  onStart: (config: MatchConfig) => void;
  onCancel?: () => void;
}) {
  const [names, setNames] = useState<Names>(['', '', '', '']);
  const [length, setLength] = useState<MatchLength>('south');
  const [startingPoints, setStartingPoints] = useState(25000);
  const [returnScore, setReturnScore] = useState(30000);
  const [umaIndex, setUmaIndex] = useState(0);
  const [remembered] = useState<string[]>(() => recallNames());

  const setName = (seat: Seat, value: string) =>
    setNames((n) => n.map((v, i) => (i === seat ? value : v)) as Names);

  const filled = names.every((n) => n.trim().length > 0);
  const duplicate = new Set(names.map((n) => n.trim().toLowerCase())).size < 4;
  const ready = filled && !duplicate;

  /** Free names, for the quick-fill chips: those not already seated. */
  const unused = remembered.filter(
    (n) => !names.some((v) => v.trim().toLowerCase() === n.toLowerCase()),
  );
  const firstEmpty = names.findIndex((n) => n.trim() === '');

  function start() {
    if (!ready) return;
    const trimmed = names.map((n) => n.trim()) as Names;
    rememberNames(trimmed);
    const seats = trimmed.map<SeatPlayer>((name) => ({ playerId: null, name })) as
      [SeatPlayer, SeatPlayer, SeatPlayer, SeatPlayer];
    onStart({
      length,
      startingPoints,
      returnScore,
      uma: UMA_PRESETS[umaIndex]?.uma ?? DEFAULT_UMA,
      seats,
    });
  }

  return (
    <div className="app">
      <header className="app__bar">
        {onCancel && (
          <button type="button" className="btn btn--quiet" onClick={onCancel}>Back</button>
        )}
        <h1 className="app__title">New match</h1>
        <button type="button" className="btn btn--quiet"
                onClick={() => setNames(shuffled(names))}
                disabled={!filled}
                title="Shuffle the seating">
          Shuffle
        </button>
      </header>

      <div className="setup">
        <div className="field">
          <span className="field__label">Players — seat 1 starts as dealer</span>
          {SEATS.map((seat) => (
            <div className="setup__seat" key={seat}>
              <span className="setup__seatno">{seat + 1}</span>
              <input className="setup__name"
                     value={names[seat]}
                     placeholder={`Player ${seat + 1}`}
                     onChange={(e) => setName(seat, e.target.value)}
                     aria-label={`Seat ${seat + 1} name`} />
            </div>
          ))}
          {duplicate && filled && (
            <span className="setup__warn">Two seats have the same name.</span>
          )}
        </div>

        {unused.length > 0 && (
          <div className="field">
            <span className="field__label">Played before</span>
            <div className="setup__chips">
              {unused.map((name) => (
                <button key={name} type="button" className="chip"
                        disabled={firstEmpty < 0}
                        onClick={() => firstEmpty >= 0 && setName(firstEmpty as Seat, name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">Length</span>
          <div className="segmented" role="group" aria-label="Length">
            {(['east', 'south'] as MatchLength[]).map((opt) => (
              <button key={opt} type="button"
                      className={`segmented__btn${length === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={length === opt}
                      onClick={() => setLength(opt)}>
                {opt === 'east' ? 'East (tonpuusen)' : 'South (hanchan)'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Uma — 1st / 2nd / 3rd / 4th</span>
          <div className="segmented" role="group" aria-label="Uma">
            {UMA_PRESETS.map((preset, i) => (
              <button key={preset.label} type="button"
                      className={`segmented__btn${umaIndex === i ? ' segmented__btn--on' : ''}`}
                      aria-pressed={umaIndex === i}
                      onClick={() => setUmaIndex(i)}>
                {preset.label}
              </button>
            ))}
          </div>
          <span className="field__hint">
            {(UMA_PRESETS[umaIndex]?.uma ?? DEFAULT_UMA)
              .map((u) => (u > 0 ? `+${u}` : `${u}`)).join(' · ')}
            {' — placement points only, no oka.'}
          </span>
        </div>

        <div className="setup__numbers">
          <label className="field">
            <span className="field__label">Starting points</span>
            <input className="setup__number" type="number" step={1000} min={0}
                   value={startingPoints}
                   onChange={(e) => setStartingPoints(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field__label">Target score</span>
            <input className="setup__number" type="number" step={1000} min={0}
                   value={returnScore}
                   onChange={(e) => setReturnScore(Number(e.target.value))} />
          </label>
        </div>
        <span className="field__hint">
          The target only decides when the match ends: reach it by the final round
          or play on into sudden death.
        </span>
      </div>

      <div className="app__spacer" />

      <button type="button" className="btn btn--primary btn--wide"
              disabled={!ready} onClick={start}>
        Start match
      </button>
    </div>
  );
}
