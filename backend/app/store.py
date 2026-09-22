"""
Whole matches in and out of the tables.

**A save replaces the match.** The phone sends everything `toRows` produces and
the server swaps the match's rows for those, in one transaction. That is
simpler than a hand-by-hand protocol, and it covers what a hand-by-hand one
would need special cases for: undo drops the last hand, a correction adds an
adjustment, the end screen names the match and fills in placements. A match is
a few KB, so resending it whole costs nothing that matters.

Two things keep that safe:

- **A retried save is recognised,** by a hash of its content. The phone retries
  whenever it did not hear back, including when the first attempt actually
  landed; that must not count as a second write.
- **A stale save is refused** (`StaleWrite`). Every accepted write bumps the
  match's `revision`, and a save must say which revision it was based on. A
  phone that went offline while the match carried on elsewhere would otherwise
  overwrite the newer hands when it reconnected.
"""
import hashlib
import json
import re
import unicodedata
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import Connection, delete, exists, func, insert, or_, select

from . import models as m
from .schemas import (
    BestHand, MatchRows, MatchSummary, PlacedMatch, Player, PlayerOut, PlayerStats, WinMethods,
    WinValue, YakuCount,
)


class StaleWrite(Exception):
    def __init__(self, revision: int):
        super().__init__(f'the server holds revision {revision}')
        self.revision = revision


class DuplicateId(Exception):
    """A hand or adjustment id already belongs to a different match."""


class UnknownPlayer(Exception):
    """A seat names a player the server has never heard of."""


def slugify(name: str) -> str:
    """"José Luis" -> "jose-luis": the name as a URL, and as the test of sameness."""
    plain = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', plain.lower()).strip('-') or 'player'


class PlayerExists(Exception):
    def __init__(self, existing: PlayerOut):
        super().__init__(f'{existing.display_name} already exists')
        self.existing = existing


class NoSuchPlayer(Exception):
    pass


def _player_out(row) -> PlayerOut:
    return PlayerOut(id=row.id, display_name=row.display_name, slug=row.slug)


def _clean(name: str) -> str:
    return ' '.join(name.split())


def _taken(conn: Connection, slug: str, other_than: str | None = None):
    query = select(m.players).where(m.players.c.slug == slug)
    if other_than is not None:
        query = query.where(m.players.c.id != other_than)
    return conn.execute(query).first()


def create_player(conn: Connection, display_name: str) -> PlayerOut:
    """
    Players are made on purpose, on the Players screen -- never as a side effect
    of saving a match -- so a typo at the table cannot invent a person. The
    same test of sameness as everywhere: a name whose slug is taken is refused,
    so "ana" cannot be added next to "Ana".
    """
    name = _clean(display_name)
    slug = slugify(name)
    if (existing := _taken(conn, slug)) is not None:
        raise PlayerExists(_player_out(existing))
    row = conn.execute(insert(m.players).values(
        id=str(uuid.uuid4()), display_name=name, slug=slug,
    ).returning(m.players)).one()
    return _player_out(row)


def rename_player(conn: Connection, player_id: str, display_name: str) -> PlayerOut:
    """For fixing a typo. Matches store the id, so every one of them follows."""
    name = _clean(display_name)
    slug = slugify(name)
    if (existing := _taken(conn, slug, other_than=player_id)) is not None:
        raise PlayerExists(_player_out(existing))
    row = conn.execute(m.players.update().where(m.players.c.id == player_id)
                       .values(display_name=name, slug=slug)
                       .returning(m.players)).first()
    if row is None:
        raise NoSuchPlayer(player_id)
    return _player_out(row)


def list_players(conn: Connection) -> list[PlayerOut]:
    found = conn.execute(select(m.players).order_by(m.players.c.display_name)).all()
    return [PlayerOut(id=p.id, display_name=p.display_name, slug=p.slug) for p in found]


def _parse_time(text: str | None) -> datetime | None:
    return None if text is None else datetime.fromisoformat(text)


def _format_time(value: datetime | None) -> str | None:
    """Exactly what JavaScript's `toISOString()` writes, so a round trip is equal."""
    if value is None:
        return None
    return value.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _dump_json(value: object) -> str:
    """`JSON.stringify` spacing, for the same reason."""
    return json.dumps(value, separators=(',', ':'))


