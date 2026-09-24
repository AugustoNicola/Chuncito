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
let lastPage = null;
const check = (ok, msg) => { if (ok) { console.log(`  ok   ${msg}`); } else { failed = true; console.error(`  FAIL ${msg}`); } };

try {
  profileDir = mkdtempSync(join(homedir(), 'snap', 'firefox', 'common', 'chuncito-ff-'));
  browser = await puppeteer.launch({
    browser: 'firefox', executablePath: '/usr/bin/firefox',
    headless: true, userDataDir: profileDir,
  });
  const page = await browser.newPage();
  lastPage = page;
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (e) => { failed = true; console.error('  [pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text()); });

  // A stand-in for the backend, so the run stays hermetic: it starts locked,
  // takes the PIN, and keeps what it is sent. The real server's rules are the
  // backend's own tests; this only has to be the right shape.
  const api = {
    pin: '2468', unlocked: false, matches: new Map(), players: new Map(), requests: [],
  };
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) { void req.continue(); return; }
    const path = url.pathname.slice('/api'.length);
    const method = req.method();
    api.requests.push(`${method} ${path}`);
    const reply = (status, body) => req.respond({
      status, contentType: 'application/json',
      body: body === undefined ? '' : JSON.stringify(body),
    });
    // Firefox (BiDi) only hands the body over asynchronously.
    const raw = req.hasPostData() ? await req.fetchPostData() : undefined;
    const body = raw ? JSON.parse(raw) : undefined;
    if (path === '/session') {
      if (method === 'GET') return reply(200, { unlocked: api.unlocked, configured: true });
      api.unlocked = body?.pin === api.pin;
      return api.unlocked ? reply(204) : reply(401, { detail: 'wrong PIN' });
    }
    if (!api.unlocked) return reply(401, { detail: 'enter the PIN' });
    const slug = (n) => n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (path === '/players' && method === 'GET') return reply(200, [...api.players.values()]);
    if (/^\/players\/[^/]+\/stats$/.test(path)) {
      // The UI's half only: the arithmetic is the backend's tests' business.
      const who = [...api.players.values()].find((p) => p.slug === path.split('/')[2]);
      if (!who) return reply(404, { detail: 'no such player' });
      const kind = Number(url.searchParams.get('players') ?? 4);
      const sat = [...api.matches.entries()].filter(([, { rows: r }]) => r.match.status === 'finished'
        && r.matchPlayers.some((p) => p.playerId === who.id));
      const mine = sat.filter(([, { rows: r }]) => r.match.players === kind);
      const seatOf = (r) => r.matchPlayers.find((p) => p.playerId === who.id);
      const tiles = mine.flatMap(([, { rows: r }]) => r.handWins).find((w) => w.handTiles);
      return reply(200, {
        player: who, players: kind,
        matchesFour: sat.filter(([, m]) => m.rows.match.players === 4).length,
        matchesSanma: sat.filter(([, m]) => m.rows.match.players === 3).length,
        matches: mine.map(([id, { rows: r }]) => ({
          matchId: id, name: r.match.name, startedAt: r.match.startedAt,
          placement: seatOf(r).placement, finalScore: seatOf(r).finalScore, umaPoints: seatOf(r).umaPoints,
        })),
        placementCounts: Array.from({ length: kind }, (_, i) =>
          mine.filter(([, { rows: r }]) => seatOf(r).placement === i + 1).length),
        umaTotal: mine.reduce((a, [, { rows: r }]) => a + (seatOf(r).umaPoints ?? 0), 0),
        hands: 20, wins: 4, tsumoWins: 1, dealIns: 3, riichis: 5,
        winMethods: { riichi: 2, dama: 1, open: 1, unknown: 0 },
        bestHand: mine.length && tiles ? {
          matchId: mine[0][0], matchName: mine[0][1].rows.match.name, roundWind: 'este', roundNumber: 2,
          level: 'haneman', han: 6, fu: 30, pointsWon: 12000, handTiles: tiles.handTiles,
        } : null,
        winValues: mine.length ? [{ level: 'sinNombre', basePoints: 240, count: 2 },
                                  { level: 'mangan', basePoints: 2000, count: 1 },
                                  { level: 'haneman', basePoints: 3000, count: 1 }] : [],
        yakus: mine.length ? [{ yaku: 'riichi', count: 3 }, { yaku: 'dora', count: 3 },
                              { yaku: 'tanyao', count: 2 }, { yaku: 'pinfu', count: 1 }] : [],
      });
    }
    if (path.startsWith('/players')) {
      const name = body.displayName.trim();
      const id = method === 'POST' ? `p-${api.players.size + 1}` : path.split('/')[2];
      const taken = [...api.players.values()]
        .find((p) => p.slug === slug(name) && p.id !== id);
      if (taken) return reply(409, { detail: 'exists', existing: taken });
      const player = { id, displayName: name, slug: slug(name) };
      api.players.set(id, player);
      return reply(method === 'POST' ? 201 : 200, player);
    }
    if (path === '/matches' && method === 'GET') {
      const q = url.searchParams;
      const RANKS = { sinNombre: 0, mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4, kazoeYakuman: 5 };
      const rank = (level) => (level === null ? null : RANKS[level] ?? 6);
      const seatName = (p) => p.guestName ?? api.players.get(p.playerId)?.displayName ?? '?';
      return reply(200, [...api.matches.entries()]
        .filter(([, { rows: r }]) => !q.get('status') || r.match.status === q.get('status'))
        .filter(([, { rows: r }]) => !q.get('players') || String(r.match.players) === q.get('players'))
        .filter(([, { rows: r }]) => !q.get('min_level')
          || (rank(r.match.maxLevel) ?? -1) >= Number(q.get('min_level')))
        .filter(([, { rows: r }]) => q.getAll('player')
          .every((id) => r.matchPlayers.some((p) => p.playerId === id)))
        .filter(([, { rows: r }]) => !q.get('yaku') || r.handYakus.some((y) => y.yaku === q.get('yaku')))
        .filter(([, { rows: r }]) => !q.get('q') || [r.match.name, ...r.matchPlayers.map(seatName)]
          .some((n) => n.toLowerCase().includes(q.get('q').toLowerCase())))
        .sort(([, a], [, b]) => b.rows.match.startedAt.localeCompare(a.rows.match.startedAt))
        .map(([id, m]) => ({
          id, name: m.rows.match.name, players: m.rows.match.players,
          status: m.rows.match.status, startedAt: m.rows.match.startedAt,
          endedAt: m.rows.match.endedAt, hands: m.rows.hands.length,
          seats: m.rows.matchPlayers.map(seatName),
          playerIds: m.rows.matchPlayers.map((p) => p.playerId),
          scores: m.rows.matchPlayers.map((p) => p.finalScore),
          placements: m.rows.matchPlayers.map((p) => p.placement),
          maxLevel: m.rows.match.maxLevel, revision: m.revision,
        })));
    }
    const id = decodeURIComponent(path.replace('/matches/', ''));
    if (method === 'DELETE') { api.matches.delete(id); return reply(204); }
    if (method === 'PUT') {
      if (body.players !== undefined) return reply(422, { detail: 'players are not sent' });
      if (body.rows.matchPlayers.some((p) => p.playerId && !api.players.has(p.playerId))) {
        return reply(422, { detail: 'unknown player' });
      }
      const revision = (api.matches.get(id)?.revision ?? 0) + 1;
      api.matches.set(id, { revision, rows: body.rows });
      return reply(200, { revision });
    }
    if (method === 'GET' && api.matches.has(id)) {
      const { revision, rows } = api.matches.get(id);
      const players = rows.matchPlayers.filter((p) => p.playerId)
        .map((p) => ({ id: p.playerId, displayName: api.players.get(p.playerId).displayName }));
      return reply(200, { revision, rows, players });
    }
    return reply(404, { detail: 'not in the fake' });
  });

  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });

  const byText = async (text) => page.evaluate((t) => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim().startsWith(t));
    if (!button) throw new Error(`no button labelled ${t}`);
    button.click();
  }, text);

  // Seats the table with guests, through the seat picker: type, then take the
  // guest option. (Registered players are covered in the server section.)
  const seatGuests = async (list) => {
    for (const name of list) {
      const input = await page.$('.setup__name');
      await input.type(name);
      await byText(`Seat “${name}”`);
    }
  };

  const shot = async (name, opts = {}) => {
    if (SHOT_DIR) { mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: join(SHOT_DIR, name), ...opts }); }
  };

  // The tracker owns the root now; the calculator is one tap in.
  await page.waitForSelector('.home');
  await page.waitForSelector('.brand__logo');
  check((await page.$eval('.app__title--home', (el) => getComputedStyle(el).color)) === 'rgb(74, 158, 255)',
        'the home title is the accent blue, with the chun mark');
  const homeCards = await page.$$eval('.home__card', (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { label: e.textContent, left: Math.round(r.left), top: Math.round(r.top),
             tall: r.height > r.width, bottom: r.bottom };
  }));
  check(JSON.stringify(homeCards.map((c) => c.label))
        === JSON.stringify(['New match', 'Hand calculator', 'History', 'Players']),
        `home has the four cards (got ${JSON.stringify(homeCards.map((c) => c.label))})`);
  check(homeCards.every((c) => c.tall) && homeCards[0].top === homeCards[1].top && homeCards[2].top > homeCards[0].top
        && homeCards[0].left === homeCards[2].left,
        'as tall cards, two across');
  check(homeCards.every((c) => c.bottom <= 844), 'all four fit on a phone screen without scrolling');
  const winds = await page.$$eval('.home__art[data-art="players"] .home__glyph', (els) => els.map((e) => {
    const r = e.getBoundingClientRect(); return [r.left, r.top];
  }));
  check(winds.length === 4 && winds[0][0] < winds[1][0] && winds[0][1] === winds[1][1]
        && winds[2][1] > winds[0][1] && winds[2][0] === winds[0][0],
        'the winds sit in the corners, East top left to North bottom right');
  await shot('00-home.png');
  await byText('Hand calculator');
  await page.waitForSelector('.keyboard');

  // Wait for the scorer to finish booting before asserting on the button state.
  await page.waitForFunction(
    () => !document.querySelector('.status')?.textContent?.includes('Loading'),
    { timeout: 90_000 },
  );

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
  // A dealer's ron has no first-round yakuman, so the tick is refused there
  // rather than silently ignored -- and the screen says why.
  const firstRound = () => page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')]
      .find((f) => f.querySelector('.field__label')?.textContent === 'Situational yakuman');
    return [field.querySelector('.check').disabled, field.querySelector('.field__hint').textContent];
  });
  const [dealerOff, dealerWhy] = await firstRound();
  check(dealerOff && dealerWhy.includes('tenhou'),
        `a dealer ron cannot claim a first-round win (got ${dealerOff}, "${dealerWhy}")`);
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')]
      .find((f) => f.querySelector('.field__label')?.textContent === 'Seat wind');
    field.querySelectorAll('.segmented__btn')[1].click();   // South
  });
  const [southOff, southWhat] = await firstRound();
  check(!southOff && southWhat === 'Scores as Renhou.',
        `a non-dealer ron's first-round win is renhou (got ${southOff}, "${southWhat}")`);
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
  check(await page.$('.score__who') === null, 'the plain calculator names nobody');
  const tier = await page.$eval('.score', (e) => e.dataset.tier);
  check(tier === 'none', `a 4 han hand uses the plain tier (got "${tier}")`);
  const hanLabels = await page.$$eval('.score__han', (els) => els.map((e) => e.textContent));
  check(hanLabels.every((t) => /^\d+ han$/.test(t)),
        `each yaku line is labelled in han (got ${JSON.stringify(hanLabels)})`);

  // --- open riichi: 2 han, or a yakuman on a ron under the house rule ---
  const backToHand = () => page.evaluate(() => {
    [...document.querySelectorAll('button')].find((x) => x.textContent === 'Back to the hand').click();
  });
  const setRiichi = async (label) => {
    await page.click('.flaps__tab:nth-child(2)');
    await page.waitForSelector('.context');
    await page.evaluate((l) => [...document.querySelector('[aria-label="Riichi"]').querySelectorAll('button')]
      .find((b) => b.textContent === l).click(), label);
  };
  const scoreIt = async () => {
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find((x) => x.textContent === 'Score hand').click());
    await page.waitForSelector('.score');
    return page.$$eval('.score__yaku span:first-child', (els) => els.map((e) => e.textContent));
  };
  await backToHand();
  await page.waitForSelector('.flaps__tab');
  await setRiichi('Open');
  const ruleToggle = await page.$('[aria-label="Ron on an open riichi"]');
  check(ruleToggle !== null, 'the calculator offers the open riichi ron rule once it applies');
  const openYakus = await scoreIt();
  const openPoints = await page.$eval('.score__points', (e) => e.textContent);
  check(openYakus[0] === 'Open Riichi' && openPoints === '12,000',
        `open riichi is 2 han: a haneman here (got ${JSON.stringify(openYakus)}, ${openPoints})`);
  await backToHand();
  await page.waitForSelector('.flaps__tab');
  await page.click('.flaps__tab:nth-child(2)');
  await page.evaluate(() => [...document.querySelector('[aria-label="Ron on an open riichi"]')
    .querySelectorAll('button')].find((b) => b.textContent === 'Yakuman').click());
  const ronYakus = await scoreIt();
  const ronLevel = await page.$eval('.score__title', (e) => e.textContent);
  check(JSON.stringify(ronYakus) === JSON.stringify(['Open Riichi Ron']) && ronLevel === 'Yakuman',
        `under the rule the ron is a yakuman (got ${JSON.stringify(ronYakus)}, ${ronLevel})`);
  await shot('03-open-riichi.png');
  await backToHand();
  await page.waitForSelector('.flaps__tab');
  await setRiichi('None');
  await page.click('.flaps__tab:nth-child(1)');

  // --- melds render as they sit on a real table ---
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

  // Ura dora and the open calls both follow the riichi, picked on the other flap.
  const modes = () => page.$$eval('.modebar__btn',
    (els) => Object.fromEntries(els.map((e) => [e.textContent, e.disabled])));
  const noRiichi = await modes();
  check(noRiichi['Ura Dora'] && !noRiichi.Pon, `ura dora needs a riichi (got ${JSON.stringify(noRiichi)})`);
  await page.click('.flaps__tab:nth-child(2)');
  await page.waitForSelector('.context');
  await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')]
      .find((f) => f.querySelector('.field__label')?.textContent === 'Riichi');
    [...field.querySelectorAll('.segmented__btn')].find((b) => b.textContent === 'Riichi').click();
  });
  await page.click('.flaps__tab:nth-child(1)');
  const inRiichi = await modes();
  check(inRiichi.Chii && inRiichi.Pon && inRiichi.Kan && !inRiichi['Closed kan'] && !inRiichi['Ura Dora'],
        `a riichi rules out the open calls and allows ura (got ${JSON.stringify(inRiichi)})`);
  await arm('Ura Dora'); await page.click('.keyboard [data-key="s1"]');
  const uraCount = await page.$$eval('.dorarow', (rows) => rows.length);
  check(uraCount === 2, `ura accepted in riichi (got ${uraCount} indicator rows)`);

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
  await seatGuests(names);
  const umaFields = await page.$$eval('.setup__uma input', (els) => els.map((e) => e.value));
  check(JSON.stringify(umaFields) === JSON.stringify(['20', '10', '-10', '-20']),
        `uma is four editable fields, preloaded (got ${JSON.stringify(umaFields)})`);
  const seatMarks = await page.$$eval('.setup__seatno', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(seatMarks) === JSON.stringify(['東', '南', '西', '北']),
        `seats are marked with winds (got ${JSON.stringify(seatMarks)})`);
  const openRule = await page.$$eval('[aria-label="Ron on an open riichi"] button',
    (els) => els.map((e) => [e.textContent, e.getAttribute('aria-pressed')]));
  check(JSON.stringify(openRule) === JSON.stringify([['Normal (2 han)', 'true'], ['Yakuman', 'false']]),
        `the open riichi ron rule is a setup choice, normal by default (got ${JSON.stringify(openRule)})`);
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
  /** [label, disabled, aria-pressed] for each button of a labelled group. */
  const groupState = (label) => page.evaluate((l) => [...document.querySelector(
    `[aria-label="${l}"]`).querySelectorAll('button')].map(
    (b) => [b.textContent.trim(), b.disabled, b.getAttribute('aria-pressed')]), label);
  /** The review's points table, row by row, as the player reads it. */
  const confirmRows = () => page.$$eval('.confirm__row', (els) => els.map((el) => ({
    wind: el.querySelector('.windmark')?.textContent,
    name: el.querySelector('.confirm__name').lastChild.textContent,
    was: el.querySelector('.confirm__was').textContent,
    delta: el.querySelector('.confirm__delta').textContent,
    place: el.querySelector('.confirm__place').textContent,
  })));
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
  // already two han -- three with Beto's riichi -- so fewer become unreachable.
  await pick('Fu', '25');
  const hanState = await page.evaluate(() => {
    const field = [...document.querySelectorAll('.field')].find(
      (f) => f.querySelector('.field__label')?.textContent === 'Han');
    return Object.fromEntries([...field.querySelectorAll('.pill')].map(
      (b) => [b.textContent.trim(), b.disabled]));
  });
  check(hanState['1'] === true, 'picking 25 fu rules out 1 han');
  check(hanState['2'] === true && hanState['3'] === false,
        `riichi + chiitoitsu is 3 han at least (got ${JSON.stringify(hanState)})`);
  await pick('Fu', '30');

  // Beto declared riichi, so the hand was closed: said, not asked.
  const openRiichi = await groupState('Hand was');
  check(JSON.stringify(openRiichi) === JSON.stringify([['Closed', true, 'true'], ['Open', true, 'false']]),
        `a riichi hand is shown closed and locked (got ${JSON.stringify(openRiichi)})`);
  // Riichi plus menzen tsumo is two han, so a 1 han tsumo cannot be picked...
  await pick('Han', '1');
  check((await groupState('How'))[1][1] === true, 'a 1 han riichi hand cannot be a tsumo');
  await pick('Han', '3');
  // ...and from the other side, a tsumo rules out 1 han.
  await byText('Tsumo');
  check((await groupState('Han'))[0][1] === true, 'riichi + tsumo rules out 1 han');
  await byText('Ron');

  await byText('Review');
  await page.waitForSelector('.confirm');
  await byText('Back');
  await page.waitForSelector('.winmenu');
  const keptValue = [(await groupState('Han')).find(([, , p]) => p === 'true')?.[0],
                     (await groupState('Fu')).find(([, , p]) => p === 'true')?.[0],
                     (await groupState('Dealt in')).find(([, , p]) => p === 'true')?.[0]];
  check(JSON.stringify(keptValue) === JSON.stringify(['3', '30', 'Cami']),
        `Back from the review keeps the typed value (got ${JSON.stringify(keptValue)})`);
  await byText('Review');
  await page.waitForSelector('.confirm');
  const confirmRound = await page.$$eval('.confirm__round span',
                                         (els) => els.map((e) => e.textContent));
  check(confirmRound[0] === 'East 1 · 0 repeats' && confirmRound[2] === 'East 2 · 0 repeats',
        `the round change is spelled out (got ${JSON.stringify(confirmRound)})`);
  const confirmTable = await confirmRows();
  const deltaOf = (name) => confirmTable.find((r) => r.name === name)?.delta;
  // Beto is on riichi, so he also lifts his own stick: 3,900 + 1,000.
  check(deltaOf('Beto') === '+4,900' && deltaOf('Cami') === '-3,900',
        `the points change is shown before committing (got ${JSON.stringify(confirmTable)})`);
  const confirmHints = await page.$$eval('.confirm .field__hint',
                                         (els) => els.map((e) => e.textContent).join(' '));
  check(confirmHints.includes('riichi stick'),
        'the confirmation explains why the change exceeds the hand value');
  // Listed as the standings will be after the hand, each with the wind it held.
  const confirmOrder = confirmTable.map((r) => `${r.wind}${r.name} ${r.place}`);
  check(JSON.stringify(confirmOrder) === JSON.stringify(
    ['南Beto ▲1st', '東Ana ▼2nd', '北Dani 3rd', '西Cami ▼4th']),
        `the review lists players by place, with winds and movement (got ${JSON.stringify(confirmOrder)})`);
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
  // Leaving the builder for the menu keeps the tiles for when it is reopened.
  const heldTiles = () => page.$$eval('.handdisplay__tiles .tile', (els) => els.length);
  await byText('Back');
  await page.waitForSelector('.winmenu');
  await byText('Enter the hand and score it');
  await page.waitForSelector('.keyboard');
  check(await heldTiles() === 14, `the tiles survive a trip back to the menu (got ${await heldTiles()})`);
  await page.waitForFunction(
    () => !document.querySelector('.btn--primary')?.disabled, { timeout: 30_000 });
  await byText('Score hand');
  await page.waitForSelector('.score');
  const embeddedSeat = await page.$eval('.score__seat', (el) => el.textContent);
  check(embeddedSeat === 'Non-dealer ron',
        `the seat wind came from the seat, not a picker (got ${embeddedSeat})`);
  const who = await page.$eval('.score__who', (el) => el.textContent);
  check(who === 'Dani off Ana’s discard', `the score names the winner and the discarder (got "${who}")`);
  await shot('18-scored.png');

  await byText('Record this hand');
  await page.waitForSelector('.confirm');
  const scoredValue = await page.$eval('.confirm__points', (el) => el.textContent);
  check(scoredValue === '7,700', `the confirmation shows the scored value (got ${scoredValue})`);
  const confirmTitle = await page.$eval('.app__title', (el) => el.textContent);
  check(confirmTitle === 'Dani ron off Ana', `the confirmation names the discarder (got "${confirmTitle}")`);
  // Back from the review returns to the hand as it was, not an empty form.
  await byText('Back');
  await page.waitForSelector('.keyboard');
  check(await heldTiles() === 14, `Back from the review keeps the hand (got ${await heldTiles()})`);
  await page.waitForFunction(
    () => !document.querySelector('.btn--primary')?.disabled, { timeout: 30_000 });
  await byText('Score hand');
  await page.waitForSelector('.score');
  await byText('Record this hand');
  await page.waitForSelector('.confirm');
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

  // Open or closed is optional: nothing is chosen for you, and nothing needs to be.
  check((await groupState('Hand was')).every(([, , pressed]) => pressed === 'false'),
        'open/closed starts unset');
  // An open hand is never chiitoitsu or pinfu tsumo, so 25 fu goes (20 already
  // has, on a ron); and a 25 fu pick rules out Open.
  await byText('Open');
  const openFu = Object.fromEntries((await groupState('Fu')).map(([v, d]) => [v, d]));
  check(openFu['25'] === true && openFu['30'] === false, `open rules out 25 fu (got ${JSON.stringify(openFu)})`);
  await byText('Open');
  await pick('Fu', '25');
  check((await groupState('Hand was'))[1][1] === true, '25 fu rules out an open hand');
  await pick('Han', '2');
  await pick('Fu', '30');
  const reviewable = await page.$$eval('.btn--primary',
    (els) => els.some((b) => b.textContent === 'Review' && !b.disabled));
  check(reviewable, 'a hand records without saying open or closed');
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
  const camiRow = (await confirmRows()).find((r) => r.name === 'Cami');
  await byText('Record this hand');
  await page.waitForSelector('.table');
  const afterMulti = await scores();
  // Ana 2 han 30 fu (2000) and Dani 3 han 30 fu (3900), both off Cami, on the
  // honba the exhaustive draw left behind -- paid once, to the nearest winner.
  const camiBefore = Number(camiRow.was.replace(/,/g, ''));
  check(Number(afterMulti[2].replace(/,/g, '')) === camiBefore - 5900 - 300,
        `the discarder pays both hands and one honba (got ${afterMulti[2]} from ${camiRow.was})`);
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
  await seatGuests(names);
  await byText('Start match');
  await page.waitForSelector('.table');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('End early');
  await page.waitForSelector('.confirm');
  await byText('End it now');
  await page.waitForSelector('.standings');
  const standings = await page.$$eval('.standings__row', (els) => els.map((el) => ({
    name: el.querySelector('.standings__name').lastChild.textContent,
    wind: el.querySelector('.windmark').textContent,
    uma: el.querySelector('.standings__uma').textContent,
  })));
  check(standings[0]?.name === 'Ana',
        `a level table places by seat order (got ${standings[0]?.name})`);
  // The wind each started on, however far the deal went.
  check(JSON.stringify(standings.map((r) => r.wind)) === JSON.stringify(['東', '南', '西', '北']),
        `the standings show each player's starting wind (got ${JSON.stringify(standings.map((r) => r.wind))})`);
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
  await seatGuests(names.slice(0, 3));
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
  const tsumoWho = await page.$eval('.score__who', (el) => el.textContent);
  check(tsumoWho === 'Cami, self-drawn', `a tsumo names only the winner (got "${tsumoWho}")`);
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

  // ==================== the server ====================

  // Everything so far was recorded against a locked server: the tracker never
  // noticed, and the home screen asks for the PIN.
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sync[data-state="locked"]', { timeout: 10_000 });
  check(api.matches.size === 0, 'nothing reaches a locked server');
  await shot('50-sync-locked.png');

  await page.type('.sync__input', '1111');
  await byText('Unlock');
  await page.waitForSelector('.sync__error');
  check((await page.$eval('.sync__error', (el) => el.textContent)).includes('not the PIN'),
        'a wrong PIN is refused, in words');

  await page.$eval('.sync__input', (el) => { el.value = ''; });
  await page.click('.sync__input', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('.sync__input', api.pin);
  await byText('Unlock');
  await page.waitForFunction(() => !document.querySelector('.sync'), { timeout: 10_000 });
  check(true, 'the right PIN unlocks, and the panel goes quiet once everything is saved');

  const uploaded = [...api.matches.values()].map((m) => m.rows);
  const finished = uploaded.find((r) => r.match.status === 'finished' && r.hands.length === 2);
  check(uploaded.length > 0, `matches played while locked are uploaded (${uploaded.length})`);
  check(finished !== undefined
        && finished.hands.map((h) => `${h.roundWind} ${h.roundNumber}`).join() === 'este 1,este 2'
        && finished.matchPlayers.every((p) => p.placement !== null),
        'the finished match arrives with its hands and its placements');

  // A new match goes up as soon as it starts, and the header says so.
  const before = api.matches.size;
  await byText('New match');
  await page.waitForSelector('.setup');
  await seatGuests(names);
  await byText('Start match');
  await page.waitForSelector('.table');
  await page.waitForSelector('.syncdot[data-state="synced"]', { timeout: 10_000 });
  check(api.matches.size === before + 1, 'a new match is saved when it starts');

  // Discarding it takes it off the server again.
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Discard this match');
  await byText('Yes, throw it away');
  await page.waitForSelector('.home');
  const deadline = Date.now() + 10_000;
  while (api.matches.size !== before && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  check(api.matches.size === before, 'a discarded match comes off the server');

  // ==================== players ====================

  await byText('Players');
  await page.waitForSelector('.players');
  // Firefox ignores a triple-click's select-all here, so clear with the keyboard.
  const replaceText = async (selector, text) => {
    await page.click(selector);
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type(selector, text);
  };
  const addPlayer = async (name) => {
    await replaceText('.players__add .players__input', name);
    await byText('Add');
  };
  for (const name of ['Ana', 'Beto', 'Cami', 'Dain']) {
    await addPlayer(name);
    await page.waitForFunction((n) => [...document.querySelectorAll('.players__name')]
      .some((e) => e.textContent === n), {}, name);
  }
  check(api.players.size === 4, 'players are added on the Players screen, on the server');

  await addPlayer('ANA');
  await page.waitForSelector('.players__message--bad');
  check((await page.$eval('.players__message--bad', (el) => el.textContent)).includes('Ana already exists'),
        'a second player by the same name is refused');

  // A typo is fixed by renaming, not by making someone new.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.players__row')]
      .find((r) => r.querySelector('.players__name')?.textContent === 'Dain');
    row.querySelector('.players__rename').click();
  });
  await page.waitForSelector('.players__edit');
  await replaceText('.players__edit .players__input', 'Dani');
  await byText('Save');
  await page.waitForFunction(() => [...document.querySelectorAll('.players__name')]
    .some((e) => e.textContent === 'Dani'));
  check([...api.players.values()].some((p) => p.displayName === 'Dani') && api.players.size === 4,
        'renaming fixes the name without adding anyone');
  await shot('52-players.png');
  await byText('Back');
  await page.waitForSelector('.home');

  // Setup chooses from the players; typing only searches.
  await byText('New match');
  await page.waitForSelector('.setup');
  await page.type('.setup__name', 'be');
  const offered = await page.$$eval('.setup__option', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(offered) === JSON.stringify(['Beto', 'Seat “be” as a guest']),
        `typing searches the players and offers a guest (got ${JSON.stringify(offered)})`);
  await byText('Beto');
  for (const name of ['Ana', 'Cami']) {
    await page.type('.setup__name', name.slice(0, 2));
    await byText(name);
  }
  await seatGuests(['Visitor']);
  await shot('53-setup-picker.png');
  const chosen = await page.$$eval('.setup__chosen', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(chosen) === JSON.stringify(['Beto×', 'Ana×', 'Cami×', 'Visitorguest×']),
        `seats show who sits there, guests marked (got ${JSON.stringify(chosen)})`);
  await byText('Start match');
  await page.waitForSelector('.syncdot[data-state="synced"]', { timeout: 10_000 });
  const seatedRows = [...api.matches.values()].map((m) => m.rows)
    .find((r) => r.matchPlayers.some((p) => p.guestName === 'Visitor'));
  check(seatedRows?.matchPlayers.filter((p) => p.playerId).length === 3
        && seatedRows.matchPlayers[3].playerId === null,
        'three registered players and a guest reach the server as such');
  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Discard this match');
  await byText('Yes, throw it away');
  await page.waitForSelector('.home');

  // Another phone's match in progress, offered on the home screen.
  const other = structuredClone(finished);
  other.match = { ...other.match, id: 'from-another-phone', status: 'in_progress',
                  endReason: null, endedAt: null, name: '' };
  other.matchPlayers = other.matchPlayers.map((p) => ({ ...p, placement: null, umaPoints: null }));
  api.matches.set('from-another-phone', { revision: 3, rows: other });
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home__elsewhere', { timeout: 10_000 });
  await shot('51-elsewhere.png');
  await byText(other.matchPlayers
    .map((p) => p.guestName ?? api.players.get(p.playerId).displayName).join(', '));
  await page.waitForSelector('.table');
  await byText('Timeline');
  await page.waitForSelector('.timeline');
  check(JSON.stringify(await timelineRounds()) === JSON.stringify(['East 2', 'East 1']),
        `a match carried on from another phone arrives with its hands (got ${JSON.stringify(await timelineRounds())})`);
  await byText('Back');
  await page.waitForSelector('.table');
  const revisionBefore = api.matches.get('from-another-phone').revision;
  await new Promise((r) => setTimeout(r, 500));
  check(api.matches.get('from-another-phone').revision === revisionBefore,
        'carrying a match on does not re-send it unchanged');

  // ==================== routes ====================

  const at = () => page.evaluate(() => location.pathname);
  // Firefox fires popstate asynchronously; give the guard a moment to answer.
  const settle = () => new Promise((r) => setTimeout(r, 300));
  check(await at() === '/match', `the table is /match (got ${await at()})`);

  // A back gesture steps out of a read-only menu, as its Back button would...
  await byText('Timeline');
  await page.waitForSelector('.timeline');
  await page.goBack(); await settle();
  check(await page.$('.table') !== null && await at() === '/match',
        `a back gesture closes the timeline and stays on the table (at ${await at()})`);
  // ...and at the table it does nothing at all.
  await page.goBack(); await settle();
  check(await page.$('.table') !== null && await at() === '/match',
        `a back gesture at the table does not leave the match (at ${await at()})`);
  // A half-entered hand survives one too.
  await page.click('.seat--right .playerbox__main');
  await page.waitForSelector('.winmenu');
  await page.goBack(); await settle();
  check(await page.$('.winmenu') !== null, 'a back gesture does not close the win menu');
  await byText('Cancel');
  await page.waitForSelector('.table');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.table');
  check(await at() === '/match', 'reloading /match comes back to the table');

  await byText('Manual');
  await page.waitForSelector('.manual');
  await byText('Back to the home screen');
  await page.waitForSelector('.home');
  check(await at() === '/', `leaving the match goes to / (got ${await at()})`);
  await page.goBack(); await settle();
  check(await page.$('.table') === null,
        'once left, the table is not one back gesture away');
  // Only opening the app at / goes back to a match in progress; a link to
  // anywhere else is followed.
  await page.goto('http://localhost:5199/players', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.players');
  check(await at() === '/players', `a link to /players opens it (got ${await at()})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.players');
  check(true, 'reloading /players stays on the Players screen');
  // Opened from a link, its Back has nothing behind it, and goes home.
  await byText('Back');
  await page.waitForSelector('.home');
  check(await at() === '/', `Back from a linked screen goes home (got ${await at()})`);
  check(await page.$('.home__resume') !== null, 'and home offers the match back');

  await byText('Players');
  await page.waitForSelector('.players');
  check(await at() === '/players', `the Players button goes to /players (got ${await at()})`);
  await page.goBack(); await settle();
  await page.waitForSelector('.home');
  check(await at() === '/', 'a back gesture from Players goes home');

  await page.goto('http://localhost:5199/calculator', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.keyboard');
  check(true, 'a link to /calculator opens the calculator');

  await page.goto('http://localhost:5199/no/such/page', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home');
  await settle();
  check(await at() === '/' && await page.$('.table') === null,
        `an unknown path goes home, not to the match (at ${await at()})`);

  // ==================== history ====================

  // Two finished matches with known contents, one of them with Beto registered.
  const beto = [...api.players.values()].find((p) => p.displayName === 'Beto');
  const seed = (id, name, maxLevel, startedAt, edit = (r) => r) => {
    const rows = structuredClone(finished);
    rows.match = { ...rows.match, id, name, maxLevel, startedAt };
    api.matches.set(id, { revision: 1, rows: edit(rows) });
  };
  seed('hist-kita', 'the kita one', 'haneman', '2026-09-10T20:00:00.000Z');
  seed('hist-beto', 'with Beto', 'sinNombre', '2026-09-12T20:00:00.000Z', (r) => {
    r.matchPlayers[1] = { ...r.matchPlayers[1], playerId: beto.id, guestName: null };
    return r;
  });
  const listed = () => page.$$eval('.history__name', (els) => els.map((e) => e.textContent));
  const waitListed = (pred) => page.waitForFunction(pred, { timeout: 10_000 });

  await page.goto('http://localhost:5199/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.history__item', { timeout: 10_000 });
  const all = await listed();
  check(all.indexOf('with Beto') >= 0 && all.indexOf('with Beto') < all.indexOf('the kita one'),
        `history lists finished matches, newest first (got ${JSON.stringify(all)})`);
  check(!all.includes(''), 'an unnamed match is labelled as such');
  const level = await page.$eval('.history__item[data-tier="haneman"] .history__level',
    (el) => el.textContent).catch(() => null);
  check(level === 'Haneman', `a match shows its best hand, themed (got ${level})`);
  const meta = await page.$eval('.history__meta', (el) => el.textContent);
  check(/\d{1,2}:\d{2}/.test(meta), `the history shows when a match started, to the minute (got "${meta}")`);
  await shot('60-history.png');

  // Filtering by a player puts it in the URL.
  const entriesBefore = await page.evaluate(() => history.length);
  await page.evaluate((name) => [...document.querySelectorAll('.history__chips .chip')]
    .find((c) => c.textContent === name).click(), 'Beto');
  await waitListed(() => ![...document.querySelectorAll('.history__name')]
    .some((e) => e.textContent === 'the kita one'));
  check(JSON.stringify(await listed()) === JSON.stringify(['with Beto']),
        `a player filter keeps only their matches (got ${JSON.stringify(await listed())})`);
  check((await page.evaluate(() => location.search)) === `?player=${beto.id}`,
        'the filter is in the URL');

  // Into a match and back again, to the same filtered list.
  await page.click('.history__item');
  await page.waitForSelector('.standings');
  check(await at() === '/matches/hist-beto', `a match has its own URL (got ${await at()})`);
  check((await page.$eval('.app__title', (el) => el.textContent)) === 'with Beto',
        'the review is titled with the match name');
  check((await page.$$('.standings__row')).length === 3, 'the review shows the standings');
  check(JSON.stringify(await timelineRounds()) === JSON.stringify(['East 1', 'East 2']),
        `the review reads East 1 first (got ${JSON.stringify(await timelineRounds())})`);
  await shot('61-review.png');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.standings', { timeout: 10_000 });
  check(true, 'a match review survives a reload');
  await byText('Back');
  await page.waitForSelector('.history__item');
  check((await page.evaluate(() => location.search)) === `?player=${beto.id}`
        && JSON.stringify(await listed()) === JSON.stringify(['with Beto']),
        'Back returns to the list as it was filtered');

  await byText('Clear filters');
  await page.select('select[aria-label="Best hand"]', '2');
  await waitListed(() => ![...document.querySelectorAll('.history__name')]
    .some((e) => e.textContent === 'with Beto'));
  check(JSON.stringify(await listed()) === JSON.stringify(['the kita one']),
        `haneman or better keeps the haneman match (got ${JSON.stringify(await listed())})`);
  await page.select('select[aria-label="Yaku"]', 'chiitoitsu');
  await page.waitForFunction(() => document.querySelector('.home__hint')?.textContent
    .includes('No finished match fits'), { timeout: 10_000 });
  check(true, 'a filter with no match says so');
  await byText('Clear filters');
  await page.type('.history__search', 'KITA');
  await waitListed(() => {
    const n = [...document.querySelectorAll('.history__name')].map((e) => e.textContent);
    return n.length === 1 && n[0] === 'the kita one';
  });
  check(true, 'searching finds a match by name, ignoring case');
  await byText('Clear filters');
  await byText('Sanma');
  await waitListed(() => document.querySelectorAll('.history__item').length > 0);
  check((await page.evaluate(() => location.search)) === '?players=3', 'sanma only is in the URL too');
  // Filters replace the history entry, so Back leaves the list rather than
  // stepping back through every filter. (One entry was added by the review.)
  check(await page.evaluate(() => history.length) === entriesBefore + 1,
        `changing filters adds no history entries (got ${await page.evaluate(() => history.length)}, from ${entriesBefore})`);

  await page.goto('http://localhost:5199/matches/no-such-match', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.home__hint')?.textContent
    .includes('no such match'), { timeout: 10_000 });
  check(true, 'an unknown match says so');
  await byText('Back');
  await page.waitForSelector('.history__filters');
  check(await at() === '/matches', `Back from a linked match goes to the list (got ${await at()})`);

  // Locked, the history asks for the PIN rather than showing nothing.
  api.unlocked = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sync__pin', { timeout: 10_000 });
  check(true, 'a locked server asks for the PIN on the history');
  await page.type('.sync__input', api.pin);
  await byText('Unlock');
  await page.waitForSelector('.history__item', { timeout: 10_000 });
  check(true, 'and the list appears once it is in');

  // ==================== player profiles ====================

  await page.goto('http://localhost:5199/players', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a.players__name');
  await page.evaluate(() => [...document.querySelectorAll('a.players__name')]
    .find((a) => a.textContent.trim() === 'Beto').click());
  await page.waitForSelector('.profile', { timeout: 10_000 });
  await page.waitForSelector('.linechart', { timeout: 10_000 });
  check(await at() === '/players/beto', `a name on the Players screen opens their page (got ${await at()})`);
  check((await page.evaluate(() => location.search)) === '?players=3',
        'a player with only sanma behind them opens on sanma');
  check((await page.$eval('.app__title', (el) => el.textContent)) === 'Beto', 'the page is titled with the name');
  const tiles = await page.$$eval('.stat__label', (els) => els.map((e) => e.textContent));
  check(tiles.length === 6 && ['Win rate', 'Tsumo rate', 'Deal-in rate', 'Riichi rate', 'Average place'].every((t) => tiles.includes(t)),
        `the rates are there, as an even grid (got ${JSON.stringify(tiles)})`);
  const winRate = await page.evaluate(() => [...document.querySelectorAll('.stat')]
    .find((s) => s.querySelector('.stat__label').textContent === 'Win rate')
    .querySelector('.stat__value').textContent);
  check(winRate === '20%', `4 wins in 20 hands is a 20% win rate (got ${winRate})`);
  const placeRows = await page.$$eval('.profile__section:first-of-type .donut__label',
    (els) => els.map((e) => e.textContent));
  check(JSON.stringify(placeRows) === JSON.stringify(['1st', '2nd', '3rd']),
        `sanma placements have three slices (got ${JSON.stringify(placeRows)})`);
  const bars = await page.$$eval('.bars__name', (els) => els.map((e) => e.textContent));
  check(JSON.stringify(bars) === JSON.stringify(['Riichi', 'Tanyao', 'Pinfu']),
        `the yaku leave dora out (got ${JSON.stringify(bars)})`);
  check(await page.$('.endscreen__best .handsummary') !== null, 'the best hand shows its tiles');
  check(await page.$('.profile__open') === null && await page.$('button.endscreen__best--link') !== null,
        'the best hand box is itself the link to its match');
  await page.click('button.endscreen__best--link');
  await page.waitForSelector('.standings', { timeout: 10_000 });
  check((await at()).startsWith('/matches/'), `tapping the best hand opens its match (got ${await at()})`);
  await page.goBack();
  await page.waitForSelector('button.endscreen__best--link', { timeout: 10_000 });
  const fills = await page.$$eval('.donut__slice', (els) => els.map((e) => getComputedStyle(e).fill));
  check(fills.includes('rgb(255, 210, 74)') && fills.includes('rgb(180, 122, 232)') && fills.includes('rgb(255, 107, 107)'),
        `win method is gold, purple and red (got ${JSON.stringify(fills)})`);
  const placeSwatches = await page.$$eval('.profile__section:first-of-type .donut__swatch',
    (els) => els.map((e) => getComputedStyle(e).backgroundColor));
  check(JSON.stringify(placeSwatches) === JSON.stringify(['rgb(255, 210, 74)', 'rgb(211, 218, 229)', 'rgb(205, 140, 79)']),
        `places are gold, silver and bronze (got ${JSON.stringify(placeSwatches)})`);
  const histo = await page.$$eval('.histogram__col', (els) => els.map((c) => ({
    label: c.querySelector('.histogram__label').textContent,
    count: c.querySelector('.histogram__count').textContent,
    fill: c.querySelector('.histogram__bar') && getComputedStyle(c.querySelector('.histogram__bar')).backgroundColor,
  })));
  check(histo.length === 12, `the value histogram always has twelve bars (got ${histo.length})`);
  const bar = (label) => histo.find((h) => h.label === label);
  check(bar('1k')?.count === '2' && bar('1k')?.fill === 'rgb(74, 158, 255)'
        && bar('Man')?.fill === 'rgb(78, 205, 138)' && bar('Hane')?.fill === 'rgb(180, 122, 232)'
        && bar('Yaku')?.fill === null,
        `bars are counted and coloured by limit (got ${JSON.stringify(histo.filter((h) => h.count))})`);
  await page.click('.profile__notyet summary');
  const notYet = await page.$$eval('.profile__notyetlist li', (els) => els.map((e) => e.textContent));
  check(notYet.length > 10 && !notYet.includes('Riichi') && !notYet.includes('Tanyao') && !notYet.includes('Dora'),
        `the yaku still to come leave out what was won, and dora (${notYet.length} listed)`);
  check(!notYet.includes('Sanshoku Doujun'), 'sanma does not ask for a sanshoku it cannot make');
  const listTime = await page.$eval('.profile__matchdate', (el) => el.textContent);
  check(/\d{1,2}:\d{2}/.test(listTime), `a match is dated to the minute (got "${listTime}")`);
  await shot('70-profile.png', { fullPage: true });
  await page.hover('.linechart__point');
  await page.waitForSelector('.linechart__tip');
  check((await page.$eval('.linechart__tipname', (el) => el.textContent)) === 'with Beto',
        'hovering a placement names its match');
  await page.click('.linechart__point');
  await page.waitForSelector('.standings', { timeout: 10_000 });
  check(await at() === '/matches/hist-beto', `a placement opens its match (got ${await at()})`);
  await page.goBack(); await settle();
  await page.waitForSelector('.profile');
  check((await page.evaluate(() => location.search)) === '?players=3', 'Back returns to the sanma page');

  await byText('Four players');
  await page.waitForFunction(() => document.querySelector('.home__hint')?.textContent
    .includes('No finished matches yet'), { timeout: 10_000 });
  check((await page.evaluate(() => location.search)) === '?players=4',
        'choosing four-player sticks, and is written out so the sanma redirect cannot undo it');
  await page.goto('http://localhost:5199/players/nobody', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.home__hint')?.textContent
    .includes('no such player'), { timeout: 10_000 });
  check(true, 'an unknown player says so');

  // ==================== desktop, and narrow ====================

  const box = (sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const fitsWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:5199/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.history__item', { timeout: 10_000 });
  const filtersBox = await box('.history__filters');
  const listBox = await box('.history__list');
  check(filtersBox.right <= listBox.left && Math.abs(filtersBox.top - listBox.top) < 40,
        'on a wide screen the filters sit beside the matches');
  const cards = await page.$$eval('.history__item', (els) => els.map((e) => e.getBoundingClientRect().top));
  check(cards.length >= 2 && cards[0] === cards[1], 'and the matches are laid out two across');
  check(await fitsWidth(), 'the wide history does not scroll sideways');
  await shot('80-desktop-history.png');

  await page.goto('http://localhost:5199/matches/hist-beto', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.standings', { timeout: 10_000 });
  const outcomeBox = await box('.review__outcome');
  const handsBox = await box('.review__hands');
  check(outcomeBox.right <= handsBox.left, 'a wide review puts the outcome beside the hands');
  check(await fitsWidth(), 'the wide review does not scroll sideways');
  await shot('81-desktop-review.png');

  await page.goto('http://localhost:5199/players/beto?players=3', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.linechart', { timeout: 10_000 });
  const tileTops = await page.$$eval('.stat', (els) => els.map((e) => e.getBoundingClientRect().top));
  check(new Set(tileTops).size === 1, `a wide profile has its tiles in one row (got ${tileTops.length} tiles)`);
  const sections = await page.$$eval('.profile__grid > .profile__section',
    (els) => els.map((e) => e.getBoundingClientRect().left));
  check(new Set(sections).size === 2, 'and its sections in two columns');
  check(await fitsWidth(), 'the wide profile does not scroll sideways');
  await shot('82-desktop-profile.png', { fullPage: true });

  // The table stays a phone-width column even on a wide screen.
  const tableWidth = await page.evaluate(() => {
    const app = document.createElement('div');
    app.className = 'app app--table';
    document.body.append(app);
    const w = app.getBoundingClientRect().width;
    app.remove();
    return w;
  });
  check(tableWidth <= 560, `the table keeps its phone width on a wide screen (got ${tableWidth}px)`);

  await page.setViewport({ width: 360, height: 740 });
  for (const path of ['/matches', '/matches/hist-beto', '/players/beto?players=3']) {
    await page.goto(`http://localhost:5199${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.history__item, .standings, .linechart', { timeout: 10_000 });
    check(await fitsWidth(), `${path} fits a 360px phone`);
  }
  await page.setViewport({ width: 390, height: 844 });

  console.log(failed ? '\nBROWSER TEST FAILED' : '\nBROWSER TEST PASSED');
} catch (err) {
  failed = true;
  console.error('\nBROWSER TEST ERRORED:', err.message);
  // What the screen looked like when it gave up, which is usually the answer.
  if (SHOT_DIR && lastPage) {
    await lastPage.screenshot({ path: join(SHOT_DIR, '99-errored.png') }).catch(() => {});
  }
} finally {
  await browser?.close();
  await server.close();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
