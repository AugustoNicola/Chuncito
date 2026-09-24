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
| `npm run dev` | Vite dev server (`-- --host` to reach it from a phone on the LAN) |
| `npm test` | Contract + unit tests (vitest, Node swipl bundle) |
| `npm run test:browser` | Boots the app in the system Firefox and asserts a real score |
| `npm run build` | Typecheck + production build |
| `npm run measure:storage` | Simulates matches and sizes the database (see `DATA_MODEL.md`) |
| `npm run brand` | Redraws the favicons and link-preview image into `public/` (Firefox) |

From the repo root:

| Command | What |
|---|---|
| `./scorer/sync-prolog.sh` | Re-vendor the Prolog; refuses if upstream tests fail |
| `make backend-setup` | Python venv in `backend/.venv` |
| `make backend-dev` | API on `:8000` (Vite proxies `/api` to it); needs `CHUNCITO_PIN` |
| `make backend-test` | pytest against a throwaway schema on the Neon **dev** branch |
| `make db-backup` | `pg_dump` into `backups/` (needs `postgresql-client-18`) |
| `make db-migrate` | `alembic upgrade head`. Add `TARGET=main` for real data |
| `make db-check` | Is the target at the code's migration? (Heroku's release phase) |

## Layout

```
scorer/mahjonglog/           vendored Prolog (do NOT edit; changes belong upstream)
scorer/sync-prolog.sh        re-vendor with a test gate
frontend/src/App.tsx         the routes, and the match in progress they share
frontend/src/scorer/         contract layer: types, order, serialize, decode, validate,
                             dora, engine (+ .node / .browser factories)
frontend/src/features/hand/  hand input: handState (pure) + handTiles + nukidora + components
frontend/src/features/match/ match tracker: seats + scoring + matchState (pure),
                             rows (DB mapping), persistence, sync + syncClient
                             (saving to the server), and the table/menu/timeline
                             components
frontend/src/features/players/ the Players screen and the cached player list
frontend/src/features/history/ match list (filters live in the URL) and match review
frontend/src/ui/             Tile, theme.css
frontend/scripts/            browser-smoke.mjs, the real-browser end-to-end test
backend/app/                 FastAPI: settings (dev/main target), db, models (the
                             tables), schemas (the wire format = MatchRows), store
                             (save/load a whole match), auth (the PIN), main (routes)
backend/migrations/          Alembic; 0001 is the schema, 0002 adds matches.rules
backend/tests/               pytest on real Postgres; fixtures/ written by wire.test.ts
backend/scripts/             db_backup, check_migrations (the release phase)
docs/                        contract, gaps, architecture, data model, deploy, roadmap
package.json, requirements.txt, .python-version, Procfile
                             Heroku's build entry points only; see DEPLOY.md
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

**A back gesture never leaves the table.** `MatchScreen` blocks navigation
(`useBlocker`, which is why the router is a data router) except for its own
exits. A new screen reachable from inside a match must be one of those exits
or an in-match menu, never a plain link.

**Nothing reaches the match without a confirmation.** `ConfirmChange` shows the
*computed next state*, not a description of it, so the two can never disagree.
That works because every transition in `matchState.ts` is pure: compute, review,
then commit. Any new match-affecting action goes through it too.

**The player count is part of the ruleset.** `MatchConfig.players` is 3 for
sanma, and seats, rounds, tsumo payments, honba, noten and the hand scorer's
tile set all follow from it. Iterate `seatsIn(state)` / `seatsOf(players)`,
never four seats. Nukidora is added *after* the engine (`nukidora.ts`), since
the engine has no input for it.

**A hand has a list of winners.** Multiple ron is legal here, so `HandRow.wins`
is a collection and there is no `winnerSeat` column. A draw has none, a tsumo
one, a ron one to three.

**`rows.ts` is the only mapping to the database.** `toRows`/`fromRows` convert a
match to the tables in `DATA_MODEL.md` and back, and `rows.test.ts` proves the
round trip. The sync PUTs `toRows(state)` as it is, and the backend's
`schemas.py` mirrors `MatchRows` field for field; there is no second
serialisation. If a field is added to `MatchState`, the round-trip test is what
fails; if it is added to `rows.ts`, `wire.test.ts` fails until the backend
fixtures are regenerated (`UPDATE_FIXTURES=1 npm test -- wire`), and then the
backend tests fail until the server stores it. That chain is the point.

**The order of rows is part of the contract.** The server hands rows back in a
fixed order (winners by seat, yaku by `position`, adjustments as inserted), and
the backend tests require the round trip to be exact. So the reducer stores
lists whose order carries no meaning — a double ron's winners, tenpai seats —
in seat order.

**The dev branch unless told otherwise.** `.env` holds URLs for both Neon
branches; `backend/app/settings.py` uses `dev` unless `CHUNCITO_TARGET=main`.
Never run anything against `main` without the user asking; the tests refuse to.
Backups are deferred for now; once `main` holds real matches, `make db-backup`
before any migration on it.

**A push to `main` is a deploy.** Heroku builds every push to GitHub's `main`
(`docs/DEPLOY.md`). Commit freely; push only when the user asks. A change that
needs a migration needs `main` migrated (by hand, backup first) before the push,
or the release phase refuses it.

**Players are created on purpose, never as a side effect.** Only the Players
screen adds or renames one; setup chooses from the list or seats a guest, and
the server refuses a match seating a player it does not have. A typo at the
table must not be able to invent a person.

**The tracker never waits on the server.** Saves are queued (`sync.ts`) and
the table plays from local state; a missing, locked or failing server must
only ever show up in the status dot and the home-screen panel.

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
Update `docs/ROADMAP.md` before ending a session — its "Picking this up cold"
section is written for whoever starts the next one.

`npm run test:browser` is the check that catches what unit tests cannot: it
drives the real UI in the system Firefox. Run it before calling a change done,
and use `SHOT_DIR=/some/dir` to look at the result rather than assuming.

Ad-hoc Puppeteer probes are useful for looking at a screen the smoke test does
not reach, but they create Firefox profiles under `~/snap/firefox/common/`.
Delete them when finished; the committed smoke test already does.
