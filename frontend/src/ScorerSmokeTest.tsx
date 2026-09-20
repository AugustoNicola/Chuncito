/**
 * Phase 0 smoke test: proves the vendored Prolog loads and scores in a real
 * browser. Replaced by the actual hand-input UI in Phase 1; kept until then as
 * the thing the browser harness asserts against.
 */
import { useEffect, useState } from 'react';
import { createScorer } from './scorer/engine';
import { browserSwiplFactory } from './scorer/engine.browser';
import type { ScoreOutcome, Tile } from './scorer/types';

const T = (s: string): Tile[] => s.split(' ') as Tile[];

export function ScorerSmokeTest() {
  const [status, setStatus] = useState('booting');
  const [outcome, setOutcome] = useState<ScoreOutcome | null>(null);
  const [bootMs, setBootMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t0 = performance.now();
        const scorer = await createScorer(browserSwiplFactory);
        if (cancelled) return;
        setBootMs(Math.round(performance.now() - t0));
        setOutcome(scorer.score({
          hand: { concealed: T('m2 m2 m3 m4 m5 p3 p4 p5 s3 s4 s5 m6 m7 m8'), melds: [] },
          winningTile: 'm5',
          mode: 'ron',
          situation: { roundWind: 'este', seatWind: 'sur', dora: [], uraDora: [], flags: [] },
        }));
        setStatus('ok');
      } catch (err) {
        if (!cancelled) { setStatus('error'); setOutcome(null); console.error(err); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Chuncito — scorer smoke test</h1>
      <p data-testid="status">{status}</p>
      <p data-testid="boot-ms">{bootMs ?? ''}</p>
      <pre data-testid="result">{outcome ? JSON.stringify(outcome, null, 2) : ''}</pre>
    </main>
  );
}
