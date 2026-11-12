/**
 * The fire behind a limit hand's title: tongues of flame licking up from under
 * the word, and embers drifting off them, in the tier's own two colours.
 *
 * Plain elements and keyframes rather than a canvas or an SVG filter: it has to
 * run on whatever phone is on the table, and costs nothing when the hand is not
 * a limit hand, because then it is not rendered at all. Every number below is
 * fixed rather than random, so a re-render never makes the fire jump.
 */
import type { CSSProperties } from 'react';

// x: where the tongue stands across the title (%); w: its width (%); h: its
// height (% of the blaze); d: one lick's duration (s); delay: how far into the
// loop it starts (s). Tallest in the middle, so the fire peaks over the word.
const TONGUES = [
  { x: 4, w: 14, h: 45, d: 1.3, delay: -0.2 },
  { x: 12, w: 16, h: 60, d: 1.7, delay: -1.1 },
  { x: 21, w: 18, h: 72, d: 1.4, delay: -0.6 },
  { x: 30, w: 18, h: 85, d: 1.9, delay: -1.5 },
  { x: 39, w: 20, h: 95, d: 1.5, delay: -0.9 },
  { x: 47, w: 22, h: 100, d: 1.8, delay: -0.3 },
  { x: 55, w: 20, h: 92, d: 1.4, delay: -1.2 },
  { x: 63, w: 20, h: 98, d: 1.7, delay: -0.7 },
  { x: 71, w: 18, h: 80, d: 1.5, delay: -1.6 },
  { x: 80, w: 18, h: 68, d: 1.8, delay: -0.4 },
  { x: 88, w: 16, h: 56, d: 1.3, delay: -1.0 },
  { x: 96, w: 14, h: 42, d: 1.6, delay: -0.8 },
];

// x: start (%); drift: sideways travel (px); d (s); delay (s).
const EMBERS = [
  { x: 12, drift: -10, d: 2.6, delay: -0.4 },
  { x: 27, drift: 8, d: 3.1, delay: -2.2 },
  { x: 38, drift: -6, d: 2.4, delay: -1.3 },
  { x: 53, drift: 12, d: 2.9, delay: -0.1 },
  { x: 64, drift: -12, d: 2.7, delay: -1.8 },
  { x: 76, drift: 6, d: 3.3, delay: -0.9 },
  { x: 88, drift: -8, d: 2.5, delay: -2.6 },
  { x: 46, drift: 4, d: 3.6, delay: -3.0 },
];

const vars = (v: Record<string, string>) => v as CSSProperties;

export function Flames() {
  return (
    <span className="flames" aria-hidden="true">
      <span className="flames__fire">
        {TONGUES.map((t, i) => (
          <span key={i} className="flames__tongue"
                style={vars({ '--x': `${t.x}%`, '--w': `${t.w}%`, '--h': `${t.h}%`, '--d': `${t.d}s`, '--delay': `${t.delay}s` })} />
        ))}
      </span>
      {EMBERS.map((e, i) => (
        <span key={i} className="flames__ember"
              style={vars({ '--x': `${e.x}%`, '--drift': `${e.drift}px`, '--d': `${e.d}s`, '--delay': `${e.delay}s` })} />
      ))}
    </span>
  );
}
