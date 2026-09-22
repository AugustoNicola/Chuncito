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
from datetime import UTC, datetime

from sqlalchemy import Connection, delete, func, insert, select

from . import models as m
from .schemas import MatchRows, MatchSummary


class StaleWrite(Exception):
    def __init__(self, revision: int):
        super().__init__(f'the server holds revision {revision}')
        self.revision = revision


class DuplicateId(Exception):
    """A hand or adjustment id already belongs to a different match."""


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


def load_match(conn: Connection, match_id: str) -> tuple[int, MatchRows] | None:
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

    players = conn.execute(select(m.match_players)
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
    return t.revision, rows


def delete_match(conn: Connection, match_id: str) -> bool:
    return conn.execute(delete(m.matches).where(m.matches.c.id == match_id)).rowcount > 0


def list_matches(conn: Connection, include_test: bool = False) -> list[MatchSummary]:
    """Newest first. Scores are the stored `final_score`, current as of the last save."""
    hand_count = (select(func.count()).where(m.hands.c.match_id == m.matches.c.id)
                  .scalar_subquery())
    query = select(m.matches, hand_count.label('hand_count')).order_by(m.matches.c.started_at.desc())
    if not include_test:
        query = query.where(m.matches.c.is_test.is_(False))
    matches = conn.execute(query).all()

    seats = conn.execute(
        select(m.match_players, m.players.c.display_name)
        .outerjoin(m.players, m.players.c.id == m.match_players.c.player_id)
        .order_by(m.match_players.c.match_id, m.match_players.c.seat)
    ).all()
    by_match: dict[str, list] = {}
    for s in seats:
        by_match.setdefault(s.match_id, []).append(s)

    return [MatchSummary(
        id=t.id, name=t.name, players=t.players, status=t.status,
        started_at=_format_time(t.started_at), ended_at=_format_time(t.ended_at),
        hands=t.hand_count,
        seats=[s.guest_name or s.display_name or '' for s in by_match.get(t.id, [])],
        scores=[s.final_score for s in by_match.get(t.id, [])],
        revision=t.revision,
    ) for t in matches]
