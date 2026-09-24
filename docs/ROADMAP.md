# Roadmap

Living checklist. **Update at the end of every session.**

## Phase 0 — Spikes and skeleton — DONE (2026-09-19)

- [x] swipl-wasm spike: 12 vendored `.pl` files load and score in Node
- [x] Browser verified: same result under `swipl-web` in Firefox, 146 ms cold
- [x] Results match the `swipl` CLI exactly; ~1 ms per query
- [x] Vendoring script with upstream-test gate (`scorer/sync-prolog.sh`)
- [x] Repo skeleton: git, Vite 5 + React 18 + TS (Node 18 constraint), vitest
- [x] Docs: contract, gaps, architecture, data model, roadmap

## Phase 1 — Hand scorer and tile input — DONE (2026-09-20)

Contract layer — **done**, 20 tests:
- [x] `types.ts`, `order.ts`, `term.ts`, `serialize.ts`, `decode.ts`, `validate.ts`
- [x] `engine.ts` + Node and browser factories
- [x] Browser test harness (`npm run test:browser`, system Firefox, 10 checks)

Tile input — **done**, 18 tests:
- [x] FluffyStuff tiles vendored (CC0), renamed to atom names, svgo'd 868K→404K
- [x] `handState.ts` — pure state + disable logic, React-free
- [x] `TileKeyboard` — 4 rows, per-tile disable with reasons surfaced as tooltips
- [x] `HandDisplay` — sorted concealed tiles, winning tile set apart, melds with
      rotated / face-down tiles
- [x] `CallModeBar` — mutually exclusive; call modes disarm after use, dora stay
- [x] `HandContextPanel` — ron/tsumo, winds in kanji, riichi, circumstance flags
- [x] `ScoreResultView` — yaku list, han/fu/points, limit-hand colour theming
- [x] Dark theme, mobile-first layout

- [x] Situational yakuman — confirmed with the user that this covers only the
      contextual ones that can't be inferred from shape, i.e. first-round wins
      (tenhou / chiihou / renhou, all from `primeraRonda`). Everything else the
      engine reads from the tiles. Surfaced as its own labelled control.

Styling, after a round of on-device feedback:
- [x] Per-tier limit palettes (green mangan, purple haneman, bronze baiman,
      silver sanbaiman, gold yakuman), as animated gradient text
- [x] Per-mode button colours; uniform when idle
- [x] Dora/red/ura yaku lines coloured; yaku lines labelled in han
- [x] Stylesheet-coverage test, after three silent CSS regressions

Deferred out of Phase 1 (not blocking the tracker):
- [ ] Widen the test corpus from `puntuacion_matriz_tests.pl` (fu 20–110)
- [ ] Differential harness: WASM vs `swipl` CLI over a generated hand corpus
- [ ] Landscape / tablet layout (currently tuned for phone portrait)
- [ ] A called run whose red five sits mid-run is reachable via the Red Five
      modifier; no known gaps left in tile entry

## Phase 2 — Match tracker (local only) — DONE (2026-09-20)

Rules core — **done**, 40 tests:
- [x] `seats.ts` — seat/wind/round arithmetic. The dealer is *derived* from the
      round, never stored, so a repeat cannot drift from the round marker.
- [x] `scoring.ts` — base points, payments, honba, sticks, noten split, uma
- [x] `matchState.ts` — `recordHand()` plus undo, adjustments, manual round
- [x] `handTiles.ts` — the `hand_tiles` encoding, with its longest-match parse

UI — **done**:
- [x] Radial table: four boxes rotated to face their own chair, centre box with
      round / honba / sticks, per-player riichi button
- [x] Win menu — ron/tsumo + discarder, then either a typed value (han+fu or a
      limit) or the embedded `HandBuilder`
- [x] Draw menu — exhaustive (tenpai picker + live payment preview), nagashi
      mangan, abortive draws with a reason
- [x] Timeline, manual controls (adjust / advance / undo / end early)
- [x] Setup screen: names, shuffle, East/South, uma preset, target score
- [x] End screen with placements, uma and match naming
- [x] IndexedDB mirror, restored on load; finished matches archived locally

Hand-scorer integration:
- [x] The tracker supplies **both winds and the win mode**, and their selectors
      are hidden. The seat wind is what tells the engine the winner is dealer,
      so deriving it from the seat removes a way to mis-score a hand in silence.
- [x] The tile route is locked until a ron has a discarder — otherwise the hand
      gets built before the outcome can be recorded against anything.

Rules settled with the user this session:
- Uma ±10/±20, **no oka**; placement points are uma alone.
- The target score (default 30,000) therefore only decides when the match ends.
  *(Superseded 2026-09-24: that is the **goal** score; a separate target score
  now sets the oka. See the Backlog section.)*
- Sudden death: past the final round, the match ends the moment a hand puts
  somebody over the target. North 4 is the hard stop. *(Superseded 2026-09-24:
  one extra wind, then stop.)*
- Outcomes recorded: tsumo, ron, exhaustive draw, nagashi mangan, abortive draw.
  **Chombo is deliberately not in the UI** (the enum value stays in the data
  model); a chombo is handled as a manual adjustment with a note.

After a round of on-device feedback:
- [x] **Confirmation before anything touches the match** — wins, draws, score
      corrections, undo, manual round moves. It runs the change and shows the
      result rather than describing it, which is possible because every
      transition is pure. One component covers all of them: it diffs two states.
- [x] **Multiple ron.** This ruleset pays every player who wins on the discard,
      so a triple ron is a win with three winners, not an abortive draw. The pot
      is split (odd stick to the winner nearest the discarder) and the honba is
      paid once, to the same winner.
- [x] Impossible han/fu combinations disabled, from both directions and
      depending on ron/tsumo: 20 fu is a pinfu tsumo (2+ han, never a ron), 25 fu
      is chiitoitsu (2+ han on a ron, 3+ on a tsumo).
- [x] Manual score correction is a field per player with a balance check — the
      four numbers must still total what they totalled, since points cannot enter
      or leave a riichi table.
