/**
 * End-to-end browser test: drives the real tile-input UI in the system Firefox,
 * builds a hand tile by tile, scores it, and asserts the numbers.
 *
 * This exercises the browser swipl-wasm bundle, which loads its assets over HTTP
 * and is therefore a different path from the Node bundle used by vitest.
 *
 * Uses puppeteer-core against the installed Firefox -- no browser download.
 * Firefox here is a snap, and snap confinement cannot read a profile under /tmp,
 * so the profile lives inside the snap's own writable area.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHOT_DIR = process.env.SHOT_DIR ?? null;

// The reference hand, verified against the swipl CLI: pinfu + tanyao + sanshoku.
const HAND = 'm2 m2 m3 m4 p3 p4 p5 s3 s4 s5 m6 m7 m8 m5'.split(' ');
const EXPECT = { points: '7,700', han: /4 han/, fu: /30 fu/, yakus: ['Pinfu', 'Tanyao', 'Sanshoku Doujun'] };

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();

let browser, profileDir, failed = false;
const check = (ok, msg) => { if (ok) { console.log(`  ok   ${msg}`); } else { failed = true; console.error(`  FAIL ${msg}`); } };

try {
  profileDir = mkdtempSync(join(homedir(), 'snap', 'firefox', 'common', 'chuncito-ff-'));
  browser = await puppeteer.launch({
    browser: 'firefox', executablePath: '/usr/bin/firefox',
    headless: true, userDataDir: profileDir,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (e) => { failed = true; console.error('  [pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });

  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.keyboard');

  // Wait for the scorer to finish booting before asserting on the button state.
  await page.waitForFunction(
    () => !document.querySelector('.status')?.textContent?.includes('Loading'),
    { timeout: 90_000 },
  );

  const shot = async (name) => {
    if (SHOT_DIR) { mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: join(SHOT_DIR, name) }); }
  };

  // --- disable logic is live in the DOM ---
  await page.click('.modebar__btn[aria-pressed="false"]'); // arm chii (first button)
  const honourDisabled = await page.$eval('.keyboard [data-face="e"]', (el) => el.disabled);
  check(honourDisabled, 'honours disable while chii is armed');
  await page.click('.modebar__btn[aria-pressed="true"]');  // disarm

  // --- build the hand ---
  for (const tile of HAND) await page.click(`.keyboard [data-face="${tile}"]`);

  const handCount = await page.$$eval('.handdisplay__tiles .tile', (els) => els.length);
  check(handCount === 14, `hand shows 14 tiles (got ${handCount})`);

  const winning = await page.$eval('.handdisplay__tiles .tile--winning', (el) => el.dataset.face);
  check(winning === 'm5', `last tile added is marked as the winning tile (got ${winning})`);
  await shot('01-hand.png');

  // --- details flap: set a non-dealer seat, matching the CLI reference ---
  await page.click('.flaps__tab:nth-child(2)');
  await page.waitForSelector('.context');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')]
      .find((f) => f.querySelector('.field__label')?.textContent === 'Seat wind');
    field.querySelectorAll('.segmented__btn')[1].click();   // South
  });
  const seat = await page.$$eval('.field', (fs) => {
    const f = fs.find((x) => x.querySelector('.field__label')?.textContent === 'Seat wind');
    return f.querySelector('.segmented__btn--on')?.textContent;
  });
  check(seat === '\u5357', `seat wind switches to South (got ${seat})`);
  await shot('02-details.png');
  await page.click('.flaps__tab:nth-child(1)');

  // --- score ---
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Score hand');
    return b && !b.disabled;
  }, { timeout: 90_000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Score hand').click();
  });
  await page.waitForSelector('.score', { timeout: 90_000 });
  await shot('03-score.png');

  const yakus = await page.$$eval('.score__yaku span:first-child', (els) => els.map((e) => e.textContent));
  const points = await page.$eval('.score__points', (e) => e.textContent);
  const hanfu = await page.$eval('.score__hanfu', (e) => e.textContent);

  check(JSON.stringify(yakus) === JSON.stringify(EXPECT.yakus), `yaku list is ${JSON.stringify(EXPECT.yakus)} (got ${JSON.stringify(yakus)})`);
  check(points === EXPECT.points, `points are ${EXPECT.points} (got ${points})`);
  check(EXPECT.han.test(hanfu) && EXPECT.fu.test(hanfu), `han/fu line is "4 han · 30 fu" (got "${hanfu}")`);

  // --- melds render as they sit on a real table ---
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Back to the hand').click();
  });
  await page.waitForSelector('.keyboard');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Clear').click();
  });

  const arm = async (label) => page.evaluate((l) => {
    [...document.querySelectorAll('.modebar__btn')].find((b) => b.textContent === l).click();
  }, label);

  await arm('Chii'); await page.click('.keyboard [data-face="s3"]');
  await arm('Pon');  await page.click('.keyboard [data-face="p7"]');
  await arm('Closed kan'); await page.click('.keyboard [data-face="m1"]');
  for (const t of ['e', 'e', 'p2', 'p3', 'p4']) await page.click(`.keyboard [data-face="${t}"]`);

  const melds = await page.$$eval('.meld', (els) => els.map((el) => ({
    tiles: el.querySelectorAll('.tile').length,
    rotated: el.querySelectorAll('.tile--rotated').length,
    backs: [...el.querySelectorAll('.tile')].filter((t) => t.dataset.face === 'back').length,
  })));
  check(melds.length === 3, `three melds shown (got ${melds.length})`);
  check(melds[0]?.rotated === 1 && melds[1]?.rotated === 1,
        'called melds turn exactly one tile sideways');
  check(melds[2]?.backs === 2 && melds[2]?.rotated === 0,
        'a closed kan shows two face-down tiles and none rotated');
  await shot('04-melds.png');

  console.log(failed ? '\nBROWSER TEST FAILED' : '\nBROWSER TEST PASSED');
} catch (err) {
  failed = true;
  console.error('\nBROWSER TEST ERRORED:', err.message);
} finally {
  await browser?.close();
  await server.close();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
