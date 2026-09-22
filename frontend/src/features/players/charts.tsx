/**
 * The profile's charts, as plain SVG -- three small charts do not earn a
 * charting library on a phone that already downloads 4 MB of Prolog.
 *
 * Colours are roles defined in `theme.css` (`--viz-*`), themed on the app's
 * own palette -- places in their metals, win methods in gold, purple and red --
 * and checked with the dataviz validator; see the note there for what passes
 * and why the rest is accepted. The placement line is a single series in the
 * accent.
 *
 * Every value a hover shows is also on the page without it: the donuts carry
 * their numbers in the legend, the line has the match list under it.
 */
import { useState } from 'react';
import type { PlacedMatch, Slice, ValueBin } from './profile';

// ---------- donut ----------

const TAU = Math.PI * 2;

function arc(cx: number, cy: number, r: number, inner: number, from: number, to: number): string {
  // A full ring cannot be one arc (start and end coincide), so it is two halves.
  if (to - from >= TAU - 1e-6) {
    return arc(cx, cy, r, inner, from, from + Math.PI) + arc(cx, cy, r, inner, from + Math.PI, to);
  }
  const p = (radius: number, a: number) =>
    `${(cx + radius * Math.sin(a)).toFixed(2)} ${(cy - radius * Math.cos(a)).toFixed(2)}`;
  const large = to - from > Math.PI ? 1 : 0;
  return `M${p(r, from)}A${r} ${r} 0 ${large} 1 ${p(r, to)}`
    + `L${p(inner, to)}A${inner} ${inner} 0 ${large} 0 ${p(inner, from)}Z`;
}

/**
 * Part of a whole, for a handful of slices. The legend is the readout: it
 * always shows each slice's count and share, and hovering either the slice or
 * its row lights up both.
 */
