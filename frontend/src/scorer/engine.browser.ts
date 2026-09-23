/**
 * Browser-side SWIPL factory.
 *
 * swipl-web.js is a UMD bundle that assigns a global when loaded as a classic
 * script, and fetches swipl-web.wasm / swipl-web.data alongside itself. Loading
 * it with a script tag rather than importing it keeps the 4 MB of assets out of
 * the JS bundle.
 *
 * The three files are imported as `?url`, so the build copies them into
 * `assets/` under content-hashed names, which the server caches for a year:
 * a phone downloads the scorer once, not on every fresh open. (They used to be
 * copied to a fixed `/swipl/` path, which had to be revalidated each time and
 * was re-sent in full.) A swipl-wasm upgrade changes the hashes, so a stale
 * copy can never be served.
 */
import swiplJsUrl from 'swipl-wasm/dist/swipl/swipl-web.js?url';
import swiplWasmUrl from 'swipl-wasm/dist/swipl/swipl-web.wasm?url';
import swiplDataUrl from 'swipl-wasm/dist/swipl/swipl-web.data?url';
import type { SwiplFactory, SwiplModule } from './engine';

/** Emscripten asks for its companions by bare name. */
const COMPANIONS: Record<string, string> = {
  'swipl-web.wasm': swiplWasmUrl,
  'swipl-web.data': swiplDataUrl,
};

type SwiplGlobal = (options: Record<string, unknown>) => Promise<SwiplModule>;

let scriptPromise: Promise<SwiplGlobal> | undefined;

function loadSwiplScript(): Promise<SwiplGlobal> {
  scriptPromise ??= new Promise<SwiplGlobal>((resolve, reject) => {
    const existing = (globalThis as { SWIPL?: SwiplGlobal }).SWIPL;
    if (existing) return resolve(existing);

    const script = document.createElement('script');
    script.src = swiplJsUrl;
    script.async = true;
    script.onload = () => {
      const factory = (globalThis as { SWIPL?: SwiplGlobal }).SWIPL;
      if (!factory) return reject(new Error('swipl-web.js loaded but defined no SWIPL global'));
      resolve(factory);
    };
    script.onerror = () => {
      // Forget the failure, so the next attempt fetches again (offline at the
      // table is the usual cause, and it passes).
      scriptPromise = undefined;
      script.remove();
      reject(new Error(`failed to load ${script.src}`));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const browserSwiplFactory: SwiplFactory = async () => {
  const SWIPL = await loadSwiplScript();
  return SWIPL({
    arguments: ['-q'],
    locateFile: (file: string) => {
      const url = COMPANIONS[file];
      if (!url) throw new Error(`swipl-web asked for an unknown file: ${file}`);
      return url;
    },
  });
};
