"""
Test harness: a throwaway schema on the **dev** branch, built by the real
migration and dropped at the end.

The tests talk to real Postgres (Neon) rather than to SQLite or a mock, because
what they check is Postgres behaviour -- generated columns, check constraints,
arrays, cascades, `FOR UPDATE`. They refuse to run against `main`.

They use the direct connection, since a per-connection `search_path` does not
survive PgBouncer's transaction pooling; the app's pooled path is exercised by
`/api/health` in `test_api.py` instead.
"""
import os
import secrets

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import auth
from app import main as app_main
from app.db import make_engine
from app.settings import REPO_ROOT, get_settings

PIN = '4321'
BACKEND = REPO_ROOT / 'backend'


@pytest.fixture(scope='session')
def settings():
    os.environ['CHUNCITO_PIN'] = PIN
    get_settings.cache_clear()
    s = get_settings()
    if s.chuncito_target != 'dev':
        pytest.exit('refusing to run the tests against the main branch', returncode=2)
    return s


def alembic_config(connection) -> Config:
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    config.attributes['connection'] = connection
    return config


@pytest.fixture(scope='session')
def schema(settings):
    name = f'test_{secrets.token_hex(4)}'
    admin = make_engine(settings.direct_url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA {name}'))
    try:
        yield name
    finally:
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA {name} CASCADE'))
        admin.dispose()


@pytest.fixture(scope='session')
def engine(settings, schema):
    eng = make_engine(settings.direct_url,
                      connect_args={'options': f'-c search_path={schema}'})
    with eng.begin() as conn:
        command.upgrade(alembic_config(conn), 'head')
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine, monkeypatch):
    monkeypatch.setattr(app_main, 'get_engine', lambda: engine)
    auth._failures.clear()
    with TestClient(app_main.app) as c:
        yield c


@pytest.fixture
def unlocked(client):
    assert client.post('/api/session', json={'pin': PIN}).status_code == 204
    return client
