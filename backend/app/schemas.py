"""
The wire format: `MatchRows` from `frontend/src/features/match/rows.ts`, field
for field, in its camelCase.

The client PUTs exactly what `toRows(state)` returns and gets exactly that back
from a GET, so `fromRows` rebuilds the match on any device. There is no second
serialisation to keep in step -- if `rows.ts` gains a field, the cross-language
fixture test (`tests/test_api.py`) is what fails.

Validation is strict on purpose. The client is ours, but a malformed match that
got into the database would surface much later as a wrong stat, far from the
bug that caused it.
"""
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Seat = Literal[0, 1, 2, 3]
Wind = Literal['este', 'sur', 'oeste', 'norte']
Outcome = Literal['tsumo', 'ron', 'exhaustive_draw', 'abortive_draw', 'nagashi_mangan', 'chombo']


class Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra='forbid')


class MatchTable(Wire):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(max_length=200)
    players: Literal[3, 4]
    red_fives: bool
    length: Literal['east', 'south']
    starting_points: int
    return_score: int
    uma_json: str
    status: Literal['in_progress', 'finished', 'abandoned']
    end_reason: Literal['final_round', 'bust', 'manual'] | None
    started_at: str
    ended_at: str | None
    max_level: str | None
    is_test: bool


class MatchPlayer(Wire):
    seat: Seat
    player_id: str | None
    guest_name: str | None
    final_score: int
    placement: int | None
    uma_points: float | None


class Hand(Wire):
    client_uuid: str = Field(min_length=1, max_length=64)
    seq: int = Field(ge=1)
    round_wind: Wind
    round_number: int = Field(ge=1, le=4)
    honba: int = Field(ge=0)
    riichi_pot_before: int = Field(ge=0)
    outcome: Outcome
    abortive_reason: str | None
    deal_in_seat: Seat | None
    score_delta: str = Field(pattern=r'^-?\d+(,-?\d+){2,3}$')


class HandWin(Wire):
    hand_seq: int
    winner_seat: Seat
    han: int | None
    fu: int | None
    level: str | None
    base_points: int | None
    points_won: int | None
    is_manual: bool
    winner_open: bool | None
    hand_tiles: str | None = Field(max_length=400)
    situation_flags: str | None


class HandSeat(Wire):
    hand_seq: int
    seat: Seat


class HandYaku(Wire):
    hand_seq: int
    winner_seat: Seat
    yaku: str = Field(min_length=1, max_length=64)
    han: int


class AdjustmentRow(Wire):
    client_uuid: str = Field(min_length=1, max_length=64)
    after_seq: int = Field(ge=0)
    seat: Seat
    delta: int
    note: str = Field(max_length=500)


class MatchRows(Wire):
    match: MatchTable
    match_players: list[MatchPlayer]
    hands: list[Hand]
    hand_wins: list[HandWin]
    hand_riichi: list[HandSeat]
    hand_tenpai: list[HandSeat]
    hand_yakus: list[HandYaku]
    adjustments: list[AdjustmentRow]

    @model_validator(mode='after')
    def _consistent(self) -> Self:
        """The shape rules `rows.ts` guarantees, checked rather than trusted."""
        players = self.match.players
        seats = sorted(p.seat for p in self.match_players)
        if seats != list(range(players)):
            raise ValueError(f'a {players}-player match needs seats 0..{players - 1}, got {seats}')

        seqs = [h.seq for h in self.hands]
        if sorted(seqs) != list(range(1, len(seqs) + 1)):
            raise ValueError('hand seq must run 1..n with no gaps')
        for hand in self.hands:
            if len(hand.score_delta.split(',')) != players:
                raise ValueError(f'hand {hand.seq}: score_delta needs {players} entries')

        known = set(seqs)
        in_play = set(range(players))
        wins = set()
        for win in self.hand_wins:
            if win.hand_seq not in known or win.winner_seat not in in_play:
                raise ValueError(f'win for hand {win.hand_seq} seat {win.winner_seat} has no hand')
            wins.add((win.hand_seq, win.winner_seat))
        for yaku in self.hand_yakus:
            if (yaku.hand_seq, yaku.winner_seat) not in wins:
                raise ValueError(f'yaku {yaku.yaku} for hand {yaku.hand_seq} has no winner')
        for row in (*self.hand_riichi, *self.hand_tenpai):
            if row.hand_seq not in known or row.seat not in in_play:
                raise ValueError(f'seat row for hand {row.hand_seq} does not fit the match')
        for adj in self.adjustments:
            if adj.seat not in in_play:
                raise ValueError(f'adjustment for seat {adj.seat} does not fit the match')
        return self


class Player(Wire):
    id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=60)


class PlayerOut(Player):
    slug: str


class PutMatch(Wire):
    """
    A whole match, plus the revision the phone last saw.

    `base_revision` is what stops a stale phone from overwriting newer work: a
    phone that went offline, while the match carried on from another device,
    would otherwise flush its old copy over the new one when it reconnected.

    Registered seats must name players the server already has: players are
    created on purpose, on their own screen (`POST /api/players`).
    """
    base_revision: int = Field(ge=0)
    rows: MatchRows


class Saved(Wire):
    revision: int


class PlayerName(Wire):
    display_name: str = Field(min_length=1, max_length=60, pattern=r'\S')


class Conflict(Wire):
    detail: str
    revision: int


class MatchSummary(Wire):
    id: str
    name: str
    players: int
    status: str
    started_at: str
    ended_at: str | None
    hands: int
    seats: list[str]
    # Per seat, as `seats`: null for a guest.
    player_ids: list[str | None]
    scores: list[int]
    # Null until the match is finished.
    placements: list[int | None]
    # The best limit reached in the match, as the engine's atom; null if nobody
    # has won a hand.
    max_level: str | None
    revision: int


class MatchWithRevision(Wire):
    revision: int
    rows: MatchRows
    # Names for the registered seats, so a device that has never seen these
    # players can still rebuild the match (`fromRows(rows, nameOf)`).
    players: list[Player]


class PinIn(Wire):
    pin: str = Field(min_length=1, max_length=64)


class SessionState(Wire):
    unlocked: bool
    configured: bool
