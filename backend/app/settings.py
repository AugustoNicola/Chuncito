"""
Configuration, from the environment and the repo-root `.env`.

Which database is chosen by **target**, not by which variables happen to be set,
because the local `.env` holds both branches and a wrong default would point a
test run at the real matches. The default is `dev`; the real data is only
reachable by saying so (`CHUNCITO_TARGET=main`), which is what production sets.

| target | app (many short requests) | migrations, dumps (a whole session) |
|---|---|---|
| dev    | `DEV_DATABASE_URL_POOLED`  | `DEV_DATABASE_URL`  |
| main   | `DATABASE_URL_POOLED`      | `DATABASE_URL`      |

The pooled URL goes through Neon's PgBouncer in transaction mode; the direct
one is a plain Postgres session, which Alembic and `pg_dump` need.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / '.env', env_file_encoding='utf-8', extra='ignore',
    )

    chuncito_target: Literal['dev', 'main'] = 'dev'

    database_url: str | None = None
    database_url_pooled: str | None = None
    dev_database_url: str | None = None
    dev_database_url_pooled: str | None = None

    # The shared PIN. Unset means the API is closed, not open: a deploy that
    # forgot it must not serve the group's history to anyone who finds the URL.
    chuncito_pin: str | None = None
    # Signs the session cookie. Unset locally is fine -- a random one is made
    # per process, so sessions just do not survive a restart.
    chuncito_secret: str | None = None
    # Production is HTTPS; the LAN dev server is not, and a Secure cookie would
    # never be sent back over it.
    chuncito_secure_cookies: bool = False

    def _pick(self, direct: bool) -> str:
        if self.chuncito_target == 'main':
            url = self.database_url if direct else self.database_url_pooled
            name = 'DATABASE_URL' if direct else 'DATABASE_URL_POOLED'
        else:
            url = self.dev_database_url if direct else self.dev_database_url_pooled
            name = 'DEV_DATABASE_URL' if direct else 'DEV_DATABASE_URL_POOLED'
        if not url:
            raise RuntimeError(f'{name} is not set (target: {self.chuncito_target})')
        return url

    @property
    def app_url(self) -> str:
        return self._pick(direct=False)

    @property
    def direct_url(self) -> str:
        return self._pick(direct=True)


def sqlalchemy_url(url: str) -> str:
    """Neon hands out `postgresql://`; SQLAlchemy needs to be told the driver."""
    for prefix in ('postgresql://', 'postgres://'):
        if url.startswith(prefix):
            return 'postgresql+psycopg://' + url[len(prefix):]
    return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
