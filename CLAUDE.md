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
scorer/mahjonglog/           vendored Prolog (do NOT edit; changes belong upstream)
scorer/sync-prolog.sh        re-vendor with a test gate
frontend/src/App.tsx         which screen is showing; no router yet
frontend/src/scorer/         contract layer: types, order, serialize, decode, validate,
                             dora, engine (+ .node / .browser factories)
frontend/src/features/hand/  hand input: handState (pure) + handTiles + components
frontend/src/features/match/ match tracker: seats + scoring + matchState (pure),
                             persistence, and the table/menu/timeline components
frontend/src/ui/             Tile, theme.css
frontend/scripts/            browser-smoke.mjs, the real-browser end-to-end test
docs/                        contract, gaps, architecture, data model, roadmap
```

The two pure cores — `handState.ts` and `matchState.ts` (+ `seats.ts`,
`scoring.ts`) — are deliberately free of React. In both the awkward parts are
rules, not rendering: which keys are legal in which mode and when a call would
illegally complete the hand; dealer repeats, honba, sticks carrying across a
draw, sudden death, busting. All of it is directly testable and all of it is
tested.

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

**Never ask twice for a fact the match already holds.** The tracker passes the
round wind, the seat wind and the win mode into `HandBuilder` and hides their
selectors. The seat wind is what tells the engine the winner is dealer, so a
stray tap on a duplicate picker would mis-score the hand *silently* — the engine
would happily return a valid-looking non-dealer payment. Same reasoning as
validating before querying.

**Nothing reaches the match without a confirmation.** `ConfirmChange` shows the
*computed next state*, not a description of it, so the two can never disagree.
That works because every transition in `matchState.ts` is pure: compute, review,
then commit. Any new match-affecting action goes through it too.

**A hand has a list of winners.** Multiple ron is legal here, so `HandRow.wins`
is a collection and there is no `winnerSeat` column. A draw has none, a tsumo
one, a ron one to three.

**A hand row carries the round state it was played under.** That is what makes
undo exact without an event log; see `docs/ARCHITECTURE.md`. Riichi sticks move
live *and* appear in the row's `scoreDelta`, so anything applying a delta must
subtract the part already applied.

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess`.
- Names mirror the Prolog atoms exactly (`kanA`, `m5R`, `sinNombre`) so the two
  sides stay greppable. Spanish names from the engine are kept as-is rather than
  translated.
- Comments explain *why*, especially where behaviour is surprising (silent
  failure, canonical ordering, the `s` collision).
- Missing CSS fails silently, so `src/ui/styles.test.ts` fails the build when a
  component references a class `theme.css` does not define. Three regressions
  got through before it existed; don't delete it.

## Working across sessions

Roughly one phase per session; `/clear` between phases, `/compact` within one.
Update `docs/ROADMAP.md` before ending a session.
