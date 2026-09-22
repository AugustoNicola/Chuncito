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
    """A fixture's rows under a fresh id, so tests do not collide in the shared schema."""
    rows = copy.deepcopy(FIXTURES[name]['rows'])
    old = rows['match']['id']
    rows['match']['id'] = match_id
    for row in (*rows['hands'], *rows['adjustments']):
        row['clientUuid'] = row['clientUuid'].replace(old, match_id)
    return rows


def players_of(name: str) -> list[dict]:
    return FIXTURES[name]['players']


@pytest.fixture(scope='module', autouse=True)
def seeded(engine):
    """
    The fixtures' registered players, under the ids the fixtures use. Inserted
    directly: the API makes up its own ids, as it should.
    """
    with engine.begin() as conn:
        for p in {p['id']: p for f in FIXTURES.values() for p in f['players']}.values():
            conn.execute(text(
                'insert into players (id, display_name, slug) values (:id, :name, :slug) '
                'on conflict (id) do nothing'),
                {'id': p['id'], 'name': p['displayName'], 'slug': p['displayName'].lower()})


def put(client, rows: dict, base: int = 0):
    return client.put(f"/api/matches/{rows['match']['id']}",
                      json={'baseRevision': base, 'rows': rows})


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
    assert got.json() == {'revision': 1, 'rows': rows, 'players': players_of(name)}


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

def test_a_player_is_created_on_purpose(unlocked):
    made = unlocked.post('/api/players', json={'displayName': '  Emi   Sato '})
    assert made.status_code == 201
    emi = made.json()
    assert emi['displayName'] == 'Emi Sato' and emi['slug'] == 'emi-sato'
    assert emi in unlocked.get('/api/players').json()


def test_a_name_already_taken_is_refused_with_whoever_has_it(unlocked):
    unlocked.post('/api/players', json={'displayName': 'Fede'})
    again = unlocked.post('/api/players', json={'displayName': 'FEDÉ'})
    assert again.status_code == 409
    assert again.json()['existing']['displayName'] == 'Fede'


def test_a_blank_name_is_refused(unlocked):
    assert unlocked.post('/api/players', json={'displayName': '   '}).status_code == 422


def test_a_typo_is_fixed_by_renaming(unlocked):
    gabi = unlocked.post('/api/players', json={'displayName': 'Gaib'}).json()
    fixed = unlocked.patch(f"/api/players/{gabi['id']}", json={'displayName': 'Gabi'})
    assert fixed.json() == {'id': gabi['id'], 'displayName': 'Gabi', 'slug': 'gabi'}
    # Renaming to your own name in a different case is not a clash with yourself.
    assert unlocked.patch(f"/api/players/{gabi['id']}",
                          json={'displayName': 'GABI'}).status_code == 200
    unlocked.post('/api/players', json={'displayName': 'Hana'})
    assert unlocked.patch(f"/api/players/{gabi['id']}",
                          json={'displayName': 'hana'}).status_code == 409
    assert unlocked.patch('/api/players/nobody', json={'displayName': 'X'}).status_code == 404


def test_saving_a_match_never_creates_players(unlocked):
    rows = fixture('empty', 'players-unknown')
    rows['matchPlayers'][0]['playerId'] = 'nobody-made-me'
    response = put(unlocked, rows)
    assert response.status_code == 422
    assert 'nobody-made-me' in response.text
    assert 'nobody-made-me' not in {p['id'] for p in unlocked.get('/api/players').json()}


def test_players_need_the_pin(client):
    assert client.get('/api/players').status_code == 401
    assert client.post('/api/players', json={'displayName': 'Sneaky'}).status_code == 401


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