export function Donut({ slices, colorOf, caption, unit }: {
  slices: Slice[];
  colorOf: (key: string) => string;
  /** What the centre number counts, e.g. "matches". */
  caption: string;
  unit: (n: number) => string;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  let at = 0;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const from = at;
    at += (s.value / total) * TAU;
    return { ...s, from, to: at };
  });

  return (
    <div className="donut">
      <svg className="donut__svg" viewBox="0 0 120 120" role="img"
           aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {total === 0 && <circle cx="60" cy="60" r="46" className="donut__empty" />}
        {arcs.map((a) => (
          <path key={a.key} d={arc(60, 60, 56, 36, a.from, a.to)}
                // A lone slice is a whole ring; the gap would only draw its seam.
                className={`donut__slice${hot === a.key ? ' donut__slice--hot' : ''}${arcs.length === 1 ? ' donut__slice--whole' : ''}`}
                style={{ fill: colorOf(a.key) }}
                onPointerEnter={() => setHot(a.key)} onPointerLeave={() => setHot(null)}>
            <title>{`${a.label}: ${unit(a.value)} (${Math.round((100 * a.value) / total)}%)`}</title>
          </path>
        ))}
        <text x="60" y="58" className="donut__total">{total}</text>
        <text x="60" y="74" className="donut__caption">{caption}</text>
      </svg>
      <ul className="donut__legend">
        {slices.map((s) => (
          <li key={s.key} className={`donut__row${hot === s.key ? ' donut__row--hot' : ''}`}
              onPointerEnter={() => setHot(s.key)} onPointerLeave={() => setHot(null)}>
            <span className="donut__swatch" style={{ background: colorOf(s.key) }} />
            <span className="donut__label">{s.label}</span>
            <span className="donut__value">{s.value}</span>
            <span className="donut__share">{total ? `${Math.round((100 * s.value) / total)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- placement line ----------

const W = 340, H = 150;
const PAD = { left: 34, right: 12, top: 12, bottom: 22 };

/**
 * Placement per match, oldest on the left, 1st at the top. Each point is a
 * link to its match; the hit area is well over the dot, for a thumb.
 */
export function PlacementLine({ matches, players, onOpen }: {
  matches: PlacedMatch[];
  players: 3 | 4;
  onOpen: (matchId: string) => void;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const n = matches.length;
  const x = (i: number) => n === 1
    ? (PAD.left + W - PAD.right) / 2
    : PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (place: number) => PAD.top + ((place - 1) / (players - 1)) * (H - PAD.top - PAD.bottom);
  const places = Array.from({ length: players }, (_, i) => i + 1);
  // Past a few dozen matches the dots would merge into the line; it carries alone.
  const dots = n <= 40;
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  // The tooltip names one match, so it can afford the time that tells it from
  // another played the same day; the axis keeps to dates.
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const focus = hot === null ? null : matches[hot] ?? null;

  return (
    <div className="linechart">
      <svg className="linechart__svg" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Placements over ${n} matches`}>
        {places.map((p) => (
          <g key={p}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)} className="linechart__grid" />
            <text x={PAD.left - 8} y={y(p)} className="linechart__axis">
              {['1st', '2nd', '3rd', '4th'][p - 1]}
            </text>
          </g>
        ))}
        {n > 1 && (
          <polyline className="linechart__line"
                    points={matches.map((m, i) => `${x(i).toFixed(1)},${y(m.placement).toFixed(1)}`).join(' ')} />
        )}
        {focus && hot !== null && (
          <line x1={x(hot)} x2={x(hot)} y1={PAD.top} y2={H - PAD.bottom} className="linechart__cross" />
        )}
        {matches.map((m, i) => (
          <g key={m.matchId} className="linechart__point" tabIndex={0} role="link"
             aria-label={`${m.name || 'Unnamed match'}, ${when(m.startedAt)}: placed ${m.placement}`}
             onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(null)}
             onFocus={() => setHot(i)} onBlur={() => setHot(null)}
             onClick={() => onOpen(m.matchId)}
             onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m.matchId); }}>
            <circle cx={x(i)} cy={y(m.placement)} r={12} className="linechart__hit" />
            {(dots || hot === i) && (
              <circle cx={x(i)} cy={y(m.placement)} r={4} className="linechart__dot" />
            )}
          </g>
        ))}
        {n > 0 && (
          <>
            <text x={PAD.left} y={H - 6} className="linechart__axis linechart__axis--start">
              {date(matches[0]!.startedAt)}
            </text>
            {n > 1 && (
              <text x={W - PAD.right} y={H - 6} className="linechart__axis linechart__axis--end">
                {date(matches[n - 1]!.startedAt)}
              </text>
            )}
          </>
        )}
      </svg>
      {focus && hot !== null && (
        <div className="linechart__tip"
             style={{ left: `${(x(hot) / W) * 100}%`, top: `${(y(focus.placement) / H) * 100}%` }}>
          <span className="linechart__tipname">{focus.name || 'Unnamed match'}</span>
          <span>{when(focus.startedAt)} · {['1st', '2nd', '3rd', '4th'][focus.placement - 1]}</span>
          <span>{focus.finalScore.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

// ---------- bars ----------

/** Counts by name, commonest first: the longest bar is the full width. */
export function Bars({ rows, limit }: {
  rows: { key: string; name: string; count: number }[];
  limit: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <>
      <ul className="bars">
        {shown.map((r) => (
          <li key={r.key} className="bars__row" title={`${r.name}: ${r.count}`}>
            <span className="bars__name">{r.name}</span>
            <span className="bars__track">
              <span className="bars__bar" style={{ width: `${(100 * r.count) / max}%` }} />
            </span>
            <span className="bars__count">{r.count}</span>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button type="button" className="btn btn--quiet bars__more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

// ---------- histogram ----------

/**
 * Wins by value, one bar per bin, each in its limit's colour: blue below
 * mangan, then the tiers' own green, purple, bronze, silver and gold. Bars are
 * adjacent, so they keep the 2px surface gap; counts sit on the bars that have
 * any, so nothing needs a hover to read.
 */
export function Histogram({ bins }: { bins: ValueBin[] }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="histogram" role="img"
         aria-label={bins.map((b) => `${b.title}: ${b.count}`).join(', ')}>
      {bins.map((b) => (
        <div key={b.key} className="histogram__col" title={`${b.title}: ${b.count}`}>
          <span className="histogram__count">{b.count || ''}</span>
          <span className="histogram__track">
            {b.count > 0 && (
              <span className="histogram__bar" data-tier={b.tier}
                    style={{ height: `${(100 * b.count) / max}%` }} />
            )}
          </span>
          <span className="histogram__label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
