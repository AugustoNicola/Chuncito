"""
Sizes the database from generated matches.

Two numbers, because they answer different questions:

  MEASURED   the rows are inserted into a real SQLite database with the real
             schema and indexes, and the file is measured. Nothing is estimated;
             the cost of indexes, page overhead and text encoding is whatever it
             actually is.

  MODELLED   the same rows costed against PostgreSQL's documented per-row and
             per-index overheads. Postgres carries a 23-byte tuple header, a
             4-byte line pointer and column alignment that SQLite does not, so
             the same data occupies noticeably more. This is the number that
             matters if Phase 3 lands on Neon.

Reads the simulator's JSON on stdin.

    npx vite-node scripts/storage-sim.ts 500 typical | python3 scripts/storage-measure.py
"""
import json
import math
import os
import sqlite3
import sys
import tempfile

SCHEMA = """
CREATE TABLE players (
  id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  avatar TEXT, created_at TEXT NOT NULL);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY, name TEXT, length TEXT NOT NULL, starting_points INTEGER NOT NULL,
  uma_json TEXT NOT NULL, return_score INTEGER NOT NULL, status TEXT NOT NULL,
  end_reason TEXT, started_at TEXT NOT NULL, ended_at TEXT,
  max_level TEXT, is_test INTEGER NOT NULL);

CREATE TABLE match_players (
  match_id INTEGER NOT NULL, seat INTEGER NOT NULL, player_id INTEGER, guest_name TEXT,
  final_score INTEGER, placement INTEGER, uma_points INTEGER,
  PRIMARY KEY (match_id, seat));

CREATE TABLE hands (
  id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, seq INTEGER NOT NULL,
  round_wind TEXT NOT NULL, round_number INTEGER NOT NULL, honba INTEGER NOT NULL,
  riichi_pot_before INTEGER NOT NULL, outcome TEXT NOT NULL, abortive_reason TEXT,
  deal_in_seat INTEGER, score_delta TEXT NOT NULL, client_uuid TEXT NOT NULL UNIQUE);
CREATE UNIQUE INDEX hands_match_seq ON hands (match_id, seq);

CREATE TABLE hand_wins (
  hand_id INTEGER NOT NULL, winner_seat INTEGER NOT NULL, han INTEGER, fu INTEGER,
  level TEXT, base_points INTEGER, points_won INTEGER, is_manual INTEGER NOT NULL,
  winner_open INTEGER, hand_tiles TEXT, situation_flags TEXT,
  PRIMARY KEY (hand_id, winner_seat));
CREATE INDEX hand_wins_level ON hand_wins (level, base_points);

CREATE TABLE hand_riichi (hand_id INTEGER NOT NULL, seat INTEGER NOT NULL,
  PRIMARY KEY (hand_id, seat));
CREATE TABLE hand_tenpai (hand_id INTEGER NOT NULL, seat INTEGER NOT NULL,
  PRIMARY KEY (hand_id, seat));

CREATE TABLE hand_yakus (
  hand_id INTEGER NOT NULL, winner_seat INTEGER NOT NULL, yaku TEXT NOT NULL,
  han INTEGER NOT NULL, PRIMARY KEY (hand_id, winner_seat, yaku));
CREATE INDEX hand_yakus_yaku ON hand_yakus (yaku);

CREATE TABLE adjustments (
  id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, after_seq INTEGER NOT NULL,
  seat INTEGER NOT NULL, delta INTEGER NOT NULL, note TEXT);
"""


