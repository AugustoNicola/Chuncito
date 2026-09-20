/**
 * Boots the WASM scorer once and shares it.
 *
 * The 4 MB of wasm assets are fetched lazily on first use rather than at page
 * load, so the rest of the UI is interactive immediately.
 */
import { useEffect, useState } from 'react';
import { createScorer, type Scorer } from './engine';
import { browserSwiplFactory } from './engine.browser';

let shared: Promise<Scorer> | undefined;

export const getScorer = (): Promise<Scorer> =>
  (shared ??= createScorer(browserSwiplFactory));

export type ScorerStatus =
  | { state: 'loading' }
  | { state: 'ready'; scorer: Scorer }
  | { state: 'error'; error: Error };

export function useScorer(): ScorerStatus {
  const [status, setStatus] = useState<ScorerStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getScorer().then(
      (scorer) => { if (!cancelled) setStatus({ state: 'ready', scorer }); },
      (error: unknown) => {
        if (!cancelled) {
          setStatus({ state: 'error', error: error instanceof Error ? error : new Error(String(error)) });
        }
      },
    );
    return () => { cancelled = true; };
  }, []);

  return status;
}
