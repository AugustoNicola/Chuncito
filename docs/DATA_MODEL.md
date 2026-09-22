# Data model

Not yet implemented — Phases 1 and 2 touch no database. Recorded here because
Phase 2's reducer must emit rows of exactly this shape, so Phase 3 is wiring
rather than redesign.

As of Phase 2 it does: `HandRow` in `frontend/src/features/match/matchState.ts`
is this `hands` row, with `riichiSeats` / `tenpaiSeats` / `yakus` as the child
tables. As of Phase 3 it is built: Neon Postgres 18, the tables defined in
`backend/app/models.py` and created by migration `0001`. The shorthand below is
the design; where the implementation departs from it, it says so under
**Implementation** at the end of this section.

See `ARCHITECTURE.md` for why there is no event log.

```
players(id, display_name, slug UNIQUE, avatar, created_at)

matches(id, name, players ENUM(3,4), red_fives BOOL,
        length ENUM(east,south), starting_points, uma_json,
        return_score,     -- the sudden-death threshold this match was played to
        status ENUM(in_progress,finished,abandoned),
        end_reason ENUM(final_round,bust,manual) NULL,
        started_at, ended_at,
        max_level,        -- denormalised: best limit hand in the match
        is_test)          -- dev rows, hidden from the UI by default

match_players(match_id, seat 0..players-1, player_id NULL, guest_name NULL,
              final_score, placement, uma_points)
              PK(match_id, seat)        -- player_id NULL => named guest

hands(id, match_id, seq, round_wind, round_number, honba, riichi_pot_before,
      outcome ENUM(tsumo,ron,exhaustive_draw,abortive_draw,nagashi_mangan,chombo),
      abortive_reason NULL,             -- nine_terminals, four_riichi, ...
      deal_in_seat NULL,
      score_delta,                      -- "+8000,-8000,0,0" across seats (3 in sanma)
      client_uuid UNIQUE)               -- sync idempotency key
      UNIQUE(match_id, seq)

hand_wins(hand_id, winner_seat,         -- one row per winner; see below
          han NULL, fu NULL, level NULL,
          base_points NULL,             -- before the dealer/ron multiplier
          points_won NULL,              -- what this winner collected
          is_manual, winner_open NULL, hand_tiles NULL,
          situation_flags NULL)         -- "riichi,ippatsu"; see below
          PK(hand_id, winner_seat)

hand_riichi(hand_id, seat)      PK(hand_id, seat)
hand_tenpai(hand_id, seat)      PK(hand_id, seat)   -- exhaustive draws
hand_yakus(hand_id, winner_seat, yaku, han)  PK(hand_id, winner_seat, yaku)
adjustments(id, match_id, after_seq, seat, delta, note)
```

**Implementation** (`backend/app/models.py`), where it differs from the above:

- Enums are `text` with `CHECK` constraints rather than Postgres `ENUM`s, which
  cannot gain a value inside a transaction.
- `score_delta` is `integer[]`; the API still speaks the comma string.
- `level` and `max_level` keep the engine's atom as text, with a generated
  `level_rank` / `max_level_rank` smallint beside them for range filters
  (`sinNombre` 0 … `kazoeYakuman` 5, `yakuman` 6, `dobleYakuman` 7,
  `tripleYakuman` 8, anything else 6).
- `hand_yakus.position` keeps the engine's yaku order, which the display uses.
- `adjustments.client_uuid` (unique), mirroring `hands`.
- `matches.revision`, `content_hash`, `updated_at`: sync bookkeeping, not match
  data. See `backend/app/store.py`.
- Ids (`matches.id`, `client_uuid`s, `players.id`) are text: they are made on
  the phone.
- `players.slug` is unique and is the test of sameness: "Ana", "ana" and "Aná"
  are one player, and a second one by that name is refused. Players are only
  created and renamed through `/api/players`; a match save never creates one,
  and refuses a seat naming a player the server does not have. Guests
  (`player_id` NULL, `guest_name` set) are seated on purpose at setup.

Notes:

- `hands` **is** the timeline. Match review is `WHERE match_id ORDER BY seq`.
- `score_delta` per hand makes running scores a prefix sum — nothing recomputes
  from scratch, and undo is deleting the last row.
- `level` is an ordinal so "mangan or better" is an index range scan.
- `hand_tiles` **and `situation_flags` together** are what make a hand
  re-scorable. The tiles alone are not enough: nothing in them says the win was
  on the last discard, off a kan replacement, or one turn after a riichi, and a
  re-score without the flags would come back missing yaku. Both are NULL for a
  typed-in value, which never had a situation to record — distinct from a scored
  hand that happened to have no flags, which stores an empty string.
- `hand_tiles` is compact text, kept so history can be re-scored after an engine
  fix. NULL when han/fu were typed in. It is a concatenation of tile atoms and
  needs a **longest-match** parse, since atoms vary in length and share prefixes:
  `m5R` before `m5`, `wh` before `w`. Melds must be recorded too, not just the
  concealed tiles — an open hand scores differently, and the engine cannot infer
  a call from loose tiles. Something like
  `"m2m2m3m4m5p3p4p5|chii:s3s4s5R"` rather than a bare tile run.
- `hand_yakus` is what makes "filter by yaku achieved" a join instead of a scan.
- **`players` is the ruleset, not just a head count.** A sanma match (3) has
  three `match_players` rows and three-entry `score_delta`s, and scores
  differently: tsumo loss, honba at 1000, the noten 3000 split three ways, and
  kita. It is a column rather than a count of `match_players` so history can
  filter on it and so nothing has to infer the rules. `hand_tiles` carries a
  sanma hand's pulled Norths as a `kita:nn` section; whether 1m indicated 9m
  follows from `players`. `hand_yakus` gets a `nukiDora` row for the kita han,
  which is client-generated but otherwise a dora like the others.
