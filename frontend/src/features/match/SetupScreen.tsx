/**
 * Match setup: who is playing, where they sit, and the rules.
 *
 * Each seat is chosen from the group's players (`players.ts`), who are created
 * on purpose on the Players screen -- typing here only searches, so a typo
 * cannot invent a person. Someone who is not a player sits as a guest: a name
 * on this match only, marked as such. Works offline from the cached list.
 */
import { useEffect, useRef, useState } from 'react';
import type { MatchConfig, SeatPlayer } from './matchState';
import { DEFAULTS } from './matchState';
import type { MatchLength, PlayerCount, Seat } from './seats';
import { roundKanji, roundName, seatsOf } from './seats';
import { SITUATION_WINDS, type Rule } from '../../scorer/types';
import {
  type Player, byName, cachedPlayers, findByName, markSeated, search, slugOf,
} from '../players/players';
import { refreshPlayers } from './syncClient';
import { okaOf, placeLabel } from './scoring';

const umaFields = (players: PlayerCount): string[] => DEFAULTS[players].uma.map(String);

/** How many matching players the picker lists at once. */
const MAX_OPTIONS = 8;

/** Fisher-Yates, so every seating is equally likely. */
function shuffled<T>(names: readonly T[]): T[] {
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
   * Always four slots, so switching to sanma and back does not lose whoever
   * was seated fourth. Only the first `players` are used.
   */
  const [allSeats, setAllSeats] = useState<(SeatPlayer | null)[]>([null, null, null, null]);
  /** What is typed in each seat's search box. */
  const [queries, setQueries] = useState<string[]>(['', '', '', '']);
  const [open, setOpen] = useState<Seat | null>(null);
  const [roster, setRoster] = useState<Player[]>(() => byName(cachedPlayers()));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [length, setLength] = useState<MatchLength>('south');
  const [redFives, setRedFives] = useState(true);
  /** Off by default: an open riichi ron is worth its 2 han like any other. */
  const [openRiichiYakuman, setOpenRiichiYakuman] = useState(false);
  const [startingPoints, setStartingPoints] = useState(DEFAULTS[4].startingPoints);
  const [targetScore, setTargetScore] = useState(DEFAULTS[4].targetScore);
  const [goalScore, setGoalScore] = useState(DEFAULTS[4].goalScore);
  const [uma, setUma] = useState<string[]>(() => umaFields(4));

  // The cache is enough to start with; the server's list replaces it if it answers.
  useEffect(() => {
    let cancelled = false;
    void refreshPlayers().then((list) => { if (list && !cancelled) setRoster(byName(list)); });
    return () => { cancelled = true; };
  }, []);

  const seats = seatsOf(players);
  const seated = allSeats.slice(0, players);

  const setQuery = (seat: Seat, value: string) =>
    setQueries((q) => q.map((v, i) => (i === seat ? value : v)));

  function choose(seat: Seat, choice: SeatPlayer | null) {
    const next = allSeats.map((v, i) => (i === seat ? choice : v));
    setAllSeats(next);
    setQuery(seat, '');
    if (choice === null) {
      setOpen(seat);
      setTimeout(() => inputs.current[seat]?.focus(), 0);
      return;
    }
    // On to the next empty seat, so four taps seat the table.
    const nextEmpty = seats.find((s) => next[s] === null);
    setOpen(nextEmpty ?? null);
    if (nextEmpty !== undefined) setTimeout(() => inputs.current[nextEmpty]?.focus(), 0);
  }

  /** What the open seat's list offers: matching players not already seated. */
  function optionsFor(seat: Seat): { players: Player[]; guest: string | null } {
    const query = queries[seat]!.trim();
    const taken = new Set(seated.map((c) => c?.playerId).filter(Boolean));
    const players = search(roster, query).filter((p) => !taken.has(p.id)).slice(0, MAX_OPTIONS);
    // A guest by a player's own name would be that player seated twice over.
    const guest = query && !findByName(roster, query) ? query : null;
    return { players, guest };
  }

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
    setTargetScore(DEFAULTS[count].targetScore);
    setGoalScore(DEFAULTS[count].goalScore);
  };

  const filled = seated.every((c) => c !== null);
  // The same test as "is this the same player": case and accents do not count.
  const duplicate = new Set(seated.filter((c) => c !== null).map((c) => slugOf(c!.name))).size
    < seated.filter((c) => c !== null).length;
  const umaValues = uma.map((v) => Number(v.trim()));
  const umaValid = umaValues.every((n) => Number.isFinite(n) && Number.isInteger(n));
  // Uma that does not sum to zero would invent or destroy points across the
  // group's whole history, so it is worth refusing rather than warning about.
  const umaBalanced = umaValid && umaValues.reduce((a, b) => a + b, 0) === 0;
  const oka = okaOf({ players, startingPoints, targetScore });
  // Below the start, the oka would be *taken from* 1st -- nobody plays that.
  const targetValid = targetScore >= startingPoints;
  const rulesValid = umaBalanced && targetValid;
  const rules: Rule[] = openRiichiYakuman ? ['riichiAbiertoRonYakuman'] : [];
  const ready = filled && !duplicate && rulesValid;

  function start() {
    if (!ready) return;
    const chosen = seated as SeatPlayer[];
    markSeated(chosen.flatMap((c) => (c.playerId ? [c.playerId] : [])));
    onStart({
      players,
      redFives,
      rules,
      length,
      startingPoints,
      targetScore,
      goalScore,
      uma: umaValues,
      seats: chosen,
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
                onClick={() => setAllSeats([...shuffled(seated), ...allSeats.slice(players)])}
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
          {players === 3 && (
            <span className="field__hint">
              Sanma: no chii, manzu 2–8 removed, North pulled as nukidora, tsumo
              paid by two players only, honba worth 1,000.
            </span>
          )}
        </div>

        <div className="field">
          <span className="field__label">Players</span>
          {seats.map((seat) => {
            const wind = roundName(SITUATION_WINDS[seat]!);
            const choice = seated[seat];
            const options = open === seat && !choice ? optionsFor(seat) : null;
            return (
              <div className="setup__seatblock" key={seat}>
                <div className="setup__seat">
                  <span className="setup__seatno" title={`Starts as ${wind}`}>
                    {roundKanji(SITUATION_WINDS[seat]!)}
                  </span>
                  {choice ? (
                    <button type="button" className="setup__chosen"
                            aria-label={`${wind}: ${choice.name}. Tap to change.`}
                            onClick={() => choose(seat, null)}>
                      <span className="setup__chosenname">{choice.name}</span>
                      {choice.playerId === null && <span className="setup__guest">guest</span>}
                      <span className="setup__clear" aria-hidden="true">×</span>
                    </button>
                  ) : (
                    <input className="setup__name"
                           ref={(el) => { inputs.current[seat] = el; }}
                           value={queries[seat]}
                           placeholder={`${wind}: choose a player`}
                           onFocus={() => setOpen(seat)}
                           onChange={(e) => { setQuery(seat, e.target.value); setOpen(seat); }}
                           onKeyDown={(e) => {
                             if (e.key !== 'Enter' || !options) return;
                             e.preventDefault();
                             const first = options.players[0];
                             if (first) choose(seat, { playerId: first.id, name: first.displayName });
                             else if (options.guest) choose(seat, { playerId: null, name: options.guest });
                           }}
                           aria-label={`${wind} seat`} />
                  )}
                </div>
                {options && (
                  // mousedown would blur the input before the click lands.
                  <div className="setup__options" onMouseDown={(e) => e.preventDefault()}>
                    {options.players.map((p) => (
                      <button key={p.id} type="button" className="setup__option"
                              onClick={() => choose(seat, { playerId: p.id, name: p.displayName })}>
                        {p.displayName}
                      </button>
                    ))}
                    {options.guest && (
                      <button type="button" className="setup__option setup__option--guest"
                              onClick={() => choose(seat, { playerId: null, name: options.guest! })}>
                        Seat “{options.guest}” as a guest
                      </button>
                    )}
                    {options.players.length === 0 && !options.guest && (
                      <span className="setup__hint">
                        {roster.length === 0
                          ? 'No players yet. Add them on the Players screen, or type a name to seat a guest.'
                          : 'Everyone is seated. Type a name to seat a guest.'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {duplicate && (
            <span className="setup__warn">Two seats have the same name.</span>
          )}
        </div>

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

        {/* Everything with a sensible default, folded away: most nights only
            the players and the length change. Opened by itself when something
            in it needs fixing, since Start is disabled until it is. */}
        <details className="setup__rules" open={!rulesValid || undefined}>
          <summary>
            <span className="setup__rulestitle">Rules</span>
            <span className="setup__rulessummary">
              {redFives ? 'red fives' : 'no red fives'}
              {' · '}uma {umaValues.map((n) => (n > 0 ? `+${n}` : `${n}`)).join('/')}
              {' · '}{startingPoints.toLocaleString()} → {targetScore.toLocaleString()}
              {' · '}goal {goalScore.toLocaleString()}
              {rules.length > 0 && ' · open riichi ron yakuman'}
            </span>
          </summary>
          <div className="field">
            <span className="field__label">Red fives</span>
            <div className="segmented" role="group" aria-label="Red fives">
              {[true, false].map((opt) => (
                <button key={String(opt)} type="button"
                        className={`segmented__btn${redFives === opt ? ' segmented__btn--on' : ''}`}
                        aria-pressed={redFives === opt}
                        onClick={() => setRedFives(opt)}>
                  {opt ? 'With red fives' : 'Without'}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">Ron on an open riichi</span>
            <div className="segmented" role="group" aria-label="Ron on an open riichi">
              {[false, true].map((opt) => (
                <button key={String(opt)} type="button"
                        className={`segmented__btn${openRiichiYakuman === opt ? ' segmented__btn--on' : ''}`}
                        aria-pressed={openRiichiYakuman === opt}
                        onClick={() => setOpenRiichiYakuman(opt)}>
                  {opt ? 'Yakuman' : 'Normal (2 han)'}
                </button>
              ))}
            </div>
            {openRiichiYakuman && (
              <span className="field__hint">
                Dealing into an open riichi is a yakuman, unless the discarder was in riichi too.
              </span>
            )}
          </div>

          <div className="field">
            <span className="field__label">Uma</span>
            <div className="setup__uma">
              {seats.map((seat) => placeLabel(seat + 1)).map((label, i) => (
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
          </div>

          <div className="setup__numbers">
            <label className="field">
              <span className="field__label">Starting points</span>
              <input className="setup__number" type="number" step={1000} min={0}
                     value={startingPoints}
                     onChange={(e) => setStartingPoints(Number(e.target.value))} />
            </label>
            <label className="field">
              <span className="field__label">Goal score</span>
              <input className="setup__number" type="number" step={1000} min={0}
                     value={goalScore}
                     onChange={(e) => setGoalScore(Number(e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Target score</span>
            <input className="setup__number" type="number" step={1000} min={0}
                   value={targetScore}
                   onChange={(e) => setTargetScore(Number(e.target.value))} />
          </label>
          <span className="field__hint">
            The goal decides when the match ends: if nobody has reached it by the
            end of the last round, play goes on for one more wind, until somebody
            does or that wind is over.
          </span>
          <span className="field__hint">
            The target is what everyone is measured against at the end: each
            result is final score − target + uma, and 1st also takes the oka,
            {' '}{oka >= 0
              ? `(${targetScore.toLocaleString()} − ${startingPoints.toLocaleString()}) × ${players} = ${oka.toLocaleString()}`
              : 'which is negative here'}. The results always sum to zero.
          </span>
          {!targetValid && (
            <span className="setup__warn">The target cannot be below the starting points.</span>
          )}
        </details>
      </div>

      <div className="app__spacer" />

      {/* Pinned to the bottom, so the way on is always in sight -- even disabled. */}
      <div className="app__footer">
        <button type="button" className="btn btn--primary btn--wide"
                disabled={!ready} onClick={start}>
          Start match
        </button>
      </div>
    </div>
  );
}