def content_hash(rows: MatchRows) -> str:
    canonical = json.dumps(rows.model_dump(by_alias=True), sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _other_owner(conn: Connection, match_id: str, rows: MatchRows) -> bool:
    hand_ids = [h.client_uuid for h in rows.hands]
    adj_ids = [a.client_uuid for a in rows.adjustments]
    clash = select(m.hands.c.id).where(
        m.hands.c.client_uuid.in_(hand_ids), m.hands.c.match_id != match_id,
    ).union_all(select(m.adjustments.c.id).where(
        m.adjustments.c.client_uuid.in_(adj_ids), m.adjustments.c.match_id != match_id,
    )).limit(1)
    return conn.execute(clash).first() is not None


def save_match(conn: Connection, rows: MatchRows, base_revision: int) -> int:
    """Stores the match and returns its new revision. Call inside a transaction."""
    match_id = rows.match.id
    digest = content_hash(rows)

    seated = {p.player_id for p in rows.match_players if p.player_id is not None}
    if seated:
        known = set(conn.execute(
            select(m.players.c.id).where(m.players.c.id.in_(seated))).scalars())
        if seated - known:
            raise UnknownPlayer(', '.join(sorted(seated - known)))

    current = conn.execute(
        select(m.matches.c.revision, m.matches.c.content_hash)
        .where(m.matches.c.id == match_id)
        .with_for_update()
    ).first()

    if current is not None:
        if current.content_hash == digest:
            return current.revision
        if current.revision != base_revision:
            raise StaleWrite(current.revision)
    if _other_owner(conn, match_id, rows):
        raise DuplicateId(match_id)

    revision = (current.revision if current else 0) + 1
    t = rows.match
    values = {
        'name': t.name, 'players': t.players, 'red_fives': t.red_fives, 'length': t.length,
        'starting_points': t.starting_points, 'return_score': t.return_score,
        'uma': json.loads(t.uma_json), 'status': t.status, 'end_reason': t.end_reason,
        'started_at': _parse_time(t.started_at), 'ended_at': _parse_time(t.ended_at),
        'max_level': t.max_level, 'is_test': t.is_test,
        'revision': revision, 'content_hash': digest, 'updated_at': func.now(),
    }
    if current is None:
        conn.execute(insert(m.matches).values(id=match_id, **values))
    else:
        conn.execute(m.matches.update().where(m.matches.c.id == match_id).values(**values))
        # Children cascade from `hands`; the rest hang off the match directly.
        for table in (m.hands, m.match_players, m.adjustments):
            conn.execute(delete(table).where(table.c.match_id == match_id))

    conn.execute(insert(m.match_players), [{
        'match_id': match_id, 'seat': p.seat, 'player_id': p.player_id,
        'guest_name': p.guest_name, 'final_score': p.final_score,
        'placement': p.placement, 'uma_points': p.uma_points,
    } for p in rows.match_players])

    hand_id: dict[int, int] = {}
    if rows.hands:
        inserted = conn.execute(insert(m.hands).values([{
            'match_id': match_id, 'seq': h.seq, 'round_wind': h.round_wind,
            'round_number': h.round_number, 'honba': h.honba,
            'riichi_pot_before': h.riichi_pot_before, 'outcome': h.outcome,
            'abortive_reason': h.abortive_reason, 'deal_in_seat': h.deal_in_seat,
            'score_delta': [int(x) for x in h.score_delta.split(',')],
            'client_uuid': h.client_uuid,
        } for h in rows.hands]).returning(m.hands.c.id, m.hands.c.seq))
        hand_id = {row.seq: row.id for row in inserted}

    if rows.hand_wins:
        conn.execute(insert(m.hand_wins), [{
            'hand_id': hand_id[w.hand_seq], 'winner_seat': w.winner_seat, 'han': w.han,
            'fu': w.fu, 'level': w.level, 'base_points': w.base_points,
            'points_won': w.points_won, 'is_manual': w.is_manual, 'winner_open': w.winner_open,
            'hand_tiles': w.hand_tiles, 'situation_flags': w.situation_flags,
        } for w in rows.hand_wins])

    for table, seat_rows in ((m.hand_riichi, rows.hand_riichi), (m.hand_tenpai, rows.hand_tenpai)):
        if seat_rows:
            conn.execute(insert(table), [
                {'hand_id': hand_id[r.hand_seq], 'seat': r.seat} for r in seat_rows])

    if rows.hand_yakus:
        position: dict[tuple[int, int], int] = {}
        yaku_rows = []
        for y in rows.hand_yakus:
            key = (y.hand_seq, y.winner_seat)
            position[key] = position.get(key, -1) + 1
            yaku_rows.append({
                'hand_id': hand_id[y.hand_seq], 'winner_seat': y.winner_seat,
                'yaku': y.yaku, 'han': y.han, 'position': position[key],
            })
        conn.execute(insert(m.hand_yakus), yaku_rows)

    if rows.adjustments:
        conn.execute(insert(m.adjustments), [{
            'match_id': match_id, 'client_uuid': a.client_uuid, 'after_seq': a.after_seq,
            'seat': a.seat, 'delta': a.delta, 'note': a.note,
        } for a in rows.adjustments])

    return revision


def load_match(conn: Connection, match_id: str
               ) -> tuple[int, MatchRows, list[Player]] | None:
    t = conn.execute(select(m.matches).where(m.matches.c.id == match_id)).first()
    if t is None:
        return None

    hand_rows = conn.execute(
        select(m.hands).where(m.hands.c.match_id == match_id).order_by(m.hands.c.seq)).all()
    seq_of = {h.id: h.seq for h in hand_rows}
    ids = list(seq_of)

    def children(table, order):
        if not ids:
            return []
        found = conn.execute(select(table).where(table.c.hand_id.in_(ids))).all()
        return sorted(found, key=lambda r: (seq_of[r.hand_id], *order(r)))

    wins = children(m.hand_wins, lambda r: (r.winner_seat,))
    riichi = children(m.hand_riichi, lambda r: (r.seat,))
    tenpai = children(m.hand_tenpai, lambda r: (r.seat,))
    yakus = children(m.hand_yakus, lambda r: (r.winner_seat, r.position))

    players = conn.execute(select(m.match_players, m.players.c.display_name)
                           .outerjoin(m.players, m.players.c.id == m.match_players.c.player_id)
                           .where(m.match_players.c.match_id == match_id)
                           .order_by(m.match_players.c.seat)).all()
    adjustments = conn.execute(select(m.adjustments)
                               .where(m.adjustments.c.match_id == match_id)
                               .order_by(m.adjustments.c.id)).all()

    rows = MatchRows(
        match={
            'id': t.id, 'name': t.name, 'players': t.players, 'red_fives': t.red_fives,
            'length': t.length, 'starting_points': t.starting_points,
            'return_score': t.return_score, 'uma_json': _dump_json(t.uma),
            'status': t.status, 'end_reason': t.end_reason,
            'started_at': _format_time(t.started_at), 'ended_at': _format_time(t.ended_at),
            'max_level': t.max_level, 'is_test': t.is_test,
        },
        match_players=[{
            'seat': p.seat, 'player_id': p.player_id, 'guest_name': p.guest_name,
            'final_score': p.final_score, 'placement': p.placement,
            'uma_points': p.uma_points,
        } for p in players],
        hands=[{
            'client_uuid': h.client_uuid, 'seq': h.seq, 'round_wind': h.round_wind,
            'round_number': h.round_number, 'honba': h.honba,
            'riichi_pot_before': h.riichi_pot_before, 'outcome': h.outcome,
            'abortive_reason': h.abortive_reason, 'deal_in_seat': h.deal_in_seat,
            'score_delta': ','.join(str(x) for x in h.score_delta),
        } for h in hand_rows],
        hand_wins=[{
            'hand_seq': seq_of[w.hand_id], 'winner_seat': w.winner_seat, 'han': w.han,
            'fu': w.fu, 'level': w.level, 'base_points': w.base_points,
            'points_won': w.points_won, 'is_manual': w.is_manual,
            'winner_open': w.winner_open, 'hand_tiles': w.hand_tiles,
            'situation_flags': w.situation_flags,
        } for w in wins],
        hand_riichi=[{'hand_seq': seq_of[r.hand_id], 'seat': r.seat} for r in riichi],
        hand_tenpai=[{'hand_seq': seq_of[r.hand_id], 'seat': r.seat} for r in tenpai],
        hand_yakus=[{
            'hand_seq': seq_of[y.hand_id], 'winner_seat': y.winner_seat,
            'yaku': y.yaku, 'han': y.han,
        } for y in yakus],
        adjustments=[{
            'client_uuid': a.client_uuid, 'after_seq': a.after_seq, 'seat': a.seat,
            'delta': a.delta, 'note': a.note,
        } for a in adjustments],
    )
    named = [Player(id=p.player_id, display_name=p.display_name)
             for p in players if p.player_id is not None]
    return t.revision, rows, named


def delete_match(conn: Connection, match_id: str) -> bool:
    return conn.execute(delete(m.matches).where(m.matches.c.id == match_id)).rowcount > 0


def _like(text: str) -> str:
    """A substring pattern for ILIKE, with its own wildcards taken literally."""
    escaped = text.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{escaped}%'


def list_matches(conn: Connection, include_test: bool = False, status: str | None = None, *,
                 text: str | None = None, player_ids: Sequence[str] = (),
                 min_level_rank: int | None = None, yaku: str | None = None,
                 players: int | None = None) -> list[MatchSummary]:
    """
    Newest first. Scores are the stored `final_score`, current as of the last save.

    The filters combine with AND, which is what narrowing a list means:

    - `text` matches the match's name or anyone seated, guests included
      (a case-insensitive substring).
    - `player_ids`: every one of them sat in the match.
    - `min_level_rank`: some winner reached at least this rank (`LEVEL_RANKS`),
      read off the denormalised `max_level_rank`.
    - `yaku`: some winner's hand had it. A join through `hand_yakus`, which is
      why the filters are here and not on the phone.
    - `players`: 4, or 3 for sanma.
    """
    c = m.matches.c
    mp = m.match_players.c
    hand_count = (select(func.count()).where(m.hands.c.match_id == c.id)
                  .scalar_subquery())
    query = select(m.matches, hand_count.label('hand_count')).order_by(c.started_at.desc())
    if not include_test:
        query = query.where(c.is_test.is_(False))
    if status is not None:
        query = query.where(c.status == status)
    if players is not None:
        query = query.where(c.players == players)
    if min_level_rank is not None:
        query = query.where(c.max_level_rank >= min_level_rank)
    for player_id in dict.fromkeys(player_ids):
        query = query.where(exists().where(mp.match_id == c.id, mp.player_id == player_id))
    if yaku:
        query = query.where(exists().where(
            m.hands.c.match_id == c.id, m.hand_yakus.c.hand_id == m.hands.c.id,
            m.hand_yakus.c.yaku == yaku))
    if text and text.strip():
        pattern = _like(text.strip())
        seated = (select(mp.match_id)
                  .outerjoin(m.players, m.players.c.id == mp.player_id)
                  .where(mp.match_id == c.id)
                  .where(or_(mp.guest_name.ilike(pattern, escape='\\'),
                             m.players.c.display_name.ilike(pattern, escape='\\'))))
        query = query.where(or_(c.name.ilike(pattern, escape='\\'), seated.exists()))
    matches = conn.execute(query).all()

    wanted = [t.id for t in matches]
    seats = conn.execute(
        select(m.match_players, m.players.c.display_name)
        .outerjoin(m.players, m.players.c.id == mp.player_id)
        .where(mp.match_id.in_(wanted))
        .order_by(mp.match_id, mp.seat)
    ).all() if wanted else []
    by_match: dict[str, list] = {}
    for s in seats:
        by_match.setdefault(s.match_id, []).append(s)

    return [MatchSummary(
        id=t.id, name=t.name, players=t.players, status=t.status,
        started_at=_format_time(t.started_at), ended_at=_format_time(t.ended_at),
        hands=t.hand_count,
        seats=[s.guest_name or s.display_name or '' for s in by_match.get(t.id, [])],
        player_ids=[s.player_id for s in by_match.get(t.id, [])],
        scores=[s.final_score for s in by_match.get(t.id, [])],
        placements=[s.placement for s in by_match.get(t.id, [])],
        max_level=t.max_level,
        revision=t.revision,
    ) for t in matches]


def player_stats(conn: Connection, slug: str, players: int) -> PlayerStats | None:
    """
    Everything the profile page shows, for one kind of match. None if there is
    no such player. The heavy lifting is a handful of aggregate queries over
    `mine`: the (match, seat) pairs where this player sat.
    """
    who = conn.execute(select(m.players).where(m.players.c.slug == slug)).first()
    if who is None:
        return None
    c, mp, h, w = m.matches.c, m.match_players.c, m.hands.c, m.hand_wins.c
    counted = (c.status == 'finished') & c.is_test.is_(False)

    kinds = dict(conn.execute(
        select(c.players, func.count())
        .select_from(m.match_players.join(m.matches, c.id == mp.match_id))
        .where(mp.player_id == who.id, counted)
        .group_by(c.players)).all())

    mine = (select(mp.match_id, mp.seat)
            .join(m.matches, c.id == mp.match_id)
            .where(mp.player_id == who.id, counted, c.players == players)
            .subquery('mine'))

    placed = conn.execute(
        select(c.id, c.name, c.started_at, mp.placement, mp.final_score, mp.uma_points)
        .select_from(m.match_players.join(m.matches, c.id == mp.match_id))
        .join(mine, (mine.c.match_id == mp.match_id) & (mine.c.seat == mp.seat))
        .where(mp.placement.is_not(None))
        .order_by(c.started_at)).all()
    counts = [0] * players
    for p in placed:
        if 1 <= p.placement <= players:
            counts[p.placement - 1] += 1

    my_hands = m.hands.join(mine, mine.c.match_id == h.match_id)
    riichi_here = exists().where(m.hand_riichi.c.hand_id == h.id,
                                 m.hand_riichi.c.seat == mine.c.seat)
    hand_totals = conn.execute(select(
        func.count(),
        func.count().filter(h.deal_in_seat == mine.c.seat),
        func.count().filter(riichi_here),
    ).select_from(my_hands)).one()

    # Wins are tsumo and ron. A nagashi mangan pays like one but is not a won
    # hand -- there is no hand to have won with, riichi or not.
    my_wins = my_hands.join(m.hand_wins, (w.hand_id == h.id) & (w.winner_seat == mine.c.seat))
    won = h.outcome.in_(('tsumo', 'ron'))
    riichi_won = exists().where(m.hand_riichi.c.hand_id == h.id,
                                m.hand_riichi.c.seat == w.winner_seat)
    win_totals = conn.execute(select(
        func.count(),
        func.count().filter(h.outcome == 'tsumo'),
        func.count().filter(riichi_won),
        func.count().filter(~riichi_won & w.winner_open.is_(False)),
        func.count().filter(~riichi_won & w.winner_open.is_(True)),
        func.count().filter(~riichi_won & w.winner_open.is_(None)),
    ).select_from(my_wins).where(won)).one()

    best = conn.execute(
        select(c.id, c.name, h.round_wind, h.round_number,
               w.level, w.han, w.fu, w.points_won, w.hand_tiles)
        .select_from(my_wins.join(m.matches, c.id == h.match_id))
        .where(won)
        .order_by(w.level_rank.desc().nulls_last(), w.base_points.desc().nulls_last(), c.started_at)
        .limit(1)).first()

    yakus = conn.execute(
        select(m.hand_yakus.c.yaku, func.count().label('n'))
        .select_from(my_wins.join(m.hand_yakus, (m.hand_yakus.c.hand_id == h.id)
                                  & (m.hand_yakus.c.winner_seat == w.winner_seat)))
        .where(won)
        .group_by(m.hand_yakus.c.yaku)
        .order_by(func.count().desc(), m.hand_yakus.c.yaku)).all()

    # Grouped rather than listed: a histogram only needs how many of each.
    values = conn.execute(
        select(w.level, w.base_points, func.count().label('n'))
        .select_from(my_wins).where(won)
        .group_by(w.level, w.base_points)
        .order_by(w.base_points.nulls_first(), w.level)).all()

    return PlayerStats(
        player=_player_out(who), players=players,
        matches_four=kinds.get(4, 0), matches_sanma=kinds.get(3, 0),
        matches=[PlacedMatch(match_id=p.id, name=p.name, started_at=_format_time(p.started_at),
                             placement=p.placement, final_score=p.final_score,
                             uma_points=p.uma_points) for p in placed],
        placement_counts=counts,
        uma_total=sum(p.uma_points or 0 for p in placed),
        hands=hand_totals[0], deal_ins=hand_totals[1], riichis=hand_totals[2],
        wins=win_totals[0], tsumo_wins=win_totals[1],
        win_methods=WinMethods(riichi=win_totals[2], dama=win_totals[3],
                               open=win_totals[4], unknown=win_totals[5]),
        best_hand=None if best is None else BestHand(
            match_id=best.id, match_name=best.name, round_wind=best.round_wind,
            round_number=best.round_number, level=best.level, han=best.han, fu=best.fu,
            points_won=best.points_won, hand_tiles=best.hand_tiles),
        yakus=[YakuCount(yaku=y.yaku, count=y.n) for y in yakus],
        win_values=[WinValue(level=v.level, base_points=v.base_points, count=v.n) for v in values],
    )