- `base_points` and `points_won` are both kept because they answer different
  questions. `base_points` compares hands ("whose best hand was bigger"), and is
  independent of who was dealing and of honba. `points_won` is what changed
  hands, which is what the timeline shows. For an engine-scored hand the base is
  recovered from the level first (`baseFromResult`), because `dobleYakuman` is
  26 han and the han formula would flatten it back to one yakuman.
- `winner_open` is NULL, not false, on a hand nobody won — it feeds the
  win-method pie, where "no winner" is not "closed".
- `chombo` stays in the enum but Phase 2 does **not** produce it: the group
  handles a chombo as an `adjustments` row with a note. See `ROADMAP.md`.
- **A hand has a *list* of winners, not a winner.** This ruleset pays every
  player who wins on a discard rather than treating two or three ron as an
  abortive draw, so `hand_wins` is a child table. A draw has none, a tsumo or
  nagashi has one, a ron has one to three. `hand_yakus` hangs off the winner as
  well, since each winner has their own hand. Phase 4's "filter by yaku" and
  "best hand" both join through `hand_wins`, which they would have had to do
  anyway.
- The riichi pot is split between multiple winners and the honba is paid once,
  both settled by turn order from the discarder — but that is already baked into
  `score_delta`, so nothing downstream has to know the rule.

## Required queries

| Requirement | Query |
|---|---|
| Match review timeline | `hands WHERE match_id ORDER BY seq` |
| Filter: hand ≥ mangan | `matches.max_level >= X` |
| Filter: yaku achieved | join `hand_yakus` |
| Placement pie, average rank | `match_players` |
| Tsumo rate | wins with `outcome='tsumo'` / wins |
| Deal-in rate | `hands.deal_in_seat = me` / hands played |
| Riichi rate | `hand_riichi` / hands played |
| Win-method pie | `hand_riichi` + `hands.winner_open` |
| Best hand | `MAX(level, base_points)` over the player's wins |
| Yaku frequency | `GROUP BY hand_yakus.yaku` |

## Size

**Measured**, not estimated — `npm run measure:storage` in `frontend/`. The
matches come out of the real reducer, so hands per match follow the actual rules
(dealer repeats, draws, sudden death) rather than an assumption; the contents of
a hand are synthesised, since only field *lengths* matter here and running the
engine a hundred thousand times would not change them. Rows are then loaded into
a real SQLite database with this schema and its indexes and the file is measured.
Postgres is modelled on top of that, because its 23-byte tuple header, 4-byte
line pointer and column alignment cost roughly 1.7x what SQLite does.

Two scenarios, 1000 matches each:

| | hands/match | SQLite (measured) | Postgres (modelled) | 5 MB holds |
|---|---|---|---|---|
| **typical** — 55% of wins entered as tiles, 20% riichi rate | 10.9 avg, 17 max | 3.9 KB | **6.5 KB** | ~785 matches |
| **heavy** — every win as tiles, 4 melds, 5 indicators, 6–11 yaku, 45% riichi | 10.6 avg, 15 max | 9.3 KB | **15.9 KB** | ~320 matches |

About 615 B per hand typical, 1.5 KB per hand heavy.

Where it goes, per match, modelled for Postgres:

| table | typical | heavy |
|---|---|---|
| `hand_yakus` | 2.1 KB (31%) | **10.3 KB (63%)** |
| `hands` | 2.1 KB (32%) | 2.1 KB (13%) |
| `hand_wins` | 1.3 KB (19%) | 1.9 KB (12%) |
| everything else | 1.0 KB | 1.6 KB |

Round-tripping is tested, not assumed: `rows.ts` maps a match onto these tables
and back, and `rows.test.ts` plays a match containing one of every outcome —
including a double ron, a nagashi and a manual correction — then rebuilds it from
nothing but the rows and compares. Writing that test is what turned up
`return_score`, `end_reason` and `situation_flags` missing.

Deliberately **not** stored, both accounted for:

- `pendingRiichi` — sticks declared for a hand that has not resolved. The server
  holds the match to the last *completed* hand by design (`ARCHITECTURE.md`), so
  a resume replays the hand in progress.
- The live round, honba, pot and scores — all derivable. Scores are a prefix sum
  of `score_delta` plus adjustments; the round marker follows from the last
  hand's own row and its outcome. Storing them would be a second source of truth
  that could drift from the hands.

Two things worth knowing from this:

- **`hand_tiles` is not the problem.** It is the one variable-length field and
  the obvious suspect, but a stored hand runs 45 chars typical, 96 at the heavy
  p95, and `hand_wins` — tiles, flags and all — is only 12–19% of the total.
  Keeping history re-scorable is close to free.
- **`hand_yakus` dominates, and more than half of it is index.** Every yaku is a
  row carrying the 28-byte Postgres tuple overhead plus two index entries, for a
  payload of about 20 bytes. If storage ever became tight, the lever is that
  table's indexing — not the tiles, and not dropping history.

So the vendor question stays about **backup retention and durability**, not
capacity. A group playing weekly gets a few hundred matches a year; 5 MB is
several years even on the heavy figures, and the typical case is closer to a
decade. Neon's free plan allows 0.5 GB, a hundred times that.
