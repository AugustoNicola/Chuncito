# Architecture

## Shape

```
React PWA (phone at the table)
  ├─ swipl-wasm + vendored .pl  ──>  resultado(...)      [scoring, on-device]
  ├─ match state + IndexedDB mirror                      [crash safety]
  └─ retrying write queue, one POST per completed hand
          │  idempotent on client_uuid
          ▼
FastAPI on Heroku  ──>  SQL                              [Phase 3+]
```

## Why the scorer runs in the browser

The scorer is a **pure function** (no assert/retract, side-effect free), so it can
run anywhere. Running it on the phone means:

- Scoring never needs a connection, which matters because tile-input scoring is
  the main reason the engine exists.
- **Heroku never needs SWI-Prolog.** There is no SWI buildpack, so the
  alternative would have forced container deploys.
- Queries are ~1 ms, so no server round-trip beats it anyway.

Cost: 4.1 MB of wasm assets (2.28 MB wasm + 1.66 MB data + 194 KB js), fetched
once and cached. Measured 146 ms cold boot in Firefox including that fetch.

Inputs *and* outputs are stored, so history can be re-scored if the engine is
later fixed or extended.

### It runs on the main thread, not in a Worker

The plan called for a Web Worker. Measured, a query takes **~1 ms**, so there is
nothing to move off the main thread — and swipl-wasm ships a UMD bundle that
expects either a script tag or `importScripts`, which fights Vite's module
workers. The bundle is loaded with a script tag and queried inline.

Revisit only if something starts scoring in bulk (re-scoring stored history, say),
where the cost would actually accumulate.

## Why there is no event log

An earlier draft made the server store an append-only event log. That conflated
two unrelated concerns:

- **The timeline is just the list of hands.** A riichi match *is* an ordered
  sequence of hands, each with one outcome. Match review is
  `SELECT ... ORDER BY seq`, not a fold over events.
- **Crash safety is a client concern.** The phone keeping a local mirror says
  nothing about how the server should store anything.

So the server holds a plain relational domain model. Undo is "delete the last
hand row and recompute" rather than a compensating event. Each hand carries its
own `score_delta`, so running scores are a prefix sum.

This also shrank storage by roughly 4x — the event payloads were the bulk.

## How undo works without an event log

`recordHand()` returns the new state *and* the row. Each row carries the round
state it was **played under** — `roundWind`, `roundNumber`, `honba`,
`riichiPotBefore`, `riichiSeats` — not just its outcome.

That is what makes undo exact and cheap: dropping the last row restores the
table from the row itself. No compensating event, no replay of the whole match,
and no separate "state before" snapshot to keep in step.

The riichi sticks are the part that makes this non-obvious. A declaration moves
1000 points the moment it happens, because that is what happens at the table —
long before anyone knows how the hand ends. So the deduction is applied twice
over in two different senses:

- **Live**, by `toggleRiichi`, so the score on screen is right during the hand.
- **In the row's `scoreDelta`**, so that replaying the deltas from the starting
  score reproduces the table exactly — which is what Phase 3's server will do.

`recordHand` therefore subtracts the already-applied part before updating the
live scores, and `undoLastHand` adds it back while returning the seats to
`pendingRiichi`. A match's deltas do **not** sum to zero per hand: collecting a
stick carried from an earlier hand is found money. They sum to zero over the
match.

## Offline posture

Crash-safe and blip-tolerant, **not** full offline-first. The match is saved to
the server as each hand is recorded, so the server holds it up to the last
completed hand (which gives resume-on-another-device for free). IndexedDB covers
the gap between a dropped connection and the next successful flush.

**A save is the whole match** (`PUT /api/matches/{id}` with `toRows(state)`),
not the new hand. The server swaps its copy in one transaction. That turns undo,
corrections, renames and end-of-match placements into ordinary saves rather
than four more endpoints, for a few KB per request. Saves coalesce — ten hands
recorded offline go up as one request — and each names the revision it was
based on, so a phone that was offline while the match moved on elsewhere gets a
409 instead of overwriting newer hands. See `frontend/src/features/match/sync.ts`
and `backend/app/store.py`.

The tracker never waits on the server. It plays from its own state and the
IndexedDB mirror; a server that is down, locked or refusing shows up only as a
status dot and a note on the home screen.

## Vendoring

`scorer/mahjonglog/` is a copy, refreshed by `scorer/sync-prolog.sh`, which
records the upstream commit and **refuses to vendor a tree whose own tests fail**.
Not a submodule: upstream is actively developed with a dirty tree and untracked
files, so there is often no commit to pin to.

The `.pl` files are imported directly from there by `prologSource.ts` (Vite
`?raw`), so the repo holds exactly one copy.

## Tile artwork

`frontend/public/tiles/` holds [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles),
CC0 1.0 (public domain, no attribution required — `LICENSE.md` is kept alongside).
Files are renamed to the engine's atom names (`Man5-Dora` → `m5R`, `Ton` → `e`,
`Haku` → `wh`, …) so a tile's atom *is* its asset path, and run through svgo
(868 KB → 404 KB).

The artwork is layered rather than pre-composited: `front.svg` is the tile face
and the glyphs are transparent overlays, so the face can be tinted or swapped for
theming without touching 37 files. `back.svg` renders the face-down outer tiles
of a concealed kan.
