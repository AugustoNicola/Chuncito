/**
 * The match's standings over time: one line per player, their place after
 * every hand, 1st at the top -- or their score, the default, which shows how
 * far apart the places are. Shown above the timeline, at the table and in a
 * review, so who led when can be read at a glance. The deal-in is left out:
 * everyone is level there, so it said nothing but took a column.
 *
 * Each player keeps the colour of the wind they started on -- East blue,
 * South red, West green, North orange (`--wind-*`) -- the same seat, as
 * drawn, that the standings mark with its kanji. Plain SVG, like the
 * profile's placement line, whose look and tooltip it shares.
 */
import { useState } from 'react';
import type { SituationWind } from '../../scorer/types';
import type { MatchState, Standing } from './matchState';
import { placeLabel } from './scoring';
import { type Seat, roundLabel, seatsOf, seatWindOf } from './seats';
import { WindMark } from './WindMark';

const W = 340, H = 130;
const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
const START = { wind: 'este', number: 1 } as const;
const SHORT: Record<SituationWind, string> = { este: 'E', sur: 'S', oeste: 'W', norte: 'N' };

type View = 'place' | 'points';

/** Gridline spacings to choose from, so the score axis reads in round thousands. */
const STEPS = [1000, 2000, 5000, 10000, 20000, 50000];

/**
 * The score axis: the range every point falls in, with a little room so a
 * line is never drawn on the frame, and gridlines at whichever round spacing
 * puts at most five inside it. Never flat, even when nobody's score has moved.
 */
export function scoreAxis(over: readonly Standing[], seats: readonly Seat[]): {
  lo: number; hi: number; ticks: number[];
} {
  const all = over.flatMap((s) => seats.map((seat) => s.scores[seat]));
  const min = Math.min(...all), max = Math.max(...all);
  const room = Math.max(500, (max - min) * 0.06);
  const lo = min - room, hi = max + room;
  const within = (d: number) => {
    const out: number[] = [];
    // `+ 0` turns the -0 that rounding up a negative can give into 0.
    for (let t = Math.ceil(lo / d) * d + 0; t <= hi; t += d) out.push(t);
    return out;
  };
  const step = STEPS.find((d) => within(d).length <= 5) ?? STEPS.at(-1)!;
  return { lo, hi, ticks: within(step) };
}

/** "25k", "-3k", "12.5k": thousands, as the gridlines fall on them. */
const thousands = (n: number) => `${n / 1000}k`;

