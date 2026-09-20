# Roadmap

Living checklist. **Update at the end of every session.**

## Phase 0 — Spikes and skeleton — DONE (2026-09-19)

- [x] swipl-wasm spike: 12 vendored `.pl` files load and score in Node
- [x] Browser verified: same result under `swipl-web` in Firefox, 146 ms cold
- [x] Results match the `swipl` CLI exactly; ~1 ms per query
- [x] Vendoring script with upstream-test gate (`scorer/sync-prolog.sh`)
- [x] Repo skeleton: git, Vite 5 + React 18 + TS (Node 18 constraint), vitest
- [x] Docs: contract, gaps, architecture, data model, roadmap

## Phase 1 — Hand scorer and tile input — IN PROGRESS

Contract layer — **done**, 20 tests passing:
- [x] `types.ts`, `order.ts`, `term.ts`, `serialize.ts`, `decode.ts`, `validate.ts`
- [x] `engine.ts` + Node and browser factories
- [x] Browser smoke test harness (`npm run test:browser`, system Firefox)

Remaining:
- [ ] Vendor FluffyStuff tiles (CC0), rename to atom names
- [ ] `TileKeyboard` — 4 rows, per-tile disable logic
- [ ] `HandDisplay` — concealed tiles + melds with rotated / face-down tiles
- [ ] `CallModeBar` — chii/pon/kan/closedKan/dora/uraDora, mutually exclusive
- [ ] `HandContextPanel` — ron/tsumo, winds (kanji), riichi, flags, yakuman
- [ ] `ScoreResult` — yaku list, han/fu/points, limit-hand colour theming
- [ ] Dark theme + mobile layout pass
- [ ] Widen the test corpus from `puntuacion_matriz_tests.pl` (fu 20–110)
- [ ] Differential harness: WASM vs `swipl` CLI over a hand corpus

## Phase 2 — Match tracker (local only)

- [ ] Match state + pure `recordHand()` reducer (dealer repeat, honba, sticks,
      round advance, busting). Each recorded hand = one prospective `hands` row.
- [ ] Radial table UI, centre box, win/draw menus, timeline, manual controls
- [ ] Setup screen (players + guests, random seating, East/South, uma)
- [ ] End screen with placements and match naming
- [ ] IndexedDB mirror

## Phase 3 — Backend and sync

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