def load(db, matches):
    """Inserts every match, returning the row counts by table."""
    counts = {}
    bump = lambda t, n=1: counts.__setitem__(t, counts.get(t, 0) + n)

    for m in matches:
        cur = db.execute(
            "INSERT INTO matches (name, length, starting_points, uma_json, return_score,"
            " status, end_reason, started_at, ended_at, max_level, is_test)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [m["match"][k] for k in ("name", "length", "starting_points", "uma_json",
                                     "return_score", "status", "end_reason", "started_at",
                                     "ended_at", "max_level", "is_test")])
        match_id = cur.lastrowid
        bump("matches")

        for p in m["match_players"]:
            db.execute(
                "INSERT INTO match_players VALUES (?,?,?,?,?,?,?)",
                [match_id, p["seat"], p["player_id"], p["guest_name"],
                 p["final_score"], p["placement"], p["uma_points"]])
            bump("match_players")

        for h in m["hands"]:
            cur = db.execute(
                "INSERT INTO hands (match_id, seq, round_wind, round_number, honba,"
                " riichi_pot_before, outcome, abortive_reason, deal_in_seat,"
                " score_delta, client_uuid) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [match_id, h["seq"], h["round_wind"], h["round_number"], h["honba"],
                 h["riichi_pot_before"], h["outcome"], h["abortive_reason"],
                 h["deal_in_seat"], h["score_delta"], h["client_uuid"]])
            hand_id = cur.lastrowid
            bump("hands")

            for w in h["wins"]:
                db.execute(
                    "INSERT INTO hand_wins VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    [hand_id, w["winner_seat"], w["han"], w["fu"], w["level"],
                     w["base_points"], w["points_won"], w["is_manual"],
                     w["winner_open"], w["hand_tiles"], w["situation_flags"]])
                bump("hand_wins")
                for y in w["yakus"]:
                    db.execute("INSERT INTO hand_yakus VALUES (?,?,?,?)",
                               [hand_id, w["winner_seat"], y["yaku"], y["han"]])
                    bump("hand_yakus")

            for seat in h["riichi"]:
                db.execute("INSERT INTO hand_riichi VALUES (?,?)", [hand_id, seat])
                bump("hand_riichi")
            for seat in h["tenpai"]:
                db.execute("INSERT INTO hand_tenpai VALUES (?,?)", [hand_id, seat])
                bump("hand_tenpai")

        for a in m["adjustments"]:
            db.execute(
                "INSERT INTO adjustments (match_id, after_seq, seat, delta, note)"
                " VALUES (?,?,?,?,?)",
                [match_id, a["after_seq"], a["seat"], a["delta"], a["note"]])
            bump("adjustments")

    db.commit()
    return counts


def measure_sqlite(matches):
    path = os.path.join(tempfile.mkdtemp(), "sim.db")
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    counts = load(db, matches)
    db.execute("VACUUM")
    db.close()
    return os.path.getsize(path), counts


# --- the Postgres model ---
#
# Per heap tuple: 23-byte header, rounded up to an 8-byte boundary, plus a
# 4-byte line pointer in the page. Per btree index entry: the key, an 8-byte
# index tuple header, and a 4-byte line pointer, with pages filled to 90% by
# default on an index built in order.
PG_TUPLE_OVERHEAD = 24 + 4
PG_INDEX_OVERHEAD = 12
PG_INDEX_FILL = 0.9
# Pages are 8 KiB with a 24-byte header and a bit of free-space slack.
PG_PAGE_EFFICIENCY = 0.94


def pg_text(s):
    """varchar/text: 1-byte length header under 127 bytes, else 4."""
    if s is None:
        return 0
    n = len(s.encode())
    return n + (1 if n < 127 else 4)


def pg_size(matches):
    """Bytes the same rows would occupy in PostgreSQL, per table, heap and index."""
    by_table = {}

    def row(table, fixed, texts, keys):
        heap = PG_TUPLE_OVERHEAD + fixed + sum(pg_text(t) for t in texts)
        index = sum((PG_INDEX_OVERHEAD + k) / PG_INDEX_FILL for k in keys)
        h, i = by_table.get(table, (0, 0))
        by_table[table] = (h + heap, i + index)

    for m in matches:
        mm = m["match"]
        # id, starting_points, is_test + timestamps (8 each)
        row("matches", 4 + 4 + 4 + 1 + 8 + 8,
            [mm["name"], mm["length"], mm["uma_json"], mm["status"], mm["end_reason"],
             mm["max_level"]],
            [4])                                   # PK
        for p in m["match_players"]:
            row("match_players", 4 + 2 + 4 + 4 + 2 + 2, [p["guest_name"]], [6])
        for h in m["hands"]:
            row("hands", 4 + 4 + 4 + 2 + 2 + 2 + 2,
                [h["round_wind"], h["outcome"], h["abortive_reason"],
                 h["score_delta"], h["client_uuid"]],
                [4, 8, 20])                        # PK, (match_id,seq), client_uuid
            for w in h["wins"]:
                row("hand_wins", 4 + 2 + 2 + 2 + 4 + 4 + 1 + 1,
                    [w["level"], w["hand_tiles"], w["situation_flags"]],
                    [6, 12])                       # PK, (level, base_points)
                for y in w["yakus"]:
                    row("hand_yakus", 4 + 2 + 2, [y["yaku"]],
                        [6 + len(y["yaku"]), len(y["yaku"]) + 4])
            for _ in h["riichi"]:
                row("hand_riichi", 4 + 2, [], [6])
            for _ in h["tenpai"]:
                row("hand_tenpai", 4 + 2, [], [6])
        for a in m["adjustments"]:
            row("adjustments", 4 + 4 + 4 + 2 + 4, [a["note"]], [4])

    return {t: (h / PG_PAGE_EFFICIENCY, i / PG_PAGE_EFFICIENCY)
            for t, (h, i) in by_table.items()}


