"""
Behind Heroku's router. No database: the PIN gate and the redirect never reach it.

Heroku sets `DYNO` on every dyno, which is what `behind_router` reads; here it
is patched in. The router appends the caller's address to `X-Forwarded-For`
and names the scheme they used in `X-Forwarded-Proto`.
"""
import pytest
from fastapi.testclient import TestClient

from app import auth
from app import main as app_main
from app.settings import get_settings

PIN = '135790'


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(get_settings(), 'chuncito_pin', PIN)
    auth._failures.clear()
    yield TestClient(app_main.app, follow_redirects=False)
    auth._failures.clear()


@pytest.fixture
def on_heroku(monkeypatch):
    monkeypatch.setattr(get_settings(), 'dyno', 'web.1')


def guess(api, pin, forwarded):
    return api.post('/api/session', json={'pin': pin}, headers={
        'X-Forwarded-For': forwarded, 'X-Forwarded-Proto': 'https',
    }).status_code


def test_plain_http_is_sent_to_https(api, on_heroku):
    r = api.put('/api/matches/m1?x=1', headers={'X-Forwarded-Proto': 'http',
                                                'Host': 'chuncito.herokuapp.com'})
    assert r.status_code == 308
    assert r.headers['location'] == 'https://chuncito.herokuapp.com/api/matches/m1?x=1'


def test_https_is_served(api, on_heroku):
    r = api.get('/robots.txt', headers={'X-Forwarded-Proto': 'https'})
    assert r.status_code == 200


def test_locally_the_forwarded_headers_mean_nothing(api):
    assert api.get('/robots.txt', headers={'X-Forwarded-Proto': 'http'}).status_code == 200
    for n in range(auth.MAX_FAILURES):
        assert guess(api, 'nope', f'10.0.0.{n}') == 401
    # Every try came from the test client itself, whatever the header claimed.
    assert guess(api, PIN, '10.0.0.99') == 429


def test_guesses_are_counted_against_the_address_the_router_saw(api, on_heroku):
    # The client writes whatever it likes at the front; the router adds the truth.
    for n in range(auth.MAX_FAILURES):
        assert guess(api, 'nope', f'10.0.0.{n}, 203.0.113.7') == 401
    assert guess(api, PIN, '10.0.0.99, 203.0.113.7') == 429
    # Somebody else at the same time is not locked out with the guesser.
    assert guess(api, PIN, '198.51.100.4') == 204
