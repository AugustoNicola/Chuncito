"""
The API, against the fixtures `frontend/src/features/match/wire.test.ts` writes
from real matches. What goes in must come back out unchanged -- that is what
lets another device rebuild the match with `fromRows`.
"""
import copy
import json
from pathlib import Path

import pytest
from sqlalchemy import text

from tests.conftest import PIN

FIXTURES = {p.stem: json.loads(p.read_text())
            for p in (Path(__file__).parent / 'fixtures').glob('*.json')}


def fixture(name: str, match_id: str) -> dict:
    """
    A fixture's rows under a fresh id, so tests do not collide in the shared
    schema. The players that came with it ride along in `PLAYERS[match_id]`.
    """
    payload = copy.deepcopy(FIXTURES[name])
    rows = payload['rows']
    old = rows['match']['id']
    rows['match']['id'] = match_id
    for row in (*rows['hands'], *rows['adjustments']):
        row['clientUuid'] = row['clientUuid'].replace(old, match_id)
    PLAYERS[match_id] = payload['players']
    return rows


PLAYERS: dict[str, list] = {}


def put(client, rows: dict, base: int = 0, players: list | None = None):
    match_id = rows['match']['id']
    return client.put(f'/api/matches/{match_id}', json={
        'baseRevision': base, 'rows': rows,
        'players': PLAYERS.get(match_id, []) if players is None else players,
    })


def test_the_fixtures_are_there():
    assert set(FIXTURES) == {'four-player-finished', 'sanma-in-progress', 'empty'}


# --- the PIN ---

def test_the_matches_are_locked_without_the_pin(client):
    assert client.get('/api/session').json() == {'unlocked': False, 'configured': True}
    assert client.get('/api/matches').status_code == 401
    assert put(client, fixture('empty', 'locked')).status_code == 401


def test_a_wrong_pin_does_not_unlock(client):
    assert client.post('/api/session', json={'pin': '0000'}).status_code == 401
    assert client.get('/api/matches').status_code == 401


def test_the_right_pin_unlocks_and_logging_out_locks_again(client):
    assert client.post('/api/session', json={'pin': PIN}).status_code == 204
    assert client.get('/api/session').json()['unlocked'] is True
    assert client.get('/api/matches').status_code == 200
    client.delete('/api/session')
    assert client.get('/api/matches').status_code == 401


def test_guessing_is_slowed_down(client):
    for _ in range(10):
        assert client.post('/api/session', json={'pin': 'nope'}).status_code == 401
    # Even the right PIN waits out the window once the limit is hit.
    assert client.post('/api/session', json={'pin': PIN}).status_code == 429


def test_a_forged_cookie_does_not_unlock(client):
    client.cookies.set('chuncito_session', 'f' * 64)
    assert client.get('/api/matches').status_code == 401


# --- saving and loading ---

@pytest.mark.parametrize('name', ['four-player-finished', 'sanma-in-progress', 'empty'])
def test_a_match_comes_back_exactly_as_it_was_sent(unlocked, name):
    rows = fixture(name, f'rt-{name}')
    saved = put(unlocked, rows)
    assert saved.status_code == 200, saved.text
    assert saved.json()['revision'] == 1

    got = unlocked.get(f"/api/matches/{rows['match']['id']}")
    assert got.status_code == 200
    assert got.json() == {'revision': 1, 'rows': rows, 'players': PLAYERS[rows['match']['id']]}


def test_a_retried_save_is_not_a_second_write(unlocked):
    rows = fixture('four-player-finished', 'retry')
    assert put(unlocked, rows).json()['revision'] == 1
    # The phone never heard back, so it sends the same thing on the same base.
    assert put(unlocked, rows, base=0).json()['revision'] == 1


