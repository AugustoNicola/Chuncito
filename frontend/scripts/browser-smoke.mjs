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

  const byText = async (text) => page.evaluate((t) => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim().startsWith(t));
    if (!button) throw new Error(`no button labelled ${t}`);
    button.click();
  }, text);

  // The tracker owns the root now; the calculator is one tap in.
  await page.waitForSelector('.home');
  await byText('Hand calculator');
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
  await arm('Chii'); await arm('Red Five');
  await page.click('.keyboard [data-key="m3"]');
  const chiiFaces = await page.$$eval('.meld .tile', (els) => els.map((e) => e.dataset.face));
  check(JSON.stringify(chiiFaces) === JSON.stringify(['m3', 'm4', 'm5R']),
        `a 3-4-5 run can hold the red five (got ${JSON.stringify(chiiFaces)})`);

  await arm('Red Five');
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
  await arm('Ura Dora'); await page.click('.keyboard [data-key="s1"]');
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

  // ==================== match tracker ====================

  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home');
  await byText('New match');
  await page.waitForSelector('.setup');

  const names = ['Ana', 'Beto', 'Cami', 'Dani'];
  const inputs = await page.$$('.setup__name');
  for (let i = 0; i < names.length; i++) await inputs[i].type(names[i]);
  const umaFields = await page.$$eval('.setup__uma input', (els) => els.map((e) => e.value));
  check(JSON.stringify(umaFields) === JSON.stringify(['20', '10', '-10', '-20']),
        `uma is four editable fields, preloaded (got ${JSON.stringify(umaFields)})`);
  const seatMarks = await page.$$eval('.setup__seatno', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(seatMarks) === JSON.stringify(['東', '南', '西', '北']),
        `seats are marked with winds (got ${JSON.stringify(seatMarks)})`);
  await shot('10-setup.png');

  await byText('Start match');
  await page.waitForSelector('.table');

  const centreText = async () => page.$eval('.centre__round', (el) => el.textContent);
  check(await centreText() === 'East 1', `the match opens on East 1 (got ${await centreText()})`);

  const scores = async () =>
    page.$$eval('.seat .playerbox__score', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(await scores()) === JSON.stringify(['25,000', '25,000', '25,000', '25,000']),
        'everyone starts on 25,000');
  const places = async () => page.$$eval('.seat', (els) =>
    els.map((e) => e.querySelector('.playerbox__place')?.textContent ?? null));
  check((await places()).every((p) => p === null), 'nobody is placed while the scores are level');

  const dealerBox = await page.$eval('.playerbox--dealer', (el) => ({
    name: el.querySelector('.playerbox__name').firstChild.textContent.trim(),
    windName: el.querySelector('.playerbox__windname').textContent,
    kanji: el.querySelector('.playerbox__wind').textContent,
  }));
  check(dealerBox.name === 'Ana', `seat 1 deals East 1 (got ${dealerBox.name})`);
  check(dealerBox.windName === 'East' && dealerBox.kanji === '東',
        `each box names its wind as well as showing the kanji (got ${JSON.stringify(dealerBox)})`);
  await shot('11-table.png');

  // --- a riichi takes 1000 and puts a stick on the table ---
  await page.click('.seat--right .playerbox__riichi');
  const afterRiichi = await scores();
  check(afterRiichi[1] === '24,000', `riichi takes 1000 (got ${afterRiichi[1]})`);
  check(JSON.stringify(await places()) === JSON.stringify(['1st', '4th', '2nd', '3rd']),
        `each box shows its place, ties by seat (got ${JSON.stringify(await places())})`);
  const counters = await page.$$eval('.centre__counter', (els) => els.map((e) => e.textContent));
  check(counters[0] === 'Riichi1' && counters[1] === 'Honba0',
        `the counters are labelled (got ${JSON.stringify(counters)})`);
  const barOrder = await page.$$eval('.app--table .app__bar .btn',
                                     (els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(barOrder) === JSON.stringify(['Manual', 'Timeline']),
        `manual sits left of timeline (got ${JSON.stringify(barOrder)})`);
  const quietBoxed = await page.$eval('.app--table .app__bar .btn--quiet', (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopColor };
  });
  check(!/rgba\(0, 0, 0, 0\)|transparent/.test(quietBoxed.bg),
        `bar buttons read as buttons (got ${JSON.stringify(quietBoxed)})`);
  const brand = await page.$eval('.centre__brand', (el) => el.textContent.trim());
  check(brand === 'Chuncito', `the centre box carries the app name (got "${brand}")`);
  const stacked = await page.evaluate(() => {
    const [a, b] = document.querySelectorAll('.centre__counter');
    return b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1;
  });
  check(stacked, 'the counters are on their own lines');

  // --- a manual win pays out, sticks included ---
  await page.click('.seat--right .playerbox__main');
  await page.waitForSelector('.winmenu');
  await byText('Ron');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Dealt in');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Cami').click();
  });
  const pick = async (label, value) => page.evaluate((l, v) => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === l);
    [...field.querySelectorAll('.pill')].find((b) => b.textContent.trim() === v).click();
  }, label, value);
  await pick('Han', '3');
  await pick('Fu', '30');
  await shot('12-winmenu.png');

  // 20 fu is a pinfu tsumo, so it cannot appear on a ron at all.
  const fuState = await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Fu');
    return Object.fromEntries([...field.querySelectorAll('.pill')].map(
      (b) => [b.textContent.trim(), b.disabled]));
  });
  check(fuState['20'] === true, 'a ron cannot be 20 fu');
  check(fuState['25'] === false, '3 han 25 fu is a legal chiitoitsu');
  check(fuState['40'] === false, '40 fu stays available');

  // The block works from the other side too: 25 fu is chiitoitsu, which is
  // already two han, so one han becomes unreachable.
  await pick('Fu', '25');
  const hanState = await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Han');
    return Object.fromEntries([...field.querySelectorAll('.pill')].map(
      (b) => [b.textContent.trim(), b.disabled]));
  });
  check(hanState['1'] === true, 'picking 25 fu rules out 1 han');
  check(hanState['2'] === false, '2 han stays available at 25 fu');
  await pick('Fu', '30');

  await byText('Review');
  await page.waitForSelector('.confirm');
  const confirmRound = await page.$$eval('.confirm__round span',
                                         (els) => els.map((e) => e.textContent));
  check(confirmRound[0] === 'East 1 · 0 repeats' && confirmRound[2] === 'East 2 · 0 repeats',
        `the round change is spelled out (got ${JSON.stringify(confirmRound)})`);
  const confirmDeltas = await page.$$eval('.confirm__delta', (els) => els.map((e) => e.textContent));
  // Beto is on riichi, so he also lifts his own stick: 3,900 + 1,000.
  check(confirmDeltas[1] === '+4,900' && confirmDeltas[2] === '-3,900',
        `the points change is shown before committing (got ${JSON.stringify(confirmDeltas)})`);
  const confirmHints = await page.$$eval('.confirm .field__hint',
                                         (els) => els.map((e) => e.textContent).join(' '));
  check(confirmHints.includes('riichi stick'),
        'the confirmation explains why the change exceeds the hand value');
  const confirmPlaces = await page.$$eval('.confirm__place', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(confirmPlaces) === JSON.stringify(['▼2nd', '▲1st', '▼4th', '3rd']),
        `the review shows places and which way they moved (got ${JSON.stringify(confirmPlaces)})`);
  await shot('19-confirm.png');
  await byText('Record this hand');
  await page.waitForSelector('.table');

  const afterWin = await scores();
  // 25000 - 1000 riichi + 3900 for the hand + the 1000 stick back off the table.
  check(afterWin[1] === '28,900', `the winner takes 3900 and the stick (got ${afterWin[1]})`);
  await shot('20-table-places.png');

  // Every box is the full layout, turned to face its chair. Squeezing four of
  // them round a centre on a phone is where things clip or collide, so check
  // the geometry rather than trusting a screenshot.
  const tableFits = async (label) => {
    const problems = await page.evaluate(() => {
      const out = [];
      const els = [...document.querySelectorAll('.playerbox, .centre')];
      for (const el of els) {
        if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
          out.push(`${el.className} overflows its box (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
        }
      }
      for (const el of document.querySelectorAll('.playerbox__place, .playerbox__score')) {
        if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} is clipped`);
      }
      const rects = els.map((el) => [el.className, el.getBoundingClientRect()]);
      for (const [name, r] of rects) {
        if (r.left < 0 || r.right > window.innerWidth) out.push(`${name} leaves the screen`);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const [a, ra] = rects[i]; const [b, rb] = rects[j];
          if (ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom) {
            out.push(`${a} overlaps ${b}`);
          }
        }
      }
      return out;
    });
    check(problems.length === 0, `${label}: boxes fit without clipping or overlap (${
      problems.length ? problems.join('; ') : 'clean'})`);
  };
  await tableFits('four players');
  check(afterWin[2] === '21,100', `the discarder pays 3900 (got ${afterWin[2]})`);
  check(await centreText() === 'East 2', `the deal passes on (got ${await centreText()})`);

  // --- a draw pays noten and keeps the dealer if the dealer was tenpai ---
  await page.click('.centre');
  await page.waitForSelector('.drawmenu');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Tenpai');
    [...field.querySelectorAll('.check')].find((b) => b.textContent.includes('Beto')).click();
  });
  const drawHasPreview = await page.$$eval('.drawmenu__preview', (els) => els.length);
  check(drawHasPreview === 0, 'the draw menu leaves the points to the review screen');
  await shot('13-drawmenu.png');
  await byText('Review');
  await page.waitForSelector('.confirm');
  await byText('Record this hand');
  await page.waitForSelector('.table');
  const afterDraw = await scores();
  check(afterDraw[1] === '31,900', `the one tenpai player collects 3000 (got ${afterDraw[1]})`);
  // Beto deals East 2, and a tenpai dealer keeps the deal rather than passing it.
  check(await centreText() === 'East 2', `a tenpai dealer keeps the deal (got ${await centreText()})`);
  const honbaText = await page.$eval('.centre__counter:nth-child(2)', (el) => el.textContent);
  void honbaText;
  const honbaLine = await page.$$eval('.centre__counter', (els) => els[1].textContent);
  check(honbaLine === 'Honba1', `the repeat adds a honba (got ${honbaLine})`);

  // --- the engine scores a hand from inside the match ---
  // The integration that matters: the winds come from the match rather than
  // being asked for again, and the seat wind is what tells the engine the
  // winner is dealer.
  await page.click('.seat--left .playerbox__main');    // Dani wins
  await page.waitForSelector('.winmenu');
  const tilesLocked = await page.$eval('.winmenu__tiles', (el) => el.disabled);
  check(tilesLocked, 'the tile builder is locked until a ron has a discarder');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Dealt in');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Ana').click();
  });
  await byText('Enter the hand and score it');
  await page.waitForSelector('.keyboard');

  const windFields = await page.evaluate(() => {
    document.querySelector('.flaps__tab:nth-child(2)').click();
    return new Promise((resolve) => setTimeout(() => resolve(
      [...document.querySelectorAll('.field__label')].map((el) => el.textContent)), 50));
  });
  const asked = ['Round wind', 'Seat wind', 'Win'].filter((f) => windFields.includes(f));
  check(asked.length === 0,
        `the match supplies the winds and the win mode, so none are asked for (got ${JSON.stringify(windFields)})`);

  // Dani did not declare riichi on the table, so it cannot be claimed here.
  const riichiRow = await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Riichi');
    return [...field.querySelectorAll('.segmented__btn')].map(
      (b) => [b.textContent.trim(), b.disabled, b.getAttribute('aria-pressed')]);
  });
  check(riichiRow[0][2] === 'true' && riichiRow[1][1] === true && riichiRow[2][1] === true,
        `an undeclared riichi cannot be claimed in the builder (got ${JSON.stringify(riichiRow)})`);
  await shot('17-nowinds.png');
  await page.click('.flaps__tab:nth-child(1)');

  for (const t of HAND) await page.click(`.keyboard [data-key="${t}"]`);
  await page.waitForFunction(
    () => !document.querySelector('.btn--primary')?.disabled, { timeout: 30_000 });
  await byText('Score hand');
  await page.waitForSelector('.score');
  const embeddedSeat = await page.$eval('.score__seat', (el) => el.textContent);
  check(embeddedSeat === 'Non-dealer ron',
        `the seat wind came from the seat, not a picker (got ${embeddedSeat})`);
  await shot('18-scored.png');

  await byText('Record this hand');
  await page.waitForSelector('.confirm');
  const scoredValue = await page.$eval('.confirm__points', (el) => el.textContent);
  check(scoredValue === '7,700', `the confirmation shows the scored value (got ${scoredValue})`);
  await byText('Record this hand');
  await page.waitForSelector('.table');
  const afterScored = await scores();
  // Ana was on 24,000 after paying noten, and owes 7700 plus 300 for the honba.
  check(afterScored[0] === '16,000', `the discarder pays the scored hand (got ${afterScored[0]})`);
  check(afterScored[3] === '32,000', `the winner takes it (got ${afterScored[3]})`);

  // --- the timeline is the list of hands ---
  await byText('Timeline');
  await page.waitForSelector('.timeline');
  const entries = await page.$$eval('.timeline__hand', (els) => els.length);
  check(entries === 3, `the timeline holds every hand (got ${entries})`);
  const firstEntry = await page.$eval('.timeline__what', (el) => el.textContent);
  check(firstEntry === 'Dani ron off Ana', `newest hand first (got ${firstEntry})`);
  // A scored hand carries its yaku, which is what makes the Phase 4 filters work.
  const tiers = await page.$$eval('.timeline__hand',
                                  (els) => els.map((e) => e.dataset.tier ?? null));
  check(tiers[1] === 'draw', `a draw is themed as one (got ${JSON.stringify(tiers)})`);
  const loggedYakus = await page.$$eval('.timeline__hand:first-child .timeline__yaku',
                                        (els) => els.map((e) => e.textContent));
  check(JSON.stringify(loggedYakus) === JSON.stringify(['Pinfu', 'Tanyao', 'Sanshoku Doujun']),
        `the yaku are recorded against the hand (got ${JSON.stringify(loggedYakus)})`);
  // The point of storing hand_tiles: the hand can be looked at again.
  const reviewTiles = await page.$$eval('.timeline__hand:first-child .handsummary .tile',
                                        (els) => els.length);
  check(reviewTiles >= 14, `the scored hand is shown back on review (got ${reviewTiles} tiles)`);
  await shot('24-review-hand.png');
  await shot('14-timeline.png');
  await byText('Back');

  // --- undo puts the table back, riichi stick included ---
  await page.waitForSelector('.table');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Undo hand 3');
  await page.waitForSelector('.confirm');
  await byText('Undo it');
  await page.waitForSelector('.table');
  const afterUndo = await scores();
  check(JSON.stringify(afterUndo) === JSON.stringify(afterDraw),
        `undo restores the scores exactly (got ${JSON.stringify(afterUndo)})`);
  check(await centreText() === 'East 2', `undo restores the round (got ${await centreText()})`);
  await shot('15-undone.png');

  // --- the match survives a reload, which is what the mirror is for ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.table', { timeout: 20_000 });
  const afterReload = await scores();
  check(JSON.stringify(afterReload) === JSON.stringify(afterDraw),
        `the match is restored from IndexedDB (got ${JSON.stringify(afterReload)})`);

  // --- multiple ron: the winner is chosen, never assumed ---
  await page.click('.seat--bottom .playerbox__main');   // Ana
  await page.waitForSelector('.winmenu');
  const seatField = async (label) => page.evaluate((l) => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === l);
    return [...field.querySelectorAll('.segmented__btn')].map(
      (b) => [b.textContent.trim(), b.disabled, b.getAttribute('aria-pressed')]);
  }, label);

  const winnerRow = await seatField('Winner');
  check(winnerRow.length === 4 && winnerRow[0][2] === 'true',
        `the tapped seat starts as the winner (got ${JSON.stringify(winnerRow)})`);
  check(winnerRow.every(([, disabled]) => !disabled),
        `nobody is ruled out as winner before a discarder is picked (got ${JSON.stringify(winnerRow)})`);

  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Dealt in');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Cami').click();
  });
  const afterDealIn = await seatField('Winner');
  check(afterDealIn[2][1] === true && afterDealIn[1][1] === false,
        `only the discarder is ruled out as winner (got ${JSON.stringify(afterDealIn)})`);

  await pick('Han', '2');
  await pick('Fu', '30');
  await byText('Add another winner on this discard');
  const staged = await page.$$eval('.chip--staged', (els) => els.map((e) => e.textContent));
  check(staged.length === 1 && staged[0].includes('Ana'),
        `the first winner is staged (got ${JSON.stringify(staged)})`);
  const waiting = await page.$eval('.app__title', (el) => el.textContent);
  check(waiting === 'Who else won?',
        `the next winner is asked for, not assumed (got "${waiting}")`);

  const lockedDealIn = await seatField('Dealt in');
  check(lockedDealIn.every(([, disabled]) => disabled),
        `the discarder is settled once a winner is staged (got ${JSON.stringify(lockedDealIn)})`);

  const secondRow = await seatField('Winner');
  check(secondRow.every(([name, disabled]) =>
    disabled === (name === 'Ana' || name === 'Cami')),
    `only the staged winner and the discarder are blocked (got ${JSON.stringify(secondRow)})`);

  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Winner');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Dani').click();
  });
  await pick('Han', '3');
  await pick('Fu', '30');
  await shot('25-multiron.png');
  await byText('Review');
  await page.waitForSelector('.confirm');
  const bothHands = await page.$$eval('.confirm__value', (els) => els.length);
  check(bothHands === 2, `both hands are shown before committing (got ${bothHands})`);
  await shot('26-multiron-confirm.png');
  const beforeMulti = await page.$$eval('.confirm__was', (els) => els.map((e) => e.textContent));
  await byText('Record this hand');
  await page.waitForSelector('.table');
  const afterMulti = await scores();
  // Ana 2 han 30 fu (2000) and Dani 3 han 30 fu (3900), both off Cami, on the
  // honba the exhaustive draw left behind -- paid once, to the nearest winner.
  const camiBefore = Number(beforeMulti[2].replace(/,/g, ''));
  check(Number(afterMulti[2].replace(/,/g, '')) === camiBefore - 5900 - 300,
        `the discarder pays both hands and one honba (got ${afterMulti[2]} from ${beforeMulti[2]})`);
  // Cami discards, so Dani is next in turn order and takes the honba; Ana,
  // further round, is paid her hand and nothing else.
  check(afterMulti[3] === '28,200',
        `the honba goes to the winner nearest the discarder (got ${afterMulti[3]})`);
  check(afterMulti[0] === '26,000',
        `the further winner is paid her hand alone (got ${afterMulti[0]})`);

  // --- a scored hand can be staged, so a double ron can mix both routes ---
  await page.click('.seat--right .playerbox__main');    // Beto
  await page.waitForSelector('.winmenu');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Dealt in');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Cami').click();
  });
  await byText('Enter the hand and score it');
  await page.waitForSelector('.keyboard');
  for (const t of HAND) await page.click(`.keyboard [data-key="${t}"]`);
  await page.waitForFunction(
    () => !document.querySelector('.btn--primary')?.disabled, { timeout: 30_000 });
  await byText('Score hand');
  await page.waitForSelector('.score');
  const scoreActions = await page.$$eval('.score__actions .btn',
                                         (els) => els.map((e) => e.textContent.trim()));
  check(scoreActions.includes('Add another winner on this discard'),
        `a scored hand can be staged rather than recorded (got ${JSON.stringify(scoreActions)})`);
  await shot('34-score-stage.png');
  await byText('Add another winner on this discard');
  await page.waitForSelector('.winmenu');
  const mixedStaged = await page.$$eval('.chip--staged', (els) => els.map((e) => e.textContent));
  check(mixedStaged.length === 1 && mixedStaged[0].includes('Beto'),
        `the scored hand is staged (got ${JSON.stringify(mixedStaged)})`);

  // The second winner's hand is typed in, so one ron carries both routes.
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Winner');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Dani').click();
  });
  await pick('Han', '2');
  await pick('Fu', '30');
  // The tiles button is also a wide primary, so take the last one on the page.
  const reviewLabel = await page.$$eval('.btn--primary.btn--wide',
                                        (els) => els[els.length - 1].textContent.trim());
  check(reviewLabel === 'Review 2 hands',
        `the button counts the hands it will record (got "${reviewLabel}")`);
  await shot('35-mixed-multiron.png');
  await byText('Review 2 hands');
  await page.waitForSelector('.confirm');
  const mixedHands = await page.$$eval('.confirm__value', (els) => els.length);
  check(mixedHands === 2, `both hands reach the review (got ${mixedHands})`);
  const mixedTiles = await page.$$eval('.confirm__value .handsummary', (els) => els.length);
  check(mixedTiles === 1, `only the scored hand carries tiles (got ${mixedTiles})`);
  await byText('Record this hand');
  await page.waitForSelector('.table');

  // --- four riichi needs four riichi ---
  await page.click('.centre');
  await page.waitForSelector('.drawmenu');
  await page.evaluate(() => {
    [...document.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Abortive').click();
  });
  const fourRiichiOff = await page.$$eval('.stack__btn', (els) => {
    const b = els.find((x) => x.textContent.startsWith('Four riichi'));
    return { disabled: b.disabled, why: b.textContent };
  });
  check(fourRiichiOff.disabled, 'four riichi is refused until four riichi are declared');
  check(fourRiichiOff.why.includes('0 of 4'),
        `it says how many are declared (got "${fourRiichiOff.why}")`);
  await shot('27-fourriichi.png');
  await byText('Cancel');
  await page.waitForSelector('.table');

  // --- a match can be left and thrown away, which is the only way out of one ---
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Back to the home screen');
  await page.waitForSelector('.home');
  const resumable = await page.$$eval('button', (els) =>
    els.some((b) => b.textContent.includes('Resume match')));
  check(resumable, 'leaving a match offers to resume it');

  await byText('Resume match');
  await page.waitForSelector('.table');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Discard this match');
  await byText('Yes, throw it away');
  await page.waitForSelector('.home');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home', { timeout: 20_000 });
  const stillThere = await page.$$eval('button', (els) =>
    els.some((b) => b.textContent.includes('Resume match')));
  check(!stillThere, 'a discarded match does not come back on the next load');

  // --- ending the match shows placements ---
  await byText('New match');
  await page.waitForSelector('.setup');
  const again = await page.$$('.setup__name');
  for (let i = 0; i < names.length; i++) await again[i].type(names[i]);
  await byText('Start match');
  await page.waitForSelector('.table');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('End early');
  await page.waitForSelector('.confirm');
  await byText('End it now');
  await page.waitForSelector('.standings');
  const standings = await page.$$eval('.standings__row', (els) => els.map((el) => ({
    name: el.querySelector('.standings__name').textContent,
    uma: el.querySelector('.standings__uma').textContent,
  })));
  check(standings[0]?.name === 'Ana',
        `a level table places by seat order (got ${standings[0]?.name})`);
  check(standings[0]?.uma === '+20', `uma is applied by placement (got ${standings[0]?.uma})`);
  check(standings[3]?.uma === '-20', `last place takes the bottom uma (got ${standings[3]?.uma})`);
  await shot('16-endscreen.png');

  // ==================== sanma ====================

  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home');
  await byText('New match');
  await page.waitForSelector('.setup');
  await byText('Three (sanma)');

  const sanmaInputs = await page.$$('.setup__name');
  check(sanmaInputs.length === 3, `sanma setup asks for three names (got ${sanmaInputs.length})`);
  for (let i = 0; i < 3; i++) await sanmaInputs[i].type(names[i]);
  const sanmaUma = await page.$$eval('.setup__uma input', (els) => els.map((e) => e.value));
  check(JSON.stringify(sanmaUma) === JSON.stringify(['15', '0', '-15']),
        `sanma uma is three fields (got ${JSON.stringify(sanmaUma)})`);
  await shot('30-sanma-setup.png');
  await byText('Start match');
  await page.waitForSelector('.table');

  const boxes = await page.$$eval('.seat', (els) => els.map((e) => e.className));
  check(boxes.length === 3 && !boxes.some((c) => c.includes('seat--left')),
        `the table has no North box (got ${JSON.stringify(boxes)})`);
  check(JSON.stringify(await scores()) === JSON.stringify(['35,000', '35,000', '35,000']),
        'everyone starts on 35,000');
  await shot('31-sanma-table.png');

  // A 1 han 30 fu non-dealer tsumo: 500 + 300, the third payer is gone.
  await page.click('.seat--right .playerbox__main');     // Beto
  await page.waitForSelector('.winmenu');
  await byText('Tsumo');
  await byText('1');
  await byText('30');
  const tsumoPreview = await page.$eval('.status', (el) => el.textContent);
  check(tsumoPreview.startsWith('800 points'),
        `a sanma tsumo previews the reduced total (got "${tsumoPreview}")`);
  await byText('Review');
  await page.waitForSelector('.confirm');
  await byText('Record this hand');
  await page.waitForSelector('.table');
  check(JSON.stringify(await scores()) === JSON.stringify(['34,500', '35,800', '34,700']),
        `the dealer pays 500 and the other 300 (got ${JSON.stringify(await scores())})`);

  // The same tanyao as the unit test, with two Norths pulled, entered as tiles.
  await page.click('.seat--top .playerbox__main');       // Cami
  await page.waitForSelector('.winmenu');
  await byText('Tsumo');
  await byText('Enter the hand and score it');
  await page.waitForSelector('.keyboard');
  const manzuGone = await page.$eval('.keyboard [data-key="m5"]', (el) => el.disabled);
  check(manzuGone, 'the calculator disables 2m-8m in sanma');
  const modeLabels = await page.$$eval('.modebar__btn', (els) => els.map((e) => e.textContent));
  check(!modeLabels.includes('Chii') && modeLabels.includes('Kita'),
        `sanma swaps Chii for Kita (got ${JSON.stringify(modeLabels)})`);
  for (const tile of 'p2 p3 p4 p5 p6 p7 s2 s3 s4 s6 s7 s8 s5 s5'.split(' ')) {
    await page.click(`.keyboard [data-key="${tile}"]`);
  }
  await arm('Kita');
  await page.click('.keyboard [data-key="n"]');
  await page.click('.keyboard [data-key="n"]');
  await shot('32-sanma-hand.png');
  await page.waitForFunction(
    () => !document.querySelector('.btn--primary')?.disabled, { timeout: 90_000 });
  await byText('Score hand');
  await page.waitForSelector('.score__points');
  const sanmaPoints = await page.$eval('.score__points', (el) => el.textContent);
  check(sanmaPoints === '5,900', `2 kita make it 4 han, 5,900 from two payers (got ${sanmaPoints})`);
  const kitaLine = await page.$eval('.score__yaku[data-yaku="nukiDora"]', (el) => el.textContent);
  check(kitaLine.includes('Kita') && kitaLine.includes('2 han'),
        `the kita are listed with the dora (got "${kitaLine}")`);
  const note = await page.$eval('.score__breakdown--note', (el) => el.textContent);
  check(note.includes('Sanma') && note.includes('7,900'),
        `the score notes the tsumo loss (got "${note}")`);
  await shot('33-sanma-score.png');
  await byText('Record this hand');
  await page.waitForSelector('.confirm');
  await byText('Record this hand');
  await page.waitForSelector('.table');
  check(JSON.stringify(await scores()) === JSON.stringify(['32,500', '31,900', '40,600']),
        `the dealer pays 3,900 and the other 2,000 (got ${JSON.stringify(await scores())})`);
  await shot('34-sanma-after.png');
  await tableFits('sanma');
  // The narrowest common phone leaves the centre least room.
  await page.setViewport({ width: 360, height: 740 });
  await tableFits('sanma at 360px');
  await shot('35-sanma-narrow.png');
  await page.setViewport({ width: 390, height: 844 });

  // A match in progress reads newest first; a finished one reads as it was
  // played, East 1 at the top.
  const timelineRounds = () => page.$$eval('.timeline__round',
    (els) => els.map((e) => e.firstChild.textContent));
  await byText('Timeline');
  await page.waitForSelector('.timeline');
  check(JSON.stringify(await timelineRounds()) === JSON.stringify(['East 2', 'East 1']),
        `an ongoing match lists its latest hand first (got ${JSON.stringify(await timelineRounds())})`);
  await byText('Back');
  await page.waitForSelector('.table');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('End early');
  await page.waitForSelector('.confirm');
  await byText('End it now');
  await page.waitForSelector('.standings');
  await byText('Timeline');
  await page.waitForSelector('.timeline');
  check(JSON.stringify(await timelineRounds()) === JSON.stringify(['East 1', 'East 2']),
        `a finished match lists its hands in order (got ${JSON.stringify(await timelineRounds())})`);
  await shot('36-finished-timeline.png');
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home');

  // ==================== without red fives ====================

  await byText('Hand calculator');
  await page.waitForSelector('.keyboard');
  await byText('Details');
  await byText('Without');
  await byText('Tiles');
  await page.waitForSelector('.keyboard');
  const noRedModes = await page.$$eval('.modebar__btn', (els) => els.map((e) => e.textContent));
  check(!noRedModes.includes('Red Five'),
        `without red fives there is no Red Five button (got ${JSON.stringify(noRedModes)})`);
  await arm('Closed kan'); await page.click('.keyboard [data-key="p5"]');
  const plainKan = await page.$$eval('.meld .tile', (els) => els.map((e) => e.dataset.face));
  check(JSON.stringify(plainKan) === JSON.stringify(['back', 'p5', 'p5', 'back']),
        `a kan of fives is all plain without red fives (got ${JSON.stringify(plainKan)})`);
  await shot('40-no-red.png');

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
