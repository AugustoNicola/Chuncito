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

## Offline posture

Crash-safe and blip-tolerant, **not** full offline-first. A hand is POSTed as it
is recorded, so the server always holds the match up to the last completed hand
(which gives resume-on-another-device for free). IndexedDB covers only the gap
between a dropped connection and the next successful flush.

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