export function StandingsChart({ state, over }: {
  state: MatchState;
  /** `standingsOverTime(state)`: the start, then one entry per hand. */
  over: readonly Standing[];
}) {
  const [hot, setHot] = useState<number | null>(null);
  // Points first: the gaps between players say more than the order alone.
  const [view, setView] = useState<View>('points');
  const players = state.config.players;
  const seats = seatsOf(players);
  /** Point `i` is the table after hand `i`. */
  const points = over.slice(1);
  const n = points.length;
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  // A single hand sits in the middle rather than against the axis.
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const axis = scoreAxis(points, seats);
  const yPlace = (place: number) => PAD.top + ((place - 1) / (players - 1)) * plotH;
  const yScore = (score: number) => PAD.top + ((axis.hi - score) / (axis.hi - axis.lo)) * plotH;
  const y = (s: Standing, seat: Seat) =>
    (view === 'place' ? yPlace(s.places[seat]!) : yScore(s.scores[seat]));
  const grid = view === 'place'
    ? seats.map((s) => ({ at: yPlace(s + 1), text: placeLabel(s + 1) }))
    : axis.ticks.map((t) => ({ at: yScore(t), text: thousands(t) }));
  const windOf = (seat: Seat) => seatWindOf(seat, START, players);
  /** The hand point `i` comes after. */
  const label = (i: number) => {
    const row = state.hands[i]!;
    return `${roundLabel({ wind: row.roundWind, number: row.roundNumber })}${row.honba > 0 ? ` +${row.honba}` : ''}`;
  };
  // A tick per round, not per repeat: "E1" once however many honba it ran to.
  const ticks = state.hands.flatMap((row, i) => {
    const prev = state.hands[i - 1];
    return prev && prev.roundWind === row.roundWind && prev.roundNumber === row.roundNumber
      ? [] : [{ i, text: `${SHORT[row.roundWind]}${row.roundNumber}` }];
  });
  // Past a few dozen points the dots would merge into the lines.
  const dots = n <= 30;
  const focus = hot === null ? null : points[hot] ?? null;
  const step = n === 1 ? plotW : plotW / (n - 1);

  return (
    <div className="standchart">
      <div className="segmented segmented--small standchart__view" role="group" aria-label="Chart shows">
        {(['place', 'points'] as View[]).map((opt) => (
          <button key={opt} type="button"
                  className={`segmented__btn${view === opt ? ' segmented__btn--on' : ''}`}
                  aria-pressed={view === opt}
                  onClick={() => setView(opt)}>
            {opt === 'place' ? 'Place' : 'Points'}
          </button>
        ))}
      </div>
      <div className="linechart">
        <svg className="linechart__svg" viewBox={`0 0 ${W} ${H}`} role="img"
             aria-label={`${view === 'place' ? 'Places' : 'Scores'} over ${n} hand${n === 1 ? '' : 's'}`}>
          {grid.map((g) => (
            <g key={g.text}>
              <line x1={PAD.left} x2={W - PAD.right} y1={g.at} y2={g.at} className="linechart__grid" />
              <text x={PAD.left - 7} y={g.at} className="linechart__axis">{g.text}</text>
            </g>
          ))}
          {focus && hot !== null && (
            <line x1={x(hot)} x2={x(hot)} y1={PAD.top} y2={H - PAD.bottom} className="linechart__cross" />
          )}
          {seats.map((seat) => (
            <g key={seat} className="standchart__series" data-wind={windOf(seat)}>
              <polyline className="standchart__line"
                        points={points.map((s, i) => `${x(i).toFixed(1)},${y(s, seat).toFixed(1)}`).join(' ')} />
              {points.map((s, i) => (dots || hot === i) && (
                <circle key={i} cx={x(i)} cy={y(s, seat)} r={hot === i ? 4 : 2.5}
                        className="standchart__dot" />
              ))}
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t.i} x={x(t.i)} y={H - 6} className="linechart__axis standchart__tick">{t.text}</text>
          ))}
          {/* A column per point, a thumb wide, for the tooltip. */}
          {points.map((_, i) => (
            <rect key={i} x={x(i) - step / 2} y={0} width={step} height={H} className="standchart__hit"
                  onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)}
                  onClick={() => setHot(i)} />
          ))}
        </svg>
        {focus && hot !== null && (
          <div className="linechart__tip"
               style={{ left: `${Math.min(80, Math.max(20, (x(hot) / W) * 100))}%`, top: `${(PAD.top / H) * 100}%` }}>
            <span className="linechart__tipname">{label(hot)}</span>
            <span className="linechart__tiptable">
              {[...seats].sort((a, b) => focus.places[a]! - focus.places[b]!).map((seat) => (
                <span key={seat} className="linechart__tipseat" data-place={focus.places[seat]}>
                  <span className="linechart__tipplace">{placeLabel(focus.places[seat]!)}</span>
                  <span className="linechart__tipwho">{state.config.seats[seat]!.name}</span>
                  <span className="linechart__tipscore">{focus.scores[seat].toLocaleString()}</span>
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
      <ul className="standchart__legend">
        {seats.map((seat) => (
          <li key={seat} className="standchart__key" data-wind={windOf(seat)}>
            <span className="standchart__swatch" />
            <WindMark wind={windOf(seat)} />
            <span className="standchart__name">{state.config.seats[seat]!.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
