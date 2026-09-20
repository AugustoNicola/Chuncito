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
  const honourDisabled = await page.$eval('.keyboard [data-key="e"]', (el) => el.disabled);
  check(honourDisabled, 'honours disable while chii is armed');
  await page.click('.modebar__btn[aria-pressed="true"]');  // disarm

  // --- build the hand ---
  for (const tile of HAND) await page.click(`.keyboard [data-key="${tile}"]`);

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
  const seatWind = await page.$$eval('.field', (fs) => {
    const f = fs.find((x) => x.querySelector('.field__label')?.textContent === 'Seat wind');
    return f.querySelector('.segmented__btn--on')?.textContent;
  });
  check(seatWind === '\u5357', `seat wind switches to South (got ${seatWind})`);
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

  const summaryTiles = await page.$$eval('.handsummary__tiles .tile', (els) => els.length);
  check(summaryTiles === 14, `score screen shows the hand (got ${summaryTiles} tiles)`);

  const yakus = await page.$$eval('.score__yaku span:first-child', (els) => els.map((e) => e.textContent));
  const points = await page.$eval('.score__points', (e) => e.textContent);
  const hanfu = await page.$eval('.score__hanfu', (e) => e.textContent);

  check(JSON.stringify(yakus) === JSON.stringify(EXPECT.yakus), `yaku list is ${JSON.stringify(EXPECT.yakus)} (got ${JSON.stringify(yakus)})`);
  check(points === EXPECT.points, `points are ${EXPECT.points} (got ${points})`);
  check(EXPECT.han.test(hanfu) && EXPECT.fu.test(hanfu), `han/fu line is "4 han · 30 fu" (got "${hanfu}")`);

  const seat = await page.$eval('.score__seat', (e) => e.textContent);
  check(seat === 'Non-dealer ron', `seat/win line reads "Non-dealer ron" (got "${seat}")`);
  const tier = await page.$eval('.score', (e) => e.dataset.tier);
  check(tier === 'none', `a 4 han hand uses the plain tier (got "${tier}")`);
  const hanLabels = await page.$$eval('.score__han', (els) => els.map((e) => e.textContent));
  check(hanLabels.every((t) => /^\d+ han$/.test(t)),
        `each yaku line is labelled in han (got ${JSON.stringify(hanLabels)})`);

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

  await arm('Chii'); await page.click('.keyboard [data-key="s3"]');
  await arm('Pon');  await page.click('.keyboard [data-key="p7"]');
  await arm('Closed kan'); await page.click('.keyboard [data-key="m1"]');
  for (const t of ['e', 'e', 'p2', 'p3', 'p4']) await page.click(`.keyboard [data-key="${t}"]`);

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

  // --- the red modifier puts a red five anywhere in a run ---
  // Clear first: the previous hand is complete, so no further call is allowed.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Clear').click();
  });
  await arm('Chii'); await arm('Red 5');
  await page.click('.keyboard [data-key="m3"]');
  const chiiFaces = await page.$$eval('.meld .tile', (els) => els.map((e) => e.dataset.face));
  check(JSON.stringify(chiiFaces) === JSON.stringify(['m3', 'm4', 'm5R']),
        `a 3-4-5 run can hold the red five (got ${JSON.stringify(chiiFaces)})`);

  await arm('Red 5');
  const nonFiveOff = await page.$eval('.keyboard [data-key="m4"]', (el) => el.disabled);
  check(nonFiveOff, 'the red modifier disables tiles that would produce no five');
  // The red 5m is already inside that run, so only another suit is available.
  const redManUsed = await page.$eval('.keyboard [data-key="m5"]', (el) => el.disabled);
  check(redManUsed, 'the red five disables once its single copy is in the hand');

  await page.click('.keyboard [data-key="p5"]');
  const heldRed = await page.$$eval('.handdisplay__tiles .tile', (els) => els.map((e) => e.dataset.face));
  check(heldRed.includes('p5R'), `the modifier adds the red copy (got ${JSON.stringify(heldRed)})`);
  await shot('07-red.png');

  // --- an open hand blocks riichi ---
  await page.click('.flaps__tab:nth-child(2)');
  await page.waitForSelector('.context');
  const riichiBlocked = await page.$$eval('.field', (fs) => {
    const f = fs.find((x) => x.querySelector('.field__label')?.textContent === 'Riichi');
    return [...f.querySelectorAll('.segmented__btn')].slice(1).every((b) => b.disabled);
  });
  check(riichiBlocked, 'riichi is unavailable while the hand is open');
  await shot('05-open-hand.png');
  await page.click('.flaps__tab:nth-child(1)');

  // --- dora input takes indicators and shows what they point at ---
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Clear').click();
  });
  await arm('Dora'); await page.click('.keyboard [data-key="m9"]');
  const indicators = await page.$$eval('.dorarow .tile', (els) => els.map((e) => e.dataset.face));
  check(JSON.stringify(indicators) === JSON.stringify(['m9']),
        `the dora row shows the indicator itself (got ${JSON.stringify(indicators)})`);

  // Ura is enterable before a riichi is picked, since the tile flap comes first.
  await arm('Ura'); await page.click('.keyboard [data-key="s1"]');
  const uraCount = await page.$$eval('.dorarow', (rows) => rows.length);
  check(uraCount === 2, `ura accepted without a riichi (got ${uraCount} indicator rows)`);

  // A kan of fives necessarily contains the red one, and it must be visible.
  await arm('Closed kan'); await page.click('.keyboard [data-key="p5"]');
  const ankan = await page.$$eval('.meld .tile', (els) => els.map((e) => e.dataset.face));
  check(JSON.stringify(ankan) === JSON.stringify(['back', 'p5R', 'p5', 'back']),
        `a closed kan of fives shows its red five (got ${JSON.stringify(ankan)})`);
  const plainSpent = await page.$eval('.keyboard [data-key="p5"]', (el) => el.disabled);
  check(plainSpent, 'the plain five disables once a kan has taken every copy');
  await shot('06-dora.png');

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
