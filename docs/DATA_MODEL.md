# Data model

Not yet implemented — Phases 1 and 2 touch no database. Recorded here because
Phase 2's reducer must emit rows of exactly this shape, so Phase 3 is wiring
rather than redesign.

As of Phase 2 it does: `HandRow` in `frontend/src/features/match/matchState.ts`
is this `hands` row, with `riichiSeats` / `tenpaiSeats` / `yakus` as the child
tables. The vendor is still undecided; nothing here is engine-specific.

See `ARCHITECTURE.md` for why there is no event log.

```
players(id, display_name, slug UNIQUE, avatar, created_at)

matches(id, name, length ENUM(east,south), starting_points, uma_json,
        status ENUM(in_progress,finished,abandoned), started_at, ended_at,
        max_level,        -- denormalised: best limit hand in the match
        is_test)          -- dev rows, hidden from the UI by default

match_players(match_id, seat 0..3, player_id NULL, guest_name NULL,
              final_score, placement, uma_points)
              PK(match_id, seat)        -- player_id NULL => named guest

hands(id, match_id, seq, round_wind, round_number, honba, riichi_pot_before,
      outcome ENUM(tsumo,ron,exhaustive_draw,abortive_draw,nagashi_mangan,chombo),
      abortive_reason NULL,             -- nine_terminals, four_riichi, ...
      deal_in_seat NULL,
      score_delta,                      -- "+8000,-8000,0,0" across seats
      client_uuid UNIQUE)               -- sync idempotency key
      UNIQUE(match_id, seq)

hand_wins(hand_id, winner_seat,         -- one row per winner; see below
          han NULL, fu NULL, level NULL,
          base_points NULL,             -- before the dealer/ron multiplier
          points_won NULL,              -- what this winner collected
          is_manual, winner_open NULL, hand_tiles NULL)
          PK(hand_id, winner_seat)

hand_riichi(hand_id, seat)      PK(hand_id, seat)
hand_tenpai(hand_id, seat)      PK(hand_id, seat)   -- exhaustive draws
hand_yakus(hand_id, winner_seat, yaku, han)  PK(hand_id, winner_seat, yaku)
adjustments(id, match_id, after_seq, seat, delta, note)
```

Notes:

- `hands` **is** the timeline. Match review is `WHERE match_id ORDER BY seq`.
- `score_delta` per hand makes running scores a prefix sum — nothing recomputes
  from scratch, and undo is deleting the last row.
- `level` is an ordinal so "mangan or better" is an index range scan.
- `hand_tiles` is compact text, kept so history can be re-scored after an engine
  fix. NULL when han/fu were typed in. It is a concatenation of tile atoms and
  needs a **longest-match** parse, since atoms vary in length and share prefixes:
  `m5R` before `m5`, `wh` before `w`. Melds must be recorded too, not just the
  concealed tiles — an open hand scores differently, and the engine cannot infer
  a call from loose tiles. Something like
  `"m2m2m3m4m5p3p4p5|chii:s3s4s5R"` rather than a bare tile run.
- `hand_yakus` is what makes "filter by yaku achieved" a join instead of a scan.
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

Per hanchan: match ~120 B, four `match_players` ~160 B, ~12 `hands` ~1.3 KB,
riichi/tenpai/yaku rows ~800 B — roughly **2.5 KB raw, 6–10 KB with index
overhead**. So even a 5 MB tier holds 500–800 matches. Vendor choice is therefore
about **backup retention and durability**, not capacity. See the plan's storage
table; Neon is the recommendation.
