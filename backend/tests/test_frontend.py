"""
Serving the built frontend. No database: these only need a `dist` directory.
"""
import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.settings import get_settings


@pytest.fixture
def site(tmp_path, monkeypatch):
    (tmp_path / 'assets').mkdir()
    (tmp_path / 'index.html').write_text('<!doctype html><div id="root"></div>')
    (tmp_path / 'assets' / 'index-abc123.js').write_text('console.log(1)')
    (tmp_path / 'tiles').mkdir()
    (tmp_path / 'tiles' / 'm5.svg').write_text('<svg/>')
    (tmp_path.parent / 'secret.txt').write_text('outside')
    monkeypatch.setattr(get_settings(), 'chuncito_frontend_dist', tmp_path)
    return TestClient(app_main.app)


@pytest.mark.parametrize('path', ['/', '/players', '/matches/some-id', '/players/jose-luis'])
def test_a_route_gets_the_app(site, path):
    r = site.get(path)
    assert r.status_code == 200
    assert 'id="root"' in r.text
    assert r.headers['cache-control'] == 'no-cache'


def test_files_are_served_as_themselves(site):
    r = site.get('/tiles/m5.svg')
    assert r.status_code == 200 and r.text == '<svg/>'
    assert r.headers['cache-control'] == 'no-cache'


def test_fingerprinted_assets_are_cached_for_good(site):
    r = site.get('/assets/index-abc123.js')
    assert r.status_code == 200
    assert 'immutable' in r.headers['cache-control']


@pytest.mark.parametrize('path', ['/assets/index-old.js', '/api/nope', '/api'])
def test_missing_files_and_api_paths_are_not_the_app(site, path):
    assert site.get(path).status_code == 404


def test_nothing_outside_dist_is_reachable(site):
    r = site.get('/..%2Fsecret.txt')
    assert 'outside' not in r.text


def test_robots_still_wins(site):
    assert site.get('/robots.txt').text.startswith('User-agent: *')