def percentile(values, p):
    xs = sorted(values)
    return xs[min(len(xs) - 1, int(math.ceil(p / 100 * len(xs)) - 1))]


def main():
    data = json.load(sys.stdin)
    matches = data["matches"]
    n = len(matches)

    sqlite_bytes, counts = measure_sqlite(matches)
    pg_tables = pg_size(matches)
    pg_bytes = sum(h + i for h, i in pg_tables.values())

    hands = [len(m["hands"]) for m in matches]
    wins = [sum(len(h["wins"]) for h in m["hands"]) for m in matches]
    yakus = [sum(len(w["yakus"]) for h in m["hands"] for w in h["wins"]) for m in matches]
    tiles = [w["hand_tiles"] for m in matches for h in m["hands"]
             for w in h["wins"] if w["hand_tiles"]]

    # Per-match cost is measured against a second, doubled load, so the schema's
    # own fixed cost is not charged to the matches. The copy needs fresh
    # client_uuids, which are unique by design.
    copy = json.loads(json.dumps(matches))
    for m in copy:
        for h in m["hands"]:
            h["client_uuid"] = "b" + h["client_uuid"][1:]
    doubled_bytes, _ = measure_sqlite(matches + copy)
    marginal = (doubled_bytes - sqlite_bytes) / n

    print(f"scenario: {data['scenario']}   matches: {n}")
    print()
    print("  hands per match      "
          f"avg {sum(hands)/n:5.1f}   p95 {percentile(hands, 95):3d}   max {max(hands):3d}")
    print("  winning hands        "
          f"avg {sum(wins)/n:5.1f}   p95 {percentile(wins, 95):3d}   max {max(wins):3d}")
    print("  yaku rows            "
          f"avg {sum(yakus)/n:5.1f}   p95 {percentile(yakus, 95):3d}   max {max(yakus):3d}")
    if tiles:
        lens = [len(t) for t in tiles]
        print("  hand_tiles chars     "
              f"avg {sum(lens)/len(lens):5.1f}   p95 {percentile(lens, 95):3d}   max {max(lens):3d}")
    print()
    print("  rows written:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    print()

    per_match_sqlite = sqlite_bytes / n
    per_match_pg = pg_bytes / n
    per_hand_pg = pg_bytes / sum(hands)

    print("  modelled Postgres bytes per match, by table:")
    print(f"    {'table':<16}{'heap':>9}{'indexes':>10}{'total':>9}   share")
    for table, (heap, index) in sorted(
            pg_tables.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
        total = heap + index
        print(f"    {table:<16}{heap/n:8.0f}B{index/n:9.0f}B{total/n:8.0f}B"
              f"   {100*total/pg_bytes:4.1f}%")
    print()

    print(f"  MEASURED (SQLite)    {sqlite_bytes/1024:8.1f} KiB total"
          f"   {per_match_sqlite/1024:6.2f} KiB per match")
    print(f"    marginal, doubled  {marginal/1024:6.2f} KiB per match"
          "   (schema overhead excluded)")
    print(f"  MODELLED (Postgres)  {pg_bytes/1024:8.1f} KiB total"
          f"   {per_match_pg/1024:6.2f} KiB per match"
          f"   {per_hand_pg:6.0f} B per hand")
    print()
    for label, per in (("SQLite", per_match_sqlite), ("Postgres", per_match_pg)):
        fits = int(5 * 1024 * 1024 / per)
        print(f"  5 MB holds {fits:>6,} matches  ({label})"
              f"   ~{fits * sum(hands) / n:,.0f} hands")


if __name__ == "__main__":
    main()
