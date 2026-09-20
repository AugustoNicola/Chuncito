/**
 * Browser smoke test: boots the app in the system Firefox and asserts that the
 * vendored Prolog actually loads and scores under swipl-web (the browser bundle),
 * which is a different asset-loading path from the Node bundle used by vitest.
 *
 * Uses puppeteer-core over WebDriver BiDi against the installed Firefox, so no
 * browser download is needed.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXPECTED = {
  ok: true,
  result: {
    yakus: [
      { yaku: 'pinfu', han: 1 },
      { yaku: 'tanyao', han: 1 },
      { yaku: 'sanshokuDoujun', han: 2 },
    ],
    han: 4, fu: 30, level: 'sinNombre',
    payment: { kind: 'ron', total: 7700 },
  },
};

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const url = `http://localhost:5199/`;

let browser;
let profileDir;
let failed = false;
try {
  // Firefox here is a snap, and snap confinement cannot read a profile under
  // /tmp -- it must live inside the snap's own writable area.
  profileDir = mkdtempSync(join(homedir(), 'snap', 'firefox', 'common', 'chuncito-ff-'));
  browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: '/usr/bin/firefox',
    headless: true,
    userDataDir: profileDir,
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });
  page.on('pageerror', (e) => console.error('  [pageerror]', e.message));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => ['ok', 'error'].includes(document.querySelector('[data-testid=status]')?.textContent ?? ''),
    { timeout: 90_000 },
  );

  const read = (id) => page.$eval(`[data-testid=${id}]`, (el) => el.textContent ?? '');
  const status = await read('status');
  const bootMs = await read('boot-ms');
  const result = await read('result');

  console.log(`status: ${status}`);
  console.log(`boot:   ${bootMs}ms (fetch + consult, cold)`);

  if (status !== 'ok') throw new Error('page reported an error; see console output above');

  const got = JSON.parse(result);
  const same = JSON.stringify(got) === JSON.stringify(EXPECTED);
  if (!same) {
    console.error('MISMATCH\n  expected', JSON.stringify(EXPECTED), '\n  got     ', JSON.stringify(got));
    throw new Error('browser result differs from the reference');
  }
  console.log('result: matches the swipl CLI reference exactly');
  console.log('\nBROWSER SMOKE TEST PASSED');
} catch (err) {
  failed = true;
  console.error('\nBROWSER SMOKE TEST FAILED:', err.message);
} finally {
  await browser?.close();
  await server.close();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
