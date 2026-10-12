/**
 * The match's standings over time: one line per player, their place at the
 * start and after every hand, 1st at the top. Shown above the timeline, at
 * the table and in a review, so who led when can be read at a glance.
 *
 * Each player keeps the colour of the wind they started on -- East blue,
 * South red, West green, North purple (`--wind-*`) -- the same seat, as
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

export function StandingsChart({ state, over }: {
  state: MatchState;
  /** `standingsOverTime(state)`: the start, then one entry per hand. */
  over: readonly Standing[];
}) {
  const [hot, setHot] = useState<number | null>(null);
  const players = state.config.players;
  const seats = seatsOf(players);
  const n = over.length;
  const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * (W - PAD.left - PAD.right);
  const y = (place: number) => PAD.top + ((place - 1) / (players - 1)) * (H - PAD.top - PAD.bottom);
  const windOf = (seat: Seat) => seatWindOf(seat, START, players);
  /** What point `i` is: the start, or the hand it is after. */
  const label = (i: number) => {
    if (i === 0) return 'Start';
    const row = state.hands[i - 1]!;
    return `${roundLabel({ wind: row.roundWind, number: row.roundNumber })}${row.honba > 0 ? ` +${row.honba}` : ''}`;
  };
  // A tick per round, not per repeat: "E1" once however many honba it ran to.
  const ticks = state.hands.flatMap((row, i) => {
    const prev = state.hands[i - 1];
    return prev && prev.roundWind === row.roundWind && prev.roundNumber === row.roundNumber
      ? [] : [{ i: i + 1, text: `${SHORT[row.roundWind]}${row.roundNumber}` }];
  });
  // Past a few dozen points the dots would merge into the lines.
  const dots = n <= 30;
  const focus = hot === null ? null : over[hot] ?? null;
  const step = (W - PAD.left - PAD.right) / Math.max(1, n - 1);

  return (
    <div className="standchart">
      <div className="linechart">
        <svg className="linechart__svg" viewBox={`0 0 ${W} ${H}`} role="img"
             aria-label={`Standings over ${n - 1} hand${n === 2 ? '' : 's'}`}>
          {seats.map((s) => (
            <g key={s}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(s + 1)} y2={y(s + 1)} className="linechart__grid" />
              <text x={PAD.left - 7} y={y(s + 1)} className="linechart__axis">{placeLabel(s + 1)}</text>
            </g>
          ))}
          {focus && hot !== null && (
            <line x1={x(hot)} x2={x(hot)} y1={PAD.top} y2={H - PAD.bottom} className="linechart__cross" />
          )}
          {seats.map((seat) => (
            <g key={seat} className="standchart__series" data-wind={windOf(seat)}>
              <polyline className="standchart__line"
                        points={over.map((s, i) => `${x(i).toFixed(1)},${y(s.places[seat]!).toFixed(1)}`).join(' ')} />
              {over.map((s, i) => (dots || hot === i) && (
                <circle key={i} cx={x(i)} cy={y(s.places[seat]!)} r={hot === i ? 4 : 2.5}
                        className="standchart__dot" />
              ))}
            </g>
          ))}
          <text x={x(0)} y={H - 6} className="linechart__axis linechart__axis--start">Start</text>
          {ticks.map((t) => (
            <text key={t.i} x={x(t.i)} y={H - 6} className="linechart__axis standchart__tick">{t.text}</text>
          ))}
          {/* A column per point, a thumb wide, for the tooltip. */}
          {over.map((_, i) => (
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
