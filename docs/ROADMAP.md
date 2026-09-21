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

Deferred out of Phase 2:
- [ ] Agari-yame (the leading dealer choosing to end it) — not wanted for now
- [ ] Landscape / tablet layout for the table
- [ ] A "who am I" seat, to put the phone's owner at the bottom of the table

## Phase 3 — Backend and sync — NEXT

Start here. The reducer already emits rows of the `hands` shape with a
`clientUuid` on each, so this is wiring rather than redesign: a write queue that
POSTs `state.hands` and `state.adjustments` as they are produced.


- [ ] **Decide the database** (deferred here deliberately — see plan)
- [ ] FastAPI + SQLAlchemy 2.0 + Alembic, schema per `DATA_MODEL.md`
- [ ] `POST /matches/{id}/hands`, idempotent on `client_uuid`
- [ ] Client write queue + retry
- [ ] PIN gate, `robots.txt`, `X-Robots-Tag: noindex`
- [ ] `make db-backup` before migrations

## Phase 4 — History and stats

- [ ] Match list: filter by name, players, hand level ≥ X, yaku achieved
- [ ] Player directory + per-player page (placement line, best hand, win-method
      pie, placement pie, avg rank, tsumo/deal-in/riichi rates, yaku frequency)
- [ ] Desktop layout

## Phase 5 — Polish, deploy, harden

- [ ] Heroku deploy, PWA install, service-worker caching of the wasm assets
- [ ] Limit-hand theming pass, empty/error states