- [x] Uma is four editable fields that must sum to zero; seats are marked with
      wind kanji; "East match" / "South match"
- [x] Bigger type on the table, smaller centre box, labelled Riichi/Honba
      counters, each seat's wind spelled out as well as in kanji
- [x] Limit buttons themed to the score screen's tiers — and the two palettes
      unified, since `:root` had drifted from what the score screen used
- [x] Fixed: a disabled segmented button (riichi on an open hand) refused the tap
      while still looking available — `.segmented__btn:disabled` had no rule
- [x] Fixed: **no way out of a match**. The app restores whatever is in progress
      on every load, and the only exit was finishing it — so a match started by
      mistake followed you around and the home screen was unreachable. Manual
      control now has "Back to the home screen" (keeps it) and "Discard this
      match" (clears the mirror, two-tap).

Second feedback round:
- [x] **Multiple ron reworked.** "Add another winner" used to pick the next seat
      itself, leaving the only seat selector on screen labelled "Dealt in" while
      it was really asking something else. Winner and discarder are now separate
      rows, and a seat is blocked only if it already holds a hand on this discard
      or is the discarder.
- [x] Four riichi is refused as an abortive draw until four riichi are actually
      declared — the tracker knows, so it checks rather than trusting.
- [x] Stored tiles are shown back: on the review screen, in the timeline, and
      under the match's best hand. This is what `hand_tiles` is kept for.
- [x] Fu 20–50 share a row evenly; 60–110 sit below at their own width
- [x] Limit buttons on a fixed grid — five of them wrapped 3+2 and the bottom two
      stretched to 177px against 116px above, which is what read as "Sanbaiman
      is off-centre". The text was centred; the row was not.
- [x] Dropped the point preview from the tenpai picker, now the review screen
      shows it against the real next state one tap later

Third feedback round:
- [x] Centre box carries a wordmark ("<logo> Chuncito") above the round, with
      Riichi and Honba stacked on their own lines. The logo is the chun glyph
      used as a CSS **mask** rather than an image, so it takes the app's accent
      colour — a placeholder until the real red dragon exists.
- [x] Limits laid out as Mangan/Haneman, Baiman/Sanbaiman, then Yakuman across
      the bottom, each row filling the width evenly
- [x] The discarder is locked once a winner is staged — however many players win,
      they all win off the same tile
- [x] **The riichi selector follows the table.** No riichi declared means it
      cannot be claimed in the builder; a declared one is preselected and cannot
      be dropped, though the double stays open. Falls back to free choice when
      the hand is open, where a riichi is impossible anyway.
- [x] Timeline entries are themed by limit — a double ron takes its best hand's —
      and draws share a red palette. Same treatment on the best-hand panel and
      the review screen.

Fourth feedback round:
- [x] Winner and Dealt-in rows are colour-coded green and red — selected fills,
      idle carries a light tint so the two rows are told apart before anything
      is picked, which is where the multiple-ron screen went wrong
- [x] Manual and Timeline swapped in the match bar
- [x] `.btn--quiet` has a box again. Without one the Back/Cancel/Manual buttons
      read as labels rather than controls.

Fifth feedback round:
- [x] A scored hand can be **staged** instead of recorded, so a multiple ron can
      mix both routes freely — tiles for one winner, a typed value for the next.
      Both feed one list of winners, recorded as a single hand.
- [x] Winner selection toggles, and a hand can be recorded while no winner is
      selected, so an accidental pick cannot lock the form.
- [x] Nothing checks that the winners share a winning tile. In a real double ron
      they do, but the engine is asked one hand at a time and cannot be told
      about the other, so there is nothing to gain by enforcing it.

Verified before Phase 3:
- [x] Storage measured rather than estimated (`npm run measure:storage`)
- [x] **Round trip tested.** `rows.ts` maps a match onto the tables and back;
      `rows.test.ts` plays a match with one of every outcome and rebuilds it from
      the rows alone. Writing it found three columns missing: `return_score`,
      `end_reason` and `situation_flags`.

Deferred out of Phase 2:
- [ ] Agari-yame (the leading dealer choosing to end it) — not wanted for now
- [ ] Landscape / tablet layout for the table
- [ ] A "who am I" seat, to put the phone's owner at the bottom of the table

## Sanma (three-player) — DONE (2026-09-21)

Added between Phases 2 and 3 at the user's request. `MatchConfig.players` (3 | 4)
is the switch; every rule follows from it rather than from a separate flag.

