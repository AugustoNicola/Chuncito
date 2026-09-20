/**
 * Browser-side SWIPL factory.
 *
 * swipl-web.js is a UMD bundle that assigns a global when loaded as a classic
 * script, and fetches swipl-web.wasm / swipl-web.data alongside itself. Loading
 * it with a script tag rather than importing it keeps the 4 MB of assets out of
 * the JS bundle and lets the service worker cache them as ordinary files.
 */
import type { SwiplFactory, SwiplModule } from './engine';

/** Where stage:swipl puts swipl-web.{js,wasm,data}. */
const SWIPL_BASE = '/swipl/';

type SwiplGlobal = (options: Record<string, unknown>) => Promise<SwiplModule>;

let scriptPromise: Promise<SwiplGlobal> | undefined;

function loadSwiplScript(): Promise<SwiplGlobal> {
  scriptPromise ??= new Promise<SwiplGlobal>((resolve, reject) => {
    const existing = (globalThis as { SWIPL?: SwiplGlobal }).SWIPL;
    if (existing) return resolve(existing);

    const script = document.createElement('script');
    script.src = `${SWIPL_BASE}swipl-web.js`;
    script.async = true;
    script.onload = () => {
      const factory = (globalThis as { SWIPL?: SwiplGlobal }).SWIPL;
      if (!factory) return reject(new Error('swipl-web.js loaded but defined no SWIPL global'));
      resolve(factory);
    };
    script.onerror = () => reject(new Error(`failed to load ${script.src}`));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const browserSwiplFactory: SwiplFactory = async () => {
  const SWIPL = await loadSwiplScript();
  return SWIPL({
    arguments: ['-q'],
    // Emscripten asks for "swipl-web.wasm" and "swipl-web.data" by bare name.
    locateFile: (file: string) => `${SWIPL_BASE}${file}`,
  });
};