def test_undo_is_just_the_next_save(unlocked):
    rows = fixture('sanma-in-progress', 'undo')
    assert put(unlocked, rows).json()['revision'] == 1

    undone = copy.deepcopy(rows)
    undone['hands'] = undone['hands'][:-1]
    undone['handTenpai'] = [t for t in undone['handTenpai'] if t['handSeq'] != 2]
    assert put(unlocked, undone, base=1).json()['revision'] == 2
    assert unlocked.get('/api/matches/undo').json()['rows'] == undone


def test_a_stale_phone_cannot_overwrite_newer_hands(unlocked):
    rows = fixture('sanma-in-progress', 'stale')
    put(unlocked, rows)
    newer = copy.deepcopy(rows)
    newer['match']['name'] = 'carried on elsewhere'
    assert put(unlocked, newer, base=1).json()['revision'] == 2

    # The first phone, back online, still thinks the server is at revision 1.
    older = copy.deepcopy(rows)
    older['match']['name'] = 'the old copy'
    refused = put(unlocked, older, base=1)
    assert refused.status_code == 409
    assert refused.json()['revision'] == 2
    assert unlocked.get('/api/matches/stale').json()['rows']['match']['name'] == \
        'carried on elsewhere'


def test_a_hand_cannot_belong_to_two_matches(unlocked):
    first = fixture('sanma-in-progress', 'owner')
    put(unlocked, first)
    thief = copy.deepcopy(first)
    thief['match']['id'] = 'thief'
    assert put(unlocked, thief).status_code == 409
    assert unlocked.get('/api/matches/thief').status_code == 404


def test_the_path_and_body_must_agree(unlocked):
    rows = fixture('empty', 'body-id')
    response = unlocked.put('/api/matches/path-id', json={'baseRevision': 0, 'rows': rows})
    assert response.status_code == 422


def test_a_match_that_does_not_fit_its_player_count_is_refused(unlocked):
    rows = fixture('sanma-in-progress', 'misfit')
    rows['hands'][0]['scoreDelta'] = '1,2,3,-6'
    response = put(unlocked, rows)
    assert response.status_code == 422
    assert 'score_delta needs 3 entries' in response.text


def test_a_yaku_without_its_winner_is_refused(unlocked):
    rows = fixture('four-player-finished', 'orphan-yaku')
    rows['handYakus'].append({'handSeq': 2, 'winnerSeat': 0, 'yaku': 'tanyao', 'han': 1})
    assert put(unlocked, rows).status_code == 422


# --- players ---

def test_a_match_brings_its_new_players_with_it(unlocked):
    rows = fixture('four-player-finished', 'players-new')
    assert put(unlocked, rows).status_code == 200
    listed = {p['id']: p for p in unlocked.get('/api/players').json()}
    assert listed['player-ana'] == {'id': 'player-ana', 'displayName': 'Ana', 'slug': 'ana'}
    assert 'player-beto' in listed


def test_a_seat_naming_an_unknown_player_is_refused(unlocked):
    rows = fixture('empty', 'players-unknown')
    rows['matchPlayers'][0]['playerId'] = 'nobody-told-me'
    response = put(unlocked, rows, players=[])
    assert response.status_code == 422
    assert 'nobody-told-me' in response.text


def test_the_same_person_made_on_two_phones_is_one_player(unlocked):
    put(unlocked, fixture('empty', 'players-first'))       # creates player-ana, "Ana"

    # Another phone, offline, created "ANA" with an id of its own.
    rows = fixture('empty', 'players-second')
    rows['matchPlayers'][0]['playerId'] = 'phone-b-ana'
    saved = put(unlocked, rows, players=[
        {'id': 'phone-b-ana', 'displayName': 'ANA'},
        {'id': 'player-beto', 'displayName': 'Beto'},
    ])
    assert saved.status_code == 200
    assert saved.json()['playerAliases'] == {'phone-b-ana': 'player-ana'}

    got = unlocked.get('/api/matches/players-second').json()
    assert got['rows']['matchPlayers'][0]['playerId'] == 'player-ana'
    assert got['players'][0] == {'id': 'player-ana', 'displayName': 'Ana'}
    assert 'phone-b-ana' not in {p['id'] for p in unlocked.get('/api/players').json()}

    # The phone retries, never having heard back: it still learns the alias.
    again = put(unlocked, rows, players=[{'id': 'phone-b-ana', 'displayName': 'ANA'},
                                         {'id': 'player-beto', 'displayName': 'Beto'}])
    assert again.json() == {'revision': 1, 'playerAliases': {'phone-b-ana': 'player-ana'}}