Rules settled with the user:
- Same payment table; a tsumo is simply paid by the seats that exist ("tsumo
  loss": a 1000 non-dealer tsumo is 500 + 300 = 800). The score screen says so,
  with the four-player figure alongside.
- **Honba 1000** — 1000 on a ron, 500 from each payer on a tsumo.
- **Noten 3000**, split three ways (one tenpai: +3000 / −1500 each; two: +1500
  each / −3000).
- **Nukidora on**, **no chii**. Manzu 2–8 are not in the set; a 1m indicator
  makes 9m the dora.
- Defaults (editable at setup, not confirmed as house rules — ask if they look
  wrong): 35,000 start, 40,000 target, uma +15/0/−15.
- Assumed without asking, as the standard sanma shape: three rounds per wind;
  sudden death runs into West and stops at West 3; the four-riichi abort is not
  offered; at most two ron winners; winning on a kita replacement is rinshan; a
  pulled North also counts for any dora/ura that is a North.

What changed:
- [x] `seats.ts` takes the player count everywhere (`seatsOf`, `dealerOf`,
      `nextRound`, `lastWind`, …). Seat 3 is the absent chair.
- [x] `scoring.ts`: `Delta` is one entry per seat in play; `HONBA` per count;
      `paymentTotal(payment, players)`.
- [x] `rows.ts` / `DATA_MODEL.md`: `matches.players`; the round trip is tested
      for sanma too. Old IndexedDB mirrors load as four-player.
- [x] Setup toggle, three-seat table (left box gone), menus and timeline sized
      to the seats.
- [x] Hand scorer: `HandState.sanma` + `kita`, a Kita marker mode, Chii hidden,
      `withNukidora()` applied after the engine. `hand_tiles` gains `kita:nn`.
- [x] Plain calculator has a Four / Three toggle on the Details flap.
- [x] 33 unit tests (`sanma.test.ts` ×2, incl. two against the real engine),
      11 browser checks.

Open: the engine has no nukidora input, so a hand whose best decomposition
changes once kita are added is priced off the engine's choice. Logged in
`SCORER_GAPS.md` and reported.

## Small features (2026-09-21)

- [x] **Red fives optional.** `MatchConfig.redFives` (setup toggle, default on;
      `matches.red_fives`) and `HandState.redFives` (a With/Without toggle on the
      calculator's Details flap). Off: no Red Five button, all four fives are
      plain (`plainSupply` depends on it), and a kan of fives is no longer forced
      to contain the red. Switching the calculator off turns any entered red
      five plain rather than clearing the hand.
- [x] Fu 60–110 now share their row evenly, like 20–50.
- [x] **Live places.** Each player box shows its current place as a badge on
      its right edge, and the review screen adds a place column with ▲/▼
      where it moved. 1st–3rd are gold/silver/bronze (`--place-1..3`, borrowed
      from the limit metals) on the table, the review and the end screen.
      `placesOf()` uses the same ordering as the final standings (ties to the
      earlier seat), and returns nothing while every score is level, so a fresh
      match does not rank four identical scores 1st–4th. The dealer accent is
      now the primary blue, so it no longer competes with the gold 1st.
- [x] **One box layout for every seat.** The side seats used to be a squashed
      row version; now all four are the same box (name, score and place over the
      riichi button), turned to face their chair. The side tracks are as wide as
      a box is tall (`--seat-h`), so the centre shrank and its type with it; the
      top and bottom boxes span the full width. The browser test checks the
      geometry — no overflow, clipping or overlap — at 390px and 360px.
- [x] The riichi button fills the box's spare height instead of leaving a gap.
- [x] A finished match's timeline reads East 1 first; an ongoing one stays
      newest first.

## Phase 3 — Backend and sync — DONE (2026-09-21)

The server exists, the phone saves to it, seats are registered players, and a
match can be carried on from another device. What is not done is a real deploy
of the backend: that is Phase 5's Heroku item, and `main` has not been migrated
until it happens.

**Database: Neon, Postgres 18,** region `aws-us-east-2`. Two branches: `main`
(real matches; Neon's console names it `production`) and `dev` (development
and tests). The repo-root `.env`
(gitignored) holds four URLs; `backend/app/settings.py` picks between them by
**target**, which defaults to `dev` — the real data is only reachable with
`CHUNCITO_TARGET=main` (`make db-migrate TARGET=main`), and the tests refuse to
run against it. Pooled URLs (PgBouncer, transaction mode) for the app, direct
ones for Alembic and `pg_dump`. Why Neon over Supabase: Supabase's free tier
pauses after a week idle and has no restorable backups; Neon scales to zero and
wakes itself.

- [x] **Decided the database:** Neon (above). `main` has **not** been migrated
      yet — nothing has needed it. `make db-migrate TARGET=main` when the
      backend is first deployed.
- [x] FastAPI + SQLAlchemy 2.0 (Core) + Alembic in `backend/`, schema per
      `DATA_MODEL.md` (migration `0001`, autogenerated from `app/models.py`
      and reviewed). `test_schema.py` diffs the migrated database against the
      models, so they cannot drift.
- [x] **Sync is whole-match, not per hand** — a deliberate change from the
      `POST /matches/{id}/hands` this plan used to name. `PUT /api/matches/{id}`
      takes `{baseRevision, rows: toRows(state)}` and replaces the server's
      copy in one transaction. Undo, corrections, renames and end-of-match
      placements are then just the next save instead of four special cases, at
      a cost of a few KB per request. It is still idempotent (a retried save is
      recognised by a content hash) and it is safe against a stale phone (a
      save based on an old revision gets 409 rather than overwriting newer
      hands). See `backend/app/store.py`.
- [x] Client write queue + retry (`sync.ts`, `syncClient.ts`): one pending save
      per match, coalesced, persisted in IndexedDB, exponential backoff up to a
      minute, flushed on `online` and on returning to the tab. Matches finished
      before the server existed are uploaded on first start-up. Discarding a
      match deletes it from the server. **The tracker never waits on any of
      it**; status is a dot in the match header and a panel on the home screen.
- [x] PIN gate: one PIN for the group (`CHUNCITO_PIN`), entered once per phone,
      remembered as an HMAC cookie; changing the PIN signs everyone out. Ten
      wrong tries per address per 15 minutes. Plus `robots.txt` (frontend and
      backend), `X-Robots-Tag: noindex` on every API response, and the
      `noindex` meta tag.
- [ ] **Backups — deferred by choice (2026-09-21).** `make db-backup`
      (`pg_dump` of the target into `backups/`) exists but is not wired into
      `make db-migrate`, and needs `postgresql-client-18`, which is not
      installed; it refuses an older `pg_dump` rather than making a dump that
      cannot be restored. Fine while `main` is empty. Revisit once real matches
      are on it: install the client, make `db-migrate` depend on
      `db-backup` again, and consider a scheduled dump, since Neon's free
      restore window is short.
- [x] **Players are created on purpose** (revised 2026-09-21, after a first
      version made them on the fly from typed names). The Players screen
      (`features/players/`) is the only place a player is added or renamed —
      `POST /api/players`, `PATCH /api/players/{id}`, both online-only, both
      refusing a name another player already has (ignoring case and accents:
      the server's `slugify`, mirrored by `slugOf`). Saving a match never
      creates anyone; a seat naming an unknown player is refused (422). Setup
      chooses each seat from the cached list, recent first: typing only
      searches, and anyone not in the list can be seated as a **guest**
      (marked as such; a name on that match only). The Players screen is where
      profile extras will go — a tile avatar (`players.avatar` exists), an
      accent colour (a migration away).
- [x] Carry on a match from another device: the home screen lists matches in
      progress on the server (when this phone has none of its own), and taking
      one fetches it, rebuilds it with `fromRows`, and adopts it at the
      server's revision. If both phones go on recording, whichever saves
      second gets the conflict panel.

Things learned doing it, worth keeping:

- **Rows order is part of the contract.** `hand_wins` and `hand_yakus` have no
  column for an arbitrary order, so the reducer now stores a double ron's
  winners in seat order, and `hand_yakus.position` keeps the engine's yaku
  order. Tenpai seats are sorted too.
- **`finalScore` mid-match excludes a live riichi stick**, so declaring riichi
  (which is not a completed hand) produces identical rows and sends nothing.
- **Ids are text, not UUID.** `crypto.randomUUID` needs a secure context, and
  the phone reaches the dev server over plain HTTP; `uuid()` now falls back to
  `getRandomValues`, but older local data has `id-…` strings.
- One known edge: a match ended manually with a riichi stick still declared
  loses that stick in `final_score` (correct) but `fromRows` rebuilds the live
  scores from deltas, which do not include it. Only visible if such a match is
  resumed from the server.

## Phase 4 — History and stats — DONE (2026-09-22)

Decided with the user (2026-09-21):

- **Four-player and sanma stats are kept separate** — placements, average
  rank, rates, everything. A 1st of three is not a 1st of four. A profile
  shows one at a time, with a toggle.
- **Profile customisation waits** (tile avatar, accent colour): after Phase 4,
  once there is a profile page to put it on.
- **Guest seats do not count** towards anyone's stats.
- Still on the Neon `dev` branch; no deploy to `main` for now.

Order: real routes first (history and profiles need URLs, and the back
button must work), then the match list and match review, then profiles and
their stats endpoints, then the desktop layout.

- [x] **Routing** (2026-09-21). `react-router-dom` **6** — v7 needs Node 20.
      A data router (`createBrowserRouter`, in `main.tsx`), because only a data
      router can block navigation; one catch-all route renders `App`, which holds
      the match and the `<Routes>`: `/`, `/setup`, `/match`, `/calculator`,
      `/players`, anything else → `/`.
      - **A back gesture never leaves the table.** `MatchScreen` blocks every
        navigation (`useBlocker`) except its own exits, which set `leaving`
        first. A blocked gesture steps out of a review, the timeline or Manual,
        as their Back would; in the win or draw menu it does nothing, since
        closing them would lose what was being entered.
      - Exits from the match *replace* the history entry, and so does starting
        one from setup: the table is never one back gesture away once left,
        and Back from the table never returns to setup.
      - A screen's Back goes back through the history when there is an in-app
        entry behind it (`history.state.idx`), home otherwise — so a tap and a
        gesture agree, and a screen opened from a link still has a way out.
      - Only opening the app **at `/`** jumps to a match in progress; a link
        anywhere else is followed, and home offers the match back. It checks
        the path the app was *opened* at, since the mirror is read
        asynchronously and an unknown path has become `/` by then.
      - FastAPI serves `frontend/dist` (`CHUNCITO_FRONTEND_DIST`) with an
        `index.html` fallback for any path that is not `/api/...` or a missing
        file; `assets/` is cached as immutable, everything else `no-cache`.
        `test_frontend.py` needs no database.
      - 15 browser checks: gestures on the table and in menus, reloads, links,
        unknown paths.
- [x] **Match list** (`/matches`, `features/history/`), finished matches newest
      first. Filters: text (the match's name *or* anyone seated, guests
      included), players (chips; every one chosen must have sat), All / Four /
      Sanma, best hand ≥ a level, a yaku achieved (dora of any kind are not
      offered). **Filtered on the server** — `GET /api/matches` takes `q`,
      `player` (repeatable), `min_level` (a `LEVEL_RANKS` rank), `yaku`,
      `players` — since the yaku filter is a join through `hand_yakus`. The
      summary now carries `playerIds`, `placements` and `maxLevel`.
      **The filters are the URL's query string** (`history.ts`: `filtersFrom` /
      `paramsOf`, short names in the URL, the API's in `apiPath`), so Back from
      a review returns to the same list; typing replaces the entry rather than
      pushing one per keystroke, and is debounced.
- [x] **Match review** (`/matches/:id`): rebuilt with `fromRows` like a carried-
      on match, shown with the end screen's `MatchOutcome` and the timeline's
      `TimelineList`, both factored out so the night and the review cannot
      drift apart. Offline says so; locked asks for the PIN in place.
- [x] **Hand order is chronological for any finished match** — `TimelineList`
      orders off `status`, and the review uses it.
- Feedback round (2026-09-22): matches are dated **to the minute, in local
  time**, everywhere they are listed, so two on one evening are told apart.
  The profile's donuts use the app's own palette at the user's request —
  places in gold / silver / bronze / accent blue, win method riichi gold,
  closed-without-riichi purple, open red — rather than the validator's
  defaults: every pair still separates (worst ΔE 17), only the lightness band
  and silver's chroma fail, and the legends name and count every slice. "Yaku
  won with" folds out the yaku still to come (sanshoku doujun left out in
  sanma, where there are no manzu runs).
- Visual round (2026-09-22): the home title wears the centre box's chun mark
  and accent (`.brand__logo`, shared). The profile gained a **hand value
  histogram** (`valueBins`): each win priced as a non-dealer ron from its
  base points, below-mangan hands in 1,000-point bins in blue, then one bar
  per limit in its tier colour; the server returns wins grouped by
  (level, base points). **Home is experimental**: four tall cards, 2×2,
  filling the screen, with tile glyphs as white masks on ghost tiles (chun;
  1-2-3 pin as a run; 3 man; the four winds in the corners). Its own commit,
  so it can be reverted whole if it does not stay.
- History reads the server only. The phone's own archive is not merged in:
  every finished match is uploaded anyway, and a second source would need
  de-duplicating for no gain.
- [x] **Player pages** (`/players/:slug`, `?players=3` for sanma). The
      Players screen is the directory: each name opens its page.
      `GET /api/players/{slug}/stats?players=4|3` (`store.player_stats`) does
      the counting over finished, non-test matches the player sat in, one kind
      at a time; guests never count, having no player. It returns **counts,
      not rates**, so the page can say "12 of 80" as well as "15%"
      (`profile.ts` does the arithmetic, tested).
      - Stat tiles: average place, uma, win / tsumo / deal-in / riichi rates.
        Win rate and deal-in rate are per hand played; tsumo rate is per win.
      - Placement line (oldest left, 1st on top; each point opens its match),
        placement donut, win-method donut (riichi / closed without riichi /
        open, plus "not recorded" for a typed-in win that never said), yaku
        frequency bars (dora of every kind left out), best hand with tiles,
        and the matches as a plain list — every value is readable without a
        hover.
      - **A nagashi mangan is not a win** for these stats: it pays like one,
        but there is no hand, riichi or otherwise.
      - Win method reads the *declaration* (`hand_riichi`), yaku frequency
        reads the *yaku rows*. They can disagree only on bad data.
      - Opened with no choice, on a player with only sanma, it shows sanma;
        once chosen, the choice is written out (`?players=4` too) so that
        redirect cannot undo it.
      - Charts are plain SVG (`charts.tsx`). Colours are `--viz-*` in
        `theme.css`, **validated with the dataviz palette validator** against
        `--bg-raised`: win method uses its dark categorical slots 1–3 (all
        pairs pass for colour-blind separation); placement is ordered, so it is
        one gold ramp — the app's gold/silver/bronze failed as a chart palette
        (silver reads grey). The validator needs Node ≥ 20 as shipped; under
        Node 18 copy it into a directory with `{"type":"module"}`.
- [x] **Desktop layout** (≥ 900px). Only the read-back screens spread out,
      via `.app--wide` (1120px): history puts the filters in a sticky sidebar
      beside a two-across grid of matches; a review puts the outcome, sticky,
      beside the hands; a profile has its six tiles in one row and its
      sections in two columns. **The table, setup, home and calculator stay a
      560px column** — they are used at the table, on a phone. Browser checks
      assert the side-by-side geometry at 1280px, the table's width there, and
      no sideways scroll at 1280px and 360px.

## Phase 5 — Polish, deploy, harden — NEXT

- [x] **Heroku deploy** — live since 2026-09-23 at
      <https://chuncito-04cb54b392c2.herokuapp.com/>. `docs/DEPLOY.md` is the runbook. Decided with the
      user: app `chuncito`, Eco dyno, US region,
      **automatic deploys on every push to GitHub `main`**.
      - [x] Root `package.json` (Node **22.x** for the build only; the
            `heroku-postbuild` builds `frontend/` and drops its
            `node_modules`), root `requirements.txt` → the backend's,
            `.python-version` 3.12, `Procfile`. Built and served from a clean
            copy with Node 22 and `NODE_ENV=production`, against `dev`.
      - [x] Behind the router (`DYNO` set, `Settings.behind_router`): HTTP →
            HTTPS 308, and the wrong-PIN limit keyed on the router's
            `X-Forwarded-For` entry — before, every caller was the router, so
            ten wrong PINs from anyone locked everyone out. `test_router.py`.
      - [x] Release phase **checks** the migration (`scripts/check_migrations.py`,
            `make db-check`) and never runs one: `main` is migrated by hand,
            backup first, before the push that needs it.
      - [x] **`main` migrated to `0001`** (2026-09-23, with the user's go-ahead;
            it was empty).
      - [x] Heroku side, set up by the user in the dashboard: app,
            buildpacks (nodejs then python), config vars, GitHub auto-deploy.
            First push `fd04e3a`; checked from outside: health (reaches
            Neon), the page and its immutable assets, the wasm, HTTP → HTTPS
            308, 401 without the PIN and on a wrong one, `noindex`.
      - [ ] The user's first real use on the phone.
- [x] **The scorer is downloaded once** (2026-09-23, after a friend found it
      slow). It was re-sent in full, uncompressed, on every fresh open: a fixed
      `/swipl/` path served `no-cache`, and no `304`s. Now fingerprinted into
      `assets/` via `?url` imports (cached a year, immutable), gzip on every
      response (4.1 → ~2 MB), `304` for revalidated files, and the table warms
      the scorer in the background. A failed load is retried rather than kept.
      Probed in Firefox against a local production build: a reload and a new
      visit request none of the scorer files. `stage:swipl` is gone.
- [ ] PWA install, and a service worker for working offline
- [ ] Limit-hand theming pass, empty/error states
- [ ] **Home screen verdict.** The card home (`dc6b7ce`, `e195bd3`) is
      experimental; the user may still scrap it — `git revert e195bd3 dc6b7ce`
      takes it back whole. Open question from its last round: the three pins
      are smaller than the other cards' glyphs (they share one card's width).


## Backlog (from 2026-09-24)

The user writes items as sections of the repo-root `backlog.md` (rough notes,
in Spanish, in `backlog_crudo.md`), and may add to it mid-session. **One commit
per item.** Ticked here as they land, with what was decided.

- [x] **Opengraph design** — `npm run brand` (`scripts/make-brand.mjs`) draws
      the favicons (`.svg`, `.ico` at 16/32/48 with the strokes thickened for
      the small sizes, a 180 px `apple-touch-icon`) and a 1200×630 `og.png`
      in Firefox, from the chun mask, the accent and the theme's font, so they
      are the home title rather than a redrawing of it. Landscape, the size
      every unfurler expects, though the backlog said "portrait". `og:image`
      names the Heroku host (see `DEPLOY.md`); `robots.txt` still refuses
      crawlers, so X/LinkedIn will not unfurl, WhatsApp/Telegram will.
- [x] **Scoring attribution** — the tile scorer's result screen, reached from
      the win menu, names the winner in green and on a ron the discarder in
      red ("Dani off Ana's discard" / "Cami, self-drawn"), above the han/fu.
      `HandBuilder` takes an `attribution` for it; the plain calculator has
      none and shows none. The confirmation's title says it too ("Dani ron
      off Ana"), for the typed-value route.
- [x] **Optional closed/open hand** — done before the invalid combinations,
      which build on it. The win menu's "Hand was" starts unset, a second tap
      clears it, and a hand records without it. A manual `HandValue.open` is
      `boolean | null`; null reaches `winner_open` as NULL, which the backend
      and the profile already counted as "not recorded" — no migration.
- [x] **Invalid button combinations** — `manualReachable` (`scoring.ts`)
      replaces `hanFuPossible`. It knows the win mode, **the winner's riichi
      from the table**, open/closed (or unsaid), han and fu, and a win-menu
      button is disabled when picking it would leave no real hand — so every
      rule blocks from every side, How and Hand was included. The rules:
      riichi ⇒ closed (the menu shows Closed locked, with a line saying why);
      closed tsumo is menzen tsumo, so riichi + tsumo is 2 han at least; 20 fu
      only as a closed pinfu tsumo (2 han, 3 with riichi); 25 fu only closed
      (2 han ron / 3 tsumo, +1 with riichi). 30 fu and up constrain nothing —
      the high end is reachable at 1 han. **Not done as written:** the backlog
      said tsumo should disable 20 fu, but 20 fu exists *only* on a tsumo:
      pinfu waives the tsumo's 2 fu (`puntuacion.pl:116`, and riichi.wiki).
      A closed ron is where 20 fu is impossible, and that was already blocked.
- [x] **First round win not working** — the engine was right (renhou for a
      non-dealer ron, checked against the CLI); the tick was accepted on a
      *dealer's* ron, where no first-round yakuman exists, and the engine
      then scored the plain hand as if it had not been ticked. The
      calculator's seat wind defaults to East, so that was the easy case to
      hit. Now refused there (`contextIssue`, and `reconcile` takes the tick
      back on switching to ron), and the panel says on screen what the tick
      will score as — Tenhou / Chiihou / Renhou (`firstRoundYakuman`) — or
      why it is unavailable, since the tooltip never shows on a phone.
- [x] **Call buttons disabled on riichi** and **Ura Dora only on riichi** —
      one commit, since they are one rule (`modeIssue` in `handState.ts`):
      a riichi (any kind) disables Chii, Pon and the open Kan (Closed kan
      stays, an ankan is legal in riichi) and enables Ura Dora. The riichi
      is on the other flap, so `reconcile` disarms a mode that just became
      illegal, and withdrawing the riichi drops the ura indicators, like
      ippatsu. In the tracker a declared riichi is preselected, so the calls
      are off from the start. This reverses the old "ura before riichi,
      since the tile flap comes first": pick the riichi first now.
- [x] **Open riichi** — upstream first, by a subagent in the Mahjonglog
      working tree (**left uncommitted there**, next to the user's earlier
      uncommitted work; 428 upstream tests pass), then re-vendored:
      - Engine: a `riichiAbierto` flag and yaku (2 han, instead of riichi),
        and **house rules as a sixth argument** — `resultadoDeVictoria/6`
        takes a list of rule atoms; `/5` is `/6` with `[]`. The first rule,
        `riichiAbiertoRonYakuman`, makes a ron on an open riichi the yakuman
        `riichiAbiertoRon`. See `SCORER_CONTRACT.md`.
      - Client: "Open" is a fourth riichi choice in the hand scorer, and
        counts as a riichi everywhere (ippatsu, ura, calls, the typed-value
        rules, nukidora's ura). `MatchConfig.rules` is the rule list, stored
        as `matches.rules` (**migration `0002`**), chosen at setup ("Ron on
        an open riichi: Normal (2 han) / Yakuman", normal by default), and
        passed by the win menu with every hand scored in the match — except
        that the yakuman rule is withheld when the discarder was in riichi
        themselves (they could not choose what to throw; the usual form of
        the rule — **an assumption, not confirmed with the user**). The plain
        calculator shows the same toggle once it applies.
      - **`main` needs `make db-migrate TARGET=main` (backup first) before
        the next push**, or the release phase refuses the deploy. `dev` is
        migrated.
      - The tracker's riichi button does not record *which* riichi; the kind
        is picked in the hand scorer. Stats count an open riichi as a riichi.
- [x] **Manual hand scoring should save hand** — two losses, both fixed:
      leaving the tile builder for the win menu dropped the tiles, and Back
      from the review screen (which sits outside the menu) remounted the menu
      empty — winners, typed value, staged hands and tiles. The menu's form is
      now one `WinDraft`, carried in `MatchScreen`'s `win` menu entry so Back
      (tap or gesture) returns to it exactly, including reopening the builder
      when that is where the hand was recorded from; Cancel to the table
      still discards it. The builder resumes a draft through `startingHand`
      (`handState.ts`), which re-applies what may have changed meanwhile —
      another winner's seat wind and riichi, ron ↔ tsumo, the rules — and
      `reconcile`s. A winner who declared riichi cannot have open calls, so
      those are removed and the builder says so; a winner who did not loses
      the riichi (and its ura). The plain calculator is unchanged.
- [x] **Players sorted by placement** — the end screen, the match review
      and the history list already listed by place; the review screen's
      points table did not, and now does (by the places *after* the change;
      seat order while everyone is level). Every one of them now shows a
      wind beside each name (`WindMark`, a circled kanji like setup's, East
      in the dealer accent): the **starting** wind on the end screen and in
      a match review, the wind **of the hand being recorded** on the review
      screen. The review table's number columns were narrowed to make room.

- [x] **Rearrange Rinshan and Chankan** — Ippatsu, Last draw, Chankan,
      Rinshan: the two kan circumstances side by side.
- [x] **Sort player selection alphabetically** — setup's picker uses
      `byName` (case- and accent-insensitive). The history filter's chips
      keep `byRecent`, which is what `markSeated` still feeds.
- [x] **Gap between wind and dragon tiles** — the keyboard's honour row is
      winds in columns 1–4, dragons in 7–9 (`.keyboard__row--honours`).
- [x] **Round advance displays ghost round** — the reducer advanced the
      round even on the hand that ended the match, so the review said "East
      4 → South 1" and a finished match's state sat in a round never played.
      A match-ending hand now leaves the round alone; the review says "East
      4 → End of the match" and drops "On the table next hand". `fromRows`
      has its own copy of the rule (`advance`), fixed in a follow-up commit
      so a match review does not show the ghost round either.
- [x] **Back on History undoes filters** — every filter change (chips,
      selects, Clear filters; typing already did) now *replaces* the history
      entry, so Back — button or gesture — leaves the list, while Back from a
      match review still lands on the list as it was filtered.
- [x] **Best hand's match from the profile** — "See that match" is gone;
      the best-hand box is itself the button (with a quiet "Open the match ›"
      line). `HandSummary`'s dora and kita rows no longer render their tiles
      as no-op buttons, which would have nested buttons inside it.
- [x] **Double yakuman** — upstream by a subagent (uncommitted there, 487
      tests): kokushi 13-wait, suuankou tanki and junsei chuuren replace
      their single forms at 26 han, and daisuushii is 26; stacking, levels
      and payments follow the total (`'4xYakuman'`… priced by
      `baseFromResult` too now). Gold theme as for any yakuman. The typed
      value offers Double and Triple Yakuman under Yakuman. The same round
      moved the client to `resultadoDeVictoria/7` (fu breakdown, next item);
      `decode.ts` reads `desglosado(Resultado, DesgloseFu)`. Found and
      logged, not fixed: a called chii can be taken as the winning meld for
      fu (`SCORER_GAPS.md`).
- [x] **Display fu breakdown** — the score screen lists the engine's
      `DesgloseFu` under the han lines, smaller and grey (`.score__fuline`):
      "Base 20 fu", "Closed ron 10 fu", "Closed triplet of 1m 8 fu", "Pair of
      Haku 2 fu", "Kanchan wait 2 fu", "Rounded up 4 fu" (`fuPartName`). None
      for a yakuman. Shown below rather than in a column beside the han, which
      a phone has no width for.
- [x] **Scrap a match on match end** — the end screen has Discard beside
      Save and finish; two taps, like Manual's, and it is the same discard
      (the mirror cleared, the server's copy deleted), landing on home.
- [x] **New stat: average point score** — "Average win" on the profile:
      `points_won` summed over wins (`pointsWonTotal`, a count like the
      others) divided by wins. That is each hand's value as paid — dealer
      bonus included, honba and riichi sticks not; a nagashi is not a win.
      The desktop tile row now holds any number of tiles in one row.
- [x] **Better hovers in player profile** — a placement point's tooltip
      lists the whole table by place, in the place metals, with this
      player's line bold (the stats' `PlacedMatch` now carries `table`). The
      value histogram prints no counts; hovering, focusing or tapping a bar
      shows its range and "2 (50.0%)" of all wins.
- [x] **More links to player profiles** — `PlayerName` (`features/players/`)
      links a registered player's name to `/players/<slugOf(name)>`; a guest
      stays plain text. Used in a match review: standings, best hand, the
      timeline's per-hand deltas and adjustments. Not on the end screen or
      the in-match timeline (the table blocks navigation), and not inside the
      history cards, which are already links as a whole. Styled as the text
      colour with a dotted underline, accent on hover.
- [x] **Goal score and sudden death** — `returnScore` / `return_score` is
      now `goalScore` / `goal_score` (**migration `0003`**, a rename; old
      phone mirrors are upgraded on load), labelled "Goal score" at setup:
      it only decides when the match ends. **Sudden death is one extra wind**
      (was: until North 4): short of the goal at the end of the final round,
      an East match plays on through South, a South match through West
      (round 3 in sanma); it ends the moment a hand puts somebody at the
      goal, or at the end of that wind. The *target* score — what placements
      are measured against, for oka — is a separate field, next item.
- [x] **Riichi sticks on match end** — whatever ends a match (last hand,
      bust, a manual end) settles the table: sticks still on it go to 1st
      (ties to the earlier seat), as an `adjustments` row noted
      `LEFTOVER_NOTE`, so the rows rebuild it. A declaration for a hand never
      played (a manual end) gets its own row too, fixing the old edge where
      such a stick vanished from a rebuilt match. Undo of the ending hand
      takes the settlement back. The review screen says where they go.
- [x] **Clean point ranking** — a **target score**, apart from the goal
      (`MatchConfig.targetScore`, `matches.target_score`, **migration
      `0004`**, backfilled to the starting points for older matches, i.e. no
      oka — as they were played). `matchResults` (`scoring.ts`): each result
      is final − target + uma, and 1st takes the oka, (target − start) ×
      players; points are conserved and uma sums to zero, so results sum to
      zero, which a unit test checks. Defaults 25,000 start / 30,000 target
      (oka 20) / 30,000 goal; sanma 35/40/40 (oka 15). Setup explains the oka
      with the numbers and refuses a target below the start. The end screen
      and match review show each result ("+35.0") with its working ("−5.0 vs
      target · +20 uma · +20.0 oka") and a line of the rules ending "The
      results sum to 0.0". Stored `uma_points` stay uma alone.
- [x] **MAKApoints** — a match's MP for a player *is* its result above
      (final − target + uma, oka to 1st; shown in thousands, "+14.5").
      Whether a match counts is chosen **on the end screen**, "Played for
      MPs" (the default) or "Just for fun" (`MatchState.ranked`,
      `matches.ranked`, **migration `0005`**; earlier matches unranked). The
      end screen lists each registered player's gain and their total before
      → after, from the server's list (or "total when online"); guests are
      "not counted". The server sums results over finished, ranked,
      non-test matches (`_mp_result` in `store.py`, from the stored
      placement, score and uma) into `mpPoints`/`mpMatches` on every player
      in `GET /api/players` and on the profile's stats, which shows a
      MAKApoints tile. **One total across four-player and sanma**, unlike
      the other stats — the backlog defines MP as the sum of all matches.
- [x] **Player list should look better** — `/players` is the ranking:
      one full-width card per player (`byMakapoints`), MP highest first with
      a rank badge; the top three cards are tinted and ringed in gold, silver
      and bronze (`--place-1..3`). Players with no ranked match follow,
      alphabetically, with a dashed badge and "—". The card is the link to
      the profile; Rename stays beside it.

## Picking this up cold

Read this file, then `CLAUDE.md` for the invariants. The short version of what
was learned building Phases 1 to 3 and the sanma round:

- **The Prolog engine fails silently.** Validate before querying; sort melds.
- **Never ask twice for a fact the match already holds.** The tracker supplies
  both winds, the win mode and the riichi state to `HandBuilder`. A duplicate
  picker does not just look untidy — a wrong seat wind mis-scores the hand and
  the engine returns a plausible-looking answer.
- **The pure cores are where the rules live.** `handState.ts`, `matchState.ts`,
  `seats.ts`, `scoring.ts` are React-free and carry most of the 233 unit tests.
  Fix rules there, not in a component.
- **Never assume four seats.** Sanma is a `players: 3` match; iterate
  `seatsIn(state)` / `seatsOf(players)`, never `[0, 1, 2, 3]`, and pass the count
  to `paymentTotal`. A four-entry loop over a sanma match reads an absent seat.
- **`npm run test:browser` is the safety net that matters.** It drives the real
  UI in Firefox — 201 checks, including a four-player match played end to end, the back-gesture guard, the history's filters and review, a player page,
  a sanma match with a tile-scored kita hand, and the PIN, upload, the Players
  screen, the seat picker and carrying a match on against a fake API (request interception; the run never
  touches the database). Several real bugs were caught
  only there: a ron reaching the reducer with no discarder, a CSS specificity
  bug that made a change apply to nothing, and place badges clipped to "1S" on
  the side seats. It also checks the table's **geometry** (no overflow,
  clipping or overlap at 390px and 360px), so a layout change that looks fine
  in one screenshot cannot quietly break another seat.
- **The user tests on their phone over the LAN.** `npm run dev -- --host` and
  hand them the `Network:` URL. Layout feedback comes from real use at the
  table, so check screenshots of every seat, not just the bottom one.
- **The backend tests run against real Postgres** — a throwaway schema on the
  Neon `dev` branch, built by the real migration and dropped afterwards
  (`make backend-test`, ~100 s from here, nearly all of it round trips to
  Ohio). The fixtures they PUT are written by `wire.test.ts` from real
  matches, and that test fails if they go stale: regenerate with
  `UPDATE_FIXTURES=1 npm test -- wire`. So a field added to `rows.ts` has to
  reach the database.
- **Running the whole thing locally:** `CHUNCITO_PIN=… make backend-dev` in
  one terminal (or put `CHUNCITO_PIN` in `.env`), `npm run dev -- --host` in
  another. Vite proxies `/api` to `:8000`, so the phone on the LAN gets both.
  Without the backend the app works exactly as before and says so on the
  home screen.
- Screenshots: `SHOT_DIR=/some/dir npm run test:browser`. When it errors it
  saves `99-errored.png` too, which usually shows the answer. Firefox ignores
  a triple-click select-all there; clear inputs with Ctrl+A. The one-off probe
  scripts used during development created Firefox profiles under
  `~/snap/firefox/common/` and did **not** clean up; the committed smoke test
  does. If you write another probe, delete its profile.

- **Routes** (Phase 4): `App.tsx` holds the match and the `<Routes>`; the
  router is a *data* router because only that can block navigation, and
  `MatchScreen` blocks every navigation but its own exits. Anything new
  reachable from inside a match goes through one of those exits.
- **History and stats read the server only**, and are filtered there; the
  list's filters and a profile's four/sanma choice live in the URL.
- **Charts are hand-rolled SVG/HTML** (`features/players/charts.tsx`), with
  their colours as `--viz-*` roles in `theme.css`. The user chose the app's
  own palette for them; the validator notes are in that CSS comment. The
  dataviz validator ships as ESM for Node 20: under Node 18 copy it into a
  directory with a `{"type":"module"}` package.json to run it.
- A test that opens `/` while a match is in progress lands on the table —
  that is the restore working, not a bug. It tripped this session's tests
  twice.

Still open, none of it blocking:

- **`npm audit`: two moderate advisories, both blocked on the Node 18 pin.**
  react-router 6 (an open redirect through a backslash in a `<Link>` or
  `navigate` target — every path here is a constant or `encodeURIComponent`d,
  so not reachable; and one for SSR, which is not used): fixed in v7, which
  needs Node 20. esbuild via Vite 5 (a page in the same browser can read the
  *dev* server's responses; dev only, but `--host` puts it on the LAN): fixed
  in a Vite past the pin. Moving to Node 20 would clear both; it is the
  user's call. The full audit also lists a critical (vitest's UI
  server) and a high (Vite's dev server): dev tools only, not in the deployed
  build — `npm audit --omit=dev` shows just the two react-router ones.

- Agari-yame; landscape/tablet layout for the table; a "who am I" seat so the
  phone's owner sits at the bottom rather than seat 1.
- The centre-box logo is the chun glyph used as a CSS mask, standing in for a
  real red dragon mark.
- Upstream: `riichi` is still granted on an open hand, and there is no
  nukidora input (kita han are added after the engine, which can misprice a
  hand whose best reading changes once they are added). Both guarded or
  worked around client-side and reported; see `SCORER_GAPS.md`.
- Sanma defaults — 35,000 start, 40,000 target, uma +15/0/−15 — were chosen,
  not confirmed as the group's house rules. Editable at setup either way.
- At 360px the "Sanma · South match" title nearly touches the header buttons,
  and the sync dot now sits in that title too.
- A save costs ~13 sequential queries (delete and re-insert per table). Fine
  next to the database; ~2.4 s from the LAN to Ohio in development. If it ever
  matters, the lever is batching the child inserts, not the protocol.