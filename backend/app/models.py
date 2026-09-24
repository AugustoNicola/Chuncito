"""
The tables of `docs/DATA_MODEL.md`, as SQLAlchemy Core.

Core rather than the ORM: the API reads and writes whole matches as rows, which
is what `rows.ts` already produces, so there are no objects to map to.

The migration in `migrations/versions/` creates exactly this; `test_schema.py`
diffs the migrated database against this metadata so the two cannot drift.

Departures from the data model's shorthand, all deliberate:

- **Enums are `text` + `CHECK`,** not Postgres `ENUM` types. Adding a value to a
  native enum is an `ALTER TYPE` that cannot run inside a transaction; a check
  constraint is replaced like any other.
- **`score_delta` is `integer[]`,** not the `"+8000,-8000,0,0"` string. The API
  still speaks the string (it is what `rows.ts` emits), but Phase 4's per-seat
  sums read an array without parsing.
- **Ids are `text`.** They are made on the phone (`crypto.randomUUID`), which is
  not available outside a secure context -- and the LAN dev server is plain
  HTTP -- so older local data holds ids that are not UUIDs.
- **`level_rank` is generated** from `level`, so "mangan or better" is an index
  range over a number while the stored value stays the engine's own atom.
"""
from sqlalchemy import (
    ARRAY, BigInteger, Boolean, CheckConstraint, Column, Computed, DateTime, Float,
    ForeignKey, ForeignKeyConstraint, Index, Integer, MetaData, SmallInteger, Table, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

metadata = MetaData(naming_convention={
    'ix': 'ix_%(table_name)s_%(column_0_N_name)s',
    'uq': 'uq_%(table_name)s_%(column_0_N_name)s',
    'ck': 'ck_%(table_name)s_%(constraint_name)s',
    'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
    'pk': 'pk_%(table_name)s',
})

WINDS = ('este', 'sur', 'oeste', 'norte')
OUTCOMES = ('tsumo', 'ron', 'exhaustive_draw', 'abortive_draw', 'nagashi_mangan', 'chombo')
STATUSES = ('in_progress', 'finished', 'abandoned')
END_REASONS = ('final_round', 'bust', 'manual')

# The client's `LEVEL_RANK`, extended: anything unrecognised is some yakuman
# variant, which is what the client assumes too.
LEVEL_RANKS = {
    'sinNombre': 0, 'mangan': 1, 'haneman': 2, 'baiman': 3, 'sanbaiman': 4,
    'kazoeYakuman': 5, 'yakuman': 6, 'dobleYakuman': 7, 'tripleYakuman': 8,
}
YAKUMAN_RANK = LEVEL_RANKS['yakuman']


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _rank_of(column: str) -> str:
    cases = ' '.join(f"WHEN '{level}' THEN {rank}" for level, rank in LEVEL_RANKS.items())
    return f'CASE {column} {cases} ELSE {YAKUMAN_RANK} END'


def _level_rank(column: str) -> Computed:
    # A simple CASE never matches NULL, so without the guard a hand with no
    # level would rank as a yakuman.
    return Computed(
        f'CASE WHEN {column} IS NULL THEN NULL ELSE ({_rank_of(column)}) END', persisted=True)


players = Table(
    'players', metadata,
    Column('id', Text, primary_key=True),
    Column('display_name', Text, nullable=False),
    Column('slug', Text, nullable=False, unique=True),
    Column('avatar', Text),
    Column('created_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
)

matches = Table(
    'matches', metadata,
    Column('id', Text, primary_key=True),
    Column('name', Text, nullable=False, server_default=''),
    Column('players', SmallInteger, nullable=False),
    Column('red_fives', Boolean, nullable=False),
    # House rules the scorer applies, as its own rule atoms (`reglaSoportada/1`
    # upstream), so a new rule needs no new column. Kept in the client's order.
    Column('rules', ARRAY(Text), nullable=False, server_default='{}'),
    Column('length', Text, nullable=False),
    Column('starting_points', Integer, nullable=False),
    # What results are measured against (oka); see `matchResults` in the client.
    Column('target_score', Integer, nullable=False),
    Column('goal_score', Integer, nullable=False),
    Column('uma', JSONB, nullable=False),
    Column('status', Text, nullable=False),
    Column('end_reason', Text),
    Column('started_at', DateTime(timezone=True), nullable=False),
    Column('ended_at', DateTime(timezone=True)),
    Column('max_level', Text),
    Column('max_level_rank', SmallInteger, _level_rank('max_level')),
    Column('is_test', Boolean, nullable=False, server_default='false'),
    # Played for MAKApoints: chosen when the match is saved (0005).
    Column('ranked', Boolean, nullable=False, server_default='false'),
    # When the server last took a write, for the sync status and for spotting
    # a phone that has been offline a long time.
    Column('updated_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
    # Sync bookkeeping, not match data: see `store.save_match`. `revision`
    # counts accepted writes; `content_hash` recognises a retried one.
    Column('revision', Integer, nullable=False, server_default='0'),
    Column('content_hash', Text),
    CheckConstraint('players IN (3, 4)', name='players'),
    CheckConstraint(_in('length', ('east', 'south')), name='length'),
    CheckConstraint(_in('status', STATUSES), name='status'),
    CheckConstraint(f"end_reason IS NULL OR {_in('end_reason', END_REASONS)}", name='end_reason'),
    Index(None, 'started_at'),
    Index(None, 'max_level_rank'),
)

match_players = Table(
    'match_players', metadata,
    Column('match_id', Text, ForeignKey('matches.id', ondelete='CASCADE'), primary_key=True),
    Column('seat', SmallInteger, primary_key=True),
    Column('player_id', Text, ForeignKey('players.id')),
    Column('guest_name', Text),
    Column('final_score', Integer, nullable=False),
    Column('placement', SmallInteger),
    Column('uma_points', Float),
    CheckConstraint('seat BETWEEN 0 AND 3', name='seat'),
    # A seat is a registered player or a named guest; never neither.
    CheckConstraint('player_id IS NOT NULL OR guest_name IS NOT NULL', name='who'),
    Index(None, 'player_id'),
)

hands = Table(
    'hands', metadata,
    Column('id', BigInteger, primary_key=True, autoincrement=True),
    Column('match_id', Text, ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
    Column('seq', SmallInteger, nullable=False),
    Column('round_wind', Text, nullable=False),
    Column('round_number', SmallInteger, nullable=False),
    Column('honba', SmallInteger, nullable=False),
    Column('riichi_pot_before', SmallInteger, nullable=False),
    Column('outcome', Text, nullable=False),
    Column('abortive_reason', Text),
    Column('deal_in_seat', SmallInteger),
    Column('score_delta', ARRAY(Integer), nullable=False),
    Column('client_uuid', Text, nullable=False, unique=True),
    UniqueConstraint('match_id', 'seq'),
    CheckConstraint(_in('round_wind', WINDS), name='round_wind'),
    CheckConstraint(_in('outcome', OUTCOMES), name='outcome'),
    CheckConstraint('cardinality(score_delta) IN (3, 4)', name='score_delta'),
    Index(None, 'deal_in_seat'),
)

hand_wins = Table(
    'hand_wins', metadata,
    Column('hand_id', BigInteger, ForeignKey('hands.id', ondelete='CASCADE'), primary_key=True),
    Column('winner_seat', SmallInteger, primary_key=True),
    Column('han', SmallInteger),
    Column('fu', SmallInteger),
    Column('level', Text),
    Column('level_rank', SmallInteger, _level_rank('level')),
    Column('base_points', Integer),
    Column('points_won', Integer),
    Column('is_manual', Boolean, nullable=False),
    Column('winner_open', Boolean),
    Column('hand_tiles', Text),
    Column('situation_flags', Text),
    Index(None, 'level_rank'),
)


def _seat_table(name: str) -> Table:
    return Table(
        name, metadata,
        Column('hand_id', BigInteger, ForeignKey('hands.id', ondelete='CASCADE'),
               primary_key=True),
        Column('seat', SmallInteger, primary_key=True),
    )


hand_riichi = _seat_table('hand_riichi')
hand_tenpai = _seat_table('hand_tenpai')

hand_yakus = Table(
    'hand_yakus', metadata,
    Column('hand_id', BigInteger, primary_key=True),
    Column('winner_seat', SmallInteger, primary_key=True),
    Column('yaku', Text, primary_key=True),
    Column('han', SmallInteger, nullable=False),
    # The engine's order, which the display keeps (dora and friends last). The
    # wire format carries it as list order; this is where it survives the table.
    Column('position', SmallInteger, nullable=False),
    # The yaku belongs to a winner, not just to the hand.
    ForeignKeyConstraint(['hand_id', 'winner_seat'],
                         ['hand_wins.hand_id', 'hand_wins.winner_seat'],
                         ondelete='CASCADE', name='fk_hand_yakus_hand_wins'),
    Index(None, 'yaku'),
)

adjustments = Table(
    'adjustments', metadata,
    Column('id', BigInteger, primary_key=True, autoincrement=True),
    Column('match_id', Text, ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
    Column('client_uuid', Text, nullable=False, unique=True),
    Column('after_seq', SmallInteger, nullable=False),
    Column('seat', SmallInteger, nullable=False),
    Column('delta', Integer, nullable=False),
    Column('note', Text, nullable=False, server_default=''),
    Index(None, 'match_id'),
)
