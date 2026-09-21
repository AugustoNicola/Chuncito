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
import type { MatchConfig, SeatPlayer } from './matchState';
import { DEFAULTS } from './matchState';
import type { MatchLength, PlayerCount, Seat } from './seats';
import { roundKanji, roundName, seatsOf } from './seats';
import { SITUATION_WINDS } from '../../scorer/types';
import { recallNames, rememberNames } from './persistence';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

const umaFields = (players: PlayerCount): string[] => DEFAULTS[players].uma.map(String);

/** Fisher-Yates, so every seating is equally likely. */
function shuffled(names: readonly string[]): string[] {
  const out = [...names];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function SetupScreen({ onStart, onCancel }: {
  onStart: (config: MatchConfig) => void;
  onCancel?: () => void;
}) {
  const [players, setPlayers] = useState<PlayerCount>(4);
  /**
   * Always four slots, so switching to sanma and back does not lose the name
   * typed for the fourth seat. Only the first `players` are used.
   */
  const [allNames, setAllNames] = useState<string[]>(['', '', '', '']);
  const [length, setLength] = useState<MatchLength>('south');
  const [startingPoints, setStartingPoints] = useState(DEFAULTS[4].startingPoints);
  const [returnScore, setReturnScore] = useState(DEFAULTS[4].returnScore);
  const [uma, setUma] = useState<string[]>(() => umaFields(4));
  const [remembered] = useState<string[]>(() => recallNames());

  const seats = seatsOf(players);
  const names = allNames.slice(0, players);

  const setName = (seat: Seat, value: string) =>
    setAllNames((n) => n.map((v, i) => (i === seat ? value : v)));

  /**
   * The point defaults and uma differ between the two, so changing the player
   * count resets them to that table's defaults rather than carrying a 25,000
   * start into sanma.
   */
  const pickPlayers = (count: PlayerCount) => {
    if (count === players) return;
    setPlayers(count);
    setUma(umaFields(count));
    setStartingPoints(DEFAULTS[count].startingPoints);
    setReturnScore(DEFAULTS[count].returnScore);
  };

  const filled = names.every((n) => n.trim().length > 0);
  const duplicate = new Set(names.map((n) => n.trim().toLowerCase())).size < players;
  const umaValues = uma.map((v) => Number(v.trim()));
  const umaValid = umaValues.every((n) => Number.isFinite(n) && Number.isInteger(n));
  // Uma that does not sum to zero would invent or destroy points across the
  // group's whole history, so it is worth refusing rather than warning about.
  const umaBalanced = umaValid && umaValues.reduce((a, b) => a + b, 0) === 0;
  const ready = filled && !duplicate && umaBalanced;

  /** Free names, for the quick-fill chips: those not already seated. */
  const unused = remembered.filter(
    (n) => !names.some((v) => v.trim().toLowerCase() === n.toLowerCase()),
  );
  const firstEmpty = names.findIndex((n) => n.trim() === '');

  function start() {
    if (!ready) return;
    const trimmed = names.map((n) => n.trim());
    rememberNames(trimmed);
    onStart({
      players,
      length,
      startingPoints,
      returnScore,
      uma: umaValues,
      seats: trimmed.map<SeatPlayer>((name) => ({ playerId: null, name })),
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
                onClick={() => setAllNames([...shuffled(names), ...allNames.slice(players)])}
                disabled={!filled}
                title="Shuffle the seating">
          Shuffle
        </button>
      </header>

      <div className="setup">
        <div className="field">
          <span className="field__label">Table</span>
          <div className="segmented" role="group" aria-label="Table">
            {([4, 3] as PlayerCount[]).map((opt) => (
              <button key={opt} type="button"
                      className={`segmented__btn${players === opt ? ' segmented__btn--on' : ''}`}
                      aria-pressed={players === opt}
                      onClick={() => pickPlayers(opt)}>
                {opt === 4 ? 'Four players' : 'Three (sanma)'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Players</span>
          {seats.map((seat) => (
            <div className="setup__seat" key={seat}>
              <span className="setup__seatno"
                    title={`Starts as ${roundName(SITUATION_WINDS[seat]!)}`}>
                {roundKanji(SITUATION_WINDS[seat]!)}
              </span>
              <input className="setup__name"
                     value={allNames[seat]}
                     placeholder={roundName(SITUATION_WINDS[seat]!)}
                     onChange={(e) => setName(seat, e.target.value)}
                     aria-label={`${roundName(SITUATION_WINDS[seat]!)} seat name`} />
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
                {opt === 'east' ? 'East match' : 'South match'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Uma</span>
          <div className="setup__uma">
            {PLACE_LABEL.slice(0, players).map((label, i) => (
              <label className="setup__umafield" key={label}>
                <span className="setup__umaplace">{label}</span>
                <input className="setup__number" type="text" inputMode="numeric"
                       value={uma[i]}
                       aria-label={`Uma for ${label}`}
                       onChange={(e) => setUma(
                         (u) => u.map((v, j) => (j === i ? e.target.value : v)))} />
              </label>
            ))}
          </div>
          {!umaValid && <span className="setup__warn">Uma must be whole numbers.</span>}
          {umaValid && !umaBalanced && (
            <span className="setup__warn">
              Uma has to sum to zero; this adds up to {umaValues.reduce((a, b) => a + b, 0)}.
            </span>
          )}
          <span className="field__hint">Placement points only — no oka.</span>
          {players === 3 && (
            <span className="field__hint">
              Sanma: no chii, manzu 2–8 removed, North pulled as nukidora, tsumo
              paid by two players only, honba worth 1,000.
            </span>
          )}
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