def test_the_list_filters_for_history(unlocked):
    four = fixture('four-player-finished', 'filter-4p')   # Ana, Beto; mangan; riichi, pinfu
    sanma = fixture('sanma-in-progress', 'filter-3p')
    sanma['match']['name'] = '100%_sanma'
    for rows in (four, sanma):
        assert put(unlocked, rows).status_code == 200

    def ids(**params) -> set[str]:
        r = unlocked.get('/api/matches', params=params)
        assert r.status_code == 200, r.text
        return {m['id'] for m in r.json()} & {'filter-4p', 'filter-3p'}

    assert ids() == {'filter-4p', 'filter-3p'}
    assert ids(players=4) == {'filter-4p'}
    assert ids(players=3) == {'filter-3p'}
    assert ids(status='finished') == {'filter-4p'}

    # By name, and by who sat: a registered player or a guest.
    assert ids(q='DOUBLE ron') == {'filter-4p'}
    assert ids(q='cami') >= {'filter-4p'}
    # Wildcards in the search are taken literally.
    assert ids(q='100%_') == {'filter-3p'}
    assert ids(q='%') == {'filter-3p'}

    # Every named player must have sat.
    both = {m['id'] for m in unlocked.get(
        '/api/matches', params=[('player', 'player-ana'), ('player', 'player-beto')]).json()}
    assert 'filter-4p' in both
    assert 'filter-4p' not in {m['id'] for m in unlocked.get(
        '/api/matches', params=[('player', 'player-ana'), ('player', 'nobody')]).json()}

    assert 'filter-4p' in ids(min_level=1)          # mangan
    assert 'filter-4p' not in ids(min_level=2)      # nothing reached haneman
    assert 'filter-4p' in ids(yaku='pinfu')
    assert 'filter-4p' not in ids(yaku='chiitoitsu')
    assert unlocked.get('/api/matches', params={'players': 5}).status_code == 422

    listed = {m['id']: m for m in unlocked.get('/api/matches').json()}
    a = listed['filter-4p']
    assert a['maxLevel'] == 'mangan'
    assert a['playerIds'] == [p['playerId'] for p in four['matchPlayers']]
    assert a['placements'] == [p['placement'] for p in four['matchPlayers']]
    assert listed['filter-3p']['placements'] == [None, None, None]


# --- player stats ---

def test_a_profile_counts_only_what_that_player_did(unlocked):
    # Fresh players, so the matches other tests saved do not count here.
    ana = unlocked.post('/api/players', json={'displayName': 'Stats Ana'}).json()
    beto = unlocked.post('/api/players', json={'displayName': 'Stats Beto'}).json()
    rows = fixture('four-player-finished', 'stats-4p')
    rows['matchPlayers'][0]['playerId'] = ana['id']
    rows['matchPlayers'][1]['playerId'] = beto['id']
    assert put(unlocked, rows).status_code == 200
    # A test match never counts.
    hidden = fixture('four-player-finished', 'stats-test')
    hidden['match']['isTest'] = True
    hidden['matchPlayers'] = copy.deepcopy(rows['matchPlayers'])
    assert put(unlocked, hidden).status_code == 200

    b = unlocked.get(f"/api/players/{beto['slug']}/stats").json()
    assert b['players'] == 4 and b['matchesFour'] == 1 and b['matchesSanma'] == 0
    assert [m['matchId'] for m in b['matches']] == ['stats-4p']
    assert b['placementCounts'] == [1, 0, 0, 0]
    assert b['umaTotal'] == 20
    assert b['hands'] == 6
    # Two rons (one after riichi); the nagashi mangan pays but is not a won hand.
    assert (b['wins'], b['tsumoWins'], b['dealIns'], b['riichis']) == (2, 0, 0, 1)
    assert b['winMethods'] == {'riichi': 1, 'dama': 1, 'open': 0, 'unknown': 0}
    assert b['bestHand']['level'] == 'mangan' and b['bestHand']['matchId'] == 'stats-4p'
    # Yaku are counted off the hands' yaku rows. (The fixture's hand 5 lists a
    # riichi yaku its table never declared, so the two disagree on purpose here:
    # the win method reads the declaration, the frequency reads the yaku.)
    assert b['yakus'] == [{'yaku': 'dora', 'count': 2}, {'yaku': 'pinfu', 'count': 2},
                          {'yaku': 'riichi', 'count': 2}]

    # Both rons were mangan (base 2000); the 4000-point tsumo was someone else's.
    assert b['winValues'] == [{'level': 'mangan', 'basePoints': 2000, 'count': 2}]

    a = unlocked.get(f"/api/players/{ana['slug']}/stats").json()
    assert a['placementCounts'] == [0, 0, 0, 1]
    assert (a['wins'], a['dealIns']) == (0, 1)
    assert a['bestHand'] is None and a['yakus'] == [] and a['winValues'] == []

    # Sanma is kept apart: nothing of the four-player match shows there.
    s = unlocked.get(f"/api/players/{beto['slug']}/stats", params={'players': 3}).json()
    assert s['players'] == 3 and s['matches'] == [] and s['placementCounts'] == [0, 0, 0]
    assert s['matchesFour'] == 1


def test_a_profile_needs_a_real_player(unlocked, client):
    assert unlocked.get('/api/players/nobody-at-all/stats').status_code == 404
    assert unlocked.get('/api/players/nobody-at-all/stats', params={'players': 5}).status_code == 422


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
