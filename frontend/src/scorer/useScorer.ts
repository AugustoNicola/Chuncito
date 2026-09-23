/**
 * Boots the WASM scorer once and shares it.
 *
 * The 4 MB of wasm assets are fetched lazily rather than at page load, so the
 * rest of the UI is interactive immediately: on first use, or earlier through
 * `warmScorer` from a screen that will probably need it. Once fetched, they
 * are cached by the browser for good (see `engine.browser.ts`).
 */
import { useEffect, useState } from 'react';
import { createScorer, type Scorer } from './engine';
import { browserSwiplFactory } from './engine.browser';

let shared: Promise<Scorer> | undefined;

export const getScorer = (): Promise<Scorer> =>
  (shared ??= createScorer(browserSwiplFactory).catch((error: unknown) => {
    // A failed boot must not stick for the rest of the session: the next
    // caller tries again rather than inheriting it.
    shared = undefined;
    throw error;
  }));

/**
 * Start booting in the background. A failure is left for the real use to
 * report (and retry), so it is swallowed here.
 */
export function warmScorer(): void {
  getScorer().catch(() => {});
}

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
