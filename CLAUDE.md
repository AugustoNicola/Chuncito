# Chuncito

Web companion for Riichi Mahjong games among a group of friends: a live match
tracker, a hand scorer backed by an existing Prolog engine, and a persistent
match history with per-player stats. Mobile-first (used at the table), with a
cleaner desktop experience for review.

Read `docs/ROADMAP.md` first — it says what's done and what's next.

## Commands

All from `frontend/`:

| Command | What |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Contract + unit tests (vitest, Node swipl bundle) |
| `npm run test:browser` | Boots the app in the system Firefox and asserts a real score |
| `npm run build` | Typecheck + production build |

From the repo root:

| Command | What |
|---|---|
| `./scorer/sync-prolog.sh` | Re-vendor the Prolog; refuses if upstream tests fail |

## Layout

```
scorer/mahjonglog/     vendored Prolog (do NOT edit; changes belong upstream)
scorer/sync-prolog.sh  re-vendor with a test gate
frontend/src/scorer/   the contract layer: types, order, serialize, decode, validate
docs/                  contract, gaps, architecture, data model, roadmap
```

## Invariants

**The Prolog engine fails silently.** `resultadoDeVictoria/5` is semidet: a
non-winning hand, a yaku-less win, and *malformed input* are indistinguishable —
all three just fail. So:

- Always validate before querying (`validate.ts`). Never let a malformed query
  reach the engine and get reported to the user as "not a winning hand".
- Always sort meld tiles into canonical order (`order.ts`). An out-of-order meld
  fails rather than erroring.

**`s` is the South wind; `s1`–`s9` are souzu.** Check the honor set before
inferring a suit from the first character.

**Never edit `scorer/mahjonglog/`.** It is vendored. Upstream is
`/home/lambda/develop/Mahjonglog`, actively developed by the user. When something
in it is broken or missing: log it in `docs/SCORER_GAPS.md`, tell the user, and
keep building against the documented contract as if it worked.

**Node 18** — Vite is pinned to 5.x for this reason. Don't upgrade past it
without checking the runtime.

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess`.
- Names mirror the Prolog atoms exactly (`kanA`, `m5R`, `sinNombre`) so the two
  sides stay greppable. Spanish names from the engine are kept as-is rather than
  translated.
- Comments explain *why*, especially where behaviour is surprising (silent
  failure, canonical ordering, the `s` collision).

## Working across sessions

Roughly one phase per session; `/clear` between phases, `/compact` within one.
Update `docs/ROADMAP.md` before ending a session.