def test_a_known_player_keeps_their_name(unlocked):
    put(unlocked, fixture('empty', 'players-keep'))
    rows = fixture('empty', 'players-rename')
    put(unlocked, rows, players=[{'id': 'player-ana', 'displayName': 'Anita'},
                                 {'id': 'player-beto', 'displayName': 'Beto'}])
    listed = {p['id']: p for p in unlocked.get('/api/players').json()}
    assert listed['player-ana']['displayName'] == 'Ana'


def test_slugs_ignore_case_and_accents():
    from app.store import slugify
    assert slugify('José Luis') == 'jose-luis'
    assert slugify('  ANA ') == 'ana'
    assert slugify('???') == 'player'


# --- listing and deleting ---

def test_the_list_summarises_matches_newest_first(unlocked):
    older = fixture('four-player-finished', 'list-a')
    newer = fixture('sanma-in-progress', 'list-b')
    hidden = fixture('empty', 'list-test')
    hidden['match']['isTest'] = True
    for rows in (older, newer, hidden):
        assert put(unlocked, rows).status_code == 200

    listed = {m['id']: m for m in unlocked.get('/api/matches').json()}
    assert 'list-test' not in listed
    a, b = listed['list-a'], listed['list-b']
    assert a['seats'] == ['Ana', 'Beto', 'Cami', 'Dani']
    assert a['scores'] == [p['finalScore'] for p in older['matchPlayers']]
    assert a['hands'] == len(older['hands'])
    assert b['players'] == 3 and b['status'] == 'in_progress'
    ids = [m['id'] for m in unlocked.get('/api/matches').json()]
    assert ids.index('list-b') < ids.index('list-a')

    with_tests = unlocked.get('/api/matches', params={'include_test': True}).json()
    assert 'list-test' in {m['id'] for m in with_tests}

    playing = unlocked.get('/api/matches', params={'status': 'in_progress'}).json()
    assert 'list-b' in {m['id'] for m in playing}
    assert 'list-a' not in {m['id'] for m in playing}


def test_a_discarded_match_is_deleted_with_everything_in_it(unlocked, engine):
    rows = fixture('four-player-finished', 'gone')
    put(unlocked, rows)
    assert unlocked.delete('/api/matches/gone').status_code == 204
    assert unlocked.get('/api/matches/gone').status_code == 404
    # Deleting again is fine; the phone may retry.
    assert unlocked.delete('/api/matches/gone').status_code == 204
    with engine.connect() as conn:
        left = conn.execute(text(
            "select count(*) from hand_yakus y join hands h on h.id = y.hand_id "
            "where h.match_id = 'gone'")).scalar()
    assert left == 0


def test_the_best_hand_is_indexed_by_rank(unlocked, engine):
    put(unlocked, fixture('four-player-finished', 'ranked'))
    with engine.connect() as conn:
        rank = conn.execute(text(
            "select max_level_rank from matches where id = 'ranked'")).scalar()
    assert rank == 1  # mangan


# --- the edges ---

def test_nothing_is_meant_to_be_indexed(client):
    assert client.get('/robots.txt').text == 'User-agent: *\nDisallow: /\n'
    assert client.get('/api/session').headers['X-Robots-Tag'] == 'noindex, nofollow'


def test_health_goes_through_the_pooled_connection(client, monkeypatch):
    # The real engine: pooled URL, prepared statements off.
    from app import main
    from app.db import get_engine
    monkeypatch.setattr(main, 'get_engine', get_engine)
    assert client.get('/api/health').json() == {'ok': True}
