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
- Sudden death: past the final round, the match ends the moment a hand puts
  somebody over the target. North 4 is the hard stop.
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

## Phase 3 — Backend and sync — NEXT

**Start here.** Phases 1 and 2 are closed and need no revisiting. The client is
complete and local-only: a match can be set up, tracked hand by hand, scored
against the Prolog engine, reviewed and finished, with an IndexedDB mirror that
survives a reload.

What is already done for you:

- `frontend/src/features/match/rows.ts` maps a `MatchState` onto the tables in
  `DATA_MODEL.md` and back. `rows.test.ts` proves the round trip on a match
  holding one of every outcome. **This is the serialisation layer — do not write
  a second one.** The POST body is `toRows(state)`.
- Every hand row carries a `clientUuid`, so the endpoint is idempotent on it
  without any further client work.
- `DATA_MODEL.md` is current and measured; `npm run measure:storage` reruns the
  sizing if the schema changes.

Order that works: schema and migration first (it is already specified), then the
endpoint, then the queue. The queue is the only genuinely new client code —
everything it sends already exists.

- [ ] **Decide the database.** Deferred deliberately and still open. Capacity is
      settled (see `DATA_MODEL.md` — 5 MB is years of play), so the question is
      backup retention and durability. Neon is the standing recommendation.
- [ ] FastAPI + SQLAlchemy 2.0 + Alembic, schema per `DATA_MODEL.md`
- [ ] `POST /matches/{id}/hands`, idempotent on `client_uuid`
- [ ] Client write queue + retry, feeding from `toRows()`
- [ ] Replace the guest-only seats with real `players` rows — `SetupScreen` sets
      `playerId: null` for everyone today, and `fromRows` already takes a
      `nameOf(playerId)` lookup for when that changes
- [ ] PIN gate, `robots.txt`, `X-Robots-Tag: noindex`
- [ ] `make db-backup` before migrations

## Phase 4 — History and stats

- [ ] Match list: filter by name, players, hand level ≥ X, yaku achieved
- [ ] **Hand order is chronological for any finished match** — East 1 at the top,
      the last hand at the bottom. Only a match *in progress* reads newest
      first, because at the table you are checking the last hand. The tracker's
      `TimelineView` already does this off `status`; a history view must too.
- [ ] Player directory + per-player page (placement line, best hand, win-method
      pie, placement pie, avg rank, tsumo/deal-in/riichi rates, yaku frequency)
- [ ] Desktop layout

## Phase 5 — Polish, deploy, harden

- [ ] Heroku deploy, PWA install, service-worker caching of the wasm assets
- [ ] Limit-hand theming pass, empty/error states


## Picking this up cold

Read this file, then `CLAUDE.md` for the invariants. The short version of what
was learned building Phases 1 and 2:

- **The Prolog engine fails silently.** Validate before querying; sort melds.
- **Never ask twice for a fact the match already holds.** The tracker supplies
  both winds, the win mode and the riichi state to `HandBuilder`. A duplicate
  picker does not just look untidy — a wrong seat wind mis-scores the hand and
  the engine returns a plausible-looking answer.
- **The pure cores are where the rules live.** `handState.ts`, `matchState.ts`,
  `seats.ts`, `scoring.ts` are React-free and carry most of the 177 unit tests.
  Fix rules there, not in a component.
- **Never assume four seats.** Sanma is a `players: 3` match; iterate
  `seatsIn(state)` / `seatsOf(players)`, never `[0, 1, 2, 3]`, and pass the count
  to `paymentTotal`. A four-entry loop over a sanma match reads an absent seat.
- **`npm run test:browser` is the safety net that matters.** It drives the real
  UI in Firefox — 100 checks, including a four-player match played end to end
  and a sanma match with a tile-scored kita hand. Several real
  bugs this session were caught only there: a ron reaching the reducer with no
  discarder, and a CSS specificity bug that made a change apply to nothing.
- Screenshots: `SHOT_DIR=/some/dir npm run test:browser`. The one-off probe
  scripts used during development created Firefox profiles under
  `~/snap/firefox/common/` and did **not** clean up; the committed smoke test
  does. If you write another probe, delete its profile.

Still open, none of it blocking:

- Agari-yame; landscape/tablet layout for the table; a "who am I" seat so the
  phone's owner sits at the bottom rather than seat 1.
- The centre-box logo is the chun glyph used as a CSS mask, standing in for a
  real red dragon mark.
- `frontend/tsconfig.tsbuildinfo` is tracked and churns on every commit; it
  wants a `.gitignore` line and a `git rm --cached`.
- Upstream: `riichi` is still granted on an open hand. Guarded client-side and
  reported; see `SCORER_GAPS.md`.