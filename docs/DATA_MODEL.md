# Data model

Not yet implemented — Phases 1 and 2 touch no database. Recorded here because
Phase 2's reducer must emit rows of exactly this shape, so Phase 3 is wiring
rather than redesign.

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
      winner_seat NULL, deal_in_seat NULL,
      han NULL, fu NULL, level NULL, base_points NULL,
      is_manual, winner_open, hand_tiles NULL,
      score_delta,                      -- "+8000,-8000,0,0" across seats
      client_uuid UNIQUE)               -- sync idempotency key
      UNIQUE(match_id, seq)

hand_riichi(hand_id, seat)      PK(hand_id, seat)
hand_tenpai(hand_id, seat)      PK(hand_id, seat)   -- exhaustive draws
hand_yakus(hand_id, yaku, han)  PK(hand_id, yaku)
adjustments(id, match_id, after_seq, seat, delta, note)
```

Notes:

- `hands` **is** the timeline. Match review is `WHERE match_id ORDER BY seq`.
- `score_delta` per hand makes running scores a prefix sum — nothing recomputes
  from scratch, and undo is deleting the last row.
- `level` is an ordinal so "mangan or better" is an index range scan.
- `hand_tiles` is compact text (`"m2m2m3m4m5p3p4p5s3s4s5m6m7m8"`, ~40 B), kept so
  history can be re-scored after an engine fix. NULL when han/fu were typed in.
- `hand_yakus` is what makes "filter by yaku achieved" a join instead of a scan.

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
